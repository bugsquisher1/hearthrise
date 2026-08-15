// ════════════════════════════════════════════════════════════════════════
// tests/restore-census.mjs — WHAT A REPO REBUILD DOES *NOT* GIVE YOU BACK.
//
// tests/schema-drift.mjs proves the repo rebuilds the SCHEMA. Its own header
// says, in point B, what it deliberately does not cover:
//
//     "DATA. This proves the SCHEMA rebuilds. It says nothing about whether
//      any row survives a restore."
//
// This file is that half. It replays the same chain and then asks a different
// question of the result: **for every table, does a rebuild from this
// repository reproduce production's rows, or does only a backup?**
//
// That distinction is the whole of disaster recovery planning. After cutover
// the database is the only copy of every player's progression, and the fatal
// mistake at 3am is discovering *during* the incident which half of the
// database the git repo was never going to give back.
//
// Run:  node tests/restore-census.mjs             (CI: no credentials needed)
//       node tests/restore-census.mjs --write     (re-baseline replay figures)
//       node tests/restore-census.mjs --mutate    (prove the guard sees failure)
//
// ── THE FOUR CLASSES ────────────────────────────────────────────────────────
//   seeded        The repo reconstructs these rows. A rebuild is sufficient;
//                 no backup is needed. Catalogues, XP table, RPC baseline.
//                 The guard PINS the replay row count: if a rebuild would
//                 produce a different catalogue than production runs, that is
//                 a silent content divergence and it fails here.
//   restore_only  The repo creates the table EMPTY. Only a backup brings the
//                 rows back. Every one of these is a data-loss surface, and
//                 the baseline records what production held and when.
//   operational   Accumulates from the database running (rate counters,
//                 maintenance log, sampled rejections). Losing them costs
//                 observability history, never player value. Not asserted.
//   regenerated   THE DANGEROUS ONE. The rebuild produces the right NUMBER of
//                 rows with DIFFERENT CONTENT, so a count-based census reports
//                 it as reconstructed and it is not. Exactly one table is in
//                 this class today and the baseline says what breaks.
//
// ── WHAT THIS GUARD CAN SEE ─────────────────────────────────────────────────
//  1. A NEW TABLE WITH NO STATED DR CLASS. Every base table in `public` must
//     be classified. A migration that adds a data-bearing table without anyone
//     deciding "does a restore need a backup for this?" fails the build. Same
//     discipline as tests/schema-apply-order.json: a new object has to declare
//     where it stands, rather than being discovered during an incident.
//  2. A CATALOGUE THAT WOULD REBUILD TO A DIFFERENT SIZE. 426 items today. A
//     rebuild that produced 425 would run a game subtly different from the one
//     the backup's player rows were earned in.
//  3. RETENTION SILENTLY DROPPING OUT OF A REBUILD. The chain schedules nine
//     pg_cron jobs and the guard pins all nine by name, schedule and command.
//     This is not hypothetical housekeeping: game_events reached 1,598,269
//     rows / 229 MB from six players in four days — 94% of a 244 MB database —
//     because one job was not doing its job. A rebuilt database that comes back
//     without `trim-game-events` is a 500 MB disk with a fuse on it, and
//     nothing else in this repo would notice.
//  4. A CLASSIFICATION THAT HAS GONE STALE — naming a table that no longer
//     exists, or claiming restore_only for a table the repo now seeds.
//
// ── WHAT THIS GUARD CANNOT SEE, STATED PLAINLY ──────────────────────────────
//  A. WHETHER A RESTORE ACTUALLY WORKS. This is a census, not a drill. It says
//     which rows a backup must carry; it does not prove Supabase gives them
//     back. Only executing docs/design/restore-runbook.md does that, and as of
//     2026-08-15 that has NEVER BEEN RUN.
//  B. PRODUCTION'S CURRENT ROW COUNTS. Credential-free by design. The
//     `production` block is a dated MEASUREMENT, not a live check — the same
//     honesty rule schema-drift.mjs applies to `known_production_delta`. A
//     stale block is a stale measurement, not a passing check, and this prints
//     its age on every run rather than letting silence read as health.
//  C. ROW *CONTENT* in a seeded table. A count is not a checksum. The content
//     guard for the generated catalogue is `tools/gen-catalogues.mjs --check`,
//     which is a preflight in tests/run-smoke.mjs and is stronger than
//     anything this file could add. Do not duplicate it. `hr_castle_items` is
//     the one seeded catalogue with NO content guard anywhere (it is
//     hand-maintained — see docs/design/server-authority.md §3.4), so for that
//     table the count pinned here is the only guard that exists.
//  D. ANYTHING OUTSIDE `public`. auth.users is the root of the entire player
//     graph — 17 foreign keys in `public` reference it — and NO file in this
//     repository creates it. It is recorded in the baseline's
//     `outside_public` block for the runbook's benefit and is deliberately not
//     asserted here, because the replay's auth.users comes from the test
//     fixture and asserting against a fixture proves nothing.
//
// ── THE MUTATION PROOF ──────────────────────────────────────────────────────
// This repo has shipped a guard that asserted nothing twelve times. `--mutate`
// plants real defects in the real migration text and requires each to be
// caught, recording WHICH mechanism caught it — a defect caught by the replay
// crashing proves nothing about this census. It exits 1 if a defect slips and
// 2 if an anchor no longer matches, because a bug that was never planted is
// the same defect as a probe that is always null.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, bootReplay } from './schema-replay.mjs';

