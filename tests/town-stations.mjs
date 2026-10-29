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
//   ST-9 one town to walk (Tyler 2026-10-26: "some areas we can't walk between"): every open tile is
//        reachable from the gatehouse arrival (each pocket that is not is listed with its size), and every
//        tile of every WAY (town/plan.js WAYS: the high street, the gate road, the bridges, the east gate,
//        the mine road, the south road, the boardwalk) is open and reachable, so a footprint, a fence or a
//        prop dropped on a road can never cut the town in two
//   ST-11 a cook works at a cook fire: the kitchen's first stands (one per hero of an account) touch a spit or cauldron
//   ST-8 arrival (the SERVER hands out the arrival station's stands, lowest first:
//        2027-01-28-town-stands.sql): it has a primary stand for each of an account's
//        heroes, and each of the first ones is in a landscape phone's view (844 x 390
//        CSS, 64 CSS px a tile) of the gatehouse's front, so a hero back from a hunt
//        sees the gate it came through
// ST-1's "in plain view" covers every placed thing, trees included: the selftest
// plants a stand right behind a tree's canopy and must see ST-1 go red.
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
  const budget = await imp('src/data/world/art-budget.js');
  const manifests = {};
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const tables = { materials: terrain.MATERIALS, sprites: book.sprites, openClasses: terrain.OPEN_CLASSES, treeClasses: terrain.TREE_CLASSES, lights: terrain.LIGHTS, terrains: book.terrains };
  M = { stations, plan, maps, mapc, path, skills, gathering, windows, hunts, tables, terrain, grids: budget.GRIDS };
} catch (e) { console.error('town-stations: harness — ' + (e && e.stack || e)); process.exit(2); }

/** A landscape phone's view (CSS px) and the town's sprite of the gate a hunt comes back through. */
const PHONE = Object.freeze([844, 390]);
const GATE_SPRITE = 'havora_gatehouse';
/** ST-11: the kitchen pieces a cook cooks over (src/data/world/stations.js FIRES). */
const COOK_FIRES = Object.freeze(['havora_cook_spit', 'havora_cook_cauldron']);
/** ST-10: how far past a blocker a way is looked for, and the widest strip of rock that may not cut a way. */
const DEAD_END_SPAN = 12, CLIFF_STRIP = 4;

