#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/typecheck-ratchet.mjs — A WRONG FIELD NAME GOES RED, AND OLD DEBT BLOCKS NOBODY.
//
//   node tests/typecheck-ratchet.mjs             the guard (about a minute: one whole-program check, one lint)
//   node tests/typecheck-ratchet.mjs --report    the counts by error kind and folder, gate too
//   node tests/typecheck-ratchet.mjs --write     record a fall or a move; refuses a rise
//   node tests/typecheck-ratchet.mjs --selftest  planted defects must go RED and controls stay green
//
// mutant-anchors: none — the proof plants into a scratch project and into an in-memory overlay of the tree, never a tree file
//
// WHY (lane b-type-check, 2026-11-04). 67,000 lines of plain JS: `CHAT_LIMITS.friendsPollAwayMs` named a limit that never
// existed, so a hidden page stopped stamping its presence and read offline to its friends, and nothing could say so.
// tools/typecheck.mjs is the measure; this is the gate: per file and per error kind, today's count is the ceiling. Fixing
// one lowers it (`--write`, optional: a fall is a note, never a red). Adding one is red with the file named.
//
//   TR-1  no count rises in tests/typecheck-ratchet.baseline.json; a file not in it starts at zero
//   TR-2  an import that does not resolve is always red: a `?v=` the host stopped stripping would blind the whole check
//   TR-3  non-vacuity: at least MIN_FILES files read, by both the compiler and the lint
//
// Exit: 0 green (or green with a note) · 1 a count rose · 2 harness (no install, no baseline, tool failed).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { typecheck, lint, countByFile, printReport, stripQuery } from '../tools/typecheck.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'typecheck-ratchet.baseline.json');
const MIN_FILES = 300;
const UNRESOLVED = 'TS2307';

/** Every per-file, per-code count that rose, and every one that fell. Pure. */
export function compare(now, base) {
  const rises = []; const falls = [];
  for (const file of new Set([...Object.keys(now), ...Object.keys(base)])) {
    const n = now[file] || {}; const b = base[file] || {};
    for (const code of new Set([...Object.keys(n), ...Object.keys(b)])) {
      const to = n[code] || 0; const from = b[code] || 0;
      if (to > from) rises.push({ file, code, from, to, isNew: !base[file] });
      else if (to < from) falls.push({ file, code, from, to });
    }
  }
  return { rises, falls };
}

const totals = (table) => {
  const out = {};
  for (const row of Object.values(table)) for (const [c, n] of Object.entries(row)) out[c] = (out[c] || 0) + n;
  return out;
};

/** What `--write` refuses: a code whose repo-wide total rose. A file split moves errors and the total stands; a new error does not. Pure. */
export function writeRefusals(now, base) {
  const a = totals(now); const b = totals(base);
  return Object.keys(a).filter((c) => a[c] > (b[c] || 0)).map((c) => `${c}: ${b[c] || 0} -> ${a[c]} across the repo`);
}

/** The whole verdict. Pure, so the proof can hand it planted measurements. */
export function judge({ now, base, files, lintFiles }) {
  const { rises, falls } = compare(now, base);
  const problems = [];
  if (files < MIN_FILES) problems.push(`TR-3 the compiler read ${files} files, the floor is ${MIN_FILES}: it is measuring nothing`);
  if (lintFiles < MIN_FILES) problems.push(`TR-3 the lint read ${lintFiles} files, the floor is ${MIN_FILES}: it is measuring nothing`);
  for (const [file, row] of Object.entries(now)) if (row[UNRESOLVED]) problems.push(`TR-2 ${file}: ${row[UNRESOLVED]} import(s) did not resolve`);
  return { rises, falls, problems };
}

/* One line per file, so two lanes' falls never touch the same line and the baseline diffs by the file it names. */
function baselineText(now) {
  const rows = Object.keys(now).sort().map((f) => `    ${JSON.stringify(f)}: ${JSON.stringify(now[f])}`);
  const total = Object.values(totals(now)).reduce((a, b) => a + b, 0);
  return '{\n  "note": "Ceilings, not targets: per file and error kind, counts may only fall. Written by node tests/typecheck-ratchet.mjs --write, which refuses a rise. Regenerate, never hand-merge.",\n'
    + `  "total": ${total},\n  "files": {\n${rows.join(',\n')}\n  }\n}\n`;
}

async function measure(o = {}) {
  const t = await typecheck(o);
  const l = lint(o);
  const all = [...t.diagnostics, ...l.diagnostics];
  return { all, now: countByFile(all), files: t.files, lintFiles: l.files, ms: t.ms + l.ms };
}

