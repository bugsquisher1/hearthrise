#!/usr/bin/env node
// tools/world-art/port-hunt-sim.mjs — the hunt sim's walk cycles → world-art sources.
//
//   node tools/world-art/port-hunt-sim.mjs            write art/world/hunt/<id>.{png,json}
//   node tools/world-art/port-hunt-sim.mjs --report   measure what the port would produce; write nothing
//
// The sim's art (prototypes/hunt-sim-assets, PixelLab style-1, 48x48 frames, 8 facings,
// a foot anchor per unit in its manifest.json) is SOURCE ART. This ports the pixels, never
// the sim code: each unit becomes one source sheet + sidecar in the world-art format
// (tools/world-art/build.mjs), so the normal pipeline locks it to the palette, checks it
// against the budget (src/data/world/art-budget.js) and packs a versioned atlas.
//   - facings: the pipeline's four (s, e, n, w) out of the sim's eight
//   - anims: idle (the sim's one idle frame per facing, where it has one) and walk
//   - the frame is the class frame; the sim's foot anchor is moved onto the class anchor
//     by whole pixels (no scaling: ART_DIRECTION §2, integer scales only)
// A unit is listed in UNITS with its world class; nothing else is guessed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { CLASSES, DIRS } from '../../src/data/world/art-budget.js';
import { ROOT } from './build.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const SRC = 'prototypes/hunt-sim-assets';
const OUT = 'art/world/hunt';
const FACING = Object.freeze({ s: 'south', e: 'east', n: 'north', w: 'west' });

/* sim unit id → { id: world sprite id, class }. Heroes are outfits (a role comes from the weapon). */
export const UNITS = Object.freeze({
  knight: { id: 'outfit_knight', class: 'character' },
  ranger: { id: 'outfit_ranger', class: 'character' },
  sorcerer: { id: 'outfit_sorcerer', class: 'character' },
  berserker: { id: 'outfit_berserker', class: 'character' },
  rat_king: { id: 'rat_king', class: 'beast' },
});

/* Measured 2026-10-17 by `build.mjs --report --set hunt` and HELD for the Asset Director: each
   breaks the budget its world class sets, and the fix is the art's or the class table's, never a
   rescale here (integer scales only). Re-run --report after the art or the class row changes. */
export const HELD = Object.freeze({
  druid: 'character body 31 px; the class allows 32.4-44',
  giant_rat: 'critter body 36 px; the class allows 10.8-22 (a beast-sized rat needs a size ruling)',
  slime: 'critter body 30 px; feet drift between idle and walk',
  kobold: 'critter body 31 px; a humanoid below the character band',
  venom_spider: 'critter body 37 px; feet drift between idle and walk',
  giant_bat: 'flier hover and below-anchor rows do not match its manifest foot anchor',
});

function load(p) { return decodePNG(readFileSync(join(ROOT, SRC, p))); }

/** The lowest row holding an opaque pixel (-1 for an empty image). */
function lowestRow(img) {
  for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]) return y;
  return -1;
}

/** One unit as { sheet, sidecar }, or { error }. */
export function portUnit(simId, manifest) {
  const u = manifest.units[simId];
  const row = UNITS[simId];
  if (!u || !row) return { error: simId + ': not in the sim manifest or UNITS' };
  const cls = CLASSES[row.class];
  const [fw, fh] = cls.frame;
  const [ax, ay] = cls.anchor;
  const [sx, sy] = u.foot_anchor;
  const dx = ax - sx, dy = ay - sy;
  const flier = row.class === 'flier';
  const walk = {}, idle = {};
  for (const d of DIRS) {
    const list = u.directions[FACING[d]];
    if (!list || !list.length) return { error: simId + ': no ' + FACING[d] + ' walk' };
    walk[d] = list;
    const ip = simId + '/idle_' + FACING[d] + '.png';
    idle[d] = existsSync(join(ROOT, SRC, ip)) ? [ip] : [list[0]];
  }
  const anims = [{ name: 'idle', fps: 5, loop: true, frames: idle }, { name: 'walk', fps: u.fps || 10, loop: true, frames: walk }];
  const rows = anims.length * DIRS.length;
  const cols = Math.max(...anims.map((a) => Math.max(...DIRS.map((d) => a.frames[d].length))));
  const sheet = createImage(cols * fw, rows * fh);
  let r = 0;
  for (const a of anims) {
    for (const d of DIRS) {
      /* One vertical offset per (anim, facing): the clip's lowest foot lands on the anchor
         row (VW-12, the lowest-opaque-row fallback), so a walk keeps its bob above it. */
      const imgs = a.frames[d].map(load);
      const lowest = Math.max(...imgs.map(lowestRow));
      const rowDy = flier ? dy : ay - lowest;
      imgs.forEach((img, i) => {
        const frame = createImage(fw, fh);   // clipped to its own frame: nothing spills into a neighbour
        blit(frame, img, 0, 0, img.width, img.height, dx, rowDy, true);
        blit(sheet, frame, 0, 0, fw, fh, i * fw, r * fh);
      });
      r++;
    }
  }
  const sidecar = {
    id: row.id, class: row.class, material: 'unit', source: row.id + '.png', anchor_px: [ax, ay], footprint: [1, 1],
    ...(row.class === 'flier' ? { hover_px: Math.max(cls.hover[0], Math.min(cls.hover[1], ay - sy - 0)) } : {}),
    anims: anims.map((a) => ({ name: a.name, fps: a.fps, loop: a.loop, dirs: Object.fromEntries(DIRS.map((d) => [d, a.frames[d].length])) })),
    notes: 'Ported from ' + SRC + '/' + simId + ' (PixelLab style-1, ' + manifest.generated + ') by tools/world-art/port-hunt-sim.mjs: four of eight facings, foot anchor moved onto the class anchor by whole pixels.',
  };
  return { sheet, sidecar };
}

function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, SRC, 'manifest.json'), 'utf8'));
  const report = process.argv.includes('--report');
  const only = process.argv.includes('--unit') ? process.argv[process.argv.indexOf('--unit') + 1] : null;
  let bad = 0;
  if (!report) mkdirSync(join(ROOT, OUT), { recursive: true });
  for (const simId of Object.keys(UNITS)) {
    if (only && only !== simId) continue;
    const r = portUnit(simId, manifest);
    if (r.error) { console.log('  ✗ ' + r.error); bad++; continue; }
    if (!report) {
      writeFileSync(join(ROOT, OUT, r.sidecar.source), encodePNG(r.sheet));
      writeFileSync(join(ROOT, OUT, r.sidecar.id + '.json'), JSON.stringify(r.sidecar, null, 2) + '\n');
    }
    console.log('  ✓ ' + simId + ' → ' + r.sidecar.id + ' (' + r.sidecar.class + ', ' + r.sheet.width + 'x' + r.sheet.height + ')');
  }
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
