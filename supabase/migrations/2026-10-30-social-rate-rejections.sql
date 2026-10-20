-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SOCIAL SURFACE RECORDS ITS RATE-LIMIT REFUSALS (C2 / S6)
-- (lane/c-sql-tests-green, backend-architect, 2026-10-20). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §3; Security reviews it with the reopen
-- gate. Moves no value, no grant, no table, no row a player owns.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- House rule C2 (review 2026-08-11) + S6: a rate-limit refusal must leave a
-- durable, SAMPLED trace (hr_record_rejection gated on hr_rate_sample_weight),
-- because sustained rate limiting is the loudest automation signal the server
-- produces and an early `return` before any write leaves nothing at all.
-- The social lane's twelve player RPCs (2026-10-25-chat-channels.sql,
-- -social.sql, -town-walk.sql; four of them restated by 2026-10-27-core-bodies)
-- returned 'rate_limited' bare. tests/run-sql-tests.mjs could not see it: none
-- of those files was in its lint set, and core-bodies joined it only now (its
-- hr_apply / hr_state_of derivation links were unreadable without it).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §0 every body below is pinned: with this file's insertions removed, its
--    prosrc must md5 to the chain-end image it was generated from (read back
--    with pg_get_functiondef after a full replay). Anything else moved meanwhile
--    and is refused, never clobbered; a re-apply reads its own image as the pin.
-- §1 the twelve bodies RESTATED from that read-back, INSERTIONS ONLY: inside
--    each `if not public.hr_rate_ok(...) then`, before the unchanged return,
--      if hr_rate_sample_weight(hr_rate_over(uid, bucket) - limit) > 0 then
--        perform hr_record_rejection(uid, slot, '<fn>', 'rate_limited', {bucket,
--          limit, per}, <weight>); end if;
--    slot is p_slot only where the body validated the caller's own slot before
--    the gate (chat_send, chat_recent, whisper_send, social_state); else null
--    (hr_record_rejection files it under 0). hr_inspect's p_slot is the
--    TARGET's slot, so it is not used. One row per (user, slot, UTC day, code),
--    sampled at 1/10/50/1000 refusals: an attacker cannot grow the table.
--    ACL restated exactly as the authoring files left it (authenticated only).
-- §3 SELF-CHECK, executed: insertion-only proof per body, the gate count equals
--    the record count, ACL, hr_assert_grant_hygiene(true), and two real probes
--    (the 21st hr_whispers_recent and the 31st hr_inspect in a minute) each
--    answer rate_limited AND leave exactly one sampled hr_rejections row.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Unchanged: same signatures, same grants, same answers to the caller. The
-- only new write is the existing exception-safe, key-capped rejection journal.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the predecessors' bodies (2026-10-27-core-bodies.sql for chat_send,
-- whisper_send, inspect, town_walkers; the three 2026-10-25 files for the rest).
-- ORDER: LAST in the chain (after 2026-10-29-party-security.sql). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_src text; v_base text;
begin
  if to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or to_regproc('public.hr_rate_over') is null or to_regproc('public.hr_rate_sample_weight') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: the rejection journal (2026-09-13-rejections-verb-map-2.sql) and the grant detector are missing'; end if;
  for r in select * from (values
    ('public.hr_chat_send(integer,text,text)', 'b93f11e5a5b3df6d46be40fce7ed9129', 2),
    ('public.hr_chat_recent(integer)', 'fd065847e7dc58c8ab38eab239a7a6f2', 1),
    ('public.hr_whisper_send(integer,text,text)', '23e3a8e3670f3f9d0f3c616cba78dafa', 2),
    ('public.hr_whispers_recent()', '589e2033ce4569dfd1d9c399f741093d', 1),
    ('public.hr_block_set(text,boolean)', '39a1420f232a44f69a05e98c356fe401', 1),
    ('public.hr_friend_request(text)', '9456c98ce6941693272954a91933a93d', 1),
    ('public.hr_friend_answer(text,boolean)', '81ca88883c6e0f051fd8c96318b9bec4', 1),
    ('public.hr_friend_remove(text)', 'cdb9c889da951f87d4940ba394d54c87', 1),
    ('public.hr_social_state(integer)', '4d92a4468c1113b2b31567c393814bb4', 1),
    ('public.hr_inspect(text,integer)', '59d9315c59970c2a7ef3c51fd02ac2bc', 1),
    ('public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'b049c0091c716cf1d58ec43e57bec8be', 1),
    ('public.hr_town_walkers(text)', '6ee33b7ba793e913c02044e7f1e69d67', 1)) t(sig, pin, gates) loop
    if to_regprocedure(r.sig) is null then raise exception 'PRECONDITION: % is missing', r.sig; end if;
    select prosrc into v_src from pg_proc where oid = to_regprocedure(r.sig);
    v_base := regexp_replace(v_src, '\n +if public\.hr_rate_sample_weight\(public\.hr_rate_over\(v_uid, ''[^'']+''\) - [a-z0-9_]+\) > 0 then\n +perform public\.hr_record_rejection\([^;]*\);\n +end if;', '', 'g');
    if md5(v_base) <> r.pin then
      raise exception 'PIN: % is neither the chain-end image (%) nor this file''s (insertions removed: md5 %)', r.sig, left(r.pin, 8), md5(v_base); end if;
  end loop;
end $mig$;

-- ── §1 THE TWELVE BODIES (chain-end read-back + the sampled record) ──────────

-- ── hr_chat_send: 2 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_chat_send(p_slot integer, p_kind text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid(); v_body text; v_fault text; v_channel text; v_pid uuid; v_aud uuid[];
  v_row public.chat_messages%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_kind is null or p_kind not in ('global', 'local', 'party') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'chat:burst') - 5) > 0 then
      perform public.hr_record_rejection(v_uid, p_slot, 'hr_chat_send', 'rate_limited',
        jsonb_build_object('bucket', 'chat:burst', 'limit', 5, 'per', '10 seconds'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'chat:burst') - 5));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'chat:send') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, p_slot, 'hr_chat_send', 'rate_limited',
        jsonb_build_object('bucket', 'chat:send', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'chat:send') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_kind = 'global' then
    v_channel := 'global';
  elsif p_kind = 'local' then
    v_channel := public.hr_chat_zone_of(v_uid, p_slot);
  else
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    if v_pid is null then return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
    v_channel := 'party:' || v_pid::text;
    select array_agg(distinct m.user_id) into v_aud from public.hunt_party_members m where m.party_id = v_pid;
  end if;
  -- from_id and from_name are overwritten by hr_chat_name_authority from the session and profiles.
  insert into public.chat_messages (channel, from_id, from_name, body, from_slot, from_level, from_weapon, from_role, audience)
  values (v_channel, v_uid, 'Adventurer', v_body, p_slot,
          public.hr_level_of(v_uid, p_slot), public.hr_hunt_weapon_of(v_uid, p_slot),
          public.hr_chat_role_pick(v_uid, p_slot), v_aud)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_chat_row(v_row));
