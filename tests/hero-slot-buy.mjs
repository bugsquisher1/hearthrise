#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-slot-buy.mjs — FOUR HERO SLOTS FROM THE START, NOTHING FOR SALE, GRADED AGAINST REAL POSTGRESQL.
//   (Tyler 2026-11-21, executive decision: "just allow all 4 characters from the start"; FB-5 lane/c-first-hour;
//   supabase/migrations/1036-four-starter-slots.sql. The file keeps its name: it is the slot guard the build plan names.)
//
//   node tests/hero-slot-buy.mjs             the guard
//   node tests/hero-slot-buy.mjs --mutate    every planted defect must turn its own arm red
//
// The REAL chain into PGlite (tests/schema-replay.mjs), with a LIVE-SHAPED account planted before 1036 (it bought slot 1 under the
// old ladder for 300,000 gold and holds heroes in 0 and 1), then real players through the real RPCs.
//   HS-BIND  src/data/shops.js HERO_SLOTS ({ count, free }) is what the server holds: hr_hero_slots slots 1..count-1, every one a
//            starter at no cost, and count = the play-at-once cap; shops.js sells no character_slot row
//   HS-OWN   a NEW account owns every slot before its first hero; hr_account_view offers nothing, hero_slots_max = count
//   HS-MAKE  that account makes a hero in each slot through hr_create_hero; slot 4 and 5 are slot_not_owned, 6 bad_slot
//   HS-GONE  the purchase is gone: no hr_buy_hero_slot in the schema or on the client surface, no character_slot unlock row
//   HS-LIVE  the live-shaped account: its heroes byte for byte, its purse not refunded, all four slots owned
//
// mutant-anchors: supabase/migrations/1036-four-starter-slots.sql
// ════════════════════════════════════════════════════════════════════════
import { bootReplay, closeReplays } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { HERO_SLOTS, SHOP_OFFERS } from '../src/data/shops.js';

const MIG = '1036-four-starter-slots.sql';
const OLD = '00000000-0000-4000-8000-0000000f5001';
const NEW = '00000000-0000-4000-8000-0000000f5002';
/* Each mutant drops 1036's own §3 self-check, so it is this guard that must see the defect. */
const NO_SELF_CHECK = ['  -- (a) the catalogue: three starter rows at no cost; with slot 0 an account holds exactly as many heroes as may play at once.\n', '  return;\n'];

/* An account as production holds one: heroes in 0 and 1, slot 1 bought (the flag row), a purse. Planted before 1036 by its owner's
   own creation calls, so every row is what the chain makes. */
const PLANT = `
insert into auth.users (id) values ('${OLD}') on conflict do nothing;
insert into public.profiles (id) values ('${OLD}') on conflict do nothing;
insert into public.hr_access_allowlist (user_id, note) values ('${OLD}', 'hero-slot-buy live') on conflict do nothing;
select set_config('request.jwt.claim.sub', '${OLD}', false);
select public.hr_create_character(0);
insert into public.player_progress (user_id, slot, kind, key, value, period_key) values ('${OLD}', 0, 'flag', 'character_slot:1', 1, '');
select public.hr_create_character(1);
update public.account_wallet set gold = 12345 where user_id = '${OLD}';
create temp table zz_hsb_before as select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) as heroes from public.player_state ps where ps.user_id = '${OLD}';
select set_config('request.jwt.claim.sub', '', false);
`;

