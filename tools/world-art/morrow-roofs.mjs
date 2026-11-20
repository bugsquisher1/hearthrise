// ════════════════════════════════════════════════════════════════════════
// tools/world-art/morrow-roofs.mjs — THE INN'S ROOFS, CUT OPEN OVER ITS ROOMS (lane/b-morrow-kit, 2026-11-19).
//
// Carter's Rest's first paint laid the inn's mass as one brick-like slate fill ringed by a pale wall-top cap on every edge: at a glance a
// stone barracks drawn as a blueprint (the Coordinator's read of layoutA-front-x2). A roadside inn is a ROOF with rooms cut out of it:
//   roofMass   every mass pixel is a slate roof: each range has a ridge along its length (east-west), courses run parallel to it (5 px on
//              the south slope, 4 on the foreshortened north slope that faces the light), slates of 6-8 px staggered course to course,
//              each course a dark gap, its body and a lit lip; now and then a slate is gone and the batten shows.
//   edges      where the roof meets ground it is finished by what is there: over a ROOM it is cut (the void under it, a dark timber
//              section with rafter ends, 4-6 px, never a ruled line); over the yard, the road or the moor its north and south edges
//              are EAVES (the last lip, a dark drip), its east and west ends GABLES (a timber barge board).
//   faceTop    a wall face's top (the 32x60 slice's cap rows) is the same edge seen side-on: an eave with a fascia board over a face
//              that looks out, the cut section over a face inside a room.
// Every pixel is a hr-world-56-v2 colour; the light is the upper left (ART_DIRECTION §2-5). Pixels by rule, nothing scaled.
// mutant-anchors: none — an import tool; tests/world-assets.mjs judges what it writes
// ════════════════════════════════════════════════════════════════════════
import { hash2, noise } from './ground-finish.mjs';

const T = 32;
const rgb = (h) => h.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
/* the slate is the steel and iron ramps (a blue-grey slate, told apart from the stone of the walls), its timber the earth ramp */
const C = Object.freeze({
  void: '#0b0a0c', sh: '#17141a', sh2: '#231d1f', i0: '#2c2e33', s0: '#3a4652', i1: '#4a4d54', st1: '#4f4e52', s1: '#5c6c7a', i2: '#6e727a',
  e0: '#2a1c14', e1: '#3d2a1d', e2: '#553a26', e3: '#6e4c30',
});
const SOUTH_BODY = [C.i0, C.i0, C.s0, C.i0];
const NORTH_BODY = [C.s0, C.s0, C.i1, C.s0];
const RIDGE = Object.freeze({ '-4': C.void, '-3': C.s0, '-2': C.s1, '-1': C.i2, 0: C.s1, 1: C.s0, 2: C.i0, 3: C.sh, 4: C.void });
const RH = 4;   /* the ridge's half height */

/**
 * THE HIPPED ROOF of a range (round 3 of batch 1: "every wing the same flat plane, nothing shows height"). Each pixel's slope is the one
 * whose eave is nearest (the straight skeleton of a rectangle): the north slope (foreshortened: its run counts FORE times, so the ridge
 * sits north of the middle) faces the light and is a step lighter, the south slope a step darker, the west end lit and the east end in
 * shade, their courses parallel to their own eave (5 px across, 4 on the north, 6 on the ends) and staggered; where two slopes meet a
 * ridge or a hip, a capping line lit on the side the light falls on. `r` = [x0, y0, x1, y1] in cells.
 */
