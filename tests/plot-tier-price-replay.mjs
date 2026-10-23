// ════════════════════════════════════════════════════════════════════════
// tests/plot-tier-price-replay.mjs — A PLOT TIER IS NEVER FREE AND NEVER
//                                    UNGATED, ON THE REPLAYED CHAIN.
//
// Security R1 (2026-10-15): the staged demolition farm catalogue truncated
// hr_plot_tier and refilled only (plot_level, deed_cost), so gold_cost fell to
// its default 0 and req_farm_level to 1 — and hr_farm_upgrade_plot, paying
// "gold first", sold every tier for 0 gold to a farming-1 character. The plain
// tests/plot-tier-parity.mjs reads the authored TEXT; this one replays the
// whole chain (staged files included) and drives the real RPC:
//
//   P1  a farming-1 character with a million gold is REFUSED tier 2
//       (farm_level_too_low), and nothing moves.
//   P2  at the tier-2 farming level the upgrade succeeds and debits EXACTLY
//       PLOT_TIER_PRICES[2].gold from player_state.gold, journalled as a
//       negative-gold player_ledger row.
//   P3  every tier 2..5 in hr_plot_tier equals src/core/farm.js
//       PLOT_TIER_PRICES (gold and farming level).
//
//   node tests/plot-tier-price-replay.mjs           the guard
//   node tests/plot-tier-price-replay.mjs --mutate  R1 restored (the price
//       columns fall back to their defaults after the refill), with the staged
//       file's own §4 short-circuited so THIS guard is what goes red.
//
// Chained from tests/plot-tier-parity.mjs (plain and --mutate).
// Exit: 0 green (or every mutant caught) · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';
import { accountGold, goldOf, setGold } from './_gold.mjs';
import { PLOT_TIER_PRICES } from '../src/core/farm.js';

const FARM = '2026-10-23-demolition-farm-catalogues.generated.sql';
const UID = '000000f3-0000-0000-0000-0000000000a1';
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const MUTANTS = [{
  name: 'R1: the refill names only deed_cost (gold 0 / farming 1 defaults)',
  patches: [
    ['truncate table public.hr_farm_yield_perk;',
     'update public.hr_plot_tier set gold_cost = default, req_farm_level = default;\ntruncate table public.hr_farm_yield_perk;'],
    ['  -- Every paid tier carries its gold price and farming gate (R1: never the defaults).\n',
     '  return;  -- MUTANT: the staged §4 is short-circuited so this guard is what must see R1\n'],
  ],
}];

async function asUser(db, sql, params) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${UID}', false)`);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role'); }
}

