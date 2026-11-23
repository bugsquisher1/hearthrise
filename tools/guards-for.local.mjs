// tools/guards-for.local.mjs — which tests does THIS diff touch, and are they green? (CLAUDE.md §3.3:
// "run locally only the guards the diff touches"). Run in a lane worktree.
//
//   node tools/guards-for.local.mjs              list the tests for the lane's own diff (its base below) + uncommitted changes
//   node tools/guards-for.local.mjs --run        run them one at a time, print only reds (last lines) + a tally, then the
//                                                proofs a RELEASE runs for this diff (no browser), and name the ones it skipped
//   node tools/guards-for.local.mjs --run --proofs     every proof the diff touches, as before 2026-11-21 (the nightly's share too)
//   node tools/guards-for.local.mjs --run --pages      with the page guards' proofs (one Chrome, a minute a mutant)
//   node tools/guards-for.local.mjs --run --no-proofs  the plain tests only (a quick loop while editing)
//   node tools/guards-for.local.mjs --remote     run this PUSHED branch's plan on GitHub instead of this PC: the whole matrix's
//                                                plain guards + the proofs a release would run for the lane's own diff
//   node tools/guards-for.local.mjs --base X     diff against X (default: the nearest of origin/set/v*, next and main)
//   node tools/guards-for.local.mjs --selftest
//
// A test is picked when it changed itself, when its source names a changed file's basename, or when
// it imports a picked helper; migrations add the replay guards. The rule is tools/lib/guard-deps.mjs.
// Not a substitute for the GitHub run; a shortlist so a lane doesn't run all 240 files to check a 3-file fix.
//
// THE PROOFS (lane r-green-first, 2026-11-07): a lane whose change moved a mutant's anchor is the one that should find it, so
// --run ran every proof the diff touched (tools/mutant-gate.mjs's selection, through tools/preflight.local.mjs --proofs).
// LANES RUN LIGHT (Tyler 2026-11-21, after the 11-19 "nightly only" ruling): a release now proves only the guards whose own
// side moved (smoke.yml HR_RELEASE_PROOFS=nightly-only; the nightly sweep proves the rest), yet lanes kept running the rest
// here, eight at once on one PC (a 30-min browser --mutate, a 1,042 s schema-drift --mutate). So --run now proves exactly what
// a release proves of the lane's diff: preflight --proofs --as-release, which reads the switch from smoke.yml and filters the
// diff with mutant-gate.mjs's releaseScope (one rule, three callers), and names every touched proof it left to the nightly.
// --proofs is the old full run. --remote hands the same plan to GitHub: a workflow_dispatch rehearsal of the lane's own range
// (its base's merge base..HEAD), which the gate scopes by the same switch: never wider than a release.
// The proofs read COMMITTED files, as GitHub does: commit first.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, guardSources, touchedBy } from './lib/guard-deps.mjs';
import { isMain } from '../tests/_is-main.mjs';

/* The mapping is shared with tools/mutant-gate.mjs (CI's --mutate/--selftest gate): one rule, two callers. */
/* Never scheduled here, whatever the diff touches: run-ci-local is a way to reproduce a GitHub red, not a gate
   (CLAUDE.md §3.3), and on 2026-11-11 six lanes ran it at once because their diffs touched CI files. */
export const NEVER_SCHEDULED = Object.freeze(['tests/run-ci-local.mjs']);
export const pickTests = (entries) => new Map([...entries]
  .filter(([t]) => t.startsWith('tests/') && !basename(t).startsWith('_') && !NEVER_SCHEDULED.includes(t)));

/** preflight.local.mjs's argv for this run's proofs, or null for none. The default is --as-release; --proofs is the old run. Pure. */
export function proofArgs(argv, base) {
  if (argv.includes('--no-proofs')) return null;
  return ['--proofs', '--plant', '--base', base, ...(argv.includes('--proofs') ? [] : ['--as-release']), ...(argv.includes('--pages') ? ['--pages'] : [])];
}

