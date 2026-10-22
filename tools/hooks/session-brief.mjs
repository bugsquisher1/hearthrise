// tools/hooks/session-brief.mjs — SessionStart hook: where Hearthrise stands, in under 12 lines,
// so a new session starts from facts instead of exploring. Its stdout becomes session context.
//
// Lanes pushed in the last 3 h, main's last smoke run, the live version; on Tyler's PC (where
// ~/.supabase-token exists) also any open hunt the server is > 32 s behind on. Every network read
// has a short timeout and a failure prints "?" rather than blocking the session.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim(); } catch (e) { return ''; } };
const get = async (url, ms = 4000) => { try { const r = await fetch(url, { headers: { 'User-Agent': 'session-brief' }, signal: AbortSignal.timeout(ms) }); return r.ok ? r : null; } catch (e) { return null; } };
if (!existsSync('tests/breakpoint-guard.mjs')) process.exit(0);   // not a Hearthrise checkout

git('fetch', '-q', 'origin');
const now = Date.now() / 1000;
const lanes = git('for-each-ref', '--sort=-committerdate', '--format=%(refname:short)|%(committerdate:unix)|%(subject)', 'refs/remotes/origin/lane/')
  .split('\n').filter(Boolean).map((l) => l.split('|')).filter(([, t]) => now - Number(t) < 3 * 3600).slice(0, 8)
  .map(([r, t, s]) => `  ${r.replace('origin/lane/', '')} ${Math.round((now - Number(t)) / 60)}m: ${s.slice(0, 70)}`);

const [runs, build] = await Promise.all([
  get('https://api.github.com/repos/bugsquisher1/hearthrise/actions/runs?branch=main&per_page=5'),
  get('https://hearthrise.net/src/build-info.js?n=' + Date.now()),
]);
let ci = '?';
try { const w = ((await runs.json()).workflow_runs || []).find((x) => x.name === 'smoke'); if (w) ci = w.status === 'completed' ? (w.conclusion === 'success' ? 'GREEN' : 'RED ' + w.html_url) : w.status; } catch (e) { /* ? */ }
let live = '?';
try { live = ((await build.text()).match(/version:\s*'([^']+)'/) || [])[1] || '?'; } catch (e) { /* ? */ }

const out = [`Hearthrise now: live v${live} · main ${git('log', '-1', '--format=%h %cr', 'origin/main')} · main smoke ${ci}`];
out.push(lanes.length ? 'Lanes pushed in the last 3 h:\n' + lanes.join('\n') : 'No lane pushed in the last 3 h.');
if (existsSync(join(homedir(), '.supabase-token'))) {
  try {
    const t = execFileSync('node', ['tools/hunt-health.local.mjs'], { encoding: 'utf8', timeout: 12000, stdio: ['ignore', 'pipe', 'ignore'] });
    const freezing = t.split('\n').filter((l) => l.includes('FREEZING') || l.includes('STALLED'));
    out.push(freezing.length ? 'Hunts freezing now:\n' + freezing.map((l) => '  ' + l.trim().slice(0, 110)).join('\n') : 'Open hunts: none freezing.');
  } catch (e) { /* no line */ }
}
out.push('Tools first (CLAUDE.md §9): lane-watch, release-check, assemble-release, guards-for, pc-load, hunt-health, char-state, deploy-edge, notes-draft; `gh run view --log-failed`; Supabase query_logs.');
console.log(out.join('\n'));
