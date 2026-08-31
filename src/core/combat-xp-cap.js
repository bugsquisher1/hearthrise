// ============================================================================
// src/core/combat-xp-cap.js — THE PLAUSIBILITY CEILING ON ATTENDED COMBAT XP.
//
// WHY THIS EXISTS (bug #5 root, part 2 — the "attack reverts 5→4" report)
// Live combat XP is client-PREDICTED only: under the server arm addXp records a
// prediction (src/net/predict.js) instead of writing G.skills, so the client
// shows level 5. The only SERVER writer for combat XP is the away/span-sim
// (supabase/functions/hr-accrue/accrual.js), which re-simulates the elapsed
// window as an UNATTENDED character and undercounts 60-99%. On settle, applyRecord
// stamps the undercount and predict.js retires the prediction by time-coverage,
// dropping the display to the undercount → the gained level reverts.
//
// THE FIX (docs/design/combat-authority.md §3). The live client SUBMITS its
// observed per-combat-skill XP gains to a new SECURITY DEFINER RPC
// (hr_credit_combat_xp), which CLAMPS each skill's credit to the physical maximum
// a god-geared character of this player's SERVER-KNOWN damage level could have
// earned in the SERVER's own elapsed clock, then advances a SEPARATE watermark
// (player_state.combat_xp_accrued_to). The settle then credits combat XP only for
// the window NOT already covered by that watermark — no double-pay. The cap + the
// journal + the daily-XP budget are the anti-cheat; the client mints nothing.
//
// THE MODEL, and why every term is pushed to its ceiling (never throttle an
// honest player — a throttled honest grant on a rankable surface is worse than a
// loose bound on a self-only, journalled, daily-budget-capped forgery). The
// maximum combat XP a single skill can gain per millisecond is bounded by the
// maximum DAMAGE per ms (physical-max hit every swing, at the 600ms swing floor)
// times the maximum XP any point of damage or any kill can be worth:
//
//   maxHit(dmgLevel)         src/core/kill-time.js maxHitCeil — best-in-slot,
//                            best style, every damage multiplier maxed, a crit.
//   HIT XP per damage        <= HIT_XP_PER_DAMAGE (4, styled hits) + ceil(
//                            HIT_HP_XP_PER_DAMAGE) (2, hitpoints) = 6. Attributing
//                            the WHOLE per-damage XP to any single skill is a
//                            strict over-estimate (no style routes >100% to one
//                            skill, and hitpoints XP is disjoint from styled XP).
//   KILL XP per damage       a kill worth `xp` on a `hp`-HP monster is at most
//                            MAX_XP_PER_HP xp per point of that monster's HP, and
//                            each point of HP takes at least 1/maxHit swings, so
//                            kill XP per ms <= (maxHit/minTick) * MAX_XP_PER_HP,
//                            lifted by the Boss-of-the-Day XP ceiling MAX_XP_MULT.
//
//   maxCombatXpPerMs(dmg) = maxHit(dmg) * (HIT_XP_CEIL_PER_DMG
//                                          + MAX_XP_PER_HP * MAX_XP_MULT) / minTick
//
// The RPC applies the SAME 1.3x plausibility headroom kill-time.js documents, and
// the whole thing is journalled + daily-budget-capped.
//
// SOURCE OF TRUTH. The resolved integer coefficients are vendored into
// 2026-08-31-combat-xp-credit.sql by hand and BOUND to this module by
// tests/combat-xp-cap-drift.mjs — a divergence fails the build. MAX_XP_PER_HP is
// DERIVED from the monster catalogue at load (never hand-typed), so new content
// raises the ceiling (looser cap, still never throttling) automatically.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================================

import { maxHitCeil, MIN_TICK_MS, PLAUSIBILITY_HEADROOM } from './kill-time.js?v=499';
import { HIT_XP_PER_DAMAGE, HIT_HP_XP_PER_DAMAGE } from './styles.js?v=499';
import { WEEKLY_BONUS } from './botd.js?v=499';
import { MONSTERS } from '../data/monsters.js?v=499';

/* The largest XP-per-HP ratio any monster in the catalogue carries, rounded UP.
   Derived at load so a new high-XP monster loosens the cap (never throttles)
   automatically — never a hand-typed number. `astrologer` is the current argmax
   (~3.378 → 4). */
