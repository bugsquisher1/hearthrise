-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A STOP AT THE YARD CLOSES AT THE PRESS, AND NEVER PAYS AN HOUR IT CAME BEFORE.
-- STAGED, NOT APPLIED (lane/c-yard-stop, systems-engineer, 2026-11-18).
-- Game CLOSED: applies on its passing §5; Security reviews it in the reopen gate (a money surface: the yard's hourly fee).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- Post-140 audit C10 ("Stop training takes 10-16 s with no feedback"), measured on the local world for this lane: every leave is
-- PENDING until leave_at = settled_to + 32 s (hr_hunt_live_horizon_at, 2026-10-31-live-horizon.sql), a training session too: leave_at
-- landed 16-19 s after the press and the yard was gone from the screen 17-21 s after it (on live, with a 10 s settle cadence, about
-- 22-32 s). The horizon exists so a viewer cannot step around a death its live seeds foresaw; NOBODY DIES AT THE YARD (a dummy's blow
-- never takes a hero under TRAINING_RULES.hpFloorPm, src/core/hunt/training.js dummyBlow), and a training window credits only the
-- trained skill's XP by settled time (hr_training_window's allowlist), so there is nothing to foresee or dodge there.
-- WORSE THAN SLOW, IT BILLS: the yard pays each hour at its first instant (src/data/training.js THE MONEY: the settle that lands on the
-- hour's first instant pays it, hr_training_hour; stopping early refunds nothing). A Stop pressed in the last ~32 s of a paid hour
-- put leave_at past the next hour's first instant, so the settle walking to it stopped at that edge (trainingStopMs) and BOUGHT THE
-- NEXT HOUR for a hero who had already left: up to fee_base + fee_per_level x skill level gold for nothing.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_hunt_close_at(p_session) NEW (owner-only): the instant a pending leave or change of that session closes at. A TRAINING session
--    (its hunt in hr_training_grounds): AT THE PRESS, greatest(now(), the session's settled_to, its instance's settled_to), so it is
--    never before a step already settled and no step is played after it. Any other session: hr_hunt_live_horizon_at(settled_to), the
--    exact expression the two verbs used before (hunts keep their horizon).
-- §2 hr_hunt_leave_pending RESTATED (2027-03-13-gm-tools.sql's image, md5-pinned): leave_at = hr_hunt_close_at. The player's Leave
--    (hr_hunt_leave) and the GM's stop both run it, so both close a training session at the press.
-- §3 hr_hunt_change RESTATED (2026-10-31-live-horizon.sql's image, md5-pinned): change_at = hr_hunt_close_at, the same rule for the
--    other pending close a training session can take (a direct verb; the client sends none today).
-- §4 hr_training_hour RESTATED (2027-04-16-combat-training.sql's image, md5-pinned): the fee READS THE PRESS. A window that lands on
--    the next hour's first instant with a leave pending at or before it is a Stop pressed before that hour began: it buys nothing and
--    ends the session `left` there, where the engine's next swing boundary would end it (a press inside the last swing step before
--    the edge, whose boundary IS the edge; and any leave written before this file). The hour still bills when the hour began before
--    the press (settle lag): it is paid at its first instant, as the rule says.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No grant, signature or client RPC changes (hr_hunt_leave and hr_hunt_change keep their grants; hr_hunt_close_at is revoked from every
-- client role). The caller's key is auth.uid() as before: a leave names only the caller's own hero (a stranger's answers no_hunt). The
-- earlier close can only END a training session sooner: it can buy, credit or mint nothing (a training window carries the trained
-- skill's XP alone, hr_training_window), and the fee change can only charge LESS (never an hour after a Stop). No edge change: the engine
-- already ends a hero `left` at the first swing boundary at or after leave_at (src/core/action-rules.js END_CHECKS.left).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Restate hr_hunt_leave_pending from 2027-03-13-gm-tools.sql §5, hr_hunt_change from 2026-10-31-live-horizon.sql and hr_training_hour
-- from 2027-04-16-combat-training.sql §2 by hand (their own pins accept only their images), then drop hr_hunt_close_at(uuid).
-- ORDER: after 2027-05-15-analyzer-cover-coins.sql (last in the chain). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ─────────────────────────────────────────────
-- Each restated body is the image this file was written against (production's, tests/live-hash-drift.baseline.json measured
-- 2026-11-19, equal to the replay's), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_training_grounds') is null or to_regclass('public.hr_training_rules') is null then
    raise exception 'PRECONDITION: apply 2027-04-16-combat-training.sql first (hr_training_grounds, hr_training_rules)'; end if;
  if to_regprocedure('public.hr_hunt_live_horizon_at(timestamp with time zone)') is null
     or to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (hr_hunt_live_horizon_at, hr_hunt_close)'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_leave_pending(uuid,integer)', 'd22a6caa86fedc90188d01a5c8d17eee', 'ffe82fa2c412e9675ef0d71a07273051'),
    ('public.hr_hunt_change(integer,text,uuid)', '5c3e72a57ca341e5cd230b19fde9a938', 'f922fc3e3590ca1a41307a7f7641366d'),
    ('public.hr_training_hour(uuid,integer,uuid,timestamp with time zone,bigint,bigint,jsonb)', 'ced454cc4439b2a7370b0b427ac2c0d2', 'c52e83c3c01204087e894558951a3c16')) t(fn, pre, post) loop
    if to_regprocedure(v_r.fn) is null then raise exception 'PRECONDITION: % is absent', v_r.fn; end if;
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 WHERE A PENDING CLOSE LANDS ────────────────────────────────────────────
create or replace function public.hr_hunt_close_at(p_session uuid)
returns timestamptz language sql stable set search_path = public, pg_catalog as $fn$
  -- A TRAINING SESSION CLOSES AT THE PRESS (2027-05-20-yard-stop.sql): nobody dies at the yard, so there is no foreseen blow to wait out;
  -- never before a step already settled (the session's clock or its instance's), so no step is played after the close. Any other
  -- session waits out the live horizon (hr_hunt_live_horizon_at): the last combat swing a hunt_live answer can have shown.
  select case when exists (select 1 from public.hr_training_grounds g where g.hunt_id = s.hunt_id)
              then greatest(now(), s.settled_to, coalesce(i.settled_to, s.settled_to))
              else public.hr_hunt_live_horizon_at(s.settled_to) end
    from public.hunt_sessions s left join public.hunt_instances i on i.id = s.instance_id
   where s.id = p_session
$fn$;
revoke execute on function public.hr_hunt_close_at(uuid) from public, anon, authenticated, service_role;

-- ── §2 THE LEAVE ──────────────────────────────────────────────────────────────
-- THE STATEMENT A LEAVE RUNS, spelled once: the player's verb and the GM's stop both end a hunt here.
create or replace function public.hr_hunt_leave_pending(p_user uuid, p_slot int)
returns public.hunt_sessions language plpgsql set search_path = public, pg_catalog as $fn$
declare v_s public.hunt_sessions%rowtype;
begin
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null then return v_s; end if;
  -- ALWAYS PENDING (live-horizon, 2026-10-31): never at once. The settle walks to leave_at, no earlier
  -- than the last combat swing the viewer was shown (hr_hunt_live_horizon_at), so a death the browser
  -- foresaw in its seeds cannot be stepped around: the hunt ends `left` only after it, or `died` at it.
  -- A TRAINING SESSION closes at the press (hr_hunt_close_at, 2027-05-20-yard-stop.sql): nobody dies at the yard.
  if v_s.leave_at is null and v_s.change_at is null then
    update public.hunt_sessions set leave_at = public.hr_hunt_close_at(v_s.id), version = version + 1 where id = v_s.id;
  end if;
  return v_s;
end $fn$;

-- ── §3 THE CHANGE OF GROUND ───────────────────────────────────────────────────
create or replace function public.hr_hunt_change(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'hunt_change';
  v_uid uuid := auth.uid();
  v_r   jsonb;
  v_s   public.hunt_sessions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunts_paused')); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hunt')); end if;

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if v_s.hunt_id = p_hunt then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_hunt')); end if;
  -- A PARTY HUNTS ONE GROUND (2026-10-23-hunt-party.sql).
  if exists (select 1 from public.hunt_instances i where i.id = v_s.instance_id and i.kind = 'party') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunt')); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- ALWAYS PENDING (live-horizon, 2026-10-31): the swap lands no earlier than the last combat swing
  -- the viewer was shown (hr_hunt_live_horizon_at); never an at-once swap around a foreseen death.
  -- A TRAINING SESSION swaps at the press (hr_hunt_close_at, 2027-05-20-yard-stop.sql): nobody dies at the yard.
  update public.hunt_sessions set change_at = public.hr_hunt_close_at(v_s.id), change_to = p_hunt, version = version + 1 where id = v_s.id;
  v_r := jsonb_build_object('ok', true, 'pending', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $fn$;

-- ── §4 THE YARD'S NEXT HOUR READS THE PRESS ───────────────────────────────────
-- THE YARD'S NEXT HOUR, at its first instant (hr_hunt_apply_member, after the session half, under the character's lock and the account
-- purse's, both taken by hr_hunt_apply_instance first). p_to is this window's end, p_cost its own store bill (paid after every member),
-- p_floor the hero's "Keep at least". Answers the session half's answer p_h, with `ended` when it ended the session here.
create or replace function public.hr_training_hour(p_user uuid, p_slot int, p_session uuid, p_to timestamptz, p_cost bigint, p_floor bigint, p_h jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_s public.hunt_sessions%rowtype; v_t public.hr_training_grounds%rowtype; v_max int; v_lv int; v_fee bigint; v_g bigint; v_hour int;
begin
  select * into v_s from public.hunt_sessions where id = p_session;
  select * into v_t from public.hr_training_grounds where hunt_id = v_s.hunt_id;
  if not found or v_s.ended_at is not null or not v_t.fee or v_s.hours_limit is null then return p_h; end if;
  select r.max_hours into v_max from public.hr_training_rules r where r.id;
  -- Only the window that lands EXACTLY on the next hour's first instant buys it, and never past the longest session.
  if v_s.hours_limit >= v_max or p_to is distinct from v_s.hunt_from + make_interval(hours => v_s.hours_limit) then return p_h; end if;
  -- A STOP PRESSED BEFORE THIS HOUR BEGAN NEVER BUYS IT (2027-05-20-yard-stop.sql): a training leave closes at its press
  -- (hr_hunt_close_at), so a leave pending at or before this first instant was pressed before the hour began. Nothing is bought;
  -- the session ends `left` here, where the engine's next swing boundary would end it.
  if v_s.leave_at is not null and v_s.leave_at <= p_to then
    perform public.hr_hunt_close(p_session, 'left', p_to, true);
    return coalesce(p_h, '{}'::jsonb) || jsonb_build_object('ended', 'left', 'training', jsonb_build_object('hour', v_s.hours_limit + 1, 'paid', false));
  end if;
  v_hour := v_s.hours_limit + 1;
  v_lv := public.hr_skill_level(v_t.skill, coalesce((select ps.xp from public.player_skills ps
                                                      where ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = v_t.skill), 0));
  v_fee := public.hr_training_fee(v_lv);
  -- THE PURSE PAYS IT ONLY OUT OF WHAT THE WINDOW'S OWN BILL AND FLOOR LEAVE: hr_hunt_apply_instance debits the bill after every member
  -- and holds a hero that bought to its floor, so neither may be the one left short.
  if public.hr_purse_of(p_user) - greatest(0, coalesce(p_cost, 0)) - (case when coalesce(p_cost, 0) > 0 then greatest(0, coalesce(p_floor, 0)) else 0 end) < v_fee then
    perform public.hr_hunt_close(p_session, 'gold_out', p_to, true);
    return coalesce(p_h, '{}'::jsonb) || jsonb_build_object('ended', 'gold_out', 'training', jsonb_build_object('hour', v_hour, 'fee', v_fee, 'paid', false));
  end if;
  v_g := public.hr_purse_move(p_user, -v_fee, 0);
  if v_g is null then perform public.hr_reject('gold_short', jsonb_build_object('why', 'training', 'fee', v_fee)); end if;
  -- A PURCHASE, journalled as the first hour's is (kind shop, the session in meta, never in session_id: a session-stamped row folds into
  -- the hunt's own coins, hr_hunt_settle_session's tally, and the yard's fee is no coin the hero earned).
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, purse, gold_kind)
    values (p_user, p_slot, 'shop', 'training_fee:' || v_s.hunt_id || ':' || v_hour, -v_fee,
            jsonb_build_object('reason', 'training_fee', 'hunt', v_s.hunt_id, 'skill', v_t.skill, 'level', v_lv, 'hour', v_hour, 'fee', v_fee,
                               'session', p_session),
            v_g, 'shop');
  update public.hunt_sessions set hours_limit = v_hour, version = version + 1 where id = p_session and hours_limit = v_hour - 1;
  if not found then perform public.hr_reject('session_moved', jsonb_build_object('why', 'training_hour')); end if;
  return coalesce(p_h, '{}'::jsonb) || jsonb_build_object('training', jsonb_build_object('hour', v_hour, 'fee', v_fee, 'paid', true));
end $fn$;
revoke execute on function public.hr_training_hour(uuid, int, uuid, timestamptz, bigint, bigint, jsonb) from public, anon, authenticated, service_role;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid   constant uuid := '000000c0-0000-0000-0000-00005e1a0520';
  v_oth   constant uuid := '000000c0-0000-0000-0000-00005e1a0521';
  v       jsonb;
  v_sid   uuid;
  v_hid   uuid;
  v_s     public.hunt_sessions%rowtype;
  v_fee   bigint;
  v_p0    bigint;
  v_edge  timestamptz;
  v_role  text;
begin
  begin
    insert into auth.users (id) values (v_uid), (v_oth) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'yard-stop §5 probe'), (v_oth, 'yard-stop §5 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): hr_create_character refused: %', v; end if;
    perform public.hr_purse_move(v_uid, 100000, 0);
    -- A YARD SESSION ONE PAID HOUR IN (as hr_training_start opens one: hours_limit 1, the hour it paid), its clock 59:50 into that hour.
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'training_yard_melee', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '59 minutes 50 seconds', hunt_from = now() - interval '59 minutes 50 seconds',
      settled_to = now() - interval '5 seconds', hours_limit = 1 where id = v_sid;
    update public.hunt_instances set settled_to = now() - interval '5 seconds' where id = (select instance_id from public.hunt_sessions where id = v_sid);
    v_edge := now() + interval '10 seconds';
    v_fee := public.hr_training_fee(public.hr_skill_level('melee', coalesce((select ps.xp from public.player_skills ps
                                                                          where ps.user_id = v_uid and ps.slot = 0 and ps.skill_id = 'melee'), 0)));

    -- (a) A STRANGER CAN'T STOP YOURS: another account's Leave on the same slot names its own hero (in town), never this one.
    perform set_config('request.jwt.claim.sub', v_oth::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): the stranger''s hr_create_character refused: %', v; end if;
    v := public.hr_hunt_leave(0, gen_random_uuid());
    if coalesce(v->>'error', '') <> 'no_hunt' or (select leave_at from public.hunt_sessions where id = v_sid) is not null then
      raise exception 'VERIFY(a): a stranger''s Leave answered % and the yard''s leave_at is %', v, (select leave_at from public.hunt_sessions where id = v_sid); end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    -- (b) THE PRESS AT 59:50 CLOSES AT THE PRESS: pending, at now() ON THE HUNT CLOCK, never before a settled step, before the next hour's
    -- first instant. THE HUNT CLOCK IS WHOLE MILLISECONDS (2026-10-22-hunt-sessions-settle.sql hr_hunt_clock_ms truncates every session
    -- instant as it is written) while production's now() carries microseconds: the press is date_trunc('milliseconds', now()). (The first
    -- apply of this file, 2026-11-19, compared leave_at with the bare now() and refused itself on production; a replay's clock is
    -- already whole milliseconds, the 2026-10-15 GATE(f) class.)
    v := public.hr_hunt_leave(0, gen_random_uuid());
    select * into v_s from public.hunt_sessions where id = v_sid;
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'pending', '') <> 'true' or v_s.leave_at is distinct from date_trunc('milliseconds', now())
       or v_s.leave_at < v_s.settled_to or v_s.leave_at >= v_edge or (v->'session'->>'leave_at') is null then
      raise exception 'VERIFY(b): the yard''s Leave answered % with leave_at % (now %, settled_to %, the hour''s edge %)', v, v_s.leave_at, now(), v_s.settled_to, v_edge; end if;

    -- (c) ...AND BILLS NO NEW HOUR: the settle that lands on the next hour's first instant buys nothing and ends the session `left`.
    v_p0 := public.hr_purse_of(v_uid);
    v := public.hr_training_hour(v_uid, 0, v_sid, v_s.hunt_from + interval '1 hour', 0, 0, '{}'::jsonb);
    select * into v_s from public.hunt_sessions where id = v_sid;
    if coalesce(v->>'ended', '') <> 'left' or public.hr_purse_of(v_uid) <> v_p0 or v_s.hours_limit <> 1 or v_s.ended_at is null or v_s.end_reason <> 'left'
       or exists (select 1 from public.player_ledger l where l.user_id = v_uid and l.intent like 'training_fee:%') then
      raise exception 'VERIFY(c): a Stop at 59:50 met the hour''s edge with % (purse % -> %, hours_limit %, end %)', v, v_p0, public.hr_purse_of(v_uid), v_s.hours_limit, v_s.end_reason; end if;

    -- (d) THE CONTROL, NO STOP: the same edge buys the next hour, once, at the server's fee (the purchase path still works).
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'training_yard_melee', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '59 minutes 50 seconds', hunt_from = now() - interval '59 minutes 50 seconds',
      settled_to = now() - interval '5 seconds', hours_limit = 1 where id = v_sid;
    select * into v_s from public.hunt_sessions where id = v_sid;
    v_p0 := public.hr_purse_of(v_uid);
    v := public.hr_training_hour(v_uid, 0, v_sid, v_s.hunt_from + interval '1 hour', 0, 0, '{}'::jsonb);
    select * into v_s from public.hunt_sessions where id = v_sid;
    if coalesce(v->'training'->>'paid', '') <> 'true' or public.hr_purse_of(v_uid) <> v_p0 - v_fee or v_s.hours_limit <> 2 or v_s.ended_at is not null then
      raise exception 'VERIFY(d): with no Stop the hour''s edge answered % (purse % -> %, fee %, hours_limit %)', v, v_p0, public.hr_purse_of(v_uid), v_fee, v_s.hours_limit; end if;

    -- (e) AN HOUR THAT BEGAN BEFORE THE PRESS IS STILL PAID (settle lag): a leave after the third hour's first instant leaves that edge to bill.
    update public.hunt_sessions set hunt_from = now() - interval '2 hours 30 seconds', entered_at = now() - interval '2 hours 30 seconds',
      settled_to = now() - interval '50 seconds' where id = v_sid;
    v := public.hr_hunt_leave(0, gen_random_uuid());
    select * into v_s from public.hunt_sessions where id = v_sid;
    v_p0 := public.hr_purse_of(v_uid);
    v := public.hr_training_hour(v_uid, 0, v_sid, v_s.hunt_from + interval '2 hours', 0, 0, '{}'::jsonb);
    select * into v_s from public.hunt_sessions where id = v_sid;
    if coalesce(v->'training'->>'paid', '') <> 'true' or public.hr_purse_of(v_uid) <> v_p0 - v_fee or v_s.hours_limit <> 3 or v_s.ended_at is not null then
      raise exception 'VERIFY(e): a Stop after the hour began answered % (purse % -> %, hours_limit %)', v, v_p0, public.hr_purse_of(v_uid), v_s.hours_limit; end if;

    -- (f) A NORMAL STOP STILL ENDS, AND NEVER BEFORE A SETTLED STEP: mid-hour, a settle a little ahead of the clock, the close is that step.
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'training_yard_melee', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '30 minutes', hunt_from = now() - interval '30 minutes',
      settled_to = now() + interval '3 seconds', hours_limit = 1 where id = v_sid;
    v := public.hr_hunt_leave(0, gen_random_uuid());
    select * into v_s from public.hunt_sessions where id = v_sid;
    if coalesce(v->>'pending', '') <> 'true' or v_s.leave_at is distinct from v_s.settled_to or v_s.ended_at is not null then
      raise exception 'VERIFY(f): a mid-hour Stop answered % with leave_at % (settled_to %)', v, v_s.leave_at, v_s.settled_to; end if;
    -- ...the window that walks to it is no hour's edge: nothing is bought, and the engine ends it `left` at the first boundary at or after leave_at.
    v := public.hr_training_hour(v_uid, 0, v_sid, v_s.leave_at, 0, 0, '{}'::jsonb);
    if v <> '{}'::jsonb or (select hours_limit from public.hunt_sessions where id = v_sid) <> 1 then
      raise exception 'VERIFY(f): a window that is no hour''s edge answered %', v; end if;

    -- (g) A HUNT KEEPS ITS HORIZON: a Leave on a hunting ground still waits out the live horizon (settled_to + 32 s).
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    v_hid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '1 minute', hunt_from = now() - interval '1 minute',
      settled_to = now() - interval '5 seconds' where id = v_hid;
    v := public.hr_hunt_leave(0, gen_random_uuid());
    select * into v_s from public.hunt_sessions where id = v_hid;
    if v_s.leave_at is distinct from public.hr_hunt_live_horizon_at(v_s.settled_to) or v_s.leave_at <= now() then
      raise exception 'VERIFY(g): a hunt''s Leave set leave_at % (settled_to %, horizon %)', v_s.leave_at, v_s.settled_to, public.hr_hunt_live_horizon_at(v_s.settled_to); end if;
    -- ...and the one rule says the same for a change of ground: a training session's close is the press, a hunt's the horizon
    if public.hr_hunt_close_at(v_hid) is distinct from public.hr_hunt_live_horizon_at(v_s.settled_to) then
      raise exception 'VERIFY(g): hr_hunt_close_at on a hunt reads %', public.hr_hunt_close_at(v_hid); end if;

    raise exception using errcode = 'HR878', message = 'yard-stop §5 complete - rolling back';
  exception when sqlstate 'HR878' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_uid, v_oth)) or exists (select 1 from auth.users where id in (v_uid, v_oth)) then
    raise exception 'VERIFY(h): §5 LEAKED a probe row'; end if;
  -- (h) THE GRANTS: the helper and the hour stay owner-only; the two verbs stay the signed-in player's own.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_close_at(uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_training_hour(uuid,integer,uuid,timestamp with time zone,bigint,bigint,jsonb)', 'execute') then
      raise exception 'VERIFY(h): % reaches hr_hunt_close_at or hr_training_hour', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_hunt_leave(integer,uuid)', 'execute') or not has_function_privilege('authenticated', 'public.hr_hunt_leave(integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_change(integer,text,uuid)', 'execute') or not has_function_privilege('authenticated', 'public.hr_hunt_change(integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(h): the Leave or change verb''s grants moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'yard-stop: a training leave closes at the press, a Stop before an hour began never buys it, hunts keep the horizon; all green';
end $$;
