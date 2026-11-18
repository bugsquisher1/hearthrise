#!/usr/bin/env node
// tools/lib/nightly-health.mjs — IS THE NIGHTLY SWEEP GREEN? One line, said where the Coordinator looks.
//
//   import { nightlyHealth } from './lib/nightly-health.mjs'   { state, loud, line, full } (tools/hooks/session-brief.mjs,
//                                                             tools/release-check.local.mjs, tools/release-preflight.local.mjs)
//   node tools/lib/nightly-health.mjs                         the line now (cached 30 min, like every caller)
//   node tools/lib/nightly-health.mjs --selftest              green / red / cancelled / stale / none / unreadable on planted sweeps
//
// WHY (lane/ci-speed, 2026-11-18). tools/mutant-gate.mjs runs EVERY proof of a job on every release push when the last
// nightly did not prove that job green, and every proof of every job when that nightly cannot be read or is over 48 h old
// (tools/lib/ci-history.mjs). Of the six nightlies 11-12..11-17 four ended cancelled or red, three at a job's own timeout,
// so releases ran full sweeps (about 1,590 job-min, 145 min of wall time on 44144849725) and nobody saw why. This says it in
// the session brief, beside each release run and before each push. It reads the sweep with ci-history's own readNightly,
// so what it says is what the gate will do.
//
// CHEAP: the sweep list and that sweep's jobs, two calls, through `gh api` (authenticated) or else the public API, one
// attempt each with an 8 s limit, kept in the temp folder for 30 min. A failed read says UNREADABLE and is not cached.
// mutant-anchors: none — the selftest plants sweeps and copies of the verdict, never a file
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain } from '../../tests/_is-main.mjs';
import { readNightly, STALE_MS } from './ci-history.mjs';

export const REPO = 'bugsquisher1/hearthrise';
const CACHE = join(tmpdir(), 'hr-nightly-health.json');
const TTL_MS = 30 * 60000;
/* Jobs with no proof in them: skipped on a sweep by design (smoke.yml's release-proven only runs on a push to main). */
const NO_PROOFS = new Set(['release-proven']);
const RED = new Set(['failure', 'timed_out']);

const hours = (ms) => (ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} min` : `${Math.round(ms / 3600e3)} h`);

/**
 * The verdict. Pure. nightly: readNightly's answer ({ at, id, jobs: { name: conclusion } }) or null; error: why it could not be
 * read; jobNames: smoke.yml's jobs now (a job the sweep never ran also runs in full). full: the job names a release push runs
 * in full because of the sweep, or 'all'.
 */
export function nightlyVerdict({ nightly, error = null, now, jobNames = [] }) {
  const tail = 'until a nightly is green';
  if (error) return { state: 'unreadable', loud: true, full: 'all', line: `NIGHTLY UNREADABLE (${String(error).slice(0, 80)}): every release runs FULL proofs on every job ${tail}` };
  if (!nightly) return { state: 'none', loud: true, full: 'all', line: `NIGHTLY NONE on record: every release runs FULL proofs on every job ${tail}` };
  const age = now - Date.parse(nightly.at);
  const ref = `run ${nightly.id}, ${hours(age)} ago`;
  if (!(age <= STALE_MS)) return { state: 'stale', loud: true, full: 'all', line: `NIGHTLY STALE (>48 h: ${ref}): every release runs FULL proofs on every job ${tail}` };
  const jobs = nightly.jobs || {};
  const red = Object.keys(jobs).filter((n) => RED.has(jobs[n]));
  const cut = Object.keys(jobs).filter((n) => !NO_PROOFS.has(n) && !RED.has(jobs[n]) && jobs[n] !== 'success');
  const unseen = jobNames.filter((n) => !NO_PROOFS.has(n) && !(n in jobs));
  const full = [...red, ...cut, ...unseen];
  const also = unseen.length ? `; ${unseen.length} job(s) new since it run FULL too (${unseen.slice(0, 6).join(', ')}${unseen.length > 6 ? ', …' : ''})` : '';
  if (red.length) return { state: 'red', loud: true, full, line: `NIGHTLY RED (${ref}; ${red.join(', ')}${cut.length ? `; cancelled: ${cut.join(', ')}` : ''}): those jobs run FULL proofs on every release ${tail}${also}` };
  if (cut.length) return { state: 'cancelled', loud: true, full, line: `NIGHTLY CANCELLED (${ref}; ${cut.join(', ')} cut, a job past its timeout ends this way): those jobs run FULL proofs on every release ${tail}${also}` };
  return { state: 'green', loud: false, full, line: `nightly: green ${hours(age)} ago (run ${nightly.id})${also}` };
}

/* One GitHub read, synchronous, one attempt: `gh api` if it answers, else the public API. Throws with the reason. */
function ghBin() {
  const win = 'C:\\Program Files\\GitHub CLI\\gh.exe';
  return process.platform === 'win32' && existsSync(win) ? win : 'gh';
}
const PUBLIC = `fetch(process.env.U, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'hr-nightly-health' }, signal: AbortSignal.timeout(8000) })
  .then(async (r) => { if (!r.ok) { console.error('HTTP ' + r.status); process.exit(1); } process.stdout.write(await r.text()); })
  .catch((e) => { console.error(String(e.message || e)); process.exit(1); });`;
export function githubGet(path) {
  try {
    return JSON.parse(execFileSync(ghBin(), ['api', `repos/${REPO}${path}`], { encoding: 'utf8', timeout: 8000, maxBuffer: 5e7, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }));
  } catch { /* no gh, not signed in, or slow: the public API */ }
  const r = spawnSync(process.execPath, ['-e', PUBLIC], { encoding: 'utf8', timeout: 10000, maxBuffer: 5e7, env: { PATH: process.env.PATH, U: `https://api.github.com/repos/${REPO}${path}` } });
  if (r.status !== 0) throw new Error((r.stderr || r.error?.message || 'no answer').trim().split('\n')[0]);
  return JSON.parse(r.stdout);
}

