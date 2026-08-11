#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/run-sql-tests.mjs — the server tier's test gate
//
// Before this file the repo had no SQL test harness and zero test references
// to hr_apply, market_buy or pg_policies: every security property of the
// server was asserted by reading the migration. This is the minimum viable
// harness, and it is deliberately split in two so that the half which needs no
// database still runs on every push.
//
//   PART 1 — STATIC (no database, always runs, gates the build)
//     • catalogue drift: regenerate from src/data/*.js and diff
//     • grant hygiene:   every CREATE FUNCTION in the new migrations must be
//                        followed by a `revoke execute … from public` before
//                        any grant, and no migration may grant a privileged
//                        function to a client role
//     • rollback hygiene: no `return jsonb_build_object('ok', false …)` may
//                        appear after a DML statement inside hr_apply — that
//                        is exactly the S2 defect, and a lint is the only
//                        thing that will catch its reintroduction in review
//
//   PART 2 — BEHAVIOURAL (needs a database)
//     tests/sql/server-authority.test.sql, designed to run inside a
//     transaction that is rolled back. `--emit` prints the whole bundle
//     (migrations + suite, wrapped in begin/rollback) to stdout so it can be
//     piped at psql, `supabase db execute`, or pasted into a SQL console:
//
//       node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"
//
//     ⚠ THIS BUNDLE IS *NOT* "SAFE AGAINST ANY DATABASE". (Review R9. An
//       earlier revision of this header claimed it was, which was wrong in two
//       specific ways that matter operationally:)
//
//       1. LOCKS. 2026-08-11-market-v2.sql does `drop table market_listings
//          cascade` and `create table market_listings`, so it holds ACCESS
//          EXCLUSIVE on the live market table for the ENTIRE run — every
//          statement of four migrations plus twenty test sections. Against a
//          production database with players trading, that is a stall, not a
//          no-op, even though nothing is committed. The emitted bundle
//          therefore sets `lock_timeout` so it FAILS FAST instead of queueing
//          in front of real traffic, and `statement_timeout` so a pathological
//          statement cannot sit there.
//       2. WORK. Rolled back is not free: the run writes and then discards
//          WAL, bloats catalogs, and leaves dead tuples for autovacuum.
//
//       So `--emit` now REFUSES to target production unless you say so:
//       pass `--allow-production` (and read the two points above first).
//       Without it the bundle carries a guard that aborts if it finds live
//       player data. The default is the safe one.
//
//     No Postgres driver is vendored on purpose: this repo is a static site
//     with one devDependency, and adding `pg` to run one script is a worse
//     trade than emitting SQL.
//
//     IF YOU HAVE NO psql AND NO DATABASE_URL (the usual case on Tyler's box),
//     the bundle can still be run against a live database through the Supabase
//     MCP `execute_sql` tool, which is worth writing down because two of the
//     obvious ways to do it are unsafe:
//
//       • Each execute_sql call is a SEPARATE backend and a separate implicit
//         transaction — verified: pg_backend_pid() changes per call and a temp
//         table does not survive. So you CANNOT chunk the bundle across calls
//         inside one `begin`. A chunked `begin` silently does not hold, and
//         market-v2's `drop table market_listings` would then be permanent.
//       • An explicit `begin; … rollback;` inside a SINGLE call IS honoured,
//         including for DDL, CREATE ROLE and CREATE EXTENSION — also verified.
//
//     The bundle is ~215 KB, which is too big for one call, so the trick is to
//     let Postgres fetch its own source: the migrations are served publicly at
//     https://hearthrise.net/<repo path>. One call, one transaction:
//
//       begin;
//       create extension if not exists http with schema extensions;
//       do $$ … for each file: http_get, CHECK ITS sha256, execute … $$;
//       rollback;
//
//     Verify the sha256 of every fetched file against the local working copy
//     before executing it — otherwise a CDN error page becomes something you
//     hand to EXECUTE. PL/pgSQL EXECUTE does accept a multi-statement string.
//
// Exit codes: 0 = clean · 1 = a check failed · 2 = harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

