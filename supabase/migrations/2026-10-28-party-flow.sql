-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PARTY FLOW: ONE WAY TO DO EACH THING (lane b-party-system,
-- systems-engineer, 2026-10-19; docs/design/PARTY_SPEC.md and Tyler's answers
-- of 2026-10-19). STAGED. Game CLOSED: applies on its passing §6; Security
-- reviews it with every party surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- THE FIRST INVITE MAKES THE PARTY. hr_hunt_party_invite (restated) opens a
--   party for an inviter in none: it leads, seat 0, and the party has NO ground
--   yet (hunt_parties.hunt_id is now nullable). Then the invite is written as
--   before. A blocked player either way is `unavailable`.
-- YOUR OWN CHARACTERS JOIN AT ONCE (Tyler 10-19: same account, no accept). An
--   invite whose name resolves to the caller's own account, and the new
--   hr_hunt_party_invite_own(p_slot, p_other_slot, p_idem) (the character
--   strip's entry: a slot of the caller's own account, so an unnamed sibling is
--   reachable), seat that character straight away (hr_party_seat_own):
--   not itself (`self`), not hunting (`member_hunting`, named), in no party
--   (`already_member` / `already_in_party`), a free seat (`party_full`).
-- THE GROUND IS THE LEADER'S PICK AT START. hr_hunt_party_start(p_slot, p_hunt,
--   p_idem) REPLACES hr_hunt_party_start(p_slot, p_idem): the leader names the
--   ground in the Hunts window and everyone walks in together, each with its own
--   saved setup, ALL OR NONE (Tyler 10-19: Start waits for everyone). A member
--   who is AWAY (below) is not ready (`away`); a party already hunting keeps its
--   ground (`party_hunting`). The ground is written inside the all-or-none
--   block, so a refused start leaves it as it was.
-- A LOGGED-OUT TOWN MEMBER KEEPS ITS SEAT 10 MINUTES (Tyler 10-19). "Seen" is
--   the account's presence stamp (social_presence.seen_at, server clock, the
--   30 s social poll, 2026-10-25-social.sql), or the seat's joined_at when
--   later. A member with no open hunt session is AWAY once seen is older than
--   hr_party_away_after() (75 s, the social `online` window) and is DROPPED by
--   hr_hunt_party_sweep (pg_cron, every minute) once older than
--   hr_party_seat_keep() (10 min). A logged-out HUNTER keeps hunting server-side
--   and keeps its seat. The leader dropped hands the lead to the lowest seat;
--   the last one out closes the party.
-- DISBAND. hr_hunt_party_disband(p_slot, p_idem): the leader, in town only
--   (`party_hunting` while any member hunts the party's instance), closes the
--   party; every seat and invite goes.
-- THE ONE ENTRY BODY (hr_hunt_enter_for, restated from 2026-10-27-core-bodies.sql,
--   VERBATIM but two lines): a party with no ground matches no hunt
--   (`party_hunt_mismatch` is now `is distinct from`), so a partied member enters
--   only through its leader's start once the ground is set; and an instance
--   that restarts its clock takes the new ground (hunt_instances.hunt_id).
-- THE `party` SECTION (hr_hunt_party_view, restated from core-bodies VERBATIM
--   but the member row): + `away` (bool) and `seat_ms` (ms until an away seat is
--   dropped, null when present). hunt is null until the first start.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Nothing here moves value. invite_own seats only a character of the CALLER's
-- own account (auth.uid(), never a client user id). The start can only enter
-- members of the leader's own open party, each with its own bag, through the
-- one entry body (unchanged rules). The sweep removes seats only; a hunter is
-- never removed. A forged presence cannot be written: seen_at is the server's.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop invite_own, disband, the 3-arg start, the sweep (+ its cron job) and the
-- helpers; re-apply hr_hunt_enter_for, hr_hunt_party_start(int, uuid) and
-- hr_hunt_party_view from 2026-10-27-core-bodies.sql and hr_hunt_party_invite
-- from 2026-10-25-party-invites.sql; `alter column hunt_id set not null` after
-- closing every ground-less party.
-- ORDER: after 2026-10-27-core-bodies.sql (last body file). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is the pre-image this file was written against (md5 of
-- prosrc) or this file's own (its PARTY-FLOW marker); anything else moved
-- meanwhile and is refused, never clobbered.
do $mig$
declare v_src text;
begin
  if to_regclass('public.social_presence') is null or to_regprocedure('public.hr_social_blocked(uuid,uuid)') is null
     or to_regclass('public.hunt_party_invites') is null or to_regprocedure('public.hr_hunt_saved_bag(uuid,integer)') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-social.sql, 2026-10-25-party-invites.sql and 2026-10-27-core-bodies.sql first'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)'::regprocedure;
  if md5(v_src) <> '8cfa35e12e4e20ae4f8234974329723d' and strpos(v_src, 'PARTY-FLOW') = 0 then
    raise exception 'PIN: hr_hunt_enter_for is neither the core-bodies image (8cfa35e1...) nor this file''s (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> '18c2c69c18785dee21c7259bb57e47ae' and strpos(v_src, 'PARTY-FLOW') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither the core-bodies image (18c2c69c...) nor this file''s (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_invite(integer,text,uuid)'::regprocedure;
  if md5(v_src) <> 'c2572b5dceab6494f3d9b648e525e725' and strpos(v_src, 'PARTY-FLOW') = 0 then
    raise exception 'PIN: hr_hunt_party_invite is neither the party-invites image (c2572b5d...) nor this file''s (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = to_regprocedure('public.hr_hunt_party_start(integer,uuid)');
  if v_src is not null and md5(v_src) <> 'ab7cea42e0e0bfec004d302752a8f36e' then
    raise exception 'PIN: hr_hunt_party_start(int, uuid) is not the core-bodies image (ab7cea42...): md5 %', md5(v_src); end if;
end $mig$;

-- ── §1 THE GROUND IS CHOSEN AT START ─────────────────────────────────────────
alter table public.hunt_parties alter column hunt_id drop not null;
comment on table public.hunt_parties is
  '2026-10-23 (lane S1); 2026-10-28-party-flow.sql. A hunting party: up to party_max heroes, any role mix, one shared instance '
  '(id = party id). hunt_id is the ground its leader last started on (null until the first start). Written only by the '
  'hr_hunt_party_* verbs and hr_hunt_party_sweep; read through hr_hunt_party_view / hr_hunt_party_finder.';

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- Server policy, not game content (like hr_party_invite_ttl): when a quiet member reads as away, and
-- how long an away town member keeps its seat (Tyler 10-19: ten minutes).
create or replace function public.hr_party_away_after()
returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '75 seconds' $$;
create or replace function public.hr_party_seat_keep()
returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '10 minutes' $$;

-- When a seat was last seen: the account's presence stamp, or the seat's join when later.
create or replace function public.hr_party_last_seen(p_user uuid, p_joined timestamptz)
returns timestamptz language sql stable set search_path = public, pg_catalog as $$
  select greatest(p_joined, coalesce((select sp.seen_at from public.social_presence sp where sp.user_id = p_user), p_joined))
$$;

-- Is this seat away: no open hunt session anywhere, and not seen within hr_party_away_after()?
create or replace function public.hr_party_away(p_user uuid, p_slot int, p_joined timestamptz)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select not exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null)
     and public.hr_party_last_seen(p_user, p_joined) <= now() - public.hr_party_away_after()
