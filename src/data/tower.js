// ════════════════════════════════════════════════════════════════════════
// src/data/tower.js — THE BURNING TOWER: THE DANGER SCALE WITH NO TOP, AS A WEEKLY CLIMB (data; the source of truth).
//
// docs/design/redesign/02-architecture.md packages 3 and 7 ("The Tower is a ground whose band has no top", "the uncapped Danger scale as
// a weekly climb with its own chest") and 12-targets.md section 7 (the Tower stays, its weapons are the top chase); lane/tower-boss-formula
// (2026-11-22) rebuilt it from formulas. Tyler 2026-11-14 for what it is: "it's kind of it's own challenge Where the floors get
// incrementally harder as the player or group climbs ... dying has no penalty BUT the level xp isn't all that great".
//
// ONE ENGINE (CLAUDE.md §6). A climb IS a hunt session on the Tower's ground (hunt-grounds.js TOWER_GROUNDS), settled by
// src/core/combat-sim.js like any hunt, viewed or not, in the `tower` session mode (src/data/session-modes.js: a death costs nothing, no
// coin, no drops, no Bestiary). src/core/hunt/tower.js is the floor's one door.
//
// NOTHING HERE IS A TABLE OF FLOORS. Every floor is three formulas of its number F:
//   ITS LEVEL   towerLevelOf(F) = ceil(F x steps.levelPm / 1000): the Level its monsters' rows are read at (the stat formula, balance-sheet.js
//               formulaStats: their to-hit, defense and evasion against a hero of that Level). A Level is one step (04 section 1)
//   ITS DEPTH   towerDepthOf(F) = floor(F x steps.depthPm / 1000): its steps on the Danger scale. Each multiplies a monster's HP and its blow
//               by (1 + DANGER.powerStep), the scale's one ratio (src/data/danger.js), so floor over floor the climb grows by the same
//               ratio at every height and never flattens. This replaces the heat (a blows-only patch past floor 100): Andy's 1 -> 182 in
//               52 minutes at Level 74 (2026-11-18), "100-170 felt the same", is what a straight Level line does past Level 100
//   ITS QUESTION  the floor's band (landingEvery floors) plays one ROW of TOWER_MIXES in turn: the monsters' role on the Danger scale's
//               role table (src/data/monster-roles.js: who they reach and how) and their stat role (balance-sheet.js MONSTER_ROLES: how
//               thick, how hard, how slippery), and how many stand. A room holds `size` monsters, each carrying roomSize / size of a
//               reference monster's HP and blow, so a band of eight swarmers and a band of four stalkers weigh the same and ask different
//               questions (04 section 6: "a ground is a mix of roles, and the mix is the question the ground asks")
// A landing (every landingEvery-th floor) puts its Keeper in the first slot: a monster of the floor's kinds at the `keeper` boss kind
// (src/data/bosses.js: the elite times the keeper's row, and a ramp on its blow for every minute it fights).
//
// THE TOP IS THE SCALE'S, NOT THE TOWER'S. The floors go on as long as the Danger scale's numbers stay safe: the last landing whose Level
// and depth are both inside DANGER.stepMax (towerTopOf). Past it a floor plays that floor's rows. The server's per-floor bounds are generated
// to it (hr_tower_floors, tools/gen-tower.mjs).
//
// THE PAY (04 section 7, one rule): a kill in the Tower pays each hero the hours table's share of its OWN Level, over pay.refKillsHead kills
//   a head an hour, times the depth ratio at the gap (the floor's Level - the hero's, PAY.payStepXp a step, held to PAY.gapMax above and
//   PAY.floor below: src/core/hunt/danger.js gapPayRatio), times pay.payPm / 1000 and the room's share (roomSize / size), shared evenly by
//   the heroes at the kill. No party table (04 section 7: "a good four earns more a head because it holds deeper"). The Tower is not a
//   farm: payPm says what a Tower hour pays against a hunting hour on the hours table. refKillsHead is MEASURED (the header's evidence) and
//   never under PAY.refKillsHead, so the server's one Level XP ceiling a kill (hr_danger_level_xp_max) bounds every Tower kill.
//
// THE RULES (every number a row the designer can move; the server reads them as hr_tower_rules and hr_tower_floors, tools/gen-tower.mjs,
//   whose --check fails a stale copy):
//   roomSize        the reference room: a mix's monsters carry roomSize / size of one reference monster's HP and blow
//   landingEvery    every this-many floors is a LANDING (a Keeper) and a CHECKPOINT (Tyler 2026-11-16): a climb starts on the floor after any
//                   landing up to the hero's best (a party's: the highest landing every member has reached). session-modes.js
//                   tower.checkpointEvery must equal it (tools/gen-session-modes.mjs refuses a difference)
//   floorLimitMs    a floor not cleared this long after its room stands ends the climb `floor_time`; landingLimitMs the same on a landing
//   stairMs         the next room stands this long after the last monster of a floor falls (at least two engine swings: the server's
//                   floors-a-window bound is window / stairMs + 1)
//   fit             the stat formula's fit for every room (balance-sheet.js STAT_FORMULA.fit): one difficulty for one hero or four
//   minLevel        the Level every seat needs to start a climb (Tyler 2026-11-18; hr_tower_start, the envelope's entry_gates.tower)
//   steps           levelPm, depthPm: the two floor formulas above
//   pay             payPm, refKillsHead: the pay rule above
//
// MEASURED (lane/tower-boss-formula, 2026-11-22; tools/balance-sim/tower-curve.mjs, a PLAYED tank + bow + mage + healer at Level 74 on the
//   real settle, from floor 1, 70 minutes at most): see the lane's report and tests/tower-climb.mjs TC-CURVE for the band table.
//
// PURE ESM DATA. Imports only the Danger scale's numbers. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════
import { DANGER, PAY } from './danger.js';

