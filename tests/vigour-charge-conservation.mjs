#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/vigour-charge-conservation.mjs — THE VIGOUR CHARGE MUST NOT DEPEND
//                                        ON HOW OFTEN A PLAYER SETTLES.
//
//   node tests/vigour-charge-conservation.mjs            # the guard
//   node tests/vigour-charge-conservation.mjs --list     # the mutation catalogue
//   node tests/vigour-charge-conservation.mjs --selftest # every mutation CAUGHT
//   node tests/vigour-charge-conservation.mjs --mutate=<id>
//
// Written by the security-engineer role for the M6 review
// (docs/planning/SEC_HUNTS_M6_2026-09-22.md, finding S1). It was RED BY DESIGN
// against lane/m6-hunts-backend @76af094 and listed in
// tests/guards-unregistered.json.
//
// ── 2026-09-22, backend-architect lane: THE FINDING IS FIXED AND THIS FILE IS
//    NOW THE STANDING REGRESSION GUARD, which is what its author wrote it to
//    become ("the guard is written to be the regression test for its own fix").
//    NOT ONE ASSERTION WAS WEAKENED. What changed is the harness DIRECTION and
//    the unit the charge is read in:
//      · the plain run is GREEN and is registered in .github/workflows/smoke.yml;
//        its guards-unregistered.json entry is deleted;
//      · --selftest reverts to the ordinary direction — each mutation plants the
//        DEFECT back into the engine and every arm must go RED, and the
//        unmutated engine must be GREEN. The old catalogue's one entry was the
//        planted FIX, which has no job left now that the fix is shipped;
//      · `slack` was TIGHTENED from one minute to 1e-6 for every arm. The charge
//        is now exact, so an arm that still allowed a minute of drift would stop
//        measuring the very thing that was wrong;
//      · `chargeOf` sums BOTH counters the engine now proposes (see below). A
//        chargeOf that read only the minutes row would read the fix as a defect.
//
// ── THE FIX, IN ONE LINE ────────────────────────────────────────────────
// src/core/hunt.js `vigourCharge(windowMs)` returns the whole minutes AND the
// sub-minute remainder, and accrual.js proposes both as daily counters
// ('ev:vigour_min', 'ev:vigour_rem_ms'). hr_vigour_of divides ONCE, at read
// time: spent_min = minutes + floor(remainder_ms / 60000). For any partition
// {wi} of a span, sum(wi) = 60000*sum(qi) + sum(ri), so
// floor(sum(wi)/60000) = sum(qi) + floor(sum(ri)/60000) — the charge is a
// function of ELAPSED TIME ALONE. Raw ms in a single row is not available:
// hr_apply clamps one `add` at c_max_progress_add = 1,000,000 and a capped 24 h
// window is 86,400,000 ms.
//
// ── THE PROPERTY ────────────────────────────────────────────────────────
// docs/design/HUNTS_AND_ANALYZER.md §5: "Vigour is charged from the same `ms`
// the payout is computed from, in the same transaction. A window cannot pay and
// not charge, BECAUSE THERE IS ONE NUMBER."
//
// accrual.js already states the payout half of that as a conservation law, in
// its own words, one line above the ACCRUE_MIN_MS floor:
//
//     "WHY THIS CANNOT BE GAMED. Paying it grants exactly what the simulation
//      computes for the elapsed span and advances `accrued_to` to `now()`, so
//      TIME IS CONSERVED: switching twice pays the same total as switching
//      once."
//
// The charge must obey the same law, and it does not. `vigourChargeMin`
// (src/core/hunt.js) is `floor(ms / 60000)` PER WINDOW and the sub-minute
// remainder is DISCARDED rather than carried, so the total charged for a fixed
// span falls as the span is cut into more windows — to ZERO once every window
// is under a minute. There is no carry column, no remainder on the ledger row
// and nothing anywhere that re-reads the lost milliseconds.
//
// ── WHY THAT IS A MONEY FINDING AND NOT A ROUNDING NOTE ─────────────────
// Vigour is the scarcity the 242,000-gold-a-day refill sink is sold against
// (design §4.4) and the 22-hour ceiling is what keeps "richest player hunts
// most" from becoming "richest player hunts always". A player who never
// depletes the meter never buys a refill and never meets the ceiling, and the
// gold and loot the uncharged windows pay are tradeable on the market — so the
// blast radius is the economy, not the one character.
//
// ── THE THREE ARMS ──────────────────────────────────────────────────────
//   C1  CADENCE, NO PRIVILEGE. Forty 90 s windows on the ORDINARY 'accrue'
//       caller — above ACCRUE_MIN_MS, nothing forged, a poll cadence any client
//       may choose — pay one hour and charge 40 minutes instead of 60. This arm
//       needs no exploit at all: it is a 33% systematic discount, and it is the
//       reason the finding is not "an attacker could".
//   C2  SWITCH-SPAM, THE EXPLOIT. `set_activity` runs the engine with
//       caller:'collect', which is exempt from ACCRUE_MIN_MS by design (b531)
//       and pays any sub-minute window that produced value. Sixty-one 59 s
//       windows pay an hour of combat and charge ZERO. Unbounded: the meter
//       never moves, whatever the night.
//   C3  THE TICK'S OPERATOR KNOB. caller:'tick' is exempt from the floor too,
//       and `hr_tick_config.flush_seconds` is operator_tunable
//       (tests/restore-census.baseline.json). A flush under 60 s charges every
//       ticked character nothing, forever, with no code change and no review.
//       Asserted at the shipped default (90 s) and at 45 s.
//
// ── WHAT WOULD MAKE IT GREEN ────────────────────────────────────────────
// A conserving charge: carry the sub-minute remainder across windows (the
// `tool_carry`/`ammo_carry` shape player_state already uses for exactly this
// problem), or charge in the ledger's own unit (ms/seconds) and let
// hr_vigour_of do the division. `--mutate=proportional_charge` patches the
// engine to charge exactly `grantMs / 60000` and every arm below goes green,
// which is what proves these arms measure the law and not an implementation.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { ROOT } from './schema-replay.mjs';
import { computeAccrual, CALLER_AUTHORITY } from '../supabase/functions/hr-accrue/accrual.js';
import { VIGOUR_PROGRESS_KEY, VIGOUR_REMAINDER_KEY, vigourCharge } from '../src/core/hunt.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTANT ENGINE ───────────────────────────────────────────────────
   The same idiom as tests/hunt-stance-stop.mjs: accrual.js is copied beside
   itself with ONE textual patch asserted to match exactly once, so the arms
   drive genuinely different ENGINE code rather than different expectations in
   this file. A mutation that silently no-ops reads as "caught" and leaves the
   guard decorative, which is why the anchor count is checked. */
