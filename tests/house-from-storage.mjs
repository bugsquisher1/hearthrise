#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/house-from-storage.mjs — A HOUSE BUILD TAKES THE HERO'S BAG FIRST, THEN THE
// ACCOUNT'S STORAGE (player feedback 2026-10-24, tracker a42).
//
//   node tests/house-from-storage.mjs             the guard
//   node tests/house-from-storage.mjs --list      the mutation catalogue
//   node tests/house-from-storage.mjs --selftest  every mutation must be CAUGHT
//   node tests/house-from-storage.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2027-01-10-house-from-storage.sql.
// Real RPCs on a fully replayed PGlite chain (production untouched): hr_unlock_buy as
// the engine (the edge's unlock_buy), hr_storage_chest_build as the player.
//   F1  THE REGRESSION. A hero with NONE of the first home's materials in its bag and
//       all of them in the account's Storage builds it: Storage loses exactly the cost,
//       the bag stays empty, the purse pays once, the one ledger row says
//       from.storage = the cost. (Before this file: insufficient_item.)
//   F2  BAG FIRST. A room rung with part of its line in the bag: the bag is emptied
//       first, Storage pays only the rest, and the journal says so.
//   F3  THE CHEST. hr_storage_chest_build from an empty bag and Storage: the counts,
//       the chest row, gold_kind storage, from.storage; the other hero reads the
//       same Storage and the raised cap.
//   F4  ALL OR NOTHING. One unit short across bag + Storage: insufficient_item with the
//       server's counts and NOTHING moves; materials covered but the purse short (a
//       room and a chest): insufficient_gold and the materials stay where they were.
//   F5  ONE ACCOUNT. Another account's Storage never pays for this one's house.
//   F6  NOT THE HOUSE. A non-house offer (a plot) with its cost in Storage only is
//       refused and Storage is untouched.
//   F7  THE LOCK ORDER, read from the bodies: hero -> [home] -> depot -> bag -> Storage ->
//       the purse, last; nothing locks after the purse.
//   F8  THE ACL: hr_materials_take is owner-only.
//   F9  A SECOND APPLY IS A NO-OP: the schema, the three bodies and the rows are byte-identical.
// TRUE CONCURRENCY is unverified locally (PGlite is one backend); F7 pins the order.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2027-01-10-house-from-storage.sql';

