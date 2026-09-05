// ════════════════════════════════════════════════════════════════════════
// tests/quartermaster-buy.mjs — hr_quartermaster_buy, PROVEN ON A REAL DATABASE.
//
// The SPEND side of Dungeon Scrip (docs/design/dungeon-settlement.md §4,
// increment 3). Before it the Quartermaster was a CLIENT trade — `removeItem(
// 'dungeon_scrip')` + `addItem(item)` — neither leg known to the server, and the
// settle envelope half-undid it (the b372 "buy every blueprint, get the scrip
// back" bug). hr_quartermaster_buy makes the whole trade ONE server transaction:
// the client sends an offer id, the SERVER prices it from the client-unwritable
// hr_qm_offers, debits scrip and grants the item together or not at all.
//
// This guard boots the REAL ordered migration chain (bootReplay) and drives a
// real character through hr_quartermaster_buy, asserting by EXECUTION:
//
//   1. the price is the SERVER's — a purchase debits exactly hr_qm_offers.scrip_cost
//      (the client sends only an offer id; there is no price field to forge);
//   2. the item is granted (+1) and the scrip is debited in ONE transaction;
//   3. a replayed intent id debits NOTHING and grants NOTHING a second time
//      (idempotent / replay-safe) — the whole point of debit-once;
//   4. an unaffordable purchase is refused insufficient_scrip (no negative scrip);
//   5. a forged offer id is refused unknown_offer;
//   6. a stale version is refused (version_conflict);
//   7. the journal row is meta.op='qm_buy' with NEGATIVE meta.scrip (Condition-3:
//      the settle earn-cap can never net it in);
//   8. the per-day purchase fuse (250/UTC-day) refuses daily_cap.
//
// ── THE MUTATION PROOF (run: node tests/quartermaster-buy.mjs --selftest) ──
// Each entry plants a REAL defect this suite claims to catch; --selftest demands
// every one turns the run RED. A guard that cannot be made to fail is not a guard.
//
// Run GREEN:  node tests/quartermaster-buy.mjs
// Prove RED:  node tests/quartermaster-buy.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';

// bone_key is the cheapest offer (18 scrip) and a BoP key — a deterministic,
// tuning-independent purchase. The offer id is `qm.<item_id>` (§4: the dotted
// <namespace>.<row> convention the Edge OFFER_ID_RE requires).
const OFFER = 'qm.bone_key';
const ITEM = 'bone_key';
const COST = 18;   // hr_qm_offers.scrip_cost for bone_key (src/data/dungeons.js QM_STOCK)

