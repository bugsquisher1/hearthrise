#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bank-cap-rungs.mjs — SA-010 / Q-4: DOES THE AUTHORITY ENFORCE THE BANK
//                            SPACE THE PLAYER PAID FOR?
//
//   node tests/bank-cap-rungs.mjs             # the guard
//   node tests/bank-cap-rungs.mjs --list      # the mutation catalogue
//   node tests/bank-cap-rungs.mjs --selftest  # every mutation must be CAUGHT
//   node tests/bank-cap-rungs.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-06-bank-cap-tracks-rungs.sql
//             src/data/gold-ladders.js · src/data/start-kit.js · src/legacy.js BANK_SPACE
//
// ── THE DEFECT ──────────────────────────────────────────────────────────
// hr_unlock_buy sells bank space as a 30-rung MAX ladder and files the purchase
// as a permanent player_progress row (kind='unlock', key='bank'). Nothing ever
// wrote player_state.bank_cap, which is the ONLY number hr_apply's `bank_full`
// check reads. A player who bought ten rungs therefore had a client cap of 300
// and a server cap of 100: past 100 stacks every item-touching apply — loot, a
// gather, a craft, a shop buy, a settle — was refused, whatever they paid.
//
// ── WHAT THIS DRIVES, ALL OF IT FOR REAL ────────────────────────────────
// A real character on a fully replayed PGlite chain (real PostgreSQL, in
// process — no Docker, no credentials, production untouched):
//   B1  THE LADDER IS THE DATA'S. hr_bank_cap_for_rungs is measured back
//       against src/data/start-kit.js bankCap, src/legacy.js BANK_SPACE.BASE_CAP
//       and src/data/gold-ladders.js BANK_STACKS_PER_RUNG / BANK_RUNGS. The `20`
//       typed in the SQL is the one magnitude no server catalogue carries, so
//       this arm is what stops it drifting from the number the client charges.
//   B2  THE REAL PURCHASE PATH. Rungs bought through the REAL hr_unlock_buy
//       RPC (as hr_engine, the only caller) raise player_state.bank_cap, and
//       hr_state_of projects EXACTLY the enforced number — the client mirrors
//       the projection, so "projected == enforced" is half the contract.
//   B3  THE ENFORCEMENT BOUNDARY. hr_apply ACCEPTS an item delta that fills the
//       bank to exactly the ladder cap and refuses `bank_full` only above it.
//       This is the arm that would have caught the bug: it is driven at 160
//       stacks, sixty past the base cap.
//   B4  RAISE-ONLY. A grandfathered / imported cap above the ladder is never
//       pulled down by a later rung — that would strand items.
//   B5  SLOT ISOLATION. Buying on slot 0 does not raise slot 1's cap.
//   B6  THE BACKFILL, ON A DATABASE THAT ALREADY HAS THE BUG. The chain is
//       replayed a SECOND time stopping BEFORE the migration, the bug is
//       REPRODUCED (three paid rungs, cap still 100, an apply at 101 stacks
//       refused), the migration is then applied to that same database, and the
//       cap must land on the ladder with ZERO rows left below their rung-derived
//       cap.
//   B7  THE ACL. Neither new function is executable by any client role, or by
//       hr_engine: they are a trigger and its helper, not RPCs.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; the advisory lock hr_unlock_buy
//     takes is exercised and contended by nothing.
//   · The PostgREST / Deno request path. The RPC is called as SQL with the role
//     and jwt claim PostgREST would set.
//   · Anything about PRODUCTION rows. This is a rebuild, not a restore.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, ROOT, manifest } from './schema-replay.mjs';
import { BANK_STACKS_PER_RUNG, BANK_RUNGS, BANK_LADDER } from '../src/data/gold-ladders.js';
import { START_CURRENCY } from '../src/data/start-kit.js';

const MIG = '2026-09-06-bank-cap-tracks-rungs.sql';

/* Short-circuits the migration's OWN §5 / §6 self-verifying blocks so a planted
   defect can only be seen by THIS guard's assertions. The blocks are the
   strongest catch there is — they refuse to install broken — but they run once,
   at apply time, and the regression that must still be caught in a year is a
   later migration that restates the trigger from a stale template and never
   runs them at all. */
const GATE_BLIND = [
  ['declare v_p oid; v_bad text; v_left int;\nbegin\n',
    'declare v_p oid; v_bad text; v_left int;\nbegin\n  if true then return; end if;   -- selftest: §5 short-circuited\n'],
  ['  v_env  jsonb;\nbegin\n  begin\n',
    '  v_env  jsonb;\nbegin\n  if true then return; end if;   -- selftest: §6 short-circuited\n  begin\n'],
];

