// ============================================================
// tests/art-palette.mjs — guards the colour-name → RGB table and the deriver
// that turns the two prompt sheets into Recraft `controls.colors` payloads.
//
// WHY THIS IS A TEST AND NOT A CHECKLIST. The batch is ~600 funded images at
// $0.04 each. The failure this guards is silent by construction: an item with
// no palette entry is generated with the ANCHOR's own colours — the salmon-pink
// iron defect of art-direction-picker.md §0.10b — and nobody finds out until the
// contact sheet, after the money is spent. Coverage has to be proven on every
// run, because the thing that breaks it is an ordinary edit to a subject line.
//
// Run standalone:  node tests/art-palette.mjs
// ============================================================

import { analyse } from '../tools/gen-art-colors.mjs';
import { PALETTE } from '../tools/lib/art-palette.mjs';

const ITEMS = 'docs/design/item-art-prompts.md';
const MONSTERS = 'docs/design/monster-art-prompts.md';

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function artPaletteGuard() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  // ── 1. total coverage over both sheets ────────────────────────────────────
  // The whole point of the table. 100% or the batch does not run.
  for (const [label, sheet, expect] of [['items', ITEMS, 512], ['monsters', MONSTERS, 85]]) {
    let r;
    try { r = analyse(sheet); } catch (e) { fails.push(`ART-PAL-1 ${label}: analyse threw — ${e.message}`); continue; }
    ok(r.rows.length === expect, `ART-PAL-1 ${label}: ${r.rows.length} rows parsed, expected ${expect} — the sheet's table shape changed or lines were added without updating this guard`);
    ok(r.failures.length === 0, `ART-PAL-2 ${label}: ${r.failures.length} unmapped/colourless line(s) — first: ${r.failures[0] || ''}`);

    // ── 2. every palette is a legal controls.colors payload ─────────────────
    for (const [file, cols] of Object.entries(r.colors)) {
      if (cols.length < 2 || cols.length > 4) fails.push(`ART-PAL-3 ${file}: ${cols.length} triples, Recraft takes 2-4`);
      for (const c of cols) {
        if (c.length !== 3 || c.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
          fails.push(`ART-PAL-3 ${file}: bad triple ${JSON.stringify(c)}`);
        }
      }
    }

    // ── 3. the 1000-character API cap (§0.2) ────────────────────────────────
    for (const m of r.manifest) {
      if (m.prompt.length > 1000) fails.push(`ART-PAL-4 ${m.file}: assembled prompt ${m.prompt.length} chars — Recraft rejects >1000`);
    }
  }

  // ── 4. TIER IDENTITY — the ladder must read as a progression at 48 px ─────
  // gear-tiers.js: bronze → iron → steel → mithril → rune → ember → dawn.
  // Iron and steel are the collision risk (both "grey"); they are separated on
  // VALUE, so that separation is asserted rather than trusted.
  const LADDER = ['bronze', 'iron', 'steel', 'mithril', 'rune_silver', 'heat_blued', 'dawnsteel'];
  for (const n of LADDER) ok(PALETTE[n], `ART-PAL-5: metal tier colour "${n}" is missing from the table`);
  const rgbs = LADDER.map((n) => PALETTE[n]?.rgb).filter(Boolean);
  for (let i = 0; i < rgbs.length; i++) {
    for (let j = i + 1; j < rgbs.length; j++) {
      const d = dist(rgbs[i], rgbs[j]);
      if (d < 40) fails.push(`ART-PAL-5: tiers ${LADDER[i]} and ${LADDER[j]} are only ${d.toFixed(0)} apart in RGB — they will read as the same metal at 48 px`);
    }
  }
  // iron ↔ steel specifically: the documented value separation.
  const gap = luma(PALETTE.steel.rgb) - luma(PALETTE.iron.rgb);
  ok(gap > 35, `ART-PAL-6: steel is only ${gap.toFixed(0)} luma above iron — the two grey rungs collapse into one`);
  // dawnsteel is the brightest rung and emberforged the darkest: the ladder's
  // two ends must not be confusable with anything in the middle.
  ok(luma(PALETTE.dawnsteel.rgb) === Math.max(...rgbs.map(luma)), 'ART-PAL-6: dawnsteel is not the brightest rung');
  ok(luma(PALETTE.heat_blued.rgb) === Math.min(...rgbs.map(luma)), 'ART-PAL-6: emberforged is not the darkest rung');

  // ── 5. C-METAL: the cold metals must not be warm ─────────────────────────
  // The clause the anchor kept defeating. R > B + 20 is the warm test qc-art.mjs
  // uses (at 40); tightened here because these are the source values, not pixels.
  for (const n of ['iron', 'steel', 'mithril', 'dawnsteel', 'rune_silver']) {
    const [r, , b] = PALETTE[n].rgb;
    ok(r <= b + 8, `ART-PAL-7: ${n} is warm (R${r} vs B${b}) — C-METAL says iron, steel, mithril and dawnsteel read cold`);
  }
  for (const n of ['bronze', 'warm_gold', 'copper']) {
    const [r, , b] = PALETTE[n].rgb;
    ok(r > b + 30, `ART-PAL-7: ${n} is not warm (R${r} vs B${b}) — bronze, copper and gold are supposed to stay warm`);
  }

  // ── 6. the ladder strip manifest stays runnable ───────────────────────────
  // §0.10c step 2: one seven-rung ladder is generated and read as a strip BEFORE
  // the batch is funded. A manifest whose keys stop joining its colours file is
  // the silent failure that would waste that test.
  const { readFileSync } = await import('node:fs');
  try {
    const man = JSON.parse(readFileSync('docs/design/art-manifests/ladder-sword.json', 'utf8'));
    const cols = JSON.parse(readFileSync('docs/design/art-manifests/ladder-sword-colors.json', 'utf8'));
    ok(man.length === 7, `ART-PAL-8: ladder strip has ${man.length} rungs, expected 7`);
    for (const m of man) ok(Array.isArray(cols[m.file]), `ART-PAL-8: ${m.file} has no palette in the strip's colours file — gen-art.mjs would generate it with the anchor's own colours`);
  } catch (e) {
    fails.push(`ART-PAL-8: ladder strip manifest unreadable — ${e.message}`);
  }

  return fails;
}

export async function runAll() { return artPaletteGuard(); }

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/art-palette.mjs')) {
  const fails = await artPaletteGuard();
  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); process.exit(1); }
  console.log('✓ art palette guard: 597/597 lines mapped, tier identity distinct, strip manifest joins');
}
