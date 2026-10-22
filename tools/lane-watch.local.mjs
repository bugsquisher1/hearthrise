// tools/lane-watch.local.mjs — a token-free summary of the lane branches, for Tyler's PC.
//
//   node tools/lane-watch.local.mjs              one summary
//   node tools/lane-watch.local.mjs --every 10   refresh every 10 minutes (Ctrl+C stops)
//   node tools/lane-watch.local.mjs --all        lanes active in the last 24 h (default: 3 h)
//   node tools/lane-watch.local.mjs lane/a-x …   only these branches
//
// Reads only: `git fetch` of the lane branches, the smoke runs via the signed-in `gh` CLI (one
// call per refresh; tools/lib/gh-runs.mjs — the token-free public API is only a fallback, it
// allows 60 calls/hour and answered 403 here), and the live BUILD version. Writes nothing.
// Local tool, not in CI.
import { execFileSync } from 'node:child_process';
import { listRuns, latestByBranch } from './lib/gh-runs.mjs';

const LIVE = 'https://hearthrise.net/src/build-info.js';
const QUIET_MIN = 45;

const args = process.argv.slice(2);
const everyAt = args.indexOf('--every');
const everyMin = everyAt >= 0 ? Math.max(1, Number(args[everyAt + 1]) || 10) : 0;
const named = args.filter((a, i) => a.startsWith('lane/') && i !== everyAt + 1);

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const ago = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
const pad = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n));

/* Lanes: the named ones, else every origin lane/* branch with a commit in the last 24 h that main lacks. */
function lanes() {
  if (named.length) return named;
  const out = git('for-each-ref', '--format=%(refname:short) %(committerdate:unix)', 'refs/remotes/origin/lane/');
  const day = Date.now() / 1000 - (args.includes('--all') ? 86400 : 3 * 3600);
  return out.split('\n').filter(Boolean).map((l) => l.split(' ')).filter(([, t]) => Number(t) > day)
    .map(([r]) => r.replace(/^origin\//, ''))
    .filter((b) => Number(git('rev-list', '--count', `origin/main..origin/${b}`)) > 0);
}

/* What the lane says about itself: its newest commit subjects. */
function verdict(subjects, ageMs) {
  const s = subjects.join(' \n ').toLowerCase();
  if (/lane-done[^\n]*(green|exit 0)|\bready\b/.test(s)) return 'DONE?';
  if (ageMs > QUIET_MIN * 60000) return 'quiet';
  if (/^wip|\bwip\b/.test(subjects[0].toLowerCase())) return 'working (wip)';
  return 'working';
}

async function runsByBranch() {
  return latestByBranch(await listRuns({ limit: 60 }));
}

async function liveVersion() {
  try { const t = await (await fetch(LIVE + '?n=' + Date.now())).text(); return (t.match(/version:\s*'([^']+)'/) || [])[1] || '?'; } catch (e) { return 'unreachable'; }
}

let last = new Map();
async function once() {
  const list = lanes();
  try { git('fetch', '-q', 'origin', 'main', ...list); } catch (e) { /* offline: show what we have */ }
  const [runs, live] = await Promise.all([runsByBranch(), liveVersion()]);
  const now = Date.now();
  const rows = list.map((b) => {
    const ref = 'origin/' + b;
    const [sha, unix] = git('log', '-1', '--format=%h %ct', ref).split(' ');
    const subjects = git('log', '-5', '--format=%s', `origin/main..${ref}`).split('\n');
    const ageMs = now - Number(unix) * 1000;
    const changed = last.has(b) && last.get(b) !== sha;
    last.set(b, sha);
    return { b, sha, age: ago(ageMs), ahead: git('rev-list', '--count', `origin/main..${ref}`), state: verdict(subjects, ageMs),
      ci: runs.map ? runs.map.get(b) || '-' : '-', subject: subjects[0], changed };
  });
  const stamp = new Date().toLocaleTimeString();
  console.log(`\nLanes at ${stamp} · live v${live} · main ${git('log', '-1', '--format=%h %cr', 'origin/main')}${runs.err ? ' · ' + runs.err : ''}`);
  console.log(pad('lane', 30) + pad('last', 7) + pad('ahead', 6) + pad('state', 15) + pad('CI', 10) + 'newest commit');
  for (const r of rows) console.log(pad(r.b.replace(/^lane\//, ''), 30) + pad(r.age, 7) + pad(r.ahead, 6) + pad(r.state, 15) + pad(r.ci, 10) + (r.changed ? '* ' : '') + pad(r.subject, 70));
  if (!rows.length) console.log('(no lane branch moved in that window; try --all)');
  if (rows.some((r) => r.changed)) process.stdout.write('\x07');   // a beep when any lane pushed since the last refresh
}

await once();
if (everyMin) setInterval(() => once().catch((e) => console.log('refresh failed:', e.message)), everyMin * 60000);
