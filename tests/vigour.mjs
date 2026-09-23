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
  vigourGrantMin, vigourBudgetMin, vigourSplit, vigourMult, vigourCharge,
  VIGOUR_FLOOR_MIN, VIGOUR_CEILING_MIN, VIGOUR_REFILL_MIN, VIGOUR_MAX_REFILLS,
  VIGOUR_DRY_MULT, VIGOUR_PROGRESS_KEY, VIGOUR_REMAINDER_KEY,
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
  spent_ignores_remainder: 'Drop the sub-minute remainder from hr_vigour_of\'s read, so the charge stops conserving (finding S-1).',
  refill_sells_partial: 'Refuse only a refill that would buy NOTHING, so a ceiling-clamped one is sold at full price for half the minutes (S-3).',
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
      /* ANCHOR MOVED 2026-09-22 with finding S-3: the predicate this deletes
         used to read `budget_min >= ceiling_min` and now reads
         `v_delivers < v_min`. Same branch, same deletion — the whole ceiling
         test goes, so a refill at the ceiling is sold for zero minutes. The
         sibling `refill_sells_partial` narrows it instead of deleting it. */
      return withShortCircuit(new Map([[REFILL, [[
        '  if v_delivers < v_min then',
        '  if false then',
      ]]]]));
    case 'refill_free_on_replay':
      return withShortCircuit(new Map([[REFILL, [[
        '  if v_cached ->> \'error\' = \'intent_mismatch\' then return v_cached; end if;\n'
        + '  if v_cached is not null then return v_cached || jsonb_build_object(\'replayed\', true); end if;',
        '  if v_cached ->> \'error\' = \'intent_mismatch\' then return v_cached; end if;',
      ]]]]));
    case 'spent_ignores_remainder':
      /* ⚠ THE READ IS THE OTHER HALF OF THE FIX, AND IT NEEDS ITS OWN PROOF.
           tests/vigour-charge-conservation.mjs proves the ENGINE proposes the
           sub-minute remainder; nothing there proves the DATABASE reads it back.
           Drop the remainder term from hr_vigour_of's sum and the two counters
           become one counter with a decorative second row — the exact shape of
           finding S-1, arriving through the reader instead of the writer. */
      return withShortCircuit([[DAILY, [[
        "       + coalesce(sum(case when key = 'ev:vigour_rem_ms' then value else 0 end), 0)",
        '       + 0',
      ]]]]);

    case 'refill_sells_partial':
      /* THE FINDING, PLANTED BACK: `v_delivers <= 0` is the pre-fix predicate
         (`budget_min >= ceiling_min` spelled in the new variable), which
         refuses only the sale that delivers ZERO and lets the PARTIAL one
         through at full price with a receipt that reports the whole block. */
      return withShortCircuit([[REFILL, [[
        '  if v_delivers < v_min then',
        '  if v_delivers <= 0 then',
      ]]]]);

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
  // ── V3b. THE CHARGE CONSERVES UNDER WINDOW SUBDIVISION (finding S-1) ───
  // `vigourChargeMin` used to be `floor(ms / 60000)` PER WINDOW with the
  // remainder DISCARDED, which made the daily limiter a function of the settle
  // cadence rather than of elapsed time: 40 minutes charged for an hour at a
  // 90 s poll, ZERO for an hour of sub-minute set_activity collects, which are
  // exempt from ACCRUE_MIN_MS by design (b531). `vigourCharge` now returns the
  // whole minutes AND the sub-minute remainder, and BOTH are written as daily
  // counters; hr_vigour_of adds them back and divides ONCE (arm V6b below).
  const charge = vigourCharge(59999);
  ok(charge.addMin === 0 && charge.remMs === 59999,
    `V3b: a sub-minute window charged ${charge.addMin} min and kept ${charge.remMs} ms. The whole `
    + 'minutes floor, but the remainder must be KEPT — a floor in ANY unit has the same defect, '
    + 'because windows of just under twice the unit charge half of what they pay.');
  ok(vigourCharge(60000).addMin === 1 && vigourCharge(60000).remMs === 0,
    'V3b: a whole minute did not charge exactly one minute and nothing over.');
  /* THE PROPERTY ITSELF, over every partition the design can actually meet: a
     one-second client, a ten-second one, the shipped 90 s poll and tick flush,
     and the 17-minute window a capped return produces. The charge for [0, 60min]
     must equal the sum over ANY partition of it, exactly — not to within a
     minute, which is what the limiter was losing per window. */
  const exactMin = (ms) => { const c = vigourCharge(ms); return c.addMin + (c.remMs / 60000); };
  for (const part of [1000, 10000, 90000, 17 * 60000]) {
    const n = Math.floor(3600000 / part);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += exactMin(part);
    sum += exactMin(3600000 - (n * part));
    ok(Math.abs(exactMin(3600000) - sum) < 1e-9,
      `V3b: one hour charges ${exactMin(3600000)} minutes settled once and ${sum} settled as ${n} `
      + `windows of ${part} ms. The charge must be a function of ELAPSED TIME ALONE — design §5 `
      + 'says the payout and the charge are ONE NUMBER, and accrual.js states the payout half of '
      + 'that as "switching twice pays the same total as switching once".');
  }

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

  /* ── V6b. THE METER DIVIDES ONCE, AT READ TIME — THE SQL HALF OF S-1 ────
     The engine writes the window's charge as a QUOTIENT and a REMAINDER; this
     is the arm that proves the DATABASE adds them back together. Driven through
     hr_apply, the only writer, exactly as the migration's §3 GATE(c7) does —
     sixty-one 59 s windows, every one of them under a minute, which under the
     old floored charge cost the player NOTHING and let a set_activity loop hunt
     at full rate forever. */
  const TODAY = (await q('select public.hr_utc_day_key(now()) as d'))[0].d;
  const chargeWindow = async (min, rem) => {
    const rows = [];
    if (min > 0) rows.push({ kind: 'daily', key: VIGOUR_PROGRESS_KEY, period: TODAY, add: min, state: 'active' });
    if (rem > 0) rows.push({ kind: 'daily', key: VIGOUR_REMAINDER_KEY, period: TODAY, add: rem, state: 'active' });
    const ver = (await q('select public.hr_state_of($1, 0) as s', [PROBE]))[0].s.version;
    const r = (await q('select public.hr_apply($1, 0, $2::bigint, gen_random_uuid(), $3::jsonb) as r',
      [PROBE, String(ver), JSON.stringify({ progress: rows, journal: { kind: 'admin', intent: 'vigour_probe' } })]))[0].r;
    ok(r && r.ok === true, `V6b: hr_apply refused a Vigour charge of ${min} min + ${rem} ms: ${JSON.stringify(r)}`);
  };
  for (let i = 0; i < 61; i++) await chargeWindow(0, 59000);   // eslint-disable-line no-await-in-loop
  const meterSub = (await q('select public.hr_vigour_of($1, 0) as v', [PROBE]))[0].v;
  ok(Number(meterSub.spent_min) === 59,
    `V6b: sixty-one SUB-MINUTE windows paid 59.98 minutes of hunting and the meter charged `
    + `${meterSub.spent_min}. hr_vigour_of must sum 'ev:vigour_rem_ms' beside 'ev:vigour_min' and `
    + 'divide ONCE — a per-window floor makes the daily limiter a function of the poll cadence, and '
    + 'set_activity is exempt from ACCRUE_MIN_MS by design (b531), so the loop is unbounded.');
  await chargeWindow(0, 59000);   // the 62nd: the carried 59,000 ms now pays out
  const meterCarry = (await q('select public.hr_vigour_of($1, 0) as v', [PROBE]))[0].v;
  ok(Number(meterCarry.spent_min) === 60,
    `V6b: the 62nd sub-minute window took the meter to ${meterCarry.spent_min}, not 60. The remainder `
    + 'the earlier windows left behind must be SPENT by the next one; a remainder that is stored and '
    + 'never read is the same discarded minute with an extra row beside it.');
  ok(Number(meterCarry.remaining_min) === Number(meterCarry.budget_min) - 60,
    'V6b: remaining did not fall by the conserved charge — the meter the player acts on and the '
    + 'counter the engine writes are two numbers again (CLAUDE.md §6).');

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

  /* ── V10. NOR MAY IT SELL PARTIAL AIR (finding S-3) ────────────────────
     The refusal above only ever covered the sale that delivers ZERO.
     hr_vigour_of clamps with least(ceiling, grant + bought), so a refill that
     CROSSES the ceiling delivers less than the block it charges for and still
     reported `minutes: 120`. On this perked probe (900-minute grant) the budget
     reaches 1,260 after three refills and the fourth would hand over 60 of the
     120 minutes it takes 54,000 gold for — the receipt and the meter on the
     same envelope disagreeing by an hour, inside a gold verb, which is the
     class Tyler ruled on 2026-09-14. BOTH BRANCHES are driven: every sale must
     move the budget by exactly the minutes its receipt reports, and the one
     that cannot must be refused by name without taking gold. */
  const perkedAt = (await q('select public.hr_vigour_of($1, 0) as v', [P3]))[0].v;
  ok(Number(perkedAt.budget_min) + VIGOUR_REFILL_MIN > Number(perkedAt.ceiling_min),
    `V10 CANNOT RUN: the perked probe stopped at a ${perkedAt.budget_min}-minute budget with room `
    + `for another whole ${VIGOUR_REFILL_MIN}-minute block under the ${perkedAt.ceiling_min} ceiling, `
    + 'so the clamped branch was never reached and this arm proves nothing.');
  ok(Number(perkedAt.budget_min) < Number(perkedAt.ceiling_min),
    `V10 CANNOT RUN: the perked probe saturated the ceiling exactly (${perkedAt.budget_min} of `
    + `${perkedAt.ceiling_min}), which is the ZERO-minute case V9 already covers. The PARTIAL case `
    + 'needs a grant that leaves a fraction of a block under the ceiling.');
  const clamped = (await db.query('select public.hr_vigour_refill__ungated(0, gen_random_uuid()) as r')).rows[0].r;
  ok(clamped.ok !== true && clamped.error === 'vigour_ceiling',
    `V10: a refill that would deliver only ${Number(perkedAt.ceiling_min) - Number(perkedAt.budget_min)} `
    + `of its ${VIGOUR_REFILL_MIN} minutes was answered '${clamped.error}'. The server takes the full `
    + 'rung, reports the full block and the meter on the same envelope shows less.');
  ok(Number(clamped.would_deliver) < Number(clamped.minutes),
    `V10: the refusal claims it would have delivered ${clamped.would_deliver} of ${clamped.minutes} `
    + 'minutes — if that were the whole block it should have been SOLD, and the panel cannot tell '
    + 'the player what they would actually have got.');
  const afterClamp = (await q('select public.hr_vigour_of($1, 0) as v', [P3]))[0].v;
  ok(Number(afterClamp.budget_min) === Number(perkedAt.budget_min)
     && Number(afterClamp.refills) === Number(perkedAt.refills),
    'V10: the REFUSED partial refill still moved the meter.');

  /* ── V10b. THE CEILING IS IN THE METER, NOT ONLY IN THE SALE ───────────
     ⚠ THIS ARM EXISTS BECAUSE S-3 TOOK THE OLD ONE AWAY, and saying so is the
       point. Before the partial-refill refusal landed, `budget_ignores_ceiling`
       (the ceiling deleted from hr_vigour_of) was caught by the V9 loop: the
       fourth sale pushed the perked budget to 1,380 and the assertion fired.
       With the refusal in place that sale never happens — v_delivers goes
       negative and the verb refuses, which LOOKS correct — so the unclamped
       meter would have gone unnoticed through the sale path. The clamp is a
       property of the READ, so it is asserted on the READ: the counter is
       driven through hr_apply, the only writer, exactly as the migration's
       GATE(c4) does, and the meter must clamp whatever it is handed. */
  const verP3 = (await q('select public.hr_state_of($1, 0) as s', [P3]))[0].s.version;
  await db.query('select public.hr_apply($1, 0, $2::bigint, gen_random_uuid(), $3::jsonb)', [P3, String(verP3),
    JSON.stringify({ progress: [{ kind: 'daily', key: 'ev:vigour_refills', period: TODAY, add: 99, state: 'active' }],
      journal: { kind: 'admin', intent: 'vigour_probe' } })]);
  const stuffed = (await q('select public.hr_vigour_of($1, 0) as v', [P3]))[0].v;
  ok(Number(stuffed.refills) === VIGOUR_MAX_REFILLS,
    `V10b: ${stuffed.refills} refills read back from a counter holding far more — the per-day clamp `
    + 'is not applied on READ, so a corrupted counter would widen the budget.');
  ok(Number(stuffed.budget_min) <= VIGOUR_CEILING_MIN,
    `V10b: the meter reported a ${stuffed.budget_min}-minute budget, past the ${VIGOUR_CEILING_MIN}-minute `
    + 'ceiling. Two hours a day gold cannot buy is what keeps "richest player hunts most" from becoming '
    + '"richest player hunts always", and it must hold in the READ every caller sees — the engine pays '
    + 'against this number and the panel renders it.');


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
