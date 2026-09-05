#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/attended-loot-credit.mjs — THE ATTENDED LOOT TOP-UP.
//
//   node tests/attended-loot-credit.mjs             # the guard
//   node tests/attended-loot-credit.mjs --list      # the mutation catalogue
//   node tests/attended-loot-credit.mjs --selftest  # every mutation must be CAUGHT
//   node tests/attended-loot-credit.mjs --mutate=<id>
//
// Ships with: supabase/functions/hr-accrue/accrual.js (the engine),
//             supabase/migrations/2026-09-10-attended-loot-credit.sql (the read),
//             docs/design/attended-loot-credit.md (the contract).
//
// LOOT ONLY. The FOOD half of the original change (suppressing the settle's
//   auto-eat debit over an attended window and handing it to the client's `eat`
//   intent) was CUT by the Security review of 2026-09-04 as a free-food faucet -
//   its gate read `combat_xp_accrued_to`, which any client can advance with one
//   empty `hr_credit_combat_xp` call. A5 below is now the COHERENCE guard for
//   that removal: it asserts the settle STILL debits every meal it eats, exactly
//   as production does, so the loot top-up cannot be shipped with a half-removed
//   food change. The successor design is docs/design/attended-loot-credit.md
//   section 3.4 and is not built here.
//
// ── THE DEFECT THIS EXISTS FOR — MEASURED, PRODUCTION 2026-09-04 ────────
// A 169-second ATTENDED goblin session on the QA account, slot 2:
//
//   hr_kill_credit_log    4 rows, sum(credit) = 15, NOT ONE THROTTLED
//   player_ledger #13175  meta.kills = 9   qty_in = 16   gold_in = 55
//                         meta.ate = 8     delta.i.shrimp = -8
//   the client showed     26 units, and had eaten 7 x cooked_shrimp
//
// The settle is the ONE writer of loot and gold and it prices [accrued_to, now]
// by RE-SIMULATING it as an UNATTENDED span. Units per kill agree between the
// two sides (server 1.78, client 1.73) — the whole loot shortfall is the KILL
// shortfall:  26 - 16 = 10 units = (15 - 9) kills x 1.73 units/kill.  38% of a
// three-minute session's drops confiscated on reload, with the correct kill
// count sitting in the server's own append-only log the entire time.
//
// A1 IS THAT WINDOW. It is RED against the pre-b502 engine
// (`--mutate=no_topup`, which reverts the engine to exactly today's bytes).
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// TWO HALVES, because the defect has two halves and neither proves the other:
//
//   A1-A9  THE ENGINE, in plain Node, against the REAL computeAccrual. Mutation
//          arms rewrite accrual.js's own text into a temp module (the
//          artisan-progress-model idiom), so a JS defect is planted in the
//          shipping source rather than in a stub.
//   C1-C9  THE MIGRATION, against REAL PostgreSQL: the whole chain from
//          tests/schema-apply-order.json replayed into PGlite, then a real
//          player through the REAL rate-gated hr_credit_kills as
//          `authenticated` with a JWT subject set, then hr_attended_kills as the
//          owner. The assertion is "the projection the engine will actually
//          read says N", never "a row exists".
//
// ── WHY THE CAP ASSERTIONS ARE BY VALUE (A6) ────────────────────────────
// The engine re-caps the attended count against the player's OWN server-owned
// gear, because the SQL cap that let the row into the log assumes a 600 ms swing
// floor and best-in-slot damage — fine for a COUNTER behind a once-per-period
// claim guard, far too loose for a TRADEABLE item faucet. The residual is NOT
// zero and the design doc says so; A6 pins both multiples BY VALUE so that
// loosening the cap re-opens the security review by name rather than by
// judgement. Do not "fix" a red A6 by widening the tolerance.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bootReplay, ROOT as REPLAY_ROOT } from './schema-replay.mjs';
import {
  computeAccrual as realComputeAccrual, degradeStep as realDegradeStep,
  attendedKillCap as realAttendedKillCap, normaliseAttended as realNormaliseAttended,
  deriveTickMs,
  ATTENDED_MAX_FIDELITY, ATTENDED_MAX_KILLS, ATTENDED_MAX_TARGETS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { minTimeToKillMs } from '../src/core/kill-time.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ENGINE = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'accrual.js');
const MIG = '2026-09-10-attended-loot-credit.sql';

let problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* EVERY entry point this file asserts on is a REBINDABLE reference, so a
   mutation arm can swap in a patched copy of accrual.js. A mutation planted in a
   stub proves nothing; these are the shipping bytes with one edit.
   ⚠ ALL FOUR, not just computeAccrual. `normaliseAttended` and
     `attendedKillCap` were imported DIRECTLY in the first draft, so A8 kept
     calling the pristine module while the mutant engine ran — and the two
     prototype-pollution arms reported ESCAPED for a reason that had nothing to
     do with the defect. A rebindable engine beside a statically-bound helper is
     a guard that tests half a file. */
let engine = realComputeAccrual;
let ladder = realDegradeStep;
let normaliseAttended = realNormaliseAttended;
let attendedKillCap = realAttendedKillCap;

// ── THE PRODUCTION FIXTURE ────────────────────────────────────────────────
// Every constant is the measured window, not a round number, so the fixture
// stays anchored to the incident it exists for.
const FROM_MS = Date.UTC(2026, 8, 4, 16, 7, 12, 983);
const NOW_MS = Date.UTC(2026, 8, 4, 16, 10, 1, 845);
const SPAN_MS = NOW_MS - FROM_MS;            // 168 862
const OBSERVED_KILLS = 15;                    // sum(credit) in hr_kill_credit_log
const SEED = 0x5eed1234;
const MONSTER = 'goblin';
const KIT = { shrimp: 10, cooked_shrimp: 20 };   // src/data/start-kit.js

const MAXED = (() => {
  const s = {};
  for (const k of ['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic', 'prayer']) {
    s[k] = 13034431;
  }
  return s;
})();

/** The attended ledger AS hr_attended_kills PROJECTS IT — never a hand shape. */
function attendedEnvelope(kills, fromMs, toMs) {
  return {
    ok: true,
    kills,
    total: Object.values(kills).reduce((a, b) => a + b, 0),
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}

/** The engine, called the way index.ts calls it. */
function accrue(over) {
  return engine({
    userId: '00000000-0000-4000-8000-000000000001',
    slot: 2,
    nowMs: NOW_MS,
    accruedToMs: FROM_MS,
    activeSinceMs: FROM_MS,
    activeKind: 'combat',
    activeId: MONSTER,
    capMs: 12 * 3600000,
    seed: SEED,
    hp: 10, maxHp: 10, gold: 0,
    skills: { hitpoints: 1154 },
    equipment: { weapon: 'bronze_sword' },
    inventory: { ...KIT },
    autoEatEnabled: true, autoEatFood: null, autoEatPct: 25,
    /* `{}` — the column EXISTS and there is no fight in flight. NOT omitted:
       `fight: undefined` means "this database has no such column", the engine
       then omits the `fight` delta key entirely, and A4's checkpoint assertion
       would compare `null` against `null` and pass for a mutant that had
       destroyed the checkpoint. Found by --selftest, not by review. */
    fight: {},
    items: ITEMS, monsters: MONSTERS,
    ...over,
  });
}

/* The attended window the production credits describe: the first flush landed
   ~9 s in and the last ~1 s before the settle. */
const ATT_FROM = FROM_MS + 9000;
const ATT_TO = NOW_MS - 1000;
const ATT = attendedEnvelope({ [MONSTER]: OBSERVED_KILLS }, ATT_FROM, ATT_TO);
/* `combat_xp_accrued_to`, the combat-XP watermark. It is NOT an input to the
   loot top-up — it is carried on every fixture below only so that the CONTROL
   and the attended run differ in exactly one variable (see the note under
   `control`). The b502 draft also used it as an attendance BEACON arming a food
   suppression; Security measured that as forgeable (one empty
   hr_credit_combat_xp call advances it, and the RPC is granted to
   `authenticated`) and the food half was cut. Nothing in this file may
   reintroduce a payment or a suppression that depends on it. */
const BEACON = NOW_MS - 1000;

/* THE CONTROL CARRIES THE BEACON TOO, so that the ONLY difference between the
   two runs is `attended`. It is not decoration: `combatXpAccruedToMs` drives the
   combat-XP watermark split (accrual.js xpEligibleFromMs), so a control without
   it proposes the whole window's XP while the attended run proposes none — and
   A4's containment assertion would then report the top-up "proposing combat XP"
   when the top-up had done nothing of the kind. Caught on the first run of this
   file; a one-variable comparison is the only kind that means anything. */
const control = () => accrue({ combatXpAccruedToMs: BEACON });

const unitsIn = (items) => Object.values(items || {})
  .filter((n) => n > 0).reduce((a, b) => a + b, 0);
const debitedFoods = (items) => Object.keys(items || {})
  .filter((id) => items[id] < 0 && ITEMS[id] && Number(ITEMS[id].heals) > 0);

// ── A1 — THE TEST THAT WOULD HAVE CAUGHT IT ───────────────────────────────
function a1_productionWindow() {
  const ctl = control();
  const out = accrue({ attended: ATT, combatXpAccruedToMs: BEACON });

  ok(ctl.accrued === true && out.accrued === true,
    `A1: the fixture accrued nothing (${ctl.reason} / ${out.reason}) — it is vacuous`);
  if (!ctl.accrued || !out.accrued) return;

  /* THE FIXTURE MUST STILL DEMONSTRATE THE DEFECT. If the away sim ever realises
     the attended count on its own, every assertion below passes for the wrong
     reason. Re-pick the fixture rather than deleting this line. */
  ok(ctl.summary.kills < OBSERVED_KILLS,
    `A1: the away sim realised ${ctl.summary.kills} of ${OBSERVED_KILLS} attended kills, so this `
    + 'fixture no longer reproduces the under-realisation it exists for — re-pick it');

  // The cap must not be the thing under test here.
  ok(out.attendedCap >= OBSERVED_KILLS,
    `A1: the engine cap (${out.attendedCap}) is below the honest attended count (${OBSERVED_KILLS}) `
    + '— this fixture is measuring the cap, not the top-up');

  ok(out.attendedClaimed === OBSERVED_KILLS,
    `A1: the engine read ${out.attendedClaimed} attended kills, expected ${OBSERVED_KILLS}`);
  ok(out.summary.kills + out.attendedTopUp === OBSERVED_KILLS,
    `A1 THE DEFECT: the settle paid loot for ${out.summary.kills + out.attendedTopUp} kills, but `
    + `the server had already ACCEPTED AND CLAMPED ${OBSERVED_KILLS} in hr_kill_credit_log `
    + `(sim ${out.summary.kills} + top-up ${out.attendedTopUp}). Every missing kill is drops the `
    + 'player watched land and lost on reload.');

  /* THE DROPS THOSE KILLS ACTUALLY PRODUCED, within the seeded RNG's own
     tolerance. Per-kill yield is the invariant — production measured 1.78
     server-side against 1.73 client-side, i.e. the rates AGREE and only the kill
     count differed — so the assertion is on the RATIO, not on a magic total. */
  const ctlUnits = unitsIn(ctl.delta.items);
  const outUnits = unitsIn(out.delta.items);
  const perKill = ctlUnits / ctl.summary.kills;
  const expect = perKill * OBSERVED_KILLS;
  ok(Math.abs(outUnits - expect) <= expect * 0.35,
    `A1: credited ${outUnits} units for ${OBSERVED_KILLS} kills; the same engine yields `
    + `${perKill.toFixed(2)} units/kill, so ~${expect.toFixed(1)} was expected (+-35%, the seeded `
    + "RNG's own spread over 15 rolls of a 5-row table)");
  ok(out.delta.gold > ctl.delta.gold,
    `A1: gold did not move with the top-up (${ctl.delta.gold} -> ${out.delta.gold}) — resolveKill `
    + 'pays gold per kill and there is no other writer for it');

  /* THE JOURNAL. A support request about a vanished stack has to be answerable
     from the row, and `claimed / sim` is the forgery signal the design doc
     leans on. */
  const att = out.delta.journal.meta.att;
  ok(att && att.claimed === OBSERVED_KILLS && att.sim === out.summary.kills
     && att.top === out.attendedTopUp && att.cap === out.attendedCap,
    `A1: meta.att is not the whole attended split: ${JSON.stringify(att)}`);
  /* THE AGGREGATE BOUND, asserted here as well as in accrual-engine's SHAPE
     block, because THIS file is the one that adds a key to that object. Eight is
     "aggregate, never a per-kill log" made countable — the game_events lesson. */
  ok(Object.keys(out.delta.journal.meta).length <= 8,
    `A1: the journal meta grew to ${Object.keys(out.delta.journal.meta).length} keys. It is an `
    + 'AGGREGATE (one row per accrual); raising the bound is how a ledger becomes game_events.');
}

// ── A2 — THE CAP BINDS, AND IT IS THE ENGINE'S, NOT THE SQL ONE ───────────
function a2_capBinds() {
  const huge = attendedEnvelope({ [MONSTER]: 1000000 }, ATT_FROM, ATT_TO);
  const out = accrue({ attended: huge, combatXpAccruedToMs: BEACON });
  ok(out.accrued === true, `A2: nothing accrued (${out.reason})`);
  if (!out.accrued) return;

  ok(out.attendedClaimed === ATTENDED_MAX_KILLS,
    `A2: normaliseAttended did not clamp 1,000,000 to ATTENDED_MAX_KILLS (${ATTENDED_MAX_KILLS}), `
    + `got ${out.attendedClaimed}`);
  /* A SATURATING CLAIM IS PAID THE TIGHTEST CEILING AND NOT ONE KILL MORE, and
     the test names WHICH ceiling so that a re-tune of either is a disagreement
     rather than a silent widening. Two apply on this fixture: `attendedCap`
     (physics from the player's own gear) and `sim x ATTENDED_MAX_FIDELITY` (the
     sim-relative ceiling A9 exists for). Whichever is smaller must bind. */
  const ceiling = Math.min(out.attendedCap, out.summary.kills * ATTENDED_MAX_FIDELITY);
  ok(out.summary.kills + out.attendedTopUp === ceiling,
    `A2: a saturating claim paid ${out.summary.kills + out.attendedTopUp} kills against the `
    + `tightest ceiling of ${ceiling} (gear cap ${out.attendedCap}, sim ${out.summary.kills} x `
    + `${ATTENDED_MAX_FIDELITY} = ${out.summary.kills * ATTENDED_MAX_FIDELITY}) — a ceiling that `
    + 'does not bind is not a ceiling');
  ok(out.attendedCap > 0 && out.summary.kills > 0,
    'A2: the fixture has a zero cap or a zero sim, so the line above is vacuous');

  /* THE CAP IS A PURE FUNCTION OF SERVER-OWNED GEAR. Recomputed here from the
     same inputs the engine derives it from, so a change to either side is a
     disagreement rather than a silent re-tune. */
  const tickMs = deriveTickMs({ weapon: 'bronze_sword' }, ITEMS, null);
  ok(out.tickMs === tickMs,
    `A2: the settle priced the span at ${out.tickMs} ms but deriveTickMs says ${tickMs}`);
  ok(attendedKillCap(0, tickMs, MONSTERS[MONSTER].hp, 4) === 0,
    'A2: a zero-length attended window yields a non-zero cap');
  ok(attendedKillCap(SPAN_MS, tickMs, MONSTERS[MONSTER].hp, 1)
     < attendedKillCap(SPAN_MS, tickMs, MONSTERS[MONSTER].hp, 8),
    'A2: the cap does not rise with max hit, so it is not derived from gear at all');
}

// ── A3 — NON-ADDITIVE: the total is max(sim, min(attended, cap)) ──────────
function a3_notAdditive() {
  const ctl = control();
  if (!ctl.accrued) { ok(false, 'A3: control did not accrue'); return; }
  const sim = ctl.summary.kills;

  /* Claiming EXACTLY what the sim already produced must pay NOTHING extra —
     otherwise every attended window pays the same kills twice. */
  const equal = accrue({
    attended: attendedEnvelope({ [MONSTER]: sim }, ATT_FROM, ATT_TO),
    combatXpAccruedToMs: BEACON,
  });
  ok(equal.attendedTopUp === 0,
    `A3: claiming exactly the ${sim} kills the sim already paid topped up ${equal.attendedTopUp} `
    + 'more — the credit is ADDING to the settle instead of covering its shortfall');
  ok(unitsIn(equal.delta.items) === unitsIn(ctl.delta.items)
     && equal.delta.gold === ctl.delta.gold,
    'A3: a zero top-up changed the delta, so the top-up path has a side effect');

  /* Claiming FEWER than the sim produced must also pay nothing extra — the
     server's own simulation is authoritative for time it was not told about. */
  const fewer = accrue({
    attended: attendedEnvelope({ [MONSTER]: Math.max(1, sim - 3) }, ATT_FROM, ATT_TO),
    combatXpAccruedToMs: BEACON,
  });
  ok(fewer.attendedTopUp === 0,
    `A3: a claim BELOW the sim's own ${sim} kills produced a top-up of ${fewer.attendedTopUp}`);

  const more = accrue({
    attended: attendedEnvelope({ [MONSTER]: sim + 3 }, ATT_FROM, ATT_TO),
    combatXpAccruedToMs: BEACON,
  });
  ok(more.attendedTopUp === 3,
    `A3: sim ${sim} + 3 claimed should top up exactly 3, got ${more.attendedTopUp}`);

  /* A DIFFERENT MONSTER'S CREDITS ARE NOT THIS POINTER'S. The pointer names one
     target; a credit for another is somebody else's window. */
  const wrong = accrue({
    attended: attendedEnvelope({ slime: 500 }, ATT_FROM, ATT_TO),
    combatXpAccruedToMs: BEACON,
  });
  ok(wrong.attendedTopUp === 0,
    `A3: credits for 'slime' topped up a 'goblin' pointer by ${wrong.attendedTopUp}`);
}

// ── A4 — CONTAINMENT: loot and gold ONLY. No counter, no XP. ──────────────
function a4_containment() {
  const ctl = control();
  const out = accrue({ attended: ATT, combatXpAccruedToMs: BEACON });
  if (!ctl.accrued || !out.accrued) { ok(false, 'A4: fixture did not accrue'); return; }
  ok(out.attendedTopUp > 0, 'A4: no top-up ran, so every assertion below is vacuous');

  /* THE PROGRESS OPS MUST BE IDENTICAL. hr_credit_kills already writes every
     kill counter — the daily row, the lifetime aggregate, the bestiary key
     hr_renown_of RANKS — and its settle-delta subtraction is arithmetic against
     exactly what the settle writes TODAY. Moving that number silently re-opens
     the double-count 2026-09-01-kill-daily-credit.sql exists to close, on a
     ranked surface. */
  const key = (ops) => JSON.stringify((ops || []).map((o) => [o.kind, o.key, o.period, o.add])
    .sort((a, b) => String(a).localeCompare(String(b))));
  ok(key(out.delta.progress) === key(ctl.delta.progress),
    'A4 THE CONTAINMENT: the top-up moved a progress counter.\n'
    + `      control : ${key(ctl.delta.progress)}\n`
    + `      top-up  : ${key(out.delta.progress)}\n`
    + '      Every kill counter is hr_credit_kills\'s, and hr_renown_of SCORES one of them.');

  ok(JSON.stringify(out.delta.xp || {}) === JSON.stringify(ctl.delta.xp || {}),
    'A4: the top-up proposed combat XP. That belongs to hr_credit_combat_xp and its '
    + 'combat_xp_accrued_to watermark; paying it here is the double-mint the watermark exists for.');

  ok(out.summary.kills === ctl.summary.kills,
    `A4: summary.kills moved (${ctl.summary.kills} -> ${out.summary.kills}). It is the SIMULATION's `
    + 'count and the journal reports the top-up separately as meta.att.top');

  /* THE FIGHT CHECKPOINT. resolveKill respawns the foe at full HP, so a top-up
     that did not restore it would discard an in-flight fight — the exact defect
     Phase 0 bought the `fight` column to fix. */
  ok(JSON.stringify(out.delta.fight ?? null) === JSON.stringify(ctl.delta.fight ?? null),
    `A4: the top-up moved the fight checkpoint (${JSON.stringify(ctl.delta.fight)} -> `
    + `${JSON.stringify(out.delta.fight)})`);
  ok(JSON.stringify(out.delta.activity ?? null) === JSON.stringify(ctl.delta.activity ?? null),
    'A4: the top-up moved the activity pointer');
  ok(out.delta.hp === ctl.delta.hp,
    `A4: the top-up moved hp (${ctl.delta.hp} -> ${out.delta.hp})`);
}

// -- A5 - THE SETTLE IS STILL THE SOLE FOOD DEBITER -----------------------
/* THIS IS THE COHERENCE GUARD FOR THE CUT FOOD HALF, and it is the assertion
   that makes this branch shippable on its own.

   The b502 draft suppressed the settle's food debit over a window it believed
   was attended and handed the debit to the client's `eat` intent. Security
   EXECUTED the attack on 2026-09-04: the gate read `combat_xp_accrued_to`, and
   `hr_credit_combat_xp` is granted to `authenticated`, has no early return for
   an empty `p_xp`, and unconditionally advances that column to now(). So one
   `POST /rpc/hr_credit_combat_xp {"p_slot":N,"p_xp":{},"p_idem":"<uuid>"}`
   before each settle armed the suppression for the WHOLE credited window -
   measured at 826 free units of tradeable food over a ten-hour span, with NO
   journal entry, and reachable even with `attended: null` (i.e. on a database
   without the migration, and on every degraded ladder rung).

   The half was CUT, not patched. This test is what keeps it cut: the loot
   top-up must not change who pays for a meal.

   DO NOT "re-enable" the suppression by deleting this arm. The successor design
   (docs/design/attended-loot-credit.md section 3.4) suppresses against LANDED
   `eat` LEDGER ROWS - min(mealsEaten, landedEats) - so that suppressing N
   requires having destroyed N. When that ships, this guard changes to assert
   THAT bound; it does not disappear. */
function a5_foodUnchanged() {
  const ctl = control();
  const att = accrue({ attended: ATT, combatXpAccruedToMs: BEACON });
  ok(ctl.accrued === true && att.accrued === true,
    `A5: fixture did not accrue (${ctl.reason} / ${att.reason})`);
  if (!ctl.accrued || !att.accrued) return;

  ok(att.foodEaten > 0,
    'A5: the attended window ate nothing, so every assertion below is vacuous - re-pick the '
    + 'fixture rather than deleting the arm');
  const debited = debitedFoods(att.delta.items);
  ok(debited.length > 0,
    `A5 THE CUT FOOD HALF: the settle ate ${att.foodEaten} meals over an attended window and `
    + `proposed NO food debit (${JSON.stringify(att.delta.items)}). That is the suppression `
    + 'Security measured as a free-food faucet: its gate was `combat_xp_accrued_to`, which any '
    + 'signed-in client advances with one empty hr_credit_combat_xp call. If it is back, it is '
    + 'back with a forgeable arm.');
  const units = debited.reduce((n, id) => n + (-att.delta.items[id]), 0);
  ok(units === att.foodEaten,
    `A5: the settle ate ${att.foodEaten} meals but debited ${units} units. Every meal the `
    + 'simulation eats is charged, exactly as production charges it - no partial suppression.');

  /* AND THE TOP-UP DID NOT MOVE THE FOOD. The loot half must be orthogonal to
     the meal: same meal count, same debit, with and without the attended read.
     A control that ate a different number of meals would make the assertion
     above pass for the wrong reason. */
  ok(att.foodEaten === ctl.foodEaten,
    `A5: the top-up changed the meal count (${ctl.foodEaten} -> ${att.foodEaten}). It runs AFTER `
    + 'simulateSpan on a separate RNG stream and must not touch the fight.');
  const ctlUnits = debitedFoods(ctl.delta.items)
    .reduce((n, id) => n + (-ctl.delta.items[id]), 0);
  ok(units === ctlUnits,
    `A5: the food debit moved with the top-up (${ctlUnits} -> ${units})`);

  /* THE ENGINE STATES NOTHING ABOUT WHO OWES THE DEBIT. `attendedDebit` was the
     client gate's evidence in the cut half. If it reappears on the summary a
     deployed client will read it and stop sending its own `eat` - while the
     settle is still charging for the meal. That is item LOSS, and it is why the
     two halves may only ever move together. */
  ok(!Object.prototype.hasOwnProperty.call(att.summary.autoEat || {}, 'attendedDebit'),
    'A5: summary.autoEat.attendedDebit is back, but this branch still debits every meal. A client '
    + 'that observes it stops debiting a meal the settle is charging for - item loss.');

  /* THE BAG STILL DRAINS AND STILL BOUNDS THE FIGHT. resolveAutoEat reads the
     live bag to decide there is anything left to eat; a two-item bag must cap
     the meals at two even with the top-up running. */
  const thin = accrue({
    attended: ATT, combatXpAccruedToMs: BEACON, inventory: { cooked_shrimp: 2 },
  });
  ok(thin.foodEaten <= 2,
    `A5: the sim ate ${thin.foodEaten} meals out of a two-item bag - it is running on rations that `
    + 'do not exist');
}

// ── A6 — THE BOUND, BY VALUE (this is the security review's line) ─────────
function a6_bound() {
  const tickMs = deriveTickMs({ weapon: 'bronze_sword' }, ITEMS, null);
  const ctl = control();
  const sat = accrue({
    attended: attendedEnvelope({ [MONSTER]: ATTENDED_MAX_KILLS }, ATT_FROM, ATT_TO),
    combatXpAccruedToMs: BEACON,
  });
  if (!ctl.accrued || !sat.accrued) { ok(false, 'A6: fixture did not accrue'); return; }

  const sqlCap = Math.floor((130 * SPAN_MS) / (100 * minTimeToKillMs(MONSTERS[MONSTER].hp, 1)));
  const engineCap = sat.attendedCap;

  /* 1. TIGHTER THAN THE CAP THAT LET THE ROW INTO THE LOG. hr_bounty_kill_cap
        assumes a 600 ms swing floor and BEST-IN-SLOT damage because item combat
        stats are not server-side. That is fine for a counter behind a
        once-per-period claim guard and far too loose for a tradeable faucet. */
  ok(engineCap * 10 < sqlCap,
    `A6: the engine cap (${engineCap}) is not an order of magnitude below the SQL cap (${sqlCap}). `
    + 'The SQL cap is what a forged claim reaches; if the engine does not re-cap, the loot faucet '
    + 'runs at 130 kills/minute.');

  /* 2. IT DOES NOT THROTTLE THE HONEST ATTENDED RATE. Measured on production:
        15 kills over this window. Throttling honest play on a money surface is
        worse than a loose bound on a self-only, journalled claim. */
  ok(engineCap >= OBSERVED_KILLS,
    `A6: the engine cap (${engineCap}) throttles the MEASURED honest attended rate `
    + `(${OBSERVED_KILLS} kills over ${SPAN_MS} ms)`);

  /* 3. THE RESIDUAL, PINNED BY VALUE. It is NOT zero: the cap is a multiple of
        the server's own away-sim rate because that sim under-realises damage by
        ~1.7x relative to the live client (span-sim fidelity, tracked separately
        — see docs/design/attended-loot-credit.md). Pinning the multiple means a
        change that loosens the cap RE-OPENS THE SECURITY REVIEW BY NAME.
        DO NOT WIDEN THIS TOLERANCE TO GO GREEN. */
  const ratio = engineCap / ctl.summary.kills;
  ok(ratio <= 3.5,
    `A6 THE REVIEWED BOUND: the engine cap is ${ratio.toFixed(2)}x the server's own away-sim rate `
    + `for the same seconds and the same gear (cap ${engineCap}, sim ${ctl.summary.kills}). The `
    + 'security verdict was taken at 3.1x (fresh) / 1.8x (maxed). If this is a deliberate change, '
    + 'the verdict has to be re-taken — do not widen the tolerance.');

  /* The maxed fixture, because the fresh-character rounding (ceil of swings per
     kill) is the loosest point of the curve and a bound proven only there is a
     bound proven nowhere. */
  const maxedCtl = engine({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: FROM_MS + 90000, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER, capMs: 12 * 3600000, seed: SEED,
    hp: 99, maxHp: 99, gold: 0, skills: MAXED, equipment: { weapon: 'bronze_sword' },
    inventory: {}, items: ITEMS, monsters: MONSTERS,
  });
  if (maxedCtl.accrued) {
    const maxedCap = attendedKillCap(90000 + 60000, deriveTickMs({ weapon: 'bronze_sword' }, ITEMS, null),
      MONSTERS[MONSTER].hp, 99);
    const maxedRatio = maxedCap / maxedCtl.summary.kills;
    ok(maxedRatio <= 3.5,
      `A6 (maxed): the cap is ${maxedRatio.toFixed(2)}x the away-sim rate (cap ${maxedCap}, sim `
      + `${maxedCtl.summary.kills}). Same rule as above.`);
  }
  ok(tickMs > 0, 'A6: deriveTickMs returned a non-positive tick');
}

// ── A7 — THE DEGRADE LADDER STAYS MONOTONE ───────────────────────────────
function a7_ladder() {
  const out = accrue({ attended: ATT, combatXpAccruedToMs: BEACON });
  if (!out.accrued) { ok(false, 'A7: fixture did not accrue'); return; }
  const step = ladder(out, 1);
  ok(step !== null, 'A7: degradeStep returned null for a payable combat span');
  if (!step) return;
  ok(Object.prototype.hasOwnProperty.call(step, 'attended') && step.attended === null,
    'A7 THE INVERTED LADDER: degradeStep did not drop the attended top-up. The ladder\'s contract '
    + 'is "ask for something SMALLER", but the top-up is min(attended,cap) - summary.kills, so '
    + 'halving the span CUTS summary.kills and GROWS the top-up. A ladder built to shrink a '
    + 'proposal would inflate it, earn the same rejection three times, and forfeit the night.');

  const rung = accrue({ ...step, attended: step.attended, combatXpAccruedToMs: BEACON });
  if (rung.accrued) {
    ok(rung.attendedTopUp === 0,
      `A7: a degraded rung still topped up ${rung.attendedTopUp} kills`);
    ok(unitsIn(rung.delta.items) <= unitsIn(out.delta.items)
       && (rung.delta.gold || 0) <= (out.delta.gold || 0),
      'A7: the degraded rung proposed MORE than the attempt that was rejected');
  }
}

// ── A8 — HOSTILE INPUT ────────────────────────────────────────────────────
function a8_hostile() {
  /* The read is a SECURITY DEFINER projection the client cannot call, so nothing
     below is reachable today. It is asserted anyway: normaliseAttended is the
     one reader, and "unreachable" is a property of the CURRENT call graph. */
  ok(normaliseAttended(null) === null, 'A8: null did not normalise to null');
  ok(normaliseAttended({ ok: false, kills: { goblin: 5 } }) === null,
    'A8: a refusing envelope was read as kills');
  ok(normaliseAttended({ ok: true, kills: [] }) === null, 'A8: an array was accepted as a kill map');
  ok(normaliseAttended({ ok: true }) === null, 'A8: a missing kills map was accepted');

  const proto = normaliseAttended(JSON.parse('{"ok":true,"kills":{"__proto__":9,"constructor":9,"goblin":3}}'));
  ok(proto && Object.keys(proto.kills).join(',') === 'goblin',
    `A8 PROTOTYPE POLLUTION: __proto__/constructor survived normalisation (${JSON.stringify(proto)}). `
    + 'Both are truthy on any plain object, so a truthy miss would multiply a phantom monster\'s '
    + 'drops — the measurement catalogueHas records in ./intents.js.');

  const junk = normaliseAttended({
    ok: true,
    kills: { goblin: 3.9, slime: -5, wolf: '4', bat: NaN, rat: Infinity, 'BAD ID': 9, '': 9 },
  });
  ok(junk && junk.kills.goblin === 3, `A8: 3.9 did not floor to 3 (${JSON.stringify(junk)})`);
  ok(junk && !('slime' in junk.kills), 'A8: a negative count survived');
  ok(junk && !('bat' in junk.kills) && !('rat' in junk.kills),
    'A8: NaN/Infinity survived into a kill count');
  ok(junk && !('BAD ID' in junk.kills) && !('' in junk.kills),
    'A8: an id outside /^[a-z0-9_]{1,64}$/ survived');

  const wide = {};
  for (let i = 0; i < 40; i++) wide[`m${i}`] = 10;
  const capped = normaliseAttended({ ok: true, kills: wide });
  ok(capped && Object.keys(capped.kills).length === ATTENDED_MAX_TARGETS,
    `A8: ${Object.keys(capped ? capped.kills : {}).length} targets survived the `
    + `ATTENDED_MAX_TARGETS (${ATTENDED_MAX_TARGETS}) ceiling`);

  /* A MALFORMED WINDOW MUST PAY NOTHING, not everything. Missing from/to leaves
     the sub-window empty, which makes the cap zero. */
  const noWindow = accrue({
    attended: { ok: true, kills: { [MONSTER]: 500 } },
    combatXpAccruedToMs: BEACON,
  });
  ok(noWindow.accrued !== true || noWindow.attendedTopUp === 0,
    `A8: an attended envelope with no window topped up ${noWindow.attendedTopUp} kills — a window `
    + 'the server never measured must pay nothing, not everything');
}


// ── A9 — THE SIM-RELATIVE CEILING (the unsurvivable-target hole) ─────────
/* FOUND BY MEASUREMENT WHILE ANSWERING THE SECURITY REVIEW, 2026-09-04, and not
   by it: `attendedKillCap` bounds a claim by what the player's gear could
   PHYSICALLY kill and says nothing about whether the character survives. A
   maxed-skill character holding a bronze sword, pointed at `the_silence`
   (hp 364, atk 99, gp 292-614), simulates ZERO kills over 24 h — it dies on the
   first exchange — while the gear cap reads 5,200. `min(claimed, cap) - sim`
   pays the whole ceiling when sim is 0, because there is nothing to subtract:
   ~2.27M gold and ~6,900 tradeable units a day, against an honest production
   maximum of ~8k gold/hour.

   `set-activity.js` gates a combat pointer on `catalogueHas(MONSTERS, id)` and
   NOTHING ELSE (deliberately - there is no server-side monster unlock), so the
   fixture is reachable by anyone who can forge an `hr_credit_kills` claim. This
   change is what turns that forgery from a counter into gold, so the bound
   belongs here.

   A6 asserts the same property BY VALUE against fixtures where the sim SURVIVES;
   this arm is the case A6 cannot see. */
function a9_unsurvivable() {
  const FROM = Date.UTC(2026, 8, 4, 0, 0, 0);
  const span = 24 * 3600000;
  const MAXED_SKILLS = {};
  for (const k of ['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic', 'prayer']) {
    MAXED_SKILLS[k] = 13034431;
  }
  const out = engine({
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    nowMs: FROM + span, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'the_silence',
    capMs: 24 * 3600000, seed: SEED,
    hp: 99, maxHp: 99, gold: 0,
    skills: MAXED_SKILLS, equipment: { weapon: 'bronze_sword' },
    inventory: { cooked_shrimp: 100000 },
    autoEatEnabled: true, autoEatFood: null, autoEatPct: 25,
    fight: {},
    items: ITEMS, monsters: MONSTERS,
    attended: attendedEnvelope({ the_silence: ATTENDED_MAX_KILLS },
      FROM + 1000, FROM + span - 1000),
  });
  ok(out.accrued === true, `A9: fixture did not accrue (${out.reason})`);
  if (!out.accrued) return;

  /* THE FIXTURE MUST STILL BE UNSURVIVABLE, or every assertion below is vacuous
     for the wrong reason. Re-pick the monster rather than deleting the line. */
  ok(out.summary.kills === 0,
    `A9: the away sim realised ${out.summary.kills} kills against the_silence, so this fixture no `
    + 'longer reproduces the unsurvivable case - re-pick it');
  ok(out.attendedCap > 1000,
    `A9: the GEAR cap is only ${out.attendedCap}, so the sim-relative ceiling is not the thing `
    + 'under test here - re-pick the fixture');

  ok(out.attendedTopUp === 0,
    `A9 THE UNSURVIVABLE TARGET: the settle topped up ${out.attendedTopUp} kills of a monster its `
    + `own simulation could not kill ONCE (gear cap ${out.attendedCap}). A window the server's own `
    + 'model of this character produced nothing in is a window it has no basis to price. '
    + `That is ${out.delta.gold} gold and ${unitsIn(out.delta.items)} tradeable units of faucet.`);
  ok((out.delta.gold || 0) === 0,
    `A9: gold moved (${out.delta.gold}) on a fight the sim did not survive`);

  /* AND THE CEILING IS A MULTIPLE OF THE SIM, not merely a zero test. sim x 3 is
     the runtime form of A6's reviewed bound; a claim above it is refused. */
  const ctl = control();
  if (!ctl.accrued) return;
  const sim = ctl.summary.kills;
  const greedy = accrue({
    attended: attendedEnvelope({ [MONSTER]: ATTENDED_MAX_KILLS }, ATT_FROM, ATT_TO),
    combatXpAccruedToMs: BEACON,
  });
  ok(greedy.summary.kills + greedy.attendedTopUp
     <= Math.min(greedy.attendedCap, sim * ATTENDED_MAX_FIDELITY),
    `A9 THE FIDELITY CEILING: a saturating claim paid `
    + `${greedy.summary.kills + greedy.attendedTopUp} kills against a sim of ${sim} - more than `
    + `${ATTENDED_MAX_FIDELITY}x. Measured span-sim under-realisation is ~1.7x systematic and the `
    + 'ruled variance allowance is 1.3; above that the claim is not the same fight.');

  /* AND IT DOES NOT THROTTLE THE MEASURED HONEST WINDOW. The production row was
     9 sim kills against 15 attended - 1.67x. */
  const honest = accrue({ attended: ATT, combatXpAccruedToMs: BEACON });
  ok(honest.summary.kills + honest.attendedTopUp === OBSERVED_KILLS,
    `A9: the fidelity ceiling throttled the MEASURED honest window to `
    + `${honest.summary.kills + honest.attendedTopUp} of ${OBSERVED_KILLS} (sim `
    + `${honest.summary.kills} x ${ATTENDED_MAX_FIDELITY}). Throttling honest play on a money `
    + 'surface is worse than a loose bound on a self-only, journalled claim - re-rule the number, '
    + 'do not silently accept the under-pay.');
}

// ══════════════════════════════════════════════════════════════════════════
// THE MIGRATION HALF — real PostgreSQL, the real chain, a real player.
// ══════════════════════════════════════════════════════════════════════════
const UUID = () => crypto.randomUUID();
const N = (v) => Number(v ?? 0);

async function sqlHalf(patchList) {
  const { db } = await bootReplay({ patches: patchList, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`): PGlite runs each query in its own
     implicit transaction, so a transaction-local GUC is gone by the next
     statement and auth.uid() would read NULL. */
  const setSub = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const asUser = async (uid, sql, p) => {
    await setSub(uid);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const asDefiner = async (uid, sql, p) => {
    await setSub(uid);
    return (await db.query(sql, p)).rows[0]?.r;
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, created the server's own way ──────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, `alc-${uid}@probe.invalid`]);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['AlcProbe']);
  await gate();
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true, `C-FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);

  // ── C1 — NOT CLIENT-EXECUTABLE. The whole containment. ─────────────────
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const [r] = await q(
      "select has_function_privilege($1,'public.hr_attended_kills(uuid,int,timestamptz)','execute') as p", [role]);
    ok(r.p === false,
      `C1: ${role} can EXECUTE hr_attended_kills. It would hand a player the exact window their own `
      + 'settle is about to price, and a projection a client can read is a projection a client can '
      + 'plan against.');
  }
  const [eng] = await q(
    "select has_function_privilege('hr_engine','public.hr_attended_kills(uuid,int,timestamptz)','execute') as p");
  ok(eng.p === true, 'C1: hr_engine CANNOT execute hr_attended_kills — the whole change is inert');
  /* And the engine must not be able to reach the table directly, or the
     projection's clamps are optional. */
  const [tbl] = await q(
    "select has_table_privilege('hr_engine','public.hr_kill_credit_log','select') as p");
  ok(tbl.p === false, 'C1: hr_engine holds SELECT on hr_kill_credit_log directly');

  // ── C2 — RECORDED ON THE ALLOWLIST ─────────────────────────────────────
  const [al] = await q(`select position('hr_attended_kills(uuid,integer,timestamp with time zone)' in prosrc) > 0 as p
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_assert_grant_hygiene'`);
  ok(al.p === true,
    'C2: hr_attended_kills is granted to hr_engine but NOT recorded in c_engine_allow, so the '
    + 'nightly detector raises engine_execute_outside_allowlist every night — and the pressure a '
    + 'raising detector creates is to revoke the grant or widen check (7).');

  // ── C3 — THE PROJECTION SUMS `credit`, NEVER `claimed` ─────────────────
  await q("update public.player_state set accrued_to = now() - interval '5 minutes' "
    + 'where user_id = $1 and slot = 0', [uid]);
  /* Real kills through the REAL verb, as `authenticated`, so the number in the
     log is one hr_bounty_kill_cap actually allowed. A forged claim of a million
     is clamped BEFORE it can be projected — that is C5, driven from here. */
  await gate();
  const cred1 = await asUser(uid,
    'select public.hr_credit_kills(0,$1,$2::bigint,$3) as r', [MONSTER, 4, UUID()]);
  ok(cred1?.ok === true, `C3: hr_credit_kills refused: ${JSON.stringify(cred1)}`);
  const proj1 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(proj1?.ok === true, `C3: the projection refused: ${JSON.stringify(proj1)}`);
  ok(N(proj1?.kills?.[MONSTER]) === N(cred1?.credit),
    `C3: projected ${JSON.stringify(proj1?.kills)} but hr_credit_kills credited ${cred1?.credit}`);
  ok(proj1?.from !== null && proj1?.to !== null,
    'C3: the window bounds are null on a non-empty window — the food/loot scope would be empty');

  // ── C4 — A FORGED CLAIM IS CLAMPED BEFORE IT CAN BE PROJECTED ──────────
  /* ⚠ THE FIRST ROW IS BACKDATED, AND WITHOUT THAT THIS TEST PROVES NOTHING.
     hr_credit_kills's bounty-free branch anchors its window at the LAST free
     credit, so a second call in the same second prices a ~0 ms window, caps at
     0, and records `credit = 0` — and the projection's `where l.credit > 0`
     then drops the row before the sum, so a `sum(claimed)` mutant reads
     IDENTICALLY to the correct body. Measured: `sums_claimed_gate_blind`
     ESCAPED this guard until the row was backdated. Sixty seconds of window
     gives the forged claim a real, non-zero, THROTTLED credit — which is the
     only shape in which "claimed vs credit" is a visible difference. */
  await q("update public.hr_kill_credit_log set created_at = now() - interval '60 seconds' "
    + 'where user_id = $1 and slot = 0', [uid]);
  await gate();
  const forged = await asUser(uid,
    'select public.hr_credit_kills(0,$1,$2::bigint,$3) as r', [MONSTER, 1000000, UUID()]);
  ok(forged?.ok === true, `C4: the forged claim errored instead of being clamped: ${JSON.stringify(forged)}`);
  ok(N(forged?.credit) > 0 && N(forged?.credit) < 1000000,
    `C4: hr_credit_kills did not THROTTLE a claim of 1,000,000 into a positive, smaller credit `
    + `(got ${forged?.credit}). A credit of 0 is dropped by the projection's own \`credit > 0\` `
    + 'filter, and then this assertion cannot see a `claimed`-summing mutant at all.');
  const proj2 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(N(proj2?.kills?.[MONSTER]) === N(cred1?.credit) + N(forged?.credit),
    `C4: the projection is not the sum of CREDIT (${cred1?.credit} + ${forged?.credit}), it is `
    + `${JSON.stringify(proj2?.kills)}. A large number here means it is summing \`claimed\` — `
    + 'unclamped client input, laundered through a table into the loot writer.');

  // ── C5 — A FORGED TARGET CANNOT ENTER THE LOG AT ALL ───────────────────
  await gate();
  const phantom = await asUser(uid,
    'select public.hr_credit_kills(0,$1,$2::bigint,$3) as r', ['not_a_monster', 50, UUID()]);
  ok(phantom?.ok === false && phantom?.error === 'unknown_monster',
    `C5: a phantom target was accepted: ${JSON.stringify(phantom)}`);
  const proj3 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(!('not_a_monster' in (proj3?.kills || {})),
    `C5: a phantom target reached the projection: ${JSON.stringify(proj3?.kills)}`);

  // ── C6 — THE WINDOW CLOSES WHEN accrued_to ADVANCES (no double-pay) ────
  /* This is the property that replaces a consumed-flag, and it has to be RUN.
     hr_apply advances accrued_to in the same transaction that pays, so the rows
     just projected must fall OUT of the next window. */
  await q('update public.player_state set accrued_to = now() where user_id = $1 and slot = 0', [uid]);
  const proj4 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(JSON.stringify(proj4?.kills || {}) === '{}',
    'C6 THE DOUBLE-PAY GUARD: the window did not close when accrued_to advanced, so the settle '
    + `would pay the same credit rows on every accrual: ${JSON.stringify(proj4?.kills)}`);
  ok(N(proj4?.total) === 0 && proj4?.from === null,
    `C6: an empty window did not project empty bounds: ${JSON.stringify(proj4)}`);

  // ── C7 — THE PER-CALL CEILINGS BIND ────────────────────────────────────
  await q("update public.player_state set accrued_to = now() - interval '5 minutes' "
    + 'where user_id = $1 and slot = 0', [uid]);
  /* Written straight into the log (as the OWNER, not as a client) to model a
     pathological table — the point of a per-call ceiling is that it holds even
     when the thing that wrote the row did not. */
  await q(`insert into public.hr_kill_credit_log
             (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
           values ($1,0,$2,'wolf',9000000000000000000,9000000000,9000000000000000000,9000000000,
                   now() - interval '1 minute')`, [uid, UUID()]);
  const proj5 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(N(proj5?.kills?.wolf) === 5000,
    `C7: the per-target ceiling did not bind (${proj5?.kills?.wolf}) — a pathological log would `
    + 'hand the engine an unbounded number');
  for (let i = 0; i < 12; i++) {
    await q(`insert into public.hr_kill_credit_log
               (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
             values ($1,0,$2,$3,1,1,1,1, now() - interval '1 minute')`,
    [uid, UUID(), `m${i}`]);
  }
  const proj6 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(Object.keys(proj6?.kills || {}).length <= 8,
    `C7: ${Object.keys(proj6?.kills || {}).length} targets projected — the key ceiling did not bind`);

  // ── C8 — SCOPED TO (user, slot) ────────────────────────────────────────
  const other = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [other, `alc2-${other}@probe.invalid`]);
  await q(`insert into public.hr_kill_credit_log
             (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
           values ($1,0,$2,'slime',999,999,999,999, now())`, [other, UUID()]);
  const proj7 = await asDefiner(uid, 'select public.hr_attended_kills($1::uuid,0,now()) as r', [uid]);
  ok(!('slime' in (proj7?.kills || {})),
    `C8: another player's credit leaked into this window: ${JSON.stringify(proj7?.kills)}`);

  // ── C9 — THE UPPER EDGE, AND ITS CLAMP (Security condition C6) ─────────
  /* The engine advances `accrued_to` to the `now()` it read in the STATE
     transaction, and it calls this projection from a LATER one. A window
     bounded only below therefore projects rows committed in the gap: the settle
     pays them AND the next settle projects them again, because they are still
     newer than the watermark. `(accrued_to, p_upto]` is the whole double-pay
     guard, so the two ends must name the same instant.

     Asserted HERE and not only in the migration's GATE(e6) because §3 runs at
     APPLY time, and the regression this file must still see in a year is a LATER
     migration replacing hr_attended_kills from a stale template. */
  await q('delete from public.hr_kill_credit_log where user_id = $1', [uid]);
  await q("update public.player_state set accrued_to = now() - interval '10 minutes' "
    + 'where user_id = $1 and slot = 0', [uid]);
  await q(`insert into public.hr_kill_credit_log
             (user_id, slot, idem, target, claimed, credit, cap, applied, created_at)
           values ($1,0,$2,'goblin',7,7,7,7, now() - interval '5 minutes'),
                  ($1,0,$3,'goblin',11,11,11,11, now() + interval '5 minutes')`,
  [uid, UUID(), UUID()]);

  const proj8 = await asDefiner(uid,
    "select public.hr_attended_kills($1::uuid,0, now() - interval '1 minute') as r", [uid]);
  ok(N(proj8?.kills?.goblin) === 7,
    `C9 THE UPPER EDGE: p_upto did not bound the window — expected 7 (the one row below it), got `
    + `${proj8?.kills?.goblin}. A credit row above the instant accrued_to advances to is paid now `
    + 'AND projected again on the next settle, which is the double-pay the (accrued_to, p_upto] '
    + 'window is the only guard against.');

  const proj9 = await asDefiner(uid,
    "select public.hr_attended_kills($1::uuid,0, now() + interval '1 hour') as r", [uid]);
  ok(N(proj9?.kills?.goblin) === 7,
    `C9 THE CLAMP: a FUTURE p_upto widened the window past now() (got ${proj9?.kills?.goblin}). `
    + '`least(p_upto, now())` is what makes the third argument incapable of INCREASING a payment '
    + 'no matter who supplies it — which is the whole reason a timestamp parameter is admissible '
    + 'on a paying path at all.');

  const proj10 = await asDefiner(uid,
    'select public.hr_attended_kills($1::uuid,0,null) as r', [uid]);
  ok(N(proj10?.kills?.goblin) === 7,
    `C9: a NULL p_upto did not fall back to now() (got ${proj10?.kills?.goblin})`);

  await db.close?.();
}

// ══════════════════════════════════════════════════════════════════════════
// MUTATIONS — every one is a defect a reviewer could plausibly ship.
// ══════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  // ── ENGINE (JS) ────────────────────────────────────────────────────────
  no_topup: {
    engine: true,
    why: 'THE DEFECT ITSELF, reverted: the attended top-up is deleted and the engine is '
       + "byte-for-byte today's. An attended window is paid at the away sim's rate — 9 kills "
       + 'against 15 the server had already accepted, 38% of a session\'s drops confiscated.',
    find: '    if (attTopUp > 0) {',
    repl: '    if (false) {',
  },
  uncapped_topup: {
    engine: true,
    why: 'the engine stops re-capping and pays whatever hr_bounty_kill_cap let into the log — '
       + '130 kills/minute of TRADEABLE mats, 16.6x the reviewed bound',
    find: '      attTopUp = Math.max(0, Math.min(attClaimed, attCap,\n'
        + '                                      attSim * ATTENDED_MAX_FIDELITY) - attSim);',
    repl: '      attTopUp = Math.max(0, Math.min(attClaimed,\n'
        + '                                      attSim * ATTENDED_MAX_FIDELITY) - attSim);',
  },
  additive_topup: {
    engine: true,
    why: 'the shortfall subtraction is deleted, so the settle pays its OWN simulated kills AND the '
       + 'attended count for the same seconds — one set of kills looted twice',
    find: '      attTopUp = Math.max(0, Math.min(attClaimed, attCap,\n'
        + '                                      attSim * ATTENDED_MAX_FIDELITY) - attSim);',
    repl: '      attTopUp = Math.max(0, Math.min(attClaimed, attCap,\n'
        + '                                      attSim * ATTENDED_MAX_FIDELITY));',
  },
  unsurvivable_topup: {
    engine: true,
    why: 'the SIM-RELATIVE ceiling is dropped, leaving only the gear cap — which says nothing '
       + 'about SURVIVAL. A maxed-skill character in a bronze sword pointed at `the_silence` '
       + 'simulates 0 kills (it dies on the first exchange) and caps at 5,200, so a forged claim '
       + 'is paid in full: ~2.27M gold and ~6,900 tradeable units a DAY against an honest '
       + 'production maximum of ~8k gold/hour. Nothing gates which monster a character may point '
       + 'at, so the fixture is reachable by anyone who can forge an hr_credit_kills claim - which '
       + 'is exactly what this change monetises.',
    find: '                                      attSim * ATTENDED_MAX_FIDELITY) - attSim);',
    repl: '                                      Infinity) - attSim);',
  },
  counters_leak: {
    engine: true,
    why: 'the restore set is dropped, so top-up kills move stat/kills, the daily row and the '
       + 'bestiary key — the last of which hr_renown_of SCORES. It also breaks '
       + "hr_credit_kills's settle-delta subtraction, whose arithmetic is against exactly what the "
       + 'settle writes today (2026-09-01-kill-daily-credit.sql §3).',
    find: '      state.stats.kills = keepKills;\n      state.stats.rareDrops = keepRare;',
    repl: '      state.stats.kills = state.stats.kills;\n      state.stats.rareDrops = state.stats.rareDrops;',
  },
  fight_not_restored: {
    engine: true,
    why: 'the in-flight fight checkpoint is not restored after the top-up, so every settle ends '
       + 'with a full-HP monster — discarding the half-killed target Phase 0 bought the `fight` '
       + 'column to preserve',
    find: '      state.monsterHp = keepMonsterHp;\n      state.monsterMaxHp = keepMonsterMaxHp;',
    repl: '      state.monsterHp = state.monsterHp;\n      state.monsterMaxHp = state.monsterMaxHp;',
  },
  food_debit_dropped: {
    engine: true,
    why: 'THE CUT FOOD HALF, planted: the settle stops debiting the meal it just ate. That is the '
       + 'b502 suppression Security measured as a free-food faucet (its gate was '
       + '`combat_xp_accrued_to`, which any signed-in client advances with one empty '
       + 'hr_credit_combat_xp call - 826 free units over a ten-hour span, no journal entry). This '
       + 'branch keeps the settle as the SOLE food debiter, and A5 is what holds it there.',
    find: '      itemDelta[decision.foodId] = (itemDelta[decision.foodId] || 0) - 1;\n      foodEaten++;',
    repl: '      foodEaten++;',
  },
  food_phantom_rations: {
    engine: true,
    why: 'the auto-eat branch stops decrementing the live bag, so the simulation survives on food '
       + 'the character does not own - resolveAutoEat reads that bag to decide there is anything '
       + 'left, so an unbounded heal lets the sim out-produce the honest fight AND the top-up is '
       + 'then priced against a fight that could not have happened',
    find: '      bag[decision.foodId] -= 1;\n      if (bag[decision.foodId] <= 0) delete bag[decision.foodId];',
    repl: '      if (false) delete bag[decision.foodId];',
  },
  ladder_keeps_attended: {
    engine: true,
    why: 'the degrade ladder stops dropping the top-up, which INVERTS it: halving the span cuts '
       + 'summary.kills and therefore GROWS min(attended,cap) - summary.kills, so each "smaller" '
       + 'proposal is bigger, earns the same rejection, and the night is forfeited after three rungs',
    find: '    attended: null,\n    report: { spanMs: smaller, attempt },',
    repl: '    attended: undefined,\n    report: { spanMs: smaller, attempt },',
  },
  proto_pollution: {
    engine: true,
    why: 'normaliseAttended drops its own-property, id-pattern AND reserved-name checks. All three '
       + 'are needed and none is redundant: JSON.parse creates `__proto__` as a REAL own property '
       + '(so hasOwnProperty passes it) and `__proto__`/`constructor`/`prototype` all MATCH '
       + '/^[a-z0-9_]{1,64}$/ (so the pattern passes them). They then occupy '
       + 'ATTENDED_MAX_TARGETS slots and can evict a real target.',
    find: "    if (!Object.prototype.hasOwnProperty.call(src, id)) continue;\n"
        + "    if (typeof id !== 'string' || !/^[a-z0-9_]{1,64}$/.test(id)) continue;\n"
        + '    if (RESERVED_KEYS.indexOf(id) !== -1) continue;',
    repl: '    /* checks removed */',
  },
  reserved_keys_only: {
    engine: true,
    why: 'ONLY the reserved-name check is dropped, leaving hasOwnProperty and the id pattern in '
       + 'place — which is exactly the state this file caught on its first run, because both of '
       + 'those pass `__proto__` through',
    find: '    if (RESERVED_KEYS.indexOf(id) !== -1) continue;',
    repl: '    /* reserved-name check removed */',
  },

  // ── MIGRATION (SQL) ────────────────────────────────────────────────────
  sums_claimed: {
    sql: true,
    why: 'THE LAUNDERING DEFECT: the projection sums `claimed` (what the client sent) instead of '
       + '`credit` (what hr_bounty_kill_cap allowed), so unclamped client input reaches the loot '
       + 'writer through a table — the same defect with one extra hop',
    find: '           least(sum(l.credit), 5000::bigint) as k,',
    repl: '           least(sum(l.claimed), 5000::bigint) as k,',
  },
  window_ignores_watermark: {
    sql: true,
    why: 'the (accrued_to, now] window is deleted, so every settle re-projects every credit row in '
       + 'the retention period and pays the same kills again on each one. This is the ONLY '
       + 'double-pay guard the design has — there is deliberately no consumed flag.',
    find: '       and l.created_at > s.accrued_to',
    repl: '       and l.created_at > s.accrued_to - interval \'2 days\'',
  },
  client_executable: {
    sql: true,
    why: 'the projection is granted to `authenticated`, handing a player the exact window their own '
       + 'settle is about to price — a projection a client can read is a projection a client can '
       + 'plan against',
    find: 'grant execute on function public.hr_attended_kills(uuid, int, timestamptz) to hr_engine;',
    repl: 'grant execute on function public.hr_attended_kills(uuid, int, timestamptz) to hr_engine, authenticated;',
  },
  no_ceiling: {
    sql: true,
    why: 'the per-target ceiling is deleted, so a pathological log hands the engine an unbounded '
       + 'number and the per-call fuse stops existing',
    find: '           least(sum(l.credit), 5000::bigint) as k,',
    repl: '           sum(l.credit) as k,',
  },
  no_upper_bound: {
    sql: true,
    why: 'SECURITY CONDITION C6, reverted: the (accrued_to, p_upto] window loses its upper edge. '
       + 'The engine advances accrued_to to the now() it read in the STATE transaction and calls '
       + 'this projection from a LATER one, so every credit row committed in the gap is paid by '
       + 'this settle AND projected again by the next — the one double-pay this design has no '
       + 'other guard against.',
    find: '       and l.created_at <= least(p_upto, now())',
    repl: '       and true',
  },
  upto_unclamped: {
    sql: true,
    why: 'the p_upto clamp is dropped, so the third argument can WIDEN the window past now(). '
       + 'The clamp is the entire reason a timestamp parameter is admissible on a paying path: '
       + 'with it, a wrong p_upto can only ever pay LESS.',
    find: '       and l.created_at <= least(p_upto, now())',
    repl: '       and l.created_at <= coalesce(p_upto, now())',
  },
  cross_slot: {
    sql: true,
    why: "the slot predicate is deleted, so another character's attended kills are projected into "
       + 'this one\'s window — six slots become one faucet',
    find: '       and l.slot    = coalesce(p_slot, 0)',
    repl: '       and true',
  },
};

