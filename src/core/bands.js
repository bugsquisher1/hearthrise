// ============================================================
// src/core/bands.js — THE RATING, A GROUND'S BAND IN ABSOLUTE STEPS, AND "DEPTH N OF 20" (lane/foundations-block, 2026-11-23).
//
// src/data/bands.js says what an absolute step is and why the band is a formula; this is the arithmetic, in whole thousandths of a Level
// (permille, "Pm") so the browser, the edge and the Lab read the same number to the last digit:
//   skillLevelPm(skill, value)   the Level the reference career reaches skill `value` at (the skill clock read backwards), thousandths
//   ratingPm({ levelPm, gearPm, skillLevelPm })
//                                04 section 1's rating: L + wGear x (gear - L) + wSkill x (skillLevel - L), thousandths, rounded once
//   bandAbs(groundId)            { floorPm, refPm, topPm }: the band's three companies as ratings (null off the scale, or a ground whose
//                                hunt has no Level band)
//   companyKits(row, top)        the item Level each company wears (fresh, strong; own: a band inside its own gear tier, 29 section 7.5)
//   insideOneTier(groundId)      a ground whose Levels all sit inside its own gear tier: its companies wear its own kit
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
import { BAND_ABS } from '../data/bands.js';
import { SKILL_CURVE, COMBAT_XP_SKILLS, levelHoursOf } from '../data/core-model.js';
import { HUNT_INDEX } from '../data/hunts.js';
import { HUNT_GROUNDS } from '../data/hunt-grounds.js';

const own = (o, k) => typeof k === 'string' && !!o && Object.prototype.hasOwnProperty.call(o, k);
const rowOf = (groundId) => (own(DANGER_GROUNDS, groundId) ? DANGER_GROUNDS[groundId] : null);
/* a / b to the nearest whole, halves up (b > 0) */
const div = (a, b) => Math.floor((2 * a + b) / (2 * b));

/* the hunted hours from Level 1 to Level L (core-model.js hoursToLevel), one running sum grown on demand: H[L - 1] reaches Level L */
const HOURS_TO = [0];
function hoursTo(L) {
  while (HOURS_TO.length < L) HOURS_TO.push(HOURS_TO[HOURS_TO.length - 1] + levelHoursOf(HOURS_TO.length));
  return HOURS_TO[L - 1];
}

/** The Level (thousandths) at which the reference career reaches `value` of `skill`, a combat skill on the Level clock (Melee, Ranged, Magic,
    Defense; src/data/core-model.js SKILL_CURVE, stage 7): the career spends pacePm / 1000 x the hours of Level n on skill level n, so skill
    `value` arrives with the Level whose hours from Level 1 are pace x the hours from Level 1 to `value`, straight inside that Level. At pace
    1000 the skill is its own Level, exactly. Null for another skill or a value that is not a number; a value under 1 reads Level 1.
    `pacePm` is the data's (tests/bands.mjs reads the clock at other paces). */
export function skillLevelPm(skill, value, pacePm = SKILL_CURVE.pacePm) {
  const v = Math.floor(Number(value));
  if (!COMBAT_XP_SKILLS.includes(skill) || !Number.isFinite(v)) return null;
  const s = Math.max(1, v);
  if (pacePm === 1000) return 1000 * s;
  const want = (pacePm * hoursTo(s)) / 1000;
  let L = 1;
  while (hoursTo(L + 1) <= want) L++;
  return 1000 * L + Math.round((1000 * (want - hoursTo(L))) / levelHoursOf(L));
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

/** THE KIT EACH COMPANY OF A BAND WEARS, as item Levels, from a DANGER_GROUNDS-shaped row `g` ({ entryLevel, gearLevel }) and the band's
    top Level: { own, fresh, strong }. The fresh company wears BAND_ABS.freshTiersBack tiers under the base, the strong one the tier ahead
    only when its top Level can wear it (src/data/bands.js: "worn from its item Level less wearAhead"), else the highest tier it can.
    A GROUND INSIDE ONE GEAR TIER (`own`; designer, 29-tuning-pass.md section 7.5, 2026-11-23): every Level of its band, entry to top, sits
    inside its own base tier's Levels (gearLevel to gearLevel + tierSteps), so "one tier back" or "ahead" means nothing there (tier 0 is the
    starting kit): both companies wear the ground's own tier (tools/new-ground.mjs caps its cells' kits the same way). The Mill Cellar
    (1 to 4) and the Thicket (5 to 15) on tier 0. Pure: the rule on any row, so a guard can read it on rows no ground carries yet. */
export function companyKits(g, top) {
  const T = GEAR_STEPS.tierSteps;
  const own = g.entryLevel >= g.gearLevel && top < g.gearLevel + T;
  return { own,
    fresh: own ? g.gearLevel : Math.max(0, g.gearLevel - T * BAND_ABS.freshTiersBack),
    strong: own ? g.gearLevel : Math.max(g.gearLevel, Math.min(g.gearLevel + T * BAND_ABS.topTiersAhead, wearableTierLevel(top))) };
}

/** True for a scale ground inside one gear tier (companyKits `own`); false off the scale or with no Level band. */
export function insideOneTier(groundId) {
  const g = rowOf(groundId), top = topLevelOf(groundId);
  if (!g || !Number.isInteger(g.entryLevel) || !Number.isInteger(top) || !Number.isInteger(g.gearLevel)) return false;
  return companyKits(g, top).own;
}

/** The band's three companies as absolute steps (thousandths): { floorPm, refPm, topPm }, each at its kit (companyKits). Null off the scale
    or with no Level band. */
export function bandAbs(groundId) {
  const g = rowOf(groundId), top = topLevelOf(groundId);
  if (!g || !Number.isInteger(g.entryLevel) || !Number.isInteger(g.refLevel) || !Number.isInteger(top) || !Number.isInteger(g.gearLevel)) return null;
  const kits = companyKits(g, top);
  const at = (L, gear) => ratingPm({ levelPm: 1000 * L, gearPm: 1000 * gear });
  return { floorPm: at(g.entryLevel, kits.fresh), refPm: at(g.refLevel, g.gearLevel), topPm: at(top, kits.strong) };
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
