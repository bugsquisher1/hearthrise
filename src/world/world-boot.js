// ════════════════════════════════════════════════════════════════════════
// src/world/world-boot.js — THE WORLD PANE'S RUNTIME (loaded on first open).
//
// src/features/world-panel.js imports this lazily the first time the World
// pane opens, so a player who never opens it never downloads any of src/world
// (BOOT-5, tests/boot-budget.mjs).
//
// THE LOOP runs on requestAnimationFrame ONLY while #panel-world is the active
// panel AND the page is visible: switching tab or hiding the page stops it on
// the next frame (and sync() cancels the pending one at once). 30 fps under the
// canonical mobile query, 60 elsewhere. Each frame reads the scene from the
// server-held state (store.js), steps the roof fades, and hands the backend
// one state object.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=575';
import { MATERIALS, OPEN_CLASSES, LIGHTS } from '../data/world/terrain.js?v=575';
import { WORLD_MAPS } from '../data/world/maps/index.js?v=575';
import { compileMap } from './core/map-compile.js?v=575';
import { STUB_SPRITE } from './core/book.js?v=575';
import { fpsFor, MOBILE_QUERY } from './core/camera.js?v=575';
import { heroBuilding, roofTargets, stepAlpha } from './core/roofs.js?v=575';
import { readScene, setChoice } from './store.js?v=575';
import { loadAtlases } from './atlas.js?v=575';
import { createCanvasBackend } from './render/canvas-backend.js?v=575';

const ROWS = new Map(WORLD_MAPS.map((m) => [m.id, m]));

/**
 * Load the art, then mount the world into `panel` (#panel-world). Resolves to the runtime:
 *   sync()     start or stop the loop to match the panel and the page
 *   stats()    { running, frames, scene, ...backend.snapshot() } for tests
 *   destroy()
 */
export async function bootWorld(panel) {
  const win = window, doc = document;
  const stage = panel.querySelector('.world-stage');
  const chrome = panel.querySelector('.world-chrome');
  const styles = win.getComputedStyle(doc.body);
  const css = (name) => styles.getPropertyValue(name).trim();
  const { book, images } = await loadAtlases({ doc, version: BUILD.cache });
  /* A sprite no loaded atlas carries compiles as a one-tile stub, never a crash. */
  const sprites = new Proxy(book.sprites, { get: (t, k) => t[k] || STUB_SPRITE });
  const tables = { materials: MATERIALS, sprites, openClasses: OPEN_CLASSES, lights: LIGHTS };
  const backend = createCanvasBackend({ win, doc, book, images, tables, css });
  stage.querySelectorAll('.world-status').forEach((el) => el.remove());
  backend.mount(stage);

  const compiled = new Map();
  const mapOf = (id) => {
    if (!compiled.has(id)) compiled.set(id, compileMap(ROWS.get(id), tables));
    return compiled.get(id);
  };
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia(MOBILE_QUERY) : null;
  let running = false, raf = 0, last = 0, frames = 0, scene = null, roofAlpha = {};

  function paintChrome(sc) {
    const title = chrome.querySelector('.world-title');
    if (title) title.textContent = ROWS.get(sc.map).name;
    chrome.querySelectorAll('[data-world-choice]').forEach((b) => {
      const on = b.getAttribute('data-world-choice') === sc.kind;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      b.hidden = sc.kind === 'hunt';
    });
  }

  function step(dt) {
    const G = win.G || {};
    const sc = readScene(G);
    if (!scene || sc.map !== scene.map || sc.kind !== scene.kind) {
      if (!scene || sc.map !== scene.map) { backend.setMap(mapOf(sc.map)); roofAlpha = {}; }
      scene = sc;
      paintChrome(sc);
    }
    const map = mapOf(sc.map);
    const hero = { x: map.start[0], y: map.start[1] };
    const targets = roofTargets(map.buildings, heroBuilding(map.buildings, hero));
    for (const id of Object.keys(targets)) roofAlpha[id] = id in roofAlpha ? stepAlpha(roofAlpha[id], targets[id], dt) : targets[id];
    const I = win.HearthriseIdentity;
    const name = (I && typeof I.displayName === 'function' && I.displayName()) || G.playerName || null;
    backend.sync({ hero, name, roofAlpha, t: win.performance.now() });
    frames++;
  }

  const live = () => panel.classList.contains('active') && !doc.hidden;
  function frame(t) {
    raf = 0;
    if (!live()) { running = false; return; }
    raf = win.requestAnimationFrame(frame);
    if (last && t - last < 1000 / fpsFor(!!(mq && mq.matches)) - 2) return;
    const dt = last ? t - last : 0;
    last = t;
    step(dt);
  }
  function sync() {
    if (live()) {
      if (!running) { running = true; last = 0; raf = win.requestAnimationFrame(frame); }
    } else {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
    }
  }
  function onChoice(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-world-choice]');
    if (!b) return;
    setChoice(win.G || {}, b.getAttribute('data-world-choice'));
    if (running) step(0);
  }
  chrome.addEventListener('click', onChoice);
  doc.addEventListener('visibilitychange', sync);

  return {
    sync,
    stats: () => Object.assign({ running, frames, scene: scene && scene.map }, backend.snapshot()),
    destroy() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
      chrome.removeEventListener('click', onChoice);
      doc.removeEventListener('visibilitychange', sync);
      backend.destroy();
    },
  };
}
