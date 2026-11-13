// tools/release-check.local.mjs — one verdict for a release: GitHub run, Pages, live engine.
//
//   node tools/release-check.local.mjs 0.2.21          check once
//   node tools/release-check.local.mjs 0.2.21 --wait   poll every 60 s until the release run finishes, and on through a Pages deploy in flight
//   node tools/release-check.local.mjs --selftest      the Pages line and the wait loop, on planted run lists, a stubbed GitHub and planted mutants
//
// Reads GitHub's Actions API through `gh api` (authenticated; gh on PATH or C:\Program Files\GitHub CLI\gh.exe),
// falling back to the public API (60 calls an hour, which the second-monitor board alone uses up), the release
// branch's head from `git ls-remote origin`, the live BUILD file, and the hr-accrue GET's payload_sha256
// compared with `node tools/pack-edge.mjs hr-accrue --hash` of this checkout. Local tool, not in CI (its --selftest is: smoke.yml).
//
// THE RELEASE RUN is the newest smoke run on release/vX.Y.Z whose head_sha is the branch's head on origin, whatever
// started it (push or workflow_dispatch): an older commit's run on the same branch is never judged.
//
// THE PUSH THAT STARTS NO RUN (2026-11-12: v0.2.124 and v0.2.125 waited hours on "no smoke run yet"). With --wait, once the
// branch is on origin and GitHub has listed no smoke run for its head for 5 minutes, it prints
//   no run started for <sha> after 5 min: GitHub dropped the push
// runs `gh workflow run smoke.yml --ref release/vX.Y.Z` itself (once per invocation; smoke.yml gates a release started
// by hand like its push) and waits on that run. If that cannot start or still lists nothing 5 minutes later, it stops.
// An API that does not answer (rate limit) is never read as "no run": nothing is started on uncertainty.
//
// THE EXIT CODE is the verdict; callers branch on $?:
//   0  shipped and green, or the release run is green (main not live yet)
//   1  red: the release run failed, or the newest Pages deploy did
//   3  not finished: the run is still going (check once), or --wait gave up on a run that never started
//   2  usage
//
// THE PAGES LINE (2026-11-10: v0.2.114's deploy timed out four times and this tool said only "not v0.2.114 yet").
// The site is deployed by .github/workflows/pages.yml (the artifact tools/build-site.mjs builds) or, while Pages still
// builds from the branch, by GitHub's own "pages build and deployment" run. Whichever ran for main's newest commit:
//   pages: serving vX        the site states the version asked about
//   pages: deploying <sha>   a deploy is queued or running
//   pages: RED …             the newest deploy failed, was cancelled or timed out: the site still serves the old version
// mutant-anchors: none — the proof plants into copies of this file's own verdict and wait functions, never a tree file
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { isMain } from '../tests/_is-main.mjs';

const REPO = 'bugsquisher1/hearthrise';
const EDGE = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue';
const SMOKE = '.github/workflows/smoke.yml';
const DISPATCH_AFTER_MS = 5 * 60000;
const POLL_MS = 60000;
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

/**
 * One branch's smoke line. runs: the API's list, newest first, or null when it did not answer. sha: a release branch's
 * head on origin ('' = not on origin, null = unreadable); undefined for main, whose newest run is read.
 * none: the branch is on origin and GitHub lists no smoke run for its head.
 */
async function ciVerdict(branch, runs, sha, jobsOf) {
  if (runs === null) return { done: false, line: `${branch}: GitHub's API did not answer (rate limit?), run unknown` };
  if (sha === null) return { done: false, line: `${branch}: could not read its head from origin (git ls-remote failed)` };
  if (sha === '') return { done: false, line: `${branch}: not on origin` };
  /* by workflow PATH: a run whose workflow file fails to load is named after the file, not 'smoke' (10-30: the watcher read the older run).
     Any event: a run started by hand (workflow_dispatch) on the branch's head is its run as much as a push run. */
  const w = (runs || []).find((r) => (r.path === SMOKE || r.name === 'smoke') && (sha === undefined || r.head_sha === sha));
  if (!w) return { done: false, none: true, line: `${branch}: no smoke run yet${sha ? ' for ' + sha.slice(0, 9) : ''}` };
  if (w.status !== 'completed') return { done: false, line: `${branch}: ${w.status} (${w.head_sha.slice(0, 9)})` };
  if (w.conclusion === 'success') return { done: true, ok: true, line: `${branch}: GREEN (${w.head_sha.slice(0, 9)})` };
  const all = await jobsOf(w.id);
  if (!all) return { done: true, ok: false, line: `${branch}: RED (${w.head_sha.slice(0, 9)}) ${w.html_url} (its jobs could not be read)` };
  const jobs = all.filter((j) => j.conclusion !== 'success');
  if (!jobs.length) return { done: true, ok: false, line: `${branch}: RED (${w.head_sha.slice(0, 9)}) with NO jobs: the workflow file failed to load ${w.html_url}` };
  const why = jobs.map((j) => `    ✗ ${j.name}: ${(j.steps || []).filter((s) => s.conclusion === 'failure').map((s) => s.name).join(' | ') || j.conclusion}`);
  return { done: true, ok: false, line: `${branch}: RED (${w.head_sha.slice(0, 9)}) ${w.html_url}\n` + why.join('\n') };
}

