#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/census.mjs — EVERY TOP-LEVEL FUNCTION IN THE RULE CODE, COUNTED (systems intelligence, step A;
// docs/design/systems-intelligence/00-plan.md section 2 and roadmap step A; Tyler approved step A alone, 2026-11-21).
//
// The formula registers were written from what an agent chose to read. This reads the code instead: every top-level function,
// exported or not, in the rule folders. For each it says whether its body HOLDS A TYPED NUMBER and whether ANY REGISTER NAMES IT.
//
//   node tools/balance-program/census.mjs              three numbers a folder (functions found, holding a typed number, of those named
//                                                       in a register), the client folders' typed-number counts, and the largest gaps
//   node tools/balance-program/census.mjs --list       the same, then EVERY function that holds a typed number and no register names
//   node tools/balance-program/census.mjs --json       every row as JSON on stdout (nothing is written to disk)
//   node tools/balance-program/census.mjs --selftest   planted files, in memory: an uncited function and a typed number must each show
//                                                       up, a function a register names must read named, plain numbers must not count
//
// THE RULES (one each, printed with every run so a count is never read without them):
//   FUNCTION      a top-level `function` declaration, or a top-level `const`/`let` whose value is an arrow or a function expression.
//                 A function nested in another counts into its parent. Class methods and object-literal methods are not listed.
//   TYPED NUMBER  a numeric literal in the function (its default parameters too) other than 0, 1, 2, 100 and 1000.
//   NAMED         the function's name appears as a whole word in a register file (REGISTER_FILES). A short common name can match
//                 by accident, so NAMED errs toward covered: the unnamed list is a floor, never an overcount.
//
// BINDINGS (lane BL-2, the balance lever registry): bindingsOf lists every top-level binding that holds a typed number, VALUES as well as
// functions, with the property each number sits under. tools/balance-program/levers.mjs --check reads it to fail a typed number that no
// registry row claims. The census report itself still counts functions only.
//
// READ-ONLY. It stores nothing: no registry file, no baseline, no cache. It is a REPORT, not a guard: it exits 0 whatever it counts
// (1 only when a selftest proof fails, 2 on a bad argument). Deterministic for one tree: files and rows are sorted.
//
// mutant-anchors: none — --selftest plants its files and its register text in memory; no tracked file is patched
// ci-step: economy-selftests | Rule-code census - a planted uncited function and a planted typed number each show up, a named one reads named
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/census.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

/** The rule code: every function is listed. */
export const RULE_FOLDERS = Object.freeze(['src/core', 'src/data', 'supabase/functions/hr-accrue']);
/** The client: the typed-number count only (a rule or a number here is display math or a leak; the report is how a leak is seen). */
export const CLIENT_FOLDERS = Object.freeze(['src/session', 'src/shell', 'src/hunt-view']);
export const REGISTER_FILES = Object.freeze(['formulas-combat.json', 'formulas-progression.json', 'formulas-economy.json', 'formulas-architecture.json', 'knobs.json']
  .map((f) => 'tools/balance-program/formulas/' + f));
/** Numbers that are not a tuning value on their face: nothing, one, a pair, a percent base, a permille base. */
export const PLAIN_NUMBERS = Object.freeze(['0', '1', '2', '100', '1000']);

const slash = (p) => p.split('\\').join('/');
const SOURCE = /\.(js|mjs|ts)$/;
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (SOURCE.test(n)) out.push(p);
  }
  return out;
};

/** The typed numbers under `node`, as their source text. */
function typedNumbers(node) {
  const out = [];
  const visit = (x) => {
    if (x.kind === ts.SyntaxKind.NumericLiteral && !PLAIN_NUMBERS.includes(x.text)) out.push(x.text);
    ts.forEachChild(x, visit);
  };
  visit(node);
  return out;
}

