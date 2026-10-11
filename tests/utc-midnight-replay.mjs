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
// chain replay with an INJECTED clock: file i of the chain begins its
// transaction at exactly (arm offset + i ms) past a UTC midnight, whatever the
// machine is doing. HR_PGLITE_CACHE=0 on every arm, deliberately: a snapshot restore
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
// ⚠ (HISTORY — superseded 2026-10-11, see LOAD below.) THE ARMS ARE TIMED FROM THE FIXTURE, NOT FROM PROCESS START (security
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
// ⚠ LOAD (2026-10-11, lane fix-utc-midnight-flake). Two Security reviews on
// 2026-10-10/11 saw ONE sweep arm red ("the fixture runs at midnight −2 s →",
// then +0 s / +5 s on another lane) on a heavily loaded machine; alone it was
// green every time. Root cause: the clock was an OFFSET of the real one,
// advancing at wall speed from process start, and the probe that converted
// "fixture seconds" into that offset was measured in ONE replay and spent on
// the next. Under load the replay before the fixture stretched (12.9 s idle on
// this box, much longer loaded) and every file after it straddled the boundary
// at load-dependent instants, so an arm's verdict depended on the machine — and
// a child that died, or failed with no GATE line, printed a bare "→".
// Now the clock is injected per file (no wall-clock read anywhere in the time
// the database is served), the probe is an ASSERTION that the injected instant
// reached the fixture to the millisecond, every arm proves its clock through
// the shim's HRCLOCK line (missing or short = HARNESS, never green), and every
// red names exit code, signal, spawn error, the file that refused and its line.
//
// Exit: 0 green · 1 the chain cannot rebuild at some hour of the day ·
//       2 harness (the control arm failed, or a mutation could not be planted).
//
// No credentials; production untouched.
// ════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

/* (HISTORY, superseded 2026-10-11 by the injected clock — kept for the record.)
   WHERE THE FIXTURE ACTUALLY RUNS. The arms are parked relative to a UTC
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
/* 2026-10-11: the probe is no longer a MEASUREMENT spent on a later replay (that
   was the load dependence); it is an ASSERTION that the injected instant reached
   the fixture: the GATE(f5) transaction must read back the pin the shim set for
   this file, to under a millisecond. */
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
   moment of it. The label is EXACT since 2026-10-11: the arm offset puts the
   target file's transaction on second k to the millisecond, and file i of the
   chain on k + (i − target) ms, so every arm also replays EVERY file of the
   chain within ±0.3 s of that second — on any machine, at any load. (Before,
   the label was only the intended second: ~1.2 s of jitter idle, tens of
   seconds loaded.) */
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

