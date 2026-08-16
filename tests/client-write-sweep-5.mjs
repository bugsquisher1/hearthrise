#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-write-sweep-5.mjs — BATCH 5 OF THE CLIENT WRITE GRANT SWEEP:
//                                  THE STATE BECOMES A PROPERTY.
//
// THE CLAIM UNDER TEST, in three lines — the three coupled pieces of
// 2026-08-16-client-write-grant-sweep-5.sql:
//   1. FAIL-CLOSED DEFAULT ACL — a table created AFTER the migration is born
//      with SELECT only for anon/authenticated and NO write verb (MAINTAIN
//      included); SELECT (the REST read path) survives.
//   2. SCHEMA-WIDE MAINTAIN REVOKE — zero (relation, client role) MAINTAIN pairs
//      remain in public, across tables, partitioned tables AND matviews.
//   3. THE DETECTOR TAKEOVER — check (4) of hr_assert_grant_hygiene now reads
//      has_table_privilege over pg_class, so MAINTAIN and MATERIALIZED VIEWS are
//      permanently visible; STRICT passes after 1+2, and a re-granted MAINTAIN —
//      on a table OR a matview — is NAMED and FATAL.
//
// Everything runs against a real PostgreSQL (PGlite/WASM, in process) with THE
// WHOLE MIGRATION CHAIN applied verbatim from tests/schema-apply-order.json, so
// the migration's own self-verifying blocks (§0 refuse-to-install, §1 the
// default-ACL probe, §2 the MAINTAIN post-check, §4 the MAINTAIN + matview +
// default-ACL controls) EXECUTE on every run. Production is never touched.
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · The PostgREST request path (has_table_privilege is the seam the grant
//     lives on, but it is not an HTTP request).
//   · Production's default ACL — measured by hand for this batch (rolled-back
//     probe, 2026-08-16): a fresh table before the alter gives authenticated
//     arwdm; after it, SELECT only. 28 client MAINTAIN pairs + the
//     leaderboard_ranked matview were live and are what pieces 2+3 address.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/client-write-sweep-5.mjs --list       the mutation catalogue
//   node tests/client-write-sweep-5.mjs --selftest   every mutation must be CAUGHT
//   node tests/client-write-sweep-5.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1.
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-16-client-write-grant-sweep-5.sql';

/** The two tables that carry a LIVE client write policy — piece 2 removes their
 *  dead MAINTAIN but must keep the grants their policies stand on. */
const LIVE_POLICY = ['clan_members', 'clans'];

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   The three the task names explicitly: the default-ACL revoke must be caught if
   it stops closing the generator (`defacl_leaves_write`), MAINTAIN visibility
   must be caught if the schema-wide revoke is neutered (`maintain_revoke_noop`),
   and the detector must still FIRE on a MAINTAIN grant after the takeover
   (`check4_arm1_drops_maintain`). The rest exist because a guard that only
   catches the defects it was asked about is a guard shaped around its own test. */
const MUTATIONS = {
  // ── THE THREE NAMED ARMS ──────────────────────────────────────────────
  defacl_leaves_write: {
    migration: MIG,
    why: 'PIECE 1 is neutered: the default-ACL revoke drops INSERT/UPDATE/DELETE, so a NEW table is '
       + 'still born client-writable — the generator stays open and the whole "property" collapses to '
       + 'a one-off state. §1\'s own probe (a fresh table must have no write verb) must catch it',
    find: "      'revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "      'on tables from anon, authenticated, public', r_owner);",
    repl: "      'revoke truncate, references, trigger, maintain '\n"
        + "      'on tables from anon, authenticated, public', r_owner);",
  },
  maintain_revoke_noop: {
    migration: MIG,
    why: 'PIECE 2 is neutered: the per-relation MAINTAIN revoke becomes a no-op, so the ~28 dead '
       + 'MAINTAIN pairs survive — the exact privilege the old detector could not see. §2\'s post-check '
       + '(zero MAINTAIN pairs remain) must catch it',
    find: "    execute format('revoke maintain on public.%I from public, anon, authenticated', r.relname);",
    repl: '    perform 1;',
  },
  check4_arm1_drops_maintain: {
    migration: MIG,
    why: '⚠ THE TAKEOVER\'S REASON FOR EXISTING: the widened check (4) drops MAINTAIN from arm 1, so '
       + 'the detector is once again blind to the privilege information_schema could never report. '
       + '§4(B) re-grants MAINTAIN on a probe and demands the check NAME it — the migration must '
       + 'refuse to install',
    find: "      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv\n"
        + '     where c.relnamespace = ',
    repl: "      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER']) pv\n"
        + '     where c.relnamespace = ',
  },

  // ── DEEPER ARMS — DEFECTS THE MIGRATION'S OWN §4 DOES NOT PLANT ────────
  check4_arm1_ignores_matviews: {
    migration: MIG,
    why: 'arm 1\'s relkind filter drops \'m\', so the detector goes blind to MATVIEWS again — the '
       + 'blind spot that hid leaderboard_ranked from every nightly run. §4(C) grants MAINTAIN on a '
       + 'materialized view and demands it be named; the migration must refuse',
    find: "      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv\n"
        + "     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')",
    repl: "      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv\n"
        + "     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')",
  },
  check4_arm2_removed: {
    migration: MIG,
    why: 'arm 2 (the INSERT/UPDATE/DELETE RLS-gated class) is silently gutted — its verb list matches '
       + 'nothing — so a client i/u/d grant on an RLS-on table with no policy sails through. The '
       + 'migration\'s own §4 never plants such a table, so C3 in THIS file is the only thing standing '
       + 'there',
    find: "      cross join unnest(array['INSERT','UPDATE','DELETE']) pv\n"
        + "     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')\n"
        + '       and c.relrowsecurity',
    repl: "      cross join unnest(array['REFERENCES']) pv\n"
        + "     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')\n"
        + '       and c.relrowsecurity',
  },
  defacl_takes_select: {
    migration: MIG,
    why: 'PIECE 1 over-reaches and revokes SELECT from the default ACL too, so a new world-readable '
       + 'table is born unreadable and the anon-key REST read path silently breaks. §1\'s SELECT-kept '
       + 'assertion must catch it',
    find: "      'revoke insert, update, delete, truncate, references, trigger, maintain '\n"
        + "      'on tables from anon, authenticated, public', r_owner);",
    repl: "      'revoke select, insert, update, delete, truncate, references, trigger, maintain '\n"
        + "      'on tables from anon, authenticated, public', r_owner);",
  },
  maintain_revoke_skips_matviews: {
    migration: MIG,
    why: 'PIECE 2\'s revoke loop only walks tables (\'r\',\'p\'), leaving a matview\'s MAINTAIN behind. '
       + '§2\'s post-check measures over r/p/m, so it must catch a matview the loop skipped',
    find: "     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')\n"
        + "       and has_table_privilege(case when g='public' then 'public' else g end, c.oid, 'MAINTAIN')\n"
        + '     order by 1',
    repl: "     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')\n"
        + "       and has_table_privilege(case when g='public' then 'public' else g end, c.oid, 'MAINTAIN')\n"
        + '     order by 1',
  },
};

