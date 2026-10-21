// ════════════════════════════════════════════════════════════════════════
// src/app/live-overlay.js — THE ?debug=live CORNER (tracker r21).
//
// Shown only when the page's URL carries ?debug=live (liveOverlayWanted). A
// small read-only panel in the bottom-left corner, for the viewed character:
//   env     the record's version and how long ago the last envelope or frame
//           was applied
//   ask     the last ask's verb, its press-to-ack time (the intent ledger:
//           send until the re-read envelope) and its verdict
//   open    how many asks are in flight now
//   settle  while a hunt is open: the server's clock less its settle watermark
//           (the last hunt_check / hunt_live settled_to_ms), the lag that
//           tools/hunt-health.local.mjs reads from the database
//   fps     frames drawn in the last second
// It reads; it never writes a record, sends an ask or publishes a global.
// ════════════════════════════════════════════════════════════════════════

/** Does this URL ask for the overlay? Pure. */
export function liveOverlayWanted(search) {
  try { return new URLSearchParams(String(search || '')).get('debug') === 'live'; } catch (e) { return false; }
}

const secs = (ms) => (ms < 10000 ? (ms / 1000).toFixed(1) : String(Math.round(ms / 1000))) + ' s';

/**
 * The overlay's lines from what it read. Pure.
 * @param {object} v  { version, ageMs, last: {verb, ms, ok, error}|null, open, lagMs, fps }
 */
function overlayLines(v) {
  const last = v.last;
  return [
    'env ' + (v.version === null ? '—' : 'v' + v.version + (v.ageMs === null ? '' : ' · ' + secs(v.ageMs) + ' ago')),
    'ask ' + (last ? last.verb + ' ' + last.ms + ' ms ' + (last.ok ? 'ok' : (last.error || 'refused')) : '—'),
    'open ' + v.open,
    'settle ' + (v.lagMs === null ? '—' : secs(Math.max(0, v.lagMs)) + ' behind'),
    'fps ' + (v.fps === null ? '—' : v.fps),
  ];
}

const APPLIED = Object.freeze(['load', 'hello', 'frame']);

/**
 * @param {Window} win
 * @param {object} account   the AccountSession (viewed, character(slot), intents)
 * @returns {{ destroy(): void }}
 */
export function mountLiveOverlay(win, account) {
  const doc = win.document;
  const box = doc.createElement('aside');
  box.className = 'live-overlay';
  box.setAttribute('aria-label', 'Live connection details');
  box.setAttribute('data-live-overlay', '');
  doc.body.appendChild(box);
  const lines = [];
  for (let i = 0; i < 5; i++) { const p = doc.createElement('p'); box.appendChild(p); lines.push(p); }

  const now = () => win.performance.now();
  let watched = null, unwatch = null, appliedAt = null;
  const watch = (cs) => {
    if (cs === watched) return;
    if (unwatch) unwatch();
    watched = cs;
    appliedAt = cs && cs.record ? now() : null;
    unwatch = cs ? cs.subscribe((s, why) => { if (APPLIED.includes(why)) appliedAt = now(); }) : null;
  };

  let frames = 0, fps = null, since = now(), raf = 0;
  const frame = () => { frames++; raf = win.requestAnimationFrame(frame); };
  raf = win.requestAnimationFrame(frame);

  function paint() {
    const t = now();
    if (t - since >= 1000) { fps = Math.round(frames * 1000 / (t - since)); frames = 0; since = t; }
    const cs = account.viewed === null ? null : account.character(account.viewed);
    watch(cs);
    const rec = cs ? cs.record : null;
    const h = cs ? cs.read('hunt') : null;
    const open = !!h && typeof h === 'object' && typeof h.session_id === 'string' && h.ended !== true;
    const settled = cs && cs.liveLink ? cs.liveLink.settledToMs : null;
    const serverNow = open && settled !== null ? cs.serverNow() : null;
    const text = overlayLines({ version: rec ? rec.version : null, ageMs: rec && appliedAt !== null ? t - appliedAt : null,
      last: account.intents.last(), open: account.intents.open(), lagMs: serverNow === null ? null : serverNow - settled, fps });
    text.forEach((s, i) => { if (lines[i].textContent !== s) lines[i].textContent = s; });
  }
  paint();
  const ticker = win.setInterval(paint, 250);
  const offAsk = account.intents.subscribe(() => paint());

  return {
    destroy() {
      win.clearInterval(ticker);
      win.cancelAnimationFrame(raf);
      offAsk();
      if (unwatch) unwatch();
      box.remove();
    },
  };
}
