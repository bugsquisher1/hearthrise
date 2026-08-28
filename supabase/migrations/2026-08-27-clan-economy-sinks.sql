-- ============================================================
-- Hearthrise — migration 2026-08-27 · CLAN ECONOMY SINKS + LEGACY BUY-LISTING KILL
--
-- Run ONCE in the Supabase SQL editor (Dashboard -> SQL -> New query), or via
-- the project's apply path. Wrapped/atomic on apply. Additive + idempotent:
-- every CREATE is `or replace`, every DROP is `if exists`, the one new table is
-- `create table if not exists`, and the seed is `on conflict do update`.
--
-- WHAT THIS CLOSES (three confirmed server economy holes, security sweep 2026-08-27)
--
--   FIX 1 (P1, live free mint) — clan_contribute
--     The pre-cutover body added p_amount to clans.treasury + clan_members.contributed
--     and cascaded the clan level-up, but NEVER debited the caller's server-owned
--     gold. Any member minted 10,000,000/day into the shared treasury and their own
--     contribution ranking for free. This migration makes contribution a GOLD SINK:
--     the caller's player_state.gold is locked and debited in the SAME transaction
--     that credits the treasury, journalled to player_ledger, conserving value the
--     way hr_market_buy does. The 10M/call + 10M/day clamps and the level cascade
--     are preserved verbatim.
--
--     ⚠⚠ DESIGN ASSUMPTION — READ BEFORE SHIPPING (Backend Architect, flag for Tyler):
--        Contribution is treated as a GOLD SINK: a member deposits GOLD into the
--        clan treasury, and treasury/contributed are DENOMINATED IN GOLD (which is
--        exactly what the level cascade `10000 * 4^(level-1)` already assumes, and
--        what a spendable treasury needs). If instead you want contribution to be a
--        FREE participation metric (a number that ranks effort without moving gold),
--        this is the WRONG fix — treasury/contributed would have to be re-denominated
--        into a non-gold unit and this debit removed. Everything below assumes the
--        gold-sink reading. If that is wrong, stop and re-scope.
--
--   FIX 2 (P2) — clan_feast_deposit
--     The pre-cutover body advanced clan_tavern.feast_meter from a client-supplied
--     `p_heals` integer with NO debit of the caller's food. Any member filled the
--     shared feast meter for free, and the client removed the item locally (the
--     forgeable half). This migration changes the contract to be item-authoritative:
--     the caller names an ITEM and a QTY, the heal value is read from a SERVER-side
--     food catalogue (hr_feast_foods, seeded from src/data/items.js, drift-guarded),
--     the items are debited from player_inventory under lock, and the meter advances
--     by the server-computed heals*qty. Refuses `insufficient_item` if the caller
--     does not hold the food. The per-call 600 clamp and the tavern cap are kept.
--
--       ⚠ SIGNATURE CHANGE: clan_feast_deposit(uuid,int)  ->  (uuid, text, int, int).
--         A correct server-authoritative debit is IMPOSSIBLE with the old signature,
--         because it never carried the item identity — the server cannot debit a food
--         it was never told about. The matching client change is staged in
--         src/features/clan-seat-ui.js. The clan UI is hard-gated off client-side
--         (CLAN_LAUNCHED=false) so nothing calls this today; this is latent hardening
--         so re-arming clans is safe. The client feature-detects a missing RPC.
--
--   FIX 3 (P2, latent griefing landmine) — buy_listing legacy RPC
--     buy_listing__ungated DELETEs a market_listings row and moves NO value
--     server-side (no gold debit/credit, no inventory grant). It is INERT ONLY
--     because its market_sales INSERT references dropped columns (seller_name /
--     gold_total) and rolls back with 42703. One migration re-adding those columns
--     silently reactivates a "destroy any seller's escrowed goods for free" hole.
--     hr_market_buy fully supersedes it. This migration REVOKEs and DROPs both
--     buy_listing and buy_listing__ungated, and the client's direct /rpc/buy_listing
--     fallback is removed (src/net/supabase-market-backend.js).
--
-- GRANT HYGIENE (Architectural law 3): every function recreated here has its
-- signature changed, so it is DROP+CREATEd, which resets it to PostgreSQL's default
-- PUBLIC execute grant. Each `__ungated` body is therefore explicitly REVOKEd from
-- public/anon/authenticated (only the rate-gated wrapper and the hr_engine/postgres
-- roles may reach it), and each wrapper is granted to `authenticated` only. The §9
-- self-check asserts this held.
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_ledger') is null then
    raise exception 'player_state/player_inventory/player_ledger missing — run 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.clan_tavern') is null then
    raise exception 'clan_tavern missing — run 2026-08-08-clan-seat.sql first';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- FIX 3 — kill the legacy buy_listing RPC.
