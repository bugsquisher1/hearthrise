// ════════════════════════════════════════════════════════════════════════
// src/net/diagnostics.js — WHAT THIS PAGE LOAD HAS SEEN GO WRONG (read-only).
//
// Started once per window by src/app/boot.js, on every host (localhost too):
// it sends nothing by itself. Two readers:
//   the Report a problem window (src/shell/windows/report.js) attaches recent()
//   and perf() to a player's report;
//   observability (src/net/observability.js) sends ONE Sentry message on the
//   first hang (onHang), where it sends at all.
//
//   recent()   the last RING_MAX console errors and warnings, uncaught errors and
//              unhandled rejections: [{ level, msg, at }] (msg cut to MSG_MAX)
//   perf()     { stalls, longestStallMs, longTasks, longestTaskMs } this load
//   fps(ms)    frames drawn over the next `ms` (a Promise; null when hidden)
//   onHang(fn) fn({ ms }) for each main-thread stall over HANG_MS
//
// THE HANG. A loop that never yields throws nothing, so no error handler ever
// sees it (Andy's frozen tab, 2026-10-21). A heartbeat every HEARTBEAT_MS
// measures how late it ran: late by more than HANG_MS while the tab stayed
// visible is a stall the player sat through. A hidden tab (timers throttled)
// resets the count, and a gap over SUSPEND_MS is a sleeping laptop, not a hang.
// A loop that NEVER returns cannot be reported from the page it froze.
// ════════════════════════════════════════════════════════════════════════

export const DIAG = Object.freeze({
  RING_MAX: 30,
  MSG_MAX: 500,
  HEARTBEAT_MS: 500,
  HANG_MS: 3000,
  SUSPEND_MS: 120000,
  JANK_MS: 1000,   // a stall the summary counts (perf().stalls)
});

const BY_WIN = new WeakMap();

/* One console argument as text: an Error by its name and message, anything else bounded. */
function textOf(a) {
  if (a instanceof Error || (a && typeof a === 'object' && typeof a.message === 'string' && typeof a.name === 'string')) return a.name + ': ' + a.message;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch (e) { return String(a); }
}

/**
 * The diagnostics of `win` (started on the first call; every later call answers the same one).
 * @param {Window} win
 */
export function startDiagnostics(win) {
  if (BY_WIN.has(win)) return BY_WIN.get(win);
  const doc = win.document;
  const perfNow = () => (win.performance ? win.performance.now() : Date.now());
  const ring = [];
  const hangFns = new Set();
  const stat = { stalls: 0, longestStallMs: 0, longTasks: 0, longestTaskMs: 0 };

  const note = (level, msg) => {
    ring.push({ level, msg: String(msg).slice(0, DIAG.MSG_MAX), at: Date.now() });
    if (ring.length > DIAG.RING_MAX) ring.shift();
  };

  /* Console errors and warnings are copied, never changed: the original is called first, as is. */
  const con = win.console;
  for (const level of ['error', 'warn']) {
    const orig = con && con[level];
    if (typeof orig !== 'function') continue;
    con[level] = function diagnosed(...args) {
      orig.apply(con, args);
      try { note(level, args.map(textOf).join(' ')); } catch (e) { /* never breaks a log */ }
    };
  }
  win.addEventListener('error', (ev) => note('error', ev.error ? textOf(ev.error) : String(ev.message || 'error')));
  win.addEventListener('unhandledrejection', (ev) => note('rejection', textOf(ev.reason)));

  /* The heartbeat: how late did this tick run? Visible the whole gap, or it does not count. */
  const visible = () => !doc || doc.visibilityState !== 'hidden';
  let last = perfNow();
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', () => { last = perfNow(); });
  const beat = () => {
    const t = perfNow();
    const late = t - last - DIAG.HEARTBEAT_MS;
    last = t;
    if (!visible() || late < DIAG.JANK_MS || late > DIAG.SUSPEND_MS) return;
    stat.stalls++;
    if (late > stat.longestStallMs) stat.longestStallMs = Math.round(late);
    if (late > DIAG.HANG_MS) for (const fn of Array.from(hangFns)) { try { fn({ ms: Math.round(late) }); } catch (e) { /* a reader's bug */ } }
  };
  win.setInterval(beat, DIAG.HEARTBEAT_MS);   // for the page's life, like the page itself

  /* Long tasks, where the browser reports them (Chromium): a count and the longest. */
  try {
    if (typeof win.PerformanceObserver === 'function') {
      new win.PerformanceObserver((list) => {
        for (const e of list.getEntries()) { stat.longTasks++; if (e.duration > stat.longestTaskMs) stat.longestTaskMs = Math.round(e.duration); }
      }).observe({ type: 'longtask', buffered: true });
    }
  } catch (e) { /* not supported here: the heartbeat still sees the stall */ }

  const api = Object.freeze({
    recent: () => ring.map((r) => Object.assign({}, r)),
    perf: () => Object.assign({}, stat),
    fps(ms = 1000) {
      if (!visible() || typeof win.requestAnimationFrame !== 'function') return Promise.resolve(null);
      return new Promise((resolve) => {
        let frames = 0;
        const t0 = perfNow();
        const tick = () => {
          if (perfNow() - t0 >= ms) { resolve(Math.round(frames * 1000 / (perfNow() - t0))); return; }
          frames++;
          win.requestAnimationFrame(tick);
        };
        win.requestAnimationFrame(tick);
        win.setTimeout(() => resolve(frames ? Math.round(frames * 1000 / ms) : null), ms + 500);   // rAF paused: answer anyway
      });
    },
    onHang(fn) { hangFns.add(fn); return () => hangFns.delete(fn); },
  });
  BY_WIN.set(win, api);
  return api;
}