// ── tiny harness (same shape as batches 2–4) ────────────────────────────────
class Red extends Error {}
let fails = 0;
let checks = 0;
let problems = [];
let quiet = false;
const log = (s) => { if (!quiet) process.stdout.write(`${s}\n`); };
function ok(cond, msg) {
  checks += 1;
  if (!cond) { fails += 1; problems.push(msg); log(`  RED  ${msg}`); throw new Red(msg); }
}

/** Every table privilege the SERVER knows, derived rather than typed. */
async function vocabulary(db) {
  const { rows } = await db.query(
    "select a.privilege_type::text as p from aclexplode(acldefault('r', "
    + '(select oid from pg_roles where rolname = current_user))) a group by 1 order by 1');
  return rows.map((r) => r.p);
}

/** The write verbs a fresh table grants a client role (SELECT excluded). */
async function freshTableClientWrites(db, name) {
  await db.query(`create table public.${name} (id int)`);
  const w = (await db.query(
    `select coalesce(string_agg(g||':'||p, ',' order by g,p), '') v
       from unnest(array['anon','authenticated']) g
       cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
      where has_table_privilege(g, 'public.${name}', p)`)).rows[0].v;
  const sel = (await db.query(
    `select (has_table_privilege('anon','public.${name}','SELECT')
         and has_table_privilege('authenticated','public.${name}','SELECT')) s`)).rows[0].s;
  await db.query(`drop table public.${name}`);
  return { writes: w, select: sel };
}

async function detector(db, strict) {
  const { rows } = await db.query(`select public.hr_assert_grant_hygiene(${strict}) as r`);
  return rows[0].r;
}