-- Done FIRST because it is a pure removal with no dependencies.
-- Revoke before drop (Architectural law 3): the revoke is asserted below even
-- though the drop makes the function unreachable, so a future re-add lands into
-- a project whose intent (this is not client-callable) is on record.
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.buy_listing(uuid,int)') is not null then
    revoke execute on function public.buy_listing(uuid,int) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.buy_listing__ungated(uuid,int)') is not null then
    revoke execute on function public.buy_listing__ungated(uuid,int) from public, anon, authenticated;
  end if;
end $$;

drop function if exists public.buy_listing(uuid,int);
drop function if exists public.buy_listing__ungated(uuid,int);

-- ════════════════════════════════════════════════════════════
-- FIX 1 — clan_contribute becomes a gold sink.
-- Signature gains p_slot (which character pays): gold lives per (user_id, slot),
-- clan membership is per account. Defaulted to 0 so the current 2-arg gated call
-- still resolves (pays slot 0); the re-armed client passes the active slot.
-- ════════════════════════════════════════════════════════════
drop function if exists public.clan_contribute(uuid, bigint);
drop function if exists public.clan_contribute__ungated(uuid, bigint);

create or replace function public.clan_contribute__ungated(p_clan_id uuid, p_amount bigint, p_slot int default 0)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $function$
declare
  c_call_clamp constant bigint := 10000000;
  c_day_clamp  constant bigint := 10000000;
  v_uid      uuid := auth.uid();
  v_slot     int  := coalesce(p_slot, 0);
  v_spent    bigint;
  v_budget   bigint;
  v_amount   bigint;
  v_gold     bigint;
  v_treasury bigint;
  v_level    int;
  v_next     bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > c_call_clamp then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if not exists (select 1 from public.clan_members
                  where clan_id = p_clan_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  -- One advisory lock per (member, slot): serialises this member's day-budget
  -- read against their own concurrent contributions. Keyed on slot too so two
  -- characters of one account do not share a lock.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr:clan_contribute:' || v_uid::text || ':' || v_slot::text, 0));

  -- Per-member per-UTC-day budget, read from the append-only ledger (the same
  -- clamp discipline as clan_deposit / the market's transfer caps).
  select coalesce(sum(l.qty), 0) into v_spent
    from public.clan_ledger l
   where l.clan_id = p_clan_id and l.user_id = v_uid and l.kind = 'contribute'
     and l.at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');

  v_budget := greatest(0, c_day_clamp - v_spent);
  if v_budget <= 0 then
    return jsonb_build_object('ok', false, 'error', 'daily_cap',
      'spent_today', v_spent, 'day_cap', c_day_clamp);
  end if;
  v_amount := least(p_amount, v_budget);

  -- ── VALIDATE EVERYTHING BEFORE THE FIRST WRITE ──
  -- Lock the clan row first so a missing clan is refused with nothing debited
  -- (an early return AFTER a debit would destroy the caller's gold — the trade
  -- must be all-or-nothing, exactly like hr_market_buy).
  select treasury, level into v_treasury, v_level
    from public.clans where id = p_clan_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_clan');
  end if;

  -- Lock the payer's own gold and check funds against the SERVER's row — the
  -- check the old free-mint body never made because it had nothing to check.
  select gold into v_gold
    from public.player_state where user_id = v_uid and slot = v_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
  if v_gold < v_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'have', v_gold, 'need', v_amount);
  end if;

  -- ── APPLY (conserving): debit payer, credit treasury, journal both sides ──
  update public.player_state
     set gold = gold - v_amount, updated_at = now()
   where user_id = v_uid and slot = v_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, meta)
  values
    (v_uid, v_slot, 'clan', 'clan_contribute:' || p_clan_id::text,
     -v_amount,
     jsonb_build_object('clan_id', p_clan_id, 'transfer', true));

  update public.clans set treasury = treasury + v_amount
    where id = p_clan_id returning treasury, level into v_treasury, v_level;

  update public.clan_members set contributed = contributed + v_amount
    where clan_id = p_clan_id and user_id = v_uid;

  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, v_uid, 'contribute', v_amount);

  -- Level cascade preserved verbatim: 10000 * 4^(level-1).
  v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  while v_treasury >= v_next and v_level < 10 loop
    v_level := v_level + 1;
    update public.clans set level = v_level where id = p_clan_id;
    v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  end loop;

  return jsonb_build_object('ok', true,
    'treasury', v_treasury, 'level', v_level,
    'accepted', v_amount, 'requested', p_amount,
    'gold_spent', v_amount, 'gold_left', v_gold - v_amount,
    'spent_today', v_spent + v_amount, 'day_cap', c_day_clamp);
