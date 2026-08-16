// ============================================================
// src/core/artisan-sim.js — ONE ARTISAN LOOP, and the SPAN it runs in.
//
// The third member of the family, and the last one missing: combat-sim.js owns
// the fight, skill-sim.js owns gathering, and until this file existed the 290
// artisan activities — 84% of the 344-row catalogue — had no DOM-free form at
// all. `supabase/functions/hr-accrue/accrual.js` refuses them, and legacy.js's
// away branch replayed them by calling `window.doArtisanAction` thousands of
// times, i.e. the whole production step lived behind a function that writes the
// bag, fires toasts and repaints two panels.
//
// ── WHAT WAS ALREADY EXTRACTED, AND WHAT WAS NOT ─────────────────────
// `src/core/artisan.js resolveArtisanAction` already owned ONE tick's
// arithmetic (inputs, gate, craftSave, burn, yield_*, tool carry, XP) — but it
// only DESCRIBES the tick; something has to apply the description, decide when
// the run has run dry, and divide an absence into ticks. That "something" was
// 90 lines of legacy.js, and it is here now:
//
//   resolveArtisanTick   applies the description   (was: the body of doArtisanAction)
//   simulateArtisanSpan  divides the absence       (was: the artisan branch of processOffline)
//   artisanIntervalMs    derives the rate          (was: offlineIntervalMs -> activityIntervalMs)
//   indexArtisanRecipes  resolves an id to a bench (was: ARTISAN_RECIPES[G.activeSkill].find)
//
// ── IT IS THE SAME SPAN LOOP GATHERING RUNS ──────────────────────────
// `sliceSpan` is imported from skill-sim.js rather than re-implemented. That is
// the entire point of the b347 shape: the boundary source is injected, so
// splitting an absence at buff expiry is ONE mechanism serving gather, artisan
// and (through `utcDaySegments`) combat. A second copy of that loop is how the
// artisan branch came to be the only away path with no timeline in the first
// place.
//
// THE INTERVAL IS THE LEVER. `n = floor(sliceMs / stepMs)` makes `stepMs` the
// divisor of the entire grant, and a `cookSpeed` buff moves it — which is
// exactly why it is RE-DERIVED per slice and never captured once. legacy.js
// captured it once before b347 and paid a 10-minute consumable for a whole
// night.
//
// ── WHAT IS INJECTED ─────────────────────────────────────────────────
//   ctx.rng      src/core/rng.js contract (craftSave, burn, yield — in that
//                order; the order is part of the replay contract)
//   ctx.bonus    the perk stack; blessing/buff channels gate via core/away.js
//   ctx.items    the ITEMS catalogue, for the tool lookup and isMaterialOutput
//   ctx.recipes  the recipe index (see `indexArtisanRecipes`)
//   ctx.fx       the effect sink; a missing handler is a no-op, so a bare call
//                simulates without side effects
//
// `state` is MUTATED in place, matching grantXp / simulateTick / simulateSkillSpan.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { resolveArtisanAction, missingInput, recipeInputs, gateOk } from './artisan.js?v=354';
import { bestTool, toolSpeed, toolXpB, toolDouble } from './tools.js?v=354';
import { actionIntervalMs } from './pacing.js?v=354';
import { CHANNEL, channelApplies, rateMult } from './away.js?v=354';
import { sliceSpan } from './skill-sim.js?v=354';
import { nextBuffExpiryMs, hasActiveBuff, tickBuffs, pruneBuffs } from './buffs.js?v=354';
import { levelOf } from './xp.js?v=354';

function fxOf(ctx) { return (ctx && ctx.fx) || {}; }
function call(fx, name, ...args) {
  const f = fx[name];
  return typeof f === 'function' ? f(...args) : undefined;
}
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

export const OUTCOME = { PRODUCE: 'produce', BURN: 'burn', STOP: 'stop' };

/* Why a span stopped before the absence did. STATED by the simulation, never
   inferred by a renderer — the same rule skill-sim.js's STOP_REASON states.
   `null` means "it ran the whole window". */
