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

import { resolveArtisanAction, missingInput, recipeInputs, gateOk } from './artisan.js?v=448';
import { bestTool, toolSpeed, toolXpB, toolDouble } from './tools.js?v=448';
import { actionIntervalMs } from './pacing.js?v=448';
import { CHANNEL, channelApplies, rateMult } from './away.js?v=448';
import { sliceSpan } from './skill-sim.js?v=448';
import { nextBuffExpiryMs, hasActiveBuff, tickBuffs, pruneBuffs } from './buffs.js?v=448';
import { levelOf } from './xp.js?v=448';

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
  /* The CALLER capped how much work this span may do (`ctx.maxActions`). Not a
     property of the player's state at all — it is the accrual engine's degrade
     ladder asking for a smaller proposal after a clamp rejection.

     ⚠ IT IS NOT A "STOP" IN THE SENSE THE OTHER TWO ARE. Supplies and the gate
       mean the bench cannot run any more; a budget means the CALLER stopped
       asking. The player is still at the bench, so a caller must not clear the
       activity pointer on this reason — see accrueArtisan in
       supabase/functions/hr-accrue/accrual.js, which lists SUPPLIES and GATE by
       name for exactly that reason. */
  BUDGET: 'budget',
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
 * ── WHY THERE IS AN ACTION BUDGET AS WELL AS A SPAN (b356, Security C1) ──
 * `ctx.maxActions` caps how many actions the span may run, independently of how
 * long the span is. It exists because THE SPAN IS NOT THE THING THAT BOUNDS AN
 * ARTISAN NIGHT — the BAG is, whenever the player left less material than the
 * clock could consume. The server's degrade ladder (index.ts) answers a clamp
 * rejection by halving the span and re-simulating, which works for combat and
 * gathering because their output is proportional to time; here it is not.
 * Measured on `forge_dawn_axe` over a 24h absence with a 4,000-craft bag: the
 * 24h span and the 12h span both produce 4,000 actions and BYTE-IDENTICAL
 * deltas, so the ladder spends an attempt, earns the same rejection, and has
 * one attempt left before the last-resort forfeit that pays NOTHING.
 * Capping ACTIONS makes each rung of the ladder an exact halving of the
 * proposal whether the clock or the bag was binding, which is what the ladder's
 * contract has always claimed.
 *
 * @param state MUTATED. { activeSkill, skillTargetId, skills, inventory,
 *                         equipment, unlockedRecipes, toolCarry, stats, buffs? }
 * @param ctx   { fromMs, toMs, recipes, items, rng, bonus, fx, away, capped,
 *                maxActions? }
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

  /* THE CALLER'S ACTION CAP. `null`/absent/non-finite → UNBOUNDED, which is
     byte-for-byte the behaviour before it existed. Negatives floor to 0 rather
     than wrapping to unbounded: the only honest reading of "less than no work"
     is "no work", and the alternative — treating a garbage cap as no cap —
     would turn a caller bug into a full-size proposal, which is the direction
     that costs a player their night. */
  /* ⚠ `null` AND `undefined` ARE TESTED BEFORE `Number()`, AND THAT IS A BUG
     FIX RATHER THAN A STYLE. `Number(null)` is **0**, which is finite — so the
     obvious `Number.isFinite(Number(c.maxActions))` reads an ABSENT budget as a
     budget of ZERO and every artisan accrual returns `nothing_accrued`. Found
     by running it: the very first call after wiring the field answered
     `accrued:false / nothing_accrued / stoppedBy:budget` on a 24-hour night
     with a full bag. `Number(undefined)` is NaN, so the undefined path would
     have worked and the null path would not — the two callers that pass `null`
     explicitly (index.ts's first attempt, and set-activity.js's collect, which
     has no ladder at all) would have been the ones broken. */
  const rawBudget = (c.maxActions === null || c.maxActions === undefined)
    ? NaN : Number(c.maxActions);
  const bounded = Number.isFinite(rawBudget);
  let budgetLeft = bounded ? Math.max(0, Math.floor(rawBudget)) : Infinity;

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
        /* ── THE CALLER'S BUDGET, CHECKED FIRST. Before the supply check and
           before the gate, deliberately: those two report WHY THE BENCH cannot
           continue, and a budget stop is not about the bench at all. Reporting
           `supplies` for a run the ladder truncated would name an ingredient
           that is still in the bag — a welcome-back line that is simply false,
           and a `stoppedById` a support request would chase. */
        if (budgetLeft <= 0) {
          stopReason = STOP_REASON.BUDGET;
          call(fx, 'onStop', stopReason, skill, targetId, null);
          return done;                       // fewer than n → the span stops here
        }
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
        budgetLeft--;
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
   WHICH BENCHES THE SERVER MAY PAY — a PROPERTY, not a list of names.

   ── THE HISTORY, BECAUSE THE SHAPE IS THE ARGUMENT ────────────────────
   This block used to say "the server can never run this", for two named
   reasons. Both are now closed, and the closure is worth reading before
   changing anything below:

     • `state.unlockedRecipes` (8 gated recipes) — the STORAGE is closed by
       2026-08-16-artisan-progress-model.sql. Recipe scrolls are
       `player_progress` rows of `kind='flag'`, key `recipe:<scroll_id>`,
       projected by `hr_perks_of` into the CLIENT'S OWN wire shape
       (`{ id: true }`) so `gateOk` consumes both with one expression. An
       absent row is an absent key is a LOCKED recipe — the fail-closed
       default is the shape's default rather than a branch somebody wrote.
     • `bonus('noBurn')` — the READ is closed by the same migration
       (`room:kitchen` is a `kind='unlock'` rung, `hr_unlock_levels` →
       `hr_perks_of` → `makeBonus`). The WRITE is NOT: see below.

   ⚠ CORRECTION (Security C4). AN EARLIER DRAFT OF THIS BLOCK SAID BOTH WERE
     "CLOSED", FULL STOP, AND THAT ARGUMENT WAS WRONG. Owning the STORAGE is
     not owning the PROVENANCE. Every `room:*` and `recipe:*` row standing in
     production today was written by the CUTOVER IMPORT, which read the
     client's own `G.rooms` / `G.unlockedRecipes` out of a save blob and
     trusted it exactly once under Tyler's explicit amnesty (the wipe was
     deferred, so those numbers were never re-earned). They are therefore
     client-authored values that the server now stores and pays out of —
     measured live: 5 of 7 characters hold room rows, 4 hold `room:kitchen`
     at rungs 2-3, and 4 recipe flags exist.

     WHAT THAT COSTS, STATED RATHER THAN GLOSSED: an imported rung pays real
     ITEMS on every artisan night, through `yield_smithing` / `yield_crafting`
     / `craftSave` and the bench speed keys. A forged pre-cutover save is
     therefore still earning a small permanent bonus. It is BOUNDED — the
     permanent perk fuse is +20% per key, the ladders are short, and nothing
     here crosses to another player's economy or ranking, which is the target
     property — and it is ACCEPTED, because it is the amnesty Tyler chose over
     the wipe, not an oversight of this file. It is written down here so the
     next author does not re-derive it, and so nobody reads "the server owns
     the rung" as "the rung was honestly earned".

   ── THE ONE THING THAT IS STILL OPEN, AND WHY IT GATES ONE BENCH ──────
   Reading a rung is not owning the WRITE either. `src/legacy.js upgradeRoom()`
   still writes `G.rooms[id] = lv + 1` locally and uploads it in the save blob;
   `hr_unlock_buy` is deployed and has NO CLIENT CALL SITE, and `rooms` is
   not on `src/net/record.js`'s SERVER_OF_RECORD. So the client and the
   server hold two independent copies of every rung, and they agree only
   because the import copied one into the other ONCE. They diverge at the
   first rung a player buys after that import — and this time in the OTHER
   direction: the server's copy goes STALE-LOW.

   For almost every perk a stale-low rung is an UNDER-PAYMENT of a bonus —
   the direction this engine is already wrong in, by name, for renown, the
   clan castle and companions. `noBurn` is the single exception in the whole
   catalogue: it does not shave a bonus, it decides whether the recipe's
   INPUT becomes the dish or becomes `burnt_food`. A server reading a stale
   Kitchen 0 against a client's Kitchen 3 destroys a quarter of the input
   the player already paid gold to protect. That asymmetry — every other key
   fails safe, this one fails destructive — is the whole reason the gate below
   is per-KEY rather than per-bench or per-kind.

   So the rule is written as the property, not as the name "cooking":

     A BENCH IS PAYABLE WHEN EVERY BONUS KEY THAT CAN DESTROY VALUE ON IT
     IS SOURCED FROM STATE THE SERVER OWNS END TO END.

   `SERVER_OWNED_BONUS_KEYS` is the one line that changes when the client's
   room purchase is routed through `hr_unlock_buy`: add `'noBurn'` and
   cooking becomes payable, with no other edit anywhere. That is deliberate —
   §9(3) of 2026-08-16-artisan-progress-model.sql authorises exactly this
   ("…OR when cooking specifically is excluded until it is"), and a gate that
   opens by adding a fact rather than by deleting a check is a gate somebody
   can actually be trusted to open.
   ══════════════════════════════════════════════════════════════════════════ */

