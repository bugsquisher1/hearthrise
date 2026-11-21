// ============================================================================
// supabase/functions/hr-accrue/accrue-artisan.js — A BENCH POINTER'S WINDOW.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// computeAccrual reaches it through KIND_ACCRUERS.artisan.
// ============================================================================

import { equipmentStats } from '../../../src/core/combat.js';
/* The third simulation. `simulateArtisanSpan` runs the SAME `sliceSpan` the
   gather path runs, over the same `resolveArtisanAction` the live bench runs —
   one loop, three callers, which is the whole b351 shape. */
import { simulateArtisanSpan, STOP_REASON as ARTISAN_STOP } from '../../../src/core/artisan-sim.js';
import { BENCH_COUNTERS } from '../../../src/core/artisan.js';
import { taxFor } from '../../../src/core/bench-tax.js';
import { createRng } from '../../../src/core/rng.js';
import { bonusFor, liveBuffHost } from '../../../src/core/member.js';
import { grantXp, normaliseXpFrac, xpFracChanges } from '../../../src/core/progression.js';
import { buffQueueFromServer } from '../../../src/core/buffs.js';
import { makeGoalCounter, goalProgressOps } from '../../../src/core/goals.js';
import { catalogueHas } from './intents.js';
import { nat, SKIP, accrualCaller } from './accrual-contract.js';
import { windowWaste, windowEnvelope, settledWatermarkMs, normaliseToolCarry, roundCarry } from './accrual-window.js';

/**
 * THE ARTISAN ACCRUAL. Same envelope, same rules, the third simulation.
 *
 * Nothing below re-implements a rule: the span loop (`sliceSpan`, shared with
 * gather), the interval, the burn roll, craftSave, the yield roll, the
 * deterministic tool carry and the XP grant all come out of
 * src/core/artisan-sim.js and src/core/artisan.js — the SAME functions the live
 * bench runs through `doArtisanAction`. The only thing that is server-specific
 * is the APPLY: the client mutates G, this accumulates a delta hr_apply
 * re-validates.
 *
 * ── THE ONE THING THIS PATH DOES THAT NEITHER OTHER PATH DOES ────────────
 * IT SPENDS. Combat debits food (auto-eat) and gathering debits nothing; an
 * artisan night consumes an INPUT on every single tick. That makes three
 * properties load-bearing rather than incidental:
 *
 *   1. THE BAG IS THE SERVER'S INVENTORY, and the simulation reads it. A run
 *      cannot produce more than the server can see, because `missingInput`
 *      inside `simulateArtisanSpan` reads `state.inventory` — which IS `bag` —
 *      and `fx.removeItem` decrements it. There is no separate "how much did I
 *      have" number to get wrong and no client count anywhere in the loop.
 *   2. RUNNING DRY IS A STOP, NOT A REFUSAL. The span pays the time it actually
 *      worked and reports `SUPPLIES` with the ingredient named; the REMAINDER
 *      of the absence pays nothing and is not confiscated either — the
 *      watermark still advances to `now`, exactly as a capped night's tail is
 *      forfeited, because the player genuinely was not producing. That is the
 *      shipped client's behaviour (`stopSkill()` on the first missing input)
 *      and it is preserved deliberately.
 *   3. THE POINTER MUST BE CLEARED when it stops. A bench with no inputs can
 *      never pay again, so leaving `active_id` on it would answer "nothing"
 *      forever — the same reasoning the gather path's LEVEL gate states, and
 *      the reason the nothing-happened return below is guarded by the stop
 *      reason rather than by the totals.
 *
 * @param inp  computeAccrual's input, verbatim
 * @param span { nowMs, grantMs, capped, credit } — computed by the shared
 *             preamble. `credit` is the WINDOW (Ruling 2).
 */
/* The span's action cap: the degrade ladder's budget and the run's own count, whichever is
   smaller; null when neither binds (absent and null are both "unbounded", see artisan-sim.js). */
