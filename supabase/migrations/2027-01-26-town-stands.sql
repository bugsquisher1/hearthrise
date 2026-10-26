-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EVERY BODY IN TOWN STANDS ON ITS OWN STAND, PLACED BY THE
--   SERVER; TOWN INSTANCES OF 60 PLAYERS; A WINDOWED, DELTA TOWN READ.
--   (lane/c-town-stands, backend-architect, 2026-10-25; the real-town plan
--   L2, docs/planning/PRIORITY_BOARD.md "Real town plan (2026-10-25)" rev 2.)
--
-- STATUS: STAGED, NOT APPLIED. Pre-EA rules (CLAUDE.md §2): applies on its
-- passing §6; this surface is on the EA Security review list. ORDER: after
-- 2027-01-26-town-stations.generated.sql (§0 refuses without the catalogue).
-- EDGE: none (no value moves; the engine is untouched).
--
-- ── WHY (the root cause, measured) ───────────────────────────────────────────
-- town_common has ONE start tile. Every hero back from a hunt and every
-- UNVIEWED hero stood on it (src/session/town-presence.js stand(this._arrival)),
-- and the server stored whatever tile the client published (hr_town_move,
-- 2026-10-25-town-walk.sql): 4 heroes and every peer on one tile. And the read
-- (hr_town_walkers) capped at 40 walkers / 80 rows of the whole map, so a town
-- of 60 players could never show its people.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- WHERE A BODY STANDS IS THE SERVER'S. town_bodies holds, per character, the
-- (map, instance, station, stand) it stands on, under a UNIQUE partial index
-- (map, inst, station, stand): no two bodies, of one account or of anyone,
-- ever hold one stand. The station comes from the hero's ACTIVITY POINTER
-- (player_state.active_kind / active_id) through the generated catalogue's one
-- resolver (hr_town_station_for: id, then skill, then kind; else the idle
-- station); the stand is the station's lowest free one, then its overflow,
-- then the nearest free bench, then the nearest free stand anywhere. The
-- catalogue sizes every instance (floor(stands / heroes) seats at most), so a
-- free stand always exists. A hero that steers (hr_town_move, unchanged rules)
-- is drawn on its steered tile while it moved since it took its stand; a
-- PARKED or OFFLINE hero is drawn on its stand. Nothing here is a number
-- anyone can spend: it is display presence, and no output waits on it.
--   WHEN IT MOVES: every write of the activity pointer (hr_apply's
--   set_activity, hr_hunt_point's start and end, the settle's resume, any
--   future writer) is NOTED by the AFTER trigger hr_town_note_move into the
--   append-only town_moves. The note is an INSERT and nothing else: a settle
--   takes no town lock and waits on no town row, so a town fault can never
--   slow or refuse a settle. The town's own RPCs apply the notes
--   (hr_town_moves_settle): a hunt start releases the body (a hunter is not in
--   town); a hunt end sets it down on its hunt's ARRIVE station (kept in town
--   30 s from the end, an open browser keeps it), or, when the settle resumed
--   a town activity, on that activity's station walking from the arrival; a
--   new town activity moves it to its station walking from where it stood; a
--   stop leaves it standing where it is (Tyler 10-19: it never walks on its
--   own). The hero's own client also sends it to a counter (hr_town_go).
--   WHO IS IN TOWN: a body is drawn while it holds a stand, is not hunting, not
--   quiet, admitted, and is either WORKING a town activity (gather, artisan,
--   training: the server is playing it, browser open or not) or PRESENT (a
--   keepalive in 30 s: hr_town_here for a parked hero, hr_town_move for the
--   viewed one). An idle hero whose browser closed lets go of its stand within
--   30 s (swept by the next placement in its instance).
-- INSTANCES. A town map's players are split into instances of `players` (60)
-- accounts, each fielding at most `heroes` (4) bodies; an account's heroes
-- always share one instance. A player's first body on a map takes, under the
-- map lock: its party LEADER's instance (room up to the hard cap
-- floor(stands / heroes)), else a party mate's, else the instance most of its
-- friends stand in (room up to the soft cap = players), else the lowest
-- instance with room, else a new one (the 61st player opens instance 2). An
-- account seated apart from its party's leader moves to the leader's
-- instance on its next keepalive when there is room (never the leader's).
-- THE READ. hr_town_view(p_slot, p_map, p_cx, p_cy, p_cursor, p_pcx, p_pcy):
-- the viewer's INSTANCE only, its VIEW (view_w x view_h around the centre the
-- client names) plus `margin` tiles each side, at most `view_cap` (120)
-- bodies, the viewer's own account, party and friends first, then nearest.
-- With a cursor (the `cursor` of its last answer, at most 60 s old) it returns
-- only the bodies that CHANGED since (5 s slack for commit order) or entered
-- the window, plus `gone` (left, hunting, released, gone quiet, presence
-- expired); with none, a full answer (`full: true`, the client replaces its
-- list). A delta that would exceed the cap is answered full. Each walker
-- carries EXACTLY id, slot, name, level, role, outfit, x, y, gx, gy, dir,
-- age_ms (as hr_town_walkers) + station, work; `me` is the viewer's own
-- server stand. 45/min (bucket town_view).
-- THE VERBS (all definer; hr_access_check first; own character only):
--   hr_town_here(p_slot, p_map)       a parked hero is present (no tile): its
--        keepalive, placed from its pointer when it has no stand; answers `me`.
--        30/min (town_here). Refused: not_signed_in, rate_limited,
--        no_character, bad_map, hunting; {ok, off} while the flag is off.
--   hr_town_go(p_slot, p_station)     send the body to a visit, idle or bench
--        station (a counter, the green), or with a null station back to its
--        activity's station; answers `me`. 20/min (town_go). Refused as above
--        + unknown_station (no such station, or a work/arrive station).
--   hr_town_move (RESTATED WHOLE, pinned): as 2026-10-31-town-bodies-per-
--        character.sql + a body is placed on the first publish; moved_at is
--        stamped only when the tile, goal or facing changes (a keepalive is not
--        a move); a leave releases an IDLE body (a working one stays at its
--        station: the server is playing it).
--   hr_town_walkers is UNTOUCHED (the live client reads it until the client
--        half ships; cut it after: a follow-up).
-- ERRORS (the full taxonomy): not_signed_in, rate_limited, no_character,
--   bad_map, bad_position, hunting, unknown_station, too_many_bodies (a 5th
--   body of one account: not drawn), town_full (unreachable: the seat cap).
--
-- ── CONCURRENCY ──────────────────────────────────────────────────────────────
-- ONE advisory lock per town map (hr_town_lock) serialises every stand
-- allocation and every first seat on that map; body rows are locked after it,
-- never before; nothing that holds a body row waits on the map lock (a leave
-- updates its own row and ends). No player_state row is ever locked by town
-- code, and the trigger only inserts: no cycle with any settle exists. The
-- unique index is the backstop: a defect in the locking fails loudly, it never
-- seats two bodies on one stand. A read takes the lock only to place its own
-- viewer (rare) and to apply pending notes AFTER its read query, so the lock
-- is never held across a read. Idempotent by construction: placing a body at
-- the station it already holds writes nothing; replays are safe.
--
-- ── EXPOSURE (the EA Security review's surface) ──────────────────────────────
-- A viewer learns, for the bodies in its own instance and window, what
-- hr_town_walkers already told it (+ the station it stands at and whether it
-- works: both visible in the world itself). It may name any window centre:
-- bounded by the cap and the rate. It cannot choose an instance, a stand, a
-- tile for a parked body, another character, a time or a party. hr_town_go
-- names only visit/idle/bench stations of the body's own map. No value, rank
-- or shared surface moves.
--
-- ── COST (100x players: ~600 accounts, ~2,400 heroes, 10 instances) ───────────
-- town_bodies: one row per character ever in town (~2,400 rows, ~200 B),
-- written on activity changes and first appearances (a few a second), never
-- per tick. town_moves: one ~100 B row per activity change, deleted when
-- applied (the next town read). town_seen: unlogged, one row per parked hero.
-- A read scans ONE instance (<= 240 held bodies + tombstones changed in the
-- last 65 s) through the partial index, then per row point probes; measured in
-- tests/town-stands.mjs --load. A placement scans the map's stands (<= ~600)
-- once. The first seat of an account scans the map's held bodies (O(map));
-- a seat table is the step up if one map ever holds > ~50 instances.
--
-- REVERSIBILITY: drop the two triggers, the RPCs hr_town_here / hr_town_go /
-- hr_town_view and the owner-only helpers; re-apply hr_town_move from
-- 2026-10-31-town-bodies-per-character.sql; drop town_bodies, town_seen,
-- town_moves and town_positions.moved_at; delete the three baseline rows. The
-- catalogue file reverts on its own. Nothing else reads them.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_town_stations') is null or to_regclass('public.hr_town_stands') is null
     or to_regclass('public.hr_town_station_hosts') is null
     or to_regprocedure('public.hr_town_station_for(text,text,text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_town_maps' and column_name = 'view_cap') then
    raise exception 'town-stands §0: apply 2027-01-26-town-stations.generated.sql first';
  end if;
  if to_regclass('public.town_positions') is null or to_regclass('public.hunt_sessions') is null
     or to_regclass('public.hunt_parties') is null or to_regclass('public.hunt_party_members') is null
     or to_regclass('public.friend_links') is null or to_regclass('public.player_outfits') is null
     or to_regclass('public.hr_activities') is null or to_regclass('public.hr_hunt_resumable_kinds') is null
     or to_regprocedure('public.hr_access_check()') is null or to_regprocedure('public.hr_admitted(uuid)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_flag_on(text)') is null
     or to_regprocedure('public.hr_social_blocked(uuid,uuid)') is null or to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regprocedure('public.hr_role_view(uuid,integer)') is null
     or to_regprocedure('public.hr_outfit_owned(uuid,integer)') is null or to_regprocedure('public.hr_hunt_point(uuid,integer,text)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'town-stands §0: a town, party, social, closed-mode, rate, look or hunt helper is absent';
  end if;
  -- hr_town_move is restated whole: the 2026-10-31-town-bodies-per-character.sql image, or this file's own (a re-apply)
  select prosrc into v_src from pg_proc where oid = 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure;
  if md5(v_src) <> 'fab60ef393f45af62ff46d177f989aba' and strpos(v_src, 'TOWN-STANDS') = 0 then
    raise exception 'PIN: hr_town_move moved (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.town_bodies (
  user_id    uuid        not null,
  slot       smallint    not null,
  map_id     text        not null references public.hr_town_maps (map_id) on delete cascade,
  inst       smallint    not null check (inst between 1 and 9999),
  station_id text        check (station_id ~ '^[a-z0-9_]{1,40}$'),
  stand_no   smallint    check (stand_no between 1 and 999),
  why        text        not null check (why in ('work', 'arrive', 'idle', 'visit', 'gone')),
  since      timestamptz not null default now(),
  from_x     smallint    check (from_x between 0 and 255),
  from_y     smallint    check (from_y between 0 and 255),
  changed_at timestamptz not null default now(),
  primary key (user_id, slot),
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  check ((station_id is null) = (stand_no is null)),
  check ((station_id is null) = (why = 'gone'))
);
-- THE GUARANTEE: one body a stand, in every instance of every town.
create unique index if not exists town_bodies_one_per_stand on public.town_bodies (map_id, inst, station_id, stand_no) where station_id is not null;
create index if not exists town_bodies_released on public.town_bodies (map_id, inst, changed_at) where station_id is null;
comment on table public.town_bodies is
  '2027-01-26-town-stands.sql: the stand each character''s body holds in town (map, instance, station, stand), placed by '
  'the server from its activity pointer; unique per stand. Written only by hr_town_place / hr_town_release (owner-only).';

-- A parked hero's keepalive (no tile). UNLOGGED: a presence is worth zero bytes of WAL.
create unlogged table if not exists public.town_seen (
  user_id uuid        not null,
  slot    smallint    not null,
  seen_at timestamptz not null,
  primary key (user_id, slot)
);

-- The activity pointer's changes, noted by the trigger and applied by the town's next read. APPEND-ONLY for the
-- trigger (an insert waits on nothing); deleted when applied.
create table if not exists public.town_moves (
  id        bigserial   primary key,
  user_id   uuid        not null,
  slot      smallint    not null,
  from_hunt text,                     -- the hunt it came back from (this change ended it), else null
  at        timestamptz not null default now()
);
create index if not exists town_moves_char on public.town_moves (user_id, slot, id);

alter table public.town_positions add column if not exists moved_at timestamptz;

do $mig$
declare v_t text;
begin
  foreach v_t in array array['town_bodies', 'town_seen', 'town_moves'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
  revoke all on sequence public.town_moves_id_seq from public, anon, authenticated, service_role;
end $mig$;

-- ── §2 THE RULES (owner-only) ────────────────────────────────────────────────
-- The town activities: a hero doing one is in town for everyone, browser open or not (the server plays it).
-- §6 asserts this is exactly hr_hunt_resumable_kinds.
create or replace function public.hr_town_work_kind(p_kind text)
returns boolean language sql immutable set search_path = public, pg_catalog as $fn$
  select coalesce(p_kind in ('gather', 'artisan', 'training'), false)
$fn$;

-- LIVE: in town now. Working a town activity, or present (a keepalive or a publish in 30 s); never while hunting.
create or replace function public.hr_town_live_of(p_kind text, p_seen timestamptz, p_hunting boolean)
returns boolean language sql stable set search_path = public, pg_catalog as $fn$
  select not coalesce(p_hunting, false)
     and (public.hr_town_work_kind(p_kind) or coalesce(p_seen > now() - interval '30 seconds', false))
$fn$;

create or replace function public.hr_town_live(p_user uuid, p_slot int)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $fn$
  select public.hr_town_live_of(
    (select ps.active_kind from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),
    greatest((select ts.seen_at from public.town_seen ts where ts.user_id = p_user and ts.slot = p_slot),
             (select tp.at from public.town_positions tp where tp.user_id = p_user and tp.slot = p_slot)),
    exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null))
$fn$;

-- The map lock: every stand allocation and every first seat on a town map, one at a time.
create or replace function public.hr_town_lock(p_map text)
returns void language sql volatile set search_path = public, pg_catalog as $fn$
  select pg_advisory_xact_lock(hashtextextended('hr_town_stands:' || p_map, 0))
$fn$;

-- WHERE EACH BODY OF AN INSTANCE IS NOW (the one rule, for the read and for `me`): its steered tile while it moved
-- since it took its stand (a fresh publish), else walking from where it came (for the walk's length at 3.2 tiles/s),
-- else its stand. `visible`: holds a stand that exists, not quiet, admitted, live. `changed`: its last visible change.
create or replace function public.hr_town_bodies_at(p_map text, p_inst int, p_since timestamptz, p_user uuid default null, p_slot int default null)
returns table (user_id uuid, slot int, station_id text, stand_no int, why text, since timestamptz,
               x int, y int, gx int, gy int, dir text, sx int, sy int, visible boolean, changed timestamptz, seen_until timestamptz)
language sql stable security definer set search_path = public, pg_catalog as $fn$
  select b.user_id, b.slot::int, b.station_id, b.stand_no::int, b.why, b.since,
         (case when q.steered then tp.x when q.walking then b.from_x else s.x end)::int,
         (case when q.steered then tp.y when q.walking then b.from_y else s.y end)::int,
         (case when q.steered then tp.gx else s.x end)::int,
         (case when q.steered then tp.gy else s.y end)::int,
         case when q.steered then tp.dir else s.dir end,
         s.x::int, s.y::int,
         (b.station_id is not null and s.x is not null and not coalesce(ps.presence_quiet, false)
          and public.hr_admitted(b.user_id) and public.hr_town_live_of(ps.active_kind, q.seen, q.hunting)),
         greatest(b.changed_at, case when q.steered then tp.moved_at end),
         q.seen + interval '30 seconds'
    from (select t.* from public.town_bodies t
           where p_user is null and t.map_id = p_map and t.inst = p_inst and t.station_id is not null
          union all
          select t.* from public.town_bodies t
           where p_user is null and p_since is not null and t.map_id = p_map and t.inst = p_inst
             and t.station_id is null and t.changed_at > p_since
          union all
          select t.* from public.town_bodies t
           where p_user is not null and t.user_id = p_user and t.slot = p_slot) b
    left join public.hr_town_stands s on s.map_id = b.map_id and s.station_id = b.station_id and s.stand_no = b.stand_no
    left join public.town_positions tp on tp.user_id = b.user_id and tp.slot = b.slot
    left join public.town_seen ts on ts.user_id = b.user_id and ts.slot = b.slot
    left join public.player_state ps on ps.user_id = b.user_id and ps.slot = b.slot
    cross join lateral (select
        (tp.user_id is not null and tp.map_id = b.map_id and tp.at > now() - interval '30 seconds'
         and tp.moved_at is not null and tp.moved_at > b.since) as steered,
        (b.from_x is not null and s.x is not null
         and now() < b.since + make_interval(secs => sqrt(power(s.x - b.from_x, 2) + power(s.y - b.from_y, 2)) / 3.2 + 1)) as walking,
        greatest(ts.seen_at, tp.at) as seen,
        exists (select 1 from public.hunt_sessions h where h.user_id = b.user_id and h.slot = b.slot and h.ended_at is null) as hunting) q
$fn$;

-- The character's own stand, as everyone else sees it (null when it holds none).
create or replace function public.hr_town_me(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select jsonb_build_object('map', b.map_id, 'inst', b.inst, 'station', t.station_id, 'stand', t.stand_no,
           'x', t.x, 'y', t.y, 'gx', t.gx, 'gy', t.gy, 'dir', t.dir, 'at', jsonb_build_array(t.sx, t.sy),
           'work', t.why = 'work', 'since_ms', floor(extract(epoch from t.since) * 1000)::bigint)
    from public.town_bodies b
    cross join lateral public.hr_town_bodies_at(b.map_id, b.inst, null, b.user_id, b.slot) t
   where b.user_id = p_user and b.slot = p_slot and b.station_id is not null and t.sx is not null
$fn$;

-- THE SEAT: the instance an account stands in on a town map, chosen when it has none. The CALLER holds the map lock.
create or replace function public.hr_town_seat(p_user uuid, p_map text)
returns int language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_map   public.hr_town_maps%rowtype;
  v_hard  int; v_soft int; v_inst int;
  v_seats jsonb;
begin
  select * into v_map from public.hr_town_maps where map_id = p_map;
  select min(b.inst) into v_inst from public.town_bodies b
   where b.user_id = p_user and b.map_id = p_map and b.station_id is not null and public.hr_town_live(b.user_id, b.slot);
  if v_inst is not null then return v_inst; end if;
  -- the hard cap keeps a free stand for every seated hero; the soft cap is the ruled instance size
  v_hard := greatest(1, (select count(*) from public.hr_town_stands s where s.map_id = p_map)::int / greatest(1, v_map.heroes));
  v_soft := least(v_map.players, v_hard);
  select coalesce(jsonb_object_agg(x.inst, x.n), '{}'::jsonb) into v_seats
    from (select b.inst, count(distinct b.user_id) n from public.town_bodies b
           where b.map_id = p_map and b.station_id is not null and public.hr_town_live(b.user_id, b.slot)
           group by b.inst) x;
  -- WITH ITS PARTY (the leader first, then a mate: up to the hard cap), THEN ITS FRIENDS (up to the soft cap)
  with mates as (
    select m2.user_id, bool_or(m2.user_id = p.leader_user) as leads
      from public.hunt_party_members m1
      join public.hunt_parties p on p.id = m1.party_id and p.closed_at is null
      join public.hunt_party_members m2 on m2.party_id = m1.party_id
     where m1.user_id = p_user and m2.user_id <> p_user
     group by m2.user_id
  ), friends as (
    select case when f.user_lo = p_user then f.user_hi else f.user_lo end as user_id
      from public.friend_links f where f.user_lo = p_user or f.user_hi = p_user
  ), near as (
    select b.inst, min(case when mt.leads then 0 when mt.user_id is not null then 1 else 2 end) as rnk,
           count(distinct b.user_id) filter (where fr.user_id is not null) as nf
      from public.town_bodies b
      left join mates mt on mt.user_id = b.user_id
      left join friends fr on fr.user_id = b.user_id
     where b.map_id = p_map and b.station_id is not null and (mt.user_id is not null or fr.user_id is not null)
       and public.hr_town_live(b.user_id, b.slot)
     group by b.inst
  )
  select n.inst into v_inst from near n
   where coalesce((v_seats->>n.inst::text)::int, 0) < case when n.rnk < 2 then v_hard else v_soft end
   order by n.rnk, n.nf desc, n.inst limit 1;
  if v_inst is not null then return v_inst; end if;
  select min(k::int) into v_inst from jsonb_each_text(v_seats) e(k, v) where v::int < v_soft;
  if v_inst is not null then return v_inst; end if;
  -- A NEW INSTANCE: the lowest number nobody stands in
  select min(g) into v_inst from generate_series(1, 9999) g where not (v_seats ? g::text);
  return v_inst;
end $fn$;

-- THE PLACE: hold a stand for (p_user, p_slot) at station p_station of p_map (its instance: its account's, or
-- p_inst for a party move, or a new seat). Keeps the stand it already holds there; else the station's lowest free
-- stand, its overflow, the nearest free bench, the nearest free stand. p_from_station: it walks in from that
-- station (a hunt's arrival), else from where it stood. Takes the map lock, then the body row.
create or replace function public.hr_town_place(p_user uuid, p_slot int, p_map text, p_station text, p_why text,
                                               p_since timestamptz default null, p_from_station text default null, p_inst int default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_map  public.hr_town_maps%rowtype;
  v_b    public.town_bodies%rowtype;
  v_inst int; v_st text; v_no int; v_ax int; v_ay int; v_fx int; v_fy int;
  v_keep boolean := false;
begin
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  select coalesce(s.face_x, (select d.x from public.hr_town_stands d where d.map_id = s.map_id and d.station_id = s.station_id order by d.stand_no limit 1)),
         coalesce(s.face_y, (select d.y from public.hr_town_stands d where d.map_id = s.map_id and d.station_id = s.station_id order by d.stand_no limit 1))
    into v_ax, v_ay from public.hr_town_stations s where s.map_id = p_map and s.station_id = p_station;
  if not found or coalesce(p_why, '') not in ('work', 'arrive', 'idle', 'visit') then return jsonb_build_object('ok', false, 'error', 'unknown_station'); end if;
  perform public.hr_town_lock(p_map);
  select * into v_b from public.town_bodies where user_id = p_user and slot = p_slot for update;
  -- THE INSTANCE: a party move names it; else the one its account stands in; else a seat (the lock is held)
  v_inst := coalesce(p_inst,
    case when v_b.station_id is not null and v_b.map_id = p_map and public.hr_town_live(p_user, p_slot) then v_b.inst end,
    public.hr_town_seat(p_user, p_map));
  -- an idle hero whose browser closed lets go of its stand here (no goodbye is needed)
  update public.town_bodies b set station_id = null, stand_no = null, why = 'gone', from_x = null, from_y = null, changed_at = now()
   where b.map_id = p_map and b.inst = v_inst and b.station_id is not null
     and not (b.user_id = p_user and b.slot = p_slot) and not public.hr_town_live(b.user_id, b.slot);
  -- one player fields at most v_map.heroes bodies
  if (select count(*) from public.town_bodies b where b.user_id = p_user and b.map_id = p_map and b.inst = v_inst
        and b.station_id is not null and b.slot <> p_slot) >= v_map.heroes then
    return jsonb_build_object('ok', false, 'error', 'too_many_bodies');
  end if;
  if v_b.station_id = p_station and v_b.map_id = p_map and v_b.inst = v_inst then
    v_keep := true;
  else
    select s.station_id, s.stand_no into v_st, v_no
      from public.hr_town_stands s join public.hr_town_stations st on st.map_id = s.map_id and st.station_id = s.station_id
     where s.map_id = p_map
       and not exists (select 1 from public.town_bodies o
                        where o.map_id = p_map and o.inst = v_inst and o.station_id = s.station_id and o.stand_no = s.stand_no
                          and not (o.user_id = p_user and o.slot = p_slot))
     order by case when s.station_id = p_station then 0 when st.role = 'bench' then 1 else 2 end,
              case when s.station_id = p_station then s.stand_no else 0 end,
              power(s.x - v_ax, 2) + power(s.y - v_ay, 2), s.station_id, s.stand_no
     limit 1;
    if v_st is null then return jsonb_build_object('ok', false, 'error', 'town_full'); end if;
    -- where it walks from: the station it came through, else the tile it stood on
    if p_from_station is not null then
      select s.x, s.y into v_fx, v_fy from public.hr_town_stands s where s.map_id = p_map and s.station_id = p_from_station order by s.stand_no limit 1;
    elsif v_b.station_id is not null and v_b.map_id = p_map then
      select t.x, t.y into v_fx, v_fy from public.hr_town_bodies_at(p_map, v_b.inst, null, p_user, p_slot) t;
    end if;
  end if;
  if v_keep then
    update public.town_bodies set why = p_why, changed_at = now()
     where user_id = p_user and slot = p_slot and why is distinct from p_why;
  else
    insert into public.town_bodies as tb (user_id, slot, map_id, inst, station_id, stand_no, why, since, from_x, from_y, changed_at)
      values (p_user, p_slot, p_map, v_inst, v_st, v_no, p_why, coalesce(p_since, now()), v_fx, v_fy, now())
    on conflict (user_id, slot) do update
      set map_id = excluded.map_id, inst = excluded.inst, station_id = excluded.station_id, stand_no = excluded.stand_no,
          why = excluded.why, since = excluded.since, from_x = excluded.from_x, from_y = excluded.from_y, changed_at = excluded.changed_at;
  end if;
  return jsonb_build_object('ok', true, 'me', public.hr_town_me(p_user, p_slot));
end $fn$;

-- Placed from its activity pointer: a town activity at its station, anything else on the idle station.
create or replace function public.hr_town_place_pointer(p_user uuid, p_slot int, p_map text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare v_kind text; v_id text;
begin
  select ps.active_kind, ps.active_id into v_kind, v_id from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if public.hr_town_work_kind(v_kind) then
    return public.hr_town_place(p_user, p_slot, p_map, public.hr_town_station_for(p_map, v_kind, v_id), 'work');
  end if;
  return public.hr_town_place(p_user, p_slot, p_map, public.hr_town_station_for(p_map, 'idle', null), 'idle');
end $fn$;

-- Let go of the stand (hunting, leaving). Releasing can never seat two bodies on one stand: no lock is needed.
create or replace function public.hr_town_release(p_user uuid, p_slot int)
returns void language sql volatile security definer set search_path = public, pg_catalog as $fn$
  update public.town_bodies set station_id = null, stand_no = null, why = 'gone', from_x = null, from_y = null, changed_at = now()
   where user_id = p_user and slot = p_slot and station_id is not null
$fn$;

-- THE NOTES APPLIED: the pending pointer changes of up to p_limit characters on p_map (a character with no body
-- stands on the main town), every note of each. Read as the pointer is NOW (a note only says THAT it changed, and
-- what hunt it came back from). Under the map lock: two readers of one map apply notes one at a time.
create or replace function public.hr_town_moves_settle(p_map text, p_limit int, p_user uuid default null, p_slot int default null)
returns int language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  r record; v_n int := 0; v_kind text; v_id text; v_main text; v_from text;
begin
  if not exists (select 1 from public.town_moves m
                  where (p_user is null or (m.user_id = p_user and m.slot = p_slot))) then return 0; end if;
  select map_id into v_main from public.hr_town_maps where main;
  perform public.hr_town_lock(p_map);
  for r in
    with chars as (
      select m2.user_id, m2.slot from public.town_moves m2
        left join public.town_bodies b on b.user_id = m2.user_id and b.slot = m2.slot
       where coalesce(b.map_id, v_main) = p_map
         and (p_user is null or (m2.user_id = p_user and m2.slot = p_slot))
       group by m2.user_id, m2.slot
       order by min(m2.id) limit p_limit
    ), picked as (
      delete from public.town_moves m using chars c
       where m.user_id = c.user_id and m.slot = c.slot
      returning m.user_id, m.slot, m.from_hunt, m.at, m.id)
    select p.user_id, p.slot, (array_agg(p.from_hunt order by p.id desc) filter (where p.from_hunt is not null))[1] as from_hunt,
           max(p.at) as at, max(p.at) filter (where p.from_hunt is not null) as ended_at
      from picked p group by p.user_id, p.slot
      order by min(p.id)
  loop
    select ps.active_kind, ps.active_id into v_kind, v_id from public.player_state ps where ps.user_id = r.user_id and ps.slot = r.slot;
    if not found then continue; end if;
    if v_kind = 'combat' or exists (select 1 from public.hunt_sessions h where h.user_id = r.user_id and h.slot = r.slot and h.ended_at is null) then
      -- A HUNTER IS NOT IN TOWN
      perform public.hr_town_release(r.user_id, r.slot);
      delete from public.town_seen where user_id = r.user_id and slot = r.slot;
    elsif r.from_hunt is not null then
      v_from := public.hr_town_station_for(p_map, 'combat', r.from_hunt);
      if public.hr_town_work_kind(v_kind) then
        -- BACK FROM A HUNT, RESUMING: at its activity's station, walking in from the arrival
        perform public.hr_town_place(r.user_id, r.slot, p_map, public.hr_town_station_for(p_map, v_kind, v_id), 'work', r.at, v_from);
      else
        -- BACK FROM A HUNT, IDLE: set down at its hunt's arrival, in town 30 s from the end (an open browser keeps it)
        insert into public.town_seen as ts (user_id, slot, seen_at) values (r.user_id, r.slot, r.ended_at)
          on conflict (user_id, slot) do update set seen_at = greatest(ts.seen_at, excluded.seen_at);
        perform public.hr_town_place(r.user_id, r.slot, p_map, v_from, 'arrive', r.ended_at);
      end if;
    elsif public.hr_town_work_kind(v_kind) then
      perform public.hr_town_place(r.user_id, r.slot, p_map, public.hr_town_station_for(p_map, v_kind, v_id), 'work', r.at);
    else
      -- IT STOPPED: it stays where it stands (it never walks on its own); only its pose changes
      update public.town_bodies set why = 'idle', changed_at = now()
       where user_id = r.user_id and slot = r.slot and station_id is not null and why = 'work';
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

-- A PARTY STANDS TOGETHER: an account seated apart from its party's leader moves to the leader's instance when there
-- is room (the hard cap). Never the leader's own account: the move converges.
create or replace function public.hr_town_merge_party(p_user uuid, p_map text)
returns void language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_map public.hr_town_maps%rowtype; v_mine int; v_lead uuid; v_target int; v_hard int; r record;
begin
  select min(b.inst) into v_mine from public.town_bodies b
   where b.user_id = p_user and b.map_id = p_map and b.station_id is not null;
  if v_mine is null then return; end if;
  if exists (select 1 from public.hunt_parties p where p.leader_user = p_user and p.closed_at is null) then return; end if;
  select min(p.leader_user::text)::uuid into v_lead
    from public.hunt_party_members m join public.hunt_parties p on p.id = m.party_id and p.closed_at is null
   where m.user_id = p_user and p.leader_user <> p_user;
  if v_lead is null then return; end if;
  select min(b.inst) into v_target from public.town_bodies b
   where b.user_id = v_lead and b.map_id = p_map and b.station_id is not null and public.hr_town_live(b.user_id, b.slot);
  if v_target is null or v_target = v_mine then return; end if;
  perform public.hr_town_lock(p_map);
  select * into v_map from public.hr_town_maps where map_id = p_map;
  v_hard := greatest(1, (select count(*) from public.hr_town_stands s where s.map_id = p_map)::int / greatest(1, v_map.heroes));
  if (select count(distinct b.user_id) from public.town_bodies b
       where b.map_id = p_map and b.inst = v_target and b.station_id is not null and public.hr_town_live(b.user_id, b.slot)) >= v_hard then
    return;
  end if;
  for r in select b.slot, b.station_id, b.why from public.town_bodies b
            where b.user_id = p_user and b.map_id = p_map and b.station_id is not null order by b.slot for update loop
    perform public.hr_town_place(p_user, r.slot, p_map, r.station_id, r.why, null, null, v_target);
  end loop;
end $fn$;

-- ── §3 THE NOTE (a trigger: every writer of the activity pointer, now and later) ─
create or replace function public.hr_town_note_move()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- TOWN-STANDS (2027-01-26-town-stands.sql): note THAT the activity pointer changed (and the hunt it came back from);
-- the town's next read moves the body. An insert, nothing else: no lock, no wait, no read of any town table.
begin
  insert into public.town_moves (user_id, slot, from_hunt, at)
  values (new.user_id, new.slot,
          case when tg_op = 'UPDATE' and old.active_kind = 'combat' and new.active_kind is distinct from 'combat' then old.active_id end,
          now());
  return null;
end $fn$;
create or replace trigger hr_town_note_move_upd
  after update of active_kind, active_id on public.player_state
  for each row when (old.active_kind is distinct from new.active_kind or old.active_id is distinct from new.active_id)
  execute function public.hr_town_note_move();
create or replace trigger hr_town_note_move_ins
  after insert on public.player_state
  for each row when (new.active_kind is distinct from 'idle')
  execute function public.hr_town_note_move();

-- Every hero already working a town activity is noted once, so the first read sets it down at its station.
insert into public.town_moves (user_id, slot, from_hunt, at)
  select ps.user_id, ps.slot, null, now() from public.player_state ps
   where public.hr_town_work_kind(ps.active_kind)
     and not exists (select 1 from public.town_moves m where m.user_id = ps.user_id and m.slot = ps.slot)
     and not exists (select 1 from public.town_bodies b where b.user_id = ps.user_id and b.slot = ps.slot);

-- ── §4 THE VERBS ─────────────────────────────────────────────────────────────
-- hr_town_here: a PARKED hero is present on p_map (no tile: the server's stand).
create or replace function public.hr_town_here(p_slot int, p_map text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  c_per_min constant int := 30;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_r    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_here', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  -- its own pending changes first (its hunt just ended), so it is placed where they say
  perform public.hr_town_moves_settle(p_map, 4, v_uid, v_slot);
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  -- a steered tile stays where the hero was left (a switch is not a move)
  update public.town_positions set at = now() where user_id = v_uid and slot = v_slot and map_id = p_map;
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    v_r := public.hr_town_place_pointer(v_uid, v_slot, p_map);
    if v_r->>'ok' is distinct from 'true' then return v_r; end if;
  else
    perform public.hr_town_merge_party(v_uid, p_map);
  end if;
  perform public.hr_town_moves_settle(p_map, 8);
  return jsonb_build_object('ok', true, 'me', public.hr_town_me(v_uid, v_slot));
end $fn$;

-- hr_town_go: send the body to a counter, the green or a bench (p_station), or back to its activity's station (null).
create or replace function public.hr_town_go(p_slot int, p_station text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  c_per_min constant int := 20;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  text;
  v_r    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_go', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  v_map := coalesce((select b.map_id from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot),
                    (select m.map_id from public.hr_town_maps m where m.main));
  if p_station is not null and not exists (select 1 from public.hr_town_stations s
                                           where s.map_id = v_map and s.station_id = p_station and s.role in ('visit', 'idle', 'bench')) then
    return jsonb_build_object('ok', false, 'error', 'unknown_station'); end if;
  perform public.hr_town_moves_settle(v_map, 4, v_uid, v_slot);
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  if p_station is null then
    v_r := public.hr_town_place_pointer(v_uid, v_slot, v_map);
  else
    v_r := public.hr_town_place(v_uid, v_slot, v_map, p_station, 'visit');
  end if;
  if v_r->>'ok' is distinct from 'true' then return v_r; end if;
  return jsonb_build_object('ok', true, 'me', public.hr_town_me(v_uid, v_slot));
end $fn$;

-- hr_town_view: the people in the viewer's instance and window; only what changed since its cursor.
create or replace function public.hr_town_view(p_slot int, p_map text, p_cx int, p_cy int, p_cursor bigint, p_pcx int, p_pcy int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  c_slack      constant interval := interval '5 seconds';    -- commit order: a write stamped before this read's start
  c_full_after constant interval := interval '60 seconds';   -- an older cursor is answered whole
  c_per_min    constant int := 45;
  c_gone_max   constant int := 240;
  v_uid  uuid := auth.uid();
  v_slot int := coalesce(p_slot, -1);
  v_map  public.hr_town_maps%rowtype;
  v_now  timestamptz := now();
  v_me   jsonb; v_inst int;
  v_cur  timestamptz; v_since timestamptz; v_full boolean;
  v_hw int; v_hh int; v_cx int; v_cy int; v_px int; v_py int;
  v_mates uuid[]; v_friends uuid[];
  v_walkers jsonb; v_gone jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_view', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = v_slot and h.ended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  -- THE VIEWER STANDS IN THE TOWN IT VIEWS: present (a read is a keepalive), its own pending changes, then a stand
  -- when it has none (rare: the map lock)
  insert into public.town_seen as ts (user_id, slot, seen_at) values (v_uid, v_slot, now())
    on conflict (user_id, slot) do update set seen_at = excluded.seen_at;
  perform public.hr_town_moves_settle(p_map, 4, v_uid, v_slot);
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    perform public.hr_town_place_pointer(v_uid, v_slot, p_map);
  end if;
  v_me := public.hr_town_me(v_uid, v_slot);
  v_inst := (v_me->>'inst')::int;
  -- THE WINDOW: the view around the centre the client names (its own tile when it names none), plus the margin
  v_hw := ceil(v_map.view_w / 2.0)::int + v_map.margin;
  v_hh := ceil(v_map.view_h / 2.0)::int + v_map.margin;
  v_cx := least(greatest(coalesce(p_cx, (v_me->>'x')::int, v_map.w / 2), 0), v_map.w - 1);
  v_cy := least(greatest(coalesce(p_cy, (v_me->>'y')::int, v_map.h / 2), 0), v_map.h - 1);
  v_px := case when p_pcx is not null and p_pcy is not null then least(greatest(p_pcx, 0), v_map.w - 1) end;
  v_py := case when p_pcx is not null and p_pcy is not null then least(greatest(p_pcy, 0), v_map.h - 1) end;
  -- THE CURSOR: the last answer's server time; none, an old one or a future one is answered whole
  v_cur := case when p_cursor is null then null else to_timestamp(p_cursor / 1000000.0) end;
  v_full := v_cur is null or v_cur < v_now - c_full_after or v_cur > v_now + interval '1 second';
  v_since := case when v_full then null else v_cur - c_slack end;
  v_mates := array(select distinct m2.user_id from public.hunt_party_members m1
                     join public.hunt_parties p on p.id = m1.party_id and p.closed_at is null
                     join public.hunt_party_members m2 on m2.party_id = m1.party_id
                    where m1.user_id = v_uid and m2.user_id <> v_uid);
  v_friends := array(select case when f.user_lo = v_uid then f.user_hi else f.user_lo end
                       from public.friend_links f where f.user_lo = v_uid or f.user_hi = v_uid);
  if v_inst is not null then
    -- ONE STATEMENT: the instance's bodies once (t), whether this answer is whole (m: asked, or a delta over the
    -- cap — nothing is ever dropped from a delta), the walkers (w, the helpers run only for these <= cap rows) and
    -- the gone (g: changed and no longer drawn in the window, or their presence ran out since the cursor).
    with t as materialized (
      select b.user_id, b.slot, b.station_id, b.why, b.x, b.y, b.gx, b.gy, b.dir, b.changed, b.seen_until,
             b.visible and not public.hr_social_blocked(v_uid, b.user_id) as shown,
             -- in the area: where it is OR where it walks to (a body walking in is read before it arrives)
             (b.x between v_cx - v_hw and v_cx + v_hw and b.y between v_cy - v_hh and v_cy + v_hh)
               or (b.gx between v_cx - v_hw and v_cx + v_hw and b.gy between v_cy - v_hh and v_cy + v_hh) as inside,
             v_px is not null and ((b.x between v_px - v_hw and v_px + v_hw and b.y between v_py - v_hh and v_py + v_hh)
               or (b.gx between v_px - v_hw and v_px + v_hw and b.gy between v_py - v_hh and v_py + v_hh)) as was_inside,
             case when b.user_id = v_uid then 0 when b.user_id = any (v_mates) then 1 when b.user_id = any (v_friends) then 2 else 3 end as rnk,
             (b.x - v_cx) * (b.x - v_cx) + (b.y - v_cy) * (b.y - v_cy) as d2
        from public.hr_town_bodies_at(p_map, v_inst, v_since) b
       where not (b.user_id = v_uid and b.slot = v_slot)
    ), m as (
      select v_full or count(*) filter (where t.shown and t.inside and (t.changed > v_since or not t.was_inside)) > v_map.view_cap as whole
        from t
    ), w as (
      select t.* from t, m
       where t.shown and t.inside and (m.whole or t.changed > v_since or not t.was_inside)
       order by t.rnk, t.d2, t.user_id, t.slot limit v_map.view_cap
    ), g as (
      select t.user_id, t.slot from t, m
       where not m.whole and not (t.shown and t.inside)
         and (t.changed > v_since or (t.seen_until > v_since and t.seen_until <= v_now))
       order by t.user_id, t.slot limit c_gone_max
    )
    select (select m.whole from m),
           (select jsonb_agg(jsonb_build_object(
                     'id', w.user_id, 'slot', w.slot,
                     'name', left(public.hr_character_name(w.user_id, w.slot), 24),
                     'level', public.hr_level_of(w.user_id, w.slot),
                     'role', public.hr_role_view(w.user_id, w.slot)->>'id',
                     'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(w.user_id, w.slot))
                                    then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
                     'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
                     'age_ms', greatest(0, floor(extract(epoch from (v_now - w.changed)) * 1000))::int,
                     'station', w.station_id, 'work', w.why = 'work'
                   ) order by w.rnk, w.d2, w.user_id, w.slot)
              from w left join public.player_outfits po on po.user_id = w.user_id and po.slot = w.slot),
           (select jsonb_agg(jsonb_build_object('id', g.user_id, 'slot', g.slot) order by g.user_id, g.slot) from g)
      into v_full, v_walkers, v_gone;
  end if;
  -- the others' pending changes, AFTER the read (the map lock is never held across it): seen on the next read
  perform public.hr_town_moves_settle(p_map, 20);
  return jsonb_build_object('ok', true, 'map', p_map, 'inst', v_inst, 'cap', v_map.view_cap, 'full', v_full,
    'cursor', floor(extract(epoch from v_now) * 1000000)::bigint,
    'area', jsonb_build_array(greatest(v_cx - v_hw, 0), greatest(v_cy - v_hh, 0), least(v_cx + v_hw, v_map.w - 1), least(v_cy + v_hh, v_map.h - 1)),
    'walkers', coalesce(v_walkers, '[]'::jsonb), 'gone', coalesce(v_gone, '[]'::jsonb), 'me', v_me);
end $fn$;

-- hr_town_move RESTATED WHOLE from 2026-10-31-town-bodies-per-character.sql (§0 pins its image): + the first publish
-- places the body; moved_at stamped only by a real move; a leave releases an IDLE body (a working one stays).
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
  -- TOWN-STANDS (2027-01-26-town-stands.sql): a body is placed on the first publish; moved_at is a real move only.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_move', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- LEAVING: this character's body goes (another character of the account keeps its own); a hero working a town
  -- activity stays at its station (the server plays it, viewed or not).
  if p_map is null then
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    delete from public.town_seen where user_id = v_uid and slot = v_slot;
    if not exists (select 1 from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot and public.hr_town_work_kind(ps.active_kind)) then
      perform public.hr_town_release(v_uid, v_slot);
    end if;
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
    delete from public.town_positions where user_id = v_uid and slot = v_slot;
    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;
  select at into v_last from public.town_positions where user_id = v_uid and slot = v_slot;
  if v_last is not null and now() - v_last < c_floor then
    return jsonb_build_object('ok', true, 'stamped', false); end if;
  insert into public.town_positions as tp (user_id, slot, map_id, x, y, gx, gy, dir, at, moved_at)
    values (v_uid, v_slot, p_map, p_x, p_y, p_gx, p_gy, p_dir, now(), now())
  on conflict (user_id, slot) do update
    set map_id = excluded.map_id, x = excluded.x, y = excluded.y,
        gx = excluded.gx, gy = excluded.gy, dir = excluded.dir, at = excluded.at,
        moved_at = case when (tp.map_id, tp.x, tp.y, tp.gx, tp.gy, tp.dir)
                             is distinct from (excluded.map_id, excluded.x, excluded.y, excluded.gx, excluded.gy, excluded.dir)
                        then excluded.at else tp.moved_at end;
  -- the first publish stands the body on the server's stand (a walk then starts from there)
  if not exists (select 1 from public.town_bodies b where b.user_id = v_uid and b.slot = v_slot and b.map_id = p_map and b.station_id is not null) then
    perform public.hr_town_place_pointer(v_uid, v_slot, p_map);
  end if;
  return jsonb_build_object('ok', true, 'stamped', true);
end $$;

-- ── §5 GRANTS AND THE BASELINE ──────────────────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_town_work_kind(text)', 'public.hr_town_live_of(text,timestamp with time zone,boolean)',
                           'public.hr_town_live(uuid,integer)', 'public.hr_town_lock(text)',
                           'public.hr_town_bodies_at(text,integer,timestamp with time zone,uuid,integer)', 'public.hr_town_me(uuid,integer)',
                           'public.hr_town_seat(uuid,text)',
                           'public.hr_town_place(uuid,integer,text,text,text,timestamp with time zone,text,integer)',
                           'public.hr_town_place_pointer(uuid,integer,text)', 'public.hr_town_release(uuid,integer)',
                           'public.hr_town_moves_settle(text,integer,uuid,integer)', 'public.hr_town_merge_party(uuid,text)',
                           'public.hr_town_note_move()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array['public.hr_town_here(integer,text)', 'public.hr_town_go(integer,text)',
                           'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)',
                           'public.hr_town_move(integer,text,integer,integer,integer,integer,text)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_town_here', 'hr_town_go', 'hr_town_view');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_town_here', 'p_slot integer, p_map text', 'authenticated',
   'added 2027-01-26 (town-stands): a parked hero is present in town (no tile; the server stand from its activity pointer); refused while hunting; 30/min'),
  ('hr_town_go', 'p_slot integer, p_station text', 'authenticated',
   'added 2027-01-26 (town-stands): send the caller''s own body to a visit/idle/bench station, or back to its activity''s station (null); 20/min'),
  ('hr_town_view', 'p_slot integer, p_map text, p_cx integer, p_cy integer, p_cursor bigint, p_pcx integer, p_pcy integer', 'authenticated',
   'added 2027-01-26 (town-stands): the bodies in the viewer''s instance and window (view + margin, cap 120), only the changed since its cursor, + gone and its own stand; 45/min');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  c_keys constant text := 'age_ms,dir,gx,gy,id,level,name,outfit,role,slot,station,work,x,y';
  v_pfx  constant text := '000000c0-0000-4000-a000-7057';
  v_u    uuid; v_uids uuid[] := '{}'; v_v uuid; v_h uuid;
  v_i    int; v_inst int; v jsonb; v_w jsonb; v_cur bigint; v_txt text; v_party uuid; v_hi uuid;
  v_probe constant text := 'zz_town_probe';
begin
  -- (0) THE SHAPE: the work kinds are the resumable town kinds; the guarantee index exists and is unique and partial.
  if (select array_agg(k.kind order by k.kind) from public.hr_hunt_resumable_kinds k)
     is distinct from (select array_agg(k order by k) from unnest(array['gather', 'artisan', 'training']) k)
     or exists (select 1 from public.hr_hunt_resumable_kinds k where not public.hr_town_work_kind(k.kind)) then
    raise exception 'town-stands §6(0): hr_town_work_kind is not hr_hunt_resumable_kinds'; end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'town_bodies_one_per_stand' and i.indisunique and i.indpred is not null) then
    raise exception 'town-stands §6(0): the one-body-a-stand index is missing or not unique'; end if;
  -- the note is an insert and nothing else: no lock, no town read (a settle can never wait on the town)
  select regexp_replace(prosrc, '--[^\n]*', '', 'g') into v_txt from pg_proc where oid = 'public.hr_town_note_move()'::regprocedure;
  if v_txt ~* '(lock|for update|town_bodies|town_seen|town_positions|hr_town_place|select |update |delete )' or v_txt !~* 'insert into public\.town_moves' then
    raise exception 'town-stands §6(0): the activity trigger does more than note the change'; end if;
  begin
    insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'town-stands §6')
      on conflict (key) do update set enabled = true;
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'town-stands §6')
      on conflict (key) do update set enabled = true;
    -- 70 probe accounts (2 heroes each where needed); the first 14 hero pairs work on the seed Common
    for v_i in 1..70 loop
      v_u := (v_pfx || lpad(to_hex(v_i), 8, '0'))::uuid;
      v_uids := v_uids || v_u;
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Stand' || v_i) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'town-stands §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'town-stands §6: probe hero % was not made', v_i; end if;
      if v_i <= 8 and coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then raise exception 'town-stands §6: probe hero %/1 was not made', v_i; end if;
    end loop;
    v_v := v_uids[20];   -- the VIEWER, a separate account standing idle in the Common

    -- (a) NO TWO BODIES ON ONE STAND: 13 heroes start the same gathering at once (7 accounts, browsers closed).
    for v_i in 1..7 loop
      update public.player_state set active_kind = 'gather', active_id = 'normal_tree' where user_id = v_uids[v_i] and slot = 0;
      if v_i <= 6 then update public.player_state set active_kind = 'gather', active_id = 'normal_tree' where user_id = v_uids[v_i] and slot = 1; end if;
    end loop;
    if (select count(*) from public.town_moves m where m.user_id = any (v_uids[1:7])) <> 13 then
      raise exception 'town-stands §6(a): the trigger did not note 13 activity changes'; end if;
    perform set_config('request.jwt.claim.sub', v_v::text, true);
    v := public.hr_town_view(0, 'town_common', 11, 7, null, null, null);   -- places the viewer, applies the notes after
    v := public.hr_town_view(0, 'town_common', 11, 7, null, null, null);
    if v->>'ok' is distinct from 'true' or (v->>'full')::boolean is not true then raise exception 'town-stands §6(a): the read is %', v; end if;
    if exists (select 1 from public.town_moves m where m.user_id = any (v_uids[1:7])) then
      raise exception 'town-stands §6(a): two reads did not apply the notes'; end if;
    if (select count(*) from public.town_bodies b where b.user_id = any (v_uids[1:7]) and b.station_id is not null) <> 13
       or (select count(distinct (b.map_id, b.inst, b.station_id, b.stand_no)) from public.town_bodies b
            where b.user_id = any (v_uids[1:7]) and b.station_id is not null) <> 13 then
      raise exception 'town-stands §6(a): 13 workers do not hold 13 stands'; end if;
    -- the woodpile's 12 stands (8 + 4 overflow) fill in order; the 13th takes the nearest bench
    if (select count(*) from public.town_bodies b where b.user_id = any (v_uids[1:7]) and b.station_id = 'woodpile') <> 12
       or (select count(*) from public.town_bodies b where b.user_id = any (v_uids[1:7]) and b.station_id = 'east_green') <> 1
       or (select array_agg(b.stand_no order by b.stand_no) from public.town_bodies b where b.user_id = any (v_uids[1:7]) and b.station_id = 'woodpile')
          is distinct from (select array_agg(g::smallint order by g) from generate_series(1, 12) g) then
      raise exception 'town-stands §6(a): the station did not fill lowest first, overflow then bench'; end if;
    -- THE BACKSTOP: a write that would seat a second body on a held stand is refused by Postgres itself
    v_txt := null;
    begin
      update public.town_bodies set stand_no = 1 where user_id = v_uids[2] and slot = 0 and station_id = 'woodpile' and stand_no <> 1;
      if not found then raise exception 'town-stands §6(a): CONTROL: the probe body already holds stand 1'; end if;
    exception when unique_violation then v_txt := 'refused';
    end;
    if v_txt is distinct from 'refused' then raise exception 'town-stands §6(a): two bodies could hold one stand'; end if;
    -- (b) A PARKED/OFFLINE HERO STANDS AT ITS STATION: no keepalive, no publish, yet each worker is drawn on its stand
    v_w := v->'walkers';
    if (select count(*) from jsonb_array_elements(v_w) e
         where (e->>'id')::uuid = any (v_uids[1:7]) and (e->>'work')::boolean
           and exists (select 1 from public.hr_town_stands s where s.map_id = 'town_common' and s.station_id = e->>'station'
                         and s.x = (e->>'x')::int and s.y = (e->>'y')::int)) <> 13
       or exists (select 1 from public.town_seen s where s.user_id = any (v_uids[1:7]))
       or exists (select 1 from public.town_positions p where p.user_id = any (v_uids[1:7])) then
      raise exception 'town-stands §6(b): an unviewed worker is not drawn on its stand: %', v_w; end if;
    if (select string_agg(k, ',' order by k) from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(v_w) e) x) <> c_keys then
      raise exception 'town-stands §6(b): a walker carries keys %', (select string_agg(k, ',' order by k) from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(v_w) e) x); end if;
    if v->'me'->>'station' is distinct from 'green' or exists (select 1 from jsonb_array_elements(v_w) e where (e->>'id')::uuid = v_v) then
      raise exception 'town-stands §6(b): the idle viewer is not on the green, or sees itself: %', v->'me'; end if;

    -- (c) A HUNT: its start takes the body out (gone in a delta); its end sets it down on the arrival; a resume
    -- walks it to its station from there. A leave keeps a worker at its station and releases an idle hero.
    v_h := v_uids[7];
    update public.town_bodies set changed_at = now() - interval '1 minute', since = now() - interval '1 minute' where user_id = any (v_uids);
    v_hi := gen_random_uuid();
    insert into public.hunt_instances (id, hunt_id, settled_to, next_swing_at) values (v_hi, 'mill_cellar', now(), now());
    insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
      values (gen_random_uuid(), v_h, 0, 'mill_cellar', now(), now(), now(), now(), v_hi);
    perform public.hr_hunt_point(v_h, 0, 'mill_cellar');
    v_cur := floor(extract(epoch from now() - interval '30 seconds') * 1000000)::bigint;
    v := public.hr_town_view(0, 'town_common', 11, 7, v_cur, 11, 7);   -- applies the note after the read
    v := public.hr_town_view(0, 'town_common', 11, 7, v_cur, 11, 7);
    if (v->>'full')::boolean or not (v->'gone' @> jsonb_build_array(jsonb_build_object('id', v_h, 'slot', 0)))
       or exists (select 1 from public.town_bodies b where b.user_id = v_h and b.slot = 0 and b.station_id is not null) then
      raise exception 'town-stands §6(c): a hero that went hunting is not gone: %', v; end if;
    if jsonb_array_length(v->'walkers') <> 0 then
      raise exception 'town-stands §6(c): a delta with nothing changed returned %', v->'walkers'; end if;
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = v_h and slot = 0 and ended_at is null;
    perform public.hr_hunt_point(v_h, 0, null);
    perform public.hr_town_moves_settle('town_common', 20);
    if (select b.station_id from public.town_bodies b where b.user_id = v_h and b.slot = 0) is distinct from 'arrival'
       or (select b.why from public.town_bodies b where b.user_id = v_h and b.slot = 0) is distinct from 'arrive' then
      raise exception 'town-stands §6(c): back from its hunt the hero is not at the arrival: %', (select to_jsonb(b) from public.town_bodies b where b.user_id = v_h and b.slot = 0); end if;
    update public.player_state set active_kind = 'artisan', active_id = 'cook_shrimp' where user_id = v_h and slot = 0;
    perform public.hr_town_moves_settle('town_common', 20);
    if (select b.station_id from public.town_bodies b where b.user_id = v_h and b.slot = 0) is distinct from 'well_yard'
       or (select (b.from_x, b.from_y) from public.town_bodies b where b.user_id = v_h and b.slot = 0)
          is distinct from (select (s.x, s.y) from public.hr_town_stands s where s.map_id = 'town_common' and s.station_id = 'arrival' and s.stand_no = 1) then
      raise exception 'town-stands §6(c): the resumed cook does not walk from the arrival to the kitchen stand'; end if;
    perform set_config('request.jwt.claim.sub', v_h::text, true);
    -- (each call is its own statement: a read in the same statement would not see what the call wrote)
    v := public.hr_town_move(0, null, null, null, null, null, null);
    if v->>'left' is distinct from 'true'
       or (select b.station_id from public.town_bodies b where b.user_id = v_h and b.slot = 0) is distinct from 'well_yard' then
      raise exception 'town-stands §6(c): a leave took a working hero out of its station'; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_h and slot = 0;
    perform public.hr_town_moves_settle('town_common', 20);
    if (select b.why from public.town_bodies b where b.user_id = v_h and b.slot = 0) is distinct from 'idle'
       or (select b.station_id from public.town_bodies b where b.user_id = v_h and b.slot = 0) is distinct from 'well_yard' then
      raise exception 'town-stands §6(c): a hero that stopped walked away from where it stood'; end if;
    v := public.hr_town_move(0, null, null, null, null, null, null);
    if v->>'left' is distinct from 'true'
       or exists (select 1 from public.town_bodies b where b.user_id = v_h and b.slot = 0 and b.station_id is not null) then
      raise exception 'town-stands §6(c): a leave kept an idle hero''s stand'; end if;

    -- (d) THE STEERED TILE: a publish that moves wins over the stand; a keepalive on the same tile is not a move.
    perform set_config('request.jwt.claim.sub', v_v::text, true);
    if public.hr_town_move(0, 'town_common', 12, 9, 12, 9, 's')->>'stamped' is distinct from 'true' then
      raise exception 'town-stands §6(d): the viewer''s publish was refused'; end if;
    -- it took its stand a minute ago and walked one second ago (one transaction has one clock: the times are set)
    update public.town_bodies set since = now() - interval '1 minute' where user_id = v_v and slot = 0;
    update public.town_positions set at = now() - interval '1 second', moved_at = now() - interval '1 second' where user_id = v_v and slot = 0;
    if (public.hr_town_me(v_v, 0)->>'x')::int <> 12 or (public.hr_town_me(v_v, 0)->>'y')::int <> 9 then
      raise exception 'town-stands §6(d): a steered hero is not drawn on its tile: %', public.hr_town_me(v_v, 0); end if;
    perform public.hr_town_move(0, 'town_common', 12, 9, 12, 9, 's');
    if (select moved_at from public.town_positions where user_id = v_v and slot = 0) <> now() - interval '1 second' then
      raise exception 'town-stands §6(d): a keepalive on the same tile counted as a move'; end if;
    -- hr_town_go: a counter takes the body; a work station is refused; null sends it back to its activity's place
    v := public.hr_town_go(0, 'tally_board');
    if v->'me'->>'station' is distinct from 'tally_board'
       or (select b.why from public.town_bodies b where b.user_id = v_v and b.slot = 0) is distinct from 'visit' then
      raise exception 'town-stands §6(d): hr_town_go did not take the body to the counter: %', v; end if;
    v := public.hr_town_go(0, 'woodpile');
    if v->>'error' is distinct from 'unknown_station' then raise exception 'town-stands §6(d): hr_town_go took a work station: %', v; end if;
    v := public.hr_town_go(0, 'nowhere');
    if v->>'error' is distinct from 'unknown_station' then raise exception 'town-stands §6(d): hr_town_go took no station: %', v; end if;
    v := public.hr_town_go(0, null);
    if v->'me'->>'station' is distinct from 'green'
       or (select b.station_id from public.town_bodies b where b.user_id = v_v and b.slot = 0) is distinct from 'green' then
      raise exception 'town-stands §6(d): hr_town_go(null) did not send the idle body back to the green: %', v; end if;
    if public.hr_town_here(0, 'nowhere')->>'error' is distinct from 'bad_map'
       or public.hr_town_here(4, 'town_common')->>'error' is distinct from 'no_character'
       or public.hr_town_view(4, 'town_common', 0, 0, null, null, null)->>'error' is distinct from 'no_character' then
      raise exception 'town-stands §6(d): a bad map or slot was answered'; end if;

    -- (e) INSTANCES ON THE RULED NUMBERS (a probe map of 260 stands, 60 players, 4 heroes: hard cap 65):
    -- 60 players fill instance 1; the 61st opens instance 2; a party member lands with its leader past the soft cap;
    -- a friend follows its friend; an account apart from its leader joins it on its next keepalive.
    insert into public.hr_town_maps (map_id, zone_id, w, h, players, heroes, view_w, view_h, margin, view_cap, main)
      values (v_probe, v_probe, 40, 40, 60, 4, 22, 14, 8, 120, false);
    insert into public.hr_town_stations (map_id, station_id, role, face_x, face_y, ord) values
      (v_probe, 'zz_square', 'idle', null, null, 1), (v_probe, 'zz_bench', 'bench', null, null, 2);
    insert into public.hr_town_stands (map_id, station_id, stand_no, x, y, dir, overflow)
      select v_probe, 'zz_square', g + 1, g % 16, g / 16, 's', false from generate_series(0, 255) g;
    insert into public.hr_town_stands (map_id, station_id, stand_no, x, y, dir, overflow)
      select v_probe, 'zz_bench', g + 1, 30 + g, 30, 's', false from generate_series(0, 3) g;
    for v_i in 9..69 loop   -- 61 players, the first 60 + 1
      insert into public.town_seen (user_id, slot, seen_at) values (v_uids[v_i], 0, now()) on conflict (user_id, slot) do update set seen_at = now();
      v := public.hr_town_place(v_uids[v_i], 0, v_probe, 'zz_square', 'idle');
      if v->>'ok' is distinct from 'true' then raise exception 'town-stands §6(e): player % was not placed: %', v_i, v; end if;
      v_inst := (v->'me'->>'inst')::int;
      if (v_i <= 68 and v_inst <> 1) or (v_i = 69 and v_inst <> 2) then
        raise exception 'town-stands §6(e): player % (the %th) stands in instance %', v_i, v_i - 8, v_inst; end if;
    end loop;
    -- a party: leader = player 9 (instance 1, at 60 players) and player 70 -> 70 lands in instance 1 (61 < hard 65)
    insert into public.hunt_parties (hunt_id, leader_user, leader_slot, max_size) values ('mill_cellar', v_uids[9], 0, 4) returning id into v_party;
    insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type) values (v_party, v_uids[9], 0, 0, 'neutral'), (v_party, v_uids[70], 0, 1, 'neutral');
    insert into public.town_seen (user_id, slot, seen_at) values (v_uids[70], 0, now()) on conflict (user_id, slot) do update set seen_at = now();
    if (public.hr_town_place(v_uids[70], 0, v_probe, 'zz_square', 'idle')->'me'->>'inst')::int <> 1 then
      raise exception 'town-stands §6(e): a party member did not land with its leader'; end if;
    -- a friend of the instance-2 player lands in instance 2, though instance 1 has room again (10 left)
    for v_i in 10..19 loop perform public.hr_town_release(v_uids[v_i], 0); delete from public.town_seen where user_id = v_uids[v_i]; end loop;
    insert into public.friend_links (user_lo, user_hi) select least(v_uids[69], v_uids[10]), greatest(v_uids[69], v_uids[10]);
    insert into public.town_seen (user_id, slot, seen_at) values (v_uids[10], 0, now()) on conflict (user_id, slot) do update set seen_at = now();
    if (public.hr_town_place(v_uids[10], 0, v_probe, 'zz_square', 'idle')->'me'->>'inst')::int <> 2 then
      raise exception 'town-stands §6(e): a friend did not land with its friend'; end if;
    -- a stranger takes the lowest instance with room
    insert into public.town_seen (user_id, slot, seen_at) values (v_uids[11], 0, now()) on conflict (user_id, slot) do update set seen_at = now();
    if (public.hr_town_place(v_uids[11], 0, v_probe, 'zz_square', 'idle')->'me'->>'inst')::int <> 1 then
      raise exception 'town-stands §6(e): a stranger did not take the lowest instance with room'; end if;
    -- player 11 joins the instance-2 player's party (69 leads): its next keepalive moves it to instance 2
    insert into public.hunt_parties (hunt_id, leader_user, leader_slot, max_size) values ('mill_cellar', v_uids[69], 0, 4) returning id into v_party;
    insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type) values (v_party, v_uids[69], 0, 0, 'neutral'), (v_party, v_uids[11], 0, 1, 'neutral');
    perform public.hr_town_merge_party(v_uids[11], v_probe);
    if (select b.inst from public.town_bodies b where b.user_id = v_uids[11] and b.slot = 0) <> 2 then
      raise exception 'town-stands §6(e): an account apart from its party leader did not join it'; end if;
    -- no two bodies on one stand across the whole probe (the index, and the count)
    if exists (select 1 from public.town_bodies b where b.station_id is not null
                group by b.map_id, b.inst, b.station_id, b.stand_no having count(*) > 1) then
      raise exception 'town-stands §6(e): two bodies share a stand'; end if;
    -- one player fields at most `heroes` bodies (here 1): its second hero is not drawn, never stacked
    update public.hr_town_maps set heroes = 1 where map_id = v_probe;
    insert into public.town_seen (user_id, slot, seen_at) values (v_uids[8], 0, now()), (v_uids[8], 1, now())
      on conflict (user_id, slot) do update set seen_at = now();
    v := public.hr_town_place(v_uids[8], 0, v_probe, 'zz_square', 'idle');
    if v->>'ok' is distinct from 'true' then raise exception 'town-stands §6(e): CONTROL: the first hero was not placed: %', v; end if;
    v := public.hr_town_place(v_uids[8], 1, v_probe, 'zz_square', 'idle');
    if v->>'error' is distinct from 'too_many_bodies' then raise exception 'town-stands §6(e): a player fielded more bodies than its heroes: %', v; end if;
    perform public.hr_town_release(v_uids[8], 0);
    update public.hr_town_maps set heroes = 4 where map_id = v_probe;

    -- (f) THE WINDOWED READ: at most view_cap a read; a delta returns only what changed.
    update public.hr_town_maps set view_cap = 20 where map_id = v_probe;    -- 60 bodies inside the window, a cap of 20
    perform set_config('request.jwt.claim.sub', v_uids[20]::text, true);
    v := public.hr_town_view(0, v_probe, 8, 8, null, null, null);
    if (v->>'ok') is distinct from 'true' or jsonb_array_length(v->'walkers') <> 20 or (v->>'inst')::int <> 1 then
      raise exception 'town-stands §6(f): a full read over the cap returned % (want 20): %', jsonb_array_length(v->'walkers'), left(v::text, 300); end if;
    update public.hr_town_maps set view_cap = 120 where map_id = v_probe;
    v := public.hr_town_view(0, v_probe, 8, 8, null, null, null);
    if jsonb_array_length(v->'walkers') > 120 or jsonb_array_length(v->'walkers') < 50 then
      raise exception 'town-stands §6(f): a full read returned % bodies', jsonb_array_length(v->'walkers'); end if;
    update public.town_bodies set changed_at = now() - interval '1 minute', since = now() - interval '1 minute' where map_id = v_probe;
    update public.town_seen set seen_at = now() where user_id = any (v_uids);
    v_cur := floor(extract(epoch from now() - interval '20 seconds') * 1000000)::bigint;
    v := public.hr_town_view(0, v_probe, 8, 8, v_cur, 8, 8);
    if (v->>'full')::boolean or jsonb_array_length(v->'walkers') <> 0 or jsonb_array_length(v->'gone') <> 0 then
      raise exception 'town-stands §6(f): a delta with no change returned % walkers, % gone', jsonb_array_length(v->'walkers'), jsonb_array_length(v->'gone'); end if;
    perform public.hr_town_place(v_uids[30], 0, v_probe, 'zz_bench', 'visit');   -- one body moves out of the window (x 30)
    v := public.hr_town_view(0, v_probe, 8, 8, v_cur, 8, 8);
    -- while it walks it is the whole delta, still inside, heading for its new stand
    if jsonb_array_length(v->'walkers') <> 1 or (v->'walkers'->0->>'id')::uuid <> v_uids[30]
       or (v->'walkers'->0->>'gx')::int <> 30 or (v->'walkers'->0->>'gy')::int <> 30 or jsonb_array_length(v->'gone') <> 0 then
      raise exception 'town-stands §6(f): a body walking out of the window is not the whole delta: %', v; end if;
    -- once it has arrived (its walk is over) it is gone from the window
    update public.town_bodies set since = now() - interval '1 minute' where user_id = v_uids[30] and slot = 0;
    v := public.hr_town_view(0, v_probe, 8, 8, v_cur, 8, 8);
    if jsonb_array_length(v->'walkers') <> 0 or not (v->'gone' @> jsonb_build_array(jsonb_build_object('id', v_uids[30])))
       or jsonb_array_length(v->'gone') <> 1 then
      raise exception 'town-stands §6(f): a body that moved out of the window is not the one gone: %', v; end if;
    perform public.hr_town_place(v_uids[30], 0, v_probe, 'zz_square', 'idle');
    v := public.hr_town_view(0, v_probe, 8, 8, v_cur, 8, 8);
    if jsonb_array_length(v->'walkers') <> 1 or (v->'walkers'->0->>'id')::uuid <> v_uids[30] then
      raise exception 'town-stands §6(f): the one body that changed is not the whole delta: %', v->'walkers'; end if;
    -- a moved window reads the bodies that entered it, though they did not change
    v := public.hr_town_view(0, v_probe, 8, 8, v_cur, 39, 39);
    if jsonb_array_length(v->'walkers') < 50 then
      raise exception 'town-stands §6(f): bodies that entered a moved window were not read (%)', jsonb_array_length(v->'walkers'); end if;
    -- an expired cursor is answered whole
    if (public.hr_town_view(0, v_probe, 8, 8, floor(extract(epoch from now() - interval '5 minutes') * 1000000)::bigint, 8, 8)->>'full')::boolean is not true then
      raise exception 'town-stands §6(f): an expired cursor was answered as a delta'; end if;
    -- the rate gate
    update public.hr_rate_counters set n = 45, window_start = now() where user_id = v_uids[20] and bucket = 'town_view';
    if public.hr_town_view(0, v_probe, 8, 8, null, null, null)->>'error' is distinct from 'rate_limited' then
      raise exception 'town-stands §6(f): the 46th read in a minute was answered'; end if;
    raise exception using errcode = 'HR876', message = 'town-stands §6 complete - rolling back';
  exception when sqlstate 'HR876' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_bodies b where b.user_id::text like '000000c0-0000-4000-a000-7057%')
     or exists (select 1 from public.hr_town_maps where map_id = 'zz_town_probe')
     or exists (select 1 from public.player_state where user_id::text like '000000c0-0000-4000-a000-7057%') then
    raise exception 'town-stands §6: a probe row leaked'; end if;
  -- THE GRANTS: no client reaches a town table or an owner-only helper; the three verbs and the restated move are the client's
  if has_table_privilege('authenticated', 'public.town_bodies', 'select') or has_table_privilege('authenticated', 'public.town_bodies', 'insert')
     or has_table_privilege('authenticated', 'public.town_seen', 'select') or has_table_privilege('authenticated', 'public.town_moves', 'insert')
     or has_table_privilege('anon', 'public.town_bodies', 'select') or has_table_privilege('anon', 'public.town_moves', 'select')
     or has_function_privilege('authenticated', 'public.hr_town_place(uuid,integer,text,text,text,timestamp with time zone,text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_moves_settle(text,integer,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_seat(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_release(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_merge_party(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_bodies_at(text,integer,timestamp with time zone,uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_here(integer,text)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_go(integer,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_here(integer,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_go(integer,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)', 'execute') then
    raise exception 'town-stands §6: the grants are not exact'; end if;
  -- the signatures carry no user and no time: nobody can place another account's body
  if exists (select 1 from pg_proc p, unnest(p.proargtypes) t
              where p.oid in ('public.hr_town_here(integer,text)'::regprocedure, 'public.hr_town_go(integer,text)'::regprocedure,
                              'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)'::regprocedure)
                and t in ('uuid'::regtype, 'timestamptz'::regtype, 'timestamp'::regtype)) then
    raise exception 'town-stands §6: a client verb takes a user or a time'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-stands: one body a stand; unviewed workers at their stations; hunts out and back by the arrival; 61st player opens instance 2, parties and friends together; windowed reads capped, deltas only changes; all green';
end $chk$;
