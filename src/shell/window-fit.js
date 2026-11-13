// ════════════════════════════════════════════════════════════════════════
// src/shell/window-fit.js — A WINDOW OPENS WHOLE: NOTHING IN IT IS CUT OFF BY THE FRAME, THE BAR OR THE SCREEN.
//
// Tyler 2026-11-11, the Hunts window at 1014x652: "when I open a menu, part of it shouldn't automatically be cut off
// like this." The shell's one rule for every window (docked, floating, modal or a phone's sheet), applied here after
// each layout pass and each repaint:
//   1. HEIGHT. A window is as tall as its content, up to the World less its margins, never taller. A docked window
//      ends above the bottom bar (hud.js dockCap, so a window that grows never moves the bar) only while that leaves
//      it DOCK_ROOM_PX or more; on a shorter World a window whose content needs more rises over the bar, which stays
//      where it is, under it (window-manager.js overBar). A floating window is held wholly inside the World.
//   2. A STICKY FOOT TAKES ITS OWN ROOM. A foot that sticks to a scroll region's bottom (Enter, Save, Send) is measured
//      out of that region's visible height, so the row it would lie on counts as cut.
//   3. A WHOLE ROW AT THE FOOT. As it opens (never once the player has scrolled or pressed in it) a scroll region shows no row cut through: it ends on the top of the row its
//      foot line crosses (that row starts below, whole, one scroll away). Rows are found, not declared: the outermost box
//      the line crosses that is repeated beside its like (a list's line, a bag's slot, a creature grid's card, a
//      paragraph among paragraphs), so no window lists its rows. Display only: nothing here reads or writes the game.
// mutant-anchors: tests/alpha-windows.mjs AW-90
// ════════════════════════════════════════════════════════════════════════
import { dockCap } from './hud.js?v=0.2.128';
import { overBar } from './window-manager.js?v=0.2.128';

const TRIM = 'data-hs-trim';
/* The scroll regions a player has scrolled, pressed in or wheeled over: their height is theirs from then on. */
const held = new WeakSet();
const HOLD = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
const watched = new WeakSet();
function watch(frame, view) {
  if (watched.has(frame)) return;
  watched.add(frame);
  const take = (ev) => { for (let a = ev.target; a && a !== frame; a = a.parentElement) if (a.hasAttribute && scrolls(a, view)) held.add(a); };
  for (const type of HOLD) frame.addEventListener(type, take, { passive: true, capture: true });
}
/* A row hidden by this little is whole to the eye (its border, its pad). */
const CUT_MIN_PX = 4;
/* A region never gives up more than this share of its height to end on a whole row, and more than half of that only while it keeps
   READ_MIN_PX: a row taller is read by
   scrolling, and a phone's ground page keeps its room to read (tests/phone-touch.mjs PH-25). */
const ROW_SHARE = 0.5;
const READ_MIN_PX = 200;
const FLOW_OUT = /^(sticky|absolute|fixed)$/;

/** The height a docked window counts for the widgets beside it: over the bar, only the part above it (the bar stays put). */
export function dockedHeight(w) {
  const cap = Number(w.getAttribute('data-hs-over'));
  return cap > 0 ? Math.min(cap, w.offsetHeight) : w.offsetHeight;
}

/** Rule 1 for the docked windows in `layer` (desktop): each one's max height, from the bottom bars under it (`bars`, the shell's px). */
export function fitDocked(layer, bars, gap) {
  for (const w of layer.querySelectorAll('.hs-win:not(.is-floating):not(.is-modal)')) {
    const cap = bars.length ? dockCap({ left: w.offsetLeft, top: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight }, bars, gap) : null;
    let over = false;
    if (cap !== null && overBar(cap, Infinity)) {
      /* what it needs: its height with no cap and no trims (the frame's own CSS still holds it inside the World) */
      clearTrims(w);
      if (w.style.maxHeight) w.style.maxHeight = '';
      over = overBar(cap, w.offsetHeight);
    }
    const v = cap === null || over ? '' : cap + 'px';
    if (w.style.maxHeight !== v) w.style.maxHeight = v;
    if (over) w.setAttribute('data-hs-over', String(cap)); else w.removeAttribute('data-hs-over');
    trimEnds(w);
  }
  for (const w of layer.querySelectorAll('.hs-win.is-floating:not(.is-home)')) holdInside(w, layer, gap);
  for (const w of layer.querySelectorAll('.hs-win.is-modal')) trimEnds(w);
}

/* Rule 1 for a floating window: its foot inside the World, its head first (the place the manager keeps is unchanged). */
function holdInside(w, layer, gap) {
  const room = layer.clientHeight - gap;
  if (w.offsetTop + w.offsetHeight > room) w.style.top = Math.max(0, room - w.offsetHeight) + 'px';
  trimEnds(w);
}

/** Undo every trim inside `root`, so the frame is measured as its content draws it. */
function clearTrims(root) {
  for (const e of root.querySelectorAll('[' + TRIM + ']')) if (!held.has(e)) { e.style.maxHeight = ''; e.removeAttribute(TRIM); }
}

