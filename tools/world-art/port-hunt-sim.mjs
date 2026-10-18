#!/usr/bin/env node
// tools/world-art/port-hunt-sim.mjs — the hunt sim's walk cycles → world-art sources.
//
//   node tools/world-art/port-hunt-sim.mjs            write art/world/hunt/<id>.{png,json} and art/world/vfx/<id>.{png,json}
//   node tools/world-art/port-hunt-sim.mjs --report   measure what the port would produce; write nothing
//
// The sim's art (prototypes/hunt-sim-assets, PixelLab style-1, 48x48 frames, 8 facings,
// a foot anchor per unit in its manifest.json) is SOURCE ART. This ports the pixels, never
// the sim code: each unit becomes one source sheet + sidecar in the world-art format
// (tools/world-art/build.mjs), so the normal pipeline locks it to the palette, checks it
// against the budget (src/data/world/art-budget.js) and packs a versioned atlas.
//   - facings: all eight of the sim's (the pipeline's FACINGS: s, e, n, w, then the diagonals)
//   - anims: idle (the sim's one idle frame per facing, where it has one) and walk
//   - the frame is the class frame; the sim's foot anchor is moved onto the class anchor
//     by whole pixels (no scaling: ART_DIRECTION §2, integer scales only)
// A unit is listed in UNITS with its world class; nothing else is guessed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePNG, encodePNG, createImage, blit } from './png.mjs';
import { CLASSES, FACINGS } from '../../src/data/world/art-budget.js';
import { ROOT } from './build.mjs';
import { measureFrame } from './measure.mjs';
import { isMain } from '../../tests/_is-main.mjs';

/* How far a bat hovers above its anchor, art px (the flier class allows 6-16). */
const HOVER = 10;
const SRC = 'prototypes/hunt-sim-assets';
const OUT = 'art/world/hunt';
const VFX_SRC = 'prototypes/hunt-sim-assets/vfx';
const VFX_OUT = 'art/world/vfx';
/* An effect's world sprite id: its sim name under the fx_ prefix, so no effect can collide with a prop. */
export const vfxId = (name) => 'fx_' + name;
const FACING = Object.freeze({ s: 'south', e: 'east', n: 'north', w: 'west', se: 'south-east', sw: 'south-west', ne: 'north-east', nw: 'north-west' });

/* sim unit id → { id: world sprite id, class }. Heroes are outfits (a role comes from the weapon). */
export const UNITS = Object.freeze({
  knight: { id: 'outfit_knight', class: 'character' },
  ranger: { id: 'outfit_ranger', class: 'character' },
  sorcerer: { id: 'outfit_sorcerer', class: 'character' },
  berserker: { id: 'outfit_berserker', class: 'character' },
  witch: { id: 'outfit_witch', class: 'character' },
  dawnward: { id: 'outfit_dawnward', class: 'character' },
  brute: { id: 'outfit_brute', class: 'character' },
  rat_king: { id: 'rat_king', class: 'beast' },
  /* The six units the first port HELD (see HELD): each is re-cut here, never rescaled by a fraction.
     druid / kobold are 31 px of body against a 32.4 floor: `stretch` repeats the waist row, so the
     figure is 2 art px taller. The rat, slime and spider are 30-37 px against a 22 ceiling: `half` is
     an exact 2:1 reduction (a 2x2 block keeps its majority colour, ties its darkest), the same pixel
     size as the rest of the world, at the cellar tier's scale. */
  druid: { id: 'outfit_druid', class: 'character', fit: { stretch: [27, 2] } },
  kobold: { id: 'kobold_tosher', class: 'character', fit: { stretch: [29, 3] } },
  giant_rat: { id: 'drain_rat', class: 'critter', fit: { half: true } },
  slime: { id: 'sump_slime', class: 'critter', fit: { half: true } },
  venom_spider: { id: 'cistern_spider', class: 'critter', fit: { half: true } },
  giant_bat: { id: 'culvert_bat', class: 'flier', fit: { half: true } },
});

