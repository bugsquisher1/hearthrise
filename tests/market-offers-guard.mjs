#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-offers-guard.mjs
//
// MUTATION PROOF for supabase/migrations/2026-08-12-market-offers-authority.sql,
// on real PostgreSQL 18 in WASM (PGlite, in-process, no Docker, no credentials,
// production untouched).
//
// The shape every assertion here obeys, because this repo has been burned nine
// times by probes that assert nothing:
//
//   BEFORE   the exploit is REPRODUCED against the v1 schema. If it does not
//            reproduce, the run FAILS as a harness problem — a guard that is
//            never shown the bug it stops is decoration.
//   AFTER    the migration is applied and the same operation is REFUSED, with
//            the specific SQLSTATE it is supposed to raise (not merely "an
//            error", which a typo also produces).
//   CONTROL  paired with every refusal, a legitimate operation that must still
//            SUCCEED. A trigger that raises on everything would otherwise pass
//            the whole file.
//
// WHAT IT DOES **NOT** TEST, said out loud: M1 (listing an item you do not
// own). The migration does not close M1 and does not claim to — see its header.
// There is nothing here that could test a fix that does not exist.
//
// NOTHING IS RE-IMPLEMENTED. The v1 market DDL is lifted verbatim out of
// supabase/schema.sql and the v1 listing trigger out of
// 2026-08-11-live-market-rls.sql, by anchored regex. A lift whose anchor stops
// matching ABORTS the run rather than quietly stubbing — the fixture must not
// become the thing under test.
//
//   node tests/market-offers-guard.mjs
//
// Exit codes: 0 = clean · 1 = an assertion failed · 2 = harness problem.
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

// ── the lifts ────────────────────────────────────────────────────────────
function lift(sql, re, what, file) {
  const m = sql.match(re);
  if (!m) harness(`could not lift ${what} out of ${file} — the anchor has moved. `
                + 'Fix the anchor; do NOT stub the object, or this test starts testing itself.');
  return m[0];
}

