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
//     integer numerator (100..145) — and the seat pace is a whole per-cent
//     (`workerSeatPct`), so a hand's pace is the integer E * seat% over 100000;
//   • the anchor is an INTEGER number of milliseconds — `pacedActionMs` floors.
// So perTick = anchorMs * 100000 / (E * seat%) stays an exact rational and no float
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

import { pacedActionMs } from './pacing.js?v=564';

/* THE CREW CURVE (game-designer). History, because the numbers have moved
   twice for the same reason — Tyler: "workers are overpowered" (b389, and again
   at b497):
     b389  a castle crew of 6 at Lv10 = 6 x 0.172 = 1.03 active-player-equivalents.
     b497  the anchor fix made that figure TRUE (it had shipped at 1.65).
     2026-10-08 (lane econ-crew-and-sink) — measured with tools/econ-sim.mjs over
           the real engines: even at a true 1.03, hired hands earned 60-71% of a
           casual or engaged player's gold by day 90 (casual 38.4M, engaged
           91.6M banked), because the crew settles 24h a day and every hand
           reaches Lv10 inside a week. The ruling:
       · LEVELLING STAYS: +0.5%/level, 10% at Lv1 to 14.5% at Lv10 — a trained
         hand is still 45% better than a new one (zeroing the step was proposed
         and REJECTED: it deletes the only progression a worker has).
       · THE CREW SHARES ONE HEARTH (WORKER_SEAT_PCT below): the first three
         hands work at full pace; the 4th, 5th and 6th at 50% / 35% / 25%.
         This is the lever that bites only the late game — no casual or engaged
         player has a 4th hand in week 1 — so day 1-7 income moves -4% / -3%
         while day-90 savings fall to casual ~15M / engaged ~59M.
     A full Lv10 castle crew is now 0.145 x (1+1+1+0.5+0.35+0.25) = 0.59
     active-player-equivalents: "about half an extra gatherer", never a second
     you. The integer forms below (per-mille, per-cent) are what keep the
     server's tick split exact; the decimals are derived from them. */
export const WORKER_BASE_EFF_PM = 100;     // per-mille at Lv1
export const WORKER_EFF_STEP_PM = 5;       // per-mille per level above 1
export const WORKER_BASE_EFF = WORKER_BASE_EFF_PM / 1000;
export const WORKER_EFF_PER_LVL = WORKER_EFF_STEP_PM / 1000;
export const WORKER_MAX_LVL = 10;

/* ONE HEARTH, SIX HANDS — the pace of each SEAT, in whole per-cent.
   Seats are given out among the hands that are WORKING this settle, oldest
   hire first (`crewSeats`). A hand parked idle frees its seat, so a player who
   only wants three gatherers loses nothing. The table is a ceiling the crew
   ladder cannot outgrow: a seventh hand (no tier grants one) would get 0 —
   defer, never mint.
   ⚠ THE SMALLEST SEAT IS BOUNDED BELOW BY THE CARRY CEILING. A worker's banked
   remainder is < one tick, and one tick of a Lv1 hand in the last seat at the
   slowest node is pacedActionMs(14000) * 100 / (0.10 * 25) = 896,000 ms —
   just under WORKER_MAX_ACC_MS (900,000), which hr_apply enforces. A seat
   below 25% would make an honest carry un-writable; tests/worker-accrual.mjs
   W13 walks every seat against the real node catalogue so that cannot ship. */
export const WORKER_SEAT_PCT = Object.freeze([100, 100, 100, 50, 35, 25]);

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
 *  at, before its seat. Exactly workerEffE(xp) / 1000. */
export function workerEff(xp) {
  return workerEffE(xp) / 1000;
}

/** E = eff * 1000 — the integer (100..145) that makes the server's whole-tick /
 *  carry split exact. Exported because the exactness argument belongs to this
 *  module, not to whichever engine happens to need the numerator. */
export function workerEffE(xp) {
  return WORKER_BASE_EFF_PM + WORKER_EFF_STEP_PM * (workerLevel(xp) - 1);
}

/** The pace of a seat in whole per-cent (0 for a seat the table does not have,
 *  or a malformed index — defer, never mint). */
export function workerSeatPct(seat) {
  const i = Number(seat);
  if (!Number.isInteger(i) || i < 0 || i >= WORKER_SEAT_PCT.length) return 0;
  return WORKER_SEAT_PCT[i];
}

/**
 * Who sits where: `{ uid: seatIndex }` (null-prototype) for the hands given.
 * Callers pass ONLY the hands that are working (assigned to a real node) —
 * the server settle and the client readout both do — so an idle hand frees
 * its seat. Order: oldest `hired_at` first, then `uid`, so the answer is a
 * pure function of server-owned columns and every engine agrees on it. A row
 * with no readable `hired_at` sits LAST (the server pays it nothing anyway;
 * it must not push a paid hand down a seat).
 */
export function crewSeats(crew) {
  const seen = new Set();
  const rows = [];
  for (const w of (Array.isArray(crew) ? crew : [])) {
    if (!w || typeof w.uid !== 'string' || !w.uid || seen.has(w.uid)) continue;
    seen.add(w.uid);
    const t = Date.parse(String(w.hired_at == null ? '' : w.hired_at));
    rows.push({ uid: w.uid, t: Number.isFinite(t) ? t : Number.MAX_VALUE });
  }
  rows.sort((a, b) => (a.t !== b.t ? (a.t < b.t ? -1 : 1) : (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)));
  const out = Object.create(null);
  rows.forEach((r, i) => { out[r.uid] = i; });
  return out;
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
 * evaluates the SAME rational exactly (anchorMs * 100000 / (workerEffE * seat%)) so the
 * live display and the authoritative settle can never quote different numbers.
 *
 * `seatPct` is the hand's seat pace — workerSeatPct(crewSeats(working)[uid]).
 * 100 (the default) is a hand in one of the first three seats.
 *
 * Returns Infinity for a zero/absent efficiency, which every caller already
 * handles as "no ticks" — defer, never mispay.
 */
export function workerTickMs(nodeMs, xp, seatPct = 100) {
  const pct = Number(seatPct);
  const eff = workerEff(xp) * ((Number.isFinite(pct) && pct > 0) ? pct : 0) / 100;
  return eff > 0 ? (workerAnchorMs(nodeMs) / eff) : Infinity;
}
