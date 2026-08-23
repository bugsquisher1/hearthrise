// ============================================================
// src/core/skill-sim.js — ONE GATHERING LOOP, and the SPAN it runs in.
//
// The companion to src/core/combat-sim.js, and it exists for the same
// reason: so there is not a second one.
//
// ── WHAT THIS REPLACES, AND WHY IT IS URGENT ─────────────────────────
// `supabase/functions/hr-accrue/accrual.js` could pay a COMBAT night and
// nothing else. Measured against the generated catalogue on 2026-08-15:
// `hr_activities` holds 344 rows — 31 combat, 23 gather, 290 artisan — so
// 313 of 344 activities (91%) accrued nothing server-side. A player who
// logged off chopping Oak was owed a night and paid zero. Under the ruling
// in src/core/away.js's header — "the offline portion should function
// exactly the same as if the player was still online" (Tyler, 2026-08-14) —
// that is a defect, not a tradeoff.
//
// This file closes the GATHER half of it (23 activities). Artisan is not
// here and is not close: it needs `unlockedRecipes` (8 gated recipes with no
// server progress rows) and `noBurn` (the Kitchen rung, i.e. a property model
// nobody has built) — and `zeroBonus()` returns 0 server-side, so a server
// that cooked today would burn at the base 25% while the player's Kitchen
// says 0%. See the note at the foot of this file.
//
// ── IT IS THE SAME LOOP THE CLIENT RUNS ──────────────────────────────
// `sliceSpan` below is `replayAwaySpan` from legacy.js, lifted verbatim in
// behaviour and made pure. Its shape is the interesting part and it is NOT
// `simulateSpan`'s:
//
//   Combat can ask "is a buff alive?" once per swing because its tick length
//   is fixed — no combat buff changes swing speed. Here `gather_speed`
//   changes THE INTERVAL, which is the number the tick count is derived
//   from, so a per-tick loop would have to re-derive it thousands of times
//   and would still be wrong at the instant of expiry. So this uses the OTHER
//   shape core already established: split the span at its boundaries and run
//   each slice at its own rate — exactly `utcDaySegments`, with
//   `nextBuffExpiryMs` as the boundary function instead of UTC midnight.
//   One mechanism, two boundary sources.
//
// THE ORDER IS LOAD-BEARING, the same rule `simulateSpan` states: derive the
// rate and run the slice's actions FIRST, drain the clock AFTER. A buff that
// is alive when the action happens pays for that action, exactly as it would
// live.
//
// THE CARRY IS NOT OPTIONAL. `floor()` per slice would silently cost the
// player one action per boundary, so the sub-tick remainder rides across —
// the same line `simulateSpan` carries across midnight, for the same reason.
// With no buff held there is exactly ONE slice and the arithmetic is
// byte-identical to a flat `floor(spanMs / interval)` loop.
//
// ── WHAT IS INJECTED ─────────────────────────────────────────────────
// Everything impure, which is what keeps this file runnable in Deno:
//   • `ctx.rng`      — src/core/rng.js contract. Most gathering nodes are
//                      `qty:[1,1]` and `rng.int(n,n)` returns without
//                      drawing, so a seeded span is stable even when the
//                      draw order changes elsewhere.
//   • `ctx.bonus`    — the perk stack (a seven-deep wrapper chain on the
//                      client; a server-side sum in Deno). The blessing and
//                      buff channels gate themselves via src/core/away.js.
//   • `ctx.items`    — the authored ITEMS catalogue, for the tool lookup.
//   • `ctx.nodes`    — the gather index (see `indexGatherNodes`).
//   • `ctx.fx`       — the effect sink. Missing handlers are no-ops, so a
//                      bare call simulates without side effects.
//
// `state` is MUTATED in place — the same convention `grantXp` and
// `simulateTick` established, because the alternative is copying a 40-field
// save thousands of times per replay.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { resolveGatherAction } from './progression.js?v=460';
import { bestTool, toolSpeed, toolXpB, toolDouble } from './tools.js?v=460';
import { actionIntervalMs, MIN_ACTION_MS, GATHER_SKILLS } from './pacing.js?v=460';
import { CHANNEL, channelApplies, rateMult } from './away.js?v=460';
import { nextBuffExpiryMs, hasActiveBuff, tickBuffs, pruneBuffs } from './buffs.js?v=460';
import { levelOf } from './xp.js?v=460';

