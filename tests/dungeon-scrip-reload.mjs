// ════════════════════════════════════════════════════════════════════════
// tests/dungeon-scrip-reload.mjs — REPORT #3 REGRESSION: SCRIP SURVIVES RELOAD.
//
// "Dungeon scrip goes to 0 after doing dungeons" (docs/design/dungeon-settlement.md
// §0). Root cause: scrip was minted CLIENT-side into G.inventory.dungeon_scrip, and
// under BLOB_RETIRED loadLocal rebuilds the bag from the SERVER envelope on reload —
// so a client-only mint vanished. The fix is a full round-trip:
//
//   hr_dungeon_settle credits player_state.dungeon_scrip  (SQL, increment 2)
//     → hr_state_of PROJECTS state.dungeon_scrip into the envelope  (SQL)
//       → src/net/dungeon-scrip-record.js reconcileScrip() reads it into
//         G.dungeonScrip on reload, and scripOf() returns it  (CLIENT)
//
// This guard drives that ENTIRE path on the real database (bootReplay) AND the real
// client record module (dungeon-scrip-record.js), simulating a reload as a FRESH G
// with NO dungeonScrip — exactly the state loadLocal rebuilds — and asserting the
// server value lands, NOT 0. It is the end-to-end proof the two other dungeon guards
// (SQL-only / client-only) do not each give on their own.
//
// Run GREEN:  node tests/dungeon-scrip-reload.mjs
// Prove RED:  node tests/dungeon-scrip-reload.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { bootReplay } from './schema-replay.mjs';
import { xpForLevel } from '../src/core/xp.js';
import {
  DUNGEON_SETTLE_ARM_ENABLED, isDungeonSettleArmed, __setDungeonSettleArm,
  scripOf, reconcileScrip,
} from '../src/net/dungeon-scrip-record.js';

const DUNGEON = 'crypt_of_bones';
const KEY = 'bone_key';
const SCRIP_BASE = 15;   // dungeonScripBase(25)
const uidFor = (n) => `000000c5-0000-0000-0000-0000000000${n}`;

// isDungeonSettleArmed() is `override && serverActive()`, and serverActive() reads
// window.HearthriseAccrue.isServerAccrualEnabled() — so the ARMED read path can only
// be true when server accrual is on (the live rollout state: arm on requires accrual
// on). We stub that window LOCALLY around the client-read block rather than globally,
// because PGlite (bootReplay) also probes `window` and a partial stub breaks it.
function withServerAccrual(fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = { HearthriseAccrue: { isServerAccrualEnabled: () => true } };
  try { return fn(); }
  finally { if (had) globalThis.window = prev; else delete globalThis.window; }
}

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Two SQL flips (the projection is the load-bearing half) + the guard's own
   in-process checks of the client read. */