export const MAX_XP_PER_HP = (() => {
  let best = 0;
  for (const k in MONSTERS) {
    const m = MONSTERS[k] || {};
    const hp = Math.max(1, Number(m.hp) || 1);
    const xp = Math.max(0, Number(m.xp) || 0);
    best = Math.max(best, xp / hp);
  }
  return Math.max(1, Math.ceil(best));
})();

/* Combined per-point-of-damage XP ceiling for ANY single skill: styled hit XP
   (dmg x 4) OR the disjoint hitpoints share (floor(dmg x 1.33)) — bounded above
   by their sum, integer-ceiled. */
export const HIT_XP_CEIL_PER_DMG = HIT_XP_PER_DAMAGE + Math.ceil(HIT_HP_XP_PER_DAMAGE); // 6

/* The Boss-of-the-Day combat-XP ceiling (weekly is the larger lift). Applied
   away too (the away ruling), so it must be in the cap or a featured night would
   be wrongly throttled. Expressed as a rational so the SQL stays integer-exact. */
export const XP_MULT_NUM = Math.round((Number(WEEKLY_BONUS.xpMult) || 1) * 100);       // 150
export const XP_MULT_DEN = 100;

/* ── INTEGER-EXACT COEFFICIENTS (mirrors kill-time.js's discipline) ──────────
   The cap runs in TWO runtimes — this module (Node, client + tests) and
   hr_credit_combat_xp (Postgres) — and must agree bit-for-bit, or an honest XP
   gain the client counts is one the server refuses. Both sides multiply by
   INTEGERS and divide once:

     max_hit          = kill-time.js maxHitCeil(dmgLevel)
     xp_cap(el)       = floor(HEADROOM_NUM * el * max_hit * INNER_NUM
                              / (HEADROOM_DEN * INNER_DEN))

   INNER_NUM / INNER_DEN is maxCombatXpPerMs expressed over a common denominator
   so the multiplier and the min-tick floor divide exactly. */
export const INNER_NUM = HIT_XP_CEIL_PER_DMG * XP_MULT_DEN + MAX_XP_PER_HP * XP_MULT_NUM; // 1200
export const INNER_DEN = MIN_TICK_MS * XP_MULT_DEN;                                        // 60000
export const HEADROOM_NUM = Math.round(PLAUSIBILITY_HEADROOM * 100);                       // 130
export const HEADROOM_DEN = 100;

/**
 * The plausibility cap on credited combat XP over `elapsedMs` for a character
 * whose damage-relevant level is `dmgLevel`. This is the TOTAL a single credit may
 * grant across ALL combat skills — a shared pool, not a per-skill entitlement
 * (Security condition 1b, 2026-08-31): attributing the full per-damage + kill XP to
 * each of the seven combat skills independently was ~7x pure headroom. The
 * per-CALL cap is deliberately loose; the DAILY combat-XP ceiling
 * (c_combat_xp_day_budget, ~honest-24h-grind) is the tight bound. An over-estimate
 * on purpose. Integer-exact — mirrors the SQL bigint arithmetic.
 * Zero for a zero/negative elapsed (a fresh window credits nothing until time
 * passes — the self-healing property kill-time.js relies on).
 * @param dmgLevel  the greater of the player's strength/ranged/magic LEVEL
 */
export function combatXpCap(dmgLevel, elapsedMs) {
  const el = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const maxHit = maxHitCeil(dmgLevel);
  // floor(HEADROOM_NUM * el * maxHit * INNER_NUM / (HEADROOM_DEN * INNER_DEN))
  return Math.floor((HEADROOM_NUM * el * maxHit * INNER_NUM) / (HEADROOM_DEN * INNER_DEN));
}

/* The resolved numeric constants the SQL vendors, gathered in one object so the
   drift test reads exactly what a reviewer reads. */
export const COMBAT_XP_CAP_SQL_CONSTANTS = Object.freeze({
  inner_num: INNER_NUM,
  inner_den: INNER_DEN,
  headroom_num: HEADROOM_NUM,
  headroom_den: HEADROOM_DEN,
  // the max-hit coefficients are kill-time.js's — re-asserted by the drift test
  // so this cap and the kill cap cannot diverge on the shared max-hit model.
});