end $function$;
revoke execute on function public.hr_chat_send(p_slot integer, p_kind text, p_body text) from public, anon, service_role;
grant execute on function public.hr_chat_send(p_slot integer, p_kind text, p_body text) to authenticated;

-- ── hr_chat_recent: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_chat_recent(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_zone text; v_pid uuid; v_party text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:read', 30, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'chat:read') - 30) > 0 then
      perform public.hr_record_rejection(v_uid, p_slot, 'hr_chat_recent', 'rate_limited',
        jsonb_build_object('bucket', 'chat:read', 'limit', 30, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'chat:read') - 30));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_zone := public.hr_chat_zone_of(v_uid, p_slot);
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  v_party := case when v_pid is null then null else 'party:' || v_pid::text end;
  return jsonb_build_object('ok', true, 'zone', v_zone, 'party', v_party, 'lines', coalesce((
    select jsonb_agg(public.hr_chat_row(x) order by x.created_at, x.id) from (
      (select * from public.chat_messages m where m.channel = 'global' order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = v_zone order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where v_party is not null and m.channel = v_party
                   and v_uid = any (m.audience) order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = 'system' order by m.created_at desc limit 20)
    ) x
    where not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = x.from_id)), '[]'::jsonb));
end $function$;
revoke execute on function public.hr_chat_recent(p_slot integer) from public, anon, service_role;
grant execute on function public.hr_chat_recent(p_slot integer) to authenticated;

