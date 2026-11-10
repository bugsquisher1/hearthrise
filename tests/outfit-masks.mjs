#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/outfit-masks.mjs — EVERY HERO OUTFIT'S REGION MASK LINES UP WITH ITS FRAMES
//
//   node tests/outfit-masks.mjs             the shipped masks hold
//   node tests/outfit-masks.mjs --selftest  each planted defect is caught by its named rule; the shipped tree is silent
//
// WHY. A dye recolours a frame where its mask frame is keyed (src/render/outfit-sprite.js). A mask one pixel
// off its frame paints a dye onto the floor beside the hero; a key that is not exactly a region colour dyes
// the wrong region or none; a mask that a second run would not redraw is a hand edit nobody can repeat. The
// masks are drawn by script (tools/world-art/outfit-masks.mjs, lane/c-hero-masks 2026-11-05), so each of those
// is a property of the pixels and is checked here, on the atlases that SHIP:
//   OM-1 cover     every outfit (src/data/hunt-outfits.js OUTFITS) is either masked (OUTFIT_MASKS) or HELD with a
//                  reason, never both; a masked outfit's sprite has its <sprite>_mask in atlas-hunt-masks, a held
//                  outfit's has none, and the mask atlas carries nothing else
//   OM-2 align     each mask is laid out like its sprite (frame, anchor, clips, facings, frames per facing), and frame
//                  by frame no mask pixel sits on a transparent pixel of the shipped sprite
//   OM-3 keys      every opaque mask pixel is exactly one of the four region keys (src/data/outfits.js MASK_COLOURS,
//                  BASE_REGIONS order: head, body, legs, feet) with alpha 255; every other pixel has alpha 0
//   OM-4 repeat    two runs of the script write byte-identical files, and the committed sources are a fresh run
//                  (pixels and sidecars)
//   OM-5 on need   the mask set is its MASK_SETS row for `heroes` and in no list the world loads at first open
//                  (ATLAS_SETS, LOADED_SETS, GRID_SETS): the game's first load does not grow
//
// mutant-anchors: none — every --selftest mutant edits an in-memory copy of what it reads
//
// Exit: 0 green · 1 a finding, or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { decodePNG, encodePNG, pixelHash, cloneImage } from '../tools/world-art/png.mjs';
import { spriteFromAtlas } from '../tools/world-art/build.mjs';
import { OUTFIT_MASKS, HELD, MASK_SET, ROOT } from '../tools/world-art/outfit-masks.mjs';
import { ATLAS_SETS, LOADED_SETS, GRID_SETS, MASK_SETS } from '../src/data/world/atlas-sets.js';
import { atlasPaths } from '../src/data/world/art-budget.js';
import { OUTFITS } from '../src/data/hunt-outfits.js';
import { MASK_COLOURS } from '../src/data/outfits.js';
import { isMain } from './_is-main.mjs';

const SCRIPT = join(ROOT, 'tools/world-art/outfit-masks.mjs');
const SRC = 'art/world/' + MASK_SET;