export const STOP_REASON = Object.freeze({
  IDLE: 'idle',                       // no activity pointer at all
  UNKNOWN_RECIPE: 'unknown_recipe',   // the id is not in the recipe index
  WRONG_SKILL: 'wrong_skill',         // pointer and index disagree about the bench
  SUPPLIES: 'supplies',               // an input ran out (the ordinary stop)
  GATE: 'gate',                       // the recipe scroll is not unlocked
});

/* The benches this file can simulate. Derived from the index the caller builds
   rather than hardcoded, so a fifth bench is a data row. */
export function isArtisanSkill(skillId, index) {
  if (!index) return false;
  for (const id of Object.keys(index)) if (index[id].skill === skillId) return true;
  return false;
}

/**
 * Build the recipe index: `{ [recipeId]: { skill, recipe } }`.
 *
 * `sources` is ARTISAN_RECIPES itself (`{ cooking: [...], smithing: [...] }`),
 * so the mapping stays authored in src/data and core imports no content.
 *
 * ⚠ NULL-PROTOTYPE ON PURPOSE, for the reason `indexGatherNodes` states:
 *   `active_id` is bounded by /^[a-z0-9_]{1,64}$/ at the request layer, which
 *   matches `constructor` and `__proto__`. A container with no prototype
 *   removes the hazard instead of guarding against it — and this index is the
 *   one that would matter most, because a truthy miss here reaches
 *   `recipe.cost` / `recipe.inputs` (Security's C6, pre-registered).
 *
 * First id wins on a duplicate; `duplicateRecipeIds` reports them.
 */
export function indexArtisanRecipes(sources) {
  const out = Object.create(null);
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    const list = src[skill];
    if (!Array.isArray(list)) continue;
    for (const recipe of list) {
      if (!recipe || typeof recipe.id !== 'string' || !recipe.id) continue;
      if (hasOwn(out, recipe.id)) continue;
      out[recipe.id] = { skill, recipe };
    }
  }
  return out;
}

/** Ids claimed by more than one bench. Empty in shipped data (290 recipes,
    0 collisions, measured); a guard asserts it rather than trusting it. */
export function duplicateRecipeIds(sources) {
  const seen = Object.create(null);
  const dupes = [];
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    for (const recipe of (Array.isArray(src[skill]) ? src[skill] : [])) {
      if (!recipe || typeof recipe.id !== 'string' || !recipe.id) continue;
      if (hasOwn(seen, recipe.id)) dupes.push({ id: recipe.id, skills: [seen[recipe.id], skill] });
      else seen[recipe.id] = skill;
    }
  }
  return dupes;
}

/** The best tool the character owns for this bench, from server-owned state. */
export function toolFor(state, skill, items) {
  return bestTool(skill, (state && state.inventory) || {}, (state && state.equipment) || {}, items || {});
}

/**
 * The interval one artisan action takes, DERIVED — never accepted.
 *
 * This is legacy.js's `activityIntervalMs()` for the artisan branch, expressed
 * once. It applies PACE.actionMs, the bench's own speed perk (`cookSpeed` /
 * `smithSpeed` / `craftSpeed` / `prayerSpeed`, via `speedKeyFor`), the tool
 * ladder, and `speedClamp`'s 0.70 fuse. No request field reaches it.
 */
export function artisanIntervalMs(state, skill, recipe, ctx) {
  const c = ctx || {};
  const tool = toolFor(state, skill, c.items);
  return actionIntervalMs(skill, (recipe && recipe.ms) || 3000, {
    bonus: c.bonus,
    toolSpeed: () => toolSpeed(tool),
  });
}