const FORE = 1.4;
const WEST_BODY = [C.s0, C.i1, C.s0, C.s0], EAST_BODY = [C.i0, C.sh2, C.i0, C.i0];
function slopeOf(px, py, r) {
  const X0 = r[0] * T, X1 = (r[2] + 1) * T - 1, Y0 = r[1] * T, Y1 = (r[3] + 1) * T - 1;
  const d = [['N', (py - Y0) * FORE], ['S', Y1 - py], ['W', px - X0], ['E', X1 - px]].sort((a, b) => a[1] - b[1]);
  return { f: d[0][0], g: d[1][0], gap: d[1][1] - d[0][1], e: { N: py - Y0, S: Y1 - py, W: px - X0, E: X1 - px } };
}
export function slateAt(px, py, r, seed, div = null) {
  if (div) return slateDiv(px, py, div, seed);
  const s = slopeOf(px, py, r), pair = s.f + s.g;
  const ridge = pair === 'NS' || pair === 'SN', lightSide = s.f === 'N' || s.f === 'W';
  if (ridge && s.gap <= 5) return s.gap > 4 ? C.void : s.f === 'N' ? (s.gap <= 1.5 ? C.i2 : C.s1) : (s.gap <= 1.5 ? C.s1 : s.gap <= 3 ? C.s0 : C.sh);
  if (!ridge && s.gap <= 2.5) return s.gap <= 1 ? (lightSide ? C.i2 : C.s0) : lightSide ? C.s1 : C.sh;
  const vert = s.f === 'W' || s.f === 'E', h = s.f === 'N' ? 4 : s.f === 'S' ? 5 : 6, e = s.e[s.f];
  const k = Math.floor(e / h), row = e - k * h, fs = 'NSWE'.indexOf(s.f);
  const along = vert ? py : px, w = (vert ? 9 : 9) + Math.floor(hash2(k, seed + fs, 6) * 4), off = Math.floor(hash2(k, seed + fs, 5) * 13);
  const j = Math.floor((along + off) / w), a = (along + off) - j * w;
  const body = ({ N: NORTH_BODY, S: SOUTH_BODY, W: WEST_BODY, E: EAST_BODY })[s.f], pick = body[Math.floor(hash2(j, k * 4 + fs, seed + 7) * body.length)];
  if (hash2(j, k * 4 + fs, seed + 8) < 0.012 && a > 1 && a < w - 1) return row === 1 ? C.e0 : C.sh2;
  /* each course from its eave inward: the lit lip, the body, the gap under the next course's lip; the joint stops short of the lip */
  if (row === 0) return lightSide ? (s.f === 'N' ? C.i2 : C.s1) : C.s0;
  if (row === h - 1) return C.sh;
  if (a === 0 && (row === h - 2 || hash2(j, k, seed + 4) < 0.5)) return C.sh;
  if (row === h - 2 && !lightSide) return pick === C.i0 ? C.sh2 : C.i0;
  if (a === 1) return pick === C.i0 ? C.s0 : pick === C.s0 ? C.i1 : pick;
  return pick;
}

/**
 * A DIVIDER's roof (round 3: "the inner bands read as plan walls"): the strip of roof between two rooms, `div` = [x0, x1] its px span,
 * runs north-south with its own ridge down its middle (a lit cap, a dark one), the west slope lit, the east a step down, its courses
 * parallel to the ridge (6 px), the slates staggered along it. Past its span (a torn overhang) the outer course carries on.
 */
function slateDiv(px, py, div, seed) {
  const [x0, x1] = div, c = (x0 + x1) / 2, d = px - c, west = d < 0, ad = Math.abs(d);
  if (ad <= 1.5) return west ? C.i2 : C.s0;
  if (ad <= 2.5) return west ? C.s1 : C.sh;
  const e = Math.max(0, west ? px - x0 + 12 : x1 + 12 - px), k = Math.floor(e / 6), row = e - k * 6;
  const w = 9 + Math.floor(hash2(k, seed + (west ? 11 : 12), 6) * 4), off = Math.floor(hash2(k, seed + (west ? 11 : 12), 5) * 13);
  const j = Math.floor((py + off) / w), a = (py + off) - j * w, body = west ? WEST_BODY : EAST_BODY;
  const pick = body[Math.floor(hash2(j, k * 2 + (west ? 0 : 1), seed + 7) * body.length)];
  if (row === 0) return west ? C.s1 : C.s0;
  if (row === 5) return C.sh;
  if (a === 0 && (row === 4 || hash2(j, k, seed + 4) < 0.5)) return C.sh;
  if (row === 4 && !west) return pick === C.i0 ? C.sh2 : C.i0;
  return pick;
}
/** The divider spans of a grid: (cx, cy) -> [x0, x1] px when that mass cell is in a run of at most 3 cells with a room either side. */
export function dividersOf(grid, indoor) {
  const h = grid.length, w = grid[0].length, mass = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'M';
  return (cx, cy) => {
    if (!mass(cx, cy)) return null;
    let a = cx; while (mass(a - 1, cy)) a--;
    let b = cx; while (mass(b + 1, cy)) b++;
    if (b - a + 1 > 3 || a - 1 < 0 || b + 1 >= w) return null;
    if (!indoor(grid[cy][a - 1], a - 1, cy) || !indoor(grid[cy][b + 1], b + 1, cy)) return null;
    return [a * T, (b + 1) * T - 1];
  };
}