const schema = LF(await readFile(join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
const liveRls = LF(await readFile(MIG('2026-08-11-live-market-rls.sql'), 'utf8'));
const catalogue = LF(await readFile(MIG('2026-08-11-catalogue.generated.sql'), 'utf8'));
const target = LF(await readFile(MIG('2026-08-12-market-offers-authority.sql'), 'utf8'));

const v1Listings = lift(schema,
  /create table if not exists public\.market_listings \([\s\S]*?\n\);/,
  'the v1 market_listings DDL', 'schema.sql');
const v1Offers = lift(schema,
  /create table if not exists public\.market_buy_offers \([\s\S]*?\n\);/,
  'the v1 market_buy_offers DDL', 'schema.sql');
const v1OfferPolicies = lift(schema,
  /alter table public\.market_buy_offers enable row level security;[\s\S]*?with check \(auth\.uid\(\) = buyer_user_id\);/,
  'the v1 market_buy_offers policies', 'schema.sql');
const listingStamp = lift(liveRls,
  /create or replace function public\.hr_market_listing_stamp\(\)[\s\S]*?\$\$;/,
  'hr_market_listing_stamp()', '2026-08-11-live-market-rls.sql');
// hr_items: the catalogue's DDL + every insert. Its own file opens with a
// `player_state` precondition that has nothing to do with this test, so the
// slice starts at the table.
const hrItems = lift(catalogue,
  /create table if not exists public\.hr_items \([\s\S]*?\ncreate index if not exists hr_items_tradeable_idx[^\n]*\n/,
  'the hr_items DDL', 'catalogue.generated.sql');
const hrItemRows = [...catalogue.matchAll(/insert into public\.hr_items[\s\S]*?;\n/g)].map((m) => m[0]);
if (!hrItemRows.length) harness('no hr_items insert statements found in the catalogue');

// ── boot ─────────────────────────────────────────────────────────────────
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { harness('@electric-sql/pglite is not installed. npm i -D @electric-sql/pglite'); }

const UID = '00000000-0000-4000-a000-000000000001';
const OTHER = '00000000-0000-4000-a000-0000000000ff';

// A fresh database carrying production's v1 market posture and nothing else.
// Used three times: once for the real run, and once per mutation below.
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
    create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text);
    insert into auth.users (id) values ('${UID}'), ('${OTHER}');
    insert into public.profiles (id, display_name) values ('${UID}', 'HonestPlayer'), ('${OTHER}', 'Victim');
    -- Scaffolding only: the catalogue file's own precondition names it and
    -- nothing under test reads it. Not a stub of anything this test asserts on.
    create table public.player_state (user_id uuid, slot int);
  `);
  await d.exec(hrItems);
  for (const stmt of hrItemRows) await d.exec(stmt);
  await d.exec(v1Listings);
  await d.exec(v1Offers);
  await d.exec(v1OfferPolicies);
  // The v1 listing surface AS PRODUCTION HOLDS IT TODAY: live-market-rls's
  // stamp trigger is applied, so the cap trigger this test proves really does
  // land second in name order, which is the whole point of §1's auth.uid() note.
  await d.exec(listingStamp);
  await d.exec(`
    create trigger trg_market_listing_stamp before insert on public.market_listings
      for each row execute function public.hr_market_listing_stamp();
    alter table public.market_listings enable row level security;
    create policy "own listings insert" on public.market_listings
      for insert to authenticated with check (auth.uid() = seller_user_id);
    grant select, insert, delete on public.market_listings to authenticated;
    grant select, insert, update, delete on public.market_buy_offers to anon, authenticated;
    select set_config('request.jwt.claim.sub', '${UID}', false);
  `);
  return d;
}

let db;
const as = (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);

// Runs `sql` and returns {ok:true} or {ok:false, code, message}. Deliberately
// not "did it throw" — the SQLSTATE is the assertion.
async function attempt(sql) {
  try { await db.exec(sql); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code || (e.cause && e.cause.code) || String(e.message).match(/\b([0-9A-Z]{5})\b/)?.[1], message: String(e.message) }; }
}
const one = async (sql) => (await db.query(sql)).rows[0];

try {
  db = await buildDb();
  const nItems = await one('select count(*) n, count(*) filter (where not tradeable) bop from public.hr_items');
  if (Number(nItems.n) < 100 || Number(nItems.bop) < 1) {
    harness(`the lifted catalogue is thin (${nItems.n} items, ${nItems.bop} untradeable) — the tradeable check would be vacuous`);
  }
  pass(`fixture up: v1 schema + live-market-rls listing stamp + ${nItems.n} catalogue items (${nItems.bop} untradeable)`);
} catch (e) {
  harness(`fixture failed to build: ${e.message}`);
}

await as(UID);

// ════════════════════════════════════════════════════════════════════════
// BEFORE — the exploits must REPRODUCE, or this test proves nothing
// ════════════════════════════════════════════════════════════════════════
process.stdout.write('── BEFORE (v1 schema): the exploits must reproduce\n');
{
  const r = await attempt(`insert into public.market_buy_offers
      (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each, escrowed, posted_at)
    values ('11111111-1111-4111-8111-111111111111', '${UID}', 0, 'Victim-IMPERSONATED',
            'not_a_real_item_id', 999999, 999999, 0, timestamptz '1999-01-01')`);
  if (!r.ok) harness(`O1 did not reproduce on the v1 schema (${r.code} ${r.message}) — nothing below would mean anything`);
  const row = await one(`select buyer_name, item_id, escrowed, posted_at from public.market_buy_offers
                          where id='11111111-1111-4111-8111-111111111111'`);
  if (row.buyer_name !== 'Victim-IMPERSONATED') harness('O1 fixture: buyer_name was not stored as supplied');
  pass(`O1 reproduces: offer stored buyer_name='${row.buyer_name}', item='${row.item_id}', escrowed=${row.escrowed}, posted_at=${new Date(row.posted_at).getUTCFullYear()}`);

  const p = await attempt(`update public.market_buy_offers set max_each = 1, item_id = 'hearth_token'
                            where id='11111111-1111-4111-8111-111111111111'`);
  if (!p.ok) harness(`O1's post-hoc PATCH did not reproduce (${p.code})`);
  pass('O1 reproduces: a posted offer\'s terms were rewritten after posting (A6 shape)');

  for (let i = 0; i < 40; i++) {
    const l = await attempt(`insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
                              values ('${UID}', 0, 'x', 'normal_log', 1, 1)`);
    if (!l.ok) harness(`O2 fixture: legitimate listing #${i + 1} was refused (${l.code} ${l.message})`);
  }
  const n = await one(`select count(*) n from public.market_listings where seller_user_id='${UID}'`);
  if (Number(n.n) !== 40) harness(`O2 did not reproduce: expected 40 listings, got ${n.n}`);
  pass(`O2 reproduces: ${n.n} listings posted for one character with no server-side bound (the client's own ceiling is 13)`);

  await db.exec('delete from public.market_buy_offers; delete from public.market_listings;');
}

// ════════════════════════════════════════════════════════════════════════
// APPLY
// ════════════════════════════════════════════════════════════════════════
{
  // The migration's §6 behavioural half needs a profile with a display_name,
  // which the fixture has — so it runs here rather than skipping. If it ever
  // starts skipping, this test loses the migration's own strongest assertions
  // silently, so that is checked explicitly.
  const r = await attempt(target);
  if (!r.ok) { fail(`the migration REFUSED TO APPLY: ${r.code || ''} ${r.message}`); }
  else pass('migration applied, self-verification block passed');
  if (failures) { process.stderr.write('\nmarket-offers-guard: FAILED at apply\n'); process.exit(1); }
  const t = await db.query(`select c.relname||'.'||t.tgname nm from pg_trigger t join pg_class c on c.oid=t.tgrelid
                             where c.relname in ('market_listings','market_buy_offers') and not t.tgisinternal
                             order by 1`);
  const got = t.rows.map((r) => r.nm);
  const want = ['market_buy_offers.trg_market_offer_cap',
                'market_buy_offers.trg_market_offer_immutable',
                'market_buy_offers.trg_market_offer_stamp',
                'market_listings.trg_market_listing_cap',
                'market_listings.trg_market_listing_stamp'];
  if (got.join('|') !== want.join('|')) fail(`trigger set is ${got.join(', ')}, expected ${want.join(', ')}`);
  else pass('5 triggers attached, and market_listings.…_cap sorts BEFORE …_stamp — the order the cap is written to survive');
}

// ════════════════════════════════════════════════════════════════════════
// AFTER — refusals, each paired with a control
// ════════════════════════════════════════════════════════════════════════
process.stdout.write('── AFTER: refused, with controls\n');
await as(UID);

// O1-a: identity, name, clock and escrow are all derived.
{
  const r = await attempt(`insert into public.market_buy_offers
      (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each, escrowed, posted_at)
    values ('22222222-2222-4222-8222-222222222222', '${OTHER}', 99, 'Victim-IMPERSONATED',
            'normal_log', 5, 10, 0, timestamptz '1999-01-01')`);
  if (!r.ok) { fail(`CONTROL: a legitimate offer was refused after the migration (${r.code} ${r.message})`); }
  else {
    const row = await one(`select buyer_user_id, buyer_name, buyer_slot, escrowed,
                                  (posted_at > now() - interval '1 minute') fresh
                             from public.market_buy_offers where id='22222222-2222-4222-8222-222222222222'`);
    if (row.buyer_user_id !== UID)         fail(`buyer_user_id not pinned: ${row.buyer_user_id}`);
    else if (row.buyer_name !== 'HonestPlayer') fail(`buyer_name not derived: ${row.buyer_name}`);
    else if (row.buyer_slot !== 5)         fail(`buyer_slot not clamped: ${row.buyer_slot}`);
    else if (row.escrowed !== 50)          fail(`escrowed not derived (want 50, got ${row.escrowed})`);
    else if (!row.fresh)                   fail('posted_at accepted the client clock');
    else pass('O1 CLOSED: buyer_user_id pinned, buyer_name derived from profiles, slot clamped, escrowed derived (5x10=50), posted_at = now()');
  }
}

// O1-b: the terms are immutable — and the CONTROL is that a cancel still works.
{
  const r = await attempt(`update public.market_buy_offers set max_each = 1
                            where id='22222222-2222-4222-8222-222222222222'`);
  if (r.ok) fail('O1 OPEN: a posted offer was still mutable');
  else if (r.code !== '42501') fail(`the offer PATCH failed with ${r.code}, expected 42501 — a wrong error is not a guard`);
  else {
    const row = await one(`select max_each from public.market_buy_offers where id='22222222-2222-4222-8222-222222222222'`);
    if (row.max_each !== 10) fail(`max_each changed to ${row.max_each} despite the refusal`);
    else pass('O1 CLOSED: post-hoc PATCH refused 42501 and the value is unchanged');
  }
  const c = await attempt(`delete from public.market_buy_offers where id='22222222-2222-4222-8222-222222222222'`);
  if (!c.ok) fail(`CONTROL: cancelling an offer broke (${c.code}) — placeOffer/cancelOffer is the whole feature`);
  else pass('CONTROL: cancelling an offer still works');
}

// O1-c: the catalogue check, fail-closed, both halves + a control.
for (const [item, why] of [['not_a_real_item_id', 'an unknown item id'], ['muster_seal', 'a bind-on-pickup item']]) {
  const r = await attempt(`insert into public.market_buy_offers (buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
                            values ('${UID}', 0, 'x', '${item}', 1, 1)`);
  if (r.ok) fail(`O1 OPEN: ${why} (${item}) was offerable — the catalogue check failed OPEN`);
  else if (r.code !== '22023') fail(`${item} refused with ${r.code}, expected 22023`);
  else pass(`O1 CLOSED: ${why} refused 22023`);
}
{
  const r = await attempt(`insert into public.market_buy_offers (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
                            values ('33333333-3333-4333-8333-333333333333','${UID}', 0, 'x', 'hearth_token', 2, 3)`);
  if (!r.ok) fail(`CONTROL: a tradeable item was refused (${r.code}) — the catalogue check refuses everything`);
  else pass('CONTROL: a tradeable item is still offerable');
  await db.exec(`delete from public.market_buy_offers where id='33333333-3333-4333-8333-333333333333'`);
}

// O1-d: the escrow overflow guard, with a control at the boundary.
{
  const r = await attempt(`insert into public.market_buy_offers (buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
                            values ('${UID}', 0, 'x', 'normal_log', 1000000, 100000000)`);
  if (r.ok) fail('O1 OPEN: qty * max_each overflowed into the int4 escrow column');
  else if (r.code !== '22003') fail(`the overflow was refused with ${r.code}, expected 22003`);
  else pass('O1 CLOSED: qty * max_each = 1e14 refused 22003 instead of truncating into escrowed');
  const c = await attempt(`insert into public.market_buy_offers (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
                            values ('44444444-4444-4444-8444-444444444444','${UID}', 0, 'x', 'normal_log', 1000, 1000)`);
  if (!c.ok) fail(`CONTROL: a normal-sized offer was refused (${c.code})`);
  else pass('CONTROL: a normal-sized offer (1000 x 1000 = 1,000,000) still posts');
  await db.exec(`delete from public.market_buy_offers where id='44444444-4444-4444-8444-444444444444'`);
}

// O2: the cap bites at 25, counts against auth.uid() and NOT the client-supplied
//     owner, and the 25 successful inserts are its own control.
//
//     Every row below names OTHER as seller_user_id. The cap trigger fires
//     BEFORE the stamp (name order: …_cap < …_stamp), so if it read
//     new.seller_user_id it would count OTHER's zero listings forever and never
//     bite. This is the assertion that makes §1's auth.uid() note load-bearing.
{
  let posted = 0;
  let capped = null;
  for (let i = 0; i < 30; i++) {
    const r = await attempt(`insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
                              values ('${OTHER}', 0, 'x', 'normal_log', 1, 1)`);
    if (r.ok) posted++;
    else { capped = r; break; }
  }
  if (posted !== 25) fail(`O2: the cap bit after ${posted} listings, expected 25`);
  else if (!capped) fail('O2 OPEN: 30 listings posted under a FORGED seller_user_id — the cap read the client value, not auth.uid()');
  else if (capped.code !== '54000') fail(`O2: the 26th listing was refused with ${capped.code}, expected 54000`);
  else pass('O2 BOUNDED: 25 listings posted (control), the 26th refused 54000 — and the cap counted auth.uid(), not the forged seller_user_id');

  const owner = await one(`select count(*) n from public.market_listings where seller_user_id='${OTHER}'`);
  if (Number(owner.n) !== 0) fail(`the stamp did not rewrite the forged seller_user_id on ${owner.n} row(s)`);
  else pass('…and every one of those rows was stamped back to the real caller');

  // A DIFFERENT character on the same account is unaffected — the cap is per
  // (account, slot), which is the rule the client mirrors.
  const other = await attempt(`insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
                                values ('${UID}', 1, 'x', 'normal_log', 1, 1)`);
  if (!other.ok) fail(`CONTROL: slot 1 was capped by slot 0's rows (${other.code}) — the cap is not per-character`);
  else pass('CONTROL: the cap is per (account, slot) — a second character is unaffected');
}

// The anon posture: no write grants at all.
{
  const g = await one(`select coalesce(string_agg(privilege_type, ','), 'none') p
                         from information_schema.role_table_grants
                        where table_schema='public' and table_name='market_buy_offers'
                          and grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE')`);
  if (g.p !== 'none') fail(`anon still holds ${g.p} on market_buy_offers`);
  else pass('anon holds no write grant on market_buy_offers');
}

// ── M1, restated as a test that DELIBERATELY EXPECTS THE HOLE ────────────
// This is not a passing security property; it is a tripwire. If someone later
// makes an unowned listing fail, this test turns RED and whoever did it must
// come here, read the header, and delete this block on purpose. That is the
// only mechanism that stops "M1 is fixed" from becoming true in the codebase
// while remaining false in the report — or vice versa.
{
  await as(UID);
  const r = await attempt(`insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
                            values ('${UID}', 3, 'x', 'abyssal_greaves', 5, 999999)`);
  if (r.ok) pass('M1 STILL OPEN (expected): 5x abyssal_greaves listed while owning zero. This migration does not fix M1; market-v2 does.');
  else fail(`M1 appears to be fixed (${r.code} ${r.message}) — if that is intentional, update this test AND the migration header, `
          + 'which currently states in writing that M1 is unmitigated.');
}

// ── idempotency: the header says SAFE TO RE-RUN, so prove it ─────────────
// A second apply re-runs §6 against a database that already has 26 fixture
// listings' worth of history and the triggers already attached. Both the
// `drop trigger if exists` / `create or replace` shape AND the fixture cleanup
// have to hold, or the second apply fails.
{
  const before = await one('select count(*) n from public.market_listings');
  const r = await attempt(target);
  if (!r.ok) fail(`the migration is NOT re-runnable: ${r.code || ''} ${r.message}`);
  else {
    const after = await one('select count(*) n from public.market_listings');
    if (after.n !== before.n) fail(`the second apply leaked ${after.n - before.n} listing row(s)`);
    else pass('idempotent: a second apply succeeds and leaks no rows');
  }
}

await db.close();

// ════════════════════════════════════════════════════════════════════════
// MUTATION — the migration's OWN §6 must REFUSE a broken migration
//
// Everything above proves the guards work. This proves the migration's
// self-verification block would have STOPPED them shipping broken — which is
// the only thing that makes §6 a commit gate rather than a comment, and the
// only way to know its behavioural half is not silently skipping (it skips when
// no profile has a display_name; this fixture gives it one, and a skip would
// show up here as a mutation that applies cleanly).
// ════════════════════════════════════════════════════════════════════════
process.stdout.write('── MUTATION: §6 must refuse a broken migration\n');
const MUTATIONS = [
  {
    id: 'escrow_client_authored',
    what: 'the offer stamp stops deriving `escrowed` and accepts the client value',
    find: '  new.escrowed := v_escrow::int;',
    replace: '  -- MUTATED: escrowed is taken from the client',
    expect: /escrowed was accepted from the client/i,
  },
  {
    id: 'cap_reads_client_owner',
    what: 'the listing cap counts new.seller_user_id instead of auth.uid() — the trigger-order bypass',
    find: `declare v_uid uuid := auth.uid(); v_slot int; v_n int; v_cap int := 25;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_slot := least(5, greatest(0, coalesce(new.seller_slot, 0)));`,
    replace: `declare v_uid uuid := new.seller_user_id; v_slot int; v_n int; v_cap int := 25;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_slot := least(5, greatest(0, coalesce(new.seller_slot, 0)));`,
    expect: /the 26th listing was accepted/i,
  },
  {
    id: 'offer_terms_mutable',
    what: 'the immutability trigger is never attached',
    find: `create trigger trg_market_offer_immutable
  before update on public.market_buy_offers
  for each row execute function public.hr_market_offer_immutable();`,
    replace: '-- MUTATED: the immutability trigger is not attached',
    expect: /trigger trg_market_offer_immutable is not attached/i,
  },
];

for (const m of MUTATIONS) {
  const n = target.split(m.find).length - 1;
  if (n !== 1) {
    fail(`mutation "${m.id}" anchor matched ${n} times (need exactly 1) — the migration text moved. `
       + 'A planted bug that is not planted is decoration; fix the anchor.');
    continue;
  }
  const broken = target.replace(m.find, m.replace);
  if (broken === target) { fail(`mutation "${m.id}" produced identical SQL`); continue; }
  const d = await buildDb();
  let err = null;
  try { await d.exec(broken); } catch (e) { err = String(e.message); }
  await d.close();
  if (!err) fail(`MUTATION SLIPPED: "${m.id}" (${m.what}) applied CLEANLY. §6 does not detect it.`);
  else if (!m.expect.test(err)) {
    fail(`mutation "${m.id}" was refused, but by the wrong assertion — expected ${m.expect}, got: ${err.slice(0, 220)}`);
  } else pass(`§6 caught "${m.id}": ${m.what}`);
}

process.stdout.write(failures
  ? `\nmarket-offers-guard: ${failures} FAILURE(S)\n`
  : '\nmarket-offers-guard: clean\n');
process.exit(failures ? 1 : 0);
