#!/usr/bin/env node
// tools/world-art/build.mjs — art/world/<set>/*.json sidecars + source sheets →
// assets/world/atlas-<set>.png + assets/world/atlas-<set>.json (the manifest).
//
//   node tools/world-art/build.mjs              build every set
//   node tools/world-art/build.mjs --set cellar build one set
//   node tools/world-art/build.mjs --report     print what each sprite measures; write nothing
//   node tools/world-art/build.mjs --check      rebuild in memory and compare with what is
//                                               committed (the drift guard); write nothing
//
// A source already wholly on the palette (PixelLab's sticky palette, or drawn by hand) is material `native`: a sidecar
// that would grade it is finding [regrade] (lock.mjs), so the lock cannot undo a palette-locked generation.
// The pipeline is lock (material grade + palette snap) → validate (the budget in
// src/data/world/art-budget.js) → pack → manifest. A set with any finding is NOT
// written: an atlas that breaks the scale or contact rules never reaches the tree.
// Sources are the curated, aligned, UN-locked frames; locking happens here, so a
// palette change is a rebuild, and a rebuild that differs from the tree is drift.
//
// Sidecar (art/world/<set>/<id>.json):
//   { id, class, material, source, frame?, anchor_px, footprint, overhang_px?,
//     hover_px?, shadow?, anims: [{ name, fps, loop, hit?, dirs: { s: n, e: n, … } }],
//     pixellab: { the generation request }, notes? }
//   The source sheet holds one row per (anim, dir), anims in sidecar order and dirs
//   in FACINGS order (s,e,n,w, then se,sw,ne,nw), frames left to right at the frame size.
// Terrain sidecar: { id, class: 'terrain', material, source, lower, upper,
//   tiles: { NWNESWSE: [[col, row], …] }, shade?, pixellab } — T×T cells of the source.
// Variety sidecar (tools/world-art/variety.mjs): { id, class: 'terrain', kind: 'variety', of: 'set/terrain', key | at,
//   lower, upper, seed, tone?, shift?, spots?, detail?: ['set/decal', …] } — no source of its own: its base is the of-terrain's
//   first tile of corners `key` (a wang pair's interior), or the tile of map cell `at` [x, y] of a painted ground, locked
//   exactly as that terrain locks it, so every variant meets the floor it varies with no seam.
//   lift (a sprite) / shade (a terrain): whole value steps up a body's ramps or down a painted floor's, after the lock (lockOf),
//   for the [ring] readability rule (tests/world-assets.mjs); never another hue.
// THE SET'S GRID: art/world/<set>/_set.json { "grid": "hd64" } names the art grid the set is
// drawn on (src/data/world/art-budget.js GRIDS); no file is the base grid. The grid's T, class
// table, shadow rule and measuring bands build and validate the set, and the manifest records
// its T. Files starting with `_` are set settings, never sidecars.
// A MASK SET (src/data/world/atlas-sets.js MASK_SETS: region masks for the dyes) is built the same way except that its
// frames are region keys: alpha is cut, colours are kept exactly (never graded or palette-snapped), each sprite is held
// to validateMask instead of the scale budget, its manifest's palette is MASK_PALETTE and it carries no shadow.
//
// Exit 0 green · 1 a finding or drift · 2 harness error.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodeSheetPNG, crop, pixelHash, createImage } from './png.mjs';
import { lock, regradeFinding, liftBody, shadeGround } from './lock.mjs';
import { measureFrame, contactSpans } from './measure.mjs';
import { validateSprite, validateMask, validateTerrain, validateAtlasSize, referenceFrames, MASK_PALETTE, REGRADE_KEPT } from './validate.mjs';
import { pack } from './pack.mjs';
import { FACINGS, MANIFEST_VERSION, atlasPaths, gridOf } from '../../src/data/world/art-budget.js';
import { PALETTE_ID } from './palette.mjs';
import { ALPHA_CUT } from '../../src/data/world/palette.js';
import { MASK_SETS } from '../../src/data/world/atlas-sets.js';
import { VARIETY_COUNT } from '../../src/world/core/ground-variety.js';
import { varietyTiles, decalOf } from './variety.mjs';
import { isMain as isEntryModule } from '../../tests/_is-main.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ART_DIR = 'art/world';
export const OUT_DIR = 'assets/world';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : 0; };

