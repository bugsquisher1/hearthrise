#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/pickaxe-icons.mjs — INTERIM PICKAXES: iron_pickaxe's DRAWING IN EACH TIER'S METAL
// (lane a-pickaxe-icons, 2026-11-13; Andy: "steel and mithril pickaxes just look like axes").
//
// The batch-drawn steel, mithril and ember pickaxes read as axes (one flared blade on one side of the
// haft). The iron pickaxe is a real pickaxe: a long curved head with a point on each side of the haft.
// Until a proper drawing lands (PICKAXE_REGENERATE in src/data/item-art.js, the 2026-11-14 batch), each
// wrong tier is the IRON PICKAXE'S PIXELS with only its head metal re-dyed onto the tier's ramp,
// taken from the tier's own axe icon so the pair still matches. The handle, the outline and every
// position stay as drawn, so the grid and the palette lock hold and nothing is scaled.
//
//   node tools/world-art/pickaxe-icons.mjs           write steel, mithril and ember pickaxes
//   node tools/world-art/pickaxe-icons.mjs --check   exit 1 when a written icon differs from a fresh one
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (d, i) => [0, 1, 2].map((k) => d[i + k].toString(16).padStart(2, '0')).join('');

/** iron_pickaxe's head metal, dark to light (level 0..4). Everything else (handle, outline) is kept. */
const IRON_LEVEL = Object.freeze({ '2c2e33': 0, '3a3a3e': 1, '4a4d54': 1, '4f4e52': 1, '6a6865': 2, '6e727a': 2, '969aa1': 3, '8a867d': 4 });

/** Each re-dyed tier's head ramp, from the tier's own axe icon. */
export const TIERS = Object.freeze({
  steel_pickaxe: ['#2c2e33', '#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2'],
  mithril_pickaxe: ['#17141a', '#2e4a52', '#4f7a80', '#86b4b4', '#c8e6e0'],
  // ember: the iron-dark head with the forge's reds in it (the ember axe's c23a2a, 8e1f1f, f2a03a)
  ember_pickaxe: ['#17141a', '#2c2e33', '#4a4d54', '#6e727a', '#969aa1'],
});
const EMBER_SPECKS = Object.freeze({ 1: rgb('#8e1f1f'), 2: rgb('#c23a2a'), 4: rgb('#f2a03a') });

/** iron_pickaxe re-dyed to `id`'s ramp. */
export function redye(id, iron = decodePNG(readFileSync(join(DIR, 'iron_pickaxe.png')))) {
  const ramp = TIERS[id].map(rgb);
  const out = { width: iron.width, height: iron.height, data: Uint8Array.from(iron.data) };
  let n = 0;
  for (let p = 0; p < 1024; p++) {
    const i = p * 4;
    if (!out.data[i + 3]) continue;
    const lv = IRON_LEVEL[hex(out.data, i)];
    if (lv === undefined) continue;
    let c = ramp[lv];
    if (id === 'ember_pickaxe' && EMBER_SPECKS[lv] && (n++ % 3 === 0)) c = EMBER_SPECKS[lv];
    [out.data[i], out.data[i + 1], out.data[i + 2]] = c;
  }
  return out;
}

/** id -> image, the shape tests/pixel-icons.mjs `checkDrawn` reads. */
export const DRAW = Object.freeze(Object.fromEntries(Object.keys(TIERS).map((id) => [id, () => redye(id)])));
export const toImage = (img) => img;

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const id of Object.keys(TIERS)) {
    const png = encodePNG(redye(id)), file = join(DIR, id + '.png');
    if (check) { let cur = null; try { cur = readFileSync(file); } catch { /* missing */ } if (!cur || !cur.equals(png)) { console.error('stale: ' + id + '.png'); stale++; } }
    else { writeFileSync(file, png); console.log('wrote ' + id + '.png'); }
  }
  if (check) { console.log(stale ? 'pickaxe-icons --check: ' + stale + ' stale' : 'pickaxe-icons --check: fresh'); process.exit(stale ? 1 : 0); }
}

if (isMain(import.meta.url)) main();
