-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-09-own-hunt-nudge.sql — A HUNT STARTED OR ENDED ON ONE DEVICE REACHES THE HERO'S OTHER OPEN CLIENTS AT ONCE
--   (lane/c-own-hunt-nudge, backend-architect, 2026-11-11; qa 11-11, .claude/coordination/DISCOVERIES.md, lane/r-client-health #2).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. Moves no value: a nudge is a state-free push over a committed fact. On the EA Security
-- list as a delivery surface (who hears what). EDGE: none (hr-accrue is not touched; pack-edge --hash unmoved). CLIENT: none
-- (src/session/account-session.js _nudged already answers a nudge with one coalesced hr_load of that hero).
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- A hunt started for a hero from ANOTHER tab or a phone showed "In town, idle" on this tab until the world tick's first
-- flush settle (flush_seconds 90), and a hunt that ended before then never showed here at all (the local world's five 70 s
-- party hunts started from outside). A hero idle in town asks the server nothing, so only a push can tell its tab:
--  · a SOLO enter sent no push at all: hr_party_nudge_trg's hunt_sessions branch nudged a party instance only;
--  · a PARTY Start skipped the caller's whole account: hr_party_nudge returns when auth.uid() is the hero's owner, on the
--    premise that "the acting client re-reads its own" (party-intents.js settled). That holds for the tab that acted only:
--    the account's other tabs and devices share the hero's topic and hold nothing;
--  · an END found by a settle the hero's other device asked for is not pushed to the hero's topic either: hr_frame_wanted's
--    self-echo rule (2026-10-09) spares the requester, which shares the topic with every other client of that hero.
-- Pressing Enter on the stale tab was refused, and the refusal's re-read healed it, so nothing stuck: it showed wrong.
--
-- ── THE FIX (the contract) ──────────────────────────────────────────────────
-- §1 hr_hero_nudge(user, slot), owner-only: THE ONE NUDGE. { t:'nudge' } on the hero's private frame topic when frames are
--    on (hr_tick_config.frame_push), Realtime exists and the hero is open in a client (character_presence within the 75 s
--    window hr_frame_wanted uses, never from the future). NO caller test and NO echo test: it says "read yourself" and
--    carries no state, so the client that acted (or asked the settle) reads once more, coalesced, and every other client of
--    the hero reads for the first time. Its body is inside one exception block: a push never fails a verb or a settle.
-- §2 hr_party_nudge RESTATED: a party verb's nudge keeps its rule (never the caller's own account, 2027-02-11) and sends
--    through hr_hero_nudge. hr_party_nudge_trg RESTATED without its hunt_sessions branch (party tables only, every other
--    line kept); the trigger hr_party_nudge_session is DROPPED.
-- §3 hr_hunt_nudge_trg on hunt_sessions, the one place every path passes (a solo enter, the leader's Start per seat, a
--    restart, a settle's end, a forfeit, the sweep, a future verb):
--      hr_hunt_nudge_open   AFTER INSERT                                       the hero whose session opened
--      hr_hunt_nudge_close  AFTER UPDATE OF ended_at, WHEN it goes null -> set  the hero whose session closed
--    whoever the caller. A session update that ends nothing, and an ended session written again, send nothing.
--
-- ── RATE (the budget stays) ─────────────────────────────────────────────────
-- No new verb and no new client grant. A nudge rides only a session open or close: at most two per session per hero, and
-- every session opens through a verb already gated per account (hr_rpc_gate 'hunt', 30 a minute: the enter, a restart and
-- the leader's Start, which opens at most four seats). The client still coalesces to ONE hr_load per hero per
-- SESSION_CONFIG.nudgeMs (400 ms), inside hr_load's 180-a-minute account budget. A stranger is nudged only for a session of
-- its own hero, which sits in a party it chose to join (as 2027-02-11 already did for the Start).
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- realtime.send inserts into realtime.messages inside the writer's transaction (or the settle member's subtransaction): a
-- rolled-back verb or member sends nothing, a committed one is read by the client after its commit (and after nudgeMs).
-- No lock beyond the row the trigger fired on. A replayed idempotency key opens no session, so it sends nothing (§4(b)).
-- A second apply: §0 accepts each restated body's pre-image or this file's own; create or replace; drop trigger if exists.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- None on the client surface (§4(g): no function here is executable by anon, authenticated or service_role). The
-- receive-only policy on realtime.messages (hr_realtime_policies) limits a topic to its owner; a nudge names nobody and
-- carries nothing, so nothing in it can disagree with the server or reach another player's economy.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- Per session: two primary-key probes of character_presence and at most two ~60-byte messages; nothing per tick (the
-- close trigger's WHEN is false on every settle that ends nothing, so no trigger event is queued). Client: at most two
-- hr_load per open client per hunt. No row of ours is written; realtime.messages is Supabase's, pruned by Realtime.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2027-02-18-party-truth.sql's hr_party_nudge_trg and 2027-02-11-party-nudge.sql's hr_party_nudge and its
-- hr_party_nudge_session trigger (pre-images pinned in §0), drop the two hr_hunt_nudge_* triggers, hr_hunt_nudge_trg and
-- hr_hero_nudge. No column, row or player value is touched.
-- ORDER: LAST in the v0.2.120 server chain, after 2027-04-08-tally-worn.sql; it shares no object with any 2027-03-27..2027-04-08
-- file (tier 4, dead-writes, watched-settle-cost, first rats, progress-hot, member-write-once, idle-clock, tally-worn), so its
-- place among them is free. Proof: tests/party-flow.mjs PF-OWN-NUDGE (+ --mutate) and §4 below;
-- the client's half is unchanged (tests/session-core.mjs NUDGE-1). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: FAIL CLOSED IF ANOTHER FILE MOVED A BODY THIS FILE RESTATES ─────
do $mig$
declare v_md5 text; r record;
begin
  for r in select * from (values
    ('public.hr_party_nudge(uuid,integer)', '14f383ea9510110bc9a4f41701eb710d', '09e78e21dc02411d3c5c258423971454'),
    ('public.hr_party_nudge_trg()', 'f890ea2bebf5bda4a508fd6ad3491cd2', 'f3ec5a93072e255afc0e60814853ac94')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither the image this file was written over (%) nor its own (%) - md5 %: another file moved it; restate from the new image',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ONE NUDGE ────────────────────────────────────────────────────────
create or replace function public.hr_hero_nudge(p_user uuid, p_slot integer)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_on boolean;
begin
  -- OWN-HUNT-NUDGE (2027-04-09-own-hunt-nudge.sql). "Read yourself" to every client the hero is open in: a second tab, a
  -- phone, and the client that acted, which reads once more (coalesced). A push is a courtesy over facts the database already
  -- holds: any failure degrades to "no nudge" (the next read heals it), never to a refused verb or a rolled-back settle.
  begin
    if p_user is null or p_slot is null then return; end if;
    select c.frame_push into v_on from public.hr_tick_config c where c.id;
    if not coalesce(v_on, false) then return; end if;
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;
    -- Open in a client: hr_frame_wanted's presence window, WITHOUT its self-echo rule (that rule spares the browser holding
    -- the envelope in its HTTP answer; the same hero open on another device holds nothing).
    if not exists (select 1 from public.character_presence cp
                    where cp.user_id = p_user and cp.slot = p_slot
                      and cp.seen_at >  now() - interval '75 seconds'
                      and cp.seen_at <= now() + interval '60 seconds') then return; end if;
    perform realtime.send(jsonb_build_object('t', 'nudge'), 'frame', public.hr_frame_topic(p_user, p_slot), true);
  exception when others then
    raise warning 'hr_hero_nudge: not sent to %/% (%)', p_user, p_slot, sqlerrm;
  end;
end $$;

-- ── §2 THE PARTY'S NUDGE, THROUGH THE ONE ───────────────────────────────────
create or replace function public.hr_party_nudge(p_user uuid, p_slot integer)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- PARTY-NUDGE (2027-02-11-party-nudge.sql): a party verb tells the OTHER accounts' heroes. A failure is "no nudge".
  begin
    if p_user is null or p_slot is null then return; end if;
    -- The acting client re-reads its own heroes (party-intents.js settled); the sweep and the engine have no caller. A hunt's
    -- open and close reach every client of the hero, the caller's own included, through hr_hunt_nudge_trg (2027-04-09).
    if auth.uid() is not distinct from p_user then return; end if;
    perform public.hr_hero_nudge(p_user, p_slot);
  exception when others then
    raise warning 'hr_party_nudge: not sent to %/% (%)', p_user, p_slot, sqlerrm;
  end;
end $$;

drop trigger if exists hr_party_nudge_session on public.hunt_sessions;

-- The party tables only: a hunt session opening or closing is hr_hunt_nudge_trg's (§3).
create or replace function public.hr_party_nudge_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_party uuid; v_user uuid; v_slot int; r record;
begin
  if tg_table_name = 'hunt_party_invites' then
    perform public.hr_party_nudge(new.to_user, new.to_slot);
    return null;
  elsif tg_table_name = 'party_notices' then
    -- PARTY-TRUTH (2027-02-18-party-truth.sql): the notice's own hero reads itself.
    perform public.hr_party_nudge(new.user_id, new.slot);
    return null;
  elsif tg_table_name = 'player_equipment' then
    -- PARTY-TRUTH: only the two slots a role key reads (hr_hunt_weapon_of), only for a hero in a party.
    if tg_op = 'DELETE' then
      if old.equip_slot not in ('weapon', 'shield') then return null; end if;
      v_user := old.user_id; v_slot := old.slot;
    else
      if new.equip_slot not in ('weapon', 'shield') then return null; end if;
      if tg_op = 'UPDATE' and new.item_id is not distinct from old.item_id then return null; end if;
      v_user := new.user_id; v_slot := new.slot;
    end if;
    v_party := public.hr_hunt_party_of(v_user, v_slot);
    if v_party is null then return null; end if;
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

-- ── §3 A HUNT OPENED OR CLOSED, BY ANY PATH, FROM ANY DEVICE ────────────────
create or replace function public.hr_hunt_nudge_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- OWN-HUNT-NUDGE (2027-04-09-own-hunt-nudge.sql): the hero's own topic, whoever caused it (its owner on another device
  -- included); a hero idle in town asks nothing, so this is how every other client of it learns the hunt began or ended.
  perform public.hr_hero_nudge(new.user_id, new.slot);
  return null;
