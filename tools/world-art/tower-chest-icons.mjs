#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/tower-chest-icons.mjs — THE BURNING TOWER'S ICONS: ITS FOUR KEYS, ITS CINDERS AND ITS 28 WEAPONS (src/data/chests.js
// CHEST_ITEM_ROWS, src/data/tower-weapons.js; lane/a-tower-icons 2026-11-16, after the interim drawings of lane/c-tower-chest).
//
// EACH ICON IS A PIXELLAB PICK (art/world-src/gen-2026-11-16/05-tower-icons/picks/<id>.png; the calls, the gens and every kept or refused
// candidate in 05-note.json): create_1_direction_object on hr-world-56-v2, shipped icons as its style images. Every pick is finished the
// same way, here and nowhere else:
//   1. a 30x30 pick (the batches drawn on a 30 px canvas) is centred on the 32x32 cell, 1 px each side, so its mass fills at most 94%
//      (docs/ART_DIRECTION.md §7); a 32x32 pick is kept where it is
//   2. the outline is closed (the set's 1 px #0b0a0c, 4-neighbour): an edge pixel darker than OUTLINE_LUMA becomes the outline, a
//      lighter one gets the outline on its open side, so no lit pixel meets the slot without one
//   3. checked: 32x32, every opaque pixel on the palette, binary alpha (a pick that fails stops the run)
// A weapon's fittings are its key's metal (Bronze, Silver, Gold, Platinum) and its design says whose it was (tower-weapons.js): the
// Palisade Sword is the night watch's, with his lantern. The keys are one shape per metal, never the Hall Key's ring.
//
// A Tower id with no pick is an error: the interim drawings (a key as the Hall Key in its metal, a weapon as its standard twin with a
// metal pip) are retired.
//
//   node tools/world-art/tower-chest-icons.mjs           write assets/icons-bundle/pixel/items/<id>.png for every Tower id
//   node tools/world-art/tower-chest-icons.mjs --check   exit 1 when a written icon differs from a fresh one
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { inPalette } from './lock.mjs';
import { CHEST_KEYS, CINDERS } from '../../src/data/chests.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
export const PICKS = join(ROOT, 'art', 'world-src', 'gen-2026-11-16', '05-tower-icons', 'picks');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const K = rgb('#0b0a0c');
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/* ── THE PICKS ── */
/** An edge pixel under this luma is an outline the generator drew in a dark ramp step (#2a1c14, #4a2e18, #3a3a3e): it becomes #0b0a0c. */
export const OUTLINE_LUMA = 60;

/** `img` centred on a 32x32 cell, its outline closed. Pure. */
export function finish(img) {
  if (img.width > 32 || img.height > 32) throw new Error('a pick is ' + img.width + 'x' + img.height + ', over 32x32');
  const out = createImage(32, 32);
  blit(out, img, 0, 0, img.width, img.height, (32 - img.width) >> 1, (32 - img.height) >> 1);
  const at = (x, y) => (y * 32 + x) * 4;
  const on = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 32 && out.data[at(x, y) + 3] > 0;
  const isK = (i) => out.data[i] === K[0] && out.data[i + 1] === K[1] && out.data[i + 2] === K[2];
  const add = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = at(x, y);
      if (!on(x, y) || isK(i)) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !on(x + dx, y + dy));
      if (!open.length) continue;
      if (luma(out.data[i], out.data[i + 1], out.data[i + 2]) < OUTLINE_LUMA) { out.data.set(K, i); continue; }
      for (const [dx, dy] of open) if (x + dx >= 0 && y + dy >= 0 && x + dx < 32 && y + dy < 32) add.push(at(x + dx, y + dy));
    }
  }
  for (const i of add) { out.data.set(K, i); out.data[i + 3] = 255; }
  return out;
}

/** THE ONE FREE EDIT BY ID, after the finish: the Old Ash Rake's head came back in the darkest iron, stone and shadow steps and sank into
    the bag's dark slot, so those colours (only its head carries them) are lifted two steps onto the iron ramp: a value lift up a ramp,
    never a hue jump (docs/ART_DIRECTION.md §4). */
export const LIFT = Object.freeze({
  old_ash_rake: Object.freeze({ '#231d1f': '#4a4d54', '#2f2723': '#4a4d54', '#2c2e33': '#4a4d54', '#3a3a3e': '#6e727a', '#4f4e52': '#969aa1' }),
});

/** A pick's file, finished; throws when the result is off the palette or not binary alpha. */
function pickOf(id) {
  const img = finish(decodePNG(readFileSync(join(PICKS, id + '.png'))));
  const lift = LIFT[id] ? new Map(Object.entries(LIFT[id]).map(([a, b]) => [rgb(a).join(), rgb(b)])) : null;
  if (lift) for (let i = 0; i < img.data.length; i += 4) { const to = img.data[i + 3] && lift.get([img.data[i], img.data[i + 1], img.data[i + 2]].join()); if (to) img.data.set(to, i); }
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a && a !== 255) throw new Error(id + ': partial alpha');
    if (a && !inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error(id + ': off the palette at ' + ((i / 4) % 32) + ',' + Math.floor(i / 128));
  }
  return img;
}

/** Every Tower id: the four keys, the Cinders and each key's seven weapons (chests.js CHEST_KEYS, tower-weapons.js). */
export const TOWER_ICON_IDS = Object.freeze([...CHEST_KEYS.map((k) => k.item), CINDERS, ...CHEST_KEYS.flatMap((k) => Object.values(k.weapons))]);

/** id -> a function drawing its icon from its pick (a Tower id with no pick stops the run). */
export const DRAW = Object.freeze(Object.fromEntries(TOWER_ICON_IDS.map((id) => [id, () => {
  if (!existsSync(join(PICKS, id + '.png'))) throw new Error(id + ': no pick in ' + PICKS);
  return pickOf(id);
}])));

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [id, draw] of Object.entries(DRAW)) {
    const png = encodePNG(draw()), file = join(DIR, id + '.png');
    if (check) { let cur = null; try { cur = readFileSync(file); } catch { /* missing */ } if (!cur || !cur.equals(png)) { console.error('stale: ' + id + '.png'); stale++; } }
    else { writeFileSync(file, png); console.log('wrote ' + id + '.png'); }
  }
  const tail = ' (' + Object.keys(DRAW).length + ' Tower icons)';
  if (check) { console.log((stale ? 'tower-chest-icons --check: ' + stale + ' stale' : 'tower-chest-icons --check: fresh') + tail); process.exit(stale ? 1 : 0); }
  console.log('tower-chest-icons: wrote' + tail);
}

if (isMain(import.meta.url)) main();
