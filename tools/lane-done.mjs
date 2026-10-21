#!/usr/bin/env node
// tools/lane-done.mjs — the one command a lane runs before it reports (CLAUDE.md §4, 2026-09-08).
// Runs the cheap, machine-light guard set in the CURRENT worktree and exits non-zero on the
// first red. It is a runner, not a guard: it adds no rule of its own, and it prints each
// guard's own first failing lines so the lane fixes the cause where the code was written.
//
// SPEED (guard diet, 2026-10-10: measured 25+ min on a busy dev box, target < 10).
// Every step is a read-only process (mutation arms plant into temp copies or into
// memory, never the tree), so they run N at a time. A step marked `solo` measures
// time itself (utc-midnight-replay parks the clock relative to a probed delay) and
// runs after the pool drains, alone. A step with `inputs` replays the migration
// chain; its GREEN verdict is remembered under a content-addressed key of those
// inputs plus its import closure (tools/verdict-cache.mjs) and printed `cached`
// when nothing it reads has changed. `--no-cache` / HR_VERDICT_CACHE=0 runs all;
// `-j 1` runs one at a time; `--fail-fast` stops at the first red.
//
// SCOPED PROOFS (b569). The list below is fixed, so a lane that edited a line some
// guard's --selftest/--mutate mutant anchors on went green here and red on GitHub
// (envelope-frame-gate vs a rewrite of src/net/gold.js). tools/guard-anchors.mjs
// derives guard -> anchored files from the guards' own source; every proof arm
// whose anchors (or whose guard file) this lane changed — origin/main...HEAD plus
// the uncommitted tree — is appended, verdict-cached on its anchors, and a proof
// that plants into the tree runs solo. A proof guard with no derivable or declared
// anchor set is itself a RED step. `--scoped-only` runs just those; `--changed
// <file> …` replaces the diff (the end-to-end arm of guard-anchors --selftest).
//
// THE BASE (2026-10-20). "This lane's diff" is measured from its INTEGRATION base:
// the newest of origin/next and any local set/v* that is under HEAD and contains
// origin/main, else origin/main (tools/guard-anchors.mjs laneBase). A lane built on
// an unreleased set no longer re-proves the whole set: the proofs whose anchors the
// SET moved are proven by the set's own run (the Coordinator's guards-for on the set,
// then GitHub on next/release), so this narrows to the lane's own change, it does not
// skip a proof. `--base <ref>` / HR_LANE_BASE=<ref> pick the base (`--base origin/main`
// re-proves everything since main); the base used is printed.
//
// ONE AT A TIME (2026-10-20). A machine-wide lock (<git-common-dir>/hr-lane-done.lock,
// tools/verdict-cache.mjs) makes a second lane-done wait for the first and then reuse
// its cached greens instead of both starting cold. `--no-lock` opts out.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { verdictKey, lookup, record, acquireRunLock } from './verdict-cache.mjs';
import { scopedProofs } from './guard-anchors.mjs';

