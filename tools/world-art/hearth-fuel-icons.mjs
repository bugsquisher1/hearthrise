#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/hearth-fuel-icons.mjs — THE GREAT HEARTH'S EIGHT FUEL ICONS,
// RE-POURED FROM SHIPPED ICONS (lane/b-inner-flame, 2026-10-27; no generation,
// $0; the Art Director judges and may replace any with bespoke art).
//
// Every item needs a 32x32, palette-locked, binary-alpha icon (tests/pixel-icons.mjs).
// Rather than invent a style, each fuel takes a shipped icon whose SHAPE is the
// thing (drink-icons.mjs's method): the pixels of the named source ramps are
// re-poured, dark to light by luminance rank, onto the fuel's own palette colours;
// outline, shadow and every other pixel are untouched, so each reads as one set
// with its neighbours. Output stays inside the locked palette by construction.
//   lamp_jelly       slime_gel        the jelly, warm as lamp oil (bone / torch / gold)
//   dry_husk         void_chitin      the rolled shell, dried pale (earth / bone)
//   pithwood         normal_log       a soft green-skinned heartwood (leaf / moss / bone)
//   queens_comb      dragon_scale     the scaled ball, poured gold: a comb of wax cells
//   den_knot         coal             the lump, soaked in resin (earth / bronze / torch)
//   rat_kings_knot   knotted_tails    the tangle, grey with a marsh-gas sheen (iron / steel / frost)
//   verdigris_cake   copper_ore       the ore's stone turned copper-green (mithril / venom), its copper kept
//   mosslight_clump  sticky_core      the mossy ball, glowing cold blue-green (mithril / frost)
//
//   node tools/world-art/hearth-fuel-icons.mjs           write the eight PNGs
//   node tools/world-art/hearth-fuel-icons.mjs --report  print each base's colours by ramp
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const PAL = JSON.parse(readFileSync(join(ROOT, 'art', 'world', 'palette.json'), 'utf8')).ramps;
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };
const RAMP_OF = new Map(Object.entries(PAL).flatMap(([name, list]) => list.map((h) => [h, name])));

/* { id, base, from: the base's ramps that are re-poured, to: the fuel's colours dark -> light } */
export const POURS = Object.freeze([
  { id: 'lamp_jelly', base: 'slime_gel', from: ['leaf', 'moss', 'venom', 'mithril', 'frost'], to: ['#a8743a', '#cfa25c', '#f2a03a', '#e8c547', '#ffd36a', '#e6dcbc'] },
  { id: 'dry_husk', base: 'void_chitin', from: ['steel', 'iron', 'mithril', 'frost', 'water', 'stone'], to: ['#553a26', '#6e4c30', '#8a6440', '#a88457', '#c9bfa0', '#e6dcbc'] },
  { id: 'pithwood', base: 'normal_log', from: ['earth', 'bronze'], to: ['#2c4a2c', '#3d6234', '#557a3e', '#73944c', '#c9bfa0', '#e6dcbc'] },
  { id: 'queens_comb', base: 'dragon_scale', from: ['cloth', 'blood', 'skin', 'torch', 'earth'], to: ['#7a4f26', '#a8743a', '#cfa25c', '#e8c547', '#ffd36a'] },
  { id: 'den_knot', base: 'coal', from: ['stone', 'shadow', 'iron', 'steel'], to: ['#2a1c14', '#3d2a1d', '#553a26', '#7a4f26', '#a8743a', '#f2a03a'] },
  { id: 'rat_kings_knot', base: 'knotted_tails', from: ['earth', 'bronze', 'skin', 'cloth', 'blood'], to: ['#2c2e33', '#4a4d54', '#6e727a', '#8a9aa8', '#a8e4ff'] },
  { id: 'verdigris_cake', base: 'copper_ore', from: ['earth', 'cloth'], to: ['#2e4a52', '#4f7a80', '#7ccf4a', '#86b4b4', '#c8e6e0'] },
  { id: 'mosslight_clump', base: 'sticky_core', from: ['leaf', 'moss', 'venom'], to: ['#2e4a52', '#4f7a80', '#86b4b4', '#a8e4ff', '#c8e6e0'] },
]);

function colours(img) {
  const counts = new Map();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) { const h = hex(img.data[i], img.data[i + 1], img.data[i + 2]); counts.set(h, (counts.get(h) || 0) + 1); }
  return counts;
}

/** The re-poured image of one row, or throw when its base holds none of its source ramps. */
export function pour(row, img) {
  const counts = colours(img);
  const steps = [...counts.keys()].filter((h) => row.from.includes(RAMP_OF.get(h))).sort((a, b) => lum(a) - lum(b));
  if (!steps.length) throw new Error(row.id + ': its base ' + row.base + ' holds none of the ramps ' + row.from.join(', '));
  const map = new Map(steps.map((h, i) => [h, rgb(row.to[Math.min(row.to.length - 1, Math.floor(i * row.to.length / steps.length))])]));
  const out = { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const to = map.get(hex(out.data[i], out.data[i + 1], out.data[i + 2]));
    if (to) [out.data[i], out.data[i + 1], out.data[i + 2]] = to;
  }
  return out;
}

function main() {
  for (const row of POURS) {
    const img = decodePNG(readFileSync(join(DIR, row.base + '.png')));
    if (process.argv.includes('--report')) {
      const by = {};
      for (const [h, n] of colours(img)) { const r = RAMP_OF.get(h) || '?'; (by[r] = by[r] || []).push(h + 'x' + n); }
      console.log(row.id + ' <- ' + row.base + ': ' + JSON.stringify(by));
      continue;
    }
    writeFileSync(join(DIR, row.id + '.png'), encodePNG(pour(row, img)));
    console.log('wrote ' + row.id + '.png (from ' + row.base + ')');
  }
}

main();