/**
 * ONE artisan production tick, applied. This is what the body of
 * `window.doArtisanAction` became — minus the toast, the two repaints and the
 * timer retime, which arrive through `fx`.
 *
 * The DECISION is still `resolveArtisanAction`'s; this function only applies
 * it, in the order legacy.js applied it: consume, then produce, then XP, then
 * counters. That order is observable through a bank cap.
 *
 * @param state MUTATED: inventory (via fx), skills (via fx.addXp), stats, toolCarry
 * @param recipe an ARTISAN_RECIPES row
 * @param ctx { skillId, rng, bonus, items, toolDouble, toolXpB, fx }
 */
export function resolveArtisanTick(state, recipe, ctx) {
  const c = ctx || {};
  const fx = fxOf(c);
  const skill = c.skillId;
  const bonus = typeof c.bonus === 'function' ? c.bonus : () => 0;
  if (!state.toolCarry || typeof state.toolCarry !== 'object') state.toolCarry = {};

  const res = resolveArtisanAction(recipe, {
    skillId: skill,
    inventory: state.inventory,
    unlockedRecipes: state.unlockedRecipes,
    items: c.items,
    /* Derived HERE, from state, rather than accepted from the caller — two
       expressions of one number is how a bonus comes to apply live and not
       away (the `res.xpAmount` lesson from skill-sim.js, applied to burn). */
    cookingLevel: levelOf(state.skills, 'cooking'),
    noBurn: bonus('noBurn') || 0,
    bonus,
    toolCarry: state.toolCarry,
    toolDouble: c.toolDouble || 0,
    toolXpB: c.toolXpB || 0,
    rng: c.rng,
  });

  if (!res.ok) return { outcome: OUTCOME.STOP, reason: res.reason, missing: res.missing, res };

  /* Inputs. `consumed` is empty when craftSave refunded them. Through fx
     because the client's removeItem maintains the collection log and the
     server's accumulates a signed delta hr_apply re-validates. */
  for (const id of Object.keys(res.consumed)) call(fx, 'removeItem', id, res.consumed[id]);

  if (res.produced) call(fx, 'addItem', res.produced.id, res.produced.qty);
  if (res.xpAmount) call(fx, 'addXp', res.xpSkill, res.xpAmount);

  state.stats = state.stats || {};
  for (const k of Object.keys(res.stats)) state.stats[k] = (state.stats[k] || 0) + res.stats[k];
  /* `res.progress` is EMPTY on a burn — a "cook N dishes" goal counts
     successful cooks only. One table (BENCH_COUNTERS), so the daily and the
     stat cannot half-update the way b217 shipped. */
  for (const key of res.progress) {
    call(fx, 'updateDaily', key, 1);
    call(fx, 'updateQuest', key, 1);
  }
  if (res.burnt) call(fx, 'onBurn', recipe, res);

  return { outcome: res.burnt ? OUTCOME.BURN : OUTCOME.PRODUCE, res };
}

function emptySummary(spanMs, ctx) {
  return {
    ticks: 0, produced: 0, burnt: 0, toolDoubles: 0,
    paidMs: 0, stopped: false,
    stoppedBy: null, stoppedById: null, stoppedSkill: null, stoppedPerHour: 0,
    intervalMs: 0, slices: 0,
    /* ── the honesty payload (away-time-ruling.md, "Player-facing honesty") ──
       Stated by the simulation, not inferred by a renderer. */
    /* Ruling 3.5 — reported by `AWAY_SCOPE.blessing`, never restated here.
       See the long note at the same field in src/core/combat-sim.js. */
    blessed: channelApplies(CHANNEL.BLESSING, ctx),
    buffsPaused: false,      // buffs pay away and drain away — nothing is paused
    buffPaidMs: 0, buffsExpired: [],
    capped: !!(ctx && ctx.capped),
    rateMult: rateMult(ctx),
    awayMs: spanMs,
    hrs: +(spanMs / 3600000).toFixed(2),
    skill: null, recipeId: null,
  };
}

