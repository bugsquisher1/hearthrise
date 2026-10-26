#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-town-stations.mjs — GENERATE THE TOWN'S STATIONS AND STANDS CATALOGUE.
//
// src/data/world/stations.js TOWN_STATIONS is the single source of where every
// body in a town stands (a station per activity, its stands in order, the
// overflow after them), and TOWN_INSTANCE of how many players one town
// instance holds and how far a viewer reads. Postgres must know both to do
// what only it may (supabase/migrations/2027-01-28-town-stands.sql): hold one
// stand per body under a unique key, place an UNVIEWED hero at its station
// from its activity pointer, and open a second instance for the player who
// would not fit. Emitted here as:
//   hr_town_maps          + players, heroes, view_w, view_h, margin, view_cap, main
//                         (and w, h from the map row itself)
//   hr_town_stations      one row per station (role, the tile it faces, order)
//   hr_town_stands        one row per stand (station, index 1..N, tile, facing, overflow)
//   hr_town_station_hosts which activity stands where: (kind, skill|*, id|*) -> station
//   hr_town_station_for() THE ONE RESOLVER (id, then skill, then kind; else the map's idle
//                         station), a catalogue reader both this file's self-check and the
//                         runtime use
//
//   Regenerate:  node tools/gen-town-stations.mjs
//   Verify:      node tools/gen-town-stations.mjs --check     (exit 1 on drift: the twin guard)
//   Selftest:    node tools/gen-town-stations.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a station map that is not a kind:'town' map row, a town
// map with no stations; a bad or duplicate station id, an unknown role; a stand off the map,
// on a tile a hero cannot stand on or reach from the map's start, or on a tile another stand
// already holds; a map without exactly one 'idle' station or without an 'arrive' station for
// every hunt; a host naming an unknown kind, skill or id, or claimed by two stations; a gather
// node, a bench recipe or a hunt that lands nowhere; fewer stands than one player's heroes.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* The dated file this generator writes. A NEW catalogue (a new town) is a new dated file; an applied one stays as
   history (2027-01-26-town-stations.generated.sql: the 24x14 Common seed, APPLIED 10-26). */
export const OUT_FILE = '2027-01-29-havora-stations.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);

export const ROLES = Object.freeze(['work', 'arrive', 'idle', 'visit', 'bench']);
export const HOST_KINDS = Object.freeze(['gather', 'artisan', 'training', 'combat']);
const DIRS = ['n', 's', 'e', 'w'];
const ID = /^[a-z0-9_]{1,40}$/;
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** The facing of a stand at [x, y] toward `face` (the dominant axis; a tie faces east/west), 's' with none. */
export function facingOf(x, y, face) {
  if (!face) return 's';
  const dx = face[0] - x, dy = face[1] - y;
  if (dx === 0 && dy === 0) return 's';
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

/** Every gather node id by skill, every bench recipe id by skill, every hunt id: what must land somewhere. */
function activities(D) {
  const gather = { woodcutting: D.gathering.TREES, mining: D.gathering.ROCKS, fishing: D.gathering.FISH_SPOTS };
  const out = [];
  for (const [skill, nodes] of Object.entries(gather)) for (const n of nodes) out.push({ kind: 'gather', skill, id: n.id });
  for (const [skill, list] of Object.entries(D.recipes.ARTISAN_RECIPES)) for (const r of list) out.push({ kind: 'artisan', skill, id: r.id });
  for (const h of D.hunts.HUNTS) out.push({ kind: 'combat', skill: null, id: h.id });
  return out;
}

/** The station an activity lands on (the server rule, hr_town_station_for): id, then skill, then kind; else null. */
export function resolve(hosts, a) {
  const rank = (h) => (h.id === a.id ? 0 : h.id === '*' && h.skill !== '*' && h.skill === a.skill ? 1 : h.id === '*' && h.skill === '*' ? 2 : 9);
  let best = null;
  for (const h of hosts) if (h.kind === a.kind && rank(h) < 9 && (!best || rank(h) < rank(best))) best = h;
  return best ? best.station : null;
}

/**
 * THE REAL TOWN'S SHAPE (lane/b-town-map, L1: src/data/world/stations.js STATIONS + ACTIVITY_STATIONS) as this
 * generator's rows, per map: kind idle -> 'idle' (ACTIVITY_STATIONS.idle) or 'bench' (another idle place: the
 * benches), arrival / hunt -> 'arrive', service -> 'visit', gather / artisan / training -> 'work'; `stands` are
 * primary then overflow (`primary` of them primary), each facing its station's nearest prop; `fallback` kept; the
 * hosts from ACTIVITY_STATIONS (a skill, a node id, training, and `arrival`: where every hunt sets its heroes down).
 * Pure. With no STATIONS export the seed's TOWN_STATIONS rows are used as they are.
 */
export function townStations(stations) {
  const { STATIONS, ACTIVITY_STATIONS: A, TOWN_STATIONS } = stations;
  if (!Array.isArray(STATIONS)) return TOWN_STATIONS || {};
  const roleOf = (s) => (s.kind === 'idle' ? (s.id === A.idle ? 'idle' : 'bench') : s.kind === 'arrival' || s.kind === 'hunt' ? 'arrive'
    : s.kind === 'service' ? 'visit' : ['gather', 'artisan', 'training'].includes(s.kind) ? 'work' : s.kind);
  const hostsOf = (id) => [
    ...Object.entries(A.gather || {}).filter(([, st]) => st === id).map(([skill]) => ({ kind: 'gather', skill })),
    ...Object.entries(A.node || {}).filter(([, st]) => st === id).map(([node]) => ({ kind: 'gather', ids: [node] })),
    ...Object.entries(A.artisan || {}).filter(([, st]) => st === id).map(([skill]) => ({ kind: 'artisan', skill })),
    ...(A.training === id ? [{ kind: 'training' }] : []),
    ...(A.arrival === id ? [{ kind: 'combat' }] : []),
  ];
  const out = {};
  for (const s of STATIONS) {
    const props = (s.props || []).map((p) => [p.x, p.y]);
    const facing = ([x, y]) => {
      let best = null, bd = Infinity;
      for (const q of props) { const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d > 0 && d < bd) { bd = d; best = q; } }
      return [x, y, facingOf(x, y, best)];
    };
    const tiles = (s.stands || []).map(facing);
    const n = Number.isInteger(s.primary) ? s.primary : tiles.length;
    (out[s.map] = out[s.map] || []).push({ id: s.id, role: roleOf(s), hosts: hostsOf(s.id), face: null,
      stands: tiles.slice(0, n), overflow: tiles.slice(n), fallback: s.fallback || null });
  }
  return out;
}