$$;

-- Open a party with no ground, the caller leading in seat 0. The caller holds the character lock.
create or replace function public.hr_party_open(p_user uuid, p_slot int)
returns uuid language plpgsql set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  insert into public.hunt_parties (hunt_id, leader_user, leader_slot, max_size)
    values (null, p_user, p_slot, public.hr_hunt_limit('party_max')) returning id into v_id;
  insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
    values (v_id, p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot));
  return v_id;
end $$;

-- Seat a character in the lowest free seat; its invites to this party are used up.
-- The caller holds the party row and has checked the seat count.
create or replace function public.hr_party_seat_into(p_party uuid, p_user uuid, p_slot int)
returns int language plpgsql set search_path = public, pg_catalog as $$
declare v_seat int; v_max int := (select max_size from public.hunt_parties where id = p_party);
begin
  select min(s) into v_seat from generate_series(0, v_max - 1) s
   where not exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.seat = s);
  insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
    values (p_party, p_user, p_slot, v_seat, public.hr_hunt_weapon_of(p_user, p_slot));
  delete from public.hunt_party_invites where party_id = p_party and to_user = p_user and to_slot = p_slot;
  return v_seat;
end $$;

-- A seat goes: the leader's hands the lead to the lowest seat; the last closes the party (its invites go).
-- The caller holds the party row.
create or replace function public.hr_party_drop(p_party uuid, p_user uuid, p_slot int)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare v_p public.hunt_parties%rowtype; v_next record;
begin
  select * into v_p from public.hunt_parties where id = p_party;
  delete from public.hunt_party_members where party_id = p_party and user_id = p_user and slot = p_slot;
  if not exists (select 1 from public.hunt_party_members where party_id = p_party) then
    update public.hunt_parties set closed_at = now() where id = p_party;
    delete from public.hunt_party_invites where party_id = p_party;
  elsif v_p.leader_user = p_user and v_p.leader_slot = p_slot then
    select m.user_id, m.slot into v_next from public.hunt_party_members m where m.party_id = p_party order by m.seat limit 1;
    update public.hunt_parties set leader_user = v_next.user_id, leader_slot = v_next.slot where id = p_party;
  end if;
end $$;

-- YOUR OWN CHARACTER JOINS AT ONCE: p_other of the same account takes a seat in p_slot's party (opened
-- here when p_slot has none). Lock order: the party row, then the two characters in slot order.
create or replace function public.hr_party_seat_own(p_user uuid, p_slot int, p_other int)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_pid uuid; v_p public.hunt_parties%rowtype; v_tp uuid; v_sl int;
  v_self public.hunt_sessions%rowtype; v_them public.hunt_sessions%rowtype; v_s public.hunt_sessions%rowtype;
