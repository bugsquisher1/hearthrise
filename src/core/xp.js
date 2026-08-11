// ============================================================
// src/core/xp.js — the XP curve and every level derived from it.
//
// AUTHORITATIVE. `legacy.js` no longer owns this maths; its XP_TABLE is
// unified against this array by src/core-bridge.js (the same in-place
// merge main.js uses for ITEMS/MONSTERS, so there is one identity rather
// than two copies), and a smoke guard asserts they never drift.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

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

// ── Derived levels ───────────────────────────────────────────────────────
// These take the skill XP map explicitly; on the client that is G.skills,
// on the server it is the `player_skills` rows keyed by skill_id. Neither
// caller stores a level — level is always derived, so the two
// representations of one fact can never drift (design §1).

export function levelOf(skills, skillId) {
  return levelFromXp((skills && skills[skillId]) || 0);
}

export function totalLevel(skills) {
  if (!skills) return 0;
  return Object.keys(skills).reduce((s, k) => s + levelOf(skills, k), 0);
}

export function combatLevel(skills) {
  const a = levelOf(skills, 'attack');
  const st = levelOf(skills, 'strength');
  const d = levelOf(skills, 'defense');
  const h = levelOf(skills, 'hitpoints');
  const p = levelOf(skills, 'prayer');
  const r = levelOf(skills, 'ranged');
  const mg = levelOf(skills, 'magic');
  const base = (d + h + Math.floor(p / 2)) * 0.25;
  const melee = (a + st) * 0.325;
  const range = Math.floor(r * 1.5) * 0.325;
  const mage = Math.floor(mg * 1.5) * 0.325;
  return Math.floor(base + Math.max(melee, range, mage));
}
