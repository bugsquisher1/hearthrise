// ════════════════════════════════════════════════════════════════════════
// src/world/core/compose.js — ONE FRAME, AS A DRAW LIST.
//
// Both backends draw exactly this list, in this order, so the node tests read
// the same decisions the canvas paints (the rules are the W2 sign-off stills'):
//   ground   groundTiles(): Wang tiles from the vertex grid, building floors,
//            void under rock — static per map, so the backend bakes it once
//   decals   flat art (rugs, spills, the hatch)
//   shadows  ONE mask: manifest ellipses and cast silhouettes (shadows.js)
//   sprites  everything that stands, y-sorted by its contact row (zsort.js):
//            the map's objects, the state's props (a home's furniture) and units
//   raised   what sits at wall height: rock tops, capstones, roofs, chimneys
//   lights   the map's light kind plus point lights
//   plates   screen-resolution text anchors (names), bubbles (the crier's
//            line over its speaker) and the walk mark (where a tap sent you)
//
// PLACEMENT (art-budget.js MANIFEST): a frame is drawn at
//   (tx*T + floor(fw*T/2) - anchor.x,  ty*T + fh*T - 1 - anchor.y)
// so its contact row lands on the footprint's south pixel row, which is also
// its sort key. A `hanging` sprite is drawn `hover` px higher (it is mounted on
// a wall); a wallcap is raised by the wall height. Wall slices cycle their
// frames by column (frame x mod 4) so a 128 px pattern never seams.
//
// BUILDINGS: the one the hero stands in is drawn from INSIDE (north face, side
// capstones, end pieces, a south stub with the doorway open); every other shows
// its FRONT (south) face with windows and door under its roof. The roof fades
// by `state.roofAlpha` (roofs.js) over whichever variant is showing.
//
// T is the map's art grid (map-compile.js `map.T`). The offsets a walked map
// reaches (the walk mark, a bubble's lift, a float's rise) are base art px times
// k = T / 32, so they sit where they sit on the base grid. The wall, roof, rock
// and cellar-lamp constants are the base grid's: a map on another grid draws
// none of them (map-compile.js L-GRID).
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { ySort } from './zsort.js?v=0.2.75';
import { heroBuilding } from './roofs.js?v=0.2.75';
import { ellipseShadow, castMatrix } from './shadows.js?v=0.2.75';
import { vertexGrid, tileKey } from './wang.js?v=0.2.75';
import { OUTFITS } from '../../data/hunt-outfits.js?v=0.2.75';

/** Wall height: rock tops and capstones are raised by it. */
export const WALL_FACE_PX = 48;
const CAP_DX = 10, CAP_H_LIFT = 68;
const HERO_LIGHT_TILES = 4.5;
/* A corpse sorts beneath everything standing (VW-03): its row is lowered by this many art px. */
const UNDER = 1 << 20;
/* One slice of a ground made off the frame path (groundOfSliced): well under a phone frame at 4x CPU. */
const GROUND_SLICE_MS = 6;

/* A Wang tile's variant per cell: an integer hash, so a tile listed in several variants (the sandbox's
   grass in its four flips) breaks its repeat instead of striping the map. */