/* A base a lane can be cut from: a set, next, or main, on origin. Never the lane's own pushed branch (its merge base is HEAD). */
export const BASE_REF = /^origin\/(set\/v[\w.-]+|next|main)$/;
/**
 * The lane's base: the candidate whose merge base with HEAD is nearest (fewest commits to HEAD); on a tie the earlier candidate wins
 * (upstream, then the newest sets, next, main). Pure.
 * A ref whose TIP is HEAD is the nearest base there is (0 commits): the lane has not committed yet, so its diff is the worktree's.
 * (Until 2026-11-23 "a ref that holds HEAD is no base" skipped it, so a lane fresh from the set fell past the set and next to main,
 * whose diff is the whole set: 2,359 files, 473 tests.) A ref that holds HEAD and moved on (it took the lane in) is read as it stood
 * before (laneBase, firstWithout); one that could not be is no base.
 * @param {{ ref: string, tip?: string, mergeBase: string|null, ahead: number }[]} cands
 */
export function nearestBase(cands, head) {
  let best = null;
  for (const c of cands) {
    if (!BASE_REF.test(c.ref) || !c.mergeBase || !Number.isFinite(c.ahead)) continue;
    if (c.mergeBase === head && c.tip !== head) continue;
    if (!best || c.ahead < best.ahead) best = c;
  }
  return best;
}

/**
 * The newest commit of a first-parent line (newest first) that does NOT hold HEAD, by `holds(sha)`, or null when every commit holds it.
 * Holding HEAD is true for a prefix of the line (a descendant of a commit that holds HEAD holds it too), so it bisects. Pure.
 */
export function firstWithout(chain, holds) {
  if (!chain.length || holds(chain[chain.length - 1])) return null;
  if (!holds(chain[0])) return chain[0];
  let lo = 0, hi = chain.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (holds(chain[mid])) lo = mid; else hi = mid; }
  return chain[hi];
}

/** Why --remote must not dispatch, or null. Pure. */
export function remoteRefusal({ branch, head, remoteSha, base }) {
  if (!branch || branch === 'HEAD') return 'HEAD is detached: check out the lane\'s branch first';
  if (/^(main|next)$|^release\/|^set\//.test(branch)) return `${branch} is not a lane branch: its runs are the Coordinator's (a push to release/** or next is gated already)`;
  if (!remoteSha) return `${branch} is not on origin: push it first (git push -u origin ${branch}); GitHub runs what origin holds`;
  if (remoteSha !== head) return `origin/${branch} is at ${remoteSha.slice(0, 9)} and HEAD at ${head.slice(0, 9)}: push first (git push origin ${branch}); GitHub runs what origin holds`;
  if (!/^[0-9a-f]{40}$/.test(base || '') || !/^[0-9a-f]{40}$/.test(head || '')) return 'no base commit: pass --base <origin/set/vX.Y.Z>';
  if (base === head) return 'the base already holds HEAD: there is nothing of the lane\'s to prove';
  return null;
}

/** gh's argv for the dispatch: a rehearsal of the lane's own range (tools/mutant-gate.mjs decideMode), never the full sweep. Pure. */
export const dispatchArgs = (branch, base, head) => ['workflow', 'run', 'smoke.yml', '--ref', branch, '-f', `rehearse_range=${base}..${head}`];

/** The run that dispatch started: a workflow_dispatch of smoke.yml on this head that was not listed before it. Pure. */
export function pickRun(runs, { head, before }) {
  return (runs || []).filter((r) => r.headSha === head && r.event === 'workflow_dispatch' && !before.has(String(r.databaseId)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
}

// ── the git and gh side ──────────────────────────────────────────────────────
const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1e8 });
  return r.status === 0 ? r.stdout.trim() : null;
};
const GH = process.env.HR_GH || (existsSync('C:/Program Files/GitHub CLI/gh.exe') ? 'C:/Program Files/GitHub CLI/gh.exe' : 'gh');
const gh = (args) => spawnSync(GH, args, { encoding: 'utf8', maxBuffer: 1e8 });

