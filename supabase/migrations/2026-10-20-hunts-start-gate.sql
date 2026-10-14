-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNTS AS NAMED AREAS: THE START GATE AND THE SPAWN-AWARE VOID
-- Lane C1 (game designer spec, Tyler-approved). Depends on
-- 2026-10-20-hunts-catalogue.generated.sql (hr_hunts / hr_hunt_spawns).
--
-- THE POINTER. A hunt is `active_kind='combat', active_id=<hunt id>`. NOT a new
-- kind: every combat-keyed server rule (the recovery floor, the combat-XP
-- window clamp, the world-tick roster, settle-before-mutate, party guards,
-- hr_state_of's baseline) reads `active_kind = 'combat'`, and a new kind would
-- silently drop a hunt out of every one of them. Hunt ids are DISJOINT from
-- monster ids (generator + catalogue self-check), so a monster id remains the
-- one-spawn "training" hunt and prices exactly as before.
--
-- TWO ANCHORED EDITS TO hr_apply, nothing else in it moves:
--   (1) ACTIVITY: a combat id that is a named hunt is admitted iff the SERVER
--       combat level (hr_bounty_combat_level, from player_skills) reaches
--       band_min; refused `activity_locked` {id, combat_level, band_min}
--       otherwise. Any other id takes the unchanged hr_activities path.
--   (2) THE VOID: a carried fight survives on a hunt pointer only when its
--       monster is one of THAT hunt's spawns (hr_hunt_spawns). A training
--       pointer keeps the exact pre-C1 rule (monster = active_id).
--
-- RESTATEMENT-DEBT-ACK: hr_apply is a grandfathered patch chain and this adds two anchored edits (the hunt start gate and the spawn-aware fight void); restating the 175 kB money body in a content lane is the larger risk, and slice 7 owns the restatement.
--
-- Moves no value: no gold, item, XP or ranked counter is written here. Security
-- review is still required (it changes what hr_apply admits).
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE GATE BODY. Server-only: no role may execute it directly. ────────
create or replace function public.hr_hunt_gate(p_user uuid, p_slot int, p_hunt text)
returns void
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_min int;
  v_cl  int;
begin
  select band_min into v_min from public.hr_hunts where hunt_id = p_hunt;
  if v_min is null then
    perform public.hr_reject('unknown_activity', jsonb_build_object('kind', 'combat', 'id', p_hunt));
  end if;
  v_cl := coalesce(public.hr_bounty_combat_level(p_user, p_slot), 0);
  if v_cl < v_min then
    perform public.hr_reject('activity_locked',
      jsonb_build_object('id', p_hunt, 'combat_level', v_cl, 'band_min', v_min));
  end if;
  -- SECURITY C2: every spawn's OWN gate is asked too (defence in depth; the
  -- generator and the catalogue self-check refuse a gated spawn outright). A
  -- boss is never a spawn; a skill-gated monster needs its skill level.
  if exists (
    select 1 from public.hr_hunt_spawns s
      join public.hr_activities a on a.kind = 'combat' and a.activity_id = s.monster_id
     where s.hunt_id = p_hunt
       and (a.is_boss
            or (a.req_skill is not null and a.req_lv is not null
                and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps
                               where ps.user_id = p_user and ps.slot = p_slot
                                 and ps.skill_id = a.req_skill), 1) < a.req_lv)))
  then
    perform public.hr_reject('activity_locked', jsonb_build_object('id', p_hunt, 'spawn_gate', true));
  end if;
