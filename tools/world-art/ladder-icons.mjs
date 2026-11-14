#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/ladder-icons.mjs — THE LADDER RUNGS PAST TIER 4, RE-DYED FROM SHIPPED ART
// (lane/d-barrow-data, game-designer 2026-11-13; the Art Director judges and may replace each with bespoke art).
//
// Hatchets and crossbows past tier 4 and the tier-7 caster pair (src/data/gear-tiers.js) landed with no icon, and a
// Rare is a reveal, so drop-tables' loot-structure refuses a drop with no picture. Rather than invent a style, each
// icon is its family's last drawn rung re-dyed into the target tier's material:
//   the dye     every colour of the source rung that is also a colour of its REFERENCE (the same-tier sword or bow:
//               mithril_sword for the hatchets, maple_bow for the crossbow), ranked dark to light, becomes the colour of
//               the same rank in the target tier's reference (rune_sword, ember_sword, dawn_sword; yew_bow, ...). Every
//               other pixel (outline, strings, wraps) is kept. Only palette colours are copied, so the icon stays on the
//               locked palette, binary alpha, 32x32.
//   the wand    caster-icons.mjs's rule: the tier's staff halved by nearest-neighbour and set at the centre.
//   the codex   the Runewood Codex re-dyed to the Duskwood Bow's ramp by the same rank rule.
//
//   node tools/world-art/ladder-icons.mjs     write the eight PNGs into assets/icons-bundle/pixel/items/
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG, createImage } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const read = (id) => decodePNG(readFileSync(join(DIR, id + '.png')));
const key = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const lum = (k) => 0.299 * (k >> 16) + 0.587 * ((k >> 8) & 255) + 0.114 * (k & 255);

/** The opaque colours of an icon, dark to light. */
function ramp(img) {
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) s.add(key(img.data, i));
  return [...s].sort((a, b) => lum(a) - lum(b));
}

/** `src` re-dyed: a colour of `fromRef` takes the same-rank colour of `toRef`. */
export function redye(src, fromRef, toRef) {
  const from = ramp(read(fromRef)), to = ramp(read(toRef)), img = read(src);
  const map = new Map(from.map((c, r) => [c, to[Math.round((r * (to.length - 1)) / Math.max(1, from.length - 1))]]));
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const c = map.get(key(img.data, i));
    if (c === undefined) continue;
    img.data[i] = c >> 16; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255;
  }
  return img;
}

/** caster-icons.mjs's wand: the staff halved and centred. */
export function wand(staff) {
  const src = read(staff), out = createImage(32, 32);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const s = ((y * 2) * 32 + x * 2) * 4, d = ((y + 8) * 32 + x + 8) * 4;
    for (let k = 0; k < 4; k++) out.data[d + k] = src.data[s + k];
  }
  return out;
}

export const DRAW = Object.freeze({
  rune_hatchets: () => redye('mithril_hatchets', 'mithril_sword', 'rune_sword'),
  ember_hatchets: () => redye('mithril_hatchets', 'mithril_sword', 'ember_sword'),
  dawn_hatchets: () => redye('mithril_hatchets', 'mithril_sword', 'dawn_sword'),
  yew_crossbow: () => redye('maple_crossbow', 'maple_bow', 'yew_bow'),
  runewood_crossbow: () => redye('maple_crossbow', 'maple_bow', 'runewood_bow'),
  duskwood_crossbow: () => redye('maple_crossbow', 'maple_bow', 'duskwood_bow'),
  duskwood_wand: () => wand('duskwood_staff'),
  duskwood_codex: () => book('duskwood_bow'),
});

/* caster-icons.mjs's spellbook: field_cookbook's cover leather (dark -> light) re-dyed, here to a reference icon's ramp. */
const COVER = [0x2a1c14, 0x3d2a1d, 0x4a2e18, 0x553a26, 0x6e4c30, 0x7a4f26, 0x8a6440];
export function book(ref) {
  const to = ramp(read(ref)).slice(1), img = read('field_cookbook');   // [0] is the outline
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const at = COVER.indexOf(key(img.data, i));
    if (at < 0) continue;
    const c = to[Math.round((at * (to.length - 1)) / (COVER.length - 1))];
    img.data[i] = c >> 16; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255;
  }
  return img;
}

if (isMain(import.meta.url)) {
  for (const [id, fn] of Object.entries(DRAW)) writeFileSync(join(DIR, id + '.png'), encodePNG(fn()));
  console.log('ladder-icons: wrote ' + Object.keys(DRAW).length + ' icons');
}
