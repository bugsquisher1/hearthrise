// ============================================================================
// src/core/kill-time.js — THE PLAUSIBILITY FLOOR ON A KILL.
//
// WHY THIS EXISTS (bug #5, the two-phase bounty that hangs at target)
// The server bounty counter (`player_progress` ev:kill_monster:<target>) is
// written only by the away/span-sim, which re-simulates the elapsed window as an
// UNATTENDED character and realizes 60–99% fewer kills than the attended live
// player actually got. The client bar hits 102/102, the server counter never
// reaches target, hr_claim_bounty refuses forever. hr_credit_kills lets the
// client TOP UP the server counter with its observed kills — but a credit RPC
// that trusted the client's number would let a forger complete any bounty
// instantly. So the credit is CLAMPED to a plausibility ceiling: no more kills
// than a god-geared character of this player's level could PHYSICALLY have made
// in the elapsed window.
//
// THE MODEL, and why every choice is the SAFE (never-throttle-an-honest-player)
// direction. The cap must be an OVER-estimate of a real player's kill rate — a
// throttled honest player on a money surface is worse than a loose bound on a
// self-only, journalled forgery — so every term below is pushed to its ceiling:
//
//   maxHitCeil(dmgLevel) = floor( floor(dmgLevel·STR_LVL + BEST_STR_BONUS·STR_BON
//                                       + BASE_MAX_HIT)
//                                 · DMG_MULT_CEIL · CRIT_MULT )
//
//     STR_LVL / STR_BON / BASE_MAX_HIT  COMBAT_BALANCE (the live max-hit formula)
//     BEST_STR_BONUS   the single largest strength bonus any item in the game
//                      grants (best-in-slot across every weapon family) — a
//                      global ceiling, NOT the player's real gear, because item
//                      combat stats are not server-side (see the migration).
//     DMG_MULT_CEIL    the product of every damage MULTIPLIER at its clamp:
//                      the best style damageMod × MAX_TOTAL_DAMAGE_MULT (weapon×
//                      bane×element) × (1 + TOTAL_CAP) (the perk damage ceiling).
//     CRIT_MULT        every swing assumed to crit.
//
//   minTimeToKillMs(hp, dmgLevel) = max(minTickMs,
//                                       ceil(hp / maxHitCeil) · minTickMs)
//
//     minTickMs is the HARD per-swing floor (600 ms, COMBAT_BALANCE) — a swing
//     interval is a DIVISOR of elapsed time, so it is the single largest lever;
//     the fastest any character can swing is minTickMs, so a kill takes at least
//     (swings-to-kill) × minTickMs even for a max-DPS build.
//
// The cap the RPC then applies is floor(1.3 × elapsedMs / minTimeToKillMs) — the
// 1.3× headroom (variance / latency / crit streaks) is the Designer's ruled
// ceiling and lives in the RPC, not here (it is a policy knob, not a physics
// number).
//
// SOURCE OF TRUTH. The resolved numeric constants below are vendored into
// 2026-08-30-bounty-kill-credit.sql by hand and BOUND to this module by
// tests/kill-time-drift.mjs — a divergence fails the build. Monster HP is
// vendored into hr_bounty_monsters by tools/gen-bounty-monsters.mjs from
// src/data/monsters.js (the one source; never a hand copy).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================================

import { COMBAT_BALANCE } from './combat.js?v=498';
import { MAX_TOTAL_DAMAGE_MULT } from './elements.js?v=498';
import { TOTAL_CAP } from './perks.js?v=498';
import { COMBAT_STYLES } from './styles.js?v=498';
import { ITEMS } from '../data/items.js?v=498';

/* The single largest strength bonus any item grants, across the three damage
   families (melee strB, magicStrB, rangeStrB). Derived from the catalogue at
   load — never a hand-typed number — so a new best-in-slot weapon raises the
   ceiling (looser cap, still never throttling) automatically. */
export const BEST_STR_BONUS = (() => {
  let best = 0;
  for (const k in ITEMS) {
    const it = ITEMS[k] || {};
    best = Math.max(best, it.strB || 0, it.magicStrB || 0, it.rangeStrB || 0);
  }
  return best;
})();

/* The largest damageMod any combat style carries. */
export const MAX_STYLE_DAMAGE_MOD = (() => {
  let best = 1;
  for (const fam in COMBAT_STYLES) {
    const styles = COMBAT_STYLES[fam] || {};
    for (const key in styles) best = Math.max(best, Number(styles[key].damageMod) || 1);
  }
  return best;
})();

