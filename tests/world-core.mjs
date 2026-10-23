#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-core.mjs — THE WORLD RENDERER'S RULES, ON THE REAL MODULES AND ART
//
//   node tests/world-core.mjs             the guard
//   node tests/world-core.mjs --selftest  every planted defect must be caught
//   node tests/world-core.mjs --hashes    print each map's mask hash (authoring aid)
//
// The pure half of the World pane (src/world/core/*, the map rows, the shipped
// atlas manifests) decides every pixel's order and position; the canvas only
// executes the list. So the rules are asserted here, in node, on the same
// compose step and the same manifest book the canvas uses
// (src/world/render/null-backend.js):
//   Z  y-sort: north of a wall face is behind it, beside it (same row) is in
//      front; a tree likewise, by the interpolated feet row
//   R  roofs: only the LOCAL hero's building lifts; a peer inside lifts
//      nothing; that building is drawn from inside (north face, south stub,
//      doorway open), every other from its front; 150 ms fade
//   S  shadows: manifest ellipses at the contact point; cast silhouettes fall
//      down-right in proportion to height; one mask; hung art is lifted
//   C  ONE pixel density per screen class (x2, x3 above 2400 CSS px wide; no
//      per-room fit), one-device-pixel camera steps, and the camera inset: a
//      docked window never covers the hero, a small room centres in the
//      uncovered part
//   L  map lint over every shipped map, and over planted bad rows (whole
//      tiles, doors, roofs, reachability of walked maps, the wall kit, stations
//      in plain view)
//   P  8-way A* never cuts a corner
//   W  the Wang vertex grid melts lone tiles and keeps plains whole; a fill
//      floor is laid in its cycle order
//   G  scene routing; missing art compiles and draws as a stub; the canvas
//      draws the layers in the plan's order
//
// --selftest copies the module closure (and the manifests) to a temp dir,
// plants one defect per rule family into the copy (never the tree), and
// requires the named family to go red — after a clean control.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const argv = process.argv.slice(2);

async function load(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + V);
  const [grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, sets, budget] = await Promise.all([
    'src/world/core/grid.js', 'src/world/core/zsort.js', 'src/world/core/roofs.js', 'src/world/core/shadows.js',
    'src/world/core/camera.js', 'src/world/core/map-compile.js', 'src/world/core/path.js', 'src/world/core/wang.js',
    'src/world/core/scene-route.js', 'src/world/core/compose.js', 'src/world/render/null-backend.js',
    'src/world/core/book.js', 'src/data/world/maps/index.js', 'src/data/world/terrain.js', 'src/data/hunts.js',
    'src/data/world/atlas-sets.js', 'src/data/world/art-budget.js',
  ].map(imp));
  const manifests = {};
  /* every set on any grid (atlas-sets.js LOADED_SETS): the sandbox map lints against its own grid's art */
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return { grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, budget, manifests,
    canvasSrc: readFileSync(join(base, 'src/world/render/canvas-backend.js'), 'utf8'),
    worldCss: readFileSync(join(ROOT, 'src/styles/world.css'), 'utf8') };
}

