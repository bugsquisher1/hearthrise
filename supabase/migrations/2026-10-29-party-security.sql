-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PARTY VERBS, REOPEN MUST-FIXES (lane b-party-system,
-- systems-engineer, 2026-10-19; Security's read-only review of the party RPCs,
-- items 1-4). STAGED. Game CLOSED: applies on its passing §5; part of the
-- reopen gate's Security review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- (1) NO JOIN WITHOUT AN INVITE OR A LISTING. hr_hunt_party_join (the finder's
--     Join) now takes a seat only in a party its leader LISTED (hunt_parties.
--     listed, 2026-10-28-party-flow.sql; `not_listed` otherwise). The new
--     hr_hunt_party_list(p_slot, p_listed, p_idem) is the leader's switch. An
--     accept seats through the same internal body (hr_party_join_for) without
--     the listing: the invite is the permission.
--     BLOCKS: a join (listed or by invite) is refused `unavailable` when
--     hr_social_blocked holds between the joiner and ANY member; the finder
--     hides such parties from that player.
-- (2) A KICKED HUNTER STOPS SHARING. hr_hunt_party_kick no longer refuses a
--     member hunting the party's instance: like that member's own Leave
--     (hr_hunt_leave), its session ends at once when freshly settled (or
--     walking, or stalled) and otherwise gets leave_at = now(), so the next
--     settle ends it `left` and it is out of the instance's member set
--     (hr_hunt_apply_instance (3)) for every window after; its seat goes now.
-- (3) INVITES RESPECT BLOCKS. hr_hunt_party_invite refuses `unavailable` when a
--     block holds between the target and the inviter or any member.
-- (4) THE DORMANT M8 VERBS ARE GONE: hr_party_create / invite / accept / kick /
--     leave / hunt_stop, their grants and their hr_client_rpc_baseline rows.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Fewer doors: a stranger can no longer seat itself in a party (and so share
-- its loot split) by knowing the party id; a kick now removes a hunter from the
-- split instead of leaving the leader powerless. No verb here moves value.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_party_join / _kick from 2026-10-23-hunt-party.sql, _accept
-- from 2026-10-25-party-invites.sql, _invite from 2026-10-28-party-flow.sql,
-- _finder from 2026-10-25-settle-hooks.sql; drop hr_hunt_party_list and
-- hr_party_join_for. The M8 verbs are not restored (the wipe deletes M8 data).
-- ORDER: after 2026-10-28-party-flow.sql (and after 2026-10-28-reopen-rpc-sweep.sql
-- if that lands: no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regprocedure('public.hr_party_seat_own(uuid,integer,integer)') is null or not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'hunt_parties' and column_name = 'listed') then
    raise exception 'PRECONDITION: apply 2026-10-28-party-flow.sql first'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_join(integer,uuid,uuid)'::regprocedure;
  if md5(v_src) <> '6428fb9a34e67dc9a330d50ff5688c8a' and strpos(v_src, 'PARTY-SECURITY') = 0 then
    raise exception 'PIN: hr_hunt_party_join moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_accept(integer,uuid,uuid)'::regprocedure;
  if md5(v_src) <> '4877b2ba1c2e2738a3f668622a8d9c0a' and strpos(v_src, 'PARTY-SECURITY') = 0 then
    raise exception 'PIN: hr_hunt_party_accept moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_kick(integer,integer,uuid)'::regprocedure;
  if md5(v_src) <> '6444c50c9347c9884736184f71ec27d2' and strpos(v_src, 'PARTY-SECURITY') = 0 then
    raise exception 'PIN: hr_hunt_party_kick moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_finder(integer,text,text)'::regprocedure;
  if md5(v_src) <> 'd8a3fad5bc7126d2425bf37728dc863c' and strpos(v_src, 'PARTY-SECURITY') = 0 then
    raise exception 'PIN: hr_hunt_party_finder moved (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_invite(integer,text,uuid)'::regprocedure;
  if strpos(v_src, 'PARTY-FLOW') = 0 and strpos(v_src, 'PARTY-SECURITY') = 0 then
    raise exception 'PIN: hr_hunt_party_invite is neither the party-flow image nor this file''s'; end if;
end $mig$;

