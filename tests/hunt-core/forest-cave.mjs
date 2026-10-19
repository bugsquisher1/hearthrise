// tests/hunt-core/forest-cave.mjs — THE MEADOWBROOK THICKET AND THE COPPERCAP WARRENS (Tyler 10-18). Run by run-all.mjs.
//
//   packs-on-the-map    every pack tile at full density is open floor and listed in the map's spawns;
//                       every pull tile has a clear 3x3 (no wall, no prop): the full box (Tyler 10-18)
//   one-choke           every open ground tile lies in an open 3x3 except the bridge, no prop cuts the walk,
//                       and the bridge is a real choke: without it the far half of the route cannot be reached
//   route-walk-through  from the entrance, each pocket's pull tile is reached in route order on the
//                       real mask, and the last pocket walks back to the first (each ground is a loop)
//   density-full-box    every walked ground's slider tops out at 8; party size raises the cap
//   spawn-mix           (all four walked hunts) weights are uneven and ARE the packs' head-count (at
//                       density 4 with the slider), rarity labels never rank a rarer spawn above a commoner
//   gather-nodes        each node is a real TREES/ROCKS row of its skill, opens within 20 of the band top,
//                       stands on its map with its sprite, and a pocket's nodes cover the top gather share
//   walk-art            every creature of both grounds idles and walks in all 8 facings in a loaded atlas
//
// `--play` runs each ground ONCE on the real engine (supabase/functions/hr-accrue accrueHunt, the world
// tick's settle): a fresh solo hero from the start kit in the forest, a four-hero party in the cave,
// thirty sim-minutes each, and prints falls and gold against supplies. Evidence, not a gate.
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const NEW = ['meadowbrook_thicket', 'coppercap_warrens'];
const BRIDGE = { meadowbrook_thicket: [[28, 5], [29, 5], [30, 5], [31, 5], [32, 5]], coppercap_warrens: [[51, 20], [51, 21], [51, 22]] };
const MID_DENSITY = 4;
const RING8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

async function load(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  return {
    root,
    grounds: await imp('src/data/hunt-grounds.js'), hunts: await imp('src/data/hunts.js'), MONSTERS: (await imp('src/data/monsters.js')).MONSTERS,
    maps: await imp('src/data/world/maps/index.js'), terrain: await imp('src/data/world/terrain.js'), mapc: await imp('src/world/core/map-compile.js'),
    sets: await imp('src/data/world/atlas-sets.js'), gathering: await imp('src/data/gathering.js'), budget: await imp('src/data/world/art-budget.js'),
  };
}

function sprites(M) {
  const out = {};
  for (const set of M.sets.ATLAS_SETS) Object.assign(out, JSON.parse(readFileSync(join(M.root, 'assets/world/atlas-' + set + '.json'), 'utf8')).sprites);
  return out;
}

/* The walkable mask of a world map (solid materials and solid props block). */
function maskOf(M, mapId) {
  const row = M.maps.WORLD_MAPS.find((m) => m.id === mapId);
  if (!row) return null;
  const map = M.mapc.compileMap(row, { materials: M.terrain.MATERIALS, sprites: sprites(M), openClasses: M.terrain.OPEN_CLASSES, lights: {} });
  const open = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.mask[y * map.w + x] === 0;
  return { row, map, open };
}

