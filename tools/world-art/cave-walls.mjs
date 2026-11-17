#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/cave-walls.mjs — A CAVE WALL THAT CURVES (lane/a-cave-walls; Tyler's gate before new players: no right-angle
// tile staircases, every terrain edge right).
//
// The Coppercap Warrens were painted by PixelLab's map tool from a wang tileset: every wall edge a ruler line on the cell grid,
// every turn a right-angle step, and the south faces painted a row too high (the floor ran on into the blocked row under them,
// so a torch hung on floor and a pillar's last row looked walkable). This draws the walls again from the map rows, in the
// paint's own pixels (no pixel of its own, so the palette-locked ground stays locked):
//   OUTLINE  the wall's foot: the wall cells' share under a cubic B-spline over 4 x 4 cells (a one-cell jog bends over two
//            cells, an outer corner rounds), warped by a slow noise as the banks wander, held `bias` inside the wall (about 4 px
//            on a straight run). It only ever cuts INTO a wall cell (a floor bay), never lays rock on a cell that is not wall:
//            the walk mask and the picture agree. A wall cell always keeps a core of rock (`core` px round its centre), so a
//            one-cell pillar is a boulder, never floor that blocks.
//   FACE     a wall with floor below shows its face: `faceH` px of the paint's own face strip (`tex.face`, its rows `rows`)
//            above the foot, column by column, so the strata follow the curve; a column shorter than `faceH + topMin` keeps
//            `topMin` px of top and a shorter face (its lit top rows kept). The face lies in the wall row over the floor.
//   RIMS     the wall top round its edge, by the direction to the nearest px that is not top: floor or face to the side, the
//            paint's side band (`sideE` when it lies east, `sideW` west: column 0 the outline) along the curve; floor above,
//            the lip (`lip`: row 0 the outline); a face below, nothing (the face carries its own lit top). A side band beside
//            a face's end runs up it to the top, so an inner corner is a dark crease and an outer corner is cut.
//   FLOOR    a bay cut into a wall cell is the floor fill on the ground's phase; the floor cells round a wall are laid with it
//            too (the old tileset rims that stood 4 px onto them go), except px `keep(x, y)` names (a chasm the borders drew).
//
//   caveWalls(img, o) -> { img, wall (Uint8Array: 1 a px drawn as wall), face, changed, offWall (px of a non-wall cell drawn as
//        wall: 0 by construction, counted) }
//        o { rows, wall: '#', T: 32, seed, tex: { top, floor, face, rows, sideE, sideW, lip, dark }, keep(x, y), ...CAVE }
//   node tools/world-art/cave-walls.mjs --selftest   a synthetic cave: no rock on a walked cell (and the count bites when it is
//        planted), no straight run left on a staircase, faces on the south edges inside the wall row, a one-cell pillar kept,
//        deterministic, palette-closed
// ════════════════════════════════════════════════════════════════════════
import { createImage } from './png.mjs';
import { noise, hash2 } from './ground-finish.mjs';
import { isMain } from '../../tests/_is-main.mjs';

export const CAVE = Object.freeze({
  /* the floor's bay into a wall cell: 5 px, swinging 3.5 over about three cells and 1.5 over half a cell, never under 1.5; up to
     `alcove` px deeper within `alcoveReach` of an inner corner */
  bias: 5.5, wander: 6, reach: 80, mid: 1.5, scale: 18, minBay: 1.5, alcove: 5, alcoveReach: 44,
  touch: 0.75,        /* an inner corner's fillet stops this far short of the corner (never on the floor quadrant) */
  roundPx: 22, roundJitter: 6,   /* an outer corner's radius, each its own */
  core: 7,            /* px round a wall cell's centre that stay rock whatever the rounds take (inside the deepest bay) */
  faceH: 23, topMin: 6, rimReach: 10, clean: 8,
});

const sn = (x, y, s, seed) => Math.max(-1, Math.min(1, (noise(x, y, s, seed) - 0.5) * 3.2));