function runCap(budget, left) {
  const b = (budget === null || budget === undefined) ? null : Number(budget);
  if (b === null) return left;
  return left === null ? b : Math.min(b, left);
}

export function accrueArtisan(inp, span) {
  const { nowMs, grantMs, capped, credit } = span;

  const items = inp.items || {};
  const recipes = inp.recipes || {};
  const equipment = inp.equipment || {};
  /* "MAKE N" (2026-12-01-bench-count.sql): the actions this run may still make, from the
     server's own player_state.active_left (envelope.js activeLeft); null = until an input runs
     out. It caps the span like the degrade ladder's budget, and the run ENDS on the action that
     reaches it (below), so N actions are paid however the settles are cut. */
  const left0 = Number.isInteger(inp.activeLeft) && inp.activeLeft > 0 ? inp.activeLeft : null;
  /* THE WORK BENCH TAX (Tyler 2026-11-01): the running job's fee, the carry and what the hero keeps, all from the server's
     `bench_tax` section; the purse is the envelope's. null (no section, a free job, the account owns the room) = no tax and no
     `bench_tax` key. hr_apply re-derives every number under the character lock (2027-02-19-bench-tax.sql). */
  const tax = taxFor(inp.benchTax, inp.benchTax && inp.benchTax.now_mg, inp.gold);
  /* Equipment reaches an artisan night through exactly one channel — `xpB`,
     the same term the client's xpGrantCtx() supplies. A bench has no accuracy,
     no max hit and no swing speed. (Tool speed is not equipment: it is the best
     tool the character OWNS, resolved from the bag by src/core/tools.js.) */
  const eq = equipmentStats(equipment, items);

  /* THE PERK STACK, and on this path it is not a bonus — it is the difference
     between a dish and a lump of charcoal. `bonus('noBurn')` is the Kitchen
     rung, read through hr_perks_of from a `kind='unlock'` progress row; absent
     it is 0 and `burnChance` is the base 0.25. That is precisely why
     `benchPayable` refused the cooking bench until the rung's WRITE path was
     server-owned (upgradeRoom→hr_unlock_buy + the rooms record arm) — now that
     it is, the bench is payable and this stack burns at the true rate. See the
     block at the foot of src/core/artisan-sim.js.
     LAYER 2 is the buff queue on `state` below, read LIVE through `liveBuffHost`
     — a `cookSpeed`-class buff moves the divisor of the whole grant, so the
     queue has to be the live one and not a snapshot. */
  const bonus = bonusFor(inp.perks, liveBuffHost(() => state.buffs));

  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);
  /* THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). `null` when the
     projection has no `frac` — a database without the column — and then no
     `xp_frac` key is proposed (hr_apply would refuse it as unknown). */
  const xpFrac0 = normaliseXpFrac(inp.xpFrac);

  /* THE LIVE BAG — and here it is the supply, not just a lookup table. Every
     quantity is coerced through nat() and floored because it arrives from a
     jsonb round trip where a bigint is a string: `'5' >= 1` is true but
     `'5' - 1` being 4 is the only reason a string survived this far, and
     `missingInput` compares with `<`, which would compare STRINGS. */
  const bag = Object.create(null);
  for (const id in (inp.inventory || {})) {
    const q = Math.floor(nat(inp.inventory[id], 0));
    if (q > 0) bag[id] = q;
  }
  /* SKILLS FROM STORAGE (Tyler 2026-10-25): THE SUPPLY a bench's inputs are counted against is the bag PLUS the
     account's Storage (`inp.storage`, null where the server has no `skill_inputs` section: then it IS the bag), in
     the server's order — hr_apply takes each spent input from the bag first, then Storage (hr_materials_take), so
     the removeItem below spends `bag` first and keeps it the server's bag after the apply. `bag` alone stays
     `state.inventory`: the tool lookup and the bag's room read it. */
  const storage0 = Object.create(null);
  if (inp.storage && typeof inp.storage === 'object') {
    for (const id in inp.storage) {
      const q = Math.floor(nat(inp.storage[id], 0));
      if (q > 0) storage0[id] = q;
    }
  }
  const supply = Object.create(null);
  for (const id in bag) supply[id] = bag[id];
  for (const id in storage0) supply[id] = (supply[id] || 0) + storage0[id];

  const carry0 = normaliseToolCarry(inp.toolCarry);
  const state = {
    /* The pointer. `activeSkill` is DERIVED by simulateArtisanSpan from the
       index — the server holds no skill column — so it is deliberately not set
       here, exactly as on the gather path: setting it would be the engine
       asserting something it does not know, and the WRONG_SKILL branch exists
       to catch a row where the two disagree. */
    skillTargetId: inp.activeId,
    skills: { ...skills0 },        // a COPY: grantXp mutates it, and the diff below is the delta
    xpFrac: xpFrac0 ? { ...xpFrac0 } : undefined, // a COPY too; undefined = no column = per-grant floor
    inventory: bag,
    supply,
    equipment,
    /* THE GATE, FAIL-CLOSED BY SHAPE. `null`/absent → `gateOk` false for any
       recipe carrying `gated` → the span stops at tick 0 with GATE and pays
       only what it worked. Never `|| {}` at a wider scope and never defaulted
       to "unlocked": there is no code path in which an absent row grants a
       recipe. Eight of the 290 recipes are gated. */
    unlockedRecipes: (inp.unlockedRecipes && typeof inp.unlockedRecipes === 'object')
      ? inp.unlockedRecipes : null,
    toolCarry: { ...(carry0 || {}) },
    stats: {},
    /* THE BUFF QUEUE (2026-09-13). This comment used to read "NO BUFFS. The
       server holds no buff queue (there is no column and no intent that writes
       one)" — and the second half of it was the honest reason: draining a queue
       the server could not persist would spend a consumable into nothing. The
       column exists now (player_state.buffs, written only by hr_apply's
       buff_apply block) and hr_state_of projects it, so the drain is durable and
       the queue is real. Measured at the START of the paid window: WALL-CLOCK.
       Absent projection ⇒ [] ⇒ no boundary, one slice, today's behaviour. */
    buffs: buffQueueFromServer(inp.buffs, span.credit.fromMs),
  };

  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];
  /* THE GOAL COUNTER (b353). Same module, same shapes, same clamp as the other
     two paths — one contract, not an artisan-flavoured copy of one. */
  const goals = makeGoalCounter();
  let stoppedInput = null;
  let stoppedReason = null;

  const fx = {
    addXp(skillId, amt) {
      const res = grantXp(state, skillId, amt, {
        bonus,
        xpB: eq.xpB || 0,
        restedQuantum: 0,     // Rested XP is not server state yet. Under-pays.
        authored: false,
      });
      for (const ev of res.events) {
        if (ev.type !== 'levelup') continue;
        levelUps.push({ skill: ev.skill, from: ev.from, to: ev.to });
      }
    },
    addItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      itemDelta[id] = (itemDelta[id] || 0) + n;
      bag[id] = (bag[id] || 0) + n;          // the product lands in the BAG
      supply[id] = (supply[id] || 0) + n;    // and is in the supply a later input check reads
    },
    /* ── THE DEBIT, AND IT IS THE WHOLE MATERIAL CLAMP ────────────────────
       `resolveArtisanTick` calls this once per consumed input, with the
       quantity `resolveArtisanAction` decided (empty when craftSave refunded
       them). Decrementing `bag` is not bookkeeping for the report — `bag` IS
       `state.inventory`, which is what `missingInput` reads on the NEXT tick,
       so this line is the thing that makes the run stop when the ore runs out.

       Delete it and the span produces bars from an infinite ore pile all night;
       the delta would then propose a debit deeper than the stack and hr_apply
       would answer `insufficient_item` — which is NOT on index.ts's DEGRADABLE
       list, so it 409s the WHOLE night rather than shortening it. Two failures
       from one missing line, which is why T4 in tests/artisan-accrual.mjs
       measures the stop rather than trusting it.

       CLAMPED AT ZERO, not allowed to go negative: `resolveArtisanAction`
       already refuses when the bag cannot cover the recipe, so a negative here
       would mean the two disagree, and the honest response to that is to spend
       what exists rather than to propose a debit the database will reject. */
    removeItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      /* Against the SUPPLY (bag + Storage), the bag first: the server's order (hr_materials_take). */
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
    /* `res.progress` is EMPTY on a burn — a "cook N dishes" goal counts
       successful cooks only (src/core/artisan.js BENCH_COUNTERS). The AMOUNT is
       1 per action, which is what resolveArtisanTick passes; passing it through
       rather than assuming is the same defect class as the b352 recipe-scroll
       `add: 1` the parity guard caught. */
    updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },
    /* WHICH ingredient ran out, captured at the stop. The client has shown that
       line since b228 ("Out of Raw Shrimp — cooking stopped") and it is the
       single most useful sentence in a welcome-back summary; the span reports
       it too (`stoppedById`), and this handler exists so the two agree.
       `onBurn` is deliberately absent: a burn is already counted in
       `state.stats.burnt` and the summary, and a per-burn handler on a
       ~14,000-action night is the per-tick journalling this file's header
       forbids. */
    onStop(reason, skill, targetId, missing) { stoppedInput = missing || null; stoppedReason = reason || null; },
  };

  const ctx = {
    away: true,                    // this IS the away path (docs/design/away-time-ruling.md)
    /* THE FIRST `grantMs` AFTER THE PLAYER LEFT (Ruling 2). Same anchor the
       other two paths get — passing a different one here is how two away paths
       come to disagree about when the night happened. */
    fromMs: credit.fromMs,
    toMs: credit.toMs,
    capped,
    rng: createRng(nat(inp.seed, 0)),
    items,
    recipes,
    bonus,
    /* THE DEGRADE LADDER'S CAP (Security C1). Absent/null → Infinity inside the
       span, i.e. unbounded, which is exactly the behaviour before it existed.
       This is the ONE ctx field on this path that does not describe the player,
       and it is set from `inp.actionBudget`, which index.ts computes from the
       engine's own previous answer — never from a request body. */
    maxActions: runCap(inp.actionBudget, left0),
    /* THE BAG'S STACK CAP (envelope.js bagCap, player_state.bank_cap): a product with no room stops the bench
       BAG_FULL (artisan-sim.js bagFullFor) rather than proposing a stack hr_apply refuses bank_full. */
    bagCap: Number.isSafeInteger(inp.bagCap) && inp.bagCap > 0 ? inp.bagCap : null,
    tax,
    /* `minStepMs` is NOT SET, so `resolveStepMs` uses the real MIN_ACTION_MS
       floor. This object is built field by field and nothing is spread into it:
       if it were built from a request body, `minStepMs` would ride in through
       the same door as everything else and defeat the clamp that is supposed to
       be the second line of defence. */
    fx,
  };

  const summary = simulateArtisanSpan(state, ctx);

  /* A pointer the simulation could not resolve is a REFUSAL, not an empty
     night: `delta: NONE` means index.ts returns before hr_apply, the watermark
     does not advance, and the window is DEFERRED. Both arms are unreachable
     through the intent surface — the preamble above already checked the id
     against the same index — which is exactly why they are cheap to keep:
     "unreachable today" is not a reason to confiscate a night if a content
     rename ever makes it reachable. */
  if (summary.stoppedBy === ARTISAN_STOP.UNKNOWN_RECIPE) {
    return { accrued: false, reason: SKIP.NO_RECIPE, summary };
  }
  if (summary.stoppedBy === ARTISAN_STOP.WRONG_SKILL) {
    return { accrued: false, reason: SKIP.WRONG_SKILL, summary };
  }

  // ── Turn the mutated state into a delta hr_apply will accept. ────────────
  // Every value below is an INTEGER. hr_apply casts with `::bigint`, and a
  // fractional string is `bad_delta` — which costs the player the whole night.
  const xpDelta = {};
  for (const k in state.skills) {
    const gained = Math.floor((state.skills[k] || 0) - (skills0[k] || 0));
    if (gained > 0) xpDelta[k] = gained;
  }

  /* ── THE SIGNED ITEM DELTA. Gains are the output (and `burnt_food`); the
     negatives are every input the night consumed. hr_apply's item block is
     signed too — it re-reads `player_inventory` under the row lock and rejects
     `have + delta < 0` as `insufficient_item` — so the bag arithmetic above is
     the engine's promise and that check is the database's verification of it.
     The redundant floor below is the same two-locks rule the combat path
     states: `insufficient_item` is not DEGRADABLE, so it does not shorten the
     span, it 409s it. */
  const items_ = {};
  let itemKinds = 0;
  /* ── C5: THE SKIPPED IDS ARE JOURNALLED, NOT ONLY RETURNED ────────────────
     `events` rides the HTTP response and is gone the moment the tab closes. On
     the artisan path that is not good enough, and it is worse here than on the
     other two: a renamed OUTPUT id means the run DEBITS ITS INPUTS ALL NIGHT
     and credits nothing — a silent, total loss of the materials, repeating
     every accrual, with the only receipt in a response nobody kept. So the ids
     go into `journal.meta` as well, where they are a permanent ledger row a
     support request can be answered from.
     BOUNDED ON PURPOSE: ids only, deduplicated, and capped — an aggregate, not
     a log. A renamed id affects one or two ids per night, and the cap is what
     stops a pathological catalogue turning one ledger row into a blob. */
  const skipped = [];
  const SKIPPED_MAX = 8;
  /* What the run could spend of `id`: the bag plus the Storage it draws on (SKILLS FROM STORAGE). */
  const startQty = (id) => Math.floor(nat((inp.inventory || {})[id], 0)) + (storage0[id] || 0);
  for (const id in itemDelta) {
    /* Unknown ids are refused by hr_apply against the generated hr_items
       catalogue, which would reject the WHOLE delta — one renamed output id
       would cost a player their entire night. Filter here against the same
       authored data the catalogue is generated from, and report it. */
    if (!catalogueHas(items, id)) {
      events.push({ type: 'unknown_item_skipped', item: id });
      if (skipped.length < SKIPPED_MAX && skipped.indexOf(id) === -1) skipped.push(id);
      continue;
    }
    const n = Math.floor(itemDelta[id]);
    // A net zero is not a no-op to hr_apply — it is a catalogue lookup, a row
    // lock and a ledger byte for nothing. Drop it. (Reachable here and nowhere
    // else: craftSave refunds an input the same tick it was counted, so a
    // recipe whose input is also its output nets out.)
    if (n === 0) continue;
    if (n < 0 && startQty(id) + n < 0) {
      events.push({ type: 'overspend_clamped', item: id });
      const floored = -startQty(id);
      if (floored === 0) continue;
      items_[id] = floored;
    } else {
      items_[id] = n;
    }
    itemKinds++;
  }

  /* ⚠ A STOPPED BENCH MUST STILL CLEAR THE POINTER, and that is why this test
     comes BEFORE the nothing-happened return rather than after it. A run that
     stops on its FIRST tick — the recipe is gated, or the ore is already gone —
     produces nothing at all, and returning `nothing_accrued` there would leave
     `active_id` pointing at a bench that can never pay, forever, with every
     future accrual answering "nothing" and the player's pointer stuck on an
     activity they cannot do. Reachable through ordinary play: a night that
     exhausts its inputs and is then collected a second time. */
  /* THE COUNT REACHED is a stop like the other two: the run is over and the pointer clears. */
  const left1 = left0 === null ? null : Math.max(0, left0 - Math.floor(nat(summary.ticks, 0)));
  const counted = left1 === 0;
  const stopped = summary.stoppedBy === ARTISAN_STOP.SUPPLIES
                || summary.stoppedBy === ARTISAN_STOP.GATE
                /* A full bag stops the bench like an empty input: it cannot pay until the player makes room. */
                || summary.stoppedBy === ARTISAN_STOP.BAG_FULL
                /* Nor can it pay until the purse is fed: the end card says so (`stopped: 'gold'`, the run's tally). */
                || summary.stoppedBy === ARTISAN_STOP.GOLD
                || counted;
  const nothingHappened = itemKinds === 0 && Object.keys(xpDelta).length === 0 && summary.ticks === 0;
  if (nothingHappened && !stopped) return { accrued: false, reason: SKIP.NOTHING, summary };

  const stats = state.stats || {};
  const progress = [];
  const stat = (key, n) => { if (n > 0) progress.push({ kind: 'stat', key, period: '', add: Math.floor(n), state: 'active' }); };
  /* THE PER-BENCH LIFETIME COUNTERS, read out of core's BENCH_COUNTERS — the
     same table `resolveArtisanAction` increments live — plus the two every
     bench can produce. One table, so an away night and a live hour move the
     same rows, and a fifth bench is a data row rather than a line here. */
  const bench = BENCH_COUNTERS[summary.skill];
  for (const key in (bench ? bench.stats : {})) stat(key, stats[key]);
  stat('burnt', stats.burnt);
  /* ⚠ `tool_doubles`, THE SAME KEY THE GATHER BUILDER WRITES — not `toolDoubles`,
     which is what `state.stats` is keyed by in core. The lifetime counter is ONE
     row on ONE character and a gathering tool double and a smithing tool double
     are the same fact; two spellings would be two half-counters that never add
     up and that no screen could total. Asserted against the gather site by
     tests/artisan-accrual.mjs. */
  stat('tool_doubles', stats.toolDoubles);
  /* THE GOAL COUNTERS — the day the player RETURNS, same rule as the other two
     paths. `events` is passed so a clamp or an unknown type leaves a receipt
     instead of vanishing. */
  for (const op of goalProgressOps(goals, nowMs, events)) progress.push(op);

  /* THE SUB-STEP REMAINDER, DEFERRED RATHER THAN FORFEITED — the same call the
     gather path makes, over the same `sliceSpan` primitive (artisan-sim.js:355).
     A bench that ran out of inputs or hit its gate leaves `remainder >= stepMs`
     and refusal (c) stamps `now()`, so the `activity: idle` statement below is
     never re-opened. A run that stops on the action that spent its last input (report
     #68) may leave less than a step: any stopped run is stamped `now()` outright. */
  const settledTo = stopped ? nowMs : settledWatermarkMs(span, summary, summary.intervalMs,
    { caller: accrualCaller(inp) });

  const delta = {
    accrued_to: new Date(settledTo).toISOString(),
    journal: {
      /* ⚠ `craft`, NOT `artisan`, AND THAT IS NOT A SYNONYM — it is the only
         value `player_ledger_kind_check` accepts for this work. The constraint
         allows thirteen kinds and `artisan` is not among them; a journal that
         named it would raise check_violation inside the protected block,
         hr_apply would answer `bad_delta`, and the player would lose the entire
         night with nothing in the ledger to explain it. The vocabulary of the
         LEDGER and the vocabulary of `hr_activities` are two different lists
         that happen to overlap, and this is the one place they do not. */
      kind: 'craft',
      intent: 'accrue',
      // AGGREGATE, never per-action and never per-burn. A 12h smithing night is
      // ~14,000 actions; the receipt for what per-action journalling costs is
      // game_events — 1.6M rows / 229 MB from six players in four days.
      meta: {
        ms: grantMs, ticks: summary.ticks, capped,
        made: summary.produced, burnt: summary.burnt,
        recipe: summary.recipeId, skill: summary.skill,
        /* WHY it stopped and on WHAT, because "the night made 200 bars and the
           bag had ore for 4,000" is only answerable from the stop. */
        stopped: counted ? 'count' : (summary.stoppedBy || null),
        /* The input that ran out; for a full bag, the product that had no room (`room_for`). */
        out_of: stoppedReason === ARTISAN_STOP.BAG_FULL ? null : stoppedInput,
        ...(stoppedReason === ARTISAN_STOP.BAG_FULL ? { room_for: stoppedInput } : {}),
        /* "MAKE N": the count this window started from and what it left (absent on an uncounted run). */
        ...(left0 !== null ? { n: left0, left: left1 } : {}),
        /* C5. A COMMA-JOINED STRING, not an array: T7 asserts every meta value
           is a scalar, because a nested structure in the ledger is how
           game_events became 229 MB, and the rule is worth more than the two
           characters of punctuation. Omitted entirely when nothing was skipped
           — a key that is always present and almost always empty is a column
           nobody reads. */
        ...(skipped.length ? { skipped_items: skipped.join(',') } : {}),
        /* `w` — the non-paying accounted time, the same comma-joined scalar for
           the same reason `skipped_items` is one. See windowWaste. */
        ...(windowWaste(summary) ? { w: windowWaste(summary) } : {}),
        // The credited window, for the reason the other two journals carry it.
        from: new Date(credit.fromMs).toISOString(),
        to: new Date(credit.toMs).toISOString(),
      },
    },
  };
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
  /* THE CARRIED REMAINDER, ABSOLUTE PER SKILL, only the skills that moved and
     only when the server owns the column (`xpFrac0` non-null). */
  if (xpFrac0) {
    const fr = xpFracChanges(xpFrac0, state.xpFrac);
    if (Object.keys(fr).length) delta.xp_frac = fr;
  }
  if (progress.length) delta.progress = progress;
  /* THE TAX: the count hr_apply prices (never a rate), and the gold it must come to. */
  if (tax) {
    delta.bench_tax = { crafts: Math.floor(nat(summary.ticks, 0)) };
    if (tax.paid > 0) delta.gold = -tax.paid;
  }
  /* THE CARRY, written back only when the server actually owns it — see the
     `toolCarry` note in computeAccrual's contract. Artisan tools share the one
     `{ skill: 0..1 }` map with gathering tools, keyed by bench, so a smithing
     carry and a mining carry cannot collide. */
  if (carry0) delta.tool_carry = roundCarry(state.toolCarry);
  /* THE RUN IS OVER, so the pointer must say so — the same statement `died`
     makes for combat and the level gate makes for gathering. Sent only when it
     happened, because an `activity` key is a complete, re-validated activity
     statement and restating an unchanged pointer buys nothing but a catalogue
     lookup. */
  if (stopped) delta.activity = { kind: 'idle', id: null };
  /* "MAKE N": a run still short of its count proposes the lowered count (hr_apply accepts it
     only below the stored one, on an accrual): a replayed or re-cut window cannot pay past N.
     A run that ENDS states what it left beside its `activity: idle` (1026-job-counts.sql: 0 = counted out, which is what
     lets hr_apply run the job's THEN; more = the inputs, the bag or the purse ended it first). */
  if (left1 !== null && ((stopped && inp.jobEnds === true) || (!stopped && left1 < left0))) delta.active_left = left1;

  return {
    accrued: true,
    delta,
    grantMs,
    capped,
    tickMs: summary.intervalMs,     // the ACTION interval; same field name, same meaning
    foodEaten: 0,
    watermark: delta.accrued_to,
    deferredMs: Math.max(0, nowMs - settledTo),   // the sub-step tail left open; see the combat path
    events,
    levelUps,
    summary: {
      ...summary,
      ...windowEnvelope(credit, summary.stoppedBy ? summary.paidMs : null),
      gold: tax ? -tax.paid : 0,
      xp: xpDelta,
      items: items_,
      levelUps,
    },
  };
}
