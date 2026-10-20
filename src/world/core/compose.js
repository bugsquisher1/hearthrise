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
import { ySort } from './zsort.js?v=0.2.19';
import { heroBuilding } from './roofs.js?v=0.2.19';
import { ellipseShadow, castMatrix } from './shadows.js?v=0.2.19';
import { vertexGrid, tileKey } from './wang.js?v=0.2.19';
import { OUTFITS } from '../../data/hunt-outfits.js?v=0.2.19';

/** Wall height: rock tops and capstones are raised by it. */
export const WALL_FACE_PX = 48;
const CAP_DX = 10, CAP_H_LIFT = 68;
const HERO_LIGHT_TILES = 4.5;
/* A corpse sorts beneath everything standing (VW-03): its row is lowered by this many art px. */
const UNDER = 1 << 20;

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
  /* A PAINTED ground (a whole map stitched from PixelLab, port-pixellab.mjs) covers every cell,
     rock and water included: its walls are in the paint, so nothing is void. */
  const painted = !!(terr && terr.painted);
  const solid = (x, y) => { const m = tables.materials[map.ground[y * map.w + x]]; return !painted && !!(m && m.solid); };
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
  // with a capstone on every edge that meets the floor. A painted ground draws its own.
  const paintedGround = !!(book.terrains[map.groundTerrain] && book.terrains[map.groundTerrain].painted);
  const solid = (x, y) => { const m = tables.materials[map.ground[y * map.w + x]]; return !paintedGround && !!(m && m.solid); };
  const floorAt = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && !solid(x, y);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!solid(x, y) || !near(x * T, y * T - 2 * T, T, 3 * T)) continue;
      const mat = tables.materials[map.ground[y * map.w + x]];
      if (mat.flat) continue;
      const kit = mat.wall;
      if (floorAt(x, y + 1)) { place(map.faces[x + ',' + y] || kit + '_wall', x, y, { i: x % 4, bias: -0.5, kind: 'wall' }); continue; }
      raised.push({ id: 'void', set: null, x: x * T, y: y * T - WALL_FACE_PX, w: T, h: T, row: y * T + T - 1, seq: seq++, alpha: 1, kind: 'void' });
      if (floorAt(x, y - 1)) place(kit + '_cap_h', x, y, { lift: CAP_H_LIFT, raised: true, shadow: false, bias: 1 });
      if (floorAt(x + 1, y)) place(kit + '_cap', x, y, { dx: CAP_DX, lift: WALL_FACE_PX, raised: true, shadow: false, bias: 1 });
      if (floorAt(x - 1, y)) place(kit + '_cap_w', x, y, { dx: -CAP_DX, lift: WALL_FACE_PX, raised: true, shadow: false, bias: 1 });
    }
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

  for (const o of map.objects) place(o.id, o.x, o.y, { fp: [o.fw, o.fh] });

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
    bubbles.push({ text: b.text, x: (o.x + o.fw / 2) * T, y: (o.y + o.fh) * T - 1 - (s.height || 20) - 14 });
  }
  /* The tile a tap sent the hero to, while it walks there. */
  const mark = state.mark ? { x: (state.mark.x + 0.5) * T, y: (state.mark.y + 1) * T - 7 } : null;
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
    const k = Math.max(0, Math.min(1, f.age / (f.life || 1000)));
    floats.push({ text: f.text, kind: f.kind, big: !!f.big, x: (f.x + 0.5) * T + (f.dx || 0), y: f.y * T - 6 + (f.dy || 0) - 14 * k, alpha: k < 0.66 ? 1 : (1 - k) / 0.34 });
  }
  /* EFFECTS ({ id, x, y in tiles, age ms, lift, on, angle? }): a vfx clip centred at its anchor
     `lift` x the art height of sprite `on` (a flier's hover added) above the tile's foot row;
     a one-shot past its last frame is not drawn. */
  for (const e of state.fx || []) {
    const s = book.sprite(e.id);
    const clip = s.anims && s.anims.play;
    if (!clip) continue;
    const n = book.frames(e.id, 'play', 's');
    const i = Math.floor((Math.max(0, e.age) * (clip.fps || 1)) / 1000);
    if (!clip.loop && i >= n) continue;
    const f = book.frame(e.id, 'play', 's', i);
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