end $function$;

-- The rate-gated wrapper (same shape as the original), now carrying p_slot.
create or replace function public.clan_contribute(p_clan_id uuid, p_amount bigint, p_slot int default 0)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $function$
begin
  if not public.hr_rpc_gate('clan_contribute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.clan_contribute__ungated($1, $2, $3);
end $function$;

-- ════════════════════════════════════════════════════════════
-- FIX 2 — clan_feast_deposit consumes real cooked food.
-- ════════════════════════════════════════════════════════════

-- The server-side feast catalogue: which items the Tavern accepts and their
-- heal value. Seeded from src/data/items.js — every item with foodClass in
-- ('healing','buff') and heals > 0 (i.e. the cooked/prepared foods; raw fish and
-- crops carry `heals` but no foodClass and are NOT feast-eligible, matching the
-- "the Tavern takes cooked food only" design note). NEVER trust the client's
-- heal number: the meter must advance by THIS value, not one the client sends.
-- Kept in sync by tests/clan-feast-catalogue-drift.mjs, which imports items.js
-- and fails if this seed and the data diverge.
create table if not exists public.hr_feast_foods (
  item_id text primary key,
  heals   int  not null check (heals > 0)
);
alter table public.hr_feast_foods enable row level security;
drop policy if exists "feast foods readable" on public.hr_feast_foods;
create policy "feast foods readable" on public.hr_feast_foods for select using (true);

insert into public.hr_feast_foods (item_id, heals) values
  ('turnip_mash', 5),        ('cooked_shrimp', 8),      ('cooked_trout', 14),
  ('cooked_lobster', 25),    ('cooked_shark', 42),      ('cooked_herring', 6),
  ('cooked_frostfin', 28),   ('cooked_swordfish', 22),  ('cooked_moonfish', 38),
  ('goldenroot_roast', 26),  ('ember_tart', 30),        ('moonbloom_elixir', 40),
  ('baked_potato', 20),      ('pumpkin_pie', 35),       ('carrot_stew', 24),
  ('tomato_soup', 28),       ('wheat_bread', 18),       ('cooked_wolf_meat', 6),
  ('cooked_panther_meat', 9),('cooked_bear_meat', 13),  ('roasted_carrot', 5),
  ('roasted_pumpkin', 22),   ('vegetable_stew', 24),    ('bear_claw_pie', 32),
  ('hunters_feast', 35),     ('dragon_stew', 45),       ('lich_soul_soup', 50),
  ('void_banquet', 60)
on conflict (item_id) do update set heals = excluded.heals;

drop function if exists public.clan_feast_deposit(uuid, int);
drop function if exists public.clan_feast_deposit__ungated(uuid, int);

create or replace function public.clan_feast_deposit__ungated(p_clan_id uuid, p_item_id text, p_qty int, p_slot int default 0)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $function$
declare
  c_call_clamp constant int := 600;      -- heal-points per call (kept)
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_clan  public.clans%rowtype;
  v_lv    int;
  v_cap   int;
  v_heals int;
  v_room  int;
  v_maxq  int;
  v_qty   int;
  v_have  bigint;
  v_add   int;
  v_t     public.clan_tavern%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if p_item_id is null then return jsonb_build_object('ok', false, 'error', 'bad_item'); end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;

  -- The heal value is the SERVER's, from the catalogue — never the client's.
  select heals into v_heals from public.hr_feast_foods where item_id = p_item_id;
  if v_heals is null then
    return jsonb_build_object('ok', false, 'error', 'not_feast_food', 'item_id', p_item_id);
  end if;

  select * into v_clan from public.clans where id = p_clan_id;
  if v_clan.id is null then return jsonb_build_object('ok', false, 'error', 'no_clan'); end if;
  v_lv := coalesce(nullif(v_clan.upgrades->>'tavern','')::int, 0);
  if v_lv < 1 then return jsonb_build_object('ok', false, 'error', 'no_tavern'); end if;
  v_cap := 600 + 120 * least(10, v_lv);

  insert into public.clan_tavern (clan_id) values (p_clan_id) on conflict (clan_id) do nothing;

  -- Serialise the meter advance + the inventory debit for this (member, slot).
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr:clan_feast:' || v_uid::text || ':' || v_slot::text, 0));

  select * into v_t from public.clan_tavern where clan_id = p_clan_id for update;

  -- Meter room in heal-points, then the max WHOLE items that fit under both the
  -- per-call clamp and the remaining cap room.
  v_room := least(c_call_clamp, v_cap - v_t.feast_meter);
  v_maxq := floor(v_room::numeric / v_heals)::int;
  if v_maxq <= 0 then
    -- No whole item fits (meter full, or a single item's heals exceed the room).
    return jsonb_build_object('ok', true, 'meter', v_t.feast_meter, 'cap', v_cap,
      'added', 0, 'items_consumed', 0, 'full', v_t.feast_meter >= v_cap);
  end if;
  v_qty := least(p_qty, v_maxq);

  -- Debit the caller's own food under lock; refuse if they do not hold it.
  select qty into v_have from public.player_inventory
    where user_id = v_uid and slot = v_slot and item_id = p_item_id for update;
  if v_have is null or v_have <= 0 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_item',
      'item_id', p_item_id, 'have', coalesce(v_have, 0), 'need', v_qty);
  end if;
  v_qty := least(v_qty, v_have);
  if v_qty <= 0 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_item',
      'item_id', p_item_id, 'have', v_have, 'need', 1);
  end if;
  v_add := v_qty * v_heals;

  -- player_inventory has CHECK (qty > 0): decrement, or DELETE the emptied stack.
  if v_have = v_qty then
    delete from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = p_item_id;
  else
    update public.player_inventory set qty = qty - v_qty
      where user_id = v_uid and slot = v_slot and item_id = p_item_id;
  end if;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, meta)
  values
    (v_uid, v_slot, 'clan', 'clan_feast:' || p_clan_id::text, p_item_id, -v_qty,
     jsonb_build_object('clan_id', p_clan_id, 'heals', v_add, 'transfer', true));

  update public.clan_tavern set feast_meter = feast_meter + v_add
    where clan_id = p_clan_id returning * into v_t;
  update public.clan_members set last_seen = now()
    where clan_id = p_clan_id and user_id = v_uid;
  insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty)
    values (p_clan_id, v_uid, 'feast', p_item_id, v_add);

  return jsonb_build_object('ok', true, 'meter', v_t.feast_meter, 'cap', v_cap,
    'added', v_add, 'items_consumed', v_qty, 'item_id', p_item_id,
    'full', v_t.feast_meter >= v_cap);
