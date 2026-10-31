-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A PARTY CHANGE REACHES THE OTHER PLAYER'S SCREEN (lane a-party-soak, qa-engineer, 2026-10-31).
-- STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §4, one file via the Coordinator's apply
-- tool, never inside begin/commit, never 00:00–00:10 UTC. On the EA Security list (a new push).
-- DB half; the client half (src/session/account-session.js) rides the next release, either order safe:
-- a client without it refuses the unknown message (envelope.js frameEnvelope `malformed`) and is as before.
--
-- ── ROOT CAUSE ──────────────────────────────────────────────────────────────
-- A hero standing idle in town asks the server nothing: the hunt re-read runs only while a hunt is open, and a
-- frame is sent only by a value write (hr_apply, the instance settle). No party verb is one, and a frame carries
-- a version a party verb never moves (envelope.js would drop it `duplicate`). So on another player's open screen:
--  · an invite never showed its toast (PARTY_SPEC §1.3 "a toast anywhere in the game"): 40 s in the local world,
--    until that player happened to press something that re-reads;
--  · the leader's Start marched them into a hunt their screen did not show until the instance's first settle;
--  · a kick, a Disband, a member joining or leaving, a new leader: the panel stayed stale.
-- Own heroes never showed this: the acting client re-reads its own (party-intents.js settled).
--
-- ── THE FIX (the contract) ──────────────────────────────────────────────────
-- §1 hr_party_nudge(user, slot), owner-only: one { t:'nudge' } on the hero's private frame topic, when frames are on
--    (hr_tick_config.frame_push), Realtime exists, the hero is open in a client (hr_frame_wanted: presence within
--    75 s) and it is another account's hero than the caller's (the acting client already re-reads its own). The
--    message carries NO state: it says "read yourself", and the client answers with one hr_load (coalesced: one per
--    SESSION_CONFIG.nudgeMs), so nothing in it can disagree with the server. Its whole body is inside one exception
--    block: a push failure never fails a party verb (hr_frame_send's rule).
-- §2 FOUR AFTER triggers, the one place every path passes (every verb, the sweep, a future one), no verb touched:
--    hunt_party_invites INSERT      the invited hero
--    hunt_party_members INSERT/DELETE  that hero and every other seat of the party
--    hunt_parties UPDATE of hunt_id, leader_user, leader_slot, hold_seat, closed_at  every seat
--    hunt_sessions INSERT into a party's instance  that hero (the leader's Start walked it in)
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new client grant. The receive-only policy on realtime.messages (hr_realtime_policies) already limits a topic to
-- its owner; a nudge names nobody and carries nothing. The worst a griefer buys with invites (already rate-gated at
-- 12 a minute, hr_rpc_gate 'party') is one hr_load per nudgeMs on an open client that is already reading.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- realtime.send only inserts into realtime.messages inside the verb's transaction: a rolled-back verb sends nothing,
-- and a committed one is read by the client after its commit. No lock taken beyond the row the trigger fired on.
-- A second apply: create or replace, drop trigger if exists.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the four triggers, their function and hr_party_nudge. No column, row or player value is touched.
-- ORDER: after 2027-02-11-hunt-loot-past-bag-cap.sql (unrelated; no shared body). EDGE: none.
-- COST (100x players): none per tick. Party verbs are rare; each sends at most four small messages.
-- Proof: tests/party-flow.mjs PF-NUDGE + §4 below; the client's half tests/session-core.mjs NUDGE. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE NUDGE ────────────────────────────────────────────────────────────
create or replace function public.hr_party_nudge(p_user uuid, p_slot integer)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_on boolean;
begin
  -- PARTY-NUDGE (2027-02-11-party-nudge.sql). A push is a courtesy over facts the database already holds: any failure
  -- degrades to "no nudge" (the next read heals it), never to a refused party verb.
  begin
    if p_user is null or p_slot is null then return; end if;
    -- The acting client re-reads its own heroes (party-intents.js settled); the sweep and the engine have no caller.
    if auth.uid() is not distinct from p_user then return; end if;
    select c.frame_push into v_on from public.hr_tick_config c where c.id;
    if not coalesce(v_on, false) then return; end if;
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;
    if not public.hr_frame_wanted(p_user, p_slot) then return; end if;
    perform realtime.send(jsonb_build_object('t', 'nudge'), 'frame', public.hr_frame_topic(p_user, p_slot), true);
  exception when others then
    raise warning 'hr_party_nudge: not sent to %/% (%)', p_user, p_slot, sqlerrm;
  end;