const FN_DIR = join(ROOT, 'supabase/functions/hr-accrue');
const ENGINE_PATCHES = {
  /* THE ORIGINAL DEFECT, PLANTED BACK. `vigourChargeMin` floored the window and
     returned, and only the minutes row was proposed. This is the exact shape
     that charged 40 minutes for an hour at a 90 s poll and ZERO for an hour of
     sub-minute collects. Every arm below must go RED. */
  floor_per_window: [[
    `    if (addMin > 0) {
      progress.push({ kind: 'daily', key: VIGOUR_PROGRESS_KEY,
        period, add: addMin, state: 'active' });
    }
    if (remMs > 0) {
      progress.push({ kind: 'daily', key: VIGOUR_REMAINDER_KEY,
        period, add: remMs, state: 'active' });
    }`,
    `    if (addMin > 0) {
      progress.push({ kind: 'daily', key: VIGOUR_PROGRESS_KEY,
        period, add: addMin, state: 'active' });
    }`,
  ]],
  /* THE HALF-FIX, which is the regression this file will actually meet: the
     remainder is COMPUTED but proposed as a floor of itself in whole minutes,
     so it is always 0 and the row is never written. A reader of the diff would
     see two counters and believe the law held. */
  remainder_refloored: [[
    '    const { addMin, remMs } = vigourCharge(grantMs);',
    '    const { addMin } = vigourCharge(grantMs);\n    const remMs = Math.floor(grantMs % 60000 / 60000) * 60000;',
  ]],
};

/* Returns BOTH the engine and ITS OWN authority token. The token is a module
   -private object IDENTITY (accrual.js CALLER_AUTHORITY), so the copy's token is
   NOT the original's — which is exactly the property that stops a request body
   carrying one. A harness that passed the original's token to the mutant would
   see every privileged caller silently demoted to 'accrue' and read the floor's
   refusal as "the arm found nothing". */
async function loadEngine(mutate) {
  const list = ENGINE_PATCHES[mutate];
  if (!list) return { engine: computeAccrual, authority: CALLER_AUTHORITY };
  let src = await readFile(join(FN_DIR, 'accrual.js'), 'utf8').then((t) => t.replace(/\r\n/g, '\n'));
  for (const [find, replace] of list) {
    const n = src.split(find).length - 1;
    if (n !== 1) {
      throw Object.assign(new Error(
        `mutation '${mutate}' anchor matched ${n} times in accrual.js (need exactly 1). `
        + 'The engine text has moved; fix the anchor rather than letting the mutation no-op.'),
      { harness: true });
    }
    src = src.replace(find, () => replace);
  }
  const path = join(FN_DIR, `accrual.__vigmutant_${mutate}_${process.pid}.js`);
  await writeFile(path, src, 'utf8');
  try {
    const mod = await import(`file://${path}?t=${Date.now()}`);
    return { engine: mod.computeAccrual, authority: mod.CALLER_AUTHORITY };
  } finally {
    await unlink(path).catch(() => {});
  }
}