/* The bonus keys whose SOURCE is server-owned GOING FORWARD: every future
   change to the row comes from a SECURITY DEFINER RPC rather than from a save
   blob. Deliberately NOT "never authored by a client" — the amnestied import
   above means the current BASELINE is client-authored for everyone, and a
   comment that claimed otherwise would be the same wrong argument C4 caught.
   What this list promises is that the row cannot MOVE without the server.

   EMPTY TODAY, and the emptiness is a measurement rather than a placeholder:
   `hr_unlock_buy` exists and is deployed, and `grep -rn unlock_buy src/`
   returns exactly one hit, in a comment. */
export const SERVER_OWNED_BONUS_KEYS = Object.freeze([]);

/* ── THE COOKING SETTLEMENT ARM (b431), SHIPPED DORMANT ──────────────────────
   The one line the header above promised: `noBurn` becomes a server-owned bonus
   key exactly when the Kitchen ROOM rung it comes off is server-owned — which is
   the day src/net/record.js ROOMS_RECORD_ARM_ENABLED flips. This flag is that
   day's switch on the artisan side, and it is COUPLED to the rooms record arm and
   to item-authority.js COOKING_SETTLEMENT_ARM_ENABLED (which flips
   ARTISAN_SETTLEMENT.cooking 'unmodeled'→'payable'); the three move together in
   one post-wipe rollout commit. A drift guard (smoke ROOMS-COOKING-ARM) asserts
   this const equals item-authority's twin.

   Default OFF, with a runtime override seam for tests. While off,
   `serverOwnedBonusKeys()` is empty and `benchPayable('cooking')` stays false —
   the accrual engine keeps refusing cooking, exactly as today, and nothing
   changes byte-for-byte. `SERVER_OWNED_BONUS_KEYS` stays the frozen empty const
   it always was (external readers — tests/artisan-accrual.mjs — see the dormant
   baseline); benchPayable/benchBlockedBy read the runtime set instead. */
