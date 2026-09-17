#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// CAN THE REPO REBUILD THE DATABASE *AT ANY TIME OF DAY*?
//
// tests/schema-drift.mjs asks whether the chain replays. It has only ever
// been asked that question at whatever o'clock the runner happened to start,
// and the answer is NOT the same all day.
//
// MEASURED 2026-09-16 (this file's reason for existing). Three GitHub runs on
// near-identical commits of set/b548:
//     b0efb833  23:54Z  RED   db-replay + economy-selftests
//     3cfacdf8  00:04Z  RED   db-replay + economy-selftests
//     f36c3da7  00:21Z  GREEN
// `edge`, `client-guards` and the browser half were green in all three. The
// two red jobs are exactly the two that replay the migration chain into
// PGlite, and the varying set of red STEPS inside them is just which guard's
// replay happened to land in the window: when the chain refuses to apply,
// every guard that replays it fails, each with its own message.
//
// The cause is not the runner, the cache or the dependency tree. The
// workflow pins no cache at all (no actions/cache, no setup-node cache) and
// package-lock.json is tracked, so two runs twenty minutes apart install the
// same tree. It is the chain itself:
//
//   supabase/migrations/2026-09-01-kill-daily-credit.sql backdates its §4
//   fixture rows with `created_at = now() - interval '5 minutes'` and then
//   reads them through `created_at >= public.hr_utc_day_start(now())`.
//   Inside the first five minutes of a UTC day the backdated row lands in
//   YESTERDAY, the day-scoped read returns nothing, and the gate raises.
//   The apply fails; the rebuild fails; disaster recovery has a five-minute
//   hole in it every single day.
//
// This was MEASURED AND WRITTEN DOWN ONCE ALREADY — see the header of
// supabase/migrations/2026-09-10-attended-loot-credit.sql, which names the
// window as exactly [00:00, 00:05), names the remedy (the same file's own
// GATE(f4) already clamps with
// `greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')`)
// and files it as an OPERATOR warning: "DO NOT APPLY IN THE FIRST FIVE
// MINUTES OF A UTC DAY". What that ruling did not account for is that CI
// replays the same chain on every push, at whatever time the push lands, so
// an operator warning nobody can honour became a flake generator. A hazard
// written in a comment is a hazard with no exit code behind it. This is the
// exit code.
//
// HOW IT WORKS. PGlite serves now() from the host JS clock (verified to the
// millisecond — see tests/_utc-clock-shim.mjs), so each arm spawns a real
// chain replay with the process clock parked at a chosen offset from a UTC
// midnight. HR_PGLITE_CACHE=0 on every arm, deliberately: a snapshot restore
// does not replay the chain, and a cached arm would prove nothing about the
// clock.
//
// THE CONTROL ARM (+1h) is not decoration. Without it a harness that is
// broken in some way unrelated to the clock reads as "every arm red", which
// is indistinguishable from the defect. The control must be GREEN for any
// red arm to mean anything, and a red control is a HARNESS failure (exit 2),
// never a verdict.
//
// --selftest is the mutation proof. It reverts the GATE(f5) clamp in the
// REAL migration text (the one-line defect that is actually in this repo's
// history), requires the in-window arm to go RED with the fixture's own
// message, and requires the +1h control to stay GREEN — a guard that goes
// red at every hour of the day is a broken guard, not a clock guard. The
// file is restored byte-for-byte afterwards, verified by length and content.
//
// ⚠ WHAT THIS GUARD DOES NOT COVER (security review 2026-09-16, MEASURED on a
// clean tree). The arms below are timed from PROCESS START, not from the moment
// the fixture executes: GATE(f6) runs ~6.5 s into a replay, so the -8 "straddle"
// arm reaches it at 23:59:58 — the whole DO block finishes BEFORE midnight and
// nothing straddles. Offsets -6 … -1 and 0 … +1 exit 1 on a CORRECT function
// with `GATE(f5): the credit applied 0 (expected 3)`: midnight falls BETWEEN
// f5's two credits, the clamp pushes the log stamp FORWARD onto the day start,
// the anchor collapses and the cap honestly refuses the 15-kill claim. Green at
// -7 and +2. That is a ~8 s red band per day, and the +1 arm here sits ON its
// edge — measured GREEN, then RED at the same offset twenty minutes later, so
// this guard is currently a flake source at exactly the hour it polices.
// FIX (reliability + backend lanes, not done here): day-anchor GATE(f5) the way
// GATE(f6) now is (round size and expectations from the server's reported cap),
// and re-time the arms so the BOUNDARY lands inside the fixture — probe the
// offset at which f5 executes, then sweep it at 1 s granularity.
//
// Exit: 0 green · 1 the chain cannot rebuild at some hour of the day ·
//       2 harness (the control arm failed, or a mutation could not be planted).
//
// No credentials; production untouched.
// ════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHIM = pathToFileURL(join(HERE, '_utc-clock-shim.mjs')).href;
const REPLAY = join(HERE, 'schema-drift.mjs');

