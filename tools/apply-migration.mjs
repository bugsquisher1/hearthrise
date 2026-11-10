// ============================================================================
// tools/apply-migration.mjs — apply a staged migration to ONE NAMED PROJECT from
// FILE BYTES, then verify what landed against the repo's own replay truth.
//
// Why this exists: the apply path was ad-hoc (node -e body build + curl), and
// an ad-hoc path is exactly what a permission classifier cannot recognise as
// routine. This script IS the routine: one named tool, one narrow allow rule.
//
//   node tools/apply-migration.mjs <migration-filename> --env staging
//   node tools/apply-migration.mjs <migration-filename> --env production
//   node tools/apply-migration.mjs <migration-filename> --verify-only [--env …]
//
// THE PROJECT IS NAMED, EVERY TIME (tools/lib/env.mjs, lane/a-staging). An apply
// with no --env refuses and sends nothing. The first line printed is the project.
// Before the SQL leaves, the project is asked its own name: staging's must say
// staging, production's must not.
//
// STAGING FIRST. Once staging is set up on this machine (~/.hearthrise/envs.json
// has staging.ref), a production apply refuses a file whose exact bytes were not
// applied to staging from here first (~/.hearthrise/staging-applied.json, a
// sha256 per file). --skip-staging="<why>" is the stated decision to go without.
//
// What it does:
//   1. Reads supabase/migrations/<file> — the exact committed bytes, nothing
//      hand-typed and nothing passing through a model's output.
//   2. POSTs it to api.supabase.com's database/query endpoint with the token
//      from the env's token file (never printed, never argv).
//   3. VERIFIES: re-reads md5(prosrc) of every function the file
//      creates-or-replaces from that project and prints them, so the caller can
//      compare against the PGlite replay's values. A migration whose
//      self-checks raised will have been rolled back whole — this script
//      treats any HTTP error body as a hard failure and says so.
//
// supabase/schema.sql is never sent from here: it drops live tables (§1b) and
// belongs only to a first build of staging (tools/staging-bootstrap.local.mjs).
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../tests/_is-main.mjs';
import { resolveEnv, assertIdentity, queryDb, runTool, EnvRefusal } from './lib/env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: node tools/apply-migration.mjs <migration-filename>.sql --env staging|production [--verify-only] [--skip-staging="<why>"]';

/* A LOCK WAIT IS BOUNDED (lane/c-reliability-basics, 2026-10-30). The file runs as ONE implicit
   transaction, so `set local` holds for every statement in it and ends with it. Without a bound, a
   statement that wants ACCESS EXCLUSIVE on a hot table (player_state, hunt_sessions) queues behind the
   settles in flight, and every settle after it queues behind the migration: the world stalls for as
   long as the wait lasts. 2026-10-29 08:37 UTC an apply deadlocked with the world tick on player_state /
   hunt_sessions (cron.job_run_details, hr-tick-run). Settle transactions hold their locks well under a
   second (live: hr_hunt_apply_instance 0.36-0.46 s), so 5 s only refuses a wait that was going to stall
   players; the file is then rolled back whole (lock_not_available) and re-applied a minute later. */
export const LOCK_BOUND = "set local lock_timeout = '5s';\n";

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Which functions a file creates-or-replaces: parsed from its own bytes, so the verification list cannot drift from the payload. */
export function functionsOf(sql) {
  return [...new Set([...sql.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)/gi)].map((m) => m[1]))];
}

/** Send one file's bytes as one implicit transaction. `prefix` is SQL set before it (the replay's GUCs). */
export async function sendFile(env, sql, { fetch: fetchImpl, prefix = '' }) {
  return queryDb(env, LOCK_BOUND + prefix + sql, { fetch: fetchImpl });
}

/* ── the staging ledger: which bytes staging has run, from this machine ───── */
const ledgerPath = (home) => join(home, '.hearthrise', 'staging-applied.json');
export function readLedger(home, read) {
  try { const j = JSON.parse(read(ledgerPath(home))); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (e) { return {}; }
}
export function noteStagingApply(home, read, write, file, sum) {
  const ledger = readLedger(home, read);
  ledger[file] = sum;
  write(ledgerPath(home), JSON.stringify(ledger, null, 1) + '\n');
}
const stagingIsSetUp = (home, read) => {
  try { const j = JSON.parse(read(join(home, '.hearthrise', 'envs.json'))); return !!(j && j.staging && j.staging.ref); } catch (e) { return false; }
};

/**
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, write, home, log, err, root }: all injectable (tests/tool-env.mjs)
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const err = deps.err || console.error;
  const read = deps.read || ((p) => readFileSync(p, 'utf8'));
  const write = deps.write || ((p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); });
  const home = deps.home || homedir();
  const fetchImpl = deps.fetch || fetch;
  const root = deps.root || ROOT;

  const verifyOnly = argv.includes('--verify-only');
  const env = resolveEnv({ argv, write: !verifyOnly, home, read });
  const skip = env.rest.find((a) => typeof a === 'string' && a.startsWith('--skip-staging'));
  const file = env.rest.find((a) => typeof a === 'string' && !a.startsWith('--'));
  if (!file || !/^[\w.-]+\.sql$/.test(file)) { err(USAGE); return 2; }
  if (file === 'schema.sql') throw new EnvRefusal('supabase/schema.sql drops live tables and is never applied from here. A first build of staging runs it: node tools/staging-bootstrap.local.mjs replay.');

  log(env.banner + (verifyOnly ? ' verify only' : ' APPLY'));
  const sql = read(join(root, 'supabase', 'migrations', file));
  const sum = sha256(sql);
  const fns = functionsOf(sql);

  if (!verifyOnly && env.name === 'production' && stagingIsSetUp(home, read)) {
    const ran = readLedger(home, read)[file];
    if (ran !== sum) {
      const why = skip && skip.includes('=') ? skip.slice(skip.indexOf('=') + 1).trim() : '';
      if (why.length < 10) {
        throw new EnvRefusal(`${file} ${ran ? 'changed since staging ran it' : 'has not been applied to staging from this machine'}. Apply it with --env staging first, or state the decision: --skip-staging="<why, 10 characters or more>". Nothing was sent.`);
      }
      log(`STAGING SKIPPED on a stated decision: ${why}`);
    }
  }

  log(`${file}: ${sql.length} bytes, sha256 ${sum.slice(0, 12)}, replaces ${fns.length} function(s): ${fns.join(', ') || '(none)'}`);
  if (!verifyOnly) {
    const named = await assertIdentity(env, fetchImpl);
    log(`project answers to "${named}"`);
    const res = await sendFile(env, sql, { fetch: fetchImpl });
    log('apply result: ' + (typeof res === 'string' ? res : JSON.stringify(res)).slice(0, 300));
    if (env.name === 'staging') noteStagingApply(home, read, write, file, sum);
  }
  if (fns.length) {
    const list = fns.map((f) => `'${f}'`).join(',');
    const md5s = await queryDb(env,
      `select p.proname, md5(p.prosrc) as body_md5, length(p.prosrc) as len
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (${list}) order by p.proname`, { fetch: fetchImpl });
    log('landed bodies: ' + (typeof md5s === 'string' ? md5s : JSON.stringify(md5s)));
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
