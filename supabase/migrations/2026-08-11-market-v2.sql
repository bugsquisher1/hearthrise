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
  -- to_regprocEDURE: to_regproc does not parse an argument list and returns
  -- NULL for an ambiguous name, so the to_regproc form was NULL always. See the
  -- long note in 2026-08-11-player-state.sql §0.
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron is required — §8b of this file replaces a live cron job that would otherwise destroy escrowed goods';
  end if;
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regprocedure('public.hr_cron_drop(text)') is null then
    raise exception 're-run 2026-08-11-player-state.sql (revision 3) — §8b needs the idempotent cron helpers';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 're-run 2026-08-11-player-state.sql (revision 4) — the market RPCs record their rejections';
  end if;
  if to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null then
    raise exception 're-run 2026-08-11-player-state.sql (revision 4) — the rate-limit log sampler is missing (review S6)';
  end if;
end $$;

-- ── 0c. DISARM THE ESCROW-DESTROYING CRON JOBS — FIRST, BEFORE §1 ────────
-- ⚠⚠ THIS BLOCK MUST STAY AHEAD OF §1. READ WHY BEFORE MOVING IT. ⚠⚠
--
-- A live pg_cron job, `trim-expired-listings`, runs nightly at 03:30:
--
--     delete from public.market_listings where expires_at < now()
--
-- Under market v1 that was harmless housekeeping: a listing was a POINTER, the
-- goods stayed in the seller's client-side inventory, and deleting the row cost
-- nothing. Under market v2 A LISTING **IS** THE ESCROW — market_list DELETEs
-- the items out of player_inventory and the listing row is the only record that
-- they exist. That statement deletes the row directly, bypassing
-- market_expire(), and therefore ANNIHILATES THE SELLER'S GOODS.
--
-- AND THE MIGRATION IS WHAT ARMS IT. Verified on production 2026-08-11:
-- market_listings has NO `expires_at` column today, so the job has been FAILING
-- every night since 2026-08-09 ("ERROR: column expires_at does not exist").
-- §1 of this file ADDS `expires_at`, which REPAIRS the broken destructive job
-- and points it at the escrow.
--
-- ORDERING (review C-c). Revision 3 did the unschedule in §8b, ~650 lines and
-- one `create table` after `expires_at` came into existence. Every transactional
-- apply is fine. A NON-transactional apply — psql without `-1`, a tool that
-- splits on `;`, an apply that dies halfway, a re-run resumed by hand — leaves a
-- window in which the column exists and the job is still scheduled. If that
-- window straddles 03:30, the job runs and the escrow is gone. The dependency
-- was documented in a 25-line comment; documenting an ordering dependency is
-- strictly worse than not having one, so it is deleted instead: the disarm
-- happens before the arming, always, and the two facts can no longer be
-- separated by a crash.
--
-- The REPLACEMENT jobs stay in §8b, because they reference functions that do
-- not exist yet at this point in the file. Disarming early and rearming late is
-- the safe order in both directions: the window created by that split is a
-- window with NO expiry job, which costs a listing a few extra minutes in limbo
-- and destroys nothing.
do $$
declare v_dropped boolean; v_armed int;
begin
  -- THE ORDERING ASSERTION. Not "the end state is right" (§9(h) already checks
  -- that) — this asserts the ORDER, at the only moment the order is observable:
  -- a bare `delete from market_listings` job must never coexist with an
  -- expires_at column on that table. On a first apply the column does not exist
  -- yet, so this passes. On a re-apply the jobs are already gone, so this
  -- passes. It fails exactly when someone has moved this block below §1.
  select count(*) into v_armed
    from cron.job
   where command ~* 'delete\s+from\s+(public\.)?market_listings'
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'market_listings'
                    and column_name = 'expires_at');
  if v_armed > 0 then
    raise exception
      'ORDERING VIOLATION: % cron job(s) DELETE from market_listings directly while an expires_at '
      'column exists on that table. Under market v2 that job destroys escrowed goods at its next '
      'run. This disarm block MUST execute before §1 creates the table. Do not move it.', v_armed;
  end if;

  -- 1. REMOVE THE DESTRUCTIVE JOB. Not "fix its SQL" — delete it. The correct
  --    behaviour is not a delete at all; it is market_expire(), which returns
  --    the escrow, bumps the seller's version and journals the return. §8b
  --    schedules that replacement.
  v_dropped := public.hr_cron_drop('trim-expired-listings');
  if v_dropped then
    raise warning 'unscheduled trim-expired-listings — it would have DESTROYED escrowed goods under market v2';
  end if;

  -- 2. Job 4, `trim-market-sales`, is the same shape in a milder form: it
  --    filters on `sold_at`, a column that does not exist (it is `created_at`
  --    today and `at` after this file), so it has been erroring nightly too.
  --    It is dropped here rather than in §8b purely so that the two cron
  --    mutations stay together and neither can be half-applied.
  v_dropped := public.hr_cron_drop('trim-market-sales');
  if v_dropped then
    raise warning 'unscheduled trim-market-sales — it filtered on sold_at, which has never existed on this table';
  end if;

  -- A marker §9 can assert on, so deleting this block fails the migration
  -- instead of silently removing the interlock. Session-scoped; it does not
  -- outlive the apply, which is the point — it proves THIS run did the disarm.
  perform set_config('hearthrise.market_cron_disarmed', 'yes', false);