function fxOf(ctx) { return (ctx && ctx.fx) || {}; }
function call(fx, name, ...args) {
  const f = fx[name];
  return typeof f === 'function' ? f(...args) : undefined;
}
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/* Outcomes, named so a caller never compares against a bare string. */
export const OUTCOME = { GATHER: 'gather', STOP: 'stop' };

/* Why a span stopped before the absence did. STATED by the simulation, never
   inferred by a renderer — the same rule the away ruling puts on `died` and
   `blessed`. `null` means "it ran the whole window", which is the ordinary
   night and is NOT the same thing as `paidMs < awayMs` (flooring a tick count
   already makes that true on a perfectly honest night). */
export const STOP_REASON = Object.freeze({
  IDLE: 'idle',                       // no activity pointer at all
  UNKNOWN_NODE: 'unknown_node',       // the id is not in the gather index
  WRONG_SKILL: 'wrong_skill',         // pointer and index disagree about the skill
  LEVEL: 'level',                     // the level gate refused (client: stopSkill())
});

/* b226 (spec §8.2) — the per-SKILL gathering counters, as DATA.
   `stats.chopped` / `stats.mined` / `stats.fished` are what the daily and
   weekly goals READ, and quest-nav.js inverts this same map to answer "which
   skill screen does this goal live on". It lived as a `const` inside
   legacy.js; it lives HERE now because the away path and the live path must
   increment the same counters and this file is the only thing both of them
   run. legacy.js keeps `window.SKILL_ACTION_STAT` as a re-export of this
   object — one identity, not two maps a guard reconciles. */
export const SKILL_ACTION_STAT = Object.freeze({
  woodcutting: 'chopped', mining: 'mined', fishing: 'fished',
});

/* THE SLICE BUDGET. `applyBuff` merges by type, so a real queue holds at most
   one entry per BUFFS_DEF row (9) and this ceiling is never approached. Past
   it the boundary is Infinity, the rest of the span runs as ONE slice at the
   current rate, and the loop ends — the budget stops the SPLITTING, not the
   replay. That distinction is the whole point: the tempting `while (guard++ <
   N)` exits with `remaining` unspent, i.e. the player silently loses the rest
   of their absence, which is the single worst failure this file can produce
   and the one every away bug in its history has been. */
export const MAX_SLICES = 64;

/**
 * Build the gather index: `{ [nodeId]: { skill, node } }`.
 *
 * `sources` is `{ skillId: [node] }` — the caller names the three arrays
 * (`{woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS}`), because that
 * mapping is authored in src/data and core does not import content. Everything
 * DOWNSTREAM of the mapping — which node an id resolves to, which skill pays,
 * which level gates it — comes out of this one index, so the client's
 * `currentActionDef()` and the accrual engine cannot disagree about it.
 *
 * ⚠ NULL-PROTOTYPE ON PURPOSE. `active_id` is bounded by /^[a-z0-9_]{1,64}$/
 *   at the request layer, which matches `constructor` and `__proto__` — both
 *   truthy on any plain object. A lookup followed by a property read on one of
 *   those is the shape `catalogueHas` exists to stop in the monster catalogue.
 *   Here the container simply has no prototype, so the hazard is removed
 *   rather than guarded against.
 *
 * First id wins on a duplicate; `duplicateGatherIds` reports them so a test
 * can assert there are none rather than trusting that data never collides.
 */
export function indexGatherNodes(sources) {
  const out = Object.create(null);
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    const list = src[skill];
    if (!Array.isArray(list)) continue;
    for (const node of list) {
      if (!node || typeof node.id !== 'string' || !node.id) continue;
      if (hasOwn(out, node.id)) continue;
      out[node.id] = { skill, node };
    }
  }
  return out;
}

/** Ids claimed by more than one source. Empty in shipped data; a guard asserts it. */
export function duplicateGatherIds(sources) {
  const seen = Object.create(null);
  const dupes = [];
  const src = sources || {};
  for (const skill of Object.keys(src)) {
    for (const node of (Array.isArray(src[skill]) ? src[skill] : [])) {
      if (!node || typeof node.id !== 'string' || !node.id) continue;
      if (hasOwn(seen, node.id)) dupes.push({ id: node.id, skills: [seen[node.id], skill] });
      else seen[node.id] = skill;
    }
  }
  return dupes;
}

