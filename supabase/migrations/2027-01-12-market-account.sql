-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-12-market-account.sql — THE MARKET, RE-KEYED ON THE ACCOUNT.
--   Listings owned by the account (the listing hero kept as provenance), sold from a
--   hero's bag or from Storage, returned to Storage, priced between the shop's bid and
--   a ceiling, a 1% listing fee and a 4% cut burned, every cap per ACCOUNT under one
--   account lock, anonymous to every client, behind a switch that ships OFF.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-market-account, backend-architect, 2026-10-24;
-- market build lane 1 of 5). Game CLOSED: applies on its passing §9 (tools/apply-
-- migration.mjs, one file, never inside begin/commit, never 00:00-00:10 UTC). MONEY
-- SURFACE (gold between accounts, items between accounts): the market stays OFF
-- (hr_market_config.enabled = false) until the ONE Security review (lane 3) signs off
-- this file and the edge verbs of lane 2. Design: docs/planning/PRIORITY_BOARD.md
-- "Marketplace design (2026-10-24)"; threat model: "Security: marketplace threat model
-- (2026-10-24)" (GO-WITH-CHANGES; every lane-1 change is listed below by its number).
-- Contract: docs/design/ARCHITECTURE_CONTRACTS.md §22.
--
-- ── WHAT IT REPLACES ─────────────────────────────────────────────────────────
--   2026-08-17-market-v2.sql keyed the market on (user, slot): one hero's bag, one
--   hero's caps, the seller's name on the listing, a sale paid into the seller hero.
--   Gold is the ACCOUNT's since 2026-12-15-account-gold.sql and Storage is the
--   account's since 2026-11-27-account-depot.sql, so the market moves account goods.
--   The four v2 verbs are re-derived here on today's patterns; what is CARRIED from
--   v2 verbatim in effect: the identity seam, the idempotency block (replay pre-check
--   unlocked, claim under the lock, release on version_conflict), escrow as a DEBIT
--   of the source under its lock, the listing row as the arbiter (delete … returning),
--   the price read from the LOCKED row, numeric arithmetic + the max_gross ceiling,
--   the cut rounded up, gold_in = 0 on every market row (a transfer mints nothing).
--
-- ── THE CONTRACT (engine-only; the edge of lane 2 is the only caller) ────────
--   hr_market_list(p_user, p_slot, p_version, p_intent_id, p_source 'bag'|'storage',
--                  p_item_id, p_qty, p_ask_each)                         -> envelope + listed
--   hr_market_cancel(p_user, p_slot, p_intent_id, p_listing_id)          -> envelope + cancelled
--   hr_market_buy(p_user, p_slot, p_version, p_intent_id, p_listing_id, p_qty,
--                 p_max_each, p_deliver 'storage'|'bag')                 -> envelope + bought
--   hr_market_browse(p_user, p_slot, p_items text[], p_after text, p_limit) -> per-item rows
--   hr_market_item(p_user, p_slot, p_item_id)       -> asks by price, 30-day line, last 10
--   hr_market_mine(p_user, p_slot)                   -> own listings, 30-day history, today
--   hr_market_expire(p_limit, p_only)                cron only (hr-market-expire, */5)
--   p_version is CHECKED only on the bag verbs (list source=bag, buy deliver=bag); the
--   Storage verbs touch no bag, so a hero's settle racing them is not a conflict.
--   Every write answers hr_state_of(p_user, p_slot) || its receipt. No receipt, read or
--   ledger row carries an account id, a hero of another account or a name; the only
--   uuids are listing ids. The counterparty lives in public.market_sales, which no
--   client role can read (threat model #1).
--
-- ── ERROR TAXONOMY (refusal codes; the designer's words are on the board) ────
--   shape:      forbidden_impersonation, not_signed_in, missing_intent_id, bad_slot,
--               bad_source, bad_deliver, bad_qty, bad_price, listing_too_large,
--               trade_too_large, bad_request, unknown_item
--   gates:      market_closed (the switch), closed (closed mode), settle_first /
--               party_hunt_running (bag verbs only), rate_limited (bucket 'market' 60/min,
--               'market_read' 120/min, per account)
--   rules:      not_tradeable {why: untradeable|no_value|no_shop_price|start_kit|premium},
--               item_locked, price_below_shop {floor}, price_above_cap {ceiling},
--               price_above_max {ask_each}, own_listing, not_yours
--   caps:       too_many_listings {limit}, list_daily_cap {used, limit},
--               market_spend_daily_cap, market_proceeds_daily_cap, storage_no_room {cap,
--               used}, storage_full {cap}, bag_full {cap}
--   state:      insufficient_item {have, need}, insufficient_gold {have, need}, gone,
--               expired, not_enough {available}, no_character, version_conflict
--   idempotency: intent_mismatch, intent_in_flight, replayed:true on a stored answer
--
-- ── THE LOCK ORDER (threat model #3; asserted on every body in §9) ───────────
--   (0) the market rate counter row (hr_rate_ok, a leaf: no holder waits on a market lock)
--   (1) the acting hero: hr_hunt_lock(user, slot) = hr_apply's advisory key + its
--       player_state row (+ its open hunt row)
--   (2) the account's Storage lock: advisory hashtextextended('hr:depot:'||user, 0),
--       hr_bank_move's key (list: the seller's; buy into Storage: the buyer's; cancel)
--   (3) the listing row FOR UPDATE (buy; cancel/expiry lock it through the delete)
--   (4) market_item_daily's (item, day) row (buy)
--   (5) the purses, user order, LAST: hr_purse_lock(least), hr_purse_lock(greatest)
--   After (5) only rows this transaction already holds are written (the purse, the
--   locked listing, the acting hero) plus appends (ledger, market_sales).
--   The SELLER's hero is never locked: proceeds go to the account purse (no seller-hero
--   lock, so a buy can never wait on a seller's hunt settle). The expiry sweep TRIES the
--   Storage lock and the listing row (skip locked) and never waits.
--   Every per-account cap is read under its account lock AFTER taking it (threat model
--   #2): open listings + new listings today + Storage room under (2); gold spent and
--   received today under (5).
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--   Every write carries a client key in player_intents (hr_apply's table and rules):
--   the intent NAME binds everything that changes what the write does —
--     market_list:<source>:<item>:<qty>:<ask>    market_cancel:<listing>
--     market_buy:<listing>:<qty>:<max_each>:<deliver>
--   a different request on the same key is intent_mismatch; a decided key replays its
--   answer with the CURRENT envelope; version_conflict releases the key. A second apply
--   of this FILE is byte-identical (§0 accepts each body's live image or this file's).
--
-- ── EXPLOIT SURFACE DELTA (for Security lane 3) ─────────────────────────────
--   Engine: c_engine_allow gains six entries (link 21 of HR_GRANT_HYGIENE_CHAIN); the
--   three v2 signatures are dropped (their stale TEXT stays, admitting nothing). Client:
--   NO new client RPC; every client SELECT on market_listings, market_sales,
--   market_buy_offers, market_price_history and hr_market_config is REVOKED and their
--   policies dropped (anon read the seller's account id and name until now); the two
--   offer/view relations are dropped. hr_bank_move (authenticated) is restated with ONE
--   change: Storage room counts listed kinds. Faucets: the ONE listable rule
--   (hr_market_items) refuses the start kit, the premium reward, value-0 items, items
--   without a shop bid and untradeable items — read by list, buy and the expiry sweep.
--   Bounded residual: a compromised hr-accrue can name any user (as on every engine
--   verb), limited to conserved transfers of listable goods inside the per-account caps
--   (2M gold out / 2M in per day, 50 open, 200 new a day), each journalled, the
--   counterparty recorded in market_sales.
--   NOT in this lane (threat model): #7 (party forfeit griefing; backend hunt-settle
--   lane, before the switch), #8 (same-network flag; lane 2), #9 (market eligibility;
--   designer + Security), #10 (chip steering; lane 4 + designer).
--
-- ── COST AT 100x (today: 2 accounts, 0 listings) ────────────────────────────
--   market_listings <= 50 per account (~200 accounts x 50 = 10k rows, ~2 MB).
--   market_sales: one row per sale, pruned at 180 days (hr-market-sales-prune).
--   market_item_daily: one row per (item, UTC day) traded: <= 508 items x 30-ish days
--   read, ~15k rows/month at full coverage (~1.5 MB); nothing prunes it (it is the
--   price history; a year is ~185k rows, ~20 MB) — prune with market_sales if it grows.
--   player_ledger: list 1 row, buy 2 rows, cancel/expiry 1 row (aggregates, never
--   per-tick). Reads: rate-gated, <= 50 items or 50 listings per call, index-bounded.
--
-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
--   The market is OFF and empty on production; reversing means: re-apply
--   2026-08-17-market-v2.sql (its §0b wipe gate) and 2026-12-15-account-gold.sql's
--   hr_market_buy, 2026-11-28-storage-chests.sql's hr_bank_move / hr_depot_view,
--   2026-10-11-name-moderation.sql's hr_name_restamp, 2026-10-25-character-sheet.sql's
--   detector; drop market_item_daily, hr_market_items and the new helpers. Listings
--   are refused across the re-key by §1 (it will not carry live escrow over).
-- ORDER: after 2027-01-01-server-perf.sql (APPLIED), 2027-01-02..05 (the spell
-- release) and 2027-01-10 (house-from-storage). Touches no object those touch EXCEPT
-- possibly hr_bank_move / hr_depot_view (house-from-storage): §0 refuses if either
-- moved, re-pin then. No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): live-hash-drift --live --write (hr_bank_move,
-- hr_assert_grant_hygiene, the dropped v2 market bodies); restore-census live_value of
-- hr_market_config re-measured (§2 retunes it once); flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.account_bank') is null or to_regclass('public.account_wallet') is null
     or to_regclass('public.player_ledger') is null or to_regclass('public.player_item_rules') is null
     or to_regclass('public.hr_depot_config') is null or to_regclass('public.hunt_sessions') is null then
    raise exception 'PRECONDITION: account_bank / account_wallet / player_ledger / player_item_rules / hr_depot_config / hunt_sessions missing'; end if;
  if to_regclass('public.hr_items') is null or to_regclass('public.hr_hunt_vendor_value') is null
     or to_regclass('public.hr_start_inventory') is null or to_regclass('public.hr_start_equipment') is null
     or to_regclass('public.hr_premium_login_reward') is null then
    raise exception 'PRECONDITION: the generated catalogues the listable rule reads are missing (hr_items, hr_hunt_vendor_value, hr_start_inventory, hr_start_equipment, hr_premium_login_reward)'; end if;
  if to_regclass('public.market_sales') is null or to_regclass('public.hr_market_config') is null then
    raise exception 'PRECONDITION: apply 2026-08-17-market-v2.sql first'; end if;
  if to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null or to_regprocedure('public.hr_purse_lock(uuid)') is null
     or to_regprocedure('public.hr_purse_of(uuid)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_settle_first_of(uuid,integer)') is null or to_regprocedure('public.hr_admitted(uuid)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regprocedure('public.hr_depot_cap(uuid)') is null or to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'PRECONDITION: a primitive this file is built from is missing (purse, hero lock, settle-first, closed mode, rate, rejections, envelope, day start, depot cap, cron)'; end if;
  -- Each restated or dropped body is its live image (pre: measured on the replay = production,
  -- tests/live-hash-drift.baseline.json agree:true, 2026-10-24) or this file's own (post; a
  -- dropped one is then absent). Anything else means another file moved it: re-pin first.
  for r in select * from (values
    ('public.hr_bank_move(integer,text,bigint,text,uuid)', 'c2bc3008188b2cd0a83493b53f25edb7', '7cf38556fc07b62d6af83d441b206132', '2026-11-28-storage-chests.sql'),
    ('public.hr_depot_view(uuid,integer)', 'ad61b3f5fccdefc399f6755787729c71', '3c98663be8aab51dd028808ec6c6357a', '2026-11-28-storage-chests.sql'),
    ('public.hr_name_restamp()', 'a60fbf68e0bc200d17466d1256c645a0', 'a4ee9fddc7eacdaca04d6775571f6adb', '2026-10-11-name-moderation.sql'),
    ('public.hr_market_listing_immutable()', 'a77ebd18fd25a657eb214ca393e84fc4', 'c5423989985a91f5be4c3b919efc1d45', '2026-08-17-market-v2.sql'),
    ('public.hr_assert_grant_hygiene(boolean)', 'bf7dca9a8d2e3f4e940d7a66593d862e', '49cb131791800e0fbf9902fb524ef714', '2026-10-25-character-sheet.sql'),
    ('public.hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)', '8b871faf2f59e2e79afa227c098324ba', 'absent', '2026-08-17-market-v2.sql'),
    ('public.hr_market_cancel(uuid,integer,bigint,uuid,uuid)', '8914297fb2beb1ef872f879ba39ff3ce', 'absent', '2026-09-28-settle-before-mutate.sql'),
    ('public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)', '97e38b8e3c7185487d0447111b9e3c64', 'absent', '2026-12-15-account-gold.sql'),
    ('public.hr_market_expire(integer)', '6e57f9629b44e302c8fb2d80529a9f39', 'absent', '2026-08-17-market-v2.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null and r.post = 'absent' then continue; end if;
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE RELATIONS: re-key the listings, cut the offers and the public price view ──
-- The old per-hero listings table is replaced only while it is EMPTY (production 2026-10-23:
-- 0 listings, 0 offers, the market never reachable). Live escrow is never carried across a
-- re-key and never dropped: a non-empty old table refuses the whole file.
do $mig$
declare v_n bigint;
begin
  if to_regclass('public.market_buy_offers') is not null then
    execute 'select count(*) from public.market_buy_offers' into v_n;
    if v_n > 0 then
      raise exception 'market_buy_offers holds % offer(s) with escrowed gold: refund them before this file cuts the table (threat model #22)', v_n; end if;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'market_listings' and column_name = 'seller_user_id') then
    execute 'select count(*) from public.market_listings' into v_n;
    if v_n > 0 then
      raise exception 'market_listings holds % listing(s) in the per-hero shape: cancel them (each returns to its hero''s bag) before the re-key', v_n; end if;
    drop table public.market_listings cascade;
  end if;
end $mig$;
drop view if exists public.market_price_history;
drop table if exists public.market_buy_offers cascade;
drop function if exists public.hr_market_offer_cap();
drop function if exists public.hr_market_offer_stamp();
drop function if exists public.hr_market_offer_immutable();

-- THE ESCROW. A row IS the goods: the units left the source (the hero's bag or Storage) to
-- create it, and they come back only to Storage (cancel, expiry, the item made unlistable).
create table if not exists public.market_listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,  -- the ACCOUNT that owns it
  slot        int  not null check (slot between 0 and 5),                -- the hero that listed it (provenance only)
  source      text not null check (source in ('bag', 'storage')),
  item_id     text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  qty         bigint not null check (qty > 0),
  qty_listed  bigint not null check (qty_listed >= qty),
  ask_each    bigint not null check (ask_each > 0 and ask_each <= 1000000000),
  fee         bigint not null check (fee >= 1),
  posted_at   timestamptz not null default now(),
  expires_at  timestamptz not null      -- set by the server (now() + listing_ttl_h); only ever moves earlier
);
create index if not exists market_listings_item_idx    on public.market_listings (item_id, ask_each);
create index if not exists market_listings_account_idx on public.market_listings (user_id, item_id);
create index if not exists market_listings_expiry_idx  on public.market_listings (expires_at);
comment on table public.market_listings is
  '2027-01-12 (market-account): the escrow. Account-owned (user_id), the listing hero kept as provenance (slot). Written ONLY by '
  'hr_market_list / hr_market_buy / hr_market_cancel / hr_market_expire; no client role can read it (threat model #1).';

-- THE LISTING IS IMMUTABLE BUT FOR ITS REMAINING COUNT (which only falls) and its expiry
-- (which only moves earlier): the routing reads, the price-free buy intent and the Storage
-- room all trust the rest. Restated for the new columns (the trigger guards whoever writes).
create or replace function public.hr_market_listing_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id
     or new.slot is distinct from old.slot or new.source is distinct from old.source
     or new.item_id is distinct from old.item_id or new.ask_each is distinct from old.ask_each
     or new.qty_listed is distinct from old.qty_listed or new.fee is distinct from old.fee
     or new.posted_at is distinct from old.posted_at then
    raise exception 'market_listings: only qty (down) and expires_at (earlier) may change after insert'
      using errcode = '42501';
  end if;
  if new.qty > old.qty then
    raise exception 'market_listings.qty only falls (a sale consumes it)' using errcode = '42501';
  end if;
  if new.expires_at > old.expires_at then
    raise exception 'market_listings.expires_at only moves earlier' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_immutable() from public, anon, authenticated, service_role, hr_engine;
drop trigger if exists trg_market_listing_immutable on public.market_listings;
create trigger trg_market_listing_immutable
  before update on public.market_listings
  for each row execute function public.hr_market_listing_immutable();

-- THE PRICE HISTORY, kept in the write transaction (threat model #11): one row per item per
-- UTC day it traded. Reads never aggregate market_sales per request.
create table if not exists public.market_item_daily (
  item_id   text   not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  day       date   not null,
  trades    int    not null check (trades >= 1),
  qty       bigint not null check (qty >= 1),
  gross     bigint not null check (gross >= 1),
  low_each  bigint not null check (low_each >= 1),
  high_each bigint not null check (high_each >= low_each),
  primary key (item_id, day)
);
comment on table public.market_item_daily is
  '2027-01-12 (market-account): per-item, per-UTC-day sale aggregates (trades, units, gross, low, high), written ONLY by '
  'hr_market_buy in the sale''s own transaction; the price line and the 7-day typical price read it. No client role can read it.';

-- The receipt table keeps its shape; it gains the index the "received so far" read uses.
create index if not exists market_sales_listing_idx on public.market_sales (listing_id);

-- NO CLIENT READS ANYWHERE IN THE MARKET (threat model #1, #11). RLS on, no policy, no grant;
-- the engine reaches them only through the SECURITY DEFINER verbs below.
alter table public.market_listings   enable row level security;
alter table public.market_sales      enable row level security;
alter table public.market_item_daily enable row level security;
alter table public.hr_market_config  enable row level security;
drop policy if exists "listings readable"      on public.market_listings;
drop policy if exists "hr_closed_anon"         on public.market_listings;
drop policy if exists "own sales readable"     on public.market_sales;
drop policy if exists "sales readable"         on public.market_sales;
drop policy if exists "market config readable" on public.hr_market_config;
revoke all on public.market_listings   from public, anon, authenticated, service_role, hr_engine;
revoke all on public.market_sales      from public, anon, authenticated, service_role, hr_engine;
revoke all on public.market_item_daily from public, anon, authenticated, service_role, hr_engine;
revoke all on public.hr_market_config  from public, anon, authenticated, service_role, hr_engine;
revoke all on sequence public.market_sales_id_seq from public, anon, authenticated, service_role, hr_engine;

-- ── §2 THE RULES: hr_market_config (every number PROVISIONAL, the designer's §3) ─────
-- Added ONCE: the switch (default OFF) and the account numbers. The v2 values are retuned to
-- the design in the same first apply only, so a second apply never reverts an operator.
do $mig$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_market_config' and column_name = 'enabled') then
    alter table public.hr_market_config
      add column enabled              boolean not null default false,
      add column list_fee_bp          int     not null default 100     check (list_fee_bp between 0 and 2000),
      add column list_fee_min         bigint  not null default 1       check (list_fee_min >= 1),
      add column ceiling_mult         int     not null default 100     check (ceiling_mult between 1 and 10000),
      add column ceiling_min          bigint  not null default 1000    check (ceiling_min between 1 and 1000000000),
      add column max_lists_per_day    int     not null default 200     check (max_lists_per_day between 1 and 10000),
      add column max_spend_per_day    bigint  not null default 2000000 check (max_spend_per_day between 1 and 1000000000000),
      add column max_proceeds_per_day bigint  not null default 2000000 check (max_proceeds_per_day between 1 and 1000000000000);
    -- the Weighhouse's 4% cut (house_tax_bp 150 -> 400), 7-day listings, 50 open per ACCOUNT
    update public.hr_market_config set house_tax_bp = 400, listing_ttl_h = 168, max_listings = 50 where only_row;
  end if;
end $mig$;

-- THE ONE LISTABLE RULE (threat model #4), over the GENERATED catalogues only — no item id
-- is typed here, so a data edit + a regenerate moves it. Listable = tradeable AND worth
-- something AND the shop bids for it (the floor) AND not in the start kit (bag or worn) AND
-- not the premium login reward. Gifts and Crowns-bought goods have no catalogue today: the
-- authoring rule makes them untradeable / worth nothing, which the first two clauses
-- refuse; a gift or Crowns catalogue joins this view the day it is generated. Read by
-- hr_market_list, hr_market_buy, hr_market_expire and every read. Floor = the shop's bid for
-- one; ceiling = max(ceiling_min, ceiling_mult x book), never above the 1e9 ask bound.
create or replace view public.hr_market_items with (security_invoker = true) as
  select i.item_id,
         (i.tradeable and i.value > 0 and v.item_id is not null
          and not exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
          and not exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id)
          and not exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id)) as listable,
         case when not i.tradeable then 'untradeable'
              when i.value <= 0 then 'no_value'
              when v.item_id is null then 'no_shop_price'
              when exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
                or exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id) then 'start_kit'
              when exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id) then 'premium'
         end as why,
         v.unit as floor_each,
         least(1000000000::bigint, greatest(c.ceiling_min, i.value * c.ceiling_mult))::bigint as ceiling_each,
         i.value as book
    from public.hr_items i
    left join public.hr_hunt_vendor_value v on v.item_id = i.item_id
   cross join public.hr_market_config c;
revoke all on public.hr_market_items from public, anon, authenticated, service_role, hr_engine;

-- THE RULES A CLIENT RENDERS (fee, cut, length, caps), served by the reads, never a table read.
create or replace function public.hr_market_rules()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('enabled', c.enabled, 'fee_bp', c.list_fee_bp, 'fee_min', c.list_fee_min,
           'cut_bp', c.house_tax_bp, 'ttl_h', c.listing_ttl_h, 'max_listings', c.max_listings,
           'max_lists_per_day', c.max_lists_per_day, 'max_spend_per_day', c.max_spend_per_day,
           'max_proceeds_per_day', c.max_proceeds_per_day, 'ceiling_mult', c.ceiling_mult, 'ceiling_min', c.ceiling_min)
    from public.hr_market_config c
$$;
revoke execute on function public.hr_market_rules() from public, anon, authenticated, service_role, hr_engine;

-- ── §3 STORAGE ROOM: the kinds in Storage AND the kinds the account has listed ──────
-- A listing's units return to Storage, so the kind it would need is kept free while it is
-- listed: room used = |kinds in Storage ∪ kinds listed|. Every writer that can add a NEW kind
-- to Storage or to the account's listings asks hr_storage_room_fits under the Storage lock
-- (hr_bank_move deposit, hr_market_list, hr_market_buy into Storage); returns (cancel,
-- expiry) are never refused because their kind was counted while it was listed.
create or replace function public.hr_storage_room_cap(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_catalog as $$
  -- the account's capacity (base + storage chests), never above the 1,000-stack fuse
  select least(public.hr_depot_cap(p_user), 1000)
$$;
create or replace function public.hr_storage_room_used(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_catalog as $$
  select count(*)::int from (
    select b.item_id from public.account_bank b where b.user_id = p_user
    union
    select l.item_id from public.market_listings l where l.user_id = p_user) k
$$;
create or replace function public.hr_storage_room_fits(p_user uuid, p_item text)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from public.account_bank b where b.user_id = p_user and b.item_id = p_item)
      or exists (select 1 from public.market_listings l where l.user_id = p_user and l.item_id = p_item)
      or public.hr_storage_room_used(p_user) < public.hr_storage_room_cap(p_user)
$$;
revoke execute on function public.hr_storage_room_cap(uuid) from public, anon, authenticated, service_role, hr_engine;
revoke execute on function public.hr_storage_room_used(uuid) from public, anon, authenticated, service_role, hr_engine;
revoke execute on function public.hr_storage_room_fits(uuid, text) from public, anon, authenticated, service_role, hr_engine;

-- hr_bank_move RESTATED WHOLE from 2026-11-28-storage-chests.sql's image (§0 pin c2bc3008):
-- ONE change, the deposit's capacity block asks the Storage ROOM (kinds in Storage + kinds
-- listed). Everything else is that body, line for line.
create or replace function public.hr_bank_move(p_slot integer, p_item text, p_qty bigint, p_dir text, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
-- hr_bank_move restated WHOLE by 2026-11-27-account-depot.sql (chain depth 0) from the
-- 2026-09-28-settle-before-mutate.sql image: the depot is public.account_bank, ONE per
-- account, under the ACCOUNT DEPOT LOCK taken after the character lock. Restated again
-- by 2026-11-28-storage-chests.sql: a deposit that opens a new stack fits the account's
-- capacity (hr_depot_cap: the base + its storage chests), never above the fuse. Restated
-- by 2027-01-12-market-account.sql: the room a new kind needs counts the kinds the
-- account has LISTED on the market too (their units come back here).
declare
  c_max_move        constant bigint := 1000000;  -- per-call blast radius (matches hr_apply c_max_item_delta)
  v_cap    int;
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_have   bigint;
  v_stacks int;
  v_cached jsonb;
  v_new_version bigint;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('bank_move', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;

  -- IDEMPOTENCY: a replayed idem returns the first call's exact result, no re-move.
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay is the one
  -- copy of the rule). A NULL answer means "no cached decision".
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'bank_' || p_dir) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('bank_move', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('bank_move') then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- INPUT VALIDATION — the client value is only a request; re-checked below.
  if p_dir is null or p_dir not in ('deposit', 'withdraw') then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bad_direction'));
  end if;
  if p_qty is null or p_qty < 1 then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty'));
  end if;
  if p_qty > c_max_move then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'qty_clamp', 'limit', c_max_move));
  end if;
  -- Unknown ids refused against the SERVER catalogue (hr_items).
  if not exists (select 1 from public.hr_items where item_id = p_item) then
    return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', p_item));
  end if;

  -- THE CHARACTER LOCK (its bag and version) ...
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- ... THEN THE ACCOUNT DEPOT LOCK. Every character of the account moves through
  -- this one key, so the stack count and the withdraw's check-then-write below are
  -- exact under concurrency. Order: character -> depot -> account_bank rows; nothing
  -- takes a character lock after it (2026-11-27-account-depot.sql header).
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  if p_dir = 'deposit' then
    -- ── BAG → DEPOT ─────────────────────────────────────────────────────────
    -- DEBIT the bag (this select-for-update IS the ownership check).
    select qty into v_have from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty));
    end if;
    -- THE DEPOT'S ROOM: only when this deposit adds a NEW kind to the account's room
    -- (kinds in Storage + kinds it has listed on the market, which come back here).
    -- The account's own capacity (base + storage chests), never above the fuse.
    if not public.hr_storage_room_fits(v_uid, p_item) then
      v_cap := public.hr_storage_room_cap(v_uid);
      v_stacks := public.hr_storage_room_used(v_uid);
      return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bank_full', 'cap', v_cap,
        'listed', v_stacks - (select count(*)::int from public.account_bank where user_id = v_uid)));
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    else
      update public.player_inventory set qty = qty - p_qty
        where user_id = v_uid and slot = p_slot and item_id = p_item;
    end if;
    insert into public.account_bank as b (user_id, item_id, qty, updated_at)
      values (v_uid, p_item, p_qty, now())
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
  else
    -- ── DEPOT → BAG ─────────────────────────────────────────────────────────
    -- DEBIT the depot (ownership check: the account's own row, locked).
    select qty into v_have from public.account_bank
      where user_id = v_uid and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_bank',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty));
    end if;
    -- BAG STACK FUSE: mirror hr_apply's bank_cap ceiling on player_inventory
    -- stacks (bank_cap is the BAG's stack cap, per character), only when this
    -- withdraw opens a NEW bag stack.
    if not exists (select 1 from public.player_inventory
                    where user_id = v_uid and slot = p_slot and item_id = p_item) then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = p_slot limit v_state.bank_cap + 1) s;
      if v_stacks >= v_state.bank_cap then
        return public.hr_note_rejection('bank_move', p_slot, jsonb_build_object('ok', false, 'error', 'bag_full', 'cap', v_state.bank_cap));
      end if;
    end if;
    if v_have = p_qty then
      delete from public.account_bank
        where user_id = v_uid and item_id = p_item;
    else
      update public.account_bank set qty = qty - p_qty, updated_at = now()
        where user_id = v_uid and item_id = p_item;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
  end if;

  -- VERSION BUMP of the ACTING character (the clock its client reconciles on). The
  -- account's other characters are not bumped: their clients re-read after a move.
  v_new_version := v_state.version + 1;
  update public.player_state set version = v_new_version, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  -- JOURNAL: one aggregate row per move (rule 6 — never per-tick). qty carries
  -- the BAG-side signed delta (deposit removes from bag = negative); the slot is
  -- the acting character's, meta.depot says the other side is the account's.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, p_slot, 'bank', 'bank_' || p_dir, p_item,
            case when p_dir = 'deposit' then -p_qty else p_qty end,
            jsonb_build_object('dir', p_dir, 'qty', p_qty, 'depot', 'account'));

  v_cached := jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty,
    'direction', p_dir, 'version', v_new_version);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'bank_' || p_dir, v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end
