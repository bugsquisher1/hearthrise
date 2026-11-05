#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/round-fireworks.mjs — THE ROUND'S FIREWORKS AND THE POWDER'S PINCH, DRAWN BY SCRIPT
// (lane/c-town-shows, 2026-11-04; the designer's gold sinks section: "One 64 x 64, 8-frame burst by script, 3 recolors"; "one 16 px
// fuel_powder by script"; 0 generations, $0).
//
// fx_round_<color>: one deterministic burst on a 64 x 64 frame, whole pixels and binary alpha: a bright core, then rays that fly out, droop and
// burn down to embers. Only the ramp differs between the three, so the set can't drift apart. fuel_powder: the pinch a hero throws on the fire, on
// the world chunks' 16 px cell (the powder's own color is the fire's, so the pinch is plain).
// Output: art/world/common/<id>.png + its sidecar, built into atlas-common by tools/world-art/build.mjs.
//
//   node tools/world-art/round-fireworks.mjs          write the sources and sidecars
//   node tools/world-art/round-fireworks.mjs --check  exit 1 when a written source differs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, pixelHash } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'art', 'world', 'common');
const FRAME = 64, FRAMES = 8;
/* Palette colors only (art/world/palette.json): dim ember, trail, head, core. */
export const BURSTS = Object.freeze({
  gold: Object.freeze(['#7a4f26', '#f2a03a', '#ffd36a', '#e6dcbc']),
  cinder: Object.freeze(['#5e1a1f', '#c23a2a', '#f2a03a', '#ffd36a']),
  frost: Object.freeze(['#2b4a6a', '#4fa8e8', '#a8e4ff', '#e6dcbc']),
});
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** One burst, FRAMES frames left to right. Pure: the same ramp always draws the same pixels. */
export function drawBurst(ramp) {
  const data = new Uint8Array(FRAME * FRAMES * FRAME * 4);
  const put = (f, x, y, hex) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= FRAME || py >= FRAME) return;
    const i = (py * FRAME * FRAMES + f * FRAME + px) * 4;
    const [r, g, b] = rgb(hex);
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  };
  const c = FRAME / 2 - 1;
  /* a head is a 2 px square, so a burst reads at a town's x2 from across the square */
  const blob = (f, x, y, hex) => { put(f, x, y, hex); put(f, x + 1, y, hex); put(f, x, y + 1, hex); put(f, x + 1, y + 1, hex); };
  /* how far the rays have flown, per frame: fast, then hanging */
  const reach = [4, 11, 17, 22, 25, 27, 28, 29];
  const RAYS = 20;
  for (let f = 0; f < FRAMES; f++) {
    if (f < 3) {
      /* the core: a hot star, gone by the fourth frame */
      const arm = [2, 5, 3][f];
      for (let k = -arm; k <= arm; k++) { put(f, c + k, c, ramp[3]); put(f, c + 1 + k, c + 1, ramp[3]); put(f, c, c + k, ramp[3]); put(f, c + 1, c + 1 + k, ramp[3]); }
      if (f === 1) for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) blob(f, c + dx, c + dy, ramp[2]);
    }
    for (let i = 0; i < RAYS; i++) {
      /* every other ray runs shorter, so the ring isn't a perfect circle */
      const long = i % 2 === 0 ? 1 : 0.72;
      const a = (i / RAYS) * Math.PI * 2 + 0.11;
      const droop = f >= 4 ? (f - 3) * (f - 3) * 0.55 : 0;
      const at = (back) => {
        const r = (reach[f] - back) * long;
        return [c + Math.cos(a) * r, c + Math.sin(a) * r + droop];
      };
      if (f >= 6 && i % 2 === 1) continue;   // the short rays are out first
      const head = f >= 6 ? ramp[0] : f >= 5 ? ramp[1] : ramp[2];
      const [hx, hy] = at(0);
      if (f <= 5) blob(f, hx, hy, head); else put(f, hx, hy, head);
      /* the streak behind it: long while it flies, gone as it hangs */
      const streak = [0, 5, 7, 7, 5, 3, 0, 0][f];
      for (let b = 2; b <= streak; b++) {
        const [tx, ty] = at(b);
        put(f, tx, ty, b <= streak / 2 ? ramp[1] : ramp[0]);
      }
    }
  }
  return { width: FRAME * FRAMES, height: FRAME, data };
}

/* The pinch: a little rolled twist of paper, its mouth open on the powder. 16 x 16, on the world chunks' scale. */
const PINCH = [
  '................',
  '................',
  '................',
  '................',
  '......cdd.......',
  '.....cbaad......',
  '.....baabb......',
  '.....dbbbc......',
  '......dcc.......',
  '......cdb.......',
  '.....cddbb......',
  '....cdeeddb.....',
  '....cdeedcb.....',
  '.....bccbb......',
  '......bbb.......',
  '................',
];
const PINCH_INK = Object.freeze({ a: '#e6dcbc', b: '#553a26', c: '#6e4c30', d: '#a88457', e: '#c9bfa0' });
export function drawPinch() {
  const data = new Uint8Array(16 * 16 * 4);
  PINCH.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const i = (y * 16 + x) * 4;
    const [r, g, b] = rgb(PINCH_INK[ch]);
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }));
  return { width: 16, height: 16, data };
}

const burstSide = (id, color) => ({
  id, class: 'vfx', style: 's1', material: 'light', source: id + '.png', frame: [FRAME, FRAME], anchor_px: [FRAME / 2 - 1, FRAME / 2 - 1], footprint: [1, 1],
  anims: [{ name: 'play', fps: 12, loop: false, dirs: { s: FRAMES } }],
  pixellab: { tool: 'script', script: 'tools/world-art/round-fireworks.mjs', cost: '0' },
  notes: 'THE ROUND: one firework over Hearth Square, ' + color + ' ramp. Drawn by tools/world-art/round-fireworks.mjs; no generation.',
});
const PINCH_SIDE = {
  id: 'fuel_powder', class: 'loot', style: 's1', material: 'native', source: 'fuel_powder.png', frame: [16, 16], anchor_px: [8, 15], footprint: [1, 1],
  anims: [{ name: 'idle', fps: 0, loop: false, dirs: { s: 1 } }],
  pixellab: { tool: 'script', script: 'tools/world-art/round-fireworks.mjs', cost: '0' },
  notes: 'THE BURN, for a bought powder: the pinch the hero throws on the Great Hearth. Drawn by tools/world-art/round-fireworks.mjs; no generation.',
};

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  const one = (id, img, side) => {
    if (check) {
      let have = null;
      try { have = pixelHash(decodePNG(readFileSync(join(DIR, id + '.png')))); } catch { /* absent */ }
      if (have !== pixelHash(img)) { console.error('stale: ' + id); stale++; }
      return;
    }
    writeFileSync(join(DIR, id + '.png'), encodePNG(img));
    writeFileSync(join(DIR, id + '.json'), JSON.stringify(side, null, 2) + '\n');
    console.log('wrote ' + id);
  };
  for (const [color, ramp] of Object.entries(BURSTS)) one('fx_round_' + color, drawBurst(ramp), burstSide('fx_round_' + color, color));
  one('fuel_powder', drawPinch(), PINCH_SIDE);
  if (check && stale) process.exit(1);
  if (check) console.log('round-fireworks --check: every source matches its script');
}

main();
