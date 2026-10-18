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
//
// THE GROUNDS (week plan item 17, 2026-10-18). Two, played in this order by a
// new character (src/data/hunt-tutorial.js):
//   mill_cellar     the tutorial room under the mill: two small packs of the
//                   cellar's own Giant Rats and a Slime, one hero, short respawn.
//   millrace_sewer  the first party ground. Six pockets on the sim's route
//                   (prototypes/hunt-sim/sim.js CONFIG, the measured layout):
//                   NW rats, SW slimes, channel bats, NE spiders + bats (the
//                   elite pocket), SE kobolds, and the Rat King with two rats.
// Coordinates are the world maps' tiles (src/data/world/maps/*.js); every spawn
// and seat stands on open floor there (tests/hunt-core/sewer.mjs).
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

import { HUNT_TUNING } from './hunt-tuning.js?v=0.1.0';
import { HUNT_INDEX } from './hunts.js?v=0.1.0';
import { MONSTERS } from './monsters.js?v=0.1.0';

const pocket = (room, ...spawns) => Object.freeze({ room: Object.freeze(room),
  spawns: Object.freeze(spawns.map(([monster, x, y]) => Object.freeze({ monster, x, y }))) });

export const HUNT_GROUNDS = Object.freeze({
  mill_cellar: Object.freeze({
    id: 'mill_cellar', hunt: 'mill_cellar', map: 'mill_cellar',
    /* the foot of the stair under the arch */
    start: Object.freeze([[12, 4], [11, 4], [13, 4], [12, 5]]),
    pockets: Object.freeze([
      pocket([15, 5, 21, 10], ['rat', 18, 7], ['rat', 19, 6]),
      pocket([4, 5, 10, 10], ['rat', 7, 8], ['slime', 8, 6]),
    ]),
    route: Object.freeze([0, 1]),
    respawnMs: 30000, pullDist: 1.5, partyScale: true,
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
    respawnMs: 90000, pullDist: 1.5, partyScale: true,
    densityMax: Object.freeze([8, 8, 10, 12]),
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

/* THE SOLO HEALER FLOOR (same ruling): in a party of one Healer, the Healer's blows
   are worth at least this much (permille) whatever the target's element profile, so
   a Healer alone can still clear a first room that is immune to her one element. */
export const SOLO_HEALER_FLOOR = Object.freeze({ role: 'healer', elementPermille: 500 });

/* MONSTER DENSITY (Tyler 2026-10-18): a hero picks how many monsters a pull brings
   (0 = the room as built). The server stores the pick inside DENSITY_PICK and the
   settle CLAMPS it to the ground's `densityMax` for the party's size (a row's array,
   one entry per party size 1..4); a party takes the smallest pick among its members.
   EVERY ground's max is at least DENSITY_FULL_BOX (Tyler: "a full box", all 8 tiles
   round the tank taken); a row may allow more. The values above 8 are ASSUMED. */
export const DENSITY_FULL_BOX = 8;
export const DENSITY_PICK = Object.freeze({ min: 0, max: 16 });

/** The density an instance spawns at: the members' smallest pick, clamped to the ground's max for its size. */
export function densityFor(ground, partySize, picks) {
  const n = Math.min(PARTY_SCALE.maxHeroes, Math.max(1, Math.floor(Number(partySize) || 1)));
  const max = Array.isArray(ground && ground.densityMax) ? ground.densityMax[n - 1] : DENSITY_FULL_BOX;
  const want = (picks || []).filter(Number.isInteger);
  const pick = want.length ? Math.min(...want) : 0;
  return Math.max(0, Math.min(max, pick, DENSITY_PICK.max));
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