/** The slate at a pixel of a plain gabled roof plane (the walked roof's): an east-west ridge across its middle. */
function slateFlat(px, py, r, seed) {
  const Y0 = r[1] * T, ry = Math.round(((r[1] + r[3] + 1) * T) / 2);
  const d = py - ry;
  if (Math.abs(d) <= RH) {
    /* the ridge: capping pieces 12 px long, a dark joint and a lit column after it */
    const a = (px + seed * 7) % 12;
    if (d >= -3 && d <= 3 && a === 0) return C.sh;
    if (d >= -3 && d <= 0 && a === 1) return C.i2;
    return RIDGE[d];
  }
  const south = d > RH;
  const h = south ? 5 : 4, dd = south ? d - RH - 1 : py - Y0;
  const k = Math.floor(dd / h), row = dd - k * h;
  const w = 9 + Math.floor(hash2(k, seed, 6) * 4), off = Math.floor(hash2(k, seed, 5) * 13);
  const j = Math.floor((px + off) / w), col = (px + off) - j * w;
  const gone = hash2(j, k, seed + 8) < 0.022;
  /* the courses: south [gap, body x3, lit lip], north (towards the light) [lit lip, body x2, gap] */
  const isGap = south ? row === 0 : row === h - 1, isLip = south ? row === h - 1 : row === 0;
  if (isGap) return gone ? C.void : C.sh;
  if (gone) return row === (south ? 2 : 1) ? C.e1 : C.void;
  if (isLip) return C.s1;
  /* the joint runs down from the gap and stops short of the lip: the slate below shows under it (an overlap, not a brick's mortar) */
  const nearGap = south ? row === 1 : row === h - 2;
  const body = (south ? SOUTH_BODY : NORTH_BODY)[Math.floor(hash2(j, k, seed + 7) * (south ? SOUTH_BODY.length : NORTH_BODY.length))];
  if (col === 0 && (nearGap || hash2(j, k, seed + 4) < 0.5)) return C.sh;
  /* in the lip's shadow under the course above the slate is a step darker; lit along its left edge (the light is the upper left) */
  if (nearGap && south) return body === C.s0 ? C.i0 : C.sh2;
  if (col === 1) return body === C.i0 ? C.s0 : body === C.s0 ? C.i1 : body === C.i1 ? C.st1 : body;
  return body;
}

/** The cut section over a room, `t` px from the cut (0 = the void under the roof), `a` along the edge. */
function cutAt(t, a, width) {
  if (t === 0) return C.void;
  if (t >= width - 1) return C.sh;
  /* rafter ends every 10 px, 3 wide, lit top-left */
  const ra = ((a % 10) + 10) % 10;
  if (t <= 3 && ra < 3) return t === 1 && ra === 0 ? C.e3 : t === 3 ? C.e1 : C.e2;
  return t === 1 ? C.sh : C.e0;
}
/** The eave seen from above (the roof's lower edge over open ground): the drip, the last lip. */
function eaveAt(t, north) { return t === 0 ? C.void : t === 1 ? (north ? C.i2 : C.s1) : null; }
/** The gable's barge board, `west` lit on its outer face. */
function gableAt(t, west) { return (west ? [C.void, C.e3, C.e2, C.e2, C.e1, C.sh] : [C.void, C.e1, C.e2, C.e2, C.e0, C.sh])[t] || null; }

/**
 * Paint every mass cell of `grid` as roof (call before the faces are laid). `indoor(ch, x, y)` says whether a cell is a room under the
 * roof (its edge is cut) or open ground (eave or gable). Returns counts.
 */
