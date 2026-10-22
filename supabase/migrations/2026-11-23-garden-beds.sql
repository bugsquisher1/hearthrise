-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE GARDEN IS THE FARM-BED ROOM (lane b-room-purpose,
-- game-designer, 2026-10-22). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §3; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Room purpose ruling (docs/planning/PRIORITY_BOARD.md Decisions, 2026-10-22):
-- every room does ONE thing a player can name. A home never grants XP or a
-- resource advantage (Master Design Reference §9); capacity bought with gold is
-- allowed (rulings v2 §2: "spend gold on capacity"). The Garden sells farm BEDS:
-- each rung lets every character of the account plant more crops at once.
-- The numbers live in src/data/perks.js (garden farmPlots 1..5) and reach SQL
-- through hr_room_perks (2026-11-23-room-purpose-room-perks.generated.sql);
-- nothing here restates them.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_farm_plot_cap(user, slot)  NEW, owner-only (no client grant): the plot
--       cap = (property tier + 1) * 2, as before, PLUS the Garden rung's
--       farmPlots. Both levels come from hr_unlock_levels, so the Garden is the
--       ACCOUNT's (one home per account, 2026-11-21-house-home.sql). A rung above
--       the catalogue reads as the top rung; no garden row reads as 0.
--   hr_farm_plant  RESTATED WHOLE (§0 pins the replayed image; its chain was four
--       anchored patches deep, tests/patch-chain-guard.mjs). The ONE change: the
--       cap line reads hr_farm_plot_cap. Every gate, debit, journal and the
--       intent cache are byte-for-byte the replayed body.
--   hr_daily_harvest_ready is untouched: it only asks "cap > 0", and the Garden
--   only ever ADDS beds.
--
-- ── EXPOSURE ─────────────────────────────────────────────────────────────────
-- A higher plot ceiling on a verb that already spends one seed per plant, under
-- the same rate gate and day-budget clamp. The absolute fuse c_max_plots (64) is
-- unchanged; the top of the ladder is 12 + 5 = 17. No grant, table or client RPC
-- moves. A forged client value cannot reach the cap: both inputs are server rows.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Restate hr_farm_plant with `v_plot_cap := (v_prop_tier + 1) * 2;` and drop
-- hr_farm_plot_cap. ORDER: after 2026-11-23-room-purpose-room-perks.generated.sql
-- (§0 fails closed without the garden rows). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- The replayed hr_farm_plant (2026-08-22 + modal-goal-claims §5 + 2026-09-03 +
-- 2026-09-07 + 2026-09-12 patches), whitespace-normalised pg_get_functiondef md5
-- measured on the replay 2026-10-22, or this file's own (marker GARDEN-BEDS).
do $mig$
declare v_def text; v_src text; v_n int;
begin
  if to_regprocedure('public.hr_farm_plant(int,int,text,uuid)') is null then
    raise exception 'PIN: hr_farm_plant(int, int, text, uuid) is missing'; end if;
  if to_regprocedure('public.hr_unlock_levels(uuid,int)') is null then
    raise exception 'PIN: hr_unlock_levels(uuid, int) is missing'; end if;
  select count(*) into v_n from public.hr_room_perks
   where room_id = 'garden' and jsonb_typeof(perks->'farmPlots') = 'number';
  if v_n < 1 then
    raise exception 'PIN: hr_room_perks has no garden farmPlots rows - apply 2026-11-23-room-purpose-room-perks.generated.sql first'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_farm_plant(int,int,text,uuid)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_farm_plant(int,int,text,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> 'ed3d20468ba9b19a8472888a9125f52f' and strpos(v_src, 'GARDEN-BEDS') = 0 then
    raise exception 'PIN: hr_farm_plant is neither the replayed image (ed3d2046...) nor this file''s (md5 %)', v_def; end if;
end $mig$;

-- ── §1 THE CAP ───────────────────────────────────────────────────────────────
create or replace function public.hr_farm_plot_cap(p_user uuid, p_slot int)
returns int language sql stable security definer set search_path = public as $$
  with lv as (
    select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int as tier,
           coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int as garden
      from public.hr_unlock_levels(p_user, p_slot)
  )
  select (lv.tier + 1) * 2
       + coalesce((select (rp.perks->>'farmPlots')::int
                     from public.hr_room_perks rp
                    where rp.room_id = 'garden'
                      and rp.level = least(lv.garden,
                            (select max(level) from public.hr_room_perks where room_id = 'garden'))), 0)
    from lv
$$;
revoke execute on function public.hr_farm_plot_cap(uuid, int) from public, anon, authenticated, service_role;

-- ── §2 hr_farm_plant, RESTATED WHOLE ─────────────────────────────────────────
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

  -- b461: the PLANT goal counter (src/core/goals.js daily shape). One plant
  -- per call, additive, state 'active', period = the UTC day planted. The
  -- quest modal's "Plant 5 crops" daily is verified against this row and
  -- nothing else. The LIFETIME twin below is what the client mirrors into
  -- G.stats.planted, which is what the panel grades against a day baseline.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'daily', 'ev:planted', 1, public.hr_utc_day_key(now()), 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

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
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-00006a4d3b01';
  v_crop public.hr_crops%rowtype;
  v_kind text; v_r jsonb; v_role text; v_src text;
  v_top int; v_g1 int;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_farm_plant(int,int,text,uuid)'::regprocedure;
  if strpos(v_src, 'hr_farm_plot_cap(v_uid, p_slot)') = 0 or strpos(v_src, '(v_prop_tier + 1) * 2') > 0 then
    raise exception 'VERIFY(a): hr_farm_plant does not read its cap from hr_farm_plot_cap'; end if;
  if strpos(v_src, 'hr_rpc_gate(''farm_plant'')') = 0 or strpos(v_src, 'hr_intent_replay(v_uid, p_slot, p_idem, ''farm_plant'')') = 0
     or strpos(v_src, '''insufficient_seed''') = 0 or strpos(v_src, '''plot_tier_locked''') = 0 or strpos(v_src, 'hr_day_budget_check') = 0
     or strpos(v_src, 'insert into public.player_intents') = 0 or strpos(v_src, '''farm_plant'', v_crop.seed_item') = 0 then
    raise exception 'VERIFY(a): a kept gate, debit or journal is missing from the restated hr_farm_plant'; end if;
  select (perks->>'farmPlots')::int into v_g1 from public.hr_room_perks where room_id = 'garden' and level = 1;
  select (perks->>'farmPlots')::int into v_top from public.hr_room_perks where room_id = 'garden'
   order by level desc limit 1;
  select progress_kind into v_kind from public.hr_unlocks where unlock_id = 'room:garden';
  if v_kind is null or v_g1 is null then raise exception 'VERIFY(b): room:garden is not in hr_unlocks / hr_room_perks'; end if;
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'garden-beds §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
      raise exception 'VERIFY(b): the probe characters were not made'; end if;
    select c.* into v_crop from public.hr_crops c join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
     where c.req_lv <= 1 and t.plot_tier <= (select plot_level from public.player_state where user_id = v_uid and slot = 0)
     order by c.crop_id limit 1;
    if v_crop.crop_id is null then raise exception 'VERIFY(b): no crop a fresh character may plant'; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, v_crop.seed_item, 10)
      on conflict (user_id, slot, item_id) do update set qty = 10;
    -- (b) no home, no Garden: cap 2, plot 1 plants, plot 2 is refused at the cap.
    if public.hr_farm_plot_cap(v_uid, 0) <> 2 then raise exception 'VERIFY(b): a fresh character''s cap is %', public.hr_farm_plot_cap(v_uid, 0); end if;
    v_r := public.hr_farm_plant(0, 1, v_crop.crop_id, gen_random_uuid());
    if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'VERIFY(b): plot 1 refused: %', v_r; end if;
    v_r := public.hr_farm_plant(0, 2, v_crop.crop_id, gen_random_uuid());
    if v_r->>'error' is distinct from 'plot_cap' or (v_r->>'cap')::int <> 2 then raise exception 'VERIFY(b): plot 2 without a Garden answered %', v_r; end if;
    -- (c) Garden rung 1 (on a sibling slot: the home is the account's): the bed opens on slot 0.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_uid, 1, v_kind, 'room:garden', 1, '', null, now());
    if public.hr_farm_plot_cap(v_uid, 0) <> 2 + v_g1 then raise exception 'VERIFY(c): Garden 1 cap is %', public.hr_farm_plot_cap(v_uid, 0); end if;
    v_r := public.hr_farm_plant(0, 2, v_crop.crop_id, gen_random_uuid());
    if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the Garden bed refused: %', v_r; end if;
    v_r := public.hr_farm_plant(0, 2 + v_g1, v_crop.crop_id, gen_random_uuid());
    if v_r->>'error' is distinct from 'plot_cap' then raise exception 'VERIFY(c): past the Garden''s beds answered %', v_r; end if;
    -- (d) the top rung pays the top of the ladder (hr_unlock_guard refuses any rung above it).
    update public.player_progress set value = (select max(level) from public.hr_room_perks where room_id = 'garden')
     where user_id = v_uid and slot = 1 and key = 'room:garden';
    if public.hr_farm_plot_cap(v_uid, 0) <> 2 + v_top then raise exception 'VERIFY(d): the top Garden rung pays % beds', public.hr_farm_plot_cap(v_uid, 0) - 2; end if;
    raise exception using errcode = 'HR892', message = 'garden-beds §3 complete - rolling back';
  exception when sqlstate 'HR892' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from public.player_farm where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid) then
    raise exception 'VERIFY(e): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_farm_plot_cap(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches hr_farm_plot_cap', v_role; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_farm_plant(integer,integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_farm_plant(integer,integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(e): hr_farm_plant''s grant moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'garden-beds: the plot cap is the property ladder plus the account Garden''s beds; owner-only helper; all green';
end $$;
