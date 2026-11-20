// ============================================================================
// supabase/functions/hr-accrue/accrue-gather.js — A GATHERING POINTER'S WINDOW.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// computeAccrual reaches it through KIND_ACCRUERS.gather.
// ============================================================================

import { equipmentStats } from '../../../src/core/combat.js';
import { simulateSkillSpan, STOP_REASON, SKILL_ACTION_STAT } from '../../../src/core/skill-sim.js';
import { createRng } from '../../../src/core/rng.js';
import { bonusFor, liveBuffHost } from '../../../src/core/member.js';
import { grantXp, normaliseXpFrac, xpFracChanges } from '../../../src/core/progression.js';
/* LAYER 2 — THE TIMED CONSUMABLE QUEUE (2026-09-13). `buffQueueFromServer` is
   where the SERVER's absolute-`until` rows (player_state.buffs, projected as the
   envelope's `buffs` block) become the `remainingMs` shape the simulators drain;
   `buffBonusFor` is the same term the client's getBonus chain adds, and
   `activeBuffs` is what makes `ctx.activeBuffCount` an honest number instead of
   the hard-coded 0 it was while the server held no queue. WALL-CLOCK drain — the
   rule is BUFF_DRAIN_RULE in that module, named once. */
import { buffQueueFromServer } from '../../../src/core/buffs.js';
import { makeGoalCounter, goalProgressOps } from '../../../src/core/goals.js';
import { catalogueHas } from './intents.js';
import { nat, SKIP, accrualCaller } from './accrual-contract.js';
import { windowWaste, windowEnvelope, settledWatermarkMs, normaliseToolCarry, roundCarry } from './accrual-window.js';

/**
 * THE GATHER ACCRUAL. Same envelope, same rules, a different simulation.
 *
 * Nothing below re-implements a rule: the span loop, the interval, the yield
 * roll, the deterministic tool carry and the XP grant all come out of
 * src/core/skill-sim.js — the SAME function the client's away gather replay
 * runs. The only thing that is server-specific is the APPLY: the client mutates
 * G, this accumulates a delta hr_apply re-validates.
 *
 * @param inp  computeAccrual's input, verbatim
 * @param span { nowMs, grantMs, capped, credit } — computed by the shared
 *             preamble. `credit` is the WINDOW (Ruling 2): which hours of the
 *             absence are being paid, not merely how many.
 */
