#!/usr/bin/env node
// tools/verdict-cache.mjs — A GREEN VERDICT IS A FUNCTION OF ITS INPUTS (guard diet, 2026-10-10).
//
// tests/utc-midnight-replay.mjs replays the whole migration chain fifteen times with
// the snapshot cache OFF (it is a clock guard; a restored snapshot proves nothing),
// and it lives in tools/lane-done.mjs, so every lane paid ~3-15 min for it — on a
// chain nine lanes in ten never touched. Its verdict is a pure function of the
// bytes it reads. This records a GREEN verdict under a content-addressed key and
// lets the next run with byte-identical inputs skip the replay; any changed byte,
// a different Node, a different lockfile or different flags is a different key.
//
//   THE KEY  sha256 over: the command line; process.version; package-lock.json;
//            every file under each declared input path (dirs walked, sorted); and
//            the static relative-import closure of every .mjs/.js among them and
//            of the entry script. The same rule as tests/pglite-template.mjs:
//            content-addressed, no timestamps, no "invalidate" button to forget.
//   ONLY GREEN IS CACHED. A red, a crash or a timeout records nothing, so a red
//            always re-runs and is always read.
//   SHARED   in <git-common-dir>/hr-verdicts, so every worktree on the machine
//            benefits from one run; entries older than 14 days are pruned.
//   OFF      HR_VERDICT_CACHE=0 (or lane-done --no-cache) runs everything.
//
// CI never uses this: the matrix runs every guard on every push. It is a local
// runner's memory, and lane-done prints `cached` (with the key) so it is never
// mistaken for a run.
//
//   node tools/verdict-cache.mjs --selftest   mutation proof of the key and the green-only rule
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, renameSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const SKIP_DIRS = new Set(['node_modules', '.git', '.pglite-cache', '.ci-local']);
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;

function walk(abs, out) {
  let st;
  try { st = statSync(abs); } catch { out.push([abs, null]); return; }
  if (st.isDirectory()) {
    for (const n of readdirSync(abs).sort()) if (!SKIP_DIRS.has(n)) walk(join(abs, n), out);
  } else out.push([abs, abs]);
}

/** Relative static/dynamic import specifiers of a JS module (query strings dropped). */
export function relImports(text) {
  const out = [];
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?\1/g)) out.push(m[2]);
  return out;
}

/** Every file the key covers, absolute, sorted, de-duplicated. */
export function inputFiles(root, entry, inputs) {
  const files = new Map();
  const seen = new Set();
  const addFile = (abs) => {
    if (files.has(abs)) return;
    let bytes = null;
    try { bytes = readFileSync(abs); } catch { /* a missing input is part of the key */ }
    files.set(abs, bytes);
    if (bytes && /\.(m?js)$/.test(abs) && !seen.has(abs)) {
      seen.add(abs);
      for (const spec of relImports(bytes.toString('utf8'))) addFile(resolve(dirname(abs), spec));
    }
  };
  for (const p of [entry, 'package-lock.json', ...inputs]) {
    const acc = [];
    walk(join(root, p), acc);
    for (const [abs] of acc) addFile(abs);
  }
  return [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function verdictKey(root, argv, inputs) {
  const h = createHash('sha256');
  h.update(`v1\0${process.version}\0${argv.join(' ')}\0`);
  // Every HR_* switch a guard can read is part of the question it answered, except
  // the two cache switches themselves (they change speed, never the verdict).
  for (const k of Object.keys(process.env).filter((n) => n.startsWith('HR_')
    && !/^HR_(PGLITE_CACHE|VERDICT_CACHE)/.test(n)).sort()) h.update(`${k}=${process.env[k]}\0`);
  const entry = argv.find((a) => /\.m?js$/.test(a)) || argv[0];
  for (const [abs, bytes] of inputFiles(root, entry, inputs)) {
    h.update(relative(root, abs).replace(/\\/g, '/'));
    h.update('\0');
    h.update(bytes ? createHash('sha256').update(bytes).digest('hex') : 'MISSING');
    h.update('\0');
  }
  return h.digest('hex').slice(0, 32);
}

export function cacheDir(root = ROOT) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  const common = r.status === 0 ? resolve(root, r.stdout.trim()) : join(root, '.git');
  return join(common, 'hr-verdicts');
}

export function enabled() { return process.env.HR_VERDICT_CACHE !== '0'; }

export function lookup(key, dir = cacheDir()) {
  if (!enabled()) return null;
  const f = join(dir, `${key}.json`);
  if (!existsSync(f)) return null;
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'));
    if (v.status !== 0 || Date.now() - v.at > MAX_AGE_MS) return null;
    return v;
  } catch { return null; }
}