end $$;

create or replace trigger hr_hunt_nudge_open after insert on public.hunt_sessions
  for each row execute function public.hr_hunt_nudge_trg();
create or replace trigger hr_hunt_nudge_close after update of ended_at on public.hunt_sessions
  for each row when (old.ended_at is null and new.ended_at is not null) execute function public.hr_hunt_nudge_trg();

-- ── §3b GRANTS: owner-only ──────────────────────────────────────────────────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_hero_nudge(uuid,integer)', 'public.hr_hunt_nudge_trg()',
                               'public.hr_party_nudge(uuid,integer)', 'public.hr_party_nudge_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- One account, two heroes (A0, A1), each open in a client. Every client of a hero (the tab that acted, a second tab, a
-- phone) joins the hero's one topic, so a nudge on that topic is what reaches "the other session". After each step v_n0 /
-- v_n1 count the nudges on A0's / A1's topic.
do $$
declare
  c_a constant uuid := '000000d7-0000-4000-a000-00000a4e0001';
  k   text := '000000d7-0000-4000-a000-0000';
  v   jsonb; v_hunt text; v_t0 text; v_t1 text; v_sid uuid; v_n0 bigint; v_n1 bigint; v_sig text;
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
    insert into auth.users (id) values (c_a) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_a, 'Probe Own Nudge') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'own-hunt-nudge §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'own-hunt-nudge §4-harness: hr_create_character(0) refused: %', v; end if;
    -- A second hero, its slot owned the way a buyer owns it (tests/_slots.mjs ownHeroSlots).
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (c_a, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'own-hunt-nudge §4-harness: hr_create_character(1) refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a;
    insert into public.social_presence (user_id, slot, seen_at) values (c_a, 0, now()) on conflict (user_id) do update set seen_at = now();
    insert into public.character_presence (user_id, slot, seen_at) values (c_a, 0, now()), (c_a, 1, now())
      on conflict (user_id, slot) do update set seen_at = now();
    delete from public.hr_rate_counters where user_id = c_a;
    v_t0 := public.hr_frame_topic(c_a, 0);
    v_t1 := public.hr_frame_topic(c_a, 1);
    if exists (select 1 from realtime.messages where topic in (v_t0, v_t1)) then raise exception 'own-hunt-nudge §4-harness: the probe topics are not empty'; end if;

    -- (a) A SOLO START from one session reaches the hero's other open clients: one state-free nudge on its own topic.
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '0a4e0101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-hunt-nudge §4-harness: the solo enter answered %', v; end if;
    select count(*) filter (where topic = v_t0), count(*) filter (where topic = v_t1) into v_n0, v_n1
      from realtime.messages where topic in (v_t0, v_t1) and event = 'frame' and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 1 or v_n1 <> 0 then raise exception 'own-hunt-nudge §4(a): the solo start sent %/% nudge(s) to A0/A1, want 1/0', v_n0, v_n1; end if;
    -- (b) THE SAME KEY AGAIN opens nothing and sends nothing.
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '0a4e0101')::uuid);
    select count(*) filter (where topic = v_t0) into v_n0 from realtime.messages where topic = v_t0 and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 1 then raise exception 'own-hunt-nudge §4(b): a replayed start nudged again'; end if;
    -- (c) A WRITE THAT ENDS NOTHING sends nothing; THE END reaches it, once; an ended session written again sends nothing.
    select h.id into v_sid from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.ended_at is null;
    update public.hunt_sessions set leave_at = now() + interval '1 minute' where id = v_sid;
    select count(*) into v_n0 from realtime.messages where topic = v_t0 and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 1 then raise exception 'own-hunt-nudge §4(c): a session write that ended nothing nudged'; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    select count(*) into v_n0 from realtime.messages where topic = v_t0 and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 2 then raise exception 'own-hunt-nudge §4(c): the end sent its own hero % nudge(s), want one', v_n0 - 1; end if;
    update public.hunt_sessions set ended_at = ended_at where id = v_sid;
    select count(*) into v_n0 from realtime.messages where topic = v_t0 and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 2 then raise exception 'own-hunt-nudge §4(c): an ended session written again nudged'; end if;

    -- (d) A HERO OPEN IN NO CLIENT (its last stamp past the 75 s window) hears nothing, open or close.
    update public.character_presence set seen_at = now() - interval '2 minutes' where user_id = c_a and slot = 1;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_hunt_enter(1, v_hunt, '[]'::jsonb, 0, null, (k || '0a4e0102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-hunt-nudge §4-harness: the second hero''s enter answered %', v; end if;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = c_a and h.slot = 1 and h.ended_at is null;
    if exists (select 1 from realtime.messages where topic = v_t1) then raise exception 'own-hunt-nudge §4(d): a hero open in no client was nudged'; end if;
    insert into public.character_presence (user_id, slot, seen_at) values (c_a, 1, now()) on conflict (user_id, slot) do update set seen_at = now();

    -- (e) A PARTY VERB still spares the caller's own heroes (2027-02-11's rule); THE LEADER'S START reaches every own seat.
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_hunt_party_invite_own(0, 1, (k || '0a4e0103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-hunt-nudge §4-harness: the own invite answered %', v; end if;
    select count(*) filter (where topic = v_t0), count(*) filter (where topic = v_t1) into v_n0, v_n1
      from realtime.messages where topic in (v_t0, v_t1) and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 2 or v_n1 <> 0 then raise exception 'own-hunt-nudge §4(e): a party verb nudged the caller''s own heroes (%/%)', v_n0 - 2, v_n1; end if;
    v := public.hr_hunt_party_start(0, v_hunt, (k || '0a4e0104')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-hunt-nudge §4-harness: the start answered %', v; end if;
    select count(*) filter (where topic = v_t0), count(*) filter (where topic = v_t1) into v_n0, v_n1
      from realtime.messages where topic in (v_t0, v_t1) and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 3 or v_n1 <> 1 then
      raise exception 'own-hunt-nudge §4(e): the leader''s Start sent its own seats %/% nudge(s), want one each', v_n0 - 2, v_n1; end if;

    -- (f) FRAMES OFF: silence, and the end still lands.
    update public.hr_tick_config set frame_push = false where id;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = c_a and h.ended_at is null;
    if exists (select 1 from public.hunt_sessions where user_id = c_a and ended_at is null) then raise exception 'own-hunt-nudge §4-harness: a session stayed open'; end if;
    select count(*) into v_n0 from realtime.messages where topic in (v_t0, v_t1) and payload - 'id' = '{"t":"nudge"}'::jsonb;
    if v_n0 <> 4 then raise exception 'own-hunt-nudge §4(f): a nudge went out with frames off'; end if;
    raise exception 'own-hunt-nudge §4: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'own-hunt-nudge §4: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (g) THE SHAPE: the two hunt triggers stand, the party's old session trigger is gone, and nothing here is a client's.
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and not t.tgisinternal
        and t.tgfoid = 'public.hr_hunt_nudge_trg()'::regprocedure and t.tgname in ('hr_hunt_nudge_open', 'hr_hunt_nudge_close')) <> 2 then
    raise exception 'own-hunt-nudge §4(g): the two hunt_sessions nudge triggers are not both installed'; end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgfoid = 'public.hr_party_nudge_trg()'::regprocedure) then
    raise exception 'own-hunt-nudge §4(g): hr_party_nudge_trg still fires on hunt_sessions (two nudges a seat)'; end if;
  foreach v_sig in array array['public.hr_hero_nudge(uuid,integer)', 'public.hr_hunt_nudge_trg()',
                               'public.hr_party_nudge(uuid,integer)', 'public.hr_party_nudge_trg()'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or has_function_privilege('authenticated', v_sig::regprocedure, 'execute')
       or has_function_privilege('service_role', v_sig::regprocedure, 'execute') then
      raise exception 'own-hunt-nudge §4(g): % is reachable by a client', v_sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'own-hunt-nudge: a solo start, the leader''s Start and an end reach every open client of the hero, the caller''s own included; once; never a closed hero or with frames off; all green';
end $$;
