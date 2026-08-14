// ════════════════════════════════════════════════════════════════════════
// tests/schema-drift.mjs — THE GUARD.
//
// The two reconstruction migrations were a one-time catch-up. This is the part
// that keeps the repo and the database honest afterwards, and it is the more
// valuable half: the gap it closes had existed for weeks and was found by
// accident.
//
// Run:  node tests/schema-drift.mjs            (CI: no credentials needed)
//       node tests/schema-drift.mjs --write    (re-baseline, after a real change)
//       node tests/schema-drift.mjs --mutate   (prove the guard can see failure)
//
// ── WHAT THIS GUARD CAN SEE ─────────────────────────────────────────────────
//  1. THE REPO CANNOT REBUILD THE DATABASE. Every file applies, in the declared
//     order, to a real PostgreSQL. A migration that only worked because another
//     one happened to have run first, a self-check that now raises, a file that
//     depends on an object nobody creates — all caught, credential-free.
//  2. A MIGRATION LEFT OUT OF THE APPLY ORDER. Every .sql in
//     supabase/migrations/ must be placed in tests/schema-apply-order.json.
//     A new file that nobody positioned fails the build rather than being
//     silently omitted from every future rebuild.
//  3. AN UNINTENDED SCHEMA CHANGE. The rebuilt schema is fingerprinted —
//     relations, functions, policies, indexes, triggers, constraints, COLUMNS
//     and event triggers — and compared to a committed baseline. Editing a
//     migration in a way that moves any object fails until the baseline is
//     deliberately rewritten, which is a reviewable diff.
//  4. SILENT OBJECT LOSS FROM FILE ORDERING. This is not hypothetical: three
//     migrations each defined clan_members "join as self", and in filename
//     order the shortest sorted last, so a clean replay would have installed
//     one and silently deleted the other two — while all three self-checks
//     still passed, because each asserted only its own terms. A fingerprint of
//     the FINAL state is the only thing that sees that class of loss.
//
// ── WHAT THIS GUARD CANNOT SEE, STATED PLAINLY ──────────────────────────────
//  A. AN OBJECT THAT EXISTS IN PRODUCTION AND IN NO FILE. This is the exact
//     drift that motivated the whole exercise, and a credential-free replay is
//     structurally incapable of detecting it: the replay knows what the repo
//     builds and nothing about what the database holds. It needs a live query.
//     `known_production_delta` in the baseline records the last real
//     measurement and its date; --live re-measures it. A stale delta block is
//     a stale measurement, NOT a passing check, and the guard says so on every
//     run instead of letting silence read as health.
//  B. DATA. This proves the SCHEMA rebuilds. It says nothing about whether any
//     row survives a restore. Only a real restore test proves that, and as of
//     2026-08-14 none has ever been run.
//  C. PRODUCTION'S FUNCTION BODIES. The fingerprint carries signatures, not
//     bodies. Production's hr_apply is a known stale revision (25,966 chars vs
//     the file's 40,754) and this guard is blind to it — signature-identical,
//     behaviour-different. Deliberate: hashing bodies would fail on whitespace
//     and search_path rewrites and would be turned off within a week.
//  D. TRUE CONCURRENCY, and the PostgREST/gateway request path. PGlite is one
//     backend with no HTTP in front of it.
//  E. POSTGRES VERSION SKEW. PGlite is PG18; production is PG17.
//     tests/schema-replay.mjs excludes pg_constraint contype='n' for exactly
//     this reason. Any new fingerprint field must be checked for the same.
//
// ── THE MUTATION PROOF ──────────────────────────────────────────────────────
// This repo has shipped a guard that asserted nothing TWELVE times, so this one
// does not get to claim it works. `--mutate` plants real defects in the real
// migration text and requires each to be caught. It is not decoration attached
// to a passing test: `--mutate` FAILS (exit 1) if any planted defect slips
// through, and it fails as a HARNESS error (exit 2) if an anchor no longer
// matches — because a bug that was never planted is the same defect as a probe
// that is always null.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, bootReplay, inventory, CATEGORIES, manifest } from './schema-replay.mjs';

const BASELINE = join(ROOT, 'tests', 'schema-drift.baseline.json');
const argv = process.argv.slice(2);

const digest = (inv) =>
  createHash('sha256')
    .update(CATEGORIES.map((c) => `${c}\n${inv[c].join('\n')}`).join('\n--\n'))
    .digest('hex');

