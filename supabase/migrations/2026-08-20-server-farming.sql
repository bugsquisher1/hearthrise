-- ============================================================
-- Hearthrise — migration 2026-08-20 · SERVER-SIDE FARMING (slice 1)
--
-- Run ONCE. Idempotent, ADDITIVE ONLY. Verified on a Supabase branch before
-- any production apply; NOT registered on HR_APPLY_CHAIN because it does NOT
-- touch hr_apply, hr_state_of or the accrual engine (see WHY below).
--
-- Spec / scope: docs/design/server-authority.md + this migration's header.
-- Pattern copied from 2026-08-08-clan-seat.sql (clan_deposit): a server-side
-- catalogue, the server clock, per-call + per-day clamps, an append-only
-- journal, and NO client write policy on the state table.
--
-- ── WHY FARMING IS A STANDALONE RPC PAIR, NOT AN ACCRUAL-SIM KIND ──────────
-- Combat / gather / artisan are ACTION-COUNT activities: the accrual sim prices
-- [accrued_to, now()] tick by tick, and only one can be the "active activity".
-- Farming is different in kind: it is WALL-CLOCK GROWTH (src/core/farm.js) —
--     ready(plot) ⇔ now() >= planted_at + growth_hours(crop)
-- — it grows in PARALLEL to whatever the active activity is, and its payout is
-- a SINGLE DISCRETE EVENT at harvest, not a continuous credit. There is nothing
-- to "settle" per accrual pass: a plot owes nothing until it is harvested, and
-- the harvest re-derives readiness from the plot's own timestamp against now().
-- So farming plugs in as a plant/harvest RPC pair (this file) that never enters
-- computeAccrual — which is why AWAY-1 (the combat away/live byte-parity test)
-- is untouched: farming adds ZERO code to the shared sim, and there is exactly
-- ONE farming code path (this RPC), so there is no away-vs-live pair to diverge.
--
-- ── WHAT IS SERVER-AUTHORITATIVE HERE ─────────────────────────────────────
--   crop identity, growth timing, READINESS, the yield band, per-unit XP, the
--   seed debit, the yield credit, the farming-XP grant — all re-derived from
--   hr_crops (a generated catalogue) and the server clock. The client sends an
--   INTENT ("plant turnip in plot 3", "harvest plot 3"); it computes no number.
--
-- ── DEFERRED (flagged, not half-built) ────────────────────────────────────
--   • WATERING / 2x window — v1 grows at the base rate only. The server holds a
--     single `watered_at`; the client model (farm.js) allows up to 8 waterings.
--     Modelling water is a follow-up; omitting it UNDER-credits growth speed and
--     never over-credits, so it is safe to ship without.
--   • The `farmYield` flat perk bonus — needs the server perk stack; v1 pays the
--     base [yield_min, yield_max] band only (under-pay direction).
--   • Plot-tier crop gates (PLOT_TIERS) and the property plot cap — v1 gates on
--     farming level (req_lv) only. Tier gating is a bounded follow-up once the
--     plot-level ownership row is server-read.
--   • Client wiring (the plant/harvest gesture → RPC, display reconciliation) is
--     the Systems Engineer's; this migration ships the server contract only.
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_farm') is null
     or to_regclass('public.hr_crops') is null
     or to_regclass('public.player_state') is null
     or to_regclass('public.player_skills') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_ledger') is null
     or to_regclass('public.player_intents') is null then
    raise exception 'core player/catalogue tables missing — run schema.sql + player-state migrations first';
  end if;
end $$;

-- ── 1. Catalogue columns the harvest needs (generator-agreed) ─
-- These MUST match tools/gen-catalogues.mjs' hr_crops definition byte-for-byte;
-- the generator fills the VALUES, this ALTER makes the columns exist on a
-- database created by an older generator. Data is never written here — no
-- double-copy (CLAUDE.md: never duplicate game data into SQL).
alter table public.hr_crops add column if not exists yield_min int     not null default 1;
alter table public.hr_crops add column if not exists yield_max int     not null default 1;
alter table public.hr_crops add column if not exists xp        int     not null default 0;
alter table public.hr_crops add column if not exists regrows   boolean not null default false;

