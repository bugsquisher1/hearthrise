// ════════════════════════════════════════════════════════════════════════
// src/data/training.js — COMBAT TRAINING: THE YARD BY THE HOUR, THE HOUSE DUMMY BOUGHT ONCE (data; the source of truth).
//
// Tyler 2026-11-08: "a public yard paid by the hour", "a personal training dummy for houses ... multiple unlocks for each combat
// skill ... the long term benefit is that you don't have to pay per hour at the public training grounds". Tyler 2026-10-14: skill
// XP only, costs gold. The designer's numbers: PRIORITY_BOARD "2026-11-13 Combat training spec". Every number below is a row Tyler
// or the designer can move; the server reads them as hr_training_rules / hr_training_grounds (tools/gen-hunt-sessions.mjs, whose
// --check fails a stale copy).
//
// ONE ENGINE (CLAUDE.md §6). A training session IS a hunt session on a one-pocket ground (hunt-grounds.js TRAINING_GROUNDS, one per
// place and skill), settled by src/core/combat-sim.js like any hunt, viewed or not. Its one foe is the `dummy` monster row
// (monsters.js yard_dummy): it never falls (src/core/hunt/damage.js hurt), never walks, and its blow never takes a hero under
// hpFloorPm of its max HP. src/core/hunt/training.js is the yard's one door for pay: the trained skill only, at that skill's xpPermille of what
// the same blow, cast or hit taken teaches in a hunt (Melee and Ranged on HP removed, Magic on mana, Defense on blows aimed at an
// armoured hero, read at the hero's own Level: the dummy keeps pace with whoever trains on it). NO Level XP, coin, drop, kill,
// Bestiary or task credit. No stamina is spent: the pool rests while the hero trains (the settle proposes none; hr_stamina_of).
//
// THE MONEY (2027-04-16-combat-training.sql). The yard charges at the START of each hour, from the account purse, on the server
// clock: hr_training_start pays the first hour (re-quoted, `quote_changed` if the price the player saw moved), and the settle that
// lands on each later hour's first instant pays that hour or ends the session `gold_out` there, nothing owed. An hour's fee is
// feeBase + feePerLevel x the trained skill's level at that instant. A session ends `hours` after maxHours. The house dummy charges
// nothing per hour: its price is a one-time unlock per skill on src/data/gold-sinks.js `house_dummy` (the account's ladder), it
// needs the account's home at `houseTier` or better, and one hero of the account trains on it at a time.
//
// PURE ESM DATA. No imports, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/** The skills a hero can train, in the order the Training panel lists them. */
export const TRAINING_SKILLS = Object.freeze(['melee', 'ranged', 'magic', 'defense']);

export const TRAINING_RULES = Object.freeze({
  /* The trained skill's XP is this share (permille) of what the same blow, cast or hit taken teaches on a hunting ground, one dial a
     skill. The gate: a yard hour never pays more than 0.40x the same hero's best fitting hunt in that skill an hour
     (tests/combat-training-pace.mjs, the real settle at skill 10, 30 and 56). */
  xpPermille: Object.freeze({ melee: 215, ranged: 245, magic: 340, defense: 215 }),
  /* A dummy's blow never takes a hero under this share (permille) of its max HP: nobody dies in the yard. */
  hpFloorPm: 500,
  /* The yard's fee for one hour: feeBase + feePerLevel x the trained skill's level at the hour's first instant. */
  feeBase: 50,
  feePerLevel: 6,
  /* The longest one session runs; it ends `hours` there. */
  maxHours: 12,
  hourMs: 3600000,
  /* The house dummy wants the account's home at this property tier or better (src/data/homestead-tiers.js PROPERTY_TIERS id). */
  houseTier: 'homestead',
});

/* THE PLACES. `fee`: whether an hour is charged (the yard); the house dummy is paid for once, per skill (gold-sinks.js house_dummy). */
export const TRAINING_PLACES = Object.freeze({
  yard: Object.freeze({ fee: true }),
  house: Object.freeze({ fee: false }),
});

/** The hunt (and ground) id of training `skill` at `place`: one per pair, so the engine reads the skill off the ground it settles.
    (`training_` first: a probe that picks the lowest ground by Level floor, then by id, still finds the Mill Cellar.) */
export const trainingHuntId = (place, skill) => 'training_' + place + '_' + skill;

/** Every training hunt id, place by place, skill by skill. */
export const TRAINING_HUNT_IDS = Object.freeze(Object.keys(TRAINING_PLACES).flatMap((p) => TRAINING_SKILLS.map((s) => trainingHuntId(p, s))));

/** What training hunt `huntId` trains, { place, skill }, or null for any other hunt. */
export function trainingOf(huntId) {
  for (const place of Object.keys(TRAINING_PLACES)) {
    for (const skill of TRAINING_SKILLS) if (trainingHuntId(place, skill) === huntId) return { place, skill };
  }
  return null;
}

/** The yard's fee for one hour at trained-skill level `level` (the server's hr_training_fee, the same rule). */
export function trainingFee(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return TRAINING_RULES.feeBase + TRAINING_RULES.feePerLevel * lv;
}