end $$;

-- ── 0b. THE WIPE GATE — a prose comment is not a safety interlock ────────
-- (Reliability RL6.) The next two statements DROP … CASCADE two live tables.
-- Revision 2's only protection was a paragraph at the top of the file asking
-- the reader not to run it on a database whose market matters. Every
-- destructive migration that has ever gone wrong was run by someone who did not
-- read that paragraph, or who read it three files ago.
--
-- So the drops now REFUSE unless either the tables are empty or the operator
-- has said, in the same session, that a wipe is intended:
--
--     set hearthrise.market_wipe_ok = 'yes';
--     \i supabase/migrations/2026-08-11-market-v2.sql
--
-- Production 2026-08-11, re-counted: market_listings **1** row, market_sales 6
-- rows. (An earlier revision of this comment said 0 listings; a player posted
-- one between the two audits. Stating a live row count in a comment is a
-- promise that expires — the GUC gate is what actually protects the data, and
-- it reads the counts at apply time.) So this gate FIRES on production, which
-- is the correct behaviour and is how we know it works. The beta wipe at
-- cutover is exactly the moment the GUC is appropriate.
--
-- ⚠ RE-RUNNABILITY DEPENDS ON THE DROPS. The `create table` statements below
--   are NOT `if not exists`; the drops are what make this file safe to re-run.
--   If you ever remove them you must add `if not exists` to both creates in the
--   same edit, or the second run fails on an existing relation. The two facts
--   are coupled and are stated here together on purpose.
--
-- CASCADE dependents are enumerated before the drop rather than discovered
-- afterwards: `cascade` silently removes views and foreign keys that this file
-- does not recreate. Verified on production 2026-08-11: zero dependents.
do $$
declare v_l bigint := 0; v_s bigint := 0; v_dep text;
begin
  if to_regclass('public.market_listings') is not null then
    execute 'select count(*) from public.market_listings' into v_l;
  end if;
  if to_regclass('public.market_sales') is not null then
    execute 'select count(*) from public.market_sales' into v_s;
  end if;

  select string_agg(distinct c.relname, ', ') into v_dep
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class c on c.oid = r.ev_class
   where d.refobjid in (coalesce(to_regclass('public.market_listings'), 0::oid),
                        coalesce(to_regclass('public.market_sales'), 0::oid))
     and c.relname not in ('market_listings','market_sales');
  if v_dep is not null then
    raise warning 'CASCADE will also drop these dependents, which this file does NOT recreate: %', v_dep;
  end if;

  if (v_l > 0 or v_s > 0)
     and coalesce(current_setting('hearthrise.market_wipe_ok', true), '') <> 'yes' then
    raise exception
      'REFUSING TO WIPE THE MARKET: % listing row(s) and % sale row(s) would be destroyed by this migration. '
      'It drops and recreates market_listings/market_sales — there is no in-place upgrade path. '
      'If that is intended (the beta wipe at cutover), run  set hearthrise.market_wipe_ok = ''yes'';  '
      'in the SAME session first.', v_l, v_s;
  end if;
  if v_l > 0 or v_s > 0 then
    raise warning 'market_wipe_ok is set — destroying % listing row(s) and % sale row(s)', v_l, v_s;
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
  -- (N3) Same race as hr_apply's claim: the PK is user-global, the advisory
  -- lock is per slot. A concurrent claim of the same key is "already in
  -- flight", not a 500.
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (p_user, p_intent_id, coalesce(p_slot, 0), p_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    prior := jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    return;
  end if;
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

-- ── 4c. THE LOCK ORDER, stated once for the whole file ───────────────────
-- (Review R6 and R7.) Revision 2 had three functions taking the same four
-- resources in three different orders. None of them was exploitable — the
-- per-character advisory lock mutually excludes the pairs that could otherwise
-- cycle — but "not exploitable today because of a property in another
-- function" is how deadlocks arrive later, and hr_apply states an order that
-- market_cancel then inverted. One order, obeyed everywhere:
--
--   1. the ACTING character's advisory lock   pg_advisory_xact_lock(user:slot)
--   2. the market_listings row                select … for update
--   3. player_state rows                      ascending (user_id, slot)
--   4. player_inventory / player_equipment rows
--
-- hr_apply takes 3 then 4 and never touches 2, so it is consistent by
-- construction. The one wrinkle is market_cancel: the advisory key depends on
-- seller_slot, which lives on the listing — so it reads the listing UNLOCKED to
-- derive the key, takes the lock, and then re-reads FOR UPDATE and re-validates
-- everything. That is safe because seller_user_id and seller_slot are immutable
-- after insert: no statement in this file ever updates them. The unlocked read
-- is used for ROUTING only; every decision is made under the lock.

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
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_list') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_list', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),                 -- (C2)
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_list') - 60));  -- (S6)
    end if;
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

    -- Bounded: the question is "at the cap?", not "how many exactly?".
    select count(*) into v_open from (
      select 1 from public.market_listings
       where seller_user_id = v_uid and seller_slot = v_slot
       limit v_cfg.max_listings) s;
    if v_open >= v_cfg.max_listings then
      perform public.hr_reject('too_many_listings', jsonb_build_object('limit', v_cfg.max_listings));
    end if;

    -- LOCK ORDER step 3 before step 4 (review R7). player_state is taken first
    -- even though only its `version` changes, so that this function agrees with
    -- hr_apply and with market_buy about the order these two tables are locked
    -- in. Revision 2 took the inventory row first.
    perform 1 from public.player_state
      where user_id = v_uid and slot = v_slot for update;

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
  -- Outside the protected block, so a rejection leaves a durable trace after
  -- player_intents is pruned (review R4). Aggregated per character/code/day.
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, 'market_list',
                                       v_out->>'error', v_out - 'ok' - 'error');
  end if;
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
    -- slot 0: cancel takes no slot argument and the listing has not been read
    -- yet. The character is identified by user; the slot is cosmetic here. (C2)
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_cancel') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, 0, 'market_cancel', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_cancel') - 60));  -- (S6)
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ROUTING READ, unlocked (see §4c). seller_user_id and seller_slot are
  -- immutable after insert, so this is only used to derive the advisory key and
  -- to fail fast; everything is re-read and re-checked under the lock below.
  select * into v_row from public.market_listings where id = p_listing_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.seller_user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  -- LOCK ORDER step 1, then step 2 (review R6/R7).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_row.seller_slot::text, 0));

  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.seller_user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  select prior, claimed into v_prior, v_claimed
    from public.hr_intent_claim(v_uid, p_intent_id, v_row.seller_slot, 'market_cancel');
  if not v_claimed then return v_prior || jsonb_build_object('replayed', true); end if;

  begin
    delete from public.market_listings where id = p_listing_id;

    -- LOCK ORDER step 3 before step 4 (review R7). Revision 2 wrote the
    -- inventory row and only then locked player_state, inverting hr_apply's
    -- order. Not exploitable — the advisory lock above mutually excludes the
    -- only other writers of this character — but a stated invariant that one
    -- of three functions ignores is not an invariant.
    select bank_cap into v_cap from public.player_state
      where user_id = v_uid and slot = v_row.seller_slot for update;

    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

    -- The returning stack can push the seller over the bank cap. Revision 1 let
    -- it, quietly making the cap advisory for anyone who listed at cap.
    select count(*) into v_stacks from (
      select 1 from public.player_inventory
       where user_id = v_uid and slot = v_row.seller_slot
       limit coalesce(v_cap, 100) + 1) s;
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
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_row.seller_slot, 'market_cancel',
                                       v_out->>'error', v_out - 'ok' - 'error');
  end if;
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
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_buy') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),                -- (C2)
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'market_buy') - 60));  -- (S6)
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;

  select * into v_cfg from public.hr_market_config;

  -- (0) THE BUYER'S ADVISORY LOCK, FIRST (review R6). Revision 2 had none, so
  --     the idempotency claim below — a read of player_intents followed by an
  --     insert — sat outside any mutual exclusion. Two simultaneous retries of
  --     the SAME intent id could both see "not found"; one insert wins on the
  --     primary key and the other raises unique_violation, which nothing in
  --     market_buy catches, so a duplicate-delivery retry surfaced as a 500
  --     instead of the stored answer. market_list and market_cancel already
  --     took this lock. This also makes the file's lock order uniform (§4c).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- (1) The listing, under the buyer's lock.
  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.expires_at <= now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if v_row.seller_user_id = v_uid then
    -- (S9) JOURNAL IT. Buying your own listing is refused, but until now it was
    -- refused SILENTLY, and repeated `own_listing` is the wash-trading
    -- signature: someone establishing a fake price history, or probing whether
    -- the self-trade guard can be raced into paying the tax to themselves. A
    -- refusal that leaves no trace is a refusal nobody can investigate.
    -- Aggregated per (character, code, day) and escalated to 'incident' past
    -- the daily threshold — one row per player per day, not one per click.
    perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'own_listing',
      jsonb_build_object('listing', p_listing_id, 'item', v_row.item_id,
                         'qty', p_qty, 'ask_each', v_row.ask_each));
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;
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

    -- (N2) The guard used to stop at the gross and forget the step AFTER it.
    -- `v_gross * house_tax_bp` is a bigint multiply: at the documented max_qty
    -- ceiling of 1e8 and max ask of 1e9, 1e8 × 1e9 × 150 = 1.5e19 blows past
    -- bigint's 9.223e18 with a 22003 — an unhandled 500 for the BUYER, raised
    -- before the affordability check, so any seller could craft a listing that
    -- 500s everyone who touches it. Unreachable at the default max_qty of 1e6;
    -- reachable inside the ceiling the config allows, which is what matters.
    -- Two independent fixes: the tax is computed in numeric (arbitrary
    -- precision — the multiply cannot overflow at all, and trunc() keeps the
    -- integer-division rounding the bigint form had), and the guard now covers
    -- the whole expression so an absurd listing is a clean 'overflow'
    -- rejection instead of an exception.
    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;
    if v_gross_n > 9.0e18
       or v_gross_n * greatest(coalesce(v_cfg.house_tax_bp, 0), 1)::numeric > 9.0e18 then
      perform public.hr_reject('overflow');
    end if;
    v_gross := v_gross_n::bigint;
    v_tax   := trunc(v_gross_n * v_cfg.house_tax_bp::numeric / 10000)::bigint;  -- the gold sink
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

    select count(*) into v_stacks from (
      select 1 from public.player_inventory
       where user_id = v_uid and slot = v_slot
       limit coalesce(v_cap, 100) + 1) s;
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
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, 'market_buy',
                                       v_out->>'error', v_out - 'ok' - 'error');
  end if;
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
-- Now: cron/engine only, and the batch is capped at 200. It is SCHEDULED in
-- §8b of this same file — not left as a suggestion in a comment, which is what
-- revision 2 did and which is the whole subject of §8b.
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