-- ── 2. player_farm shape: a PK for the upsert, and RLS lockdown ─
-- The table shipped with NO primary key. The plant upsert needs one, and its
-- absence would also let a bug insert two rows for one plot.
do $$ begin
  alter table public.player_farm add constraint player_farm_pkey
    primary key (user_id, slot, plot_idx);
exception when duplicate_table then null; when invalid_table_definition then null; end $$;

-- RLS: own-read only (already present), and NO client write policy. The RPCs
-- below (security definer) are the only writers — that is what makes every gate
-- real. Re-assert the read policy idempotently; never add insert/update/delete.
alter table public.player_farm enable row level security;
drop policy if exists "player_farm own read" on public.player_farm;
create policy "player_farm own read" on public.player_farm for select
  using ((select auth.uid()) = user_id);

-- ── 3. hr_farm_plant — record a crop + server plant time, debit the seed ─
-- The client sends {slot, plot_idx, crop_id, idempotency}. Everything priced is
-- server-derived: the seed id, the level gate and the plant instant (now()).
create or replace function public.hr_farm_plant(
  p_slot int, p_plot_idx int, p_crop text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_max_plots constant int := 64;               -- an absolute fuse; property cap is finer
  v_uid   uuid := auth.uid();
  v_crop  public.hr_crops%rowtype;
  v_state public.player_state%rowtype;
  v_farm_lv int;
  v_have  bigint;
  v_cached jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  -- Idempotency: a replayed intent returns its first result, never re-debits.
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

  if p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return jsonb_build_object('ok', false, 'error', 'bad_plot');
  end if;
  select * into v_crop from public.hr_crops where crop_id = p_crop;
  if v_crop.crop_id is null then return jsonb_build_object('ok', false, 'error', 'unknown_crop'); end if;

  -- LOCK the character row: serializes plant/harvest against each other and
  -- against the accrue verb (both take player_state for update), so version
  -- discipline holds across the network hop.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  -- Level gate, re-derived from server XP (farming level).
  select coalesce(xp, 0) into v_have from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farm_lv := public.hr_level_from_xp(coalesce(v_have, 0));
  if v_farm_lv < v_crop.req_lv then
    return jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv);
  end if;

  -- Plot must be empty (no double-plant over a growing crop).
  if exists (select 1 from public.player_farm
              where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx and crop_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'plot_occupied');
  end if;

  -- Debit the seed under the lock; refuse if not owned. Never trust the client.
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  if coalesce(v_have, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item);
  end if;
  update public.player_inventory set qty = qty - 1
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;

  insert into public.player_farm as f (user_id, slot, plot_idx, crop_id, planted_at, watered_at)
    values (v_uid, p_slot, p_plot_idx, p_crop, now(), null)
    on conflict (user_id, slot, plot_idx)
      do update set crop_id = excluded.crop_id, planted_at = excluded.planted_at, watered_at = null;

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, p_slot, 'farm', 'farm_plant', v_crop.seed_item, -1,
            jsonb_build_object('crop', p_crop, 'plot', p_plot_idx));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', p_crop,
    'planted_at', now(), 'ready_at', now() + make_interval(secs => v_crop.base_hours * 3600),
    'seed_spent', v_crop.seed_item);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_plant', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke all on function public.hr_farm_plant(int, int, text, uuid) from public;
revoke all on function public.hr_farm_plant(int, int, text, uuid) from anon;
grant execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;

