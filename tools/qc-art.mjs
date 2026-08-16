#!/usr/bin/env node
// ============================================================
// tools/qc-art.mjs — the unattended QC pass for a generated art batch,
// plus the alpha-snap pipeline fix. Costs nothing: it never calls an API.
//
//   node tools/qc-art.mjs assets/art-pilot/hearthfire            # report only
//   node tools/qc-art.mjs <dir> --snap                           # report + fix alpha in place
//   node tools/qc-art.mjs <dir> --neutral docs/.../neutral.txt   # gate the neutral-material ids
//
// WHERE IT SITS IN THE PIPELINE (it does not duplicate the two tools already
// here — it is the gate after them):
//   gen-art.mjs  ->  art-pilot-process.mjs (crop + resize + canvas)  ->  THIS
// `art-pilot-alpha.mjs` REPORTS an alpha histogram; this one also FIXES the
// alpha, hashes the batch for duplicates, and exits non-zero so it can gate.
//
// Implements docs/design/art-direction-picker.md §0.11 checks 1, 2, 4, 5, 6
// and the §0.12 alpha snap. Checks 3 (filename ∈ live id set), 7, 8 and 9 are
// deliberately NOT here: 3 belongs with the wiring step, and 7–9 are the human
// passes that no pixel metric can stand in for.
//
// WHY THE SNAP EXISTS (measured on the 13-image Hearthfire pilot): only
// 0.3–2.0% of pixels in any delivered file are fully opaque. The modal interior
// alpha is 254 and 50–80% of the canvas sits at 252–254 — an artefact of
// Recraft's removeBackground matting, which runs after generation and cannot be
// influenced by any prompt wording. The snap makes `alpha >= 250` opaque and
// `alpha <= 16` transparent, and leaves 17–249 alone so real soft edges
// survive. 16 (6% opacity) rather than 8 because the pilot's barn_rat.png
// carries an alpha-12 corner pixel: no intentional soft edge starts at 6%
// coverage on the canvas border, and a corner that is 'almost' clear is the
// thing that makes a downstream opaque/transparent test unanswerable.
//
// Re-encoding goes through Chromium's own PNG encoder via Playwright — a
// hand-rolled PNG codec is not something to debug across 600 funded images.
// The tool is idempotent: snapping an already-snapped file changes nothing.
// ============================================================

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const DIR = argv.find((a) => !a.startsWith('--'));
const SNAP = argv.includes('--snap');
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const NEUTRAL_FILE = flag('neutral', null);

if (!DIR) {
  console.error('usage: node tools/qc-art.mjs <dir> [--snap] [--neutral <ids.txt>]');
  process.exit(2);
}

