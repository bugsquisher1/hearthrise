// ============================================================================
// src/net/hr-clock.js — THE SERVER CLOCK, as a neutral read (2026-10-14).
//
// Until the clean-slate demolition the only server-corrected clock on the
// client lived inside src/features/muster.js (`HearthriseMuster.now()`), and
// the hunt panel borrowed it. The Muster is deleted, so the clock moves here,
// owned by nothing that can be deleted with a feature.
//
// NO RPC OF ITS OWN. Every envelope the server returns carries its `now`, and
// every envelope path already parks it on `G._serverAccrual` as
// `{ serverNow, at }` (the server's instant and the local receive instant).
// The skew is read from that pair: one source, no second request, nothing to
// gate on a session (muster's hr_server_now probe was 3,196 anonymous 42501s a
// day before b349 fenced it).
//
// DISPLAY ONLY (CLAUDE.md §6). A countdown may read this; no gate, intent or
// purchase may. The server decides with its own clock.
//
// Sub-1.5 s skews are treated as zero: the envelope `now` includes request
// latency, and "correcting" a healthy clock by it would add a permanent wobble
// (the same threshold the muster clock used).
// ============================================================================

export const MIN_SKEW_MS = 1500;

/** The device-to-server skew in ms that a `G._serverAccrual`-shaped record
    implies, or 0 when the record is missing or malformed. Pure. */
export function skewFrom(rec) {
  if (!rec || typeof rec !== 'object') return 0;
  const server = typeof rec.serverNow === 'number' ? rec.serverNow : Date.parse(rec.serverNow);
  const at = Number(rec.at);
  if (!Number.isFinite(server) || !Number.isFinite(at) || server <= 0 || at <= 0) return 0;
  const skew = server - at;
  return Math.abs(skew) < MIN_SKEW_MS ? 0 : skew;
}

function lastRecord() {
  try { return (globalThis.G && globalThis.G._serverAccrual) || null; } catch (e) { return null; }
}

/** The current server-corrected epoch ms. */
export function serverNow() { return Date.now() + skewFrom(lastRecord()); }

if (typeof window !== 'undefined') {
  window.HearthriseClock = Object.freeze({
    now: serverNow,
    skewMs: () => skewFrom(lastRecord()),
  });
}
