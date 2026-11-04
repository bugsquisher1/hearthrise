#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/site-files-immutable.mjs — A FILE MAIN HAS SERVED AT A VERSION NEVER CHANGES AT THAT VERSION.
//
//   node tests/site-files-immutable.mjs             on a push of release/** or main: judge it against what main serves
//   node tests/site-files-immutable.mjs --selftest  every planted case gets its verdict, in a scratch git repo
//
// mutant-anchors: none — the proof plants commits into a scratch repo, never a tree file
//
// sw.js keeps every `?v=` file until the next release, so a `?v=` is a promise for good, not for ten minutes: a file changed at a version
// main already serves would never reach a player who holds the old one. 188 pushes of main to 2026-11-04 had 12 pairs at one version and
// none changed a site file: this keeps it that way.
//   release/**  (the gate before main moves)  against origin/main, the version players hold
//   main        (a red to fix forward, by a bump)  against the push's own before
//   anything else: a lane or the staging branch has no version yet, so there is nothing to judge
// A new file breaks no promise; nor does a page's HTML (always from the network), nor anything Pages serves with no version.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEPT = ['src', 'assets', 'sw.js'];

const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.safecrlf=false', '-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const versionAt = (cwd, rev) => (/\bversion:\s*'(\d+\.\d+\.\d+)'/.exec(git(cwd, 'show', rev + ':src/build-info.js')) || [])[1] || null;

/** What a push broke against `base`: the site files changed in place at an unchanged version. */
function brokenPromises(cwd, base, head = 'HEAD') {
  const was = versionAt(cwd, base);
  const now = versionAt(cwd, head);
  if (!was || !now) throw new Error('src/build-info.js states no version at ' + (was ? head : base));
  if (was !== now) return { version: now, changed: [] };
  const rows = git(cwd, 'diff', '--no-renames', '--name-status', base, head, '--', ...KEPT);
  return { version: now, changed: rows.split('\n').filter((r) => /^[MT]\t/.test(r)).map((r) => r.split('\t')[1]) };
}

/** Which ref to judge this push against: a ref for `git fetch`, or null when there is nothing to judge. */
function baseOf(env) {
  const ref = env.GITHUB_REF_NAME || '';
  if (ref.startsWith('release/')) return 'main';
  if (ref === 'main' && /^[0-9a-f]{40}$/.test(env.GITHUB_EVENT_BEFORE || '') && !/^0+$/.test(env.GITHUB_EVENT_BEFORE)) return env.GITHUB_EVENT_BEFORE;
  return null;
}

function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'hr-immutable-'));
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const info = (v) => "export const BUILD = { version: '" + v + "' };\n";
  const commit = () => { git(dir, 'add', '-A'); git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x', '--allow-empty'); return git(dir, 'rev-parse', 'HEAD'); };
  let bad = 0;
  const say = (ok, what) => { console.log((ok ? '  ✓ ' : '  ✗ ') + what); if (!ok) bad++; };
  try {
    git(dir, 'init', '-q');
    put('src/build-info.js', info('1.0.0')); put('src/a.js', 'a'); put('assets/x.png', 'x'); put('sw.js', 'w'); put('docs/n.md', 'n'); put('play.html', 'p');
    const base = commit();
    const cases = [
      ['a file of src/ changed at the same version', () => put('src/a.js', 'a2'), ['src/a.js']],
      ['an asset changed at the same version', () => put('assets/x.png', 'x2'), ['assets/x.png']],
      ['the worker changed at the same version', () => put('sw.js', 'w2'), ['sw.js']],
      ['a new file at the same version is no broken promise', () => put('src/new.js', 'n'), []],
      ['docs and the page at the same version are no broken promise', () => { put('docs/n.md', 'n2'); put('play.html', 'p2'); }, []],
      ['the same change with a bump is a release', () => { put('src/a.js', 'a2'); put('src/build-info.js', info('1.0.1')); }, []],
    ];
    for (const [what, plant, want] of cases) {
      plant();
      const head = commit();
      const got = brokenPromises(dir, base, head).changed;
      say(got.join() === want.join(), what + (got.join() === want.join() ? '' : ': got ' + JSON.stringify(got)));
      git(dir, 'reset', '-q', '--hard', base);
    }
    const before = 'a'.repeat(40);
    say(baseOf({ GITHUB_REF_NAME: 'release/v1.0.1' }) === 'main', 'a release branch is judged against main');
    say(baseOf({ GITHUB_REF_NAME: 'main', GITHUB_EVENT_BEFORE: before }) === before, 'a push of main is judged against its own before');
    say(baseOf({ GITHUB_REF_NAME: 'main', GITHUB_EVENT_BEFORE: '0'.repeat(40) }) === null, 'a push with no before has nothing to judge');
    say(baseOf({ GITHUB_REF_NAME: 'next' }) === null && baseOf({}) === null, 'staging, a lane and a local run have nothing to judge');
    let threw = false;
    try { put('src/build-info.js', '// no version\n'); brokenPromises(dir, commit(), base); } catch (e) { threw = /states no version/.test(e.message); }
    say(threw, 'a build-info.js stating no version is loud, never a pass');
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); }
  console.log(bad ? 'site-files-immutable --selftest: ' + bad + ' RED' : 'site-files-immutable --selftest: every planted case judged');
  return bad ? 1 : 0;
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const ref = baseOf(process.env);
  if (!ref) { console.log('site-files-immutable: not a push of main or release/**, nothing to judge'); return 0; }
  git(ROOT, 'fetch', '-q', '--depth=1', 'origin', ref);
  const base = git(ROOT, 'rev-parse', 'FETCH_HEAD');
  const { version, changed } = brokenPromises(ROOT, base);
  if (changed.length) {
    for (const f of changed) console.log('  ✗ ' + f);
    console.log('site-files-immutable: ' + changed.length + ' site file(s) changed at v' + version + ', which main already serves. sw.js keeps a player\'s copy until the next version: bump (./bump-version.sh).');
    return 1;
  }
  console.log('site-files-immutable: no site file changed in place at v' + version + ' against ' + base.slice(0, 9));
  return 0;
}
process.exit(main());
