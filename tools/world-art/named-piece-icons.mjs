#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/named-piece-icons.mjs — THE SIX NAMED PIECES PAST DAWNSTEEL: PLACEHOLDER ICONS, RE-DYED FROM SHIPPED ONES
// (systems, lane/retire-dawnsteel-lines, 2026-11-27; the Art Director judges each and may replace it with bespoke art).
//
// The designer kept six of the staged uniques as named pieces (docs/design/redesign/28-named-pieces.md 2.7), and every ITEMS key needs a
// 32x32 pixel icon (tests/pixel-icons.mjs). Each is the same slot's tier-7 shape the step tiers are drawn from (step-tier-icons.mjs) re-dyed
// by rank into a ramp of the locked palette that reads its rule or its story, never its plain twin's own ramp (the duplicate rule):
//   burnt_crag_leg_plates  the Dawnsteel plate legs in ember (fire turned on the Burnt Crag)
//   limewashed_plate       the Dawnsteel platebody in cerecloth's bone white (a hundred years in the lime)
//   keepers_leg_plates     the Dawnsteel plate legs in eelskin (the Flooded Wing's cold water)
//   paupers_shroud         the Duskweave robe top in wolfram gray (a thin gray burial sheet)
//   watchmans_sword        the Dawnsteel sword in duskweave's night blue (the Watch's night rounds)
//   dunns_mallet           the Dawnsteel warhammer in rowan red (a Keeper's wooden mallet)
// A placeholder, so the drop row's reveal has a legal icon to show; bespoke art replaces it here, never in the PNG.
// pixel-icons.mjs's `drawn` rule holds each file to what this draws: edit this script and rerun it, never the PNG.
//
//   node tools/world-art/named-piece-icons.mjs     write the six PNGs into assets/icons-bundle/pixel/items/
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { encodePNG } from './png.mjs';
import { dye, RAMPS } from './step-tier-icons.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');

/* id -> [the shipped icon its shape is, the ramp its colour is] */
const ROWS = Object.freeze({
  burnt_crag_leg_plates: ['dawn_platelegs', 'ember'],
  limewashed_plate: ['dawn_platebody', 'cerecloth'],
  keepers_leg_plates: ['dawn_platelegs', 'eelskin'],
  paupers_shroud: ['duskweave_body', 'wolfram'],
  watchmans_sword: ['dawn_sword', 'duskweave'],
  dunns_mallet: ['dawn_warhammer', 'rowan'],
});
/** id -> () => the icon. */
export const DRAW = Object.freeze(Object.fromEntries(Object.entries(ROWS).map(([id, [src, ramp]]) => {
  if (!RAMPS[ramp]) throw new Error('named-piece-icons: ' + id + ' names no ramp ' + ramp);
  return [id, () => dye(src, RAMPS[ramp])];
})));

if (isMain(import.meta.url)) {
  for (const [id, fn] of Object.entries(DRAW)) writeFileSync(join(DIR, id + '.png'), encodePNG(fn()));
  console.log('named-piece-icons: wrote ' + Object.keys(DRAW).length + ' icons');
}
