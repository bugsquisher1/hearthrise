#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/worker-hire-cap.mjs — AN UNPAID CREW CAP IS ZERO, NOT SIX
//
//   node tests/worker-hire-cap.mjs             # the guard
//   node tests/worker-hire-cap.mjs --list      # the mutation catalogue
//   node tests/worker-hire-cap.mjs --selftest  # every mutation must be CAUGHT
//   node tests/worker-hire-cap.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-09-worker-hire-price.sql
//             src/data/gold-ladders.js WORKER_HIRE_COSTS · src/features/workers.js
//
// ── THE DEFECT (found live 2026-09-09, b527, by playing) ────────────────
// The House panel offered "Hire worker — 500g". The click hired a worker and
// player_state.gold did not move; player_ledger got one row kind='worker',
// intent='worker_hire', gold=NULL, meta.paid_cap=6 — for a character that has
// never bought a worker_hire rung. hr_worker_hire read its paid cap as
//
//   coalesce(greatest(0, least(max(pp.value), c_max_crew))::int, 0)
//
// and Postgres LEAST/GREATEST are NOT strict: they DROP null arguments. Over
// zero rows max() is NULL, least(NULL, 6) = 6, and the outer coalesce never
// fires. An unpaid player got a cap of SIX — up to six free workers, each of
// which then gathers for them forever. Fail-open, on a gold surface.
//
// ── WHAT THIS DRIVES, ALL OF IT FOR REAL ────────────────────────────────
// A real character on a fully replayed PGlite chain (real PostgreSQL, in
// process — no Docker, no credentials, production untouched):
//   W1  THE UNPAID HIRE IS REFUSED. A character that has bought nothing gets
//       crew_cap_reached with paid_cap 0, no crew row and no gold movement.
//       This is the arm that would have caught the live bug.
//   W2  THE PRICE IS SERVER-OWNED AND IS THE DATA'S. hr_unlock_offers prices
//       worker_hire.1..6 exactly as src/data/gold-ladders.js WORKER_HIRE_COSTS
//       does — so the 500g the client renders is an echo, never an author.
//   W3  THE PAID PATH STILL WORKS, AND COSTS EXACTLY ONCE. Buying the rung
//       through the REAL hr_unlock_buy debits 500g and journals it; the hire
//       then materialises ONE worker for no further gold (two-step by design),
//       and the next hire at the cap is refused.
//   W4  THE BUG REPRODUCES WITHOUT THE MIGRATION. The chain is replayed a
//       SECOND time stopping BEFORE 2026-09-09-worker-hire-price.sql and the
//       unpaid hire must SUCCEED there — the guard proves it is measuring the
//       migration and not the weather.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; the row lock is uncontended.
//   · The PostgREST / Deno request path. The RPC is called as SQL with the role
//     and jwt claim PostgREST would set.
//   · Anything about PRODUCTION rows — this is a rebuild, not a restore. The
//     three free workers already materialised live are a data question, not a
//     code one, and this guard deliberately does not touch them.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, ROOT, manifest } from './schema-replay.mjs';

const MIGRATION = '2026-09-09-worker-hire-price.sql';
const FIXED = '  select least(greatest(0, coalesce(max(pp.value), 0)), c_max_crew)::int into v_cap';
const BUGGY = '  select coalesce(greatest(0, least(max(pp.value), c_max_crew))::int, 0) into v_cap';

const USER = '00000000-0000-4000-8000-0000000f1ee0';

// ── the mutation catalogue ───────────────────────────────────────────────
const MUTATIONS = {
  cap_fail_open: {
    why: 'restore the LEAST(NULL, 6) cap read — the live free-crew bug, verbatim',
    caught_by: 'W1',
  },
  cap_always_max: {
    why: 'ignore what was paid for and always allow six — the same fail-open, spelled honestly',
    caught_by: 'W1/W3',
  },
  price_drift: {
    why: 'move the worker_hire.1 offer price one gold off the ladder src/data declares',
    caught_by: 'W2',
  },
  buy_free: {
    why: 'sell the rung without debiting gold',
    caught_by: 'W3',
  },
};

function fail(arm, msg) { throw new Error(`${arm}: ${msg}`); }
function ok(arm, cond, msg) { if (!cond) fail(arm, msg); }

async function jwt(db, uid) {
  // The chain's own §-blocks leave a role set behind them; every read in this
  // guard is a bookkeeping read and must run as the owner, not as a client.
  await db.exec('reset role;');
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
}
async function one(db, sql, params) {
  try { return (await db.query(sql, params)).rows[0]; }
  catch (e) { e.message += ` [while running: ${sql.trim().replace(/\s+/g, ' ').slice(0, 90)}]`; throw e; }
}

