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
// --selftest is the mutation proof, and it plants TWO mutations in the REAL
// migration text. (1) UN-ANCHOR every §4 stamp — the one-line defect that is
// actually in this repo's history — and require a just-after-midnight arm to go
// RED with a fixture's own message while the +1h control stays GREEN (a guard
// that goes red at every hour of the day is a broken guard, not a clock guard).
// (2) Plant the S1 economy defect (`v_consumed := v_settle_delta`, Security C1)
// and require RED at BOTH the boundary and the control: day-anchoring a fixture
// must not turn it into something that is green at any magnitude. The file is
// restored byte-for-byte after each, verified by content.
//
// ⚠ THE ARMS ARE TIMED FROM THE FIXTURE, NOT FROM PROCESS START (security
// review 2026-09-16 — the first version of this guard got this wrong and said
// so). The §4 block takes its transaction timestamp ~7–10 s after the process
// starts, so an arm parked at "-8 s" reached the fixture at 23:59:58 and never
// straddled anything, while an arm at "+1" sat on the edge of a red band and
// was measured GREEN and RED twenty minutes apart. The delay is now PROBED once
// per run (a `raise exception 'HRPROBE now=%'` planted at the GATE(f5) marker,
// the database's own transaction timestamp read back out of the failure) and
// every sweep arm is expressed in seconds of the FIXTURE's clock. Two fixtures
// were red in that band on a correct function and are fixed in the same commit
// as this re-timing: GATE(f5) is day-anchored the way GATE(f6) already was, and
// GATE(f4) tolerates a 0 cap ONLY on a day younger than one 600 ms kill.
//
// Exit: 0 green · 1 the chain cannot rebuild at some hour of the day ·
//       2 harness (the control arm failed, or a mutation could not be planted).
//
// No credentials; production untouched.
// ════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHIM = pathToFileURL(join(HERE, '_utc-clock-shim.mjs')).href;
const REPLAY = join(HERE, 'schema-drift.mjs');

const MIGDIR = join(ROOT, 'supabase', 'migrations');
const MIG_NAME = '2026-09-01-kill-daily-credit.sql';
const MIGRATION = join(MIGDIR, MIG_NAME);
/* The mutation the --selftest plants: UN-ANCHOR every §4 stamp, i.e. revert the
   whole class this guard polices in one edit. It is the literal one-line defect
   that is in this repo's history (GATE(f5) did not inherit GATE(f4)'s clamp). */
const CLAMPED = "greatest(public.hr_utc_day_start(now()), now() - interval '5 minutes')";
const UNCLAMPED = "now() - interval '5 minutes'";
/* …and the OTHER mutation: the S1 defect Security C1 reported, which is not a
   clock bug at all. It must be red at the boundary AND at the control — that is
   what says the day-anchored fixtures still assert their economy property and
   did not become a green-at-any-magnitude no-op. */
const S1_FIX = 'v_consumed   := least(v_settle_delta, v_credit);';
const S1_DEFECT = 'v_consumed   := v_settle_delta;';

/* WHERE THE FIXTURE ACTUALLY RUNS. The arms are parked relative to a UTC
   midnight AT PROCESS START, but the §4 block that carries GATE(f5)/GATE(f6)
   executes some seconds later — measured ~6.5 s, and it moves with the machine.
   Timing the arms from process start is how the first version of this guard came
   to have a "straddle" arm that never straddled (it reached the fixture at
   23:59:58) and an arm sitting exactly on the edge of a red band, green in one
   run and red twenty minutes later. So the offset is PROBED, once per run, by
   planting a `raise exception 'HRPROBE now=%'` at the GATE(f5) marker and reading
   the database's own transaction timestamp back out of the failure — and the
   sweep below is expressed in seconds OF THE FIXTURE'S OWN CLOCK relative to
   midnight, so k = 0 really is "the block runs as the day turns over". */