/** Every top-level function of one source text: { file, name, line, exported, typed: [numbers] }. Pure. */
export function functionsOf(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const rows = [];
  for (const st of sf.statements) {
    const exported = !!(st.modifiers && st.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    const found = [];
    if (ts.isFunctionDeclaration(st) && st.name) found.push([st.name.text, st]);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (d.initializer && ts.isIdentifier(d.name) && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) found.push([d.name.text, d.initializer]);
      }
    }
    for (const [name, node] of found) {
      rows.push({ file, name, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, exported, typed: typedNumbers(node) });
    }
  }
  return rows;
}

/* THE PROPERTY A NUMBER SITS UNDER: the name of the nearest enclosing `key: value` inside the binding, or BARE ('·') when none. A
   number that is itself a key (`{ 3: 4.0 }`) is KEY_NUMBER. The balance lever registry pins these per binding (tools/balance-program/levers.mjs). */
export const BARE = '·';
export const KEY_NUMBER = '#key';
const propName = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isPrivateIdentifier(n)) ? n.text : '[]');

/**
 * EVERY TOP-LEVEL BINDING OF ONE SOURCE TEXT THAT HOLDS A TYPED NUMBER, functions AND values (the balance lever registry's unit, lane
 * BL-2): { file, name, line, kind: 'function' | 'value' | 'statements', exported, typed: [numbers], keys: [sorted unique property names
 * the numbers sit under, BARE for none, KEY_NUMBER for a numeric key], bare: how many sit under no property }. A function is what
 * functionsOf lists. A value is a top-level `const`/`let`/`var` with any other initializer, and `export default` (named 'default'). Every
 * other top-level statement that holds a typed number (a call, a destructuring, a class) is folded into ONE row a file named
 * '<statements>', at the first one's line. Pure.
 */
export function bindingsOf(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const rows = [];
  let rest = null;
  const measure = (node) => {
    const typed = [], keys = new Set();
    let bare = 0;
    const visit = (x, owner) => {
      if (x.kind === ts.SyntaxKind.NumericLiteral && !PLAIN_NUMBERS.includes(x.text)) {
        typed.push(x.text);
        const isKey = x.parent && ts.isPropertyAssignment(x.parent) && x.parent.name === x;
        const k = isKey ? KEY_NUMBER : owner;
        keys.add(k);
        if (k === BARE) bare++;
      }
      const next = ts.isPropertyAssignment(x) ? propName(x.name) : owner;
      ts.forEachChild(x, (c) => visit(c, c === x.name && ts.isPropertyAssignment(x) ? owner : next));
    };
    visit(node, BARE);
    return { typed, keys: [...keys].sort(), bare };
  };
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  for (const st of sf.statements) {
    const exported = !!(st.modifiers && st.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    const found = [];
    if (ts.isFunctionDeclaration(st) && st.name) found.push([st.name.text, st, 'function']);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!d.initializer) continue;
        if (!ts.isIdentifier(d.name)) { found.push([null, d, 'statements']); continue; }
        found.push([d.name.text, d.initializer, ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer) ? 'function' : 'value']);
      }
    } else if (ts.isExportAssignment(st)) found.push(['default', st.expression, 'value']);
    else found.push([null, st, 'statements']);
    for (const [name, node, kind] of found) {
      const m = measure(node);
      if (!m.typed.length) continue;
      if (kind === 'statements') {
        if (!rest) { rest = { file, name: '<statements>', line: lineOf(node), kind, exported: false, typed: [], keys: new Set(), bare: 0 }; rows.push(rest); }
        rest.typed.push(...m.typed); m.keys.forEach((k) => rest.keys.add(k)); rest.bare += m.bare;
        continue;
      }
      rows.push({ file, name, line: lineOf(node), kind, exported: exported || name === 'default', ...m });
    }
  }
  if (rest) rest.keys = [...rest.keys].sort();
  return rows;
}

const wordIn = (name, text) => new RegExp('(?<![\\w$])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])').test(text);

