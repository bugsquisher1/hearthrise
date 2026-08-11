// ============================================================
// src/core/pacing.js — the pacing dials, the speed fuse, the advertised
// rate, and gold find. AUTHORITATIVE; legacy.js delegates here.
//
// Everything takes its inputs explicitly. `bonus(key)` is injected for
// the same reason as in combat.js: on the client it is a seven-deep
// wrapper chain (world-events, companions, clans, muster…), on the
// server it is a sum over server-known perks, and core must not care.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* b226 (docs/design/pacing-overhaul.md). PACE.xp multiplies every EARNED
   XP grant; PACE.actionMs multiplies every gathering/artisan action
   duration. FARMING is exempt — growth is wall-clock, so actionMs cannot
   reach it and scaling its XP would only deepen an existing hole. */
export const PACE = { xp: 0.39, actionMs: 1.60 };
export const PACE_EXEMPT_SKILLS = ['farming'];

export const SPEED_KEYS = { cookSpeed: 1, smithSpeed: 1, craftSpeed: 1, prayerSpeed: 1, gatherSpeed: 1 };

/* b227/b228 — THE FUSE, at the point of CONSUMPTION.
   A clamp inside getBonus is escaped by every wrapper above it (measured:
   0.8999 through a clamp that said 0.85), so the ceiling lives at the one
   expression that cannot survive a bad number: `ms × (1 − speed)`.
   0.70 is derived: the largest legal reading is gatherSpeed at the 0.30
   budget peak plus the 0.35 tool ladder = 0.65, so the fuse sits five
   points clear of any legitimate stack and never silently nerfs one. */
export const SPEED_FUSE = 0.70;

/* Returns the MULTIPLIER, not the bonus: `ms * speedClamp(speed)`.
   A negative total (a debuff) passes through untouched — the fuse is a
   ceiling on how fast you may go, never a floor on how slow. */
export function speedClamp(speed) { return 1 - Math.min(SPEED_FUSE, (+speed || 0)); }

export const MIN_ACTION_MS = 500;

/** The XP a grant is actually worth after the pacing dial. */
export function pacedXp(skillId, amt) {
  const n = Number(amt) || 0;
  if (n <= 0) return 0;
  if (PACE_EXEMPT_SKILLS.indexOf(skillId) >= 0) return n;
  return n * PACE.xp;
}

/** The base duration of one action after the pacing dial, before perks. */
export function pacedActionMs(ms) {
  return Math.max(MIN_ACTION_MS, Math.floor((Number(ms) || 0) * PACE.actionMs));
}

export const GATHER_SKILLS = ['woodcutting', 'mining', 'fishing'];
const ARTISAN_SPEED_KEY = { cooking: 'cookSpeed', smithing: 'smithSpeed', crafting: 'craftSpeed', prayer: 'prayerSpeed' };

/** Which perk key governs this skill's action speed. One list, so a new
    skill wires its speed perk by adding a row rather than editing a site. */
export function speedKeyFor(skillId) {
  if (GATHER_SKILLS.indexOf(skillId) >= 0) return 'gatherSpeed';
  return ARTISAN_SPEED_KEY[skillId] || 'gatherSpeed';
}

/** The total speed bonus spent on an action: perks + (gathering) tools. */
export function actionSpeedBonus(skillId, ctx) {
  const c = ctx || {};
  const bonus = typeof c.bonus === 'function' ? c.bonus : () => 0;
  let speed = bonus(speedKeyFor(skillId)) || 0;
  if (GATHER_SKILLS.indexOf(skillId) >= 0 && typeof c.toolSpeed === 'function') {
    speed += (c.toolSpeed(skillId) || 0);
  }
  return speed;
}

/** The interval one action actually takes, fuse applied. */
export function actionIntervalMs(skillId, baseMs, ctx) {
  return Math.max(MIN_ACTION_MS, Math.floor(pacedActionMs(baseMs || 3000) * speedClamp(actionSpeedBonus(skillId, ctx))));
}

/**
 * The advertised rate, computed the way the engine actually pays. Every
 * "xp/hr" readout reads this — an activity bar quoting 18,000 xp/hr while
 * the skill ticks at 5,000 is a worse lie than showing no number at all.
 *
 * @param ctx { bonus, toolSpeed, xpB }
 */
export function actionRate(skillId, action, ctx) {
  if (!action) return null;
  const c = ctx || {};
  const bonus = typeof c.bonus === 'function' ? c.bonus : () => 0;
  const ms = actionIntervalMs(skillId, action.ms, c);
  const xpBonus = (bonus('allXP') || 0) + (c.xpB || 0);
  const per = Math.max(1, Math.floor(pacedXp(skillId, action.xp || 0) * (1 + xpBonus)));
  return { ms, xpPerAction: per, xpPerHour: Math.floor(3600000 / ms * per) };
}

/* ── Gold find ────────────────────────────────────────────────────────
   MONSTER GOLD DROPS only: gold find is loot, not income. Vendor sales,
   quest/daily rewards, bounty payouts and chests are designed payouts
   whose numbers are the Designer's; multiplying them here would silently
   re-tune six systems at once. Clamped at >= 0 so a future negative
   contributor can never make a kill pay negative gold. */
export function goldFindMult(bonus) {
  const b = typeof bonus === 'function' ? bonus : () => 0;
  return 1 + Math.max(0, b('goldFind') || 0);
}

export function applyGoldFind(base, bonus) {
  const n = Number(base) || 0;
  if (n <= 0) return 0;
  return Math.floor(n * goldFindMult(bonus));
}
