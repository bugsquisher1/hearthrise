// ════════════════════════════════════════════════════════════════════════
// src/features/reveal-locks.js — A LOCKED DOOR SAYS WHY (window.HearthriseLocks).
//
// The progressive reveal (src/features/spine-reveal.js) no longer hides a door,
// pane or skill the player has not reached: each one is drawn LOCKED, dimmed
// with a padlock, and carries its reason ("Opens when you catch and cook five
// fish (Step 2).") in `data-reveal-locked`. Hovering shows the line; a click or
// a tap opens a small card with the line and a "Show me" button that does what
// the pointer bar's Go does (HearthriseSpine.go), so it only ever leads to the
// CURRENT step, whose doors are open by construction (guard R6).
//
// Renderers mark an element with `attr(reason)` (HTML strings) or
// `mark(el, reason)` (live nodes). A click on a marked element never reaches
// its own handler: this module stops it in the capture phase.
// ════════════════════════════════════════════════════════════════════════

const STYLE_ID = 'hr-locks-css';
const POP_ID = 'hr-lock-pop';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Attributes for an HTML string: '' when the reason is null (open). */
function attr(reason) {
  return reason ? ' data-reveal-locked="' + esc(reason) + '" aria-disabled="true" title="' + esc(reason) + '"' : '';
}

/** The padlock glyph, '' when the atlas has not loaded. */
function pad() {
  const svg = (window.HR && typeof window.HR.icon === 'function') ? (window.HR.icon('uiLock', 12, 'currentColor') || '') : '';
  return svg ? '<span class="hr-lockpad" aria-hidden="true">' + svg + '</span>' : '';
}

/** Lock or unlock a live element. Idempotent; returns whether it is locked. */
function mark(el, reason) {
  if (!el) return false;
  const was = el.getAttribute('data-reveal-locked');
  if (reason) {
    if (was !== reason) {
      el.setAttribute('data-reveal-locked', reason);
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('title', reason);
    }
    if (!el.querySelector(':scope > .hr-lockpad')) el.insertAdjacentHTML('beforeend', pad());
    return true;
  }
  if (was !== null) {
    el.removeAttribute('data-reveal-locked');
    el.removeAttribute('aria-disabled');
    el.removeAttribute('title');
    const p = el.querySelector(':scope > .hr-lockpad');
    if (p) p.remove();
  }
  return false;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '[data-reveal-locked]{opacity:.55;cursor:help}',
    '[data-reveal-locked]:hover{opacity:.75}',
    '.hr-lockpad{display:inline-flex;align-items:center;margin-left:6px;color:var(--ink-3);vertical-align:middle}',
    '.nav-btn[data-reveal-locked] .hr-lockpad{margin-left:auto}',
    '#' + POP_ID + '{position:fixed;z-index:9000;max-width:300px;padding:12px 14px;border-radius:var(--r);',
    'background:var(--bg-2);border:1px solid var(--line-strong);color:var(--ink);box-shadow:0 10px 30px -10px rgba(0,0,0,.85);',
    'font-family:var(--f-ui);font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.4}',
    '#' + POP_ID + ' .hr-lock-row{display:flex;gap:8px;align-items:flex-start}',
    '#' + POP_ID + ' .hr-lock-act{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}',
  ].join('\n');
  document.head.appendChild(s);
}

function close() { const p = document.getElementById(POP_ID); if (p) p.remove(); }

/** The card for one locked element: its reason, and the way to the current step. */
function open(el) {
  ensureStyle();
  close();
  const reason = el.getAttribute('data-reveal-locked');
  const S = window.HearthriseSpine;
  const canGo = !!(S && typeof S.go === 'function' && S.model && S.model() && !S.model().finished);
  const pop = document.createElement('div');
  pop.id = POP_ID;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Locked');
  pop.innerHTML = '<div class="hr-lock-row">' + pad() + '<div class="hr-lock-why">' + esc(reason) + '</div></div>' +
    '<div class="hr-lock-act">' +
    (canGo ? '<button type="button" class="btn btn-sm btn-primary" data-lock-act="go">Show me</button>' : '') +
    '<button type="button" class="btn btn-sm" data-lock-act="close">Close</button></div>';
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.right + 8 + w > innerWidth ? r.left : r.right + 8));
  const top = Math.max(8, Math.min(innerHeight - h - 8, r.right + 8 + w > innerWidth ? r.bottom + 6 : r.top));
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-lock-act]');
    if (!b) return;
    close();
    if (b.getAttribute('data-lock-act') === 'go') S.go();
  });
  return pop;
}

function onClick(e) {
  const pop = document.getElementById(POP_ID);
  if (pop && !pop.contains(e.target)) close();
  const el = e.target && e.target.closest && e.target.closest('[data-reveal-locked]');
  if (!el) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  open(el);
}

function setupRevealLocks() {
  ensureStyle();
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

if (typeof window !== 'undefined') {
  window.HearthriseLocks = Object.freeze({ attr, pad, mark, open, close });
  if (typeof document !== 'undefined') setupRevealLocks();
}