const MUTATIONS = {
  floor_per_window: 'Discard the sub-minute remainder again (the shipped defect of 2026-09-22, finding S-1).',
  remainder_refloored: 'Keep the remainder row but re-floor it to whole minutes, so it is always 0 and never written.',
};

const MON = 'goblin';
const FROM = Date.UTC(2026, 8, 22, 12, 0, 0);
const HOUR = 3600000;
const DAY_KEY = '2026-09-22';

/* A budget large enough that no arm crosses it: this guard measures the CHARGE,
   not the dry multiplier, and a window that straddled the budget line would mix
   the two. 720 minutes is the shipped floor grant. */
const VIGOUR = Object.freeze({
  day_key: DAY_KEY, grant_min: 720, refills: 0, refills_max: 5, bought_min: 0,
  budget_min: 720, ceiling_min: 22 * 60, spent_min: 0, remaining_min: 720, dry_mult: 0.25,
});

let ENGINE = computeAccrual;
let AUTHORITY = CALLER_AUTHORITY;

/** ONE settle window. `caller` null = the ordinary 'accrue' path a browser
    polls on; 'collect' = what every set_activity runs; 'tick' = the world tick.
    The authority token is imported, exactly as the two real callers pass it. */
const window_ = (fromMs, spanMs, caller) => ENGINE({
  userId: '00000000-0000-4000-8000-0000b5510c01', slot: 0,
  nowMs: fromMs + spanMs, accruedToMs: fromMs, activeSinceMs: FROM,
  activeKind: 'combat', activeId: MON,
  capMs: 24 * HOUR, seed: 12345,
  hp: 900, maxHp: 900, gold: 0,
  skills: { attack: 400000, strength: 400000, defense: 400000, hitpoints: 400000 },
  equipment: {}, inventory: { trout: 5000 },
  attended: null,
  autoEatEnabled: true, autoEatFood: 'trout', autoEatPct: 10,
  recoveringUntilMs: 0, consecFalls: 0, deathsTodayBefore: 0, deathsLifetimeBefore: 60,
  items: ITEMS, monsters: MONSTERS,
  huntStance: null, huntStop: null, traits: null,
  vigour: VIGOUR,
  ...(caller ? { caller, callerAuthority: AUTHORITY } : {}),
});

/** What this window PROPOSED to charge, IN MINUTES — read off the delta the
    engine actually hands hr_apply, never recomputed here.

    ⚠ BOTH COUNTERS, because the charge is one number in two rows: the whole
      minutes on VIGOUR_PROGRESS_KEY and the sub-minute remainder in ms on
      VIGOUR_REMAINDER_KEY, which hr_vigour_of adds back together and divides
      once. Reading only the minutes row would report the CONSERVING engine as
      charging 0 for a sub-minute window — i.e. it would reproduce the defect in
      the measurement instead of in the code, which is the failure mode this
      whole file exists to make impossible. The fractional value returned here is
      the exact charged time; the METER floors it once per day, not per window,
      and that single floor is asserted in tests/vigour.mjs and in the
      migration's §3 GATE(c7). */
function chargeOf(out) {
  const rows = (out && out.delta && out.delta.progress) || [];
  const add = (key) => {
    const row = rows.find((r) => r && r.key === key);
    return row ? Number(row.add) || 0 : 0;
  };
  return add(VIGOUR_PROGRESS_KEY) + (add(VIGOUR_REMAINDER_KEY) / 60000);
}

/** Drive a span as `n` equal windows and total what was PAID and CHARGED. */
function chain(spanMs, windowMs, caller) {
  const n = Math.floor(spanMs / windowMs);
  let charged = 0; let paidMs = 0; let gold = 0; let windows = 0;
  for (let i = 0; i < n; i++) {
    const out = window_(FROM + (i * windowMs), windowMs, caller);
    if (!out || !out.accrued) continue;
    windows += 1;
    charged += chargeOf(out);
    paidMs += Number((out.delta && out.delta.journal && out.delta.journal.meta
      && out.delta.journal.meta.ms) || 0);
    gold += Number((out.delta && out.delta.gold) || 0);
  }
  return { windows, charged, paidMs, gold };
}

