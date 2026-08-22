-- ============================================================
-- Hearthrise — migration 2026-08-22 · SERVER-SIDE FARMING (RECONCILED, COMPLETE)
--
-- Run ONCE. Idempotent, ADDITIVE ONLY. Verify on a Supabase branch / staging
-- before any production apply. DORMANT: no client flip ships with this — the
-- legacy.js farm writers stay client-authored until the FARM record arm flips
-- (post-wipe, by the Coordinator). This SQL changes NO live behaviour: the RPCs
-- are installed but the client does not yet call them.
--
-- ── WHAT THIS RECONCILES ───────────────────────────────────────────────────
-- Two prior slices each rewrote hr_farm_plant / hr_farm_harvest independently
-- (2026-08-20-server-farming.sql slice 1, then the harvest-model and the
-- plot-tier/yield slices in parallel worktrees). Applying both as-authored would
-- make the LAST `create or replace` win and silently drop the other slice's
-- gates. This file is the SINGLE last toucher of every farm RPC: each body below
-- carries EVERY gate from both slices, so nothing is lost regardless of order.
--
--   hr_farm_plant   — level gate + crop PLOT-TIER gate + PROPERTY plot cap
--                     (plot-tier slice) + 28-XP plant grant + waterings /
--                     regrow_count init (harvest-model slice).
--   hr_farm_harvest — WATERED readiness (hr_farm_growth_hours) + seeded base
--                     yield roll + flat farmYield PERK (plot-tier slice) +
--                     FINITE-PERENNIAL wither (harvest-model slice) + daily/quest
--                     harvest goal counters. Regrow over-pay is CLOSED.
--   hr_farm_water   — the 2h double-speed window + water XP (harvest-model).
--   hr_farm_upgrade_plot — deed-spend → plot_level (plot-tier slice).
--
-- PATTERN: unchanged from 2026-08-08-clan-seat.sql / 2026-08-20-server-farming
-- — server catalogue, server clock, idempotency (player_intents), per-call lock
-- (player_state FOR UPDATE), append-only journal (player_ledger kind='farm'),
-- rate gate, and NO client write policy on player_farm / player_state.
--
-- AWAY-1 UNTOUCHED: farming is a standalone RPC pair, NOT an accrual kind — it
-- adds ZERO code to the shared combat/accrual sim (computeAccrual), so the
-- away/live byte-parity test is untouched and no second away path is created.
-- Growth is wall-clock; readiness re-derives from the plot's own timestamp
-- against now(). Determinism preserved: the yield roll is a seeded hr_seed draw,
-- never Math.random.
--
-- DEPENDS ON (apply FIRST):
--   • 2026-08-20-server-farming.sql (slice 1 RPC pair + player_farm PK + yield cols)
--   • 2026-08-22-farm-catalogues.generated.sql (regrow_limit + tier/yield catalogues)
--   • player_state.companion_equipped (2026-08-20-companion-model.sql)
-- ============================================================

-- ── 0. Preconditions ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_farm') is null
     or to_regclass('public.hr_crops') is null
     or to_regclass('public.player_state') is null
     or to_regclass('public.player_skills') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_progress') is null
     or to_regclass('public.player_ledger') is null
     or to_regclass('public.player_intents') is null then
    raise exception 'core player/catalogue tables missing — run schema + slice 1 first';
  end if;
  if to_regprocedure('public.hr_farm_plant(int,int,text,uuid)') is null
     or to_regprocedure('public.hr_farm_harvest(int,int,uuid)') is null then
    raise exception 'slice 1 farm RPCs absent — apply 2026-08-20-server-farming.sql first';
  end if;
  if to_regclass('public.hr_crop_plot_tier') is null
     or to_regclass('public.hr_plot_tier') is null
     or to_regclass('public.hr_farm_yield_perk') is null then
    raise exception 'farm-gate catalogues absent — apply 2026-08-22-farm-catalogues.generated.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state'
                    and column_name='companion_equipped') then
    raise exception 'player_state.companion_equipped absent — apply 2026-08-20-companion-model.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='hr_crops' and column_name='regrow_limit') then
    raise exception 'hr_crops.regrow_limit absent — apply 2026-08-22-farm-catalogues.generated.sql first';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key absent';
  end if;
