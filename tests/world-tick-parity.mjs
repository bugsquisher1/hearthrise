// ============================================================================
// tests/world-tick-parity.mjs — the WORLD TICK parity guard (step 1, shadow).
//
//   node tests/world-tick-parity.mjs            run the guard
//   node tests/world-tick-parity.mjs --mutate   prove the guard goes RED
//   node tests/world-tick-parity.mjs --verbose  print every measurement
//
// SEVEN CLAIMS (P1, P2, P2b, P3, P4, P5, P6). Each is a property of the tick
// service as a CALLER of the engine the Edge Function already runs; none of
// them re-implements a game rule.
//
//  P1 CONSTRUCTION PARITY. The input object `services/world-tick/shadow.js`
//     builds for `computeAccrual` produces a byte-identical result to the input
//     the accrual path builds for the same window. The engine is shared by
//     construction (one import); what is NOT shared is the dozen named fields
//     each caller has to hand it, and a caller that forgot `activeSinceMs` or
//     sent a cadence as `capMs` would be a different game running on the same
//     maths. This is the AWAY-1 rule pointed at the new caller.
//
//  P2 TIME CONSERVATION UNDER DECOMPOSITION. A span settled as N tick-aligned
//     windows simulates exactly as many combat ticks as the same span settled
//     in one call. This is what the alignment rule in contract.js buys.
//
//  P3 THE ALIGNMENT RULE BITES. The same span settled as N *unaligned* 10 s
//     windows simulates FEWER ticks — `carryMs` is a local in `simulateSpan`
//     and is discarded at every call boundary. P3 is P2's mutation proof,
//     always run, so "we align windows" is a measured fact and not a belief.
//
//  P4 STREAM HEALTH UNDER DECOMPOSITION. A decomposed span does NOT reproduce
//     the one-call span's exact totals and is not supposed to: production seeds
//     every window from a label that NAMES ITS WATERMARK
//     (`hr_seed(user, slot, 'accrue:'||accrued_to)`, hr-accrue/index.ts ~L641),
//     so two settles of different lengths already draw different streams today.
//     What MUST hold is that the decomposed stream is HEALTHY:
//       (a) every drop the one-call path reaches is still reachable when the
//           span is cut into 10 s pieces — a rare roll that fires late in a
//           stream must not be starved by restarting the stream every four
//           ticks, or the "WOW I got something rare" moment is silently zeroed;
//       (b) the value divergence is NOISE, inside a bounded band, and not a
//           systematic drift in either direction.
//     The `fixedSeed` mutation is what P4 is defending against, and it is the
//     measurement that motivated the whole claim: seed every window from one
//     per-character constant and the goblin fixture pays +48% gold and never
//     sees a Goblin Seal, a Goblin Totem or a Bronze Sword at all.
//
//  P5 TICK/SETTLE COMPOSITION. N tick windows followed by an ordinary settle
//     pay every millisecond of the settled span exactly once — no overlap
//     (double-pay), no shortfall (forfeit), and a deferred sub-interval tail.
//     This is the claim that makes the tick agree with `settledWatermarkMs`,
//     which the edge gained on 2026-09-16.
//
//  P6 REAL RECORDED WINDOWS. 1,703 accepted `accrue` windows read READ-ONLY
//     from production (tools/world-tick-replay.mjs) and replayed against
//     `settledWatermarkMs`. The fixture carries window GEOMETRY only.
//
// NO NETWORK AT RUN TIME, NO SUPABASE CLIENT. The P1-P5 fixtures are validated
// against src/data at load; the P6 fixture is a de-identified, value-stripped
// snapshot produced by a separate SELECT-only tool.
// ============================================================================

import { readFileSync } from 'node:fs';
import { loadFixtures, atSpan, CATALOGUES } from '../services/world-tick/fixtures.js';
import { shadowSpan, shadowTick, hydrate, seedFor, advance } from '../services/world-tick/shadow.js';
import { valueSummary, timeSummary, foldDeltas, planWindows, alignWindow }
  from '../services/world-tick/contract.js';
import { analyzeRows, verdict, MISSING_FOR_VALUE_REPLAY, parseWaste } from '../services/world-tick/replay.js';
import { computeAccrual, settledWatermarkMs, CALLER_AUTHORITY, PAYABLE_KINDS }
  from '../supabase/functions/hr-accrue/accrual.js';
/* The GATHER channel, the first tick-owned one (WORLD_TICK_DESIGN.md §15a). */
import {
  loadGatherSessions, atSpan as gAtSpan, settleGatherSession, intentValue,
  tickIntentId, GATHER_CATALOGUES,
} from '../services/world-tick/gather.js';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 10 * 60000;                 // ten minutes: 60+ windows at a 10 s cadence
const TO_MS = FROM_MS + SPAN_MS;
const CADENCE_MS = 10000;                   // Tyler, 2026-09-16: 10 s for the beta
/* P4's band. Decomposition resamples the stream, so the two answers are two
   draws from the same distribution and will never be equal. 15% is wide enough
   that these three fixtures sit well inside it (measured 1.1 / 5.6 / 4.5%) and
   narrow enough that the `fixedSeed` failure mode (+48%) is outside it. Widen
   it only with a measurement, never to make a run green. */
