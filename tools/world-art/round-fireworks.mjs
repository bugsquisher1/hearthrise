#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/round-fireworks.mjs — THE ROUND'S FIREWORKS AND THE POWDER'S PINCH, RE-POURED FROM SHIPPED ART BY SCRIPT
// (lane/c-town-shows, 2026-11-04; the designer's gold sinks section: "One 64 x 64, 8-frame burst by script, 3 recolors"; "one 16 px fuel_powder by script"; 0 generations, $0).
//
// Every world asset has a style-1 source (tools/world-art/style1.mjs), so nothing here is drawn from nothing:
//   fx_round_<color>  the Great Hearth's own hearth_burn_sparks, each frame mirrored four ways about its anchor into a 64 x 64 frame: the same sparks, thrown every way at once.
//                     Its colors are re-poured, dark to light by luminance rank, onto the color's palette ramp, the way tools/world-art/hearth-flames.mjs pours a flame.
//   fuel_powder       fuel_coal's chunk, the same lump poured pale: what a hero throws on the fire is a pinch of powder; its color is the fire's.
// Output: art/world/common/<id>.png + its sidecar (the base's, renamed), built into atlas-common by tools/world-art/build.mjs.
//
//   node tools/world-art/round-fireworks.mjs          write the sources and sidecars
//   node tools/world-art/round-fireworks.mjs --check  exit 1 when a written source differs
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, pixelHash } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'art', 'world', 'common');
const FRAME = 64;
/* Palette colors only (art/world/palette.json), dark to light. */
export const BURSTS = Object.freeze({
  gold: Object.freeze(['#7a4f26', '#f2a03a', '#ffd36a', '#e6dcbc']),
  cinder: Object.freeze(['#5e1a1f', '#c23a2a', '#f2a03a', '#ffd36a']),
  frost: Object.freeze(['#2b4a6a', '#4fa8e8', '#a8e4ff', '#e6dcbc']),
});
const PINCH_RAMP = Object.freeze(['#553a26', '#8a6440', '#c9bfa0', '#e6dcbc']);
const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

/** Every color an image uses, dark to light, mapped onto a ramp by its rank. */
function pourOnto(img, ramp) {
  const seen = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) seen.add(hex(img.data, i));
  const steps = [...seen].sort((a, b) => lum(a) - lum(b));
  return new Map(steps.map((h, k) => [h, rgb(ramp[Math.min(ramp.length - 1, Math.floor(k * ramp.length / steps.length))])]));
}

/** One burst: the base's frames, each mirrored four ways about its anchor onto a FRAME x FRAME cell. Pure. */
export function burstOf(base, side, ramp) {
  const [fw, fh] = side.frame;
  const [ax, ay] = side.anchor_px;
  const frames = side.anims[0].dirs.s;
  const to = pourOnto(base, ramp);
  const data = new Uint8Array(FRAME * frames * FRAME * 4);
  const c = FRAME / 2 - 1;
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const si = (y * base.width + f * fw + x) * 4;
      if (!base.data[si + 3]) continue;
      const [r, g, b] = to.get(hex(base.data, si));
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const px = c + (x - ax) * sx, py = c + (y - ay) * sy;
        if (px < 0 || py < 0 || px >= FRAME || py >= FRAME) continue;
        const di = (py * FRAME * frames + f * FRAME + px) * 4;
        data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = 255;
      }
    }
  }
  return { width: FRAME * frames, height: FRAME, data };
}

/** The base, poured onto a ramp. Pure. */
export function poured(base, ramp) {
  const to = pourOnto(base, ramp);
  const out = { width: base.width, height: base.height, data: Uint8Array.from(base.data) };
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3]) [out.data[i], out.data[i + 1], out.data[i + 2]] = to.get(hex(base.data, i));
  return out;
}

const read = (id) => ({ img: decodePNG(readFileSync(join(DIR, id + '.png'))), side: JSON.parse(readFileSync(join(DIR, id + '.json'), 'utf8')) });

function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  const one = (id, img, side) => {
    if (check) {
      let have = null;
      try { have = pixelHash(decodePNG(readFileSync(join(DIR, id + '.png')))); } catch { /* absent */ }
      if (have !== pixelHash(img)) { console.error('stale: ' + id); stale++; }
      return;
    }
    writeFileSync(join(DIR, id + '.png'), encodePNG(img));
    writeFileSync(join(DIR, id + '.json'), JSON.stringify(side, null, 2) + '\n');
    console.log('wrote ' + id);
  };
  const sparks = read('hearth_burn_sparks');
  for (const [color, ramp] of Object.entries(BURSTS)) {
    const id = 'fx_round_' + color;
    one(id, burstOf(sparks.img, sparks.side, ramp), Object.assign({}, sparks.side, { id, source: id + '.png', frame: [FRAME, FRAME], anchor_px: [FRAME / 2 - 1, FRAME / 2 - 1],
      pixellab: Object.assign({}, sparks.side.pixellab, { derived: 'tools/world-art/round-fireworks.mjs: hearth_burn_sparks mirrored four ways, re-poured onto the ' + color + ' ramp; no generation' }),
      notes: 'THE ROUND: one firework over Hearth Square. The Hearth\'s own sparks thrown every way at once, on the ' + color + ' ramp.' }));
  }
  const coal = read('fuel_coal');
  one('fuel_powder', poured(coal.img, PINCH_RAMP), Object.assign({}, coal.side, { id: 'fuel_powder', source: 'fuel_powder.png',
    pixellab: Object.assign({}, coal.side.pixellab, { derived: 'tools/world-art/round-fireworks.mjs: fuel_coal re-poured pale; no generation' }),
    notes: 'THE BURN, for a bought powder: the pinch a hero throws on the Great Hearth. fuel_coal\'s chunk poured pale; the powder\'s color is the fire\'s.' }));
  if (check && stale) process.exit(1);
  if (check) console.log('round-fireworks --check: every source matches its base');
}

main();
