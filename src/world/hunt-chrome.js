// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-chrome.js — THE HUNT'S HTML OVERLAY: Analyzer, status, actions.
//
// EVERY NUMBER HERE IS THE SERVER'S. The Analyzer block is the last SETTLED
// reading (`G._huntAnalyzer`, written only by src/net/accrue.js hydrateHunt and
// REPLACED by each envelope), printed as sent and labelled with its age —
// "settled 12 s ago". Nothing here counts a kill or extrapolates a rate; a hunt
// that has not settled shows em-dashes, never zeroes (CLAUDE.md §6).
// The knockout line reads the server's `recovering_until`; while the server has
// not answered a fall it shows a pending mark, never a guessed clock.
//
// SHAPED FOR HUNT SESSIONS (HR-2026-10-14, lane B1): the overlay is a list of
// SECTIONS, each a pure model → HTML pair keyed by name. B1 adds `bag`,
// `actionbar` and swaps `analyzer` for the session Analyzer by adding rows
// to HUD_SECTIONS — the mount, the diffing and the actions stay.
// Eat and Leave Hunt call the handlers the caller passes (the Fight screen's
// own: eatBestProvision / stopCombat); the legacy HUD mounts are not moved.
// ════════════════════════════════════════════════════════════════════════

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const num = (v) => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : '—');
const signed = (v) => (v != null && Number.isFinite(Number(v)) ? (Number(v) > 0 ? '+' : '') + num(v) : '—');

/** "12 s ago", "4 min ago", "2 h ago" — the age of a server timestamp at `now`. */
function settledAgo(iso, now) {
  const at = Date.parse(String(iso || ''));
  if (!Number.isFinite(at)) return null;
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return s + ' s ago';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  return Math.floor(s / 3600) + ' h ago';
}

const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/**
 * The overlay's model. PURE.
 * @param {{analyzer: object|null, title: string, down: {phase, until}|null, now: number}} o
 */
export function hudModel(o) {
  const a = o.analyzer && typeof o.analyzer === 'object' ? o.analyzer : null;
  const ago = a && settledAgo(a.settled_at, o.now);
  const d = o.down;
  let status = null;
  if (d && d.phase === 'recovering' && d.until > o.now) status = { kind: 'down', text: 'Knocked out · back on your feet in ' + clock(d.until - o.now) };
  else if (d && d.phase === 'pending') status = { kind: 'pending', text: 'Knocked out · waiting for the realm' };
  return {
    analyzer: {
      title: o.title,
      rows: [
        ['Kills', num(a && a.kills)],
        ['XP / hour', num(a && a.xp_per_h)],
        ['Loot value', a && a.loot_value != null ? num(a.loot_value) + ' gp' : '—'],
        ['Profit / hour', a && a.profit_per_h != null ? signed(a.profit_per_h) + ' gp' : '—'],
      ],
      honesty: ago ? 'settled ' + ago : 'nothing settled yet',
    },
    status,
    actions: [{ act: 'eat', label: 'Eat' }, { act: 'leave', label: 'Leave Hunt' }],
  };
}

/** The sections, in paint order. B1 adds its own rows here. */
export const HUD_SECTIONS = Object.freeze([
  ['analyzer', (m) => m.analyzer && '<section class="whud-analyzer" aria-label="Hunt analyzer"><h3 class="whud-title">' + esc(m.analyzer.title) + '</h3><dl class="whud-rows">'
    + m.analyzer.rows.map(([k, v]) => '<div class="whud-row"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('')
    + '</dl><p class="whud-honesty">' + esc(m.analyzer.honesty) + '</p></section>'],
  ['status', (m) => m.status && '<p class="whud-status is-' + m.status.kind + '" role="status">'
    + (m.status.kind === 'pending' ? '<span class="whud-pending" aria-hidden="true"></span>' : '') + esc(m.status.text) + '</p>'],
  ['actions', (m) => '<div class="whud-actions">' + m.actions.map((b) => '<button type="button" class="whud-btn is-' + b.act + '" data-whud="' + b.act + '">' + esc(b.label) + '</button>').join('') + '</div>'],
]);

/** The overlay as HTML. PURE. */
export function hudHtml(m) {
  return HUD_SECTIONS.map(([, fn]) => fn(m) || '').join('');
}

/**
 * Mount the overlay in the stage. paint(model) repaints only when the HTML
 * changed; actions go to `on[act]()`.
 * @param {HTMLElement} stage
 * @param {{doc: Document, on: {[act: string]: () => void}}} o
 */
export function createHuntChrome(stage, o) {
  const el = o.doc.createElement('div');
  el.className = 'world-hud';
  el.hidden = true;
  stage.appendChild(el);
  let last = '';
  const onClick = (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-whud]');
    const fn = b && o.on[b.getAttribute('data-whud')];
    if (fn) fn();
  };
  el.addEventListener('click', onClick);
  return {
    paint(model) {
      el.hidden = !model;
      const html = model ? hudHtml(model) : '';
      if (html !== last) { el.innerHTML = html; last = html; }
    },
    text: () => el.textContent,
    destroy() { el.removeEventListener('click', onClick); el.remove(); },
  };
}
