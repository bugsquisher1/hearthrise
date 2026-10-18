-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNTING PARTIES (lane S1; HUNT_SCREEN_SPEC §3.9, §1.3 "Party
-- settle", §1.5 `party`; Tyler 2026-10-15/16). STAGED. Game CLOSED: applies on
-- its passing §4; Security reviews it in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- A party is up to hr_hunt_limit('party_max') characters (src/data/party.js
-- maxSize: 4, a config value), ANY role mix (four tanks is a party), who hunt
-- ONE shared instance: hunt_instances row id = the party's id, kind 'party'.
-- A solo hunt is a party of one (its instance is its session's own).
--   hunt_parties        id, hunt, leader (user, slot), max_size (the config value
--                       at creation), created / closed
--   hunt_party_members  (party, user, slot) with its SEAT and the weapon TYPE the
--                       server read from the member's equipment at join
--                       (hr_hunt_weapons; the party finder filters on it)
-- THE VERBS (authenticated, every one through hr_rpc_gate, so closed mode and
-- the rate gate apply; named hr_hunt_party_* because the retired M8 party engine
-- still owns hr_party_* until demolition M2 drops it): hr_hunt_party_create, hr_hunt_party_join, hr_hunt_party_leave,
-- hr_hunt_party_kick (the leader, by SEAT — no client ever names another user id),
-- hr_hunt_party_finder (open parties of a hunt with a free seat, optionally only
-- those with NO member of a weapon type — "a party that needs a bow").
-- Display names come from profiles, never from a client (CLAUDE.md §1).
-- A party member may not join, leave or be kicked while HUNTING the party's
-- instance (`hunt_open` / `member_hunting`): the member set of a running
-- instance changes only by a session ending, which its settle re-proves.
--
-- ── ENTERING A HUNT (hr_hunt_enter, RESTATED WHOLE) ─────────────────────────
-- C1's body (+ the C2 stamina gate) with the S1 rules:
--   · `no_ground`: a hunt with no hr_hunt_grounds row cannot be entered — it
--     has no world to step and its settle would price nothing (spec §1.1: there
--     is no single-foe fallback);
--   · a PARTY member hunts the party's hunt only (`party_hunt_mismatch`) and in
--     the party's instance, created at its first entry; its session's arrival is
--     put on the instance's swing boundaries (the first one at or after the walk
--     ends), so every member's clock stands on the instance clock; its seat is
--     its party seat;
--   · an instance no session of which is open restarts its clock at the new
--     arrival, with no world (the next settle builds a fresh one; its swing
--     counter keeps counting forward — no seed is ever drawn twice);
--   · the preset must exist (preset 0 always does).
-- hr_hunt_change refuses a party member (`party_hunt`): the party hunts one
-- ground. hr_hunt_new_session keeps its signature (hr_hunt_swap's caller) and
-- opens a solo session; hr_hunt_open_session is the one session inserter.
-- RETIRED with their last reader: hr_hunt_preset_slots, hr_hunt_default_preset.
--
-- ── THE `party` AND `account` SECTIONS ─────────────────────────────────────
-- hr_hunt_party_view(user, slot): the shape the hunt screen's party panel reads
-- (spec §1.5; src/session/hunt-sections.js partyOf): {id, hunt, max, open,
-- leader, self, leader_seat, self_seat, members[{unit, seat, hunting, name, level, weapon, role_pick,
-- hp, hp_max, mana, mana_max, dealt, healed, dps, hps, down, eating, drinking,
-- aggro}]}; leader / self / unit are the instance world's unit ids (the hunt
-- panel), leader_seat / self_seat the party seats (the party window), and the
-- vitals come off its pose by field name. A solo hunt is a party of one.
-- Peer data reaches a member only through THIS instance-scoped view, never in
-- another player's envelope. hr_account_view: {max_concurrent}, the server's
-- characters-at-once config (the generated `max_concurrent` limit row).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A party moves no value by itself: every coin, item and XP a party hunt pays
-- is a member's own hr_apply under the instance settle (2026-10-23-hunt-world-
-- state.sql), held by the ground's kill and value bounds; the split (gold even,
-- items round-robin, src/core/party-split.js) happens before the proposal, so
-- each member's own bound applies to its own share. A forged party cannot carry
-- value between accounts: nothing here transfers anything.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the party verbs (+ baseline rows), hr_hunt_party_view (+ section row) and the
-- two tables; re-apply hr_hunt_enter / hr_hunt_change / hr_hunt_new_session
-- from 2026-10-21-hunt-sessions.sql with the settle file's stamina edit.
-- ORDER: after 2026-10-23-hunt-world-state.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-23-hunt-world-state.sql first'; end if;
  if public.hr_hunt_limit('party_max') is null or to_regclass('public.hr_hunt_weapons') is null then
    raise exception 'PRECONDITION: the S1 catalogue (party_max, hr_hunt_weapons) is absent'; end if;
  if to_regclass('public.profiles') is null then raise exception 'PRECONDITION: public.profiles is absent'; end if;
  if public.hr_hunt_limit('max_concurrent') is null or not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'hr_hunt_world_shape' and column_name = 'fields') then
    raise exception 'PRECONDITION: the S1 catalogue (max_concurrent, hr_hunt_world_shape.fields) is absent'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.hunt_parties (
  id          uuid primary key default gen_random_uuid(),
  hunt_id     text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  leader_user uuid not null,
  leader_slot int  not null,
  max_size    smallint not null check (max_size between 1 and 5),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists hunt_parties_open on public.hunt_parties (hunt_id, created_at) where closed_at is null;
create table if not exists public.hunt_party_members (
  party_id    uuid not null references public.hunt_parties (id) on delete cascade,
  user_id     uuid not null,
  slot        int  not null,
  seat        smallint not null check (seat between 0 and 4),
  weapon_type text not null check (weapon_type ~ '^[a-z0-9_]{1,32}$'),
  joined_at   timestamptz not null default now(),
  primary key (party_id, user_id, slot),
  constraint hunt_party_members_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
-- One party per character; one character per seat.
create unique index if not exists hunt_party_members_one on public.hunt_party_members (user_id, slot);
create unique index if not exists hunt_party_members_seat on public.hunt_party_members (party_id, seat);
alter table public.hunt_parties enable row level security;
alter table public.hunt_party_members enable row level security;
revoke all on public.hunt_parties, public.hunt_party_members from public, anon, authenticated, service_role;
comment on table public.hunt_parties is
  '2026-10-23 (lane S1). A hunting party: up to party_max heroes, any role mix, one shared instance (id = party id). '
  'Written only by the hr_hunt_party_* verbs; read through hr_hunt_party_view / hr_hunt_party_finder.';

-- The weapon TYPE a character's equipped weapon makes it (hr_hunt_weapons; unarmed = neutral).
create or replace function public.hr_hunt_weapon_of(p_user uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $$
  select coalesce((select w.weapon_type from public.player_equipment pe
                     join public.hr_hunt_weapons w on w.item_id = pe.item_id
                    where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'weapon'), 'neutral')
$$;
revoke execute on function public.hr_hunt_weapon_of(uuid, int) from public, anon, authenticated, service_role;

-- The open party a character is in, or null.
create or replace function public.hr_hunt_party_of(p_user uuid, p_slot int)
returns uuid language sql stable set search_path = public, pg_catalog as $$
  select m.party_id from public.hunt_party_members m join public.hunt_parties p on p.id = m.party_id
   where m.user_id = p_user and m.slot = p_slot and p.closed_at is null
$$;
revoke execute on function public.hr_hunt_party_of(uuid, int) from public, anon, authenticated, service_role;

-- ── §2 THE PARTY VERBS ───────────────────────────────────────────────────────
-- C1's verb shape: identity -> slot -> idempotency replay -> rate gate -> input
-- -> lock (the party row FIRST, then the character) -> state -> write -> result.
create or replace function public.hr_hunt_party_create(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_create';
  v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open')); end if;
  if public.hr_hunt_party_of(v_uid, p_slot) is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_in_party')); end if;
  insert into public.hunt_parties (hunt_id, leader_user, leader_slot, max_size)
    values (p_hunt, v_uid, p_slot, public.hr_hunt_limit('party_max')) returning id into v_id;
  insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
    values (v_id, v_uid, p_slot, 0, public.hr_hunt_weapon_of(v_uid, p_slot));
  v_r := jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_join(p_slot int, p_party uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_join';
  v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_p public.hunt_parties%rowtype; v_seat int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_party is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = p_party for update;
  if not found or v_p.closed_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open')); end if;
  if public.hr_hunt_party_of(v_uid, p_slot) is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_in_party')); end if;
  if (select count(*) from public.hunt_party_members m where m.party_id = p_party) >= v_p.max_size then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size)); end if;
  select min(s) into v_seat from generate_series(0, v_p.max_size - 1) s
   where not exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.seat = s);
  insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
    values (p_party, v_uid, p_slot, v_seat, public.hr_hunt_weapon_of(v_uid, p_slot));
  v_r := jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- Leave (or, for the leader, hand the party to the lowest remaining seat; the
-- last member closes it). Refused while hunting the party's instance.
create or replace function public.hr_hunt_party_leave(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_leave';
  v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_next record;
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
  delete from public.hunt_party_members where party_id = v_pid and user_id = v_uid and slot = p_slot;
  if not exists (select 1 from public.hunt_party_members where party_id = v_pid) then
    update public.hunt_parties set closed_at = now() where id = v_pid;
  elsif v_p.leader_user = v_uid and v_p.leader_slot = p_slot then
    select m.user_id, m.slot into v_next from public.hunt_party_members m where m.party_id = v_pid order by m.seat limit 1;
    update public.hunt_parties set leader_user = v_next.user_id, leader_slot = v_next.slot where id = v_pid;
  end if;
  v_r := jsonb_build_object('ok', true, 'party', null);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The leader removes the member in a SEAT (never by a client-named user id).
create or replace function public.hr_hunt_party_kick(p_slot int, p_seat int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_kick';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_t record;
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
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_t.user_id and h.slot = v_t.slot
               and h.ended_at is null and h.instance_id = v_pid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'member_hunting')); end if;
  delete from public.hunt_party_members where party_id = v_pid and user_id = v_t.user_id and slot = v_t.slot;
  v_r := jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- THE PARTY FINDER: open parties of a hunt (or every hunt) with a free seat;
-- with p_weapon, only parties with NO member of that weapon type. Read-only.
create or replace function public.hr_hunt_party_finder(p_slot int, p_hunt text default null, p_weapon text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party_hunt_view') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_weapon is not null and not exists (select 1 from public.hr_hunt_weapon_roles w where w.weapon_type = p_weapon) then
    return jsonb_build_object('ok', false, 'error', 'bad_weapon'); end if;
  return jsonb_build_object('ok', true, 'parties', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'hunt', p.hunt_id, 'max', p.max_size,
             'seats', (select jsonb_agg(jsonb_build_object('seat', m.seat, 'weapon', m.weapon_type,
                         'name', coalesce((select pr.display_name from public.profiles pr where pr.id = m.user_id), 'Adventurer'))
                         order by m.seat) from public.hunt_party_members m where m.party_id = p.id))
             order by p.created_at, p.id)
      from public.hunt_parties p
     where p.closed_at is null and (p_hunt is null or p.hunt_id = p_hunt)
       and (select count(*) from public.hunt_party_members m where m.party_id = p.id) < p.max_size
       and (p_weapon is null or not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and m.weapon_type = p_weapon))
     limit 50), '[]'::jsonb));