-- ── §1 THE ONE SEATING BODY (owner-only) ─────────────────────────────────────
-- Seat p_uid's character in p_party: the party open, the character out of every hunt and party, a free
-- seat, no block between it and any member; with p_need_listed, only a party its leader listed.
-- Lock order: the party row, then the character.
create or replace function public.hr_party_join_for(p_uid uuid, p_slot int, p_party uuid, p_need_listed boolean)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare v_s public.hunt_sessions%rowtype; v_p public.hunt_parties%rowtype;
begin
  if p_party is null then return jsonb_build_object('ok', false, 'error', 'no_party'); end if;
  select * into v_p from public.hunt_parties where id = p_party for update;
  if not found or v_p.closed_at is not null then return jsonb_build_object('ok', false, 'error', 'no_party'); end if;
  if p_need_listed and not v_p.listed then return jsonb_build_object('ok', false, 'error', 'not_listed'); end if;
  v_s := public.hr_hunt_lock(p_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = p_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_s.id is not null then return jsonb_build_object('ok', false, 'error', 'hunt_open'); end if;
  if public.hr_hunt_party_of(p_uid, p_slot) is not null then return jsonb_build_object('ok', false, 'error', 'already_in_party'); end if;
  if exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_uid
               and public.hr_social_blocked(p_uid, m.user_id)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if (select count(*) from public.hunt_party_members m where m.party_id = p_party) >= v_p.max_size then
    return jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size); end if;
  perform public.hr_party_seat_into(p_party, p_uid, p_slot);
  return jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(p_uid, p_slot));
end $$;
revoke execute on function public.hr_party_join_for(uuid, int, uuid, boolean) from public, anon, authenticated, service_role;

-- ── §2 THE VERBS ─────────────────────────────────────────────────────────────
-- The finder's Join: a LISTED party only.
create or replace function public.hr_hunt_party_join(p_slot int, p_party uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): listed parties only; no block with any member.
  c_verb constant text := 'hunt_party_join';
  v_uid uuid := auth.uid(); v_r jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_party_join_for(v_uid, p_slot, p_party, true);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- Accept: the invite is the permission (no listing needed); the same seating body, blocks included.
create or replace function public.hr_hunt_party_accept(p_slot int, p_invite uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): seats through hr_party_join_for.
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_i public.hunt_party_invites%rowtype; v_j jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_invite is null then return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  v_verb := 'hunt_party_accept:' || p_invite;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_party_accept', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_i from public.hunt_party_invites i where i.id = p_invite and i.to_user = v_uid and i.to_slot = p_slot;
  if not found then return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  if v_i.created_at <= now() - public.hr_party_invite_ttl()
     or not exists (select 1 from public.hunt_parties p where p.id = v_i.party_id and p.closed_at is null) then
    delete from public.hunt_party_invites where id = v_i.id;
    return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'invite_expired')); end if;
  v_j := public.hr_party_join_for(v_uid, p_slot, v_i.party_id, false);
  if coalesce(v_j->>'ok', 'false') <> 'true' then return public.hr_note_rejection('hunt_party_accept', p_slot, v_j); end if;
  delete from public.hunt_party_invites where to_user = v_uid and to_slot = p_slot and party_id = v_i.party_id;
  v_r := jsonb_build_object('ok', true, 'party', v_j->'party');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The leader shows its party in the finder, or hides it again.
create or replace function public.hr_hunt_party_list(p_slot int, p_listed boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
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
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  update public.hunt_parties set listed = p_listed where id = v_pid;
  v_r := jsonb_build_object('ok', true, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- The leader removes the member in a SEAT; a hunting member leaves its hunt as its own Leave would.
create or replace function public.hr_hunt_party_kick(p_slot int, p_seat int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): a kicked hunter leaves at once or at the next settle.
  c_verb constant text := 'hunt_party_kick';
  c_slack_ms constant bigint := 20000;      -- hr_hunt_leave's own two bounds
  c_stall_ms constant bigint := 900000;
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype; v_t record;
  v_s public.hunt_sessions%rowtype; v_gap bigint; v_leaving boolean := false;
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
  -- A HUNTER OF THIS PARTY leaves its hunt: at once when settled close to now (or walking / stalled), else
  -- at the next settle (leave_at), exactly as its own Leave; it is out of the member set from then on.
  v_s := public.hr_hunt_lock(v_t.user_id, v_t.slot);
  if v_s.id is not null and v_s.instance_id = v_pid then
    v_leaving := true;
    v_gap := public.hr_hunt_gap_ms(v_s);
    if v_gap <= c_slack_ms or v_gap > c_stall_ms then
      perform public.hr_hunt_close(v_s.id, 'left', now(), true);
    elsif v_s.leave_at is null and v_s.change_at is null then
      update public.hunt_sessions set leave_at = now(), version = version + 1 where id = v_s.id;
    end if;
  end if;
  delete from public.hunt_party_members where party_id = v_pid and user_id = v_t.user_id and slot = v_t.slot;
  v_r := jsonb_build_object('ok', true, 'leaving', v_leaving, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- Restated from 2026-10-28-party-flow.sql: + a block between the target and ANY member refuses the invite.
create or replace function public.hr_hunt_party_invite(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql), over PARTY-FLOW: blocks with any member refuse.
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
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    -- A BLOCK EITHER WAY, with the inviter or with any member, refuses (before any party is made).
    if public.hr_social_blocked(v_uid, v_t.user_id)
       or (v_pid is not null and exists (select 1 from public.hunt_party_members m where m.party_id = v_pid
                                           and m.user_id <> v_t.user_id and public.hr_social_blocked(v_t.user_id, m.user_id))) then
      return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'unavailable')); end if;
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

-- THE FINDER: listed parties only, never one a member of which and the caller block each other.
CREATE OR REPLACE FUNCTION public.hr_hunt_party_finder(p_slot integer, p_hunt text DEFAULT NULL::text, p_weapon text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-SECURITY (2026-10-29-party-security.sql): listed only, blocks hidden.
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('party_hunt_view') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_weapon is not null and not exists (select 1 from public.hr_hunt_weapon_roles w where w.weapon_type = p_weapon) then
    return jsonb_build_object('ok', false, 'error', 'bad_weapon'); end if;
  return jsonb_build_object('ok', true, 'parties', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'hunt', p.hunt_id, 'max', p.max_size,
             'seats', (select jsonb_agg(jsonb_build_object('seat', m.seat, 'weapon', m.weapon_type,
                         'name', public.hr_character_name(m.user_id, m.slot))
                         order by m.seat) from public.hunt_party_members m where m.party_id = p.id))
             order by p.created_at, p.id)
      from public.hunt_parties p
     where p.closed_at is null and p.listed and (p_hunt is null or p.hunt_id = p_hunt)
       and (select count(*) from public.hunt_party_members m where m.party_id = p.id) < p.max_size
       and (p_weapon is null or not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and m.weapon_type = p_weapon))
       and not exists (select 1 from public.hunt_party_members m where m.party_id = p.id and m.user_id <> v_uid
                         and public.hr_social_blocked(v_uid, m.user_id))
     limit 50), '[]'::jsonb));