const GOLD_BAND = 0.15;

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      tick:    ${A}\n      accrual: ${B}`);
};
const say = (s) => { if (VERBOSE) console.log(s); };

/* ── THE MUTATIONS ──────────────────────────────────────────────────────────
   Each perturbs the TICK path only, in a way a careless implementation would
   plausibly ship, and each must turn at least one claim red. A guard that has
   never been red is not a guard (CLAUDE.md §4). */
const MUTATIONS = {
  /* The naive implementation: settle exactly the wall-clock cadence and let
     `simulateSpan` throw the sub-tick remainder away. Kills P2. */
  unaligned: { windows: (anchorMs, fromMs, toMs, cadenceMs) => {
    const out = [];
    for (let c = fromMs; c < toMs; c += cadenceMs) {
      const to = Math.min(c + cadenceMs, toMs);
      out.push({ fromMs: c, toMs: to, ms: to - c });
    }
    return out;
  } },
  /* Forgetting that `fight` is an ABSOLUTE checkpoint: every window restarts
     the foe at full HP. Kills P1's chain half and P2 (kills inflate, ticks
     stay). Expressed as an input perturbation so it cannot leak into shadow.js. */
  nofight: { perturb: (inp) => ({ ...inp, fight: {} }) },
  /* Handing the engine the cadence as the accrual cap — the "it is only a
     rename" mistake. Kills P1. */
  capIsCadence: { perturb: (inp) => ({ ...inp, capMs: CADENCE_MS }) },
  /* THE SEEDING MISTAKE, and the one this guard exists for. Seed every window
     from one per-character constant instead of from a label naming the window's
     watermark. Production has never done this (hr-accrue/index.ts ~L641), and a
     tick author reaching for `char.seed` because it is right there would.
     Kills P4 on both arms: +48% gold and three drops that never fire. */
  fixedSeed: { fixedSeed: true },
  /* P5. The tick settles the RAW wall-clock cadence instead of a tick-aligned
     window, and therefore hands `computeAccrual` a window whose remainder is
     non-zero — which, because a tick window is spelled `finalWindow: true`
     today, `settledWatermarkMs` stamps at `now` and FORFEITS. Kills P5b. This
     mutation is also the measurement behind the caller-taxonomy open question:
     the deferral the accrual path gained on 2026-09-16 does NOT reach the tick
     through the flag it is currently borrowing. */
  /* `unalignedTick` USED TO LIVE HERE and was RETIRED on 2026-09-18, which is
     the whole point of the caller taxonomy. It ran the tick phase on raw
     wall-clock windows and killed P5b, because a tick window spelled
     `finalWindow: true` stamped its watermark at `now()` and forfeited the
     sub-action remainder every cadence (12000 / 20640 / 46560 ms of a
     ten-minute span). Under `caller: 'tick'` the same unaligned run forfeits
     NOTHING, so it is no longer a mutation - it is a positive claim, P5d below,
     asserting the forfeit is exactly zero. The mutant that carries the old
     measurement is `callerTick`. A mutation that no longer bites is deleted and
     replaced by the claim it proved, never left in place exiting 0. */
  /* ── THE CALLER TAXONOMY, ONE MUTANT PER VALUE (2026-09-18) ────────────────
     `accrual.js` replaced the boolean `finalWindow` with
     `caller: 'accrue' | 'collect' | 'tick'`. Each of the three has a distinct
     obligation, so each gets a mutant that mislabels it at ITS OWN call site
     and must turn a NAMED claim red. A taxonomy whose values are
     interchangeable in practice is a rename, not a contract. */
  /* 'accrue' mislabelled as 'collect': the cadence poll stops deferring its
     sub-action remainder and stamps now() — the 2026-09-16 carry loss, undone.
     Kills P7a. */
  callerAccrue: { p7: { swap: { accrue: 'collect' } } },
  /* 'collect' mislabelled as 'accrue': the collect-before-switch defers into a
     window that will never come, because the switch restamps `active_since`.
     That is b531 with the sign flipped — the remainder is DESTROYED and the
     pointer moved anyway. Kills P7b. */
  callerCollect: { p7: { swap: { collect: 'accrue' } } },
  /* 'tick' mislabelled as 'collect' — the spelling the spike borrowed —
     against UNALIGNED windows, which is the only condition under which the two
     differ. This is the measurement behind the whole change: 2.0% / 3.5% / 7.8%
     of a ten-minute span forfeited on the three fixtures. Kills P5b (and P7c).
     With `caller: 'tick'` the same unaligned run forfeits nothing, which is
     what `--mutate --unalignedTick` now shows. */
  callerTick: { caller: 'collect', p5: { unaligned: true, caller: 'collect' },
                p7: { swap: { tick: 'collect' } } },
  /* P5. The tick rewinds its own watermark by one action interval — the
     "re-simulate the last tick to be safe" reflex. Every instant in the overlap
     is then simulated twice. Kills P5a and P5b in the DOUBLE-PAY direction,
     which is the direction that mints. */
  rewind: { p5: { rewindTicks: 1 } },
  /* P6. One real recorded boundary is moved by a millisecond. If the replay
     analyser still reports zero mismatches it is not reading production, it is
     decorating it. */
  replayLax: { p6: { nudgeMs: 1 } },
  /* ── THE GATHER CHANNEL'S MUTANTS (step-2 prep, 2026-09-18) ───────────────
     Each is a plausible alternative CALLER of services/world-tick/gather.js,
     applied in the P-G block, and each must turn a NAMED P-G claim red.
     They are declared here so `--mutate --<name>` selects them and so the set
     is readable in one place. */
  /* Chain each poll on the previous poll's `now` instead of on the engine's own
     `delta.accrued_to` — the implementation a reasonable person writes first.
     Throws the sub-action remainder away every cadence. Kills P-G8. */
  gatherWallclock: { gather: true },
  /* Journal `ms` as the SUM of per-poll grantMs. Every deferred tail is
     re-counted, so the away receipt over-states time credited by up to 31%.
     Kills P-G5. */
  gatherSumMs: { gather: true },
  /* One hr_apply call per 10 s poll instead of per flush window: 4.3M ledger
     rows/day at 500 continuously-active characters against a 480,000/day prune
     ceiling. Kills P-G3. */
  gatherPerTickRow: { gather: true },
  /* An idempotency key that does not vary with the window, so the second flush
     replays the first away — value silently lost, not duplicated. Kills P-G4. */
  gatherIdemConst: { gather: true },
  /* A per-action list in the ledger meta: the game_events incident (1.6M rows /
     229 MB from six players in four days) at ledger scale, and a row a player's
     ledger can tell apart from an accrue. Kills P-G6. */
  gatherShapeDrift: { gather: true },
  /* The SQL copy of PAYABLE_KINDS drifts from the engine's. Kills P-G7. */
  gatherPayableDrift: { gather: true },
};
const MUTATION = MUTATE ? (ARGS.find((a) => MUTATIONS[a.replace(/^--/, '')]) || '--unaligned')
  .replace(/^--/, '') : null;

const FIXTURES = loadFixtures();
ok(FIXTURES.length >= 3, `fixture set collapsed to ${FIXTURES.length} characters`);

/* ── The ACCRUAL-ON-RETURN reference call ───────────────────────────────────
   Built here, from the fixture, the way `hr-accrue/index.ts` builds it from
   `hr_state_of` — NOT by asking shadow.js for it. An independent second
   construction is the only kind of parity test worth having (the same rule
   tests/accrual-engine.mjs states for its client column). */
function accrualOnReturn(c, fromMs, toMs, o) {
  return computeAccrual({
    userId: c.userId,
    slot: c.slot,
    nowMs: toMs,
    accruedToMs: fromMs,
    activeSinceMs: c.activeSinceMs,
    activeKind: c.activeKind,
    activeId: c.activeId,
    capMs: c.capMs,
    /* THE WATERMARK LABEL, as hr-accrue/index.ts (~L641) derives it:
       `hr_seed(user, slot, 'accrue:' || accrued_to)`. The reference call's
       watermark is `fromMs`, which is also the tick's FIRST window's watermark
       — which is why P1 can compare them at all. */
    seed: seedFor(c.userId, c.slot, fromMs),
    hp: c.hp,
    maxHp: c.maxHp,
    gold: c.gold,
    skills: c.skills,
    inventory: c.inventory,
    equipment: c.equipment,
    fight: c.fight,
    consecFalls: c.consecFalls,
    recoveringUntilMs: c.recoveringUntilMs,
    bestiaryKills: c.bestiaryKills,
    items: CATALOGUES.items,
    monsters: CATALOGUES.monsters,
    autoEatEnabled: c.autoEatEnabled,
    autoEatPct: c.autoEatPct,
    autoEatFood: c.autoEatFood,
    /* WHO IS SETTLING (accrual.js accrualCaller, 2026-09-18). It was the
       boolean `finalWindow`; it is now a three-value taxonomy, because
       "exempt from the min-span floor" and "stamp now() instead of deferring"
       are two different questions and only 'collect' answers yes to both.
       Stated explicitly at every call site here — a default would let a
       mismatched caller pass P1 by accident, and P1's whole value is that the
       tick and the reference are priced under the SAME contract. */
    caller: (o && o.caller) || 'accrue',
    /* 'collect'/'tick' are fenced behind this imported object identity
       (accrual.js CALLER_AUTHORITY, 2026-09-18): the reference must hold it or
       every arm here would silently price as 'accrue' and P1 would compare two
       different contracts. shadow.js holds it for the same reason. */
    callerAuthority: CALLER_AUTHORITY,
  });
}

const findings = [];

for (const f of FIXTURES) {
  const c = atSpan(f, FROM_MS);
  const N = `[${c.name}]`;

  // ── P1 ────────────────────────────────────────────────────────────────────
  /* 'tick', matching the window shadow.js is about to price. The caller is an
     input to the engine like any other: comparing a 'tick' proposal against an
     'accrue' reference would be comparing two different contracts and P1 would
     fail on `accrued_to` alone. */
  const ref = accrualOnReturn(c, FROM_MS, TO_MS, { caller: 'tick' });
  const one = shadowTick(hydrate(c), FROM_MS, TO_MS, CATALOGUES,
    MUTATION ? MUTATIONS[MUTATION] : {});
  ok(ref.accrued === true, `${N} the accrual reference paid nothing (reason: ${ref.reason})`);
  ok(one.accrued === true, `${N} the tick paid nothing (reason: ${one.reason})`);
  if (!ref.accrued || !one.accrued) continue;
  eq(one.delta, ref.delta, `P1 ${N} the tick's proposed delta differs from accrual's for the SAME window`);
  eq(valueSummary(one), valueSummary(ref), `P1 ${N} value summary differs`);

  // ── P2 / P3 ───────────────────────────────────────────────────────────────
  const chain = shadowSpan(c, FROM_MS, TO_MS, CATALOGUES,
    Object.assign({ cadenceMs: CADENCE_MS }, MUTATION ? MUTATIONS[MUTATION] : {}));
  const chainTime = chain.results.reduce((a, r) => {
    const t = timeSummary(r.res);
    return { ticks: a.ticks + t.ticks, recoverMs: a.recoverMs + t.recoverMs, grantMs: a.grantMs + t.grantMs };
  }, { ticks: 0, recoverMs: 0, grantMs: 0 });
  const refTime = timeSummary(ref);

  ok(chain.windows.length >= 50,
    `P2 ${N} the chain collapsed to ${chain.windows.length} windows — a one-window chain proves nothing`);
  eq(chainTime.ticks, refTime.ticks,
    `P2 ${N} tick-aligned decomposition LOST time: ${chainTime.ticks} ticks over ${chain.windows.length} windows vs ${refTime.ticks} in one call`);
  /* The credited ms are NOT equal, and must not be: the aligned chain stops at
     the last whole combat tick, so up to `tickMs - 1` ms of the span is still
     UNSETTLED when the chain ends. That tail is DEFERRED (the next tick's
     window starts where this one ended), never forfeited — which is exactly the
     property that has to be asserted, because a tail that grew past one tick
     would be time quietly disappearing every window. */
  const tailMs = refTime.grantMs - chainTime.grantMs;
  ok(tailMs >= 0 && tailMs < chain.tickMs,
    `P2 ${N} the unsettled tail is ${tailMs}ms, which is not inside [0, ${chain.tickMs}) — aligned decomposition is dropping whole ticks, not deferring a remainder`);
  say(`   P2 ${N} ticks ${chainTime.ticks}==${refTime.ticks}, deferred tail ${tailMs}ms < tickMs ${chain.tickMs}`);

  /* ── P2b CHECKPOINT CONTINUITY ────────────────────────────────────────────
     Window i must be handed window i-1's ABSOLUTE checkpoints. `fight` is the
     one that decides whether a half-killed foe survives the window boundary;
     dropping it restarts the monster at full HP sixty times an hour, which
     reads as "away combat is slower than attended" and is unfindable from a
     receipt. Asserted on the input the engine actually received. */
  for (let i = 1; i < chain.results.length; i++) {
    const prev = chain.results[i - 1];
    const cur = chain.results[i];
    if (!prev.res.accrued) continue;
    for (const key of ['fight', 'consec_falls', 'recovering_until']) {
      const field = { fight: 'fight', consec_falls: 'consecFalls', recovering_until: 'recoveringUntilMs' }[key];
      if (typeof prev.res.delta[key] === 'undefined') continue;
      const expect = key === 'recovering_until'
        ? (prev.res.delta[key] ? Date.parse(prev.res.delta[key]) : 0)
        : prev.res.delta[key];
      eq(cur.input[field], expect,
        `P2b ${N} window ${i} was NOT handed window ${i - 1}'s "${key}" checkpoint`);
      if (problems.length > 24) break;
    }
    if (problems.length > 24) break;
  }

  /* P3 — the alignment rule's own mutation proof, run on every green pass.
     Skipped under --mutate=unaligned, where the unaligned path IS the run. */
  if (MUTATION !== 'unaligned') {
    const naive = shadowSpan(c, FROM_MS, TO_MS, CATALOGUES,
      { cadenceMs: CADENCE_MS, windows: MUTATIONS.unaligned.windows });
    const naiveTicks = naive.results.reduce((a, r) => a + timeSummary(r.res).ticks, 0);
    ok(naiveTicks < refTime.ticks,
      `P3 ${N} UNALIGNED windows simulated ${naiveTicks} ticks, aligned/one-call ${refTime.ticks} — the alignment rule is not biting, so contract.js's RULE 1 is either fixed upstream or no longer load-bearing. Re-read it before deleting.`);
    say(`   P3 ${N} unaligned=${naiveTicks} aligned=${refTime.ticks} (loss ${refTime.ticks - naiveTicks} ticks, ${(100 * (refTime.ticks - naiveTicks) / refTime.ticks).toFixed(1)}%)`);
  }

  // ── P4 ────────────────────────────────────────────────────────────────────
  const folded = foldDeltas(chain.results.filter((r) => r.res.accrued).map((r) => r.res.delta));
  const refD = ref.delta;
  const lostIds = Object.keys(refD.items || {}).filter((id) => !(folded.items || {})[id]);
  const extraIds = Object.keys(folded.items || {}).filter((id) => !(refD.items || {})[id]);
  const goldDrift = refD.gold ? (folded.gold - refD.gold) / refD.gold : 0;

  ok(lostIds.length === 0,
    `P4 ${N} STARVED DROPS: the decomposed span never reached ${lostIds.join(', ')}, which the one-call span did. A rare roll that only fires late in a stream is being deleted by cutting the span up — this is the "WOW I got something rare" moment going silently to zero.`);
  ok(extraIds.length === 0,
    `P4 ${N} the decomposed span reached ${extraIds.join(', ')} which the one-call span did not. Not necessarily wrong (different stream, same distribution) but it means the two spans are sampling differently enough to notice — re-read the seeding before accepting it.`);
  ok(Math.abs(goldDrift) <= GOLD_BAND,
    `P4 ${N} value drift ${(goldDrift * 100).toFixed(1)}% is outside the +/-${GOLD_BAND * 100}% band (tick ${folded.gold || 0}, accrual ${refD.gold || 0}). Decomposition is meant to be NOISE against the one-call answer, not a drift with a direction.`);

  findings.push({
    fixture: c.name, windows: chain.windows.length, tickMs: chain.tickMs,
    gold: { tick: folded.gold || 0, accrual: refD.gold || 0, driftPct: +(goldDrift * 100).toFixed(1) },
    xp: { tick: sum(folded.xp), accrual: sum(refD.xp) },
  });
  say(`   P4 ${N} gold tick=${folded.gold || 0} accrual=${refD.gold || 0} (${(goldDrift * 100).toFixed(1)}%); drops reached by both: ${Object.keys(refD.items || {}).sort().join(', ')}`);
}