/* ── what the rules read ───────────────────────────────────────────────────────────────────────────── */
function atlasOf(set) {
  const p = atlasPaths(set);
  return { manifest: JSON.parse(readFileSync(join(ROOT, p.manifest), 'utf8')), image: decodePNG(readFileSync(join(ROOT, p.image))) };
}
/** Run the script into a fresh directory: Map(file -> bytes). */
function run() {
  const dir = mkdtempSync(join(tmpdir(), 'outfit-masks-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--out', dir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('outfit-masks.mjs --out exited ' + r.status + ': ' + (r.stderr || r.stdout));
    const out = new Map();
    for (const f of readdirSync(join(dir, SRC)).sort()) out.set(f, readFileSync(join(dir, SRC, f)));
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function committed() {
  const out = new Map();
  if (existsSync(join(ROOT, SRC))) for (const f of readdirSync(join(ROOT, SRC)).sort()) out.set(f, readFileSync(join(ROOT, SRC, f)));
  return out;
}
export function readTree() {
  return {
    outfits: { ...OUTFITS }, masked: Object.keys(OUTFIT_MASKS), held: { ...HELD },
    maskAtlas: atlasOf(MASK_SET), baseAtlas: atlasOf(MASK_SETS[MASK_SET]),
    runs: [run(), run()], committed: committed(),
    sets: { atlas: [...ATLAS_SETS], loaded: [...LOADED_SETS], grid: Object.values(GRID_SETS).flat(), masks: { ...MASK_SETS } },
  };
}

/* ── the rules: each returns its findings as strings ───────────────────────────────────────────────── */
function cover(t) {
  const out = [], ids = Object.keys(t.maskAtlas.manifest.sprites);
  for (const o of Object.keys(t.outfits)) {
    const m = t.masked.includes(o), h = Object.prototype.hasOwnProperty.call(t.held, o);
    if (m && h) out.push(`OM-1 ${o} is both masked and held`);
    if (!m && !h) out.push(`OM-1 ${o} is neither masked nor held (tools/world-art/outfit-masks.mjs)`);
    if (h && !(typeof t.held[o] === 'string' && t.held[o].length > 20)) out.push(`OM-1 ${o} is held with no reason and touch-up`);
    const id = t.outfits[o] + '_mask';
    if (m && !ids.includes(id)) out.push(`OM-1 ${o} is masked but atlas-${MASK_SET} has no ${id}`);
    if (h && ids.includes(id)) out.push(`OM-1 ${o} is held but atlas-${MASK_SET} still ships ${id}`);
  }
  const want = new Set(t.masked.map((o) => t.outfits[o] + '_mask'));
  for (const id of ids) if (!want.has(id)) out.push(`OM-1 atlas-${MASK_SET} carries ${id}, which masks no masked outfit`);
  return out;
}

function align(t) {
  const out = [], mm = t.maskAtlas.manifest, bm = t.baseAtlas.manifest;
  const shape = (s) => JSON.stringify([s.frame, s.anchor, Object.entries(s.anims).map(([n, a]) => [n, Object.entries(a.dirs).map(([d, l]) => [d, l.length])])]);
  for (const id of Object.keys(mm.sprites)) {
    const sprite = id.replace(/_mask$/, '');
    if (!bm.sprites[sprite]) { out.push(`OM-2 ${id}: set ${MASK_SETS[MASK_SET]} has no sprite ${sprite}`); continue; }
    if (shape(mm.sprites[id]) !== shape(bm.sprites[sprite])) { out.push(`OM-2 ${id} is not laid out like ${sprite} (frame, anchor, clips or frames per facing)`); continue; }
    const masks = spriteFromAtlas(mm, t.maskAtlas.image, id).frames, frames = spriteFromAtlas(bm, t.baseAtlas.image, sprite).frames;
    masks.forEach((f, k) => {
      const g = frames[k];
      let off = 0, first = null;
      for (let i = 3; i < f.img.data.length; i += 4) if (f.img.data[i] && !g.img.data[i]) { off++; if (!first) first = [((i - 3) / 4) % f.img.width, Math.floor((i - 3) / 4 / f.img.width)]; }
      if (off) out.push(`OM-2 ${id} ${f.anim}/${f.dir}/${f.i}: ${off} mask pixels on transparent sprite pixels (first at ${first.join(',')})`);
    });
  }
  return out;
}

function keys(t) {
  const out = [], keyset = new Set(MASK_COLOURS.slice(0, 4).map(([r, g, b]) => (r << 16) | (g << 8) | b));
  const mm = t.maskAtlas.manifest;
  for (const id of Object.keys(mm.sprites)) {
    let bad = 0, partial = 0, first = null;
    for (const f of spriteFromAtlas(mm, t.maskAtlas.image, id).frames) {
      const d = f.img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] !== 0 && d[i + 3] !== 255) partial++;
        if (d[i + 3] && !keyset.has((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])) { bad++; if (!first) first = `${f.anim}/${f.dir}/${f.i} rgb ${d[i]},${d[i + 1]},${d[i + 2]}`; }
      }
    }
    if (bad) out.push(`OM-3 ${id}: ${bad} pixels are not one of the four region keys (first ${first})`);
    if (partial) out.push(`OM-3 ${id}: ${partial} partially transparent pixels`);
  }
  return out;
}