const HOW = '  A wrong field or name: fix it. Right, and the compiler cannot know: give it a JSDoc type (`@param {{a: number}} o`), or\n'
  + '  `// @ts-expect-error <why>` on the line above. A file split moves errors: `--write` records the move. It refuses a real rise.';

function report(v, all) {
  for (const p of v.problems) console.error('  x ' + p);
  if (v.rises.length) console.error(`  x type ratchet: ${v.rises.length} count(s) ROSE`);
  for (const r of v.rises) {
    console.error(`      ${r.file} ${r.code} ${r.from} -> ${r.to}` + (r.isNew ? ' (a file not in the baseline starts at zero)' : ''));
    for (const d of all) if (d.file === r.file && d.code === r.code) console.error(`        ${d.file}:${d.line}:${d.col} ${d.code} ${d.message.slice(0, 200)}`);
  }
  if (v.rises.length) console.error('\n' + HOW);
}

async function run(argv) {
  const m = await measure();
  if (argv.includes('--report')) printReport(m.all);
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : null;
  if (argv.includes('--write')) {
    const refused = base ? writeRefusals(m.now, base) : [];
    if (refused.length) {
      console.error('  x --write refuses, the debt rose:\n      ' + refused.join('\n      '));
      report(judge({ now: m.now, base, files: m.files, lintFiles: m.lintFiles }), m.all);
      return 1;
    }
    writeFileSync(BASELINE, baselineText(m.now));
    console.log(`baseline written: ${m.all.length} errors in ${Object.keys(m.now).length} files`);
    return 0;
  }
  if (!base) { console.error('TYPE RATCHET: no baseline. Run --write once.'); return 2; }
  const v = judge({ now: m.now, base, files: m.files, lintFiles: m.lintFiles });
  report(v, m.all);
  if (v.problems.length || v.rises.length) return 1;
  console.log(`type ratchet: ${m.all.length} errors across ${Object.keys(m.now).length} of ${m.files} files, none new (${(m.ms / 1000).toFixed(1)} s)`);
  if (v.falls.length) {
    console.log(`  ratchet down: run --write (${v.falls.length} count(s) fell)`);
    for (const f of v.falls.slice(0, 10)) console.log(`      ${f.file} ${f.code} ${f.from} -> ${f.to}`);
  }
  return 0;
}

/* ── THE PROOF ───────────────────────────────────────────────────────────
   One small scratch project with one planted defect per file (one program, so about three seconds), each required by its
   exact code; then the verdict's arms on planted measurements; then the REAL tree through an in-memory overlay, so a
   renamed field and a typo in real files are caught by the real baseline, and nothing else moves. */
const Q = '?' + 'v=1.2.3';   // built, so tools/pack-edge.mjs versionQueryGuard does not read a fixture's text as this file's own import
const FIXTURE_BASE = `/** @typedef {{ hp: number, name: string }} Hero */
/** @returns {Hero} */
export function hero() { return { hp: 1, name: 'a' }; }
export const LIMITS = Object.freeze({ pollMs: 30000 });
export function plain() { return { hp: 1, name: 'a' }; }
`;
const PLANTS = [
  ['a wrong field, through a ?v= import', `import { hero } from './base.js${Q}';\nexport const x = hero().hpp;\n`, ['TS2339|TS2551']],
  ['a wrong field, through a plain import', "import { hero } from './base.js';\nexport const x = hero().nam;\n", ['TS2339|TS2551']],
  ['a wrong field on a plain returned object, no JSDoc (an open literal without noImplicitAny)', "import { plain } from './base.js';\nexport const x = plain().hpp;\n", ['TS2339|TS2551']],
  ['a limit that does not exist (the friendsPollAwayMs class)', `import { LIMITS } from './base.js${Q}';\nexport const x = LIMITS.pollAwayMs;\n`, ['TS2339']],
  ['a name nothing defines', 'export const x = notDefinedAnywhere + 1;\n', ['TS2304', 'lint/no-undef']],
  ['a shorthand of a name nothing defines', 'export const x = { notDefinedAnywhere };\n', ['TS18004', 'lint/no-undef']],
  ['a duplicate key', 'export const x = { a: 1, a: 2 };\n', ['TS1117', 'lint/no-dupe-keys']],
  ['unreachable code', "export function f() { return 1; console.log('x'); }\n", ['TS7027', 'lint/no-unreachable']],
  ['assignment to a const', 'const k = 1;\nk = 2;\nexport { k };\n', ['TS2588', 'lint/no-const-assign']],
  ['a value compared with itself', 'export const f = (a) => a === a;\n', ['lint/no-self-compare']],
  ['a case that falls through', 'export function f(x) { switch (x) { case 1: console.log(1); case 2: return 2; } return 0; }\n', ['TS7029', 'lint/no-fallthrough']],
  ['a call with too many arguments', "import { hero } from './base.js';\nexport const x = hero(1);\n", ['TS2554']],
  ['an import that does not resolve', `import { y } from './nowhere.js${Q}';\nexport const x = y;\n`, ['TS2307']],
];
const CONTROLS = [
  ['a clean file through both kinds of import', `import { hero, LIMITS } from './base.js${Q}';\nimport { hero as again } from './base.js';\nexport const x = hero().hp + again().hp + LIMITS.pollMs;\n`],
  ['a defect inside a comment', '/* hero().hpp; notDefinedAnywhere; */\nexport const x = 1;\n'],
  ['an empty case stepping to the next, with a comment between', 'export function f(x) { switch (x) { case 1:\n  /* the same rule */\n  case 2: return 2; } return 0; }\n'],
  ['`window.Anything`: the census guard owns those', 'export const x = window.HearthriseAnything;\n'],
  ['a parameter with no annotation, and the fields read on it: nobody has to annotate old code', 'export const f = (a, b) => a.anything + b.at(0).more;\nconst list = [];\nexport const g = (o) => { list.push(o); return list; };\n'],
  ['a JSDoc {object}: "some object", in this code', '/** @param {object} o */\nexport const f = (o) => o.anything;\n'],
];