export const COOKING_SETTLEMENT_ARM_ENABLED = false;   // DORMANT — post-wipe, coupled with rooms record arm
let cookingArmOverride = null;
export function isCookingSettlementArmed() {
  return cookingArmOverride !== null ? cookingArmOverride : COOKING_SETTLEMENT_ARM_ENABLED;
}
/** Test seam, same spirit as record.js __setSkillsRecordArm. Returns the armed state. */
export function __setCookingSettlementArm(v) {
  cookingArmOverride = (v === null || v === undefined) ? null : !!v;
  return isCookingSettlementArmed();
}
/** The bonus keys the server owns end-to-end RIGHT NOW: `noBurn` once the cooking
    settlement is armed, else nothing. The one fact benchPayable reads. */
export function serverOwnedBonusKeys() {
  return isCookingSettlementArmed() ? ['noBurn'] : SERVER_OWNED_BONUS_KEYS.slice();
}

/* Per bench, the bonus keys that can make the server's answer WORSE than the
   client's rather than merely smaller. One entry, and it is the whole table:
   `noBurn` turns a Cooked Shark into `burnt_food`. `craftSave`, `yield_*` and
   every speed key can only ever ADD, so a stale zero under-pays — which is the
   safe direction and the one this engine already ships in four other places.

   A bench absent from this map has no destructive key and is payable. That
   default is asserted, not assumed: ARTISAN_BENCH_COVERAGE in
   tests/artisan-accrual.mjs walks ARTISAN_RECIPES and fails on a bench this
   file has never been told about. */
