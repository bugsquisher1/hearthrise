-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-24-risk-no-level-block.sql — ANY HERO MAY WALK INTO ANY GROUND
--   (lane/c-risk-ladder, systems-engineer, 2026-11-03).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00-00:10 UTC). Pre-EA: applies on its
-- passing §2; on the EA Security list (hr_hunt_gate is a start gate; moves no value).
-- APPLY ORDER: BEFORE 2027-02-24-risk-hunt-sessions-catalogue.generated.sql. That file
-- drops the below_range_refuse limit, and the old gate reads a missing limit as a
-- hard floor at band[0]; this body never reads it.
-- EDGE / CLIENT: this file alone needs neither. The engine's harder level gap
-- (hunt-tuning.js underFloorAtkPm) and the words ride the same set.
--
-- ── THE RULING ──────────────────────────────────────────────────────────────
-- Tyler 2026-11-04 UTC: "dying should come if people take big risks. big risks
-- should include warnings but should allow the player to take them", and "if
-- someone wants to try and 'rush' exp then they should be able to try harder
-- content to get there faster, but it comes with risk." The 15-Level hard block
-- (his 11-02 call, kept from 10-18) is superseded, for a hero and for a party.
--
-- ── THE CHANGE ──────────────────────────────────────────────────────────────
-- hr_hunt_gate restated whole, the floor's arm gone. It still answers
-- unknown_activity and still asks every spawn's own gate (Security C2). Its
-- callers read one rule: hr_hunt_admit (the session doors, the party's Start, its
-- ready line and its listing) and hr_apply's named-hunt arm. hr_hunt_below_range is
-- untouched: the enter answer still says below_range, and the words read the band.
--
-- WHAT THE BLOCK PROTECTED, AND WHERE IT WENT: a Level 1 sat behind three high
-- friends. xp-share.js closes that through how XP is shared (a seat under the
-- ground's floor and far under its party's top earns a smaller share); nobody is
-- refused. No value moves here: a weaker hero only fights where it may die.
-- REVERSIBILITY: restate the 2026-10-27-core-bodies.sql body. No begin/commit (§2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_gate(uuid,integer,text)') is null
     or to_regprocedure('public.hr_hunt_below_range(uuid,integer,text)') is null
     or to_regprocedure('public.hr_hunt_admit(uuid,integer,text)') is null then
    raise exception 'PRECONDITION: hr_hunt_gate, hr_hunt_below_range or hr_hunt_admit is absent'; end if;
end $mig$;

-- ── §1 THE GATE ──────────────────────────────────────────────────────────
create or replace function public.hr_hunt_gate(p_user uuid, p_slot integer, p_hunt text)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $function$
begin
  if not exists (select 1 from public.hr_hunts where hunt_id = p_hunt) then
    perform public.hr_reject('unknown_activity', jsonb_build_object('kind', 'combat', 'id', p_hunt));
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
                and coalesce((select public.hr_skill_level(a.req_skill, ps.xp) from public.player_skills ps
                               where ps.user_id = p_user and ps.slot = p_slot
                                 and ps.skill_id = a.req_skill), 1) < a.req_lv)))
  then
    perform public.hr_reject('activity_locked', jsonb_build_object('id', p_hunt, 'spawn_gate', true));
  end if;
end $function$;
revoke execute on function public.hr_hunt_gate(uuid, integer, text) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK — executed, net zero ───────────────────────────────────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-8000-0000000f1a24';
  v_role text;
  v_r    jsonb;
  v_top  text;
  v_msg  text;
begin
  -- (a) PRIVILEGES: the gate stays owner-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_gate(uuid,integer,text)', 'execute') then
      raise exception 'RISK(a): % can execute hr_hunt_gate', v_role; end if;
  end loop;
  -- (b) THE TEXT: no margin left to read.
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_gate(uuid,integer,text)'::regprocedure), 'below_range_refuse') > 0 then
    raise exception 'RISK(b): hr_hunt_gate still reads the refuse margin'; end if;

  begin  -- every probe row is discarded at HR892
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'risk-no-level-block §2 probe') on conflict (user_id) do nothing;
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'RISK CANNOT RUN: no probe character: %', v_r; end if;
    -- (c) A Level 1 is admitted to the highest ground the catalogue holds, by both doors, and is told it stands under it.
    select g.hunt_id into v_top from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min desc, g.hunt_id limit 1;
    if v_top is null then raise exception 'RISK CANNOT RUN: no hunt ground'; end if;
    perform public.hr_hunt_gate(v_uid, 0, v_top);
    perform public.hr_hunt_admit(v_uid, 0, v_top);
    if not public.hr_hunt_below_range(v_uid, 0, v_top) then raise exception 'RISK(c): a Level 1 is not below_range on %', v_top; end if;
    -- (d) An unknown hunt is still refused, by name.
    begin
      perform public.hr_hunt_gate(v_uid, 0, 'not_a_hunt');
    exception when sqlstate 'HR000' then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg is distinct from 'unknown_activity' then raise exception 'RISK(d): not_a_hunt answered %', coalesce(v_msg, 'admitted'); end if;
    -- (e) CONTROL: the first ground warns nobody at its floor.
    if public.hr_hunt_below_range(v_uid, 0, 'mill_cellar') then raise exception 'RISK(e): mill_cellar warns a Level 1'; end if;
    raise exception using errcode = 'HR892', message = 'risk-no-level-block §2 complete - rolling back';
  exception when sqlstate 'HR892' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = v_uid) or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.hr_access_allowlist where user_id = v_uid) then
    raise exception 'RISK: §2 LEAKED a probe row'; end if;
  raise notice 'risk-no-level-block: a Level 1 is admitted to %, told it stands under it; an unknown hunt is refused; owner-only; zero leak', v_top;
end $$;
