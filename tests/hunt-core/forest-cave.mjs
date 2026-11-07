// tests/hunt-core/forest-cave.mjs — THE MEADOWBROOK THICKET, THE COPPERCAP WARRENS (Tyler 10-18) AND MOSSLIGHT GLADE. Run by run-all.mjs.
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
//   staged-until-art    (Mosslight Glade, lane c-ground-16-31) a ground is OPEN only on shipped style-1 art (its map
//                       in WORLD_MAPS on a painted ground an atlas carries; walk-art below); a STAGED one (hunts.js
//                       `staged`) is not in the Hunts window, its map only in STAGED_MAPS, and both generators leave it
//                       out of the server catalogue (hr_hunt_enter refuses it)
//   walk-art            every creature of every OPEN walked ground idles and walks in all 8 facings in a loaded atlas
//   sim-plays-the-server-map  what the fixture's run plays (the hunt guards, tools/balance-sim) is, tile for tile, the grid the edge settle plays, on every ground
//   glade-solo-floor    a solo Melee in the ladder kit at the glade's floor (L16) plays the hour with no death on the six
//                       seeds; prints the practice-sword-and-Thicket-leather graduate beside it (evidence)
//   glade-between       at each floor (6-seed median per hero-hour): the Sewer's party < the glade solo in its four plate pieces < the
//                       Warrens' party, in net gold AND Level XP, and the glade in those four pieces clears +25% over its bill (Tyler 2026-11-07: judged properly equipped)
//   harder-pays-more    a kill's expected gold climbs with hp x attack, and the same hero at one Level earns more an hour on the ground above (Tyler 2026-11-03)
//   wickstead-solo-floor  (Wickstead, lane b-greenhaven-6; staged, played on its fitted grid) a ladder-kit Melee alone at
//                       its floor (L8) lives the hour on the six seeds, clears +25%, and nets and levels no worse than
//                       the Thicket at the Thicket's floor; the start kit's hour is printed (evidence)
//   shop-outfits-defense  the Shop's gear (designer 2026-10-22) sells no slot a walked ground's regular gear drops (a Rare
//                       named piece may share a slot with a Shop basic), has gloves and
//                       a belt a new hero can afford (one medium), and a start-kit Melee at the Thicket floor who buys them
//                       trains Defense (0 without), lives the hour and nets more than the pair cost
//   thicket-solo-starter-kit  a new hero alone at the Thicket's floor (the solo-first ground, band 5-15), wearing
//                       ONLY the start kit, plays the hour on the real settle (play-ground.mjs) with no death, on
//                       each of the designer's six seeds (designer pass 2026-10-21, Tyler: solo first)
//   first-grounds-net-chain  net gold per hero-hour (coin + commons - store) at each first ground's floor never
//                       drops along the start flow, Cellar (L1, solo) -> Thicket (L5, solo) -> Sewer (L8, party of
//                       four), every floor in the reference kit (play-ground's smiths' ladder kit, the kit every
//                       ground's numbers use; Coordinator 2026-10-21: the start kit is its own check above), the
//                       median of the six seeds per ground; and +25% over the bill (a minimum) wherever the bill is
//                       at least a quarter of the income (designer pass 2026-10-21)
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
const NEW = ['meadowbrook_thicket', 'coppercap_warrens', 'mosslight_glade', 'wickstead'];
const BRIDGE = { meadowbrook_thicket: [[28, 5], [29, 5], [30, 5], [31, 5], [32, 5]], coppercap_warrens: [[51, 20], [51, 21], [51, 22]],
  mosslight_glade: [[44, 19], [44, 20], [44, 21], [44, 22], [44, 23]], wickstead: [[28, 8], [29, 8], [30, 8], [31, 8]] };
const MID_DENSITY = 4;
const RING8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/* The designer's six hunt seeds (pass 2026-10-21) and the margin floor (+25%, a minimum: Tyler 10-18/10-20). */
const STARTER_SEEDS = Object.freeze(['-4611686018427387904', '1234567890123', '-987654321987', '42', '7777777777777', '-31415926535']);
const STARTER_MARGIN_MIN = 25;
const BILL_SHARE_FOR_MARGIN = 0.25;   // the margin floor applies where store >= 25% of income
/* The start flow's grounds in order: [ground, roles], each played at its floor in the reference (ladder) kit. */
const FIRST_CHAIN = Object.freeze([['mill_cellar', ['tank']], ['meadowbrook_thicket', ['tank']],
  ['millrace_sewer', ['tank', 'ranger', 'mage', 'healer']]]);
const median = (a) => { const v = [...a].sort((x, y) => x - y); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };

async function load(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  return {
    root,
    grounds: await imp('src/data/hunt-grounds.js'), hunts: await imp('src/data/hunts.js'), MONSTERS: (await imp('src/data/monsters.js')).MONSTERS,
    maps: await imp('src/data/world/maps/index.js'), terrain: await imp('src/data/world/terrain.js'), mapc: await imp('src/world/core/map-compile.js'),
    sets: await imp('src/data/world/atlas-sets.js'), gathering: await imp('src/data/gathering.js'), budget: await imp('src/data/world/art-budget.js'),
    kit: await imp('src/data/start-kit.js'),
  };
}

function sprites(M) {
  const out = {};
  for (const set of M.sets.ATLAS_SETS) Object.assign(out, JSON.parse(readFileSync(join(M.root, 'assets/world/atlas-' + set + '.json'), 'utf8')).sprites);
  return out;
}

