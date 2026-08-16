#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bug-triage.mjs
//
// MUTATION PROOF for supabase/migrations/2026-08-17-bug-triage.sql, on real
// PostgreSQL in WASM (PGlite, in-process, no Docker, production untouched),
// plus the source-level guard on src/bug-report.js's delivery ORDER.
//
// THE THREE CLAIMS UNDER TEST
//
//   1. THE FLOOD GAP IS REAL AND IS CLOSED. bug_report_submit holds a 6/hour +
//      20/day cap, but the direct-PostgREST FALLBACK insert never crosses that
//      RPC — it is admitted by the "bugs anyone submits" policy, whose only
//      condition is `auth.uid() = user_id`. BEFORE, this file drives 45 direct
//      inserts from one account and every one lands. If that flood does not
//      REPRODUCE, the run fails as a harness problem: a guard never shown the
//      door it closes is decoration.
//
//   2. TRIAGE STATE IS SERVER-OWNED. `resolved` is DERIVED from `status` and can
//      never disagree with it; `triaged_at` is the server clock and a caller
//      cannot backdate it; the status vocabulary is closed; and there is still
//      no client UPDATE path, so a reporter cannot mark their own bug fixed.
//
//   3. THE CLIENT DOES NOT DOUBLE-FILE. The relay ALREADY writes the row (via
//      bug_report_submit) before forwarding to Discord, so a second "also insert
//      to the table" would file every report TWICE and defeat the idempotency
//      key. submit() must call sendSupabase only as a FALLBACK — never
//      unconditionally, never in a Promise.all fan-out beside sendRelay.
//
// Every mutation is applied to the migration's REAL BYTES; a lift whose anchor
// stops matching ABORTS rather than silently stubbing.
//
//   node tests/bug-triage.mjs [--mutate]
// Exit: 0 clean · 1 assertion failed · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
const LF = (s) => s.replace(/\r\n/g, '\n');

let problems = [];
let quiet = false;
const pass = (m) => { if (!quiet) process.stdout.write(`  ok    ${m}\n`); };
const fail = (m) => { problems.push(m); if (!quiet) process.stderr.write(`  FAIL  ${m}\n`); };
let harnessErr = null;
const harness = (m) => { harnessErr = m; throw new Error(`HARNESS: ${m}`); };

const UID_A = '00000000-0000-4000-a000-00000000000a';
const UID_B = '00000000-0000-4000-a000-00000000000b';

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { process.stderr.write('HARNESS: @electric-sql/pglite is not installed\n'); process.exit(2); }

const drBase  = LF(await readFile(MIG('2026-08-10-dr-bug-reports-base.sql'), 'utf8'));
const relay   = LF(await readFile(MIG('2026-08-11-bug-report-relay.sql'),    'utf8'));
const triage  = LF(await readFile(MIG('2026-08-17-bug-triage.sql'),          'utf8'));
const clientJs = LF(await readFile(join(ROOT, 'src', 'bug-report.js'), 'utf8'));
const triageTool = LF(await readFile(join(ROOT, 'tools', 'triage-bugs.mjs'), 'utf8'));

