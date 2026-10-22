-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HOW MANY PLAYERS ARE ONLINE, AS THE SERVER COUNTS THEM (lane
-- b-death-equip-online, systems-engineer, 2026-10-21; tracker r16). STAGED, NOT
-- APPLIED. Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- A small "N online" counter on the screen. Tyler 2026-10-20: "total number of
-- players online, even if it's 1 person on 2 characters": ONE number counting
-- PLAYING CHARACTERS (one person on two heroes is 2). The number must be the
-- server's, and a COUNT only: no id, name or slot of anyone leaves.
--
-- ── WHERE THE PRESENCE COMES FROM ───────────────────────────────────────────
-- No existing stamp is per character AND side-effect free:
--   player_state.last_seen_at  per character, but it is the world tick's online
--                              signal (it changes how often hunts are flushed);
--                              a counter must not change how the engine ticks
--                              anybody (2026-10-25-town-walk.sql made the same call)
--   social_presence            one row per ACCOUNT (the friends' online dot)
--   town_positions             only characters standing in town, never a hunter
-- So the count gets its own small home: character_presence (user, slot, seen_at),
-- stamped by this verb for the caller's OWN open characters (the client names
-- the slots it has open; a slot the caller does not own is never written).
--
-- ── SCALE ───────────────────────────────────────────────────────────────────
-- Every open client asks every 30 s (its social poll). The stamp is one upsert
-- per own character with a 20 s floor. The count is computed at most once per
-- 15 s for EVERYONE (one row, hr_players_online_cache), never once per ask, as
-- an index range scan over the fresh rows only (character_presence_seen_at).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   §1 table character_presence + index; table hr_players_online_cache (one
--      row). Both RLS on, no client grant.
--   §2 hr_players_online(p_slots int[]) (authenticated): stamps the caller's own
--      named characters present, answers { ok, online } = characters seen in the
--      last 75 s, characters set to appear offline (presence_quiet) left out.
--      6 asks / min / account. Moves no value.
--   §3 the client RPC baseline row.
-- REVERSIBILITY: drop the function, both tables and the baseline row.
-- ORDER: after 2026-11-07-death-popup-blessing.sql (no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (the live shapes this file reads; it restates no body) ───────────
do $mig$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state'
                  and column_name = 'presence_quiet' and data_type = 'boolean') then
    raise exception 'PIN: player_state.presence_quiet is missing'; end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_access_check()') is null then
    raise exception 'PIN: hr_rate_ok(uuid,text,int,interval) / hr_access_check() are missing'; end if;
end $mig$;

-- ── §1 THE PRESENCE ROWS AND THE CACHE ROW ───────────────────────────────────
create table if not exists public.character_presence (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot    smallint not null check (slot between 0 and 32),
  seen_at timestamptz not null,
  primary key (user_id, slot)
);
create index if not exists character_presence_seen_at on public.character_presence (seen_at);
alter table public.character_presence enable row level security;
revoke all on public.character_presence from public, anon, authenticated, service_role;

create table if not exists public.hr_players_online_cache (
  id boolean primary key default true check (id),
  n  integer not null default 0 check (n >= 0),
  at timestamptz not null default '-infinity'
);
alter table public.hr_players_online_cache enable row level security;
revoke all on public.hr_players_online_cache from public, anon, authenticated, service_role;
insert into public.hr_players_online_cache (id) values (true) on conflict (id) do nothing;

-- ── §2 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_players_online(p_slots int[])
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- PLAYERS-ONLINE (2026-11-07-players-online.sql)
  c_floor  constant interval := interval '20 seconds';   -- one stamp per character per floor
  c_online constant interval := interval '75 seconds';   -- online = seen within (hr_social_state's window)
  c_fresh  constant interval := interval '15 seconds';   -- how old the shared count may be
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slots is not null and (cardinality(p_slots) > 8 or exists (select 1 from unnest(p_slots) s where s is null or s < 0 or s > 32)) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'online', 6, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- The caller's OWN characters only (a player_state row), never a slot it does not hold.
  if p_slots is not null and cardinality(p_slots) > 0 then
    insert into public.character_presence as cp (user_id, slot, seen_at)
      select ps.user_id, ps.slot, now() from public.player_state ps where ps.user_id = v_uid and ps.slot = any (p_slots)
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at
      where cp.seen_at < now() - c_floor or cp.seen_at > now() + interval '60 seconds';
  end if;
  -- One ask per c_fresh recounts for everyone; a concurrent ask waits on the row, then finds it fresh.
  update public.hr_players_online_cache c
     set n = (select count(*) from public.character_presence cp
               where cp.seen_at > now() - c_online and cp.seen_at <= now() + interval '60 seconds'
                 and not exists (select 1 from public.player_state ps
                                  where ps.user_id = cp.user_id and ps.slot = cp.slot and ps.presence_quiet)),
         at = now()
   where c.id and c.at < now() - c_fresh
  returning c.n into v_n;
  if v_n is null then select c.n into v_n from public.hr_players_online_cache c where c.id; end if;
  return jsonb_build_object('ok', true, 'online', coalesce(v_n, 0));
end $$;

revoke execute on function public.hr_players_online(int[]) from public;
revoke execute on function public.hr_players_online(int[]) from anon, service_role;
grant  execute on function public.hr_players_online(int[]) to authenticated;

-- ── §3 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_players_online';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_players_online', 'p_slots integer[]', 'authenticated',
   'added 2026-11-07: stamps the caller''s own open characters present (20 s floor) and answers the count of characters seen in 75 s (quiet ones out), shared and recounted at most every 15 s; a count only; moves no value');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00000a110b01', '000000c0-0000-0000-0000-00000a110b02']::uuid[];
  v jsonb; v_i int; v_n0 bigint;
