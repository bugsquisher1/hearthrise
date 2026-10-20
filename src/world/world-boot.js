// ════════════════════════════════════════════════════════════════════════
// src/world/world-boot.js — THE WORLD PANE'S RUNTIME (loaded on first open).
//
// src/app/world-pane.js boots this for ONE CharacterSession: every read goes
// through opts.view() (that character's view, src/app/world-view.js), never a
// global, so two characters on one screen never share a scene.
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
// beat as it happens, so swings taken while the pane was hidden are not lost.
// The hunt's panels (analyzer, party, bars) are the shell's (src/shell/widgets/*).
// THE LIVE HUNT: with a `hunt` section, src/hunt-view/scene.js plays the character's
// timeline on its own clock instead; the staging above is for a fight with none.
//
// THE TOWN AND THE HOME (lane W4) otherwise, as the viewer picks: walk-scene.js
// draws them from what the client holds from the server, read here into one
// `env` per frame. A tap on the canvas walks the local hero (G._world.pos) or
// names what it hit for the pane (opts.emit: a hunt's entrance, a station); no
// tap sends an intent (steer-local.js runAction). On a desktop WASD / the
// arrows walk the same feet (8 ways, stop on key-up); never while a text field
// has focus.
// THE TOWN'S PEOPLE: opts.town (src/session/town-presence.js) hears the town shown and the hero's place each frame, and gives the walkers.
// A fight on a hunt no map renders shows the viewer's town or home with a slim
// banner that names the fight and offers the hunt that IS in the World.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.18';
import { MATERIALS, OPEN_CLASSES, LIGHTS } from '../data/world/terrain.js?v=0.2.18';
import { WORLD_MAPS } from '../data/world/maps/index.js?v=0.2.18';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.18';
import { MONSTERS } from '../data/monsters.js?v=0.2.18';
import { compileMap } from './core/map-compile.js?v=0.2.18';
import { STUB_SPRITE } from './core/book.js?v=0.2.18';
import { fpsFor, MOBILE_QUERY } from './core/camera.js?v=0.2.18';
import { heroBuilding, roofTargets, stepAlpha } from './core/roofs.js?v=0.2.18';
import { readScene, setChoice, heroPosOn, notePos, forgetPos } from './store.js?v=0.2.18';
import { loadAtlases } from './atlas.js?v=0.2.18';
import { createCanvasBackend } from './render/canvas-backend.js?v=0.2.18';
import { huntOfMap } from './hunt-maps.js?v=0.2.18';
import { createHuntScene } from './hunt-scene.js?v=0.2.18';
import { createHuntScene as createLiveHunt, readHunt } from '../hunt-view/scene.js?v=0.2.18';
import { huntOf } from '../session/hunt-sections.js?v=0.2.18';
import { createWalkScene } from './walk-scene.js?v=0.2.18';
import { homeMapFor } from './home-scene.js?v=0.2.18';
import { runAction } from './steer-local.js?v=0.2.18';
import { heroSprite } from '../session/hero-look.js?v=0.2.18';
import { keyBelongsToField } from '../utils/dom.js?v=0.2.18';

/* THE KEYS (desktop): WASD and the arrows, by physical key (e.code, so a
   non-QWERTY layout walks with the same hand). Two held at once walk the
   diagonal. They drive the same feet a tap does (walk-scene drive). */
const WALK_KEYS = Object.freeze({
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
});
/* THE INPUT RULES (Tyler 10-18). Keys: the World's unless a text field has them (dom.js
   keyBelongsToField). Presses: the shell's windows sit inside the stage, so the World
   acts only on a press whose target IS its canvas, never one on a window or widget. */
const LONG_PRESS_MS = 500;
const onWorld = (e) => !!(e && e.target && e.target.classList && e.target.classList.contains('world-canvas'));