end $$;

-- ── 1. Column shape the model needs ──────────────────────────
-- player_state.plot_level: SERVER-owned plot level (1..MAX), written ONLY by
-- hr_farm_upgrade_plot. player_farm.regrow_count / waterings: the two per-plot
-- facts the finite-perennial wither and the watering window need.
alter table public.player_state add column if not exists plot_level int not null default 1;
do $$ begin
  alter table public.player_state add constraint player_state_plot_level_ck
    check (plot_level >= 1 and plot_level <= 5);
exception when duplicate_object then null; end $$;

alter table public.player_farm add column if not exists regrow_count int not null default 0;
alter table public.player_farm add column if not exists waterings timestamptz[] not null default '{}';
do $$ begin
  alter table public.player_farm add constraint player_farm_regrow_count_nonneg check (regrow_count >= 0);
exception when duplicate_object then null; end $$;

-- RLS: own-read only, NO client write policy. Re-assert idempotently.
alter table public.player_farm enable row level security;
drop policy if exists "player_farm own read" on public.player_farm;
create policy "player_farm own read" on public.player_farm for select
  using ((select auth.uid()) = user_id);

-- ── 2. hr_farm_growth_hours — the b220 growth model, ported to SQL ─────────
-- Byte-for-byte port of src/core/farm.js growthHours(). effective growth-hours =
-- elapsed + min(waterBonus, elapsed); each watering contributes up to 2h at 1x
-- extra. The min() is the HARD INVARIANT: whatever lands in waterings, effective
-- growth can never exceed 2x real elapsed. A future/NULL watering is skipped.
create or replace function public.hr_farm_growth_hours(
  p_planted timestamptz, p_waterings timestamptz[], p_now timestamptz)
returns numeric language plpgsql immutable set search_path = public as $$
declare
  c_window_h constant numeric := 2.0;
  c_rate     constant numeric := 2.0;
  v_elapsed  numeric;
  v_bonus    numeric := 0;
  v_w        timestamptz;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  if p_planted is null then return 0; end if;
  v_elapsed := extract(epoch from (p_now - p_planted)) / 3600.0;
  if not (v_elapsed > 0) then return 0; end if;
  if p_waterings is not null then
    foreach v_w in array p_waterings loop
      if v_w is null or v_w > p_now then continue; end if;
      v_start := greatest(v_w, p_planted);
      v_end   := least(v_w + make_interval(secs => c_window_h * 3600), p_now);
      if v_end > v_start then
        v_bonus := v_bonus + extract(epoch from (v_end - v_start)) / 3600.0 * (c_rate - 1);
      end if;
    end loop;
  end if;
  return v_elapsed + least(v_bonus, v_elapsed);
end $$;
revoke execute on function public.hr_farm_growth_hours(timestamptz, timestamptz[], timestamptz) from public, anon, authenticated, service_role;

