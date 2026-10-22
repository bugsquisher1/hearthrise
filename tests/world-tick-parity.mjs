// ============================================================================
// tests/world-tick-parity.mjs — the WORLD TICK parity guard (step 1, shadow).
//
//   node tests/world-tick-parity.mjs            run the guard
//   node tests/world-tick-parity.mjs --mutate   prove the guard goes RED
//   node tests/world-tick-parity.mjs --verbose  print every measurement
//
// THE CLAIMS. P1-P5 and P7 (construction parity, time conservation, the
// alignment rule, stream health, tick/settle composition and the caller
// taxonomy, all on COMBAT fixtures) left with the solo combat channel in the
// closed rebuild (lane C2): a fight is a hunt session, settled from the hunts
// cohort, and its split-settle parity is tests/hunt-sessions-settle.mjs TICK-1.
// The caller taxonomy (accrue defers / collect stamps / tick defers, and the
// ACCRUE_MIN_MS floor) is tests/settle-carry-defer.mjs D4..D4e on a gathering
// base. What remains here is the channel the tick drives:
//
//  P6 REAL RECORDED WINDOWS. 1,703 accepted `accrue` windows read READ-ONLY
//     from production (tools/world-tick-replay.mjs) and replayed against
//     `settledWatermarkMs`. The fixture carries window GEOMETRY only.
//
//  P-G THE GATHER CHANNEL, END TO END (below).
//
// NO NETWORK AT RUN TIME, NO SUPABASE CLIENT. The P6 fixture is a
// de-identified, value-stripped snapshot produced by a separate SELECT-only tool.
// ============================================================================

import { readFileSync } from 'node:fs';
import { shadowTick, hydrate, seedFor, advance } from '../services/world-tick/shadow.js';
import { analyzeRows, verdict, MISSING_FOR_VALUE_REPLAY } from '../services/world-tick/replay.js';
import { computeAccrual, CALLER_AUTHORITY, PAYABLE_KINDS }
  from '../supabase/functions/hr-accrue/accrual.js';
/* The GATHER channel, the first tick-owned one (WORLD_TICK_DESIGN.md §15a). */
import {
  loadGatherSessions, atSpan as gAtSpan, settleGatherSession, intentValue,
  tickIntentId, GATHER_CATALOGUES,
} from '../services/world-tick/gather.js';
import { loadApplyOrder } from '../tools/lib/apply-order.mjs';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const CADENCE_MS = 10000;                   // Tyler, 2026-09-16: 10 s for the beta

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
const MUTATION = MUTATE ? (ARGS.find((a) => MUTATIONS[a.replace(/^--/, '')]) || '--replayLax')
  .replace(/^--/, '') : null;

