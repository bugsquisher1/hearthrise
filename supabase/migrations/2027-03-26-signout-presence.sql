-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-26-signout-presence.sql — SIGNED OUT IS NOT ONLINE (lane/c-signout-presence, backend-architect, 2026-11-09;
--   bug report #78, root cause by QA on lane/a-bugs-75-78).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (the apply tool, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §3; ON THE EA SECURITY LIST (a new client verb; moves no value). EDGE: none. CLIENT: AccountSession.signOut asks
-- hr_presence_leave before the login is forgotten and rides the next release AFTER this applies (a tab before the apply gets
-- PGRST202 and signs out as it did; a tab on an older release never asks).
--
-- THE BUG. A player signs out and the "N online" count goes on counting their idle heroes for 61 to 71 s (measured), and a
-- friend goes on seeing them online: both presences are stamps that only AGE OUT (75 s: hr_players_online, hr_social_state),
-- and nothing told the server the client was gone.
--
-- THE VERB. hr_presence_leave(): no argument. The caller is auth.uid() and nobody else can be named; the clock is the server's.
--   character_presence   the caller's rows are DELETED, every one. The row means "this hero is open in a client", and after a
--                        sign-out none is. NOT idle heroes only, on purpose: no surface reads this row as "playing". A hero
--                        that hunts or works keeps playing after a sign-out by design, and that is hr_playing (active_kind,
--                        the open hunt session), its town body is hr_town_live_of (active_kind), its party seat is its open
--                        session and a friend's "doing" is hunt_sessions: none of them reads this table, and §3(e) executes
--                        each. What the row does feed (the count, hr_frame_wanted's push gate, the world tick's "watched"
--                        flush cadence, the GM list's online flag) is exactly what the 75 s timer switches off a minute
--                        later today. So this does at once what the timer did late, and nothing else.
--   social_presence      the caller's row is KEPT and its stamp moved back to the edge of the online window
--                        (now() - hr_party_away_after()), never deleted: the row is also WHICH HERO the account is to its
--                        friends (hr_social_slot: the name they see, where a whisper or an invite by account lands) and the
--                        clock of a party seat (hr_party_last_seen; Tyler 10-19: a logged-out town member keeps its seat 10
--                        minutes). Deleted, a friend's list would rename the account to another hero and an idle party seat
--                        joined over 10 minutes ago would be swept within a minute. Moved back, the friend's dot and the
--                        party's "away" read true at once and the seat countdown the party sees starts where it always
--                        started (8 min 45 s). Only a stamp that still reads online is moved, so a second call writes nothing.
--
-- CONCURRENCY. Row locks only, in the poll's own order: the account's row (locked first, whether or not it is moved), then
-- its heroes' rows, so a poll in flight and a sign-out of one account queue on the account's row and cannot deadlock. A poll
-- that lands AFTER the leave stamps the heroes again (another device of the account, or a poll already on the wire): they
-- then age out in 75 s as before. Naturally idempotent: no key.
-- THE SHARED COUNT is untouched: it is recounted at most every 15 s for everyone (hr_players_online_cache), so the chip
-- follows within one recount and the viewer's own 30 s poll, as it does when a player arrives.
--
-- COST: one statement per table on two primary keys, once per sign-out. 6 a minute an account. No table, no index, no row
-- kept: at 100x players it REMOVES rows a minute early (and their pushed frames and tick flushes). REVERSIBILITY: drop the
-- function, its hr_client_rpc_baseline row and its hr_gm_wall_allow row; no data.
-- ORDER: after 2027-03-13-gm-tools.sql (the door's list); no object in common with any later file. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (the live shapes this file reads; it restates no body) ───────────
do $mig$
declare v_src text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'character_presence'
                  and column_name = 'seen_at' and data_type = 'timestamp with time zone')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'social_presence'
                     and column_name = 'seen_at' and data_type = 'timestamp with time zone') then
    raise exception 'PIN: character_presence.seen_at / social_presence.seen_at are missing'; end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_access_check()') is null
     or to_regprocedure('public.hr_party_away_after()') is null or to_regprocedure('public.hr_social_state(integer)') is null then
    raise exception 'PIN: hr_rate_ok / hr_access_check / hr_party_away_after / hr_social_state are missing'; end if;
  -- ONE WINDOW, TWO HOMES: the party's "away" (the function) and the friend's dot (hr_social_state's constant). The stamp is
  -- moved back by the function; a file that widens one without the other must move this verb with it.
  select prosrc into v_src from pg_proc where oid = 'public.hr_social_state(integer)'::regprocedure;
  if public.hr_party_away_after() <> interval '75 seconds' or position('c_online constant interval := interval ''75 seconds''' in v_src) = 0 then
    raise exception 'PIN: the online window is no longer 75 s in both hr_party_away_after() and hr_social_state'; end if;
end $mig$;

-- ── §1 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_presence_leave()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid  uuid := auth.uid();
  v_edge timestamptz := now() - public.hr_party_away_after();   -- a stamp at or before this reads "not online" everywhere
begin
  -- SIGNOUT-PRESENCE (2027-03-26-signout-presence.sql): the caller's own rows, the server's clock, no argument.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'presence:leave', 6, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The account's row first and always locked, as the poll takes them (hr_social_state, then hr_players_online): one lock
  -- order, so a poll and a leave of one account queue here and never deadlock on its heroes' rows.
  perform 1 from public.social_presence sp where sp.user_id = v_uid for update;
  -- KEPT (hr_social_slot, hr_party_last_seen read it), moved back only while it still reads online: a second call writes nothing.
  update public.social_presence sp set seen_at = v_edge where sp.user_id = v_uid and sp.seen_at > v_edge;
  -- No client has this account's heroes open: every one of its rows, hunting or not (hr_playing reads none of them).
  delete from public.character_presence cp where cp.user_id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.hr_presence_leave() from public;
revoke execute on function public.hr_presence_leave() from anon, service_role;
grant  execute on function public.hr_presence_leave() to authenticated;

-- ── §2 THE CLIENT SURFACE, AND THE GAME MASTER'S DOOR ────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_presence_leave';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_presence_leave', '', 'authenticated',
   'added 2027-03-26 (bug #78): sign-out says the caller''s own client is gone: deletes its own character_presence rows and moves its own social_presence stamp back to the edge of the 75 s online window (the row stays); no argument, auth.uid() only, 6 a minute; moves no value');

-- It reaches no other player: the walled account's own presence, which its hr_social_poll (on the list) stamps.
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_presence_leave', 'its own presence')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
do $chk$
declare
  c_a  constant uuid := '000000c0-0000-4000-a000-00005160a001';   -- signs out
  c_b  constant uuid := '000000c0-0000-4000-a000-00005160b001';   -- another player, A's friend
  c_fn constant text := 'public.hr_presence_leave()';
  k    text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_u uuid; r text; v_hunt text; v_sess uuid; v_ver bigint;
  v_n0 bigint; v_n1 bigint; v_edge timestamptz;
  v_b_char tid; v_b_soc tid; v_a_soc tid; v_who jsonb;
begin
  -- (a) THE SHAPE: a signed-in client may ask, nobody else; no argument can name a player; the surface and the baseline agree.
  foreach r in array array['anon', 'service_role'] loop
    if has_function_privilege(r, c_fn, 'execute') then raise exception 'signout-presence §3(a): % can execute hr_presence_leave', r; end if;
  end loop;
  if not has_function_privilege('authenticated', c_fn, 'execute') then raise exception 'signout-presence §3(a): authenticated cannot ask'; end if;
  if not exists (select 1 from pg_proc p where p.oid = c_fn::regprocedure and p.prosecdef and p.pronargs = 0
                  and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'signout-presence §3(a): not a no-argument security definer with a pinned search_path'; end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'hr_presence_leave') <> 1 then
    raise exception 'signout-presence §3(a): an overload exists (one that takes an argument could name another player)'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline b where b.proname = 'hr_presence_leave' and b.grantee = 'authenticated'
                  and b.identity_args = pg_get_function_identity_arguments(c_fn::regprocedure)) then
    raise exception 'signout-presence §3(a): the baseline row is missing or names another shape'; end if;
  if to_regclass('public.hr_gm_wall_allow') is not null and not exists (select 1 from public.hr_gm_wall_allow where rpc = 'hr_presence_leave') then
    raise exception 'signout-presence §3(a): the Game Master''s door does not list the verb'; end if;
  if has_table_privilege('authenticated', 'public.character_presence', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.character_presence', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.social_presence', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.social_presence', 'select,insert,update,delete') then
    raise exception 'signout-presence §3(a): a client role reaches the presence rows themselves'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- Signed out: refused, nothing read.
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    if public.hr_presence_leave()->>'error' is distinct from 'not_signed_in' then raise exception 'signout-presence §3(a): a signed-out ask was answered'; end if;

    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    foreach v_u in array array[c_a, c_b] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe Leave ' || case when v_u = c_a then 'A' else 'B' end)
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'signout-presence §3 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
        raise exception 'signout-presence §3-harness: hr_create_character refused for %', v_u; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u;
    end loop;
    insert into public.friend_links (user_lo, user_hi) values (least(c_a, c_b), greatest(c_a, c_b));

    -- BOTH HAVE THE GAME OPEN, by the poll every client sends: A two idle heroes, B one.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    v := public.hr_social_poll(0, array[0, 1]);
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.character_presence where user_id = c_a) <> 2
       or not exists (select 1 from public.social_presence where user_id = c_a and slot = 0) then
      raise exception 'signout-presence §3-harness: A''s poll answered % and stamped % hero(es)', v, (select count(*) from public.character_presence where user_id = c_a); end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_b, 'role', 'authenticated')::text, true);
    v := public.hr_social_poll(0, array[0]);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'signout-presence §3-harness: B''s poll answered %', v; end if;
    select ctid into v_b_char from public.character_presence where user_id = c_b and slot = 0;
    select ctid into v_b_soc from public.social_presence where user_id = c_b;
    if v_b_char is null or v_b_soc is null then raise exception 'signout-presence §3-harness: B was not stamped'; end if;
    -- What B is shown before: A online, as the hero A has on screen; the count with all three heroes in it.
    v_who := public.hr_social_state(0)->'friends'->0;
    if v_who->>'id' is distinct from c_a::text or v_who->>'online' is distinct from 'true' then
      raise exception 'signout-presence §3-harness: B does not see A online before the sign-out: %', v_who; end if;
    update public.hr_players_online_cache set at = '-infinity' where id;
    v_n0 := (public.hr_players_online(null)->>'online')::bigint;
    if v_n0 < 3 then raise exception 'signout-presence §3-harness: the count before is %', v_n0; end if;

    -- (b) ★ A SIGNS OUT, as the request role. Its heroes are gone from the count AT ONCE; its account row stays, same hero,
    --     at the edge of the window; B's rows are the same row versions they were.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v := public.hr_presence_leave();
    reset role;
    v_edge := now() - public.hr_party_away_after();
    if coalesce(v->>'ok', '') <> 'true' or (select array_agg(x order by x) from jsonb_object_keys(v) x) is distinct from array['ok'] then
      raise exception 'signout-presence §3(b): the leave answered %', v; end if;
    if exists (select 1 from public.character_presence where user_id = c_a) then
      raise exception 'signout-presence §3(b): a signed-out account''s idle heroes are still stamped open'; end if;
    if (select sp.seen_at from public.social_presence sp where sp.user_id = c_a and sp.slot = 0) is distinct from v_edge then
      raise exception 'signout-presence §3(b): the account''s row is gone, names another hero, or is not at the window''s edge: %',
        (select to_jsonb(sp) from public.social_presence sp where sp.user_id = c_a); end if;
    if (select ctid from public.character_presence where user_id = c_b and slot = 0) is distinct from v_b_char
       or (select ctid from public.social_presence where user_id = c_b) is distinct from v_b_soc then
      raise exception 'signout-presence §3(b): another player''s presence rows were written'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_b, 'role', 'authenticated')::text, true);
    update public.hr_players_online_cache set at = '-infinity' where id;
    v_n1 := (public.hr_players_online(null)->>'online')::bigint;
    if v_n1 <> v_n0 - 2 then raise exception 'signout-presence §3(b): the count read % after the sign-out, wanted % (two idle heroes fewer)', v_n1, v_n0 - 2; end if;
    v := public.hr_social_state(0)->'friends'->0;
    if v->>'online' is distinct from 'false' then raise exception 'signout-presence §3(b): the friend still reads online: %', v; end if;
    if v->'slot' is distinct from v_who->'slot' or v->>'name' is distinct from v_who->>'name' or v->>'id' is distinct from c_a::text then
      raise exception 'signout-presence §3(b): the account became another hero to its friend: % (was %)', v, v_who; end if;
    -- The party's clock: an idle hero of A reads away at once, and its seat keep runs from the window's edge, no earlier.
    if not public.hr_party_away(c_a, 0, now() - interval '1 hour')
       or public.hr_party_last_seen(c_a, now() - interval '1 hour') is distinct from v_edge then
      raise exception 'signout-presence §3(b): the party seat clock reads % (wanted away, last seen at the window''s edge)',
        public.hr_party_last_seen(c_a, now() - interval '1 hour'); end if;

    -- (c) A SECOND CALL IS A NO-OP: answered, and no row version of anybody moves.
    select ctid into v_a_soc from public.social_presence where user_id = c_a;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    v := public.hr_presence_leave();
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'signout-presence §3(c): the second leave answered %', v; end if;
    if (select ctid from public.social_presence where user_id = c_a) is distinct from v_a_soc
       or exists (select 1 from public.character_presence where user_id = c_a)
       or (select ctid from public.character_presence where user_id = c_b and slot = 0) is distinct from v_b_char
       or (select ctid from public.social_presence where user_id = c_b) is distinct from v_b_soc then
      raise exception 'signout-presence §3(c): a second leave wrote a row'; end if;

    -- (d) SIGNING BACK IN: the next poll stamps the account and its open heroes at once (no floor holds a left account out).
    v := public.hr_social_poll(0, array[0, 1]);
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.character_presence where user_id = c_a and seen_at = now()) <> 2
       or (select seen_at from public.social_presence where user_id = c_a) is distinct from now() then
      raise exception 'signout-presence §3(d): an account back after a sign-out is not stamped by its first poll: %', v; end if;

    -- (e) ★ SIGN-OUT ENDS NOBODY'S PLAY. A's hero 0 hunts and hero 1 works a bench; both are open in the client (d); A signs
    --     out. Nobody has them open, so their stamps go (as they did 75 s later); they still PLAY: the hunt is open and
    --     unwritten, the job stands, the worker still stands in town for everyone, and a hunter is never away to its party.
    delete from public.hr_rate_counters where user_id in (c_a, c_b);
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '5160e001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'signout-presence §3-harness: entering % answered %', v_hunt, v; end if;
    update public.player_state
       set active_kind = 'artisan', active_id = (select a.activity_id from public.hr_activities a where a.kind = 'artisan' order by a.activity_id limit 1),
           active_since = now(), accrued_to = now()
     where user_id = c_a and slot = 1;
    select h.id, h.version into v_sess, v_ver from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.ended_at is null;
    if v_sess is null or not public.hr_playing(c_a, 0) or not public.hr_playing(c_a, 1) then
      raise exception 'signout-presence §3-harness: A''s heroes do not hunt and work before the sign-out'; end if;
    v := public.hr_presence_leave();
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'signout-presence §3(e): the leave of a playing account answered %', v; end if;
    if exists (select 1 from public.character_presence where user_id = c_a) then
      raise exception 'signout-presence §3(e): a hero nobody has open is still stamped open'; end if;
    if not public.hr_playing(c_a, 0) or not public.hr_playing(c_a, 1) then
      raise exception 'signout-presence §3(e): a sign-out stopped a hero playing'; end if;
    if not exists (select 1 from public.hunt_sessions h where h.id = v_sess and h.ended_at is null and h.leave_at is null and h.version = v_ver) then
      raise exception 'signout-presence §3(e): a sign-out wrote the open hunt'; end if;
    if (select ps.active_kind from public.player_state ps where ps.user_id = c_a and ps.slot = 1) is distinct from 'artisan'
       or not public.hr_town_live(c_a, 1) then
      raise exception 'signout-presence §3(e): the working hero lost its job or its place in town'; end if;
    if public.hr_party_away(c_a, 0, now() - interval '1 hour') then
      raise exception 'signout-presence §3(e): a hunter reads away to its party after its account signed out'; end if;

    -- (f) THE LIMIT: six a minute an account, counted from a cleared counter; the seventh is refused and writes nothing.
    delete from public.hr_rate_counters where user_id = c_a;
    for i in 1 .. 6 loop v := public.hr_presence_leave(); end loop;
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'signout-presence §3(f): the sixth leave in a minute answered %', v; end if;
    v := public.hr_presence_leave();
    if v->>'error' is distinct from 'rate_limited' then raise exception 'signout-presence §3(f): the seventh leave in a minute answered %', v; end if;

    raise exception using errcode = 'HRP26', message = 'signout-presence §3 complete - rolling back';
  exception when sqlstate 'HRP26' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b)) or exists (select 1 from public.player_state where user_id in (c_a, c_b))
     or exists (select 1 from public.character_presence where user_id in (c_a, c_b))
     or exists (select 1 from public.social_presence where user_id in (c_a, c_b)) then
    raise exception 'signout-presence §3: LEAKED a probe row'; end if;
  raise notice 'signout-presence: a signed-out account''s heroes leave the count at once, its row stays at the window''s edge, another player''s rows and every playing hero are untouched, a second call writes nothing; all green';
end $chk$;