export function roofMass(g, grid, ranges, indoor, doorway = () => true, divOf = () => null, jambs = null) {
  const jamb = !!jambs, jambAt = (t, a, side) => { const q = ((t % jambs.height) * jambs.width + ((a % jambs.width) + jambs.width) % jambs.width) * 4;
    return t === 0 ? C.void : t === 5 ? C.sh : '#' + [0, 1, 2].map((k) => jambs.data[q + k].toString(16).padStart(2, '0')).join(''); };
  const h = grid.length, w = grid[0].length;
  const mass = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'M';
  const rangeOf = (x, y) => ranges.findIndex(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
  let slates = 0, cuts = 0, eaves = 0, gables = 0;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    if (!mass(cx, cy)) continue;
    const ri = rangeOf(cx, cy); if (ri < 0) continue;
    const r = ranges[ri], seed = 31 + ri * 13;
    /* the open neighbours (8 round), each with its kind */
    const nb = [];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + dx, y = cy + dy;
      if (mass(x, y)) continue;
      const inside = x >= 0 && y >= 0 && x < w && y < h && indoor(grid[y][x], x, y);
      nb.push({ dx, dy, inside, door: inside && doorway(x, y) });
    }
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
      const px = cx * T + u, py = cy * T + v;
      let col = slateAt(px, py, r, seed, divOf(cx, cy));
      /* the nearest open edge: an orthogonal one by its axis distance, a diagonal (an outer corner) by the larger of the two */
      let best = null;
      for (const n of nb) {
        const tx = n.dx < 0 ? u : n.dx > 0 ? T - 1 - u : -1, ty = n.dy < 0 ? v : n.dy > 0 ? T - 1 - v : -1;
        const t = n.dx && n.dy ? Math.max(tx, ty) : n.dx ? tx : ty;
        const horiz = n.dx && n.dy ? ty >= tx : !n.dx;   /* the edge runs east-west */
        const side = horiz ? (n.dy < 0 ? 'N' : 'S') : (n.dx < 0 ? 'W' : 'E');
        if (n.inside && !n.door) continue;   /* a room's edge: the roof runs on and is torn over the room (tornEdges) */
        if (!best || t < best.t) best = { t, side, inside: n.inside, a: horiz ? px : py };
      }
      if (best) {
        const along = best.a, width = 4 + Math.floor(noise(along, best.side.charCodeAt(0), 11, seed + 3) * 3);
        let e = null;
        if (best.inside) { if (best.t < 6) { e = jamb ? jambAt(best.t, along, best.side) : cutAt(best.t, along, width); cuts++; } }
        else if (best.side === 'N' || best.side === 'S') { e = eaveAt(best.t, best.side === 'N'); if (e) eaves++; }
        else { e = gableAt(best.t, best.side === 'W'); if (e) gables++; }
        if (e) col = e;
      }
      g.data.set(rgb(col), (py * g.width + px) * 4);
      slates++;
    }
  }
  return { slates, cuts, eaves, gables };
}

/**
 * The top of a wall face slice (a copy of `slice`, N px wide, 60 tall), over its cap rows 5-12 where the slice is opaque: `outdoor` an
 * eave with a fascia board and the face's first rows a step into the eave's shade, else the cut section. `x0` is the slice's map x (the
 * slates and rafters run on with the roof).
 */
export function faceTop(slice, outdoor, x0, seed = 5) {
  const img = { width: slice.width, height: slice.height, data: new Uint8Array(slice.data) };
  const RAMP_DOWN = { '#aaa49a': '#8a867d', '#8a867d': '#6a6865', '#6a6865': '#4f4e52', '#4f4e52': '#3a3a3e', '#3a3a3e': '#2f2723',
    '#8a9aa8': '#5c6c7a', '#5c6c7a': '#3a4652', '#6e727a': '#4a4d54', '#4a4d54': '#2c2e33' };
  const hex = (p) => '#' + [0, 1, 2].map((k) => img.data[p + k].toString(16).padStart(2, '0')).join('');
  for (let u = 0; u < img.width; u++) {
    const ax = x0 + u;
    for (let v = 5; v <= (outdoor ? 18 : 14); v++) {
      const p = (v * img.width + u) * 4; if (img.data[p + 3] < 128) continue;
      let col = null;
      if (outdoor) {
        if (v <= 12) {
          /* the last two courses seen from above and in front: [gap, body x2, lit lip] twice, joints staggered, lit along their left */
          const k = v <= 8 ? 0 : 1, row = v - (k ? 9 : 5), w = 8, off = (seed * 3 + k * 4) % 8, j = Math.floor((ax + off) / w), c = (ax + off) - j * w;
          col = row === 0 ? C.sh : row === 3 ? C.s1 : c === 0 ? C.sh : c === 1 ? C.s0 : SOUTH_BODY[Math.floor(hash2(j, seed + k, 9) * SOUTH_BODY.length)];
        } else if (v === 13) col = C.void;
        else if (v === 14) col = C.e2;
        else if (v === 15) col = C.e1;
        else if (v === 16) col = C.void;
        else { const d = RAMP_DOWN[hex(p)]; if (d) col = d; }   /* rows 17-18: the face in the eave's shade */
      } else {
        if (v === 5) col = C.void;
        else if (v <= 9) { const ra = ((ax % 10) + 10) % 10; col = ra < 3 && v <= 8 ? (v === 6 && ra === 0 ? C.e3 : v === 8 ? C.e1 : C.e2) : C.e0; }
        else if (v === 10) col = C.e1;
        else if (v === 11) col = C.sh;
        else if (v === 12) col = C.sh2;
        else if (v === 13) { const d = RAMP_DOWN[hex(p)]; if (d) col = d; }
      }
      if (col) img.data.set(rgb(col), p);
    }
  }
  return img;
}