const ROWS = new Map(WORLD_MAPS.map((m) => [m.id, m]));
const ROW_OF = Object.fromEntries(WORLD_MAPS.map((m) => [m.id, m]));

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
 * speaks for itself. Its button only names that hunt's entrance (the pane opens Hunts on it).
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
function createEnvReader(win, town) {
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
      env.walkers = town ? town.walkers() : [];
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
 *   setInset({left, right, top, bottom})  CSS px of the stage a docked window covers
 *   destroy()
 * @param {HTMLElement} panel
 * @param {object} opts
 * @param {() => object} opts.view  the ONE character's view this pane shows, read every frame
 *        (src/app/world-view.js): the server's fight pointer and Analyzer plus the
 *        character's own `_world` display scratch. There is no global state to fall back to.
 * @param {object} [opts.character]  that CharacterSession: its sections and timeline drive the live hunt
 * @param {object} [opts.town]  that character's TownPresence (account.townOf(slot)): the town's people
 * @param {(kind: string, detail: object) => boolean} [opts.emit]  what a tap names: 'entrance' {hunt},
 *        'station' {skill}, 'room' {room}, 'house' {room}; true when the pane opened something
 */
export async function bootWorld(panel, opts) {
  const win = window, doc = document;
  if (!opts || typeof opts.view !== 'function') throw new TypeError('bootWorld needs opts.view: the character this pane shows');
  const view = () => opts.view() || {};
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
  let hunt = null, huntMap = null, lastHunt = null;
  const character = opts.character || null;
  let liveHunt = null;   // { map, scene, off }: the live hunt of `character`, while it hunts
  function endLive() { if (liveHunt) { liveHunt.off(); liveHunt = null; } }
  const unsubscribe = obs ? obs.subscribe((b) => { if (hunt) hunt.beat(b); }) : null;
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
  const town = opts.town || null;
  const readEnv = createEnvReader(win, town);

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

  function liveState(sc) {
    const tl = character.timeline;
    if (!liveHunt || liveHunt.map !== sc.map) {
      endLive();
      const scene = createLiveHunt({ timeline: tl, book, read: () => readHunt(character) });
      liveHunt = { map: sc.map, scene, off: tl.subscribe((ev) => scene.onEvent(ev, character.now())) };
    }
    const now = character.now();
    /* the live view's engine runs to now first (src/session/live-link.js) */
    if (typeof character.liveAdvance === 'function') character.liveAdvance(now);
    const back = typeof character.takeReseeded === 'function' ? character.takeReseeded() : null;
    if (back) liveHunt.scene.revive(back);
    tl.advance(now);
    const f = liveHunt.scene.frame(now);
    lastHunt = { live: true, units: f.units.map((u) => ({ id: u.id, unit: u.unit, x: u.x, y: u.y, anim: u.anim, frame: u.frame, dir: u.dir, diag: u.diag })),
      hero: f.hero, floats: f.floats.length, fx: f.fx.map((e) => e.id), stats: liveHunt.scene.stats() };
    return { hero: f.hero, units: f.units, floats: f.floats, fx: f.fx };
  }

  function huntState(G, sc, map, name, now) {
    if (character && huntOf(character)) return liveState(sc);
    endLive();
    if (!hunt || huntMap !== sc.map) {
      const h = huntOfMap(ROWS.get(sc.map));
      const a = G._huntAnalyzer;
      hunt = createHuntScene(map, {
        huntId: h ? h.id : sc.map, since: (a && a.started_at) || '', spawns: h ? h.spawns : [],
        nameOf: (id) => (MONSTERS[id] && MONSTERS[id].name) || id,
      });
      huntMap = sc.map;
    }
    const snap = obs ? obs.snapshot() : bareSnapshot(G);
    const hs = hunt.state(snap, now, name);
    lastHunt = { foe: hs.foe, down: hs.down, floats: hs.floats.length, units: hs.units.map((u) => u.id), hero: hs.hero };
    return { hero: hs.hero && Object.assign({}, hs.hero, { id: heroSprite(character) }), units: hs.units, floats: hs.floats };
  }

  function walkState(G, map, now) {
    if (!walk || walk.map !== map) {
      walk = createWalkScene(map, { at: heroPosOn(G, map.id), sprites, openClasses: OPEN_CLASSES, maps: ROW_OF, heroSprite: () => heroSprite(character) });
      if (keys.size) walk.drive(keyVector(), now);   // keys still held across a scene change keep walking
    }
    const f = walk.frame(readEnv(G, map.kind), now);
    notePos(G, map.id, f.hero.x, f.hero.y);
    if (town) {
      town.show(map.kind === 'town' ? map.id : null);
      if (map.kind === 'town') town.publish(f.place);
    }
    lastWalk = f;
    return f;
  }

  /** The last walk frame, as a test reads it. */
  function walkStats() {
    const f = lastWalk;
    return f && { hero: f.hero, cell: walk.cell(), mark: f.mark, bubbles: f.bubbles.map((b) => b.text), stations: walk.map.stations,
      units: f.units.map((u) => ({ id: u.id, x: u.x, y: u.y, plate: u.plate.text, alpha: u.alpha, anim: u.anim, age: u.age, dir: u.dir,
        player: u.ref && u.ref.player ? u.ref.player.id : null })),
      place: f.place,
      props: f.props.map((p) => ({ id: p.id, x: p.x, y: p.y, ref: p.ref })) };
  }

  /* ROUTE: which scene, and the HTML around it (title, picks, the unmapped-fight
     banner). NOT a side effect of the frame loop (live 2026-10-14: a pane opened
     with no frame ever running — a background tab — kept a 300x150 canvas and no
     word on screen): sync() steps once on every open, tab switch and visibility
     change, and every frame routes again, so the banner follows the activity. */
  let lastBanner = null;
  const monsterName = (id) => (MONSTERS[id] && MONSTERS[id].name) || id;
  function route() {
    const G = view();
    const P = win.HearthriseProperty;
    const sc = readScene(G, homeMapFor(P && typeof P.serverPropertyTier === 'function' ? P.serverPropertyTier() : null));
    if (!scene || sc.map !== scene.map || sc.kind !== scene.kind) {
      if (!scene || sc.map !== scene.map) { backend.setMap(mapOf(sc.map)); roofAlpha = {}; }
      scene = sc;
      paintChrome(sc);
    }
    const banner = unmappedBanner(G, sc, monsterName);
    if (banner !== lastBanner) { lastBanner = banner; idle.innerHTML = banner || ''; }
    idle.hidden = !banner;
    return sc;
  }

  function step(dt) {
    const G = view();
    const sc = route();
    const map = mapOf(sc.map);
    const I = win.HearthriseIdentity;
    const name = (I && typeof I.displayName === 'function' && I.displayName()) || G.playerName || null;
    const now = Date.now();
    let cast;
    if (sc.kind === 'hunt') {
      cast = huntState(G, sc, map, name, now);
      walk = null; lastWalk = null; keys.clear(); forgetPos(G);   // back in town: the arrival point
      if (town) town.show(null);
    } else {
      hunt = null; huntMap = null; lastHunt = null; endLive();
      cast = walkState(G, map, now);
    }
    const targets = roofTargets(map.buildings, heroBuilding(map.buildings, cast.hero));
    for (const id of Object.keys(targets)) roofAlpha[id] = id in roofAlpha ? stepAlpha(roofAlpha[id], targets[id], dt) : targets[id];
    backend.sync(Object.assign({ name: sc.kind === 'hunt' ? null : name, roofAlpha, t: now }, cast));
    frames++;
  }

  /* The World knows no window: it names what was tapped and the pane opens one. */
  const emit = (kind, detail) => (typeof opts.emit === 'function' ? opts.emit(kind, detail) === true : false);

  /* Where a tap goes: the hero's feet, the scene picker, or a named thing for the pane. */
  const nav = {
    walk: () => true,
    hunt: (id) => emit('entrance', { hunt: id }),
    skill: (id) => emit('station', { skill: id }),
    room: (id) => emit('room', { room: id }),
    house: (id) => emit('house', { room: id }),
    scene(choice) { setChoice(view(), choice); if (running) step(0); return true; },
  };

  /* THE ENTITY CONTEXT: a right-click (or a long press) on the canvas names what is under it to the
     pane as ONE 'entity' event {hits, x, y}; the pane's menu decides, the World never walks on it. */
  let press = 0, pressAt = null, swallowUntil = 0;
  function context(x, y) { const pick = backend.pick(x, y); if (pick) emit('entity', { hits: pick.hits, x, y }); }
  function onContext(e) { if (!onWorld(e)) return; e.preventDefault(); context(e.clientX, e.clientY); }
  function onPressDown(e) {
    if (!onWorld(e) || !e.pointerType || e.pointerType === 'mouse') return;
    pressAt = [e.clientX, e.clientY];
    win.clearTimeout(press);
    press = win.setTimeout(() => { swallowUntil = Date.now() + 800; context(pressAt[0], pressAt[1]); }, LONG_PRESS_MS);
  }
  function onPressEnd() { win.clearTimeout(press); }
  function onPressMove(e) { if (pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 8) win.clearTimeout(press); }

  function onTap(e) {
    if (Date.now() < swallowUntil) { swallowUntil = 0; return; }   // the click a long press leaves behind
    if (!walk || !scene || scene.kind === 'hunt' || !onWorld(e)) return;
    const pick = backend.pick(e.clientX, e.clientY);
    if (!pick) return;
    runAction(walk.tap(pick, Date.now()), nav);
  }
  function onHover(e) {
    if (!walk || !scene || scene.kind === 'hunt' || e.pointerType === 'touch') return;
    if (!onWorld(e)) { stage.classList.remove('is-hot'); return; }
    const pick = backend.pick(e.clientX, e.clientY);
    const act = pick && walk.peek(pick);
    stage.classList.toggle('is-hot', !!act && act.kind !== 'walk');
  }

  /* Held walk keys (e.code), and the direction they add up to. */
  const keys = new Set();
  function keyVector() {
    let x = 0, y = 0;
    for (const k of keys) { x += WALK_KEYS[k][0]; y += WALK_KEYS[k][1]; }
    return [Math.sign(x), Math.sign(y)];
  }
  function steerKeys() { if (walk) walk.drive(keyVector(), Date.now()); }
  /** Let go of every walk key (focus left, the pane closed, a field or dialog took the keys). */
  function letGo() { if (!keys.size) return; keys.clear(); steerKeys(); }
  function onKeyDown(e) {
    if (!WALK_KEYS[e.code] || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!live() || !walk || !scene || scene.kind === 'hunt') return;
    const t = e.target;
    if (keyBelongsToField(t, e.code)) { letGo(); return; }
    e.preventDefault();   // the arrows would scroll the page
    if (keys.has(e.code)) return;   // auto-repeat
    keys.add(e.code);
    steerKeys();
  }
  function onKeyUp(e) { if (keys.delete(e.code)) steerKeys(); }
  function onFocusIn(e) { if (keyBelongsToField(e.target, '')) letGo(); }

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
      letGo();
    }
  }
  function onGo(e) {
    if (e.target && e.target.closest && e.target.closest('[data-world-go]') && OPEN_HUNT) emit('entrance', { hunt: OPEN_HUNT.id });
  }
  function onChoice(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-world-choice]');
    if (!b) return;
    setChoice(view(), b.getAttribute('data-world-choice'));
    if (running) step(0);
  }
  chrome.addEventListener('click', onChoice);
  stage.addEventListener('click', onTap);
  stage.addEventListener('contextmenu', onContext);
  stage.addEventListener('pointerdown', onPressDown);
  stage.addEventListener('pointerup', onPressEnd);
  stage.addEventListener('pointercancel', onPressEnd);
  stage.addEventListener('pointermove', onPressMove);
  stage.addEventListener('pointermove', onHover);
  idle.addEventListener('click', onGo);
  doc.addEventListener('visibilitychange', sync);
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  doc.addEventListener('focusin', onFocusIn);
  win.addEventListener('blur', letGo);   // a key let go in another window never sends its keyup here

  return {
    sync,
    /** Paint one frame now, loop or not (a test reads the frame it just caused). */
    step: () => step(0),
    stats: () => Object.assign({ running, frames, scene: scene && scene.map, kind: scene && scene.kind, hunt: lastHunt, walk: walkStats() }, backend.snapshot()),
    screenOf: (x, y) => backend.screenOf(x, y),
    /**
     * The shell's docked windows: the strips of the stage they cover, in CSS px
     * ({left, right, top, bottom}; null when none). The camera frames the rest
     * from the next frame on, so a window never covers the hero.
     */
    setInset(o) { backend.setInset(o); if (panel.classList.contains('active')) step(0); },
    destroy() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
      if (unsubscribe) unsubscribe();
      endLive();
      if (town) town.park();   // another character is viewed: this one stays in town
      chrome.removeEventListener('click', onChoice);
      stage.removeEventListener('click', onTap);
      stage.removeEventListener('contextmenu', onContext);
      stage.removeEventListener('pointerdown', onPressDown);
      stage.removeEventListener('pointerup', onPressEnd);
      stage.removeEventListener('pointercancel', onPressEnd);
      stage.removeEventListener('pointermove', onPressMove);
      win.clearTimeout(press);
      stage.removeEventListener('pointermove', onHover);
      idle.removeEventListener('click', onGo);
      doc.removeEventListener('visibilitychange', sync);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('keyup', onKeyUp);
      doc.removeEventListener('focusin', onFocusIn);
      win.removeEventListener('blur', letGo);
      idle.remove();
      backend.destroy();
    },
  };
}
