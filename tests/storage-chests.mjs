#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/storage-chests.mjs — THE DEPOT'S SPACE IS THE ACCOUNT'S, BOUGHT WITH CHESTS
// (Tyler 2026-10-22).
//
//   node tests/storage-chests.mjs             the guard
//   node tests/storage-chests.mjs --list      the mutation catalogue
//   node tests/storage-chests.mjs --selftest  every mutation must be CAUGHT
//   node tests/storage-chests.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-11-28-storage-chests.sql and its generated
// catalogue (tools/gen-storage-chests.mjs from src/data/homestead-tiers.js).
//
// Real RPCs on a fully replayed PGlite chain (production untouched):
//   S1  THE DATA IS THE SERVER'S. hr_depot_config.base_stacks and every
//       hr_storage_chests row equal src/data/homestead-tiers.js.
//   S2  THE CAP. A new account's `depot` section reads the base on BOTH slots; a
//       depot at the base refuses a NEW stack bank_full {cap: base} and still
//       takes more of a stack it holds.
//   S3  THE BUILD. Chest 1 bought on slot 1 debits exactly its gold and
//       materials once, one ledger row (shop, storage_chest:<id>), and raises
//       the cap on slot 0 too; the refused stack now lands.
//   S4  THE REFUSALS move nothing: a wrong price (quote_changed), an empty purse
//       (insufficient_gold), a skipped chest (needs_previous_chest), the same
//       chest from the other hero (already_built), a replayed key (no charge),
//       a home too small (needs_property_tier) — and the home tier is the
//       ACCOUNT's: a property held by slot 1 lets slot 0 build.
//   S5  THE LOCK ORDER of the build: hero lock -> its row -> the depot key ->
//       the chest read (what PGlite, one backend, cannot race).
//   S6  THE ACL: no client writes account_storage_chests; the readers are
//       server-only; the verb is authenticated-only.
// TRUE CONCURRENCY is unverified locally (PGlite is one backend); S5 pins the
// order that makes it correct.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { DEPOT_BASE_STACKS, STORAGE_CHESTS } from '../src/data/homestead-tiers.js';

const MIG = '2026-11-28-storage-chests.sql';

const GATE_BLIND = [
  ['declare v_md5 text;\nbegin\n  if to_regclass(\'public.account_bank\') is null then',
   'declare v_md5 text;\nbegin\n  if true then return; end if;   -- selftest: §0 short-circuited\n  if to_regclass(\'public.account_bank\') is null then'],
  ['  v_base int; v_item text; v_gold bigint;\nbegin\n',
   '  v_base int; v_item text; v_gold bigint;\nbegin\n  if true then return; end if;   -- selftest: §6 short-circuited\n'],
];
const BODY = {
  cap_ignores_chests: {
    why: 'hr_bank_move refuses at the base and never counts a built chest: the player pays and gets no space',
    find: '      v_cap := least(public.hr_depot_cap(v_uid), c_max_bank_stacks);',
    repl: '      v_cap := least((select base_stacks from public.hr_depot_config where only_row), c_max_bank_stacks);',
  },
  tier_per_character: {
    why: 'the home tier is read for one character only: a home bought on one hero does not open chests for the others (one home per account)',
    find: "   where pp.user_id = p_user and pp.period_key = '' and u.namespace = 'property'",
    repl: "   where pp.user_id = p_user and pp.slot = 0 and pp.period_key = '' and u.namespace = 'property'",
  },
  price_unchecked: {
    why: 'the client price is not compared with the catalogue: a stale or forged quote builds anyway',
    find: '  if p_price <> v_c.gold then',
    repl: '  if false then',
  },
  order_skipped: {
    why: 'a chest no longer needs the one before it: the ladder can be skipped',
    find: '   where c.ord < v_c.ord',
    repl: '   where c.ord < v_c.ord and false',
  },
  built_twice: {
    why: 'already_built is never checked: a second hero pays again for a chest the account has',
    find: '  if exists (select 1 from public.account_storage_chests where user_id = v_uid and chest_id = p_chest) then',
    repl: '  if false then',
  },
  build_unlocked: {
    why: 'the build stops taking the account depot lock: two heroes building at once both pay',
    find: "  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));\n  if exists (select 1 from public.account_storage_chests",
    repl: "  if exists (select 1 from public.account_storage_chests",
  },
  tier_ignored: {
    why: 'the property tier gate is gone: every chest is buildable from a camp',
    find: '  if v_tier < v_c.req_property_tier then',
    repl: '  if false then',
  },
  client_write_grant: {
    why: 'authenticated may INSERT into account_storage_chests: a client gives itself chests',
    find: 'grant select on public.account_storage_chests to authenticated;',
    repl: 'grant select, insert on public.account_storage_chests to authenticated;',
  },
};
const MUTATIONS = {};
for (const [id, m] of Object.entries(BODY)) MUTATIONS[id] = { ...m, also: GATE_BLIND };

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const patchList = (mutate) => {
  if (!mutate) return [];
  const m = MUTATIONS[mutate];
  if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  return [[m.find, m.repl], ...(m.also || [])];
};