-- ── 4. hr_farm_harvest — server checks readiness, rolls yield, credits ─
-- The yield is a SEEDED SERVER ROLL: hr_seed mixes a 256-bit server-only secret
-- with the plot+plant-time, so the roll is replayable for a dispute but not
-- precomputable by the player, and it is NOT Math.random. One draw per harvest.
create or replace function public.hr_farm_harvest(p_slot int, p_plot_idx int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_plot   public.player_farm%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_grown_h numeric;
  v_seed   bigint;
  v_span   int;
  v_qty    bigint;
  v_xp     bigint;
  v_cached jsonb;
  v_budget jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  select * into v_plot from public.player_farm
    where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return jsonb_build_object('ok', false, 'error', 'empty_plot'); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return jsonb_build_object('ok', false, 'error', 'unknown_crop'); end if;

  -- READINESS, server clock only. v1 = base growth (no water bonus; see header).
  v_grown_h := greatest(0, extract(epoch from (now() - v_plot.planted_at)) / 3600.0);
  if v_grown_h < v_crop.base_hours then
    return jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', v_plot.planted_at + make_interval(secs => v_crop.base_hours * 3600));
  end if;

  -- SEEDED YIELD ROLL. label ties the roll to this plant cycle so a re-plant is
  -- a fresh roll and a replay of the same harvest is identical. (v % n + n) % n
  -- keeps it non-negative for a bit(64)::bigint seed that may be negative.
  v_span := greatest(1, v_crop.yield_max - v_crop.yield_min + 1);
  v_seed := public.hr_seed(v_uid, p_slot,
    'farm_harvest:' || p_plot_idx::text || ':' || (extract(epoch from v_plot.planted_at))::bigint::text);
  v_qty := v_crop.yield_min + ((v_seed % v_span) + v_span) % v_span;
  v_xp  := v_crop.xp::bigint * v_qty;

  -- Daily economy ceiling: the same clamp the accrual engine answers to. A
  -- compromised harvest cannot exceed the day budget for qty/xp.
  -- ⚠ CONTRACT: hr_day_budget_check returns NULL when WITHIN budget, and a
  --   {dim,used,add,limit,day} violation object when OVER. It has NO 'ok' key —
  --   so the refuse test is `is not null`, never a truthiness read.
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_xp, v_qty, 0);
  if v_budget is not null then
    return jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget);
  end if;

  -- Credit the produce + farming XP under the lock.
  insert into public.player_inventory as inv (user_id, slot, item_id, qty)
    values (v_uid, p_slot, v_crop.prod_item, v_qty)
    on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- Regrow restarts the cycle DRY from now(); otherwise the plot empties.
  if v_crop.regrows then
    update public.player_farm set planted_at = now(), watered_at = null
      where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  else
    delete from public.player_farm
      where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  end if;

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, skill_id, xp, qty_in, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_harvest', v_crop.prod_item, v_qty, 'farming', v_xp,
            v_qty, v_xp, jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx,
                                            'regrew', v_crop.regrows));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'produce', v_crop.prod_item, 'qty', v_qty, 'xp', v_xp, 'regrew', v_crop.regrows);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_harvest', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke all on function public.hr_farm_harvest(int, int, uuid) from public;
revoke all on function public.hr_farm_harvest(int, int, uuid) from anon;
grant execute on function public.hr_farm_harvest(int, int, uuid) to authenticated;

-- ── 5. SELF-VERIFYING ASSERTIONS — load-bearing properties ────
do $$
declare v_bad int;
begin
  -- (a) No client WRITE policy on player_farm (read-only to its owner).
  select count(*) into v_bad from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relname = 'player_farm' and pol.polcmd in ('a','w','d','*');
  if v_bad > 0 then raise exception 'player_farm has % client write policy(ies) — must be RPC-only', v_bad; end if;

  -- (b) The privileged RPCs are NOT executable by anon/authenticated-at-large
  --     via PUBLIC. authenticated is granted explicitly; public/anon are not.
  if has_function_privilege('public', 'public.hr_farm_plant(int, int, text, uuid)', 'execute')
     or has_function_privilege('public', 'public.hr_farm_harvest(int, int, uuid)', 'execute') then
    raise exception 'farm RPC executable by PUBLIC — revoke failed';
  end if;
  if has_function_privilege('anon', 'public.hr_farm_plant(int, int, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_farm_harvest(int, int, uuid)', 'execute') then
    raise exception 'farm RPC executable by anon — revoke failed';
  end if;

  -- (c) The catalogue carries a usable yield band for every crop (no vacuous 0).
  select count(*) into v_bad from public.hr_crops where yield_max < yield_min or yield_min < 1;
  if v_bad > 0 then raise exception '% crop(s) have an invalid yield band', v_bad; end if;
end $$;