const one = async (db, sql, params = []) => { const r = await db.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : null; };
async function as(db, uid, sql, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  try { return await one(db, sql, params); } finally { await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}

export async function rules(db, before) {
  const fails = [];
  const arm = (id, cond, msg) => { if (!cond) fails.push(id + ' ' + msg); };
  /* HS-BIND */
  const rows = (await db.query('select slot_id, cost_gold, starter from public.hr_hero_slots order by slot_id')).rows;
  const want = Array.from({ length: HERO_SLOTS.count - 1 }, (_, i) => i + 1);
  arm('HS-BIND', HERO_SLOTS.free === true && JSON.stringify(rows.map((r) => r.slot_id)) === JSON.stringify(want)
    && rows.every((r) => r.starter === true && Number(r.cost_gold) === 0), 'the server holds ' + JSON.stringify(rows) + ' for ' + JSON.stringify(HERO_SLOTS));
  arm('HS-BIND', Number(await one(db, "select public.hr_hunt_limit('max_concurrent')")) === HERO_SLOTS.count, 'the play-at-once cap is not the slot count');
  arm('HS-BIND', !SHOP_OFFERS.some((o) => o && o.table === 'character_slot'), 'src/data/shops.js still sells a hero slot');
  /* HS-OWN, HS-MAKE */
  await db.query(`insert into auth.users (id) values ('${NEW}') on conflict do nothing`);
  await db.query(`insert into public.profiles (id) values ('${NEW}') on conflict do nothing`);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ('${NEW}', 'hero-slot-buy new') on conflict do nothing`);
  const all = JSON.stringify(Array.from({ length: HERO_SLOTS.count }, (_, i) => i));
  arm('HS-OWN', JSON.stringify(await one(db, 'select public.hr_hero_slots_of($1)', [NEW])) === all, 'a new account owns ' + JSON.stringify(await one(db, 'select public.hr_hero_slots_of($1)', [NEW])));
  const view = await one(db, 'select public.hr_account_view($1, 0)', [NEW]);
  arm('HS-OWN', view && view.hero_slot_offer === null && view.hero_slots_max === HERO_SLOTS.count, 'the account view reads ' + JSON.stringify(view));
  const sets = ['club', 'tank', 'healer', 'ranger'];
  for (let s = 0; s < HERO_SLOTS.count; s++) {
    const r = await as(db, NEW, "select public.hr_create_hero($1, $2, '{\"head\":0,\"body\":0,\"legs\":0,\"feet\":0}'::jsonb, gen_random_uuid(), $3)", [s, 'Slotprobe ' + 'abcd'[s], sets[s]]);
    arm('HS-MAKE', r && r.ok === true, 'a hero in slot ' + s + ' answered ' + JSON.stringify(r));
  }
  for (const [s, e] of [[4, 'slot_not_owned'], [5, 'slot_not_owned'], [6, 'bad_slot']]) {
    const r = await as(db, NEW, 'select public.hr_create_character($1)', [s]);
    arm('HS-MAKE', r && r.error === e, 'slot ' + s + ' answered ' + JSON.stringify(r) + ', want ' + e);
  }
  /* HS-GONE */
  arm('HS-GONE', !(await one(db, "select count(*)::int from pg_proc where proname in ('hr_buy_hero_slot', 'hr_buy_hero_slot__ungated')")), 'the purchase body is still in the schema');
  arm('HS-GONE', !(await one(db, "select count(*)::int from public.hr_client_rpc_baseline where proname = 'hr_buy_hero_slot'")), 'the purchase is still on the client surface');
  arm('HS-GONE', !(await one(db, "select count(*)::int from public.hr_unlocks where unlock_id like 'character_slot%'")), 'a character_slot unlock row is still derived');
  /* HS-LIVE */
  const after = await one(db, `select md5(string_agg(to_jsonb(ps)::text, '|' order by ps.slot)) from public.player_state ps where ps.user_id = $1`, [OLD]);
  arm('HS-LIVE', after === before.heroes, 'the live account\'s heroes moved');
  arm('HS-LIVE', Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [OLD])) === 12345, 'the live account\'s purse moved (no refund, no charge)');
  arm('HS-LIVE', JSON.stringify(await one(db, 'select public.hr_hero_slots_of($1)', [OLD])) === all, 'the live account does not own all four slots');
  return fails;
}

async function boot(patches) {
  const r = await bootReplay(Object.assign({ seedBefore: new Map([[MIG, PLANT]]) },
    patches ? { patches: new Map([[MIG, patches]]), fullChain: 'the later files of FB-5 (1037-1039) read hr_hero_slots and must still apply' } : {}));
  const db = r.db || r;
  const before = { heroes: await one(db, 'select heroes from zz_hsb_before') };
  return { db, before };
}

const MUTANTS = [
  /* a starter that keeps its price: every account still owns it (so no other file refuses), and only the binding sees the price */
  ['a free slot keeps its old price (HS-BIND)', [NO_SELF_CHECK, ['     set starter = true, cost_gold = 0', '     set starter = true']], 'HS-BIND'],
  ['the purchase stays on the client surface (HS-GONE)', [NO_SELF_CHECK, ["delete from public.hr_client_rpc_baseline where proname = 'hr_buy_hero_slot';\n", '']], 'HS-GONE'],
  ['the free slots refund the gold paid (HS-LIVE)', [NO_SELF_CHECK, ['-- ── §2 THE PURCHASE LEAVES ─', "update public.account_wallet set gold = gold + 300000 where user_id in (select user_id from public.player_progress where key like 'character_slot:%');\n-- ── §2 THE PURCHASE LEAVES ─"]], 'HS-LIVE'],
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [name, patch, expect] of MUTANTS) {
      let fails;
      try { const { db, before } = await boot(patch); fails = await rules(db, before); }
      catch (e) { if (e && e.harness) throw e; fails = ['replay: ' + String(e && e.message).split('\n')[0]]; }
      await closeReplays();
      const caught = fails.some((f) => f.startsWith(expect));
      console.log((caught ? '  ✓ ' : '  ✗ MISSED ') + name + (caught ? '' : ' (' + fails.join(' | ') + ')'));
      if (!caught) missed++;
    }
    console.log(missed ? 'hero-slot-buy --mutate: ' + missed + ' MISSED' : 'hero-slot-buy --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught, each by its own arm');
    process.exit(missed ? 1 : 0);
  }
  const { db, before } = await boot(null);
  const fails = await rules(db, before);
  await closeReplays();
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'hero-slot-buy: RED, ' + fails.length + ' finding(s)' : 'hero-slot-buy: four hero slots from the start, nothing for sale, the live account untouched');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) await main();
