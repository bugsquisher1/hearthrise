#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-module-size.mjs — NO CLIENT MODULE GROWS INTO A MONOLITH.
//
//   node tests/client-module-size.mjs             the guard
//   node tests/client-module-size.mjs --selftest  planted shapes must go RED / stay GREEN
//
// mutant-anchors: none — the proof measures in-memory file maps, never the tree
//
// The old client was one 19k-line script (src/legacy.js, deleted 2026-10-17).
// The rebuilt client lives in small modules, and this keeps it that way:
//   MS-1  every .js file under the client's own directories (CLIENT_DIRS) is at
//         most MAX_LINES lines. A module that needs more is two modules.
//   MS-2  non-vacuity: at least MIN_FILES files are measured, including the
//         session and app entry points.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENT_DIRS = Object.freeze(['src/app', 'src/session', 'src/shell', 'src/net', 'src/render', 'src/hunt-view', 'src/social']);
export const MAX_LINES = 600;
const MIN_FILES = 10;
const MUST = ['src/app/boot.js', 'src/session/account-session.js', 'src/session/character-session.js'];

function walk(dir, out = {}) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir)).sort()) {
    const p = dir + '/' + n;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out[p] = readFileSync(join(ROOT, p), 'utf8');
  }
  return out;
}

export function check(files) {
  const problems = [];
  const names = Object.keys(files);
  for (const f of names) {
    const n = files[f].split('\n').length - (files[f].endsWith('\n') ? 1 : 0);
    if (n > MAX_LINES) problems.push(`MS-1 ${f} is ${n} lines (max ${MAX_LINES}) — split it into modules with one job each`);
  }
  if (names.length < MIN_FILES || MUST.some((m) => !names.includes(m))) problems.push(`MS-2 only ${names.length} client module(s) measured — the guard is reading the wrong tree`);
  return problems;
}

const files = () => CLIENT_DIRS.reduce((acc, d) => walk(d, acc), {});

if (process.argv.includes('--selftest')) {
  const real = files();
  const cases = [
    ['clean tree', real, null],
    ['a 601-line module', { ...real, 'src/app/big.js': 'x\n'.repeat(MAX_LINES + 1) }, 'MS-1'],
    ['exactly the limit is allowed', { ...real, 'src/app/edge.js': 'x\n'.repeat(MAX_LINES) }, null],
    ['the tree not read', Object.fromEntries(Object.entries(real).slice(0, 3)), 'MS-2'],
  ];
  let bad = 0;
  for (const [name, f, want] of cases) {
    const got = check(f);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got[0] || 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ client-module-size --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log('✓ client-module-size --selftest: all ' + cases.length + ' cases behave');
  process.exit(0);
}
const f = files();
const problems = check(f);
for (const p of problems) console.error('✗ ' + p);
if (problems.length) process.exit(1);
console.log(`✓ client-module-size: ${Object.keys(f).length} client modules, every one ≤ ${MAX_LINES} lines`);