/* The product of every damage multiplier at its ceiling. A future factor added
   to weaknessInfo is already bounded by MAX_TOTAL_DAMAGE_MULT (that clamp is the
   formula's, not the item table's), so this stays a true upper bound. */
export const DMG_MULT_CEIL = MAX_STYLE_DAMAGE_MOD * MAX_TOTAL_DAMAGE_MULT * (1 + TOTAL_CAP);

export const CRIT_MULT = COMBAT_BALANCE.critMult;
export const MIN_TICK_MS = COMBAT_BALANCE.minTickMs;

/* The Designer-ruled plausibility headroom. Exported here as the source of truth
   even though the RPC applies it, so the drift test can pin the SQL literal. */
export const PLAUSIBILITY_HEADROOM = 1.3;

/* ── INTEGER-EXACT COEFFICIENTS ──────────────────────────────────────────────
   The cap runs in TWO runtimes — this module (Node, for the client + tests) and
   hr_credit_kills (Postgres) — and they must agree bit-for-bit or an honest kill
   the client counts is one the server refuses. Floating-point (`base × 2.7664 ×
   1.5`) rounds differently in a double than in Postgres `numeric`, so both sides
   instead multiply by INTEGERS and divide once, which is exact everywhere:

     base       = floor((dmgLevel·LVL_NUM + BASE_OFFSET) / 100)
     maxHitCeil = max(1, floor(base · MULT_NUM / MULT_DEN))

   The integers below are DERIVED from the balance constants (never hand-typed),
   so a tuning change flows through, and tests/kill-time-drift.mjs re-derives them
   and pins the SQL literals to them. */
export const LVL_NUM = Math.round(COMBAT_BALANCE.strengthLevelScale * 100);          // 35
export const BASE_OFFSET = Math.round(
  (BEST_STR_BONUS * COMBAT_BALANCE.strengthBonusScale + COMBAT_BALANCE.playerBaseMaxHit) * 100,
);                                                                                    // 4280
export const MULT_DEN = 10000;
export const MULT_NUM = Math.round(DMG_MULT_CEIL * CRIT_MULT * MULT_DEN);            // 41496

/**
 * The physical maximum per-swing damage for a character whose damage-relevant
 * skill is `dmgLevel`, assuming best-in-slot gear, the best style, every damage
 * multiplier maxed, and a crit. An OVER-estimate on purpose. Integer-exact.
 * @param dmgLevel  the greater of the player's strength/ranged/magic LEVEL
 */
export function maxHitCeil(dmgLevel) {
  const lvl = Math.max(1, Math.floor(Number(dmgLevel) || 1));
  const base = Math.floor((lvl * LVL_NUM + BASE_OFFSET) / 100);
  return Math.max(1, Math.floor((base * MULT_NUM) / MULT_DEN));
}

/** Minimum plausible swings to kill a `hp`-HP monster at this level. */
export function minSwingsToKill(hp, dmgLevel) {
  const h = Math.max(1, Math.floor(Number(hp) || 1));
  return Math.max(1, Math.ceil(h / maxHitCeil(dmgLevel)));
}

/** Minimum plausible milliseconds to kill ONE such monster. */
export function minTimeToKillMs(hp, dmgLevel) {
  return Math.max(MIN_TICK_MS, minSwingsToKill(hp, dmgLevel) * MIN_TICK_MS);
}

/**
 * The plausibility cap on credited kills over `elapsedMs` for this monster+level.
 * floor(headroom × elapsed / minTimeToKill). Zero for a zero/negative elapsed,
 * which is why a fresh accept credits nothing until time passes (self-healing).
 */
export function plausibleKillCap(hp, dmgLevel, elapsedMs) {
  const e = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const mk = minTimeToKillMs(hp, dmgLevel);
  // Integer-exact: floor(130·e / (100·mk)) — mirrors the SQL bigint arithmetic.
  return Math.floor((130 * e) / (100 * mk));
}

/* The resolved numeric constants the SQL vendors, gathered in one object so the
   drift test reads exactly what a reviewer reads. */
export const KILL_TIME_SQL_CONSTANTS = Object.freeze({
  lvl_num: LVL_NUM,
  base_offset: BASE_OFFSET,
  mult_num: MULT_NUM,
  mult_den: MULT_DEN,
  min_tick_ms: MIN_TICK_MS,
  headroom_num: Math.round(PLAUSIBILITY_HEADROOM * 100), // 130
  headroom_den: 100,
});