const uidFor = (n) => `000000cf-0000-0000-0000-0000000000${n}`;

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────── */
const MUTATIONS = {
  price_not_debited: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: 'the item is granted but scrip is not debited — the Quartermaster is free',
    find: '       set dungeon_scrip = dungeon_scrip - v_off.scrip_cost,',
    repl: '       set dungeon_scrip = dungeon_scrip - 0,',
  },
  item_not_granted: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: 'scrip is debited but no item lands — the buyer pays for nothing (the b283 class)',
    find: '      values (v_uid, v_slot, v_off.item_id, 1)\n      on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;',
    repl: '      values (v_uid, v_slot, v_off.item_id, 0)\n      on conflict (user_id, slot, item_id) do update set qty = pi.qty + 0;',
  },
  replay_off: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: 'the idempotency replay branch is removed, so a resent intent id debits + grants AGAIN '
       + '(double-spend on a lost-response retry)',
    find: '  if v_cached is not null then\n    return public.hr_state_of(v_uid, v_slot) || v_cached || jsonb_build_object(\'replayed\', true);',
    repl: '  if false then\n    return public.hr_state_of(v_uid, v_slot) || v_cached || jsonb_build_object(\'replayed\', true);',
  },
  scrip_gate_off: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: 'the balance check is disarmed — a broke wallet buys anyway and goes NEGATIVE',
    find: "    if v_st.dungeon_scrip < v_off.scrip_cost then\n      perform public.hr_reject('insufficient_scrip'",
    repl: "    if false then\n      perform public.hr_reject('insufficient_scrip'",
  },
  version_check_off: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: 'optimistic concurrency is gone — a caller acting on a stale read commits anyway',
    find: "    if p_version is null or p_version <> v_st.version then\n      perform public.hr_reject('version_conflict'",
    repl: "    if false then\n      perform public.hr_reject('version_conflict'",
  },
  spend_row_positive: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: "the ledger records the spend with POSITIVE scrip (or op!='qm_buy'), so the settle's earn "
       + 'cap would count it as EARN — Condition-3 laundering restored',
    find: "       jsonb_build_object('op', 'qm_buy', 'offer', v_off.offer_id, 'item', v_off.item_id,\n                          'scrip', -v_off.scrip_cost, 'idem', p_intent_id));",
    repl: "       jsonb_build_object('op', 'qm_buy', 'offer', v_off.offer_id, 'item', v_off.item_id,\n                          'scrip', v_off.scrip_cost, 'idem', p_intent_id));",
  },
  buy_cap_off: {
    file: '2026-09-11-quartermaster-buy.sql',
    why: 'the per-day purchase fuse (250/UTC-day) is disarmed',
    find: "    if v_count_today >= c_daily_buy_cap then\n      perform public.hr_reject('daily_cap'",
    repl: "    if false then\n      perform public.hr_reject('daily_cap'",
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate) {
  const patches = mutate
    ? new Map([[MUTATIONS[mutate].file, [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  const { db } = await bootReplay(patches ? { patches } : {});
  return db;
}

/** A fresh character with `scrip` Dungeon Scrip and no ledger. */
async function seed(db, uid, scrip = 1000) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
                 values ('${uid}', 0, 0, 0, ${scrip}, 1)
                 on conflict (user_id, slot) do update set dungeon_scrip = ${scrip}, version = 1;`);
}

/** Call hr_quartermaster_buy AS THE ENGINE (the edge's set-role path). */
async function buy(db, uid, { version, intent, offer = OFFER }) {
  await db.exec('set role hr_engine');
  try {
    const r = await db.query(
      'select public.hr_quartermaster_buy($1::uuid,$2::int,$3::bigint,$4::uuid,$5::text) as res',
      [uid, 0, version, intent, offer]);
    return r.rows[0].res;
  } finally {
    await db.exec('reset role');
  }
}

const scripRow = async (db, uid) => Number((await db.query(
  `select dungeon_scrip from public.player_state where user_id=$1 and slot=0`, [uid])).rows[0].dungeon_scrip);
const scripEnvelope = async (db, uid) => {
  const env = (await db.query(`select public.hr_state_of($1::uuid, 0) as env`, [uid])).rows[0].env;
  return Number(env.state.dungeon_scrip);
};
const invQty = async (db, uid, id) => {
  const r = await db.query(
    `select coalesce(qty,0) as q from public.player_inventory where user_id=$1 and slot=0 and item_id=$2`, [uid, id]);
  return r.rows.length ? Number(r.rows[0].q) : 0;
};
const versionOf = async (db, uid) => Number((await db.query(
  `select version from public.player_state where user_id=$1 and slot=0`, [uid])).rows[0].version);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

async function runAll(db) {
  // ── 1+2+3+7: server-priced debit, item granted, replay-safe, negative ledger. ─
  const A = uidFor('a1');
  await seed(db, A, 1000);
  const vA = await versionOf(db, A);
  const iA = uuid();
  const r1 = await buy(db, A, { version: vA, intent: iA });
  ok(r1 && r1.ok === true, `happy-path buy ok (got ${JSON.stringify(r1 && r1.error)})`);
  ok(r1.bought && Number(r1.bought.scrip_spent) === COST, `receipt names server price ${COST} (got ${r1.bought && r1.bought.scrip_spent})`);
  ok(await scripRow(db, A) === 1000 - COST, `scrip debited by the SERVER price (1000 -> ${await scripRow(db, A)})`);
  ok(await scripEnvelope(db, A) === 1000 - COST, 'hr_state_of projects the debited balance (survives reload)');
  ok(await invQty(db, A, ITEM) === 1, `item granted (+1, got ${await invQty(db, A, ITEM)})`);

  // negative, op='qm_buy' ledger row (Condition-3 shape).
  const led = (await db.query(
    `select count(*)::int c from public.player_ledger where user_id=$1 and slot=0 and kind='dungeon'
       and meta->>'op'='qm_buy' and (meta->>'scrip')::bigint = ${-COST}`, [A])).rows[0].c;
  ok(Number(led) === 1, `one qm_buy ledger row with scrip=${-COST} (got ${led})`);

  // replay: same intent id, nothing moves.
  const r2 = await buy(db, A, { version: vA, intent: iA });
  ok(r2 && r2.replayed === true, `replay marked replayed:true (got ${JSON.stringify(r2 && r2.error)})`);
  ok(await scripRow(db, A) === 1000 - COST, 'replay did NOT debit again');
  ok(await invQty(db, A, ITEM) === 1, 'replay did NOT grant a second item');

  // ── 6: version conflict. ───────────────────────────────────────────────────
  const rvc = await buy(db, A, { version: 999999, intent: uuid() });
  ok(rvc && rvc.error === 'version_conflict', `stale version refused (got ${rvc && rvc.error})`);

  // ── 4: insufficient scrip (a broke wallet). ────────────────────────────────
  const B = uidFor('b2');
  await seed(db, B, 5);   // < 18
  const rlow = await buy(db, B, { version: await versionOf(db, B), intent: uuid() });
  ok(rlow && rlow.error === 'insufficient_scrip', `broke wallet refused insufficient_scrip (got ${rlow && rlow.error})`);
  ok(await scripRow(db, B) === 5, 'a refused buy debited nothing');
  ok(await invQty(db, B, ITEM) === 0, 'a refused buy granted nothing');

  // ── 5: forged offer id. ────────────────────────────────────────────────────
  const C = uidFor('c3');
  await seed(db, C, 1000);
  const rbad = await buy(db, C, { version: await versionOf(db, C), intent: uuid(), offer: 'not_a_real_offer' });
  ok(rbad && rbad.error === 'unknown_offer', `forged offer refused unknown_offer (got ${rbad && rbad.error})`);

  // ── 8: per-day purchase fuse (250/UTC-day). ────────────────────────────────
  const D = uidFor('d4');
  await seed(db, D, 100000);
  await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
                 select '${D}', 0, 'dungeon', 'seed_buy_'||g, 0,0,0,0,0,
                        jsonb_build_object('op','qm_buy','offer','${OFFER}','item','${ITEM}','scrip', ${-COST})
                   from generate_series(1,250) g;`);
  const rcap = await buy(db, D, { version: await versionOf(db, D), intent: uuid() });
  ok(rcap && rcap.error === 'daily_cap', `251st purchase refused daily_cap (got ${rcap && rcap.error})`);
  ok(await scripRow(db, D) === 100000, 'a capped buy debited nothing');
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('quartermaster-buy --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const saveFail = failed; failed = 0; let threw = false;
    try {
      const db = await boot(name);
      await runAll(db);
    } catch (e) {
      threw = true;
      console.log(`  ${name}: RED (threw / failed to apply: ${String(e.message).split('\n')[0]})`);
    }
    const wentRed = failed > 0 || threw;
    failed = saveFail;
    if (wentRed) { if (!threw) console.log(`  ${name}: RED (assertions failed) — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  if (bad) { console.error(`\n${bad} mutation(s) not caught — the guard is not proving what it claims.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  const db = await boot(null);
  await runAll(db);
  if (failed) { console.error(`\nquartermaster-buy: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('quartermaster-buy: all assertions passed (server-priced debit, item granted, replay-safe '
    + 'debit-once, insufficient_scrip, unknown_offer, version_conflict, negative qm_buy ledger row, daily_cap).');
  process.exit(0);
}
