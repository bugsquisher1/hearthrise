// ============================================================================
// supabase/functions/hr-accrue/accrue-artisan.js — A FUEL RUN'S WINDOW.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// computeAccrual reaches it through KIND_ACCRUERS.artisan.
//
// The `artisan` kind is the Great Hearth's fuel runs and nothing else since the one-town-work cut (09-crafting.md
// 4.17, the bridge): the bench, its tax, its burn, its yields, its jewel rolls, its "make N" count and its recipe
// gate left with it. F1's company flame retires this file with the `fuel_*` rows (4.13 row 3).
// ============================================================================

import { equipmentStats } from '../../../src/core/combat.js';
/* The fuel run's simulation: the same `sliceSpan` loop every away span runs, one action a fuel. */
import { simulateFuelSpan, STOP_REASON as FUEL_STOP } from '../../../src/core/artisan-sim.js';
import { bonusFor, liveBuffHost } from '../../../src/core/member.js';
import { grantXp, normaliseXpFrac, xpFracChanges } from '../../../src/core/progression.js';
import { buffQueueFromServer } from '../../../src/core/buffs.js';
import { catalogueHas } from './intents.js';
import { nat, SKIP, accrualCaller } from './accrual-contract.js';
import { windowWaste, windowEnvelope, settledWatermarkMs } from './accrual-window.js';

/**
 * THE FUEL RUN'S ACCRUAL.
 *
 * Nothing below re-implements a rule: the span loop, the interval, the fuel check and the XP grant come out of
 * src/core/artisan-sim.js and src/core/progression.js. The only server-specific thing is the APPLY: this accumulates a
 * delta hr_apply re-validates.
 *
 * ── IT SPENDS ────────────────────────────────────────────────────────────────
 * A fuel run consumes ONE fuel on every action, so three properties are load-bearing:
 *
 *   1. THE SUPPLY IS THE SERVER'S. The run cannot burn more than the server can see: `missingInput` inside
 *      `simulateFuelSpan` reads `state.supply` (the bag, then the account's Storage, the server's order), and
 *      `fx.removeItem` decrements it. No client count anywhere in the loop.
 *   2. RUNNING DRY IS A STOP, NOT A REFUSAL. The span pays the time it worked and reports `supplies` with the fuel
 *      named; the rest of the window pays nothing and the watermark stamps `now`.
 *   3. THE POINTER IS CLEARED when it stops: a run with no fuel can never pay again, and leaving `active_id` on it
 *      would answer "nothing" forever (the town body standing on its stand, report #68).
 *
 * @param inp  computeAccrual's input, verbatim
 * @param span { nowMs, grantMs, capped, credit, workCapped } — the shared preamble's
 */
/* The span's action cap: the degrade ladder's budget and the run's own count, whichever is smaller; null when neither
   binds (absent and null are both "unbounded", see artisan-sim.js). */
function runCap(budget, left) {
  const b = (budget === null || budget === undefined) ? null : Number(budget);
  if (b === null) return left;
  return left === null ? b : Math.min(b, left);
}