/**
 * The check, once or (wait) until the release run ends. io is GitHub, git, the site and the clock; --selftest stubs it.
 * Returns the exit code (header: THE EXIT CODE).
 */
export async function check(ver, wait, io) {
  const branch = `release/v${ver}`;
  let seen = '', since = 0, dispatched = false;
  for (;;) {
    const sha = await io.head(branch);
    /* main's list is read once and serves both lines: the smoke run and the deploy */
    const [relRuns, mainRuns, live, edge] = await Promise.all([io.runs(branch, 10), io.runs('main', 20), io.live(), io.edge()]);
    const [rel, main] = await Promise.all([ciVerdict(branch, relRuns, sha, io.jobs), ciVerdict('main', mainRuns, undefined, io.jobs)]);
    const pages = pagesVerdict(mainRuns || [], live, ver);
    io.log(`\nv${ver} at ${new Date(io.now()).toLocaleTimeString()}\n  ${rel.line}\n  ${main.line}\n  ${pages.line}\n  ${edge}`);
    /* THE PUSH THAT STARTS NO RUN: 5 min after this head was first seen with no run, start one by hand, once */
    let gaveUp = '';
    if (wait && rel.none) {
      if (sha !== seen) { seen = sha; since = io.now(); }
      if (io.now() - since >= DISPATCH_AFTER_MS) {
        if (dispatched) gaveUp = `no run started for ${sha.slice(0, 9)} 5 min after starting it by hand either`;
        else {
          dispatched = true;
          io.log(`no run started for ${sha.slice(0, 9)} after 5 min: GitHub dropped the push`);
          const sent = await io.dispatch(branch);
          if (sent.ok) { io.log(`started it: gh workflow run smoke.yml --ref ${branch}; waiting on that run`); since = io.now(); }
          else gaveUp = `could not start it (${sent.why})`;
        }
      }
    }
    /* --wait stops as soon as the release run finishes: a red never reaches Pages, and waiting on Pages then hung silent for 10 h (10-29).
       It goes on only through a deploy GitHub lists as queued or running, which GitHub's own time limits end. */
    if (!wait || gaveUp || (rel.done && !(rel.ok && pages.state === 'deploying'))) {
      if (gaveUp) io.log(gaveUp);
      const red = (rel.done && !rel.ok) || pages.state === 'failed';
      io.log(rel.ok && pages.state === 'serving' ? 'VERDICT: shipped and green' : red ? 'VERDICT: red, see above' : rel.ok ? 'VERDICT: release green, not live yet' : 'VERDICT: not finished');
      return red ? 1 : rel.ok ? 0 : 3;
    }
    await io.sleep(POLL_MS);
  }
}