/** smoke.yml's job names now, read from the file (no network). */
export function workflowJobs(root) {
  try {
    const text = readFileSync(join(root, '.github', 'workflows', 'smoke.yml'), 'utf8');
    const at = text.search(/^jobs:\s*$/m);
    return at < 0 ? [] : [...text.slice(at).matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
  } catch { return []; }
}

/** The line, read through the 30-minute cache. get: GitHub (injectable); fresh: skip the cache. Never throws. */
export function nightlyHealth({ root = process.cwd(), get = githubGet, now = Date.now(), fresh = false, cache = CACHE } = {}) {
  let nightly = null, error = null;
  let cached = null;
  try { cached = fresh ? null : JSON.parse(readFileSync(cache, 'utf8')); } catch { /* none */ }
  if (cached && now - cached.readAt < TTL_MS) nightly = cached.nightly;
  else {
    try {
      nightly = readNightly(get);
      try { writeFileSync(cache, JSON.stringify({ readAt: now, nightly })); } catch { /* the line still prints */ }
    } catch (e) { error = e.message || String(e); }
  }
  return nightlyVerdict({ nightly, error, now, jobNames: workflowJobs(root) });
}

// ── --selftest ─────────────────────────────────────────────────────────────
function selftest() {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const at = (h) => new Date(now - h * 3600e3).toISOString();
  const names = ['release-proven', 'in-page', 'db-replay', 'client-guards'];
  const sweep = (jobs, h = 5) => ({ at: at(h), id: 1, jobs: { 'release-proven': 'skipped', ...jobs } });
  const ok = { 'in-page': 'success', 'db-replay': 'success', 'client-guards': 'success' };
  const cases = (v) => [
    [v({ nightly: sweep(ok), now, jobNames: names }), (r) => r.state === 'green' && !r.loud && /green 5 h ago/.test(r.line) && r.full.length === 0, 'a green sweep 5 h old: green, quiet, nothing full'],
    [v({ nightly: sweep({ ...ok, 'db-replay': 'failure' }), now, jobNames: names }), (r) => r.state === 'red' && r.loud && /db-replay/.test(r.line) && r.full.join() === 'db-replay', 'a red job: RED, loud, that job named and full'],
    [v({ nightly: sweep({ ...ok, 'db-replay': 'timed_out' }), now, jobNames: names }), (r) => r.state === 'red', 'a timed-out job reads red'],
    [v({ nightly: sweep({ ...ok, 'in-page': 'cancelled' }), now, jobNames: names }), (r) => r.state === 'cancelled' && r.loud && /in-page/.test(r.line) && r.full.join() === 'in-page', 'a job cut at its timeout: CANCELLED, loud, named'],
    [v({ nightly: sweep(ok, 49), now, jobNames: names }), (r) => r.state === 'stale' && r.loud && r.full === 'all', 'a green sweep 49 h old: STALE, every job full'],
    [v({ nightly: null, now, jobNames: names }), (r) => r.state === 'none' && r.loud && r.full === 'all', 'no sweep on record: NONE, every job full'],
    [v({ nightly: sweep(ok), error: 'HTTP 502', now, jobNames: names }), (r) => r.state === 'unreadable' && r.loud && /HTTP 502/.test(r.line) && r.full === 'all', 'a failed read: UNREADABLE, says why, every job full'],
    [v({ nightly: sweep({ 'in-page': 'success' }), now, jobNames: names }), (r) => r.state === 'green' && r.full.join() === 'db-replay,client-guards' && /2 job\(s\) new/.test(r.line), 'jobs the sweep never ran are named and full'],
    [v({ nightly: sweep(ok), now, jobNames: names }), (r) => !r.full.includes('release-proven'), 'the release-proven gate (skipped on a sweep, no proofs) is not a problem'],
  ];
  const fails = [];
  for (const [r, pass, label] of cases(nightlyVerdict)) { const g = pass(r); console.log(`  ${g ? 'ok      ' : 'FAILED  '} ${label}`); if (!g) fails.push(label); }
  const mutants = [
    ['a cancelled job reads green', (o) => { const r = nightlyVerdict(o); return r.state === 'cancelled' ? { ...r, state: 'green', loud: false } : r; }],
    ['a red job reads cancelled', (o) => { const r = nightlyVerdict(o); return r.state === 'red' ? { ...r, state: 'cancelled' } : r; }],
    ['staleness is never checked', (o) => nightlyVerdict({ ...o, now: Date.parse(o.nightly?.at || o.now) + 3600e3 })],
    ['a failed read falls back to the cached sweep', (o) => nightlyVerdict({ ...o, error: null })],
    ['a loud state prints quietly', (o) => ({ ...nightlyVerdict(o), loud: false })],
    ['new jobs are not counted', (o) => nightlyVerdict({ ...o, jobNames: [] })],
    ['the gate job counts as cut', (o) => { const r = nightlyVerdict(o); return { ...r, full: r.full === 'all' ? r.full : [...r.full, 'release-proven'] }; }],
  ];
  for (const [label, impl] of mutants) {
    const missed = cases(impl).every(([r, pass]) => pass(r));
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} mutant: ${label}`);
    if (missed) fails.push(`mutant missed: ${label}`);
  }
  /* the cache: a fresh read is kept and served, a failed read is not kept */
  const file = join(tmpdir(), `hr-nightly-selftest-${process.pid}.json`);
  let calls = 0;
  const get = (p) => { calls++; return p.includes('/jobs') ? { jobs: [{ name: 'in-page', conclusion: 'success' }] } : { workflow_runs: [{ id: 5, event: 'schedule', conclusion: 'success', updated_at: at(2) }] }; };
  const a = nightlyHealth({ get, now, cache: file, fresh: true });
  const b = nightlyHealth({ get: () => { throw new Error('no network'); }, now: now + 60e3, cache: file });
  const c = nightlyHealth({ get: () => { throw new Error('no network'); }, now: now + TTL_MS + 60e3, cache: file });
  const cacheOk = a.state === 'green' && calls === 2 && b.state === 'green' && c.state === 'unreadable';
  console.log(`  ${cacheOk ? 'ok      ' : 'FAILED  '} two calls read a sweep; inside 30 min the cache answers; past it a failed read says UNREADABLE`);
  if (!cacheOk) fails.push('cache');
  rmSync(file, { force: true });
  console.log(fails.length ? `\nnightly-health --selftest: ${fails.length} failed` : `\nnightly-health --selftest: green, red, cancelled, stale, none and unreadable read right; ${mutants.length}/${mutants.length} mutants caught`);
  return fails.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  console.log(nightlyHealth({ fresh: process.argv.includes('--fresh') }).line);
}