/** A 2:1 reduction: each 2x2 block is opaque when 2+ of its pixels are, in its commonest colour (ties: darkest). */
export function halve(img, px = 0, py = 0) {
  const w = (img.width - px) >> 1, h = (img.height - py) >> 1, out = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const seen = new Map();
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const o = ((y * 2 + j + py) * img.width + x * 2 + i + px) * 4;
      if (img.data[o + 3] < 128) continue;
      const k = img.data[o] + ',' + img.data[o + 1] + ',' + img.data[o + 2];
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    let n = 0; for (const c of seen.values()) n += c;
    if (n < 2) continue;
    const lum = (k) => k.split(',').reduce((a, v) => a + +v, 0);
    const best = [...seen.entries()].sort((a, b) => b[1] - a[1] || lum(a[0]) - lum(b[0]))[0][0].split(',').map(Number);
    out.data.set([best[0], best[1], best[2], 255], (y * w + x) * 4);
  }
  return out;
}

/** Repeat row `at` n more times (everything below moves down n): a taller body, no scaling. */
export function stretch(img, at, n) {
  const out = createImage(img.width, img.height + n);
  blit(out, img, 0, 0, img.width, at, 0, 0);
  for (let k = 0; k <= n; k++) blit(out, img, 0, at, img.width, 1, 0, at + k);
  blit(out, img, 0, at + 1, img.width, img.height - at - 1, 0, at + n + 1);
  return out;
}

/* Measured 2026-10-17 by `build.mjs --report --set hunt` and HELD for the Asset Director: each
   breaks the budget its world class sets, and the fix is the art's or the class table's, never a
   rescale here (integer scales only). Re-run --report after the art or the class row changes. */
export const HELD = Object.freeze({});

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
  const fit = row.fit || {};
  const [fx, fy] = u.foot_anchor;
  const sx = fit.half ? fx >> 1 : fx, sy = fit.half ? fy >> 1 : fit.stretch ? fy + fit.stretch[1] : fy;
  const prep = (img) => (fit.half ? halve(img) : fit.stretch ? stretch(img, fit.stretch[0], fit.stretch[1]) : img);
  const dx = ax - sx, dy = ay - sy;
  const flier = row.class === 'flier';
  const walk = {}, idle = {};
  for (const d of FACINGS) {
    const list = u.directions[FACING[d]];
    if (!list || !list.length) return { error: simId + ': no ' + FACING[d] + ' walk' };
    walk[d] = list;
    const ip = simId + '/idle_' + FACING[d] + '.png';
    idle[d] = existsSync(join(ROOT, SRC, ip)) ? [ip] : [list[0]];
  }
  const anims = [{ name: 'idle', fps: 5, loop: true, frames: idle }, { name: 'walk', fps: u.fps || 10, loop: true, frames: walk }];
  const rows = anims.length * FACINGS.length;
  const cols = Math.max(...anims.map((a) => Math.max(...FACINGS.map((d) => a.frames[d].length))));
  const sheet = createImage(cols * fw, rows * fh);
  let r = 0;
  for (const a of anims) {
    for (const d of FACINGS) {
      /* One vertical offset per (anim, facing): the clip's lowest foot lands on the anchor
         row (VW-12, the lowest-opaque-row fallback), so a walk keeps its bob above it. */
      const raw = a.frames[d].map(load);
      /* A halved clip tries the four 2x2 block phases and keeps the one whose frames stand
         best on the anchor (a thin leg survives or not by which rows it falls into). */
      let best = null;
      for (const [px, py] of fit.half ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) {
        const imgs = raw.map((img) => (fit.half ? halve(img, px, py) : prep(img)));
        const lowest = Math.max(...imgs.map(lowestRow));
        const rowDy = flier ? ay - HOVER - lowest : ay - lowest;
        const frames = imgs.map((img) => {
          const frame = createImage(fw, fh);   // clipped to its own frame: nothing spills into a neighbour
          blit(frame, img, 0, 0, img.width, img.height, dx, rowDy, true);
          return frame;
        });
        let bad = 0;
        if (fit.half && !flier) frames.forEach((f, i) => { const m = measureFrame(f); if (!m.empty && m.foot < ay - (i === 0 ? 1 : 4)) bad++; });
        if (!best || bad < best.bad) best = { bad, frames };
        if (!bad) break;
      }
      best.frames.forEach((frame, i) => blit(sheet, frame, 0, 0, fw, fh, i * fw, r * fh));
      r++;
    }
  }
  const sidecar = {
    id: row.id, class: row.class, material: 'unit', source: row.id + '.png', anchor_px: [ax, ay], footprint: [1, 1],
    ...(row.class === 'flier' ? { hover_px: HOVER } : {}),
    anims: anims.map((a) => ({ name: a.name, fps: a.fps, loop: a.loop, dirs: Object.fromEntries(FACINGS.map((d) => [d, a.frames[d].length])) })),
    notes: 'Ported from ' + SRC + '/' + simId + ' (PixelLab style-1, ' + manifest.generated + ') by tools/world-art/port-hunt-sim.mjs: eight facings, foot anchor moved onto the class anchor by whole pixels.',
  };
  return { sheet, sidecar };
}

