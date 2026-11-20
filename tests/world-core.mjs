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
//      uncovered part; C9 a hunt shows the void past its art only as far as the
//      hero's ring needs (the UI audit's N10); C10 the Great Hearth is framed
//      as far up as a new hero allows (the audit's town camera)
//   L  map lint over every shipped map, and over planted bad rows (whole
//      tiles, doors, roofs, reachability of walked maps, the wall kit, stations
//      in plain view)
//   P  8-way A* never cuts a corner
//   W  the Wang vertex grid melts lone tiles and keeps plains whole; a fill
//      floor is laid in its cycle order
//   G  scene routing (every ground, the Tower's included, shows the map it is fought on; the Tower's seats and slots stand on its
//      floor); missing art compiles and draws as a stub; the canvas draws the layers in the plan's order, and every canvas text
//      size floors at 12 CSS px; a training session's World line says where the hero trains, never "isn't in the World yet"
//      (idle-banner.js), and stands above the shell's bottom inset, never under the action bar (G7)
//   N  NAME PLATES (src/world/core/plates.js; Tyler 2026-11-08: "Fingerguns / The Rat catcher (centered of
//      course)"): a titled hero's plate is two centred lines, the title under the name, the block's foot
//      where a one-line plate's is; an untitled plate is one line; a crowd of plates on one spot never
//      overlaps; compose carries the title of your hero and of every unit; a plate that YIELDS (a monster's
//      name, Monster names on) steps up one line at most and is left out of a crowd rather than towering,
//      never moving a hero's plate
//   V  FLOOR VARIETY (src/world/core/ground-variety.js; Tyler 2026-11-16: "you can see the tile repeat"): the
//      picker has no period under 64 cells along a row (a fixed cycle fails); every varied floor (the town's grass and
//      dirt, each painted ground's repeated tiles) draws its variants, at most 40% the plain tile, no run cycling under 12;
//      a variant's plain sides are the floor's own edge pixel for pixel; details 1 in 7-14 cells, never touching; the
//      same cell picks the same tile on a second load
//   A  art by scene (src/world/scene-sets.js): every shipped scene loads every
//      sheet it draws from (the whole map, every hero, its monsters and effects,
//      every room's furniture), and a walked scene loads nothing more: the
//      Common never pulls a hunting ground's sheet; A3 no scene loads a worn set
//      (atlas-sets.js WORN_SETS, the faction looks: they come with the hero who wears one)
//
// --selftest copies the module closure (and the manifests) to a temp dir,
// plants one defect per rule family into the copy (never the tree), and
// requires the named family to go red — after a clean control.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG } from '../tools/world-art/png.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = sourceQuery(ROOT);
const argv = process.argv.slice(2);
/* a shipped atlas sheet, decoded once a run (family V reads the variants' pixels; the selftest copy carries no PNGs) */
const SHEETS = new Map();
const atlasImage = (set) => { if (!SHEETS.has(set)) SHEETS.set(set, decodePNG(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.png')))); return SHEETS.get(set); };

async function load(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + V);
  const [grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, sets, budget,
    sceneSets, outfits, grounds, vfx, layouts, homeScene, chunksM, canvasM, platesM, bannerM, viewSheets, imagesM, gv, rough, folk, stations] = await Promise.all([
    'src/world/core/grid.js', 'src/world/core/zsort.js', 'src/world/core/roofs.js', 'src/world/core/shadows.js',
    'src/world/core/camera.js', 'src/world/core/map-compile.js', 'src/world/core/path.js', 'src/world/core/wang.js',
    'src/world/core/scene-route.js', 'src/world/core/compose.js', 'src/world/render/null-backend.js',
    'src/world/core/book.js', 'src/data/world/maps/index.js', 'src/data/world/terrain.js', 'src/data/hunts.js',
    'src/data/world/atlas-sets.js', 'src/data/world/art-budget.js',
    'src/world/scene-sets.js', 'src/data/hunt-outfits.js', 'src/data/hunt-grounds.js', 'src/data/hunt-vfx.js',
    'src/data/world/house-layouts.js', 'src/world/home-scene.js', 'src/world/render/ground-chunks.js', 'src/world/render/canvas-backend.js',
    'src/world/core/plates.js', 'src/world/idle-banner.js', 'src/world/view-sheets.js', 'src/render/images.js', 'src/world/core/ground-variety.js', 'src/world/core/ground-rough.js', 'src/data/world/town/folk.js',
    'src/data/world/stations.js',
  ].map(imp));
  const manifests = {};
  /* every set on any grid (atlas-sets.js LOADED_SETS): the sandbox map lints against its own grid's art */
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  /* every client module importing ATLAS_SETS (every base-grid set, the worn ones included) (A3) */
  const atlasReaders = readdirSync(join(base, 'src'), { recursive: true }).map((f) => String(f).replace(/\\/g, '/'))
    .filter((f) => f.endsWith('.js') && /import\s*\{[^}]*\bATLAS_SETS\b[^}]*\}\s*from/.test(readFileSync(join(base, 'src', f), 'utf8')));
  return { grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, budget, manifests, atlasReaders,
    sceneSets, outfits, grounds, vfx, layouts, homeScene, atlasSets: sets, chunksM, canvasM, platesM, bannerM, viewSheets, imagesM, gv, rough, folk, stations,
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
  /* a staged pack's map (the Unmarked Catacombs: the descent's wings fight in its rooms before the hunting ground opens) compiles for the
     Tower-seat check (G5) only; every shipped-map check reads `rows` alone */
  const staged = Object.fromEntries(M.maps.STAGED_MAPS.map((m) => [m.id, m]));
  const compiled = (id) => M.mapc.compileMap(rows[id] || fixtures[id] || staged[id], tables);
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
    /* A room that fits the uncovered World is centred in it, not in the whole stage: across (the cellar's art is narrower
       than this stage, so nothing can keep the void off), and down as far as NO VOID ON THE ART allows (C9: its art is
       taller than the stage, so the centred room, 10 px of void over it, slides onto the art). */
    const cellar = compiled('mill_cellar'), fr = cellar.frame;
    const bo = openOf(M.camera.frameView({ x: 10, y: 6 }, 1680 / 2, 873 / 2, cellar, 2, T, { inset: dock, keep: { x: 10, y: 6 } }), 1680 / 2, 873 / 2);
    const downTo = Math.min(cellar.h * T - 873 / 2, Math.max(0, (fr.y + fr.h / 2) * T - 873 / 4));
    ok('C7', Math.abs(bo.x + bo.w / 2 - (fr.x + fr.w / 2) * T) <= 0.5 && Math.abs(bo.y - downTo) <= 0.5,
      'a room that fits the uncovered World must be centred in it, not in the whole stage (down: onto the art): open ' + JSON.stringify(bo));

    /* C9 NO VOID IN A HUNT (Tyler's UI audit 2026-11-18, N10: the room clamped only the uncovered World, so a black band
       showed under and below the short panels, on 95% of the Mill Cellar's floor at 1440x900). Every open tile of every
       hunt map, on the stages the three sizes measure (local world, 2026-11-19: the World's box and the hunt inset, CSS
       px at x2; the phone with the coach card's strip and without): the viewed hero's tile and the ring round it stay
       in the uncovered World (HUNT_KEEP_TILES); the whole view shows the void past the map's art only as far as that
       ring needs (a hero within a panel's width of the art's edge), and the first hunt's start tile shows none; the hero
       is off the middle of the uncovered World only where the room's or the art's edge stops the camera. */
    const STAGES = [['1440x900', 1422, 828, { left: 272, right: 302, top: 54, bottom: 180 }], ['1280x800', 1262, 728, { left: 272, right: 302, top: 54, bottom: 180 }],
      ['922x423 + coach', 904, 371, { left: 116, right: 325, top: 60, bottom: 93 }], ['922x423', 904, 371, { left: 116, right: 0, top: 60, bottom: 93 }]];
    const KEEP = 1.5 * T;   // the hero's tile and the tiles touching it: 1.5 tiles from its middle (camera.js HUNT_KEEP_TILES)
    for (const [stage, W, H, css] of STAGES) {
      const vw = W / 2, vh = H / 2, ins = { left: css.left / 2, right: css.right / 2, top: css.top / 2, bottom: css.bottom / 2 };
      const ax = [['x', vw, ins.left, ins.right, 'w'], ['y', vh, ins.top, ins.bottom, 'h']];
      let bad = null, n = 0;
      for (const id of Object.keys(rows).filter((k) => rows[k].kind === 'hunt')) {
        const m = compiled(id), room = m.frame ? { x: m.frame.x * T, y: m.frame.y * T, w: m.frame.w * T, h: m.frame.h * T } : { x: 0, y: 0, w: m.w * T, h: m.h * T };
        for (let y = 0; y < m.h && !bad; y++) for (let x = 0; x < m.w && !bad; x++) {
          if (m.mask[y * m.w + x] && !(m.spawns.some(([sx, sy]) => sx === x && sy === y))) continue;
          const fv = M.camera.frameView({ x, y }, vw, vh, m, 2, T, { inset: ins, keep: { x, y } });
          n++;
          for (const [k, v, a, b, len] of ax) {
            const c = fv.cam[k], u = v - a - b, hero = ((k === 'x' ? x : y) + 0.5) * T, art = m[len] * T, keep = Math.min(KEEP, u / 2);
            const at = hero - (c + a);
            if (at < keep - 0.5 || at > u - keep + 0.5) { bad = [id, x, y, k, 'the hero\'s ring under a panel', Math.round(at), Math.round(u)]; break; }
            if (art >= v) {
              const lo = Math.max(0, -c), hi = Math.max(0, c + v - art);
              if (lo > Math.max(0, a + keep - hero) + 0.5 || hi > Math.max(0, hero + keep + b - art) + 0.5) { bad = [id, x, y, k, 'void the hero does not need', Math.round(lo), Math.round(hi)]; break; }
            }
            const off = at - u / 2, rlo = room[k], rhi = room[k] + room[len];
            const stopped = off > 0 ? Math.abs(c + a + u - rhi) <= 0.5 || Math.abs(c + v - art) <= 0.5 || at >= u - keep - 0.5
              : Math.abs(c + a - rlo) <= 0.5 || Math.abs(c) <= 0.5 || at <= keep + 0.5;
            if (Math.abs(off) > T && !stopped && room[len] > u) { bad = [id, x, y, k, 'off the middle with no edge stopping the camera', Math.round(off)]; break; }
          }
        }
      }
      ok('C9', !bad && n > 1000, stage + ': ' + JSON.stringify(bad));
      const start = cellar.start, fv = M.camera.frameView({ x: start[0], y: start[1] }, vw, vh, cellar, 2, T, { inset: ins, keep: { x: start[0], y: start[1] } });
      const shown = { x: [fv.cam.x, fv.cam.x + vw], y: [fv.cam.y, fv.cam.y + vh] };
      ok('C9', shown.x[0] >= -0.5 && shown.x[1] <= cellar.w * T + 0.5 && shown.y[0] >= -0.5 && shown.y[1] <= cellar.h * T + 0.5,
        stage + ': the Mill Cellar\'s start tile shows the void (the black band): view ' + JSON.stringify(shown) + ' over a ' + cellar.w * T + 'x' + cellar.h * T + ' map');
    }

    /* C10 THE GREAT HEARTH, A SHOWPIECE (Tyler's UI audit 2026-11-18: centred on a new hero at 1440x900, the town never
       showed the Hearth's chimney, banner and crest). The town's stages (the World's box and its action-bar inset):
       on a new hero's first stand (hearth_square's first) the camera looks up the Hearth until its top shows, or until
       the hero stands one tile over the bar (it can look no further; at 1440x900 the art, 390 px, is taller than the
       World over the bar, 325), and fits its width while the hero stays in the middle half; at 1920x1080, and from two
       rows north at 1440x900, its whole top shows. A World over the bar under half its height (the phone's 139 px)
       frames nothing: the camera stays on the hero. On every tile near it the hero stands in the uncovered World, and
       a walk across the framing's edge moves the camera smoothly (never more than 3 px a px walked). */
    const town = compiled('town_common'), hs = town.shows.find((s) => s.id === 'great_hearth');
    /* its box is the art as compose.js places it (frameBox: the footprint's middle less the anchor across, the contact row less
       the measured height down), from the visible top, not the frame's */
    const ho = town.objects.find((o) => o.id === 'great_hearth'), hsp = book.sprite('great_hearth');
    ok('C10', !!hs && !!ho && hs.box.x === ho.x * T + Math.floor((ho.fw * T) / 2) - hsp.anchor[0] && hs.box.y === (ho.y + ho.fh) * T - 1 - hsp.height
      && hs.box.w === hsp.frame[0] && hs.box.h === hsp.height, 'the town names the Great Hearth a showpiece, its box the art drawn: ' + JSON.stringify(hs && hs.box));
    const first = M.stations.STATION_BY_ID.hearth_square.stands[0];
    const TOWN_STAGES = [['1440x900', 1422, 828, 178], ['1280x800', 1262, 728, 178], ['922x423', 904, 371, 93], ['1920x1080', 1902, 1008, 178]];
    for (const [stage, W, H, bar] of hs ? TOWN_STAGES : []) {
      const vw = W / 2, vh = H / 2, ins = { bottom: bar / 2 }, u = vh - ins.bottom;
      const at = (hx, hy) => M.camera.frameView({ x: hx, y: hy }, vw, vh, town, 2, T, { inset: ins, keep: { x: hx, y: hy } }).cam;
      const c = at(first[0], first[1]), hy = (first[1] + 0.5) * T - c.y, hx = (first[0] + 0.5) * T - c.x;
      ok('C10', hy >= T - 0.5 && hy <= u - T + 0.5 && hx >= T - 0.5 && hx <= vw - T + 0.5, stage + ': the new hero stands outside the World over the bar: ' + JSON.stringify([hx, hy]));
      if (2 * u < hs.box.h) ok('C10', Math.abs(hx - vw / 2) <= 0.5 && Math.abs(hy - u / 2) <= 0.5, stage + ': a World ' + u + ' px tall over the bar frames the Hearth anyway: hero ' + JSON.stringify([hx, hy]));
      else {
        ok('C10', c.y <= hs.box.y + 0.5 || Math.abs(hy - (u - T)) <= 0.5, stage + ': the camera stops short of the Hearth\'s top with the hero ' + (u - T - hy).toFixed(0) + ' px over the lowest it may stand');
        ok('C10', (c.x <= hs.box.x + 0.5 && c.x + vw >= hs.box.x + hs.box.w - 0.5) || Math.abs(hx - vw / 4) <= 0.5 || Math.abs(hx - 3 * vw / 4) <= 0.5,
          stage + ': the Hearth\'s width is cut with the hero ' + hx.toFixed(0) + ' px in, inside the middle half of ' + vw);
      }
      if (stage === '1920x1080') ok('C10', c.y <= hs.box.y + 0.5, stage + ': the Hearth\'s top is off the World: camera ' + c.y + ', top ' + hs.box.y);
      if (stage === '1440x900') ok('C10', at(first[0], first[1] - 2).y <= hs.box.y + 0.5, stage + ': two rows north of the first stand, the Hearth\'s top is off the World');
      const n = hs.near, f = hs.fade;
      let bad = null;
      for (let y = n.y - f; y < n.y + n.h + f && !bad; y++) for (let x = n.x - f; x < n.x + n.w + f && !bad; x++) {
        if (town.mask[y * town.w + x]) continue;
        const q = at(x, y), px = (x + 0.5) * T - q.x, py = (y + 0.5) * T - q.y;
        if (px < T - 0.5 || px > vw - T + 0.5 || py < T - 0.5 || py > u - T + 0.5) bad = [x, y, px, py, 'under the bar or off the World'];
        else if (px < vw / 4 - 0.5 || px > (3 * vw) / 4 + 0.5) bad = [x, y, px, py, 'out of the middle half across'];
      }
      ok('C10', !bad, stage + ': near the Hearth the hero stands ' + (bad ? bad[4] : '') + ': ' + JSON.stringify(bad));
      let jump = null;
      for (const [x0, y0, dx, dy] of [[first[0], first[1], 0, 1], [first[0], first[1], -1, 0], [n.x + n.w - 1, n.y + 6, 1, 0], [n.x + 9, n.y + n.h - 1, 0, 1]]) {
        let prev = at(x0, y0);
        for (let s = 1; s <= (f + 2) * T && !jump; s++) {
          const q = at(x0 + (dx * s) / T, y0 + (dy * s) / T), d = Math.max(Math.abs(q.x - prev.x), Math.abs(q.y - prev.y));
          if (d > 3) jump = [x0, y0, dx, dy, s, d];
          prev = q;
        }
      }
      ok('C10', !jump, stage + ': walking out of the Hearth\'s framing the camera jumps: ' + JSON.stringify(jump));
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
      ['an ambient row seated a fraction across', 'L-WHOLE', 'town_common', (r) => { r.ambient[r.ambient.length - 1].dx = 2.5; }],
      ['an ambient row seated off its tile', 'L-WHOLE', 'town_common', (r) => { r.ambient[r.ambient.length - 1].dx = 17; }],
      ['a station hidden behind the well', 'L-COVER', 'town_common', (r) => { const w = r.objects.find((o) => o.id === 'well'); r.stations = Object.assign({}, r.stations, { combat: [w.x, w.y - 1] }); }],
      ['a hunt map drawn in placeholder tones', 'L-KIND', 'mill_cellar', (r) => { r.ground = null; }],
      ['a ground no atlas carries', 'L-KIND', 'town_common', (r) => { r.ground = 'town_ground'; }],
      ['a showpiece that names nothing placed there', 'L-SHOW', 'town_common', (r) => { r.shows[0].x += 1; }],
      ['a showpiece near tiles off the map', 'L-SHOW', 'town_common', (r) => { r.shows[0].near = [r.rows[0].length - 3, 37, 27, 14]; }],
      ['a showpiece on a hunt map', 'L-SHOW', 'mill_cellar', (r) => { r.shows = [{ id: 'millstone', x: 19, y: 4, near: [3, 3, 19, 9], fade: 2 }]; }],
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
          ok('W2', !!f0 && !!f1 && f0.cy === Math.round((a.y + 1) * T - 1 - a.lift) && f0.cx === Math.round((a.x + 0.5) * T + (a.dx || 0))
            && (f0.sx !== f1.sx || f0.sy !== f1.sy),
            id + ': the ambient ' + a.id + ' at ' + a.x + ',' + a.y + ' must be drawn, lifted ' + a.lift + ' px and ' + (a.dx || 0) + ' across, and loop on the clock');
          /* an object standing on art (the Hearth Chest on the Hearth's ledge, lane/fix137-hearth-chest-art) keeps its manifest ellipse,
             at its foot by the one shadow rule (shadows.js), since the floor's mask lies under the art it stands on; a light casts none */
          const s = book.sprite(a.id), sh = s.blend !== 'add' && s.shadow && s.shadow.kind === 'ellipse' ? s.shadow : null;
          ok('W2', !f0 || (sh ? !!f0.shade && f0.shade.cx === f0.cx + sh.dx - 2 && f0.shade.cy === f0.cy + sh.dy - 1 && f0.shade.w === sh.w && f0.shade.h === sh.h
            : !f0.shade), id + ': the ambient ' + a.id + (sh ? ' must stand on its manifest ellipse at its foot' : ' must cast no shadow') + ', got ' + JSON.stringify(f0 && f0.shade));
        }
        ok('W2', id !== 'town_common' || m.ambient.some((a) => a.dx) && m.ambient.some((a) => book.sprite(a.id).shadow),
          'the town must keep an ambient row seated across a tile (dx) and one with a shadow (the Hearth Chest), or W2 proves neither');
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
    /* A fill floor (one periodic field, e.g. the cellar's flat earth) is laid in its cycle order, never hashed into seams.
       The one exception is a painted ground's VARIETY (src/world/core/ground-variety.js): a cell whose cycle tile is the
       tile a variety names (`at`) may draw one of that variety's variants instead, and no other cell may. */
    for (const id of Object.keys(rows)) {
      const m = compiled(id), terr = book.terrains[m.groundTerrain];
      if (!terr || terr.kind !== 'fill') continue;
      const [cols, rws] = terr.cycle || [1, 1];
      const want = (x, y) => book.tile(m.groundTerrain, '1111', (y % rws) * cols + (x % cols));
      const vars = Object.entries(book.terrains).filter(([, v]) => v.kind === 'variety' && v.of === m.groundTerrain);
      const bases = vars.map(([, v]) => terr.tiles['1111'][v.at[1] * cols + v.at[0]]);
      const varied = (t, w) => {
        const k = bases.findIndex((b) => b && b[0] === w.sx && b[1] === w.sy);
        return k >= 0 && t.set === vars[k][1].set && vars[k][1].tiles['1111'].some(([sx, sy]) => sx === t.sx && sy === t.sy);
      };
      const bad = M.compose.groundTiles(m, book, tables, T).tiles.filter((t) => {
        const w = want(t.x / T, t.y / T);
        return !w || ((w.set !== t.set || w.sx !== t.sx || w.sy !== t.sy) && !varied(t, w));
      });
      ok('W3', bad.length === 0, id + ': ' + bad.length + ' fill tiles are out of their ' + cols + 'x' + rws + ' cycle (and not a variant of a varied tile)');
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
    /* ...and EVERY whole-map pass in it is cut by row, never one step (nightly 44730692384: the town's rough edges, two passes a
       pair, were one 70 ms step of its sliced ground on CI, the town made after a death). A PLANTED HEAVY rule, the town's own
       pairs four times over: each pair must add at least a step per row; one step per slice (a 1-tick budget, one tick per look). */
    {
      const town = compiled('town_common');
      const steps = (rough) => {
        const m = Object.assign({}, town, { blend: Object.assign({}, town.blend, { rough }) });
        const q = [];
        let clock = 0, n = 1;
        M.compose.groundOfSliced(m, book, tables, T, { later: (fn) => q.push(fn), now: () => clock++, budgetMs: 1 });
        while (q.length) { n++; q.shift()(); }
        return n;
      };
      const own = town.blend && town.blend.rough;
      ok('W4', !!(own && own.pairs && own.pairs.length), 'the town has no rough rule to plant four times over: plant one here');
      if (own && own.pairs) {
        const heavy = Object.assign({}, own, { pairs: [...own.pairs, ...own.pairs, ...own.pairs, ...own.pairs] });
        const added = steps(heavy) - steps(null);
        ok('W4', added >= heavy.pairs.length * town.h, 'a rough rule of ' + heavy.pairs.length + ' pairs added ' + added + ' step(s) to the town\'s '
          + town.h + '-row sliced ground (at least ' + heavy.pairs.length * town.h + '): its whole-map passes run inside one step, one long task');
      }
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
    let onResize = null;
    const win = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, performance: { now: () => clock++ }, addEventListener(type, fn) { if (type === 'resize') onResize = fn; }, removeEventListener() {},
      setTimeout: (fn) => q.push(fn), clearTimeout() {}, requestIdleCallback: (fn) => q.push(fn), cancelIdleCallback() {} };
    const paneFrom = canvases.length;
    const cb = M.canvasM.createCanvasBackend({ win, doc, book, images, tables, css: tone });
    const shownAt = canvases.length;
    cb.mount({ appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }) });
    const shown = canvases[shownAt];   // the canvas on screen (mount's first canvas)
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
    /* W5 (report #81, 2560x1271: "Black screened ... I zoomed in/out and screen came back"): a HELD frame keeps the last frame on
       screen. The stage resized (a window resize, the ResizeObserver) while a frame is held (a new zoom's ground baking, a sheet on its
       way) must not resize the shown canvas: a canvas given a new size is cleared, and this one is opaque, so it went BLACK with nothing
       drawn on it for as long as the hold lasted. Its bitmap takes the new size in the frame that paints it. */
    const firstSize = shown.width + 'x' + shown.height;
    shown.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 800 });
    if (onResize) onResize();
    cb.setZoom(1);   // the viewer's zoom out: a wider view whose ground is baked first, the last frame held meanwhile
    let resizedHeld = 0, blanked = 0;
    while (!cb.ready(state) && resizedHeld < 10000) { resizedHeld++; if (shown.width + 'x' + shown.height !== firstSize) blanked++; }
    cb.sync(state);
    ok('W5', typeof onResize === 'function' && resizedHeld >= 1 && blanked === 0 && firstSize === '1440x900' && shown.width === 1440 && shown.height === 800,
      'a resize met while a frame is held must keep the last frame (' + blanked + ' of ' + resizedHeld + ' held frame(s) resized, so cleared, the shown canvas from '
      + firstSize + '; after the paint ' + shown.width + 'x' + shown.height + ', want 1440x800)');
    /* W5: a pane let go gives every canvas back at once (left to the collector they came due as a 166-318 ms pause in a later frame, perf-budget long frames) */
    cb.destroy();
    const kept = canvases.slice(paneFrom).filter((c) => c.width || c.height);
    ok('W5', canvases.length > paneFrom + 5 && kept.length === 0, 'a destroyed backend still holds ' + kept.length + ' canvas(es) with pixels of its ' + (canvases.length - paneFrom));
    q.length = 0;
  });

  /* W6 (perf lane 10-29): a frame places only the standing art near its view (it walked the town's 22,272 cells and
     placed its 966 objects every frame, to keep the ~10% on screen), and keeps every piece the whole walk keeps, in the
     whole walk's order. Counted (book.frame per frame), never timed. */
  fam('W6', () => {
    const everything = { ox: -1e6, oy: -1e6, w: 2e6, h: 2e6 };
    const key = (d) => d.id + '@' + d.x + ',' + d.y;
    for (const id of ['town_common', 'coppercap_warrens', 'mosslight_glade']) {
      const m = Object.assign({}, compiled(id));
      let calls = 0;
      const counted = Object.assign({}, book, { frame: (...a) => { calls++; return book.frame(...a); } });
      const all = M.compose.composeFrame(m, counted, { hero: null, t: 0 }, everything, tables, T);
      for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.15], [0.9, 0.85], [0.33, 0.7]]) {
        const V = { ox: Math.round(fx * m.w * T - 360), oy: Math.round(fy * m.h * T - 225), w: 720, h: 450 };
        const near = (d) => d.x < V.ox + V.w + 2 * T && d.y < V.oy + V.h + 2 * T && d.x + d.w > V.ox - 2 * T && d.y + d.h > V.oy - 2 * T;
        calls = 0;
        const f = M.compose.composeFrame(m, counted, { hero: null, t: 0 }, V, tables, T);
        const drawn = f.decals.length + f.sprites.length + f.raised.length;
        ok('W6', calls <= drawn + 8 && (m.objects.length < 300 || calls < m.objects.length / 4),
          id + ': a ' + V.w + 'x' + V.h + ' view placed ' + calls + ' frames to draw ' + drawn + ' of the map\'s ' + m.objects.length + ' objects (every frame walks the whole map)');
        for (const layer of ['decals', 'sprites', 'raised']) {
          const want = all[layer].filter(near).map(key).join('|'), got = f[layer].map(key).join('|');
          ok('W6', got === want, id + ' ' + layer + ' at (' + V.ox + ',' + V.oy + '): the frame drew ' + f[layer].length + ', the whole walk keeps '
            + all[layer].filter(near).length + (got === want ? '' : ' (first difference near ' + (got.split('|').find((k, i) => k !== want.split('|')[i]) || 'the end') + ')'));
        }
      }
    }
  });

  /* W7 A LATE SHEET HOLDS NOTHING FOR LONG (report #81: the town held on a sheet that never came froze the picture, then a resize
        blanked it). On a clock and timers of the test's own: a frame naming a sheet whose load never settles holds until
        SHEET_HOLD_MS, then draws (the pane woken for it); a first view on such a sheet opens at the limit; a sheet request that
        stalls is let go and asked again, and one that stalls every try fails (then a later ask starts over). */
  await famAsync('W7', async () => {
    let t = 0;
    const timers = [];
    const win = { performance: { now: () => t }, setTimeout: (fn, ms) => timers.push({ at: t + (ms || 0), fn }), clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; } };
    const run = (to) => { t = to; for (const x of timers.slice()) if (x.fn && x.at <= t) { const f = x.fn; x.fn = null; f(); } };
    const settle = () => new Promise((k) => setTimeout(k, 0));
    const town = M.maps.SCENE_MAPS.town, HOLD = M.viewSheets.SHEET_HOLD_MS, cast = {};
    const never = new Promise(() => {});
    const views = (wake) => M.viewSheets.createViewSheets({ win, sheets: { ready: () => false, ensure: () => never },
      needs: new Map([[town, ['common', 'havora']]]), town: null, missing: () => ['havora'], wake });
    let wakes = 0;
    const vs = views(() => { wakes++; });
    const first = vs.held(town, cast);
    run(HOLD - 1);
    const under = vs.held(town, cast);
    run(HOLD);
    ok('W7', first === true && under === true && vs.held(town, cast) === false && wakes >= 1,
      'a frame naming a sheet that never comes must hold under ' + HOLD + ' ms and draw at it, the pane woken (held ' + first + ', '
      + under + ' at ' + (HOLD - 1) + ' ms, ' + vs.held(town, cast) + ' at ' + HOLD + ' ms; ' + wakes + ' wake(s))');
    t = 0; timers.length = 0;
    let opened = false;
    views(() => {}).open(() => ({ id: town, cast })).then(() => { opened = true; });
    await settle();
    const early = opened;
    run(HOLD);
    for (let i = 0; i < 5 && !opened; i++) await settle();
    ok('W7', !early && opened, 'a first view whose sheet never comes must open at the limit (open before it: ' + early + ', at it: ' + opened + ')');
    /* the sheet's own load: a stalled request let go and asked again; one that stalls every try fails, and is asked afresh later */
    t = 0; timers.length = 0;
    const imgs = [];
    const doc = { baseURI: 'http://world-core.test/', defaultView: win, createElement: () => { const i = { onload: null, onerror: null, src: '' }; imgs.push(i); return i; } };
    const { heldImage, LOAD_WAIT_MS, LOAD_TRIES } = M.imagesM;
    let got = null;
    heldImage(doc, 'assets/world/w7-stalls-once.png').then((v) => { got = v; }, () => { got = 'failed'; });
    run(LOAD_WAIT_MS);
    const tries = imgs.length, let1 = imgs[0] && imgs[0].src === '';
    if (imgs[1] && imgs[1].onload) imgs[1].onload();
    if (imgs[0] && imgs[0].onload) imgs[0].onload();   // the stuck try answering late is not the answer
    await settle();
    ok('W7', tries === 2 && let1 && got === imgs[1], 'a sheet request that stalls must be let go and asked again (' + tries + ' request(s), the first let go: ' + let1 + ', answered by the retry: ' + (got === imgs[1]) + ')');
    imgs.length = 0;
    t = 0;
    let failed = null;
    heldImage(doc, 'assets/world/w7-stalls-always.png').then(() => { failed = false; }, (e) => { failed = e.message; });
    for (let k = 1; k <= LOAD_TRIES; k++) run(k * LOAD_WAIT_MS);
    await settle();
    const all = imgs.length;
    heldImage(doc, 'assets/world/w7-stalls-always.png').catch(() => {});
    ok('W7', all === LOAD_TRIES && typeof failed === 'string' && imgs.length === all + 1,
      'a sheet that stalls every try must fail after ' + LOAD_TRIES + ' (' + all + ' request(s), failed: ' + failed + ') and be asked afresh by the next ask (' + (imgs.length - all) + ' new)');
  });

  fam('G', () => {
    const idx = M.route.huntMapIndex(M.maps.WORLD_MAPS, M.hunts.HUNT_INDEX);
    const S = (a, c) => M.route.sceneFor(a, c, idx, M.maps.SCENE_MAPS);
    ok('G1', S({ kind: 'combat', id: 'mill_cellar' }, 'home').map === 'mill_cellar' && S({ kind: 'combat', id: 'rat' }, 'town').map === 'mill_cellar',
      'a mill_cellar hunt or a rat training fight must show the cellar');
    ok('G1', S({ kind: 'combat', id: 'goblin' }, 'home').map === 'home_cottage' && S(null, 'town').map === 'town_common' && S({ kind: 'gather', id: 'rat' }, 'home').kind === 'home' && S(null, 'garbage').map === 'town_common',
      'anything else shows the viewer\'s choice of town or home');
    /* G6 (audit F25; the designer's coherence pass 2026-11-15, walk row 5): a training session showed "Training Yard isn't in the World
       yet. The Mill Cellar is." with the yard standing in the town. Its line says where the hero trains and opens Training; a hunt with
       no map keeps its own line. */
    const town = { kind: 'town' }, mon = (id) => id;
    const yard = M.bannerM.unmappedBanner({ activeMonster: 'yard_dummy', _huntId: 'training_yard_defense', playerName: 'Wren' }, town, mon) || '';
    ok('G6', />Training Defense at the Training Yard</.test(yard) && /data-world-go="training"/.test(yard) && !/World yet|Mill Cellar/.test(yard),
      'a yard session must say where the hero trains and open Training: ' + yard);
    const home = M.bannerM.unmappedBanner({ activeMonster: 'yard_dummy', _huntId: 'training_house_magic', playerName: 'Wren' }, town, mon) || '';
    ok('G6', />Training Magic on the home dummy</.test(home), 'a house dummy session must say it trains at home: ' + home);
    const ridge = M.bannerM.unmappedBanner({ activeMonster: 'wolf', _huntId: 'meadowbrook_thicket' }, town, mon) || '';
    ok('G6', /isn’t in the World yet/.test(ridge) && /data-world-go="hunt"/.test(ridge), 'a hunt with no map keeps its line: ' + ridge);
    /* G7 (lane/a-training-display): at 1440x900 the line sat 10 px off the stage's foot, under the action bar that the shell lays over
       the same foot, at every size the gate plays (1440x900, 1280x720, 922x423, 667x375). Its foot is the shell's bottom inset (the
       unmoved bottom widgets, src/shell/shell.js insetNow -> runtime.setInset) plus a gap, so neither covers the other. */
    const foot = (o) => (typeof M.bannerM.bannerFoot === 'function' ? M.bannerM.bannerFoot(o) : null);
    const bar = foot({ left: 0, right: 0, top: 120, bottom: 180 }), none = foot(null);
    ok('G7', bar !== null && bar > 180 && bar <= 200 && none !== null && none > 0 && none <= 20 && foot({ bottom: -5 }) === none && foot({ bottom: NaN }) === none,
      'the World\'s line must stand just above the shell\'s bottom inset (180 px -> 181..200; none -> a small gap): ' + JSON.stringify({ bar, none }));
    /* G5 (Krell's Hall showed the town, 2026-11-14): every hunt, called room and keyed hall routes to the map its fight is
       fought on (its ground row's `map`). An open one through WORLD_MAPS, the client's own table; a staged one through
       WORLD_MAPS + STAGED_MAPS, so a pack's map lists all its rooms before the pack ships. */
    const allIdx = M.route.huntMapIndex([...M.maps.WORLD_MAPS, ...M.maps.STAGED_MAPS], M.hunts.HUNT_INDEX);
    /* the Tower too (2026-11-16, "why is the tower lopsided"): its climb was fought on the Sewer's grid while the scene drew the flue, so the
       flue was bent round the Rat King's hall. Its ground's map is the room the scene shows, and its seats and slots stand on that room's floor. */
    const towers = Object.values(M.grounds.TOWER_GROUNDS);
    const fought = [...Object.values(M.grounds.HUNT_GROUNDS), ...Object.values(M.grounds.CALLED_GROUNDS), ...Object.values(M.grounds.HALL_GROUNDS), ...towers];
    const wrong = fought.filter((g) => {
      const staged = !M.hunts.HUNT_INDEX[g.hunt] || M.hunts.HUNT_INDEX[g.hunt].staged === true;
      const r = M.route.sceneFor({ kind: 'combat', id: g.hunt }, 'town', staged ? allIdx : idx, M.maps.SCENE_MAPS);
      return r.kind !== 'hunt' || r.map !== g.map;
    });
    ok('G5', fought.length >= 10 && fought.some((g) => g.hall) && towers.length >= 1 && !wrong.length,
      'every hunt, called room, hall and the Tower must show its own map (' + fought.length + ' grounds; wrong: ' + wrong.map((g) => g.hunt + '->' + g.map).join(', ') + ')');
    const shut = towers.flatMap((g) => {
      const m = compiled(g.map);
      return [...g.start, ...g.pockets.flatMap((p) => p.spawns.map((s) => [s.x, s.y]))]
        .filter(([x, y]) => !(x < m.w && y < m.h && m.mask[y * m.w + x] === 0)).map(([x, y]) => g.id + ' ' + x + ',' + y);
    });
    ok('G5', !shut.length, 'every Tower seat and slot must stand on open floor of its own map (shut: ' + shut.join(', ') + ')');
    const miss = book.frame('no_such_sprite');
    ok('G2', miss.set === '' && miss.w === M.bookm.STUB_SPRITE.frame[0] && book.sprite('no_such_sprite') === M.bookm.STUB_SPRITE, 'a sprite no atlas carries must resolve to the stub record and frame');
    const lost = M.bookm.createBook({ heroes: M.manifests.heroes });
    const stubTables = Object.assign({}, tables, { sprites: new Proxy(lost.sprites, { get: (t, k) => t[k] || M.bookm.STUB_SPRITE }) });
    let drawn = null;
    try {
      const b = M.nullb.createNullBackend({ book: lost, tables: stubTables });
      b.mount(); b.setMap(M.mapc.compileMap(rows.mill_cellar, stubTables)); b.sync({ hero: { x: 10, y: 7 }, t: 0 });
      drawn = b.snapshot().last;
    } catch (e) { drawn = null; }
    ok('G2', drawn && drawn.sprites.some((d) => d.set === '') && drawn.sprites.some((d) => d.set === 'heroes'), 'with an atlas missing, the scene must still compose (stubs for its sprites, real art for the rest)');
    const order = ['list.decals', 'shadows(g, list', 'list.sprites', 'list.raised', 'light(g, list', 'ctx.drawImage(comp.c', 'overlay(list'];
    const draw = M.canvasSrc.slice(M.canvasSrc.indexOf('function draw('));
    const pos = order.map((k) => draw.indexOf(k));
    ok('G3', pos.every((p, i) => p > 0 && (!i || pos[i - 1] < p)), 'canvas-backend draw() must paint ground, decals, shadows, sprites, raised, light, blit, screen overlay in that order (' + pos.join(',') + ')');
    /* §7 text at least 12 px: every canvas text size (a `px` or `font` floor, Math.round(N * dpr)) floors at 12 CSS px or more
       (audit 11-09 F13: the bleed badge's floor was 11). */
    const floors = M.canvasSrc.split('\n').filter((l) => /\b(?:const|let)\s+(?:px|font)\s*=/.test(l) && /\*\s*dpr\)/.test(l)).map((l) => {
      const a = l.lastIndexOf('Math.round(');
      return { l: l.trim(), n: (l.slice(a + 11, l.indexOf('* dpr)', a)).match(/\d+(?:\.\d+)?/g) || []).map(Number) };
    });
    const small = floors.filter((f) => !f.n.length || Math.min(...f.n) < 12);
    ok('G4', floors.length >= 3 && !small.length, 'every canvas text size must floor at 12 CSS px (' + floors.length + ' floors; under 12: ' + small.map((f) => f.l).join(' | ') + ')');
  });

  /* A  ART BY SCENE (scene-sets.js; 10-23: every sheet loaded on Play, 2.32 MB / ~45 MB decoded): a scene loads
        exactly the sheets it draws from. Measured here through the null backend over the WHOLE map, with
        everything that can walk or play on it: every hero outfit; on a hunt map every monster its grounds and
        hunts spawn and every hunt effect; at home every piece of every room, its signposts and trophy mounts. */
  fam('N', () => {
    const m = compiled('town_common');
    const at = [Math.floor(m.w / 2), Math.floor(m.h / 2)];
    const knight = M.outfits.OUTFITS.knight;
    const peer = (text, title) => ({ id: knight, x: at[0], y: at[1], plate: { text, title, kind: 'peer' }, ref: { player: { name: text } } });
    const everything = { ox: -1e6, oy: -1e6, w: 2e6, h: 2e6 };
    const f = M.compose.composeFrame(m, book, { hero: { x: at[0], y: at[1] }, name: 'Fingerguns', title: 'the Ratcatcher',
      units: [peer('Marlow · 18', 'the Wolfer'), peer('Tamsel · 18', null), peer('Wren · 9', 'the Gamekeeper')], t: 0 }, everything, tables, T);
    const mine = f.plates.find((p) => p.kind === 'self');
    ok('N', !!mine && mine.text === 'Fingerguns' && mine.title === 'the Ratcatcher', 'your hero\'s plate carries ' + JSON.stringify(mine) + ', not Fingerguns over the Ratcatcher');
    ok('N', f.plates.filter((p) => p.kind === 'peer').map((p) => p.title).join() === 'the Wolfer,,the Gamekeeper', 'the units\' plates carry the titles ' + f.plates.map((p) => p.title).join());
    /* laid out as the canvas does (yours first; widths from a fixed advance, sizes the canvas's at x3) */
    const order = f.plates.slice().sort((a, b) => (b.kind === 'self') - (a.kind === 'self'));
    const laid = M.platesM.layPlates(order.map((p) => Object.assign({}, p, { x: p.x * 3, y: p.y * 3 })),
      { measure: (s, px) => s.length * px * 0.55, px: (k) => (k === 'self' ? 15 : 13), width: 1e7, edge: 48 });
    const me = laid[0], tamsel = laid.find((l) => l.plate.text === 'Tamsel · 18');
    ok('N', me.lines.length === 2 && me.lines[0].text === 'Fingerguns' && me.lines[1].text === 'the Ratcatcher', 'a titled plate draws ' + JSON.stringify(me.lines));
    ok('N', me.lines[1].y === me.box.b && me.box.b === order[0].y * 3 && me.lines[0].y === me.lines[1].y - me.px - M.platesM.PLATE_GAP && me.box.t === me.box.b - 2 * me.px - M.platesM.PLATE_GAP,
      'the title is not under the name with the block\'s foot on the anchor: ' + JSON.stringify(me));
    ok('N', Math.abs((me.box.l + me.box.r) / 2 - me.x) < 1e-9 && me.x === order[0].x * 3, 'the plate is not centred on its owner');
    ok('N', tamsel && tamsel.lines.length === 1 && tamsel.box.t === tamsel.box.b - tamsel.px, 'an untitled plate draws ' + JSON.stringify(tamsel && tamsel.lines));
    const touch = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const clash = laid.flatMap((a, i) => laid.slice(i + 1).filter((b) => touch(a.box, b.box)).map((b) => a.plate.text + ' / ' + b.plate.text));
    ok('N', laid.length === 4 && clash.length === 0, 'four plates on one tile overlap: ' + clash.join(', '));
    /* A dense pull with Monster names on: eight yielding names on the spot after the four heroes' plates. Each steps up one
       line at most (so it stays over its own monster) and is left out rather than towering; the heroes' plates never move. */
    const pull = Array.from({ length: 8 }, (_, i) => ({ text: 'Giant Rat', kind: 'ambient', yields: true, x: order[0].x * 3 + (i % 2) * 6, y: order[0].y * 3 }));
    const opts = { measure: (s, px) => s.length * px * 0.55, px: (k) => (k === 'self' ? 15 : 13), width: 1e7, edge: 48 };
    const crowd = M.platesM.layPlates(order.map((p) => Object.assign({}, p, { x: p.x * 3, y: p.y * 3 })).concat(pull), opts);
    const names = crowd.filter((l) => l.plate.yields), heroesKept = crowd.filter((l) => !l.plate.yields);
    const clash2 = crowd.flatMap((a, i) => crowd.slice(i + 1).filter((b) => touch(a.box, b.box)).map((b) => a.plate.text + ' / ' + b.plate.text));
    ok('N', clash2.length === 0 && names.length < pull.length && names.every((l) => l.plate.y - l.box.b <= M.platesM.YIELD_STEPS * (l.px + M.platesM.PLATE_GAP))
      && JSON.stringify(heroesKept.map((l) => l.box)) === JSON.stringify(laid.map((l) => l.box)),
      'a crowd of monster names must give way, not tower or move a hero: ' + JSON.stringify({ clash: clash2, shown: names.length, lifts: names.map((l) => l.plate.y - l.box.b) }));
    /* four rats in one tile, no hero near: the first stands, the second steps up one line, the rest give way */
    const pack = M.platesM.layPlates(Array.from({ length: 4 }, () => ({ text: 'Giant Rat', kind: 'ambient', yields: true, x: 500, y: 500 })), opts);
    ok('N', pack.length === 1 + M.platesM.YIELD_STEPS && pack.every((l, i) => l.box.b === 500 - i * (l.px + M.platesM.PLATE_GAP)),
      'a pack of four must show one name per line it may step, then give way: ' + JSON.stringify(pack.map((l) => l.box.b)));
    const alone = M.platesM.layPlates([{ text: 'Giant Rat', kind: 'ambient', yields: true, x: 500, y: 500 }, { text: 'Giant Rat', kind: 'ambient', yields: true, x: 900, y: 500 }], opts);
    ok('N', alone.length === 2 && alone.every((l) => l.box.b === 500), 'two monsters apart must both show their names where they stand: ' + JSON.stringify(alone.map((l) => l.box)));
  });

  fam('A', () => {
    const setOf = (id) => book.frame(id).set;
    /* every hero outfit but a worn set's (the faction looks): those come with the hero who wears one (src/world/worn-sets.js), A3 */
    const worn = new Set(Object.keys(M.atlasSets.WORN_SETS));
    const heroes = Object.values(M.outfits.OUTFITS).filter((id) => !M.atlasSets.wornSetOf(id));
    const drawn = (id) => {
      const row = rows[id], m = compiled(id), at = row.start || [1, 1];
      const units = heroes.slice();
      /* the townsfolk walk the map in their own bodies (src/world/town-folk.js folkExtras) */
      for (const p of M.folk.FOLK[id] || []) units.push(p.body);
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
      const early = [...loads].filter((s) => worn.has(s));
      ok('A3', !early.length, row.id + ' loads the worn set ' + early.join(', ') + ' with the scene: every player would fetch the faction looks');
    }
    /* non-vacuity: a worn set exists, it is a hero set, and every sprite it lists is a worn outfit the book draws from it (else A3 proves nothing) */
    const wornIds = Object.entries(M.atlasSets.WORN_SETS).flatMap(([set, ids]) => ids.map((id) => [set, id]));
    ok('A3', wornIds.length > 0 && wornIds.every(([set, id]) => M.atlasSets.HERO_SETS.includes(set) && Object.values(M.outfits.OUTFITS).includes(id) && setOf(id) === set),
      'the worn sets ' + JSON.stringify(M.atlasSets.WORN_SETS) + ' are not hero sets whose outfits the book draws from them');
    /* ...and no client module reads every set: the World's first open, the Hunts window's creatures and the rest read FIRST_OPEN_SETS */
    ok('A3', !M.atlasReaders.length, 'src/' + M.atlasReaders.join(', src/') + ' reads ATLAS_SETS, the worn sets included: every player would fetch the faction looks\' manifest (read FIRST_OPEN_SETS)');
    ok('A3', !M.atlasSets.FIRST_OPEN_SETS.some((s) => worn.has(s)) && M.atlasSets.FIRST_OPEN_SETS.length === M.atlasSets.ATLAS_SETS.length - worn.size,
      'FIRST_OPEN_SETS is not every set but the worn ones: ' + M.atlasSets.FIRST_OPEN_SETS.join(', '));
    /* non-vacuity: the Common leaves out a sheet the hunting grounds need (else A2 proves nothing about boot) */
    const town = new Set(M.sceneSets.sceneSets(compiled('town_common'), rows.town_common, book, tables));
    const ground = new Set(base.filter((r) => r.kind === 'hunt').flatMap((r) => M.sceneSets.sceneSets(compiled(r.id), r, book, tables)));
    ok('A2', [...ground].some((s) => !town.has(s)) && town.size < M.atlasSets.ATLAS_SETS.length, 'the Common loads every hunting ground\'s sheet: ' + [...town].join(', '));
  });
  /* V  FLOOR VARIETY (src/world/core/ground-variety.js, tools/world-art/variety.mjs; Tyler 2026-11-16: "you can see the tile repeat").
     The picker never cycles along a row; every varied floor draws its variants, the plain tile only where the pick lands on it;
     a variant meets the plain floor on its plain sides pixel for pixel; details never touch; the same cell picks the same tile. */
  fam('V', () => {
    const GV = M.gv, MIN = 64;
    /* the shortest p with seq[i] === seq[i + p] all along (the whole length when none) */
    const period = (seq) => { for (let p = 1; p < seq.length; p++) { let i = 0; while (i + p < seq.length && seq[i] === seq[i + p]) i++; if (i + p >= seq.length) return p; } return seq.length; };
    let worst = Infinity, where = '';
    for (const seed of [1, 2, 11, 25]) for (let y = -4; y < 60; y++) {
      const p = period(Array.from({ length: 192 }, (_, x) => GV.subAt(x, y, seed)));
      if (p < worst) { worst = p; where = 'seed ' + seed + ', row ' + y; }
    }
    ok('V1', worst >= MIN, 'the floor picker repeats every ' + worst + ' cells along a row (' + where + '): a cycle under ' + MIN + ' shows the tile repeat');
    /* V2 the town and V3 each painted ground: of the cells a variety covers, few draw its plain tile, and no long run of them cycles */
    const vars = Object.entries(book.terrains).filter(([, t]) => t.kind === 'variety');
    const rectKey = (t) => t.set + ':' + t.sx + ':' + t.sy;
    const share = (id, fam2, tiles, isVaried, plain) => {
      const rowsOf = new Map();
      let n = 0, flat = 0;
      for (const t of tiles) {
        if (!isVaried(t)) continue;
        n++; if (plain.has(rectKey(t))) flat++;
        if (!rowsOf.has(t.y)) rowsOf.set(t.y, []);
        rowsOf.get(t.y).push(t);
      }
      /* the plain tile is one pick in about four (j 0 of the 4 plain-or-shifted picks); 40% leaves 3 sd over 60 cells */
      ok(fam2, n > 0 && flat / n <= 0.4, id + ': ' + flat + ' of ' + n + ' varied floor cells draw the plain tile (the rest must be its variants: at most 40% plain)');
      let short = null;
      for (const list of rowsOf.values()) {
        list.sort((a, b) => a.x - b.x);
        for (let i = 0, j = 0; i < list.length; i = j) {
          for (j = i + 1; j < list.length && list[j].x === list[j - 1].x + T; j++);
          if (j - i < 24) continue;
          const p = period(list.slice(i, j).map(rectKey));
          if (p < 12 && !short) short = 'row ' + list[i].y / T + ' x ' + list[i].x / T + '..' + list[j - 1].x / T + ' repeats every ' + p;
        }
      }
      ok(fam2, !short, id + ': ' + short + ' (a floor run that cycles shows its tile repeat)');
    };
    const town = compiled('town_common');
    const townTiles = M.compose.groundTiles(town, book, tables, T).tiles;
    /* the town: an all-one-material dual tile of a material with a variety (those tiles are the variety's, the plain one is the pair's interior) */
    const townVars = vars.filter(([, v]) => v.key);
    const plainTown = new Set(townVars.map(([, v]) => { const o = book.terrains[v.of]; const [sx, sy] = o.tiles[v.key][0]; return o.set + ':' + sx + ':' + sy; }));
    const townRects = new Set(townVars.flatMap(([, v]) => v.tiles['1111'].map(([sx, sy]) => v.set + ':' + sx + ':' + sy)));
    share('town_common', 'V2', townTiles, (t) => townRects.has(rectKey(t)) || plainTown.has(rectKey(t)), plainTown);
    ok('V2', townVars.length >= 2, 'the town\'s grass and dirt have no variety (' + townVars.length + ')');
    for (const row of M.maps.WORLD_MAPS) {
      const own = vars.filter(([, v]) => v.at && v.of === row.ground);
      if (!own.length) continue;
      const m = compiled(row.id), terr = book.terrains[m.groundTerrain], [cols] = terr.cycle;
      const bases = own.map(([, v]) => terr.tiles['1111'][v.at[1] * cols + v.at[0]]);
      const plain = new Set(bases.map(([sx, sy]) => terr.set + ':' + sx + ':' + sy));
      const isBase = (x, y) => { const [sx, sy] = terr.tiles['1111'][y * cols + x]; return plain.has(terr.set + ':' + sx + ':' + sy); };
      share(row.id, 'V3', M.compose.groundTiles(m, book, tables, T).tiles, (t) => t.set !== undefined && isBase(t.x / T, t.y / T), plain);
    }
    /* V4 a variant's side whose two corners are plain is the floor's own edge, pixel for pixel (no seam against the plain floor,
       a transition or a painted wall): read off the shipped sheets */
    for (const [id, v] of vars) {
      const o = book.terrains[v.of];
      const base = v.at ? o.tiles['1111'][v.at[1] * o.cycle[0] + v.at[0]] : (o.tiles[v.key] || [])[0];
      if (!base) { ok('V4', false, id + ': names no base tile of ' + v.of); continue; }
      const img = atlasImage(v.set), baseImg = atlasImage(o.set);
      const px = (im, x, y) => { const i = (y * im.width + x) * 4; return im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2]; };
      let seams = 0;
      v.tiles['1111'].forEach(([sx, sy], i) => {
        const key = Math.floor(i / GV.VARIETY.sub), nw = key >> 3 & 1, ne = key >> 2 & 1, sw = key >> 1 & 1, se = key & 1;
        const sides = [[!nw && !ne, (k) => [k, 0]], [!sw && !se, (k) => [k, T - 1]], [!nw && !sw, (k) => [0, k]], [!ne && !se, (k) => [T - 1, k]]];
        for (const [plainSide, at] of sides) if (plainSide) for (let k = 0; k < T; k++) { const [x, y] = at(k); if (px(img, sx + x, sy + y) !== px(baseImg, base[0] + x, base[1] + y)) { seams++; break; } }
      });
      ok('V4', seams === 0 && v.tiles['1111'].length === GV.VARIETY_COUNT, id + ': ' + seams + ' plain sides differ from ' + v.of + '\'s own edge (' + v.tiles['1111'].length + ' variants)');
    }
    /* V5 details: about one cell in ten, never beside another in a row or a column */
    let det = 0, touch = 0;
    const isDet = (x, y) => GV.subAt(x, y, 7) >= GV.VARIETY.micro;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (isDet(x, y)) { det++; if (isDet(x + 1, y) || isDet(x, y + 1)) touch++; }
    ok('V5', det >= 40000 / 14 && det <= 40000 / 7 && touch === 0, 'details on ' + det + ' of 40000 cells (want 1 in 7 to 14), ' + touch + ' beside another');
    /* V6 the same cell picks the same tile on every load (and on the server's replayed world): no clock, no Math.random */
    const again = M.compose.groundTiles(compiled('town_common'), M.bookm.createBook(M.manifests), tables, T).tiles;
    ok('V6', again.length === townTiles.length && again.every((t, i) => rectKey(t) === rectKey(townTiles[i]) && t.x === townTiles[i].x && t.y === townTiles[i].y), 'the town\'s ground differs between two loads');
  });
  /* E  A NATURAL EDGE DRAWN RAGGED (src/world/core/ground-rough.js; Tyler 2026-11-16: "the ground transitions look like shit").
     On a planted ground (a grass field cut by a two-wide road, a wide yard with one stray grass cell, a row of ponds along the
     yard's edge, a meadow): the rule redraws only cells on a grass|earth edge, as the other material; never narrows the
     two-wide road; never touches a cell beside a third material (the ponds); leaves no pinhole (the stray cell); is the same on
     every call and does nothing without a rule; and the town keeps its rule. */
  fam('E', () => {
    const rowsP = ['............==............', '............==............', '............==............', '............==............',
      '............==............', '............==............', '............==............', '............==............',
      '==========================', '==========================', '=====.====================', '==========================',
      '==========================', '=~=~=~=~=~=~=~=~=~=~=~=~==', '..........................', '..........................',
      '..........................', '..........................', '..........................'];
    const Wp = rowsP[0].length, Hp = rowsP.length, idOf = new Map([['grass', 0], ['earth', 1], ['water', 2]]);
    const code = { '.': 0, '=': 1, '~': 2 };
    const mat = Int16Array.from(rowsP.join('').split('').map((c) => code[c]));
    const rule = { seed: 23, pairs: [['grass', 'earth']], spill: 0.5, bite: 0.5, scale: 2.6, deep: 4 };
    const out = M.rough.roughEdges(mat, Wp, Hp, idOf, rule);
    const at = (a, x, y) => (x < 0 || y < 0 || x >= Wp || y >= Hp ? -1 : a[y * Wp + x]);
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let changed = 0, offEdge = 0, narrowed = 0, nearThird = 0, pinholes = 0;
    for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
      const a = at(mat, x, y), b = at(out, x, y);
      if (a !== b) {
        changed++;
        if (!n4.some(([dx, dy]) => at(mat, x + dx, y + dy) === b) || a === 2) offEdge++;
        if (y < 8 && (x === 12 || x === 13)) narrowed++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(mat, x + dx, y + dy) === 2) nearThird++;
      }
      if (b !== 2 && n4.every(([dx, dy]) => { const m = at(out, x + dx, y + dy); return m >= 0 && m !== b && m !== 2; })) pinholes++;
    }
    ok('E1', changed > 4 && offEdge === 0, 'the rough rule must redraw some edge cells and only cells on a grass|earth edge (' + changed + ' changed, ' + offEdge + ' off an edge)');
    ok('E2', narrowed === 0, 'the rough rule narrowed a two-wide road (' + narrowed + ' of its cells drawn as grass)');
    ok('E3', nearThird === 0, 'the rough rule redrew a cell beside a third material (the pond): ' + nearThird);
    ok('E4', pinholes === 0, 'the rough rule left ' + pinholes + ' pinhole cells (a lone square in the other material)');
    const again = M.rough.roughEdges(mat, Wp, Hp, idOf, rule);
    ok('E5', again.every((v, i) => v === out[i]) && M.rough.roughEdges(mat, Wp, Hp, idOf, null).every((v, i) => v === mat[i]), 'the rough rule is not the same on every call, or draws without a rule');
    const town = compiled('town_common');
    ok('E6', !!(town.blend && town.blend.rough), 'the town\'s blend lost its rough rule (its edges are ruled straight again)');
  });
  return fails;
}