/* THE WAIT LOOP on a stubbed GitHub: a stub clock, the release branch's run list per moment, a recorded dispatch. */
const HEAD = 'c'.repeat(40), OLD = 'b'.repeat(40);
const smokeRun = (sha, event, status, conclusion = null) => ({ id: 7, path: SMOKE, name: 'smoke', head_sha: sha, event, status, conclusion, html_url: 'https://example.test/run' });
/* [name, wait, the version the site states, the list at (t, the time a run was started by hand or null), the dispatch works, expected] */
const WAITS = [
  ['the push starts no run, an older commit\'s red run sits on the branch: started by hand at 5 min, its red judged', true, '1.2.2',
    (t, sent) => sent === null ? [smokeRun(OLD, 'push', 'completed', 'failure')]
      : t - sent < 120000 ? [smokeRun(HEAD, 'workflow_dispatch', 'in_progress'), smokeRun(OLD, 'push', 'completed', 'failure')]
      : [smokeRun(HEAD, 'workflow_dispatch', 'completed', 'failure'), smokeRun(OLD, 'push', 'completed', 'failure')],
    true, { code: 1, sends: 1, text: [/no run started for ccccccccc after 5 min: GitHub dropped the push/, /started it: gh workflow run smoke\.yml --ref release\/v1\.2\.3/, /VERDICT: red/] }],
  ['the run started by hand goes green and the site states the version', true, '1.2.3',
    (t, sent) => sent === null ? [] : [smokeRun(HEAD, 'workflow_dispatch', 'completed', 'success')], true, { code: 0, sends: 1, text: [/VERDICT: shipped and green/] }],
  ['the push run shows 3 min late: nothing started, green release exits 0 before main is live', true, '1.2.2',
    (t) => t < 180000 ? [] : t < 300000 ? [smokeRun(HEAD, 'push', 'in_progress')] : [smokeRun(HEAD, 'push', 'completed', 'success')], true, { code: 0, sends: 0, text: [/VERDICT: release green, not live yet/] }],
  ['a red push run on the head', true, '1.2.2', () => [smokeRun(HEAD, 'push', 'completed', 'failure')], true, { code: 1, sends: 0, text: [/a job: a step/] }],
  ['check once while the run is going: not finished', false, '1.2.2', () => [smokeRun(HEAD, 'push', 'in_progress')], true, { code: 3, sends: 0, text: [/VERDICT: not finished/] }],
  ['check once, no run yet: not finished, nothing started', false, '1.2.2', () => [], true, { code: 3, sends: 0 }],
  ['the run started by hand never shows either: gives up, not finished', true, '1.2.2', () => [], true, { code: 3, sends: 1, text: [/5 min after starting it by hand either/, /VERDICT: not finished/] }],
  ['gh cannot start it: stops at once, not finished', true, '1.2.2', () => [], false, { code: 3, sends: 1, text: [/could not start it \(gh not found\)/] }],
  ['the API does not answer for 10 min: nothing started on uncertainty', true, '1.2.3',
    (t) => t < 600000 ? null : [smokeRun(HEAD, 'push', 'completed', 'success')], true, { code: 0, sends: 0, text: [/API did not answer/] }],
];

async function play(checkFn, [, wait, live, list, works]) {
  let t = 0, sent = null;
  const sends = [], out = [];
  const io = {
    head: async () => HEAD,
    runs: async (branch) => (branch === 'main' ? [] : list(t, sent)),
    jobs: async () => [{ name: 'a job', conclusion: 'failure', steps: [{ name: 'a step', conclusion: 'failure' }] }],
    dispatch: async (branch) => { sends.push({ branch, t }); if (!works) return { ok: false, why: 'gh not found' }; sent = t; return { ok: true }; },
    live: async () => live, edge: async () => 'engine: stub', now: () => t, log: (s) => out.push(s),
    sleep: async (ms) => { t += ms; if (t > 4 * 3600000) throw new Error('--wait never ended'); },
  };
  try { return { code: await checkFn('1.2.3', wait, io), sends, text: out.join('\n') }; }
  catch (e) { return { code: 'threw ' + e.message, sends, text: out.join('\n') }; }
}

async function wrongWaits(checkFn) {
  const bad = [];
  for (const sc of WAITS) {
    const got = await play(checkFn, sc), want = sc[5];
    const off = got.code !== want.code || got.sends.length !== want.sends
      || got.sends.some((s) => s.branch !== 'release/v1.2.3' || s.t < DISPATCH_AFTER_MS)
      || (want.text || []).some((re) => !re.test(got.text));
    if (off) bad.push(sc[0]);
  }
  return bad;
}

async function selftest() {
  const run = (path, sha, status, conclusion = null) => ({ path, head_sha: sha.repeat(40).slice(0, 40), status, conclusion, html_url: 'https://example.test/run' });
  const [OURS, THEIRS] = PAGES_RUNS;
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
  /* the wait loop's mutants plant into one copy of ciVerdict + check; each anchor must occur exactly once */
  const loopSource = ciVerdict.toString() + '\n' + check.toString();
  const plantedLoop = (from, to) => {
    if (loopSource.split(from).length !== 2) throw new Error('no single place to plant into: ' + from);
    return new Function('SMOKE', 'DISPATCH_AFTER_MS', 'POLL_MS', 'pagesVerdict', loopSource.replace(from, to) + '\nreturn check;')(SMOKE, DISPATCH_AFTER_MS, POLL_MS, pagesVerdict);
  };
  const loopMutants = [
    ['a push that starts no run is never started by hand', 'await io.dispatch(branch)', '({ ok: true })'],
    ['a red verdict exits 0', 'return red ? 1 :', 'return red ? 0 :'],
    ['not finished exits 0', 'rel.ok ? 0 : 3', 'rel.ok ? 0 : 0'],
    ['any run on the branch is judged, not its head\'s', 'r.head_sha === sha', 'true'],
    ['a run started by hand is not judged', "(r.path === SMOKE || r.name === 'smoke')", "(r.path === SMOKE || r.name === 'smoke') && r.event === 'push'"],
    ['started at once, not after 5 min', '>= DISPATCH_AFTER_MS', '>= 0'],
    ['started again and again', 'if (dispatched)', 'if (false)'],
    ['an API that does not answer reads as no run', 'runs === null', 'false'],
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
  const cleanWait = await wrongWaits(check);
  console.log((cleanWait.length ? '✗' : '✓') + ' the wait loop on ' + WAITS.length + ' stubbed GitHubs' + (cleanWait.length ? ': wrong on ' + cleanWait.join(' | ') : ''));
  if (cleanWait.length) bad++;
  for (const [name, from, to] of loopMutants) {
    const caught = await wrongWaits(plantedLoop(from, to));
    console.log((caught.length ? '✓' : '✗') + ' mutant: ' + name + (caught.length ? ' → caught by "' + caught[0] + '"' : ' → SURVIVED'));
    if (!caught.length) bad++;
  }
  if (bad) { console.error('✗ release-check --selftest: ' + bad + ' wrong'); return 1; }
  console.log('✓ release-check --selftest: ' + cases.length + ' run lists and ' + WAITS.length + ' waits read right, all ' + (mutants.length + loopMutants.length) + ' mutants caught');
  return 0;
}

/* gh: on PATH, else where its Windows installer puts it; '' when neither answers. Looked up once, on first use. */
let ghBin;
function gh() {
  if (ghBin === undefined) {
    ghBin = '';
    for (const bin of ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe']) {
      try { execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 15000, windowsHide: true }); ghBin = bin; break; } catch (e) { /* the next place */ }
    }
  }
  return ghBin;
}