async function run(db) {
  const fails = [];
  const ok = (arm, c, m) => { if (!c) fails.push(`${arm}: ${m}`); };
  // P3
  const rows = (await db.query('select plot_level, gold_cost, req_farm_level from public.hr_plot_tier order by plot_level')).rows;
  for (const lv of Object.keys(PLOT_TIER_PRICES)) {
    const r = rows.find((x) => Number(x.plot_level) === Number(lv));
    const p = PLOT_TIER_PRICES[lv];
    ok('P3', r && Number(r.gold_cost) === p.gold && Number(r.req_farm_level) === p.farming,
      `tier ${lv} is ${r ? `${r.gold_cost} gold / farming ${r.req_farm_level}` : 'absent'}, authored ${p.gold} / ${p.farming}`);
  }
  // P1
  /* The plot tier is the ACCOUNT's on the chain end (2026-12-14-shared-farm.sql:
     account_farm, no row = tier 1); the mutants replay to FARM, where it is the hero's
     player_state.plot_level. The fixture follows the schema; the assertions do not move. */
  const shared = !!(await db.query(`select to_regclass('public.account_farm') as t`)).rows[0].t;
  /* and the gold is the ACCOUNT purse on the chain end (2026-12-15-account-gold.sql); the hero's before it */
  const qq = (sql, p) => db.query(sql, p).then((r) => r.rows);
  const purse = await accountGold(qq);
  const state = async () => {
    const r = (await db.query(shared
      ? 'select public.hr_farm_plot_level(user_id) as plot_level from public.player_state where user_id = $1 and slot = 0'
      : 'select plot_level from public.player_state where user_id = $1 and slot = 0', [UID])).rows[0];
    return r ? { ...r, gold: await goldOf(qq, UID, 0) } : r;
  };
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(purse
    ? `insert into public.player_state (user_id, slot, version) values ('${UID}', 0, 1)
                 on conflict (user_id, slot) do update set version = 1;
       delete from public.account_farm where user_id = '${UID}';`
    : shared
    ? `insert into public.player_state (user_id, slot, gold, version) values ('${UID}', 0, 1000000, 1)
                 on conflict (user_id, slot) do update set gold = 1000000, version = 1;
       delete from public.account_farm where user_id = '${UID}';`
    : `insert into public.player_state (user_id, slot, gold, version) values ('${UID}', 0, 1000000, 1)
                 on conflict (user_id, slot) do update set gold = 1000000, version = 1, plot_level = 1;`);
  if (purse) await setGold(qq, UID, 0, 1000000);
  const low = (await asUser(db, 'select public.hr_farm_upgrade_plot(0, $1::uuid, 2) as res', [uuid()])).res;
  ok('P1', low && low.ok === false && low.error === 'farm_level_too_low',
    `a farming-1 character bought tier 2: ${JSON.stringify(low)}`);
  const after1 = await state();
  ok('P1', Number(after1.gold) === 1000000 && Number(after1.plot_level) === 1, `a refused upgrade moved state: ${JSON.stringify(after1)}`);
  // P2
  const xp = (await db.query('select xp from public.hr_xp_table where level = $1', [PLOT_TIER_PRICES[2].farming])).rows[0];
  ok('P2', !!xp, `hr_xp_table has no row for farming ${PLOT_TIER_PRICES[2].farming}`);
  await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp) values ('${UID}', 0, 'farming', ${Number(xp ? xp.xp : 0)})
                 on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;`);
  const up = (await asUser(db, 'select public.hr_farm_upgrade_plot(0, $1::uuid, 2) as res', [uuid()])).res;
  ok('P2', up && up.ok === true, `the tier-2 upgrade at farming ${PLOT_TIER_PRICES[2].farming} was refused: ${JSON.stringify(up)}`);
  const after2 = await state();
  ok('P2', 1000000 - Number(after2.gold) === PLOT_TIER_PRICES[2].gold,
    `tier 2 cost ${1000000 - Number(after2.gold)} gold, authored ${PLOT_TIER_PRICES[2].gold}`);
  const led = (await db.query(`select gold from public.player_ledger where user_id = $1 and intent = 'farm_upgrade_plot'`, [UID])).rows;
  ok('P2', led.length === 1 && Number(led[0].gold) === -PLOT_TIER_PRICES[2].gold, `ledger rows ${JSON.stringify(led)}`);
  return fails;
}

if (process.argv.includes('--mutate')) {
  const clean = await run((await bootReplay()).db);
  if (clean.length) { console.error('plot-tier-price-replay --mutate: the clean tree is RED\n  ' + clean.join('\n  ')); process.exit(2); }
  let escaped = 0;
  for (const m of MUTANTS) {
    let fails;
    try { fails = await run((await bootReplay({ patches: new Map([[FARM, m.patches]]), upTo: FARM })).db); }
    catch (e) { console.error(`  x ${m.name}: the replay threw (${String(e.message).split('\n')[0]}) — the short-circuit did not take`); escaped++; continue; }
    if (fails.length) console.log(`  caught   ${m.name}\n    ${fails.join('\n    ')}`);
    else { console.error(`  x ESCAPED ${m.name}`); escaped++; }
  }
  if (escaped) process.exit(1);
  console.log('plot-tier-price-replay --mutate: every mutant caught');
} else {
  const fails = await run((await bootReplay()).db);
  if (fails.length) { console.error('plot-tier-price-replay: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('plot-tier-price-replay: green — tier 2 is refused at farming 1, costs its authored gold at the gate, '
    + 'and every tier matches PLOT_TIER_PRICES on the replayed chain');
}
