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
// The authored hours are the REFERENCE COMPANY's, so the multiplier is read against its own depth, where it holds (src/core/bands.js
// refHeldOf; on a formula ground refStep is the pay's anchor and the company holds over it): the reference company finds a Rare every
// 40 h; at depth 1 about half as often, at depth 20 about 1.5x as often (Muster, its reference at depth 10: 78 h / 40 h / 26 h).
// THE TOP RANK (21 D-4): depth opens ranks (gear-steps.js rankDepths), the flame's luck lifts how often the top open rank lands:
//   topRankPm x (1 + luck), at most topRankMaxPm, else one rank below
// THE TRAIT CELL (24 G8; the designer's GEAR_STEPS.traitRoll, lane/band-floor): the roller rolls the SLOT first, among the Trait slots the
// ground DROPS a piece of and holds a Trait for (its rollable cells), then a Trait of that ground and slot, so a new Trait dilutes only its
// own cell. A Rare's hours are the ground's whatever its cells: every Rare is a Trait piece, none is lost to an empty cell.
// A MADE PIECE (capes and jewelry are bench-made, never dropped: the 14 Traits on those slots roll here; the designer's call, made in this
// lane at the band-floor lane's ask). A cape or a jewel made with a ground's PART (`made.part`: the field on the part one of its bodies drops,
// imbuements.js's one-a-body rule) rolls a Trait from that ground's (ground, slot) cell with the same roller and the same hours: each make is
// worth the hunted hours its part took to find, so a make rolls Rare at partHours / 40 and Very Rare at partHours / 400 (never pity: a bench
// press is not a kill; never depth: a part carries none, so its odds and its rank roll as at the ground's reference step, the flame's luck
// read as on a drop). One Trait piece per 40 hunted hours of parts, made or found: the market sees the same Trait supply either way.
//
// PITY (04 guard 5, 21 section 4.2, gear-steps.js GEAR_STEPS.pity; THE ONE PITY, designer, lane/designer-pity, 2026-11-26, 12-targets 8.6):
// a hero's chance rises with the finds it was owed and missed, reset on a hit, so the long-run rate is the stated one and the unlucky tail
// is short. Personal loot's (src/core/personal-loot.js, src/data/party.js PERSONAL_LOOT): p0 = p x basePm / 1000, x the sum of p0 over
// the misses since the last find, chance p0 x (1 + growPm / 1000 x x) (mean rolls to a hit 1 / p, p90 1.94 x the mean, p10 0.20 x).
// Counted in finds, not kills, so a miss in a party of four, at depth 1 or on a slow ground weighs what it was worth.
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
  /* A MADE PIECE'S ROLL (the header): the Trait slots the bench makes, and what names a made piece's ground (its part's home) */
  made: Object.freeze({ slots: Object.freeze(['cape', 'necklace', 'ring', 'earrings']), part: 'part' }),
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
