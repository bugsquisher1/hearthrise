// ============================================================================
// src/data/gear-curve.js — THE GEAR CURVE: what a piece of gear carries at any Level, the bands past tier 7, and the exchange rates a
// unique spends its budget at (balance program 44 steps R10 and R11; docs/design/overhaul/03-items-and-crafting.md section 2.2; build plan
// FB-8 stage 1). The knobs `gearSlope`, `gearBandStep` and `gearExchange` (tools/balance-program/formulas/knobs.json) are these lines.
//
// A LINE OF GEAR is one row: its SAMPLES, the numbers its plain piece carries at each tier's Level (`levels`, ascending), and which number
// a unique pays out of (`pay`) and which it may buy more of (`acc`). A weapon family is a line (src/data/gear-tiers.js WEAPON_LINES); the
// armor half adds its slots and weights as more lines of the same shape, with no new code.
//
// UNDER THE ANCHOR the curve IS its samples: a hero of Level L wears the tier at or under L. FROM THE ANCHOR (Level 110, Carter's Rest's
// floor, where the last sample, Dawnsteel, is the line) it goes on straight in the Level a piece is worn at: the last sample's numbers
// x (1 + slope x (Level - anchor) / anchor), so Dawnsteel x Level / 110 at the default slope (Tyler 2026-11-16, "about x Level / 110",
// no tier 8). Straight because monster health and hero health are straight in Level, and gear on any other shape drifts against both
// (44 section 5.2). Past the anchor a STANDARD upgrade is a BAND, one fixed step of the line and never a count of Levels: at +17% the
// bands open at 110, 129, 151, 176, 206, 241, 282, 330, 386 and on for as long as Levels do (GR-4; +17% MEASURED for weapons, chapter 12
// section 3.6: a step reads 4.4% at Level 185 and 7.3% at 400 against the ruled 5 to 8%). A UNIQUE is worn from its own Level and spends
// the line's budget there at the exchange rates (R11), so its numbers are arithmetic and never a hand fit.
//
// THE SAMPLES ARE NOT RE-CUT ONTO THE LINE. Chapter 03 calls the seven tiers samples of Dawnsteel x Level / 110 at Levels 1 to 88; read
// literally that puts Dawnsteel at 0.8 of its own numbers at 88, where the same chapter makes it the line at 110. The seven keep the
// numbers they were measured and tuned at, as the curve under its anchor (.claude/coordination/CONFLICTS.md, 2026-11-21: the designer's
// call).
//
// PURE ESM. Data and arithmetic only. Imports nothing, so the client, the edge and every tool read this one copy.
// ============================================================================

/* THE CURVE'S THREE NUMBERS. `anchor`: the Level the last sample is the line at. `slope`: how fast the line climbs past it (1 = in step with
   Level). `bandStep`: how far apart standard upgrades sit past it, as a multiple of the line. One number a line, so a knob moves it. */
export const GEAR_CURVE = Object.freeze({
  anchor: 110,
  slope: 1,
  bandStep: 1.17,
});

/** The line's multiple of its last sample at Level `level`: 1 up to the anchor, then straight in Level (Level / anchor at slope 1). */
export function curveScale(level, C = GEAR_CURVE) {
  const L = Number(level);
  return L > C.anchor ? (C.anchor + C.slope * (L - C.anchor)) / C.anchor : 1;
}

/** The Level band `k` opens at (k = 0 is the anchor). No last band: the step goes on for as long as Levels do. */
export function bandLevel(k, C = GEAR_CURVE) {
  return Math.round(C.anchor * C.bandStep ** k);
}

/** The band at or under Level `level`, `back` bands under that; null under the anchor (or stepping back past it). */
export function bandAt(level, back = 0, C = GEAR_CURVE) {
  const L = Number(level);
  if (!(C.bandStep > 1)) throw new Error('gear-curve: a band step of ' + C.bandStep + ' never climbs');
  if (!(L >= C.anchor)) return null;
  let k = Math.floor(Math.log(L / C.anchor) / Math.log(C.bandStep) + 1e-9);
  while (k > 0 && bandLevel(k, C) > L) k--;
  while (bandLevel(k + 1, C) <= L) k++;
  return k - back < 0 ? null : bandLevel(k - back, C);
}