/* The walkable mask of a world map (solid materials and solid props block). */
function maskOf(M, mapId) {
  const row = M.maps.mapRowOf(mapId);   // a staged map (hunts.js `staged`) is walked and checked like any other
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

/* A pocket's rows at a pull: a box's (pullRows), or a pocket with no pack as built. */
const packAt = (M, g, i, n) => (g.pockets[i].pack ? M.grounds.pullRows(g, i, n) : g.pockets[i].spawns.slice());
/* The head-count of a walked hunt's packs (a pull of 4 where it has a box), bosses out. */
function headCount(M, g) {
  const n = {};
  g.pockets.forEach((p, i) => {
    for (const s of packAt(M, g, i, MID_DENSITY)) n[s.monster] = (n[s.monster] || 0) + 1;
  });
  return n;
}
const BOSSES = new Set(['rat_king', 'grayjaw', 'chief_coppercap', 'rook_poacher']);

const cases = {
  'packs-on-the-map': (M) => {
    for (const id of NEW) {
      const g = M.grounds.HUNT_GROUNDS[id];
      const m = maskOf(M, g.map);
      if (!m) return id + ': no world map';
      for (const [i, p] of g.pockets.entries()) {
        for (const s of packAt(M, g, i, 8)) {
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
      for (const [i] of g.pockets.entries()) {
        if (packAt(M, g, i, 8).length !== 8) return id + ' pocket ' + i + ': no full box';
        if (packAt(M, g, i, 1).length !== 1) return id + ' pocket ' + i + ': a pull of 1 is not a single foe';
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
  /* HALF-BUILT STAYS HIDDEN (§3.5; hunts.js `staged`): a ground is OPEN only with its style-1 art (its map
     shipped in WORLD_MAPS on a painted ground an atlas carries; its creatures' walks: walk-art below), and a
     STAGED one is listed nowhere: not in the Hunts window, its map only in STAGED_MAPS, and out of both
     server catalogues (so hr_hunt_enter refuses it). Opening = art lands + the flag goes, together. */
  'staged-until-art': async (M) => {
    const terrains = {};
    for (const set of M.sets.ATLAS_SETS) Object.assign(terrains, JSON.parse(readFileSync(join(M.root, 'assets/world/atlas-' + set + '.json'), 'utf8')).terrain || {});
    const listed = new Set((await import(pathToFileURL(join(M.root, 'src/shell/hunt-list.js')).href + V)).huntRows().map((r) => r.hunt));
    const gh = await import(pathToFileURL(join(M.root, 'tools/gen-hunts.mjs')).href);
    const gs = await import(pathToFileURL(join(M.root, 'tools/gen-hunt-sessions.mjs')).href);
    /* what the generators WRITE: hr_hunts' rows, and hr_hunt_grounds + hr_hunt_travel's named hunts */
    const sql = gh.render();
    const served = new Set(M.hunts.HUNTS.filter((h) => sql.includes("('" + h.id + "',")).map((h) => h.id));
    const cat = gs.catalogueRows();
    const travel = new Set(cat.travel.filter((t) => !t.training).map((t) => t.id));
    const grounded = new Set(cat.grounds.filter((r) => travel.has(r.hunt)).map((r) => r.hunt));
    for (const g of Object.values(M.grounds.HUNT_GROUNDS)) {
      const h = M.hunts.HUNT_INDEX[g.hunt];
      const shipped = M.maps.WORLD_MAPS.some((m) => m.id === g.map), staged = M.maps.STAGED_MAPS.some((m) => m.id === g.map);
      if (h.staged === true) {
        if (listed.has(h.id)) return h.id + ' is staged but the Hunts window lists it';
        if (shipped || !staged) return h.id + ' is staged but its map ' + g.map + ' is not (only) in STAGED_MAPS';
        if (served.has(h.id) || grounded.has(h.id)) return h.id + ' is staged but the server catalogue serves it';
      } else {
        if (!shipped || staged) return h.id + ' is open but its map ' + g.map + ' is not a shipped WORLD_MAPS row';
        const row = M.maps.WORLD_MAPS.find((m) => m.id === g.map);
        if (!terrains[row.ground]) return h.id + ' is open but its ground art ' + row.ground + ' is in no atlas';
        if (!listed.has(h.id) || !served.has(h.id) || !grounded.has(h.id)) return h.id + ' is open but is missing from the Hunts window or a server catalogue';
      }
    }
    return null;
  },
  'walk-art': (M) => {
    const spr = sprites(M);
    for (const id of NEW) {
      if (M.hunts.HUNT_INDEX[id].staged === true) continue;   // staged: no art yet, held by staged-until-art
      const g = M.grounds.HUNT_GROUNDS[id];
      const kinds = new Set(g.pockets.flatMap((p, i) => packAt(M, g, i, 8).map((s) => s.monster)));
      for (const k of kinds) {
        const s = spr[k];
        if (!s) return id + ': ' + k + ' has no sprite in a loaded atlas';
        for (const a of ['idle', 'walk']) for (const d of M.budget.FACINGS) if (!(s.anims[a] && s.anims[a].dirs[d] && s.anims[a].dirs[d].length)) return id + ': ' + k + ' has no ' + a + ' ' + d;
      }
    }
    return null;
  },
};

/* THE SOLO-FIRST GROUND, PLAYED FROM THE START KIT (async: the real settle). */
const playOf = async (M) => (await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href)).loadPlay(M.root);
const floorOf = (M, gid) => M.hunts.HUNT_INDEX[M.grounds.HUNT_GROUNDS[gid].hunt].band[0];
cases['thicket-solo-starter-kit'] = async (M) => {
  const P = await playOf(M);
  const floor = floorOf(M, 'meadowbrook_thicket');
  const bad = [], seen = [];
  for (const secret of STARTER_SEEDS) {
    const x = P.run('meadowbrook_thicket', floor, ['tank'], { spanMs: 3600000, equipment: M.kit.START_EQUIPMENT, secret });
    seen.push(x.totals.falls ? 'died ' + (x.playedMs / 60000).toFixed(1) + 'm' : 'lived');
    if (x.totals.falls || x.playedMs < 3600000) bad.push('seed ' + secret + ': ended after ' + (x.playedMs / 60000).toFixed(1) + ' min with ' + x.totals.falls + ' death(s) (' + x.ended.join(', ') + ')');
  }
  console.log('    thicket solo, start kit only (' + Object.values(M.kit.START_EQUIPMENT).join(', ') + ') at L' + floor + ', ' + STARTER_SEEDS.length + ' seeds: ' + seen.join(' | '));
  return bad.length ? 'a start-kit Melee at the Thicket floor: ' + bad.join('; ') : null;
};
/* THE OUTFITTER (designer ruling 2026-10-22, lane/b-gold-sinks; PRIORITY_BOARD play report #5: Defense sat at 0 XP
   after 117 kills because a new hero wears no armour, and gold bought nothing). The Shop's gear rows
   (supply-basics.js kind 'gear'): (a) never sell a slot a walked ground drops (the Shop never competes with a drop);
   (b) sell gloves AND a belt, each an armour piece a new hero's 500 starting gold can buy, and at least one of them
   medium (neither health nor mana: right for every way to fight); (c) played: a start-kit Melee at the Thicket floor
   trains Defense through its shield (Tyler 2026-10-23: a worn shield counts as armour), the same sword with no shield
   and no armour trains none, and the kit hero wearing the Shop's gloves and belt trains more than that, lives the
   hour and nets more than the two pieces cost (the purchase pays for itself inside the first hour). */
cases['shop-outfits-defense'] = async (M) => {
  const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
  const { SUPPLY_SHOP_OFFERS } = await imp('src/data/supply-basics.js');
  const { ITEMS } = await imp('src/data/items.js');
  const { ARMOUR_WEIGHT } = await imp('src/data/core-model.js');
  const gear = SUPPLY_SHOP_OFFERS.filter((o) => o.kind === 'gear');
  const bad = [];
  const dropped = new Map();
  /* A ground's REGULAR gear competes with the Shop: an old-model equipment row, or a loot-band row below Rare. A Rare
     or Trophy named piece (Grayjaw's Ruff, about every 15 h) is the better prize above the Shop's basic, the pattern
     Tyler ruled for shields (2026-10-23: a basic at the Shop, better ones made and dropped). */
  const regular = (d) => !(d.band === 'rare' || d.band === 'trophy');
  for (const g of Object.values(M.grounds.HUNT_GROUNDS)) for (const p of g.pockets) for (const s of p.spawns) {
    for (const d of (M.MONSTERS[s.monster] || {}).drops || []) if (ITEMS[d.id] && ITEMS[d.id].slot && regular(d)) dropped.set(ITEMS[d.id].slot, d.id + ' (' + s.monster + ')');
  }
  for (const o of gear) if (dropped.has(ITEMS[o.item].slot)) bad.push(o.item + ': the Shop sells a ' + ITEMS[o.item].slot + ', which ' + dropped.get(ITEMS[o.item].slot) + ' drops');
  const armour = (o) => !!ARMOUR_WEIGHT[ITEMS[o.item].armourClass] || Number(ITEMS[o.item].defB) > 0;
  const pick = (slot) => gear.filter((o) => ITEMS[o.item].slot === slot && armour(o) && o.price <= M.kit.START_CURRENCY.gold).sort((a, b) => a.price - b.price)[0];
  const gl = pick('gloves'), bt = pick('belt');
  if (!gl || !bt) return bad.concat('the Shop sells no gloves or no belt a new hero can afford').join('; ');
  if (![gl, bt].some((o) => ARMOUR_WEIGHT[ITEMS[o.item].armourClass] === 'medium')) bad.push('neither the Shop gloves nor belt is medium (every way to fight needs a neutral first piece)');
  const P = await playOf(M);
  const floor = floorOf(M, 'meadowbrook_thicket');
  const defOf = (x) => Object.values(x.heroXp).reduce((s, h) => s + (h.defense || 0), 0);
  const bare = P.run('meadowbrook_thicket', floor, ['tank'], { spanMs: 3600000, equipment: M.kit.START_EQUIPMENT, secret: STARTER_SEEDS[0] });
  /* A WORN SHIELD COUNTS AS ARMOUR (Tyler 2026-10-23): the kit's Practice Shield trains Defense; the same sword with no
     shield and no armour trains none (Defense needs armour, Tyler 2026-10-18). */
  const { shield: _kitShield, ...noShield } = M.kit.START_EQUIPMENT;
  const sword = P.run('meadowbrook_thicket', floor, ['tank'], { spanMs: 3600000, equipment: noShield, secret: STARTER_SEEDS[0] });
  /* ...and the Shop's gloves and belt are armour of their own: the shieldless sword wearing them trains Defense */
  const dressed = P.run('meadowbrook_thicket', floor, ['tank'], { spanMs: 3600000, equipment: { ...noShield, gloves: gl.item, belt: bt.item }, secret: STARTER_SEEDS[0] });
  const worn = P.run('meadowbrook_thicket', floor, ['tank'], { spanMs: 3600000, equipment: { ...M.kit.START_EQUIPMENT, gloves: gl.item, belt: bt.item }, secret: STARTER_SEEDS[0] });
  const cost = gl.price + bt.price;
  console.log('    thicket L' + floor + ' start kit: Defense XP ' + defOf(bare) + ' (no shield: ' + defOf(sword) + ', no shield + the Shop pair: ' + defOf(dressed) + '), net ' + bare.net + ' | + Shop ' + gl.item + ' + ' + bt.item + ' (' + cost + ' g): Defense XP '
    + defOf(worn) + ', net ' + worn.net + ', deaths ' + worn.totals.falls);
  if (!(defOf(bare) > 0)) bad.push('the start kit\'s shield trained no Defense (a worn shield counts as armour, Tyler 2026-10-23)');
  if (defOf(sword) !== 0) bad.push('a sword with no shield and no armour trained ' + defOf(sword) + ' Defense XP');
  if (!(defOf(dressed) > 0)) bad.push('the Shop gloves and belt trained no Defense');
  if (worn.totals.falls || worn.playedMs < 3600000) bad.push('the outfitted hero did not live the hour (' + worn.ended.join(', ') + ')');
  if (worn.net < cost) bad.push('the outfitted hour nets ' + worn.net + ' g, under the ' + cost + ' g the pieces cost');
  return bad.length ? bad.join('; ') : null;
};
cases['first-grounds-net-chain'] = async (M) => {
  const P = await playOf(M);
  const bad = [], rows = [];
  for (const [gid, roles] of FIRST_CHAIN) {
    const floor = floorOf(M, gid), nets = [];
    for (const secret of STARTER_SEEDS) {
      const x = P.run(gid, floor, roles, { spanMs: 3600000, secret });
      nets.push(x.income - x.store);
      if (x.store >= BILL_SHARE_FOR_MARGIN * x.income && (x.income / x.store - 1) * 100 < STARTER_MARGIN_MIN) {
        bad.push(gid + ' seed ' + secret + ': ' + Math.round((x.income / x.store - 1) * 100) + '% over a bill that is ' + Math.round(100 * x.store / x.income) + '% of income, under +' + STARTER_MARGIN_MIN + '%');
      }
    }
    rows.push({ gid, floor, n: roles.length, net: median(nets), nets });
  }
  console.log('    net g per hero-hour at the floor (6-seed median): ' + rows.map((r) => r.gid + ' L' + r.floor + (r.n > 1 ? ' party' : ' solo') + ' ' + r.net + ' [' + r.nets.join(' ') + ']').join(' -> '));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].net < rows[i - 1].net) bad.push(rows[i].gid + ' nets ' + rows[i].net + ' g/h, under ' + rows[i - 1].gid + "'s " + rows[i - 1].net + ' before it');
  }
  return bad.length ? bad.join('; ') : null;
};

/* THE SIM PLAYS THE SERVER'S MAP (2026-11-05): every balance number in the hunt guards and tools/balance-sim comes from the fixture's `run`. Its own grid carried the client's object
   footprints, 7-52 walkable tiles short of the server's on each ground, and a Level 1 bow on the Glade read 16,500 damage an hour where the page took 20,000. Walking and sight both, on every ground. */
cases['sim-plays-the-server-map'] = async (M) => {
  const P = await playOf(M);
  const { huntGroundOf } = await import(pathToFileURL(join(M.root, 'src/core/hunt-ground.js')).href + V);
  const bad = [];
  for (const g of Object.values(M.grounds.HUNT_GROUNDS)) {
    const mine = P.run(g.hunt, 1, ['tank'], { spanMs: 10000, windowMs: 10000 }).grid, server = huntGroundOf(g.hunt).grid;
    if (mine.w !== server.w || mine.h !== server.h) { bad.push(g.id + ' plays ' + mine.w + 'x' + mine.h + ' against the server\'s ' + server.w + 'x' + server.h); continue; }
    let walk = 0, sight = 0;
    for (let i = 0; i < server.walk.length; i++) { if (mine.walk[i] !== server.walk[i]) walk++; if (mine.opaque[i] !== server.opaque[i]) sight++; }
    if (walk || sight) bad.push(g.id + ': ' + walk + ' walkable tile(s) and ' + sight + ' sight tile(s) differ from the server\'s');
  }
  return bad.length ? 'the sim plays another map: ' + bad.join('; ') : null;
};

/* THE SPRING GROUND (lane c-ground-16-31): Mosslight Glade is the solo ground for 16-31, between the Sewer and the
   Warrens. Its floor hero is the Thicket's graduate in the smiths' ladder kit (iron at 15), alone. */
const GLADE = 'mosslight_glade';
const LEATHER_GRADUATE = Object.freeze({ weapon: 'practice_sword', shield: 'practice_shield', helmet: 'leather_helmet', body: 'leather_body',
  pants: 'leather_pants', boots: 'leather_boots' });
cases['glade-solo-floor'] = async (M) => {
  const P = await playOf(M);
  const floor = floorOf(M, GLADE);
  const bad = [], seen = [], grad = [];
  for (const secret of STARTER_SEEDS) {
    const x = P.run(GLADE, floor, ['tank'], { spanMs: 3600000, secret });
    seen.push(x.totals.falls ? 'died ' + (x.playedMs / 60000).toFixed(1) + 'm' : 'lived');
    if (x.totals.falls || x.playedMs < 3600000) bad.push('seed ' + secret + ': ended after ' + (x.playedMs / 60000).toFixed(1) + ' min with ' + x.totals.falls + ' death(s) (' + x.ended.join(', ') + ')');
    /* evidence, not a gate: the start kit's sword and shield in the Thicket's leather, no smith visited */
    const y = P.run(GLADE, floor, ['tank'], { spanMs: 3600000, secret, equipment: LEATHER_GRADUATE });
    grad.push(y.totals.falls ? 'died ' + (y.playedMs / 60000).toFixed(1) + 'm' : 'lived');
  }
  console.log('    glade solo at L' + floor + ', ladder kit, ' + STARTER_SEEDS.length + ' seeds: ' + seen.join(' | '));
  console.log('    glade solo at L' + floor + ', practice sword + Thicket leather (evidence): ' + grad.join(' | '));
  return bad.length ? 'a ladder-kit Melee alone at the glade floor: ' + bad.join('; ') : null;
};
cases['glade-between'] = async (M) => {
  const P = await playOf(M);
  const PARTY4 = ['tank', 'ranger', 'mage', 'healer'];
  /* each ground at its floor in its own reference (tests/hunt-core/drop-tables.mjs REFERENCE): the Sewer's party of four in the ladder kit, the glade's solo Melee, the
     Warrens' party of four in the full own-tier set. THE GLADE'S STEP IS MEASURED IN ITS FOUR PLATE PIECES (designer 2026-11-03, Tyler's accuracy 0.80): a hero who reaches
     Level 16 holds them (the Thicket's Bronze in 6 h, Wickstead's and the Glade's Iron about hourly), and in helm and body alone the harder Glade now nets 1,282 g/h against
     the Sewer party's 2,024: the armor is what the harder floor asks for, as ruled. THE PROFIT RULE IS JUDGED IN THAT SAME FULL KIT (Tyler 2026-11-07, "make it 20% harder":
     he took the measured cost that a hero in helm and body alone drops to about +6% over its bill on the Glade, so the floor is judged "properly equipped", his 10-25 words;
     the formula's rows, lane/b-ground-formula, are that 20%). */
  const chain = [['millrace_sewer', PARTY4, false], [GLADE, ['tank'], true], ['coppercap_warrens', PARTY4, true]];
  const rows = [], bad = [];
  for (const [gid, roles, fullSet] of chain) {
    const floor = floorOf(M, gid), nets = [], xps = [];
    for (const secret of STARTER_SEEDS) {
      const x = P.run(gid, floor, roles, { spanMs: 3600000, secret, fullSet });
      nets.push(x.income - x.store); xps.push(x.levelXp);
      if (gid === GLADE && x.store >= BILL_SHARE_FOR_MARGIN * x.income && (x.income / x.store - 1) * 100 < STARTER_MARGIN_MIN) {
        bad.push(gid + ' seed ' + secret + ' in its four plate pieces: ' + Math.round((x.income / x.store - 1) * 100) + '% over its bill, under +' + STARTER_MARGIN_MIN + '%');
      }
    }
    rows.push({ gid, floor, net: median(nets), xp: median(xps) });
  }
  console.log('    per hero-hour at the floor (6-seed median), net g | Level XP: ' + rows.map((r) => r.gid + ' L' + r.floor + ' ' + r.net + ' | ' + r.xp).join(' -> '));
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i].net > rows[i - 1].net)) bad.push(rows[i].gid + ' nets ' + rows[i].net + ' g/h, not above ' + rows[i - 1].gid + "'s " + rows[i - 1].net);
    if (!(rows[i].xp > rows[i - 1].xp)) bad.push(rows[i].gid + ' gives ' + rows[i].xp + ' Level XP/h, not above ' + rows[i - 1].gid + "'s " + rows[i - 1].xp);
  }
  return bad.length ? bad.join('; ') : null;
};

