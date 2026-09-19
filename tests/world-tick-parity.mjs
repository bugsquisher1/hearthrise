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
import { analyzeRows, verdict, MISSING_FOR_VALUE_REPLAY } from '../services/world-tick/replay.js';
import { computeAccrual, settledWatermarkMs } from '../supabase/functions/hr-accrue/accrual.js';

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
  unalignedTick: { p5: { unaligned: true } },
  /* P5. The tick rewinds its own watermark by one action interval — the
     "re-simulate the last tick to be safe" reflex. Every instant in the overlap
     is then simulated twice. Kills P5a and P5b in the DOUBLE-PAY direction,
     which is the direction that mints. */
  rewind: { p5: { rewindTicks: 1 } },
  /* P6. One real recorded boundary is moved by a millisecond. If the replay
     analyser still reports zero mismatches it is not reading production, it is
     decorating it. */
  replayLax: { p6: { nudgeMs: 1 } },
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
    /* `finalWindow` is a COLLECT flag, not a settle flag: it tells
       settledWatermarkMs to stamp `now` because there is no next call. An
       ordinary settle does NOT set it, which is how it earns the deferral.
       P5's handover settle passes false for exactly that reason. */
    finalWindow: !o || o.finalWindow !== false,
  });
}

const findings = [];

for (const f of FIXTURES) {
  const c = atSpan(f, FROM_MS);
  const N = `[${c.name}]`;

  // ── P1 ────────────────────────────────────────────────────────────────────
  const ref = accrualOnReturn(c, FROM_MS, TO_MS);
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

   ⚠ WHAT THIS MEASURED, and it is a finding rather than a pass: a tick window
     is spelled `finalWindow: true` today (shadow.js's note, design doc §4.1),
     and `settledWatermarkMs` returns `nowMs` unconditionally for a final
     window. So the deferral the accrual path just gained does NOT reach a tick
     window through that flag: the tick is protected from the carry loss ONLY by
     `alignWindow`, which makes the remainder zero so the two agree. Turn the
     alignment off (`--mutate --unalignedTick`) and the tick forfeits its
     remainder every ten seconds. That is the concrete cost of the borrowed
     spelling and the argument for `caller: 'tick'`. */
function tickThenSettle(c, fromMs, handoverMs, toMs, o) {
  const opt = o || {};
  const char = hydrate(c);
  const probe = shadowTick(hydrate(c), fromMs, toMs, CATALOGUES, {});
  const tickMs = Number(probe.tickMs) || 2400;
  const anchor = Number(c.activeSinceMs) || fromMs;
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
    const res = shadowTick(char, w.fromMs, w.toMs, CATALOGUES, {});
    if (!res.accrued) { wm = w.toMs; continue; }
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
  /* THE HANDOVER SETTLE is an ordinary settle, not a collect: no finalWindow,
     so its own sub-interval remainder is deferred by settledWatermarkMs rather
     than stamped away. That is the half of the composition the tick does not
     control and must not break. */
  const settle = accrualOnReturn(char, wm, toMs, { finalWindow: false });
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
  ok(MISSING_FOR_VALUE_REPLAY.length === 11,
    `P6 MISSING_FOR_VALUE_REPLAY is now ${MISSING_FOR_VALUE_REPLAY.length} fields, not 11 — if the journal really gained a field, add the replay arm that uses it; do not just shorten the list`);
  say(`   P6 real windows: ${a.pairs} pairs, ${v.proven} proven, ${v.failed} failed, ${a.byBucket.unaccounted} unaccounted, intervals ${a.tickMsSeen.length}`);
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
for (const f of findings) {
  console.log(`      · ${f.fixture}: ${f.windows} windows @ ${f.tickMs}ms; gold ${f.gold.tick} vs ${f.gold.accrual} (${f.gold.driftPct > 0 ? '+' : ''}${f.gold.driftPct}%); xp ${f.xp.tick} vs ${f.xp.accrual}`);
}