// What a chain replay reads besides its own import closure.
const CHAIN = ['supabase', 'tests/sql', 'tests/schema-apply-order.json', 'tests/schema-drift.baseline.json'];
const STEPS = [
  ['bash', ['./bump-version.sh', '--check']],
  ['node', ['tests/comment-ratio-ratchet.mjs']],
  // The rebuilt client (2026-10-17): its module cap, its session rules, its
  // whole RPC surface. Pure node, under two seconds together.
  ['node', ['tests/client-module-size.mjs']],
  ['node', ['tests/session-core.mjs']],
  ['node', ['tests/session-core.mjs', '--mutate']],
  ['node', ['tests/hunt-view-core.mjs']],
  ['node', ['tests/hunt-scene.mjs']],
  ['node', ['tests/hunt-scene-live.mjs', '--node']],
  ['node', ['tests/hunt-live.mjs']],
  ['node', ['tests/edge-body-cap.mjs']],
  ['node', ['tests/client-intent-surface.mjs']],
  // The envelope contract (2026-10-18): every section the client reads, from the REAL
  // projections on PGlite through the real readers. ~1 min (one replay).
  ['node', ['tests/envelope-contract.mjs']],
  ['node', ['tests/patch-chain-guard.mjs']],
  ['node', ['tests/no-client-xp-mint.mjs']],
  ['node', ['tests/dead-exports.mjs']],
  ['node', ['tests/dead-css.mjs']],
  // Web storage only through src/platform/storage.js (W4.1). Milliseconds.
  ['node', ['tests/platform-seam.mjs']],
  ['node', ['tests/window-globals-exist.mjs']],
  ['node', ['tests/token-single-source.mjs']],
  ['node', ['tests/css-literal-ratchet.mjs']],
  ['node', ['tests/breakpoint-guard.mjs']],
  // The server projects it, the client must not keep its own copy (Tyler, 2026-09-14).
  // Text-only here; the executed hr_state_of key set is pinned in the db-replay-3 job
  // (split from db-replay 2026-09-20, then from db-replay-2 2026-09-26).
  ['node', ['tests/no-client-copy-of-projection.mjs']],
  // The chain must rebuild at EVERY hour of the day, not just at whatever
  // o'clock the runner started (measured: two GitHub runs red inside
  // [00:00, 00:05) on commits whose 00:21Z sibling was green). It is the only
  // step here that replays the migration chain — one PGlite at a time, ~11 s per
  // arm, fourteen arms (a probed sweep across the UTC boundary), so ~3 min — and
  // it lives in the per-lane runner because a §4 fixture that only applies for
  // 23h55m a day is written in a lane, not caught in CI.
  // Its CI home is its own utc-midnight-replay job, split out of db-replay 2026-09-19
  // (b550) once the family's own budget could no longer fit it (tests/guards-unregistered.json).
  ['node', ['tests/utc-midnight-replay.mjs'], { inputs: [...CHAIN, 'tests/schema-drift.mjs', 'tests/_utc-clock-shim.mjs'], solo: true }],
  // `accrued_to` advances to the time the simulation ACCOUNTED FOR, not to now()
  // (2026-09-16): the sub-tick carry is deferred to the next window, never
  // forfeited, and the four refusals that keep that from minting hold. Both arms
  // per RULE 5 — the plain run answers "green when nothing is wrong", --mutate
  // answers "can this go red". ~2 s, no database, no network.
  ['node', ['tests/settle-carry-defer.mjs']],
  ['node', ['tests/settle-carry-defer.mjs', '--mutate']],
  // The 90-day ledger retention, PROVEN BY RUNNING IT (2026-09-18). hr_ledger_prune
  // is scheduled hourly and has never deleted a row — player_ledger_rollup = 0 rows
  // and the oldest ledger row is 27 days old, so the first real fire is ~2026-11-21.
  // Same shape as the game_events incident, where the cron row existed and the
  // retention still did not work. This replays the chain, manufactures the aged rows
  // production will not have for two months, runs the prune exactly as cron calls it,
  // and asserts conservation / an exact boundary / an idempotent second run / that no
  // per-day spending ceiling in any RPC moves across the prune. Both arms per RULE 5.
  // It replays the migration chain (~2 arms x chain), so it lives in the per-lane
  // runner for the same reason utc-midnight-replay does; its CI home is the db-replay
  // job (tests/guards-unregistered.json).
  ['node', ['tests/ledger-rollup.mjs'], { inputs: CHAIN }],
  ['node', ['tests/ledger-rollup.mjs', '--mutate'], { inputs: CHAIN }],
  // SETTLE BEFORE MUTATE (Security F1, 2026-09-28): every edge verb that adds a
  // priceable input settles the open window at the OLD state first — a pickaxe
  // or a feast at return must not re-price the absence. One chain replay, ~5 s
  // warm. Its CI home, with the --mutate arm, is the economy-selftests job.
  ['node', ['tests/absence-priced-at-return.mjs'], { inputs: [...CHAIN, 'src'] }],
  // Shipped copy promises no retired capability (local save, offline mode, save files). ~600 ms.
  ['node', ['tests/retired-capability-copy.mjs']],
  ['node', ['tests/retired-capability-copy.mjs', '--selftest']],
  // The quest/goal reward catalogue parity (data <-> chain-end SQL). Seconds, no network.
  ['node', ['tests/quest-reward-parity.mjs']],
  ['node', ['tests/quest-reward-parity.mjs', '--selftest']],
  ['node', ['tests/ci-shape.mjs']],
  ['node', ['tests/guard-hygiene.mjs']],
  // A new guard's mutant replay must declare its scope (upTo / fullChain) where
  // the guard is written, not after a newer migration blinds it in CI.
  ['node', ['tests/replay-scope-guard.mjs']],
  // run-smoke's data preflights (art, catalogues, the unlock/offer generators' --check, derived bodies): seconds.
  // GitHub's smoke job runs them first; a generated file left stale by a data edit must be red HERE (2026-10-19).
  ['node', ['tests/run-smoke.mjs', '--preflights']],
];
const argv = process.argv.slice(2);
const FAIL_FAST = argv.includes('--fail-fast');
const SCOPED_ONLY = argv.includes('--scoped-only');
const chAt = argv.indexOf('--changed');
const bAt = argv.indexOf('--base');
const BASE = bAt >= 0 ? argv[bAt + 1] : (process.env.HR_LANE_BASE || null);
if (bAt >= 0 && (!BASE || BASE.startsWith('-'))) { console.log('usage: --base <ref>'); process.exit(2); }
const CHANGED = chAt >= 0 ? argv.slice(chAt + 1).filter((a, i, all) => !a.startsWith('-') && all[i - 1] !== '--base') : null;
if (argv.includes('--no-cache')) process.env.HR_VERDICT_CACHE = '0';
const jAt = argv.indexOf('-j');
const POOL = jAt >= 0 && Number(argv[jAt + 1]) >= 1 ? Number(argv[jAt + 1])
  : Math.min(4, Math.max(1, Math.floor(availableParallelism() / 4)));

