-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — MARKET v2, REAL VALUE MOVEMENT  (foundation, file 4 of 4)
-- Companion design doc: docs/design/server-authority.md §5
-- Depends on: 2026-08-11-player-state.sql, 2026-08-11-catalogue.generated.sql
--
-- ⚠ REVIEW ONLY — DO NOT APPLY TO PRODUCTION.
--
-- WHY THE OLD MARKET COULD NOT BE PATCHED
--   supabase/schema.sql's market is structurally, not incidentally, broken:
--     • :169  `market_listings` policy is `for all` → the seller can PATCH qty
--             and ask_each after the listing is live.
--     • :155  INSERT has ownership only — no item allowlist, no possession
--             check, no price or quantity ceiling.
--     • :221  buy_listing arbitrates the RACE correctly (row lock, qty,
--             self-purchase, atomic sale row) but MOVES NO VALUE. The buyer's
--             gold and the seller's items are debited by the browser
--             (src/market.js :485-487). A client that skips that step buys for
--             free.
--     • :212  `market_sales` has a ROW-level UPDATE policy, so the seller can
--             PATCH `gold_total` upward before collecting.
--     • :159  `seller_name` is client free text → impersonation.
--   Every one of those is a symptom of the same root cause: the server did not
--   own the inventory or the gold, so it had nothing to move.
--
-- WHAT CHANGES NOW THAT IT DOES
--     1. No possession check is needed — the escrow is a real DELETE from
--        player_inventory. You cannot list what you do not have.
--     2. No `collect_sales` dance, no `collected` flag, no PATCH policy: the
--        seller is PAID DIRECTLY into player_state.gold, whether or not they
--        are online. market_sales becomes an append-only receipt.
--     3. No price cap is included as an anti-exploit device. Gold can no longer
--        be conjured, so an absurd listing can only move gold someone actually
--        earned. A cap may still be wanted as an anti-scam UX rail — that is
--        the Game Designer's call, not a security control, and it is left out
--        deliberately rather than smuggled in as one.
--
-- ════════════════════════════════════════════════════════════════════════
-- REVISION 2 — what the security review changed here
--
--   S3  The `bop` allowlist FAILED OPEN. `if to_regclass('public.hr_items') is
--       not null then …` meant that on any database without the catalogue —
--       which was every database — all 15 bind-on-pickup items were freely
--       listable. Now the migration refuses to install without the catalogue
--       and the check is unconditional.
--   S6/S7 Every function kept Postgres's default PUBLIC EXECUTE. `anon` could
--       call all of them. market_expire in particular took p_limit up to 5000
--       and was unauthenticated write amplification: one anonymous request
--       could force 5,000 deletes, 5,000 upserts and 5,000 ledger inserts. It
--       is now engine/cron-only and capped at 200.
--   S11 The seller credit ignored row_count. A sale to a listing whose seller
--       had no player_state row deleted the item, took the buyer's gold, and
--       paid nobody. Gold destroyed, silently.
--   S15 market_cancel and market_expire mutated inventory without bumping
--       `version`, so a client holding a pre-cancel version could still land an
--       apply computed against inventory that no longer existed.
--   S16 market_buy locked the buyer's player_state and then the seller's, in
--       call order. Two players buying from each other simultaneously deadlock.
--       Both rows are now locked in canonical user_id order.
--   S17 `market_sales for select using (true)` published both parties' auth
--       UUIDs to the world. The receipt table is now participants-only and the
--       price chart reads a names-free view.
--   Plus: an upper bound on hr_market_config.max_qty (overflow headroom
--       depended on a value with no ceiling), idempotency keys on all three
--       mutating RPCs, rate limits, and raise-not-return for every rejection
--       that follows a write.
--
-- ⚠ This file DROPS AND RECREATES market_listings / market_sales. That is only
--   safe because the beta is wiped at cutover (CLAUDE.md, "Server authority").
--   Do NOT apply it to a database whose market you intend to keep.
--   It does NOT touch game_saves, profiles, clans or any other live table.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED (review S3) ───────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'catalogue_missing — run: node tools/gen-catalogues.mjs, then apply 2026-08-11-catalogue.generated.sql';
  end if;
  if (select count(*) from public.hr_items where not tradeable) = 0 then
    raise exception 'catalogue has no untradeable items — the bop allowlist would be vacuous, refusing to install';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'run 2026-08-11-apply-engine.sql first (hr_reject is the rollback primitive)';
  end if;