// ── fixture: the platform floor + the two files that own bug_reports today ──
async function buildDb() {
  const d = await PGlite.create();
  await d.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin bypassrls; end if;
      execute 'grant usage on schema public to anon, authenticated, service_role';
    end $$;
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users (id) values ('${UID_A}'), ('${UID_B}');
    -- profiles is the name authority bug_report_submit READS. Real one is made
    -- by schema.sql; only the shape the RPC touches is needed here.
    create table public.profiles (id uuid primary key, display_name text);
    insert into public.profiles values ('${UID_A}','Reporter A'), ('${UID_B}','Reporter B');
  `);
  await d.exec(drBase);
  await d.exec(relay);
  // The platform's default table grants — RLS is what decides, per the DR file's
  // note that these are platform-owned and deliberately not in a migration.
  await d.exec(`
    grant select, insert, update, delete on public.bug_reports to authenticated;
    grant usage, select on sequence public.bug_reports_id_seq to authenticated;`);
  return d;
}

async function asUser(d, uid) {
  await d.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
async function asOperator(d) {
  await d.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
}
async function attempt(d, sql) {
  try { const r = await d.exec(sql); return { ok: true, r }; }
  catch (e) {
    return {
      ok: false,
      code: e.code || (e.cause && e.cause.code) || String(e.message).match(/\b([0-9A-Z]{5})\b/)?.[1],
      message: String(e.message),
    };
  }
}
const one = async (d, sql) => (await d.query(sql)).rows[0];

// The EXACT payload shape src/bug-report.js sendSupabase() puts on the wire.
const directInsert = (uid, n) => `
  insert into public.bug_reports (user_id, build_version, summary, description, state, errors)
  values ('${uid}', 'v0.9.2-beta (b363)', 'flood ${n}', 'desc',
          '{"activeTab":"combat","viewport":"1920x1080","metrics":{"dpr":2}}'::jsonb,
          '[{"level":"error","msg":"boom"}]'::jsonb)`;

async function run() {
  const db = await buildDb();
  pass('fixture up: dr-bug-reports-base + bug-report-relay, RLS on, authenticated granted');

  // ── BEFORE: the flood must reproduce, or this guard proves nothing ────────
  if (!quiet) process.stdout.write('── BEFORE (relay posture): the unrated fallback path\n');
  await asUser(db, UID_A);
  {
    const first = await attempt(db, directInsert(UID_A, 0));
    if (!first.ok) harness(`the direct-insert fallback did not reproduce (${first.code} ${first.message})`);

    for (let i = 1; i < 45; i++) {
      const r = await attempt(db, directInsert(UID_A, i));
      if (!r.ok) harness(`the flood stopped early at ${i} (${r.code}) — cannot prove the gap`);
    }
    const n = Number((await one(db, `select count(*) c from public.bug_reports where user_id='${UID_A}'`)).c);
    if (n !== 45) harness(`expected 45 flooded rows, found ${n}`);
    pass(`THE GAP: 45 direct inserts from one account all land — the RPC's 20/day never sees this path`);

    // control: the forged author IS already refused, so the gap is rate, not identity
    const forged = await attempt(db, directInsert(UID_B, 99));
    if (forged.ok) fail('CONTROL: a forged user_id was accepted — the INSERT policy is not pinning the author');
    else pass(`CONTROL: a forged user_id is already refused (${forged.code}) — the open door is RATE, not identity`);
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  if (!quiet) process.stdout.write('── APPLY 2026-08-17-bug-triage.sql\n');
  await asOperator(db);
  {
    const r = await attempt(db, triage);
    if (!r.ok) { fail(`the triage migration REFUSED TO APPLY: ${r.code || ''} ${r.message}`); return; }
    pass('triage migration applied, its own §4 self-verification passed');
  }

  // ── AFTER (1): the backstop ──────────────────────────────────────────────
  if (!quiet) process.stdout.write('── AFTER: the per-user backstop\n');
  await asUser(db, UID_A);
  {
    // 45 rows already exist for A, which is past the 40/day backstop.
    const over = await attempt(db, directInsert(UID_A, 100));
    if (over.ok) fail('the 46th direct insert still landed — the backstop is not on the insert path');
    else pass(`a flooding account is now refused by the backstop (${over.code})`);

    // CONTROL: the cap is PER USER, not global. A global cap would let one
    // abuser silence every other player's reports — a worse bug than the flood.
    await asUser(db, UID_B);
    const other = await attempt(db, directInsert(UID_B, 0));
    if (!other.ok) fail(`CONTROL: a different account was refused (${other.code}) — the cap is global, not per-user`);
    else pass('CONTROL: a different account still reports fine — the cap is per-user');

    // CONTROL: operator work carries no JWT and must not be throttled.
    await asOperator(db);
    const op = await attempt(db, `insert into public.bug_reports (user_id, summary, source)
                                  values ('${UID_A}', 'operator import', 'import')`);
    if (!op.ok) fail(`CONTROL: an operator insert was throttled (${op.code}) — backfills would fail`);
    else pass('CONTROL: operator/service-role inserts are exempt (no auth.uid())');
  }

  // ── AFTER (2): triage state is server-owned ──────────────────────────────
  if (!quiet) process.stdout.write('── AFTER: triage state\n');
  await asOperator(db);
  {
    const row = await one(db, `select status, resolved, triaged_at, state->>'activeTab' tab,
                                      jsonb_array_length(errors) errs
                                 from public.bug_reports where summary='flood 0'`);
    if (row.status !== 'new') fail(`a fresh report's status is ${row.status}, expected 'new'`);
    else if (row.resolved !== false) fail('a fresh report is already resolved');
    else if (row.triaged_at !== null) fail('a fresh report already has a triaged_at');
    else if (row.tab !== 'combat' || Number(row.errs) !== 1) fail('the client payload did not round-trip through state/errors jsonb');
    else pass("ROUND-TRIP: the client's real payload lands as status='new', resolved=false, triaged_at=null, state+errors intact");

    // resolved is DERIVED — set status only, and the legacy bit must follow.
    await db.exec(`update public.bug_reports set status='fixed', triage_note='fixed in b364' where summary='flood 0'`);
    const fixed = await one(db, `select status, resolved, triaged_at, triage_note from public.bug_reports where summary='flood 0'`);
    if (fixed.resolved !== true) fail("status='fixed' did not derive resolved=true — the two fields can disagree");
    else if (!fixed.triaged_at) fail('triaged_at was not stamped on the status change');
    else if (fixed.triage_note !== 'fixed in b364') fail('triage_note did not persist');
    else pass("status='fixed' derives resolved=true, stamps triaged_at, and keeps the note");

    // ...and back, so the derivation is not a one-way latch.
    await db.exec(`update public.bug_reports set status='new' where summary='flood 0'`);
    const back = await one(db, `select resolved, triaged_at from public.bug_reports where summary='flood 0'`);
    if (back.resolved !== false || back.triaged_at !== null) fail('reopening a report left resolved/triaged_at stale — the derivation is one-way');
    else pass('reopening derives resolved=false and clears triaged_at — the mirror tracks both directions');

    // A caller cannot backdate a triage.
    await db.exec(`update public.bug_reports set status='wontfix', triaged_at='1999-01-01' where summary='flood 1'`);
    const dated = await one(db, `select triaged_at, resolved from public.bug_reports where summary='flood 1'`);
    if (new Date(dated.triaged_at).getUTCFullYear() === 1999) fail('a caller backdated triaged_at — it is not the server clock');
    else if (dated.resolved !== true) fail("status='wontfix' did not derive resolved=true");
    else pass("a supplied triaged_at is overwritten with now(); 'wontfix' also resolves");

    // The vocabulary is closed.
    const bogus = await attempt(db, `update public.bug_reports set status='maybe' where summary='flood 2'`);
    if (bogus.ok) fail("status='maybe' was accepted — the status vocabulary is open to typos");
    else pass(`an unknown status is refused (${bogus.code}) — the vocabulary is closed`);
  }

  // ── AFTER (3): the client still cannot touch triage state ────────────────
  await asUser(db, UID_A);
  {
    const upd = await db.query(`update public.bug_reports set status='fixed' where user_id='${UID_A}' returning id`);
    if (upd.rows.length > 0) fail('a reporter updated their own report — triage state is client-writable');
    else pass('a reporter cannot mark their own bug fixed — no client UPDATE policy (0 rows)');

    const del = await db.query(`delete from public.bug_reports where user_id='${UID_A}' returning id`);
    if (del.rows.length > 0) fail('a reporter deleted their own report — reports are not append-only');
    else pass('a reporter cannot delete a report — still append-only');
  }

  // The RPC arity is untouched: no overload, so PostgREST resolution is stable.
  await asOperator(db);
  {
    const n = Number((await one(db, `select count(*) c from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                                      where ns.nspname='public' and p.proname='bug_report_submit'`)).c);
    if (n !== 1) fail(`bug_report_submit now has ${n} overloads — PostgREST resolution is ambiguous`);
    else pass('bug_report_submit is still exactly ONE function — no accidental overload');
  }

  await db.close();
}

