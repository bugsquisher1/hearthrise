// ════════════════════════════════════════════════════════════════════════
// src/data/drop-hours.js — DROPS AUTHORED IN HUNTED HOURS, AND THE RARITY LADDER (systems, lane/drop-formula, 2026-11-22).
//
// docs/design/redesign/04-math-strategy.md sections 10 and 11, 21-flame-temper-imbue-loot.md section 4, 24-content-pipeline.md G8 and G10,
// 12-targets.md sections 3.3 and 8.1, 27-formula-overhaul.md R-1.
//
// ONE MEANING FOR A DROP RATE: "one in about N hunted hours, for a hero of the reference party at the ground's reference step". A row says
// `everyHours: N`; its per-kill chance is never typed, it is DERIVED from the ground's reference kill rate (danger.js DANGER_GROUNDS
// refKillsHead, kills a head an hour at refStep):
//   ch = 1 / (everyHours x refKillsHead x share)        share = the monster's part of the ground's kills at refStep (1 for a ground row)
// so a re-measured kill rate keeps every drop's hours: `node tools/gen-drop-hours.mjs --write` re-derives every `ch`, and
// tests/drop-formula.mjs goes red on a `ch` its hours no longer give. Personal loot (21 section 4) rolls each hero at ch / n (n the heroes
// at the kill), so a party never drops more than its heroes apart and the hours hold at every party size.
// A row that drops on EVERY kill (`ch: 1`, a body's own bones) is a certainty, not a rate, and stays per kill.
// Off the Danger scale a ground has no reference kill rate and its rows keep their typed `ch` until R10 puts it on the scale (the same
// command converts it then: `--convert <ground>`).
//
// THE RARITY LADDER (02 package 2: Plain, Rare, Very Rare, Signature), each in hunted hours a hero at the reference:
//   plain       a base piece of the ground's tier, no Trait: the Scarce band (loot-bands.js BAND_TARGETS.scarce), about one an hour a slot a weight
//   rare        a piece with ONE Trait, ANY slot, rolled by the ground (not by a monster row): 09-crafting 5.6 and 13-market 3.2's one in 40
//   very_rare   TWO Traits (the pair rule, 12-targets 8.1): 13-market 3.2's one in 400
//   signature   ONE given Signature on its home, 15-signature-candidates: 30 to 60. Not built: the ladder holds its hours for the content lane
//               (24 section 3.5) and nothing rolls one. The flame never reads it (21 D-5) and neither does depth
// `band` is each rung's [min, max]: the Lab tunes inside it, a value outside is red (tests/drop-formula.mjs DF-3).
//
// DEPTH RAISES THE RARE ODDS (12-targets 3.3): x1 at depth 1 to x3 at depth 20 (DEPTHS), straight in permille, Rare and Very Rare only.
// The authored hours are the REFERENCE STEP's, so the multiplier is read against the reference's own depth: a company at refStep finds a
// Rare every 40 h; at depth 1 about half as often, at depth 20 about 1.5x as often (Muster: 78 h / 40 h / 26 h).
// THE TOP RANK (21 D-4): depth opens ranks (gear-steps.js rankDepths), the flame's luck lifts how often the top open rank lands:
//   topRankPm x (1 + luck), at most topRankMaxPm, else one rank below
// THE TRAIT CELL (24 G8): the roller rolls the SLOT first, then a Trait of that ground and slot, so a new Trait dilutes only its own cell;
// `cellMax` Traits a (ground, slot) cell at most, so no chase slows by more than half. Warned while Traits are dark, red once they roll.
//
// PITY (04 guard 5, 21 section 4.2, gear-steps.js GEAR_STEPS.pity): a hero's chance rises with every kill it rolled and missed, reset on a
// hit, so the long-run rate is the stated one and the unlucky tail is short. Linear, solved for the mean (src/core/trait-roll.js pityChance):
//   chance after k misses = C x (k + 1),  C = pi / 2 x p^2     (mean kills to a hit = 1 / p, the tail a Rayleigh's: p90 = 1.71 x mean)
//
// STARTING VALUES, NOT RULINGS (the Lab tunes them; in band is enough). PURE ESM. Data only. Imports only loot-bands.js.
// ════════════════════════════════════════════════════════════════════════

import { BAND_TARGETS } from './loot-bands.js';

export const DROP_HOURS = Object.freeze({
  /* significant digits of a derived `ch` (whole rows round once, here: the catalogue and the browser read the same number) */
  chDigits: 3,
  rarity: Object.freeze({
    plain: Object.freeze({ band: BAND_TARGETS.scarce.hours }),
    rare: Object.freeze({ everyHours: 40, band: Object.freeze([30, 60]) }),
    very_rare: Object.freeze({ everyHours: 400, band: Object.freeze([300, 600]) }),
    signature: Object.freeze({ everyHours: 45, band: Object.freeze([30, 60]) }),
  }),
  /* the rarities the Trait roller rolls, rarest first (one draw each, a hit on the rarer ends the kill's roll) */
  rolls: Object.freeze(['very_rare', 'rare']),
  /* x1 at depth 1, x3 at depth 20 (12-targets 3.3), permille */
  depthPm: Object.freeze([1000, 3000]),
  topRankPm: 500,
  topRankMaxPm: 800,
  cellMax: 2,
});

/** THE FORMULA: the per-kill chance of a row authored `everyHours`, for a hero who sees `killsHeadHour` of its kills an hour (the ground's
    reference kills a head an hour times the row's share). Never over 1 (a certainty). Null for a row with no hours or no kills. */
export function chanceOf(everyHours, killsHeadHour) {
  const h = Number(everyHours), k = Number(killsHeadHour);
  if (!(h > 0) || !(k > 0)) return null;
  return Math.min(1, 1 / (h * k));
}

/** A chance held to DROP_HOURS.chDigits significant digits: the number a pack row carries. */
export function roundChance(ch) {
  if (!(ch > 0)) return 0;
  if (ch >= 1) return 1;
  return Number(ch.toPrecision(DROP_HOURS.chDigits));
}