/* The file's own §5 self-check would refuse most mutants at apply; it is blinded so this guard judges them. */
const GATE_BLIND = [
  ['  i_hero int; i_row int; i_home int; i_depot int; i_take int; i_bag int; i_sto int; i_purse int;\nbegin\n',
   '  i_hero int; i_row int; i_home int; i_depot int; i_take int; i_bag int; i_sto int; i_purse int;\nbegin\n  if true then return; end if;   -- selftest: §5 short-circuited\n'],
];
const BODY = {
  house_bag_only: {
    why: 'the deed and the rooms read the hero\'s bag only (the behaviour before this file): Storage never pays for the house',
    find: "                                       v_cat.namespace in ('room', 'property'));",
    repl: '                                       false);',
  },
  chest_bag_only: {
    why: 'the storage chest reads the hero\'s bag only: Storage never pays for a chest',
    find: '    v_take := public.hr_materials_take(v_uid, p_slot, v_c.items, true);',
    repl: '    v_take := public.hr_materials_take(v_uid, p_slot, v_c.items, false);',
  },
  storage_not_debited: {
    why: 'Storage is counted but never debited: the house is built and the materials are still there (a dupe)',
    find: "    if (l->>'storage')::bigint > 0 then\n      if (l->>'storage')::bigint = (l->>'storage_held')::bigint then",
    repl: "    if false then\n      if (l->>'storage')::bigint = (l->>'storage_held')::bigint then",
  },
  storage_first: {
    why: 'Storage pays before the bag: a shared stack is spent while the hero\'s own bag keeps its copy',
    find: '    v_take := least(v_bag, r.need);',
    repl: '    v_take := greatest(r.need - v_sto, 0);',
  },
  chest_purse_refusal_keeps_items: {
    why: 'a chest refused for gold RETURNS instead of raising: the materials it already took stay taken (not all or nothing)',
    find: "      perform public.hr_reject('insufficient_gold', jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_c.gold)); end if;",
    repl: "      return jsonb_build_object('ok', false, 'error', 'insufficient_gold'); end if;",
  },
  other_accounts_storage: {
    why: 'the Storage read is not keyed by the account: another account\'s stack is counted, so a house is built with nothing taken',
    find: '       where b.user_id = p_user and b.item_id = r.item for update;',
    repl: '       where b.item_id = r.item for update;',
  },
  purse_first_in_chest: {
    why: 'the chest takes the purse BEFORE the materials: the purse is no longer the last lock (the market threat model\'s order)',
    find: '    -- THE MATERIALS: the hero\'s bag first, then the account\'s Storage (hr_materials_take, decided whole).\n',
    repl: '    v_purse := public.hr_purse_of(v_uid); perform public.hr_purse_move(v_uid, 0, 0);\n',
  },
  take_granted: {
    why: 'authenticated may call hr_materials_take directly: a client names any cost map and slot',
    find: 'revoke all on function public.hr_materials_take(uuid, integer, jsonb, boolean) from public, anon, authenticated, service_role, hr_engine;',
    repl: 'revoke all on function public.hr_materials_take(uuid, integer, jsonb, boolean) from public, anon, service_role, hr_engine; grant execute on function public.hr_materials_take(uuid, integer, jsonb, boolean) to authenticated;',
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
const costOf = (items) => Object.fromEntries(Object.entries(items || {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => v > 0));
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

async function run(mutate) {
  problems.length = 0;
  const { db } = await bootReplay({ patches: mutate ? new Map([[MIG, patchList(mutate)]]) : undefined, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const gate = () => q('delete from public.hr_rate_counters');

  // The catalogue rows, chosen by property: the first home, a first room rung it opens, the first chest, a plot.
  const H = await one("select o.* from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id where u.namespace = 'property' and o.refusal is null order by o.value limit 1");
  const R = await one(`select o.* from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id
     where u.namespace = 'room' and o.refusal is null and o.value = 1 and coalesce(o.req_property_tier, 0) <= $1
       and o.req_item is null and o.req_skill is null order by o.offer_id limit 1`, [H.value]);
  const C1 = await one('select * from public.hr_storage_chests order by ord limit 1');
  const P = await one(`select o.* from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id
     where u.namespace not in ('room', 'property') and o.refusal is null and o.items is not null and o.items <> '{}'::jsonb
       and coalesce(o.req_property_tier, 0) <= $1 and o.req_item is null and o.req_skill is null
       and (u.merge <> 'max' or o.value = (select min(x) from unnest(coalesce(u.rungs, array[]::int[])) x))
     order by o.offer_id limit 1`, [H.value]);
  if (!H || !R || !C1 || !P) { const e = new Error('the catalogue has no home, room rung, chest or plot to probe'); e.harness = true; throw e; }
  const hCost = costOf(H.items), rCost = costOf(R.items), cCost = costOf(C1.items), pCost = costOf(P.items);

  // Two accounts: A (two heroes) builds; B only holds Storage.
  const newAccount = async (note, slots) => {
    const u = (await one('select gen_random_uuid() as i')).i;
    await q('insert into auth.users (id) values ($1)', [u]);
    await q('insert into public.hr_access_allowlist (user_id, note) values ($1, $2)', [u, note]);
    await as(u);
    for (const s of slots) { await gate(); await q('select public.hr_create_character($1)', [s]); }
    await q('delete from public.account_bank where user_id = $1', [u]);
    return u;
  };
  const A = await newAccount('house-from-storage A', [0, 1]);
  const B = await newAccount('house-from-storage B', [0]);
  const purse = async (u) => Number((await one('select coalesce((select gold from public.account_wallet where user_id = $1), 0)::text g', [u])).g);
  const setPurse = (u, g) => q(`insert into public.account_wallet as w (user_id, gold) values ($1, $2)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now()`, [u, g]);
  const bag = async (u, s, item) => Number((await one('select coalesce((select qty from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3), 0)::text n', [u, s, item])).n);
  const sto = async (u, item) => Number((await one('select coalesce((select qty from public.account_bank where user_id=$1 and item_id=$2), 0)::text n', [u, item])).n);
  const setBag = async (u, s, item, n) => {
    await q('delete from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3', [u, s, item]);
    if (n > 0) await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,$2,$3,$4)', [u, s, item, n]);
  };
  const setSto = async (u, item, n) => {
    await q('delete from public.account_bank where user_id=$1 and item_id=$2', [u, item]);
    if (n > 0) await q('insert into public.account_bank (user_id, item_id, qty) values ($1,$2,$3)', [u, item, n]);
  };
  const clearLines = async (u, cost) => { for (const k of Object.keys(cost)) { await q('delete from public.player_inventory where user_id=$1 and item_id=$2', [u, k]); await setSto(u, k, 0); } };
  const held = async (u) => Object.fromEntries((await q(`select item_id, sum(qty)::int n from (
      select item_id, qty from public.player_inventory where user_id=$1 union all select item_id, qty from public.account_bank where user_id=$1) s group by item_id`, [u])).map((r) => [r.item_id, r.n]));
  const burned = (before, after) => Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])]
    .map((k) => [k, (before[k] || 0) - (after[k] || 0)]).filter(([, d]) => d !== 0));
  const version = async (u, s) => Number((await one('select version::text v from public.player_state where user_id=$1 and slot=$2', [u, s])).v);
  const buy = async (u, s, offer, key) => {
    await as(u); await gate();
    const ver = await version(u, s);
    await db.exec('set role hr_engine');
    try { return (await one(`select public.hr_unlock_buy($1,$2,$3,${key ? "'" + key + "'::uuid" : 'gen_random_uuid()'},$4) v`, [u, s, ver, offer])).v; }
    finally { await db.exec('reset role'); }
  };
  const chest = async (u, s, c, price, key) => {
    await as(u); await gate();
    return (await one(`select public.hr_storage_chest_build($1,$2,$3,${key ? "'" + key + "'::uuid" : 'gen_random_uuid()'}) v`, [s, c.chest_id, price])).v;
  };
  const ledger = (u, intent) => q('select slot, gold::text g, purse::text p, gold_kind, meta from public.player_ledger where user_id=$1 and intent=$2', [u, intent]);
  const fromSum = (f) => { const o = {}; for (const side of ['bag', 'storage']) for (const [k, v] of Object.entries((f && f[side]) || {})) o[k] = (o[k] || 0) + Number(v); return o; };

  // F5 first (the account is empty): B's Storage holds the whole home; A has nothing anywhere.
  await clearLines(A, hCost);
  for (const [k, n] of Object.entries(hCost)) await setSto(B, k, n);
  await setPurse(A, Number(H.gold) + 1000);
  let v = await buy(A, 0, H.offer_id);
  ok(v && v.error === 'insufficient_item', `F5: account A built ${H.offer_id} on account B's Storage: ${JSON.stringify(v).slice(0, 200)}`);
  for (const [k, n] of Object.entries(hCost)) ok(await sto(B, k) === n, `F5: account B's Storage ${k} moved to ${await sto(B, k)}`);
  ok(await purse(A) === Number(H.gold) + 1000, 'F5: a refused build moved the purse');

  // F1 THE REGRESSION: nothing in the bag, everything in Storage.
  for (const [k, n] of Object.entries(hCost)) await setSto(A, k, n + 4);
  await setPurse(A, Number(H.gold) + 25);
  const verA0 = await version(A, 0);
  v = await buy(A, 0, H.offer_id, '000000c0-0000-4000-b000-00000110f001');
  ok(v && v.ok === true, `F1: a hero with an empty bag and the home in Storage answered ${JSON.stringify(v).slice(0, 240)}`);
  for (const [k, n] of Object.entries(hCost)) {
    ok(await sto(A, k) === 4, `F1: Storage ${k} is ${await sto(A, k)}, expected 4 (took ${n})`);
    ok(await bag(A, 0, k) === 0, `F1: the bag gained ${k}`);
  }
  ok(await purse(A) === 25, `F1: the purse is ${await purse(A)}, expected 25`);
  ok(await version(A, 0) === verA0 + 1, 'F1: the hero\'s version did not move once');
  let led = await ledger(A, `unlock_buy:${H.offer_id}:${H.value}`);
  ok(led.length === 1 && led[0].g === String(-H.gold) && led[0].p === '25' && led[0].gold_kind === 'house'
     && same(costOf(led[0].meta.from && led[0].meta.from.storage), hCost) && Object.keys((led[0].meta.from && led[0].meta.from.bag) || {}).length === 0,
     `F1: the journal holds ${JSON.stringify(led)}`);
  ok(v && v.charged && same(fromSum(v.charged.from), hCost), `F1: charged.from is ${JSON.stringify(v && v.charged && v.charged.from)}`);
  const bank1 = (await one("select public.hr_state_of($1,1)->'bank' b", [A])).b;
  ok(bank1 && Object.keys(hCost).every((k) => bank1[k] === 4), `F1: the other hero reads Storage as ${JSON.stringify(bank1)}`);

  // F2 BAG FIRST: the room's first line is part in slot 1's bag, the rest in Storage (plus spare).
  await clearLines(A, rCost);
  const [rk, rn] = Object.entries(rCost)[0];
  const inBag = Math.max(1, Math.floor(rn / 3));
  for (const [k, n] of Object.entries(rCost)) { if (k === rk) { await setBag(A, 1, k, inBag); await setSto(A, k, n - inBag + 6); } else await setSto(A, k, n); }
  await setPurse(A, Number(R.gold) + 9);
  let before = await held(A);
  v = await buy(A, 1, R.offer_id);
  ok(v && v.ok === true, `F2: the room from bag + Storage answered ${JSON.stringify(v).slice(0, 240)}`);
  ok(same(burned(before, await held(A)), rCost), `F2: the room took ${JSON.stringify(burned(before, await held(A)))}, cost ${JSON.stringify(rCost)}`);
  ok(await bag(A, 1, rk) === 0 && await sto(A, rk) === 6, `F2: not bag first: bag ${await bag(A, 1, rk)}, Storage ${await sto(A, rk)} (expected 0 and 6)`);
  led = await ledger(A, `unlock_buy:${R.offer_id}:${R.value}`);
  ok(led.length === 1 && Number(led[0].meta.from.bag[rk]) === inBag && Number(led[0].meta.from.storage[rk] || 0) === rn - inBag && led[0].slot === 1,
     `F2: the journal says ${JSON.stringify(led.map((r) => r.meta.from))}`);

  // F4 (room) THE PURSE SHORT: every line covered, the purse one short: the materials stay put.
  // Rung 2 of the same room, now that rung 1 is built.
  const R2 = await one('select * from public.hr_unlock_offers where unlock_id = $1 and value = 2 and refusal is null', [R.unlock_id]);
  if (R2 && Number(R2.req_property_tier || 0) <= Number(H.value)) {
    const r2Cost = costOf(R2.items);
    await clearLines(A, r2Cost);
    for (const [k, n] of Object.entries(r2Cost)) await setSto(A, k, n);
    await setPurse(A, Number(R2.gold) - 1);
    before = await held(A);
    v = await buy(A, 0, R2.offer_id);
    ok(v && v.error === 'insufficient_gold', `F4: a room with its materials and a short purse answered ${JSON.stringify(v).slice(0, 200)}`);
    ok(Object.keys(burned(before, await held(A))).length === 0, `F4: a room refused for gold moved ${JSON.stringify(burned(before, await held(A)))}`);
    // …and one unit short across bag + Storage: the server's counts, nothing moves.
    const [k2, n2] = Object.entries(r2Cost).sort(([a], [b]) => (a < b ? -1 : 1)).pop();
    await setBag(A, 0, k2, Math.floor((n2 - 1) / 2)); await setSto(A, k2, n2 - 1 - Math.floor((n2 - 1) / 2));
    await setPurse(A, Number(R2.gold) + 50);
    before = await held(A);
    const ver = await version(A, 0);
    v = await buy(A, 0, R2.offer_id);
    ok(v && v.error === 'insufficient_item' && v.item_id === k2 && Number(v.have) === n2 - 1 && Number(v.need) === n2
       && Number(v.bag) === Math.floor((n2 - 1) / 2) && Number(v.storage) === n2 - 1 - Math.floor((n2 - 1) / 2),
       `F4: one ${k2} short answered ${JSON.stringify(v).slice(0, 240)}`);
    ok(Object.keys(burned(before, await held(A))).length === 0 && await purse(A) === Number(R2.gold) + 50 && await version(A, 0) === ver,
       'F4: a build one unit short moved something');
  } else ok(false, `F4: ${R.unlock_id} has no rung 2 open at the first home to probe`);

  // F3 THE CHEST from an empty bag and Storage, built on slot 1.
  await clearLines(A, cCost);
  for (const [k, n] of Object.entries(cCost)) await setSto(A, k, n + 2);
  await setPurse(A, Number(C1.gold) - 1);
  before = await held(A);
  v = await chest(A, 1, C1, Number(C1.gold));
  ok(v && v.error === 'insufficient_gold', `F4: a chest with its materials and a short purse answered ${JSON.stringify(v).slice(0, 200)}`);
  ok(Object.keys(burned(before, await held(A))).length === 0, `F4: a chest refused for gold moved ${JSON.stringify(burned(before, await held(A)))}`);
  await setPurse(A, Number(C1.gold) + 3);
  const capBefore = Number((await one("select public.hr_state_of($1,0)->'depot'->>'cap' c", [A])).c);
  v = await chest(A, 1, C1, Number(C1.gold), '000000c0-0000-4000-b000-00000110f003');
  ok(v && v.ok === true, `F3: the chest from Storage answered ${JSON.stringify(v).slice(0, 240)}`);
  for (const k of Object.keys(cCost)) ok(await sto(A, k) === 2 && await bag(A, 1, k) === 0, `F3: ${k} reads bag ${await bag(A, 1, k)}, Storage ${await sto(A, k)} (expected 0 and 2)`);
  ok(await purse(A) === 3, `F3: the purse is ${await purse(A)}, expected 3`);
  led = await ledger(A, 'storage_chest:' + C1.chest_id);
  ok(led.length === 1 && led[0].g === String(-C1.gold) && led[0].gold_kind === 'storage' && led[0].p === '3' && same(fromSum(led[0].meta.from), cCost),
     `F3: the chest's journal holds ${JSON.stringify(led)}`);
  ok(Number((await one("select public.hr_state_of($1,0)->'depot'->>'cap' c", [A])).c) === capBefore + Number(C1.stacks), 'F3: the other hero does not read the raised cap');
  await setPurse(A, Number(C1.gold) + 3);
  before = await held(A);
  v = await chest(A, 1, C1, Number(C1.gold), '000000c0-0000-4000-b000-00000110f003');
  ok(v && v.ok === true && await purse(A) === Number(C1.gold) + 3 && Object.keys(burned(before, await held(A))).length === 0
     && (await ledger(A, 'storage_chest:' + C1.chest_id)).length === 1, `F3: a replayed chest key answered ${JSON.stringify(v).slice(0, 160)} and moved something`);

  // F6 NOT THE HOUSE: the plot's cost in Storage only.
  await clearLines(A, pCost);
  for (const [k, n] of Object.entries(pCost)) await setSto(A, k, n);
  await setPurse(A, Number(P.gold) + 100);
  before = await held(A);
  v = await buy(A, 0, P.offer_id);
  ok(v && v.error === 'insufficient_item' && !('storage' in v), `F6: ${P.offer_id} with its cost in Storage only answered ${JSON.stringify(v).slice(0, 200)}`);
  ok(Object.keys(burned(before, await held(A))).length === 0, `F6: ${P.offer_id} took Storage: ${JSON.stringify(burned(before, await held(A)))}`);

  // F7 THE LOCK ORDER, from the bodies (comments stripped).
  const src = async (sig) => (await one('select prosrc from pg_proc where oid = to_regprocedure($1)', [sig])).prosrc.replace(/--[^\n]*/g, '');
  const order = (s, marks) => marks.map((m) => s.indexOf(m));
  const rising = (xs) => xs.every((x, i) => x > 0 && (i === 0 || x > xs[i - 1]));
  const afterPurse = (s) => s.slice(s.indexOf('public.hr_purse_move(') + 'public.hr_purse_move('.length);
  const tk = await src('public.hr_materials_take(uuid,integer,jsonb,boolean)');
  const tko = order(tk, ["hashtextextended(p_user::text || ':' || p_slot::text, 0)", 'from public.player_state where user_id = p_user and slot = p_slot for update',
    "hashtextextended('hr:depot:' || p_user::text, 0)", 'from public.player_inventory i', 'from public.account_bank b']);
  ok(rising(tko), `F7: hr_materials_take order hero -> row -> depot -> bag -> Storage reads ${tko}`);
  const ub = await src('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)');
  const ubo = order(ub, ["hashtextextended(v_uid::text || ':' || v_slot::text, 0)", "hashtextextended('hr:home:' || v_uid::text, 0)",
    'where user_id = v_uid and slot = v_slot for update', 'public.hr_materials_take(', 'public.hr_purse_move(']);
  ok(rising(ubo) && !/for update|pg_advisory|hr_materials_take|hr_purse_move|hr_hunt_lock/.test(afterPurse(ub)), `F7: hr_unlock_buy order hero -> home -> row -> materials -> purse reads ${ubo}`);
  const cb = await src('public.hr_storage_chest_build(integer,text,bigint,uuid)');
  const cbo = order(cb, ['perform public.hr_hunt_lock(v_uid, p_slot);', 'from public.player_state where user_id = v_uid and slot = p_slot for update',
    "hashtextextended('hr:depot:' || v_uid::text, 0)", 'public.hr_materials_take(', 'public.hr_purse_move(']);
  ok(rising(cbo) && !/for update|pg_advisory|hr_materials_take|hr_purse_move|hr_hunt_lock/.test(afterPurse(cb)), `F7: hr_storage_chest_build order hero -> row -> depot -> materials -> purse reads ${cbo}`);

  // F8 THE ACL.
  for (const role of ['anon', 'authenticated', 'service_role', 'hr_engine']) {
    ok(!(await one(`select has_function_privilege('${role}','public.hr_materials_take(uuid,integer,jsonb,boolean)','execute') e`)).e, `F8: ${role} reaches hr_materials_take`);
  }

  // F9 A SECOND APPLY IS A NO-OP: §0 accepts its own post-images, §5 runs again, and the schema
  //    fingerprint, the three bodies and every row this guard wrote are byte-identical. (Clean run
  //    only: a mutant's body is not the post-image §0 pins, so its second apply is refused by design.)
  if (!mutate) {
    const bodies = () => q(`select p.oid::regprocedure::text s, md5(replace(prosrc, chr(13), '')) m from pg_proc p
       where p.oid in (to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)'),
                       to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)'),
                       to_regprocedure('public.hr_storage_chest_build(integer,text,bigint,uuid)')) order by 1`);
    const rowsOf = async () => JSON.stringify([await held(A), await purse(A),
      (await one('select count(*)::int n from public.player_ledger where user_id = $1', [A])).n]);
    const before9 = JSON.stringify([await inventory(db), await bodies(), await rowsOf()]);
    await as('');
    await db.exec((await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n'));
    ok(JSON.stringify([await inventory(db), await bodies(), await rowsOf()]) === before9, 'F9: a second apply changed the schema, a body or a row');
  }
  await db.close?.();
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) { for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`); process.exit(0); }
  const oneArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || oneArg) {
    const ids = oneArg ? [oneArg.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${caught}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `house-from-storage --selftest: ${slipped} mutation(s) SLIPPED` : `house-from-storage --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('house-from-storage: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('house-from-storage: a house build takes the bag first, then the account\'s Storage (F1-F9 green): the regression, bag first, the chest, all or nothing, one account, not the house, lock order, ACL, a second apply is a no-op');
  process.exit(0);
} catch (e) {
  console.error(`house-from-storage: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