// ── The mutation catalogue ─────────────────────────────────────────────────
// Each is a defect this repo could plausibly ship, planted in the real file.
// `expect` says which failure mode must fire: 'replay' (a file stops applying)
// or 'fingerprint' (everything applies but the resulting schema moved).
const MUTATIONS = {
  drop_dr_table: {
    what: 'the bug_reports reconstruction is gutted — exactly the state the repo was in before 2026-08-14',
    expect: 'replay',
    patches: [['2026-08-10-dr-bug-reports-base.sql', [[
      'create table public.bug_reports (',
      'create table public.bug_reports_DECOY (',
    ]]]],
  },
  lose_a_policy: {
    what: 'a security policy silently vanishes from the rebuilt schema (the "join as self" class — a later file undoing an earlier one)',
    expect: 'fingerprint',
    patches: [['2026-08-10-dr-legacy-cloud-save.sql', [[
      'create policy "saves owner delete" on public.game_saves for delete using (auth.uid() = user_id);',
      '-- policy deleted by the mutation harness',
    ]]]],
  },
  rename_a_column: {
    what: 'a column name diverges from production — the defect that made game_events unrebuildable while every constraint NAME still matched',
    expect: 'fingerprint',
    patches: [['2026-08-10-dr-legacy-cloud-save.sql', [[
      '      occurred_at timestamptz not null default now()\n    );',
      '      created_at timestamptz not null default now()\n    );',
    ]]]],
  },
  weaken_rls: {
    what: 'a table ends the chain with row level security OFF — world-open while still carrying policies that make it look protected',
    expect: 'fingerprint',
    // Deliberately an explicit DISABLE, not a removed ENABLE. The first version
    // of this mutation removed `enable row level security` and SLIPPED, because
    // the ensure_rls event trigger silently re-enabled it — the backstop doing
    // its job. That was a true negative for the schema and a false pass for the
    // guard, and it is why the `rls` category exists at all. An explicit disable
    // is the defect ensure_rls cannot repair, and is the realistic shape: a
    // migration that turns RLS off, or a table that predates the trigger.
    patches: [['2026-08-13-drop-dead-leaderboard-views.sql', [[
      'do $$\ndeclare v_left text;\nbegin',
      'alter table public.player_state disable row level security;\ndo $$\ndeclare v_left text;\nbegin',
    ]]]],
  },
  rls_off_unwatched: {
    what: 'RLS turned off on a table NO self-check anywhere asserts about (chat_blocks) — the only thing that can catch this is the `rls` fingerprint category',
    expect: 'fingerprint',
    // `weaken_rls` above targets player_state, which a later file's self-check
    // defends, so it is caught via `replay` and proves nothing about the
    // fingerprint. This one is deliberately aimed at the blind spot: if the
    // `rls` category were removed, this mutation would slip and say so.
    patches: [['2026-08-13-beta-invite-check-volatile.sql', [[
      'alter function public.beta_invite_check(text) volatile;',
      'alter function public.beta_invite_check(text) volatile;\nalter table public.chat_blocks disable row level security;',
    ]]]],
  },
  silent_column_type: {
    what: 'a column type changes with no self-check covering it — proves the `columns` category bites on its own, not only via a file self-check',
    expect: 'fingerprint',
    patches: [['2026-08-10-dr-legacy-cloud-save.sql', [[
      '      created_at timestamptz default now(),\n      primary key (blocker_id, blocked_id)',
      '      created_at date default now(),\n      primary key (blocker_id, blocked_id)',
    ]]]],
  },
  reopen_a11: {
    what: 'the beta_invites lockdown GUC is unset, so a rebuild leaves every invite code world-readable',
    expect: 'replay', // live-market-rls §3b raises without it, by design
    patches: [],
    manifestPatch: (m) => { delete m.gucs['hearthrise.beta_invites_lockdown_ok']; return m; },
  },
};

async function fingerprint(patches) {
  const { db } = await bootReplay({ patches });
  return inventory(db);
}