// ── The alignment primitive, directly ────────────────────────────────────────
{
  const a = alignWindow(1000, 1000, 11000, 2400);
  eq(a, { fromMs: 1000, toMs: 10600, ms: 9600 }, 'alignWindow snapped wrongly');
  const w = planWindows(0, 0, 60000, 10000, 2400);
  ok(w.length > 0 && w.every((x) => x.ms % 2400 === 0), 'planWindows emitted a non-aligned window');
  ok(w[0].fromMs === 0 && w[w.length - 1].toMs <= 60000, 'planWindows ran past the span');
  for (let i = 1; i < w.length; i++) {
    ok(w[i].fromMs === w[i - 1].toMs, `planWindows left a gap at window ${i} — time would be lost`);
  }
  /* The fold law refuses a key it does not know, which is what stops a shadow
     comparison agreeing with a delta hr_apply would 409. */
  let threw = false;
  try { foldDeltas([{ gold: 1 }, { some_new_key: 2 }]); } catch { threw = true; }
  ok(threw, 'foldDeltas accepted an unclassified delta key');
}

/* ── P5 TICK/SETTLE COMPOSITION ─────────────────────────────────────────────
   The edge gained `settledWatermarkMs` on 2026-09-16: an uncapped settle now
   advances `accrued_to` by the time the simulation ACCOUNTED for, not to
   `now()`, so the sub-tick remainder is deferred instead of destroyed. The
   world tick is about to produce that boundary every ten seconds, and the two
   have to compose: N tick windows followed by an ordinary settle must pay every
   millisecond of the settled span exactly ONCE.

   Stated as three arithmetic claims over one span, driven through the REAL
   engine and the REAL watermark (the chain advances on `delta.accrued_to`, not
   on a number this test computed):

     P5a NO OVERLAP.   Each window starts exactly where the previous window's
                       watermark landed, and the settle starts at the last one.
                       An overlap is time paid twice — the minting direction.
     P5b NO DROP.      accounted time (ticks x interval, plus recovery) summed
                       over the tick phase AND the settle equals the settled
                       span end-to-end. A shortfall is time deleted.
     P5c TAIL DEFERRED The only unsettled time at the end is the tail after the
                       last watermark, and it is strictly less than one action
                       interval — i.e. still owed, not forfeited.

     P5d NO ALIGNMENT DEPENDENCE. The same span on raw wall-clock windows
                       forfeits zero. (2026-09-18. It did not: a tick window was
                       spelled `finalWindow: true`, `settledWatermarkMs` stamped
                       `now()` for it, and the tick was protected from the carry
                       loss ONLY by `alignWindow` zeroing the remainder - two
                       mechanisms having to agree, one of them named the
                       opposite of what it did. Measured forfeit with alignment
                       off: 12000 / 20640 / 46560 ms of a ten-minute span
                       (2.0 / 3.5 / 7.8%). `caller: 'tick'` defers it instead;
                       `--mutate --callerTick` restores the old spelling and
                       reproduces those exact numbers.) */
