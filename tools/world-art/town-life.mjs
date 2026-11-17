#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/town-life.mjs — HAVORA'S AMBIENT LIFE, DRAWN BY RULE
// (lane/a-living-town, 2026-11-16; no generation, $0).
//
// Tyler 2026-11-16: "it doesn't feel 'alive' what so ever." The cheapest life a scene can get is
// what the air and the water do (ART_DIRECTION §3: in town "something always moves"). Four loops:
//   chimney_smoke  a home's chimney: puffs that leave the mouth quickly, slow, swell, lean east
//                  on the town's one breeze and break up into a dither before they go
//   hearth_smoke   the Great Hearth's flue: the same smoke, a column three times the size
//   hearth_embers  sparks lifting out of the Hearth's fire mouth, hot to cooling to gone
//   water_glint_a/b  daylight catching a wave: a dash that forms, peaks and breaks, then rests
// Smoke is lit from the upper left like everything else (steel ramp: lit, body, shade), opaque,
// no blur and no alpha: it thins by an ordered dither laid in the puff's own coordinates, so the
// pattern travels with the puff instead of crawling through it. Glints use the mithril ramp the
// water's own wave marks are drawn in, one step brighter at the peak.
// ONE BEAT: every clip turns on the town's 8 fps beat (src/data/world/ambient-life.js LIFE_BEAT_FPS),
// the Great Hearth fire's own rate, so a frame where several loops turn is one paint, not several
// (the World paints only when its picture changes: tests/perf-budget.mjs).
// The frames are data and a seeded generator; nothing is read from a shipped file, so this script
// fixes the output.
//
//   node tools/world-art/town-life.mjs            write art/world/townlife/<id>.{png,json}
//   node tools/world-art/town-life.mjs --check    exit 1 when a written source differs from this script
//   node tools/world-art/town-life.mjs --out <d>  write the sources to a folder instead (a preview)
// Then: node tools/world-art/build.mjs --set townlife
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImage, decodePNG, encodePNG, pixelHash } from './png.mjs';
import { LIFE_BEAT_FPS } from '../../src/data/world/ambient-life.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'art', 'world', 'townlife');

/* Key -> palette colour (hr-world-56-v2): steel for smoke, torch and blood for sparks, mithril for water light. */
export const INK = Object.freeze({
  lit: '#e6dcbc', body: '#c4ccd2', shade: '#8a9aa8',
  hot: '#ffd36a', warm: '#f2a03a', cool: '#c23a2a',
  a: '#86b4b4', b: '#c8e6e0', w: '#e6dcbc',
});

/* a seeded stream (mulberry32): the same smoke every run */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* 4x4 ordered dither thresholds (/16) */
const BAYER = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/* the light from the upper left and a little in front: |(-1, -1, 1.2)| */
const LIGHT_N = Math.hypot(1, 1, 1.2);

/** A blank frame of keys. */
const blank = (w, h) => Array.from({ length: h }, () => new Array(w).fill(null));

/**
 * SMOKE: puffs born every `every` frames of an `n`-frame loop, each living `life` frames (a puff is drawn at every age it
 * has in this frame, its births wrapped round the loop, so the loop has no seam). A puff is a cauliflower: a core and two
 * or three lobes round it, turning slowly as it climbs, each lobe lit as a ball from the upper left (warm bone where the
 * sun strikes, cool steel in the body and the shade); smoke that has begun to break up is never in shade.
 *   rise   px it climbs over its life, fast out of the mouth and slowing (1 - (1 - t)^ease)
 *   drift  px it leans east by the end of its life (t^2: the breeze takes it as it slows)
 *   r0 r1  its radius at birth and at the end (it swells fastest early: t^0.75)
 *   thinFrom  the age (0..1) it starts to break up into the dither
 */
