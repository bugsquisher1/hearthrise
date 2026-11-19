-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-29-forfeit-plan.sql — A FORFEITED HUNT STILL RUNS ITS HERO'S PLAN: `server` IS AN AUTOMATIC END
--   (lane/a-tower-andy, systems-engineer, 2026-11-19; Andy on live 0.2.140: "Finishing tower didn't restart the crafting I was doing before I
--   went in"). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §2.
--   Not a money surface of its own: it adds no verb, grant or price; a training plan starts through hr_hunt_after_sweep's one door at the
--   server's fee, as after any other automatic end (2027-04-25-hunt-itinerary.sql, on the EA Security list already).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- Andy's four climbed the Burning Tower 1 -> 182; the window their wipe fell in was refused six times (value_over level_xp: the engine paid a
-- kill's Level XP to heroes who fell later in its swing and counted the kill for none of them, fixed in src/core/hunt-rewards.js) and
-- hr_hunt_forfeit ended every seat `server`. Three seats' frozen plan was "back to the job" (woodcutting, mining, fishing) and none ran:
-- after_done stayed null. hr_hunt_end_reasons says `server` RESUMES (src/data/hunt-sessions.js RESUME_AFTER_END), and the settle's own end
-- runs hr_hunt_resume, but the forfeit closes the seat through hr_hunt_close alone, so a forfeited hunt never ran its plan. Live: one forfeit
-- event in the 21 days to 2026-11-19 (this one); October's two were item bounds.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_hunt_forfeit_seat RESTATED WHOLE (2027-01-22-party-settle-isolation.sql's image, §0 pins it; FORFEIT-PLAN marks the change): after the
--   close it runs hr_hunt_resume for the seat with the end it wrote, exactly as the settle runs it for an end of its own: `server` runs the
--   hunt's frozen plan (job: the remembered job after the walk home; wait; train: `pending` for the minute's sweep) and records it
--   (after_done, the `resume` ledger row, the `ended` event's resume); `left` (a Leave or change was pending) runs none (resumes = false).
--   hr_hunt_forfeit reaches every seat through it, so a whole-instance forfeit is covered with no restatement of its own.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- Unchanged lock order: the instance (for update), then the seat's character lock (hr_hunt_lock), then the close; hr_hunt_resume writes only
-- that hero's player_state and return anchor, its ledger row and its hunt's rows, under the lock already held. It runs once per close: a seat
-- already ended returns before it. A training start stays out of this transaction (the sweep's own, as for every end).
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- None added. A forfeit cannot be triggered by a client (every settle input is server-held); the plan it runs is the hero's own, frozen at
-- Enter, through the same function every automatic end calls; no value moves here.
--
-- ── COST ───────────────────────────────────────────────────────────────────
-- Per forfeited seat (rare: a fuse): one max(id) probe of hunt_session_events by session, and hr_hunt_resume's usual reads and one ledger row.
--
-- EDGE: none. CLIENT: none (the envelope's hunt_after.last already reads after_done).
-- ORDER: any time after 2027-04-25-hunt-itinerary.sql (APPLIED: hr_hunt_resume with the plan) and 2027-01-22-party-settle-isolation.sql
--   (APPLIED, the image §0 pins); no STAGED file touches hr_hunt_forfeit_seat.
-- After apply: live-hash-drift --live --write (hr_hunt_forfeit_seat moves). restore-census unchanged (no table, no seeded row).
-- REVERSIBLE: restate hr_hunt_forfeit_seat from 2027-01-22-party-settle-isolation.sql (§0 accepts that image as its pre-image).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_resume(uuid,integer,uuid,text,bigint)') is null or to_regclass('public.hr_hunt_after_choices') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)') is null
     or not exists (select 1 from public.hr_hunt_end_reasons where reason = 'server' and resumes)
     or exists (select 1 from public.hr_hunt_end_reasons where reason = 'left' and resumes) then
    raise exception 'PRECONDITION: apply 2027-04-25-hunt-itinerary.sql first (hr_hunt_resume with the plan; server resumes, left does not)'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '889a385cab57a9a1e056fd786aa10f3d' and v_md5 is distinct from 'd0d4d56ea98735d6b5748ff3a3f85f95' then
    raise exception 'PIN: hr_hunt_forfeit_seat is neither 2027-01-22-party-settle-isolation.sql''s image (889a385c) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
      left('d0d4d56ea98735d6b5748ff3a3f85f95', 8), v_md5; end if;
end $mig$;

-- ── §1 THE SEAT'S FORFEIT (RESTATED WHOLE: the image with the FORFEIT-PLAN lines) ───────────────────────────────────────────────────────
create or replace function public.hr_hunt_forfeit_seat(p_instance uuid, p_session uuid, p_code text, p_detail jsonb, p_refusals integer)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_i public.hunt_instances%rowtype;
  v_s public.hunt_sessions%rowtype;
  v_end text;
  v_ev0 bigint;
begin
  -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): hr_hunt_forfeit's per-seat body, one seat. The instance
  -- first, then the seat (the settle's order); nothing of the pending window is credited.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('sessions', 0); end if;
  select * into v_s from public.hunt_sessions h where h.id = p_session and h.instance_id = p_instance and h.ended_at is null;
  if not found then return jsonb_build_object('sessions', 0); end if;
  perform public.hr_hunt_lock(v_s.user_id, v_s.slot);
  select * into v_s from public.hunt_sessions h where h.id = p_session and h.ended_at is null;
  if not found then return jsonb_build_object('sessions', 0); end if;
  v_end := case when v_s.leave_at is not null or v_s.change_at is not null then 'left' else 'server' end;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
    values (v_s.user_id, v_s.slot, 'hunt', 'window_forfeit', 0, 0,
            jsonb_build_object('reason', 'window_forfeit', 'code', left(coalesce(p_code, ''), 64), 'detail', p_detail,
                               'from', v_i.settled_to, 'world_swing', v_i.world_swing, 'refusals', coalesce(p_refusals, 0), 'end', v_end),
            v_s.id);
  -- FORFEIT-PLAN (2027-05-29-forfeit-plan.sql): the seat's last event before the close, so the plan's answer lands on this close's `ended`
  select coalesce(max(e.id), 0) into v_ev0 from public.hunt_session_events e where e.session_id = v_s.id;
  perform public.hr_hunt_close(v_s.id, v_end, v_i.settled_to, true);
  update public.hunt_sessions set forfeit = true where id = v_s.id;
  -- FORFEIT-PLAN: a forfeit is an automatic end (`server`: hr_hunt_end_reasons.resumes), so the hero's own plan runs as after any other:
  -- back to the job, wait in town, or a training start for the sweep. A Leave pressed (`left`) runs none (hr_hunt_resume's own gate).
  perform public.hr_hunt_resume(v_s.user_id, v_s.slot, v_s.id, v_end, v_ev0);
  return jsonb_build_object('sessions', 1, 'at', v_i.settled_to, 'seat', v_s.seat);
end $$;
revoke all on function public.hr_hunt_forfeit_seat(uuid, uuid, text, jsonb, integer) from public, anon, authenticated, service_role;
do $mig$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_forfeit_seat(uuid, uuid, text, jsonb, integer) from %I', v_role); end if;
  end loop;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────────────────────────────────────────────────────────────────
do $chk$
declare
  c_u  constant uuid := '000000c0-0000-4000-a000-0000f0f1a001';
  k    constant text := '000000c0-0000-4000-b000-f0f1a00';
  v jsonb; v_node text; v_hunt text; v_sid uuid; v_inst uuid; v_done jsonb; v_st record; r record; v_i int := 0;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'forfeit-plan §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'forfeit-plan §2-harness: hr_create_character refused: %', v; end if;
    select a.activity_id into v_node from public.hr_activities a where a.kind = 'gather' and coalesce(a.req_lv, 1) <= 1 order by a.activity_id limit 1;
    select h.hunt_id into v_hunt from public.hr_hunts h where h.hunt_id = 'mill_cellar';
    if v_node is null or v_hunt is null then raise exception 'forfeit-plan §2-harness: no level-1 node (%) or Mill Cellar (%)', v_node, v_hunt; end if;
    -- (a) A FORFEIT ENDS THE SEAT `server` AND RUNS ITS PLAN; one pending Leave ends it `left` and runs none. `choice`: the hero's pick
    --     (null: never picked, the default job); wanted: the end, what came of the plan, where the hero stands.
    for r in select * from (values
      ('never picked, gathering',  null,   false, 'server', 'resumed', 'gather'),
      ('wait in town',             'wait', false, 'server', 'waited',  'idle'),
      ('a Leave was pending',      null,   true,  'left',   null,      'idle')
    ) t(tag, choice, leaving, want_end, want_state, want_kind) loop
      v_i := v_i + 1;
      update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = c_u and slot = 0 and ended_at is null;
      update public.player_state set active_kind = 'gather', active_id = v_node, active_since = now(), accrued_to = now(),
             after_choice = r.choice, after_skill = null, last_activity_kind = null, last_activity_id = null, last_activity_left = null,
             last_activity_stopped_at = null
       where user_id = c_u and slot = 0;
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || lpad(v_i::text, 5, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'forfeit-plan §2-harness (%): entering answered %', r.tag, v; end if;
      select h.id, h.instance_id into v_sid, v_inst from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
      if r.leaving then update public.hunt_sessions set leave_at = now() + interval '1 hour' where id = v_sid; end if;
      v := public.hr_hunt_forfeit_seat(v_inst, v_sid, 'probe', '{}'::jsonb, 6);
      select h.end_reason as e, h.forfeit as f, h.after_done as d into v_st from public.hunt_sessions h where h.id = v_sid;
      v_done := v_st.d;
      if (v->>'sessions')::int is distinct from 1 or v_st.e is distinct from r.want_end or v_st.f is not true then
        raise exception 'forfeit-plan §2(a) (%): the forfeit answered % and ended the seat % (forfeit %)', r.tag, v, v_st.e, v_st.f; end if;
      select ps.active_kind as k, ps.active_id as i into v_st from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
      if v_done->>'state' is distinct from r.want_state or v_st.k is distinct from r.want_kind
         or (r.want_kind = 'gather' and v_st.i is distinct from v_node) then
        raise exception 'forfeit-plan §2(a) (%): the plan came to % and the hero is % %, wanted % / %', r.tag, v_done, v_st.k, v_st.i, r.want_state, r.want_kind; end if;
      -- (b) WRITTEN ONCE, AS THE SETTLE WRITES IT: one `resume` row and the `ended` event's resume for a plan that ran; none for a Leave
      if (select count(*) from public.player_ledger l where l.session_id = v_sid and l.intent = 'resume') <> (case when r.want_state is null then 0 else 1 end)
         or (r.want_state = 'resumed' and not exists (select 1 from public.hunt_session_events e where e.session_id = v_sid and e.type = 'ended'
                                                         and e.data->'resume'->>'id' = v_node)) then
        raise exception 'forfeit-plan §2(b) (%): the resume rows read % ledger, event %', r.tag,
          (select count(*) from public.player_ledger l where l.session_id = v_sid and l.intent = 'resume'),
          (select e.data from public.hunt_session_events e where e.session_id = v_sid and e.type = 'ended'); end if;
      -- (c) A SECOND FORFEIT OF THE SAME SEAT is no end: nothing more is written
      v := public.hr_hunt_forfeit_seat(v_inst, v_sid, 'probe', '{}'::jsonb, 6);
      if (v->>'sessions')::int is distinct from 0
         or (select count(*) from public.player_ledger l where l.session_id = v_sid and l.intent = 'resume') > 1 then
        raise exception 'forfeit-plan §2(c) (%): a second forfeit answered % and wrote again', r.tag, v; end if;
    end loop;
    raise exception using errcode = 'HRF29', message = 'forfeit-plan §2 complete - rolling back';
  exception when sqlstate 'HRF29' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u) then
    raise exception 'forfeit-plan §2: LEAKED a probe row'; end if;
  -- (d) THE GRANTS: owner-only, as before.
  foreach v_node in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_node, 'public.hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)', 'execute') then
      raise exception 'forfeit-plan §2(d): % can execute hr_hunt_forfeit_seat', v_node; end if;
  end loop;
  raise notice 'forfeit-plan §2 OK: a forfeit ends the seat server and runs its plan (the job, or waiting as picked), once; a pending Leave ends it left and runs none; owner-only';
end $chk$;