// The server-authority foundation, in apply order. Order is load-bearing:
// files 3 and 4 fail closed without file 2.
const BUNDLE = [
  '2026-08-11-player-state.sql',
  '2026-08-11-catalogue.generated.sql',
  '2026-08-11-apply-engine.sql',
  '2026-08-11-market-v2.sql',
];
// Shipped and reviewed separately, so these are linted but are not part of the
// foundation bundle. Anything that creates a function in `public` belongs here:
// the grant-hygiene lints below are the repo's only static defence against a
// new SECURITY DEFINER function being born reachable, and a file that is not
// listed is a file that defence does not cover.
const ALSO_LINTED = [
  '2026-08-11-chat-name-authority.sql',
  '2026-08-11-anon-execute-lockdown.sql',
  '2026-08-11-grant-hygiene.sql',
  '2026-08-11-telemetry-retention.sql',
];

// Functions created only to PROVE a check works, inside that check's own
// self-verification block. They are granted a privilege on purpose and must be
// dropped in the same file — which is asserted, so this is not an escape hatch.
const PROBE = /^hr__/;

// ⚠ WITH --emit, STDOUT IS THE SQL BUNDLE AND NOTHING ELSE.
// The documented gate is `node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"`, and the
// progress lines below used to go to stdout — so the very command in the header piped
// `── catalogue drift` and thirty `ok …` lines straight into psql ahead of `begin;`. Every one of
// them is a syntax error, and the ones after `begin;` would have aborted the transaction. Found
// 2026-08-11 while re-running the gate. All human-facing output now goes to stderr, which is also
// where it belongs when the tool's product is a stream.
const EMIT = process.argv.includes('--emit');
const say = (msg) => (EMIT ? process.stderr : process.stdout).write(msg + '\n');
let failures = 0;
const fail = (msg) => { failures++; process.stderr.write(`  FAIL  ${msg}\n`); };
const pass = (msg) => say(`  ok    ${msg}`);

// ── PART 1a — catalogue drift ────────────────────────────────────────────
say('── catalogue drift');
{
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-catalogues.mjs'), '--check'],
    { encoding: 'utf8' });
  if (r.status === 0) pass((r.stdout || '').trim() || 'catalogue in sync');
  else fail(`catalogue drift\n${(r.stdout || '') + (r.stderr || '')}`);
}

// ── PART 1b — grant hygiene ──────────────────────────────────────────────
// Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
// default ACL additionally grants it to anon, authenticated and service_role.
// A new SECURITY DEFINER function with no revoke is therefore anon-callable
// the moment it is created — which is exactly what the review found on six of
// them. The rule this enforces: revoke before you grant, every time.
say('── grant hygiene (revoke before grant)');
const sources = new Map();
for (const f of [...BUNDLE, ...ALSO_LINTED]) {
  try { sources.set(f, await readFile(MIG(f), 'utf8')); }
  catch { console.error(`  harness: cannot read ${f}`); process.exit(2); }
}

// Functions that are allowed to be reachable by a client role, with the role
// that may reach them. Everything else must be revoked from all four.
const CLIENT_CALLABLE = new Map([
  ['hr_load', 'authenticated'],
  ['hr_create_character', 'authenticated'],
  ['hr_xp_for_level', 'authenticated'],
  ['hr_level_from_xp', 'authenticated'],
  ['market_list', 'authenticated'],
  ['market_cancel', 'authenticated'],
  ['market_buy', 'authenticated'],
]);

