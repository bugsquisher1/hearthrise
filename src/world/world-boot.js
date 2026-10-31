// ════════════════════════════════════════════════════════════════════════
// src/world/world-boot.js — THE WORLD PANE'S RUNTIME (loaded on first open).
//
// src/app/world-pane.js boots this for ONE CharacterSession: every read goes through
// opts.view() (src/app/world-view.js), never a global, so two characters never share a scene.
//
// THE LOOP runs on requestAnimationFrame ONLY while #panel-world is active AND the page is
// visible (sync() cancels a pending frame at once); 30 fps under the mobile query, 60 elsewhere.
// Each frame reads the scene from server-held state (store.js), steps the roof fades, and
// hands the backend one state object.
//
// THE HUNT (lane W3): a fight a map renders with no live `hunt` section is staged by
// hunt-scene.js from the view's bare snapshot (the old client's swing observer is gone).
// THE LIVE HUNT: with a `hunt` section, src/hunt-view/scene.js plays the timeline instead. That
// scene is the CHARACTER'S (liveSceneOf), so a switch of the viewed character keeps its deaths.
//
// THE TOWN AND THE HOME (lane W4) otherwise: walk-scene.js draws them from one `env` per frame
// read from server copies. A tap walks the local hero or names what it hit for the pane
// (opts.emit); no tap sends an intent (steer-local.js). WASD / arrows walk 8 ways unless a
// text field has focus. opts.town (src/session/town-presence.js) gives the walkers and is the
// one record of where this body stands in town (placeOn: a switch is not a move).
// A fight on a hunt no map renders shows town or home with a slim banner offering the mapped hunt.
// THE 64 PX SANDBOX: another art grid, loaded on first entry; its presence rule is sandbox-scene.js.
// THE GREAT HEARTH (hearth-burn.js): a town frame's fuel throws, flame colour and "+N Inner Flame", from server answers.
// THE ART BY SCENE (atlas.js, scene-sets.js): every manifest on the first open, but a sheet only when a
// scene drawing from it shows. The first scene opens whole; a later one (a ground entered, the town after
// a hunt) switches once its sheets have arrived, the last frame holding meanwhile.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.76';
import { OPEN_CLASSES } from '../data/world/terrain.js?v=0.2.76';
import { WORLD_MAPS, SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.76';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.76';
import { MONSTERS } from '../data/monsters.js?v=0.2.76';
import { compileMap } from './core/map-compile.js?v=0.2.76';
import { createBook } from './core/book.js?v=0.2.76';
import { fpsFor, MOBILE_QUERY } from './core/camera.js?v=0.2.76';
import { heroBuilding, roofTargets, stepAlpha } from './core/roofs.js?v=0.2.76';
import { readScene, setChoice, heroPosOn, notePos, forgetPos } from './store.js?v=0.2.76';
import { loadManifests, createSceneImages, loadAtlasSet, baseTables } from './atlas.js?v=0.2.76';
import { sceneSetsSliced } from './scene-sets.js?v=0.2.76';
import { prewarmedSets, stopPrewarm } from './prewarm.js?v=0.2.76';
import { createGridArt, sandboxExtras, presenceFor } from './sandbox-scene.js?v=0.2.76';
import { createCanvasBackend } from './render/canvas-backend.js?v=0.2.76';
import { huntOfMap } from './hunt-maps.js?v=0.2.76';
import { createHuntScene } from './hunt-scene.js?v=0.2.76';
import { liveSceneOf, endLiveScene } from '../hunt-view/scene.js?v=0.2.76';
import { huntOf } from '../session/hunt-sections.js?v=0.2.76';
import { createWalkScene } from './walk-scene.js?v=0.2.76';
import { createTownZoom } from './town-zoom.js?v=0.2.76';
import { homeMapFor, homeEnv } from './home-scene.js?v=0.2.76';
import { runAction } from './steer-local.js?v=0.2.76';
import { heroSprite } from '../session/hero-look.js?v=0.2.76';
import { keyBelongsToField } from '../utils/dom.js?v=0.2.76';
import { homeOf } from '../session/home-sections.js?v=0.2.76';
import { skillsOf } from '../session/item-sections.js?v=0.2.76';
import { createHearthView } from './hearth-burn.js?v=0.2.76';

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

/** The fight as the view holds it, for a fight with no live `hunt` section (no swing beats arrive). */
function bareSnapshot(G) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { foe: G.activeMonster || null, foeHp: n(G.monsterHp), foeMaxHp: n(G.monsterMaxHp), heroHp: n(G.playerHp),
    heroMaxHp: n(G.playerMaxHp), kills: n(G.combatKillsThisFoe), tickMs: 0, down: null };
}