/* `hunt`: the Tower's hunt and ground id. `the_` as the Slake's: an id that sorts after the first ground (the Mill Cellar), which every probe
   that reads "the lowest-band ground" (by band, then id) takes for an ordinary ground the ordinary door opens. */
export const TOWER_RULES = Object.freeze({
  hunt: 'the_burning_tower',
  roomSize: 5,
  landingEvery: 10,
  floorLimitMs: 180000,
  landingLimitMs: 600000,
  stairMs: 4000,
  fit: 'both',
  /* THE MONSTERS' SWITCH (lane/monster-formula, as DANGER_GROUNDS `monsters`): 'rows' the stat sheet's formula at the floor's Level (today);
     'formula' each band's reach role's derived stats (src/core/hunt/monster-formula.js formulaAt) against the reference company of the
     floor's Level, at a gap of the floor's depth. Flipping it moves every room: re-measure the Tower (tests/tower-climb.mjs) */
  monsters: 'rows',
  minLevel: 10,
  /* STARTING VALUES, MEASURED (the header): one Level a floor, and 1.6 Danger steps a floor (x1.0056 HP and blow a floor, x1.058 a band) */
  steps: Object.freeze({ levelPm: 1000, depthPm: 2300 }),
  /* a Tower hour pays about half a hunting hour of Level XP at the reference rate (Tyler 2026-11-14: "the level xp isn't all that great") */
  pay: Object.freeze({ payPm: 500, refKillsHead: 300 }),
});

/* THE FLOORS' QUESTIONS, in turn, one a band (towerMixOf): `reach` a Danger-scale role (monster-roles.js), `role` a stat role
   (balance-sheet.js MONSTER_ROLES), `size` the monsters a room holds (2..8, a full box), `name` what the Tower window calls the band.
   The order is the climb's: it opens on a line a front can hold, and every sixth band asks the same question again, deeper. */
export const TOWER_MIXES = Object.freeze([
  Object.freeze({ id: 'line', name: 'The Line', reach: 'brute', role: 'regular', size: 5 }),
  Object.freeze({ id: 'volley', name: 'The Volley', reach: 'shooter', role: 'glass', size: 5 }),
  Object.freeze({ id: 'swarm', name: 'The Swarm', reach: 'swarm', role: 'swarm', size: 8 }),
  Object.freeze({ id: 'stalkers', name: 'The Stalkers', reach: 'stalker', role: 'regular', size: 4 }),
  Object.freeze({ id: 'choir', name: 'The Choir', reach: 'caster', role: 'regular', size: 5 }),
  Object.freeze({ id: 'wall', name: 'The Wall', reach: 'brute', role: 'heavy', size: 4 }),
]);

/** Floor `floor` as a whole floor, 1 at least. */
const floorOf = (floor) => Math.max(1, Math.floor(Number(floor) || 1));

