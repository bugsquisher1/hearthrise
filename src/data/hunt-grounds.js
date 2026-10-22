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
//     groupFit    'solo' | 'party' | 'both': who the ground is built for (the world workbook's
//                 "Group fit" column; a ground the workbook does not list is 'both'). It only
//                 orders the recommendation (src/shell/hunt-list.js recommendedHunt): a party
//                 ground stays enterable alone, and says it is best with a party.
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
// 10-16 party test). ECONOMY (Tyler 2026-10-20: +25-35% over the store bill is a MINIMUM
// at the band FLOOR, never a cap; the starter grounds keep their higher gold): coin +
// commons (vendor bid) against the store bill, per hero, in the floor's FIRST hour (the
// hunt levels the hero after that), measured on the real settle by
// tests/hunt-core/drop-tables.mjs every run: the Sewer +32% (a solo Melee at 8 in the
// smiths' ladder kit: its coin rose x1.8), the Warrens +32% (four at 32 in their own-tier
// set: x1.25, at the hunt's tier-4 store food), the Thicket and the Mill Cellar far above
// (their coin unchanged). A Mage or Healer pays for drinks far past any coin today (the
// Sewer's party at 8: about 9,000 g an hour each): that is the drink and ability bill, not
// the loot (CONFLICTS.md 2026-10-20). EQUIPMENT (Tyler 10-14/10-20): every monster here
// carries one gear row (monsters.js `gear`); each ground but the cellar covers weapon,
// helmet, body, legs and boots, about every 1.3 h per hero at a low floor (bronze in the
// Thicket and the Sewer's lower rooms, iron above them), the Warrens' steel about every
// 8 h. ONE rare carrier per ground (the Rat King's Crown Shard, Old Grayjaw's Alpha Fang,
// the Chief's War Crown, 10-20 h per hero). The coin is final in the rows (DM-16).
//
// PARTY SCALING (BALANCE_RULINGS 2026-10-16, the party-size test): a fixed pack
// is trivial for four heroes and lethal at the boss for one, so a pack's HP is
// scaled by its instance's party size, `packScalePermille` below, on every ground
// whose row says `partyScale: true` (the two grounds the party test measured;
// lane action-engine wired it 2026-10-18: pull-cycle spawnPack via packHpFor).
// A ground opts in by its row so the measured kill rates of the fixture rooms
// the drop odds are pinned on do not move until the Designer rules them. A solo
// Healer gets an element floor so an immune first room is not a wall (every
// ground; damage.hurt via elementWithFloor). Both are DATA.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.25';
import { HUNT_INDEX } from './hunts.js?v=0.2.25';
import { MONSTERS } from './monsters.js?v=0.2.25';

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
    respawnMs: 30000, pullDist: 1.5, partyScale: true, groupFit: 'both',
    /* the tutorial room allows the full box and no more: its lesson is the pull */
    densityMax: Object.freeze([8, 8, 8, 8]),
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
      /* THE KING IS A PARTY FIGHT (ruling 2026-10-18, see MIN_PARTY below): minParty 2. */
      Object.freeze({ ...pocket([51, 17, 57, 29], ['rat_king', 55, 23], ['drain_rat', 54, 21], ['drain_rat', 54, 25]), minParty: 2 }),
    ]),
    route: Object.freeze([0, 1, 2, 3, 4, 5]),
    respawnMs: 90000, pullDist: 1.5, partyScale: true, groupFit: 'both',
    densityMax: Object.freeze([8, 8, 10, 12]),
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
    respawnMs: 60000, pullDist: 1.5, partyScale: true, groupFit: 'solo',
    /* integration v0.2.1: the engine's density (densityFor) reads densityMax, which every ground
       holds at the full box at least (the action engine ruling); the slider caps below are the
       designer's and wait on densityCapFor being wired (CONFLICTS.md 2026-10-18 density). */
    densityMax: Object.freeze([8, 8, 8, 8]),
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
    respawnMs: 90000, pullDist: 1.5, partyScale: true, groupFit: 'party',
    /* integration v0.2.1: the engine's density (densityFor) reads densityMax, which every ground
       holds at the full box at least (the action engine ruling); the slider caps below are the
       designer's and wait on densityCapFor being wired (CONFLICTS.md 2026-10-18 density). */
    densityMax: Object.freeze([8, 8, 8, 8]),
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