/** Every rule over `S` (the stations module's shape: STATIONS, STATION_BY_ID, ACTIVITY_STATIONS, stationFor, TOWN_INSTANCE, SITE_OPENS, TAP_OPENS). */
function check(S, editRow = null) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ' ' + msg); };
  /* the shipped town row, or a copy changed by `editRow` (the selftest's planted map defect) */
  const shipped = M.maps.WORLD_MAPS.find((m) => m.id === M.plan.TOWN_MAP);
  const row = editRow ? editRow(Object.assign({}, shipped, { objects: shipped.objects.slice() })) : shipped;
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
  want({ kind: 'artisan', skill: 'inner_flame' }, 'artisan', 'inner_flame');
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

  /* ST-9 one town to walk: no open pocket the arrival cannot reach, no way blocked or cut off */
  const pocket = new Uint8Array(map.w * map.h);
  for (let i = 0; i < map.w * map.h; i++) {
    if (map.mask[i] !== 0 || reach[i] === 1 || pocket[i]) continue;
    let n = 0;
    const todo = [i];
    pocket[i] = 1;
    while (todo.length) {
      const at = todo.pop(), x = at % map.w, y = (at - x) / map.w;
      n++;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ddx, ny = y + ddy, j = ny * map.w + nx;
        if (nx >= 0 && ny >= 0 && nx < map.w && ny < map.h && map.mask[j] === 0 && !pocket[j]) { pocket[j] = 1; todo.push(j); }
      }
    }
    ok('ST-9', false, 'a pocket of ' + n + ' open tile(s) at ' + (i % map.w) + ',' + Math.floor(i / map.w) + ' cannot be reached from the gatehouse arrival');
  }
  for (const way of M.plan.WAYS) {
    const [wx, wy] = M.plan.at(way.rect[0], way.rect[1]);
    const cut = [];
    for (let y = wy; y < wy + way.rect[3]; y++) for (let x = wx; x < wx + way.rect[2]; x++) {
      const i = y * map.w + x;
      if (x < 0 || y < 0 || x >= map.w || y >= map.h || map.mask[i] !== 0 || reach[i] !== 1) cut.push(x + ',' + y);
    }
    ok('ST-9', cut.length === 0, way.name + ' is blocked or cut off at ' + cut.slice(0, 6).join(' ') + (cut.length > 6 ? ' (+' + (cut.length - 6) + ')' : ''));
  }

  /* ST-10 NO DEAD END (lane/a-havora-dock, Tyler 2026-10-26: "should be able to walk here"): a walkable way (road, yard,
     planks, gravel) that runs straight into water, a strip of cliff at most CLIFF_STRIP wide, or a placed thing that is
     not a building (piers side by side over open water are not a dead end) and comes out the other side within DEAD_END_SPAN tiles must be crossable there or close by: the walk
     between the two sides is at most 3 x the gap + 12. A building lot or a market stall standing between two streets is
     the town's plan; water and a thin strip of rock never are (a bridge, a dock or a lane goes there). */
  const WAYS_GROUND = new Set(['earth', 'cobble', 'flagstone', 'planks', 'gravel', 'setts']);
  const BUILT = new Set(['lot', 'hall', 'building', 'landmark', 'stall']);
  const owner = new Map();
  for (const o of map.objects) {
    if (M.tables.openClasses.includes(o.cls)) continue;
    for (let y = o.y; y < o.y + o.fh; y++) for (let x = o.x; x < o.x + o.fw; x++) owner.set(y * map.w + x, o);
  }
  const free = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.mask[y * map.w + x] === 0;
  const wayAt = (x, y) => free(x, y) && WAYS_GROUND.has(map.ground[y * map.w + x]);
  const distFrom = (sx, sy) => {
    const d = new Int32Array(map.w * map.h).fill(-1), q = [sy * map.w + sx];
    d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], x = a % map.w, y = (a - x) / map.w;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(x + ddx, y + ddy) && d[(y + ddy) * map.w + x + ddx] < 0) { d[(y + ddy) * map.w + x + ddx] = d[a] + 1; q.push((y + ddy) * map.w + x + ddx); }
    }
    return d;
  };
  const dead = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (!wayAt(x, y)) continue;
    for (const [ddx, ddy] of [[1, 0], [0, 1]]) {
      if (free(x + ddx, y + ddy)) continue;
      let k = 1, kinds = new Set();
      while (k <= DEAD_END_SPAN && !free(x + ddx * k, y + ddy * k)) {
        const i = (y + ddy * k) * map.w + x + ddx * k, o = owner.get(i);
        kinds.add(o ? (BUILT.has(o.cls) ? 'built' : 'thing') : map.ground[i] === 'water' ? 'water' : 'rock');
        k++;
      }
      if (k > DEAD_END_SPAN || !wayAt(x + ddx * k, y + ddy * k) || kinds.has('built')) continue;
      if (kinds.has('rock') && !kinds.has('water') && !kinds.has('thing') && k - 1 > CLIFF_STRIP) continue;
      /* two piers side by side with open water between are a harbour, not a dead end */
      const planksAt = (px, py) => map.ground[py * map.w + px] === 'planks';
      if (kinds.has('water') && !kinds.has('rock') && planksAt(x, y) && planksAt(x + ddx * k, y + ddy * k)) continue;
      const d = distFrom(x, y)[(y + ddy * k) * map.w + x + ddx * k];
      if (d < 0 || d > 3 * k + 12) dead.push(x + ',' + y + ' -> ' + (x + ddx * k) + ',' + (y + ddy * k) + ' (' + [...kinds].join('+') + ', walk ' + d + ')');
    }
  }
  ok('ST-10', dead.length === 0, dead.length + ' way(s) run into a dead end with the way going on beyond: ' + dead.slice(0, 6).join('; '));

  /* ST-8 arrival: the server's first stands of the arrival station, each in a phone's view of the gate */
  const gate = S.STATION_BY_ID[S.ACTIVITY_STATIONS.arrival];
  const heroes = S.TOWN_INSTANCE.heroesPerPlayer;
  ok('ST-8', !!gate && gate.primary >= heroes, 'the arrival station needs a primary stand for each of an account\'s ' + heroes + ' heroes');
  const house = map.objects.find((o) => o.id === GATE_SPRITE);
  ok('ST-8', !!house, 'no ' + GATE_SPRITE + ' on the town map');
  if (gate && house) {
    const tileCss = M.grids.base.T * M.grids.base.density;
    const half = [Math.floor(PHONE[0] / tileCss / 2), Math.floor(PHONE[1] / tileCss / 2)];
    const front = house.y + (house.fh || 1) - 1, mid = house.x + (house.fw || 1) / 2;
    for (const [x, y] of gate.stands.slice(0, heroes)) {
      ok('ST-8', y - front <= half[1] && Math.abs(x - mid) <= half[0], 'arrival stand ' + x + ',' + y + ' is out of a phone\'s view of the gate (front row '
        + front + ', ' + half[0] + ' x ' + half[1] + ' tiles each side)');
    }
  }
  /* ST-11 a cook works AT A COOK FIRE (playtest 2026-10-29 #13: the first cook stood at the bread oven's foot on the
     yard's path): the kitchen's first stands, one per hero of an account (the server hands out the lowest free), each
     touch a spit fire's or a cauldron's footprint */
  const kitchen = S.STATION_BY_ID[S.ACTIVITY_STATIONS.artisan.cooking];
  const fires = map.objects.filter((o) => COOK_FIRES.includes(o.id));
  ok('ST-11', !!kitchen && fires.length > 0, 'no cook fire (' + COOK_FIRES.join(', ') + ') on the town map');
  if (kitchen) {
    for (const [x, y] of kitchen.stands.slice(0, heroes)) {
      const at = fires.find((o) => x >= o.x - 1 && x <= o.x + (o.fw || 1) && y >= o.y - 1 && y <= o.y + (o.fh || 1));
      ok('ST-11', !!at, 'the kitchen\'s stand ' + x + ',' + y + ' (among its first ' + heroes + ') is at no cook fire');
    }
  }
  return fails;
}