end $function$;

-- ── §3 THE DORMANT M8 VERBS GO ───────────────────────────────────────────────
drop function if exists public.hr_party_create(integer, uuid);
drop function if exists public.hr_party_invite(integer, text, uuid);
drop function if exists public.hr_party_accept(integer, uuid, uuid);
drop function if exists public.hr_party_kick(integer, text, uuid);
drop function if exists public.hr_party_leave(integer, uuid);
drop function if exists public.hr_party_hunt_stop(integer, uuid);
delete from public.hr_client_rpc_baseline
 where proname in ('hr_party_create', 'hr_party_invite', 'hr_party_accept', 'hr_party_kick', 'hr_party_leave', 'hr_party_hunt_stop');

-- ── §4 GRANTS AND THE BASELINE ───────────────────────────────────────────────
revoke execute on function public.hr_hunt_party_join(int, uuid, uuid) from public;
revoke execute on function public.hr_hunt_party_join(int, uuid, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_join(int, uuid, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_accept(int, uuid, uuid) from public;
revoke execute on function public.hr_hunt_party_accept(int, uuid, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_accept(int, uuid, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_list(int, boolean, uuid) from public;
revoke execute on function public.hr_hunt_party_list(int, boolean, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_list(int, boolean, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_kick(int, int, uuid) from public;
revoke execute on function public.hr_hunt_party_kick(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_kick(int, int, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_invite(int, text, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from public;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from anon, service_role;
grant  execute on function public.hr_hunt_party_finder(int, text, text) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_hunt_party_join', 'hr_hunt_party_list', 'hr_hunt_party_kick');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_party_join', 'p_slot integer, p_party uuid, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1); 2026-10-29-party-security.sql: the finder''s Join - a LISTED party only, refused across a block with any member'),
  ('hr_hunt_party_list', 'p_slot integer, p_listed boolean, p_idem uuid', 'authenticated',
   'added 2026-10-29 (party security): the leader shows or hides its party in the finder; moves no value'),
  ('hr_hunt_party_kick', 'p_slot integer, p_seat integer, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1); 2026-10-29-party-security.sql: the leader removes a seat; a hunting member leaves its hunt as its own Leave would (leave_at / at once)');

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00005e320001', '000000c0-0000-0000-0000-00005e320002',
                               '000000c0-0000-0000-0000-00005e320003']::uuid[];
  v_hunt text := (select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
                   order by coalesce(h.band_min, 0), g.hunt_id limit 1);
  v jsonb; v_i int; v_pid uuid; v_sid uuid; v_role text; v_n text;
  k text := '000000c0-0000-4000-a000-0000';
begin
  begin
    if v_hunt is null then
      v_hunt := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
      insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats)
        values (v_hunt, 'probe_ground', 1, 1, 60000, 5);
    end if;
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Guard ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-security §5 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now())
        on conflict (user_id) do update set seen_at = now();
    end loop;
    -- A makes a party (C accepts); B cannot join it unlisted, can once listed, and leaves.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Guard C', (k || '5e320101')::uuid);
    v_pid := public.hr_hunt_party_of(v_u[1], 0);
    perform set_config('request.jwt.claim.sub', v_u[3]::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_u[3], 0)->'party_invites'->0->>'id')::uuid, (k || '5e320102')::uuid);
    if public.hr_hunt_party_of(v_u[3], 0) is distinct from v_pid then raise exception 'VERIFY(a): C could not accept: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_join(0, v_pid, (k || '5e320103')::uuid);
    if v->>'error' is distinct from 'not_listed' or public.hr_hunt_party_of(v_u[2], 0) is not null then
      raise exception 'VERIFY(a): a join with no invite and no listing answered %', v; end if;
    if jsonb_array_length(public.hr_hunt_party_finder(0, null, null)->'parties') <> 0 then raise exception 'VERIFY(a): the finder shows an unlisted party'; end if;
    perform set_config('request.jwt.claim.sub', v_u[3]::text, true);
    v := public.hr_hunt_party_list(0, true, (k || '5e320104')::uuid);
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(a): a member listed the party: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_list(0, true, (k || '5e320105')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'party'->>'listed')::boolean is distinct from true then raise exception 'VERIFY(a): the listing answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    if jsonb_array_length(public.hr_hunt_party_finder(0, null, null)->'parties') <> 1 then raise exception 'VERIFY(a): the finder hides a listed party'; end if;
    v := public.hr_hunt_party_join(0, v_pid, (k || '5e320106')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): a listed join answered %', v; end if;
    v := public.hr_hunt_party_leave(0, (k || '5e320107')::uuid);
    -- An invite to B made before C blocks B: after the block, the invite, the accept and the join all refuse.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Guard B', (k || '5e320108')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the invite before the block answered %', v; end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_u[3], v_u[2]);
    v := public.hr_hunt_party_invite(0, 'Probe Guard B', (k || '5e320109')::uuid);
    if v->>'error' is distinct from 'unavailable' then raise exception 'VERIFY(b): an invite across a member''s block answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_u[2], 0)->'party_invites'->0->>'id')::uuid, (k || '5e320110')::uuid);
    if v->>'error' is distinct from 'unavailable' or public.hr_hunt_party_of(v_u[2], 0) is not null then
      raise exception 'VERIFY(b): an accept across a member''s block answered %', v; end if;
    v := public.hr_hunt_party_join(0, v_pid, (k || '5e320111')::uuid);
    if v->>'error' is distinct from 'unavailable' then raise exception 'VERIFY(b): a join across a member''s block answered %', v; end if;
    if jsonb_array_length(public.hr_hunt_party_finder(0, null, null)->'parties') <> 0 then raise exception 'VERIFY(b): the finder shows a party across a block'; end if;
    -- A KICKED HUNTER LEAVES: A and C hunt; C's session is minutes behind; the kick sets its leave_at.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5e320112')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the start answered %', v; end if;
    select id into v_sid from public.hunt_sessions where user_id = v_u[3] and ended_at is null;
    update public.hunt_sessions set entered_at = now() - interval '7 minutes', hunt_from = now() - interval '6 minutes', settled_to = now() - interval '5 minutes',
                                    next_swing_at = now() - interval '5 minutes' where id = v_sid;
    v := public.hr_hunt_party_kick(0, (select seat from public.hunt_party_members where user_id = v_u[3]), (k || '5e320113')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'leaving')::boolean is distinct from true
       or (select leave_at from public.hunt_sessions where id = v_sid) is null or public.hr_hunt_party_of(v_u[3], 0) is not null then
      raise exception 'VERIFY(c): the kick of a hunter answered % (leave_at %)', v, (select leave_at from public.hunt_sessions where id = v_sid); end if;
    -- (d) the dormant M8 verbs are gone, with their baseline rows.
    foreach v_n in array array['hr_party_create', 'hr_party_invite', 'hr_party_accept', 'hr_party_kick', 'hr_party_leave', 'hr_party_hunt_stop'] loop
      if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = v_n)
         or exists (select 1 from public.hr_client_rpc_baseline where proname = v_n) then
        raise exception 'VERIFY(d): % is still installed or baselined', v_n; end if;
    end loop;
    raise exception using errcode = 'HR883', message = 'party-security §5 complete - rolling back';
  exception when sqlstate 'HR883' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.chat_blocks where blocker_id = any (v_u))
     or exists (select 1 from public.hr_hunt_grounds where ground_id = 'probe_ground') then
    raise exception 'VERIFY(e): §5 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_party_join_for(uuid,integer,uuid,boolean)', 'execute') then
      raise exception 'VERIFY(e): % reaches hr_party_join_for', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-security: no join without an invite or a listing, blocks refuse invite / accept / join, a kicked hunter leaves, the M8 verbs are gone; all green';
end $$;
