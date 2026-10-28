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
//   A  art by scene (src/world/scene-sets.js): every shipped scene loads every
//      sheet it draws from (the whole map, every hero, its monsters and effects,
//      every room's furniture), and a walked scene loads nothing more: the
//      Common never pulls a hunting ground's sheet
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
  const [grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, sets, budget,
    sceneSets, outfits, grounds, vfx, layouts, homeScene, chunksM, canvasM] = await Promise.all([
    'src/world/core/grid.js', 'src/world/core/zsort.js', 'src/world/core/roofs.js', 'src/world/core/shadows.js',
    'src/world/core/camera.js', 'src/world/core/map-compile.js', 'src/world/core/path.js', 'src/world/core/wang.js',
    'src/world/core/scene-route.js', 'src/world/core/compose.js', 'src/world/render/null-backend.js',
    'src/world/core/book.js', 'src/data/world/maps/index.js', 'src/data/world/terrain.js', 'src/data/hunts.js',
    'src/data/world/atlas-sets.js', 'src/data/world/art-budget.js',
    'src/world/scene-sets.js', 'src/data/hunt-outfits.js', 'src/data/hunt-grounds.js', 'src/data/hunt-vfx.js',
    'src/data/world/house-layouts.js', 'src/world/home-scene.js', 'src/world/render/ground-chunks.js', 'src/world/render/canvas-backend.js',
  ].map(imp));
  const manifests = {};
  /* every set on any grid (atlas-sets.js LOADED_SETS): the sandbox map lints against its own grid's art */
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return { grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, budget, manifests,
    sceneSets, outfits, grounds, vfx, layouts, homeScene, atlasSets: sets, chunksM, canvasM,
    canvasSrc: readFileSync(join(base, 'src/world/render/canvas-backend.js'), 'utf8'),
    worldCss: readFileSync(join(ROOT, 'src/styles/world.css'), 'utf8'), tokensCss: readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8') };
}

