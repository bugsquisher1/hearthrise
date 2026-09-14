#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/split-smoke-suite.mjs — THE SUITE SPLIT, AS A TOOL RATHER THAN A HAND
//
//   node tools/split-smoke-suite.mjs --dry-run     re-derive and CHECK, write nothing
//   node tools/split-smoke-suite.mjs               perform the split in place
//   node tools/split-smoke-suite.mjs --from <file> split a monolith from elsewhere
//                                                  (a `git show <sha>:… > f` blob)
//
// Exit: 0 the split re-derives byte-identically · 1 it does not · 2 harness.
//
// ── WHY A TOOL AND NOT A ONE-OFF ────────────────────────────────────────────
// The split is a PURE MOVE of ~63,000 lines, and it lands last in the day's
// merge order: three other lanes are still writing tests into the monolith
// tonight, and merging the split first would make every one of them resolve a
// 65,000-line rename. So the move has to be REPEATABLE on whatever
// origin/next looks like at the cut — with the same boundaries, the same module
// names, and new tests landing in whichever module their chronological
// neighbours ended up in. A hand-driven split cannot promise that; this can.
//
// ── THE BOUNDARIES ARE ANCHORED ON TEST NAMES, NOT LINE NUMBERS ─────────────
// A plan keyed on element indices is invalidated by every test another lane
// inserts. Each module below is therefore anchored on the NAME of the test it
// starts with, and the anchor must match EXACTLY ONE registered test in the
// body — a missing or duplicated anchor is a hard error, never a guess. Tests
// added between two anchors land in the earlier module automatically, which is
// exactly "where its tests used to sit".
//
// ── WHAT MAKES THIS A PURE MOVE, AND HOW IT IS PROVEN ───────────────────────
// Nothing is written until the chunks, concatenated in order, are BYTE-IDENTICAL
// to the `const TESTS = [ … ];` body they came from. The only new text is module
// scaffolding: one header comment, one import of the harness, `export default [`
// and `];`. Test bodies are never edited — with one mechanical exception that is
// not a choice: a file one directory deeper needs one more `../` on every
// relative specifier, and the first cut of this split shipped without it. The
// suite silently failed to load (`Failed to fetch dynamically imported module`)
// and every headless runner fell through to legacy.js's rival 40-test
// `__smokeTest`. tests/boot-budget.mjs BOOT-2 is the standing guard for that
// class; this tool does the rewrite so the mistake cannot be made by hand twice.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const SRC = argOf('--from') || join(ROOT, 'src', 'features', 'smoke-test.js');
const OUTDIR = join(ROOT, 'src', 'features', 'smoke');

/* ── THE PLAN ──────────────────────────────────────────────────────────────
   [module file name, the anchor substring of its FIRST test's name, what it is]
   Order IS the run order: these tests share one live G and several depend on
   what the last one left behind. Never re-sort this list to tidy it. */
const PLAN = [
  ['boot', 'boot: G defined',
    'boot, icons, the tab registry, the FTUE tour and the painted-art wiring'],
  ['property-and-unlocks', 'b227 regression: building a room repaints the House',
    'the House ladder, server-confirmed unlocks, bank rungs and the gem-spend battery'],
  ['companions-claims-and-renown', 'HATCH-REFUSE-1: under the capstone arm',
    'companion grants, collection/milestone/rank/muster claims and the quest-reward transport'],
  ['rooms-items-and-economy', 'b372: the inspect seam — an item links',
    'room rungs, the item index, workers, pets, traits, bounties, dungeons, market and theme surfaces'],
  ['hunt-raids-and-screens', 'b223: the Hunt ladder — pools scale to the roster',
    'the Hunt and raids, the render/click census, charms, the Depot and the artisan ladders'],
  ['recovery-and-auto-eat', 'AUTOEAT-SYNC-1: a settings change fires exactly ONE',
    'the auto-eat settings sync, the death receipt and the Recovery Rule'],
  ['farm-and-profile', 'b136: HearthriseFarm API + farm_deed item exist',
    'farm plots and replanting, the profile launchpad and the b139-b142 QA batches'],
  ['muster-nav-and-identity', 'FARM-TIER-1: every hr_farm_plant refusal is said by its reason',
    'the plant cliff, muster and rallies, the nav shape and the identity seam'],
  ['clan-seat-and-front-door', 'b222: the four castle goods are stores',
    'the Clan Seat, clan governance, the quest counters and the sign-up door'],
  ['cooking-core-and-save', 'b225: burnChance() is the documented curve',
    'the campfire ruling, the pacing retune, the shared simulation core and the save-system battery'],
  ['bounty-and-artisan', 'BOUNTY-PAY-1: under the gold arm the board posts ONLY settleable',
    'bounty pay and rerolls, the equipment lane, runecrafting, ammo and recipe order'],
  ['quests-chronicle-and-bonus', 'b227: the quest resolver is TOTAL over every live goal pool',
    'quest navigation, the copy gate, the Chronicle and the bonus rebase'],
  ['away-time-and-offline', 'DAILY-SHEET-3 (b475',
    'the daily reward, the hero slot, the away-time unification and the offline honesty surfaces'],
  ['record-seam-and-hydration', 'b515: the b353 kill switch is RETIRED',
    'the server-of-record flips, the record seam, boot hydration and the activity intent'],
  ['market-night-and-prices', 'B354-10/11/12/13: every exit accounts for its prediction',
    'the market gesture, the return ritual, the Hearthfind, retreat and the price catalogue'],
  ['monsters-inventory-and-brand', 'b354: the Build button renders above the scrollable details',
    'the monster roster, elemental enchants, the inventory flip, live settlement and the brand guards'],
];