/** The best tool the character owns for this skill, from server-owned state. */
export function toolFor(state, skill, items) {
  return bestTool(skill, (state && state.inventory) || {}, (state && state.equipment) || {}, items || {});
}

/**
 * The interval one gathering action takes, DERIVED — never accepted.
 *
 * `n = floor(sliceMs / stepMs)` makes this a DIVISOR of elapsed time and
 * therefore the largest single lever in the whole grant, exactly as `tickMs`
 * is for combat (design §3, "interval_ms is the accrual engine's largest
 * lever"). An 8h absence on Normal Tree at the honest 4,800 ms budgets 6,000
 * actions; at 1 ms it budgets 28,800,000.
 *
 * So the server DERIVES it: `actionIntervalMs` applies PACE.actionMs, the perk
 * stack through `ctx.bonus`, the tool ladder through the tool the character
 * actually owns, and `speedClamp`'s 0.70 fuse — the same one expression
 * legacy.js's `activityIntervalMs()` evaluates. There is no request field that
 * reaches it.
 */
export function gatherIntervalMs(state, skill, node, ctx) {
  const c = ctx || {};
  const tool = toolFor(state, skill, c.items);
  return actionIntervalMs(skill, (node && node.ms) || 3000, {
    bonus: c.bonus,
    toolSpeed: () => toolSpeed(tool),
  });
}

/**
 * The step a slice runs at, clamped. SAFE BY CONSTRUCTION, not by caller
 * discipline — the same design as `resolveTickMs` in combat-sim.js, for the
 * same reason: `sliceSpan` is a generic primitive and its `stepMs` callback is
 * the one number a compromised caller would want to shrink. `actionIntervalMs`
 * already floors at MIN_ACTION_MS, so this changes nothing for an honest
 * caller and is a second, independent lock for a dishonest one.
 *
 * `minStepMs` is a DELIBERATE opt-in for a caller that genuinely wants finer
 * granularity (a unit test measuring one action). Anything non-numeric, zero
 * or negative falls back to the real floor.
 */
export function resolveStepMs(asked, minStepMs) {
  const n = Number(asked);
  const want = (isFinite(n) && n > 0) ? n : 0;
  const optIn = Number(minStepMs);
  const floor = (isFinite(optIn) && optIn > 0) ? optIn : MIN_ACTION_MS;
  return Math.max(floor, want);
}

/**
 * ONE gathering action. This is what `doSkillAction()` in legacy.js became.
 *
 * PRESENTATION IS NOT HERE. No toast, no repaint, no timer — those arrive
 * through `fx`, which the client makes silent while away (a 12-hour replay
 * would otherwise repaint the topbar six thousand times).
 *
 * @param state MUTATED: skills (via fx.addXp), stats, toolCarry, inventory
 * @param node  the TREES/ROCKS/FISH_SPOTS row
 * @param ctx   { skillId, rng, toolDouble, toolXpB, fx }
 */
export function resolveGatherTick(state, node, ctx) {
  const c = ctx || {};
  const fx = fxOf(c);
  const skill = c.skillId;
  /* `toolCarry` (was `G._toolCarry`) — the FRACTIONAL remainder of a tool's
     double-yield chance, carried between actions so a 0.35 tool pays 35 extra
     items per 100 swings exactly rather than approximately. Deliberately NOT
     an RNG roll: it is what makes an away replay byte-identical run to run. */
  if (!state.toolCarry || typeof state.toolCarry !== 'object') state.toolCarry = {};

  const res = resolveGatherAction(node, {
    skillId: skill,
    level: levelOf(state.skills, skill),
    toolCarry: state.toolCarry,
    toolDouble: c.toolDouble || 0,
    toolXpB: c.toolXpB || 0,
    rng: c.rng,
  });
  if (!res.ok) return { outcome: OUTCOME.STOP, reason: res.reason, qty: 0 };

  state.stats = state.stats || {};
  if (res.toolDoubles > 0) state.stats.toolDoubles = (state.stats.toolDoubles || 0) + res.toolDoubles;
  /* Through fx, because on the client `addItem` is bank-capped and tracks the
     collection log, and on the server it accumulates a signed delta hr_apply
     re-validates. Its RETURN IS IGNORED, matching legacy.js: a bank-full
     refusal still counts the action, still grants the XP and still moves the
     counters. That is the live behaviour, so it is the away behaviour. */
  call(fx, 'addItem', res.product, res.qty);
  state.stats.gathered = (state.stats.gathered || 0) + res.qty;
  const perSkill = SKILL_ACTION_STAT[skill];
  if (perSkill) state.stats[perSkill] = (state.stats[perSkill] || 0) + res.qty;
  call(fx, 'updateDaily', 'gather', res.qty);
  call(fx, 'updateQuest', 'gather', res.qty);
  /* `res.xpAmount` is `node.xp × (1 + toolXpB)` — computed ONCE, by the
     resolver, rather than recomputed at the call site as legacy.js did. Two
     expressions of one number is how a tool's XP bonus comes to apply live and
     not away. */
  call(fx, 'addXp', skill, res.xpAmount);

  return {
    outcome: OUTCOME.GATHER,
    qty: res.qty, product: res.product,
    toolDoubles: res.toolDoubles, xpAmount: res.xpAmount,
  };
}

