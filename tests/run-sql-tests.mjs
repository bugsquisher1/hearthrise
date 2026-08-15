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
  // The C5/X3 daily budget. BEFORE apply-engine because apply-engine's §0 now
  // fails closed without hr_day_budget_check — the order in this list is the
  // order the migration bundle is applied in, and getting it wrong is a refused
  // migration rather than a subtle degradation.
  '2026-08-11-daily-budget.sql',
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
  '2026-08-11-clan-write-policy-pin.sql',
  '2026-08-11-authenticated-surface-lockdown.sql',
  '2026-08-11-live-market-rls.sql',
  '2026-08-11-clan-membership-authority.sql',
  // O1/O2 on the v1 market_buy_offers + a volume bound on both market tables.
  // Behaviourally proven, with controls and mutations, by
  // tests/market-offers-guard.mjs on PGlite. It deliberately does NOT fix M1
  // (listing an item you do not own) — see that file's header.
  '2026-08-12-market-offers-authority.sql',
  // F5's other half: hr_clan_browser replaces the world-readable
  // clan_leaderboard view, and leaderboard_ranked stops being client-selectable.
  // Behaviourally proven, with controls and mutations, by
  // tests/leaderboard-lockdown-guard.mjs on a fully replayed PGlite chain.
  '2026-08-14-leaderboard-view-lockdown.sql',
  /* ⚠ THE 2026-08-15 FILES WERE NOT ON THIS LIST, and the comment above says
     plainly that they should have been: all four `create or replace` a
     SECURITY DEFINER function in `public`, and `create or replace` PRESERVES an
     ACL — so a file that restates a 47 KB body and forgets its revoke/grant
     block leaves whatever the previous ACL was, silently, which is precisely
     the failure this lint is the only static defence against. They were added
     on 2026-08-15 with the tool-carry work; all four pass unchanged, which
     means this is a coverage fix and not a behaviour change. */
  '2026-08-15-auto-eat.sql',
  '2026-08-15-activity-intent.sql',
  '2026-08-15-intent-key-hygiene.sql',
  /* b348 — the gathering tool carry. Replaces BOTH hr_apply and hr_state_of. */
  '2026-08-15-tool-carry.sql',
  /* b351 — the gem daily budget (Security's blocking condition 1). Replaces
     hr_apply and all three daily-budget functions. It is the CURRENT last
     toucher of hr_apply; PART 1f-ii below pins that chain. */
  '2026-08-15-gem-daily-budget.sql',
];