-- ── 3. hr_farm_plant — level + plot-tier + property cap + plant XP + init ──
create or replace function public.hr_farm_plant(
  p_slot int, p_plot_idx int, p_crop text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_max_plots constant int := 64;   -- absolute array fuse; property cap is finer
  c_plant_xp  constant int := 28;   -- b226 client plant grant
  v_uid   uuid := auth.uid();
  v_crop  public.hr_crops%rowtype;
  v_state public.player_state%rowtype;
  v_farm_lv int;
  v_have  bigint;
  v_budget jsonb;
  v_cached jsonb;
  v_crop_tier int;
  v_prop_tier int;
  v_plot_cap  int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return jsonb_build_object('ok', false, 'error', 'bad_plot');
  end if;
  select * into v_crop from public.hr_crops where crop_id = p_crop;
  if v_crop.crop_id is null then return jsonb_build_object('ok', false, 'error', 'unknown_crop'); end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  -- PROPERTY PLOT CAP. propertyTier = MAX property:* unlock level via
  -- hr_unlock_levels (the same reader hr_perks_of uses). Ladder (tier+1)*2 =
  -- [2,4,6,8,10,12]; a fresh character has no property row → tier 0 → cap 2.
  select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int
    into v_prop_tier from public.hr_unlock_levels(v_uid, p_slot);
  v_plot_cap := (v_prop_tier + 1) * 2;
  if p_plot_idx >= v_plot_cap then
    return jsonb_build_object('ok', false, 'error', 'plot_cap', 'cap', v_plot_cap);
  end if;

  -- Farming LEVEL gate, re-derived from server XP.
  select coalesce(xp, 0) into v_have from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farm_lv := public.hr_level_from_xp(coalesce(v_have, 0));
  if v_farm_lv < v_crop.req_lv then
    return jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv);
  end if;

  -- CROP PLOT-TIER gate. crop.plot_tier must be <= the character's plot_level.
  select plot_tier into v_crop_tier from public.hr_crop_plot_tier where crop_id = p_crop;
  if v_crop_tier is null then
    return jsonb_build_object('ok', false, 'error', 'crop_untiered');
  end if;
  if v_crop_tier > v_state.plot_level then
    return jsonb_build_object('ok', false, 'error', 'plot_tier_locked',
      'need_plot_level', v_crop_tier, 'have_plot_level', v_state.plot_level);
  end if;

  if exists (select 1 from public.player_farm
              where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx and crop_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'plot_occupied');
  end if;

  -- Day-budget clamp on the plant XP (same ceiling the accrual engine answers to).
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, c_plant_xp::bigint, 0, 0);
  if v_budget is not null then
    return jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget);
  end if;

  -- Debit exactly one seed; delete-if-last (player_inventory enforces qty > 0).
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  if coalesce(v_have, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item);
  end if;
  update public.player_inventory set qty = qty - 1
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item and qty > 1;
  if not found then
    delete from public.player_inventory
      where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  end if;

  -- Fresh plant: DRY (waterings empty), NOT a regrow (regrow_count 0).
  insert into public.player_farm as f
      (user_id, slot, plot_idx, crop_id, planted_at, watered_at, waterings, regrow_count)
    values (v_uid, p_slot, p_plot_idx, p_crop, now(), null, '{}', 0)
    on conflict (user_id, slot, plot_idx)
      do update set crop_id = excluded.crop_id, planted_at = excluded.planted_at,
                    watered_at = null, waterings = '{}', regrow_count = 0;

  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', c_plant_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_plant', v_crop.seed_item, -1, 'farming', c_plant_xp, c_plant_xp,
            jsonb_build_object('crop', p_crop, 'plot', p_plot_idx));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', p_crop,
    'planted_at', now(), 'ready_at', now() + make_interval(secs => v_crop.base_hours * 3600),
    'seed_spent', v_crop.seed_item, 'plant_xp', c_plant_xp);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_plant', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public;
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from anon;
grant execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;

-- ── 4. hr_farm_water — open a 2h double-speed window, grant water XP ───────
create or replace function public.hr_farm_water(p_slot int, p_plot_idx int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_max_waterings constant int := 8;
  c_window_secs   constant numeric := 2 * 3600;
  v_uid    uuid := auth.uid();
  v_plot   public.player_farm%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_last   timestamptz;
  v_water_xp bigint;
  v_budget jsonb;
  v_cached jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_water') then
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

  if public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now()) >= v_crop.base_hours then
    return jsonb_build_object('ok', false, 'error', 'already_ready');
  end if;
  if coalesce(array_length(v_plot.waterings, 1), 0) >= c_max_waterings then
    return jsonb_build_object('ok', false, 'error', 'water_capped');
  end if;
  select max(w) into v_last from unnest(coalesce(v_plot.waterings, '{}'::timestamptz[])) as w;
  if v_last is not null and v_last + make_interval(secs => c_window_secs) > now() then
    return jsonb_build_object('ok', false, 'error', 'still_watered',
      'ready_at', v_last + make_interval(secs => c_window_secs));
  end if;

  v_water_xp := greatest(1, ceil(v_crop.xp::numeric / 4.0))::bigint;
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_water_xp, 0, 0);
  if v_budget is not null then
    return jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget);
  end if;

  update public.player_farm
    set waterings = array_append(waterings, now()), watered_at = now()
    where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;

  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_water_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_water', 'farming', v_water_xp, v_water_xp,
            jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'watered_at', now(), 'water_xp', v_water_xp,
    'window_closes', now() + make_interval(secs => c_window_secs));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_water', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_farm_water(int, int, uuid) from public;