/** THE FLOOR'S LEVEL (the header): ceil(F x levelPm / 1000), 1 at least. Pure. */
export function towerLevelAt(floor, rules = TOWER_RULES) {
  return Math.max(1, Math.ceil((floorOf(floor) * rules.steps.levelPm) / 1000));
}

/** THE FLOOR'S DEPTH on the Danger scale (the header): floor(F x depthPm / 1000). Pure. */
export function towerDepthAt(floor, rules = TOWER_RULES) {
  return Math.floor((floorOf(floor) * rules.steps.depthPm) / 1000);
}

/** THE LAST FLOOR THE FORMULAS ARE READ AT: the highest landing whose Level and depth both stay inside DANGER.stepMax. Pure. */
export function towerTopOf(rules = TOWER_RULES) {
  const per = Math.max(rules.steps.levelPm, rules.steps.depthPm, 1);
  return Math.floor(Math.floor((DANGER.stepMax * 1000) / per) / rules.landingEvery) * rules.landingEvery;
}

/** The mix row floor `floor` plays on run `rules` (its band's, in turn), or null for a run with none (a Catacomb wing). Pure.
    @param {number} floor
    @param {{ landingEvery: number, mixes?: ReadonlyArray<any> | null }} [rules] a RUN_GROUNDS row (the Tower's by default) */
export function towerMixOf(floor, rules = RUN_GROUNDS[TOWER_RULES.hunt]) {
  const mixes = rules.mixes || null;
  if (!mixes || !mixes.length) return null;
  return mixes[Math.floor((floorOf(floor) - 1) / rules.landingEvery) % mixes.length];
}

/** Every problem with a run's rules, as strings (empty: valid). `swingMs` is the engine's swing (COMBAT_BALANCE.tickMs). Pure. */
export function validateTower(rules, swingMs) {
  const out = [];
  const pos = (k) => { if (!Number.isInteger(rules[k]) || rules[k] <= 0) out.push(k + ' is not a whole number above 0'); };
  if (!rules || typeof rules !== 'object') return ['the rules are no row'];
  if (typeof rules.hunt !== 'string' || !/^[a-z0-9_]{1,64}$/.test(rules.hunt)) out.push('hunt is not an id');
  for (const k of ['roomSize', 'landingEvery', 'floorLimitMs', 'landingLimitMs', 'stairMs', 'minLevel']) pos(k);
  if (Number.isInteger(rules.roomSize) && (rules.roomSize < 2 || rules.roomSize > 8)) out.push('roomSize is not 2..8 (a landing is a Keeper and at least one more, and a full box is 8)');
  if (Number.isInteger(rules.minLevel) && rules.minLevel > 999) out.push('minLevel is over 999 (no hero could ever enter)');
  if (Number.isInteger(rules.stairMs) && Number.isInteger(swingMs) && rules.stairMs < 2 * swingMs) out.push('stairMs is under two engine swings, so a floor\'s rows could change inside the swing it was cleared in');
  if (Number.isInteger(rules.floorLimitMs) && Number.isInteger(rules.landingLimitMs) && rules.landingLimitMs < rules.floorLimitMs) out.push('a landing gets less time than a floor');
  if (!['both', 'party'].includes(rules.fit)) out.push('fit is not both or party');
  const st = rules.steps;
  if (!st || typeof st !== 'object') out.push('steps is no row');
  else {
    /* a Level a floor at least a tenth and at most ten; a depth a floor 0 (a Level line alone) to ten steps */
    if (!Number.isInteger(st.levelPm) || st.levelPm < 100 || st.levelPm > 10000) out.push('steps.levelPm is not a whole permille 100..10000');
    if (!Number.isInteger(st.depthPm) || st.depthPm < 0 || st.depthPm > 10000) out.push('steps.depthPm is not a whole permille 0..10000');
  }
  const p = rules.pay;
  if (!p || typeof p !== 'object') out.push('pay is no row');
  else {
    if (!Number.isInteger(p.payPm) || p.payPm < 1 || p.payPm > 1000) out.push('pay.payPm is not a whole permille 1..1000 (a Tower kill never out-pays the scale\'s ceiling)');
    /* never under the scale's reference rate: hr_danger_level_xp_max (PAY.refKillsHead at the gap ceiling) then bounds every Tower kill */
    if (!Number.isInteger(p.refKillsHead) || p.refKillsHead < PAY.refKillsHead) out.push('pay.refKillsHead is not a whole number of at least PAY.refKillsHead (' + PAY.refKillsHead + ')');
  }
  if (rules.mixes !== null && rules.mixes !== undefined) {
    if (!Array.isArray(rules.mixes) || !rules.mixes.length) out.push('mixes is not null or a list');
    else {
      const ids = new Set();
      for (const m of rules.mixes) {
        if (!m || !/^[a-z][a-z0-9_]{0,31}$/.test(String(m.id)) || ids.has(m.id)) { out.push('a mix has no id of its own'); continue; }
        ids.add(m.id);
        if (typeof m.name !== 'string' || !m.name.trim()) out.push(m.id + ': no name');
        if (typeof m.reach !== 'string' || typeof m.role !== 'string') out.push(m.id + ': no reach or role');
        /* a landing holds its Keeper and at least one more of the mix */
        if (!Number.isInteger(m.size) || m.size < 2 || m.size > 8) out.push(m.id + ': size is not 2..8');
      }
    }
  }
  return out;
}

