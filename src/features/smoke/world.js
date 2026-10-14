// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/world.js — the World pane, opened the way a player opens it.
//
// The pane is a lazy import (BOOT-5 in tests/boot-budget.mjs proves a boot
// never pays for it); these prove the other half: the first open loads it and
// it DRAWS, the frame loop runs only while the pane is in front of a visible
// page, and the only thing it writes is the G._world display scratch.
// ══════════════════════════════════════════════════════════════════════
import { tryRunAsync, assert, snapshotG, restoreGAndRecord, stampRecordLikeLoad } from './_harness.js?v=579';
import { buildResiduePatch } from '../../net/capstone.js?v=579';

/** Tap the World stage over tile (x, y) the way a pointer does. */
function tapTile(rt, x, y) {
  const at = rt.screenOf(x, y);
  const stage = document.querySelector('#panel-world .world-stage');
  const r = stage.getBoundingClientRect();
  assert(at && at.x > r.left && at.x < r.right && at.y > r.top && at.y < r.bottom, 'tile ' + x + ',' + y + ' is not on the stage to tap: ' + JSON.stringify(at));
  stage.dispatchEvent(new MouseEvent('click', { clientX: at.x, clientY: at.y, bubbles: true }));
}

/** A town view as hr_town_of sends it, `now` server time. */
const townBody = (peers, crier) => ({ ok: true, zone: 'the_common', now: new Date().toISOString(), peers, crier: crier || [] });

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
      assert(Object.keys(window.G._world).every((k) => k === 'choice' || k === 'pos'), 'G._world holds more than the pick and the hero\'s spot: ' + JSON.stringify(window.G._world));
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

  () => tryRunAsync('WORLD-4: a fight on a rat is watched in the Mill Cellar from the Fight screen: the engaged foe is the fight\'s, every swing is observed, the overlay is the settled Analyzer', async () => {
    const hadWorld = Object.prototype.hasOwnProperty.call(window.G, '_world');
    const O = window.HearthriseCombatObserver;
    assert(O && typeof O.subscribe === 'function', 'src/render/combat-observer.js did not install HearthriseCombatObserver');
    try {
      window.startCombat('rat', { confirmed: true });
      window.showTab('combat');
      const watch = document.getElementById('fsm-world');
      assert(await until(() => watch && !watch.hidden, 3000), 'the Fight screen shows no "Watch in World" during a running fight');
      watch.click();
      const rt = await window.HearthriseWorld.load();
      assert(document.getElementById('panel-world').classList.contains('active'), '"Watch in World" did not open the World pane');
      assert(await until(() => rt.stats().kind === 'hunt' && rt.stats().hunt, 3000), 'a rat fight must show the hunt scene (' + JSON.stringify(rt.stats().scene) + ')');
      const seen = [];
      const off = O.subscribe((b) => seen.push(b));
      try { window.combatTick(); } finally { off(); }
      assert(seen.length === 1 && seen[0].foe === 'rat', 'one swing must be one observed beat: ' + JSON.stringify(seen));
      rt.step();
      const s = rt.stats();
      assert(s.hunt.foe === window.G.activeMonster, 'the engaged foe ' + s.hunt.foe + ' is not the fight\'s ' + window.G.activeMonster);
      assert(/settled \d+ (s|min|h) ago|nothing settled yet/.test(s.hud), 'the overlay must label the Analyzer with its settle age: ' + s.hud);
      assert(/Leave Hunt/.test(s.hud) && /Eat/.test(s.hud), 'the overlay must offer Eat and Leave Hunt: ' + s.hud);
    } finally {
      if (typeof window.stopCombat === 'function') window.stopCombat();
      window.showTab('profile');
      if (!hadWorld) delete window.G._world;
    }
  }),


  /* REGRESSION (live, 2026-10-14): QA Hero 2 fighting a gnoll at Ridge Camp, which has no
     world map, opened the World pane to a BLANK stage — a 300x150 canvas, the idle
     card and the hunt overlay both hidden — because the card was painted only from
     inside the frame loop (no frame on a hidden page means no card, ever), and an
     unmapped fight routed to the "coming soon" town with no word about the hunt.
     Opened here on a HIDDEN page, so not one frame runs. */
  () => tryRunAsync('WORLD-5: a fight with no world map opens the World pane to a plain card that names it, never a blank stage — even before any frame', async () => {
    const hadWorld = Object.prototype.hasOwnProperty.call(window.G, '_world');
    let hiddenStub = false;
    try {
      window.showTab('profile');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      hiddenStub = true;
      document.dispatchEvent(new Event('visibilitychange'));
      window.startCombat('gnoll', { confirmed: true });
      assert(window.G.activeMonster === 'gnoll', 'the fixture fight did not start');
      window.showTab('world');
      const rt = await window.HearthriseWorld.load();
      const panel = document.getElementById('panel-world');
      const idle = panel.querySelector('.world-idle');
      const canvas = panel.querySelector('canvas.world-canvas');
      assert(rt.stats().running === false, 'CONTROL: on a hidden page no frame may run');
      assert(idle && !idle.hidden && idle.getBoundingClientRect().height > 0, 'the World pane is blank for an unmapped fight: the idle card is hidden');
      assert(/isn.t in the World yet/.test(idle.textContent) && /Mill Cellar/.test(idle.textContent), 'the card must say, in plain words, that this hunt is not in the World yet: ' + idle.textContent);
      assert(canvas && (canvas.hidden || !(canvas.width === 300 && canvas.height === 150)), 'the canvas was left at its unsized default 300x150');
      const choice = (window.G._world && window.G._world.choice) || 'town';
      assert(rt.stats().kind === choice && rt.stats().walk && rt.stats().walk.hero, 'behind the banner the viewer\'s ' + choice + ' must be drawn, got ' + rt.stats().kind);
      delete document.hidden;
      hiddenStub = false;
      document.dispatchEvent(new Event('visibilitychange'));
      const f0 = rt.stats().frames;
      assert(await until(() => rt.stats().frames > f0 + 2, 3000), 'the loop did not resume on a visible page');
      assert(!idle.hidden, 'the card must stay up while the unmapped fight runs');
      const go = idle.querySelector('[data-world-go]');
      assert(go && /Hunt in the Mill Cellar/.test(go.textContent), 'the card offers no "Hunt in the Mill Cellar" button');
      go.click();
      assert(document.getElementById('panel-combat').classList.contains('active'), 'the button must open Adventures');
      assert(await until(() => document.querySelector('#panel-combat .wt-hunt[data-hunt="mill_cellar"].is-picked'), 2000), 'the Mill Cellar must be preselected on the War Table');
      assert(window.G.activeMonster === 'gnoll', 'the button only navigates: it must not start, stop or switch a fight (' + window.G.activeMonster + ')');
    } finally {
      if (hiddenStub) { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }
      if (typeof window.stopCombat === 'function') window.stopCombat();
      window.showTab('profile');
      if (!hadWorld) delete window.G._world;
    }
  }),

  () => tryRunAsync('WORLD-6: the Common — peers stand at their stations from the town view; a tap walks the hero in G._world only (the residue PUT never carries it); the mill hatch only navigates to Adventures on the Mill Cellar', async () => {
    const G = window.G, T = window.HearthriseTown, CS = window.HearthriseCombatScreens, CSt = window.HearthriseClientState;
    const hadWorld = Object.prototype.hasOwnProperty.call(G, '_world'), prevTown = G._town;
    const calls = [], saved = {};
    const intents = ['startCombat', 'declareActivity', 'startSkill'];
    try {
      if (typeof window.stopCombat === 'function') window.stopCombat();
      const rt = await openWorld();
      document.querySelector('#panel-world [data-world-choice="town"]').click();
      assert(await until(() => rt.stats().scene === 'town_common', 2000), 'tapping Town did not show the Common');
      T.__setTown(townBody([
        { name: 'Brannoc', activity_kind: 'combat', activity_id: 'rat', level_band: 30 },
        { name: 'Wren', activity_kind: 'gather', activity_id: 'normal_tree', level_band: 10 },
        { name: 'Ilsa', activity_kind: 'artisan', activity_id: 'bronze_bar', level_band: 20, away: true },
      ]));
      rt.step();
      const placed = rt.stats().walk.units;
      assert(placed.length === 3 && placed.every((u) => / · Lv /.test(u.plate)), 'three peers with name and level band must stand in the Common: ' + JSON.stringify(placed));
      const at = (n) => placed.find((u) => u.plate.startsWith(n + ' '));
      const st = rt.stats().walk.stations;
      const by = (u, kind) => u && st && st[kind] && Math.max(Math.abs(u.x - st[kind][0]), Math.abs(u.y - st[kind][1])) <= 2;
      assert(by(at('Brannoc'), 'combat') && by(at('Wren'), 'gather') && by(at('Ilsa'), 'artisan') && at('Ilsa').alpha < 1,
        'combat at the hatch, gathering at the woodpile, artisan (away, dimmed) at the anvil: ' + JSON.stringify({ placed, st }));
      T.__setTown(townBody([]));
      rt.step();
      assert(rt.stats().walk.units.length === 0 && !/online/i.test(document.getElementById('panel-world').textContent), 'an empty plaza shows nobody and prints no count');

      tapTile(rt, 13, 9);
      rt.step();
      assert(JSON.stringify(rt.stats().walk.mark) === '{"x":13,"y":9}', 'a tap must mark where the hero is walking: ' + JSON.stringify(rt.stats().walk));
      assert(await until(() => { const w = rt.stats().walk; return w.cell.join() === '13,9' && !w.mark; }, 5000), 'the hero never reached the tapped tile: ' + JSON.stringify(rt.stats().walk));
      const pos = G._world && G._world.pos;
      assert(pos && pos.map === 'town_common' && Math.round(pos.x) === 13 && Math.round(pos.y) === 9, 'the hero\'s spot must be held in G._world.pos: ' + JSON.stringify(G._world));
      const fields = CSt.RESIDUE_FIELDS.join();
      let body = null;
      await CSt.putClientState(buildResiduePatch(G), { url: 'https://w4.test', anonKey: 'anon', jwt: 'jwt',
        fetch: async (u, init) => { body = String(init && init.body); return { ok: true, json: async () => ({ ok: true }) }; } });
      assert(body && !body.includes('_world') && !/"pos"\s*:/.test(body) && !body.includes('town_common'), 'the residue PUT carried the world scratch: ' + String(body).slice(0, 300));
      assert(Object.isFrozen(CSt.RESIDUE_FIELDS) && CSt.RESIDUE_FIELDS.join() === fields && !CSt.RESIDUE_FIELDS.some((f) => /world|^pos$/i.test(f)),
        'RESIDUE_FIELDS must stay the frozen allowlist with no world field');

      for (const k of intents) { saved[k] = window[k]; window[k] = () => { calls.push(k); }; }
      if (CS) { saved.startHunt = CS.startHunt; CS.startHunt = () => { calls.push('startHunt'); }; }
      const monster = G.activeMonster;
      tapTile(rt, 15, 6);
      assert(document.getElementById('panel-combat').classList.contains('active'), 'the mill hatch did not open Adventures');
      assert(!CS || CS.tab === 'hunts', 'Adventures must open on its Hunts list, got ' + (CS && CS.tab));
      assert(await until(() => document.querySelector('#panel-combat .wt-hunt[data-hunt="mill_cellar"].is-picked'), 2000), 'the Mill Cellar must be preselected on the War Table');
      assert(calls.length === 0 && G.activeMonster === monster, 'the hatch must only navigate, but it called ' + calls.join(', '));
    } finally {
      for (const k of intents) if (k in saved) window[k] = saved[k];
      if (CS && 'startHunt' in saved) CS.startHunt = saved.startHunt;
      G._town = prevTown;
      window.showTab('profile');
      if (!hadWorld) delete G._world;
    }
  }),

  () => tryRunAsync('WORLD-7: your cottage — its furniture follows the server\'s room rungs and is replaced on every envelope; a piece opens its room, a signpost the House screen', async () => {
    const G = window.G, H = window.HearthriseHomestead, M = window.HearthriseRoomModal;
    const hadWorld = Object.prototype.hasOwnProperty.call(G, '_world');
    const snap = snapshotG();
    const openRoom = H && H.openRoom;
    const opened = [];
    const kitchen = () => window.HearthriseWorld.runtime().stats().walk.props.filter((p) => p.ref && (p.ref.room === 'kitchen' || p.ref.sign === 'kitchen')).map((p) => p.id).sort().join();
    try {
      if (typeof window.stopCombat === 'function') window.stopCombat();
      /* Home, with the hero standing where its kitchen wall is in view. */
      G._world = { choice: 'home', pos: { map: 'home_cottage', x: 7, y: 4 } };
      const rt = await openWorld();
      assert(await until(() => rt.stats().scene === 'home_cottage', 2000), 'the pick of Home did not show the cottage');
      const seen = [];
      for (const rooms of [{ kitchen: 2 }, { kitchen: 3 }, {}]) {
        G.rooms = rooms;
        stampRecordLikeLoad(G);
        rt.step();
        seen.push(kitchen());
      }
      assert(seen.join(' | ') === 'firewood,hearth | firewood,hearth,herbs_hanging | signpost', 'Kitchen 2 → 3 → {} must REPLACE the furniture each time, got ' + seen.join(' | '));
      assert(rt.stats().heroBuilding === 'cottage', 'the hero must be home, inside the cottage');
      tapTile(rt, 7, 2);
      assert(document.getElementById('panel-house').classList.contains('active'), 'the Kitchen\'s signpost must open the House screen');
      window.showTab('world');
      G.rooms = { kitchen: 1 };
      stampRecordLikeLoad(G);
      assert(await until(() => rt.stats().running && kitchen() === 'hearth', 2000), 'Kitchen 1 must show its hearth: ' + kitchen());
      if (H) H.openRoom = (id) => { opened.push(id); return openRoom.call(H, id); };
      tapTile(rt, 7, 2);
      assert(opened.join() === 'kitchen' && (!M || M.isOpen()), 'tapping the hearth must open the Kitchen\'s room modal, opened: ' + opened.join());
    } finally {
      if (H && openRoom) H.openRoom = openRoom;
      if (M && M.isOpen()) M.close();
      restoreGAndRecord(snap);
      window.showTab('profile');
      if (!hadWorld) delete G._world;
    }
  }),
];