end $function$;

create or replace function public.clan_feast_deposit(p_clan_id uuid, p_item_id text, p_qty int, p_slot int default 0)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $function$
begin
  if not public.hr_rpc_gate('clan_feast_deposit') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.clan_feast_deposit__ungated($1, $2, $3, $4);
end $function$;

-- ── Grant hygiene (Architectural law 3). DROP+CREATE reset PUBLIC execute; lock
--    the privileged bodies to the wrapper/definer only, expose the wrappers to
--    authenticated only. ────────────────────────────────────────────────────
revoke execute on function public.clan_contribute__ungated(uuid, bigint, int) from public, anon, authenticated;
revoke execute on function public.clan_feast_deposit__ungated(uuid, text, int, int) from public, anon, authenticated;

revoke execute on function public.clan_contribute(uuid, bigint, int) from public, anon;
revoke execute on function public.clan_feast_deposit(uuid, text, int, int) from public, anon;
grant  execute on function public.clan_contribute(uuid, bigint, int) to authenticated;
grant  execute on function public.clan_feast_deposit(uuid, text, int, int) to authenticated;

-- ── 9. Self-check — assert the load-bearing properties ───────
do $$
declare
  v_bad text := '';
begin
  -- FIX 3: the legacy buy path is gone.
  if to_regprocedure('public.buy_listing(uuid,int)') is not null then
    v_bad := v_bad || ' buy_listing still exists;';
  end if;
  if to_regprocedure('public.buy_listing__ungated(uuid,int)') is not null then
    v_bad := v_bad || ' buy_listing__ungated still exists;';
  end if;

  -- FIX 1/2: the new signatures exist.
  if to_regprocedure('public.clan_contribute(uuid,bigint,int)') is null then
    v_bad := v_bad || ' clan_contribute(uuid,bigint,int) missing;';
  end if;
  if to_regprocedure('public.clan_feast_deposit(uuid,text,int,int)') is null then
    v_bad := v_bad || ' clan_feast_deposit(uuid,text,int,int) missing;';
  end if;

  -- Grant hygiene: the privileged bodies are NOT client-executable, the wrappers ARE.
  if has_function_privilege('authenticated',
       'public.clan_contribute__ungated(uuid,bigint,int)', 'execute') then
    v_bad := v_bad || ' clan_contribute__ungated is authenticated-executable;';
  end if;
  if has_function_privilege('authenticated',
       'public.clan_feast_deposit__ungated(uuid,text,int,int)', 'execute') then
    v_bad := v_bad || ' clan_feast_deposit__ungated is authenticated-executable;';
  end if;
  if has_function_privilege('anon',
       'public.clan_contribute__ungated(uuid,bigint,int)', 'execute') then
    v_bad := v_bad || ' clan_contribute__ungated is anon-executable;';
  end if;
  if not has_function_privilege('authenticated',
       'public.clan_contribute(uuid,bigint,int)', 'execute') then
    v_bad := v_bad || ' clan_contribute wrapper not authenticated-executable;';
  end if;
  if not has_function_privilege('authenticated',
       'public.clan_feast_deposit(uuid,text,int,int)', 'execute') then
    v_bad := v_bad || ' clan_feast_deposit wrapper not authenticated-executable;';
  end if;

  -- The feast catalogue is read-only-to-all and non-empty, with no client writer.
  if (select count(*) from public.hr_feast_foods) = 0 then
    v_bad := v_bad || ' hr_feast_foods empty;';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='hr_feast_foods'
                and cmd <> 'SELECT') then
    v_bad := v_bad || ' hr_feast_foods has a non-SELECT policy;';
  end if;

  if v_bad <> '' then
    raise exception 'clan-economy-sinks self-check FAILED:%', v_bad;
  end if;
end $$;
