// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-grounds.js — WHERE A HUNT IS FOUGHT (HUNT_SCREEN_SPEC §1.2)
//
// One row per hunt ground, extending the src/data/hunts.js row of the same
// hunt. The pure engine (src/core/hunt/*) reads a resolved row; it never
// reaches into this table by itself.
//
// ROW SHAPE
//   { id, hunt, map, start, pockets, route, respawnMs, pullDist, leashMargin? }
//     id          [a-z0-9_], the key below
//     hunt        a src/data/hunts.js id
//     map         a src/data/world/maps id (the walkable grid is built from it)
//     start       [[x, y], …] entrance tiles, one per party seat (max 5)
//     pockets     [{ room: [x0, y0, x1, y1], spawns: [{ monster, x, y }] }]
//                 `room` is the PACK AREA, inclusive; every spawn stands in it
//     route       pocket indexes in walking order (each pocket at most once)
//     respawnMs   a cleared pack is back this long after it was cleared
//     pullDist    tiles from the pack centre at which the leader pulls
//     leashMargin tiles a pack may step past its room (LE-05/08); absent =
//                 HUNT_TUNING.leashMarginDefault. Read ONLY via leashMarginOf.
//     density     (optional) THE MONSTER-DENSITY SLIDER (Tyler 10-18): { solo, perHero,
//                 max }. The level IS the pull size. A party of n may pick 1..min(max,
//                 solo + perHero x (n - 1)) (densityCapFor); max is always FULL_BOX = 8,
//                 all 8 tiles round the tank (Tyler 10-18, over KIT §4b's "5 or fewer").
//                 Each pocket then carries `pull` (the tank's tile: 3x3 clear of walls and
//                 props) and `pack` (8 rows in join order on the ring round it); its pack
//                 at level L is pack[0..L) (packAt), and `spawns` = the head of `pack` is
//                 today's pack (the default level). Party size still scales pack HP.
//     gather      (optional) THE GATHER SLIDER (Tyler 10-18): { refKillMs, shares, nodes }.
//                 INERT DATA until the hunt-gathering engine lands (HUNT_GATHERING_SPEC).
//                 shares: the slider's steps, permille of the hunt spent on a node between
//                 pulls (0 = None, the default). nodes: [{ id, node, x, y, pocket }], `node`
//                 a src/data/gathering.js TREES/ROCKS id, standing on (x, y) inside pocket
//                 p's room; GROUND_NODE_KINDS gives its skill, tier, tool (a boost, never a
//                 gate), charges, respawnMs and its full / spent sprite. The map row places
//                 the full sprite on the same tile, so a node blocks a step like a prop.
//
// THE GROUNDS (week plan item 17, 2026-10-18). Two, played in this order by a
// new character (src/data/hunt-tutorial.js):
//   mill_cellar     the tutorial room under the mill: two small packs of the
//                   cellar's own Giant Rats and a Slime, one hero, short respawn.
//   millrace_sewer  the first party ground. Six pockets on the sim's route
//                   (prototypes/hunt-sim/sim.js CONFIG, the measured layout):
//                   NW rats, SW slimes, channel bats, NE spiders + bats (the
//                   elite pocket), SE kobolds, and the Rat King with two rats.
//   meadowbrook_thicket  THE WOOD GROUND (Tyler 10-18, workbook H-001, levels 1-15,
//                   solo or a pair). A ring of six clearings round the Meadowbrook: west
//                   bank, the log bridge (the ONE 1-tile choke), east bank, back over the
//                   ford. Logs: Normal trees west, Oaks east, Hollow Oaks at the den.
//   coppercap_warrens    THE ORE GROUND (Tyler 10-18, workbook H-005, levels 32-50, a
//                   party). Down through the goblins' diggings, over the Drop on a plank
//                   bridge (the ONE 1-tile choke), back up the ore-cart ramp. Ore: Copper
//                   at the face, Iron in the stores, Coal below the Drop, Gold in the hall.
// Coordinates are the world maps' tiles (src/data/world/maps/*.js); every spawn
// and seat stands on open floor there (tests/hunt-core/sewer.mjs, forest-cave.mjs).
//
// THE WOLVES (one family, roles not stat bumps; Tyler's H-001 creatures kept by intent):
// the Gray Whelp (the swarm: fast, weak, many), the Gray Wolf (the skirmisher, the
// ground's common carrier), the Briarcoat Wolf (the tank: burrs catch arrows, a club
// knocks them loose; the workbook's armoured Cave Beetle and Thorn Sprout folded in),
// the Dire Gray (the bruiser) and Old Grayjaw (the den mother, a tier-3 bite). The
// workbook's Cliff Sparrow became the whelps' speed; a bird family is its own ground.
// THE GOBLINS (one family; Tyler's H-005): the Goblin Scavenger (swarm; picks ore out of
// the spoil), the Goblin Skulker (the skirmisher that goes for the back line: Tyler's
// Goblin Archer until monsters can shoot), the Goblin Digger (the tank: its copper pot
// turns a blade, a hammer rings it; the Giant Ant and Tunnel Ratling folded in), the
// Hobgoblin Foreman (the bruiser) and Chief Coppercap, who wears the warren's name.
// Coin is final in the rows (DM-16). Drops feed what exists: wolf meat cooks, pelts
// build rooms, ore smelts; fangs, ears and totems are the trophies (VENDOR_TRASH).
//
// THE SEWER'S CREATURES (monsters.js, `formation: true`). Names come from the work
// done down there: the Drain Rat, the Sump Slime, the Culvert Bat (roosts over the
// channel, fast enough to reach the backline), the Cistern Spider (the elite pocket's
// anchor), the Kobold Tosher (picks the outfalls for scrap) and the Rat King (a knot
// of rats under a crown hammered from drain grates). hp/atk/def/xp/speed are the hunt
// sim's measured rows (prototypes/hunt-sim/BALANCE_RULINGS.md, rounds 1-2 and the
// 10-16 party test). ECONOMY (Tyler 2026-10-14: coin + common drops pay the supplies,
// the rares are the profit): coin and drop chances put a full party's coin + commons
// within ~6% of its measured supply bill at the ruled prices, and the rares (the Crown
// Shard first) add ~19% (tests/hunt-core/sewer.mjs --report). The coin is final in the
// rows: no engine multiplies it again (parity DM-16).
//
// PARTY SCALING (BALANCE_RULINGS 2026-10-16, the party-size test): a fixed pack
// is trivial for four heroes and lethal at the boss for one, so a pack's HP is
// scaled by its instance's party size, `packScalePermille` below. A solo Healer
// gets an element floor so an immune first room is not a wall. Both are DATA;
// the engine reads them through the two helpers (systems handoff: pull-cycle
// spawnPack and damage.hurt apply them).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.0';
import { HUNT_INDEX } from './hunts.js?v=0.2.0';
import { MONSTERS } from './monsters.js?v=0.2.0';

