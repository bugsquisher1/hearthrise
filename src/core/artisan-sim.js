// ============================================================
// src/core/artisan-sim.js — THE HEARTH'S FUEL RUN: ONE LOOP, AND THE SPAN IT RUNS IN.
//
// THE ONE TOWN RUN LEFT ON THE ARTISAN CHANNEL (09-crafting.md 4.17, the bridge). The bench and gathering left
// with the one-town-work cut: town work is a company's jobs (src/core/trades.js, settled in SQL). What stays is
// the Great Hearth's fuel run, `fuel_<item>` (src/data/hearth.js HEARTH_FUELS, the rows src/data/recipes.js
// builds on the `inner_flame` bench): each action burns ONE of its fuel from the bag, then the account's Storage,
// and pays Inner Flame XP. It makes nothing. F1's company flame retires this file with the `fuel_*` rows and
// hr_apply's town-window path (4.13 row 3).
//
//   indexFuelRuns     resolves an id to its run (fuel rows only: a bench row is never indexed)
//   fuelIntervalMs    derives the rate (PACE.actionMs, the `flameSpeed` perk, the 0.70 fuse)
//   sliceSpan         divides an absence at its rate changes (a buff that runs out)
//   simulateFuelSpan  runs the absence
//
// THE INTERVAL IS THE LEVER. `n = floor(sliceMs / stepMs)` makes `stepMs` the divisor of the whole grant, and a
// `flameSpeed` buff moves it, which is why it is RE-DERIVED per slice and never captured once (b347).
//
// ── WHAT IS INJECTED ─────────────────────────────────────────────────
//   ctx.recipes  the run index (`indexFuelRuns`)
//   ctx.bonus    the perk stack; blessing/buff channels gate via core/away.js
//   ctx.fx       the effect sink (removeItem, addXp, onStop); a missing handler is a no-op
//   ctx.maxActions  the degrade ladder's action budget (supabase/functions/hr-accrue/accrual.js degradeStep), or absent
//
// ── WHERE THE FUEL COMES FROM (Tyler 2026-10-25, skills from Storage) ──
// `state.supply`, when the caller sets it, is the pool the fuel is counted against: the bag PLUS the account's
// Storage (the server takes the bag first, then Storage). No `supply` = the bag is the pool.
//
// `state` is MUTATED in place, matching grantXp.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { missingInput, recipeInputs } from './artisan.js';
import { actionIntervalMs, MIN_ACTION_MS } from './pacing.js';
import { rateMult } from './away.js';
import { nextBuffExpiryMs, hasActiveBuff, tickBuffs, pruneBuffs } from './buffs.js';

function call(fx, name, ...args) {
  const f = fx && fx[name];
  return typeof f === 'function' ? f(...args) : undefined;
}
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** The Hearth's skill: the only bench a run is indexed on. */
export const FUEL_SKILL = 'inner_flame';

/* Why a span stopped before the absence did. STATED by the simulation, never inferred by a renderer.
   `null` means "it ran the whole window". */
export const STOP_REASON = Object.freeze({
  IDLE: 'idle',                       // no activity pointer at all
  UNKNOWN_RECIPE: 'unknown_recipe',   // the id is not a fuel run
  SUPPLIES: 'supplies',               // the fuel ran out (the ordinary stop)
  /* The CALLER capped how much work this span may do (`ctx.maxActions`): the accrual engine's degrade ladder asking
     for a smaller proposal after a clamp. Not a stop of the run: the hero is still at the Hearth, so the caller keeps
     the pointer (accrue-artisan.js names SUPPLIES alone as the end). */
  BUDGET: 'budget',
});

/** Is this row a fuel run: a `fuel_<item>` row on the Hearth's bench that makes nothing? */
export function isFuelRun(skill, recipe) {
  return skill === FUEL_SKILL && !!recipe && typeof recipe.id === 'string' && /^fuel_[a-z0-9_]+$/.test(recipe.id)
    && !recipe.output && Object.keys(recipeInputs(recipe)).length === 1;
}

/**
 * The run index: `{ [recipeId]: { skill, recipe } }`, over the fuel runs of `sources` (ARTISAN_RECIPES' shape,
 * `{ <bench>: [row] }`). Any other row is not indexed, so no id outside the fuel runs can be priced.
 *
 * NULL-PROTOTYPE ON PURPOSE: `active_id` is bounded by /^[a-z0-9_]{1,64}$/ at the request layer, which matches
 * `constructor` and `__proto__`. A container with no prototype removes the hazard instead of guarding it.
 * First id wins on a duplicate.
 */
export function indexFuelRuns(sources) {
  const out = Object.create(null);
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    const list = src[skill];
    if (!Array.isArray(list)) continue;
    for (const recipe of list) {
      if (!isFuelRun(skill, recipe) || hasOwn(out, recipe.id)) continue;
      out[recipe.id] = Object.freeze({ skill, recipe });
    }
  }
  return out;
}

/** The interval one fuel action takes, DERIVED, never accepted: PACE.actionMs, the bench's speed perk
    (`flameSpeed`, via `speedKeyFor`) and `speedClamp`'s 0.70 fuse. No request field reaches it. */