const BODY = {
  per_rung_halved: {
    why: 'a bank rung becomes worth 10 stacks instead of the 20 the client charges for and displays — '
       + 'the server would enforce a cap the player never bought, silently, past rung 1',
    find: '             * 20',
    repl: '             * 10',
  },
  base_not_from_catalogue: {
    why: 'the ladder BASE stops being read from hr_start_kit and becomes a hand-typed number — the '
       + 'second copy of a game magnitude this repo has been burned by twice',
    find: '           (select bank_cap from public.hr_start_kit where only_row)\n           + least(',
    repl: '           200\n           + least(',
  },
  ceiling_unclamped: {
    why: 'the rung count is no longer clamped to the catalogue ceiling, so a forged / overflowed rung '
       + 'value mints a cap far above the 30-rung ladder the game actually sells',
    find: "coalesce((select max_value from public.hr_unlocks where unlock_id = 'bank'), 0)",
    repl: '2147483647',
  },
  trigger_insert_only: {
    why: 'the trigger fires on INSERT only. Rung 1 creates the row and every rung after it UPDATEs it, '
       + 'so the cap freezes one rung in — the exact bug, moved rather than fixed',
    find: '  after insert or update on public.player_progress',
    repl: '  after insert on public.player_progress',
  },
  raise_only_broken: {
    why: 'the maintainer SETS the cap instead of raising it, so a grandfathered / imported cap above '
       + 'the ladder is pulled DOWN by the next purchase and the items above the new cap are stranded',
    find: '     and ps.bank_cap < v_cap;   -- RAISE-ONLY',
    repl: '     and true;                  -- RAISE-ONLY',
  },
  slot_blind: {
    why: "the maintainer drops the slot predicate, so one character's purchase raises the cap on every "
       + 'other character on the account — space nobody paid for',
    find: '     and ps.slot    = new.slot\n',
    repl: '\n',
  },
  backfill_missing: {
    why: 'the one-time backfill matches no row, so every player who ALREADY bought rungs stays walled '
       + 'in at the base cap after the fix ships — the bug survives its own migration',
    find: "     and pp.key     = 'bank'",
    repl: "     and pp.key     = 'bank_disabled_by_mutation'",
  },
};

const MUTATIONS = { ...BODY };
for (const id of Object.keys(BODY)) {
  MUTATIONS[`${id}_gate_blind`] = {
    why: `${BODY[id].why} — with the migration's own §5/§6 short-circuited, so ONLY this guard can see it`,
    find: BODY[id].find,
    repl: BODY[id].repl,
    also: GATE_BLIND,
  };
}

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const patchesFor = (mutate) => {
  if (!mutate) return undefined;
  const m = MUTATIONS[mutate];
  if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  return new Map([[MIG, [[m.find, m.repl], ...(m.also || [])]]]);
};

/** The migration's TEXT, with the same mutation applied — used by B6, which
    applies it by hand to a database replayed to the state before it. */
async function migrationText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (!mutate) return sql;
  const m = MUTATIONS[mutate];
  for (const [find, repl] of [[m.find, m.repl], ...(m.also || [])]) {
    if (sql.split(find).length - 1 !== 1) {
      const e = new Error(`B6: patch anchor matched != 1 time in ${MIG}`); e.harness = true; throw e;
    }
    sql = sql.replace(find, () => repl);
  }
  return sql;
}