export const BENCH_DESTRUCTIVE_KEYS = Object.freeze({
  cooking: Object.freeze(['noBurn']),
});

/**
 * May the accrual engine pay this bench tonight? Pure, total, and TRUE for a
 * bench nobody has listed — the same fail-open-on-unknown default
 * `channelApplies` takes, and for the same reason: every historical away bug in
 * this codebase was a base reward silently vanishing, so an unlisted bench must
 * not quietly stop paying. What it may NOT do is quietly pay a DESTRUCTIVE key
 * the server cannot vouch for, which is what the map above enumerates.
 */
export function benchPayable(skill) {
  const keys = BENCH_DESTRUCTIVE_KEYS[skill];
  if (!Array.isArray(keys) || keys.length === 0) return true;
  const owned = serverOwnedBonusKeys();
  for (const k of keys) if (owned.indexOf(k) === -1) return false;
  return true;
}

/** Which bonus key is holding this bench back, or null. Named so a refusal can
    say WHY instead of only NO — a player told "cooking is unsupported" files a
    bug; a log line naming `noBurn` points at the one commit that opens it. */
export function benchBlockedBy(skill) {
  const keys = BENCH_DESTRUCTIVE_KEYS[skill];
  if (!Array.isArray(keys)) return null;
  const owned = serverOwnedBonusKeys();
  for (const k of keys) if (owned.indexOf(k) === -1) return k;
  return null;
}

/**
 * Is this recipe id one the server may be told about AND pay?
 *
 * ⚠ THE TWO QUESTIONS ARE ONE ANSWER ON PURPOSE. A recipe the engine cannot
 *   price must not be SETTABLE either, because `hr_apply` stamps
 *   `accrued_to = now()` on any activity change: a pointer that can be set and
 *   not paid is a window the next switch CONFISCATES, and — worse — a collect
 *   that refuses on an unpayable pointer refuses the switch too, which locks
 *   the player on that bench forever (the `no_cap` lockout shape). One
 *   predicate, read by the engine, by the intent's shape check and by the
 *   client's `declarationFor`, is what makes those three agree by construction.
 *
 * `hasOwn`, never truthiness: the index is null-prototype (see
 * `indexArtisanRecipes`) but this is also called with plain objects in tests,
 * and `active_id` is bounded by /^[a-z0-9_]{1,64}$/ — which spells `constructor`.
 */
export function recipePayable(index, recipeId) {
  if (!index || typeof recipeId !== 'string' || !recipeId) return false;
  if (!hasOwn(index, recipeId)) return false;
  const entry = index[recipeId];
  return !!(entry && entry.recipe && benchPayable(entry.skill));
}

/** Every recipe id the server may be told about, as a null-prototype set.
    Derived from the index, so a fifth bench — or the day `noBurn` becomes
    server-owned — moves this with no edit here. */
export function payableRecipeIndex(index) {
  const out = Object.create(null);
  for (const id of Object.keys(index || {})) {
    if (recipePayable(index, id)) out[id] = index[id];
  }
  return out;
}