function tickThenSettle(c, fromMs, handoverMs, toMs, o) {
  const opt = o || {};
  const char = hydrate(c);
  const probe = shadowTick(hydrate(c), fromMs, toMs, CATALOGUES, {});
  const tickMs = Number(probe.tickMs) || 2400;
  const anchor = Number(c.activeSinceMs) || fromMs;
  /* The label the tick settles its windows under. 'tick' in production; the
     `callerTick` mutation swaps it for the pre-2026-09-18 borrowed 'collect'
     so the forfeit that spelling causes is MEASURED rather than argued. */
  const tickOpts = opt.caller ? { caller: opt.caller } : {};
  const steps = [];
  let wm = fromMs;
  let guard = 0;
  while (wm < handoverMs && guard++ < 5000) {
    const rawTo = Math.min(wm + CADENCE_MS, handoverMs);
    const w = opt.unaligned ? { fromMs: wm, toMs: rawTo } : alignWindow(anchor, wm, rawTo, tickMs);
    if (w.toMs <= w.fromMs) {                 // cadence shorter than one action
      const next = w.fromMs + tickMs;
      if (next > handoverMs) break;
      wm = next; continue;
    }
    const res = shadowTick(char, w.fromMs, w.toMs, CATALOGUES, tickOpts);
    /* A WINDOW THE ENGINE WOULD NOT PRICE LEAVES THE WATERMARK WHERE IT IS.
       Advancing `wm` past an unpriced window is the forfeit the whole deferral
       rule exists to prevent, and on an UNALIGNED chain it is reachable: the
       last window before the handover can be a sub-action sliver the engine
       declines. Leaving `wm` put means the handover settle prices that sliver,
       which is exactly what a real tick would do - the pointer is untouched, so
       the next caller sees the longer span. Break rather than continue: the
       window cannot get any longer inside this phase. */
    if (!res.accrued) break;
    /* THE WATERMARK THE ENGINE ITSELF STAMPED. Not recomputed here — the whole
       claim is that the tick chains on the value hr_apply would store. */
    const stamped = Date.parse(res.delta.accrued_to);
    const s = res.summary || {};
    steps.push({
      fromMs: w.fromMs, toMs: w.toMs, watermark: stamped,
      accounted: Number(s.ticks || 0) * tickMs + Number(s.recoverMs || 0) + Number(s.idleMs || 0),
    });
    advance(char, res);
    wm = stamped - (Number(opt.rewindTicks || 0) * tickMs);
  }
  /* THE HANDOVER SETTLE is an ordinary settle ('accrue'), not a collect, so its
     own sub-interval remainder is deferred by settledWatermarkMs rather than
     stamped away. That is the half of the composition the tick does not control
     and must not break. */
  const settle = accrualOnReturn(char, wm, toMs, { caller: 'accrue' });
  const ss = settle.summary || {};
  return {
    tickMs, steps, settle,
    settleFromMs: wm,
    settleWatermark: settle.accrued ? Date.parse(settle.delta.accrued_to) : wm,
    settleAccounted: settle.accrued
      ? Number(ss.ticks || 0) * tickMs + Number(ss.recoverMs || 0) + Number(ss.idleMs || 0) : 0,
  };
}

for (const f of FIXTURES) {
  const c = atSpan(f, FROM_MS);
  const N = `[${c.name}]`;
  const p5 = (MUTATION && MUTATIONS[MUTATION].p5) || {};
  const HANDOVER = FROM_MS + 5 * 60000;          // 5 min of 10 s ticks, then a settle
  const r = tickThenSettle(c, FROM_MS, HANDOVER, TO_MS, p5);

  ok(r.steps.length >= 25,
    `P5 ${N} the tick phase collapsed to ${r.steps.length} windows — a short chain proves nothing about composition`);

  // P5a — no overlap, no gap, across the tick chain AND the handover.
  for (let i = 1; i < r.steps.length; i++) {
    if (r.steps[i].fromMs !== r.steps[i - 1].watermark) {
      problems.push(`P5a ${N} window ${i} starts at ${r.steps[i].fromMs} but window ${i - 1}'s watermark landed at ${r.steps[i - 1].watermark} — ${r.steps[i].fromMs < r.steps[i - 1].watermark ? 'time is being paid TWICE' : 'time is being skipped'}`);
      break;
    }
  }
  const last = r.steps[r.steps.length - 1];
  ok(!last || r.settleFromMs === last.watermark,
    `P5a ${N} the settle after the tick phase starts at ${r.settleFromMs}, not at the last tick watermark ${last && last.watermark}`);

  // P5b — every accounted millisecond, exactly once, over the settled span.
  const accounted = r.steps.reduce((a, s) => a + s.accounted, 0) + r.settleAccounted;
  const settled = r.settleWatermark - FROM_MS;
  eq(accounted, settled,
    `P5b ${N} accounted time and settled span disagree: the tick phase + settle accounted for ${accounted}ms but moved the watermark ${settled}ms. ${accounted < settled ? 'The watermark moved further than the simulation accounted for: time was SETTLED PAST WITHOUT BEING SIMULATED (forfeited).' : 'The simulation accounted for more time than the watermark moved: instants were SIMULATED TWICE (double-pay, the minting direction).'}`);

  // P5c — the only unsettled time is a sub-interval tail, still owed.
  const tail = TO_MS - r.settleWatermark;
  ok(tail >= 0 && tail < r.tickMs,
    `P5c ${N} the unsettled tail after the settle is ${tail}ms, outside [0, ${r.tickMs}) — whole actions are being forfeited at the handover, not deferred`);
  /* P5d - ALIGNMENT IS NO LONGER LOAD-BEARING FOR THE CARRY. Until 2026-09-18
     two independent mechanisms had to agree for the tick to be correct:
     `alignWindow` (which zeroes the remainder) and the watermark rule (which
     defers it) - and the second one was disabled for tick windows by the
     borrowed `finalWindow` spelling, so alignment was carrying it alone. Run
     the SAME span on raw wall-clock windows and the forfeit must now be ZERO.
     Measured under the old spelling: 12000 / 20640 / 46560 ms (2.0 / 3.5 /
     7.8%), which `--mutate --callerTick` still reproduces. */
  if (!MUTATION) {
    const u = tickThenSettle(c, FROM_MS, HANDOVER, TO_MS, { unaligned: true });
    const uAccounted = u.steps.reduce((a, s) => a + s.accounted, 0) + u.settleAccounted;
    const uSettled = u.settleWatermark - FROM_MS;
    eq(uAccounted, uSettled,
      `P5d ${N} with alignWindow OFF the tick forfeits ${uSettled - uAccounted}ms of a ${TO_MS - FROM_MS}ms span. caller='tick' must defer the sub-action remainder on its own; alignment is a performance property, not the carry's only defence`);
    say(`   P5d ${N} unaligned: ${u.steps.length} windows, accounted ${uAccounted} == settled ${uSettled} (forfeit 0)`);
  }
  say(`   P5 ${N} ${r.steps.length} tick windows @${r.tickMs}ms + 1 settle; accounted ${accounted} == settled ${settled}; tail ${tail}ms`);
}

/* ── P6 REAL RECORDED WINDOWS ───────────────────────────────────────────────
   The other four claims are fixtures. This one is production: 1,703 accepted
   `accrue` windows read READ-ONLY from public.player_ledger over 14 days
   (tools/world-tick-replay.mjs, SELECT-only, token as file bytes), with the
   user ids replaced and every value field stripped — the fixture carries window
   GEOMETRY only (ms, from, to, ticks, capped).

   The claim is the one the journal can answer without inventing state: every
   boundary between two consecutive real windows is the instant
   `settledWatermarkMs` computes from the FIRST window's own journalled numbers.
   Measured 2026-09-18: 118 boundaries proven, 0 disagreements, action intervals
   inferred from 2352 ms to 11200 ms.

   It does NOT claim a value replay. That needs the window's starting state and
   its seed, and the journal carries neither (the seed by design — `hr_seed`
   mixes a 256-bit secret behind RLS). See services/world-tick/replay.js. */
{
  const p6 = (MUTATION && MUTATIONS[MUTATION].p6) || {};
  let rows = JSON.parse(readFileSync(new URL('./fixtures/world-tick-real-windows.json', import.meta.url), 'utf8'));
  if (p6.nudgeMs) {
    rows = rows.map((x) => x);
    /* Move the START of every window by a millisecond. Every boundary the
       analyser can speak about then disagrees with the watermark the previous
       window implies, and a decorative analyser would still say zero. */
    rows = rows.map((x) => ({ ...x, meta: { ...x.meta, from: new Date(Date.parse(x.meta.from) + p6.nudgeMs).toISOString() } }));
  }
  const a = analyzeRows(rows);
  const v = verdict(a);
  ok(a.pairs >= 1000, `P6 the real-window fixture collapsed to ${a.pairs} consecutive pairs`);
  ok(v.proven >= 100,
    `P6 only ${v.proven} real boundaries could be proven against settledWatermarkMs (was 118 on 2026-09-18) — either the fixture shrank or the journal stopped carrying the geometry`);
  ok(v.failed === 0,
    `P6 ${v.failed} REAL recorded boundaries disagree with settledWatermarkMs. This is production telling us the watermark contract the tick is about to adopt is not the one the edge is running. First: ${JSON.stringify(a.mismatches[0] || null)}`);
  /* The honesty half: the missing-field list must not quietly shrink, because
     shrinking it is how "we can replay values now" gets claimed without the
     journalling lane having landed. */
  ok(MISSING_FOR_VALUE_REPLAY.length === 9,
    `P6 MISSING_FOR_VALUE_REPLAY is now ${MISSING_FOR_VALUE_REPLAY.length} fields, not 9 - if the journal really gained a field, add the replay arm that uses it (P7d); do not just shorten the list`);
  /* THE 14-DAY FIXTURE PREDATES `meta.w` AND MUST STILL READ AS UNPROVABLE.
     The whole honesty claim of the journalling change is "old rows stay old":
     if adding the field had retroactively moved historical rows out of the
     `unaccounted` bucket, the parser would be guessing rather than reading. */
  ok(a.withWaste === 0 && a.byBucket.unaccounted === 5,
    `P6 the pre-2026-09-18 fixture reports ${a.withWaste} pairs carrying meta.w and ${a.byBucket.unaccounted} unaccounted (expected 0 and 5) - adding a journal field must not reclassify rows that never had it`);
  say(`   P6 real windows: ${a.pairs} pairs, ${v.proven} proven, ${v.failed} failed, ${a.byBucket.unaccounted} unaccounted, intervals ${a.tickMsSeen.length}`);
}

