#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/vigour.mjs — THE DAILY BUDGET, THE GOLD SINK, AND THE CEILING GOLD
//                    CANNOT BUY.
//
//   node tests/vigour.mjs             # the guard
//   node tests/vigour.mjs --list      # the mutation catalogue
//   node tests/vigour.mjs --selftest  # every mutation must be CAUGHT
//   node tests/vigour.mjs --mutate=<id>
//
// Ships with: src/core/hunt.js · supabase/migrations/2026-09-22-vigour-daily.sql
//             supabase/migrations/2026-09-22-vigour-refill.sql
//
// ── WHAT IT DRIVES, AND WHERE ───────────────────────────────────────────
// V1-V3 are the ARITHMETIC, in process, against src/core/hunt.js.
// V4-V8 are the MONEY, driven against a REAL PostgreSQL rebuilt from the whole
// migration chain by PGlite (no Docker, no credentials, production untouched):
// the refill is bought through the REAL RPC, and every refusal, debit, replay
// and clamp is the one a client would meet.
//
// ── THE THREE PROPERTIES ────────────────────────────────────────────────
//  1. THE BUDGET IS DERIVED, NOT STORED (design §4.1). It is the character's own
//     offline cap in minutes floored at 720, so nobody loses time they can
//     already earn today and the renown/property perks that extend offline time
//     extend the hunt budget too. A stored grant drifts from the perks it came
//     from the first time a player earns a rung.
//  2. THE CEILING IS WHAT STOPS THIS BEING A FAUCET FOR THE RICH (design §4.4).
//     Two hours a day gold CANNOT buy is what keeps "richest player hunts most"
//     from becoming "richest player hunts always". Five refills must not reach
//     it and a sixth must not be sold.
//  3. GOLD ONLY, FOREVER (design §4.4, settled). Selling away-accrual hours for
//     cash is pay-to-win on a ranked economy — the ruling that removed Offline+
//     is the same ruling, and a gem price under a new noun is the same product.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, ROOT } from './schema-replay.mjs';
import {
  vigourGrantMin, vigourBudgetMin, vigourSplit, vigourMult, vigourChargeMin,
  VIGOUR_FLOOR_MIN, VIGOUR_CEILING_MIN, VIGOUR_REFILL_MIN, VIGOUR_MAX_REFILLS,
  VIGOUR_DRY_MULT, VIGOUR_PROGRESS_KEY,
} from '../src/core/hunt.js';
import { AMMO_DRY_MULT } from '../src/core/ammo.js';

const REFILL = '2026-09-22-vigour-refill.sql';
const DAILY = '2026-09-22-vigour-daily.sql';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const MUTATIONS = {
  refill_ignores_day_clamp: 'Remove the per-day refill cap from hr_vigour_refill (design §4.4).',
  refill_past_ceiling: 'Sell a refill at the 22h ceiling instead of refusing it — gold for zero minutes.',
  refill_free_on_replay: 'Let a replayed idempotency key debit again (a double-tap charges twice).',
  budget_ignores_ceiling: 'Drop the 22h ceiling from hr_vigour_of so gold can buy the whole day.',
};

/** The mutations are TEXTUAL patches on the real migrations, so a planted defect
    is defect-in-the-shipped-file and not a moved goalpost. schema-replay asserts
    each anchor matches exactly once, so a mutation can never silently no-op. */
/* ── SHORT-CIRCUITING THE MIGRATIONS' OWN §-GATES, FOR MUTATED RUNS ONLY ──
   Both files carry self-verifying commit gates that REFUSE TO INSTALL a broken
   body. They are the strongest catch there is and they stay armed on every real
   apply — but they run ONCE, at apply time, and they would answer every
   mutation below before this guard's assertions ever ran. A "caught" that is
   really "the migration would not install" proves nothing about THIS file, and
   the regression that must still be caught in a year is a later migration that
   restates a body from a stale template and never re-runs the gate. So a
   mutated run neuters them and the assertions here do the catching alone —
   exactly what tests/bank-cap-rungs.mjs does, for the same stated reason. */
const SHORT_CIRCUIT = [
  [REFILL, [['begin\n  select regexp_replace(p.prosrc,', 'begin\n  return;\n  select regexp_replace(p.prosrc,']]],
  [DAILY, [['begin\n  -- (a) THE GRANT IS DERIVED', 'begin\n  return;\n  -- (a) THE GRANT IS DERIVED']]],
];