/* ── PROVING THE GUARD ITSELF IS NOT DECORATION ─────────────────────────
   Every SQL mutation above is also caught by the MIGRATION's own §3 gate — it
   refuses to install broken, which is the strongest catch available. But §3 only
   runs at APPLY time, and the regression this file must still see in a year is a
   LATER migration replacing hr_attended_kills from a stale template (the
   b484–b487 class). So the two most load-bearing SQL defects are repeated with
   §3's executed block short-circuited, leaving ONLY this guard's C-series to see
   them. Same shape as tests/kill-daily-credit.mjs's _gate_blind arms. */
/* ⚠ IT RAISES **HR900**, THE CODE THE MIGRATION'S OWN HANDLER SWALLOWS. A
   different code propagates, the migration refuses to install, and the arm
   reports "migration/harness rejected it" — a CAUGHT that proves the gate, not
   this guard. The point of a gate-blind arm is that the migration INSTALLS with
   its own gate short-circuited and only the C-series is left to see the defect;
   an arm that never reaches the C-series is decoration. Measured: with HR901 all
   four gate-blind arms reported a false CAUGHT. */
const GATE_BLIND = [
  '  begin\n    v_uid := gen_random_uuid();',
  "  begin\n    raise exception using errcode = 'HR900', message = 'selftest: gate block skipped';\n    v_uid := gen_random_uuid();",
];
MUTATIONS.sums_claimed_gate_blind = {
  sql: true,
  why: `${MUTATIONS.sums_claimed.why} — with the migration's own §3 gate short-circuited, so ONLY `
     + 'this guard (C4) can see it',
  find: MUTATIONS.sums_claimed.find,
  repl: MUTATIONS.sums_claimed.repl,
  also: [GATE_BLIND],
};
MUTATIONS.window_ignores_watermark_gate_blind = {
  sql: true,
  why: `${MUTATIONS.window_ignores_watermark.why} — with the migration's own §3 gate `
     + 'short-circuited, so ONLY this guard (C6) can see it',
  find: MUTATIONS.window_ignores_watermark.find,
  repl: MUTATIONS.window_ignores_watermark.repl,
  also: [GATE_BLIND],
};
MUTATIONS.no_upper_bound_gate_blind = {
  sql: true,
  why: `${MUTATIONS.no_upper_bound.why} — with the migration's own §3 gate short-circuited, so `
     + 'ONLY this guard (C9) can see it. GATE(e6) runs at APPLY time; the regression this arm '
     + 'exists for is a LATER migration restating hr_attended_kills from a stale template.',
  find: MUTATIONS.no_upper_bound.find,
  repl: MUTATIONS.no_upper_bound.repl,
  also: [GATE_BLIND],
};

