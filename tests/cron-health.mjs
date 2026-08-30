#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/cron-health.mjs — THE ALARMS CAN FIRE, AND ONLY WHEN THEY SHOULD.
//                         GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/cron-health.mjs             # the guard
//   node tests/cron-health.mjs --list      # the mutation catalogue
//   node tests/cron-health.mjs --selftest  # every mutation must be CAUGHT
//   node tests/cron-health.mjs --mutate=<id>
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

async function run(mutate) {
  const patches = mutate
    ? new Map([[MIG, MUTATIONS[mutate].pairs
        || [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  const { db } = await bootReplay({ patches });
  const q = async (sql, p) => (await db.query(sql, p)).rows;

  /* SCAFFOLD (declared in the header): pg_cron's run-history table, which the
     replay fixture does not model. Real column shape, so (a)/(b)/(g) execute
     the same code they will execute on production. */
  await q(`create table if not exists cron.job_run_details (
             runid bigserial primary key, jobid bigint, status text,
             return_message text, start_time timestamptz)`);

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
  await scaled(0.0000000001);
  obs.h4_db_growth = await alerts('db-growth:%');
  obs.h4_tbl_growth = await alerts('table-growth:%');
  obs.h4_rows = await alerts('table-rows:%');

  // ── H5. RETENTION: SAMPLES, LOG, AND ONLY *ACKED* ALERTS ──────────────
  await q(`insert into public.hr_db_samples (at, db_bytes) values (now() - interval '31 days', 1)`);
  await q(`insert into public.maintenance_log (job, detail, ran_at)
           values ('probe-old', '{}'::jsonb, now() - interval '91 days')`);
  await q(`insert into public.maintenance_log (job, detail, ran_at)
           values ('probe-new', '{}'::jsonb, now() - interval '1 day')`);
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
  ok(o.h5_old_log === 0, 'H5: a 91-day-old maintenance_log row survived the 90-day prune');
  ok(o.h5_new_log === 1, 'H5: the prune deleted a ONE-DAY-OLD maintenance_log row — the window is wrong');
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
    process.exit(0);
  }

  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  const selftest = argv.includes('--selftest');

  if (selftest) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try { grade(await run(id)); caught = problems.length > 0; }
      catch (e) { caught = true; }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }

  grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  if (problems.length) {
    console.error(`cron-health: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('cron-health: green — every arm fires at its fuse, none fires on a healthy database, '
    + 'the scale cannot be raised, retention bounds the detector itself, and nothing reaches a client.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