/** Which slate a pixel of a range's roof is (null on the ridge): its course, its place along it, its slope and its centre. */
function slateOf(px, py, r, seed) {
  const Y0 = r[1] * T, ry = Math.round(((r[1] + r[3] + 1) * T) / 2), d = py - ry;
  if (Math.abs(d) <= RH) return null;
  const south = d > RH, h = south ? 5 : 4, dd = south ? d - RH - 1 : py - Y0, k = Math.floor(dd / h);
  const w = 9 + Math.floor(hash2(k, seed, 6) * 4), off = Math.floor(hash2(k, seed, 5) * 13), j = Math.floor((px + off) / w);
  return { k, j, south, cx: j * w - off + w / 2, cy: (south ? ry + RH + 1 : Y0) + k * h + h / 2 };
}
/* the walked roof is the range's own roof sunk a step into the dark (it sags under the trolls, art rules 1: dim) */
const SUNK = Object.freeze({ [C.s1]: C.st1, [C.i2]: C.st1, [C.i1]: '#3a3a3e', [C.st1]: '#3a3a3e', [C.s0]: '#2f2723', [C.i0]: C.sh2 });

/**
 * THE WALKED ROOF (the guest wing's, caved in to its room and slumped down to the yard: the Slate Thrower's pocket). It is the front
 * range's own roof run on through the room, its courses and ridge in line with the roof round it, sunk a step into the dark: one roof,
 * caved in. Where the trolls have stripped it whole slates are gone (each slate's centre in a blob of value noise), and under them the
 * dark of the roof space with the rafters running down the slope (3 px, lit on their left) and the battens across; a broken course
 * keeps a dark foot. Pulled slates lie stacked beside the holes. Its slump runs out into the yard ragged, the yard's own earth past it.
 */
