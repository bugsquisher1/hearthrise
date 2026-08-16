/* PROOF OF SHAPE — ONE gold call site (`buyShopItem`, src/legacy.js:4947)
 * driven through the REAL hr_apply on a REAL PostgreSQL (PGlite/WASM, PG18),
 * with the repo's real migration chain applied verbatim.
 *
 * It answers, by execution rather than by reading:
 *   1. does a gold SPEND + item GRANT survive as one delta?
 *   2. is a replay with a hostile delta refused?
 *   3. does key reuse under a DIFFERENT intent name get caught? (the S6 branch
 *      production does NOT have — run with --strip-mismatch to model production)
 *   4. overspend / stale version
 *   5. where does the DAILY GOLD BUDGET bite a vendor-sell surface?
 *
 * Nothing is applied to production. Nothing is committed.
 */
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const REPO = process.argv[2];
const MIG = (f) => join(REPO, 'supabase', 'migrations', f);
const STRIP = process.argv.includes('--strip-mismatch');

const MIGRATIONS = [
  ['player-state', MIG('2026-08-11-player-state.sql')],
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['grant-hygiene', MIG('2026-08-11-grant-hygiene.sql')],
  /* market-v2 LEFT THIS BUNDLE 2026-08-17. It never drove a market function
     here — it was applied only so the bundle matched conservation-fuzz's — and
     2026-08-17-market-v2.sql fails CLOSED without hr_utc_day_key,
     hr_client_write_baseline and the four-file hr_apply chain, whose transitive
     closure is the whole chain under another name. The market now has its own
     guard on the REAL replayed chain: tests/market-v2.mjs. */
];

const { PGlite } = await import('@electric-sql/pglite');
const db = await PGlite.create();

const sources = new Map();
for (const [name, path] of MIGRATIONS) sources.set(name, (await readFile(path, 'utf8')).replace(/\r\n/g, '\n'));

/* MUTATION: remove the intent_mismatch branch, modelling production's stale
   body. The anchor must match EXACTLY ONCE or this is decoration. */
if (STRIP) {
  let sql = sources.get('apply-engine');
  const anchor = 'if v_prev_intent is distinct from v_this_intent then';
  const n = sql.split(anchor).length - 1;
  if (n !== 1) { console.error(`MUTATION ANCHOR matched ${n}x, need 1 — aborting rather than reporting a false pass`); process.exit(2); }
  sources.set('apply-engine', sql.replace(anchor, 'if false then'));
  console.log('[MUTATION] intent_mismatch branch REMOVED (models production\'s 25,966-char body)\n');
}

await db.exec("select set_config('hearthrise.market_wipe_ok','yes',false)");
await db.exec(await readFile(join(REPO, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8'));
const seat = await readFile(MIG('2026-08-08-clan-seat.sql'), 'utf8');
const dayKey = seat.match(/create or replace function public\.hr_utc_day_key[\s\S]*?\$\$;/);
if (!dayKey) throw new Error('could not lift hr_utc_day_key');
await db.exec(dayKey[0]);
await db.exec('revoke execute on function public.hr_utc_day_key(timestamptz) from public, anon, authenticated, service_role');
for (const [name] of MIGRATIONS) await db.exec(sources.get(name));

const UID = '00000001-0000-4000-a000-000000000001';
await db.query('insert into auth.users(id) values ($1)', [UID]);
await db.query('insert into profiles(id, display_name) values ($1,$2)', [UID, 'ShapeProbe']);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [UID]);
const r0 = (await db.query('select hr_create_character($1) r', [0])).rows[0].r;
if (r0.ok !== true) { console.error('character create failed', r0); process.exit(2); }

let version = 0;
async function apply(intentId, delta) {
  await db.exec('set role hr_engine');
  const r = (await db.query('select hr_apply($1,$2,$3,$4,$5::jsonb) r',
    [UID, 0, version, intentId, JSON.stringify(delta)])).rows[0].r;
  await db.exec('reset role');
  if (r.ok === true && r.replayed !== true) version = Number(r.version);
  return r;
}
const goldNow = async () => Number((await db.query('select gold from player_state where user_id=$1 and slot=0', [UID])).rows[0].gold);
const invNow = async (id) => Number(((await db.query('select qty from player_inventory where user_id=$1 and slot=0 and item_id=$2', [UID, id])).rows[0] || { qty: 0 }).qty);

const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-a000-000000000000`;
const out = [];
const say = (name, got, note) => { out.push({ name, got, note }); console.log(`${name.padEnd(30)} ${String(got).padEnd(22)} ${note || ''}`); };

// seed 100,000 gold
await apply(U(1), { gold: 100000, journal: { kind: 'admin', intent: 'seed' } });
say('seed', await goldNow(), 'opening balance');

// 1. buy_shop: gold OUT, item IN, one delta
const r1 = await apply(U(2), { gold: -250, items: { normal_log: 2 }, journal: { kind: 'shop', intent: 'buy_shop' } });
say('1 buy_shop ok', r1.ok, `gold=${await goldNow()} logs=${await invNow('normal_log')} version=${version}`);

// 2. replay same key, HOSTILE delta
const r2 = await apply(U(2), { gold: 99999999, journal: { kind: 'shop', intent: 'buy_shop' } });
say('2 replay hostile', `${r2.ok}/${r2.replayed}`, `gold=${await goldNow()} (must be unchanged)`);

// 3. same key, DIFFERENT intent name — the S6 branch
const r3 = await apply(U(2), { gold: -1, journal: { kind: 'shop', intent: 'vendor_sell' } });
say('3 key reuse, other intent', r3.error || `${r3.ok}/replayed=${r3.replayed}`,
  STRIP ? '<-- PRODUCTION: answers the OTHER intent decision' : 'expect intent_mismatch');

// 4. overspend
const r4 = await apply(U(4), { gold: -1000000, journal: { kind: 'shop', intent: 'buy_shop' } });
say('4 overspend', r4.error, `gold=${await goldNow()}`);

// 5. stale version
const stale = version; version = stale - 1;
const r5 = await apply(U(5), { gold: -1, journal: { kind: 'shop', intent: 'buy_shop' } });
version = stale;
say('5 stale version', r5.error, '');

// 6. per-call gold clamp
const r6 = await apply(U(6), { gold: 60000000, journal: { kind: 'shop', intent: 'buy_shop' } });
say('6 gold 60,000,000', r6.error, 'per-call clamp is 50,000,000');

// 7. THE VENDOR-SELL QUESTION: how much gross gold inflow before the day budget bites?
let minted = 0, n = 0, lastErr = null;
for (let i = 0; i < 40; i++) {
  const r = await apply(U(100 + i), { gold: 1000000, journal: { kind: 'vendor', intent: 'vendor_sell' } });
  if (r.ok !== true) { lastErr = r.error; break; }
  minted += 1000000; n++;
}
say('7 vendor-sell gross cap', lastErr || 'never refused', `${n} x 1,000,000 accepted = ${minted.toLocaleString()} then ${lastErr}`);

// 8. a SPEND after the budget is exhausted — does the player get locked out of spending?
const r8 = await apply(U(200), { gold: -100, journal: { kind: 'shop', intent: 'buy_shop' } });
say('8 SPEND after budget hit', r8.error || `ok gold=${await goldNow()}`, 'gross-inflow budget must not block a spend');

console.log('\n(no production writes; PGlite is in-memory and dies with this process)');