begin
  if p_other is null or p_other < 0 or p_other > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_other = p_slot then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_other) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_pid := public.hr_hunt_party_of(p_user, p_slot);
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid for update;
    if (select count(*) from public.hunt_party_members m where m.party_id = v_pid) >= v_p.max_size then
      return jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size); end if;
  end if;
  for v_sl in select unnest(array[least(p_slot, p_other), greatest(p_slot, p_other)]) loop
    v_s := public.hr_hunt_lock(p_user, v_sl);
    if v_sl = p_other then v_them := v_s; else v_self := v_s; end if;
  end loop;
  if v_them.id is not null then
    return jsonb_build_object('ok', false, 'error', 'member_hunting', 'name', public.hr_character_name(p_user, p_other)); end if;
  v_tp := public.hr_hunt_party_of(p_user, p_other);
  if v_tp is not null then
    return jsonb_build_object('ok', false, 'error', case when v_tp = v_pid then 'already_member' else 'already_in_party' end); end if;
  if v_pid is null then
    if v_self.id is not null then return jsonb_build_object('ok', false, 'error', 'hunt_open'); end if;
    v_pid := public.hr_party_open(p_user, p_slot);
  end if;
  perform public.hr_party_seat_into(v_pid, p_user, p_other);
  return jsonb_build_object('ok', true, 'joined', public.hr_character_name(p_user, p_other),
                            'party', public.hr_hunt_party_view(p_user, p_slot));
end $$;

revoke execute on function public.hr_party_away_after() from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_seat_keep() from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_last_seen(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_away(uuid, int, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_open(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_seat_into(uuid, uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_drop(uuid, uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_seat_own(uuid, int, int) from public, anon, authenticated, service_role;

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
-- Restated from 2026-10-25-party-invites.sql: the first invite makes the party; an own character joins at once.
create or replace function public.hr_hunt_party_invite(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql)
  c_max_open constant int := 8;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_pid uuid; v_p public.hunt_parties%rowtype; v_t record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_name is null or length(btrim(p_name)) not between 3 and 40 then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'bad_name')); end if;
  v_verb := 'hunt_party_invite:' || left(md5(lower(btrim(p_name))), 16);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_party_invite', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_t from public.hr_character_by_name(p_name);
  if v_t.user_id is null then return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'no_such_name')); end if;
  -- YOUR OWN CHARACTER (same account): no accept step, it takes a seat now.
  if v_t.user_id = v_uid then
    v_r := public.hr_party_seat_own(v_uid, p_slot, v_t.slot);
    if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection('hunt_party_invite', p_slot, v_r); end if;
  else
    if public.hr_social_blocked(v_uid, v_t.user_id) then
      return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'unavailable')); end if;
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    if v_pid is null then
      -- THE FIRST INVITE MAKES THE PARTY: the inviter leads; the ground is picked at Start.
      if (public.hr_hunt_lock(v_uid, p_slot)).id is not null then
        return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open')); end if;
      v_pid := public.hr_party_open(v_uid, p_slot);
    end if;
    select * into v_p from public.hunt_parties where id = v_pid for update;
    if (select count(*) from public.hunt_party_members m where m.party_id = v_pid) >= v_p.max_size then
      return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size)); end if;
    if exists (select 1 from public.hunt_party_members m where m.party_id = v_pid and m.user_id = v_t.user_id and m.slot = v_t.slot) then
      return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'already_member')); end if;
    -- Expired invites are pruned where they are next touched: this party's, and the invitee's.
    delete from public.hunt_party_invites i where i.created_at <= now() - public.hr_party_invite_ttl()
       and (i.party_id = v_pid or (i.to_user = v_t.user_id and i.to_slot = v_t.slot));
    if (select count(*) from public.hunt_party_invites i where i.party_id = v_pid
          and not (i.to_user = v_t.user_id and i.to_slot = v_t.slot)) >= c_max_open then
      return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'too_many_invites', 'max', c_max_open)); end if;
    insert into public.hunt_party_invites as i (party_id, from_user, from_slot, to_user, to_slot, created_at)
      values (v_pid, v_uid, p_slot, v_t.user_id, v_t.slot, now())
      on conflict (party_id, to_user, to_slot) do update set from_user = excluded.from_user, from_slot = excluded.from_slot, created_at = now();
    v_r := jsonb_build_object('ok', true, 'invited', public.hr_character_name(v_t.user_id, v_t.slot));
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The character strip's "Invite to party": one of the caller's OWN characters, by slot, seated at once.
create or replace function public.hr_hunt_party_invite_own(p_slot int, p_other_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_invite_own';
  v_uid uuid := auth.uid(); v_r jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_r := public.hr_party_seat_own(v_uid, p_slot, p_other_slot);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The leader closes the party, in town only: every seat and invite goes.
create or replace function public.hr_hunt_party_disband(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_disband';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
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
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  if exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting')); end if;
  delete from public.hunt_party_invites where party_id = v_pid;
  delete from public.hunt_party_members where party_id = v_pid;
  update public.hunt_parties set closed_at = now() where id = v_pid;
  v_r := jsonb_build_object('ok', true, 'party', null);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- THE SHARED START, ON THE LEADER'S GROUND (replaces the 2-arg start of 2026-10-27-core-bodies.sql).
drop function if exists public.hr_hunt_party_start(integer, uuid);
create or replace function public.hr_hunt_party_start(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_start';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_m record; v_last public.hunt_sessions%rowtype; v_not jsonb := '[]'::jsonb; v_n int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if v_p.closed_at is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  -- A party already hunting keeps its ground until every member is out.
  if v_p.hunt_id is distinct from p_hunt
     and exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting', 'hunt', v_p.hunt_id)); end if;
  -- EVERY MEMBER OR NONE: one subtransaction (the ground included), rolled back when any seat cannot enter.
  begin
    update public.hunt_parties set hunt_id = p_hunt where id = v_pid and hunt_id is distinct from p_hunt;
    for v_m in select m.user_id, m.slot, m.seat, m.joined_at from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
      continue when exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
                              and h.ended_at is null and h.instance_id = v_pid);
      -- AWAY: a member whose account has not had the game open lately is not marched in unseen.
      if v_m.user_id <> v_uid and public.hr_party_away(v_m.user_id, v_m.slot, v_m.joined_at) then
        v_not := v_not || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                               'error', 'away'));
        continue;
      end if;
      select * into v_last from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
       order by h.entered_at desc, h.id limit 1;
      v_r := public.hr_hunt_enter_for(v_m.user_id, v_m.slot, p_hunt, public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),
                                      public.hr_hunt_active_set(v_m.user_id, v_m.slot), v_last.hours_limit);
      if coalesce(v_r->>'ok', 'false') = 'true' then v_n := v_n + 1;
      else v_not := v_not || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                                  'error', v_r->>'error'));
      end if;
    end loop;
    if jsonb_array_length(v_not) > 0 then raise exception using errcode = 'HR878', message = 'not_ready'; end if;
  exception when sqlstate 'HR878' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_ready', 'seats', v_not));
  end;
  if v_n = 0 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_hunting')); end if;
  v_r := jsonb_build_object('ok', true, 'entered', v_n, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- THE SEAT KEEP: every away town seat older than hr_party_seat_keep() goes (pg_cron, every minute).
-- A hunter is never dropped. Parties locked by a verb right now are skipped until the next run.
create or replace function public.hr_hunt_party_sweep(p_limit int default 200)
returns int language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_m record; v_n int := 0;
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
    perform public.hr_party_drop(v_m.party_id, v_m.user_id, v_m.slot);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.hr_hunt_party_sweep(int) from public, anon, authenticated, service_role;

-- ── §4 THE ONE ENTRY BODY (restated from 2026-10-27-core-bodies.sql, two lines changed) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): a ground-less party matches no hunt; a restarted instance takes the new ground.
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_st   public.player_state%rowtype;
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean; v_have bigint;
  v_items text[] := '{}';
  v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
