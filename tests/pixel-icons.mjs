#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/pixel-icons.mjs — EVERY ITEM HAS A PIXEL-WORLD ICON, AND IT IS A LEGAL ONE
//
//   node tests/pixel-icons.mjs             the shipped set obeys the contract
//   node tests/pixel-icons.mjs --selftest  planted defects each trip their named rule
//
// The item icons are the pixel-world set (Tyler, 2026-10-14): one 32x32 PNG per
// ITEMS key at assets/icons-bundle/pixel/items/<id>.png, snapped to the locked
// world palette (art/world/palette.json), binary alpha, shown at x2 with
// image-rendering: pixelated. The filename is derived from the id, so this guard
// is the whole manifest:
//   missing   an ITEMS key with no icon file (the shelf would fall back to a glyph)
//   orphan    an icon file for no ITEMS key (a rename that left the art behind)
//   size      a PNG that is not 32x32
//   palette   an opaque pixel outside the locked palette
//   alpha     a partially transparent pixel (the world's art has none)
//   empty     an icon with no pixels at all
//   reuse     a PIXEL_ART_REUSE row (item-art.js) that names no item, points at an id with no icon file
//             of its own, or sits beside the id's own file (painted art must retire its reuse row)
//   switch    src/data/item-art.js lost its one switch (the client that wired it was
//             deleted 2026-10-17; the new screens wire it again)
//
// --selftest plants each defect into a copy of real shipped icons and requires it
// to be caught BY ITS NAMED RULE; the clean copy must stay silent.
//
// mutant-anchors: assets/icons-bundle/pixel/items/ src/data/item-art.js art/world/palette.json
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG, encodePNG, createImage } from '../tools/world-art/png.mjs';
import { inPalette } from '../tools/world-art/lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'assets/icons-bundle/pixel/items';

/** Findings for the icon folder `dir`, against the item ids `ids`. */
export function checkIcons(dir, ids, reuse = {}) {
  const out = [];
  const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
  const reused = (id) => Object.prototype.hasOwnProperty.call(reuse, id);
  for (const [id, to] of Object.entries(reuse)) {
    if (!ids.includes(id)) out.push({ rule: 'reuse', id, detail: 'reuse row for no item' });
    else if (files.has(id)) out.push({ rule: 'reuse', id, detail: id + '.png exists: delete its reuse row' });
    else if (!ids.includes(to) || reused(to) || !files.has(to)) out.push({ rule: 'reuse', id, detail: 'reuses ' + to + ', which has no icon file of its own' });
  }
  for (const id of ids) if (!files.has(id) && !reused(id)) out.push({ rule: 'missing', id, detail: 'no ' + id + '.png' });
  const known = new Set(ids);
  for (const f of files) if (!known.has(f)) out.push({ rule: 'orphan', id: f, detail: f + '.png belongs to no item' });
  for (const id of ids) {
    if (!files.has(id)) continue;
    let img;
    try { img = decodePNG(readFileSync(join(dir, id + '.png'))); } catch (e) { out.push({ rule: 'size', id, detail: 'not a decodable PNG: ' + e.message }); continue; }
    if (img.width !== 32 || img.height !== 32) { out.push({ rule: 'size', id, detail: `${img.width}x${img.height}, want 32x32` }); continue; }
    let opaque = 0, partial = 0, off = 0, first = '';
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3];
      if (a === 0) continue;
      if (a !== 255) { partial++; continue; }
      opaque++;
      if (!inPalette(img.data[i], img.data[i + 1], img.data[i + 2])) {
        off++;
        if (!first) first = '#' + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, '0')).join('') + ' at ' + ((i / 4) % 32) + ',' + Math.floor(i / 128);
      }
    }
    if (!opaque) out.push({ rule: 'empty', id, detail: 'no opaque pixels' });
    if (partial) out.push({ rule: 'alpha', id, detail: partial + ' partially transparent pixels' });
    if (off) out.push({ rule: 'palette', id, detail: off + ' pixels off the palette (first ' + first + ')' });
  }
  return out;
}

/** The one switch and its wiring, read from source. */
export function checkSwitch(root) {
  const out = [];
  const art = readFileSync(join(root, 'src/data/item-art.js'), 'utf8');
  if (!/export const ITEM_ART_SET = '(pixel|painted)';/.test(art)) out.push({ rule: 'switch', id: 'item-art.js', detail: "ITEM_ART_SET must be exactly 'pixel' or 'painted'" });
  return out;
}