export function accrueArtisan(inp, span) {
  const { nowMs, grantMs, capped, credit } = span;
  /* THE RUN'S COUNT ("Burn" is a count of one; 2026-12-01-bench-count.sql): the actions it may still make, from the
     server's own player_state.active_left (envelope.js activeLeft); null = until the fuel is out. It caps the span like
     the degrade ladder's budget, and the run ENDS on the action that reaches it (below), so N actions are burnt however
     the settles are cut. A run with a count read as a run without one would burn the player's whole stack. */
  const left0 = Number.isInteger(inp.activeLeft) && inp.activeLeft > 0 ? inp.activeLeft : null;
  const items = inp.items || {};
  /* Equipment reaches a fuel run through exactly one channel — `xpB`, the same term the client's xpGrantCtx() supplies. */
  const eq = equipmentStats(inp.equipment || {}, items);
  /* THE PERK STACK (`flameSpeed`, `allXP`) and the LIVE buff queue on `state` below: a speed buff moves the divisor of the
     whole grant, so the queue has to be the live one, not a snapshot. */
  const bonus = bonusFor(inp.perks, liveBuffHost(() => state.buffs));

  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);
  /* THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql): null on a database without the column, and then no
     `xp_frac` key is proposed (hr_apply would refuse it as unknown). */
  const xpFrac0 = normaliseXpFrac(inp.xpFrac);

  /* THE BAG AND THE STORAGE, the fuel's pool in the server's order (the bag first, then Storage). Coerced through nat()
     and floored: a jsonb bigint arrives as a string, and `missingInput` compares with `<`. */
  const counts = (m) => {
    const out = Object.create(null);
    for (const id in (m || {})) { const q = Math.floor(nat(m[id], 0)); if (q > 0) out[id] = q; }
    return out;
  };
  const bag = counts(inp.inventory);
  const storage0 = (inp.storage && typeof inp.storage === 'object') ? counts(inp.storage) : Object.create(null);
  const supply = Object.create(null);
  for (const id in bag) supply[id] = bag[id];
  for (const id in storage0) supply[id] = (supply[id] || 0) + storage0[id];

  const state = {
    skillTargetId: inp.activeId,
    skills: { ...skills0 },        // a COPY: grantXp mutates it, and the diff below is the delta
    xpFrac: xpFrac0 ? { ...xpFrac0 } : undefined,
    inventory: bag,
    supply,
    /* THE BUFF QUEUE (2026-09-13), measured at the START of the paid window: the drain is WALL-CLOCK. */
    buffs: buffQueueFromServer(inp.buffs, credit.fromMs),
  };

  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];
  let stoppedInput = null;

  const fx = {
    addXp(skillId, amt) {
      const res = grantXp(state, skillId, amt, { bonus, xpB: eq.xpB || 0, authored: false });
      for (const ev of res.events) if (ev.type === 'levelup') levelUps.push({ skill: ev.skill, from: ev.from, to: ev.to });
    },
    /* THE DEBIT, AND IT IS THE WHOLE MATERIAL CLAMP. Decrementing `supply` is what makes the run stop when the fuel runs
       out; clamped at what exists, the bag first, so a debit deeper than the stack (hr_apply's `insufficient_item`, which
       409s the whole window) is never proposed. */
    removeItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      const have = Math.floor(nat(supply[id], 0));
      const take = Math.min(n, have);
      if (take <= 0) return;
      supply[id] = have - take;
      if (supply[id] <= 0) delete supply[id];
      const inBag = Math.floor(nat(bag[id], 0));
      bag[id] = inBag - Math.min(take, inBag);
      if (bag[id] <= 0) delete bag[id];
      itemDelta[id] = (itemDelta[id] || 0) - take;
    },
    /* WHICH fuel ran out, for the welcome-back line ("Out of Bones"). */
    onStop(reason, skill, targetId, missing) { stoppedInput = missing || null; },
  };

  const summary = simulateFuelSpan(state, {
    away: true,
    /* THE FIRST `grantMs` AFTER THE PLAYER LEFT (Ruling 2), the anchor every away path gets. */
    fromMs: credit.fromMs,
    toMs: credit.toMs,
    capped,
    recipes: inp.recipes || {},
    bonus,
    /* THE DEGRADE LADDER'S CAP (Security C1), from `inp.actionBudget`, which index.ts computes from the engine's own
       previous answer, never from a request body. Absent/null = unbounded. `minStepMs` is NOT SET: the real floor. */
    maxActions: runCap(inp.actionBudget, left0),
    fx,
  });

  /* A pointer the simulation could not resolve is a REFUSAL, not an empty night: the watermark does not advance and the
     window is DEFERRED. Unreachable through the intent surface (the preamble checked the id against the same index). */
  if (summary.stoppedBy === FUEL_STOP.UNKNOWN_RECIPE) return { accrued: false, reason: SKIP.NO_RECIPE, summary };

  // ── Turn the mutated state into a delta hr_apply will accept: every value an INTEGER (`::bigint`). ──
  const xpDelta = {};
  for (const k in state.skills) {
    const gained = Math.floor((state.skills[k] || 0) - (skills0[k] || 0));
    if (gained > 0) xpDelta[k] = gained;
  }
  /* THE SIGNED ITEM DELTA: every fuel the window burnt. A fuel the item catalogue no longer has is skipped and
     JOURNALLED (an id, never a log), because hr_apply would refuse the whole delta for it. */
  const items_ = {};
  const skipped = [];
  const startQty = (id) => Math.floor(nat((inp.inventory || {})[id], 0)) + (storage0[id] || 0);
  for (const id in itemDelta) {
    if (!catalogueHas(items, id)) {
      events.push({ type: 'unknown_item_skipped', item: id });
      if (skipped.length < 8 && skipped.indexOf(id) === -1) skipped.push(id);
      continue;
    }
    const n = Math.floor(itemDelta[id]);
    if (n === 0) continue;
    /* The redundant floor (the two-locks rule): `insufficient_item` is not DEGRADABLE, so it would 409 the window. */
    if (startQty(id) + n < 0) {
      events.push({ type: 'overspend_clamped', item: id });
      if (startQty(id) === 0) continue;
      items_[id] = -startQty(id);
    } else {
      items_[id] = n;
    }
  }

  /* ⚠ A STOPPED RUN MUST STILL CLEAR THE POINTER, which is why this test comes BEFORE the nothing-happened return: a run
     that stops on its FIRST action (the fuel is already gone) produces nothing, and `nothing_accrued` there would leave
     `active_id` on a run that can never pay. */
  /* THE COUNT REACHED is a stop like running dry: the run is over and the pointer clears. */
  const left1 = left0 === null ? null : Math.max(0, left0 - Math.floor(nat(summary.ticks, 0)));
  const counted = left1 === 0;
  const stopped = summary.stoppedBy === FUEL_STOP.SUPPLIES || counted;
  /* THE WORK DAY RAN OUT (1059-company-trades.sql): the door cut this window at the day's end (accrual.js `workCapped`). */
  const workEnd = span.workCapped === true && !stopped;
  const runOver = stopped || workEnd;
  const nothingHappened = Object.keys(items_).length === 0 && Object.keys(xpDelta).length === 0 && summary.ticks === 0;
  if (nothingHappened && !runOver) return { accrued: false, reason: SKIP.NOTHING, summary };

  /* THE SUB-STEP REMAINDER, DEFERRED rather than forfeited (settledWatermarkMs). A stopped run is stamped `now()`
     outright: the action that burnt the last fuel may leave less than a step. */
  const settledTo = runOver ? nowMs : settledWatermarkMs(span, summary, summary.intervalMs, { caller: accrualCaller(inp) });

  const delta = {
    accrued_to: new Date(settledTo).toISOString(),
    journal: {
      /* ⚠ `craft`, NOT `artisan`: the only value `player_ledger_kind_check` accepts for this work. */
      kind: 'craft',
      intent: 'accrue',
      /* AGGREGATE, never per action: one row a window (the receipt for per-action journalling is game_events, 1.6M rows /
         229 MB from six players in four days). Every value a scalar. `skill` and `recipe` are what the Hearth's day reads
         (1043-hearthrise.sql). */
      meta: {
        ms: grantMs, ticks: summary.ticks, capped,
        recipe: summary.recipeId, skill: summary.skill,
        stopped: counted ? 'count' : (summary.stoppedBy || (workEnd ? 'work_cap' : null)),
        out_of: counted ? null : stoppedInput,
        /* The count this window started from and what it left (absent on an uncounted run). */
        ...(left0 !== null ? { n: left0, left: left1 } : {}),
        ...(skipped.length ? { skipped_items: skipped.join(',') } : {}),
        ...(windowWaste(summary) ? { w: windowWaste(summary) } : {}),
        from: new Date(credit.fromMs).toISOString(),
        to: new Date(credit.toMs).toISOString(),
      },
    },
  };
  if (Object.keys(items_).length) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
  if (xpFrac0) {
    const fr = xpFracChanges(xpFrac0, state.xpFrac);
    if (Object.keys(fr).length) delta.xp_frac = fr;
  }
  /* THE RUN IS OVER, so the pointer says so. Sent only when it happened: an `activity` key is a complete, re-validated
     statement and restating an unchanged pointer buys a catalogue lookup and nothing else. */
  if (runOver) delta.activity = { kind: 'idle', id: null };
  /* A run still short of its count proposes the lowered count (hr_apply accepts it only below the stored one, on an
     accrual): a replayed or re-cut window cannot burn past N. A run that ENDS states what it left beside its
     `activity: idle` (1026-job-counts.sql: 0 = counted out; more = the fuel or the day ended it first). */
  if (left1 !== null && ((runOver && inp.jobEnds === true) || (!runOver && left1 < left0))) delta.active_left = left1;
  /* THE WORK DAY (1059-company-trades.sql): where this window's work ended, what hr_apply spends of the hero's day.
     Sent only to a database that keeps the day (`workDay`, the section's switch). */
  if (inp.workDay) delta.work_to = new Date(Math.min(credit.toMs, credit.fromMs + Math.floor(nat(summary.paidMs, 0)))).toISOString();

  return {
    accrued: true,
    delta,
    grantMs,
    capped,
    tickMs: summary.intervalMs,     // the ACTION interval; same field name, same meaning
    foodEaten: 0,
    watermark: delta.accrued_to,
    deferredMs: Math.max(0, nowMs - settledTo),
    events,
    levelUps,
    summary: {
      ...summary,
      ...windowEnvelope(credit, summary.stoppedBy ? summary.paidMs : null),
      gold: 0,
      xp: xpDelta,
      items: items_,
      levelUps,
    },
  };
}