for (const [file, sql] of sources) {
  // Every `create or replace function public.NAME(` in the file.
  const created = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)]
    .map((m) => m[1]);
  for (const fn of new Set(created)) {
    if (PROBE.test(fn)) {
      // A probe may hold a grant; what it may NOT do is survive the migration.
      if (new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)) {
        pass(`${file}: ${fn}() is a self-check probe and is dropped in-file`);
      } else {
        fail(`${file}: ${fn}() looks like a self-check probe but is never dropped — it would be left behind, granted`);
      }
      continue;
    }
    const revoked = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)[\\s\\S]{0,200}?from[^;]*\\bpublic\\b`,
      'i').test(sql);
    if (!revoked) fail(`${file}: ${fn}() is created but never revoked from PUBLIC`);
    else pass(`${file}: ${fn}() revoked from PUBLIC`);

    // A privileged function must not be granted to a client role.
    const grants = [...sql.matchAll(
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+([^;]+);`, 'gi'))]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()));
    for (const g of grants) {
      if (['anon', 'service_role'].includes(g)) fail(`${file}: ${fn}() granted to ${g}`);
      if (g === 'authenticated' && CLIENT_CALLABLE.get(fn) !== 'authenticated') {
        fail(`${file}: ${fn}() granted to authenticated but is not on the client-callable list`);
      }
    }
  }
}

// hr_apply in particular: exactly one grantee, and it must be hr_engine.
{
  const sql = sources.get('2026-08-11-apply-engine.sql') || '';
  const grants = [...sql.matchAll(/grant\s+execute\s+on\s+function\s+public\.hr_apply\s*\([^)]*\)\s*to\s+([^;]+);/gi)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()));
  if (grants.length === 1 && grants[0] === 'hr_engine') pass('hr_apply is granted to hr_engine and nothing else');
  else fail(`hr_apply grantees are [${grants.join(', ')}] — must be exactly [hr_engine]`);
}

