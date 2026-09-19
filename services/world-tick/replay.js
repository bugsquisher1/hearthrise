// ============================================================================
// services/world-tick/replay.js — REPLAY REAL SETTLE WINDOWS, READ-ONLY.
//
// Step 1 of the live-world sequence asks the shadow tick to prove something on
// REAL DATA rather than on fixtures. This file is the analysis half: a PURE
// function over journal rows that have already been fetched. It has no Supabase
// client, no `fetch`, no fs, no token — `tools/world-tick-replay.mjs` does the
// (SELECT-only) read and hands the rows here, which is what makes the whole
// analysis testable offline and keeps shadow mode's "writes nothing, talks to
// nothing" property true of `services/**`.
//
// ── WHAT CAN BE REPLAYED FROM THE JOURNAL, AND WHAT CANNOT ──────────────────
// Measured against production 2026-09-18. A `player_ledger` accrue row carries
//   meta = { ms, from, to, ticks, capped, kills|made|qty, ate, stopped, out_of,
//            delta:{ g, i:{item:qty}, x:{skill:xp}, k:[keys] } }
// which is the window's GEOMETRY and its RESULT. It does NOT carry the window's
// STARTING STATE (hp, skills, equipment, inventory, fight checkpoint, buffs,
// consec_falls) and it cannot carry the PRNG seed, because the seed is
// `hr_seed(user, slot, 'accrue:'||accrued_to)` mixed with a 256-bit secret in an
// RLS'd table that no read-only tool may read (and must not — S20).
//
// Therefore a VALUE replay ("re-roll the same window and compare gold/items")
// is NOT possible from the journal today, and this file does not pretend to do
// one. Inventing a starting state to make the numbers line up would be
// fabricating player state (CLAUDE.md §2). `MISSING_FOR_VALUE_REPLAY` below is
// the exact list a lane-C journalling brief has to add before it becomes
// possible.
//
// What IS fully replayable from the journal, with nothing invented, is the
// property the world tick actually has to agree with: **the settle watermark**.
// `settledWatermarkMs` (hr-accrue/accrual.js, 2026-09-16) advances `accrued_to`
// by the time the simulation ACCOUNTED for rather than to `now()`, so the
// sub-tick remainder is deferred instead of destroyed. That makes the journal
// self-checking: the NEXT window's `from` must equal the watermark the PREVIOUS
// window's own numbers imply. The tick, settling every 10 s, is about to become
// the highest-frequency producer of exactly those boundaries, so "the tick
// agrees with settledWatermarkMs" is the load-bearing claim — and this file
// checks it against 14 days of real windows rather than against a fixture.
//
// PURE ESM. No `?v=` (not under src/**).
// ============================================================================

import { settledWatermarkMs } from '../../supabase/functions/hr-accrue/accrual.js';

/* The fields a value replay would need and the journal does not carry. Stated
   as data, not prose, so the guard can assert the list has not silently shrunk
   to make a replay "work". */
export const MISSING_FOR_VALUE_REPLAY = Object.freeze([
  'start_hp', 'start_max_hp', 'start_skills', 'start_equipment',
  'start_inventory', 'start_fight', 'start_consec_falls', 'start_buffs',
  'seed', 'recover_ms', 'idle_ms',
]);

/* Of those, the two that are cheap, non-secret and would close the LARGEST
   bucket below are `recover_ms` and `idle_ms`: they are already computed by the
   simulation and thrown away at journal time, and without them a window that
   contained a death is arithmetically indistinguishable from a window whose
   watermark was computed wrongly. */
export const CHEAP_ADDITIONS = Object.freeze(['recover_ms', 'idle_ms']);

export const BUCKETS = Object.freeze([
  'watermark_exact',    // the next window's `from` IS settledWatermarkMs of this one
  'flush',              // watermark == now: capped / final / remainder >= tick / none left
  'gap',                // accrued_to moved forward between the two rows (another writer)
  'unaccounted',        // ms - deferral is not a whole number of ticks: recover/idle ms
  'watermark_mismatch', // the boundary disagrees with settledWatermarkMs — a REAL finding
  'no_ticks',           // the row reports no ticks; nothing to infer an interval from
]);