revoke execute on function public.hr_farm_water(int, int, uuid) from anon;
grant execute on function public.hr_farm_water(int, int, uuid) to authenticated;

-- ── 5. hr_farm_harvest — watered readiness + base roll + farmYield perk +
--        finite-perennial wither + goal counters ──────────────────────────
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
  v_base   bigint;
  v_bonus  bigint;
  v_qty    bigint;
  v_xp     bigint;
  v_day    text;
  v_withered boolean := false;
  v_regrew   boolean := false;
  v_new_count int;
  v_garden_lv int;
  v_scarecrow int;
  v_cached jsonb;
  v_budget jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

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

  -- READINESS: server clock, WATERED growth model. Effective growth can never
  -- exceed 2x elapsed, so watering accelerates but cannot mint.
  v_grown_h := public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now());
  if v_grown_h < v_crop.base_hours then
    return jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', now() + make_interval(secs => (v_crop.base_hours - v_grown_h) * 3600));
  end if;

  -- SEEDED base yield roll, tied to this plant cycle (plant instant): a regrow /
  -- re-plant is a fresh roll, a harvest replay is identical. NOT Math.random.
  v_span := greatest(1, v_crop.yield_max - v_crop.yield_min + 1);
  v_seed := public.hr_seed(v_uid, p_slot,
    'farm_harvest:' || p_plot_idx::text || ':' || (extract(epoch from v_plot.planted_at))::bigint::text);
  v_base := v_crop.yield_min + ((v_seed % v_span) + v_span) % v_span;

  -- FLAT farmYield PERK from the SERVER-owned stack: Garden rung + Scarecrow
  -- count (player_progress via hr_unlock_levels) + equipped companion
  -- (player_state), priced from hr_farm_yield_perk. All whole crops → integer,
  -- no fraction to roll. Under-pay only (food buffs / doubleYield PROC deferred).
  select coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int,
         coalesce(max(level) filter (where unlock_id = 'plot:scarecrow'), 0)::int
    into v_garden_lv, v_scarecrow from public.hr_unlock_levels(v_uid, p_slot);
  v_bonus :=
      coalesce((select farm_yield from public.hr_farm_yield_perk
                 where perk_key = 'garden:' || greatest(0, v_garden_lv)::text), 0)
    + greatest(0, v_scarecrow)
        * coalesce((select farm_yield from public.hr_farm_yield_perk where perk_key = 'scarecrow'), 0)
    + coalesce((select farm_yield from public.hr_farm_yield_perk
                 where v_state.companion_equipped is not null
                   and perk_key = 'companion:' || v_state.companion_equipped), 0);

  v_qty := v_base + greatest(0, v_bonus);
  v_xp  := v_crop.xp::bigint * v_qty;

  -- Daily economy ceiling (NULL = within budget). Perk is inside the clamp.
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_xp, v_qty, 0);
  if v_budget is not null then
    return jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget);
  end if;

  insert into public.player_inventory as inv (user_id, slot, item_id, qty)
    values (v_uid, p_slot, v_crop.prod_item, v_qty)
    on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- FINITE-PERENNIAL WITHER. regrow_limit = regrows one seed buys;
  -- regrow_limit+1 total harvests. 0 = non-regrow / legacy infinite
  -- (unreachable on a regrowing crop — the catalogue self-check forbids it).
  if v_crop.regrows then
    v_new_count := v_plot.regrow_count + 1;
    if v_crop.regrow_limit > 0 and v_new_count > v_crop.regrow_limit then
      delete from public.player_farm
        where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
      v_withered := true;
    else
      update public.player_farm
        set planted_at = now(), watered_at = null, waterings = '{}', regrow_count = v_new_count
        where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
      v_regrew := true;
    end if;
  else
    delete from public.player_farm
      where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  end if;

  -- HARVEST GOAL COUNTERS (src/core/goals.js contract). Additive; state
  -- 'active', never 'claimed'. Daily period = the day harvested; quest counter
  -- is a lifetime count (period '').
  v_day := public.hr_utc_day_key(now());
  if v_day is not null and length(v_day) > 0 then
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, p_slot, 'daily', 'ev:harvest', v_qty, v_day, 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + excluded.value,
                      state = 'active', updated_at = now();
  end if;
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:harvest', v_qty, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, skill_id, xp, qty_in, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_harvest', v_crop.prod_item, v_qty, 'farming', v_xp,
            v_qty, v_xp, jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx,
                                            'base', v_base, 'perk', v_bonus,
                                            'regrew', v_regrew, 'withered', v_withered,
                                            'regrow_count', v_plot.regrow_count));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'produce', v_crop.prod_item, 'qty', v_qty, 'base', v_base, 'perk', v_bonus, 'xp', v_xp,
    'regrew', v_regrew, 'withered', v_withered,
    'regrows_left', case when v_crop.regrows and v_crop.regrow_limit > 0
                         then greatest(0, v_crop.regrow_limit - (v_plot.regrow_count + 1))
                         else null end);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_harvest', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_farm_harvest(int, int, uuid) from public;
