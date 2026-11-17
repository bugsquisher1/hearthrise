#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/import-drop-icons-2026-11-17.mjs — THE 21 IMBUEMENT DROPS' ICONS (lane/a-catacomb-art): Carter's Rest's five, the Ox Road's
// five, Wyvern Roost's five and the Unmarked Catacombs' six (src/data/grounds/<ground>/pack.js `items`, their words `itemText`).
//
//   node tools/world-art/import-drop-icons-2026-11-17.mjs           write assets/icons-bundle/pixel/items/<id>.png for every id
//   node tools/world-art/import-drop-icons-2026-11-17.mjs --check   exit 1 when a written icon differs from a fresh one; write nothing
//
// EACH ICON IS A PIXELLAB PICK (art/world-src/gen-2026-11-17/drop-icons/picks/<id>.png; the calls, the gens and every kept or refused
// candidate in drop-icons/note.json): create_1_direction_object on a 30 px canvas, the hr-world-56-v2 palette, shipped icons as its style
// images. Every pick is finished the same way (the Tower icons' finish, lane/a-tower-icons):
//   1. the 30x30 pick is centred on the 32x32 cell, 1 px each side, so its mass fills at most 94% (docs/ART_DIRECTION.md §7)
//   2. the outline is closed in the set's 1 px #0b0a0c (4-neighbour): an edge pixel darker than OUTLINE_LUMA becomes the outline, a lighter
//      one gets the outline on its open side, so no lit pixel meets the slot without one
//   3. checked: 32x32, every opaque pixel on the palette, binary alpha (a pick that fails stops the run)
// An id with no pick is an error: nothing here is drawn by hand.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { inPalette } from './lock.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
export const PICKS = join(ROOT, 'art', 'world-src', 'gen-2026-11-17', 'drop-icons', 'picks');

/** The ids, by the ground that drops them. */
export const DROP_ICON_IDS = Object.freeze([
  /* Carter's Rest */ 'pewter_spoon', 'roof_slate', 'stable_bit', 'coal_tongs', 'cellar_tally',
  /* the Ox Road */ 'wagon_pin', 'runners_tin', 'ox_shoe', 'drovers_goad', 'waybill',
  /* Wyvern Roost */ 'eggshell', 'gizzard_stone', 'tail_spur', 'fire_gland', 'stolen_fleece',
  /* the Unmarked Catacombs */ 'owing_tag', 'leech_jaw', 'lime_mortar', 'carters_hook', 'candle_snuffer', 'live_leech',
]);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const K = rgb('#0b0a0c');
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
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

/** One id's icon from its pick, finished; throws when there is no pick, or the result is off the palette or not binary alpha. */
export function iconOf(id, picks = PICKS) {
  const file = join(picks, id + '.png');
  if (!existsSync(file)) throw new Error(id + ': no pick in ' + picks);
  const img = finish(decodePNG(readFileSync(file)));
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a && a !== 255) throw new Error(id + ': partial alpha');
    if (a && !inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) throw new Error(id + ': off the palette at ' + ((i / 4) % 32) + ',' + Math.floor(i / 128));
  }
  return img;
}

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const id of DROP_ICON_IDS) {
    const png = encodePNG(iconOf(id)), file = join(OUT, id + '.png');
    if (check) { const cur = existsSync(file) ? readFileSync(file) : null; if (!cur || !cur.equals(png)) { console.error('stale: ' + id + '.png'); stale++; } }
    else writeFileSync(file, png);
  }
  const tail = ' (' + DROP_ICON_IDS.length + ' drop icons)';
  if (check) { console.log((stale ? 'import-drop-icons --check: ' + stale + ' stale' : 'import-drop-icons --check: fresh') + tail); process.exit(stale ? 1 : 0); }
  console.log('import-drop-icons: wrote' + tail);
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error('import-drop-icons: ' + (e && e.message || e)); process.exit(2); }
}