export function listSets(root = ROOT) {
  const dir = join(root, ART_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort();
}

/** The grid profile a set is drawn on (its _set.json `grid`; the base grid without one). */
export function setGrid(root, set) {
  const f = join(root, ART_DIR, set, '_set.json');
  return gridOf(existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).grid : null);
}

export function readSidecars(root, set) {
  const dir = join(root, ART_DIR, set);
  return readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()
    .map((f) => ({ file: `${ART_DIR}/${set}/${f}`, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

/** A mask frame as built: alpha cut at ALPHA_CUT, every colour kept exactly (a region key is not a palette colour). */
export function keyFrame(img) {
  const out = createImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] >= ALPHA_CUT) { out.data.set(img.data.subarray(i, i + 3), i); out.data[i + 3] = 255; }
  return out;
}

/** The lock, then a body's `lift` (that many value steps up its ramps, lock.mjs liftBody) or a painted floor's `shade` (that many
    down, shadeGround): the readability steps a sidecar declares (ART_DIRECTION section 4), done here so the source stays the drawing. */
export function lockOf(sc, img) {
  const locked = lock(img, sc.material);
  return sc.lift ? liftBody(locked, sc.lift) : sc.shade ? shadeGround(locked, sc.shade) : locked;
}

/** Slice and lock a sprite's frames from its source sheet (`prep` replaces the lock: keyFrame for a mask set). */
export function framesOf(sc, sheet, grid = gridOf(), prep = (img) => lockOf(sc, img)) {
  const cls = grid.classes[sc.class] || {};
  const [fw, fh] = sc.frame || cls.frame || [sheet.width, sheet.height];
  const frames = [];
  const problems = [];
  let row = 0;
  for (const a of sc.anims) {
    for (const d of FACINGS) {
      const n = a.dirs[d];
      if (!n) continue;
      if ((row + 1) * fh > sheet.height || n * fw > sheet.width) problems.push({ rule: 'source', id: sc.id, detail: `${a.name}/${d}: row ${row} x ${n} frames of ${fw}x${fh} does not fit the ${sheet.width}x${sheet.height} source` });
      else for (let i = 0; i < n; i++) frames.push({ anim: a.name, dir: d, i, img: prep(crop(sheet, i * fw, row * fh, fw, fh)) });
      row++;
    }
  }
  if (!problems.length && row * fh !== sheet.height) problems.push({ rule: 'source', id: sc.id, detail: `source has ${sheet.height / fh} rows, the sidecar declares ${row}` });
  return { frames, problems, frame: [fw, fh] };
}

/** The sprite record validate.mjs and the tests consume. */
export function spriteOf(sc, frames) {
  return {
    id: sc.id, class: sc.class, anchor: sc.anchor_px, footprint: sc.footprint || [1, 1],
    overhang: sc.overhang_px || [0, 0, 0, 0], hover: sc.hover_px || 0, frames,
  };
}

function shadowOf(sc, cls, refs, grid) {
  const { T, shadow: SHADOW, scale: k } = grid;
  const kind = sc.shadow !== undefined ? sc.shadow : cls.shadow;
  if (!kind) return null;
  const ms = refs.map((f) => measureFrame(f.img, k)).filter((m) => !m.empty);
  if (kind === 'ellipse') {
    const fw = (sc.footprint || [1, 1])[0];
    const w = Math.round(Math.min(SHADOW.footprintK * fw * T, SHADOW.massK * median(ms.map((m) => m.mass.w))));
    return { kind, w, h: Math.max(2, Math.round(SHADOW.aspect * w)), dx: SHADOW.dx, dy: SHADOW.dy };
  }
  return { kind, height: median(ms.map((m) => m.mass.h)), base: contactOf(sc, ms[0], k) };
}

function contactOf(sc, m, k = 1) {
  if (!m) return [0, 0];
  const spans = contactSpans(m.profile, sc.anchor_px[1], 2 * k);
  return spans.length ? [spans[0][0], spans[spans.length - 1][1]] : [m.box.x0, m.box.x1];
}

/** A variety sidecar's variants (tools/world-art/variety.mjs), from the base its of-terrain locks: { tiles } or { findings }. */
function varietyOf(root, sc, T) {
  const bad = (detail) => ({ findings: [{ rule: 'variety', id: sc.id, detail }] });
  const [ofSet, ofId] = String(sc.of || '').split('/');
  const ofFile = join(root, ART_DIR, ofSet || '', (ofId || '') + '.json');
  if (!ofSet || !ofId || !existsSync(ofFile)) return bad(`of "${sc.of}" is not a terrain sidecar (set/id)`);
  const of = JSON.parse(readFileSync(ofFile, 'utf8'));
  if (of.class !== 'terrain' || of.kind === 'variety') return bad(`of "${sc.of}" is not a floor terrain`);
  let cell;
  if (Array.isArray(sc.at)) {
    if (!of.painted || !of.cycle) return bad(`at [x, y] names a cell of a painted ground; ${sc.of} is not one`);
    const [x, y] = sc.at;
    cell = x >= 0 && y >= 0 && x < of.cycle[0] && y < of.cycle[1] ? of.tiles['1111'][y * of.cycle[0] + x] : null;
  } else cell = ((of.tiles || {})[sc.key] || [])[0];
  if (!cell) return bad(`no base tile: ${sc.at ? 'cell ' + JSON.stringify(sc.at) : 'key ' + sc.key} of ${sc.of}`);
  const sheet = decodePNG(readFileSync(join(root, ART_DIR, ofSet, of.source)));
  const base = lockOf(of, crop(sheet, cell[0] * T, cell[1] * T, T, T));
  const details = (sc.detail || []).map((ref) => decalOf(root, ART_DIR, ref));
  const tiles = varietyTiles(base, { seed: sc.seed | 0, tone: sc.tone, shift: !!sc.shift, spots: sc.spots, details });
  return tiles.length === VARIETY_COUNT ? { tiles, findings: [] } : bad(`${tiles.length} variants, the picker reads ${VARIETY_COUNT}`);
}

/** Build one set in memory. */
export function buildSet(root, set) {
  const findings = [];
  const grid = setGrid(root, set), T = grid.T;
  const masks = !!MASK_SETS[set];
  const sprites = [], terrains = [];
  for (const sc of readSidecars(root, set)) {
    if (sc.class === 'terrain' && sc.kind === 'variety') {
      const v = varietyOf(root, sc, T);
      findings.push(...v.findings);
      if (v.tiles) { findings.push(...validateTerrain({ id: sc.id, kind: 'variety', tiles: { 1111: v.tiles } }, grid)); terrains.push({ sc, tiles: { 1111: v.tiles } }); }
      continue;
    }
    const src = join(root, ART_DIR, set, sc.source || '');
    if (!sc.source || !existsSync(src)) { findings.push({ rule: 'source', id: sc.id, detail: `missing source ${sc.source}` }); continue; }
    const sheet = decodePNG(readFileSync(src));
    /* palette-locked art is never graded (lock.mjs): a set that would is not written */
    const regrade = masks ? null : regradeFinding(sc, sheet, REGRADE_KEPT);
    if (regrade) findings.push(regrade);
    if (sc.class === 'terrain') {
      const tiles = {};
      for (const [k, cells] of Object.entries(sc.tiles)) tiles[k] = cells.map(([c, r]) => lockOf(sc, crop(sheet, c * T, r * T, T, T)));
      findings.push(...validateTerrain({ id: sc.id, kind: sc.kind, cycle: sc.cycle, tiles }, grid));
      terrains.push({ sc, tiles });
      continue;
    }
    const { frames, problems, frame } = framesOf(sc, sheet, grid, masks ? keyFrame : undefined);
    findings.push(...problems);
    const sp = spriteOf(sc, frames);
    findings.push(...(masks ? validateMask(sp, grid) : validateSprite(sp, grid)));
    sprites.push({ sc, sp, frame });
  }
  const all = [];
  for (const { sc, sp } of sprites) for (const f of sp.frames) all.push({ key: `${sc.id}:${f.anim}:${f.dir}:${f.i}`, img: f.img });
  for (const { sc, tiles } of terrains) for (const [k, list] of Object.entries(tiles)) list.forEach((img, i) => all.push({ key: `${sc.id}:${k}:${i}`, img }));
  if (!all.length) return { set, findings: [...findings, { rule: 'empty', id: set, detail: 'the set has no frames' }] };
  const packed = pack(all);
  findings.push(...validateAtlasSize(set, packed.width, packed.height));

  const manifest = {
    version: MANIFEST_VERSION, set, palette: masks ? MASK_PALETTE : PALETTE_ID, T,
    image: atlasPaths(set).image.split('/').pop(), size: [packed.width, packed.height], pixels: pixelHash(packed.image),
    sprites: {}, terrain: {},
  };
  for (const { sc, sp, frame } of sprites.sort((a, b) => (a.sc.id < b.sc.id ? -1 : 1))) {
    const cls = grid.classes[sc.class] || {};
    const refs = referenceFrames(sp.frames);
    const ms = refs.map((f) => measureFrame(f.img, grid.scale)).filter((m) => !m.empty);
    const anims = {};
    for (const a of sc.anims) {
      const dirs = {};
      for (const d of FACINGS) if (a.dirs[d]) dirs[d] = Array.from({ length: a.dirs[d] }, (_, i) => packed.rects.get(`${sc.id}:${a.name}:${d}:${i}`));
      anims[a.name] = { fps: a.fps || 0, loop: !!a.loop, ...(a.hit !== undefined ? { hit: a.hit } : {}), dirs };
    }
    manifest.sprites[sc.id] = {
      class: sc.class, layer: cls.layer || 'prop', frame, anchor: sc.anchor_px, footprint: sp.footprint,
      overhang: sp.overhang, hover: sp.hover, height: median(ms.map((m) => m.mass.h)),
      contact: contactOf(sc, ms[0], grid.scale), shadow: cls.contact && !masks ? shadowOf(sc, cls, refs, grid) : null,
      ...(sc.blend === 'add' ? { blend: 'add' } : {}), anims,
    };
  }
  for (const { sc, tiles } of terrains.sort((a, b) => (a.sc.id < b.sc.id ? -1 : 1))) {
    const out = {};
    for (const k of Object.keys(tiles).sort()) out[k] = tiles[k].map((_, i) => packed.rects.get(`${sc.id}:${k}:${i}`));
    const variety = sc.kind === 'variety' ? { of: sc.of.split('/')[1], ...(sc.at ? { at: sc.at } : { key: sc.key }), seed: sc.seed | 0 } : {};
    manifest.terrain[sc.id] = { kind: sc.kind || 'wang16', lower: sc.lower, upper: sc.upper, ...(sc.cycle ? { cycle: sc.cycle } : {}), ...(sc.painted ? { painted: true } : {}), ...variety, tiles: out };
  }
  return { set, findings, manifest, atlas: packed.image, sprites, grid };
}

/** A manifest sprite back out of its atlas, as the record validateSprite reads. */
export function spriteFromAtlas(manifest, atlas, id) {
  const s = manifest.sprites[id];
  const [fw, fh] = s.frame;
  const frames = [];
  for (const [anim, a] of Object.entries(s.anims)) {
    for (const d of FACINGS) (a.dirs[d] || []).forEach(([x, y], i) => frames.push({ anim, dir: d, i, img: crop(atlas, x, y, fw, fh) }));
  }
  return { id, class: s.class, anchor: s.anchor, footprint: s.footprint, overhang: s.overhang, hover: s.hover, frames };
}

/** A manifest terrain back out of its atlas. */
export function terrainFromAtlas(manifest, atlas, id) {
  const tiles = {};
  const T = manifest.T;
  for (const [k, list] of Object.entries(manifest.terrain[id].tiles)) tiles[k] = list.map(([x, y]) => crop(atlas, x, y, T, T));
  const t = manifest.terrain[id];
  return { id, kind: t.kind, cycle: t.cycle, tiles };
}

/** JSON with every array of scalars (or of scalar arrays) on one line. */
export function stringifyManifest(v, ind = '') {
  const flat = (x) => Array.isArray(x) && x.every((e) => e === null || typeof e !== 'object' || (Array.isArray(e) && e.every((q) => q === null || typeof q !== 'object')));
  if (flat(v)) return JSON.stringify(v);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const ks = Object.keys(v);
    if (!ks.length) return '{}';
    const inner = ind + '  ';
    return '{\n' + ks.map((k) => inner + JSON.stringify(k) + ': ' + stringifyManifest(v[k], inner)).join(',\n') + '\n' + ind + '}';
  }
  if (Array.isArray(v)) return '[' + v.map((e) => stringifyManifest(e, ind)).join(', ') + ']';
  return JSON.stringify(v);
}

/** Rebuild every set in memory and compare with the tree. */
export function checkAll(root = ROOT) {
  const findings = [], drift = [];
  const sets = listSets(root);
  for (const set of sets) {
    const b = buildSet(root, set);
    findings.push(...b.findings);
    if (!b.manifest) continue;
    const p = atlasPaths(set);
    const mPath = join(root, p.manifest), iPath = join(root, p.image);
    if (!existsSync(mPath) || !existsSync(iPath)) { drift.push(`${set}: ${p.manifest} or ${p.image} is missing — run node tools/world-art/build.mjs`); continue; }
    const want = stringifyManifest(b.manifest) + '\n';
    if (readFileSync(mPath, 'utf8').replace(/\r\n/g, '\n') !== want) drift.push(`${set}: ${p.manifest} differs from a rebuild of ${ART_DIR}/${set} — run node tools/world-art/build.mjs --set ${set}`);
    const committed = pixelHash(decodePNG(readFileSync(iPath)));
    if (committed !== b.manifest.pixels) drift.push(`${set}: ${p.image} pixels differ from a rebuild (sha ${committed.slice(0, 12)} vs ${b.manifest.pixels.slice(0, 12)})`);
  }
  const outDir = join(root, OUT_DIR);
  if (existsSync(outDir)) for (const f of readdirSync(outDir)) {
    const m = f.match(/^atlas-(.+)\.(png|json)$/);
    if (m && !sets.includes(m[1])) drift.push(`${OUT_DIR}/${f} has no source set ${ART_DIR}/${m[1]}`);
  }
  return { findings, drift, sets };
}

function report(b) {
  for (const { sc, sp } of b.sprites || []) {
    const cls = b.grid.classes[sc.class] || {};
    const refs = referenceFrames(sp.frames).map((f) => [f.dir, measureFrame(f.img, b.grid.scale)]).filter(([, m]) => !m.empty);
    console.log(`  ${sc.id.padEnd(18)} ${sc.class.padEnd(9)} ` + refs.map(([d, m]) => `${d}: mass ${m.mass.w}x${m.mass.h} box ${m.box.x0},${m.box.y0}-${m.box.x1},${m.box.y1} contact ${m.contact}`).join(' | ') + ` (anchor ${sc.anchor_px}, body ${cls.body ? cls.body.join('-') : '?'})`);
  }
}

const isMain = isEntryModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  try {
    if (argv.includes('--check')) {
      const { findings, drift, sets } = checkAll(ROOT);
      for (const f of findings) console.log(`  ✗ [${f.rule}] ${f.id}: ${f.detail}`);
      for (const d of drift) console.log(`  ✗ [drift] ${d}`);
      console.log(findings.length || drift.length ? `world-art --check: RED (${findings.length} findings, ${drift.length} drift) over ${sets.length} sets` : `world-art --check: green, ${sets.length} sets match their sources`);
      process.exit(findings.length || drift.length ? 1 : 0);
    }
    const at = argv.indexOf('--set');
    const sets = at >= 0 ? [argv[at + 1]] : listSets(ROOT);
    let red = 0;
    for (const set of sets) {
      const b = buildSet(ROOT, set);
      console.log(`${set}: ${Object.keys(b.manifest ? b.manifest.sprites : {}).length} sprites, ${Object.keys(b.manifest ? b.manifest.terrain : {}).length} terrains, atlas ${b.manifest ? b.manifest.size.join('x') : '-'}`);
      if (argv.includes('--report')) report(b);
      for (const f of b.findings) console.log(`  ✗ [${f.rule}] ${f.id}: ${f.detail}`);
      if (b.findings.length) { red++; continue; }
      if (argv.includes('--report')) continue;
      const p = atlasPaths(set);
      mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
      writeFileSync(join(ROOT, p.image), encodeSheetPNG(b.atlas));
      writeFileSync(join(ROOT, p.manifest), stringifyManifest(b.manifest) + '\n');
      console.log(`  wrote ${p.image} + ${p.manifest}`);
    }
    process.exit(red ? 1 : 0);
  } catch (e) {
    console.error('world-art build: harness error:', e && e.stack || e);
    process.exit(2);
  }
}
