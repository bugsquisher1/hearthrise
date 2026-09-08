#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/test-file-ratchet.mjs — THE SUITE MAY GROW; THE COST PER TEST MAY NOT
//                                (cleanup slice 1b)
//
//   node tests/test-file-ratchet.mjs             gate against the baseline
//   node tests/test-file-ratchet.mjs --report    print the tables, gate too
//   node tests/test-file-ratchet.mjs --write     re-record the baseline
//   node tests/test-file-ratchet.mjs --selftest  mutation proof
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// src/features/smoke-test.js was 16,008 lines on 2026-08-10 and is 57,853 today
// — it has more than TRIPLED in four weeks, and it is now the largest file in
// the repository by a factor of two and a half. That growth is not the problem
// on its own: the suite got much better in those four weeks and the tests are
// real. Two things inside it are the problem, and neither is visible from the
// line count:
//
//   1. CODE LINES PER TEST. A suite that adds 1,000 tests and 40,000 lines is
//      healthy. A suite that adds 40,000 lines and 100 tests is a suite where
//      each new test costs 400 lines of scaffolding — setup nobody can reuse,
//      copy-pasted fixtures, and preamble. Only the RATIO tells them apart.
//
//   2. SEEDS VERSUS GESTURES. The audit measured 3,054 direct `G.*` writes
//      against 346 player gestures — 9 seeded beliefs for every simulated
//      action. A test that writes `G.gold = 500` and then asserts the shop is
//      affordable is testing the client's own opinion of its own state. It
//      passes on a build where the server never sends gold at all, which is
//      exactly the class of defect this repo keeps shipping (the attended-settle
//      gap, the phantom quest rewards, the residue-ahead property deadlock).
//      Every seed is a place where the test agreed with the code instead of
//      checking it.
//
// This ratchets both ratios. Neither number is asked to fall today. Neither may
// rise beyond a stated band.
//
// ── RE-SPECIFIED 2026-09-07, AND WHY (a bare average is not a ceiling) ───────
// TF-1/TF-2 shipped as a ceiling on the corpus AVERAGE: mean ≤ mean-at-baseline.
// That predicate is unsatisfiable by any honest test above the mean — which is
// arithmetic, not a judgement. Add ONE test costing more than today's average
// and the average rises; the guard is red; the only compliant test is one at or
// below the mean, and each such test drags the mean down so the next one must be
// leaner still. A guard that forbids a thorough test and rewards a terse one is
// pointed the wrong way, and it went red on its first real build — ten honest
// tests carrying both-path setup (CLAUDE.md §4 requires an ATTENDED and an AWAY
// arm for anything touching combat, death, activity, accrual or receipts).
//
// Three changes, and the intent is unchanged:
//
//   (a) CODE LINES, not physical lines. A well-explained test must not cost more
//       than a terse one. The classifier is IMPORTED from
//       comment-ratio-ratchet.mjs rather than re-written, so the two guards can
//       never disagree about what a code line is — and the prose stays ratcheted
//       there, where it belongs, instead of twice or nowhere.
//   (b) AN ABSOLUTE BAND of +1% (`now <= baseline * 1.01`). MEASURED, not
//       guessed: at today's 1,176 tests and 33.32 code lines each, +1% is 392
//       code lines of slack across the WHOLE corpus. That is wide enough for
//       ten honest both-path tests above the mean (the build this re-spec was
//       written for spent 0.2% of it) and narrow enough that a 1,000-line
//       scaffold for one test is red on its own. A single 400-line scaffold
//       sits just inside it — and that is the honest cost of a band, stated
//       rather than hidden, because (c) is what stops it being paid twice.
//   (c) `--write` RE-PINS ONLY DOWNWARD, which is what makes the band a ONE-OFF
//       rather than an allowance. Without it the band compounds: drift 1%,
//       re-pin, drift another 1%, and the ceiling walks. The pinned number is
//       min(today, previously pinned), so the band is always measured against
//       the best the corpus has ever been — spend it on one bad scaffold and the
//       next one is red, which is proven by an arm below.
//
// TF-3 is unchanged and is what stops any of this being satisfied by deleting
// tests.
//
// ── BUILT FOR THE SPLIT THAT IS COMING ──────────────────────────────────────
// CLEANUP_PROGRAM slice 6 splits this file into ~20 modules as a PURE MOVE with
// zero test-body edits. A guard keyed on `src/features/smoke-test.js`'s own line
// count would go red on that move — the single most important refactor in the
// plan — and would then be "temporarily" disabled, which is how guards die. So
// the measurement is over a CORPUS, not a file: smoke-test.js plus everything
// under src/features/smoke/. A pure move leaves both the numerator and the
// denominator identical and the guard silent. The per-file table is still
// printed, because "which module is the wordy one" is the question slice 6
// leaves behind.
//
// ── WHAT IS RATCHETED ───────────────────────────────────────────────────────
//   TF-1  corpus CODE LINES ÷ registered tests      (ceiling, +1% band)
//   TF-2  corpus direct `G.*` seeds ÷ registered tests (ceiling, +1% band)
//   TF-3  registered tests may not FALL. A ceiling on a ratio is trivially
//         satisfied by deleting tests; this is what makes TF-1/TF-2 mean what
//         they say. (CLAUDE.md §4: never disable a failing test to unblock.)
//
// ── COUNTING (the method, printed by --report so it is never folklore) ──────
//  · A REGISTERED TEST is a `tryRun(` or `tryRunAsync(` call site — the two
//    runners in this harness. Their own definitions are excluded by requiring a
//    call, not a declaration.
//  · A SEED is a direct write to game state: `G.x = `, `G.x.y = `, `G['x'] = `,
//    `window.G.…`, including compound writes (`+=`, `-=`). Comparisons (`==`,
//    `===`, `>=`, `<=`, `!=`) are not writes and are excluded; a `G.` read is
//    not a seed.
//  · A GESTURE is a call that drives the UI the way a player does — `.click()`,
//    `clickOk(`, `callOk(`, `dispatchEvent(`, `showTab(`, `.focus(`, `.submit(`.
//    `showTab(` is in the set on purpose and is most of it: changing screen is
//    the single most common thing a player of this game does. Counted and
//    printed beside the seeds so the ratio is visible, but NOT ratcheted —
//    driving the UI more is always welcome.
//  · A CODE LINE is a physical line that is neither blank nor comment, by
//    comment-ratio-ratchet.mjs's `classify()` — the SAME reader, imported, so a
//    line cannot be a comment to one guard and code to the other. Physical lines
//    are still measured and printed (they are what a reader scrolls past) but
//    TF-1 spends the code count, because the prose is already ratcheted next
//    door and charging for it twice would make a well-explained test the
//    expensive one.
//
// Credential-free, database-free, milliseconds.
// Exit: 0 green (or green-with-note) · 1 a ratio rose · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
/* ONE definition of "a code line" for both debt ratchets. Imported, not copied:
   a second classifier is a second opinion, and the day they disagree the cheaper
   one wins an argument nobody knew was happening. No `?v=` — tests/**, not a
   browser module (CLAUDE.md §5). */
