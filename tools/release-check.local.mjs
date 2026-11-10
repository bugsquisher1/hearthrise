// tools/release-check.local.mjs — one verdict for a release: GitHub run, Pages, live engine.
//
//   node tools/release-check.local.mjs 0.2.21          check once
//   node tools/release-check.local.mjs 0.2.21 --wait   poll every 60 s until the release run finishes, and on through a Pages deploy in flight
//   node tools/release-check.local.mjs --selftest      the Pages line, on planted run lists and five planted mutants
//   node tools/release-check.local.mjs 0.2.21 --env staging   the REHEARSAL (lane/a-staging): the release run, the staging site's
//                                                      version and deploy, the staging engine (default: production; tools/lib/env.mjs)
//
// Reads only GitHub's public Actions API (no token), the site's BUILD file, and the hr-accrue GET's
// payload_sha256 compared with `node tools/pack-edge.mjs hr-accrue --hash` of this checkout.
// The first line printed is the project. Prints only what is not green. Local tool, not in CI (its --selftest is: smoke.yml;
// its --env half: tests/tool-env.mjs).
//
// THE PAGES LINE (2026-11-10: v0.2.114's deploy timed out four times and this tool said only "not v0.2.114 yet").
// The site is deployed by .github/workflows/pages.yml (the artifact tools/build-site.mjs builds) or, while Pages still
// builds from the branch, by GitHub's own "pages build and deployment" run. Whichever ran for main's newest commit:
//   pages: serving vX        the site states the version asked about
//   pages: deploying <sha>   a deploy is queued or running
//   pages: RED …             the newest deploy failed, was cancelled or timed out: the site still serves the old version
// mutant-anchors: none — the proof plants into copies of this file's own verdict function, never a tree file
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isMain } from '../tests/_is-main.mjs';
import { resolveEnv, clientKeyOf, runTool } from './lib/env.mjs';

const REPO = 'bugsquisher1/hearthrise';
/* The staging site is a second Pages site: its own repo, served from its `site` branch (tools/deploy-staging-site.local.mjs). */
const STAGING_REPO = 'bugsquisher1/hearthrise-staging';
const STAGING_BRANCH = 'site';
/* What can deploy the site, by workflow path: ours, and GitHub's own run for a branch-sourced site. */
const PAGES_RUNS = ['.github/workflows/pages.yml', 'dynamic/pages/pages-build-deployment'];
const FINE = ['success', 'skipped', 'neutral'];
const ENDED = { failure: 'failed', timed_out: 'timed out', cancelled: 'was cancelled (a job past its time limit ends this way)' };

/**
 * The Pages line for `ver`, from main's workflow runs (newest first, as the API lists them) and the version the site states.
 * Pure. state: 'serving' | 'deploying' | 'failed' | 'idle'.
 */
export function pagesVerdict(runs, live, ver) {
  if (live === ver) return { state: 'serving', line: `pages: serving v${live}` };
  const mine = (runs || []).filter((r) => PAGES_RUNS.includes(r.path));
  if (!mine.length) return { state: 'idle', line: `pages: serving v${live}, not v${ver} yet` };
  const sha = mine[0].head_sha;
  const latest = PAGES_RUNS.map((p) => mine.find((r) => r.path === p && r.head_sha === sha)).filter(Boolean);
  const busy = latest.find((r) => r.status !== 'completed');
  if (busy) return { state: 'deploying', line: `pages: deploying ${sha.slice(0, 9)} (${busy.status}), still serving v${live}` };
  const bad = latest.find((r) => !FINE.includes(r.conclusion));
  if (bad) return { state: 'failed', line: `pages: RED, the deploy of ${sha.slice(0, 9)} ${ENDED[bad.conclusion] || bad.conclusion}; still serving v${live} ${bad.html_url}` };
  return { state: 'idle', line: `pages: serving v${live}, not v${ver} yet (the last deploy, ${sha.slice(0, 9)}, finished)` };
}