export function fuelIntervalMs(skill, recipe, ctx) {
  return actionIntervalMs(skill, (recipe && recipe.ms) || 3000, { bonus: ctx && ctx.bonus });
}

/* THE SLICE BUDGET. A real buff queue holds at most one entry per BUFFS_DEF row, so this is never approached. Past it
   the boundary is Infinity and the rest of the span runs as ONE slice at the current rate: the budget stops the
   SPLITTING, never the replay (a `while (guard++ < N)` would exit with time unspent, the player's night lost). */
export const MAX_SLICES = 64;

/**
 * The step a slice runs at, clamped. SAFE BY CONSTRUCTION: `sliceSpan`'s `stepMs` callback is the one number a
 * compromised caller would want to shrink, so the real floor applies whatever it says. `minStepMs` is an opt-in
 * finer floor for a unit test measuring one action; anything non-numeric, zero or negative is the real floor.
 */
export function resolveStepMs(asked, minStepMs) {
  const n = Number(asked);
  const want = (isFinite(n) && n > 0) ? n : 0;
  const optIn = Number(minStepMs);
  const floor = (isFinite(optIn) && optIn > 0) ? optIn : MIN_ACTION_MS;
  return Math.max(floor, want);
}

/**
 * Run a span of elapsed time as SLICES, split where the rate changes (a buff's expiry), each at its own rate. The
 * sub-step remainder rides across slices: a `floor()` per slice would cost the player an action per boundary. With no
 * buff held there is ONE slice, a flat `floor(spanMs / interval)` loop. THE ORDER IS LOAD-BEARING: the slice's actions
 * run FIRST and the buff clock drains AFTER, so a buff alive when the action happens pays for it.
 *
 * @param spanMs the absence to replay, in ms
 * @param opts { stepMs(), run(n, stepMs) -> ran, nextBoundaryMs()?, boosted()?, drain(ms)?, rateMult?, minStepMs? }
 *             `run` returning fewer than n means the run stopped inside the slice.
 * @returns { ticks, paidMs, stopped, buffPaidMs, buffsExpired, slices }
 */
export function sliceSpan(spanMs, opts) {
  const out = { ticks: 0, paidMs: 0, stopped: false, buffPaidMs: 0, buffsExpired: [], slices: 0 };
  const o = opts || {};
  let remaining = Math.max(0, Number(spanMs) || 0);
  if (!(remaining > 0) || typeof o.run !== 'function' || typeof o.stepMs !== 'function') return out;

  const nextBoundary = typeof o.nextBoundaryMs === 'function' ? o.nextBoundaryMs : null;
  const boosted = typeof o.boosted === 'function' ? o.boosted : null;
  const drain = typeof o.drain === 'function' ? o.drain : null;
  const rate = (Number(o.rateMult) > 0) ? Number(o.rateMult) : 1;

  let carryMs = 0;
  while (remaining > 0) {
    const stepMs = resolveStepMs(o.stepMs(), o.minStepMs);
    /* No boundary source, or the budget spent: ONE slice. A zero/NaN/negative boundary is none (a 0 would make no progress). */
    const raw = (nextBoundary && out.slices < MAX_SLICES) ? Number(nextBoundary()) : Infinity;
    const boundary = (isFinite(raw) && raw > 0) ? raw : Infinity;
    out.slices++;
    const sliceMs = Math.min(remaining, boundary);
    const wasBoosted = boosted ? !!boosted() : false;
    const budget = sliceMs * rate + carryMs;
    const n = Math.floor(budget / stepMs);
    const ran = n > 0 ? (Number(o.run(n, stepMs)) || 0) : 0;
    out.ticks += ran;
    /* The run stopped INSIDE this slice: only the time that worked is paid, and only that time is charged to the buff. */
    if (ran < n) {
      const workedMs = ran * stepMs;
      out.paidMs += workedMs;
      if (wasBoosted) out.buffPaidMs += workedMs;
      collectExpired(drain, workedMs, out);
      out.stopped = true;
      break;
    }
    carryMs = budget - n * stepMs;
    out.paidMs += sliceMs;
    if (wasBoosted) out.buffPaidMs += sliceMs;
    collectExpired(drain, sliceMs, out);
    remaining -= sliceMs;
  }
  return out;
}

function collectExpired(drain, ms, out) {
  if (!drain || !(ms > 0)) return;
  const res = drain(ms);
  if (res && Array.isArray(res.expired)) for (const t of res.expired) out.buffsExpired.push(t);
}

function emptySummary(spanMs, ctx) {
  return {
    ticks: 0, paidMs: 0, stopped: false,
    stoppedBy: null, stoppedById: null, stoppedSkill: null, stoppedPerHour: 0,
    intervalMs: 0, slices: 0,
    /* the honesty payload (away-time-ruling.md "Player-facing honesty"), stated by the simulation */
    buffsPaused: false, buffPaidMs: 0, buffsExpired: [],
    capped: !!(ctx && ctx.capped),
    rateMult: rateMult(ctx),
    awayMs: spanMs,
    hrs: +(spanMs / 3600000).toFixed(2),
    skill: null, recipeId: null,
  };
}

