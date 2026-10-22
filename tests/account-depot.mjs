#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/account-depot.mjs — ONE DEPOT PER ACCOUNT (Tyler 2026-10-15 / 2026-10-22).
//
//   node tests/account-depot.mjs             the guard
//   node tests/account-depot.mjs --list      the mutation catalogue
//   node tests/account-depot.mjs --selftest  every mutation must be CAUGHT
//   node tests/account-depot.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-11-10-account-depot.sql
//
// A real character pair on a fully replayed PGlite chain (real PostgreSQL, in
// process, production untouched):
//   A1  SHARED. A deposit on slot 0 is in slot 1's envelope (hr_state_of `bank`,
//       the same map on both slots) and slot 1 withdraws it through the real
//       hr_bank_move; the emptied stack is a deleted row.
//   A2  TWO WRITERS, INTERLEAVED. Slots 0 and 1 deposit and withdraw the same
//       stacks in an alternating, seeded sequence; at every step the per-item
//       total (both bags + the depot) is conserved and the depot equals the
//       journal's signed sum. Every move is one ledger row of the acting slot.
//   A3  THE FOLD RULE, ON A DATABASE THAT HAS PER-CHARACTER BANKS. The chain is
//       replayed to the file BEFORE this one, two characters' player_bank rows
//       (and an orphan user's) are planted, the migration is applied, and the
//       account rows must be the per-item sums, every source row journalled
//       (depot_fold), the orphan not kept, player_bank gone.
//   A4  RE-APPLY IS A NO-OP. The migration applied a second time leaves the
//       whole schema fingerprint and the depot rows byte-identical.
//   A5  THE LOCK DISCIPLINE (what PGlite, one backend, cannot race): in the
//       installed hr_bank_move the account depot advisory lock comes AFTER the
//       character FOR UPDATE and BEFORE the first account_bank access; the
//       withdraw reads the row FOR UPDATE; the deposit is upsert arithmetic.
//   A6  THE ACL. No client role writes account_bank; anon cannot read it; one
//       own-read policy; hr_bank_move / hr_account_items grants unchanged.
//   A7  THE ACCOUNT SEARCH lists the depot once, slot null.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend, so two transactions never overlap
// here. A5 pins the lock ORDER that makes the concurrent case correct (two
// characters serialise on the depot key; nothing takes a character lock after
// it, so no cycle); the overlapping run itself is unverified locally (no real
// Postgres on this machine, and a Supabase branch is paid spend).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, LAST_PATCHED, ROOT, inventory } from './schema-replay.mjs';

const MIG = '2026-11-10-account-depot.sql';
const PREV = '2026-11-09-armour-class-catalogue.generated.sql';

/* Short-circuit the migration's own §2 fold probe and §6 self-check so a planted
   defect can only be seen by THIS guard's arms (the self-checks run once, at
   apply; the regression that matters is a later restatement that never runs them). */
const GATE_BLIND = [
  /* §0's md5 pins would refuse the mutant on A4's second apply before any arm looks. */
  ['declare v_md5 text;\nbegin\n', 'declare v_md5 text;\nbegin\n  if true then return; end if;   -- selftest: §0 pins short-circuited\n'],
  ["  -- (§2a) THE FOLD RULE, EXECUTED ON A PROBE",
   "  if true then perform pg_temp.hr_depot_fold(null); drop table public.player_bank; return; end if; -- selftest: §2 probe short-circuited\n  -- (§2a) THE FOLD RULE, EXECUTED ON A PROBE"],
  ["  v jsonb; v_item text; v_role text; v_tot bigint;\nbegin\n",
   "  v jsonb; v_item text; v_role text; v_tot bigint;\nbegin\n  if true then return; end if;   -- selftest: §6 short-circuited\n"],
];