/**
 * Run a span of elapsed time as SLICES, splitting at boundaries where the rate
 * changes. `replayAwaySpan` from legacy.js, made pure and injectable.
 *
 * TERMINATION. Each pass either consumes the rest of the span or retires at
 * least one boundary (the slice ends exactly ON the soonest one, so `drain`
 * takes it to zero), so the pass count is bounded by the queue length + 1. The
 * slice budget above covers the shapes that argument does not.
 *
 * @param spanMs the absence to replay, in ms
 * @param opts
 *   stepMs()            the interval, RE-DERIVED per slice
 *   run(n, stepMs)      runs up to n actions, returns how many ACTUALLY ran;
 *                       fewer than n means the run stopped inside the slice
 *   nextBoundaryMs()    ms until the next rate change (Infinity = none)
 *   boosted()           was a boundary-bearing effect live for this slice?
 *   drain(ms)           spend `ms` against those effects; may return {expired}
 *   rateMult            the away rate dial (src/core/away.js). 1 by default.
 *   minStepMs           opt-in finer floor; see resolveStepMs
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
    /* No boundary source, or the budget is spent → ONE slice, which is exactly
       the old flat loop. A missing bridge must degrade to "the night still
       pays", never to a thrown replay that costs the player everything. A
       zero/NaN/negative boundary is treated as none for the same reason —
       and because a 0 boundary would otherwise make no progress. */
    const raw = (nextBoundary && out.slices < MAX_SLICES) ? Number(nextBoundary()) : Infinity;
    const boundary = (isFinite(raw) && raw > 0) ? raw : Infinity;
    out.slices++;
    const sliceMs = Math.min(remaining, boundary);
    const wasBoosted = boosted ? !!boosted() : false;
    const budget = sliceMs * rate + carryMs;
    const n = Math.floor(budget / stepMs);
    const ran = n > 0 ? (Number(o.run(n, stepMs)) || 0) : 0;
    out.ticks += ran;

    /* The run stopped INSIDE this slice (supplies, or the activity cleared).
       Only the time that actually worked is paid — and only that time is
       charged to the buff, because a buff is spent on work. */
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
    ticks: 0, gathered: 0, toolDoubles: 0,
    paidMs: 0, stopped: false, stoppedBy: null, stoppedById: null, stoppedSkill: null,
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
  };
}

/**
 * Simulate a SPAN of gathering — the accrual path, and the client's away path.
 *
 * @param state MUTATED. { skillTargetId, activeSkill?, skills, inventory,
 *                         equipment, toolCarry, stats, buffs? }
 * @param ctx
 *   fromMs, toMs   the span. SERVER-authoritative timestamps: the accrual
 *                  engine passes `accrued_to` and `now()`, and the client
 *                  clock is never consulted for authority.
 *   nodes          the gather index (`indexGatherNodes`)
 *   items          the ITEMS catalogue, for the tool lookup
 *   rng, bonus, fx, away, capped
 * @returns the welcome-back summary. Every field a renderer needs in order to
 *          describe the absence WITHOUT inferring anything.
 */