/** Load a patched copy of accrual.js as a real module. The shipping bytes with
 *  one edit — a mutation planted in a stub proves nothing. */
async function loadMutantEngine(find, repl) {
  let src = await readFile(ENGINE, 'utf8');
  const n = src.split(find).length - 1;
  if (n !== 1) {
    throw new Error(`MUTANT HARNESS: the anchor matched ${n} times in accrual.js (need exactly 1).\n`
      + `  anchor: ${JSON.stringify(find.slice(0, 90))}\n`
      + '  A mutation that cannot be planted is decoration — fix the anchor, do not delete the arm.');
  }
  src = src.replace(find, repl);

  const rootUrl = pathToFileURL(join(ROOT, 'x')).href.replace(/x$/, '');
  const fnUrl = pathToFileURL(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'x')).href.replace(/x$/, '');
  const rewritten = src.replace(/from '\.\.\/\.\.\/\.\.\/src\//g, `from '${rootUrl}src/`)
    .replace(/from '\.\//g, `from '${fnUrl}`);
  if (/from '\.\.?\//.test(rewritten)) {
    throw new Error('MUTANT HARNESS: a relative import survived the rewrite, so the mutant cannot load');
  }
  const file = join(tmpdir(), `hr-alc-mutant-${process.pid}-${Date.now()}.mjs`);
  await writeFile(file, rewritten, 'utf8');
  let mod;
  try { mod = await import(pathToFileURL(file).href); }
  finally { await unlink(file).catch(() => {}); }
  for (const name of ['computeAccrual', 'degradeStep', 'normaliseAttended', 'attendedKillCap']) {
    if (typeof mod[name] !== 'function') {
      throw new Error(`MUTANT HARNESS: the mutant exports no ${name}`);
    }
  }
  return mod;
}