const BODY = {
  depot_lock_dropped: {
    why: 'hr_bank_move stops taking the account depot lock: two characters of one account no longer serialise, so the stack fuse count races',
    find: "  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));\n",
    repl: '\n',
  },
  withdraw_unlocked: {
    why: 'the withdraw reads the depot row without FOR UPDATE: a check-then-write across two characters',
    find: '    select qty into v_have from public.account_bank\n      where user_id = v_uid and item_id = p_item for update;',
    repl: '    select qty into v_have from public.account_bank\n      where user_id = v_uid and item_id = p_item;',
  },
  deposit_overwrites: {
    why: 'the deposit upsert SETS the stack to the deposited amount instead of adding: a second character deposit erases the first',
    find: 'on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();',
    repl: 'on conflict (user_id, item_id) do update set qty = excluded.qty, updated_at = now();',
  },
  fold_takes_max: {
    why: 'the fold keeps the largest per-slot stack instead of the sum: items of every other character are lost',
    find: 'select pb.user_id, pb.item_id, sum(pb.qty)::bigint, now()',
    repl: 'select pb.user_id, pb.item_id, max(pb.qty)::bigint, now()',
  },
  fold_unjournalled: {
    why: 'the fold moves items without a journal row: which slot held what is lost',
    find: '   where (p_user is null or pb.user_id = p_user)\n     and exists (select 1 from auth.users u where u.id = pb.user_id);\n',
    repl: '   where false;\n',
  },
  envelope_misses_depot: {
    why: 'hr_state_of stops projecting the depot: the client renders an empty storage while the server holds items',
    find: "        from public.account_bank where user_id = p_user), '{}'::jsonb),",
    repl: "        from public.account_bank where user_id = p_user and false), '{}'::jsonb),",
  },
  search_per_slot: {
    why: 'hr_account_items lists the depot under a character slot again: one depot shown as one character\'s',
    find: "              select null::integer as slot, ab.item_id, ab.qty, 'bank'::text as loc, 1 as ord from public.account_bank ab",
    repl: "              select 0 as slot, ab.item_id, ab.qty, 'bank'::text as loc, 1 as ord from public.account_bank ab",
  },
  client_write_grant: {
    why: 'authenticated is granted UPDATE on account_bank: a client can set its own depot',
    find: 'grant select on public.account_bank to authenticated;',
    repl: 'grant select, update on public.account_bank to authenticated;',
  },
};
const MUTATIONS = {};
for (const [id, m] of Object.entries(BODY)) MUTATIONS[id] = { ...m, also: GATE_BLIND };

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

function patchList(mutate) {
  if (!mutate) return [];
  const m = MUTATIONS[mutate];
  if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  return [[m.find, m.repl], ...(m.also || [])];
}

async function migrationText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  for (const [find, repl] of patchList(mutate)) {
    if (sql.split(find).length - 1 !== 1) { const e = new Error(`patch anchor matched != 1 time in ${MIG}: ${find.slice(0, 60)}`); e.harness = true; throw e; }
    sql = sql.replace(find, () => repl);
  }
  return sql;
}

function drivers(db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = async (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const gate = () => q('delete from public.hr_rate_counters');
  const newUser = async () => {
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'account-depot test') on conflict (user_id) do nothing", [uid]);
    await as(uid);
    for (const slot of [0, 1]) {
      await gate();
      const r = (await q('select public.hr_create_character($1) as v', [slot]))[0].v;
      if (!r || r.ok !== true) { const e = new Error(`hr_create_character(${slot}) refused: ${JSON.stringify(r)}`); e.harness = true; throw e; }
    }
    return uid;
  };
  const move = async (uid, slot, item, qty, dir) => {
    await as(uid); await gate();
    return (await q('select public.hr_bank_move($1,$2,$3,$4,gen_random_uuid()) as v', [slot, item, qty, dir]))[0].v;
  };
  const depot = async (uid) => Object.fromEntries((await q('select item_id, qty::text q from public.account_bank where user_id=$1', [uid])).map((r) => [r.item_id, Number(r.q)]));
  const bag = async (uid, slot, item) => Number((await q('select coalesce(sum(qty),0)::text q from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3', [uid, slot, item]))[0].q);
  const envBank = async (uid, slot) => (await q('select public.hr_state_of($1,$2)->\'bank\' as b', [uid, slot]))[0].b;
  return { q, as, gate, newUser, move, depot, bag, envBank };
}

async function freshItems(d, uid, n) {
  return (await d.q(`select item_id from public.hr_items where item_id not in
      (select item_id from public.player_inventory where user_id=$1) order by item_id limit $2`, [uid, n])).map((r) => r.item_id);
}