export function simulateSkillSpan(state, ctx) {
  const c = ctx || {};
  const spanMs = Math.max(0, (Number(c.toMs) || 0) - (Number(c.fromMs) || 0));
  const base = emptySummary(spanMs, c);

  const targetId = state && state.skillTargetId;
  if (!targetId) return { ...base, stoppedBy: STOP_REASON.IDLE };

  /* THE SKILL IS DERIVED FROM THE INDEX, NOT READ OFF THE POINTER. The server
     holds ONE id (`player_state.active_id`) and no skill column, so the index
     is the only thing that can say which skill an id belongs to. The client
     also holds `G.activeSkill`; if the two disagree the state is inconsistent
     and paying would credit the wrong skill's XP, so refuse instead. */
  const entry = hasOwn(c.nodes, targetId) ? c.nodes[targetId] : null;
  if (!entry || !entry.node) {
    return { ...base, stoppedBy: STOP_REASON.UNKNOWN_NODE, stoppedById: targetId };
  }
  const skill = entry.skill;
  const node = entry.node;
  if (state.activeSkill && state.activeSkill !== skill) {
    return { ...base, stoppedBy: STOP_REASON.WRONG_SKILL, stoppedById: targetId, stoppedSkill: state.activeSkill };
  }

  const fx = fxOf(c);
  /* `active: true` because a running activity IS work — that is the one freeze
     condition `tickBuffs` still honours, and away gathering does not meet it.
     Deliberately NOT re-read after a stop: legacy.js drains through
     `advanceBuffClock`, whose `active` flag goes false the moment
     `stopSkill()` clears the pointer, so the minutes the run DID work were
     never charged to the buff. b347 fixed exactly that for the artisan branch
     by moving the refusal after the span; this states the rule once instead. */
  const buffCtx = { away: !!c.away, active: true };
  /* Read the queue FRESH each slice rather than capturing it: a captured
     reference cannot see a buff APPEARING in a queue that was empty when the
     span began, and that buff would then pay for the rest of the absence and
     come back reading full. Same reasoning as simulateSpan's `liveQueue`. */
  const liveQueue = () => {
    const q = state.buffs;
    return (Array.isArray(q) && q.length > 0) ? q : null;
  };

  let lastStep = 0;
  let stopReason = null;

  const span = sliceSpan(spanMs, {
    rateMult: rateMult(c),
    minStepMs: c.minStepMs,
    /* RE-DERIVED PER SLICE. The single `stepMs` a flat loop reads once is
       precisely why a `gather_speed` buff that runs out mid-night keeps paying
       until dawn: the interval is the number the tick count comes from. */
    stepMs: () => { lastStep = gatherIntervalMs(state, skill, node, c); return lastStep; },
    nextBoundaryMs: () => nextBuffExpiryMs(state.buffs),
    boosted: () => { const q = liveQueue(); return q ? hasActiveBuff(q) : false; },
    drain: (ms) => { const q = liveQueue(); return q ? tickBuffs(q, ms, buffCtx) : null; },
    run: (n) => {
      /* The tool is resolved ONCE PER SLICE rather than once per action. It
         cannot change inside a slice — no gathering node yields a tool — and
         the client's per-action derivation is asserted to agree with it in
         tests/accrual-engine.mjs' gather parity fixture, which derives it the
         client's way. */
      const tool = toolFor(state, skill, c.items);
      const tickCtx = {
        skillId: skill, rng: c.rng, fx,
        toolDouble: toolDouble(tool), toolXpB: toolXpB(tool),
      };
      let done = 0;
      for (let i = 0; i < n; i++) {
        const r = resolveGatherTick(state, node, tickCtx);
        if (r.outcome === OUTCOME.STOP) {
          /* The level gate. Core STATES the fact; the caller decides what it
             means — `stopSkill()` on the client, an `activity: idle` delta on
             the server. Core does not null the pointer, exactly as
             `resolveDeath` does not null `activeMonster`. */
          stopReason = r.reason === 'level' ? STOP_REASON.LEVEL : r.reason;
          call(fx, 'onStop', stopReason, skill, targetId);
          return done;                       // fewer than n → the span stops here
        }
        done++;
      }
      return done;
    },
  });

  /* Drop what ran out. Not correctness — an expired entry already pays nothing
     — but the player not coming back to a row reading "0s" that no live tick
     will ever clear. Reassigns rather than splices, matching simulateSpan. */
  if (span.buffsExpired.length && Array.isArray(state.buffs)) state.buffs = pruneBuffs(state.buffs);

  const stats = state.stats || {};
  return {
    ...base,
    ticks: span.ticks,
    gathered: stats.gathered || 0,
    toolDoubles: stats.toolDoubles || 0,
    paidMs: span.paidMs,
    stopped: span.stopped,
    stoppedBy: stopReason,
    stoppedById: stopReason ? targetId : null,
    stoppedSkill: stopReason ? skill : null,
    intervalMs: lastStep,
    slices: span.slices,
    buffPaidMs: span.buffPaidMs,
    buffsExpired: span.buffsExpired,
    skill,
    nodeId: targetId,
  };
}

