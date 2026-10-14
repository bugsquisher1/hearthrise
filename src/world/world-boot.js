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
//
// THE HUNT (lane W3). When the server's activity is a fight a map renders, the
// scene is that hunt: hunt-scene.js stages the fight from the one swing
// observer (src/render/combat-observer.js) — its snapshot every frame and every
// beat as it happens, so swings taken while the pane was hidden are not lost —
// and hunt-chrome.js paints the settled Analyzer, the knockout line and Eat /
// Leave Hunt over the stage.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=580';
import { MATERIALS, OPEN_CLASSES, LIGHTS } from '../data/world/terrain.js?v=580';
import { WORLD_MAPS } from '../data/world/maps/index.js?v=580';
import { HUNT_INDEX } from '../data/hunts.js?v=580';
import { compileMap } from './core/map-compile.js?v=580';
import { STUB_SPRITE } from './core/book.js?v=580';
import { fpsFor, MOBILE_QUERY } from './core/camera.js?v=580';
import { heroBuilding, roofTargets, stepAlpha } from './core/roofs.js?v=580';
import { readScene, setChoice, activityOf } from './store.js?v=580';
import { loadAtlases } from './atlas.js?v=580';
import { createCanvasBackend } from './render/canvas-backend.js?v=580';
import { huntOfMap, mapForActivity } from './hunt-maps.js?v=580';
import { createHuntScene } from './hunt-scene.js?v=580';
import { createHuntChrome, hudModel } from './hunt-chrome.js?v=580';

const ROWS = new Map(WORLD_MAPS.map((m) => [m.id, m]));
const HUD_EVERY_MS = 250;

/** The fight as the client holds it, when the observer is not installed (a bare harness). */
function bareSnapshot(G) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { foe: G.activeMonster || null, foeHp: n(G.monsterHp), foeMaxHp: n(G.monsterMaxHp), heroHp: n(G.playerHp),
    heroMaxHp: n(G.playerMaxHp), kills: n(G.combatKillsThisFoe), tickMs: 0, down: null };
}