function repeat(t) {
  const out = [], [a, b] = t.runs;
  const names = [...new Set([...a.keys(), ...b.keys()])].sort();
  for (const n of names) if (!a.has(n) || !b.has(n) || !a.get(n).equals(b.get(n))) out.push(`OM-4 ${SRC}/${n}: a second run of the script is not byte-identical`);
  for (const n of [...new Set([...a.keys(), ...t.committed.keys()])].sort()) {
    const fresh = a.get(n), have = t.committed.get(n);
    if (!fresh || !have) { out.push(`OM-4 ${SRC}/${n}: ${fresh ? 'a fresh run writes it but it is not committed' : 'committed but a fresh run does not write it'}`); continue; }
    const same = n.endsWith('.png') ? pixelHash(decodePNG(fresh)) === pixelHash(decodePNG(have)) : fresh.equals(have);
    if (!same) out.push(`OM-4 ${SRC}/${n}: the committed file is not what a fresh run writes (run node tools/world-art/outfit-masks.mjs)`);
  }
  return out;
}

function onNeed(t) {
  const out = [];
  if (t.sets.masks[MASK_SET] !== 'heroes') out.push(`OM-5 MASK_SETS has no row ${MASK_SET} -> heroes`);
  for (const [list, sets] of [['ATLAS_SETS', t.sets.atlas], ['LOADED_SETS', t.sets.loaded], ['GRID_SETS', t.sets.grid]]) if (sets.includes(MASK_SET)) out.push(`OM-5 ${MASK_SET} is in ${list}: it would load on the first open, not on need`);
  return out;
}

export const RULES = [cover, align, keys, repeat, onNeed];
export const findings = (t) => RULES.flatMap((r) => r(t));

/* ── --selftest ────────────────────────────────────────────────────────────────────────────────────── */
const withMaskImage = (t, fn) => { const image = cloneImage(t.maskAtlas.image); fn(image, t.maskAtlas.manifest); return { ...t, maskAtlas: { ...t.maskAtlas, image } }; };
const firstLitFrame = (t) => { const id = Object.keys(t.maskAtlas.manifest.sprites)[0]; const f = spriteFromAtlas(t.maskAtlas.manifest, t.maskAtlas.image, id).frames[0]; return { id, f, rect: t.maskAtlas.manifest.sprites[id].anims[f.anim].dirs[f.dir][f.i], frame: t.maskAtlas.manifest.sprites[id].frame }; };
const litPixel = (img, [x0, y0], [w, h]) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y0 + y) * img.width + x0 + x) * 4; if (img.data[i + 3]) return i; } return -1; };

