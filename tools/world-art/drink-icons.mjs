#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/drink-icons.mjs — THE SIX DRINKS' ICONS, FROM THE ONE ELIXIR
// (lane S2, 2026-10-18; Art Director to judge and replace with bespoke art).
//
// The drinks became items (src/data/drinks.js), and every item needs a 32x32,
// palette-locked, binary-alpha icon (tests/pixel-icons.mjs). Rather than invent
// a style, this takes the shipped moonbloom_elixir.png (a bottle in the world's
// own hand) and re-pours it: every pixel of the elixir's blue liquid (the water,
// frost and mithril steps, dark to light) is
// mapped to the same step of the drink's own four palette colours (turnip
// stone-bone, carrot bronze-torch, tomato blood, pumpkin earth-bronze, goldenroot
// gold, emberfruit blood-torch). Glass, cork and outline are untouched, so the six read as one set
// with the elixir. Output stays inside the locked palette by construction.
//
//   node tools/world-art/drink-icons.mjs           write the six PNGs
//   node tools/world-art/drink-icons.mjs --report  print the elixir's colours
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const PAL = JSON.parse(readFileSync(join(ROOT, 'art', 'world', 'palette.json'), 'utf8')).ramps;
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/* The elixir's liquid: the colours of these ramps (dark -> light) are re-poured. */
export const LIQUID_RAMPS = Object.freeze(['water', 'frost', 'mithril']);
/* Each drink's liquid, as palette colours dark -> light (cycled to the elixir's steps). */
export const POURS = Object.freeze({
  turnip_juice: ['#8a867d', '#aaa49a', '#c9bfa0', '#e6dcbc'],
  carrot_juice: ['#7a4f26', '#a8743a', '#f2a03a', '#ffd36a'],
  tomato_juice: ['#3e1216', '#8e1f1f', '#c23a2a', '#f2a03a'],
  pumpkin_cider: ['#553a26', '#a8743a', '#cfa25c', '#ffd36a'],
  goldenroot_tea: ['#6e4c30', '#a88457', '#e8c547', '#ffd36a'],
  emberfruit_cordial: ['#5e1a1f', '#8e1f1f', '#f2a03a', '#ffd36a'],
});

function main() {
  const src = decodePNG(readFileSync(join(DIR, 'moonbloom_elixir.png')));
  const counts = new Map();
  for (let i = 0; i < src.data.length; i += 4) if (src.data[i + 3]) { const h = hex(src.data[i], src.data[i + 1], src.data[i + 2]); counts.set(h, (counts.get(h) || 0) + 1); }
  if (process.argv.includes('--report')) { console.log([...counts].sort((a, b) => b[1] - a[1])); return; }
  /* The liquid steps present in the elixir, in ramp order (dark -> light). */
  const lum = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const steps = LIQUID_RAMPS.flatMap((r) => PAL[r]).filter((h) => counts.has(h)).sort((a, b) => lum(a) - lum(b));
  if (!steps.length) throw new Error('the elixir holds none of the liquid ramps ' + LIQUID_RAMPS.join(', '));
  for (const [id, pour] of Object.entries(POURS)) {
    const map = new Map(steps.map((h, i) => [h, rgb(pour[Math.min(pour.length - 1, Math.floor(i * pour.length / steps.length))])]));
    const out = { width: src.width, height: src.height, data: Uint8Array.from(src.data) };
    for (let i = 0; i < out.data.length; i += 4) {
      if (!out.data[i + 3]) continue;
      const to = map.get(hex(out.data[i], out.data[i + 1], out.data[i + 2]));
      if (to) [out.data[i], out.data[i + 1], out.data[i + 2]] = to;
    }
    writeFileSync(join(DIR, id + '.png'), encodePNG(out));
    console.log('wrote ' + id + '.png (' + steps.length + ' liquid steps re-poured)');
  }
}

main();
