-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-20-players-online-revoke.sql — hr_players_online STOPS BEING A CLIENT VERB
--   (lane/c-beta-server, backend-architect, 2026-11-01).
--
-- STATUS: STAGED. Pre-EA: applies on its passing §2, one file via the Coordinator's apply tool,
-- never inside begin/commit, never 00:00–00:10 UTC. EDGE: none. CLIENT: none (v0.2.81 is live and
-- nothing under src/ names it; tests/client-intent-surface.mjs). Moves no value.
--
-- WHY. 2027-02-17-social-poll.sql kept this grant for the tabs still running the release before it.
-- hr_social_poll (security definer) answers the count; the client asks nothing else. Every verb off
-- the client surface is one less thing a request can hammer: this one takes a row lock on the shared
-- count. The function stays: hr_social_poll calls it as the definer, with the caller's JWT, so its
-- access check, its 6-a-minute limit, its 20 s stamp floor and its shared 15 s count are unchanged.
--
-- WHAT IT COSTS. A tab still on a release older than the one that shipped hr_social_poll gets 42501
-- on its count: it shows "—" (src/social/players-online.js: a failed answer shows nothing) and its
-- characters stop being stamped present until it reloads. No progress, no hunt, no value.
-- REVERSIBLE: grant execute back to authenticated and re-insert the baseline row (2026-11-07 §3).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS ─────────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_players_online(integer[])') is null
     or to_regprocedure('public.hr_social_poll(integer,integer[])') is null then
    raise exception 'PIN: hr_players_online(int[]) / hr_social_poll(int,int[]) are missing'; end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_social_poll(integer,integer[])'::regprocedure and p.prosecdef) then
    raise exception 'PIN: hr_social_poll is not security definer: revoking its callee would break every poll'; end if;
end $mig$;

-- ── §1 THE REVOKE AND THE BASELINE, TOGETHER ────────────────────────────────
revoke execute on function public.hr_players_online(integer[]) from public;
revoke execute on function public.hr_players_online(integer[]) from anon, authenticated, service_role;
delete from public.hr_client_rpc_baseline where proname = 'hr_players_online';

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
do $$
declare
  c_u constant uuid := '000000d5-0000-4000-a000-00007f0c0220';
  v jsonb; v_refused boolean := false; r text;
begin
  -- (a) THE SHAPE: no request role can ask; the poll still can; the baseline agrees; hygiene STRICT is green.
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(r, 'public.hr_players_online(integer[])', 'execute') then
      raise exception 'players-online-revoke §2(a): % can execute hr_players_online', r; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_social_poll(integer,integer[])', 'execute') then
    raise exception 'players-online-revoke §2(a): the poll lost its grant'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_players_online') then
    raise exception 'players-online-revoke §2(a): the baseline row survived'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'players-online-revoke §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then
      raise exception 'players-online-revoke §2-harness: hr_create_character refused'; end if;
    update public.hr_players_online_cache set at = '-infinity' where id;

    -- (b) AS A REQUEST: the poll answers the count and stamps the character; the verb itself is refused.
    set local role authenticated;
    v := public.hr_social_poll(0, array[0]);
    begin
      perform public.hr_players_online(array[0]);
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    if coalesce(v->>'ok', '') <> 'true' or jsonb_typeof(v->'online') <> 'number' or (v->>'online')::bigint < 1 then
      raise exception 'players-online-revoke §2(b): the poll no longer answers the count: %', v; end if;
    if not exists (select 1 from public.character_presence where user_id = c_u and slot = 0) then
      raise exception 'players-online-revoke §2(b): the poll no longer stamps the character present'; end if;
    if not v_refused then
      raise exception 'players-online-revoke §2(b): authenticated still reaches hr_players_online'; end if;

    raise exception using errcode = 'HRP20', message = 'players-online-revoke §2 complete - rolling back';
  exception when sqlstate 'HRP20' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.character_presence where user_id = c_u) then
    raise exception 'players-online-revoke §2: LEAKED a probe row'; end if;
  raise notice 'players-online-revoke: hr_players_online is off the client surface; hr_social_poll answers the count; all green';
end $$;
