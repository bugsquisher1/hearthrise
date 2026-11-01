// ════════════════════════════════════════════════════════════════════════
// tools/lib/ci-history.mjs — WHAT tools/mutant-gate.mjs LEARNS FROM EARLIER RUNS.
//
// A NIGHTLY RED BLOCKS THE NEXT RELEASE (CLAUDE.md §3.6). Nothing enforced that: of the
// last ten nightlies six were red or cancelled and releases shipped over them. So a
// job the last sweep did not prove green runs every proof it holds on the next push,
// whatever the diff. If the red is still there the push goes red; once it is fixed the
// push goes green. A sweep that cannot be read or is older than STALE_MS proves nothing,
// so every job runs in full.
//
// A COMMIT IS PROVED ONCE. Main's push re-ran the proofs the green release run had just
// run on the very same commit (41296159657 and 41302817036: 88 minutes each), holding
// the 20 runner slots a fix-forward needs. Plain guards still run there.
//
// GitHub is read through one child process so the gate can stay synchronous, the token
// stays out of argv, and a stalled API costs a bounded wait.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';

export const STALE_MS = 48 * 3600 * 1000;
const WORKFLOW = '.github/workflows/smoke.yml';
const GET = `const u = process.env.HR_GATE_URL, t = process.env.HR_GATE_TOKEN;
const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'hr-mutant-gate' };
if (t) h.Authorization = 'Bearer ' + t;
fetch(u, { headers: h, signal: AbortSignal.timeout(20000) }).then(async (r) => {
  if (!r.ok) { console.error('HTTP ' + r.status); process.exit(1); }
  process.stdout.write(await r.text());
}).catch((e) => { console.error(String(e.message || e)); process.exit(1); });`;

function ghGet(path, env) {
  let last = '';
  for (let i = 0; i < 3; i++) {
    const r = spawnSync(process.execPath, ['-e', GET], { encoding: 'utf8', maxBuffer: 5e7, timeout: 30000,
      env: { PATH: env.PATH, HR_GATE_TOKEN: env.HR_GATE_TOKEN || '', HR_GATE_URL: `https://api.github.com/repos/${env.GITHUB_REPOSITORY}${path}` } });
    if (r.status === 0) return JSON.parse(r.stdout);
    last = (r.stderr || r.error?.message || 'no answer').trim().split('\n')[0];
  }
  throw new Error(`GET ${path}: ${last}`);
}

/** The last completed sweep on main: { at, id, red: [job names] } (a `*` when no job explains a red run), or null. */
function readNightly(env) {
  const latest = (ev) => ghGet(`/actions/workflows/smoke.yml/runs?branch=main&event=${ev}&status=completed&per_page=1`, env).workflow_runs || [];
  const runs = [...latest('schedule'), ...latest('workflow_dispatch')].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const run = runs[0];
  if (!run) return null;
  if (run.conclusion === 'success') return { at: run.updated_at, id: run.id, red: [] };
  const jobs = ghGet(`/actions/runs/${run.id}/jobs?per_page=100&filter=latest`, env).jobs || [];
  const red = jobs.filter((j) => !['success', 'skipped'].includes(j.conclusion)).map((j) => j.name);
  return { at: run.updated_at, id: run.id, red: red.length ? red : ['*'] };
}

/** A green release run of smoke.yml on this very commit: { id, branch }, or null. */
function readProved(env) {
  const runs = ghGet(`/actions/runs?head_sha=${env.GITHUB_SHA}&event=push&status=success&per_page=50`, env).workflow_runs || [];
  const hit = runs.find((r) => r.path === WORKFLOW && /^release\//.test(r.head_branch) && String(r.id) !== String(env.GITHUB_RUN_ID));
  return hit ? { id: hit.id, branch: hit.head_branch } : null;
}

/**
 * Everything the policy reads. HR_GATE_HISTORY (JSON) stands in for GitHub in the selftest.
 * A failed read never counts as good news: { nightlyError } goes full; no proof goes unproved.
 */
export function readHistory(env) {
  if (env.HR_GATE_HISTORY) return JSON.parse(env.HR_GATE_HISTORY);
  const out = { nightly: null, nightlyError: null, proved: null };
  try { out.nightly = readNightly(env); } catch (e) { out.nightlyError = e.message; }
  if (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF_NAME === 'main') {
    try { out.proved = readProved(env); } catch { /* not proved: the push's own diff decides */ }
  }
  return out;
}

/** { full, why } | { proved } | {} — what the history does to this job's plan. Pure. */
export function historyPolicy(history, { job, event, ref, now }) {
  if (event === 'push' && ref === 'main' && history.proved) return { proved: history.proved };
  if (history.nightlyError) return { full: true, why: `the last nightly could not be read (${history.nightlyError}) — fail safe` };
  const n = history.nightly;
  if (!n) return { full: true, why: 'no nightly sweep on record — fail safe' };
  if (!(now - Date.parse(n.at) <= STALE_MS)) return { full: true, why: `the last nightly (${n.id}, ${n.at}) is over 48 h old — fail safe` };
  if (n.red.includes('*') || n.red.includes(job)) return { full: true, why: `the last nightly (${n.id}) did not prove job ${job} green — a red nightly blocks the next release until fixed` };
  return {};
}
