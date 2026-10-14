#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-core.mjs — THE WORLD RENDERER'S RULES, ON THE REAL MODULES
//
//   node tests/world-core.mjs             the guard
//   node tests/world-core.mjs --selftest  every planted defect must be caught
//   node tests/world-core.mjs --hashes    print each map's mask hash (authoring aid)
//
// The pure half of the World pane (src/world/core/*, the stub atlas, the map
// rows) decides every pixel's order and position; the canvas only executes the
// list. So the rules are asserted here, in node, on the same compose step the
// canvas uses (src/world/render/null-backend.js):
//   Z  y-sort: a unit north of a wall slice is behind it, south is in front,
//      beside it (same row) is in front; a tree trunk likewise, by feet row
//   R  roofs: only the LOCAL hero's building lifts; a peer inside lifts
//      nothing; that building's south wall and door drop to a stub; 150 ms fade
//   S  shadows: ellipse w = 0.8 x footprint x T, h = 0.35 w, +2,+2; cast
//      shadows sweep the footprint by height; one mask; a flier's stays down
//   C  zoom table and one-device-pixel camera steps
//   L  map lint over every shipped map, and over planted bad rows
//   P  8-way A* never cuts a corner
//   W  the dual-grid Wang overlays reproduce every map tile exactly
//   G  scene routing; stub frames sit inside the art budget; the canvas
//      draws the layers in the plan's order
//
// --selftest copies the module closure to a temp dir, plants one defect per
// rule family into the copy (never the tree), and requires the named family
// to go red — after a clean control on an unmutated copy.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*(\d+)/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const argv = process.argv.slice(2);

async function load(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + V);
  const [grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, stub, maps, terrain, hunts] = await Promise.all([
    'src/world/core/grid.js', 'src/world/core/zsort.js', 'src/world/core/roofs.js', 'src/world/core/shadows.js',
    'src/world/core/camera.js', 'src/world/core/map-compile.js', 'src/world/core/path.js', 'src/world/core/wang.js',
    'src/world/core/scene-route.js', 'src/world/core/compose.js', 'src/world/render/null-backend.js',
    'src/world/stub-atlas.js', 'src/data/world/maps/index.js', 'src/data/world/terrain.js', 'src/data/hunts.js',
  ].map(imp));
  return { grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, stub, maps, terrain, hunts,
    canvasSrc: readFileSync(join(base, 'src/world/render/canvas-backend.js'), 'utf8'),
    worldCss: readFileSync(join(ROOT, 'src/styles/world.css'), 'utf8') };
}

