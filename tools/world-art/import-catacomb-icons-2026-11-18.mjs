#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/import-catacomb-icons-2026-11-18.mjs — THE UNMARKED CATACOMBS' 20 ICONS (lane/a-catacomb-icons): the eight wing keys
// (src/data/chests.js CATACOMB_KEYS) and the twelve Bronze and Silver pieces (src/data/catacomb-armor.js
// CATACOMB_ARMOR_SHIPPED). Until these landed, each wore its twin's drawing (the Tower key of its metal, the standard helm or boots).
//
//   node tools/world-art/import-catacomb-icons-2026-11-18.mjs           write assets/icons-bundle/pixel/items/<id>.png for every id
//   node tools/world-art/import-catacomb-icons-2026-11-18.mjs --check   exit 1 when a written icon differs from a fresh one; write nothing
//
// EACH ICON IS A PIXELLAB PICK (art/world-src/gen-2026-11-18/catacomb-icons/picks/<id>.png; the calls, the gens and every kept or
// refused candidate in catacomb-icons/note.json), finished by the drop icons' own finish and check (import-drop-icons-2026-11-17.mjs
// iconOf: centred on the 32x32 cell, the outline closed in #0b0a0c, palette and binary alpha checked). An id with no pick is an error:
// nothing here is drawn by hand.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { iconOf } from './import-drop-icons-2026-11-17.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const PICKS = join(ROOT, 'art', 'world-src', 'gen-2026-11-18', 'catacomb-icons', 'picks');

/** The ids: each wing's keys up its four tiers, then the pieces by tier, helmets before boots, plate, leather, cloth. */
const CATACOMB_ICON_IDS = Object.freeze([
  /* the Flooded Wing */ 'waterlogged_key_bronze', 'waterlogged_key_silver', 'waterlogged_key_gold', 'waterlogged_key_platinum',
  /* the Bone Wing */ 'bone_key_bronze', 'bone_key_silver', 'bone_key_gold', 'bone_key_platinum',
  /* Bronze */ 'tinkers_kettle', 'ratters_hood', 'midwifes_hat', 'hodmans_boots', 'tanners_boots', 'washerwomans_slippers',
  /* Silver */ 'cranemans_helm', 'fletchers_hood', 'bakers_cap', 'dockhands_boots', 'sewermans_boots', 'fishwifes_slippers',
]);
/* THE GOLD AND PLATINUM TWELVE WAIT (CATACOMB_ARMOR_NOW ships Bronze and Silver only): their picks are already chosen, in
   art/world-src/gen-2026-11-18/catacomb-icons/picks-later/<id>.png (note.json "later"). When their rows ship, each id joins this list
   and is read from that folder; until then nothing writes them, since an icon for no ITEMS row is a tests/pixel-icons.mjs orphan. */

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const id of CATACOMB_ICON_IDS) {
    const png = encodePNG(iconOf(id, PICKS)), file = join(OUT, id + '.png');
    if (check) { const cur = existsSync(file) ? readFileSync(file) : null; if (!cur || !cur.equals(png)) { console.error('stale: ' + id + '.png'); stale++; } }
    else writeFileSync(file, png);
  }
  const tail = ' (' + CATACOMB_ICON_IDS.length + ' Catacombs icons)';
  if (check) { console.log((stale ? 'import-catacomb-icons --check: ' + stale + ' stale' : 'import-catacomb-icons --check: fresh') + tail); process.exit(stale ? 1 : 0); }
  console.log('import-catacomb-icons: wrote' + tail);
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error('import-catacomb-icons: ' + (e && e.message || e)); process.exit(2); }
}