/** The hunt the World can show today — the first hunt map's — named from the data. */
const OPEN_HUNT = huntOfMap(WORLD_MAPS.find((m) => m.kind === 'hunt'));
const standKeyOf = (town) => {
  const me = town && typeof town.me === 'function' ? town.me() : null;
  return me ? me.station + ':' + me.stand + ':' + me.since : null;
};
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

/** The account's `home` section (session/home-sections.js), re-parsed only when an envelope replaces it. */
function createHomeReader(character) {
  let raw, env = homeEnv(null);
  return function homeNow() {
    const now = character && typeof character.read === 'function' ? character.read('home') : undefined;
    if (now !== raw) { raw = now; env = homeEnv(homeOf(character)); }
    return env;
  };
}

/** What the town or home reads this frame (fails safe: no rooms, nobody; trophies unknown → an empty-wall caption). */
function createEnvReader(homeNow, town) {
  return function readEnv(kind) {
    if (kind !== 'home') return { walkers: town ? town.walkers() : [] };
    const h = homeNow();
    return { rooms: h.rooms, trophies: null, roomName: h.roomName };
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
 * @param {() => object[]} [opts.peers]  the account's open CharacterSessions (your other heroes' looks in a hunt)
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
  /* THE WORLD'S TOKENS, READ ONCE (a read per colour re-ran style dozens of times a frame), until an <html>/<body> attribute or a resize can change them. */
  const tokens = new Map();
  const css = (name) => { let v = tokens.get(name); if (v === undefined) tokens.set(name, v = styles.getPropertyValue(name).trim()); return v; };
  /* ...and a changed token is the one change a draw list cannot show: the next frame paints whatever it holds */
  let tokensChanged = null;
  const forgetTokens = () => { tokens.clear(); if (tokensChanged) tokensChanged(); };
  const tokenWatch = typeof win.MutationObserver === 'function' ? new win.MutationObserver(forgetTokens) : null;
  if (tokenWatch) { tokenWatch.observe(doc.documentElement, { attributes: true }); tokenWatch.observe(doc.body, { attributes: true }); }
  win.addEventListener('resize', forgetTokens);
  /* EVERY manifest (the book: footprints and sets), but an image only when a scene drawing from it shows. */
  const book = createBook(await loadManifests({ doc, version: BUILD.cache }));
  /* A sprite no loaded atlas carries compiles as a one-tile stub, never a crash. */
  const tables = baseTables(book);
  const sheets = createSceneImages({ doc, version: BUILD.cache });
  const backend = createCanvasBackend({ win, doc, book, images: sheets.images, tables, css });
  tokensChanged = () => backend.invalidate();
  const gridArt = createGridArt({ doc, version: BUILD.cache, tables, loadSet: loadAtlasSet });
  const artOf = (id) => gridArt.art(ROWS.get(id).grid);
  const character = opts.character || null;
  const compiled = new Map();
  const mapOf = (id) => {
    if (!compiled.has(id)) compiled.set(id, compileMap(ROWS.get(id), (artOf(id) || { tables }).tables));
    return compiled.get(id);
  };
  /* EVERY HEAVY STEP OF A SCENE runs in slices, each a task of its own (compose.js sliced); a pane closed stops them */
  let gone = false;   // destroyed
  const slices = { later: (fn) => win.setTimeout(() => { if (!gone) fn(); }, 0), now: () => win.performance.now() };
  /* THE SHEETS A BASE-GRID SCENE DRAWS FROM (scene-sets.js; its ground first), once per map; another grid's art is gridArt's. */
  const needs = new Map();
  const setsOf = async (id) => {
    const grid = ROWS.get(id).grid;
    /* the town's sets made at sign-in (prewarm.js) are taken as they are; else that pass stops and this one makes them (one pass at a time) */
    const pre = grid && grid !== 'base' ? null : prewarmedSets(win, id);
    if (!pre) stopPrewarm(win);
    if (!needs.has(id)) needs.set(id, grid && grid !== 'base' ? [] : pre || await sceneSetsSliced(mapOf(id), ROWS.get(id), book, tables, slices));
    return needs.get(id);
  };
  /* A SCENE MADE READY: its sheets, those sheets loaded, its ground binned for the chunks (tests/perf-budget.mjs PB-HELD) */
  const prepareScene = async (id) => {
    await sheets.ensure(await setsOf(id));
    if (gone) return;   // a sheet landing after the pane closed ends here; sync() checks again
    await backend.prepare(mapOf(id), artOf(id) || undefined, slices);
  };
  const homeNow = createHomeReader(character);
  /* THE FIRST SCENE OPENS WHOLE: made ready before the first frame (another grid's scene opens on the Common
     while its own art loads, route below). */
  const first = readScene(view(), homeMapFor(homeNow().tier)).map;
  await prepareScene((await setsOf(first)).length ? first : SCENE_MAPS.town);
  stage.querySelectorAll('.world-status').forEach((el) => el.remove());
  backend.mount(stage);

  let hunt = null, huntMap = null, lastHunt = null;
  /* the live hunt of `character`, while it hunts: ended here only when its hunt is over (S5) */
  function endLive() { if (character) endLiveScene(character); }
  const idle = doc.createElement('div');
  idle.className = 'world-idle';
  idle.setAttribute('role', 'status');
  idle.hidden = true;
  stage.appendChild(idle);

  const mq = typeof win.matchMedia === 'function' ? win.matchMedia(MOBILE_QUERY) : null;
  /* THE TOWN ZOOM (town-zoom.js): the viewer's pick over the town, the screen class's anywhere else */
  const zoom = createTownZoom({ win, doc, stage, character, mq, onChange: () => { if (!running) sync(); } });
  let running = false, raf = 0, last = 0, frames = 0, scene = null, roofAlpha = {};
  let walk = null, lastWalk = null;
  let walkPlaced = true, walkStand = null;   // the town walk began on the server's place; the stand key (station:stand:since) it last walked to
  const town = opts.town || null;
  const readEnv = createEnvReader(homeNow, town);
  let hearthView = null, hearthMap = null;

  /* THE GREAT HEARTH in a town frame, display only; the book's own sprites (an unloaded colour draws the plain fire) */
  function hearthState(map, f, now) {
    if (hearthMap !== map) { hearthMap = map; hearthView = createHearthView(map, { sprites: book.sprites }); }
    const s = character && typeof character.read === 'function' ? character.read('state') : null;
    const sk = character ? skillsOf(character) : null;
    return hearthView.frame({ place: f.place, units: f.units, walkers: town.walkers(), me: town.me(), hero: f.hero,
      active: s && s.active_kind === 'artisan' ? s.active_id : null, burn: town.lastBurn(), flame: town.hearth(),
      xp: sk && sk.inner_flame && Number.isFinite(sk.inner_flame.xp) ? sk.inner_flame.xp : null }, now);
  }

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
    const session = (huntOf(character) || {}).sessionId || null; // one scene per session: unit ids restart (timeline.js T10)
    const scene = liveSceneOf(character, { key: sc.map + '|' + session, book, peers: opts.peers });
    const now = character.now();
    /* the live view's engine runs to now first (src/session/live-link.js) */
    if (typeof character.liveAdvance === 'function') character.liveAdvance(now);
    /* A CATCH-UP STILL RUNNING IN SLICES (live-link.js advance): the last frame stays until it lands, or the skipped span replays its deaths (LV-29). */
    if (character.liveLink && character.liveLink.catchingUp()) return null;
    const back = typeof character.takeReseeded === 'function' ? character.takeReseeded() : null;
    if (back) scene.revive(back, now);
    /* what the live view did (verdicts, restarts), readable from the page for a live check: data-live */
    const ls = typeof character.liveStats === 'function' ? character.liveStats() : null;
    const key = ls ? Object.entries(ls).map(([k, v]) => k + '=' + v).join(' ') : '';
    if (stage && stage.dataset.live !== key) stage.dataset.live = key;
    tl.advance(now);
    const f = scene.frame(now);
    lastHunt = { live: true, units: f.units.map((u) => ({ id: u.id, unit: u.unit, x: u.x, y: u.y, anim: u.anim, frame: u.frame, dir: u.dir, diag: u.diag })),
      hero: f.hero, floats: f.floats.length, fx: f.fx.map((e) => e.id), stats: scene.stats() };
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
    const snap = bareSnapshot(G);
    const hs = hunt.state(snap, now, name);
    lastHunt = { foe: hs.foe, down: hs.down, floats: hs.floats.length, units: hs.units.map((u) => u.id), hero: hs.hero };
    return { hero: hs.hero && Object.assign({}, hs.hero, { id: heroSprite(character) }), units: hs.units, floats: hs.floats };
  }

  function walkState(G, map, now) {
    /* ONE POSITION SOURCE: in town the body's place is the TownPresence's (where everyone else sees it
       stand, kept across a switch of the viewed character); at home it is the character's scratch */
    const held = !!town && map.kind === 'town';
    /* a town walk begun before the server named this hero's place starts again ON it (no client-chosen tile, §6) */
    if (!walk || walk.map !== map || (held && !walkPlaced && town.placeOn(map.id))) {
      const at = held ? town.placeOn(map.id) : heroPosOn(G, map.id);
      walkPlaced = !held || !!at;
      walkStand = held ? standKeyOf(town) : null;
      /* set down by the server mid-walk (back from a hunt into a resumed activity): it walks on to its stand */
      const me = held && typeof town.me === 'function' ? town.me() : null;
      if (me && at && at[0] === me.x && at[1] === me.y && (me.x !== me.at[0] || me.y !== me.at[1])) walkStand = null;
      const mapSprites = (artOf(map.id) || { tables }).tables.sprites;
      walk = createWalkScene(map, Object.assign({ at, sprites: mapSprites, openClasses: OPEN_CLASSES, maps: ROW_OF, heroSprite: () => heroSprite(character) },
        sandboxExtras(map, mapSprites)));
      if (keys.size) walk.drive(keyVector(), now);   // keys still held across a scene change keep walking
    }
    /* THE SERVER MOVED ITS STAND (an activity, a hunt's end, a counter): it walks there, display only (town-stands) */
    if (held && walkPlaced) {
      const k = standKeyOf(town);
      if (k && k !== walkStand) { walkStand = k; walk.goTo(town.me().at, now); }
    }
    const f = walk.frame(readEnv(map.kind), now);
    if (held && map.kind === 'town') Object.assign(f, hearthState(map, f, now));
    if (!held) notePos(G, map.id, f.hero.x, f.hero.y);
    presenceFor(town, map, f.place);
    lastWalk = f;
    return f;
  }

  /** The last walk frame, as a test reads it. */
  function walkStats() {
    const f = lastWalk;
    return f && { hero: f.hero, cell: walk.cell(), mark: f.mark, bubbles: f.bubbles.map((b) => b.text), stations: walk.map.stations,
      units: f.units.map((u) => ({ id: u.id, x: u.x, y: u.y, plate: u.plate ? u.plate.text : null, alpha: u.alpha, anim: u.anim, age: u.age, dir: u.dir,
        player: u.ref && u.ref.player ? u.ref.player.id : null })),
      place: f.place,
      props: f.props.map((p) => ({ id: p.id, x: p.x, y: p.y, ref: p.ref })),
      /* the Great Hearth's effects this frame (hearth-burn.js), for a test or a look */
      hearth: { fx: (f.fx || []).map((e) => e.id), swap: f.ambientSwap || null, floats: (f.floats || []).map((x) => x.text) } };
  }

  /* ROUTE: which scene, and the HTML around it (title, picks, the unmapped-fight
     banner). NOT a side effect of the frame loop (live 2026-10-14: a pane opened
     with no frame ever running — a background tab — kept a 300x150 canvas and no
     word on screen): sync() steps once on every open, tab switch and visibility
     change, and every frame routes again, so the banner follows the activity. */
  let lastBanner = null;
  const waiting = new Set();   // the maps whose sheets are being asked for
  const monsterName = (id) => (MONSTERS[id] && MONSTERS[id].name) || id;
  function route() {
    const G = view();
    let sc = readScene(G, homeMapFor(homeNow().tier));
    const grid = ROWS.get(sc.map).grid;
    if (grid && grid !== 'base' && !artOf(sc.map)) {
      /* ANOTHER GRID'S ART IS STILL LOADING: the Common stays on screen; a failed load sends the viewer back to it */
      gridArt.ensure(grid).then((ok) => { if (!ok) setChoice(view(), 'town'); if (!running) sync(); });
      sc = { map: SCENE_MAPS.town, kind: 'town' };
    }
    if (!needs.has(sc.map) || !sheets.ready(needs.get(sc.map)) || waiting.has(sc.map)) {
      /* A SCENE NOT YET SHOWN (a ground entered, the town after a hunt): the frame showing stays until it is
         ready, then the scene switches whole: no stub boxes, and never one map's units on another. Each heavy
         step is a task of its own, never a frame's (tests/perf-budget.mjs PB-HELD): its ground (made once,
         compose.js groundOf), the sheets it draws from, those sheets loaded, then its ground binned. */
      if (!waiting.has(sc.map)) {
        waiting.add(sc.map);
        const id = sc.map;
        new Promise((done) => win.setTimeout(done, 0)).then(() => (gone ? null : prepareScene(id)))
          .then(() => { waiting.delete(id); if (!running) sync(); },
            (e) => console.error('[world] the scene "' + id + '" could not be prepared', e));
      }
      return null;
    }
    if (!scene || sc.map !== scene.map || sc.kind !== scene.kind) {
      if (!scene || sc.map !== scene.map) { backend.setMap(mapOf(sc.map), artOf(sc.map) || undefined); roofAlpha = {}; }
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
    if (!sc) return;   // the next scene's sheets are loading: the last frame stays on screen
    backend.setZoom(zoom.zoomOf(sc.kind));
    zoom.show(sc.kind);
    const map = mapOf(sc.map);
    const name = G.playerName || null;
    const now = Date.now();
    let cast;
    if (sc.kind === 'hunt') {
      cast = huntState(G, sc, map, name, now);
      if (!cast) return;   // a live catch-up still running in slices: the last frame stays on screen
      walk = null; lastWalk = null; keys.clear(); forgetPos(G);   // back in town: on the stand the server gives it
      if (town) town.show(null);
    } else {
      hunt = null; huntMap = null; lastHunt = null; endLive();
      cast = walkState(G, map, now);
    }
    const targets = roofTargets(map.buildings, heroBuilding(map.buildings, cast.hero));
    for (const id of Object.keys(targets)) roofAlpha[id] = id in roofAlpha ? stepAlpha(roofAlpha[id], targets[id], dt) : targets[id];
    /* a new map's (or zoom's) first view bakes its ground a slice a frame first: the last frame stays meanwhile */
    if (!backend.ready(cast)) return;
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
    window: (id) => emit('keeper', { window: id }),
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
  /* A FRAME THAT THROWS never stops the loop (the next frame is asked for before the step runs) and is
     said ONCE per error, not 60 times a second (Sentry JAVASCRIPT-4C). */
  const said = new Set();
  function failedFrame(e) {
    const key = String((e && e.message) || e);
    if (said.has(key) || said.size >= 20) return;
    said.add(key);
    console.error('[world] a frame failed', e);
  }
  function frame(t) {
    raf = 0;
    if (!live()) { running = false; return; }
    raf = win.requestAnimationFrame(frame);
    if (last && t - last < 1000 / fpsFor(!!(mq && mq.matches)) - 2) return;
    const dt = last ? t - last : 0;
    last = t;
    try { step(dt); } catch (e) { failedFrame(e); }
  }
  function sync() {
    /* One frame NOW whenever the pane is in front and its loop is not already
       running, so the canvas is sized and the scene, card and overlay are
       painted before (and without) any requestAnimationFrame. A running loop
       paints the change on its next frame: a second draw in the same frame was
       the whole cost of every server answer (tests/perf-budget.mjs). A throw
       here must not leave the loop state wrong, so it is reported and the loop
       decision still runs. A sheet or grid art landing after destroy() draws nothing (the presence stays parked). */
    if (gone) return;
    if (panel.classList.contains('active') && !(running && live())) {
      try { step(0); } catch (e) { failedFrame(e); }
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
     * from the next frame on, so a window never covers the hero: drawn now only
     * when the loop is not running (sync's rule; the shell hands a new pane its inset at once).
     */
    setInset(o) { if (gone) return; backend.setInset(o); if (panel.classList.contains('active') && !(running && live())) step(0); },
    destroy() {
      gone = true;
      if (tokenWatch) tokenWatch.disconnect();
      win.removeEventListener('resize', forgetTokens);
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0; running = false;
      /* the live scene stays the character's (S5): shown again, it still knows every death it played */
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
      zoom.destroy();
      backend.destroy();
    },
  };
}
