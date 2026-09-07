#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/cron-health.mjs — THE ALARMS CAN FIRE, AND ONLY WHEN THEY SHOULD.
//                         GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/cron-health.mjs             # the guard
//   node tests/cron-health.mjs --list      # the mutation catalogue
//   node tests/cron-health.mjs --selftest  # every mutation must be CAUGHT
//   node tests/cron-health.mjs --mutate=<id>
//   node tests/cron-health.mjs --plant=<id>  # a HARNESS defect; must abort loudly
//
// EXIT CODES:  0 green · 1 a property failed / a mutation was missed ·
//              2 HARNESS FAULT — the harness could not take its own measurement,
//                so NOTHING was graded. Not a repo failure; re-run alone.
//
// Ships with: supabase/migrations/2026-09-03-cron-health-generalized.sql
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
// The migration it guards exists because hr_cron_health alarmed on ONE
// hardcoded table. The failure mode being fixed — b319 — was not "the detector
// was wrong", it was "the retention job ran 100 times, deleted 0 rows every
// time, and read as green". Its own migration says it: **a policy that cannot
// fire is worse than no policy, because the dashboard reads as covered.**
//
// So the load-bearing assertion here is not "the function runs". It is that
// every ARM produces an alert when its condition is met, produces NONE when it
// is not, and that the sensitivity seam which makes the first half testable
// cannot be turned into an off switch.
//
// ── WHAT IT DRIVES ──────────────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json in PGlite (real
// PostgreSQL, in process). Two pieces of scaffolding, both stated rather than
// smuggled:
//   · `cron.job_run_details` — the replay fixture models cron.job and
//     schedule/unschedule but NOT the run history table, so (a)/(b)/(g) are
//     inert there. Created here with pg_cron's real column shape so the
//     never-ran escalation can be exercised at all.
//   · Synthetic hr_db_samples rows, back-dated, to give the 24h rate window
//     something to measure. A rate cannot be tested by waiting a day.
//   · `ANALYZE` before anything is sampled: the sample's ROW half reads
//     pg_stat_all_tables.n_live_tup, and cumulative stats do not survive a
//     restore of a cached data directory (see the note at the call site).
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · A REAL 400 MB database or a REAL exhausted connection pool. The arms are
//     exercised at a scaled fuse; the arithmetic is the same arithmetic.
//   · pg_cron's real scheduler.
//   · That an operator ever reads maintenance_alerts. That is an ops question
//     and this file cannot answer it.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-03-cron-health-generalized.sql';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── HARNESS FAULT vs. PROPERTY FAILURE ────────────────────────────────────
   REPORTED 2026-09-07: H4's row-delta arm went red twice — "produced 0
   alert(s), expected at least 1" — while two worktree suites ran side by side
   (another lane took `Array buffer allocation failed` from PGlite in the same
   minute), and green when run alone. MEASURED here, which is a different and
   worse story: the arm's input was `player_ledger` gaining rows, `r` came from
   `pg_stat_all_tables.n_live_tup`, and n_live_tup measured 3 after a COLD
   replay and 0 after a template RESTORE — PostgreSQL discards cumulative
   statistics on recovery, and loading a cached data directory is a recovery.
   The arm was therefore firing on a cache MISS and silently reporting "0
   alerts" on a HIT. Memory pressure is one way to land on that path; it was
   never the property failing. Fixed at the source by the ANALYZE scaffold.

   The reason it could read as a property failure is structural. The arm needs
   TWO samples: a synthetic 24h-old row this file inserts, and a REAL one that
   `hr_cron_health` takes for itself by calling `hr_db_sample(10)`. The second
   one contributes `r` from `pg_stat_all_tables.n_live_tup` — a stats-collector
   value, not a count(*) — for the top ten tables by size. If that second
   sample is not taken, or comes back with no tables, or comes back with a null
   `r`, then `v_rows - prev.r` is `0 - 0`, the arm correctly does not fire, and
   the assertion below reports the DETECTOR as broken. That is decoration: the
   guard's own sample step failed and the message blames the migration.

   So every sample the arm consumes is asserted BEFORE the arm is graded, and a
   sample that did not arrive throws a `HARNESS:` error naming the step. Loud,
   distinct exit code 2, never a ✗ against the detector. `--plant=` proves the
   rejection path fires; a rejection path that has never fired is a hope. */
