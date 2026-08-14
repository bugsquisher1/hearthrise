// ════════════════════════════════════════════════════════════════════════
// tests/schema-replay.mjs — CAN THE REPO REBUILD THE DATABASE?
//
// After cutover the database is the ONLY copy of every player's progression.
// Disaster recovery rests on one assumption — "we can rebuild the schema from
// the repo" — and on 2026-08-14 that assumption was FALSE and had no test.
//
// This file is the replay engine: it applies supabase/schema.sql plus every
// file in supabase/migrations/** to a real PostgreSQL (PGlite, WASM, in
// process — no Docker, no credentials, production untouched) and reports what
// came out. tests/schema-drift.mjs is the guard built on top of it.
//
// ── WHY A FULL CHAIN AND NOT tests/pglite-chain.mjs ─────────────────────────
// pglite-chain.mjs boots the CLAN domain and conservation-fuzz.mjs boots the
// PLAYER-STATE bundle; each applies the subset its own guards need, and each
// SCAFFOLDS what its subset is missing. pglite-chain.mjs scaffolds
// public.bug_reports, public.beta_invites and public.claim_beta_invite — which
// is precisely how the reconstruction gap stayed invisible. A fixture that
// papers over a replay failure is worse than no fixture, because it makes the
// chain LOOK replayable. This file scaffolds nothing that a migration should
// own, and that is the whole point of it.
//
// ── WHAT THE FIXTURE MAY LEGITIMATELY SUPPLY ───────────────────────────────
// Only things a real Supabase project has BEFORE any migration runs, and that
// no migration in this repo creates:
//   · tests/sql/pglite-fixture.sql — auth.users, auth.uid(), the four Supabase
//     roles, the pg_cron shim. (profiles is also stubbed there; schema.sql
//     creates the real one on top.)
//   · SCAFFOLD below — the platform's base table grants + default privileges,
//     three auth.users columns, and `publication supabase_realtime`.
// If you ever find yourself adding a `create table` here to make the chain
// pass, STOP: that is a missing migration, and adding it here hides exactly
// the failure this file exists to expose.
//
// ── ORDER: tests/schema-apply-order.json ────────────────────────────────────
// FILENAME ORDER DOES NOT REPLAY. Measured 2026-08-14: 23 of 41 files apply,
// 18 fail — '2026-08-08-clan-seat-2.sql' sorts before '2026-08-08-clan-seat.sql'
// ('-' < '.'), and five 2026-08-11 files sort before the player-state
// foundation they depend on. Before that manifest existed, the order needed to
// rebuild the database was written down NOWHERE: two test files each held a
// hand-maintained const array covering a different subset. The manifest is now
// the single source of truth, and this engine fails if any file on disk is
// absent from it — a new migration must declare where it runs.
//
// ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
//   · An object that exists in PRODUCTION and in no file. The replay cannot
//     know what production has. That needs a live query — see
//     tests/schema-drift.mjs's `production` baseline block and its --live mode.
//   · Data. This proves the SCHEMA rebuilds, not that any row survives.
//   · TRUE CONCURRENCY. PGlite is one backend.
//   · PostgreSQL VERSION skew. PGlite here is PG18; production is PG17. The
//     inventory deliberately excludes pg_constraint contype='n' rows, because
//     PG18 materialises NOT NULL as catalogued constraints and PG17 does not —
//     484 vs 164 is a version artefact, not drift. Any future field added to
//     the inventory must be checked for the same class of skew.
// ════════════════════════════════════════════════════════════════════════

import { readFile, readdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIGDIR = join(ROOT, 'supabase', 'migrations');

export const MANIFEST_PATH = join(ROOT, 'tests', 'schema-apply-order.json');

export async function manifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}

/**
 * The chain, in declared order, reconciled against what is actually on disk.
 *
 * THIS RECONCILIATION IS THE POINT. A manifest that is merely read would drift
 * from the directory the first time someone added a migration and forgot it —
 * and the rebuild would silently omit that migration forever while the guard
 * stayed green. So every discrepancy in EITHER direction is fatal:
 *   · a .sql on disk that the manifest does not mention  -> unplaced migration
 *   · a manifest entry with no file                      -> stale entry
 *   · a duplicate entry                                  -> ambiguous order
 */