const pocket = (room, ...spawns) => Object.freeze({ room: Object.freeze(room),
  spawns: Object.freeze(spawns.map(([monster, x, y]) => Object.freeze({ monster, x, y }))) });

/* THE DENSITY SLIDER (Tyler 10-18): the level IS the pull size, 1..max, and every ground's max is
   at least 8, a full box: all 8 tiles round the tank (Tyler 10-18). A walked pocket is a `box`: its
   `pull` tile (3x3 clear, no wall or prop: tests/hunt-core/forest-cave.mjs) and its `pack`, 8 rows
   in join order, standing on the ring round the pull tile (N, E, S, W, then the corners).
   `spawns` is the first `base` of them, today's pack. Read only through packAt / densityCapFor. */
export const FULL_BOX = 8;
const RING = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]);
const box = (room, pull, base, more) => {
  const pack = base.concat(more).map((monster, i) => Object.freeze({ monster, x: pull[0] + RING[i][0], y: pull[1] + RING[i][1] }));
  return Object.freeze({ room: Object.freeze(room), pull: Object.freeze(pull), spawns: Object.freeze(pack.slice(0, base.length)), pack: Object.freeze(pack) });
};
const density = (solo, perHero, max) => Object.freeze({ solo, perHero, max });

/* THE GATHER NODE KINDS (HUNT_GATHERING_SPEC §3, REVIEW §3 and §5): what a placed node is. `node` is a
   src/data/gathering.js TREES/ROCKS id (its req, xp, ms and product are read from there, never copied);
   `tier` is the spec's tier-map rung; a tool is a boost, never a gate (REVIEW §3); `charges` actions
   empty it, then it shows `spent` for `respawnMs`. `sprite` / `spent` are art ids (the ground's set). */
