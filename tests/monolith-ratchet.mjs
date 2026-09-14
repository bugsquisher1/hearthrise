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
// The two modes read DIFFERENT baselines on purpose: the plain run judges the
// tree against the PINNED tests/monolith-ratchet.baseline.json (that is the
// ratchet), while --selftest judges the GUARD against numbers derived from the
// tree it is looking at. So paying the debt can never make the mutation proof
// red, and --write is never the way to fix a red selftest (CLAUDE.md §2).
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
//   MONO-4  src/render/** + src/screens/** FILE COUNT   may only go UP  (floor)
//   MONO-5  src/render/** + src/screens/** TOTAL LINES  may only go UP  (floor)
//
// A floor is unusual and is deliberate: MONO-4/5 are what stop an extraction
// from being quietly reverted, which is the failure this repo has actually had
// (11 files landed 2026-08-24 and nothing was extracted for two weeks). They
// count BOTH halves of the extraction target — src/render/** (helpers, phase
// one) and src/screens/** (whole screen controllers, phase two, landed
// 2026-09-14) — because a floor that watches only the finished phase cannot see
// the current one being undone. A genuine deletion inside either — dead code
// found in an already-extracted unit —
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
/* THE EXTRACTION TARGET, both halves of it. §7 says "render helpers to
   src/render/* FIRST, then screen controllers" — phase two landed 2026-09-14
   (src/screens/{inventory,farm,shop-counter}.js, 1,322 lines out of the
   monolith), and a floor pinned only to src/render would have watched all three
   files be deleted without a word. The floors MONO-4/5 exist precisely to stop
   an extraction being quietly reverted, so they count wherever extracted code
   legitimately lives. Add the next target directory HERE, not in a second
   guard. */
const TARGET_DIRS = [RENDER_DIR, 'src/screens'];
const TARGET_LABEL = TARGET_DIRS.join(' + ');

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

  const renderFiles = TARGET_DIRS.flatMap((dir) => walk(join(root, dir))
    .map((p) => dir + '/' + relative(join(root, dir), p).split(sep).join('/')))
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
      dir: TARGET_LABEL,
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
  floor('MONO-4', TARGET_LABEL + ' files', now.render.files, br.files,
    'An extraction that gets reverted is worse than one that never happened: the plan '
    + 'reads as done. If a render module was legitimately deleted, --write in the same commit.');
  floor('MONO-5', TARGET_LABEL + ' total lines', now.render.lines, br.lines,
    'Same reason as MONO-4, and it also catches a module that was emptied rather than removed.');

  return { problems, notes };
}

function printReport(now) {
  const m = now.monolith; const r = now.render;
  console.log('  MONOLITH                                       THE EXTRACTION TARGET');
  console.log(`    ${MONOLITH.padEnd(20)} ${String(m.lines).padStart(7)} lines      `
    + `${TARGET_LABEL} ${String(r.files).padStart(4)} files`);
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
        + 'only grow, and the extraction target is src/render/** PLUS src/screens/**. Regenerated by `node tests/monolith-ratchet.mjs --write` when a number moves '
        + 'the RIGHT way — never to make a red build green (CLAUDE.md §2).',
      _method: 'lines = physical lines (split on \\r?\\n). functions = column-0 `function name(` '
        + 'declarations, the same predicate as tests/no-duplicate-toplevel-fns.mjs. functionConsts '
        + '= column-0 `const|let|var name = (async)? function|(|arg =>`. render = every *.js under '
        + 'src/render AND src/screens, recursively — both halves of the extraction target.',
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
    + `top-level fns (ceilings), ${TARGET_LABEL} ${now.render.files} files / ${now.render.lines} lines (floors)`);
  for (const n of notes) console.log(`      ${n}`);
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   A ratchet that has never bitten is a decoration. Five defects, one per
   assertion, each planted twice — once as a MEASUREMENT (proves compare())
   and once as REAL TEXT in a temp copy of the tree (proves measure()) — and
   each required to be caught BY ITS NAMED CHECK; then the movements that must
   be NOTES rather than failures, the predicate controls, and the negative
   controls.

   ── WHY THE SELFTEST BASELINE IS DERIVED, NOT READ FROM THE PINNED FILE ───
   Until 2026-09-12 every arm was compared against tests/monolith-ratchet.
   baseline.json. That made the mutation proof depend on how much SLACK
   happened to sit between the pinned numbers and the tree, so the arms went
   MISSED exactly when a lane did the thing this ratchet exists to encourage:

     b533 set     src/render 16 files/3044 lines pinned, tree 17/3386
                  → arm "a render module deleted" measures 17-1 = 16, which is
                    not < 16 → MONO-4 MISSED; "emptied" 3386-200 = 3186 > 3044
                    → MONO-5 MISSED; the two REAL-TEXT twins MISSED as well
                  → "4 arm(s) FAILED", three times on GitHub (46af17bb,
                    da34a399, 3416fcbe each re-pinned to get green again)

   A paydown must never turn a mutation proof red, and a re-pin must never be
   the price of a green selftest — a re-pin is a DECISION about the plain run's
   ceiling, and coupling it to the selftest teaches the reflex of running
   --write to silence a red, which is exactly what CLAUDE.md §2 forbids.

   So: every arm plants its defect relative to the CURRENTLY MEASURED tree
   (ceiling := measured lines, floor := measured files) and the delta is the
   smallest one that exists — +1 line, +1 function, +1 const, -1 render file,
   -1 render line. Self-relative AND strictly sharper than the old ±40/±200.
   The pinned baseline keeps its one job: the plain run. */