/* Breadth-first reach over open tiles from `from`, with `closed` tiles treated as blocked. */
function reach(m, from, closed) {
  const shut = new Set((closed || []).map(([x, y]) => x + ',' + y));
  const seen = new Set([from.join(',')]);
  const q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (!seen.has(k) && !shut.has(k) && m.open(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  return seen;
}

/* Steps from `a` to `b` (4-way) with `closed` tiles blocked, or null. */
function dist(m, a, b, closed) {
  const shut = new Set((closed || []).map(([x, y]) => x + ',' + y));
  const seen = new Map([[a.join(','), 0]]);
  const q = [a];
  while (q.length) {
    const [x, y] = q.shift();
    const d = seen.get(x + ',' + y);
    if (x === b[0] && y === b[1]) return d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (!seen.has(k) && !shut.has(k) && m.open(x + dx, y + dy)) { seen.set(k, d + 1); q.push([x + dx, y + dy]); }
    }
  }
  return null;
}

/* The head-count of a walked hunt's packs (density 4 where it has the slider), bosses out. */
function headCount(M, g) {
  const n = {};
  g.pockets.forEach((p, i) => {
    for (const s of M.grounds.packAt(g, i, g.density ? MID_DENSITY : 99)) n[s.monster] = (n[s.monster] || 0) + 1;
  });
  return n;
}
const BOSSES = new Set(['rat_king', 'grayjaw', 'chief_coppercap']);

const cases = {
  'packs-on-the-map': (M) => {
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      const m = maskOf(M, g.map);
      if (!m) return id + ': no world map';
      for (const [i, p] of g.pockets.entries()) {
        for (const s of M.grounds.packAt(g, i, 8)) {
          if (!m.open(s.x, s.y)) return id + ' pocket ' + i + ': ' + s.monster + ' at ' + s.x + ',' + s.y + ' is not open floor';
          if (!m.row.spawns.some(([x, y]) => x === s.x && y === s.y)) return id + ' pocket ' + i + ': pack tile ' + s.x + ',' + s.y + ' is missing from the map spawns';
        }
        const [px, py] = p.pull;
        for (const [dx, dy] of [[0, 0], ...RING8]) {
          const x = px + dx, y = py + dy;
          if (!m.open(x, y)) return id + ' pocket ' + i + ': the full box round the pull tile ' + px + ',' + py + ' is blocked at ' + x + ',' + y;
          const prop = m.row.objects.find((o) => o.x === x && o.y === y);
          if (prop) return id + ' pocket ' + i + ': ' + prop.id + ' stands in the full box at ' + x + ',' + y;
        }
      }
    }
    return null;
  },
  'one-choke': (M) => {
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      const m = maskOf(M, g.map);
      const br = new Set(BRIDGE[id].map((t) => t.join(',')));
      for (const [x, y] of BRIDGE[id]) if (!m.open(x, y)) return id + ': the bridge tile ' + x + ',' + y + ' is not open';
      /* the passages are the GROUND's (props against a wall leave nooks, not passages); props are held
         to never cutting the walk: everything open on the ground, less the props' own tiles, is reached */
      const ground = (x, y) => x >= 0 && y >= 0 && x < m.map.w && y < m.map.h && !(M.terrain.MATERIALS[m.map.ground[y * m.map.w + x]] || {}).solid;
      const bare = reach({ open: ground }, m.row.start, []);
      const walked = reach(m, m.row.start, []);
      for (const k of bare) { const [x, y] = k.split(',').map(Number); if (m.open(x, y) && !walked.has(k)) return id + ': a prop cuts off ' + k + ' from the entrance'; }
      for (let y = 0; y < m.map.h; y++) for (let x = 0; x < m.map.w; x++) {
        if (!ground(x, y) || br.has(x + ',' + y)) continue;
        let ok = false;
        for (let oy = -2; oy <= 0 && !ok; oy++) for (let ox = -2; ox <= 0 && !ok; ox++) {
          let all = true;
          for (let dy = 0; dy < 3 && all; dy++) for (let dx = 0; dx < 3; dx++) {
            const ex = x + ox + dx, ey = y + oy + dy;
            const edge = ex < 0 || ey < 0 || ex >= m.map.w || ey >= m.map.h;
            if (!edge && !ground(ex, ey)) { all = false; break; }
          }
          if (all) ok = true;
        }
        if (!ok) return id + ': ' + x + ',' + y + ' is a passage narrower than 3 that is not the bridge (KIT §4b: one 1-tile choke)';
      }
      /* the route leans on it: some leg of the route walks over the bridge, and without it that leg is cut or longer */
      const legs = g.route.map((p, i) => [g.pockets[p].pull, g.pockets[g.route[(i + 1) % g.route.length]].pull]);
      if (!legs.some(([a, b]) => { const w = dist(m, a, b, []), wo = dist(m, a, b, BRIDGE[id]); return w !== null && (wo === null || wo > w); })) {
        return id + ': no leg of the route crosses the bridge, so it is no choke';
      }
    }
    return null;
  },
  'route-walk-through': (M) => {
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      const m = maskOf(M, g.map);
      const all = reach(m, m.row.start, []);
      for (const p of g.route) if (!all.has(g.pockets[p].pull.join(','))) return id + ': pocket ' + p + "'s pull tile cannot be walked to";
      /* the loop: the last pocket walks back to the first without passing the entrance */
      const last = g.pockets[g.route[g.route.length - 1]].pull, first = g.pockets[g.route[0]].pull;
      if (!reach(m, last, [m.row.start]).has(first.join(','))) return id + ': the last pocket does not walk back to the first';
    }
    return null;
  },
  'density-full-box': (M) => {
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      if (!g.density || g.density.max < 8) return id + ': the density slider tops out below the full box of 8';
      const caps = [1, 2, 3, 4].slice(0, g.start.length).map((n) => M.grounds.densityCapFor(g, n));
      if (caps.some((c, i) => i && c < caps[i - 1])) return id + ': a bigger party gets a lower cap ' + caps.join(',');
      if (caps[caps.length - 1] !== 8) return id + ': a full party cannot pull the full box (caps ' + caps.join(',') + ')';
      for (const [i] of g.pockets.entries()) {
        if (M.grounds.packAt(g, i, 8).length !== 8) return id + ' pocket ' + i + ': no full box';
        if (M.grounds.packAt(g, i, 1).length !== 1) return id + ' pocket ' + i + ': density 1 is not a single foe';
      }
    }
    return M.grounds.validate().length ? 'hunt-grounds: ' + M.grounds.validate().join('; ') : null;
  },
  'spawn-mix': (M) => {
    const RANK = { common: 3, uncommon: 2, rare: 1 };
    for (const id of ['mill_cellar', 'millrace_sewer', ...NEW]) {
      const h = M.hunts.HUNT_INDEX[id];
      const g = M.grounds.HUNT_GROUNDS[id];
      const n = headCount(M, g);
      for (const b of BOSSES) delete n[b];
      const w = Object.fromEntries(h.spawns.map((s) => [s.monster, s.w]));
      for (const k of new Set([...Object.keys(n), ...Object.keys(w)])) {
        if (n[k] !== w[k]) return id + ': ' + k + ' weighs ' + w[k] + ' but its packs hold ' + (n[k] || 0);
      }
      const labels = h.spawns.map((s) => s.rarity);
      if (labels.some((l) => !RANK[l])) return id + ': a spawn has no rarity label';
      if (!labels.includes('common') || !labels.includes('rare')) return id + ': a hunt needs a common majority and a rare spawn';
      for (const a of h.spawns) for (const b of h.spawns) {
        if (RANK[a.rarity] > RANK[b.rarity] && a.w < b.w) return id + ': ' + a.monster + ' is labelled ' + a.rarity + ' but is rarer than ' + b.monster;
      }
      const rare = Math.min(...h.spawns.filter((s) => s.rarity === 'rare').map((s) => s.w));
      const common = Math.max(...h.spawns.map((s) => s.w));
      if (!(common >= 3 * rare)) return id + ': the mix is too even (commonest ' + common + ', rarest ' + rare + ')';
    }
    return null;
  },
  'gather-nodes': (M) => {
    const rows = Object.fromEntries([...M.gathering.TREES.map((r) => [r.id, ['woodcutting', r]]), ...M.gathering.ROCKS.map((r) => [r.id, ['mining', r]])]);
    const spr = sprites(M);
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      const h = M.hunts.HUNT_INDEX[id];
      const m = maskOf(M, g.map);
      const nodes = M.grounds.gatherNodesOf(g);
      if (!nodes.length) return id + ': no gather nodes';
      for (const nd of nodes) {
        const r = rows[nd.node];
        if (!r) return id + ': node ' + nd.id + ' is not a TREES/ROCKS row (' + nd.node + ')';
        if (r[0] !== nd.skill || nd.tool.skill !== nd.skill || nd.tool.required) return id + ': node ' + nd.id + ' skill or tool is wrong';
        if (r[1].req > h.band[1] + 20) return id + ': node ' + nd.id + ' needs ' + r[1].req + ', over the band top + 20';
        if (!m.row.objects.some((o) => o.id === nd.sprite && o.x === nd.x && o.y === nd.y)) return id + ': node ' + nd.id + ' has no ' + nd.sprite + ' on the map at its tile';
        if (!spr[nd.spent]) return id + ': node ' + nd.id + "'s spent sprite " + nd.spent + ' is in no loaded atlas';
      }
      /* the top share: the gap is refKillMs x s/(1-s); a pocket's nodes must hold that many actions */
      const s = g.gather.shares[g.gather.shares.length - 1] / 1000;
      const gapMs = g.gather.refKillMs * s / (1 - s);
      for (const p of g.route) {
        const here = nodes.filter((nd) => nd.pocket === p);
        if (!here.length) continue;
        const ms = Math.min(...here.map((nd) => rows[nd.node][1].ms));
        const need = Math.ceil(gapMs / ms), have = here.reduce((a, nd) => a + nd.charges, 0);
        if (have < need) return id + ' pocket ' + p + ': ' + have + ' node actions, the top share works ' + need;
      }
    }
    return null;
  },
  'walk-art': (M) => {
    const spr = sprites(M);
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      const kinds = new Set(g.pockets.flatMap((p, i) => M.grounds.packAt(g, i, 8).map((s) => s.monster)));
      for (const k of kinds) {
        const s = spr[k];
        if (!s) return id + ': ' + k + ' has no sprite in a loaded atlas';
        for (const a of ['idle', 'walk']) for (const d of M.budget.FACINGS) if (!(s.anims[a] && s.anims[a].dirs[d] && s.anims[a].dirs[d].length)) return id + ': ' + k + ' has no ' + a + ' ' + d;
      }
    }
    return null;
  },
};