/** Every check, against one loaded module set. Returns [{ id, msg }] failures. */
function check(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push({ id, msg }); };
  /* A family that throws is red for that family (a mutant may crash a rule, not the guard). */
  const fam = (id, body) => { try { body(); } catch (e) { fails.push({ id: id + '!', msg: 'threw: ' + (e && e.message) }); } };
  const T = M.grid.T;
  const book = M.bookm.createBook(M.manifests);
  const tables = { materials: M.terrain.MATERIALS, sprites: book.sprites, openClasses: M.terrain.OPEN_CLASSES,
    treeClasses: M.terrain.TREE_CLASSES, lights: M.terrain.LIGHTS, terrains: book.terrains };
  const rows = Object.fromEntries(M.maps.WORLD_MAPS.map((m) => [m.id, m]));
  /* KIT FIXTURES: the shipped town and home draw their buildings as whole style-1 sprites or
     paint them into the ground, so the engine's wall-kit buildings (wall slices, roofs fading
     over the one you stand in, the inside view) are proven on these planted rows: the real
     maps with their old kit buildings back, the kit pieces drawn as stubs (no atlas carries
     them; the draw ORDER and placement are what is under test, not pixels). */
  const kitTown = Object.assign({}, rows.town_common, {
    objects: rows.town_common.objects.filter((o) => !['smithy', 'mill', 'water_trough'].includes(o.id)),
    buildings: [
      { id: 'smithy', rect: [1, 1, 7, 5], wall: 'timber', floor: 'plank_floor', doors: [[4, 5]], windows: [2, 6], chimney: 6, closed: true, roof: { rect: [1, 1, 7, 5], kind: 'roof_wood' } },
      { id: 'mill', rect: [13, 0, 6, 5], wall: 'stone_house', floor: 'plank_floor', doors: [[16, 4]], windows: [14, 17], chimney: 14, closed: true, roof: { rect: [13, 0, 6, 5], kind: 'roof_slate' } },
    ] });
  const kitHome = Object.assign({}, rows.home_cottage, {
    objects: rows.home_cottage.objects.filter((o) => o.id !== 'neighbour_cottage'),
    buildings: [
      { id: 'cottage', rect: [2, 1, 12, 10], wall: 'plank', floor: 'plank_floor', doors: [[8, 10]], windows: [], chimney: null, roof: { rect: [2, 1, 12, 10], kind: 'roof_wood' } },
      { id: 'neighbour', rect: [16, 1, 5, 5], wall: 'timber', floor: 'plank_floor', doors: [[18, 5]], windows: [17, 20], chimney: 19, closed: true, roof: { rect: [16, 1, 5, 5], kind: 'roof_slate' } },
    ] });
  const fixtures = { _kit_town: kitTown, _kit_home: kitHome };
  const compiled = (id) => M.mapc.compileMap(rows[id] || fixtures[id], tables);
  const frame = (id, hero, extra = {}, view) => {
    const b = M.nullb.createNullBackend({ book, tables, view });
    b.mount(); b.setMap(compiled(id)); b.sync(Object.assign({ hero, name: 'Hero', t: 0 }, extra));
    return b.snapshot().last;
  };
  const wide = { w: 60 * T, h: 40 * T };
  const at = (list, pred) => list.findIndex(pred);
  /* the hero is drawn in its style-1 outfit; the knight's when the state names none (src/session/hero-look.js) */
  const HERO = 'outfit_knight';
  const heroIdx = (f) => at(f.sprites, (s) => s.id === HERO);
  const firstAt = (f, pred) => at(f.sprites, pred);

  fam('Z', () => {
    const millFace = (d) => d.kind === 'wall' && d.ty === 4 && d.tx >= 13 && d.tx <= 18;
    const north = frame('_kit_town', { x: 12, y: 3 }, {}, wide);
    ok('Z1', firstAt(north, millFace) >= 0 && heroIdx(north) < firstAt(north, millFace), 'a hero north of the mill\'s front row must draw BEHIND its wall slices');
    const beside = frame('_kit_town', { x: 12, y: 4 }, {}, wide);
    ok('Z1', heroIdx(beside) > at(beside.sprites, (d, i) => millFace(d) && !beside.sprites.slice(i + 1).some(millFace)), 'a hero beside a wall slice on the same row must draw in front of all of them');
    const oak = (f) => at(f.sprites, (d) => d.id === 'oak');
    const n = frame('town_common', { x: 9, y: 2 }), s = frame('town_common', { x: 9, y: 4 });
    ok('Z2', heroIdx(n) < oak(n) && heroIdx(s) > oak(s), 'a hero north of a tree must draw behind it, south in front');
    const m1 = frame('town_common', { x: 9, y: 2.5 }), m2 = frame('town_common', { x: 9, y: 3.5 });
    ok('Z2', heroIdx(m1) < oak(m1) && heroIdx(m2) > oak(m2), 'a moving hero is keyed by its INTERPOLATED row');
    const items = [{ row: 2 }, { row: 2 }, { row: 1 }, { row: 1.5 }];
    const a = M.zsort.ySort(items).map((d) => d.seq).join(), b = M.zsort.ySort(items).map((d) => d.seq).join();
    ok('Z3', a === b && a === '2,3,0,1', 'ySort must be total and stable (got ' + a + ')');
    for (const id of Object.keys(rows)) {
      const f = frame(id, { x: rows[id].start[0], y: rows[id].start[1] }, {}, wide);
      ok('Z3', f.sprites.length > 10 && f.sprites.every((d, i) => !i || M.zsort.compareDraw(f.sprites[i - 1], d) <= 0), id + ': the draw list is empty or not in y-sort order');
    }
  });

  fam('R', () => {
    const roofOf = (f, id) => f.roofs.find((r) => r.id === id);
    const slices = (f, id) => f.raised.filter((d) => d.kind === 'roof' && d.building === id).length;
    const out = frame('_kit_town', { x: 11, y: 9 }, {}, wide);
    ok('R1', out.heroBuilding === null && roofOf(out, 'smithy').alpha === 1 && roofOf(out, 'mill').alpha === 1 && slices(out, 'smithy') > 0 && slices(out, 'mill') > 0,
      'outside, both roofs must be drawn');
    const inSmithy = frame('_kit_town', { x: 3, y: 3 }, {}, wide);
    ok('R1', inSmithy.heroBuilding === 'smithy' && slices(inSmithy, 'smithy') === 0 && slices(inSmithy, 'mill') > 0, 'inside the smithy, only the smithy roof lifts');
    const peer = frame('_kit_town', { x: 11, y: 9 }, { peers: [{ x: 3, y: 3 }, { x: 15, y: 2 }] }, wide);
    ok('R2', slices(peer, 'smithy') > 0 && slices(peer, 'mill') > 0 && peer.heroBuilding === null, 'a PEER inside a building must never lift its roof');
    const inside = frame('_kit_home', { x: 6, y: 7 }, {}, wide);
    const southRow = inside.sprites.filter((d) => d.ty === 10 && d.tx > 2 && d.tx < 13 && (d.kind === 'stub' || d.kind === 'wall' || d.kind === 'door'));
    ok('R3', southRow.length === 9 && southRow.every((d) => d.id === 'plank_stub') && !southRow.some((d) => d.tx === 8),
      'inside, the cottage\'s south wall is plank_stub with the doorway open (' + southRow.map((d) => d.id + '@' + d.tx).join(' ') + ')');
    ok('R3', inside.sprites.filter((d) => d.ty === 1 && d.id === 'plank_wall').length === 10, 'inside, the cottage\'s north wall is its full face');
    const front = inside.sprites.filter((d) => d.ty === 5 && d.tx >= 16 && d.tx <= 20 && d.kind === 'wall').map((d) => d.id);
    ok('R3', front.length === 5 && front.includes('timber_wall_door') && front.includes('timber_wall_window'), 'the neighbour shows its front face while you are in your cottage (' + front.join(' ') + ')');
    const st = M.roofs.stepAlpha;
    /* R5 a PAINTED building (the shipped cottage: walls and floor in the ground art) draws no kit and no roof */
    const painted = frame('home_cottage', { x: 6, y: 7 }, {}, wide);
    ok('R5', !painted.sprites.some((d) => d.kind === 'wall' || d.kind === 'stub' || d.kind === 'door') && !painted.raised.some((d) => d.kind === 'roof' && d.building === 'cottage'),
      'a painted building must draw no wall slice, stub, door or roof (its walls are the ground art)');
    ok('R4', st(1, 0, 75) === 0.5 && st(1, 0, 150) === 0 && st(1, 0, 900) === 0 && st(0, 1, 75) === 0.5 && M.roofs.ROOF_FADE_MS === 150, 'the roof fade is 150 ms linear and clamps');
  });

  fam('S', () => {
    const e = M.shadows.ellipseShadow({ w: 24, h: 8, dx: 5, dy: 6 }, 100, 50);
    ok('S1', e.cx === 103 && e.cy === 55 && e.w === 24 && e.h === 8, 'the ellipse sits on the contact point as the stills place it (got ' + JSON.stringify(e) + ')');
    const f = frame('mill_cellar', { x: 10, y: 7 });
    const hero = f.sprites[heroIdx(f)];
    const hs = book.sprite(HERO);
    ok('S1', f.shadows.some((s) => s.type === 'ellipse' && s.w === hs.shadow.w && s.cx === hero.x + hs.anchor[0] + hs.shadow.dx - 2), 'the hero\'s shadow must be its manifest ellipse at its contact point');
    const [x0, y0] = M.shadows.castPoint(50, 100, 100), [x1, y1] = M.shadows.castPoint(50, 90, 100), [x2, y2] = M.shadows.castPoint(50, 80, 100);
    ok('S2', x0 === 50 && y0 === 100 && x1 > 50 && y1 > 100 && Math.abs((x2 - 50) - 2 * (x1 - 50)) < 1e-9 && Math.abs((y2 - 100) - 2 * (y1 - 100)) < 1e-9,
      'a cast shadow keeps its foot and falls down-right in proportion to height');
    const [a, b, c, d, ee, ff] = M.shadows.castMatrix(100);
    ok('S2', Math.abs(a * 50 + c * 80 + ee - x2) < 1e-9 && Math.abs(b * 50 + d * 80 + ff - y2) < 1e-9, 'castMatrix must be castPoint as a canvas transform');
    ok('S2', frame('town_common', { x: 11, y: 9 }, {}, wide).shadows.some((s) => s.type === 'cast'), 'the Common\'s trees and lamps must cast');
    ok('S3', (M.canvasSrc.match(/drawImage\(shade\.c/g) || []).length === 1 && /source-in/.test(M.canvasSrc), 'every shadow must go into ONE mask, flattened to one tone, composited once');
    /* the style-1 torches hang at hover 0 (their image already sits where PixelLab hangs it), so the
       rule is proven on the shipped torch planted with a hover */
    const man = JSON.parse(JSON.stringify(M.manifests));
    const tset = Object.keys(man).find((k) => man[k].sprites.wall_torch);
    man[tset].sprites.wall_torch.hover = 12;
    const hung = M.bookm.createBook(man);
    const hTables = Object.assign({}, tables, { sprites: hung.sprites });
    const hb = M.nullb.createNullBackend({ book: hung, tables: hTables });
    hb.mount(); hb.setMap(M.mapc.compileMap(rows.mill_cellar, hTables)); hb.sync({ hero: { x: 10, y: 7 }, name: 'Hero', t: 0 });
    const hf = hb.snapshot().last;
    const torch = hf.sprites.concat(hf.raised).find((dd) => dd.id === 'wall_torch' && dd.tx === 6);
    const ts = hung.sprite('wall_torch');
    ok('S4', torch && ts.hover === 12 && torch.y === 2 * T + T - 1 - ts.anchor[1] - ts.hover, 'a hung sprite is drawn its hover above the floor line');
  });

  fam('C', () => {
    /* ONE PIXEL DENSITY PER SCREEN CLASS: x2 CSS px per art pixel on the desktop
       and the phone, x3 only on a window wider than 2400; device px = density x DPR. */
    const table = [[1440, 1, 2], [1920, 1, 2], [922, 1, 2], [922, 3, 6], [1440, 2, 4], [1366, 1.5, 3], [2400, 1, 2], [2560, 1, 3], [3840, 2, 6], [0, 1, 2]];
    for (const [w, dd, z] of table) ok('C1', M.camera.zoomFor(w, dd) === z, 'zoomFor(' + w + ', ' + dd + ') is ' + M.camera.zoomFor(w, dd) + ', want ' + z);
    /* ONE TILE SIZE, ANY GRID: the 64 px sandbox grid (hd64) is drawn at x1, so its tile is the base
       tile on screen (64 CSS px); above WIDE_CSS it stays x1 (96 / 64 is not whole). */
    const hd = M.budget.GRIDS.hd64;
    const hdTable = [[1440, 1, 1], [1920, 1, 1], [922, 1, 1], [922, 3, 3], [1440, 2, 2], [2560, 1, 1], [3840, 2, 2]];
    for (const [w, dd, z] of hdTable) ok('C1', M.camera.zoomFor(w, dd, hd) === z, 'hd64 zoomFor(' + w + ', ' + dd + ') is ' + M.camera.zoomFor(w, dd, hd) + ', want ' + z);
    for (const w of [922, 1440, 1920]) ok('C1', M.camera.zoomFor(w, 1, hd) * hd.T === M.camera.zoomFor(w, 1) * M.budget.GRIDS.base.T,
      'at ' + w + ' CSS px a sandbox tile must be the base tile on screen');
    ok('C1', M.camera.zoomFor(1440, 1, M.budget.GRIDS.base) === M.camera.zoomFor(1440, 1), 'the base grid, named or not, is the same zoom');
    /* ...and never per scene or room: the canvas sets z in measure() from the window and the map's ART GRID
       (nothing else of the map) and nowhere else, and no room frame reaches it */
    const draws = M.canvasSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok('C6', (draws.match(/(?<!let )\bz = /g) || []).length === 1 && /z = zoomFor\(win\.innerWidth, dpr, map && map\.grid\);/.test(draws) && !/fitZoom|map\.frame/.test(draws),
      'the canvas must take ONE zoom from the window and the map\'s grid (measure) and never a per-room or fitted one');
    ok('C6', !('fitZoom' in M.camera) && !('frameCentre' in M.camera), 'the fitted zoom is gone (WORLD_SHELL §1: fitZoom is removed)');
    for (let z = 2; z <= 5; z++) {
      let prev = null;
      for (let k = 0; k <= 3 * z; k++) {
        const cam = { x: 100 + k / z, y: 40 + k / z };
        const p = M.camera.blitPlan(cam, z, T);
        const X = 333;
        const sx = (X - p.ox) * z + p.dx;
        ok('C2', Number.isInteger(p.dx) && Number.isInteger(p.ox) && sx === X * z - Math.round(cam.x * z), 'the blit at z=' + z + ' does not land a world pixel on a whole device pixel');
        if (prev !== null) ok('C2', prev - sx === 1, 'a 1/z art-px camera move must move the world exactly one device pixel (z=' + z + ')');
        prev = sx;
        ok('C3', p.dx <= -T * z && p.dx > -(T + 1) * z, 'the compose origin must carry one tile of overscan');
      }
    }
    const fv = M.camera.frameView({ x: 3, y: 3 }, 1240 / 3, 698 / 3, { w: 28, h: 18 }, 3, T);
    ok('C3', (1240 - fv.plan.dx) / 3 <= fv.view.w && (698 - fv.plan.dy) / 3 <= fv.view.h, 'the compose region must cover the screen after the blit offset');
    const small = M.camera.follow({ x: 0, y: 0 }, { w: 400, h: 300 }, { w: 200, h: 100 });
    ok('C4', small.x === -100 && small.y === -100, 'a world smaller than the view is centred');
    const edge = M.camera.follow({ x: 5, y: 5 }, { w: 100, h: 100 }, { w: 1000, h: 1000 });
    ok('C4', edge.x === 0 && edge.y === 0, 'the camera clamps at the world edge');

    /* C7 THE CAMERA INSET (WORLD_SHELL §1): a docked window (340 CSS px = 170 art px
       at x2) covers the right of the stage. On every tile of every walked map, with
       the camera leaning toward the map's focus as walk-scene.js leans it, the hero
       stands in the UNCOVERED part — on the phone stage and the desktop one; a room
       that fits the uncovered part is centred in it, and one that does not keeps the
       uncovered view inside the room. */
    const dock = { right: 170 };
    /* the uncovered part, from the camera alone: the view minus the docked strip on its right */
    const openOf = (fv, vw, vh) => ({ x: fv.cam.x, y: fv.cam.y, w: vw - dock.right, h: vh });
    const inOpen = (o, hx, hy) => { const cx = (hx + 0.5) * T, cy = (hy + 0.5) * T; return cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h; };
    for (const [stage, vw, vh] of [['922x423 phone', 834 / 2, 277 / 2], ['1440x900 desktop', 1240 / 2, 693 / 2]]) {
      for (const id of ['town_common', 'home_cottage']) {
        const m = compiled(id), f = m.focus;
        let bad = null, n = 0;
        for (let y = 0; y < m.h && !bad; y++) for (let x = 0; x < m.w && !bad; x++) {
          const look = f ? { x: x + (f[0] - x) * 0.5, y: y + (f[1] - y) * 0.5 } : { x, y };
          const o = openOf(M.camera.frameView(look, vw, vh, m, 2, T, { inset: dock, keep: { x, y } }), vw, vh);
          n++;
          if (!inOpen(o, x, y)) bad = [x, y, o];
        }
        ok('C7', !bad && n > 100, stage + ' ' + id + ': the hero on ' + JSON.stringify(bad) + ' stands under the docked window');
      }
    }
    /* C8 NO VOID (Tyler 10-18: "a black area to the right where the camera goes off the map").
       A docked window is shorter than the World, so the strip under it shows around it: on a
       map at least as big as the whole view, the WHOLE view stays on the map for every hero
       tile but the ones within the window's width of the far edge (there the hero wins, C7). */
    for (const [stage, vw, vh] of [['922x423 phone', 834 / 2, 277 / 2], ['1440x900 desktop', 1240 / 2, 693 / 2]]) {
      const m = compiled('town_common'), f = m.focus;
      if (m.w * T < vw || m.h * T < vh) continue;
      let bad = null, n = 0;
      for (let y = 0; y < m.h && !bad; y++) for (let x = 0; x < m.w - Math.ceil(dock.right / T) - 2 && !bad; x++) {
        const look = f ? { x: x + (f[0] - x) * 0.5, y: y + (f[1] - y) * 0.5 } : { x, y };
        const fv = M.camera.frameView(look, vw, vh, m, 2, T, { inset: dock, keep: { x, y } });
        n++;
        if (fv.cam.x < -0.5 || fv.cam.y < -0.5 || fv.cam.x + vw > m.w * T + 0.5 || fv.cam.y + vh > m.h * T + 0.5) bad = [x, y, fv.cam];
      }
      ok('C8', !bad && n > 100, stage + ' town_common: with a window docked, the hero on ' + JSON.stringify(bad) + ' shows the void past the map edge');
    }
    const cellar = compiled('mill_cellar'), fr = cellar.frame;
    const bo = openOf(M.camera.frameView({ x: 10, y: 6 }, 1680 / 2, 873 / 2, cellar, 2, T, { inset: dock, keep: { x: 10, y: 6 } }), 1680 / 2, 873 / 2);
    ok('C7', Math.abs(bo.x + bo.w / 2 - (fr.x + fr.w / 2) * T) <= 0.5 && Math.abs(bo.y + bo.h / 2 - (fr.y + fr.h / 2) * T) <= 0.5,
      'a room that fits the uncovered World must be centred in it, not in the whole stage: open ' + JSON.stringify(bo));
    for (const hx of [fr.x, fr.x + fr.w - 1]) {
      const o = openOf(M.camera.frameView({ x: hx, y: 6 }, 834 / 2, 277 / 2, cellar, 2, T, { inset: dock, keep: { x: hx, y: 6 } }), 834 / 2, 277 / 2);
      ok('C7', inOpen(o, hx, 6) && o.x >= fr.x * T - 0.5 && o.x + o.w <= (fr.x + fr.w) * T + 0.5,
        'a room bigger than the uncovered World follows the hero and stays inside the room: hero ' + hx + ', open ' + JSON.stringify(o));
    }
    ok('C5', M.camera.fpsFor(true) === 30 && M.camera.fpsFor(false) === 60, '30 fps on the phone query, 60 elsewhere');
    ok('C5', M.camera.MOBILE_QUERY === '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)' && M.worldCss.includes('@media ' + M.camera.MOBILE_QUERY),
      'the 30 fps query must be the canonical mobile query world.css uses');
  });

  fam('L', () => {
    const ids = M.maps.WORLD_MAPS.map((m) => m.id);
    ok('L0', new Set(ids).size === ids.length, 'two maps share an id');
    for (const m of M.maps.WORLD_MAPS) for (const p of M.mapc.lintMap(m, tables)) ok('L0', false, p.code + ' ' + p.msg);
    for (const [kind, id] of Object.entries(M.maps.SCENE_MAPS)) ok('L0', rows[id] && rows[id].kind === kind, 'SCENE_MAPS.' + kind + ' is not a ' + kind + ' map');
    for (const m of M.maps.WORLD_MAPS) for (const h of m.hunts) ok('L0', !!M.hunts.HUNT_INDEX[h], m.id + ' renders unknown hunt ' + h);
    /* A STAGED map (maps/index.js STAGED_MAPS: a staged hunt's, its painted ground still to come) passes every
       rule but the ground art's: lintMap without `terrains`. Opening it is tests/hunt-core/forest-cave.mjs staged-until-art. */
    const stagedTables = Object.assign({}, tables, { terrains: null });
    /* L-GRID: a map on another grid draws nothing the engine measures in base art px (a planted face, wall kit or cellar light is red) */
    const sand = rows.sandbox_hd64;
    ok('L2', sand && sand.grid === 'hd64' && M.mapc.compileMap(sand, tables).T === 64, 'the sandbox map compiles on the 64 px grid');
    for (const [what, over] of [['a rock face', { faces: [{ x: 1, y: 1, id: 'sandbox_rocks' }] }], ['the cellar light', { light: 'cellar' }],
      ['a wall-kit building', { buildings: [{ id: 'b', rect: [20, 1, 4, 4], wall: 'timber', floor: 'plank_floor', doors: [[21, 4]], roof: { rect: [20, 1, 4, 4], kind: 'roof_wood' } }] }],
      ['an unknown grid', { grid: 'hd96' }]]) {
      ok('L2', M.mapc.lintMap(Object.assign({}, sand, over), tables).some((p) => p.code === 'L-GRID'), 'a sandbox row with ' + what + ' must be red on L-GRID');
    }
    for (const m of M.maps.STAGED_MAPS) {
      ok('L0', !ids.includes(m.id), m.id + ' is both shipped and staged');
      for (const p of M.mapc.lintMap(m, stagedTables)) ok('L0', false, p.code + ' ' + p.msg);
      for (const h of m.hunts) ok('L0', !!M.hunts.HUNT_INDEX[h] && M.hunts.HUNT_INDEX[h].staged === true, m.id + ' is staged but its hunt ' + h + ' is not');
    }
    const plant = (id, edit) => { const r = JSON.parse(JSON.stringify(rows[id] || fixtures[id])); edit(r); return M.mapc.lintMap(r, tables).map((p) => p.code); };
    const want = [
      ['a fractional object', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[1].x = 4.5; }],
      ['an object offset (ox)', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[1].ox = 4; }],
      ['a sprite no atlas carries', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[1].id = 'no_such_sprite'; }],
      ['an open patrol path', 'L-PATH', 'mill_cellar', (r) => { r.path = [[6, 5], [20, 5], [20, 10], [7, 10]]; }],
      ['a path across rock', 'L-PATH', 'mill_cellar', (r) => { r.path = [[6, 5], [20, 5], [20, 13], [6, 13]]; }],
      ['a door on a corner', 'L-DOOR', 'home_cottage', (r) => { r.buildings[0].doors = [[13, 10]]; }],
      ['a door off the edge', 'L-DOOR', 'home_cottage', (r) => { r.buildings[0].doors = [[8, 5]]; }],
      ['a roof that is not the footprint', 'L-ROOF', '_kit_home', (r) => { r.buildings[0].roof.rect = [2, 1, 12, 9]; }],
      ['a stale mask hash', 'L-HASH', 'mill_cellar', (r) => { r.rows[10] = '###...#................#'; }],
      ['furniture north of a south wall', 'L-NORTH', 'home_cottage', (r) => { r.objects.find((o) => o.id === 'table').y = 9; }],
      ['an outdoor map with a treeless window', 'L-TREES', 'town_common', (r) => { r.objects = r.objects.filter((o) => o.id !== 'oak'); }],
      ['a barrel on rock', 'L-SPACE', 'mill_cellar', (r) => { r.objects.push({ id: 'barrels', x: 1, y: 7 }); }],
      ['a walled-off strip of a walked map', 'L-REACH', 'home_cottage', (r) => { r.objects.push({ id: 'bush', x: 1, y: 11 }); }],
      ['an enterable building with no inside wall kit', 'L-KIT', '_kit_town', (r) => { delete r.buildings[0].closed; }],
      ['a focus off the map', 'L-WHOLE', 'town_common', (r) => { r.focus = [40, 7]; }],
      ['a station hidden behind the well', 'L-COVER', 'town_common', (r) => { r.stations = Object.assign({}, r.stations, { combat: [14, 7] }); }],
    ];
    for (const [what, code, id, edit] of want) ok('L1', plant(id, edit).includes(code), 'the lint did not reject ' + what + ' with ' + code);
  });

  fam('P', () => {
    const fp = M.path.findPath;
    ok('P1', fp(Uint8Array.from([0, 1, 0, 1, 0, 0, 0, 0, 0]), 3, 3, [0, 0], [1, 1]) === null, 'a diagonal squeezed between two walls must be refused');
    const p4 = fp(Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]), 3, 3, [0, 0], [1, 1]);
    ok('P1', p4 && p4.length === 3, 'with one orthogonal wall the path must go around the corner, got ' + JSON.stringify(p4));
    const p5 = fp(new Uint8Array(25), 5, 5, [0, 0], [4, 4]);
    ok('P2', p5 && p5.length === 5 && JSON.stringify(p5) === JSON.stringify(fp(new Uint8Array(25), 5, 5, [0, 0], [4, 4])), 'an open diagonal is 5 steps and deterministic');
    const town = compiled('town_common');
    for (const [name, s] of Object.entries(town.stations)) ok('P3', !!fp(town.mask, town.w, town.h, town.start, s), 'no walk from the town start to the ' + name + ' station');
    const cel = compiled('mill_cellar');
    ok('P3', !!fp(cel.mask, cel.w, cel.h, cel.path[0], cel.path[Math.floor(cel.path.length / 2)]), 'no walk across the cellar loop');
  });

  fam('W', () => {
    const grid = (cells, w, h) => M.wang.vertexGrid((x, y) => cells.includes(x + ',' + y), w, h);
    const lone = grid(['2,2'], 5, 5);
    ok('W1', M.wang.tileKey(lone, 5, 2, 2) === '0000', 'a lone upper tile must melt into its surroundings (got ' + M.wang.tileKey(lone, 5, 2, 2) + ')');
    const all = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) all.push(x + ',' + y);
    const full = grid(all, 5, 5);
    ok('W1', [[0, 0], [2, 2], [4, 4]].every(([x, y]) => M.wang.tileKey(full, 5, x, y) === '1111'), 'a field of upper tiles must stay whole to the map edge');
    const half = grid(all.filter((k) => +k.split(',')[0] >= 2), 5, 5);
    ok('W1', M.wang.tileKey(half, 5, 1, 2) === '0000' && M.wang.tileKey(half, 5, 2, 2) === '0101' && M.wang.tileKey(half, 5, 3, 2) === '1111',
      'a straight edge reads NW NE SW SE on the first upper column (got ' + [1, 2, 3].map((x) => M.wang.tileKey(half, 5, x, 2)).join(' ') + ')');
    for (const id of Object.keys(rows)) {
      const g = M.compose.groundTiles(compiled(id), book, tables, T);
      const m = compiled(id);
      /* A painted ground (port-pixellab.mjs) is art under every cell, rock included: no void at all. */
      const painted = !!(book.terrains[m.groundTerrain] && book.terrains[m.groundTerrain].painted);
      const open = painted ? m.ground.length : m.ground.filter((mat) => !tables.materials[mat].solid).length;
      ok('W2', g.tiles.filter((t) => t.set).length >= open && g.voids.length === m.ground.length - open, id + ': the ground must cover every open tile with art and every rock tile with void' + (painted ? ' (painted: every tile with art)' : ''));
    }
    /* A fill floor (one periodic field, e.g. the cellar's flat earth) is laid in its cycle order, never hashed into seams. */
    for (const id of Object.keys(rows)) {
      const m = compiled(id), terr = book.terrains[m.groundTerrain];
      if (!terr || terr.kind !== 'fill') continue;
      const [cols, rws] = terr.cycle || [1, 1];
      const want = (x, y) => book.tile(m.groundTerrain, '1111', (y % rws) * cols + (x % cols));
      const bad = M.compose.groundTiles(m, book, tables, T).tiles.filter((t) => { const w = want(t.x / T, t.y / T); return !w || w.sx !== t.sx || w.sy !== t.sy; });
      ok('W3', bad.length === 0, id + ': ' + bad.length + ' fill tiles are out of their ' + cols + 'x' + rws + ' cycle');
    }
    ok('W3', (book.terrains[compiled('mill_cellar').groundTerrain] || {}).kind === 'fill', 'the Mill Cellar floor must be a fill (its painted style-1 ground), never a Wang patch that reads as a raised slab');
  });

  fam('G', () => {
    const idx = M.route.huntMapIndex(M.maps.WORLD_MAPS, M.hunts.HUNT_INDEX);
    const S = (a, c) => M.route.sceneFor(a, c, idx, M.maps.SCENE_MAPS);
    ok('G1', S({ kind: 'combat', id: 'mill_cellar' }, 'home').map === 'mill_cellar' && S({ kind: 'combat', id: 'rat' }, 'town').map === 'mill_cellar',
      'a mill_cellar hunt or a rat training fight must show the cellar');
    ok('G1', S({ kind: 'combat', id: 'goblin' }, 'home').map === 'home_cottage' && S(null, 'town').map === 'town_common' && S({ kind: 'gather', id: 'rat' }, 'home').kind === 'home' && S(null, 'garbage').map === 'town_common',
      'anything else shows the viewer\'s choice of town or home');
    const miss = book.frame('no_such_sprite');
    ok('G2', miss.set === '' && miss.w === M.bookm.STUB_SPRITE.frame[0] && book.sprite('no_such_sprite') === M.bookm.STUB_SPRITE, 'a sprite no atlas carries must resolve to the stub record and frame');
    const lost = M.bookm.createBook({ hunt: M.manifests.hunt });
    const stubTables = Object.assign({}, tables, { sprites: new Proxy(lost.sprites, { get: (t, k) => t[k] || M.bookm.STUB_SPRITE }) });
    let drawn = null;
    try {
      const b = M.nullb.createNullBackend({ book: lost, tables: stubTables });
      b.mount(); b.setMap(M.mapc.compileMap(rows.mill_cellar, stubTables)); b.sync({ hero: { x: 10, y: 7 }, t: 0 });
      drawn = b.snapshot().last;
    } catch (e) { drawn = null; }
    ok('G2', drawn && drawn.sprites.some((d) => d.set === '') && drawn.sprites.some((d) => d.set === 'hunt'), 'with an atlas missing, the scene must still compose (stubs for its sprites, real art for the rest)');
    const order = ['list.decals', 'shadows(g, list', 'list.sprites', 'list.raised', 'light(g, list', 'ctx.drawImage(comp.c', 'overlay(list'];
    const draw = M.canvasSrc.slice(M.canvasSrc.indexOf('function draw('));
    const pos = order.map((k) => draw.indexOf(k));
    ok('G3', pos.every((p, i) => p > 0 && (!i || pos[i - 1] < p)), 'canvas-backend draw() must paint ground, decals, shadows, sprites, raised, light, blit, screen overlay in that order (' + pos.join(',') + ')');
  });
  return fails;
}