function cellHash(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A BLENDED TOWN GROUND (map.blend, a town whose ground art lands as wang16 PAIRS, not one terrain).
 * The pairs are PixelLab tilesets, drawn the way PixelLab paints a map: on the DUAL grid, each tile
 * half a cell off the map's cells with its four corners on four cell centres, so a cell's material
 * fills the cell and every edge between two materials is a transition. Per dual tile: its corner
 * materials (alias applied); a corner with no pair at all (cliff, a placeholder site) or under a
 * patch takes its neighbours' material, so finished art runs up to the placeholder and under the
 * patch's edge; two materials draw their pair's tile; otherwise the pair covering the most corners
 * draws, each other corner as the member it has a pair with (the lower when both or neither: a
 * flagstone corner at a grass/road junction reads as grass). What no pair can draw stays a tone.
 */
export function blendTiles(map, book, T, inPatch, out) { drain(blendSteps(map, book, T, inPatch, out)); }

/* blendTiles, one dual row per step (groundSteps). */
function* blendSteps(map, book, T, inPatch, out) {
  const { pairs, alias } = map.blend;
  const terr = pairs.map((id) => ({ id, t: book.terrains[id] })).filter((p) => p.t && p.t.kind === 'wang16');
  /* THE MATERIALS AS SMALL INTEGERS (index into `known`, -1 none): a 192x116 town is 22k dual tiles, so the
     loop below compares numbers and reads a pair table, never building a string per tile (perf-budget) */
  const known = Array.from(new Set(terr.flatMap((p) => [p.t.lower, p.t.upper])));
  const idOf = new Map(known.map((m, i) => [m, i]));
  const K = known.length;
  const pairM = new Uint8Array(K * K);
  for (const p of terr) { const a = idOf.get(p.t.lower), b = idOf.get(p.t.upper); pairM[a * K + b] = pairM[b * K + a] = 1; }
  const LO = terr.map((p) => idOf.get(p.t.lower)), UP = terr.map((p) => idOf.get(p.t.upper));
  const KEYS = Array.from({ length: 16 }, (_, b) => b.toString(2).padStart(4, '0'));   // corner bits NW NE SW SE → the tile key
  /* each cell's material once (alias applied, -1 under a patch or with no pair), then four reads per dual tile */
  const W = map.w, Hm = map.h, mat = new Int16Array(W * Hm);
  for (let cy = 0; cy < Hm; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (inPatch(cx, cy)) { mat[cy * W + cx] = -1; continue; }
      const m = map.ground[cy * W + cx], a = alias[m] || m, i = idOf.get(a);
      mat[cy * W + cx] = i === undefined ? -1 : i;
    }
  }
  const matOf = (x, y) => mat[Math.min(Hm - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const H = T >> 1;
  const c = new Int16Array(4);
  const count = (m) => (c[0] === m) + (c[1] === m) + (c[2] === m) + (c[3] === m);
  for (let y = -1; y < Hm; y++) {
    for (let x = -1; x < W; x++) {
      c[0] = matOf(x, y); c[1] = matOf(x + 1, y); c[2] = matOf(x, y + 1); c[3] = matOf(x + 1, y + 1);
      /* a hole corner takes the commonest real corner (the first on a tie) */
      let most = -1, mostN = 0;
      for (let i = 0; i < 4; i++) {
        const m = c[i];
        if (m < 0) continue;
        const n = count(m);
        if (n > mostN) { most = m; mostN = n; }
      }
      if (most < 0) continue;
      for (let i = 0; i < 4; i++) if (c[i] < 0) c[i] = most;
      let pick = -1, best = -1;
      for (let p = 0; p < terr.length; p++) {
        const lo = LO[p], up = UP[p];
        const n = (c[0] === lo || c[0] === up) + (c[1] === lo || c[1] === up) + (c[2] === lo || c[2] === up) + (c[3] === lo || c[3] === up);
        if (n > best) { best = n; pick = p; }
      }
      if (pick < 0) continue;
      const lo = LO[pick], up = UP[pick];
      let bits = 0;
      for (let i = 0; i < 4; i++) { const m = c[i]; bits = (bits << 1) | (m === up || (m !== lo && !pairM[m * K + lo] && pairM[m * K + up]) ? 1 : 0); }
      const t = book.tile(terr[pick].id, KEYS[bits], cellHash(x, y));
      if (t) out.push({ set: t.set, sx: t.sx, sy: t.sy, x: x * T + H, y: y * T + H });
    }
    yield;
  }
}

/* A step list run to its end: its return value. */
function drain(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/**
 * The static ground: [{ set, sx, sy, x, y }] tiles and [{ x, y }] void cells, art px.
 * @param {object} map compileMap() output
 * @param {object} book createBook()
 * @param {{materials: object}} tables
 */
export function groundTiles(map, book, tables, T) { return drain(groundSteps(map, book, tables, T)); }

/* groundTiles as STEPS, one map row (or dual row) each: the town's ground is 22k dual tiles, 28-48 ms on CI and
   ~90 ms on a phone's CPU in one go, so a scene being prepared makes it in slices (groundOfSliced). Same list,
   same order, whichever way it is run. */
function* groundSteps(map, book, tables, T) {
  const tiles = [], voids = [], tones = [];
  /* NO GROUND ART YET (ground: null, a town ahead of its art; map-compile.js L-KIND): every cell is a flat
     PLACEHOLDER in its material's tone, two tones checkered (--world-ground-<material>-a/-b), so the layout
     reads and nothing pretends to be finished art. Building floors and placed sprites still draw over it. */
  if (map.groundTerrain === null) {
    /* ...except its PATCHES: a district whose painted ground has landed (Hearth Square's paving), a fill laid
       in its cycle order from the patch's own corner. The art grows district by district; the tones shrink. */
    /* each cell's patch (the first listed covering it), stamped once rather than searched per cell */
    const patchGrid = new Array(map.w * map.h).fill(undefined);
    for (const p of [...(map.patches || [])].reverse()) {
      for (let y = Math.max(0, p.rect.y); y < Math.min(map.h, p.rect.y + p.rect.h); y++) {
        for (let x = Math.max(0, p.rect.x); x < Math.min(map.w, p.rect.x + p.rect.w); x++) patchGrid[y * map.w + x] = p;
      }
    }
    const patchAt = (x, y) => patchGrid[y * map.w + x];
    const laid = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const p = patchAt(x, y), pt = p && book.terrains[p.terrain];
        if (pt) {
          const [cols, rows] = pt.cycle || [1, 1];
          const t = book.tile(p.terrain, '1111', ((y - p.rect.y) % rows) * cols + ((x - p.rect.x) % cols));
          if (t) { laid.push({ set: t.set, sx: t.sx, sy: t.sy, x: x * T, y: y * T }); continue; }
        }
        tones.push({ m: map.ground[y * map.w + x], alt: (x + y) & 1, x: x * T, y: y * T });
      }
      yield;
    }
    if (map.blend) yield* blendSteps(map, book, T, (x, y) => !!patchAt(x, y), tiles);
    tiles.push(...laid);
  }
  const terr = map.groundTerrain === null ? null : book.terrains[map.groundTerrain];
  const upper = terr ? terr.upper : null;
  const fill = terr && terr.kind === 'fill' ? terr.cycle || [1, 1] : null;
  /* A PAINTED ground (a whole map stitched from PixelLab, port-pixellab.mjs) covers every cell,
     rock and water included: its walls are in the paint, so nothing is void. */
  const painted = !!(terr && terr.painted);
  const solid = (x, y) => { const m = tables.materials[map.ground[y * map.w + x]]; return !painted && !!(m && m.solid); };
  const g = map.groundTerrain === null ? null : vertexGrid((x, y) => map.ground[y * map.w + x] === upper, map.w, map.h);
  for (let y = 0; y < (map.groundTerrain === null ? 0 : map.h); y++) {
    for (let x = 0; x < map.w; x++) {
      if (solid(x, y)) { voids.push({ x: x * T, y: y * T }); continue; }
      /* A fill is one periodic field cut into a cols x rows cycle: lay it in order so it tiles seamlessly. */
      const n = fill ? (y % fill[1]) * fill[0] + (x % fill[0]) : cellHash(x, y);
      const t = book.tile(map.groundTerrain, fill ? '1111' : tileKey(g, map.w, x, y), n);
      if (t) tiles.push({ set: t.set, sx: t.sx, sy: t.sy, x: x * T, y: y * T });
    }
    yield;
  }
  for (const b of map.buildings) {
    if (b.painted) continue;
    const f = book.terrains[b.floor];
    if (!f) continue;
    const [cols, rows] = f.cycle || [1, 1];
    for (let y = b.rect.y + 1; y < b.rect.y + b.rect.h - 1; y++) {
      for (let x = b.rect.x + 1; x < b.rect.x + b.rect.w - 1; x++) {
        const t = book.tile(b.floor, '1111', (y % rows) * cols + (x % cols));
        if (t) tiles.push({ set: t.set, sx: t.sx, sy: t.sy, x: x * T, y: y * T });
      }
    }
  }
  return { tiles, voids, tones };
}

/* THE GROUND IS MADE ONCE PER (map, book), by whichever reader asks first: scene-sets.js reads the sheets it
   draws from, then the canvas backend bins it and TAKES it (its last reader), so the town's 44k tile records
   never outlive the bins. Made twice, once inside a frame, it was the page's longest frame on the way back
   from a hunt (tests/perf-budget.mjs PB-HELD). Readers never change it. */
const GROUNDS = new WeakMap();
/** groundTiles(map, book, tables, T), made once and kept until taken. */
export function groundOf(map, book, tables, T) {
  let byBook = GROUNDS.get(map);
  if (!byBook) GROUNDS.set(map, byBook = new WeakMap());
  let g = byBook.get(book);
  if (!g) byBook.set(book, g = groundTiles(map, book, tables, T));
  return g;
}
/* A ground made in slices, kept like groundOf's (a reader that made it meanwhile wins: one ground per map). */
function keep(map, book, made) {
  let byBook = GROUNDS.get(map);
  if (!byBook) GROUNDS.set(map, byBook = new WeakMap());
  const had = byBook.get(book);
  if (had) return had;
  byBook.set(book, made);
  return made;
}

/* One slice: steps until `budgetMs` is spent. The finished step's result, or undefined while steps remain. */
function runFor(it, now, budgetMs) {
  const t0 = now();
  let r = it.next();
  while (!r.done) {
    if (now() - t0 >= budgetMs) return undefined;
    r = it.next();
  }
  return r;
}

/**
 * groundOf, made in SLICES of at most ~budgetMs, each slice a task of its own (`later`), so preparing a scene never
 * holds the page for the whole ground (perf lane P2: the town's ground task was 28-48 ms on CI, 88 ms on a phone's
 * CPU). Resolves with the ground, kept for groundOf/takeGround exactly as groundOf keeps it.
 * @param {{later: (fn: () => void) => void, now: () => number, budgetMs?: number}} o
 */
export function groundOfSliced(map, book, tables, T, o) {
  const byBook = GROUNDS.get(map);
  const had = byBook && byBook.get(book);
  if (had) return Promise.resolve(had);
  return sliced(groundSteps(map, book, tables, T), o, (made) => keep(map, book, made));
}

/**
 * Any STEPS generator run in slices of at most ~budgetMs, each a task of its own (`later`): the ground here, a
 * scene's sheets (scene-sets.js) and its chunk bins (ground-chunks.js). Resolves with finish(the generator's
 * result), finish run in the last slice itself (a ground is kept the moment it is made).
 * @param {Iterator} it
 * @param {{later: (fn: () => void) => void, now: () => number, budgetMs?: number}} o
 * @param {(v: any) => any} [finish]
 */
export function sliced(it, o, finish = (v) => v) {
  const budget = o.budgetMs || GROUND_SLICE_MS;
  return new Promise((done, fail) => {
    const slice = () => {
      try {
        const r = runFor(it, o.now, budget);
        if (r) done(finish(r.value)); else o.later(slice);
      } catch (e) { fail(e); }
    };
    slice();
  });
}

/** The ground for its last reader (the renderer's bins): handed over and no longer kept. */
export function takeGround(map, book, tables, T) {
  const g = groundOf(map, book, tables, T);
  GROUNDS.get(map).delete(book);
  return g;
}

/* Where sprite `id`'s frame lands for tile (tx, ty) (PLACEMENT above): its record, source rect, drawn box and footprint
   row. One rule for a placed drawable and for the map's standing index below. */
function frameBox(book, id, tx, ty, o, T) {
  const s = book.sprite(id);
  const f = book.frame(id, o.anim, o.dir, o.i);
  let { sx, sy, w, h, ax, ay } = f;
  if (o.crop) { const [c0, c1, c2, c3] = o.crop; sx += c0; sy += c1; w = c2 - c0; h = c3 - c1; ax -= c0; ay -= c1; }
  const [fw, fh] = o.fp || s.footprint;
  const x = Math.round(tx * T + Math.floor((fw * T) / 2) - ax + (o.dx || 0));
  /* Hung art and fliers are drawn `hover` px up; a flier's shadow stays on the floor. */
  const air = s.class === 'hanging' || s.class === 'flier' ? s.hover || 0 : 0;
  const y = Math.round(ty * T + fh * T - 1 - ay - (o.lift || 0)) - air;
  return { s, set: f.set, sx, sy, w, h, ax, ay, x, y, fh, air };
}

/* THE MAP'S STANDING ART, FOUND ONCE (perf lane 2026-10-29): every frame walked all the map's cells (the town's 22,272)
   and placed all its objects (966) to keep the ~150 near its view. Kept per map for its book, materials and grid: the
   cells that raise a wall or a rock top (row order) and each object's drawn box. A frame places only what lies near its
   view, in the whole walk's order, so its list is the whole walk's (tests/world-core.mjs W6). */
const STANDING = new WeakMap();
function standingOf(map, book, tables, T) {
  const had = STANDING.get(map);
  if (had && had.book === book && had.materials === tables.materials && had.T === T && had.n === map.objects.length) return had;
  const painted = !!(book.terrains[map.groundTerrain] && book.terrains[map.groundTerrain].painted);
  const cells = [];
  for (let y = 0; !painted && y < map.h; y++) {
    for (let x = 0; x < map.w; x++) { const m = tables.materials[map.ground[y * map.w + x]]; if (m && m.solid && !m.flat) cells.push(x, y); }
  }
  const boxes = new Float64Array(map.objects.length * 4);
  map.objects.forEach((o, i) => { const b = frameBox(book, o.id, o.x, o.y, { fp: [o.fw, o.fh] }, T); boxes.set([b.x, b.y, b.w, b.h], i * 4); });
  const made = { book, materials: tables.materials, T, n: map.objects.length, cells: Int32Array.from(cells), boxes };
  STANDING.set(map, made);
  return made;
}

/**
 * @param {object} map       compileMap() output
 * @param {object} book      createBook()
 * @param {{hero: {x:number,y:number}|null, name?: string, roofAlpha?: object, t?: number,
 *          units?: object[], props?: object[], bubbles?: object[], mark?: {x:number,y:number}|null}} state
 *                           hero in tile coords (fractional while moving); t = ms clock for idle clips
 * @param {{ox:number, oy:number, w:number, h:number}} view  compose region, art px
 * @param {{materials: object}} tables
 */
export function composeFrame(map, book, state, view, tables, T) {
  const hero = state.hero;
  const k = T / 32;
  const heroId = heroBuilding(map.buildings, hero);
  const near = (x, y, w, h) => x < view.ox + view.w + 2 * T && y < view.oy + view.h + 2 * T && x + w > view.ox - 2 * T && y + h > view.oy - 2 * T;
  const decals = [], shadows = [], stand = [], raised = [];
  let seq = 0;

  function place(id, tx, ty, o = {}) {
    const { s, set, sx, sy, w, h, ax, ay, x, y, fh, air } = frameBox(book, id, tx, ty, o, T);
    const ground = s.class === 'flier' ? air : 0;
    const d = { id, set, sx, sy, w, h, x, y, row: ty * T + fh * T - 1 + (o.bias || 0), seq: seq++, alpha: o.alpha == null ? 1 : o.alpha,
      kind: o.kind || s.layer, cls: s.class, tx, ty, ref: o.ref || null };
    if (!near(x, y, w, h)) return d;
    if (s.layer === 'decal') decals.push(d);
    else if (o.raised) raised.push(d);
    else stand.push(d);
    if (o.shadow !== false && s.shadow) {
      if (s.shadow.kind === 'ellipse') shadows.push(Object.assign({ type: 'ellipse' }, ellipseShadow(s.shadow, x + ax, y + ay + ground)));
      else shadows.push({ type: 'cast', sprite: d, m: castMatrix(y + ay) });
    }
    return d;
  }

  // Rock: a face where you can stand south of it; otherwise a raised void top
  // with a capstone on every edge that meets the floor. A painted ground draws its own.
  const paintedGround = !!(book.terrains[map.groundTerrain] && book.terrains[map.groundTerrain].painted);
  const solid = (x, y) => { const m = tables.materials[map.ground[y * map.w + x]]; return !paintedGround && !!(m && m.solid); };
  const floorAt = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && !solid(x, y);
  const standing = standingOf(map, book, tables, T);
  for (let i = 0; i < standing.cells.length; i += 2) {
    const x = standing.cells[i], y = standing.cells[i + 1];
    if (!near(x * T, y * T - 2 * T, T, 3 * T)) continue;
    const kit = tables.materials[map.ground[y * map.w + x]].wall;
    if (floorAt(x, y + 1)) { place(map.faces[x + ',' + y] || kit + '_wall', x, y, { i: x % 4, bias: -0.5, kind: 'wall' }); continue; }
    raised.push({ id: 'void', set: null, x: x * T, y: y * T - WALL_FACE_PX, w: T, h: T, row: y * T + T - 1, seq: seq++, alpha: 1, kind: 'void' });
    if (floorAt(x, y - 1)) place(kit + '_cap_h', x, y, { lift: CAP_H_LIFT, raised: true, shadow: false, bias: 1 });
    if (floorAt(x + 1, y)) place(kit + '_cap', x, y, { dx: CAP_DX, lift: WALL_FACE_PX, raised: true, shadow: false, bias: 1 });
    if (floorAt(x - 1, y)) place(kit + '_cap_w', x, y, { dx: -CAP_DX, lift: WALL_FACE_PX, raised: true, shadow: false, bias: 1 });
  }

  for (const b of map.buildings) {
    /* A painted building's walls are in the ground art and it has no roof: nothing to draw. */
    if (b.painted) continue;
    const { x: x0, y: y0 } = b.rect, x1 = b.rect.x + b.rect.w - 1, y1 = b.rect.y + b.rect.h - 1;
    const doorX = (b.doors.find((d) => d.y === y1) || {}).x;
    const alpha = state.roofAlpha && b.id in state.roofAlpha ? state.roofAlpha[b.id] : (b.id === heroId ? 0 : 1);
    if (b.id === heroId) {
      for (let x = x0 + 1; x < x1; x++) place(b.wall + '_wall', x, y0, { i: x % 4, bias: -0.5, kind: 'wall' });
      for (const [x, dx] of [[x0, CAP_DX], [x1, -CAP_DX]]) {
        place(b.wall + '_cap', x, y0, { dx, lift: WALL_FACE_PX, crop: [0, 20, 12, 32], shadow: false, bias: -0.4, kind: 'wall' });
        for (let y = y0 + 1; y <= y1; y++) place(b.wall + '_cap', x, y, { dx, lift: WALL_FACE_PX, shadow: false, bias: -0.4, kind: 'wall' });
        place(b.wall + '_end', x, y1, { dx, bias: 0.2, kind: 'wall' });
      }
      for (let x = x0 + 1; x < x1; x++) if (x !== doorX) place(b.wall + '_stub', x, y1, { i: x % 4, shadow: false, kind: 'stub' });
    } else {
      for (let x = x0; x <= x1; x++) {
        const sid = x === doorX ? b.wall + '_wall_door' : b.windows.includes(x) ? b.wall + '_wall_window' : b.wall + '_wall';
        place(sid, x, y1, { i: x % 4, kind: 'wall' });
        if (x === doorX) place('door', x, y1, { bias: 0.1, shadow: false, kind: 'door' });
      }
      shadows.push({ type: 'poly', pts: [[x0 * T + 8, y1 * T + 32], [(x1 + 1) * T + 6, y1 * T + 32], [(x1 + 1) * T + 18, y1 * T + 40], [x0 * T + 20, y1 * T + 40]] });
    }
    if (alpha <= 0) continue;
    const top = y0 * T - 28 + 12, nrows = y1 - y0;
    for (let r = 0; r < nrows; r++) {
      const band = r === nrows - 1 ? 3 : nrows === 2 ? 1 : r === 0 ? 0 : r === 1 ? 1 : 2;
      for (let x = x0; x <= x1; x++) {
        const col = x === x0 ? 0 : x === x1 ? 2 : 1;
        const f = book.frame(b.roof.kind, 'slice', 's', band * 3 + col);
        raised.push({ id: b.roof.kind, set: f.set, sx: f.sx, sy: f.sy, w: f.w, h: f.h, x: x * T, y: top + r * T, row: y1 * T + 31.5, seq: seq++, alpha, kind: 'roof', building: b.id });
      }
    }
    if (b.chimney != null && nrows >= 3) {
      const f = book.frame('chimney');
      raised.push({ id: 'chimney', set: f.set, sx: f.sx, sy: f.sy, w: f.w, h: f.h, x: b.chimney * T + 16 - f.ax, y: top + T + 24 - f.ay, row: y1 * T + 31.6, seq: seq++, alpha, kind: 'roof', building: b.id });
    }
  }

  for (let i = 0, b = standing.boxes; i < map.objects.length; i++) {
    if (!near(b[4 * i], b[4 * i + 1], b[4 * i + 2], b[4 * i + 3])) continue;
    const o = map.objects[i];
    place(o.id, o.x, o.y, { fp: [o.fw, o.fh] });
  }

  const plates = [], bars = [], floats = [], bubbles = [], badges = [], effects = [], points = map.lights.map((l) => ({ x: l.x * T, y: l.y * T, r: l.radius * T, tint: l.tint }));
  let target = null;
  /* Where a placed thing's head is: the anchor column and the row its art's height reaches. */
  const head = (d) => {
    const s = book.sprite(d.id);
    const cx = d.x + s.anchor[0], foot = d.y + s.anchor[1];
    return { cx, foot, top: foot - (s.height || 20) - (s.class === 'flier' ? s.hover || 0 : 0) };
  };
  /* PROPS come from state, not the map row (a home's furniture follows the rooms
     you own): { id, x, y, ref, plate:{text,kind} }, placed exactly like objects. */
  for (const o of state.props || []) {
    const d = place(o.id, o.x, o.y, { ref: o.ref });
    if (o.plate) { const hd = head(d); plates.push({ text: o.plate.text, kind: o.plate.kind, x: hd.cx, y: hd.top, alpha: 1, id: o.id, ref: o.ref || null }); }
  }
  /* A unit: { id, x, y, anim, dir, diag, age (ms into the clip) | frame (the clip frame itself, a
     walk chosen by distance), alpha, grey (0..1 toward its corpse tone), flash, under (drawn
     beneath the standing: a corpse), plate:{text,kind,alpha?}, bar, barKind, mana, badge, target }.
     dir is the cardinal; diag the diagonal of a diagonal step, drawn when the clip has it (core/facing.js). */
  function unit(u, isHero) {
    const anim = u.anim || 'idle';
    const dir = book.facing(u.id, anim, u.dir || 's', u.diag);
    const i = Number.isInteger(u.frame) ? u.frame : clipFrame(book, u.id, anim, dir, u.age == null ? state.t || 0 : u.age);
    const d = place(u.id, u.x, u.y, { anim, dir, i, kind: 'unit', alpha: u.alpha, ref: u.ref, bias: u.under ? -UNDER : 0, shadow: u.under ? false : undefined });
    if (u.grey) d.grey = Math.max(0, Math.min(1, u.grey));
    if (u.flash) d.flash = true;
    const { cx, foot, top } = head(d);
    if (u.plate) plates.push({ text: u.plate.text, kind: u.plate.kind, x: cx, y: top - (u.bar == null ? 0 : 4), alpha: u.plate.alpha != null ? u.plate.alpha : u.alpha == null ? 1 : u.alpha,
      /* the plate names its owner, so a right-click on the NAME picks the unit too */ id: u.id, ref: u.ref || null });
    if (u.bar != null) {
      const pct = Math.max(0, Math.min(1, u.bar));
      bars.push({ x: cx, y: top - 2, w: 18, pct, kind: u.barKind === 'pct' ? barTone(pct) : isHero ? 'hero' : 'foe', mana: u.mana == null ? null : Math.max(0, Math.min(1, u.mana)) });
      if (u.badge) badges.push({ x: cx + 11, y: top - 4, n: u.badge });
    } else if (u.badge) badges.push({ x: cx + 11, y: top - 4, n: u.badge });
    if (u.target) target = { x: cx - 15, y: top - 2, w: 30, h: foot - top + 6 };
    return { cx, foot, top };
  }
  /* A speech bubble over a map object ({ text, x, y } in tiles: the speaker's tile). */
  for (const b of state.bubbles || []) {
    const o = map.objects.find((m) => m.x === b.x && m.y === b.y);
    if (!o) continue;
    const s = book.sprite(o.id);
    bubbles.push({ text: b.text, x: (o.x + o.fw / 2) * T, y: (o.y + o.fh) * T - 1 - (s.height || 20 * k) - 14 * k });
  }
  /* The tile a tap sent the hero to, while it walks there. */
  const mark = state.mark ? { x: (state.mark.x + 0.5) * T, y: (state.mark.y + 1) * T - 7 * k } : null;
  if (hero) {
    /* The hero is drawn in its style-1 outfit (src/session/hero-look.js); the knight's when none is named. */
    const h = unit(Object.assign({ id: OUTFITS.knight, anim: 'idle', dir: 's' }, hero, {
      plate: hero.plate || (state.name ? { text: state.name, kind: 'self' } : null) }), true);
    if (map.light === 'cellar') points.push({ x: h.cx, y: h.foot - 18, r: HERO_LIGHT_TILES * T, tint: 'hero' });
  }
  for (const u of state.units || []) unit(u, false);
  /* Floats rise 14 art px over their life and fade in the last third; the
     caller passes their age so the same list draws the same frame anywhere. */
  for (const f of state.floats || []) {
    const age = Math.max(0, Math.min(1, f.age / (f.life || 1000)));
    floats.push({ text: f.text, kind: f.kind, big: !!f.big, x: (f.x + 0.5) * T + (f.dx || 0), y: f.y * T - 6 * k + (f.dy || 0) - 14 * k * age, alpha: age < 0.66 ? 1 : (1 - age) / 0.34 });
  }
  /* AMBIENT LOOPS (map-compile.js `ambient`: the Great Hearth's fire): a looping effect the MAP places, on the
     state's clock, its anchor `lift` art px above the tile's foot row; drawn with the effects, after the light.
     `state.ambientSwap` draws another clip in its place ({ hearth_fire: 'hearth_fire_honey' }: a named fuel's colour,
     src/world/hearth-burn.js), at the same anchor. */
  for (const a of map.ambient || []) {
    const id = (state.ambientSwap && state.ambientSwap[a.id]) || a.id;
    const s = book.sprite(id);
    const name = s.anims && (s.anims.idle ? 'idle' : s.anims.play ? 'play' : null);
    if (!name) continue;
    const n = book.frames(id, name, 's');
    const i = Math.floor((Math.max(0, state.t || 0) * (s.anims[name].fps || 0)) / 1000) % n;
    const f = book.frame(id, name, 's', i);
    const px = Math.round((a.x + 0.5) * T), py = Math.round((a.y + 1) * T - 1 - (a.lift || 0));
    if (!near(px - f.ax, py - f.ay, f.w, f.h)) continue;
    effects.push({ id, set: f.set, sx: f.sx, sy: f.sy, w: f.w, h: f.h, x: px - f.ax, y: py - f.ay, cx: px, cy: py, ax: f.ax, ay: f.ay,
      blend: s.blend === 'add' ? 'add' : 'over', angle: 0 });
  }
  /* EFFECTS ({ id, x, y in tiles, age ms, lift, on, angle? }): a vfx clip centred at its anchor
     `lift` x the art height of sprite `on` (a flier's hover added) above the tile's foot row;
     a one-shot past its last frame is not drawn. A still (a sprite with only an `idle` frame: a fuel
     chunk thrown into the Great Hearth) is drawn as itself, wherever its x and y put it. */
  for (const e of state.fx || []) {
    const s = book.sprite(e.id);
    const anim = s.anims && s.anims.play ? 'play' : s.anims && s.anims.idle && !s.anims.idle.fps ? 'idle' : null;
    const clip = anim && s.anims[anim];
    if (!clip) continue;
    const n = book.frames(e.id, anim, 's');
    const i = Math.floor((Math.max(0, e.age) * (clip.fps || 1)) / 1000);
    if (!clip.loop && i >= n) continue;
    const f = book.frame(e.id, anim, 's', i);
    const host = e.on ? book.sprite(e.on) : null;
    const up = host ? (host.height || 20) * (e.lift || 0) + (host.class === 'flier' ? host.hover || 0 : 0) : 20 * (e.lift || 0);
    const px = Math.round((e.x + 0.5) * T), py = Math.round((e.y + 1) * T - 1 - up);
    effects.push({ id: e.id, set: f.set, sx: f.sx, sy: f.sy, w: f.w, h: f.h, x: px - f.ax, y: py - f.ay, cx: px, cy: py, ax: f.ax, ay: f.ay,
      blend: s.blend === 'add' ? 'add' : 'over', angle: Number.isFinite(e.angle) ? e.angle : 0 });
  }
  const roofs = map.buildings.map((b) => ({ id: b.id, alpha: state.roofAlpha && b.id in state.roofAlpha ? state.roofAlpha[b.id] : (b.id === heroId ? 0 : 1) }));
  return { heroBuilding: heroId, decals, shadows, sprites: ySort(stand), raised: ySort(raised), roofs, lights: { kind: map.light, vignette: map.outdoor, points },
    plates, bars, floats, target, bubbles, mark, badges, fx: effects };
}

/* VW-07: an HP bar's tone by how full it is. */
function barTone(pct) { return pct > 0.6 ? 'high' : pct > 0.3 ? 'mid' : 'low'; }

/**
 * The frame of a clip `age` ms in: looping clips cycle at their fps; a one-shot
 * (attack, hit, death, down) plays once and HOLDS its last frame.
 */
function clipFrame(book, id, anim, dir, age) {
  const s = book.sprite(id);
  const clip = s.anims && (s.anims[anim] || s.anims.idle);
  if (!clip || !clip.fps) return 0;
  const n = book.frames(id, s.anims[anim] ? anim : 'idle', dir);
  const i = Math.floor((Math.max(0, age) * clip.fps) / 1000);
  return clip.loop === false ? Math.min(n - 1, i) : i % n;
}