/* The candidates as git sees them; `at` is what the diff reads from (the ref, or the commit it stood at before it took the lane in). */
function laneBase(head) {
  const up = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) || '';
  /* only the version sets (a set named otherwise, origin/set/wave1, sorted first and took one of the six) */
  const sets = (git(['for-each-ref', '--sort=-version:refname', '--count=6', '--format=%(refname:short)', 'refs/remotes/origin/set/v*']) || '').split('\n').filter(Boolean);
  const refs = [...new Set([up, ...sets, 'origin/next', 'origin/main'].filter((r) => BASE_REF.test(r)))];
  const ahead = (mb) => (mb ? Number(git(['rev-list', '--count', `${mb}..HEAD`])) : NaN);
  const holds = (c) => spawnSync('git', ['merge-base', '--is-ancestor', head, c], { encoding: 'utf8' }).status === 0;
  const cands = refs.map((ref) => {
    const tip = git(['rev-parse', ref]);
    const mergeBase = git(['merge-base', ref, 'HEAD']);
    if (mergeBase !== head || tip === head) return { ref, tip, at: ref, mergeBase, ahead: ahead(mergeBase) };
    /* the ref took the lane in and moved on: read it as it stood before, so the lane's own commits are its diff */
    const chain = (git(['rev-list', '--first-parent', '--max-count=5000', ref]) || '').split('\n').filter(Boolean);
    const was = firstWithout(chain, holds);
    const mb = was ? git(['merge-base', was, 'HEAD']) : null;
    return was ? { ref, tip, at: was, mergeBase: mb, ahead: ahead(mb), before: true } : { ref, tip, at: ref, mergeBase, ahead: NaN };
  });
  return nearestBase(cands, head);
}

function remote(base) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['rev-parse', 'HEAD']);
  const ls = branch && branch !== 'HEAD' ? git(['ls-remote', 'origin', `refs/heads/${branch}`]) : null;
  const remoteSha = ls ? ls.split(/\s+/)[0] : null;
  const baseSha = git(['merge-base', base, 'HEAD']);
  const no = remoteRefusal({ branch, head, remoteSha, base: baseSha });
  if (no) { console.error(`guards-for --remote: REFUSED: ${no}`); return 2; }
  if ((git(['status', '--porcelain']) || '').trim()) console.log('guards-for --remote: uncommitted changes here are NOT in the run (GitHub runs the pushed commit)');
  const list = () => {
    const r = gh(['run', 'list', '--workflow', 'smoke.yml', '--branch', branch, '--event', 'workflow_dispatch', '--limit', '20', '--json', 'databaseId,headSha,event,createdAt,url,status']);
    if (r.status !== 0) throw new Error(`gh run list: ${(r.stderr || r.error?.message || '').trim().split('\n')[0]}`);
    return JSON.parse(r.stdout || '[]');
  };
  let before;
  try { before = new Set(list().map((r) => String(r.databaseId))); } catch (e) { console.error(`guards-for --remote: ${e.message} (gh: ${GH}; set HR_GH to its path)`); return 2; }
  const args = dispatchArgs(branch, baseSha, head);
  console.log(`guards-for --remote: ${branch} at ${head.slice(0, 9)}, base ${baseSha.slice(0, 9)} (merge base with ${base})\n  gh ${args.join(' ')}`);
  const d = gh(args);
  if (d.status !== 0) { console.error(`guards-for --remote: the dispatch failed: ${(d.stderr || d.stdout || '').trim()}`); return 2; }
  /* gh prints the run's URL on newer versions; otherwise the new run is found in the list (GitHub lists it within seconds) */
  const said = /https:\/\/\S+\/actions\/runs\/(\d+)/.exec(`${d.stdout}${d.stderr}`);
  let run = said ? { databaseId: said[1], url: said[0] } : null;
  for (let i = 0; !run && i < 18; i++) {
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
    try { run = pickRun(list(), { head, before }); } catch { /* listed on the next try */ }
  }
  if (!run) { console.error(`guards-for --remote: dispatched, but no run for ${head.slice(0, 9)} was listed after 90 s: "${GH}" run list --workflow smoke.yml --branch ${branch}`); return 3; }
  const id = run.databaseId;
  console.log(`guards-for --remote: run ${id}  ${run.url || ''}`.trimEnd());
  console.log('  the plain guards of every job + the proofs a release would run for this diff; mutant-gate logs "a rehearsal of <base>..<head>"');
  console.log(`  wait for it:  "${GH}" run watch ${id} --exit-status --compact --interval 60`);
  console.log(`  a red:        "${GH}" run view ${id} --log-failed`);
  return 0;
}

