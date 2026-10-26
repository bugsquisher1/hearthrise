#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-stations.mjs — EVERY HERO IN HAVORA HAS A PLACE TO STAND
//
//   node tests/town-stations.mjs             the guard
//   node tests/town-stations.mjs --selftest  every planted defect must be caught
//
// The real town (docs/planning/PRIORITY_BOARD.md "Real town plan (2026-10-25)":
// 60 players, 240 bodies): src/data/world/stations.js names every station's
// stands, which the server will hand out one hero to a stand (L2). Over the
// shipped town map (src/data/world/maps/town_common.js, compiled with the real
// atlas manifests):
//   ST-1 every stand is a walkable tile of the map, reachable from the start, in
//        plain view (nothing drawn over a hero standing there), and not a map exit
//   ST-2 no tile is two stands (across every station), and no stand is a prop
//   ST-3 every stand lies inside its station's district (town/plan.js DISTRICTS)
//   ST-4 counts: each station at least the plan's stands, Hearth Square >= 130,
//        the town >= 545 (>= 1.25 x 240 bodies' worst case, rounded up by the plan)
//   ST-5 the chain: every fallback names a station and none loops; every station's
//        props are placed on the map
//   ST-6 activity → station: every gathering node, every artisan skill, training,
//        every hunt and arrival resolves to a station of the right kind and skill;
//        a hunt with a way in from town leaves from beside it
//   ST-7 taps: every opened window is a shell window, every opened skill a skill
//   ST-8 arrival: arrivalStand picks a primary gatehouse stand, and an account's
//        four heroes get four different ones
// --selftest plants one defect per rule into a copy of the stations (never the
// tree) and requires that rule to go red, after a clean control.
// mutant-anchors: none — the proof mutates in-memory station rows, never the tree
//
// Exit: 0 green · 1 a finding or an escaped mutant · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href + V);

/* THE PLAN'S COUNTS (worst → stands, PRIORITY_BOARD "Real town plan" rev 2): a station may hold more, never fewer */
const PLAN_MIN = Object.freeze({
  shop: 40, storage: 40, tally: 15, hunter: 13, gatehouse: 50, tavern_kitchen: 26, training_yard: 24,
  shore: 40, river_bank: 13, mine: 30, rune_block: 15, westwood: 40, farm: 30, hearth: 24,
});
const PLAN_GROUPS = Object.freeze({ hearth_square: Object.freeze([['hearth', 'hearth_square', 'square_benches'], 130]),
  smithy: Object.freeze([['smithy_forges', 'smithy_benches'], 40]) });
const TOWN_MIN = 545;

let M;
try {
  const [stations, plan, maps, mapc, path, terrain, bookm, sets, skills, gathering, windows, hunts] = await Promise.all([
    'src/data/world/stations.js', 'src/data/world/town/plan.js', 'src/data/world/maps/index.js', 'src/world/core/map-compile.js',
    'src/world/core/path.js', 'src/data/world/terrain.js', 'src/world/core/book.js', 'src/data/world/atlas-sets.js', 'src/data/skills.js',
    'src/data/gathering.js', 'src/data/shell-windows.js', 'src/data/hunts.js'].map(imp));
  const manifests = {};
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const tables = { materials: terrain.MATERIALS, sprites: book.sprites, openClasses: terrain.OPEN_CLASSES, treeClasses: terrain.TREE_CLASSES, lights: terrain.LIGHTS, terrains: book.terrains };
  M = { stations, plan, maps, mapc, path, skills, gathering, windows, hunts, tables };
} catch (e) { console.error('town-stations: harness — ' + (e && e.stack || e)); process.exit(2); }

