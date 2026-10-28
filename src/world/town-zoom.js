// ════════════════════════════════════════════════════════════════════════
// src/world/town-zoom.js — THE TOWN VIEW'S ZOOM CONTROL (Tyler 2026-10-26).
//
// The mouse wheel over the town and two small + / − buttons on the stage step through
// TOWN_ZOOM.steps (src/data/world/view-zoom.js). The pick is the viewing character's
// display preference, residue `townZoom` (character.setResidue): it gates and spends
// nothing, and the next envelope's residue is what is read back. Before any pick the
// desktop draws TOWN_ZOOM.desktop. Under the mobile query there is no control and no pick:
// zoomOf() answers null and the backend keeps the screen class's zoom (camera.js zoomFor).
// The camera stays on the viewed hero (frameView); taps still pick by the frame drawn.
// ════════════════════════════════════════════════════════════════════════
import { TOWN_ZOOM } from '../data/world/view-zoom.js?v=0.2.60';

/* deltaY a wheel turns into one step (a mouse notch is ~100 px; a trackpad's small deltas add up) */
const WHEEL_STEP = 100;
const LINE_PX = 40;

/**
 * @param {{win: Window, doc: Document, stage: HTMLElement, character?: object, mq?: MediaQueryList|null,
 *          onChange: () => void}} o  onChange: the zoom changed (the World draws a frame)
 */
export function createTownZoom(o) {
  const { doc, stage, character, mq } = o;
  const phone = () => !!(mq && mq.matches);
  let local = null;   // a pick with no character to keep it (a review page)
  function picked() {
    const r = character && character.record && character.record.residue;
    const v = r && r.townZoom;
    if (TOWN_ZOOM.steps.includes(v)) return v;
    return local;
  }
  /** The town's zoom now: the pick, else the desktop default; null on the phone (the screen class's). */
  const current = () => (phone() ? null : picked() ?? TOWN_ZOOM.desktop);

  const box = doc.createElement('div');
  box.className = 'world-zoom';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Zoom');
  box.innerHTML = '<button type="button" class="world-zoom-btn" data-zoom="1" aria-label="Zoom in">+</button>'
    + '<button type="button" class="world-zoom-btn" data-zoom="-1" aria-label="Zoom out">−</button>';
  box.hidden = true;
  stage.appendChild(box);

  function paint() {
    const z = current(), s = TOWN_ZOOM.steps;
    for (const b of box.querySelectorAll('[data-zoom]')) {
      const up = b.getAttribute('data-zoom') === '1';
      const off = z === null || (up ? z >= s[s.length - 1] : z <= s[0]);
      if (b.disabled !== off) b.disabled = off;   // a frame writes nothing unless the ends changed
    }
  }
  /** One step in (+1) or out (-1); false at either end. */
  function step(dir) {
    const z = current();
    if (z === null) return false;
    const s = TOWN_ZOOM.steps;
    let i = s.indexOf(z);
    if (i < 0) i = s.reduce((b, v, k) => (Math.abs(v - z) < Math.abs(s[b] - z) ? k : b), 0);
    const next = s[Math.max(0, Math.min(s.length - 1, i + dir))];
    if (next === z) return false;
    local = next;
    if (character && typeof character.setResidue === 'function') character.setResidue('townZoom', next);
    paint();
    o.onChange();
    return true;
  }

  function onClick(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-zoom]');
    if (!b || !box.contains(b)) return;
    e.stopPropagation();   // a press on the control never walks the hero
    step(Number(b.getAttribute('data-zoom')));
  }
  let wheel = 0;
  function onWheel(e) {
    if (box.hidden || !e.target || !e.target.classList || !e.target.classList.contains('world-canvas')) return;
    e.preventDefault();
    wheel += e.deltaY * (e.deltaMode === 1 ? LINE_PX : 1);
    if (Math.abs(wheel) < WHEEL_STEP) return;
    const dir = wheel < 0 ? 1 : -1;   // wheel up: closer
    wheel = 0;
    step(dir);
  }
  box.addEventListener('click', onClick);
  stage.addEventListener('wheel', onWheel, { passive: false });

  return {
    /** The zoom for a scene of `kind`: the town's pick there, null (the screen class's) anywhere else. */
    zoomOf(kind) { return kind === 'town' ? current() : null; },
    /** Show the control only over the town, never on the phone. */
    show(kind) {
      const on = kind === 'town' && !phone();
      if (box.hidden === on) { box.hidden = !on; wheel = 0; }
      if (on) paint();
    },
    step,
    destroy() {
      box.removeEventListener('click', onClick);
      stage.removeEventListener('wheel', onWheel);
      box.remove();
    },
  };
}