export function walkedRoof(g, grid, earth, ranges, under, ch = 'O', seed = 81) {
  const h = grid.length, w = grid[0].length, is = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === ch;
  const put = (px, py, c) => g.data.set(rgb(c), (py * g.width + px) * 4);
  let roof = 0, holes = 0, stacks = 0;
  /* its own plane: the O cells' box, sagging under the trolls (its courses bow down to 9 px in the middle, so it never runs on in line
     with the intact roof round it and reads as a roof fallen in, a level below) */
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (is(x, y)) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  if (bx1 < 0) return { roof: 0, holes: 0, stacks: 0 };
  const wb = [bx0, by0, bx1, by1];
  const sagged = (px, py) => py - Math.round(9 * Math.sin(Math.PI * Math.min(1, Math.max(0, (px - bx0 * T) / ((bx1 + 1 - bx0) * T)))) * Math.sin(Math.PI * Math.min(1, Math.max(0, (py - by0 * T) / ((by1 + 1 - by0) * T)))));
  const hole = (px, py) => {
    const q = slateOf(px, sagged(px, py), wb, seed);
    return !!q && is(Math.floor(px / T), Math.floor(py / T)) && noise(q.cx, q.cy * 1.3, 30, seed) > 0.66;
  };
  for (let py = 0; py < g.height; py++) for (let px = 0; px < g.width; px++) {
    const cx = Math.floor(px / T), cy = Math.floor(py / T);
    if (!is(cx, cy)) continue;
    /* the slump's north end runs out ragged into the yard: past the frayed line the yard's own earth */
    if (cy > 0 && !is(cx, cy - 1) && grid[cy - 1][cx] !== 'M' && (py % T) < 4 + noise(px, 0, 7, seed + 2) * 10) {
      const q = ((py % T) * T + (px % T)) * 4; g.data.set(earth.data.subarray(q, q + 3), (py * g.width + px) * 4); continue;
    }
    const r = wb, sy = sagged(px, py);
    let col = slateFlat(px, sy, r, seed);
    /* the ridge broke where it sagged most: its capping gone over the middle third, the courses' gap showing */
    const ryw = Math.round(((r[1] + r[3] + 1) * T) / 2);
    if (Math.abs(sy - ryw) <= RH && Math.abs(px - (r[0] + r[2] + 1) * T / 2) < (r[2] + 1 - r[0]) * T / 6) col = Math.abs(sy - ryw) === RH ? C.sh : C.void;
    col = SUNK[col] || col;
    if (hole(px, py)) {
      /* the roof space: rafters down the slope every 16 px, battens across every 5 */
      const ra = ((px + 5) % 16), b = ((sy - ryw) % 5 + 5) % 5;
      const q = ((py % T) * T + (px % T)) * 4, bd = '#' + [0, 1, 2].map((k) => under.data[q + k].toString(16).padStart(2, '0')).join('');
      /* b5 (CR): the holes showed flat brown boards at the roof's own level; under the rafters it is the dark room a storey down, a
         faint floor far below, and the slates' broken edge a lit line on the hole's south (near) rim */
      col = ra < 3 ? [C.e2, C.e1, C.e0][ra] : b === 0 && hash2(px, py, seed + 31) > 0.4 ? C.e0 : noise(px, py, 9, seed + 33) > 0.7 ? '#17141a' : '#0b0a0c';
      if (!hole(px, py - 1)) col = C.sh;
      else if (!hole(px, py + 1)) col = '#6a6865';
      void bd;
      holes++;
    }
    put(px, py, col);
    roof++;
  }
  /* the pulled slates, stacked beside the holes: 3-4 slates 9x3, each a step up and a px over, lit top, dark foot */
  let ys = Infinity, ye = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (is(x, y)) { ys = Math.min(ys, y); ye = Math.max(ye, y); }
  for (let gy = 0; gy < g.height; gy += 37) for (let gx = 0; gx < g.width; gx += 37) {
    const px = gx + Math.floor(hash2(gx, gy, seed + 21) * 20), py = gy + Math.floor(hash2(gx, gy, seed + 22) * 20);
    if (![[-2, -2], [12, -2], [-2, 14], [12, 14]].every(([dx, dy]) => is(Math.floor((px + dx) / T), Math.floor((py + dy) / T)))) continue;
    if (Math.floor(py / T) <= ys + 1 || [[4, 6], [0, 0], [10, 12]].some(([dx, dy]) => hole(px + dx, py + dy))) continue;
    if (!(hole(px + 4, py + 20) || hole(px + 4, py - 8) || hole(px - 10, py + 6) || hole(px + 18, py + 6))) continue;
    const n = 3 + (hash2(gx, gy, seed + 23) > 0.5 ? 1 : 0);
    for (let s = 0; s < n; s++) {
      const ox = px + (s % 2), oy = py + 9 - s * 3;
      for (let u = 0; u < 10; u++) put(ox + u, oy + 3, C.void);
      for (let u = 0; u < 9; u++) { put(ox + u, oy, s === n - 1 ? C.i1 : C.s0); put(ox + u, oy + 1, C.i0); put(ox + u, oy + 2, C.sh); }
      put(ox, oy, C.i1); put(ox + 9, oy, C.void); put(ox + 9, oy + 1, C.void); put(ox + 9, oy + 2, C.void);
    }
    stacks++;
  }
  return { roof, holes, stacks };
}

/** A doorway: an indoor cell whose open run between the mass, across or down, is 3 cells or fewer (its sides keep the cut section). */
export function doorwayOf(grid) {
  const h = grid.length, w = grid[0].length, mass = (x, y) => x < 0 || y < 0 || x >= w || y >= h || grid[y][x] === 'M';
  const run = (x, y, dx, dy) => { let n = 1, a = x - dx, b = y - dy; while (!mass(a, b) && n < 9) { n++; a -= dx; b -= dy; }
    a = x + dx; b = y + dy; while (!mass(a, b) && n < 9) { n++; a += dx; b += dy; } return n; };
  return (x, y) => run(x, y, 1, 0) <= 3 || run(x, y, 0, 1) <= 3;
}

