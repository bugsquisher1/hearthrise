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
//   C  zoom table and one-device-pixel camera steps
//   L  map lint over every shipped map, and over planted bad rows (whole
//      tiles, doors, roofs, reachability of walked maps, the wall kit)
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
const V = '?v=' + (/cache:\s*(\d+)/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const argv = process.argv.slice(2);

async function load(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + V);
  const [grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, sets] = await Promise.all([
    'src/world/core/grid.js', 'src/world/core/zsort.js', 'src/world/core/roofs.js', 'src/world/core/shadows.js',
    'src/world/core/camera.js', 'src/world/core/map-compile.js', 'src/world/core/path.js', 'src/world/core/wang.js',
    'src/world/core/scene-route.js', 'src/world/core/compose.js', 'src/world/render/null-backend.js',
    'src/world/core/book.js', 'src/data/world/maps/index.js', 'src/data/world/terrain.js', 'src/data/hunts.js',
    'src/data/world/atlas-sets.js',
  ].map(imp));
  const manifests = {};
  for (const set of sets.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return { grid, zsort, roofs, shadows, camera, mapc, path, wang, route, compose, nullb, bookm, maps, terrain, hunts, manifests,
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
  const compiled = (id) => M.mapc.compileMap(rows[id], tables);
  const frame = (id, hero, extra = {}, view) => {
    const b = M.nullb.createNullBackend({ book, tables, view });
    b.mount(); b.setMap(compiled(id)); b.sync(Object.assign({ hero, name: 'Hero', t: 0 }, extra));
    return b.snapshot().last;
  };
  const wide = { w: 60 * T, h: 40 * T };
  const at = (list, pred) => list.findIndex(pred);
  const heroIdx = (f) => at(f.sprites, (s) => s.id === 'hero');
  const firstAt = (f, pred) => at(f.sprites, pred);

  fam('Z', () => {
    const millFace = (d) => d.kind === 'wall' && d.ty === 4 && d.tx >= 13 && d.tx <= 18;
    const north = frame('town_common', { x: 12, y: 3 }, {}, wide);
    ok('Z1', firstAt(north, millFace) >= 0 && heroIdx(north) < firstAt(north, millFace), 'a hero north of the mill\'s front row must draw BEHIND its wall slices');
    const beside = frame('town_common', { x: 12, y: 4 }, {}, wide);
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
    const out = frame('town_common', { x: 11, y: 9 }, {}, wide);
    ok('R1', out.heroBuilding === null && roofOf(out, 'smithy').alpha === 1 && roofOf(out, 'mill').alpha === 1 && slices(out, 'smithy') > 0 && slices(out, 'mill') > 0,
      'outside, both roofs must be drawn');
    const inSmithy = frame('town_common', { x: 3, y: 3 }, {}, wide);
    ok('R1', inSmithy.heroBuilding === 'smithy' && slices(inSmithy, 'smithy') === 0 && slices(inSmithy, 'mill') > 0, 'inside the smithy, only the smithy roof lifts');
    const peer = frame('town_common', { x: 11, y: 9 }, { peers: [{ x: 3, y: 3 }, { x: 15, y: 2 }] }, wide);
    ok('R2', slices(peer, 'smithy') > 0 && slices(peer, 'mill') > 0 && peer.heroBuilding === null, 'a PEER inside a building must never lift its roof');
    const inside = frame('home_cottage', { x: 6, y: 7 }, {}, wide);
    const southRow = inside.sprites.filter((d) => d.ty === 10 && d.tx > 2 && d.tx < 13 && (d.kind === 'stub' || d.kind === 'wall' || d.kind === 'door'));
    ok('R3', southRow.length === 9 && southRow.every((d) => d.id === 'plank_stub') && !southRow.some((d) => d.tx === 8),
      'inside, the cottage\'s south wall is plank_stub with the doorway open (' + southRow.map((d) => d.id + '@' + d.tx).join(' ') + ')');
    ok('R3', inside.sprites.filter((d) => d.ty === 1 && d.id === 'plank_wall').length === 10, 'inside, the cottage\'s north wall is its full face');
    const front = inside.sprites.filter((d) => d.ty === 5 && d.tx >= 16 && d.tx <= 20 && d.kind === 'wall').map((d) => d.id);
    ok('R3', front.length === 5 && front.includes('timber_wall_door') && front.includes('timber_wall_window'), 'the neighbour shows its front face while you are in your cottage (' + front.join(' ') + ')');
    const st = M.roofs.stepAlpha;
    ok('R4', st(1, 0, 75) === 0.5 && st(1, 0, 150) === 0 && st(1, 0, 900) === 0 && st(0, 1, 75) === 0.5 && M.roofs.ROOF_FADE_MS === 150, 'the roof fade is 150 ms linear and clamps');
  });

  fam('S', () => {
    const e = M.shadows.ellipseShadow({ w: 24, h: 8, dx: 5, dy: 6 }, 100, 50);
    ok('S1', e.cx === 103 && e.cy === 55 && e.w === 24 && e.h === 8, 'the ellipse sits on the contact point as the stills place it (got ' + JSON.stringify(e) + ')');
    const f = frame('mill_cellar', { x: 10, y: 7 });
    const hero = f.sprites[heroIdx(f)];
    const hs = book.sprite('hero');
    ok('S1', f.shadows.some((s) => s.type === 'ellipse' && s.w === hs.shadow.w && s.cx === hero.x + hs.anchor[0] + hs.shadow.dx - 2), 'the hero\'s shadow must be its manifest ellipse at its contact point');
    const [x0, y0] = M.shadows.castPoint(50, 100, 100), [x1, y1] = M.shadows.castPoint(50, 90, 100), [x2, y2] = M.shadows.castPoint(50, 80, 100);
    ok('S2', x0 === 50 && y0 === 100 && x1 > 50 && y1 > 100 && Math.abs((x2 - 50) - 2 * (x1 - 50)) < 1e-9 && Math.abs((y2 - 100) - 2 * (y1 - 100)) < 1e-9,
      'a cast shadow keeps its foot and falls down-right in proportion to height');
    const [a, b, c, d, ee, ff] = M.shadows.castMatrix(100);
    ok('S2', Math.abs(a * 50 + c * 80 + ee - x2) < 1e-9 && Math.abs(b * 50 + d * 80 + ff - y2) < 1e-9, 'castMatrix must be castPoint as a canvas transform');
    ok('S2', f.shadows.some((s) => s.type === 'cast'), 'the cellar\'s wall faces and brazier must cast');
    ok('S3', (M.canvasSrc.match(/drawImage\(shade\.c/g) || []).length === 1 && /source-in/.test(M.canvasSrc), 'every shadow must go into ONE mask, flattened to one tone, composited once');
    const torch = f.sprites.concat(f.raised).find((dd) => dd.id === 'wall_torch' && dd.tx === 6);
    const ts = book.sprite('wall_torch');
    ok('S4', torch && torch.y === 2 * T + T - 1 - ts.anchor[1] - ts.hover, 'a hung sprite is drawn its hover above the floor line');
  });

  fam('C', () => {
    const table = [[1080, 1, 3], [900, 1, 3], [423, 3, 4], [423, 1, 2], [768, 1, 2], [2160, 1, 7], [0, 1, 2]];
    for (const [h, dd, z] of table) ok('C1', M.camera.zoomFor(h, dd) === z, 'zoomFor(' + h + ', ' + dd + ') is ' + M.camera.zoomFor(h, dd) + ', want ' + z);
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
  });

  fam('L', () => {
    const ids = M.maps.WORLD_MAPS.map((m) => m.id);
    ok('L0', new Set(ids).size === ids.length, 'two maps share an id');
    for (const m of M.maps.WORLD_MAPS) for (const p of M.mapc.lintMap(m, tables)) ok('L0', false, p.code + ' ' + p.msg);
    for (const [kind, id] of Object.entries(M.maps.SCENE_MAPS)) ok('L0', rows[id] && rows[id].kind === kind, 'SCENE_MAPS.' + kind + ' is not a ' + kind + ' map');
    for (const m of M.maps.WORLD_MAPS) for (const h of m.hunts) ok('L0', !!M.hunts.HUNT_INDEX[h], m.id + ' renders unknown hunt ' + h);
    const plant = (id, edit) => { const r = JSON.parse(JSON.stringify(rows[id])); edit(r); return M.mapc.lintMap(r, tables).map((p) => p.code); };
    const want = [
      ['a fractional object', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[1].x = 4.5; }],
      ['an object offset (ox)', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[1].ox = 4; }],
      ['a sprite no atlas carries', 'L-WHOLE', 'mill_cellar', (r) => { r.objects[1].id = 'no_such_sprite'; }],
      ['an open patrol path', 'L-PATH', 'mill_cellar', (r) => { r.path = [[6, 5], [20, 5], [20, 10], [7, 10]]; }],
      ['a path across rock', 'L-PATH', 'mill_cellar', (r) => { r.path = [[6, 5], [20, 5], [20, 13], [6, 13]]; }],
      ['a door on a corner', 'L-DOOR', 'home_cottage', (r) => { r.buildings[0].doors = [[13, 10]]; }],
      ['a door off the edge', 'L-DOOR', 'home_cottage', (r) => { r.buildings[0].doors = [[8, 5]]; }],
      ['a roof that is not the footprint', 'L-ROOF', 'home_cottage', (r) => { r.buildings[0].roof.rect = [2, 1, 12, 9]; }],
      ['a stale mask hash', 'L-HASH', 'mill_cellar', (r) => { r.rows[10] = '###...#................#'; }],
      ['furniture north of a south wall', 'L-NORTH', 'home_cottage', (r) => { r.objects.find((o) => o.id === 'table').y = 9; }],
      ['an outdoor map with a treeless window', 'L-TREES', 'town_common', (r) => { r.objects = r.objects.filter((o) => o.id !== 'oak'); }],
      ['a barrel on rock', 'L-SPACE', 'mill_cellar', (r) => { r.objects.push({ id: 'barrel', x: 1, y: 7 }); }],
      ['a walled-off strip of a walked map', 'L-REACH', 'home_cottage', (r) => { r.objects.push({ id: 'bush', x: 1, y: 11 }); }],
      ['an enterable building with no inside wall kit', 'L-KIT', 'town_common', (r) => { delete r.buildings[0].closed; }],
      ['a focus off the map', 'L-WHOLE', 'town_common', (r) => { r.focus = [40, 7]; }],
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
      const open = m.ground.filter((mat) => !tables.materials[mat].solid).length;
      ok('W2', g.tiles.filter((t) => t.set).length >= open && g.voids.length === m.ground.length - open, id + ': the ground must cover every open tile with art and every rock tile with void');
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
    ok('W3', (book.terrains[compiled('mill_cellar').groundTerrain] || {}).kind === 'fill', 'the Mill Cellar floor must be the flat cellar_earth fill (the flagstone Wang patch reads as a raised slab)');
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
    const lost = M.bookm.createBook({ hero: M.manifests.hero });
    const stubTables = Object.assign({}, tables, { sprites: new Proxy(lost.sprites, { get: (t, k) => t[k] || M.bookm.STUB_SPRITE }) });
    let drawn = null;
    try {
      const b = M.nullb.createNullBackend({ book: lost, tables: stubTables });
      b.mount(); b.setMap(M.mapc.compileMap(rows.mill_cellar, stubTables)); b.sync({ hero: { x: 10, y: 7 }, t: 0 });
      drawn = b.snapshot().last;
    } catch (e) { drawn = null; }
    ok('G2', drawn && drawn.sprites.some((d) => d.set === '') && drawn.sprites.some((d) => d.set === 'hero'), 'with an atlas missing, the scene must still compose (stubs for its sprites, real art for the rest)');
    const order = ['list.decals', 'shadows(g, list', 'list.sprites', 'list.raised', 'light(g, list', 'ctx.drawImage(comp.c', 'overlay(list'];
    const draw = M.canvasSrc.slice(M.canvasSrc.indexOf('function draw('));
    const pos = order.map((k) => draw.indexOf(k));
    ok('G3', pos.every((p, i) => p > 0 && (!i || pos[i - 1] < p)), 'canvas-backend draw() must paint ground, decals, shadows, sprites, raised, light, blit, screen overlay in that order (' + pos.join(',') + ')');
  });
  return fails;
}

const COPY = ['src/world', 'src/data/world', 'src/data/hunts.js', 'src/build-info.js', 'assets/world'];
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
  ['C1', 'zoom with a floor of 1', 'src/world/core/camera.js', [['Math.max(2, Math.round(', 'Math.max(1, Math.round(']]],
  ['C2', 'the camera rounded to art pixels', 'src/world/core/camera.js', [['const cx = Math.round(cam.x * z), cy', 'const cx = Math.round(cam.x) * z, cy']]],
  ['L1', 'the lint accepts offsets', 'src/world/core/map-compile.js', [["k !== 'id' && k !== 'x' && k !== 'y'", "k !== 'id' && k !== 'x' && k !== 'y' && k !== 'ox'"]]],
  ['L0', 'a map row edited without its hash', 'src/data/world/maps/mill_cellar.js', [["    '###....................#',\n", "    '###.......#............#',\n"]]],
  ['P1', 'diagonals cut corners', 'src/world/core/path.js', [['if (dx && dy) return walkable', 'if (false) return walkable']]],
  ['W1', 'a lone tile stops melting', 'src/world/core/wang.js', [['up >= 3 ? 1 : 0', 'up >= 1 ? 1 : 0']]],
  ['W3', 'a fill floor hashed into seams', 'src/world/core/compose.js', [['const n = fill ? (y % fill[1]) * fill[0] + (x % fill[0]) : x * 7 + y * 13;', 'const n = x * 7 + y * 13;']]],
  ['G1', 'an unmapped monster falls into the cellar', 'src/world/core/scene-route.js', [['if (id && index[id]) return', "if (id) return { map: 'mill_cellar', kind: 'hunt' }; if (id && index[id]) return"]]],
  ['G2', 'a missing sprite resolves to nothing', 'src/world/core/book.js', [['const sprite = (id) => sprites[id] || STUB_SPRITE;', 'const sprite = (id) => sprites[id];']]],
  ['G3', 'sprites drawn over the roofs', 'src/world/render/canvas-backend.js', [
    ['    for (const d of list.sprites) { g.globalAlpha = d.alpha == null ? 1 : d.alpha; blit(g, d, view); }\n', ''],
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
