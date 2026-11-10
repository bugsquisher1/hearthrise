#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// tests/client-module-size.mjs — NO MODULE GROWS INTO A MONOLITH.
//
//   node tests/client-module-size.mjs             the guard
//   node tests/client-module-size.mjs --write     re-record the ratchet's ceilings (they only fall)
//   node tests/client-module-size.mjs --selftest  planted shapes must go RED / stay GREEN
//
// mutant-anchors: none — the proof measures in-memory file maps, never the tree
//
// The old client was one 19k-line script (src/legacy.js, deleted 2026-10-17).
// The rebuilt client lives in small modules, and this keeps it that way:
//   MS-1  every .js file under the client's own directories (CLIENT_DIRS) is at
//         most MAX_LINES lines. A module that needs more is two modules.
//   MS-2  non-vacuity: at least MIN_FILES files are measured, including the
//         session and app entry points, the World's runtime and the edge's entry.
//   MS-3  THE WORLD AND THE EDGE (RATCHET_DIRS; architecture audit 2026-11-09, S8:
//         this guard read neither, and ran green beside a 649-line renderer and a
//         2,779-line settle). A file there is at most MAX_LINES lines too, UNLESS it
//         was already over on 2026-11-10: then tests/client-module-size.baseline.json
//         holds its size that day as its ceiling, and it may not grow by a line.
//         A new file never gets a ceiling: it starts under MAX_LINES.
//   MS-4  a ceiling only falls: --write refuses to raise one, and a ceiling on a file
//         that is not over MAX_LINES is refused. A file UNDER its ceiling (or split
//         away) is a NOTE, not a red: the lane that shrank it did the right thing, and
//         the next --write lowers the ceiling to where the file now stands.
// The run prints the five largest, the next to split.
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests/client-module-size.baseline.json');
export const CLIENT_DIRS = Object.freeze(['src/app', 'src/session', 'src/shell', 'src/net', 'src/render', 'src/hunt-view', 'src/social']);
export const RATCHET_DIRS = Object.freeze(['src/world', 'supabase/functions']);
export const MAX_LINES = 600;
const MIN_FILES = 10;
const MUST = ['src/app/boot.js', 'src/session/account-session.js', 'src/session/character-session.js'];
const MUST_RATCHET = ['src/world/world-boot.js', 'supabase/functions/hr-accrue/index.ts'];
const EXT = ['.js', '.ts'];

function walk(dir, out = {}) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir)).sort()) {
    const p = dir + '/' + n;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (EXT.some((e) => p.endsWith(e)) && (p.endsWith('.js') || dir.startsWith('supabase/'))) out[p] = readFileSync(join(ROOT, p), 'utf8');
  }
  return out;
}

export const linesOf = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/** The client's modules: MS-1 and MS-2. */
export function check(files) {
  const problems = [];
  const names = Object.keys(files);
  for (const f of names) {
    const n = linesOf(files[f]);
    if (n > MAX_LINES) problems.push(`MS-1 ${f} is ${n} lines (max ${MAX_LINES}) — split it into modules with one job each`);
  }
  if (names.length < MIN_FILES || MUST.some((m) => !names.includes(m))) problems.push(`MS-2 only ${names.length} client module(s) measured — the guard is reading the wrong tree`);
  return problems;
}

/** The World and the edge: MS-3 and MS-4. `ceilings`: { file: lines } for the files over MAX_LINES on 2026-11-10.
 *  `notes` (optional) collects the ceilings a --write would lower. */
export function checkRatchet(files, ceilings, notes = []) {
  const problems = [];
  const names = Object.keys(files);
  for (const f of names) {
    const n = linesOf(files[f]);
    const top = ceilings[f];
    if (top === undefined) {
      if (n > MAX_LINES) problems.push(`MS-3 ${f} is ${n} lines (max ${MAX_LINES}) and holds no ceiling — a new module starts small; split it into modules with one job each`);
    } else if (n > top) problems.push(`MS-3 ${f} grew to ${n} lines (ceiling ${top}, already over ${MAX_LINES}) — it may not grow: move the new code to its own module`);
    else if (n < top) notes.push(`${f} is ${n} lines, under its ceiling ${top}`);
  }
  for (const f of Object.keys(ceilings)) {
    if (!(f in files)) notes.push(`${f} holds a ceiling and is gone`);
    else if (ceilings[f] <= MAX_LINES) problems.push(`MS-4 ${f} holds a ceiling of ${ceilings[f]}, not over ${MAX_LINES} — a file under the limit needs none`);
  }
  if (names.length < MIN_FILES || MUST_RATCHET.some((m) => !names.includes(m))) problems.push(`MS-2 only ${names.length} World and edge module(s) measured — the guard is reading the wrong tree`);
  return problems;
}

/** Today's over-the-limit files, as ceilings. */
export const ceilingsOf = (files) => Object.fromEntries(Object.keys(files).sort().map((f) => [f, linesOf(files[f])]).filter(([, n]) => n > MAX_LINES));

