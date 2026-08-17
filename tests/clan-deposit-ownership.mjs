#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/clan-deposit-ownership.mjs — THE CLAN STOREHOUSE'S POSSESSION CHECK,
//                                    GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/clan-deposit-ownership.mjs            # the guard
//   node tests/clan-deposit-ownership.mjs --list     # the mutation catalogue
//   node tests/clan-deposit-ownership.mjs --selftest # every mutation must be CAUGHT
//   node tests/clan-deposit-ownership.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-08-18-clan-deposit-ownership.sql.
//
// ── THE DEFECT THIS EXISTS FOR (Security review, b366 — P0) ─────────────
// `clan_deposit` checked the item against hr_castle_items, clamped it by gold
// value, applied the demand multiplier, journalled it to clan_ledger — and
// never once looked at whether the caller owned it. From a browser console:
//
//     select clan_deposit('<clan>', '{"keystone": 100000}'::jsonb);
//
// …deposits 100,000 Keystones the player does not have. Every consequence
// crosses to other players: clan_stores (the hold's shared materials),
// castle_tier (the gate on every building and the member cap), clan_members.cp
// (contribution ranking) and clans.standing (the clan_power leaderboard). The
// clamps bounded the RATE; a bound on free money is not a refusal.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then two REAL players through the
// REAL A9-wrapped RPC as `authenticated` with a JWT subject set. Inventory is
// never written by this file directly: every item the depositor owns arrives
// through `hr_apply` as `hr_engine`, which is how it arrives in production. A
// fixture that INSERTed into player_inventory would make every assertion below
// a statement about a row this test wrote.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend, so the `for update` on the
//     inventory row and the per-character advisory lock are asserted to be
//     PRESENT (statically, PART 1h of tests/run-sql-tests.mjs) and are exercised
//     serially here. Two simultaneous deposits are not reachable in this harness.
//   · The pooler, PostgREST, and the JWT itself.
//   · Production's ACL. §2(f)/(g) of the migration assert it at apply time.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-08-18-clan-deposit-ownership.sql';
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each one is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. `no_debit` is the P0 itself, replayed. */
const MUTATIONS = {
  no_debit: {
    why: 'THE P0 ITSELF: the ownership debit is deleted and the deposit is accepted on the '
       + 'client\'s word again, exactly as it was before b366',
    find: `      select qty into v_own from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = k for update;
      v_own := coalesce(v_own, 0);
      if v_own < v_qty then`,
    repl: `      select qty into v_own from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = k for update;
      v_own := coalesce(v_own, 0);
      if false then`,
  },
  refuse_by_return: {
    why: 'the short-row refusal RETURNS instead of raising. The return commits every row written '
       + 'by the earlier iterations, so a mixed batch half-transfers: the S2 defect class, with a '
       + 'value transfer attached',
    find: `        perform public.hr_reject('insufficient_item',
          jsonb_build_object('item_id', k, 'have', v_own, 'need', v_qty));`,
    repl: `        return jsonb_build_object('ok', false, 'error', 'insufficient_item',
          'detail', jsonb_build_object('item_id', k, 'have', v_own, 'need', v_qty));`,
  },
  debit_requested_not_stored: {
    why: 'the debit uses the UNCLAMPED request rather than what was actually stored, so the budget '
       + 'clamp becomes a way to charge a player for goods the hold never received',
    find: '      if v_own = v_qty then\n        delete from public.player_inventory',
    repl: '      if v_own = c_qty_clamp then\n        delete from public.player_inventory',
  },
  zero_row_left: {
    why: 'an exact-zero debit UPDATEs to 0 instead of deleting. player_inventory carries '
       + '`check (qty > 0)`, so the honest deposit that empties a stack raises 23514 and the whole '
       + 'Storehouse breaks for the one case it is used for most',
    find: `      if v_own = v_qty then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = k;
      else`,
    repl: `      if false then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = k;
      else`,
  },
  slot_from_nothing: {
    why: 'a caller with no server character is allowed through instead of refused. That is the '
       + 'Phase-2 transition gap reopened as a bypass: no player_state row means no inventory to '
       + 'debit, and the deposit lands free',
    find: `  if v_slot is null then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;`,
    repl: '  v_slot := coalesce(v_slot, 0);',
  },
};

const UUID = () => crypto.randomUUID();

