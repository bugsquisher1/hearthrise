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
//   heat            past `from`, a floor's blows x(1 + perFloorPm/1000) a floor, compounding; HP, XP and the server's bounds stay the
//                   formula's (designer 2026-11-19, the board's "2026-11-19 The Tower's curve": the straight-line formula made floors 100-170
//                   feel the same, then walled). Move `from` up when a region past 110 opens
//                   10 -> 12 permille (lane/c-tohit-ratio, 2026-11-20): on the to-hit ratio a deep room's aim no longer climbs with its blow, so
//                   at 10 the played four's typical low fell only 12 points from floors 101-110 to 131-140 (tests/tower-climb.mjs TC-CURVE wants 15);
//                   plan L18 takes the heat out and sizes the curve on this engine
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
  heat: Object.freeze({ from: 100, perFloorPm: 12 }),
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
  if (!['both', 'party'].includes(rules.fit)) out.push('fit is not both or party');
  /* the heat: a landing under the top, and a step a floor a blow can carry to the top */
  const h = rules.heat;
  if (!h || typeof h !== 'object') out.push('heat is no row');
  else {
    if (!Number.isInteger(h.from) || h.from < 0 || (Number.isInteger(rules.landingEvery) && h.from % rules.landingEvery) || (Number.isInteger(rules.floorTop) && h.from >= rules.floorTop)) {
      out.push('heat.from is not a landing under the top (or 0)'); }
    if (!Number.isInteger(h.perFloorPm) || h.perFloorPm < 0 || h.perFloorPm > 50) out.push('heat.perFloorPm is not a whole permille 0..50');
  }
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

/* ── THE UNMARKED CATACOMBS' DESCENT (Tyler 2026-11-16; the board's "2026-11-16 The Unmarked Catacombs descent" §2, lane/c-catacombs) ──────
   The Burning Tower turned upside down, on the Tower's own engine: same rooms, same stair, same clocks, same free deaths. What a descent adds is
   one row per WING, picked before Enter (a party's leader picks for the party). The numbers are the Tower's so the two read the same.
   CATACOMB_RULES  the room, door and clock numbers every wing plays (a vault door is the Tower's landing: every 10th room). minLevel: the
                   Tower's door Level (Tyler 2026-11-18, 2027-05-05-entry-gates.sql's evidence: the same engine and the same formula, so a
                   Level 4 hero would out-earn hunting here exactly as it did on the Tower). ASSUMED for the descent: Tyler ruled the descent
                   "a second door at any Level" against the 165-185 ground's band, before the Tower's door got its Level; one row to move.
   CATACOMB_WINGS  wing     the id the door's verb is called with (hr_catacomb_start p_wing) and the key rows name
                   hunt     the wing's hunt and ground id (`unmarked_` sorts after the Mill Cellar, as the Tower's `the_` does)
                   name     what the player reads
                   keeper   the vault door's Keeper: a FIXED monster (Keeper Dunn, every door), at the formula's boss role
                   roster   the monsters a room is picked from, by weight (an id named twice as often stands about twice as often), at the
                            roles their own pack's roster gives them (`rosterGround`, balance-sheet.js GROUND_ROSTER)
   RUN_GROUNDS     every ground a run door opens, the Tower's included: the one table the engine (src/core/hunt/tower.js runRulesOf) and the
                   server (hr_tower_rules, one row each, tools/gen-tower.mjs) read. `family` is the key family its doors mint (src/data/chests.js
                   KEY_FAMILIES), `board` the board its runs rank on and `boardParty` the one a party's runs rank on (null: the same board). The
                   Tower's board id is its mode's ('tower', 2027-04-30-tower-board.sql's rows), the Catacombs' "Catacombs, Deepest" is one board
                   for both wings, alone and in a party (Tyler 2026-11-16: "its own" leaderboard). */
export const CATACOMB_RULES = Object.freeze({
  roomSize: 5,
  landingEvery: 10,
  floorLimitMs: 180000,
  landingLimitMs: 600000,
  stairMs: 4000,
  floorTop: 300,
  fit: 'both',
  minLevel: 10,
  heat: TOWER_RULES.heat,
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

const runRow = (rules, extra) => Object.freeze({ ...rules, ...extra });
export const RUN_GROUNDS = Object.freeze({
  [TOWER_RULES.hunt]: runRow(TOWER_RULES, { family: 'tower', wing: null, name: 'The Burning Tower', keeper: null, roster: null, rosterGround: null,
    board: 'tower', boardParty: null }),
  ...Object.fromEntries(CATACOMB_WINGS.map((w) => [w.hunt, runRow(CATACOMB_RULES, { hunt: w.hunt, family: 'catacomb', wing: w.wing, name: w.name,
    keeper: w.keeper, roster: w.roster, rosterGround: w.rosterGround, board: 'catacomb', boardParty: 'catacomb_party' })])),
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
    /* a run ground is either the Tower's kind (rooms from the open grounds' ladder, a Keeper picked from them) or a wing's (its own roster
       and a fixed Keeper): never half of each */
    if ((r.roster === null) !== (r.keeper === null) || (r.roster === null) !== (r.rosterGround === null)) out.push(key + ': roster, rosterGround and keeper are not all set or all null');
    if (r.roster !== null) {
      const ids = Object.keys(r.roster || {});
      if (ids.length < 2) out.push(key + ': a roster of fewer than two kinds');
      for (const id of ids) if (!ID.test(id) || !Number.isInteger(r.roster[id]) || r.roster[id] < 1 || r.roster[id] > 9) out.push(key + ': ' + id + ' has no weight 1..9');
      if (ids.includes(r.keeper)) out.push(key + ': its Keeper stands in its rooms too');
    }
  }
  for (const w of wings || []) if (!runs[w.hunt] || runs[w.hunt].wing !== w.wing) out.push('wing ' + w.wing + ' has no run row');
  return out;
}

/* The stair against the swing is checked where the swing is known (src/core/hunt/tower.js, at load, with COMBAT_BALANCE.tickMs). */
const PROBLEMS = validateTower(TOWER_RULES, TOWER_PARTY_XP).concat(validateRunGrounds(),
  ...Object.values(RUN_GROUNDS).map((r) => validateTower(r, TOWER_PARTY_XP).map((p) => r.hunt + ': ' + p)));
if (PROBLEMS.length) throw new Error('src/data/tower.js does not load: ' + PROBLEMS.join('; '));