const files = () => CLIENT_DIRS.reduce((acc, d) => walk(d, acc), {});
const ratchetFiles = () => RATCHET_DIRS.reduce((acc, d) => walk(d, acc), {});
const readCeilings = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).ceilings || {} : {});

if (process.argv.includes('--selftest')) {
  const real = files();
  const rat = ratchetFiles(); const tops = readCeilings();
  const over = Object.keys(tops)[0];
  const small = Object.keys(rat).find((f) => !(f in tops));
  const cases = [
    ['clean tree', () => check(real), null],
    ['a 601-line module', () => check({ ...real, 'src/app/big.js': 'x\n'.repeat(MAX_LINES + 1) }), 'MS-1'],
    ['exactly the limit is allowed', () => check({ ...real, 'src/app/edge.js': 'x\n'.repeat(MAX_LINES) }), null],
    ['the tree not read', () => check(Object.fromEntries(Object.entries(real).slice(0, 3))), 'MS-2'],
    ['the World and the edge as they are', () => checkRatchet(rat, tops), null],
    ['a new 601-line World module', () => checkRatchet({ ...rat, 'src/world/big.js': 'x\n'.repeat(MAX_LINES + 1) }, tops), 'MS-3 src/world/big.js'],
    ['a new 601-line edge module', () => checkRatchet({ ...rat, 'supabase/functions/hr-accrue/big.ts': 'x\n'.repeat(MAX_LINES + 1) }, tops), 'MS-3 supabase/functions/hr-accrue/big.ts'],
    ['a small World module grows past the limit', () => checkRatchet({ ...rat, [small]: 'x\n'.repeat(MAX_LINES + 1) }, tops), 'MS-3 ' + small],
    ['a file over the limit grows by one line', () => checkRatchet({ ...rat, [over]: rat[over] + 'x\n' }, tops), 'MS-3 ' + over],
    ['a file exactly at its ceiling is allowed', () => checkRatchet({ ...rat, [over]: 'x\n'.repeat(tops[over]) }, tops), null],
    ['a file that shrank under its ceiling is no red', () => checkRatchet({ ...rat, [over]: 'x\n'.repeat(tops[over] - 1) }, tops), null],
    ['...and it is noted for the next --write', () => { const notes = []; checkRatchet({ ...rat, [over]: 'x\n'.repeat(tops[over] - 1) }, tops, notes); return notes.length === 1 ? [] : ['MS-4 no note']; }, null],
    ['a ceiling handed to a file under the limit', () => checkRatchet(rat, { ...tops, [small]: linesOf(rat[small]) }), 'MS-4 ' + small],
    ['a file grown past a ceiling that was lowered', () => checkRatchet(rat, { ...tops, [over]: tops[over] - 10 }), 'MS-3 ' + over],
    ['the World and the edge not read', () => checkRatchet(Object.fromEntries(Object.entries(rat).slice(0, 3)), {}), 'MS-2'],
  ];
  let bad = 0;
  for (const [name, run, want] of cases) {
    const got = run();
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got[0] || 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ client-module-size --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log('✓ client-module-size --selftest: all ' + cases.length + ' cases behave');
  process.exit(0);
}

const r = ratchetFiles();
if (process.argv.includes('--write')) {
  const now = ceilingsOf(r); const was = readCeilings();
  const raised = existsSync(BASELINE) ? Object.keys(now).filter((f) => !(f in was) || now[f] > was[f]) : [];
  if (raised.length) { console.error('✗ client-module-size --write: REFUSED, a ceiling only falls: ' + raised.map((f) => f + ' ' + (was[f] || 'none') + ' -> ' + now[f]).join(', ')); process.exit(1); }
  writeFileSync(BASELINE, JSON.stringify({ _generated_by: 'node tests/client-module-size.mjs --write',
    _note: 'World and edge modules over ' + MAX_LINES + ' lines on 2026-11-10, each at its size as its ceiling. A ceiling only falls; a new file gets none.', ceilings: now }, null, 2) + '\n');
  console.log('✓ client-module-size --write: ' + Object.keys(now).length + ' ceiling(s)');
  process.exit(0);
}
const f = files();
const notes = [];
const problems = check(f).concat(checkRatchet(r, readCeilings(), notes));
for (const p of problems) console.error('✗ ' + p);
if (problems.length) process.exit(1);
const largest = Object.keys(r).map((p) => [p, linesOf(r[p])]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`✓ client-module-size: ${Object.keys(f).length} client modules, every one ≤ ${MAX_LINES} lines; ${Object.keys(r).length} World and edge modules, ${Object.keys(readCeilings()).length} held at their ceiling`);
if (notes.length) console.log('  ' + notes.length + ' ceiling(s) can fall (--write lowers them): ' + notes.join(' · '));
console.log('  the five largest, the next to split: ' + largest.map(([p, n]) => p.replace('supabase/functions/', '') + ' ' + n).join(' · '));