function smoke(o) {
  const rnd = rng(o.seed);
  const puffs = [];
  for (let b = 0; b < o.n; b += o.every) {
    const lobes = [];
    for (let i = 0, k = 2 + Math.floor(rnd() * 2); i < k; i++) {
      const ang = rnd() * Math.PI * 2;
      lobes.push({ ox: Math.cos(ang) * 0.6, oy: Math.sin(ang) * 0.5, rk: 0.5 + rnd() * 0.3 });
    }
    puffs.push({ b, jx: (rnd() - 0.5) * o.jitter, jr: (rnd() - 0.5) * o.lumpy, ph: rnd() * Math.PI * 2, spin: (rnd() - 0.5) * 0.5, lobes });
  }
  const frames = [];
  for (let f = 0; f < o.n; f++) {
    const px = blank(o.w, o.h);
    const live = [];
    for (const p of puffs) for (let k = -3; k <= 3; k++) { const a = f - p.b + k * o.n; if (a >= 0 && a < o.life) live.push([p, a]); }
    live.sort((A, B) => B[1] - A[1]);   // the oldest first: the newest, nearest the mouth, lies over it
    for (const [p, a] of live) {
      const t = a / o.life;
      const cy = o.ay - o.rise * (1 - Math.pow(1 - t, o.ease));
      const cx = o.ax + p.jx * t + o.drift * t * t + o.sway * Math.sin(p.ph + t * 4) * t;
      const r = Math.max(1, o.r0 + (o.r1 - o.r0) * Math.pow(t, 0.75) + p.jr * t);
      const thin = clamp((t - o.thinFrom) / (1 - o.thinFrom), 0, 1);
      const c = Math.cos(p.spin * a), sn = Math.sin(p.spin * a);
      const discs = [[cx, cy, r * 0.72]].concat(p.lobes.map((l) => [cx + (l.ox * c - l.oy * sn) * r, cy + (l.ox * sn + l.oy * c) * r, l.rk * r]).sort((A, B) => A[1] - B[1]));
      const rx = Math.round(cx), ry = Math.round(cy), R = r * 1.5;
      for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          if (x < 0 || y < 0 || x >= o.w || y >= o.h) continue;
          /* the front-most lobe over this pixel (the core, then the lobes high to low) lights it as a ball */
          let hit = null;
          for (const q of discs) if ((x + 0.5 - q[0]) ** 2 + (y + 0.5 - q[1]) ** 2 <= q[2] * q[2]) hit = q;
          if (!hit) continue;
          if (BAYER[((y - ry) & 3) * 4 + ((x - rx) & 3)] / 16 < thin) continue;
          const nx = (x + 0.5 - hit[0]) / hit[2], ny = (y + 0.5 - hit[1]) / hit[2], nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const v = (-nx - ny + 1.2 * nz) / LIGHT_N;
          px[y][x] = v > 0.8 ? 'lit' : v < 0.3 && thin === 0 ? 'shade' : 'body';
        }
      }
    }
    frames.push(px);
  }
  return frames;
}

/**
 * EMBERS: `count` sparks over an `n`-frame loop, each lifting from somewhere across the fire's mouth (`spread` px wide),
 * wobbling, hot for its first third, then warm, then cooling red, then gone. A hot spark is two pixels tall (its streak).
 */
function embers(o) {
  const rnd = rng(o.seed);
  const sparks = [];
  for (let i = 0; i < o.count; i++) {
    sparks.push({ b: Math.floor((i * o.n) / o.count + rnd() * 2) % o.n, life: o.lifeMin + Math.floor(rnd() * (o.lifeMax - o.lifeMin + 1)),
      x0: o.ax + (rnd() - 0.5) * o.spread, vx: (rnd() - 0.5) * 0.9, vy: o.climb * (0.75 + rnd() * 0.5), ph: rnd() * Math.PI * 2 });
  }
  const frames = [];
  for (let f = 0; f < o.n; f++) {
    const px = blank(o.w, o.h);
    for (const s of sparks) {
      for (let k = -2; k <= 2; k++) {
        const a = f - s.b + k * o.n;
        if (a < 0 || a >= s.life) continue;
        const t = a / s.life;
        const x = Math.round(s.x0 + s.vx * a + Math.sin(s.ph + a * 0.9) * 1.2);
        const y = Math.round(o.ay - s.vy * a);
        const key = t < 0.34 ? 'hot' : t < 0.7 ? 'warm' : 'cool';
        if (x >= 0 && x < o.w && y >= 0 && y < o.h) px[y][x] = key;
        if (key === 'hot' && y + 1 < o.h && x >= 0 && x < o.w) px[y + 1][x] = 'warm';
      }
    }
    frames.push(px);
  }
  return frames;
}

/* GLINTS: drawn by hand, a row per frame line ('.' empty, a the wave marks' mithril, b one step brighter, w the sun's own
   white-hot peak in bone), 8 frames at half the beat (2 s a loop), lit five or six of them; each glint on the water starts at
   its own frame (src/world/core/ambient.js), so the water twinkles rather than flashes. */
const rows = (lines) => lines.map((l) => [...l].map((c) => (c === '.' ? null : c)));
const GLINTS = Object.freeze({
  /* a: the sun catching a wave, a spark that swells and breaks; b: a crest of light riding a wave east */
  water_glint_a: [
    ['...........', '...........', '....bb.....'],
    ['...........', '....bw.....', '..abwwba...'],
    ['....w......', '..bwwwwb...', '.abbwwbba..'],
    ['...........', '...bwwb....', '..ab..bba..'],
    ['...........', '....b......', '.a.....a...'],
    ['...........', '...........', '...........'],
    ['...........', '...........', '...........'],
    ['...........', '...........', '...........'],
  ].map(rows),
  water_glint_b: [
    ['.............', '..ab.........'],
    ['.............', '..abbw.......'],
    ['....w........', '...abwwb.....'],
    ['.............', '....abwwba...'],
    ['.............', '......abwba..'],
    ['.............', '........aba..'],
    ['.............', '..........a..'],
    ['.............', '.............'],
  ].map(rows),
});