/**
 * THE ROOF TORN OPEN OVER THE ROOMS: where a room meets the roof on its west, east or south side (its north side is a wall face) the
 * roof runs on over the room's edge 3-11 px and stops on a torn line, the broken slates' ends dark where they face away from the light
 * and lit where they face it, and every 18 px or so a snapped rafter sticks out past the slates (3 px, lit on its upper left). Never over
 * a doorway (its sides keep the cut section). Laid after the floor's own wear, before the faces.
 */
export function tornEdges(g, grid, ranges, indoor, doorway, cap, divOf = () => null, seed = 47) {
  const h = grid.length, w = grid[0].length, mass = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] === 'M';
  const rangeOf = (x, y) => ranges.findIndex(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
  let torn = 0, rafters = 0;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    if (mass(cx, cy) || !indoor(grid[cy][cx], cx, cy) || doorway(cx, cy)) continue;
    const ri = rangeOf(cx, cy); if (ri < 0) continue;
    const sides = [[-1, 0, 'W'], [1, 0, 'E'], [0, 1, 'S']].filter(([dx, dy]) => mass(cx + dx, cy + dy));
    if (!sides.length) continue;
    for (let v = 0; v < T; v++) for (let u = 0; u < T; u++) {
      const px = cx * T + u, py = cy * T + v;
      let col = null;
      for (const [dx, dy, side] of sides) {
        const sc = side.charCodeAt(0), t = dx < 0 ? u : dx > 0 ? T - 1 - u : T - 1 - v, a = dx ? py : px;
        const sunk = grid[cy][cx] === 'O';
        const D = sunk ? 1 + Math.floor(noise(a, sc, 9, seed) * 3) : 2 + Math.floor(noise(a, sc, 13, seed) * 6);
        const ra = ((a + sc * 3) % 7 + 7) % 7, slot = Math.floor((a + sc * 3) / 7), snapped = !sunk && ra < 3 && hash2(slot, sc, seed + 1) < 0.2;
        const reach = D + 3 + Math.floor(hash2(slot, sc, seed + 2) * 8);
        /* the light is the upper left: a torn edge whose room lies to its east or north faces it */
        const lit = side === 'W' || side === 'S';
        let c = null;
        const WT = 5;   /* the wall's top course: a row of its cap stones, dimmed, seen where the roof is torn back past it */
        if (t < D - 1) c = slateAt(px, py, ranges[ri], 31 + ri * 13, divOf(cx + dx, cy + dy));
        else if (t < WT && !(snapped && t < reach)) { const q = ((dx ? (dx < 0 ? t : WT - 1 - t) : WT - 1 - t) * cap.width + ((a % cap.width) + cap.width) % cap.width) * 4; c = '#' + [0, 1, 2].map((k) => cap.data[q + k].toString(16).padStart(2, '0')).join(''); }
        else if (t === D - 1) c = lit ? C.i1 : C.void;
        else if (snapped && t < reach) { c = ra === 0 ? (t === reach - 1 ? C.e1 : C.e3) : ra === 1 ? C.e2 : C.e0; rafters++; }
        else if (snapped && t === reach) c = C.void;
        /* the skirting (ART_DIRECTION 5): the floor's first 2 px past the wall top or the roof a step and two into the dark */
        else if (t < Math.max(D, WT) + 4) { const p = (py * g.width + px) * 4, hx = '#' + [0, 1, 2].map((k) => g.data[p + k].toString(16).padStart(2, '0')).join(''); c = t < Math.max(D, WT) + 2 ? (DOWN2[hx] || C.sh2) : (DOWN1[hx] || hx); }
        if (c) { col = c; break; }
      }
      if (col) { g.data.set(rgb(col), (py * g.width + px) * 4); torn++; }
    }
  }
  return { torn, rafters };
}

const DOWN1 = Object.freeze({ '#3d2a1d': '#2a1c14', '#553a26': '#3d2a1d', '#6e4c30': '#553a26', '#2f2723': '#231d1f', '#3a3a3e': '#2f2723', '#4f4e52': '#3a3a3e', '#2c2e33': '#231d1f', '#3a4652': '#2c2e33', '#4a4d54': '#2c2e33', '#231d1f': '#17141a', '#2a1c14': '#231d1f' });
const DOWN2 = Object.freeze(Object.fromEntries(Object.entries(DOWN1).map(([a, b]) => [a, DOWN1[b] || '#17141a'])));
/** Stone, slate and iron a step into the dark (the wall faces sat brighter than the floors the trolls are read on); wood keeps its value. */
const STONE_DOWN = Object.freeze({ '#aaa49a': '#8a867d', '#8a867d': '#6a6865', '#6a6865': '#4f4e52', '#4f4e52': '#3a3a3e', '#3a3a3e': '#2f2723',
  '#c4ccd2': '#8a9aa8', '#8a9aa8': '#5c6c7a', '#5c6c7a': '#3a4652', '#969aa1': '#6e727a', '#6e727a': '#4a4d54', '#4a4d54': '#2c2e33' });
