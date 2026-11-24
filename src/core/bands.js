// ============================================================
// src/core/bands.js — THE RATING, A GROUND'S BAND IN ABSOLUTE STEPS, AND "DEPTH N OF 20" (lane/foundations-block, 2026-11-23).
//
// src/data/bands.js says what an absolute step is and why the band is a formula; this is the arithmetic, in whole thousandths of a Level
// (permille, "Pm") so the browser, the edge and the Lab read the same number to the last digit:
//   skillLevelPm(skill, value)   the Level the reference career reaches skill `value` at (SKILL_LINE read backwards), thousandths
//   ratingPm({ levelPm, gearPm, skillLevelPm })
//                                04 section 1's rating: L + wGear x (gear - L) + wSkill x (skillLevel - L), thousandths, rounded once
//   bandAbs(groundId)            { floorPm, refPm, topPm }: the band's three companies as ratings (null off the scale, or a ground whose
//                                hunt has no Level band)
//   insideOneTier(groundId)      a ground whose Levels all sit inside its own gear tier: its companies wear its own kit (29 section 7.5)
//   (the band's top Level is its hunt's top, or the last Level its hunt still plays on an endsAtLevel ground: topLevelOf)
//   refHeldOf(groundId)          the own step the reference company HOLDS on the ground: the bridge's middle point (null off the scale)
//   absPmOf(groundId, step)      the absolute step (thousandths) of a ground's OWN step: straight between the bridge's three measured
//                                points (floorStep, refHeldOf, topStep at the band's three ratings), the end segments' slopes past them
//   depthAt(groundId, step)      "Depth N of 20" (1..DEPTHS): the band cut evenly in ABSOLUTE steps, half up; null off the scale
// One home for the depth: the browser's danger-sections.js depthOf and the edge's drop-rate.js depthOf both read depthAt.
//
// PURE ESM, dual-runtime. No DOM, no clock, no randomness. Integers and one division a reading.
// ============================================================

import { DANGER_GROUNDS, DEPTHS, POWER, GEAR_STEPS } from '../data/danger.js';
import { BAND_ABS, SKILL_LINE } from '../data/bands.js';
import { HUNT_INDEX } from '../data/hunts.js';
import { HUNT_GROUNDS } from '../data/hunt-grounds.js';

const own = (o, k) => typeof k === 'string' && !!o && Object.prototype.hasOwnProperty.call(o, k);
const rowOf = (groundId) => (own(DANGER_GROUNDS, groundId) ? DANGER_GROUNDS[groundId] : null);
/* a / b to the nearest whole, halves up (b > 0) */
const div = (a, b) => Math.floor((2 * a + b) / (2 * b));

/** The Level (thousandths) at which the reference career reaches `value` of `skill` ('melee', 'magic' or 'ranged'); null for another skill
    or a value that is not a number. Under the line's first point: its first Level; past the last: the last segment's slope. */
export function skillLevelPm(skill, value) {
  const L = own(SKILL_LINE, skill) ? SKILL_LINE[skill] : null;
  const v = Math.floor(Number(value));
  if (!L || !Number.isFinite(v)) return null;
  if (v <= L[0][1]) return 1000 * L[0][0];
  let k = 1;
  while (k < L.length - 1 && v > L[k][1]) k++;
  const [a, sa] = L[k - 1], [b, sb] = L[k];
  return 1000 * a + div(1000 * (v - sa) * (b - a), sb - sa);
}

/** 04 section 1's rating in thousandths of a Level: the Level, plus the gear part's gap to it at the one-sided gear weight, plus the skill
    Level's gap to it at the skill weight (src/data/danger.js POWER, the engine's power-step weights). A part left out sits on the Level. */
export function ratingPm({ levelPm, gearPm = levelPm, skillLevelPm: sk = levelPm }) {
  const gGap = gearPm - levelPm, sGap = sk - levelPm;
  const wG = gGap < 0 ? POWER.weightGearBelowPm : POWER.weightGearPm;
  return levelPm + div(gGap * wG + sGap * POWER.weightSkillPm, 1000);
}

/** THE BAND'S TOP LEVEL (lane/scale-early-grounds): its hunt's top, or, on a ground whose hunt ends at a Level (hunt-grounds.js endsAtLevel:
    the Mill Cellar's ends at 5), the last Level that hunt still plays, the band the Hunts window reads too (src/shell/hunt-list.js). Null with
    no Level band. */
function topLevelOf(groundId) {
  const h = HUNT_INDEX && HUNT_INDEX[groundId], gr = own(HUNT_GROUNDS, groundId) ? HUNT_GROUNDS[groundId] : null;
  const top = h && Array.isArray(h.band) ? h.band[1] : null;
  if (!Number.isInteger(top)) return null;
  return gr && Number.isInteger(gr.endsAtLevel) ? Math.min(top, gr.endsAtLevel - 1) : top;
}

/** The highest base item Level a hero of Level `L` can wear (src/data/gear-steps.js: a piece is worn from its item Level less wearAhead),
    on the tier grid. */