/** A1, A2, A4–A7 on the whole chain. */
async function fullChainArms(mutate) {
  const { db } = await bootReplay({ patches: mutate ? new Map([[MIG, patchList(mutate)]]) : undefined, upTo: LAST_PATCHED });
  const d = drivers(db);
  const u = await d.newUser();
  const [i1, i2] = await freshItems(d, u, 2);
  await d.q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,40),($1,1,$2,40),($1,0,$3,40),($1,1,$3,40)', [u, i1, i2]);

  // A1 SHARED.
  let v = await d.move(u, 0, i1, 9, 'deposit');
  ok(v && v.ok === true, `A1: slot 0 deposit refused: ${JSON.stringify(v)}`);
  const b0 = await d.envBank(u, 0), b1 = await d.envBank(u, 1);
  ok(b1 && b1[i1] === 9, `A1: slot 1's envelope bank is ${JSON.stringify(b1)}, expected {${i1}: 9}`);
  ok(JSON.stringify(b0) === JSON.stringify(b1), `A1: slots read different depots: ${JSON.stringify(b0)} vs ${JSON.stringify(b1)}`);
  v = await d.move(u, 1, i1, 9, 'withdraw');
  ok(v && v.ok === true, `A1: slot 1 withdraw of slot 0's deposit refused: ${JSON.stringify(v)}`);
  ok(!((await d.depot(u))[i1]), 'A1: the emptied stack is still a row');
  ok(await d.bag(u, 1, i1) === 49, `A1: slot 1's bag holds ${await d.bag(u, 1, i1)}, expected 49`);

  // A2 TWO WRITERS, INTERLEAVED (seeded LCG; no Math.random).
  let seed = 20261022;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed >>> 16) % n; };
  const total = {};
  for (const it of [i1, i2]) total[it] = (await d.bag(u, 0, it)) + (await d.bag(u, 1, it)) + ((await d.depot(u))[it] || 0);
  const ledger0 = Number((await d.q("select count(*)::text n from public.player_ledger where user_id=$1 and kind='bank'", [u]))[0].n);
  let moved = 0;
  for (let step = 0; step < 40; step++) {
    const slot = step % 2, it = rnd(2) ? i1 : i2, dir = rnd(2) ? 'deposit' : 'withdraw', qty = 1 + rnd(12);
    v = await d.move(u, slot, it, qty, dir);
    if (v && v.ok === true) moved++;
    else ok(v && ['insufficient_item', 'insufficient_bank'].includes(v.error), `A2 step ${step}: ${dir} ${qty} on slot ${slot} refused ${JSON.stringify(v)}`);
    const now = (await d.bag(u, 0, it)) + (await d.bag(u, 1, it)) + ((await d.depot(u))[it] || 0);
    if (now !== total[it]) { ok(false, `A2 step ${step}: ${it} total ${now}, conserved ${total[it]} (slot ${slot} ${dir} ${qty})`); break; }
  }
  ok(moved >= 15, `A2: only ${moved} of 40 interleaved moves landed — the arm measured little`);
  const journalled = Number((await d.q("select count(*)::text n from public.player_ledger where user_id=$1 and kind='bank'", [u]))[0].n) - ledger0;
  ok(journalled === moved, `A2: ${journalled} journal rows for ${moved} moves`);
  const signed = await d.q("select item_id, (-sum(qty))::text s from public.player_ledger where user_id=$1 and kind='bank' group by item_id", [u]);
  const dep = await d.depot(u);
  for (const r of signed) ok(Number(r.s) === (dep[r.item_id] || 0), `A2: the journal says ${r.s} of ${r.item_id} in the depot, it holds ${dep[r.item_id] || 0}`);
  ok((await d.q("select count(distinct slot)::int n from public.player_ledger where user_id=$1 and kind='bank'", [u]))[0].n === 2, 'A2: the journal does not name both acting slots');

  // A5 THE LOCK DISCIPLINE.
  const src = (await d.q("select prosrc from pg_proc where oid = to_regprocedure('public.hr_bank_move(integer,text,bigint,text,uuid)')"))[0].prosrc.replace(/--[^\n]*/g, '');
  const iChar = src.search(/from public\.player_state\s+where user_id = v_uid and slot = p_slot for update/);
  const iLock = src.indexOf("pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0))");
  const iBank = src.indexOf('public.account_bank');
  ok(iChar > 0 && iLock > iChar && iBank > iLock, `A5: lock order in hr_bank_move is character ${iChar} -> depot ${iLock} -> account_bank ${iBank} (need increasing)`);
  ok(/select qty into v_have from public\.account_bank\s+where user_id = v_uid and item_id = p_item for update;/.test(src), 'A5: the withdraw does not read the depot row FOR UPDATE');
  ok(/on conflict \(user_id, item_id\) do update set qty = b\.qty \+ excluded\.qty/.test(src), 'A5: the deposit is not upsert arithmetic');
  ok(!/player_bank/.test(src), 'A5: hr_bank_move still names player_bank');

  // A6 THE ACL.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const w = (await d.q(`select has_table_privilege('${role}','public.account_bank','insert,update,delete,truncate') w`))[0].w;
    ok(!w, `A6: ${role} can write account_bank`);
  }
  ok(!(await d.q("select has_table_privilege('anon','public.account_bank','select') s"))[0].s, 'A6: anon reads account_bank');
  const pol = await d.q("select cmd from pg_policies where schemaname='public' and tablename='account_bank'");
  ok(pol.length === 1 && pol[0].cmd === 'SELECT', `A6: account_bank policies ${JSON.stringify(pol)}`);
  ok((await d.q("select has_function_privilege('authenticated','public.hr_bank_move(integer,text,bigint,text,uuid)','execute') e"))[0].e, 'A6: authenticated lost hr_bank_move');
  ok(!(await d.q("select has_function_privilege('anon','public.hr_bank_move(integer,text,bigint,text,uuid)','execute') e"))[0].e, 'A6: anon reaches hr_bank_move');
  ok((await d.q("select to_regclass('public.player_bank') t"))[0].t === null, 'A6: player_bank still exists');

  // A7 THE ACCOUNT SEARCH.
  await d.as(u); await d.gate();
  const deposited = (await d.depot(u))[i1] ? i1 : i2;
  if (!(await d.depot(u))[deposited]) await d.move(u, 0, deposited, 1, 'deposit');
  await d.as(u); await d.gate();
  const s = (await d.q('select public.hr_account_items($1) v', [deposited]))[0].v;
  const bankRows = (s && s.rows || []).filter((r) => r.where === 'bank');
  ok(bankRows.length === 1 && bankRows[0].slot === null && bankRows[0].name === null,
    `A7: the depot is listed as ${JSON.stringify(bankRows)}, expected once with slot null`);

  // A4 RE-APPLY IS A NO-OP.
  const before = JSON.stringify(await inventory(db)), depBefore = JSON.stringify(await d.depot(u));
  await d.as('');
  await db.exec(await migrationText(mutate));
  ok(JSON.stringify(await inventory(db)) === before, 'A4: a second apply changed the schema fingerprint');
  ok(JSON.stringify(await d.depot(u)) === depBefore, 'A4: a second apply changed the depot rows');
  await db.close?.();
}