async function seed(db, uid) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(
    `insert into public.profiles (id, display_name) values ($1, 'FreeCrew')
       on conflict (id) do update set display_name = excluded.display_name`, [uid]);
  await jwt(db, uid);
  await db.exec('select public.hr_create_character(0);');
}

async function applyMutation(db, id) {
  if (id === 'cap_fail_open' || id === 'cap_always_max') {
    const { def } = await one(db,
      `select replace(pg_get_functiondef('public.hr_worker_hire(int,uuid)'::regprocedure), chr(13), '') as def`);
    if (!def.includes(FIXED)) throw new Error(`mutation ${id}: the fixed cap read is absent — nothing to mutate`);
    const repl = id === 'cap_fail_open' ? BUGGY : '  select 6 into v_cap';
    await db.exec(def.replace(FIXED, repl));
  } else if (id === 'price_drift') {
    /* 501, not 0: a zero trips hr_unlock_offers' own CHECK and the ✓ would be
       the constraint's, not this guard's. A legal-but-wrong price is what
       catalogue drift actually looks like. */
    await db.exec(`update public.hr_unlock_offers set gold = 501 where offer_id = 'worker_hire.1'`);
  } else if (id === 'buy_free') {
    // Refund the debit behind hr_unlock_buy's back: the arm must notice the
    // books, not the RPC's return value.
    await db.exec(`create or replace function public.hr__mut_refund() returns trigger
                   language plpgsql as $$ begin
                     if new.gold < old.gold then new.gold := old.gold; end if; return new;
                   end $$;`);
    await db.exec(`create trigger hr__mut_refund before update on public.player_state
                   for each row execute function public.hr__mut_refund();`);
  } else {
    throw new Error(`unknown mutation ${id}`);
  }
}

// ── the arms ─────────────────────────────────────────────────────────────
async function armsOn(db, { expectUnpaidHireRefused = true } = {}) {
  const uid = USER;
  await seed(db, uid);

  // W1 — THE UNPAID HIRE.
  const before = await one(db, 'select gold from public.player_state where user_id=$1 and slot=0', [uid]);
  const { rungs } = await one(db,
    `select count(*)::int as rungs from public.player_progress
      where user_id=$1 and kind='unlock' and key='worker_hire'`, [uid]);
  ok('W1', rungs === 0, 'the fixture character must own no worker_hire rung');
  const { r } = await one(db, 'select public.hr_worker_hire(0, gen_random_uuid()) as r');
  const { crew } = await one(db,
    'select count(*)::int as crew from public.player_workers where user_id=$1 and slot=0', [uid]);
  const after = await one(db, 'select gold from public.player_state where user_id=$1 and slot=0', [uid]);

  if (!expectUnpaidHireRefused) {
    // W4's inverted run: without the migration the hire must SUCCEED.
    ok('W4', r && r.ok === true && crew === 1,
      `pre-migration the unpaid hire should reproduce the bug, got ${JSON.stringify(r)} crew=${crew}`);
    return;
  }
  ok('W1', r && r.ok !== true && r.error === 'crew_cap_reached',
    `an unpaid hire must be refused, got ${JSON.stringify(r)}`);
  ok('W1', r.paid_cap === 0, `an unpaid cap must read 0, got ${r.paid_cap} (LEAST(NULL,6) is 6)`);
  ok('W1', crew === 0, `no worker may be materialised without a paid rung, crew=${crew}`);
  ok('W1', String(after.gold) === String(before.gold), 'a refused hire must move no gold');

  // W2 — THE PRICE IS THE DATA'S.
  const ladder = (await import('file://' + join(ROOT, 'src', 'data', 'gold-ladders.js').replace(/\\/g, '/')))
    .WORKER_HIRE_COSTS;
  ok('W2', Array.isArray(ladder) && ladder.length === 6, 'WORKER_HIRE_COSTS must be the six-rung ladder');
  for (let i = 0; i < ladder.length; i++) {
    const row = await one(db,
      'select gold from public.hr_unlock_offers where offer_id=$1', [`worker_hire.${i + 1}`]);
    ok('W2', row && Number(row.gold) === Number(ladder[i]),
      `worker_hire.${i + 1} is priced ${row && row.gold} server-side, src/data says ${ladder[i]}`);
  }

  // W3 — THE PAID PATH. Fund, upgrade the property to tier 1 (worker_hire.1's
  // stated prerequisite), buy the rung, then hire.
  await db.exec('reset role;');
  /* Bookkeeping reads always run as the OWNER. hr_engine deliberately cannot
     select player_state (it reaches state only through the RPCs), so a read
     left inside a role swap fails with `permission denied` rather than a
     wrong answer — reset first, every time. */
  const ver = async () => {
    await db.exec('reset role;');
    return (await one(db, 'select version from public.player_state where user_id=$1 and slot=0', [uid])).version;
  };
  const gold = async () => {
    await db.exec('reset role;');
    return Number((await one(db, 'select gold from public.player_state where user_id=$1 and slot=0', [uid])).gold);
  };
  const engineApply = async (delta) => {
    await db.exec(`set role hr_engine;`);
    const row = await one(db, 'select public.hr_apply($1, 0, $2, gen_random_uuid(), $3::jsonb) as r',
      [uid, await ver(), JSON.stringify(delta)]);
    await db.exec('reset role;');
    return row.r;
  };
  const engineBuy = async (offer) => {
    await db.exec(`set role hr_engine;`);
    const row = await one(db, 'select public.hr_unlock_buy($1, 0, $2, gen_random_uuid(), $3) as r',
      [uid, await ver(), offer]);
    await db.exec('reset role;');
    return row.r;
  };
  await engineApply({ gold: 100000, items: { normal_log: 30, copper_ore: 20 } });
  const bought = await engineBuy('property.homestead');
  ok('W3', bought && bought.ok === true, `property.homestead must land, got ${JSON.stringify(bought)}`);

  const g0 = await gold();
  const rung = await engineBuy('worker_hire.1');
  ok('W3', rung && rung.ok === true, `worker_hire.1 must be purchasable, got ${JSON.stringify(rung)}`);
  ok('W3', (await gold()) === g0 - 500, `the 500g rung cost must leave the account exactly once (${g0} -> ${await gold()})`);
  const led = await one(db,
    `select count(*)::int as n from public.player_ledger
      where user_id=$1 and gold = -500 and intent like 'unlock_buy:worker_hire.1%'`, [uid]);
  ok('W3', led.n === 1, `the 500g debit must be journalled exactly once, found ${led.n}`);

  await jwt(db, uid);
  const g1 = await gold();
  const { r: h2 } = await one(db, 'select public.hr_worker_hire(0, gen_random_uuid()) as r');
  ok('W3', h2 && h2.ok === true && h2.crew === 1, `the paid hire must materialise, got ${JSON.stringify(h2)}`);
  ok('W3', (await gold()) === g1, 'materialising a PAID worker must charge no further gold');
  const { r: h3 } = await one(db, 'select public.hr_worker_hire(0, gen_random_uuid()) as r');
  ok('W3', h3 && h3.ok !== true && h3.error === 'crew_cap_reached' && h3.paid_cap === 1,
    `at the paid cap the next hire must be refused, got ${JSON.stringify(h3)}`);
  const { crew: crew2 } = await one(db,
    'select count(*)::int as crew from public.player_workers where user_id=$1 and slot=0', [uid]);
  ok('W3', crew2 === 1, `no worker may be minted past the paid cap, crew=${crew2}`);
}