// ── THE hr_apply DERIVATION CHAIN ────────────────────────────────────────
// Every file here restates the WHOLE of hr_apply, and each one was derived from
// its predecessor by extracting the text programmatically and patching it at
// named anchors. The chain is [older, …, CURRENT LAST TOUCHER]; PART 1f-ii
// re-derives each link and requires the result to be byte-identical.
//
// A new file that replaces hr_apply is appended here AND to
// tests/schema-apply-order.json, in the same commit. If it is not, PART 1f-ii's
// last-toucher check fails by name — which is the whole point: this repo has
// already had three migrations each defining one policy, with filename order
// silently installing the wrong one and every self-check still passing.
const HR_APPLY_CHAIN = [
  '2026-08-11-apply-engine.sql',
  '2026-08-15-intent-key-hygiene.sql',
  '2026-08-15-tool-carry.sql',
  '2026-08-15-gem-daily-budget.sql',
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

// ⚠ THE GRANT LINTS READ `code`, NOT `sources`. `code` is the same SQL with
//   `--` comments removed. Until 2026-08-11 they read the raw text, which meant
//   a migration could FAIL ITS OWN LINT for a sentence in its reversibility
//   notes: the §6 "to undo, run `grant execute … to authenticated`" line in
//   2026-08-11-authenticated-surface-lockdown.sql was read as an actual grant,
//   and a `create or replace function public.clan_deposit(…)` used to ILLUSTRATE
//   the footgun was read as an actual definition with no revoke. Both were
//   false, both were fatal, and the pressure a false-positive lint creates is
//   to stop writing the comment — i.e. it taxes exactly the documentation this
//   codebase depends on. The stripper is the same one PART 1c-ii already used;
//   it has simply been moved above its first consumer.
const stripComments = (sql) => sql.split('\n').map((line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") q = !q;
    else if (!q && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}).join('\n');
const code = new Map([...sources].map(([f, sql]) => [f, stripComments(sql)]));

// Functions that are allowed to be reachable by a client role, and by WHICH
// roles. Everything else must be revoked from all four.
// (Was a name→role Map; became name→role[] on 2026-08-11 because
// beta_invite_check is legitimately anon-callable — the invite modal checks a
// code BEFORE sign-up — and a single-role map could only express that by
// weakening the anon rule for everybody.)
const CLIENT_CALLABLE = new Map([
  ['hr_load', ['authenticated']],
  ['hr_create_character', ['authenticated']],
  // Both lose their `authenticated` grant in
  // 2026-08-11-authenticated-surface-lockdown.sql §2 (Group 1) and keep only
  // hr_engine. Left on the list because the four foundation files still grant
  // them at creation time and the lockdown revokes afterwards.
  ['hr_xp_for_level', ['authenticated']],
  ['hr_level_from_xp', ['authenticated']],
  ['market_list', ['authenticated']],
  ['market_cancel', ['authenticated']],
  ['market_buy', ['authenticated']],
  ['hr_server_now', ['authenticated']],
  ['beta_invite_check', ['anon', 'authenticated']],
  // 2026-08-11-clan-membership-authority.sql — S-CAP-1 / S-KICK. These are the
  // server-side join/kick path that `clan-write-policy-pin.sql` recorded as
  // "QUEUED, NOT DONE". All eight are player actions, all eight are gated
  // through hr_rpc_gate, and none is reachable by anon.
  ['clan_create', ['authenticated']],
  ['clan_join', ['authenticated']],
  ['clan_leave', ['authenticated']],
  ['clan_kick', ['authenticated']],
  ['clan_invite', ['authenticated']],
  ['clan_invite_revoke', ['authenticated']],
  ['clan_invites_list', ['authenticated']],
  ['clan_join_policy_set', ['authenticated']],
  // 2026-08-14-leaderboard-view-lockdown.sql — F5. The clan browser's feed,
  // replacing a view that `anon` could read. authenticated only, on purpose:
  // you must be signed in to join a hold, so an anonymous browse was never a
  // feature, only an enumeration surface.
  ['hr_clan_browser', ['authenticated']],
  /* 2026-08-15-auto-eat.sql. The player's own Auto-Eat settings — a client
     action by definition, and deliberately NOT reachable by hr_engine (the
     engine must never switch on a 100-Bounty-Mark trait for somebody).
     SURFACED BY WIDENING `ALSO_LINTED` above, and it is the reason widening was
     worth doing: the DATABASE-side detector already knew about this grant
     (2026-08-15-auto-eat-baseline.sql records it in hr_client_rpc_baseline
     precisely because hr_assert_grant_hygiene check (2) raised on it), while
     this STATIC list had never been told. Two baselines, one of them stale, is
     how the next deliberate grant gets waved through by the check that still
     agrees with it. */
  ['hr_set_auto_eat', ['authenticated']],
]);

for (const [file, sql] of code) {
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
    const allowed = CLIENT_CALLABLE.get(fn) || [];
    for (const g of grants) {
      if (g === 'service_role') fail(`${file}: ${fn}() granted to service_role`);
      if ((g === 'anon' || g === 'authenticated') && !allowed.includes(g)) {
        fail(`${file}: ${fn}() granted to ${g} but is not on the client-callable list for that role`);
      }
    }
  }
}

// ── PART 1b-ii — A9: every client-callable SECURITY DEFINER RPC is gated ─
// The standing rule "rate-limit every player-callable RPC" was met on 2 of 43
// when the `authenticated`-surface audit measured it. The retrofit lives in
// 2026-08-11-authenticated-surface-lockdown.sql; THIS is the thing that stops
// it decaying, and the Security Engineer was explicit that the lint is the more
// valuable half of the fix. A retrofit is a one-day event; a lint is a policy.
//
// The rule, stated exactly: a `create or replace function public.X(...)` that
// is SECURITY DEFINER and is granted to anon or authenticated (or is on
// CLIENT_CALLABLE) must reference a rate gate in its own body.
//
// ⚠ WHAT THIS CANNOT SEE, said out loud so nobody mistakes green for total
//   coverage: the A9 retrofit builds its 35 wrappers with dynamic SQL inside a
//   `do $$` block, so no `create or replace function public.<name>` literal
//   exists for them and this lint is silent about all 35. That half is covered
//   at RUNTIME by check (8) inside hr_assert_grant_hygiene(), which runs at
//   every migration and nightly via pg_cron. Two halves, neither sufficient:
//   the lint catches a NEW hand-written RPC before it merges; the runtime check
//   catches a wrapper that a re-applied older migration silently overwrote.
say('── A9: client-callable SECURITY DEFINER RPCs reference a rate gate');
{
  const GATE = /hr_rpc_gate|hr_rate_gate|hr_rate_ok/;
  let checked = 0;
  for (const [file, sql] of code) {
    const defs = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)];
    for (let i = 0; i < defs.length; i++) {
      const fn = defs[i][1];
      if (PROBE.test(fn)) continue;
      // The body is everything up to the next `create or replace function`.
      const body = sql.slice(defs[i].index, i + 1 < defs.length ? defs[i + 1].index : sql.length);
      const header = body.slice(0, body.indexOf('$$') < 0 ? 400 : body.indexOf('$$'));
      if (!/security\s+definer/i.test(header)) continue;
      const grantedToClient = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+[^;]*\\b(anon|authenticated)\\b`,
        'i').test(sql);
      if (!grantedToClient && !CLIENT_CALLABLE.has(fn)) continue;
      checked++;
      if (!GATE.test(body)) {
        fail(`${file}: ${fn}() is SECURITY DEFINER and client-callable but references no rate gate. `
           + 'Add `if not public.hr_rpc_gate(\'<bucket>\') then return … rate_limited … end if;` as its '
           + 'first statement and add the bucket to hr_rpc_gate\'s `case` in '
           + '2026-08-11-authenticated-surface-lockdown.sql §2b. A player-callable RPC with no rate '
           + 'limit is a free denial-of-service against the whole project (A9).');
      }
    }
  }
  if (!failures) pass(`${checked} client-callable SECURITY DEFINER RPC(s) reference a rate gate`);
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
// (`stripComments` and `code` moved above PART 1b on 2026-08-11 so the GRANT
//  lints get the same treatment — see the note there.)

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

