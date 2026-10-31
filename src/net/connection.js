// ════════════════════════════════════════════════════════════════════════
// src/net/connection.js — IS THE SERVER REACHABLE? THE PAGE'S ONE ANSWER, IN WORDS.
//
// Phone playtest 2026-10-31: in a tunnel the game sat on "Loading the world…" for
// 35 s with no word, and a refused press was the only sign the signal had gone.
// Three states, display only (nothing gates on them; the server decides every ask):
//   lost   the browser says it is offline, or an ask just failed on the network
//   slow   an ask has been out for SLOW_MS with no answer
//   ok     anything else
// What feeds it: the browser's online / offline events and the server link's
// `watch` hook (src/session/server.js). A failed ask counts for LOST_FOR_MS: a
// hunt's polls keep renewing it, and a quiet town does not say "lost" for ever on
// the strength of one old failure. mountConnectionLine draws the one line on screen.
// ════════════════════════════════════════════════════════════════════════

const SLOW_MS = 8000;
const LOST_FOR_MS = 20000;
const TICK_MS = 1000;

export const CONNECTION_WORDS = Object.freeze({
  lost: 'No connection. Your heroes keep hunting. Reconnecting…',
  slow: 'Slow connection. Still trying…',
  loadingLost: 'No connection. Your heroes keep hunting on the server, and the world loads by itself when you are back online.',
  loadingSlow: 'Still loading the world. The connection is slow; your heroes keep hunting.',
});

/** The waiting world's line, from the state and how long it has waited (ms); `first` until there is more to say. Pure. */
export function loadingWords(state, waitedMs, first) {
  if (state === 'lost') return CONNECTION_WORDS.loadingLost;
  return state === 'slow' || waitedMs >= SLOW_MS ? CONNECTION_WORDS.loadingSlow : first;
}

/**
 * The state machine, over its clock and the browser's flag. Pure of the DOM.
 * @param {{now?: () => number, online?: () => boolean}} [o]
 */
function createConnection(o) {
  const opt = o || {};
  const now = opt.now || (() => Date.now());
  const online = opt.online || (() => true);
  const out = new Map();
  const subs = new Set();
  let seq = 0;
  let lostUntil = 0;
  let was = 'ok';
  function state() {
    const t = now();
    if (!online() || t < lostUntil) return 'lost';
    for (const at of out.values()) if (t - at >= SLOW_MS) return 'slow';
    return 'ok';
  }
  function check() {
    const s = state();
    if (s === was) return;
    was = s;
    for (const fn of subs) fn(s);
  }
  return {
    state,
    check,
    /** An ask left; its handle goes back with its end. */
    asked() { const id = ++seq; out.set(id, now()); return id; },
    answered(id) { out.delete(id); lostUntil = 0; check(); },
    failed(id) { out.delete(id); lostUntil = now() + LOST_FOR_MS; check(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/** The page's one connection (one page, one server). */
export const connection = createConnection({ online: () => typeof navigator === 'undefined' || navigator.onLine !== false });

/**
 * The one line on screen while the connection is lost or slow: a solid plate that takes no press, so nothing under it
 * stops working. Display only.
 * @param {Document} doc
 * @param {object} [conn]
 * @returns {{destroy(): void}}
 */
export function mountConnectionLine(doc, conn) {
  const c = conn || connection;
  const win = doc.defaultView;
  const line = doc.createElement('p');
  line.className = 'conn-line';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  doc.body.appendChild(line);
  const paint = (s) => {
    line.textContent = s === 'lost' ? CONNECTION_WORDS.lost : s === 'slow' ? CONNECTION_WORDS.slow : '';
    line.hidden = s === 'ok';
  };
  const off = c.subscribe(paint);
  const check = () => c.check();
  win.addEventListener('online', check);
  win.addEventListener('offline', check);
  const tick = win.setInterval(check, TICK_MS);
  paint(c.state());
  return {
    destroy() {
      off();
      win.removeEventListener('online', check);
      win.removeEventListener('offline', check);
      win.clearInterval(tick);
      line.remove();
    },
  };
}