$function$;
revoke execute on function public.hr_bank_move(integer, text, bigint, text, uuid) from public;
revoke execute on function public.hr_bank_move(integer, text, bigint, text, uuid) from anon, service_role;
grant  execute on function public.hr_bank_move(integer, text, bigint, text, uuid) to authenticated;

-- hr_depot_view RESTATED WHOLE from 2026-11-28-storage-chests.sql's image (§0 pin ad61b3f5):
-- + 'reserved' (kinds the account has listed that are not in Storage: kept free for their
-- return) and 'room_used' (= used + reserved, the number a new kind is checked against).
create or replace function public.hr_depot_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  with ch as (
    select c.*, (a.chest_id is not null) as built
      from public.hr_storage_chests c
      left join public.account_storage_chests a on a.user_id = p_user and a.chest_id = c.chest_id),
  nx as (select * from ch where not built order by ord limit 1),
  t as (select public.hr_account_property_tier(p_user) as tier),
  rm as (select (select count(*) from public.account_bank where user_id = p_user) as used,
                public.hr_storage_room_used(p_user) as room_used)
  select jsonb_build_object(
    'used', (select used from rm),
    'reserved', (select room_used - used from rm),
    'room_used', (select room_used from rm),
    'cap', public.hr_depot_cap(p_user),
    'base', (select base_stacks from public.hr_depot_config where only_row),
    'tier', (select tier from t),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('chest', chest_id, 'name', name, 'stacks', stacks,
        'tier', req_property_tier, 'gold', gold, 'items', items, 'built', built) order by ord) from ch), '[]'::jsonb),
    'next', (select jsonb_build_object('chest', nx.chest_id, 'name', nx.name, 'stacks', nx.stacks, 'tier', nx.req_property_tier,
        'gold', nx.gold, 'items', nx.items,
        'can_build', nx.req_property_tier <= (select tier from t),
        'why', case when nx.req_property_tier > (select tier from t) then 'needs_property_tier' end)
      from nx))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_depot_view(uuid, int) from public, anon, authenticated, service_role;

