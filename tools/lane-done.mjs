#!/usr/bin/env node
// tools/lane-done.mjs — the one command a lane runs before it reports (CLAUDE.md §4, 2026-09-08).
// Runs the cheap, machine-light guard set in the CURRENT worktree and exits non-zero on the
// first red. It is a runner, not a guard: it adds no rule of its own, and it prints each
// guard's own first failing lines so the lane fixes the cause where the code was written.
import { spawnSync } from 'node:child_process';
const STEPS = [
  ['bash', ['./bump-version.sh', '--check']],
  ['node', ['tests/monolith-ratchet.mjs']],
  ['node', ['tests/comment-ratio-ratchet.mjs']],
  ['node', ['tests/test-file-ratchet.mjs']],
  ['node', ['tests/patch-chain-guard.mjs']],
  ['node', ['tests/no-client-xp-mint.mjs']],
  ['node', ['tests/property-gate-census.mjs']],
  ['node', ['tests/dead-exports.mjs']],
  ['node', ['tests/dead-css.mjs']],
  ['node', ['tests/window-globals-exist.mjs']],
  ['node', ['tests/no-duplicate-toplevel-fns.mjs']],
  ['node', ['tests/token-single-source.mjs']],
  ['node', ['tests/css-literal-ratchet.mjs']],
  ['node', ['tests/breakpoint-guard.mjs']],
  // The server projects it, the client must not keep its own copy (Tyler, 2026-09-14).
  // Text-only here; the executed hr_state_of key set is pinned in the db-replay job.
  ['node', ['tests/no-client-copy-of-projection.mjs']],
  // The client predicts nothing new from 2026-09-16 (LIVE_WORLD_BRIEF.md): the
  // world tick + push channel is the path, not one more predicted field.
  ['node', ['tests/no-new-prediction.mjs']],
  // The chain must rebuild at EVERY hour of the day, not just at whatever
  // o'clock the runner started (measured: two GitHub runs red inside
  // [00:00, 00:05) on commits whose 00:21Z sibling was green). It is the only
  // step here that replays the migration chain — ~11 s per arm, six arms, one
  // PGlite at a time — and it lives in the per-lane runner because a §4 fixture
  // that only applies for 23h55m a day is written in a lane, not caught in CI.
  // Its CI home is the db-replay job (tests/guards-unregistered.json).
  ['node', ['tests/utc-midnight-replay.mjs']],
  ['node', ['tests/ci-shape.mjs']],
  ['node', ['tests/guard-hygiene.mjs']],
  // Suite isolation. ONLY the mutation proof is run here: the plain run is RED on
  // today's tree for real reasons (873 unrestored `G` writes across 72 fields — see
  // `node tests/snapshot-allowlist-guard.mjs --report`), and a runner that is red for
  // somebody else's debt teaches every lane to ignore it. The census runs in CI as a
  // named continue-on-error step; when it is green, add the plain run here too.
  ['node', ['tests/snapshot-allowlist-guard.mjs', '--selftest']],
];
let red = 0;
for (const [cmd, args] of STEPS) {
  const label = `${cmd} ${args.join(' ')}`;
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status === 0) { console.log(`  ok    ${label}`); continue; }
  red++;
  console.log(`  RED   ${label}`);
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter((l) => /✗|RED|FAIL |MONO-|CR-|TF-|PATCH-|XP-|not classified|ORPHAN/.test(l)).slice(0, 4);
  for (const l of out) console.log('        ' + l.trim().slice(0, 160));
  if (process.argv.includes('--fail-fast')) break;
}
console.log(red ? `\n${red} guard(s) red — the lane is not done.` : '\nlane-done: all green.');
process.exitCode = red ? 1 : 0;
