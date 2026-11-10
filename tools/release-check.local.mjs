// tools/release-check.local.mjs — one verdict for a release: GitHub run, Pages, live engine.
//
//   node tools/release-check.local.mjs 0.2.21          check once
//   node tools/release-check.local.mjs 0.2.21 --wait   poll every 60 s until the run finishes and Pages serves it
//   node tools/release-check.local.mjs 0.2.21 --env staging   the REHEARSAL: the release run, the staging site's version,
//                                                      the staging engine (default: production; tools/lib/env.mjs)
//
// Reads only GitHub's public Actions API (no token), the site's BUILD file, and the hr-accrue GET's
// payload_sha256 compared with `node tools/pack-edge.mjs hr-accrue --hash` of this checkout.
// The first line printed is the project. Prints only what is not green. Local tool, not in CI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isMain } from '../tests/_is-main.mjs';
import { resolveEnv, clientKeyOf, runTool } from './lib/env.mjs';

const REPO = 'bugsquisher1/hearthrise';

/**
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, home, log, err, packHash, sleep }: injectable (tests/tool-env.mjs)
 */
export async function main(argv, deps = {}) {
const log = deps.log || console.log;
const fetchImpl = deps.fetch || fetch;
const read = deps.read || ((p) => readFileSync(p, 'utf8'));
const env = resolveEnv({ argv, write: false, home: deps.home, read });
const staging = env.name === 'staging';
const EDGE = env.fn('hr-accrue');
const ver = String(env.rest.find((a) => !String(a).startsWith('--')) || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(ver)) { (deps.err || console.error)('usage: node tools/release-check.local.mjs X.Y.Z [--wait] [--env staging|production]'); return 2; }
const wait = argv.includes('--wait');
const gh = async (p) => (await fetchImpl(`https://api.github.com/repos/${REPO}${p}`, { headers: { 'User-Agent': 'release-check' } })).json();

async function ciVerdict(branch) {
  const runs = (await gh(`/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`)).workflow_runs || [];
  /* by workflow PATH: a run whose workflow file fails to load is named after the file, not 'smoke' (10-30: the watcher read the older run) */
  const w = runs.find((r) => r.path === '.github/workflows/smoke.yml' || r.name === 'smoke');
  if (!w) return { done: false, line: `${branch}: no smoke run yet` };
  if (w.status !== 'completed') return { done: false, line: `${branch}: ${w.status} (${w.head_sha.slice(0, 9)})` };
  if (w.conclusion === 'success') return { done: true, ok: true, line: `${branch}: GREEN (${w.head_sha.slice(0, 9)})` };
  const jobs = ((await gh(`/actions/runs/${w.id}/jobs?per_page=50`)).jobs || []).filter((j) => j.conclusion !== 'success');
  if (!jobs.length) return { done: true, ok: false, line: `${branch}: RED (${w.head_sha.slice(0, 9)}) with NO jobs: the workflow file failed to load ${w.html_url}` };
  const why = jobs.map((j) => `    ✗ ${j.name}: ${(j.steps || []).filter((s) => s.conclusion === 'failure').map((s) => s.name).join(' | ') || j.conclusion}`);
  return { done: true, ok: false, line: `${branch}: RED (${w.head_sha.slice(0, 9)}) ${w.html_url}\n` + why.join('\n') };
}

async function liveVersion() {
  try { return ((await (await fetchImpl(env.site + '/src/build-info.js?n=' + Date.now())).text()).match(/version:\s*'([^']+)'/) || [])[1] || '?'; }
  catch (e) { return 'unreachable'; }
}

async function edgeVerdict() {
  let want = '';
  try { want = deps.packHash ? deps.packHash() : execFileSync('node', ['tools/pack-edge.mjs', 'hr-accrue', '--hash'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/[0-9a-f]{64}/)?.[0] || ''; } catch (e) { /* no hash */ }
  /* the key the gateway wants for this project: the one the client ships for it, else the one envs.json names */
  const key = clientKeyOf(read('src/net/supabase-bootstrap.js'), env.name) || env.publishableKey;
  let live = '';
  try { live = (await (await fetchImpl(EDGE, { headers: { Authorization: 'Bearer ' + key, apikey: key } })).json()).payload_sha256 || ''; } catch (e) { /* unreachable */ }
  if (!want || !live) return { ok: false, line: `engine: could not compare (build ${want.slice(0, 8) || '?'}, ${env.name} ${live.slice(0, 8) || '?'})` };
  return want === live ? { ok: true, line: `engine: ${env.name} matches this checkout (${live.slice(0, 8)})` }
    : { ok: false, line: `engine: MISMATCH, ${env.name} ${live.slice(0, 8)} vs this checkout ${want.slice(0, 8)} (deploy needed?)` };
}

for (;;) {
  /* staging has no `main` of its own: its site serves the release branch */
  const [rel, main, live, edge] = await Promise.all([ciVerdict(`release/v${ver}`), staging ? null : ciVerdict('main'), liveVersion(), edgeVerdict()]);
  const pages = live === ver ? `${staging ? 'staging site' : 'pages'}: serving v${live}` : `${staging ? 'staging site' : 'pages'}: serving v${live}, not v${ver} yet`;
  log(`${env.banner}\nv${ver} at ${new Date().toLocaleTimeString()}\n  ${rel.line}${main ? '\n  ' + main.line : ''}\n  ${pages}\n  ${edge.line}`);
  /* --wait stops as soon as the release run finishes: a red never reaches Pages, and waiting on Pages then hung silent for 10 h (10-29) */
  if (!wait || rel.done) {
    /* The rehearsal's verdict is about staging alone: its site and its engine both carry this release. The GitHub run judges beside it. */
    if (staging) log(live === ver && edge.ok ? 'VERDICT: staging carries this release. Play it.' : 'VERDICT: staging does not carry this release yet, see above');
    else log(rel.ok && live === ver ? 'VERDICT: shipped and green' : rel.done && !rel.ok ? 'VERDICT: red, see above' : 'VERDICT: not finished');
    return (rel.done && !rel.ok) || (staging && !(live === ver && edge.ok)) ? 1 : 0;
  }
  await (deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(60000);
}
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
