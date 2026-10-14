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
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { ySort } from './zsort.js?v=585';
import { heroBuilding } from './roofs.js?v=585';
import { ellipseShadow, castMatrix } from './shadows.js?v=585';
import { vertexGrid, tileKey } from './wang.js?v=585';

/** Wall height: rock tops and capstones are raised by it. */
export const WALL_FACE_PX = 48;
const CAP_DX = 10, CAP_H_LIFT = 68;
const HERO_LIGHT_TILES = 4.5;

/**
 * The static ground: [{ set, sx, sy, x, y }] tiles and [{ x, y }] void cells, art px.
 * @param {object} map compileMap() output
 * @param {object} book createBook()
 * @param {{materials: object}} tables
 */
export function groundTiles(map, book, tables, T) {
  const tiles = [], voids = [];
  const terr = book.terrains[map.groundTerrain];
  const upper = terr ? terr.upper : null;
  const fill = terr && terr.kind === 'fill' ? terr.cycle || [1, 1] : null;
  const solid = (x, y) => { const m = tables.materials[map.ground[y * map.w + x]]; return !!(m && m.solid); };
  const g = vertexGrid((x, y) => map.ground[y * map.w + x] === upper, map.w, map.h);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (solid(x, y)) { voids.push({ x: x * T, y: y * T }); continue; }
      /* A fill is one periodic field cut into a cols x rows cycle: lay it in order so it tiles seamlessly. */
      const n = fill ? (y % fill[1]) * fill[0] + (x % fill[0]) : x * 7 + y * 13;
      const t = book.tile(map.groundTerrain, fill ? '1111' : tileKey(g, map.w, x, y), n);
      if (t) tiles.push({ set: t.set, sx: t.sx, sy: t.sy, x: x * T, y: y * T });
    }
  }
  for (const b of map.buildings) {
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
  return { tiles, voids };
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
  const heroId = heroBuilding(map.buildings, hero);
  const near = (x, y, w, h) => x < view.ox + view.w + 2 * T && y < view.oy + view.h + 2 * T && x + w > view.ox - 2 * T && y + h > view.oy - 2 * T;
  const decals = [], shadows = [], stand = [], raised = [];
  let seq = 0;

  function place(id, tx, ty, o = {}) {
    const s = book.sprite(id);
    const f = book.frame(id, o.anim, o.dir, o.i);
    let { sx, sy, w, h, ax, ay } = f;
    if (o.crop) { const [c0, c1, c2, c3] = o.crop; sx += c0; sy += c1; w = c2 - c0; h = c3 - c1; ax -= c0; ay -= c1; }
    const [fw, fh] = o.fp || s.footprint;
    const x = Math.round(tx * T + Math.floor((fw * T) / 2) - ax + (o.dx || 0));
    let y = Math.round(ty * T + fh * T - 1 - ay - (o.lift || 0));
    /* Hung art and fliers are drawn `hover` px up; a flier's shadow stays on the floor. */
    const air = s.class === 'hanging' || s.class === 'flier' ? s.hover || 0 : 0;
    y -= air;
    const ground = s.class === 'flier' ? air : 0;
    const d = { id, set: f.set, sx, sy, w, h, x, y, row: ty * T + fh * T - 1 + (o.bias || 0), seq: seq++, alpha: o.alpha == null ? 1 : o.alpha,
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
  // with a capstone on every edge that meets the floor.
  const solid = (x, y) => { const m = tables.materials[map.ground[y * map.w + x]]; return !!(m && m.solid); };
  const floorAt = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && !solid(x, y);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!solid(x, y) || !near(x * T, y * T - 2 * T, T, 3 * T)) continue;
      const kit = tables.materials[map.ground[y * map.w + x]].wall;
      if (floorAt(x, y + 1)) { place(map.faces[x + ',' + y] || kit + '_wall', x, y, { i: x % 4, bias: -0.5, kind: 'wall' }); continue; }
      raised.push({ id: 'void', set: null, x: x * T, y: y * T - WALL_FACE_PX, w: T, h: T, row: y * T + T - 1, seq: seq++, alpha: 1, kind: 'void' });
      if (floorAt(x, y - 1)) place(kit + '_cap_h', x, y, { lift: CAP_H_LIFT, raised: true, shadow: false, bias: 1 });
      if (floorAt(x + 1, y)) place(kit + '_cap', x, y, { dx: CAP_DX, lift: WALL_FACE_PX, raised: true, shadow: false, bias: 1 });
      if (floorAt(x - 1, y)) place(kit + '_cap_w', x, y, { dx: -CAP_DX, lift: WALL_FACE_PX, raised: true, shadow: false, bias: 1 });
    }
  }

  for (const b of map.buildings) {
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

  for (const o of map.objects) place(o.id, o.x, o.y, { fp: [o.fw, o.fh] });

  const plates = [], bars = [], floats = [], bubbles = [], points = map.lights.map((l) => ({ x: l.x * T, y: l.y * T, r: l.radius * T, tint: l.tint }));
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
    if (o.plate) { const hd = head(d); plates.push({ text: o.plate.text, kind: o.plate.kind, x: hd.cx, y: hd.top, alpha: 1 }); }
  }
  /* A unit: { id, x, y, anim, dir, age (ms into the clip), alpha, plate:{text,kind,alpha?}, bar, target }. */
  function unit(u, isHero) {
    const anim = u.anim || 'idle';
    const i = clipFrame(book, u.id, anim, u.dir || 's', u.age == null ? state.t || 0 : u.age);
    const d = place(u.id, u.x, u.y, { anim, dir: u.dir || 's', i, kind: 'unit', alpha: u.alpha, ref: u.ref });
    const { cx, foot, top } = head(d);
    if (u.plate) plates.push({ text: u.plate.text, kind: u.plate.kind, x: cx, y: top - (u.bar == null ? 0 : 4), alpha: u.plate.alpha != null ? u.plate.alpha : u.alpha == null ? 1 : u.alpha });
    if (u.bar != null) bars.push({ x: cx, y: top - 2, w: 18, pct: Math.max(0, Math.min(1, u.bar)), kind: isHero ? 'hero' : 'foe' });
    if (u.target) target = { x: cx - 15, y: top - 2, w: 30, h: foot - top + 6 };
    return { cx, foot, top };
  }
  /* A speech bubble over a map object ({ text, x, y } in tiles: the speaker's tile). */
  for (const b of state.bubbles || []) {
    const o = map.objects.find((m) => m.x === b.x && m.y === b.y);
    if (!o) continue;
    const s = book.sprite(o.id);
    bubbles.push({ text: b.text, x: (o.x + o.fw / 2) * T, y: (o.y + o.fh) * T - 1 - (s.height || 20) - 14 });
  }
  /* The tile a tap sent the hero to, while it walks there. */
  const mark = state.mark ? { x: (state.mark.x + 0.5) * T, y: (state.mark.y + 1) * T - 7 } : null;
  if (hero) {
    const h = unit(Object.assign({ id: 'hero', anim: 'idle', dir: 's' }, hero, {
      plate: hero.plate || (state.name ? { text: state.name, kind: 'self' } : null) }), true);
    if (map.light === 'cellar') points.push({ x: h.cx, y: h.foot - 18, r: HERO_LIGHT_TILES * T, tint: 'hero' });
  }
  for (const u of state.units || []) unit(u, false);
  /* Floats rise 14 art px over their life and fade in the last third; the
     caller passes their age so the same list draws the same frame anywhere. */
  for (const f of state.floats || []) {
    const k = Math.max(0, Math.min(1, f.age / (f.life || 1000)));
    floats.push({ text: f.text, kind: f.kind, x: (f.x + 0.5) * T, y: f.y * T - 6 - 14 * k, alpha: k < 0.66 ? 1 : (1 - k) / 0.34 });
  }
  const roofs = map.buildings.map((b) => ({ id: b.id, alpha: state.roofAlpha && b.id in state.roofAlpha ? state.roofAlpha[b.id] : (b.id === heroId ? 0 : 1) }));
  return { heroBuilding: heroId, decals, shadows, sprites: ySort(stand), raised: ySort(raised), roofs, lights: { kind: map.light, vignette: map.outdoor, points },
    plates, bars, floats, target, bubbles, mark };
}

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
