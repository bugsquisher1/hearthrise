#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/monolith-ratchet.mjs — THE MONOLITH MAY ONLY SHRINK (cleanup slice 1b)
//
//   node tests/monolith-ratchet.mjs             gate against the baseline
//   node tests/monolith-ratchet.mjs --report    print the tables, gate too
//   node tests/monolith-ratchet.mjs --write     re-record the baseline
//   node tests/monolith-ratchet.mjs --selftest  mutation proof (plant one defect
//                                               per assertion, plus controls)
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// CLAUDE.md §7 has said "extract render helpers to src/render/* first, then
// screen controllers" since task #129 was written. Measured from git on
// 2026-09-07, here is what actually happened while that sentence sat in the
// rules file:
//
//     src/legacy.js     15,050 lines (2026-08-10)  →  22,511 (09-06)  →  21,935
//     src/render/*.js        0 files (2026-08-10)  →      11 (08-24)  →      11
//
// The monolith grew by 6,885 lines. The extraction target has been FLAT for two
// weeks. Every one of those 6,885 lines was added by somebody who had read §7
// and agreed with it: the rule was never disputed, it was simply never
// measured, and an unmeasured rule loses every argument it has with a deadline.
//
// This is the measurement. It does NOT demand the monolith be split today — it
// demands the two numbers can only move in the direction the plan says. legacy.js
// down. src/render up. Add a function to legacy.js and the build is red with the
// delta printed; move one out and the ceiling drops (run --write in the same
// commit).
//
// ── WHAT IS RATCHETED, AND WHICH WAY ────────────────────────────────────────
//   MONO-1  src/legacy.js LINES               may only go DOWN   (ceiling)
//   MONO-2  src/legacy.js top-level FUNCTIONS may only go DOWN   (ceiling)
//   MONO-3  src/legacy.js top-level FUNCTION-VALUED CONSTS       (ceiling)
//           — closes the dodge where `function f(){}` becomes `const f = () =>`
//             and MONO-2 falls without one line leaving the file.
//   MONO-4  src/render/** FILE COUNT          may only go UP     (floor)
//   MONO-5  src/render/** TOTAL LINES         may only go UP     (floor)
//
// A floor is unusual and is deliberate: MONO-4/5 are what stop an extraction
// from being quietly reverted, which is the failure this repo has actually had
// (11 files landed 2026-08-24 and nothing has been extracted since). A genuine
// deletion inside src/render — dead code found in an already-extracted unit —
// is a legitimate reason for a floor to fall, and the answer is the same as
// everywhere else in this repo: re-run --write IN THE SAME COMMIT, so the
// decision is in the diff and in review, rather than absent.
//
// ── WHAT "TOP-LEVEL FUNCTION" MEANS (one definition, shared) ────────────────
// A column-0 `function name(` declaration — the SAME predicate as
// tests/no-duplicate-toplevel-fns.mjs DECL_RE, deliberately, so two guards can
// never disagree about what a top-level function in this file is. An indented
// `function` is inside something and is not counted; legacy.js is a sequence of
// top-level IIFEs and column-0 is its real module boundary.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
// It does not judge whether a line is good, whether a function belongs in
// legacy.js, or whether an extraction was done well. It cannot: those are
// readings. It answers the one question that is decidable from the tree and
// that nobody was answering — did the monolith get bigger — and it is worth
// exactly that.
//
// Credential-free, database-free, milliseconds.
// Exit: 0 green (or green-with-note) · 1 a number moved the wrong way · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import {
  readFileSync, writeFileSync, readdirSync, existsSync,
  mkdtempSync, mkdirSync, cpSync, rmSync,
} from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'monolith-ratchet.baseline.json');

const MONOLITH = 'src/legacy.js';
const RENDER_DIR = 'src/render';

/* Column-0 declarations only — the same regex as tests/no-duplicate-toplevel-fns.mjs. */
const DECL_RE = /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/;
/* Column-0 `const f = () => …` / `= function …` / `= (()=>{ … })()`. The MONO-2
   dodge, and the two top-level IIFE modules that already live in this file.
   Deliberately NOT `=\s*\(` — that would also flag `const x = (a + b);`, and a
   ratchet with a false positive is a ratchet somebody switches off. */