// ── PART 1c-iii — ONE OWNER FOR clan_members."join as self" ──────────────
// On 2026-08-11 two parallel security passes defined this one policy within an
// hour of each other. `raid-claim-authority` (R4) pinned `joined_at`, which is
// an authorisation input for raid_claim's joined_after_kill /
// joined_after_declare and for clan-seat's 72h alt gate.
// `clan-membership-authority` (S-CAP-1) added the invite-only door plus the
// cp_at / last_seen pins. `c` sorts before `r`, so a replay of the migrations
// in filename order would have run R4's shorter definition LAST and silently
// deleted the door — while R4's own assertion still passed, because it only
// checks that `joined_at` appears.
//
// This is the same hazard 2026-08-11-authenticated-surface-lockdown.sql §2b
// names about hr_rpc_gate's `case`, in a place where the two owners cannot be
// split into separate objects. So the rule is enforced statically instead:
// exactly ONE migration may define this policy, and that definition must carry
// every term the live policy is relied upon for. A file that reintroduces a
// second definition fails the build rather than the game.
say('── one owner for clan_members."join as self"');
{
  const DEF = /create\s+policy\s+"join as self"/i;
  // COMMENTS MUST BE STRIPPED FIRST. The two files that ceded ownership each
  // say so in a comment that quotes the statement they removed — and without
  // this, that sentence re-registers them as owners and the check reports a
  // conflict that does not exist. Caught by running it, not by reading it.
  const uncommented = (sql) => sql.replace(/--[^\n]*/g, '');
  const owners = [...sources.entries()]
    .filter(([, sql]) => DEF.test(uncommented(sql))).map(([f]) => f);
  if (owners.length !== 1) {
    fail(`clan_members."join as self" is defined in ${owners.length} migration(s) [${owners.join(', ')}] — `
       + 'exactly one file may own it. Whichever applies second silently deletes the other\'s terms; '
       + 'that is how the invite-only door (S-CAP-1) gets dropped without any assertion noticing.');
  } else {
    const sql = sources.get(owners[0]);
    // Everything the live policy is depended on for, by the system that depends
    // on it. Each term is here because something else would break without it.
    const TERMS = [
      ['auth.uid() = user_id', /auth\.uid\(\)\s*=\s*user_id/,          'a caller could insert somebody else'],
      ['joined_at',            /joined_at\s+between/i,                  'R4: raid_claim / the 72h alt gate read it'],
      ['cp_at',                /cp_at\s+between/i,                      'a future cp_at makes CP immune to decay'],
      ['last_seen',            /last_seen\s+is\s+null/i,                'rested-XP charges are keyed on it'],
      ['join_policy',          /join_policy\s*=\s*'open'/i,             'S-CAP-1: the invite-only door'],
      ['contributed',          /contributed\s*=\s*0/i,                  'a forged contribution ranks on the clan board'],
      ['cp',                   /\bcp\s*=\s*0/i,                         'CP is castle standing'],
      ['charge',               /charge\s+is\s+null/i,                   'a forged charge is an officer commission'],
    ];
    let bad = 0;
    for (const [name, re, why] of TERMS) {
      if (!re.test(sql)) { bad++; fail(`${owners[0]}: the join policy no longer pins \`${name}\` — ${why}`); }
    }
    if (!bad) pass(`${owners[0]} is the sole owner of "join as self" and pins all ${TERMS.length} load-bearing terms`);
  }
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

// ── PART 1f-ii — hr_apply is DERIVED, not retyped, and only one file is last ─
// Four migrations now restate the whole of hr_apply (47-56 KB each). Each was
// built by extracting its predecessor's text programmatically and patching it at
// named anchors — because retyping it is how a fix that landed last week
// silently disappears, and because `create or replace` on a body you have not
// read is the single most destructive statement in this repo. The migrations
// each assert this at APPLY time against pg_proc; this is the STATIC half, and
// it is the only one that runs without a database.
//
// The check: every line of a predecessor's hr_apply body must survive into its
// successor's, except a small list of lines the successor DECLARES it replaced.
// An undeclared removal is a fix that vanished. A declared removal that is no
// longer there means the anchor moved and the derivation was re-done by hand.
say('── hr_apply derivation chain (each body derived from the last, nothing retyped)');
{
  const applyBody = (file) => {
    const sql = (sources.get(file) || '').replace(/\r\n/g, '\n');
    const i = sql.indexOf('create or replace function public.hr_apply(');
    if (i < 0) return null;
    const j = sql.indexOf('\nend $$;\n', i);
    if (j < 0) return null;
    const fn = sql.slice(i, j);
    return fn.slice(fn.indexOf('$$') + 2);
  };

  /* Lines a link is ALLOWED to remove, and why. Anything else removed is a
     silent regression; anything here that is no longer removed means the
     derivation drifted and this list is stale. Both directions are fatal. */
  const DECLARED_REMOVALS = {
    '2026-08-15-intent-key-hygiene.sql': [
      // C3: the replay lookup and its comparison also read `slot`.
      '  select result, intent into v_prev, v_prev_intent from public.player_intents',
      '    if v_prev_intent is distinct from v_this_intent then',
      "        jsonb_build_object('stored', v_prev_intent, 'sent', v_this_intent));",
      // C1: step (5) becomes a branch — release on version_conflict, else store.
      '  update public.player_intents',
      "     set result = case when coalesce(v_out->>'ok','false') = 'true'",
      "                       then jsonb_build_object('ok', true)",
      '                       else v_out end',
      '   where user_id = v_uid and intent_id = p_intent_id;',
    ],
    '2026-08-15-tool-carry.sql': [
      // c_delta_keys gains 'tool_carry' on its last line.
      "    'farm','progress','progress_claim','journal'];",
    ],
    '2026-08-15-gem-daily-budget.sql': [
      // The budget call gains a sixth argument…
      '    v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in);',
      // …and the ledger insert gains gems_in, in both its column and value list.
      '      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)',
      '       v_gold_in, v_xp_in, v_qty_in,',
    ],
  };

  let chainOk = true;
  for (let k = 1; k < HR_APPLY_CHAIN.length; k++) {
    const from = HR_APPLY_CHAIN[k - 1];
    const to = HR_APPLY_CHAIN[k];
    const a = applyBody(from);
    const b = applyBody(to);
    if (!a || !b) {
      fail(`hr_apply derivation: cannot extract the body from ${!a ? from : to} — has the shape changed?`);
      chainOk = false;
      continue;
    }
    const have = new Map();
    for (const line of b.split('\n')) have.set(line, (have.get(line) || 0) + 1);
    const removed = [];
    for (const line of a.split('\n')) {
      const c = have.get(line) || 0;
      if (c > 0) have.set(line, c - 1);
      else removed.push(line);
    }
    const declared = DECLARED_REMOVALS[to] || [];
    const undeclared = removed.filter((l) => !declared.includes(l));
    const unused = declared.filter((l) => !removed.includes(l));
    if (undeclared.length) {
      chainOk = false;
      fail(`${to}: its hr_apply DROPS ${undeclared.length} line(s) of ${from}'s body that it does not `
         + 'declare. A restatement that loses a line loses whatever that line was defending, and the '
         + 'migration\'s own §0 can only check the terms somebody remembered to list. First:\n'
         + undeclared.slice(0, 3).map((l) => `            ${JSON.stringify(l)}`).join('\n'));
    }
    if (unused.length) {
      chainOk = false;
      fail(`${to}: DECLARED_REMOVALS lists ${unused.length} line(s) that are not actually removed from `
         + `${from}'s body — the anchor moved, so this list is documenting a derivation that no longer `
         + 'happened. First: ' + JSON.stringify(unused[0]));
    }
    if (!undeclared.length && !unused.length) {
      pass(`${to}: hr_apply is ${from}'s body + insertions, with ${declared.length} declared replacement(s)`);
    }
  }

  // ONE LAST TOUCHER, and the apply order must agree with this file about who it
  // is. Two lists that disagree is exactly the clan_members "join as self"
  // defect: filename order installs the wrong one and every self-check passes.
  const last = HR_APPLY_CHAIN[HR_APPLY_CHAIN.length - 1];
  const definers = [...sources.entries()]
    .filter(([, sql]) => /create\s+or\s+replace\s+function\s+public\.hr_apply\s*\(/i.test(stripComments(sql)))
    .map(([f]) => f).sort();
  if (definers.join('|') !== [...HR_APPLY_CHAIN].sort().join('|')) {
    fail(`the files that replace hr_apply are [${definers.join(', ')}] but HR_APPLY_CHAIN says `
       + `[${[...HR_APPLY_CHAIN].sort().join(', ')}]. A file that restates hr_apply and is not in the `
       + 'chain is a body nobody has proven is derived from the one it replaces.');
    chainOk = false;
  }
  {
    const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
    const positions = HR_APPLY_CHAIN.map((f) => order.indexOf(f));
    if (positions.some((p) => p < 0)) {
      fail(`an hr_apply file is missing from schema-apply-order.json's "order": `
         + HR_APPLY_CHAIN.filter((_, i) => positions[i] < 0).join(', '));
      chainOk = false;
    } else if (Math.max(...positions) !== order.indexOf(last)) {
      fail(`${last} is the last file in HR_APPLY_CHAIN but schema-apply-order.json applies another `
         + 'hr_apply file AFTER it. Whichever applies last wins, and it would silently delete this '
         + "one's change while every self-check still passed.");
      chainOk = false;
    } else if (chainOk) {
      pass(`${last} is the last toucher of hr_apply, in this file and in the apply order`);
    }
  }
}

// ── PART 1g — EVERY CURRENCY THE ENGINE CAN WRITE HAS A DAILY CEILING ────
// Security's ruling, 2026-08-15, after the gem finding: "A delta key the engine
// can write must have both a per-call clamp and a per-day ledger-derived ceiling
// before the first intent that writes it ships. If a currency has no `*_in`
// column on player_ledger and no dimension in hr_day_budget_limits(), no intent
// may put it in a delta."
//
// The finding it came from: gems had a 100,000/call clamp and NO daily ceiling,
// so a probe minted 1,200,000 gems in 12 calls with zero refusals while the
// byte-identical gold loop was refused at call 6. One dimension was missing.
// Nobody noticed because nothing anywhere related the delta-key list to the
// budget-dimension list — so this lint relates them, by name.
//
// It is deliberately a CLASSIFICATION rather than a heuristic: every key in
// hr_apply's c_delta_keys must be classified below, and an UNCLASSIFIED key
// fails the build. That is the property that matters — a new delta key cannot
// ship without somebody deciding, in writing, whether it moves value.
say('── every currency delta key has a per-call clamp AND a daily ceiling (Security 2026-08-15)');
{
  const LAST = HR_APPLY_CHAIN[HR_APPLY_CHAIN.length - 1];
  const applySql = (sources.get(LAST) || '').replace(/\r\n/g, '\n');

  // key -> [class, note]. 'currency' means "a scalar balance hr_apply adds to";
  // those need the full treatment. Everything else states WHY it does not.
  const DELTA_KEY_CLASS = {
    gold:  ['currency', 'the economy'],
    gems:  ['currency', 'premium; b351 — the ruling that produced this lint'],
    xp:    ['budgeted', 'not a balance but ledger-budgeted as `xp` (per-skill clamp)'],
    items: ['budgeted', 'not a balance but ledger-budgeted as `qty` (per-item clamp)'],
    hp:    ['bounded',  'clamped into [0, max_hp] by the UPDATE itself; not tradeable, not rankable'],
    equip: ['conserved', 'a TRANSFER between player_inventory and player_equipment; totals conserved'],
    activity: ['pointer', 'names an activity; validated against hr_activities + the skill gate'],
    accrued_to: ['clock', 'clamped into [old, now()] by the server; never a value'],
    farm: ['pointer', 'crop id validated against hr_crops; planted_at is now()'],
    progress: ['bounded', 'kind allowlisted, add clamped, "claimed" unreachable'],
    progress_claim: ['bounded', 'requires an already-done row; row_count is the check'],
    journal: ['metadata', 'kind allowlisted, intent is a label'],
    tool_carry: ['bounded', 'b348 — an ABSOLUTE fraction per skill, range-refused in hr_apply'],
  };

  const m = applySql.match(/c_delta_keys constant text\[\] := array\[([\s\S]*?)\];/);
  if (!m) {
    fail(`could not read c_delta_keys out of ${LAST} — this lint would be vacuous, which is the `
       + 'always-null-probe failure the whole SQL tier is organised around.');
  } else {
    const keys = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    if (keys.length < 5) {
      fail(`c_delta_keys parsed to ${keys.length} key(s) — the parser has stopped matching reality`);
    }
    const unclassified = keys.filter((k) => !DELTA_KEY_CLASS[k]);
    const stale = Object.keys(DELTA_KEY_CLASS).filter((k) => !keys.includes(k));
    for (const k of unclassified) {
      fail(`hr_apply accepts the delta key "${k}" and DELTA_KEY_CLASS in tests/run-sql-tests.mjs does `
         + 'not classify it. If it moves a balance, it needs a per-call clamp, a `*_in` column on '
         + 'player_ledger stamped by hr_apply, and a dimension in hr_day_budget_limits() — all three, '
         + 'before the first intent that writes it ships (Security, 2026-08-15). If it does not, say '
         + 'so here in one line.');
    }
    for (const k of stale) {
      fail(`DELTA_KEY_CLASS classifies "${k}" but hr_apply no longer accepts it — a stale entry means `
         + 'this lint is describing a contract that has moved.');
    }

    // The currencies, in full.
    const budgetSql = applySql;  // §2 of the same file declares the limits
    for (const k of keys.filter((x) => (DELTA_KEY_CLASS[x] || [])[0] === 'currency')) {
      const col = `${k}_in`;
      const clamp = new RegExp(`c_max_${k.replace(/s$/, '')}_delta\\s+constant bigint`);
      /* BOTH halves of the INSERT, inside the one statement. The column list
         alone is not the stamp: `(… gems_in, meta) values (… v_qty_in, meta)`
         parses, inserts NULL, and leaves a ceiling checked against a sum that
         can never grow — which is the shape mutation `apply_stamps_null` in
         tests/gem-daily-budget.mjs plants and this lint must be able to see. */
      const insertStmt = (applySql.match(
        /insert into public\.player_ledger[\s\S]*?\)\);/) || [''])[0];
      const stamped = new RegExp(`\\b${col}\\b`).test(insertStmt)
        && new RegExp(`\\bv_${col}\\b`).test(insertStmt);
      const dimension = new RegExp(`'${k}',\\s*c_day_${k}_budget`).test(budgetSql);
      const column = [...sources.values()].some((sql) =>
        new RegExp(`alter table public\\.player_ledger add column if not exists ${col}\\b`, 'i').test(sql));

      if (!clamp.test(applySql)) fail(`currency "${k}" has no per-call clamp (c_max_*_delta) in ${LAST}`);
      else if (!column) fail(`currency "${k}" has no player_ledger.${col} column created by any migration `
        + '— the daily ceiling would have nothing to sum');
      else if (!stamped) fail(`currency "${k}" is never stamped into player_ledger.${col} by hr_apply — `
        + 'the ceiling would be checked against a sum that cannot grow, which is a control that reads '
        + 'as a control and is not one');
      else if (!dimension) fail(`currency "${k}" has NO DIMENSION in hr_day_budget_limits(). This is the `
        + 'exact defect Security blocked the gold-grant intent on: a per-call clamp with no daily '
        + 'ceiling is a speed bump measured in seconds (hr_apply allows 240 applies/minute).');
      else pass(`currency "${k}": per-call clamp + player_ledger.${col} + stamped by hr_apply + a `
        + `c_day_${k}_budget dimension`);
    }
    if (!unclassified.length && !stale.length) {
      pass(`all ${keys.length} delta keys are classified (${keys.filter((x) => DELTA_KEY_CLASS[x][0] === 'currency').length} currencies)`);
    }
  }
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