/* HARDER PAYS MORE (Tyler 2026-11-03: harder monsters give better loot and more reward; nothing rewards staying on a weak ground; lane/c-gold-matters).
   PER KILL, the rows: a monster's expected gold (its coin roll, every drop at its chance and the shop's bid), meaned over the open grounds' monsters in bands
   of hp x attack, climbs band by band. PER HOUR, played: the same hero in the same kit at one Level earns more on the ground above, everything sold, the bill
   paid. Expected values on the played kills, so a lucky hour reads the same. The Sewer is not on this list: a lone hero there is the known exception, on the board. */
const HARDNESS_BANDS = Object.freeze([100, 500, 1500, 10000]);
const CLIMB = Object.freeze([[13, ['tank'], 'meadowbrook_thicket', 'wickstead', false], [25, ['tank'], 'wickstead', GLADE, false], [45, ['tank'], GLADE, 'coppercap_warrens', true],
  [41, ['tank', 'ranger', 'mage', 'healer'], GLADE, 'coppercap_warrens', true]]);
cases['harder-pays-more'] = async (M) => {
  const P = await playOf(M);
  const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
  const { effectiveDropChance } = await imp('src/core/drops.js');
  const bad = [], ids = new Set();
  for (const g of Object.values(M.grounds.OPEN_GROUNDS)) for (const p of g.pockets) for (const s of [...(p.pack || []), ...(p.spawns || [])]) ids.add(s.monster);
  const bid = (d, y) => effectiveDropChance(d, { dropMult: 1, yieldMult: y }) * P.vendorPriceOf(P.ITEMS, d.id);
  const coinOf = (m, y) => { let t = 0; for (let v = m.gp[0]; v <= m.gp[1]; v++) t += Math.round(v * y); return t / (m.gp[1] - m.gp[0] + 1); };
  const kill = (m, y) => coinOf(m, y) + (m.drops || []).reduce((s, d) => s + bid(d, y), 0);
  const sum = HARDNESS_BANDS.concat(Infinity).map(() => ({ n: 0, g: 0 }));
  for (const id of ids) {
    const m = M.MONSTERS[id], b = sum[HARDNESS_BANDS.concat(Infinity).findIndex((top) => m.hp * m.atk < top)];
    b.n++; b.g += kill(m, 1);
  }
  const means = sum.map((b) => (b.n ? b.g / b.n : 0));
  console.log('    a kill\'s gold by hp x attack, under ' + HARDNESS_BANDS.join(' / ') + ' / above: ' + means.map((v) => Math.round(v)).join(' -> '));
  for (let i = 1; i < means.length; i++) if (!(means[i] > means[i - 1])) bad.push('a kill past hp x attack ' + HARDNESS_BANDS[i - 1] + ' pays ' + Math.round(means[i]) + ' g, not above ' + Math.round(means[i - 1]) + ' g below it');
  const hour = (gid, L, roles, fullSet) => {
    const x = P.run(gid, L, roles, { spanMs: 1800000, fullSet, secret: STARTER_SEEDS[0] });
    const y = M.grounds.yieldPermille(roles.length) / 1000, h = x.playedMs / 3600000;
    let g = 0;
    for (const [id, k] of Object.entries(x.killsBy)) g += k * kill(M.MONSTERS[id], y);
    return Math.round((g - x.totals.store) / roles.length / h);
  };
  for (const [L, roles, low, high, fullSet] of CLIMB) {
    const a = hour(low, L, roles, fullSet), b = hour(high, L, roles, fullSet), who = roles.length > 1 ? 'a party of ' + roles.length : 'a lone ' + roles[0];
    console.log('    ' + who + ' at L' + L + ', gold an hour, all sold: ' + low + ' ' + a + ' -> ' + high + ' ' + b);
    if (!(b > a)) bad.push(who + ' at L' + L + ' earns ' + a + ' g/h on ' + low + ' and ' + b + ' g/h on ' + high + ': staying on the weaker ground pays');
  }
  return bad.length ? bad.join('; ') : null;
};

