// ════════════════════════════════════════════════════════════════════════
// src/session/live-event-sections.js — THE LIVE EVENTS AS THE SERVER STATES THEM (supabase/migrations/2027-03-22-live-events.sql §3).
//
// Reads the envelope's `live_events` section (hr_live_events_view, 1037-hearthrise.sql): the next window of every event within one
// cycle (28 days) whose switch (hr_feature_switches: event_xp_bonus, event_world_boss) is on for this account. THE SWITCH IS THE SERVER'S: a switch off for
// everyone answers null, and null is no event at all, so a half-built or switched-off event shows nothing anywhere.
// Every envelope replaces the section; nothing here holds a number of its own. The dial (`pm`), the window (`starts`, `ends`)
// and the scope are the server's rows, bounded and nothing more. What a dial does is the server's (the settle). A world boss's row has
// no dial (it opens his room and moves no number). The Hearthrise's pm is its lit size, or before it lights the size the fire would
// light at now (`lit` says which).
// ════════════════════════════════════════════════════════════════════════

/* More rows than any week holds: a malformed section can't make the plate a wall. */
const MAX_ROWS = 12;
const DIALS = new Set(['xpPm']);
const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };

/**
 * The events the server lists for this hero: [{ id, type, dial, pm, scope, startsMs, endsMs, live, sized, lit, boss }], or null when the server
 * sent none (every switch off, or nothing within the week). A row that is not well formed is left out, never guessed at.
 */
export function liveEventsOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('live_events') : null;
  if (!Array.isArray(s)) return null;
  const out = [];
  for (const e of s.slice(0, MAX_ROWS)) {
    if (!e || typeof e !== 'object') continue;
    const startsMs = at(e.starts), endsMs = at(e.ends);
    const dial = e.dial === null && id(e.boss) ? null : DIALS.has(e.dial) ? e.dial : undefined;
    if (!id(e.id) || !id(e.type) || dial === undefined || !Number.isSafeInteger(e.pm) || e.pm < 0 || startsMs === null || endsMs === null || endsMs <= startsMs) continue;
    const scope = Array.isArray(e.scope) ? e.scope.filter((x) => id(x)).slice(0, 32) : [];
    out.push({ id: e.id, type: e.type, dial, pm: e.pm, scope, startsMs, endsMs, live: e.live === true,
      sized: e.sized === 'fire' ? 'fire' : null, lit: e.lit === true, boss: dial === null ? e.boss : null });
  }
  return out.length ? out : null;
}

/**
 * THE GREAT HEARTH'S FIRE as the server states it (the `hearth_fire` section, 1037-hearthrise.sql hr_hearth_fire_view), or null while
 * the XP switch is off for this account or the section is malformed: { marks, of, fuel, goal, need, pm, full, next: {id, startsMs, endsMs}
 * | null, lit: {id, pm, startsMs, endsMs} | null }. `need` is the fuel to the next mark (null when full); `pm` the size it would light at now.
 */
export function fireOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('hearth_fire') : null;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const n = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
  const win = (w, withPm) => {
    if (!w || typeof w !== 'object' || !id(w.id)) return null;
    const startsMs = at(w.starts), endsMs = at(w.ends);
    if (startsMs === null || endsMs === null || endsMs <= startsMs || (withPm && n(w.pm) === null)) return null;
    return withPm ? { id: w.id, pm: w.pm, startsMs, endsMs } : { id: w.id, startsMs, endsMs };
  };
  if (n(s.marks) === null || n(s.of) === null || n(s.fuel) === null || n(s.goal) === null || n(s.pm) === null) return null;
  return { marks: s.marks, of: s.of, fuel: s.fuel, goal: s.goal, need: n(s.need), pm: s.pm, full: s.full === true,
    next: win(s.next, false), lit: win(s.lit, true) };
}