-- hr_name_restamp RESTATED WHOLE from 2026-10-11-name-moderation.sql's image (§0 pin a60fbf68):
-- the market carries NO name any more (the listing's seller_name and the offer table are cut),
-- so a rename re-stamps the chat lines only. Without this the next rename would raise on the
-- dropped column.
create or replace function public.hr_name_restamp()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  update public.chat_messages
     set from_name = left(coalesce(nullif(btrim(coalesce(new.display_name, '')), ''), 'Adventurer'), 24)
   where from_id = new.id
     and from_name is distinct from
         left(coalesce(nullif(btrim(coalesce(new.display_name, '')), ''), 'Adventurer'), 24);
  return null;
end $$;
revoke execute on function public.hr_name_restamp() from public;
revoke execute on function public.hr_name_restamp() from anon, authenticated, service_role;

-- ── §4 THE WRITE VERBS ──────────────────────────────────────────────────────
-- The v2 per-hero signatures go first, so no engine overload with the old rules survives.
drop function if exists public.hr_market_list(uuid, int, bigint, uuid, text, bigint, bigint);
drop function if exists public.hr_market_cancel(uuid, int, bigint, uuid, uuid);
drop function if exists public.hr_market_buy(uuid, int, bigint, uuid, uuid, bigint);
drop function if exists public.hr_market_expire(int);

-- ── 4a hr_market_list: escrow out of the hero's bag or the account's Storage ──
create or replace function public.hr_market_list(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid,
  p_source text, p_item_id text, p_qty bigint, p_ask_each bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_rate constant int := 60;     -- the market's own write bucket, per account per minute
  v_uid  uuid;
  v_role text;
  v_slot int := coalesce(p_slot, 0);
  v_cfg  public.hr_market_config%rowtype;
  v_rule public.hr_market_items%rowtype;
  v_ver  bigint;
  v_have bigint;
  v_open int; v_today int;
  v_fee  bigint; v_purse bigint;
  v_id   uuid; v_exp timestamptz;
  v_prev jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out  jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  -- (0) THE IDENTITY SEAM. The engine acts for the user whose JWT it verified; anyone else
  --     is themselves (auth.uid()) and may not name another user.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_list', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if v_slot < 0 or v_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;

  -- (1) SHAPE, CATALOGUE AND PRICE, BEFORE ANY LOCK: facts about the request.
  select * into v_cfg from public.hr_market_config;
  if p_source is null or p_source not in ('bag', 'storage') then
    return jsonb_build_object('ok', false, 'error', 'bad_source'); end if;
  if p_qty is null or p_qty <= 0 or p_qty > v_cfg.max_qty then
    return jsonb_build_object('ok', false, 'error', 'bad_qty', 'detail', jsonb_build_object('max', v_cfg.max_qty)); end if;
  if p_ask_each is null or p_ask_each <= 0 or p_ask_each > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'bad_price'); end if;
  select * into v_rule from public.hr_market_items where item_id = p_item_id;
  if v_rule.item_id is null or not v_rule.listable then
    return jsonb_build_object('ok', false, 'error', 'not_tradeable',
             'detail', jsonb_build_object('item_id', p_item_id, 'why', coalesce(v_rule.why, 'unknown_item')));
  end if;
  if p_ask_each < v_rule.floor_each then
    return jsonb_build_object('ok', false, 'error', 'price_below_shop', 'detail', jsonb_build_object('floor', v_rule.floor_each)); end if;
  if p_ask_each > v_rule.ceiling_each then
    return jsonb_build_object('ok', false, 'error', 'price_above_cap', 'detail', jsonb_build_object('ceiling', v_rule.ceiling_each)); end if;
  if p_qty::numeric * p_ask_each::numeric > v_cfg.max_gross::numeric then
    return jsonb_build_object('ok', false, 'error', 'listing_too_large', 'detail', jsonb_build_object('max_gross', v_cfg.max_gross)); end if;
  -- THE LISTING FEE, burned: 1% of the whole ask, rounded UP, never under the minimum.
  v_fee := greatest(v_cfg.list_fee_min, ceil(p_qty::numeric * p_ask_each::numeric * v_cfg.list_fee_bp::numeric / 10000)::bigint);

  -- (2) THE GATES: the switch, closed mode, settle-first (the BAG verb only), the bucket.
  if not v_cfg.enabled then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;
  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_source = 'bag' then
    declare v_settle jsonb := public.hr_settle_first_of(v_uid, v_slot);
    begin
      if v_settle is not null then return v_settle; end if;
    end;
  end if;
  if not public.hr_rate_ok(v_uid, 'market', c_rate, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market') - c_rate) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_list', 'rate_limited',
        jsonb_build_object('limit', c_rate, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market') - c_rate));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- (3) THE REPLAY PRE-CHECK, unlocked: short-circuits only an already-decided key.
  v_intent := 'market_list:' || p_source || ':' || p_item_id || ':' || p_qty::text || ':' || p_ask_each::text;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent, 'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- (4) THE LOCKS, in the file's order: the hero, then the account's Storage lock.
  perform public.hr_hunt_lock(v_uid, v_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
  if v_ver is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  -- (5) THE CLAIM, under the locks.
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent, 'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  begin
    -- (a) THE VERSION, on the bag verb: a delta computed against an older bag is refused.
    if p_source = 'bag' and (p_version is null or p_version <> v_ver) then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_ver));
    end if;
    -- (b) THE PER-ACCOUNT CAPS, read under the Storage lock (every list of this account
    --     inserts under it), so four heroes listing at once see one count.
    select count(*) into v_open from (
      select 1 from public.market_listings where user_id = v_uid limit v_cfg.max_listings) s;
    if v_open >= v_cfg.max_listings then
      perform public.hr_reject('too_many_listings', jsonb_build_object('limit', v_cfg.max_listings));
    end if;
    select count(*) into v_today from public.player_ledger
     where user_id = v_uid and gold <> 0 and at >= public.hr_utc_day_start(now())
       and kind = 'trade' and intent like 'market\_list:%';
    if v_today >= v_cfg.max_lists_per_day then
      perform public.hr_reject('list_daily_cap', jsonb_build_object('used', v_today, 'limit', v_cfg.max_lists_per_day));
    end if;
    -- (c) THE HERO'S LOCK ON THE ITEM (the bag's "Locked" rule): never listed.
    if exists (select 1 from public.player_item_rules
                where user_id = v_uid and slot = v_slot and item_id = p_item_id and locked) then
      perform public.hr_reject('item_locked', jsonb_build_object('item_id', p_item_id));
    end if;
    -- (d) THE ROOM ITS RETURN NEEDS: a listing keeps its kind free in Storage.
    if not public.hr_storage_room_fits(v_uid, p_item_id) then
      perform public.hr_reject('storage_no_room',
        jsonb_build_object('cap', public.hr_storage_room_cap(v_uid), 'used', public.hr_storage_room_used(v_uid)));
    end if;
    -- (e) THE ESCROW: the debit IS the possession check, under the source's lock.
    if p_source = 'bag' then
      select qty into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = p_item_id for update;
      v_have := coalesce(v_have, 0);
      if v_have < p_qty then
        perform public.hr_reject('insufficient_item', jsonb_build_object('item_id', p_item_id, 'have', v_have, 'need', p_qty));
      end if;
      if v_have = p_qty then
        delete from public.player_inventory where user_id = v_uid and slot = v_slot and item_id = p_item_id;
      else
        update public.player_inventory set qty = v_have - p_qty
         where user_id = v_uid and slot = v_slot and item_id = p_item_id;
      end if;
    else
      select qty into v_have from public.account_bank
       where user_id = v_uid and item_id = p_item_id for update;
      v_have := coalesce(v_have, 0);
      if v_have < p_qty then
        perform public.hr_reject('insufficient_item', jsonb_build_object('item_id', p_item_id, 'have', v_have, 'need', p_qty));
      end if;
      if v_have = p_qty then
        delete from public.account_bank where user_id = v_uid and item_id = p_item_id;
      else
        update public.account_bank set qty = v_have - p_qty, updated_at = now()
         where user_id = v_uid and item_id = p_item_id;
      end if;
    end if;
    -- (f) THE LISTING: the account owns it, the hero is provenance, the clock is the server's.
    insert into public.market_listings (user_id, slot, source, item_id, qty, qty_listed, ask_each, fee, expires_at)
    values (v_uid, v_slot, p_source, p_item_id, p_qty, p_qty, p_ask_each, v_fee,
            now() + make_interval(hours => v_cfg.listing_ttl_h))
    returning id, expires_at into v_id, v_exp;
    -- (g) THE FEE, BURNED, from the account purse — the purse is the last lock taken.
    v_purse := public.hr_purse_move(v_uid, -v_fee, 0);
    if v_purse is null then
      perform public.hr_reject('insufficient_gold', jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_fee));
    end if;
    -- (h) THE VERSION AND THE JOURNAL: one row; qty is the units that went into escrow, gold
    --     the fee. It names no other account, now or later.
    update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = v_slot;
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, p_item_id, -p_qty, -v_fee, 0, 0, 0, 0, v_purse,
       jsonb_build_object('listing', v_id, 'source', p_source, 'ask_each', p_ask_each, 'fee', v_fee, 'escrow', true));

    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('listed', jsonb_build_object(
                  'listing_id', v_id, 'item_id', p_item_id, 'qty', p_qty, 'ask_each', p_ask_each,
                  'fee', v_fee, 'source', p_source, 'expires_at', v_exp));
  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg) || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write', 'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- (6) RECORD THE DECISION; RELEASE THE KEY ON A VERSION CONFLICT (b346).
  if v_claimed and coalesce(v_out->>'ok', 'false') <> 'true' and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok', 'false') = 'true'
                         then jsonb_build_object('ok', true, 'listed', v_out->'listed') else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error', v_out - 'ok' - 'error');
  end if;
  return v_out;