import { classify } from './comment-ratio-ratchet.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'test-file-ratchet.baseline.json');

/** The corpus: the monolithic suite today, and the modules slice 6 will make. */
const CORPUS_FILE = 'src/features/smoke-test.js';
const CORPUS_DIR = 'src/features/smoke';

/** Float slack: an arithmetically equal ratio must never read as a rise. */
const EPS = 1e-9;
/** The band. A ratio may sit up to this far above the pinned one before it is a
 *  failure — see the header. 1% of the CORPUS, which is roughly one bad test's
 *  worth of scaffolding and no more. */
export const BAND = 1.01;

/* A registered test. Both runners, as CALLS (`(` follows), so their own
   `const tryRun = …` definitions are not counted as tests. */
const TEST_RE = /\btryRun(?:Async)?\s*\(/g;
/* A direct write to game state. `=` not followed by `=`, and not preceded by
   one of the comparison/arrow characters, so `G.x === 1`, `G.x >= 1`, `G.x != 1`
   and `G.x <= 1` are reads, not seeds. */
const SEED_RE = /\bG(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]*\])+\s*(?:\+|-|\*|\/|\|\||\?\?)?=(?!=)/g;
/* A call that drives the UI the way a player does. Informational, never ratcheted. */
const GESTURE_RE = /\.click\s*\(|\bclickOk\s*\(|\bcallOk\s*\(|\bdispatchEvent\s*\(|\bshowTab\s*\(|\.focus\s*\(|\.submit\s*\(/g;

const count = (text, re) => (text.match(re) || []).length;

/** Pure: text in, three numbers out. --selftest feeds it synthetic sources. */
export function countFile(text) {
  const c = classify(text);
  return {
    lines: text.split(/\r?\n/).length,
    codeLines: c.code,
    tests: count(text, TEST_RE),
    seeds: count(text, SEED_RE),
    gestures: count(text, GESTURE_RE),
  };
}

/** The pinned value a `--write` may record: today's, or the previously pinned
 *  one if that was lower. One-way, so the +1% band cannot be walked upward one
 *  re-pin at a time. */
export function pinDown(today, previous) {
  const was = Number(previous);
  return Number.isFinite(was) ? Math.min(today, was) : today;
}

function corpusFiles(root) {
  const out = [];
  const one = join(root, CORPUS_FILE);
  if (existsSync(one)) out.push(CORPUS_FILE);
  const dir = join(root, CORPUS_DIR);
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js')) out.push(CORPUS_DIR + '/' + relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function measure(root) {
  const files = corpusFiles(root).map((rel) => ({ file: rel, ...countFile(readFileSync(join(root, rel), 'utf8')) }));
  const sum = (k) => files.reduce((n, f) => n + f[k], 0);
  const tests = sum('tests');
  const lines = sum('lines');
  const codeLines = sum('codeLines');
  const seeds = sum('seeds');
  const gestures = sum('gestures');
  return {
    files, lines, codeLines, tests, seeds, gestures,
    linesPerTest: tests ? lines / tests : (lines ? Infinity : 0),
    codeLinesPerTest: tests ? codeLines / tests : (codeLines ? Infinity : 0),
    seedsPerTest: tests ? seeds / tests : (seeds ? Infinity : 0),
    seedsPerGesture: gestures ? seeds / gestures : (seeds ? Infinity : 0),
  };
}

export function compare(now, base) {
  const problems = [];
  const notes = [];
  const fail = (check, message) => problems.push({ check, message });
  const b = base || {};

  /* THE BAND IS ABSOLUTE AND IT IS MEASURED FROM THE PINNED NUMBER, never from
     last run — see the header. `ceiling` is what a reader needs printed, because
     "ROSE 49.70 → 49.71" on a guard with a band reads like a failure that is not
     one. */
  const banded = (check, label, n, o, why) => {
    if (!Number.isFinite(o)) { notes.push(`${label}: no baseline (${n.toFixed(2)}) — run --write`); return; }
    const ceiling = o * BAND;
    if (n > ceiling + EPS) {
      problems.push({ check, message: `${label} ROSE ${o.toFixed(2)} → ${n.toFixed(2)}, past the `
        + `+${((BAND - 1) * 100).toFixed(0)}% band (ceiling ${ceiling.toFixed(2)}). ${why}` });
    } else if (n < o - EPS) {
      notes.push(`${label} fell ${o.toFixed(2)} → ${n.toFixed(2)} — run --write to lower the ceiling`);
    } else if (n > o + EPS) {
      notes.push(`${label} ${o.toFixed(2)} → ${n.toFixed(2)}, inside the `
        + `+${((BAND - 1) * 100).toFixed(0)}% band (ceiling ${ceiling.toFixed(2)}) — allowed, and `
        + 'the baseline does NOT move up');
    }
  };

  banded('TF-1', 'CODE lines per registered test', now.codeLinesPerTest, b.codeLinesPerTest,
    'The suite may grow as fast as it likes — this asks that each new test cost no more '
    + 'scaffolding than the average test costs today, give or take the band. If the setup is '
    + 'genuinely large, it is a helper, and a helper is written once. Comments are NOT counted: '
    + 'explaining a test is free here and is ratcheted by comment-ratio-ratchet.mjs instead.');
  banded('TF-2', 'direct G.* seeds per registered test', now.seedsPerTest, b.seedsPerTest,
    'A seeded belief is not a tested behaviour: `G.gold = 500` then "the shop is affordable" '
    + 'passes on a build where the server never sends gold at all. Prefer a gesture, or assert '
    + 'against the envelope the server actually returns.');

  if (!Number.isFinite(b.tests)) notes.push(`registered tests: no baseline (${now.tests}) — run --write`);
  else if (now.tests < b.tests) {
    fail('TF-3', `registered tests FELL ${b.tests} → ${now.tests} (-${b.tests - now.tests}). Deleting `
      + 'tests satisfies every ratio above, which is why this exists. CLAUDE.md §4: never disable a '
      + 'failing test to unblock a push — the test is the contract. If a test was legitimately '
      + 'retired, --write in the same commit and say which one in the message.');
  } else if (now.tests > b.tests) {
    notes.push(`registered tests rose ${b.tests} → ${now.tests} (+${now.tests - b.tests}) — run --write`);
  }

  if (Number.isFinite(b.files) && now.files.length !== b.files) {
    notes.push(`corpus is ${now.files.length} file(s), baseline had ${b.files}`
      + (now.files.length > 1 ? ' — slice 6\'s split is under way' : '') + '; run --write');
  }
  return { problems, notes };
}

const METHOD = `corpus = ${CORPUS_FILE} + ${CORPUS_DIR}/**.js (so slice 6's pure-move split leaves `
  + 'every number identical); a registered test = a `tryRun(` / `tryRunAsync(` CALL; a seed = a '
  + 'direct write to G.x / G["x"] / window.G.… including compound assignment, comparisons excluded; '
  + 'a gesture = .click( / clickOk( / callOk( / dispatchEvent( / showTab( / .focus( / .submit( and is '
  + 'reported but NEVER ratcheted; TF-1 spends CODE lines (blank and comment lines stripped by '
  + "comment-ratio-ratchet.mjs's own classify(), imported so the two guards cannot disagree), "
  + 'physical lines are printed only; each ratio carries an absolute +1% band and `--write` pins '
  + 'a ratio only DOWNWARD so the band cannot compound';

function printReport(now, base) {
  console.log('  method: ' + METHOD);
  console.log('\n  file                                   lines    code   tests   seeds  gest  code/test');
  for (const f of now.files) {
    console.log('    ' + f.file.padEnd(35) + String(f.lines).padStart(7) + String(f.codeLines).padStart(8)
      + String(f.tests).padStart(8) + String(f.seeds).padStart(8) + String(f.gestures).padStart(6)
      + (f.tests ? (f.codeLines / f.tests).toFixed(1) : '—').padStart(11));
  }
  console.log('    ' + 'CORPUS'.padEnd(35) + String(now.lines).padStart(7) + String(now.codeLines).padStart(8)
    + String(now.tests).padStart(8) + String(now.seeds).padStart(8) + String(now.gestures).padStart(6)
    + now.codeLinesPerTest.toFixed(1).padStart(11));
  const c = (o) => (Number.isFinite(o)
    ? `  (pinned ${o.toFixed(2)}, ceiling ${(o * BAND).toFixed(2)} at +${((BAND - 1) * 100).toFixed(0)}%)` : '');
  console.log(`\n  TF-1  CODE lines per test      ${now.codeLinesPerTest.toFixed(2).padStart(8)}`
    + c(base && base.codeLinesPerTest));
  console.log(`        physical lines per test  ${now.linesPerTest.toFixed(2).padStart(8)}   (not ratcheted)`);
  console.log(`  TF-2  G.* seeds per test       ${now.seedsPerTest.toFixed(2).padStart(8)}`
    + c(base && base.seedsPerTest));
  console.log(`  TF-3  registered tests         ${String(now.tests).padStart(8)}`
    + (base && Number.isFinite(base.tests) ? `  (floor ${base.tests})` : ''));
  console.log(`\n  seeds : gestures = ${now.seedsPerGesture.toFixed(1)} : 1  `
    + `(${now.seeds} seeded beliefs against ${now.gestures} simulated actions).`);
  console.log('  The 2026-09-06 audit reported 3,054 : 346 (9:1) by a broader seed pattern; the');
  console.log('  method above is this guard\'s, is printed, and is the one the baseline was cut with.');
  console.log('  Not ratcheted: driving the UI more is always welcome, and the ratio falls when');
  console.log('  a seed becomes a gesture, which is the conversion CLEANUP_PROGRAM parks after slice 6.');
}

export function run(argv = []) {
  const now = measure(ROOT);
  if (argv.includes('--write')) {
    const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
    writeFileSync(BASELINE, JSON.stringify({
      _why: 'CEILINGS on the COST of a test and a FLOOR under the number of them. The suite may '
        + 'grow; the CODE lines per test and the seeded beliefs per test may not, beyond an '
        + 'absolute +1% band. `codeLinesPerTest` and `seedsPerTest` are pinned only DOWNWARD — a '
        + 'ratio that sat inside the band does NOT become the new ceiling, or the band would walk. '
        + 'Regenerated by `node tests/test-file-ratchet.mjs --write` when a number improves — never '
        + 'to make a red build green (CLAUDE.md §2).',
      _method: METHOD,
      measured: new Date().toISOString().slice(0, 10),
      files: now.files.length,
      lines: now.lines,
      codeLines: now.codeLines,
      tests: now.tests,
      seeds: now.seeds,
      gestures: now.gestures,
      linesPerTest: now.linesPerTest,
      codeLinesPerTest: pinDown(now.codeLinesPerTest, prev.codeLinesPerTest),
      seedsPerTest: pinDown(now.seedsPerTest, prev.seedsPerTest),
      seedsPerGesture: now.seedsPerGesture,
    }, null, 2) + '\n');
    printReport(now, null);
    console.log('\n✓ baseline written → tests/test-file-ratchet.baseline.json');
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('TEST-FILE-RATCHET: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { problems, notes } = compare(now, base);
  if (argv.includes('--report')) printReport(now, base);

  if (problems.length) {
    console.error(`  ✗ test-file ratchet: ${problems.length} number(s) moved the WRONG way`);
    for (const p of problems) console.error(`      ${p.check}  ${p.message}`);
    console.error(`\n  corpus today: ${now.lines} lines (${now.codeLines} code) / ${now.tests} tests `
      + `/ ${now.seeds} seeds / ${now.gestures} gestures.`);
    return 1;
  }
  console.log(`✓ test-file ratchet: ${now.tests} registered tests over ${now.files.length} file(s) — `
    + `${now.codeLinesPerTest.toFixed(1)} CODE lines (${now.linesPerTest.toFixed(1)} physical) and `
    + `${now.seedsPerTest.toFixed(2)} G.* seeds per test `
    + `(seeds:gestures ${now.seedsPerGesture.toFixed(1)}:1) — none rose past the band`);
  for (const n of notes) console.log(`      ${n}`);
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   The COUNTERS first, on synthetic sources with a known answer — a counter that
   is wrong is green forever and makes every arm below meaningless. Then one
   planted defect per assertion, each required to be caught BY ITS NAMED CHECK.
   Then THE ONE THAT MATTERS: slice 6's pure move, simulated exactly (the same
   text redistributed across 20 files), which must be completely silent. */
function selftest() {
  let bad = 0;
  const say = (ok, label, extra = '') => {
    if (ok) console.log(`  ok       ${label}${extra}`);
    else { bad++; console.log(`  WRONG    ${label}${extra}`); }
  };

  console.log('test-file-ratchet --selftest\n  ── the COUNTERS (a wrong counter is green forever) ──');
  const cc = [
    ['a tryRun call is a test', "tryRun('x', () => {});", { tests: 1 }],
    ['a tryRunAsync call is a test', "tryRunAsync('x', async () => {});", { tests: 1 }],
    ['the runner DEFINITION is not a test', 'const tryRun = (name, fn) => {};', { tests: 0 }],
    ['a G.x write is a seed', 'G.gold = 500;', { seeds: 1 }],
    ['a nested G.x.y write is a seed', 'G.stats.deaths = 3;', { seeds: 1 }],
    ['a bracket write is a seed', "G['gold'] = 500;", { seeds: 1 }],
    ['a window.G write is a seed', 'window.G.gold = 500;', { seeds: 1 }],
    ['a compound write is a seed', 'G.gold += 500;', { seeds: 1 }],
    ['a strict comparison is NOT a seed', 'if (G.gold === 500) {}', { seeds: 0 }],
    ['a loose comparison is NOT a seed', 'if (G.gold == 500) {}', { seeds: 0 }],
    ['>= is NOT a seed', 'if (G.gold >= 500) {}', { seeds: 0 }],
    ['!= is NOT a seed', 'if (G.gold != 500) {}', { seeds: 0 }],
    ['a plain READ is NOT a seed', 'const g = G.gold;', { seeds: 0 }],
    ['a click is a gesture', 'el.click();', { gestures: 1 }],
    ['clickOk is a gesture', "clickOk(el, 'fight');", { gestures: 1 }],
    ['dispatchEvent is a gesture', "el.dispatchEvent(new Event('input'));", { gestures: 1 }],
    ['showTab is a gesture — changing screen is what a player does', "showTab('combat');", { gestures: 1 }],
    ['a bare word is not a gesture', 'const noClicking = 1;', { gestures: 0 }],
    /* THE CODE-LINE READER — (a) of the re-spec. Explaining a test must be free
       here, or a well-explained test costs more than a terse one and the guard
       is pushing the wrong way. The classifier is comment-ratio-ratchet's. */
    ['a code line is a code line', 'G.gold = 1;', { lines: 1, codeLines: 1 }],
    ['a // comment is NOT a code line', '// why this matters', { lines: 1, codeLines: 0 }],
    ['a /* block */ comment is NOT code', '/*\n * three\n */', { lines: 3, codeLines: 0 }],
    ['a blank line is NOT code', '\n\n', { lines: 3, codeLines: 0 }],
    ['code with a TRAILING comment IS code', 'G.gold = 1; // why', { lines: 1, codeLines: 1 }],
    ['a 6-line test with 3 lines of prose costs 3', "// a\n/* b\n c */\ntryRun('x', () => {\n  G.g = 1;\n});",
      { lines: 6, codeLines: 3, tests: 1 }],
  ];
  for (const [label, src, want] of cc) {
    const g = countFile(src);
    const ok = Object.entries(want).every(([k, v]) => g[k] === v);
    say(ok, label, `  → lines ${g.lines} code ${g.codeLines} tests ${g.tests} seeds ${g.seeds} gestures ${g.gestures}`);
  }

  console.log('\n  ── THE BAND AND THE DOWN-ONLY PIN (the 2026-09-07 re-specification) ──');
  const pins = [
    ['a first pin takes today\'s ratio', 50, undefined, 50],
    ['a ratio that IMPROVED is pinned', 47, 50, 47],
    ['a ratio that drifted up inside the band is NOT pinned', 50.4, 50, 50],
    ['…so the band cannot be walked: two drifts still measure from 50', 50.9, 50, 50],
  ];
  for (const [label, today, prev, want] of pins) {
    const got = pinDown(today, prev);
    say(got === want, label, `  → pinned ${got} (want ${want})`);
  }
  say(Math.abs(BAND - 1.01) < 1e-12, 'the band is +1%, stated as a constant', `  → ${BAND}`);

  console.log('\n  ── the COMPARATOR ──');
  if (!existsSync(BASELINE)) { console.error('SELFTEST: no baseline; run --write first.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const real = measure(ROOT);
  const clean = compare(real, base);
  if (clean.problems.length) {
    console.error('SELFTEST HARNESS: the UNMUTATED tree already reports problems:');
    for (const p of clean.problems) console.error(`    ${p.check}  ${p.message}`);
    return 2;
  }
  console.log('  false-positive floor: the real corpus reports 0 problems');

  const derived = (m) => ({
    ...m,
    linesPerTest: m.tests ? m.lines / m.tests : Infinity,
    codeLinesPerTest: m.tests ? m.codeLines / m.tests : Infinity,
    seedsPerTest: m.tests ? m.seeds / m.tests : Infinity,
    seedsPerGesture: m.gestures ? m.seeds / m.gestures : Infinity,
  });
  /* ⚠ ANCHORED ON THE PINNED NUMBERS, not on today's corpus. An arm that adds a
     delta to today only bites while the tree happens to sit ON its ceiling; the
     moment a build pays some debt down, the arm goes quiet and reports itself
     green. Each arm below therefore SETS the ratio to a stated multiple of the
     baseline, so the proof holds however much slack the corpus has. */
  /* ⚠ AND EACH ARM HOLDS EVERY OTHER AXIS AT ITS PINNED VALUE, not just the one
     under test. `tests` is set to `base.tests`, so an arm that patched only ONE
     numerator left the other ratios divided by the wrong denominator — at 1,205
     tests against a pinned 1,178 that made the TF-1 arm report TF-2 and the TF-2
     arm report TF-1, and at 1,180 the "+0.5% — inside the band" CONTROL carried
     1,180 tests' worth of seeds over 1,178 tests and reported TF-2. Both were
     harness bugs, not regressions (MEASURED on the assembled tree, 2026-09-08).
     Every arm therefore starts from the baseline corpus exactly on every axis
     and multiplies ONE ratio. */
  const pinned = ({ code = 1, seed = 1 }) => ({
    tests: base.tests,
    lines: Math.round(base.linesPerTest * base.tests),
    codeLines: Math.round(base.codeLinesPerTest * code * base.tests),
    seeds: Math.round(base.seedsPerTest * seed * base.tests),
    gestures: real.gestures,
  });
  const atRatio = (mult) => pinned({ code: mult });
  const atSeeds = (mult) => pinned({ seed: mult });
  const bend = (patch) => compare(derived({ ...real, ...patch }), base);

  const arms = [
    ['the cost per test is +2% — outside the band', 'TF-1', atRatio(1.02)],
    ['1,000 CODE lines of scaffolding added for 1 new test', 'TF-1',
      { codeLines: real.codeLines + 1000, lines: real.lines + 1000, tests: real.tests + 1 }],
    /* THE BAND IS SPENT ONCE. A 400-line scaffold fits inside it (see the
       header) — but `--write` never pins a drift upward, so the SECOND one
       measures from the same baseline and is red. This is the arm that makes
       (c) load-bearing rather than decorative. */
    ['a second 400-line scaffold, after the first already spent the band', 'TF-1',
      { codeLines: real.codeLines + 800, lines: real.lines + 800, tests: real.tests + 2 }],
    ['the seeds per test are +2% — outside the band', 'TF-2', atSeeds(1.02)],
    /* THE COUNT IS ARITHMETIC, NOT A TASTE. The band is 1% of the CORPUS's
       seeds, so at the pinned 1,178 tests it is ~24 seeds wide: an arm written
       as "20 seeds for one test" asserted something the band ALLOWS and passed
       only while the anchoring bug above made it fire for the wrong reason.
       60 is the same defect, stated at a size this band can see. */
    ['60 new `G.x = …` seeds added for 1 new test', 'TF-2',
      { lines: real.lines + 40, codeLines: Math.round(base.codeLinesPerTest * base.tests) + 30,
        tests: base.tests + 1, seeds: Math.round(base.seedsPerTest * base.tests) + 60 }],
    /* `base.tests - 1`, NOT `real.tests - 1` — the ⚠ above, which this arm was
       the one exception to. TF-3 fires on `now.tests < baseline.tests`, so a
       delta off TODAY goes quiet the moment the suite grows past the pin: at
       1,180 tests against a pinned 1,178 this arm deleted a test and still
       reported green (MEASURED on the assembled tree, 2026-09-07). */
    ['a test deleted to make the ratios look better', 'TF-3',
      { tests: base.tests - 1, lines: real.lines - 400, codeLines: real.codeLines - 300 }],
    /* THE CLAUSE THE RE-SPEC MUST NOT LOSE. Both ratios fall when tests are
       deleted, so without TF-3 the cheapest way to green a red build is to
       delete the tests that made it red. Proven at the BAND's edge, where a
       lazier guard would let it through. */
    ['deleting 100 tests to buy ratio headroom', 'TF-3',
      { tests: base.tests - 100, codeLines: Math.round(base.codeLinesPerTest * (base.tests - 100)),
        seeds: Math.round(base.seedsPerTest * (base.tests - 100)) }],
  ];
  for (const [label, check, patch] of arms) {
    const got = bend(patch);
    const hit = got.problems.filter((p) => p.check === check);
    if (hit.length) console.log(`  CAUGHT   ${label}\n           ${check}: ${hit[0].message.split('. ')[0]}.`);
    else {
      bad++;
      console.log(`  MISSED   ${label} — ${check} never fired`
        + (got.problems.length ? ` (only: ${got.problems.map((p) => p.check).join(', ')})` : ' (no problem at all)'));
    }
  }

  const silent = [
    ['ALLOWED: the cost per test is +0.5% — inside the band', atRatio(1.005)],
    ['ALLOWED: the seeds per test are +0.5% — inside the band', atSeeds(1.005)],
    /* (a) OF THE RE-SPEC, AS AN ASSERTION: 2,000 lines of PROSE and not one line
       of code. Under the old physical-line rule this was a TF-1 failure — the
       guard charged a test for being explained. The prose is still ratcheted, in
       comment-ratio-ratchet.mjs, where it is the subject rather than a proxy. */
    ['ALLOWED: 2,000 lines of COMMENT added and zero code',
      { lines: real.lines + 2000 }],
    ['ALLOWED: 100 new tests at the PINNED average cost',
      { lines: Math.floor(real.lines + 100 * real.linesPerTest),
        codeLines: Math.floor(real.codeLines + 100 * base.codeLinesPerTest),
        tests: real.tests + 100,
        seeds: Math.floor(real.seeds + 100 * base.seedsPerTest) }],
    ['ALLOWED: a lean new test — 40 lines, 0 seeds',
      { lines: real.lines + 40, codeLines: real.codeLines + 25, tests: real.tests + 1 }],
    ['ALLOWED: 500 seeds converted into gestures',
      { seeds: real.seeds - 500, gestures: real.gestures + 500 }],
  ];
  for (const [label, patch] of silent) {
    const got = bend(patch);
    if (got.problems.length) {
      bad++;
      console.log(`  FALSE +  ${label} — reported ${got.problems.map((p) => p.check).join(', ')}`);
    } else console.log(`  silent   ${label}`);
  }

  // ── SLICE 6's PURE MOVE. The single reason this guard measures a corpus.
  // The same bytes, redistributed across 20 modules, with the monolith left as a
  // 1-line index. Every ratio must be UNCHANGED and the guard must be silent —
  // if it is not, the most important refactor in the plan arrives at a red build
  // and this guard is what gets switched off.
  console.log('\n  ── SLICE 6: the pure move ──');
  {
    const N = 20;
    const per = {
      lines: Math.floor((real.lines - 1) / N), codeLines: Math.floor(real.codeLines / N),
      tests: Math.floor(real.tests / N),
      seeds: Math.floor(real.seeds / N), gestures: Math.floor(real.gestures / N),
    };
    const files = [{ file: CORPUS_FILE, lines: 1, codeLines: 0, tests: 0, seeds: 0, gestures: 0 }];
    for (let i = 0; i < N; i++) files.push({ file: `${CORPUS_DIR}/part-${i}.js`, ...per });
    // the remainders stay with the last module, so the corpus totals are exact
    const last = files[files.length - 1];
    last.lines += (real.lines - 1) - per.lines * N;
    last.codeLines += real.codeLines - per.codeLines * N;
    last.tests += real.tests - per.tests * N;
    last.seeds += real.seeds - per.seeds * N;
    last.gestures += real.gestures - per.gestures * N;

    const moved = derived({
      files, lines: files.reduce((n, f) => n + f.lines, 0),
      codeLines: files.reduce((n, f) => n + f.codeLines, 0),
      tests: files.reduce((n, f) => n + f.tests, 0),
      seeds: files.reduce((n, f) => n + f.seeds, 0), gestures: files.reduce((n, f) => n + f.gestures, 0),
    });
    say(moved.lines === real.lines && moved.codeLines === real.codeLines
      && moved.tests === real.tests && moved.seeds === real.seeds,
      'the simulated move conserves the corpus',
      `  → ${moved.lines} lines / ${moved.codeLines} code / ${moved.tests} tests`);
    const got = compare(moved, base);
    say(got.problems.length === 0,
      `smoke-test.js → 1 line + ${N} modules is SILENT (the ratchet survives slice 6)`,
      `  → ${got.problems.length ? got.problems.map((p) => p.check).join(',') : '0 problems'}`);
    say(got.notes.some((n) => n.includes('corpus is')),
      '…and it says the corpus changed shape, so --write is not forgotten');

    // and the move must not become a hiding place: 400 lines added DURING it
    const sneaky = derived({ ...moved, lines: moved.lines + 1000,
      codeLines: moved.codeLines + 1000, tests: moved.tests + 1 });
    say(compare(sneaky, base).problems.some((p) => p.check === 'TF-1'),
      'a move that also adds 1,000 code lines for 1 test is still caught');
  }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED`
    : `${cc.length} counter cases correct, all ${arms.length} defects caught by their named `
      + `assertion, ${silent.length} legal changes silent, and slice 6's pure move proven silent`}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/test-file-ratchet.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