// ── The source-level claim: the client must not double-file ────────────────
function clientOrderGuard() {
  const submit = clientJs.match(/async function submit\(\{[\s\S]*?\n\}/);
  if (!submit) harness('could not lift submit() out of src/bug-report.js — the anchor has moved');
  const body = submit[0];

  if (/Promise\.all\s*\(\s*\[[^\]]*sendRelay/.test(body) || /Promise\.allSettled\s*\(\s*\[[^\]]*sendRelay/.test(body)) {
    fail('submit() fans out sendRelay and sendSupabase in parallel — every report would be filed TWICE');
  } else pass('submit() does not fan out — the two paths are ordered');

  // sendSupabase must be reached only through a guard mentioning the relay result.
  const call = body.match(/^.*sendSupabase\(payload\).*$/m);
  if (!call) harness('submit() no longer calls sendSupabase — the fallback path is gone');
  if (!/if\s*\(\s*!relay\.ok/.test(body)) {
    fail('submit() calls sendSupabase without checking !relay.ok — the relay already wrote the row, so this double-files');
  } else pass('sendSupabase is guarded by !relay.ok — it is a FALLBACK, not a second write');

  // The relay is the writer of record; a comment is not a guarantee, so assert
  // the RPC the relay calls is the one that writes.
  if (!/insert\s+into\s+public\.bug_reports/i.test(relay)) {
    fail('bug_report_submit no longer inserts the row — the relay path would report to Discord and store nothing');
  } else pass('bug_report_submit is the writer of record on the relay path');
}

// ── The operator CLI's vocabulary must BE the schema's vocabulary ──────────
// tools/triage-bugs.mjs holds a STATUSES array and the migration holds a CHECK
// constraint: two copies of one list, with no other reason to agree. The tool
// re-verifies against the live constraint at write time, but that check only
// fires when someone runs `mark` against a reachable database — this one fires
// in the suite, offline, on every build.
function toolVocabularyGuard() {
  const m = triageTool.match(/const STATUSES = \[([^\]]*)\]/);
  if (!m) harness('could not lift STATUSES out of tools/triage-bugs.mjs — the anchor has moved');
  const tool = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();

  const c = triage.match(/check \(status in \(([^)]*)\)\)/);
  if (!c) harness('could not lift the status CHECK out of the migration — the anchor has moved');
  const schema = [...c[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();

  if (tool.join(',') !== schema.join(',')) {
    fail(`triage-bugs.mjs offers [${tool}] but bug_reports_status_chk allows [${schema}] — a status the tool believes in would be refused at write time`);
  } else pass(`the CLI and the CHECK constraint agree on the vocabulary [${schema}]`);

  // The CLI must not write the derived fields; doing so would let an operator
  // produce a row whose `resolved` bit contradicts its status.
  if (/set[^;]*\b(resolved|triaged_at)\s*=/.test(triageTool.replace(/^\s*\/\/.*$/gm, ''))) {
    fail('triage-bugs.mjs writes resolved/triaged_at directly — those are trigger-derived and would be overwritten or made inconsistent');
  } else pass('the CLI writes only status/triage_note — resolved and triaged_at stay server-derived');
}

// ── MUTATION: the migration's self-verify must be a real commit gate ───────
const MUTATIONS = {
  'no-trigger': {
    find: `create trigger bug_reports_insert_guard_trg`,
    repl: `create trigger bug_reports_insert_guard_trg_DISABLED`,
    why: 'the backstop trigger is never attached to the table',
  },
  'open-vocab': {
    find: `check (status in ('new','triaged','fixed','wontfix'));`,
    repl: `check (status is not null);`,
    why: 'the status vocabulary is left open to typos',
  },
  'client-update': {
    find: `-- ── 4. Self-verification`,
    repl: `create policy "bugs own updatable" on public.bug_reports for update to authenticated using (auth.uid() = user_id);\n-- ── 4. Self-verification`,
    why: 'a client UPDATE policy makes triage state reporter-writable',
  },
};

async function mutate() {
  process.stdout.write('\n── MUTATION: each planted defect must be caught by the migration\'s own §4\n');
  let bad = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    if (!triage.includes(m.find)) { process.stderr.write(`  HARNESS  ${id}: anchor not found — fix the anchor\n`); bad++; continue; }
    const broken = triage.replace(m.find, m.repl);
    const d = await buildDb();
    await d.exec(`grant select, insert, update, delete on public.bug_reports to authenticated;
                  grant usage, select on sequence public.bug_reports_id_seq to authenticated;`);
    const r = await attempt(d, broken);
    if (r.ok) { process.stderr.write(`  RED     ${id}: APPLIED CLEAN — ${m.why}, and §4 did not notice\n`); bad++; }
    else process.stdout.write(`  ok      ${id}: refused (${r.code}) — ${m.why}\n`);
    await d.close();
  }
  return bad;
}

export async function bugTriageGuard() {
  problems = []; quiet = true; harnessErr = null;
  try { clientOrderGuard(); toolVocabularyGuard(); await run(); return problems; }
  catch (e) { return [harnessErr ? `bug-triage harness: ${harnessErr}` : `bug-triage guard failed to run — ${e?.message || e}`]; }
  finally { quiet = false; }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bug-triage.mjs')) {
  let code = 0;
  try {
    process.stdout.write('── src/bug-report.js delivery order\n');
    clientOrderGuard();
    toolVocabularyGuard();
    await run();
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
  if (process.argv.includes('--mutate')) {
    const bad = await mutate();
    if (bad) { process.stderr.write(`\n${bad} mutation(s) NOT caught\n`); code = 1; }
  }
  if (problems.length) { process.stderr.write(`\nbug-triage: ${problems.length} FAILURE(S)\n`); code = 1; }
  else process.stdout.write('\nbug-triage: clean\n');
  process.exit(code);
}