/** One end-to-end run. Returns the observations PART 2 grades. */
async function run(mutate) {
  const patches = mutate
    ? new Map([[MIG, [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  const { db } = await bootReplay({ patches, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* ⚠ SESSION-SCOPED (`is_local = false`), NOT `set local`. PGlite runs each
     query in its own implicit transaction, so a transaction-local GUC is gone
     by the time the NEXT statement runs — auth.uid() reads NULL and every RPC
     answers `not_signed_in` while the fixture looks correct. Found by executing
     it. The role is set the same way and reset in a `finally`, because a throw
     between the two leaves the session as `authenticated`, which holds no table
     privileges and makes every later plain query fail as an unrelated 42501. */
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const asEngine = async (sql, p) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: two real players, one real hold ──────────────────────────
  const U = {};
  for (const tag of ['lead', 'mem']) {
    const id = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [id, `cdo-${tag}@probe.invalid`]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [id]);
    U[tag] = id;
    await gate();
    await asUser(id, 'select public.claim_display_name($1) as r', [`Cdo${tag}`]);
    await gate();
    const cr = await asUser(id, 'select public.hr_create_character(0) as r');
    ok(cr?.ok === true, `FIXTURE: hr_create_character refused for ${tag}: ${JSON.stringify(cr)}`);
  }
  await gate();
  const cc = await asUser(U.lead, 'select public.clan_create($1,$2) as r', ['Cdo Hold', 'open']);
  const CLAN = cc?.clan_id;
  ok(!!CLAN, 'FIXTURE: clan_create did not return a clan_id — nothing below means anything');
  await gate();
  await asUser(U.mem, 'select public.clan_join($1) as r', [CLAN]);
  ok(!!(await q('select 1 r from public.clan_members where clan_id=$1 and user_id=$2',
    [CLAN, U.mem]))[0], 'FIXTURE: the member never joined the hold');

  // The depositor's stock arrives THE SERVER'S OWN WAY.
  const versionOf = async () => Number((await q(
    'select version::text v from player_state where user_id=$1 and slot=0', [U.mem]))[0].v);
  const grant = async (items) => (await asEngine('select hr_apply($1,0,$2,$3,$4::jsonb) r', [
    U.mem, await versionOf(), UUID(),
    JSON.stringify({ items, journal: { kind: 'admin', intent: 'cdo_probe_grant' } }),
  ]))[0].r;
  const g = await grant({ timber_beam: 10, field_ration: 4 });
  ok(g?.ok !== false, `FIXTURE: hr_apply refused the stock grant (${g?.error})`);

  const invOf = async (id) => Number((await q(
    'select qty::text q from player_inventory where user_id=$1 and slot=0 and item_id=$2',
    [U.mem, id]))[0]?.q ?? 0);
  const storeOf = async (id) => Number((await q(
    'select qty::text q from clan_stores where clan_id=$1 and item_id=$2', [CLAN, id]))[0]?.q ?? 0);
  const ledgerRows = async () => Number((await q(
    "select count(*)::text c from clan_ledger where clan_id=$1 and kind='deposit'", [CLAN]))[0].c);
  const cpOf = async () => Number((await q(
    'select cp::text c from clan_members where clan_id=$1 and user_id=$2', [CLAN, U.mem]))[0].c);
  const deposit = async (items) => {
    await gate();
    return asUser(U.mem, 'select public.clan_deposit($1,$2) as r', [CLAN, JSON.stringify(items)]);
  };

  const obs = { inv0: await invOf('timber_beam'), ration0: await invOf('field_ration') };

  // ── D1. AN UNOWNED DEPOSIT IS REFUSED AND CHANGES NOTHING ─────────────
  // `keystone` is a real hr_castle_items row worth 3,000 gold each — i.e. the
  // most valuable thing the exploit could mint — and the depositor owns zero.
  const before = { store: await storeOf('keystone'), led: await ledgerRows(), cp: await cpOf() };
  obs.d1 = await deposit({ keystone: 100000 });
  obs.d1_store = await storeOf('keystone');
  obs.d1_led = await ledgerRows();
  obs.d1_cp = await cpOf();
  obs.d1_before = before;

  // ── D2. AN OWNED DEPOSIT DEBITS EXACTLY ───────────────────────────────
  const v_before = await versionOf();
  obs.d2 = await deposit({ timber_beam: 4 });
  obs.d2_inv = await invOf('timber_beam');
  obs.d2_store = await storeOf('timber_beam');
  obs.d2_version = await versionOf();
  obs.d2_v_before = v_before;

  // ── D3. A MIXED BATCH WITH ONE SHORT ROW ROLLS BACK WHOLE ─────────────
  // field_ration is owned (4) and would be stored; keystone is not. The refusal
  // must take the ration debit and the ration's clan_stores row with it.
  const b3 = {
    ration: await invOf('field_ration'),
    rationStore: await storeOf('field_ration'),
    keyStore: await storeOf('keystone'),
    led: await ledgerRows(),
    cp: await cpOf(),
  };
  obs.d3 = await deposit({ field_ration: 4, keystone: 1 });
  obs.d3_after = {
    ration: await invOf('field_ration'),
    rationStore: await storeOf('field_ration'),
    keyStore: await storeOf('keystone'),
    led: await ledgerRows(),
    cp: await cpOf(),
  };
  obs.d3_before = b3;

  // ── D4. AN EXACT-ZERO DEBIT DELETES THE ROW ───────────────────────────
  // player_inventory carries `check (qty > 0)`, so "deposit your whole stack"
  // is the case an UPDATE-to-zero breaks — and it is the common case.
  obs.d4 = await deposit({ field_ration: 4 });
  obs.d4_rows = Number((await q(
    "select count(*)::text c from player_inventory where user_id=$1 and slot=0 and item_id='field_ration'",
    [U.mem]))[0].c);
  obs.d4_store = await storeOf('field_ration');

  // ── D5. A NON-CATALOGUE ITEM STILL REFUSES, AND DEBITS NOTHING ────────
  // The pre-existing rule, re-asserted: it now runs through hr_reject, so a
  // regression would show up as a committed partial rather than as a refusal.
  await grant({ timber_beam: 3 });
  const b5 = await invOf('timber_beam');
  obs.d5 = await deposit({ timber_beam: 1, oak_plank: 5000 });
  obs.d5_inv = await invOf('timber_beam');
  obs.d5_before = b5;

  // ── D6. NO CHARACTER, NO DEPOSIT ──────────────────────────────────────
  // The leader has a character; strip it and the deposit must refuse rather
  // than fall through to an unchecked path. (The Phase-2 transition gap.)
  await q('delete from public.player_state where user_id=$1', [U.lead]);
  await gate();
  obs.d6 = await asUser(U.lead, 'select public.clan_deposit($1,$2) as r',
    [CLAN, JSON.stringify({ keystone: 5 })]);
  obs.d6_store = await storeOf('keystone');

  await db.close?.();
  return obs;
}

// ════════════════════════════════════════════════════════════════════════
// THE ASSERTIONS
// ════════════════════════════════════════════════════════════════════════
function grade(o) {
  // D1
  ok(o.d1?.ok === false, `D1: an unowned 100,000-Keystone deposit was ACCEPTED (${JSON.stringify(o.d1)}). `
    + 'That is the P0: 300,000,000 gold of shared materials minted from a console.');
  ok(o.d1?.error === 'insufficient_item',
    `D1: the refusal code is "${o.d1?.error}", not insufficient_item`);
  ok(o.d1_store === o.d1_before.store,
    `D1: clan_stores.keystone moved ${o.d1_before.store} -> ${o.d1_store} on a REFUSED deposit`);
  ok(o.d1_led === o.d1_before.led, 'D1: the refused deposit still wrote a clan_ledger row — which is '
    + 'also the table the per-day cap is read from');
  ok(o.d1_cp === o.d1_before.cp,
    `D1: contribution points moved ${o.d1_before.cp} -> ${o.d1_cp} on a REFUSED deposit`);

  // D2
  ok(o.d2?.ok === true, `D2: an OWNED deposit was refused (${JSON.stringify(o.d2)}) — the fix broke `
    + 'the feature, which is worse than the hole');
  ok(o.d2_inv === o.inv0 - 4,
    `D2: inventory went ${o.inv0} -> ${o.d2_inv}; depositing 4 must leave exactly ${o.inv0 - 4}`);
  ok(o.d2_store === 4, `D2: clan_stores.timber_beam is ${o.d2_store}, expected 4`);
  ok(o.d2?.debited?.timber_beam === 4,
    `D2: the envelope reports debited=${JSON.stringify(o.d2?.debited)}, expected {timber_beam:4}`);
  ok(o.d2_version > o.d2_v_before, `D2: player_state.version did not move (${o.d2_v_before} -> `
    + `${o.d2_version}). The inventory changed, so a delta computed against the old version must be `
    + 'refused — otherwise the client can hand the deposited stock straight back.');

  // D3
  ok(o.d3?.ok === false, `D3: a mixed batch with one short row was ACCEPTED (${JSON.stringify(o.d3)})`);
  ok(o.d3?.error === 'insufficient_item', `D3: refusal code is "${o.d3?.error}"`);
  ok(o.d3_after.ration === o.d3_before.ration, `D3: THE HALF-TRANSFER. field_ration was debited `
    + `${o.d3_before.ration} -> ${o.d3_after.ration} even though the batch was refused`);
  ok(o.d3_after.rationStore === o.d3_before.rationStore,
    `D3: clan_stores.field_ration moved ${o.d3_before.rationStore} -> ${o.d3_after.rationStore} on a `
    + 'refused batch — the good row committed before the bad one refused');
  ok(o.d3_after.keyStore === o.d3_before.keyStore, 'D3: clan_stores.keystone moved on a refused batch');
  ok(o.d3_after.led === o.d3_before.led, 'D3: a refused batch left clan_ledger rows behind');
  ok(o.d3_after.cp === o.d3_before.cp, 'D3: a refused batch credited contribution points');

  // D4
  ok(o.d4?.ok === true, `D4: depositing a WHOLE stack failed (${JSON.stringify(o.d4)}) — `
    + 'player_inventory checks qty > 0, so an exact-zero debit must DELETE the row, not update it');
  ok(o.d4_rows === 0, `D4: ${o.d4_rows} player_inventory row(s) survive at qty 0`);
  ok(o.d4_store === 4, `D4: clan_stores.field_ration is ${o.d4_store}, expected 4`);

  // D5
  ok(o.d5?.ok === false && o.d5?.error === 'not_castle_good',
    `D5: a non-catalogue item did not refuse not_castle_good (${JSON.stringify(o.d5)})`);
  ok(o.d5_inv === o.d5_before, `D5: the owned half of a not_castle_good batch was still debited `
    + `(${o.d5_before} -> ${o.d5_inv})`);

  // D6
  ok(o.d6?.ok === false && o.d6?.error === 'no_character',
    `D6: a caller with no server character was not refused no_character (${JSON.stringify(o.d6)})`);
  ok(o.d6_store === 0, 'D6: a caller with no character still moved clan_stores');
}

/** The smoke-suite entry point. Returns the problem list rather than exiting,
 *  which is the contract every other SQL guard in tests/run-smoke.mjs uses. */
export async function clanDepositOwnershipGuard() {
  problems.length = 0;
  try { grade(await run(null)); }
  catch (e) {
    problems.push(`the guard could not run: ${String(e.message || e).split('\n')[0]}`);
  }
  return [...problems];
}

// ── CLI ─────────────────────────────────────────────────────────────────
// ⚠ GATED. tests/run-smoke.mjs IMPORTS this module for the guard above, and an
//   ungated top-level `process.exit` would end the whole suite at the import.
if (process.argv[1]?.endsWith('clan-deposit-ownership.mjs')) {
  const arg = process.argv.find((a) => a.startsWith('--mutate='));
  if (process.argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    process.exit(0);
  }

  if (process.argv.includes('--selftest')) {
    let slipped = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let threw = null;
      try { grade(await run(id)); } catch (e) { threw = String(e.message || e).split('\n')[0]; }
      const caught = problems.length > 0 || threw;
      console.log(`  ${caught ? 'CAUGHT ' : 'SLIPPED'}  ${id}`
        + (threw ? `  (threw: ${threw})` : problems.length ? `  (${problems.length} assertion(s))` : ''));
      if (!caught) slipped++;
    }
    console.log(slipped ? `\n${slipped} mutation(s) SLIPPED — this guard is blind to them.`
      : '\nevery mutation was caught.');
    process.exit(slipped ? 1 : 0);
  }

  grade(await run(arg ? arg.split('=')[1] : null));
  if (problems.length) {
    console.error(`\nclan-deposit-ownership: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  FAIL  ${p}`);
    process.exit(1);
  }
  console.log('clan-deposit-ownership: green — the Storehouse debits the depositor, refuses what is '
    + 'not owned, and rolls a mixed batch back whole.');
}