/** Every check, against one loaded module set. Returns [{ id, msg }] failures. */
function check(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push({ id, msg }); };
  const T = M.grid.T;
  const tables = { terrain: M.terrain.TERRAIN, props: M.terrain.PROPS };
  const rows = Object.fromEntries(M.maps.WORLD_MAPS.map((m) => [m.id, m]));
  const compiled = (id) => M.mapc.compileMap(rows[id], tables);
  const frame = (id, hero, extra = {}, view) => {
    const b = M.nullb.createNullBackend(view ? { view } : {});
    b.mount(); b.setMap(compiled(id)); b.sync(Object.assign({ hero, name: 'Hero' }, extra));
    return b.snapshot().last;
  };
  const at = (list, pred) => list.findIndex(pred);
  const heroIdx = (f) => at(f.sprites, (s) => s.kind === 'unit');
  const sliceIdx = (f, x, y) => at(f.sprites, (s) => (s.kind === 'wall' || s.kind === 'door') && s.tx === x && s.row === y);
  const trunkIdx = (f, x, y) => at(f.sprites, (s) => s.kind === 'trunk' && s.tx === x && s.row === y);

  // ── Z · y-sort ──────────────────────────────────────────────────────────
  {
    const north = frame('home_cottage', { x: 6, y: 6 });
    ok('Z1', sliceIdx(north, 6, 7) >= 0 && heroIdx(north) < sliceIdx(north, 6, 7), 'a hero just north of the south wall must draw BEHIND that wall slice');
    const south = frame('home_cottage', { x: 7, y: 8 });
    ok('Z1', heroIdx(south) > sliceIdx(south, 6, 7) && heroIdx(south) > sliceIdx(south, 7, 7), 'a hero south of the wall and its door must draw IN FRONT of them');
    const beside = frame('home_cottage', { x: 5, y: 5 });
    ok('Z1', heroIdx(beside) > sliceIdx(beside, 4, 5), 'a hero beside a side-wall slice on the same row must draw in front of it');
    const n = frame('town_common', { x: 8, y: 8 }), s = frame('town_common', { x: 8, y: 10 });
    ok('Z2', heroIdx(n) < trunkIdx(n, 8, 9), 'a hero north of a trunk must draw behind it');
    ok('Z2', heroIdx(s) > trunkIdx(s, 8, 9), 'a hero south of a trunk must draw in front of it');
    const mid1 = frame('town_common', { x: 8, y: 8.5 }), mid2 = frame('town_common', { x: 8, y: 9.5 });
    ok('Z2', heroIdx(mid1) < trunkIdx(mid1, 8, 9) && heroIdx(mid2) > trunkIdx(mid2, 8, 9), 'a moving hero is keyed by its INTERPOLATED row');
    const items = [{ row: 2, bias: 1, x: 5 }, { row: 2, bias: 1, x: 5 }, { row: 1, bias: 2, x: 0 }, { row: 2, bias: 0, x: 9 }];
    const a = M.zsort.ySort(items).map((d) => d.seq).join(), b = M.zsort.ySort(items).map((d) => d.seq).join();
    ok('Z3', a === b && a === '2,3,0,1', 'ySort must be total and stable (got ' + a + ')');
    for (const id of Object.keys(rows)) {
      const f = frame(id, { x: rows[id].start[0], y: rows[id].start[1] });
      ok('Z3', f.sprites.every((d, i) => !i || M.zsort.compareDraw(f.sprites[i - 1], d) <= 0), id + ': the draw list is not in y-sort order');
    }
  }

  // ── R · roofs ───────────────────────────────────────────────────────────
  {
    const roofOf = (f, id) => f.roofs.find((r) => r.id === id);
    const out = frame('town_common', { x: 14, y: 11 });
    ok('R1', out.heroBuilding === null && roofOf(out, 'mill').alpha === 1 && roofOf(out, 'inn').alpha === 1, 'outside, both roofs must be drawn');
    const inMill = frame('town_common', { x: 4, y: 3 });
    ok('R1', inMill.heroBuilding === 'mill' && roofOf(inMill, 'mill').alpha === 0 && roofOf(inMill, 'inn').alpha === 1, 'inside the mill, only the mill roof lifts');
    const peer = frame('town_common', { x: 14, y: 11 }, { peers: [{ x: 4, y: 3 }, { x: 22, y: 3 }] });
    ok('R2', roofOf(peer, 'mill').alpha === 1 && roofOf(peer, 'inn').alpha === 1, 'a PEER inside a building must never lift its roof');
    const inside = frame('home_cottage', { x: 7, y: 5 });
    const south = inside.sprites.filter((d) => (d.kind === 'wall' || d.kind === 'door') && d.row === 7);
    const northWall = inside.sprites.filter((d) => d.kind === 'wall' && d.row === 2);
    ok('R3', south.length === 8 && south.every((d) => d.h === M.roofs.SOUTH_STUB_PX), 'inside, the cottage south wall and door must drop to the ' + M.roofs.SOUTH_STUB_PX + ' px stub');
    ok('R3', northWall.length && northWall.every((d) => d.h === M.compose.WALL_PX), 'inside, the north wall stays full height');
    const wide = frame('town_common', { x: 4, y: 3 }, {}, { w: 40 * T, h: 30 * T });
    const innSouth = wide.sprites.filter((d) => (d.kind === 'wall' || d.kind === 'door') && d.row === 5 && d.tx >= 20);
    ok('R3', innSouth.length === 6 && innSouth.every((d) => d.h === M.compose.WALL_PX), 'the inn\'s south wall must stay full while you are in the mill (' + innSouth.length + ' slices seen)');
    const st = M.roofs.stepAlpha;
    ok('R4', st(1, 0, 75) === 0.5 && st(1, 0, 150) === 0 && st(1, 0, 900) === 0 && st(0, 1, 75) === 0.5 && M.roofs.ROOF_FADE_MS === 150, 'the roof fade is 150 ms linear and clamps');
  }

  // ── S · shadows ─────────────────────────────────────────────────────────
  {
    const e = M.shadows.ellipseShadow(100, 50, 1, T), e2 = M.shadows.ellipseShadow(0, 0, 2, T);
    ok('S1', Math.abs(e.w - 0.8 * T) < 1e-9 && Math.abs(e.h - 0.35 * e.w) < 1e-9 && e.cx === 102 && e.cy === 52 && Math.abs(e2.w - 1.6 * T) < 1e-9,
      'the ground ellipse must be w = 0.8 x footprint x T, h = 0.35 w, offset +2,+2 (got ' + JSON.stringify(e) + ')');
    const c1 = M.shadows.castShadow(0, 32, 0, 32, 48), c2 = M.shadows.castShadow(0, 32, 0, 32, 96);
    const far = (c) => c[3];
    ok('S2', far(c1)[0] - 32 > 0 && far(c1)[1] - 32 > 0 && far(c2)[0] - 32 === 2 * (far(c1)[0] - 32) && far(c2)[1] - 32 === 2 * (far(c1)[1] - 32),
      'a cast shadow must fall down-right and lengthen in proportion to height');
    const day = frame('town_common', { x: 14, y: 11 }), cellar = frame('mill_cellar', { x: 5, y: 3 });
    ok('S2', day.shadows.some((s) => s.type === 'poly') && !cellar.shadows.some((s) => s.type === 'poly'), 'cast shadows by day only');
    const plain = M.stub.stubGeometry;
    const lifted = (id, cls) => Object.assign({}, plain(id, cls), id === 'hero' ? { hover: 10 } : {});
    const b = M.nullb.createNullBackend({ geometry: lifted });
    b.mount(); b.setMap(compiled('town_common')); b.sync({ hero: { x: 14, y: 11 } });
    const f = b.snapshot().last, g = frame('town_common', { x: 14, y: 11 });
    const hs = (fr) => fr.shadows.filter((s) => s.type === 'ellipse').map((s) => s.cy).sort().join();
    ok('S3', f.sprites[heroIdx(f)].y === g.sprites[heroIdx(g)].y - 10 && hs(f) === hs(g), 'a flier is drawn hover px up while its shadow stays on the ground');
    ok('S4', /tone\('shadow'\)[\s\S]*?drawImage\(shade\.c/.test(M.canvasSrc) && (M.canvasSrc.match(/drawImage\(shade\.c/g) || []).length === 1,
      'every shadow must go into ONE mask composited once (canvas-backend.js)');
  }

  // ── C · camera ──────────────────────────────────────────────────────────
  {
    const table = [[1080, 1, 3], [900, 1, 3], [423, 3, 4], [423, 1, 2], [768, 1, 2], [2160, 1, 7], [0, 1, 2]];
    for (const [h, d, z] of table) ok('C1', M.camera.zoomFor(h, d) === z, 'zoomFor(' + h + ', ' + d + ') is ' + M.camera.zoomFor(h, d) + ', want ' + z);
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
    ok('C5', M.camera.fpsFor(true) === 30 && M.camera.fpsFor(false) === 60, '30 fps on the phone query, 60 elsewhere');
    ok('C5', M.camera.MOBILE_QUERY === '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)' && M.worldCss.includes('@media ' + M.camera.MOBILE_QUERY),
      'the 30 fps query must be the canonical mobile query world.css uses');
  }

  // ── L · map lint ────────────────────────────────────────────────────────
  {
    const ids = M.maps.WORLD_MAPS.map((m) => m.id);
    ok('L0', new Set(ids).size === ids.length, 'two maps share an id');
    for (const m of M.maps.WORLD_MAPS) for (const p of M.mapc.lintMap(m, tables)) ok('L0', false, p.code + ' ' + p.msg);
    for (const [kind, id] of Object.entries(M.maps.SCENE_MAPS)) ok('L0', rows[id] && rows[id].kind === kind, 'SCENE_MAPS.' + kind + ' is not a ' + kind + ' map');
    for (const m of M.maps.WORLD_MAPS) for (const h of m.hunts) ok('L0', !!M.hunts.HUNT_INDEX[h], m.id + ' renders unknown hunt ' + h);
    for (const id of Object.keys(M.maps.SCENE_MAPS).map((k) => M.maps.SCENE_MAPS[k]).concat(['mill_cellar'])) ok('L0', !!rows[id], 'map ' + id + ' is missing');
    const plant = (id, edit) => { const r = JSON.parse(JSON.stringify(rows[id])); edit(r); return M.mapc.lintMap(r, tables).map((p) => p.code); };
    const want = [
      ['a fractional object', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[0].x = 2.5; }],
      ['an object offset (ox)', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[0].ox = 4; }],
      ['an open patrol path', 'L-PATH', 'mill_cellar', (r) => { r.path = [[5, 3], [18, 3], [18, 10], [6, 10]]; }],
      ['a path across rock', 'L-PATH', 'mill_cellar', (r) => { r.path = [[5, 3], [18, 3], [18, 7], [5, 7]]; }],
      ['a door on a corner', 'L-DOOR', 'home_cottage', (r) => { r.buildings[0].doors = [[11, 7]]; }],
      ['a door off the edge', 'L-DOOR', 'home_cottage', (r) => { r.buildings[0].doors = [[7, 5]]; }],
      ['a roof that is not the footprint', 'L-ROOF', 'home_cottage', (r) => { r.buildings[0].roof.rect = [4, 2, 8, 5]; }],
      ['a stale mask hash', 'L-HASH', 'mill_cellar', (r) => { r.rows[3] = '##.#..................##'; }],
      ['furniture north of a south wall', 'L-NORTH', 'home_cottage', (r) => { r.objects[4].y = 6; r.objects[5].x = 5; }],
      ['an outdoor map with a treeless window', 'L-TREES', 'town_common', (r) => { r.objects = r.objects.filter((o) => o.id !== 'pine' || o.x !== 19); }],
    ];
    for (const [what, code, id, edit] of want) ok('L1', plant(id, edit).includes(code), 'the lint did not reject ' + what + ' with ' + code);
  }

  // ── P · path ────────────────────────────────────────────────────────────
  {
    const fp = M.path.findPath;
    const m3 = Uint8Array.from([0, 1, 0, 1, 0, 0, 0, 0, 0]);
    ok('P1', fp(m3, 3, 3, [0, 0], [1, 1]) === null, 'a diagonal squeezed between two walls must be refused');
    const m4 = Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]);
    const p4 = fp(m4, 3, 3, [0, 0], [1, 1]);
    ok('P1', p4 && p4.length === 3, 'with one orthogonal wall the path must go around the corner, got ' + JSON.stringify(p4));
    const p5 = fp(new Uint8Array(25), 5, 5, [0, 0], [4, 4]);
    ok('P2', p5 && p5.length === 5 && JSON.stringify(p5) === JSON.stringify(fp(new Uint8Array(25), 5, 5, [0, 0], [4, 4])), 'an open diagonal is 5 steps and deterministic');
    const town = compiled('town_common');
    for (const [name, s] of Object.entries(town.stations)) ok('P3', !!fp(town.mask, town.w, town.h, town.start, s), 'no walk from the town start to the ' + name + ' station');
    const cel = compiled('mill_cellar');
    ok('P3', !!fp(cel.mask, cel.w, cel.h, cel.path[0], cel.path[Math.floor(cel.path.length / 2)]), 'no walk across the cellar loop');
  }

  // ── W · Wang ────────────────────────────────────────────────────────────
  {
    ok('W1', M.wang.cornerIndex(1, 0, 0, 0) === 8 && M.wang.cornerIndex(0, 1, 0, 0) === 4 && M.wang.cornerIndex(0, 0, 1, 0) === 2 && M.wang.cornerIndex(0, 0, 0, 1) === 1,
      'the Wang bit order is NW 8, NE 4, SW 2, SE 1');
    for (const id of Object.keys(rows)) {
      const c = compiled(id);
      const L = M.wang.wangLayers(c.ground, c.w, c.h, tables.terrain);
      const idx = new Map(L.map((t) => [t.vx + ',' + t.vy + ',' + t.id, t.idx]));
      const has = (vx, vy, t, bit) => ((idx.get(vx + ',' + vy + ',' + t) || 0) & bit) !== 0;
      let bad = 0;
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        const t = c.ground[y * c.w + x];
        if (!(has(x, y, t, 1) && has(x + 1, y, t, 2) && has(x, y + 1, t, 4) && has(x + 1, y + 1, t, 8))) bad++;
      }
      ok('W2', bad === 0, id + ': ' + bad + ' tiles are not reproduced by the dual-grid overlays');
      const layers = L.map((t) => (tables.terrain[t.id] || {}).layer || 0);
      ok('W2', layers.every((v, i) => !i || layers[i - 1] <= v), id + ': overlays must be drawn lowest layer first');
    }
  }

  // ── G · routing, budget, layer order ────────────────────────────────────
  {
    const idx = M.route.huntMapIndex(M.maps.WORLD_MAPS, M.hunts.HUNT_INDEX);
    const S = (a, c) => M.route.sceneFor(a, c, idx, M.maps.SCENE_MAPS);
    ok('G1', S({ kind: 'combat', id: 'mill_cellar' }, 'home').map === 'mill_cellar' && S({ kind: 'combat', id: 'rat' }, 'town').map === 'mill_cellar',
      'a mill_cellar hunt or a rat training fight must show the cellar');
    ok('G1', S({ kind: 'combat', id: 'goblin' }, 'home').map === 'home_cottage' && S(null, 'town').map === 'town_common' && S({ kind: 'gather', id: 'rat' }, 'home').kind === 'home' && S(null, 'garbage').map === 'town_common',
      'anything else shows the viewer\'s choice of town or home');
    const g = (id, cls) => M.stub.stubGeometry(id, cls);
    const body = (id, cls) => g(id, cls).box[3];
    const budget = [['hero', 'hero', 36, 40], ['rat', 'vermin', 12, 20], ['door:timber', null, 48, 48], ['chest', null, 1, 20], ['barrel', null, 24, 28],
      ['chair', null, 24, 28], ['table', null, 20, 24], ['bush', null, 1, 28], ['mushrooms', null, 1, 12]];
    for (const [id, cls, lo, hi] of budget) ok('G2', body(id, cls) >= lo && body(id, cls) <= hi, 'the ' + id + ' stub is ' + body(id, cls) + ' px, outside the budget ' + lo + '-' + hi);
    ok('G2', g('hero', 'hero').w === 64 && g('hero', 'hero').h === 64, 'a character frame is 64x64');
    ok('G2', g('wall:stone:n').h === M.compose.WALL_PX && M.compose.WALL_PX - M.compose.WALL_FACE_PX >= 8 && M.compose.WALL_PX - M.compose.WALL_FACE_PX <= 12, 'a wall slice is a 48 px face plus an 8-12 px cap');
    const tree = g('pine:canopy', 'canopy');
    ok('G2', tree.ay >= 96 && tree.ay <= 128 && tree.w >= 64 && tree.w <= 96, 'a tree is 96-128 px tall with a 64-96 px crown');
    const order = ['list.decals', "tone('shadow')", 'list.sprites', 'list.canopies', 'list.roofs', 'light(g, list', 'ctx.drawImage(comp.c', 'plates(list'];
    const draw = M.canvasSrc.slice(M.canvasSrc.indexOf('function draw('));
    const pos = order.map((k) => draw.indexOf(k));
    ok('G3', pos.every((p, i) => p > 0 && (!i || pos[i - 1] < p)), 'canvas-backend draw() must paint ground, decals, shadows, sprites, canopies, roofs, light, blit, plates in that order (' + pos.join(',') + ')');
  }
  return fails;
}