/* THE CLIPS: frame size, anchor (the point the map places: a chimney's mouth, the fire's mouth, a wave's centre), class and
   rate. A smoke frame's anchor sits left of centre: the breeze carries the column east. */
export const CLIPS = Object.freeze({
  chimney_smoke: { cls: 'plume', fps: LIFE_BEAT_FPS, draw: () => smoke({ w: 34, h: 48, ax: 10, ay: 44, n: 16, every: 1, life: 16, rise: 38, ease: 1.3, drift: 14, r0: 2.6, r1: 5.8, lumpy: 1.2, jitter: 1.5, sway: 1.2, thinFrom: 0.45, seed: 0x5a0c3 }) },
  hearth_smoke: { cls: 'plume', fps: LIFE_BEAT_FPS, draw: () => smoke({ w: 60, h: 96, ax: 18, ay: 90, n: 24, every: 2, life: 24, rise: 74, ease: 1.3, drift: 24, r0: 4, r1: 10, lumpy: 2, jitter: 3, sway: 2, thinFrom: 0.4, seed: 0x4ea27 }) },
  hearth_embers: { cls: 'vfx', fps: LIFE_BEAT_FPS, draw: () => embers({ w: 40, h: 40, ax: 20, ay: 36, n: 16, count: 7, lifeMin: 5, lifeMax: 8, spread: 22, climb: 3.4, seed: 0xe3be5 }) },
  water_glint_a: { cls: 'glint', fps: LIFE_BEAT_FPS / 2, draw: () => GLINTS.water_glint_a },
  water_glint_b: { cls: 'glint', fps: LIFE_BEAT_FPS / 2, draw: () => GLINTS.water_glint_b },
});
const ANCHORS = Object.freeze({ chimney_smoke: [10, 44], hearth_smoke: [18, 90], hearth_embers: [20, 36], water_glint_a: [5, 2], water_glint_b: [6, 1] });

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** One clip's frames, left to right, as one sheet row. */
export function sheetOf(frames) {
  const w = frames[0][0].length, h = frames[0].length;
  const img = createImage(w * frames.length, h);
  frames.forEach((px, f) => px.forEach((line, y) => line.forEach((k, x) => {
    if (!k) return;
    const i = (y * img.width + f * w + x) * 4;
    const [r, g, b] = rgb(INK[k]);
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  })));
  return img;
}

function sidecarOf(id, frames) {
  const c = CLIPS[id];
  return { id, class: c.cls, style: 's1', drawn: 'tools/world-art/town-life.mjs', material: 'native', source: id + '.png',
    frame: [frames[0][0].length, frames[0].length], anchor_px: ANCHORS[id], footprint: [1, 1],
    anims: [{ name: 'idle', fps: c.fps, loop: true, dirs: { s: frames.length } }],
    notes: 'Havora\'s ambient life, drawn by tools/world-art/town-life.mjs: hard pixels, palette colours, no generation. Placed by src/world/core/ambient.js from src/data/world/ambient-life.js.' };
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : DIR;
  mkdirSync(out, { recursive: true });
  let stale = 0;
  for (const id of Object.keys(CLIPS)) {
    const frames = CLIPS[id].draw();
    const img = sheetOf(frames);
    if (check) {
      let have = null;
      try { have = pixelHash(decodePNG(readFileSync(join(out, id + '.png')))); } catch { /* absent */ }
      let side = null;
      /* the sidecar by value (a checkout may turn its line ends) */
      try { side = JSON.stringify(JSON.parse(readFileSync(join(out, id + '.json'), 'utf8'))); } catch { /* absent */ }
      if (have !== pixelHash(img) || side !== JSON.stringify(sidecarOf(id, frames))) { console.error('stale: ' + id); stale++; }
      continue;
    }
    writeFileSync(join(out, id + '.png'), encodePNG(img));
    writeFileSync(join(out, id + '.json'), JSON.stringify(sidecarOf(id, frames), null, 2) + '\n');
    console.log('wrote ' + id + ' (' + img.width + 'x' + img.height + ', ' + frames.length + ' frames)');
  }
  if (stale) process.exit(1);
  if (check) console.log('town-life --check: the sources match this script');
}

if (isMain(import.meta.url)) main();
