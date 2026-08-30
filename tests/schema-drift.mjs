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
//       node tests/schema-drift.mjs --live-sql             (read-only SQL for prod)
//       node tests/schema-drift.mjs --live-compare r.json  (classify the result)
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
//     measurement and its date; `--live-sql` + `--live-compare` re-measure it
//     (two steps, because the credentials deliberately live outside this repo).
//     A stale delta block is a stale measurement, NOT a passing check, and the
//     guard says so on every run instead of letting silence read as health.
//     ⚠ Until 2026-08-30 this header promised a `--live` mode that had never
//     been implemented — the one instruction for closing the guard's only
//     structural blind spot pointed at nothing. Measured that day: production
//     agreed with the replay on 7 of 9 categories BYTE FOR BYTE, and the two
//     that disagreed are both recorded in `acknowledged` below.
//  B. DATA. This proves the SCHEMA rebuilds. It says nothing about whether any
//     row survives a restore. Only a real restore test proves that, and as of
//     2026-08-14 none has ever been run.
//  C. PRODUCTION'S FUNCTION BODIES. The fingerprint carries signatures, not
//     bodies, so a signature-identical / behaviour-different function is
//     invisible here. Deliberate: hashing bodies would fail on whitespace and
//     search_path rewrites and would be turned off within a week.
//     RE-MEASURED 2026-08-30 (the old note here — "hr_apply is a known stale
//     revision, 25,966 chars vs the file's 40,754" — was itself three revisions
//     stale, which is how a real warning becomes noise people scroll past):
//       hr_apply       production 82,410 chars vs replay 82,548. The whole
//                      138-char delta is ONE two-line comment ("rested-record
//                      (b437): the ABSOLUTE bank…") present in the file and not
//                      in the deployed body. Code identical, behaviour identical.
//       hr_rpc_gate    md5-identical to the replay (the hotfix restore was
//                      folded back into the repo correctly).
//       hr_cron_health md5-identical.
//     Spot-checked, not exhaustive: 3 of 261. Localising that delta cost two
//     queries (chunked md5 over prosrc, then one substr) — cheap enough to be
//     worth doing for any function whose behaviour is ever in question.
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
import { ROOT, bootReplay, inventory, CATEGORIES, manifest, QUERIES } from './schema-replay.mjs';

const BASELINE = join(ROOT, 'tests', 'schema-drift.baseline.json');
const argv = process.argv.slice(2);

// ── THE PRODUCTION HALF (--live-sql / --live-compare), added 2026-08-30 ─────
// Blind spot (A) in the header: a credential-free replay cannot see an object
// that exists in production and in no file. That was answered by `open` prose in
// the baseline, MEASURED ONCE on 2026-08-14 and never again — and prose does not
// go red. These two modes make the measurement a repeatable ritual instead:
//
//   node tests/schema-drift.mjs --live-sql            -> read-only SQL to run on prod
//   node tests/schema-drift.mjs --live-compare r.json -> classify what came back
//
// No credentials live in the repo and none are needed: the SQL is pasted into
// whatever read-only path the operator already has (Supabase SQL editor, the
// MCP execute_sql tool), and the JSON result is fed back. Every divergence must
// be named in the baseline's known_production_delta.acknowledged or the compare
// exits 1 — so a NEW hand-patch on production goes red the first time anyone
// looks, and an acknowledged one that got fixed also goes red, so the list
// cannot rot in the other direction.
//
// The SQL is BUILT FROM `QUERIES` in schema-replay.mjs, never copied. A
// hand-copied second version of these catalog queries is how the repo and its
// own remeasurement instructions drift apart.
// Categories whose names carry a table prefix, so a mismatch can be narrowed to
// one table without shipping every name over the wire. columns -> "tbl.col …",
// constraints -> "tbl :: name".
const PER_TABLE = ['columns', 'constraints'];
const tableOfSql = "case when cat='columns' then split_part(nm,'.',1) else split_part(nm,' :: ',1) end";
const tableOfJs = (cat, nm) => (cat === 'columns' ? nm.split('.')[0] : nm.split(' :: ')[0]);