async function loadIds() {
  const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
  return Object.keys(ITEMS);
}
async function loadReuse() {
  return (await import(pathToFileURL(join(ROOT, 'src/data/item-art.js')).href)).PIXEL_ART_REUSE || {};
}

function report(label, findings) {
  for (const f of findings.slice(0, 40)) console.error(`  [${f.rule}] ${f.id}: ${f.detail}`);
  if (findings.length > 40) console.error(`  ... and ${findings.length - 40} more`);
  console.log(`${label}: ${findings.length ? 'RED — ' + findings.length + ' finding(s)' : 'green'}`);
}

async function selftest(ids) {
  const real = join(ROOT, DIR);
  const pick = ids.slice(0, 6);
  const tmp = mkdtempSync(join(tmpdir(), 'pixel-icons-'));
  const fresh = () => { const d = mkdtempSync(join(tmp, 'd-')); for (const id of pick) copyFileSync(join(real, id + '.png'), join(d, id + '.png')); return d; };
  const rewrite = (d, id, fn) => { const img = decodePNG(readFileSync(join(d, id + '.png'))); fn(img); writeFileSync(join(d, id + '.png'), encodePNG(img)); };
  const firstOpaque = (img) => { for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] === 255) return i; return -1; };
  const cases = [
    ['missing', (d) => rmSync(join(d, pick[0] + '.png'))],
    ['orphan', (d) => copyFileSync(join(d, pick[0] + '.png'), join(d, 'not_an_item.png'))],
    ['size', (d) => writeFileSync(join(d, pick[1] + '.png'), encodePNG(createImage(16, 16)))],
    ['palette', (d) => rewrite(d, pick[2], (img) => { const i = firstOpaque(img); img.data[i] = 1; img.data[i + 1] = 2; img.data[i + 2] = 254; })],
    ['alpha', (d) => rewrite(d, pick[3], (img) => { img.data[firstOpaque(img) + 3] = 128; })],
    ['empty', (d) => rewrite(d, pick[4], (img) => { img.data.fill(0); })],
  ];
  /* reuse: a row pointing at an id with no file, and a row beside the id's own file */
  const reuseCases = [
    ['reuse (no target icon)', { [pick[5]]: 'not_an_item' }, (d) => rmSync(join(d, pick[5] + '.png'))],
    ['reuse (beside its own file)', { [pick[5]]: pick[0] }, () => {}],
  ];
  let escaped = 0;
  const clean = checkIcons(fresh(), pick);
  if (clean.length) { console.error('pixel-icons --selftest: harness — the clean control is not clean: ' + JSON.stringify(clean)); process.exit(2); }
  for (const [rule, mutate] of cases) {
    const d = fresh(); mutate(d);
    const hit = checkIcons(d, pick).some((f) => f.rule === rule);
    console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${rule}`);
    if (!hit) escaped++;
  }
  for (const [name, reuse, mutate] of reuseCases) {
    const d = fresh(); mutate(d);
    const hit = checkIcons(d, pick, reuse).some((f) => f.rule === 'reuse');
    console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${name}`);
    if (!hit) escaped++;
  }
  // a legal reuse row (the target has its file, the id has none) stays silent
  { const d = fresh(); rmSync(join(d, pick[5] + '.png'));
    const legal = checkIcons(d, pick, { [pick[5]]: pick[0] });
    if (legal.length) { console.error('pixel-icons --selftest: harness — a legal reuse row is flagged: ' + JSON.stringify(legal)); process.exit(2); } }
  // the switch: a source with no ITEM_ART_SET must trip 'switch'
  const sroot = mkdtempSync(join(tmp, 's-'));
  mkdirSync(join(sroot, 'src/data'), { recursive: true });
  writeFileSync(join(sroot, 'src/data/item-art.js'), 'export const OTHER = 1;');
  const sw = checkSwitch(sroot).some((f) => f.rule === 'switch');
  console.log(`  ${sw ? 'caught ' : 'ESCAPED'} switch`);
  if (!sw) escaped++;
  rmSync(tmp, { recursive: true, force: true });
  console.log(escaped ? `pixel-icons --selftest: RED — ${escaped} planted defect(s) escaped` : 'pixel-icons --selftest: all 9 planted defects caught; clean control and a legal reuse silent');
  process.exit(escaped ? 1 : 0);
}

const ids = await loadIds();
if (process.argv.includes('--selftest')) await selftest(ids);
const findings = [...checkIcons(join(ROOT, DIR), ids, await loadReuse()), ...checkSwitch(ROOT)];
report(`pixel-icons: ${ids.length} items`, findings);
process.exit(findings.length ? 1 : 0);
