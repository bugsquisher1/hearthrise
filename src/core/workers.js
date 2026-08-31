// ============================================================
// src/core/workers.js — THE HIRED-CREW RATE MODEL. One authority, two engines.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
//
// ── WHY THIS FILE EXISTS (the b389 anchor defect) ───────────────────────────
// A hired worker is priced as "a FRACTION of what the player would produce at
// the same node". That sentence has two halves, and until now only one of them
// was authored: the fraction (`workerEff`) lived in two mirrored copies, and the
// thing it was a fraction OF was never named at all — each engine just divided
// the raw `node.ms` by it.
//
// `node.ms` is NOT what the player gathers at. Every player-facing action goes
// through `pacedActionMs()` (PACE.actionMs = 1.60, b226 pacing overhaul), so the
// active rate at a node is `pacedActionMs(node.ms)`, not `node.ms`. Dividing the
// UNPACED number by the efficiency therefore paid every worker **1.60x its
// stated share** — measured, not inferred:
//
//     equivalents = activeInterval / workerTickMs
//                 = pacedActionMs(ms) / (ms / eff)
//                 = PACE.actionMs * eff        ← the defect: a stray 1.60
//
// So the b389 rebalance, whose own change note computed "6 x 0.172 = 1.03
// active-equivalents", actually shipped 6 x 0.2752 = **1.65** — it missed its
// own target by 60%, in the direction of the gold faucet it was written to
// close. The guard that was supposed to prevent exactly this measured `eff`
// (a proxy) instead of equivalents (the quantity the ruling is about), so it
// passed the whole time. THE LESSON, worth more than the fix: a ratio guard
// must measure the RATIO, through both of the functions that produce it.
//
// THE INTENT WAS ALWAYS THE PACED ANCHOR — it was simply never implemented.
// docs/design/bonus-rebase.md §244 rules on worker efficiency in exactly these
// terms: "Not a multiplier on your rate; a *fraction* of it, paid by a parallel
// producer. **It inherits `PACE` automatically** and cannot inflate." It did
// not inherit PACE; it escaped it. This module makes that sentence true, so
// nothing here is a re-balance — the Designer's numbers are unchanged and are
// now the numbers the engines actually pay.
//
// The fix is to name the anchor — `workerAnchorMs()` — and put it, the
// efficiency curve and the resulting tick interval in ONE module that both the
// client (src/features/workers.js, via core-bridge) and the authoritative settle
// (supabase/functions/hr-accrue/accrual.js `accrueWorkers`, which vendors this
// file) import. Not "two copies kept in step by a comment": one identity. A
// client display that quoted a rate the server settle does not pay would be the
// away-divergence class this codebase has already paid for twice.
//
// ── EXACT ARITHMETIC IS PRESERVED, DELIBERATELY ────────────────────────────
// The server splits a span into whole ticks + a carried remainder in INTEGER
// units, which is what makes one 24h settle byte-identical to N small ones
// (tests/worker-accrual.mjs W8). That relies on two facts, both still true:
//   • eff is exactly rational with denominator 1000 — `workerEffE` is the
//     integer numerator (100..172);
//   • the anchor is an INTEGER number of milliseconds — `pacedActionMs` floors.
// So perTick = anchorMs * 1000 / E stays an exact rational and no float
// remainder can drift. Changing the anchor changes the numerator and nothing
// about the exactness.
//
// ── WHAT THE ANCHOR DELIBERATELY DOES NOT INCLUDE ──────────────────────────
// The player's own speed perks and tool ladder (`actionSpeedBonus`) are NOT in
// the anchor. A worker's share is a share of the BASE paced action, not of
// whatever the employer happens to be wearing — otherwise a Rune Axe would
// silently speed up the whole crew, the client could never predict the server's
// number (perks are re-derived server-side from server-known state), and the
// crew's rate would move every time the player swapped a tool. Stated here so
// the omission reads as a decision rather than an oversight.
// ============================================================

import { pacedActionMs } from './pacing.js?v=500';

/* b389 WORKER REBALANCE (game-designer; Tyler: "workers are overpowered").
   A castle crew of 6 at Lv10 = 6 x 0.172 = 1.03 active-player-equivalents —
   "roughly ONE extra gatherer working while you are away". These are the
   Designer's numbers; this module owns only how they are APPLIED. */
export const WORKER_BASE_EFF = 0.10;
export const WORKER_EFF_PER_LVL = 0.008;
export const WORKER_MAX_LVL = 10;

/** "Workers rest without direction" — one settle is bounded at 24h. */
export const WORKER_ACCRUE_CAP_MS = 24 * 3600000;

/* A blast radius on the stored per-worker carry, mirrored by
   `c_max_worker_acc` in supabase/migrations/2026-08-25-workers.sql (hr_apply
   REFUSES an acc_ms outside [0, this) rather than clamping it).

   A legitimate carry is always < one perTick, so the ceiling is
   `workerTickMs(max(node.ms), lv1)`. That derivation used to live in a comment
   quoting `13000/0.10 = 130,000` — which was stale twice over: the slowest node
   is 14,000 ms today, and the anchor is now the PACED interval. The honest
   figure is `pacedActionMs(14000) / 0.10 = 224,000 ms`, still comfortably under
   this constant. A COMMENT CANNOT NOTICE THAT IT HAS GONE STALE, so the
   derivation is a test now: tests/worker-accrual.mjs W13 walks the real node
   catalogue and fails if the largest achievable carry ever reaches this value.
   That is what keeps the headroom true at 10x the content. */
export const WORKER_MAX_ACC_MS = 900000;   // 15 min

/** A finite, non-negative number or 0. Every input here can arrive from a
    database row (a NULL column, a bigint as a string) or from a save blob. */
function nat(v) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? n : 0;
}

/** A worker's level from its lifetime xp — min 1, capped at WORKER_MAX_LVL. */
export function workerLevel(xp) {
  return Math.min(WORKER_MAX_LVL, 1 + Math.floor(Math.sqrt(nat(xp) / 2000)));
}

/** Efficiency: the fraction of the ACTIVE PLAYER's rate this worker produces
 *  at. Exactly (100 + 8*(lvl-1)) / 1000. */
export function workerEff(xp) {
  return WORKER_BASE_EFF + WORKER_EFF_PER_LVL * (workerLevel(xp) - 1);
}

/** E = eff * 1000 — the integer (100..172) that makes the server's whole-tick /
 *  carry split exact. Exported because the exactness argument belongs to this
 *  module, not to whichever engine happens to need the numerator. */
export function workerEffE(xp) {
  return 100 + 8 * (workerLevel(xp) - 1);
}

/**
 * THE ANCHOR: what one action is worth of an ACTIVE player's time at this node.
 *
 * This is `pacedActionMs`, i.e. exactly the interval `actionIntervalMs` gives a
 * perkless player — so `workerEff` means what it says, and the crew total that
 * the design ruling names is the crew total the engines pay. Integer ms.
 */
export function workerAnchorMs(nodeMs) {
  return pacedActionMs(nodeMs);
}

/**
 * The interval between one worker's productions at a node. Float form — the
 * client's prediction and every rate readout use it directly; the server
 * evaluates the SAME rational exactly (anchorMs * 1000 / workerEffE) so the
 * live display and the authoritative settle can never quote different numbers.
 *
 * Returns Infinity for a zero/absent efficiency, which every caller already
 * handles as "no ticks" — defer, never mispay.
 */
export function workerTickMs(nodeMs, xp) {
  const eff = workerEff(xp);
  return eff > 0 ? (workerAnchorMs(nodeMs) / eff) : Infinity;
}
