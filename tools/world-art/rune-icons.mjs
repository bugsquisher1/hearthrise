#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/rune-icons.mjs — THE RUNE TIERS' ICONS, FROM EACH FAMILY'S CHALKED RUNE
// (lane b-spell-content, 2026-10-23; Art Director to judge and replace with bespoke art).
//
// Runes became family x tier items (src/data/stonecraft.js, src/data/runes.js) and every
// item needs a 32x32, palette-locked, binary-alpha icon (tests/pixel-icons.mjs). The
// designer's idea for the tiers (d3-tiers, 10-23): one Blank Rune for every tier, "the
// deeper the mark, the stronger the rune", the icon shows the numeral. So each family's
// CHALKED rune (the shipped tablet with the family's mark, version I) is the source, and
// Scored, Etched, Carved and Graven are that tablet with the tier's Roman numeral (II..V)
// in gold, outlined in shadow, in the bottom-right corner. Only palette colours are
// written, with binary alpha, so the output stays inside the locked palette.
//
//   node tools/world-art/rune-icons.mjs           write the deeper tiers of every crafted family
//   node tools/world-art/rune-icons.mjs --check   exit 1 when a written icon differs from a fresh one
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'icons-bundle', 'pixel', 'items');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const GOLD = rgb('#e8c547');
const SHADOW = rgb('#0b0a0c');

/* The numerals, 5 rows high: '#' = a gold pixel. Joined by a one-pixel gap. */
const GLYPH = Object.freeze({ I: ['#', '#', '#', '#', '#'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'] });
const NUMERAL = Object.freeze(['I', 'II', 'III', 'IV', 'V']);

/** The numeral `n` (1..5) as rows of '#'/'.', glyphs a pixel apart. */
export function numeralRows(n) {
  const parts = NUMERAL[n - 1].split('').map((c) => GLYPH[c]);
  return [0, 1, 2, 3, 4].map((y) => parts.map((g) => g[y]).join('.'));
}

/** `base` with tier `n`'s numeral stamped in the bottom-right corner (a shadow ring round gold strokes). */
export function stamp(base, n) {
  const out = { width: base.width, height: base.height, data: Uint8Array.from(base.data) };
  const rows = numeralRows(n);
  const w = rows[0].length;
  const x0 = out.width - 2 - w, y0 = out.height - 2 - rows.length;
  const put = (x, y, c) => { const i = (y * out.width + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; };
  const on = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < w && rows[y][x] === '#';
  for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= w; x++) {
    if (on(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = on(x + dx, y + dy);
    if (near) put(x0 + x, y0 + y, SHADOW);
  }
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < w; x++) if (on(x, y)) put(x0 + x, y0 + y, GOLD);
  return out;
}

async function main() {
  const { RUNE_TIERS, runeId } = await import(pathToFileURL(join(ROOT, 'src/data/runes.js')).href);
  const { CRAFTED_RUNE_FAMILIES } = await import(pathToFileURL(join(ROOT, 'src/data/stonecraft.js')).href);
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const f of CRAFTED_RUNE_FAMILIES) {
    const src = join(DIR, runeId(f, 1) + '.png');
    if (!existsSync(src)) throw new Error('rune-icons: ' + f + ' has no Chalked icon (' + runeId(f, 1) + '.png), the source of its tiers');
    const base = decodePNG(readFileSync(src));
    for (const t of RUNE_TIERS.slice(1)) {
      const file = join(DIR, runeId(f, t.tier) + '.png');
      const png = encodePNG(stamp(base, t.tier));
      if (check) { if (!existsSync(file) || !readFileSync(file).equals(png)) { console.error('stale: ' + runeId(f, t.tier) + '.png'); stale++; } }
      else { writeFileSync(file, png); console.log('wrote ' + runeId(f, t.tier) + '.png'); }
    }
  }
  if (check) { console.log(stale ? 'rune-icons --check: ' + stale + ' stale' : 'rune-icons --check: every tier icon is fresh'); process.exit(stale ? 1 : 0); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(2); });