/** The rows of a face `h` px tall from the strip's `rows` (its full height): the lit top three, then the last h - 3 (the foot's). */
export function faceRows(h, rows) {
  if (h >= rows.length) return rows.slice();
  if (h <= 3) return rows.slice(rows.length - h);
  return rows.slice(0, 3).concat(rows.slice(rows.length - (h - 3)));
}

/**
 * The wall's foot mask: 1 where a px of a wall cell is drawn as rock. o { rows, wall, T, seed, ...CAVE }
 * Returns { F, W, H, isWall(cx, cy) } with F a Uint8Array of the image's px.
 */
export function wallFoot(o) {
  const c = Object.assign({}, CAVE, o), T = c.T || 32, rows = c.rows, CW = rows[0].length, CH = rows.length, seed = c.seed || 1;
  const wallCh = c.wall || '#';
  /* beyond the map, the row or column at its edge goes on (a corridor that leaves the map runs on straight) */
  const isWall = (cx, cy) => wallCh.includes(rows[Math.max(0, Math.min(CH - 1, cy))][Math.max(0, Math.min(CW - 1, cx))]);
  const W = CW * T, H = CH * T, F = new Uint8Array(W * H);
  /* an inner corner: a cell corner whose one floor quadrant has wall on both its sides (an L of wall round it, or a checker);
     f points from the corner into that floor quadrant */
  const inner = (vx, vy) => {
    const out = [];
    for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const qx = fx < 0 ? vx - 1 : vx, qy = fy < 0 ? vy - 1 : vy, ox = fx < 0 ? vx : vx - 1, oy = fy < 0 ? vy : vy - 1;
      if (!isWall(qx, qy) && isWall(ox, qy) && isWall(qx, oy)) out.push([vx * T, vy * T, fx, fy]);
    }
    return out;
  };
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    if (!isWall(cx, cy)) continue;
    /* the floor cells within two cells (their rectangles: a px's distance to the nearest), the inner corners on this cell's own */
    const near = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = cx + dx, Y = cy + dy;
      if (X < 0 || Y < 0 || X >= CW || Y >= CH || isWall(X, Y)) continue;
      near.push([X * T, Y * T]);
    }
    const fillets = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]].flatMap(([vx, vy]) => inner(vx, vy));
    /* the inner corners round this cell, near enough to deepen its bay (a corner of the cave opens into a rounded alcove) */
    const alcoves = [];
    for (let vy = cy - 1; vy <= cy + 2; vy++) for (let vx = cx - 1; vx <= cx + 2; vx++) if (inner(vx, vy).length) alcoves.push([vx * T, vy * T]);
    /* this cell's outer corners (floor on both sides of it, the way g points from the cell's middle), each its own radius; a
       one-cell-wide end rounds within its half */
    const outer = [];
    for (const [gx, gy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (isWall(cx + gx, cy) || isWall(cx, cy + gy)) continue;
      const vx = (cx + (gx > 0 ? 1 : 0)) * T, vy = (cy + (gy > 0 ? 1 : 0)) * T;
      const thin = !isWall(cx - gx, cy) || !isWall(cx, cy - gy);
      outer.push({ vx, vy, gx, gy, r: c.roundPx + c.roundJitter * (2 * hash2(vx, vy, seed + 41) - 1), thin });
    }
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const x = cx * T + i, y = cy * T + j, p = y * W + x, X = x + 0.5, Y = y + 0.5;
      if (!near.length) { F[p] = 1; continue; }
      let d = Infinity;
      for (const [nx, ny] of near) d = Math.min(d, Math.hypot(Math.max(nx - X, 0, X - nx - T), Math.max(ny - Y, 0, Y - ny - T)));
      if (d > 2 * T) { F[p] = 1; continue; }
      /* the floor's own bay: `bias` px in from the cell line, wandering, deeper by an inner corner */
      let near2 = Infinity;
      for (const [vx, vy] of alcoves) near2 = Math.min(near2, Math.hypot(X - vx, Y - vy));
      const al = Math.max(0, 1 - near2 / c.alcoveReach), b = Math.max(c.minBay, c.bias + c.wander * sn(x, y, c.reach, seed + 31) + c.mid * sn(x, y, c.scale, seed + 33)) + c.alcove * al * al * (3 - 2 * al);
      let rock = d >= b;
      /* an inner corner rounds: a fillet tangent to the bay on both legs, its middle just short of the corner (never onto the floor
         quadrant), so a staircase of cells is one slope */
      for (const [vx, vy, fx, fy] of fillets) {
        if (!rock) break;
        const rf = Math.max(0, (b - c.touch) / (1 - Math.SQRT1_2)), ccx = vx + (rf - b) * fx, ccy = vy + (rf - b) * fy;
        if ((X - vx) * fx < 0 && (Y - vy) * fy < 0 && Math.hypot(X - ccx, Y - ccy) <= rf) rock = false;
      }
      /* an outer corner rounds: an arc tangent to the bay on both its sides */
      for (const k of outer) {
        if (!rock) break;
        const r = k.thin ? Math.min(k.r, T / 2 - b) : k.r, ccx = k.vx - (b + r) * k.gx, ccy = k.vy - (b + r) * k.gy;
        if ((X - ccx) * k.gx > 0 && (Y - ccy) * k.gy > 0 && Math.hypot(X - ccx, Y - ccy) > r) rock = false;
      }
      /* a wall cell keeps its middle whatever the rounds took (a lone cell is a boulder, never floor that blocks) */
      if (rock || Math.hypot(i + 0.5 - T / 2, j + 0.5 - T / 2) <= c.core) F[p] = 1;
    }
  }
  return { F, W, H, isWall, T };
}