const withShortCircuit = (m) => {
  const out = new Map(SHORT_CIRCUIT.map(([f, l]) => [f, l.slice()]));
  for (const [f, l] of m) out.set(f, (out.get(f) || []).concat(l));
  return out;
};

const patchesFor = (mutate) => {
  switch (mutate) {
    case 'refill_ignores_day_clamp':
      /* ⚠ THE MUTATION TARGETS `v_nth` ITSELF, NOT THE `v_nth > v_cap` BRANCH,
           AND THE REASON IS A REAL FINDING THIS GUARD MADE.
         TWO controls in the verb refuse with `vigour_daily_cap`: the explicit
         comparison, and the catalogue lookup that finds no row for an nth past
         the ladder. Deleting the first leaves the second holding, so a guard
         aimed at the comparison reports "caught" while proving only that a
         REDUNDANT control exists. Pinning `v_nth` to 1 defeats BOTH — every
         refill looks like the first, the cheapest rung is always found, and the
         day cap becomes an unlimited faucet at 2,000 gold a go. That is the
         defect the cap exists to prevent, so that is what the mutation plants.
         The redundancy is fine and deliberate (the catalogue's ROW COUNT is the
         cap by design); what is not fine is a guard that cannot tell. */
      return withShortCircuit(new Map([[REFILL, [[
        "  v_nth := coalesce((v_vig->>'refills')::int, 0) + 1;",
        '  v_nth := 1;',
      ]]]]));
    case 'refill_past_ceiling':
      return withShortCircuit(new Map([[REFILL, [[
        "  if coalesce((v_vig->>'budget_min')::int, 0) >= coalesce((v_vig->>'ceiling_min')::int, 0) then",
        '  if false then',
      ]]]]));
    case 'refill_free_on_replay':
      return withShortCircuit(new Map([[REFILL, [[
        '  if v_cached ->> \'error\' = \'intent_mismatch\' then return v_cached; end if;\n'
        + '  if v_cached is not null then return v_cached || jsonb_build_object(\'replayed\', true); end if;',
        '  if v_cached ->> \'error\' = \'intent_mismatch\' then return v_cached; end if;',
      ]]]]));
    case 'budget_ignores_ceiling':
      return withShortCircuit(new Map([[DAILY, [[
        '  v_budget := least(c_ceiling_min, v_grant + v_bought);',
        '  v_budget := v_grant + v_bought;',
      ]]]]));
    default: return undefined;
  }
};

const PROBE = '00000000-0000-4000-8000-0000b5510b01';