/**
 * Simulate a SPAN of artisan production — the accrual path, and the client's
 * away path.
 *
 * ── THE SUPPLY CHECK IS *BEFORE* THE ACTION, DELIBERATELY ────────────
 * `resolveArtisanAction` also refuses on missing inputs, so asking twice looks
 * redundant. It is not: the pre-check is what lets the span report WHICH
 * ingredient ran out and AT WHAT RATE it was being consumed (`stoppedPerHour`),
 * using the slice's own interval — the rate the run was actually going at when
 * it ran dry, not the rate at dawn. The client has shown that line since b228
 * ("Out of Raw Shrimp — cooking stopped") and it is the single most useful
 * sentence in a welcome-back summary.
 *
 * ── ONE DELIBERATE BEHAVIOUR CHANGE, STATED SO IT IS NOT DISCOVERED ──
 * legacy.js's away branch pre-checked INPUTS only. A GATED recipe therefore hit
 * `doArtisanAction`'s own refusal, which calls `stopSkill()` and clears
 * `G.activeSkill` — and every remaining call that night became a silent no-op
 * against `ARTISAN_RECIPES[null]`. The night was consumed and reported as if it
 * had worked. Here the gate is a first-class `STOP_REASON.GATE`: the span stops,
 * says so, and only the time actually worked is paid. Unreachable today (an
 * unlock is never revoked mid-absence) and it is the correct direction.
 *
 * @param state MUTATED. { activeSkill, skillTargetId, skills, inventory,
 *                         equipment, unlockedRecipes, toolCarry, stats, buffs? }
 * @param ctx   { fromMs, toMs, recipes, items, rng, bonus, fx, away, capped }
 * @returns the welcome-back summary.
 */