/**
 * The catalogue rows for the data, validated. `walkable(mapId)` answers (x, y) -> boolean for a tile a hero
 * can stand on AND reach from the map's start (the compiled mask; tests may pass a stub).
 */
export function catalogue(D, walkable) {
  const { TOWN_INSTANCE } = D.stations;
  const TOWN_STATIONS = townStations(D.stations);
  const towns = D.maps.WORLD_MAPS.filter((m) => m.kind === 'town');
  const problems = [];
  const P = (m) => problems.push(m);
  const I = TOWN_INSTANCE || {};
  for (const k of ['players', 'heroesPerPlayer', 'margin', 'cap']) if (!Number.isInteger(I[k]) || I[k] < 1) P('TOWN_INSTANCE.' + k + ' is not a positive whole number');
  if (!Array.isArray(I.view) || I.view.length !== 2 || !I.view.every((v) => Number.isInteger(v) && v >= 1 && v <= 64)) P('TOWN_INSTANCE.view is not [w, h] tiles');
  if (I.players > 500 || I.heroesPerPlayer > 8 || I.margin > 32 || I.cap > 500) P('TOWN_INSTANCE is out of the server bounds (players 500, heroes 8, margin 32, cap 500)');
  const skills = new Set(Object.keys(D.skills.SKILLS_DEF));
  const known = activities(D);
  const knownIds = new Map(HOST_KINDS.map((k) => [k, new Set(known.filter((a) => a.kind === k).map((a) => a.id))]));
  const maps = [], stations = [], stands = [], hosts = [];
  for (const mapId of Object.keys(TOWN_STATIONS || {})) {
    const row = towns.find((m) => m.id === mapId);
    if (!row) { P('TOWN_STATIONS names ' + mapId + ', which is no kind:\'town\' map row'); continue; }
  }
  for (const row of towns) {
    const list = (TOWN_STATIONS || {})[row.id];
    if (!Array.isArray(list) || !list.length) { P('town map ' + row.id + ' has no stations'); continue; }
    const w = row.rows[0].length, h = row.rows.length;
    const ok = walkable(row.id);
    const tiles = new Map();
    const ids = new Set();
    const mapHosts = [];
    let n = 0;
    list.forEach((s, ord) => {
      if (!s || !ID.test(String(s.id))) { P(row.id + ': a station id ' + JSON.stringify(s && s.id) + ' is not [a-z0-9_]{1,40}'); return; }
      if (ids.has(s.id)) P(row.id + ': station ' + s.id + ' is listed twice');
      ids.add(s.id);
      if (!ROLES.includes(s.role)) P(row.id + '/' + s.id + ': role ' + s.role + ' is not one of ' + ROLES.join('/'));
      const face = s.face || null;
      if (face && !(face.length === 2 && face.every(Number.isInteger) && face[0] >= 0 && face[0] < w && face[1] >= 0 && face[1] < h)) P(row.id + '/' + s.id + ': face ' + JSON.stringify(face) + ' is off the map');
      const all = [...(s.stands || []).map((t) => [t, false]), ...(s.overflow || []).map((t) => [t, true])];
      if (!(s.stands || []).length) P(row.id + '/' + s.id + ': a station with no stands');
      stations.push({ map: row.id, id: s.id, role: s.role, fx: face ? face[0] : null, fy: face ? face[1] : null, ord: ord + 1, fallback: s.fallback || null });
      all.forEach(([t, over], i) => {
        const [x, y, d] = Array.isArray(t) ? t : [];
        const where = row.id + '/' + s.id + ' stand ' + (i + 1) + ' ' + JSON.stringify(t);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) { P(where + ' is off the ' + w + 'x' + h + ' map'); return; }
        if (d !== undefined && !DIRS.includes(d)) P(where + ': facing ' + d + ' is not n/s/e/w');
        if (!ok(x, y)) P(where + ' is a tile a hero cannot stand on or reach from the start');
        const k = x + ',' + y;
        if (tiles.has(k)) P(where + ' is the tile ' + tiles.get(k) + ' already holds');
        tiles.set(k, s.id + ' stand ' + (i + 1));
        stands.push({ map: row.id, station: s.id, no: i + 1, x, y, dir: d || facingOf(x, y, face), over });
        n++;
      });
      for (const hst of s.hosts || []) {
        if (!HOST_KINDS.includes(hst.kind)) { P(row.id + '/' + s.id + ': host kind ' + hst.kind + ' is not one of ' + HOST_KINDS.join('/')); continue; }
        if (hst.skill !== undefined && !skills.has(hst.skill)) P(row.id + '/' + s.id + ': host skill ' + hst.skill + ' is no skill');
        if (hst.kind === 'combat' && s.role !== 'arrive') P(row.id + '/' + s.id + ': a hunt sets its heroes down only on an arrive station');
        if (hst.kind !== 'combat' && s.role !== 'work') P(row.id + '/' + s.id + ': a town activity lands only on a work station');
        const idsOf = Array.isArray(hst.ids) && hst.ids.length ? hst.ids : ['*'];
        for (const id of idsOf) {
          if (id !== '*' && !(knownIds.get(hst.kind) || new Set()).has(id) && hst.kind !== 'training') P(row.id + '/' + s.id + ': host id ' + hst.kind + ':' + id + ' is no such activity');
          mapHosts.push({ map: row.id, kind: hst.kind, skill: id === '*' ? (hst.skill || '*') : '*', id, station: s.id });
        }
      }
    });
    const keys = new Set();
    for (const hst of mapHosts) {
      const k = hst.kind + '|' + hst.skill + '|' + hst.id;
      if (keys.has(k)) P(row.id + ': host ' + k + ' is claimed by two stations');
      keys.add(k);
    }
    /* a full station's next hero goes to its fallback (another station of this map), then the benches */
    for (const s of list) if (s && s.fallback && (s.fallback === s.id || !list.some((o) => o && o.id === s.fallback)))
      P(row.id + '/' + s.id + ': fallback ' + s.fallback + ' is not another station of this map');
    const idle = list.filter((s) => s && s.role === 'idle');
    if (idle.length !== 1) P(row.id + ': ' + idle.length + ' idle stations (want exactly 1)');
    for (const a of known) {
      if (a.kind === 'combat') {
        const st = resolve(mapHosts, a);
        if (!st) P(row.id + ': the hunt ' + a.id + ' sets its heroes down nowhere (no arrive station hosts it)');
      } else if (!resolve(mapHosts, a)) P(row.id + ': ' + a.kind + ' ' + a.id + ' (' + a.skill + ') lands on no station');
    }
    if (n < I.heroesPerPlayer) P(row.id + ': ' + n + ' stands cannot hold one player\'s ' + I.heroesPerPlayer + ' heroes');
    hosts.push(...mapHosts);
    maps.push({ id: row.id, w, h, stands: n, main: row.id === D.maps.SCENE_MAPS.town });
  }
  if (!maps.some((m) => m.main)) P('the town scene map ' + D.maps.SCENE_MAPS.town + ' has no stations');
  if (problems.length) throw new Error('gen-town-stations: ' + problems.join('; '));
  return { maps, stations, stands, hosts, instance: I };
}