const mutants = [
  { name: 'a pack tile moved into the thicket', case: 'packs-on-the-map',
    edits: [['src/data/hunt-grounds.js', "box([5, 13, 21, 24], [15, 19],", "box([5, 13, 21, 24], [21, 15],"]] },
  { name: 'a prop dropped into a full box', case: 'packs-on-the-map',
    edits: [['src/data/world/maps/coppercap_warrens.js', "{ id: 'cw_plank_bridge', x: 51, y: 22 },", "{ id: 'cw_plank_bridge', x: 51, y: 22 }, { id: 'mushrooms', x: 38, y: 9 },"]] },
  { name: 'the Drop bridged two wide', case: 'one-choke',
    edits: [['src/data/world/maps/coppercap_warrens.js', "'#######...#####################################~~~~=~~~~~~##',\n    '#######...#####################################~~~~=~~~~~~##',\n    '#######...#####################################~~~~=~~~~~~##',",
      "'#######...#####################################~~~==~~~~~~##',\n    '#######...#####################################~~~==~~~~~~##',\n    '#######...#####################################~~~==~~~~~~##',"]] },
  { name: 'the full box cut to six', case: 'density-full-box',
    edits: [['src/data/hunt-grounds.js', 'density: density(4, 2, 8),', 'density: density(4, 2, 6),']] },
  { name: 'a weight that lies about the packs', case: 'spawn-mix',
    edits: [['src/data/hunts.js', "{ monster: 'gray_wolf', w: 10, rarity: 'common' }", "{ monster: 'gray_wolf', w: 5, rarity: 'common' }"]] },
  { name: 'a rare spawn as common as the commons', case: 'spawn-mix',
    edits: [['src/data/hunts.js', "{ monster: 'hobgoblin_foreman', w: 1, rarity: 'rare' }", "{ monster: 'hobgoblin_foreman', w: 1, rarity: 'common' }"]] },
  { name: 'a node with no tree on the map', case: 'gather-nodes',
    edits: [['src/data/hunt-grounds.js', "['oak_tree', 40, 3, 2]", "['oak_tree', 41, 3, 2]"]] },
  { name: 'a pocket too bare for the top gather share', case: 'gather-nodes',
    edits: [['src/data/hunt-grounds.js', "copper_rock: kind('mining', 1, 6,", "copper_rock: kind('mining', 1, 2,"]] },
];

function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-forest-cave-'));
  for (const d of ['src/core', 'src/data', 'src/world', 'assets/world']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
  cpSync(join(ROOT, 'src/build-info.js'), join(root, 'src/build-info.js'));
  for (const [file, from, to] of edits) {
    const f = join(root, file);
    const src = readFileSync(f, 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error('plant: ' + file + ' has ' + n + ' copies of the anchor ' + JSON.stringify(from.slice(0, 60)));
    writeFileSync(f, src.replace(from, to));
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}

const R = makeReport('hunt-core/forest-cave');
const M = await load(ROOT);
if (process.argv.includes('--play')) {
  const { play } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  await play(ROOT);
  process.exit(0);
}
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    const PM = await load(p.root);
    try { why = cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