-- ── hr_whisper_send: 2 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_whisper_send(p_slot integer, p_target text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_to uuid; v_body text; v_fault text; v_row public.chat_whispers%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:burst', 5, interval '10 seconds') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'whisper:burst') - 5) > 0 then
      perform public.hr_record_rejection(v_uid, p_slot, 'hr_whisper_send', 'rate_limited',
        jsonb_build_object('bucket', 'whisper:burst', 'limit', 5, 'per', '10 seconds'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'whisper:burst') - 5));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:send', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'whisper:send') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, p_slot, 'hr_whisper_send', 'rate_limited',
        jsonb_build_object('bucket', 'whisper:send', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'whisper:send') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_to := public.hr_social_resolve(p_target);
  if v_to is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_to = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_to) or not public.hr_admitted(v_to) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  insert into public.chat_whispers (from_id, from_slot, from_name, from_level, from_weapon, from_role, to_id, to_name, body)
  values (v_uid, p_slot, public.hr_social_name(v_uid), public.hr_level_of(v_uid, p_slot),
          public.hr_hunt_weapon_of(v_uid, p_slot), public.hr_chat_role_pick(v_uid, p_slot),
          v_to, public.hr_social_name(v_to), v_body)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_whisper_row(v_row));
end $function$;
revoke execute on function public.hr_whisper_send(p_slot integer, p_target text, p_body text) from public, anon, service_role;
grant execute on function public.hr_whisper_send(p_slot integer, p_target text, p_body text) to authenticated;

-- ── hr_whispers_recent: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_whispers_recent()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:read') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_whispers_recent', 'rate_limited',
        jsonb_build_object('bucket', 'social:read', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:read') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  return jsonb_build_object('ok', true, 'lines', coalesce((
    select jsonb_agg(public.hr_whisper_row(x) order by x.created_at, x.id) from (
      select * from public.chat_whispers w
       where (w.to_id = v_uid or w.from_id = v_uid)
         and not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = w.from_id)
       order by w.created_at desc limit 100) x), '[]'::jsonb));
end $function$;
revoke execute on function public.hr_whispers_recent() from public, anon, service_role;
grant execute on function public.hr_whispers_recent() to authenticated;