/** Every check, against one loaded module set. Returns [{ id, msg }] failures. */
async function check(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push({ id, msg }); };
  /* A family that throws is red for that family (a mutant may crash a rule, not the guard). */
  const fam = (id, body) => { try { body(); } catch (e) { fails.push({ id: id + '!', msg: 'threw: ' + (e && e.message) }); } };
  const famAsync = async (id, body) => { try { await body(); } catch (e) { fails.push({ id: id + '!', msg: 'threw: ' + (e && e.message) }); } };
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
    /* the town's first oak (a Westwood tree), and the open tiles north and south of it */
    const tree = rows.town_common.objects.find((o) => o.id === 'oak');
    const oak = (f) => at(f.sprites, (d) => d.id === 'oak' && d.tx === tree.x && d.ty === tree.y);
    const n = frame('town_common', { x: tree.x, y: tree.y - 1 }), s = frame('town_common', { x: tree.x, y: tree.y + 1 });
    ok('Z2', oak(n) >= 0 && heroIdx(n) < oak(n) && heroIdx(s) > oak(s), 'a hero north of a tree must draw behind it, south in front');
    const m1 = frame('town_common', { x: tree.x, y: tree.y - 0.5 }), m2 = frame('town_common', { x: tree.x, y: tree.y + 0.5 });
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
    /* THE VIEWER'S TOWN ZOOM (Tyler 2026-10-26): a whole pick rounds to whole device px, a fractional one is kept */
    const picks = [[2560, 1, 1, 1], [2560, 1, 2, 2], [1440, 1.25, 1, 1], [1440, 2, 1, 2], [2560, 1, 1.5, 1.5], [1280, 2, 1.5, 3], [922, 3, 2, 6]];
    for (const [w, dd, p, z] of picks) ok('C1', M.camera.zoomFor(w, dd, undefined, p) === z, 'zoomFor(' + w + ', ' + dd + ', pick ' + p + ') is ' + M.camera.zoomFor(w, dd, undefined, p) + ', want ' + z);
    ok('C1', M.camera.zoomFor(2560, 1, undefined, null) === 3 && M.camera.zoomFor(2560, 1, undefined, 0) === 3, 'no pick: the screen class\'s zoom');
    /* x1.5: the compose origin on an even art px, so the blit offset is a whole device px and an art pixel's 1-or-2 px
       width is the WORLD's (a 1-device-px camera step moves the world one device px; nothing re-cuts) */
    {
      let prev = null;
      for (let k = 0; k <= 9; k++) {
        const cam = { x: 100 + k / 1.5, y: 40 }, p = M.camera.blitPlan(cam, 1.5, T);
        const sx = (334 - p.ox) * 1.5 + p.dx;
        ok('C2', Number.isInteger(p.dx) && p.ox % 2 === 0 && sx === 334 * 1.5 - Math.round(cam.x * 1.5), 'the x1.5 blit does not keep the world\'s pixel grid (k ' + k + ': ox ' + p.ox + ' dx ' + p.dx + ')');
        if (prev !== null) ok('C2', prev - sx === 1, 'a 1/z art-px camera move at x1.5 must move the world one device pixel');
        prev = sx;
      }
    }
    /* ...and never per scene or room: the canvas sets z in measure() from the window and the map's ART GRID
       (nothing else of the map) and nowhere else, and no room frame reaches it */
    const draws = M.canvasSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok('C6', (draws.match(/(?<!let )\bz = /g) || []).length === 1 && /z = zoomFor\(win\.innerWidth, dpr, map && map\.grid, zoomPick\);/.test(draws) && !/fitZoom|map\.frame/.test(draws),
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
      ['an outdoor map with a treeless window', 'L-TREES', 'town_common', (r) => { r.objects = r.objects.filter((o) => o.id !== 'oak' && o.id !== 'pine'); }],
      /* only a window MOSTLY of green ground may go without a tree: a treeless meadow on the sea's edge is still red */
      ['a meadow with no tree, beside the sea', 'L-TREES', 'home_cottage', (r) => { r.objects = r.objects.filter((o) => o.id !== 'oak' && o.id !== 'pine');
        r.rows = r.rows.map((row, y) => (y < 7 ? row : row.replace(/[^.]/g, '.'))); }],
      ['a barrel on rock', 'L-SPACE', 'mill_cellar', (r) => { r.objects.push({ id: 'barrels', x: 1, y: 7 }); }],
      ['a walled-off strip of a walked map', 'L-REACH', 'home_cottage', (r) => { r.objects.push({ id: 'bush', x: 1, y: 11 }); }],
      ['an enterable building with no inside wall kit', 'L-KIT', '_kit_town', (r) => { delete r.buildings[0].closed; }],
      ['a focus off the map', 'L-WHOLE', 'town_common', (r) => { r.focus = [r.rows[0].length + 3, 7]; }],
      ['a station hidden behind the well', 'L-COVER', 'town_common', (r) => { const w = r.objects.find((o) => o.id === 'well'); r.stations = Object.assign({}, r.stations, { combat: [w.x, w.y - 1] }); }],
      ['a hunt map drawn in placeholder tones', 'L-KIND', 'mill_cellar', (r) => { r.ground = null; }],
      ['a ground no atlas carries', 'L-KIND', 'town_common', (r) => { r.ground = 'town_ground'; }],
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
      /* A town ahead of its ground art (ground: null) is a placeholder tone under every cell, and no art or void. */
      if (m.groundTerrain === null) {
        /* ...except its patches (Hearth Square's paving): art there, in the patch's own set */
        const inPatch = (x, y) => m.patches.some((p) => x >= p.rect.x && y >= p.rect.y && x < p.rect.x + p.rect.w && y < p.rect.y + p.rect.h);
        let patched = 0;
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (inPatch(x, y)) patched++;
        const toneOk = g.tones.every((t) => !inPatch(t.x / T, t.y / T) && t.m === m.ground[(t.y / T) * m.w + t.x / T]);
        /* a BLENDED ground (m.blend) adds its pairs' tiles on the dual grid (half a cell off), laid UNDER the patches */
        const mod = (v) => ((v % T) + T) % T;
        const half = g.tiles.filter((t) => mod(t.x) !== 0 || mod(t.y) !== 0), whole = g.tiles.filter((t) => mod(t.x) === 0 && mod(t.y) === 0);
        ok('W2', g.tones.length === m.ground.length - patched && toneOk && whole.length === patched && g.tiles.every((t) => t.set) && !g.voids.length
          && (m.blend ? half.every((t) => mod(t.x) === T / 2 && mod(t.y) === T / 2) && g.tiles.indexOf(whole[0]) > g.tiles.indexOf(half[half.length - 1]) : !half.length),
          id + ': a ground with no art must lay one placeholder tone per cell outside its patches, in its material, art on every patch cell, and blend tiles only on the dual grid under the patches');
        if (m.blend) {
          /* every cell of a material a blend pair draws (alias applied), outside the patches, is covered by its four dual tiles */
          const mats = new Set(m.blend.pairs.flatMap((id2) => [book.terrains[id2].lower, book.terrains[id2].upper]));
          const at = new Set(half.map((t) => (t.x - T / 2) / T + ',' + (t.y - T / 2) / T));
          const bare = [];
          for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
            const mat = m.ground[y * m.w + x];
            if (inPatch(x, y) || !mats.has(m.blend.alias[mat] || mat)) continue;
            if (![[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]].every(([a, b]) => at.has(a + ',' + b))) bare.push(x + ',' + y);
          }
          ok('W2', !bare.length && m.blend.pairs.every((p) => book.terrains[p] && book.terrains[p].kind === 'wang16'),
            id + ': every cell a blend pair draws must be under its four dual tiles (bare: ' + bare.slice(0, 6).join(' ') + ')');
        }
        ok('W2', id !== 'town_common' || patched === 24 * 24, 'Hearth Square\'s paving (24 x 24) must be a patch of the town');
        /* the map's ambient loops (the Great Hearth's fire) play on the clock where the map puts them */
        for (const a of m.ambient) {
          const fx = (t) => (frame(id, { x: a.x, y: a.y + 2 }, { t }).fx || []).find((e) => e.id === a.id);
          const f0 = fx(0), f1 = fx(130);
          ok('W2', !!f0 && !!f1 && f0.cy === Math.round((a.y + 1) * T - 1 - a.lift) && (f0.sx !== f1.sx || f0.sy !== f1.sy),
            id + ': the ambient ' + a.id + ' at ' + a.x + ',' + a.y + ' must be drawn, lifted ' + a.lift + ' px, and loop on the clock');
        }
        const css = M.tokensCss;
        const missing = [...new Set(m.ground)].filter((mat) => !['a', 'b'].every((k) => css.includes('--world-ground-' + mat + '-' + k + ':')));
        ok('W2', !missing.length, id + ': no placeholder tone token (src/styles/tokens.css --world-ground-<material>-a/-b) for ' + missing.join(', '));
        continue;
      }
      /* A painted ground (port-pixellab.mjs) is art under every cell, rock included: no void at all. */
      const painted = !!(book.terrains[m.groundTerrain] && book.terrains[m.groundTerrain].painted);
      const open = painted ? m.ground.length : m.ground.filter((mat) => !tables.materials[mat].solid).length;
      ok('W2', g.tiles.filter((t) => t.set).length >= open && g.voids.length === m.ground.length - open, id + ': the ground must cover every open tile with art and every rock tile with void' + (painted ? ' (painted: every tile with art)' : ''));
    }
    /* THE BLEND'S CORNERS (compose.js blendTiles), on a planted 4 x 3 town: grass | earth road | a river row, a cliff
       cell with no pair. The dual tile between four cells spells their materials; a hole (the cliff) takes its
       neighbours'; a third material is drawn as the member it pairs with. */
    {
      const rowsP = ['..==', '.^==', '~~..'], legend = { '.': 'grass', '=': 'earth', '~': 'water', '^': 'cliff' };
      const pm = { w: 4, h: 3, ground: rowsP.join('').split('').map((c) => legend[c]), blend: { pairs: ['ge', 'gw'], alias: {} } };
      const pb = { terrains: { ge: { kind: 'wang16', lower: 'grass', upper: 'earth' }, gw: { kind: 'wang16', lower: 'grass', upper: 'water' } },
        tile: (id, key) => ({ set: id + ':' + key, sx: 0, sy: 0 }) };
      const out = [];
      M.compose.blendTiles(pm, pb, T, () => false, out);
      const at = (x, y) => (out.find((t) => t.x === x * T + T / 2 && t.y === y * T + T / 2) || {}).set;
      const want = { '-1,-1': 'ge:0000', '1,-1': 'ge:0101', '1,0': 'ge:0111', '0,1': 'gw:0111', '2,1': 'ge:1100', '1,1': 'ge:1100' };
      const got = Object.keys(want).map((k) => k + '=' + at(...k.split(',').map(Number)));
      ok('W2', Object.entries(want).every(([k, v]) => at(...k.split(',').map(Number)) === v) && out.length === 5 * 4,
        'the blend must draw every dual tile of a planted town with the pair and key of its corners (got ' + got.join(' ') + ', ' + out.length + ' tiles)');
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
    /* W4 (perf lane P2): a scene's ground made in SLICES (compose.js groundOfSliced, the World's prepare task) is the
       list groundTiles makes in one go, and a big ground really is cut up: the town's was one 28-48 ms task on CI,
       88 ms on a phone's CPU. A fake clock: one tick per step, a 20-tick budget. */
    for (const id of Object.keys(rows)) {
      const m = Object.assign({}, compiled(id));   // a map of its own: nothing kept for it yet
      const q = [];
      let clock = 0, slices = 0;
      M.compose.groundOfSliced(m, book, tables, T, { later: (fn) => q.push(fn), now: () => clock++, budgetMs: 20 });
      slices = 1;
      while (q.length) { slices++; q.shift()(); }
      const kept = M.compose.takeGround(m, book, tables, T);
      ok('W4', JSON.stringify(kept) === JSON.stringify(M.compose.groundTiles(m, book, tables, T)), id + ': the ground made in slices differs from the ground made in one go');
      if (m.h > 40) ok('W4', slices >= m.h / 20, id + ': its ' + m.h + '-row ground was made in ' + slices + ' slice(s): a scene being prepared holds the page for the whole ground');
    }
  });

  /* W5 (perf lane 10-28, Havora on v0.2.59: the scene's sheets and bins were single 12-28 ms tasks and the first
     view's chunk bakes one 30-110 ms frame): a scene being PREPARED runs in slices with the same result as one go; a
     chunk bakes in slices to the same paint calls as one go; and a new map's first view waits (ready()) until its
     ground is baked, so no FRAME bakes it. A fake clock ticks once per look: nothing here reads the wall clock. */
  await famAsync('W5', async () => {
    const q = [];
    let clock = 0;
    const sl = { later: (fn) => q.push(fn), now: () => clock++, budgetMs: 1 };
    const drive = async (p) => {
      let n = 1;
      for (;;) { await new Promise((r) => setImmediate(r)); if (!q.length) break; n++; q.shift()(); }
      return [await p, n];
    };
    /* a canvas whose 2d context logs its paint calls; anything else asked of it answers with itself */
    const canvases = [];
    const mockCanvas = () => {
      const log = [];
      const st = { fillStyle: '' };
      const g = new Proxy(st, {
        get: (t, k) => (k in t ? t[k]
          : k === 'fillRect' ? (...a) => log.push('f' + (typeof t.fillStyle === 'string' ? t.fillStyle : '?') + ':' + a.join(','))
          : k === 'drawImage' ? (...a) => log.push('d' + (a[0] && typeof a[0].id === 'string' ? a[0].id : '?') + ':' + a.slice(1).join(','))
          : () => g),
      });
      const c = { width: 0, height: 0, log, getContext: () => g, addEventListener() {}, setAttribute() {}, remove() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }) };
      canvases.push(c);
      return c;
    };
    const doc = { createElement: mockCanvas };
    const images = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? { id: k } : undefined) });
    const tone = (n) => 'tone(' + n + ')';
    const row = rows.town_common;
    const fresh = () => Object.assign({}, compiled('town_common'));   // a map of its own: nothing kept for it yet
    /* the scene's sheets: sliced, the same sets */
    const [sets, setSlices] = await drive(M.sceneSets.sceneSetsSliced(fresh(), row, book, tables, sl));
    ok('W5', JSON.stringify(sets) === JSON.stringify(M.sceneSets.sceneSets(fresh(), row, book, tables)),
      'the town\'s sheets made in slices differ from its sheets made in one go');
    ok('W5', setSlices >= fresh().h + 2, 'the town\'s sheets (its ground, the whole-map passes) were made in ' + setSlices + ' slice(s): one long task');
    /* its chunk bins: sliced, the same bins */
    const mk = () => M.chunksM.createGroundChunks({ doc, tone, now: () => clock++ });
    const m1 = fresh(), m2 = fresh(), a = mk(), b = mk();
    const one = a.prepare(m1, { book, tables });
    const [two, binSlices] = await drive(b.prepare(m2, { book, tables }, sl));
    const flat = (bins) => JSON.stringify([bins.names, [...bins.cells].map(([k, v]) => [k, [...v.voids], [...v.tones], [...v.tiles]])]);
    ok('W5', flat(one) === flat(two), 'the town\'s chunk bins made in slices differ from its bins made in one go');
    ok('W5', binSlices >= 10, 'the town\'s chunk bins were made in ' + binSlices + ' slice(s): one long task');
    /* a chunk baked in slices paints exactly the calls one go paints, never more than a slice's worth a call */
    a.use(m1, { book, tables, images }); b.use(m2, { book, tables, images });
    const list = [[3, 2], [4, 2], [5, 3]];
    const whole = list.map(([cx, cy]) => a.get(cx, cy).log.join('|'));
    const from = canvases.length;
    const painted = () => canvases.slice(from).reduce((n, c) => n + c.log.length, 0);
    let calls = 0, worst = 0;
    for (;;) {
      const was = painted();
      const done = b.bake(list, clock + 8);
      worst = Math.max(worst, painted() - was);
      calls++;
      if (done || calls > 10000) break;
    }
    ok('W5', whole.every((l) => l.length > 0) && list.every(([cx, cy], i) => b.get(cx, cy).log.join('|') === whole[i]),
      'a chunk baked in slices paints different calls from one baked in one go');
    ok('W5', calls > list.length && worst <= (8 + list.length) * 16, 'the chunks were baked in ' + calls + ' call(s), up to ' + worst + ' paint calls in one: a bake is one long task');
    /* the canvas: a new map's first view is baked by ready(), a slice a frame, never inside the frame that draws it */
    const win = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, performance: { now: () => clock++ }, addEventListener() {}, removeEventListener() {},
      setTimeout: (fn) => q.push(fn), clearTimeout() {}, requestIdleCallback: (fn) => q.push(fn), cancelIdleCallback() {} };
    const cb = M.canvasM.createCanvasBackend({ win, doc, book, images, tables, css: tone });
    cb.mount({ appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }) });
    const m3 = fresh();
    cb.setMap(m3);
    const at = row.start || [Math.floor(m3.w / 2), Math.floor(m3.h / 2)];
    const state = { hero: { x: at[0], y: at[1] }, t: 0 };
    let held = 0;
    while (!cb.ready(state) && held < 10000) held++;
    const chunkCount = () => canvases.filter((c) => c.width === 16 * T && c.height === 16 * T).length;
    const baked = chunkCount();
    cb.sync(state);
    ok('W5', held >= 2 && baked > 0 && chunkCount() === baked,
      'a new map\'s first frame must wait for its view\'s ground (held ' + held + ' frame(s), ' + (chunkCount() - baked) + ' chunk(s) baked inside the frame)');
    q.length = 0;
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

  /* A  ART BY SCENE (scene-sets.js; 10-23: every sheet loaded on Play, 2.32 MB / ~45 MB decoded): a scene loads
        exactly the sheets it draws from. Measured here through the null backend over the WHOLE map, with
        everything that can walk or play on it: every hero outfit; on a hunt map every monster its grounds and
        hunts spawn and every hunt effect; at home every piece of every room, its signposts and trophy mounts. */
  fam('A', () => {
    const setOf = (id) => book.frame(id).set;
    const heroes = Object.values(M.outfits.OUTFITS);
    const drawn = (id) => {
      const row = rows[id], m = compiled(id), at = row.start || [1, 1];
      const units = heroes.slice();
      if (row.kind === 'hunt') {
        for (const g of Object.values(M.grounds.HUNT_GROUNDS)) {
          if (g.map !== id) continue;
          for (const p of g.pockets) for (const s of [...p.spawns, ...(p.pack || [])]) units.push(s.monster);
        }
        for (const h of row.hunts || []) for (const s of (M.hunts.HUNT_INDEX[h] || {}).spawns || []) units.push(s.monster);
      }
      const props = [];
      const layout = M.layouts.ROOM_LAYOUTS[id];
      if (layout) {
        for (const def of Object.values(layout.rooms)) for (const rung of def.rungs) for (const p of rung) props.push({ id: p.id, x: p.x, y: p.y });
        for (const s of M.homeScene.furnish(id, {}, null)) props.push(s);
        Object.values(M.layouts.TROPHY_MOUNT_SPRITES).forEach((sid, i) => { const [x, y] = layout.trophyMounts[i % layout.trophyMounts.length]; props.push({ id: sid, x, y }); });
      }
      const fx = row.kind === 'hunt' ? M.vfx.effectIds().map((e) => ({ id: e, x: at[0], y: at[1], age: 0, lift: 0 })) : [];
      const b = M.nullb.createNullBackend({ book, tables, view: { w: m.w * (m.T || T), h: m.h * (m.T || T) } });
      b.mount(); b.setMap(m);
      b.sync({ hero: { x: at[0], y: at[1] }, t: 0, props, fx, units: units.map((u) => ({ id: u, x: at[0], y: at[1] })) });
      const s = b.snapshot(), out = new Set(s.ground.tiles.map((t) => t.set));
      for (const k of ['decals', 'sprites', 'raised', 'fx']) for (const d of s.last[k] || []) out.add(d.set);
      for (const u of units) out.add(setOf(u));
      out.delete(''); out.delete(null); out.delete(undefined);
      return out;
    };
    const base = M.maps.WORLD_MAPS.filter((r) => !r.grid || r.grid === 'base');
    for (const row of base) {
      const loads = new Set(M.sceneSets.sceneSets(compiled(row.id), row, book, tables));
      const draws = drawn(row.id);
      const miss = [...draws].filter((s) => !loads.has(s));
      ok('A1', !miss.length, row.id + ' draws from ' + miss.join(', ') + ' but its scene does not load that sheet (a stub box until it does)');
      if (row.kind !== 'hunt') {
        const extra = [...loads].filter((s) => !draws.has(s));
        ok('A2', !extra.length, row.id + ' loads ' + extra.join(', ') + ' that nothing in it draws');
      }
    }
    /* non-vacuity: the Common leaves out a sheet the hunting grounds need (else A2 proves nothing about boot) */
    const town = new Set(M.sceneSets.sceneSets(compiled('town_common'), rows.town_common, book, tables));
    const ground = new Set(base.filter((r) => r.kind === 'hunt').flatMap((r) => M.sceneSets.sceneSets(compiled(r.id), r, book, tables)));
    ok('A2', [...ground].some((s) => !town.has(s)) && town.size < M.atlasSets.ATLAS_SETS.length, 'the Common loads every hunting ground\'s sheet: ' + [...town].join(', '));
  });
  return fails;
}