function proveVerdict(fails) {
  const big = 400;
  const base = { 'src/a.js': { TS2339: 2 } };
  const verdict = (now, o = {}) => judge({ now, base, files: big, lintFiles: big, ...o });
  const rose = (v, file, code) => v.rises.some((r) => r.file === file && r.code === code);
  if (!rose(verdict({ 'src/a.js': { TS2339: 3 } }), 'src/a.js', 'TS2339')) fails.push('one more error in a file with debt was not a rise');
  if (!rose(verdict({ 'src/a.js': { TS2339: 2, TS2345: 1 } }), 'src/a.js', 'TS2345')) fails.push('a new kind of error in a file with debt was not a rise');
  if (!rose(verdict({ 'src/a.js': { TS2339: 2 }, 'src/b.js': { TS2304: 1 } }), 'src/b.js', 'TS2304')) fails.push('a file not in the baseline did not start at zero');
  if (!verdict({ 'src/a.js': { TS2339: 2, TS2307: 1 } }).problems.some((p) => p.startsWith('TR-2'))) fails.push('TR-2 an unresolved import passed');
  if (!judge({ now: { 'src/a.js': { TS2307: 1 } }, base: { 'src/a.js': { TS2307: 1 } }, files: big, lintFiles: big }).problems.length) fails.push('TR-2 an unresolved import passed for being in the baseline');
  if (!verdict({ 'src/a.js': { TS2339: 2 } }, { files: 3 }).problems.some((p) => p.startsWith('TR-3'))) fails.push('TR-3 a compiler that read 3 files passed');
  if (!verdict({ 'src/a.js': { TS2339: 2 } }, { lintFiles: 0 }).problems.some((p) => p.startsWith('TR-3'))) fails.push('TR-3 a lint that read nothing passed');
  const down = verdict({ 'src/a.js': { TS2339: 1 } });
  if (down.rises.length || down.problems.length || down.falls.length !== 1) fails.push('a paid-down error was not a green note');
  const gone = verdict({});
  if (gone.rises.length || gone.problems.length || gone.falls.length !== 1) fails.push('a file gone from the tree was not a green note');
  if (!writeRefusals({ 'src/a.js': { TS2339: 3 } }, base).length) fails.push('--write accepted a rise');
  if (!writeRefusals({ 'src/a.js': { TS2339: 2 }, 'src/b.js': { TS2304: 1 } }, base).length) fails.push('--write accepted a new error in a new file');
  if (writeRefusals({ 'src/a.js': { TS2339: 1 }, 'src/b.js': { TS2339: 1 } }, base).length) fails.push('--write refused a file split (the errors moved, the total stands)');
  if (writeRefusals({ 'src/a.js': { TS2339: 1 } }, base).length) fails.push('--write refused a fall');
  if (stripQuery('./x.js' + Q) !== './x.js' || stripQuery('./x.js') !== './x.js') fails.push('the query is not stripped both ways');
  const text = baselineText({ 'src/b.js': { TS1: 1 }, 'src/a.js': { TS2: 2 } });
  if (JSON.parse(text).total !== 3 || text.indexOf('src/a.js') > text.indexOf('src/b.js')) fails.push('the baseline is not sorted with its total');
}