revoke execute on function public.hr_farm_harvest(int, int, uuid) from anon;
grant execute on function public.hr_farm_harvest(int, int, uuid) to authenticated;

-- ── 6. hr_farm_upgrade_plot — spend deeds, raise plot_level ────────────────
-- Reuses the 'farm_plant' rate bucket (a low-frequency write).
create or replace function public.hr_farm_upgrade_plot(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_deed constant text := 'farm_deed';
  v_uid   uuid := auth.uid();
  v_state public.player_state%rowtype;
  v_next  int;
  v_cost  int;
  v_have  bigint;
  v_cached jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  v_next := v_state.plot_level + 1;
  select deed_cost into v_cost from public.hr_plot_tier where plot_level = v_next;
  if v_cost is null then
    return jsonb_build_object('ok', false, 'error', 'max_plot_level', 'plot_level', v_state.plot_level);
  end if;

  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = c_deed;
  if coalesce(v_have, 0) < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_deeds',
      'need', v_cost, 'have', coalesce(v_have, 0));
  end if;

  if v_cost > 0 then
    update public.player_inventory set qty = qty - v_cost
      where user_id = v_uid and slot = p_slot and item_id = c_deed and qty > v_cost;
    if not found then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = c_deed;
    end if;
  end if;

  update public.player_state set plot_level = v_next, version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, p_slot, 'farm', 'farm_upgrade_plot', c_deed, -v_cost,
            jsonb_build_object('plot_level', v_next));

  v_cached := jsonb_build_object('ok', true, 'plot_level', v_next, 'deeds_spent', v_cost);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_upgrade_plot', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_farm_upgrade_plot(int, uuid) from public;
revoke execute on function public.hr_farm_upgrade_plot(int, uuid) from anon;
grant execute on function public.hr_farm_upgrade_plot(int, uuid) to authenticated;