/** The generated SQL for the data. Throws on anything the server would have to guess about. */
export function buildSql(D, walkable) {
  const C = catalogue(D, walkable);
  const I = C.instance;
  const mapIds = 'array[' + C.maps.map((m) => lit(m.id)).join(', ') + ']::text[]';
  const nul = (v) => (v === null || v === undefined ? 'null' : String(v));
  const mapRows = C.maps.map((m) => `  (${lit(m.id)}, ${lit(m.id)}, ${m.w}, ${m.h}, ${I.players}, ${I.heroesPerPlayer}, ${I.view[0]}, ${I.view[1]}, ${I.margin}, ${I.cap}, ${m.main})`);
  const stRows = C.stations.map((s) => `  (${lit(s.map)}, ${lit(s.id)}, ${lit(s.role)}, ${nul(s.fx)}, ${nul(s.fy)}, ${s.ord}, ${s.fallback ? lit(s.fallback) : 'null'})`);
  const sdRows = C.stands.map((s) => `  (${lit(s.map)}, ${lit(s.station)}, ${s.no}, ${s.x}, ${s.y}, ${lit(s.dir)}, ${s.over})`);
  const hRows = C.hosts.map((h) => `  (${lit(h.map)}, ${lit(h.kind)}, ${lit(h.skill)}, ${lit(h.id)}, ${lit(h.station)})`);
  const sizeRows = C.maps.map((m) => `(${lit(m.id)}, ${m.w}, ${m.h})`).join(', ');
  const per = C.maps.map((m) => `${m.id} ${m.stands} stands = ${Math.min(I.players, Math.floor(m.stands / I.heroesPerPlayer))} players per instance`).join(', ');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Generated by tools/gen-town-stations.mjs from src/data/world/stations.js
-- (TOWN_STATIONS, TOWN_INSTANCE) and the town map rows (src/data/world/maps).
-- Do not hand-edit: any hand edit FAILS \`node tools/gen-town-stations.mjs --check\`.
-- The town maps' size (w, h: the bound of every hr_town_move tile), the town
-- instance size and the viewer's read window, every station and stand, and THE
-- ONE RESOLVER of which station an activity stands at. Stations, stands and
-- hosts of the generated maps are replaced whole; a body left holding a stand
-- that no longer exists is released, and a released hero still working a town
-- activity is noted (town_moves), so the next town read sets it down at its
-- new station (2027-01-28-town-stands.sql's machinery; skipped on a chain
-- without it). A client that still draws an older, smaller map keeps working:
-- its tiles stay inside the new bound, and it never reads stands.
-- No value moves. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

alter table public.hr_town_maps add column if not exists players  smallint not null default 60 check (players between 1 and 500);
alter table public.hr_town_maps add column if not exists heroes   smallint not null default 4 check (heroes between 1 and 8);
alter table public.hr_town_maps add column if not exists view_w   smallint not null default 22 check (view_w between 1 and 64);
alter table public.hr_town_maps add column if not exists view_h   smallint not null default 14 check (view_h between 1 and 64);
alter table public.hr_town_maps add column if not exists margin   smallint not null default 8 check (margin between 0 and 32);
alter table public.hr_town_maps add column if not exists view_cap smallint not null default 120 check (view_cap between 1 and 500);
alter table public.hr_town_maps add column if not exists main     boolean  not null default false;
create unique index if not exists hr_town_maps_one_main on public.hr_town_maps (main) where main;

create table if not exists public.hr_town_stations (
  map_id     text     not null references public.hr_town_maps (map_id) on delete cascade,
  station_id text     not null check (station_id ~ '^[a-z0-9_]{1,40}$'),
  role       text     not null check (role in ('work', 'arrive', 'idle', 'visit', 'bench')),
  face_x     smallint check (face_x between 0 and 255),
  face_y     smallint check (face_y between 0 and 255),
  ord        smallint not null check (ord >= 1),
  fallback   text     check (fallback ~ '^[a-z0-9_]{1,40}$'),   -- where its full station's next hero goes, before the benches
  primary key (map_id, station_id)
);
alter table public.hr_town_stations add column if not exists fallback text check (fallback ~ '^[a-z0-9_]{1,40}$');
create table if not exists public.hr_town_stands (
  map_id     text     not null,
  station_id text     not null,
  stand_no   smallint not null check (stand_no between 1 and 999),
  x          smallint not null check (x between 0 and 255),
  y          smallint not null check (y between 0 and 255),
  dir        text     not null check (dir in ('n', 's', 'e', 'w')),
  overflow   boolean  not null,
  primary key (map_id, station_id, stand_no),
  unique (map_id, x, y),
  foreign key (map_id, station_id) references public.hr_town_stations (map_id, station_id) on delete cascade
);
create table if not exists public.hr_town_station_hosts (
  map_id      text not null,
  kind        text not null check (kind in ('gather', 'artisan', 'training', 'combat')),
  skill       text not null check (skill = '*' or skill ~ '^[a-z_]{1,32}$'),
  activity_id text not null check (activity_id = '*' or activity_id ~ '^[a-z0-9_]{1,64}$'),
  station_id  text not null,
  primary key (map_id, kind, skill, activity_id),
  foreign key (map_id, station_id) references public.hr_town_stations (map_id, station_id) on delete cascade
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_town_stations', 'hr_town_stands', 'hr_town_station_hosts'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;

insert into public.hr_town_maps (map_id, zone_id, w, h, players, heroes, view_w, view_h, margin, view_cap, main) values
${mapRows.join(',\n')}
  on conflict (map_id) do update set w = excluded.w, h = excluded.h, players = excluded.players, heroes = excluded.heroes,
    view_w = excluded.view_w, view_h = excluded.view_h, margin = excluded.margin, view_cap = excluded.view_cap, main = excluded.main;

delete from public.hr_town_station_hosts where map_id = any (${mapIds});
delete from public.hr_town_stands where map_id = any (${mapIds});
delete from public.hr_town_stations where map_id = any (${mapIds});
insert into public.hr_town_stations (map_id, station_id, role, face_x, face_y, ord, fallback) values
${stRows.join(',\n')};
insert into public.hr_town_stands (map_id, station_id, stand_no, x, y, dir, overflow) values
${sdRows.join(',\n')};
insert into public.hr_town_station_hosts (map_id, kind, skill, activity_id, station_id) values
${hRows.join(',\n')};

-- THE ONE RESOLVER: the station an activity stands at on a town map. Its id first, then its skill (the
-- server's own activity catalogue, hr_activities.req_skill), then its kind; an activity no host names (and
-- idle) stands on the map's idle station. Owner-only: a catalogue reader for the town-stands RPCs.
create or replace function public.hr_town_station_for(p_map text, p_kind text, p_id text)
returns text language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce(
    (select h.station_id from public.hr_town_station_hosts h
      where h.map_id = p_map and h.kind = p_kind
        and (h.activity_id = p_id
             or (h.activity_id = '*' and h.skill = '*')
             or (h.activity_id = '*' and h.skill = (select a.req_skill from public.hr_activities a
                                                    where a.kind = p_kind and a.activity_id = p_id)))
      order by case when h.activity_id = p_id then 0 when h.skill <> '*' then 1 else 2 end
      limit 1),
    (select s.station_id from public.hr_town_stations s where s.map_id = p_map and s.role = 'idle' order by s.ord limit 1))
$fn$;
revoke execute on function public.hr_town_station_for(text, text, text) from public, anon, authenticated, service_role;

-- A body left on a stand this file removed is released (the table exists from 2027-01-28-town-stands.sql on), and
-- a released hero still working a town activity is noted, so the next town read sets it down at its new station.
do $mig$
begin
  if to_regclass('public.town_bodies') is not null then
    with gone as (
      update public.town_bodies b set station_id = null, stand_no = null, why = 'gone', from_x = null, from_y = null, changed_at = now()
       where b.station_id is not null
         and not exists (select 1 from public.hr_town_stands s
                          where s.map_id = b.map_id and s.station_id = b.station_id and s.stand_no = b.stand_no)
      returning b.user_id, b.slot)
    insert into public.town_moves (user_id, slot, from_hunt, at)
      select g.user_id, g.slot, null, now() from gone g join public.player_state ps on ps.user_id = g.user_id and ps.slot = g.slot
       where ps.active_kind in ('gather', 'artisan', 'training')
         and not exists (select 1 from public.town_moves m where m.user_id = g.user_id and m.slot = g.slot);
  end if;
end $mig$;

-- SELF-CHECK (CLAUDE.md §4): the rows are exactly the data's; every stand is on its map and no two share a tile;
-- one idle station a map; every gather node and bench in the SERVER's own activity catalogue (hr_activities)
-- stands at a work station, every hunt sets its heroes down on an arrive station; a free stand exists for every
-- seated hero; no client reaches the catalogue or the resolver.
do $$
declare v_role text; v_bad text; v_map text;
begin
  if (select count(*) from public.hr_town_stations where map_id = any (${mapIds})) <> ${C.stations.length}
     or (select count(*) from public.hr_town_stands where map_id = any (${mapIds})) <> ${C.stands.length}
     or (select count(*) from public.hr_town_station_hosts where map_id = any (${mapIds})) <> ${C.hosts.length}
     or (select count(*) from public.hr_town_maps where main) <> 1 then
    raise exception 'town-stations: the rows are not the generated set'; end if;
  select s.station_id || ' ' || s.stand_no into v_bad from public.hr_town_stands s join public.hr_town_maps m using (map_id)
   where s.x >= m.w or s.y >= m.h limit 1;
  if v_bad is not null then raise exception 'town-stations: stand % is off its map', v_bad; end if;
  -- THE SIZE: each map row is the client map's size (the bound of every hr_town_move tile), inside the 0..255 tiles
  -- every position and stand column holds, and hr_town_move bounds a tile by the row, never by a constant
  select m.map_id into v_bad from public.hr_town_maps m
    join (values ${sizeRows}) d(map_id, w, h) using (map_id)
   where m.w <> d.w or m.h <> d.h or m.w > 256 or m.h > 256 limit 1;
  if v_bad is not null then raise exception 'town-stations: map % is not the size of its map row', v_bad; end if;
  if to_regprocedure('public.hr_town_move(integer,text,integer,integer,integer,integer,text)') is not null
     and position('p_x >= v_map.w' in pg_get_functiondef('public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure)) = 0 then
    raise exception 'town-stations: hr_town_move no longer bounds a tile by hr_town_maps'; end if;
  -- no body holds a stand this catalogue does not have (one released above is placed again by its next read)
  if to_regclass('public.town_bodies') is not null then
    execute 'select b.user_id || '':'' || b.slot from public.town_bodies b where b.station_id is not null
               and not exists (select 1 from public.hr_town_stands s
                                where s.map_id = b.map_id and s.station_id = b.station_id and s.stand_no = b.stand_no) limit 1' into v_bad;
    if v_bad is not null then raise exception 'town-stations: body % holds a stand the catalogue does not have', v_bad; end if;
  end if;
  select m.map_id into v_bad from public.hr_town_maps m
   where m.map_id = any (${mapIds})
     and ((select count(*) from public.hr_town_stations s where s.map_id = m.map_id and s.role = 'idle') <> 1
          or (select count(*) from public.hr_town_stands s where s.map_id = m.map_id) < m.heroes)
   limit 1;
  if v_bad is not null then raise exception 'town-stations: map % has not exactly one idle station or too few stands for one player', v_bad; end if;
  select s.station_id into v_bad from public.hr_town_stations s
   where s.fallback is not null and (s.fallback = s.station_id
     or not exists (select 1 from public.hr_town_stations f where f.map_id = s.map_id and f.station_id = s.fallback))
   limit 1;
  if v_bad is not null then raise exception 'town-stations: station % falls back to no other station of its map', v_bad; end if;
  foreach v_map in array ${mapIds} loop
    select a.kind || ':' || a.activity_id into v_bad from public.hr_activities a
     where a.kind in ('gather', 'artisan')
       and (select s.role from public.hr_town_stations s
             where s.map_id = v_map and s.station_id = public.hr_town_station_for(v_map, a.kind, a.activity_id)) is distinct from 'work'
     limit 1;
    if v_bad is not null then raise exception 'town-stations: % on % stands at no work station', v_bad, v_map; end if;
    select h.hunt_id into v_bad from public.hr_hunts h
     where (select s.role from public.hr_town_stations s
             where s.map_id = v_map and s.station_id = public.hr_town_station_for(v_map, 'combat', h.hunt_id)) is distinct from 'arrive'
     limit 1;
    if v_bad is not null then raise exception 'town-stations: hunt % sets its heroes down on no arrive station of %', v_bad, v_map; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_town_stations', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_town_stands', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_town_station_hosts', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_town_station_for(text,text,text)', 'execute') then
      raise exception 'town-stations: % reaches the catalogue', v_role; end if;
  end loop;
  raise notice 'town-stations: ${C.stations.length} stations, ${C.stands.length} stands, ${C.hosts.length} hosts (${per}); all green';
end $$;
`;
}

