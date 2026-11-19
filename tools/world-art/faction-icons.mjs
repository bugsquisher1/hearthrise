#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/faction-icons.mjs — THE FACTIONS' EIGHT ICONS (lane/b-farm-house-faction-art): the two sides' marks (the First Flame's
// rising flame in antique gold, the Last Ember's glowing coal in deep crimson) and the six pieces standing buys (src/data/factions.js
// FACTION_OUTFITS), as the board's "2026-11-14 The Morrow Hills" §6 describes them.
//
//   node tools/world-art/faction-icons.mjs           write assets/icons-bundle/pixel/factions/<id>.png for every id of FACTION_ART
//   node tools/world-art/faction-icons.mjs --check   exit 1 when a written icon differs from a fresh one; write nothing
//
// EACH ICON IS A PIXELLAB PICK (art/world-src/gen-2026-11-18/faction-icons/picks/<id>.png; the call, the gens and every candidate in
// faction-icons/note.json and candidates-round1.png), finished by the drop icons' own finish and check (import-drop-icons-2026-11-17.mjs
// iconOf: centred on the 32x32 cell, the outline closed in #0b0a0c, palette and binary alpha checked). An id with no pick is an error:
// nothing here is drawn by hand. tests/pixel-icons.mjs re-runs this finish and fails on a file that differs (rule [drawn]).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { iconOf } from './import-drop-icons-2026-11-17.mjs';
import { FACTION_ART, FACTION_DIR } from '../../src/data/item-art.js';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, FACTION_DIR);
export const FACTION_PICKS = join(ROOT, 'art', 'world-src', 'gen-2026-11-18', 'faction-icons', 'picks');

/** One faction id's icon, finished from its pick. Pure (reads the pick). */
export const factionIcon = (id) => iconOf(id, FACTION_PICKS);

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  if (!check) mkdirSync(OUT, { recursive: true });
  for (const id of FACTION_ART) {
    const png = encodePNG(factionIcon(id)), file = join(OUT, id + '.png');
    if (check) { const cur = existsSync(file) ? readFileSync(file) : null; if (!cur || !cur.equals(png)) { console.error('stale: ' + id + '.png'); stale++; } }
    else writeFileSync(file, png);
  }
  const tail = ' (' + FACTION_ART.length + ' faction icons)';
  if (check) { console.log((stale ? 'faction-icons --check: ' + stale + ' stale' : 'faction-icons --check: fresh') + tail); process.exit(stale ? 1 : 0); }
  console.log('faction-icons: wrote' + tail);
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error('faction-icons: ' + (e && e.message || e)); process.exit(2); }
}