end $$;

-- ── 1. Tables ────────────────────────────────────────────────────────────
drop table if exists public.market_listings cascade;
drop table if exists public.market_sales    cascade;

create table public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  seller_slot    int  not null default 0,
  -- Denormalised for the listing grid, but written by the SERVER from
  -- profiles.display_name (kept unique by 2026-08-08-unique-names.sql
  -- claim_display_name). Never accepted from a client — that was the
  -- impersonation hole, and it is the same hole chat_messages.from_name still
  -- has live (fixed separately in 2026-08-11-chat-name-authority.sql).
  seller_name    text not null,
  item_id        text not null,
  qty            bigint not null check (qty > 0),
  ask_each       bigint not null check (ask_each > 0 and ask_each <= 1000000000),
  posted_at      timestamptz not null default now(),
  expires_at     timestamptz not null
);
create index market_listings_item_idx on public.market_listings (item_id, ask_each);
create index market_listings_seller_idx on public.market_listings (seller_user_id, seller_slot);
create index market_listings_expiry_idx on public.market_listings (expires_at);

-- Append-only receipt. No `collected` column — the seller was already paid.
create table public.market_sales (
  id             bigserial primary key,
  listing_id     uuid not null,
  seller_user_id uuid not null,
  seller_slot    int  not null,
  buyer_user_id  uuid not null,
  buyer_slot     int  not null,
  item_id        text not null,
  qty            bigint not null check (qty > 0),
  gold_gross     bigint not null check (gold_gross >= 0),
  tax            bigint not null check (tax >= 0),
  gold_net       bigint not null check (gold_net >= 0),
  at             timestamptz not null default now()
);
create index market_sales_item_idx   on public.market_sales (item_id, at desc);
create index market_sales_seller_idx on public.market_sales (seller_user_id, at desc);

-- ── 2. RLS + grants ──────────────────────────────────────────────────────
-- Listings are public (it is a market) and writable by nobody.
--
-- SALES ARE NOT PUBLIC (review S17). Revision 1 used `for select using (true)`
-- on a table carrying seller_user_id and buyer_user_id — publishing every
-- player's auth UUID and their complete trade history to anyone with the anon
-- key. The 7-day price chart needs prices, not identities, so the chart reads
-- the names-free view below and the receipt table stays private to its two
-- parties.
alter table public.market_listings enable row level security;
alter table public.market_sales    enable row level security;

drop policy if exists "listings readable" on public.market_listings;
create policy "listings readable" on public.market_listings for select using (true);

drop policy if exists "sales readable" on public.market_sales;
create policy "own sales readable" on public.market_sales
  for select using (auth.uid() = seller_user_id or auth.uid() = buyer_user_id);

revoke all on public.market_listings from public, anon, authenticated, service_role, hr_engine;
revoke all on public.market_sales    from public, anon, authenticated, service_role, hr_engine;
grant select on public.market_listings to anon, authenticated, service_role;
grant select on public.market_sales    to authenticated, service_role;
revoke all on sequence public.market_sales_id_seq
  from public, anon, authenticated, service_role, hr_engine;