end $$;

revoke execute on function public.hr_hunt_party_create(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_create(int, text, uuid) from anon, service_role;
grant execute on function public.hr_hunt_party_create(int, text, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_join(int, uuid, uuid) from public;
revoke execute on function public.hr_hunt_party_join(int, uuid, uuid) from anon, service_role;
grant execute on function public.hr_hunt_party_join(int, uuid, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_leave(int, uuid) from public;
revoke execute on function public.hr_hunt_party_leave(int, uuid) from anon, service_role;
grant execute on function public.hr_hunt_party_leave(int, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_kick(int, int, uuid) from public;
revoke execute on function public.hr_hunt_party_kick(int, int, uuid) from anon, service_role;
grant execute on function public.hr_hunt_party_kick(int, int, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from public;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from anon, service_role;
grant execute on function public.hr_hunt_party_finder(int, text, text) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_hunt_party_create', 'hr_hunt_party_join', 'hr_hunt_party_leave', 'hr_hunt_party_kick', 'hr_hunt_party_finder');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_party_create', 'p_slot integer, p_hunt text, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1): open a hunting party on a hunt with a ground; leader seat 0; moves no value'),
  ('hr_hunt_party_join', 'p_slot integer, p_party uuid, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1): take the lowest free seat of an open party, up to party_max; the weapon type is the server''s'),
  ('hr_hunt_party_leave', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1): leave a party (not while hunting its instance); the leader hands it on, the last closes it'),
  ('hr_hunt_party_kick', 'p_slot integer, p_seat integer, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1): the leader removes the member in a SEAT (no user id crosses), not while that member hunts'),
  ('hr_hunt_party_finder', 'p_slot integer, p_hunt text, p_weapon text', 'authenticated',
   'added 2026-10-23 (lane S1): read-only list of open parties with a free seat, filtered by hunt and by a weapon type no member has');

-- ── §3 ENTERING A HUNT ───────────────────────────────────────────────────────
-- THE ONE SESSION INSERTER: a session row (+ tally + `entered`) at `p_from` on
-- `p_instance` (null = its own solo instance), in `p_seat`. The caller holds
-- the character lock and has validated everything.
create or replace function public.hr_hunt_open_session(p_user uuid, p_slot int, p_hunt text, p_prev uuid,
  p_preset int, p_falls int, p_hours int, p_instance uuid, p_from timestamptz, p_seat int)
returns uuid language plpgsql set search_path = public, pg_catalog as $$
declare
  v_id   uuid := gen_random_uuid();
  v_keep int := coalesce(public.hr_hunt_limit('sessions_kept'), 20);
begin
  -- RETENTION: the character keeps its last `sessions_kept` hunts, this one included.
  delete from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is not null
     and h.id not in (select x.id from public.hunt_sessions x
                       where x.user_id = p_user and x.slot = p_slot and x.ended_at is not null
                       order by x.entered_at desc, x.id limit greatest(0, v_keep - 1));
  insert into public.hunt_sessions (id, user_id, slot, hunt_id, prev_session_id, preset, falls_limit, hours_limit,
                                    entered_at, hunt_from, settled_to, next_swing_at, instance_id, seat)
  values (v_id, p_user, p_slot, p_hunt, p_prev, p_preset, p_falls, p_hours, now(), p_from, p_from, p_from, p_instance, p_seat);
  insert into public.hunt_session_tally (session_id, user_id, slot) values (v_id, p_user, p_slot);
  insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
  values (v_id, p_user, p_slot, 'entered', now(), jsonb_build_object('hunt', p_hunt));
  return v_id;
end $$;
revoke execute on function public.hr_hunt_open_session(uuid, int, text, uuid, int, int, int, uuid, timestamptz, int)
  from public, anon, authenticated, service_role;

-- C1's signature, kept for hr_hunt_swap: a SOLO session after the walk.
create or replace function public.hr_hunt_new_session(p_user uuid, p_slot int, p_hunt text, p_prev uuid,
  p_preset int, p_falls int, p_hours int)
returns uuid language sql set search_path = public, pg_catalog as $$
  select public.hr_hunt_open_session(p_user, p_slot, p_hunt, p_prev, p_preset, p_falls, p_hours, null,
    date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))), 0)
$$;
revoke execute on function public.hr_hunt_new_session(uuid, int, text, uuid, int, int, int) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_enter(p_slot int, p_hunt text, p_bag jsonb, p_preset int,
  p_falls int, p_hours int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_enter';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_st   public.player_state%rowtype;
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean; v_have bigint;
  v_items text[] := '{}';
  v_falls int; v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
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
  -- A HUNT IS FOUGHT ON A GROUND: no ground, no world, no hunt (spec §1.1).
  if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_falls := coalesce(p_falls, public.hr_hunt_limit('falls_default'));
  if v_falls < public.hr_hunt_limit('falls_min') or v_falls > public.hr_hunt_limit('falls_max') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_falls')); end if;
  if p_hours is not null and (p_hours < public.hr_hunt_limit('hours_min') or p_hours > public.hr_hunt_limit('hours_max')) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_hours')); end if;
  -- THE BAG, shape only (stock is checked under the lock).
  if p_bag is null then p_bag := '[]'::jsonb; end if;
  if jsonb_typeof(p_bag) <> 'array' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_bag')); end if;
  if jsonb_array_length(p_bag) > v_lines then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'too_many_lines', 'max', v_lines)); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('item', 'qty', 'essential'))
       or jsonb_typeof(v_line->'item') is distinct from 'string' or jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line ? 'essential' and jsonb_typeof(v_line->'essential') <> 'boolean') then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_bag')); end if;
    v_item := v_line->>'item';
    if not exists (select 1 from public.hr_hunt_supplies where item_id = v_item) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_supply', 'item', left(v_item, 64))); end if;
    if v_item = any (v_items) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'duplicate_line', 'item', v_item)); end if;
    v_items := v_items || v_item;
    if (v_line->>'qty') !~ '^[0-9]{1,7}$' or (v_line->>'qty')::bigint < 1 or (v_line->>'qty')::bigint > 100000 then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty', 'item', v_item)); end if;
  end loop;

  -- THE PARTY ROW FIRST (lock order: party, then character), then the character.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    if v_p.hunt_id <> p_hunt then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunt_mismatch', 'hunt', v_p.hunt_id)); end if;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  if v_st.active_kind <> 'idle' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind)); end if;
  if p_preset <> 0 and not exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- STAMINA: an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(v_uid, p_slot, now()), 0) <= 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_stamina')); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_line->>'item' for update;
    if coalesce(v_have, 0) < (v_line->>'qty')::bigint then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item', v_line->>'item', 'have', coalesce(v_have, 0), 'need', (v_line->>'qty')::bigint)); end if;
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
      -- No open session: the instance restarts its clock here, with no world (the
      -- swing counter keeps counting forward).
      update public.hunt_instances set world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, v_falls, p_hours, v_party, v_from, coalesce(v_seat, 0));
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

  v_r := jsonb_build_object('ok', true, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) from public;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) to authenticated;

