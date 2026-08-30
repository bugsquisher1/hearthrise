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
// That distinction is the whole of disaster recovery planning. The cutover has
// HAPPENED — measured 2026-08-30, production holds 35 characters, 595 skill
// rows and 12,301 ledger rows against 49 auth users — so the database is now
// the only copy of every player's progression, and the fatal mistake at 3am is
// discovering *during* the incident which half of the database the git repo was
// never going to give back.
//
// Run:  node tests/restore-census.mjs                (CI: no credentials needed)
//       node tests/restore-census.mjs --write        (re-baseline replay figures)
//       node tests/restore-census.mjs --mutate       (prove it sees a bad MIGRATION)
//       node tests/restore-census.mjs --baseline-selftest
//                                                    (prove it sees a bad CLASSIFICATION)
//       node tests/restore-census.mjs --live-sql     (read-only SQL to run on prod)
//       node tests/restore-census.mjs --live-compare r.json   (classify the result)
//
// ⚠ Until 2026-08-30 this file was WIRED INTO NOTHING — not CI, not
//   run-smoke.mjs, not package.json — and had last been touched 2026-08-15. In
//   that fortnight the schema grew from 67 to 90 base tables and TWENTY-THREE
//   arrived with no stated DR class, including `player_bank` and
//   `player_workers`, which hold player value, while every other `player_*`
//   table was classified restore_only. A guard nobody runs is a comment. It now
//   runs on every push (.github/workflows/smoke.yml).
//
// ── THE FIVE CLASSES ────────────────────────────────────────────────────────
//   seeded          The repo reconstructs these rows. A rebuild is sufficient;
//                   no backup is needed. Catalogues, XP table, RPC baseline.
//                   The guard PINS the replay row count: if a rebuild would
//                   produce a different catalogue than production runs, that is
//                   a silent content divergence and it fails here.
//   restore_only    The repo creates the table EMPTY. Only a backup brings the
//                   rows back. Every one of these is a data-loss surface, and
//                   the baseline records what production held and when.
//   operational     Accumulates from the database running (rate counters,
//                   maintenance log, sampled rejections). Losing them costs
//                   observability history, never player value. Not asserted.
//   regenerated     THE DANGEROUS ONE. The rebuild produces the right NUMBER of
//                   rows with DIFFERENT CONTENT, so a count-based census reports
//                   it as reconstructed and it is not.
//   operator_tunable  Added 2026-08-30. One authored row, seeded `on conflict do
//                   nothing`, that an OPERATOR is expected to change at runtime
//                   — `hr_settings.beta_gate` (a security switch),
//                   `hr_market_config` (house tax, TTL, ceilings),
//                   `hr_ledger_config.retain_days`. A rebuild restores the
//                   AUTHORED DEFAULT and silently reverts the live value; a
//                   backup keeps it. It is not `seeded` (the repo does not
//                   reproduce the live row) and not `regenerated` (the value is
//                   not wrong on every apply, only once an operator has moved
//                   it). The baseline must carry a dated `live_value` so a
//                   rebuild has the number to re-apply, and the guard fails if
//                   that block is missing.
//
// ── WHAT THIS GUARD CAN SEE ─────────────────────────────────────────────────
//  1. A NEW TABLE WITH NO STATED DR CLASS. Every base table in `public` must
//     be classified. A migration that adds a data-bearing table without anyone
//     deciding "does a restore need a backup for this?" fails the build. Same
//     discipline as tests/schema-apply-order.json: a new object has to declare
//     where it stands, rather than being discovered during an incident.
//  2. A CLASSIFICATION WITH NO REASONING. `class` without a `note` that says
//     what is lost is a decision nobody made. 40 characters minimum, because
//     "player data" is not a rationale and "TODO" is worse.
//  3. A PLAYER-VALUE TABLE QUIETLY DOWNGRADED. The realistic way this guard
//     dies is not someone deleting it — it is someone turning a red build green
//     by moving `player_state` to `operational`. `player_value_tables` in the
//     baseline is a manifest of the tables whose class is not negotiable, and
//     the guard asserts every one of them is still `restore_only`.
//  4. A NEW PLAYER-SCOPED TABLE CLASSIFIED AS DISPOSABLE. Every base table
//     carrying a `user_id` column must appear in `player_value_tables` OR in
//     `player_value_exempt` with a written reason. Adding `player_pets(user_id,
//     …)` and calling it `operational` is not something you can do quietly; a
//     human has to type why. (LIMIT, stated: the sweep keys on the column name
//     `user_id`. A player-scoped table that names its owner column something
//     else — `profiles.id`, `chat_blocks.blocker_id` — is invisible to it and
//     is covered only by rule 1. Widen the sweep if that shape recurs.)
//  5. A CATALOGUE THAT WOULD REBUILD TO A DIFFERENT SIZE. 515 items today. A
//     rebuild that produced 514 would run a game subtly different from the one
//     the backup's player rows were earned in.
//  6. RETENTION SILENTLY DROPPING OUT OF A REBUILD. The chain schedules twelve
//     pg_cron jobs and the guard pins all twelve by name, schedule and command.
//     This is not hypothetical housekeeping: game_events reached 1,598,269
//     rows / 229 MB from six players in four days — 94% of a 244 MB database —
//     because one job was not doing its job. A rebuilt database that comes back
//     without `trim-game-events` is a disk with a fuse on it, and nothing else
//     in this repo would notice.
//  7. A MIGRATION WRITING PLAYER DATA AT APPLY TIME. A `restore_only` table
//     that a rebuild does not leave EMPTY is either a reclassification nobody
//     recorded or a migration seeding the player graph. The one known case is
//     declared per-table as `apply_residue` with an EXACT count, so the
//     assertion stays exact instead of being loosened to "a few".
//  8. A CLASSIFICATION THAT HAS GONE STALE — naming a table that no longer
//     exists, or claiming restore_only for a table the repo now seeds.
//
// ── WHAT THIS GUARD CANNOT SEE, STATED PLAINLY ──────────────────────────────
//  A. WHETHER A RESTORE ACTUALLY WORKS. This is a census, not a drill. It says
//     which rows a backup must carry; it does not prove Supabase gives them
//     back. Only executing docs/design/restore-runbook.md does that, and as of
//     2026-08-30 that has NEVER BEEN RUN. The banner at the top of every run
//     says so, on purpose, and only a real drill may set `last_executed`.
//  B. PRODUCTION'S CURRENT ROW COUNTS, in the credential-free pass. The
//     `production` block is a dated MEASUREMENT, not a live check — the same
//     honesty rule schema-drift.mjs applies to `known_production_delta`. A
//     stale block is a stale measurement, not a passing check, and this prints
//     its age on every run rather than letting silence read as health.
//     `--live-sql` / `--live-compare` make the re-measurement a repeatable
//     ritual instead of a thing that happened once; they need a live database
//     and therefore run as a PRE-APPLY RITUAL, never in CI.
//  C. ROW *CONTENT* in a seeded table. A count is not a checksum. The content
//     guard for the generated catalogues is `tools/gen-*.mjs --check`, which is
//     a preflight in tests/run-smoke.mjs and is stronger than anything this
//     file could add. Do not duplicate it. `hr_castle_items` is the one seeded
//     catalogue with NO content guard anywhere (it is hand-maintained — see
//     docs/design/server-authority.md §3.4), so for that table the count pinned
//     here is the only guard that exists.
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
// crashing proves nothing about this census. `--baseline-selftest` does the
// same for the half of this guard that lives in the BASELINE rather than in
// SQL: a downgraded player-value class, a rationale-free classification, a
// player-scoped table nobody ruled on, a drifted apply residue. Both exit 1 if
// a defect slips and 2 if an anchor no longer matches, because a bug that was
// never planted is the same defect as a probe that is always null.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, bootReplay } from './schema-replay.mjs';