const kind = (skill, tier, charges, respawnMs, sprite, spent) => Object.freeze({ skill, tier,
  tool: Object.freeze({ skill, required: false }), charges, respawnMs, sprite, spent });
export const GROUND_NODE_KINDS = Object.freeze({
  normal_tree: kind('woodcutting', 1, 6, 45000, 'pine', 'mb_pine_stump'),
  oak_tree: kind('woodcutting', 1, 8, 60000, 'oak', 'mb_oak_stump'),
  hollow_oak_tree: kind('woodcutting', 1, 10, 90000, 'mb_hollow_oak', 'mb_hollow_oak_stump'),
  copper_rock: kind('mining', 1, 6, 45000, 'cw_copper_vein', 'cw_copper_vein_spent'),
  iron_rock: kind('mining', 1, 6, 60000, 'cw_iron_vein', 'cw_iron_vein_spent'),
  coal_rock: kind('mining', 1, 8, 75000, 'cw_coal_seam', 'cw_coal_seam_spent'),
  gold_rock: kind('mining', 3, 4, 120000, 'cw_gold_seam', 'cw_gold_seam_spent'),
});

/* THE GATHER SLIDER (Tyler 10-18): `shares` are the steps of the time between pulls a hero spends
   on a node, in permille of the hunt (0 = None, the default: REVIEW amendment). `refKillMs` is the
   reference hero's time to clear one pack here (spec §2): the engine sizes a gap from it, so a hero
   who out-levels the ground gathers more. Each node is placed in a pocket's room, on its route. */
const GATHER_SHARES = Object.freeze([0, 250, 500, 750]);
const gather = (refKillMs, nodes) => Object.freeze({ refKillMs, shares: GATHER_SHARES,
  nodes: Object.freeze(nodes.map(([node, x, y, p]) => Object.freeze({ id: 'n' + x + '_' + y, node, x, y, pocket: p }))) });