-- ── 7. hr_rpc_gate — add the farm_water bucket (writes → 60/min) ───────────
-- Restated whole (an unknown bucket fails CLOSED, so farm_water would 429
-- forever). Carries forward EVERY bucket present on the current last toucher
-- (2026-08-25-workers.sql); the only addition is 'farm_water' beside
-- 'farm_plant'/'farm_harvest' in the 60/min arm.
create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql security definer set search_path = 'public', 'pg_catalog' as $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle',
         -- server-farming plant/harvest (slice 1) + water (this file). Ordinary
         -- player writes; an unknown bucket fails closed so all three live here.
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_accept_bounty', 'hr_claim_bounty'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;
-- Re-state the lockdown on every restatement (repo convention; the lint enforces
-- it). hr_rpc_gate is called ONLY by SECURITY DEFINER RPCs — no role needs execute.
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 8. SELF-VERIFYING ASSERTIONS — load-bearing properties ────
do $$
declare v_bad int;
begin
  -- (a) No client WRITE policy on player_farm OR player_state.
  select count(*) into v_bad from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relname in ('player_farm','player_state') and pol.polcmd in ('a','w','d','*');
  if v_bad > 0 then raise exception 'player_farm/player_state has % client write policy(ies) — must be RPC-only', v_bad; end if;

  -- (b) Every farm RPC is NOT executable by public/anon.
  if has_function_privilege('public', 'public.hr_farm_plant(int,int,text,uuid)', 'execute')
     or has_function_privilege('public', 'public.hr_farm_harvest(int,int,uuid)', 'execute')
     or has_function_privilege('public', 'public.hr_farm_water(int,int,uuid)', 'execute')
     or has_function_privilege('public', 'public.hr_farm_upgrade_plot(int,uuid)', 'execute') then
    raise exception 'a farm RPC executable by PUBLIC — revoke failed';
  end if;
  if has_function_privilege('anon', 'public.hr_farm_plant(int,int,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_farm_harvest(int,int,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_farm_water(int,int,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_farm_upgrade_plot(int,uuid)', 'execute') then
    raise exception 'a farm RPC executable by anon — revoke failed';
  end if;

  -- (c) Every regrowing crop carries a FINITE regrow_limit (no infinite perennial).
  select count(*) into v_bad from public.hr_crops where regrows and regrow_limit <= 0;
  if v_bad > 0 then raise exception '% regrowing crop(s) have no finite regrow_limit — arming would revert b420/b428', v_bad; end if;

  -- (d) player_farm carries the per-plot facts; player_state carries plot_level.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_farm' and column_name='regrow_count')
     or not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_farm' and column_name='waterings')
     or not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='plot_level') then
    raise exception 'farm columns missing (regrow_count/waterings/plot_level)';
  end if;

  -- (e) The plot-tier / cost catalogues are populated and consistent.
  if (select count(*) from public.hr_plot_tier) < 1 then raise exception 'hr_plot_tier empty'; end if;
  select count(*) into v_bad from public.hr_crops k
    where not exists (select 1 from public.hr_crop_plot_tier t where t.crop_id = k.crop_id);
  if v_bad > 0 then raise exception '% hr_crops rows have no plot tier — the plant gate would refuse them', v_bad; end if;
end $$;

