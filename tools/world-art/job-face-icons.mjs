#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/job-face-icons.mjs — THE JOB SLICE'S NEW GOODS' PLACEHOLDER ICONS, RE-DYED FROM SHIPPED ONES
// (backend-architect, lane/k1-job-slice, 2026-11-26; the Art Director judges each and may replace it with bespoke art).
//
// The job slice makes goods items (src/data/items.js: the arrowheads, Rune, Cobalt and Wolfram Ore, the Cobalt and Wolfram Bars, the Dawnsteel, Cobalt and
// Wolfram Tempering Salts, the Emberforged Whetstone and one `imbue_<id>` an imbuement),
// and every ITEMS key needs a 32x32 pixel icon (tests/pixel-icons.mjs). Rather than invent a style, each is a shipped icon re-dyed by rank
// (step-tier-icons.mjs dye: every opaque colour of the source, dark to light, becomes the colour of the same rank in a ramp of the locked
// palette), so it stays on the palette, binary alpha, 32x32:
//   dawn_temper_salts   the Ember Tempering Salts in Dawnsteel's ramp (the next band's kit beside its neighbour)
//   rune_ore            the Mithril Ore in the Rune Bar's colours (band 4, lane/kit-bands-4-5)
//   ember_whetstone     the Rune Whetstone in the Emberforged Bar's colours (band 5's stone, lane/kit-bands-6-9)
//   cobalt_ and wolfram_  the Dawnstone Ore and the Mithril Bar (cobalt), the Iron Ore and the Rune Bar (wolfram), and the Ember Tempering
//                       Salts, each in its tier's ramp (bands 7 and 8's ore, bar and salts, lane/kit-bands-6-9)
//   (the arrowheads, Dawnsteel's too, wore the Barrow Nail re-dyed until 2026-11-28; tools/world-art/arrowhead-icons.mjs draws them now)
//   imbue_<id>          its part's icon in its element's ramp: the Fire Ward's Ford Weed and the Fire Edge's rake tine in ember, the Brute
//                       Edge's pike ferrule in wolfram, the Life Leech's hook in drakehide green, the Mana Leech's urn shard in cobalt blue
// pixel-icons.mjs's `drawn` rule holds each file to what this draws: edit this script and rerun it, never the PNG.
//
//   node tools/world-art/job-face-icons.mjs     write its PNGs into assets/icons-bundle/pixel/items/
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG } from './png.mjs';
import { dye, RAMPS } from './step-tier-icons.mjs';
import { IMBUE_JOBS } from '../../src/data/trades.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

/** A shipped icon's own opaque colours as a ramp (hex), so a re-dye into it is on the palette by construction. */
function rampFrom(id) {
  const img = decodePNG(readFileSync(join(DIR, id + '.png')));
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) s.add('#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join(''));
  return [...s];
}

/* each imbuement's element ramp (src/data/imbue-rules.js: two fire, one brute, a life and a mana leech) */
const IMBUE_RAMP = Object.freeze({ fire_ward: 'ember', fire_edge: 'ember', brute_edge: 'wolfram', life_leech: 'drakehide', mana_leech: 'cobalt' });

/* the six arrowheads left for their own drawing (tools/world-art/arrowhead-icons.mjs, Art Director 2026-11-28) */
const rows = [['dawn_temper_salts', 'ember_temper_salts', () => RAMPS.dawn], ['rune_ore', 'mithril_ore', () => rampFrom('rune_bar')],
  /* bands 5, 7 and 8 (lane/kit-bands-6-9, 09 4.16) */
  ['ember_whetstone', 'rune_whetstone', () => rampFrom('ember_bar')],
  ['cobalt_ore', 'dawnstone_ore', () => RAMPS.cobalt], ['cobalt_bar', 'mithril_bar', () => RAMPS.cobalt],
  ['cobalt_temper_salts', 'ember_temper_salts', () => RAMPS.cobalt],
  ['wolfram_ore', 'iron_ore', () => RAMPS.wolfram], ['wolfram_bar', 'rune_bar', () => RAMPS.wolfram],
  ['wolfram_temper_salts', 'ember_temper_salts', () => RAMPS.wolfram]];
for (const j of IMBUE_JOBS) {
  if (!IMBUE_RAMP[j.imbue] || !RAMPS[IMBUE_RAMP[j.imbue]]) throw new Error('job-face-icons: ' + j.imbue + ' has no ramp');
  rows.push([j.face, j.part, () => RAMPS[IMBUE_RAMP[j.imbue]]]);
}
/** id -> () => the icon, for every good the job slice makes an item. */
export const DRAW = Object.freeze(Object.fromEntries(rows.map(([id, src, ramp]) => [id, () => dye(src, ramp())])));

if (isMain(import.meta.url)) {
  for (const [id, fn] of Object.entries(DRAW)) writeFileSync(join(DIR, id + '.png'), encodePNG(fn()));
  console.log('job-face-icons: wrote ' + Object.keys(DRAW).length + ' icons');
}