// ── --selftest ───────────────────────────────────────────────────────────────
function selftest() {
  const fails = [];
  const ok = (c, m) => { console.log(`  ${c ? 'ok      ' : 'FAILED  '} ${m}`); if (!c) fails.push(m); };
  const sha = (c) => c.repeat(40);
  const H = sha('f');
  const checks = (impl) => {
    const got = impl.pickTests([['tests/run-ci-local.mjs', 'ci'], ['tests/_helper.mjs', 'x'], ['tests/ci-shape.mjs', 'ci'], ['tools/x.mjs', 'y']]);
    const def = impl.proofArgs(['--run'], 'origin/set/v1');
    const all = impl.proofArgs(['--run', '--proofs', '--pages'], 'origin/set/v1');
    const cands = [{ ref: 'origin/lane/x', mergeBase: sha('e'), ahead: 0 }, { ref: 'origin/set/v0.2.144', mergeBase: sha('a'), ahead: 3 },
      { ref: 'origin/set/v0.2.143', mergeBase: sha('b'), ahead: 9 }, { ref: 'origin/next', mergeBase: sha('a'), ahead: 3 }, { ref: 'origin/main', mergeBase: sha('c'), ahead: 40 }];
    const refuse = (o) => impl.remoteRefusal({ branch: 'lane/c-x', head: H, remoteSha: H, base: sha('a'), ...o });
    const runs = [{ databaseId: 1, headSha: H, event: 'workflow_dispatch', createdAt: '2026-11-21T01:00:00Z' }, { databaseId: 2, headSha: sha('e'), event: 'workflow_dispatch', createdAt: '2026-11-21T01:05:00Z' },
      { databaseId: 3, headSha: H, event: 'workflow_dispatch', createdAt: '2026-11-21T01:04:00Z' }, { databaseId: 4, headSha: H, event: 'push', createdAt: '2026-11-21T01:06:00Z' }];
    const dis = impl.dispatchArgs('lane/c-x', sha('a'), H);
    return [
      [[...got.keys()].join(',') === 'tests/ci-shape.mjs', 'run-ci-local is never scheduled'],
      [def.includes('--as-release') && def.includes('--plant') && def[def.indexOf('--base') + 1] === 'origin/set/v1', '--run proves as a release does (--as-release), against the lane\'s base'],
      [!all.includes('--as-release') && all.includes('--pages') && all.includes('--proofs'), '--proofs is the old run: every touched proof (and --pages passes through)'],
      [impl.proofArgs(['--run', '--no-proofs'], 'b') === null, '--no-proofs runs no proof'],
      [impl.nearestBase(cands, H)?.ref === 'origin/set/v0.2.144', 'the base is the nearest set (a tie keeps the set before next; never the lane\'s own branch)'],
      /* 2026-11-23: a lane fresh from the set (no commit yet, HEAD is the set's tip, and next's) picked main, 1,753 commits back */
      [impl.nearestBase([{ ref: 'origin/set/v0.2.144', tip: H, mergeBase: H, ahead: 0 }, { ref: 'origin/next', tip: H, mergeBase: H, ahead: 0 },
        { ref: 'origin/main', tip: sha('c'), mergeBase: sha('c'), ahead: 1753 }], H)?.ref === 'origin/set/v0.2.144', 'a lane fresh from the set diffs against the set (its tip is HEAD: the nearest), never main'],
      [impl.nearestBase([{ ref: 'origin/set/v1', tip: sha('9'), mergeBase: H, ahead: 0 }, { ref: 'origin/main', tip: sha('c'), mergeBase: sha('c'), ahead: 5 }], H)?.ref === 'origin/main', 'a set that took HEAD in and moved on, unread, is no base'],
      [impl.nearestBase([{ ref: 'origin/set/v1', tip: sha('9'), at: sha('8'), mergeBase: sha('7'), ahead: 3, before: true }, { ref: 'origin/main', tip: sha('c'), mergeBase: sha('c'), ahead: 40 }], H)?.at === sha('8'),
        'a set that took the lane in is read as it stood before (nearer than main)'],
      [impl.firstWithout(['m4', 'm3', 'm2', 'm1', 'm0'], (c) => c === 'm4' || c === 'm3') === 'm2' && impl.firstWithout(['m1', 'm0'], () => true) === null
        && impl.firstWithout(['m1', 'm0'], () => false) === 'm1' && impl.firstWithout(['m9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2'], (c) => c > 'm3') === 'm3',
        'the commit before a ref took the lane in: the newest on its first-parent line that does not hold HEAD'],
      [impl.nearestBase([], H) === null, 'no candidate, no base'],
      [refuse({}) === null, '--remote dispatches a pushed lane branch'],
      [/not on origin/.test(refuse({ remoteSha: null }) || '') && /push first/.test(refuse({ remoteSha: sha('d') }) || ''), '--remote refuses a branch not pushed, or pushed behind HEAD'],
      [['main', 'next', 'release/v0.2.144', 'set/v0.2.144', 'HEAD'].every((b) => refuse({ branch: b })), '--remote refuses main, next, a release, a set and a detached HEAD'],
      [refuse({ base: H }) && refuse({ base: null }), '--remote refuses an empty or missing base'],
      [dis.join(' ') === `workflow run smoke.yml --ref lane/c-x -f rehearse_range=${sha('a')}..${H}`, 'the dispatch is a rehearsal of the lane\'s own range on its own ref (never the full sweep)'],
      [impl.pickRun(runs, { head: H, before: new Set(['1']) })?.databaseId === 3 && impl.pickRun(runs, { head: H, before: new Set(['1', '3']) }) === null,
        'the run found is the new dispatch of this head, never an older one or a push'],
    ];
  };
  const real = { pickTests, proofArgs, nearestBase, firstWithout, remoteRefusal, dispatchArgs, pickRun };
  for (const [c, m] of checks(real)) ok(c, m);
  for (const [label, impl] of [
    ['run-ci-local is scheduled', { ...real, pickTests: (e) => new Map([...e].filter(([t]) => t.startsWith('tests/') && !basename(t).startsWith('_'))) }],
    ['--run proves every touched proof again', { ...real, proofArgs: (a, b) => proofArgs([...a, '--proofs'], b) }],
    ['--proofs is ignored', { ...real, proofArgs: (a, b) => proofArgs(a.filter((x) => x !== '--proofs'), b) }],
    ['--no-proofs is ignored', { ...real, proofArgs: (a, b) => proofArgs(a.filter((x) => x !== '--no-proofs'), b) }],
    ['the base is always main', { ...real, nearestBase: (c, h) => nearestBase(c.filter((x) => x.ref === 'origin/main'), h) }],
    ['the lane\'s own branch can be its base', { ...real, nearestBase: (c, h) => c.filter((x) => x.mergeBase && x.mergeBase !== h).sort((a, b) => a.ahead - b.ahead)[0] || null }],
    ['a ref holding HEAD is a base', { ...real, nearestBase: (c, h) => nearestBase(c.map((x) => ({ ...x, mergeBase: x.mergeBase === h ? sha('9') : x.mergeBase })), h) }],
    ['a ref at HEAD is no base (the 11-23 bug: a fresh lane fell to main)', { ...real, nearestBase: (c, h) => nearestBase(c.filter((x) => x.mergeBase !== h), h) }],
    ['the line\'s tip is read as the commit before', { ...real, firstWithout: (chain) => chain[0] || null }],
    ['the line\'s oldest is read as the commit before', { ...real, firstWithout: (chain, holds) => (chain.length && !holds(chain[chain.length - 1]) ? chain[chain.length - 1] : null) }],
    ['an unpushed branch is dispatched', { ...real, remoteRefusal: (o) => remoteRefusal({ ...o, remoteSha: o.head }) }],
    ['a release branch is dispatched', { ...real, remoteRefusal: (o) => (/^release\//.test(o.branch) ? null : remoteRefusal(o)) }],
    ['the dispatch is the full sweep', { ...real, dispatchArgs: (b) => ['workflow', 'run', 'smoke.yml', '--ref', b] }],
    ['an older run is reported', { ...real, pickRun: (r, o) => pickRun(r, { ...o, before: new Set() }) }],
  ]) {
    const missed = checks(impl).every(([c]) => c);
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} mutant: ${label}`);
    if (missed) fails.push(`mutant missed: ${label}`);
  }
  console.log(fails.length ? `guards-for --selftest FAILED: ${fails.length}` : 'guards-for --selftest: the lane proves what a release proves, --remote dispatches only a pushed lane\'s own range, every mutant caught');
  return fails.length ? 1 : 0;
}

// ── the CLI ──────────────────────────────────────────────────────────────────
function main(args) {
  if (args.includes('--selftest')) return selftest();
  const t0 = Date.now();
  const head = git(['rev-parse', 'HEAD']);
  const auto = args.includes('--base') ? null : laneBase(head);
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : auto?.at || 'origin/main';
  if (args.includes('--remote')) return remote(base);
  const changed = changedFiles(process.cwd(), `${base}...HEAD`, { worktree: true });
  const pick = pickTests(touchedBy(changed, guardSources(process.cwd())));
  const list = [...pick.entries()].sort();
  const named = auto ? (auto.before ? `${auto.ref} as it stood before it took this lane in (${base.slice(0, 9)})` : auto.ref) : base;
  console.log(`${changed.length} changed files vs ${named}${auto ? ` (the nearest base: ${auto.ahead} commit(s) since its merge base${auto.ahead === 0 ? ', so the diff is the uncommitted work' : ''})` : ''} → ${list.length} tests`);
  if (!args.includes('--run')) {
    for (const [t, why] of list) console.log(`  node ${t}   (${why})`);
    console.log(`  + the proofs a release runs for this diff: node tools/preflight.local.mjs --proofs --as-release --list --base ${base}`);
    return 0;
  }

  let red = 0;
  for (const [t] of list) {
    const t1 = Date.now();
    const r = spawnSync('node', [t], { encoding: 'utf8', timeout: 15 * 60000 });
    const secs = Math.round((Date.now() - t1) / 1000);
    if (r.status === 0) { console.log(`  ✓ ${t} (${secs}s)`); continue; }
    red++;
    const tail = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12).join('\n      ');
    console.log(`  ✗ ${t} exit ${r.status ?? 'timeout'} (${secs}s)\n      ${tail}`);
  }
  console.log(red ? `RED: ${red} of ${list.length}` : `GREEN: ${list.length} of ${list.length}`);

  let proofs = 0;
  const pArgs = proofArgs(args, base);
  if (pArgs) {
    const dirty = (spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout || '').trim();
    if (dirty) console.log('\nguards-for: UNCOMMITTED changes are not in the proofs\' diff (GitHub reads commits): commit, then run again');
    console.log(pArgs.includes('--as-release') ? '\nThe proofs a release runs for this diff:' : '\nEvery proof this diff touches (--proofs):');
    const p = spawnSync(process.execPath, [fileURLToPath(new URL('./preflight.local.mjs', import.meta.url)), ...pArgs], { stdio: 'inherit' });
    proofs = p.status ?? 1;
    if (proofs === 3) console.log('guards-for: some proofs were NOT JUDGED here; GitHub will judge them');
  }
  const how = !pArgs ? 'no proofs (--no-proofs)' : pArgs.includes('--as-release')
    ? 'the proofs a release runs (guards whose own files moved); any touched proof listed as skipped is proved by GitHub\'s nightly sweep. --proofs runs them here, --remote runs this plan on GitHub'
    : 'every touched proof (--proofs)';
  console.log(`\nguards-for: ${list.length} plain test(s) ${red ? `RED ${red}` : 'green'}; ${how}. ${Math.round((Date.now() - t0) / 1000)} s`);
  return red || proofs === 1 || proofs === 2 ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
