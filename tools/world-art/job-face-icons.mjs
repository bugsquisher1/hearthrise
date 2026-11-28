#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/job-face-icons.mjs — THE JOB SLICE'S NEW GOODS' PLACEHOLDER ICONS, RE-DYED FROM SHIPPED ONES
// (backend-architect, lane/k1-job-slice, 2026-11-26; the Art Director judges each and may replace it with bespoke art).
//
// The job slice makes ten goods items (src/data/items.js: Bronze, Iron, Steel and Mithril Arrowheads, Dawnsteel Tempering Salts and one `imbue_<id>` an imbuement),
// and every ITEMS key needs a 32x32 pixel icon (tests/pixel-icons.mjs). Rather than invent a style, each is a shipped icon re-dyed by rank
// (step-tier-icons.mjs dye: every opaque colour of the source, dark to light, becomes the colour of the same rank in a ramp of the locked
// palette), so it stays on the palette, binary alpha, 32x32:
//   dawn_temper_salts   the Ember Tempering Salts in Dawnsteel's ramp (the next band's kit beside its neighbour)
//   bronze_arrowheads   the Barrow Nail (a metal point) in the Bronze Bar's own colours
//   iron_arrowheads     the same nail in the Iron Bar's colours (band 1's head, lane/designer-kit-band1)
//   steel_ and mithril_arrowheads   the same nail in the Steel and Mithril Bars' colours (bands 2 and 3, lane/kit-bands-2-3)
//   imbue_<id>          its part's icon in its element's ramp: the Fire Ward's Ford Weed and the Fire Edge's rake tine in ember, the Brute
//                       Edge's pike ferrule in wolfram, the Life Leech's hook in drakehide green, the Mana Leech's urn shard in cobalt blue
// pixel-icons.mjs's `drawn` rule holds each file to what this draws: edit this script and rerun it, never the PNG.
//
//   node tools/world-art/job-face-icons.mjs     write the ten PNGs into assets/icons-bundle/pixel/items/
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

const rows = [['dawn_temper_salts', 'ember_temper_salts', () => RAMPS.dawn], ['bronze_arrowheads', 'barrow_nail', () => rampFrom('bronze_bar')],
  ['iron_arrowheads', 'barrow_nail', () => rampFrom('iron_bar')], ['steel_arrowheads', 'barrow_nail', () => rampFrom('steel_bar')],
  ['mithril_arrowheads', 'barrow_nail', () => rampFrom('mithril_bar')]];
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
