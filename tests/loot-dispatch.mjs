#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/loot-dispatch.mjs — THE LOOT PLAN AND DISPATCH LOOT, PLAYED ON THE REPLAYED CHAIN.
//
//   node tests/loot-dispatch.mjs            the guard
//   node tests/loot-dispatch.mjs --mutate   every planted defect must turn its arm RED
//
// Tyler 2026-10-25: the On pickup choice became a destination plan per item (Keep in
// bag / Deposit in storage / Sell) run by "Dispatch loot" in town; nothing moves at
// pickup but "Don't pick up". supabase/migrations/2027-01-23-loot-dispatch.sql.
//   LD-PLAY    a real hunt (the edge's settle, tick door) picks up loot with three
//              items planned deposit / sell / keep and a fourth sell-but-LOCKED: the
//              pickups stay in the bag exactly as a no-plan hunt's (NOTHING SELLS AT
//              PICKUP); Dispatch mid-hunt is refused `hunting` and moves nothing; the
//              hero leaves (the real leave, settled); Dispatch then moves the deposit
//              stack whole to the account's Storage (bag - = Storage +), sells the
//              sell stack at the catalogue bid (= the edge's vendorPriceOf, the price
//              vendor_sell charges), the purse moves by exactly that, keep and locked
//              stay; one bank row and one vendor_sell_many row (gold_kind vendor_sale,
//              gold_in stamped); ONE version step; the answer is the server's numbers
//   LD-REPLAY  the same key answers the same words and moves nothing; a refused key
//              stays free (nothing_to_dispatch, then the same key dispatches)
//   LD-FULL    Storage with room for ONE new kind: a kind already there always fits,
//              the first new kind (item order) takes the room, the next stays in the
//              bag and is reported storage_full; a press that can move nothing is
//              refused storage_full and moves no version
//   LD-SETTER  the four plans; a start-kit item takes no SELL plan (start_kit: no minting
//              from the kit), an unpriced item no sell plan (item_not_sellable); anon
//              cannot dispatch
//   LD-KIT     a start-kit item MAY be planned Deposit in storage (Coordinator 2026-10-25:
//              Storage takes it anyway): Dispatch stores the whole stack, no gold moves
//   LD-IDEM    a second apply of the file is byte-identical (bodies, schema, baseline rows)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { goldOf } from './_gold.mjs';

const MUTATE = process.argv.includes('--mutate');
const FILE = '2027-01-23-loot-dispatch.sql';
const MIG = join(ROOT, 'supabase', 'migrations', FILE);
const idem = () => crypto.randomUUID();

async function asAuth(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}

async function harness() {
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  const M = await H.loadEdge(ROOT);
  const CAT = await import(pathToFileURL(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'catalogue.js')).href);
  const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'items.js')).href);
  return { H, M, bid: (id) => CAT.vendorPriceOf(ITEMS, id) };
}

const bagOf = async (H, db, uid) => (await H.one(db, "select coalesce(jsonb_object_agg(item_id, qty), '{}') from public.player_inventory where user_id = $1 and slot = 0", [uid])) || {};
const bankOf = async (H, db, uid) => (await H.one(db, "select coalesce(jsonb_object_agg(item_id, qty), '{}') from public.account_bank where user_id = $1", [uid])) || {};
const purse = async (db, uid) => Number(await goldOf((sql, p) => db.query(sql, p).then((r) => r.rows), uid, 0));
const version = async (H, db, uid) => Number(await H.one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [uid]));
const n = (o, k) => Number((o || {})[k] || 0);

