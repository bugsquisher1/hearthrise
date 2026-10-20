#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/caster-icons.mjs — THE MAGE'S WANDS AND SPELLBOOKS, FROM SHIPPED ART
// (lane a-client-guards-green, 2026-10-20; Art Director to judge and replace with
// bespoke art).
//
// Mage = wand + spellbook (Tyler 10-19, src/data/gear-tiers.js) added twelve items
// with no icon, so tests/pixel-icons.mjs went red. Rather than invent a style:
//   wand       the same tier's staff, halved by nearest-neighbour (every 2x2 block
//              keeps its top-left pixel, an integer scale) and set at the centre:
//              a short stick with the staff's own head.
//   spellbook  field_cookbook.png with its leather cover (the earth/bronze steps)
//              re-dyed, dark to light, to the tier's own palette ramp.
// Output stays inside the locked palette by construction (only palette pixels are
// copied or chosen), with binary alpha.
//
//   node tools/world-art/caster-icons.mjs     write the twelve PNGs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const hex = (d, i) => '#' + [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const read = (id) => decodePNG(readFileSync(join(DIR, id + '.png')));
const write = (id, img) => writeFileSync(join(DIR, id + '.png'), encodePNG(img));

/** wand id -> the staff it is cut from. */
const WANDS = Object.freeze({
  apprentice_wand: 'apprentice_staff', oak_wand: 'oak_staff', willow_wand: 'willow_staff',
  maple_wand: 'maple_staff', yew_wand: 'yew_staff', runewood_wand: 'runewood_staff',
});
/* The cookbook's cover leather, dark -> light. */
const COVER = ['#2a1c14', '#3d2a1d', '#4a2e18', '#553a26', '#6e4c30', '#7a4f26', '#8a6440'];
/** book id -> the cover ramp (palette colours, dark -> light; cycled over COVER). */
const BOOKS = Object.freeze({
  apprentice_primer: ['#3e1216', '#3e1216', '#5e1a1f', '#5e1a1f', '#8e1f1f', '#8e1f1f', '#c23a2a'],
  oak_spellbook: ['#3d2a1d', '#553a26', '#6e4c30', '#8a6440', '#a88457', '#a88457', '#c49a5c'],
  willow_spellbook: ['#16241a', '#1f3322', '#1f3322', '#2c4a2c', '#3d6234', '#557a3e', '#73944c'],
  maple_spellbook: ['#4a2e18', '#7a4f26', '#7a4f26', '#a8743a', '#a8743a', '#cfa25c', '#f2a03a'],
  yew_spellbook: ['#1a2c44', '#1a2c44', '#2b4a6a', '#2b4a6a', '#4fa8e8', '#4fa8e8', '#a8e4ff'],
  runewood_codex: ['#2e4a52', '#2e4a52', '#4f7a80', '#4f7a80', '#86b4b4', '#86b4b4', '#c8e6e0'],
});

function wand(staff) {
  const src = read(staff), out = createImage(32, 32);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const s = ((y * 2) * 32 + x * 2) * 4, d = ((y + 8) * 32 + x + 8) * 4;
    for (let k = 0; k < 4; k++) out.data[d + k] = src.data[s + k];
  }
  return out;
}

function book(ramp) {
  const img = read('field_cookbook');
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const at = COVER.indexOf(hex(img.data, i));
    if (at < 0) continue;
    const [r, g, b] = rgb(ramp[at]);
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
  }
  return img;
}

for (const [id, staff] of Object.entries(WANDS)) write(id, wand(staff));
for (const [id, ramp] of Object.entries(BOOKS)) write(id, book(ramp));
console.log('caster-icons: wrote ' + (Object.keys(WANDS).length + Object.keys(BOOKS).length) + ' icons');
