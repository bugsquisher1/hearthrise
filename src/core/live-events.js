// ============================================================
// src/core/live-events.js — A LIVE EVENT'S DIAL AT A KILL'S OWN TIME (lane/c-live-events; Tyler 2026-11-07 approved "live events from data").
//
// The server decides who an event is live for and when (2027-03-22-live-events.sql hr_live_xp_windows: a window holds the instant AND the
// type's switch is on for the hero's account), and hands each member its windows as [[fromMs, toMs, pm], ...]: the Level XP dial in force
// over [fromMs, toMs), already summed and capped by the server. This file only answers which window holds an instant, so the settle and the
// browser's live view pay a kill by its own combat time, never by when the settle ran (the designer's rule 2), viewed or not.
// No window holds the instant: 1000, the row as written. A malformed window is no window (the server's numbers, never repaired here).
//
// PURE ESM, dual-runtime. No clock, no randomness: the instant is the kill's (xp-share.js passes sc.atMs).
// ============================================================

/** The dial (permille) that `windows` ([[fromMs, toMs, pm], ...]) give at `atMs`; 1000 when none holds it. */
export function pmAt(windows, atMs) {
  if (!Array.isArray(windows) || !Number.isFinite(atMs)) return 1000;
  for (const w of windows) {
    if (!Array.isArray(w) || w.length !== 3) continue;
    const [from, to, pm] = w;
    if (Number.isFinite(from) && Number.isFinite(to) && Number.isInteger(pm) && pm >= 0 && atMs >= from && atMs < to) return pm;
  }
  return 1000;
}

/**
 * THE PER-HERO XP HOOK (xp-share.js `sc.xpMultOf(hero, atMs)`) for `sides` (member sides: { mi: { key }, member: { unitId } }), each
 * member's windows read by `windowsOf(side)`. Null when no member has a window, so a hunt with no event live runs exactly as before.
 */
export function xpMultFor(sides, windowsOf) {
  const live = (sides || []).map((s) => [s, windowsOf(s)]).filter(([, w]) => Array.isArray(w) && w.length);
  if (!live.length) return null;
  return (hero, atMs) => {
    const hit = live.find(([s]) => s.member && s.member.unitId === (hero && hero.id));
    return hit ? pmAt(hit[1], atMs) / 1000 : 1;
  };
}