begin
  begin
    for v_i in 1 .. 2 loop
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'players-online §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
        raise exception 'VERIFY(a): probe characters for % were not made', v_i; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    update public.hr_players_online_cache set at = '-infinity' where id;
    v := public.hr_players_online(null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): a bare read answered %', v; end if;
    v_n0 := (v->>'online')::bigint;
    -- (a) ONE PERSON ON TWO CHARACTERS IS 2; a slot the caller does not own (2) is never written.
    update public.hr_players_online_cache set at = '-infinity' where id;
    v := public.hr_players_online(array[0, 1, 2]);
    if (v->>'online')::bigint <> v_n0 + 2 then raise exception 'VERIFY(a): two own characters read % online, wanted %', v->>'online', v_n0 + 2; end if;
    if exists (select 1 from public.character_presence where user_id = v_u[1] and slot = 2) then
      raise exception 'VERIFY(a): a slot the caller does not own was stamped'; end if;
    -- (b) the stamp has a floor: an ask inside 20 s writes nothing.
    update public.character_presence set seen_at = now() - interval '5 seconds' where user_id = v_u[1];
    perform public.hr_players_online(array[0, 1]);
    if exists (select 1 from public.character_presence where user_id = v_u[1] and seen_at = now()) then
      raise exception 'VERIFY(b): a stamp inside the floor was written'; end if;
    -- (c) THE SHARED COUNT: another player's character inside 15 s is not recounted ... and past it, it is.
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_players_online(array[0]);
    if (v->>'online')::bigint <> v_n0 + 2 then raise exception 'VERIFY(c): a fresh count was recounted inside 15 s: %', v; end if;
    update public.hr_players_online_cache set at = now() - interval '16 seconds' where id;
    v := public.hr_players_online(array[0]);
    if (v->>'online')::bigint <> v_n0 + 3 then raise exception 'VERIFY(c): a stale count was not recounted: %', v; end if;
    -- (d) a character set to appear offline, and one not seen for 2 minutes, are not counted.
    update public.player_state set presence_quiet = true where user_id = v_u[2] and slot = 0;
    update public.character_presence set seen_at = now() - interval '2 minutes' where user_id = v_u[1] and slot = 1;
    update public.hr_players_online_cache set at = '-infinity' where id;
    v := public.hr_players_online(null);
    if (v->>'online')::bigint <> v_n0 + 1 then raise exception 'VERIFY(d): quiet / stale characters counted: % online, wanted %', v->>'online', v_n0 + 1; end if;
    -- (e) a count only: the answer carries exactly ok + online; bad slot lists are refused.
    if (select array_agg(k order by k) from jsonb_object_keys(v) k) is distinct from array['ok', 'online'] then
      raise exception 'VERIFY(e): the answer carries more than a count: %', v; end if;
    if public.hr_players_online(array[0, 40])->>'error' is distinct from 'bad_slot'
       or public.hr_players_online(array[0, 1, 2, 3, 4, 5, 6, 7, 8])->>'error' is distinct from 'bad_slot' then
      raise exception 'VERIFY(e): a bad slot list was taken'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    if public.hr_players_online(null)->>'error' is distinct from 'not_signed_in' then raise exception 'VERIFY(e): a signed-out ask was answered'; end if;
    raise exception using errcode = 'HR892', message = 'players-online §4 complete - rolling back';
  exception when sqlstate 'HR892' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.character_presence where user_id = any (v_u)) then
    raise exception 'VERIFY(f): §4 LEAKED a probe row'; end if;
  if (select count(*) from public.hr_players_online_cache) <> 1 then raise exception 'VERIFY(f): the cache is not one row'; end if;
  if has_function_privilege('anon', 'public.hr_players_online(integer[])', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_players_online(integer[])', 'execute') then
    raise exception 'VERIFY(f): hr_players_online grants are wrong'; end if;
  if has_table_privilege('authenticated', 'public.character_presence', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.character_presence', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.hr_players_online_cache', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.hr_players_online_cache', 'select,insert,update,delete') then
    raise exception 'VERIFY(f): a client role reaches the presence or cache rows'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'players-online: own characters stamped, one person on two characters is 2, quiet and stale out, one shared count per 15 s; all green';
end $$;