function run(cmd, args) {
  return new Promise((done) => {
    let out = '';
    const child = spawn(cmd, args, { shell: process.platform === 'win32' });
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    child.on('error', (e) => done({ status: 2, out: out + e.message }));
    child.on('close', (code) => done({ status: code === null ? 2 : code, out }));
  });
}

let red = 0;
let stop = false;

/* A lane-done started BY a guard this run is running (guard-anchors' end-to-end arm)
   must not wait on its own parent: the holder's PID is passed down in HR_LANE_DONE_LOCK. */
if (!argv.includes('--no-lock') && !process.env.HR_LANE_DONE_LOCK) {
  await acquireRunLock(undefined, { onWait: (h) => console.log(`waiting for ${h.worktree} lane-done, started `
    + `${new Date(h.at).toTimeString().slice(0, 5)} (pid ${h.pid}; --no-lock to run alongside)`) });
  process.env.HR_LANE_DONE_LOCK = String(process.pid);
}

/* The scoped proofs, after the fixed list; a step the list already runs is not run twice. */
const scoped = scopedProofs(process.cwd(), { changed: CHANGED, baseRef: BASE });
const fixed = new Set(STEPS.map(([c, a]) => `${c} ${a.join(' ')}`));
const SCOPED = scoped.steps
  .map((s) => ['node', [s.guard, ...(s.arm ? [s.arm] : [])], { inputs: [...CHAIN, 'src', ...s.anchors], solo: s.solo }])
  .filter(([c, a]) => !fixed.has(`${c} ${a.join(' ')}`));
const PLAN = SCOPED_ONLY ? SCOPED : [...STEPS, ...SCOPED];
console.log(CHANGED ? 'base: none (--changed names the files)'
  : `base: ${scoped.baseRef || '?'} (${String(scoped.base).slice(0, 9)})${BASE ? '' : " — the lane's integration base; --base <ref> to change"}`);
console.log(`scoped proofs: ${SCOPED.length} arm(s) anchored on ${(scoped.changed || []).length} changed file(s)`
  + (SCOPED.length ? ' — ' + SCOPED.map(([, a]) => a[0].replace(/^(tests|tools)\//, '')).join(', ') : ''));
for (const p of scoped.error ? [scoped.error] : scoped.errors) {
  red++;
  console.log('  RED   guard-anchors  ' + p.slice(0, 200));
}
async function step([cmd, args, opt = {}]) {
  if (stop) return;
  const label = `${cmd} ${args.join(' ')}`;
  const key = opt.inputs ? verdictKey(process.cwd(), [cmd, ...args], opt.inputs) : null;
  const hit = key && lookup(key);
  if (hit) { console.log(`  cached ${label}  (green ${new Date(hit.at).toISOString().slice(0, 16)}Z, key ${key.slice(0, 12)})`); return; }
  const t0 = Date.now();
  const r = await run(cmd, args);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) {
    if (key) record(key, { status: 0, ms: Date.now() - t0, cmd: label });
    console.log(`  ok    ${label}  ${secs}s`);
    return;
  }
  red++;
  console.log(`  RED   ${label}  ${secs}s`);
  const lines = r.out.split('\n').filter((l) => /✗|RED|FAIL |MONO-|CR-|TF-|PATCH-|XP-|not classified|ORPHAN/.test(l)).slice(0, 4);
  for (const l of lines) console.log('        ' + l.trim().slice(0, 160));
  if (FAIL_FAST) stop = true;
}

const t0 = Date.now();
const queue = PLAN.filter(([, , o]) => !o?.solo);
await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, async () => {
  while (queue.length && !stop) await step(queue.shift());
}));
for (const s of PLAN.filter(([, , o]) => o?.solo)) await step(s);
const wall = `${((Date.now() - t0) / 1000).toFixed(0)} s, ${POOL} at a time`;
console.log(red ? `\n${red} guard(s) red — the lane is not done. (${wall})` : `\nlane-done: all green. (${wall})`);
process.exitCode = red ? 1 : 0;