const MUTATIONS = {
  scrip_not_projected: {
    file: '2026-09-10-dungeon-scrip.sql',
    why: 'THE ACTUAL BUG: hr_state_of stops projecting dungeon_scrip, so the envelope carries no '
       + 'scrip and a reload rebuilds G without it — scrip goes to 0',
    find: "      ''dungeon_scrip'', v_st.dungeon_scrip,');",
    repl: "      '');",
  },
  scrip_not_credited: {
    file: '2026-09-10-dungeon-settle.sql',
    why: 'the settle does not credit player_state.dungeon_scrip, so there is nothing for the reload to '
       + 'carry — the currency never lands server-side',
    find: '       set dungeon_scrip = dungeon_scrip + v_scrip,',
    repl: '       set dungeon_scrip = dungeon_scrip + 0,',
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

async function seed(db, uid) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
                 values ('${uid}', 0, 0, 0, 0, 1) on conflict (user_id, slot) do update set dungeon_scrip=0, version=1;`);
  const xp99 = xpForLevel(99);
  for (const s of ['attack', 'strength', 'defense', 'hitpoints', 'prayer', 'ranged', 'magic']) {
    await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp) values ('${uid}',0,'${s}',${xp99})
                   on conflict (user_id, slot, skill_id) do update set xp=${xp99};`);
  }
  await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty) values ('${uid}',0,'${KEY}',1)
                 on conflict (user_id, slot, item_id) do update set qty=1;`);
}

async function settle(db, uid, version, intent) {
  await db.exec('set role hr_engine');
  try {
    const r = await db.query(
      'select public.hr_dungeon_settle($1::uuid,0,$2::bigint,$3::uuid,$4::text,$5::text,$6::numeric) as res',
      [uid, version, intent, DUNGEON, 'auto', 1]);
    return r.rows[0].res;
  } finally { await db.exec('reset role'); }
}
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

async function runAll(db) {
  const A = uidFor('a1');
  await seed(db, A);
  const v = Number((await db.query(`select version from public.player_state where user_id=$1 and slot=0`, [A])).rows[0].version);
  const r = await settle(db, A, v, uuid());
  ok(r && r.ok === true, `settle ok (got ${JSON.stringify(r && r.error)})`);
  const credited = Number(r.settled && r.settled.scrip);
  ok(credited === SCRIP_BASE, `scrip credited = base ${SCRIP_BASE} (got ${credited})`);

  // THE RELOAD: the client gets a FRESH hr_state_of envelope (what loadLocal reads)
  // and a FRESH G with NO dungeonScrip (what the blob-retired rebuild produces).
  const env = (await db.query(`select public.hr_state_of($1::uuid, 0) as env`, [A])).rows[0].env;
  ok(env && env.state && Number(env.state.dungeon_scrip) === credited,
     `hr_state_of PROJECTS scrip into the envelope (got ${env && env.state && env.state.dungeon_scrip})`);

  withServerAccrual(() => {
    __setDungeonSettleArm(true);   // armed: read the server value (the rollout state)
    try {
      const G = { inventory: {} };   // a reloaded, blob-retired G — scrip is NOT in the bag
      ok(scripOf(G) === 0, 'before reconcile a fresh reloaded G has 0 scrip (nothing minted client-side)');
      const applied = reconcileScrip(G, env.state);
      ok(applied === credited, `reconcileScrip applied the server value (got ${applied})`);
      ok(G.dungeonScrip === credited, `G.dungeonScrip = ${credited} after reload — NOT 0 (report #3 fixed)`);
      ok(scripOf(G) === credited, `scripOf reads the survived balance ${credited} (got ${scripOf(G)})`);

      // fail-closed: a garbage wire value never clobbers a good balance to NaN/0.
      reconcileScrip(G, { dungeon_scrip: 'nope' });
      ok(G.dungeonScrip === credited, 'a NaN scrip on the wire is refused — balance is not lost');
      reconcileScrip(G, {});
      ok(G.dungeonScrip === credited, 'an envelope without dungeon_scrip leaves the balance untouched');
    } finally { __setDungeonSettleArm(null); }
  });

  // THE DARK SHIP: the arm ships OFF, so nothing changes byte-for-byte until the
  // Coordinator flips it. scripOf then reads the legacy inventory item.
  ok(DUNGEON_SETTLE_ARM_ENABLED === false, 'the arm MUST ship dormant (DUNGEON_SETTLE_ARM_ENABLED=false)');
  __setDungeonSettleArm(false);
  try {
    ok(isDungeonSettleArmed() === false, 'dormant: isDungeonSettleArmed() is false');
    const G = { inventory: { dungeon_scrip: 7 }, dungeonScrip: 999 };
    ok(scripOf(G) === 7, 'dormant: scripOf reads the legacy inventory item (byte-identical to today)');
    ok(reconcileScrip(G, { dungeon_scrip: 42 }) === null, 'dormant: reconcileScrip is a no-op');
    ok(G.dungeonScrip === 999, 'dormant: reconcileScrip did not touch G.dungeonScrip');
  } finally { __setDungeonSettleArm(null); }
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('dungeon-scrip-reload --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const saveFail = failed; failed = 0; let threw = false;
    try { const db = await boot(name); await runAll(db); }
    catch (e) { threw = true; console.log(`  ${name}: RED (threw: ${String(e.message).split('\n')[0]})`); }
    const wentRed = failed > 0 || threw; failed = saveFail;
    if (wentRed) { if (!threw) console.log(`  ${name}: RED (assertions failed) — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  if (bad) { console.error(`\n${bad} mutation(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  const db = await boot(null);
  await runAll(db);
  if (failed) { console.error(`\ndungeon-scrip-reload: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('dungeon-scrip-reload: scrip credited server-side, projected by hr_state_of, and READ back '
    + 'into G.dungeonScrip on a fresh reloaded G — report #3 (scrip -> 0 on reload) fixed. Arm ships dormant.');
  process.exit(0);
}