/* -- P7 THE CALLER TAXONOMY, AND THE `w` TERMS THAT MAKE A WINDOW PROVABLE ---
   Two changes land together on 2026-09-18 and this claim grades both.

   P7-CALLER. `finalWindow` (boolean) became `caller: 'accrue'|'collect'|'tick'`
   because the boolean was answering two questions with one bit:

     | caller    | ACCRUE_MIN_MS floor | sub-action remainder |
     |-----------|---------------------|----------------------|
     | 'accrue'  | APPLIES             | DEFERRED             |
     | 'collect' | exempt              | stamped at now()     |
     | 'tick'    | exempt              | DEFERRED             |

   'tick' is the row the boolean could not spell, and spelling it as 'collect'
   (which the spike did) forfeits the remainder every cadence - see
   `--mutate --callerTick`, which measures the cost on P5b.

   P7-W. The accrue journal's `meta` gained ONE key, `w = "<recoverMs>,<idleMs>"`,
   omitted when both are zero. It turns `accounted = ticks x interval + rms +
   ims` into an identity the ledger can be replayed on instead of an inference
   that breaks whenever a player dies. P7d drives it end to end: the ENGINE's
   own journal row, through the REAL replay analyser, back to the REAL
   watermark. Nothing in this block is a hand-written row. */
{
  const swap = (MUTATION && MUTATIONS[MUTATION].p7 && MUTATIONS[MUTATION].p7.swap) || {};
  const as = (k) => swap[k] || k;
  const c = atSpan(FIXTURES[0], FROM_MS);
  /* A window with a genuine sub-action remainder: 90 s is not a whole number of
     any fixture's action interval. Priced three times, once per caller. */
  const T = FROM_MS + 90000;
  const stampOf = (k) => {
    const r = accrualOnReturn(c, FROM_MS, T, { caller: as(k) });
    return r.accrued ? Date.parse(r.delta.accrued_to) : null;
  };
  const wmAccrue = stampOf('accrue');
  const wmCollect = stampOf('collect');
  const wmTick = stampOf('tick');
  ok(wmAccrue !== null && wmAccrue < T,
    `P7a caller='accrue' stamped ${wmAccrue} for a window ending at ${T} - the cadence poll must DEFER its sub-action remainder, not forfeit it (the 2026-09-16 carry rule)`);
  ok(wmCollect === T,
    `P7b caller='collect' stamped ${wmCollect}, not ${T} - the collect-before-switch has no next window to defer INTO (the switch restamps active_since), so deferring DESTROYS the remainder and moves the pointer anyway. That is b531 with the sign flipped.`);
  ok(wmTick === wmAccrue && wmTick !== null && wmTick < T,
    `P7c caller='tick' stamped ${wmTick} but an ordinary settle of the same window stamped ${wmAccrue} - a tick window's NEXT window starts at this watermark, so it defers exactly like an accrue`);
  /* The floor, which is the OTHER question the boolean was conflating. */
  const SHORT = FROM_MS + 5000;
  const floorOf = (k) => accrualOnReturn(c, FROM_MS, SHORT, { caller: as(k) }).accrued;
  ok(floorOf('accrue') === false && floorOf('collect') === true && floorOf('tick') === true,
    `P7e ACCRUE_MIN_MS refused a 5 s window as accrue=${floorOf('accrue')} collect=${floorOf('collect')} tick=${floorOf('tick')} - a cadence poll below the floor is DEFERRED (refused, paid later), while a collect and a tick have no later call and must be priced`);

  // -- P7d. The journal row the engine wrote, replayed by the real analyser ---
  const w1 = accrualOnReturn(c, FROM_MS, T, { caller: as('accrue') });
  const wm1 = w1.accrued ? Date.parse(w1.delta.accrued_to) : FROM_MS;
  const w2 = accrualOnReturn(c, wm1, wm1 + 90000, { caller: as('accrue') });
  if (!w1.accrued || !w2.accrued) {
    problems.push(`P7d the fixture could not produce two consecutive payable windows (${w1.reason} / ${w2.reason}) - the arm proves nothing`);
  } else {
    const row = (r, at) => ({ user_id: 'p7', slot: 0, kind: r.delta.journal.kind,
                              at: new Date(at).toISOString(), meta: r.delta.journal.meta });
    const rows = [row(w1, T), row(w2, wm1 + 90000)];
    const an = analyzeRows(rows);
    ok((an.byBucket.watermark_exact || 0) === 1 && (an.byBucket.watermark_mismatch || 0) === 0,
      `P7d the replay analyser could not prove the boundary between two windows the ENGINE itself produced and journalled: ${JSON.stringify(an.byBucket)}. The journal's own arithmetic must close on the engine's own watermark, or the ledger is not auditable.`);
    const waste = parseWaste(w1.delta.journal.meta.w);
    const s1 = w1.summary || {};
    const lost = Math.floor(Number(s1.recoverMs) || 0) + Math.floor(Number(s1.idleMs) || 0);
    ok(lost > 0 ? !!waste && waste.recoverMs + waste.idleMs === lost : waste === null,
      `P7d-w the window's summary reports ${lost} ms of non-paying time and meta.w says ${JSON.stringify(w1.delta.journal.meta.w ?? null)} - w must carry exactly recoverMs+idleMs, and be OMITTED when both are zero so an ordinary row stays byte-for-byte what it was`);
    /* THE OLD-ROW ARM. Strip `w` (i.e. every row written before 2026-09-18) and
       the analyser must fall back to the old inference. It may still prove a
       boundary where there was no waste to miss; what it must NEVER do is claim
       a proof derived from a field that is not on the row. */
    const stripped = rows.map((r) => { const m = { ...r.meta }; delete m.w; return { ...r, meta: m }; });
    const anOld = analyzeRows(stripped);
    ok(anOld.withWaste === 0 && (anOld.byBucket.watermark_mismatch || 0) === 0,
      `P7d-old a row with no meta.w reported ${anOld.withWaste} waste-backed pairs and ${anOld.byBucket.watermark_mismatch} mismatches - pre-2026-09-18 rows must read as unprovable, never as a guess`);
    say(`   P7 deferred: accrue ${T - wmAccrue}ms / collect ${T - wmCollect}ms / tick ${T - wmTick}ms; meta.w=${JSON.stringify(w1.delta.journal.meta.w ?? null)}; replay ${JSON.stringify(an.byBucket)}`);

    /* -- P7f. A WINDOW WITH A DEATH IN IT, WHICH IS THE CASE `w` EXISTS FOR ---
       The three 90 s windows above carry no `w` at all (nobody died, nothing
       idled) and that is the common case: the key is absent and the row is
       byte-for-byte what it shipped. The case that MATTERS is a long foodless
       night, where the recovery clock eats real time - and that is precisely
       the shape the 14-day production replay could not judge (5 pairs in the
       `unaccounted` bucket, two of them with a journalled death). Drive it end
       to end: the foodless grinder, the engine's own journal row, the real
       analyser, the real watermark. */
    /* 2 h + 1234 ms: long enough for the recovery clock to bite (the fixture is
       the foodless grinder) and NOT a whole number of its own action interval,
       so the window has a real sub-action deferral for the boundary to land on.
       A round span flushes at now() and is honestly unprovable either way. */
    const NIGHT = 2 * 3600000 + 1234;
    const n1 = accrualOnReturn(c, FROM_MS, FROM_MS + NIGHT, { caller: as('accrue') });
    const nwm = n1.accrued ? Date.parse(n1.delta.accrued_to) : 0;
    const n2 = n1.accrued ? accrualOnReturn(c, nwm, nwm + 90000, { caller: as('accrue') }) : { accrued: false };
    ok(n1.accrued && Number(n1.summary.recoverMs) > 0,
      `P7f the foodless fixture reported recoverMs=${n1.accrued ? n1.summary.recoverMs : 'n/a'} - without a window that actually spends non-paying time this arm proves nothing about w`);
    if (n1.accrued && n2.accrued) {
      const nrows = [row(n1, FROM_MS + NIGHT), row(n2, nwm + 90000)];
      const nAn = analyzeRows(nrows);
      const nWaste = parseWaste(n1.delta.journal.meta.w);
      ok(!!nWaste && nWaste.recoverMs === Math.floor(Number(n1.summary.recoverMs)),
        `P7f meta.w = ${JSON.stringify(n1.delta.journal.meta.w ?? null)} does not carry the summary's recoverMs ${n1.summary.recoverMs}`);
      ok(nAn.withWaste === 1 && (nAn.byBucket.watermark_exact || 0) === 1,
        `P7f the replay could not use meta.w to prove a window containing a death: withWaste=${nAn.withWaste} buckets=${JSON.stringify(nAn.byBucket)}`);
      /* AND THE SAME ROW WITHOUT `w` MUST BE UNPROVABLE. This is the honesty
         claim in one assertion: the proof came from the journalled field, not
         from the analyser being generous. If stripping `w` still "proved" the
         boundary, `w` would be decoration. */
      const nStrip = nrows.map((r) => { const m = { ...r.meta }; delete m.w; return { ...r, meta: m }; });
      const nOld = analyzeRows(nStrip);
      ok((nOld.byBucket.watermark_exact || 0) === 0 && (nOld.byBucket.watermark_mismatch || 0) === 0,
        `P7f-old the SAME window with meta.w stripped still reported ${JSON.stringify(nOld.byBucket)} - a pre-2026-09-18 row containing a death must be UNPROVABLE (the bucket the 5 production pairs sit in), otherwise w is decoration`);
      say(`   P7f waste window: w=${JSON.stringify(n1.delta.journal.meta.w)}; with w ${JSON.stringify(nAn.byBucket)}; without w ${JSON.stringify(nOld.byBucket)}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// P-G — THE GATHER CHANNEL, END TO END (step-2 preparation, 2026-09-18)
//
// The decision on record (WORLD_TICK_DESIGN.md §15a) is that the FIRST
// tick-owned channel is gather. P1..P7 above prove the tick can decompose a
// span; these arms prove the thing that actually ships: that a chain of 10 s
// polls, folded into one hr_apply intent per flush window, pays a gathering
// character EXACTLY what accrual-on-return would have paid them, writes far
// fewer rows than ticks, replays safely, and cannot be told apart from an
// accrue row in a player's ledger.
//
// Every arm is a claim about services/world-tick/gather.js, and every mutation
// below perturbs THE CALLER — a plausible alternative implementation — never
// the module under test.
// ═══════════════════════════════════════════════════════════════════════════
{
  const G_SPAN_MS = 10 * 60000;
  const G_TO = FROM_MS + G_SPAN_MS;
  const gm = (MUTATION || '').startsWith('gather') ? MUTATION : null;

  const sessions = loadGatherSessions();
  ok(sessions.length >= 3, `gather fixture set collapsed to ${sessions.length} sessions`);

  /* The ACCRUAL-ON-RETURN reference for a gather span, built here from the
     session the way hr-accrue/index.ts builds it from hr_state_of — an
     independent second construction, for the reason accrualOnReturn states. */
  const gatherReference = (s) => computeAccrual({
    userId: s.userId, slot: s.slot,
    nowMs: G_TO, accruedToMs: FROM_MS,
    activeSinceMs: s.activeSinceMs, activeKind: 'gather', activeId: s.activeId,
    capMs: s.capMs,
    seed: seedFor(s.userId, s.slot, FROM_MS),
    hp: s.hp, maxHp: s.maxHp, gold: s.gold,
    skills: s.skills, inventory: s.inventory, equipment: s.equipment,
    toolCarry: s.toolCarry,
    items: GATHER_CATALOGUES.items, monsters: {}, nodes: GATHER_CATALOGUES.nodes,
    caller: 'accrue', callerAuthority: CALLER_AUTHORITY,
  });

  for (const s0 of sessions) {
    const s = gAtSpan(s0, FROM_MS);
    const run = settleGatherSession(s, FROM_MS, G_TO, {});
    const ref = gatherReference(s);
    const val = intentValue(run.intents);

    /* ── P-G1. VALUE PARITY, EXACT ─────────────────────────────────────────
       Not a band. Gathering has no rare roll and no combat variance: the yield
       is a catalogue quantity and the XP is `grantXp` over a tick count, so a
       correct decomposition is EQUAL, digit for digit, and anything less is a
       bug being tolerated. `tool_carry` is included because it is the channel's
       one piece of carried server state — the sub-action remainder of the tool
       double roll — and dropping it is a slow, invisible under-pay. */
    ok(ref.accrued, `P-G1 the reference accrual refused "${s.name}" (${ref.reason}) - nothing to compare`);
    if (ref.accrued) {
      const refXp = JSON.stringify(sortMap(ref.delta.xp));
      const refIt = JSON.stringify(sortMap(ref.delta.items));
      eq(JSON.stringify(val.xp), refXp, `P-G1 xp "${s.name}": tick ${JSON.stringify(val.xp)} vs accrual ${refXp}`);
      eq(JSON.stringify(val.items), refIt, `P-G1 items "${s.name}": tick ${JSON.stringify(val.items)} vs accrual ${refIt}`);
      eq(val.ticks, Number(ref.summary.ticks), `P-G1 ticks "${s.name}"`);
      /* THE CARRY IS THE ONE TERM THAT IS NOT BIT-EXACT, and the reason is
         worth stating rather than hiding behind a loose comparison. The tool
         carry is a FRACTION of a pending tool-double; accrual rounds it once at
         the end of the span, the tick rounds it at the end of every window and
         feeds the rounded value back in. Measured on the mining fixture over
         ten minutes: 0.279999995 vs 0.280000000 — a drift of 5e-9, i.e. 5e-9
         of one extra ore, and it cannot compound into a free double because the
         carry is re-hydrated from the server every roster call and is bounded
         in [0,1). The bar is therefore "indistinguishable at any scale a player
         can reach", expressed as 1e-6 of one action — six orders of magnitude
         below one yield — and NOT "close enough", which is how a band becomes
         a leak. Every other term above is exact. */
      const CARRY_EPS = 1e-6;
      const lastCarry = run.intents.length
        ? run.intents[run.intents.length - 1].args.p_delta.tool_carry : undefined;
      const refCarry = ref.delta.tool_carry;
      if (refCarry == null || lastCarry == null) {
        eq(JSON.stringify(lastCarry ?? null), JSON.stringify(refCarry ?? null),
          `P-G1 tool_carry "${s.name}": one side carries the key and the other does not (tick ${JSON.stringify(lastCarry ?? null)}, accrual ${JSON.stringify(refCarry ?? null)})`);
      } else {
        const keys = [...new Set([...Object.keys(lastCarry), ...Object.keys(refCarry)])];
        for (const k of keys) {
          const d = Math.abs(Number(lastCarry[k] || 0) - Number(refCarry[k] || 0));
          ok(d < CARRY_EPS,
            `P-G1 tool_carry "${s.name}" ${k}: tick ${lastCarry[k]} vs accrual ${refCarry[k]} (drift ${d}, bar ${CARRY_EPS})`);
        }
      }
      /* A session with NO carry column must emit NO carry key: emitting
         tool_carry against an hr_apply that does not implement it is
         unknown_delta_key, a 409 that costs the window (accrual.js). */
      if (s.toolCarry === null) {
        ok(run.intents.every((i) => !('tool_carry' in i.args.p_delta)),
          `P-G1 "${s.name}" has no tool_carry column and the tick emitted the key anyway`);
      }
    }

    /* ── P-G9. AWAY-1 ACROSS THE CALLER, WINDOW BY WINDOW ──────────────────
       P-G1 above compares N tick windows against ONE accrual call over the
       whole span — the "does decomposing the span change the answer" question.
       This is the other half, and it is the one the milestone's writer-change
       actually needs: THE SAME WINDOW BOUNDARIES, settled by the tick caller
       and by the accrue caller, must produce a BYTE-IDENTICAL delta.

       It is a different claim from P1 (which compares constructions) because it
       runs the whole chain: each window is fed the previous window's settled
       watermark and carried state, and only `caller` differs between the two
       runs. If a tick window ever paid differently from an accrue window over
       the same instants, "the tick is just another caller of the same engine"
       would be false and AWAY-12's one-engine rule would be broken.

       THE BOUNDARIES ARE FLUSH-SIZED (90 s), NOT CADENCE-SIZED, and that is
       forced rather than chosen: `caller:'accrue'` keeps the ACCRUE_MIN_MS
       floor, so a 10 s window under that spelling is refused by design
       (accrual.js accrualCaller). Comparing at the flush boundary is therefore
       the largest window where BOTH callers are legal — and it is exactly the
       unit `hr_tick_settle` is handed, which is what makes it the right one. */
    const PG9_WINDOW = 90000;
    const pg9 = (caller) => {
      const ch = hydrate(gAtSpan(s0, FROM_MS));
      let wm = FROM_MS; const out = [];
      for (let clock = FROM_MS + PG9_WINDOW; clock <= G_TO; clock += PG9_WINDOW) {
        const res = computeAccrual({
          userId: ch.userId, slot: ch.slot,
          nowMs: clock, accruedToMs: wm,
          activeSinceMs: ch.activeSinceMs, activeKind: 'gather', activeId: ch.activeId,
          capMs: ch.capMs,
          /* THE SAME LABEL FOR BOTH RUNS. The seed names the watermark, so two
             callers settling the same window draw the same stream — seeding
             them differently here would be measuring the PRNG, not the
             caller. */
          seed: seedFor(ch.userId, ch.slot, wm),
          hp: ch.hp, maxHp: ch.maxHp, gold: ch.gold,
          skills: ch.skills, inventory: ch.inventory, equipment: ch.equipment,
          toolCarry: ch.toolCarry, perks: ch.perks, buffs: ch.buffs,
          items: GATHER_CATALOGUES.items, monsters: {}, nodes: GATHER_CATALOGUES.nodes,
          caller, callerAuthority: CALLER_AUTHORITY,
        });
        if (!res.accrued) { out.push({ refused: res.reason }); continue; }
        out.push(res.delta);
        advance(ch, res);
        wm = Date.parse(res.delta.accrued_to);
      }
      return out;
    };
    const asTick = pg9('tick');
    const asAccrue = pg9('accrue');
    ok(asTick.length > 1 && asTick.some((d) => !d.refused),
      `P-G9 "${s.name}" the window-by-window run settled nothing - nothing to compare`);
    eq(JSON.stringify(asTick), JSON.stringify(asAccrue),
      `P-G9 "${s.name}" the SAME ${PG9_WINDOW / 1000}s windows paid differently depending on which caller asked - the tick is not "just another caller of the same engine" (AWAY-1/AWAY-12)`);

    /* ── P-G2. THE WATERMARK IS THE ONLY CLOCK THAT MOVES STATE ────────────
       Contiguity across every flush boundary (no overlap = no double pay, no
       gap = no confiscation), the chain starts where the character's
       `accrued_to` was, and the only unsettled time is a sub-action tail that
       is still OWED. */
    let cursor = FROM_MS;
    for (const it of run.intents) {
      eq(it.window.fromMs, cursor, `P-G2 "${s.name}" flush window starts at ${new Date(it.window.fromMs).toISOString()}, expected ${new Date(cursor).toISOString()} (overlap = double pay, gap = confiscation)`);
      ok(it.window.toMs >= it.window.fromMs, `P-G2 "${s.name}" flush window runs backwards`);
      eq(it.args.p_delta.accrued_to, new Date(it.window.toMs).toISOString(),
        `P-G2 "${s.name}" the delta's accrued_to disagrees with the window it claims to settle`);
      cursor = it.window.toMs;
    }
    eq(cursor, run.watermarkMs, `P-G2 "${s.name}" the last intent does not end on the run's watermark`);
    const interval = ref.accrued ? Number(ref.summary.intervalMs || 0) : 0;
    ok(run.unsettledMs >= 0 && (interval === 0 || run.unsettledMs < interval),
      `P-G2 "${s.name}" left ${run.unsettledMs}ms unsettled, which is >= one action interval (${interval}ms) - that is time the engine could have paid and did not`);

    /* ── P-G3. THE WRITE UNIT IS THE SETTLED WINDOW, NEVER THE TICK ────────
       Reliability's measured ceiling (§15a): player_ledger is 407 B/row and
       hr_ledger_prune deletes at most 480,000 rows/day, so per-tick journalling
       goes unbounded from ~56 continuously-active characters. This arm is the
       code-level expression of that ceiling. */
    const runRows = gm === 'gatherPerTickRow'
      ? settleGatherSession(s, FROM_MS, G_TO, { flushMs: 10000 }) : run;
    const rows = runRows.intents.length;
    /* THE RATE IS A PROPERTY OF THE CLOCK, NOT OF THE SAMPLE. Extrapolating
       "rows in this 10-minute span × 144" counts the final partial flush as if
       it were a steady-state one and over-states by ~5%; measuring the journal
       WINDOW instead over-states by the watermark's lag. The honest number is
       the flush period the implementation actually keeps, taken from the
       flush-closed windows themselves (never from the config, which would make
       the arm assert its own input). */
    const steady = runRows.intents.filter((i) => i.window.closedBy === 'flush');
    ok(steady.length >= 2, `P-G3 "${s.name}" produced ${steady.length} steady-state flush window(s) - too few to measure a rate`);
    const period = steady.length ? Math.min(...steady.map((i) => i.window.clockMs)) : 0;
    const perCharPerDay = period > 0 ? 86400000 / period : Infinity;
    const at500 = perCharPerDay * 500;
    ok(at500 <= 480000,
      `P-G3 "${s.name}" flushes every ${period}ms = ${Math.round(perCharPerDay)} rows/char/day = ${Math.round(at500)}/day at 500 continuously-active characters, over the 480,000/day hr_ledger_prune ceiling (407 B/row)`);
    ok(rows < runRows.polls,
      `P-G3 "${s.name}" emitted ${rows} write intent(s) for ${runRows.polls} polls - the tick is journalling per tick`);

    /* ── P-G4. IDEMPOTENCY, AND IT IS A FUNCTION OF THE WINDOW ─────────────
       §10's key: uuid5('tick:<shard>:<user>:<slot>:<windowFromMs>'). Two
       properties, and a careless implementation breaks exactly one of them
       each way: a key that does not vary with the window makes the SECOND
       flush a replay of the first (silent loss), and a key that varies with
       anything else (a timestamp, a counter) makes a retry a DOUBLE PAY. */
    const ids = run.intents.map((i) => gm === 'gatherIdemConst'
      ? tickIntentId(s.shard, s.userId, s.slot, FROM_MS) : i.args.p_intent_id);
    ok(new Set(ids).size === ids.length,
      `P-G4 "${s.name}" ${ids.length} flush windows produced ${new Set(ids).size} distinct idempotency keys - a repeated key means the later window is silently replayed away`);
    const again = settleGatherSession(gAtSpan(s0, FROM_MS), FROM_MS, G_TO, {});
    eq(JSON.stringify(again.intents.map((i) => i.args.p_intent_id)), JSON.stringify(run.intents.map((i) => i.args.p_intent_id)),
      `P-G4 "${s.name}" a re-run of the SAME span produced different keys - a retry after a timeout would double-pay instead of replaying`);
    eq(JSON.stringify(again.intents.map((i) => i.args.p_delta)), JSON.stringify(run.intents.map((i) => i.args.p_delta)),
      `P-G4 "${s.name}" a re-run of the same span produced a different delta - the tick is not deterministic`);
    /* And the version the intent carries is the one it HYDRATED at, never a
       locally derived successor: hr_apply refuses a stale version and the tick
       must rehydrate rather than guess (§10).

       ── P-G4b, ADDED 2026-09-21 (Security S-6) ───────────────────────────
       A call that settles several flush windows holds ONE hydration, so only
       the FIRST intent's version can still be current — hr_apply bumps
       `version` on every accepted write. Intents 2..N used to carry the
       hydration version anyway, which is fail-closed but is precisely the line
       a step-2 author "fixes" with a fresh version, and doing that on a batch
       computed from the OLD watermark is the S-3 double pay with an
       honest-looking ledger row. They now carry NULL plus an explicit
       `rehydrateBefore` contract: `hr_apply` refuses a null version outright,
       so the failure mode is "cannot send this without rehydrating" rather
       than "can send this if a number is invented". */
    ok(run.intents[0].args.p_version === s0.version,
      `P-G4 "${s.name}" the FIRST intent must carry the version the tick hydrated at`);
    ok(run.intents.every((i, n) => (n === 0
      ? i.rehydrateBefore === false
      : i.args.p_version === null && i.rehydrateBefore === true)),
      `P-G4b "${s.name}" a later intent carries a version the tick could not still hold — it must be null and marked rehydrateBefore (S-6)`);
    ok(run.intents.every((i) => i.rpc === 'hr_tick_settle'),
      `P-G4b "${s.name}" an intent names a writer other than the fence hr_tick_settle — the tick must not hold raw hr_apply (S-1/S-7)`);

    /* ── P-G5. THE RECEIPT DOES NOT OVER-STATE ─────────────────────────────
       Each poll is asked "from my watermark to now", so a poll's own grantMs
       INCLUDES the tail the previous poll deferred. Summing them re-counts
       every tail. The honest `ms` is the span the watermark actually moved.
       Measured here rather than asserted in prose, because the naive sum is
       the implementation somebody will reach for. */
    const sumGrant = run.results.reduce((a, r) => a + (r.res.accrued ? Number(r.res.grantMs || 0) : 0), 0);
    const honest = run.intents.reduce((a, i) => a + Number(i.args.p_delta.journal.meta.ms || 0), 0);
    const claimed = gm === 'gatherSumMs' ? sumGrant : honest;
    eq(claimed, run.watermarkMs - FROM_MS,
      `P-G5 "${s.name}" the journalled ms totals ${claimed} for a watermark that moved ${run.watermarkMs - FROM_MS}ms (the sum of per-poll grantMs is ${sumGrant}, +${Math.round((sumGrant / (run.watermarkMs - FROM_MS) - 1) * 100)}%) - the away receipt would over-state time credited`);

    /* ── P-G6. A PLAYER'S LEDGER CANNOT TELL A TICK FROM AN ACCRUE ─────────
       The key set is taken from the ENGINE's own gather journal on this very
       span, not from a list retyped here, so the arm cannot rot into agreeing
       with a stale expectation. The one permitted difference is `src`, and it
       exists so an OPERATOR can tell — the opposite requirement. */
    if (ref.accrued && run.intents.length) {
      const refKeys = Object.keys(ref.delta.journal.meta).sort();
      let meta = run.intents[0].args.p_delta.journal.meta;
      if (gm === 'gatherShapeDrift') meta = { ...meta, perAction: [{ t: 1 }] };
      const tickKeys = Object.keys(meta).sort();
      const extra = tickKeys.filter((k) => !refKeys.includes(k));
      const missing = refKeys.filter((k) => !tickKeys.includes(k) && k !== 'w');
      eq(JSON.stringify(extra), JSON.stringify(['src']),
        `P-G6 "${s.name}" the tick journal carries key(s) ${JSON.stringify(extra)} an accrue row does not; only "src" is permitted`);
      eq(JSON.stringify(missing), '[]',
        `P-G6 "${s.name}" the tick journal is missing accrue key(s) ${JSON.stringify(missing)}`);
      eq(meta.src, 'tick', `P-G6 "${s.name}" the operator marker is ${JSON.stringify(meta.src)}, expected "tick"`);
      eq(run.intents[0].args.p_delta.journal.kind, 'gather', `P-G6 "${s.name}" journal kind`);
      eq(run.intents[0].args.p_delta.journal.intent, 'accrue', `P-G6 "${s.name}" journal intent`);
      /* NO NESTED VALUE. tests/artisan-accrual.mjs T7 refuses one outright, and
         a per-action list is the game_events mistake at ledger scale. */
      const nested = Object.keys(meta).filter((k) => meta[k] !== null && typeof meta[k] === 'object');
      eq(JSON.stringify(nested), '[]',
        `P-G6 "${s.name}" the tick journal meta carries nested value(s) ${JSON.stringify(nested)} - artisan-accrual T7 refuses them and a per-action list is the game_events incident`);
    }
  }

  /* ── P-G7. THE SQL DOES NOT RETYPE THE ENGINE'S CATALOGUE ────────────────
     hr_tick_roster holds a `c_payable` literal because plpgsql cannot import
     accrual.js. The price of the literal is this guard: the two are compared
     credential-free, here, so the day PAYABLE_KINDS grows a fourth kind the
     roster cannot silently refuse it. */
  {
    const sql = readFileSync(new URL('../supabase/migrations/2026-09-20-world-tick-roster.sql', import.meta.url), 'utf8');
    const m = sql.match(/c_payable\s+constant\s+text\[\]\s*:=\s*array\[([^\]]*)\]/);
    ok(!!m, 'P-G7 could not find the c_payable literal in 2026-09-20-world-tick-roster.sql - the drift guard has nothing to compare');
    if (m) {
      let inSql = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
      if (gm === 'gatherPayableDrift') inSql = inSql.filter((k) => k !== 'artisan');
      eq(JSON.stringify(inSql.slice().sort()), JSON.stringify(PAYABLE_KINDS.slice().sort()),
        `P-G7 hr_tick_roster's c_payable ${JSON.stringify(inSql)} != accrual.js PAYABLE_KINDS ${JSON.stringify(PAYABLE_KINDS)} - the SQL copy has drifted from the engine`);
    }
  }

  /* ── P-G8. THE WALL CLOCK IS NOT THE WATERMARK ───────────────────────────
     The mutation is a whole alternative caller: chain each poll on the
     PREVIOUS POLL'S `now` instead of on the engine's own `delta.accrued_to`.
     It is the implementation a reasonable person writes first, and it throws
     the sub-action remainder away every cadence. Stated as a positive claim so
     the measurement is in the green output, not only in the mutant. */
  {
    const s = gAtSpan(sessions[1], FROM_MS);          // the 4000 ms oak node
    const naive = (() => {
      const char = hydrate(s);
      let clock = FROM_MS; let paidTicks = 0;
      while (clock < G_TO) {
        const from = clock;
        clock = Math.min(clock + CADENCE_MS, G_TO);
        const res = shadowTick(char, from, clock, GATHER_CATALOGUES, { caller: 'tick' });
        if (res.accrued) { paidTicks += Number(res.summary.ticks || 0); advance(char, res); }
      }
      return paidTicks;
    })();
    const chained = settleGatherSession(s, FROM_MS, G_TO, {});
    const chainedTicks = intentValue(chained.intents).ticks;
    const measured = gm === 'gatherWallclock' ? naive : chainedTicks;
    const refTicks = Number(gatherReference(s).summary.ticks || 0);
    eq(measured, refTicks,
      `P-G8 chaining on the wall clock paid ${naive} of ${refTicks} action ticks (${Math.round((1 - naive / refTicks) * 100)}% forfeited); chaining on the engine's own accrued_to paid ${chainedTicks}`);
    say(`   P-G8 wall-clock chain ${naive} ticks vs watermark chain ${chainedTicks} vs accrual ${refTicks}`);
  }
}

