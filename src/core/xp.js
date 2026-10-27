// ============================================================
// src/core/xp.js — EVERY XP CURVE and every level derived from one
// (docs/design/CORE_MODEL.md §2).
//
//   XP_TABLE / levelFromXp / xpForLevel   the CAPPED curve: gathering and
//                       crafting skills, 99 levels.
//   skill curve         Melee, Ranged, Magic, Defense, Inner Flame: no cap
//                       (src/data/core-model.js SKILL_CURVE), whole XP.
//   Level curve         the character's Level, from kills only, endless
//                       (LEVEL_CURVE); Level is not a skill.
//
// The server's twins (hr_level_from_xp, hr_skill_level, hr_char_level) are
// generated from / pinned to these by tests/core-curves.mjs.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { LEVEL_CURVE, SKILL_CURVE } from '../data/core-model.js?v=0.2.57';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.57';

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

// ── The uncapped skill curve (Melee, Ranged, Magic, Defense, Inner Flame) ──────
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
/* LEVEL_CURVE's pace brackets as rows the two directions read: each bracket's start
   Level, the total XP that reaches it (`base`) and its first step. Inside a bracket
   the total m Levels on is base + first m + rise m(m-1)/2 + bend (m-1)m(2m-1)/6, the
   sums of the step first + rise k + bend k^2 over k < m: whole numbers, divided
   before they are multiplied, so they stay exact while the total does (up to 2^53,
   past Level 30,000: centuries of hunting). The server's hr_level_curve holds these
   rows (tools/gen-level-curve.mjs). A malformed curve throws here, at load (and in
   levelCurveRowsOf, which the generator's --selftest plants bad curves into). */
const sumK = (m) => (m * (m - 1)) / 2;
const sumK2 = (m) => ((m - 1) * m * (2 * m - 1)) / 6;
/** The bracket rows of a curve shaped like LEVEL_CURVE; throws on a malformed one. */
export function levelCurveRowsOf(curve) {
  const bs = curve && curve.brackets;
  const whole = (v) => Number.isSafeInteger(v) && v >= 0;
  if (!Array.isArray(bs) || !bs.length || bs[0].from !== 1 || !(whole(curve.first) && curve.first >= 1)) {
    throw new Error('LEVEL_CURVE: brackets must start at Level 1 with a first step of 1 XP or more');
  }
  const rows = [];
  let base = 0, first = curve.first;
  bs.forEach((b, i) => {
    if (!whole(b.from) || !whole(b.rise) || !whole(b.bend) || b.rise + b.bend < 1 || (i > 0 && !(b.from > bs[i - 1].from))) {
      throw new Error('LEVEL_CURVE: bracket ' + i + ' ' + JSON.stringify(b) + ' needs a rising whole start Level and whole rise/bend with rise + bend >= 1');
    }
    if (i > 0) {
      const p = rows[i - 1], m = b.from - p.from;
      base = p.base + p.first * m + p.rise * sumK(m) + p.bend * sumK2(m);
      first = p.first + p.rise * m + p.bend * m * m;
    }
    rows.push(Object.freeze({ from: b.from, base, first, rise: b.rise, bend: b.bend }));
  });
  return Object.freeze(rows);
}
const LEVEL_ROWS = levelCurveRowsOf(LEVEL_CURVE);
/** The derived bracket rows { from, base, first, rise, bend } (the generator writes them to SQL). */
export function levelCurveRows() { return LEVEL_ROWS; }

const totalIn = (r, m) => r.base + r.first * m + r.rise * sumK(m) + r.bend * sumK2(m);

/** Total XP to REACH Level `lv` on bracket rows `rows` (levelCurveRowsOf; the balance simulator's fit reads a
    candidate curve through this). Exact; Level 1 is 0. */
export function xpForLevelOn(rows, lv) {
  const L = Math.max(1, Math.floor(Number(lv) || 1));
  let i = rows.length - 1;
  while (i > 0 && rows[i].from > L) i -= 1;
  return totalIn(rows[i], L - rows[i].from);
}
/** Total XP to REACH Level `lv` (exact; Level 1 is 0). */
export function charXpForLevel(lv) { return xpForLevelOn(LEVEL_ROWS, lv); }
/** The Level `xp` makes. Endless: the highest Level whose total `xp` reaches. */
export function charLevelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let i = LEVEL_ROWS.length - 1;
  while (i > 0 && LEVEL_ROWS[i].base > x) i -= 1;
  const r = LEVEL_ROWS[i];
  /* the largest m with totalIn(r, m) <= x: m stays inside the bracket (the next one starts at its base) */
  let lo = 0;
  let hi = i + 1 < LEVEL_ROWS.length ? LEVEL_ROWS[i + 1].from - r.from : 1;
  if (i + 1 >= LEVEL_ROWS.length) while (totalIn(r, hi) <= x && hi < 1e7) hi *= 2;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (totalIn(r, mid) <= x) lo = mid; else hi = mid; }
  return r.from + lo;
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

/** Derived levels for the envelope, so the client never computes one. */
export function levelsOf(skills) {
  const out = {};
  for (const k in (skills || {})) out[k] = skillLevelFromXp(k, Number(skills[k]) || 0);
  return out;
}
