// tools/lib/gh-runs.mjs — the GitHub Actions reads shared by tools/release-check.local.mjs and
// tools/lane-watch.local.mjs.
//
//   node tools/lib/gh-runs.mjs --selftest   canned `gh run list --json` / API payloads → verdicts
//
// WHY (2026-10-21): both tools read GitHub's PUBLIC Actions API with no token. That API allows
// 60 calls an hour per IP; one `release-check --wait` (2 calls a minute) or `lane-watch --every`
// empties it, and every later call answers 403 "API rate limit exceeded". release-check then
// read the 403 body's missing `workflow_runs` as an empty list and printed "no smoke run yet"
// for release/v0.2.24 while run 39682197149 on it was green; lane-watch showed "GitHub 403".
// The fix: read through the signed-in `gh` CLI (5000 calls/hour, and the token never touches
// argv or output), fall back to the public API only when gh is missing, and NEVER turn an
// error into "no run" — an error is printed as an error.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isMain } from '../../tests/_is-main.mjs';

export const REPO = 'bugsquisher1/hearthrise';
export const WORKFLOW = 'smoke';
const FIELDS = 'databaseId,workflowName,status,conclusion,headSha,headBranch,url';
const GH_PATHS = ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'];

let ghBin;
function gh() {
  if (ghBin !== undefined) return ghBin;
  ghBin = null;
  for (const p of GH_PATHS) {
    if (p !== 'gh' && !existsSync(p)) continue;
    try { execFileSync(p, ['--version'], { stdio: 'ignore' }); ghBin = p; break; } catch { /* next */ }
  }
  return ghBin;
}
const ghJson = (args) => JSON.parse(execFileSync(gh(), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }));

/* One run, one shape, whichever source it came from. */
export function normalizeRun(r) {
  return {
    id: r.databaseId ?? r.id,
    workflow: r.workflowName ?? r.name,
    status: r.status,
    conclusion: r.conclusion || null,
    sha: r.headSha ?? r.head_sha ?? '',
    branch: r.headBranch ?? r.head_branch ?? '',
    url: r.url && !/api\.github\.com/.test(r.url) ? r.url : r.html_url || r.url || '',
  };
}

/* A parsed body from either source → { runs } or { err }. A body that is not a run list
   (a 403/404 message, a rate-limit notice) is an ERROR, never an empty list. */
export function parseRunList(body, httpStatus = 200) {
  if (httpStatus !== 200) return { err: `GitHub ${httpStatus}${body && body.message ? ' ' + String(body.message).slice(0, 60) : ''}` };
  const list = Array.isArray(body) ? body : body && Array.isArray(body.workflow_runs) ? body.workflow_runs : null;
  if (!list) return { err: `GitHub: unexpected reply${body && body.message ? ' — ' + String(body.message).slice(0, 60) : ''}` };
  return { runs: list.map(normalizeRun) };
}

/* Newest-first runs of the smoke workflow (optionally one branch). */
export async function listRuns({ branch, limit = 20 } = {}) {
  if (gh()) {
    const args = ['run', 'list', '-R', REPO, '--workflow', WORKFLOW, '--limit', String(limit), '--json', FIELDS];
    if (branch) args.push('--branch', branch);
    try { return parseRunList(ghJson(args)); }
    catch (e) { return { err: 'gh run list failed: ' + String(e.stderr || e.message).trim().split('\n')[0].slice(0, 80) }; }
  }
  try {
    const q = `per_page=${limit}` + (branch ? `&branch=${encodeURIComponent(branch)}` : '');
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}.yml/runs?${q}`, { headers: { 'User-Agent': 'hearthrise-tools' } });
    return parseRunList(await r.json().catch(() => null), r.status);
  } catch (e) { return { err: 'GitHub unreachable' }; }
}

/* The failed jobs of one run → [{ name, conclusion, failedSteps: [names] }]. */
export async function failedJobs(id) {
  let jobs = [];
  try {
    if (gh()) jobs = ghJson(['run', 'view', String(id), '-R', REPO, '--json', 'jobs']).jobs || [];
    else jobs = (await (await fetch(`https://api.github.com/repos/${REPO}/actions/runs/${id}/jobs?per_page=100`, { headers: { 'User-Agent': 'hearthrise-tools' } })).json()).jobs || [];
  } catch (e) { return [{ name: '(could not read jobs)', conclusion: String(e.message).slice(0, 60), failedSteps: [] }]; }
  return jobs.filter((j) => j.conclusion !== 'success' && j.conclusion !== 'skipped')
    .map((j) => ({ name: j.name, conclusion: j.conclusion, failedSteps: (j.steps || []).filter((s) => s.conclusion === 'failure').map((s) => s.name) }));
}

