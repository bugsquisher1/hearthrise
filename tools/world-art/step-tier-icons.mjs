#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/step-tier-icons.mjs — THE STEP TIERS' PLACEHOLDER ICONS, RE-DYED FROM THE SHIPPED TOP
// (systems, lane/gear-phase-b, 2026-11-23; the Art Director judges each and may replace it with bespoke art).
//
// Every piece this lane adds (src/data/gear-tiers.js MATERIAL_TIERS, 12-targets 8.3: the rungs past Dawnsteel, the jewels, cloaks and shields) needs a 32x32 pixel icon
// (tests/pixel-icons.mjs: one file per ITEMS key). Rather than invent a style, each is the SAME SLOT'S shipped top re-dyed into its tier's
// word (ladder-icons.mjs's rank rule): every opaque colour of the source, ranked dark to light, becomes the colour of the same rank in the
// word's RAMP below, a run of the locked world palette (art/world/palette.json), so the icon stays on the palette, binary alpha, 32x32:
//   the armor     each weight's tier-7 piece of the slot (Dawnsteel plate, Dawnhide leather, Duskweave cloth), in the metal, leather or cloth
//   the weapons   each family's tier-7 rung and the Duskwood Codex, in the metal or the wood
//   the shield    the Emberforged Tower Shield (the last plain shield), in the metal
//   the jewels    the Dawnforged Signet, the Dragon Gem Earrings and the Dawnbound Amulet, in the metal; the cloak the Dawnlit Mantle, in the cloth
// A new tier needs one ramp a word here and nothing else.
//
//   node tools/world-art/step-tier-icons.mjs     write every step piece's PNG into assets/icons-bundle/pixel/items/
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodePNG } from './png.mjs';
import { ITEMS } from '../../src/data/items.js';
import { GEAR_LADDERS, STEP_MATERIALS } from '../../src/data/gear-tiers.js';
import { STEP_MADE } from '../../src/data/slot-ladders.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const read = (id) => decodePNG(readFileSync(join(DIR, id + '.png')));
const key = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const lum = (k) => 0.299 * (k >> 16) + 0.587 * ((k >> 8) & 255) + 0.114 * (k & 255);
const hex = (h) => parseInt(h.slice(1), 16);

/* THE RAMPS, dark to light, each colour a palette colour (tests/pixel-icons.mjs palette rule). Keyed by a tier's word id. */
export const RAMPS = Object.freeze({
  /* ember (Emberforged, item Level 100): a hot red metal, blood into torch */
  ember: Object.freeze(['#2f2723', '#3e1216', '#8e1f1f', '#c23a2a', '#f2a03a', '#ffd36a']),
  /* archmage (its cloth): a deep red weave */
  archmage: Object.freeze(['#17141a', '#3e1216', '#5e1a1f', '#8e1f1f', '#a88457', '#c49a5c']),
  /* dawn (Dawnsteel, 120): a bright pale metal, steel into bone and gold */
  dawn: Object.freeze(['#3a4652', '#5c6c7a', '#8a9aa8', '#c4ccd2', '#e6dcbc', '#e8c547']),
  /* duskweave (its cloth): a dark blue-gray weave */
  duskweave: Object.freeze(['#0b0a0c', '#17141a', '#1a2c44', '#2b4a6a', '#4f4e52', '#6a6865']),
  /* cobalt: a blue ore, water into frost */
  cobalt: Object.freeze(['#17141a', '#1a2c44', '#2b4a6a', '#3a4652', '#4fa8e8', '#a8e4ff']),
  /* juniper: a twisted green-brown wood, leaf into moss */
  juniper: Object.freeze(['#16241a', '#1f3322', '#3d2a1d', '#2c4a2c', '#557a3e', '#73944c']),
  /* drakehide: a scaled green hide, leaf into venom */
  drakehide: Object.freeze(['#16241a', '#2c4a2c', '#3d6234', '#557a3e', '#73944c', '#7ccf4a']),
  /* samite: a rich red silk, cloth into torch */
  samite: Object.freeze(['#3e1216', '#5e1a1f', '#8e1f1f', '#c23a2a', '#f2a03a', '#ffd36a']),
  /* wolfram: the heavy gray ore, shadow into stone */
  wolfram: Object.freeze(['#17141a', '#2f2723', '#3a3a3e', '#4f4e52', '#6a6865', '#8a867d', '#aaa49a']),
  /* rowan: a red wood, earth into blood */
  rowan: Object.freeze(['#2a1c14', '#3e1216', '#5e1a1f', '#8e1f1f', '#c23a2a', '#c49a5c']),
  /* eelskin: slick and dark, the Flooded Wing's water and moss */
  eelskin: Object.freeze(['#16241a', '#1a2c44', '#1f3322', '#2b4a6a', '#4a5a2a', '#6b7a38']),
  /* cerecloth: waxed burial linen, stone into bone */
  cerecloth: Object.freeze(['#4f4e52', '#6a6865', '#8a867d', '#aaa49a', '#c9bfa0', '#e6dcbc']),
});