const BASELINE = join(ROOT, 'tests', 'restore-census.baseline.json');
const argv = process.argv.slice(2);

const CLASSES = ['seeded', 'restore_only', 'operational', 'regenerated'];

// Jobs the TEST FIXTURE pre-schedules to simulate the pre-market-v2 production
// state (tests/sql/pglite-fixture.sql), so that 2026-08-11-market-v2.sql's
// unschedule can be exercised. No migration in the chain creates them and
// production does not have them — they are not part of what a rebuild produces
// and must be subtracted before comparing.
const FIXTURE_CRON = ['trim-expired-listings', 'trim-market-sales'];

// ── The mutation catalogue ─────────────────────────────────────────────────
const MUTATIONS = {
  // The pair below is deliberate. Running only the first would have produced a
  // FALSE PASS for this file: it is caught by 2026-08-08-clan-seat.sql's own
  // self-check, not by the census, and a mutation that some OTHER guard catches
  // proves nothing about this one. That self-check reads `if v_n < 34` — a
  // FLOOR, not an equality — so it is blind in one direction, and the second
  // mutation is aimed exactly there.
  shrink_a_catalogue: {
    what: 'hr_castle_items rebuilds one row SHORT. Caught upstream by the migration\'s own floor check, which is the correct first line of defence; recorded so the pair below is read as a deliberate split rather than a mistake',
    expect: 'replay',
    patches: [['2026-08-08-clan-seat.sql', [[
      "  ('rat_tail','spoil',1,6),             ('goblin_ear','spoil',1,8),",
      "  ('rat_tail','spoil',1,6),",
    ]]]],
  },
  grow_a_catalogue: {
    what: 'hr_castle_items rebuilds one row LONG — the migration\'s `v_n < 34` floor check passes happily, so a rebuilt database would run a catalogue production never had and ONLY the exact count pinned here sees it',
    expect: 'census',
    patches: [['2026-08-08-clan-seat.sql', [[
      "  ('rat_tail','spoil',1,6),             ('goblin_ear','spoil',1,8),",
      "  ('rat_tail','spoil',1,6),             ('goblin_ear','spoil',1,8),\n  ('mutant_trophy','trophy',1,1),",
    ]]]],
  },
  drop_retention_cron: {
    what: 'trim-game-events is never scheduled, so a rebuilt database has NO retention on the table that hit 1,598,269 rows / 229 MB in four days',
    expect: 'census',
    patches: [['2026-08-11-telemetry-retention.sql', [[
      "  perform cron.schedule('trim-game-events', '0 3 * * *', 'select public.hr_trim_game_events(7)');",
      '  -- scheduling removed by the mutation harness',
    ]]]],
  },
  unclassified_table: {
    what: 'a migration adds a data-bearing table and nobody states whether a restore needs a backup for it — the exact thing that gets discovered at 3am',
    expect: 'census',
    patches: [['2026-08-11-telemetry-retention.sql', [[
      '-- ── 5. Self-check ─',
      'create table public.hr_unclassified_probe (id int primary key, payload text);\n-- ── 5. Self-check ─',
    ]]]],
  },
  seed_a_restore_only_table: {
    what: 'a migration starts seeding a table the DR plan records as backup-only, so the plan silently overstates what must be restored',
    expect: 'census',
    patches: [['2026-08-10-dr-beta-invites-base.sql', [[
      '  alter table public.beta_invites enable row level security;',
      "  insert into public.beta_invites (code, note) values ('MUTANT','planted by the mutation harness');\n"
      + '  alter table public.beta_invites enable row level security;',
    ]]]],
  },
};