/* The verdict line for one branch, from a listRuns() result. Pure. */
export function branchVerdict(branch, res) {
  if (res.err) return { done: false, line: `${branch}: cannot read CI (${res.err})` };
  const w = res.runs.find((r) => r.workflow === WORKFLOW && (!r.branch || r.branch === branch));
  if (!w) return { done: false, line: `${branch}: no smoke run yet` };
  if (w.status !== 'completed') return { done: false, line: `${branch}: ${w.status} (${w.sha.slice(0, 9)})` };
  if (w.conclusion === 'success') return { done: true, ok: true, line: `${branch}: GREEN (${w.sha.slice(0, 9)})`, run: w };
  return { done: true, ok: false, line: `${branch}: RED (${w.sha.slice(0, 9)}) ${w.url}`, run: w };
}

/* head_branch → 'green' | conclusion | status, newest run per branch. Pure. */
export function latestByBranch(res) {
  if (res.err) return { err: res.err };
  const map = new Map();
  for (const w of res.runs) {
    if (w.workflow !== WORKFLOW || map.has(w.branch)) continue;
    map.set(w.branch, w.status === 'completed' ? (w.conclusion === 'success' ? 'green' : w.conclusion) : w.status);
  }
  return { map };
}

/* ── selftest: canned payloads, no network ─────────────────────────────────── */
if (isMain(import.meta.url) && process.argv.includes('--selftest')) {
  let fails = 0;
  const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
  // What `gh run list --json databaseId,workflowName,…` printed for release/v0.2.24 on 2026-10-21.
  const GH_LIST = [{ conclusion: 'success', databaseId: 39682197149, headBranch: 'release/v0.2.24', headSha: '7e262b83e54caf24a15cc35636daae8e74dedf80', status: 'completed', url: 'https://github.com/bugsquisher1/hearthrise/actions/runs/39682197149', workflowName: 'smoke' }];
  const v = branchVerdict('release/v0.2.24', parseRunList(GH_LIST));
  ok(v.done && v.ok && /GREEN \(7e262b83e\)/.test(v.line), `gh payload with a green smoke run → GREEN (got "${v.line}")`);
  // What the anonymous API answered at the same moment.
  const RATE = { message: 'API rate limit exceeded for 64.131.33.0. (But here\'s the good news: …)', documentation_url: 'https://docs.github.com/rest' };
  const r403 = branchVerdict('release/v0.2.24', parseRunList(RATE, 403));
  ok(!/no smoke run yet/.test(r403.line) && /403/.test(r403.line), `API 403 → an error line, not "no smoke run yet" (got "${r403.line}")`);
  const r200odd = branchVerdict('main', parseRunList(RATE, 200));
  ok(!/no smoke run yet/.test(r200odd.line), `a 200 body with no run list → an error line (got "${r200odd.line}")`);
  // The API shape still works when gh is absent.
  const API = { total_count: 1, workflow_runs: [{ id: 7, name: 'smoke', status: 'completed', conclusion: 'failure', head_sha: 'abcdef1234567', head_branch: 'main', html_url: 'https://github.com/x/actions/runs/7', url: 'https://api.github.com/x/7' }] };
  const red = branchVerdict('main', parseRunList(API));
  ok(red.done && !red.ok && /RED \(abcdef123\) https:\/\/github\.com/.test(red.line), `API payload with a failed run → RED + html url (got "${red.line}")`);
  // Another workflow on the branch is not the smoke verdict.
  const other = branchVerdict('lane/x', parseRunList([{ ...GH_LIST[0], headBranch: 'lane/x', workflowName: 'perf-measure' }]));
  ok(/no smoke run yet/.test(other.line), `only a perf-measure run → no smoke run yet (got "${other.line}")`);
  const lw = latestByBranch(parseRunList([...GH_LIST, { ...GH_LIST[0], status: 'in_progress', conclusion: '', headBranch: 'lane/y' }]));
  ok(lw.map && lw.map.get('release/v0.2.24') === 'green' && lw.map.get('lane/y') === 'in_progress', 'lane-watch map from a gh payload');
  ok(/^GitHub 403 API rate limit/.test(latestByBranch(parseRunList(RATE, 403)).err || ''), 'lane-watch carries the 403 as an error');
  console.log(fails ? `gh-runs selftest: ${fails} FAILED` : 'gh-runs selftest: all cases pass');
  process.exit(fails ? 1 : 0);
}