const COPY = ['src/world', 'src/data/world', 'src/data/hunts.js', 'src/data/hunt-outfits.js', 'src/build-info.js', 'assets/world'];
function copyTree() {
  const dir = mkdtempSync(join(tmpdir(), 'world-core-'));
  for (const p of COPY) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (src) => !src.endsWith('.png') });
  }
  return dir;
}
/** Apply [from, to] edits to one copied file; anchors follow the file's own line endings. */
function plantIn(dir, rel, edits) {
  const f = join(dir, rel);
  let s = readFileSync(f, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [from, to] of edits) {
    const a = from.replace(/\n/g, eol);
    if (!s.includes(a)) throw new Error('mutant anchor not found in ' + rel + ': ' + from);
    s = s.replace(a, to.replace(/\n/g, eol));
  }
  writeFileSync(f, s);
}

/* [family that must go red, the defect, file, [[anchor, replacement], …]] */
const MUTANTS = [
  ['Z1', 'wall faces sort after units on their row', 'src/world/core/compose.js', [["{ i: x % 4, kind: 'wall' });\n        if (x === doorX)", "{ i: x % 4, kind: 'wall', bias: 1 });\n        if (x === doorX)"]]],
  ['Z2', 'units keyed by the nearest whole row', 'src/world/core/compose.js', [['row: ty * T + fh * T - 1 + (o.bias || 0)', 'row: Math.round(ty) * T + fh * T - 1 + (o.bias || 0)']]],
  ['R2', 'the roof follows a peer inside', 'src/world/core/compose.js', [['const heroId = heroBuilding(map.buildings, hero);', 'const heroId = heroBuilding(map.buildings, (state.peers || [])[0] || hero);']]],
  ['R3', 'the inside view forgets the doorway', 'src/world/core/compose.js', [["if (x !== doorX) place(b.wall + '_stub'", "place(b.wall + '_stub'"]]],
  ['R4', 'the fade runs at 300 ms', 'src/world/core/roofs.js', [['ROOF_FADE_MS = 150', 'ROOF_FADE_MS = 300']]],
  ['S1', 'the ellipse ignores its offset', 'src/world/core/shadows.js', [['cx: cx + spec.dx - 2', 'cx: cx']]],
  ['S2', 'a cast shadow that ignores height', 'src/world/core/shadows.js', [['return [px + SHEAR.x * hgt,', 'return [px + SHEAR.x * 10,']]],
  ['S3', 'a second shadow composite', 'src/world/render/canvas-backend.js', [['    g.drawImage(shade.c, 0, 0);\n', '    g.drawImage(shade.c, 0, 0);\n    g.drawImage(shade.c, 0, 0);\n']]],
  ['S4', 'hung art drawn on the floor', 'src/world/core/compose.js', [["const air = s.class === 'hanging' || s.class === 'flier' ? s.hover || 0 : 0;", 'const air = 0;']]],
  ['C1', 'the density read off device px (a DPR-3 phone drawn at x3)', 'src/world/core/camera.js', [['const css = (innerWidth || 0) > WIDE_CSS', 'const css = (innerWidth || 0) * (dpr || 1) > WIDE_CSS']]],
  ['C6', 'a per-room zoom comes back', 'src/world/render/canvas-backend.js', [['    const k = dpr / z;\n', '    z = map.frame ? z + 1 : z;\n    const k = dpr / z;\n']]],
  ['C6', 'a zoom fitted to the map width, passed in as a grid', 'src/world/render/canvas-backend.js', [['z = zoomFor(win.innerWidth, dpr, map && map.grid);', 'z = zoomFor(win.innerWidth, dpr, map && { density: Math.max(1, Math.floor(W / (map.w * T))), wideDensity: 1 });']]],
  ['C1', 'the sandbox grid drawn at the base density (its tile twice the town\'s)', 'src/world/core/camera.js', [['  const g = grid || GRIDS.base;', '  const g = GRIDS.base;']]],
  ['C7', 'the camera ignores the docked window', 'src/world/core/camera.js', [['const inset = cleanInset(o.inset);', 'const inset = cleanInset(null);']]],
  ['C7', 'the leaning camera lets the hero walk under the window', 'src/world/core/camera.js', [['inset, mid(o.keep), T, rule), o.sinceMs);', 'inset, null, T, rule), o.sinceMs);']]],
  ['C7', 'a small room centred in the whole stage, not the uncovered part', 'src/world/core/camera.js', [['if (span <= u) c = lo + (span - u) / 2;', 'if (span <= u) c = lo + (span - v) / 2 + a;']]],
  ['C8', 'a docked HUD panel shows the void past the map', 'src/world/core/camera.js', [['    if (whole && span >= v) c = hold(', '    if (false) c = hold(']]],
  ['C2', 'the camera rounded to art pixels', 'src/world/core/camera.js', [['const cx = Math.round(cam.x * z), cy', 'const cx = Math.round(cam.x) * z, cy']]],
  ['L2', 'the lint lets a 64 px map keep rock faces', 'src/world/core/map-compile.js', [["    if ((row.faces || []).length) bad('L-GRID'", "    if (false) bad('L-GRID'"]]],
  ['L1', 'the lint accepts offsets', 'src/world/core/map-compile.js', [["k !== 'id' && k !== 'x' && k !== 'y'", "k !== 'id' && k !== 'x' && k !== 'y' && k !== 'ox'"]]],
  ['L0', 'a map row edited without its hash', 'src/data/world/maps/mill_cellar.js', [["    '########################',\n    '###...................##',\n", "    '########################',\n    '###.......#...........##',\n"]]],
  ['P1', 'diagonals cut corners', 'src/world/core/path.js', [['if (dx && dy) return walkable', 'if (false) return walkable']]],
  ['W1', 'a lone tile stops melting', 'src/world/core/wang.js', [['up >= 3 ? 1 : 0', 'up >= 1 ? 1 : 0']]],
  ['W3', 'a fill floor hashed into seams', 'src/world/core/compose.js', [['const n = fill ? (y % fill[1]) * fill[0] + (x % fill[0]) : cellHash(x, y);', 'const n = cellHash(x, y);']]],
  ['G1', 'an unmapped monster falls into the cellar', 'src/world/core/scene-route.js', [['if (id && index[id]) return', "if (id) return { map: 'mill_cellar', kind: 'hunt' }; if (id && index[id]) return"]]],
  ['G2', 'a missing sprite resolves to nothing', 'src/world/core/book.js', [['const sprite = (id) => sprites[id] || STUB_SPRITE;', 'const sprite = (id) => sprites[id];']]],
  ['G3', 'sprites drawn over the roofs', 'src/world/render/canvas-backend.js', [
    ['    for (const d of list.sprites) {\n      if (d.kind === \'unit\' && (d.flash || d.grey)) blitUnit(g, d, view);\n      else { g.globalAlpha = d.alpha == null ? 1 : d.alpha; blit(g, d, view); }\n    }\n', ''],
    ['    g.globalAlpha = 1;\n    light(g, list, view, fv);', '    for (const d of list.sprites) blit(g, d, view);\n    g.globalAlpha = 1;\n    light(g, list, view, fv);']]],
];