/* ── THE UNMARKED CATACOMBS' DESCENT (Tyler 2026-11-16; the board's "2026-11-16 The Unmarked Catacombs descent" §2, lane/c-catacombs) ──────
   The Burning Tower turned upside down, on the Tower's own engine: same rooms, same stair, same clocks, same free deaths. What a descent adds is
   one row per WING, picked before Enter (a party's leader picks for the party). The numbers are the Tower's so the two read the same: its
   rooms' Level, depth and pay are the Tower's formulas (one bound table serves both). 12-targets.md section 7 turns the wings into hunting
   grounds on the scale (wave 2); until then they keep their own rosters (no mixes).
   CATACOMB_RULES  the room, door and clock numbers every wing plays (a vault door is the Tower's landing: every 10th room). minLevel: the
                   Tower's door Level (Tyler 2026-11-18, 2027-05-05-entry-gates.sql's evidence). ASSUMED for the descent; one row to move.
   CATACOMB_WINGS  wing     the id the door's verb is called with (hr_catacomb_start p_wing) and the key rows name
                   hunt     the wing's hunt and ground id (`unmarked_` sorts after the Mill Cellar, as the Tower's `the_` does)
                   name     what the player reads
                   keeper   the vault door's Keeper: a FIXED monster (Keeper Dunn, every door), at the `keeper` boss kind (src/data/bosses.js)
                   roster   the monsters a room is picked from, by weight (an id named twice as often stands about twice as often), at the
                            roles their own pack's roster gives them (`rosterGround`, balance-sheet.js GROUND_ROSTER)
   RUN_GROUNDS     every ground a run door opens, the Tower's included: the one table the engine (src/core/hunt/tower.js runRulesOf) and the
                   server (hr_tower_rules, one row each, tools/gen-tower.mjs) read. `family` is the key family its doors mint (src/data/chests.js
                   KEY_FAMILIES), `board` the board its runs rank on and `boardParty` the one a party's runs rank on (null: the same board).
                   `floorTop` (towerTopOf) and `roomMin` (the fewest monsters any of its rooms holds: the server's kill proof) are derived. */
export const CATACOMB_RULES = Object.freeze({
  roomSize: 5,
  landingEvery: 10,
  floorLimitMs: 180000,
  landingLimitMs: 600000,
  stairMs: 4000,
  fit: 'both',
  minLevel: 10,
  steps: TOWER_RULES.steps,
  pay: TOWER_RULES.pay,
});

export const CATACOMB_WINGS = Object.freeze([
  /* the Flooded Vault's room: Leeches in the dark water, the Night Carters who sold the dead, the Paupers. A blade for the Leeches, arrows for
     the Carters, and the Carters' Lime Sack is poison */
  Object.freeze({ wing: 'flooded', hunt: 'unmarked_flooded_wing', name: 'Flooded Wing', keeper: 'keeper_dunn', rosterGround: 'unmarked_catacombs',
    roster: Object.freeze({ vault_leech: 2, night_carter: 2, shrouded_pauper: 2 }) }),
  /* the Bone Room: the ossuary's walls get up, the Paupers walk, a Night Carter now and then. A hammer, an ice slot, a tank for Bone Slide */
  Object.freeze({ wing: 'bone', hunt: 'unmarked_bone_wing', name: 'Bone Wing', keeper: 'keeper_dunn', rosterGround: 'unmarked_catacombs',
    roster: Object.freeze({ bone_wall: 2, shrouded_pauper: 2, night_carter: 1 }) }),
]);

