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
//     No Postgres driver is vendored on purpose: this repo is a static site
//     with one devDependency, and adding `pg` to run one script is a worse
//     trade than emitting SQL.
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
// Shipped and reviewed separately (a live impersonation fix), so it is linted
// but not part of the foundation bundle.
const ALSO_LINTED = ['2026-08-11-chat-name-authority.sql'];

let failures = 0;
const fail = (msg) => { failures++; console.error(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// ── PART 1a — catalogue drift ────────────────────────────────────────────
console.log('── catalogue drift');
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
console.log('── grant hygiene (revoke before grant)');
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
console.log('── rollback hygiene (no bare return after a write in hr_apply)');
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

// ── PART 1d — the migrations must be self-verifying ──────────────────────
console.log('── self-verification blocks');
for (const [file, sql] of sources) {
  if (/raise\s+exception/i.test(sql) && /do\s+\$\$/.test(sql)) pass(`${file}: has assertions`);
  else fail(`${file}: no self-verifying do-block`);
}

// ── PART 2 — emit the behavioural bundle ─────────────────────────────────
if (process.argv.includes('--emit')) {
  const suite = await readFile(join(ROOT, 'tests', 'sql', 'server-authority.test.sql'), 'utf8');
  const parts = ['-- GENERATED by tests/run-sql-tests.mjs --emit. Runs and rolls back.\nbegin;\n'];
  for (const f of BUNDLE) parts.push(`\n-- ══ ${f} ══\n${sources.get(f)}\n`);
  parts.push(`\n-- ══ tests/sql/server-authority.test.sql ══\n${suite}\n`);
  parts.push('\nrollback;\n');
  process.stdout.write(parts.join(''));
  process.exit(failures ? 1 : 0);
}

console.log('');
if (failures) {
  console.error(`${failures} static check(s) failed.`);
  console.error('The behavioural suite is tests/sql/server-authority.test.sql —');
  console.error('run it with:  node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"');
  process.exit(1);
}
console.log('static server-tier checks passed.');
console.log('Behavioural suite (needs a database):');
console.log('  node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"');