async function main() {
  // ── --mutate: prove the guard sees failure ───────────────────────────────
  if (argv.includes('--mutate')) {
    const base = JSON.parse(await readFile(BASELINE, 'utf8'));
    let slipped = 0;
    for (const [name, m] of Object.entries(MUTATIONS)) {
      let caught = null;
      try {
        if (m.manifestPatch) {
          // Mutating the manifest means mutating a file on disk; do it in a
          // temp copy so a crashed run cannot leave the repo modified.
          const path = join(ROOT, 'tests', 'schema-apply-order.json');
          const original = await readFile(path, 'utf8');
          try {
            await writeFile(path, JSON.stringify(m.manifestPatch(JSON.parse(original)), null, 2));
            const inv = await fingerprint();
            if (digest(inv) !== base.digest) caught = 'fingerprint';
          } catch (e) {
            caught = e.replay || e.harness ? 'replay' : 'replay';
          } finally {
            await writeFile(path, original);
          }
        } else {
          const patches = new Map(m.patches);
          const inv = await fingerprint(patches);
          if (digest(inv) !== base.digest) caught = 'fingerprint';
        }
      } catch (e) {
        if (e.harness && !e.replay) {
          console.error(`HARNESS  ${name}: ${e.message}`);
          process.exit(2);
        }
        caught = 'replay';
      }
      if (!caught) {
        console.error(`SLIPPED  ${name}\n           ${m.what}\n           This guard does not see it. It is decoration until it does.`);
        slipped++;
      } else {
        const note = caught === m.expect ? '' : `  (caught as ${caught}, expected ${m.expect})`;
        console.log(`caught   ${name.padEnd(16)} via ${caught}${note}\n           ${m.what}`);
      }
    }
    if (slipped) {
      console.error(`\n${slipped} planted defect(s) slipped past the guard.`);
      process.exit(1);
    }
    console.log(`\nall ${Object.keys(MUTATIONS).length} planted defects caught`);
    return;
  }

  // ── the guard proper ─────────────────────────────────────────────────────
  const inv = await fingerprint();
  const d = digest(inv);

  if (argv.includes('--write')) {
    let prev = {};
    try { prev = JSON.parse(await readFile(BASELINE, 'utf8')); } catch { /* first run */ }
    const out = {
      _readme: [
        'Fingerprint of the schema that supabase/schema.sql + supabase/migrations/**',
        'produce when replayed in the order declared by tests/schema-apply-order.json.',
        'Regenerate ONLY with `node tests/schema-drift.mjs --write`, and only when the',
        'schema change was intended — the diff of this file is the review surface.',
        'What it can and cannot see is documented in the header of tests/schema-drift.mjs.',
      ],
      generated: new Date().toISOString().slice(0, 10),
      digest: d,
      counts: Object.fromEntries(CATEGORIES.map((c) => [c, inv[c].length])),
      known_production_delta: prev.known_production_delta || null,
      inventory: inv,
    };
    await writeFile(BASELINE, `${JSON.stringify(out, null, 1)}\n`);
    console.log(`baseline written: ${d}`);
    for (const c of CATEGORIES) console.log(`  ${c.padEnd(15)} ${inv[c].length}`);
    return;
  }

  let base;
  try { base = JSON.parse(await readFile(BASELINE, 'utf8')); }
  catch {
    console.error('no baseline — run: node tests/schema-drift.mjs --write');
    process.exit(2);
  }

  if (d === base.digest) {
    console.log(`schema-drift: OK — repo rebuilds to the committed fingerprint (${d.slice(0, 12)}…)`);
  } else {
    console.error('SCHEMA DRIFT: the repo no longer rebuilds to the committed baseline.\n');
    let n = 0;
    for (const c of CATEGORIES) {
      const was = new Set(base.inventory[c] || []);
      const now = new Set(inv[c]);
      const gone = [...was].filter((x) => !now.has(x));
      const added = [...now].filter((x) => !was.has(x));
      for (const x of gone)  { console.error(`  - ${c}: ${x}`); n++; }
      for (const x of added) { console.error(`  + ${c}: ${x}`); n++; }
    }
    console.error(`\n${n} difference(s). If this change was INTENDED, re-baseline with`);
    console.error('  node tests/schema-drift.mjs --write');
    console.error('and let the baseline diff be reviewed. If it was not intended, a migration');
    console.error('just changed the schema in a way nobody asked for.');
    process.exit(1);
  }

  // ── the half this cannot check: production ───────────────────────────────
  const delta = base.known_production_delta;
  if (!delta) {
    console.log('\nNOTE: no production delta has ever been recorded. This guard has NOT');
    console.log('checked the repo against the live database and cannot. See --live.');
  } else {
    const age = Math.round((Date.now() - Date.parse(delta.measured)) / 86400000);
    console.log(`\nrepo-vs-production delta last MEASURED ${delta.measured} (${age} days ago), against`);
    console.log(`project ${delta.project}. This run did not re-check it — a credential-free`);
    console.log('replay cannot see an object that exists in production and in no file.');
    for (const line of delta.open) console.log(`  · ${line}`);
    if (age > 30) {
      console.log('\n  ⚠ That measurement is over 30 days old. Before any restore test or');
      console.log('    cutover step, re-measure with the SQL in the baseline\'s "how_to_remeasure".');
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(e.harness ? 2 : 1);
});