async function selftest() {
  let bad = 0;
  const clean = copyTree();
  try {
    const f = check(await load(clean));
    if (f.length) { console.log('  ✗ clean control is RED: ' + f.map((x) => x.id + ' ' + x.msg).join(' | ')); bad++; }
    else console.log('  ✓ clean control — an unmutated copy is green');
  } finally { rmSync(clean, { recursive: true, force: true }); }
  for (const [id, why, rel, edits] of MUTANTS) {
    const dir = copyTree();
    try {
      plantIn(dir, rel, edits);
      const f = check(await load(dir));
      if (f.some((x) => x.id === id || x.id === id[0] + '!')) console.log('  ✓ ' + id + ' caught: ' + why);
      else { console.log('  ✗ ' + id + ' NOT CAUGHT: ' + why + (f.length ? ' (red elsewhere: ' + [...new Set(f.map((x) => x.id))].join(',') + ')' : '')); bad++; }
    } catch (e) {
      console.log('  ✗ ' + id + ' could not be planted or crashed the guard: ' + e.message); bad++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (bad) { console.error('world-core --selftest FAILED — ' + bad + ' unproven'); process.exit(1); }
  console.log('world-core --selftest PASSED — clean control green, ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught by their own family.');
}

if (argv.includes('--selftest')) await selftest();
else if (argv.includes('--hashes')) {
  const M = await load(ROOT);
  const book = M.bookm.createBook(M.manifests);
  const tables = { materials: M.terrain.MATERIALS, sprites: book.sprites, openClasses: M.terrain.OPEN_CLASSES, lights: M.terrain.LIGHTS };
  for (const m of M.maps.WORLD_MAPS) console.log(m.id.padEnd(16), M.mapc.compileMap(m, tables).maskHash, m.maskHash ? '(row says ' + m.maskHash + ')' : '');
} else {
  const M = await load(ROOT);
  const fails = check(M);
  if (fails.length) {
    for (const f of fails) console.error('  ✗ ' + f.id + '  ' + f.msg);
    console.error('world-core: ' + fails.length + ' failure(s)');
    process.exit(1);
  }
  console.log('world-core: green — y-sort, roofs, shadows, camera, map lint (' + M.maps.WORLD_MAPS.length + ' maps over ' + Object.keys(M.manifests).length + ' atlases), path, Wang, routing, stubs, layer order');
}