end $$;

-- ── §2 THE TRIGGERS ─────────────────────────────────────────────────────────
create or replace function public.hr_party_nudge_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_party uuid; v_user uuid; v_slot int; r record;
begin
  if tg_table_name = 'hunt_party_invites' then
    perform public.hr_party_nudge(new.to_user, new.to_slot);
    return null;
  elsif tg_table_name = 'hunt_sessions' then
    -- Only a party's instance (its id is the party's): a solo enter is the hero's own client's.
    if exists (select 1 from public.hunt_parties p where p.id = new.instance_id) then
      perform public.hr_party_nudge(new.user_id, new.slot);
    end if;
    return null;
  elsif tg_table_name = 'hunt_party_members' then
    if tg_op = 'DELETE' then
      v_party := old.party_id; v_user := old.user_id; v_slot := old.slot;
    else
      v_party := new.party_id; v_user := new.user_id; v_slot := new.slot;
    end if;
    perform public.hr_party_nudge(v_user, v_slot);
  else
    v_party := new.id;
  end if;
  for r in select m.user_id, m.slot from public.hunt_party_members m
            where m.party_id = v_party and (m.user_id, m.slot) is distinct from (v_user, v_slot) loop
    perform public.hr_party_nudge(r.user_id, r.slot);
  end loop;
  return null;
end $$;

drop trigger if exists hr_party_nudge_invite on public.hunt_party_invites;
create trigger hr_party_nudge_invite after insert on public.hunt_party_invites
  for each row execute function public.hr_party_nudge_trg();
drop trigger if exists hr_party_nudge_member on public.hunt_party_members;
create trigger hr_party_nudge_member after insert or delete on public.hunt_party_members
  for each row execute function public.hr_party_nudge_trg();
drop trigger if exists hr_party_nudge_party on public.hunt_parties;
create trigger hr_party_nudge_party after update of hunt_id, leader_user, leader_slot, hold_seat, closed_at on public.hunt_parties
  for each row when (old.hunt_id is distinct from new.hunt_id or old.leader_user is distinct from new.leader_user or old.leader_slot is distinct from new.leader_slot
                     or old.hold_seat is distinct from new.hold_seat or old.closed_at is distinct from new.closed_at)
  execute function public.hr_party_nudge_trg();
drop trigger if exists hr_party_nudge_session on public.hunt_sessions;
create trigger hr_party_nudge_session after insert on public.hunt_sessions
  for each row execute function public.hr_party_nudge_trg();

-- ── §3 GRANTS: owner-only ───────────────────────────────────────────────────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_party_nudge(uuid,integer)', 'public.hr_party_nudge_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- A0 (leader) and B (a stranger, open in a client), C (a stranger, closed). Each step counts B's nudges.
do $$
declare
  c_a constant uuid := '000000d7-0000-4000-a000-00000d6e0001';
  c_b constant uuid := '000000d7-0000-4000-a000-00000d6e0002';
  c_c constant uuid := '000000d7-0000-4000-a000-00000d6e0003';
  k   text := '000000d7-0000-4000-a000-0000';
  v   jsonb; v_pid uuid; v_hunt text; v_t text; v_n int; v_u uuid;