function replayAt(offsetSeconds, migDir = MIGDIR, extraEnv = {}) {
  const r = spawnSync(process.execPath, ['--import', SHIM, REPLAY], {
    cwd: ROOT,
    encoding: 'utf8',
    // The default 1 MiB would kill a chatty child with ENOBUFS mid-replay and
    // read as a red arm. No timeout, deliberately: a deadline is a load
    // dependence; the CI job's own budget bounds a genuine hang.
    maxBuffer: 256 * 1024 * 1024,
    env: {
      ...process.env,
      HR_MIGRATIONS_DIR: migDir,
      HR_FAKE_UTC_OFFSET_S: String(offsetSeconds),
      HR_FAKE_UTC_TARGET: MIG_NAME,
      // A restored snapshot never replays the chain, so a cached arm would
      // be green at every hour of the day and this guard would assert nothing.
      HR_PGLITE_CACHE: '0',
      ...extraEnv,
    },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const m = out.match(/HRCLOCK pins=(\d+) first=(\S+) last=(\S+) target=([^#\s]*)#(-?\d+)@(\S+)/);
  const clock = m
    ? { pins: Number(m[1]), targetIndex: Number(m[5]), targetAt: m[6] === '-' ? null : Date.parse(m[6]) }
    : null;
  return { code: r.status, signal: r.signal, error: r.error, out, clock };
}

/* Why a replay is not green, in words — NEVER an empty string. A red arm used
   to print `→ ${firstGateLine(out)}`, which is blank when the child died with
   no output (killed, spawn failure, ENOBUFS): the bare "→" both 2026-10-10/11
   reports carried. */
function describe(r) {
  const why = [];
  if (r.error) why.push(`spawn error ${r.error.code || ''} ${r.error.message}`.replace(/\s+/g, ' ').trim());
  if (r.signal) why.push(`killed by ${r.signal}`);
  if (r.code !== 0 && r.code !== null && r.code !== undefined) why.push(`exit ${r.code}`);
  if ((r.code === null || r.code === undefined) && !r.signal && !r.error) why.push('no exit status');
  const refused = r.out.match(/(\S+\.sql) failed to apply: ([^\n]*)/);
  if (refused) why.push(`${refused[1]} refused: ${refused[2].slice(0, 200)}`);
  else {
    const gate = r.out.match(/GATE\([^)]*\)[^\n]*/);
    const tail = r.out.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('HRCLOCK')).pop();
    why.push(gate ? gate[0].slice(0, 200) : tail ? `last output: ${tail.slice(0, 200)}` : 'the child printed nothing');
  }
  if (!r.clock) why.push('no HRCLOCK line (the clock shim never reported)');
  else if (!r.clock.pins || r.clock.targetAt === null) {
    why.push(`the injected clock never reached the chain (HRCLOCK pins=${r.clock.pins}, `
      + `${MIG_NAME} ${r.clock.targetAt === null ? 'never pinned' : 'pinned'})`);
  }
  return why.join(' · ');
}

let CHAIN_LEN = 0;     // set from the control arm, which must pin every file
/* GREEN = exit 0 AND the injected clock demonstrably reached every file.
   RED   = the replay itself reported a verdict about the chain: a file refused
           to apply, or the rebuilt schema drifted from the baseline.
   HARNESS (exit 2) = anything else — a child killed from outside, a spawn
           failure, a crash with no verdict in it. MEASURED 2026-10-11 on this
           lane's own 20× run: arm "+0 s" of run 5 died with exit 143 (SIGTERM,
           the whole process tree, from outside this guard on a shared box) and
           printed nothing — the bare "→" of the two Security reports. A killed
           replay says nothing about the chain, so it must never read as "the
           chain cannot rebuild at midnight"; it still fails the run, loudly. */
const CHAIN_VERDICT = /failed to apply: |SCHEMA DRIFT: /;
function verdict(r, label, { expectHarness = false } = {}) {
  if (r.code !== 0) {
    if (CHAIN_VERDICT.test(r.out)) return 'red';
    if (expectHarness) return 'harness';
    console.error(`  HARNESS: ${label} — the replay ended without a verdict about the chain: ${describe(r)}`);
    harness = 1;
    return 'harness';
  }
  const c = r.clock;
  if (!c || c.pins === 0 || c.targetAt === null || (CHAIN_LEN && c.pins !== CHAIN_LEN)) {
    if (expectHarness) return 'harness';
    const seen = c ? `pins=${c.pins} of ${CHAIN_LEN || '?'}, target ${c.targetAt === null ? 'never pinned' : 'pinned'}` : 'no HRCLOCK line';
    console.error(`  HARNESS: ${label} exited 0 but the injected clock did not reach the chain (${seen}) — `
      + 'this replay ran on an unknown clock and proves nothing.');
    harness = 1;
    return 'harness';
  }
  return 'green';
}


/* S-UM-2 (this fix, Windows-only red measured 2026-09-23). An unprivileged
   Windows process cannot create a file symlink (EPERM) — `symlinkSync` never
   reaches the fallback, it just throws, so every machine that isn't running
   elevated or in Developer Mode died here on every replay. HR_UTC_PLANT=copy
   forces the fallback unconditionally (used by the gate that proves the copy
   path itself, and by the corruption proof below, where a symlink would write
   THROUGH to the tracked file — see S-UM-1). Auto mode tries the symlink first
   (cheap, and what S-UM-1 was written for) and only falls back on the specific
   errors a permissions/feature refusal raises; anything else still throws. */
function plantFile(src, dest, mode) {
  if (mode !== 'copy') {
    try {
      symlinkSync(src, dest);
      return;
    } catch (e) {
      if (!['EPERM', 'EACCES', 'EINVAL'].includes(e.code)) throw e;
    }
  }
  copyFileSync(src, dest);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/* THE PROPERTY EITHER PLANT PATH MUST KEEP: the chain the replay boots from is
   byte-identical to the repo chain, file for file — a copy is not allowed to
   drift from what a symlink would have served. Checked by size first (cheap,
   catches most corruption without hashing) and then by sha256, once per file,
   every plant, on both paths — never only on the symlink path a Windows box
   can't take. */
function verifyPlantedChain(dir, migNameText) {
  for (const f of readdirSync(dir)) {
    const source = f === MIG_NAME ? Buffer.from(migNameText, 'utf8') : readFileSync(join(MIGDIR, f));
    const planted = readFileSync(join(dir, f));
    if (planted.length !== source.length || sha256(planted) !== sha256(source)) {
      return { ok: false, file: f };
    }
  }
  return { ok: true };
}

/* S-UM-1 (security review 2026-09-20). A chain whose ONE mutated file is a real
   file and whose other 200 are planted from the tracked ones — built in the OS
   temp directory, handed to the child through HR_MIGRATIONS_DIR, and removed
   afterwards. The tracked migration is never opened for writing, so there is no
   window in which a `raise exception` is sitting inside a checked-in migration
   on the machine that also applies to production, and no `finally` that a
   SIGKILL can skip. `assertChainIntact()` is the standing proof of that. */
function withPlantedChain(text, run) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-utc-chain-'));
  const mode = process.env.HR_UTC_PLANT === 'copy' ? 'copy' : 'auto';
  try {
    for (const f of readdirSync(MIGDIR)) {
      if (f === MIG_NAME) writeFileSync(join(dir, f), text, 'utf8');
      else plantFile(join(MIGDIR, f), join(dir, f), mode);
    }
    const check = verifyPlantedChain(dir, text);
    if (!check.ok) {
      console.error(`  HARNESS: planted chain diverged from its source at ${check.file} (mode=${mode}) — S-UM-2.`);
      harness = 1;
      return undefined;
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

/* Plant a probe, replay once, read the fixture's own now() out of the failure.
   Returns the target file's chain index and how far the fixture's now() sat
   from the shim's pin for it — which must be under a millisecond (an
   assertion, not a calibration). */
function probeFixtureDelay() {
  const shim = readFileSync(join(HERE, '_utc-clock-shim.mjs'), 'utf8');
  if (!shim.includes("'2026-09-18T00:00:00.000Z'")) {
    return { err: 'the clock shim no longer parks at 2026-09-18T00:00:00Z — SHIM_MIDNIGHT is stale' };
  }
  const original = readFileSync(MIGRATION, 'utf8');
  const at = original.indexOf(F5_MARK);
  if (at < 0) return { err: `could not find the GATE(f5) marker to plant the probe in ${MIGRATION}` };
  const planted = original.slice(0, at) + PROBE_SQL + original.slice(at);
  const pr = withPlantedChain(planted, (dir) => replayAt(PROBE_OFFSET, dir));
  const out = pr && pr.out;
  if (out === undefined) return { err: 'the planted chain failed its byte-identity check — see S-UM-2 above' };
  if (!assertChainIntact('after the probe')) return { err: 'the tracked migration was written to' };
  // Postgres renders the timestamp in the SESSION's TimeZone, which on a dev box
  // is the host zone (`… 19:30:06.613-06`), not UTC — so the zone offset is part
  // of what is parsed, never assumed.
  const m = out.match(/HRPROBE now=(\d{4}-\d{2}-\d{2})[ T]([\d:.]+)([+-]\d{2})(?::?(\d{2}))?/);
  if (!m) return { err: `the probe did not report a timestamp (is the §4 block still reached?) — ${describe(pr)}` };
  if (!pr.clock || pr.clock.targetAt === null) return { err: `the shim never pinned ${MIG_NAME} — ${describe(pr)}` };
  const seen = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] || '00'}`);
  if (!Number.isFinite(seen)) return { err: `unparseable probe timestamp: ${m[0]}` };
  const pin = SHIM_MIDNIGHT + PROBE_OFFSET * 1000 + pr.clock.targetIndex;
  if (pr.clock.targetAt !== pin) return { err: `the shim pinned ${MIG_NAME} at ${pr.clock.targetAt}, expected ${pin}` };
  const skew = (seen - pin) / 1000;
  if (!(skew >= 0 && skew < 0.001)) {
    return { err: `the fixture read now() ${skew.toFixed(6)} s from its injected pin — the clock is NOT injected `
      + "(a real-time read, or a pin that does not immediately precede the file's begin)" };
  }
  return { index: pr.clock.targetIndex, skew };
}

async function base() {
  console.log('\nUTC MIDNIGHT REPLAY — the chain must rebuild at every hour of the day\n');
  const control = ARMS.find((a) => !a.window);
  const c = replayAt(control.off);
  if (c.code !== 0 || !c.clock || !c.clock.pins || c.clock.targetAt === null) {
    console.error(`  HARNESS: the ${control.name} arm is not green, so no in-window red means anything.`);
    console.error(`           ${describe(c)}`);
    harness = 1;
    return;
  }
  CHAIN_LEN = c.clock.pins;
  ok(control.name, true, `(${CHAIN_LEN} files, each on an injected clock)`);
  const probe = probeFixtureDelay();
  if (probe.err) {
    console.error(`  HARNESS: ${probe.err}`);
    harness = 1;
    return;
  }
  console.log(`  ..    probed: the §4 block (file #${probe.index}) reads now() ${Math.round(probe.skew * 1e6)} µs after its injected pin\n`);
  // The arm offset puts the TARGET file exactly on k; file i sits at k + (i − index) ms.
  const arm = (label, off) => {
    const r = replayAt(off);
    const v = verdict(r, label);
    if (v !== 'harness') ok(label, v === 'green', v === 'green' ? '' : `→ ${describe(r)}`);
  };
  for (const k of SWEEP) arm(`the fixture runs at midnight ${k >= 0 ? '+' : '−'}${Math.abs(k)} s`, k - probe.index / 1000);
  for (const a of ARMS.filter((x) => x.window)) arm(a.name, a.off);
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
  const boundary = 2 - probe.index / 1000;

  /* A red in a mutation arm must be the FIXTURE's red — a GATE raised by the
     mutated file — never a crash, which would read as "caught" for any reason. */
  const caughtBy = (r) => {
    if (r.code === 0) return false;
    const m = r.out.match(/(\S+\.sql) failed to apply: ([^\n]*)/);
    return !!m && m[1] === MIG_NAME && /GATE\(/.test(m[2]);
  };
  const clamp = mutate(CLAMPED, UNCLAMPED, [boundary, 3600]);
  if (clamp) {
    ok('un-anchoring every §4 stamp turns the just-after-midnight arm RED with a fixture GATE',
      caughtBy(clamp[0]), `→ ${clamp[0].code !== 0 ? describe(clamp[0]) : '(it stayed green)'}`);
    ok('...and the 01:00 UTC control stays GREEN (a clock guard, not a broken one)',
      clamp[1].code === 0, clamp[1].code === 0 ? '' : `→ ${describe(clamp[1])}`);
  }

  const s1 = mutate(S1_FIX, S1_DEFECT, [boundary, 3600]);
  if (s1) {
    ok('the S1 defect (a zero-claim call forgives the settle) is RED just after midnight',
      caughtBy(s1[0]), `→ ${s1[0].code !== 0 ? describe(s1[0]) : '(it stayed green)'}`);
    ok('...and RED at 01:00 too — the day-anchored fixtures still assert the economy property',
      caughtBy(s1[1]), `→ ${s1[1].code !== 0 ? describe(s1[1]) : '(it stayed green)'}`);
  }

  /* 2026-10-11: THE CLOCK-INJECTION PROOF. A replay whose pins never land (the
     seam in schema-replay.mjs removed or bypassed) must be classified HARNESS,
     not green — otherwise a refactor silently turns every arm back into a
     load-dependent replay. Run on the real chain with the shim told to drop its
     pins; `verdict` must refuse it (with the harness flag left alone, because
     here the refusal IS the expected outcome). */
  {
    const r = replayAt(3600, MIGDIR, { HR_FAKE_UTC_DROP_PINS: '1' });
    const v = verdict(r, 'the pin-dropped replay', { expectHarness: true });
    ok('a replay whose clock pins never land is a HARNESS failure, never a green arm',
      v === 'harness', v === 'harness' ? '' : `(verdict: ${v} — ${describe(r)})`);
    const killed = { code: 143, signal: null, error: undefined, out: '', clock: null };
    const blank = describe(killed);
    ok('a child that dies silently is described in words, never a bare "→"',
      /exit 143/.test(blank) && /printed nothing/.test(blank), `→ ${blank}`);
    ok('...and is a HARNESS failure, never a red verdict about the chain',
      verdict(killed, 'the killed replay', { expectHarness: true }) === 'harness');
    const refused = { code: 1, out: '\n  x.sql failed to apply: GATE(z): boom\n', clock: null };
    ok('...while a replay that reports a refused file IS red',
      verdict(refused, 'the refused replay') === 'red');
  }

  // S-UM-2 mutation proof (this fix). Planted with mode='copy' explicitly —
  // never 'auto' — so the byte we flip lands in a temp COPY, never through a
  // symlink back into a tracked migration (that hazard is S-UM-1, above).
  {
    const dir = mkdtempSync(join(tmpdir(), 'hr-utc-chain-selftest-'));
    try {
      for (const f of readdirSync(MIGDIR)) {
        if (f === MIG_NAME) writeFileSync(join(dir, f), CHAIN_AT_START, 'utf8');
        else plantFile(join(MIGDIR, f), join(dir, f), 'copy');
      }
      const clean = verifyPlantedChain(dir, CHAIN_AT_START);
      ok('a freshly planted chain (copy mode) is byte-identical to its source', clean.ok,
        clean.ok ? '' : `→ diverged at ${clean.file}`);

      const victim = readdirSync(dir).find((f) => f !== MIG_NAME);
      const p = join(dir, victim);
      const buf = readFileSync(p);
      buf[0] ^= 0xff;
      writeFileSync(p, buf);
      const corrupted = verifyPlantedChain(dir, CHAIN_AT_START);
      ok(`a one-byte flip in a planted file (${victim}) turns the byte-identity assertion RED`,
        !corrupted.ok, corrupted.ok ? '(it stayed green — S-UM-2 regression)' : `→ diverged at ${corrupted.file}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

if (process.argv.includes('--selftest')) await selftest();
else await base();

if (harness) { console.error('\nHARNESS FAILURE\n'); process.exit(2); }
if (bad) { console.error(`\n${bad} red\n`); process.exit(1); }
console.log('\ngreen\n');
