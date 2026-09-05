// ════════════════════════════════════════════════════════════════════════
// tests/dungeon-settle.mjs — hr_dungeon_settle, PROVEN ON A REAL DATABASE.
//
// The reported P1 (docs/design/dungeon-settlement.md §0): "Dungeon scrip gained
// through solo dungeons goes to 0 after doing dungeons" — because scrip was
// minted CLIENT-side and BLOB_RETIRED rebuilt the bag from the server envelope on
// reload, so the client-minted scrip vanished. The server fix (§1 + §2) makes
// scrip a player_state column credited by hr_dungeon_settle and PROJECTED by
// hr_state_of, so it is CARRIED in the envelope and survives a reload.
//
// This guard boots the REAL ordered migration chain (tests/schema-replay.mjs
// bootReplay — schema.sql + every migration in tests/schema-apply-order.json, on
// PGlite/WASM in process) and drives a real character through hr_dungeon_settle,
// asserting the load-bearing properties by EXECUTION rather than by reading SQL:
//
//   1. scrip is credited to player_state.dungeon_scrip AND SURVIVES a reload —
//      i.e. hr_state_of projects it into the envelope (THE ACTUAL BUG);
//   2. the run's loot is credited to player_inventory (so it too rides the
//      envelope and survives a reload);
//   3. the entry KEY is consumed from inventory;
//   4. a replayed intent id credits NOTHING a second time (idempotent);
//   5. a stale version is refused (version_conflict);
//   6. the per-day scrip EARN cap is enforced (daily_cap:scrip), before any key;
//   7. an underlevelled character is refused (level_locked);
//   8. a forged p_quality cannot inflate scrip beyond the server base band;
//   9. the per-day SETTLE-COUNT cap (250/UTC-day) is enforced (daily_cap:count);
//  10. the earn cap sums POSITIVE scrip only — a Quartermaster spend (negative
//      meta.scrip, op='qm_buy') does NOT reduce the earn usage (Condition-3, no
//      spend->earn->spend laundering).
//
// ── THE MUTATION PROOF (run: node tests/dungeon-settle.mjs --selftest) ─────
// Each entry plants a REAL defect in the migration SQL that this suite claims to
// catch; --selftest demands every one turns the run RED. A guard that cannot be
// made to fail is not a guard.
//
// Run GREEN:  node tests/dungeon-settle.mjs
// Prove RED:  node tests/dungeon-settle.mjs --selftest
//
// player_ledger is APPEND-ONLY (an immutability trigger refuses a delete inside
// the 90-day window), so each scenario uses its OWN user id rather than resetting
// one — a fresh id has no ledger, which is also closer to reality.
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';
import { xpForLevel } from '../src/core/xp.js';

// crypt_of_bones is the lowest-req dungeon (25) and costs a bone_key. big_bones
// drops at chance 1.0 (>=10), so it is a deterministic loot assertion.
const DUNGEON = 'crypt_of_bones';
const KEY = 'bone_key';
const SCRIP_BASE = 15;   // dungeonScripBase(25) = max(5, round(25*0.6)) = 15

const uidFor = (n) => `000000d7-0000-0000-0000-0000000000${n}`;

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────── */
const MUTATIONS = {
  scrip_not_credited: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the run is settled but player_state.dungeon_scrip is not credited — the currency never '
       + 'lands server-side, so the bug is unfixed',
    find: '       set dungeon_scrip = dungeon_scrip + v_scrip,',
    repl: '       set dungeon_scrip = dungeon_scrip + 0,',
  },
  scrip_not_projected: {
    file: '2026-09-10-dungeon-scrip.sql',
    why: 'THE ACTUAL BUG: hr_state_of stops projecting dungeon_scrip, so the credited scrip is not '
       + 'carried in the envelope and a reload rebuilds the bag without it — scrip goes to 0',
    find: "      ''dungeon_scrip'', v_st.dungeon_scrip,');",
    repl: "      '');",
  },
  key_not_consumed: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the entry key is not debited, so one farmed key runs the dungeon forever (the b214 class)',
    find: '    if v_have = 1 then\n      delete from public.player_inventory\n       where user_id = v_uid and slot = v_slot and item_id = v_key;',
    repl: '    if false then\n      delete from public.player_inventory\n       where user_id = v_uid and slot = v_slot and item_id = v_key;',
  },
  version_check_off: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'optimistic concurrency is gone — a caller acting on a stale read commits anyway',
    find: "    if p_version is null or p_version <> v_st.version then\n      perform public.hr_reject('version_conflict'",
    repl: "    if false then\n      perform public.hr_reject('version_conflict'",
  },
  quality_not_clamped: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the ONE client value is used unclamped, so a forged p_quality=999 mints 999x the scrip band',
    find: '    v_q := least(greatest(coalesce(p_quality, 1), 0), 1);',
    repl: '    v_q := coalesce(p_quality, 1);',
  },
  daily_cap_off: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the per-day scrip blast-radius fuse is disarmed',
    find: "    if v_today + v_scrip > c_daily_scrip_cap then\n      perform public.hr_reject('daily_cap'",
    repl: "    if false then\n      perform public.hr_reject('daily_cap'",
  },
  count_cap_off: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the per-day SETTLE-COUNT fuse (250/UTC-day, Designer ruling 2026-09-05) is disarmed — a '
       + 'replayed/looping client can settle unbounded times a day',
    find: "    if v_count_today >= c_daily_count_cap then\n      perform public.hr_reject('daily_cap'",
    repl: "    if false then\n      perform public.hr_reject('daily_cap'",
  },
  earn_cap_nets_spends: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the earn cap stops filtering positive scrip, so a Quartermaster spend (negative meta.scrip) '
       + 'NETS DOWN the earn usage — a spend->earn->spend loop launders the 5,000/day ceiling '
       + '(Designer ruling 2026-09-05, Condition-3)',
    find: "       and (meta->>'scrip')::bigint > 0\n       and public.hr_utc_day_key(at) = v_day;",
    repl: "       and public.hr_utc_day_key(at) = v_day;",
  },
  level_gate_off: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the req_lv gate is disarmed — a level-1 character clears a level-95 world boss',
    find: "    if v_clv < v_dun.req_lv then\n      perform public.hr_reject('level_locked'",
    repl: "    if false then\n      perform public.hr_reject('level_locked'",
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