begin
  begin
    if to_regnamespace('realtime') is null then
      create schema realtime;
      create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
        event text, payload jsonb, private boolean, inserted_at timestamptz not null default now());
      create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
        'insert into realtime.messages (topic, extension, event, payload, private) values ($3, ''broadcast'', $2, $1, $4)';
    end if;
    update public.hr_tick_config set frame_push = true where id;
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    foreach v_u in array array[c_a, c_b, c_c] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe Nudge ' || right(v_u::text, 1)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'party-nudge §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-nudge §4-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u, 0, now()) on conflict (user_id) do update set seen_at = now();
    end loop;
    -- B is open in a client; C is not.
    insert into public.character_presence (user_id, slot, seen_at) values (c_b, 0, now()) on conflict (user_id, slot) do update set seen_at = now();
    delete from public.character_presence where user_id = c_c;
    v_t := public.hr_frame_topic(c_b, 0);
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);

    -- (a) THE INVITE reaches B's topic: one state-free nudge. C, closed, gets none.
    select count(*) into v_n from realtime.messages where topic = v_t;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Nudge 2', (k || '0d6e0101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-nudge §4-harness: the invite answered %', v; end if;
    if (select count(*) from realtime.messages where topic = v_t) <> v_n + 1
       or not exists (select 1 from realtime.messages where topic = v_t and event = 'frame' and payload = '{"t":"nudge"}'::jsonb) then
      raise exception 'party-nudge §4(a): the invite sent % message(s) to the invited hero, want one nudge', (select count(*) from realtime.messages where topic = v_t) - v_n; end if;
    v_pid := public.hr_hunt_party_of(c_a, 0);
    v := public.hr_hunt_party_invite(0, 'Probe Nudge 3', (k || '0d6e0102')::uuid);
    if exists (select 1 from realtime.messages where topic = public.hr_frame_topic(c_c, 0)) then
      raise exception 'party-nudge §4(a): a hero open in no client was nudged'; end if;

    -- (b) B ACCEPTS as itself: the acting client re-reads itself, so B's own verb nudges only the others.
    select count(*) into v_n from realtime.messages where topic = v_t;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(c_b, 0)->'party_invites'->0->>'id')::uuid, (k || '0d6e0103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-nudge §4-harness: the accept answered %', v; end if;
    if (select count(*) from realtime.messages where topic = v_t) <> v_n then raise exception 'party-nudge §4(b): B''s own accept nudged B'; end if;

    -- (c) THE LEADER'S START walks B in: B hears it at once.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_start(0, v_hunt, (k || '0d6e0104')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-nudge §4-harness: the start answered %', v; end if;
    if (select count(*) from realtime.messages where topic = v_t) <= v_n then raise exception 'party-nudge §4(c): the leader''s Start sent B no nudge'; end if;

    -- (d) A KICK from the leader reaches the kicked hero, once.
    select count(*) into v_n from realtime.messages where topic = v_t;
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_kick(0, (select seat from public.hunt_party_members where party_id = v_pid and user_id = c_b and slot = 0), (k || '0d6e0105')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-nudge §4-harness: the kick answered %', v; end if;
    if (select count(*) from realtime.messages where topic = v_t) <> v_n + 1 then
      raise exception 'party-nudge §4(d): the kick sent the kicked hero % nudge(s)', (select count(*) from realtime.messages where topic = v_t) - v_n; end if;

    -- (e) FRAMES OFF: silence, and the verb still lands.
    update public.hr_tick_config set frame_push = false where id;
    select count(*) into v_n from realtime.messages where topic = v_t;
    delete from public.hr_rate_counters where user_id in (c_a, c_b, c_c);
    v := public.hr_hunt_party_invite(0, 'Probe Nudge 2', (k || '0d6e0106')::uuid);
    if (select count(*) from realtime.messages where topic = v_t) <> v_n then raise exception 'party-nudge §4(e): a nudge went out with frames off'; end if;
    raise exception 'party-nudge §4: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'party-nudge §4: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  foreach v_t in array array['public.hr_party_nudge(uuid,integer)', 'public.hr_party_nudge_trg()'] loop
    if has_function_privilege('anon', v_t::regprocedure, 'execute') or has_function_privilege('authenticated', v_t::regprocedure, 'execute')
       or has_function_privilege('service_role', v_t::regprocedure, 'execute') then
      raise exception 'party-nudge §4: % is reachable by a client', v_t; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-nudge: an invite, a Start, a kick reach the other player''s open client; nothing else moves; all green';
end $$;