function selftest() {
  const run = (path, sha, status, conclusion = null) => ({ path, head_sha: sha.repeat(40).slice(0, 40), status, conclusion, html_url: 'https://example.test/run' });
  const [OURS, THEIRS] = PAGES_RUNS, SMOKE = '.github/workflows/smoke.yml';
  const cases = [
    ['the site states the version: serving, whatever the runs say', [run(OURS, 'a', 'completed', 'failure')], '1.2.3', 'serving', /^pages: serving v1\.2\.3$/],
    ['our deploy running', [run(OURS, 'a', 'in_progress')], '1.2.2', 'deploying', /deploying aaaaaaaaa \(in_progress\), still serving v1\.2\.2/],
    ['our deploy queued behind another', [run(OURS, 'a', 'queued')], '1.2.2', 'deploying', /queued/],
    ['our deploy failed', [run(OURS, 'a', 'completed', 'failure')], '1.2.2', 'failed', /^pages: RED, the deploy of aaaaaaaaa failed; still serving v1\.2\.2/],
    ['our deploy timed out', [run(OURS, 'a', 'completed', 'timed_out')], '1.2.2', 'failed', /RED.* timed out/],
    ['our deploy cancelled at its time limit', [run(OURS, 'a', 'completed', 'cancelled')], '1.2.2', 'failed', /RED.* was cancelled/],
    ['our deploy done, main not at this version yet', [run(OURS, 'a', 'completed', 'success')], '1.2.2', 'idle', /not v1\.2\.3 yet \(the last deploy, aaaaaaaaa, finished\)/],
    ['branch source: our run built and skipped, GitHub\'s is still deploying', [run(OURS, 'a', 'completed', 'success'), run(THEIRS, 'a', 'in_progress')], '1.2.2', 'deploying', /deploying/],
    ['branch source: GitHub\'s deploy failed beside our green build', [run(OURS, 'a', 'completed', 'success'), run(THEIRS, 'a', 'completed', 'failure')], '1.2.2', 'failed', /RED/],
    ['branch source: a retry went green after a failed try of the same commit', [run(THEIRS, 'a', 'completed', 'success'), run(THEIRS, 'a', 'completed', 'failure')], '1.2.2', 'idle', /finished/],
    ['an older commit\'s red under a newer commit\'s green', [run(OURS, 'b', 'completed', 'success'), run(OURS, 'a', 'completed', 'failure')], '1.2.2', 'idle', /bbbbbbbbb, finished/],
    ['after the switch: GitHub\'s last branch deploy, red, lies under our newer green one', [run(OURS, 'b', 'completed', 'success'), run(THEIRS, 'a', 'completed', 'failure')], '1.2.2', 'idle', /bbbbbbbbb, finished/],
    ['no deploy run listed (a rate-limited API answers nothing)', [], '1.2.2', 'idle', /^pages: serving v1\.2\.2, not v1\.2\.3 yet$/],
    ['a red smoke run on main is not a red deploy', [run(SMOKE, 'b', 'completed', 'failure'), run(OURS, 'a', 'completed', 'success')], '1.2.2', 'idle', /aaaaaaaaa, finished/],
  ];
  const wrong = (verdict) => cases.filter(([, runs, live, state, line]) => { const got = verdict(runs, live, '1.2.3'); return got.state !== state || !line.test(got.line); }).map(([name]) => name);
  const source = pagesVerdict.toString();
  const planted = (from, to) => {
    if (!source.includes(from)) throw new Error('nothing to plant into: ' + from);
    return new Function('PAGES_RUNS', 'FINE', 'ENDED', 'return ' + source.replace(from, to))(PAGES_RUNS, FINE, ENDED);
  };
  const mutants = [
    ['a failed deploy reads as finished', '!FINE.includes(r.conclusion)', 'false'],
    ['a cancelled deploy counts as fine', '!FINE.includes(r.conclusion)', "!FINE.concat('cancelled').includes(r.conclusion)"],
    ['only our workflow is read, never GitHub\'s own deploy', 'PAGES_RUNS.includes(r.path)', 'r.path === PAGES_RUNS[0]'],
    ['every workflow on main is read as a deploy', 'PAGES_RUNS.includes(r.path)', 'true'],
    ['any commit\'s run counts, not the newest commit\'s', '&& r.head_sha === sha', ''],
    ['a queued deploy is not a deploy in flight', "r.status !== 'completed'", "r.status === 'in_progress'"],
    ['the version is not asked first', 'live === ver', 'false'],
  ];
  let bad = 0;
  const clean = wrong(pagesVerdict);
  console.log((clean.length ? '✗' : '✓') + ' the Pages line on ' + cases.length + ' run lists' + (clean.length ? ': wrong on ' + clean.join(' | ') : ''));
  if (clean.length) bad++;
  for (const [name, from, to] of mutants) {
    const caught = wrong(planted(from, to));
    console.log((caught.length ? '✓' : '✗') + ' mutant: ' + name + (caught.length ? ' → caught by "' + caught[0] + '"' : ' → SURVIVED'));
    if (!caught.length) bad++;
  }
  if (bad) { console.error('✗ release-check --selftest: ' + bad + ' wrong'); return 1; }
  console.log('✓ release-check --selftest: ' + cases.length + ' run lists read right, all ' + mutants.length + ' mutants caught');
  return 0;
}