end $$;

-- ── 4b hr_market_cancel: any hero of the account; the units go to Storage ──
create or replace function public.hr_market_cancel(
  p_user uuid, p_slot int, p_intent_id uuid, p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_rate constant int := 60;
  v_uid  uuid;
  v_role text;
  v_slot int := coalesce(p_slot, 0);
  v_owner uuid;
  v_ver  bigint;
  v_row  public.market_listings%rowtype;
  v_prev jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out  jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_cancel', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if v_slot < 0 or v_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_listing_id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  -- A cancel runs whatever the switch says: an owner can always take their goods back.
  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if not public.hr_rate_ok(v_uid, 'market', c_rate, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market') - c_rate) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_cancel', 'rate_limited',
        jsonb_build_object('limit', c_rate, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market') - c_rate));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- THE REPLAY PRE-CHECK precedes the routing read: a successful cancel deletes the listing,
  -- so a retry must be answered "replayed", not "gone" (v2's M6 finding).
  v_intent := 'market_cancel:' || p_listing_id::text;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent, 'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- ROUTING READ, unlocked (the owner column is immutable): fail fast and confirm the owner.
  select l.user_id into v_owner from public.market_listings l where l.id = p_listing_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;

  -- THE LOCKS: the acting hero, then the account's Storage lock (the units come back there).
  perform public.hr_hunt_lock(v_uid, v_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
  if v_ver is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));

  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent, 'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
  v_claimed := true;

  begin
    -- THE ARBITER: the delete is the read. A buy that took the last unit, the expiry sweep or
    -- a racing cancel answers here with zero rows, and nothing is returned twice.
    delete from public.market_listings where id = p_listing_id and user_id = v_uid returning * into v_row;
    if not found then perform public.hr_reject('gone'); end if;
    -- THE RETURN, to Storage, never refused: its kind was kept free while it was listed.
    insert into public.account_bank as b (user_id, item_id, qty, updated_at)
      values (v_uid, v_row.item_id, v_row.qty, now())
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
    update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = v_slot;
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, v_row.item_id, v_row.qty, 0, 0, 0, 0, 0,
       jsonb_build_object('listing', p_listing_id, 'returned', 'storage', 'reason', 'cancel',
                          'listed_by', v_row.slot, 'fee_kept', v_row.fee));
    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('cancelled', jsonb_build_object(
                  'listing_id', p_listing_id, 'item_id', v_row.item_id, 'qty', v_row.qty, 'to', 'storage'));
  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg) || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write', 'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  update public.player_intents
     set result = case when coalesce(v_out->>'ok', 'false') = 'true'
                       then jsonb_build_object('ok', true, 'cancelled', v_out->'cancelled') else v_out end
   where user_id = v_uid and intent_id = p_intent_id;
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error', v_out - 'ok' - 'error');
  end if;
  return v_out;
end $$;

-- ── 4c hr_market_buy: the whole trade in one transaction, account to account ──
create or replace function public.hr_market_buy(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid,
  p_listing_id uuid, p_qty bigint, p_max_each bigint, p_deliver text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_rate constant int := 60;
  v_uid   uuid;
  v_role  text;
  v_slot  int := coalesce(p_slot, 0);
  v_cfg   public.hr_market_config%rowtype;
  v_rule  public.hr_market_items%rowtype;
  v_route_user uuid; v_route_ask bigint;
  v_row   public.market_listings%rowtype;
  v_ver   bigint; v_bag_cap int;
  v_gross_n numeric;
  v_gross bigint; v_cut bigint; v_net bigint;
  v_stacks int;
  v_day0  timestamptz; v_spent bigint; v_recv bigint;
  v_bpurse bigint; v_spurse bigint;
  v_prev  jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out   jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if v_slot < 0 or v_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_listing_id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  select * into v_cfg from public.hr_market_config;
  if p_qty is null or p_qty <= 0 or p_qty > v_cfg.max_qty then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;
  if p_max_each is null or p_max_each <= 0 or p_max_each > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'bad_price'); end if;
  if p_deliver is null or p_deliver not in ('storage', 'bag') then
    return jsonb_build_object('ok', false, 'error', 'bad_deliver'); end if;

  if not v_cfg.enabled then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;
  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_deliver = 'bag' then
    declare v_settle jsonb := public.hr_settle_first_of(v_uid, v_slot);
    begin
      if v_settle is not null then return v_settle; end if;
    end;
  end if;
  if not public.hr_rate_ok(v_uid, 'market', c_rate, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market') - c_rate) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'rate_limited',
        jsonb_build_object('limit', c_rate, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market') - c_rate));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- THE REPLAY PRE-CHECK, ahead of the routing read (a buy that took the whole listing
  -- deleted it; its retry is "replayed", never "gone").
  v_intent := 'market_buy:' || p_listing_id::text || ':' || p_qty::text || ':' || p_max_each::text || ':' || p_deliver;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent, 'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- ROUTING READ, unlocked (owner and price are immutable): refusals that need no lock.
  select l.user_id, l.ask_each into v_route_user, v_route_ask from public.market_listings l where l.id = p_listing_id;
  if v_route_user is null then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'gone',
        jsonb_build_object('listing', p_listing_id, 'stage', 'routing'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  -- THE SAME ACCOUNT, ANY HERO (threat model #5): Storage moves goods between one's own heroes
  -- for free, so a self-buy is only a fake price. Journalled every time: it is the wash signature.
  if v_route_user = v_uid then
    perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'own_listing',
      jsonb_build_object('listing', p_listing_id, 'qty', p_qty));
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;
  if v_route_ask > p_max_each then
    return jsonb_build_object('ok', false, 'error', 'price_above_max', 'detail', jsonb_build_object('ask_each', v_route_ask));
  end if;

  -- (1) THE LOCKS, in the file's order: the buying hero; the buyer's Storage lock when the
  --     goods go there; the listing row. The seller's hero is never locked.
  perform public.hr_hunt_lock(v_uid, v_slot);
  select version, bank_cap into v_ver, v_bag_cap from public.player_state where user_id = v_uid and slot = v_slot;
  if v_ver is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if p_deliver = 'storage' then
    perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  end if;
  select * into v_row from public.market_listings where id = p_listing_id for update;
  if v_row.id is null then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'gone',
        jsonb_build_object('listing', p_listing_id, 'stage', 'locked'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if v_row.user_id <> v_route_user or v_row.user_id = v_uid then
    -- Unreachable (the owner column is immutable, trigger + §9): refused and recorded as an incident.
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'listing_moved', jsonb_build_object('listing', p_listing_id));
    return jsonb_build_object('ok', false, 'error', 'listing_moved');
  end if;
  if v_row.expires_at <= now() then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'expired', jsonb_build_object('listing', p_listing_id),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_row.qty < p_qty then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'not_enough',
        jsonb_build_object('listing', p_listing_id, 'available', v_row.qty, 'need', p_qty),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_enough', 'detail', jsonb_build_object('available', v_row.qty));
  end if;

  -- (2) THE CLAIM, under the locks.
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent, 'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
  v_claimed := true;

  begin
    -- (3) THE VERSION, on the bag delivery only.
    if p_deliver = 'bag' and (p_version is null or p_version <> v_ver) then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_ver));
    end if;
    -- (4) THE LISTABLE RULE, re-read under the lock: an item made unlistable since it was
    --     posted is not sold (the expiry sweep returns it), and the price is the LOCKED row's.
    if v_row.ask_each > p_max_each then
      perform public.hr_reject('price_above_max', jsonb_build_object('ask_each', v_row.ask_each));
    end if;
    select * into v_rule from public.hr_market_items where item_id = v_row.item_id;
    if v_rule.item_id is null or not v_rule.listable then
      perform public.hr_reject('not_tradeable', jsonb_build_object('item_id', v_row.item_id, 'why', coalesce(v_rule.why, 'unknown_item')));
    end if;
    -- (5) THE ARITHMETIC, in numeric, bounded before any cast; the cut rounds UP (the sink).
    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;
    if v_gross_n > v_cfg.max_gross::numeric then
      perform public.hr_reject('trade_too_large', jsonb_build_object('gross', v_gross_n, 'max_gross', v_cfg.max_gross));
    end if;
    v_gross := v_gross_n::bigint;
    v_cut   := ceil(v_gross_n * v_cfg.house_tax_bp::numeric / 10000)::bigint;
    v_net   := v_gross - v_cut;
    -- (6) THE DELIVERY, under the lock its destination needs (taken above).
    if p_deliver = 'storage' then
      if not public.hr_storage_room_fits(v_uid, v_row.item_id) then
        perform public.hr_reject('storage_full', jsonb_build_object('cap', public.hr_storage_room_cap(v_uid)));
      end if;
      insert into public.account_bank as b (user_id, item_id, qty, updated_at)
        values (v_uid, v_row.item_id, p_qty, now())
        on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
    else
      if not exists (select 1 from public.player_inventory where user_id = v_uid and slot = v_slot and item_id = v_row.item_id) then
        select count(*) into v_stacks from (
          select 1 from public.player_inventory where user_id = v_uid and slot = v_slot limit v_bag_cap + 1) s;
        if v_stacks >= v_bag_cap then
          perform public.hr_reject('bag_full', jsonb_build_object('cap', v_bag_cap));
        end if;
      end if;
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (v_uid, v_slot, v_row.item_id, p_qty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    end if;
    -- (7) THE PRICE HISTORY ROW for (item, today), before the purses.
    insert into public.market_item_daily as d (item_id, day, trades, qty, gross, low_each, high_each)
      values (v_row.item_id, (now() at time zone 'UTC')::date, 1, p_qty, v_gross, v_row.ask_each, v_row.ask_each)
      on conflict (item_id, day) do update
        set trades = d.trades + 1, qty = d.qty + excluded.qty, gross = d.gross + excluded.gross,
            low_each = least(d.low_each, excluded.low_each), high_each = greatest(d.high_each, excluded.high_each);
    -- (8) BOTH PURSES, IN USER ORDER, LAST (two different accounts by construction).
    perform public.hr_purse_lock(least(v_uid, v_row.user_id));
    perform public.hr_purse_lock(greatest(v_uid, v_row.user_id));
    -- (9) THE PER-ACCOUNT DAILY GOLD CAPS, read under both purse locks (every market gold row
    --     of either account is written under its purse lock), the UTC day served by the gold index.
    v_day0 := public.hr_utc_day_start(now());
    select coalesce(sum(-gold), 0) into v_spent from public.player_ledger
     where user_id = v_uid and gold <> 0 and at >= v_day0 and kind = 'trade' and intent like 'market\_buy:%';
    if v_spent + v_gross > v_cfg.max_spend_per_day then
      perform public.hr_reject('market_spend_daily_cap',
        jsonb_build_object('used', v_spent, 'need', v_gross, 'limit', v_cfg.max_spend_per_day));
    end if;
    select coalesce(sum(gold), 0) into v_recv from public.player_ledger
     where user_id = v_row.user_id and gold <> 0 and at >= v_day0 and kind = 'trade' and intent like 'market\_sold:%';
    if v_recv + v_net > v_cfg.max_proceeds_per_day then
      perform public.hr_reject('market_proceeds_daily_cap', jsonb_build_object('need', v_net, 'limit', v_cfg.max_proceeds_per_day));
    end if;
    -- (10) THE BUYER PAYS, from the account purse; its journal row states the purse after.
    v_bpurse := public.hr_purse_move(v_uid, -v_gross, 0);
    if v_bpurse is null then
      perform public.hr_reject('insufficient_gold', jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_gross));
    end if;
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, v_row.item_id, p_qty, -v_gross, 0, 0, 0, 0,
       case when v_gross <> 0 then v_bpurse end,
       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'qty', p_qty, 'deliver', p_deliver, 'transfer', true));
    update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = v_slot;
    -- (11) THE SELLER IS PAID NOW, into the account purse (online or not, no collect step).
    --      Its row names the listing hero (provenance) and never the buying account.
    v_spurse := public.hr_purse_move(v_row.user_id, v_net, 0);
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_row.user_id, v_row.slot, 'trade', 'market_sold:' || p_listing_id::text || ':' || p_qty::text,
       v_row.item_id, null, v_net, 0, 0, 0, 0,
       case when v_net <> 0 then v_spurse end,
       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'qty', p_qty, 'cut', v_cut, 'transfer', true));
    -- (12) THE LISTING IS CONSUMED under the row lock held since (1).
    if v_row.qty = p_qty then
      delete from public.market_listings where id = p_listing_id;
    else
      update public.market_listings set qty = qty - p_qty where id = p_listing_id;
    end if;
    -- (13) THE RECEIPT TABLE: the ONLY place both accounts are named (no client grant).
    insert into public.market_sales
      (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot, item_id, qty, gold_gross, tax, gold_net)
    values
      (p_listing_id, v_row.user_id, v_row.slot, v_uid, v_slot, v_row.item_id, p_qty, v_gross, v_cut, v_net);

    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('bought', jsonb_build_object(
                  'listing_id', p_listing_id, 'item_id', v_row.item_id, 'qty', p_qty, 'each', v_row.ask_each,
                  'gold_gross', v_gross, 'cut', v_cut, 'deliver', p_deliver));
  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg) || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write', 'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  if v_claimed and coalesce(v_out->>'ok', 'false') <> 'true' and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok', 'false') = 'true'
                         then jsonb_build_object('ok', true, 'bought', v_out->'bought') else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error', v_out - 'ok' - 'error');
  end if;
  return v_out;