const mins = (ms) => ms / 60000;

async function run(mutate) {
  ({ engine: ENGINE, authority: AUTHORITY } = await loadEngine(mutate));
  /* How much slack the law is allowed, and it is now EXACT. The shipped charge
     keeps the sub-minute remainder in the ledger's own unit, so a partition of a
     span charges the span to the millisecond and there is no honest rounding
     left to pay for. This used to be ONE MINUTE while the guard was red by
     design; tightening it is the point of the fix, not a side effect of it. */
  const slack = 1e-6;

  // ── C0. THE ONE-WINDOW REFERENCE ───────────────────────────────────────
  // Everything below is measured against what the SAME hour costs when it is
  // settled once. Asserted rather than assumed: if the reference itself stopped
  // charging, every comparison below would pass for the wrong reason.
  const ref = window_(FROM, HOUR, null);
  ok(ref.accrued === true, 'C0: the one-hour reference window did not accrue at all — the fixture is broken, not the engine.');
  const refCharge = chargeOf(ref);
  ok(refCharge === 60,
    `C0: one settled hour charged ${refCharge} Vigour minutes, expected 60. This guard's whole `
    + 'measurement is relative to that number; fix the fixture before reading any arm below.');

  // ── C1. CADENCE ALONE, NO PRIVILEGE, NO EXPLOIT ────────────────────────
  // 90 s is above ACCRUE_MIN_MS, so this is the plain 'accrue' caller a browser
  // or any HTTP client may poll on. Nothing is forged and nothing is spoofed.
  const c1 = chain(HOUR, 90000, null);
  ok(c1.windows === 40,
    `C1: expected 40 payable 90 s windows, got ${c1.windows} — the arm did not run the chain it claims to.`);
  ok(Math.abs(c1.charged - mins(c1.paidMs)) <= slack,
    `C1: forty 90 s windows PAID ${mins(c1.paidMs).toFixed(1)} minutes of combat and CHARGED ${c1.charged} `
    + `Vigour minutes — ${(mins(c1.paidMs) - c1.charged).toFixed(1)} minutes paid and never charged, `
    + `a ${(100 * (1 - c1.charged / mins(c1.paidMs))).toFixed(0)}% discount bought with nothing but a poll `
    + 'cadence. design §5 says the charge and the payout are ONE NUMBER; vigourChargeMin floors per window '
    + 'and discards the remainder, so they are two. Carry the sub-minute remainder, or charge in the '
    + "ledger's own unit and divide in hr_vigour_of.");

  // ── C2. SWITCH-SPAM — THE EXPLOIT, AND IT IS UNBOUNDED ─────────────────
  // caller:'collect' is what runSetActivity passes, and it is exempt from
  // ACCRUE_MIN_MS by design (b531) precisely so a switch does not destroy the
  // window it interrupts. The payout half of that exemption is conserved — the
  // engine says so in its own comment. The CHARGE half is not.
  const c2 = chain(HOUR, 59000, 'collect');
  ok(c2.windows >= 60,
    `C2: expected ~61 payable 59 s collect windows, got ${c2.windows} — the arm did not run the chain it claims to.`);
  ok(c2.paidMs > 0.95 * HOUR,
    `C2: the sub-minute chain paid only ${mins(c2.paidMs).toFixed(1)} minutes — it must pay an hour for the `
    + 'comparison below to mean anything.');
  ok(Math.abs(c2.charged - mins(c2.paidMs)) <= slack,
    `C2: ${c2.windows} sub-minute set_activity windows PAID ${mins(c2.paidMs).toFixed(1)} minutes of combat `
    + `and ${c2.gold} gold, and CHARGED ${c2.charged} Vigour minutes. A player looping set_activity just `
    + 'under the minute hunts at FULL RATE FOREVER: the meter never moves, the 22-hour ceiling is never '
    + 'reached and the gold refill ladder — the 242,000-a-day sink this whole feature is balanced around — '
    + 'buys something nobody needs. The gold and loot those windows pay are tradeable, so this is an '
    + 'economy-wide faucet, not a self-only cheat.');

  // ── C3. THE TICK, AND THE OPERATOR KNOB UNDER IT ───────────────────────
  // caller:'tick' is exempt from the floor as well (tick-shadow.js says so in
  // those words). hr_tick_config.flush_seconds is operator_tunable, so the
  // question "is Vigour charged at all?" currently has a DBA for an answer.
  const c3a = chain(HOUR, 90000, 'tick');            // the shipped flush
  const c3b = chain(HOUR, 45000, 'tick');            // a tuned-down flush
  ok(Math.abs(c3a.charged - mins(c3a.paidMs)) <= slack,
    `C3: at the shipped 90 s tick flush the world tick PAID ${mins(c3a.paidMs).toFixed(1)} minutes and `
    + `CHARGED ${c3a.charged} — every ticked character gets a third of their hunting free, systematically, `
    + 'with nobody doing anything wrong.');
  ok(Math.abs(c3b.charged - mins(c3b.paidMs)) <= slack,
    `C3: with hr_tick_config.flush_seconds at 45 the tick PAID ${mins(c3b.paidMs).toFixed(1)} minutes and `
    + `CHARGED ${c3b.charged}. An operator_tunable row silently decides whether the daily limiter exists; `
    + 'no migration, no review, no guard would notice. Whatever the fix, the charge must not be a function '
    + 'of the flush.');

  // ── C4. THE UNIT ITSELF, STATED WITHOUT AN ENGINE ──────────────────────
  // The arithmetic under all three arms, so a reader can see the law hold
  // without reading the accrual path: the charge IS additive over a partition.
  //
  // SKIPPED under a mutation, and that is not a softening: the mutations patch
  // ENGINE TEXT, and this arm reads src/core/hunt.js directly. Leaving it on
  // would make every mutation "caught" for a reason that has nothing to do with
  // the engine being mutated — a goalpost, not a catch. The unmutated run is
  // the one that has to answer for src/core/hunt.js, and it does, here.
  if (mutate) return;
  const chargeMin = (ms) => { const c = vigourCharge(ms); return c.addMin + (c.remMs / 60000); };
  // Every partition the design can meet: a browser poll, a set_activity loop,
  // the world tick's flush, a one-second client, and the 17-minute window a
  // capped return produces. None of them may cost a different hour.
  for (const part of [1000, 10000, 45000, 59000, 90000, 17 * 60000]) {
    const n = Math.floor(HOUR / part);
    let split = 0;
    for (let i = 0; i < n; i++) split += chargeMin(part);
    split += chargeMin(HOUR - (n * part));
    ok(Math.abs(chargeMin(HOUR) - split) <= slack,
      `C4: vigourCharge over one hour = ${chargeMin(HOUR)} minutes, but the same hour cut into ${n} `
      + `windows of ${part} ms charges ${split}. The charge is not additive over a partition of the `
      + 'span, so the daily limiter is a function of how often a player settles rather than of elapsed '
      + 'time. src/core/hunt.js vigourCharge must return the sub-minute remainder alongside the whole '
      + 'minutes, and accrual.js must propose BOTH.');
  }
}

