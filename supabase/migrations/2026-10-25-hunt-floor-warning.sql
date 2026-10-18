-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-25-hunt-floor-warning.sql — A HUNT'S LEVEL FLOOR IS A WARNING
--
-- STATUS: STAGED, NOT APPLIED (integration v0.2.1, 2026-10-18). The game is
-- CLOSED: applies on its passing §3 (tools/apply-migration.mjs, one file, never
-- inside begin/commit, never 00:00-00:10 UTC); Security reviews it with every
-- closed-mode surface at the reopen gate. ORDER: after
-- 2026-10-25-hunt-sessions-catalogue.generated.sql (the hr_hunt_limits key
-- below_range_refuse), before 2026-10-25-party-invites.sql (whose
-- hr_hunt_enter_for answers below_range through hr_hunt_below_range). No edge.
--
-- TYLER'S RULING (2026-10-18): band[0] of a hunt (src/data/hunts.js) is advice,
-- not a lock. A character under it may go and is told the hunt is above its
-- level; only a character SESSION_LIMITS.belowRangeRefuse (15, generated into
-- hr_hunt_limits as below_range_refuse) or more combat levels under the floor is
-- refused. The number is the data's; this file names none.
--
--   hr_hunt_gate(p_user, p_slot, p_hunt)   RESTATED WHOLE (§0 md5-pins the
--        2026-10-20-hunts-start-gate.sql image or this file's own). The band arm
--        now refuses activity_locked only when band_min - combat level >=
--        hr_hunt_limit('below_range_refuse'), and the refusal names the margin.
--        A missing limit FAILS CLOSED (the old floor holds). Every spawn's own
--        gate (Security C2) is unchanged. Callers: hr_hunt_admit (the session
--        doors) and hr_apply's named-hunt arm, so both paths read one rule.
--   hr_hunt_below_range(p_user, p_slot, p_hunt) -> boolean   NEW, owner-only:
--        true when the character's server combat level is under the hunt's
--        floor (a training hunt / unknown hunt answers false).
--
-- No value moves: a weaker hero only fights where it may lose. Every number is
-- the server's (hr_bounty_combat_level, hr_hunts.band_min, hr_hunt_limits).
-- REVERSIBILITY: restate the 2026-10-20-hunts-start-gate.sql §1 body and drop
-- hr_hunt_below_range (party-invites' enter_for would then need its flag line
-- removed too). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS + THE PIN ───────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_gate(uuid,integer,text)') is null
     or to_regprocedure('public.hr_bounty_combat_level(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regclass('public.hr_hunts') is null or to_regclass('public.hr_hunt_travel') is null then
    raise exception 'PRECONDITION: apply 2026-10-20-hunts-start-gate.sql and 2026-10-21-hunt-sessions.sql first'; end if;
  if public.hr_hunt_limit('below_range_refuse') is null then
    raise exception 'PRECONDITION: hr_hunt_limits has no below_range_refuse - apply 2026-10-25-hunt-sessions-catalogue.generated.sql first'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_hunt_gate(uuid,integer,text)'::regprocedure;
  if v_md5 <> 'bfbca6ec82f42fd6d9c41c24992074a0'
     and strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_gate(uuid,integer,text)'::regprocedure), 'below_range_refuse') = 0 then
    raise exception 'PIN: hr_hunt_gate is neither the 2026-10-20-hunts-start-gate.sql image (bfbca6ec...) nor this file''s (md5 %) - another file moved it', v_md5;
  end if;
end $mig$;

-- ── §1 THE GATE ──────────────────────────────────────────────────────────
create or replace function public.hr_hunt_gate(p_user uuid, p_slot int, p_hunt text)
returns void
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  v_min    int;
  v_cl     int;
  v_refuse int := public.hr_hunt_limit('below_range_refuse');
begin
  select band_min into v_min from public.hr_hunts where hunt_id = p_hunt;
  if v_min is null then
    perform public.hr_reject('unknown_activity', jsonb_build_object('kind', 'combat', 'id', p_hunt));
  end if;
  v_cl := coalesce(public.hr_bounty_combat_level(p_user, p_slot), 0);
  -- THE FLOOR IS A WARNING (Tyler 2026-10-18): refused only this far under it.
  -- No limit row = the old hard floor (fail closed).
  if v_min - v_cl >= coalesce(v_refuse, 1) then
    perform public.hr_reject('activity_locked',
      jsonb_build_object('id', p_hunt, 'combat_level', v_cl, 'band_min', v_min, 'refuse_under', coalesce(v_refuse, 1)));
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

-- ── §2 THE WARNING ───────────────────────────────────────────────────────
create or replace function public.hr_hunt_below_range(p_user uuid, p_slot int, p_hunt text)
returns boolean
language sql stable
set search_path = public, pg_catalog
as $$
  select coalesce((select h.band_min > coalesce(public.hr_bounty_combat_level(p_user, p_slot), 0)
                     from public.hr_hunts h
                    where h.hunt_id = p_hunt
                      and not coalesce((select t.training from public.hr_hunt_travel t where t.hunt_id = p_hunt), false)), false)
$$;
revoke execute on function public.hr_hunt_below_range(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK — executed, net zero ───────────────────────────────────
do $$
declare
  v_uid    constant uuid := '00000000-0000-4000-8000-0000000f1a21';
  v_role   text;
  v_r      jsonb;
  v_cl     int;
  v_refuse int := public.hr_hunt_limit('below_range_refuse');
  v_near   text;
  v_far    text;
  v_msg    text;
begin
  -- (a) PRIVILEGES: neither function is callable by a client role.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_gate(uuid,int,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_below_range(uuid,int,text)', 'execute') then
      raise exception 'FLOOR(a): % can execute hr_hunt_gate or hr_hunt_below_range', v_role; end if;
  end loop;
  if v_refuse is null or v_refuse < 1 then raise exception 'FLOOR(a): below_range_refuse is %', v_refuse; end if;

  begin  -- every probe row is discarded at HR892
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'hunt-floor-warning §3 probe') on conflict (user_id) do nothing;
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'FLOOR CANNOT RUN: no probe character: %', v_r; end if;
    v_cl := coalesce(public.hr_bounty_combat_level(v_uid, 0), 0);
    -- a hunt with no spawn gate whose floor is above the probe but within the margin,
    -- and one at least the margin above it (the catalogue's own rows; none is invented).
    select h.hunt_id into v_near from public.hr_hunts h
     where h.band_min > v_cl and h.band_min - v_cl < v_refuse
       and not exists (select 1 from public.hr_hunt_spawns s join public.hr_activities a on a.kind = 'combat' and a.activity_id = s.monster_id
                        where s.hunt_id = h.hunt_id and (a.is_boss or a.req_lv is not null))
     order by h.band_min desc, h.hunt_id limit 1;
    select h.hunt_id into v_far from public.hr_hunts h where h.band_min - v_cl >= v_refuse order by h.band_min, h.hunt_id limit 1;
    if v_near is null or v_far is null then
      raise exception 'FLOOR CANNOT RUN: the catalogue has no hunt within (%) or beyond (%) % levels over combat level %', v_near, v_far, v_refuse, v_cl; end if;

    -- (b) UNDER THE FLOOR, WITHIN THE MARGIN: admitted, and warned.
    perform public.hr_hunt_gate(v_uid, 0, v_near);
    if not public.hr_hunt_below_range(v_uid, 0, v_near) then
      raise exception 'FLOOR(b): % (under its floor at combat level %) is not below_range', v_near, v_cl; end if;
    -- (c) THE MARGIN OR MORE UNDER: refused activity_locked, naming the margin.
    v_msg := null;
    begin
      perform public.hr_hunt_gate(v_uid, 0, v_far);
    exception when sqlstate 'HR000' then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg is distinct from 'activity_locked' then
      raise exception 'FLOOR(c): % at combat level % answered % - must be activity_locked', v_far, v_cl, coalesce(v_msg, 'admitted'); end if;
    -- (d) CONTROL: a band-0 hunt is neither refused nor warned.
    perform public.hr_hunt_gate(v_uid, 0, 'mill_cellar');
    if public.hr_hunt_below_range(v_uid, 0, 'mill_cellar') then
      raise exception 'FLOOR(d): mill_cellar warns a combat-level-% probe', v_cl; end if;
    -- (e) an unknown hunt is never below range (and the gate still refuses it).
    if public.hr_hunt_below_range(v_uid, 0, 'not_a_hunt') then raise exception 'FLOOR(e): not_a_hunt is below_range'; end if;
    v_msg := null;
    begin
      perform public.hr_hunt_gate(v_uid, 0, 'not_a_hunt');
    exception when sqlstate 'HR000' then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg is distinct from 'unknown_activity' then raise exception 'FLOOR(e): not_a_hunt answered %', v_msg; end if;

    raise exception using errcode = 'HR892', message = 'hunt-floor-warning §3 complete - rolling back';
  exception when sqlstate 'HR892' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = v_uid) or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.hr_access_allowlist where user_id = v_uid) then
    raise exception 'FLOOR: §3 LEAKED a probe row'; end if;
  raise notice 'hunt-floor-warning: under the floor within % levels admits + warns, % or more refuses, band 0 neither; owner-only; zero leak', v_refuse, v_refuse;
end $$;