export const HUNT_GROUNDS = Object.freeze({
  mill_cellar: Object.freeze({
    id: 'mill_cellar', hunt: 'mill_cellar', map: 'mill_cellar',
    /* the foot of the stair under the arch */
    start: Object.freeze([[12, 4], [11, 4], [13, 4], [12, 5]]),
    pockets: Object.freeze([
      pocket([15, 5, 21, 10], ['rat', 18, 7], ['rat', 19, 6]),
      pocket([4, 5, 10, 10], ['rat', 7, 8], ['slime', 8, 6], ['hive_wasp', 5, 6]),
    ]),
    route: Object.freeze([0, 1]),
    respawnMs: 30000, pullDist: 1.5,
  }),
  millrace_sewer: Object.freeze({
    id: 'millrace_sewer', hunt: 'millrace_sewer', map: 'millrace_sewer',
    /* the west mouth, where the cellar's drain comes out */
    start: Object.freeze([[1, 21], [0, 21], [1, 22], [2, 21]]),
    pockets: Object.freeze([
      pocket([3, 2, 12, 10], ['drain_rat', 7, 4], ['drain_rat', 8, 3], ['drain_rat', 9, 4], ['drain_rat', 8, 5]),
      pocket([2, 27, 13, 34], ['sump_slime', 6, 31], ['sump_slime', 7, 30], ['sump_slime', 8, 31]),
      pocket([26, 24, 37, 34], ['culvert_bat', 30, 27], ['culvert_bat', 31, 29]),
      pocket([38, 2, 48, 12], ['cistern_spider', 41, 5], ['cistern_spider', 43, 5], ['culvert_bat', 42, 4], ['culvert_bat', 44, 6]),
      pocket([40, 30, 50, 37], ['kobold_tosher', 43, 35], ['kobold_tosher', 44, 34], ['kobold_tosher', 45, 35]),
      pocket([51, 17, 57, 29], ['rat_king', 55, 23], ['drain_rat', 54, 21], ['drain_rat', 54, 25]),
    ]),
    route: Object.freeze([0, 1, 2, 3, 4, 5]),
    respawnMs: 90000, pullDist: 1.5,
  }),
  meadowbrook_thicket: Object.freeze({
    id: 'meadowbrook_thicket', hunt: 'meadowbrook_thicket', map: 'meadowbrook_thicket',
    /* the meadow path in from the west */
    start: Object.freeze([[1, 19], [1, 18]]),
    pockets: Object.freeze([
      /* P0 Woodcutters' Clearing: whelps, the first lesson */
      box([5, 13, 21, 24], [15, 19], ['gray_whelp', 'gray_whelp'], ['gray_wolf', 'gray_whelp', 'gray_whelp', 'gray_wolf', 'gray_whelp', 'gray_whelp']),
      /* P1 Birch Glade: the wolves proper */
      box([2, 1, 22, 8], [17, 4], ['gray_wolf', 'gray_whelp'], ['gray_wolf', 'gray_whelp', 'gray_wolf', 'gray_whelp', 'gray_wolf', 'gray_whelp']),
      /* P2 Briar Hollow, over the bridge: the briarcoats (bring a club, not a bow) */
      box([38, 1, 57, 11], [50, 6], ['briarcoat_wolf', 'briarcoat_wolf'], ['gray_wolf', 'briarcoat_wolf', 'gray_wolf', 'briarcoat_wolf', 'gray_whelp', 'gray_whelp']),
      /* P3 Oak Stand: a Dire Gray leads */
      box([36, 15, 57, 24], [45, 20], ['dire_gray', 'gray_wolf'], ['gray_wolf', 'gray_wolf', 'briarcoat_wolf', 'gray_whelp', 'dire_gray', 'gray_wolf']),
      /* P4 Grayjaw's Den: the den mother and her two */
      box([38, 28, 57, 38], [51, 33], ['grayjaw', 'gray_wolf', 'gray_wolf'], ['gray_whelp', 'dire_gray', 'gray_whelp', 'gray_wolf', 'gray_whelp']),
      /* P5 Fern Hollow, back over the ford */
      box([3, 27, 20, 38], [10, 33], ['gray_wolf', 'gray_whelp'], ['briarcoat_wolf', 'gray_whelp', 'gray_wolf', 'gray_whelp', 'briarcoat_wolf', 'gray_whelp']),
    ]),
    route: Object.freeze([0, 1, 2, 3, 4, 5]),
    respawnMs: 60000, pullDist: 1.5,
    /* a solo hero may pull up to 6, a pair the full box */
    density: density(6, 2, 8),
    gather: gather(9000, [
      /* P0 the woodcutters' clearing: the first logs, by the trailhead */
      ['normal_tree', 6, 16, 0], ['normal_tree', 17, 14, 0], ['normal_tree', 18, 23, 0], ['normal_tree', 8, 22, 0],
      /* P1 Birch Glade */
      ['normal_tree', 2, 6, 1], ['normal_tree', 22, 2, 1], ['normal_tree', 6, 7, 1],
      /* P2 Briar Hollow: the first oaks across the bridge */
      ['oak_tree', 40, 3, 2], ['oak_tree', 56, 6, 2],
      /* P3 Oak Stand */
      ['oak_tree', 37, 17, 3], ['oak_tree', 56, 17, 3], ['oak_tree', 39, 23, 3], ['oak_tree', 54, 23, 3],
      /* P4 Grayjaw's Den: the hollow oaks she dens under */
      ['hollow_oak_tree', 55, 36, 4], ['hollow_oak_tree', 39, 30, 4],
      /* P5 Fern Hollow */
      ['normal_tree', 4, 31, 5], ['normal_tree', 4, 36, 5], ['oak_tree', 19, 36, 5],
    ]),
  }),
  coppercap_warrens: Object.freeze({
    id: 'coppercap_warrens', hunt: 'coppercap_warrens', map: 'coppercap_warrens',
    /* the adit, down from the hillside */
    start: Object.freeze([[9, 1], [8, 1], [10, 1], [9, 2]]),
    pockets: Object.freeze([
      /* P0 the Spoil Heap: scavengers sorting ore */
      box([3, 6, 20, 15], [13, 11], ['goblin_scavenger', 'goblin_scavenger', 'goblin_scavenger'], ['goblin_skulker', 'goblin_scavenger', 'goblin_scavenger', 'goblin_skulker', 'goblin_scavenger']),
      /* P1 the Copper Face: diggers at the vein */
      box([26, 3, 42, 13], [37, 8], ['goblin_digger', 'goblin_scavenger', 'goblin_scavenger'], ['goblin_digger', 'goblin_skulker', 'goblin_scavenger', 'goblin_digger', 'goblin_scavenger']),
      /* P2 the Tool Store: skulkers guard the picks */
      box([47, 3, 57, 18], [52, 11], ['goblin_skulker', 'goblin_skulker', 'goblin_scavenger'], ['goblin_skulker', 'goblin_scavenger', 'goblin_skulker', 'goblin_scavenger', 'goblin_digger']),
      /* P3 the Coal Gallery, over the Drop */
      box([44, 24, 57, 38], [53, 34], ['goblin_digger', 'goblin_digger', 'goblin_scavenger'], ['goblin_skulker', 'goblin_digger', 'goblin_scavenger', 'goblin_skulker', 'goblin_digger']),
      /* P4 the Foreman's Cut */
      box([22, 26, 35, 38], [26, 33], ['hobgoblin_foreman', 'goblin_digger', 'goblin_digger'], ['goblin_scavenger', 'goblin_skulker', 'goblin_digger', 'goblin_scavenger', 'goblin_skulker']),
      /* P5 the Chief's Hall */
      box([2, 25, 14, 38], [7, 31], ['chief_coppercap', 'goblin_scavenger', 'goblin_scavenger'], ['goblin_digger', 'goblin_skulker', 'hobgoblin_foreman', 'goblin_scavenger', 'goblin_skulker']),
    ]),
    route: Object.freeze([0, 1, 2, 3, 4, 5]),
    respawnMs: 90000, pullDist: 1.5,
    /* a solo hero up to 4, a pair 6, three or four the full box */
    density: density(4, 2, 8),
    gather: gather(12000, [
      /* P0 the Spoil Heap: what the scavengers missed */
      ['copper_rock', 4, 9, 0], ['copper_rock', 16, 13, 0], ['copper_rock', 3, 11, 0],
      /* P1 the Copper Face, the warren's namesake */
      ['copper_rock', 27, 7, 1], ['copper_rock', 41, 5, 1], ['copper_rock', 30, 12, 1], ['copper_rock', 39, 12, 1],
      /* P2 the Tool Store */
      ['iron_rock', 56, 9, 2], ['iron_rock', 48, 11, 2],
      /* P3 the Coal Gallery, below the Drop (coal is open to every level: Tyler 10-14) */
      ['coal_rock', 45, 28, 3], ['coal_rock', 57, 27, 3], ['coal_rock', 44, 35, 3], ['coal_rock', 57, 30, 3],
      /* P4 the Foreman's Cut */
      ['iron_rock', 22, 30, 4], ['iron_rock', 35, 29, 4],
      /* P5 the Chief's Hall: the seam his hoard came out of */
      ['gold_rock', 2, 30, 5], ['gold_rock', 2, 34, 5],
    ]),
  }),
});