async function run(mutate) {
  problems.length = 0;
  const { db } = await bootReplay({ patches: mutate ? new Map([[MIG, patchList(mutate)]]) : undefined, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const gate = () => q('delete from public.hr_rate_counters');
  const one = async (sql, p) => (await q(sql, p))[0];
  const call = async (uid, sql, p) => { await as(uid); await gate(); return (await one(sql, p)).v; };

  // S1 THE DATA IS THE SERVER'S.
  const base = Number((await one('select base_stacks b from public.hr_depot_config')).b);
  ok(base === DEPOT_BASE_STACKS, `S1: server base ${base}, data ${DEPOT_BASE_STACKS}`);
  const rows = await q('select chest_id, name, stacks, req_property_tier t, gold::text g, items from public.hr_storage_chests order by ord');
  const want = STORAGE_CHESTS.map((c) => ({ chest_id: c.id, name: c.name, stacks: c.stacks, t: c.tier, g: String(c.cost.gold),
    items: Object.fromEntries(Object.entries(c.cost).filter(([k]) => k !== 'gold')) }));
  ok(JSON.stringify(rows.map((r) => ({ ...r, items: Object.fromEntries(Object.entries(r.items).sort()) })))
     === JSON.stringify(want.map((r) => ({ ...r, items: Object.fromEntries(Object.entries(r.items).sort()) }))),
     `S1: hr_storage_chests ${JSON.stringify(rows)} != data ${JSON.stringify(want)}`);
  const [c1, c2] = STORAGE_CHESTS;

  // An account with two heroes.
  const u = (await one('select gen_random_uuid() as i')).i;
  await q('insert into auth.users (id) values ($1)', [u]);
  await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'storage-chests test')", [u]);
  for (const s of [0, 1]) await call(u, 'select public.hr_create_character($1) v', [s]);
  const depot = async (slot) => (await one("select public.hr_state_of($1,$2)->'depot' d", [u, slot])).d;

  // S2 THE CAP.
  const d0 = await depot(0), d1 = await depot(1);
  ok(d1 && d1.cap === base && d1.used === 0 && d1.next && d1.next.chest === c1.id, `S2: a new account's depot reads ${JSON.stringify(d1)}`);
  ok(JSON.stringify(d0) === JSON.stringify(d1), 'S2: the two heroes read different depots');
  await q('insert into public.account_bank (user_id, item_id, qty) select $1, item_id, 1 from public.hr_items order by item_id limit $2', [u, base]);
  const held = (await one('select min(item_id) i from public.account_bank where user_id=$1', [u])).i;
  const fresh = (await one('select min(item_id) i from public.hr_items where item_id not in (select item_id from public.account_bank where user_id=$1) and item_id not in (select item_id from public.player_inventory where user_id=$1)', [u])).i;
  await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,5),($1,0,$3,5) on conflict (user_id, slot, item_id) do update set qty = 5', [u, fresh, held]);
  let v = await call(u, "select public.hr_bank_move(0,$1,1,'deposit',gen_random_uuid()) v", [fresh]);
  ok(v && v.error === 'bank_full' && v.cap === base, `S2: a full depot answered a new stack with ${JSON.stringify(v)}`);
  v = await call(u, "select public.hr_bank_move(0,$1,1,'deposit',gen_random_uuid()) v", [held]);
  ok(v && v.ok === true, `S2: a full depot refused more of a stack it holds: ${JSON.stringify(v)}`);

  // S4 (first half) THE REFUSALS move nothing.
  const goldOf = async (s) => Number((await one('select gold::text g from public.player_state where user_id=$1 and slot=$2', [u, s])).g);
  const setGold = (s, g) => q('update public.player_state set gold=$3 where user_id=$1 and slot=$2', [u, s, g]);
  const giveMats = (s, c) => Promise.all(Object.entries(c.cost).filter(([k]) => k !== 'gold').map(([k, n]) =>
    q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,$2,$3,$4) on conflict (user_id, slot, item_id) do update set qty = excluded.qty', [u, s, k, n])));
  const build = (s, c, price, key) => call(u, `select public.hr_storage_chest_build($1,$2,$3,${key ? "'" + key + "'::uuid" : 'gen_random_uuid()'}) v`, [s, c.id, price]);
  await setGold(1, c1.cost.gold + 7); await giveMats(1, c1);
  v = await build(1, c1, c1.cost.gold + 1);
  ok(v && v.error === 'quote_changed', `S4: a wrong price answered ${JSON.stringify(v)}`);
  v = await build(1, c2, c2.cost.gold);
  ok(v && v.error === 'needs_previous_chest' && v.need === c1.id, `S4: the second chest first answered ${JSON.stringify(v)}`);
  await setGold(0, c1.cost.gold - 1); await giveMats(0, c1);
  v = await build(0, c1, c1.cost.gold);
  ok(v && v.error === 'insufficient_gold' && await goldOf(0) === c1.cost.gold - 1, `S4: a short purse answered ${JSON.stringify(v)}`);
  ok((await one('select count(*)::int n from public.account_storage_chests where user_id=$1', [u])).n === 0, 'S4: a refusal built a chest');

  // S3 THE BUILD.
  const KEY = '000000c0-0000-4000-b000-0000de92aaaa';
  v = await build(1, c1, c1.cost.gold, KEY);
  ok(v && v.ok === true, `S3: building ${c1.id} answered ${JSON.stringify(v)}`);
  ok(await goldOf(1) === 7, `S3: slot 1 holds ${await goldOf(1)} gold, expected 7`);
  for (const [k] of Object.entries(c1.cost).filter(([k2]) => k2 !== 'gold')) {
    ok(!(await one('select count(*)::int n from public.player_inventory where user_id=$1 and slot=1 and item_id=$2', [u, k])).n, `S3: ${k} was not taken`);
  }
  const led = await q("select slot, gold::text g from public.player_ledger where user_id=$1 and kind='shop' and intent=$2", [u, 'storage_chest:' + c1.id]);
  ok(led.length === 1 && led[0].g === String(-c1.cost.gold) && led[0].slot === 1, `S3: the journal holds ${JSON.stringify(led)}`);
  ok((await depot(0)).cap === base + c1.stacks, `S3: slot 0's cap is ${(await depot(0)).cap}, expected ${base + c1.stacks}`);
  v = await call(u, "select public.hr_bank_move(0,$1,1,'deposit',gen_random_uuid()) v", [fresh]);
  ok(v && v.ok === true, `S3: the new stack is still refused after the chest: ${JSON.stringify(v)}`);

  // S4 (second half).
  const g1 = await goldOf(1);
  await setGold(1, g1 + c1.cost.gold); await giveMats(1, c1);
  v = await build(1, c1, c1.cost.gold, KEY);
  ok(await goldOf(1) === g1 + c1.cost.gold, `S4: a replayed key charged again: ${JSON.stringify(v)}`);
  await setGold(0, 10_000_000);
  v = await build(0, c1, c1.cost.gold);
  ok(v && v.error === 'already_built' && await goldOf(0) === 10_000_000, `S4: the other hero building it again answered ${JSON.stringify(v)}`);
  if (c2.tier > 0) {
    await giveMats(0, c2);
    v = await build(0, c2, c2.cost.gold);
    ok(v && v.error === 'needs_property_tier' && v.need === c2.tier, `S4: ${c2.id} without its home tier answered ${JSON.stringify(v)}`);
    const unlock = (await one("select unlock_id from public.hr_unlocks where namespace='property' and max_value = $1", [c2.tier])).unlock_id;
    await q("insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at) values ($1, 1, 'unlock', $2, $3, '', null, now())", [u, unlock, c2.tier]);
    v = await build(0, c2, c2.cost.gold);
    ok(v && v.ok === true, `S4: a home held by slot 1 did not open ${c2.id} for slot 0: ${JSON.stringify(v)}`);
  }

  // S5 THE LOCK ORDER.
  const src = (await one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_storage_chest_build(integer,text,bigint,uuid)')")).prosrc.replace(/--[^\n]*/g, '');
  const iHero = src.indexOf('perform public.hr_hunt_lock(v_uid, p_slot);');
  const iRow = src.search(/from public\.player_state where user_id = v_uid and slot = p_slot for update/);
  const iLock = src.indexOf("pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0))");
  const iRead = src.indexOf('public.account_storage_chests');
  ok(iHero > 0 && iRow > iHero && iLock > iRow && iRead > iLock, `S5: build lock order hero ${iHero} -> row ${iRow} -> depot ${iLock} -> chests ${iRead}`);

  // S6 THE ACL.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    ok(!(await one(`select has_table_privilege('${role}','public.account_storage_chests','insert,update,delete,truncate') w`)).w, `S6: ${role} can write account_storage_chests`);
  }
  for (const f of ['hr_depot_view(uuid,integer)', 'hr_depot_cap(uuid)', 'hr_account_property_tier(uuid)']) {
    ok(!(await one(`select has_function_privilege('authenticated','public.${f}','execute') e`)).e, `S6: authenticated reaches ${f}`);
  }
  ok(!(await one("select has_function_privilege('anon','public.hr_storage_chest_build(integer,text,bigint,uuid)','execute') e")).e, 'S6: anon reaches hr_storage_chest_build');
  await db.close?.();
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) { for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`); process.exit(0); }
  const one = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || one) {
    const ids = one ? [one.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${caught}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `storage-chests --selftest: ${slipped} mutation(s) SLIPPED` : `storage-chests --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('storage-chests: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('storage-chests: the depot\'s space is the account\'s (S1-S6 green): data = catalogue, cap refuses at base, a chest raises it on every hero, priced and ordered and gated by the account\'s home, journalled once, lock order pinned, ACL closed');
  process.exit(0);
} catch (e) {
  console.error(`storage-chests: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