// ── Measure a replay ───────────────────────────────────────────────────────
async function measure(patches) {
  const { db } = await bootReplay({ patches });

  const tables = (await db.query(
    `select c.relname::text as nm from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' order by 1`)).rows.map((r) => r.nm);

  const rows = {};
  for (const t of tables) {
    rows[t] = (await db.query(`select count(*)::int as n from public."${t}"`)).rows[0].n;
  }

  // The chain's own cron surface, fixture jobs removed.
  let cron = [];
  try {
    cron = (await db.query('select jobname, schedule, command from cron.job order by jobname'))
      .rows
      .filter((r) => !FIXTURE_CRON.includes(r.jobname))
      .map((r) => `${r.jobname} | ${r.schedule} | ${String(r.command).trim()}`);
  } catch {
    cron = ['<cron.job unreadable>'];
  }

  return { rows, cron };
}

// ── The comparison ─────────────────────────────────────────────────────────
/** @returns {string[]} problems — empty means the census holds. */
function compare(base, m) {
  const problems = [];
  const cls = base.tables || {};

  for (const [t, n] of Object.entries(m.rows)) {
    const spec = cls[t];
    if (!spec) {
      problems.push(
        `UNCLASSIFIED TABLE: public.${t} (${n} row(s) after a rebuild).\n`
        + '      Every base table in public must state what a restore needs for it.\n'
        + `      Add it to "tables" in tests/restore-census.baseline.json with one of:\n`
        + `        ${CLASSES.join(' | ')}\n`
        + '      and say, in "note", what is lost if it comes back empty.');
      continue;
    }
    if (!CLASSES.includes(spec.class)) {
      problems.push(`public.${t}: unknown class "${spec.class}" (expected ${CLASSES.join('|')})`);
      continue;
    }
    if (spec.class === 'seeded' || spec.class === 'regenerated') {
      if (n !== spec.replay) {
        problems.push(
          `public.${t}: the repo now rebuilds ${n} row(s), the baseline pins ${spec.replay}.\n`
          + '      A rebuilt database would run a different catalogue than production.\n'
          + '      If this change was intended: node tests/restore-census.mjs --write');
      }
    }
    if (spec.class === 'restore_only' && n !== 0) {
      problems.push(
        `public.${t}: classified restore_only but the rebuild seeds ${n} row(s).\n`
        + '      Either a migration started seeding it (reclassify to "seeded") or a\n'
        + '      migration is writing player data at apply time, which is worse.');
    }
  }

  for (const t of Object.keys(cls)) {
    if (!(t in m.rows)) {
      problems.push(`STALE CLASSIFICATION: tests/restore-census.baseline.json names public.${t}, which no longer exists.`);
    }
  }

  const want = base.cron?.expected || [];
  const gotSet = new Set(m.cron);
  const wantSet = new Set(want);
  for (const j of want) {
    if (!gotSet.has(j)) {
      problems.push(
        `SCHEDULED JOB LOST FROM A REBUILD: ${j}\n`
        + '      A rebuilt database would come back without it. If this is a retention\n'
        + '      job, the rebuild has no retention and the table it trims grows without\n'
        + '      bound — that is how game_events reached 94% of the database.');
    }
  }
  for (const j of m.cron) {
    if (!wantSet.has(j)) {
      problems.push(
        `UNDECLARED SCHEDULED JOB IN A REBUILD: ${j}\n`
        + '      The chain now schedules a job the baseline does not record. A rebuilt\n'
        + '      database would start running it. If intended: --write.');
    }
  }

  return problems;
}

