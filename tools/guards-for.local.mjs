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
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, guardSources, touchedBy, importsOf } from './lib/guard-deps.mjs';
import { isMain } from '../tests/_is-main.mjs';

/* The mapping is shared with tools/mutant-gate.mjs (CI's --mutate/--selftest gate): one rule, two callers. */
/* Never scheduled here, whatever the diff touches: run-ci-local is a way to reproduce a GitHub red, not a gate
   (CLAUDE.md §3.3), and on 2026-11-11 six lanes ran it at once because their diffs touched CI files. */
export const NEVER_SCHEDULED = Object.freeze(['tests/run-ci-local.mjs']);
/* NOT A CI TEST (2026-11-23, lane/ci-reds-orphans): a file tests/guards-unregistered.json names under `guards` is one no workflow
   runs (guard-hygiene RULE 3 keeps that true), by hand only: the *-world.mjs walks (minutes each, a browser and the replayed chain)
   and the retired T-03 party-class-xp-line. Lanes read their reds as the set's; they are named, never run, here. A
   `being-registered` entry is on its way into CI and still runs. */
export function byHandTools(root = process.cwd()) {
  try {
    const g = JSON.parse(readFileSync(join(root, 'tests/guards-unregistered.json'), 'utf8')).guards || {};
    return new Set(Object.entries(g).filter(([f, v]) => !f.startsWith('$') && v && v.disposition !== 'being-registered').map(([f]) => `tests/${f}`));
  } catch { return new Set(); }
}
export const pickTests = (entries, byHand = new Set()) => new Map([...entries]
  .filter(([t]) => t.startsWith('tests/') && !basename(t).startsWith('_') && !NEVER_SCHEDULED.includes(t) && !byHand.has(t)));

/** preflight.local.mjs's argv for this run's proofs, or null for none. The default is --as-release; --proofs is the old run. Pure. */
export function proofArgs(argv, base) {
  if (argv.includes('--no-proofs')) return null;
  return ['--proofs', '--plant', '--base', base, ...(argv.includes('--proofs') ? [] : ['--as-release']), ...(argv.includes('--pages') ? ['--pages'] : [])];
}

/* A base a lane can be cut from: a set, next, or main, on origin. Never the lane's own pushed branch (its merge base is HEAD). */
export const BASE_REF = /^origin\/(set\/v[\w.-]+|next|main)$/;
/**
 * The lane's base: the candidate whose merge base with HEAD is nearest (fewest commits to HEAD); a ref that already holds HEAD
 * is no base (its diff is empty), and on a tie the earlier candidate wins (upstream, then the newest sets, next, main). Pure.
 * @param {{ ref: string, mergeBase: string|null, ahead: number }[]} cands
 */
