-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-17-social-poll.sql — THE SOCIAL POLL IS ONE REQUEST (lane/a-beta-cost, systems-engineer, 2026-11-01;
-- Tyler 10-30: keep cutting cost per player, gameplay untouched). STAGED: tools/apply-migration.mjs, one file, never
-- inside begin/commit, never 00:00-00:10 UTC. Before the client half (src/social/social-session.js), which asks this.
--
-- WHY. Every open client polled hr_social_state and then hr_players_online each 30 s, one after the other: 2 requests a
-- minute of a hunt's 8.3 and of the idle town's 13, each its own PostgREST call, token check and pooled transaction, for
-- answers read together. hr_social_poll answers both in one. The saving is per open client, at every scale.
--
-- WHAT. hr_social_poll(p_slot, p_slots): hr_social_state(p_slot) (the friends read and the account's presence stamp) with
-- `online`, the count hr_players_online(p_slots) answers, added; `online` is null when that verb refuses (the client shows a
-- dash, as it did for a refused ask). A refused read is answered as it stands and asks no count, as the client did. It
-- restates neither body: each keeps its own rate limit, floor, access check and shared 15 s count, and the two run in the
-- order the client ran them, so the shared count row's lock is the last thing held. Its own access check and rate gate are
-- the rule of every client verb (hr_assert_grant_hygiene): 10 a minute (the poll is 2), an UNLOGGED counter. Moves no value.
--
-- hr_social_state stays a client verb: reread() after a friend or block change wants no count. hr_players_online keeps its
-- grant for the tabs still running the last release; once this client half has shipped its grant is one revoke, and its baseline
-- row with it (no client names it: tests/client-intent-surface.mjs). EDGE: none. No table, no row of any character.
-- REVERSIBLE: drop the function and its baseline row. ORDER: no object in common with any staged file.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: THE TWO VERBS THIS ANSWERS WITH ────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_social_state(integer)') is null or to_regprocedure('public.hr_players_online(integer[])') is null then
    raise exception 'PIN: hr_social_state(int) / hr_players_online(int[]) are missing'; end if;
end $mig$;

-- ── §1 THE VERB ─────────────────────────────────────────────────────────────
create or replace function public.hr_social_poll(p_slot int, p_slots int[])
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_state jsonb; v_count jsonb;
begin
  -- SOCIAL-POLL (2027-02-17-social-poll.sql): both answers, one request; a refused read asks no count.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'social:poll', 10, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_state := public.hr_social_state(p_slot);
  if v_state->>'ok' is distinct from 'true' then return v_state; end if;
  v_count := public.hr_players_online(p_slots);
  return v_state || jsonb_build_object('online', case when v_count->>'ok' = 'true' then v_count->'online' end);
end $$;
revoke execute on function public.hr_social_poll(integer, integer[]) from public, anon, service_role;
grant  execute on function public.hr_social_poll(integer, integer[]) to authenticated;

-- ── §2 THE CLIENT SURFACE ───────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_social_poll';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_social_poll', 'p_slot integer, p_slots integer[]', 'authenticated',
   'added 2027-02-17: hr_social_state and hr_players_online answered in one request (their rate limits, floors and access check unchanged); a count only; moves no value');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
do $$
declare
  c_u constant uuid := '000000d5-0000-4000-a000-00007f0c0217';
  v jsonb; v_n bigint; v_seen timestamptz;