/** A pixel of a texture image (wrapping), as [r, g, b]. */
const px = (img, x, y) => { const i = ((((y % img.height) + img.height) % img.height) * img.width + (((x % img.width) + img.width) % img.width)) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

export function caveWalls(img, o) {
  const c = Object.assign({}, CAVE, o), tex = c.tex;
  const { F, W, H, isWall, T } = wallFoot(c);
  if (img.width !== W || img.height !== H) throw new Error(`cave-walls: the ground is ${img.width}x${img.height}, the rows ${W / T}x${H / T} cells of ${T}`);
  const keep = c.keep || (() => false);
  const out = createImage(W, H);
  out.data.set(img.data);
  /* FACE: each column's runs of rock; the bottom faceH px of a run that ends on floor (a run shorter than faceH + topMin keeps
     topMin px of top). Face[p] = 1 + the face row drawn there. */
  const face = new Uint8Array(W * H);
  const fr = {};
  const rowsFor = (h) => fr[h] || (fr[h] = faceRows(h, c.tex.rows));
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!F[y * W + x]) { y++; continue; }
      const y0 = y;
      while (y < H && F[y * W + x]) y++;
      const y1 = y - 1, len = y1 - y0 + 1;
      if (y >= H) continue;   /* the run goes on past the map's foot */
      const h = Math.min(c.faceH, len - c.topMin);
      if (h <= 0) continue;
      const rs = rowsFor(h);
      for (let k = 0; k < h; k++) face[(y1 - h + 1 + k) * W + x] = 1 + rs[k];
    }
  }
  const top = (p) => F[p] && !face[p];
  let changed = 0, offWall = 0;
  const put = (p, rgb) => { const i = p * 4; if (out.data[i] !== rgb[0] || out.data[i + 1] !== rgb[1] || out.data[i + 2] !== rgb[2]) changed++; out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2]; out.data[i + 3] = 255; };
  const R = c.rimReach;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, cx = Math.floor(x / T), cy = Math.floor(y / T);
    if (!isWall(cx, cy)) {
      if (F[p]) offWall++;
      continue;
    }
    if (!F[p]) {
      /* a bay: the floor fill, or beside what `keep` holds (a chasm) that ground mirrored across the cell line, so the wall's foot
         drops into the pit instead of standing on a ledge of floor */
      let q = null, qd = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = cx + dx, Y = cy + dy;
        if (X < 0 || Y < 0 || X >= W / T || Y >= H / T || isWall(X, Y)) continue;
        const qx = Math.max(X * T, Math.min(X * T + T - 1, x)), qy = Math.max(Y * T, Math.min(Y * T + T - 1, y)), d = (qx - x) ** 2 + (qy - y) ** 2;
        if (d < qd) { qd = d; q = [qx, qy]; }
      }
      const mx = q ?Math.max(0, Math.min(W - 1, q[0] + (q[0] - x) - Math.sign(q[0] - x))) : -1, my = q ? Math.max(0, Math.min(H - 1, q[1] + (q[1] - y) - Math.sign(q[1] - y))) : -1;
      if (q && keep(mx, my)) { const i = (my * W + mx) * 4; put(p, [img.data[i], img.data[i + 1], img.data[i + 2]]); } else put(p, px(tex.floor, x, y));
      continue;
    }
    if (face[p]) {
      /* a face column beside floor is the face's cut end: its outline */
      const side = (x > 0 && !F[p - 1]) || (x < W - 1 && !F[p + 1]);
      put(p, side ? tex.dark : px(tex.face, x, face[p] - 1));
      continue;
    }
    /* the wall top: the nearest px that is not top, within R */
    let best = null, bd = Infinity;
    for (let dy = -R; dy <= R; dy++) {
      const Y = y + dy;
      if (Y < 0 || Y >= H) continue;
      for (let dx = -R; dx <= R; dx++) {
        const X = x + dx;
        if (X < 0 || X >= W) continue;
        const q = Y * W + X;
        if (top(q)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = [dx, dy, q]; }
      }
    }
    if (!best) { put(p, px(tex.top, x, y)); continue; }
    const [dx, dy, q] = best, d = Math.round(Math.sqrt(bd)) - 1;
    let rgb = null;
    if (dy > 0 && Math.abs(dx) <= dy && face[q]) rgb = null;                       /* over a face: the face's own lit top */
    else if (Math.abs(dx) >= Math.abs(dy) || dy > 0) {                               /* to the side (or a face's end below) */
      const s = dx >= 0 ? tex.sideE : tex.sideW;
      if (d < s.width) rgb = px(s, d, y);
    } else if (d < tex.lip.height) rgb = px(tex.lip, x, d);                          /* floor above: the lip */
    put(p, rgb || px(tex.top, x, y));
  }
  /* the floor: the old tileset rims that stood on it go, and so does the old rock where the rows have opened since the paint (a
     cell with no `keep` px in it or round it is laid with the floor fill whole); by what `keep` names (a chasm) only the px
     within `clean` of a wall are */
  const keepIn = (cx, cy) => { for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) if (keep(cx * T + i, cy * T + j)) return true; return false; };
  for (let cy = 0; cy < H / T; cy++) for (let cx = 0; cx < W / T; cx++) {
    if (isWall(cx, cy)) continue;
    let by = false, near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = cx + dx, Y = cy + dy;
      if (X < 0 || Y < 0 || X >= W / T || Y >= H / T) continue;
      if (isWall(X, Y)) by = true; else if ((dx || dy) && keepIn(X, Y)) near = true;
    }
    const kept = keepIn(cx, cy);
    if (!by && (kept || near)) continue;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const x = cx * T + i, y = cy * T + j;
      if (kept) {
        if (keep(x, y)) continue;
        let close = false;
        for (let dy = -1; dy <= 1 && !close; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = cx + dx, Y = cy + dy;
          if (X < 0 || Y < 0 || X >= W / T || Y >= H / T || !isWall(X, Y)) continue;
          if (Math.hypot(Math.max(X * T - x - 0.5, 0, x + 0.5 - X * T - T), Math.max(Y * T - y - 0.5, 0, y + 0.5 - Y * T - T)) <= c.clean) { close = true; break; }
        }
        if (!close) continue;
      }
      put(y * W + x, px(tex.floor, x, y));
    }
  }
  return { img: out, wall: F, face, changed, offWall };
}

