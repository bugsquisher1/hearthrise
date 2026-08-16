#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-offers-lockdown.mjs
//
// MUTATION PROOF for supabase/migrations/2026-08-17-market-buy-offers-lockdown.sql,
// on real PostgreSQL in WASM (PGlite, in-process, no Docker, production untouched).
//
// THE CLAIM UNDER TEST:
//   after the lockdown, NO client role can INSERT or DELETE a market_buy_offer —
//   the policies are gone AND the now-dead write grants are revoked — while
//   SELECT still works and the table is otherwise untouched.
//
// The shape every assertion obeys (this repo has been burned by probes that
// assert nothing):
//   BEFORE   the v1 write is REPRODUCED (offer INSERT + DELETE succeed under the
//            2026-08-12 offer policies). If it does not reproduce, the run FAILS
//            as a harness problem — a guard never shown the door it closes is
//            decoration.
//   AFTER    the same write is REFUSED, and SELECT still works (the control).
//   MUTATION the migration's own §3 must REFUSE a broken lockdown — proving the
//            self-verify is a commit gate, not a comment.
//
// The v1 offer table + its 2026-08-12 policies are LIFTED verbatim by anchored
// regex; a lift whose anchor stops matching ABORTS rather than stubbing.
//
//   node tests/market-offers-lockdown.mjs
// Exit: 0 clean · 1 assertion failed · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
const LF = (s) => s.replace(/\r\n/g, '\n');

let failures = 0;
const pass = (m) => process.stdout.write(`  ok    ${m}\n`);
const fail = (m) => { failures++; process.stderr.write(`  FAIL  ${m}\n`); };
const harness = (m) => { process.stderr.write(`HARNESS: ${m}\n`); process.exit(2); };

function lift(sql, re, what, file) {
  const m = sql.match(re);
  if (!m) harness(`could not lift ${what} out of ${file} — the anchor has moved. Fix the anchor.`);
  return m[0];
}