const F5_MARK = '    -- ── (f5) ⚠ CREDIT';
const PROBE_SQL = "    raise exception 'HRPROBE now=%', now();\n";
const PROBE_OFFSET = 3600;
// Must equal the shim's own midnight; asserted against the shim text below.
const SHIM_MIDNIGHT = Date.parse('2026-09-18T00:00:00.000Z');
/* The sweep, in seconds of the FIXTURE's clock relative to midnight. It runs to
   +9 and not to +3 because the band the security review measured was not a
   boundary artefact: a 15-kill claim needs ≈6.9 s of window at the 600 ms kill
   floor, and a 40-kill one ≈18.5 s, so a fixture that re-acquires a literal
   magnitude goes red for the first several SECONDS of a day, not the first
   moment of it. ⚠ The label is the INTENDED second: the probe measures one
   replay and the next replay is not identical (measured 8.65 s and 9.84 s in two
   runs of the same tree, ~1.2 s of jitter), so read the sweep as covering the
   band as a SET, not each arm to the second. Ten arms ≈ 2 min. */
const SWEEP = [-3, -2, -1, 0, 1, 2, 3, 5, 7, 9];

/* The fixed arms keep the coarse coverage the hand-measured window bought:
   00:02:30 and 00:04:30 sit inside [00:00, 00:05), the window of the FIVE-minute
   backdates, and 00:25:00 covers the THIRTY-minute ones
   (2026-09-02-renown-kill-faucet.sql lines 672/719). +3600 is the control. */
const ARMS = [
  { name: 'replay at 00:02:30 UTC', off: 150, window: true },
  { name: 'replay at 00:04:30 UTC', off: 270, window: true },
  { name: 'replay at 00:25:00 UTC (covers the 30-minute fixture backdates)', off: 1500, window: true },
  { name: 'CONTROL — replay at 01:00:00 UTC (must be green)', off: 3600, window: false },
];

let bad = 0;
let harness = 0;
const ok = (label, cond, note = '') => {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${label}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

function replayAt(offsetSeconds, migDir = MIGDIR) {
  const r = spawnSync(process.execPath, ['--import', SHIM, REPLAY], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HR_MIGRATIONS_DIR: migDir,
      HR_FAKE_UTC_OFFSET_S: String(offsetSeconds),
      // A restored snapshot never replays the chain, so a cached arm would
      // be green at every hour of the day and this guard would assert nothing.
      HR_PGLITE_CACHE: '0',
    },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status, out };
}


/* S-UM-1 (security review 2026-09-20). A chain whose ONE mutated file is a real
   file and whose other 200 are symlinks to the tracked ones — built in the OS
   temp directory, handed to the child through HR_MIGRATIONS_DIR, and removed
   afterwards. The tracked migration is never opened for writing, so there is no
   window in which a `raise exception` is sitting inside a checked-in migration
   on the machine that also applies to production, and no `finally` that a
   SIGKILL can skip. `assertChainIntact()` is the standing proof of that. */