/** px of the map's walkable cells drawn as wall: a driver's own count (open(cx, cy) from the map's materials). */
export function wallOnWalk(wall, rows, T, open) {
  const W = rows[0].length * T;
  let n = 0;
  for (let i = 0; i < wall.length; i++) if (wall[i] && open(Math.floor((i % W) / T), Math.floor(i / W / T))) n++;
  return n;
}

/* ── the selftest's yardsticks ── */
/** The longest run (px) along which a wall's edge stays on one column or one row (a ruler line), over a band of cells. */
export function longestRuler(wall, W, H, x0, y0, x1, y1) {
  let best = 0;
  /* a vertical ruler: consecutive rows whose wall-to-floor switch sits on the same column */
  const switchX = (y) => { const s = []; for (let x = Math.max(1, x0); x < x1; x++) if (wall[y * W + x] !== wall[y * W + x - 1]) s.push(x); return s; };
  let prev = null, run = 0;
  for (let y = y0; y < y1; y++) { const s = switchX(y); const same = prev && s.some((v) => prev.includes(v)); run = same ? run + 1 : 1; best = Math.max(best, run); prev = s; }
  const switchY = (x) => { const s = []; for (let y = Math.max(1, y0); y < y1; y++) if (wall[y * W + x] !== wall[(y - 1) * W + x]) s.push(y); return s; };
  prev = null; run = 0;
  for (let x = x0; x < x1; x++) { const s = switchY(x); const same = prev && s.some((v) => prev.includes(v)); run = same ? run + 1 : 1; best = Math.max(best, run); prev = s; }
  return best;
}