function liveSqlLevel1() {
  const parts = CATEGORIES.map((c) => `  select '${c}'::text as cat, nm from (${QUERIES[c]}) q_${c}`);
  return `-- READ-ONLY. Generated by: node tests/schema-drift.mjs --live-sql
-- Run against production, then: node tests/schema-drift.mjs --live-compare <result.json>
with p as (
${parts.join('\n  union all\n')}
)
select 'cat'::text as kind, cat as name, count(*)::int as n,
       md5(string_agg(nm, chr(10) order by nm)) as sum
  from p group by cat
union all
select 'tbl', cat||' '||${tableOfSql},
       count(*)::int, md5(string_agg(nm, chr(10) order by nm))
  from p where cat in (${PER_TABLE.map((c) => `'${c}'`).join(',')}) group by 2
order by 1, 2;`;
}

function liveSqlLevel2(cat) {
  if (!CATEGORIES.includes(cat)) {
    const e = new Error(`unknown category "${cat}". One of: ${CATEGORIES.join(', ')}`);
    e.harness = true; throw e;
  }
  return `-- READ-ONLY. Full object list for the "${cat}" category.
select '${cat}'::text as kind, nm as name, 0::int as n, ''::text as sum
  from (${QUERIES[cat]}) q order by 2;`;
}

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');