end $$;

-- ── 4d hr_market_expire: the sweep (cron, every 5 minutes, 200 at most) ──
-- Expired listings, and listings whose item the catalogue has made unlistable, go back to
-- their account's Storage. Each listing in its own subtransaction (one failure cannot stall
-- the batch); the account's Storage lock and the listing row are TRIED, never waited on (a
-- busy account is collected by the next sweep). The delete is the arbiter. p_only scopes a
-- sweep to one account (the §9 probe); cron passes nothing.
create or replace function public.hr_market_expire(p_limit int default 200, p_only uuid default null)
returns int language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_lim int := greatest(1, least(200, coalesce(p_limit, 200)));
  v_c record; v_row public.market_listings%rowtype; v_n int := 0;
begin
  for v_c in
    select q.id, q.user_id, q.why from (
      (select l.id, l.user_id, 'expired'::text as why from public.market_listings l
        where l.expires_at <= now() and (p_only is null or l.user_id = p_only)
        order by l.expires_at limit v_lim)
      union all
      (select l.id, l.user_id, 'unlistable'::text from public.market_listings l
        where l.expires_at > now() and (p_only is null or l.user_id = p_only)
          and not exists (select 1 from public.hr_market_items m where m.item_id = l.item_id and m.listable)
        order by l.expires_at limit v_lim)) q
  loop
    begin
      if not pg_try_advisory_xact_lock(hashtextextended('hr:depot:' || v_c.user_id::text, 0)) then continue; end if;
      perform 1 from public.market_listings where id = v_c.id for update skip locked;
      if not found then continue; end if;
      delete from public.market_listings where id = v_c.id returning * into v_row;
      if not found then continue; end if;
      insert into public.account_bank as b (user_id, item_id, qty, updated_at)
        values (v_row.user_id, v_row.item_id, v_row.qty, now())
        on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
      insert into public.player_ledger
        (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values
        (v_row.user_id, v_row.slot, 'trade', 'market_expire:' || v_row.id::text, v_row.item_id, v_row.qty, 0, 0, 0, 0, 0,
         jsonb_build_object('listing', v_row.id, 'returned', 'storage', 'reason', v_c.why, 'fee_kept', v_row.fee));
      v_n := v_n + 1;
    exception when others then
      raise warning 'hr_market_expire: listing % not returned this sweep (%: %)', v_c.id, sqlstate, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;

-- ── §5 THE READS (names-free; engine-only; the 'market_read' bucket) ──────────
-- One item's summary: listable, floor, ceiling, the lowest open ask, units and listings for
-- sale, the last sale and the 7-day typical price (the median of the daily averages).
create or replace function public.hr_market_item_summary(p_item text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('item_id', m.item_id, 'listable', m.listable, 'why', m.why,
           'floor', m.floor_each, 'ceiling', m.ceiling_each,
           'lowest', a.lowest, 'for_sale', coalesce(a.qty, 0), 'listings', coalesce(a.n, 0),
           'last_each', s.each, 'last_at', s.at,
           'typical_7d', d.typical, 'volume_7d', coalesce(d.qty, 0))
    from public.hr_market_items m
    left join lateral (select min(l.ask_each) as lowest, sum(l.qty) as qty, count(*) as n
                         from public.market_listings l where l.item_id = m.item_id and l.expires_at > now()) a on true
    left join lateral (select x.gold_gross / x.qty as each, x.at
                         from public.market_sales x where x.item_id = m.item_id order by x.at desc limit 1) s on true
    left join lateral (select percentile_disc(0.5) within group (order by y.gross / y.qty) as typical, sum(y.qty) as qty
                         from public.market_item_daily y
                        where y.item_id = m.item_id and y.day >= (now() at time zone 'UTC')::date - 6) d on true
   where m.item_id = p_item
$$;
revoke execute on function public.hr_market_item_summary(text) from public, anon, authenticated, service_role, hr_engine;

-- The read gate, one copy: identity, closed mode, the read bucket. NULL = admitted.
create or replace function public.hr_market_read_gate(p_user uuid, p_slot int, p_verb text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare c_rate constant int := 120; v_role text; v_uid uuid;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  v_uid := case when v_role = 'hr_engine' then coalesce(p_user, auth.uid()) else auth.uid() end;
  if v_role <> 'hr_engine' and p_user is not null and p_user is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation'); end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if coalesce(p_slot, 0) < 0 or coalesce(p_slot, 0) > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_admitted(v_uid) then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if not public.hr_rate_ok(v_uid, 'market_read', c_rate, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_read') - c_rate) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), p_verb, 'rate_limited',
        jsonb_build_object('limit', c_rate, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_read') - c_rate));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return null;
end $$;
revoke execute on function public.hr_market_read_gate(uuid, int, text) from public, anon, authenticated, service_role, hr_engine;

-- BROWSE: the named items (search / a category page, <= 50), or the items for sale now,
-- keyset by item id (<= 50 a page). No account, hero or name anywhere.
create or replace function public.hr_market_browse(
  p_user uuid, p_slot int, p_items text[] default null, p_after text default null, p_limit int default 50)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare v_g jsonb; v_lim int := least(50, greatest(1, coalesce(p_limit, 50))); v_items jsonb; v_next text; v_n int;
begin
  v_g := public.hr_market_read_gate(p_user, p_slot, 'market_browse');
  if v_g is not null then return v_g; end if;
  if not (select enabled from public.hr_market_config) then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;
  if p_items is not null then
    if cardinality(p_items) > 50 then return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', jsonb_build_object('max', 50)); end if;
    select coalesce(jsonb_agg(public.hr_market_item_summary(x.id) order by x.o), '[]'::jsonb) into v_items
      from (select distinct on (u.id) u.id, u.o from unnest(p_items) with ordinality as u(id, o)
             where u.id ~ '^[a-z0-9_]{1,64}$' and exists (select 1 from public.hr_items i where i.item_id = u.id)
             order by u.id, u.o) x;
  else
    select coalesce(jsonb_agg(public.hr_market_item_summary(g.item_id) order by g.item_id), '[]'::jsonb), max(g.item_id), count(*)
      into v_items, v_next, v_n
      from (select distinct l.item_id from public.market_listings l
             where l.item_id > coalesce(p_after, '') and l.expires_at > now()
             order by l.item_id limit v_lim) g;
    if v_n < v_lim then v_next := null; end if;
  end if;
  return jsonb_build_object('ok', true, 'items', v_items, 'next', v_next, 'rules', public.hr_market_rules());
end $$;

-- ONE ITEM'S PAGE: the cheapest 50 open listings grouped by price (listing ids are the only
-- ids; `mine` marks the caller's own account), the 30-day daily line and the last 10 sales.
create or replace function public.hr_market_item(p_user uuid, p_slot int, p_item_id text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare v_g jsonb; v_uid uuid; v_sum jsonb; v_asks jsonb; v_hist jsonb; v_recent jsonb;
begin
  v_g := public.hr_market_read_gate(p_user, p_slot, 'market_item');
  if v_g is not null then return v_g; end if;
  if not (select enabled from public.hr_market_config) then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;
  v_uid := case when coalesce(nullif(current_setting('role', true), 'none'), session_user) = 'hr_engine'
                then coalesce(p_user, auth.uid()) else auth.uid() end;
  v_sum := public.hr_market_item_summary(p_item_id);
  if v_sum is null then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('each', g.ask_each, 'qty', g.qty, 'listings', g.ls) order by g.ask_each), '[]'::jsonb)
    into v_asks
    from (select c.ask_each, sum(c.qty) as qty,
                 jsonb_agg(jsonb_build_object('id', c.id, 'qty', c.qty, 'mine', c.user_id = v_uid) order by c.posted_at) as ls
            from (select l.id, l.user_id, l.qty, l.ask_each, l.posted_at from public.market_listings l
                   where l.item_id = p_item_id and l.expires_at > now()
                   order by l.ask_each, l.posted_at limit 50) c
           group by c.ask_each) g;
  select coalesce(jsonb_agg(jsonb_build_object('day', y.day, 'trades', y.trades, 'qty', y.qty,
                            'avg_each', round(y.gross::numeric / y.qty), 'low', y.low_each, 'high', y.high_each) order by y.day), '[]'::jsonb)
    into v_hist
    from public.market_item_daily y
   where y.item_id = p_item_id and y.day >= (now() at time zone 'UTC')::date - 29;
  select coalesce(jsonb_agg(jsonb_build_object('qty', s.qty, 'each', s.gold_gross / s.qty, 'at', s.at) order by s.at desc), '[]'::jsonb)
    into v_recent
    from (select x.qty, x.gold_gross, x.at from public.market_sales x where x.item_id = p_item_id order by x.at desc limit 10) s;
  return jsonb_build_object('ok', true, 'item', v_sum, 'asks', v_asks, 'history', v_hist, 'recent', v_recent,
                            'rules', public.hr_market_rules());