/* PARTY SCALE AS THE DEFAULT (Designer ruling 2026-10-18). Every ground row carries
   `partyScale: true` (a shipped ground that omits it is a review fail; `false` is an explicit,
   commented opt-out for a fixture, never for a shipped ground). Scaling is paid for in
   REWARD, not odds: a monster spawned at s/1000 of its row's HP is worth s/1000 of its row's
   kill yield (XP, coin and every drop chance, lucky and hearthfind rolls included), where
   s = packScalePermille(party size). A solo hero kills 1000/550 = 1.82x as fast for 0.55x the
   yield per kill, so yield per HOUR, and with it ruled band D (standard 1-3 h, rare 10-20 h,
   relic 100-150 h) and the lucky-find [4, 30] h band, is the same for a solo, a pair or a full
   party; a party is rewarded by its XP share and by reaching the King, not by a faster faucet.
   The pinned odds stay as authored (they are the full-party, 1000-permille numbers). The
   multiplier below is the data; the settle applying it to kill yields is owed to Systems (the
   monster swing model, DM-10, is a separate engine item). */
export function yieldPermille(partySize) { return packScalePermille(partySize); }

/* THE KING NEEDS A PARTY (Designer ruling 2026-10-18). A solo Melee wiped 9 times in 20 min at
   the Rat King even with HP scaled (his damage does not scale), so a pocket may carry
   `minParty`: a hunt of fewer heroes skips it, and the hunt card says "the Rat King wants a
   party of 2 or more". Solo clears every normal pocket; the King is the reason to bring a
   friend, and nobody loops through a death. This is a route filter, not a damage rule, so it
   holds whatever the swing model does later. */
export const MIN_PARTY_NOTE = 'The Rat King wants a party of two or more. Alone, you skip his hall.';

/** The pocket indexes a party of `partySize` actually walks: the route minus pockets whose `minParty` it misses. */
export function routeFor(ground, partySize) {
  const n = Math.max(1, Math.floor(Number(partySize) || 1));
  return ground.route.filter((i) => n >= ((ground.pockets[i] && ground.pockets[i].minParty) || 1));
}

/** Every monster id a party of `partySize` can meet on `ground`: the rows of each pocket it walks
    (routeFor), as built and at any density (pullRows only repeats a pocket's own rows). */
export function monstersOn(ground, partySize) {
  const out = new Set();
  for (const i of routeFor(ground, partySize)) {
    const pk = ground.pockets[i];
    for (const s of (pk.pack || pk.spawns).concat(pk.spawns)) out.add(s.monster);
  }
  return out;
}

/* THE SOLO HEALER FLOOR (same ruling): in a party of one Healer, the Healer's blows
   are worth at least this much (permille) whatever the target's element profile, so
   a Healer alone can still clear a first room that is immune to her one element. */
export const SOLO_HEALER_FLOOR = Object.freeze({ role: 'healer', elementPermille: 500 });

/* MONSTER DENSITY (Tyler 2026-10-18): a hero picks how many monsters a pull brings
   (0 = the room as built). The server stores the pick inside DENSITY_PICK and the
   settle CLAMPS it to the ground's `densityMax` for the party's size (a row's array,
   one entry per party size 1..4). IN A PARTY THE LEADER CHOOSES (Tyler 2026-10-20:
   "There should be a party leader that chooses the hunt settings"): the leader's
   pick is the pull for every member, the others' picks have no say (partyPick).
   EVERY ground's max is at least DENSITY_FULL_BOX (Tyler: "a full box", all 8 tiles
   round the tank taken); a row may allow more. The values above 8 are ASSUMED. */
export const DENSITY_FULL_BOX = 8;

/* Who a ground is built for (the workbook's "Group fit"): see the row shape's groupFit. */
export const GROUP_FITS = Object.freeze(['solo', 'party', 'both']);
export const DENSITY_PICK = Object.freeze({ min: 0, max: 16 });

/** The density an instance spawns at: the pick (partyPick's, for a party) clamped to the ground's max
    for its size; 0 (as built) for no pick. */
export function densityFor(ground, partySize, pick) {
  const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));
  const max = Array.isArray(ground && ground.densityMax) ? ground.densityMax[n - 1] : DENSITY_FULL_BOX;
  const p = Number.isInteger(pick) && pick > 0 ? pick : 0;
  return Math.max(0, Math.min(max, p, DENSITY_PICK.max));
}

