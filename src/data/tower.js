// ════════════════════════════════════════════════════════════════════════
// src/data/tower.js — THE BURNING TOWER'S CLIMB: ITS RULES IN ONE ROW (data; the source of truth). Tyler 2026-11-14: "it's kind of
//   it's own challenge Where the floors get incrementally harder as the player or group climbs ... dying has no penalty BUT the level
//   xp isn't all that great". The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" (origin/lane/
//   d-burning-tower, §2 how a climb runs, §3 the mode, §7 XP); lane/c-tower-climb builds its server half.
//
// ONE ENGINE (CLAUDE.md §6). A climb IS a hunt session on the Tower's ground (hunt-grounds.js TOWER_GROUNDS), settled by
// src/core/combat-sim.js like any hunt, viewed or not, in the `tower` session mode (src/data/session-modes.js: a death costs nothing,
// no coin, no drops, no Bestiary, 375 permille XP). src/core/hunt/tower.js is the floor's one door: which monsters stand in floor F's
// room and their rows (the stat formula at Level F), the stair to the next floor, and the floor's time.
//
// THE RULES (every number a row Tyler or the designer can move; the server reads them as hr_tower_rules and hr_tower_floors,
//   tools/gen-tower.mjs, whose --check fails a stale copy):
//   roomSize        a floor is one room of this many monsters, all at Level F (the board: "five is Dangerous's pull")
//   landingEvery    every this-many floors is a LANDING: an old Keeper (the formula's boss role at Level F) and roomSize - 1 more.
//                   A landing is also a CHECKPOINT (Tyler 2026-11-16, superseding 2026-11-14's "each week starts 60 floors under your
//                   best"): a climb starts on the floor after any landing up to the hero's best (a party's: the highest landing every
//                   member has reached). The spacing the server reads for that is the mode's (session-modes.js tower.checkpointEvery,
//                   tools/gen-session-modes.mjs refuses it differing from this one)
//   floorLimitMs    a floor not cleared this long after its room stands ends the climb `floor_time` (three minutes)
//   landingLimitMs  the same on a landing (ten)
//   stairMs         the stair: the next room stands this long after the last monster of a floor falls. At least two engine swings
//                   (src/core/combat.js COMBAT_BALANCE.tickMs) so a floor's rows only change at a swing boundary with no monster of
//                   the floor before standing; the server's floors-a-window bound is window / stairMs + 1 (the engine can't beat it)
//   floorTop        the highest floor the stat formula is read at; a floor above it plays this floor's rows. The server's per-floor
//                   bounds are generated to it (hr_tower_floors), so it is the one place "the floors never end" meets a table
//   fit             the stat formula's fit for every Tower room (balance-sheet.js STAT_FORMULA.fit): one difficulty for one hero or four
//   minLevel        the Level a hero, and every seat of its party, needs to start a climb (Tyler 2026-11-18: "A minimum level to enter the
//                   tower"; hr_tower_start, the envelope's entry_gates.tower). The evidence: 2027-05-05-entry-gates.sql's header
//
// TOWER_PARTY_XP: a kill's Level XP, in permille, shared by the heroes alive at it (xp-share.js reads it itself; the one hunting table,
//   party-class-xp.js, never names the Tower): a hero alone takes the plain kill (no +15%: the solo boost keeps hunting alone up with a party, and in the Tower the
//   party's edge is the floors it reaches), a four 1300 between them (the board's §7 fit). Pairs and threes are the designer's to
//   measure ("Pairs and threes get their rows when the room is built"): until then they sit on the straight line between, ASSUMED.
//
// PURE ESM DATA. No imports, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/* `hunt`: the Tower's hunt and ground id. `the_` as the Slake's: an id that sorts after the first ground (the Mill Cellar), which every probe
   that reads "the lowest-band ground" (by band, then id) takes for an ordinary ground the ordinary door opens. */
export const TOWER_RULES = Object.freeze({
  hunt: 'the_burning_tower',
  roomSize: 5,
  landingEvery: 10,
  floorLimitMs: 180000,
  landingLimitMs: 600000,
  stairMs: 4000,
  floorTop: 300,
  fit: 'both',
  minLevel: 10,
});

export const TOWER_PARTY_XP = Object.freeze({ 1: 1000, 2: 1100, 3: 1200, 4: 1300 });

/** Every problem with the Tower's rules, as strings (empty: valid). `swingMs` is the engine's swing (COMBAT_BALANCE.tickMs). Pure. */
export function validateTower(rules, partyXp, swingMs) {
  const out = [];
  const pos = (k) => { if (!Number.isInteger(rules[k]) || rules[k] <= 0) out.push(k + ' is not a whole number above 0'); };
  if (!rules || typeof rules !== 'object') return ['the rules are no row'];
  if (typeof rules.hunt !== 'string' || !/^[a-z0-9_]{1,64}$/.test(rules.hunt)) out.push('hunt is not an id');
  for (const k of ['roomSize', 'landingEvery', 'floorLimitMs', 'landingLimitMs', 'stairMs', 'floorTop', 'minLevel']) pos(k);
  if (Number.isInteger(rules.roomSize) && (rules.roomSize < 2 || rules.roomSize > 8)) out.push('roomSize is not 2..8 (a landing is a Keeper and at least one more, and a full box is 8)');
  if (Number.isInteger(rules.minLevel) && rules.minLevel > 999) out.push('minLevel is over 999 (no hero could ever enter)');
  if (Number.isInteger(rules.floorTop) && Number.isInteger(rules.landingEvery) && rules.floorTop % rules.landingEvery) out.push('floorTop is not a landing');
  if (Number.isInteger(rules.stairMs) && Number.isInteger(swingMs) && rules.stairMs < 2 * swingMs) out.push('stairMs is under two engine swings, so a floor\'s rows could change inside the swing it was cleared in');
  if (Number.isInteger(rules.floorLimitMs) && Number.isInteger(rules.landingLimitMs) && rules.landingLimitMs < rules.floorLimitMs) out.push('a landing gets less time than a floor');
  if (!['solo', 'both', 'party'].includes(rules.fit)) out.push('fit is not solo, both or party');
  const sizes = Object.keys(partyXp || {}).map(Number).sort((a, b) => a - b);
  if (sizes.join(',') !== '1,2,3,4') out.push('the party row is not one cell for each of 1 to 4 heroes');
  let prev = 0;
  for (const n of sizes) {
    const v = partyXp[n];
    if (!Number.isInteger(v) || v <= 0) { out.push(n + ' heroes: not a whole permille above 0'); continue; }
    /* a bigger party shares more in all, and never more a head than a hero alone (the Tower's party edge is its floors) */
    if (v <= prev) out.push(n + ' heroes share no more than ' + (n - 1));
    if (v / n > partyXp[1] + 1e-9) out.push(n + ' heroes earn more a head than a hero alone');
    prev = v;
  }
  return out;
}

/* The stair against the swing is checked where the swing is known (src/core/hunt/tower.js, at load, with COMBAT_BALANCE.tickMs). */
const PROBLEMS = validateTower(TOWER_RULES, TOWER_PARTY_XP);
if (PROBLEMS.length) throw new Error('src/data/tower.js does not load: ' + PROBLEMS.join('; '));