begin
  if v_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return jsonb_build_object('ok', false, 'error', 'hunts_paused'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'unknown_hunt'); end if;
  -- A HUNT IS FOUGHT ON A GROUND: no ground, no world, no hunt (spec §1.1).
  if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'no_ground'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return jsonb_build_object('ok', false, 'error', 'bad_preset'); end if;
  if p_hours is not null and (p_hours < public.hr_hunt_limit('hours_min') or p_hours > public.hr_hunt_limit('hours_max')) then
    return jsonb_build_object('ok', false, 'error', 'bad_hours'); end if;
  -- THE BAG, shape only (stock is checked under the lock).
  if p_bag is null then p_bag := '[]'::jsonb; end if;
  if jsonb_typeof(p_bag) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
  if jsonb_array_length(p_bag) > v_lines then
    return jsonb_build_object('ok', false, 'error', 'too_many_lines', 'max', v_lines); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('item', 'qty', 'essential'))
       or jsonb_typeof(v_line->'item') is distinct from 'string' or jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line ? 'essential' and jsonb_typeof(v_line->'essential') <> 'boolean') then
      return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
    v_item := v_line->>'item';
    if not exists (select 1 from public.hr_hunt_supplies where item_id = v_item) then
      return jsonb_build_object('ok', false, 'error', 'unknown_supply', 'item', left(v_item, 64)); end if;
    if v_item = any (v_items) then
      return jsonb_build_object('ok', false, 'error', 'duplicate_line', 'item', v_item); end if;
    v_items := v_items || v_item;
    if (v_line->>'qty') !~ '^[0-9]{1,7}$' or (v_line->>'qty')::bigint < 1 or (v_line->>'qty')::bigint > 100000 then
      return jsonb_build_object('ok', false, 'error', 'bad_qty', 'item', v_item); end if;
  end loop;

  -- THE PARTY ROW FIRST (lock order: party, then character), then the character.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    if v_p.hunt_id is distinct from p_hunt then
      return jsonb_build_object('ok', false, 'error', 'party_hunt_mismatch', 'hunt', v_p.hunt_id); end if;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_s.id is not null then
    return jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id); end if;
  if v_st.active_kind <> 'idle' then
    return jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind); end if;
  if p_preset <> 0 and not exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset) then
    return jsonb_build_object('ok', false, 'error', 'unknown_preset'); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return v_r; end if;
  -- STAMINA: an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(v_uid, p_slot, now()), 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_stamina'); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_line->>'item' for update;
    if coalesce(v_have, 0) < (v_line->>'qty')::bigint then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item', v_line->>'item', 'have', coalesce(v_have, 0), 'need', (v_line->>'qty')::bigint); end if;
  end loop;

  -- THE ARRIVAL: after the walk; a party member's on the instance's boundaries.
  v_from := date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt)));
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, on the party's ground of this start, with
      -- no world (the swing counter keeps counting forward).
      update public.hunt_instances set hunt_id = p_hunt, world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, p_hours, v_party, v_from, coalesce(v_seat, 0));
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;

  -- THE FLOOR IS A WARNING (Tyler 2026-10-18; 2026-10-25-hunt-floor-warning.sql): admitted under
  -- band[0] within the margin, the answer says so and the picker warns.
  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt));