/** Create a fresh, well-levelled, two-key character for `uid`. No ledger touch. */
async function seed(db, uid, { levelled = true, keys = 2 } = {}) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
                 values ('${uid}', 0, 0, 0, 0, 1)
                 on conflict (user_id, slot) do update set dungeon_scrip = 0, version = 1;`);
  if (levelled) {
    const xp99 = xpForLevel(99);   // combat level 126 → clears any req_lv
    for (const s of ['attack', 'strength', 'defense', 'hitpoints', 'prayer', 'ranged', 'magic']) {
      await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
                     values ('${uid}', 0, '${s}', ${xp99})
                     on conflict (user_id, slot, skill_id) do update set xp = ${xp99};`);
    }
  }
  if (keys > 0) {
    await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                   values ('${uid}', 0, '${KEY}', ${keys})
                   on conflict (user_id, slot, item_id) do update set qty = ${keys};`);
  }
}

/** Call hr_dungeon_settle AS THE ENGINE (the edge's set-role path), so p_user is
    honoured exactly as the deployed Edge Function calls it. */
async function settle(db, uid, { version, intent, mode = 'auto', quality = 1, dungeon = DUNGEON }) {
  await db.exec('set role hr_engine');
  try {
    const r = await db.query(
      'select public.hr_dungeon_settle($1::uuid,$2::int,$3::bigint,$4::uuid,$5::text,$6::text,$7::numeric) as res',
      [uid, 0, version, intent, dungeon, mode, quality]);
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
  // ── 1+2+3+4+5 on ONE character (happy → replay → version conflict). ────────
  const A = uidFor('a1');
  await seed(db, A);
  const vA = await versionOf(db, A);
  const iA = uuid();
  const r1 = await settle(db, A, { version: vA, intent: iA, mode: 'auto', quality: 1 });
  ok(r1 && r1.ok === true, `happy-path settle ok (got ${JSON.stringify(r1 && r1.error)})`);
  ok(r1.settled && Number(r1.settled.scrip) === SCRIP_BASE, `quality=1 scrip = base ${SCRIP_BASE} (got ${r1.settled && r1.settled.scrip})`);
  ok(await scripRow(db, A) === SCRIP_BASE, 'player_state.dungeon_scrip credited');
  ok(await scripEnvelope(db, A) === SCRIP_BASE, 'hr_state_of PROJECTS the credited scrip (survives reload — THE BUG)');
  ok(await invQty(db, A, KEY) === 1, `entry key consumed (2 -> 1, got ${await invQty(db, A, KEY)})`);
  ok(await invQty(db, A, 'big_bones') >= 10, `guaranteed loot credited to inventory (got ${await invQty(db, A, 'big_bones')})`);

  const r2 = await settle(db, A, { version: vA, intent: iA, mode: 'auto', quality: 1 });
  ok(r2 && r2.replayed === true, `replay marked replayed:true (got ${JSON.stringify(r2 && r2.error)})`);
  ok(await scripRow(db, A) === SCRIP_BASE, 'replay did NOT re-credit scrip');
  ok(await invQty(db, A, KEY) === 1, 'replay did NOT consume a second key');

  const rvc = await settle(db, A, { version: 999999, intent: uuid(), mode: 'auto' });
  ok(rvc && rvc.error === 'version_conflict', `stale version refused (got ${rvc && rvc.error})`);

  // ── 8. FORGED QUALITY (own character): p_quality=999 clamps to 1. ──────────
  const B = uidFor('b2');
  await seed(db, B);
  const rq = await settle(db, B, { version: await versionOf(db, B), intent: uuid(), mode: 'manual', quality: 999 });
  ok(rq && rq.ok === true, `forged-quality manual settle ok (got ${rq && rq.error})`);
  ok(rq.settled && Number(rq.settled.scrip) <= SCRIP_BASE, `forged p_quality=999 scrip <= base ${SCRIP_BASE} (got ${rq.settled && rq.settled.scrip})`);
  // and a NEGATIVE quality clamps to 0 (no negative scrip).
  const C = uidFor('b3');
  await seed(db, C);
  const rneg = await settle(db, C, { version: await versionOf(db, C), intent: uuid(), mode: 'manual', quality: -5 });
  ok(rneg && rneg.ok === true && Number(rneg.settled.scrip) === 0, `p_quality=-5 clamps to 0 scrip (got ${rneg && rneg.settled && rneg.settled.scrip})`);

  // ── 7. LEVEL LOCKED (fresh, unlevelled character). ────────────────────────
  const D = uidFor('c4');
  await seed(db, D, { levelled: false });
  const rll = await settle(db, D, { version: await versionOf(db, D), intent: uuid(), mode: 'auto' });
  ok(rll && rll.error === 'level_locked', `underlevelled refused level_locked (got ${rll && rll.error})`);

  // ── 6. DAILY CAP: a character whose ledger already used the whole cap today. ─
  const E = uidFor('d5');
  await seed(db, E);
  await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
                 values ('${E}', 0, 'dungeon', 'seed_cap', 0,0,0,0,0,
                         jsonb_build_object('dungeon','${DUNGEON}','mode','manual','scrip', 5000));`);
  const rcap = await settle(db, E, { version: await versionOf(db, E), intent: uuid(), mode: 'manual', quality: 1 });
  ok(rcap && rcap.error === 'daily_cap', `at-cap run refused daily_cap (got ${rcap && rcap.error})`);
  ok(rcap && rcap.dim === 'scrip', `scrip-cap refusal carries dim=scrip (got ${rcap && rcap.dim})`);
  ok(await invQty(db, E, KEY) === 2, 'a capped run consumed NO key (rejected before the debit)');

  // ── (9) SETTLE-COUNT CAP (Designer ruling 2026-09-05): 250 settles/UTC-day. ─
  //    250 prior op='settle' rows today, each 1 scrip (so the EARN cap is nowhere
  //    near — this isolates the COUNT fuse). The 251st is refused daily_cap:count.
  const F = uidFor('e6');
  await seed(db, F, { keys: 3 });
  await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
                 select '${F}', 0, 'dungeon', 'seed_count_'||g, 0,0,0,0,0,
                        jsonb_build_object('op','settle','dungeon','${DUNGEON}','mode','manual','scrip', 1)
                   from generate_series(1,250) g;`);
  const rcnt = await settle(db, F, { version: await versionOf(db, F), intent: uuid(), mode: 'manual', quality: 1 });
  ok(rcnt && rcnt.error === 'daily_cap', `251st settle refused daily_cap (got ${rcnt && rcnt.error})`);
  ok(rcnt && rcnt.dim === 'count', `count-cap refusal carries dim=count (got ${rcnt && rcnt.dim})`);
  ok(await invQty(db, F, KEY) === 3, 'a count-capped run consumed NO key (rejected before the debit)');

  // ── (10) EARN CAP EXCLUDES SPENDS (Condition-3): a Quartermaster spend row ──
  //    (op='qm_buy', NEGATIVE scrip) must NOT reduce the earn usage, or a
  //    spend->earn->spend loop launders the 5,000/day earn ceiling. At the cap
  //    (one op='settle' row of 5000) PLUS a -4000 spend, a new settle is STILL
  //    refused daily_cap:scrip — the spend freed no room.
  const H = uidFor('f7');
  await seed(db, H);
  await db.exec(`insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
                 values ('${H}', 0, 'dungeon', 'seed_earn', 0,0,0,0,0,
                         jsonb_build_object('op','settle','dungeon','${DUNGEON}','mode','manual','scrip', 5000)),
                        ('${H}', 0, 'dungeon', 'seed_spend', 0,0,0,0,0,
                         jsonb_build_object('op','qm_buy','offer','${KEY}','item','${KEY}','scrip', -4000));`);
  const rearn = await settle(db, H, { version: await versionOf(db, H), intent: uuid(), mode: 'manual', quality: 1 });
  ok(rearn && rearn.error === 'daily_cap' && rearn.dim === 'scrip',
     `earn cap counts POSITIVE scrip only — a -4000 spend does NOT free room (got ${rearn && rearn.error}/${rearn && rearn.dim})`);
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('dungeon-settle --selftest: each mutation must turn the guard RED');
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
  if (failed) { console.error(`\ndungeon-settle: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('dungeon-settle: all assertions passed (scrip credited + projected + survives, '
    + 'idempotent replay, version_conflict, forged-quality clamp, level_locked, scrip+count daily_cap, '
    + 'earn-cap excludes spends, key consumed).');
  process.exit(0);
}