async function run(mutateId) {
  problems = [];
  engine = realComputeAccrual;
  ladder = realDegradeStep;
  normaliseAttended = realNormaliseAttended;
  attendedKillCap = realAttendedKillCap;
  let patchList;

  if (mutateId) {
    const m = MUTATIONS[mutateId];
    if (!m) throw new Error(`no mutation "${mutateId}" — try --list`);
    if (m.engine) {
      /* A harness failure must NOT read as a caught mutation, so it throws
         before any assertion runs rather than folding into `problems`. */
      const mod = await loadMutantEngine(m.find, m.repl);
      engine = mod.computeAccrual;
      ladder = mod.degradeStep;
      normaliseAttended = mod.normaliseAttended;
      attendedKillCap = mod.attendedKillCap;
    }
    if (m.sql) patchList = new Map([[MIG, [[m.find, m.repl], ...(m.also || [])]]]);
  }

  a1_productionWindow();
  a2_capBinds();
  a3_notAdditive();
  a4_containment();
  a5_foodUnchanged();
  a6_bound();
  a7_ladder();
  a8_hostile();
  a9_unsurvivable();

  /* The SQL half is skipped for a pure-JS mutation: replaying the whole chain
     costs ~13 s and a JS defect cannot be visible in it. It always runs on the
     unmutated pass and on every SQL arm. */
  if (!mutateId || MUTATIONS[mutateId].sql) {
    try {
      await sqlHalf(patchList);
    } catch (e) {
      problems.push(`SQL HALF: ${e && e.message ? e.message : e}`);
    }
  }
  return problems;
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k) => (argv.find((a) => a.startsWith(`${k}=`)) || '').split('=')[1];