function selftest() {
  let bad = 0;
  const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) bad++; };
  const T = 32;
  /* five flat colours: the top, the floor, the face (two strata), the side band, the lip, and the outline */
  const flat = (w, h, f) => { const im = createImage(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.data.set([...f(x, y), 255], (y * w + x) * 4); return im; };
  const TOP = [35, 29, 31], FLOOR = [106, 104, 101], FA = [79, 78, 82], FB = [47, 39, 35], SIDE = [58, 58, 62], LIP = [79, 78, 82], DARK = [11, 10, 12];
  const tex = {
    top: flat(T, T, () => TOP), floor: flat(T, T, () => FLOOR),
    face: flat(T, 30, (x, y) => (y === 29 ? DARK : (y >> 2) % 2 ? FA : FB)), rows: Array.from({ length: 30 }, (_, i) => i),
    sideE: flat(9, T, (x) => (x ? SIDE : DARK)), sideW: flat(9, T, (x) => (x ? SIDE : DARK)), lip: flat(T, 4, (x, y) => (y ? LIP : DARK)), dark: DARK,
  };
  /* a cave: a staircase wall running down-right one cell a row (the tileset's worst), a long straight south face, a one-cell
     pillar, a two-row bar */
  const rows = [
    '################',
    '################',
    '#####......#####',
    '####........####',
    '###..........###',
    '##.....#......##',
    '#..............#',
    '#...####.......#',
    '#...####.......#',
    '#..............#',
    '################',
  ];
  const paint = flat(rows[0].length * T, rows.length * T, (x, y) => (rows[Math.floor(y / T)][Math.floor(x / T)] === '#' ? TOP : FLOOR));
  const o = { rows, wall: '#', T, seed: 3, tex };
  const a = caveWalls(paint, o), b = caveWalls(paint, o);
  ok(Buffer.compare(Buffer.from(a.img.data), Buffer.from(b.img.data)) === 0, 'deterministic');
  const open = (cx, cy) => rows[cy][cx] !== '#';
  const on = wallOnWalk(a.wall, rows, T, open);
  ok(on === 0 && a.offWall === 0, 'no px of a walked cell drawn as wall (' + on + ', offWall ' + a.offWall + ')');
  /* the count bites: the mask grown 4 px (past the margin, onto the floor cells) is caught */
  let grown = a.wall;
  for (let k = 0; k < 4; k++) { const g = Uint8Array.from(grown); for (let i = 0; i < g.length; i++) if (!grown[i] && ((i % paint.width > 0 && grown[i - 1]) || (i >= paint.width && grown[i - paint.width]))) g[i] = 1; grown = g; }
  const caught = wallOnWalk(grown, rows, T, open);
  ok(caught > 0, 'a wall grown 4 px onto the floor is counted (' + caught + ' px)');
  /* every px of the picture is a texture colour */
  const pal = new Set([TOP, FLOOR, FA, FB, SIDE, LIP, DARK].map((v) => v.join()));
  let off = 0;
  for (let i = 0; i < a.img.data.length; i += 4) if (!pal.has([a.img.data[i], a.img.data[i + 1], a.img.data[i + 2]].join())) off++;
  ok(off === 0, 'every px drawn is one of the textures\' own (' + off + ' off)');
  /* the staircase (rows 2-5, the north-west wall) is no ruler: no edge stays on one column or row for more than 20 px */
  const W = paint.width;
  const ruler = longestRuler(a.wall, W, paint.height, 0, 2 * T, 6 * T, 6 * T);
  const before = longestRuler(Uint8Array.from({ length: W * paint.height }, (_, i) => (rows[Math.floor(i / W / T)][Math.floor((i % W) / T)] === '#' ? 1 : 0)), W, paint.height, 0, 2 * T, 6 * T, 6 * T);
  ok(before >= T && ruler <= 20, 'the staircase bends: the longest straight edge ' + before + ' px on the grid, ' + ruler + ' px drawn');
  /* the bar's south face (rows 7-8, floor at row 9) lies in the wall row over the floor (row 8), none in row 7 or below */
  let faceIn = 0, faceOut = 0, feet = 0, feetOut = 0;
  for (let y = 6 * T; y < 10 * T; y++) for (let x = 4 * T; x < 8 * T; x++) if (a.face[y * W + x]) {
    if (y >= 8 * T && y < 9 * T) faceIn++; else faceOut++;
    if (!a.wall[(y + 1) * W + x]) { feet++; if (y < 8 * T) feetOut++; }
  }
  ok(faceIn > 0 && faceOut * 6 < faceIn && feet > 3 * T && feetOut * 10 < feet, 'the bar\'s face stands in its wall row over the floor (' + faceIn + ' px in, '
    + faceOut + ' above it; ' + feet + ' feet, ' + feetOut + ' of them up its rounded ends)');
  /* the long top wall (row 1, floor row 2) carries a face over the floor: its face sits in row 1 */
  let f1 = 0;
  for (let y = T; y < 2 * T; y++) for (let x = 6 * T; x < 10 * T; x++) if (a.face[y * W + x]) f1++;
  ok(f1 > 4 * T * 15, 'the north wall shows a face over the hall (' + f1 + ' px in its wall row)');
  /* the one-cell pillar (7, 5) is still rock: a boulder, never floor that blocks */
  let pil = 0;
  for (let y = 5 * T; y < 6 * T; y++) for (let x = 7 * T; x < 8 * T; x++) if (a.wall[y * W + x]) pil++;
  ok(pil >= 200, 'the one-cell pillar keeps ' + pil + ' px of rock');
  console.log(bad ? `✗ cave-walls selftest: ${bad} failed` : '✓ cave-walls selftest');
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  console.error('usage: node tools/world-art/cave-walls.mjs --selftest   (the Warrens are drawn by tools/world-art/seam-grounds.mjs)');
  process.exit(2);
}