// ── THE RUN ────────────────────────────────────────────────────────────────
async function run({ patches } = {}) {
  const { db } = await bootReplay({ patches });
  await db.query('begin');
  const VOCAB = await vocabulary(db);
  const owner = (await db.query(
    "select relowner::regrole::text o from pg_class where relnamespace='public'::regnamespace "
    + "and relkind='r' limit 1")).rows[0].o;

  // ── C0 · THE INSTRUMENT ITSELF ────────────────────────────────────────
  try {
    ok(VOCAB.includes('MAINTAIN'),
      `C0: the server-derived privilege vocabulary lacks MAINTAIN (${VOCAB.join(', ')}). If the `
      + 'instrument cannot see it, every "clean" below is batch 1\'s "clean".');
    log(`  ok   C0  privilege vocabulary derived from the server: ${VOCAB.join(', ')}`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── C1 · PIECE 1 — THE GENERATOR IS CLOSED ────────────────────────────
  try {
    const after = await freshTableClientWrites(db, 'hr__c1_after');
    ok(after.writes === '',
      `C1: a table created after the migration STILL grants client write verb(s): ${after.writes}. `
      + 'The fail-closed default ACL did not take — a new RLS-on table re-opens the dead-grant class.');
    ok(after.select === true,
      'C1: the default ACL took SELECT with it — a new world-readable table would be unreadable to the '
      + 'anon key. Only the WRITE verbs may be revoked.');

    // CONTROL: restore an OPEN default ACL in a savepoint and prove the probe can
    // tell the difference — otherwise C1 passes on a database nobody closed.
    await db.query('savepoint c1open');
    await db.query(`alter default privileges for role ${owner} in schema public `
      + 'grant insert, update, delete, maintain on tables to anon, authenticated');
    const openT = await freshTableClientWrites(db, 'hr__c1_open');
    await db.query('rollback to savepoint c1open');
    await db.query('release savepoint c1open').catch(() => {});
    ok(openT.writes.includes('MAINTAIN') && openT.writes.includes('INSERT'),
      `C1 CONTROL: with the default ACL re-opened, a fresh table did NOT show write verbs (${openT.writes}). `
      + 'The probe cannot distinguish open from closed, so C1 proves nothing.');
    log('  ok   C1  a fresh table is born fail-closed (SELECT only); the probe distinguishes it from '
      + 'an open default ACL');
  } catch (e) {
    await db.query('rollback to savepoint c1open').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  // ── C2 · PIECE 2 — ZERO CLIENT MAINTAIN PAIRS, MATVIEWS INCLUDED ──────
  try {
    const left = (await db.query(
      `select coalesce(string_agg(c.relname||':'||g, ', ' order by c.relname), '') v
         from pg_class c cross join unnest(array['anon','authenticated']) g
        where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','m')
          and has_table_privilege(g, c.oid, 'MAINTAIN')`)).rows[0].v;
    ok(left === '', `C2: client MAINTAIN survives the schema-wide revoke on: ${left}`);

    // CONTROL: the instrument can SEE a MAINTAIN grant (has_table_privilege did
    // not silently stop answering).
    await db.query('savepoint c2');
    await db.query('create table public.hr__c2 (id int)');
    await db.query('grant maintain on public.hr__c2 to authenticated');
    const seen = (await db.query(
      "select has_table_privilege('authenticated','public.hr__c2','MAINTAIN') h")).rows[0].h;
    await db.query('rollback to savepoint c2');
    await db.query('release savepoint c2').catch(() => {});
    ok(seen === true, 'C2 CONTROL: has_table_privilege did not report a freshly granted MAINTAIN — the '
      + 'measurement in C2 is blind, so "zero remain" means nothing.');
    log('  ok   C2  zero client MAINTAIN pairs remain (tables, partitions and matviews); the '
      + 'instrument still sees a fresh MAINTAIN grant');
  } catch (e) {
    await db.query('rollback to savepoint c2').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  // ── C3 · PIECE 3 — THE DETECTOR TAKEOVER STILL FIRES ─────────────────
  try {
    // (a) strict passes after 1+2.
    ok((await detector(db, true)) !== null, 'C3(a): hr_assert_grant_hygiene STRICT did not pass after '
      + 'the sweep — the widening moved the failure rather than removing it.');

    // (b) MAINTAIN visibility — a re-granted MAINTAIN on a table is NAMED + FATAL.
    await db.query('savepoint c3b');
    await db.query('create table public.hr__c3b (id int primary key)');
    await db.query('alter table public.hr__c3b enable row level security');
    await db.query('revoke all on public.hr__c3b from public, anon, authenticated, service_role');
    await db.query('grant maintain on public.hr__c3b to authenticated');
    const rb = await detector(db, false);
    ok(JSON.stringify(rb.client_truncate_grants).includes('hr__c3b:authenticated:MAINTAIN'),
      `C3(b): the taken-over check (4) did NOT name a re-granted MAINTAIN. report=${JSON.stringify(rb.client_truncate_grants)}`);
    let fatalB = false;
    try { await detector(db, true); } catch { fatalB = true; }
    await db.query('rollback to savepoint c3b');
    await db.query('release savepoint c3b').catch(() => {});
    ok(fatalB, 'C3(b): strict returned normally with a live MAINTAIN grant — the nightly cron would '
      + 'report success. MAINTAIN is exactly the privilege the old information_schema body could not see.');

    // (c) MATVIEW visibility — the blind spot information_schema could NEVER report.
    await db.query('savepoint c3c');
    await db.query('create materialized view public.hr__c3c as select 1 as one');
    await db.query('revoke all on public.hr__c3c from public, anon, authenticated, service_role');
    await db.query('grant maintain on public.hr__c3c to authenticated');
    const rc = await detector(db, false);
    // The old instrument's blindness, asserted directly: information_schema omits matviews.
    const infoSees = (await db.query(
      "select count(*)::int n from information_schema.role_table_grants "
      + "where table_schema='public' and table_name='hr__c3c'")).rows[0].n;
    await db.query('rollback to savepoint c3c');
    await db.query('release savepoint c3c').catch(() => {});
    ok(JSON.stringify(rc.client_truncate_grants).includes('hr__c3c:authenticated:MAINTAIN'),
      `C3(c): check (4) did NOT name a matview's MAINTAIN grant. report=${JSON.stringify(rc.client_truncate_grants)}`);
    ok(infoSees === 0, 'C3(c) CONTROL: information_schema.role_table_grants unexpectedly REPORTED the '
      + 'matview — if it can see matviews, the takeover was not the thing that made C3(c) pass.');
    log('  ok   C3  strict passes; a re-granted MAINTAIN on a TABLE and on a MATVIEW is named and '
      + 'fatal (the latter invisible to information_schema)');

    // (d) arm 2 survived the rewrite — an i/u/d dead grant is still named + fatal.
    await db.query('savepoint c3d');
    await db.query('create table public.hr__c3d (id int primary key)');
    await db.query('alter table public.hr__c3d enable row level security');
    await db.query('revoke all on public.hr__c3d from public, anon, authenticated, service_role');
    await db.query('grant insert on public.hr__c3d to authenticated');
    const rd = await detector(db, false);
    let fatalD = false;
    try { await detector(db, true); } catch { fatalD = true; }
    await db.query('rollback to savepoint c3d');
    await db.query('release savepoint c3d').catch(() => {});
    ok(JSON.stringify(rd.client_truncate_grants).includes('hr__c3d:authenticated:INSERT') && fatalD,
      'C3(d): a client INSERT on an RLS-on table with no write policy was not named-and-fatal. Arm 2 '
      + '(the historical i/u/d class) did not survive the has_table_privilege rewrite.');
    log('  ok   C3(d) the i/u/d dead-grant class still fires — arm 2 survived the takeover');
  } catch (e) {
    for (const sp of ['c3b', 'c3c', 'c3d']) await db.query(`rollback to savepoint ${sp}`).catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  // ── C4 · THE LIVE-POLICY RECONCILIATION (clan_members / clans) ────────
  // Piece 2 removed their dead MAINTAIN; their INSERT/DELETE grants behind the
  // live policies must survive, and the raw client founding path must still work.
  try {
    for (const t of LIVE_POLICY) {
      const [{ n }] = (await db.query(
        'select count(*)::int n from pg_policies where schemaname=$1 and tablename=$2 '
        + "and cmd in ('INSERT','UPDATE','DELETE','ALL')", ['public', t])).rows;
      ok(n > 0, `C4 CONTROL: ${t} has no client write policy on this replay — it is no longer the `
        + 'live-policy counter-example this arm rests on.');
      const [{ m }] = (await db.query(
        "select has_table_privilege('authenticated', $1, 'MAINTAIN') m", [`public.${t}`])).rows;
      ok(m === false, `C4: ${t} still holds MAINTAIN for authenticated — piece 2 did not sweep a `
        + 'live-policy table\'s dead MAINTAIN.');
      const [{ i }] = (await db.query(
        "select has_table_privilege('authenticated', $1, 'INSERT') i", [`public.${t}`])).rows;
      ok(i === true, `C4: authenticated lost INSERT on ${t}, but ${t} has a live INSERT policy standing `
        + 'on it — piece 2 revoked a (table, verb) pair a live path depends on.');
    }
    // The door still OPENS, driven for real.
    await db.query('savepoint c4');
    const uid = (await db.query('select gen_random_uuid() i')).rows[0].i;
    await db.query('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [uid, 'sweep5door@probe.invalid']);
    await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    let door = 'PERMITTED';
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
      await db.query('set local role authenticated');
      await db.query("insert into public.clans (name, created_by, join_policy) "
        + "values ('hr__door5', $1, 'open')", [uid]);
      const cid = (await db.query("select id from public.clans where name='hr__door5'")).rows[0].id;
      await db.query("insert into public.clan_members (clan_id, user_id, role) values ($1,$2,'leader')",
        [cid, uid]);
    } catch (e) { door = String(e.message || e).split('\n')[0]; }
    await db.query('reset role').catch(() => {});
    await db.query('rollback to savepoint c4');
    await db.query('release savepoint c4').catch(() => {});
    ok(door === 'PERMITTED', `C4: the live clans/clan_members client founding path is BROKEN after this `
      + `sweep: ${door}. Piece 2 must remove only the dead MAINTAIN, never the grants a live policy uses.`);
    log('  ok   C4  clan_members/clans lost their dead MAINTAIN, kept the live grants+policies, and '
      + 'the raw founding path still works');
  } catch (e) {
    await db.query('reset role').catch(() => {});
    await db.query('rollback to savepoint c4').catch(() => {});
    if (!(e instanceof Red)) throw e;
  }

  await db.query('rollback').catch(() => {});
  await db.close?.();
  return { checks, fails };
}

// ── THE GUARD SEAM ─────────────────────────────────────────────────────────
export async function clientWriteSweep5Guard() {
  checks = 0; fails = 0; problems = []; quiet = true;
  try { await run(); return problems; }
  catch (e) { return [`client-write-sweep-5 guard failed to run — ${e?.message || e}`]; }
  finally { quiet = false; }
}

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

function mergePatches(a, b) {
  const out = new Map();
  for (const m of [a, b]) { if (!m) continue; for (const [k, v] of m) out.set(k, [...(out.get(k) || []), ...v]); }
  return out;
}
const patchesFor = (id) => {
  const ids = [id, ...(MUTATIONS[id].withAlso ? [MUTATIONS[id].withAlso] : [])];
  const m = new Map();
  for (const i of ids) {
    const mu = MUTATIONS[i];
    if (!m.has(mu.migration)) m.set(mu.migration, []);
    m.get(mu.migration).push([mu.find, mu.repl]);
  }
  return m;
};

const main = async () => {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) log(`${id}\n    (${m.migration}) ${m.why}\n`);
    return 0;
  }
  const mut = argv.find((a) => a.startsWith('--mutate='))?.slice(9);
  if (mut) {
    if (!MUTATIONS[mut]) { log(`unknown mutation: ${mut}`); return 2; }
    log(`── MUTATION ${mut} ──`);
    try {
      const r = await run({ patches: patchesFor(mut) });
      log(r.fails ? `CAUGHT (${r.fails} red)` : 'SLIPPED');
      return r.fails ? 0 : 1;
    } catch (e) {
      if (e.harness) { log(`HARNESS: ${e.message}`); return 2; }
      log('CAUGHT — the migration refused to install itself:\n'
        + `${String(e.message).split('\n').slice(0, 3).map((l) => `    ${l}`).join('\n')}`);
      return 0;
    }
  }
  if (argv.includes('--selftest')) {
    const slipped = [];
    for (const id of Object.keys(MUTATIONS)) {
      checks = 0; fails = 0;
      let caught = false;
      try { const r = await run({ patches: patchesFor(id) }); caught = r.fails > 0; }
      catch (e) { if (e.harness) { log(`HARNESS on ${id}: ${e.message}`); return 2; } caught = true; }
      log(`${caught ? 'CAUGHT ' : 'SLIPPED'}  ${id}`);
      if (!caught) slipped.push(id);
    }
    if (slipped.length) {
      log(`\n${slipped.length} mutation(s) SLIPPED: ${slipped.join(', ')}`);
      return 1;
    }
    log(`\nall ${Object.keys(MUTATIONS).length} mutations caught`);
    return 0;
  }
  log('Client write grant sweep — batch 5 (fail-closed default ACL + schema-wide MAINTAIN revoke + '
    + 'detector takeover)');
  const r = await run();
  log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
  return r.fails ? 1 : 0;
};

const isMain = import.meta.url
  === (await import('node:url')).pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e.harness || e.replay ? e.message : e);
    process.exit(e.harness ? 2 : 1);
  });
}
