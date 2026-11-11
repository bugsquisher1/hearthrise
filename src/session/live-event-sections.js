// ════════════════════════════════════════════════════════════════════════
// src/session/live-event-sections.js — THE LIVE EVENTS AS THE SERVER STATES THEM (supabase/migrations/2027-03-22-live-events.sql §3).
//
// Reads the envelope's `live_events` section (hr_live_events_view): every event on now or starting within 7 days whose switch
// (hr_feature_switches: event_xp_bonus, event_open_halls) is on for this account. THE SWITCH IS THE SERVER'S: a switch off for
// everyone answers null, and null is no event at all, so a half-built or switched-off event shows nothing anywhere.
// Every envelope replaces the section; nothing here holds a number of its own. The dial (`pm`), the window (`starts`, `ends`)
// and the scope are the server's rows, bounded and nothing more. What a dial does is the server's (the settle, the quote).
// ════════════════════════════════════════════════════════════════════════

/* More rows than any week holds: a malformed section can't make the plate a wall. */
const MAX_ROWS = 12;
const DIALS = new Set(['xpPm', 'feePm']);
const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };

/**
 * The events the server lists for this hero: [{ id, type, dial, pm, scope, startsMs, endsMs, live }], or null when the server
 * sent none (every switch off, or nothing within the week). A row that is not well formed is left out, never guessed at.
 */
export function liveEventsOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('live_events') : null;
  if (!Array.isArray(s)) return null;
  const out = [];
  for (const e of s.slice(0, MAX_ROWS)) {
    if (!e || typeof e !== 'object') continue;
    const startsMs = at(e.starts), endsMs = at(e.ends);
    if (!id(e.id) || !id(e.type) || !DIALS.has(e.dial) || !Number.isSafeInteger(e.pm) || e.pm < 0 || startsMs === null || endsMs === null || endsMs <= startsMs) continue;
    const scope = Array.isArray(e.scope) ? e.scope.filter((x) => id(x)).slice(0, 32) : [];
    out.push({ id: e.id, type: e.type, dial: e.dial, pm: e.pm, scope, startsMs, endsMs, live: e.live === true });
  }
  return out.length ? out : null;
}
