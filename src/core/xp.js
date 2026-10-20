// ============================================================
// src/core/xp.js — EVERY XP CURVE and every level derived from one
// (docs/design/CORE_MODEL.md §2).
//
//   XP_TABLE / levelFromXp / xpForLevel   the CAPPED curve: gathering and
//                       crafting skills, 99 levels.
//   skill curve         Melee, Ranged, Magic, Defense, Prayer: no cap
//                       (src/data/core-model.js SKILL_CURVE), whole XP.
//   Level curve         the character's Level, from kills only, endless
//                       (LEVEL_CURVE); Level is not a skill.
//
// The server's twins (hr_level_from_xp, hr_skill_level, hr_char_level) are
// generated from / pinned to these by tests/core-curves.mjs.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { LEVEL_CURVE, SKILL_CURVE } from '../data/core-model.js?v=0.2.18';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.18';

/* Threshold XP for level i+1. b215: the level-98 threshold (11,805,606)
   was missing for a long time, which capped levelFromXp at 98 and made
   the skill header read "/ NaN" at the top of the curve. 99 entries. */
export const XP_TABLE = [
  0, 83, 174, 276, 388, 512, 650, 801, 969, 1154, 1358, 1584, 1833, 2107, 2411, 2746, 3115, 3523,
  3973, 4470, 5018, 5624, 6291, 7028, 7842, 8740, 9730, 10824, 12031, 13363, 14833, 16456, 18247,
  20224, 22406, 24815, 27473, 30408, 33648, 37224, 41171, 45529, 50339, 55649, 61512, 67983, 75127,
  83014, 91721, 101333, 111945, 123660, 136594, 150872, 166636, 184040, 203254, 224466, 247886,
  273742, 302288, 333804, 368599, 407015, 449428, 496254, 547953, 605032, 668051, 737627, 814445,
  899257, 992895, 1096278, 1210421, 1336443, 1475581, 1629200, 1798808, 1986068, 2192818, 2421087,
  2673114, 2951373, 3258594, 3597792, 3972294, 4385776, 4842295, 5346332, 5902831, 6517253, 7195629,
  7944614, 8771558, 9684577, 10692629, 11805606, 13034431,
];

/* The cap of a CAPPED skill (gathering and crafting); the combat skills have none. */
export const MAX_LEVEL = 99;

export function levelFromXp(xp) {
  for (let i = XP_TABLE.length - 1; i >= 0; i--) if (xp >= XP_TABLE[i]) return Math.min(i + 1, MAX_LEVEL);
  return 1;
}

/* Inverse of levelFromXp — total XP required to REACH level `lv`. */
export function xpForLevel(lv) {
  const n = Math.max(1, Math.min(MAX_LEVEL, lv | 0));
  return n <= 1 ? 0 : XP_TABLE[n - 1];
}

export function xpToNext(xp) {
  const lv = levelFromXp(xp);
  if (lv >= MAX_LEVEL) return 0;
  return XP_TABLE[lv] - xp;
}

export function xpPct(xp) {
  const lv = levelFromXp(xp);
  if (lv >= MAX_LEVEL) return 1;
  const a = XP_TABLE[lv - 1];
  const b = XP_TABLE[lv];
  return (xp - a) / (b - a);
}

// ── The uncapped skill curve (Melee, Ranged, Magic, Defense, Prayer) ──────
/* The XP from level s to s+1 is floor(base x s^2 x r^(s-1)), r = (1000 + g)/1000,
   the power held as an exact fraction of integers (BigInt), so every runtime
   floors the same value. TOTAL[s-1] = XP to reach level s. Grown on demand;
   past 2^53 a level is unreachable, so the walk stops there. */
const SKILL_TOTAL = [0];
let powNum = 1n;
let powDen = 1n;
function growSkillTo(lv) {
  const base = BigInt(SKILL_CURVE.base);
  const g = BigInt(1000 + SKILL_CURVE.growthPermille);
  while (SKILL_TOTAL.length < lv && SKILL_TOTAL[SKILL_TOTAL.length - 1] < Number.MAX_SAFE_INTEGER) {
    const sl = BigInt(SKILL_TOTAL.length);
    const step = Number((base * sl * sl * powNum) / powDen);
    SKILL_TOTAL.push(SKILL_TOTAL[SKILL_TOTAL.length - 1] + step);
    powNum *= g;
    powDen *= 1000n;
  }
}

/** Is `skillId` capped at MAX_LEVEL (gathering / crafting)? An unknown id is capped. */
export function isCapped(skillId) {
  const d = SKILLS_DEF[skillId];
  return !d || d.cat !== 'combat';
}
/** The cap of `skillId`, or null for an uncapped (combat) skill. */
export function skillCapOf(skillId) { return isCapped(skillId) ? MAX_LEVEL : null; }

/** Total XP to REACH level `lv` of `skillId`. */
export function skillXpForLevel(skillId, lv) {
  if (isCapped(skillId)) return xpForLevel(lv);
  const n = Math.max(1, Math.floor(Number(lv) || 1));
  growSkillTo(n);
  return SKILL_TOTAL[Math.min(n, SKILL_TOTAL.length) - 1];
}

/** The level `xp` makes in `skillId`. */
export function skillLevelFromXp(skillId, xp) {
  if (isCapped(skillId)) return levelFromXp(xp);
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let lv = 1;
  for (;;) {
    growSkillTo(lv + 1);
    if (SKILL_TOTAL.length <= lv || SKILL_TOTAL[lv] > x) return lv;
    lv += 1;
  }
}

// ── The Level curve (the character, from kills only) ────────────────────
/** Total XP to REACH Level `lv`: quartic x (L-1)^4 + cubic x (L-1)^3 + linear x (L-1), exact. */
export function charXpForLevel(lv) {
  const n = Math.max(1, Math.floor(Number(lv) || 1)) - 1;
  return LEVEL_CURVE.quartic * n * n * n * n + LEVEL_CURVE.cubic * n * n * n + LEVEL_CURVE.linear * n;
}
/** The Level `xp` makes. Endless. */
export function charLevelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const lead = LEVEL_CURVE.quartic > 0 ? Math.pow(x / LEVEL_CURVE.quartic, 0.25) : Math.cbrt(x / Math.max(1, LEVEL_CURVE.cubic));
  let lv = Math.max(1, Math.floor(lead));
  while (lv > 1 && charXpForLevel(lv) > x) lv -= 1;
  while (charXpForLevel(lv + 1) <= x) lv += 1;
  return lv;
}

// ── Derived levels ───────────────────────────────────────────────────────
// These take the skill XP map explicitly; on the client that is the
// projection's skills, on the server the `player_skills` rows keyed by
// skill_id. Neither caller stores a level: a level is always derived, so the
// two representations of one fact can never drift.

export function levelOf(skills, skillId) {
  return skillLevelFromXp(skillId, (skills && skills[skillId]) || 0);
}

export function totalLevel(skills) {
  if (!skills) return 0;
  return Object.keys(skills).reduce((s, k) => s + levelOf(skills, k), 0);
}
