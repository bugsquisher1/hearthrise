// ════════════════════════════════════════════════════════════════════════
// src/net/auth-lock.js — THE LOCK SUPABASE-JS USES (its `auth.lock` option).
//
// Left to itself, supabase-js runs EVERY auth step (its start-up, each getSession, the
// 30 s refresh tick, sign-out) under one cross-tab Web Lock, and takes it back by
// force after 5 s. Any tab can hold that up: a frozen tab keeps its lock and its queue
// for as long as it is frozen, and each request in its queue is granted to it in turn
// after a steal, so one frozen tab costs a waiter 5 s again and again (QA on live
// v0.2.75: one to three 'Lock "lock:hr-auth" was not released' warnings per load).
//
// All the Web Lock really protects is the refresh token: it rotates when used, and
// two tabs rotating it at once can end the session. So:
//   a session that still lasts   no step can refresh it, so no step asks the other
//                                tabs for anything: nothing this tab or any other
//                                is doing can hold it up
//   one in its refresh window,   the step takes the Web Lock: one refresher across
//   or a forced refresh          the device, and the next tab finds the new token
//   no session                   nothing to rotate
// Inside this page the steps still run one at a time, in order: supabase-js's own
// bookkeeping (lockAcquired) counts on it.
//
// A HOLDER THAT NEVER LETS GO (a frozen tab, a fetch that never answers) is waited for
// for supabase-js's own timeout, then passed, once: the token is fresh after that, so
// nothing asks again. Not sooner, since a live refresher on a slow link may need the time
// and two rotating at once is the very thing the lock is for. A step whose lock is stolen
// keeps going and its answer stands: only the lock was taken, not the work.
// REFRESH_WINDOW_MS is wider than supabase-js's own reach (it refreshes under 120 s
// left), so a step let through without the lock cannot be the one that refreshes.
// ════════════════════════════════════════════════════════════════════════

/** A stored session with less than this left may be refreshed by the step about to run. */
const REFRESH_WINDOW_MS = 180000;

/** What supabase-js's refresh tick (timeout 0) expects when the lock is busy: it skips that tick. */
function busy(name) {
  const e = new Error('The auth lock "' + name + '" is busy');
  e.isAcquireTimeout = true;
  return e;
}

/**
 * @param {object} o
 * @param {LockManager} [o.locks]              navigator.locks (absent: this page's own queue alone)
 * @param {() => number|null} o.expiresAt      the stored session's expires_at, in seconds, or null when there is none
 * @param {() => number} [o.now]               the clock, for tests
 * @param {typeof setTimeout} [o.setTimer]     for tests
 * @param {typeof clearTimeout} [o.clearTimer]
 * @param {() => number} [o.mono]              a monotonic clock for what was waited, for tests
 */
export function createAuthLock(o) {
  const now = o.now || (() => Date.now());
  const mono = o.mono || (() => (globalThis.performance ? globalThis.performance.now() : Date.now()));
  const setTimer = o.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer || ((t) => clearTimeout(t));
  const stats = { asked: 0, waitedMs: 0, steals: 0 };
  let tail = Promise.resolve();
  let inQueue = 0;
  let forced = 0;

  function refreshDue() {
    if (forced > 0) return true;
    const at = o.expiresAt();
    return Number.isFinite(at) && at * 1000 - now() < REFRESH_WINDOW_MS;
  }

  async function acrossTabs(name, timeout, fn) {
    stats.asked++;
    let work = null;
    const hold = () => { work = fn(); return work; };
    if (timeout === 0) {
      return o.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (got) => { if (!got) throw busy(name); return hold(); });
    }
    const asked = mono();
    const stop = new AbortController();
    const timer = timeout > 0 ? setTimer(() => stop.abort(), timeout) : null;
    try {
      return await o.locks.request(name, { mode: 'exclusive', signal: stop.signal }, () => {
        clearTimer(timer);
        stats.waitedMs += Math.round(mono() - asked);
        return hold();
      });
    } catch (e) {
      clearTimer(timer);
      if (work) return work;   // stolen from us mid-step: the work is still ours to finish
      if (!stop.signal.aborted) throw e;
      stats.waitedMs += Math.round(mono() - asked);
      stats.steals++;
      return o.locks.request(name, { mode: 'exclusive', steal: true }, hold);
    }
  }

  /* The step before this one has settled, or `timeout` has passed (a step that never ends must not end the page's auth). */
  function turnOf(prev, timeout) {
    if (!(timeout > 0)) return prev;
    return new Promise((res) => {
      const t = setTimer(res, timeout);
      prev.then(() => { clearTimer(t); res(); });
    });
  }

  return {
    /** supabase-js's `auth.lock`: run fn as this page's next auth step. */
    lock(name, timeout, fn) {
      if (timeout === 0 && inQueue > 0) return Promise.reject(busy(name));
      const prev = tail;
      inQueue++;
      const mine = (async () => {
        await turnOf(prev, timeout);
        return o.locks && refreshDue() ? acrossTabs(name, timeout, fn) : fn();
      })();
      const done = mine.then(() => {}, () => {}).then(() => { inQueue--; });
      tail = done;
      return mine;
    },
    /** Run fn with every step it starts under the Web Lock: a forced refresh of a token whose expiry says it still lasts. */
    async refreshing(fn) {
      forced++;
      try { return await fn(); } finally { forced--; }
    },
    /** What this page has spent on the other tabs so far: { asked, waitedMs, steals }. */
    stats: () => Object.assign({}, stats),
  };
}