export async function chainFiles() {
  const m = await manifest();
  const onDisk = (await readdir(MIGDIR)).filter((f) => f.endsWith('.sql')).sort();
  const excluded = Object.keys(m.excluded || {});
  const pre = m.pre_schema || [];
  const declared = [...pre, ...m.order, ...excluded];

  const problems = [];
  const seen = new Set();
  for (const f of declared) {
    if (seen.has(f)) problems.push(`declared twice in the manifest: ${f}`);
    seen.add(f);
    if (!onDisk.includes(f)) problems.push(`manifest names a file that is not on disk: ${f}`);
  }
  for (const f of onDisk) {
    if (!seen.has(f)) {
      problems.push(
        `${f} is in supabase/migrations/ but in neither "order" nor "excluded" of\n`
        + '    tests/schema-apply-order.json. A migration that is not placed in the apply\n'
        + '    order would be silently omitted from any rebuild. Add it where it actually\n'
        + '    has to run — its date is not its position.');
    }
  }
  if (problems.length) {
    const e = new Error('APPLY-ORDER MANIFEST IS OUT OF SYNC WITH supabase/migrations/\n  - '
      + problems.join('\n  - '));
    e.harness = true; throw e;
  }

  return [
    ...pre.map((f) => [f, join(MIGDIR, f)]),
    ['schema.sql', join(ROOT, 'supabase', 'schema.sql')],
    ...m.order.map((f) => [f, join(MIGDIR, f)]),
  ];
}

// Platform-owned, pre-migration state. See the header for the rule.
const SCAFFOLD = `
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

create publication supabase_realtime;

alter table auth.users add column if not exists instance_id uuid;
alter table auth.users add column if not exists aud  text;
alter table auth.users add column if not exists role text;
`;

// GUCs come from the manifest — see its "gucs" block for why each is set.

/**
 * Apply the whole chain to a fresh in-process PostgreSQL.
 *
 * @param {object}  [opts]
 * @param {Map<string,[string,string][]>} [opts.patches] filename -> [[find,replace]]
 *        applied to that file's TEXT before execution. Every anchor must match
 *        EXACTLY ONCE and must change the text, or this throws — a planted bug
 *        that was never planted is decoration. Used by the mutation proof.
 * @param {boolean} [opts.tolerant] collect failures instead of throwing on the
 *        first one, so a diagnostic run reports the whole cascade.
 * @returns {Promise<{db:any, applied:string[], failures:{file:string,error:string}[]}>}
 */
