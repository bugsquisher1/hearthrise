// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/world.js — the World pane, opened the way a player opens it.
//
// The pane is a lazy import (BOOT-5 in tests/boot-budget.mjs proves a boot
// never pays for it); these prove the other half: the first open loads it and
// it DRAWS, the frame loop runs only while the pane is in front of a visible
// page, and the only thing it writes is the G._world display scratch.
// ══════════════════════════════════════════════════════════════════════
import { tryRunAsync, assert } from './_harness.js?v=575';
import { buildResiduePatch } from '../../net/capstone.js?v=575';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (pred()) return true; await sleep(40); }
  return !!pred();
}

/** Open the pane as the Home strip does, wait for the runtime and a few frames. */
async function openWorld() {
  const W = window.HearthriseWorld;
  assert(W && typeof W.load === 'function', 'world-panel.js does not publish window.HearthriseWorld');
  assert(document.getElementById('panel-world'), 'the World pane was never injected (#panel-world)');
  window.showTab('world');
  const rt = await W.load();
  assert(rt && typeof rt.stats === 'function', 'the world runtime did not load on the first open');
  const f0 = rt.stats().frames;
  assert(await until(() => rt.stats().frames >= f0 + 3, 4000), 'the frame loop never ran on an open pane (' + JSON.stringify(rt.stats()) + ')');
  return rt;
}

/** Sample a grid of device pixels: [distinct colours, opaque fraction]. */
function sampleCanvas(canvas) {
  const g = canvas.getContext('2d');
  const seen = new Set();
  let opaque = 0, n = 0;
  for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
    const d = g.getImageData(Math.floor(canvas.width * i / 10), Math.floor(canvas.height * j / 10), 1, 1).data;
    seen.add(d[0] + ',' + d[1] + ',' + d[2]);
    if (d[3] === 255) opaque++;
    n++;
  }
  return [seen.size, opaque / n];
}

export default [
  () => tryRunAsync('WORLD-1: the World pane loads its atlases on the first open and draws a real-art frame that is not blank', async () => {
    const hadWorld = Object.prototype.hasOwnProperty.call(window.G, '_world');
    try {
      const rt = await openWorld();
      const panel = document.getElementById('panel-world');
      assert(panel.classList.contains('active'), 'showTab("world") did not make the World pane the active panel');
      assert(document.getElementById('world-css'), 'world.css was not loaded with the pane');
      const tab = document.querySelector('#hub-tabs [data-hub-pane="world"]');
      assert(tab && tab.classList.contains('active'), 'the Home strip does not show World as the open pane');
      const canvas = panel.querySelector('canvas.world-canvas');
      assert(canvas && canvas.width > 1 && canvas.height > 1, 'no sized canvas in the stage');
      const s = rt.stats();
      assert(s.z >= 2 && Number.isInteger(s.z), 'zoom must be a whole number >= 2, got ' + s.z);
      assert(Array.isArray(s.stubbed) && s.stubbed.length === 0, 'sprites drawn as stubs, so an atlas did not load: ' + (s.stubbed || []).slice(0, 5).join(', '));
      const [colours, opaque] = sampleCanvas(canvas);
      assert(opaque > 0.9, 'the frame is mostly transparent (' + Math.round(opaque * 100) + '% opaque): nothing was blitted');
      assert(colours >= 4, 'the frame is blank or flat: ' + colours + ' distinct colours over 81 samples');
    } finally {
      window.showTab('profile');
      if (!hadWorld) delete window.G._world;
    }
  }),

  () => tryRunAsync('WORLD-2: the frame loop stops on a tab switch and while the page is hidden, and resumes on return', async () => {
    const hadWorld = Object.prototype.hasOwnProperty.call(window.G, '_world');
    let hiddenStub = false;
    try {
      const rt = await openWorld();
      window.showTab('profile');
      assert(rt.stats().running === false, 'switching away must stop the loop at once');
      const f1 = rt.stats().frames;
      await sleep(300);
      assert(rt.stats().frames === f1, 'frames kept coming on another tab: ' + f1 + ' → ' + rt.stats().frames);
      window.showTab('world');
      assert(await until(() => rt.stats().frames > f1 + 2, 3000), 'the loop did not resume when the pane came back');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      hiddenStub = true;
      document.dispatchEvent(new Event('visibilitychange'));
      assert(rt.stats().running === false, 'a hidden page must stop the loop');
      const f2 = rt.stats().frames;
      await sleep(300);
      assert(rt.stats().frames === f2, 'frames kept coming while hidden');
      delete document.hidden;
      hiddenStub = false;
      document.dispatchEvent(new Event('visibilitychange'));
      assert(await until(() => rt.stats().frames > f2 + 2, 3000), 'the loop did not resume when the page came back');
    } finally {
      if (hiddenStub) { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }
      window.showTab('profile');
      if (!hadWorld) delete window.G._world;
    }
  }),

  () => tryRunAsync('WORLD-3: the scene pick lives only in G._world, never in the residue; the Common keeps polling while the pane is open', async () => {
    const hadWorld = Object.prototype.hasOwnProperty.call(window.G, '_world');
    try {
      /* Not in a fight, so the scene is the viewer's pick (a fight shows its hunt instead). */
      if (typeof window.stopCombat === 'function') window.stopCombat();
      const rt = await openWorld();
      const T = window.HearthriseTown;
      assert(T && T.shouldPoll() === true, 'the Common must keep polling while the World pane is open');
      document.querySelector('#panel-world [data-world-choice="home"]').click();
      assert(await until(() => rt.stats().scene === 'home_cottage', 2000), 'tapping Home did not show the cottage (' + rt.stats().scene + ')');
      assert(window.G._world && window.G._world.choice === 'home', 'the pick must be held in G._world');
      assert(Object.keys(window.G._world).join() === 'choice', 'G._world holds more than the pick: ' + JSON.stringify(window.G._world));
      assert(await until(() => rt.stats().heroBuilding === 'cottage', 2000), 'the hero should start inside the cottage');
      const patch = buildResiduePatch(window.G);
      assert(!('_world' in patch) && !JSON.stringify(patch).includes('"choice":"home"'), 'the world scratch leaked into the residue PUT');
      document.querySelector('#panel-world [data-world-choice="town"]').click();
      assert(await until(() => rt.stats().scene === 'town_common', 2000), 'tapping Town did not show the Common');
      window.showTab('profile');
      assert(T.shouldPoll() === true, 'Home still polls');
      window.showTab('inventory');
      assert(T.shouldPoll() === false, 'CONTROL: the Common must not poll on an unrelated screen');
    } finally {
      window.showTab('profile');
      if (!hadWorld) delete window.G._world;
    }
  }),
];