export const SELFTEST_MUTANTS = [
  ['a mask shifted one pixel right', 'OM-2', (t) => withMaskImage(t, (img, m) => {
    for (const sp of Object.values(m.sprites)) for (const a of Object.values(sp.anims)) for (const l of Object.values(a.dirs)) for (const [x0, y0] of l) {
      const [w, h] = sp.frame;
      for (let y = 0; y < h; y++) for (let x = w - 1; x >= 0; x--) { const to = ((y0 + y) * img.width + x0 + x) * 4, from = to - 4; img.data.set(x ? img.data.subarray(from, from + 4) : [0, 0, 0, 0], to); }
    }
  })],
  ['one key painted on the floor beside the hero', 'OM-2', (t) => { const { rect } = firstLitFrame(t); return withMaskImage(t, (img) => { img.data.set([255, 0, 0, 255], (rect[1] * img.width + rect[0]) * 4); }); }],
  ['a fifth colour in a mask', 'OM-3', (t) => { const { rect, frame } = firstLitFrame(t); return withMaskImage(t, (img) => { img.data.set([255, 0, 255], litPixel(img, rect, frame)); }); }],
  ['a key one step off its colour', 'OM-3', (t) => { const { rect, frame } = firstLitFrame(t); return withMaskImage(t, (img) => { img.data[litPixel(img, rect, frame)] ^= 1; }); }],
  ['a half-transparent key', 'OM-3', (t) => { const { rect, frame } = firstLitFrame(t); return withMaskImage(t, (img) => { img.data[litPixel(img, rect, frame) + 3] = 128; }); }],
  ['a mask whose anchor moved', 'OM-2', (t) => { const m = JSON.parse(JSON.stringify(t.maskAtlas.manifest)); const id = Object.keys(m.sprites)[0]; m.sprites[id].anchor = [m.sprites[id].anchor[0] + 1, m.sprites[id].anchor[1]]; return { ...t, maskAtlas: { ...t.maskAtlas, manifest: m } }; }],
  ['an outfit neither masked nor held', 'OM-1', (t) => ({ ...t, masked: t.masked.slice(1) })],
  ['a held outfit that still ships a mask', 'OM-1', (t) => ({ ...t, held: { ...t.held, [t.masked[0]]: 'held for the selftest, with a reason long enough' } })],
  ['a held outfit with no reason', 'OM-1', (t) => ({ ...t, held: Object.fromEntries(Object.keys(t.held).map((k) => [k, ''])) })],
  ['a masked outfit missing from the atlas', 'OM-1', (t) => { const m = JSON.parse(JSON.stringify(t.maskAtlas.manifest)); delete m.sprites[Object.keys(m.sprites)[0]]; return { ...t, maskAtlas: { ...t.maskAtlas, manifest: m } }; }],
  ['a second run one byte different', 'OM-4', (t) => { const b = new Map(t.runs[1]); const [n, buf] = [...b][0]; const c = Buffer.from(buf); c[c.length - 1] ^= 1; b.set(n, c); return { ...t, runs: [t.runs[0], b] }; }],
  ['a committed sidecar edited by hand', 'OM-4', (t) => { const c = new Map(t.committed); const n = [...c.keys()].find((k) => k.endsWith('.json')); c.set(n, Buffer.concat([c.get(n), Buffer.from(' ')])); return { ...t, committed: c }; }],
  ['a committed mask with one pixel repainted', 'OM-4', (t) => {
    const c = new Map(t.committed), n = [...c.keys()].find((k) => k.endsWith('.png')), img = decodePNG(c.get(n));
    const i = img.data.findIndex((v, k) => k % 4 === 3 && v);
    img.data[i - 3] ^= 255;
    return { ...t, committed: new Map([...c, [n, encodePNG(img)]]) };
  }],
  ['the mask set loaded on the first open', 'OM-5', (t) => ({ ...t, sets: { ...t.sets, atlas: t.sets.atlas.concat([MASK_SET]) } })],
  ['the mask set unregistered', 'OM-5', (t) => ({ ...t, sets: { ...t.sets, masks: {} } })],
];

function selftest() {
  const t = readTree();
  const clean = findings(t);
  if (clean.length) { console.error('outfit-masks --selftest: harness — the shipped tree is not clean: ' + clean.slice(0, 3).join('; ')); return 2; }
  let escaped = 0;
  for (const [name, rule, plant] of SELFTEST_MUTANTS) {
    const hit = findings(plant(t)).filter((f) => f.startsWith(rule + ' '));
    if (hit.length) console.log(`  ✓ ${name}: caught by [${rule}] (${hit[0].slice(0, 90)})`);
    else { escaped++; console.log(`  ✗ ${name}: NOT caught by [${rule}]`); }
  }
  console.log(escaped ? `outfit-masks --selftest: RED — ${escaped} planted defect(s) escaped` : `outfit-masks --selftest: all ${SELFTEST_MUTANTS.length} planted defects caught; the shipped tree is silent`);
  return escaped ? 1 : 0;
}

if (isMain(import.meta.url)) {
  {
    try {
      if (process.argv.includes('--selftest')) process.exit(selftest());
      const t = readTree();
      const f = findings(t);
      for (const x of f) console.log('  ✗ ' + x);
      const frames = Object.values(t.maskAtlas.manifest.sprites).reduce((n, s) => n + Object.values(s.anims).reduce((m, a) => m + Object.values(a.dirs).reduce((k, l) => k + l.length, 0), 0), 0);
      console.log(f.length ? `outfit-masks: RED — ${f.length} finding(s)` : `outfit-masks: green — ${t.masked.length} outfits masked (${frames} frames), ${Object.keys(t.held).length} held (${Object.keys(t.held).join(', ')}); aligned, four keys only, a second run byte-identical, loaded on need`);
      process.exit(f.length ? 1 : 0);
    } catch (e) {
      console.error('outfit-masks: harness error:', e && e.stack || e);
      process.exit(2);
    }
  }
}