-- ── hr_block_set: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_block_set(p_target text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_on is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_block_set', 'rate_limited',
        jsonb_build_object('bucket', 'social:write', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if p_on then
    if (select count(*) from public.chat_blocks where blocker_id = v_uid) >= 500 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_uid, v_t) on conflict do nothing;
    delete from public.friend_links where user_lo = least(v_uid, v_t) and user_hi = greatest(v_uid, v_t);
    delete from public.friend_requests where (from_id = v_uid and to_id = v_t) or (from_id = v_t and to_id = v_uid);
  else
    delete from public.chat_blocks where blocker_id = v_uid and blocked_id = v_t;
  end if;
  return jsonb_build_object('ok', true, 'blocked', p_on, 'person', public.hr_social_person(v_t));
end $function$;
revoke execute on function public.hr_block_set(p_target text, p_on boolean) from public, anon, service_role;
grant execute on function public.hr_block_set(p_target text, p_on boolean) to authenticated;

-- ── hr_friend_request: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_friend_request(p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_friend_request', 'rate_limited',
        jsonb_build_object('bucket', 'social:write', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if public.hr_social_friends(v_uid, v_t) then return jsonb_build_object('ok', false, 'error', 'already_friends'); end if;
  if exists (select 1 from public.friend_requests where from_id = v_t and to_id = v_uid) then
    if (select count(*) from public.friend_links where user_lo = v_uid or user_hi = v_uid) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
    insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_t), greatest(v_uid, v_t)) on conflict do nothing;
    return jsonb_build_object('ok', true, 'state', 'friends', 'person', public.hr_social_person(v_t));
  end if;
  if (select count(*) from public.friend_requests where from_id = v_uid) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  insert into public.friend_requests (from_id, to_id) values (v_uid, v_t) on conflict do nothing;
  return jsonb_build_object('ok', true, 'state', 'requested', 'person', public.hr_social_person(v_t));
end $function$;
revoke execute on function public.hr_friend_request(p_target text) from public, anon, service_role;
grant execute on function public.hr_friend_request(p_target text) to authenticated;

-- ── hr_friend_answer: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_friend_answer(p_target text, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_accept is null then return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_friend_answer', 'rate_limited',
        jsonb_build_object('bucket', 'social:write', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null or not exists (select 1 from public.friend_requests where from_id = v_t and to_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
  if p_accept then
    if public.hr_social_blocked(v_uid, v_t) then return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
    if (select count(*) from public.friend_links where user_lo = v_uid or user_hi = v_uid) >= 200 then
      return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
    insert into public.friend_links (user_lo, user_hi) values (least(v_uid, v_t), greatest(v_uid, v_t)) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'state', case when p_accept then 'friends' else 'declined' end,
                            'person', public.hr_social_person(v_t));
end $function$;
revoke execute on function public.hr_friend_answer(p_target text, p_accept boolean) from public, anon, service_role;
grant execute on function public.hr_friend_answer(p_target text, p_accept boolean) to authenticated;

-- ── hr_friend_remove: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_friend_remove(p_target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:write', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_friend_remove', 'rate_limited',
        jsonb_build_object('bucket', 'social:write', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:write') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  delete from public.friend_links where user_lo = least(v_uid, v_t) and user_hi = greatest(v_uid, v_t);
  delete from public.friend_requests where (from_id = v_t and to_id = v_uid) or (from_id = v_uid and to_id = v_t);
  return jsonb_build_object('ok', true, 'state', 'none', 'person', public.hr_social_person(v_t));
end $function$;
revoke execute on function public.hr_friend_remove(p_target text) from public, anon, service_role;
grant execute on function public.hr_friend_remove(p_target text) to authenticated;

-- ── hr_social_state: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_social_state(p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_floor constant interval := interval '20 seconds';
  c_online constant interval := interval '75 seconds';
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'social:read', 20, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:read') - 20) > 0 then
      perform public.hr_record_rejection(v_uid, p_slot, 'hr_social_state', 'rate_limited',
        jsonb_build_object('bucket', 'social:read', 'limit', 20, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'social:read') - 20));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    insert into public.social_presence as sp (user_id, slot, seen_at) values (v_uid, p_slot, now())
    on conflict (user_id) do update set slot = excluded.slot, seen_at = excluded.seen_at
      where sp.seen_at < now() - c_floor or sp.slot <> excluded.slot;
  end if;
  return jsonb_build_object('ok', true, 'me', v_uid,
    'friends', coalesce((
      select jsonb_agg(public.hr_social_person(f.other)
               || case when q.quiet then jsonb_build_object('online', false, 'doing', null)
                       else jsonb_build_object('online', coalesce(sp.seen_at > now() - c_online, false),
                                               'doing', public.hr_social_doing(f.other)) end
             order by public.hr_social_name(f.other), f.other)
        from (select case when l.user_lo = v_uid then l.user_hi else l.user_lo end as other
                from public.friend_links l where l.user_lo = v_uid or l.user_hi = v_uid) f
        left join public.social_presence sp on sp.user_id = f.other
        cross join lateral (select coalesce((select ps.presence_quiet from public.player_state ps
                                              where ps.user_id = f.other and ps.slot = coalesce(sp.slot, 0)), false) as quiet) q), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(public.hr_social_person(r.from_id) order by r.created_at)
                            from public.friend_requests r where r.to_id = v_uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(public.hr_social_person(r.to_id) order by r.created_at)
                            from public.friend_requests r where r.from_id = v_uid), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(public.hr_social_person(b.blocked_id) order by b.created_at)
                          from public.chat_blocks b where b.blocker_id = v_uid), '[]'::jsonb));
end $function$;
revoke execute on function public.hr_social_state(p_slot integer) from public, anon, service_role;
grant execute on function public.hr_social_state(p_slot integer) to authenticated;

-- ── hr_inspect: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_inspect(p_target text, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid; v_slot int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'inspect', 30, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'inspect') - 30) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_inspect', 'rate_limited',
        jsonb_build_object('bucket', 'inspect', 'limit', 30, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'inspect') - 30));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t <> v_uid and (public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  v_slot := coalesce((select ps.slot from public.player_state ps where ps.user_id = v_t and ps.slot = p_slot),
                     (select sp.slot from public.social_presence sp join public.player_state ps
                         on ps.user_id = sp.user_id and ps.slot = sp.slot where sp.user_id = v_t),
                     (select min(ps.slot) from public.player_state ps where ps.user_id = v_t));
  if v_slot is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true, 'id', v_t, 'name', public.hr_social_name(v_t), 'slot', v_slot,
    'level', public.hr_level_of(v_t, v_slot), 'weapon', public.hr_hunt_weapon_of(v_t, v_slot),
    'role', public.hr_chat_role_pick(v_t, v_slot),
    'gear', coalesce((select jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot)
                        from public.player_equipment e where e.user_id = v_t and e.slot = v_slot), '[]'::jsonb));