export function nearestBase(cands, head) {
  let best = null;
  for (const c of cands) {
    if (!BASE_REF.test(c.ref) || !c.mergeBase || c.mergeBase === head || !Number.isFinite(c.ahead)) continue;
    if (!best || c.ahead < best.ahead) best = c;
  }
  return best;
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

function laneBase(head) {
  const up = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) || '';
  const sets = (git(['for-each-ref', '--sort=-version:refname', '--count=6', '--format=%(refname:short)', 'refs/remotes/origin/set/']) || '').split('\n').filter(Boolean);
  const refs = [...new Set([up, ...sets, 'origin/next', 'origin/main'].filter((r) => BASE_REF.test(r)))];
  const cands = refs.map((ref) => {
    const mergeBase = git(['merge-base', ref, 'HEAD']);
    return { ref, mergeBase, ahead: mergeBase ? Number(git(['rev-list', '--count', `${mergeBase}..HEAD`])) : NaN };
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
    /* BY THE REAL PATH (2026-11-23): an edit to tools/balance-program/levers/world.mjs pulled every tests/*-world.mjs (they import
       tools/qa/local-world.mjs) into a lane's list, by basename */
    const SRC = new Map([
      ['tests/walk-world.mjs', "import { openWorld } from '../tools/qa/local-world.mjs';\n"],
      ['tests/levers-x.mjs', "import { W } from '../tools/balance-program/levers/world.mjs';\n"],
      ['tests/data-x.mjs', "const s = readFileSync(join(ROOT, 'src/data/world.js'), 'utf8');\n"],
      ['tests/view-x.mjs', "const s = readFileSync(join(ROOT, 'src/world/local-world.js'), 'utf8');\n"],
      ['tests/member-x.mjs', "const m = await import(pathToFileURL(join(SRC, 'core', 'member.js')).href); const t = 'core/member.js';\n"],
      ['tests/fixture-x.mjs', "const f = 'tests/fixtures/member.js';\n"],
      ['tests/tick-x.mjs', 'const f = `${DIR}tick-contract.js`; const g = `${DIR}side-tick-gather.js`;\n'],
      ['tests/probe-x.mjs', "const PROBE = \"import('./tests/activity-seam.mjs').then((m) => m.runAll())\";\n"],
    ]);
    const tb = (f) => [...impl.touched([f], SRC).keys()].sort().join(',');
    const hand = impl.pickTests([['tests/char-wipe-world.mjs', 'x'], ['tests/ci-shape.mjs', 'y']], new Set(['tests/char-wipe-world.mjs']));
    return [
      [tb('tools/balance-program/levers/world.mjs') === 'tests/levers-x.mjs', 'an edit to levers/world.mjs picks its importer only, never a walk importing qa/local-world.mjs'],
      [tb('tools/qa/local-world.mjs') === 'tests/walk-world.mjs', 'an edit to qa/local-world.mjs picks the walk that imports it'],
      [tb('src/data/world.js') === 'tests/data-x.mjs', 'src/data/world.js picks the guard naming it, not one naming src/world/local-world.js'],
      [tb('src/core/member.js') === 'tests/member-x.mjs', 'a literal\'s directories bind as the tail of the real path (core/member.js names src/core/member.js; tests/fixtures/member.js does not)'],
      [tb('services/world-tick/tick-contract.js') === 'tests/tick-x.mjs' && tb('services/world-tick/tick-gather.js') === '',
        'a template\'s fill names a file (${DIR}tick-contract.js); side-tick-gather.js is not tick-gather.js'],
      [tb('tests/activity-seam.mjs') === 'tests/probe-x.mjs', 'a ./ import evaluated from the root (a probe string) still picks its importer'],
      [[...hand.keys()].join(',') === 'tests/ci-shape.mjs', 'a by-hand tool (tests/guards-unregistered.json) is named, never run'],
      [[...got.keys()].join(',') === 'tests/ci-shape.mjs', 'run-ci-local is never scheduled'],
      [def.includes('--as-release') && def.includes('--plant') && def[def.indexOf('--base') + 1] === 'origin/set/v1', '--run proves as a release does (--as-release), against the lane\'s base'],
      [!all.includes('--as-release') && all.includes('--pages') && all.includes('--proofs'), '--proofs is the old run: every touched proof (and --pages passes through)'],
      [impl.proofArgs(['--run', '--no-proofs'], 'b') === null, '--no-proofs runs no proof'],
      [impl.nearestBase(cands, H)?.ref === 'origin/set/v0.2.144', 'the base is the nearest set (a tie keeps the set before next; never the lane\'s own branch)'],
      [impl.nearestBase([{ ref: 'origin/set/v1', mergeBase: H, ahead: 0 }, { ref: 'origin/main', mergeBase: sha('c'), ahead: 5 }], H)?.ref === 'origin/main', 'a set that already holds HEAD is no base'],
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
  const real = { pickTests, proofArgs, nearestBase, remoteRefusal, dispatchArgs, pickRun, touched: (c, s) => touchedBy(c, s) };
  for (const [c, m] of checks(real)) ok(c, m);
  const by = byHandTools();
  ok(by.has('tests/party-class-xp-line.mjs') && by.has('tests/char-wipe-world.mjs') && !by.has('tests/ci-shape.mjs'), 'the by-hand list is tests/guards-unregistered.json\'s (the retired T-03 and the world walks), no CI guard');
  /* the basename rules this replaced: a stem anywhere at the end of a name, any directory */
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stemOf = (p) => basename(p).replace(/\.(generated\.)?(js|mjs|ts|sql|css|html|json|sh)$/, '');
  const oldImports = (t, s) => ({ has: (h) => new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*)['"\`][^'"\`]*\\b${esc(stemOf(h))}\\.mjs['"\`]`).test(s) });
  const oldNames = (s, p) => new RegExp(`['"\`][^'"\`]*${esc(stemOf(p))}\\.(?:generated\\.)?(?:js|mjs|ts|sql|css|html|json|sh)`).test(s);
  const stemNames = (s, p) => new RegExp(`['"\`/]${esc(stemOf(p))}\\.(?:js|mjs)`).test(s);
  for (const [label, impl] of [
    ['imports matched by basename (local-world.mjs is world.mjs)', { ...real, touched: (c, s) => touchedBy(c, s, { imports: oldImports }) }],
    ['path strings matched by basename suffix', { ...real, touched: (c, s) => touchedBy(c, s, { names: oldNames }) }],
    ['path strings matched by file name, any directory', { ...real, touched: (c, s) => touchedBy(c, s, { names: stemNames }) }],
    ['a ./ import resolved against the importer only', { ...real, touched: (c, s) => touchedBy(c, s, {
      imports: (t, src) => new Set([...importsOf(t, src)].filter((p) => !src.includes(`'./${p}'`))) }) }],
    ['by-hand tools run', { ...real, pickTests: (e) => pickTests(e) }],
    ['run-ci-local is scheduled', { ...real, pickTests: (e) => new Map([...e].filter(([t]) => t.startsWith('tests/') && !basename(t).startsWith('_'))) }],
    ['--run proves every touched proof again', { ...real, proofArgs: (a, b) => proofArgs([...a, '--proofs'], b) }],
    ['--proofs is ignored', { ...real, proofArgs: (a, b) => proofArgs(a.filter((x) => x !== '--proofs'), b) }],
    ['--no-proofs is ignored', { ...real, proofArgs: (a, b) => proofArgs(a.filter((x) => x !== '--no-proofs'), b) }],
    ['the base is always main', { ...real, nearestBase: (c, h) => nearestBase(c.filter((x) => x.ref === 'origin/main'), h) }],
    ['the lane\'s own branch can be its base', { ...real, nearestBase: (c, h) => c.filter((x) => x.mergeBase && x.mergeBase !== h).sort((a, b) => a.ahead - b.ahead)[0] || null }],
    ['a ref holding HEAD is a base', { ...real, nearestBase: (c, h) => nearestBase(c.map((x) => ({ ...x, mergeBase: x.mergeBase === h ? sha('9') : x.mergeBase })), h) }],
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
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : auto?.ref || 'origin/main';
  if (args.includes('--remote')) return remote(base);
  const changed = changedFiles(process.cwd(), `${base}...HEAD`, { worktree: true });
  const touched = touchedBy(changed, guardSources(process.cwd()));
  const byHand = byHandTools();
  const pick = pickTests(touched, byHand);
  const list = [...pick.entries()].sort();
  console.log(`${changed.length} changed files vs ${base}${auto ? ` (the nearest base: ${auto.ahead} commit(s) since its merge base)` : ''} → ${list.length} tests`);
  const handOnly = [...touched.keys()].filter((t) => byHand.has(t)).sort();
  if (handOnly.length) console.log(`  not run (by-hand tools no workflow runs, tests/guards-unregistered.json): ${handOnly.join(' ')}`);
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