/* `net`: the fetch this run uses (tests/tool-env.mjs hands a fake one); `repo`: whose runs. */
let net = (...a) => fetch(...a);
const gh = async (p, repo = REPO) => (await net(`https://api.github.com/repos/${repo}${p}`, { headers: { 'User-Agent': 'release-check' } })).json();
const runsOf = async (branch, n, repo = REPO) => (await gh(`/actions/runs?branch=${encodeURIComponent(branch)}&per_page=${n}`, repo)).workflow_runs || [];

async function ciVerdict(branch, runs) {
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

async function liveVersion(site) {
  try { return ((await (await net(site + '/src/build-info.js?n=' + Date.now())).text()).match(/version:\s*'([^']+)'/) || [])[1] || '?'; }
  catch (e) { return 'unreachable'; }
}

/** `env`: the project asked about (tools/lib/env.mjs). { ok, line }. */
async function edgeVerdict(env, deps) {
  let want = '';
  try { want = deps.packHash ? deps.packHash() : execFileSync('node', ['tools/pack-edge.mjs', 'hr-accrue', '--hash'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/[0-9a-f]{64}/)?.[0] || ''; } catch (e) { /* no hash */ }
  /* the key the gateway wants for this project: the one the client ships for it, else the one envs.json names */
  const key = clientKeyOf((deps.read || ((p) => readFileSync(p, 'utf8')))('src/net/supabase-bootstrap.js'), env.name) || env.publishableKey;
  let live = '';
  try { live = (await (await net(env.fn('hr-accrue'), { headers: { Authorization: 'Bearer ' + key, apikey: key } })).json()).payload_sha256 || ''; } catch (e) { /* unreachable */ }
  if (!want || !live) return { ok: false, line: `engine: could not compare (build ${want.slice(0, 8) || '?'}, ${env.name} ${live.slice(0, 8) || '?'})` };
  return want === live ? { ok: true, line: `engine: ${env.name} matches this checkout (${live.slice(0, 8)})` }
    : { ok: false, line: `engine: MISMATCH, ${env.name} ${live.slice(0, 8)} vs this checkout ${want.slice(0, 8)} (deploy needed?)` };
}

/**
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, home, log, err, packHash, sleep }: injectable (tests/tool-env.mjs)
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  if (argv.includes('--selftest')) return selftest();
  const log = deps.log || console.log;
  if (deps.fetch) net = deps.fetch;
  const env = resolveEnv({ argv, write: false, home: deps.home, read: deps.read });
  const staging = env.name === 'staging';
  const ver = String(env.rest.find((a) => !String(a).startsWith('--')) || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(ver)) { (deps.err || console.error)('usage: node tools/release-check.local.mjs X.Y.Z [--wait] [--env staging|production] | --selftest'); return 2; }
  const wait = argv.includes('--wait');
  for (;;) {
    /* main's list is read once and serves both lines: the smoke run and the deploy (60 unauthenticated API calls an hour).
       The staging site has no `main` of ours: its deploys are its own repo's, on its `site` branch. */
    const [relRuns, siteRuns, live, edge] = await Promise.all([runsOf(`release/v${ver}`, 5), staging ? runsOf(STAGING_BRANCH, 20, STAGING_REPO) : runsOf('main', 20), liveVersion(env.site), edgeVerdict(env, deps)]);
    const [rel, main] = await Promise.all([ciVerdict(`release/v${ver}`, relRuns), staging ? null : ciVerdict('main', siteRuns)]);
    const pages = pagesVerdict(siteRuns, live, ver);
    log(`${env.banner}\nv${ver} at ${new Date().toLocaleTimeString()}\n  ${rel.line}${main ? '\n  ' + main.line : ''}\n  ${staging ? pages.line.replace(/^pages:/, 'staging site:') : pages.line}\n  ${edge.line}`);
    if (staging) {
      /* The rehearsal's verdict is about staging alone: its site and its engine both carry this release. The GitHub run judges beside it. */
      const carries = pages.state === 'serving' && edge.ok;
      if (!wait || carries || pages.state !== 'deploying') {
        log(carries ? 'VERDICT: staging carries this release. Play it.' : 'VERDICT: staging does not carry this release yet, see above');
        return carries ? 0 : 1;
      }
    /* --wait stops as soon as the release run finishes: a red never reaches Pages, and waiting on Pages then hung silent for 10 h (10-29).
       It goes on only through a deploy GitHub lists as queued or running, which GitHub's own time limits end. */
    } else if (!wait || (rel.done && !(rel.ok && pages.state === 'deploying'))) {
      const red = (rel.done && !rel.ok) || pages.state === 'failed';
      log(rel.ok && pages.state === 'serving' ? 'VERDICT: shipped and green' : red ? 'VERDICT: red, see above' : 'VERDICT: not finished');
      return red ? 1 : 0;
    }
    await (deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(60000);
  }
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