const runRow = (rules, extra) => {
  const row = { ...rules, ...extra };
  row.floorTop = towerTopOf(row);
  row.roomMin = row.mixes ? Math.min(...row.mixes.map((m) => m.size)) : row.roomSize;
  return Object.freeze(row);
};
export const RUN_GROUNDS = Object.freeze({
  [TOWER_RULES.hunt]: runRow(TOWER_RULES, { family: 'tower', wing: null, name: 'The Burning Tower', keeper: null, roster: null, rosterGround: null,
    board: 'tower', boardParty: null, mixes: TOWER_MIXES }),
  ...Object.fromEntries(CATACOMB_WINGS.map((w) => [w.hunt, runRow(CATACOMB_RULES, { hunt: w.hunt, family: 'catacomb', wing: w.wing, name: w.name,
    keeper: w.keeper, roster: w.roster, rosterGround: w.rosterGround, board: 'catacomb', boardParty: 'catacomb_party', mixes: null })])),
});

/** The run row of hunt `id` (the Tower or a Catacomb wing), or null for every other hunt. Pure. */
export function runRulesOf(id) {
  return typeof id === 'string' && Object.hasOwn(RUN_GROUNDS, id) ? RUN_GROUNDS[id] : null;
}

/** Every problem with the run table (beyond each row's own validateTower), as strings (empty: valid). Pure. */
export function validateRunGrounds(runs = RUN_GROUNDS, wings = CATACOMB_WINGS) {
  const out = [];
  const ID = /^[a-z][a-z0-9_]{0,31}$/;
  const wingIds = new Set();
  for (const [key, r] of Object.entries(runs || {})) {
    if (!r || r.hunt !== key) { out.push(key + ': its hunt is not its key'); continue; }
    if (!ID.test(String(r.family))) out.push(key + ': family is not an id');
    if (!ID.test(String(r.board)) || (r.boardParty !== null && (!ID.test(String(r.boardParty)) || r.boardParty === r.board))) {
      out.push(key + ': board and boardParty are not two ids (or boardParty null)'); }
    if (typeof r.name !== 'string' || !r.name.trim()) out.push(key + ': no name');
    if (r.wing !== null) {
      if (!ID.test(String(r.wing)) || wingIds.has(r.wing)) out.push(key + ': wing is not an id, or another row has it');
      wingIds.add(r.wing);
    }
    /* a run ground is either the Tower's kind (rooms from the open grounds' ladder at its mixes, a Keeper picked from them) or a wing's (its
       own roster and a fixed Keeper): never half of each */
    if ((r.roster === null) !== (r.keeper === null) || (r.roster === null) !== (r.rosterGround === null)) out.push(key + ': roster, rosterGround and keeper are not all set or all null');
    if ((r.roster === null) === (r.mixes === null)) out.push(key + ': a run has mixes (the Tower\'s kind) or a roster (a wing\'s), one of the two');
    if (r.roster !== null) {
      const ids = Object.keys(r.roster || {});
      if (ids.length < 2) out.push(key + ': a roster of fewer than two kinds');
      for (const id of ids) if (!ID.test(id) || !Number.isInteger(r.roster[id]) || r.roster[id] < 1 || r.roster[id] > 9) out.push(key + ': ' + id + ' has no weight 1..9');
      if (ids.includes(r.keeper)) out.push(key + ': its Keeper stands in its rooms too');
    }
    if (!Number.isInteger(r.floorTop) || r.floorTop < r.landingEvery || r.floorTop % r.landingEvery) out.push(key + ': floorTop is not a landing');
  }
  for (const w of wings || []) if (!runs[w.hunt] || runs[w.hunt].wing !== w.wing) out.push('wing ' + w.wing + ' has no run row');
  return out;
}

/* The stair against the swing is checked where the swing is known (src/core/hunt/tower.js, at load, with COMBAT_BALANCE.tickMs). */
const PROBLEMS = validateRunGrounds().concat(...Object.values(RUN_GROUNDS).map((r) => validateTower(r).map((p) => r.hunt + ': ' + p)));
if (PROBLEMS.length) throw new Error('src/data/tower.js does not load: ' + PROBLEMS.join('; '));
