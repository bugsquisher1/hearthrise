// ════════════════════════════════════════════════════════════════════════
// src/shell/off-why.js — A PRESS ON A GREY BUTTON SAYS WHY, WHERE THE THUMB IS.
//
// Say-why (Tyler 2026-10-25, tests/say-why.mjs) keeps the reason on screen beside
// every control that is off, but on a phone that line is often off the sheet, and a
// `title` never shows at all (playtest 2026-10-31: "All five Take buttons were greyed
// with no reason shown"). On a phone or a touch screen a press on a control that is
// off shows the reason in a bubble beside it: the control's data-off-why, its title,
// or the why-line of the block it sits in. Off for a press in flight (no reason): no
// bubble. Display only; nothing here sends.
//
// A browser may keep every event from a disabled control, so the press is read from
// the point under the finger, at the document, before anything else sees it.
// ════════════════════════════════════════════════════════════════════════
import { MOBILE_QUERY } from '../world/core/camera.js?v=0.2.75';

const WHY_LINES = '.hw-why, .hb-buy-why, .hw-work-why, .hw-slot-why, .hw-fit-need';
const OFF = 'button:disabled';
const CLIMB = 4;
const READ_MS = 4000;
const EDGE_PX = 4;

/** The words for a control that is off, or ''. Exported for its rule (tests/phone-touch.mjs PH-13). */
export function offWords(b) {
  const own = b.getAttribute('data-off-why') || b.getAttribute('title');
  if (own) return own;
  for (let a = b.parentElement, i = 0; a && i < CLIMB; a = a.parentElement, i++) {
    for (const l of a.querySelectorAll(WHY_LINES)) if (l.textContent.trim()) return l.textContent.trim();
  }
  return '';
}

/** @param {Document} doc  @returns {{destroy(): void}} */
export function mountOffWhy(doc) {
  const win = doc.defaultView;
  const phone = win.matchMedia(MOBILE_QUERY);
  let bubble = null, leave = 0;

  function hide() { win.clearTimeout(leave); if (bubble) { bubble.remove(); bubble = null; } }
  function show(b, words) {
    hide();
    bubble = doc.createElement('p');
    bubble.className = 'hs-off-why';
    bubble.setAttribute('role', 'status');
    bubble.textContent = words;
    doc.body.appendChild(bubble);
    const r = b.getBoundingClientRect();
    const w = bubble.offsetWidth, h = bubble.offsetHeight;
    bubble.style.left = Math.round(Math.max(EDGE_PX, Math.min(win.innerWidth - w - EDGE_PX, r.left + r.width / 2 - w / 2))) + 'px';
    bubble.style.top = Math.round(r.top - h - EDGE_PX >= EDGE_PX ? r.top - h - EDGE_PX : Math.min(win.innerHeight - h - EDGE_PX, r.bottom + EDGE_PX)) + 'px';
    leave = win.setTimeout(hide, READ_MS);
  }
  function offAt(e) {
    const p = e.touches && e.touches[0] ? e.touches[0] : e;
    const direct = e.target && e.target.closest ? e.target.closest(OFF) : null;
    return direct || doc.elementsFromPoint(p.clientX, p.clientY).find((x) => x.matches(OFF)) || null;
  }
  function onPress(e) {
    if (!phone.matches && !doc.documentElement.classList.contains('is-touch')) return;
    const b = offAt(e);
    const words = b ? offWords(b) : '';
    if (words) show(b, words); else hide();
  }
  doc.addEventListener('pointerdown', onPress, true);
  return { destroy() { hide(); doc.removeEventListener('pointerdown', onPress, true); } };
}