const exec = promisify(execFile);

/* GET one Actions API path: through gh (authenticated), else the public API. The parsed answer, or null. */
async function api(p) {
  if (gh()) {
    try { return JSON.parse((await exec(gh(), ['api', `repos/${REPO}${p}`], { maxBuffer: 32 << 20, windowsHide: true })).stdout); } catch (e) { /* not signed in or offline: the public API */ }
  }
  try { return await (await fetch(`https://api.github.com/repos/${REPO}${p}`, { headers: { 'User-Agent': 'release-check' } })).json(); } catch (e) { return null; }
}

const realIo = {
  /* the branch's head on origin: a sha, '' when the branch is not there, null when git could not say */
  head: async (branch) => {
    try { return ((await exec('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { windowsHide: true })).stdout.match(/^[0-9a-f]{40}/) || [''])[0]; } catch (e) { return null; }
  },
  runs: async (branch, n) => (await api(`/actions/runs?branch=${encodeURIComponent(branch)}&per_page=${n}`))?.workflow_runs || null,
  jobs: async (id) => (await api(`/actions/runs/${id}/jobs?per_page=50`))?.jobs || null,
  dispatch: async (branch) => {
    if (!gh()) return { ok: false, why: 'gh not found' };
    try { await exec(gh(), ['workflow', 'run', 'smoke.yml', '--ref', branch, '-R', REPO], { windowsHide: true }); return { ok: true }; }
    catch (e) { return { ok: false, why: String(e.stderr || e.message).trim().split('\n')[0] }; }
  },
  live: () => liveVersion(),
  edge: () => edgeVerdict(),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (s) => console.log(s),
};

async function liveVersion() {
  try { return ((await (await fetch('https://hearthrise.net/src/build-info.js?n=' + Date.now())).text()).match(/version:\s*'([^']+)'/) || [])[1] || '?'; }
  catch (e) { return 'unreachable'; }
}

async function edgeVerdict() {
  let want = '';
  try { want = execFileSync('node', ['tools/pack-edge.mjs', 'hr-accrue', '--hash'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/[0-9a-f]{64}/)?.[0] || ''; } catch (e) { /* no hash */ }
  const key = (readFileSync('src/net/supabase-bootstrap.js', 'utf8').match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0] || '';
  let live = '';
  try { live = (await (await fetch(EDGE, { headers: { Authorization: 'Bearer ' + key, apikey: key } })).json()).payload_sha256 || ''; } catch (e) { /* unreachable */ }
  if (!want || !live) return `engine: could not compare (build ${want.slice(0, 8) || '?'}, live ${live.slice(0, 8) || '?'})`;
  return want === live ? `engine: live matches this checkout (${live.slice(0, 8)})` : `engine: MISMATCH, live ${live.slice(0, 8)} vs this checkout ${want.slice(0, 8)} (deploy needed?)`;
}

async function main() {
  if (process.argv.includes('--selftest')) process.exit(await selftest());
  const ver = (process.argv[2] || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(ver)) { console.error('usage: node tools/release-check.local.mjs X.Y.Z [--wait] | --selftest'); process.exit(2); }
  process.exitCode = await check(ver, process.argv.includes('--wait'), realIo);
}

if (isMain(import.meta.url)) await main();
