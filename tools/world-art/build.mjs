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
//   in s,e,n,w order, frames left to right at the frame size.
// Terrain sidecar: { id, class: 'terrain', material, source, lower, upper,
//   tiles: { NWNESWSE: [[col, row], …] }, pixellab } — T×T cells of the source.
//
// Exit 0 green · 1 a finding or drift · 2 harness error.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG, crop, pixelHash } from './png.mjs';
import { lock } from './lock.mjs';
import { measureFrame, contactSpans } from './measure.mjs';
import { validateSprite, validateTerrain, validateAtlasSize, referenceFrames } from './validate.mjs';
import { pack } from './pack.mjs';
import { CLASSES, DIRS, T, SHADOW, MANIFEST_VERSION, atlasPaths } from '../../src/data/world/art-budget.js';
import { PALETTE_ID } from './palette.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ART_DIR = 'art/world';
export const OUT_DIR = 'assets/world';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : 0; };

export function listSets(root = ROOT) {
  const dir = join(root, ART_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).sort();
}

export function readSidecars(root, set) {
  const dir = join(root, ART_DIR, set);
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: `${ART_DIR}/${set}/${f}`, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

/** Slice and lock a sprite's frames from its source sheet. */
export function framesOf(sc, sheet) {
  const cls = CLASSES[sc.class] || {};
  const [fw, fh] = sc.frame || cls.frame || [sheet.width, sheet.height];
  const frames = [];
  const problems = [];
  let row = 0;
  for (const a of sc.anims) {
    for (const d of DIRS) {
      const n = a.dirs[d];
      if (!n) continue;
      if ((row + 1) * fh > sheet.height || n * fw > sheet.width) problems.push({ rule: 'source', id: sc.id, detail: `${a.name}/${d}: row ${row} x ${n} frames of ${fw}x${fh} does not fit the ${sheet.width}x${sheet.height} source` });
      else for (let i = 0; i < n; i++) frames.push({ anim: a.name, dir: d, i, img: lock(crop(sheet, i * fw, row * fh, fw, fh), sc.material) });
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

function shadowOf(sc, cls, refs) {
  const kind = sc.shadow !== undefined ? sc.shadow : cls.shadow;
  if (!kind) return null;
  const ms = refs.map((f) => measureFrame(f.img)).filter((m) => !m.empty);
  if (kind === 'ellipse') {
    const fw = (sc.footprint || [1, 1])[0];
    const w = Math.round(Math.min(SHADOW.footprintK * fw * T, SHADOW.massK * median(ms.map((m) => m.mass.w))));
    return { kind, w, h: Math.max(2, Math.round(SHADOW.aspect * w)), dx: SHADOW.dx, dy: SHADOW.dy };
  }
  return { kind, height: median(ms.map((m) => m.mass.h)), base: contactOf(sc, ms[0]) };
}

function contactOf(sc, m) {
  if (!m) return [0, 0];
  const spans = contactSpans(m.profile, sc.anchor_px[1], 2);
  return spans.length ? [spans[0][0], spans[spans.length - 1][1]] : [m.box.x0, m.box.x1];
}

/** Build one set in memory. */
export function buildSet(root, set) {
  const findings = [];
  const sprites = [], terrains = [];
  for (const sc of readSidecars(root, set)) {
    const src = join(root, ART_DIR, set, sc.source || '');
    if (!sc.source || !existsSync(src)) { findings.push({ rule: 'source', id: sc.id, detail: `missing source ${sc.source}` }); continue; }
    const sheet = decodePNG(readFileSync(src));
    if (sc.class === 'terrain') {
      const tiles = {};
      for (const [k, cells] of Object.entries(sc.tiles)) tiles[k] = cells.map(([c, r]) => lock(crop(sheet, c * T, r * T, T, T), sc.material));
      findings.push(...validateTerrain({ id: sc.id, kind: sc.kind, cycle: sc.cycle, tiles }));
      terrains.push({ sc, tiles });
      continue;
    }
    const { frames, problems, frame } = framesOf(sc, sheet);
    findings.push(...problems);
    const sp = spriteOf(sc, frames);
    findings.push(...validateSprite(sp));
    sprites.push({ sc, sp, frame });
  }
  const all = [];
  for (const { sc, sp } of sprites) for (const f of sp.frames) all.push({ key: `${sc.id}:${f.anim}:${f.dir}:${f.i}`, img: f.img });
  for (const { sc, tiles } of terrains) for (const [k, list] of Object.entries(tiles)) list.forEach((img, i) => all.push({ key: `${sc.id}:${k}:${i}`, img }));
  if (!all.length) return { set, findings: [...findings, { rule: 'empty', id: set, detail: 'the set has no frames' }] };
  const packed = pack(all);
  findings.push(...validateAtlasSize(set, packed.width, packed.height));

  const manifest = {
    version: MANIFEST_VERSION, set, palette: PALETTE_ID, T,
    image: atlasPaths(set).image.split('/').pop(), size: [packed.width, packed.height], pixels: pixelHash(packed.image),
    sprites: {}, terrain: {},
  };
  for (const { sc, sp, frame } of sprites.sort((a, b) => (a.sc.id < b.sc.id ? -1 : 1))) {
    const cls = CLASSES[sc.class] || {};
    const refs = referenceFrames(sp.frames);
    const ms = refs.map((f) => measureFrame(f.img)).filter((m) => !m.empty);
    const anims = {};
    for (const a of sc.anims) {
      const dirs = {};
      for (const d of DIRS) if (a.dirs[d]) dirs[d] = Array.from({ length: a.dirs[d] }, (_, i) => packed.rects.get(`${sc.id}:${a.name}:${d}:${i}`));
      anims[a.name] = { fps: a.fps || 0, loop: !!a.loop, ...(a.hit !== undefined ? { hit: a.hit } : {}), dirs };
    }
    manifest.sprites[sc.id] = {
      class: sc.class, layer: cls.layer || 'prop', frame, anchor: sc.anchor_px, footprint: sp.footprint,
      overhang: sp.overhang, hover: sp.hover, height: median(ms.map((m) => m.mass.h)),
      contact: contactOf(sc, ms[0]), shadow: cls.contact ? shadowOf(sc, cls, refs) : null, anims,
    };
  }
  for (const { sc, tiles } of terrains.sort((a, b) => (a.sc.id < b.sc.id ? -1 : 1))) {
    const out = {};
    for (const k of Object.keys(tiles).sort()) out[k] = tiles[k].map((_, i) => packed.rects.get(`${sc.id}:${k}:${i}`));
    manifest.terrain[sc.id] = { kind: sc.kind || 'wang16', lower: sc.lower, upper: sc.upper, ...(sc.cycle ? { cycle: sc.cycle } : {}), tiles: out };
  }
  return { set, findings, manifest, atlas: packed.image, sprites };
}

/** A manifest sprite back out of its atlas, as the record validateSprite reads. */
export function spriteFromAtlas(manifest, atlas, id) {
  const s = manifest.sprites[id];
  const [fw, fh] = s.frame;
  const frames = [];
  for (const [anim, a] of Object.entries(s.anims)) {
    for (const d of DIRS) (a.dirs[d] || []).forEach(([x, y], i) => frames.push({ anim, dir: d, i, img: crop(atlas, x, y, fw, fh) }));
  }
  return { id, class: s.class, anchor: s.anchor, footprint: s.footprint, overhang: s.overhang, hover: s.hover, frames };
}

/** A manifest terrain back out of its atlas. */
export function terrainFromAtlas(manifest, atlas, id) {
  const tiles = {};
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
    const cls = CLASSES[sc.class] || {};
    const refs = referenceFrames(sp.frames).map((f) => [f.dir, measureFrame(f.img)]).filter(([, m]) => !m.empty);
    console.log(`  ${sc.id.padEnd(18)} ${sc.class.padEnd(9)} ` + refs.map(([d, m]) => `${d}: mass ${m.mass.w}x${m.mass.h} box ${m.box.x0},${m.box.y0}-${m.box.x1},${m.box.y1} contact ${m.contact}`).join(' | ') + ` (anchor ${sc.anchor_px}, body ${cls.body ? cls.body.join('-') : '?'})`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
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
      writeFileSync(join(ROOT, p.image), encodePNG(b.atlas));
      writeFileSync(join(ROOT, p.manifest), stringifyManifest(b.manifest) + '\n');
      console.log(`  wrote ${p.image} + ${p.manifest}`);
    }
    process.exit(red ? 1 : 0);
  } catch (e) {
    console.error('world-art build: harness error:', e && e.stack || e);
    process.exit(2);
  }
}