/** A booted chain plus the drivers every arm needs. */
async function boot({ mutate, upTo } = {}) {
  const { db } = await bootReplay({ patches: patchesFor(mutate), upTo });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asEngine = async (sql, p) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
  const mkChar = async (slot) => {
    await gate();
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('select public.hr_create_character($1)', [slot]);
  };
  await mkChar(0);
  await q('update public.player_state set gold = 100000000 where user_id = $1', [uid]);
  /* A SECOND character row, seeded directly: hr_create_character(1) is gated by
     the hero-slot entitlement (2026-09-08-hero-slot-buy.sql) and buying a slot is
     not what this guard is about. It exists BEFORE the purchases below so the
     slot-isolation arm is measuring the trigger's predicate, not a row that was
     created after the fact. */
  await q(`insert into public.player_state (user_id, slot) values ($1, 1)
           on conflict (user_id, slot) do nothing`, [uid]);

  const capOf = async (slot = 0) => Number((await q(
    'select bank_cap from public.player_state where user_id=$1 and slot=$2', [uid, slot]))[0].bank_cap);
  const verOf = async (slot = 0) => Number((await q(
    'select version::text v from public.player_state where user_id=$1 and slot=$2', [uid, slot]))[0].v);
  const ladder = async (n) => Number((await q(
    'select public.hr_bank_cap_for_rungs($1::int) as c', [n]))[0].c);

  /** ONE rung, through the REAL spend RPC as the ONLY role allowed to call it. */
  const buyRung = async (k) => {
    await gate();
    const rows = await asEngine(
      'select public.hr_unlock_buy($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text) as r',
      [uid, await verOf(0), `bank.${k}`]);
    return rows[0].r;
  };
  const buyRungs = async (n) => {
    for (let k = 0; k < n; k += 1) {
      const r = await buyRung(k);
      if (!r || r.ok !== true) {
        return { failedAt: k, res: r };
      }
    }
    return { failedAt: null };
  };

  /** An item delta through the REAL authority engine, as the engine role. */
  const apply = async (items) => {
    await gate();
    const rows = await asEngine(
      'select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::jsonb) as r',
      [uid, await verOf(0), JSON.stringify({ items, journal: { kind: 'admin', intent: 'bank_cap_probe' } })]);
    return rows[0].r;
  };

  /** Catalogue item ids — never invented, so the delta is one hr_apply would see. */
  const itemIds = (await q('select item_id from public.hr_items order by item_id')).map((r) => r.item_id);

  const held = async () => new Set((await q(
    'select item_id from public.player_inventory where user_id=$1 and slot=0', [uid])).map((r) => r.item_id));
  /** Ids the character does NOT hold yet — every one of them is a NEW stack, which
      is what the bank cap actually counts. */
  const freshIds = async (n) => {
    const h = await held();
    return itemIds.filter((i) => !h.has(i)).slice(0, n);
  };
  /** Fill the bank to EXACTLY `target` distinct stacks without the engine (the
      engine could not: that is the bug). A fixture, not the thing under test.
      Counts what the start kit already granted rather than assuming an empty bag. */
  const seedTo = async (target) => {
    const h = await held();
    const add = itemIds.filter((i) => !h.has(i)).slice(0, Math.max(0, target - h.size));
    if (add.length) {
      await q(`insert into public.player_inventory (user_id, slot, item_id, qty)
               select $1, 0, i, 1 from unnest($2::text[]) i
               on conflict (user_id, slot, item_id) do update set qty = 1`, [uid, add]);
    }
    return h.size + add.length;
  };
  const stacks = async () => Number((await q(
    'select count(*) c from public.player_inventory where user_id=$1 and slot=0', [uid]))[0].c);

  return { db, q, asEngine, uid, mkChar, capOf, verOf, ladder, buyRung, buyRungs, apply, itemIds, freshIds, seedTo, stacks };
}