const MIGRATION = join(ROOT, 'supabase', 'migrations', '2026-09-01-kill-daily-credit.sql');
const CLAMPED = "update public.hr_kill_credit_log set created_at = greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')";
const UNCLAMPED = "update public.hr_kill_credit_log set created_at = now() - interval '5 minutes'";

/* The offsets, in seconds from a UTC midnight. The three in-window ones are
   the boundary the attended-loot-credit header measured by hand (RED at
   00:00:28, 00:01:26, 00:02:35, 00:03:13, 00:04:25; green again 00:05:34);
   -8 makes the replay STRADDLE the boundary rather than start after it,
   which is the shape a 23:5x push actually has. +3600 is the control. */
const ARMS = [
  { name: 'replay straddling the UTC boundary (starts 00:00:-08)', off: -8, window: true },
  { name: 'replay inside the first minute of a UTC day (00:00:01)', off: 1, window: true },
  { name: 'replay at 00:02:30 UTC', off: 150, window: true },
  { name: 'replay at 00:04:30 UTC', off: 270, window: true },
  /* 00:25 is not padding. [00:00, 00:05) is only the window of the FIVE-minute
     backdates; the chain also carries THIRTY-minute ones
     (2026-09-02-renown-kill-faucet.sql lines 672/719 reset the kill-credit
     anchor with `now() - interval '30 minutes'`). Those rows are bounty rows
     (free = false), so no day-scoped read sees them today and the arm is green
     — but the arm is what says so, and it is what will go red the day somebody
     day-scopes that read. Cost: one more ~11 s replay. */
  { name: 'replay at 00:25:00 UTC (covers the 30-minute fixture backdates)', off: 1500, window: true },
  { name: 'CONTROL — replay at 01:00:00 UTC (must be green)', off: 3600, window: false },
];

let bad = 0;
let harness = 0;
const ok = (label, cond, note = '') => {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${label}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

function replayAt(offsetSeconds) {
  const r = spawnSync(process.execPath, ['--import', SHIM, REPLAY], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HR_FAKE_UTC_OFFSET_S: String(offsetSeconds),
      // A restored snapshot never replays the chain, so a cached arm would
      // be green at every hour of the day and this guard would assert nothing.
      HR_PGLITE_CACHE: '0',
    },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status, out };
}

function firstGateLine(out) {
  const m = out.match(/GATE\([^)]*\)[^\n]*/);
  return m ? m[0].slice(0, 160) : (out.trim().split('\n').pop() || '').slice(0, 160);
}

async function base() {
  console.log('\nUTC MIDNIGHT REPLAY — the chain must rebuild at every hour of the day\n');
  const control = ARMS.find((a) => !a.window);
  const c = replayAt(control.off);
  if (c.code !== 0) {
    console.error(`  HARNESS: the ${control.name} arm is red, so no in-window red means anything.`);
    console.error(`           ${firstGateLine(c.out)}`);
    harness = 1;
    return;
  }
  ok(control.name, true);
  for (const arm of ARMS.filter((a) => a.window)) {
    const r = replayAt(arm.off);
    ok(arm.name, r.code === 0, r.code === 0 ? '' : `→ ${firstGateLine(r.out)}`);
  }
}

async function selftest() {
  console.log('\nUTC MIDNIGHT REPLAY — MUTATION PROOF (the GATE(f5) clamp reverted)\n');
  const original = readFileSync(MIGRATION, 'utf8');
  if (!original.includes(CLAMPED)) {
    console.error(`  HARNESS: could not find the clamped GATE(f5) line to revert in ${MIGRATION}`);
    harness = 1;
    return;
  }
  writeFileSync(MIGRATION, original.replace(CLAMPED, UNCLAMPED), 'utf8');
  try {
    const red = replayAt(1);
    ok('reverting the GATE(f5) clamp turns the in-window arm RED',
      red.code !== 0, red.code !== 0 ? `→ ${firstGateLine(red.out)}` : '(it stayed green)');
    const green = replayAt(3600);
    ok('...and the 01:00 UTC control stays GREEN (a clock guard, not a broken one)',
      green.code === 0, green.code === 0 ? '' : `→ ${firstGateLine(green.out)}`);
  } finally {
    writeFileSync(MIGRATION, original, 'utf8');
    const back = readFileSync(MIGRATION, 'utf8');
    if (back !== original) {
      console.error('  HARNESS: the migration was NOT restored byte-for-byte.');
      harness = 1;
    }
  }
}

if (process.argv.includes('--selftest')) await selftest();
else await base();

if (harness) { console.error('\nHARNESS FAILURE\n'); process.exit(2); }
if (bad) { console.error(`\n${bad} red\n`); process.exit(1); }
console.log('\ngreen\n');
