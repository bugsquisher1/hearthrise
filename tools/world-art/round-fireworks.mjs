#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/round-fireworks.mjs — THE ROUND'S FIREWORKS, DRAWN BY RULE, AND THE POWDER'S PINCH, RE-POURED FROM SHIPPED ART
// (lane/c-town-shows, 2026-11-04; redrawn by lane/a-town-shows-polish, 2026-11-05, because a four-way mirrored spark read as a faint sparkle on the floor; 0 generations, $0).
//
// A round costs a player 5,000 to 20,000 gp, so each shell is its own shape, big enough to read from across Hearth Square at the default zoom:
//   fx_round_gold    a WILLOW: gold streaks thrown up and out, drooping under their own weight into long arcs, ending in falling glitter.
//   fx_round_cinder  a PEONY with a gold heart: a lumpy flower of red streaks, a tight gold ring a beat later, a crackle where they die.
//   fx_round_frost   a TILTED RING with comets: a leaning ellipse of frost stars, a few comets thrown past it on no axis at all.
//   fx_round_rise    the shell climbing from the square (src/world/town-shows.js moves it): what says "high up" in a top-down world.
//   fuel_powder      fuel_coal's chunk, the same lump poured pale: what a hero throws on the fire is a pinch of powder; its color is the fire's.
// Every star has its own angle, reach, weight and death from a seeded walk, and stars come in uneven clumps, so no shell has an axis of symmetry to catch the eye.
// HARD PIXELS: palette colors only (art/world/palette.json), no partial alpha, drawn `over` and never added, so the colors stay these on any floor. The bright pixels carry one dark
// pixel of backing, the world's dark outline, and that is what keeps gold legible on pale stone. Each shell is mostly air: heroes and the Hearth read through it (`coverOf`, tests/town-shows.mjs).
// Output: art/world/common/<id>.png + its sidecar, built into atlas-common by tools/world-art/build.mjs. The frames follow from the seeds; nothing else is read for a shell.
//
//   node tools/world-art/round-fireworks.mjs            write the sources and sidecars
//   node tools/world-art/round-fireworks.mjs --check    exit 1 when a written source differs from this script
//   node tools/world-art/round-fireworks.mjs --out <d>  write the shells to a folder instead (a preview)
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, pixelHash, createImage } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'art', 'world', 'common');
const SCRIPT = 'tools/world-art/round-fireworks.mjs';
const FPS = 10;
const RISE_FPS = 12;
/* Palette colors only (art/world/palette.json), dark to light, and the pixel behind a bright one. */
export const BURSTS = Object.freeze({
  gold: Object.freeze({ ramp: Object.freeze(['#7a4f26', '#f2a03a', '#ffd36a', '#e6dcbc']), back: '#2a1c14' }),
  cinder: Object.freeze({ ramp: Object.freeze(['#5e1a1f', '#c23a2a', '#f2a03a', '#ffd36a']), back: '#3e1216' }),
  frost: Object.freeze({ ramp: Object.freeze(['#2b4a6a', '#4fa8e8', '#a8e4ff', '#e6dcbc']), back: '#1a2c44' }),
});
const RISE_RAMP = Object.freeze(['#7a4f26', '#f2a03a', '#ffd36a', '#e6dcbc']);
const PINCH_RAMP = Object.freeze(['#553a26', '#8a6440', '#c9bfa0', '#e6dcbc']);
const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

/** A seeded walk: the same seed, the same shell. */
function walk(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* A frame under construction: a brighter rank is never overdrawn by a dimmer one. Rank 0 is the backing, 1 to 4 the ramp, dark to light. */
function frameOf(w, h) {
  const rank = new Int8Array(w * h);
  return { w, h, rank, plot(x, y, r) { const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= w || Y >= h) return; const i = Y * w + X; if (r > rank[i]) rank[i] = r; } };
}
function line(f, x0, y0, x1, y1, rankAt) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) { const u = i / n; f.plot(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, rankAt(u)); }
}
/* One dark pixel beside every bright one, under it, so a bright star holds on pale stone and the frame stays hard-edged. */
function backed(f, ranks) {
  const out = new Int8Array(f.rank);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    if (!ranks.includes(f.rank[y * f.w + x])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < f.w && Y < f.h && !f.rank[Y * f.w + X]) out[Y * f.w + X] = -1;
    }
  }
  return out;
}

