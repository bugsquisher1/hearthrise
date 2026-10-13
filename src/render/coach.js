// ════════════════════════════════════════════════════════════════════════
// src/render/coach.js — THE COACH'S RING, CARD AND SCRIM (b573). One primitive.
//
// Three layers, created once and reused:
//   · the RING: a gold outline over a real control, gently pulsing, whose
//     outer shadow IS the light scrim, so the ringed control is the one bright
//     hole on the page;
//   · the CARD: title, one or two sentences, an optional count, its buttons and
//     "Skip guide", with a pointer arrow toward the ring. It auto-places below,
//     above or beside the anchor and never covers it; on a landscape phone it
//     docks to the half of the screen opposite the anchor, at most 40% tall;
//   · the GATE: while a card is up, a press anywhere but the ringed control,
//     the card itself or a dialog that control opened is swallowed and the
//     ring nudges instead. The caller supplies that "follow-through" test.
//
// Used by src/features/coach.js (First Steps) and by the spine bar's Go
// button (`flash`: the same ring, no card, no scrim, fades on its own).
// Skin: src/styles/coach.css (tokens only). Respects prefers-reduced-motion
// there; nothing here animates by script except a class swap.
//
// The root carries `ftue-root` on purpose: every front-door queue in the game
// (daily reward, name prompt, What's New, renown, primers, spoils) already
// waits while an element of that class is in the document, so the coach is
// waited on by all of them without a second selector in fourteen files.
// ════════════════════════════════════════════════════════════════════════

const GAP = 14;            // px between the ring and the card
const PAD = 6;             // px the ring stands off its control
const PHONE = '(max-height: 540px) and (max-width: 1024px), (max-width: 540px)';

let root = null, ring = null, card = null, flashRing = null;
let anchor = null, state = null, follow = null, timer = 0;