async function main() {
  // ── --mutate ─────────────────────────────────────────────────────────────
  if (argv.includes('--mutate')) {
    const base = JSON.parse(await readFile(BASELINE, 'utf8'));
    let slipped = 0;
    for (const [name, mut] of Object.entries(MUTATIONS)) {
      let caught = null;
      let detail = '';
      try {
        const m = await measure(new Map(mut.patches));
        const problems = compare(base, m);
        if (problems.length) { caught = 'census'; detail = problems[0].split('\n')[0]; }
      } catch (e) {
        if (e.harness && !e.replay) {
          console.error(`HARNESS  ${name}: ${e.message}`);
          process.exit(2);
        }
        caught = 'replay';
        detail = String(e.message).split('\n')[1] || '';
      }
      if (!caught) {
        console.error(`SLIPPED  ${name}\n           ${mut.what}\n`
          + '           This guard does not see it. It is decoration until it does.');
        slipped++;
      } else {
        const note = caught === mut.expect ? '' : `  (caught as ${caught}, expected ${mut.expect})`;
        console.log(`caught   ${name.padEnd(26)} via ${caught}${note}\n           ${mut.what}\n           -> ${detail.trim()}`);
      }
    }
    if (slipped) {
      console.error(`\n${slipped} planted defect(s) slipped past the guard.`);
      process.exit(1);
    }
    console.log(`\nall ${Object.keys(MUTATIONS).length} planted defects caught`);
    return;
  }

  const m = await measure();

  // ── --write ──────────────────────────────────────────────────────────────
  if (argv.includes('--write')) {
    let prev = {};
    try { prev = JSON.parse(await readFile(BASELINE, 'utf8')); } catch { /* first run */ }
    const tables = {};
    for (const t of Object.keys(m.rows).sort()) {
      const old = prev.tables?.[t];
      tables[t] = old
        ? { ...old, ...(old.class === 'seeded' || old.class === 'regenerated' ? { replay: m.rows[t] } : {}) }
        : { class: 'UNCLASSIFIED — decide and edit', replay: m.rows[t] };
    }
    const out = {
      ...prev,
      generated: new Date().toISOString().slice(0, 10),
      cron: { ...(prev.cron || {}), expected: m.cron },
      tables,
    };
    await writeFile(BASELINE, `${JSON.stringify(out, null, 1)}\n`);
    console.log(`baseline written: ${Object.keys(tables).length} tables, ${m.cron.length} scheduled job(s)`);
    return;
  }

  // ── the guard proper ─────────────────────────────────────────────────────
  let base;
  try { base = JSON.parse(await readFile(BASELINE, 'utf8')); }
  catch {
    console.error('no baseline — run: node tests/restore-census.mjs --write');
    process.exit(2);
  }

  const problems = compare(base, m);
  if (problems.length) {
    console.error('RESTORE CENSUS FAILED — what a rebuild gives back has changed.\n');
    for (const p of problems) console.error(`  · ${p}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
  }

  const byClass = {};
  for (const [t, spec] of Object.entries(base.tables)) {
    (byClass[spec.class] ||= []).push(t);
  }
  const restoreOnly = byClass.restore_only || [];
  const prodRows = base.production?.rows || {};
  const atRisk = restoreOnly
    .map((t) => [t, prodRows[t] ?? 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  console.log(`restore-census: OK — ${Object.keys(base.tables).length} tables classified, `
    + `${m.cron.length} scheduled job(s) reproduced by the chain`);
  for (const c of CLASSES) console.log(`  ${c.padEnd(13)} ${(byClass[c] || []).length}`);

  console.log(`\nRESTORE-ONLY, i.e. a repo rebuild returns these EMPTY — only a backup has them:`);
  if (!atRisk.length) console.log('  (none held rows at the last production measurement)');
  for (const [t, n] of atRisk) {
    const spec = base.tables[t];
    console.log(`  ${String(n).padStart(6)}  public.${t}${spec.wiped_at_cutover ? '   [wiped at cutover]' : ''}`);
  }

  for (const [t, spec] of Object.entries(base.tables)) {
    if (spec.class === 'regenerated') {
      console.log(`\n⚠ REGENERATED — public.${t} rebuilds to the right COUNT and the wrong VALUE:`);
      console.log(`    ${spec.note}`);
    }
  }

  const prod = base.production;
  if (!prod) {
    console.log('\nNOTE: production has never been measured. The restore-only list above is a');
    console.log('      shape with no numbers in it.');
  } else {
    const age = Math.round((Date.now() - Date.parse(prod.measured)) / 86400000);
    console.log(`\nproduction row counts last MEASURED ${prod.measured} (${age} day(s) ago) against`);
    console.log(`${prod.project}. This run did not re-check them — a credential-free`);
    console.log('replay cannot read the live database.');
    if (age > 30) {
      console.log('\n  ⚠ Over 30 days old. Re-measure before any restore test or cutover step:');
      console.log('    see "how_to_remeasure" in the baseline.');
    }
  }

  const drill = base.restore_drill;
  if (drill) {
    console.log(`\nRESTORE DRILL: ${drill.last_executed ? `last executed ${drill.last_executed}` : 'NEVER EXECUTED'}`
      + ` — ${drill.runbook}`);
    if (!drill.last_executed) {
      console.log('  An untested backup is a rumour. The census proves which rows a restore');
      console.log('  must carry; it does not prove the restore carries them.');
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(e.harness ? 2 : 1);
});