export function record(key, verdict, dir = cacheDir()) {
  if (!enabled() || verdict.status !== 0) return false;   // only GREEN is ever cached
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `${key}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify({ ...verdict, at: Date.now() }));
  renameSync(tmp, join(dir, `${key}.json`));
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    try { if (Date.now() - statSync(p).mtimeMs > MAX_AGE_MS) unlinkSync(p); } catch { /* best effort */ }
  }
  return true;
}

function selftest() {
  const fails = [];
  const ok = (label, cond) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) fails.push(label); };
  const tmp = mkdtempSync(join(tmpdir(), 'hr-verdict-selftest-'));
  const dir = join(tmp, 'cache');
  mkdirSync(join(tmp, 'lib'), { recursive: true });
  try {
    writeFileSync(join(tmp, 'entry.mjs'), "import { x } from './lib/dep.mjs?v=1';\nconsole.log(x);\n");
    writeFileSync(join(tmp, 'lib', 'dep.mjs'), 'export const x = 1;\n');
    writeFileSync(join(tmp, 'lib', 'data.sql'), 'select 1;\n');
    writeFileSync(join(tmp, 'package-lock.json'), '{}\n');
    const argv = ['node', 'entry.mjs'];
    const k0 = verdictKey(tmp, argv, ['lib/data.sql']);
    ok('the key is stable across two computations', k0 === verdictKey(tmp, argv, ['lib/data.sql']));
    const flip = (rel, text, label) => {
      const p = join(tmp, rel); const was = readFileSync(p, 'utf8');
      writeFileSync(p, text);
      ok(`MUTANT ${label} changes the key`, verdictKey(tmp, argv, ['lib/data.sql']) !== k0);
      writeFileSync(p, was);
    };
    flip('entry.mjs', "import { x } from './lib/dep.mjs?v=1';\nconsole.log(x + 1);\n", 'an entry-script byte');
    flip('lib/dep.mjs', 'export const x = 2;\n', 'a byte in an IMPORTED file (closure, query string dropped)');
    flip('lib/data.sql', 'select 2;\n', 'a byte in a declared input');
    flip('package-lock.json', '{"a":1}\n', 'the lockfile');
    ok('MUTANT different flags change the key', verdictKey(tmp, ['node', 'entry.mjs', '--mutate'], ['lib/data.sql']) !== k0);
    process.env.HR_SELFTEST_SWITCH = '1';
    ok('MUTANT an HR_* switch changes the key', verdictKey(tmp, argv, ['lib/data.sql']) !== k0);
    delete process.env.HR_SELFTEST_SWITCH;
    ok('the key is back after every mutant is reverted', verdictKey(tmp, argv, ['lib/data.sql']) === k0);
    ok('a RED verdict is never recorded', record(k0, { status: 1 }, dir) === false && lookup(k0, dir) === null);
    ok('a GREEN verdict is recorded and found', record(k0, { status: 0, ms: 5 }, dir) === true && lookup(k0, dir)?.status === 0);
    const prev = process.env.HR_VERDICT_CACHE;
    process.env.HR_VERDICT_CACHE = '0';
    ok('HR_VERDICT_CACHE=0 never answers from the cache', lookup(k0, dir) === null);
    if (prev === undefined) delete process.env.HR_VERDICT_CACHE; else process.env.HR_VERDICT_CACHE = prev;
    writeFileSync(join(dir, `${k0}.json`), JSON.stringify({ status: 0, at: Date.now() - MAX_AGE_MS - 1 }));
    ok('an entry older than 14 days is not an answer', lookup(k0, dir) === null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails.length ? `verdict-cache --selftest FAILED (${fails.length})` : 'verdict-cache --selftest PASSED');
  return fails.length ? 1 : 0;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/verdict-cache.mjs')) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  console.log('usage: node tools/verdict-cache.mjs --selftest   (the cache is used by tools/lane-done.mjs)');
}
