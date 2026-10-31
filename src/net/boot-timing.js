// ════════════════════════════════════════════════════════════════════════
// src/net/boot-timing.js — HOW LONG A REAL PLAYER WAITED, SO NOBODY HAS TO GUESS (telemetry only).
//
// One `boot_timing` PostHog event per page load that signed back in from a stored session
// (a reload or a return; a sign-in's wait is the player typing). Each `_ms` is since the page began:
//   auth_ready_ms       the session is known
//   first_read_sent_ms  the token for the first server call is in hand: the call leaves now
//   roster_read_ms      the roster's reads have all answered
//   drawn_ms            the first screen to act on is drawn; `screen` says which ('characters', or 'game' when a
//                       reload reopened its heroes)
//   lock_asked, lock_wait_ms, lock_steals  what this page spent on the other tabs (src/net/auth-lock.js, its stats)
//   visibility          the tab's state when sent; `was_hidden` if it was hidden at any point in this boot (a hidden
//                       tab's timers are slowed, so its numbers are not a player waiting); `focused`
//   navigation          'reload', 'navigate', 'back_forward'
//   longest_stall_ms, long_tasks, longest_task_ms  how late the page's own heartbeat ran so far (src/net/diagnostics.js). A big
//                       stall with no long task is a page the machine did not run: a backgrounded or throttled window can
//                       still read 'visible' and focused (seen on the local world, 63-97 s to the roster)
// No personal data: numbers and these fixed words. Nothing in the game reads it back (§1). It goes out through
// observability's track, so a host that sends nothing sends none of this, and it carries the account id like any event.
// ════════════════════════════════════════════════════════════════════════
import { track } from './observability.js?v=0.2.78';
import { BUILD } from '../build-info.js?v=0.2.78';

/**
 * @param {Window} win
 * @param {object} o
 * @param {() => { asked: number, waitedMs: number, steals: number }} o.lockStats
 * @param {() => { longestStallMs: number, longTasks: number, longestTaskMs: number }} o.perf  diagnostics' perf()
 * @param {(name: string, props: object) => void} [o.send]  defaults to observability's track
 */
export function createBootTiming(win, o) {
  const send = o.send || track;
  const doc = win.document;
  const at = () => Math.round(win.performance.now());
  const marks = { auth: null, sent: null, read: null };
  let wanted = false;
  let done = false;
  let hidden = doc.visibilityState === 'hidden';
  const onVisibility = () => { if (doc.visibilityState === 'hidden') hidden = true; };
  doc.addEventListener('visibilitychange', onVisibility);
  const finish = () => { done = true; doc.removeEventListener('visibilitychange', onVisibility); };

  return {
    /** The session is known. `stored`: signed back in from it; no event for any other boot. */
    authReady(stored) {
      if (marks.auth !== null) return;
      marks.auth = at();
      wanted = stored === true;
      if (!wanted) finish();
    },
    sending() { if (wanted && !done && marks.sent === null) marks.sent = at(); },
    read() { if (wanted && !done && marks.read === null) marks.read = at(); },
    /** The first screen to act on is drawn: the event goes out, once. */
    drawn(screen) {
      if (!wanted || done) return;
      const stats = o.lockStats();
      const perf = o.perf();
      const nav = win.performance.getEntriesByType ? win.performance.getEntriesByType('navigation')[0] : null;
      send('boot_timing', {
        auth_ready_ms: marks.auth, first_read_sent_ms: marks.sent, roster_read_ms: marks.read, drawn_ms: at(), screen,
        lock_asked: stats.asked, lock_wait_ms: stats.waitedMs, lock_steals: stats.steals,
        visibility: doc.visibilityState, was_hidden: hidden || doc.visibilityState === 'hidden',
        focused: typeof doc.hasFocus === 'function' ? doc.hasFocus() : null,
        navigation: nav ? nav.type : null, version: BUILD.version,
        longest_stall_ms: perf.longestStallMs, long_tasks: perf.longTasks, longest_task_ms: perf.longestTaskMs,
      });
      finish();
    },
  };
}
