-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-25-town-walk.sql — WHERE PEOPLE STAND IN THE COMMON: THE TOWN
--   PRESENCE GAINS POSITIONS, SO TWO PLAYERS IN TOWN SEE EACH OTHER WALK.
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/town-presence (Tyler 10-18: "he and
-- Andy can't see each other"). The game is CLOSED: applies on its passing §6
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC); Security reviews it with every closed-mode surface at the
-- reopen gate. ORDER: right after 2026-10-25-social.sql (§0 refuses without its
-- block and name helpers). No edge. No value moves.
--
-- ── WHICH PRESENCE THIS EXTENDS (one system, not a third) ────────────────────
-- "Who is in town" is 2026-09-13-town-presence.sql: the town_presence flag,
-- presence_quiet, hr_town_zone and the plaza read hr_town_of (25 s snapshot, a
-- level band, no ids — a text plaza). It cannot carry a walk: the snapshot is
-- rebuilt by cron every 25 s and its projection deliberately names nobody's
-- account. This file adds the WHERE to that system — a position per account on
-- one of the zone's walk maps — under the same flag, the same opt-out and the
-- same zone, and reads it through its own small projection. It does NOT stamp
-- player_state.last_seen_at (that column is the world tick's online signal,
-- 2026-10-14-world-tick-presence-signal.sql; walking in town must not change how
-- the engine ticks anybody). social_presence (2026-10-25-social.sql) is the
-- friends' online dot; the overlap of the three stamps is CONFLICTS.md
-- 2026-10-18 town-presence.
--
-- ── THE TABLES ─────────────────────────────────────────────────────────────
--   hr_town_maps    THE CATALOGUE: a walkable town map (the client's
--                   src/data/world/maps row id), the zone it belongs to and its
--                   size in tiles. A new town is a row. No client grant.
--   town_positions  one row per ACCOUNT (an account's characters are one body in
--                   town, as in the plaza): the publishing slot, the map, the
--                   tile it stands on, the tile it walks to and its facing,
--                   stamped with the SERVER clock. UNLOGGED: a position is worth
--                   zero bytes of WAL — after a crash every client re-publishes
--                   within its keepalive. No client grant.
--
-- ── THE RPCs (definer; hr_access_check first; hr_rate_ok budgets) ──────────
--   hr_town_move(p_slot, p_map, p_x, p_y, p_gx, p_gy, p_dir)
--        publish the caller's OWN position (auth.uid(); the signature carries no
--        user and no time). p_map null LEAVES town (the row is deleted). Refused
--        bad_map (not a catalogue town), bad_position (off the map, or a facing
--        that is not n/s/e/w), no_character, hunting (an open hunt session: a
--        hunter is not in town, and leaves it). A write inside c_floor of the
--        last is answered {ok, stamped:false} and writes nothing. 90/min.
--   hr_town_walkers(p_map)
--        the people on that map now: fresh positions only (c_fresh), never the
--        caller's own account, never a quiet character, never a hunter, never a
--        non-admitted account, never anyone either side has blocked; newest
--        first, at most c_cap. Each walker carries EXACTLY
--          id, slot, name, level, role, x, y, gx, gy, dir, age_ms
--        — the account id and slot are what every chat line already carries
--        (from_id, from_slot) and what the player menu targets; name, combat
--        level and role are the server's (the chat stamp's helpers); the tile
--        numbers are the walker's own, bounded by the catalogue. 45/min.
--
-- ── WHAT A FORGED CLIENT CAN DO ─────────────────────────────────────────────
-- Put its OWN body on any in-bounds tile of a catalogue town, facing n/s/e/w,
-- at most every c_floor. It cannot name another account, a name, a level, a
-- role, a map outside the catalogue or a time. The server does not hold the
-- maps' collision masks, so a forged tile may be inside a hedge: the client
-- draws a walker on the nearest open tile (src/world/town-scene.js).
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- A publish is one primary-key upsert on an unlogged table (≤1/s per account,
-- the client sends one per second while walking and one per 10 s standing).
-- A read is ONE index range scan on (map_id, at desc) bounded by c_scan rows —
-- O(cap), never O(zone population) — then per-row point checks (blocks, quiet,
-- hunt, allowlist) on those ≤c_scan rows. A zone fuller than c_cap shows the
-- c_cap most recent movers; the answer is a second zone, not a bigger scan.
--
-- REVERSIBILITY: drop the two functions and the two tables; delete their
-- hr_client_rpc_baseline rows. Nothing else reads them.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_social_blocked(uuid,uuid)') is null or to_regprocedure('public.hr_social_name(uuid)') is null then
    raise exception 'town-walk §0: apply 2026-10-25-social.sql first';
  end if;
  if to_regprocedure('public.hr_chat_role_pick(uuid,integer)') is null or to_regprocedure('public.hr_bounty_combat_level(uuid,integer)') is null
     or to_regprocedure('public.hr_access_check()') is null or to_regprocedure('public.hr_admitted(uuid)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_flag_on(text)') is null
     or to_regprocedure('public.hr_town_zone()') is null or to_regclass('public.hunt_sessions') is null then
    raise exception 'town-walk §0: the chat, closed-mode, rate, town-presence or hunt-session helpers are absent';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'presence_quiet') then
    raise exception 'town-walk §0: player_state.presence_quiet is absent (2026-09-13-town-presence.sql)';
  end if;