// ── runners ──────────────────────────────────────────────────────────────
async function runBase(mutate) {
  const { db } = await bootReplay();
  if (mutate) await applyMutation(db, mutate);
  await armsOn(db);
}

async function runPreMigration() {
  const files = (await manifest()).order;
  const idx = files.indexOf(MIGRATION);
  if (idx < 0) throw new Error(`${MIGRATION} is not in tests/schema-apply-order.json`);
  const { db } = await bootReplay({ upTo: files[idx - 1] });
  await armsOn(db, { expectUnpaidHireRefused: false });
}

const argv = process.argv.slice(2);
const mutArg = argv.find((a) => a.startsWith('--mutate'));

if (argv.includes('--list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(16)} ${m.caught_by.padEnd(6)} ${m.why}`);
  process.exit(0);
}

if (argv.includes('--selftest')) {
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    let caught = null;
    try { await runBase(id); } catch (e) { caught = e.message; }
    if (caught) console.log(`  ✓ ${id} caught — ${caught.split('\n')[0].slice(0, 110)}`);
    else { console.log(`  ✗ ${id} NOT CAUGHT — the guard does not bite`); bad++; }
  }
  if (bad) { console.error(`worker-hire-cap --selftest: ${bad} mutation(s) uncaught`); process.exit(1); }
  console.log('worker-hire-cap --selftest: every mutation caught');
  process.exit(0);
}

const only = mutArg ? mutArg.split('=')[1] : null;
try {
  await runBase(only);
  if (!only) await runPreMigration();
  console.log('worker-hire-cap: OK — an unpaid crew cap is 0, the price is the ladder\'s, the paid path charges once');
} catch (e) {
  console.error('worker-hire-cap: RED —', e.message);
  if (process.env.HR_TRACE) console.error(e.stack);
  process.exit(1);
}