/* src/data and src/core whole: the scene sheets (src/world/scene-sets.js) read the grounds, effects and rooms, and those their own imports */
const COPY = ['src/world', 'src/data', 'src/core', 'src/build-info.js', 'assets/world'];
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
  ['C2', 'the x1.5 compose origin on any art px (its uneven columns re-cut as the camera moves)', 'src/world/core/camera.js', [['  const q = alignOf(z);\n  const cx', '  const q = 1;\n  const cx']]],
  ['C1', 'a whole town-zoom pick kept fractional at DPR 1.25', 'src/world/core/camera.js', [['return Number.isInteger(pick) ? Math.max(1, Math.round(z)) : z;', 'return z;']]],
  ['C6', 'a zoom fitted to the map width, passed in as a grid','src/world/render/canvas-backend.js', [['z = zoomFor(win.innerWidth, dpr, map && map.grid, zoomPick);', 'z = zoomFor(win.innerWidth, dpr, map && { density: Math.max(1, Math.floor(W / (map.w * T))), wideDensity: 1 }, zoomPick);']]],
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
  ['W2', 'a patch of painted ground is left as tones', 'src/world/core/compose.js', [['const p = patchAt(x, y), pt', 'const p = null, pt']]],
  ['W2', 'the map\'s ambient loop never plays', 'src/world/core/compose.js', [["const i = Math.floor((Math.max(0, state.t || 0) * (s.anims[name].fps || 0)) / 1000) % n;", 'const i = 0;']]],
  ['W2', 'a ground with no art lays nothing', 'src/world/core/compose.js', [['tones.push({ m: map.ground[y * map.w + x]', 'void ({ m: map.ground[y * map.w + x]']]],
  ['W2', 'the blend drawn on the cell grid, not the dual grid', 'src/world/core/compose.js', [['x: x * T + H, y: y * T + H', 'x: x * T, y: y * T']]],
  ['W2', 'the blend laid over the patches', 'src/world/core/compose.js', [['    if (map.blend) yield* blendSteps(map, book, T, (x, y) => !!patchAt(x, y), tiles);\n    tiles.push(...laid);', '    tiles.push(...laid);\n    if (map.blend) yield* blendSteps(map, book, T, (x, y) => !!patchAt(x, y), tiles);']]],
  ['W4', 'a scene\'s ground made in one task again (no slice budget)', 'src/world/core/compose.js', [['    if (now() - t0 >= budgetMs) return undefined;\n', '']]],
  ['W4', 'a slice that skips the rest of the ground', 'src/world/core/compose.js', [['        if (r) done(finish(r.value)); else o.later(slice);', '        if (r) done(finish(r.value)); else done(finish({ tiles: [], voids: [], tones: [] }));']]],
  ['W5', 'a scene\'s sheets made in one task again', 'src/world/scene-sets.js', [['export function sceneSetsSliced(map, row, book, tables, o) {\n', 'export function sceneSetsSliced(map, row, book, tables, o) {\n  return Promise.resolve(sceneSets(map, row, book, tables));\n']]],
  ['W5', 'a map\'s chunk bins made in one task again', 'src/world/render/ground-chunks.js', [['    prepare(m, art, sl) { return sl ? binsSliced(m, art, sl) : binsFor(m, art); },', '    prepare(m, art, sl) { return binsFor(m, art); },']]],
  ['W5', 'a chunk baked past its deadline (one long task)', 'src/world/render/ground-chunks.js', [['    const spent = () => timed && ++n % CHECK_EVERY === 0 && now() >= until;', '    const spent = () => false;']]],
  ['W5', 'a resumed chunk skips the tile it stopped at', 'src/world/render/ground-chunks.js', [['    for (const t = own.tiles; j.i < t.length; j.i += 5) {\n      if (spent()) return false;', '    for (const t = own.tiles; j.i < t.length; j.i += 5) {\n      if (spent()) { j.i += 5; return false; }']]],
  ['W5', 'a new map drawn before its view\'s ground is baked', 'src/world/render/canvas-backend.js', [['      if (!hold || !map || !canvas) return true;', '      return true;']]],
  ['W2', 'a hole corner (cliff) leaves its dual tile undrawn', 'src/world/core/compose.js', [['for (let i = 0; i < 4; i++) if (c[i] < 0) c[i] = most;', 'if (c.some((m) => m < 0)) continue;']]],
  ['W2', 'a third material drawn as the upper of the pair', 'src/world/core/compose.js', [['(m !== lo && !pairM[m * K + lo] && pairM[m * K + up])', '(m !== lo)']]],
  ['L1', 'every window of a map is let off the tree rule', 'src/world/core/map-compile.js', [['if (2 * greenIn(wx, wy) < ww * wh) continue;', 'continue;']]],
  ['W3', 'a fill floor hashed into seams', 'src/world/core/compose.js', [['const n = fill ? (y % fill[1]) * fill[0] + (x % fill[0]) : cellHash(x, y);', 'const n = cellHash(x, y);']]],
  ['G1', 'an unmapped monster falls into the cellar', 'src/world/core/scene-route.js', [['if (id && index[id]) return', "if (id) return { map: 'mill_cellar', kind: 'hunt' }; if (id && index[id]) return"]]],
  ['G2', 'a missing sprite resolves to nothing', 'src/world/core/book.js', [['const sprite = (id) => sprites[id] || STUB_SPRITE;', 'const sprite = (id) => sprites[id];']]],
  ['A1', 'the scene sheets forget the heroes', 'src/world/scene-sets.js', [['  const ids = new Set(Object.values(OUTFITS));', '  const ids = new Set();']]],
  ['A1', 'the scene sheets forget the hunt effects', 'src/world/scene-sets.js', [['    for (const id of effectIds()) ids.add(id);\n', '']]],
  ['A1', 'the scene sheets forget the home\'s furniture', 'src/world/scene-sets.js', [['  const layout = ROOM_LAYOUTS[row.id];', '  const layout = null;']]],  ['A2', 'every scene loads every sheet', 'src/world/scene-sets.js', [['  return Array.from(sets).sort();', '  for (const id of Object.keys(book.sprites)) note(book.frame(id).set);\n  return Array.from(sets).sort();']]],
  ['G3', 'sprites drawn over the roofs', 'src/world/render/canvas-backend.js', [
    ['    for (const d of list.sprites) {\n      if (d.kind === \'unit\' && (d.flash || d.grey)) blitUnit(g, d, view);\n      else { g.globalAlpha = d.alpha == null ? 1 : d.alpha; blit(g, d, view); }\n    }\n', ''],
    ['    g.globalAlpha = 1;\n    light(g, list, view, fv);', '    for (const d of list.sprites) blit(g, d, view);\n    g.globalAlpha = 1;\n    light(g, list, view, fv);']]],
];