/** Is this a skill this file can simulate? One list, read by the engine. */
export function isGatherSkill(skillId) { return GATHER_SKILLS.indexOf(skillId) >= 0; }

/* ══════════════════════════════════════════════════════════════════════════
   THE CLIENT SWITCH-OVER IS DONE (b351). What this block used to specify —
   four edits in legacy.js, written out because another agent held that file —
   has been made:

     1. `replayAwaySpan` is gone; both away branches call this file directly.
     2. the GATHER away branch is one `simulateSkillSpan` call, INSIDE
        `withOfflineReplay`. The latch is not optional — a gather-speed
        BLESSING is presence-gated, and sizing a span from outside it measured
        375 core actions against 400 live ones.
     3. `SKILL_ACTION_STAT` is no longer a literal in legacy.js. It is
        published from HERE by src/core-bridge.js, and AWAY-16 PARITY asserts
        the REFERENCE, not the values — a value comparison passes on two
        copies and keeps passing until somebody edits one of them.
        ⚠ It could NOT be a re-export written in legacy.js: that file is a
          CLASSIC script and core-bridge.js is a MODULE, so core-bridge runs
          after legacy.js has finished executing and the ternary would take
          its fallback branch every time — silently restoring the second copy
          it was written to remove, with nothing going red.
     4. the index is built once and memoised on the source arrays’
        IDENTITIES, in core-bridge.js (`gatherNodes` / `gatherNode`).

   `doSkillAction` ALSO delegates now, to `resolveGatherTick`, so the live
   tick and the away tick are ONE function rather than two that a parity test
   reconciles. What is left in legacy.js is exactly the set of lines the
   server does not have: the progress bar, the retime, two repaints.

   ⚠ ONE THING MUST NOT BE "CLEANED UP": tests/accrual-engine.mjs holds a
     HAND TRANSCRIPTION of legacy.js’s gather path and asserts the server pays
     what the client pays. Now that the client delegates here, that
     transcription is the only reference in the suite that is NOT this code.
     Deleting it as duplication would leave every parity test proving that a
     function equals itself.
   ══════════════════════════════════════════════════════════════════════════
   */

/* ══════════════════════════════════════════════════════════════════════════
   ARTISAN IS IN src/core/artisan-sim.js (b351), AND IT RUNS ON `sliceSpan`.

   It is a sibling, not a copy: `simulateArtisanSpan` injects its own
   `stepMs`/`run`/boundary source into the loop above, so one buff-expiry
   timeline serves gathering, artisan and (via `utcDaySegments`) combat.

   WHAT STILL BLOCKS THE SERVER FROM PAYING AN ARTISAN NIGHT is a missing
   MODEL, not missing code, and it is stated in full at the foot of that file.
   In short: `unlockedRecipes` (8 gated recipes, no `player_progress` row, no
   intent that writes one) and `noBurn` (the Kitchen rung; `zeroBonus()`
   returns 0, so a server that cooked tonight would burn at the base 25% while
   the player's Kitchen says 0% — the server DESTROYING items the client would
   have kept).

   290 of the 344 catalogue rows are artisan. Do NOT add `'artisan'` to
   PAYABLE_KINDS before those two exist: it widens SETTABLE_KINDS with it and
   lets a player set an activity the engine prices WRONG, which is worse than
   today's deferral — the refusal returns `delta: NONE` and the watermark does
   not move, so the time is DEFERRED rather than confiscated.
   ══════════════════════════════════════════════════════════════════════════ */