/* THE PARTY SCALE (BALANCE_RULINGS 2026-10-16): pack HP x (base + perHero x party
   size), in permille, party size clamped to 1..maxHeroes. 550 solo, 700 a pair,
   850 three, 1000 a full party; the Rat King scales the same way. The numbers are
   the ruling's; the measured verdict behind them is the 10-16 party-size table. */
export const PARTY_SCALE = Object.freeze({ basePermille: 400, perHeroPermille: 150, maxHeroes: 4 });

/* THE SOLO HEALER FLOOR (same ruling): in a party of one Healer, the Healer's blows
   are worth at least this much (permille) whatever the target's element profile, so
   a Healer alone can still clear a first room that is immune to her one element. */
export const SOLO_HEALER_FLOOR = Object.freeze({ role: 'healer', elementPermille: 500 });

/** The HP scale (permille) for a pack in an instance of `partySize` heroes. */
export function packScalePermille(partySize) {
  const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));
  return PARTY_SCALE.basePermille + PARTY_SCALE.perHeroPermille * n;
}

/** A spawned monster's HP for `partySize`: the row's HP scaled, never below 1. */
export function scaledHp(row, partySize) {
  return Math.max(1, Math.floor(((row && row.hp) || 1) * packScalePermille(partySize) / 1000));
}