export function simulateArtisanSpan(state, ctx) {
  const c = ctx || {};
  const spanMs = Math.max(0, (Number(c.toMs) || 0) - (Number(c.fromMs) || 0));
  const base = emptySummary(spanMs, c);

  const targetId = state && state.skillTargetId;
  if (!targetId) return { ...base, stoppedBy: STOP_REASON.IDLE };

  /* THE BENCH IS DERIVED FROM THE INDEX, NOT READ OFF THE POINTER — the server
     holds ONE id (`player_state.active_id`) and no skill column. The client
     also holds `activeSkill`; if the two disagree the state is inconsistent and
     paying would credit the wrong bench's XP, so refuse instead. */
  const entry = hasOwn(c.recipes, targetId) ? c.recipes[targetId] : null;
  if (!entry || !entry.recipe) {
    return { ...base, stoppedBy: STOP_REASON.UNKNOWN_RECIPE, stoppedById: targetId };
  }
  const skill = entry.skill;
  const recipe = entry.recipe;
  if (state.activeSkill && state.activeSkill !== skill) {
    return { ...base, stoppedBy: STOP_REASON.WRONG_SKILL, stoppedById: targetId, stoppedSkill: state.activeSkill };
  }

  const fx = fxOf(c);
  /* `active: true` — a running bench IS work, which is the one freeze condition
     `tickBuffs` still honours. Deliberately not re-read after the stop: b347's
     rule is that a buff is spent on the work it paid for, and the client's
     `advanceBuffClock` reads `G.activeSkill`, which the refusal branch has
     already cleared. */
  const buffCtx = { away: !!c.away, active: true };
  const liveQueue = () => {
    const q = state.buffs;
    return (Array.isArray(q) && q.length > 0) ? q : null;
  };

  let lastStep = 0;
  let stopReason = null;
  let stoppedById = null;
  let stoppedPerHour = 0;
  let produced = 0;
  let burnt = 0;
  let toolDoubles = 0;

  const span = sliceSpan(spanMs, {
    rateMult: rateMult(c),
    minStepMs: c.minStepMs,
    /* RE-DERIVED PER SLICE — see the header. A single captured `stepMs` is
       precisely the b347 bug. */
    stepMs: () => { lastStep = artisanIntervalMs(state, skill, recipe, c); return lastStep; },
    nextBoundaryMs: () => nextBuffExpiryMs(state.buffs),
    boosted: () => { const q = liveQueue(); return q ? hasActiveBuff(q) : false; },
    drain: (ms) => { const q = liveQueue(); return q ? tickBuffs(q, ms, buffCtx) : null; },
    run: (n, stepMs) => {
      /* Resolved ONCE PER SLICE, not per action: no recipe yields a tool of its
         own bench mid-run, and the alternative is a full catalogue walk per
         tick across thousands of ticks. */
      const tool = toolFor(state, skill, c.items);
      const tickCtx = {
        skillId: skill, rng: c.rng, fx, items: c.items, bonus: c.bonus,
        toolDouble: toolDouble(tool), toolXpB: toolXpB(tool),
      };
      let done = 0;
      for (let i = 0; i < n; i++) {
        /* The supply pre-check. Captured HERE rather than read at report time:
           the caller's refusal path clears the activity pointer, so anything
           downstream asking "what was running?" would find null. */
        const missing = missingInput(recipe, state.inventory);
        if (missing !== null) {
          stopReason = STOP_REASON.SUPPLIES;
          stoppedById = missing;
          const need = (recipeInputs(recipe) || {})[missing] || 1;
          stoppedPerHour = Math.round(need * 3600000 / Math.max(1, stepMs));
          call(fx, 'onStop', stopReason, skill, targetId, missing);
          return done;                       // fewer than n → the span stops here
        }
        if (!gateOk(recipe, state.unlockedRecipes)) {
          stopReason = STOP_REASON.GATE;
          stoppedById = recipe.gated || targetId;
          call(fx, 'onStop', stopReason, skill, targetId, recipe.gated || null);
          return done;
        }
        const r = resolveArtisanTick(state, recipe, tickCtx);
        if (r.outcome === OUTCOME.STOP) {
          /* Belt and braces: the resolver refused for a reason the pre-checks
             above do not model. Report it rather than looping on it. */
          stopReason = r.reason === 'gate' ? STOP_REASON.GATE : STOP_REASON.SUPPLIES;
          stoppedById = r.missing || targetId;
          call(fx, 'onStop', stopReason, skill, targetId, r.missing || null);
          return done;
        }
        if (r.outcome === OUTCOME.BURN) burnt++;
        else produced += (r.res.produced ? r.res.produced.qty : 0);
        toolDoubles += r.res.toolDoubles || 0;
        done++;
      }
      return done;
    },
  });

  if (span.buffsExpired.length && Array.isArray(state.buffs)) state.buffs = pruneBuffs(state.buffs);

  return {
    ...base,
    ticks: span.ticks,
    produced, burnt, toolDoubles,
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

/* ══════════════════════════════════════════════════════════════════════════
   WHAT STILL BLOCKS THE SERVER FROM RUNNING THIS — a missing MODEL, not
   missing code. Stated here because this file is where the next author looks.

   `simulateArtisanSpan` is pure and Deno-runnable today, and the accrual engine
   could import it this afternoon. It must NOT be added to PAYABLE_KINDS until
   two pieces of server state exist, because widening PAYABLE_KINDS widens
   SETTABLE_KINDS with it and lets a player set an activity the engine prices
   WRONG — which is worse than today's deferral, where the refusal returns
   `delta: NONE` and the watermark does not move, so the time is DEFERRED rather
   than confiscated:

     • `state.unlockedRecipes` — 8 gated recipes. There is no `player_progress`
       row that holds it and no intent that writes one. Absent, `gateOk` refuses
       and the span reports GATE, i.e. the night stops at tick 0.
     • `bonus('noBurn')` — the Kitchen rung of the property model, which does
       not exist server-side at all. `zeroBonus()` returns 0 for every channel,
       so a server that cooked tonight would burn at the base 25% while the
       player's Kitchen says 0%. That is not an under-payment at the margin; it
       is the server DESTROYING items the client would have kept.

   Both are `player_progress` shapes, and both are the same job as the unlock
   ruling in worktree-agent-a079e5c2e5260c6f8. Neither is in this file's scope.
   ══════════════════════════════════════════════════════════════════════════ */
