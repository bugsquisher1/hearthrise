// ============================================================================
// tests/no-blob-branches.mjs — THE `isBlobRetired()` FORK IS A CLOSED CENSUS.
//
// ── WHAT THIS GUARD IS, AND WHAT IT DELIBERATELY IS NOT ─────────────────────
// Cleanup slice 4 set out to DELETE the dormant halves of the 15 `isBlobRetired()`
// forks, on the stated premise that "the flag is true since the b454 cutover, so
// the else-branch is dead". Measuring it first showed the premise is FALSE, and
// the measurement is the reason this file is a ratchet rather than a deletion:
//
//     src/net/capstone.js:100
//       export function isBlobRetired() {
//         const on = armOverride !== null ? armOverride : BLOB_RETIRED;
//         return !!on && isServerAccrualEnabled();      // ← NOT a constant
//       }
//
//     src/net/accrue.js:136  isServerAccrualEnabled()
//       return localStorage.getItem('hr:serverAccrual') !== 'off';
//
// `BLOB_RETIRED` is indeed a literal `true`. The PREDICATE is not: it ANDs the
// b353 kill switch, which is a live, documented, deliberately-inverted operator
// escape hatch ("the literal string 'off' disables; anything else, including
// absent, is ON"). So every dormant branch below is REACHABLE today, by design,
// on any device where that key is set — and `legacy.js:859` / `:1286` are
// `saveLocal()` and `loadLocal()`, i.e. the only local-save code path the game
// has. Deleting them on a false premise is the one mistake in this codebase that
// costs a player their character, which is the stated top concern.
//
// Removing the kill switch's blob half may well be right — CLAUDE.md §1 says the
// client authors nothing, ever, and capstone.js's own header says refusing to
// proceed is correct where a local save would be the alternative. But that is a
// DECISION about an operational escape hatch (Coordinator + security-engineer),
// not a cleanup, and CLEANUP_PROGRAM.md's own "Do not touch" list freezes boot,
// `processOffline` and `restoreG` until slices 3–4 have been live a week.
//
// So: this guard FREEZES the census at today's sites. Nothing may add a
// sixteenth fork while the question is open, and the day the decision is taken
// the list shrinks to zero and this file is deleted with the seam (slice 8).
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   A1  the set of files containing an `isBlobRetired()` conditional matches the
//       census exactly — no new file may grow one, and a file that loses its
//       last one must be struck from the list rather than left describing code
//       nobody runs.
//   A2  the COUNT per file may not rise.
//   A3  THE HONESTY CHECK: `isBlobRetired()` must still be the conjunction it is
//       documented as. If it ever becomes a bare `return BLOB_RETIRED;` then the
//       premise this guard was written against has changed, and the guard says
//       so loudly instead of silently continuing to freeze a stale picture.
//   A4  THE CONTROL (--selftest). Each rule re-run against sources that break it.
//
// Usage:  node tests/no-blob-branches.mjs [--list] [--selftest]
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** file -> how many `isBlobRetired()` CONDITIONALS it holds today. Measured, not
 *  guessed: `node tests/no-blob-branches.mjs --list` reproduces it. */
export const CENSUS = Object.freeze({
  'src/features/boot-hydration.js': 1,
  'src/features/companions.js': 1,
  'src/legacy.js': 3,
  'src/multi-character.js': 1,
  'src/net/accrue.js': 2,
  'src/net/auth.js': 1,
  'src/net/capstone.js': 2,   // canProceedArmed's `if (!isBlobRetired())` + __setBlobRetired's return
  'src/net/client-state.js': 1,
  'src/net/sync.js': 1,
});

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
      findings.push(`${file}: a NEW isBlobRetired() fork (${n}). The predicate is NOT a constant — it ANDs `
        + "the b353 kill switch (accrue.js isServerAccrualEnabled) — so this branch is reachable and its "
        + 'dormant half is a client-authored path CLAUDE.md §1 forbids. Do not add a sixteenth; route the '
        + 'capability through the server-mirrored value instead.');
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

/** A3 — the premise this guard was written against. */
export function auditPremise(capstoneSrc) {
  const code = codeOnly(capstoneSrc);
  const m = /function\s+isBlobRetired\s*\(\s*\)\s*\{([\s\S]*?)\n\}/.exec(code);
  if (!m) return ['src/net/capstone.js: isBlobRetired() not found — this guard is measuring nothing.'];
  if (!/isServerAccrualEnabled\s*\(/.test(m[1])) {
    return ['src/net/capstone.js: isBlobRetired() no longer ANDs isServerAccrualEnabled(). That was the '
      + 'whole reason the forks below were FROZEN rather than deleted (the b353 kill switch made every '
      + 'dormant half reachable). If the predicate is now a constant, the deletion this guard deferred is '
      + 'unblocked — do it, and delete this guard with it.'];
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

// ── A4 THE CONTROL ──────────────────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const check = (what, ok, extra) => {
    console.log(`  ${ok ? '✓' : '✗'} ${what}`);
    if (!ok) { bad++; if (extra) console.log('      ' + extra); }
  };

  const one = 'if (isBlobRetired()) { return; }\n';
  check('bites: a NEW file growing a fork',
    auditSources({ 'a.js': one }, {}).findings.length === 1);
  check('bites: a file growing a SECOND fork',
    auditSources({ 'a.js': one + one }, { 'a.js': 1 }).findings.length === 1);
  check('bites: a census row whose forks are gone',
    auditSources({}, { 'a.js': 1 }).findings.length === 1);
  {
    const f = auditSources({ 'a.js': one }, { 'a.js': 2 }).findings;
    check('bites (as a nudge): a fork removed without lowering the row',
      f.length === 1 && /lower the census row/.test(f[0]), f.join(' | '));
  }
  check('passes: the census matching exactly',
    auditSources({ 'a.js': one }, { 'a.js': 1 }).findings.length === 0);
  check('passes: the DEFINITION is not a fork',
    countUses('export function isBlobRetired() { return X; }') === 0);
  check('passes: the symbol named in PROSE and in a string is not a fork',
    countUses("/* isBlobRetired() explains itself */\nvar s = 'isBlobRetired()';\n") === 0);

  check('bites: the premise changing (a constant predicate)',
    auditPremise('export function isBlobRetired() {\n  return BLOB_RETIRED;\n}').length === 1);
  check('passes: the premise as it stands (the conjunction)',
    auditPremise('export function isBlobRetired() {\n  const on = X;\n  return !!on && isServerAccrualEnabled();\n}').length === 0);

  {
    const { findings, seen } = auditSources(loadSrc());
    const total = Object.values(seen).reduce((a, b) => a + b, 0);
    check(`not vacuous: ${total} real fork(s) across ${Object.keys(seen).length} file(s), census clean`,
      total >= 10 && findings.length === 0, findings.join(' | '));
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
  const total = Object.values(seen).reduce((a, b) => a + b, 0);
  console.log(`no-blob-branches — ${total} isBlobRetired() fork(s) across ${Object.keys(seen).length} file(s), `
    + 'exactly the frozen census; the predicate still ANDs the b353 kill switch, so none of them is dead code.');
  process.exit(0);
}