end $function$;
revoke execute on function public.hr_inspect(p_target text, p_slot integer) from public, anon, service_role;
grant execute on function public.hr_inspect(p_target text, p_slot integer) to authenticated;

-- ── hr_town_move: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_town_move(p_slot integer, p_map text, p_x integer, p_y integer, p_gx integer, p_gy integer, p_dir text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The floor: a write inside this of the last is answered and not made. The
  -- client publishes at most once a second (src/data/town-presence.js).
  c_floor   constant interval := interval '250 milliseconds';
  c_per_min constant int := 90;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  public.hr_town_maps%rowtype;
  v_last timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_move', c_per_min, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'town_move') - c_per_min) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_town_move', 'rate_limited',
        jsonb_build_object('bucket', 'town_move', 'limit', c_per_min, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'town_move') - c_per_min));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- LEAVING: this character's body goes (another character of the account keeps its own).
  if p_map is null then
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    return jsonb_build_object('ok', true, 'left', true);
  end if;
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if p_x is null or p_y is null or p_gx is null or p_gy is null
     or p_x < 0 or p_x >= v_map.w or p_y < 0 or p_y >= v_map.h
     or p_gx < 0 or p_gx >= v_map.w or p_gy < 0 or p_gy >= v_map.h
     or p_dir is null or p_dir not in ('n', 's', 'e', 'w') then
    return jsonb_build_object('ok', false, 'error', 'bad_position'); end if;
  -- A HUNTER IS NOT IN TOWN: an open hunt session refuses, and takes the body out.
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    delete from public.town_positions where user_id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  select at into v_last from public.town_positions where user_id = v_uid;
  if v_last is not null and now() - v_last < c_floor then
    return jsonb_build_object('ok', true, 'stamped', false); end if;
  insert into public.town_positions as tp (user_id, slot, map_id, x, y, gx, gy, dir, at)
    values (v_uid, v_slot, p_map, p_x, p_y, p_gx, p_gy, p_dir, now())
  on conflict (user_id) do update
    set slot = excluded.slot, map_id = excluded.map_id, x = excluded.x, y = excluded.y,
        gx = excluded.gx, gy = excluded.gy, dir = excluded.dir, at = excluded.at;
  return jsonb_build_object('ok', true, 'stamped', true);