/** Local equivalent of the level-1 query, computed from a replay inventory. */
function localLevel1(inv) {
  const cat = new Map();
  const tbl = new Map();
  for (const c of CATEGORIES) {
    const list = [...inv[c]].sort();
    cat.set(c, [list.length, md5(list.join('\n'))]);
    if (!PER_TABLE.includes(c)) continue;
    const g = new Map();
    for (const nm of list) {
      const t = tableOfJs(c, nm);
      if (!g.has(t)) g.set(t, []);
      g.get(t).push(nm);
    }
    for (const [t, l] of g) tbl.set(`${c} ${t}`, [l.length, md5(l.sort().join('\n'))]);
  }
  return { cat, tbl };
}

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
    // Was 'fingerprint'. Re-measured 2026-08-30: the rename is now caught EARLIER,
    // as a replay failure, because the file's own self-check and then
    // 2026-08-23-game-events-bounds.sql both reference occurred_at/event_type. That
    // is stronger, not weaker — but it means this mutation no longer exercises the
    // `columns` fingerprint category. `silent_column_type` below still does, and is
    // the one to keep if these two are ever consolidated.
    expect: 'replay',
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
    what: 'RLS turned off on a table no file-specific self-check asserts about (chat_blocks)',
    // Was 'fingerprint', on the reasoning that nothing else watched chat_blocks.
    // Re-measured 2026-08-30: 2026-08-23-client-grant-narrowing.sql now asserts
    // RLS is ON across the whole public schema and raises
    //   "RLS is OFF on chat_blocks — fix that FIRST; grants are the second lock"
    // so this is caught as a replay failure, by a check that fires DURING the
    // rebuild rather than after it. Strictly better coverage; the expectation is
    // corrected rather than the check weakened.
    //
    // THE `rls` FINGERPRINT CATEGORY IS STILL PROVEN — by `weaken_rls` above,
    // which lands after that global assertion and is caught via `fingerprint`.
    // Until 2026-08-30 it was NOT: a `$$`-mangling bug in the patcher turned that
    // mutation into a syntax error, so it passed as a replay catch and the `rls`
    // category had no live proof at all. If `weaken_rls` ever stops reporting
    // `via fingerprint`, the category is unproven again and needs a new arm.
    expect: 'replay',
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
  /* ── b353: THE DETECTOR'S OWN THREE ARMS ──────────────────────────────
     2026-08-16-engine-allowlist-claim-perks.sql restates hr_assert_grant_hygiene
     in order to record two reviewed engine grants. That is the one restatement
     in this repo whose damage is SILENT: a dropped check reads as a clean night.
     So each of its load-bearing arms gets a planted defect here, because "the
     migration applied" is not evidence that any of them can see failure. */
  blind_engine_pin: {
    what: 'the widened allowlist ships with check (7) neutered — the detector can no longer see ANY unlisted engine grant, which is what "stop the detector raising" looks like when it is done the wrong way',
    expect: 'replay', // §4(C)'s mutation arm raises DETECTOR IS BLIND
    patches: [['2026-08-16-engine-allowlist-claim-perks.sql', [[
      '       and p.oid::regprocedure::text <> all (c_engine_allow);',
      '       and false;   -- neutered by the mutation harness',
    ]]]],
  },
  allowlist_deletes_an_entry: {
    what: 'the LIVE detector carries an engine capability the new file does not, so applying it would silently delete a reviewed grant — the clan_members "join as self" defect aimed at the allowlist',
    expect: 'replay', // §1(a) refuses to install and names the entry
    patches: [['2026-08-11-grant-hygiene.sql', [[
      "    'hr_apply(uuid,integer,bigint,uuid,jsonb)',",
      "    'hr_apply(uuid,integer,bigint,uuid,jsonb)',\n    'hr_ghost_capability(uuid)',",
    ]]]],
  },
  allowlist_partial_hand_edit: {
    what: 'the LIVE detector already carries ONE of the two entries — somebody edited the allowlist by hand and the migration would overwrite that decision',
    expect: 'replay', // §1(c) refuses on exactly-one-of-two
    patches: [['2026-08-11-grant-hygiene.sql', [[
      "    'hr_rate_gate(uuid,integer,text)'\n  ];",
      "    'hr_rate_gate(uuid,integer,text)',\n    'hr_perks_of(uuid,integer)'\n  ];",
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

/**
 * Pure classifier: production's rows vs a replay inventory. No IO, no exit — so
 * --live-selftest can plant divergences and require each to be reported.
 * @returns {{findings:{key:string,detail:string}[], provenCats:string[]}}
 */
function classifyLive(rows, inv) {
  const local = localLevel1(inv);
  const findings = [];          // {key, detail}

  const catRows = rows.filter((r) => r.kind === 'cat');
  const tblRows = rows.filter((r) => r.kind === 'tbl');
  const objRows = rows.filter((r) => CATEGORIES.includes(r.kind));

  // Level 1, per category. A category whose count AND hash match is proven
  // identical to production — no names needed.
  const badCats = new Set();
  for (const r of catRows) {
    const l = local.cat.get(r.name);
    if (!l) { findings.push({ key: `cat ${r.name}`, detail: 'category exists on production, not in the replay' }); continue; }
    if (l[0] !== Number(r.n) || l[1] !== r.sum) badCats.add(r.name);
  }
  for (const c of CATEGORIES) {
    if (!catRows.some((r) => r.name === c)) {
      findings.push({ key: `cat ${c}`, detail: 'the live result carries no row for this category — partial measurement' });
    }
  }

  // Level 1, per table — narrows a bad category to the tables responsible.
  const explained = new Set();
  for (const r of tblRows) {
    const key = `tbl ${r.name}`;
    const l = local.tbl.get(r.name);
    const [cat] = r.name.split(' ');
    if (!l) { findings.push({ key, detail: `on production with ${r.n} ${cat}, absent from the replay` }); explained.add(cat); continue; }
    if (l[0] !== Number(r.n) || l[1] !== r.sum) {
      findings.push({ key, detail: `production ${r.n}/${r.sum.slice(0, 8)} vs repo ${l[0]}/${l[1].slice(0, 8)}` });
      explained.add(cat);
    }
  }
  for (const [name, l] of local.tbl) {
    const key = `tbl ${name}`;
    if (tblRows.length && !tblRows.some((r) => r.name === name)) {
      findings.push({ key, detail: `built by the repo with ${l[0]} entries, absent on production` });
      explained.add(name.split(' ')[0]);
    }
  }

  // Level 2, exact names, for whatever categories were fetched in detail.
  const byCat = {};
  for (const r of objRows) (byCat[r.kind] = byCat[r.kind] || []).push(r.name);
  for (const [cat, names] of Object.entries(byCat)) {
    const prod = new Set(names);
    const repo = new Set(inv[cat]);
    for (const x of prod) if (!repo.has(x)) findings.push({ key: `obj ${cat} ${x}`, detail: 'on production, built by no file in the repo' });
    for (const x of repo) if (!prod.has(x)) findings.push({ key: `obj ${cat} ${x}`, detail: 'built by the repo chain, ABSENT on production' });
    explained.add(cat);
  }

  // A category that disagrees and that nothing above accounted for is an
  // UNRESOLVED measurement, not a pass — say so and name the drill-down.
  for (const c of badCats) {
    if (explained.has(c)) continue;
    findings.push({
      key: `cat ${c}`,
      detail: `disagrees with production and has no per-table breakdown — re-run with `
        + `\`node tests/schema-drift.mjs --live-sql=${c}\` and compare again`,
    });
  }

  return {
    findings,
    provenCats: CATEGORIES.filter((c) => !badCats.has(c) && catRows.some((r) => r.name === c)),
  };
}

/**
 * Classify what production returned against a fresh replay of the repo.
 * Exit 1 on any divergence that is not acknowledged in the baseline, and on any
 * acknowledged divergence that is no longer there (the list must not rot).
 */
async function liveCompare(file) {
  let rows;
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    // Accept either the bare array or {result:[…]} / {rows:[…]} wrappers, since
    // different consoles hand it back differently.
    rows = Array.isArray(raw) ? raw : (raw.result || raw.rows);
    if (!Array.isArray(rows)) throw new Error('not an array of rows');
  } catch (e) {
    const err = new Error(`could not read live result "${file}": ${e.message}\n`
      + '  Expected the JSON rows from  node tests/schema-drift.mjs --live-sql');
    err.harness = true; throw err;
  }

  const base = JSON.parse(await readFile(BASELINE, 'utf8'));
  const ack = new Map(
    ((base.known_production_delta || {}).acknowledged || []).map((a) => [a.key, a]));
  const inv = await fingerprint();
  const { findings, provenCats } = classifyLive(rows, inv);

  console.log('repo-vs-production, measured against the replay of this working tree');
  console.log(`  categories proven byte-identical: ${provenCats.join(', ') || '(none)'}`);

  let unacked = 0; let resolved = 0;
  for (const f of findings) {
    const a = ack.get(f.key);
    if (a) { console.log(`  acknowledged  ${f.key}\n                  ${f.detail}\n                  → ${a.why}`); }
    else { console.error(`  UNACKNOWLEDGED  ${f.key}\n                  ${f.detail}`); unacked++; }
  }
  for (const [key, a] of ack) {
    if (findings.some((f) => f.key === key)) continue;
    console.error(`  RESOLVED  ${key} is no longer divergent — remove it from`);
    console.error(`            known_production_delta.acknowledged in the baseline.`);
    console.error(`            It was: ${a.why}`);
    resolved++;
  }

  if (unacked || resolved) {
    console.error(`\n${unacked} unacknowledged divergence(s), ${resolved} stale acknowledgement(s).`);
    console.error('An object that exists in production and in no file is the drift this');
    console.error('guard cannot otherwise see. Explain it, fix it, or acknowledge it in');
    console.error('the baseline with a reason and a date — silence is not a measurement.');
    process.exit(1);
  }
  console.log(`\nlive delta: ${findings.length} divergence(s), all acknowledged. Record the date in`);
  console.log('known_production_delta.measured.');
}

/**
 * --live-selftest: PROVE the production comparison can see failure.
 *
 * This repo has shipped a guard that asserted nothing twelve times, and the
 * production delta in particular sat as unfalsifiable prose from 2026-08-14 to
 * 2026-08-30. A comparison that has only ever been run against a database that
 * agrees with it is not evidence. So: synthesize the result a production
 * IDENTICAL to the repo would return, plant one real divergence at a time, and
 * require each to be reported. Needs no credentials — it runs in CI.
 */
async function liveSelftest() {
  const inv = await fingerprint();
  const local = localLevel1(inv);
  const clean = [
    ...[...local.cat].map(([name, [n, sum]]) => ({ kind: 'cat', name, n, sum })),
    ...[...local.tbl].map(([name, [n, sum]]) => ({ kind: 'tbl', name, n, sum })),
  ];

  // Sanity: an identical production must produce ZERO findings, or every case
  // below would "pass" on the noise floor rather than on the planted defect.
  const base = classifyLive(clean, inv);
  if (base.findings.length) {
    const e = new Error(
      `--live-selftest: a production identical to the repo produced ${base.findings.length}\n`
      + `  finding(s) — the comparison has a false-positive floor and every case below\n`
      + `  would pass for the wrong reason. First: ${base.findings[0].key}`);
    e.harness = true; throw e;
  }
  if (base.provenCats.length !== CATEGORIES.length) {
    const e = new Error('--live-selftest: an identical production did not prove every category');
    e.harness = true; throw e;
  }

  const anyTbl = clean.find((r) => r.kind === 'tbl');
  const CASES = {
    prod_only_table: {
      what: 'a table exists in production and in NO file — the exact drift that motivated this guard',
      expect: 'tbl columns hr_forgotten_hotfix',
      rows: () => [...clean, { kind: 'tbl', name: 'columns hr_forgotten_hotfix', n: 3, sum: 'f'.repeat(32) }],
    },
    repo_only_table: {
      what: 'a table the repo chain builds is ABSENT on production — a migration that never actually applied',
      expect: `tbl ${anyTbl.name}`,
      rows: () => clean.filter((r) => r !== anyTbl),
    },
    changed_table: {
      what: 'a table whose shape diverges — the hand-patched-column class (hr_crops nullability)',
      expect: `tbl ${anyTbl.name}`,
      rows: () => clean.map((r) => (r === anyTbl ? { ...r, sum: '0'.repeat(32) } : r)),
    },
    changed_unbreakdownable_category: {
      what: 'a category with no per-table breakdown disagrees (a policy or function on production and in no file) — must NOT read as a pass',
      expect: 'cat policies',
      rows: () => clean.map((r) => (r.kind === 'cat' && r.name === 'policies' ? { ...r, sum: '0'.repeat(32) } : r)),
    },
    partial_measurement: {
      what: 'the operator pasted back an incomplete result — silence about a category must not read as agreement',
      expect: 'cat functions',
      rows: () => clean.filter((r) => !(r.kind === 'cat' && r.name === 'functions')),
    },
  };

  let slipped = 0;
  for (const [name, c] of Object.entries(CASES)) {
    const { findings } = classifyLive(c.rows(), inv);
    const hit = findings.find((f) => f.key === c.expect);
    if (hit) console.log(`caught   ${name.padEnd(32)} ${hit.key}\n           ${c.what}`);
    else {
      console.error(`SLIPPED  ${name}\n           ${c.what}\n`
        + `           expected a finding keyed "${c.expect}"; got: `
        + `${findings.map((f) => f.key).join(', ') || '(nothing)'}`);
      slipped++;
    }
  }
  if (slipped) {
    console.error(`\n${slipped} planted production divergence(s) went unreported.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(CASES).length} planted production divergences reported`);
}

async function main() {
  // ── --live-selftest: prove the production comparison can fail ────────────
  if (argv.includes('--live-selftest')) { await liveSelftest(); return; }

  // ── --live-sql[=category]: emit the read-only measurement query ──────────
  const sqlArg = argv.find((a) => a === '--live-sql' || a.startsWith('--live-sql='));
  if (sqlArg) {
    console.log(sqlArg.includes('=') ? liveSqlLevel2(sqlArg.split('=')[1]) : liveSqlLevel1());
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
    await liveCompare(file);
    return;
  }

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