export function accrueGather(inp, span) {
  const { nowMs, grantMs, capped, credit } = span;

  const items = inp.items || {};
  const nodes = inp.nodes || {};
  const equipment = inp.equipment || {};
  /* Equipment reaches a gathering night through exactly one channel — `xpB`,
     the same term the client's xpGrantCtx() supplies. Gathering has no
     accuracy, no max hit and no swing speed, so `equipmentStats` is read for
     that one field and nothing else. (Tool SPEED is not equipment: it is the
     best tool the character OWNS, resolved from the bag by src/core/tools.js.) */
  const eq = equipmentStats(equipment, items);

  /* THE PERK STACK for this accrual, built ONCE per call from the state
     `hr_perks_of` returned. Memoised inside makeBonus, because
     `resolveArtisanAction`/`grantXp` ask for the same handful of keys on every
     one of ~18,000 ticks in a 12h night. `inp.perks` absent → EMPTY_PERKS → 0
     for every key, which is exactly the `zeroBonus` behaviour this replaces.
     LAYER 2 is the buff queue on `state` below, read LIVE through `liveBuffHost`.
     The getter is what makes the order safe: this line runs BEFORE `state`
     exists, and nothing asks for a key until the span does. It matters more here
     than on the combat path, because a `gather_speed` buff changes the TICK
     INTERVAL itself — which is why `sliceSpan` splits the window at the buff's
     expiry and re-derives the rate per slice (src/core/skill-sim.js). */
  const bonus = bonusFor(inp.perks, liveBuffHost(() => state.buffs));

  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);
  /* THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). `null` when the
     projection has no `frac` — a database without the column — and then no
     `xp_frac` key is proposed (hr_apply would refuse it as unknown). */
  const xpFrac0 = normaliseXpFrac(inp.xpFrac);

  /* THE LIVE BAG, for the same reason the combat path keeps one: the tool
     lookup reads it, and the client's `addItem` mutates `G.inventory` during
     the replay. A server that resolved tools against a frozen snapshot would
     agree with the client today and diverge the day a node yields one. */
  const bag = Object.create(null);
  for (const id in (inp.inventory || {})) {
    const q = Math.floor(nat(inp.inventory[id], 0));
    if (q > 0) bag[id] = q;
  }

  const carry0 = normaliseToolCarry(inp.toolCarry);
  const state = {
    /* The pointer. `activeSkill` is DERIVED by simulateSkillSpan from the
       index — the server holds no skill column — so it is deliberately not set
       here: setting it would be the engine asserting something it does not
       know, and the mismatch branch exists precisely to catch that. */
    skillTargetId: inp.activeId,
    skills: { ...skills0 },        // a COPY: grantXp mutates it, and the diff below is the delta
    xpFrac: xpFrac0 ? { ...xpFrac0 } : undefined, // a COPY too; undefined = no column = per-grant floor
    inventory: bag,
    equipment,
    toolCarry: { ...(carry0 || {}) },
    stats: {},
    /* THE BUFF QUEUE (2026-09-13). The server's absolute-`until` rows, measured
       at the START of the paid window (`span.credit.fromMs`) because the drain is
       WALL-CLOCK: a `gather_speed` buff that ran out two hours into the night
       must have paid those two hours at the boosted rate and the rest at the base
       one, which is exactly the split `sliceSpan` performs once the queue is real.
       Absent projection ⇒ [] ⇒ one slice, base rate, today's behaviour. */
    buffs: buffQueueFromServer(inp.buffs, span.credit.fromMs),
  };

  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];
  /* THE GOAL COUNTER (b353). Same module, same shapes, same clamp as the
     combat path — one contract, not a gather-flavoured copy of one. */
  const goals = makeGoalCounter();

  /* THE HEARTHFIND claims this span produced. At most the FIRST becomes
     delta.hearthfind - hr_apply accepts one find per apply. A second find inside
     ONE settle window needs two independent 1-in-6,000-or-longer rolls in the
     same span; it is dropped rather than banked.

     ⚠ THE DROP IS NO LONGER SILENT. `delta.hearthfind.dropped` carries the
       COUNT that was thrown away, and hr_apply journals it through
       hr_record_rejection as `hearthfind_span_discard` (aggregated per
       character/code/day, not one row per event). It grants nothing and is
       validated like any other client number; it exists so that "did anyone
       ever lose a find to the one-per-apply rule?" is answered by the database
       instead of by an argument about probability. KNOWN LIMITATION, tracked
       AND now measurable. */
  const finds = [];
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
      bag[id] = (bag[id] || 0) + n;
    },
    /* ── THE LIFETIME COUNTERS (b353; the daily arm cut 2026-10-22) ──────
       `resolveGatherTick` calls `fx.updateQuest('gather', res.qty)` — the
       AMOUNT is the yield, not 1, so a tool double moves the count by 2.
       Passing `amt` through rather than assuming 1 is the same defect class as
       the b352 recipe-scroll `add: 1` the parity guard caught. */
    updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },
    /* Still deliberately ABSENT:
         onStop       — the level gate. Handled from the SUMMARY instead (see
                        the `activity` key below), because the server's "stop"
                        is a delta, not a call. */
  };

  const ctx = {
    away: true,                    // this IS the away path (docs/design/away-time-ruling.md)
    /* THE FIRST `grantMs` AFTER THE PLAYER LEFT (Ruling 2). Gathering has no
       UTC-day segmentation of its own, so today only the SPAN LENGTH reaches
       the yield — but the window is also what a buff timeline is measured
       against, and passing a different one here than combat gets is how the two
       away paths come to disagree about when the night happened. */
    fromMs: credit.fromMs,
    toMs: credit.toMs,
    capped,
    rng: createRng(nat(inp.seed, 0)),
    items,
    nodes,
    bonus,
    /* THE BAG'S STACK CAP (envelope.js bagCap, player_state.bank_cap): a node whose product has no room
       stops BAG_FULL (skill-sim.js gatherBagFullFor), as the bench does, rather than proposing a stack
       hr_apply refuses bank_full and forfeiting every window after it. */
    bagCap: Number.isSafeInteger(inp.bagCap) && inp.bagCap > 0 ? inp.bagCap : null,
    /* `minStepMs` is NOT SET, so resolveStepMs uses the real MIN_ACTION_MS
       floor. Exactly as in the combat ctx, this object is built field by field
       and nothing is spread into it — if it were built from a request body,
       `minStepMs` would ride in through the same door as everything else and
       defeat the clamp that is supposed to be the second line of defence. */
    fx,
  };

  const summary = simulateSkillSpan(state, ctx);

  /* A pointer the simulation could not resolve is a REFUSAL, not an empty
     night: `delta: NONE` means index.ts returns before hr_apply, the watermark
     does not advance, and the window is DEFERRED. Reachable only from an
     inconsistent row — hr_apply validates `active_id` against hr_activities
     when the pointer is set — but "unreachable today" is not a reason to
     confiscate a night if it ever becomes reachable. */
  if (summary.stoppedBy === STOP_REASON.UNKNOWN_NODE) return { accrued: false, reason: SKIP.NO_NODE, summary };
  if (summary.stoppedBy === STOP_REASON.WRONG_SKILL) return { accrued: false, reason: SKIP.WRONG_SKILL, summary };

  // ── Turn the mutated state into a delta hr_apply will accept. ────────────
  // Every value below is an INTEGER. hr_apply casts with `::bigint`, and a
  // fractional string is `bad_delta` — which costs the player the whole night.
  const xpDelta = {};
  for (const k in state.skills) {
    const gained = Math.floor((state.skills[k] || 0) - (skills0[k] || 0));
    if (gained > 0) xpDelta[k] = gained;
  }

  const items_ = {};
  let itemKinds = 0;
  for (const id in itemDelta) {
    /* Unknown ids are refused by hr_apply against the generated hr_items
       catalogue, which would reject the WHOLE delta — one renamed product id
       would cost a player their entire night. Filter here against the same
       authored data the catalogue is generated from, and report it. */
    if (!catalogueHas(items, id)) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    const n = Math.floor(itemDelta[id]);
    if (n <= 0) continue;          // gathering never debits; a zero is not a no-op to hr_apply
    items_[id] = n;
    itemKinds++;
  }

  /* ⚠ A LEVEL-GATED NODE MUST STILL CLEAR THE POINTER, and that is why this
     test comes BEFORE the nothing-happened return rather than after it.
     `resolveGatherAction` refuses on the first action when the character's
     server level is under `node.req`, so the span produces nothing — and
     returning `nothing_accrued` there would leave `active_id` pointing at a
     node that can never pay, forever, with every future accrual answering
     "nothing" and the player's pointer stuck on an activity they cannot do.
     Unreachable through the intent surface (hr_apply refuses to SET a node
     above the server level, and levels do not fall), so this is the arm for a
     content re-balance that raises a requirement under a live character. */
  /* A FULL BAG stops the node the same way: it cannot pay until the player makes room. */
  const nodeStopped = summary.stoppedBy === STOP_REASON.LEVEL || summary.stoppedBy === STOP_REASON.BAG_FULL;
  const nothingHappened = itemKinds === 0 && Object.keys(xpDelta).length === 0 && summary.ticks === 0;
  if (nothingHappened && !nodeStopped) {
    return { accrued: false, reason: SKIP.NOTHING, summary };
  }

  const stats = state.stats || {};
  const progress = [];
  const stat = (key, n) => { if (n > 0) progress.push({ kind: 'stat', key, period: '', add: Math.floor(n), state: 'active' }); };
  stat('gathered', stats.gathered);
  stat('tool_doubles', stats.toolDoubles);
  /* The per-SKILL counter the daily and weekly goals actually read
     (`chopped`/`mined`/`fished`). Read out of core's SKILL_ACTION_STAT — the
     same object legacy.js increments live — so an away night and a live hour
     move the same row. */
  const perSkill = SKILL_ACTION_STAT[summary.skill];
  if (perSkill) stat(perSkill, stats[perSkill]);
  /* THE GOAL COUNTERS — the day the player RETURNS, same rule as combat.
     `stat:gathered` and `stat:ev:gather` are both written for the reason the
     combat builder states: one is the lifetime yield, one is the goal event,
     and their agreement is asserted by G3. */
  for (const op of goalProgressOps(goals, nowMs, events)) progress.push(op);

  /* THE SUB-STEP REMAINDER, DEFERRED RATHER THAN FORFEITED — see
     settledWatermarkMs. No attended floor: `hr_attended_kills` is a COMBAT
     projection and nothing on this path consumes a row stamped in the window.
     A node that ran out or hit its level gate leaves `remainder >= stepMs`,
     which refusal (c) answers with `now()` — so a stopped bench is never
     re-simulated. */
  const settledTo = settledWatermarkMs(span, summary, summary.intervalMs,
    { caller: accrualCaller(inp) });

  const delta = {
    accrued_to: new Date(settledTo).toISOString(),
    journal: {
      kind: 'gather',
      intent: 'accrue',
      // AGGREGATE, never per-action. A 24h woodcutting night is ~27,000
      // actions; the receipt for what per-action journalling costs is
      // game_events — 1.6M rows / 229 MB from six players in four days.
      meta: { ms: grantMs, ticks: summary.ticks, qty: stats.gathered || 0,
              capped, node: summary.nodeId, skill: summary.skill,
              // `w` — the non-paying accounted time; see windowWaste. Absent
              // when zero, which is most gathering windows (no death clock).
              ...(windowWaste(summary) ? { w: windowWaste(summary) } : {}),
              /* WHY it stopped: a full bag, and the product that had no room (the bench's keys). */
              ...(summary.stoppedBy === STOP_REASON.BAG_FULL ? { stopped: 'bag_full', room_for: nodes[summary.nodeId].node.prod } : {}),
              // The credited window, for the reason the combat journal carries it.
              from: new Date(credit.fromMs).toISOString(),
              to: new Date(credit.toMs).toISOString() },
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
  /* THE CARRY, written back only when the server actually owns it. See the
     `toolCarry` note in computeAccrual's contract: a null input means the
     column does not exist, and emitting the key against an hr_apply that does
     not implement it is `unknown_delta_key` — a 409 that costs the night. */
  if (carry0) delta.tool_carry = roundCarry(state.toolCarry);
  /* The level gate stopped the activity, so the pointer must stop too — the
     same statement `died` makes for combat. Sent only when it happened,
     because an `activity` key is a complete, re-validated activity statement
     and restating an unchanged pointer buys nothing but a catalogue lookup. */

  /* THE HEARTHFIND. `inp.hearthfindReady` is the self-configuring switch (the
     recoverCol idiom): a database that does not allowlist the key never sees it
     proposed, so the edge and the migration are safe in either order. AT MOST
     ONE per apply, because hr_apply accepts one and re-derives everything about
     it - the trophy, the source, the odds - from its own catalogue. Nothing here
     is a grant; this is a claim. */
  if (inp.hearthfindReady && finds.length) {
    delta.hearthfind = finds.length > 1
      ? { ...finds[0], dropped: Math.min(finds.length - 1, 99) }
      : finds[0];
  }
  if (nodeStopped) delta.activity = { kind: 'idle', id: null };

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
      gold: 0,
      xp: xpDelta,
      items: items_,
      levelUps,
    },
  };
}