/* THE EXCHANGE RATES (R11). A unique pays for what it carries out of one number of its line (a weapon: its damage), at these rates.
   Each is the SHARE OF A BLOW one unit is worth: the most it is worth for any weapon family at any Level from the anchor up, on the weapon
   line's measure (tools/balance-sim/weapon-power.mjs: the engine's own rolls over every late ground, pace and safety; MEASURED 2026-11-21,
   lane/c-pace). The blow share is turned into the damage number by the share of a blow that number makes at the piece's Level, which is
   the engine's to say (the blow is skill plus gear), so the caller passes it.
     crit       a unit of critical chance (1 = every blow): a critical blow is half again (src/core/combat.js COMBAT_BALANCE.critMult 1.5).
                Measured 0.493 to 0.499 for every family at Levels 112 to 500.
     accuracy   a unit share of the line's accuracy number at the anchor; past it the rate falls as anchor / Level (measured 0.041 x 110 /
                Level at every Level from 112 to 300; the late monsters' aim is written against a reference hero that holds the Level 110
                kit, src/data/to-hit.js REF_HERO, so the line's growing accuracy finds them nearer the rail). Re-derive when the
                reference hero reads this curve. Accuracy a unique gives up buys nothing back.
     bane       a unit of a bane's multiple over 1, by class: the thickest share that class makes of a late ground's kill health, pace or
                safety weighted, at Levels 110 to 300 (Carter's Rest and the Roost are one class each). `baneElse`: a class no late
                ground holds yet pays its bane in full, so a new ground can never put an old bane over the line.
   tests/weapon-line.mjs WL11 holds every rate against the content and the measure; a red means re-derive that one rate. */
export const GEAR_EXCHANGE = Object.freeze({
  weapon: Object.freeze({
    crit: 0.5,
    accuracy: 0.045,
    bane: Object.freeze({ humanoid: 1, dragon: 1, undead: 0.69, human: 0.36, construct: 0.25, vermin: 0.14 }),
    baneElse: 1,
  }),
});

/* What a unique buys with its budget, priced: the share of a blow its bill comes to. */
function billOf(buy, level, X, C) {
  const acc = Math.max(0, Number(buy.accuracy) || 0) * X.accuracy * C.anchor / Math.max(C.anchor, Number(level));
  const crit = (Number(buy.crit) || 0) * X.crit;
  const b = buy.bane;
  const bane = b ? Math.max(0, Number(b.mult) - 1) * (Object.prototype.hasOwnProperty.call(X.bane, b.class) ? X.bane[b.class] : X.baneElse) : 0;
  return acc + crit + bane;
}

/**
 * The line's numbers at exactly Level `level`: under the anchor the sample at or under it, from the anchor its last sample on the line.
 * With `buy` they are a unique's, the budget spent at the exchange rates: { accuracy (a share of the line's accuracy, more or less), crit
 * (a chance), bane ({ class, mult }), share (the share of a blow the line's paid number makes at `level`: the engine's) }. Its accuracy is
 * the line's times 1 + accuracy, rounded; its paid number what the bill leaves, rounded DOWN so a unique never reads over its line; and
 * the bought fields ride along (`critB`, `bane`). Null under the first sample.
 */
export function lineAt(line, level, buy = null, X = GEAR_EXCHANGE.weapon, C = GEAR_CURVE) {
  const L = Number(level);
  let i = -1;
  for (let k = 0; k < line.levels.length; k++) if (line.levels[k] <= L) i = k;
  if (i < 0) return null;
  const last = line.levels.length - 1;
  const scale = L >= C.anchor ? curveScale(L, C) : 1;
  const nums = {};
  for (const [f, samples] of Object.entries(line.fields)) nums[f] = L >= C.anchor ? Math.round(samples[last] * scale) : samples[i];
  if (!buy) return nums;
  const bill = billOf(buy, L, X, C), share = Number(buy.share);
  if (bill > 0 && !(share > 0)) throw new Error('gear-curve: a unique on ' + line.key + ' buys something but names no blow share to pay with');
  const pay = nums[line.pay] * (1 - (bill > 0 ? bill / share : 0));
  if (!(pay >= 1)) throw new Error('gear-curve: a unique on ' + line.key + ' at Level ' + L + ' buys more than its line holds');
  nums[line.pay] = Math.floor(pay + 1e-9);
  if (line.acc) nums[line.acc] = Math.round(nums[line.acc] * (1 + (Number(buy.accuracy) || 0)));
  if (buy.crit) nums.critB = buy.crit;
  if (buy.bane) nums.bane = { class: buy.bane.class, mult: buy.bane.mult };
  return nums;
}

/** The standard piece a hero of Level `level` wears on `line`: under the anchor the tier at or under it, from the anchor the band's. */
export function curveAt(line, level, C = GEAR_CURVE) {
  const band = bandAt(level, 0, C);
  return lineAt(line, band === null ? level : band, null, GEAR_EXCHANGE.weapon, C);
}