end $function$;
revoke execute on function public.hr_hunt_enter_for(uuid, integer, text, jsonb, integer, integer) from public, anon, authenticated, service_role;

-- ── §5 THE `party` SECTION (restated from 2026-10-27-core-bodies.sql; + away / seat_ms per member) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_party_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  v_pid   uuid := public.hr_hunt_party_of(p_user, p_slot);
  v_p     public.hunt_parties%rowtype;
  v_own   public.hunt_sessions%rowtype;
  v_inst  uuid;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_vit   jsonb := '{}'::jsonb;
  v_lead  int;
  v_self  int;
  v_sseat int;
  v_lseat int;
  v_mem   jsonb := '[]'::jsonb;
  v_r     record;
  v_u     jsonb;
  v_id    int;
  v_t     int;
  v_v     jsonb;
  v_secs  numeric;
  v_away  boolean;
begin
  select * into v_own from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.entered_at desc limit 1;
  if v_pid is null and v_own.id is null then return null; end if;
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid;
    v_inst := v_pid;
  else
    v_inst := v_own.instance_id;
  end if;

  -- The pose's hero vitals by unit id, and which heroes a living monster is on.
  select * into v_shape from public.hr_hunt_world_shape where id;
  begin
    select i.world::jsonb into v_wj from public.hunt_instances i where i.id = v_inst;
  exception when others then
    v_wj := null;
  end;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
    v_uf := v_shape.fields->'unit';
    if jsonb_typeof(v_wj->'w'->((v_shape.fields->'world'->>'leader')::int)) = 'number' then
      v_lead := (v_wj->'w'->>((v_shape.fields->'world'->>'leader')::int))::int;
    end if;
    for v_u in select e from jsonb_array_elements(case when jsonb_typeof(v_wj->'u') = 'array' then v_wj->'u' else '[]'::jsonb end) e loop
      v_id := (v_u->>((v_uf->>'id')::int))::int;
      if v_u->>((v_uf->>'side')::int) = 'hero' then
        v_v := jsonb_build_object(
          'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int),
          'mana', v_u->((v_uf->>'mana')::int), 'mana_max', v_u->((v_uf->>'maxMana')::int),
          'eating', jsonb_typeof(v_u->((v_uf->>'otHp')::int)) = 'array',
          'drinking', jsonb_typeof(v_u->((v_uf->>'otMana')::int)) = 'array');
        v_vit := v_vit || jsonb_build_object(v_id::text, coalesce(v_vit->(v_id::text), '{}'::jsonb) || v_v);
      elsif (v_u->>((v_uf->>'alive')::int)) = 'true' and jsonb_typeof(v_u->((v_uf->>'target')::int)) = 'number' then
        v_t := (v_u->>((v_uf->>'target')::int))::int;
        v_vit := v_vit || jsonb_build_object(v_t::text, coalesce(v_vit->(v_t::text), '{}'::jsonb) || jsonb_build_object('aggro', true));
      end if;
    end loop;
  end if;

  for v_r in
    select m.user_id, m.slot, m.seat::int as seat, m.weapon_type as weapon, h.id as sid, h.unit_id, h.preset,
           h.hunt_from, h.settled_to, m.joined_at
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to, null::timestamptz
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    v_away := v_pid is not null and public.hr_party_away(v_r.user_id, v_r.slot, v_r.joined_at);
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', public.hr_character_name(v_r.user_id, v_r.slot),
        'level', public.hr_level_of(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', to_jsonb(public.hr_vitals_of(v_r.user_id, v_r.slot)->'max_hp')) end,
        'mana', v_v->'mana', 'mana_max', v_v->'mana_max',
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false),
        'away', v_away,
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then v_lseat := v_r.seat; end if;
  end loop;

  -- The leader: the pose's pull leader, else the party leader's unit, else (solo) self.
  if v_lead is null then
    v_lead := case when v_pid is null then v_self
                   else (select h.unit_id from public.hunt_sessions h
                          where h.user_id = v_p.leader_user and h.slot = v_p.leader_slot and h.ended_at is null
                            and h.instance_id = v_pid) end;
  end if;
  return jsonb_build_object(
    'id', v_pid, 'hunt', coalesce(v_p.hunt_id, v_own.hunt_id),
    'max', coalesce(v_p.max_size::int, 1),
    'open', v_pid is not null and jsonb_array_length(v_mem) < v_p.max_size,
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem);
end $function$;
revoke execute on function public.hr_hunt_party_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §6 GRANTS, THE BASELINE AND THE SCHEDULE ─────────────────────────────────
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_invite(int, text, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_invite_own(int, int, uuid) from public;
revoke execute on function public.hr_hunt_party_invite_own(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_invite_own(int, int, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_disband(int, uuid) from public;
revoke execute on function public.hr_hunt_party_disband(int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_disband(int, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_start(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_start(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_start(int, text, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_hunt_party_invite', 'hr_hunt_party_invite_own', 'hr_hunt_party_disband', 'hr_hunt_party_start');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_party_invite', 'p_slot integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2); 2026-10-28-party-flow.sql: invite a character found by its name; the first invite makes the party; '
   'a character of the caller''s own account is seated at once; no user id crosses; moves no value'),
  ('hr_hunt_party_invite_own', 'p_slot integer, p_other_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-28 (party flow): seat one of the CALLER''s own characters (auth.uid(), by slot) in this character''s party at once; moves no value'),
  ('hr_hunt_party_disband', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-28 (party flow): the leader closes its party in town (party_hunting while anyone hunts it); moves no value'),
  ('hr_hunt_party_start', 'p_slot integer, p_hunt text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2); 2026-10-28-party-flow.sql: the leader picks the ground and enters every member with its own saved setup and bag, '
   'all or none (not_ready names the seats, away included)');

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable - hr-hunt-party-sweep is not scheduled here';
    return;
  end if;
  perform public.hr_cron_ensure('hr-hunt-party-sweep', '* * * * *', 'select public.hr_hunt_party_sweep(200)');
end $mig$;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00005e310001', '000000c0-0000-0000-0000-00005e310002',
                               '000000c0-0000-0000-0000-00005e310003']::uuid[];
  v_hunt text := (select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
                   order by coalesce(h.band_min, 0), g.hunt_id limit 1);
  v_other text;
  v jsonb; v_i int; v_pid uuid; v_pid2 uuid; v_inv uuid; v_role text; v_probe boolean := false;
  v_k int := 0;
  -- a fresh idempotency key per call
  k text := '000000c0-0000-4000-a000-0000';
begin
  begin
    if v_hunt is null then
      v_hunt := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
      insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats)
        values (v_hunt, 'probe_ground', 1, 1, 60000, 5);
      v_probe := true;
    end if;
    v_other := (select g.hunt_id from public.hr_hunt_grounds g where g.hunt_id <> v_hunt order by g.hunt_id limit 1);
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Flow ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-flow §7 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(0) refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      -- everyone has the game open (the social poll's stamp)
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now())
        on conflict (user_id) do update set seen_at = now();
    end loop;
    -- A and C each play a second character.
    foreach v_i in array array[1, 3] loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      v := public.hr_create_character(1);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(1) refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 1;
    end loop;
    v := public.hr_character_name_set(1, 'Probe Flow Calt', (k || '5e310100')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): naming C''s second character answered %', v; end if;

    -- (a) THE FIRST INVITE MAKES THE PARTY: A, in none, invites B by name; A leads; no ground yet.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Flow A', (k || '5e310101')::uuid);
    if v->>'error' is distinct from 'self' or public.hr_hunt_party_of(v_u[1], 0) is not null then
      raise exception 'VERIFY(a): inviting oneself answered % (or made a party)', v; end if;
    v := public.hr_hunt_party_invite(0, 'Nobody Of That Name', (k || '5e310102')::uuid);
    if v->>'error' is distinct from 'no_such_name' or public.hr_hunt_party_of(v_u[1], 0) is not null then
      raise exception 'VERIFY(a): an unknown name answered % (or made a party)', v; end if;
    v := public.hr_hunt_party_invite(0, 'probe flow b', (k || '5e310103')::uuid);
    v_pid := public.hr_hunt_party_of(v_u[1], 0);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null
       or (select hunt_id from public.hunt_parties where id = v_pid) is not null
       or (select leader_user from public.hunt_parties where id = v_pid) <> v_u[1] then
      raise exception 'VERIFY(a): the first invite answered % (party %)', v, v_pid; end if;
    v := public.hr_state_of(v_u[2], 0)->'party_invites';
    if jsonb_array_length(v) <> 1 or (v->0->>'party')::uuid <> v_pid or v->0->'hunt' <> 'null'::jsonb then
      raise exception 'VERIFY(a): the invitee''s section is %', v; end if;
    v_inv := (v->0->>'id')::uuid;

    -- (b) OWN CHARACTER, NO ACCEPT: by slot (the strip) and by name.
    v := public.hr_hunt_party_invite_own(0, 0, (k || '5e310110')::uuid);
    if v->>'error' is distinct from 'self' then raise exception 'VERIFY(b): inviting the same slot answered %', v; end if;
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5e310111')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(v_u[1], 1) is distinct from v_pid
       or exists (select 1 from public.hunt_party_invites where to_user = v_u[1]) then
      raise exception 'VERIFY(b): the own invite answered %', v; end if;
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5e310112')::uuid);
    if v->>'error' is distinct from 'already_member' then raise exception 'VERIFY(b): a second own invite answered %', v; end if;
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5e310111')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): a replayed own invite answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[3]::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Flow Calt', (k || '5e310113')::uuid);
    v_pid2 := public.hr_hunt_party_of(v_u[3], 0);
    if coalesce(v->>'ok', '') <> 'true' or v_pid2 is null or public.hr_hunt_party_of(v_u[3], 1) is distinct from v_pid2
       or exists (select 1 from public.hunt_party_invites where to_user = v_u[3]) then
      raise exception 'VERIFY(b): an own character invited by name answered %', v; end if;

    -- (c) ACCEPT seats the stranger; (d) LEAVE frees the seat.
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_accept(0, v_inv, (k || '5e310120')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(v_u[2], 0) is distinct from v_pid
       or (select count(*) from public.hunt_party_members where party_id = v_pid) <> 3 then
      raise exception 'VERIFY(c): the accept answered %', v; end if;
    v := public.hr_hunt_party_leave(0, (k || '5e310121')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(v_u[2], 0) is not null then
      raise exception 'VERIFY(d): the leave answered %', v; end if;

    -- (e) KICK: the leader only, by seat.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_invite(0, 'Probe Flow B', (k || '5e310130')::uuid);
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_u[2], 0)->'party_invites'->0->>'id')::uuid, (k || '5e310131')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): the re-accept answered %', v; end if;
    v := public.hr_hunt_party_kick(0, 1, (k || '5e310132')::uuid);
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(e): a member''s kick answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_kick(0, (select seat from public.hunt_party_members where user_id = v_u[2] and slot = 0), (k || '5e310133')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(v_u[2], 0) is not null then
      raise exception 'VERIFY(e): the kick answered %', v; end if;

    -- (f) START WAITS FOR EVERYONE: an away member makes it not_ready, nobody enters, the ground is unchanged.
    v := public.hr_hunt_party_invite(0, 'Probe Flow B', (k || '5e310140')::uuid);
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_u[2], 0)->'party_invites'->0->>'id')::uuid, (k || '5e310141')::uuid);
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5e310142')::uuid);
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(f): a member''s start answered %', v; end if;
    update public.social_presence set seen_at = now() - interval '2 minutes' where user_id = v_u[2];
    update public.hunt_party_members set joined_at = now() - interval '2 minutes' where user_id = v_u[2];
    v := public.hr_hunt_party_view(v_u[1], 0);
    if (select (m->>'away')::boolean from jsonb_array_elements(v->'members') m where m->>'name' = 'Probe Flow B') is distinct from true
       or (select (m->>'seat_ms')::bigint from jsonb_array_elements(v->'members') m where m->>'name' = 'Probe Flow B') not between 470000 and 480000
       or (select (m->>'away')::boolean from jsonb_array_elements(v->'members') m where (m->>'seat')::int = 0) is distinct from false then
      raise exception 'VERIFY(f): the party section reads %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_start(0, 'no_such_ground', (k || '5e310143')::uuid);
    if v->>'error' is distinct from 'no_ground' then raise exception 'VERIFY(f): an unknown ground answered %', v; end if;
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5e310144')::uuid);
    if v->>'error' is distinct from 'not_ready' or v->'seats'->0->>'error' <> 'away' or v->'seats'->0->>'name' <> 'Probe Flow B'
       or jsonb_array_length(v->'seats') <> 1
       or exists (select 1 from public.hunt_sessions where user_id = any (v_u) and ended_at is null)
       or (select hunt_id from public.hunt_parties where id = v_pid) is not null then
      raise exception 'VERIFY(f): a start with an away seat answered % (or entered someone, or kept the ground)', v; end if;
    update public.social_presence set seen_at = now() where user_id = v_u[2];
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5e310145')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 3
       or (select count(*) from public.hunt_sessions where user_id = any (v_u) and ended_at is null and instance_id = v_pid) <> 3
       or (select hunt_id from public.hunt_parties where id = v_pid) <> v_hunt
       or (select hunt_id from public.hunt_instances where id = v_pid) <> v_hunt then
      raise exception 'VERIFY(f): the shared start answered %', v; end if;
    -- while hunting: the ground holds, nobody disbands, a quiet hunter keeps its seat.
    if v_other is not null then
      v := public.hr_hunt_party_start(0, v_other, (k || '5e310146')::uuid);
      if v->>'error' is distinct from 'party_hunting' then raise exception 'VERIFY(f): a new ground mid-hunt answered %', v; end if;
    end if;
    v := public.hr_hunt_party_disband(0, (k || '5e310147')::uuid);
    if v->>'error' is distinct from 'party_hunting' then raise exception 'VERIFY(g): a disband mid-hunt answered %', v; end if;
    update public.social_presence set seen_at = now() - interval '1 hour' where user_id = v_u[2];
    update public.hunt_party_members set joined_at = now() - interval '1 hour' where user_id = v_u[2];
    perform public.hr_hunt_party_sweep(200);
    if public.hr_hunt_party_of(v_u[2], 0) is distinct from v_pid then raise exception 'VERIFY(h): the sweep dropped a hunter'; end if;

    -- (g) DISBAND: a member cannot; the leader, in town, closes it and every seat goes.
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_disband(0, (k || '5e310150')::uuid);
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(g): a member''s disband answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_disband(0, (k || '5e310151')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select closed_at from public.hunt_parties where id = v_pid) is null
       or exists (select 1 from public.hunt_party_members where party_id = v_pid) then
      raise exception 'VERIFY(g): the disband answered %', v; end if;
    -- a partied member enters only through its leader's start: C's ground-less party matches no hunt.
    perform set_config('request.jwt.claim.sub', v_u[3]::text, true);
    v := public.hr_hunt_enter(1, v_hunt, '[]'::jsonb, 0, null, (k || '5e310152')::uuid);
    if v->>'error' is distinct from 'party_hunt_mismatch' then raise exception 'VERIFY(g): a ground-less member''s solo enter answered %', v; end if;

    -- (h) THE SEAT KEEP: 9 minutes unseen keeps the seat, 11 drops it; the leader dropped hands the lead on.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_invite(0, 'Probe Flow B', (k || '5e310160')::uuid);
    v_pid := public.hr_hunt_party_of(v_u[1], 0);
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_u[2], 0)->'party_invites'->0->>'id')::uuid, (k || '5e310161')::uuid);
    if public.hr_hunt_party_of(v_u[2], 0) is distinct from v_pid then raise exception 'VERIFY(h): B did not rejoin: %', v; end if;
    update public.social_presence set seen_at = now() where user_id = v_u[2];
    update public.social_presence set seen_at = now() - interval '9 minutes' where user_id = v_u[1];
    update public.hunt_party_members set joined_at = now() - interval '1 hour' where party_id = v_pid;
    perform public.hr_hunt_party_sweep(200);
    if public.hr_hunt_party_of(v_u[1], 0) is distinct from v_pid or public.hr_hunt_party_of(v_u[2], 0) is distinct from v_pid then
      raise exception 'VERIFY(h): a seat unseen for 9 minutes was dropped'; end if;
    update public.social_presence set seen_at = now() - interval '11 minutes' where user_id = v_u[1];
    perform public.hr_hunt_party_sweep(200);
    if public.hr_hunt_party_of(v_u[1], 0) is not null or public.hr_hunt_party_of(v_u[2], 0) is distinct from v_pid
       or (select leader_user from public.hunt_parties where id = v_pid) <> v_u[2] then
      raise exception 'VERIFY(h): the 11-minute sweep left % / leader %', public.hr_hunt_party_of(v_u[1], 0),
        (select leader_user from public.hunt_parties where id = v_pid); end if;
    update public.social_presence set seen_at = now() - interval '11 minutes' where user_id = v_u[2];
    perform public.hr_hunt_party_sweep(200);
    if (select closed_at from public.hunt_parties where id = v_pid) is null then
      raise exception 'VERIFY(h): the last seat swept did not close the party'; end if;
    raise exception using errcode = 'HR882', message = 'party-flow §7 complete - rolling back';
  exception when sqlstate 'HR882' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.hunt_parties where leader_user = any (v_u))
     or exists (select 1 from public.social_presence where user_id = any (v_u))
     or exists (select 1 from public.hr_hunt_grounds where ground_id = 'probe_ground') then
    raise exception 'VERIFY(i): §7 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_party_sweep(integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_seat_own(uuid,integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_drop(uuid,uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_open(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_seat_into(uuid,uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_away(uuid,integer,timestamp with time zone)', 'execute') then
      raise exception 'VERIFY(i): % reaches a party internal', v_role; end if;
  end loop;
  if to_regprocedure('public.hr_hunt_party_start(integer,uuid)') is not null then
    raise exception 'VERIFY(i): the ground-less start (int, uuid) is still installed'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-flow: first invite makes the party, own characters seat at once, start on the leader''s ground all-or-none (away is not ready), disband, a 10-minute seat keep; all green';
end $$;