/** The opaque colours of an icon, dark to light. */
function rampOf(img) {
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) s.add(key(img.data, i));
  return [...s].sort((a, b) => lum(a) - lum(b));
}

/** Icon `src` re-dyed into `ramp` by rank (ladder-icons.mjs redye, with a ramp of the palette in place of a reference icon). */
export function dye(src, ramp) {
  const img = read(src), from = rampOf(img), to = ramp.map(hex).sort((a, b) => lum(a) - lum(b));
  const map = new Map(from.map((c, r) => [c, to[Math.round((r * (to.length - 1)) / Math.max(1, from.length - 1))]]));
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const c = map.get(key(img.data, i));
    img.data[i] = c >> 16; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255;
  }
  return img;
}

/* the shipped icon a step piece takes its shape from, and the word its colour is (gear-tiers.js materialWord's line) */
const JEWEL_SOURCE = Object.freeze({ ring: 'dawnforged_signet', earrings: 'dragon_gem_earrings', necklace: 'dawnbound_amulet', cape: 'dawnlit_mantle' });
function sourceOf(id, it) {
  const mat = STEP_MATERIALS.find((m) => m.step === it.step);
  if (!mat) return null;
  const ladder = GEAR_LADDERS.find((l) => l.ids[mat.tier - 1] === id);
  const word = it.armourClass === 'leather' ? mat.words.leather[0] : it.armourClass === 'cloth' || it.slot === 'cape' ? mat.words.cloth[0]
    : it.weaponType === 'ranged' || it.weaponType === 'magic' || it.offhand === 'spellbook' ? mat.words.wood[0] : mat.id;
  const src = ladder ? ladder.ids[7 - 1] : it.offhand === 'shield' ? 'ember_tower_shield' : JEWEL_SOURCE[it.slot] || null;
  return src ? { src, word } : null;
}

/* THE PIECES THIS LANE ADDS (every other ladder piece keeps its shipped art): the ladder's rungs past Dawnsteel, the plain shield of a tier
   with homes that had none (shields.js) and the made jewels and cloaks (slot-ladders.js STEP_MADE) */
const ADDED = new Set([...GEAR_LADDERS.flatMap((l) => l.ids.slice(7)), ...Object.values(STEP_MADE).flat().map((r) => r.output),
  ...STEP_MATERIALS.map((m) => m.id + '_shield')].filter((id) => id && ITEMS[id]));
/** id -> () => the icon, for every piece the lane adds. Throws on a piece with no source or a word with no ramp. */
export const DRAW = Object.freeze(Object.fromEntries(Object.entries(ITEMS).filter(([id]) => ADDED.has(id)).map(([id, it]) => {
  const s = sourceOf(id, it);
  if (!s) throw new Error('step-tier-icons: ' + id + ' has no shipped piece to take its shape from');
  if (!RAMPS[s.word]) throw new Error('step-tier-icons: the word ' + s.word + ' has no ramp');
  return [id, () => dye(s.src, RAMPS[s.word])];
})));

if (isMain(import.meta.url)) {
  for (const [id, fn] of Object.entries(DRAW)) writeFileSync(join(DIR, id + '.png'), encodePNG(fn()));
  console.log('step-tier-icons: wrote ' + Object.keys(DRAW).length + ' icons');
}