/** BANK_SPACE.BASE_CAP, read out of the monolith rather than restated here. */
async function legacyBaseCap() {
  const src = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');
  const m = src.match(/BASE_CAP:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  problems.length = 0;
  const A = await boot({ mutate });
  const base = await A.ladder(0);
  const legacyBase = await legacyBaseCap();

  // ── B1 · THE LADDER IS THE DATA'S ──────────────────────────────────────
  ok(base === START_CURRENCY.bankCap,
    `B1: hr_bank_cap_for_rungs(0) = ${base} but src/data/start-kit.js bankCap = ${START_CURRENCY.bankCap}. `
    + 'The server BASE must come from the generated catalogue, not from a number typed in SQL.');
  ok(legacyBase !== null && base === legacyBase,
    `B1: the server base cap ${base} disagrees with src/legacy.js BANK_SPACE.BASE_CAP ${legacyBase} — the `
    + 'client would draw a bag the server does not enforce.');
  const perRung = (await A.ladder(1)) - base;
  ok(perRung === BANK_STACKS_PER_RUNG,
    `B1: a rung is worth ${perRung} stacks server-side and ${BANK_STACKS_PER_RUNG} in `
    + 'src/data/gold-ladders.js BANK_STACKS_PER_RUNG. The client charges for the data number.');
  for (const n of [1, 2, 7, BANK_RUNGS]) {
    const got = await A.ladder(n);
    ok(got === base + n * BANK_STACKS_PER_RUNG,
      `B1: cap(${n} rungs) = ${got}, expected ${base + n * BANK_STACKS_PER_RUNG}`);
  }
  const ceiling = await A.ladder(BANK_RUNGS);
  ok((await A.ladder(BANK_RUNGS + 7)) === ceiling && (await A.ladder(2147483647)) === ceiling,
    `B1: a rung count above the ${BANK_RUNGS}-rung catalogue ceiling is not clamped — a forged or `
    + 'overflowed rung value would mint bank space the game does not sell.');
  ok((await A.ladder(-3)) === base, 'B1: a negative rung count does not floor at the base cap');
  ok(BANK_LADDER.length === BANK_RUNGS,
    `B1: the data ladder has ${BANK_LADDER.length} rungs but BANK_RUNGS says ${BANK_RUNGS}`);

  // ── B2 · THE REAL PURCHASE PATH RAISES THE ENFORCED CAP ────────────────
  const RUNGS = 3;
  const bought = await A.buyRungs(RUNGS);
  ok(bought.failedAt === null,
    `B2 CONTROL FAILED: hr_unlock_buy refused bank rung ${bought.failedAt}: ${JSON.stringify(bought.res)} — `
    + 'nothing below this line means anything if the purchase itself did not land.');
  const wanted = base + RUNGS * BANK_STACKS_PER_RUNG;
  const capAfter = await A.capOf(0);
  ok(capAfter === wanted,
    `B2: after buying ${RUNGS} rungs through hr_unlock_buy the AUTHORITY enforces bank_cap ${capAfter}, `
    + `not ${wanted}. This is SA-010: the gold left the account and the capability never arrived.`);
  const env = (await A.q('select public.hr_state_of($1::uuid, 0) as e', [A.uid]))[0].e;
  ok(Number(env?.state?.bank_cap) === capAfter,
    `B2: hr_state_of projects bank_cap ${env?.state?.bank_cap} while the authority enforces ${capAfter}. `
    + 'The client mirrors the projection, so a difference here is a bag the player is shown and refused.');

  // ── B3 · THE ENFORCEMENT BOUNDARY, THROUGH THE REAL hr_apply ───────────
  ok(A.itemIds.length > capAfter + 2,
    `B3: the item catalogue has ${A.itemIds.length} ids, not enough to fill a ${capAfter}-stack bank`);
  const seeded = await A.seedTo(capAfter - 2);
  ok(seeded === capAfter - 2, `B3 CONTROL: the bank was seeded to ${seeded}, not ${capAfter - 2} stacks`);
  const twoMore = await A.freshIds(2);
  const atCap = await A.apply({ [twoMore[0]]: 1, [twoMore[1]]: 1 });
  ok(atCap?.ok === true,
    `B3: hr_apply REFUSED an item delta that fills the bank to exactly the purchased cap `
    + `(${capAfter} stacks): ${JSON.stringify(atCap?.error ?? atCap)}. Sixty of those stacks were paid for.`);
  ok((await A.stacks()) === capAfter, `B3 CONTROL: the bank is not at ${capAfter} stacks after the fill`);
  const overCap = await A.apply({ [(await A.freshIds(1))[0]]: 1 });
  ok(overCap?.ok === false && overCap?.error === 'bank_full',
    `B3: the stack ABOVE the purchased cap was not refused bank_full: ${JSON.stringify(overCap)} — a cap `
    + 'that does not bite is not a cap.');

  // ── B4 · RAISE-ONLY ────────────────────────────────────────────────────
  await A.q('update public.player_state set bank_cap = 5000 where user_id=$1 and slot=0', [A.uid]);
  const r4 = await A.buyRung(RUNGS);
  ok(r4?.ok === true, `B4 CONTROL FAILED: rung ${RUNGS} was refused: ${JSON.stringify(r4)}`);
  ok((await A.capOf(0)) === 5000,
    `B4: a rung purchase LOWERED a grandfathered cap 5000 -> ${await A.capOf(0)}. The b227 grandfather and `
    + 'the cutover importer both mint caps above the ladder; pulling one down strands real items.');

  // ── B5 · SLOT ISOLATION ────────────────────────────────────────────────
  const slot1 = await A.capOf(1);
  ok(slot1 === base,
    `B5: slot 1 is at cap ${slot1} after slot 0 bought rungs (base ${base}) — bank space is per CHARACTER, `
    + 'and an account-wide raise is space nobody paid for.');

  // ── B7 · THE ACL ───────────────────────────────────────────────────────
  const acl = await A.q(`select r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as b
                           from pg_proc p, pg_namespace n, pg_roles r
                          where p.pronamespace = n.oid and n.nspname='public'
                            and p.proname in ('hr_bank_cap_for_rungs','hr_bank_cap_sync')
                            and r.rolname in ('anon','authenticated','service_role','hr_engine')`);
  ok(acl.length === 8, `B7: expected 8 (function, role) pairs, got ${acl.length} — both functions installed?`);
  for (const row of acl) {
    ok(row.b === false,
      `B7: role ${row.rolname} can execute a bank-cap internal (execute=${row.b}). It is a trigger and its `
      + 'helper, not an RPC — nothing outside the definer write path needs it.');
  }

  // ── B6 · THE BUG REPRODUCED, THEN THE BACKFILL ─────────────────────────
  const order = (await manifest()).order;
  const PRE = order[order.indexOf(MIG) - 1];
  if (!PRE) {
    problems.push('B6: could not find the migration before ' + MIG + ' in the apply order');
  } else {
    const B = await boot({ upTo: PRE });          // the chain WITHOUT the fix
    const preBought = await B.buyRungs(RUNGS);
    ok(preBought.failedAt === null,
      `B6 CONTROL FAILED: the pre-migration chain refused rung ${preBought.failedAt}`);
    const preCap = await B.capOf(0);
    ok(preCap === START_CURRENCY.bankCap,
      `B6 CONTROL: without the migration the cap should still be the base ${START_CURRENCY.bankCap} (the `
      + `bug); it is ${preCap}. If this fails the bug is being fixed somewhere else and B6 proves nothing.`);
    const preSeeded = await B.seedTo(preCap);
    ok(preSeeded === preCap, `B6 CONTROL: the pre-migration bank was seeded to ${preSeeded}, not ${preCap}`);
    const overId = (await B.freshIds(1))[0];
    const walled = await B.apply({ [overId]: 1 });
    ok(walled?.ok === false && walled?.error === 'bank_full',
      `B6 CONTROL: the pre-migration authority should refuse the ${preCap + 1}th stack — that IS SA-010. `
      + `Got ${JSON.stringify(walled)}`);

    await B.db.exec(await migrationText(mutate));  // …and now the fix, backfill and all

    const healed = await B.capOf(0);
    ok(healed === START_CURRENCY.bankCap + RUNGS * BANK_STACKS_PER_RUNG,
      `B6: the backfill left an EXISTING buyer at cap ${healed} instead of `
      + `${START_CURRENCY.bankCap + RUNGS * BANK_STACKS_PER_RUNG}. Every current player is in this case; a `
      + 'fix that only helps future purchases leaves the wall standing.');
    const below = Number((await B.q(`select count(*) c
        from public.player_state ps
        join public.player_progress pp
          on pp.user_id = ps.user_id and pp.slot = ps.slot
         and pp.kind='unlock' and pp.key='bank' and pp.period_key=''
       where ps.bank_cap < public.hr_bank_cap_for_rungs(greatest(0, least(pp.value, 2147483647))::int)`))[0].c);
    ok(below === 0, `B6: ${below} character row(s) are still below their rung-derived cap after the backfill`);
    const freed = await B.apply({ [overId]: 1 });
    ok(freed?.ok === true,
      `B6: the stack the pre-migration authority refused is STILL refused after the fix: `
      + `${JSON.stringify(freed?.error ?? freed)}`);
  }

  return [...problems];
}

export async function bankCapRungsGuard() {
  return run();
}

const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/bank-cap-rungs.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(34)} ${m.why}`);
    process.exit(0);
  }
  if (argv.includes('--selftest')) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let caught = false;
      try { caught = (await run(id)).length > 0; } catch (e) { caught = !e.harness; if (e.harness) console.error(e.message); }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad += 1; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  const probs = await run(mutateArg ? mutateArg.split('=')[1] : undefined);
  if (probs.length) {
    console.error(`bank-cap-rungs: ${probs.length} problem(s)\n`);
    for (const p of probs) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('bank-cap-rungs: green — the server ladder is the data\'s (base from the start kit, +'
    + `${BANK_STACKS_PER_RUNG}/rung, ${BANK_RUNGS}-rung ceiling), rungs bought through the real `
    + 'hr_unlock_buy raise the ENFORCED cap, hr_state_of projects that same number, hr_apply accepts to '
    + 'the cap and refuses bank_full only above it, a grandfathered cap is never lowered, slots are '
    + 'isolated, the internals are executable by nobody, and the backfill heals a database that already '
    + 'has the bug.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
