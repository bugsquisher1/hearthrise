-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — INVITE THE PLAYER YOU RIGHT-CLICKED (lane a-party-invite-menu,
-- systems-engineer, 2026-10-20; live v0.2.11 bug: right-clicking Andy showed no
-- "Invite to party"). STAGED. Game CLOSED: applies on its passing §3.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The only invite verb took the NAME players see and resolved it with
-- hr_character_by_name. A player with no claimed name shows the fallback
-- "Adventurer", which resolves to nobody, so the client hid the entry. The menu
-- target already carries the server's account id (and, from town and the hunt
-- scene, the character slot), so the invite now takes that.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_party_invite_core(uid, slot, target user, target slot, verb, idem) (owner-only): everything an invite does
--   once its target is known, moved VERBATIM out of hr_hunt_party_invite
--   (2026-10-29-party-security.sql): own character -> seated at once; else a
--   block either way with the inviter or any member refuses `unavailable`; the
--   first invite makes the party; full / already a member / too many invites.
-- hr_hunt_party_invite(p_slot, p_name, p_idem): restated as name -> core.
-- hr_hunt_party_invite_player(p_slot, p_target, p_target_slot, p_idem) (new):
--   account id -> core. A null slot means the character that account last had
--   on screen (social_presence.slot, the server's), else slot 0; an unknown
--   account or character is `no_player`. Moves no value; an invite admits
--   nobody by itself (the accept does, through the join's own checks).
-- REVERSIBILITY: drop the verb, its baseline row and the core; re-apply
-- hr_hunt_party_invite from 2026-10-29-party-security.sql. ORDER: after it.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_invite(integer,text,uuid)'::regprocedure;
  if strpos(v_src, 'PARTY-SECURITY') = 0 and strpos(v_src, 'PARTY-INVITE-PLAYER') = 0 then
    raise exception 'PIN: hr_hunt_party_invite is neither the party-security image nor this file''s'; end if;
end $mig$;

-- ── §1 THE CORE AND THE TWO DOORS ────────────────────────────────────────────
create or replace function public.hr_party_invite_core(p_uid uuid, p_slot int, p_t_user uuid, p_t_slot int, p_verb text, p_idem uuid)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  c_max_open constant int := 8;
  v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
begin
  if not exists (select 1 from public.player_state where user_id = p_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- YOUR OWN CHARACTER (same account): no accept step, it takes a seat now.
  if p_t_user = p_uid then
    v_r := public.hr_party_seat_own(p_uid, p_slot, p_t_slot);
    if coalesce(v_r->>'ok', 'false') <> 'true' then return v_r; end if;
  else
    v_pid := public.hr_hunt_party_of(p_uid, p_slot);
    -- A BLOCK EITHER WAY, with the inviter or with any member, refuses (before any party is made).
    if public.hr_social_blocked(p_uid, p_t_user)
       or (v_pid is not null and exists (select 1 from public.hunt_party_members m where m.party_id = v_pid
                                           and m.user_id <> p_t_user and public.hr_social_blocked(p_t_user, m.user_id))) then
      return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
    if v_pid is null then
      -- THE FIRST INVITE MAKES THE PARTY: the inviter leads; the ground is picked at Start.
      if (public.hr_hunt_lock(p_uid, p_slot)).id is not null then
        return jsonb_build_object('ok', false, 'error', 'hunt_open'); end if;
      v_pid := public.hr_party_open(p_uid, p_slot);
    end if;
    select * into v_p from public.hunt_parties where id = v_pid for update;
    if (select count(*) from public.hunt_party_members m where m.party_id = v_pid) >= v_p.max_size then
      return jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size); end if;
    if exists (select 1 from public.hunt_party_members m where m.party_id = v_pid and m.user_id = p_t_user and m.slot = p_t_slot) then
      return jsonb_build_object('ok', false, 'error', 'already_member'); end if;
    -- Expired invites are pruned where they are next touched: this party's, and the invitee's.
    delete from public.hunt_party_invites i where i.created_at <= now() - public.hr_party_invite_ttl()
       and (i.party_id = v_pid or (i.to_user = p_t_user and i.to_slot = p_t_slot));
    if (select count(*) from public.hunt_party_invites i where i.party_id = v_pid
          and not (i.to_user = p_t_user and i.to_slot = p_t_slot)) >= c_max_open then
      return jsonb_build_object('ok', false, 'error', 'too_many_invites', 'max', c_max_open); end if;
    insert into public.hunt_party_invites as i (party_id, from_user, from_slot, to_user, to_slot, created_at)
      values (v_pid, p_uid, p_slot, p_t_user, p_t_slot, now())
      on conflict (party_id, to_user, to_slot) do update set from_user = excluded.from_user, from_slot = excluded.from_slot, created_at = now();
    v_r := jsonb_build_object('ok', true, 'invited', public.hr_character_name(p_t_user, p_t_slot));
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (p_uid, p_idem, p_slot, p_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_party_invite_core(uuid, int, uuid, int, text, uuid) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_party_invite(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-INVITE-PLAYER (2026-10-30-party-invite-player.sql): the name resolves, the core invites.
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_t record;
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
  select * into v_t from public.hr_character_by_name(p_name);
  if v_t.user_id is null then return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'no_such_name')); end if;
  v_r := public.hr_party_invite_core(v_uid, p_slot, v_t.user_id, v_t.slot, v_verb, p_idem);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection('hunt_party_invite', p_slot, v_r); end if;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_invite_player(p_slot int, p_target uuid, p_target_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_party_invite_player';
  v_uid uuid := auth.uid(); v_r jsonb; v_ts int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_target is null or (p_target_slot is not null and (p_target_slot < 0 or p_target_slot > 5)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_player')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The character: the one named, else the one that account last had on screen (the server's), else slot 0.
  v_ts := coalesce(p_target_slot, (select sp.slot from public.social_presence sp where sp.user_id = p_target), 0);
  if not exists (select 1 from public.player_state where user_id = p_target and slot = v_ts) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_player')); end if;
  if p_target = v_uid and v_ts = p_slot then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'self')); end if;
  v_r := public.hr_party_invite_core(v_uid, p_slot, p_target, v_ts, c_verb, p_idem);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  return v_r;
end $$;

revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_invite(int, text, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_invite_player(int, uuid, int, uuid) from public;
revoke execute on function public.hr_hunt_party_invite_player(int, uuid, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_invite_player(int, uuid, int, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_party_invite_player';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_party_invite_player', 'p_slot integer, p_target uuid, p_target_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-30: invite the player a menu targets by account id (+ slot, else the server picks); same checks as the named invite; moves no value');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00005e330001', '000000c0-0000-0000-0000-00005e330002',
                               '000000c0-0000-0000-0000-00005e330003']::uuid[];
  v jsonb; v_i int; v_pid uuid;
  k text := '000000c0-0000-4000-a000-0000';
begin
  begin
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      -- no display name: the player shows as "Adventurer" and no name can find it
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-invite-player §3 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_invite_player(0, v_u[2], null, (k || '5e330101')::uuid);
    v_pid := public.hr_hunt_party_of(v_u[1], 0);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null
       or not exists (select 1 from public.hunt_party_invites where party_id = v_pid and to_user = v_u[2] and to_slot = 0) then
      raise exception 'VERIFY(a): an invite to an unnamed player by id answered %', v; end if;
    v := public.hr_hunt_party_invite_player(0, v_u[1], 0, (k || '5e330102')::uuid);
    if v->>'error' is distinct from 'self' then raise exception 'VERIFY(b): inviting oneself answered %', v; end if;
    v := public.hr_hunt_party_invite_player(0, '000000c0-0000-0000-0000-00005e33ffff', null, (k || '5e330103')::uuid);
    if v->>'error' is distinct from 'no_player' then raise exception 'VERIFY(b): an unknown account answered %', v; end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_u[3], v_u[1]);
    v := public.hr_hunt_party_invite_player(0, v_u[3], 0, (k || '5e330104')::uuid);
    if v->>'error' is distinct from 'unavailable' then raise exception 'VERIFY(c): an invite across a block answered %', v; end if;
    raise exception using errcode = 'HR884', message = 'party-invite-player §3 complete - rolling back';
  exception when sqlstate 'HR884' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) then raise exception 'VERIFY(d): §3 LEAKED a probe row'; end if;
  if has_function_privilege('authenticated', 'public.hr_party_invite_core(uuid,integer,uuid,integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(d): authenticated reaches hr_party_invite_core'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-invite-player: an unnamed player is invited by account id; self, unknown and blocked refuse; all green';
end $$;