/* THE FARM GROUND (lane b-greenhaven-6, designer 2026-10-28): Wickstead is the second solo door for 8-18, beside the
   Thicket. Played at its floor (L8) on the real settle, alone, six seeds: the ladder-kit Melee lives the hour, clears +25%
   wherever its bill is a quarter of its income, and its median net gold and Level XP per hour are no worse than the
   Thicket's at the Thicket's own floor (a second door must not pay less than the first). The start kit is printed. */
const WICK = 'wickstead';
cases['wickstead-solo-floor'] = async (M) => {
  const P = await playOf(M);
  const floor = floorOf(M, WICK), tf = floorOf(M, 'meadowbrook_thicket');
  const bad = [], seen = [], kit = [], nets = [], xps = [], tn = [], tx = [];
  for (const secret of STARTER_SEEDS) {
    const x = P.run(WICK, floor, ['tank'], { spanMs: 3600000, secret });
    seen.push(x.totals.falls ? 'died ' + (x.playedMs / 60000).toFixed(1) + 'm' : 'lived');
    if (x.totals.falls || x.playedMs < 3600000) bad.push('seed ' + secret + ': ended after ' + (x.playedMs / 60000).toFixed(1) + ' min with ' + x.totals.falls + ' death(s) (' + x.ended.join(', ') + ')');
    if (x.store >= BILL_SHARE_FOR_MARGIN * x.income && (x.income / x.store - 1) * 100 < STARTER_MARGIN_MIN) bad.push('seed ' + secret + ': ' + Math.round((x.income / x.store - 1) * 100) + '% over its bill');
    nets.push(x.income - x.store); xps.push(x.levelXp);
    const y = P.run(WICK, floor, ['tank'], { spanMs: 3600000, secret, equipment: M.kit.START_EQUIPMENT });
    kit.push(y.totals.falls ? 'died ' + (y.playedMs / 60000).toFixed(1) + 'm' : 'lived ' + (y.income - y.store) + ' g');
    const t = P.run('meadowbrook_thicket', tf, ['tank'], { spanMs: 3600000, secret });
    tn.push(t.income - t.store); tx.push(t.levelXp);
  }
  console.log('    wickstead solo at L' + floor + ', ladder kit, ' + STARTER_SEEDS.length + ' seeds: ' + seen.join(' | ') + '; net ' + median(nets) + ' g/h, Level XP ' + median(xps)
    + '/h (thicket L' + tf + ': ' + median(tn) + ' g/h, ' + median(tx) + '/h); start kit (evidence): ' + kit.join(' | '));
  if (!(median(nets) >= median(tn))) bad.push('nets ' + median(nets) + ' g/h, under the Thicket\'s ' + median(tn));
  if (!(median(xps) >= median(tx))) bad.push('gives ' + median(xps) + ' Level XP/h, under the Thicket\'s ' + median(tx));
  return bad.length ? 'a ladder-kit Melee alone at the Wickstead floor: ' + bad.join('; ') : null;
};