end $mig$;

-- ── §1 THE CATALOGUE ─────────────────────────────────────────────────────────
create table if not exists public.hr_town_maps (
  map_id  text primary key check (map_id ~ '^[a-z0-9_]{1,40}$'),
  zone_id text not null check (zone_id ~ '^[a-z0-9_]{1,40}$'),
  w       smallint not null check (w between 1 and 256),
  h       smallint not null check (h between 1 and 256)
);
alter table public.hr_town_maps enable row level security;
revoke all on public.hr_town_maps from public, anon, authenticated, service_role;
comment on table public.hr_town_maps is
  '2026-10-25-town-walk.sql: the walkable town maps (client map row id), their zone and size in tiles. '
  'Mirrors the kind:''town'' rows of src/data/world/maps (tests/town-walk.mjs asserts the sizes agree).';
insert into public.hr_town_maps (map_id, zone_id, w, h) values ('town_common', 'the_common', 24, 14)
  on conflict (map_id) do update set zone_id = excluded.zone_id, w = excluded.w, h = excluded.h;

-- ── §2 THE POSITIONS ─────────────────────────────────────────────────────────
create unlogged table if not exists public.town_positions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slot    smallint not null check (slot between 0 and 32),
  map_id  text not null references public.hr_town_maps (map_id) on delete cascade,
  x       smallint not null check (x between 0 and 255),
  y       smallint not null check (y between 0 and 255),
  gx      smallint not null check (gx between 0 and 255),
  gy      smallint not null check (gy between 0 and 255),
  dir     text not null check (dir in ('n', 's', 'e', 'w')),
  at      timestamptz not null default now()
);
create index if not exists town_positions_map_at on public.town_positions (map_id, at desc);
alter table public.town_positions enable row level security;
revoke all on public.town_positions from public, anon, authenticated, service_role;
comment on table public.town_positions is
  '2026-10-25-town-walk.sql: where each account''s body stands in town (one per account), server-stamped. '
  'Written only by hr_town_move, read only by hr_town_walkers. Unlogged: ephemeral display presence.';

-- ── §3 hr_town_move — PUBLISH YOUR OWN POSITION ─────────────────────────────
create or replace function public.hr_town_move(p_slot int, p_map text, p_x int, p_y int, p_gx int, p_gy int, p_dir text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
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
end $$;

-- ── §4 hr_town_walkers — WHO STANDS ON THIS MAP NOW ─────────────────────────
create or replace function public.hr_town_walkers(p_map text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
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
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'cap', c_cap, 'walkers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.user_id, 'slot', w.slot,
             'name', public.hr_social_name(w.user_id),
             'level', public.hr_bounty_combat_level(w.user_id, w.slot),
             'role', public.hr_chat_role_pick(w.user_id, w.slot),
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
             order by c.at desc limit c_cap) w), '[]'::jsonb));
end $$;

-- ── §5 GRANTS AND THE BASELINE ──────────────────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_town_move(integer,text,integer,integer,integer,integer,text)',
                           'public.hr_town_walkers(text)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_town_move', 'hr_town_walkers');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_town_move', 'p_slot integer, p_map text, p_x integer, p_y integer, p_gx integer, p_gy integer, p_dir text', 'authenticated',
   'added 2026-10-25 (town-walk): publish the caller''s own town position (catalogue map, in bounds, n/s/e/w); null map leaves; refused while hunting; 250 ms floor, 90/min'),
  ('hr_town_walkers', 'p_map text', 'authenticated',
   'added 2026-10-25 (town-walk): who stands on a town map now (fresh 30 s, cap 40): id, slot, name, level, role, tiles, facing; never self, quiet, hunters, blocked either way, non-admitted; 45/min');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-00000c4a9001';
  v_b constant uuid := '000000c0-0000-0000-0000-00000c4a9002';
  v_c constant uuid := '000000c0-0000-0000-0000-00000c4a9003';
  v_x constant uuid := '000000c0-0000-0000-0000-00000c4a9004';   -- NOT allowlisted
  v jsonb; v_w jsonb; v_err text; v_u uuid; v_flag boolean;
  c_keys constant text := 'age_ms,dir,gx,gy,id,level,name,role,slot,x,y';
