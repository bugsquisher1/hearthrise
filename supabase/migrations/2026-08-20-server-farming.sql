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

  -- A9 RATE GATE. A client-callable SECURITY DEFINER money RPC with no gate is a
  -- free denial-of-service against the whole project. The bucket lives in
  -- hr_rpc_gate's `case` (2026-08-23-bounty.sql, its current last toucher —
  -- writes → 60/min); an unknown bucket fails CLOSED, so this and the case-arm
  -- ship together. Placed after the idempotency short-circuit so a legitimate
  -- retry of an already-applied intent is never rate-limited into a false 429.
  if not public.hr_rpc_gate('farm_plant') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

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
  -- Debit exactly one seed. When it was the LAST one, DELETE the row rather than
  -- writing qty=0: player_inventory enforces `check (qty > 0)` ("a zero row is
  -- deleted, never stored"), so a naive `set qty = qty - 1` VIOLATES the
  -- constraint and aborts the whole plant — and planting your last seed of a
  -- crop is the common case. (Found by §7's functional self-check, F5.)
  update public.player_inventory set qty = qty - 1
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item and qty > 1;
  if not found then
    delete from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  end if;

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
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public;
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from anon;
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

  -- A9 RATE GATE (see hr_farm_plant's note). Writes → 60/min; unknown bucket
  -- fails closed, so the bucket is added to hr_rpc_gate's case in the same change.
  if not public.hr_rpc_gate('farm_harvest') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

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
revoke execute on function public.hr_farm_harvest(int, int, uuid) from public;
revoke execute on function public.hr_farm_harvest(int, int, uuid) from anon;
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

-- ── 6. CLIENT-RPC BASELINE — record the two grants (F2) ───────────────────
-- Both RPCs are granted to `authenticated`. hr_assert_grant_hygiene check (2)
-- treats any client-granted RPC absent from hr_client_rpc_baseline as
-- `unapproved_client_rpcs` and RAISES — so without this the nightly pg_cron
-- `hr-grant-hygiene` job fails and every later migration's own strict
-- hygiene gate aborts on apply. The row is a standing statement that the client
-- MAY call it; deliberately NOT granted to hr_engine (§6b re-asserts that).
do $$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline absent — apply 2026-08-11-grant-hygiene.sql first';
  end if;
  if to_regproc('public.hr_farm_plant') is null or to_regproc('public.hr_farm_harvest') is null then
    raise exception 'farm RPCs absent — §3/§4 did not install';
  end if;

  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'server-farming slice 1: the player owns their own plots. Version-bumping, '
         'seed-debit / yield-credit / farming-XP server-derived, day-budget clamped, '
         'rate-gated (farm_plant / farm_harvest). Deliberately NOT granted to hr_engine. 2026-08-20'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_farm_plant','hr_farm_harvest')
     and p.pronargs > 0
     and not exists (
       select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'hr_client_rpc_baseline: % row(s) recorded for the farm RPCs', v_n;
end $$;

-- ── 6b. HYGIENE COMMIT GATE — the DETECTOR itself, strict form (F2) ───────
-- The same call the nightly pg_cron job makes. Runs AFTER §6 so the two new
-- grants are already recorded; a regression (a farm RPC left ungated, or the
-- engine granted the write) aborts the apply here.
do $$
declare v_report jsonb;
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise notice 'hr_assert_grant_hygiene absent — skipping strict gate';
    return;
  end if;
  v_report := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_report->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene still reports unapproved client RPCs: %',
      v_report->'unapproved_client_rpcs';
  end if;
  if jsonb_array_length(coalesce(v_report->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene reports ungated client RPCs: %',
      v_report->'ungated_client_rpcs';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_farm_plant(int,int,text,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_farm_harvest(int,int,uuid)', 'execute') then
    raise exception 'hr_engine can execute a farm RPC — the engine must never plant/harvest for a player';
  end if;
  raise notice 'FARM BASELINE OK — hygiene clean in strict form, engine still refused.';
end $$;

-- ── 7. FUNCTIONAL SELF-CHECK — the happy path is PROVEN, not asserted (F5) ─
-- §5 proves the grants/policy/yield-band shape; this EXECUTES the RPCs end to
-- end so the load-bearing behaviour is real: hr_seed reachability from the
-- definer, readiness math against the server clock, the seeded yield roll, the
-- seed debit / produce+XP credit, day-budget integration, and idempotent
-- replay. It doubles as the regression guard the suite otherwise lacks. The
-- row-writing probes live in an HR819-discarded subtransaction (player_ledger's
-- retention trigger refuses to DELETE a fresh row, so the subtxn rollback is the
-- only clean teardown — the goal-reward / muster-raid §8 pattern).
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000fa-0000-0000-0000-0000000000fa';
  v_slot constant int  := 0;
  v_plot constant int  := 3;
  v_idem_plant   constant uuid := '000000fa-0000-0000-0000-000000000001';
  v_idem_harvest constant uuid := '000000fa-0000-0000-0000-000000000002';
  v_idem_empty   constant uuid := '000000fa-0000-0000-0000-000000000003';
  v_qty  bigint; v_xp bigint;
  v_seed_left bigint; v_prod bigint; v_skill_xp bigint;
  v_led  int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 1000, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0;
    -- one turnip seed (turnip: req_lv 1, base_hours 4, yield 2..4, xp 112, no regrow)
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, 'turnip_seed', 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;

    -- PLANT — succeeds, debits the seed.
    v := public.hr_farm_plant(v_slot, v_plot, 'turnip', v_idem_plant);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(a): plant did not succeed: %', v;
    end if;
    select coalesce(qty,0) into v_seed_left from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = 'turnip_seed';
    if v_seed_left <> 0 then
      raise exception 'GATE(a): seed not debited (left %)', v_seed_left;
    end if;
    if not exists (select 1 from public.player_farm
                    where user_id = v_uid and slot = v_slot and plot_idx = v_plot and crop_id = 'turnip') then
      raise exception 'GATE(a): plot row not written';
    end if;

    -- HARVEST EARLY — refused, plot still growing (planted_at = now()).
    v := public.hr_farm_harvest(v_slot, v_plot, v_idem_harvest);
    if v->>'ok' <> 'false' or v->>'error' <> 'not_ready' then
      raise exception 'GATE(b): an unripe plot was harvested: %', v;
    end if;

    -- ADVANCE the server plant time past the growth window (5h > 4h).
    update public.player_farm set planted_at = now() - interval '5 hours'
      where user_id = v_uid and slot = v_slot and plot_idx = v_plot;

    -- HARVEST — credits produce + farming XP, empties the (non-regrow) plot.
    v := public.hr_farm_harvest(v_slot, v_plot, v_idem_harvest);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(c): ripe harvest did not credit: %', v;
    end if;
    v_qty := (v->>'qty')::bigint;
    v_xp  := (v->>'xp')::bigint;
    if v_qty < 2 or v_qty > 4 then
      raise exception 'GATE(c): yield % outside the turnip band [2,4]', v_qty;
    end if;
    if v_xp <> 112 * v_qty then
      raise exception 'GATE(c): xp % <> 112 * qty %', v_xp, v_qty;
    end if;
    select coalesce(qty,0) into v_prod from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = 'turnip';
    if v_prod <> v_qty then
      raise exception 'GATE(c): produce credited % but reported qty %', v_prod, v_qty;
    end if;
    select coalesce(xp,0) into v_skill_xp from public.player_skills
      where user_id = v_uid and slot = v_slot and skill_id = 'farming';
    if v_skill_xp <> v_xp then
      raise exception 'GATE(c): farming xp credited % but reported %', v_skill_xp, v_xp;
    end if;
    if exists (select 1 from public.player_farm
                where user_id = v_uid and slot = v_slot and plot_idx = v_plot) then
      raise exception 'GATE(c): non-regrow plot was not emptied';
    end if;

    -- REPLAY the same intent — identical result, NO double credit.
    v := public.hr_farm_harvest(v_slot, v_plot, v_idem_harvest);
    if v->>'ok' <> 'true' or (v->>'qty')::bigint <> v_qty then
      raise exception 'GATE(d): replay result diverged: %', v;
    end if;
    select coalesce(qty,0) into v_prod from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = 'turnip';
    if v_prod <> v_qty then
      raise exception 'GATE(d): replay RE-CREDITED produce (% <> %)', v_prod, v_qty;
    end if;
    select coalesce(xp,0) into v_skill_xp from public.player_skills
      where user_id = v_uid and slot = v_slot and skill_id = 'farming';
    if v_skill_xp <> v_xp then
      raise exception 'GATE(d): replay RE-CREDITED xp (% <> %)', v_skill_xp, v_xp;
    end if;

    -- A FRESH intent on the now-empty plot — refused (nothing planted).
    v := public.hr_farm_harvest(v_slot, v_plot, v_idem_empty);
    if v->>'ok' <> 'false' or v->>'error' <> 'empty_plot' then
      raise exception 'GATE(e): harvesting an empty plot was not refused: %', v;
    end if;

    -- exactly two farm ledger rows (one plant debit, one harvest credit).
    select count(*) into v_led from public.player_ledger
      where user_id = v_uid and kind = 'farm';
    if v_led <> 2 then
      raise exception 'GATE(f): expected 2 farm ledger rows, found %', v_led;
    end if;

    raise exception using errcode = 'HR819', message = 'server-farming §7 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_farm      where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §7 LEAKED a probe row';
  end if;

  raise notice 'server-farming: plant/harvest credit-once, readiness+yield band, replay-safe, empty-plot refused, ledger paired — all green';
end $$;
