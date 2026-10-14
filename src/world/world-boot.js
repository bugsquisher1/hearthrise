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
//
// THE TOWN AND THE HOME (lane W4) otherwise, as the viewer picks: walk-scene.js
// draws them from what the client holds from the server, read here into one
// `env` per frame. A tap walks the local hero (display only: G._world.pos) or
// opens an existing screen; no tap sends an intent (steer-local.js runAction).
// A fight on a hunt no map renders shows the viewer's town or home with a slim
// banner that names the fight and offers the hunt that IS in the World.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=579';
import { MATERIALS, OPEN_CLASSES, LIGHTS } from '../data/world/terrain.js?v=579';
import { WORLD_MAPS } from '../data/world/maps/index.js?v=579';
import { HUNT_INDEX } from '../data/hunts.js?v=579';
import { compileMap } from './core/map-compile.js?v=579';
import { STUB_SPRITE } from './core/book.js?v=579';
import { fpsFor, MOBILE_QUERY } from './core/camera.js?v=579';
import { heroBuilding, roofTargets, stepAlpha } from './core/roofs.js?v=579';
import { readScene, setChoice, heroPosOn, notePos } from './store.js?v=579';
import { loadAtlases } from './atlas.js?v=579';
import { createCanvasBackend } from './render/canvas-backend.js?v=579';
import { huntOfMap } from './hunt-maps.js?v=579';
import { createHuntScene } from './hunt-scene.js?v=579';
import { createHuntChrome, hudModel } from './hunt-chrome.js?v=579';
import { createWalkScene } from './walk-scene.js?v=579';
import { homeMapFor } from './home-scene.js?v=579';
import { runAction } from './steer-local.js?v=579';

const ROWS = new Map(WORLD_MAPS.map((m) => [m.id, m]));
const ROW_OF = Object.fromEntries(WORLD_MAPS.map((m) => [m.id, m]));
const HUD_EVERY_MS = 250;

/** The fight as the client holds it, when the observer is not installed (a bare harness). */
function bareSnapshot(G) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { foe: G.activeMonster || null, foeHp: n(G.monsterHp), foeMaxHp: n(G.monsterMaxHp), heroHp: n(G.playerHp),
    heroMaxHp: n(G.playerMaxHp), kills: n(G.combatKillsThisFoe), tickMs: 0, down: null };
}

const fn = (o, k) => (o && typeof o[k] === 'function' ? o[k] : null);

