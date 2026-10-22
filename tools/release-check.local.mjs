// tools/release-check.local.mjs — one verdict for a release: GitHub run, Pages, live engine.
//
//   node tools/release-check.local.mjs 0.2.21          check once
//   node tools/release-check.local.mjs 0.2.21 --wait   poll every 60 s until the run finishes and Pages serves it
//
// Reads only GitHub Actions through the signed-in `gh` CLI (tools/lib/gh-runs.mjs; the public
// API is only a fallback — it allows 60 calls/hour and its 403 once read as "no smoke run yet"),
// the live BUILD file, and the hr-accrue GET's payload_sha256 compared with
// `node tools/pack-edge.mjs hr-accrue --hash` of this checkout.
// Prints only what is not green. Local tool, not in CI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { listRuns, failedJobs, branchVerdict } from './lib/gh-runs.mjs';

const EDGE = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue';
const ver = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(ver)) { console.error('usage: node tools/release-check.local.mjs X.Y.Z [--wait]'); process.exit(2); }
const wait = process.argv.includes('--wait');
async function ciVerdict(branch) {
  const v = branchVerdict(branch, await listRuns({ branch, limit: 5 }));
  if (!v.done || v.ok) return v;
  const why = (await failedJobs(v.run.id)).map((j) => `    ✗ ${j.name}: ${j.failedSteps.join(' | ') || j.conclusion}`);
  return { ...v, line: v.line + '\n' + why.join('\n') };
}

async function liveVersion() {
  try { return ((await (await fetch('https://hearthrise.net/src/build-info.js?n=' + Date.now())).text()).match(/version:\s*'([^']+)'/) || [])[1] || '?'; }
  catch (e) { return 'unreachable'; }
}

async function edgeVerdict() {
  let want = '';
  try { want = execFileSync('node', ['tools/pack-edge.mjs', 'hr-accrue', '--hash'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/[0-9a-f]{64}/)?.[0] || ''; } catch (e) { /* no hash */ }
  const key = (readFileSync('src/net/supabase-bootstrap.js', 'utf8').match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0] || '';
  let live = '';
  try { live = (await (await fetch(EDGE, { headers: { Authorization: 'Bearer ' + key, apikey: key } })).json()).payload_sha256 || ''; } catch (e) { /* unreachable */ }
  if (!want || !live) return `engine: could not compare (build ${want.slice(0, 8) || '?'}, live ${live.slice(0, 8) || '?'})`;
  return want === live ? `engine: live matches this checkout (${live.slice(0, 8)})` : `engine: MISMATCH, live ${live.slice(0, 8)} vs this checkout ${want.slice(0, 8)} (deploy needed?)`;
}

for (;;) {
  const [rel, main, live, edge] = await Promise.all([ciVerdict(`release/v${ver}`), ciVerdict('main'), liveVersion(), edgeVerdict()]);
  const pages = live === ver ? `pages: serving v${live}` : `pages: serving v${live}, not v${ver} yet`;
  console.log(`\nv${ver} at ${new Date().toLocaleTimeString()}\n  ${rel.line}\n  ${main.line}\n  ${pages}\n  ${edge}`);
  if (!wait || (rel.done && live === ver)) {
    console.log(rel.ok && live === ver ? 'VERDICT: shipped and green' : rel.done && !rel.ok ? 'VERDICT: red, see above' : 'VERDICT: not finished');
    break;
  }
  await new Promise((r) => setTimeout(r, 60000));
}