if (argv.includes('--list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) {
    console.log(`  ${id.padEnd(34)} ${m.engine ? '[js] ' : '[sql]'} ${m.why}`);
  }
  process.exit(0);
}

if (argv.includes('--selftest')) {
  const escapes = [];
  for (const id of Object.keys(MUTATIONS)) {
    let caught;
    let how;
    try {
      const p = await run(id);
      caught = p.length > 0;
      how = caught ? p[0].split('\n')[0] : '';
    } catch (e) {
      /* A migration or a harness that REFUSES to install broken is the strongest
         catch there is — but only if the refusal came from the database, not
         from a mis-anchored patch. loadMutantEngine throws by name for the
         latter, so it is re-raised rather than counted. */
      if (String(e && e.message).startsWith('MUTANT HARNESS')) throw e;
      caught = true;
      how = 'migration/harness rejected it';
    }
    console.log(`  ${caught ? 'CAUGHT ' : 'ESCAPED'}  ${id}${how ? `  — ${how}` : ''}`);
    if (!caught) escapes.push(id);
  }
  if (escapes.length) {
    console.error(`\nSELFTEST FAILED — ${escapes.length} mutation(s) escaped: ${escapes.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nselftest ok — all ${Object.keys(MUTATIONS).length} mutations caught`);
  process.exit(0);
}

const p = await run(arg('--mutate'));
if (p.length) {
  console.error(`attended-loot-credit: ${p.length} problem(s)\n`);
  for (const m of p) console.error(`  FAIL  ${m}\n`);
  process.exit(1);
}
console.log('attended-loot-credit: all checks pass (A1-A9 engine, C1-C9 chain)');