/** Every rule over `S` (the stations module's shape: STATIONS, STATION_BY_ID, ACTIVITY_STATIONS, stationFor, arrivalStand, SITE_OPENS, TAP_OPENS). */
function check(S) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ' ' + msg); };
  const row = M.maps.WORLD_MAPS.find((m) => m.id === M.plan.TOWN_MAP);
  const map = M.mapc.compileMap(row, M.tables);
  const reach = M.path.reachFrom(map.mask, map.w, map.h, row.start);
  const exits = new Set(map.exits.map((e) => e.x + ',' + e.y));
  const props = new Set(map.objects.map((o) => o.x + ',' + o.y));
  const seen = new Map();
  let total = 0;
  for (const s of S.STATIONS) {
    ok('ST-1', s.stands.length > 0 && s.primary > 0 && s.primary <= s.stands.length, s.id + ' has no primary stand');
    const d = M.plan.DISTRICTS[s.district];
    ok('ST-3', !!d, s.id + ' names unknown district ' + s.district);
    const [dx, dy] = d ? M.plan.at(d.rect[0], d.rect[1]) : [0, 0];
    s.stands.forEach(([x, y], i) => {
      const k = x + ',' + y, name = s.id + '#' + i + ' at ' + k;
      const inside = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.w && y < map.h;
      ok('ST-1', inside && map.mask[y * map.w + x] === 0, name + ' is not a walkable tile');
      ok('ST-1', inside && reach[y * map.w + x] === 1, name + ' cannot be reached from the start');
      ok('ST-1', inside && !(map.overlap[y * map.w + x] & M.mapc.OVER), name + ' is drawn behind something: a hero there would be hidden');
      ok('ST-1', !exits.has(k), name + ' is a map exit');
      ok('ST-2', !seen.has(k), name + ' is also ' + seen.get(k));
      ok('ST-2', !props.has(k), name + ' is a placed prop');
      seen.set(k, s.id + '#' + i);
      if (d) ok('ST-3', x >= dx && y >= dy && x < dx + d.rect[2] && y < dy + d.rect[3], name + ' is outside ' + s.district);
    });
    total += s.stands.length;
    if (PLAN_MIN[s.id] != null) ok('ST-4', s.stands.length >= PLAN_MIN[s.id], s.id + ' has ' + s.stands.length + ' stands, the plan needs ' + PLAN_MIN[s.id]);
    for (const p of s.props) ok('ST-5', map.objects.some((o) => o.id === p.id && o.x === p.x && o.y === p.y), s.id + ' prop ' + p.id + ' at ' + p.x + ',' + p.y + ' is not on the map');
    /* the fallback chain ends without a loop */
    const chain = new Set([s.id]);
    let f = s.fallback;
    while (f) {
      ok('ST-5', !!S.STATION_BY_ID[f], s.id + ' falls back to unknown station ' + f);
      if (!S.STATION_BY_ID[f] || chain.has(f)) { ok('ST-5', !chain.has(f), s.id + ' fallback chain loops at ' + f); break; }
      chain.add(f); f = S.STATION_BY_ID[f].fallback;
    }
  }
  for (const [g, [ids, min]] of Object.entries(PLAN_GROUPS)) {
    const n = ids.reduce((a, id) => a + (S.STATION_BY_ID[id] ? S.STATION_BY_ID[id].stands.length : 0), 0);
    ok('ST-4', n >= min, g + ' has ' + n + ' stands, the plan needs ' + min);
  }
  ok('ST-4', total >= TOWN_MIN, 'the town has ' + total + ' stands, the plan needs ' + TOWN_MIN);
  for (const id of Object.keys(PLAN_MIN).concat(...Object.values(PLAN_GROUPS).map((x) => x[0]))) ok('ST-4', !!S.STATION_BY_ID[id], 'the plan\'s station ' + id + ' is missing');

  /* ST-6 activity → station */
  const want = (a, kind, skill) => {
    const id = S.stationFor(a), st = S.STATION_BY_ID[id];
    ok('ST-6', !!st && (kind === null || st.kind === kind) && (skill === undefined || st.skill === skill), JSON.stringify(a) + ' stands at ' + id + ', not a ' + kind + ' station' + (skill ? ' of ' + skill : ''));
    return st;
  };
  const G = M.gathering;
  for (const [skill, nodes] of [['woodcutting', G.TREES], ['mining', G.ROCKS], ['fishing', G.FISH_SPOTS], ['farming', Object.keys(G.CROPS).map((id) => ({ id }))]]) {
    for (const n of nodes) want({ kind: 'gather', skill, node: n.id }, 'gather', skill);
  }
  for (const [id, def] of Object.entries(M.skills.SKILLS_DEF)) if (def.cat === 'artisan') want({ kind: 'artisan', skill: id }, 'artisan', id);
  want({ kind: 'artisan', skill: 'prayer' }, 'artisan', 'prayer');
  want({ kind: 'training' }, 'training');
  want({ kind: 'arrival' }, 'arrival');
  want({ kind: 'idle' }, 'idle');
  want(null, 'idle');
  for (const h of Object.values(M.hunts.HUNT_INDEX)) {
    const hm = M.maps.WORLD_MAPS.find((m) => (m.hunts || []).includes(h.id));
    const st = want({ kind: 'hunt', map: hm ? hm.id : null }, null);
    const exit = hm && map.exits.find((e) => e.to === hm.id);
    if (st && exit) ok('ST-6', st.stands.every(([x, y]) => Math.max(Math.abs(x - exit.x), Math.abs(y - exit.y)) <= 4), h.id + ' leaves from ' + st.id + ', not beside its way in at ' + exit.x + ',' + exit.y);
  }

  /* ST-7 taps */
  const winIds = new Set(M.windows.SHELL_WINDOWS.map((w) => w.id));
  for (const o of Object.values(S.TAP_OPENS).concat(Object.values(S.SITE_OPENS))) {
    if (o.open === 'window') ok('ST-7', winIds.has(o.window), 'a tap opens unknown window ' + o.window);
    else ok('ST-7', o.open === 'skill' && !!M.skills.SKILLS_DEF[o.skill], 'a tap opens unknown screen ' + JSON.stringify(o));
  }
  for (const key of Object.keys(S.SITE_OPENS)) {
    const [mapId, xy] = key.split(':'), [x, y] = xy.split(',').map(Number);
    ok('ST-7', mapId === row.id && map.objects.some((o) => o.x === x && o.y === y), 'SITE_OPENS ' + key + ' names no placed prop');
  }

  /* ST-8 arrival */
  const gate = S.STATION_BY_ID[S.ACTIVITY_STATIONS.arrival];
  const four = [0, 1, 2, 3].map((slot) => S.arrivalStand('5f0c6a1e-0000-4000-8000-00000000abcd', slot));
  ok('ST-8', !!gate && four.every((t) => gate.stands.slice(0, gate.primary).some((s) => s[0] === t[0] && s[1] === t[1])), 'arrivalStand must pick a primary gatehouse stand: ' + JSON.stringify(four));
  ok('ST-8', new Set(four.map(String)).size === 4, 'an account\'s four heroes must arrive on four stands: ' + JSON.stringify(four));
  return fails;
}