const wearableTierLevel = (L) => Math.floor((L + GEAR_STEPS.wearAhead) / GEAR_STEPS.tierSteps) * GEAR_STEPS.tierSteps;

/** A GROUND INSIDE ONE GEAR TIER (designer, 29-tuning-pass.md section 7.5, 2026-11-23): every Level of its band, entry to top, sits inside
    its own base tier's Levels (gearLevel to gearLevel + tierSteps), so "one tier back" or "ahead" means nothing there (tier 0 is the
    starting kit). Its band is cut from its Levels in its OWN tier's kit: the fresh company at the entry, the reference at refLevel and the
    strong company at the top Level, all in the ground's own drops (bandAbs here; tools/new-ground.mjs caps the cells' kits the same way).
    The Mill Cellar (1 to 4) and the Thicket (5 to 15) on tier 0. False off the scale or with no Level band. */
export function insideOneTier(groundId) {
  const g = rowOf(groundId), top = topLevelOf(groundId);
  if (!g || !Number.isInteger(g.entryLevel) || !Number.isInteger(top) || !Number.isInteger(g.gearLevel)) return false;
  return g.entryLevel >= g.gearLevel && top < g.gearLevel + GEAR_STEPS.tierSteps;
}

/** The band's three companies as absolute steps (thousandths): { floorPm, refPm, topPm }. Null off the scale or with no Level band. The strong
    company wears the tier ahead only when its top Level can wear it (src/data/bands.js: "worn from its item Level less wearAhead, so it is
    wearable by the top Level"), else the highest tier it can. A ground inside one gear tier (insideOneTier) reads both its fresh and its
    strong company in its own tier. */
export function bandAbs(groundId) {
  const g = rowOf(groundId), top = topLevelOf(groundId);
  if (!g || !Number.isInteger(g.entryLevel) || !Number.isInteger(g.refLevel) || !Number.isInteger(top) || !Number.isInteger(g.gearLevel)) return null;
  const T = GEAR_STEPS.tierSteps, own = insideOneTier(groundId);
  const at = (L, gear) => ratingPm({ levelPm: 1000 * L, gearPm: 1000 * gear });
  return {
    floorPm: at(g.entryLevel, own ? g.gearLevel : Math.max(0, g.gearLevel - T * BAND_ABS.freshTiersBack)),
    refPm: at(g.refLevel, g.gearLevel),
    topPm: at(top, own ? g.gearLevel : Math.max(g.gearLevel, Math.min(g.gearLevel + T * BAND_ABS.topTiersAhead, wearableTierLevel(top)))),
  };
}

/** The own step the reference company HOLDS on `groundId`, the bridge's middle point: the row's `refHeld` (a formula ground, whose
    refStep is the chosen anchor; src/data/danger.js says why), else its refStep (the band rule cuts it from that hold). Null off the scale. */
export function refHeldOf(groundId) {
  const g = rowOf(groundId);
  if (!g) return null;
  return g.refHeld === undefined ? g.refStep : g.refHeld;
}

/* THE BRIDGE'S POINTS of a ground: [own step, absolute thousandths] at its floor, reference hold and top, ordered (null when not ordered) */
const POINTS = new Map();
function pointsOf(groundId) {
  if (POINTS.has(groundId)) return POINTS.get(groundId);
  const g = rowOf(groundId), b = g ? bandAbs(groundId) : null, m = g ? refHeldOf(groundId) : null;
  const p = b && Number.isInteger(m) && g.floorStep < m && m < g.topStep && b.floorPm < b.refPm && b.refPm < b.topPm
    ? Object.freeze([[g.floorStep, b.floorPm], [m, b.refPm], [g.topStep, b.topPm]]) : null;
  POINTS.set(groundId, p);
  return p;
}

/* the absolute step of own step `s` as an exact fraction [num, den] (den > 0) */
function absFrac(groundId, s) {
  const p = pointsOf(groundId);
  if (!p || !Number.isInteger(s)) return null;
  const [[a, A], [b, B]] = s <= p[1][0] ? [p[0], p[1]] : [p[1], p[2]];
  return [A * (b - a) + (s - a) * (B - A), b - a];
}

/** The absolute step (thousandths of a Level) of own step `step` on `groundId`, rounded half up; null off the scale. */
export function absPmOf(groundId, step) {
  const f = absFrac(groundId, step);
  return f ? div(f[0], f[1]) : null;
}

/** "Depth N of DEPTHS" for own step `step` on `groundId`: the band from its floor to its top cut evenly in absolute steps, half up, held to
    1..DEPTHS (a step under the floor reads Depth 1). Null off the scale or for a step that is not a whole number. */
export function depthAt(groundId, step) {
  const f = absFrac(groundId, step), b = f ? bandAbs(groundId) : null;
  if (!f) return null;
  const span = b.topPm - b.floorPm, [num, den] = f;
  const d = 1 + Math.floor((2 * (num - b.floorPm * den) * (DEPTHS - 1) + span * den) / (2 * span * den));
  return Math.max(1, Math.min(DEPTHS, d));
}