/** The element value (permille) a hero's blow lands at, after the solo Healer floor. */
export function elementWithFloor(permille, role, partySize) {
  return role === SOLO_HEALER_FLOOR.role && partySize === 1 ? Math.max(permille, SOLO_HEALER_FLOOR.elementPermille) : permille;
}

/** The highest density level a party of `partySize` may pick on `ground` (1 on a ground with no slider). */
export function densityCapFor(ground, partySize) {
  const d = ground && ground.density;
  if (!d) return 1;
  const n = Math.max(1, Math.floor(Number(partySize) || 1));
  return Math.max(1, Math.min(d.max, d.solo + d.perHero * (n - 1)));
}

/** Pocket `p`'s pack at density `level` (the pull size, clamped to 1..max): the first `level` rows of its `pack`.
    A pocket with no `pack` (a ground with no slider) is its `spawns` whatever the level. */
export function packAt(ground, p, level) {
  const pk = ground.pockets[p];
  const d = ground.density;
  if (!d || !pk.pack) return pk.spawns.slice();
  const lv = Math.max(1, Math.min(d.max, Math.floor(Number(level) || 1)));
  return pk.pack.slice(0, lv);
}

/** A ground's gather nodes, each with its kind resolved (empty for a ground with none). INERT until the gather engine lands. */
export function gatherNodesOf(ground) {
  const g = ground && ground.gather;
  return g ? g.nodes.map((n) => Object.assign({}, n, GROUND_NODE_KINDS[n.node])) : [];
}

const ID = /^[a-z0-9_]{1,40}$/;
const MAX_SEATS = 5;
const isTile = (t) => Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[1] >= 0;
const inRect = (r, x, y) => x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3];

/** The leash margin of a ground: its own, else the tuning default. The one reader. */
export function leashMarginOf(ground) {
  const m = ground && ground.leashMargin;
  return m === undefined ? HUNT_TUNING.leashMarginDefault : m;
}

/**
 * Every problem with one ground row, as strings. Empty = valid.
 * `refs` lets a fixture be checked without the real catalogues:
 * { hunts: { id: row }, monsters: { id: row } }.
 */