begin
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'town-walk §6')
      on conflict (key) do update set enabled = true;
    insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'town-walk §6')
      on conflict (key) do update set enabled = true;
    foreach v_u in array array[v_a, v_b, v_c, v_x] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Walker' || right(v_u::text, 1))
        on conflict (id) do update set display_name = excluded.display_name;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      if v_u <> v_x then
        insert into public.hr_access_allowlist (user_id, note) values (v_u, 'town-walk §6 probe') on conflict (user_id) do nothing;
        v := public.hr_create_character(0);
        if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-walk §6(a): hr_create_character refused: %', v; end if;
      end if;
    end loop;

    -- (a) two players in the Common see each other, as the server names them.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_town_move(0, 'town_common', 5, 8, 9, 8, 'e');
    if v->>'stamped' is distinct from 'true' then raise exception 'town-walk §6(a): a''s publish is %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_town_move(0, 'town_common', 12, 9, 12, 9, 's');
    if v->>'stamped' is distinct from 'true' then raise exception 'town-walk §6(a): b''s publish is %', v; end if;
    v := public.hr_town_walkers('town_common');
    v_w := v->'walkers';
    if jsonb_array_length(coalesce(v_w, '[]')) <> 1 or (v_w->0->>'id')::uuid <> v_a or v_w->0->>'name' <> 'Walker1'
       or (v_w->0->>'x')::int <> 5 or (v_w->0->>'gx')::int <> 9 or v_w->0->>'dir' <> 'e' or (v_w->0->>'slot')::int <> 0
       or (v_w->0->>'level')::int is distinct from public.hr_bounty_combat_level(v_a, 0) then
      raise exception 'town-walk §6(a): b sees %', v; end if;
    -- EXACTLY the allowlisted keys.
    if (select string_agg(k, ',' order by k) from jsonb_object_keys(v_w->0) k) <> c_keys then
      raise exception 'town-walk §6(a): a walker carries keys %', (select string_agg(k, ',' order by k) from jsonb_object_keys(v_w->0) k); end if;

    -- (b) the floor: an immediate second publish writes nothing.
    v := public.hr_town_move(0, 'town_common', 13, 9, 13, 9, 's');
    if v->>'stamped' is distinct from 'false' or (select x from public.town_positions where user_id = v_b) <> 12 then
      raise exception 'town-walk §6(b): the floor let % through', v; end if;

    -- (c) the catalogue bounds the position.
    if public.hr_town_move(0, 'town_common', 24, 0, 0, 0, 's')->>'error' is distinct from 'bad_position'
       or public.hr_town_move(0, 'town_common', 0, 0, 0, 14, 's')->>'error' is distinct from 'bad_position'
       or public.hr_town_move(0, 'town_common', 0, 0, 0, 0, 'up')->>'error' is distinct from 'bad_position'
       or public.hr_town_move(0, 'nowhere', 0, 0, 0, 0, 's')->>'error' is distinct from 'bad_map'
       or public.hr_town_move(3, 'town_common', 0, 0, 0, 0, 's')->>'error' is distinct from 'no_character'
       or public.hr_town_walkers('nowhere')->>'error' is distinct from 'bad_map' then
      raise exception 'town-walk §6(c): an out-of-catalogue position was accepted'; end if;
    -- The signature carries no user and no time: nobody can publish for another account.
    if exists (select 1 from pg_proc p, unnest(p.proargtypes) t
                where p.oid = 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure
                  and t in ('uuid'::regtype, 'timestamptz'::regtype, 'timestamp'::regtype)) then
      raise exception 'town-walk §6(c): hr_town_move takes a user or a time'; end if;

    -- (d) a block hides both ways.
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    perform public.hr_town_move(0, 'town_common', 3, 3, 3, 3, 'n');
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_block_set(v_c::text, true);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'town-walk §6(d): hr_block_set refused %', v; end if;
    if public.hr_town_walkers('town_common')->'walkers' @> jsonb_build_array(jsonb_build_object('id', v_c)) then
      raise exception 'town-walk §6(d): a sees the player a blocked'; end if;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.hr_town_walkers('town_common')->'walkers';
    if v @> jsonb_build_array(jsonb_build_object('id', v_a)) or not v @> jsonb_build_array(jsonb_build_object('id', v_b)) then
      raise exception 'town-walk §6(d): c (blocked by a) sees %', v; end if;

    -- (e) quiet hides; (f) a hunter is not in town and cannot publish into it.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    update public.player_state set presence_quiet = true where user_id = v_b and slot = 0;
    if public.hr_town_walkers('town_common')->'walkers' @> jsonb_build_array(jsonb_build_object('id', v_b)) then
      raise exception 'town-walk §6(e): a quiet character is listed'; end if;
    update public.player_state set presence_quiet = false where user_id = v_b and slot = 0;
    insert into public.hunt_sessions (user_id, slot, hunt_id, falls_limit, hunt_from, settled_to, next_swing_at)
      values (v_b, 0, 'townwalkprobe', 3, now(), now(), now());
    if public.hr_town_walkers('town_common')->'walkers' @> jsonb_build_array(jsonb_build_object('id', v_b)) then
      raise exception 'town-walk §6(f): a hunter is listed in town'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_town_move(0, 'town_common', 1, 1, 1, 1, 's');
    if v->>'error' is distinct from 'hunting' or exists (select 1 from public.town_positions where user_id = v_b) then
      raise exception 'town-walk §6(f): a hunter published into town: %', v; end if;

    -- (g) leaving removes the body; (h) a stale position is gone.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_town_move(0, null, null, null, null, null, null);
    if v->>'left' is distinct from 'true' or exists (select 1 from public.town_positions where user_id = v_a) then
      raise exception 'town-walk §6(g): leaving left %', v; end if;
    insert into public.town_positions (user_id, slot, map_id, x, y, gx, gy, dir, at)
      values (v_a, 0, 'town_common', 2, 2, 2, 2, 's', now() - interval '31 seconds');
    delete from public.chat_blocks where blocker_id = v_a;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    if public.hr_town_walkers('town_common')->'walkers' @> jsonb_build_array(jsonb_build_object('id', v_a)) then
      raise exception 'town-walk §6(h): a stale position is listed'; end if;

    -- (i) the rate limits.
    update public.hr_rate_counters set n = 45, window_start = now() where user_id = v_c and bucket = 'town_walk';
    if public.hr_town_walkers('town_common')->>'error' is distinct from 'rate_limited' then
      raise exception 'town-walk §6(i): the 46th read in a minute was answered'; end if;
    insert into public.hr_rate_counters (user_id, bucket, window_start, n) values (v_c, 'town_move', now(), 90)
      on conflict (user_id, bucket) do update set n = 90, window_start = now();
    if public.hr_town_move(0, 'town_common', 4, 4, 4, 4, 's')->>'error' is distinct from 'rate_limited' then
      raise exception 'town-walk §6(i): the 91st publish in a minute was taken'; end if;

    -- (j) the flag closes both verbs; (k) closed mode refuses a non-allowlisted caller.
    select enabled into v_flag from public.hr_flags where key = 'town_presence';
    update public.hr_flags set enabled = false where key = 'town_presence';
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if public.hr_town_walkers('town_common')->>'off' is distinct from 'true' then
      raise exception 'town-walk §6(j): the flag does not close the read'; end if;
    update public.hr_flags set enabled = v_flag where key = 'town_presence';
    perform set_config('request.jwt.claim.sub', v_x::text, true);
    v_err := null;
    begin perform public.hr_town_walkers('town_common'); exception when sqlstate 'PGRST' then v_err := sqlerrm; end;
    if v_err is null or position('hr_closed' in v_err) = 0 then raise exception 'town-walk §6(k): hr_town_walkers admitted a closed caller'; end if;
    v_err := null;
    begin perform public.hr_town_move(0, 'town_common', 1, 1, 1, 1, 's'); exception when sqlstate 'PGRST' then v_err := sqlerrm; end;
    if v_err is null then raise exception 'town-walk §6(k): hr_town_move admitted a closed caller'; end if;
    raise exception using errcode = 'HR872', message = 'town-walk §6 complete - rolling back';
  exception when sqlstate 'HR872' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_positions where user_id in (v_a, v_b, v_c, v_x))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c)) then
    raise exception 'town-walk §6: a probe row leaked'; end if;
  if has_table_privilege('authenticated', 'public.town_positions', 'select') or has_table_privilege('authenticated', 'public.town_positions', 'insert')
     or has_table_privilege('anon', 'public.town_positions', 'select') or has_table_privilege('authenticated', 'public.hr_town_maps', 'select')
     or has_function_privilege('anon', 'public.hr_town_walkers(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_walkers(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'execute') then
    raise exception 'town-walk §6: the grants are not exact'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-walk: own position only, catalogue-bounded, floored and rate-gated; walkers fresh, capped, never self/quiet/hunting/blocked/closed; all green';
end $mig$;