const die = (msg) => { console.error('split-smoke-suite: ' + msg); process.exit(2); };
const ident = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/* The build number the browser is being served, read rather than typed: a
   specifier written at the wrong version is two module instances of the same
   file (the b493 split-brain), and bump-version.sh --check is what catches it. */
function buildVersion() {
  const info = readFileSync(join(ROOT, 'src', 'build-info.js'), 'utf8');
  const m = /cache\s*:\s*['"]?(\d+)/.exec(info) || /cache\s*=\s*['"]?(\d+)/.exec(info);
  if (!m) die('could not read BUILD.cache from src/build-info.js');
  return m[1];
}

/* Usage is read from CODE, never from prose: the suite is ~40% comment by line
   and a header that says "assert" is not a call site. Strings go too — a test
   NAME containing "skip" must not import skip(). Template literals STAY:
   `${fmt(x)}` is a real call. */
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
const usesName = (text, n) => new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(text);

/** Registered-test elements: their leader line and the comment block above it. */
function elements(L, from, to) {
  const leaders = [];
  for (let n = from; n <= to; n++) if (/^  \(/.test(L[n - 1])) leaders.push(n);
  const starts = [];
  for (let i = 0; i < leaders.length; i++) {
    let s = leaders[i];
    const floor = i === 0 ? from : leaders[i - 1] + 1;
    for (;;) {
      if (s - 1 < floor) break;
      const t = L[s - 2].trim();
      if (t === '') { s--; continue; }
      if (t.startsWith('//')) { s--; continue; }
      if (t.endsWith('*/')) {                       // consume the whole block comment
        let k = s - 1;
        while (k - 1 >= floor && !L[k - 1].trim().startsWith('/*')) k--;
        if (L[k - 1] && L[k - 1].trim().startsWith('/*')) { s = k; continue; }
        break;
      }
      break;
    }
    starts.push(Math.max(s, i === 0 ? from : starts[i - 1] + 1));
  }
  return { leaders, starts };
}

/* One directory deeper: every relative specifier grows one `../`, and a sibling
   of the old file becomes a parent. `./_harness.js` is this tool's own and is
   already correct. Static `from '…'` and dynamic `import('…')` alike. */
function deepen(text) {
  return text
    .replace(/(\bfrom\s*'|\bimport\(\s*')\.\.\//g, '$1../../')
    .replace(/(\bfrom\s*'|\bimport\(\s*')\.\/(?!_harness\.js)/g, '$1../');
}

function main() {
  const text = readFileSync(SRC, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const L = text.split(/\r?\n/);
  const V = '?v=' + buildVersion();

  const open = L.findIndex((s) => /^const TESTS = \[$/.test(s));
  if (open < 0) die('no `const TESTS = [` opener in ' + SRC + ' — is it already split?');
  const close = L.findIndex((s, i) => i > open && /^\];$/.test(s));
  if (close < 0) die('no column-0 `];` closing the TESTS array');
  const BODY_FROM = open + 2, BODY_TO = close;   // 1-based, inclusive

  /* Everything above `const TESTS = [`, MINUS the monolith's own top header:
     this tool writes the harness its own, and keeping both means the same
     paragraph twice — including its build numbers, which tests/
     comment-ratio-ratchet.mjs counts corpus-wide (CR-3) and which therefore
     ROSE on the first cut of this split. Only a leading run of comment and
     blank lines is dropped, never a line of code. */
  let headEnd = 0;
  while (headEnd < open) {
    const t = L[headEnd].trim();
    if (t === '' || t.startsWith('//')) { headEnd++; continue; }
    break;
  }
  const harnessLines = L.slice(headEnd, open);
  const tailLines = L.slice(BODY_TO + 1);        // the runner
  const bodyText = L.slice(BODY_FROM - 1, BODY_TO).join(eol);
  const { leaders, starts } = elements(L, BODY_FROM, BODY_TO);
  if (!leaders.length) die('no registered tests found between the array brackets');

  /* ── anchors → element indices. Exactly one hit each, or stop. ─────────── */
  const cuts = PLAN.map(([file, anchor]) => {
    const hits = [];
    for (let i = 0; i < leaders.length; i++) if (L[leaders[i] - 1].includes(anchor)) hits.push(i);
    if (hits.length !== 1) {
      die(`the anchor for ${file}.js matched ${hits.length} tests, not 1: "${anchor}". `
        + 'A boundary this tool cannot place is a boundary a human must re-state — '
        + 'update PLAN with the name of the test that module now starts with.');
    }
    return hits[0];
  });
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] <= cuts[i - 1]) die(`anchors are out of order: ${PLAN[i][0]} starts at or before ${PLAN[i - 1][0]}. `
      + 'The registry order is the run order; re-state PLAN rather than re-sorting the suite.');
  }
  if (cuts[0] !== 0) die('the first module must start at the first registered test; it starts at element ' + cuts[0]);

  const chunks = PLAN.map(([file, , why], c) => {
    const a = cuts[c];
    const b = c + 1 < cuts.length ? cuts[c + 1] : leaders.length;
    const from = starts[a];
    const to = (b < starts.length ? starts[b] - 1 : BODY_TO);
    return { file, why, from, to, tests: b - a, lines: L.slice(from - 1, to) };
  });

  /* ── THE PURE-MOVE PROOF. Nothing is written unless this holds. ────────── */
  const rebuilt = chunks.map((c) => c.lines.join(eol)).join(eol);
  if (rebuilt !== bodyText) {
    console.error('split-smoke-suite: REASSEMBLY MISMATCH — the chunks are not the body. Nothing written.');
    process.exit(1);
  }

  /* ── the harness: the same lines, plus the `export` keywords ──────────── */
  const decls = [];
  for (const line of harnessLines) {
    const m = /^(?:export\s+)?(?:const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) decls.push(m[1]);
  }
  const imported = [];
  for (const m of harnessLines.join('\n').matchAll(/^import\s*\{([^}]*)\}/gm)) {
    for (const n of m[1].split(',')) { const t = n.trim(); if (t) imported.push(t); }
  }
  const outsideCode = codeOnly(bodyText + '\n' + tailLines.join('\n'));
  const exportedDecls = decls.filter((n) => usesName(outsideCode, n));
  const exportedImports = imported.filter((n) => usesName(outsideCode, n));
  const allNames = [...exportedDecls, ...exportedImports];
  /* Read from the RAW chunk text, comments and all: an over-import costs a
     longer line, a MISSED one is a ReferenceError in a branch nobody took. */
  const needs = (src) => allNames.filter((n) => usesName(src, n));

  const bar = '// ' + '═'.repeat(70);
  const files = [];

  for (const c of chunks) {
    const src = deepen(c.lines.join(eol));
    files.push([c.file + '.js', [
      bar,
      `// src/features/smoke/${c.file}.js — ${c.why}.`,
      '//',
      '// Part of the registered suite. The registry (../smoke-test.js) imports every',
      '// domain module in a FIXED order and concatenates them: these tests run against',
      '// one live G, in order, and the order is the contract. Moved here verbatim from',
      `// the monolith by tools/split-smoke-suite.mjs — ${c.tests} tests, not one renamed.`,
      bar,
      `import { ${needs(src).join(', ')} } from './_harness.js${V}';`,
      '',
      'export default [',
    ].join(eol) + eol + src + eol + '];' + eol]);
  }

  const harnessOut = harnessLines.map((line) => {
    const m = /^(?:const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)/.exec(line);
    return m && exportedDecls.includes(m[1]) ? 'export ' + line : line;
  });
  files.push(['_harness.js', [
    bar,
    "// src/features/smoke/_harness.js — THE SUITE'S FIXTURES, ASSERTIONS AND RUNNERS.",
    '//',
    '// Moved verbatim out of src/features/smoke-test.js: assert/skip, tryRun/tryRunAsync,',
    '// snapshotG/restoreG/sealSnapshot, the fixture factories and the environment probes',
    '// every domain module shares. Nothing here is new — the only edits are the `export`',
    '// keywords and one extra `../` on each specifier, which is what makes one file into',
    '// many. Regenerated by tools/split-smoke-suite.mjs; edit the suite, not this header.',
    '//',
    '// The runner (runSmokeTest) stayed in ../smoke-test.js with the registry, because it',
    '// owns the PLAN and the parks around it, not the fixtures.',
    bar,
  ].join(eol) + eol + deepen(harnessOut.join(eol)) + eol
    + (exportedImports.length
      ? eol + '/* Re-exported for the domain modules: one seam, not four. */' + eol
        + `export { ${exportedImports.join(', ')} };` + eol
      : '')]);

  /* The runner's own import list, and template literals ARE stripped here —
     unlike the modules'. runSmokeTest prints its diagnostic through
     `console.log(\`… assert(true) skip sites …\`)`, so the module-side rule
     (keep templates, over-import is free) hands this one file two imports it
     never calls. The four names it really uses are exercised on EVERY run, so a
     name lost here cannot reach a green build. */
  const runnerCode = codeOnly(tailLines.join('\n')).replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const runnerNeeds = allNames.filter((n) => usesName(runnerCode, n));
  const regHead = [
    "// Smoke test registry — the suite's ONE plan and its runner.",
    '//',
    '// This file was 65,656 lines. The fixtures moved to smoke/_harness.js and the tests',
    '// to smoke/<domain>.js; what is left is the registry and runSmokeTest(). Reads game',
    '// state via window.G (legacy compat). Regenerated by tools/split-smoke-suite.mjs.',
    '//',
    '// NEVER SENT TO A PLAYER. A dynamic import owned by smoke-test-loader.js, which owns',
    '// all three triggers too; read its header. Guard: tests/boot-budget.mjs.',
    '//',
    '// THE ORDER OF THE IMPORTS BELOW IS THE ORDER THE SUITE RUNS IN. These tests mutate',
    '// one live G and several depend on what the previous one left behind, so the',
    '// concatenation below is a CONTRACT, not a convenience. Add a domain module where its',
    '// tests used to sit; never re-sort this list to tidy it.',
    `import { ${runnerNeeds.join(', ')} } from './smoke/_harness.js${V}';`,
    ...chunks.map((c) => `import ${ident(c.file)} from './smoke/${c.file}.js${V}';`),
    '',
    'const TESTS = [].concat(',
  ];
  const args = [];
  for (let i = 0; i < chunks.length; i += 3) {
    args.push('  ' + chunks.slice(i, i + 3).map((c) => ident(c.file)).join(', ') + ',');
  }
  const registry = regHead.join(eol) + eol + args.join(eol) + eol + ');' + eol + eol + tailLines.join(eol);

  console.log(`  tests ${leaders.length} across ${chunks.length} module(s); body ${bodyText.split(eol).length} lines`);
  for (const c of chunks) console.log(`  ${String(c.tests).padStart(5)}  ${c.file}.js  (${c.lines.length} lines)`);
  console.log('  ✓ reassembly is byte-identical to the TESTS body');

  if (DRY) { console.log('  --dry-run: nothing written'); return 0; }

  mkdirSync(OUTDIR, { recursive: true });
  /* A module this plan no longer produces must not be left behind: the registry
     would stop importing it and the corpus ratchets would keep counting it. */
  const want = new Set(files.map(([n]) => n));
  if (existsSync(OUTDIR)) {
    for (const n of readdirSync(OUTDIR)) {
      if (n.endsWith('.js') && !want.has(n)) { unlinkSync(join(OUTDIR, n)); console.log('  removed stale module ' + n); }
    }
  }
  for (const [name, body] of files) writeFileSync(join(OUTDIR, name), body, 'utf8');
  writeFileSync(join(ROOT, 'src', 'features', 'smoke-test.js'), registry, 'utf8');
  console.log('  written: ' + files.length + ' module(s) + the registry');
  return 0;
}

process.exit(main());