function doc() { return typeof document !== 'undefined' ? document : null; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Is this element on screen with a real box? */
export function laidOut(el) {
  if (!el || !el.isConnected || typeof el.getBoundingClientRect !== 'function') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
}

function ensure() {
  const d = doc();
  if (!d || !d.body) return false;
  if (root && root.isConnected) return true;
  root = d.createElement('div');
  root.className = 'ftue-root hr-coach-root';
  root.setAttribute('aria-live', 'polite');
  ring = d.createElement('div');
  ring.className = 'hr-coach-ring';
  ring.setAttribute('aria-hidden', 'true');
  card = d.createElement('div');
  card.className = 'hr-coach-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  root.appendChild(ring);
  root.appendChild(card);
  d.body.appendChild(root);
  d.addEventListener('pointerdown', gate, true);
  d.addEventListener('click', gate, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  return true;
}

/* ── THE GATE ─────────────────────────────────────────────────────────── */

/** May a press on `t` reach the page? */
export function allowed(t) {
  if (!state || !t || typeof t.closest !== 'function') return true;
  if (card && card.contains(t)) return true;
  if (anchor && (anchor === t || anchor.contains(t))) return true;
  return !!(follow && follow(t));
}

function gate(e) {
  if (allowed(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  if (e.type === 'click' && ring) {
    ring.classList.remove('is-nudge');
    void ring.offsetWidth;
    ring.classList.add('is-nudge');
  }
}

/* ── PLACEMENT ────────────────────────────────────────────────────────── */

function phone() { return !!(window.matchMedia && window.matchMedia(PHONE).matches); }

/**
 * WHERE THE CARD GOES, pure: the side of the anchor with room for the card,
 * clamped to the viewport, never overlapping the anchor's box. `a` is the
 * anchor rect (or null for a centred card), `c` the card's size, `v` the
 * viewport; on a phone the card docks beside the anchor, on the side with room.
 */
export function placement(a, c, v, isPhone) {
  const clampX = (x) => Math.max(8, Math.min(v.w - c.w - 8, x));
  const clampY = (y) => Math.max(8, Math.min(v.h - c.h - 8, y));
  if (!a) return { x: clampX((v.w - c.w) / 2), y: clampY((v.h - c.h) / 2), side: 'center' };
  const cx = a.left + a.width / 2, cy = a.top + a.height / 2;
  const room = { below: v.h - a.bottom - GAP, above: a.top - GAP, right: v.w - a.right - GAP, left: a.left - GAP };
  /* A landscape phone has height to spare least: it tries the sides first, and
     the card "docks" on whichever side of the anchor has the room. */
  const order = isPhone ? ['right', 'left', 'below', 'above'] : ['below', 'above', 'right', 'left'];
  const fits = order.filter((s) => ((s === 'below' || s === 'above') ? room[s] >= c.h : room[s] >= c.w));
  const side = fits.length ? fits[0] : order.reduce((b, s) => (room[s] > room[b] ? s : b), order[0]);
  if (side === 'below') return { x: clampX(cx - c.w / 2), y: Math.min(v.h - c.h - 8, a.bottom + GAP), side };
  if (side === 'above') return { x: clampX(cx - c.w / 2), y: Math.max(8, a.top - GAP - c.h), side };
  if (side === 'right') return { x: Math.min(v.w - c.w - 8, a.right + GAP), y: clampY(cy - c.h / 2), side, dock: isPhone };
  return { x: Math.max(8, a.left - GAP - c.w), y: clampY(cy - c.h / 2), side, dock: isPhone };
}

function place() {
  if (!state || !card) return;
  const v = { w: window.innerWidth, h: window.innerHeight };
  const a = (anchor && laidOut(anchor)) ? anchor.getBoundingClientRect() : null;
  if (a) {
    ring.style.transform = 'translate(' + Math.round(a.left - PAD) + 'px,' + Math.round(a.top - PAD) + 'px)';
    ring.style.width = Math.round(a.width + PAD * 2) + 'px';
    ring.style.height = Math.round(a.height + PAD * 2) + 'px';
    ring.classList.add('is-on');
    root.classList.remove('is-bare');
  } else {
    ring.classList.remove('is-on');
    root.classList.add('is-bare');
  }
  const c = { w: card.offsetWidth, h: card.offsetHeight };
  const p = placement(a, c, v, phone());
  card.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
  card.setAttribute('data-side', p.side);
  card.classList.toggle('is-docked', !!p.dock);
  const arrow = card.querySelector('.hr-coach-arrow');
  if (arrow && a) {
    const vertical = p.side === 'below' || p.side === 'above';
    const along = vertical ? (a.left + a.width / 2 - p.x) : (a.top + a.height / 2 - p.y);
    const max = (vertical ? c.w : c.h) - 22;
    arrow.style.setProperty('--at', Math.max(14, Math.min(max, along)) + 'px');
  }
}

/* A new anchor below the fold (a tile low in a grid, a phone's short screen)
   is scrolled to first, so the ring is never drawn on something off screen. */
function bringIntoView(el) {
  const r = el.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= window.innerHeight) return;
  /* The pane scrolls, never the page: the shell is a fixed frame, and moving
     the document would slide the top bar off the screen. */
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
      const box = p.getBoundingClientRect();
      /* Below the fold: lift it to the bottom edge. Above: drop it clear of
         whatever the pane keeps stuck to its top (the skill strip, a header). */
      const want = r.bottom > window.innerHeight ? p.scrollTop + (r.bottom - Math.min(box.bottom, window.innerHeight)) + 12
        : p.scrollTop + (r.top - box.top) - 72;
      const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      try { p.scrollTo({ top: Math.max(0, want), behavior: calm ? 'auto' : 'smooth' }); } catch (e) { p.scrollTop = Math.max(0, want); }
      return;
    }
  }
}

/* ── THE CARD ─────────────────────────────────────────────────────────── */

function cardHtml(s) {
  const btns = (s.buttons || []).map((b, i) =>
    '<button type="button" class="btn btn-sm' + (b.primary ? ' btn-primary' : '') + '" data-coach-btn="' + i + '">' + esc(b.label) + '</button>').join('');
  const prog = s.progress ? '<div class="hr-coach-prog"><span class="hr-coach-bar"><i style="width:'
    + Math.round(100 * Math.min(1, s.progress.have / Math.max(1, s.progress.need))) + '%"></i></span><b>'
    + esc(s.progress.label) + ' ' + esc(s.progress.text) + '</b></div>' : '';
  return '<span class="hr-coach-arrow" aria-hidden="true"></span>'
    + '<div class="hr-coach-head"><span class="hr-coach-step">' + esc(s.kicker || '') + '</span>'
    + '<span class="hr-coach-tick" aria-hidden="true"></span></div>'
    + '<div class="hr-coach-title">' + esc(s.title) + '</div>'
    + (s.lead ? '<div class="hr-coach-lead">' + esc(s.lead) + '</div>' : '')
    + '<div class="hr-coach-body">' + esc(s.body) + '</div>'
    + prog
    + '<div class="hr-coach-foot">' + (s.skip ? '<button type="button" class="hr-coach-skip" data-coach-skip>' + esc(s.skip) + '</button>' : '<span></span>')
    + '<span class="hr-coach-btns">' + btns + '</span></div>';
}

/**
 * SHOW ONE CARD. `s` = { key, kicker, title, lead, body, progress, buttons:
 * [{label, primary, on}], skip, onSkip, anchor, follow }. Re-showing the same
 * `key` updates in place (no re-entry animation); a new key slides in.
 */
export function show(s) {
  if (!ensure()) return null;
  const fresh = !state || state.key !== s.key;
  const moved = anchor !== (s.anchor || null);
  state = s;
  anchor = s.anchor || null;
  if (moved && anchor) bringIntoView(anchor);
  follow = typeof s.follow === 'function' ? s.follow : null;
  const html = cardHtml(s);
  if (card.__html !== html) {
    card.__html = html;
    card.innerHTML = html;
    card.querySelectorAll('[data-coach-btn]').forEach((b) => {
      b.addEventListener('click', (e) => { e.preventDefault(); const it = s.buttons[Number(b.getAttribute('data-coach-btn'))]; if (it && it.on) it.on(); });
    });
    const sk = card.querySelector('[data-coach-skip]');
    if (sk) sk.addEventListener('click', (e) => { e.preventDefault(); if (s.onSkip) s.onSkip(); });
  }
  card.setAttribute('aria-label', s.title);
  card.classList.toggle('has-lead', !!s.lead);
  root.classList.add('is-up');
  ring.classList.toggle('is-waiting', !!s.waiting);
  if (fresh) {
    card.classList.remove('is-in', 'is-done');
    void card.offsetWidth;
    card.classList.add('is-in');
  }
  place();
  if (!timer) timer = setInterval(place, 160);
  return card;
}

/** The small "done" moment: the tick draws, then `then` runs (the next card). */
export function celebrate(then, ms) {
  if (!card || !state) { if (then) then(); return; }
  card.classList.add('is-done');
  ring.classList.add('is-done');
  setTimeout(() => {
    if (card) card.classList.remove('is-done');
    if (ring) ring.classList.remove('is-done');
    if (then) then();
  }, ms == null ? 900 : ms);
}

/** Take the coach off the page (the controller decides whether for good). */
export function hide() {
  state = null; anchor = null; follow = null;
  if (timer) { clearInterval(timer); timer = 0; }
  if (root) { root.remove(); }
  root = null; ring = null; card = null;
  const d = doc();
  if (d) { d.removeEventListener('pointerdown', gate, true); d.removeEventListener('click', gate, true); }
  if (typeof window !== 'undefined') { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); }
}

export function isUp() { return !!state; }
export function currentAnchor() { return anchor; }

/**
 * THE SAME RING, NOTHING ELSE: no card, no scrim, no gate. The spine bar's
 * Go button rings where it sent the player for a moment and lets go.
 */
export function flash(el, ms) {
  const d = doc();
  if (!d || !d.body || !laidOut(el)) return null;
  if (flashRing) flashRing.remove();
  const r = el.getBoundingClientRect();
  flashRing = d.createElement('div');
  flashRing.className = 'hr-coach-ring is-on is-flash';
  flashRing.setAttribute('aria-hidden', 'true');
  flashRing.style.transform = 'translate(' + Math.round(r.left - PAD) + 'px,' + Math.round(r.top - PAD) + 'px)';
  flashRing.style.width = Math.round(r.width + PAD * 2) + 'px';
  flashRing.style.height = Math.round(r.height + PAD * 2) + 'px';
  d.body.appendChild(flashRing);
  const mine = flashRing;
  setTimeout(() => { mine.classList.add('is-leaving'); }, (ms || 2200) - 400);
  setTimeout(() => { mine.remove(); if (flashRing === mine) flashRing = null; }, ms || 2200);
  return mine;
}
