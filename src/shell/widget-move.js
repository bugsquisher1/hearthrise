// ════════════════════════════════════════════════════════════════════════
// src/shell/widget-move.js — MOVE A HUD WIDGET BY ITS TITLE, FOLD IT TO THAT TITLE.
//
// Tyler 2026-10-25: "need to be able to move and minimize hunt analyzer and Tally";
// every widget is movable (10-15). A widget opts in through its own markup, so the
// next one is a two-attribute change, not code:
//   [data-hs-wdrag]          its title: a press there that travels DRAG_SLOP_PX
//                            drags the widget (a shorter one is a click, so a title
//                            that is also a button still opens what it opens)
//   [data-hs-wfold="Name"]   its fold (foldButtonHtml): a dash folds the widget to
//                            its title, a plus opens it again
// The place and the fold are the HUD layout's (src/shell/hud.js setPlace /
// setFolded): a DISPLAY preference in the character's residue, per size class,
// stored as offsets from the nearest corner (hud.js placeFrom) so it survives a
// resize. One residue put per drop; nothing moves the camera while dragging but
// the widget leaving the inset (a moved widget is the player's own, hud.js).
//
// THE PHONE FOLDS BUT DOES NOT DRAG (documented choice, 2026-10-25): on a landscape
// phone the World is under 400 px tall and the hunt bar, the analyzer and the action
// bar are one computed stack in the right-hand column (hud-widgets.js `below`,
// hunt-screen HS-22); a dragged panel could only land on the fight, the Party panel
// or the bar, and the phone analyzer spends no row on a title band to grab. Windows
// do the same (a phone sheet never floats).
//
// DOM only through src/render/paint.js (a fold repaint writes only what changed).
// ════════════════════════════════════════════════════════════════════════
import { attr, cls } from '../render/paint.js?v=0.2.53';
import { placeFrom } from './hud.js?v=0.2.53';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.53';

/* As a window's head (shell.js): a press that wanders less than this is a click, never a move. */
const DRAG_SLOP_PX = 5;
/* The title's own controls (the fold, This hero / Party) press; they never start a drag. */
const CONTROLS = 'button, input, select, textarea, a, [role="tab"]';

/** A widget's fold button, named for the widget it folds; paintMove keeps its sign and words. */
export function foldButtonHtml(name) {
  return '<button type="button" class="hs-wfold" data-hs-wfold="' + esc(name) + '" aria-expanded="true" aria-label="Minimize ' + esc(name) + '" title="Minimize"></button>';
}

/** The widget box's fold and moved marks, and its fold button's state, from its layout `L`. Writes only changes. */
export function paintMove(el, L, moved) {
  cls(el, 'is-folded', !!L.folded);
  cls(el, 'is-moved', !!moved);
  const b = el.querySelector('[data-hs-wfold]');
  if (!b) return;
  const name = b.getAttribute('data-hs-wfold');
  attr(b, 'aria-expanded', String(!L.folded));
  attr(b, 'aria-label', (L.folded ? 'Show ' : 'Minimize ') + name);
  attr(b, 'title', L.folded ? 'Show' : 'Minimize');
}

/**
 * Drag and fold on the HUD layers.
 * @param {object} o
 * @param {HTMLElement[]} o.boxes     the HUD layers ([data-hs-hud]) whose widgets move inside them
 * @param {object} o.hud              createHud's API
 * @param {Window} o.host
 * @param {() => boolean} o.isPhone   the phone size class (folds, never drags)
 * @param {() => void} o.place        re-place the widgets (shell.js placeWidgets), at most once a frame while dragging
 * @param {(id: string) => void} o.refresh   redraw an open window (the HUD layout list shows Put back once moved)
 * @returns {() => void}  detach
 */
export function mountWidgetMoves(o) {
  const { boxes, hud, host } = o;
  /* The click a drag's release fires on the title (a button that opens a window, for the tally) is the drag's own. */
  let swallow = false;

  function onDown(e) {
    if (e.button !== 0 || o.isPhone()) return;
    const handle = e.target.closest && e.target.closest('[data-hs-wdrag]');
    if (!handle) return;
    const ctl = e.target.closest(CONTROLS);
    if (ctl && ctl !== handle && handle.contains(ctl)) return;
    const el = handle.closest('[data-hs-widget]');
    const id = el && el.getAttribute('data-hs-widget');
    const box = el && el.parentElement;
    if (!id || !hud.row(id) || !box) return;
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    let dragging = false, frame = 0;
    const move = (m) => {
      if (!dragging && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < DRAG_SLOP_PX) return;
      if (!dragging) { dragging = true; cls(el, 'is-dragging', true); }
      const at = placeFrom({ left: m.clientX - b.left - ox, top: m.clientY - b.top - oy, width: el.offsetWidth, height: el.offsetHeight },
        { width: b.width, height: b.height });
      hud.setPlace(id, at, false);
      if (!frame) frame = host.requestAnimationFrame(() => { frame = 0; o.place(); });
    };
    const up = () => {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      if (frame) { host.cancelAnimationFrame(frame); frame = 0; }
      if (!dragging) return;
      cls(el, 'is-dragging', false);
      swallow = true;
      host.setTimeout(() => { swallow = false; }, 0);
      /* The drop keeps the place: one residue put, and every subscriber repaints (the camera inset included). */
      hud.setPlace(id, hud.layoutOf(id), true);
      o.refresh('hud');
    };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  }

  /* Capture: the drag's click never reaches the widget's own act; a fold press is answered here. */
  function onClick(e) {
    if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); return; }
    const f = e.target.closest && e.target.closest('[data-hs-wfold]');
    const el = f && f.closest('[data-hs-widget]');
    const id = el && el.getAttribute('data-hs-widget');
    if (!id || !hud.row(id)) return;
    e.stopPropagation();
    hud.setFolded(id, !hud.layoutOf(id).folded);
  }

  for (const box of boxes) { box.addEventListener('pointerdown', onDown); box.addEventListener('click', onClick, true); }
  return () => { for (const box of boxes) { box.removeEventListener('pointerdown', onDown); box.removeEventListener('click', onClick, true); } };
}