async function run(mutate) {
  // ── V1. THE DERIVATION, AND ITS FLOOR ──────────────────────────────────
  ok(vigourGrantMin(0) === VIGOUR_FLOOR_MIN,
    `V1: a character with no offline cap got ${vigourGrantMin(0)} min, not the ${VIGOUR_FLOOR_MIN} floor. `
    + 'The floor is what makes "nobody loses what they can already earn today" true.');
  ok(vigourGrantMin(12 * 3600000) === 720,
    'V1: the shipped 12 h offline cap must derive exactly 720 minutes.');
  ok(vigourGrantMin(16 * 3600000) === 960,
    'V1: a 16 h cap (renown + property) must extend the hunt budget too — that is the whole reason '
    + 'the grant is DERIVED rather than a second ladder.');

  // ── V2. THE CEILING IS A FUSE, NOT BALANCE ─────────────────────────────
  const maxed = vigourBudgetMin({ offlineCapMs: 24 * 3600000, refills: VIGOUR_MAX_REFILLS });
  ok(maxed <= VIGOUR_CEILING_MIN,
    `V2: the largest legal budget is ${maxed} min, past the ${VIGOUR_CEILING_MIN}-minute ceiling. `
    + 'Two hours a day gold cannot buy is what keeps "richest player hunts most" from becoming '
    + '"richest player hunts always".');
  ok(vigourBudgetMin({ offlineCapMs: 12 * 3600000, refills: 99 })
     === Math.min(VIGOUR_CEILING_MIN, 720 + VIGOUR_MAX_REFILLS * VIGOUR_REFILL_MIN),
    'V2: 99 refills were not clamped to the per-day maximum on READ.');

  // ── V3. DRY MEANS A QUARTER, AND IT MEANS THE SAME QUARTER TWICE ───────
  ok(VIGOUR_DRY_MULT === AMMO_DRY_MULT,
    `V3: VIGOUR_DRY_MULT (${VIGOUR_DRY_MULT}) has drifted from AMMO_DRY_MULT (${AMMO_DRY_MULT}). The `
    + 'designer chose it so a player who learns "dry means a quarter" learns it once and it is true '
    + 'twice; two constants that agree today are two constants.');
  const whole = vigourSplit({ spentMin: 0, budgetMin: 720, windowMs: 3600000 });
  ok(whole.dryMs === 0 && whole.fullMs === 3600000,
    'V3: a window entirely inside the budget was split as though part of it was dry.');
  const none = vigourSplit({ spentMin: 720, budgetMin: 720, windowMs: 3600000 });
  ok(none.fullMs === 0 && none.dryMs === 3600000,
    'V3: a window entirely past the budget was split as though part of it paid full.');
  ok(vigourMult({ spentMin: 720, budgetMin: 720, windowMs: 3600000 }) === VIGOUR_DRY_MULT,
    'V3: a fully tired window did not pay exactly the dry multiplier.');
  ok(vigourMult({ spentMin: 0, budgetMin: 720, windowMs: 3600000 }) === 1,
    'V3: a window inside the budget did not pay full rate.');
  // Half in, half out: (30 + 30 x 0.25) / 60.
  const half = vigourMult({ spentMin: 690, budgetMin: 720, windowMs: 3600000 });
  ok(Math.abs(half - ((30 + 30 * VIGOUR_DRY_MULT) / 60)) < 1e-12,
    `V3: a half-tired window paid ${half}; the time-weighted blend is the only form that is the `
    + 'same number attended and away without re-simulating the span (AWAY-12 forbids a second path).');
  // RUNNING OUT NEVER STOPS YOU (design §4.3) — the multiplier floors at the dry
  // rate and never reaches zero, however far past the budget the night ran.
  ok(vigourMult({ spentMin: 10 ** 9, budgetMin: 720, windowMs: 3600000 }) === VIGOUR_DRY_MULT,
    'V3: a night far past the budget paid less than the dry rate. A hard stop charges a player for '
    + 'sleeping, which this game has already done once.');
  ok(vigourChargeMin(59999) === 0 && vigourChargeMin(60000) === 1,
    'V3: the charge is whole minutes, floored — a sub-minute window charges nothing.');

  // ── V4. GOLD ONLY, AND NO PRICE LIVES IN THE VERB ──────────────────────
  const refillSrc = await readFile(join(ROOT, 'supabase/migrations', REFILL), 'utf8');
  const body = refillSrc.slice(refillSrc.indexOf('hr_vigour_refill__ungated(p_slot int, p_idem uuid)'),
    refillSrc.indexOf('-- ── 4. The gated wrapper'));
  const exec = body.replace(/--[^\n]*/g, '');
  ok(!/[^0-9a-zA-Z_]\d{3,}/.test(exec),
    'V4: hr_vigour_refill__ungated contains a 3+ digit literal outside a comment. The price must '
    + 'come only from hr_vigour_prices so Tyler\'s ruling (design §4.6) is an UPDATE under review '
    + 'and not a code change.');
  ok(!/\b(gems|hearth_tokens|dungeon_scrip|marks)\b/.test(exec.replace(/gems_in/g, '')),
    'V4: the refill verb names a currency that is not gold. Gems and Hearth Tokens may NEVER buy '
    + 'hunting time — selling away-accrual hours for cash is pay-to-win on a ranked economy.');

  // ── V5-V8. THE REAL RPC, ON A REAL DATABASE ────────────────────────────
  const { db } = await bootReplay({ patches: patchesFor(mutate) });
  const q = async (sql, args) => (await db.query(sql, args)).rows;
  const as = async (sql, args) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [PROBE]);
    return q(sql, args);
  };
  await db.query('insert into auth.users (id) values ($1)', [PROBE]);
  await as('select public.hr_create_character(0)');
  const ladder = (await q('select nth, cost_gold from public.hr_vigour_prices order by nth'))
    .map((r) => ({ nth: Number(r.nth), cost: BigInt(r.cost_gold) }));
  ok(ladder.length === VIGOUR_MAX_REFILLS,
    `V5: the catalogue holds ${ladder.length} rungs but src/core/hunt.js publishes a cap of `
    + `${VIGOUR_MAX_REFILLS}. The ROW COUNT is the per-day cap, so the two must be one number.`);
  for (let i = 1; i < ladder.length; i++) {
    ok(ladder[i].cost > ladder[i - 1].cost,
      `V5: rung ${ladder[i].nth} is not dearer than rung ${ladder[i].nth - 1}. A flat curve becomes `
      + 'a fixed daily tax the wealthy stop noticing by week two.');
  }

  // THE MIRROR: the SQL meter and the JS arithmetic are one rule.
  const meter0 = (await q('select public.hr_vigour_of($1, 0) as v', [PROBE]))[0].v;
  const capMs = Number((await q('select public.hr_offline_cap_ms($1, 0) as c', [PROBE]))[0].c);
  ok(Number(meter0.grant_min) === vigourGrantMin(capMs),
    `V6: hr_vigour_of derived a ${meter0.grant_min}-minute grant; src/core/hunt.js derives `
    + `${vigourGrantMin(capMs)} from the same offline cap. The engine pays against one and the `
    + 'panel shows the other.');
  ok(Number(meter0.budget_min) === vigourBudgetMin({ offlineCapMs: capMs, refills: 0 }),
    'V6: the SQL budget and the JS budget disagree on an unspent day.');
  ok(Number(meter0.spent_min) === 0 && Number(meter0.refills) === 0,
    'V6: a fresh character is not at zero.');

  // V7. BUY THE WHOLE LADDER. Gold placed on the row directly — a synthetic
  //     probe, not a player, so no faucet is exercised.
  await db.query('update public.player_state set gold = 100000000 where user_id = $1', [PROBE]);
  let sold = 0;
  for (let i = 0; i < VIGOUR_MAX_REFILLS; i++) {
    const before = BigInt((await q('select gold from public.player_state where user_id=$1', [PROBE]))[0].gold);
    const r = (await as('select public.hr_vigour_refill__ungated(0, gen_random_uuid()) as r'))[0].r;
    if (r.ok !== true) break;
    sold++;
    const after = BigInt((await q('select gold from public.player_state where user_id=$1', [PROBE]))[0].gold);
    ok(before - after === ladder[i].cost,
      `V7: rung ${i + 1} debited ${before - after} gold; the catalogue says ${ladder[i].cost}.`);
  }
  ok(sold === VIGOUR_MAX_REFILLS,
    `V7: only ${sold} of ${VIGOUR_MAX_REFILLS} rungs could be bought with gold to spare.`);

  // V8. THE (max+1)th IS REFUSED, AND IT TAKES NOTHING.
  const goldBefore = BigInt((await q('select gold from public.player_state where user_id=$1', [PROBE]))[0].gold);
  const extra = (await as('select public.hr_vigour_refill__ungated(0, gen_random_uuid()) as r'))[0].r;
  const meterN0 = (await q('select public.hr_vigour_of($1, 0) as v', [PROBE]))[0].v.refills;
  const goldAfter = BigInt((await q('select gold from public.player_state where user_id=$1', [PROBE]))[0].gold);
  ok(extra.ok !== true,
    `V8: a ${VIGOUR_MAX_REFILLS + 1}th refill was SOLD. The per-day cap is the only thing between `
    + 'a wealthy player and an unbounded daily purchase of hunting hours.');
  /* ⚠ THE REASON IS ASSERTED, NOT JUST THE REFUSAL, AND THAT IS THE ARM THAT
       WORKS. At the floor grant the budget saturates the ceiling exactly
       (720 + 5 x 120 = 1,320 = 22 h), so with the day cap DELETED the ceiling
       refuses the sixth sale instead and the gold and sale COUNT are identical
       either way — the first draft of this guard passed the
       `refill_ignores_day_clamp` mutation for precisely that reason. Two
       controls that happen to refuse the same call are not one control, and the
       day cap is the one that survives a player whose grant is below the
       ceiling. */
  ok(extra.ok !== true && Number(meterN0) === VIGOUR_MAX_REFILLS,
    `V8: the meter counted ${meterN0} refills after ${VIGOUR_MAX_REFILLS} sales and one refusal — `
    + 'the cap is not counting what it caps.');
  ok(extra.error === 'vigour_daily_cap',
    `V8: the extra refill was refused as '${extra.error}', not 'vigour_daily_cap'. The per-day cap `
    + 'is not what stopped it — something else happened to refuse the same call, and the cap itself '
    + 'is unproven.');
  ok(goldBefore === goldAfter,
    'V8: the REFUSED refill still took gold. A refusal that charges is worse than a sale.');

  /* ── THE CEILING, ON A CHARACTER IT CAN ACTUALLY BITE ──────────────────
     ⚠ AT THE FLOOR GRANT THE CEILING IS UNREACHABLE, AND THAT IS ARITHMETIC
       RATHER THAN AN OVERSIGHT: 720 + 5 x 120 = 1,320 minutes, which is EXACTLY
       the 22-hour ceiling. So on an unperked character the day cap always
       refuses first and the ceiling branch is dead code — the first draft of
       this guard "passed" both ceiling mutations for that reason, which is the
       failure mode CLAUDE.md §4 means by "one sample is not a verdict".
       A PERKED character is where the ceiling is load-bearing: a level-7 clan
       adds 3 h (900 min), so 900 + 5 x 120 = 1,500 would pass 1,320 and the
       ceiling has to clamp the budget AND refuse the purchase that would buy
       nothing. That is also the realistic case — the players who reach it are
       exactly the ones with the gold to test it. */
  const P3 = '00000000-0000-4000-8000-0000b5510b03';
  await db.query('insert into auth.users (id) values ($1)', [P3]);
  const clan = (await q(
    "insert into public.clans (name, created_by) values ('__vigour_probe__', $1) returning id",
    [P3]))[0].id;
  await db.query('update public.clans set level = 7 where id = $1', [clan]);
  await db.query('insert into public.clan_members (clan_id, user_id) values ($1, $2)', [clan, P3]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [P3]);
  await db.query('select public.hr_create_character(0)');
  await db.query('update public.player_state set gold = 100000000 where user_id = $1', [P3]);

  const perked = (await q('select public.hr_vigour_of($1, 0) as v', [P3]))[0].v;
  ok(Number(perked.grant_min) > VIGOUR_FLOOR_MIN,
    `V9 CANNOT RUN: the perked probe derived ${perked.grant_min} min, no better than the floor, so `
    + 'the ceiling is still unreachable and these arms prove nothing. Re-derive the clan rung.');
  let perkedSold = 0;
  let lastErr = null;
  for (let i = 0; i < VIGOUR_MAX_REFILLS; i++) {
    const before = (await q('select public.hr_vigour_of($1, 0) as v', [P3]))[0].v;
    const res = (await db.query('select public.hr_vigour_refill__ungated(0, gen_random_uuid()) as r')).rows[0].r;
    if (res.ok !== true) { lastErr = res.error; break; }
    perkedSold++;
    const after = (await q('select public.hr_vigour_of($1, 0) as v', [P3]))[0].v;
    ok(Number(after.budget_min) <= VIGOUR_CEILING_MIN,
      `V9: refill ${i + 1} pushed the budget from ${before.budget_min} to ${after.budget_min} min, `
      + `past the ${VIGOUR_CEILING_MIN}-minute ceiling. Gold bought the whole day.`);
  }
  ok(lastErr === 'vigour_ceiling',
    `V9: the refill that would have bought NOTHING was answered '${lastErr}' after ${perkedSold} `
    + 'sales. A refill at the ceiling must be REFUSED, not sold — taking gold for zero minutes is '
    + 'the `already_owned` defect in a new currency.');
  ok(perkedSold < VIGOUR_MAX_REFILLS,
    `V9: a perked character bought all ${VIGOUR_MAX_REFILLS} refills, so the ceiling never bit and `
    + 'this arm is measuring the day cap again.');

  // AND THE CEILING HELD THROUGHOUT — the property the cap exists to serve.
  const meterN = (await q('select public.hr_vigour_of($1, 0) as v', [PROBE]))[0].v;
  ok(Number(meterN.budget_min) <= VIGOUR_CEILING_MIN,
    `V8: after every refill the budget is ${meterN.budget_min} min, past the `
    + `${VIGOUR_CEILING_MIN}-minute ceiling. Gold bought the whole day.`);
  ok(Number(meterN.refills) === VIGOUR_MAX_REFILLS,
    `V8: the meter counted ${meterN.refills} refills, not ${VIGOUR_MAX_REFILLS}.`);

  // THE REPLAY CHARGES NOTHING. Driven on a FRESH day-1 character so the cap is
  // not what is doing the refusing.
  const P2 = '00000000-0000-4000-8000-0000b5510b02';
  await db.query('insert into auth.users (id) values ($1)', [P2]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [P2]);
  await db.query('select public.hr_create_character(0)');
  await db.query('update public.player_state set gold = 100000000 where user_id = $1', [P2]);
  const KEY = '00000000-0000-4000-8000-0000b5510bb1';
  const first = (await db.query('select public.hr_vigour_refill__ungated(0, $1) as r', [KEY])).rows[0].r;
  ok(first.ok === true, `V8: the probe refill was refused: ${JSON.stringify(first)}`);
  const g1 = BigInt((await q('select gold from public.player_state where user_id=$1', [P2]))[0].gold);
  const again = (await db.query('select public.hr_vigour_refill__ungated(0, $1) as r', [KEY])).rows[0].r;
  const g2 = BigInt((await q('select gold from public.player_state where user_id=$1', [P2]))[0].gold);
  ok(g1 === g2,
    'V8: a REPLAYED idempotency key debited a second time. A double-tap on the buy button charges '
    + 'twice, which is the one defect an idempotency key exists to prevent.');
  ok(again.replayed === true || g1 === g2,
    'V8: the replay was not answered from the cache.');

  // THE ENGINE'S CHARGE LANDS ON THE ROW THE METER READS. One number, or a
  // window can pay and not charge (design §5).
  const chargeRows = await q(
    "select count(*)::int as n from public.player_progress where user_id=$1 and kind='daily' and key=$2",
    [PROBE, VIGOUR_PROGRESS_KEY]);
  ok(Number(chargeRows[0].n) === 0,
    `V8: buying refills wrote a ${VIGOUR_PROGRESS_KEY} row. A purchase adds BUDGET; only a settled `
    + 'window SPENDS it, and conflating the two makes gold pay for time already used.');

  await db.close();
  return problems;
}