begin
  -- (a) THE SHAPE: a signed-in client may ask, nobody else; the surface and the baseline agree.
  if has_function_privilege('anon', 'public.hr_social_poll(integer,integer[])', 'execute')
     or has_function_privilege('service_role', 'public.hr_social_poll(integer,integer[])', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_social_poll(integer,integer[])', 'execute') then
    raise exception 'social-poll §4(a): the grants are wrong'; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_social_poll(integer,integer[])'::regprocedure
                  and p.prosecdef and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'social-poll §4(a): not security definer with a pinned search_path'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- (b) SIGNED OUT: refused, as the read refuses.
    perform set_config('request.jwt.claim.sub', '', true);
    if public.hr_social_poll(0, array[0])->>'error' is distinct from 'not_signed_in' then raise exception 'social-poll §4(b): a signed-out ask was answered'; end if;

    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'social-poll §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'social-poll §4-harness: hr_create_character refused'; end if;

    -- (c) A REFUSED READ IS ANSWERED AS IT STANDS AND ASKS NO COUNT: no character is stamped, no `online` in the answer.
    --     ((c) to (f) are 4 of the verb's 10 a minute; (g) spends the rest)
    v := public.hr_social_poll(9, array[0]);
    if v->>'error' is distinct from 'bad_slot' or v ? 'online' then raise exception 'social-poll §4(c): a refused read answered %', v; end if;
    if exists (select 1 from public.character_presence where user_id = c_u) then raise exception 'social-poll §4(c): a refused read still stamped a character'; end if;

    -- (d) ONE POLL IS BOTH ANSWERS AND BOTH STAMPS: the read's lists, the count, the account's presence, the caller's own
    --     named characters and no slot it does not hold.
    update public.hr_players_online_cache set at = '-infinity' where id;
    v := public.hr_social_poll(0, array[0, 1]);
    if coalesce(v->>'ok', '') <> 'true' or not (v ?& array['me', 'friends', 'incoming', 'outgoing', 'blocks', 'online']) then
      raise exception 'social-poll §4(d): the answer is %', v; end if;
    if jsonb_typeof(v->'online') <> 'number' or (v->>'online')::bigint < 1 then raise exception 'social-poll §4(d): the count is %', v->'online'; end if;
    if not exists (select 1 from public.social_presence where user_id = c_u and slot = 0) then raise exception 'social-poll §4(d): the account''s presence was not stamped'; end if;
    if (select array_agg(slot) from public.character_presence where user_id = c_u) is distinct from array[0::smallint] then
      raise exception 'social-poll §4(d): the characters stamped are %', (select array_agg(slot) from public.character_presence where user_id = c_u); end if;

    -- (e) THE SAME COUNT THE COUNT'S OWN VERB GIVES, and the floor still holds: an ask inside 20 s rewrites no stamp.
    v_n := (v->>'online')::bigint;
    if (public.hr_players_online(null)->>'online')::bigint <> v_n then raise exception 'social-poll §4(e): the poll''s count differs from hr_players_online''s'; end if;
    update public.character_presence set seen_at = now() - interval '5 seconds' where user_id = c_u returning seen_at into v_seen;
    perform public.hr_social_poll(0, array[0]);
    if (select seen_at from public.character_presence where user_id = c_u and slot = 0) <> v_seen then raise exception 'social-poll §4(e): a stamp inside the floor was rewritten'; end if;

    -- (f) A COUNT THE VERB REFUSES SHOWS NOTHING, AND THE READ STILL ANSWERS.
    v := public.hr_social_poll(0, array[0, 40]);
    if coalesce(v->>'ok', '') <> 'true' or not (v ? 'friends') or jsonb_typeof(v->'online') <> 'null' then
      raise exception 'social-poll §4(f): a refused count answered %', v; end if;

    -- (g) EACH VERB KEEPS ITS OWN LIMIT: past hr_players_online's 6 a minute the poll's count is null, the read goes on;
    --     past the poll's own 10 it is refused, and no read runs.
    for i in 1 .. 6 loop v := public.hr_social_poll(0, array[0]); end loop;
    if coalesce(v->>'ok', '') <> 'true' or jsonb_typeof(v->'online') <> 'null' then raise exception 'social-poll §4(g): past the count''s limit the poll answered %', v; end if;
    v := public.hr_social_poll(0, array[0]);
    if v->>'error' is distinct from 'rate_limited' then raise exception 'social-poll §4(g): past its own limit the poll answered %', v; end if;

    raise exception using errcode = 'HRP17', message = 'social-poll §4 complete - rolling back';
  exception when sqlstate 'HRP17' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.character_presence where user_id = c_u) then
    raise exception 'social-poll §4: LEAKED a probe row'; end if;
  raise notice 'social-poll: one request, both answers, both stamps; a refused read asks no count; each verb keeps its limit; all green';
end $$;
