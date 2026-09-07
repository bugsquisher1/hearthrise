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
//   1. LINES PER TEST. A suite that adds 1,000 tests and 40,000 lines is
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
// rise.
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
//   TF-1  corpus LINES ÷ registered tests           (ceiling)
//   TF-2  corpus direct `G.*` seeds ÷ registered tests (ceiling — the 9:1)
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
//  · Lines are physical lines. Comments are NOT excluded here; the file's prose
//    is ratcheted separately by tests/comment-ratio-ratchet.mjs, and excluding
//    it twice would let one debt hide inside the other's headroom.
//
// Credential-free, database-free, milliseconds.
// Exit: 0 green (or green-with-note) · 1 a ratio rose · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'test-file-ratchet.baseline.json');

/** The corpus: the monolithic suite today, and the modules slice 6 will make. */
const CORPUS_FILE = 'src/features/smoke-test.js';
const CORPUS_DIR = 'src/features/smoke';

/** Float slack: an arithmetically equal ratio must never read as a rise. */
const EPS = 1e-9;

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
  return {
    lines: text.split(/\r?\n/).length,
    tests: count(text, TEST_RE),
    seeds: count(text, SEED_RE),
    gestures: count(text, GESTURE_RE),
  };
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
  const seeds = sum('seeds');
  const gestures = sum('gestures');
  return {
    files, lines, tests, seeds, gestures,
    linesPerTest: tests ? lines / tests : (lines ? Infinity : 0),
    seedsPerTest: tests ? seeds / tests : (seeds ? Infinity : 0),
    seedsPerGesture: gestures ? seeds / gestures : (seeds ? Infinity : 0),
  };
}