// ── HARNESS ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  console.log('tests/vigour.mjs — mutation catalogue\n');
  for (const [id, why] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(26)} ${why}`);
  process.exit(0);
}
const only = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;

if (argv.includes('--selftest')) {
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    problems.length = 0;
    let found;
    try { found = await run(id); } catch (e) {
      if (e.harness) { console.log(`  ✗ ${id}: HARNESS — ${e.message}`); bad++; continue; }
      found = [`threw: ${e.message}`];
    }
    if (found.length === 0) { console.log(`  ✗ ${id}: NOT CAUGHT`); bad++; }
    else console.log(`  ✓ ${id}: caught (${found.length} assertion(s))`);
  }
  problems.length = 0;
  const clean = await run(null);
  if (clean.length) { console.log(`  ✗ UNMUTATED run is red:\n    ${clean.join('\n    ')}`); bad++; }
  console.log(bad ? `\nvigour --selftest: ${bad} problem(s)` : '\nvigour --selftest: every mutation caught, unmutated run green');
  process.exit(bad ? 1 : 0);
}

let found;
try { found = await run(only); } catch (e) {
  if (e.harness) { console.log(`vigour: HARNESS — ${e.message}`); process.exit(1); }
  throw e;
}
if (found.length) {
  console.log(`  ✗ vigour: ${found.length} problem(s)`);
  for (const p of found) console.log(`      ${p}`);
  process.exit(only ? 0 : 1);
}
console.log('vigour: OK — the grant is derived and floored, the ceiling holds against every refill, '
  + 'dry means exactly AMMO_DRY_MULT and never a hard stop, the SQL meter and the JS arithmetic '
  + 'agree, and the real RPC charges the catalogue price once, caps the day and refuses without '
  + 'taking gold.');
process.exit(only ? 1 : 0);
