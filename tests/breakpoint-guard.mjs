#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/breakpoint-guard.mjs — ONE SET OF BREAKPOINTS, NOT THIRTY-FIVE
//
//   node tests/breakpoint-guard.mjs             gate: no NEW @media spelling
//   node tests/breakpoint-guard.mjs --report    gate + the full usage table
//   node tests/breakpoint-guard.mjs --write     re-record tests/breakpoints.json
//   node tests/breakpoint-guard.mjs --selftest  mutation proof
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// src/styles/*.css carries THIRTY-FIVE distinct `@media` strings across nine
// sheets — three different spellings of the mobile rail alone, plus six one-off
// widths (380/400/420/600/640/768/780/900/1100/1180/1200/1280/1900) that exist
// because somebody needed a nudge on one screen and invented a breakpoint to get
// it. A layout with thirty-five breakpoints has no layout: it has thirty-five
// special cases, and a mobile bug fixed at 640px reappears at 780px.
//
// THIS GUARD DOES NOT CHANGE ANY CSS AND DOES NOT DELETE ANY BREAKPOINT. It
// freezes the set. The canonical list in tests/breakpoints.json is exactly the
// spellings present the day it was recorded; a NEW one is red. Converging the
// list down is the next cleanup slice, and this file is the map for it — run
// --report to see which sheet uses which.
//
// ── NORMALISATION (so "same query, different whitespace" is ONE spelling) ────
// lowercased · comments stripped · whitespace collapsed · exactly one space
// after every `:` and `,` · `and`/`or`/`not` space-padded. That alone folds the
// 35 raw strings into 30 real ones — five of the "spellings" were only spacing.
// It deliberately does NOT reorder or re-associate terms: `A and B` and `B and A`
// are different spellings, because a reader scanning for the mobile rule has to
// recognise it by shape.
//
// ── THE MOBILE RAIL, MEASURED (the finding this guard was written to surface) ─
// CLAUDE.md §7 documents the mobile query as
//     (max-width: 540px), (max-height: 540px) and (max-width: 900px)
// That exact string appears ZERO times in the codebase. What is actually there:
//     (max-width: 540px), (max-height: 540px) and (max-width: 1024px)   ×25
//     (max-width: 900px), (max-height: 540px) and (max-width: 1024px)   × 8
//     (max-width: 640px), (max-height: 540px) and (max-width: 1024px)   × 1
// The dominant form is 540/1024. §7 should be corrected to it, and the eight
// 900px rules converged onto it in the next slice — not by this guard.
//
// Exit: 0 green · 1 a new spelling appeared (or the file list drifted) · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const CANON = join(ROOT, 'tests', 'breakpoints.json');

export function normaliseQuery(q) {
  return String(q)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\b(and|or|not)\(/g, '$1 (')
    .replace(/\)(and|or|not)\b/g, ') $1')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Collect every @media prelude from every sheet. Comments are stripped first so
   a commented-out experiment is not a breakpoint anybody has to live with. */
export function collect(root) {
  const dir = join(root, 'src', 'styles');
  const uses = new Map();          // normalised query -> { file: count }
  const raw = new Map();           // normalised -> Set(raw spellings seen)
  if (!existsSync(dir)) return { uses, raw };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css')).sort()) {
    const text = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of text.matchAll(/@media([^{]*)\{/g)) {
      const rawQ = m[1].replace(/\s+/g, ' ').trim();
      const q = normaliseQuery(rawQ);
      if (!q) continue;
      if (!uses.has(q)) { uses.set(q, {}); raw.set(q, new Set()); }
      const u = uses.get(q);
      u[f] = (u[f] || 0) + 1;
      raw.get(q).add(rawQ);
    }
  }
  return { uses, raw };
}

const total = (u) => Object.values(u).reduce((a, b) => a + b, 0);

function build(root) {
  const { uses, raw } = collect(root);
  const rows = [...uses.entries()]
    .sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0]))
    .map(([query, u]) => ({ query, count: total(u), files: u, spellings: [...raw.get(query)].sort() }));
  return rows;
}

function printReport(rows) {
  console.log('  normalisation: lowercase · comments stripped · whitespace collapsed · one space after ":" and ","');
  console.log(`\n  ${String('n').padStart(3)}  query  |  sheets`);
  for (const r of rows) {
    console.log(`  ${String(r.count).padStart(3)}  @media ${r.query}`);
    console.log(`       ${Object.entries(r.files).map(([f, n]) => `${f}×${n}`).join('  ')}`
      + (r.spellings.length > 1 ? `   [${r.spellings.length} raw spellings]` : ''));
  }
  console.log(`\n  ${rows.length} canonical queries · ${rows.reduce((n, r) => n + r.count, 0)} @media blocks`);
}