/** The hunt the World can show today — the first hunt map's — named from the data. */
const OPEN_HUNT = huntOfMap(WORLD_MAPS.find((m) => m.kind === 'hunt'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

/**
 * THE CARD FOR "NOTHING HERE TO WATCH", in plain words — or null when the scene
 * speaks for itself. A fight on a hunt or monster no map renders ALWAYS gets it,
 * knocked out or not, naming where the hero is; anything else (idle, gathering,
 * crafting) gets it while Town and Home are not open yet. The button only
 * navigates: Adventures, with the open hunt picked.
 * @param {object} G  read only
 * @param {boolean} ready  are Town and Home open?
 * @param {(id: string) => string} monsterName
 */
function idleCard(G, ready, monsterName) {
  const fighting = !!G.activeMonster;
  if (fighting ? mapForActivity(activityOf(G)) : ready) return null;
  const place = OPEN_HUNT ? OPEN_HUNT.name : 'first hunt';
  const hunt = G._huntId && HUNT_INDEX[G._huntId];
  const head = !fighting ? 'Town and Home are coming soon.'
    : (hunt ? hunt.name : 'Your fight with the ' + monsterName(G.activeMonster)) + ' isn’t in the World yet.';
  const body = fighting ? 'The ' + place + ' is.' + (ready ? '' : ' Town and Home are coming soon.')
    : 'The ' + place + ' is open now: start a hunt there and watch your hero fight.';
  return '<div class="world-idle-card"><p class="world-idle-head">' + esc(head) + '</p>'
    + '<p class="world-idle-body">' + esc(body) + '</p>'
    + '<button type="button" class="world-idle-go" data-world-go="hunt">' + esc('Hunt in the ' + place) + '</button></div>';
}

/**
 * Load the art, then mount the world into `panel` (#panel-world). Resolves to the runtime:
 *   sync()     start or stop the loop to match the panel and the page
 *   stats()    { running, frames, scene, hunt, ...backend.snapshot() } for tests
 *   destroy()
 * @param {HTMLElement} panel
 * @param {{scenesReady?: () => boolean}} [opts]  are Town and Home open to walk in?
 */
export async function bootWorld(panel, opts = {}) {
  const win = window, doc = document;
  const stage = panel.querySelector('.world-stage');
  const chrome = panel.querySelector('.world-chrome');
  const styles = win.getComputedStyle(doc.body);
  const css = (name) => styles.getPropertyValue(name).trim();
  const scenesReady = () => (typeof opts.scenesReady === 'function' ? !!opts.scenesReady() : true);
  const { book, images } = await loadAtlases({ doc, version: BUILD.cache });
  /* A sprite no loaded atlas carries compiles as a one-tile stub, never a crash. */
  const sprites = new Proxy(book.sprites, { get: (t, k) => t[k] || STUB_SPRITE });
  const tables = { materials: MATERIALS, sprites, openClasses: OPEN_CLASSES, lights: LIGHTS };
  const backend = createCanvasBackend({ win, doc, book, images, tables, css });
  stage.querySelectorAll('.world-status').forEach((el) => el.remove());
  backend.mount(stage);

  const obs = win.HearthriseCombatObserver || null;
  let hunt = null, huntMap = null, hudAt = 0, lastHunt = null;
  const unsubscribe = obs ? obs.subscribe((b) => { if (hunt) hunt.beat(b); }) : null;
  const hud = createHuntChrome(stage, { doc, on: {
    eat: () => { if (typeof win.eatBestProvision === 'function') win.eatBestProvision(); },
    leave: () => { if (typeof win.stopCombat === 'function') win.stopCombat(); },
  } });
  const idle = doc.createElement('div');
  idle.className = 'world-idle';
  idle.hidden = true;
  stage.appendChild(idle);

  const compiled = new Map();
  const mapOf = (id) => {
    if (!compiled.has(id)) compiled.set(id, compileMap(ROWS.get(id), tables));
    return compiled.get(id);
  };
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia(MOBILE_QUERY) : null;
  let running = false, raf = 0, last = 0, frames = 0, scene = null, roofAlpha = {};

  function paintChrome(sc) {
    const ready = scenesReady();
    chrome.querySelectorAll('[data-world-choice]').forEach((b) => {
      const on = ready && b.getAttribute('data-world-choice') === sc.kind;
      b.classList.toggle('active', on);
      b.classList.toggle('is-soon', !ready);
      b.disabled = !ready;
      b.title = ready ? '' : 'Coming soon';
      b.setAttribute('aria-pressed', String(on));
      b.hidden = sc.kind === 'hunt';
    });
  }

  function huntState(G, sc, map, name, now) {
    if (!hunt || huntMap !== sc.map) {
      const h = huntOfMap(ROWS.get(sc.map));
      const a = G._huntAnalyzer;
      hunt = createHuntScene(map, {
        huntId: h ? h.id : sc.map, since: (a && a.started_at) || '', spawns: h ? h.spawns : [],
        nameOf: (id) => (win.MONSTERS && win.MONSTERS[id] && win.MONSTERS[id].name) || id,
      });
      huntMap = sc.map;
    }
    const snap = obs ? obs.snapshot() : bareSnapshot(G);
    const hs = hunt.state(snap, now, name);
    lastHunt = { foe: hs.foe, down: hs.down, floats: hs.floats.length, units: hs.units.map((u) => u.id), hero: hs.hero };
    if (now - hudAt >= HUD_EVERY_MS) {
      hudAt = now;
      hud.paint(hudModel({ analyzer: G._huntAnalyzer || null, title: ROWS.get(sc.map).name, down: snap.down, now }));
    }
    return { hero: hs.hero, units: hs.units, floats: hs.floats };
  }

  /* ROUTE: which scene, and the HTML around it (title, picks, idle card, overlay).
     NOT a side effect of the frame loop (live 2026-10-14: a pane opened with no frame
     ever running — a background tab — kept a 300x150 canvas and a hidden card).
     sync() routes on every open, tab switch and visibility change; every frame
     routes again, so the card follows the activity as it changes. */
  let lastCard = null;
  const monsterName = (id) => (win.MONSTERS && win.MONSTERS[id] && win.MONSTERS[id].name) || id;
  function route() {
    const G = win.G || {};
    const sc = readScene(G);
    if (!scene || sc.map !== scene.map || sc.kind !== scene.kind) {
      if (!scene || sc.map !== scene.map) { backend.setMap(mapOf(sc.map)); roofAlpha = {}; }
      scene = sc;
      paintChrome(sc);
      hudAt = 0;
    }
    if (sc.kind !== 'hunt') { hunt = null; huntMap = null; lastHunt = null; hud.paint(null); }
    const card = sc.kind === 'hunt' ? null : idleCard(G, scenesReady(), monsterName);
    if (card !== lastCard) { lastCard = card; idle.innerHTML = card || ''; }
    idle.hidden = !card;
    /* A "coming soon" place behind the card is not where the hero is: no title claims it. */
    const title = chrome.querySelector('.world-title');
    const want = card && !scenesReady() ? 'World' : ROWS.get(sc.map).name;
    if (title && title.textContent !== want) title.textContent = want;
    return sc;
  }

  function step(dt) {
    const G = win.G || {};
    const sc = route();
    const map = mapOf(sc.map);
    const I = win.HearthriseIdentity;
    const name = (I && typeof I.displayName === 'function' && I.displayName()) || G.playerName || null;
    const now = Date.now();
    const cast = sc.kind === 'hunt' ? huntState(G, sc, map, name, now) : { hero: { x: map.start[0], y: map.start[1] } };
    const targets = roofTargets(map.buildings, heroBuilding(map.buildings, cast.hero));
    for (const id of Object.keys(targets)) roofAlpha[id] = id in roofAlpha ? stepAlpha(roofAlpha[id], targets[id], dt) : targets[id];
    backend.sync(Object.assign({ name: sc.kind === 'hunt' ? null : name, roofAlpha, t: now }, cast));
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
    /* One frame NOW whenever the pane is in front — loop or no loop — so the
       canvas is sized and the scene, card and overlay are painted before (and
       without) any requestAnimationFrame. A throw here must not leave the loop
       state wrong, so it is reported and the loop decision still runs. */
    if (panel.classList.contains('active')) {
      try { step(0); } catch (e) { console.error('[world] a frame failed', e); }
    }
    if (live()) {
      if (!running) { running = true; last = 0; raf = win.requestAnimationFrame(frame); }
    } else {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
    }
  }
  function onChoice(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-world-choice]');
    if (!b || b.disabled) return;
    setChoice(win.G || {}, b.getAttribute('data-world-choice'));
    if (running) step(0);
  }
  function onGo(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-world-go]');
    if (!b) return;
    /* Navigation only: Adventures, the War Table's Hunts, the open hunt picked. */
    if (typeof win.showTab === 'function') win.showTab('combat');
    const C = win.HearthriseCombatScreens;
    if (OPEN_HUNT && C && typeof C.showHunt === 'function') C.showHunt(OPEN_HUNT.id);
  }
  chrome.addEventListener('click', onChoice);
  idle.addEventListener('click', onGo);
  doc.addEventListener('visibilitychange', sync);

  return {
    sync,
    /** Paint one frame now, loop or not (a test reads the frame it just caused). */
    step: () => step(0),
    stats: () => Object.assign({ running, frames, scene: scene && scene.map, kind: scene && scene.kind, hunt: lastHunt, hud: hud.text() }, backend.snapshot()),
    destroy() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
      if (unsubscribe) unsubscribe();
      chrome.removeEventListener('click', onChoice);
      idle.removeEventListener('click', onGo);
      doc.removeEventListener('visibilitychange', sync);
      hud.destroy();
      idle.remove();
      backend.destroy();
    },
  };
}
