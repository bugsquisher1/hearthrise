-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A LEAVE NEVER LANDS INSIDE THE LIVE LOOK-AHEAD (lane b-live-hunt,
-- systems-engineer, 2026-10-20; Tyler's 2026-10-20 ruling on the hunt_live review).
-- STAGED. Game CLOSED: applies on its passing §2; part of the reopen review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- The settle answer seeds the viewer's browser with the next 16 combat swings
-- (src/data/hunt-tuning.js liveSeeds; 16 x 2 s = 32 s past the session's
-- settled_to). A player who saw a death coming in those seeds could leave (or
-- change hunt, or have the leader kick them) before it: hr_hunt_leave /
-- hr_hunt_change / hr_hunt_party_kick closed AT ONCE when the session was freshly
-- settled, walking or stalled, and otherwise set leave_at / change_at = now().
-- Now each is ALWAYS pending, at hr_hunt_live_horizon_at(settled_to) =
-- greatest(now(), settled_to + c_horizon_ms): the settle walks the hunt through
-- every swing the viewer was shown, so a foreseen death still happens there
-- (`died` at that swing, priced as ever). Every later settle extends the horizon
-- only for sessions that have not asked to go.
--
-- RESTATED WHOLE (no body patching): hr_hunt_leave and hr_hunt_change
-- (2026-10-21-hunt-sessions.sql), hr_hunt_party_kick (2026-10-29-party-security.sql),
-- each byte-for-byte but for the at-once branch (gone) and the instant (the helper).
-- §0 md5-pins each pre-image (or this file's own image). NEW owner-only helper
-- hr_hunt_live_horizon_at(timestamptz).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Closes the death dodge. Cost to a player: a leave takes up to 32 s of server
-- time (the hunt goes on, and pays, until then). Moves no value; no table,
-- row or grant change but the helper's (owner only).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the three bodies from their source files; drop the helper.
-- ORDER: after 2026-10-31-party-create-retire.sql (last in the chain). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_leave(integer,uuid)'::regprocedure;
  if md5(v_src) not in ('fec2c5ee4e61788b72e4cb3a458dad15', '3f6444929e66e94f8466d5059d9716ad') then
    raise exception 'PIN: hr_hunt_leave moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_change(integer,text,uuid)'::regprocedure;
  if md5(v_src) not in ('a2a5681e8b6d5753f5ad61db4391d9c4', '72821b550ddf25cbee67ef69af898113') then
    raise exception 'PIN: hr_hunt_change moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_kick(integer,integer,uuid)'::regprocedure;
  if md5(v_src) not in ('bc5588d4b4cb54a95c887c90962e395c', 'b2e750ab039bfae2ca721e9fec9b6ec8') then
    raise exception 'PIN: hr_hunt_party_kick moved (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE HORIZON AND THE THREE DOORS ──────────────────────────────────────
create or replace function public.hr_hunt_live_horizon_at(p_settled_to timestamptz)
returns timestamptz language sql stable set search_path = public, pg_catalog as $$
  -- c_horizon_ms = liveSeeds (16) x the 2 s swing: the last combat swing a hunt_live answer can show.
  select greatest(now(), p_settled_to + make_interval(secs => 32000 / 1000.0))
$$;
revoke execute on function public.hr_hunt_live_horizon_at(timestamptz) from public;
revoke execute on function public.hr_hunt_live_horizon_at(timestamptz) from anon, authenticated, service_role;

create or replace function public.hr_hunt_leave(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_leave';
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

  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  -- ALWAYS PENDING (live-horizon, 2026-10-31): never at once. The settle walks to leave_at, no earlier
  -- than the last combat swing the viewer was shown (hr_hunt_live_horizon_at), so a death the browser
  -- foresaw in its seeds cannot be stepped around: the hunt ends `left` only after it, or `died` at it.
  if v_s.leave_at is null and v_s.change_at is null then
    update public.hunt_sessions set leave_at = public.hr_hunt_live_horizon_at(v_s.settled_to), version = version + 1 where id = v_s.id;
  end if;
  v_r := jsonb_build_object('ok', true, 'pending', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_change(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
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
  update public.hunt_sessions set change_at = public.hr_hunt_live_horizon_at(v_s.settled_to), change_to = p_hunt, version = version + 1 where id = v_s.id;
  v_r := jsonb_build_object('ok', true, 'pending', true, 'session', public.hr_hunt_view(v_s.id));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_kick(p_slot int, p_seat int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): a kicked hunter leaves at the next settle
  -- past the live horizon (2026-10-31-live-horizon.sql).
  c_verb constant text := 'hunt_party_kick';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_t record;
  v_s public.hunt_sessions%rowtype; v_leaving boolean := false;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_seat is null or p_seat < 0 or p_seat > 4 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  select m.user_id, m.slot into v_t from public.hunt_party_members m where m.party_id = v_pid and m.seat = p_seat;
  if v_t.user_id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat')); end if;
  if v_t.user_id = v_uid and v_t.slot = p_slot then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat', 'why', 'self')); end if;
  -- A HUNTER OF THIS PARTY leaves its hunt at leave_at, exactly as its own Leave; out of the member set from then on.
  v_s := public.hr_hunt_lock(v_t.user_id, v_t.slot);
  if v_s.id is not null and v_s.instance_id = v_pid then
    v_leaving := true;
    -- ALWAYS PENDING (live-horizon, 2026-10-31): as its own Leave, never before the last swing shown.
    if v_s.leave_at is null and v_s.change_at is null then
      update public.hunt_sessions set leave_at = public.hr_hunt_live_horizon_at(v_s.settled_to), version = version + 1 where id = v_s.id;
    end if;
  end if;
  delete from public.hunt_party_members where party_id = v_pid and user_id = v_t.user_id and slot = v_t.slot;
  v_r := jsonb_build_object('ok', true, 'leaving', v_leaving, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $$
declare v_src text; v_role text;
begin
  -- (a) the horizon: a stale settle answers now(); a fresh one now() + 32 s.
  if public.hr_hunt_live_horizon_at(now() - interval '1 hour') <> now() then
    raise exception 'VERIFY(a): an old settled_to does not answer now()'; end if;
  if public.hr_hunt_live_horizon_at(now()) <> now() + interval '32 seconds' then
    raise exception 'VERIFY(a): a fresh settled_to does not answer now() + 32 s'; end if;
  -- (b) no door ends a hunt at once any more, and each pends at the horizon.
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_leave(integer,uuid)'::regprocedure;
  if v_src like '%hr_hunt_close(%' or v_src not like '%hr_hunt_live_horizon_at(v_s.settled_to)%' then
    raise exception 'VERIFY(b): hr_hunt_leave still closes at once or pends at now()'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_change(integer,text,uuid)'::regprocedure;
  if v_src like '%hr_hunt_swap(%' or v_src not like '%hr_hunt_live_horizon_at(v_s.settled_to)%' then
    raise exception 'VERIFY(b): hr_hunt_change still swaps at once or pends at now()'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_kick(integer,integer,uuid)'::regprocedure;
  if v_src like '%hr_hunt_close(%' or v_src not like '%hr_hunt_live_horizon_at(v_s.settled_to)%' then
    raise exception 'VERIFY(b): hr_hunt_party_kick still closes at once or pends at now()'; end if;
  -- (c) the helper is the owner's; the doors keep the client's grant.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_live_horizon_at(timestamptz)', 'execute') then
      raise exception 'VERIFY(c): % reaches hr_hunt_live_horizon_at', v_role; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_hunt_leave(integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_party_kick(integer,integer,uuid)', 'execute') then
    raise exception 'VERIFY(c): a door lost its client grant'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'live-horizon: leave / change / kick pend at greatest(now, settled_to + 32 s); no at-once end; grants hold';
end $$;