end $function$;
revoke execute on function public.hr_town_move(p_slot integer, p_map text, p_x integer, p_y integer, p_gx integer, p_gy integer, p_dir text) from public, anon, service_role;
grant execute on function public.hr_town_move(p_slot integer, p_map text, p_x integer, p_y integer, p_gx integer, p_gy integer, p_dir text) to authenticated;

-- ── hr_town_walkers: 1 rate gate(s) ──
CREATE OR REPLACE FUNCTION public.hr_town_walkers(p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- Fresh: the client re-publishes a standing body every 10 s, so three missed
  -- keepalives is gone (a closed tab leaves within this without a goodbye).
  c_fresh   constant interval := interval '30 seconds';
  c_cap     constant int := 40;
  c_scan    constant int := 80;    -- the index rows one read may visit (2 × cap)
  c_per_min constant int := 45;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_walk', c_per_min, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'town_walk') - c_per_min) > 0 then
      perform public.hr_record_rejection(v_uid, null, 'hr_town_walkers', 'rate_limited',
        jsonb_build_object('bucket', 'town_walk', 'limit', c_per_min, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'town_walk') - c_per_min));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'cap', c_cap, 'walkers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.user_id, 'slot', w.slot,
             'name', public.hr_social_name(w.user_id),
             'level', public.hr_level_of(w.user_id, w.slot),
             'role', public.hr_chat_role_pick(w.user_id, w.slot),
             -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set),
             -- null when none or no longer owned (a lapsed premium outfit), as hr_outfit_view reads it.
             'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(w.user_id, w.slot))
                            then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
             'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
             'age_ms', greatest(0, floor(extract(epoch from (now() - w.at)) * 1000))::int
           ) order by w.at desc)
      from (select c.*
              from (select tp.* from public.town_positions tp
                     where tp.map_id = p_map and tp.at > now() - c_fresh
                     order by tp.at desc limit c_scan) c
              join public.player_state ps on ps.user_id = c.user_id and ps.slot = c.slot
             where c.user_id <> v_uid
               and not coalesce(ps.presence_quiet, false)
               and not exists (select 1 from public.hunt_sessions h
                                where h.user_id = c.user_id and h.slot = c.slot and h.ended_at is null)
               and not public.hr_social_blocked(v_uid, c.user_id)
               and public.hr_admitted(c.user_id)
             order by c.at desc limit c_cap) w
      left join public.player_outfits po on po.user_id = w.user_id and po.slot = w.slot), '[]'::jsonb));
end $function$;
revoke execute on function public.hr_town_walkers(p_map text) from public, anon, service_role;
grant execute on function public.hr_town_walkers(p_map text) to authenticated;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_u constant uuid := '000000c2-0000-0000-0000-00000c2e0001';
  r record; v_src text; v jsonb; v_i int; v_n bigint; v_rows int;
