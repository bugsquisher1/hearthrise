-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-11-party-alone.sql — A PARTY OF ONE WITH NOTHING TO WAIT FOR IS NO PARTY (full-game blind sweep 2026-11-18, finding A9;
-- lane/c-party-leave-stale-tab, systems-engineer). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit.
-- Pre-EA (CLAUDE.md §2): applies on its passing §5; on the EA Security list (party verbs restated, no value moves). It has no
-- client half.
--
-- THE BUG. A player invited their own second hero, then pressed Leave party on the first. Every way out of a party (Leave,
-- Kick, the sweep's lost seat) closed the party only when NOBODY was left, so the second hero sat on alone in "Bryony's
-- party" for good. Every reader of membership then treated her as partied: hr_training_quote refused her after-hunt yard
-- (`in_party`, "Bryony waited in town: training is solo") on every return for nine days, Hunt again answered `party_hunt`,
-- and a ground other than the party's answered `party_hunt_mismatch`. The same leftover follows a declined or expired
-- invite (the first invite makes the party, 2026-10-28-party-flow.sql).
--
-- WHY THE PARTY CLOSES RATHER THAN THE READERS LOOKING AWAY. Membership is read by some fifty bodies (the gates above, the
-- party view and finder, the entry and start, the tower and catacomb sections, boards, the town). Teaching each solo gate to
-- ignore "a party of one" would leave the row, the panel and every other reader saying the hero is in a party while the
-- gates say she is not: two truths. Closing the party at the moment it stops being one keeps the one truth every reader
-- already reads. A party of one is still a real party while it WAITS for someone: the invite it sent is live (an hour,
-- hr_party_invite_ttl), it is listed in the finder, or a hunt is running in its instance (closing it under a hunt would
-- drop the instance's leader, hold seat and scaled level mid-hunt, hr_scaled_hunt_of / hr_hunt_instance_read).
--
-- §1 hr_party_alone(party, less_user, less_slot) -> boolean, stable: the ONE predicate. Open, and, not counting the seat
--    named (one about to go), either no seat left, or one seat and nothing to wait for (no hunt open in its instance, no
--    invite inside its hour, not listed). hr_party_close_if_alone(party, wait, less_user, less_slot) -> boolean: under the
--    party's row lock (`wait` false: skip a row another verb holds, the sweep gets it next minute), re-proves it and closes
--    the party as Disband does: its invites and EVERY seat go in one statement, closed_at is stamped. Both owner-only.
-- §2 THE TRANSITIONS. hr_hunt_party_leave and the sweep's lost seat close the party WITH the seat that goes, in one
--    statement, so each seat hears it once (hr_party_nudge_trg: one push a seat, the rule 2027-02-18-party-truth.sql keeps);
--    else that seat goes alone, as before. hr_hunt_party_kick closes a leader it left alone (the leader is the caller: its
--    own client re-reads, no push). The sweep (every minute) also closes every party alone now: one whose hunt has since
--    ended, whose invite was declined or ran out its hour, whose listing came down. A decline is NOT restated: closing the
--    inviter's party inside it would push the idle inviter twice (the seat and the `declined` notice); the sweep closes it.
--    Leave, kick and sweep are RESTATED WHOLE from 2027-02-18-party-truth.sql (pinned below).
-- §3 hr_hunt_after_start (2027-04-25-hunt-itinerary.sql, pinned) closes the hero's lone party, skip-locked, before its plan
--    reads the membership: the deferred case (the other seat left while this hero still hunted) is then decided by the
--    rule, not by which minute-cron ran first. One statement added, the rest verbatim.
-- §4 THE LEFTOVERS ON LIVE: every open party that is alone now is closed once, set-based through the same helper.
--
-- EXPLOIT SURFACE. No new client door: both helpers are nobody's. No value moves; nothing is written but party rows, seat
-- rows and invite rows, the way Disband writes them. A client cannot make another player's party close: a leave and a kick
-- already change that party; closing is the rule applied to what they left. CONCURRENCY: Leave, Kick and the sweep's drop
-- hold the party's lock already (re-taking it is immediate); the sweep's pass and the after-hunt start skip a locked row
-- rather than wait (no new lock-order edge). COST: one indexed count and three indexed probes a transition; the sweep's
-- pass reads open parties once a minute (bounded by its limit).
-- EDGE: none. RESIDUE: none. CLIENT: none (party-intents.js afterLeave already re-reads every own seat; another account's
-- seat hears its seat row go through hr_party_nudge_trg).
-- REVERSIBLE: re-apply the four pinned pre-images (2027-02-18-party-truth.sql x3, 2027-04-25-hunt-itinerary.sql), drop the
-- two helpers. Closed parties stay closed (a re-invite makes a new one, as it always has).
-- ORDER: after 2027-05-10-tally-catacomb-armor.generated.sql; shares no body with any file after 2027-04-25.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: FAIL CLOSED IF ANOTHER FILE MOVED A BODY THIS FILE RESTATES ─────
do $mig$
declare v_md5 text; r record;
begin
  if to_regprocedure('public.hr_party_invite_ttl()') is null or to_regclass('public.hunt_party_invites') is null
     or to_regprocedure('public.hr_party_notice(uuid,integer,text,uuid,integer,text)') is null then
    raise exception 'PRECONDITION: apply 2027-02-18-party-truth.sql first'; end if;
  for r in select * from (values
    ('public.hr_hunt_party_leave(integer,uuid)', '4ef2331a4b0b0cac54521e88e7728170', 'd1022ba9ddb57929df55a54148616df6'),
    ('public.hr_hunt_party_kick(integer,integer,uuid)', 'b1b39309b4d4e579d7167437c85a4651', 'a5caaa70c20ce9cb009cf065c9d805ff'),
    ('public.hr_hunt_party_sweep(integer)', 'db50749b9f4d4205828c8d8b9ce8e810', 'a17dd215826ed31a747c9e1c489129e4'),
    ('public.hr_hunt_after_start(uuid)', 'c173dc7b748d38ebca7122c396dcbe3b', '48ed80847d5e95b2ba5d739ad97df592')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither the image this file was written over (%) nor its own (%) - md5 %: another file moved it; restate from the new image',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ONE PREDICATE, AND THE CLOSE ──────────────────────────────────────
create or replace function public.hr_party_alone(p_party uuid, p_less_user uuid default null, p_less_slot integer default null)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- PARTY-ALONE (2027-05-11-party-alone.sql): an open party that, not counting the seat named (one about to go), has no seat
  -- left, or one seat and nothing to wait for: no hunt open in its instance, no invite inside its hour, not listed.
  select coalesce((
    select case when c.n = 0 then true
                else c.n = 1 and not p.listed
                     and not exists (select 1 from public.hunt_sessions h where h.instance_id = p.id and h.ended_at is null)
                     and not exists (select 1 from public.hunt_party_invites i
                                      where i.party_id = p.id and i.created_at > now() - public.hr_party_invite_ttl()) end
      from public.hunt_parties p
      cross join lateral (select count(*)::int as n from public.hunt_party_members m
                           where m.party_id = p.id and (m.user_id, m.slot) is distinct from (p_less_user, p_less_slot)) c
     where p.id = p_party and p.closed_at is null), false)
$$;

create or replace function public.hr_party_close_if_alone(p_party uuid, p_wait boolean default true,
                                                          p_less_user uuid default null, p_less_slot integer default null)
returns boolean language plpgsql set search_path = public, pg_catalog as $$
-- PARTY-ALONE (2027-05-11-party-alone.sql): close the party, as Disband does, when hr_party_alone says it is no party any more
-- (not counting the seat named, which goes with it). Every seat goes in ONE statement, so each hears it once. Under its row
-- lock; `p_wait` false skips a row another verb holds (the sweep's pass gets it next minute). True when it closed.
begin
  if p_party is null then return false; end if;
  if coalesce(p_wait, true) then
    perform 1 from public.hunt_parties where id = p_party and closed_at is null for update;
  else
    perform 1 from public.hunt_parties where id = p_party and closed_at is null for update skip locked;
  end if;
  if not found or not public.hr_party_alone(p_party, p_less_user, p_less_slot) then return false; end if;
  delete from public.hunt_party_invites where party_id = p_party;
  delete from public.hunt_party_members where party_id = p_party;
  update public.hunt_parties set closed_at = now() where id = p_party;
  return true;
end $$;

-- ── §2 THE TRANSITIONS (restated whole from 2027-02-18-party-truth.sql) ─────
create or replace function public.hr_hunt_party_kick(p_slot integer, p_seat integer, p_idem uuid)
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
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the removed hero hears who removed it.
  perform public.hr_party_notice(v_t.user_id, v_t.slot, 'removed', v_uid, p_slot);
  -- PARTY-ALONE (2027-05-11-party-alone.sql): a leader the kick left alone, with nothing to wait for, is in no party before its
  -- answer reads its party (its own client re-reads it: no push).
  perform public.hr_party_close_if_alone(v_pid);
  v_r := jsonb_build_object('ok', true, 'leaving', v_leaving, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_leave(p_slot integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_leave';
  v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_next record; v_m record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is not null and v_s.instance_id = v_pid then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open')); end if;
  -- PARTY-TRUTH (2027-02-18-party-truth.sql): the seats left behind hear who went.
  for v_m in select m.user_id, m.slot from public.hunt_party_members m
              where m.party_id = v_pid and (m.user_id, m.slot) is distinct from (v_uid, p_slot) order by m.seat loop
    perform public.hr_party_notice(v_m.user_id, v_m.slot, 'left', v_uid, p_slot);
  end loop;
  -- PARTY-ALONE (2027-05-11-party-alone.sql): a leave that leaves one seat (or none) and nothing to wait for closes the party
  -- with it, every seat in one statement (each hears it once); else this seat goes alone and the lead passes on.
  if not public.hr_party_close_if_alone(v_pid, true, v_uid, p_slot) then
    delete from public.hunt_party_members where party_id = v_pid and user_id = v_uid and slot = p_slot;
    if v_p.leader_user = v_uid and v_p.leader_slot = p_slot then
      select m.user_id, m.slot into v_next from public.hunt_party_members m where m.party_id = v_pid order by m.seat limit 1;
      update public.hunt_parties set leader_user = v_next.user_id, leader_slot = v_next.slot where id = v_pid;
    end if;
  end if;
  v_r := jsonb_build_object('ok', true, 'party', null);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_sweep(p_limit integer default 200)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_m record; v_n int := 0; v_o record; v_l record;
begin
  for v_m in
    select m.party_id, m.user_id, m.slot
      from public.hunt_party_members m join public.hunt_parties p on p.id = m.party_id and p.closed_at is null
     where not exists (select 1 from public.hunt_sessions h where h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null)
       and public.hr_party_last_seen(m.user_id, m.joined_at) <= now() - public.hr_party_seat_keep()
     order by m.joined_at, m.party_id, m.seat
     limit greatest(0, least(coalesce(p_limit, 200), 1000))
  loop
    perform 1 from public.hunt_parties where id = v_m.party_id and closed_at is null for update skip locked;
    continue when not found;
    -- Re-proved under the lock: still seated, still out of every hunt, still unseen.
    continue when not exists (select 1 from public.hunt_party_members m where m.party_id = v_m.party_id
                                and m.user_id = v_m.user_id and m.slot = v_m.slot
                                and public.hr_party_last_seen(m.user_id, m.joined_at) <= now() - public.hr_party_seat_keep())
               or exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot and h.ended_at is null);
    -- PARTY-TRUTH (2027-02-18-party-truth.sql): the seats left hear why one went.
    for v_o in select o.user_id, o.slot from public.hunt_party_members o
                where o.party_id = v_m.party_id and (o.user_id, o.slot) is distinct from (v_m.user_id, v_m.slot) order by o.seat loop
      perform public.hr_party_notice(v_o.user_id, v_o.slot, 'dropped', v_m.user_id, v_m.slot);
    end loop;
    -- PARTY-ALONE (2027-05-11-party-alone.sql): a lost seat that leaves one seat (or none) and nothing to wait for closes the
    -- party with it, every seat in one statement (each hears it once); else it goes alone, as before.
    if not public.hr_party_close_if_alone(v_m.party_id, true, v_m.user_id, v_m.slot) then
      perform public.hr_party_drop(v_m.party_id, v_m.user_id, v_m.slot);
    end if;
    v_n := v_n + 1;
  end loop;
  -- PARTY-ALONE: every party alone now closes: one whose hunt has since ended, whose invite was declined or ran out its hour,
  -- whose listing came down. Skip-locked; hr_party_close_if_alone re-proves it under the lock.
  for v_l in
    select p.id from public.hunt_parties p
     where p.closed_at is null and public.hr_party_alone(p.id)
     order by p.created_at, p.id
     limit greatest(0, least(coalesce(p_limit, 200), 1000))
  loop
    if public.hr_party_close_if_alone(v_l.id, false) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- ── §3 THE DEFERRED START READS NO LEFTOVER (restated whole from 2027-04-25-hunt-itinerary.sql) ──
create or replace function public.hr_hunt_after_start(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_s public.hunt_sessions%rowtype; v_c public.hr_hunt_after_choices%rowtype; v_q jsonb; v_r jsonb; v_done jsonb; v_why text;
  v_price bigint; v_sub text; v_claims text;
  v_key constant uuid := md5('hunt_after:' || p_session::text)::uuid;
begin
  select * into v_s from public.hunt_sessions where id = p_session for update skip locked;
  if not found or v_s.after_done->>'state' is distinct from 'pending' then return null; end if;
  select * into v_c from public.hr_hunt_after_choices c where c.choice = v_s.after_choice and c.runs = 'training';
  if not found then v_why := 'no_training';
  -- THE HERO MUST STILL BE WHERE THE HUNT LEFT IT: idle in town, with no hunt since. A player who came back and did something
  -- else has made their own choice.
  elsif exists (select 1 from public.hunt_sessions h where h.user_id = v_s.user_id and h.slot = v_s.slot and h.entered_at > v_s.entered_at)
        or coalesce((select ps.active_kind from public.player_state ps where ps.user_id = v_s.user_id and ps.slot = v_s.slot), 'gone') <> 'idle' then
    v_why := 'moved_on';
  else
    -- PARTY-ALONE (2027-05-11-party-alone.sql): a party this hero now sits in alone, with nothing to wait for, closes before the
    -- plan reads its membership (the other seat left while this hunt still ran), skip-locked.
    perform public.hr_party_close_if_alone(public.hr_hunt_party_of(v_s.user_id, v_s.slot), false);
    -- THE SERVER'S PRICE, on the server's clock, for the skill the hunt froze. Never a number a client sent.
    v_q := public.hr_training_quote(v_s.user_id, v_s.slot, v_s.after_skill, v_c.place);
    if v_q is null then v_why := 'no_training';
    elsif not (v_q->>'available')::boolean then v_why := v_q->>'why';
    else
      v_price := (v_q->>'price')::bigint;
      -- hr_training_start is the ONE door: called as the hunt's own hero (its JWT subject for this call, then put back).
      v_sub := current_setting('request.jwt.claim.sub', true); v_claims := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claim.sub', v_s.user_id::text, true),
              set_config('request.jwt.claims', jsonb_build_object('sub', v_s.user_id, 'role', 'authenticated')::text, true);
      v_r := public.hr_training_start(v_s.slot, v_s.after_skill, v_c.place, v_price, v_key);
      perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true), set_config('request.jwt.claims', coalesce(v_claims, ''), true);
      if coalesce(v_r->>'ok', 'false') = 'true' then
        v_done := jsonb_build_object('state', 'started', 'skill', v_s.after_skill, 'place', v_c.place, 'fee', v_price,
                                     'session', v_r->'session_id', 'at', now());
      elsif v_r->>'error' in ('rate_limited', 'quote_changed', 'intent_in_flight') and v_s.ended_at > now() - interval '10 minutes' then
        return jsonb_build_object('state', 'pending', 'why', v_r->>'error');   -- the next sweep tries again
      else
        v_why := coalesce(v_r->>'error', 'refused');
      end if;
    end if;
  end if;
  if v_done is null then
    v_done := jsonb_build_object('state', 'waited', 'why', v_why, 'skill', v_s.after_skill, 'place', v_c.place, 'at', now())
      || case when coalesce(v_r->>'fee', v_q->>'price') is not null then jsonb_build_object('fee', coalesce((v_r->>'fee')::bigint, (v_q->>'price')::bigint)) else '{}'::jsonb end
      || case when v_r ? 'purse' then jsonb_build_object('purse', v_r->'purse') else '{}'::jsonb end
      || case when v_q ? 'need' then jsonb_build_object('need', v_q->'need', 'level', v_q->'level') else '{}'::jsonb end;
  end if;
  update public.hunt_sessions set after_done = v_done where id = p_session;
  -- THE PLAN'S OUTCOME, journalled (no gold: the fee is hr_training_start's own row). The hunt is named in meta, never in
  -- session_id: a session-stamped row folds into the hunt's own tally.
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_s.user_id, v_s.slot, 'hunt', 'after_hunt', v_done || jsonb_build_object('hunt_session', p_session, 'plan', v_s.after_choice));
  return v_done;
end $fn$;

-- ── THE GRANTS: both helpers are nobody's ─────────────────────────────────────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_party_alone(uuid,uuid,integer)', 'public.hr_party_close_if_alone(uuid,boolean,uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;

-- ── §4 THE LEFTOVERS ON LIVE: every party alone now closes, once, through the same helper ──
do $mig$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select p.id from public.hunt_parties p where p.closed_at is null and public.hr_party_alone(p.id) order by p.created_at, p.id loop
    if public.hr_party_close_if_alone(v_id) then v_n := v_n + 1; end if;
  end loop;
  raise notice 'party-alone: % party(ies) of one with nothing to wait for closed', v_n;
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
do $$
declare
  c_a constant uuid := '000000d9-0000-4000-a000-00007a110001';
  c_b constant uuid := '000000d9-0000-4000-a000-00007a110002';
  c_c constant uuid := '000000d9-0000-4000-a000-00007a110003';
  k   text := '000000d9-0000-4000-a000-0000';
  v   jsonb; v_pid uuid; v_u uuid; v_hunt text; v_choice text; v_sa uuid; v_sb uuid; v_sig text;
begin
  -- (a) THE SHAPE: both helpers are nobody's; the surface agrees; no party is alone after §4.
  foreach v_sig in array array['public.hr_party_alone(uuid,uuid,integer)', 'public.hr_party_close_if_alone(uuid,boolean,uuid,integer)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or has_function_privilege('authenticated', v_sig::regprocedure, 'execute')
       or has_function_privilege('service_role', v_sig::regprocedure, 'execute') then
      raise exception 'party-alone §5(a): % is reachable by a client', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  if exists (select 1 from public.hunt_parties p where p.closed_at is null and public.hr_party_alone(p.id)) then
    raise exception 'party-alone §5(a): a party of one with nothing to wait for is still open'; end if;

  begin
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h using (hunt_id) order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select c.choice into v_choice from public.hr_hunt_after_choices c where c.runs = 'training' order by c.choice limit 1;
    if v_hunt is null or v_choice is null then raise exception 'party-alone §5-harness: no ground or no training choice in the catalogues'; end if;
    foreach v_u in array array[c_a, c_b, c_c] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe Alone ' || right(v_u::text, 1)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'party-alone §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-alone §5-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u, 0, now()) on conflict (user_id) do update set seen_at = now();
      delete from public.hr_rate_counters where user_id = v_u;
    end loop;

    -- (b) THE FINDING: A invites B, B joins, A leaves. B is in no party, and the party is closed.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Alone 2', (k || '7a110101')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_b, 0)->'party_invites'->0->>'id')::uuid, (k || '7a110102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(c_b, 0) is distinct from v_pid then raise exception 'party-alone §5-harness: B''s join answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_leave(0, (k || '7a110103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-alone §5-harness: A''s leave answered %', v; end if;
    if public.hr_hunt_party_of(c_b, 0) is not null or (select closed_at from public.hunt_parties where id = v_pid) is null then
      raise exception 'party-alone §5(b): the seat a leave left alone is still in a party'; end if;
    if not (public.hr_state_of(c_b, 0)->'party_notices') @> '[{"kind": "left", "who": "Probe Alone 1"}]'::jsonb then
      raise exception 'party-alone §5(b): the seat left behind was not told: %', public.hr_state_of(c_b, 0)->'party_notices'; end if;

    -- (c) A PARTY OF THREE KEEPS ITS TWO: the lead passes, the party stays; the next leave closes it.
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_invite(0, 'Probe Alone 2', (k || '7a110104')::uuid);
    v := public.hr_hunt_party_invite(0, 'Probe Alone 3', (k || '7a110105')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    foreach v_u in array array[c_b, c_c] loop
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_u, 0)->'party_invites'->0->>'id')::uuid, (k || '7a11020' || right(v_u::text, 1))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-alone §5-harness: %''s join answered %', v_u, v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_leave(0, (k || '7a110108')::uuid);
    if public.hr_hunt_party_of(c_b, 0) is distinct from v_pid or public.hr_hunt_party_of(c_c, 0) is distinct from v_pid
       or (select leader_user from public.hunt_parties where id = v_pid) is distinct from c_b then
      raise exception 'party-alone §5(c): a party of three lost its two or its lead on one leave'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_kick(0, (select seat from public.hunt_party_members where user_id = c_c and slot = 0), (k || '7a110109')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'party' is distinct from 'null'::jsonb or public.hr_hunt_party_of(c_b, 0) is not null then
      raise exception 'party-alone §5(c): the leader a kick left alone answered % and is in %', v->'party', public.hr_hunt_party_of(c_b, 0); end if;

    -- (d) A LIVE INVITE IS WORTH WAITING FOR: A's party of one stays while B's invite is live; after B's decline the sweep closes it.
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Alone 2', (k || '7a110110')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    if v_pid is null then raise exception 'party-alone §5-harness: the invite made no party: %', v; end if;
    perform public.hr_hunt_party_sweep(1000);
    if public.hr_hunt_party_of(c_a, 0) is distinct from v_pid then raise exception 'party-alone §5(d): a party waiting on a live invite was closed'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_decline(0, (public.hr_state_of(c_b, 0)->'party_invites'->0->>'id')::uuid, (k || '7a110111')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-alone §5-harness: the decline answered %', v; end if;
    perform public.hr_hunt_party_sweep(1000);
    if public.hr_hunt_party_of(c_a, 0) is not null then
      raise exception 'party-alone §5(d): the inviter is still in its party of one after the decline and a sweep'; end if;

    -- (e) A HUNT IS WORTH WAITING FOR, AND ITS END IS NOT: A and B hunt; B goes home and leaves; A hunts on in its party.
    --     A's hunt ends with a training plan: the deferred start finds A in no party before it reads the gate.
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Alone 2', (k || '7a110112')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_b, 0)->'party_invites'->0->>'id')::uuid, (k || '7a110113')::uuid);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_start(0, v_hunt, (k || '7a110114')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-alone §5-harness: the start answered %', v; end if;
    select id into v_sa from public.hunt_sessions where user_id = c_a and slot = 0 and ended_at is null;
    select id into v_sb from public.hunt_sessions where user_id = c_b and slot = 0 and ended_at is null;
    perform public.hr_hunt_close(v_sb, 'left', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_b and slot = 0;
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_leave(0, (k || '7a110115')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-alone §5-harness: B''s leave answered %', v; end if;
    perform public.hr_hunt_party_sweep(1000);
    if public.hr_hunt_party_of(c_a, 0) is distinct from v_pid then raise exception 'party-alone §5(e): a party was closed under its running hunt'; end if;
    perform public.hr_hunt_close(v_sa, 'stamina', now(), true);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a and slot = 0;
    update public.hunt_sessions set after_choice = v_choice, after_done = '{"state": "pending"}'::jsonb where id = v_sa;
    v := public.hr_hunt_after_start(v_sa);
    if public.hr_hunt_party_of(c_a, 0) is not null then raise exception 'party-alone §5(e): the deferred start read a party of one (%)', v; end if;
    if v->>'why' = 'in_party' then raise exception 'party-alone §5(e): the yard was refused as partied: %', v; end if;

    -- (f) A LISTING IS WORTH WAITING FOR: a listed party a joiner leaves stays open for the next.
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Alone 3', (k || '7a110116')::uuid);
    v_pid := public.hr_hunt_party_of(c_a, 0);
    v := public.hr_hunt_party_list(0, true, (k || '7a110117')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-alone §5-harness: the listing answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_c, 0)->'party_invites'->0->>'id')::uuid, (k || '7a110118')::uuid);
    v := public.hr_hunt_party_leave(0, (k || '7a110119')::uuid);
    perform public.hr_hunt_party_sweep(1000);
    if public.hr_hunt_party_of(c_a, 0) is distinct from v_pid then raise exception 'party-alone §5(f): a listed party was closed under its leader'; end if;

    -- (g) THE LEFTOVER ITSELF (the rows live holds before §4): a lone seat with nothing pending is closed by the sweep's pass.
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v_pid := public.hr_party_open(c_c, 0);
    perform public.hr_hunt_party_sweep(1000);
    if public.hr_hunt_party_of(c_c, 0) is not null then raise exception 'party-alone §5(g): the sweep left a party of one with nothing to wait for'; end if;
    raise exception 'party-alone §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'party-alone §5: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'party-alone: a leave, a kick, a decline and a lost seat close a party left alone with nothing to wait for; an invite, a listing and a hunt keep it; the after-hunt yard reads no leftover; all green';
end $$;
