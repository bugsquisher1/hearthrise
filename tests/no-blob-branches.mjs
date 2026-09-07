// ============================================================================
// tests/no-blob-branches.mjs — THE `isBlobRetired()` FORK IS EXTINCT, AND STAYS SO.
//
// ── WHAT THIS GUARD WAS, AND WHY IT CHANGED ───────────────────────────
// Cleanup slice 4 set out to DELETE the dormant halves of the 13 `isBlobRetired()`
// forks on the premise that "the flag is true since the b454 cutover, so the
// else-branch is dead". Measuring it showed the premise was FALSE:
//
//     src/net/capstone.js   isBlobRetired() { return !!on && isServerAccrualEnabled(); }
//     src/net/accrue.js     isServerAccrualEnabled() { localStorage['hr:serverAccrual'] !== 'off' }
//
// The predicate ANDed the b353 kill switch, so every dormant half was reachable
// on any device holding that key — and two of them were saveLocal() / loadLocal().
// So the guard FROZE the census instead of deleting, and re-checked its own
// premise on every run: "if the predicate is now a constant, the deletion this
// guard deferred is unblocked".
//
// b515 (2026-09-07) took that decision. The kill switch is retired,
// `isBlobRetired()` is the constant `BLOB_RETIRED`, and every fork — with its
// client-authored dormant half — is deleted. The census is therefore EMPTY and
// this file's job inverts: it is a RATCHET AT ZERO.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────
//   A1  NO file under src/ contains an `isBlobRetired()` conditional. Not one.
//       A new fork is a new client-authored fallback and CLAUDE.md §1 forbids it:
//       the capstone is not a flag to branch on any more, it is the model.
//       (capstone.js's own definition and its `__setBlobRetired` seam read a
//       private `armed()` helper, so they are not uses and need no exemption.)
//   A2  THE PREMISE, RE-CHECKED IN THE OTHER DIRECTION: `isBlobRetired()` must
//       NOT regain a conditional — specifically must not AND
//       `isServerAccrualEnabled()` again. A resurrected kill switch would make
//       every future fork reachable and quietly re-open the local game.
//   A3  THE CONTROL (--selftest). Each rule re-run against sources that break it.
//
// Usage:  node tests/no-blob-branches.mjs [--list] [--selftest]
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** file -> how many `isBlobRetired()` CONDITIONALS it holds. EMPTY since b515,
 *  and the empty object IS the assertion: `--list` prints nothing. Adding a row
 *  here is not how a new fork becomes legal — the fork is what needs justifying,
 *  in review, against CLAUDE.md §1. */
export const CENSUS = Object.freeze({});

/** A CONDITIONAL use, not a definition/export/re-publish. `isBlobRetired()` with
 *  a call site inside an `if`, a `?:`, a `&&`/`||` chain or a `!` — which is every
 *  shape a fork takes here. The definition in capstone.js (`export function
 *  isBlobRetired()`) and the window publish are excluded by construction: they
 *  are not followed by `()`. */
const USE = /isBlobRetired\s*\(\s*\)/g;

/** Strip comments and strings: this file's own prose names the symbol, and so do
 *  a dozen explanatory blocks in src/. */
export function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

export function countUses(src) {
  const code = codeOnly(src);
  let n = 0;
  USE.lastIndex = 0;
  let m;
  while ((m = USE.exec(code))) {
    // `export function isBlobRetired()` / `function isBlobRetired()` is the
    // DEFINITION, not a fork.
    const before = code.slice(Math.max(0, m.index - 24), m.index);
    if (/function\s+$/.test(before)) continue;
    n++;
  }
  return n;
}

export function auditSources(sources, census = CENSUS) {
  const findings = [];
  const seen = {};
  for (const [file, src] of Object.entries(sources)) {
    const n = countUses(src);
    if (n > 0) seen[file] = n;
  }
  for (const [file, n] of Object.entries(seen)) {
    const want = census[file];
    if (want === undefined) {
      findings.push(`${file}: a NEW isBlobRetired() fork (${n}). There are meant to be ZERO. `
        + 'b515 deleted all 13 of them together with the b353 kill switch that made their dormant '
        + 'halves reachable; a fourteenth means a client-authored fallback is back, which CLAUDE.md '
        + '§1 forbids. Route the capability through the server-mirrored value instead.');
    } else if (n > want) {
      findings.push(`${file}: ${n} isBlobRetired() forks, census says ${want}. The census is a RATCHET — `
        + 'it may fall, never rise.');
    }
  }
  for (const [file, want] of Object.entries(census)) {
    if (!(file in seen)) {
      findings.push(`${file}: the census claims ${want} isBlobRetired() fork(s) and there are none. `
        + 'Strike the row — a census that describes code nobody runs is READ as one that does.');
    } else if (seen[file] < want) {
      findings.push(`${file}: down to ${seen[file]} fork(s) from ${want}. Good — lower the census row in `
        + 'the same commit so the next reader measures against the truth.');
    }
  }
  return { findings, seen };
}