export function compare(now, base) {
  const problems = [];
  const notes = [];
  const fail = (check, message) => problems.push({ check, message });
  const b = base || {};

  const ratio = (check, label, n, o, why) => {
    if (!Number.isFinite(o)) { notes.push(`${label}: no baseline (${n.toFixed(2)}) — run --write`); return; }
    if (n > o + EPS) {
      problems.push({ check, message: `${label} ROSE ${o.toFixed(2)} → ${n.toFixed(2)}. ${why}` });
    } else if (n < o - EPS) {
      notes.push(`${label} fell ${o.toFixed(2)} → ${n.toFixed(2)} — run --write to lower the ceiling`);
    }
  };

  ratio('TF-1', 'lines per registered test', now.linesPerTest, b.linesPerTest,
    'The suite may grow as fast as it likes — this asks that each new test cost no more '
    + 'scaffolding than the average test costs today. If the setup is genuinely large, it is a '
    + 'helper, and a helper is written once.');
  ratio('TF-2', 'direct G.* seeds per registered test', now.seedsPerTest, b.seedsPerTest,
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
  + 'reported but NEVER ratcheted; '
  + 'lines are physical (prose is ratcheted separately by comment-ratio-ratchet)';

function printReport(now, base) {
  console.log('  method: ' + METHOD);
  console.log('\n  file                                        lines   tests   seeds  gestures  l/test');
  for (const f of now.files) {
    console.log('    ' + f.file.padEnd(40) + String(f.lines).padStart(7) + String(f.tests).padStart(8)
      + String(f.seeds).padStart(8) + String(f.gestures).padStart(10)
      + (f.tests ? (f.lines / f.tests).toFixed(1) : '—').padStart(8));
  }
  console.log('    ' + 'CORPUS'.padEnd(40) + String(now.lines).padStart(7) + String(now.tests).padStart(8)
    + String(now.seeds).padStart(8) + String(now.gestures).padStart(10)
    + now.linesPerTest.toFixed(1).padStart(8));
  const c = (n, o) => (Number.isFinite(o) ? `  (ceiling ${o.toFixed(2)})` : '');
  console.log(`\n  TF-1  lines per test           ${now.linesPerTest.toFixed(2).padStart(8)}`
    + c(now.linesPerTest, base && base.linesPerTest));
  console.log(`  TF-2  G.* seeds per test       ${now.seedsPerTest.toFixed(2).padStart(8)}`
    + c(now.seedsPerTest, base && base.seedsPerTest));
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
    writeFileSync(BASELINE, JSON.stringify({
      _why: 'CEILINGS on the COST of a test and a FLOOR under the number of them. The suite may '
        + 'grow; the scaffolding per test and the seeded beliefs per test may not. Regenerated by '
        + '`node tests/test-file-ratchet.mjs --write` when a number improves — never to make a red '
        + 'build green (CLAUDE.md §2).',
      _method: METHOD,
      measured: new Date().toISOString().slice(0, 10),
      files: now.files.length,
      lines: now.lines,
      tests: now.tests,
      seeds: now.seeds,
      gestures: now.gestures,
      linesPerTest: now.linesPerTest,
      seedsPerTest: now.seedsPerTest,
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
    console.error(`\n  corpus today: ${now.lines} lines / ${now.tests} tests / ${now.seeds} seeds `
      + `/ ${now.gestures} gestures.`);
    return 1;
  }
  console.log(`✓ test-file ratchet: ${now.tests} registered tests over ${now.files.length} file(s) — `
    + `${now.linesPerTest.toFixed(1)} lines and ${now.seedsPerTest.toFixed(2)} G.* seeds per test `
    + `(seeds:gestures ${now.seedsPerGesture.toFixed(1)}:1) — none rose`);
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
  ];
  for (const [label, src, want] of cc) {
    const g = countFile(src);
    const ok = Object.entries(want).every(([k, v]) => g[k] === v);
    say(ok, label, `  → tests ${g.tests} seeds ${g.seeds} gestures ${g.gestures}`);
  }

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
    seedsPerTest: m.tests ? m.seeds / m.tests : Infinity,
    seedsPerGesture: m.gestures ? m.seeds / m.gestures : Infinity,
  });
  const bend = (patch) => compare(derived({ ...real, ...patch }), base);

  const arms = [
    ['400 lines of scaffolding added for 1 new test', 'TF-1',
      { lines: real.lines + 400, tests: real.tests + 1 }],
    ['20 new `G.x = …` seeds added for 1 new test', 'TF-2',
      { lines: real.lines + 40, tests: real.tests + 1, seeds: real.seeds + 20 }],
    ['a test deleted to make the ratios look better', 'TF-3',
      { tests: real.tests - 1, lines: real.lines - 400 }],
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
    ['ALLOWED: 100 new tests at today\'s average cost',
      { lines: Math.floor(real.lines + 100 * real.linesPerTest), tests: real.tests + 100,
        seeds: Math.floor(real.seeds + 100 * real.seedsPerTest) }],
    ['ALLOWED: a lean new test — 40 lines, 0 seeds',
      { lines: real.lines + 40, tests: real.tests + 1 }],
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
      lines: Math.floor((real.lines - 1) / N), tests: Math.floor(real.tests / N),
      seeds: Math.floor(real.seeds / N), gestures: Math.floor(real.gestures / N),
    };
    const files = [{ file: CORPUS_FILE, lines: 1, tests: 0, seeds: 0, gestures: 0 }];
    for (let i = 0; i < N; i++) files.push({ file: `${CORPUS_DIR}/part-${i}.js`, ...per });
    // the remainders stay with the last module, so the corpus totals are exact
    const last = files[files.length - 1];
    last.lines += (real.lines - 1) - per.lines * N;
    last.tests += real.tests - per.tests * N;
    last.seeds += real.seeds - per.seeds * N;
    last.gestures += real.gestures - per.gestures * N;

    const moved = derived({
      files, lines: files.reduce((n, f) => n + f.lines, 0), tests: files.reduce((n, f) => n + f.tests, 0),
      seeds: files.reduce((n, f) => n + f.seeds, 0), gestures: files.reduce((n, f) => n + f.gestures, 0),
    });
    say(moved.lines === real.lines && moved.tests === real.tests && moved.seeds === real.seeds,
      'the simulated move conserves the corpus', `  → ${moved.lines} lines / ${moved.tests} tests`);
    const got = compare(moved, base);
    say(got.problems.length === 0,
      `smoke-test.js → 1 line + ${N} modules is SILENT (the ratchet survives slice 6)`,
      `  → ${got.problems.length ? got.problems.map((p) => p.check).join(',') : '0 problems'}`);
    say(got.notes.some((n) => n.includes('corpus is')),
      '…and it says the corpus changed shape, so --write is not forgotten');

    // and the move must not become a hiding place: 400 lines added DURING it
    const sneaky = derived({ ...moved, lines: moved.lines + 400, tests: moved.tests + 1 });
    say(compare(sneaky, base).problems.some((p) => p.check === 'TF-1'),
      'a move that also adds 400 lines for 1 test is still caught');
  }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED`
    : `${cc.length} counter cases correct, all ${arms.length} defects caught by their named `
      + `assertion, ${silent.length} legal changes silent, and slice 6's pure move proven silent`}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/test-file-ratchet.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