/**
 * THE CENSUS. `files` is [[path, text]], `registers` the register files' text joined. Answers every function row with `named`,
 * sorted by file then line. Pure: the selftest plants both arguments.
 */
export function census(files, registers) {
  const rows = [];
  for (const [file, text] of files) for (const r of functionsOf(file, text)) rows.push({ ...r, named: wordIn(r.name, registers) });
  return rows.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}

/** The three numbers of one folder (and what stands behind them). */
export function folderNumbers(rows, folder) {
  const mine = rows.filter((r) => r.file.startsWith(folder + '/'));
  const typed = mine.filter((r) => r.typed.length > 0);
  return {
    folder,
    functions: mine.length,
    notExported: mine.filter((r) => !r.exported).length,
    named: mine.filter((r) => r.named).length,
    holdTyped: typed.length,
    holdTypedNamed: typed.filter((r) => r.named).length,
    holdTypedNotExported: typed.filter((r) => !r.exported).length,
    typedNumbers: typed.reduce((n, r) => n + r.typed.length, 0),
  };
}

/** The rows a register should hold and does not: a typed number and no name, most numbers first. */
export const gapsOf = (rows) => rows.filter((r) => r.typed.length > 0 && !r.named)
  .sort((a, b) => (b.typed.length - a.typed.length) || (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));

/** The gap files: unnamed typed functions and their numbers, by file, most numbers first. */
export function gapFiles(rows) {
  const by = new Map();
  for (const r of gapsOf(rows)) {
    const f = by.get(r.file) || { file: r.file, functions: 0, numbers: 0 };
    f.functions++; f.numbers += r.typed.length; by.set(r.file, f);
  }
  return [...by.values()].sort((a, b) => (b.numbers - a.numbers) || (a.file < b.file ? -1 : 1));
}

const readFolder = (root, folder) => walk(join(root, folder)).map((p) => [slash(relative(root, p)), readFileSync(p, 'utf8')]);
/** Every rule-code source file under `root`: [[path, text]], sorted (the lever registry reads the same files the census counts). */
export const readRuleFiles = (root) => RULE_FOLDERS.flatMap((f) => readFolder(root, f));
const readRegisters = (root) => REGISTER_FILES.map((f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '')).join('\n');

function report(root, { list = false, json = false } = {}) {
  const registers = readRegisters(root);
  const rule = census(RULE_FOLDERS.flatMap((f) => readFolder(root, f)), registers);
  const client = census(CLIENT_FOLDERS.flatMap((f) => readFolder(root, f)), registers);
  const numbers = RULE_FOLDERS.map((f) => folderNumbers(rule, f));
  const clientNumbers = CLIENT_FOLDERS.map((f) => folderNumbers(client, f));
  if (json) { process.stdout.write(JSON.stringify({ rules: { plain: PLAIN_NUMBERS, registers: REGISTER_FILES }, numbers, clientNumbers, rows: rule }, null, 1) + '\n'); return; }
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  console.log('census: every top-level function in the rule code (a report: it stores nothing and never fails a run)');
  console.log('  a typed number is any numeric literal other than ' + PLAIN_NUMBERS.join(', ') + '. Named = the name is a whole word in a register file.');
  console.log('');
  console.log('  ' + pad('folder', 30) + num('functions', 10) + num('hold a typed number', 21) + num('of those, named', 17) + '   (not exported / named at all / typed numbers)');
  for (const n of numbers) {
    console.log('  ' + pad(n.folder, 30) + num(n.functions, 10) + num(n.holdTyped, 21) + num(n.holdTypedNamed, 17) + `   (${n.notExported} / ${n.named} / ${n.typedNumbers})`);
  }
  console.log('');
  console.log('  the client, typed numbers only (display math or a leak, to be read, not claimed):');
  for (const n of clientNumbers) console.log('  ' + pad(n.folder, 30) + num(n.functions, 10) + num(n.holdTyped, 21) + `   (${n.typedNumbers} typed numbers)`);
  const gaps = gapsOf(rule);
  console.log('');
  console.log(`  ${gaps.length} function(s) hold a typed number and no register names them. The files that hold most of them:`);
  for (const f of gapFiles(rule).slice(0, 15)) console.log('    ' + pad(f.file, 52) + num(f.functions, 4) + ' function(s)' + num(f.numbers, 5) + ' number(s)');
  if (list) {
    console.log('');
    console.log('  every one of them (file:line name, exported or private, its numbers):');
    for (const r of gaps.slice().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))) {
      console.log(`    ${r.file}:${r.line} ${r.name} ${r.exported ? 'exported' : 'private'} [${r.typed.join(' ')}]`);
    }
  } else console.log('  (--list prints every one)');
}

