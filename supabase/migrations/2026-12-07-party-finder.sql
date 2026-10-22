-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PARTY FINDER THAT DECIDES: SEAT READINESS, LISTINGS WITH A
-- GROUND AND LEVELS, AND "LOOK FOR A PARTY HERE" (lane c-hunt-screens-server,
-- backend-architect, 2026-10-22; designer plan "Hunts, Hunt prep and the Party
-- finder", docs/planning/PRIORITY_BOARD.md, items B #5, C #1, C #2). STAGED, NOT
-- APPLIED. Game CLOSED: applies on its passing §8. A SOCIAL SURFACE: in the
-- reopen Security review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- B #5 SEAT READINESS. hr_party_seat_ready(party, user, slot, hunt, leader, joined)
--    NEW, internal, read-only: {ok:true,in:true} (already in this party's hunt),
--    {ok:true,in:false} (Start would enter it) or the refusal: `away` (the account
--    has not had the game open lately; never the leader's own heroes) or
--    hr_hunt_enter_check's answer for the seat's own saved bag, setup in use and
--    last hours (2026-12-05-hunt-setup-per-ground.sql). hr_hunt_party_start
--    RESTATED WHOLE (§0 pin): each seat is judged by it, then entered by
--    hr_hunt_enter_for (which asks the same predicate under its locks), all or
--    none as before; the `not_ready` seats carry the predicate's code.
--    hr_hunt_party_view RESTATED WHOLE (§0 pin): every member row of a party
--    gains `ready` (bool) and `ready_why` (the refusal CODE only, never its
--    detail: no item, amount or hunt of another player), judged on the party's
--    `hunt` (null = no ground yet: the ground's own checks wait for Start).
-- C #1 LISTINGS CARRY A GROUND AND LEVELS. hunt_parties.listed_at (NEW): when the
--    current listing began (server clock; null = not listed).
--    hr_hunt_party_list(p_slot, p_listed, p_idem, p_hunt DEFAULT NULL) REPLACES
--    the 3-argument one (dropped; same named arguments still resolve, so the
--    shipped client keeps working until it sends p_hunt): p_hunt is the ground
--    the party is listed for, stored in hunt_parties.hunt_id (no_ground for an
--    unknown one, the leader's admission gate, party_hunting to change it while
--    the party hunts). hr_hunt_party_finder RESTATED WHOLE (§0 pin): each party
--    carries `listed_ms` (age, server clock) and each seat its `level` and
--    `leader`; the 50-row cap now bounds the rows (it bounded the one aggregate
--    row before, so the read was unbounded); and `seekers` (C #2).
-- C #2 "LOOK FOR A PARTY HERE". party_seekers (NEW; RLS on, no policy, no client
--    grant): one row per character, the ground and the server-clock window.
--    hr_party_seek(p_slot, p_hunt, p_on, p_idem) NEW client intent: on = list
--    this hero for a ground (refused while hunting `hunt_open`, in a party
--    `in_party`, for an unknown ground `no_ground`, or one its admission gate
--    refuses); off = end it. Keyed, rate-gated (`party`), journalled in
--    player_intents like every party setting. The entry ENDS on: a join (any seat
--    taken: trigger on hunt_party_members, which also covers leading a new
--    party), a hunt start (trigger on hunt_sessions: enter, restart, party start),
--    sign-out (listed only while the account is seen, the party seat's own
--    75-second rule; the first finder read that sees it gone deletes it) and 30
--    minutes (hr_party_seek_ttl). hr_party_seek_view NEW + section `party_seek`:
--    { hunt, left_ms } of this hero, or null. The finder's `seekers`: name, level,
--    weapon (server-derived at read), ground and age; never the reader's own
--    account, never across a block.
--
-- ── WHAT CROSSES TO ANOTHER PLAYER (CLAUDE.md §1) ──────────────────────────────
-- Names (profiles via hr_character_name), levels and weapons are server reads;
-- every time is the server's; the only client inputs are a catalogue-checked
-- ground id and on/off. A party member sees another seat's readiness CODE (e.g.
-- no_stamina, insufficient_item, hunt_open), the same fact Start already told the
-- leader; no amount, item or other hunt id is projected.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- hr_party_seek: hr_hunt_lock (the character), then the party test, then one
-- upsert/delete on the seeker PK. A join and a hunt start take the same
-- character lock before the trigger's delete, so a seek racing either serialises
-- on it: seek first = the trigger ends it; join first = in_party. The finder's
-- delete touches only rows already outside the window. Listing: the party row
-- FOR UPDATE, as before.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- party_seekers: at most one row per character (PK), ~80 B; index (hunt_id,
-- created_at). Readiness: per seat, one indexed exists while hunting (the hot
-- path, every settle's hr_state_of); in town the enter predicate (~a dozen PK
-- reads) for at most 4 seats.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop the two hr_party_seek_end triggers and the functions hr_party_seek,
-- hr_party_seek_view, hr_party_seek_end, hr_party_seek_live, hr_party_seek_ttl,
-- hr_party_seat_ready; drop party_seekers; delete the `party_seek` section and the
-- hr_party_seek baseline row; drop the 4-argument hr_hunt_party_list and re-apply
-- the 3-argument one from 2026-10-29-party-security.sql (and its baseline row);
-- re-apply hr_hunt_party_start from 2026-10-30-town-activity-yields.sql,
-- hr_hunt_party_view from 2026-11-17-hunt-density-home.sql and
-- hr_hunt_party_finder from 2026-10-29-party-security.sql; drop listed_at.
-- ORDER: after 2026-12-06-hunt-bests-supply.sql; needs 2026-12-05-hunt-setup-per-ground.sql
-- (hr_hunt_enter_check). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS (md5 of the CR-stripped prosrc: the chain-end image, or this file's own) ──
do $mig$
declare v_src text;
begin
  if to_regprocedure('public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)') is null then
    raise exception 'PRECONDITION: apply 2026-12-05-hunt-setup-per-ground.sql first (hr_hunt_enter_check)'; end if;
  if to_regprocedure('public.hr_party_away(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_party_last_seen(uuid,timestamp with time zone)') is null
     or to_regprocedure('public.hr_social_blocked(uuid,uuid)') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: hr_party_away / hr_party_last_seen / hr_social_blocked / hr_state_sections missing'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_party_start(integer,text,uuid)'::regprocedure;
  if md5(v_src) <> '786f8e23b64ffa19441d61f86b732092' and strpos(v_src, 'PARTY-FINDER') = 0 then
    raise exception 'PIN: hr_hunt_party_start is neither the 2026-10-30 town-yields image (786f8e23...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> '861e58dbaf819e1206cca16458906804' and strpos(v_src, 'PARTY-FINDER') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither the 2026-11-17 density-home image (861e58db...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_party_finder(integer,text,text)'::regprocedure;
  if md5(v_src) <> '3b24ad3deae07ef6c5503f6064953333' and strpos(v_src, 'PARTY-FINDER') = 0 then
    raise exception 'PIN: hr_hunt_party_finder is neither the 2026-10-29 party-security image (3b24ad3d...) nor this file''s (md5 %)', md5(v_src); end if;
  -- the 3-argument listing is this file's to replace (gone on a re-apply)
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = to_regprocedure('public.hr_hunt_party_list(integer,boolean,uuid)');
  if v_src is not null and md5(v_src) <> 'ff62dab57f39fdf116ffd2cefb9cc62d' then
    raise exception 'PIN: hr_hunt_party_list(int,bool,uuid) is not the 2026-10-29 party-security image (ff62dab5...): md5 %', md5(v_src); end if;
  if v_src is null and to_regprocedure('public.hr_hunt_party_list(integer,boolean,uuid,text)') is null then
    raise exception 'PIN: neither hr_hunt_party_list(int,bool,uuid) nor this file''s 4-argument one exists'; end if;
end $mig$;

-- ── §1 THE LISTING'S AGE, AND THE SEEKERS ────────────────────────────────────
alter table public.hunt_parties add column if not exists listed_at timestamptz;
comment on column public.hunt_parties.listed_at is
  '2026-12-07-party-finder.sql: when the current finder listing began (server clock; reset when the listed ground changes); null = not listed.';
update public.hunt_parties set listed_at = now() where listed and closed_at is null and listed_at is null;

create table if not exists public.party_seekers (
  user_id    uuid not null,
  slot       int  not null,
  hunt_id    text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, slot),
  constraint party_seekers_char_fk foreign key (user_id, slot)
    references public.player_state (user_id, slot) on delete cascade,
  constraint party_seekers_window check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);
create index if not exists party_seekers_hunt on public.party_seekers (hunt_id, created_at desc);
alter table public.party_seekers enable row level security;
revoke all on public.party_seekers from public, anon, authenticated, service_role;
comment on table public.party_seekers is
  '2026-12-07-party-finder.sql: a lone hero looking for a party on one ground (designer plan C #2). One row per character. '
  'Written only by hr_party_seek (on/off, server clock); ended by a join or a hunt start (hr_party_seek_end triggers), by '
  'hr_party_seek_ttl and by sign-out (hr_party_seek_live). Read by hr_hunt_party_finder (`seekers`) and hr_party_seek_view '
  '(the party_seek section). RLS on, no policy, no client grant.';

create or replace function public.hr_party_seek_ttl()
returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '30 minutes' $$;
revoke execute on function public.hr_party_seek_ttl() from public, anon, authenticated, service_role;

create or replace function public.hr_party_seek_live(p_user uuid, p_created timestamptz, p_expires timestamptz)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- PARTY-FINDER (2026-12-07-party-finder.sql): inside its window, and the account seen within the party seat's own
  -- away rule (the seek itself counts as a sighting, as a seat's join does).
  select p_expires > now() and public.hr_party_last_seen(p_user, p_created) > now() - public.hr_party_away_after()
$$;
revoke execute on function public.hr_party_seek_live(uuid, timestamptz, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.hr_party_seek_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- PARTY-FINDER (2026-12-07-party-finder.sql): this hero's own seek, { hunt, left_ms }, or null.
  select (select jsonb_build_object('hunt', s.hunt_id,
                                    'left_ms', greatest(0, floor(extract(epoch from (s.expires_at - now())) * 1000))::bigint)
            from public.party_seekers s
           where s.user_id = p_user and s.slot = p_slot and s.expires_at > now())
$$;
revoke execute on function public.hr_party_seek_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('party_seek', 'hr_party_seek_view', '2026-12-07-party-finder.sql: this hero''s "look for a party here" listing, { hunt, left_ms }, or null')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

create or replace function public.hr_party_seek_end()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- PARTY-FINDER (2026-12-07-party-finder.sql): a seat taken or a hunt started ends the hero's seek.
  delete from public.party_seekers where user_id = new.user_id and slot = new.slot;
  return null;
end $$;
revoke execute on function public.hr_party_seek_end() from public;
revoke execute on function public.hr_party_seek_end() from anon, authenticated, service_role, hr_engine, hr_tick;
drop trigger if exists hr_party_seek_end_join on public.hunt_party_members;
create trigger hr_party_seek_end_join after insert on public.hunt_party_members
  for each row execute function public.hr_party_seek_end();
drop trigger if exists hr_party_seek_end_hunt on public.hunt_sessions;
create trigger hr_party_seek_end_hunt after insert on public.hunt_sessions
  for each row execute function public.hr_party_seek_end();

create or replace function public.hr_party_seek(p_slot int, p_hunt text, p_on boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'party_seek';
  v_uid uuid := auth.uid(); v_r jsonb; v_s public.hunt_sessions%rowtype;
begin
  -- PARTY-FINDER (2026-12-07-party-finder.sql): list (or unlist) THIS hero as looking for a party on one ground.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_on is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_on and (p_hunt is null or not exists (select 1 from public.hr_hunt_travel t where t.hunt_id = p_hunt)
               or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if p_on then
    if v_s.id is not null then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open')); end if;
    if public.hr_hunt_party_of(v_uid, p_slot) is not null then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'in_party')); end if;
    -- A ground this hero may not enter is not one it may look for a party on (the floor itself stays a warning).
    v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
    if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
    insert into public.party_seekers as s (user_id, slot, hunt_id, created_at, expires_at)
      values (v_uid, p_slot, p_hunt, now(), now() + public.hr_party_seek_ttl())
      on conflict (user_id, slot) do update set hunt_id = excluded.hunt_id, created_at = excluded.created_at, expires_at = excluded.expires_at;
  else
    delete from public.party_seekers where user_id = v_uid and slot = p_slot;
  end if;
  v_r := jsonb_build_object('ok', true, 'seek', public.hr_party_seek_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_party_seek(int, text, boolean, uuid) from public;
revoke execute on function public.hr_party_seek(int, text, boolean, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_party_seek(int, text, boolean, uuid) to authenticated;

-- ── §2 ONE SEAT PREDICATE ────────────────────────────────────────────────────
create or replace function public.hr_party_seat_ready(p_party uuid, p_user uuid, p_slot int, p_hunt text,
                                                      p_leader uuid, p_joined timestamptz)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare v_hours int; v_r jsonb;
begin
  -- PARTY-FINDER (2026-12-07-party-finder.sql): what Start does with one seat. {ok:true,in:true} already in this
  -- party's hunt; {ok:true,in:false} Start enters it; else the refusal Start answers in `not_ready`.
  if exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot
               and h.ended_at is null and h.instance_id = p_party) then
    return jsonb_build_object('ok', true, 'in', true); end if;
  -- AWAY: a member whose account has not had the game open lately is not marched in unseen (the leader's own heroes never are).
  if p_user is distinct from p_leader and public.hr_party_away(p_user, p_slot, p_joined) then
    return jsonb_build_object('ok', false, 'error', 'away'); end if;
  select h.hours_limit into v_hours from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot
   order by h.entered_at desc, h.id limit 1;
  v_r := public.hr_hunt_enter_check(p_user, p_slot, p_hunt, public.hr_hunt_saved_bag(p_user, p_slot),
                                    public.hr_hunt_active_set(p_user, p_slot), v_hours, true);
  if v_r is not null then return v_r; end if;
  return jsonb_build_object('ok', true, 'in', false);
end $$;
revoke execute on function public.hr_party_seat_ready(uuid, uuid, int, text, uuid, timestamptz) from public;
revoke execute on function public.hr_party_seat_ready(uuid, uuid, int, text, uuid, timestamptz) from anon, authenticated, service_role, hr_engine, hr_tick;

CREATE OR REPLACE FUNCTION public.hr_hunt_party_start(p_slot integer, p_hunt text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a not-ready seat names the hunt it is in.
  -- PARTY-FINDER (2026-12-07-party-finder.sql): each seat is judged by hr_party_seat_ready, the predicate the party
  -- view's `ready` shows, then entered by hr_hunt_enter_for (which asks it again under its locks).
  c_verb constant text := 'hunt_party_start';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_m record; v_last public.hunt_sessions%rowtype; v_not jsonb := '[]'::jsonb; v_n int := 0; v_why jsonb;
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
      v_why := public.hr_party_seat_ready(v_pid, v_m.user_id, v_m.slot, p_hunt, v_uid, v_m.joined_at);
      continue when coalesce((v_why->>'in')::boolean, false);
      if coalesce(v_why->>'ok', 'false') = 'true' then
        select * into v_last from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
         order by h.entered_at desc, h.id limit 1;
        v_r := public.hr_hunt_enter_for(v_m.user_id, v_m.slot, p_hunt, public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),
                                        public.hr_hunt_active_set(v_m.user_id, v_m.slot), v_last.hours_limit);
      else
        v_r := v_why;
      end if;
      if coalesce(v_r->>'ok', 'false') = 'true' then v_n := v_n + 1;
      else v_not := v_not || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('seat', v_m.seat,
                                                 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                 'error', v_r->>'error', 'hunt', v_r->'hunt')));
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
end $function$;
revoke execute on function public.hr_hunt_party_start(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_start(int, text, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_party_start(int, text, uuid) to authenticated;

-- ── §3 THE PARTY VIEW: every seat says whether Start would take it ─────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_party_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): `leader_densities`, the leader's pick per ground (hunt_density)
  -- every seat's picker shows read-only; it replaces 2026-11-01's one `leader_density`.
  -- HERO-LOOKS (2026-11-04-party-outfits.sql): each member row carries the outfit its character wears (public, as in town).
  -- PARTY-FINDER (2026-12-07-party-finder.sql): each member row of a party carries `ready` and `ready_why`, the
  -- predicate Start uses (hr_party_seat_ready) on the party's `hunt`; the CODE only, never another player's detail.
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
  v_ldens jsonb;
  v_ready jsonb;
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
    v_ready := case when v_pid is not null
                    then public.hr_party_seat_ready(v_pid, v_r.user_id, v_r.slot, v_p.hunt_id, v_p.leader_user, v_r.joined_at) end;
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
        -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set), null when none or no
        -- longer owned (a lapsed premium outfit): the same look hr_town_walkers shows of it in town.
        'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(v_r.user_id, v_r.slot))
                       then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end,
        -- SEAT READINESS (party only): would Start take this seat now, and if not, the code it would answer.
        'ready', case when v_ready is not null then coalesce(v_ready->>'ok', 'false') = 'true' end,
        'ready_why', case when v_ready is not null and coalesce(v_ready->>'ok', 'false') <> 'true' then v_ready->>'error' end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
      left join public.player_outfits po on po.user_id = v_r.user_id and po.slot = v_r.slot
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then
      v_lseat := v_r.seat;
      -- the leader's picks per ground, as hr_hunt_density_pick freezes them on a party instance
      v_ldens := public.hr_hunt_density_view(v_r.user_id, v_r.slot);
    end if;
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
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem,
    'listed', coalesce(v_p.listed, false), 'leader_densities', coalesce(v_ldens, '{}'::jsonb));
end $function$;
revoke execute on function public.hr_hunt_party_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §4 THE LISTING CARRIES ITS GROUND ────────────────────────────────────────
drop function if exists public.hr_hunt_party_list(integer, boolean, uuid);
create or replace function public.hr_hunt_party_list(p_slot int, p_listed boolean, p_idem uuid, p_hunt text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-FINDER (2026-12-07-party-finder.sql): the leader shows or hides its party, for a ground (p_hunt, stored in
  -- hunt_parties.hunt_id; null keeps the party's ground). listed_at starts the listing's age on the server clock.
  c_verb constant text := 'hunt_party_list';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_listed is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is not null and (not exists (select 1 from public.hr_hunt_travel t where t.hunt_id = p_hunt)
                             or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  if p_hunt is not null and v_p.hunt_id is distinct from p_hunt then
    -- A party already hunting keeps its ground until every member is out (as Start).
    if exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting', 'hunt', v_p.hunt_id)); end if;
    -- A ground the leader may not enter is not one to list for (the floor itself stays a warning).
    v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
    if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  end if;
  update public.hunt_parties
     set listed = p_listed,
         hunt_id = coalesce(p_hunt, hunt_id),
         listed_at = case when not p_listed then null
                          when listed and listed_at is not null and hunt_id is not distinct from coalesce(p_hunt, hunt_id) then listed_at
                          else now() end
   where id = v_pid;
  v_r := jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_party_list(int, boolean, uuid, text) from public;
revoke execute on function public.hr_hunt_party_list(int, boolean, uuid, text) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_party_list(int, boolean, uuid, text) to authenticated;

-- ── §5 THE FINDER: grounds, levels, the leader, the listing's age, and the heroes looking ─────
CREATE OR REPLACE FUNCTION public.hr_hunt_party_finder(p_slot integer, p_hunt text DEFAULT NULL::text, p_weapon text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): listed only, blocks hidden.
  -- PARTY-FINDER (2026-12-07-party-finder.sql): seats carry level + leader, parties listed_ms, at most 50 parties
  -- (the cap bounds the rows, not the one aggregate), and `seekers`: heroes looking for a party (never the reader's
  -- own account, never across a block), each read off the server at this moment.
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party_hunt_view') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_weapon is not null and not exists (select 1 from public.hr_hunt_weapon_roles w where w.weapon_type = p_weapon) then
    return jsonb_build_object('ok', false, 'error', 'bad_weapon'); end if;
  -- A seek outside its window, or whose hero has signed out, has ENDED: the first read that sees it removes it.
  delete from public.party_seekers s
   where (p_hunt is null or s.hunt_id = p_hunt) and not public.hr_party_seek_live(s.user_id, s.created_at, s.expires_at);
  return jsonb_build_object('ok', true,
    'parties', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'hunt', x.hunt_id, 'max', x.max_size,
               'listed_ms', case when x.listed_at is not null
                                 then greatest(0, floor(extract(epoch from (now() - x.listed_at)) * 1000))::bigint end,
               'seats', (select jsonb_agg(jsonb_build_object('seat', m.seat, 'weapon', m.weapon_type,
                           'name', public.hr_character_name(m.user_id, m.slot),
                           'level', public.hr_level_of(m.user_id, m.slot),
                           'leader', m.user_id = x.leader_user and m.slot = x.leader_slot)
                           order by m.seat) from public.hunt_party_members m where m.party_id = x.id))
               order by x.created_at, x.id)
        from (select p.id, p.hunt_id, p.max_size, p.listed_at, p.created_at, p.leader_user, p.leader_slot
                from public.hunt_parties p
               where p.closed_at is null and p.listed and (p_hunt is null or p.hunt_id = p_hunt)
                 and (select count(*) from public.hunt_party_members m where m.party_id = p.id) < p.max_size
                 and (p_weapon is null or not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and m.weapon_type = p_weapon))
                 and not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and m.user_id <> v_uid
                                   and public.hr_social_blocked(v_uid, m.user_id))
               order by p.created_at, p.id
               limit 50) x), '[]'::jsonb),
    'seekers', coalesce((
      select jsonb_agg(jsonb_build_object('name', public.hr_character_name(y.user_id, y.slot),
               'level', public.hr_level_of(y.user_id, y.slot),
               'weapon', public.hr_hunt_weapon_of(y.user_id, y.slot),
               'hunt', y.hunt_id,
               'age_ms', greatest(0, floor(extract(epoch from (now() - y.created_at)) * 1000))::bigint)
               order by y.created_at desc, y.user_id, y.slot)
        from (select s.user_id, s.slot, s.hunt_id, s.created_at
                from public.party_seekers s
               where (p_hunt is null or s.hunt_id = p_hunt) and s.user_id <> v_uid
                 and public.hr_party_seek_live(s.user_id, s.created_at, s.expires_at)
                 and not public.hr_social_blocked(v_uid, s.user_id)
               order by s.created_at desc, s.user_id, s.slot
               limit 50) y), '[]'::jsonb));
end $function$;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from public;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_hunt_party_finder(int, text, text) to authenticated;

-- ── §6 THE CLIENT RPC BASELINE ───────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_party_seek', 'hr_hunt_party_list');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_party_seek', 'p_slot integer, p_hunt text, p_on boolean, p_idem uuid', 'authenticated',
   'added 2026-12-07: the caller''s own hero looks for a party on one catalogued ground (on/off), server clock, 30 min, ends on join, hunt or sign-out; moves no value'),
  ('hr_hunt_party_list', 'p_slot integer, p_listed boolean, p_idem uuid, p_hunt text', 'authenticated',
   're-signed 2026-12-07: the leader shows or hides its party in the finder, for a catalogued ground (p_hunt, optional); moves no value');

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-00005e770001';
  v_b  constant uuid := '000000c0-0000-4000-a000-00005e770002';
  v_c  constant uuid := '000000c0-0000-4000-a000-00005e770003';
  v_u  uuid[] := array['000000c0-0000-4000-a000-00005e770001', '000000c0-0000-4000-a000-00005e770002', '000000c0-0000-4000-a000-00005e770003']::uuid[];
  k    text := '000000c0-0000-4000-a000-0000';
  v_g1 text; v_g2 text; v_far text;
  v jsonb; v_pv jsonb; v_pid uuid; v_i int; v_m jsonb; v_at timestamptz;