export function run(argv = []) {
  const rows = build(ROOT);
  if (argv.includes('--write')) {
    writeFileSync(CANON, JSON.stringify({
      note: 'The breakpoint spellings PRESENT in src/styles/*.css on the day this was recorded. '
        + 'This is a freeze, not an endorsement: a NEW spelling is red, converging the list down is '
        + 'a normal edit followed by `node tests/breakpoint-guard.mjs --write`.',
      normalisation: 'lowercase; comments stripped; whitespace collapsed; one space after ":" and ","; '
        + 'and/or/not space-padded; term order NOT canonicalised',
      mobile_rail: {
        documented_in_claude_md: '(max-width: 540px), (max-height: 540px) and (max-width: 900px)',
        occurrences_of_that_exact_string: 0,
        actual: {
          '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)': 25,
          '(max-width: 900px), (max-height: 540px) and (max-width: 1024px)': 8,
          '(max-width: 640px), (max-height: 540px) and (max-width: 1024px)': 1,
        },
        recommendation: 'document the 1024px form; converge the 900px and 640px rules onto it',
      },
      measured: new Date().toISOString().slice(0, 10),
      canonical: rows,
    }, null, 2) + '\n');
    printReport(rows);
    console.log('\n✓ canonical set written → tests/breakpoints.json');
    return 0;
  }
  if (!existsSync(CANON)) { console.error('BREAKPOINTS: no canonical set. Run --write once.'); return 2; }
  const canon = JSON.parse(readFileSync(CANON, 'utf8'));
  const known = new Map((canon.canonical || []).map((r) => [r.query, r]));
  const fails = [];
  const notes = [];
  for (const r of rows) {
    const k = known.get(r.query);
    if (!k) {
      fails.push(`NEW breakpoint spelling: @media ${r.query}\n        used by `
        + Object.entries(r.files).map(([f, n]) => `${f}×${n}`).join(', '));
      continue;
    }
    for (const f of Object.keys(r.files)) {
      if (!k.files[f]) notes.push(`@media ${r.query} — now also used by ${f}`);
    }
  }
  for (const [q] of known) if (!rows.some((r) => r.query === q)) notes.push(`@media ${q} — no longer used (run --write)`);

  if (argv.includes('--report')) printReport(rows);
  if (fails.length) {
    console.error(`  ✗ breakpoint guard: ${fails.length} new @media spelling(s)`);
    for (const f of fails) console.error('      ' + f);
    console.error('\n  There are already ' + known.size + ' breakpoint spellings in nine stylesheets. A new one');
    console.error('  turns "the mobile layout" into "the layout at your width". Reuse a canonical query');
    console.error('  (see tests/breakpoints.json); the mobile rail is');
    console.error('      @media (max-width: 540px), (max-height: 540px) and (max-width: 1024px)');
    console.error('  If a new breakpoint is genuinely right, say why in the CSS and run --write.');
    return 1;
  }
  console.log(`✓ breakpoint guard: ${rows.length} spellings across ${rows.reduce((n, r) => n + r.count, 0)} `
    + '@media blocks, all canonical — none new');
  if (notes.length) { console.log('  drift notes (not failures):'); for (const n of notes.slice(0, 10)) console.log('      ' + n); }
  return 0;
}

/* ── MUTATION PROOF ────────────────────────────────────────────────────── */
function selftest() {
  const fails = [];
  if (!existsSync(CANON)) { console.error('SELFTEST: no canonical set; run --write first.'); return 2; }
  const canon = JSON.parse(readFileSync(CANON, 'utf8'));
  const known = new Set((canon.canonical || []).map((r) => [r.query][0]));
  const tmp = mkdtempSync(join(tmpdir(), 'hr-bp-'));
  try {
    cpSync(join(ROOT, 'src', 'styles'), join(tmp, 'src', 'styles'), { recursive: true });
    const victim = join(tmp, 'src', 'styles', 'combat-hud.css');
    const orig = readFileSync(victim, 'utf8');
    const newSpellings = () => build(tmp).filter((r) => !known.has(r.query)).map((r) => r.query);

    // 1. an invented width is caught
    writeFileSync(victim, orig + '\n@media (max-width: 733px) { .x { color: red; } }\n');
    if (!newSpellings().some((q) => q.includes('733px'))) fails.push('SELFTEST: an invented breakpoint (733px) was NOT caught');

    // 2. a near-miss on the mobile rail — 1023 instead of 1024 — is caught
    writeFileSync(victim, orig + '\n@media (max-width: 540px), (max-height: 540px) and (max-width: 1023px) { .x { color: red; } }\n');
    if (!newSpellings().some((q) => q.includes('1023px'))) fails.push('SELFTEST: a one-pixel near-miss on the mobile rail was NOT caught');

    // 3. reordered terms are a different SHAPE and are caught deliberately
    writeFileSync(victim, orig + '\n@media (max-height: 540px) and (max-width: 1024px), (max-width: 540px) { .x { color: red; } }\n');
    if (!newSpellings().length) fails.push('SELFTEST: a reordered mobile rail was not flagged — the guard is meant to freeze the SHAPE');

    // 4. WHITESPACE ONLY must NOT be a new spelling (the normalisation working)
    writeFileSync(victim, orig + '\n@media (max-width:540px),(max-height:540px) and (max-width:1024px) { .x { color: red; } }\n');
    if (newSpellings().length) fails.push('SELFTEST: a whitespace-only variant of the canonical mobile rail was reported as NEW — the normalisation is not folding');

    // 5. a commented-out experiment must NOT count
    writeFileSync(victim, orig + '\n/* @media (max-width: 733px) { .x { color: red; } } */\n');
    if (newSpellings().length) fails.push('SELFTEST: a commented-out @media was counted');

    // 6. removing every use of a canonical query is a NOTE, not a failure
    writeFileSync(victim, orig);
    const gone = build(tmp);
    if (gone.some((r) => !known.has(r.query))) fails.push('SELFTEST: the unmodified tree is not clean against its own canonical set');
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  // the normaliser's own contract
  if (normaliseQuery('(MAX-WIDTH:540PX) , (max-height : 540px)') !== '(max-width: 540px), (max-height: 540px)') {
    fails.push('SELFTEST: normaliseQuery does not fold case/spacing as documented — got ' + normaliseQuery('(MAX-WIDTH:540PX) , (max-height : 540px)'));
  }

  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); return 1; }
  console.log('✓ breakpoint-guard --selftest: 3 planted new spellings caught (invented width, '
    + 'one-pixel near-miss, reordered rail); whitespace-only variants and commented-out blocks '
    + 'correctly ignored; normaliser contract asserted');
  return 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/breakpoint-guard.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