export function validateGround(row, refs) {
  const hunts = (refs && refs.hunts) || HUNT_INDEX;
  const monsters = (refs && refs.monsters) || MONSTERS;
  const out = [];
  const bad = (why) => out.push(String(row && row.id) + ': ' + why);
  if (!row || typeof row !== 'object') return ['ground row is not an object'];
  if (!ID.test(String(row.id))) bad('bad id');
  if (!hunts[row.hunt]) bad('hunt ' + row.hunt + ' is not in hunts.js');
  if (typeof row.map !== 'string' || !row.map) bad('map must name a world map');
  if (!Array.isArray(row.start) || !row.start.length || row.start.length > MAX_SEATS || !row.start.every(isTile)) {
    bad('start must be 1..' + MAX_SEATS + ' tiles');
  }
  if (!Array.isArray(row.pockets) || !row.pockets.length) bad('needs at least one pocket');
  (row.pockets || []).forEach((p, i) => {
    const r = p && p.room;
    if (!Array.isArray(r) || r.length !== 4 || !r.every((v) => Number.isInteger(v) && v >= 0) || r[0] > r[2] || r[1] > r[3]) {
      bad('pocket ' + i + ' room must be [x0, y0, x1, y1] with x0 <= x1, y0 <= y1');
      return;
    }
    if (!Array.isArray(p.spawns) || !p.spawns.length) bad('pocket ' + i + ' has no spawns');
    for (const s of p.spawns || []) {
      if (!s || !monsters[s.monster]) bad('pocket ' + i + ' spawns unknown monster ' + (s && s.monster));
      else if (!isTile([s.x, s.y]) || !inRect(r, s.x, s.y)) bad('pocket ' + i + ' spawn ' + s.monster + ' stands outside its room');
    }
  });
  const n = (row.pockets || []).length;
  if (!Array.isArray(row.route) || !row.route.length || new Set(row.route).size !== row.route.length
    || !row.route.every((i) => Number.isInteger(i) && i >= 0 && i < n)) bad('route must list distinct pocket indexes');
  if (!Number.isInteger(row.respawnMs) || row.respawnMs <= 0 || row.respawnMs % HUNT_TUNING.stepMs !== 0) {
    bad('respawnMs must be a positive whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  }
  if (!(typeof row.pullDist === 'number' && row.pullDist > 0 && row.pullDist <= 8)) bad('pullDist must be in (0, 8]');
  if (row.leashMargin !== undefined && !(Number.isInteger(row.leashMargin) && row.leashMargin >= 0 && row.leashMargin <= 8)) {
    bad('leashMargin must be an integer 0..8');
  }
  const d = row.density;
  if (d !== undefined) {
    /* Tyler 10-18: every ground's max is the full box of 8 (all 8 tiles round the tank) */
    if (d.max !== FULL_BOX || !(Number.isInteger(d.solo) && d.solo >= 1 && d.solo <= d.max)
      || !(Number.isInteger(d.perHero) && d.perHero >= 0)) bad('density needs 1 <= solo <= max, max ' + FULL_BOX + ' (the full box), perHero >= 0');
    (row.pockets || []).forEach((pk, i) => {
      const pack = pk.pack || [];
      if (pack.length !== d.max) bad('pocket ' + i + ' pack holds ' + pack.length + ', not the full ' + d.max);
      if (!isTile(pk.pull) || !inRect(pk.room, pk.pull[0], pk.pull[1])) bad('pocket ' + i + ' pull tile is not inside its room');
      pk.spawns.forEach((s, k) => {
        if (!pack[k] || pack[k].monster !== s.monster || pack[k].x !== s.x || pack[k].y !== s.y) bad('pocket ' + i + ' spawns are not the head of its pack');
      });
      for (const e of pack) {
        if (!monsters[e.monster]) bad('pocket ' + i + ' pack holds unknown monster ' + e.monster);
        else if (Math.max(Math.abs(e.x - pk.pull[0]), Math.abs(e.y - pk.pull[1])) !== 1) bad('pocket ' + i + ' pack ' + e.monster + ' is not on the ring round the pull tile');
      }
    });
  }
  const g = row.gather;
  if (g !== undefined) {
    if (!(Number.isInteger(g.refKillMs) && g.refKillMs > 0)) bad('gather.refKillMs must be a positive integer');
    if (!Array.isArray(g.shares) || g.shares[0] !== 0 || g.shares.some((s, i) => !Number.isInteger(s) || s < 0 || s >= 1000 || (i && s <= g.shares[i - 1]))) {
      bad('gather.shares must rise from 0 in permille below 1000');
    }
    const ids = new Set();
    for (const nd of g.nodes || []) {
      if (ids.has(nd.id)) bad('gather node ' + nd.id + ' is listed twice');
      ids.add(nd.id);
      if (!GROUND_NODE_KINDS[nd.node]) bad('gather node ' + nd.id + ' is unknown kind ' + nd.node);
      const r = row.pockets[nd.pocket] && row.pockets[nd.pocket].room;
      if (!r || !isTile([nd.x, nd.y]) || !inRect(r, nd.x, nd.y)) bad('gather node ' + nd.id + ' is not inside pocket ' + nd.pocket + "'s room");
    }
  }
  return out;
}

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  for (const [key, row] of Object.entries(HUNT_GROUNDS)) {
    if (row.id !== key) out.push(key + ': row id ' + row.id + ' does not match its key');
    out.push(...validateGround(row));
  }
  return out;
}