/** THE PULL'S PICK: of `heroes` ([{ density, lead, seat }]) the one that leads the party (`lead`: the
    party's crowned seat, hunt_parties.leader, read per member as hr_hunt_instance_read `leads`), else
    (a solo hero, or a party whose leader is not on the instance) the lowest seat's. Its pick alone counts. */
export function partyPick(heroes) {
  const list = (heroes || []).filter(Boolean);
  const lead = list.find((h) => h.lead === true)
    || list.slice().sort((a, b) => (Number(a.seat) || 0) - (Number(b.seat) || 0))[0];
  return lead && Number.isInteger(lead.density) && lead.density > 0 ? lead.density : 0;
}

/** The HP scale (permille) for a pack in an instance of `partySize` heroes. */
export function packScalePermille(partySize) {
  const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));
  return PARTY_SCALE.basePermille + PARTY_SCALE.perHeroPermille * n;
}

/** The HP a monster of `row` spawns with on `ground` for `partySize`: scaled where the ground
    opts in (`partyScale: true`, the grounds the 10-16 party test measured), else the row's own. */
export function packHpFor(ground, row, partySize) {
  return ground && ground.partyScale === true ? scaledHp(row, partySize) : Math.max(1, (row && row.hp) || 1);
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
  return pullRows(ground, p, Math.max(1, Math.min(d.max, Math.floor(Number(level) || 1))));
}

const isBoss = (s) => !!(MONSTERS[s.monster] && MONSTERS[s.monster].boss === true);

/** THE ROWS A PULL OF `size` SPAWNS in pocket `p` (pull-cycle.js spawnPack; `size` = the settle's density,
    0 = the pocket as built, its `spawns`). The pocket's authored rows come first (a box's `pack`, else its
    `spawns`); past them the extra slots cycle its FILL rows (a box's `pack` past its `spawns`, else the
    pocket's own rows), never a boss: A BOSS NEVER REPEATS INSIDE A PULL (designer ruling 2026-10-20: a
    named leader such as the den's Old Grayjaw stands in the as-built head only). A pocket with no non-boss
    row keeps its as-built pack at any size. */
export function pullRows(ground, p, size) {
  const pk = ground.pockets[p];
  const n = Math.floor(Number(size) || 0);
  const rows = pk.pack || pk.spawns;
  if (n <= 0 || !rows.some((s) => !isBoss(s))) return pk.spawns.slice();
  if (n <= rows.length) return rows.slice(0, n);
  const extra = (pk.pack ? pk.pack.slice(pk.spawns.length) : rows).filter((s) => !isBoss(s));
  const fill = extra.length ? extra : rows.filter((s) => !isBoss(s));
  const out = rows.slice();
  for (let i = 0; out.length < n; i++) out.push(fill[i % fill.length]);
  return out;
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
  if (row.partyScale !== undefined && typeof row.partyScale !== 'boolean') bad('partyScale must be true or false');
  if (!GROUP_FITS.includes(row.groupFit)) bad('groupFit must be one of ' + GROUP_FITS.join(' / '));
  (row.pockets || []).forEach((p, i) => {
    if (p && p.minParty !== undefined && !(Number.isInteger(p.minParty) && p.minParty >= 2 && p.minParty <= PARTY_SCALE.maxHeroes)) bad('pocket ' + i + ' minParty must be 2..' + PARTY_SCALE.maxHeroes);
  });
  if (!routeFor(row, 1).length) bad('a solo hero must have at least one pocket to walk');
  if (row.densityMax !== undefined && !(Array.isArray(row.densityMax) && row.densityMax.length === PARTY_SCALE.maxHeroes
    && row.densityMax.every((v, i) => Number.isInteger(v) && v >= DENSITY_FULL_BOX && v <= DENSITY_PICK.max && (i === 0 || v >= row.densityMax[i - 1])))) {
    bad('densityMax must be ' + PARTY_SCALE.maxHeroes + ' whole numbers ' + DENSITY_FULL_BOX + '..' + DENSITY_PICK.max + ' (at least a full box), never falling as the party grows');
  }
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
    if (row.partyScale !== true) out.push(key + ': a shipped ground carries partyScale: true (designer ruling 2026-10-18)');
    out.push(...validateGround(row));
  }
  return out;
}