/* Uneven clumps of angles round a circle: a petal here, a gap there, never an even spoke. */
function clumps(r, petals, each) {
  const out = [];
  let a = r() * Math.PI * 2;
  for (let p = 0; p < petals; p++) {
    a += (Math.PI * 2 / petals) * (0.55 + r() * 0.9);
    const n = each[0] + Math.floor(r() * (each[1] - each[0] + 1));
    for (let i = 0; i < n; i++) out.push({ a: a + (r() - 0.5) * 0.42, k: r() });
  }
  return out;
}

/* A star's place at p (0 to 1 of its flight): thrown hard, slowed by the air, pulled down by its weight. */
const placeOf = (s, p, tilt) => {
  const q = 1 - Math.pow(1 - p, 2.6);
  const rx = s.reach * q * Math.cos(s.a), ry = s.reach * q * Math.sin(s.a) * (tilt ? tilt.squash : 1);
  const c = tilt ? Math.cos(tilt.turn) : 1, n = tilt ? Math.sin(tilt.turn) : 0;
  return [rx * c - ry * n, rx * n + ry * c + s.weight * p * p];
};

/* A streak at one frame: its head hot and two pixels thick while young, its tail cooling down the ramp, the whole of it cooler the older it is. */
function drawStar(f, c, s, frame, tilt) {
  const p = (frame - s.born) / (s.die - s.born);
  if (p < 0 || p > 1) return;
  const [hx, hy] = placeOf(s, p, tilt);
  const [tx, ty] = placeOf(s, Math.max(0, p - s.tail * (0.5 + p)), tilt);
  const cool = p > 0.78 ? 2 : p > 0.5 ? 1 : 0;
  line(f, c[0] + tx, c[1] + ty, c[0] + hx, c[1] + hy, (u) => Math.max(1, (u > 0.72 ? 4 : u > 0.42 ? 3 : u > 0.16 ? 2 : 1) - cool));
  if (p < 0.5) { f.plot(c[0] + hx + 1, c[1] + hy, 4); f.plot(c[0] + hx, c[1] + hy + 1, 3); }
}

/* The crackle: where a star dies, glints wink on their own beat and drift down, a few of them full crosses. */
function glintsOf(r, stars, tilt) {
  const out = [];
  for (const s of stars) {
    const [x, y] = placeOf(s, 1, tilt);
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) out.push({ x: x + (r() - 0.5) * 18, y: y + (r() - 0.5) * 18, from: s.die - 3 + Math.floor(r() * 3), beat: 3 + Math.floor(r() * 3), phase: Math.floor(r() * 4), cross: r() < 0.5, fall: 0.5 + r() * 0.8 });
  }
  return out;
}
function drawGlint(f, c, g, frame, last) {
  const age = frame - g.from;
  if (age < 0 || (age + g.phase) % g.beat === g.beat - 1) return;
  if (age > last - g.from - 1 && !g.cross) return;
  const x = c[0] + g.x, y = c[1] + g.y + g.fall * age;
  f.plot(x, y, g.cross ? 4 : 3);
  if (g.cross) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) f.plot(x + dx, y + dy, 3);
}

/* The instant of the burst: an uneven little hot knot, never a clean disc. */
function drawFlash(f, c, r, big) {
  for (let i = 0; i < big * 5; i++) { const a = r() * Math.PI * 2, d = r() * big; f.plot(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, d < big * 0.5 ? 4 : 3); }
  for (let i = 0; i < 7; i++) { const a = r() * Math.PI * 2, d = big + 1 + r() * big; line(f, c[0], c[1], c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, (u) => (u > 0.6 ? 2 : 3)); }
}

/** One shell's frames, as rank grids (0 air, -1 backing, 1 to 4 the ramp). Pure. */
export function shellFrames(id) {
  const S = SHELLS[id];
  const r = walk(S.seed);
  const stars = S.stars(r);
  const glints = glintsOf(r, stars.filter((s) => !s.bare), S.tilt);
  const frames = [];
  for (let n = 0; n < S.frames; n++) {
    const f = frameOf(S.w, S.h);
    if (n <= 1) drawFlash(f, S.c, walk(S.seed + n * 97), n === 0 ? 5 : 7);
    for (const s of stars) drawStar(f, S.c, s, n, s.free ? null : S.tilt);
    for (const g of glints) drawGlint(f, S.c, g, n, S.frames);
    const back = backed(f, [4]);
    frames.push({ w: S.w, h: S.h, rank: back });
    const out = frames[frames.length - 1].rank;
    for (let i = 0; i < out.length; i++) if (out[i] === 0 && f.rank[i]) out[i] = f.rank[i];
  }
  return frames;
}