/* src/data and src/core whole: the scene sheets (src/world/scene-sets.js) read the grounds, effects and rooms, and those their own imports */
const COPY = ['src/world', 'src/data', 'src/core', 'src/render/images.js', 'src/build-info.js', 'src/render/player-text.js', 'src/render/creature-sprite.js', 'assets/world'];
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
  ['C7', 'the leaning camera lets the hero walk under the window', 'src/world/core/camera.js', [['inset, mid(o.keep), margin, rule), o.sinceMs);', 'inset, null, margin, rule), o.sinceMs);']]],
  ['C9', 'the hunt room clamps only the uncovered World again: the black band (N10)', 'src/world/core/camera.js', [['    if (art[1] - art[0] >= v) c = Math.min(art[1] - u - b, Math.max(art[0] + a, c));', '    if (false) c = 0;']]],
  ['C9', 'the void outranks the hero: its ring under a panel at the art\'s edge', 'src/world/core/camera.js', [['    return hold(c) - a;', '    return c - a;']]],
  ['C9', 'a hunt hero held one tile in: the foe beside it under the panel', 'src/world/core/camera.js', [['export const HUNT_KEEP_TILES = 1.5;', 'export const HUNT_KEEP_TILES = 1;']]],
  ['C10', 'the town frames no showpiece: a new hero never sees the Hearth\'s top', 'src/world/core/camera.js', [['{ show: showAt(map, o.keep, vh - inset.top - inset.bottom) }', '{ show: null }']]],
  ['C10', 'the showpiece eases its wish, not the move the hero allows: the camera outruns the walk', 'src/world/core/camera.js', [['  if (k != null) aim = hold(Math.min(', '  if (false) aim = hold(Math.min(']]],
  ['C10', 'the showpiece shoves the hero to the World\'s side to fit the Hearth\'s width', 'src/world/core/camera.js', [['const SHOW_REACH_X = 0.25;', 'const SHOW_REACH_X = 0.5;']]],
  ['C10', 'a phone frames the Hearth too: the hero shoved to a corner for a sliver of it', 'src/world/core/camera.js', [['const SHOW_MIN_SHARE = 0.5;', 'const SHOW_MIN_SHARE = 0;']]],
  ['C10', 'the showpiece box taken from the frame\'s top, not the art\'s', 'src/world/core/map-compile.js', [['y: foot - s.height, w: s.frame[0], h: s.height', 'y: foot - s.anchor[1], w: s.frame[0], h: s.height']]],
  ['L1', 'the lint lets a showpiece name nothing placed', 'src/world/core/map-compile.js', [["    if (!(row.objects || []).some((o) => o.id === s.id && o.x === s.x && o.y === s.y)) bad('L-SHOW'", "    if (false) bad('L-SHOW'"]]],
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
  ['W2', 'an ambient row\'s whole-px seat across its tile ignored', 'src/world/core/compose.js', [['const px = Math.round((a.x + 0.5) * T + (a.dx || 0)), py', 'const px = Math.round((a.x + 0.5) * T), py']]],
  ['W2', 'the chest on the ledge stands with no shadow', 'src/world/core/compose.js', [["if (e.blend === 'over' && s.shadow && s.shadow.kind === 'ellipse') e.shade", "if (false) e.shade"]]],
  ['W2', 'the compiled map drops an ambient row\'s dx', 'src/world/core/map-compile.js', [['lift: a.lift || 0, dx: a.dx || 0 })', 'lift: a.lift || 0 })']]],
  ['W2', 'a ground with no art lays nothing', 'src/world/core/compose.js', [['tones.push({ m: map.ground[y * map.w + x]', 'void ({ m: map.ground[y * map.w + x]']]],
  ['W2', 'the blend drawn on the cell grid, not the dual grid', 'src/world/core/compose.js', [['x: x * T + H, y: y * T + H', 'x: x * T, y: y * T']]],
  ['W2', 'the blend laid over the patches', 'src/world/core/compose.js', [['    if (map.blend) yield* blendSteps(map, book, T, (x, y) => !!patchAt(x, y), tiles);\n    tiles.push(...laid);', '    tiles.push(...laid);\n    if (map.blend) yield* blendSteps(map, book, T, (x, y) => !!patchAt(x, y), tiles);']]],
  ['W4', 'a scene\'s ground made in one task again (no slice budget)', 'src/world/core/compose.js', [['    if (now() - t0 >= budgetMs) return undefined;\n', '']]],
  ['W4', 'the rough edges made in one step of a sliced ground again (nightly 44730692384)', 'src/world/core/compose.js', [['yield* roughEdgeSteps(authored, W, Hm, idOf, map.blend.rough)', 'drain(roughEdgeSteps(authored, W, Hm, idOf, map.blend.rough))']]],
  ['W4', 'a slice that skips the rest of the ground','src/world/core/compose.js', [['        if (r) done(finish(r.value)); else o.later(slice);', '        if (r) done(finish(r.value)); else done(finish({ tiles: [], voids: [], tones: [] }));']]],
  ['W5', 'a scene\'s sheets made in one task again', 'src/world/scene-sets.js', [['export function sceneSetsSliced(map, row, book, tables, o) {\n', 'export function sceneSetsSliced(map, row, book, tables, o) {\n  return Promise.resolve(sceneSets(map, row, book, tables));\n']]],
  ['W5', 'a map\'s chunk bins made in one task again', 'src/world/render/ground-chunks.js', [['    prepare(m, art, sl) { return sl ? binsSliced(m, art, sl) : binsFor(m, art); },', '    prepare(m, art, sl) { return binsFor(m, art); },']]],
  ['W5', 'a chunk baked past its deadline (one long task)', 'src/world/render/ground-chunks.js', [['    const spent = () => timed && ++n % CHECK_EVERY === 0 && now() >= until;', '    const spent = () => false;']]],
  ['W5', 'a resumed chunk skips the tile it stopped at', 'src/world/render/ground-chunks.js', [['    for (const t = own.tiles; j.i < t.length; j.i += 5) {\n      if (spent()) return false;', '    for (const t = own.tiles; j.i < t.length; j.i += 5) {\n      if (spent()) { j.i += 5; return false; }']]],
  ['W6', 'a frame places every object of the map again', 'src/world/core/compose.js', [['    if (!near(b[4 * i], b[4 * i + 1], b[4 * i + 2], b[4 * i + 3])) continue;\n', '']]],
  ['W6', 'the cull drops art that reaches into the view from its west edge', 'src/world/core/compose.js', [['if (!near(b[4 * i], b[4 * i + 1], b[4 * i + 2], b[4 * i + 3])) continue;', 'if (!near(b[4 * i], b[4 * i + 1], 0, b[4 * i + 3])) continue;']]],
  ['W5', 'a pane let go leaves its canvases to the collector', 'src/world/render/canvas-backend.js', [['if (c) { c.width = 0; c.height = 0; }', 'if (c) { }']]],
  ['W5', 'a chunk let go keeps its pixels', 'src/world/render/ground-chunks.js', [['  function release(c) { c.width = 0; c.height = 0; }', '  function release(c) { }']]],
  ['W5', 'a new map drawn before its view\'s ground is baked', 'src/world/render/canvas-backend.js', [['      if ((!hold && !ground.stale()) || !map || !canvas) return true;', '      return true;']]],
  ['W5', 'a held frame resizes (so blanks) the shown canvas again (report #81)', 'src/world/render/canvas-backend.js', [['    dirty = false;\n  }\n', '    sizeTo(canvas, W, H);\n    dirty = false;\n  }\n']]],
  ['W7', 'a late sheet holds the town frame for good again (report #81)', 'src/world/view-sheets.js', [['return miss.some((set) => t - asked.get(set) < SHEET_HOLD_MS);', 'return miss.length > 0;']]],
  ['W7', 'the first view waits on a late sheet for good', 'src/world/view-sheets.js', [['await Promise.race([sheets.ensure(missing(now.cast)), new Promise((done) => win.setTimeout(done, SHEET_HOLD_MS))]);', 'await sheets.ensure(missing(now.cast));']]],
  ['W7', 'a pane with no loop is never woken at the limit', 'src/world/view-sheets.js', [['      win.setTimeout(wakeUp, SHEET_HOLD_MS);\n', '']]],
  ['W7', 'a stalled sheet request is never let go', 'src/render/images.js', [['      }, LOAD_WAIT_MS) : 0;', '      }, Infinity) : 0;']]],
  ['W7', 'a stalled sheet request fails at once instead of asking again', 'src/render/images.js', [['if (n < LOAD_TRIES) attempt(n + 1); else fail(', 'if (false) attempt(n + 1); else fail(']]],
  ['W5', 'a painted frame never gives the shown canvas its new size','src/world/render/canvas-backend.js', [['    sizeTo(canvas, W, H);   // the size measure() read', '    // the size measure() read']]],
  ['W2', 'a hole corner (cliff) leaves its dual tile undrawn', 'src/world/core/compose.js', [['for (let i = 0; i < 4; i++) if (c[i] < 0) c[i] = most;', 'if (c.some((m) => m < 0)) continue;']]],
  ['W2', 'a third material drawn as the upper of the pair', 'src/world/core/compose.js', [['(m !== lo && !pairM[m * K + lo] && pairM[m * K + up])', '(m !== lo)']]],
  ['L1', 'every window of a map is let off the tree rule', 'src/world/core/map-compile.js', [['if (2 * greenIn(wx, wy) < ww * wh) continue;', 'continue;']]],
  ['W3', 'a fill floor hashed into seams', 'src/world/core/compose.js', [['const n = fill ? (y % fill[1]) * fill[0] + (x % fill[0]) : cellHash(x, y);', 'const n = cellHash(x, y);']]],
  ['G6', 'a training session reads as a fight the World is missing (audit F25)', 'src/world/idle-banner.js', [['  if (train) {', '  if (false) {']]],
  ['G7', 'the World\'s line sits under the action bar again (its foot ignores the shell\'s inset)', 'src/world/idle-banner.js', [['  return Math.round(Math.max(0, b) + BANNER_GAP);', '  return Math.round(BANNER_GAP);']]],
  ['V1', 'the floor pick a fixed cycle again', 'src/world/core/ground-variety.js', [['export function subAt(x, y, seed) {\n', 'export function subAt(x, y, seed) {\n  return ((x % 4) + 4) % 4;\n']]],
  ['V2', 'the town grass and dirt drawn from one tile again', 'src/world/core/compose.js', [['const v = c[0] === c[1] && c[0] === c[2] && c[0] === c[3] ? VAR[c[0]] : null;', 'const v = null;']]],
  ['V3', 'a painted ground repeated tile drawn as painted', 'src/world/core/compose.js', [['const k = vkind ? vkind[y * map.w + x] : -1;', 'const k = -1;']]],
  ['V4', 'a variety laid over another floor (its edges seam)', 'assets/world/atlas-common.json', [['"key": "0000"', '"key": "1111"']]],
  ['V5', 'details laid side by side', 'src/world/core/ground-variety.js', [['if (rolls(x, y, seed) && !rolls(x - 1, y, seed) && !rolls(x, y - 1, seed))', 'if (rolls(x, y, seed))']]],
  ['E1', 'the rough rule redraws nothing', 'src/world/core/ground-rough.js', [['if (a === lo ? n > pSpill : n < pBite) out[y * W + x] = b;', 'void n;']]],
  ['E2', 'the rough rule narrows a two-wide road', 'src/world/core/ground-rough.js', [['for (let k = 1; k < deep; k++)', 'for (let k = 1; k < 1; k++)']]],
  ['E3', 'the rough rule redraws beside a third material', 'src/world/core/ground-rough.js', [['if (m !== lo && m !== up) { ok = false; break; }', 'void m;']]],
  ['E4', 'the rough rule leaves pinholes', 'src/world/core/ground-rough.js', [['if (DIRS.every(([dx, dy]) => was(x + dx, y + dy) === b)) out[y * W + x] = b;', 'void b;']]],
  ['E5', 'the rough rule rolls a new edge every call', 'src/world/core/ground-rough.js', [['const n = edgeNoise(x, y, scale, seed);', 'const n = Math.random();']]],
  ['E6', 'the town\'s blend drops its rough rule', 'src/world/core/map-compile.js', [['row.blend.rough ? { rough: row.blend.rough } : {}', '{}']]],
  ['V6', 'a pick that changes every load', 'src/world/core/ground-variety.js', [['export function vhash(x, y, seed) {\n', 'export function vhash(x, y, seed) {\n  if (y > 40) return (Math.random() * 4294967296) >>> 0;\n']]],
  ['G1', 'an unmapped monster falls into the cellar', 'src/world/core/scene-route.js', [['if (id && index[id]) return', "if (id) return { map: 'mill_cellar', kind: 'hunt' }; if (id && index[id]) return"]]],
  ['G5', 'a keyed hall left off its map (Krell\'s Hall showed the town)', 'src/data/grounds/krells_hold/map.js', [["hunts: Object.freeze(['krells_hold', 'krells_hold_hall'])", "hunts: Object.freeze(['krells_hold'])"]]],
  ['G5', 'a called room left off its map', 'src/data/world/maps/coppercap_warrens.js', [["hunts: Object.freeze(['coppercap_warrens', 'coppercap_warrens_called'])", "hunts: Object.freeze(['coppercap_warrens'])"]]],
  ['G5', 'the Tower fought on the Sewer\'s grid under the flue\'s art again', 'src/data/hunt-grounds.js', [["map: 'burning_tower', tower: true", "map: 'millrace_sewer', tower: true"]]],
  ['G5', 'a Tower seat in the flue\'s brick', 'src/data/hunt-grounds.js', [['start: Object.freeze([[30, 21], [29, 21]', 'start: Object.freeze([[30, 21], [22, 21]']]],
  ['G2', 'a missing sprite resolves to nothing', 'src/world/core/book.js', [['const sprite = (id) => sprites[id] || STUB_SPRITE;', 'const sprite = (id) => sprites[id];']]],
  ['A1', 'the scene sheets forget the heroes', 'src/world/scene-sets.js', [['  const ids = new Set(SCENE_OUTFITS);', '  const ids = new Set();']]],
  ['A3', 'every scene loads the faction looks again', 'src/world/scene-sets.js', [['  const ids = new Set(SCENE_OUTFITS);', '  const ids = new Set(Object.values(OUTFITS));']]],
  ['A3', 'the first open reads the faction looks\' manifest again', 'src/world/atlas.js', [["import { FIRST_OPEN_SETS } from '../data/world/atlas-sets.js", "import { ATLAS_SETS as FIRST_OPEN_SETS } from '../data/world/atlas-sets.js"]]],
  ['A3', 'the Hunts window reads the faction looks\' manifest again', 'src/render/creature-sprite.js', [["import { FIRST_OPEN_SETS } from '../data/world/atlas-sets.js", "import { ATLAS_SETS as FIRST_OPEN_SETS } from '../data/world/atlas-sets.js"]]],
  ['A1', 'the scene sheets forget the hunt effects', 'src/world/scene-sets.js', [['    for (const id of effectIds()) ids.add(id);\n', '']]],
  ['A1', 'the scene sheets forget the home\'s furniture', 'src/world/scene-sets.js', [['  const layout = ROOM_LAYOUTS[row.id];', '  const layout = null;']]],  ['A2', 'every scene loads every sheet', 'src/world/scene-sets.js', [['  return fetchOrder(sets, groundTiles, book);', '  for (const id of Object.keys(book.sprites)) note(book.frame(id).set);\n  return fetchOrder(sets, groundTiles, book);']]],
  ['G4', 'the bleed badge floors at 11 px again', 'src/world/render/canvas-backend.js', [['const px = Math.max(Math.round(4.5 * zs), Math.round(12 * dpr));', 'const px = Math.max(Math.round(4.5 * zs), Math.round(11 * dpr));']]],
  ['G3', 'sprites drawn over the roofs', 'src/world/render/canvas-backend.js', [
    ['    for (const d of list.sprites) {\n      if (d.kind === \'unit\' && d.grey) blitUnit(g, d, view);\n      else { g.globalAlpha = d.alpha == null ? 1 : d.alpha; blit(g, d, view); }\n    }\n', ''],
    ['    g.globalAlpha = 1;\n    light(g, list, view, fv);', '    for (const d of list.sprites) blit(g, d, view);\n    g.globalAlpha = 1;\n    light(g, list, view, fv);']]],
  ['N', 'the title is dropped from the plate', 'src/world/core/plates.js', [['const lines = p.title ? [p.text, p.title] : [p.text];', 'const lines = [p.text];']]],
  ['N', 'a two-line plate is placed as one line', 'src/world/core/plates.js', [['const tall = lines.length * px + (lines.length - 1) * PLATE_GAP;', 'const tall = px;']]],
  ['N', 'the title lies on the head art, under the anchor', 'src/world/core/plates.js', [['y: y - (lines.length - 1 - i) * (px + PLATE_GAP)', 'y: y + i * (px + PLATE_GAP)']]],
  ['N', 'a crowded plate never steps up', 'src/world/core/plates.js', [['for (let k = 0; k < (p.yields ? YIELD_STEPS : PLATE_STEPS) && touches(y); k++) y -= px + PLATE_GAP;', 'void touches;']]],
  ['N', 'a yielding plate towers like a hero\'s', 'src/world/core/plates.js', [['(p.yields ? YIELD_STEPS : PLATE_STEPS)', 'PLATE_STEPS']]],
  ['N', 'a yielding plate that is not clear draws over the crowd', 'src/world/core/plates.js', [['    if (p.yields && touches(y)) continue;\n', '']]],
  ['N', 'compose drops a unit\'s title', 'src/world/core/compose.js', [["title: u.plate.title || null, kind: u.plate.kind,", 'kind: u.plate.kind,']]],
  ['N', 'compose drops your own title', 'src/world/core/compose.js', [["title: state.title || null, kind: 'self'", "kind: 'self'"]]],
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
  console.log('world-core: green — y-sort, roofs, shadows, camera, floor variety, ragged edges, map lint (' + M.maps.WORLD_MAPS.length + ' maps over ' + Object.keys(M.manifests).length + ' atlases), path, Wang, routing, stubs, layer order, art by scene');
}
