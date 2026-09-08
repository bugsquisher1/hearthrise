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
  ['node', ['tests/window-globals-exist.mjs']],
  ['node', ['tests/no-duplicate-toplevel-fns.mjs']],
  ['node', ['tests/token-single-source.mjs']],
  ['node', ['tests/css-literal-ratchet.mjs']],
  ['node', ['tests/breakpoint-guard.mjs']],
  ['node', ['tests/ci-shape.mjs']],
  ['node', ['tests/guard-hygiene.mjs']],
];
let red = 0;
for (const [cmd, args] of STEPS) {
  const label = `${cmd} ${args.join(' ')}`;
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status === 0) { console.log(`  ok    ${label}`); continue; }
  red++;
  console.log(`  RED   ${label}`);
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter((l) => /✗|RED|MONO-|CR-|TF-|PATCH-|XP-|not classified|ORPHAN/.test(l)).slice(0, 4);
  for (const l of out) console.log('        ' + l.trim().slice(0, 160));
  if (process.argv.includes('--fail-fast')) break;
}
console.log(red ? `\n${red} guard(s) red — the lane is not done.` : '\nlane-done: all green.');
process.exitCode = red ? 1 : 0;
