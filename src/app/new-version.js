// ════════════════════════════════════════════════════════════════════════
// src/app/new-version.js — "A NEW VERSION IS OUT": ONE BANNER, ONE RELOAD.
//
// A tab left open across a release keeps running the build it loaded, and once
// the server half has moved on, an old client's asks are refused and its hero
// snaps back on every answer (Tyler, 2026-10-22). So every open tab asks which
// build the site serves now: src/build-info.js itself, fetched fresh (no-store,
// a `?n=<now>` query so no cache answers for it; readServed in
// src/session/server.js, the client's one network module). bump-version.sh writes that
// file on every release, so there is no second copy of the version to forget.
//
//   every checkEveryMs, on focus and when the tab becomes visible: one check
//   check(true)   a check right now, at most once per forcedGapMs: the server
//                 link calls it when an answer looks like a stale client's
//                 (src/session/server.js `stale`)
//
// When the served version is not the running one, ONE calm banner sits above
// the game, in flow (it pushes the game down; it never covers the action bar
// or a window): the line, Reload, and Later. Later hides it until the next
// check finds the same thing. Reload deletes every Cache Storage entry and
// unregisters every service worker (as src/platform/sw-killswitch.js does),
// then reloads. A failed check shows nothing: only a version the site states
// can raise the banner.
// ════════════════════════════════════════════════════════════════════════

import { BUILD } from '../build-info.js?v=0.2.71';
import { readServed } from '../session/server.js?v=0.2.71';

export const NEW_VERSION_COPY = Object.freeze({
  line: 'A new version of Hearthrise is out. Reload to get it.',
  reload: 'Reload',
  later: 'Later',
});

export const NEW_VERSION_TIMING = Object.freeze({ checkEveryMs: 3 * 60 * 1000, forcedGapMs: 30 * 1000 });

const SERVED = /\bversion:\s*'(\d+\.\d+\.\d+)'/;

/** The version a build-info.js text states, or null. Pure. */
export function servedVersionOf(text) {
  const m = typeof text === 'string' ? SERVED.exec(text) : null;
  return m ? m[1] : null;
}

/** Delete every Cache Storage entry and unregister every service worker; never throws. */
async function purge(win) {
  try {
    if (win.caches) await Promise.all((await win.caches.keys()).map((k) => win.caches.delete(k)));
  } catch (e) { /* nothing cached to clear */ }
  try {
    const sw = win.navigator && win.navigator.serviceWorker;
    if (sw) await Promise.all((await sw.getRegistrations()).map((r) => r.unregister()));
  } catch (e) { /* no worker to remove */ }
}

/**
 * Watch for a newer release and say so once.
 * @param {Window} win
 * @param {object} [o]
 * @param {string} [o.running]   the running version (BUILD.version)
 * @param {string} [o.url]       the served build-info.js
 * @param {typeof fetch} [o.fetch]   (a test's stand-in; the page's own fetch otherwise)
 * @param {() => number} [o.now]
 * @param {boolean} [o.timers]   false: no interval (a test drives check())
 * @returns {{ check(forced?: boolean): Promise<boolean>, shown(): boolean, reload(): Promise<void>, destroy(): void }}
 */
export function mountNewVersion(win, o = {}) {
  const doc = win.document;
  const running = o.running || BUILD.version;
  const url = o.url || new URL('../build-info.js', import.meta.url).href;
  const now = o.now || (() => Date.now());
  let el = null;
  let lastForced = -Infinity;
  let inFlight = null;
  let dead = false;

  function button(what, text, press) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'new-version-' + what;
    b.setAttribute('data-nv', what);
    b.textContent = text;
    b.addEventListener('click', press);
    return b;
  }

  function show() {
    if (!el) {
      el = doc.createElement('div');
      el.className = 'new-version';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      const line = doc.createElement('p');
      line.className = 'new-version-line';
      line.textContent = NEW_VERSION_COPY.line;
      el.appendChild(line);
      el.appendChild(button('reload', NEW_VERSION_COPY.reload, () => api.reload()));
      el.appendChild(button('later', NEW_VERSION_COPY.later, hide));
    }
    if (!el.parentNode) doc.body.insertBefore(el, doc.body.firstChild);
    doc.body.classList.add('has-new-version');
  }

  function hide() {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    doc.body.classList.remove('has-new-version');
  }

  async function ask() {
    const served = servedVersionOf(await readServed(url + '?n=' + now(), o.fetch));
    if (dead || !served || served === running) return false;
    show();
    return true;
  }

  const api = {
    check(forced) {
      if (dead) return Promise.resolve(false);
      if (forced) {
        if (now() - lastForced < NEW_VERSION_TIMING.forcedGapMs) return inFlight || Promise.resolve(api.shown());
        lastForced = now();
      }
      if (!inFlight) inFlight = ask().finally(() => { inFlight = null; });
      return inFlight;
    },
    shown: () => !!(el && el.parentNode),
    async reload() {
      await purge(win);
      win.location.reload();
    },
    destroy() {
      dead = true;
      if (timer !== null) win.clearInterval(timer);
      win.removeEventListener('focus', onWake);
      doc.removeEventListener('visibilitychange', onWake);
      hide();
    },
  };

  function onWake() { if (doc.visibilityState !== 'hidden') api.check(); }
  const timer = o.timers === false ? null : win.setInterval(() => api.check(), NEW_VERSION_TIMING.checkEveryMs);
  win.addEventListener('focus', onWake);
  doc.addEventListener('visibilitychange', onWake);
  return api;
}
