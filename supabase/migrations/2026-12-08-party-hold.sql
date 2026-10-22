-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — WHO HOLDS THE PACK: "TAKE TURNS" OR "ONE TANK HOLDS" (lane
-- c-hunt-screens-server, backend-architect, 2026-10-22; Tyler approved 2026-10-22,
-- the Coordinator's contract). STAGED, NOT APPLIED. Game CLOSED: applies on its
-- passing §5. A PARTY / SOCIAL SURFACE: in the reopen Security review.
--
-- ── THE CONTRACT (another lane builds the engine and the client against it) ───
-- hunt_parties.hold_seat smallint NULL. NULL = "Take turns" (today's behaviour:
--    src/core/hunt/targeting.js holderTank rotates the holding tank per lap). A
--    seat number = "One tank holds": that seat's hero holds every lap.
-- hr_party_hold_set(p_slot integer, p_seat integer, p_idem uuid), leader only
--    (p_seat NULL = take turns). Refuses: not_signed_in, bad_slot, bad_idem,
--    rate_limited (hr_rpc_gate 'party'), no_party, not_leader, bad_seat (no member
--    in that seat), not_a_tank (the seat's role is not the tank role: the same
--    weapon -> role map the finder and the engine use, hr_hunt_weapon_roles over
--    hr_hunt_weapon_of, with the role pick of the set the seat plays, exactly
--    hunt-roles.js roleForWeapon). Allowed while the party hunts. Idempotent on
--    p_idem and journalled in player_intents, as every party setting
--    (hr_hunt_party_list). Moves no gold, item or XP.
-- The party view (hr_hunt_party_view, every member's `party` section) projects
--    `hold_seat`.
-- THE ENGINE receives it on the read every settle makes: hr_hunt_instance_read,
--    the `inst` column of hunt-settle.js HUNT_READ_SQL, at JSON path
--    `inst.instance.hold_seat` (a seat number matching `inst.members[].seat`, or
--    null). `world.leader` stays the PULL leader (role order), not this.
-- A seat that empties clears it (trigger hr_party_hold_clear on
--    hunt_party_members delete: leave, kick, sweep, disband), so a newcomer never
--    inherits it. A held seat whose hero later stops being a tank (re-equipped)
--    keeps the number: the engine must treat a hold_seat that is not a living
--    tank of the instance as "take turns".
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 the column. §2 hr_party_seat_role (internal) + hr_party_hold_set + the clear
-- trigger + the client baseline row. §3 two ANCHORED SPLICES (each anchor must
-- match once, or the file raises; nothing else in either body moves):
-- hr_hunt_party_view (the 2026-12-07-party-finder.sql image, md5 pinned) gains
-- `hold_seat`; hr_hunt_instance_read (the 2026-11-16 density-bounds image, md5
-- pinned) gains `instance.hold_seat`.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- The set takes the party row FOR UPDATE (the lock every party verb takes) and
-- reads the seat under it; a leave or kick deletes the member under the same row
-- lock, so a set racing a leave either sees the member (and the clear then
-- nulls it) or refuses bad_seat. The engine reads the value once per settle.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- One leader-only client RPC writing one smallint on the caller's own party,
-- validated against server state (seat membership, server-derived role). It can
-- change only who holds monsters in that party's own instance; no value moves.
-- Rate bucket `party` (12 a minute).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop trigger hr_party_hold_clear on public.hunt_party_members; drop
-- hr_party_hold_set, hr_party_hold_clear, hr_party_seat_role; delete the baseline
-- row; re-apply hr_hunt_party_view from 2026-12-07-party-finder.sql and
-- hr_hunt_instance_read from 2026-11-16-hunt-density-bounds.sql; drop the column.
-- ORDER: after 2026-12-07-party-finder.sql (it splices that file's party view). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if not exists (select 1 from public.hr_hunt_roles where role = 'tank')
     or not exists (select 1 from public.hr_hunt_weapon_roles where 'tank' = any (roles)) then
    raise exception 'PRECONDITION: the role catalogue has no tank role (hr_hunt_roles / hr_hunt_weapon_roles): not_a_tank would refuse every seat'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'aee090580254c64643ff7a531bf13169' and strpos(v_src, 'PARTY-HOLD') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither 2026-12-07-party-finder.sql''s image (aee09058...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'fb8043e5fb9f50b658b83c7c1e0d6a20' and strpos(v_src, 'PARTY-HOLD') = 0 then
    raise exception 'PIN: hr_hunt_instance_read is neither the 2026-11-16 density-bounds image (fb8043e5...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE SETTING ───────────────────────────────────────────────────────────
alter table public.hunt_parties add column if not exists hold_seat smallint;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_parties_hold_seat_range') then
    alter table public.hunt_parties add constraint hunt_parties_hold_seat_range check (hold_seat is null or hold_seat between 0 and 15);
  end if;
end $mig$;
comment on column public.hunt_parties.hold_seat is
  '2026-12-08-party-hold.sql: who holds the pack. NULL = take turns; a seat = that seat''s tank holds every lap. Written only '
  'by hr_party_hold_set (leader, a seated tank), cleared when that seat empties (hr_party_hold_clear). Read by the party view '
  'and the engine (hr_hunt_instance_read instance.hold_seat).';

-- ── §2 THE ROLE, THE INTENT, THE CLEAR ───────────────────────────────────────
create or replace function public.hr_party_seat_role(p_party uuid, p_user uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $$
  -- PARTY-HOLD (2026-12-08-party-hold.sql): the role the engine gives this seat (hunt-roles.js roleForWeapon over the
  -- one weapon -> role map): the worn weapon's roles, the `role` pick of the set the seat plays (its session's on this
  -- party's instance, else the setup in use) when the weapon allows it, else the weapon's first role.
  select case when x.pick = any (w.roles) then x.pick else w.roles[1] end
    from (select public.hr_hunt_weapon_of(p_user, p_slot) as weapon,
                 (select a.options->>'role' from public.player_action_sets a
                   where a.user_id = p_user and a.slot = p_slot
                     and a.preset = coalesce((select h.preset from public.hunt_sessions h
                                               where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
                                                 and h.instance_id = p_party),
                                             public.hr_hunt_active_set(p_user, p_slot))) as pick) x
    join public.hr_hunt_weapon_roles w on w.weapon_type = x.weapon
$$;
revoke execute on function public.hr_party_seat_role(uuid, uuid, int) from public;
revoke execute on function public.hr_party_seat_role(uuid, uuid, int) from anon, authenticated, service_role, hr_engine, hr_tick;

create or replace function public.hr_party_hold_set(p_slot integer, p_seat integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'party_hold_set';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_m record;
begin
  -- PARTY-HOLD (2026-12-08-party-hold.sql): the leader picks who holds the pack (a seated tank) or take turns (null).
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
  if v_p.closed_at is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  if p_seat is not null then
    select m.user_id, m.slot into v_m from public.hunt_party_members m where m.party_id = v_pid and m.seat = p_seat;
    if v_m.user_id is null then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_seat')); end if;
    if public.hr_party_seat_role(v_pid, v_m.user_id, v_m.slot) is distinct from 'tank' then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_a_tank', 'seat', p_seat)); end if;
  end if;
  update public.hunt_parties set hold_seat = p_seat where id = v_pid and hold_seat is distinct from p_seat;
  v_r := jsonb_build_object('ok', true, 'hold_seat', p_seat, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_party_hold_set(int, int, uuid) from public;
revoke execute on function public.hr_party_hold_set(int, int, uuid) from anon, service_role, hr_engine, hr_tick;
grant  execute on function public.hr_party_hold_set(int, int, uuid) to authenticated;

create or replace function public.hr_party_hold_clear()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- PARTY-HOLD (2026-12-08-party-hold.sql): an emptied seat holds nothing; the next hero in it never inherits the hold.
  update public.hunt_parties set hold_seat = null where id = old.party_id and hold_seat = old.seat;
  return null;
end $$;
revoke execute on function public.hr_party_hold_clear() from public;
revoke execute on function public.hr_party_hold_clear() from anon, authenticated, service_role, hr_engine, hr_tick;
drop trigger if exists hr_party_hold_clear on public.hunt_party_members;
create trigger hr_party_hold_clear after delete on public.hunt_party_members
  for each row execute function public.hr_party_hold_clear();

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_party_hold_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_party_hold_set', 'p_slot integer, p_seat integer, p_idem uuid', 'authenticated',
   'added 2026-12-08: the party leader picks who holds the pack, a seated tank or take turns (null); moves no value');

-- ── §3 TWO ANCHORED SPLICES ──────────────────────────────────────────────────
do $mig$
declare v_def text; v_n int; v_old text; v_new text;
begin
  -- the party view: every member reads who holds the pack
  v_def := replace(pg_get_functiondef('public.hr_hunt_party_view(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'PARTY-HOLD') = 0 then
    v_old := $a$'listed', coalesce(v_p.listed, false), 'leader_densities', coalesce(v_ldens, '{}'::jsonb));$a$;
    v_new := $a$'listed', coalesce(v_p.listed, false), 'leader_densities', coalesce(v_ldens, '{}'::jsonb),
    -- PARTY-HOLD (2026-12-08-party-hold.sql): who holds the pack, a seat (null = take turns; solo: null).
    'hold_seat', v_p.hold_seat);$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_party_view: PARTY-HOLD anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
  -- the engine's read: the instance carries it beside its frozen density
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'PARTY-HOLD') = 0 then
    v_old := $a$'density', v_i.density,$a$;
    v_new := $a$'density', v_i.density,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_instance_read: PARTY-HOLD anchor matched % times (need 1): the body moved', v_n; end if;
    -- CREATE OR REPLACE keeps both functions' grants; none moves here.
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-00005e780001';
  v_b  constant uuid := '000000c0-0000-4000-a000-00005e780002';
  v_u  uuid[] := array['000000c0-0000-4000-a000-00005e780001', '000000c0-0000-4000-a000-00005e780002']::uuid[];
  k    text := '000000c0-0000-4000-a000-0000';
  v_g  text; v jsonb; v_pid uuid; v_i int; v_bseat int; v_a1seat int;
begin
  begin
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Hold ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-hold §5 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now()) on conflict (user_id) do update set seen_at = now();
    end loop;
    -- B is a ranger (the bow; its shield off): not a tank.
    v := public.hr_apply(v_b, 0, (select version from public.player_state where user_id = v_b and slot = 0), (k || '5e780100')::uuid,
           jsonb_build_object('equip', jsonb_build_object('weapon', 'practice_bow', 'shield', null),
                              'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): B''s bow answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 1;
    -- A0 (leader, sword + shield = tank) + A1 (own, sword + shield = tank) + B (ranger).
    v := public.hr_hunt_party_invite_own(0, 1, (k || '5e780101')::uuid);
    v_pid := public.hr_hunt_party_of(v_a, 0);
    v := public.hr_hunt_party_invite(0, 'Probe Hold B', (k || '5e780102')::uuid);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || '5e780103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null then raise exception 'VERIFY(0): the party did not form: %', v; end if;
    v_bseat := (select seat from public.hunt_party_members where user_id = v_b);
    v_a1seat := (select seat from public.hunt_party_members where user_id = v_a and slot = 1);

    -- (a) TAKE TURNS by default, read by every member.
    if public.hr_hunt_party_view(v_b, 0)->'hold_seat' <> 'null'::jsonb or not (public.hr_hunt_party_view(v_b, 0) ? 'hold_seat') then
      raise exception 'VERIFY(a): the default party view reads hold_seat %', public.hr_hunt_party_view(v_b, 0)->'hold_seat'; end if;
    -- (b) THE REFUSALS: a member, an empty seat, a seat that is no tank, no party.
    v := public.hr_party_hold_set(0, 0, (k || '5e780110')::uuid);
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(b): a member''s set answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_party_hold_set(0, 3, (k || '5e780111')::uuid);
    if v->>'error' is distinct from 'bad_seat' then raise exception 'VERIFY(b): an empty seat answered %', v; end if;
    v := public.hr_party_hold_set(0, -1, (k || '5e780112')::uuid);
    if v->>'error' is distinct from 'bad_seat' then raise exception 'VERIFY(b): seat -1 answered %', v; end if;
    v := public.hr_party_hold_set(0, v_bseat, (k || '5e780113')::uuid);
    if v->>'error' is distinct from 'not_a_tank' then raise exception 'VERIFY(b): the ranger''s seat answered %', v; end if;
    if (select hold_seat from public.hunt_parties where id = v_pid) is not null then raise exception 'VERIFY(b): a refusal wrote the hold'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_leave(0, (k || '5e780114')::uuid);
    v := public.hr_party_hold_set(0, 0, (k || '5e780115')::uuid);
    if v->>'error' is distinct from 'no_party' then raise exception 'VERIFY(b): a hero in no party answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Hold B', (k || '5e780116')::uuid);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || '5e780117')::uuid);
    v_bseat := (select seat from public.hunt_party_members where user_id = v_b);

    -- (c) ONE TANK HOLDS: the leader's own seat; every member reads it; the same key replays, a new one holds.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v := public.hr_party_hold_set(0, 0, (k || '5e780120')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'hold_seat')::int <> 0 or (select hold_seat from public.hunt_parties where id = v_pid) <> 0
       or (public.hr_hunt_party_view(v_b, 0)->>'hold_seat')::int <> 0 or (public.hr_state_of(v_b, 0)->'party'->>'hold_seat')::int <> 0 then
      raise exception 'VERIFY(c): holding seat 0 answered %', v; end if;
    v := public.hr_party_hold_set(0, v_a1seat, (k || '5e780120')::uuid);
    if (select hold_seat from public.hunt_parties where id = v_pid) <> 0 or (v->>'hold_seat')::int <> 0 then
      raise exception 'VERIFY(c): a replayed key moved the hold to %', (select hold_seat from public.hunt_parties where id = v_pid); end if;

    -- (d) WHILE HUNTING: allowed, and the engine's read carries it as instance.hold_seat.
    v := public.hr_hunt_party_start(0, v_g, (k || '5e780130')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the start answered %', v; end if;
    if (public.hr_hunt_instance_read(v_b, 0)->'instance'->>'hold_seat')::int is distinct from 0 then
      raise exception 'VERIFY(d): the engine reads %', public.hr_hunt_instance_read(v_b, 0)->'instance'; end if;
    v := public.hr_party_hold_set(0, v_a1seat, (k || '5e780131')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (public.hr_hunt_instance_read(v_a, 0)->'instance'->>'hold_seat')::int is distinct from v_a1seat then
      raise exception 'VERIFY(d): a hold mid-hunt answered % / engine %', v, public.hr_hunt_instance_read(v_a, 0)->'instance'->'hold_seat'; end if;
    -- (e) TAKE TURNS again: null round trip, to the engine too.
    v := public.hr_party_hold_set(0, null, (k || '5e780132')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'hold_seat' <> 'null'::jsonb or (select hold_seat from public.hunt_parties where id = v_pid) is not null
       or public.hr_hunt_instance_read(v_a, 0)->'instance'->'hold_seat' <> 'null'::jsonb
       or public.hr_hunt_party_view(v_b, 0)->'hold_seat' <> 'null'::jsonb then
      raise exception 'VERIFY(e): take turns answered %', v; end if;
    -- (f) THE HELD SEAT EMPTIES: A1 holds, leaves (in town): the hold is cleared, never inherited.
    v := public.hr_party_hold_set(0, v_a1seat, (k || '5e780133')::uuid);
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;
    v := public.hr_hunt_party_leave(1, (k || '5e780134')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select hold_seat from public.hunt_parties where id = v_pid) is not null then
      raise exception 'VERIFY(f): the held seat left (%) but the hold reads %', v, (select hold_seat from public.hunt_parties where id = v_pid); end if;
    -- (g) the grants.
    if not has_function_privilege('authenticated', 'public.hr_party_hold_set(integer,integer,uuid)', 'execute')
       or has_function_privilege('anon', 'public.hr_party_hold_set(integer,integer,uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_party_seat_role(uuid,uuid,integer)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_party_hold_clear()', 'execute')
       or has_function_privilege('authenticated', 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
       or not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
      raise exception 'VERIFY(g): a grant is wrong'; end if;
    raise exception using errcode = 'HR899', message = 'party-hold §5 complete - rolling back';
  exception when sqlstate 'HR899' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) then raise exception 'VERIFY(h): §5 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-hold: leader-only, a seated tank or take turns, idempotent, allowed mid-hunt, on the party view and instance.hold_seat, cleared when the seat empties; all green';
end $$;