-- A party hunts one ground: a member cannot change hunt mid-hunt. One anchored
-- line (C1's body is otherwise unchanged).
do $mig$
declare
  v_def text; v_n int;
  c_old constant text := $a$  if v_s.hunt_id = p_hunt then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_hunt')); end if;
$a$;
  c_new constant text := $a$  if v_s.hunt_id = p_hunt then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_hunt')); end if;
  -- A PARTY HUNTS ONE GROUND (2026-10-23-hunt-party.sql).
  if exists (select 1 from public.hunt_instances i where i.id = v_s.instance_id and i.kind = 'party') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunt')); end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_change(integer,text,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, '''party_hunt''') > 0 then raise notice 'hr_hunt_change already refuses a party member — edit skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then raise exception 'hr_hunt_change: the same_hunt anchor matched % times (need 1) — the body moved', v_n; end if;
  execute replace(v_def, c_old, c_new);
end $mig$;
revoke execute on function public.hr_hunt_change(int, text, uuid) from public;
revoke execute on function public.hr_hunt_change(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_change(int, text, uuid) to authenticated;

-- RETIRED with their last reader: the C2 default slot preset.
drop function if exists public.hr_hunt_preset_slots(uuid, int, int);
drop table if exists public.hr_hunt_default_preset;

-- ── §4 THE `party` AND `account` SECTIONS ────────────────────────────────────
-- `party` is the shape the hunt screen's party panel reads (spec §1.5): a solo
-- hunt is a party of one, so an open session with no party answers a party of
-- the character alone. leader / self and every member's `unit` are UNIT ids in
-- the instance world (hunt_sessions.unit_id, null until its first settle). The
-- vitals (hp, mana, down, eating, drinking, aggro) are read off the instance
-- pose BY NAME (hr_hunt_world_shape.fields, generated from world-state.js
-- FIELDS) and only when the pose is of the catalogue's shape; otherwise they are
-- null, never invented. dps / hps = the session's dealt / healed over its hunted
-- seconds. Peer data reaches a member only through this instance-scoped view.
create or replace function public.hr_hunt_party_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
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
          'down', coalesce((v_u->>((v_uf->>'downMs')::int))::bigint, 0) > 0 or (v_u->>((v_uf->>'alive')::int)) = 'false',
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
           h.hunt_from, h.settled_to
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', coalesce((select pr.display_name from public.profiles pr where pr.id = v_r.user_id), 'Adventurer'),
        'level', public.hr_bounty_combat_level(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', to_jsonb(ps.max_hp)) end,
        'mana', v_v->'mana', 'mana_max', v_v->'mana_max',
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'down', coalesce((v_v->>'down')::boolean, false), 'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false))
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
end $$;
revoke execute on function public.hr_hunt_party_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('party', 'hr_hunt_party_view', '2026-10-23-hunt-party.sql: own membership (a solo hunt is a party of one) and the instance-scoped members (unit, name, level, weapon, role pick, HP, mana, dealt, healed, DPS, HPS, down, eating, drinking, aggro)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- `account`: the account-wide server config the client's AccountSession reads:
-- how many characters one login may play at once (session/config.js
-- maxConcurrentCharacters, generated as the `max_concurrent` limit row).
create or replace function public.hr_account_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('max_concurrent', public.hr_hunt_limit('max_concurrent'))
$$;
revoke execute on function public.hr_account_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('account', 'hr_account_view', '2026-10-23-hunt-party.sql: the account-wide server config the client reads (max_concurrent)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00005e1a0051', '000000c0-0000-0000-0000-00005e1a0052',
                               '000000c0-0000-0000-0000-00005e1a0053', '000000c0-0000-0000-0000-00005e1a0054',
                               '000000c0-0000-0000-0000-00005e1a0055']::uuid[];
  v_hunt text := (select g.hunt_id from public.hr_hunt_grounds g order by g.hunt_id limit 1);
  v jsonb; v_pid uuid; v_i int; v_role text;
  v_s1 public.hunt_sessions%rowtype; v_s2 public.hunt_sessions%rowtype;
  v_tick bigint := public.hr_hunt_limit('swing_interval_ms');
  v_probe boolean := false;
begin
  begin
    -- A ground the probe can enter: the shipped one, else a probe ground on a named hunt.
    if v_hunt is null then
      v_hunt := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
      insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats)
        values (v_hunt, 'probe_ground', 1, 1, 60000, 5);
      v_probe := true;
    end if;
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 5 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'hunt-party §5 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
    end loop;
    -- (a) create; four join; the fifth is refused party_full (party_max = 4).
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_create(0, v_hunt, '000000c0-0000-4000-a000-00005e1a0501');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): create answered %', v; end if;
    v_pid := (v->'party'->>'id')::uuid;
    for v_i in 2 .. 4 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      v := public.hr_hunt_party_join(0, v_pid, ('000000c0-0000-4000-a000-00005e1a050' || v_i)::uuid);
      if coalesce(v->>'ok', '') <> 'true' or (v->'party'->>'self_seat')::int is distinct from v_i - 1 then raise exception 'VERIFY(a): join % answered %', v_i, v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[5]::text, true);
    v := public.hr_hunt_party_join(0, v_pid, '000000c0-0000-4000-a000-00005e1a0505');
    if v->>'error' is distinct from 'party_full' then raise exception 'VERIFY(a): a fifth join answered %', v; end if;
    -- (b) the finder: the full party is not listed; filtering by the members' own weapon hides it too.
    v := public.hr_hunt_party_finder(0, v_hunt, null);
    if jsonb_array_length(v->'parties') <> 0 then raise exception 'VERIFY(b): a full party is listed: %', v; end if;
    -- (c) a kick by a non-leader is refused; the leader kicks seat 3; the finder now lists it, and by weapon:
    --     a weapon type a member holds hides it; one no member holds shows it.
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_kick(0, 3, '000000c0-0000-4000-a000-00005e1a0511');
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(c): a non-leader kick answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_kick(0, 3, '000000c0-0000-4000-a000-00005e1a0512');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'party'->'members') is distinct from 3 then raise exception 'VERIFY(c): the kick answered %', v; end if;
    if jsonb_array_length(public.hr_hunt_party_finder(0, v_hunt, (select w.weapon_type from public.hr_hunt_weapon_roles w
           where not exists (select 1 from public.hunt_party_members m where m.party_id = v_pid and m.weapon_type = w.weapon_type)
           order by w.weapon_type limit 1))->'parties') <> 1
       or jsonb_array_length(public.hr_hunt_party_finder(0, v_hunt, public.hr_hunt_weapon_of(v_u[1], 0))->'parties') <> 0 then
      raise exception 'VERIFY(c): the weapon filter is wrong'; end if;
    -- (d) ENTERING TOGETHER: two members enter; the second's arrival stands on the
    --     instance's boundaries; both name the party instance and their seats.
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, null, '000000c0-0000-4000-a000-00005e1a0521');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the leader''s enter answered %', v; end if;
    select * into v_s1 from public.hunt_sessions where user_id = v_u[1] and ended_at is null;
    if v_s1.instance_id <> v_pid or v_s1.seat <> 0
       or (select kind from public.hunt_instances where id = v_pid) <> 'party'
       or (select settled_to from public.hunt_instances where id = v_pid) <> v_s1.hunt_from then
      raise exception 'VERIFY(d): the leader''s session is not on the party instance at its arrival'; end if;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    update public.hunt_instances set next_swing_at = v_s1.hunt_from - interval '1 second', settled_to = v_s1.hunt_from - interval '1 second'
     where id = v_pid;  -- an instance mid-clock: its boundaries are off the new walk's end
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, null, '000000c0-0000-4000-a000-00005e1a0522');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the second enter answered %', v; end if;
    select * into v_s2 from public.hunt_sessions where user_id = v_u[2] and ended_at is null;
    if v_s2.instance_id <> v_pid or v_s2.seat <> 1
       or (floor(extract(epoch from (v_s2.hunt_from - (v_s1.hunt_from - interval '1 second'))) * 1000)::bigint) % v_tick <> 0
       or v_s2.hunt_from < now() then
      raise exception 'VERIFY(d): the second arrival % is not on the instance''s boundaries', v_s2.hunt_from; end if;
    -- (e) a hunting member cannot leave or be kicked; a party member cannot enter another hunt.
    v := public.hr_hunt_party_leave(0, '000000c0-0000-4000-a000-00005e1a0531');
    if v->>'error' is distinct from 'hunt_open' then raise exception 'VERIFY(e): a hunting leave answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_kick(0, 1, '000000c0-0000-4000-a000-00005e1a0532');
    if v->>'error' is distinct from 'member_hunting' then raise exception 'VERIFY(e): kicking a hunter answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[3]::text, true);
    v := public.hr_hunt_enter(0, (select t.hunt_id from public.hr_hunt_travel t where t.hunt_id <> v_hunt and t.training order by t.hunt_id limit 1),
                              '[]'::jsonb, 0, null, null, '000000c0-0000-4000-a000-00005e1a0533');
    if v->>'error' is distinct from 'no_ground' and v->>'error' is distinct from 'party_hunt_mismatch' then
      raise exception 'VERIFY(e): a party member entering another hunt answered %', v; end if;
    -- (f) a hunt with no ground cannot be entered at all.
    perform set_config('request.jwt.claim.sub', v_u[5]::text, true);
    v := public.hr_hunt_enter(0, (select t.hunt_id from public.hr_hunt_travel t where t.training
                                     and not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = t.hunt_id) order by t.hunt_id limit 1),
                              '[]'::jsonb, 0, null, null, '000000c0-0000-4000-a000-00005e1a0541');
    if v->>'error' is distinct from 'no_ground' then raise exception 'VERIFY(f): a groundless hunt answered %', v; end if;
    -- (g) the section in the party panel's shape: members by seat, names from
    -- profiles, the hunting flag; the account section carries the config.
    v := public.hr_state_of(v_u[1], 0);
    if (v->'account'->>'max_concurrent')::int is distinct from public.hr_hunt_limit('max_concurrent') then
      raise exception 'VERIFY(g): the account section is %', v->'account'; end if;
    v := v->'party';
    if v is null or v ? 'seats' or v ? 'me' or jsonb_array_length(v->'members') is distinct from 3 or (v->>'self_seat')::int is distinct from 0
       or (v->>'leader_seat')::int is distinct from 0
       or (v->'members'->0->>'seat')::int is distinct from 0 or (v->'members'->0->>'hunting')::boolean is distinct from true
       or (v->'members'->2->>'hunting')::boolean is distinct from false or ((v->'members'->2) ? 'unit') is distinct from true
       or (v->'members'->2->'hp') is distinct from 'null'::jsonb or not coalesce(v->'members'->0 ? 'role_pick', false) or (v->>'open')::boolean is distinct from true then
      raise exception 'VERIFY(g): the party section is %', v; end if;
    raise exception using errcode = 'HR860', message = 'hunt-party §5 complete - rolling back';
  exception when sqlstate 'HR860' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.hunt_parties where leader_user = any (v_u))
     or exists (select 1 from public.hr_hunt_grounds where ground_id = 'probe_ground') then
    raise exception 'VERIFY(h): §5 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hunt_parties', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hunt_party_members', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_hunt_party_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_account_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_open_session(uuid,integer,text,uuid,integer,integer,integer,uuid,timestamp with time zone,integer)', 'execute') then
      raise exception 'VERIFY(h): % reaches a party table or internal', v_role; end if;
  end loop;
  if to_regprocedure('public.hr_hunt_preset_slots(uuid,integer,integer)') is not null or to_regclass('public.hr_hunt_default_preset') is not null then
    raise exception 'VERIFY(h): the C2 default slot preset survives'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-party: up to party_max, any mix, one shared instance on aligned clocks, finder by weapon type, seats not ids; all green';
end $$;