export async function bootReplay({ patches, tolerant = false } = {}) {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    const e = new Error(
      '@electric-sql/pglite is not installed. This guard rebuilds a real\n'
      + '  PostgreSQL from the repo; without it there is nothing to assert against\n'
      + '  and a "pass" would be meaningless.  npm i -D @electric-sql/pglite');
    e.harness = true; throw e;
  }

  const files = await chainFiles();
  const sources = new Map();
  for (const [name, path] of files) {
    // LF in memory only — the migrations are checked in with CRLF on Windows
    // and patch anchors are written with LF.
    sources.set(name, (await readFile(path, 'utf8')).replace(/\r\n/g, '\n'));
  }

  if (patches) {
    for (const [name, list] of patches) {
      let sql = sources.get(name);
      if (sql === undefined) {
        const e = new Error(`patch names a file not in the chain: "${name}"`);
        e.harness = true; throw e;
      }
      for (const [find, replace] of list) {
        const n = sql.split(find).length - 1;
        if (n !== 1) {
          const e = new Error(
            `patch anchor matched ${n} times in ${name} (need exactly 1).\n`
            + '  The migration text has moved. Fix the anchor rather than letting the\n'
            + '  mutation silently no-op.');
          e.harness = true; throw e;
        }
        const after = sql.replace(find, replace);
        if (after === sql) {
          const e = new Error(`patch on ${name} produced identical SQL`);
          e.harness = true; throw e;
        }
        sql = after;
      }
      sources.set(name, sql);
    }
  }

  const db = await PGlite.create();
  for (const [k, v] of Object.entries((await manifest()).gucs || {})) {
    if (k.startsWith('_')) continue;
    await db.exec(`select set_config('${k.replace(/'/g, "''")}','${String(v).replace(/'/g, "''")}',false)`);
  }
  await db.exec(await readFile(join(ROOT, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8'));
  await db.exec(SCAFFOLD);

  const applied = [];
  const failures = [];
  for (const [name] of files) {
    // Wrapped, because that is how a file is applied on this project: atomically.
    // A self-check `raise` must abort the whole file, not leave half installed.
    try {
      await db.exec(`begin;\n${sources.get(name)}\ncommit;`);
      applied.push(name);
    } catch (err) {
      await db.exec('rollback').catch(() => {});
      const rec = { file: name, error: String(err && err.message || err).split('\n')[0] };
      failures.push(rec);
      if (!tolerant) {
        const e = new Error(
          `THE REPO CANNOT REBUILD THE DATABASE.\n`
          + `  ${name} failed to apply: ${rec.error}\n`
          + '  A file that cannot replay is a hole in disaster recovery, not a test\n'
          + '  failure. Run  node tests/schema-replay.mjs --list  for the full cascade.');
        e.replay = true; e.failures = failures; throw e;
      }
    }
  }
  return { db, applied, failures };
}

// ── The inventory: what a rebuilt database actually contains ───────────────
// Every field is a SORTED list of NAMES, so a diff names the object rather than
// reporting "count changed from 71 to 70" and leaving someone to find it.
const QUERIES = {
  relations: `select c.relkind::text||' '||c.relname::text as nm
                from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relkind in ('r','v','m','S') order by 1`,
  functions: `select p.proname::text||'('||pg_get_function_identity_arguments(p.oid)||')' as nm
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' order by 1`,
  policies:  `select tablename||' :: '||policyname as nm
                from pg_policies where schemaname='public' order by 1`,
  indexes:   `select indexname::text as nm from pg_indexes where schemaname='public' order by 1`,
  triggers:  `select c.relname::text||' :: '||t.tgname::text as nm
                from pg_trigger t join pg_class c on c.oid=t.tgrelid
                join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and not t.tgisinternal order by 1`,
  // contype <> 'n': PG18 catalogues NOT NULL as a constraint row, PG17 does not.
  // Including them would diff 484 against 164 on a version difference alone.
  constraints: `select c.relname::text||' :: '||co.conname::text as nm
                  from pg_constraint co
                  join pg_class c on c.oid=co.conrelid
                  join pg_namespace n on n.oid=co.connamespace
                 where n.nspname='public' and co.contype <> 'n' order by 1`,

  // ── COLUMNS. Added 2026-08-14 because the name-only inventory above REPORTED
  // game_saves AND game_events AS IDENTICAL between the repo and production
  // while production had event_type/occurred_at and the repo had kind/created_at,
  // and while production keyed game_saves on (id) and the repo on (user_id,slot).
  // A constraint keeps its NAME when the column beneath it changes, so
  // game_events_pkey, game_events_user_id_fkey and game_events_retention_idx all
  // matched across a total divergence. An inventory of names is an assertion that
  // asserts almost nothing about a table; this is the field that gives it teeth.
  columns: `select c.relname::text||'.'||a.attname::text||' '
                   ||format_type(a.atttypid, a.atttypmod)
                   ||case when a.attnotnull then ' NOT NULL' else '' end
                   ||case when a.attgenerated <> '' then ' GENERATED' else '' end as nm
              from pg_attribute a
              join pg_class c on c.oid = a.attrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname='public' and c.relkind in ('r','v','m')
               and a.attnum > 0 and not a.attisdropped order by 1`,

  // ── RLS STATE. Added 2026-08-14 after the mutation proof caught the guard
  // missing: `--mutate weaken_rls` stripped `enable row level security` from a
  // reconstructed table and NOTHING noticed, because the fingerprint recorded
  // which tables and policies exist but never whether RLS was actually ON. A
  // table with policies and RLS disabled reads as fully protected in every
  // other category here while being world-open — the worst possible defect to
  // be blind to, on a database that is about to be the only copy of every
  // player's progression.
  rls: `select c.relname::text||' rls='||c.relrowsecurity::text
                ||' force='||c.relforcerowsecurity::text as nm
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='r' order by 1`,

  // Event triggers are NOT in the `public` schema — they are cluster-scoped — so
  // every other category here is blind to them. `ensure_rls` (the DDL trigger
  // that enables RLS on every new public table) lived in production and in no
  // file, and nothing in this repo could have noticed. Platform-owned triggers
  // (supabase_admin) are excluded; only ones this project owns are our problem.
  event_triggers: `select et.evtname::text||' on '||et.evtevent::text as nm
                     from pg_event_trigger et
                    where pg_get_userbyid(et.evtowner) not in ('supabase_admin')
                    order by 1`,
};

export const CATEGORIES = Object.keys(QUERIES);

/** @returns {Promise<Record<string,string[]>>} */
export async function inventory(db) {
  const out = {};
  for (const [k, sql] of Object.entries(QUERIES)) {
    out[k] = (await db.query(sql)).rows.map((r) => r.nm);
  }
  return out;
}

// ── CLI: diagnostics ───────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('schema-replay.mjs')) {
  const argv = process.argv.slice(2);
  const run = async () => {
    if (argv.includes('--list')) {
      const { applied, failures } = await bootReplay({ tolerant: true });
      const files = await chainFiles();
      for (const [name] of files) {
        const bad = failures.find((f) => f.file === name);
        console.log(bad ? `FAIL  ${name}\n        ${bad.error}` : `ok    ${name}`);
      }
      console.log(`\n${applied.length}/${files.length} applied`);
      for (const [f, why] of Object.entries((await manifest()).excluded || {})) {
        console.log(`skip  ${f}\n        ${why}`);
      }
      process.exit(failures.length ? 1 : 0);
    }
    const { db } = await bootReplay();
    const inv = await inventory(db);
    if (argv.includes('--json')) console.log(JSON.stringify(inv, null, 1));
    else for (const k of CATEGORIES) console.log(`${k.padEnd(12)} ${inv[k].length}`);
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e.message);
    process.exit(e.harness ? 2 : 1);
  });
}
