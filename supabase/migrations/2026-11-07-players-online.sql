-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HOW MANY PLAYERS ARE ONLINE, AS THE SERVER COUNTS THEM (lane
-- b-death-equip-online, systems-engineer, 2026-10-21; tracker r16). STAGED, NOT
-- APPLIED. Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A small "N online" counter on the screen. The number must be the server's,
-- and a COUNT only: no id, name or slot of anyone leaves.
--
-- ── WHAT IT COUNTS, AND WHERE FROM ──────────────────────────────────────────
-- PLAYERS (accounts), from the presence system that already exists:
-- social_presence (2026-10-25-social.sql), one row per account, stamped by the
-- client's hr_social_state poll every 30 s (floor 20 s) while the game is open,
-- read as online within 75 s (hr_social_state's c_online). Nothing new is
-- stamped, and player_state.last_seen_at is NOT touched: that column is the
-- world tick's online signal (it changes how often hunts are flushed), and a
-- counter must not change how the engine ticks anybody (2026-10-25-town-walk.sql
-- made the same call). A player who chose to appear offline (the presence_quiet
-- column of the character they are on) is not counted.
--
-- ── SCALE ───────────────────────────────────────────────────────────────────
-- Every open client asks every 30 s, so the count is computed at most once per
-- 15 s for EVERYONE (one row, hr_players_online_cache), not once per ask: the
-- cost is one row read per ask whatever the population. The count itself is an
-- index range scan over the online rows only (social_presence_seen_at).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   §1 index social_presence (seen_at); table hr_players_online_cache (one row,
--      no client grant, RLS on).
--   §2 hr_players_online() (authenticated): { ok, online }. 6 asks / min / account.
--      Reads; its only write is the shared cache row. Moves no value.
--   §3 the client RPC baseline row.
-- REVERSIBILITY: drop the function, the table, the index and the baseline row.
-- ORDER: after 2026-11-07-death-popup-blessing.sql (no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (the live shapes this file reads; it restates no body) ───────────
do $mig$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'social_presence'
                  and column_name = 'seen_at' and data_type = 'timestamp with time zone') then
    raise exception 'PIN: social_presence.seen_at (timestamptz) is missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state'
                  and column_name = 'presence_quiet' and data_type = 'boolean') then
    raise exception 'PIN: player_state.presence_quiet is missing'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_social_state(integer)'::regprocedure), 'c_online constant interval := interval ''75 seconds''') = 0 then
    raise exception 'PIN: hr_social_state no longer reads presence as 75 s: re-derive c_online'; end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_access_check()') is null then
    raise exception 'PIN: hr_rate_ok(uuid,text,int,interval) / hr_access_check() are missing'; end if;
end $mig$;

-- ── §1 THE INDEX AND THE CACHE ROW ───────────────────────────────────────────
create index if not exists social_presence_seen_at on public.social_presence (seen_at);

create table if not exists public.hr_players_online_cache (
  id boolean primary key default true check (id),
  n  integer not null default 0 check (n >= 0),
  at timestamptz not null default '-infinity'
);
alter table public.hr_players_online_cache enable row level security;
revoke all on public.hr_players_online_cache from public, anon, authenticated, service_role;
insert into public.hr_players_online_cache (id) values (true) on conflict (id) do nothing;

-- ── §2 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_players_online()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PLAYERS-ONLINE (2026-11-07-players-online.sql)
  c_online constant interval := interval '75 seconds';   -- hr_social_state's c_online
  c_fresh  constant interval := interval '15 seconds';   -- how old the shared count may be
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'online', 6, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- One ask per c_fresh recounts for everyone; a concurrent ask waits on the row, then finds it fresh.
  update public.hr_players_online_cache c
     set n = (select count(*) from public.social_presence sp
               where sp.seen_at > now() - c_online and sp.seen_at <= now() + interval '60 seconds'
                 and not exists (select 1 from public.player_state ps
                                  where ps.user_id = sp.user_id and ps.slot = sp.slot and ps.presence_quiet)),
         at = now()
   where c.id and c.at < now() - c_fresh
  returning c.n into v_n;
  if v_n is null then select c.n into v_n from public.hr_players_online_cache c where c.id; end if;
  return jsonb_build_object('ok', true, 'online', coalesce(v_n, 0));
end $$;

revoke execute on function public.hr_players_online() from public;
revoke execute on function public.hr_players_online() from anon, service_role;
grant  execute on function public.hr_players_online() to authenticated;

-- ── §3 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_players_online';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_players_online', '', 'authenticated',
   'added 2026-11-07: the count of players online (social_presence within 75 s, quiet ones left out), shared and recounted at most every 15 s; a count only; moves no value');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00000a110b01', '000000c0-0000-0000-0000-00000a110b02',
                               '000000c0-0000-0000-0000-00000a110b03', '000000c0-0000-0000-0000-00000a110b04']::uuid[];
  v jsonb; v_i int; v_n0 bigint;
begin
  begin
    for v_i in 1 .. 4 loop
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'players-online §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(a): probe character % was not made', v_i; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    update public.hr_players_online_cache set at = '-infinity';
    v := public.hr_players_online();
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the read answered %', v; end if;
    v_n0 := (v->>'online')::bigint;
    -- (a) two players seen now count; a quiet one and a stale one do not.
    insert into public.social_presence (user_id, slot, seen_at) values
      (v_u[1], 0, now()), (v_u[2], 0, now() - interval '30 seconds'), (v_u[3], 0, now()), (v_u[4], 0, now() - interval '2 minutes')
      on conflict (user_id) do update set slot = excluded.slot, seen_at = excluded.seen_at;
    update public.player_state set presence_quiet = true where user_id = v_u[3] and slot = 0;
    update public.hr_players_online_cache set at = '-infinity';
    v := public.hr_players_online();
    if (v->>'online')::bigint <> v_n0 + 2 then raise exception 'VERIFY(a): % online, wanted % (two fresh, one quiet, one stale)', v->>'online', v_n0 + 2; end if;
    -- (b) THE SHARED COUNT: inside 15 s a new player is not recounted (one count serves every ask) ...
    update public.player_state set presence_quiet = false where user_id = v_u[3] and slot = 0;
    v := public.hr_players_online();
    if (v->>'online')::bigint <> v_n0 + 2 then raise exception 'VERIFY(b): a fresh count was recounted inside 15 s: %', v; end if;
    -- ... and past it, it is.
    update public.hr_players_online_cache set at = now() - interval '16 seconds';
    v := public.hr_players_online();
    if (v->>'online')::bigint <> v_n0 + 3 then raise exception 'VERIFY(b): a stale count was not recounted: %', v; end if;
    -- (c) a count only: the answer carries exactly ok + online.
    if (select array_agg(k order by k) from jsonb_object_keys(v) k) is distinct from array['ok', 'online'] then
      raise exception 'VERIFY(c): the answer carries more than a count: %', v; end if;
    -- (d) signed out: refused.
    perform set_config('request.jwt.claim.sub', '', true);
    v := public.hr_players_online();
    if v->>'error' is distinct from 'not_signed_in' then raise exception 'VERIFY(d): a signed-out ask answered %', v; end if;
    raise exception using errcode = 'HR892', message = 'players-online §4 complete - rolling back';
  exception when sqlstate 'HR892' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.social_presence where user_id = any (v_u)) then
    raise exception 'VERIFY(e): §4 LEAKED a probe row'; end if;
  if (select count(*) from public.hr_players_online_cache) <> 1 then raise exception 'VERIFY(e): the cache is not one row'; end if;
  if has_function_privilege('anon', 'public.hr_players_online()', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_players_online()', 'execute') then
    raise exception 'VERIFY(e): hr_players_online grants are wrong'; end if;
  if has_table_privilege('authenticated', 'public.hr_players_online_cache', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.hr_players_online_cache', 'select,insert,update,delete') then
    raise exception 'VERIFY(e): a client role reaches the cache row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'players-online: a count of players seen in 75 s, quiet ones out, one shared count per 15 s; all green';
end $$;