/* ── P6 REAL RECORDED WINDOWS ───────────────────────────────────────────────
   P-G below is fixtures. This one is production: 1,703 accepted
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
    `P6 MISSING_FOR_VALUE_REPLAY is now ${MISSING_FOR_VALUE_REPLAY.length} fields, not 9 - if the journal really gained a field, add the replay arm that uses it; do not just shorten the list`);
  /* THE 14-DAY FIXTURE PREDATES `meta.w` AND MUST STILL READ AS UNPROVABLE.
     The whole honesty claim of the journalling change is "old rows stay old":
     if adding the field had retroactively moved historical rows out of the
     `unaccounted` bucket, the parser would be guessing rather than reading. */
  ok(a.withWaste === 0 && a.byBucket.unaccounted === 5,
    `P6 the pre-2026-09-18 fixture reports ${a.withWaste} pairs carrying meta.w and ${a.byBucket.unaccounted} unaccounted (expected 0 and 5) - adding a journal field must not reclassify rows that never had it`);
  say(`   P6 real windows: ${a.pairs} pairs, ${v.proven} proven, ${v.failed} failed, ${a.byBucket.unaccounted} unaccounted, intervals ${a.tickMsSeen.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// P-G — THE GATHER CHANNEL, END TO END (step-2 preparation, 2026-09-18)
//
// The decision on record (WORLD_TICK_DESIGN.md §15a) is that the FIRST
// tick-owned channel is gather — and since lane C2 the only one. These arms
// prove the thing that actually ships: that a chain of 10 s
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
    /* THE CHAIN-END DEFINITION, NOT THE FIRST ONE (2026-10-06). A function
       restated by a later migration runs the LATER text; reading the literal
       out of the file that first created it would compare a body production
       no longer runs. `chainEnd` walks tests/schema-apply-order/ and
       returns the text of the LAST file that defines the function. */
    const ORDER = loadApplyOrder().order;
    const chainEnd = (fn) => {
      const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i');
      for (const f of ORDER.slice().reverse()) {
        const text = readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
        const at = text.search(re);
        if (at >= 0) return { file: f, text: text.slice(at) };
      }
      return { file: '(none)', text: '' };
    };
    const sql = readFileSync(new URL('../supabase/migrations/2026-09-20-world-tick-roster.sql', import.meta.url), 'utf8');
    const roster = chainEnd('hr_tick_roster');
    const m = roster.text.match(/c_payable\s+constant\s+text\[\]\s*:=\s*array\[([^\]]*)\]/);
    ok(!!m, `P-G7 could not find the c_payable literal in hr_tick_roster's chain-end definition (${roster.file}) - the drift guard has nothing to compare`);
    if (m) {
      let inSql = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
      if (gm === 'gatherPayableDrift') inSql = inSql.filter((k) => k !== 'artisan');
      eq(JSON.stringify(inSql.slice().sort()), JSON.stringify(PAYABLE_KINDS.slice().sort()),
        `P-G7 hr_tick_roster's c_payable ${JSON.stringify(inSql)} != accrual.js PAYABLE_KINDS ${JSON.stringify(PAYABLE_KINDS)} - the SQL copy has drifted from the engine`);
    }

    /* ── P-G7b, ADDED 2026-09-21. THE LITERAL IS NOW IN THREE PLACES, AND
       TWO OF THEM ARE NEW. 2026-09-21-world-tick-settle-fence.sql holds its
       own `c_payable` (the fence refuses a non-payable channel before it looks
       at anything else) and hr_tick_ownership's CHECK constraint holds a third
       copy. A drift guard that watched only the first would let the fence
       quietly refuse a kind the engine pays — which reads to a player as
       "gathering stopped crediting" and to an operator as nothing at all. */
    const fenceDef = chainEnd('hr_tick_settle');
    const fm = fenceDef.text.match(/c_payable\s+constant\s+text\[\]\s*:=\s*array\[([^\]]*)\]/);
    ok(!!fm, `P-G7b could not find the c_payable literal in hr_tick_settle's chain-end definition (${fenceDef.file})`);
    if (fm) {
      let inFence = fm[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
      if (gm === 'gatherPayableDrift') inFence = inFence.filter((k) => k !== 'artisan');
      eq(JSON.stringify(inFence.slice().sort()), JSON.stringify(PAYABLE_KINDS.slice().sort()),
        `P-G7b hr_tick_settle's c_payable ${JSON.stringify(inFence)} != accrual.js PAYABLE_KINDS ${JSON.stringify(PAYABLE_KINDS)}`);
    }
    const ck = sql.match(/hr_tick_ownership_channel_ck[\s\S]{0,120}?channel in \(([^)]*)\)/);
    ok(!!ck, "P-G7b could not find hr_tick_ownership's channel CHECK constraint");
    if (ck) {
      let inCk = ck[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
      if (gm === 'gatherPayableDrift') inCk = inCk.filter((k) => k !== 'artisan');
      eq(JSON.stringify(inCk.slice().sort()), JSON.stringify(PAYABLE_KINDS.slice().sort()),
        `P-G7b hr_tick_ownership's channel CHECK ${JSON.stringify(inCk)} != accrual.js PAYABLE_KINDS ${JSON.stringify(PAYABLE_KINDS)} - a character could be flagged for a channel the fence then refuses`);
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

console.log(`world-tick-parity: green — the gather channel, ${CADENCE_MS / 1000}s cadence`);
console.log('   P6 real windows          every recorded boundary is settledWatermarkMs');
console.log('   P-G1 gather value        tick intents == accrual delta, exact (carry within 1e-6)');
console.log('   P-G2 gather watermark    contiguous flush windows, tail under one action interval');
console.log('   P-G3 gather write unit   one row per settled window, inside the 480k/day prune ceiling');
console.log('   P-G4 gather idempotency  uuid5 per (shard,user,slot,windowFrom); a re-run is byte-identical');
console.log('   P-G5 gather receipt      journalled ms == the span the watermark moved');
console.log('   P-G6 gather journal      accrue meta keys + "src":"tick", nothing nested');
console.log('   P-G7 catalogue drift     roster + fence c_payable + the ownership CHECK == accrual.js PAYABLE_KINDS');
console.log('   P-G8 watermark chain     chaining on the wall clock forfeits, on accrued_to does not');
console.log('   P-G9 caller parity       the SAME 90s windows pay identically as tick and as accrue (AWAY-1)');