/** The hunt the World can show today — the first hunt map's — named from the data. */
const OPEN_HUNT = huntOfMap(WORLD_MAPS.find((m) => m.kind === 'hunt'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

/**
 * A FIGHT THE WORLD HAS NO MAP FOR (Ridge Camp, say): the town or home stays on
 * screen as the viewer picked, and one slim line over it names where the hero
 * really is and offers the hunt that IS in the World. Null when the scene
 * speaks for itself. Its button only navigates (Adventures, the hunt picked).
 * @param {object} G  read only
 * @param {{kind: string}} sc  the scene showing
 * @param {(id: string) => string} monsterName
 */
function unmappedBanner(G, sc, monsterName) {
  if (!G.activeMonster || sc.kind === 'hunt' || !OPEN_HUNT) return null;
  const hunt = G._huntId && HUNT_INDEX[G._huntId];
  const where = hunt ? hunt.name : 'Your fight with the ' + monsterName(G.activeMonster);
  return '<p class="world-idle-line"><b>' + esc(where) + '</b> isn’t in the World yet. The ' + esc(OPEN_HUNT.name) + ' is.</p>'
    + '<button type="button" class="world-idle-go" data-world-go="hunt">' + esc('Hunt in the ' + OPEN_HUNT.name) + '</button>';
}

/**
 * What the town or home reads this frame, from the client's copies of server
 * state (each through the module that owns it). Every reader fails safe: an
 * unknown property rung is the first template, unknown rooms are none, an
 * unknown trophy set hangs nothing, an absent town view shows nobody. The
 * claimed-trophy wall is re-read only when the trophy mirror is replaced.
 */
function createEnvReader(win) {
  let wallOf = null, wall = null;
  return function readEnv(G, kind) {
    const pointer = fn(win, 'localActivityPointer') ? win.localActivityPointer() : null;
    const I = win.HearthriseIdentity;
    const env = { kind: (pointer && pointer.kind) || 'idle', you: (fn(I, 'displayName') && I.displayName()) || G.playerName || null,
      canon: fn(I, 'canon') ? (n) => I.canon(String(n)) : null };
    if (kind === 'home') {
      const Rooms = win.HearthriseRooms, Tr = win.HearthriseTrophies;
      env.rooms = fn(Rooms, 'roomsMap') ? Rooms.roomsMap(G) : {};
      const known = !!fn(Tr, 'claimsKnown') && Tr.claimsKnown() === true && !!fn(Tr, 'wallRows');
      if (!known) { wallOf = null; wall = null; } else if (wallOf !== G._bestiaryTrophies) { wallOf = G._bestiaryTrophies; wall = Tr.wallRows({ known: true, cap: 1000 }); }
      env.trophies = wall;
      env.roomName = (id) => (win.ROOMS && win.ROOMS[id] && win.ROOMS[id].name) || id;
    } else {
      const Town = win.HearthriseTown, TP = win.HearthriseTownPanel;
      env.town = fn(Town, 'readTown') ? Town.readTown() : null;
      env.pollMs = (Town && Town.TOWN_POLL_MS) || 25000;
      env.band = fn(TP, 'bandText');
      env.crierLine = fn(TP, 'crierLine');
    }
    return env;
  };
}

/**
 * Load the art, then mount the world into `panel` (#panel-world). Resolves to the runtime:
 *   sync()     start or stop the loop to match the panel and the page
 *   step()     paint one frame now
 *   stats()    { running, frames, scene, kind, hunt, walk, ...backend.snapshot() } for tests
 *   screenOf(x, y)  the client point over tile (x, y) of the scene showing, for a test's tap
 *   destroy()
 * @param {HTMLElement} panel
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

  const obs = win.HearthriseCombatObserver || null;
  let hunt = null, huntMap = null, hudAt = 0, lastHunt = null;
  const unsubscribe = obs ? obs.subscribe((b) => { if (hunt) hunt.beat(b); }) : null;
  const hud = createHuntChrome(stage, { doc, on: {
    eat: () => { if (typeof win.eatBestProvision === 'function') win.eatBestProvision(); },
    leave: () => { if (typeof win.stopCombat === 'function') win.stopCombat(); },
  } });
  const idle = doc.createElement('div');
  idle.className = 'world-idle';
  idle.setAttribute('role', 'status');
  idle.hidden = true;
  stage.appendChild(idle);

  const compiled = new Map();
  const mapOf = (id) => {
    if (!compiled.has(id)) compiled.set(id, compileMap(ROWS.get(id), tables));
    return compiled.get(id);
  };
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia(MOBILE_QUERY) : null;
  let running = false, raf = 0, last = 0, frames = 0, scene = null, roofAlpha = {};
  let walk = null, lastWalk = null;
  const readEnv = createEnvReader(win);

  function paintChrome(sc) {
    stage.classList.remove('is-hot');
    const title = chrome.querySelector('.world-title');
    if (title) title.textContent = ROWS.get(sc.map).name;
    chrome.querySelectorAll('[data-world-choice]').forEach((b) => {
      const on = b.getAttribute('data-world-choice') === sc.kind;
      b.classList.toggle('active', on);
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

  function walkState(G, map, now) {
    if (!walk || walk.map !== map) {
      walk = createWalkScene(map, { at: heroPosOn(G, map.id), sprites, openClasses: OPEN_CLASSES, maps: ROW_OF });
    }
    const f = walk.frame(readEnv(G, map.kind), now);
    notePos(G, map.id, f.hero.x, f.hero.y);
    lastWalk = f;
    return f;
  }

  /** The last walk frame, as a test reads it. */
  function walkStats() {
    const f = lastWalk;
    return f && { hero: f.hero, cell: walk.cell(), mark: f.mark, bubbles: f.bubbles.map((b) => b.text), stations: walk.map.stations,
      units: f.units.map((u) => ({ id: u.id, x: u.x, y: u.y, plate: u.plate.text, alpha: u.alpha })),
      props: f.props.map((p) => ({ id: p.id, x: p.x, y: p.y, ref: p.ref })) };
  }

  /* ROUTE: which scene, and the HTML around it (title, picks, the unmapped-fight
     banner). NOT a side effect of the frame loop (live 2026-10-14: a pane opened
     with no frame ever running — a background tab — kept a 300x150 canvas and no
     word on screen): sync() steps once on every open, tab switch and visibility
     change, and every frame routes again, so the banner follows the activity. */
  let lastBanner = null;
  const monsterName = (id) => (win.MONSTERS && win.MONSTERS[id] && win.MONSTERS[id].name) || id;
  function route() {
    const G = win.G || {};
    const P = win.HearthriseProperty;
    const sc = readScene(G, homeMapFor(P && typeof P.serverPropertyTier === 'function' ? P.serverPropertyTier() : null));
    if (!scene || sc.map !== scene.map || sc.kind !== scene.kind) {
      if (!scene || sc.map !== scene.map) { backend.setMap(mapOf(sc.map)); roofAlpha = {}; }
      scene = sc;
      paintChrome(sc);
      hudAt = 0;
    }
    const banner = unmappedBanner(G, sc, monsterName);
    if (banner !== lastBanner) { lastBanner = banner; idle.innerHTML = banner || ''; }
    idle.hidden = !banner;
    return sc;
  }

  function step(dt) {
    const G = win.G || {};
    const sc = route();
    const map = mapOf(sc.map);
    const I = win.HearthriseIdentity;
    const name = (I && typeof I.displayName === 'function' && I.displayName()) || G.playerName || null;
    const now = Date.now();
    let cast;
    if (sc.kind === 'hunt') {
      cast = huntState(G, sc, map, name, now);
      walk = null; lastWalk = null;
    } else {
      hunt = null; huntMap = null; lastHunt = null;
      hud.paint(null);
      cast = walkState(G, map, now);
    }
    const targets = roofTargets(map.buildings, heroBuilding(map.buildings, cast.hero));
    for (const id of Object.keys(targets)) roofAlpha[id] = id in roofAlpha ? stepAlpha(roofAlpha[id], targets[id], dt) : targets[id];
    backend.sync(Object.assign({ name: sc.kind === 'hunt' ? null : name, roofAlpha, t: now }, cast));
    frames++;
  }

  /* NAVIGATION ONLY: Adventures, on the War Table's Hunts with hunt `id` picked. */
  function openHunt(id) {
    if (typeof win.showTab !== 'function') return false;
    win.showTab('combat');
    const CS = win.HearthriseCombatScreens;
    return !!(CS && typeof CS.showHunt === 'function' && CS.showHunt(id));
  }

  /* Where a tap goes. Every way out is a screen the game already has. */
  const nav = {
    walk: () => true,
    hunt: (id) => openHunt(id),
    skill(id) {
      if (typeof win.showTab !== 'function') return false;
      win.showTab('skills');
      if (typeof win.openSkillDetail === 'function') win.openSkillDetail(id);
      return true;
    },
    room(id) {
      const H = win.HearthriseHomestead;
      return !!(H && typeof H.openRoom === 'function' && H.openRoom(id));
    },
    house() {
      if (typeof win.showTab !== 'function') return false;
      win.showTab('house');
      return true;
    },
    scene(choice) { setChoice(win.G || {}, choice); if (running) step(0); return true; },
  };

  function onTap(e) {
    if (!walk || !scene || scene.kind === 'hunt') return;
    if (e.target && e.target.closest && e.target.closest('.world-idle')) return;   // the banner's own button
    const pick = backend.pick(e.clientX, e.clientY);
    if (!pick) return;
    runAction(walk.tap(pick, Date.now()), nav);
  }
  function onHover(e) {
    if (!walk || !scene || scene.kind === 'hunt' || e.pointerType === 'touch') return;
    const pick = backend.pick(e.clientX, e.clientY);
    const act = pick && walk.peek(pick);
    stage.classList.toggle('is-hot', !!act && act.kind !== 'walk');
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
  function onGo(e) {
    if (e.target && e.target.closest && e.target.closest('[data-world-go]') && OPEN_HUNT) openHunt(OPEN_HUNT.id);
  }
  function onChoice(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-world-choice]');
    if (!b) return;
    setChoice(win.G || {}, b.getAttribute('data-world-choice'));
    if (running) step(0);
  }
  chrome.addEventListener('click', onChoice);
  stage.addEventListener('click', onTap);
  stage.addEventListener('pointermove', onHover);
  idle.addEventListener('click', onGo);
  doc.addEventListener('visibilitychange', sync);

  return {
    sync,
    /** Paint one frame now, loop or not (a test reads the frame it just caused). */
    step: () => step(0),
    stats: () => Object.assign({ running, frames, scene: scene && scene.map, kind: scene && scene.kind, hunt: lastHunt, walk: walkStats(), hud: hud.text() }, backend.snapshot()),
    screenOf: (x, y) => backend.screenOf(x, y),
    destroy() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
      if (unsubscribe) unsubscribe();
      chrome.removeEventListener('click', onChoice);
      stage.removeEventListener('click', onTap);
      stage.removeEventListener('pointermove', onHover);
      idle.removeEventListener('click', onGo);
      doc.removeEventListener('visibilitychange', sync);
      hud.destroy();
      idle.remove();
      backend.destroy();
    },
  };
}