-- ── 8a. market_sales retention ───────────────────────────────────────────
-- (Reliability RL3.) The receipt table is append-only in intent but is a
-- straightforward growth table in practice: one row per trade, forever. Unlike
-- player_ledger it carries no immutability trigger, so retention is a plain
-- delete — but the policy still has to SHIP HERE, with the table, or it does
-- not exist. 180 days is well past the 30-day window market_price_history
-- reads, so pruning can never empty the public price chart.
create or replace function public.market_sales_prune(p_older interval default interval '180 days')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.market_sales
   where at < now() - greatest(interval '31 days', coalesce(p_older, interval '180 days'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.market_sales_prune(interval)
  from public, anon, authenticated, service_role;

-- ── 8b. THE CRON REPLACEMENTS ────────────────────────────────────────────
-- The DANGEROUS half of the cron reconciliation — unscheduling the two jobs
-- that would destroy escrow — is in §0c, deliberately ahead of §1. See the
-- long note there; do not move it back here. What is left is the rearm, which
-- has to be here because it references functions defined above.
do $$
begin
  -- 1. THE REPLACEMENT FOR trim-expired-listings. Every 5 minutes, batched at
  --    200. Frequent because an expired listing is a player's property sitting
  --    in limbo, and nightly is a 24-hour worst case for getting it back.
  perform public.hr_cron_ensure('hr-market-expire', '*/5 * * * *',
    'select public.market_expire(200)');

  -- 2. THE REPLACEMENT FOR trim-market-sales: names a column that exists and
  --    goes through the function that owns the policy.
  perform public.hr_cron_ensure('hr-market-sales-prune', '45 3 * * *',
    'select public.market_sales_prune()');
end $$;

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
                              'market_sales_prune','hr_display_name_of',
                              'hr_intent_claim','hr_intent_record'] loop
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

  -- (h) THE CRON RECONCILIATION HELD. (Review R1/R2.) This is the assertion
  --     that makes §0c/§8b load-bearing rather than decorative: if anyone
  --     deletes those sections, or re-creates the old job by hand, or the
  --     unschedule silently no-ops, the migration fails here instead of the
  --     players finding out when their escrow evaporates at 03:30.
  --
  --     (h-0) …AND THE ORDER HELD (review C-c). The end-state checks below
  --     cannot tell "disarmed before the column existed" from "disarmed 650
  --     lines after it did", and only the first is safe under a
  --     non-transactional apply. §0c sets this marker; if it is missing, the
  --     disarm either did not run or was moved.
  if coalesce(current_setting('hearthrise.market_cron_disarmed', true), '') <> 'yes' then
    raise exception
      'the §0c cron disarm did not run in this session. It must execute BEFORE §1 creates '
      'market_listings.expires_at, otherwise a non-transactional apply leaves the nightly '
      '"delete from market_listings" job armed against live escrow. Do not "fix" this by '
      'setting the GUC by hand — restore §0c.';
  end if;
  if exists (select 1 from cron.job where jobname = 'trim-expired-listings') then
    raise exception 'trim-expired-listings is STILL SCHEDULED — it deletes market_listings rows directly, which under v2 destroys the seller''s escrowed goods';
  end if;
  if exists (select 1 from cron.job where jobname = 'trim-market-sales') then
    raise exception 'trim-market-sales is still scheduled — it filters on a column that does not exist';
  end if;
  -- ...and no OTHER job may issue a bare delete against the escrow table
  -- either. Catches the same mistake arriving under a different name.
  select count(*) into v_bad from cron.job
   where command ~* 'delete\s+from\s+(public\.)?market_listings';
  if v_bad > 0 then
    raise exception '% cron job(s) DELETE from market_listings directly — escrow must only be released by market_expire()', v_bad;
  end if;
  foreach v_fn in array array['hr-market-expire','hr-market-sales-prune'] loop
    if not exists (select 1 from cron.job where jobname = v_fn and active) then
      raise exception 'job % is not scheduled — expiry/retention must ship with the table', v_fn;
    end if;
  end loop;

  -- (i) THE hr_engine CAPABILITY LIST — MOVED OUT OF THIS FILE (review S9).
  --
  --     It used to be an inline check here, and it was three defects at once:
  --       • it lives in an UNAPPLIED migration, so it has never once executed —
  --         a pin that does not run is a comment;
  --       • it matched on `p.proname`, so a NEW OVERLOAD of an approved name
  --         passed silently;
  --       • it filtered `p.prokind = 'f'`, so a PROCEDURE was invisible to it —
  --         defect D1 from 2026-08-11-grant-hygiene.sql, reproduced.
  --
  --     The pin now lives in `hr_assert_grant_hygiene()` (check 7), keyed on
  --     `oid::regprocedure::text` with no prokind filter and with a one-line
  --     justification per entry, and it runs at every migration AND nightly via
  --     pg_cron. This file now DELEGATES, which also means the list has exactly
  --     one home. Adding an eighth/tenth entry still fails a migration rather
  --     than passing a review — just a different migration.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene(boolean) is missing — apply '
                    '2026-08-11-grant-hygiene.sql first; without it NOTHING pins '
                    'hr_engine''s EXECUTE surface or its table privileges (S9)';
  end if;
  --     This file DOES widen the client surface — market_list / market_cancel /
  --     market_buy are new `authenticated` RPCs — and the detector is
  --     differential against hr_client_rpc_baseline, so it would (correctly)
  --     report all three as unapproved. Widening is meant to be a DELIBERATE
  --     act that prints its own diff, which is exactly what
  --     hr_grant_baseline_sync is: it records the three, names why, and the
  --     assertion that follows then covers everything else.
  perform public.hr_grant_baseline_sync(
    'market v2 (2026-08-11): market_list / market_cancel / market_buy become '
    || 'client-callable; escrow is a real DELETE from player_inventory and all '
    || 'three are reviewed in this file''s §4-§7');
  perform public.hr_assert_grant_hygiene(true);

  raise notice 'MARKET v2 OK — escrow is real, the seller is paid at sale time, sales are private, no client writes, and the escrow-destroying cron job is gone.';
end $$;