async function selftest() {
  let bad = 0;
  const clean = copyTree();
  try {
    const f = await check(await load(clean));
    if (f.length) { console.log('  ✗ clean control is RED: ' + f.map((x) => x.id + ' ' + x.msg).join(' | ')); bad++; }
    else console.log('  ✓ clean control — an unmutated copy is green');
  } finally { rmSync(clean, { recursive: true, force: true }); }
  for (const [id, why, rel, edits] of MUTANTS) {
    const dir = copyTree();
    try {
      plantIn(dir, rel, edits);
      const f = await check(await load(dir));
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
  for (const m of M.maps.WORLD_MAPS.concat(M.maps.STAGED_MAPS)) console.log(m.id.padEnd(16), M.mapc.compileMap(m, tables).maskHash, m.maskHash ? '(row says ' + m.maskHash + ')' : '');
} else {
  const M = await load(ROOT);
  const fails = await check(M);
  if (fails.length) {
    for (const f of fails) console.error('  ✗ ' + f.id + '  ' + f.msg);
    console.error('world-core: ' + fails.length + ' failure(s)');
    process.exit(1);
  }
  console.log('world-core: green — y-sort, roofs, shadows, camera, map lint (' + M.maps.WORLD_MAPS.length + ' maps over ' + Object.keys(M.manifests).length + ' atlases), path, Wang, routing, stubs, layer order, art by scene');
}