/** A3 THE FOLD on a database replayed to the file before this one. */
async function foldArm(mutate) {
  const { db } = await bootReplay({ upTo: PREV });
  const d = drivers(db);
  const u = await d.newUser();
  const [i1, i2, i3] = await freshItems(d, u, 3);
  const orphan = (await d.q('select gen_random_uuid() as i'))[0].i;
  await d.q(`insert into public.player_bank (user_id, slot, item_id, qty) values
      ($1,0,$2,5),($1,1,$2,7),($1,0,$3,2),($1,1,$4,1000000000000),($5,0,$2,3)`, [u, i1, i2, i3, orphan]);
  await d.as('');
  await db.exec(await migrationText(mutate));
  const dep = await d.depot(u);
  ok(dep[i1] === 12 && dep[i2] === 2 && dep[i3] === 1e12 && Object.keys(dep).length === 3,
    `A3: slot 0 {${i1}:5, ${i2}:2} + slot 1 {${i1}:7, ${i3}:1e12} folded to ${JSON.stringify(dep)}`);
  ok((await d.q('select count(*)::int n from public.account_bank where user_id=$1', [orphan]))[0].n === 0, 'A3: an orphan user\'s bank was kept');
  const j = await d.q("select slot, item_id, qty::text q, meta from public.player_ledger where user_id=$1 and intent='depot_fold' order by slot, item_id", [u]);
  ok(j.length === 4 && j.every((r) => r.q === '0' && Number.isInteger(r.meta && r.meta.from_slot)), `A3: ${j.length} depot_fold journal rows for 4 folded stacks: ${JSON.stringify(j)}`);
  ok((await d.q("select to_regclass('public.player_bank') t"))[0].t === null, 'A3: player_bank survived the fold');
  await db.close?.();
}

async function run(mutate) {
  problems.length = 0;
  await fullChainArms(mutate);
  await foldArm(mutate);
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`);
    process.exit(0);
  }
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
    console.log(slipped ? `account-depot --selftest: ${slipped} mutation(s) SLIPPED` : `account-depot --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('account-depot: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('account-depot: one depot per account (A1-A7 green): shared across slots, interleaved writers conserved and journalled, fold summed, re-apply a no-op, lock order pinned, ACL closed');
  process.exit(0);
} catch (e) {
  console.error(`account-depot: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