/** Ceilings and floors taken from a measurement — the tree is its own baseline. */
export function selfBaseline(m) {
  return { monolith: { ...m.monolith }, render: { ...m.render } };
}

/* Each defect as a function of the measurement it is planted into, so the
   patch is always ±1 from THAT tree and never from a pinned number. */
const COMPARATOR_ARMS = [
  ['one line added to src/legacy.js', 'MONO-1',
    (m) => ({ monolith: { lines: m.monolith.lines + 1 } })],
  ['one new top-level function in legacy.js', 'MONO-2',
    (m) => ({ monolith: { functions: m.monolith.functions + 1 } })],
  ['the MONO-2 dodge: a new `const f = () =>` at column 0', 'MONO-3',
    (m) => ({ monolith: { functionConsts: m.monolith.functionConsts + 1 } })],
  ['a src/render module deleted (extraction reverted)', 'MONO-4',
    (m) => ({ render: { files: m.render.files - 1 } })],
  ['a src/render module emptied but not removed', 'MONO-5',
    (m) => ({ render: { lines: m.render.lines - 1 } })],
];

const DEBT_PAYMENTS = [
  ['PAYING THE DEBT: 500 lines leave legacy.js', 'src/legacy.js lines fell',
    (m) => ({ monolith: { lines: m.monolith.lines - 500 } })],
  ['PAYING THE DEBT: another extracted module lands', TARGET_LABEL + ' files rose',
    (m) => ({ render: { files: m.render.files + 1 } })],
  ['PAYING THE DEBT: 30 top-level fns extracted', 'src/legacy.js top-level functions fell',
    (m) => ({ monolith: { functions: m.monolith.functions - 30 } })],
];

/** compare() half: bend the numbers of `real` against `base`. */
function comparatorArms(real, base, say) {
  let bad = 0;
  for (const [label, check, patch] of COMPARATOR_ARMS) {
    const p = patch(real);
    const got = compare({
      ...real,
      monolith: { ...real.monolith, ...(p.monolith || {}) },
      render: { ...real.render, ...(p.render || {}) },
    }, base);
    const hit = got.problems.filter((x) => x.check === check);
    if (hit.length) say(`  CAUGHT   ${label}\n           ${check}: ${hit[0].message.split('. ')[0]}.`);
    else {
      bad++;
      say(`  MISSED   ${label} — ${check} never fired`
        + (got.problems.length ? ` (only: ${got.problems.map((x) => x.check).join(', ')})` : ' (no problem at all)'));
    }
  }
  return bad;
}

function debtPaymentArms(real, base, say) {
  let bad = 0;
  for (const [label, want, patch] of DEBT_PAYMENTS) {
    const p = patch(real);
    const got = compare({
      ...real,
      monolith: { ...real.monolith, ...(p.monolith || {}) },
      render: { ...real.render, ...(p.render || {}) },
    }, base);
    if (got.problems.length) {
      bad++;
      say(`  FALSE +  ${label} — reported ${got.problems.map((x) => x.check).join(', ')}; `
        + 'paying the debt must be a NOTE, never a failure');
    } else if (!got.notes.some((n) => n.startsWith(want))) {
      bad++;
      say(`  SILENT   ${label} — no "${want}" note, so nobody is told to run --write`);
    } else say(`  note     ${label}`);
  }
  return bad;
}

/**
 * measure() half: the same five defects planted as REAL TEXT in a temp copy of
 * `root`, read back through measure(). A guard whose READER is broken reports 0
 * problems forever and every comparator arm above still passes.
 * `base` is derived from `root` by the caller, so this is self-relative too.
 */