-- ── 9. CLIENT-RPC BASELINE — record the new grants (F2) ───────────────────
-- hr_farm_plant / hr_farm_harvest are baselined by slice 1. hr_farm_water and
-- hr_farm_upgrade_plot are new here; without a baseline row hr_assert_grant_hygiene
-- reports them as unapproved_client_rpcs and every later migration's gate aborts.
do $$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline absent — apply 2026-08-11-grant-hygiene.sql first';
  end if;
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'server-farming complete: player waters / upgrades their own plots. '
         'Version-bumping, server-derived XP + deed cost, day-budget clamped, '
         'rate-gated. Deliberately NOT granted to hr_engine. 2026-08-22'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_farm_water','hr_farm_upgrade_plot')
     and p.pronargs > 0
     and not exists (
       select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'hr_client_rpc_baseline: % row(s) recorded for hr_farm_water / hr_farm_upgrade_plot', v_n;
end $$;

-- ── 9b. HYGIENE COMMIT GATE — strict form ─────────────────────────────────
do $$
declare v_report jsonb;
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise notice 'hr_assert_grant_hygiene absent — skipping strict gate';
    return;
  end if;
  v_report := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_report->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene reports unapproved client RPCs: %', v_report->'unapproved_client_rpcs';
  end if;
  if jsonb_array_length(coalesce(v_report->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene reports ungated client RPCs: %', v_report->'ungated_client_rpcs';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_farm_water(int,int,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_farm_upgrade_plot(int,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_farm_plant(int,int,text,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_farm_harvest(int,int,uuid)', 'execute') then
    raise exception 'hr_engine can execute a farm RPC — the engine must never farm for a player';
  end if;
  raise notice 'FARM COMPLETE BASELINE OK — hygiene clean, engine refused.';
end $$;

-- ── 10. FUNCTIONAL SELF-CHECK — the model is PROVEN, not asserted ─────────
-- The whole cycle end to end in an HR819-discarded subtransaction: plot-tier +
-- property gates, plant (28 XP, dry), water (window + XP + accelerated growth),
-- deed upgrade, farmYield perk, finite-perennial wither, harvest goal counters,
-- idempotent replay. player_ledger's retention trigger refuses to DELETE a fresh
-- row, so the subtxn rollback is the only clean teardown.
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000fc-0000-0000-0000-0000000000fc';
  v_slot  constant int  := 0;
  v_plot  constant int  := 2;
  v_gh    numeric;
  v_cnt   int;
  v_lvl   int;
  v_perk  bigint;
  v_daily bigint; v_stat bigint; v_total bigint := 0;
  v_i     int;
  v_idem  uuid;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, plot_level)
      values (v_uid, v_slot, 1000, 0, 1, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 0, plot_level = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'farming', public.hr_xp_for_level(50))
      on conflict (user_id, slot, skill_id) do update set xp = public.hr_xp_for_level(50);
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, 'tomato_seed', 6), (v_uid, v_slot, 'turnip_seed', 2),
             (v_uid, v_slot, 'carrot_seed', 1), (v_uid, v_slot, 'farm_deed', 1)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;

    -- PROPERTY CAP: no property flag → tier 0 → cap 2; plot 2 refused.
    v := public.hr_farm_plant(v_slot, v_plot, 'tomato', gen_random_uuid());
    if v->>'ok' <> 'false' or v->>'error' <> 'plot_cap' then
      raise exception 'GATE(cap): plot 2 at property tier 0 (cap 2) not refused: %', v;
    end if;
    -- Grant property tier 2 (cap 6) so plot 2 is allowed.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key)
      values (v_uid, v_slot, 'unlock', 'property:farmstead', 2, '') on conflict do nothing;

    -- PLOT-TIER GATE: carrot (tier 2) refused at plot_level 1 (level gate passes first).
    v := public.hr_farm_plant(v_slot, 1, 'carrot', gen_random_uuid());
    if v->>'ok' <> 'false' or v->>'error' <> 'plot_tier_locked' then
      raise exception 'GATE(tier): carrot at plot_level 1 not refused: %', v;
    end if;

    -- DEED UPGRADE to plot_level 2 (1 deed).
    v := public.hr_farm_upgrade_plot(v_slot, gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' or (v->>'plot_level')::int <> 2 then
      raise exception 'GATE(deed): upgrade to level 2 failed: %', v;
    end if;

    -- PLANT tomato (tier 3? no — tomato plot_tier is 3). Re-check: tomato tier 3
    -- needs plot_level 3. At level 2 it is still locked; bump to level 3 first is
    -- costly. Instead prove the harvest cycle on turnip (tier 1). Plant turnip.
    v := public.hr_farm_plant(v_slot, v_plot, 'turnip', gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'PLANT turnip failed: %', v; end if;
    if (v->>'plant_xp')::int <> 28 then raise exception 'plant XP % <> 28', v->>'plant_xp'; end if;

    -- WATER — grants water XP (turnip xp 112 → ceil(112/4)=28), window opens.
    v := public.hr_farm_water(v_slot, v_plot, gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'WATER failed: %', v; end if;
    if (v->>'water_xp')::int <> 28 then raise exception 'water XP % <> 28', v->>'water_xp'; end if;
    -- immediate re-water refused.
    v := public.hr_farm_water(v_slot, v_plot, gen_random_uuid());
    if v->>'ok' <> 'false' or v->>'error' <> 'still_watered' then
      raise exception 'second water in-window not refused: %', v;
    end if;

    -- GROWTH MODEL: planted 1h ago + watering 1h ago → ~2h, never > 2x.
    update public.player_farm
      set planted_at = now() - interval '1 hour', waterings = array[now() - interval '1 hour']
      where user_id=v_uid and slot=v_slot and plot_idx=v_plot;
    select public.hr_farm_growth_hours(planted_at, waterings, now()) into v_gh
      from public.player_farm where user_id=v_uid and slot=v_slot and plot_idx=v_plot;
    if abs(v_gh - 2.0) > 0.05 then raise exception 'watered growth % <> ~2.0', v_gh; end if;

    -- farmYield PERK: give Garden rung 3 (+4) + one Scarecrow (+1) = +5.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key)
      values (v_uid, v_slot, 'unlock', 'room:garden', 3, ''),
             (v_uid, v_slot, 'stat', 'plot:scarecrow', 1, '')
      on conflict do nothing;
    update public.player_farm set planted_at = now() - interval '100 hours', waterings = '{}'
      where user_id=v_uid and slot=v_slot and plot_idx=v_plot;
    v := public.hr_farm_harvest(v_slot, v_plot, gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'HARVEST(perk) failed: %', v; end if;
    v_perk := (v->>'perk')::bigint;
    if v_perk <> 5 then raise exception 'farmYield perk % <> 5 (garden3 +4, scarecrow +1)', v_perk; end if;
    if (v->>'qty')::bigint <> (v->>'base')::bigint + 5 then
      raise exception 'qty %<>base+perk', v;
    end if;
    v_total := v_total + (v->>'qty')::bigint;
    -- turnip does not regrow → plot cleared.
    if exists (select 1 from public.player_farm where user_id=v_uid and slot=v_slot and plot_idx=v_plot) then
      raise exception 'non-regrow turnip plot not cleared';
    end if;

    -- FINITE PERENNIAL: plant tomato needs plot_level 3. Bump plot_level directly
    -- (server-owned column) to isolate the wither test, then harvest 5x: first 4
    -- regrow, the 5th withers. tomato: regrows, regrow_limit 4.
    update public.player_state set plot_level = 3 where user_id=v_uid and slot=v_slot;
    v := public.hr_farm_plant(v_slot, v_plot, 'tomato', gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'PLANT tomato failed: %', v; end if;
    for v_i in 1..5 loop
      update public.player_farm set planted_at = now() - interval '100 hours', waterings = '{}'
        where user_id=v_uid and slot=v_slot and plot_idx=v_plot;
      v_idem := gen_random_uuid();
      v := public.hr_farm_harvest(v_slot, v_plot, v_idem);
      if coalesce(v->>'ok','') <> 'true' then raise exception 'HARVEST % failed: %', v_i, v; end if;
      v_total := v_total + (v->>'qty')::bigint;
      if v_i <= 4 then
        if v->>'regrew' <> 'true' or v->>'withered' <> 'false' then
          raise exception 'harvest % should regrow: %', v_i, v;
        end if;
        select regrow_count into v_cnt from public.player_farm
          where user_id=v_uid and slot=v_slot and plot_idx=v_plot;
        if v_cnt <> v_i then raise exception 'regrow_count % <> %', v_cnt, v_i; end if;
        -- replay: no double credit, identical result.
        v := public.hr_farm_harvest(v_slot, v_plot, v_idem);
        if v->>'ok' <> 'true' then raise exception 'replay diverged: %', v; end if;
      else
        if v->>'withered' <> 'true' or v->>'regrew' <> 'false' then
          raise exception 'harvest 5 should wither: %', v;
        end if;
        if exists (select 1 from public.player_farm where user_id=v_uid and slot=v_slot and plot_idx=v_plot) then
          raise exception 'withered plot not cleared';
        end if;
      end if;
    end loop;

    -- HARVEST GOAL COUNTERS = total qty harvested (daily today + lifetime).
    select value into v_daily from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='daily' and key='ev:harvest'
        and period_key = public.hr_utc_day_key(now());
    select value into v_stat from public.player_progress
      where user_id=v_uid and slot=v_slot and kind='stat' and key='ev:harvest' and period_key='';
    if coalesce(v_daily,0) <> v_total then raise exception 'daily ev:harvest % <> total %', v_daily, v_total; end if;
    if coalesce(v_stat,0) <> v_total then raise exception 'stat ev:harvest % <> total %', v_stat, v_total; end if;

    raise exception using errcode = 'HR819', message = 'farming-complete §10 done — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_farm where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §10 LEAKED a probe row';
  end if;

  raise notice 'server-farming COMPLETE: tier/property gates, plant XP, watering, deed upgrade, farmYield perk, finite-perennial wither, harvest counters, replay-safe — all green';
end $$;
