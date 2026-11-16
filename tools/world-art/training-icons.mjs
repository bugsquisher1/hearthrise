#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/training-icons.mjs — INTERIM TRAINING ITEMS: THE PRACTICE WEAPON'S DRAWING WITH ITS SIZE AND BOUND MARKS
// (lane/c-training-gear, 2026-11-14; the training items, src/data/training.js TRAINING_GEAR).
//
// A training item is the Arms Master's practice gear (the designer: "one practice look, bound wood and leather, no glow").
// Until its own four drawings land (an art lane: assets/icons-bundle, the art director's call), each item is the PRACTICE
// piece of its skill (practice_sword, practice_bow, practice_wand, practice_shield) with corner marks baked in, so the bag
// tells the sixteen apart at a glance: one bone pip bottom right for 12 hours, two for 24, and a gold pip top right on the
// Crowns store's bound copy. Every mark is a palette entry (art/world/palette.json hr-world-56-v2) in a 1 px #0b0a0c box,
// binary alpha, 32x32, nothing scaled: tests/pixel-icons.mjs's rules hold.
//
//   node tools/world-art/training-icons.mjs           write assets/icons-bundle/pixel/items/training_*.png
//   node tools/world-art/training-icons.mjs --check   exit 1 when a written icon differs from a fresh one
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { TRAINING_GEAR_ITEMS } from '../../src/data/training.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const K = rgb('#0b0a0c'), BONE = rgb('#e6dcbc'), GOLD = rgb('#e8c547');
/** Each skill's practice piece, whose drawing the item wears. */
export const BASE = Object.freeze({ melee: 'practice_sword', ranged: 'practice_bow', magic: 'practice_wand', defense: 'practice_shield' });

/* A 2x2 pip of colour `c` at (x, y), in a 1 px outline box. */
function pip(img, x, y, c) {
  for (let yy = y - 1; yy <= y + 2; yy++) {
    for (let xx = x - 1; xx <= x + 2; xx++) {
      const i = (yy * img.width + xx) * 4;
      const inner = xx >= x && xx <= x + 1 && yy >= y && yy <= y + 1;
      [img.data[i], img.data[i + 1], img.data[i + 2]] = inner ? c : K;
      img.data[i + 3] = 255;
    }
  }
}

/** The icon of training item `g` ({ skill, hours, bound }). */
export function draw(g) {
  const base = decodePNG(readFileSync(join(DIR, BASE[g.skill] + '.png')));
  const img = { width: base.width, height: base.height, data: Uint8Array.from(base.data) };
  pip(img, 28, 28, BONE);
  if (g.hours >= 24) pip(img, 24, 28, BONE);
  if (g.bound) pip(img, 28, 2, GOLD);
  return img;
}

/** id -> image, the shape tests/pixel-icons.mjs reads. */
export const DRAW = Object.freeze(Object.fromEntries(TRAINING_GEAR_ITEMS.map((g) => [g.id, () => draw(g)])));

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const g of TRAINING_GEAR_ITEMS) {
    const png = encodePNG(draw(g)), file = join(DIR, g.id + '.png');
    if (check) { let cur = null; try { cur = readFileSync(file); } catch { /* missing */ } if (!cur || !cur.equals(png)) { console.error('stale: ' + g.id + '.png'); stale++; } }
    else { writeFileSync(file, png); console.log('wrote ' + g.id + '.png'); }
  }
  if (check) { console.log(stale ? 'training-icons --check: ' + stale + ' stale' : 'training-icons --check: fresh'); process.exit(stale ? 1 : 0); }
}

if (isMain(import.meta.url)) main();