/** A writable copy of the stations module with `edit` applied (the selftest's planted defect). */
function planted(edit) {
  const S = M.stations;
  const rows = S.STATIONS.map((s) => Object.assign({}, s, { stands: s.stands.map((t) => t.slice()), props: s.props.slice() }));
  const copy = { STATIONS: rows, STATION_BY_ID: Object.fromEntries(rows.map((s) => [s.id, s])), ACTIVITY_STATIONS: S.ACTIVITY_STATIONS,
    stationFor: S.stationFor, TOWN_INSTANCE: S.TOWN_INSTANCE, SITE_OPENS: Object.assign({}, S.SITE_OPENS), TAP_OPENS: S.TAP_OPENS };
  edit(copy);
  return copy;
}

/** An open, reachable tile right north of a tree of the town (its canopy is drawn over a hero standing there). */
function behindTree() {
  const row = M.maps.WORLD_MAPS.find((m) => m.id === M.plan.TOWN_MAP);
  const map = M.mapc.compileMap(row, M.tables);
  const reach = M.path.reachFrom(map.mask, map.w, map.h, row.start);
  const trees = map.objects.filter((o) => M.terrain.TREE_CLASSES.includes((M.tables.sprites[o.id] || {}).class));
  for (const t of trees) {
    const x = t.x, y = t.y - 1, i = y * map.w + x;
    if (y >= 0 && map.mask[i] === 0 && reach[i] === 1) return [x, y];
  }
  throw new Error('no open tile behind a tree of the town');
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
    ['ST-1', 'a stand right behind a tree', (c) => { by(c, 'westwood').stands[0] = behindTree(); }],
    ['ST-8', 'the first arrivals stand by the tavern wall, out of a phone\'s view of the gate', (c) => {
      const g = by(c, 'gatehouse'); g.stands = g.stands.slice(g.primary).concat(g.stands.slice(0, g.primary)); }],
    ['ST-8', 'fewer arrival stands than an account\'s heroes', (c) => { by(c, 'gatehouse').primary = 3; }],
    ['ST-11', 'the bread ovens listed first again (the first cook at the oven on the path)', (c) => {
      const k = by(c, 'tavern_kitchen'); k.stands = k.stands.slice(8, 12).concat(k.stands.slice(0, 8), k.stands.slice(12)); }],
  ];
  /* ST-9's planted map defects: one road tile blocked by a crate; one open tile fenced in by four */
  const crate = (px, py) => { const [x, y] = M.plan.at(px, py); return { id: 'crates', x, y }; };
  const mapCases = [
    ['ST-9', 'a crate dropped on one tile of the high street', (r) => { r.objects.push(crate(40, 50)); return r; }],
    ['ST-9', 'a crate on one plank of the boardwalk', (r) => { r.objects.push(crate(100, 89)); return r; }],
    ['ST-9', 'an open tile fenced in by four crates', (r) => {
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) r.objects.push(crate(-14 + ddx, 46 + ddy));
      return r; }],
    /* ST-10: the gate road's bridge deck turned back into river, planks and all (the road runs into the water on both banks) */
    ['ST-10', 'the mill race bridge\'s deck back to water', (r) => {
      r.rows = r.rows.map((s, y) => (y >= 16 && y <= 19 ? s.slice(0, 113) + '~~~~~~~~~~~~' + s.slice(125) : s));
      return r; }],
    /* ST-10: Tyler's dead end (live v0.2.52): the east dock and the yard across from it, cut apart by a strip of rock */
    ['ST-10', 'a strip of rock between the east dock and the estates\' lane', (r) => {
      r.rows = r.rows.map((s, y) => (y >= 80 && y <= 83 ? s.slice(0, 160) + '^^' + s.slice(162) : s));
      return r; }],
  ];
  const control = check(planted(() => {}));
  if (control.length) { console.error('town-stations --selftest: the clean control is red:\n  ' + control.slice(0, 5).join('\n  ')); process.exit(1); }
  let escaped = 0;
  for (const [rule, what, edit] of cases) {
    const got = check(planted(edit));
    if (got.some((f) => f.startsWith(rule + ' '))) console.log('  caught  ' + rule + '  ' + what);
    else { escaped++; console.error('  ESCAPED ' + rule + '  ' + what + (got.length ? ' (red elsewhere: ' + got[0] + ')' : '')); }
  }
  for (const [rule, what, editRow] of mapCases) {
    const got = check(M.stations, editRow);
    if (got.some((f) => f.startsWith(rule + ' '))) console.log('  caught  ' + rule + '  ' + what);
    else { escaped++; console.error('  ESCAPED ' + rule + '  ' + what + (got.length ? ' (red elsewhere: ' + got[0] + ')' : '')); }
  }
  const all = cases.length + mapCases.length;
  console.log('town-stations --selftest: ' + (all - escaped) + '/' + all + ' caught');
  process.exit(escaped ? 1 : 0);
}

const fails = check(M.stations);
if (fails.length) {
  console.error('town-stations: ' + fails.length + ' finding(s)');
  for (const f of fails.slice(0, 40)) console.error('  ✗ ' + f);
  process.exit(1);
}
const n = M.stations.STATIONS.reduce((a, s) => a + s.stands.length, 0);
console.log('town-stations: ' + M.stations.STATIONS.length + ' stations, ' + n + ' stands, every one walkable, unique, in its district and at the plan\'s count; '
  + M.plan.WAYS.length + ' ways open and the whole town reachable from the gatehouse');