/* THE SHELLS. Their reach is what makes them read across the square: 120-odd art px at the widest, against 64 before, and all of it held above the floor by town-shows.js. */
const SHELLS = Object.freeze({
  gold: { seed: 0x57a11, w: 140, h: 158, c: [70, 62], frames: 15, tilt: null,
    stars(r) {
      return clumps(r, 14, [3, 4]).map((c) => ({ a: c.a, reach: 46 + c.k * 18, weight: 30 + r() * 26, born: 1, die: 10 + Math.floor(r() * 3), tail: 0.4 + r() * 0.16 }));
    } },
  cinder: { seed: 0xc1d3a, w: 136, h: 140, c: [68, 64], frames: 14, tilt: null,
    stars(r) {
      const outer = clumps(r, 13, [3, 5]).map((c) => ({ a: c.a, reach: 50 + c.k * 14, weight: 6 + r() * 8, born: 1, die: 8 + Math.floor(r() * 3), tail: 0.2 + r() * 0.08 }));
      /* the heart: born a beat late, tight, and it never drops a glint of its own */
      const heart = clumps(r, 9, [2, 2]).map((c) => ({ a: c.a, reach: 22 + c.k * 5, weight: 2 + r() * 3, born: 3, die: 8 + Math.floor(r() * 2), tail: 0.22, bare: true }));
      return outer.concat(heart);
    } },
  frost: { seed: 0xf2057, w: 140, h: 132, c: [70, 62], frames: 14, tilt: { squash: 0.62, turn: -0.5 },
    stars(r) {
      const ring = clumps(r, 16, [3, 3]).map((c) => ({ a: c.a, reach: 58 + c.k * 5, weight: 3 + r() * 4, born: 1, die: 9 + Math.floor(r() * 3), tail: 0.13 + r() * 0.05 }));
      /* comets, thrown past the ring on no axis at all */
      const comets = [0.7, 1.9, 2.6, 3.9, 5.2].map((a) => ({ a: a + (r() - 0.5) * 0.5, reach: 40 + r() * 22, weight: 10 + r() * 8, born: 2, die: 10, tail: 0.34, free: true }));
      return ring.concat(comets);
    } },
});

/** A shell's sprite sheet in its ramp's colors. Pure. */
export function burstOf(id) {
  const { ramp, back } = BURSTS[id];
  const frames = shellFrames(id);
  const { w, h } = frames[0];
  const img = createImage(w * frames.length, h);
  const put = (x, y, c) => { const i = (y * img.width + x) * 4; const [R, G, B] = rgb(c); img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255; };
  frames.forEach((f, n) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = f.rank[y * w + x];
      if (v) put(n * w + x, y, v < 0 ? back : ramp[v - 1]);
    }
  });
  return img;
}

/** How much of a shell's frame hides what's under it at its fullest: the share of its box that isn't air. Pure. */
export function coverOf(id) {
  return Math.max(...shellFrames(id).map((f) => f.rank.reduce((n, v) => n + (v ? 1 : 0), 0) / f.rank.length));
}

/* The climbing shell: a hot head, a tail that lengthens and cools, a spark or two falling off it. Five frames, the rise's whole length (ROUND_SHOW.riseMs). */
const RISE = Object.freeze({ w: 7, h: 26, frames: 5, tails: Object.freeze([8, 13, 18, 22, 24]), sparks: Object.freeze([[], [[1, 11]], [[5, 15], [1, 9]], [[5, 19], [1, 14]], [[1, 22], [5, 17]]]) });
function riseSheet() {
  const img = createImage(RISE.w * RISE.frames, RISE.h);
  const put = (n, x, y, c) => { const i = (y * img.width + n * RISE.w + x) * 4; const [R, G, B] = rgb(c); img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255; };
  for (let n = 0; n < RISE.frames; n++) {
    for (let y = 0; y <= RISE.tails[n]; y++) {
      const u = y / RISE.tails[n];
      put(n, 3, y, RISE_RAMP[u < 0.2 ? 3 : u < 0.5 ? 2 : u < 0.8 ? 1 : 0]);
      if (y < 3) { put(n, 2, y, '#2a1c14'); put(n, 4, y, RISE_RAMP[2]); }
    }
    for (const [x, y] of RISE.sparks[n]) put(n, x, y, RISE_RAMP[1]);
  }
  return img;
}