/** Rules 2 and 3 for one window: each scroll region in it ends on a whole row. Run after a layout pass and a repaint. */
export function trimEnds(frame) {
  if (!frame || frame.classList.contains('is-sized')) return;   // a window the player sized (Chat) keeps the size it was given
  const view = frame.ownerDocument.defaultView;
  watch(frame, view);
  clearTrims(frame);
  /* outer regions first (document order): a region that a nested one crosses gives the nested one the cut */
  for (const s of frame.querySelectorAll('*')) {
    if (held.has(s) || !scrolls(s, view)) continue;   // a region the player has touched keeps its height: nothing moves under the hand
    const at = restCut(s, view);
    if (at) shrink(at.el, at.cut, view);
  }
}

/* Does `e` scroll on y, with more than it shows? */
function scrolls(e, view) {
  if (!e.clientHeight || e.scrollHeight <= e.clientHeight + 1 || /^(TEXTAREA|SELECT|INPUT)$/.test(e.tagName)) return false;
  const oy = view.getComputedStyle(e).overflowY;
  return oy === 'auto' || oy === 'scroll';
}

/* The boxes laid out inside `node`: its children, a `display: contents` child's own children in its place. */
function boxesIn(node, view) {
  const out = [];
  for (const k of node.children) {
    if (view.getComputedStyle(k).display === 'contents') out.push(...boxesIn(k, view));
    else out.push(k);
  }
  return out;
}

/* Is `el` a block of its own words (a paragraph), not a control? */
function ownWords(el) {
  return !/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && Array.prototype.some.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim() !== '');
}

/* `el` gives up `cut` px of its height (a max height in its own box sizing), marked so the next pass starts from its CSS. */
function shrink(el, cut, view) {
  const cs = view.getComputedStyle(el);
  const box = cs.boxSizing === 'border-box' ? el.offsetHeight : el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  el.style.maxHeight = Math.max(0, Math.floor(box - cut)) + 'px';
  el.setAttribute(TRIM, '');
}

/* What region `s` must give up so that, at rest, no row is cut at its foot line: { el, cut }, or null when none is.
   `el` is `s`, or the nested scroll region the line crosses (it ends at the line; its own rows are its own pass). */
function restCut(s, view) {
  const r = s.getBoundingClientRect();
  const edge = r.top + s.clientTop;                  // the region's visible top, in the view
  const origin = edge;                               // rows as they stand in view now (at rest, or where the window scrolled them, the pick)
  /* rule 2: a foot stuck to the region's bottom (Enter, Save, Send: sticky, three levels deep at most) takes its own room */
  let line = s.clientHeight;
  for (const f of s.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *')) {
    const fs = view.getComputedStyle(f);
    if (fs.position !== 'sticky' || fs.bottom === 'auto') continue;
    const q = f.getBoundingClientRect();
    if (q.height && q.bottom >= edge + s.clientHeight - 2) line = Math.min(line, q.top - edge);
  }
  /* rule 3: the rows the line crosses, in every column it crosses (a builder's two columns, a list beside a page). A row is
     a box repeated beside its like (a list's line, a grid's card, a paragraph among paragraphs; same tag, same first class):
     the outermost one that ends whole within the share (a row, not a cell in it; a repeated section too tall to give up is
     looked into). A box of its own words with no row inside ends on a whole line. A line through a gap cuts nothing. */
  const share = s.clientHeight * ROW_SHARE;
  const ok = (cut) => cut <= share && (cut <= share / 2 || s.clientHeight - cut >= READ_MIN_PX);
  let nested = null;
  const need = (node, depth) => {
    let most = 0;
    if (depth > 12) return 0;
    const kids = boxesIn(node, view);
    for (const k of kids) {
      if (FLOW_OUT.test(view.getComputedStyle(k).position)) continue;
      const q = k.getBoundingClientRect();
      if (!q.height) continue;
      const t = q.top - origin, b = q.bottom - origin;
      if (!(t < line - CUT_MIN_PX && b > line + CUT_MIN_PX)) continue;
      if (scrolls(k, view)) { if (!held.has(k) && b - line <= k.clientHeight * ROW_SHARE) nested = { el: k, cut: Math.ceil(b - line) }; continue; }
      const whole = Math.ceil(line - t);
      if (kids.some((o) => o !== k && o.tagName === k.tagName && o.classList[0] === k.classList[0]) && ok(whole)) { most = Math.max(most, whole); continue; }
      const inner = need(k, depth + 1);
      if (inner) { most = Math.max(most, inner); continue; }
      if (ownWords(k)) {
        const rs = view.getComputedStyle(k);
        const lh = parseFloat(rs.lineHeight) || parseFloat(rs.fontSize) * 1.2;
        const first = t + parseFloat(rs.borderTopWidth) + parseFloat(rs.paddingTop);
        most = Math.max(most, lh > 0 && line > first ? Math.ceil((line - first) % lh) : whole);
      }
    }
    return most;
  };
  /* a cut in one column moves the line for the others: cut again until no row crosses it */
  let cut = 0;
  for (let pass = 0; pass < 4; pass++) {
    const more = need(s, 0);
    if (nested) return nested;
    if (more <= CUT_MIN_PX) break;
    cut += more;
    line -= more;
  }
  return cut > CUT_MIN_PX && ok(cut) ? { el: s, cut } : null;
}