/** A2 — the premise, re-checked in the direction that now matters. */
export function auditPremise(capstoneSrc) {
  const code = codeOnly(capstoneSrc);
  const m = /function\s+isBlobRetired\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(code);
  if (!m) return ['src/net/capstone.js: isBlobRetired() not found — this guard is measuring nothing.'];
  if (/isServerAccrualEnabled\s*\(/.test(m[1])) {
    return ['src/net/capstone.js: isBlobRetired() ANDs isServerAccrualEnabled() again. That kill switch was '
      + 'RETIRED in b515 because its off position was a divergent single-device local game (blob upload, '
      + 'local away accrual, local gold mint, every intent dark) that was silently discarded on flip-back. '
      + 'Re-coupling the capstone to a runtime switch makes every dormant half reachable again — the exact '
      + 'state this census was written to freeze. Do not.'];
  }
  return [];
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

function loadSrc() {
  const out = {};
  for (const p of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    if (rel === 'src/features/smoke-test.js') continue;   // the suite drives the seam on purpose
    out[rel] = readFileSync(p, 'utf8');
  }
  return out;
}

// ── A3 THE CONTROL ────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const check = (what, ok, extra) => {
    console.log(`  ${ok ? '\u2713' : '\u2717'} ${what}`);
    if (!ok) { bad++; if (extra) console.log('      ' + extra); }
  };

  const one = 'if (isBlobRetired()) { return; }\n';
  check('bites: ANY file growing a fork, against the empty census',
    auditSources({ 'a.js': one }, {}).findings.length === 1);
  check('bites: two forks in one file',
    auditSources({ 'a.js': one + one }, {}).findings.length === 1);
  check('passes: the DEFINITION is not a fork',
    countUses('export function isBlobRetired() { return armed(); }') === 0);
  check('passes: the seam reading the private helper is not a fork',
    countUses('export function __setBlobRetired(v) { armOverride = v; return armed(); }') === 0);
  check('passes: the symbol named in PROSE and in a string is not a fork',
    countUses("/* isBlobRetired() explains itself */\nvar s = 'isBlobRetired()';\n") === 0);

  check('bites: the kill switch coming back',
    auditPremise('export function isBlobRetired() {\n  return armed() && isServerAccrualEnabled();\n}').length === 1);
  check('passes: the constant predicate as it stands',
    auditPremise('export function isBlobRetired() {\n  return armed();\n}').length === 0);
  check('bites: the predicate disappearing entirely',
    auditPremise('export const BLOB_RETIRED = true;').length === 1);

  {
    const sources = loadSrc();
    const { findings, seen } = auditSources(sources);
    const total = Object.values(seen).reduce((a, b) => a + b, 0);
    check(`not vacuous: ${Object.keys(sources).length} source file(s) scanned, ${total} fork(s) found`,
      Object.keys(sources).length > 50 && total === 0 && findings.length === 0, findings.join(' | '));
  }

  if (bad) { console.error(`no-blob-branches --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('no-blob-branches --selftest: all controls green.');
  process.exit(0);
}

const argv = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const sources = loadSrc();
  const { findings, seen } = auditSources(sources);
  const all = findings.concat(auditPremise(sources['src/net/capstone.js'] || ''));
  if (argv.includes('--list')) {
    for (const f of Object.keys(seen).sort()) console.log(`  ${String(seen[f]).padStart(2)}  ${f}`);
  }
  if (all.length) {
    console.error(`no-blob-branches — ${all.length} problem(s):`);
    for (const f of all) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`no-blob-branches — 0 isBlobRetired() fork(s) across ${Object.keys(sources).length} source `
    + 'file(s); the predicate is the constant BLOB_RETIRED, with no kill switch to make a dormant half '
    + 'reachable.');
  process.exit(0);
}