const CONST_FN_RE = new RegExp('^(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(?:async\\s*)?(?:'
  + 'function\\b'                                   // = function (…)
  + '|\\([^)]*\\)\\s*=>'                            // = (a, b) =>
  + '|[A-Za-z_$][\\w$]*\\s*=>'                      // = a =>
  + '|\\(\\s*(?:async\\s*)?(?:function\\b|\\()'     // = (()=>{…})()  /  = (function(){…})()
  + ')');

/* ── THE EXTRACTION ORDER (docs/planning/CLEANUP_PROGRAM.md, slice 8) ────────
   Authored, not derived — it is a plan, and a plan is a decision. What IS
   derived is the size beside each unit: the number of column-0 functions in
   legacy.js whose NAME matches the unit. That is a name-match estimate and not
   a call-graph analysis, and it is printed as such; its value is that it falls
   as a unit moves out, so slice 8 has a progress bar instead of a feeling. */
const EXTRACTION_ORDER = [
  ['icons', /icon|glyph/i],
  ['inventory', /inventory|invRow|itemImg|equip|bag|slotOf/i],
  ['combat', /combat|fight|foe|monster|attack/i],
  ['progress', /progress|xpFor|levelFor|skillR|renown/i],
  ['refreshAll', /refreshAll|paintAll|renderAll|updateAll/i],
];