function sortMap(m) {
  const out = {};
  for (const k of Object.keys(m || {}).sort()) out[k] = Number(m[k] || 0);
  return out;
}

function pick(d) {
  return { gold: d.gold || 0, xp: d.xp || {}, items: d.items || {} };
}
function sum(m) { let n = 0; for (const k in (m || {})) n += Number(m[k] || 0); return n; }

// ── Report ───────────────────────────────────────────────────────────────────
if (MUTATE) {
  if (problems.length) {
    console.log(`world-tick-parity --mutate=${MUTATION}: RED as required (${problems.length} problem(s)) — the guard bites.`);
    for (const p of problems.slice(0, 4)) console.log('   ✗ ' + p);
    process.exit(0);
  }
  console.error(`world-tick-parity --mutate=${MUTATION}: the mutation did NOT turn the guard red. The guard is decorative.`);
  process.exit(1);
}

if (problems.length) {
  console.error(`world-tick-parity: ${problems.length} problem(s)`);
  for (const p of problems) console.error('   ✗ ' + p);
  process.exit(1);
}

console.log(`world-tick-parity: green — ${FIXTURES.length} fixtures, ${SPAN_MS / 60000} min span, ${CADENCE_MS / 1000}s cadence`);
console.log('   P1 construction parity   tick delta == accrual delta, byte for byte');
console.log('   P2 time conservation     aligned decomposition loses zero ticks');
console.log('   P3 alignment bites       unaligned decomposition measurably loses ticks');
console.log('   P4 stream health         no starved drops, value drift inside +/-' + (GOLD_BAND * 100) + '%');
console.log('   P-G1 gather value        tick intents == accrual delta, exact (carry within 1e-6)');
console.log('   P-G2 gather watermark    contiguous flush windows, tail under one action interval');
console.log('   P-G3 gather write unit   one row per settled window, inside the 480k/day prune ceiling');
console.log('   P-G4 gather idempotency  uuid5 per (shard,user,slot,windowFrom); a re-run is byte-identical');
console.log('   P-G5 gather receipt      journalled ms == the span the watermark moved');
console.log('   P-G6 gather journal      accrue meta keys + "src":"tick", nothing nested');
console.log('   P-G7 catalogue drift     hr_tick_roster c_payable == accrual.js PAYABLE_KINDS');
console.log('   P-G8 watermark chain     chaining on the wall clock forfeits, on accrued_to does not');
console.log('   P-G9 caller parity       the SAME 90s windows pay identically as tick and as accrue (AWAY-1)');
for (const f of findings) {
  console.log(`      · ${f.fixture}: ${f.windows} windows @ ${f.tickMs}ms; gold ${f.gold.tick} vs ${f.gold.accrual} (${f.gold.driftPct > 0 ? '+' : ''}${f.gold.driftPct}%); xp ${f.xp.tick} vs ${f.xp.accrual}`);
}
