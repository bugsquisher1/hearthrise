#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/unlock-offer-ownership.mjs — A CATALOGUE REFILL MAY ONLY DELETE ITS
//                                    OWN ROWS. Graded against real PostgreSQL.
//
//   node tests/unlock-offer-ownership.mjs             # the guard
//   node tests/unlock-offer-ownership.mjs --selftest  # the control must FAIL
//
// Ships with: tools/gen-unlock-offers.mjs + tools/gen-gold-ladders.mjs
//             (and the two generated migrations they emit).
//
// ── THE INCIDENT THIS EXISTS FOR (production, 2026-08) ──────────────────
// public.hr_unlock_offers is written by TWO generators:
//   · tools/gen-unlock-offers.mjs → 2026-08-16-unlock-offers.generated.sql
//     (94 shop/room/property offers), which refilled the table with a bare
//     `delete from public.hr_unlock_offers;`
//   · tools/gen-gold-ladders.mjs  → 2026-08-19-gold-spend-slices-2-3.sql
//     (48 offers: worker_hire · plot:farm_land · bank)
// The 08-19 file's own header WARNED, in prose, that "RE-APPLYING EITHER
// 2026-08-16 CATALOGUE ALONE WIPES THESE ROWS". It then happened: a regen of
// the shop catalogue deleted all 48 and every worker-hire, farm-land and bank
// purchase in the live game started answering `unknown_offer`. Three gold sinks
// went dark, with nothing in any log to explain it.
//
// A prose warning is not an interlock. Every row now carries the tool that OWNS
// it (`hr_unlock_offers.source`) and each generator deletes only its own. THIS
// FILE IS THE THING THAT NOTICES if that scoping is ever "simplified" away: it
// replays the real chain, then re-applies the shop catalogue ALONE — the exact
// operation that caused the incident — and requires all 48 to survive.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · That production has been repaired. Restoring the wiped rows is an APPLY
//     (re-run 2026-08-19-gold-spend-slices-2-3.sql); this guard only proves the
//     next regen cannot repeat the wipe.
//   · Anything about hr_unlocks. ⚠ THIS BULLET USED TO END "whose merge rows
//     are upserted rather than refilled and were therefore never at risk", AND
//     THAT WAS FALSE. 2026-08-16-unlocks.generated.sql opens ITS seed block with
//     an unscoped `delete from public.hr_unlocks;`, and the table this guard
//     exempted suffered the identical incident three days after this file was
//     written: the 2026-08-23 regen (b459, `trait:auto_eat_2`) destroyed the 17
//     non-shop companion rows 2026-08-22-companion-grant.sql had added, and
//     production ran 65 rows against a repo that rebuilds 82 until it was
//     measured on 2026-08-30. The retraction is kept rather than deleted,
//     because an exemption written into a guard is a CLAIM and this one was
//     never verified. hr_unlocks is now covered by
//     tests/unlock-catalogue-ownership.mjs.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const SHOP = '2026-08-16-unlock-offers.generated.sql';
const GOLD = '2026-08-19-gold-spend-slices-2-3.sql';
const GOLD_FAMILIES = ['worker_hire.', 'farm_land.', 'bank.'];
const EXPECT_GOLD = 48;
const EXPECT_SHOP = 94;

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* THE CONTROL. Reinstating the unscoped delete must make this guard RED — a
   guard that cannot demonstrate it sees the failure is decoration. */
const UNSCOPED_DELETE = [
  "delete from public.hr_unlock_offers where source = 'gen-unlock-offers';",
  'delete from public.hr_unlock_offers;',
];

async function run({ control = false } = {}) {
  const { db } = await bootReplay({ upTo: GOLD });
  const q = async (s) => (await db.query(s)).rows;
  const countLike = async (prefixes) => Number((await q(
    `select count(*)::text n from public.hr_unlock_offers where ${
      prefixes.map((p) => `offer_id like '${p}%'`).join(' or ')}`))[0].n);

  const before = await countLike(GOLD_FAMILIES);
  ok(before === EXPECT_GOLD,
    `FIXTURE: the ordered replay produced ${before} gold-ladder offers, expected ${EXPECT_GOLD} — `
    + 'nothing below means anything');

  // Ownership is real, and every row has an owner.
  const owners = Object.fromEntries((await q(
    'select source, count(*)::text n from public.hr_unlock_offers group by 1')).map((r) => [r.source, Number(r.n)]));
  ok(owners['gen-gold-ladders'] === EXPECT_GOLD,
    `OWNERSHIP: ${owners['gen-gold-ladders'] ?? 0} rows are owned by gen-gold-ladders, expected `
    + `${EXPECT_GOLD} — an untagged row is a row the next shop refill deletes`);
  ok(owners['gen-unlock-offers'] === EXPECT_SHOP,
    `OWNERSHIP: ${owners['gen-unlock-offers'] ?? 0} rows are owned by gen-unlock-offers, expected ${EXPECT_SHOP}`);

  // ── THE INCIDENT, REPLAYED: re-apply the shop catalogue ALONE ─────────
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', SHOP), 'utf8')).replace(/\r\n/g, '\n');
  if (control) {
    ok(sql.includes(UNSCOPED_DELETE[0]),
      `CONTROL: the scoped delete is not in ${SHOP} — the control cannot plant the defect`);
    sql = sql.replace(UNSCOPED_DELETE[0], UNSCOPED_DELETE[1]);
  }
  let applyError = null;
  try { await db.exec(`begin;\n${sql}\ncommit;`); }
  catch (e) { applyError = String(e.message || e).split('\n')[0]; await db.exec('rollback').catch(() => {}); }

  const after = await countLike(GOLD_FAMILIES);
  const shopAfter = Number((await q(
    "select count(*)::text n from public.hr_unlock_offers where source = 'gen-unlock-offers'"))[0].n);

  ok(after === EXPECT_GOLD,
    `THE INCIDENT: re-applying ${SHOP} alone left ${after} of ${EXPECT_GOLD} gold-ladder offers. `
    + 'A refill must delete only the rows it owns — worker_hire / farm_land / bank purchases all '
    + `become unknown_offer otherwise.${applyError ? ` (apply error: ${applyError})` : ''}`);
  ok(shopAfter === EXPECT_SHOP,
    `THE REFILL ITSELF: ${shopAfter} shop offers after the regen, expected ${EXPECT_SHOP} — the `
    + 'scoping must not stop the file refreshing its own rows');

  await db.close?.();
}

/**
 * The guard, as a function, so tests/run-smoke.mjs can call it the way it calls
 * clanDepositOwnershipGuard(). Returns the problem list; empty is green.
 */
export async function unlockOfferOwnershipGuard() {
  problems.length = 0;
  await run();
  return [...problems];
}

const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/unlock-offer-ownership.mjs');
if (RUN_DIRECTLY) {
const selftest = process.argv.includes('--selftest');
if (selftest) {
  await run({ control: true });
  if (problems.length) {
    console.log(`CAUGHT  unscoped_delete — ${problems.length} assertion(s) fired:`);
    for (const p of problems) console.log(`          ${p.split('.')[0]}`);
    console.log('\nthe control is caught; the guard can see the incident.');
    process.exit(0);
  }
  console.error('MISSED  unscoped_delete — the guard is BLIND to the exact production incident '
    + 'it was written for.');
  process.exit(1);
}

await run();
if (problems.length) {
  console.error(`unlock-offer-ownership: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('unlock-offer-ownership: green — each generator refills only the rows it owns; '
  + 're-applying the shop catalogue alone preserves all 48 gold-ladder offers.');
}