const lineCount = (text) => text.split(/\r?\n/).length;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Every column-0 function NAME in the monolith, in source order. */
export function topLevelFunctionNames(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * The whole measurement, as data. Pure: a root in, numbers out — which is what
 * lets --selftest measure a MUTATED COPY of the tree and require this to notice.
 */
export function measure(root) {
  const monoPath = join(root, MONOLITH);
  const text = existsSync(monoPath) ? readFileSync(monoPath, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const names = topLevelFunctionNames(text);

  const renderFiles = walk(join(root, RENDER_DIR))
    .map((p) => RENDER_DIR + '/' + relative(join(root, RENDER_DIR), p).split(sep).join('/'))
    .sort();
  let renderLines = 0;
  for (const rel of renderFiles) renderLines += lineCount(readFileSync(join(root, rel), 'utf8'));

  return {
    monolith: {
      file: MONOLITH,
      lines: text ? lines.length : 0,
      functions: lines.filter((l) => DECL_RE.test(l)).length,
      functionConsts: lines.filter((l) => CONST_FN_RE.test(l)).length,
    },
    render: {
      dir: RENDER_DIR,
      files: renderFiles.length,
      lines: renderLines,
    },
    _names: names,   // not baselined; used only by --report
  };
}

/* The five checks, as data so --selftest can require each BY NAME. */
export function compare(now, base) {
  const problems = [];
  const notes = [];
  const b = base || {};
  const bm = b.monolith || {};
  const br = b.render || {};

  const ceiling = (check, label, n, o, why) => {
    if (!Number.isFinite(o)) { notes.push(`${label}: no baseline (${n}) — run --write`); return; }
    if (n > o) problems.push({ check, message: `${label} ROSE ${o} → ${n} (+${n - o}). ${why}` });
    else if (n < o) notes.push(`${label} fell ${o} → ${n} (-${o - n}) — run --write to lower the ceiling`);
  };
  const floor = (check, label, n, o, why) => {
    if (!Number.isFinite(o)) { notes.push(`${label}: no baseline (${n}) — run --write`); return; }
    if (n < o) problems.push({ check, message: `${label} FELL ${o} → ${n} (-${o - n}). ${why}` });
    else if (n > o) notes.push(`${label} rose ${o} → ${n} (+${n - o}) — run --write to raise the floor`);
  };

  ceiling('MONO-1', 'src/legacy.js lines', now.monolith.lines, bm.lines,
    'CLAUDE.md §7: content grows by adding data rows, not by growing the monolith. '
    + 'New logic goes in src/core/*, new render helpers in src/render/*.');
  ceiling('MONO-2', 'src/legacy.js top-level functions', now.monolith.functions, bm.functions,
    'A new top-level function in a 21k-line classic script is a new thing that can '
    + 'only be found by grep and can only be tested through the DOM.');
  ceiling('MONO-3', 'src/legacy.js top-level function-consts', now.monolith.functionConsts, bm.functionConsts,
    'Same debt in a different spelling — this exists so MONO-2 cannot be satisfied '
    + 'by rewriting `function f()` as `const f = () =>` without a line leaving the file.');
  floor('MONO-4', 'src/render/** files', now.render.files, br.files,
    'An extraction that gets reverted is worse than one that never happened: the plan '
    + 'reads as done. If a render module was legitimately deleted, --write in the same commit.');
  floor('MONO-5', 'src/render/** total lines', now.render.lines, br.lines,
    'Same reason as MONO-4, and it also catches a module that was emptied rather than removed.');

  return { problems, notes };
}

function printReport(now) {
  const m = now.monolith; const r = now.render;
  console.log('  MONOLITH                                       RENDER (the target)');
  console.log(`    ${MONOLITH.padEnd(20)} ${String(m.lines).padStart(7)} lines      `
    + `${RENDER_DIR + '/**'} ${String(r.files).padStart(4)} files`);
  console.log(`    top-level functions  ${String(m.functions).padStart(7)}            `
    + `                ${String(r.lines).padStart(4)} lines`);
  console.log(`    function-consts      ${String(m.functionConsts).padStart(7)}`);
  const total = m.lines + r.lines;
  console.log(`\n    share of the two still in the monolith: `
    + `${total ? ((m.lines / total) * 100).toFixed(1) : '0.0'}%`);

  console.log('\n  EXTRACTION ORDER (docs/planning/CLEANUP_PROGRAM.md slice 8 — one unit per branch,');
  console.log('  nothing starts until slices 3-4 have been live a week):');
  const names = now._names || [];
  EXTRACTION_ORDER.forEach(([unit, re], i) => {
    const hits = names.filter((n) => re.test(n));
    console.log(`    ${i + 1}. ${unit.padEnd(12)} ${String(hits.length).padStart(3)} top-level fn(s) by name`
      + (hits.length ? `  e.g. ${hits.slice(0, 3).join(', ')}` : ''));
  });
  console.log('    (name-match estimate, NOT a call-graph analysis — its job is to fall as a unit moves out)');
}

export function run(argv = []) {
  const now = measure(ROOT);
  if (argv.includes('--write')) {
    const payload = {
      _why: 'CEILINGS AND FLOORS, not targets. src/legacy.js may only shrink; src/render/** may '
        + 'only grow. Regenerated by `node tests/monolith-ratchet.mjs --write` when a number moves '
        + 'the RIGHT way — never to make a red build green (CLAUDE.md §2).',
      _method: 'lines = physical lines (split on \\r?\\n). functions = column-0 `function name(` '
        + 'declarations, the same predicate as tests/no-duplicate-toplevel-fns.mjs. functionConsts '
        + '= column-0 `const|let|var name = (async)? function|(|arg =>`. render = every *.js under '
        + 'src/render, recursively.',
      measured: new Date().toISOString().slice(0, 10),
      monolith: now.monolith,
      render: now.render,
    };
    writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
    printReport(now);
    console.log('\n✓ baseline written → tests/monolith-ratchet.baseline.json');
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('MONOLITH-RATCHET: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { problems, notes } = compare(now, base);
  if (argv.includes('--report')) printReport(now);

  if (problems.length) {
    console.error(`  ✗ monolith ratchet: ${problems.length} number(s) moved the WRONG way`);
    for (const p of problems) console.error(`      ${p.check}  ${p.message}`);
    console.error('\n  The monolith grew 15,050 → 22,511 lines in 27 days while §7 said to extract it,');
    console.error('  and src/render has been flat at 11 files since 2026-08-24. This is the number');
    console.error('  that was missing. Put the code in src/render/* or src/core/*, or — if the growth');
    console.error('  is genuinely unavoidable — say why in the commit and re-run --write.');
    return 1;
  }
  console.log(`✓ monolith ratchet: ${MONOLITH} ${now.monolith.lines} lines / ${now.monolith.functions} `
    + `top-level fns (ceilings), ${RENDER_DIR}/** ${now.render.files} files / ${now.render.lines} lines (floors)`);
  for (const n of notes) console.log(`      ${n}`);
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   A ratchet that has never bitten is a decoration. Five defects, one per
   assertion, each planted as a MEASUREMENT (not as a file edit — the real
   tree is never touched) and each required to be caught BY ITS NAMED CHECK;
   then the three movements that must be NOTES rather than failures, and two
   negative controls. */
function selftest() {
  if (!existsSync(BASELINE)) { console.error('SELFTEST: no baseline; run --write first.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const real = measure(ROOT);

  const clean = compare({ ...real, monolith: { ...real.monolith }, render: { ...real.render } }, base);
  if (clean.problems.length) {
    console.error('SELFTEST HARNESS: the UNMUTATED tree already reports problems, so every "caught"');
    console.error('  below would be meaningless. Fix the real numbers first (or --write):');
    for (const p of clean.problems) console.error(`    ${p.check}  ${p.message}`);
    return 2;
  }
  console.log('monolith-ratchet --selftest — false-positive floor: the real tree reports 0 problems\n');

  const bend = (patch) => compare({
    ...real,
    monolith: { ...real.monolith, ...(patch.monolith || {}) },
    render: { ...real.render, ...(patch.render || {}) },
  }, base);

  const arms = [
    ['+40 lines added to src/legacy.js', 'MONO-1', { monolith: { lines: real.monolith.lines + 40 } }],
    ['one new top-level function in legacy.js', 'MONO-2', { monolith: { functions: real.monolith.functions + 1 } }],
    ['the MONO-2 dodge: a new `const f = () =>` at column 0', 'MONO-3',
      { monolith: { functionConsts: real.monolith.functionConsts + 1 } }],
    ['a src/render module deleted (extraction reverted)', 'MONO-4', { render: { files: real.render.files - 1 } }],
    ['a src/render module emptied but not removed', 'MONO-5', { render: { lines: real.render.lines - 200 } }],
  ];

  const noted = [
    ['PAYING THE DEBT: 500 lines leave legacy.js', 'src/legacy.js lines fell',
      { monolith: { lines: real.monolith.lines - 500 } }],
    ['PAYING THE DEBT: a 12th render module lands', 'src/render/** files rose',
      { render: { files: real.render.files + 1 } }],
    ['PAYING THE DEBT: 30 top-level fns extracted', 'src/legacy.js top-level functions fell',
      { monolith: { functions: real.monolith.functions - 30 } }],
  ];

  let bad = 0;
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
  for (const [label, want, patch] of noted) {
    const got = bend(patch);
    if (got.problems.length) {
      bad++;
      console.log(`  FALSE +  ${label} — reported ${got.problems.map((p) => p.check).join(', ')}; `
        + 'paying the debt must be a NOTE, never a failure');
    } else if (!got.notes.some((n) => n.startsWith(want))) {
      bad++;
      console.log(`  SILENT   ${label} — no "${want}" note, so nobody is told to run --write`);
    } else {
      console.log(`  note     ${label}`);
    }
  }

  // Negative controls on the PREDICATES themselves: the two regexes must not
  // widen into "any line that mentions the word function".
  const ctl = [
    ['NEGATIVE CONTROL: an indented function (inside an IIFE)', '  function inner() {}', 0, 0],
    ['NEGATIVE CONTROL: a call, not a declaration', 'functionish(1);', 0, 0],
    ['NEGATIVE CONTROL: a comment mentioning function f(', '// function f( was moved to src/render', 0, 0],
    ['NEGATIVE CONTROL: a parenthesised expression, not a function',
      'const width = (a + b) * 2;', 0, 0],
    ['NEGATIVE CONTROL: an object literal', 'const cfg = { a: 1 };', 0, 0],
    ['POSITIVE CONTROL: a column-0 declaration', 'function realOne(a) {', 1, 0],
    ['POSITIVE CONTROL: a column-0 arrow const', 'const realTwo = (a) => a;', 0, 1],
    ['POSITIVE CONTROL: a single-param arrow const', 'const realThree = a => a;', 0, 1],
    ['POSITIVE CONTROL: `= function`', 'var realFour = function (fn) {', 0, 1],
    ['POSITIVE CONTROL: a top-level IIFE module (the two legacy.js has)',
      'const NetClient=(()=>{', 0, 1],
  ];
  for (const [label, line, wantFn, wantConst] of ctl) {
    const gotFn = DECL_RE.test(line) ? 1 : 0;
    const gotConst = CONST_FN_RE.test(line) ? 1 : 0;
    if (gotFn !== wantFn || gotConst !== wantConst) {
      bad++;
      console.log(`  WRONG    ${label} — decl=${gotFn} (want ${wantFn}) const=${gotConst} (want ${wantConst})`);
    } else console.log(`  ok       ${label}`);
  }

  // ── THE OTHER HALF: prove measure(), not only compare() ──────────────────
  // Everything above bends the NUMBERS, which proves the comparator and nothing
  // else. A guard whose reader is broken reports 0 problems forever and every
  // arm above still passes. So the same five defects are now planted as REAL
  // TEXT in a temp copy of the tree and read back through measure().
  const planted = [];
  const tmp = mkdtempSync(join(tmpdir(), 'hr-monolith-'));
  try {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    cpSync(join(ROOT, MONOLITH), join(tmp, MONOLITH));
    cpSync(join(ROOT, RENDER_DIR), join(tmp, RENDER_DIR), { recursive: true });
    const monoOrig = readFileSync(join(tmp, MONOLITH), 'utf8');
    const renderFiles = walk(join(tmp, RENDER_DIR));

    const caught = (check) => compare(measure(tmp), base).problems.some((p) => p.check === check);

    const write = (s) => writeFileSync(join(tmp, MONOLITH), s);
    planted.push(['real text: 40 lines appended to legacy.js', 'MONO-1',
      () => write(monoOrig + '\n'.repeat(40))]);
    planted.push(['real text: a column-0 `function` declaration', 'MONO-2',
      () => write(monoOrig + '\nfunction hrRatchetSelftestFn(a) { return a; }\n')]);
    planted.push(['real text: a column-0 arrow const', 'MONO-3',
      () => write(monoOrig + '\nconst hrRatchetSelftestArrow = (a) => a;\n')]);
    planted.push(['real tree: a render module deleted', 'MONO-4',
      () => { write(monoOrig); rmSync(renderFiles[0]); }]);
    planted.push(['real tree: a render module emptied to one line', 'MONO-5',
      () => { cpSync(join(ROOT, RENDER_DIR), join(tmp, RENDER_DIR), { recursive: true });
        writeFileSync(renderFiles[1], '//\n'); }]);

    for (const [label, check, plant] of planted) {
      plant();
      if (caught(check)) console.log(`  CAUGHT   ${label} — ${check}`);
      else { bad++; console.log(`  MISSED   ${label} — ${check} never fired on the READ path`); }
    }

    // and the reader must be silent on an unmutated copy
    write(monoOrig);
    cpSync(join(ROOT, RENDER_DIR), join(tmp, RENDER_DIR), { recursive: true });
    const restored = compare(measure(tmp), base);
    if (restored.problems.length) {
      bad++;
      console.log('  FALSE +  the restored copy reports '
        + restored.problems.map((p) => p.check).join(', ') + ' — measure() is not reproducible');
    } else console.log('  silent   NEGATIVE CONTROL: an unmutated copy of the tree');
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED`
    : `all ${arms.length} defects caught by their named assertion (comparator) and all `
      + `${planted.length} planted again as REAL TEXT (reader), all ${noted.length} debt-payments `
      + `reported as notes, all ${ctl.length} predicate controls correct`}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/monolith-ratchet.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