/**
 * Simulate a SPAN of a fuel run: the accrual path (supabase/functions/hr-accrue/accrue-artisan.js).
 *
 * THE FUEL CHECK IS BEFORE THE ACTION: it is what lets the span report WHICH fuel ran out and at what rate
 * (`stoppedPerHour`, at the slice's own interval). The action that burns the last of it ENDS the run too (report #68:
 * "still fueling the hearth" with none left), so no later settle has to find it empty.
 *
 * @param state MUTATED. { skillTargetId, skills, inventory, supply?, buffs? }
 * @param ctx   { fromMs, toMs, recipes, bonus, fx, away, capped, maxActions?, minStepMs? }
 * @returns the welcome-back summary.
 */
export function simulateFuelSpan(state, ctx) {
  const c = ctx || {};
  const spanMs = Math.max(0, (Number(c.toMs) || 0) - (Number(c.fromMs) || 0));
  const base = emptySummary(spanMs, c);

  const targetId = state && state.skillTargetId;
  if (!targetId) return { ...base, stoppedBy: STOP_REASON.IDLE };
  /* THE BENCH IS THE INDEX'S, never the pointer's: the server holds one id (`player_state.active_id`) and no skill column. */
  const entry = hasOwn(c.recipes, targetId) ? c.recipes[targetId] : null;
  if (!entry || !entry.recipe) return { ...base, stoppedBy: STOP_REASON.UNKNOWN_RECIPE, stoppedById: targetId };
  const skill = entry.skill;
  const recipe = entry.recipe;
  const fx = c.fx || {};
  /* `active: true`: a run IS work, the one freeze condition `tickBuffs` honours. */
  const buffCtx = { away: !!c.away, active: true };
  const liveQueue = () => { const q = state.buffs; return (Array.isArray(q) && q.length > 0) ? q : null; };

  let lastStep = 0;
  let stopReason = null;
  let stoppedById = null;
  let stoppedPerHour = 0;
  /* THE CALLER'S ACTION CAP. `null`/absent = UNBOUNDED; tested before Number() because Number(null) is 0, finite, and
     would read an absent budget as a budget of zero. Negatives floor to 0: less than no work is no work. */
  const rawBudget = (c.maxActions === null || c.maxActions === undefined) ? NaN : Number(c.maxActions);
  let budgetLeft = Number.isFinite(rawBudget) ? Math.max(0, Math.floor(rawBudget)) : Infinity;
  const pool = () => state.supply || state.inventory;

  const span = sliceSpan(spanMs, {
    rateMult: rateMult(c),
    minStepMs: c.minStepMs,
    /* RE-DERIVED PER SLICE (the b347 bug was a captured `stepMs`). */
    stepMs: () => { lastStep = fuelIntervalMs(skill, recipe, c); return lastStep; },
    nextBoundaryMs: () => nextBuffExpiryMs(state.buffs),
    boosted: () => { const q = liveQueue(); return q ? hasActiveBuff(q) : false; },
    drain: (ms) => { const q = liveQueue(); return q ? tickBuffs(q, ms, buffCtx) : null; },
    run: (n, stepMs) => {
      /* Out of fuel for the next action: the stop, with what ran out and the rate it was burnt at. */
      const outOfFuel = () => {
        const missing = missingInput(recipe, pool());
        if (missing === null) return false;
        stopReason = STOP_REASON.SUPPLIES;
        stoppedById = missing;
        stoppedPerHour = Math.round((recipeInputs(recipe)[missing] || 1) * 3600000 / Math.max(1, stepMs));
        call(fx, 'onStop', stopReason, skill, targetId, missing);
        return true;
      };
      let done = 0;
      for (let i = 0; i < n; i++) {
        /* THE CALLER'S BUDGET FIRST: a budget stop is not about the fuel, and naming a fuel still in the bag would be false. */
        if (budgetLeft <= 0) {
          stopReason = STOP_REASON.BUDGET;
          call(fx, 'onStop', stopReason, skill, targetId, null);
          return done;
        }
        if (outOfFuel()) return done;
        const inputs = recipeInputs(recipe);
        for (const id of Object.keys(inputs)) call(fx, 'removeItem', id, inputs[id]);
        call(fx, 'addXp', recipe.xpSkill || skill, recipe.xp);
        done++;
        budgetLeft--;
        /* THE ACTION THAT BURNT THE LAST FUEL ENDS THE RUN (report #68), on every path. */
        if (outOfFuel()) return done;
      }
      return done;
    },
  });

  if (span.buffsExpired.length && Array.isArray(state.buffs)) state.buffs = pruneBuffs(state.buffs);

  return {
    ...base,
    ticks: span.ticks,
    paidMs: span.paidMs,
    stopped: span.stopped,
    stoppedBy: stopReason,
    stoppedById: stopReason ? stoppedById : null,
    stoppedSkill: stopReason ? skill : null,
    stoppedPerHour,
    intervalMs: lastStep,
    slices: span.slices,
    buffPaidMs: span.buffPaidMs,
    buffsExpired: span.buffsExpired,
    skill,
    recipeId: targetId,
  };
}