class HarnessError extends Error {
  constructor(step, why) {
    super(`HARNESS: ${step} — ${why}`);
    this.harness = true;
    this.step = step;
  }
}
/* An allocation failure is the machine, not the repo. REPRODUCED 2026-09-07 by
   running this guard six times back to back beside another lane's suite:
   `RangeError: WebAssembly.Memory(): could not allocate memory` came out of
   PGlite.create inside bootReplay, unflagged, and exited 1 — indistinguishable
   from "a property failed" to anything reading the exit code. It is a harness
   fault and it exits 2. (A hard V8 `Fatal process out of memory` kills the
   process outright; nothing in JS can label that one.) */
const ALLOC_FAULT = /could not allocate|allocation failed|out of memory|WebAssembly\.Memory|Aborted\(/i;
const isHarness = (e) => !!(e && (e.harness === true
  || /^HARNESS:/.test(String(e.message || ''))
  || ALLOC_FAULT.test(String(e.message || ''))));
const harness = (step, why) => { throw new HarnessError(step, why); };

/** A count that is present, finite and non-negative — `null`, `undefined`,
 *  `NaN` and a non-numeric string are all "not measured", not "zero". */
const measured = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Assert one hr_db_samples row is a sample that was actually TAKEN: a row
 * exists, it has a clock and a database size, it names at least one table, and
 * every table it names carries a byte count AND a row count that are present
 * and non-NaN. Throws HarnessError naming the step; returns the parsed tables.
 */
function assertSample(step, row, { requireTables = [] } = {}) {
  if (!row) harness(step, 'no sample row — hr_db_sample did not insert one (the second sample '
    + 'could not be taken; nothing was measured, so nothing below is gradeable)');
  if (!row.at) harness(step, 'the sample row has no `at` timestamp');
  if (measured(row.db_bytes) === null || Number(row.db_bytes) <= 0) {
    harness(step, `the sample recorded db_bytes=${JSON.stringify(row.db_bytes)} — pg_database_size `
      + 'did not produce a size');
  }
  const tables = row.tables && typeof row.tables === 'object' ? row.tables : null;
  if (!tables) harness(step, `the sample's \`tables\` is ${JSON.stringify(row.tables)}, not an object`);
  const names = Object.keys(tables);
  if (!names.length) harness(step, 'the sample named ZERO tables — hr_db_sample observed nothing');
  const out = new Map();
  for (const t of names) {
    const b = measured(tables[t]?.b);
    const r = measured(tables[t]?.r);
    if (b === null || r === null) {
      harness(step, `table "${t}" was sampled with b=${JSON.stringify(tables[t]?.b)} `
        + `r=${JSON.stringify(tables[t]?.r)} — a missing/NaN count is NOT a count of zero. `
        + '(n_live_tup unavailable is the shape this takes under memory pressure.)');
    }
    out.set(t, { b, r });
  }
  for (const t of requireTables) {
    if (!out.has(t)) {
      harness(step, `"${t}" is not in this sample (${names.join(', ')}). The arm compares the two `
        + 'samples table by table, so it cannot fire for a reason that is not the property.');
    }
  }
  return out;
}

/* ── PLANTED HARNESS DEFECTS ───────────────────────────────────────────────
   Each replaces hr_db_sample with a version that models one way the SECOND
   sample fails to arrive, installed immediately before H4 takes it. Every one
   of them leaves the detector raising ZERO row alerts without any error — i.e.
   each reproduces exactly the red H4 saw — and must be reported as a HARNESS
   fault, never as "the arm did not fire". */
const PLANTS = {
  /* The one plant that never reaches the database: a RAW PGlite allocation
     failure, thrown exactly as it arrives from PGlite.create — unflagged, with
     no `harness` property. Verbatim from the reproduction above; it must be
     classified as a harness fault by its MESSAGE, or the machine running out of
     memory reads as this repo's detector being broken. */
  alloc_failure_from_pglite: {
    why: 'PGlite cannot allocate its WASM heap (a co-resident suite took the memory). The error is '
       + 'an ordinary RangeError with no marker on it; classifying it is the only thing standing '
       + 'between "the machine is busy" and "the alarm arm is dead".',
    expect: /could not allocate memory/i,
    beforeBoot: () => { throw new RangeError('WebAssembly.Memory(): could not allocate memory'); },
  },
  second_sample_missing: {
    why: 'hr_db_sample returns an all-NULL row and inserts nothing: the second sample was never '
       + 'taken. Every arm then compares against NULL, fires nothing, and raises no error.',
    expect: /no sample row|second sample/i,
    sql: `create or replace function public.hr_db_sample(p_top int default 10)
          returns public.hr_db_samples language plpgsql security definer
          set search_path = public, pg_catalog as $plant$
          declare v_row public.hr_db_samples%rowtype;
          begin return v_row; end $plant$;`,
  },
  second_sample_empty: {
    why: 'the sample row arrives but names ZERO tables (the per-table query produced nothing). '
       + 'jsonb_each over an empty object loops zero times, so every per-table arm is silent.',
    expect: /ZERO tables/i,
    sql: `create or replace function public.hr_db_sample(p_top int default 10)
          returns public.hr_db_samples language plpgsql security definer
          set search_path = public, pg_catalog as $plant$
          declare v_row public.hr_db_samples%rowtype;
          begin
            insert into public.hr_db_samples (at, db_bytes, max_conns, used_conns, tables, jobs)
            values (now(), pg_database_size(current_database()), 60, 1,
                    '{}'::jsonb, '{}'::jsonb)
            on conflict (at) do update set db_bytes = excluded.db_bytes
            returning * into v_row;
            return v_row;
          end $plant$;`,
  },
  second_sample_rows_unmeasured: {
    why: 'the sample arrives with byte counts but a NULL row count for every table — the shape '
       + 'n_live_tup takes when the stats collector has not reported. The migration coalesces it '
       + 'to 0, the row delta is 0-0, and H4 reads as "the arm did not fire".',
    expect: /is NOT a count of zero|r=null/i,
    sql: `create or replace function public.hr_db_sample(p_top int default 10)
          returns public.hr_db_samples language plpgsql security definer
          set search_path = public, pg_catalog as $plant$
          declare v_row public.hr_db_samples%rowtype; v_tables jsonb;
          begin
            select coalesce(jsonb_object_agg(t.relname, jsonb_build_object('b', t.bytes, 'r', null)),
                            '{}'::jsonb) into v_tables
              from (select c.relname::text as relname, pg_total_relation_size(c.oid) as bytes
                      from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind in ('r','m','p')
                     order by pg_total_relation_size(c.oid) desc
                     limit greatest(1, coalesce(p_top, 10))) t;
            insert into public.hr_db_samples (at, db_bytes, max_conns, used_conns, tables, jobs)
            values (now(), pg_database_size(current_database()), 60, 1, v_tables, '{}'::jsonb)
            on conflict (at) do update set db_bytes = excluded.db_bytes
            returning * into v_row;
            return v_row;
          end $plant$;`,
  },
};

const MUTATIONS = {
  fuse_scale_unclamped: {
    why: 'the sensitivity scale loses its `least(1.0, …)` clamp, so a caller can RAISE every fuse — '
       + 'i.e. the seam that exists to make the alarms testable becomes a way to switch the whole '
       + 'detector off. H3 must catch it.',
    find: '  c_scale constant numeric := least(1.0, greatest(0.000000001, coalesce(p_scale, 1.0)));',
    repl: '  c_scale constant numeric := greatest(0.000000001, coalesce(p_scale, 1.0));',
  },
  table_arm_hardcoded_again: {
    why: 'the per-table arm is narrowed back to game_events — the exact b319-shaped defect this '
       + 'migration exists to remove: the table that already burned us is watched and every other '
       + 'one is not. H2 must catch it.',
    find: '    if v_bytes > c_tbl_warn then',
    repl: "    if v_bytes > c_tbl_warn and r.relname = 'game_events' then",
  },
  growth_not_measured: {
    why: 'the database growth arm is removed, leaving only absolute size — which is the signal that '
       + 'arrives LAST. b319 ran at ~57 MB/day for four days before it was large. H4 must catch it.',
    find: '    if v_delta > c_db_growth_warn then',
    repl: '    if false and v_delta > c_db_growth_warn then',
  },
  rows_not_measured: {
    why: 'the per-table ROW delta arm is removed. Rows and bytes are not the same signal — a table '
       + 'of small rows can gain a million a day without moving the byte fuse. H4 must catch it.',
    find: '      if v_delta > c_rows_warn then',
    repl: '      if false and v_delta > c_rows_warn then',
  },
  never_ran_never_escalates: {
    why: 'a job that has NEVER run stays `info` forever — the pre-existing hole this file closes. '
       + 'A mis-scheduled job would look identical to a brand-new one for a month. H7 must catch it.',
    find: '        if v_first is not null and v_first < now() - c_never_ran_grace then',
    repl: '        if false and v_first is not null and v_first < now() - c_never_ran_grace then',
  },
  samples_never_pruned: {
    why: 'the sample table stops pruning — a monitoring table that grows without bound is the joke '
       + 'version of the bug being monitored. H5 must catch it.',
    find: "  delete from public.hr_db_samples where at < now() - interval '30 days';",
    repl: '  -- (mutation: retention removed)',
  },
  open_alerts_pruned: {
    why: 'the alert prune drops its `acked_at is not null` condition, so an OPEN alert nobody has '
       + 'seen is deleted by a timer. An unacknowledged alarm must never expire. H5 must catch it.',
    find: '  delete from public.maintenance_alerts\n   where acked_at is not null and created_at < now()',
    repl: '  delete from public.maintenance_alerts\n   where created_at < now()',
  },
  samples_client_readable: {
    why: 'the sample table keeps the client SELECT its default ACL gives it. It names every table '
       + 'in the database and how fast each is growing — an enumeration surface with a growth chart '
       + 'attached. H6 must catch it without leaning on the migration\'s own assertion.',
    pairs: [
      ['revoke all on table public.hr_db_samples from anon, authenticated;',
        '-- (mutation: the client revoke is gone)'],
      ["  if has_table_privilege('anon', 'public.hr_db_samples', 'select')\n"
        + "     or has_table_privilege('authenticated', 'public.hr_db_samples', 'select') then",
        '  if false then'],
    ],
  },
};

async function run(mutate, plant) {
  const patches = mutate
    ? new Map([[MIG, MUTATIONS[mutate].pairs
        || [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  /* The chain is rebuilt through bootReplay, which shares the snapshot template
     in tests/pglite-template.mjs — one PGlite instance per run, and the eight
     mutations here all patch the SAME file, so the unpatched prefix is built
     once and restored seven times. There is deliberately no second PGlite and
     no second full replay in this file; that is the memory budget. The instance
     is CLOSED in the finally below (it was not, before 2026-09-07: --selftest
     held all eight WASM heaps live at once, which is what put this guard within
     reach of an allocation failure in the first place). */
  if (plant && PLANTS[plant].beforeBoot) PLANTS[plant].beforeBoot();
  const { db } = await bootReplay({ patches });
  try {
    return await probe(db, plant);
  } finally {
    try { await db.close(); } catch { /* closing a replay is best-effort */ }
  }
}

async function probe(db, plant) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;

  /* SCAFFOLD (declared in the header): pg_cron's run-history table, which the
     replay fixture does not model. Real column shape, so (a)/(b)/(g) execute
     the same code they will execute on production. */
  await q(`create table if not exists cron.job_run_details (
             runid bigserial primary key, jobid bigint, status text,
             return_message text, start_time timestamptz)`);

  /* SCAFFOLD 3 (2026-09-07): ANALYZE, because the ROW half of the sample is
     `pg_stat_all_tables.n_live_tup` and CUMULATIVE STATISTICS DO NOT SURVIVE A
     DATA-DIRECTORY RESTORE. PostgreSQL discards pgstat on recovery, and
     restoring a tests/pglite-template.mjs snapshot IS a recovery — the same
     class as the unlogged-table note in that file. MEASURED here: player_ledger
     holds 3 rows either way, but n_live_tup is 3 after a cold replay and 0 after
     a restore, so H4's row-delta arm was firing only on a cache MISS and
     silently reading "0 alerts" on every cache HIT. ANALYZE recomputes it from
     the heap, so the arm's input is the same on both paths. The HARNESS
     assertions in H4 are the backstop if it ever is not. */
  await q('analyze');

  const alerts = async (like) => q(
    'select ref, severity, message from public.maintenance_alerts where ref like $1 order by ref',
    [like]);
  const clear = () => q('delete from public.maintenance_alerts');
  const scaled = (s) => q(`select public.hr_cron_health_ex(interval '25 hours', $1) as r`, [s]);

  const obs = {};

  // ── H1. A HEALTHY DATABASE IS QUIET, AND A SAMPLE IS TAKEN ────────────
  await clear();
  obs.h1_alerts = Number((await q('select public.hr_cron_health() as r'))[0].r);
  obs.h1_size = await alerts('%size:%');
  obs.h1_samples = Number((await q('select count(*)::text c from public.hr_db_samples'))[0].c);
  obs.h1_db = Number((await q(
    'select db_bytes::text b from public.hr_db_samples order by at desc limit 1'))[0].b);

  /* ── H3. A SCALE ABOVE 1 IS CLAMPED TO 1 ───────────────────────────────
     THE POLARITY HERE IS THE WHOLE TEST, and the obvious version of it is
     useless: "a huge scale raises no alert on a healthy database" passes
     identically whether the clamp exists or not, because nothing was going to
     alert anyway. So the probe first makes a REAL fuse fire — an impossible
     previous sample (a database of MINUS 200 MB yesterday) puts today's 24h
     growth over the 150 MB critical line — and then asks for a scale of a
     million. Clamped, the alert still fires. Unclamped, the fuse moves to 150 PB
     and the alarm silently disappears, which is exactly what an off switch
     looks like. */
  await clear();
  await q('delete from public.hr_db_samples');
  await q(`insert into public.hr_db_samples (at, db_bytes, max_conns, used_conns, tables, jobs)
           values (now() - interval '25 hours', -200000000, 60, 1, '{}'::jsonb, '{}'::jsonb)`);
  await scaled(1000000);
  obs.h3_growth = await alerts('db-growth:%');
  /* …and it is still the SAME detector at scale 1: no size alert on a 16 MB
     database, so the clamp did not simply pin every fuse to zero. */
  obs.h3_size = await alerts('%-size:%');

  // ── H2. EVERY SIZE ARM FIRES AT A SCALED FUSE ─────────────────────────
  await clear();
  await scaled(0.0000000001);
  obs.h2_db = await alerts('db-size:%');
  obs.h2_tables = await alerts('table-size:%');
  obs.h2_conn = await alerts('connections:%');

  // ── H4. GROWTH NEEDS A SECOND SAMPLE, AND MEASURES THE RIGHT DELTA ────
  // A synthetic 24h-old sample: the database was 1 byte and the largest table
  // was empty, so today's real numbers are the delta. Nothing else can produce
  // a rate in a harness that runs in nine seconds.
  await clear();
  await q('delete from public.hr_db_samples');
  await q(`insert into public.hr_db_samples (at, db_bytes, max_conns, used_conns, tables, jobs)
           values (now() - interval '25 hours', 1, 60, 1,
                   jsonb_build_object('player_ledger', jsonb_build_object('b', 0, 'r', 0)),
                   '{}'::jsonb)`);
  // A planted HARNESS defect, if one was asked for: from here the SECOND sample
  // fails in one of the ways it fails for real. (--plant, exercised by --selftest.)
  if (plant && PLANTS[plant].sql) await q(PLANTS[plant].sql);
  await scaled(0.0000000001);
  obs.h4_db_growth = await alerts('db-growth:%');
  obs.h4_tbl_growth = await alerts('table-growth:%');
  obs.h4_rows = await alerts('table-rows:%');

  /* ── H4's SAMPLES, ASSERTED BEFORE ITS ARMS ARE GRADED ─────────────────
     Two rows must exist: the synthetic 24h-old one inserted above, and the one
     hr_cron_health took for itself. Anything less and the arms above were
     comparing against a measurement that was never made. */
  const rows = await q('select at, db_bytes::text as db_bytes, tables '
    + 'from public.hr_db_samples order by at asc');
  if (rows.length < 2) {
    harness('H4 second sample', `hr_cron_health left ${rows.length} sample row(s) where 2 were `
      + 'expected (the synthetic 24h-old one + the one it takes itself). The second sample could '
      + 'not be taken, so every growth arm compared against nothing and correctly stayed silent.');
  }
  const prev = assertSample('H4 first sample (synthetic)', rows[0]);
  const now = assertSample('H4 second sample', rows[rows.length - 1],
    { requireTables: [...prev.keys()] });
  /* And the pair must be capable of firing the row arm at all: `r` comes from
     pg_stat_all_tables.n_live_tup, which is stats-collector state rather than a
     count, so "every shared table gained zero rows" means the second sample did
     not observe live tuples — not that the detector is broken. */
  const deltas = [...prev.keys()].map((t) => [t, now.get(t).r - prev.get(t).r]);
  if (!deltas.some(([, d]) => d > 0)) {
    harness('H4 second sample', 'no table shared by the two samples has a POSITIVE 24h row delta '
      + `(${deltas.map(([t, d]) => `${t}:${d >= 0 ? '+' : ''}${d}`).join(', ')}). The arm is being `
      + 'asked to fire on an input that cannot fire it: the sample step observed no live tuples '
      + '(n_live_tup), which is what happens when PGlite is starved of memory by a co-resident '
      + 'suite. Re-run this guard ALONE; if it repeats, HR_PGLITE_CACHE=0.');
  }
  obs.h4_sample_ok = true;

  // ── H5. RETENTION: SAMPLES, LOG, AND ONLY *ACKED* ALERTS ──────────────
  await q(`insert into public.hr_db_samples (at, db_bytes) values (now() - interval '31 days', 1)`);
  await q(`insert into public.maintenance_log (job, detail, ran_at)
           values ('probe-old', '{}'::jsonb, now() - interval '200 days')`);
  /* The window is 180 days (restore-runbook.md's ruling), so a 91-day row is
     the CONTROL that must survive — without it "everything was deleted" passes
     the same assertion as "the right things were deleted". */
  await q(`insert into public.maintenance_log (job, detail, ran_at)
           values ('probe-new', '{}'::jsonb, now() - interval '91 days')`);
  await q(`insert into public.maintenance_alerts (source, ref, severity, message, created_at, acked_at)
           values ('probe','probe-acked','warn','acked', now() - interval '200 days', now())`);
  await q(`insert into public.maintenance_alerts (source, ref, severity, message, created_at)
           values ('probe','probe-open','warn','open', now() - interval '200 days')`);
  await q('select public.hr_cron_health() as r');
  obs.h5_old_sample = Number((await q(
    "select count(*)::text c from public.hr_db_samples where at < now() - interval '30 days'"))[0].c);
  obs.h5_old_log = Number((await q(
    "select count(*)::text c from public.maintenance_log where job = 'probe-old'"))[0].c);
  obs.h5_new_log = Number((await q(
    "select count(*)::text c from public.maintenance_log where job = 'probe-new'"))[0].c);
  obs.h5_acked = Number((await q(
    "select count(*)::text c from public.maintenance_alerts where ref = 'probe-acked'"))[0].c);
  obs.h5_open = Number((await q(
    "select count(*)::text c from public.maintenance_alerts where ref = 'probe-open'"))[0].c);

  // ── H7. THE NEVER-RAN ESCALATION ──────────────────────────────────────
  // A job with no run history at all. Seen for 5 minutes → 'info' (it really is
  // new). Seen for three days → 'warn' (it is not new, it is not firing).
  await clear();
  await q(`insert into cron.job (jobname, schedule, command)
           values ('probe-never-ran', '0 4 * * *', 'select 1')
           on conflict (jobname) do nothing`);
  await q('delete from public.hr_db_samples');
  await q(`insert into public.hr_db_samples (at, db_bytes, tables, jobs)
           values (now() - interval '5 minutes', 1, '{}'::jsonb,
                   jsonb_build_object('probe-never-ran', true))`);
  await q('select public.hr_cron_health() as r');
  obs.h7_new = await alerts('cron-stale:probe-never-ran%');
  await clear();
  await q('delete from public.hr_db_samples');
  await q(`insert into public.hr_db_samples (at, db_bytes, tables, jobs)
           values (now() - interval '3 days', 1, '{}'::jsonb,
                   jsonb_build_object('probe-never-ran', true))`);
  await q('select public.hr_cron_health() as r');
  obs.h7_old = await alerts('cron-stale:probe-never-ran%');

  // ── H6. NOTHING HERE IS CLIENT-REACHABLE ──────────────────────────────
  obs.h6 = (await q(`select
      has_function_privilege('anon','public.hr_cron_health(interval)','execute') as f_anon,
      has_function_privilege('authenticated','public.hr_cron_health(interval)','execute') as f_auth,
      has_function_privilege('authenticated','public.hr_cron_health_ex(interval,numeric)','execute') as fx_auth,
      has_function_privilege('authenticated','public.hr_db_sample(int)','execute') as s_auth,
      has_table_privilege('anon','public.hr_db_samples','select') as t_anon,
      has_table_privilege('authenticated','public.hr_db_samples','select') as t_auth,
      (select relrowsecurity from pg_class where oid='public.hr_db_samples'::regclass) as rls,
      (select count(*)::int from pg_policies
        where schemaname='public' and tablename='hr_db_samples') as policies`))[0];

  return obs;
}

function grade(o) {
  // ── H1 ────────────────────────────────────────────────────────────────
  ok(o.h1_samples >= 1, 'H1: hr_cron_health did not take a sample — every rate check depends on it');
  ok(o.h1_db > 0, `H1: the sample recorded db_bytes=${o.h1_db}`);
  ok(o.h1_size.length === 0,
    `H1 FALSE POSITIVE: a healthy ${o.h1_db}-byte database raised ${o.h1_size.length} size alert(s) `
    + `(${o.h1_size.map((a) => a.ref).join(', ')}). An alarm that fires when nothing is wrong gets `
    + 'muted, and then the real one is muted too.');

  // ── H3 ────────────────────────────────────────────────────────────────
  ok(o.h3_growth.length === 1,
    `H3: with p_scale = 1000000 the database-growth alarm produced ${o.h3_growth.length} alert(s) `
    + 'against a 200 MB overnight jump, expected 1. A scale above 1 must be CLAMPED to 1 — '
    + 'unclamped, the fuse moves to 150 PB and every alarm in this detector can be silenced by its '
    + 'own caller, which turns the testability seam into an off switch.');
  ok(o.h3_size.length === 0,
    `H3: the clamped run ALSO raised ${o.h3_size.length} size alert(s) on a healthy database — the `
    + 'clamp must pin the scale at 1, not at 0.');

  // ── H2 ────────────────────────────────────────────────────────────────
  ok(o.h2_db.length === 1,
    `H2: the DATABASE-SIZE arm produced ${o.h2_db.length} alert(s) at minimum fuse, expected 1. `
    + 'An arm that cannot fire is decoration (b319: "a policy that cannot fire is worse than no '
    + 'policy").');
  ok(o.h2_tables.length >= 3,
    `H2: the per-TABLE arm produced ${o.h2_tables.length} alert(s) at minimum fuse, expected one `
    + 'per sampled table. This is the whole point of the change — the old body could only ever '
    + `alarm about game_events. Got: ${o.h2_tables.map((a) => a.ref).join(', ')}`);
  ok(o.h2_tables.some((a) => !/game_events/.test(a.ref)),
    'H2: every table alert is about game_events — the arm is still hardcoded to the one table that '
    + 'already burned us.');
  ok(o.h2_conn.length === 1,
    `H2: the CONNECTION arm produced ${o.h2_conn.length} alert(s) at minimum fuse, expected 1. `
    + 'server-authority.md §2a-ii calls connection exhaustion the first thing that breaks at 10× '
    + 'and the failure is total.');

  // ── H4 ────────────────────────────────────────────────────────────────
  // Nothing here is gradeable unless BOTH samples were taken and every table in
  // them carries counts (see assertSample). run() has already thrown if not;
  // this is the backstop for any future caller that grades an obs it built
  // elsewhere, because "0 alerts" must never be reportable without it.
  if (o.h4_sample_ok !== true) {
    harness('H4', 'the sample integrity check did not run, so "0 alerts" cannot be told apart '
      + 'from "the second sample was never taken"');
  }
  ok(o.h4_db_growth.length === 1,
    `H4: the DATABASE GROWTH arm produced ${o.h4_db_growth.length} alert(s) against a 24h-old `
    + 'sample, expected 1. Growth is the signal that arrives first — b319 was four days of ~57 '
    + 'MB/day before it was large.');
  ok(o.h4_tbl_growth.length >= 1,
    `H4: the per-table GROWTH arm produced ${o.h4_tbl_growth.length} alert(s), expected at least 1`);
  ok(o.h4_rows.length >= 1,
    `H4: the per-table ROW-DELTA arm produced ${o.h4_rows.length} alert(s), expected at least 1. `
    + 'Rows and bytes are different signals: b319 was 460k rows/day.');

  // ── H5 ────────────────────────────────────────────────────────────────
  ok(o.h5_old_sample === 0,
    `H5: ${o.h5_old_sample} sample(s) older than 30 days survived — the table that measures growth `
    + 'must not be the one that grows.');
  ok(o.h5_old_log === 0, 'H5: a 200-day-old maintenance_log row survived the 180-day prune');
  ok(o.h5_new_log === 1,
    'H5: the prune deleted a 91-DAY-OLD maintenance_log row. The window is 180 days '
    + '(docs/design/restore-runbook.md\'s ruling) — a prune that takes more than it was asked for '
    + 'deletes incident evidence.');
  ok(o.h5_acked === 0, 'H5: a 200-day-old ACKED alert survived the prune');
  ok(o.h5_open === 1,
    'H5: an OPEN 200-day-old alert was DELETED. An alarm nobody has acknowledged must never expire '
    + 'on a timer — that is deleting the evidence of the thing you are watching for.');

  // ── H7 ────────────────────────────────────────────────────────────────
  ok(o.h7_new.length === 1 && o.h7_new[0].severity === 'info',
    `H7: a job first seen 5 minutes ago should be reported 'info' (it really is new); got `
    + JSON.stringify(o.h7_new));
  ok(o.h7_old.length === 1 && o.h7_old[0].severity === 'warn',
    'H7: a job that has NEVER run and has been scheduled for three days is still reported '
    + `'${o.h7_old[0]?.severity}'. "New" is only an excuse for the first day; after that a job with `
    + 'no run history is a job that is not firing (the hr-kill-credit-prune class). Got: '
    + JSON.stringify(o.h7_old));
  ok(o.h7_old.length === 1 && /NEVER run/.test(o.h7_old[0].message || ''),
    'H7: the escalated message does not say the job has NEVER run — an operator reading '
    + `"${o.h7_old[0]?.message}" cannot tell it apart from an ordinary stale job.`);

  // ── H6 ────────────────────────────────────────────────────────────────
  ok(o.h6 && !o.h6.f_anon && !o.h6.f_auth && !o.h6.fx_auth && !o.h6.s_auth,
    `H6: a maintenance function is executable by a client role (${JSON.stringify(o.h6)})`);
  ok(o.h6 && !o.h6.t_anon && !o.h6.t_auth,
    'H6: hr_db_samples is readable by a client role. It names every table in the database with a '
    + `growth rate attached — an enumeration surface. (${JSON.stringify(o.h6)})`);
  ok(o.h6 && o.h6.rls === true && Number(o.h6.policies) === 0,
    `H6: hr_db_samples must have RLS on and NO policy; got rls=${o.h6?.rls} policies=${o.h6?.policies}`);
}

/** The guard, as a function, so tests/run-smoke.mjs can call it. */
export async function cronHealthGuard() {
  problems.length = 0;
  grade(await run());
  return [...problems];
}

// ── main ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/cron-health.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    for (const [id, p] of Object.entries(PLANTS)) console.log(`${`(plant) ${id}`.padEnd(26)} ${p.why}`);
    process.exit(0);
  }

  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  const plantArg = argv.find((a) => a.startsWith('--plant='));
  const selftest = argv.includes('--selftest');

  // A typo'd id must not arrive as `undefined[...]` three seconds into a replay.
  const known = (arg, table, what) => {
    const id = arg.split('=').slice(1).join('=');
    if (!table[id]) {
      console.error(`unknown ${what} "${id}" — try --list`);
      process.exit(1);
    }
    return id;
  };

  /** A harness fault is never a verdict about the repo: it aborts, distinctly. */
  const die = (e) => {
    console.error(`\ncron-health: HARNESS FAULT — nothing was graded.\n  ${e.message}`);
    process.exit(2);
  };

  if (selftest) {
    let bad = 0;
    /* ── THE PLANTS RUN FIRST. They are the guard on the guard: each makes the
       second sample fail in a way that leaves the row arm silent, and each must
       come back as a HARNESS error naming the step — not as a ✗ against the
       detector, and not as a "CAUGHT" that would let a harness fault masquerade
       as a successful mutation. */
    for (const [id, p] of Object.entries(PLANTS)) {
      let verdict = 'MISSED ';
      let detail = p.why;
      try {
        problems.length = 0;
        grade(await run(undefined, id));
        detail = `no error at all; graded ${problems.length} ordinary problem(s): `
          + `${problems[0] || '(none — it read as GREEN)'}`;
      } catch (e) {
        if (!isHarness(e)) { detail = `threw a NON-harness error: ${e.message}`; }
        else if (!p.expect.test(e.message)) { detail = `HARNESS error, but not the expected one: ${e.message}`; }
        else { verdict = 'HARNESS'; detail = e.message.split('\n')[0]; }
      }
      console.log(`${verdict} (plant) ${id}`);
      console.log(`         ${detail}`);
      if (verdict !== 'HARNESS') bad++;
    }

    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      let note = '';
      try { grade(await run(id)); caught = problems.length > 0; }
      catch (e) {
        // A harness fault under a mutation is NOT the mutation being caught.
        // Before 2026-09-07 every throw counted as CAUGHT, so an allocation
        // failure or a mangled patch anchor read as a successful detection.
        if (isHarness(e)) die(e);
        caught = true;
        note = `caught by an exception: ${String(e.message).split('\n')[0]}`;
      }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (note) console.log(`         ${note}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} defect(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught, `
        + `all ${Object.keys(PLANTS).length} harness plants rejected.`);
    process.exit(bad ? 1 : 0);
  }

  if (plantArg) {
    try { grade(await run(undefined, known(plantArg, PLANTS, "plant"))); }
    catch (e) {
      if (isHarness(e)) { console.log(`the plant was REJECTED as a harness fault:\n  ${e.message}`); process.exit(0); }
      throw e;
    }
    console.error('the planted harness defect was NOT reported as a harness fault');
    process.exit(1);
  }

  try { grade(await run(mutateArg ? known(mutateArg, MUTATIONS, "mutation") : undefined)); }
  catch (e) { if (isHarness(e)) die(e); throw e; }
  if (problems.length) {
    console.error(`cron-health: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('cron-health: green — every arm fires at its fuse, none fires on a healthy database, '
    + 'the scale cannot be raised, retention bounds the detector itself, and nothing reaches a client.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