// ── HARNESS ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--list')) {
  console.log('vigour-charge-conservation mutations:');
  for (const [id, why] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(22)} ${why}`);
  process.exit(0);
}

const only = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;

if (argv.includes('--selftest')) {
  /* THE ORDINARY DIRECTION, since 2026-09-22: the finding is fixed, so each
     mutation plants the DEFECT back into the engine and every one must be
     CAUGHT, while the shipped engine must be GREEN. (Until the fix landed this
     was the mirror of that — the one mutation was the planted fix and had to
     turn the arms green while the shipped engine stayed red. The history is in
     this file's header; the arms themselves did not move.) */
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    problems.length = 0;
    // eslint-disable-next-line no-await-in-loop
    await run(id);
    const caught = problems.length > 0;
    console.log(`  ${caught ? 'CAUGHT ' : 'MISSED '} ${id} — ${MUTATIONS[id]}`);
    if (!caught) {
      bad += 1;
      console.log('      the arms did not notice the defect being planted back. A mutation that is not '
        + 'caught means this guard would not see the regression either.');
    }
  }
  problems.length = 0;
  await run(null);
  const shippedGreen = problems.length === 0;
  console.log(`  ${shippedGreen ? 'GREEN' : 'RED'}     (shipped engine, unmutated)`);
  if (!shippedGreen) {
    bad += 1;
    for (const p of problems) console.log(`      ${p}`);
  }
  console.log(bad
    ? `\nvigour-charge-conservation --selftest: ${bad} problem(s)`
    : '\nvigour-charge-conservation --selftest: every planted defect is caught and the shipped engine is '
      + 'green — the arms measure the law, not an implementation.');
  process.exit(bad ? 1 : 0);
}

await run(only);
if (problems.length) {
  console.log('vigour-charge-conservation: RED\n');
  for (const p of problems) console.log(`  ✗ ${p}\n`);
  console.log(`${problems.length} problem(s). See docs/planning/SEC_HUNTS_M6_2026-09-22.md finding S1.`);
  process.exit(1);
}
console.log('vigour-charge-conservation: OK — the Vigour charge is conserved under window subdivision.');