/* A real hunt: run A with no plan to read the pickups, roll back, plan, run B; then the hero is still hunting. */
async function huntWithPlans(db, ctx) {
  const { H, M } = ctx;
  const uid = H.UIDS[0];
  const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 14 });
  const cuts = H.ticksOf(90000, 12 * 60000)(h.from);
  const go = async () => { for (const t of cuts) await H.settleTo(db, M, t); return bagOf(H, db, uid); };
  await db.query('savepoint ld_a');
  const A = await go();
  const loot = (await H.one(db, 'select loot from public.hunt_session_tally where session_id = $1', [h.sid])) || {};
  await db.query('rollback to savepoint ld_a');
  const priced = [];
  for (const k of Object.keys(loot).sort()) {
    if (Number(loot[k]) >= 1 && await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1 and unit > 0', [k]) != null
        && !(await H.one(db, "select public.hr_loot_plan_refusal($1, 'sell')", [k]))) priced.push(k);
  }
  if (priced.length < 4) return { control: `the hunt picked up ${priced.length} priced kinds outside the start kit (need 4): ${JSON.stringify(loot)}` };
  const [depIt, sellIt, keepIt, lockIt] = priced;
  await db.query('delete from public.hr_rate_counters');
  const say = async (sql, params) => { const r = await asAuth(db, uid, sql, params); if (!r || r.ok !== true) throw new Error(sql.slice(14, 40) + ' refused ' + JSON.stringify(r)); };
  await say("select public.hr_loot_rule_set(0, $1, 'deposit', $2::uuid)", [depIt, idem()]);
  await say("select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [sellIt, idem()]);
  await say("select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [lockIt, idem()]);
  await say('select public.hr_item_lock(0, $1, true, $2::uuid)', [lockIt, idem()]);
  const B = await go();
  return { uid, h, A, B, depIt, sellIt, keepIt, lockIt, last: cuts.at(-1) };
}

/* The real leave: pending, then the next settle ends it `left` (its leave_at put a minute back: one transaction, one now()). */
async function leave(db, { H, M }, run) {
  const r = await asAuth(db, run.uid, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
  if (!r || r.ok !== true) throw new Error('leave refused ' + JSON.stringify(r));
  await db.query("update public.hunt_sessions set leave_at = leave_at - interval '60 seconds' where id = $1 and leave_at is not null", [run.h.sid]);
  const nowMs = Number(await H.one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  for (const at of [...H.ticksOf(30000, 4 * 60000)(run.last).filter((x) => x < nowMs), nowMs]) {
    const s = await H.settleTo(db, M, at, { raw: true });
    if (s.skipped === 'no_hunt') break;
  }
  return H.one(db, 'select end_reason from public.hunt_sessions where id = $1', [run.h.sid]);
}

const dispatch = (db, uid, key) => asAuth(db, uid, 'select public.hr_loot_dispatch(0, $1::uuid)', [key]);

const ARMS = {
  'LD-PLAY': async (db, ctx) => {
    const { H } = ctx;
    const p = [];
    const run = await huntWithPlans(db, ctx);
    if (run.control) return ['CONTROL: ' + run.control];
    const { uid, A, B, depIt, sellIt, keepIt, lockIt } = run;
    /* NOTHING SELLS AT PICKUP: every planned stack is in the bag exactly as the no-plan run left it. */
    for (const k of [depIt, sellIt, keepIt, lockIt]) if (n(B, k) !== n(A, k)) p.push(`${k}: the pickup left ${n(B, k)} in the bag with its plan, ${n(A, k)} with none`);
    if (await H.one(db, "select count(*)::int from public.player_ledger where user_id = $1 and (intent = 'loot_sell' or intent like 'vendor\\_sell%')", [uid])) p.push('a pickup sold something');
    /* MID-HUNT: refused `hunting`, nothing moved. */
    await db.query('delete from public.hr_rate_counters');
    const mid = await dispatch(db, uid, idem());
    if (!mid || mid.error !== 'hunting') p.push('Dispatch on a hunting hero answered ' + JSON.stringify(mid));
    if (JSON.stringify(await bagOf(H, db, uid)) !== JSON.stringify(B)) p.push('Dispatch on a hunting hero moved the bag');
    const ended = await leave(db, ctx, run);
    if (ended !== 'left') return [...p, 'CONTROL: the leave did not end the hunt (' + ended + ')'];
    /* IN TOWN: the press. */
    const bag0 = await bagOf(H, db, uid), bank0 = await bankOf(H, db, uid), gold0 = await purse(db, uid), v0 = await version(H, db, uid);
    const lid = Number(await H.one(db, 'select coalesce(max(id), 0) from public.player_ledger'));
    const unit = Number(await H.one(db, 'select unit from public.hr_hunt_vendor_value where item_id = $1', [sellIt]));
    if (unit !== ctx.bid(sellIt)) p.push(`${sellIt}: the SQL bid ${unit} is not the edge's vendorPriceOf ${ctx.bid(sellIt)} (vendor_sell's price)`);
    const a = await dispatch(db, uid, idem());
    if (!a || a.ok !== true) return [...p, 'Dispatch in town answered ' + JSON.stringify(a)];
    const bag1 = await bagOf(H, db, uid), bank1 = await bankOf(H, db, uid), gold1 = await purse(db, uid);
    if (n(bag1, depIt) !== 0 || n(bank1, depIt) !== n(bank0, depIt) + n(bag0, depIt)) p.push(`${depIt}: bag ${n(bag0, depIt)} -> ${n(bag1, depIt)}, Storage ${n(bank0, depIt)} -> ${n(bank1, depIt)} (not moved whole)`);
    if (n(bag1, sellIt) !== 0 || n(bank1, sellIt) !== n(bank0, sellIt)) p.push(`${sellIt}: not sold whole (bag ${n(bag1, sellIt)})`);
    if (gold1 - gold0 !== n(bag0, sellIt) * unit) p.push(`the purse moved ${gold1 - gold0}, want ${n(bag0, sellIt)} x ${unit}`);
    for (const k of [keepIt, lockIt]) if (n(bag1, k) !== n(bag0, k)) p.push(`${k}: a ${k === lockIt ? 'LOCKED' : 'keep'} stack moved ${n(bag0, k)} -> ${n(bag1, k)}`);
    if (n(a.stored && a.stored.items, depIt) !== n(bag0, depIt) || n(a.sold, 'gold') !== gold1 - gold0 || n(a.sold, 'stacks') !== 1 || n(a.kept, 'locked') !== 1) {
      p.push('the answer is not the server\'s numbers: ' + JSON.stringify(a));
    }
    const rows = await H.q(db, 'select kind, intent, qty, gold, gold_in, gold_kind, meta from public.player_ledger where user_id = $1 and id > $2 and (kind in (\'bank\', \'shop\') or coalesce(gold, 0) <> 0) order by id', [uid, lid]);
    const dep = rows.filter((r) => r.kind === 'bank'), sale = rows.filter((r) => r.kind === 'shop');
    if (rows.length !== 2 || dep.length !== 1 || Number(dep[0].qty) !== -n(bag0, depIt) || dep[0].intent !== 'loot_dispatch:deposit'
        || sale.length !== 1 || !/^vendor_sell_many:1:/.test(sale[0].intent) || Number(sale[0].gold) !== gold1 - gold0
        || Number(sale[0].gold_in) !== Number(sale[0].gold) || sale[0].gold_kind !== 'vendor_sale') {
      p.push('the journal is not one bank row and one vendor_sell_many row: ' + JSON.stringify(rows).slice(0, 400));
    }
    if (await version(H, db, uid) !== v0 + 1 || Number(a.version) !== v0 + 1) p.push(`the version moved ${(await version(H, db, uid)) - v0} steps`);
    return p;
  },

  'LD-REPLAY': async (db, ctx) => {
    const { H } = ctx;
    const p = [];
    const run = await huntWithPlans(db, ctx);
    if (run.control) return ['CONTROL: ' + run.control];
    if (await leave(db, ctx, run) !== 'left') return ['CONTROL: the leave did not end the hunt'];
    const { uid, keepIt } = run;
    await db.query('delete from public.hr_rate_counters');
    const key = idem();
    const a = await dispatch(db, uid, key);
    if (!a || a.ok !== true) return ['CONTROL: the first press answered ' + JSON.stringify(a)];
    const bag = await bagOf(H, db, uid), bank = await bankOf(H, db, uid), gold = await purse(db, uid);
    const lid = Number(await H.one(db, 'select coalesce(max(id), 0) from public.player_ledger'));
    const b = await dispatch(db, uid, key);
    if (JSON.stringify(b) !== JSON.stringify(a)) p.push('a replay answered ' + JSON.stringify(b).slice(0, 200) + ', not the first press\'s words');
    if (JSON.stringify(await bagOf(H, db, uid)) !== JSON.stringify(bag) || JSON.stringify(await bankOf(H, db, uid)) !== JSON.stringify(bank)
        || await purse(db, uid) !== gold || Number(await H.one(db, 'select count(*)::int from public.player_ledger where user_id = $1 and id > $2', [uid, lid]))) {
      p.push('a replay moved something');
    }
    /* A refusal never consumes its key. */
    const k2 = idem();
    const c = await dispatch(db, uid, k2);
    if (!c || c.error !== 'nothing_to_dispatch') p.push('an empty plan answered ' + JSON.stringify(c));
    await asAuth(db, uid, "select public.hr_loot_rule_set(0, $1, 'deposit', $2::uuid)", [keepIt, idem()]);
    const d = await dispatch(db, uid, k2);
    if (!d || d.ok !== true || n(d.stored && d.stored.items, keepIt) !== n(bag, keepIt)) p.push('the refused key did not stay free: ' + JSON.stringify(d));
    return p;
  },

  'LD-FULL': async (db, ctx) => {
    const { H } = ctx;
    const p = [];
    const run = await huntWithPlans(db, ctx);
    if (run.control) return ['CONTROL: ' + run.control];
    if (await leave(db, ctx, run) !== 'left') return ['CONTROL: the leave did not end the hunt'];
    const { uid, depIt, sellIt, keepIt, lockIt } = run;
    await db.query('delete from public.hr_rate_counters');
    /* The deposit stack's kind is put in Storage first (one unit), so it is an OLD kind; keep and sell become NEW
       deposit kinds; Storage gets room for exactly one more kind. */
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, $2, 1) on conflict (user_id, item_id) do update set qty = 1", [uid, depIt]);
    for (const k of [sellIt, keepIt]) await asAuth(db, uid, "select public.hr_loot_rule_set(0, $1, 'deposit', $2::uuid)", [k, idem()]);
    await db.query('update public.hr_depot_config set base_stacks = public.hr_storage_room_used($1) + 1 where only_row', [uid]);
    const [first, second] = [sellIt, keepIt].sort();
    const bag0 = await bagOf(H, db, uid);
    const a = await dispatch(db, uid, idem());
    const bag1 = await bagOf(H, db, uid), bank1 = await bankOf(H, db, uid);
    if (!a || a.ok !== true) return ['a press with room for one new kind answered ' + JSON.stringify(a)];
    if (n(bag1, depIt) !== 0 || n(bank1, depIt) !== 1 + n(bag0, depIt)) p.push(`${depIt}: a kind already in Storage did not fit (bag ${n(bag1, depIt)})`);
    if (n(bag1, first) !== 0 || n(bank1, first) !== n(bag0, first)) p.push(`${first}: the first new kind (item order) did not take the room`);
    if (n(bag1, second) !== n(bag0, second) || n(bank1, second) !== 0) p.push(`${second}: a new kind past the cap moved`);
    if (n(a.unplaced && a.unplaced.items, second) !== n(bag0, second) || a.unplaced.why !== 'storage_full') p.push('the answer does not report what did not fit: ' + JSON.stringify(a.unplaced));
    if (n(bag1, lockIt) !== n(bag0, lockIt)) p.push('a locked stack moved');
    const v0 = await version(H, db, uid);
    const b = await dispatch(db, uid, idem());
    if (!b || b.error !== 'storage_full' || await version(H, db, uid) !== v0) p.push('a press that could move nothing answered ' + JSON.stringify(b));
    return p;
  },

  'LD-SETTER': async (db, ctx) => {
    const { H } = ctx;
    const p = [];
    const uid = H.UIDS[1];
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'loot-dispatch') on conflict (user_id) do nothing", [uid]);
    await asAuth(db, uid, 'select public.hr_create_character(0)');
    await db.query('delete from public.hr_rate_counters');
    const priced = await H.one(db, "select v.item_id from public.hr_hunt_vendor_value v where v.unit > 0 and public.hr_loot_plan_refusal(v.item_id, 'sell') is null order by 1 limit 1");
    const unpriced = await H.one(db, "select i.item_id from public.hr_items i where not exists (select 1 from public.hr_hunt_vendor_value v where v.item_id = i.item_id) and not exists (select 1 from public.hr_start_inventory s where s.item_id = i.item_id) and not exists (select 1 from public.hr_start_equipment s where s.item_id = i.item_id) order by 1 limit 1");
    for (const rule of ['deposit', 'sell', 'ignore', 'keep']) {
      const r = await asAuth(db, uid, 'select public.hr_loot_rule_set(0, $1, $2, $3::uuid)', [priced, rule, idem()]);
      const held = r && r.bag_rules && r.bag_rules.loot ? r.bag_rules.loot[priced] : undefined;
      if (!r || r.ok !== true || (rule === 'keep' ? held !== undefined : held !== rule)) p.push(`the ${rule} plan answered ${JSON.stringify(r)}`);
    }
    /* the starting kit is never SOLD by a plan (no minting from the kit); its deposit is LD-KIT's */
    const ks = await asAuth(db, uid, "select public.hr_loot_rule_set(0, 'cooked_shrimp', 'sell', $1::uuid)", [idem()]);
    if (!ks || ks.error !== 'start_kit') p.push('a start-kit sell plan answered ' + JSON.stringify(ks));
    const s = await asAuth(db, uid, "select public.hr_loot_rule_set(0, $1, 'sell', $2::uuid)", [unpriced, idem()]);
    if (!s || s.error !== 'item_not_sellable') p.push('an unpriced sell plan answered ' + JSON.stringify(s));
    const anon = await H.one(db, "select has_function_privilege('anon', 'public.hr_loot_dispatch(integer,uuid)', 'execute')");
    if (anon) p.push('anon can execute hr_loot_dispatch');
    return p;
  },

  'LD-KIT': async (db, ctx) => {
    const { H } = ctx;
    const p = [];
    const uid = H.UIDS[1];
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'loot-dispatch') on conflict (user_id) do nothing", [uid]);
    await asAuth(db, uid, 'select public.hr_create_character(0)');
    await db.query('delete from public.hr_rate_counters');
    /* a fresh hero in town with its kit in the bag: Cooked Shrimp planned Deposit in storage */
    const bag0 = await bagOf(H, db, uid), gold0 = await purse(db, uid);
    if (!n(bag0, 'cooked_shrimp')) return ['CONTROL: the new hero holds no Cooked Shrimp: ' + JSON.stringify(bag0)];
    const r = await asAuth(db, uid, "select public.hr_loot_rule_set(0, 'cooked_shrimp', 'deposit', $1::uuid)", [idem()]);
    if (!r || r.ok !== true || r.bag_rules.loot.cooked_shrimp !== 'deposit') return ['a start-kit deposit plan answered ' + JSON.stringify(r)];
    const a = await dispatch(db, uid, idem());
    const bag1 = await bagOf(H, db, uid), bank1 = await bankOf(H, db, uid);
    if (!a || a.ok !== true || n(a.stored && a.stored.items, 'cooked_shrimp') !== n(bag0, 'cooked_shrimp')) p.push('Dispatch of a start-kit deposit answered ' + JSON.stringify(a));
    if (n(bag1, 'cooked_shrimp') !== 0 || n(bank1, 'cooked_shrimp') !== n(bag0, 'cooked_shrimp')) p.push(`cooked_shrimp: bag ${n(bag1, 'cooked_shrimp')}, Storage ${n(bank1, 'cooked_shrimp')} (want all ${n(bag0, 'cooked_shrimp')} stored)`);
    if (await purse(db, uid) !== gold0) p.push('a start-kit deposit moved gold');
    return p;
  },

  'LD-IDEM': async (db) => {
    const bodies = async () => JSON.stringify((await db.query(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, coalesce(p.proacl::text, '') as acl
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows);
    const rows = async () => JSON.stringify((await db.query('select proname, identity_args, grantee, note from public.hr_client_rpc_baseline order by 1, 2, 3')).rows);
    const before = JSON.stringify([await inventory(db), await bodies(), await rows()]);
    try { await db.exec(readFileSync(MIG, 'utf8').replace(/\r\n/g, '\n')); }
    catch (e) { return ['the second apply RAISED: ' + String(e.message).split('\n')[0]]; }
    const after = JSON.stringify([await inventory(db), await bodies(), await rows()]);
    return before === after ? [] : ['a second apply moved the schema, a body or a baseline row'];
  },
};

/* Each mutant, planted in this file's body (the chain's last author of each), its self-check turned off. */
const MUTANTS = [
  { arm: 'LD-FULL', why: 'a deposit ignores the Storage room',
    find: '      if not public.hr_storage_room_fits(v_uid, v_row.item_id) then', repl: '      if false and not public.hr_storage_room_fits(v_uid, v_row.item_id) then' },
  { arm: 'LD-PLAY', why: 'the sale pays twice the catalogue bid',
    find: '      v_gold   := v_gold + v_q * v_row.unit;', repl: '      v_gold   := v_gold + 2 * v_q * v_row.unit;' },
  { arm: 'LD-PLAY', why: 'a hunting hero is dispatched',
    find: '  if v_s.id is not null then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object(\'ok\', false, \'error\', \'hunting\'',
    repl: '  if false then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object(\'ok\', false, \'error\', \'hunting\'' },
  { arm: 'LD-PLAY', why: 'a locked stack is dispatched',
    find: '    if v_row.locked then v_locked := v_locked + 1; continue; end if;', repl: '    if false then v_locked := v_locked + 1; continue; end if;' },
  { arm: 'LD-PLAY', why: 'a sell plan sells at pickup again',
    find: "       and r.loot_rule = 'ignore' and not r.locked", repl: "       and r.loot_rule in ('ignore', 'sell') and not r.locked" },
  /* Both key checks out (one backend cannot race two presses, so either check alone still answers the replay here). */
  { arm: 'LD-REPLAY', why: 'a decided key runs again',
    pairs: [['  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);\n  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n  -- SETTLE', '  v_r := null;\n  -- SETTLE'],
      ['  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);\n  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n  -- A hero', '  v_r := null;\n  -- A hero']] },
  { arm: 'LD-SETTER', why: 'the setter takes a start-kit sell plan',
    find: "    when p_plan = 'sell' and (exists (select 1 from public.hr_start_inventory k where k.item_id = p_item)", repl: "    when false and (exists (select 1 from public.hr_start_inventory k where k.item_id = p_item)" },
  { arm: 'LD-KIT', why: 'a start-kit deposit is refused again',
    find: "    when p_plan = 'sell' and (exists (select 1 from public.hr_start_inventory k where k.item_id = p_item)", repl: "    when p_plan in ('sell', 'deposit') and (exists (select 1 from public.hr_start_inventory k where k.item_id = p_item)" },
];

function selfCheckOff() {
  const src = readFileSync(MIG, 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/\n(-- (?:── )?§\d+ SELF-CHECK[^\n]*(?:\n--[^\n]*)*)\n(do \$(\w*)\$)/);
  if (!m) throw new Error('no self-check heading in ' + FILE);
  return [m[1] + '\n' + m[2], m[1] + '\ncreate or replace function pg_temp.ld_selfcheck_off() returns void language plpgsql as $' + m[3] + '$'];
}

async function runArms(db, ctx, only) {
  const out = [];
  for (const [name, fn] of Object.entries(ARMS)) {
    if (only && !only.includes(name)) continue;
    await db.query('begin');
    let problems;
    try { problems = await fn(db, ctx); } catch (e) { problems = ['HARNESS: ' + String(e.message).slice(0, 400)]; }
    finally { await db.query('rollback'); }
    out.push({ name, problems });
  }
  return out;
}

async function main() {
  const ctx = await harness();
  if (!MUTATE) {
    let db;
    try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(1); }
    await ctx.H.pinDice(db);
    const res = await runArms(db, ctx);
    let bad = 0;
    for (const r of res) {
      if (r.problems.length) { bad++; for (const x of r.problems) console.error(`✗ ${r.name}: ${x}`); }
      else console.log(`✓ ${r.name}`);
    }
    console.log(bad ? `loot-dispatch: ${bad} of ${res.length} arms red` : `loot-dispatch: green — ${res.length} arms`);
    process.exit(bad ? 1 : 0);
  }
  let missed = 0;
  for (const mu of MUTANTS) {
    let db;
    try { ({ db } = await bootReplay({ patches: new Map([[FILE, [selfCheckOff(), ...(mu.pairs || [[mu.find, mu.repl]])]]]),
      /* The arms play a real hunt on today's engine: a chain cut here holds an older world shape (2027-02-11-no-fight's
         catalogue moved it), so every settle answers world_shape_pending and the hunt picks up nothing. */
      fullChain: 'the arms play a hunt on the engine of today, which needs the catalogue and world shape of the files after this one' })); }
    catch (e) { console.error(`✗ HARNESS ${mu.arm} (${mu.why}): the patched chain would not boot: ${String(e.message).split('\n').slice(0, 2).join(' ')}`); missed++; continue; }
    await ctx.H.pinDice(db);
    const [r] = await runArms(db, ctx, [mu.arm]);
    const real = r.problems.filter((x) => !x.startsWith('HARNESS') && !x.startsWith('CONTROL'));
    if (real.length) console.log(`✓ ${mu.arm} catches: ${mu.why} — ${real[0].slice(0, 140)}`);
    else { console.error(`✗ ${mu.arm} MISSED: ${mu.why}${r.problems.length ? ' (' + r.problems[0].slice(0, 200) + ')' : ''}`); missed++; }
    await db.close().catch(() => {});
  }
  console.log(missed ? `loot-dispatch --mutate: ${missed} of ${MUTANTS.length} MISSED` : `loot-dispatch --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