const COPY = ['src/world', 'src/data/world', 'src/data/hunts.js', 'src/build-info.js'];
function copyTree() {
  const dir = mkdtempSync(join(tmpdir(), 'world-core-'));
  for (const p of COPY) { mkdirSync(dirname(join(dir, p)), { recursive: true }); cpSync(join(ROOT, p), join(dir, p), { recursive: true }); }
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
  ['Z1', 'units sort before walls on the same row', 'src/world/core/zsort.js', [['unit: 2', 'unit: -1']]],
  ['Z2', 'units keyed by the tile they are leaving', 'src/world/core/compose.js', [['row: hero.y, bias', 'row: Math.floor(hero.y) - 1, bias']]],
  ['R2', 'the roof follows a peer inside', 'src/world/core/compose.js', [['const heroId = heroBuilding(map.buildings, hero);', 'const heroId = heroBuilding(map.buildings, (state.peers || [])[0] || hero);']]],
  ['R3', 'the stub cuts every south wall, not just yours', 'src/world/core/roofs.js', [['return (heroId && slice.building === heroId &&', 'return (heroId && slice.building &&']]],
  ['R4', 'the fade runs at 300 ms', 'src/world/core/roofs.js', [['ROOF_FADE_MS = 150', 'ROOF_FADE_MS = 300']]],
  ['S1', 'a squat shadow ellipse', 'src/world/core/shadows.js', [['h: 0.35 * w', 'h: 0.5 * w']]],
  ['S2', 'a cast shadow that ignores height', 'src/world/core/shadows.js', [['const dx = heightPx * SHADOW_SKEW.x', 'const dx = 32 * SHADOW_SKEW.x']]],
  ['S3', 'a flier\'s shadow lifted with it', 'src/world/core/compose.js', [['ellipseShadow(cx, cy, 1, T)));\n  }', 'ellipseShadow(cx, cy - lift, 1, T)));\n  }']]],
  ['S4', 'a second shadow composite', 'src/world/render/canvas-backend.js', [['    g.drawImage(shade.c, 0, 0);\n', '    g.drawImage(shade.c, 0, 0);\n    g.drawImage(shade.c, 0, 0);\n']]],
  ['C1', 'zoom with a floor of 1', 'src/world/core/camera.js', [['Math.max(2, Math.round(', 'Math.max(1, Math.round(']]],
  ['C2', 'the camera rounded to art pixels', 'src/world/core/camera.js', [['const cx = Math.round(cam.x * z), cy', 'const cx = Math.round(cam.x) * z, cy']]],
  ['L1', 'the lint accepts offsets', 'src/world/core/map-compile.js', [["k !== 'id' && k !== 'x' && k !== 'y'", "k !== 'id' && k !== 'x' && k !== 'y' && k !== 'ox'"]]],
  ['L0', 'a map row edited without its hash', 'src/data/world/maps/mill_cellar.js', [["    '##....................##',\n    '##..,,", "    '##.........#..........##',\n    '##..,,"]]],
  ['P1', 'diagonals cut corners', 'src/world/core/path.js', [['if (dx && dy) return walkable', 'if (false) return walkable']]],
  ['W2', 'the Wang bits swapped', 'src/world/core/wang.js', [['(ne ? 4 : 0) | (sw ? 2 : 0)', '(ne ? 2 : 0) | (sw ? 4 : 0)']]],
  ['G1', 'an unmapped monster falls into the cellar', 'src/world/core/scene-route.js', [['if (id && index[id]) return', "if (id) return { map: 'mill_cellar', kind: 'hunt' }; if (id && index[id]) return"]]],
  ['G2', 'a 50 px hero stub', 'src/world/stub-atlas.js', [['hero: box(64, 64, 32, 60, 22, 22, 20, 38,', 'hero: box(64, 64, 32, 60, 22, 10, 20, 50,']]],
  ['G3', 'sprites drawn over the roofs', 'src/world/render/canvas-backend.js', [
    ['    for (const d of list.sprites) blit(g, d, view, d.cls);\n', ''],
    ['    g.globalAlpha = 1;\n    light(g, list, view, fv);', '    for (const d of list.sprites) blit(g, d, view, d.cls);\n    g.globalAlpha = 1;\n    light(g, list, view, fv);']]],
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
      if (f.some((x) => x.id === id)) console.log('  ✓ ' + id + ' caught: ' + why);
      else { console.log('  ✗ ' + id + ' NOT CAUGHT: ' + why + (f.length ? ' (red elsewhere: ' + [...new Set(f.map((x) => x.id))].join(',') + ')' : '')); bad++; }
    } catch (e) {
      console.log('  ✗ ' + id + ' could not be planted: ' + e.message); bad++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (bad) { console.error('world-core --selftest FAILED — ' + bad + ' unproven'); process.exit(1); }
  console.log('world-core --selftest PASSED — clean control green, ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught by their own family.');
}

if (argv.includes('--selftest')) await selftest();
else if (argv.includes('--hashes')) {
  const M = await load(ROOT);
  for (const m of M.maps.WORLD_MAPS) console.log(m.id.padEnd(16), M.mapc.compileMap(m, { terrain: M.terrain.TERRAIN, props: M.terrain.PROPS }).maskHash, m.maskHash ? '(row says ' + m.maskHash + ')' : '');
} else {
  const fails = check(await load(ROOT));
  if (fails.length) {
    for (const f of fails) console.error('  ✗ ' + f.id + '  ' + f.msg);
    console.error('world-core: ' + fails.length + ' failure(s)');
    process.exit(1);
  }
  console.log('world-core: green — y-sort, roofs, shadows, camera, map lint (' + (await load(ROOT)).maps.WORLD_MAPS.length + ' maps), path, Wang, routing, budget, layer order');
}