export function dimStone(img) {
  const o = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let p = 0; p < o.data.length; p += 4) {
    if (o.data[p + 3] < 128) continue;
    const hx = '#' + [0, 1, 2].map((k) => o.data[p + k].toString(16).padStart(2, '0')).join(''), to = STONE_DOWN[hx];
    if (to) o.data.set(rgb(to), p);
  }
  return o;
}

/**
 * A CHIMNEY STACK on the roof: `face` (a slice of the inn's own wall, already dimmed) is its front, 48 x 26, a cap course over it seen
 * from above (14 px: its lit front lip, its stones, the dark flue in the middle), lit down its left edge, dark down its right, a dark
 * outline round it. `px, py` = its foot's left end on the map.
 */
export function chimney(g, face, px, py) {
  const W = 48, FH = 26, TH = 14, put = (x, y, c) => { if (x >= 0 && y >= 0 && x < g.width && y < g.height) g.data.set(rgb(c), (y * g.width + x) * 4); };
  for (let v = 0; v < FH; v++) for (let u = 0; u < W; u++) {
    const q = ((v + 20) * face.width + (u % face.width)) * 4;
    let c = '#' + [0, 1, 2].map((k) => face.data[q + k].toString(16).padStart(2, '0')).join('');
    c = STONE_DOWN[c] || c;
    if (u === 0 || u === W - 1 || v >= FH - 2) c = v === FH - 2 && u > 0 && u < W - 1 ? C.sh2 : C.void; else if (u === 1) c = '#4f4e52'; else if (u >= W - 3) c = C.sh2;
    put(px + u, py - FH + v, c);
  }
  /* the cap: the top seen from above, its front lip lit, the flue a dark hole with a sooted rim */
  for (let v = 0; v < TH; v++) for (let u = 0; u < W; u++) {
    let c = v === 0 || u === 0 || u === W - 1 ? C.void : v === TH - 1 ? '#6a6865' : v === TH - 2 ? C.sh2 : (u + v * 3) % 11 === 0 ? C.sh2 : u === 1 || v === 1 ? '#6a6865' : '#4f4e52';
    const fu = u - 14, fv = v - 3;
    if (fu >= 0 && fu < 20 && fv >= 0 && fv < 7) c = fu === 0 || fv === 0 ? C.sh : fu === 19 || fv === 6 ? C.sh2 : C.void;
    put(px + u, py - FH - TH + v, c);
  }
}

/**
 * THE THRESHOLDS: where a doorway's passage (doorwayOf) opens onto a room or the open, a stone sill across it at the wall's line, 3 px
 * (its top lit, its face, its dark foot), so planks and cobbles never run straight through a wall.
 */
export function sills(g, grid, indoor, doorway) {
  const h = grid.length, w = grid[0].length, mass = (x, y) => x < 0 || y < 0 || x >= w || y >= h || grid[y][x] === 'M';
  const put = (x, y, c) => g.data.set(rgb(c), (y * g.width + x) * 4);
  let n = 0;
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    if (mass(cx, cy) || !doorway(cx, cy) || !indoor(grid[cy][cx], cx, cy)) continue;
    const passH = mass(cx, cy - 1) || mass(cx, cy + 1) ? false : true;   /* mass above or below: the passage runs east-west */
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = cx + dx, y = cy + dy;
      if (mass(x, y) || (doorway(x, y) && indoor(grid[y][x], x, y))) continue;
      if ((dx !== 0) !== passH) continue;
      for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
        const c = k === 0 ? '#6a6865' : k === 1 ? '#4f4e52' : '#17141a';
        if (dy) put(cx * T + t, dy < 0 ? cy * T + k : cy * T + T - 3 + k, t === 0 || t === T - 1 ? C.sh : c);
        else put(dx < 0 ? cx * T + k : cx * T + T - 3 + k, cy * T + t, t === 0 || t === T - 1 ? C.sh : c);
        n++;
      }
    }
  }
  return { sills: n };
}
