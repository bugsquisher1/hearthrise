// tools/world-art/measure.mjs — what a sprite's pixels actually say about its size
// and how it meets the floor. Pure functions over RGBA images; no I/O.
//
// mass      the opaque shape with every feature thinner than 3 px removed (a 3×3
//           opening): the body a player reads, without the sword blade or the tail.
// profile   per column, the lowest opaque row — the silhouette's underside.
// contact   the CONTACT ROW: of the rows in the bottom 5 px of the box, the one the
//           most columns bottom out on (ties to the lower row). Not the lowest
//           pixel: a stray outline pixel below the base does not move it.
// k         the art grid's scale (src/data/world/art-budget.js GRIDS: T / 32). Every band
//           above is the base band times k (a 64 px grid opens 6x6 and reads 10 rows), so
//           a sprite drawn at twice the detail measures exactly twice the size. k = 1 is
//           the base grid and the default.
import { ALPHA_CUT } from '../../src/data/world/palette.js';

export function mask(img) {
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0; i < m.length; i++) m[i] = img.data[i * 4 + 3] >= ALPHA_CUT ? 1 : 0;
  return m;
}

export function bboxOf(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* Count the set pixels in the s×s window at offsets [lo, lo + s) around each pixel. */
function morph(m, w, h, s, lo, keepIf) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let dy = lo; dy < lo + s; dy++) for (let dx = lo; dx < lo + s; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) n++;
    }
    out[y * w + x] = keepIf(n, m[y * w + x]) ? 1 : 0;
  }
  return out;
}

/** (3k)×(3k) opening: erode (the whole window set) then dilate by the mirrored window (any set). */
export function openMask(m, w, h, k = 1) {
  const s = 3 * k, lo = -Math.floor((s - 1) / 2);
  return morph(morph(m, w, h, s, lo, (n) => n === s * s), w, h, s, -(lo + s - 1), (n) => n > 0);
}

/** Box of the mass; a sprite too thin to survive the opening falls back to its raw box. */
export function massBox(img, k = 1) {
  const m = mask(img);
  return bboxOf(openMask(m, img.width, img.height, k), img.width, img.height) || bboxOf(m, img.width, img.height);
}

export function bottomProfile(m, w, h) {
  const p = new Int16Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) if (m[y * w + x]) { p[x] = y; break; }
  return p;
}

export function contactRow(profile, box, k = 1) {
  let best = box.y1, bestHits = -1;
  for (let y = box.y1; y >= Math.max(box.y0, box.y1 - (5 * k - 1)); y--) {
    let hits = 0;
    for (let x = box.x0; x <= box.x1; x++) if (profile[x] === y) hits++;
    if (hits > bestHits) { bestHits = hits; best = y; }
  }
  return best;
}

/**
 * A unit's FOOT ROW: the lowest row at least two columns bottom out on. Feet are
 * the lowest thing a standing unit has, and a one-pixel tail tip or blade point
 * is not a foot. (Props use contactRow: a chest rests on its widest base row.)
 */
export function footRow(profile, box, k = 1) {
  for (let y = box.y1; y >= Math.max(box.y0, box.y1 - (7 * k - 1)); y--) {
    let hits = 0;
    for (let x = box.x0; x <= box.x1; x++) if (profile[x] === y) hits++;
    if (hits >= 2 * k) return y;
  }
  return box.y1;
}

/** Runs of columns whose underside lies within `tol` px above row y (or on it). */
export function contactSpans(profile, y, tol = 2) {
  const spans = [];
  let s = -1;
  for (let x = 0; x <= profile.length; x++) {
    const on = x < profile.length && profile[x] >= y - tol && profile[x] <= y;
    if (on && s < 0) s = x;
    if (!on && s >= 0) { spans.push([s, x - 1]); s = -1; }
  }
  return spans;
}

/**
 * An isometric-corner silhouette: the underside drops to a point in the middle
 * and climbs in straight lines to both sides (a box seen corner-on). A top-down
 * box sits on a flat edge; a round barrel's underside is flat across its middle.
 */
// The test: the underside's lowest row is ONE short run (≤ 4 columns) near the
// middle of the box, and from it the silhouette climbs a straight stair — every
// step one row up over 1-3 columns — for at least 3 rows on BOTH sides. A 2:1 iso
// edge is exactly that stair. A barrel's arc is not (its lowest run is long and its
// steps lengthen); a chest on two feet is not (two runs, at the ends).
export function isoCorner(profile, box, k = 1) {
  let tip = -1;
  for (let x = box.x0; x <= box.x1; x++) tip = Math.max(tip, profile[x]);
  const runs = contactSpans(profile, tip, 0);
  if (runs.length !== 1) return { iso: false, left: 0, right: 0 };
  const [s, e] = runs[0];
  const mid = (s + e) / 2;
  if (e - s + 1 > 4 * k || mid < box.x0 + 0.3 * box.w || mid > box.x0 + 0.7 * box.w) return { iso: false, left: 0, right: 0 };
  const climb = (x, dir) => {
    let y = tip, steps = 0;
    while (x >= box.x0 && x <= box.x1) {
      let run = 0;
      while (x >= box.x0 && x <= box.x1 && profile[x] === y - k) { run++; x += dir; }
      if (!run || run > 3 * k) break;
      steps++; y -= k;
    }
    return steps;
  };
  const left = climb(s - 1, -1), right = climb(e + 1, 1);
  return { iso: left >= 3 && right >= 3, left, right };
}

/** Everything the validator and the manifest need from one frame. */
export function measureFrame(img, k = 1) {
  const { width: w, height: h } = img;
  const m = mask(img);
  const box = bboxOf(m, w, h);
  if (!box) return { empty: true };
  const mass = bboxOf(openMask(m, w, h, k), w, h) || box;
  const profile = bottomProfile(m, w, h);
  const contact = contactRow(profile, box, k);
  return { empty: false, box, mass, profile, contact, foot: footRow(profile, box, k), mask: m };
}

/** Opaque pixels strictly below row y. */
export function countBelow(m, w, h, y) {
  let n = 0;
  for (let r = Math.max(0, y + 1); r < h; r++) for (let x = 0; x < w; x++) n += m[r * w + x];
  return n;
}