end $$;

-- MY LISTINGS + 30 DAYS OF HISTORY + TODAY'S CAPS: the account's own rows only. Works with the
-- switch off (an owner can always see and cancel).
create or replace function public.hr_market_mine(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare v_g jsonb; v_uid uuid; v_list jsonb; v_hist jsonb; v_day0 timestamptz := public.hr_utc_day_start(now()); v_today jsonb;
begin
  v_g := public.hr_market_read_gate(p_user, p_slot, 'market_mine');
  if v_g is not null then return v_g; end if;
  v_uid := case when coalesce(nullif(current_setting('role', true), 'none'), session_user) = 'hr_engine'
                then coalesce(p_user, auth.uid()) else auth.uid() end;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'item_id', l.item_id, 'qty', l.qty, 'qty_listed', l.qty_listed,
                  'ask_each', l.ask_each, 'fee', l.fee, 'source', l.source, 'listed_by', l.slot,
                  'posted_at', l.posted_at, 'expires_at', l.expires_at,
                  'received', coalesce((select sum(x.gold_net) from public.market_sales x where x.listing_id = l.id), 0))
                  order by l.posted_at desc), '[]'::jsonb)
    into v_list
    from (select * from public.market_listings where user_id = v_uid order by posted_at desc limit 100) l;
  select coalesce(jsonb_agg(jsonb_build_object('at', h.at, 'hero', h.slot,
                  'what', case split_part(h.intent, ':', 1) when 'market_list' then 'listed' when 'market_buy' then 'bought'
                                when 'market_sold' then 'sold' when 'market_cancel' then 'cancelled' when 'market_expire' then 'returned' end,
                  'item_id', h.item_id, 'qty', coalesce(h.qty, (h.meta->>'qty')::bigint), 'gold', coalesce(h.gold, 0),
                  'each', coalesce(h.meta->'each', h.meta->'ask_each'), 'fee', h.meta->'fee', 'cut', h.meta->'cut',
                  'deliver', h.meta->'deliver', 'source', h.meta->'source', 'reason', h.meta->'reason') order by h.at desc), '[]'::jsonb)
    into v_hist
    from (select at, slot, intent, item_id, qty, gold, meta from public.player_ledger
           where user_id = v_uid and kind = 'trade' and at >= now() - interval '30 days' and intent like 'market\_%'
           order by at desc limit 200) h;
  select jsonb_build_object(
           'open', (select count(*) from public.market_listings where user_id = v_uid),
           'listed', (select count(*) from public.player_ledger where user_id = v_uid and gold <> 0 and at >= v_day0
                        and kind = 'trade' and intent like 'market\_list:%'),
           'spent', (select coalesce(sum(-gold), 0) from public.player_ledger where user_id = v_uid and gold <> 0 and at >= v_day0
                        and kind = 'trade' and intent like 'market\_buy:%'),
           'received', (select coalesce(sum(gold), 0) from public.player_ledger where user_id = v_uid and gold <> 0 and at >= v_day0
                        and kind = 'trade' and intent like 'market\_sold:%'))
    into v_today;
  return jsonb_build_object('ok', true, 'listings', v_list, 'history', v_hist, 'today', v_today, 'rules', public.hr_market_rules());
end $$;