async function proveFixture(fails) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-typecheck-'));
  try {
    mkdirSync(join(tmp, 'src', 'vendor'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'base.js'), FIXTURE_BASE);
    writeFileSync(join(tmp, 'src', 'vendor', 'skipped.js'), 'export const x = notDefinedAnywhere;\n');
    PLANTS.forEach(([, text], i) => writeFileSync(join(tmp, 'src', `plant${i}.js`), text));
    CONTROLS.forEach(([, text], i) => writeFileSync(join(tmp, 'src', `control${i}.js`), text));
    const { now } = await measure({ root: tmp });
    PLANTS.forEach(([label, , codes], i) => {
      const got = now[`src/plant${i}.js`] || {};
      for (const code of codes) if (!code.split('|').some((c) => got[c])) fails.push(`${label}: wanted ${code}, got ${JSON.stringify(got)}`);
    });
    CONTROLS.forEach(([label], i) => {
      if (now[`src/control${i}.js`]) fails.push(`control went red, ${label}: ${JSON.stringify(now[`src/control${i}.js`])}`);
    });
    if (now['src/base.js']) fails.push('the clean base file went red: ' + JSON.stringify(now['src/base.js']));
    if (now['src/vendor/skipped.js']) fails.push('src/vendor was checked');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/* The real files, planted in memory. Every plant is APPENDED, so no line of the game is an anchor here and no lane's edit can leave
   this proof behind: a field read wrongly across two real modules with no JSDoc anywhere, a limit that does not exist, a name
   nothing defines. Each is required by its code in its file, and nothing else in the tree may move. */
const TREE_PLANTS = [
  ['a wrong field on what another real module returns, no JSDoc', {
    'src/session/character-sections.js': '\nexport function plantedReader() { return { hp: 1 }; }\n',
    'src/shell/hud.js': "\nimport { plantedReader } from '../session/character-sections.js';\nexport const plantedRead = plantedReader().hpp;\n",
  }, 'src/shell/hud.js', ['TS2339', 'TS2551']],
  ['a limit that does not exist', {
    'src/social/social-session.js': "\nimport { CHAT_LIMITS as PLANTED } from '../data/chat-channels.js';\nexport const plantedLimit = PLANTED.friendsPollMz;\n",
  }, 'src/social/social-session.js', ['TS2339', 'TS2551']],
  ['a name nothing defines', { 'src/world/world-boot.js': '\nexport const plantedName = notDefinedAnywhere;\n' }, 'src/world/world-boot.js', ['TS2304']],
];

async function proveTree(fails) {
  if (!existsSync(BASELINE)) { fails.push('no baseline to prove against'); return; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
  const overlay = {};
  for (const [, plants] of TREE_PLANTS) {
    for (const [file, text] of Object.entries(plants)) overlay[file] = readFileSync(join(ROOT, file), 'utf8') + text;
  }
  const t = await typecheck({ overlay });
  const v = judge({ now: countByFile([...t.diagnostics, ...lint().diagnostics]), base, files: t.files, lintFiles: MIN_FILES });
  for (const [label, , at, codes] of TREE_PLANTS) {
    if (!v.rises.some((r) => r.file === at && codes.includes(r.code))) fails.push(`${label}: no rise in ${at}, wanted ${codes.join(' or ')}`);
  }
  const allowed = new Set(TREE_PLANTS.map((p) => p[2]));
  for (const r of v.rises) if (!allowed.has(r.file)) fails.push(`a plant moved a file it should not, or the baseline is stale: ${r.file} ${r.code} ${r.from} -> ${r.to}`);
  if (v.problems.length) fails.push('the planted tree: ' + v.problems.join('; '));
}

async function selftest() {
  const fails = [];
  const started = Date.now();
  proveVerdict(fails);
  await proveFixture(fails);
  await proveTree(fails);
  for (const f of fails) console.error('  x SELFTEST: ' + f);
  if (fails.length) return 1;
  console.log(`type ratchet selftest: ${PLANTS.length} planted kinds and ${TREE_PLANTS.length} real-tree plants caught, ${CONTROLS.length} controls silent, the verdict's arms hold (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  return 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  try { process.exit(argv.includes('--selftest') ? await selftest() : await run(argv)); } catch (e) {
    console.error('TYPE RATCHET harness: ' + String((e && e.message) || e));
    process.exit(2);
  }
}