// ── PART 1c — rollback hygiene (the S2 lint) ─────────────────────────────
// Inside hr_apply's protected block, a bare `return` after a write commits the
// write. Every rejection there must go through hr_reject(), which raises.
say('── rollback hygiene (no bare return after a write in hr_apply)');
{
  const sql = sources.get('2026-08-11-apply-engine.sql') || '';
  const start = sql.indexOf('THE PROTECTED BLOCK');
  const end = sql.indexOf('when sqlstate \'HR000\' then', start);
  if (start < 0 || end < 0) fail('could not locate hr_apply\'s protected block — has the shape changed?');
  else {
    const body = sql.slice(start, end);
    const bad = [...body.matchAll(/^\s*return\s+jsonb_build_object\s*\(\s*'ok'\s*,\s*false/gim)];
    if (bad.length) fail(`${bad.length} bare rejection return(s) inside the protected block — use hr_reject()`);
    else pass('every rejection in the protected block raises');
    if (!/perform\s+public\.hr_reject\(/.test(body)) fail('the protected block never calls hr_reject()');
    else pass(`hr_reject() is used ${[...body.matchAll(/perform\s+public\.hr_reject\(/g)].length} times`);
  }
}

// ── PART 1c-ii — to_regproc must never be handed an argument list ────────
// to_regproc takes a bare NAME. It returns NULL for "missing" AND for
// "ambiguous", and it does not parse an argument list at all — so
// `to_regproc('cron.schedule(text,text,text)')` is NULL on every database in
// the world. Two preconditions were written that way, which meant
// player-state.sql and market-v2.sql aborted on EVERY apply. Nobody caught it
// in three reviews because reading it looks right; it was found the first time
// the file was actually executed (branch run, 2026-08-11). The arg-typed form
// is to_regprocEDURE.
// Both lints below read CODE, not prose: a `--` comment that quotes the wrong
// form (this file's own explanations do exactly that) must not trip them. The
// stripper only removes a `--` that is not inside a string literal, judged by
// the parity of unescaped quotes ahead of it on the line — enough for SQL we
// control, and it fails toward keeping text rather than dropping it.
const stripComments = (sql) => sql.split('\n').map((line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") q = !q;
    else if (!q && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}).join('\n');
const code = new Map([...sources].map(([f, sql]) => [f, stripComments(sql)]));

say('── to_regproc vs to_regprocedure');
{
  let bad = 0;
  for (const [file, sql] of code) {
    for (const m of sql.matchAll(/to_regproc\s*\(\s*'([^']*)'/gi)) {
      if (m[1].includes('(')) { fail(`${file}: to_regproc('${m[1]}') is ALWAYS NULL — use to_regprocedure`); bad++; }
    }
  }
  if (!bad) pass('no to_regproc() call is given an argument list');
}

// ── PART 1c-iii — every rate-limit rejection must be recorded (review C2) ─
// The rate limit returns before the intent claim, so without an explicit
// hr_record_rejection the loudest automation signal the server produces
// vanishes: no ledger row, no intent row, nothing. Same defect class as R4.
say('── rate-limit rejections are observable (C2) and sampled (S6)');
{
  let bad = 0, seen = 0;
  for (const [file, sql] of code) {
    // Each `if not …hr_rate_ok(…) then … end if;` block must mention
    // hr_record_rejection before it returns.
    for (const m of sql.matchAll(/if\s+not\s+public\.hr_rate_ok\([\s\S]*?end if;/gi)) {
      seen++;
      if (!/hr_record_rejection/.test(m[0])) {
        fail(`${file}: a hr_rate_ok() rejection returns without hr_record_rejection (C2)`);
        bad++;
      }
      // S6: …and it must be SAMPLED. An unconditional write on the rate-limit
      // path means a retry storm costs a row lock and a WAL record per request,
      // all serialised on one tuple — the server doing more durable work the
      // harder it is hammered. The gate is hr_rate_sample_weight() > 0.
      if (!/hr_rate_sample_weight/.test(m[0])) {
        fail(`${file}: a hr_rate_ok() rejection records unconditionally — gate it on hr_rate_sample_weight() (S6)`);
        bad++;
      }
    }
  }
  if (!bad) pass(`all ${seen} rate-limit rejections are recorded and sampled`);
}

// ── PART 1c-iv — no migration may control its own transaction (review S5) ─
// 2026-08-11-telemetry-retention.sql shipped with a top-level `begin;`/`commit;`
// and was therefore UNAPPLIABLE by every transactional tool in the toolchain
// (Supabase MCP apply_migration, `supabase db push`, `psql -1`, every migration
// runner) — each of those already wraps the file, so the nested `begin` is an
// error or a no-op and the `commit` closes the OUTER transaction early, leaving
// the rest of the file running unprotected. The retention fix sat undeployed
// for a day while reading as shipped. A migration is a sequence of statements;
// its runner owns the transaction. Atomic sections go in a `do $$ … $$` block.
say('── no top-level transaction control in a migration (S5)');
{
  let bad = 0;
  for (const [file, sql] of code) {
    sql.split('\n').forEach((line, i) => {
      // Column 0 ONLY, and `end;` is deliberately not in the list. Every
      // PL/pgSQL block in these files is indented inside a `do $$`, and a
      // nested block legitimately closes with an indented `end;` — matching
      // those would make this lint noise, and a noisy lint gets deleted.
      if (/^(begin|commit|rollback|start\s+transaction)\s*;\s*$/i.test(line)) {
        fail(`${file}:${i + 1}: top-level \`${line.trim()}\` — a migration must not control its own transaction (S5)`);
        bad++;
      }
    });
  }
  if (!bad) pass('no migration opens or closes a transaction');
}

// ── PART 1d — the migrations must be self-verifying ──────────────────────
say('── self-verification blocks');
for (const [file, sql] of sources) {
  if (/raise\s+exception/i.test(sql) && /do\s+\$\$/.test(sql)) pass(`${file}: has assertions`);
  else fail(`${file}: no self-verifying do-block`);
}

// ── PART 1e — the destructive-migration interlocks must still be there ───
// These are the two properties that stop a migration from being a footgun. A
// lint is the only thing that notices when someone "simplifies" one away.
say('── destructive-migration interlocks');
{
  const mv2 = sources.get('2026-08-11-market-v2.sql') || '';
  if (/hearthrise\.market_wipe_ok/.test(mv2) && /REFUSING TO WIPE THE MARKET/.test(mv2)) {
    pass('market-v2: drop is gated on hearthrise.market_wipe_ok, not on a comment');
  } else {
    fail('market-v2: the DROP TABLE has no wipe gate — a prose warning is not an interlock');
  }
  if (/drop table if exists public\.market_listings cascade/i.test(mv2)
      && !/create table if not exists public\.market_listings/i.test(mv2)) {
    pass('market-v2: re-runnability comes from the drops (documented coupling holds)');
  } else if (/create table if not exists public\.market_listings/i.test(mv2)) {
    pass('market-v2: creates are if-not-exists, so the drops are no longer load-bearing');
  }
  // R1: the escrow-destroying cron job must be removed BY THE MIGRATION.
  if (/trim-expired-listings/.test(mv2) && /hr_cron_drop\('trim-expired-listings'\)/.test(mv2)) {
    pass('market-v2: unschedules trim-expired-listings in-file (R1)');
  } else {
    fail('market-v2: does NOT unschedule trim-expired-listings — applying it ARMS a nightly job that deletes escrow');
  }
  // C-c: …and it must do so BEFORE it creates the column that arms the job.
  // §9(h) asserts the end state, which cannot distinguish "disarmed first" from
  // "disarmed 650 lines later" — and only the first is safe if the apply is not
  // transactional (psql without -1, a tool that splits on `;`, an apply that
  // dies halfway). Deleting the ordering dependency beats documenting it, so
  // the order is a lint rather than a paragraph.
  {
    const drop = mv2.indexOf("hr_cron_drop('trim-expired-listings')");
    const create = mv2.search(/create\s+table\s+public\.market_listings/i);
    if (drop >= 0 && create >= 0 && drop < create) {
      pass('market-v2: the escrow-destroying job is disarmed BEFORE market_listings.expires_at exists (C-c)');
    } else {
      fail('market-v2: hr_cron_drop(\'trim-expired-listings\') must appear BEFORE `create table public.market_listings` '
         + '— otherwise a non-transactional apply leaves a window where the nightly delete is armed against live escrow (C-c)');
    }
    if (/hearthrise\.market_cron_disarmed/.test(mv2)) {
      pass('market-v2: §9 asserts the disarm actually ran in this session (C-c)');
    } else {
      fail('market-v2: nothing asserts that the §0c disarm ran — deleting it would be silent (C-c)');
    }
  }
  if (/hr_cron_ensure\('hr-market-expire'/.test(mv2)) pass('market-v2: schedules market_expire (R1)');
  else fail('market-v2: market_expire is never scheduled — expiry is assumed, not wired');
  if (/hr_cron_drop\('trim-market-sales'\)/.test(mv2)) pass('market-v2: retires the broken sold_at job (R2)');
  else fail('market-v2: trim-market-sales is left erroring nightly (R2)');
}

// ── PART 1f — every unbounded table ships its retention policy ───────────
// The rule, and the reason it is a lint: game_events had a prune function and
// no schedule, and reached 1.6M rows / 229 MB from six players in 3.45 days.
say('── retention policies are wired');
{
  const ps = sources.get('2026-08-11-player-state.sql') || '';
  const mv2 = sources.get('2026-08-11-market-v2.sql') || '';
  const all = ps + mv2;
  for (const job of ['hr-ledger-prune', 'hr-intents-prune', 'hr-progress-prune',
                     'hr-rejections-prune', 'hr-market-expire', 'hr-market-sales-prune']) {
    if (new RegExp(`hr_cron_ensure\\('${job}'`).test(all)) pass(`${job} is scheduled in-migration`);
    else fail(`${job} is not scheduled — a retention policy that is a runbook step does not exist`);
  }
  // RL2: the ledger must be deletable at all, or retention is impossible.
  if (/before update or delete on public\.player_ledger/i.test(ps)
      && /tg_op = 'DELETE'/.test(ps) && /retention window/.test(ps)) {
    pass('player_ledger: UPDATE always refused, DELETE refused only inside the retention window');
  } else {
    fail('player_ledger: the immutability trigger must allow deletes OUTSIDE the retention window (RL2)');
  }
  if (/primary key \(at, id\)/.test(ps)) pass('player_ledger PK is (at, id) — partitionable without a rebuild');
  else fail('player_ledger PK does not lead with `at` (RL2d)');
}

// ── PART 2 — emit the behavioural bundle ─────────────────────────────────
if (process.argv.includes('--emit')) {
  const allowProd = process.argv.includes('--allow-production');
  const suite = await readFile(join(ROOT, 'tests', 'sql', 'server-authority.test.sql'), 'utf8');
  const parts = [
    '-- GENERATED by tests/run-sql-tests.mjs --emit. Runs and rolls back.\n',
    `-- production target: ${allowProd ? 'EXPLICITLY ALLOWED (--allow-production)' : 'refused (default)'}\n`,
    'begin;\n',
    // R9: market-v2 takes ACCESS EXCLUSIVE on market_listings for the whole
    // run. Fail fast rather than queue in front of live traffic.
    "set local lock_timeout = '5s';\n",
    "set local statement_timeout = '300s';\n",
    // RL6: the bundle DOES wipe the market tables. Inside begin/rollback that
    // is harmless, and stating it here is what makes it a decision.
    "set local hearthrise.market_wipe_ok = 'yes';  -- rolled back; see market-v2.sql §0b\n",
  ];
  if (!allowProd) {
    parts.push(`
-- ── PRODUCTION GUARD (review R9) ─────────────────────────────────────────
-- Without --allow-production the bundle refuses a database that is carrying
-- live players. Rolled back is not the same as harmless: this run holds ACCESS
-- EXCLUSIVE on market_listings from here to the rollback.
do $$
declare v_saves bigint := 0;
begin
  if to_regclass('public.game_saves') is not null then
    execute 'select count(*) from public.game_saves' into v_saves;
  end if;
  if v_saves > 0 then
    raise exception 'REFUSING: this looks like production (% game_saves rows). '
      'This bundle drops and recreates market_listings/market_sales and holds ACCESS '
      'EXCLUSIVE on the live market for its whole run. Re-emit with --allow-production '
      'if you have read tests/run-sql-tests.mjs'' header and accept that.', v_saves;
  end if;
end $$;
`);
  }
  for (const f of BUNDLE) parts.push(`\n-- ══ ${f} ══\n${sources.get(f)}\n`);
  parts.push(`\n-- ══ tests/sql/server-authority.test.sql ══\n${suite}\n`);
  parts.push('\nrollback;\n');
  process.stdout.write(parts.join(''));
  if (allowProd) {
    process.stderr.write('\n⚠ emitted WITHOUT the production guard (--allow-production).\n'
      + '  market-v2 holds ACCESS EXCLUSIVE on market_listings for the whole run.\n'
      + '  lock_timeout is 5s so it fails fast instead of blocking players.\n\n');
  }
  process.exit(failures ? 1 : 0);
}

say('');
if (failures) {
  console.error(`${failures} static check(s) failed.`);
  console.error('The behavioural suite is tests/sql/server-authority.test.sql —');
  console.error('run it with:  node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"');
  process.exit(1);
}
say('static server-tier checks passed.');
say('Behavioural suite (needs a database):');
say('  node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"');
say('  (no psql? see the header for the single-call begin/rollback');
say('   recipe that runs the same bundle through Supabase MCP)');