/** A writable copy of the stations module with `edit` applied (the selftest's planted defect). */
function planted(edit) {
  const S = M.stations;
  const rows = S.STATIONS.map((s) => Object.assign({}, s, { stands: s.stands.map((t) => t.slice()), props: s.props.slice() }));
  const copy = { STATIONS: rows, STATION_BY_ID: Object.fromEntries(rows.map((s) => [s.id, s])), ACTIVITY_STATIONS: S.ACTIVITY_STATIONS,
    stationFor: S.stationFor, arrivalStand: S.arrivalStand, SITE_OPENS: Object.assign({}, S.SITE_OPENS), TAP_OPENS: S.TAP_OPENS };
  edit(copy);
  return copy;
}

if (process.argv.includes('--selftest')) {
  const by = (c, id) => c.STATION_BY_ID[id];
  const cases = [
    ['ST-1', 'a stand on the river', (c) => { by(c, 'river_bank').stands[0] = [M.plan.at(91, 56)[0], 56]; }],
    ['ST-1', 'a stand inside a building footprint', (c) => { by(c, 'shop').stands[0] = M.plan.at(110, 30).slice(); }],
    ['ST-2', 'two stations share a stand', (c) => { by(c, 'square_benches').stands[0] = by(c, 'storage').stands[0].slice(); }],
    ['ST-3', 'a stand outside its district', (c) => { by(c, 'tavern_kitchen').stands.push(M.plan.at(30, 50).slice()); }],
    ['ST-4', 'the gatehouse below the plan', (c) => { by(c, 'gatehouse').stands.length = 30; }],
    ['ST-4', 'Hearth Square below 130', (c) => { by(c, 'hearth_square').stands.length = 40; }],
    ['ST-5', 'a fallback loop', (c) => { by(c, 'square_benches').fallback = 'hearth'; }],
    ['ST-6', 'cooking stands at the forge', (c) => { c.stationFor = (a) => (a && a.skill === 'cooking' ? 'smithy_forges' : M.stations.stationFor(a)); }],
    ['ST-6', 'the sewer leaves from the gatehouse', (c) => { c.stationFor = (a) => (a && a.kind === 'hunt' ? 'gatehouse' : M.stations.stationFor(a)); }],
    ['ST-7', 'a tap opening a window that does not exist', (c) => { c.SITE_OPENS[Object.keys(c.SITE_OPENS)[0]] = { open: 'window', window: 'no_such_window' }; }],
    ['ST-8', 'every hero arrives on one tile', (c) => { c.arrivalStand = () => by(c, 'gatehouse').stands[0]; }],
  ];
  const control = check(planted(() => {}));
  if (control.length) { console.error('town-stations --selftest: the clean control is red:\n  ' + control.slice(0, 5).join('\n  ')); process.exit(1); }
  let escaped = 0;
  for (const [rule, what, edit] of cases) {
    const got = check(planted(edit));
    if (got.some((f) => f.startsWith(rule + ' '))) console.log('  caught  ' + rule + '  ' + what);
    else { escaped++; console.error('  ESCAPED ' + rule + '  ' + what + (got.length ? ' (red elsewhere: ' + got[0] + ')' : '')); }
  }
  console.log('town-stations --selftest: ' + (cases.length - escaped) + '/' + cases.length + ' caught');
  process.exit(escaped ? 1 : 0);
}

const fails = check(M.stations);
if (fails.length) {
  console.error('town-stations: ' + fails.length + ' finding(s)');
  for (const f of fails.slice(0, 40)) console.error('  ✗ ' + f);
  process.exit(1);
}
const n = M.stations.STATIONS.reduce((a, s) => a + s.stands.length, 0);
console.log('town-stations: ' + M.stations.STATIONS.length + ' stations, ' + n + ' stands, every one walkable, unique, in its district and at the plan\'s count');