begin
  begin
    select g.hunt_id into v_g1 from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    select g.hunt_id into v_g2 from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) where g.hunt_id <> v_g1 order by h.band_min, g.hunt_id limit 1;
    -- a ground a level-1 hero may not enter (refused at the floor's hard margin), if the catalogue has one
    select g.hunt_id into v_far from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id)
     where h.band_min - 1 >= coalesce(public.hr_hunt_limit('below_range_refuse'), 1) order by h.band_min desc, g.hunt_id limit 1;
    if v_g1 is null or v_g2 is null then raise exception 'VERIFY(0): fewer than two hunt grounds'; end if;
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Finder ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-finder §8 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now()) on conflict (user_id) do update set seen_at = now();
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): A''s second hero refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 1;

    -- (a) A party of A's two heroes and B, no ground yet: every seat ready (the ground's own checks wait for Start).
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5e770101')::uuid);
    v_pid := public.hr_hunt_party_of(v_a, 0);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null then raise exception 'VERIFY(a): the own invite answered %', v; end if;
    v := public.hr_hunt_party_invite(0, 'Probe Finder B', (k || '5e770102')::uuid);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || '5e770103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): B''s accept answered %', v; end if;
    v_pv := public.hr_hunt_party_view(v_b, 0);
    if (select count(*) from jsonb_array_elements(v_pv->'members') m where (m->>'ready')::boolean is true and m->'ready_why' = 'null'::jsonb) <> 3 then
      raise exception 'VERIFY(a): a ground-less party''s seats read %', v_pv->'members'; end if;
    if (select bool_and(m ? 'ready' and m ? 'ready_why') from jsonb_array_elements(public.hr_state_of(v_a, 1)->'party'->'members') m) is not true then
      raise exception 'VERIFY(a): the envelope''s party section lacks ready / ready_why'; end if;

    -- (b) THE SAME PREDICATE: each not-ready seat reads the code Start then refuses with, and Start enters nobody.
    update public.social_presence set seen_at = now() - interval '2 minutes' where user_id = v_b;
    update public.hunt_party_members set joined_at = now() - interval '2 minutes' where user_id = v_b;
    insert into public.player_hunt_active (user_id, slot, action_set) values (v_a, 1, 3)
      on conflict (user_id, slot) do update set action_set = 3;
    v_pv := public.hr_hunt_party_view(v_a, 0);
    select jsonb_object_agg(m->>'name', m->'ready_why') into v_m from jsonb_array_elements(v_pv->'members') m;
    if v_m <> jsonb_build_object('Probe Finder A', null, public.hr_character_name(v_a, 1), 'unknown_preset', 'Probe Finder B', 'away') then
      raise exception 'VERIFY(b): the seats read %', v_m; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_start(0, v_g1, (k || '5e770110')::uuid);
    select jsonb_object_agg(s->>'name', s->'error') into v_m from jsonb_array_elements(v->'seats') s;
    if v->>'error' is distinct from 'not_ready'
       or v_m <> jsonb_build_object(public.hr_character_name(v_a, 1), 'unknown_preset', 'Probe Finder B', 'away')
       or exists (select 1 from public.hunt_sessions where user_id = any (v_u) and ended_at is null) then
      raise exception 'VERIFY(b): Start answered % (or entered someone)', v; end if;
    -- the ground's own check, once the party has one: a ground no seat may enter reads the gate's code on every seat
    if v_far is not null then
      update public.social_presence set seen_at = now() where user_id = v_b;
      delete from public.player_hunt_active where user_id = v_a and slot = 1;
      update public.hunt_parties set hunt_id = v_far where id = v_pid;
      v_pv := public.hr_hunt_party_view(v_a, 0);
      if (select count(*) from jsonb_array_elements(v_pv->'members') m where m->>'ready_why' = 'activity_locked') <> 3 then
        raise exception 'VERIFY(b): on a ground nobody may enter the seats read %', v_pv->'members'; end if;
      v := public.hr_hunt_party_start(0, v_far, (k || '5e770111')::uuid);
      if v->>'error' is distinct from 'not_ready' or jsonb_array_length(v->'seats') <> 3
         or exists (select 1 from jsonb_array_elements(v->'seats') s where s->>'error' <> 'activity_locked') then
        raise exception 'VERIFY(b): Start on that ground answered %', v; end if;
      update public.hunt_parties set hunt_id = null where id = v_pid;
    end if;
    update public.social_presence set seen_at = now() where user_id = v_b;
    delete from public.player_hunt_active where user_id = v_a and slot = 1;

    -- (c) LISTING: for a ground (stored, aged on the server clock), a member may not, an unknown ground is refused.
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_list(0, true, (k || '5e770120')::uuid, 'no_such_ground');
    if v->>'error' is distinct from 'no_ground' then raise exception 'VERIFY(c): an unknown ground answered %', v; end if;
    if v_far is not null then
      v := public.hr_hunt_party_list(0, true, (k || '5e770121')::uuid, v_far);
      if v->>'error' is distinct from 'activity_locked' then raise exception 'VERIFY(c): a ground the leader may not enter answered %', v; end if;
    end if;
    v := public.hr_hunt_party_list(0, true, (k || '5e770122')::uuid, v_g1);
    if coalesce(v->>'ok', '') <> 'true' or (select hunt_id from public.hunt_parties where id = v_pid) <> v_g1
       or (select listed_at from public.hunt_parties where id = v_pid) is null or v->'party'->>'hunt' <> v_g1 then
      raise exception 'VERIFY(c): listing for g1 answered %', v; end if;
    v_at := (select listed_at from public.hunt_parties where id = v_pid);
    v := public.hr_hunt_party_list(0, true, (k || '5e770122')::uuid, v_g2);
    if (select hunt_id from public.hunt_parties where id = v_pid) <> v_g1 then
      raise exception 'VERIFY(c): a replayed key moved the ground'; end if;
    v := public.hr_hunt_party_list(0, true, (k || '5e770123')::uuid);
    if (select listed_at from public.hunt_parties where id = v_pid) <> v_at or (select hunt_id from public.hunt_parties where id = v_pid) <> v_g1 then
      raise exception 'VERIFY(c): re-listing on the same ground restarted its age or lost its ground'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_list(0, false, (k || '5e770124')::uuid, v_g1);
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(c): a member''s listing answered %', v; end if;

    -- (d) THE FINDER: the ground, each seat's level and the leader flag, the listing's age.
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.hr_hunt_party_finder(0, v_g1, null);
    v_m := (select p from jsonb_array_elements(v->'parties') p where (p->>'id')::uuid = v_pid);
    if v_m is null or v_m->>'hunt' <> v_g1 or (v_m->>'listed_ms')::bigint < 0 or jsonb_array_length(v_m->'seats') <> 3
       or (select count(*) from jsonb_array_elements(v_m->'seats') s where (s->>'leader')::boolean) <> 1
       or (select s->>'name' from jsonb_array_elements(v_m->'seats') s where (s->>'leader')::boolean) <> 'Probe Finder A'
       or exists (select 1 from jsonb_array_elements(v_m->'seats') s where (s->>'level')::int is distinct from public.hr_level_of(v_a, 0)) then
      raise exception 'VERIFY(d): the finder row reads %', v_m; end if;

    -- (e) LOOK FOR A PARTY HERE: C seeks g1; leaders see C (server level, weapon); C sees itself in its own section only.
    v := public.hr_party_seek(0, 'no_such_ground', true, (k || '5e770130')::uuid);
    if v->>'error' is distinct from 'no_ground' then raise exception 'VERIFY(e): an unknown ground answered %', v; end if;
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770131')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'seek'->>'hunt' <> v_g1 or (v->'seek'->>'left_ms')::bigint not between 1790000 and 1800000
       or public.hr_state_of(v_c, 0)->'party_seek'->>'hunt' <> v_g1 then
      raise exception 'VERIFY(e): the seek answered % (section %)', v, public.hr_state_of(v_c, 0)->'party_seek'; end if;
    v := public.hr_party_seek(0, v_g2, true, (k || '5e770131')::uuid);
    if (select hunt_id from public.party_seekers where user_id = v_c) <> v_g1 then raise exception 'VERIFY(e): a replayed key moved the seek'; end if;
    if jsonb_array_length(public.hr_hunt_party_finder(0, null, null)->'seekers') <> 0 then
      raise exception 'VERIFY(e): a hero sees its own seek in the finder'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_finder(0, v_g1, null)->'seekers';
    if jsonb_array_length(v) <> 1 or v->0->>'name' <> 'Probe Finder C' or (v->0->>'level')::int <> public.hr_level_of(v_c, 0)
       or v->0->>'weapon' <> public.hr_hunt_weapon_of(v_c, 0) or v->0->>'hunt' <> v_g1 or (v->0->>'age_ms')::bigint < 0 then
      raise exception 'VERIFY(e): the leader''s finder lists %', v; end if;
    if jsonb_array_length(public.hr_hunt_party_finder(0, v_g2, null)->'seekers') <> 0 then
      raise exception 'VERIFY(e): another ground lists C'; end if;
    -- a block hides it, both ways
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_c, v_a);
    if jsonb_array_length(public.hr_hunt_party_finder(0, v_g1, null)->'seekers') <> 0 then
      raise exception 'VERIFY(e): a blocked reader still sees the seek'; end if;
    delete from public.chat_blocks where blocker_id = v_c and blocked_id = v_a;

    -- (f) IT ENDS: sign-out (hidden, then removed by the next read), 30 minutes, a seat taken, a hunt started, Off.
    update public.party_seekers set created_at = now() - interval '2 minutes' where user_id = v_c;
    update public.social_presence set seen_at = now() - interval '2 minutes' where user_id = v_c;
    v := public.hr_hunt_party_finder(0, v_g1, null);
    if jsonb_array_length(v->'seekers') <> 0 or exists (select 1 from public.party_seekers where user_id = v_c) then
      raise exception 'VERIFY(f): a signed-out seeker is still listed (or kept): % / %', v,
        (select to_jsonb(s) from public.party_seekers s where s.user_id = v_c); end if;
    update public.social_presence set seen_at = now() where user_id = v_c;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770140')::uuid);
    update public.party_seekers set created_at = now() - interval '31 minutes', expires_at = now() - interval '1 minute' where user_id = v_c;
    if public.hr_state_of(v_c, 0)->'party_seek' <> 'null'::jsonb
       or jsonb_array_length(public.hr_hunt_party_finder(0, v_g1, null)->'seekers') <> 0 then
      raise exception 'VERIFY(f): an expired seek still reads % / is listed', public.hr_state_of(v_c, 0)->'party_seek'; end if;
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770141')::uuid);
    v := public.hr_party_seek(0, null, false, (k || '5e770142')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'seek' <> 'null'::jsonb or exists (select 1 from public.party_seekers where user_id = v_c) then
      raise exception 'VERIFY(f): Off answered %', v; end if;
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770143')::uuid);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Finder C', (k || '5e770144')::uuid);
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_c, 0)->'party_invites'->0->>'id')::uuid, (k || '5e770145')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.party_seekers where user_id = v_c) then
      raise exception 'VERIFY(f): taking a seat answered % (or kept the seek)', v; end if;
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770146')::uuid);
    if v->>'error' is distinct from 'in_party' then raise exception 'VERIFY(f): a seated hero''s seek answered %', v; end if;
    v := public.hr_hunt_party_leave(0, (k || '5e770147')::uuid);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770148')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): a re-seek after leaving answered %', v; end if;
    v := public.hr_hunt_enter(0, v_g1, '[]'::jsonb, 0, null, (k || '5e770149')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.party_seekers where user_id = v_c) then
      raise exception 'VERIFY(f): a hunt start answered % (or kept the seek)', v; end if;
    v := public.hr_party_seek(0, v_g1, true, (k || '5e770150')::uuid);
    if v->>'error' is distinct from 'hunt_open' then raise exception 'VERIFY(f): a hunting hero''s seek answered %', v; end if;
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_c and h.ended_at is null;

    -- (g) START with every seat ready: all enter, and every seat then reads ready (in the hunt).
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_start(0, v_g1, (k || '5e770160')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 3 then raise exception 'VERIFY(g): the ready Start answered %', v; end if;
    if (select count(*) from jsonb_array_elements(public.hr_hunt_party_view(v_b, 0)->'members') m
         where (m->>'ready')::boolean and (m->>'hunting')::boolean) <> 3 then
      raise exception 'VERIFY(g): the hunting seats read %', public.hr_hunt_party_view(v_b, 0)->'members'; end if;
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_hunt_party_list(0, true, (k || '5e770161')::uuid, v_g2);
    if v->>'error' is distinct from 'party_hunting' then raise exception 'VERIFY(g): a new ground mid-hunt answered %', v; end if;

    -- (h) the grants: one new client RPC, nothing else reachable; the old listing signature is gone.
    if not has_function_privilege('authenticated', 'public.hr_party_seek(integer,text,boolean,uuid)', 'execute')
       or has_function_privilege('anon', 'public.hr_party_seek(integer,text,boolean,uuid)', 'execute')
       or not has_function_privilege('authenticated', 'public.hr_hunt_party_list(integer,boolean,uuid,text)', 'execute')
       or to_regprocedure('public.hr_hunt_party_list(integer,boolean,uuid)') is not null
       or has_function_privilege('authenticated', 'public.hr_party_seat_ready(uuid,uuid,integer,text,uuid,timestamp with time zone)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_party_seek_view(uuid,integer)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_party_seek_live(uuid,timestamp with time zone,timestamp with time zone)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_party_seek_end()', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_party_view(uuid,integer)', 'execute')
       or has_table_privilege('authenticated', 'public.party_seekers', 'select')
       or has_table_privilege('anon', 'public.party_seekers', 'select') then
      raise exception 'VERIFY(h): a grant is wrong'; end if;
    raise exception using errcode = 'HR898', message = 'party-finder §8 complete - rolling back';
  exception when sqlstate 'HR898' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.party_seekers where user_id = any (v_u)) then
    raise exception 'VERIFY(i): §8 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-finder: one seat predicate behind ready and not_ready, listings carry a ground + levels + leader + age, seekers list and end on join / hunt / sign-out / 30 min / off; all green';
end $$;
