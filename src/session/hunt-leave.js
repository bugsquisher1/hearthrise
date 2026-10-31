// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-leave.js — A PENDING LEAVE'S CLOCK (pure, no DOM).
//
// hr_hunt_leave is always PENDING (2026-10-31-live-horizon.sql): the server
// closes the hunt at its leave_at, past the last combat swing the browser was
// shown. These read that instant against the SERVER's clock
// (CharacterSession.serverNow, never the device's): the hunt bar's countdown
// (src/shell/widgets/hunt-topbar.js) and when CharacterSession asks the
// settle that closes it. Display and timing only: nothing here is spent.
// ════════════════════════════════════════════════════════════════════════
import { SESSION_CONFIG } from './config.js?v=0.2.76';
import { leaveAtOf } from './hunt-sections.js?v=0.2.76';

/**
 * The leave's own answer (hr_hunt_view of the session it set leave_at on) as
 * { session, at }, or null. It lets the countdown start one round trip after
 * the press, before the settle that follows answers.
 */
export function leaveAskOf(s) {
  const at = s && typeof s === 'object' && typeof s.id === 'string' && typeof s.leave_at === 'string' ? Date.parse(s.leave_at) : NaN;
  return Number.isFinite(at) ? { session: s.id, at } : null;
}

/**
 * The pending leave's server instant (ms) of an OPEN hunt section: its own
 * leave_at, else the leave answer's for the same session; null when none.
 */
export function pendingLeaveAt(h, ask) {
  const at = leaveAtOf(h);
  if (at !== null) return at;
  return ask && h && typeof h === 'object' && ask.session === h.session_id ? ask.at : null;
}

/**
 * The pending leave as the hunt bar shows it. 'counting' with s >= 1 whole
 * seconds to leave_at (never 0, never negative); 'now' from leave_at until a
 * leaveLateMs past it (the closing settle is being asked); 'asked' while the
 * server's clock is unmeasured. 'late' (still processing) only once the SERVER
 * has said so past that mark, `heard` = { answered, out } (server instants or
 * null): an answer still holding the hunt open came at or after the mark, or an
 * ask sent before it is still out. A browser that only has not asked again says
 * 'now' (report #71: the server had closed the hunt before the bar said "Still
 * processing"); closeInMs asks once just past the mark.
 * @returns {{phase: 'counting'|'now'|'late'|'asked', s: number|null}}
 */
export function leaveCountdown(at, now, heard) {
  if (now === null || !Number.isFinite(now)) return { phase: 'asked', s: null };
  const left = at - now;
  if (left > 0) return { phase: 'counting', s: Math.ceil(left / 1000) };
  const mark = at + SESSION_CONFIG.leaveLateMs;
  const h = heard && typeof heard === 'object' ? heard : {};
  const told = (Number.isFinite(h.answered) && h.answered >= mark) || (Number.isFinite(h.out) && h.out < mark);
  return { phase: now >= mark && told ? 'late' : 'now', s: null };
}

/**
 * leaveCountdown's `heard` from CharacterSession's client instants: the latest
 * of `answers` (an envelope taken, a settle answered) and the send of the settle
 * still out (`out`, or null), each on the server's clock (timeline serverNowAt).
 */
export function heardOf(timeline, answers, out) {
  const last = Math.max(...answers.filter((t) => Number.isFinite(t)));
  return { answered: Number.isFinite(last) ? timeline.serverNowAt(last) : null,
    out: Number.isFinite(out) ? timeline.serverNowAt(out) : null };
}

/**
 * How soon (ms) to ask the settle that closes a pending leave: a hair after
 * leave_at; once it is past, again after leaveRetryMs or the time already past
 * it, whichever is longer (2 s, 2.4 s, 4.8 s, 9.6 s: four asks, not eight, in
 * every session of a leave-together party; live 10-23 a four-hero leave cost
 * 85 calls and 18 refusals), the last one clamped to a leaveSlackMs past the
 * leaveLateMs mark (16.4 s: the answer the bar's 'late' waits for), then null
 * (the ordinary poll goes on asking while the hunt is open). Null too when no
 * leave pends or the server's clock is unmeasured.
 */
export function closeInMs(at, now) {
  if (at === null || now === null || !Number.isFinite(now)) return null;
  const left = at - now;
  if (left > 0) return Math.ceil(left) + SESSION_CONFIG.leaveSlackMs;
  if (!(left > -SESSION_CONFIG.leaveLateMs)) return null;
  return Math.min(Math.max(SESSION_CONFIG.leaveRetryMs, Math.ceil(-left)), Math.ceil(SESSION_CONFIG.leaveLateMs + left) + SESSION_CONFIG.leaveSlackMs);
}