begin
  -- (a) INSERTION ONLY, AND EVERY GATE RECORDS: each body minus this file's
  --     blocks is its pinned pre-image, and it calls the recorder once per gate.
  for r in select * from (values
    ('public.hr_chat_send(integer,text,text)', 'b93f11e5a5b3df6d46be40fce7ed9129', 2),
    ('public.hr_chat_recent(integer)', 'fd065847e7dc58c8ab38eab239a7a6f2', 1),
    ('public.hr_whisper_send(integer,text,text)', '23e3a8e3670f3f9d0f3c616cba78dafa', 2),
    ('public.hr_whispers_recent()', '589e2033ce4569dfd1d9c399f741093d', 1),
    ('public.hr_block_set(text,boolean)', '39a1420f232a44f69a05e98c356fe401', 1),
    ('public.hr_friend_request(text)', '9456c98ce6941693272954a91933a93d', 1),
    ('public.hr_friend_answer(text,boolean)', '81ca88883c6e0f051fd8c96318b9bec4', 1),
    ('public.hr_friend_remove(text)', 'cdb9c889da951f87d4940ba394d54c87', 1),
    ('public.hr_social_state(integer)', '4d92a4468c1113b2b31567c393814bb4', 1),
    ('public.hr_inspect(text,integer)', '59d9315c59970c2a7ef3c51fd02ac2bc', 1),
    ('public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'b049c0091c716cf1d58ec43e57bec8be', 1),
    ('public.hr_town_walkers(text)', '6ee33b7ba793e913c02044e7f1e69d67', 1)) t(sig, pin, gates) loop
    select prosrc into v_src from pg_proc where oid = to_regprocedure(r.sig);
    if md5(regexp_replace(v_src, '\n +if public\.hr_rate_sample_weight\(public\.hr_rate_over\(v_uid, ''[^'']+''\) - [a-z0-9_]+\) > 0 then\n +perform public\.hr_record_rejection\([^;]*\);\n +end if;', '', 'g')) <> r.pin then
      raise exception 'SELF-CHECK(a): % is not its pre-image plus insertions', r.sig; end if;
    if (select count(*) from regexp_matches(v_src, 'if not public\.hr_rate_ok\(', 'g')) <> r.gates
       or (select count(*) from regexp_matches(v_src, 'perform public\.hr_record_rejection\(v_uid, ', 'g')) <> r.gates
       or (select count(*) from regexp_matches(v_src, 'if public\.hr_rate_sample_weight\(', 'g')) <> r.gates then
      raise exception 'SELF-CHECK(a): % does not record (sampled) at each of its % rate gates', r.sig, r.gates; end if;
    -- (b) THE ACL IS THE AUTHORING FILES': the player's own door, nobody else's.
    if not has_function_privilege('authenticated', r.sig, 'execute')
       or has_function_privilege('anon', r.sig, 'execute') then
      raise exception 'SELF-CHECK(b): % ACL moved', r.sig; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  -- (c) THE REFUSAL LANDS: a real caller past two limits gets the same answer
  --     as before, and the journal holds ONE sampled row per (day, code).
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'social-rate-rejections §3 probe') on conflict (user_id) do nothing;
    for v_i in 1..21 loop v := public.hr_whispers_recent(); end loop;
    if v->>'error' is distinct from 'rate_limited' then
      raise exception 'SELF-CHECK(c): the 21st hr_whispers_recent in a minute answered %', v; end if;
    for v_i in 1..31 loop v := public.hr_inspect('nobody-' || v_i, 0); end loop;
    if v->>'error' is distinct from 'rate_limited' then
      raise exception 'SELF-CHECK(c): the 31st hr_inspect in a minute answered %', v; end if;
    select count(*), sum(n) into v_rows, v_n from public.hr_rejections
     where user_id = v_u and code = 'rate_limited' and day = current_date;
    if v_rows <> 1 or v_n <> 2
       or not exists (select 1 from public.hr_rejections where user_id = v_u and code = 'rate_limited'
                         and verbs ? 'hr_whispers_recent' and verbs ? 'hr_inspect') then
      raise exception 'SELF-CHECK(c): expected one rate_limited row counting 2 (one whispers, one inspect), got % row(s), n %', v_rows, v_n; end if;
    raise exception using errcode = 'HR878', message = 'social-rate-rejections §3 complete - rolling back';
  exception when sqlstate 'HR878' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hr_rejections where user_id = v_u)
     or exists (select 1 from public.hr_access_allowlist where user_id = v_u) then
    raise exception 'SELF-CHECK(d): §3 LEAKED a probe row'; end if;
  raise notice 'social-rate-rejections: twelve bodies record their rate-limit refusals, sampled; all green';
end $mig$;