-- The public price history: what a chart needs and nothing a scammer does.
--
-- ⚠ ACCEPTED ADVISOR EXCEPTION. `supabase get_advisors --security` will flag
--   this view with `security_definer_view` (ERROR level), the same lint that
--   already fires on lb_total_level, lb_combat, lb_gold, leaderboard and
--   clan_leaderboard in production today. That is CORRECT and INTENDED here:
--   the whole point is to expose aggregate prices while the underlying receipt
--   stays participants-only, and a security_invoker view would return each
--   caller only their own trades — an empty chart. The lint exists to catch
--   views that leak rows a caller should not see; the mitigation is that this
--   view selects NO identity column at all (no seller_user_id, no
--   buyer_user_id, no slot) and is bounded to 30 days. If the columns ever
--   change, re-read this comment before adding one.
-- security_invoker = false (the default, stated explicitly because the default
-- changed in PG15 and a reader should not have to remember which way): the view
-- runs as its owner, so it can read past market_sales' participants-only policy
-- while exposing no identity column.
drop view if exists public.market_price_history;
create view public.market_price_history
  with (security_invoker = false) as
  select item_id,
         qty,
         gold_gross,
         (gold_gross / greatest(qty, 1)) as each,
         at
    from public.market_sales
   where at > now() - interval '30 days';
revoke all on public.market_price_history from public, anon, authenticated, service_role, hr_engine;
grant select on public.market_price_history to anon, authenticated, service_role;

-- ── 3. Config, tunable without a code deploy ─────────────────────────────
create table if not exists public.hr_market_config (
  only_row      boolean primary key default true check (only_row),
  house_tax_bp  int    not null default 150   check (house_tax_bp between 0 and 2000), -- 1.50%, matches src/market.js HOUSE_TAX
  listing_ttl_h int    not null default 48    check (listing_ttl_h between 1 and 720),
  max_listings  int    not null default 12    check (max_listings between 1 and 500),
  max_qty       bigint not null default 1000000 check (max_qty > 0)
);
insert into public.hr_market_config (only_row) values (true) on conflict do nothing;

-- An upper bound on max_qty. The overflow headroom of `qty * ask_each` depends
-- on this value, and revision 1 left it unbounded — a config row edited to
-- 1e18 would turn a legal listing into a bigint overflow inside market_buy.
-- Added as a separate, named, idempotent constraint because the table above is
-- `create table if not exists` and will not be recreated on an existing
-- database. 1e8 × the 1e9 ask ceiling = 1e17, comfortably inside bigint.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_market_config'::regclass
                    and conname = 'hr_market_config_max_qty_ceiling') then
    update public.hr_market_config set max_qty = least(max_qty, 100000000);
    alter table public.hr_market_config
      add constraint hr_market_config_max_qty_ceiling check (max_qty <= 100000000);
  end if;
end $$;

alter table public.hr_market_config enable row level security;
drop policy if exists "market config readable" on public.hr_market_config;
create policy "market config readable" on public.hr_market_config for select using (true);
revoke all on public.hr_market_config from public, anon, authenticated, service_role, hr_engine;
grant select on public.hr_market_config to anon, authenticated, service_role;

-- ── 4. Helper: the display name, derived ─────────────────────────────────
-- Not client-callable. Revision 1 left it on PUBLIC EXECUTE, which made it an
-- anonymous "give me the display name for this UUID" endpoint — free name
-- enumeration for anyone who scraped a UUID out of the old market_sales table.
-- (Review S7.) It is only ever called from inside a SECURITY DEFINER function,
-- so it needs no grant at all.
create or replace function public.hr_display_name_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Adventurer')
$$;
revoke execute on function public.hr_display_name_of(uuid)
  from public, anon, authenticated, service_role, hr_engine;

-- ── 4b. Idempotency helper for the market RPCs ───────────────────────────
-- Same contract as hr_apply's: same key, same answer. Returns the stored
-- result if this intent has already been decided, else claims the key.
-- Must be called while holding whatever lock serialises the operation.
create or replace function public.hr_intent_claim(
  p_user uuid, p_intent_id uuid, p_slot int, p_intent text,
  out prior jsonb, out claimed boolean)
