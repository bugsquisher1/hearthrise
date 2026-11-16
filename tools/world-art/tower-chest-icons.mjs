#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-chest-icons.mjs — INTERIM ICONS FOR THE BURNING TOWER'S FOUR KEYS, ITS CINDERS AND ITS WEAPONS (lane/c-tower-chest,
// 2026-11-15; src/data/chests.js CHEST_ITEM_ROWS; the weapons lane/d-tower-weapons, src/data/tower-weapons.js).
//
// The chest, its keys and the Cinders are hidden behind the `burning_tower` switch until the Tower's window and art land (the design's
// "Art Director: the one chest on the ledge, the flue room kit, the fire tint, the Tower window, the opening reveal"). Until their own
// drawings land, each key is the Hall Key's drawing (hall_key: a Keeper's key is a key) with its metal's pip baked in top right, and the
// Cinders are the coal lump with a torch-orange pip, the training items' interim rule (tools/world-art/training-icons.mjs). Each tower
// weapon is the drawing of the standard weapon it shares its numbers with (the family's rung at its key's tier) with ITS KEY'S pip, so a
// weapon reads as the one that came out of that lock and never wears its twin's exact bytes. Every mark is
// a palette entry (art/world/palette.json hr-world-56-v2) in a 1 px #0b0a0c box, binary alpha, 32x32, nothing scaled:
// tests/pixel-icons.mjs's rules hold, and no two of the five share bytes.
//
//   node tools/world-art/tower-chest-icons.mjs           write assets/icons-bundle/pixel/items/tower_*.png
//   node tools/world-art/tower-chest-icons.mjs --check   exit 1 when a written icon differs from a fresh one
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { CHEST_KEYS, CINDERS } from '../../src/data/chests.js';
import { WEAPON_FAMILIES } from '../../src/data/gear-tiers.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const K = rgb('#0b0a0c');
/* Each key's metal (palette ramps: bronze, steel, gold, mithril), and the Cinders' ember (torch). */
const PIP = Object.freeze({ bronze: rgb('#cfa25c'), silver: rgb('#c4ccd2'), gold: rgb('#e8c547'), platinum: rgb('#c8e6e0'), cinders: rgb('#f2a03a') });

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

function from(base, c) {
  const b = decodePNG(readFileSync(join(DIR, base + '.png')));
  const img = { width: b.width, height: b.height, data: Uint8Array.from(b.data) };
  pip(img, 28, 2, c);
  return img;
}

/** id -> a function drawing its icon. */
export const DRAW = Object.freeze({
  ...Object.fromEntries(CHEST_KEYS.map((k) => [k.item, () => from('hall_key', PIP[k.id])])),
  [CINDERS]: () => from('coal', PIP.cinders),
  ...Object.fromEntries(CHEST_KEYS.flatMap((k) => Object.entries(k.weapons).map(([fam, id]) =>
    [id, () => from(WEAPON_FAMILIES.find((f) => f.key === fam).ids[k.weaponTier - 1], PIP[k.id])]))),
});

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [id, draw] of Object.entries(DRAW)) {
    const png = encodePNG(draw()), file = join(DIR, id + '.png');
    if (check) { let cur = null; try { cur = readFileSync(file); } catch { /* missing */ } if (!cur || !cur.equals(png)) { console.error('stale: ' + id + '.png'); stale++; } }
    else { writeFileSync(file, png); console.log('wrote ' + id + '.png'); }
  }
  if (check) { console.log(stale ? 'tower-chest-icons --check: ' + stale + ' stale' : 'tower-chest-icons --check: fresh'); process.exit(stale ? 1 : 0); }
}

if (isMain(import.meta.url)) main();