/* The glade put back to STAGED as a whole (flag + map), so the two leak mutants below have a staged hunt to leak. */
const RESTAGE = [['src/data/hunts.js', "art: 'carrion_crow', travelS: 0, pull: 4, respawnMs: 60000,", "art: 'carrion_crow', travelS: 0, pull: 4, respawnMs: 60000, staged: true,"],
  ['src/data/world/maps/index.js', 'meadowbrookThicket, coppercapWarrens, mosslightGlade, wickstead, sandboxHd64]);', 'meadowbrookThicket, coppercapWarrens, wickstead, sandboxHd64]);'],
  ['src/data/world/maps/index.js', 'export const STAGED_MAPS = Object.freeze([]);', 'export const STAGED_MAPS = Object.freeze([mosslightGlade]);']];
const mutants = [
  /* the glade is OPEN on its art (lane b-mosslight-art): it must stay open only while its painted ground ships */
  { name: 'the glade open on a ground no atlas carries', case: 'staged-until-art',
    edits: [['src/data/world/maps/mosslight_glade.js', "  ground: 'mosslight_ground',", "  ground: 'mosslight_ground_gone',"]] },
  { name: 'the glade staged again while its map still ships', case: 'staged-until-art',
    edits: [['src/data/hunts.js', "art: 'carrion_crow', travelS: 0, pull: 4, respawnMs: 60000,", "art: 'carrion_crow', travelS: 0, pull: 4, respawnMs: 60000, staged: true,"]] },
  { name: 'the Hunts window lists a staged hunt', case: 'staged-until-art',
    edits: [...RESTAGE, ['src/shell/hunt-list.js', "if (!h || h.staged === true) continue;", "if (!h) continue;"]] },
  { name: 'the server catalogue serves a staged ground', case: 'staged-until-art',
    edits: [...RESTAGE, ['tools/gen-hunt-sessions.mjs', "    grounds: OPEN_GROUNDS, worldMaxBytes:", "    grounds: HUNT_GROUNDS, worldMaxBytes:"],
      ['tools/gen-hunt-sessions.mjs', "hunts: OPEN_HUNTS, monsters: MONSTERS, items: ITEMS,", "hunts: HUNTS, monsters: MONSTERS, items: ITEMS,"],
      ['tools/gen-hunt-sessions.mjs', "import { OPEN_GROUNDS, DENSITY_PICK, PARTY_SCALE, densityFor, reachableOf }", "import { HUNT_GROUNDS, OPEN_GROUNDS, DENSITY_PICK, PARTY_SCALE, densityFor, reachableOf }"]] },
  /* Recalibrated (designer 2026-10-22, armour weights K7 + tier-3 blows at 4.0 + store-by-slot bars): a ladder-kit
     floor hero now LIVES Warrens-strength hits (atk 26, 30, 36, 42, 50 all lived six seeds of six, eating 3-8k g/h),
     so "like the Warrens" no longer proves lethality. The floor still bites: at atk 60 three seeds of six die, at
     72 all six (1.4-30 min). The rule is unchanged; the mutant is the lethal ground it must catch. */
  { name: 'the glade\'s sluicer and Rook hit four times as hard (atk 21-22 -> 84-88)', case: 'glade-solo-floor',
    edits: [['src/data/monsters.js', 'hp: 74, atk: 21, baseAcc: 0.8, def: 11, xp: 533,', 'hp: 74, atk: 84, baseAcc: 0.8, def: 11, xp: 533,'], ['src/data/monsters.js', 'hp: 81, atk: 22, baseAcc: 0.84, def: 14,', 'hp: 81, atk: 88, baseAcc: 0.84, def: 14,']] },
  { name: 'the fixture back on the client\'s compiled collision mask', case: 'sim-plays-the-server-map',
    edits: [['tests/hunt-core/fixtures/play-ground.mjs', "const { gridOfMap } = await import(u('src/core/hunt-ground.js'));",
      "const [MAPS, TER, MC, SETS, GRID, FS] = await Promise.all(['src/data/world/maps/index.js', 'src/data/world/terrain.js', 'src/world/core/map-compile.js', 'src/data/world/atlas-sets.js', 'src/core/hunt/grid.js'].map((p) => import(u(p))).concat(import('node:fs'))); const sprites = {}; for (const s of SETS.ATLAS_SETS) Object.assign(sprites, JSON.parse(FS.readFileSync(join(root, 'assets/world/atlas-' + s + '.json'), 'utf8')).sprites); const gridOfMap = (mapId) => { const map = MC.compileMap(MAPS.mapRowOf(mapId), { materials: TER.MATERIALS, sprites, openClasses: TER.OPEN_CLASSES, lights: {} }); return GRID.makeGrid(map.w, map.h, (x, y) => map.mask[y * map.w + x] === 0, (x, y) => { const m = TER.MATERIALS[map.ground[y * map.w + x]]; return !!(m && m.solid && !m.flat); }); };"]] },
  { name: 'one walkable tile short on the map the run plays', case: 'sim-plays-the-server-map',
    edits: [['tests/hunt-core/fixtures/play-ground.mjs', "grid = gridOfMap(ground.map);", "grid = (() => { const g = gridOfMap(ground.map), walk = g.walk.slice(); walk[walk.indexOf(1)] = 0; return { ...g, walk }; })();"]] },
  { name: 'the glade\'s coin doubled (it out-earns the Warrens)', case: 'glade-between',
    edits: [['src/data/monsters.js', 'xp: 155, gp: [6, 19]', 'xp: 155, gp: [12, 38]'], ['src/data/monsters.js', 'xp: 172, gp: [5, 17]', 'xp: 172, gp: [10, 34]'],
      ['src/data/monsters.js', 'xp: 309, gp: [10, 30]', 'xp: 309, gp: [20, 60]'], ['src/data/monsters.js', 'xp: 533, gp: [16, 46]', 'xp: 533, gp: [32, 92]'],
      ['src/data/monsters.js', 'xp: 609, gp: [17, 51]', 'xp: 609, gp: [34, 102]'], ['src/data/monsters.js', 'xp: 481, gp: [14, 44]', 'xp: 481, gp: [28, 88]']] },
  { name: 'the glade\'s coin halved (it pays under the Sewer\'s party)', case: 'glade-between',
    edits: [['src/data/monsters.js', 'xp: 155, gp: [6, 19]', 'xp: 155, gp: [3, 10]'], ['src/data/monsters.js', 'xp: 172, gp: [5, 17]', 'xp: 172, gp: [2, 9]'],
      ['src/data/monsters.js', 'xp: 309, gp: [10, 30]', 'xp: 309, gp: [5, 15]'], ['src/data/monsters.js', 'xp: 533, gp: [16, 46]', 'xp: 533, gp: [8, 23]'],
      ['src/data/monsters.js', 'xp: 609, gp: [17, 51]', 'xp: 609, gp: [8, 26]'], ['src/data/monsters.js', 'xp: 481, gp: [14, 44]', 'xp: 481, gp: [7, 22]']] },
  { name: 'the glade\'s blows x2 (its four plate pieces under +25%)', case: 'glade-between',
    edits: [['src/data/monsters.js', 'hp: 30, atk: 11, baseAcc: 0.8,', 'hp: 30, atk: 22, baseAcc: 0.8,'], ['src/data/monsters.js', 'hp: 26, atk: 14, baseAcc: 0.85,', 'hp: 26, atk: 28, baseAcc: 0.85,'],
      ['src/data/monsters.js', 'hp: 48, atk: 11, baseAcc: 0.82,', 'hp: 48, atk: 22, baseAcc: 0.82,'], ['src/data/monsters.js', 'hp: 74, atk: 21, baseAcc: 0.8,', 'hp: 74, atk: 42, baseAcc: 0.8,'],
      ['src/data/monsters.js', 'hp: 81, atk: 22, baseAcc: 0.84,', 'hp: 81, atk: 44, baseAcc: 0.84,'], ['src/data/monsters.js', 'hp: 69, atk: 20, baseAcc: 0.78,', 'hp: 69, atk: 40, baseAcc: 0.78,']] },
  { name: 'Wickstead\'s Turncoats and spiders hit six times as hard (atk 8 -> 48, 5 -> 30)', case: 'wickstead-solo-floor',
    edits: [['src/data/monsters.js', 'hp: 23, atk: 8, baseAcc: 0.61, def: 1, xp: 142,', 'hp: 23, atk: 48, baseAcc: 0.61, def: 1, xp: 142,'], ['src/data/monsters.js', 'hp: 25, atk: 5, baseAcc: 0.46, def: 3, xp: 130,', 'hp: 25, atk: 30, baseAcc: 0.46, def: 3, xp: 130,']] },
  { name: 'Wickstead\'s coin cut to a third (it pays under the Thicket)', case: 'wickstead-solo-floor',
    edits: [['src/data/monsters.js', 'xp: 61, gp: [2, 7]', 'xp: 61, gp: [1, 2]'], ['src/data/monsters.js', 'xp: 130, gp: [4, 12]', 'xp: 130, gp: [1, 4]'],
      ['src/data/monsters.js', 'xp: 142, gp: [4, 11]', 'xp: 142, gp: [1, 4]'], ['src/data/monsters.js', 'xp: 90, gp: [3, 8]', 'xp: 90, gp: [1, 3]']] },
  { name: 'the Warrens\' coin halved (the Glade out-earns the harder ground)', case: 'harder-pays-more',
    edits: [['src/data/monsters.js', 'xp: 819, gp: [16, 49]', 'xp: 819, gp: [8, 25]'], ['src/data/monsters.js', 'xp: 853, gp: [14, 40]', 'xp: 853, gp: [7, 20]'],
      ['src/data/monsters.js', 'xp: 1348, gp: [23, 69]', 'xp: 1348, gp: [12, 35]'], ['src/data/monsters.js', 'xp: 2257, gp: [35, 104]', 'xp: 2257, gp: [18, 52]'],
      ['src/data/monsters.js', 'xp: 8688, gp: [122, 366]', 'xp: 8688, gp: [61, 183]']] },
  { name: 'the Thicket\'s Gray Wolf pays three times over (staying in the wood pays more than Wickstead)', case: 'harder-pays-more',
    edits: [['src/data/monsters.js', 'hp: 17, atk: 5, baseAcc: 0.46, def: 1, xp: 60, gp: [2, 7]', 'hp: 17, atk: 5, baseAcc: 0.46, def: 1, xp: 60, gp: [6, 21]']] },
  { name: 'a whelp pays like a Chief (a kill stops climbing with the monster)', case: 'harder-pays-more',
    edits: [['src/data/monsters.js', 'hp: 10, atk: 4, baseAcc: 0.38, def: 0, xp: 29, gp: [1, 5]', 'hp: 10, atk: 4, baseAcc: 0.38, def: 0, xp: 29, gp: [3000, 4167]']] },
  { name: 'the Shop sells a helmet the Thicket wolves drop', case: 'shop-outfits-defense',
    edits: [['src/data/supply-basics.js', "  sell('copper_studs', 'gear', null, 120),", "  sell('copper_studs', 'gear', null, 120),\n  sell('leather_helmet', 'gear', null, 120),"]] },
  { name: 'the Shop stops selling gloves (no neutral first armour piece)', case: 'shop-outfits-defense',
    edits: [['src/data/supply-basics.js', "  sell('leather_gloves', 'gear', null, 160),\n", '']] },
  { name: 'gloves and belts stop counting as armour (Defense never trains from them)', case: 'shop-outfits-defense',
    edits: [['src/data/core-model.js', "export const ARMOUR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);",
      "export const ARMOUR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots']);"]] },
  { name: 'the Thicket wolves hit like a Sewer spider (atk 4 -> 13)', case: 'thicket-solo-starter-kit',
    edits: [['src/data/monsters.js', 'hp: 17, atk: 5, baseAcc: 0.46, def: 1, xp: 60, gp: [2, 7], formula: true, speed: 4200,', 'hp: 17, atk: 16, baseAcc: 0.46, def: 1, xp: 60, gp: [2, 7], formula: true, speed: 4200,']] },
  /* The whole Sewer roster's coin back to its pre-x1.8 rows (the drop-tables play mutant's /1.8): the party nets under the Thicket. */
  { name: 'the Sewer coin back to its pre-x1.8 rows (the party nets under the Thicket)', case: 'first-grounds-net-chain',
    edits: [['src/data/monsters.js', 'hp: 41, atk: 4, baseAcc: 0.48, def: 0, xp: 140, gp: [7, 20]', 'hp: 41, atk: 4, baseAcc: 0.48, def: 0, xp: 140, gp: [4, 11]'],
      ['src/data/monsters.js', 'hp: 51, atk: 3, baseAcc: 0.44, def: 2, xp: 192, gp: [8, 26]', 'hp: 51, atk: 3, baseAcc: 0.44, def: 2, xp: 192, gp: [4, 14]'],
      ['src/data/monsters.js', 'hp: 53, atk: 6, baseAcc: 0.63, def: 1, xp: 256, gp: [9, 26]', 'hp: 53, atk: 6, baseAcc: 0.63, def: 1, xp: 256, gp: [5, 14]'],
      ['src/data/monsters.js', 'hp: 110, atk: 6, baseAcc: 0.68, def: 6, xp: 570, gp: [18, 55]', 'hp: 110, atk: 6, baseAcc: 0.68, def: 6, xp: 570, gp: [10, 31]'],
      ['src/data/monsters.js', 'hp: 63, atk: 5, baseAcc: 0.56, def: 1, xp: 239, gp: [10, 32]', 'hp: 63, atk: 5, baseAcc: 0.56, def: 1, xp: 239, gp: [6, 18]'],
      ['src/data/monsters.js', 'hp: 556, atk: 7, baseAcc: 0.76, def: 11, xp: 3288, gp: [92, 277]', 'hp: 556, atk: 7, baseAcc: 0.76, def: 11, xp: 3288, gp: [51, 154]']] },
  { name: 'a pack tile moved into the thicket', case: 'packs-on-the-map',
    edits: [['src/data/hunt-grounds.js', "box([5, 13, 21, 24], [15, 19],", "box([5, 13, 21, 24], [21, 15],"]] },
  { name: 'a prop dropped into a full box', case: 'packs-on-the-map',
    edits: [['src/data/world/maps/coppercap_warrens.js', "{ id: 'cw_plank_bridge', x: 51, y: 22 },", "{ id: 'cw_plank_bridge', x: 51, y: 22 }, { id: 'mushrooms', x: 38, y: 9 },"]] },
  { name: 'the Drop bridged two wide', case: 'one-choke',
    edits: [['src/data/world/maps/coppercap_warrens.js', "'#######...#####################################~~~~=~~~~~~##',\n    '#######...#####################################~~~~=~~~~~~##',\n    '#######...#####################################~~~~=~~~~~~##',",
      "'#######...#####################################~~~==~~~~~~##',\n    '#######...#####################################~~~==~~~~~~##',\n    '#######...#####################################~~~==~~~~~~##',"]] },
  { name: 'the full box cut to six', case: 'density-full-box',
    edits: [['src/data/hunt-grounds.js', 'export const FULL_BOX = 8;', 'export const FULL_BOX = 6;']] },
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
  /* src/shell, src/session, the two generators and _is-main: staged-until-art reads the Hunts window and the generators */
  for (const d of ['src/core', 'src/data', 'src/world', 'src/shell', 'src/session', 'assets/world', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures/play-ground.mjs',
    'tools/gen-hunts.mjs', 'tools/gen-hunt-sessions.mjs', 'tests/_is-main.mjs']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
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
  try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    const PM = await load(p.root);
    try { why = await cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