// ── the proofs ──────────────────────────────────────────────────────────────
function selftest() {
  const fails = [];
  let proofs = 0;
  const ok = (cond, what) => { proofs++; if (!cond) fails.push(what); };
  const CLEAN = ['src/core/clean.js', 'export function half(n) { return n / 2; }\nfunction pct(n) { return (n * 100) / 1000; }\nexport const TABLE = { a: 0.37 };\n'];
  const REG = '{ "impl": ["src/core/known.js knownBlow"] }';
  const run = (extra) => census([CLEAN, ...extra], REG);
  const one = (rows, name) => rows.find((r) => r.name === name);

  /* the control: plain numbers and a data table hold no typed number, so nothing is a gap */
  const control = run([]);
  ok(control.length === 2, 'control: two functions are listed (the exported one and the private one), got ' + control.length);
  ok(gapsOf(control).length === 0, 'control: 0, 1, 2, 100 and 1000 are not typed numbers and a table row is not a function');

  /* PLANT 1: an uncited function. It must be listed, unnamed, and in the gaps */
  const p1 = run([['src/core/planted.js', 'export function plantedUncited(skill) { return Math.floor(skill * 0.35) + 2; }\n']]);
  const r1 = one(p1, 'plantedUncited');
  ok(!!r1 && r1.named === false, 'an uncited function is listed and reads unnamed');
  ok(gapsOf(p1).some((r) => r.name === 'plantedUncited'), 'an uncited function with a typed number is a gap');
  ok(folderNumbers(p1, 'src/core').holdTyped === folderNumbers(control, 'src/core').holdTyped + 1, 'the folder count of functions holding a typed number rises by one');

  /* PLANT 2: a typed number in a PRIVATE function (the Tower heat's shape: not exported), and in an arrow assigned to a const */
  const p2 = run([['src/core/hunt/planted.js', 'function plantedHeat(floor) { return 1 + floor * 0.012; }\nconst plantedArrow = (n) => n * 5.4;\n']]);
  const r2 = one(p2, 'plantedHeat'), r2b = one(p2, 'plantedArrow');
  ok(!!r2 && r2.exported === false && r2.typed.join() === '0.012', 'a private function\'s typed number shows up with its value');
  ok(!!r2b && r2b.typed.join() === '5.4', 'an arrow assigned to a const is a function and its number shows up');
  ok(folderNumbers(p2, 'src/core').holdTypedNotExported === 2, 'both are counted as not exported');

  /* PLANT 3: the same number moved to a plain one must leave the gaps (the rule bites both ways) */
  const p3 = run([['src/core/planted.js', 'export function plantedUncited(skill) { return Math.floor(skill * 1) + 2; }\n']]);
  ok(one(p3, 'plantedUncited').typed.length === 0 && gapsOf(p3).length === 0, 'with its number made plain the function is no gap');

  /* PLANT 4: a function a register names reads named, and leaves the gaps. A longer name that only contains it does not */
  const p4 = run([['src/core/known.js', 'export function knownBlow(a) { return a * 0.6; }\nexport function knownBlowExtra(a) { return a * 0.6; }\n']]);
  ok(one(p4, 'knownBlow').named === true, 'a function a register names reads named');
  ok(one(p4, 'knownBlowExtra').named === false, 'a longer name that only contains a registered one is not named');
  ok(gapsOf(p4).length === 1 && gapsOf(p4)[0].name === 'knownBlowExtra', 'only the unnamed one is a gap');
  ok(folderNumbers(p4, 'src/core').holdTypedNamed === 1, 'the folder counts one typed function as named');

  /* PLANT 5: a nested function counts into its parent, a default parameter counts, a TypeScript file parses */
  const p5 = run([['supabase/functions/hr-accrue/planted.ts', 'export function outer(n: number, k = 0.25): number { const inner = (x: number) => x * 7; return inner(n) * k; }\n']]);
  const r5 = one(p5, 'outer');
  ok(!!r5 && r5.typed.slice().sort().join() === '0.25,7' && !one(p5, 'inner'), 'a nested function and a default parameter count into the top-level function');
  ok(folderNumbers(p5, 'supabase/functions/hr-accrue').functions === 1, 'the row lands in its own folder\'s numbers');

  /* PLANT 6: bindingsOf (the lever registry's unit) lists VALUES too, with the property each number sits under */
  const b6 = bindingsOf('src/data/planted.js', [
    'export const TABLE = Object.freeze({ wolf: { hp: 40, atk: 7 }, rat: { hp: 12, atk: 3, drops: [{ id: "x", ch: 0.05 }] } });',
    'export const SCALE = { 3: 4.5 };',
    'const LIST = [[5, 210], [10, 400]];',
    'export const PLAIN = { a: 1, b: 100 };',
    'export function blow(x) { return x * 0.35 + 7; }',
    'export default define({ respawnMs: 60000 });',
    'register(42); const { a, b } = pick(17);',
  ].join('\n'));
  const bOf = (n) => b6.find((r) => r.name === n);
  ok(bOf('TABLE') && bOf('TABLE').kind === 'value' && bOf('TABLE').keys.join() === 'atk,ch,hp' && bOf('TABLE').bare === 0, 'a table lists the keys its numbers sit under (hp, atk, a nested ch), none bare');
  ok(bOf('SCALE') && bOf('SCALE').keys.join() === KEY_NUMBER + ',3' && bOf('SCALE').typed.length === 2, 'a numeric key is a typed number under KEY_NUMBER, its value sits under the key');
  ok(bOf('LIST') && bOf('LIST').bare === 4 && !bOf('LIST').exported, 'an array of arrays is four bare numbers, not exported');
  ok(!bOf('PLAIN'), 'a binding of plain numbers is not listed');
  ok(bOf('blow') && bOf('blow').kind === 'function' && bOf('blow').bare === 2, 'a function is a binding with its bare numbers');
  ok(bOf('default') && bOf('default').keys.join() === 'respawnMs' && bOf('default').exported, 'export default is the binding "default"');
  ok(bOf('<statements>') && bOf('<statements>').typed.slice().sort().join() === '17,42' && bOf('<statements>').line === 7, 'other top-level statements fold into one <statements> row at the first one\'s line');

  for (const f of fails) console.error('  ✗ ' + f);
  console.log(fails.length ? `census --selftest: ${fails.length} proof(s) FAILED` : `census --selftest: ${proofs} proofs hold (an uncited function, a typed number in a private function and in an arrow, a named function, the plain numbers, bindingsOf's values, keys and folded statements)`);
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const known = ['--list', '--json', '--selftest'];
  const bad = argv.find((a) => !known.includes(a));
  if (bad) { console.error('census: unknown argument ' + bad + ' (takes ' + known.join(', ') + ')'); process.exit(2); }
  if (argv.includes('--selftest')) process.exit(selftest());
  report(ROOT, { list: argv.includes('--list'), json: argv.includes('--json') });
}