function ms(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function t(v) { const n = Date.parse(v); return Number.isFinite(n) ? n : null; }

/* Normalise one journal row into the window object the analysis works on.
   Returns null for a row that is not a settle window at all (the `worker` crew
   channel journals no from/to — it is priced off `workers_accrued_to`). */
export function toWindow(row) {
  const m = row && row.meta;
  if (!m) return null;
  const fromMs = t(m.from); const toMs = t(m.to);
  if (fromMs === null || toMs === null) return null;
  return {
    userId: row.user_id, slot: Number(row.slot), kind: row.kind,
    atMs: t(row.at), fromMs, toMs,
    spanMs: ms(m.ms), ticks: ms(m.ticks) || 0,
    capped: m.capped === true,
    stopped: m.stopped == null ? null : String(m.stopped),
    gold: ms((m.delta || {}).g) || 0,
    items: (m.delta || {}).i || {},
    xp: (m.delta || {}).x || {},
  };
}

/* ── THE REPLAY ─────────────────────────────────────────────────────────────
   For each (user, slot, kind) stream, walk consecutive windows and ask the one
   question the journal can answer on its own:

     given window i's own reported geometry (nowMs = to, grantMs = ms,
     capped) and its own reported work (ticks), does `settledWatermarkMs`
     return exactly the instant window i+1 started from?

   The tick interval is not journalled either, so it is INFERRED as
   `accounted / ticks` and only accepted when that is a positive integer and the
   deferral is strictly less than it — i.e. only when the arithmetic has exactly
   one consistent reading. Anything else is bucketed, never assumed. */
export function replayStream(windows) {
  const out = [];
  for (let i = 1; i < windows.length; i++) {
    const prev = windows[i - 1]; const cur = windows[i];
    const deferral = prev.toMs - cur.fromMs;
    const base = { at: prev.atMs, kind: prev.kind, deferral, spanMs: prev.spanMs, ticks: prev.ticks };
    if (deferral < 0) { out.push({ ...base, bucket: 'gap' }); continue; }
    if (deferral === 0) {
      /* The watermark was `now`. That is correct for (a) capped, (b) a final
         window, (c) a remainder >= one tick and (d) no remainder at all — all
         four of which `settledWatermarkMs` returns `nowMs` for. It is not
         further checkable without the tick interval, so it is not counted as a
         proof either way. */
      out.push({ ...base, bucket: 'flush' }); continue;
    }
    if (!(prev.ticks > 0)) { out.push({ ...base, bucket: 'no_ticks' }); continue; }
    const accounted = prev.spanMs - deferral;
    const tickMs = accounted / prev.ticks;
    if (!(tickMs > 0) || !Number.isInteger(tickMs) || deferral >= tickMs) {
      out.push({ ...base, bucket: 'unaccounted', accounted }); continue;
    }
    const got = settledWatermarkMs(
      { nowMs: prev.toMs, grantMs: prev.spanMs, capped: prev.capped },
      { ticks: prev.ticks }, tickMs, {},
    );
    out.push({
      ...base, tickMs, accounted,
      bucket: got === cur.fromMs ? 'watermark_exact' : 'watermark_mismatch',
      expected: got, actual: cur.fromMs,
    });
  }
  return out;
}

/* Group rows into (user, slot, kind) streams, ordered by `at`, and replay each.
   `rows` are raw journal rows as returned by the SELECT in
   tools/world-tick-replay.mjs. */
export function analyzeRows(rows) {
  const streams = new Map();
  let skipped = 0;
  for (const r of rows || []) {
    const w = toWindow(r);
    if (!w) { skipped++; continue; }
    const key = `${w.userId}|${w.slot}|${w.kind}`;
    if (!streams.has(key)) streams.set(key, []);
    streams.get(key).push(w);
  }
  const findings = [];
  for (const arr of streams.values()) {
    arr.sort((a, b) => a.atMs - b.atMs);
    findings.push(...replayStream(arr));
  }
  const byBucket = {};
  const byKind = {};
  for (const b of BUCKETS) byBucket[b] = 0;
  for (const f of findings) {
    byBucket[f.bucket] = (byBucket[f.bucket] || 0) + 1;
    const k = byKind[f.kind] || (byKind[f.kind] = {});
    k[f.bucket] = (k[f.bucket] || 0) + 1;
  }
  return {
    rows: (rows || []).length,
    windowsWithGeometry: (rows || []).length - skipped,
    streams: streams.size,
    pairs: findings.length,
    byBucket, byKind,
    mismatches: findings.filter((f) => f.bucket === 'watermark_mismatch'),
    unaccounted: findings.filter((f) => f.bucket === 'unaccounted'),
    tickMsSeen: [...new Set(findings.filter((f) => f.tickMs).map((f) => f.tickMs))].sort((a, b) => a - b),
  };
}

/* The verdict. A `watermark_mismatch` is the only bucket that is a FAILURE:
   every other bucket is a window the journal cannot speak about, and saying so
   is the point. `unaccounted` is a MEASUREMENT of the journalling gap, and it
   is reported as such rather than counted as a pass. */
export function verdict(a) {
  const proven = a.byBucket.watermark_exact || 0;
  const failed = a.byBucket.watermark_mismatch || 0;
  return {
    proven, failed,
    unprovable: a.pairs - proven - failed,
    ok: failed === 0 && proven > 0,
  };
}
