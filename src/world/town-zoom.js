// ════════════════════════════════════════════════════════════════════════
// src/world/town-zoom.js — THE TOWN VIEW'S ZOOM CONTROL (Tyler 2026-10-26).
//
// The mouse wheel over the town and two small + / − buttons on the stage step through
// TOWN_ZOOM.steps (src/data/world/view-zoom.js). Before any pick the desktop draws
// TOWN_ZOOM.desktop. Under the mobile query there is no control and no pick: zoomOf()
// answers null and the backend keeps the screen class's zoom (camera.js zoomFor).
// The camera stays on the viewed hero (frameView); taps still pick by the frame drawn.
//
// THE PICK IS THE VIEWER'S, NEVER ONE HERO'S (Tyler 10-26, "remembered per viewer"; Andy's report
// #75: one wheel turn over the town left Apollo alone zoomed out, his other heroes at x2). The
// residue is per character, so a pick { z, at } goes to EVERY open hero, and what shows is the
// newest any open hero holds (at: the server's clock): a hero that was closed for a pick can't
// put its older one back. Display only: it gates and spends nothing, and the next envelope's
// residue is what is read back.
// ════════════════════════════════════════════════════════════════════════
import { TOWN_ZOOM } from '../data/world/view-zoom.js?v=0.2.127';
import { serverNowOf } from '../session/hunt-sections.js?v=0.2.127';

/* deltaY a wheel turns into one step (a mouse notch is ~100 px; a trackpad's small deltas add up) */
const WHEEL_STEP = 100;
const LINE_PX = 40;

/* The newest pick any of these heroes holds, or null. */
function newestPick(heroes) {
  let best = null;
  for (const cs of heroes) {
    const p = cs.record && cs.record.residue && cs.record.residue.townZoom;
    if (p && (!best || p.at > best.at)) best = p;
  }
  return best;
}

/**
 * @param {{win: Window, doc: Document, stage: HTMLElement, character?: object, peers?: () => object[], mq?: MediaQueryList|null,
 *          onChange: () => void}} o  peers: the account's open heroes. onChange: the zoom changed (the World draws a frame)
 */
export function createTownZoom(o) {
  const { doc, stage, character, mq } = o;
  const phone = () => !!(mq && mq.matches);
  let local = null;   // a pick with no character to keep it (a review page)
  const heroes = () => { const all = o.peers ? o.peers() : []; return !character || all.includes(character) ? all : all.concat(character); };
  function picked() {
    const p = newestPick(heroes());
    return p ? p.z : local;
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
    const all = heroes(), was = newestPick(all);
    const pick = { z: next, at: Math.max(Math.floor(serverNowOf(character)) || 0, was ? was.at + 1 : 0) };
    for (const cs of all) if (typeof cs.setResidue === 'function') cs.setResidue('townZoom', pick);
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