/**
 * One sim effect (vfx/manifest.json row) as { sheet, sidecar }, or { error }. The frames are
 * already cropped to one union box and share the manifest anchor, so the sheet is the
 * frames left to right, unscaled; the clip is non-directional ('s' only).
 */
export function portVfx(name, e) {
  if (!e || !Array.isArray(e.frames) || !e.frames.length || !Array.isArray(e.size) || !Array.isArray(e.anchor)) return { error: name + ': not a vfx manifest row' };
  const [fw, fh] = e.size;
  const sheet = createImage(fw * e.frames.length, fh);
  for (let i = 0; i < e.frames.length; i++) {
    const img = decodePNG(readFileSync(join(ROOT, VFX_SRC, e.frames[i])));
    if (img.width !== fw || img.height !== fh) return { error: name + ': frame ' + i + ' is ' + img.width + 'x' + img.height + ', the row says ' + fw + 'x' + fh };
    blit(sheet, img, 0, 0, fw, fh, i * fw, 0);
  }
  const id = vfxId(name);
  const sidecar = {
    id, class: 'vfx', material: 'light', source: id + '.png', frame: [fw, fh], anchor_px: [e.anchor[0], e.anchor[1]], footprint: [1, 1],
    ...(e.additive ? { blend: 'add' } : {}),
    anims: [{ name: 'play', fps: e.fps, loop: !!e.loop, dirs: { s: e.frames.length } }],
    notes: 'Ported from ' + VFX_SRC + '/' + name + ' by tools/world-art/port-hunt-sim.mjs: frames unscaled, anchor as the sim drew it.',
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
  const fx = JSON.parse(readFileSync(join(ROOT, VFX_SRC, 'manifest.json'), 'utf8')).effects || {};
  if (!report && !only) mkdirSync(join(ROOT, VFX_OUT), { recursive: true });
  for (const name of only ? [] : Object.keys(fx).sort()) {
    const r = portVfx(name, fx[name]);
    if (r.error) { console.log('  ✗ ' + r.error); bad++; continue; }
    if (!report) {
      writeFileSync(join(ROOT, VFX_OUT, r.sidecar.source), encodePNG(r.sheet));
      writeFileSync(join(ROOT, VFX_OUT, r.sidecar.id + '.json'), JSON.stringify(r.sidecar, null, 2) + '\n');
    }
    console.log('  ✓ vfx ' + name + ' → ' + r.sidecar.id + ' (' + r.sheet.width + 'x' + r.sheet.height + ')');
  }
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main();