const schema = LF(await readFile(join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
const offersAuth = LF(await readFile(MIG('2026-08-12-market-offers-authority.sql'), 'utf8'));
const target = LF(await readFile(MIG('2026-08-17-market-buy-offers-lockdown.sql'), 'utf8'));

const v1Offers = lift(schema,
  /create table if not exists public\.market_buy_offers \([\s\S]*?\n\);/,
  'the v1 market_buy_offers DDL', 'schema.sql');
// The 2026-08-12 policy split (own offers insert / own offers delete) + grants —
// the exact posture production holds, and the door this file closes.
const offerPolicies = lift(offersAuth,
  /alter table public\.market_buy_offers enable row level security;\ndrop policy[\s\S]*?for delete to authenticated using \(auth\.uid\(\) = buyer_user_id\);/,
  'the 2026-08-12 offer policy split', '2026-08-12-market-offers-authority.sql');

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { harness('@electric-sql/pglite is not installed. npm i -D @electric-sql/pglite'); }

const UID = '00000000-0000-4000-a000-000000000001';

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
    insert into auth.users (id) values ('${UID}');
  `);
  await d.exec(v1Offers);
  // Production posture: RLS on, the 2026-08-12 split policies, and the grants
  // that file leaves (authenticated may insert + delete; select for all).
  await d.exec(offerPolicies);
  await d.exec(`
    grant select on public.market_buy_offers to anon, authenticated;
    grant insert, delete on public.market_buy_offers to authenticated;
    create policy "offers readable" on public.market_buy_offers for select using (true);
    select set_config('request.jwt.claim.sub', '${UID}', false);
    set role authenticated;
  `);
  return d;
}

async function attempt(d, sql) {
  try { await d.exec(sql); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code || (e.cause && e.cause.code) || String(e.message).match(/\b([0-9A-Z]{5})\b/)?.[1], message: String(e.message) }; }
}

// ── BEFORE / APPLY / AFTER ────────────────────────────────────────────────
let db;
try { db = await buildDb(); pass('fixture up: v1 market_buy_offers + 2026-08-12 policy split + grants'); }
catch (e) { harness(`fixture failed: ${e.message}`); }

const INS = `insert into public.market_buy_offers
   (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each, escrowed, posted_at)
 values ('11111111-1111-4111-8111-111111111111', '${UID}', 0, 'x', 'normal_log', 1, 1, 1, now())`;

process.stdout.write('── BEFORE (v1 posture): the client write must reproduce\n');
{
  const r = await attempt(db, INS);
  if (!r.ok) harness(`the offer INSERT did not reproduce on the v1 posture (${r.code} ${r.message})`);
  pass('a client INSERT into market_buy_offers succeeds under the 2026-08-12 policies');
  const del = await attempt(db, `delete from public.market_buy_offers where id='11111111-1111-4111-8111-111111111111'`);
  if (!del.ok) harness(`the offer DELETE did not reproduce (${del.code})`);
  pass('a client DELETE succeeds too');
}

process.stdout.write('── APPLY\n');
{
  await db.exec('reset role');
  const r = await attempt(db, target);
  if (!r.ok) { fail(`the lockdown REFUSED TO APPLY: ${r.code || ''} ${r.message}`); }
  else pass('lockdown applied, self-verification passed');
  await db.exec(`set role authenticated`);
}

process.stdout.write('── AFTER: the write is refused, SELECT still works\n');
if (!failures) {
  const ins = await attempt(db, INS);
  if (ins.ok) fail('an offer INSERT still succeeds after the lockdown — the door is open');
  else pass(`the offer INSERT is now refused (${ins.code})`);

  const sel = await attempt(db, 'select count(*) from public.market_buy_offers');
  if (!sel.ok) fail(`CONTROL: SELECT on market_buy_offers broke (${sel.code}) — the table is over-locked`);
  else pass('CONTROL: SELECT still works — only the write door closed');

  await db.exec('reset role');
  const pol = (await db.query(`select count(*)::int n from pg_policies where schemaname='public'
    and tablename='market_buy_offers' and cmd in ('INSERT','UPDATE','DELETE','ALL')`)).rows[0].n;
  if (Number(pol) !== 0) fail(`${pol} client write policy(ies) survive`);
  else pass('no client write policy survives');
  const gr = (await db.query(`select count(*)::int n from information_schema.role_table_grants
    where table_schema='public' and table_name='market_buy_offers'
      and grantee in ('anon','authenticated','PUBLIC') and privilege_type <> 'SELECT'`)).rows[0].n;
  if (Number(gr) !== 0) fail(`${gr} client write grant(s) survive — the detector's check (4) would flag it`);
  else pass('no client write grant survives — check (4) stays green');
}
await db.close();

// ── MUTATION — §3 must refuse a broken lockdown ───────────────────────────
process.stdout.write('── MUTATION: §3 must refuse a broken lockdown\n');
const MUTATIONS = [
  {
    id: 'grant_not_revoked',
    what: 'the dead INSERT/DELETE grant is left behind (policy dropped, grant kept)',
    find: `revoke insert, update, delete, truncate, references, trigger
  on public.market_buy_offers from anon, authenticated, public;`,
    replace: '-- MUTATED: the dead write grant is not revoked',
    expect: /client write grant\(s\) survive/i,
  },
  {
    id: 'policy_not_dropped',
    what: 'the insert policy is left attached',
    find: 'drop policy if exists "own offers insert" on public.market_buy_offers;',
    replace: '-- MUTATED: the insert policy is not dropped',
    expect: /client write policy/i,
  },
];

for (const m of MUTATIONS) {
  const n = target.split(m.find).length - 1;
  if (n !== 1) { fail(`mutation "${m.id}" anchor matched ${n} times (need 1) — the migration text moved`); continue; }
  const broken = target.replace(m.find, m.replace);
  const d = await buildDb();
  await d.exec('reset role');
  let err = null;
  try { await d.exec(broken); } catch (e) { err = String(e.message); }
  await d.close();
  if (!err) fail(`MUTATION SLIPPED: "${m.id}" (${m.what}) applied CLEANLY — §3 does not detect it`);
  else if (!m.expect.test(err)) fail(`mutation "${m.id}" refused by the wrong assertion: ${err.slice(0, 200)}`);
  else pass(`§3 caught "${m.id}": ${m.what}`);
}

process.stdout.write(failures ? `\nmarket-offers-lockdown: ${failures} FAILURE(S)\n` : '\nmarket-offers-lockdown: clean\n');
process.exit(failures ? 1 : 0);