const neutral = new Set(
  NEUTRAL_FILE && fs.existsSync(NEUTRAL_FILE)
    ? fs.readFileSync(NEUTRAL_FILE, 'utf8').split(/\s+/).filter(Boolean)
    : []
);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d)) {
    const p = path.join(d, e);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.toLowerCase().endsWith('.png')) files.push(p);
  }
})(DIR);
if (!files.length) { console.error(`no PNGs under ${DIR}`); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();

const bySha = new Map();
const problems = [];
let snapped = 0;

for (const f of files) {
  const buf = fs.readFileSync(f);
  const rel = path.relative(DIR, f).replace(/\\/g, '/');
  const id = path.basename(f, '.png');
  const isMonster = /(^|\/)monsters\//.test(rel);

  // 1a — colour type straight off the IHDR (byte 25). 6 = RGBA.
  const colourType = buf.length > 25 ? buf[25] : -1;
  if (colourType !== 6) problems.push(`${rel}: PNG colour type ${colourType}, expected 6 (RGBA)`);

  // 4 — duplicate bytes. The pilot shipped oak_log.png byte-identical to
  // bronze_sword.png; a duplicate download is completely silent otherwise.
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (bySha.has(sha)) problems.push(`${rel}: BYTE-IDENTICAL to ${bySha.get(sha)} — duplicate download`);
  else bySha.set(sha, rel);

  const r = await page.evaluate(async ({ b64, snap }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const im = cx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    const n = c.width * c.height;
    let a0 = 0, aFull = 0, aMid = 0, changed = 0;
    for (let i = 3; i < d.length; i += 4) {
      let a = d[i];
      if (snap) {
        if (a >= 250 && a !== 255) { d[i] = 255; a = 255; changed++; }
        else if (a <= 16 && a !== 0) { d[i] = 0; a = 0; changed++; }
      }
      if (a === 0) a0++; else if (a === 255) aFull++; else aMid++;
    }
    const at = (x, y) => d[(y * c.width + x) * 4 + 3];
    const corners = [at(0, 0), at(c.width - 1, 0), at(0, c.height - 1), at(c.width - 1, c.height - 1)];
    let warm = 0, cnt = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      cnt++; if (d[i] > d[i + 2] + 40) warm++;
    }
    let out = null;
    if (snap && changed) { cx.putImageData(im, 0, 0); out = c.toDataURL('image/png').split(',')[1]; }
    return {
      w: c.width, h: c.height,
      transparentPct: 100 * a0 / n, opaquePct: 100 * aFull / n, partialPct: 100 * aMid / n,
      corners, warmPct: cnt ? 100 * warm / cnt : 0, changed, out,
    };
  }, { b64: buf.toString('base64'), snap: SNAP });

  if (r.out) { fs.writeFileSync(f, Buffer.from(r.out, 'base64')); snapped++; }

  // 1b — corners must be clear, but ONLY for monsters. Item icons are
  // auto-cropped to their content, so a diagonal blade legitimately reaches the
  // corner of its own bounding box: the shipped bronze_sword.png has an
  // alpha-102 corner and is correct. Monster portraits are canvassed to 256²
  // with a margin, so any corner alpha there IS matting residue.
  if (isMonster) {
    const badCorner = r.corners.find((a) => a > 0);
    if (badCorner !== undefined) problems.push(`${rel}: corner alpha ${r.corners.join(',')} — matting residue (run --snap)`);
  }

  // 1c — a sane alpha histogram. A high partial band means the matte ate it.
  if (r.partialPct > 15 && SNAP) problems.push(`${rel}: ${r.partialPct.toFixed(1)}% semi-transparent after snap — check the cut-out`);

  // 2 — canvas. Monsters square-256; items 128 long edge (both post-resize;
  // a raw 1024 generation is expected and reported as INFO, not a failure).
  if (isMonster && r.w !== r.h) problems.push(`${rel}: ${r.w}x${r.h} — monster portraits must be SQUARE`);

  // 5 — not blank, not a full-bleed rectangle.
  const subject = r.opaquePct + r.partialPct;
  if (subject < 8) problems.push(`${rel}: only ${subject.toFixed(1)}% of the canvas has content — blank or failed generation`);
  if (r.transparentPct < 8) problems.push(`${rel}: only ${r.transparentPct.toFixed(1)}% transparent — background was never cut`);

  // 6 — neutral-material check. iron_ore scored 38% warm and failed; the
  // correctly-cold iron_sword scores 16%.
  if (neutral.has(id) && r.warmPct > 25) {
    problems.push(`${rel}: ${r.warmPct.toFixed(0)}% warm-dominant pixels on a NEUTRAL material — the palette repainted it`);
  }

  console.log(
    rel.padEnd(30),
    `${r.w}x${r.h}`.padEnd(10),
    `clear ${r.transparentPct.toFixed(0)}%`.padEnd(11),
    `opaque ${r.opaquePct.toFixed(0)}%`.padEnd(12),
    `soft ${r.partialPct.toFixed(0)}%`.padEnd(10),
    `warm ${r.warmPct.toFixed(0)}%`
  );
}

await browser.close();

console.log(`\n${files.length} file(s) checked${SNAP ? `, ${snapped} alpha-snapped` : ''}.`);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('No problems found.');