language plpgsql security definer set search_path = public as $$
begin
  prior := null; claimed := false;
  if p_intent_id is null then return; end if;      -- caller decides if that is fatal
  select result into prior from public.player_intents
   where user_id = p_user and intent_id = p_intent_id;
  if found then
    if prior is null then prior := jsonb_build_object('ok', false, 'error', 'intent_in_flight'); end if;
    return;
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (p_user, p_intent_id, coalesce(p_slot, 0), p_intent);
  claimed := true;
end $$;
revoke execute on function public.hr_intent_claim(uuid, uuid, int, text)
  from public, anon, authenticated, service_role, hr_engine;

create or replace function public.hr_intent_record(p_user uuid, p_intent_id uuid, p_result jsonb)
returns void language sql security definer set search_path = public as $$
  update public.player_intents set result = p_result
   where user_id = p_user and intent_id = p_intent_id
$$;
revoke execute on function public.hr_intent_record(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role, hr_engine;

-- Old signatures, if a previous revision was ever applied. Dropped so an
-- overload cannot survive with weaker checks and a shorter argument list.
drop function if exists public.market_list(int, text, bigint, bigint);
drop function if exists public.market_cancel(uuid);
drop function if exists public.market_buy(int, uuid, bigint);
drop function if exists public.market_expire(int);

-- ── 5. market_list — escrow out of the REAL inventory ────────────────────
create or replace function public.market_list(
  p_slot int, p_item_id text, p_qty bigint, p_ask_each bigint, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_slot int  := coalesce(p_slot, 0);
  v_cfg  public.hr_market_config%rowtype;
  v_have bigint;
  v_open int;
  v_id   uuid;
  v_out  jsonb;
  v_prior jsonb; v_claimed boolean;
  v_msg text; v_det text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if not public.hr_rate_ok(v_uid, 'market_list', 60, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  select prior, claimed into v_prior, v_claimed
    from public.hr_intent_claim(v_uid, p_intent_id, v_slot, 'market_list');
  if not v_claimed then return v_prior || jsonb_build_object('replayed', true); end if;

  begin
    select * into v_cfg from public.hr_market_config;

    if p_qty is null or p_qty <= 0 or p_qty > v_cfg.max_qty then
      perform public.hr_reject('bad_qty');
    end if;
    if p_ask_each is null or p_ask_each <= 0 or p_ask_each > 1000000000 then
      perform public.hr_reject('bad_price');
    end if;

    -- THE TRADEABLE ALLOWLIST, unconditional (review S3). hr_items is
    -- GENERATED from src/data/items.js, so `bop` is authored in one place —
    -- see docs/design/server-authority.md §3.4.
    if not exists (select 1 from public.hr_items
                    where item_id = p_item_id and tradeable) then
      perform public.hr_reject('not_tradeable', jsonb_build_object('item_id', p_item_id));
    end if;

    select count(*) into v_open from public.market_listings
     where seller_user_id = v_uid and seller_slot = v_slot;
    if v_open >= v_cfg.max_listings then
      perform public.hr_reject('too_many_listings', jsonb_build_object('limit', v_cfg.max_listings));
    end if;

    -- ESCROW. This is the possession check — there is nothing else to check.
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item_id for update;
    if coalesce(v_have, 0) < p_qty then
      perform public.hr_reject('insufficient_item',
        jsonb_build_object('have', coalesce(v_have, 0), 'need', p_qty));
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = p_item_id;
    else
      update public.player_inventory set qty = qty - p_qty
       where user_id = v_uid and slot = v_slot and item_id = p_item_id;
    end if;

    insert into public.market_listings
      (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each, expires_at)
    values
      (v_uid, v_slot, public.hr_display_name_of(v_uid), p_item_id, p_qty, p_ask_each,
       now() + make_interval(hours => v_cfg.listing_ttl_h))
    returning id into v_id;

    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;

    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
      values (v_uid, v_slot, 'trade', 'market_list', p_item_id, -p_qty,
              jsonb_build_object('ask_each', p_ask_each, 'listing', v_id));

    v_out := jsonb_build_object('ok', true, 'listing_id', v_id);
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    v_out := jsonb_build_object('ok', false, 'error', v_msg)
             || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
  end;

  perform public.hr_intent_record(v_uid, p_intent_id, v_out);
  return v_out;
end $$;
revoke execute on function public.market_list(int, text, bigint, bigint, uuid)
  from public, anon, service_role;
grant execute on function public.market_list(int, text, bigint, bigint, uuid) to authenticated;

-- ── 6. market_cancel — escrow returns ────────────────────────────────────
create or replace function public.market_cancel(p_listing_id uuid, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.market_listings;
  v_out jsonb; v_prior jsonb; v_claimed boolean;
  v_stacks int; v_cap int;
  v_msg text; v_det text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if not public.hr_rate_ok(v_uid, 'market_cancel', 60, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.seller_user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_row.seller_slot::text, 0));

  select prior, claimed into v_prior, v_claimed
    from public.hr_intent_claim(v_uid, p_intent_id, v_row.seller_slot, 'market_cancel');
  if not v_claimed then return v_prior || jsonb_build_object('replayed', true); end if;

  begin
    delete from public.market_listings where id = p_listing_id;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

    -- The returning stack can push the seller over the bank cap. Revision 1 let
    -- it, quietly making the cap advisory for anyone who listed at cap.
    select count(*) into v_stacks from public.player_inventory
      where user_id = v_uid and slot = v_row.seller_slot;
    select bank_cap into v_cap from public.player_state
      where user_id = v_uid and slot = v_row.seller_slot for update;
    if v_stacks > coalesce(v_cap, 100) then
      perform public.hr_reject('bank_full', jsonb_build_object('stacks', v_stacks, 'cap', v_cap));
    end if;

    -- Bump `version` (review S15). Inventory changed, so any delta a client is
    -- still computing against the old inventory must be refused.
    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_row.seller_slot;

    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
      values (v_uid, v_row.seller_slot, 'trade', 'market_cancel', v_row.item_id, v_row.qty,
              jsonb_build_object('listing', p_listing_id));

    v_out := jsonb_build_object('ok', true);
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    v_out := jsonb_build_object('ok', false, 'error', v_msg)
             || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
  end;

  perform public.hr_intent_record(v_uid, p_intent_id, v_out);
  return v_out;
end $$;
revoke execute on function public.market_cancel(uuid, uuid) from public, anon, service_role;
grant execute on function public.market_cancel(uuid, uuid) to authenticated;

-- ── 7. market_buy — the whole trade, in one transaction ──────────────────
-- LOCK ORDER, stated once and obeyed by every caller:
--   1. the LISTING row              (so two buyers queue instead of racing)
--   2. both player_state rows, in ASCENDING user_id order   (review S16)
--
-- Revision 1 locked the buyer, did work, then locked the seller. Two players
-- who each buy from the other at the same moment take those two locks in
-- opposite orders — a textbook deadlock, and one of the two transactions dies
-- with a 40P01 in the middle of a value transfer. Canonical ordering makes the
-- cycle unconstructible.
create or replace function public.market_buy(
  p_slot int, p_listing_id uuid, p_qty bigint, p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_row   public.market_listings;
  v_cfg   public.hr_market_config%rowtype;
  v_gross bigint; v_tax bigint; v_net bigint; v_gross_n numeric;
  v_gold  bigint;
  v_stacks int; v_cap int; v_rows int;
  v_out jsonb; v_prior jsonb; v_claimed boolean;
  v_msg text; v_det text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if not public.hr_rate_ok(v_uid, 'market_buy', 60, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;

  select * into v_cfg from public.hr_market_config;

  -- (1) The listing, first, always.
  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.expires_at <= now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if v_row.seller_user_id = v_uid then return jsonb_build_object('ok', false, 'error', 'own_listing'); end if;
  if v_row.qty < p_qty then
    return jsonb_build_object('ok', false, 'error', 'not_enough', 'available', v_row.qty);
  end if;

  select prior, claimed into v_prior, v_claimed
    from public.hr_intent_claim(v_uid, p_intent_id, v_slot, 'market_buy');
  if not v_claimed then return v_prior || jsonb_build_object('replayed', true); end if;

  begin
    -- (2) BOTH player rows, in canonical order, in ONE statement. The LockRows
    --     node sits above the Sort, so the rows really are locked in the sorted
    --     order rather than in whatever order the scan produced them.
    perform 1 from public.player_state
      where (user_id, slot) in ((v_uid, v_slot), (v_row.seller_user_id, v_row.seller_slot))
      order by user_id, slot
      for update;

    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;
    if v_gross_n > 9.0e18 then perform public.hr_reject('overflow'); end if;
    v_gross := v_gross_n::bigint;
    v_tax   := (v_gross * v_cfg.house_tax_bp) / 10000;     -- the gold sink
    v_net   := v_gross - v_tax;

    -- BUYER: funds. The check the old buy_listing never made, because it had
    -- nothing authoritative to check against.
    select gold, bank_cap into v_gold, v_cap from public.player_state
     where user_id = v_uid and slot = v_slot;
    if v_gold is null then perform public.hr_reject('no_character'); end if;
    if v_gold < v_gross then
      perform public.hr_reject('insufficient_gold',
        jsonb_build_object('have', v_gold, 'need', v_gross));
    end if;

    -- BUYER: debit + deliver.
    update public.player_state set gold = gold - v_gross, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_row.item_id, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

    select count(*) into v_stacks from public.player_inventory where user_id = v_uid and slot = v_slot;
    if v_stacks > v_cap then perform public.hr_reject('bank_full'); end if;

    -- SELLER: paid now, online or not. No collect step, so no collect exploit.
    -- row_count is checked (review S11): if the seller has no player_state row
    -- for that slot, revision 1 silently DESTROYED the gold — buyer debited,
    -- nobody credited. Money must not evaporate; the trade is refused instead.
    update public.player_state set gold = gold + v_net, version = version + 1, updated_at = now()
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      perform public.hr_reject('seller_unavailable',
        jsonb_build_object('listing', p_listing_id));
    end if;

    -- LISTING: consume under the lock we already hold.
    if v_row.qty = p_qty then
      delete from public.market_listings where id = p_listing_id;
    else
      update public.market_listings set qty = qty - p_qty where id = p_listing_id;
    end if;

    insert into public.market_sales
      (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot,
       item_id, qty, gold_gross, tax, gold_net)
    values
      (p_listing_id, v_row.seller_user_id, v_row.seller_slot, v_uid, v_slot,
       v_row.item_id, p_qty, v_gross, v_tax, v_net);

    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
      values (v_uid, v_slot, 'trade', 'market_buy', v_row.item_id, p_qty, -v_gross,
              jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each)),
             (v_row.seller_user_id, v_row.seller_slot, 'trade', 'market_sold',
              v_row.item_id, -p_qty, v_net,
              jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'tax', v_tax));

    v_out := jsonb_build_object('ok', true, 'item_id', v_row.item_id, 'qty', p_qty,
                                'each', v_row.ask_each, 'gold_spent', v_gross);
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    v_out := jsonb_build_object('ok', false, 'error', v_msg)
             || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
  end;

  perform public.hr_intent_record(v_uid, p_intent_id, v_out);
  return v_out;
end $$;
revoke execute on function public.market_buy(int, uuid, bigint, uuid) from public, anon, service_role;
grant execute on function public.market_buy(int, uuid, bigint, uuid) to authenticated;

-- ── 8. market_expire — return escrow on expired listings ─────────────────
-- NOT PLAYER-CALLABLE (review S6). Revision 1 granted it to `authenticated`
-- AND left PUBLIC EXECUTE in place, with p_limit accepted up to 5000 — so an
-- unauthenticated request could force 5,000 deletes, 5,000 inventory upserts
-- and 5,000 ledger inserts, repeatedly. That is write amplification with an
-- anon key, which is a denial-of-service primitive, not a housekeeping call.
--
-- Now: cron/engine only, and the batch is capped at 200. Schedule it with
--   select cron.schedule('hr-market-expire', '*/5 * * * *', 'select public.market_expire(200)');
create or replace function public.market_expire(p_limit int default 200)
returns int language plpgsql security definer set search_path = public as $$
declare v_row public.market_listings; v_n int := 0;
begin
  for v_row in
    select * from public.market_listings where expires_at <= now()
     order by expires_at limit greatest(1, least(200, coalesce(p_limit, 200)))
     for update skip locked
  loop
    delete from public.market_listings where id = v_row.id;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_row.seller_user_id, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    -- Bump `version` (review S15): the seller's inventory just changed under
    -- them, so any in-flight delta computed against the old inventory is stale.
    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
      values (v_row.seller_user_id, v_row.seller_slot, 'trade', 'market_expire',
              v_row.item_id, v_row.qty, jsonb_build_object('listing', v_row.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.market_expire(int)
  from public, anon, authenticated, service_role;
grant execute on function public.market_expire(int) to hr_engine;

-- ── 9. Self-verification ─────────────────────────────────────────────────
do $$
declare v_bad int; v_fn text;
begin
  if to_regclass('public.market_listings') is null then raise exception 'market_listings missing'; end if;
  if to_regclass('public.market_sales')    is null then raise exception 'market_sales missing';    end if;

  -- (a) The structural holes from schema.sql must all be gone.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('market_listings','market_sales','hr_market_config')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception '% client write policies on market tables — the RPCs must be the only writers', v_bad;
  end if;

  -- (b) …and no client write GRANT either, TRUNCATE included. (Review S14.)
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('market_listings','market_sales','hr_market_config','market_price_history')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on market tables', v_bad; end if;

  -- (c) market_sales must not be world-readable: it carries two auth UUIDs.
  --     (Review S17.)
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='market_sales'
                and cmd='SELECT' and coalesce(qual,'') = 'true') then
    raise exception 'market_sales is world-readable — it publishes buyer and seller UUIDs';
  end if;
  if not has_table_privilege('anon', 'public.market_price_history', 'select') then
    raise exception 'the names-free price view is not readable by anon — the chart will be empty';
  end if;
  if has_table_privilege('anon', 'public.market_sales', 'select') then
    raise exception 'anon can read market_sales directly';
  end if;

  -- (d) market_sales must have no `collected` column: its existence would mean
  --     the collect-and-PATCH model came back.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='market_sales' and column_name='collected') then
    raise exception 'market_sales.collected is back — the seller is paid at sale time now';
  end if;

  -- (e) NO market/hr function defined here may be anon-executable, and
  --     market_expire must not be player-callable at all. (Review S6/S7.)
  foreach v_fn in array array['market_list','market_cancel','market_buy','market_expire',
                              'hr_display_name_of','hr_intent_claim','hr_intent_record'] loop
    select count(*) into v_bad
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
       and has_function_privilege('anon', p.oid, 'execute');
    if v_bad > 0 then raise exception 'function %() is anon-executable', v_fn; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.market_expire(int)', 'execute') then
    raise exception 'market_expire is player-callable — it is an unauthenticated write amplifier';
  end if;
  if has_function_privilege('authenticated', 'public.hr_display_name_of(uuid)', 'execute') then
    raise exception 'hr_display_name_of is player-callable — free name enumeration';
  end if;

  -- (f) The tradeable allowlist is live and actually excludes something.
  if (select count(*) from public.hr_items where not tradeable) = 0 then
    raise exception 'no untradeable items in the catalogue — the bop allowlist is vacuous';
  end if;

  -- (g) max_qty has a ceiling, so `qty * ask_each` cannot be made to overflow
  --     by editing a config row.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_market_config'::regclass
                    and conname = 'hr_market_config_max_qty_ceiling') then
    raise exception 'hr_market_config.max_qty has no upper bound';
  end if;

  raise notice 'MARKET v2 OK — escrow is real, the seller is paid at sale time, sales are private, no client writes.';
end $$;
