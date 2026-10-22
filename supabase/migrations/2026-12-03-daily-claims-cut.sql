-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SECOND OLD-CLIENT CUT: THE DAILY COUNTERS AND THE RAID /
-- WORLD-EVENT / CLAN-BOARD CLAIMS (lane c-cuts-1022b, backend-architect,
-- 2026-10-22). STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2),
-- one file via tools/apply-migration.mjs, never inside begin/commit, never
-- 00:00–00:10 UTC. It SHRINKS the surface Security reviews at the reopen gate
-- (three gold/gem faucets leave).
--
-- THE RULING (Tyler, 2026-10-22: "we were supposed to delete all that"): every
-- old-client system the rebuilt client cannot use comes out. KEPT by Tyler the
-- same day, as bases for later: the companion pets ("I'll probably add those in
-- later") and the premium daily login ("will be added later"). Grep of src/**
-- and supabase/functions/** at this file: nothing names a function dropped here.
--
-- §1 DROPPED  raid_claim, world_event_claim, clan_board_claim (authenticated,
--             gated) + their __ungated twins, and raid_claims (written and read
--             only by raid_claim__ungated). They paid gold, gems, XP and items
--             from screens the rebuilt client does not have. Their siblings
--             (raid_strike, world_event_*, clan_board_roll/_progress, clan_*)
--             are NOT touched: Tyler has not ruled on them.
-- §2 THE CLIENT SURFACE: the three claims' hr_client_rpc_baseline rows leave.
-- §3 THE DAILY COUNTERS: the engine stopped writing kind='daily' ev:* rows in
--    the same lane (src/core/goals.js; hr-accrue goal-period.js deleted). The
--    two server writers, hr_farm_harvest and hr_farm_plant, are RESTATED WHOLE
--    from the replayed pre-image (md5 pinned in §0) without their daily row;
--    nothing else in either body moves (the companion farm-yield term stays).
--    The existing ev:* daily rows are deleted (pure counters: no value, no
--    reader since 2026-12-02-old-rewards-cut.sql). The ONE kind='daily' family
--    left is the premium login claim's own clamp ('login'), which
--    hr_login_claim / hr_login_view own; hr_progress_prune still sweeps it.
--
-- KEPT: hr_apply's 'daily' kind in its progress allowlist (engine-only; nothing
-- sends one now, and the login claim's C2 door is shut by hr_login_claim_verify).
-- REVERSIBILITY: re-apply the files that created each body (tests/live-hash-
-- drift.baseline.json `touched_by`); raid_claims is a claim journal restorable
-- from its creating file.
-- ORDER: after 2026-12-02-old-rewards-cut.sql. EDGE: hr-accrue redeploys with
-- this lane (the engine stops the daily ops); an old engine against this
-- database still works (its daily ops are accepted and inert).
-- COST: nothing per call is added; every settle carries up to ~6 fewer progress
-- ops, so player_progress loses its fastest-growing row family.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ──────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_claim_quest(text,integer)') is not null then
    raise exception 'PRECONDITION: apply 2026-12-02-old-rewards-cut.sql first'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)');
  if v_md5 is distinct from '59d2d5cb5d7ed6a2e96abc555d942a7c' and v_md5 is distinct from 'fb6db7329115f89d44c9f154b3ad5e2d' then
    raise exception 'PIN: hr_farm_harvest is neither the pre-image nor this file''s - md5 %: restate from the new image', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_plant(integer,integer,text,uuid)');
  if v_md5 is distinct from '066ef52420b729471b12d070bdec1e2f' and v_md5 is distinct from '59858b6aa38a3e57b69ee5ce99b4a12e' then
    raise exception 'PIN: hr_farm_plant is neither the 2026-12-01-garden-beds image nor this file''s - md5 %: restate from the new image', v_md5; end if;
end $mig$;

-- ── §1 THE DROPS ───────────────────────────────────────────────────────────
drop function if exists public.raid_claim(text, uuid, text, integer);
drop function if exists public.raid_claim__ungated(text, uuid, text, integer);
drop table    if exists public.raid_claims;
drop function if exists public.world_event_claim(text, integer);
drop function if exists public.world_event_claim__ungated(text, integer);
drop function if exists public.clan_board_claim(uuid, text);
drop function if exists public.clan_board_claim__ungated(uuid, text);

-- ── §2 THE CLIENT SURFACE ──────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline
 where proname in ('raid_claim', 'world_event_claim', 'clan_board_claim');

-- ── §3 THE DAILY COUNTERS ──────────────────────────────────────────────────
delete from public.player_progress where kind = 'daily' and key like 'ev:%';

CREATE OR REPLACE FUNCTION public.hr_farm_harvest(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_withered boolean := false;
  v_regrew   boolean := false;
  v_new_count int;
  v_garden_lv int;
  v_scarecrow int;
  v_cached jsonb;
  v_budget jsonb;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('farm_harvest', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_harvest') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_harvest', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;

  select * into v_plot from public.player_farm
    where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- READINESS: server clock, WATERED growth model. Effective growth can never
  -- exceed 2x elapsed, so watering accelerates but cannot mint.
  v_grown_h := public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now());
  if v_grown_h < v_crop.base_hours then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', now() + make_interval(secs => (v_crop.base_hours - v_grown_h) * 3600)));
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
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
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

  -- THE LIFETIME HARVEST COUNT (the Bestiary/collection shape). The daily-kind
  -- twin left with the daily goals (2026-12-03-daily-claims-cut.sql).
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
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_plant(p_slot integer, p_plot_idx integer, p_crop text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_plot_cap  int;
begin
  if v_uid is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_plant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_plant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  if p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_plot'));
  end if;
  select * into v_crop from public.hr_crops where crop_id = p_crop;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;

  -- PLOT CAP (GARDEN-BEDS, 2026-11-23): the property ladder (tier+1)*2 plus the
  -- account Garden's farm beds, one reader (hr_farm_plot_cap). A fresh
  -- character has no property and no Garden -> cap 2.
  v_plot_cap := public.hr_farm_plot_cap(v_uid, p_slot);
  if p_plot_idx >= v_plot_cap then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_cap', 'cap', v_plot_cap));
  end if;

  -- Farming LEVEL gate, re-derived from server XP.
  select coalesce(xp, 0) into v_have from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farm_lv := public.hr_level_from_xp(coalesce(v_have, 0));
  if v_farm_lv < v_crop.req_lv then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv));
  end if;

  -- CROP PLOT-TIER gate. crop.plot_tier must be <= the character's plot_level.
  select plot_tier into v_crop_tier from public.hr_crop_plot_tier where crop_id = p_crop;
  if v_crop_tier is null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'crop_untiered'));
  end if;
  if v_crop_tier > v_state.plot_level then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_tier_locked',
      'need_plot_level', v_crop_tier, 'have_plot_level', v_state.plot_level));
  end if;

  if exists (select 1 from public.player_farm
              where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx and crop_id is not null) then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_occupied'));
  end if;

  -- Day-budget clamp on the plant XP (same ceiling the accrual engine answers to).
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, c_plant_xp::bigint, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  -- Debit exactly one seed; delete-if-last (player_inventory enforces qty > 0).
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = v_crop.seed_item;
  if coalesce(v_have, 0) < 1 then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item));
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

  -- (The daily-kind plant row left with the daily goals, 2026-12-03-daily-claims-cut.sql.)
  -- 2026-09-07: the LIFETIME twin. Mirrors hr_farm_harvest's stat/ev:harvest
  -- row exactly: kind 'stat', period_key '', additive, state 'active'. The
  -- client projects the stat rows into G.stats.planted and DAILY_GOAL_POOL's
  -- "plant" goal grades stats.planted minus a day-start baseline, so without
  -- this row the goal can never move however much the player plants.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:planted', 1, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

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
end $function$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED ─────────────────────────────────
do $mig$
declare
  v      jsonb;
  v_n    int;
  v_set  text;
  v_gone text;
begin
  -- (a) EVERY DROPPED OBJECT IS GONE, under any signature.
  foreach v_gone in array array['raid_claim', 'raid_claim__ungated', 'world_event_claim', 'world_event_claim__ungated',
                                'clan_board_claim', 'clan_board_claim__ungated'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = v_gone) then
      raise exception 'daily-claims-cut §4(a): % still exists', v_gone; end if;
  end loop;
  if to_regclass('public.raid_claims') is not null then
    raise exception 'daily-claims-cut §4(a): raid_claims remains'; end if;

  -- (b) THE CLIENT SURFACE NAMES NO MISSING FUNCTION.
  select count(*) into v_n from public.hr_client_rpc_baseline b
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = b.proname);
  if v_n <> 0 then raise exception 'daily-claims-cut §4(b): % baseline row(s) name a function that does not exist', v_n; end if;

  -- (c) ONLY THE PREMIUM LOGIN (and hr_apply's allowlist) STILL NAMES KIND 'daily'.
  select string_agg(p.proname, ',' order by p.proname) into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~ $re$'daily'$re$;
  if v_set is distinct from 'hr_apply,hr_login_claim,hr_login_view' then
    raise exception 'daily-claims-cut §4(c): kind ''daily'' is named by % (want hr_apply,hr_login_claim,hr_login_view)', v_set; end if;
  if exists (select 1 from public.player_progress where kind = 'daily' and key like 'ev:%') then
    raise exception 'daily-claims-cut §4(c): an ev:* daily counter row remains'; end if;
  -- The restated farm bodies keep their lifetime counters and their companion yield term.
  if (select prosrc from pg_proc where oid = to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)')) !~ $re$'stat', 'ev:harvest'$re$
     or (select prosrc from pg_proc where oid = to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)')) !~ 'companion_equipped'
     or (select prosrc from pg_proc where oid = to_regprocedure('public.hr_farm_plant(integer,integer,text,uuid)')) !~ $re$'stat', 'ev:planted'$re$ then
    raise exception 'daily-claims-cut §4(c) CONTROL: a restated farm body lost a kept line'; end if;

  -- (d) THE KEPT DOORS ARE STILL THERE (a cut that took a live or kept system is worse than none).
  if to_regprocedure('public.hr_login_claim(integer,uuid)') is null
     or to_regprocedure('public.hr_login_view(uuid,integer)') is null
     or to_regprocedure('public.hr_companion_equip(integer,text,boolean)') is null
     or to_regprocedure('public.hr_companion_grant(integer,text,text,uuid)') is null
     or to_regprocedure('public.raid_strike(uuid,text,text,bigint,bigint)') is null
     or to_regprocedure('public.world_event_join(text)') is null
     or to_regprocedure('public.clan_board_progress(uuid,text,integer)') is null
     or to_regprocedure('public.hr_farm_harvest_replant(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'daily-claims-cut §4(d): a kept door is missing'; end if;
  if not exists (select 1 from public.hr_unlocks where namespace = 'companion') then
    raise exception 'daily-claims-cut §4(d): the companion catalogue is gone (kept by Tyler 2026-10-22)'; end if;

  -- (e) GRANT HYGIENE IS CLEAN.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'daily-claims-cut §4(e): grant hygiene is red: %', v; end if;

  raise notice 'daily-claims-cut: the engine daily counters and the raid/world-event/clan-board claims cut; '
               'the companions, the premium login and every sibling door kept';
end $mig$;