function withPlantedChain(text, run) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-utc-chain-'));
  try {
    for (const f of readdirSync(MIGDIR)) {
      if (f === MIG_NAME) writeFileSync(join(dir, f), text, 'utf8');
      else symlinkSync(join(MIGDIR, f), join(dir, f));
    }
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* The tracked file must be byte-identical to what it was when this run began.
   It is the regression for the defect above: plant into MIGRATION again and
   this is red. */
const CHAIN_AT_START = readFileSync(MIGRATION, 'utf8');
function assertChainIntact(where) {
  if (readFileSync(MIGRATION, 'utf8') === CHAIN_AT_START) return true;
  console.error(`  HARNESS: ${MIG_NAME} was MODIFIED ON DISK (${where}). A probe belongs in a copy, `
    + 'never in a tracked migration — see S-UM-1.');
  harness = 1;
  return false;
}

/* Plant a probe, replay once, read the fixture's own now() out of the failure,
   restore byte-for-byte. Returns the seconds between process start and the
   moment the §4 block's transaction timestamp is taken. */
function probeFixtureDelay() {
  const shim = readFileSync(join(HERE, '_utc-clock-shim.mjs'), 'utf8');
  if (!shim.includes("'2026-09-18T00:00:00.000Z'")) {
    return { err: 'the clock shim no longer parks at 2026-09-18T00:00:00Z — SHIM_MIDNIGHT is stale' };
  }
  const original = readFileSync(MIGRATION, 'utf8');
  const at = original.indexOf(F5_MARK);
  if (at < 0) return { err: `could not find the GATE(f5) marker to plant the probe in ${MIGRATION}` };
  const planted = original.slice(0, at) + PROBE_SQL + original.slice(at);
  const out = withPlantedChain(planted, (dir) => replayAt(PROBE_OFFSET, dir).out);
  if (!assertChainIntact('after the probe')) return { err: 'the tracked migration was written to' };
  // Postgres renders the timestamp in the SESSION's TimeZone, which on a dev box
  // is the host zone (`… 19:30:06.613-06`), not UTC — so the zone offset is part
  // of what is parsed, never assumed.
  const m = out.match(/HRPROBE now=(\d{4}-\d{2}-\d{2})[ T]([\d:.]+)([+-]\d{2})(?::?(\d{2}))?/);
  if (!m) return { err: 'the probe did not report a timestamp (is the §4 block still reached?)' };
  const seen = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] || '00'}`);
  if (!Number.isFinite(seen)) return { err: `unparseable probe timestamp: ${m[0]}` };
  return { delay: (seen - (SHIM_MIDNIGHT + PROBE_OFFSET * 1000)) / 1000 };
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
  const probe = probeFixtureDelay();
  if (probe.err) {
    console.error(`  HARNESS: ${probe.err}`);
    harness = 1;
    return;
  }
  console.log(`  ..    probed: the §4 block takes its transaction timestamp ${probe.delay.toFixed(2)} s after process start\n`);
  for (const k of SWEEP) {
    const r = replayAt(k - probe.delay);
    ok(`the fixture runs at midnight ${k >= 0 ? '+' : '−'}${Math.abs(k)} s`,
      r.code === 0, r.code === 0 ? '' : `→ ${firstGateLine(r.out)}`);
  }
  for (const arm of ARMS.filter((a) => a.window)) {
    const r = replayAt(arm.off);
    ok(arm.name, r.code === 0, r.code === 0 ? '' : `→ ${firstGateLine(r.out)}`);
  }
}

/* Plant `find` → `replace`, replay at the given offsets, restore byte-for-byte.
   Returns the two results, or sets `harness` if the mutation could not be planted
   or the file could not be put back. */
function mutate(find, replace, offsets) {
  const original = readFileSync(MIGRATION, 'utf8');
  if (!original.includes(find)) {
    console.error(`  HARNESS: could not find \`${find.slice(0, 60)}…\` to mutate in ${MIGRATION}`);
    harness = 1;
    return null;
  }
  const planted = original.split(find).join(replace);
  const res = withPlantedChain(planted, (dir) => offsets.map((o) => replayAt(o, dir)));
  assertChainIntact('after a mutation arm');
  return res;
}

async function selftest() {
  console.log('\nUTC MIDNIGHT REPLAY — MUTATION PROOF\n');
  const probe = probeFixtureDelay();
  if (probe.err) {
    console.error(`  HARNESS: ${probe.err}`);
    harness = 1;
    return;
  }
  // A few seconds INTO the day: the stamps are day-clamped and the cap is small,
  // which is exactly where a fixture that had gone soft would stop biting.
  const boundary = 2 - probe.delay;

  const clamp = mutate(CLAMPED, UNCLAMPED, [boundary, 3600]);
  if (clamp) {
    ok('un-anchoring every §4 stamp turns the just-after-midnight arm RED',
      clamp[0].code !== 0, clamp[0].code !== 0 ? `→ ${firstGateLine(clamp[0].out)}` : '(it stayed green)');
    ok('...and the 01:00 UTC control stays GREEN (a clock guard, not a broken one)',
      clamp[1].code === 0, clamp[1].code === 0 ? '' : `→ ${firstGateLine(clamp[1].out)}`);
  }

  const s1 = mutate(S1_FIX, S1_DEFECT, [boundary, 3600]);
  if (s1) {
    ok('the S1 defect (a zero-claim call forgives the settle) is RED just after midnight',
      s1[0].code !== 0, s1[0].code !== 0 ? `→ ${firstGateLine(s1[0].out)}` : '(it stayed green)');
    ok('...and RED at 01:00 too — the day-anchored fixtures still assert the economy property',
      s1[1].code !== 0, s1[1].code !== 0 ? `→ ${firstGateLine(s1[1].out)}` : '(it stayed green)');
  }
}

if (process.argv.includes('--selftest')) await selftest();
else await base();

if (harness) { console.error('\nHARNESS FAILURE\n'); process.exit(2); }
if (bad) { console.error(`\n${bad} red\n`); process.exit(1); }
console.log('\ngreen\n');