/** The data, read from a tree (the repo, or a mutant copy). */
export async function inputs(root) {
  const u = (p) => pathToFileURL(join(root, ...p.split('/'))).href;
  const [stations, maps, gathering, recipes, hunts, skills] = await Promise.all(['src/data/world/stations.js', 'src/data/world/maps/index.js',
    'src/data/gathering.js', 'src/data/recipes.js', 'src/data/hunts.js', 'src/data/skills.js'].map((p) => import(u(p))));
  return { stations, maps, gathering, recipes, hunts, skills };
}

/** (mapId) -> (x, y) -> walkable and reachable from the start, from the compiled collision mask (the World's own). */
export async function walkableFrom(root) {
  const u = (p) => pathToFileURL(join(root, ...p.split('/'))).href;
  const [mapc, bookm, terrain, sets, maps, path] = await Promise.all(['src/world/core/map-compile.js', 'src/world/core/book.js',
    'src/data/world/terrain.js', 'src/data/world/atlas-sets.js', 'src/data/world/maps/index.js', 'src/world/core/path.js'].map((p) => import(u(p))));
  const manifests = {};
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(root, 'assets', 'world', 'atlas-' + set + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const tables = { materials: terrain.MATERIALS, sprites: book.sprites, openClasses: terrain.OPEN_CLASSES, treeClasses: terrain.TREE_CLASSES,
    lights: terrain.LIGHTS, terrains: book.terrains };
  const cache = new Map();
  return (mapId) => {
    if (!cache.has(mapId)) {
      const row = maps.WORLD_MAPS.find((m) => m.id === mapId);
      const m = mapc.compileMap(row, tables);
      const seen = path.reachFrom(m.mask, m.w, m.h, m.start);
      cache.set(mapId, (x, y) => path.walkable(m.mask, m.w, m.h, x, y) && !!seen[y * m.w + x]);
    }
    return cache.get(mapId);
  };
}

async function selftest() {
  const D = await inputs(ROOT);
  const walk = await walkableFrom(ROOT);
  let bad = 0;
  const expectThrow = (name, fn) => { try { fn(); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  const town = D.maps.SCENE_MAPS.town;
  /* the town's rows as this generator reads them (the real town's STATIONS, or a seed's TOWN_STATIONS), planted in a copy */
  const ROWS = townStations(D.stations);
  const withStations = (edit) => {
    const list = JSON.parse(JSON.stringify(ROWS[town]));
    edit(list);
    return { ...D, stations: { ...D.stations, STATIONS: undefined, TOWN_STATIONS: { ...ROWS, [town]: list } } };
  };
  const work = (list) => list.find((s) => s.role === 'work');
  /* a work station's own prop tile (a forge, a rock): a hero cannot stand on it */
  const propped = (D.stations.STATIONS || []).find((s) => s.map === town && s.props.length && ['gather', 'artisan'].includes(s.kind));
  const arrive = (list) => list.find((s) => (s.hosts || []).some((h) => h.kind === 'combat'));
  expectThrow('a stand off the map', () => buildSql(withStations((l) => { work(l).stands.push([999, 1]); }), walk));
  expectThrow('a stand on a blocked tile (a prop itself)', () => buildSql(withStations((l) => {
    const s = propped ? l.find((r) => r.id === propped.id) : work(l);
    s.stands.push(propped ? [propped.props[0].x, propped.props[0].y] : s.face.slice());
  }), walk));
  expectThrow('two stations on one tile', () => buildSql(withStations((l) => { const a = l.filter((s) => s.role === 'work'); a[1].stands.push(a[0].stands[0].slice()); }), walk));
  expectThrow('a duplicate station id', () => buildSql(withStations((l) => { l[1].id = l[0].id; }), walk));
  expectThrow('an unknown role', () => buildSql(withStations((l) => { l[0].role = 'loiter'; }), walk));
  expectThrow('no idle station', () => buildSql(withStations((l) => { for (const s of l) if (s.role === 'idle') s.role = 'bench'; }), walk));
  expectThrow('two idle stations', () => buildSql(withStations((l) => { for (const s of l) if (s.role === 'bench') s.role = 'idle'; }), walk));
  expectThrow('a gather skill that lands nowhere', () => buildSql(withStations((l) => { for (const s of l) s.hosts = (s.hosts || []).filter((h) => h.skill !== 'mining'); }), walk));
  expectThrow('a bench skill that lands nowhere', () => buildSql(withStations((l) => { for (const s of l) s.hosts = (s.hosts || []).filter((h) => h.skill !== 'cooking'); }), walk));
  expectThrow('a hunt that sets its heroes down nowhere', () => buildSql(withStations((l) => { for (const s of l) s.hosts = (s.hosts || []).filter((h) => h.kind !== 'combat'); }), walk));
  expectThrow('a host skill that is no skill', () => buildSql(withStations((l) => { work(l).hosts.push({ kind: 'gather', skill: 'fletching' }); }), walk));
  expectThrow('a host id that is no activity', () => buildSql(withStations((l) => { work(l).hosts.push({ kind: 'gather', ids: ['moon_rock'] }); }), walk));
  expectThrow('one host on two stations', () => buildSql(withStations((l) => { const a = l.filter((s) => s.role === 'work'); a[1].hosts.push(Object.assign({}, a[0].hosts[0])); }), walk));
  expectThrow('a hunt landing on a work station', () => buildSql(withStations((l) => { work(l).hosts.push({ kind: 'combat', ids: [D.hunts.HUNTS[0].id] }); }), walk));
  expectThrow('a stand with a bad facing', () => buildSql(withStations((l) => { arrive(l).stands[0][2] = 'up'; }), walk));
  expectThrow('an instance of 0 players', () => buildSql({ ...D, stations: { ...D.stations, TOWN_INSTANCE: { ...D.stations.TOWN_INSTANCE, players: 0 } } }, walk));
  expectThrow('a town map with no stations', () => buildSql({ ...D, stations: { ...D.stations, STATIONS: undefined, TOWN_STATIONS: {} } }, walk));
  expectThrow('a fallback that is no station', () => buildSql(withStations((l) => { work(l).fallback = 'nowhere'; }), walk));
  expectThrow('a station that falls back to itself', () => buildSql(withStations((l) => { work(l).fallback = work(l).id; }), walk));
  /* THE REAL TOWN'S SHAPE (STATIONS + ACTIVITY_STATIONS) reads into the same catalogue as its generator rows, and its
     second idle place (the benches) is a bench, not a second idle station */
  {
    const a = catalogue(D, walk), b = catalogue({ ...D, stations: { ...D.stations, STATIONS: undefined, TOWN_STATIONS: ROWS } }, walk);
    const key = (c) => JSON.stringify([c.stations, c.stands, c.hosts]);
    if (!Array.isArray(D.stations.STATIONS) || key(a) !== key(b)) { console.error('  MISSED  the real town shape does not read as its rows'); bad++; }
    else console.log('  caught  nothing: the real town shape reads as its rows (stations, stands, overflow, hosts)');
    const idleKind = D.stations.STATIONS.filter((s) => s.map === town && s.kind === 'idle');
    const roles = new Set(a.stations.filter((s) => idleKind.some((k) => k.id === s.id)).map((s) => s.role));
    if (idleKind.length < 2 || !roles.has('bench') || a.stations.filter((s) => s.role === 'idle').length !== 1) { console.error('  MISSED  a second idle place of the real town is not a bench'); bad++; }
    else console.log('  caught  a second idle place of the real town read as an idle station');
  }
  if (facingOf(7, 8, [6, 8]) !== 'w' || facingOf(6, 7, [6, 8]) !== 's' || facingOf(6, 9, [6, 8]) !== 'n' || facingOf(4, 8, [6, 8]) !== 'e') {
    console.error('  MISSED  a stand does not face its station'); bad++;
  } else console.log('  caught  a stand that does not face its station');
  const sql = buildSql(D, walk);
  if (!/unique \(map_id, x, y\)/.test(sql)) { console.error('  MISSED  two stands may share a tile in the catalogue'); bad++; }
  if (!/revoke execute on function public\.hr_town_station_for/.test(sql)) { console.error('  MISSED  the resolver is client-executable'); bad++; }
  if (bad) { console.error('gen-town-stations --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-town-stations --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const wanted = buildSql(await inputs(ROOT), await walkableFrom(ROOT));
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) {
      console.error('gen-town-stations --check FAILED: ' + OUT_FILE + ' is stale. Run: node tools/gen-town-stations.mjs');
      process.exit(1);
    }
    console.log('gen-town-stations --check: catalogue matches src/data/world/stations.js and the town maps');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-town-stations: wrote ' + OUT_FILE);
}

if (isMain(import.meta.url)) main();