function readerArms(root, base, say) {
  let bad = 0;
  const tmp = mkdtempSync(join(tmpdir(), 'hr-monolith-'));
  try {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    cpSync(join(root, MONOLITH), join(tmp, MONOLITH));
    for (const d of TARGET_DIRS) cpSync(join(root, d), join(tmp, d), { recursive: true });
    const monoOrig = readFileSync(join(tmp, MONOLITH), 'utf8');
    const restoreRender = () => { for (const d of TARGET_DIRS) cpSync(join(root, d), join(tmp, d), { recursive: true }); };
    /* biggest render file, so "emptied" is a real reduction whatever the tree holds */
    const fattest = () => TARGET_DIRS.flatMap((d) => walk(join(tmp, d)))
      .map((p) => [p, lineCount(readFileSync(p, 'utf8'))])
      .sort((a, b) => b[1] - a[1])[0][0];
    const anyFile = () => TARGET_DIRS.flatMap((d) => walk(join(tmp, d))).sort()[0];

    const caught = (check) => compare(measure(tmp), base).problems.some((p) => p.check === check);
    const write = (s) => writeFileSync(join(tmp, MONOLITH), s);

    const planted = [
      ['real text: one line appended to legacy.js', 'MONO-1',
        () => { restoreRender(); write(monoOrig + '\n'); }],
      ['real text: a column-0 `function` declaration', 'MONO-2',
        () => { restoreRender(); write(monoOrig + '\nfunction hrRatchetSelftestFn(a) { return a; }\n'); }],
      ['real text: a column-0 arrow const', 'MONO-3',
        () => { restoreRender(); write(monoOrig + '\nconst hrRatchetSelftestArrow = (a) => a;\n'); }],
      ['real tree: a render module deleted', 'MONO-4',
        () => { write(monoOrig); restoreRender(); rmSync(anyFile()); }],
      ['real tree: a render module emptied to one line', 'MONO-5',
        () => { write(monoOrig); restoreRender(); writeFileSync(fattest(), '//\n'); }],
    ];

    for (const [label, check, plant] of planted) {
      plant();
      if (caught(check)) say(`  CAUGHT   ${label} — ${check}`);
      else { bad++; say(`  MISSED   ${label} — ${check} never fired on the READ path`); }
    }

    // the reader must be silent on an unmutated copy
    write(monoOrig);
    restoreRender();
    const restored = compare(measure(tmp), base);
    if (restored.problems.length) {
      bad++;
      say('  FALSE +  the restored copy reports '
        + restored.problems.map((p) => p.check).join(', ') + ' — measure() is not reproducible');
    } else say('  silent   NEGATIVE CONTROL: an unmutated copy of the tree');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return bad;
}

/* Negative controls on the PREDICATES themselves: the two regexes must not
   widen into "any line that mentions the word function". */
const PREDICATE_CONTROLS = [
  ['NEGATIVE CONTROL: an indented function (inside an IIFE)', '  function inner() {}', 0, 0],
  ['NEGATIVE CONTROL: a call, not a declaration', 'functionish(1);', 0, 0],
  ['NEGATIVE CONTROL: a comment mentioning function f(', '// function f( was moved to src/render', 0, 0],
  ['NEGATIVE CONTROL: a parenthesised expression, not a function', 'const width = (a + b) * 2;', 0, 0],
  ['NEGATIVE CONTROL: an object literal', 'const cfg = { a: 1 };', 0, 0],
  ['POSITIVE CONTROL: a column-0 declaration', 'function realOne(a) {', 1, 0],
  ['POSITIVE CONTROL: a column-0 arrow const', 'const realTwo = (a) => a;', 0, 1],
  ['POSITIVE CONTROL: a single-param arrow const', 'const realThree = a => a;', 0, 1],
  ['POSITIVE CONTROL: `= function`', 'var realFour = function (fn) {', 0, 1],
  ['POSITIVE CONTROL: a top-level IIFE module (the two legacy.js has)', 'const NetClient=(()=>{', 0, 1],
];

function predicateControls(say) {
  let bad = 0;
  for (const [label, line, wantFn, wantConst] of PREDICATE_CONTROLS) {
    const gotFn = DECL_RE.test(line) ? 1 : 0;
    const gotConst = CONST_FN_RE.test(line) ? 1 : 0;
    if (gotFn !== wantFn || gotConst !== wantConst) {
      bad++;
      say(`  WRONG    ${label} — decl=${gotFn} (want ${wantFn}) const=${gotConst} (want ${wantConst})`);
    } else say(`  ok       ${label}`);
  }
  return bad;
}

/**
 * THE ARM THAT CLOSES THE LOOP (2026-09-12).
 * A paydown WITHOUT a re-pin must leave --selftest green. Simulated for real:
 * a temp copy of the tree with 500 lines removed from legacy.js and the pinned
 * baseline left untouched — i.e. the shape of every red run today. It asserts
 * three things: the plain-run comparison is a NOTE not a problem; the whole
 * self-relative proof (comparator + reader) still bites on that shrunken tree;
 * and — the load-bearing half — that the OLD pinned-base logic would indeed
 * have gone MISSED there, so this arm cannot silently stop proving anything.
 */
function paydownWithoutRepinArm(pinned, say) {
  let bad = 0;
  const SHRINK = 500;
  const tmp = mkdtempSync(join(tmpdir(), 'hr-monolith-paid-'));
  try {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    const lines = readFileSync(join(ROOT, MONOLITH), 'utf8').split(/\r?\n/);
    writeFileSync(join(tmp, MONOLITH), lines.slice(0, Math.max(1, lines.length - SHRINK)).join('\n'));
    for (const d of TARGET_DIRS) cpSync(join(ROOT, d), join(tmp, d), { recursive: true });

    const sub = measure(tmp);
    const quiet = () => {};

    const underPinned = compare(sub, pinned);
    if (underPinned.problems.length) {
      bad++;
      say(`  FALSE +  a ${SHRINK}-line paydown makes the PLAIN run red (`
        + `${underPinned.problems.map((p) => p.check).join(', ')}) — a ceiling must fall for free`);
    }

    const selfB = selfBaseline(sub);
    const stillBites = comparatorArms(sub, selfB, quiet) + readerArms(tmp, selfB, quiet)
      + debtPaymentArms(sub, selfB, quiet);
    if (stillBites) {
      bad++;
      say(`  MISSED   PAYDOWN WITHOUT A RE-PIN: ${stillBites} arm(s) went red on a tree `
        + `${SHRINK} lines under the pinned ceiling — the selftest is not self-relative`);
    } else {
      say(`  green    PAYDOWN WITHOUT A RE-PIN: legacy.js ${sub.monolith.lines} vs pinned `
        + `${pinned.monolith.lines} and no --write — every arm still bites`);
    }

    /* Would the pre-fix logic have failed here? If not, this arm proves nothing
       and the shrink must grow — assert it, don't assume it. */
    const asPinned = comparatorArms(sub, pinned, quiet) + readerArms(tmp, pinned, quiet);
    if (asPinned > 0) {
      say(`  proof    the pre-fix logic (arms vs the PINNED baseline) MISSES ${asPinned} arm(s) on the `
        + 'same tree — that is the regression this arm stands against');
    } else {
      bad++;
      say(`  WEAK     the pinned-baseline comparison no longer misses anything at -${SHRINK} lines, `
        + 'so this arm has stopped discriminating — increase SHRINK');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return bad;
}

function selftest() {
  if (!existsSync(BASELINE)) { console.error('SELFTEST: no baseline; run --write first.'); return 2; }
  const pinned = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const real = measure(ROOT);
  const base = selfBaseline(real);
  const say = (s) => console.log(s);

  /* False-positive floor, now self-relative: the tree against its OWN numbers
     must report nothing. The pinned run's state is reported for the reader and
     is deliberately NOT a condition — a lane mid-paydown (or mid-regression)
     still gets a meaningful mutation proof, and the plain run is what judges
     the tree. */
  const clean = compare(real, base);
  if (clean.problems.length) {
    console.error('SELFTEST HARNESS: the tree disagrees with its own measurement, which is impossible '
      + 'unless measure()/compare() is broken:');
    for (const p of clean.problems) console.error(`    ${p.check}  ${p.message}`);
    return 2;
  }
  const pinnedState = compare(real, pinned);
  console.log('monolith-ratchet --selftest — false-positive floor: the tree reports 0 problems against '
    + 'its own measurement');
  console.log(`  (pinned baseline, for information only: ${pinnedState.problems.length} problem(s), `
    + `${pinnedState.notes.length} note(s) — that is the plain run's verdict, not the selftest's)\n`);

  let bad = 0;
  bad += comparatorArms(real, base, say);
  bad += debtPaymentArms(real, base, say);
  bad += predicateControls(say);
  bad += readerArms(ROOT, base, say);
  bad += paydownWithoutRepinArm(pinned, say);

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED`
    : `all ${COMPARATOR_ARMS.length} defects caught by their named assertion (comparator) and all `
      + `${COMPARATOR_ARMS.length} planted again as REAL TEXT (reader), all ${DEBT_PAYMENTS.length} `
      + `debt-payments reported as notes, all ${PREDICATE_CONTROLS.length} predicate controls correct, `
      + 'and a paydown without a re-pin leaves every arm biting'}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/monolith-ratchet.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