/** Every color an image uses, dark to light, mapped onto a ramp by its rank. */
function pourOnto(img, ramp) {
  const seen = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) seen.add(hex(img.data, i));
  const steps = [...seen].sort((a, b) => lum(a) - lum(b));
  return new Map(steps.map((h, k) => [h, rgb(ramp[Math.min(ramp.length - 1, Math.floor(k * ramp.length / steps.length))])]));
}

/** The base, poured onto a ramp. Pure. */
export function poured(base, ramp) {
  const to = pourOnto(base, ramp);
  const out = { width: base.width, height: base.height, data: Uint8Array.from(base.data) };
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3]) [out.data[i], out.data[i + 1], out.data[i + 2]] = to.get(hex(base.data, i));
  return out;
}

const read = (id) => ({ img: decodePNG(readFileSync(join(DIR, id + '.png'))), side: JSON.parse(readFileSync(join(DIR, id + '.json'), 'utf8')) });
const sidecarOf = (id, w, h, anchor, frames, notes, fps = FPS) => ({ id, class: 'vfx', style: 's1', drawn: SCRIPT, material: 'light', source: id + '.png', frame: [w, h], anchor_px: anchor, footprint: [1, 1],
  anims: [{ name: 'play', fps, loop: false, dirs: { s: frames } }], notes });
const WORDS = Object.freeze({
  gold: 'a willow: gold streaks drooping into long arcs, then falling glitter',
  cinder: 'a peony: a lumpy flower of red streaks with a gold heart, then a crackle',
  frost: 'a tilted ring of frost stars, with comets thrown past it',
});

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : DIR;
  mkdirSync(out, { recursive: true });
  let stale = 0;
  const one = (id, img, side) => {
    if (check) {
      let have = null;
      try { have = pixelHash(decodePNG(readFileSync(join(out, id + '.png')))); } catch { /* absent */ }
      if (have !== pixelHash(img)) { console.error('stale: ' + id); stale++; }
      return;
    }
    writeFileSync(join(out, id + '.png'), encodePNG(img));
    writeFileSync(join(out, id + '.json'), JSON.stringify(side, null, 2) + '\n');
    console.log('wrote ' + id + ' (' + img.width + 'x' + img.height + ')');
  };
  for (const color of Object.keys(BURSTS)) {
    const S = SHELLS[color], id = 'fx_round_' + color;
    one(id, burstOf(color), sidecarOf(id, S.w, S.h, S.c, S.frames, 'THE ROUND: one shell over Hearth Square, ' + WORDS[color] + '. Drawn by ' + SCRIPT + ': hard pixels, palette colors, no generation.'));
  }
  one('fx_round_rise', riseSheet(), sidecarOf('fx_round_rise', RISE.w, RISE.h, [3, 0], RISE.frames, 'THE ROUND: a shell climbing from the square, moved by src/world/town-shows.js. Drawn by ' + SCRIPT + ': hard pixels, palette colors, no generation.', RISE_FPS));
  const coal = read('fuel_coal');
  one('fuel_powder', poured(coal.img, PINCH_RAMP), Object.assign({}, coal.side, { id: 'fuel_powder', source: 'fuel_powder.png',
    pixellab: Object.assign({}, coal.side.pixellab, { derived: SCRIPT + ': fuel_coal re-poured pale; no generation' }),
    notes: 'THE BURN, for a bought powder: the pinch a hero throws on the Great Hearth. fuel_coal\'s chunk poured pale; the powder\'s color is the fire\'s.' }));
  if (check && stale) process.exit(1);
  if (check) console.log('round-fireworks --check: every source matches this script');
}

if (isMain(import.meta.url)) main();