end $$;
revoke execute on function public.hr_hunt_gate(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §2 THE TWO ANCHORED EDITS ─────────────────────────────────────────────
do $mig$
declare
  v_def text;
  c_act constant text := $a$        if not exists (select 1 from public.hr_activities
                        where kind = v_act->>'kind' and activity_id = v_act->>'id') then$a$;
  c_void constant text := $v$       and (active_kind is distinct from 'combat'
            or active_id is distinct from (fight->>'monster'));$v$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_hunt_gate') > 0 then
    raise notice 'hr_apply already gates named hunts — patch skipped'; return; end if;
  if array_length(string_to_array(v_def, c_act), 1) <> 2 then
    raise exception 'hunts-start-gate: the activity anchor does not match exactly once'; end if;
  if array_length(string_to_array(v_def, c_void), 1) <> 2 then
    raise exception 'hunts-start-gate: the fight-void anchor does not match exactly once'; end if;
  v_def := replace(v_def, c_act, $add$        -- NAMED HUNT (2026-10-20-hunts-start-gate.sql): a combat id that is a hunt
        -- is admitted iff the SERVER combat level reaches its band floor.
        if v_act->>'kind' = 'combat'
           and exists (select 1 from public.hr_hunts h where h.hunt_id = v_act->>'id') then
          perform public.hr_hunt_gate(v_uid, v_slot, v_act->>'id');
        elsif not exists (select 1 from public.hr_activities
                        where kind = v_act->>'kind' and activity_id = v_act->>'id') then$add$);
  v_def := replace(v_def, c_void, $add$       and (active_kind is distinct from 'combat'
            or (active_id is distinct from (fight->>'monster')
                -- NAMED HUNT: the checkpoint may be on any of THIS hunt's spawns.
                and not exists (select 1 from public.hr_hunt_spawns hs
                                 where hs.hunt_id = player_state.active_id
                                   and hs.monster_id = player_state.fight->>'monster')));$add$);
  execute v_def;
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── §4 SELF-CHECK — executed, net zero ────────────────────────────────────
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000c1a1';
  v_r    jsonb;
  v_ver  bigint;
  v_role text;
  v_h    jsonb;
  v_xp   bigint;
  v_cl   int;
  c_j    constant jsonb := '{"intent":"set_activity"}'::jsonb;
begin
  -- (a) PRIVILEGES: the gate is callable by no client role, hr_apply by hr_engine only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_gate(uuid,int,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
      raise exception 'GATE(a): % can execute hr_hunt_gate or hr_apply', v_role; end if;
  end loop;
  if strpos(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), 'hr_hunt_gate') = 0
     or strpos(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), 'hr_hunt_spawns') = 0 then
    raise exception 'GATE(a): hr_apply carries neither the hunt gate nor the spawn-aware void'; end if;
  if not exists (select 1 from public.hr_hunts where band_min >= 15)
     or not exists (select 1 from public.hr_hunt_spawns where hunt_id = 'mill_cellar' and monster_id = 'slime')
     or exists (select 1 from public.hr_hunt_spawns where hunt_id = 'mill_cellar' and monster_id = 'goblin') then
    raise exception 'GATE CANNOT RUN: the catalogue fixture (ridge_camp >= 15, mill_cellar has slime, not goblin) moved'; end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HRC1A ──────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(b): no probe character: %', v_r; end if;
    v_cl := public.hr_bounty_combat_level(v_uid, 0);

    -- (b) BAND REFUSAL: a fresh character cannot start the 15+ hunt.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('activity',
             jsonb_build_object('kind', 'combat', 'id', 'ridge_camp', 'restart', true), 'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' or v_cl >= 15 then
      raise exception 'GATE(b): combat level % starting ridge_camp answered % — must be activity_locked', v_cl, v_r; end if;

    -- (c) AN UNKNOWN AREA is unknown_activity (the hr_activities path is intact).
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('activity',
             jsonb_build_object('kind', 'combat', 'id', 'not_a_hunt', 'restart', true), 'journal', c_j));
    if v_r->>'error' is distinct from 'unknown_activity' then
      raise exception 'GATE(c): not_a_hunt answered %', v_r; end if;

    -- (d) A BAND-0 HUNT STARTS and becomes the live combat pointer.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('activity',
             jsonb_build_object('kind', 'combat', 'id', 'mill_cellar', 'restart', true), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true'
       or (select active_kind || ':' || active_id from public.player_state where user_id = v_uid and slot = 0)
          is distinct from 'combat:mill_cellar' then
      raise exception 'GATE(d): starting mill_cellar answered % (pointer %)', v_r,
        (select active_kind || ':' || active_id from public.player_state where user_id = v_uid and slot = 0); end if;

    -- (d2) SECURITY C2: a spawn's OWN gate is asked. Gate slime behind Attack 99
    --      (inside this rolled-back subtransaction) and mill_cellar is refused.
    update public.hr_activities set req_skill = 'attack', req_lv = 99
     where kind = 'combat' and activity_id = 'slime';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('activity',
             jsonb_build_object('kind', 'combat', 'id', 'mill_cellar', 'restart', true), 'journal', c_j));
    if v_r->>'error' is distinct from 'activity_locked' then
      raise exception 'GATE(d2): a hunt with an Attack-99-gated spawn started at Attack 1: %', v_r; end if;
    update public.hr_activities set req_skill = null, req_lv = null
     where kind = 'combat' and activity_id = 'slime';

    -- (e) THE VOID, SPAWN-AWARE: a checkpoint on a spawn survives ...
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'fight', jsonb_build_object('monster', 'slime', 'hp', 3, 'kills', 0), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true'
       or (select fight->>'monster' from public.player_state where user_id = v_uid and slot = 0) is distinct from 'slime' then
      raise exception 'GATE(e): a slime checkpoint on mill_cellar did not survive: % (fight %)', v_r,
        (select fight from public.player_state where user_id = v_uid and slot = 0); end if;
    -- ... and one on a monster that is NOT in this hunt is voided.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'fight', jsonb_build_object('monster', 'goblin', 'hp', 3, 'kills', 0), 'journal', c_j));
    if (select fight from public.player_state where user_id = v_uid and slot = 0) <> '{}'::jsonb then
      raise exception 'GATE(e): a goblin checkpoint on mill_cellar was kept: %',
        (select fight from public.player_state where user_id = v_uid and slot = 0); end if;

    -- (f) TRAINING IS UNCHANGED: a monster pointer keeps only its own checkpoint.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('activity',
             jsonb_build_object('kind', 'combat', 'id', 'rat', 'restart', true), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(f): training rat answered %', v_r; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'fight', jsonb_build_object('monster', 'slime', 'hp', 3, 'kills', 0), 'journal', c_j));
    if (select fight from public.player_state where user_id = v_uid and slot = 0) <> '{}'::jsonb then
      raise exception 'GATE(f): a slime checkpoint survived on the rat training pointer'; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'fight', jsonb_build_object('monster', 'rat', 'hp', 3, 'kills', 0), 'journal', c_j));
    if (select fight->>'monster' from public.player_state where user_id = v_uid and slot = 0) is distinct from 'rat' then
      raise exception 'GATE(f) CONTROL: a rat checkpoint on the rat pointer was voided: %', v_r; end if;

    -- (g) THE BAND OPENS AT THE FLOOR: level 40 in the melee trio reaches 15.
    select xp into v_xp from public.hr_xp_table where level = 40;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, 0, s, v_xp from unnest(array['attack', 'strength', 'defense', 'hitpoints']) s
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    v_cl := public.hr_bounty_combat_level(v_uid, 0);
    if v_cl < 15 then raise exception 'GATE CANNOT RUN: the level-40 fixture reaches combat level % only', v_cl; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('activity',
             jsonb_build_object('kind', 'combat', 'id', 'ridge_camp', 'restart', true), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'GATE(g) CONTROL: combat level % was refused ridge_camp: %', v_cl, v_r; end if;

    raise exception using errcode = 'HRC1A', message = 'hunts-start-gate §4 complete — rolling back';
  exception when sqlstate 'HRC1A' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED (CLAUDE.md §2: no probe row survives).
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_skills  where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger  where user_id = v_uid)
     or exists (select 1 from public.hr_rejections  where user_id = v_uid)
     or exists (select 1 from auth.users            where id = v_uid) then
    raise exception 'GATE(z): §4 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;

  raise notice 'hunts-start-gate: EXECUTED - ridge_camp refused below band (activity_locked), unknown area refused, '
               'mill_cellar starts as combat:mill_cellar, a spawn checkpoint survives and a non-spawn one is voided, '
               'training keeps its own-monster rule, band floor opens at 15; gate uncallable by clients; net zero';
end $$;
