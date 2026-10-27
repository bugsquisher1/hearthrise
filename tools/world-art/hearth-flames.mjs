#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/hearth-flames.mjs — THE GREAT HEARTH'S NAMED-FUEL COLOURS
// (lane/b-inner-flame, 2026-10-27; the board's burn spec (d): "the same flare and
// idle loop, palette-swapped per fuel"; no generation, $0).
//
// The art-director's sample (lane/b-hearth-art) recoloured the fire, its flare and
// its sparks for the Verdigris Cake by hand: *_verdigris beside each base. That
// pair IS the mask: a pixel that differs between the base and its verdigris twin
// is a FLAME pixel (logs, firedogs and the firebox are identical in both). Each
// other colour re-pours exactly those pixels, ranked dark to light by luminance,
// onto its own palette ramp (src/data/hearth.js FLAMES); everything else is the
// base's. Output: art/world/common/<base>_<colour>.png + its sidecar (the
// verdigris twin's, renamed), built into atlas-common by tools/world-art/build.mjs.
//
//   node tools/world-art/hearth-flames.mjs          write the sources and sidecars
//   node tools/world-art/hearth-flames.mjs --check  exit 1 when a written source differs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, pixelHash } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'art', 'world', 'common');
const BASES = Object.freeze(['hearth_fire', 'hearth_flare', 'hearth_burn_sparks']);
/* Each named colour's ramp, palette colours dark -> light (art/world/palette.json). */
export const RAMPS = Object.freeze({
  honey: ['#7a4f26', '#a8743a', '#cfa25c', '#e8c547', '#ffd36a', '#e6dcbc'],          // Queen's Comb: honey-gold, fat sparks
  amber: ['#553a26', '#7a4f26', '#a8743a', '#f2a03a', '#f2a03a'],                     // Den Knot: deep amber resin (no red edge, no yellow core)
  marsh: ['#1a2c44', '#2b4a6a', '#5c6c7a', '#4fa8e8', '#a8e4ff', '#c4ccd2'],          // Rat King's Knot: marsh-gas blue
  mosslight: ['#3d6234', '#4f7a80', '#86b4b4', '#c8e6e0', '#a8e4ff'],                 // Mosslight Clump: cold blue-green glow
});
const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

/** The base re-poured onto `ramp` wherever it differs from its verdigris twin. */
export function repour(base, twin, ramp) {
  if (base.width !== twin.width || base.height !== twin.height) throw new Error('a base and its verdigris twin differ in size');
  const flame = new Set();
  for (let i = 0; i < base.data.length; i += 4) {
    if (!base.data[i + 3]) continue;
    if (base.data[i] !== twin.data[i] || base.data[i + 1] !== twin.data[i + 1] || base.data[i + 2] !== twin.data[i + 2] || base.data[i + 3] !== twin.data[i + 3]) flame.add(i);
  }
  if (!flame.size) throw new Error('no flame pixels: the twin is the base');
  const steps = [...new Set([...flame].map((i) => hex(base.data, i)))].sort((a, b) => lum(a) - lum(b));
  const to = new Map(steps.map((h, k) => [h, rgb(ramp[Math.min(ramp.length - 1, Math.floor(k * ramp.length / steps.length))])]));
  const out = { width: base.width, height: base.height, data: Uint8Array.from(base.data) };
  for (const i of flame) [out.data[i], out.data[i + 1], out.data[i + 2]] = to.get(hex(base.data, i));
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const b of BASES) {
    const base = decodePNG(readFileSync(join(DIR, b + '.png')));
    const twin = decodePNG(readFileSync(join(DIR, b + '_verdigris.png')));
    const side = JSON.parse(readFileSync(join(DIR, b + '_verdigris.json'), 'utf8'));
    for (const [name, ramp] of Object.entries(RAMPS)) {
      const id = b + '_' + name;
      const img = repour(base, twin, ramp);
      if (check) {
        let have = null;
        try { have = pixelHash(decodePNG(readFileSync(join(DIR, id + '.png')))); } catch { /* absent */ }
        if (have !== pixelHash(img)) { console.error('stale: ' + id); stale++; }
        continue;
      }
      writeFileSync(join(DIR, id + '.png'), encodePNG(img));
      const sc = Object.assign({}, side, { id, source: id + '.png',
        notes: b + ' with its flame pixels (where it differs from ' + b + '_verdigris) re-poured onto the ' + name
          + ' ramp by tools/world-art/hearth-flames.mjs; free recolour, no generation. Same placement as ' + b + '.' });
      writeFileSync(join(DIR, id + '.json'), JSON.stringify(sc, null, 2) + '\n');
      console.log('wrote ' + id);
    }
  }
  if (check && stale) process.exit(1);
  if (check) console.log('hearth-flames --check: every named colour matches its base');
}

main();