-- ── §6 GRANTS: revoke from PUBLIC first, then the engine and nobody else ──────
revoke execute on function public.hr_market_list(uuid, int, bigint, uuid, text, text, bigint, bigint) from public, anon, authenticated, service_role;
revoke execute on function public.hr_market_cancel(uuid, int, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_market_buy(uuid, int, bigint, uuid, uuid, bigint, bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_market_browse(uuid, int, text[], text, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_market_item(uuid, int, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_market_mine(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_market_expire(int, uuid) from public, anon, authenticated, service_role, hr_engine;
grant execute on function public.hr_market_list(uuid, int, bigint, uuid, text, text, bigint, bigint) to hr_engine;
grant execute on function public.hr_market_cancel(uuid, int, uuid, uuid) to hr_engine;
grant execute on function public.hr_market_buy(uuid, int, bigint, uuid, uuid, bigint, bigint, text) to hr_engine;
grant execute on function public.hr_market_browse(uuid, int, text[], text, int) to hr_engine;
grant execute on function public.hr_market_item(uuid, int, text) to hr_engine;
grant execute on function public.hr_market_mine(uuid, int) to hr_engine;

-- ── §7 THE SWEEP'S SCHEDULE (the command resolves to the new signature's defaults) ──
do $mig$
begin
  perform public.hr_cron_ensure('hr-market-expire', '*/5 * * * *', 'select public.hr_market_expire(200)');
  perform public.hr_cron_ensure('hr-market-sales-prune', '45 3 * * *', 'select public.market_sales_prune()');
end $mig$;

-- ── §8 THE ENGINE ALLOWLIST — link 21 of HR_GRANT_HYGIENE_CHAIN, DERIVED ──────
-- tools/derive-grant-hygiene.mjs extracts 2026-10-25-character-sheet.sql's detector and
-- INSERTS the six market entries at the head of c_engine_allow (declared-removals list
-- EMPTY; the dropped v2 signatures keep their stale text, which admits nothing).
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2027-01-12 — THE ACCOUNT MARKET (lane c-market-account) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. The v2 entries below keep their
    -- stale TEXT (their functions are dropped). Each claim re-derived:
    --
    -- SELF-VALIDATING, the v2 claim on the account: the caller names a slot, a
    -- key, a version, a source (bag|storage), an item, a count and an ASK about
    -- its OWN goods. Listable comes from the generated catalogues (hr_market_items),
    -- the floor is the shop's bid, the ceiling the config's; the fee, the TTL and
    -- every cap are server config; the per-account caps are read under the
    -- account's Storage lock. Moves the account's own goods into escrow and burns
    -- a fee through hr_purse_move. Target (p_user, p_slot), the hr_apply pair.
    'hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)',
    -- SELF-VALIDATING: a listing id of the caller's OWN account (refused
    -- not_yours otherwise); the delete is the arbiter and the units return to the
    -- account's Storage. No price, no count, no target beyond (p_user, p_slot).
    'hr_market_cancel(uuid,integer,uuid,uuid)',
    -- SELF-VALIDATING, the one cross-account transfer: a listing id, a count, a
    -- MAX price and a destination. The price comes off the LOCKED row; the same
    -- account (any hero) is refused; both purses lock in user order, LAST; the
    -- buyer's spend and the seller's proceeds are capped per ACCOUNT per day under
    -- those locks; conserved (buyer -gross, seller +net, cut burned), journalled
    -- with no counterparty in any client-readable row (market_sales holds both).
    -- A compromised engine names both sides only inside those caps.
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)',
    -- read-only in value (it spends a rate counter): per-item summaries of open
    -- asks and sales, no account id or name; <= 50 items a call; switch-gated.
    'hr_market_browse(uuid,integer,text[],text,integer)',
    -- read-only in value: one item's cheapest 50 asks (listing ids only; "mine"
    -- marks the caller's own account), its daily line and its last 10 sales.
    'hr_market_item(uuid,integer,text)',
    -- read-only in value: the caller's OWN account's listings, 30-day market
    -- history from its own ledger rows and today's cap usage.
    'hr_market_mine(uuid,integer)',
    -- ── ADDED 2026-10-25 — THE CHARACTER SHEET (lane character-window) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the md5 of the character's skill levels, worn set,
    -- combat style, active buffs and hr_perks_of — values hr_state_of and
    -- hr_perks_of already answer the engine. Target (p_user, p_slot), the
    -- hr_state_of pair.
    'hr_character_sheet_inputs(uuid,integer)',
    -- SELF-VALIDATING: writes ONE display row (hr_character_sheets) for the
    -- (p_user, p_slot) the engine already reads, only when the fingerprint it
    -- is handed equals the current one, stamped with the calling engine's
    -- payload hash, bounded (an object, <= 2 KB). No fight,
    -- price, gate or other player reads the row; it moves no value. Answers
    -- hr_state_of, which the engine already holds.
    'hr_character_sheet_put(uuid,integer,text,text,jsonb)',
    -- ── ADDED 2026-10-23 — THE INSTANCE SETTLE (lane S1, HUNT_SCREEN_SPEC §1.3) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the instance the caller's OPEN session hunts in — its
    -- clock, world, the keyed-seed secret hr_seed(null, 0, 'hunt:' || instance)
    -- — and every OPEN member's session and hr_state_of. Its target argument is
    -- (p_user, p_slot), the hr_state_of pair; the members it adds are characters
    -- the engine already reads and settles (it holds hr_state_of / hr_apply).
    'hr_hunt_instance_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: under the instance lock and its
    -- world_swing CAS, with the member set held to the instance's open sessions,
    -- it CALLS hr_apply (every invariant of each member's value half, under that
    -- member's character lock) and the session applier (swing CAS, window, bag,
    -- per-lane use caps, falls journalled, every end re-proved), plus the kill
    -- bound, the value bound, the store's catalogue prices, the stamina bound
    -- and the world's shape and byte bound — in ONE subtransaction; a refusal
    -- anywhere rolls every member back. It pays nothing hr_apply would refuse.
    'hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- NOT READ-ONLY, bounded: the CLOSED-MODE answer for a refused edge call
    -- (Security, closed-mode review item 4). Asked only after hr_rate_gate
    -- refused (p_user, p_slot) — the pair the engine already passes it. It
    -- reads hr_admitted for that user and, when not admitted, writes ONE
    -- hr_rejections aggregate upsert (code 'closed') for that user; it moves
    -- no value and names no other target.
    'hr_engine_closed(uuid,integer,text)',
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back by a sentinel ──
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000ac0e1201';   -- seller account (heroes 0 and 1)
  v_b  constant uuid := '000000c0-0000-4000-a000-0000ac0e1202';   -- buyer account (hero 0)
  k    constant text := '000000c0-0000-4000-b000-0000';
  v jsonb; v_txt text; v_fn text; v_n int; v_bad int; v_role text;
  v_item text; v_floor bigint; v_ceil bigint; v_item2 text; v_lid uuid; v_lid2 uuid;
  v_ga0 bigint; v_gb0 bigint; v_cut bigint; v_fee bigint; v_cap int; v_used int;
  v_fee_bp int; v_cut_bp int; v_item3 text;
  p_hero int; p_depot int; p_row int; p_daily int; p_purse int; p_move int; p_cap int;
begin
  -- (a) NO CLIENT READ OR WRITE ON ANY MARKET RELATION; no policy left to widen; the cut
  --     relations are gone (threat model #1, #11, #22).
  if to_regclass('public.market_buy_offers') is not null or to_regclass('public.market_price_history') is not null then
    raise exception 'VERIFY(a): market_buy_offers / market_price_history still exist'; end if;
  foreach v_txt in array array['market_listings', 'market_sales', 'market_item_daily', 'hr_market_config', 'hr_market_items'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
      if has_table_privilege(v_role, 'public.' || v_txt, 'select,insert,update,delete,truncate,references,trigger') then
        raise exception 'VERIFY(a): % holds a privilege on %', v_role, v_txt; end if;
    end loop;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_txt) then
      raise exception 'VERIFY(a): % carries a policy', v_txt; end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name in ('market_listings', 'market_item_daily') and column_name ~ 'name') then
    raise exception 'VERIFY(a): a market relation carries a name column'; end if;
  -- …and no market body writes a counterparty into a client-readable row.
  select string_agg(p.proname, ', ') into v_txt from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\_market\_%' and p.prosrc ~* 'counterparty|seller_name|display_name';
  if v_txt is not null then raise exception 'VERIFY(a): % names a counterparty / a name', v_txt; end if;
  if (select column_default from information_schema.columns where table_schema = 'public'
        and table_name = 'hr_market_config' and column_name = 'enabled') is distinct from 'false' then
    raise exception 'VERIFY(a): the market switch does not default OFF'; end if;

  -- (b) THE EXECUTE SURFACE: no client role reaches any market function; the engine holds
  --     exactly the six verbs; the sweep and every helper are owner-only.
  select count(*) into v_bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'hr\_market\_%' or p.proname like 'hr\_storage\_room\_%' or p.proname = 'market_sales_prune')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('service_role', p.oid, 'execute'));
  if v_bad > 0 then raise exception 'VERIFY(b): % market function(s) are client-executable', v_bad; end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") into v_txt from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'hr\_market\_%' or p.proname like 'hr\_storage\_room\_%')
     and has_function_privilege('hr_engine', p.oid, 'execute');
  if v_txt is distinct from 'hr_market_browse(uuid,integer,text[],text,integer), hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text), '
       || 'hr_market_cancel(uuid,integer,uuid,uuid), hr_market_item(uuid,integer,text), hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint), '
       || 'hr_market_mine(uuid,integer)' then
    raise exception 'VERIFY(b): the engine''s market surface is %', v_txt; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('hr_market_list', 'hr_market_cancel', 'hr_market_buy', 'hr_market_expire')) <> 4 then
    raise exception 'VERIFY(b): a v2 overload of a market verb survived'; end if;

  -- (c) THE LOCK ORDER, ON EVERY BODY (threat model #3): hero -> Storage lock -> listing row
  --     -> the daily row -> purses LAST; every per-account cap after its account lock; no
  --     second hero lock (the seller's is dropped); the sweep only TRIES.
  select prosrc into v_txt from pg_proc where oid = 'public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)'::regprocedure;
  p_hero  := strpos(v_txt, 'perform public.hr_hunt_lock(v_uid, v_slot);');
  p_depot := strpos(v_txt, 'perform pg_advisory_xact_lock(hashtextextended(''hr:depot:'' || v_uid::text, 0));');
  p_row   := strpos(v_txt, 'select * into v_row from public.market_listings where id = p_listing_id for update;');
  p_daily := strpos(v_txt, 'insert into public.market_item_daily');
  p_purse := strpos(v_txt, 'perform public.hr_purse_lock(least(v_uid, v_row.user_id));');
  p_move  := strpos(v_txt, 'v_bpurse := public.hr_purse_move(v_uid, -v_gross, 0);');
  p_cap   := strpos(v_txt, 'intent like ''market\_buy:%''');
  if not (p_hero > 0 and p_depot > p_hero and p_row > p_depot and p_daily > p_row and p_purse > p_daily
          and p_cap > p_purse and p_move > p_cap
          and strpos(v_txt, 'perform public.hr_purse_lock(greatest(v_uid, v_row.user_id));') > p_purse) then
    raise exception 'VERIFY(c): hr_market_buy lock order hero % depot % row % daily % purse % cap % move %',
      p_hero, p_depot, p_row, p_daily, p_purse, p_cap, p_move; end if;
  if (length(v_txt) - length(replace(v_txt, 'hr_hunt_lock(', ''))) / length('hr_hunt_lock(') <> 1
     or v_txt ~ 'pg_advisory_xact_lock\(hashtextextended\(v_row\.user_id' then
    raise exception 'VERIFY(c): hr_market_buy takes a second hero lock (the seller''s)'; end if;
  if strpos(v_txt, 'v_gross_n := p_qty::numeric * v_row.ask_each::numeric;') = 0 then
    raise exception 'VERIFY(c): hr_market_buy does not price from the LOCKED listing row'; end if;
  select prosrc into v_txt from pg_proc where oid = 'public.hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)'::regprocedure;
  p_hero  := strpos(v_txt, 'perform public.hr_hunt_lock(v_uid, v_slot);');
  p_depot := strpos(v_txt, 'perform pg_advisory_xact_lock(hashtextextended(''hr:depot:'' || v_uid::text, 0));');
  p_cap   := strpos(v_txt, 'limit v_cfg.max_listings');
  p_row   := strpos(v_txt, 'intent like ''market\_list:%''');
  p_daily := strpos(v_txt, 'public.hr_storage_room_fits(v_uid, p_item_id)');
  p_move  := strpos(v_txt, 'v_purse := public.hr_purse_move(v_uid, -v_fee, 0);');
  if not (p_hero > 0 and p_depot > p_hero and p_cap > p_depot and p_row > p_depot and p_daily > p_depot and p_move > p_daily) then
    raise exception 'VERIFY(c): hr_market_list order hero % depot % open-cap % day-cap % room % fee %',
      p_hero, p_depot, p_cap, p_row, p_daily, p_move; end if;
  select prosrc into v_txt from pg_proc where oid = 'public.hr_market_cancel(uuid,integer,uuid,uuid)'::regprocedure;
  p_hero  := strpos(v_txt, 'perform public.hr_hunt_lock(v_uid, v_slot);');
  p_depot := strpos(v_txt, 'perform pg_advisory_xact_lock(hashtextextended(''hr:depot:'' || v_uid::text, 0));');
  p_row   := strpos(v_txt, 'delete from public.market_listings where id = p_listing_id and user_id = v_uid returning * into v_row;');
  if not (p_hero > 0 and p_depot > p_hero and p_row > p_depot) then
    raise exception 'VERIFY(c): hr_market_cancel order hero % depot % arbiter %', p_hero, p_depot, p_row; end if;
  select prosrc into v_txt from pg_proc where oid = 'public.hr_market_expire(integer,uuid)'::regprocedure;
  p_depot := strpos(v_txt, 'if not pg_try_advisory_xact_lock(hashtextextended(''hr:depot:'' || v_c.user_id::text, 0)) then continue; end if;');
  p_row   := strpos(v_txt, 'perform 1 from public.market_listings where id = v_c.id for update skip locked;');
  p_daily := strpos(v_txt, 'delete from public.market_listings where id = v_c.id returning * into v_row;');
  if not (p_depot > 0 and p_row > p_depot and p_daily > p_row) or v_txt ~ 'pg_advisory_xact_lock\(' then
    raise exception 'VERIFY(c): hr_market_expire must TRY the Storage lock, skip a locked row and let the delete arbitrate (% % %)',
      p_depot, p_row, p_daily; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.market_listings'::regclass and not tgisinternal
                  and tgname = 'trg_market_listing_immutable') then
    raise exception 'VERIFY(c): the listing immutability trigger is not attached'; end if;

  -- (d) THE LISTABLE RULE AGAINST ITS GENERATED INPUTS (threat model #4): every start-kit item
  --     (bag or worn), the premium reward and every value-0 or untradeable item is refused, and
  --     the rule is neither vacuous nor total.
  select count(*) into v_bad from public.hr_market_items m
   where m.listable and (m.item_id in (select item_id from public.hr_start_inventory)
      or m.item_id in (select item_id from public.hr_start_equipment)
      or m.item_id in (select item_id from public.hr_premium_login_reward where item_id is not null)
      or m.book <= 0 or m.floor_each is null
      or not exists (select 1 from public.hr_items i where i.item_id = m.item_id and i.tradeable));
  if v_bad > 0 then raise exception 'VERIFY(d): % unlistable item(s) read as listable', v_bad; end if;
  if (select count(*) from public.hr_market_items where listable) = 0
     or (select count(*) from public.hr_market_items where not listable) = 0
     or (select count(*) from public.hr_market_items) <> (select count(*) from public.hr_items) then
    raise exception 'VERIFY(d): the listable rule is vacuous, total, or does not cover the catalogue'; end if;
  if exists (select 1 from public.hr_market_items where listable and (ceiling_each < floor_each or floor_each < 1)) then
    raise exception 'VERIFY(d): a listable item''s floor exceeds its ceiling'; end if;

  -- (e) THE BEHAVIOUR, on two probe accounts, rolled back.
  -- Goods chosen from the generated catalogue by property, never by name: listable, not
  -- wearable, a floor above 1 (so floor - 1 is a legal ask) and a ceiling below the ask bound.
  select m.item_id, m.floor_each, m.ceiling_each into v_item, v_floor, v_ceil from public.hr_market_items m
   where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
     and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1;
  select m.item_id into v_item2 from public.hr_market_items m
   where m.listable and m.item_id <> v_item and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1;
  select fee_bp, cut_bp into v_fee_bp, v_cut_bp
    from (select list_fee_bp as fee_bp, house_tax_bp as cut_bp from public.hr_market_config) c;
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'market-account §9 probe'), (v_b, 'market-account §9 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): hr_create_character A0 refused: %', left(v::text, 300); end if;
    -- A owns hero slot 1 (the row hr_buy_hero_slot writes), then creates it through the real gate.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_a, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict (user_id, slot, kind, key, period_key) do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): hr_create_character A1 refused: %', left(v::text, 300); end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): hr_create_character B0 refused: %', left(v::text, 300); end if;
    update public.account_wallet set gold = 1000000 where user_id = v_a;
    update public.account_wallet set gold = 1000000 where user_id = v_b;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 10), (v_a, 1, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;

    -- (e1) THE SWITCH: off answers market_closed to list and buy; a cancel still runs.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if (select enabled from public.hr_market_config) then
      update public.hr_market_config set enabled = false where only_row;
    end if;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00000001')::uuid, 'bag', v_item, 1, v_floor);
    if v->>'error' is distinct from 'market_closed' then raise exception 'VERIFY(e1): a closed market listed: %', left(v::text, 300); end if;
    v := public.hr_market_cancel(v_a, 0, (k || '00000002')::uuid, gen_random_uuid());
    if v->>'error' is distinct from 'gone' then raise exception 'VERIFY(e1): a closed market refused a cancel: %', left(v::text, 300); end if;
    update public.hr_market_config set enabled = true, max_listings = 2 where only_row;

    -- (e2) LISTABLE, FLOOR, CEILING: the kit and the premium reward are not goods.
    v := public.hr_market_list(v_a, 0, null, (k || '00000003')::uuid, 'bag',
           (select item_id from public.hr_start_inventory order by item_id limit 1), 1, 1000000);
    if v->>'error' is distinct from 'not_tradeable' then raise exception 'VERIFY(e2): a start-kit item listed: %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, null, (k || '00000004')::uuid, 'bag', v_item, 1, v_floor - 1);
    if v->>'error' is distinct from 'price_below_shop' then raise exception 'VERIFY(e2): below the shop bid answered %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, null, (k || '00000005')::uuid, 'bag', v_item, 1, v_ceil + 1);
    if v->>'error' is distinct from 'price_above_cap' then raise exception 'VERIFY(e2): above the ceiling answered %', left(v::text, 300); end if;

    -- (e3) A LIST FROM THE BAG: the bag pays the units, the purse pays the fee (burned), the
    --      journal names no counterparty and no other uuid than the listing.
    v_ga0 := public.hr_purse_of(v_a);
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00000006')::uuid, 'bag', v_item, 3, v_floor);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e3): the list refused: %', left(v::text, 300); end if;
    v_lid := (v->'listed'->>'listing_id')::uuid; v_fee := (v->'listed'->>'fee')::bigint;
    if v_fee <> greatest((select list_fee_min from public.hr_market_config), ceil(3 * v_floor * v_fee_bp / 10000.0)::bigint)
       or public.hr_purse_of(v_a) <> v_ga0 - v_fee
       or (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item) <> 7
       or (select qty from public.market_listings where id = v_lid) <> 3 then
      raise exception 'VERIFY(e3): list moved fee % purse % bag %', v_fee, public.hr_purse_of(v_a) - v_ga0,
        (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item); end if;
    if replace((v->'listed')::text, v_lid::text, '') ~ '[0-9a-f]{8}-[0-9a-f]{4}-' then
      raise exception 'VERIFY(e3): the list receipt carries a uuid other than its listing'; end if;

    -- (e4) THE SAME ACCOUNT, ANOTHER HERO: refused (threat model #5).
    v := public.hr_market_buy(v_a, 1, null, (k || '00000007')::uuid, v_lid, 1, v_floor, 'storage');
    if v->>'error' is distinct from 'own_listing' then raise exception 'VERIFY(e4): a same-account buy answered %', left(v::text, 300); end if;

    -- (e5) MAX PRICE, THEN A BUY INTO STORAGE: gold is conserved across purse + cut, the units
    --      across bag + Storage + escrow, and no row a client reads names the other account.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_market_buy(v_b, 0, null, (k || '00000008')::uuid, v_lid, 1, v_floor - 1, 'storage');
    if v->>'error' is distinct from 'price_above_max' then raise exception 'VERIFY(e5): an ask above max_each answered %', left(v::text, 300); end if;
    v_ga0 := public.hr_purse_of(v_a); v_gb0 := public.hr_purse_of(v_b);
    v := public.hr_market_buy(v_b, 0, null, (k || '00000009')::uuid, v_lid, 1, v_floor, 'storage');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e5): the buy refused: %', left(v::text, 300); end if;
    v_cut := ceil(v_floor * v_cut_bp / 10000.0)::bigint;
    if public.hr_purse_of(v_b) <> v_gb0 - v_floor or public.hr_purse_of(v_a) <> v_ga0 + v_floor - v_cut
       or (v->'bought'->>'cut')::bigint <> v_cut
       or (select qty from public.account_bank where user_id = v_b and item_id = v_item) <> 1
       or (select qty from public.market_listings where id = v_lid) <> 2 then
      raise exception 'VERIFY(e5): the buy moved buyer % seller % cut %', public.hr_purse_of(v_b) - v_gb0,
        public.hr_purse_of(v_a) - v_ga0, v->'bought'->>'cut'; end if;
    if exists (select 1 from public.player_ledger where user_id in (v_a, v_b) and intent like 'market\_%'
                and (meta::text ~ v_a::text or meta::text ~ v_b::text or meta ? 'counterparty')) then
      raise exception 'VERIFY(e5): a client-readable ledger row names an account'; end if;
    if (v->'bought')::text ~ 'name' or (select count(*) from public.market_sales
         where listing_id = v_lid and seller_user_id = v_a and buyer_user_id = v_b and tax = v_cut) <> 1 then
      raise exception 'VERIFY(e5): the counterparty is not (only) in market_sales'; end if;

    -- (e6) PER-ACCOUNT CAPS (max_listings 2 in this probe): two heroes of A, one count.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_list(v_a, 1, (select version from public.player_state where user_id = v_a and slot = 1),
           (k || '0000000a')::uuid, 'bag', v_item, 1, v_floor);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e6): hero 1''s list refused: %', left(v::text, 300); end if;
    v_lid2 := (v->'listed'->>'listing_id')::uuid;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '0000000b')::uuid, 'bag', v_item, 1, v_floor);
    if v->>'error' is distinct from 'too_many_listings' then
      raise exception 'VERIFY(e6): the third listing across two heroes answered % (caps per hero?)', left(v::text, 300); end if;

    -- (e7) A CANCEL BY ANOTHER HERO OF THE ACCOUNT: the units go to Storage, the fee is kept.
    v := public.hr_market_cancel(v_a, 1, (k || '0000000c')::uuid, v_lid);
    if coalesce(v->>'ok', '') <> 'true' or (select qty from public.account_bank where user_id = v_a and item_id = v_item) <> 2
       or exists (select 1 from public.market_listings where id = v_lid) then
      raise exception 'VERIFY(e7): the cancel answered % / Storage %', left(v::text, 300),
        (select qty from public.account_bank where user_id = v_a and item_id = v_item); end if;
    v := public.hr_market_cancel(v_a, 0, (k || '0000000d')::uuid, v_lid);
    if v->>'error' is distinct from 'gone' then raise exception 'VERIFY(e7): a second cancel answered %', left(v::text, 300); end if;

    -- (e8) THE ROOM COUNTS LISTED KINDS: fill A's Storage to its cap less one kind, then the
    --      listing of v_item2's kind (not in Storage) holds the last kind; a deposit of a new
    --      kind is refused bank_full, and the listing's return still fits.
    update public.hr_market_config set max_listings = 50 where only_row;
    v_cap := public.hr_storage_room_cap(v_a);
    insert into public.account_bank (user_id, item_id, qty)
      select v_a, i.item_id, 1 from public.hr_items i
       where i.item_id not in (v_item, v_item2)
         and not exists (select 1 from public.account_bank b where b.user_id = v_a and b.item_id = i.item_id)
       order by i.item_id limit greatest(0, v_cap - 1 - public.hr_storage_room_used(v_a));
    v_used := public.hr_storage_room_used(v_a);
    if v_used <> v_cap - 1 then raise exception 'VERIFY(e8): probe room % is not cap - 1 (cap %)', v_used, v_cap; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item2, 4)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '0000000e')::uuid, 'bag', v_item2, 2,
           (select floor_each from public.hr_market_items where item_id = v_item2));
    if coalesce(v->>'ok', '') <> 'true' or public.hr_storage_room_used(v_a) <> v_cap then
      raise exception 'VERIFY(e8): the listing that takes the last kind answered %', left(v::text, 300); end if;
    v_lid := (v->'listed'->>'listing_id')::uuid;
    -- a kind in neither Storage nor the listings: its deposit needs room the listing holds
    select m.item_id into v_item3 from public.hr_market_items m
     where m.listable
       and not exists (select 1 from public.account_bank b where b.user_id = v_a and b.item_id = m.item_id)
       and not exists (select 1 from public.market_listings l where l.user_id = v_a and l.item_id = m.item_id)
     order by m.item_id limit 1;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item3, 3)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    v := public.hr_bank_move(0, v_item3, 1, 'deposit', (k || '0000000f')::uuid);
    if v->>'error' is distinct from 'bank_full' then
      raise exception 'VERIFY(e8): a deposit into a room held by a listing answered %', left(v::text, 300); end if;
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00000010')::uuid, 'bag', v_item3, 1,
           (select floor_each from public.hr_market_items where item_id = v_item3));
    if v->>'error' is distinct from 'storage_no_room' then
      raise exception 'VERIFY(e8): a listing of a new kind into a full room answered %', left(v::text, 300); end if;

    -- (e9) THE SWEEP (this account only): the expired listing comes back to Storage, the last
    --      kind it held fits, the room never exceeds the cap.
    update public.market_listings set expires_at = now() - interval '1 minute' where id = v_lid and user_id = v_a;
    v_n := public.hr_market_expire(200, v_a);
    if v_n < 1 or exists (select 1 from public.market_listings where id = v_lid)
       or (select qty from public.account_bank where user_id = v_a and item_id = v_item2) <> 2
       or public.hr_storage_room_used(v_a) > v_cap then
      raise exception 'VERIFY(e9): the sweep returned % / Storage %', v_n,
        (select qty from public.account_bank where user_id = v_a and item_id = v_item2); end if;

    -- (e10) THE READS carry no account id and no name; mine shows the open listing.
    v := public.hr_market_mine(v_a, 0);
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'listings') <> 1
       or v::text ~ v_a::text or v::text ~ v_b::text then
      raise exception 'VERIFY(e10): hr_market_mine answered %', left(v::text, 400); end if;
    v := public.hr_market_item(v_a, 0, v_item);
    if coalesce(v->>'ok', '') <> 'true' or v::text ~ v_a::text or v::text ~ v_b::text
       or jsonb_array_length(v->'recent') <> 1 or jsonb_array_length(v->'history') <> 1 then
      raise exception 'VERIFY(e10): hr_market_item answered %', left(v::text, 400); end if;

    raise exception using errcode = 'HR912', message = 'market-account §9 complete - rolling back';
  exception when sqlstate 'HR912' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.market_listings where user_id in (v_a, v_b))
     or exists (select 1 from public.market_sales where seller_user_id in (v_a, v_b) or buyer_user_id in (v_a, v_b))
     or exists (select 1 from public.account_bank where user_id in (v_a, v_b)) then
    raise exception 'VERIFY(f): §9 LEAKED a probe row'; end if;

  -- (g) THE SCHEDULE and THE DETECTOR.
  if not exists (select 1 from cron.job where jobname = 'hr-market-expire' and active) then
    raise exception 'VERIFY(g): hr-market-expire is not scheduled'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'market-account: the market is the account''s (listings, caps, Storage room), anonymous to every client, '
               'one listable rule, one lock order, purses last, OFF until Security signs it; all green';
end $$;