const BASELINE = join(ROOT, 'tests', 'restore-census.baseline.json');
const argv = process.argv.slice(2);

const CLASSES = ['seeded', 'restore_only', 'operational', 'regenerated', 'operator_tunable'];
/** Classes whose rebuilt row count is ASSERTED against the baseline. */
const PINNED = ['seeded', 'regenerated', 'operator_tunable'];
/** A rationale shorter than this is not a rationale. */
const MIN_NOTE = 40;

// Jobs the TEST FIXTURE pre-schedules to simulate the pre-market-v2 production
// state (tests/sql/pglite-fixture.sql), so that market-v2's unschedule has a
// real pre-state to act on. No migration in the chain creates them and
// production does not have them — they are not part of what a rebuild produces
// and must be subtracted before comparing.
const FIXTURE_CRON = ['trim-expired-listings', 'trim-market-sales'];

// ── The mutation catalogue (defects planted in the real migration SQL) ──────
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
  /* ── WHY THESE TWO ARE PLANTED IN THE *LAST* FILE OF THE CHAIN ──────────
     Both were first written against 2026-08-11-telemetry-retention.sql, near
     the front, and both were then caught `via replay` instead of `via census`:
     2026-08-16-client-write-grant-sweep.sql refuses to apply when it finds a
     table carrying client write grants that its own reviewed list does not
     name, and Supabase's default ACL puts EVERY new public table in that class.
     That is a genuinely stronger, earlier defence and it stays — but a defect
     some other guard catches proves nothing about THIS one, and running only
     those versions gave the census's two most important arms (rule 1 and rule
     4) no live proof at all. Planting in the last file of the apply order lets
     the whole chain complete, so the census is the thing that has to see it.
     If a NEWER migration is ever appended to tests/schema-apply-order.json,
     these anchors keep working — they only need the file to be at or near the
     end, not to be the literal last one. */
  unclassified_table: {
    what: 'a migration adds a data-bearing table and nobody states whether a restore needs a backup for it — the exact thing that gets discovered at 3am, and the exact thing that had happened to 23 tables by 2026-08-30',
    expect: 'census',
    match: /UNCLASSIFIED TABLE: public\.hr_unclassified_probe/,
    patches: [['2026-09-03-crops-notnull-and-xp-prune-schedule.sql', [[
      "-- §1 constrain the hand-patched columns to the repo's declared shape",
      'create table public.hr_unclassified_probe (id int primary key, payload text);\n'
      + "-- §1 constrain the hand-patched columns to the repo's declared shape",
    ]]]],
  },
  unruled_player_scoped_table: {
    what: 'a migration adds a table that holds ROWS PER PLAYER and nobody rules on whether losing them costs a player anything — the player_bank / player_workers shape',
    expect: 'census',
    // `match` because rule 1 (unclassified) ALSO fires on this table, and "some
    // problem appeared" would let the user_id sweep be broken while a
    // neighbour's evidence carried the arm. This pins the message rule 4 emits.
    match: /PLAYER-SCOPED TABLE WITH NO RULING: public\.player_probe_hoard/,
    patches: [['2026-09-03-crops-notnull-and-xp-prune-schedule.sql', [[
      "-- §1 constrain the hand-patched columns to the repo's declared shape",
      'create table public.player_probe_hoard (user_id uuid not null, slot int not null, qty bigint not null, primary key (user_id, slot));\n'
      + "-- §1 constrain the hand-patched columns to the repo's declared shape",
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

// ── Baseline-level defects: the half of this guard that is NOT SQL ──────────
// A classification guard whose classifications are never attacked is a list.
// Each entry mutates the committed baseline IN MEMORY and must be reported by
// a specific message — `match` is deliberately narrow, because "some problem
// appeared" is satisfied by any of the other twelve checks and would let a
// broken arm pass on a neighbour's evidence.
const BASELINE_MUTATIONS = {
  downgrade_player_value_class: {
    what: 'player_state is moved from restore_only to operational — how a red build gets turned green by someone who does not know what the class means',
    mutate: (b) => { b.tables.player_state.class = 'operational'; },
    match: /PLAYER-VALUE TABLE DOWNGRADED/,
  },
  drop_from_player_value_manifest: {
    what: 'player_bank is quietly removed from the player-value manifest, so a later downgrade would pass unremarked',
    mutate: (b) => { b.player_value_tables = b.player_value_tables.filter((t) => t !== 'player_bank'); },
    match: /PLAYER-SCOPED TABLE WITH NO RULING: public\.player_bank/,
  },
  rationale_free_classification: {
    what: 'a table is classified with no stated reasoning — a decision nobody actually made',
    mutate: (b) => { b.tables.player_skills.note = 'player data'; },
    match: /no stated rationale/,
  },
  placeholder_class_shipped: {
    what: 'the literal placeholder --write emits is committed as if it were a decision',
    mutate: (b) => { b.tables.player_farm.class = 'UNCLASSIFIED — decide and edit'; },
    match: /unknown class/,
  },
  restore_only_without_cutover_ruling: {
    what: 'a restore_only table does not say whether losing it before cutover costs anything — the field the runbook triages on',
    mutate: (b) => { delete b.tables.player_inventory.wiped_at_cutover; },
    match: /must declare `wiped_at_cutover`/,
  },
  operator_tunable_without_live_value: {
    what: 'an operator-tunable row is recorded with no measured live value, so a rebuild has nothing to re-apply the beta gate from',
    mutate: (b) => { delete b.tables.hr_settings.live_value; },
    match: /must record a dated `live_value`/,
  },
  residue_declared_away: {
    what: 'the apply residue is inflated to swallow a future migration that starts writing player rows at apply time',
    mutate: (b) => { b.tables.player_ledger.apply_residue = 99; },
    match: /declared apply residue/,
  },
  empty_player_value_manifest: {
    what: 'the manifest is emptied, which would silently disable rules 3 and 4 while every other check still passed',
    mutate: (b) => { b.player_value_tables = []; },
    match: /player_value_tables is empty/,
  },
  exemption_with_no_reason: {
    what: 'a player-scoped table is exempted from the value manifest with a hand-wave instead of a reason',
    mutate: (b) => { b.player_value_exempt.game_events = 'telemetry'; },
    match: /PLAYER-SCOPED TABLE WITH NO RULING: public\.game_events/,
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

  // Rule 4's input: every base table that holds rows PER PLAYER.
  const userScoped = (await db.query(
    `select distinct c.relname::text as nm
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r'
        and a.attnum > 0 and not a.attisdropped and a.attname = 'user_id'
      order by 1`)).rows.map((r) => r.nm);

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

  return { rows, cron, userScoped };
}

// ── The comparison ─────────────────────────────────────────────────────────
/** @returns {string[]} problems — empty means the census holds. */
function compare(base, m) {
  const problems = [];
  const cls = base.tables || {};
  const manifest = Array.isArray(base.player_value_tables) ? base.player_value_tables : null;
  const exempt = (base.player_value_exempt && typeof base.player_value_exempt === 'object')
    ? base.player_value_exempt : {};

  for (const [t, n] of Object.entries(m.rows)) {
    const spec = cls[t];
    if (!spec) {
      problems.push(
        `UNCLASSIFIED TABLE: public.${t} (${n} row(s) after a rebuild).\n`
        + '      Every base table in public must state what a restore needs for it.\n'
        + `      Add it to "tables" in tests/restore-census.baseline.json with one of:\n`
        + `        ${CLASSES.join(' | ')}\n`
        + '      and say, in "note", what is lost if it comes back empty.\n'
        + '      If it holds rows per player, the answer is restore_only — full stop —\n'
        + '      and its name also belongs in "player_value_tables".');
      continue;
    }
    if (!CLASSES.includes(spec.class)) {
      problems.push(`public.${t}: unknown class ${JSON.stringify(spec.class)} (expected ${CLASSES.join('|')})`);
      continue;
    }

    // (2) A class with no reasoning is a decision nobody made.
    const note = typeof spec.note === 'string' ? spec.note.trim() : '';
    if (note.length < MIN_NOTE) {
      problems.push(
        `public.${t}: classified "${spec.class}" with no stated rationale.\n`
        + `      "note" is ${note.length} character(s); at least ${MIN_NOTE} are required.\n`
        + '      Say what is LOST if this table comes back empty.');
    }

    if (PINNED.includes(spec.class)) {
      if (!Number.isInteger(spec.replay)) {
        problems.push(
          `public.${t}: class "${spec.class}" pins a rebuild row count, but "replay" is\n`
          + `      ${JSON.stringify(spec.replay)}. Re-pin with: node tests/restore-census.mjs --write`);
      } else if (n !== spec.replay) {
        problems.push(
          `public.${t}: the repo now rebuilds ${n} row(s), the baseline pins ${spec.replay}.\n`
          + '      A rebuilt database would run a different catalogue than production.\n'
          + '      If this change was intended: node tests/restore-census.mjs --write');
      }
    }

    if (spec.class === 'restore_only') {
      if (typeof spec.wiped_at_cutover !== 'boolean') {
        problems.push(
          `public.${t}: a restore_only table must declare \`wiped_at_cutover\` (true|false).\n`
          + '      It is what the runbook triages on: whether losing these rows actually\n'
          + '      costs a player anything, or whether the wipe was going to take them.');
      }
      const residue = spec.apply_residue === undefined ? 0 : spec.apply_residue;
      if (!Number.isInteger(residue) || residue < 0) {
        problems.push(`public.${t}: \`apply_residue\` must be a non-negative integer, got ${JSON.stringify(spec.apply_residue)}`);
      } else if (n !== residue) {
        problems.push(residue === 0
          ? `public.${t}: classified restore_only but the rebuild seeds ${n} row(s).\n`
            + '      Either a migration started seeding it (reclassify to "seeded") or a\n'
            + '      migration is writing player data at apply time, which is worse.\n'
            + '      If those rows are a KNOWN self-check residue, declare the exact count\n'
            + '      as "apply_residue" with a "residue_note" naming the migrations.'
          : `public.${t}: the declared apply residue is ${residue} row(s), the rebuild leaves ${n}.\n`
            + '      A migration self-check started (or stopped) leaving orphan rows in a\n'
            + '      table that holds player value. The count is exact on purpose — a\n'
            + '      tolerance here is how a real seeding bug hides.');
      } else if (residue > 0) {
        const rn = typeof spec.residue_note === 'string' ? spec.residue_note.trim() : '';
        if (rn.length < MIN_NOTE) {
          problems.push(
            `public.${t}: declares apply_residue ${residue} with no "residue_note".\n`
            + '      Name the migrations that leave the rows and why they cannot be cleaned up.');
        }
      }
    }

    if (spec.class === 'operator_tunable') {
      const lv = spec.live_value;
      if (!lv || typeof lv !== 'object' || Array.isArray(lv)
          || typeof lv.measured !== 'string' || lv.value === undefined) {
        problems.push(
          `public.${t}: an operator_tunable table must record a dated \`live_value\`\n`
          + '      ({ "measured": "<YYYY-MM-DD>", "value": … }). A rebuild restores the\n'
          + '      AUTHORED DEFAULT; without the measured live value nobody knows what to\n'
          + '      re-apply, and the revert is silent.');
      }
    }
  }

  for (const t of Object.keys(cls)) {
    if (!(t in m.rows)) {
      problems.push(`STALE CLASSIFICATION: tests/restore-census.baseline.json names public.${t}, which no longer exists.`);
    }
  }

  // ── (3) The player-value manifest. The class of these is not negotiable. ──
  if (!manifest) {
    problems.push('tests/restore-census.baseline.json has no "player_value_tables" array.\n'
      + '      It is the manifest of tables whose DR class may not be downgraded.');
  } else if (manifest.length === 0) {
    problems.push('player_value_tables is empty. That silently disables the two checks that\n'
      + '      stop a red build being turned green by reclassification.');
  } else {
    for (const t of manifest) {
      if (!(t in m.rows)) {
        problems.push(`player_value_tables names public.${t}, which a rebuild does not create.`);
        continue;
      }
      const c = cls[t]?.class;
      if (c !== 'restore_only') {
        problems.push(
          `PLAYER-VALUE TABLE DOWNGRADED: public.${t} is classified "${c}".\n`
          + '      It is on the player-value manifest, so restore_only is the only legal\n'
          + '      class. If this table genuinely stopped holding player value, remove it\n'
          + '      from "player_value_tables" IN THE SAME CHANGE and say why there — the\n'
          + '      manifest exists so that decision cannot be made by editing one word.');
      }
    }
  }

  // ── (4) Every player-scoped table has been ruled on, one way or the other. ─
  for (const t of m.userScoped) {
    const onManifest = manifest ? manifest.includes(t) : false;
    const exemptNote = typeof exempt[t] === 'string' ? exempt[t].trim() : '';
    if (!onManifest && exemptNote.length < MIN_NOTE) {
      problems.push(
        `PLAYER-SCOPED TABLE WITH NO RULING: public.${t} has a user_id column, so it\n`
        + '      holds rows per player, and it is in neither the player-value manifest nor\n'
        + '      the exemption list.\n'
        + '      Either add it to "player_value_tables" (and classify it restore_only), or\n'
        + '      add it to "player_value_exempt" with a written reason for why losing every\n'
        + `      player's rows costs nothing.${exemptNote ? ' The reason given is too short to be one.' : ''}`);
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

// ── The restore-drill banner. Printed FIRST, on every path, pass or fail. ──
// It used to print LAST and only on SUCCESS, which meant the one fact this
// whole file exists to make uncomfortable — that no restore has ever been
// tested — was the thing you saw least.
function drillBanner(base) {
  const d = base?.restore_drill;
  const line = '─'.repeat(72);
  if (!d) return `┌${line}┐\n│ RESTORE DRILL: NOT EVEN RECORDED.\n└${line}┘`;
  if (!d.last_executed) {
    return `┌${line}┐\n`
      + '│ RESTORE DRILL: NEVER EXECUTED.  An untested backup is a rumour.\n'
      + `│ Runbook: ${d.runbook}\n`
      + '│ This census proves which rows a restore must CARRY. It does not prove\n'
      + '│ that a restore carries them, and nothing else in this repo does either.\n'
      + `└${line}┘`;
  }
  const age = Math.round((Date.now() - Date.parse(d.last_executed)) / 86400000);
  const rto = d.measured_rto ? `  measured RTO ${d.measured_rto}` : '';
  return `┌${line}┐\n│ RESTORE DRILL: last executed ${d.last_executed} (${age} day(s) ago).${rto}\n`
    + `│ Runbook: ${d.runbook}\n└${line}┘`;
}

// ── THE PRODUCTION HALF (--live-sql / --live-compare) ──────────────────────
// Blind spot (B): a credential-free replay cannot read the live database, so
// the `production` block is a measurement with a date on it. These two modes
// make re-measuring a ritual rather than an act of archaeology:
//
//   node tests/restore-census.mjs --live-sql            -> read-only SQL
//   node tests/restore-census.mjs --live-compare r.json -> classify the result
//
// No credentials live in the repo and none are needed: the SQL is pasted into
// whatever read-only path the operator already has (Supabase SQL editor, the
// MCP execute_sql tool) and the JSON result is fed back. It is READ-ONLY by
// construction — count(*) and catalogue reads, no DML, nothing to roll back.
//
// This is a PRE-APPLY RITUAL and deliberately NOT in CI: no database
// credential belongs in a workflow that runs third-party npm lifecycle scripts
// (see the `permissions:` note at the top of .github/workflows/smoke.yml).
//
// The table list is BUILT FROM THE BASELINE, never hand-copied — a second copy
// of the census's own table list is how a file and its remeasurement
// instructions drift apart.
function liveSql(base) {
  const tables = Object.keys(base.tables).sort();
  const counts = tables
    .map((t) => `  select 'row'::text as kind, '${t}'::text as name, count(*)::bigint as n, ''::text as txt from public.${t}`)
    .join('\n  union all\n');
  // The tunable projection names ONLY the columns the baseline already records
  // in `live_value`, rather than `to_jsonb(x)`. `hr_settings` carries a `note`
  // paragraph and an `updated_at`, and shipping the whole row made this check
  // fire on every single run — a comparison that is always red is a comparison
  // nobody reads. The consequence, stated: a column NOT in `live_value` is not
  // compared. Adding one to the recorded value is what starts watching it.
  const tunable = Object.entries(base.tables)
    .filter(([, s]) => s.class === 'operator_tunable')
    .map(([t, s]) => {
      const keys = Object.keys((s.live_value?.value || [{}])[0] || {});
      const obj = keys.length
        ? `jsonb_build_object(${keys.map((k) => `'${k}', x."${k}"`).join(', ')})`
        : 'to_jsonb(x)';
      return `  select 'tunable', '${t}', 0::bigint, (select coalesce(jsonb_agg(${obj} order by ${obj}::text)::text, '[]') from public.${t} x)`;
    })
    .join('\n  union all\n');
  return `-- READ-ONLY. Generated by: node tests/restore-census.mjs --live-sql
-- Run against production, save the rows as JSON, then:
--   node tests/restore-census.mjs --live-compare <result.json>
-- Nothing here writes. count(*) is deliberate: reltuples was wrong on two
-- tables at this size (bug_reports estimated 21, actual 27), and a DR census
-- that guesses is not a census.
${counts}
union all
${tunable}
union all
  select 'outside', 'auth.users', count(*)::bigint, '' from auth.users
union all
  select 'outside', 'auth.identities', count(*)::bigint, '' from auth.identities
union all
  select 'outside', 'auth.sessions', count(*)::bigint, '' from auth.sessions
union all
  select 'outside', 'auth.refresh_tokens', count(*)::bigint, '' from auth.refresh_tokens
union all
  select 'outside', 'storage.buckets', count(*)::bigint, '' from storage.buckets
union all
  select 'outside', 'storage.objects', count(*)::bigint, '' from storage.objects
union all
  select 'outside', 'supabase_migrations.schema_migrations', count(*)::bigint, ''
    from supabase_migrations.schema_migrations
union all
  select 'cron', jobname, 0::bigint, schedule || ' | ' || trim(command) from cron.job
union all
  select 'meta', 'db_bytes', pg_database_size(current_database()), ''
union all
  select 'meta', 'max_connections', current_setting('max_connections')::bigint, ''
union all
  select 'meta', 'connections_in_use', (select count(*) from pg_stat_activity), ''
order by 1, 2;

-- Backup posture is NOT in SQL. Read it from the Management API, also read-only:
--   curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \\
--     https://api.supabase.com/v1/projects/$PROJECT_REF/database/backups
--   curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \\
--     https://api.supabase.com/v1/projects/$PROJECT_REF/config/disk/util
-- \`pitr_enabled\` in the first response is the whole difference between a
-- 24-hour data-loss window and a minutes-long one.`;
}

/**
 * Classify what production returned against the baseline and against the replay.
 * @returns {string[]} findings — empty means production matches what is recorded.
 */
function liveCompare(base, replayRows, live) {
  const findings = [];
  const prodRows = new Map();
  const prodTunable = new Map();
  const prodCron = [];
  for (const r of live) {
    const kind = r.kind ?? r.KIND;
    const name = r.name ?? r.NAME;
    const n = Number(r.n ?? r.N ?? 0);
    const txt = r.txt ?? r.TXT ?? '';
    if (kind === 'row') prodRows.set(name, n);
    else if (kind === 'tunable') prodTunable.set(name, txt);
    else if (kind === 'cron') prodCron.push(`${name} | ${txt}`);
  }
  if (!prodRows.size) {
    const e = new Error('--live-compare: no "row" records in the JSON.\n'
      + '  Expected the rows produced by  node tests/restore-census.mjs --live-sql');
    e.harness = true; throw e;
  }

  for (const [t, spec] of Object.entries(base.tables)) {
    if (!prodRows.has(t)) {
      findings.push(`MISSING IN PRODUCTION: public.${t} is in the repo and in the census, and production did not report it.`);
      continue;
    }
    const p = prodRows.get(t);
    // The one that matters most: a catalogue the repo would rebuild DIFFERENTLY
    // from the one production is actually running. Every player row in the
    // backup was earned against production's copy.
    if (spec.class === 'seeded' && Number.isInteger(spec.replay) && p !== spec.replay) {
      findings.push(
        `CATALOGUE DIVERGENCE: public.${t} — production runs ${p} row(s), a rebuild from\n`
        + `      this repo produces ${spec.replay}. Reconcile BEFORE any rebuild or restore:\n`
        + '      a restored player earned their rows against production\'s copy.');
    }
  }
  for (const t of prodRows.keys()) {
    if (!(t in base.tables)) {
      findings.push(
        `TABLE IN PRODUCTION AND NOT IN THE CENSUS: public.${t}.\n`
        + '      Either the repo cannot rebuild it (a schema-drift problem) or the\n'
        + '      baseline is stale. Both are DR holes.');
    }
  }
  // Key ORDER must not be a finding: jsonb does not preserve it and the two
  // sides are built by different machines.
  const canon = (v) => JSON.stringify(v, (_k, x) => (
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x));
  for (const [t, txt] of prodTunable) {
    const rec = base.tables[t]?.live_value;
    if (!rec) continue;
    const was = canon(rec.value);
    let now = txt;
    try { now = canon(JSON.parse(txt)); } catch { /* compare as text */ }
    if (was !== now) {
      findings.push(
        `OPERATOR-TUNABLE ROW HAS MOVED: public.${t}\n`
        + `      recorded ${rec.measured}: ${was}\n`
        + `      production now:           ${now}\n`
        + '      A rebuild restores the AUTHORED DEFAULT, not either of these. Update\n'
        + '      "live_value" so a rebuild has the number to re-apply.');
    }
  }
  const wantCron = new Set(base.cron?.expected || []);
  const notObs = Object.keys(base.cron?.not_observable_in_replay || {});
  for (const j of prodCron) {
    const nm = j.split(' | ')[0];
    if (!wantCron.has(j) && !notObs.includes(nm)) {
      findings.push(
        `SCHEDULED JOB ON PRODUCTION THAT A REBUILD DOES NOT PRODUCE: ${j}\n`
        + '      Either a migration is missing from the repo, or it was scheduled by hand.\n'
        + '      A rebuilt database comes back without it.');
    }
  }
  for (const j of wantCron) {
    const nm = j.split(' | ')[0];
    if (!prodCron.some((p) => p.split(' | ')[0] === nm)) {
      findings.push(
        `SCHEDULED JOB THE REPO PRODUCES AND PRODUCTION DOES NOT HAVE: ${nm}\n`
        + '      Production is missing retention the rebuild would install.');
    }
  }

  // The point of the whole exercise: what a backup is carrying right now.
  const atRisk = Object.entries(base.tables)
    .filter(([, s]) => s.class === 'restore_only')
    .map(([t, s]) => [t, prodRows.get(t) ?? 0, s])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  console.log('\nRESTORE-ONLY ROWS LIVE ON PRODUCTION RIGHT NOW — a repo rebuild returns');
  console.log('these EMPTY. Only a backup has them:');
  let total = 0;
  for (const [t, n, s] of atRisk) {
    total += n;
    const flag = (base.player_value_tables || []).includes(t) ? ' [player value]' : '';
    console.log(`  ${String(n).padStart(7)}  public.${t}${s.wiped_at_cutover ? '   [was in scope for the cutover wipe]' : ''}${flag}`);
  }
  console.log(`  ${String(total).padStart(7)}  TOTAL rows that exist nowhere but the database and its backups`);
  console.log(`\nreplay produced ${Object.keys(replayRows).length} base tables; production reported ${prodRows.size}.`);

  return findings;
}

async function main() {
  // ── --live-sql: emit the read-only measurement query ─────────────────────
  if (argv.includes('--live-sql')) {
    const base = JSON.parse(await readFile(BASELINE, 'utf8'));
    console.log(liveSql(base));
    return;
  }

  // ── --live-compare <file>: classify what production returned ─────────────
  const cmpAt = argv.indexOf('--live-compare');
  if (cmpAt !== -1) {
    const file = argv[cmpAt + 1];
    if (!file) {
      const e = new Error('--live-compare needs the JSON file produced by running --live-sql on production');
      e.harness = true; throw e;
    }
    const base = JSON.parse(await readFile(BASELINE, 'utf8'));
    console.log(drillBanner(base));
    const live = JSON.parse(await readFile(file, 'utf8'));
    const m = await measure();
    const findings = liveCompare(base, m.rows, Array.isArray(live) ? live : live.rows || []);
    if (findings.length) {
      console.error('\nPRODUCTION DOES NOT MATCH WHAT THE CENSUS RECORDS.\n');
      for (const f of findings) console.error(`  · ${f}`);
      console.error(`\n${findings.length} finding(s).`);
      process.exit(1);
    }
    console.log('\nlive-compare: OK — production matches the recorded census.');
    return;
  }

  // ── --baseline-selftest: prove the CLASSIFICATION checks can fail ────────
  if (argv.includes('--baseline-selftest')) {
    const raw = await readFile(BASELINE, 'utf8');
    const m = await measure();

    const clean = compare(JSON.parse(raw), m);
    if (clean.length) {
      console.error('--baseline-selftest: the committed baseline is ALREADY failing, so a\n'
        + '  planted defect proves nothing. Fix the census first:\n  '
        + clean.map((p) => p.split('\n')[0]).join('\n  '));
      process.exit(2);
    }

    let slipped = 0;
    for (const [name, mut] of Object.entries(BASELINE_MUTATIONS)) {
      const b = JSON.parse(raw);
      mut.mutate(b);
      if (JSON.stringify(b) === JSON.stringify(JSON.parse(raw))) {
        console.error(`HARNESS  ${name}: the mutation changed nothing — the baseline shape has\n`
          + '           moved and this arm is planting a defect that is not there.');
        process.exit(2);
      }
      const problems = compare(b, m);
      const hit = problems.find((p) => mut.match.test(p));
      if (!hit) {
        console.error(`SLIPPED  ${name}\n           ${mut.what}\n`
          + `           Expected a problem matching ${mut.match}; got:\n`
          + (problems.length
            ? problems.map((p) => `             ${p.split('\n')[0]}`).join('\n')
            : '             (nothing at all)'));
        slipped++;
      } else {
        console.log(`caught   ${name.padEnd(34)}\n           ${mut.what}\n           -> ${hit.split('\n')[0]}`);
      }
    }
    if (slipped) {
      console.error(`\n${slipped} planted classification defect(s) slipped past the guard.`);
      process.exit(1);
    }
    console.log(`\nall ${Object.keys(BASELINE_MUTATIONS).length} planted classification defects caught`);
    return;
  }

  // ── --mutate: prove the MIGRATION checks can fail ────────────────────────
  if (argv.includes('--mutate')) {
    const base = JSON.parse(await readFile(BASELINE, 'utf8'));
    let slipped = 0;
    for (const [name, mut] of Object.entries(MUTATIONS)) {
      let caught = null;
      let detail = '';
      try {
        const m = await measure(new Map(mut.patches));
        const problems = compare(base, m);
        // `match`, where present, pins WHICH check fired. Several defects trip
        // more than one rule, and "a problem appeared" would let a broken arm
        // pass on a neighbour's evidence.
        const hit = mut.match ? problems.find((p) => mut.match.test(p)) : problems[0];
        if (hit) { caught = 'census'; detail = hit.split('\n')[0]; }
        else if (problems.length && mut.match) {
          console.error(`SLIPPED  ${name}\n           ${mut.what}\n`
            + `           ${problems.length} problem(s) fired, none matching ${mut.match} —\n`
            + '           the arm this mutation aims at did not see it.');
          slipped++;
          continue;
        }
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
        console.log(`caught   ${name.padEnd(28)} via ${caught}${note}\n           ${mut.what}\n           -> ${detail.trim()}`);
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
        ? { ...old, ...(PINNED.includes(old.class) ? { replay: m.rows[t] } : {}) }
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
    console.log('CLASSIFICATIONS ARE NOT GENERATED. --write preserves what is already there\n'
      + 'and stamps any NEW table with a placeholder the guard refuses. Decide each by hand.');
    return;
  }

  // ── the guard proper ─────────────────────────────────────────────────────
  let base;
  try { base = JSON.parse(await readFile(BASELINE, 'utf8')); }
  catch {
    console.error('no baseline — run: node tests/restore-census.mjs --write');
    process.exit(2);
  }

  // The drill banner prints FIRST and on BOTH paths. The un-run drill is the
  // most important fact this file knows; it does not get to scroll away.
  console.log(drillBanner(base));

  const problems = compare(base, m);
  if (problems.length) {
    console.error('\nRESTORE CENSUS FAILED — what a rebuild gives back has changed.\n');
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

  console.log(`\nrestore-census: OK — ${Object.keys(base.tables).length} tables classified, `
    + `${m.cron.length} scheduled job(s) reproduced by the chain, `
    + `${(base.player_value_tables || []).length} on the player-value manifest`);
  for (const c of CLASSES) console.log(`  ${c.padEnd(17)} ${(byClass[c] || []).length}`);

  console.log('\nRESTORE-ONLY, i.e. a repo rebuild returns these EMPTY — only a backup has them:');
  if (!atRisk.length) console.log('  (none held rows at the last production measurement)');
  let total = 0;
  for (const [t, n] of atRisk) {
    const spec = base.tables[t];
    total += n;
    const flag = (base.player_value_tables || []).includes(t) ? ' [player value]' : '';
    console.log(`  ${String(n).padStart(7)}  public.${t}${spec.wiped_at_cutover ? '   [was in scope for the cutover wipe]' : ''}${flag}`);
  }
  if (atRisk.length) {
    console.log(`  ${String(total).padStart(7)}  TOTAL rows held nowhere but the database and its backups`);
  }

  for (const [t, spec] of Object.entries(base.tables)) {
    if (spec.class === 'regenerated') {
      console.log(`\n⚠ REGENERATED — public.${t} rebuilds to the right COUNT and the wrong VALUE:`);
      console.log(`    ${spec.note}`);
    }
  }
  const tunable = byClass.operator_tunable || [];
  if (tunable.length) {
    console.log('\n⚠ OPERATOR-TUNABLE — a rebuild restores the AUTHORED DEFAULT and silently');
    console.log('  reverts whatever an operator has since set. Re-apply these by hand:');
    for (const t of tunable) {
      const lv = base.tables[t].live_value;
      console.log(`    public.${t}  (measured ${lv.measured})  ${JSON.stringify(lv.value)}`);
    }
  }

  for (const [t, s] of Object.entries(base.tables)) {
    if ((s.apply_residue || 0) > 0) {
      console.log(`\n⚠ APPLY RESIDUE — a rebuild leaves ${s.apply_residue} orphan row(s) in public.${t}:`);
      console.log(`    ${s.residue_note}`);
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
    console.log('replay cannot read the live database.  Re-measure:');
    console.log('  node tests/restore-census.mjs --live-sql              (read-only, run on prod)');
    console.log('  node tests/restore-census.mjs --live-compare out.json');
    if (age > 30) {
      console.log('\n  ⚠ Over 30 days old. Re-measure before any restore test or cutover step.');
    }
    const b = prod.backups;
    if (b) {
      console.log(`\nDURABILITY (measured ${b.measured}): ${b.plan}; ${b.retained_count} daily backup(s)`
        + ` retained; PITR ${b.pitr_enabled ? 'ENABLED' : 'OFF'}.`);
      console.log(`  Accepted data-loss window: ${b.data_loss_window}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(e.harness ? 2 : 1);
});
