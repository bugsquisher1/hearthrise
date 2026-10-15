// ============================================================================
// supabase/functions/hr-accrue/accrual.js — the SERVER ACCRUAL ENGINE.
//
// Phase C. Given server-owned state and a server timestamp, decide what a
// player is owed for the time they were away, and express it as a delta for
// hr_apply. This file computes; it does no I/O, opens no connection, reads no
// request and knows nothing about HTTP. index.ts does all of that.
//
// ── WHY THE SPLIT ──────────────────────────────────────────────────────────
// The exploit surface of an accrual engine is its INPUTS, and inputs are only
// auditable if you can see all of them in one place. `computeAccrual` takes a
// single explicit object; every field is named in this file; there is no
// spread, no Object.assign from a caller-supplied bag, and no default that
// reaches for an ambient value. A reviewer can therefore answer "what can the
// client influence?" by reading one function signature instead of tracing a
// request body through four call frames.
//
// It also means the whole engine runs in plain Node, so the parity contract
// (a span computed here must equal the client's simulateSpan for the same
// inputs and seed) is provable by a test rather than by deployment.
//
// ── ONE SIMULATION ─────────────────────────────────────────────────────────
// Nothing below re-implements a rule. Every number comes out of src/core:
// the tick interval from src/core/combat.js's constants, the fight from
// src/core/combat-sim.js's `simulateSpan` — the SAME function the live 2.4s
// tick runs — the XP grant from src/core/progression.js `grantXp`, the
// featured boss from src/core/botd.js, the away scope from src/core/away.js.
// A second copy of the maths is the failure this whole program exists to
// prevent, so if you find yourself typing an arithmetic operator on a game
// value in this file, you are writing a bug.
//
// ── ROLLING BACK A PAYABLE KIND — THE OPERATOR PROCEDURE (Security C3) ─────
// Read this BEFORE reverting an Edge deploy or renaming a catalogue id, because
// the safe order is not the obvious one.
//
// THE HAZARD. A pointer this build cannot price answers with a REFUSING skip
// reason, which defers the window rather than confiscating it. That is right,
// and it has a consequence: the collect refuses, and a refused collect refuses
// the SWITCH, so the character cannot be moved off the pointer by any client
// gesture. Roll the Edge payload back while players hold `artisan` pointers —
// or rename a recipe id — and every one of those characters is frozen until a
// deploy goes forward again.
//
// WHAT ALREADY HANDLES MOST OF IT. `set-activity.js` lets an incoming `idle`
// declaration force-close such a window as a JOURNALLED FORFEIT, for the
// reasons in `POINTER_SKIP_REASONS` (./intents.js) — the ones that are a
// property of the pointer rather than of the absence. So a player who taps
// STOP unfreezes themselves, loses only the window that could not be priced,
// and gets a `forfeited` receipt saying so. That covers a rollback where the
// OLD payload is still deployed and still has that code.
//
// WHAT DOES NOT. Rolling back to a payload that PREDATES the escape hatch (any
// build before b356) removes it, and then nothing client-side unfreezes a
// player. In that case the operator step is:
//
//   -- 1. WHO IS STUCK. Run first; if it returns 0 rows, do nothing.
//   select user_id, slot, active_kind, active_id, accrued_to
//     from public.player_state
//    where active_kind = 'artisan';           -- or the kind being rolled back
//
//   -- 2. IDLE THE POINTER. This is the whole fix; it does not touch a balance.
//   --    `accrued_to` is advanced in the SAME statement, because leaving it
//   --    behind hands the next accrual an absence nobody spent working.
//   update public.player_state
//      set active_kind = 'idle', active_id = null,
//          active_since = null, accrued_to = now(), version = version + 1
//    where active_kind = 'artisan';
//
//   -- 3. JOURNAL IT. An untraced mass write to player_state is indistinguishable
//   --    from an incident later. One row per character, `kind='admin'`.
//   insert into public.player_ledger (user_id, slot, kind, intent, meta)
//   select user_id, slot, 'admin', 'rollback:idle_pointer',
//          jsonb_build_object('was_kind', 'artisan', 'was_id', active_id)
//     from public.player_state where active_kind = 'idle';
//
// ⚠ RUN IT BEFORE THE ROLLBACK DEPLOY, NOT AFTER. Between the deploy and the
//   update, every affected player is frozen; doing it first means they are
//   merely idle, which is a state the old payload understands perfectly.
// ⚠ AND THE DEPLOY ORDER FOR GOING FORWARD IS THE OPPOSITE: Edge first, verify
//   `payload_sha256` on the GET route, client second. A client that declares a
//   kind the deployed engine cannot set earns a 409 on every gesture.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no fetch.
// ============================================================================

import {
  DEFAULT_PROFILE, swingIntervalMs,
  equipmentStats, armorSetBonus, playerCombatRolls, monsterCombatRolls, weaknessInfo,
} from '../../../src/core/combat.js';
/* `resolveKill` is imported ALONGSIDE `simulateSpan`, not instead of it, and it
   is the SAME function the live 2.4s tick reaches through the client's wrapped
   `window.killMonster`. The attended top-up below pays a kill by CALLING IT —
   never by re-implementing a drop roll, a gold roll or a rarity flag. If you
   find yourself typing `m.drops` in this file, stop. */
/* `COMBAT_STOP` is the THIRD stop table imported into this file, beside
   skill-sim's `STOP_REASON` and artisan-sim's `ARTISAN_STOP`. Aliased on the
   way in for the same reason those two are: three tables with one shape, and a
   bare `STOP_REASON` in a 3,500-line file is a coin toss. */
import { simulateSpan } from '../../../src/core/combat-sim.js';
import { simulateSkillSpan, STOP_REASON, SKILL_ACTION_STAT } from '../../../src/core/skill-sim.js';
/* The third simulation. `simulateArtisanSpan` runs the SAME `sliceSpan` the
   gather path runs, over the same `resolveArtisanAction` the live bench runs —
   one loop, three callers, which is the whole b351 shape. `benchPayable` is the
   payability PROPERTY (see its block in that file); it is read here, by
   ./set-activity.js's shape check and by src/net/activity.js's downgrade, so
   the three cannot disagree about which benches exist tonight. */
import {
  simulateArtisanSpan, STOP_REASON as ARTISAN_STOP, benchPayable, benchBlockedBy,
} from '../../../src/core/artisan-sim.js';
import { BENCH_COUNTERS } from '../../../src/core/artisan.js';
/* WHICH hours of an over-cap absence are credited. One definition, imported by
   both the server and (through core-bridge) the client — the flip from
   last-window to first-window crediting is a property of the away model, not a
   line of arithmetic each side gets to write for itself. */
import { creditWindow, recoveryRefuses } from '../../../src/core/away.js';
import { createRng } from '../../../src/core/rng.js';
/* NAMED HUNTS (lane C1). A combat pointer may name a hunt (src/data/hunts.js);
   the spawn roll itself lives in combat-sim.js `resolveKill`, the one engine. */
import { huntFor, huntSpawns, pickSpawn } from '../../../src/core/hunt-spawn.js';
/* HUNT SESSIONS (ruling HR-2026-10-14, lane C2). The session model is
   action-rules.js's (newHuntSession builds the engine shape the span walks);
   the bag's kinds are supplies.js's; the per-swing seed is the edge's keyed
   mix (./hunt-seed.js) — one seeder, injected into the one engine. */
import { newHuntSession } from '../../../src/core/action-rules.js';
import { SUPPLIES } from '../../../src/data/supplies.js';
import { swingSeederFor } from './hunt-seed.js';
/* RESTED XP (b437), banked SERVER-SIDE. The SAME watermarked accrual the client
   runs (src/core/rested.js) — no second formula. It draws NO rng, so appending
   it moves no seeded roll and away == live stays byte-identical (AWAY-1). */
import { accrueRestedXp as coreAccrueRested } from '../../../src/core/rested.js';
import { grantXp, normaliseXpFrac, xpFracChanges } from '../../../src/core/progression.js';
import { resolveStyle, normaliseStyleKeys } from '../../../src/core/styles.js';
import { levelFromXp } from '../../../src/core/xp.js';
/* THE PERMANENT PERK CHANNEL — the same module src/legacy.js getBonus is layer
   0 of. `makeBonus(perkState)` replaces `zeroBonus` at every site below. */
import { makeBonus, EMPTY_PERKS } from '../../../src/core/perks.js';
/* LAYER 1 — the equipped companion's passive bonus, summed on top of the fused
   layer 0 by bonusFor below. Pure, draw-free, permanent-scope. */
import { companionBonus } from '../../../src/core/companion-perk.js';
/* LAYER 2 — THE TIMED CONSUMABLE QUEUE (2026-09-13). `buffQueueFromServer` is
   where the SERVER's absolute-`until` rows (player_state.buffs, projected as the
   envelope's `buffs` block) become the `remainingMs` shape the simulators drain;
   `buffBonusFor` is the same term the client's getBonus chain adds, and
   `activeBuffs` is what makes `ctx.activeBuffCount` an honest number instead of
   the hard-coded 0 it was while the server held no queue. WALL-CLOCK drain — the
   rule is BUFF_DRAIN_RULE in that module, named once. */
import { buffQueueFromServer, buffBonusFor, activeBuffs } from '../../../src/core/buffs.js';
/* THE DAILY/QUEST COUNTER CONTRACT (Designer Ruling 3.1). The key shapes, the
   day key, the clamp and the vocabulary live in ONE module that both this
   engine and the guard read; see its header for why `kind='daily'`/`kind='stat'`
   and why the daily period is the day the player RETURNS. */
import {
  makeGoalCounter, goalProgressOps,
  /* Slice 1 (bestiary, per-monster kills) + Slice 2 (collection, per-item
     loot): siblings of the goal counter, fed from the SAME kill/loot seams the
     goal model reads. See their headers in src/core/goals.js. */
  makeBestiaryCounter, bestiaryProgressOps,
  makeCollectionCounter, collectionProgressOps,
  /* THE UTC DAY KEY. One definition — the Recovery ladder's `deaths` daily row
     must land under exactly the period key every other daily row lands under,
     or the free fall is anchored to a day nothing else agrees about. */
  utcDayKey,
} from '../../../src/core/goals.js';
/* THE QUEST-MODAL DAILY COUNTERS (b461) — chopped / mined / fished / rare_drop
   / levelup. A SECOND PROJECTION of integers this engine already computed (the
   same values written one line away as lifetime `stat` rows), NOT a second
   count, so a daily row and its lifetime row cannot disagree. There is
   deliberately no `weekly` kind: a weekly total is DERIVED at claim time as the
   sum of the ISO week's seven day rows. See goal-period.js's header for why
   mirroring it as rows was rejected (it would double the progress ops on every
   settle, and `progress_clamp` HALVES THE SPAN rather than failing). */
import { modalGoalOps } from './goal-period.js';
/* The ONE catalogue-lookup guard in this payload. See its definition for why a
   truthiness test on a `[a-z0-9_]` id is not one. ./intents.js imports nothing,
   so this cannot cycle. */
import { catalogueHas } from './intents.js';
/* THE HIRED-CREW RATE MODEL, shared with the client (src/features/workers.js
   reaches it through core-bridge). The efficiency curve used to live HERE and
   AGAIN in the client, kept in step by a comment that said "Mirrors …"; the
   thing it was an efficiency OF — the paced action interval — was never named
   in either, which is how b389's rebalance shipped at 1.60x its stated size.
   One module owns it now. See src/core/workers.js for the full account. */
import {
  WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL,
  WORKER_ACCRUE_CAP_MS, WORKER_MAX_ACC_MS,
  workerLevel, workerEff, workerEffE, workerAnchorMs,
} from '../../../src/core/workers.js';

/* The floor on an accrual. Below this nothing is simulated and — unlike the
   client, which advances its watermark regardless (legacy.js:987) — NOTHING IS
   WRITTEN. The client had to advance, because its watermark was also its
   "have I already paid this?" record. The server's watermark is `accrued_to`,
   and leaving it alone simply means the next call sees a slightly longer span.
   That is strictly better: the client's behaviour quietly confiscates every
   sub-threshold absence, and the server has no reason to inherit that. */
export const ACCRUE_MIN_MS = 60000;

/**
 * Does an engine delta MOVE ANY VALUE? (b531)
 *
 * The sub-minute exemption above is opened by `finalWindow`, and its cost
 * control is here: a collect that priced a short window into a delta carrying
 * nothing a player would notice must write NOTHING — no apply, no ledger row,
 * no version bump — so a burst of rapid switches still costs the database
 * exactly what it cost before the exemption existed. Deferring such a window is
 * free and safe: `accrued_to` is left alone, so the next collect prices it
 * again from the same watermark.
 *
 * VALUE is items / xp / gold / progress. Deliberately NOT hp, `fight` or
 * `tool_carry`: those are the *state of a run in flight*, and a switch throws
 * the run away anyway (hr_apply voids a `fight` checkpoint whenever the delta
 * also carries an `activity` key). Counting them would make every switch write
 * a row that granted nothing.
 *
 * A NEGATIVE item quantity IS value — an artisan window that consumed inputs
 * and burnt the output cost the player something real, and skipping it would
 * hand back the ingredients.
 */
export function deltaHasValue(delta) {
  if (!delta || typeof delta !== 'object') return false;
  const anyNonZero = (m) => !!m && typeof m === 'object'
    && Object.keys(m).some((k) => Number(m[k]) !== 0);
  if (anyNonZero(delta.items)) return true;
  if (anyNonZero(delta.xp)) return true;
  if (Number(delta.gold) !== 0 && Number.isFinite(Number(delta.gold))) return true;
  if (Array.isArray(delta.progress) && delta.progress.length > 0) return true;
  return false;
}

/**
 * ── THE INVENTORY-COMPLETENESS CONTRACT (inventory-flip Step B1) ────────────
 *
 * The dormant absolute-replace flip (src/net/accrue.js) may only fire on an
 * envelope the SERVER certifies `inventory_complete === true`. That flag is
 * emitted by hr_state_of (2026-08-24-inventory-complete.sql), NOT here — but it
 * is a statement ABOUT this engine, so its truth condition is defined here, in
 * ONE place, and hr_state_of reads that same fact rather than a parallel copy:
 *
 *   inventory_complete  ⟺  this engine has NO pending, un-drained window that
 *                          could still grant an OWNABLE item.
 *
 * The engine's own "nothing to settle" boundary is exactly `grantMs <
 * ACCRUE_MIN_MS` (see computeAccrual's SKIP.TOO_SOON return) or a non-payable
 * pointer (SKIP.NO_ACTIVITY / SKIP.UNSUPPORTED). hr_state_of gates on precisely
 * that — `now() - greatest(accrued_to, active_since) < ACCRUE_MIN_MS` for a
 * payable pointer, true otherwise — reading the SAME watermark this engine
 * advances (`accrued_to`) and the SAME constant below. There is no second
 * completeness computation to disagree; the SQL literal `interval '60 seconds'`
 * is pinned to this export by tests/inventory-complete-probe.mjs.
 *
 * ⚠ WHY THIS IS SUFFICIENT FOR THE CHAINED-CRAFT HAZARD (accrue.js:863). The
 *   flip's real blocker is a freshly-crafted OWNED output whose input chain the
 *   server has not finished settling — invisible to hr_state_of, DELETED by an
 *   absolute replace. Under this engine that cannot arise while the flag is
 *   true, for two structural reasons hr_state_of DEPENDS ON:
 *     (1) ATOMIC SETTLE — accrueArtisan/accrueGather/the combat tail each emit
 *         ONE signed item delta (inputs consumed + outputs produced) that
 *         hr_apply applies in ONE transaction, so player_inventory never holds a
 *         half-settled craft.
 *     (2) COLLECT-BEFORE-SWITCH — set-activity stamps accrued_to = now() on every
 *         pointer change, fully draining the old activity's window into
 *         player_inventory before the next begins, so no chain spans two pointers
 *         mid-flight.
 *   The ONLY window in which player_inventory can lag the owned set is the
 *   currently-active pointer's un-drained tail — which the flag gates on. If
 *   either guarantee is ever weakened (genuine multi-pointer or partial
 *   settlement, where a settle advances accrued_to while leaving inventory
 *   inconsistent), the flag MUST gain an explicit engine-STAMPED completeness
 *   column and this contract must be revisited. Stated so a future change to the
 *   settle shape cannot silently invalidate the flip.
 *
 * ⚠ b531 NARROWED THIS, AND THE INVENTORY FLIP MUST NOT BE ARMED WITHOUT
 *   READING THIS PARAGRAPH. `finalWindow` (see the floor in computeAccrual)
 *   lets a COLLECT-BEFORE-SWITCH pay a window shorter than ACCRUE_MIN_MS. So
 *   the predicate below — and the `interval '60 seconds'` in hr_state_of it is
 *   pinned to — no longer means "no window could grant"; it means "no window
 *   the ACCRUE cadence would pay could grant". A sub-minute artisan run ended
 *   by a switch grants ownable items while this reads true. That is harmless
 *   today (the absolute-replace flip is dormant, `inventoryArmEnabled` is false
 *   in prod) and it is exactly the "if either guarantee is ever weakened"
 *   condition below: arming the flip now requires the engine-STAMPED
 *   completeness column, not this predicate.
 *
 * @returns true when a pointer in state `{activeKind, accruedToMs, activeSinceMs}`
 *   has NO pending grant window at `nowMs` — the exact predicate hr_state_of's
 *   `inventory_complete` field mirrors. Exported for the parity/pin test; the
 *   engine's runtime path does not call it (it reaches the same boundary through
 *   the SKIP.TOO_SOON / SKIP.NO_ACTIVITY returns).
 */
export function inventoryBaselineComplete({ activeKind, activeId, accruedToMs, activeSinceMs, nowMs }) {
  if (!PAYABLE_KINDS.includes(activeKind) || !activeId) return true;
  if (!Number.isFinite(Number(activeSinceMs)) || Number(activeSinceMs) <= 0) return false;
  const watermark = Math.max(nat(accruedToMs, 0), nat(activeSinceMs, 0));
  return (nat(nowMs, 0) - watermark) < ACCRUE_MIN_MS;
}

/* An absolute fuse on the span, independent of hr_offline_cap_ms. If the cap
   function is ever wrong, mis-granted or replaced, this still bounds one
   accrual to a day of ticks. Two independent limits, because `capMs` is the
   single highest-leverage number in the grant after tickMs. */
export const ACCRUE_MAX_SPAN_MS = 24 * 3600000;

/* ── THE ATTENDED LOOT TOP-UP IS GONE (lane C2, ruling HR-2026-10-14 §3) ─────
   `hr_credit_kills`, its ledger read `hr_attended_kills`, ATTENDED_MAX_FIDELITY
   and the physical re-cap lived here. They existed because the client fought
   its own fight and the server re-simulated a SMALLER one; a hunt session has
   one fight, the server's, so there is no attended shortfall to top up and no
   client kill count to cap. */

/* THE HUNT'S OPENING-SPAWN STREAM (lane C1). A window that opens a named hunt
   with no carried fight rolls its FIRST foe once, before the span, from this
   salted stream — so the span's own `ctx.rng` sequence is untouched and a
   training fight (no hunt) never draws it at all. Same seed, so a dispute
   replays. A HUNT SESSION's opening foe is drawn
   from its own keyed swing seed instead (accrueCombat). */
export const HUNT_RNG_SALT = 0x4e7a;

/**
 * ── THE DEGRADE LADDER'S KNOB, AND IT IS A GAME RULE, SO IT LIVES HERE ─────
 *
 * index.ts answers a clamp rejection by asking for a SMALLER proposal and
 * re-applying (review S8: a rejection rolls back the watermark too, so without
 * this the character's accrual is bricked forever). What "smaller" MEANS is a
 * property of the simulation, not of the HTTP shell — and getting it wrong is
 * silent, because a ladder that does not shrink the proposal still terminates,
 * at the last-resort forfeit that pays NOTHING.
 *
 * ⚠ HALVING THE SPAN IS ONLY CORRECT WHEN OUTPUT IS PROPORTIONAL TO TIME
 *   (Security C1, b356). It is, for combat and gathering. It is NOT for
 *   artisan: an artisan night is bounded by the BAG whenever the player left
 *   less material than the clock could consume, and halving the span of a
 *   bag-bound run reduces the proposal by less than half — sometimes by
 *   NOTHING AT ALL. Measured on `forge_dawn_axe`, 24h absence, 4,000-craft
 *   bag: the 24h span and the 12h span both run 4,000 actions and produce
 *   byte-identical deltas. The ladder then spends an attempt, earns the same
 *   rejection, and has one attempt left before it forfeits the night.
 *
 * So artisan degrades the ACTION BUDGET instead, which is the quantity the
 * delta is actually proportional to — halving it halves the output, the XP and
 * the consumption together, whether the clock or the bag was binding. The span
 * is left ALONE on that path, because shrinking both would compound into a
 * double reduction the player never owed.
 *
 * PURE. Takes the previous attempt's own result, returns the next attempt's
 * inputs, and reaches for nothing ambient.
 *
 * @param out      the previous `computeAccrual` result (must be `accrued`)
 * @param attempt  1-based rung number, for the receipt
 * @returns { capMs, actionBudget, report } | null when there is nothing
 *          smaller left to ask for — the caller then forfeits, which is the
 *          honest end of the ladder rather than an infinite loop.
 */
export function degradeStep(out, attempt) {
  if (!out || out.accrued !== true) return null;
  const kind = out.delta && out.delta.journal && out.delta.journal.kind;
  /* `craft` is the LEDGER kind an artisan accrual journals under (see
     accrueArtisan — `artisan` is not in player_ledger_kind_check). Reading the
     kind off the delta the previous attempt actually produced, rather than off
     an input the caller still holds, keeps this a function of ONE argument. */
  if (kind === 'craft') {
    const ran = Math.floor(Number(out.summary && out.summary.ticks) || 0);
    const next = Math.floor(ran / 2);
    if (!(next > 0)) return null;
    return {
      capMs: Math.floor(Number(out.grantMs) || 0),
      actionBudget: next,
      report: { spanMs: Math.floor(Number(out.grantMs) || 0), actions: next, from: ran, attempt },
    };
  }
  const smaller = Math.floor(Number(out.grantMs) / 2);
  if (!(smaller > 0)) return null;
  return {
    capMs: smaller,
    actionBudget: null,
    report: { spanMs: smaller, attempt },
  };
}

/* Reasons a call did nothing. Machine codes, never prose — the client
   localises (design §2, "Error taxonomy"). These are not errors: they are the
   ordinary answer for a player who has nothing to collect.

   ⚠ THIS TABLE IS THE WHOLE SET. Every `reason:` this function returns must be
     a member of it — never a bare string literal at the return site. The
     collect-before-switch rule in ./intents.js partitions these into "safe to
     switch" and "switching would confiscate", and it can only do that for
     reasons it can see. `'no_cap'` was a bare literal here for four builds:
     absent from this table, absent from both lists over there, and classified
     correctly only because classifySkip fails closed. It was right by accident,
     and an accident is not a mechanism. tests/activity-intent.mjs A17 reads
     THIS object and asserts the partition covers it exactly, and that no reason
     is produced as a literal. */
export const SKIP = {
  NO_ACTIVITY: 'idle',
  UNSUPPORTED: 'unsupported_activity',
  TOO_SOON: 'below_min_span',
  NO_TARGET: 'unknown_monster',
  NOTHING: 'nothing_accrued',
  /* A `gather` pointer whose id is not in the gather index. The mirror of
     NO_TARGET for the other payable kind, and a separate code because
     "unknown_monster" is a lie about a missing tree — the two are produced by
     different catalogues and a support request has to be able to tell them
     apart. REFUSING, exactly like NO_TARGET: an unpriceable window must be
     deferred, never confiscated by a switch. */
  NO_NODE: 'unknown_node',
  /* The pointer names a node whose skill is not the one the character is set
     to. Reachable only from an inconsistent row (the server holds no skill
     column, so this is the CLIENT-side arm), and paying it would credit the
     wrong skill's XP. REFUSING. */
  WRONG_SKILL: 'wrong_skill',
  /* An activity pointer with no `active_since`. Fail-closed rather than
     substituted — see the precondition below. */
  NO_ACTIVE_SINCE: 'no_active_since',
  /* hr_offline_cap_ms returned 0 (or the read failed). NOTHING in the window
     can be priced, so this is a refusing reason — see the lockout note beside
     REFUSING_SKIP_REASONS in ./intents.js. Unreachable today: the cap function
     floors at 12h. */
  NO_CAP: 'no_cap',
  /* An `artisan` pointer whose id is not in the recipe index. The third
     member of the NO_TARGET / NO_NODE family, and a separate code for the same
     reason those two are separate: three catalogues, three truths, and a
     support request has to be able to tell a cut monster apart from a renamed
     tree apart from a recipe that never existed. REFUSING. */
  NO_RECIPE: 'unknown_recipe',
  /* The recipe EXISTS and its bench is one the server may not pay tonight —
     `benchPayable` is false because a bonus key that can DESTROY value on it
     (cooking's `noBurn`) is not yet sourced from server-owned state. See the
     property block at the foot of src/core/artisan-sim.js.

     REFUSING, and that is the whole point of it being a distinct code rather
     than `unsupported_activity`: this window is real work the engine will be
     able to price the day `SERVER_OWNED_BONUS_KEYS` gains `noBurn`, so it must
     be DEFERRED (delta NONE, watermark unmoved) and never confiscated by a
     switch. Unreachable through the intent surface — ./set-activity.js refuses
     an unpayable bench on SHAPE, before any database work, so the pointer can
     never hold one — which makes this the arm for an inconsistent row or for a
     bench that becomes unpayable under a live character. */
  UNPAYABLE_BENCH: 'unpayable_bench',
  /* THE CHARACTER IS ON A HUNT (lane C2). A hunt session's window is settled by
     the hunt settle (./hunt-settle.js: the world tick and the hunt verbs) and by
     nothing else, so the accrue/collect pricing of the same pointer answers
     this and pays nothing. SAFE, not refusing: there is nothing owed HERE —
     the session owns the window, and refusing would block the aux settles
     (crew, rested) that ride the accrue verb. */
  HUNT_OPEN: 'hunt_open',
  /* A COMBAT POINTER WITH NO HUNT SESSION (closed rebuild, lane C2). A fight is
     a session; nothing else prices one. SAFE, not refusing: no window is owed
     to a pointer the server never pays (set-activity answers `hunt_required`
     before one can be declared). */
  HUNT_REQUIRED: 'hunt_required',
};

/* ⚠ THE KINDS THIS ENGINE CAN PAY. THE ACTIVITY INTENT'S ALLOWLIST IS DERIVED
   FROM THIS ARRAY AND MUST NEVER BE WIDER (set-activity.js, asserted by
   tests/activity-intent.mjs A1).

   The reason is the whole "collect before you switch" rule: `hr_apply` stamps
   `accrued_to = now()` on any activity change, so a window the engine cannot
   PRICE is a window the switch CONFISCATES. `hr_activities` holds 344 rows
   across three kinds, so an allowlist wider than what this file simulates would
   let a player set an activity, work it for three hours, switch, and be paid
   nothing — an under-payment created by the very rule that closed the
   over-payment.

   ── WHAT PROTECTS A WIDENING, STATED HONESTLY (b356) ────────────────────
   ⚠ THIS PARAGRAPH USED TO READ: "If you add a kind here without a simulation
     below, the guard fails; that is the guard's entire job." THAT GUARD DID NOT
     EXIST. Measured before rewriting this comment: adding a fourth kind to this
     array and running the whole suite is GREEN, and the new kind then falls
     through the branch below into the COMBAT tail — which looks its `active_id`
     up in MONSTERS, finds nothing, and prices the night against an undefined
     monster. Not a build failure: a wrong payment. The comment was describing
     a protection somebody intended rather than one anybody wrote, which is the
     "assertion that asserts nothing" family this repo has recorded eighteen
     instances of, applied to prose.

   What is TRUE, and each of these is a real mechanism you can break and watch
   go red:

     1. THE DISPATCH IS A TABLE, AND THE BRANCH IS TOTAL. `KIND_ACCRUERS`
        (below) maps a kind to the function that prices it; `computeAccrual`
        looks the kind up there and then REFUSES anything that is not `combat`
        with `SKIP.UNSUPPORTED`. So a kind added here with no simulation is (a)
        named by tests/artisan-accrual.mjs T1, which compares this array against
        that table in both directions, and (b) paid NOTHING at runtime, its
        window DEFERRED (a refusing reason: delta NONE, watermark unmoved)
        rather than mis-simulated as a fight against a monster that does not
        exist. Two independent mechanisms, one of which is a build failure.
     2. `SETTABLE_KINDS` is DERIVED from this array (set-activity.js), and
        tests/activity-seam.mjs S1 fails the build when the client's
        `ACTIVITY_KINDS` does not match it, S2 when no `declareActivity('<kind>')`
        call site exists in src/legacy.js, and B348-3 in the browser suite when
        no real player GESTURE produces it. So a server-only widening cannot
        ship — that is the b348 bill, and those three are what it bought.
     3. tests/accrual-engine.mjs `settableKindsGuard` asserts the derivation in
        both directions: nothing settable that cannot be paid, nothing payable
        that cannot be set.

   What is still NOT checked, so nobody mistakes this list for one: that the
   simulation a new kind dispatches to is CORRECT. Only fixtures do that.

   ── THE ROLL CALL ──────────────────────────────────────────────────────
   `gather` joined `combat` on 2026-08-15 (23 of the 344 rows). `artisan` joins
   on 2026-08-16 (290 rows, 84% of the catalogue) now that both of its blockers
   are closed by 2026-08-16-artisan-progress-model.sql: `unlockedRecipes` is a
   `kind='flag'` progress row projected by `hr_perks_of`, and the Kitchen rung
   is a `kind='unlock'` row read through `hr_unlock_levels`.

   ⚠ ALL FOUR BENCHES NOW SETTLE, cooking included (cooking real-fix). The
     Kitchen rung is server-owned END TO END: `src/legacy.js upgradeRoom()`
     routes the purchase through `hr_unlock_buy`
     (`window.HearthriseGold.buyUnlock`), `rooms` is on SERVER_OF_RECORD with
     the rooms record arm live so the client no longer authors `G.rooms`, and
     the rung is READ here through `hr_perks_of` → makeBonus → `noBurn`. So a
     server reading a Kitchen 0 against a real Kitchen 3 can no longer happen —
     the server holds the only copy. `benchPayable('cooking')` in
     src/core/artisan-sim.js is now true (its arm flag flipped, `noBurn` is a
     server-owned bonus key), so this engine settles the cooking bench at the
     CORRECT burn rate. §9(3) of 2026-08-16-artisan-progress-model.sql
     authorised exactly this shape.

   ⚠ AND `PAYABLE_KINDS` IS THE WRONG PLACE TO EXPRESS IT. Removing `artisan`
     from this array would take the other 261 recipes down with it AND make
     cooking un-settable-but-silent again; instead the intent refuses an
     unpayable BENCH on shape (set-activity.js) and the engine answers a pointer
     that somehow holds one with `unpayable_bench`, which DEFERS. Kind-level
     coarseness is how "cooking is not ready" would have become "artisan pays
     nothing", which is where this whole item started. */
export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan']);

/* THE DEATH-ROW CEILING (Recovery rev. 2, N3). hr_apply enforces its own copy —
   this one exists so a pathological span proposes a delta hr_apply will accept
   rather than one it refuses outright, which would cost the player the window
   instead of the tail of a list. 24 is comfortably above the ~20 the ladder's
   own 64-minute cap allows in a twelve-hour night. */
export const MAX_DEATH_ROWS = 24;

/* ── KIND → THE FUNCTION THAT PRICES IT ────────────────────────────────────
   The mechanism the block above could not previously claim, made real: this is
   what `computeAccrual`'s branch DISPATCHES ON, and tests/artisan-accrual.mjs
   T1 asserts it covers PAYABLE_KINDS in both directions — a payable kind with
   no simulation, or a simulation nothing can reach, fails the build BY NAME.

   `combat` is deliberately absent and is the reason this is a lookup with a
   fallthrough rather than a total table: the fight is priced by the TAIL of
   `computeAccrual` itself, kept inline so its parity fixtures still cover the
   bytes they were written against (see the branch). T1 names `combat` as the
   one permitted exception rather than accepting any absence, so a second
   inline kind cannot appear by omission.

   NULL-PROTOTYPE. `activeKind` reaches this from a database column whose CHECK
   admits four values today — but the lookup pattern is the one that turned
   `constructor` into a truthy hit everywhere else in this payload, and a
   container with no prototype removes the hazard instead of guarding it. */
export const KIND_ACCRUERS = (() => {
  const t = Object.create(null);
  t.gather = accrueGather;
  t.artisan = accrueArtisan;
  return Object.freeze(t);
})();

/* ── THE PERK STACK, SERVER-SIDE (b349) ───────────────────────────────────
   `makeBonus(perkState)` from src/core/perks.js — the SAME module
   src/legacy.js getBonus is layer 0 of, so the client's number and this one
   are computed by one function from one table and cannot drift.

   ⚠ THE STATE IS THE SWITCH. `hr_perks_of` is what fills it; a database
     without that function, or with no unlock rows written yet, yields
     EMPTY_PERKS and every channel reads 0 — which is byte-for-byte the
     `zeroBonus()` this replaces (asserted, tests/perk-channel.mjs P1). So
     there is no flag to forget to flip and no ordering hazard between
     applying the migration and deploying this function.

   WHAT IT CLOSES: `noBurn`. At the recipe's required level `burnChance` is
   0.25 with noBurn 0, against 0.12 / 0.06 / 0.00 at Kitchen rungs 1 / 2 / 3+.
   A server that cooked with a zero perk stack would DESTROY a quarter of the
   input the player's Cast-Iron Range protects — the reason artisan accrual is
   refused in writing rather than by omission.
   Also closes a live silent under-pay on the combat path that has been
   running since accrual shipped: Trophy Room + Watchtower is +7% combatXP,
   Great Library + capstone is +7% allXP, and an away night paid neither.

   WHAT IT STILL DOES NOT CARRY, each with a named blocker rather than a
   shrug: renown (no server renown score — quests/collection/streak have no
   progress model), the clan castle (server-owned but the perk table and the
   upkeep scale live in a classic script another surface owns), companions
   (no server model at all). §5 of src/core/perks.js states each in full.
   Every one of them is an UNDER-payment, which is the correct direction.

   ⚠ AND UNDER-PAYING IS STILL NOT THE ONLY DIRECTION THIS ENGINE IS WRONG IN.
     `equipment` is read at COLLECT time and prices the WHOLE window: log off
     naked, equip best-in-slot, collect, and the night is paid at best-in-slot
     rates. Measured 2026-08-11, same seed and same 12h goblin fixture,
     varying nothing but the equipment map: 477g / 3,235 Attack XP naked
     versus 6,103g / 65,029 naked→BiS — 12.8x gold and 20x XP. That is review
     S5, an OVER-payment, deferred to Phase D, and it must ship in the same
     migration as the first client-reachable activity intent. See
     docs/design/server-authority.md §3.
     ⚠⚠ THE PERK STACK IS READ AT COLLECT TIME TOO, and therefore inherits
        exactly the same shape: build the Great Hearth during an absence and
        the whole absence prices at Kitchen 5. It is bounded far more tightly
        than S5 — the permanent fuse is +20% per key against equipment's 20x —
        and it is closed by the same fix (S5's rule stamps `accrued_to = now()`
        on any state-changing write, which leaves no unpaid window for the new
        rung to price). Stating it because a bound that nobody wrote down is a
        bound nobody checks.

   Named and exported so a test can assert the degrade path is genuinely inert
   rather than trusting a closure. */
export function zeroBonus() { return 0; }

/* The engine's bonus function for a given perk state. `null`/absent state →
   EMPTY_PERKS → 0 for every key.

   ⚠ TWO LAYERS, SUMMED — mirroring the client's getBonus chain exactly.
   `makeBonus` is LAYER 0 (rooms/plots/property/renown), clamped by the
   PERMANENT_CAP fuse because on the server that IS the whole layer-0 chain.
   `companionBonus` is LAYER 1 — the equipped companion, added ON TOP of the
   fused number precisely as src/features/companions.js wraps window.getBonus
   with `v += cb[key]` AFTER the base returned. Folding the companion into
   layer 0 would clamp (rooms + companion) together and disagree with the
   client near the cap; keeping it a separate additive layer keeps the two
   byte-identical. companionBonus draws NO rng and pays on AWAY_SCOPE.permanent
   (true), so away and live share every seeded draw and AWAY-1 stays byte-for-
   byte — a companion changes the totals, but away==live for the same setup.
   EMPTY_PERKS carries no `companion`, so companionBonus returns 0 for every
   key and this degrades to the pre-companion behaviour exactly. */
export function bonusFor(perkState, buffHost, away) {
  const base = makeBonus(perkState || EMPTY_PERKS);
  const comp = companionBonus(perkState || EMPTY_PERKS);
  /* ── LAYER 2 — THE TIMED CONSUMABLE QUEUE (2026-09-13) ───────────────────
     A third additive layer, mirroring the client's getBonus chain, which asks
     the buff queue after rooms and companions. It is read LIVE, through
     `buffHost.buffs`, and that is the load-bearing part: the simulators DRAIN
     the queue tick by tick (combat-sim `simulateSpan`, skill/artisan
     `sliceSpan`) and REASSIGN `state.buffs` when they prune, so a captured
     array would go stale exactly where a buff expires mid-absence — the b326
     bug in reverse, paying a dead buff instead of freezing a live one.

     `away` defaults to TRUE because every caller here is the accrual engine and
     the accrual engine is the away path; `AWAY_SCOPE.buff` is open (a buff is
     PERSONAL — Tyler, 2026-08-14), so the channel pays, and it drains in the
     same breath because the two halves are one rule.

     `buffHost` absent → this term is 0 for every key, which is byte-for-byte the
     pre-2026-09-13 behaviour and the reason an Edge deployed against a database
     with no `buffs` column pays nobody. */
  const buffCtx = { away: away !== false };
  if (!buffHost) return (key) => base(key) + comp(key);
  return (key) => base(key) + comp(key) + buffBonusFor(buffHost.buffs, key, buffCtx);
}

/* THE LIVE VIEW a `bonusFor` layer-2 reads through. A getter, not the array:
   see the reassignment note above. One idiom for all three activity builders so
   the combat path and the gather/artisan paths cannot drift — and it works in
   the two orders the builders happen to have (combat builds `state` before its
   bonus, gather and artisan build the bonus first), because the getter is not
   evaluated until the simulation asks for a key. */
export function liveBuffHost(get) {
  return { get buffs() { return get(); } };
}

/**
 * The swing interval, DERIVED — never accepted.
 *
 * `ticks = floor(elapsed / tickMs)` makes this a DIVISOR of elapsed time and
 * therefore the largest single lever in the whole grant: a 12h absence at the
 * honest 2.4s swing budgets ~18,000 ticks; at 1ms it budgets ~43,200,000.
 * (design §3, "interval_ms is the accrual engine's largest lever".)
 *
 * b329: this used to be a HAND COPY of the client's combatTickMs(), annotated
 * "byte-for-byte the same expression". It is now literally the same function —
 * `src/core/combat.js swingIntervalMs()` — because the moment a third speed
 * term arrived (the style's `speedMod`), "byte-for-byte by comment" was one
 * edit away from being false, and two intervals is exactly how a hammer came to
 * swing 26% more often asleep than awake (combat-sim.js header, omission 10).
 *
 * `style` is still DERIVED, never accepted: the caller resolves it from the
 * server-owned weapon family, and `swingIntervalMs` clamps `speedMod` to
 * [1.00, 2.00], so no style row — present, absent or hostile — can shrink the
 * divisor below the family baseline.
 *
 * @param equipment  server-owned { equip_slot: item_id }
 * @param items      the ITEMS catalogue
 * @param style      the resolved COMBAT_STYLES row (optional)
 */
export function deriveTickMs(equipment, items, style) {
  return swingIntervalMs(equipmentStats(equipment, items), style);
}

/** The stat profile, derived from the equipped weapon family. Mirrors
    legacy.js:7906 getCombatStatProfile, which reads the same weapon type. */
export function deriveProfile(weaponType) {
  if (weaponType === 'magic') {
    return { type: 'magic', accuracySkill: 'magic', damageSkill: 'magic',
             accuracyBonusField: 'magicAtkB', strengthBonusField: 'magicStrB' };
  }
  if (weaponType === 'ranged') {
    return { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged',
             accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' };
  }
  return Object.assign({}, DEFAULT_PROFILE, { type: weaponType || 'sword' });
}

/* A finite, non-negative integer or the fallback. Used on every number that
   crosses into this engine from a database row — a NULL column, a bigint
   arriving as a string, or a NaN would otherwise propagate into `Math.floor`
   and out the other side as a grant. */
function nat(v, fallback) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? n : fallback;
}

/* ── WHO IS SETTLING THIS WINDOW (the caller taxonomy, 2026-09-18) ───────────
   This replaces the boolean `finalWindow`, which was doing two jobs under a
   name that only described one of them. Two behaviours hang off it — the
   ACCRUE_MIN_MS floor (computeAccrual) and refusal (b) in settledWatermarkMs —
   and they are properties of WHO IS CALLING, not of the window:

     'accrue'   index.ts's cadence poll. The pointer survives the call, so a
                sub-minute window is DEFERRED (the floor applies) and the
                sub-action remainder is deferred too. Today's behaviour.
     'collect'  set-activity.js's collect-before-switch. The switch that follows
                stamps `active_since = now()`, so there is no next call and
                nothing to defer INTO: the floor is exempt and the watermark
                stamps `now()`. Exactly today's `finalWindow: true` (b531).
     'tick'     the world tick (services/world-tick, docs/planning/
                WORLD_TICK_DESIGN.md). A 10 s window is below the floor, so the
                floor is exempt — but a tick window's remainder IS deferrable,
                because the tick's NEXT window starts at the watermark this one
                stamped. Borrowing 'collect' for it (the 2026-09-18 spike) made
                `settledWatermarkMs` stamp `now()` and forfeit the sub-action
                remainder every ten seconds: measured 2.0% / 3.5% / 7.8% of a
                ten-minute span on the three parity fixtures with alignment off
                (tests/world-tick-parity.mjs --mutate --callerTick). The tick was
                protected only by `alignWindow` zeroing the remainder — two
                independent mechanisms having to agree, one of them named the
                opposite of what it did.

   ⚠ THE CALLER IS A SERVER LITERAL, NEVER A REQUEST FIELD. index.ts and
     set-activity.js each spell it as a constant string in the computeAccrual
     literal; nothing reads it off the body. tests/activity-intent.mjs asserts
     that (A14 + the caller SOURCE arm), because a caller a client could choose
     would let it pick 'collect' and buy the floor exemption on demand.

   FAIL-SAFE: anything unrecognised — absent, misspelled, a hostile value —
   reads as 'accrue', the most conservative of the three. 'accrue' keeps the
   floor (grants nothing it is unsure about) and defers the remainder (settles
   LESS than now, so the window stays open and is paid next call). The only
   caller that can LOSE time by being mislabelled is 'collect', and 'collect' is
   a single call site with its own source guard. */
export const ACCRUAL_CALLERS = Object.freeze(['accrue', 'collect', 'tick']);

/* ── THE RUNTIME FENCE (Security, 2026-09-18) ────────────────────────────────
   The paragraph above says the caller is a server literal, and A14b asserts it
   — ON TWO FILENAMES, `index.ts` and `set-activity.js`. That is the whole of
   the guard, and it is a source regex: a THIRD edge call site (a future intent
   handler, a new verb's module) would spell `caller: body.caller` and no guard
   in this repo would fire, because A14 and A14b both enumerate the two files
   they knew about. A source assertion cannot see a file that did not exist when
   it was written.

   So the privilege is fenced at RUNTIME as well, by an unforgeable token rather
   than by a string. `CALLER_AUTHORITY` is a module-private object IDENTITY: the
   only way to hold it is to `import` it from this module, and a request body
   cannot — it arrives as JSON, and JSON has no way to express "this exact
   object". `JSON.parse(JSON.stringify(CALLER_AUTHORITY))` is a different
   object and is refused, which is the property stated as a test
   (tests/settle-carry-defer.mjs D4g).

   The result: EVERY value a client could ever get into `inp.caller`, through
   any present or future call site that forwards a body, reads as 'accrue' —
   the floor stays on and the window is deferred. The privileged callers must
   both name themselves AND prove they are server code. This does not stop an
   author who deliberately imports the token and wires a body field to it; no
   in-process check can. It stops the accident, which is the one that ships. */
export const CALLER_AUTHORITY = Object.freeze({ hearthrise: 'accrual-caller-authority' });

export function accrualCaller(inp) {
  const c = inp && inp.caller;
  if (c !== 'collect' && c !== 'tick') return 'accrue';
  /* Identity, not shape: `===` on the frozen singleton. A structural check
     (`inp.callerAuthority.hearthrise === '...'`) would be satisfiable by a JSON
     body and would be no fence at all. */
  return (inp.callerAuthority === CALLER_AUTHORITY) ? c : 'accrue';
}

/* ── `w`: THE WINDOW'S NON-PAYING TIME, ONE SCALAR (2026-09-18, §15a) ────────
   `settledWatermarkMs` advances the watermark by the time the simulation
   ACCOUNTED for, which is `ticks x interval + recoverMs + idleMs`. The journal
   recorded only the first term, so a window containing a death was
   arithmetically indistinguishable from a window whose watermark was computed
   WRONGLY: replaying 14 days of real windows (services/world-tick/replay.js)
   left five pairs in an `unaccounted` bucket that could not be judged either
   way. Two integers close that, and turn `accounted = ticks x interval + rms +
   ims` into an identity the ledger can be audited on instead of an inference.

   ONE KEY, A COMMA-JOINED SCALAR, and both of those are guards rather than
   taste:
     · ONE key, because tests/accrual-engine.mjs SHAPE bounds the combat meta's
       key count (the game_events rule made countable) and an attended window
       already sits near the bound. `att` is nested for the same reason.
     · A SCALAR STRING, because tests/artisan-accrual.mjs T7 refuses any nested
       value in the ledger — `[rms, ims]` is an array and would be rejected. The
       house precedent for "two facts, one scalar" is `skipped_items` (C5).
   OMITTED ENTIRELY when both terms are zero, which is every window with no
   death and no idle time — so an ordinary night's journal row is byte-for-byte
   what it was and the ledger grows only where the extra fact exists.

   LEDGER COST, stated because §5's rule is "aggregate, never per-tick": the
   widest form is `"w":"43200000,86400000"` = 24 bytes on a row that already
   exists; no new rows, no new table. Measured cadence: the 14-day production
   read behind tests/fixtures/world-tick-real-windows.json is ~1.7k accrue rows
   for 5 users = ~24 rows/user/day. At 100x the live player base (500 active)
   that is ~12k accrue rows/day, so even if EVERY row carried the widest form
   the ceiling is ~290 KB/day (~105 MB/year) — and the real figure is a small
   fraction of it, because the key is absent on any window without a death. */
function windowWaste(summary) {
  const s = summary || {};
  const r = Math.floor(nat(s.recoverMs, 0));
  const i = Math.floor(nat(s.idleMs, 0));
  return (r > 0 || i > 0) ? `${r},${i}` : null;
}

/**
 * ── THE RESTED BANK, SERVER-SIDE (b437) ────────────────────────────────────
 *
 * Rested XP accrues on WALL-CLOCK, independent of any activity pointer — you
 * rest whether or not you left something running (legacy.js SEAM 3). So it is
 * settled ALONGSIDE the pointer, on its OWN watermark `rested_at`, exactly the
 * way the hired crew is (index.ts's worker settle) — NOT through KIND_ACCRUERS,
 * and settled EVEN WHEN the pointer accrual refused (idle / below-min), because
 * an idle pointer does not mean an idle bank.
 *
 * WATERMARK-IDEMPOTENT, and that is the whole ballgame: `rested_at` is the
 * instant already banked to, charges = floor((now - rested_at)/CHARGE_MS), and
 * the watermark advances by exactly the whole charges granted — so a second call
 * over the same span banks nothing (a non-idempotent advance would be the b214
 * offline double-pay). All of that lives in ONE place, src/core/rested.js, which
 * the client runs too; this function only threads server-owned inputs into it.
 *
 * DRAW-FREE: it touches no rng, so it moves no seeded roll and away == live stays
 * byte-identical.
 *
 * SELF-CONFIGURING SWITCH, like tool_carry/fight: `restedAtMs === null` means the
 * `rested_at` column does not exist on this database → return `absent` and OMIT
 * the delta keys, so a deploy that lands before the migration pays exactly what
 * it paid yesterday (hr_apply would reject an unknown key and cost a whole night).
 *
 * @param nowMs        the SERVER clock
 * @param restedAtMs   player_state.rested_at in ms, or null if the column is absent
 * @param restedXp     player_state.rested_xp (the current banked charge count)
 * @param libraryCap   the raised bank cap for a Great Library owner, or null for
 *                     the default (80). SERVER-OWNED; a null under-pays the bank
 *                     SIZE only (never the rate), which is the safe direction.
 * @returns {accrued:false, reason} | {accrued:true, granted, restedXp, restedAt}
 *   restedXp/restedAt are the NEW ABSOLUTE values for hr_apply.
 */
export function accrueRested({ nowMs, restedAtMs, restedXp, libraryCap }) {
  if (restedAtMs === null || typeof restedAtMs === 'undefined') {
    return { accrued: false, reason: 'absent' };
  }
  const now = nat(nowMs, 0);
  const state = { restedXp: nat(restedXp, 0), restedAt: nat(restedAtMs, now) };
  const cap = (Number.isFinite(Number(libraryCap)) && Number(libraryCap) > 0)
    ? Number(libraryCap) : undefined;
  const granted = coreAccrueRested(state, now, cap);   // mutates state, idempotent
  if (!(granted > 0)) {
    return { accrued: false, reason: 'nothing', restedXp: state.restedXp, restedAt: state.restedAt };
  }
  return { accrued: true, granted, restedXp: state.restedXp, restedAt: state.restedAt };
}

/**
 * THE ACCRUAL.
 *
 * @param input  every field is server-owned. Named exhaustively on purpose —
 *               see the header. NOTHING here may originate in a request body.
 *   userId       uuid, from the verified JWT subject
 *   slot         int, the only client-chosen value in the whole call, and it
 *                selects a row the caller already owns
 *   nowMs        the SERVER clock (`select now()`), never the client's
 *   accruedToMs  player_state.accrued_to
 *   activeSinceMs player_state.active_since
 *   activeKind   player_state.active_kind
 *   activeId     player_state.active_id
 *   capMs        hr_offline_cap_ms(), computed in Postgres
 *   seed         hr_seed(user, slot, 'accrue:<accrued_to>') — mixes a 256-bit
 *                server-only secret, so the roll is replayable for a dispute
 *                but not precomputable by the player (design §3, review S20)
 *   hp, maxHp, gold   player_state
 *   skills       { skill_id: xp }        from player_skills
 *   equipment    { equip_slot: item_id } from player_equipment
 *   inventory    { item_id: qty }        from player_inventory — READ, and
 *                partially SPENT: auto-eat consumes food out of it. This is
 *                the first input the engine both reads and debits, which is
 *                why the delta below is signed.
 *   items        ITEMS,   the authored catalogue (src/data/items.js)
 *   monsters     MONSTERS, ditto
 *   actionBudget the DEGRADE LADDER'S knob, and the only input on this object
 *                that is not a fact about the player — it is the number of
 *                artisan actions the engine's PREVIOUS attempt is allowed to
 *                be cut down to (see `degradeStep`). `null` on a first
 *                attempt and on every non-artisan path, which means
 *                unbounded and is byte-for-byte the pre-b356 behaviour.
 *                ⚠ It is computed by index.ts from `out.summary.ticks` — the
 *                  engine's own previous answer — and NEVER from a request
 *                  body. Even if it were forged it could only ever REDUCE a
 *                  grant (`simulateArtisanSpan` floors it at 0 and treats a
 *                  non-finite value as no cap), so the hostile direction is
 *                  under-paying yourself. Asserted, not assumed, in
 *                  tests/artisan-accrual.mjs T8.
 *   recipes      the ARTISAN INDEX — `indexArtisanRecipes(ARTISAN_RECIPES)`,
 *                built once in ./catalogue.js (`ARTISAN_RECIPES_ALL`) so the
 *                recipe↔bench mapping exists in exactly one place.
 *                Null-prototype, so a `__proto__` id cannot resolve — which
 *                matters more here than for gather, because a truthy miss
 *                reaches `recipe.inputs` and `recipe.cost`.
 *                ⚠ THE **FULL** INDEX, NOT THE PAYABLE SUBSET. The engine has
 *                to be able to tell a missing recipe apart from a bench that is
 *                not server-owned yet; ./set-activity.js is the one that filters.
 *   unlockedRecipes  `{ <scroll_id>: true }` from `hr_perks_of` — the artisan
 *                GATE, not a magnitude, which is why it is a field of its own
 *                rather than a key inside `perks` (see §5 of
 *                2026-08-16-artisan-progress-model.sql). **NULL means this
 *                database predates the model**, and the engine reads that as
 *                LOCKED: `gateOk` refuses, the span stops with GATE, and only
 *                the time actually worked is paid. Fail-closed is the shape's
 *                own default here — an absent row is an absent key is a locked
 *                recipe — so there is no branch to forget.
 *   nodes        the GATHER INDEX — `indexGatherNodes({woodcutting: TREES,
 *                mining: ROCKS, fishing: FISH_SPOTS})`, built once in
 *                ./catalogue.js so the skill↔array mapping exists in exactly
 *                one place. Null-prototype, so a `__proto__` id cannot resolve.
 *   toolCarry    player_state.tool_carry — the deterministic fractional
 *                double-yield carry, `{ skill: 0..1 }`. **NULL means the
 *                column does not exist yet**, and that is a deliberate,
 *                self-configuring switch rather than a flag: the engine then
 *                starts each span from an empty carry and OMITS `tool_carry`
 *                from the delta, because hr_apply refuses an unknown delta key
 *                and that refusal would cost the player a whole night. The day
 *                2026-08-15-tool-carry.sql is applied, hr_state_of starts
 *                returning `{}` instead of undefined and the key starts being
 *                written. Cost of the gap: at most one bonus unit per skill
 *                per accrual (~0.5 expected), measured in
 *                tests/accrual-engine.mjs' carry-continuity fixture.
 *   ammoCarry    player_state.ammo_carry — the CONSUMPTION carry's twin,
 *                `{ <ammoItemId>: 0..1 }`, and the same self-configuring null
 *                switch for the same reason. A whetstone burns 0.02 per swing,
 *                so 49 swings in 50 bank a fraction instead of spending an
 *                item; without somewhere to put that fraction a 90-second
 *                attended settle charges zero and the melee consumable is free.
 *                **NULL means the column does not exist yet** — TRUE TODAY, the
 *                migration is not written — and the engine then starts each
 *                span from an empty carry and OMITS `ammo_carry` from the delta.
 *                ⚠ COST OF THE GAP IS ZERO FOR AN INTEGER `ammoPerShot`: every
 *                  arrow and every rune is 1/swing, so the carry lands on
 *                  exactly 0 after each one and the burn is exact with or
 *                  without the column. Only a FRACTIONAL rung is affected, and
 *                  only by under-charging (< 1 item per settled window), which
 *                  is the safe direction. See src/core/ammo.js.
 *   recoveringUntilMs
 *                player_state.recovering_until in ms — the RECOVERY LINE
 *                (First-Night Idle Rescue). An ABSOLUTE server instant before
 *                which the character is Knocked Out: no swing, no gather, no
 *                XP, no loot, no food. Written only by hr_apply, never by any
 *                client, and never a per-window counter — the ~90 s live settle
 *                cadence would re-zero a counter and make Recovery free (R1).
 *                **NULL means the column does not exist**; 0 means the column
 *                exists and the character is up. The switch is the KEY'S
 *                PRESENCE in hr_state_of's envelope rather than `?? null`,
 *                because null is the ordinary value — see index.ts's field.
 *                Null ⇒ the engine omits `recovering_until` from the delta,
 *                which is byte-for-byte the pre-Recovery behaviour.
 *   buffs        THE CONSUMABLE BUFF QUEUE (2026-09-13) — the envelope's OWN
 *                top-level `buffs` block, i.e. player_state.buffs projected as
 *                [{type, magnitude, until, remaining_ms}]. Written ONLY by
 *                hr_apply's `buff_apply` block (type/magnitude/duration from
 *                hr_item_buffs, `until` from now()), so nothing here is a client
 *                value — the client cannot even NAME a magnitude or an expiry
 *                (a buff_apply carrying one is refused bad_buff_item).
 *                The three activity builders convert it with
 *                `buffQueueFromServer(inp.buffs, credit.fromMs)`: absolute
 *                `until` → the `remainingMs` shape the simulators drain, measured
 *                at the START of the paid window because the drain is WALL-CLOCK
 *                (BUFF_DRAIN_RULE, src/core/buffs.js) — a buff that ran out
 *                mid-absence pays the slice it was alive for and no more.
 *                **NULL/absent means the projection (or the column) does not
 *                exist** ⇒ [] ⇒ `bonusFor`'s layer 2 is 0 for every key and no
 *                boundary splits the span, which is byte-for-byte the
 *                pre-2026-09-13 behaviour. The engine proposes NO delta key for
 *                it: the queue is drained IN the simulation for pricing, and the
 *                durable expiry is the absolute `until` the server already holds,
 *                so there is nothing to write back and no way for the engine to
 *                post an arbitrary queue.
 *   deathsTodayBefore, deathsLifetimeBefore
 *                THE RECOVERY LADDER'S TWO ANCHORS. player_progress
 *                kind='stat' key='deaths' under period=<UTC day> and period=''
 *                respectively, as they stood when this window OPENED. Projected
 *                by hr_state_of as their own scalars (`deaths_today` /
 *                `deaths_lifetime`) rather than dug out of the `progress`
 *                array, which is LIMIT 1000 and truncatable — a survival
 *                mechanic must never depend on a read that can silently answer
 *                "you have never died". Absent ⇒ 0 ⇒ the day's-first-fall
 *                grace, the UNDER-charging direction.
 *   fight        player_state.fight — the IN-FLIGHT FIGHT at `accrued_to`,
 *                `{ monster, hp, kills }` or `{}` for none. **NULL means the
 *                column does not exist yet**, the same self-configuring switch
 *                `toolCarry` uses and for the same reason: the engine then
 *                starts every span at full monster HP and OMITS `fight` from
 *                the delta, which is byte-for-byte the pre-Phase-0 behaviour.
 *                ⚠ COST OF THE GAP IS NOT A ROUNDING LOSS. Without this input
 *                  a target whose time-to-kill exceeds the span pays ZERO,
 *                  forever — measured 0 kills / 0 gold at 60 s, 120 s and
 *                  300 s cadences against a 520 HP dragon that a single
 *                  60-minute window pays 1 kill / 575 gold for
 *                  (tools/probe-live-settle.mjs P3). See §0 of
 *                  docs/design/live-settlement.md.
 *                ⚠ IT IS ENGINE OUTPUT, NEVER CLIENT INPUT, and hr_apply
 *                  re-derives the monster's HP ceiling from the catalogue and
 *                  REFUSES a proposal outside it rather than clamping — the
 *                  engine's proposal is checked, not trusted.
 *   huntSession  A HUNT SESSION (lane C2, ruling HR-2026-10-14), in the engine
 *                shape src/core/action-rules.js `newHuntSession` builds:
 *                the swing clock, bag, action bar, presses, cooldowns, falls,
 *                limits. Built by ./hunt-settle.js from `hr_hunt_engine_read`
 *                (hunt_sessions / hunt_bag / player_action_sets, read in the
 *                settle's own transaction) — never from a request body.
 *                PRESENT ⇒ the window is the session's and nothing else's:
 *                no offline cap, no credited window, no attended top-up, no
 *                Vigour tail, no auto-eat, no Retreat. COPIED, never mutated.
 *   huntWindow   `{ fromMs, toMs, pressAtMs }` — the session's settled_to, the
 *                server's now() (or the press instant: the window then ends at
 *                the first swing boundary at or after it). Server instants only.
 *   huntSecret   hr_seed(user, slot, 'hunt:' || session) as decimal text, the
 *                key ./hunt-seed.js mixes every swing's label with.
 *   huntOpen     true when the character holds an OPEN session and this call
 *                is NOT the hunt settle (accrue / collect): the engine then
 *                answers SKIP.HUNT_OPEN and prices nothing — the old combat
 *                path can never pay a hunting character (ruling §2: "the
 *                world tick is the only thing that settles a session").
 *   bestiaryKills  THE BESTIARY COUNTERS — `hr_bestiary_of(user, slot)` as
 *                `{ <monsterId>: <kills> }`, or NULL. Read inside the same
 *                transaction as hr_state_of (index.ts) / beside the seed
 *                (set-activity.js), from `player_progress` rows written ONLY by
 *                hr_apply out of this engine's own combat delta. **The client
 *                supplies nothing here** — there is no request field for a kill
 *                count and none for a rank, so there is nothing to forge: a
 *                charm the server has not counted does not exist.
 *                The engine folds it to per-class totals and then to
 *                `{class: rank}` (src/core/charms.js) and hands that to
 *                `weaknessInfo`, which prices the DROP table with it — the same
 *                one expression the live tick calls, so an away night and an
 *                attended one pay one charm (AWAY-1).
 *                ⚠ NULL means "this database has no hr_bestiary_of" (or nothing
 *                  has been killed yet) and resolves to NO multiplier —
 *                  byte-for-byte the pre-charm behaviour, the under-paying
 *                  direction. Same self-configuring switch `attended` uses: the
 *                  read's PRESENCE is the arm, with no flag to forget to flip.
 *                ⚠ NO DELTA KEY is derived from it. It is read-only input, like
 *                  `enchant` — the counters are written by the kill itself.
 *
 * @returns { accrued: false, reason } | { accrued: true, delta, summary, … }
 */
export function computeAccrual(input) {
  const inp = input || {};

  // ── (0) The activity pointer. Combat only in Phase C. ────────────────────
  // Gathering and artisan accrual are the next slices; refusing them here —
  // rather than falling through to "no ticks" — matters, because a fall-through
  // would advance the watermark and silently confiscate the gathering time the
  // next phase is supposed to pay.
  if (!PAYABLE_KINDS.includes(inp.activeKind) || !inp.activeId) {
    /* The predicate is lifted out of the `reason:` expression on purpose: the
       A17 coverage guard reads every `reason:` site and requires it to name a
       SKIP member and nothing else, and a comparison against `'idle'` INSIDE
       the expression is a string literal the scan cannot tell from a reason. */
    const isIdle = !inp.activeKind || inp.activeKind === 'idle';
    return { accrued: false, reason: isIdle ? SKIP.NO_ACTIVITY : SKIP.UNSUPPORTED };
  }
  const monsters = inp.monsters || {};
  /* A NAMED HUNT (lane C1): `activeId` names an area, not a monster. Every spawn
     must be a catalogued monster (the generator asserts it; this re-checks so a
     drifted pack fails closed to NO_TARGET instead of fighting `undefined`). */
  const hunt = inp.activeKind === 'combat' ? huntFor(inp.activeId) : null;
  if (hunt && !hunt.spawns.every((sp) => catalogueHas(monsters, sp.monster))) {
    return { accrued: false, reason: SKIP.NO_TARGET };
  }
  /* OWN-PROPERTY, never truthiness. `activeId` is bounded by
     /^[a-z0-9_]{1,64}$/ at the request layer — which matches `constructor` and
     `__proto__`, both of which are truthy on any plain object. See catalogueHas
     in ./intents.js for the measurement and for why it stops being harmless the
     moment a lookup is followed by a property read.
     (The gather index is null-prototype, so its own lookup needs no such
     guard — see `indexGatherNodes`. It is checked through the same helper
     anyway, because one reader is one rule.) */
  if (inp.activeKind === 'combat' && !hunt && !catalogueHas(monsters, inp.activeId)) {
    return { accrued: false, reason: SKIP.NO_TARGET };
  }
  if (inp.activeKind === 'gather' && !catalogueHas(inp.nodes || {}, inp.activeId)) {
    return { accrued: false, reason: SKIP.NO_NODE };
  }
  /* The third catalogue, and it is checked against the FULL recipe index rather
     than the payable subset on purpose — the two answers are different facts
     and a player deserves the right one. "That recipe does not exist" and "that
     bench is not server-owned yet" both refuse and both defer, but only the
     second one becomes payable by deploying a commit. */
  if (inp.activeKind === 'artisan') {
    if (!catalogueHas(inp.recipes || {}, inp.activeId)) {
      return { accrued: false, reason: SKIP.NO_RECIPE };
    }
    const bench = inp.recipes[inp.activeId].skill;
    if (!benchPayable(bench)) {
      /* `blockedBy` names the BONUS KEY, not the bench — "cooking is not
         supported" sends somebody looking at cooking; "`noBurn` is not
         server-owned" points at the one commit that opens it. */
      return { accrued: false, reason: SKIP.UNPAYABLE_BENCH, bench, blockedBy: benchBlockedBy(bench) };
    }
  }

  /* ── THE FAIL-CLOSED `active_since` RULE (Phase-D, the half that is not SQL) ─
     `active_since` is the second watermark and the only defence against a
     `start_activity` that forgot to send `accrued_to`: it clamps the grant to
     "no more time than the activity has actually existed". It is stamped by
     hr_apply itself from now(), never by the delta, so a NULL on a character
     whose `active_kind` is payable is an INCONSISTENT ROW, not a default.

     This used to be `nat(inp.activeSinceMs, accruedToMs)` — i.e. a missing
     second watermark silently fell back to the first, which removes the clamp
     at exactly the moment it is needed. Refusing costs a player nothing (the
     next intent restamps it) and a mint is not available in the other
     direction. Reachable only through an inconsistent row; unreachable through
     the intent surface, which always sends `restart: true`. */
  /* ── HUNT SESSIONS (lane C2) ─────────────────────────────────────────────
     A session's window has no absence in it: it is [settled_to, now) of a hunt
     the world tick (or a hunt verb) is settling, priced by the SAME combat
     body below with the session attached — so no cap, no credited window and
     no ACCRUE_MIN_MS floor apply, and the swing clock decides what is paid. */
  if (inp.activeKind === 'combat' && inp.huntSession) {
    const hspan = huntSpanOf(inp);
    if (!hspan) return { accrued: false, reason: SKIP.TOO_SOON };
    return accrueHunt(inp, hspan, hunt);
  }
  /* ...and an OPEN session is never priced by anything else. */
  if (inp.huntOpen === true) return { accrued: false, reason: SKIP.HUNT_OPEN };
  /* A FIGHT IS A HUNT SESSION (closed rebuild, lane C2): a combat pointer with
     no session is priced by nothing — the away combat path was deleted. */
  if (inp.activeKind === 'combat') return { accrued: false, reason: SKIP.HUNT_REQUIRED };

  if (!Number.isFinite(Number(inp.activeSinceMs)) || Number(inp.activeSinceMs) <= 0) {
    return { accrued: false, reason: SKIP.NO_ACTIVE_SINCE };
  }

  // ── (1) The span. SERVER CLOCK ONLY. ─────────────────────────────────────
  const nowMs = nat(inp.nowMs, 0);
  const accruedToMs = nat(inp.accruedToMs, nowMs);
  const capMs = Math.min(ACCRUE_MAX_SPAN_MS, nat(inp.capMs, 0));

  // THE SECOND WATERMARK, and it is not decoration. `accrued_to` is only
  // advanced by a caller that remembers to send `accrued_to` in its delta, so
  // a `start_activity` intent that forgets it would leave a stale watermark and
  // hand the first accrual an absence the player did not spend fighting. That
  // is a genuine (capped) mint. `active_since` is stamped by hr_apply itself
  // from now() on `restart:true` and is not in the delta contract as a value,
  // so clamping to it closes the hole from this side as well: you can never be
  // paid for more time than the activity has actually existed.
  const sinceMs = nat(inp.activeSinceMs, accruedToMs);

  /* ── (1-r) KNOCKED OUT TIME IS NOT PAYABLE TIME (Recovery rev. 3, R2) ─────
     `player_state.recovering_until` is an ABSOLUTE server instant before which
     this character may not FIGHT. Rev. 2 read it as "earns nothing" and made
     the floor apply to every payable kind except combat; the designer ruling
     of 2026-09-08 (rev. 3) narrows it: a knockout stops you fighting, it does
     not lock you out of the world. Gathering and the benches pay in FULL
     through a knockout, at the ordinary rate, with no tax.
       · There is ONE definition of "which kinds does recovery refuse", and it
         is `recoveryRefuses()` in src/core/away.js — the same predicate the
         declaration gate in set-activity.js asks. This file does not restate
         `'combat'`; the day the catalogue changes, it changes there.
       · COMBAT — the one kind the predicate refuses — is NOT subtracted here
         either: it is gated inside the simulation (`simulateSpan` spends
         recovery ticks without swinging), because the combat path is the one
         that can CREATE a recovery mid-window and so needs a timeline rather
         than a subtraction. The floor stays in the code as the seam the
         predicate drives, so a future refused kind WITHOUT a timeline gets the
         prefix subtraction for free.
     Clamped to `nowMs` so a line in the future cannot push the floor past the
     present and mint a negative span. Self-configuring on the column exactly
     like the combat seed below: absent ⇒ 0 ⇒ byte-for-byte the old behaviour. */
  const recoverColIn = inp.recoveringUntilMs !== null && typeof inp.recoveringUntilMs !== 'undefined';
  /* The second clause is NOT a second copy of the recovery catalogue: it names
     a different property — this kind is SIMULATED tick by tick below, so its
     recovery is spent on the timeline (RECOVER-2 pins that a pure-recovery
     combat window still applies and carries the line forward; a prefix
     subtraction here would skip it and re-price the knockout for ever). */
  const simulatesRecovery = (kind) => kind === 'combat';
  const recoverFloorMs = (recoverColIn && recoveryRefuses(inp.activeKind)
    && !simulatesRecovery(inp.activeKind))
    ? Math.min(nat(inp.recoveringUntilMs, 0), nowMs) : 0;
  /* The floor the paid window starts at. `accrued_to` still advances to now()
     in the delta — the forfeited knockout is a FORFEIT, not a deferral, exactly
     like the over-cap tail. */
  const payFromMs = Math.max(accruedToMs, recoverFloorMs);

  const elapsedMs = Math.max(0, nowMs - payFromMs);
  const sinceActivityMs = Math.max(0, nowMs - sinceMs);
  const grantMs = Math.min(elapsedMs, sinceActivityMs, capMs);

  if (!(capMs > 0)) return { accrued: false, reason: SKIP.NO_CAP };
  /* ── THE FLOOR, AND THE ONE CALLER IT MAY NOT APPLY TO (b531) ─────────────
     LIVE, MEASURED 2026-09-09 (QA account, twice): 28 iron bars, a platebody
     bench, `set_activity:artisan:forge_iron_platebody` accepted at 16:40:14 and
     `set_activity:idle` declared 37 s later when the client's local loop
     predicted the bag would run out. The switch's collect priced a 37 s window,
     answered `below_min_span`, and paid NOTHING — then the switch stamped
     `active_since = now()` (activityDelta's `restart:true`), which clamps every
     later grant to the NEW pointer's age. The 37 s was not deferred, it was
     DESTROYED, and with it five iron platebodies. Any craft or gather run whose
     inputs run out inside a minute yields nothing at all.

     The floor's own header states its justification: a sub-threshold window is
     "not confiscated by having been looked at", because `accrued_to` is left
     alone and the NEXT call sees a longer span. That reasoning is TRUE for the
     `accrue` verb (a cadence poll; the pointer survives) and FALSE for a
     COLLECT-BEFORE-SWITCH (the pointer is about to be replaced; there is no
     next call for this window). So the floor is a property of the CALLER, and
     `inp.caller` names it: 'accrue' keeps the floor, 'collect' and 'tick' are
     exempt because neither has a later call that would see a longer span (see
     accrualCaller). Anything unrecognised reads as 'accrue', i.e. the floor
     STAYS ON — the fail-safe direction, since the floor grants nothing.

     WHY THIS CANNOT BE GAMED. Paying it grants exactly what the simulation
     computes for the elapsed span and advances `accrued_to` to `now()`, so time
     is conserved: switching twice pays the same total as switching once. The
     cap (`capMs`) and the day budget still bound the output, and the collect
     caller additionally refuses to WRITE a sub-minute window that produced
     nothing of value (see collectCurrentWindow), so switch-spam still writes no
     rows and no ledger noise. `grantMs > 0` is required either way — a
     zero-length window has nothing to simulate. */
  if (grantMs <= 0) return { accrued: false, reason: SKIP.TOO_SOON };
  if (grantMs < ACCRUE_MIN_MS && accrualCaller(inp) === 'accrue') {
    return { accrued: false, reason: SKIP.TOO_SOON };
  }
  const capped = elapsedMs > grantMs;

  /* ── (1a) WHICH hours of the absence those are (Ruling 2, 2026-08-15) ─────
     The FIRST `grantMs` after the player left — `[W, W + grantMs]` where
     W = max(accrued_to, active_since) — never the last `grantMs` before they
     came back. See src/core/away.js `creditWindow` for the two defects the old
     `nowMs - grantMs` anchor produced (a return-timed choice of Boss-of-the-Day
     segments, and a logoff-eaten consumable that pays nothing).

     `grantMs` is UNCHANGED by this — only its POSITION on the timeline moves.
     An uncapped absence is byte-identical, because W + grantMs === nowMs there. */
  const credit = creditWindow({
    /* `payFromMs`, NOT `accruedToMs` — see (1-r). For combat the two are the
       same value and this line is byte-identical to the shipped one. */
    watermarkMs: payFromMs, activeSinceMs: sinceMs, nowMs, grantMs,
  });
  const unpaidMs = credit.unpaidMs;

  /* ── (1b) THE KIND BRANCH, AND IT IS TOTAL ───────────────────────────────
     Everything above is shared: the pointer, the two watermarks, the cap and
     the minimum span are properties of an ABSENCE, not of what was being done
     in it. Everything below is combat. `accrueGather` and `accrueArtisan` run
     the same shape over src/core/skill-sim.js and src/core/artisan-sim.js and
     return the same envelope; they are separate functions rather than branches
     inside this one so that the combat path is textually unchanged and its
     parity fixtures still cover the bytes they were written against.

     ⚠ THE `UNSUPPORTED` LINE IS NOT DEAD CODE, AND IT IS THE ONLY THING THE
       BLOCK ABOVE PAYABLE_KINDS CAN HONESTLY CLAIM. Without it a kind added to
       that array with no simulation FALLS THROUGH INTO THE COMBAT TAIL, which
       reads `MONSTERS[<a recipe id>]`, finds nothing, and prices the night
       against an undefined monster — a wrong payment with no error anywhere.
       With it, an unsimulated kind is refused with a REFUSING reason: delta
       NONE, watermark unmoved, window DEFERRED until somebody writes the
       simulation. Unreachable today by construction (the three names below are
       exactly PAYABLE_KINDS, and the intent's allowlist is derived from it), so
       tests/artisan-accrual.mjs T1 reaches it directly with a synthetic fourth
       kind. Deleting it is how "add a kind" becomes "pay it wrong". */
  const span = { nowMs, grantMs, capped, credit };
  const accruer = KIND_ACCRUERS[inp.activeKind];
  if (accruer) return accruer(inp, span);
  return { accrued: false, reason: SKIP.UNSUPPORTED };
}

/* ── THE HUNT SESSION'S WINDOW (lane C2) ─────────────────────────────────────
   The longest window one settle may carry. A FUSE on engine time per request
   (6 h of 600 ms swings is 36,000 swings), never a gameplay cap: a session
   further behind than this catches up over successive settles, the remainder
   owed on its unmoved settled_to. hr_hunt_settle_session's own fuse is 24 h. */
export const HUNT_MAX_WINDOW_MS = 6 * 3600000;

/* The span of one hunt-session settle, or null when there is nothing to settle
   (an empty or inverted window). Field by field from the caller's server
   values; the session is COPIED through newHuntSession with a ZERO tally, so
   the tally the span accumulates IS this window's uses. */
function huntSpanOf(inp) {
  const w = (inp.huntWindow && typeof inp.huntWindow === 'object') ? inp.huntWindow : {};
  const fromMs = Math.floor(nat(w.fromMs, -1));
  const toMs0 = Math.floor(nat(w.toMs, -1));
  if (!(fromMs > 0) || !(toMs0 > fromMs)) return null;
  const toMs = Math.min(toMs0, fromMs + HUNT_MAX_WINDOW_MS);
  const hs = newHuntSession(Object.assign({}, inp.huntSession, {
    tally: null, endedReason: null, endedAtMs: null,
  }));
  if (!hs.id) return null;
  /* `null`/absent is "no press" — and NOT `Number(null)`, which is 0: a press
     at the epoch would end every window at its first boundary. */
  const pressAtMs = (w.pressAtMs !== null && w.pressAtMs !== undefined && Number.isFinite(Number(w.pressAtMs)))
    ? Math.floor(Number(w.pressAtMs)) : null;
  return {
    nowMs: toMs, grantMs: toMs - fromMs, capped: false, sinceMs: fromMs,
    credit: { fromMs, toMs, paidMs: toMs - fromMs, unpaidMs: 0 },
    huntSession: hs, huntToMs: toMs, pressAtMs,
  };
}

/* THE FIRST SWING BOUNDARY AT OR AFTER `atMs`, on the session's own clock.
   A press settles through exactly this boundary (ruling §2: "fires the slot at
   the first swing boundary"), so the window end is the boundary + 1 ms — the
   span walks boundaries strictly before its end. */
export function firstBoundaryAtOrAfter(nextSwingAtMs, tickMs, atMs) {
  const n = Math.floor(Number(nextSwingAtMs));
  const t = Math.max(1, Math.floor(Number(tickMs)));
  const a = Math.floor(Number(atMs));
  if (!(a > n)) return n;
  return n + Math.ceil((a - n) / t) * t;
}

/* ── THE HUNT BODY ───────────────────────────────────────────────────────────
   ONE function prices a fight, and a fight is a HUNT SESSION (ruling
   HR-2026-10-14; the away combat path, Auto-Eat, Vigour, stances, the Retreat,
   the receipt, the charm / trophy / Boss-of-the-Day multipliers and companion
   XP were deleted outright with the closed rebuild, lane C2). The window is
   the session's own [settled_to, now), walked on its absolute swing clock with
   one HMAC-keyed seed per swing (./hunt-seed.js); the bag — not the inventory —
   supplies it, and the action bar is its only eater. Every value below is a
   PROPOSAL: hr_hunt_apply re-proves it under the character lock. */
function accrueHunt(inp, span, hunt) {
  const { grantMs, credit } = span;
  const hs0 = span.huntSession;
  const monsters = inp.monsters || {};
  /* THE SESSION'S KEYED SEEDER. Built once per settle; throws on a missing or
     malformed secret — an unseeded hunt swing is a predictable one. */
  const huntSeeder = swingSeederFor(String(inp.huntSecret ?? ''), hs0.id);
  const huntSwingFrom = hs0.swingIndex;
  /* THE PURSE an NPC basic supply is paid from (Tyler 2026-10-14): the
     character's gold as the server projected it at the window start; kill
     coins join it as they drop (combat-sim.js tallyFx). */
  hs0.purse = nat(inp.gold, 0);

  // ── (1) The simulation state. Field by field, from server rows. ──────────
  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);
  /* THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql); null = no column,
     and then no `xp_frac` key is proposed. */
  const xpFrac0 = normaliseXpFrac(inp.xpFrac);
  const items = inp.items || {};
  const equipment = inp.equipment || {};
  const eq = equipmentStats(equipment, items);
  const setBonus = armorSetBonus(equipment, items);
  const profile = deriveProfile(eq.weaponType);
  /* THE PLAYER'S CHOSEN STYLE, from server state (hr_set_style validated it).
     A COPY: normaliseStyleKeys mutates its argument. */
  const style = resolveStyle(eq.weaponType, normaliseStyleKeys({ ...(inp.combatStyle || {}) }));
  const maxHp = Math.max(1, nat(inp.maxHp, 10));

  /* THE FOE THE WINDOW OPENS ON. A training fight: the pointer itself. A named
     hunt: the carried fight's monster when it is one of THIS hunt's spawns
     (hr_apply's void re-checks it against hr_hunt_spawns), else one roll from
     the session's salted opening stream. A carried foe resumes at its carried
     HP, capped at the catalogue's. */
  const fight0 = normaliseFight(inp.fight);
  const openId = !hunt ? inp.activeId
    : (fight0 && huntSpawns(hunt, fight0.monster)) ? fight0.monster
      : pickSpawn(hunt.spawns, createRng((huntSeeder(huntSwingFrom) ^ HUNT_RNG_SALT) >>> 0));
  const resumed = (fight0 && fight0.monster === openId && monsters[openId] && fight0.hp > 0)
    ? { hp: Math.min(fight0.hp, Math.max(1, nat(monsters[openId].hp, 1))),
        maxHp: Math.max(1, nat(monsters[openId].hp, 1)), kills: fight0.kills }
    : null;

  const state = {
    activeMonster: openId,
    monsterHp: resumed ? resumed.hp : 0,
    monsterMaxHp: resumed ? resumed.maxHp : 0,
    playerHp: Math.min(maxHp, Math.max(0, nat(inp.hp, maxHp))),
    playerMaxHp: maxHp,
    gold: 0,                                 // a DELTA accumulator (hr_apply's gold is a delta)
    skills: { ...skills0 },                  // a COPY: grantXp mutates it
    xpFrac: xpFrac0 ? { ...xpFrac0 } : undefined,
    stats: {},
    combatKillsThisFoe: resumed ? resumed.kills : 0,
    /* The server's buff queue, measured at the session's FIRST SWING BOUNDARY
       (the span drains one interval per boundary, so the remaining time is
       wall-clock exact however the windows are cut — TICK-1). */
    buffs: buffQueueFromServer(inp.buffs, hs0.nextSwingAtMs),
    equipment,
    huntSession: hs0,
  };
  /* The queue a session may PERSIST must carry each stored segment's own start
     and scale back out (hr_hunt_buffs_put recognises an unchanged segment by its
     exact instants). */
  for (const b of state.buffs) {
    const row = (Array.isArray(inp.buffs) ? inp.buffs : []).find((r) => r && r.until === b.until
      && r.type === b.type && Number(r.magnitude) === b.magnitude);
    if (row) { b._from = row.from ?? null; b._scale = row.scale ?? null; }
  }

  // ── (2) The delta accumulators. ───────────────────────────────────────────
  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];
  /* THE LIVE INVENTORY VIEW the quiver reads (src/core/ammo.js readAmmo): the
     loaded stack plus every drop. A session's supplies come from its BAG, so
     this only feeds the ammo reader and the loot floor. */
  const bag = Object.create(null);
  for (const id in (inp.inventory || {})) {
    const q = Math.floor(nat(inp.inventory[id], 0));
    if (q > 0) bag[id] = q;
  }
  state.inventory = bag;
  /* THE DETERMINISTIC FRACTIONAL AMMO CARRY (design item E2); null = no column. */
  const ammoCarry0 = normaliseToolCarry(inp.ammoCarry);
  state.ammoCarry = { ...(ammoCarry0 || {}) };
  const bonus = bonusFor(inp.perks, liveBuffHost(() => state.buffs));
  const goals = makeGoalCounter();
  const bestiary = makeBestiaryCounter();
  const collection = makeCollectionCounter();

  /* THE RECOVERY LINE (an ABSOLUTE server instant; null = no column, and then
     no `recovering_until` key is proposed) and the two durable death counters
     the death rows state. */
  const recoverCol = inp.recoveringUntilMs !== null && typeof inp.recoveringUntilMs !== 'undefined';
  state.recoveringUntilMs = recoverCol ? nat(inp.recoveringUntilMs, 0) : 0;
  state.deathsTodayBefore = nat(inp.deathsTodayBefore, 0);
  state.deathsLifetimeBefore = nat(inp.deathsLifetimeBefore, 0);
  /* Was there a heal in the bag when the window opened? Stated on each death row. */
  const hadFood = Object.keys(hs0.bag).some((id) => SUPPLIES[id] && SUPPLIES[id].kind === 'heal' && hs0.bag[id].left > 0);

  const xpGained = Object.create(null);
  const finds = [];
  const fx = {
    /* XP through the SHARED grant (PACE, perks, the single floor). Max HP is
       RAISE-ONLY on a Hitpoints level (lane C2, the FX-4 root cause). */
    addXp(skillId, amt) {
      const before = Number(state.skills[skillId]) || 0;
      const res = grantXp(state, skillId, amt, { bonus, xpB: eq.xpB || 0, restedQuantum: 0, authored: false });
      const applied = (Number(state.skills[skillId]) || 0) - before;
      if (applied > 0) xpGained[skillId] = (xpGained[skillId] || 0) + applied;
      for (const ev of res.events) {
        if (ev.type === 'levelup' && ev.skill === 'hitpoints' && ev.to > state.playerMaxHp) state.playerMaxHp = ev.to;
      }
    },
    addItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      itemDelta[id] = (itemDelta[id] || 0) + n;
      bag[id] = (bag[id] || 0) + n;
      collection.record(id, n);
    },
    /* THE CONSUMPTION SINK (src/core/ammo.js spendForSwings). Draw-free; never
       proposes more than the live view holds. */
    removeItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      const have = Math.max(0, Math.floor(Number(bag[id]) || 0));
      const take = Math.min(n, have);
      if (take <= 0) return;
      bag[id] = have - take;
      if (bag[id] <= 0) delete bag[id];
      itemDelta[id] = (itemDelta[id] || 0) - take;
    },
    onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },
    /* THE HEARTHFIND: a CLAIM; hr_apply re-derives everything about it. */
    onHearthfind(f) { if (f && f.item) finds.push({ item: f.item, source_kind: f.kind, source_id: f.id }); },
    /* THE GOAL / BESTIARY COUNTERS, fed from resolveKill's two seams (kept
       separate: one aggregate, one per-monster count, never double-counted). */
    updateDaily(type, amt) { goals.daily(type, amt == null ? 1 : amt); },
    updateQuest(type, amt, meta) {
      goals.quest(type, amt == null ? 1 : amt);
      bestiary.record(type, amt == null ? 1 : amt, meta);
    },
  };

  // ── (3) The ctx. CONSTRUCTED FIELD BY FIELD — no caller object is spread
  //     into it, so `minTickMs` can never ride in and defeat the tick clamp. ──
  const tickMs = deriveTickMs(equipment, items, style);
  /* A Feast the bar fires is scaled by the same [1, 2] clamp hr_apply applies. */
  const huntBuffScale = Math.min(2, Math.max(1, 1 + (Number(bonus('buffDuration')) || 0)));
  /* THE WINDOW END. A press settle runs through the first boundary at or after
     the press (never past one interval beyond the server's now). */
  const huntToMs = (span.pressAtMs !== null && span.pressAtMs !== undefined)
    ? Math.min(firstBoundaryAtOrAfter(hs0.nextSwingAtMs, tickMs, span.pressAtMs) + 1, span.huntToMs + tickMs + 1)
    : span.huntToMs;
  const ctx = {
    fromMs: credit.fromMs,
    toMs: huntToMs,
    swingSeed: huntSeeder,
    buffScale: huntBuffScale,
    tickMs,
    rng: createRng(nat(inp.seed, 0)),
    monsters,
    ...(hunt ? { hunt } : {}),
    items,
    bonus,
    style,
    activeBuffCount: activeBuffs(state.buffs).length,
    playerRolls(m) {
      return playerCombatRolls(m, { eq, equipment, items, skills: state.skills, bonus, setBonus, profile, style });
    },
    monsterRolls(m) { return monsterCombatRolls(m, { eq, skills: state.skills, bonus }); },
    weakness(m) { return weaknessInfo(m, eq); },
    fx,
  };

  // ── (4) Run the ONE span (combat-sim.js simulateHuntSpan). ───────────────
  const summary = simulateSpan(state, ctx);

  // ── (5) The delta. Every value an INTEGER (hr_apply casts ::bigint). ──────
  const xpDelta = {};
  for (const k in xpGained) {
    const g = Math.floor(xpGained[k] || 0);
    if (g > 0) xpDelta[k] = g;
  }
  /* THE LEVEL-UPS ARE THE BANKED ONES: the persisted xp plus the proposal,
     less what this window's falls took back (hr_hunt_apply debits it on its
     own row). */
  const xpLostOf = summary.xpLost || {};
  for (const k in xpDelta) {
    const before = nat(skills0[k], 0);
    const from = levelFromXp(before);
    const to = levelFromXp(before + xpDelta[k] - (Number(xpLostOf[k]) || 0));
    for (let lv = from; lv < to; lv++) levelUps.push({ skill: k, from: lv, to: lv + 1 });
  }
  const goldDelta = Math.floor(state.gold || 0);

  /* THE ITEM DELTA IS SIGNED (drops up, arrows loosed down); hr_apply re-reads
     player_inventory under the lock and refuses have + delta < 0. Unknown ids
     are dropped and reported (one cut drop must not cost the window). A recipe
     scroll is an UNLOCK row, never an inventory row. */
  const items_ = {};
  let itemKinds = 0;
  const recipeOps = [];
  const startQty = (id) => Math.floor(nat((inp.inventory || {})[id], 0));
  for (const id in itemDelta) {
    if (!catalogueHas(items, id)) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    if (items[id] && items[id].recipe) {
      const got = Math.floor(itemDelta[id]);
      if (got > 0) recipeOps.push({ kind: 'flag', key: `recipe:${id}`, period: '', add: got, state: 'active' });
      continue;
    }
    const n = Math.floor(itemDelta[id]);
    if (n === 0) continue;
    if (n < 0 && startQty(id) + n < 0) {
      events.push({ type: 'overeat_clamped', item: id });
      const floored = -startQty(id);
      if (floored === 0) continue;
      items_[id] = floored;
    } else {
      items_[id] = n;
    }
    itemKinds++;
  }

  /* A window that walked no boundary and ended nothing settles nothing. */
  if (hs0.swingIndex === huntSwingFrom && !hs0.endedReason) {
    return { accrued: false, reason: SKIP.NOTHING, summary };
  }

  const stats = state.stats || {};
  const progress = [];
  for (const op of recipeOps) progress.push(op);
  const stat = (key, n) => { if (n > 0) progress.push({ kind: 'stat', key, period: '', add: Math.floor(n), state: 'active' }); };
  stat('kills', stats.kills);
  stat('crits', stats.crits);
  stat('deaths', stats.deaths);
  /* THE SECOND DEATHS ROW — the same integer under today's UTC period key. */
  const deathsN = Math.floor(Number(stats.deaths) || 0);
  const day = deathsN > 0 ? utcDayKey(credit.toMs) : null;
  if (day) progress.push({ kind: 'stat', key: 'deaths', period: day, add: deathsN, state: 'active' });
  stat('rare_drops', stats.rareDrops);
  for (const op of goalProgressOps(goals, credit.toMs, events)) progress.push(op);
  for (const op of modalGoalOps(credit.toMs,
        { rare_drops: stats.rareDrops, levelups: levelUps.length }, events)) progress.push(op);
  for (const op of bestiaryProgressOps(bestiary, events)) progress.push(op);
  for (const op of collectionProgressOps(collection, events)) progress.push(op);

  /* THE SESSION IS SETTLED THROUGH THE INTERVAL OF ITS LAST SWING: settled_to
     IS the next swing boundary, or one millisecond past the boundary the hunt
     ended on — the one instant every cut agrees on (STAMINA). */
  const settledTo = hs0.endedReason ? hs0.endedAtMs + 1 : Math.max(hs0.nextSwingAtMs, credit.fromMs + 1);
  const deferredMs = Math.max(0, credit.toMs - settledTo);

  const delta = {
    accrued_to: new Date(settledTo).toISOString(),
    hp: Math.max(0, Math.min(state.playerMaxHp, Math.floor(state.playerHp))),
    journal: {
      kind: 'combat',
      intent: 'accrue',
      /* AGGREGATE, never per-tick and never per-kill (game_events reached 1.6M
         rows / 229 MB from six players in four days by journalling every kill).
         One row per settle: the window, its swings, its kills (hr_hunt_apply
         re-proves them against the spawn cycle), the meals, the area and its
         kills by monster (`km`, summing to `kills`, priced by tier server-side). */
      meta: { ms: grantMs, ticks: summary.ticks, kills: summary.kills,
              ate: Math.floor(Number(summary.foodEaten) || 0), mon: String(inp.activeId).slice(0, 64),
              ...(hunt && summary.kills > 0 ? { km: bestiary.counts() } : {}),
              from: new Date(credit.fromMs).toISOString(),
              to: new Date(settledTo).toISOString() },
    },
  };
  if (goldDelta > 0) delta.gold = goldDelta;
  /* AT MOST ONE find per apply (hr_apply accepts one); a discarded second is
     COUNTED (`dropped`) and journalled by hr_apply, never silent. */
  if (inp.hearthfindReady && finds.length) {
    delta.hearthfind = finds.length > 1 ? { ...finds[0], dropped: Math.min(finds.length - 1, 99) } : finds[0];
  }
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
  if (xpFrac0) {
    const fr = xpFracChanges(xpFrac0, state.xpFrac);
    if (Object.keys(fr).length) delta.xp_frac = fr;
  }
  if (progress.length) delta.progress = progress;
  /* THE CHECKPOINT: a session's foe survives a window edge, knock-out included
     (standUp keeps facing it), checkpointed at full HP when downed. null input =
     no `fight` column, and the key is omitted. */
  if (fight0) {
    const m = state.activeMonster && monsters[state.activeMonster];
    delta.fight = m
      ? { monster: state.activeMonster,
          hp: (!hs0.down && Number.isFinite(state.monsterHp) && state.monsterHp > 0)
            ? Math.floor(state.monsterHp) : Math.max(1, Math.floor(nat(m.hp, 1))),
          kills: Math.max(0, Math.floor(state.combatKillsThisFoe || 0)) }
      : {};
  }
  if (ammoCarry0) delta.ammo_carry = roundCarry(state.ammoCarry);
  /* THE RECOVERY LINE, ABSOLUTE, always sent when the column exists (null = up). */
  if (recoverCol) {
    delta.recovering_until = state.recoveringUntilMs > 0 ? new Date(state.recoveringUntilMs).toISOString() : null;
  }
  /* ONE death row per fall (ladder-free: a hunt's knockout is the flat
     KNOCKOUT_MS, hr_hunt_apply refuses any other), stating the window-open
     counters plus the fall's position. */
  if (recoverCol && Array.isArray(summary.deathLog) && summary.deathLog.length) {
    delta.deaths = summary.deathLog.slice(0, MAX_DEATH_ROWS).map((d, i) => ({
      monster: String(d.monster || ''),
      recovery_ms: Math.max(0, Math.floor(Number(d.recoverMs) || 0)),
      deaths_today: state.deathsTodayBefore + i + 1,
      deaths_lifetime: state.deathsLifetimeBefore + i + 1,
      resume_hp: Math.max(0, Math.floor(Number(d.resumeHp) || 0)),
      food_in_bag: hadFood,
    }));
  }

  return {
    accrued: true,
    delta,
    grantMs,
    capped: false,
    tickMs,
    foodEaten: Math.floor(Number(summary.foodEaten) || 0),
    /* THE SESSION'S HALF: what hr_hunt_settle_session is asked to apply in the
       same transaction (the clock, the uses, the cooldowns, the presses left,
       the falls, the end, the pool, the shop, the spawn cycle). */
    hunt: huntProposal(hs0, huntSwingFrom, settledTo, summary),
    huntBuffs: huntBuffsOf(hs0, state.buffs, settledTo, inp.buffs, huntBuffScale),
    /* The max HP the window ENDED at (raise-only, FX-4) — for the guard. */
    maxHp: state.playerMaxHp,
    ...(hunt ? { huntKills: bestiary.counts() } : {}),
    watermark: delta.accrued_to,
    deferredMs,
    events,
    levelUps,
    summary: { ...summary, gold: goldDelta, xp: xpDelta, items: items_, levelUps },
  };
}

/* ── THE SESSION'S HALF OF A SETTLE (lane C2) ────────────────────────────────
   What `hr_hunt_settle_session` (2026-10-21-hunt-sessions.sql §5) is handed in
   the SAME transaction as the hr_apply delta. Every value is the span's own
   statement about THIS window; the applier re-proves each one from server state
   (swing CAS, window bounds, bag sufficiency, per-group use caps, presses only
   shrink, falls = the death rows hr_apply just wrote, every end re-derived).

   `to` IS THE WATERMARK accrueCombat settled to — the next swing boundary — so
   `next_swing_at` equals it on a running hunt and the applier's
   `v_next >= v_to` holds by construction; an ended hunt stops on its boundary.
   `uses` is the window's own tally (the session was copied with a zero tally),
   so the bag line the applier debits is exactly what the swings spent. The
   hints are TIMES ONLY (the applier clamps each into the window and derives the
   event itself); a rare-drop hint names an item it accepts only if this
   settle's own ledger rows looted it. */
function huntIso(ms) { return new Date(Math.floor(ms)).toISOString(); }
export function huntProposal(hs, swingFrom, settledToMs, summary) {
  const t = hs.tally || {};
  const uses = {};
  for (const id of Object.keys(t.supplies || {})) {
    const n = Math.floor(Number(t.supplies[id]) || 0);
    if (n > 0) uses[id] = n;
  }
  const hints = { slot_dry: {}, fall: [], rare_drop: [] };
  for (const e of (summary && Array.isArray(summary.huntEvents) ? summary.huntEvents : [])) {
    if (!e) continue;
    if (e.type === 'slot_dry' && e.item && !(e.item in hints.slot_dry)) hints.slot_dry[e.item] = Math.floor(e.atMs);
    else if (e.type === 'fall') hints.fall.push(Math.floor(e.atMs));
    else if (e.type === 'rare_drop' && e.item && hints.rare_drop.length < 10) {
      hints.rare_drop.push({ item: String(e.item), at: Math.floor(e.atMs) });
    }
  }
  const cooldowns = {};
  for (const g of ['heal', 'buff']) {
    const v = Math.floor(Number((hs.cooldowns || {})[g]) || 0);
    if (v > 0) cooldowns[g] = v;
  }
  const rawXp = {};
  for (const k of Object.keys(t.xp || {})) {
    const v = Number(t.xp[k]);
    if (Number.isFinite(v) && v > 0) rawXp[k] = Math.round(v * 1000) / 1000;
  }
  const next = Math.max(Math.floor(hs.nextSwingAtMs), Math.floor(settledToMs));
  return {
    swing_from: swingFrom,
    swing_to: hs.swingIndex,
    to: huntIso(settledToMs),
    next_swing_at: huntIso(next),
    uses,
    cooldowns,
    presses_left: (Array.isArray(hs.presses) ? hs.presses : [])
      .map((p) => (p && typeof p === 'object') ? Math.floor(Number(p.slot)) : Math.floor(Number(p))),
    falls: Math.max(0, Math.floor(Number(hs.falls) || 0)),
    down: !!hs.down,
    down_ms: Math.max(0, Math.floor(Number(t.downMs) || 0)),
    paid_ms: Math.max(0, Math.floor(Number(t.paidMs) || 0)),
    raw_xp: rawXp,
    hints,
    ended: hs.endedReason ? { reason: hs.endedReason, at: huntIso(hs.endedAtMs) } : null,
    /* WHAT THIS WINDOW BOUGHT FROM THE NPC (Tyler 2026-10-14), `{item: units}`.
       Units only: hr_hunt_apply prices every unit from ITS catalogue
       (hr_hunt_supplies.npc_price), caps them by the window, debits the gold
       and journals one `supply_buy` row (§5b). */
    buys: Object.fromEntries(Object.entries(t.bought || {})
      .map(([id, n]) => [id, Math.floor(Number(n) || 0)]).filter(([, n]) => n > 0)),
    /* WHAT THIS WINDOW SOLD TO COVER A SHOP CHARGE (master plan row 3),
       `{item: units}`: hr_hunt_apply re-prices each unit at the vendor's own
       price and bounds it by this session's loot still in the bag (§5b). */
    cover: Object.fromEntries(Object.entries(t.covered || {})
      .map(([id, n]) => [id, Math.floor(Number(n) || 0)]).filter(([, n]) => n > 0)),
    /* THE STAMINA POOL AT `to` (Tyler 2026-10-14), walked swing by swing from
       the database's own start value. hr_hunt_apply takes it off the proposal,
       re-bounds it against this window's paid / knocked-out time and the death
       rows' recovery, and writes it at `to` (§5a). Null only when the read had
       none, which the database refuses. */
    stamina: hs.staminaMs === null || hs.staminaMs === undefined ? null : Math.max(0, Math.floor(Number(hs.staminaMs))),
    /* THE SPAWN CYCLE AT `to` (Security design review 2026-10-14 items 1-2):
       the pull the engine ran (the server's), the foes of the current pull
       still standing, when the next pull is due, and how many pulls this
       window started. hr_hunt_apply takes it off the proposal, recomputes the
       pull under the lock and requires kills == left_old + size x pulls - left,
       pulls within the respawns the window admits, the pair moving forward. */
    pull: { size: hs.pull.size, respawn_ms: hs.pull.respawnMs, left: hs.pull.left,
      respawn_at: huntIso(hs.pull.respawnAtMs), pulls: hs.pull.pulls },
    /* THE PRICE OF EACH FALL (Tyler 2026-10-14), one `{skill: xp}` per death
       row this window proposes, in the same order and the same slice as
       `delta.deaths` — hr_hunt_apply takes it off the proposal before
       hr_hunt_settle_session sees it, re-checks every number against
       player_skills and hr_hunt_limit('death_xp_permille'), debits, journals
       one `death_xp` row and states it on each `fall` event. */
    death_xp: ((summary && Array.isArray(summary.deathLog)) ? summary.deathLog : [])
      .slice(0, MAX_DEATH_ROWS).map((d) => Object.assign({}, (d && d.xpLost) || {})),
  };
}

/* THE BUFF QUEUE A SESSION LEAVES BEHIND, in the server's absolute shape
   (`player_state.buffs`: {type, magnitude, until, from, scale}), or null when
   there is nothing to say: no stored segment and no buff line fired.
   CANONICAL, so N windows and one span leave the SAME row (TICK-1): whenever
   anything is stored or fired, the queue as it stands at the window end — live
   segments only — is written back. A stored segment keeps its stored instants
   VERBATIM (a manual eat's `until` carries microseconds the engine's
   millisecond clock cannot re-spell, and hr_hunt_buffs_put recognises an
   unchanged segment by its exact instants). Proposed, never trusted:
   hr_hunt_buffs_put admits a new or lengthened segment only when this window's
   own bag uses paid for it (2026-10-22-hunt-sessions-settle.sql §4). */
export function huntBuffsOf(hs, buffs, settledToMs, storedRows, newScale) {
  const sup = (hs.tally && hs.tally.supplies) || {};
  const usedBuff = Object.keys(sup).some((id) => SUPPLIES[id] && SUPPLIES[id].kind === 'buff' && sup[id] > 0);
  const stored = Array.isArray(storedRows) && storedRows.length > 0;
  if (!usedBuff && !stored) return null;
  const out = [];
  for (const b of Array.isArray(buffs) ? buffs : []) {
    if (!b || !(b.remainingMs > 0)) continue;
    const untilMs = typeof b.until === 'number' ? b.until : Date.parse(String(b.until));
    if (!Number.isFinite(untilMs) || untilMs <= settledToMs) continue;
    const seg = { type: b.type, magnitude: b.magnitude,
      until: typeof b.until === 'number' ? huntIso(b.until) : String(b.until) };
    const fromRaw = b.from !== undefined ? b.from : b._from;
    if (typeof fromRaw === 'number' && Number.isFinite(fromRaw) && fromRaw <= untilMs) seg.from = huntIso(fromRaw);
    else if (typeof fromRaw === 'string' && fromRaw) seg.from = fromRaw;
    /* A stored segment keeps its stamped scale (hr_state_of projects 1 for one
       written before the key existed); a segment the bar fired carries the
       scale it was bought at, as hr_apply's buff_apply stamps one. */
    const scale = b.scale !== undefined ? b.scale : (b._scale !== undefined && b._scale !== null ? b._scale : newScale);
    if (Number.isFinite(Number(scale)) && Number(scale) >= 1) seg.scale = Number(scale);
    out.push(seg);
  }
  out.sort((a, c) => (Date.parse(a.until) - Date.parse(c.until)));
  return out;
}

/* ── THE WINDOW, ON THE RECEIPT (Ruling 2) ──────────────────────────────────
   Stated, never inferred — the same rule the ruling puts on `blessed`, `died`
   and `crits`. Before the flip a renderer could subtract `awayMs` off `now` to
   get the credited hours and be right; it cannot any more, and a renderer that
   guesses will eventually quote hours the player was never paid for.

     awayMs    the CREDITED span            (windowFrom -> windowTo)
     paidMs    the span that actually EARNED (shorter when the run died or ran
               out of supplies — the client's b345 meaning, unchanged)
     unpaidMs  the forfeited tail: the cap, made a number
     windowFrom/windowTo  WHICH hours those were, which is what decides the
               Boss-of-the-Day segments and every timed effect

   ⚠ `awayMs` KEEPS ITS SHIPPED MEANING — the span that was credited, exactly
     as `emptySummary` in core and `lastOfflineSummary.awayMs` on the client
     have always used it. The whole absence is `awayMs + unpaidMs`; it is not
     given a field of its own, because a second meaning of `awayMs` across
     twenty renderers is a worse defect than the one this envelope closes.

   @param ranMs the earning span when the run stopped early; null otherwise */
function windowEnvelope(credit, ranMs) {
  const earned = (typeof ranMs === 'number' && isFinite(ranMs) && ranMs >= 0)
    ? Math.min(ranMs, credit.paidMs) : credit.paidMs;
  return {
    awayMs: credit.paidMs,
    paidMs: earned,
    unpaidMs: credit.unpaidMs,
    capped: credit.capped,
    windowFrom: credit.fromMs,
    windowTo: credit.toMs,
  };
}

/* ── THE SETTLED WATERMARK — WHERE `accrued_to` MAY ACTUALLY STAND ──────────
   MEASURED, 2026-09-16 (tests/settle-carry-loss.mjs): every accrual window
   forfeits the sub-tick remainder of the action that was in progress when it
   closed. `simulateSpan` budgets each segment as `seg.ms * rate + carryMs` and
   takes `floor(budget / tickMs)` ticks (combat-sim.js:689-691); `sliceSpan`
   does the identical thing per slice (skill-sim.js:332). Both open with
   `let carryMs = 0;`, so the remainder rides across a segment boundary INSIDE
   one call and dies at the call boundary. Meanwhile the delta advanced
   `accrued_to` to `now()` unconditionally — so the remainder was not deferred
   to the next window, it was DESTROYED. At the live 90 s attended cadence that
   is 1.3-1.7% of a combat session and up to 6.66% on a 7 s gathering node,
   every session, forever.

   The fix is the one the engine already uses for the rested bank: `accrueRested`
   advances `rested_at` by exactly the time it granted, never to `now()`
   (index.ts:1063). Here the same rule reads: advance to the last instant the
   simulation ACCOUNTED FOR, and leave the sub-tick tail open so the NEXT window
   re-simulates it.

   ⚠ THE ENGINES ARE NOT TOUCHED. `combat-sim.js` and `skill-sim.js` are
     SHA-pinned and repacked into this function by tools/pack-edge.mjs, and they
     are the SAME bytes the live client runs (AWAY-1). The remainder is
     recovered from the summary the engine already states, not by threading a
     carry through a second code path — so there is still exactly one engine and
     the away and attended halves stay byte-identical.

   `accounted` is the equality combat-sim.js:886 states outright
   (`paidMs + recoverMs + idleMs === awayMs`, modulo the remainder), expressed
   in the one unit every path has: whole ticks. `recoverMs` and `idleMs` are
   combat-only fields and read as 0 on the skill paths, which is correct — those
   paths have neither.

   ── THE FOUR REFUSALS, each of which would otherwise be a mint or a stall ──

   (a) CAPPED. An over-cap absence forfeits its excess ON PURPOSE — the b307
       per-absence rule ("signing in resets the timer"). Advancing only to the
       paid instant would let a 40-hour absence be collected as four full 12 h
       nights in a row, and a cap that can be drained in instalments is not a
       cap. A capped window therefore still stamps `now()`, exactly as before.

   (b) THE COLLECT. `caller === 'collect'` is set-activity.js's
       collect-before-switch, where the pointer is about to be REPLACED
       (`active_since = now()`). There is no later window to defer INTO, so
       deferring there is the b531 defect with the sign flipped: the remainder
       would be destroyed AND the pointer restamped. A collect settles to
       `now()`.

       ⚠ THIS IS THE ONLY CALLER IT APPLIES TO, and that is the 2026-09-18
         correction. It was keyed on `finalWindow`, whose documented meaning was
         "this window has no next CALL" — true of a collect, and also true of a
         10 s world-tick window, which is why the tick spike borrowed it. But
         the condition that actually matters is not "no next call", it is "no
         next WINDOW to defer into". The tick has one: its next window starts at
         the watermark this one stamps. Under the borrowed flag the tick forfeit
         its sub-action remainder every ten seconds (2.0% / 3.5% / 7.8% of a
         ten-minute span with alignment off, measured on the three parity
         fixtures), and was saved only by `alignWindow` zeroing the remainder.
         'tick' therefore falls through to the deferral below, exactly like
         'accrue'. See accrualCaller.

   (c) THE REMAINDER IS NOT A REMAINDER. A deferral is only ever the sub-tick
       carry, so `remainder < tickMs` is a REQUIREMENT, not an observation. When
       the simulation stopped early in a way the summary does not account for —
       a gathering node that ran out of supplies, a bench that hit its gate,
       any future stop with no `idleMs` — `grantMs - accounted` is a large
       number, and re-opening that span would re-simulate a stopped activity
       every window, forever. Above one tick the window stamps `now()` and the
       behaviour is byte-for-byte what shipped.

   (d) RETIRED with the attended top-up (lane C2): there are no consumed
       attended rows to floor the watermark at.

   AND ONE INVARIANT: the watermark must STRICTLY ADVANCE. `nowMs - (grantMs-1)`
   is `payFromMs + 1` at worst, which is above the old `accrued_to` by at least
   a millisecond, so a pathological `tickMs > grantMs` can never freeze the
   watermark and stall the character. It cannot bind at today's values (the
   floor is 60 s and no tick interval is near it) and it is not there for them.

   THE DIRECTION OF EVERY ERROR IS THE SAME. This function only ever returns a
   value in `[nowMs - grantMs + 1, nowMs]` — never past `now`, never at or below
   the old watermark. Relative to what ships today it can only move the watermark
   BACKWARDS, i.e. leave a window OPEN. An open window pays what the simulation
   computes for it on the next call; it cannot mint, because every span is priced
   from the watermark forward and nothing crosses a window boundary except the
   character's own state — which is unchanged over a sub-tick in which, by
   construction, no tick ran.

   @param span    { nowMs, grantMs, capped } — the shared window object
   @param summary the simulation's own report
   @param tickMs  the ACTION interval the span was priced at
   @param opts    { caller } — `caller` is the accrualCaller()
                  taxonomy; only 'collect' short-circuits to now(). An absent or
                  unrecognised caller DEFERS (the conservative direction).
   @returns the instant `accrued_to` should be stamped to, in ms
*/
export function settledWatermarkMs(span, summary, tickMs, opts) {
  const o = opts || {};
  const s = summary || {};
  const nowMs = nat(span && span.nowMs, 0);
  const grantMs = nat(span && span.grantMs, 0);
  const step = nat(tickMs, 0);
  if (span && span.capped === true) return nowMs;            // (a)
  if (o.caller === 'collect') return nowMs;                  // (b)
  if (!(step > 0) || !(grantMs > 0)) return nowMs;
  const accounted = nat(s.ticks, 0) * step + nat(s.recoverMs, 0) + nat(s.idleMs, 0);
  const remainder = grantMs - accounted;
  if (!(remainder > 0)) return nowMs;                        // nothing was left over
  if (remainder >= step) return nowMs;                       // (c)
  const floorMs = nowMs - (grantMs - 1);                     // strict advance
  /* ⚠ THE CEILING IS STATED, NOT INFERRED (Security review 2026-09-16, F1).
     The header above asserts this function "only ever returns a value in
     `[nowMs - grantMs + 1, nowMs]` — never past `now`". It did not: `nat()`
     does NOT floor (it accepts any finite non-negative Number), so a
     FRACTIONAL `grantMs` below 1 makes the strict-advance floor
     `nowMs - (grantMs - 1)` land ABOVE `nowMs`, and the function returns a
     watermark in the FUTURE. Fuzzed over 76,832 hostile input combinations:
     exactly one violation class, `{grantMs: 0.5, tickMs: 1}` → `nowMs + 0.5`.
     It is unreachable from today's callers — every term of
     `grantMs = min(elapsedMs, sinceActivityMs, capMs)` is integer ms and the
     accrue path additionally refuses anything below ACCRUE_MIN_MS — and
     `hr_apply`'s `least(now(), greatest(...))` would clamp it a second time.
     Both of those are properties of the CURRENT callers, not of this value,
     which is the same reasoning refusal (d) is closed by construction on. One
     `Math.min` makes the stated range true by construction instead of by the
     arithmetic of whoever calls next. tests/settle-carry-defer.mjs D9. */
  return Math.min(nowMs, Math.max(floorMs, nowMs - remainder));
}

/* ── THE TOOL CARRY, NORMALISED ─────────────────────────────────────────────
   `player_state.tool_carry` is jsonb the database CHECKs is an object, but it
   arrives here through a jsonb round trip where a bigint is a string and a
   NULL column is `null`. Every value is coerced into the half-open [0,1) the
   carry is defined on: `advanceToolCarry` banks `qty × rate` and pays out whole
   units, so a carry of 0.9 is legal and a carry of 900 would be a 900-item mint
   on the first action of the next span. Out-of-range, non-finite and negative
   values are DROPPED rather than clamped — a carry is worth less than one item
   and there is no honest way for it to be 900, so the only safe reading of a
   corrupt one is "start again".

   Returns null when the input is null/absent, and that null is load-bearing:
   see the `toolCarry` note in computeAccrual's contract. */
export function normaliseToolCarry(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const k in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n > 0 && n < 1) out[k] = n;
  }
  return out;
}

/* ── THE IN-FLIGHT FIGHT, NORMALISED (Phase 0, docs/design/live-settlement.md) ─
   `player_state.fight` is jsonb the database CHECKs is an object. Empty object
   = no fight in flight. A populated one is `{ monster, hp, kills }` — the state
   of the fight AT `accrued_to`, so the next span can resume it instead of
   restarting it.

   ⚠ WHY THIS EXISTS. Without it every span starts a FRESH monster at full HP,
     which means any target whose time-to-kill exceeds the span pays ZERO,
     forever, at every cadence. Measured (tools/probe-live-settle.mjs P3): a
     520 HP dragon against mediocre offence is ~488 ticks — about 20 minutes —
     for one kill. One 60-minute window pays 1 kill / 575 gold; sixty 60-second
     windows pay 0 kills / 0 gold / 0 XP. It is a total confiscation, not a
     rounding loss, and it is live TODAY on every set_activity collect.

   Returns null when the input is null/absent, and that null is load-bearing —
   exactly the `tool_carry` self-configuring switch: a database without the
   column yields null, the engine starts fresh and OMITS `fight` from the delta,
   because hr_apply refuses an unknown delta key and that refusal costs a whole
   window. There is no flag to forget to flip.

   A CORRUPT FIGHT READS AS NO FIGHT ({}), never as a repaired one. The only
   direction that can be wrong here is a small under-payment (one restarted
   fight); silently repairing an impossible value is how a compromised engine's
   bug becomes the server's opinion. hr_apply re-derives the ceiling from the
   catalogue anyway and REFUSES an out-of-range proposal — this is the engine's
   own promise, that is the database's verification of it. */
export function normaliseFight(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  const monster = raw.monster;
  if (typeof monster !== 'string' || !/^[a-z0-9_]{1,64}$/.test(monster)) return {};
  const hp = Number(raw.hp);
  if (!Number.isFinite(hp) || hp <= 0 || Math.floor(hp) !== hp) return {};
  const kills = Number(raw.kills);
  return {
    monster,
    hp,
    kills: (Number.isFinite(kills) && kills >= 0) ? Math.floor(kills) : 0,
  };
}

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
function accrueGather(inp, span) {
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
  /* COMPANION XP BASIS (armed writer, b550). The count of yield addItem calls — the
     exact seam wireAddItemForGather fires awardXpForRole('gather') on live. Not
     the summed qty: a double-yield is ONE addItem call and one companion award,
     the same on both sides. */
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
    /* ── THE DAILY / QUEST COUNTERS (b353) ───────────────────────────────
       `resolveGatherTick` calls `fx.updateDaily('gather', res.qty)` and
       `fx.updateQuest('gather', res.qty)` — the AMOUNT is the yield, not 1, so
       a tool double moves "Gather 50 resources" by 2 exactly as it does live.
       Passing `amt` through rather than assuming 1 is the same defect class as
       the b352 recipe-scroll `add: 1` the parity guard caught. */
    updateDaily(type, amt) { goals.daily(type, amt == null ? 1 : amt); },
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
  const recipeOps = [];
  for (const id in itemDelta) {
    /* Unknown ids are refused by hr_apply against the generated hr_items
       catalogue, which would reject the WHOLE delta — one renamed product id
       would cost a player their entire night. Filter here against the same
       authored data the catalogue is generated from, and report it. */
    if (!catalogueHas(items, id)) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    /* b352: a recipe scroll is an UNLOCK, not an inventory row — same rule as
       the combat builder above, `add` included; `flag` is in hr_apply's
       allowlist. No gather node drops a scroll today, so this arm is
       unreachable at runtime and is held to the combat arm by the structural
       census in tests/artisan-progress-model.mjs A10(v). */
    if (items[id] && items[id].recipe) {
      const got = Math.floor(itemDelta[id]);
      if (got > 0) {
        recipeOps.push({ kind: 'flag', key: `recipe:${id}`, period: '', add: got, state: 'active' });
      }
      continue;
    }
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
  const nothingHappened = itemKinds === 0 && Object.keys(xpDelta).length === 0 && summary.ticks === 0;
  if (nothingHappened && summary.stoppedBy !== STOP_REASON.LEVEL) {
    return { accrued: false, reason: SKIP.NOTHING, summary };
  }

  const stats = state.stats || {};
  const progress = [];
  for (const op of recipeOps) progress.push(op);   // b352: scroll drops become unlock rows
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
  /* THE MODAL-GOAL DAILY COUNTERS (b461). `perSkill` is core's own
     SKILL_ACTION_STAT value — 'chopped' | 'mined' | 'fished' — and the count
     is the SAME integer `stat(perSkill, …)` files five lines above, so the
     daily row and the lifetime row are one fact over two windows. A skill with
     no per-action stat (none today) contributes nothing rather than minting a
     key named `undefined`. */
  {
    const modal = { levelups: levelUps.length };
    if (perSkill) modal[perSkill] = stats[perSkill];
    for (const op of modalGoalOps(nowMs, modal, events)) progress.push(op);
  }

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
  if (summary.stoppedBy === STOP_REASON.LEVEL) delta.activity = { kind: 'idle', id: null };

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
function accrueArtisan(inp, span) {
  const { nowMs, grantMs, capped, credit } = span;

  const items = inp.items || {};
  const recipes = inp.recipes || {};
  const equipment = inp.equipment || {};
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
  /* COMPANION XP BASIS (armed writer, b550). The count of produce addItem calls —
     the exact seam wireAddItemForGather fires awardXpForRole('artisan') on for
     an active recipe. A burnt_food output goes through addItem too, so a burn
     counts on both sides; an input CONSUMED goes through removeItem, so it does
     not. */
  /* THE GOAL COUNTER (b353). Same module, same shapes, same clamp as the other
     two paths — one contract, not an artisan-flavoured copy of one. */
  const goals = makeGoalCounter();
  let stoppedInput = null;

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
      const have = Math.floor(nat(bag[id], 0));
      const take = Math.min(n, have);
      if (take <= 0) return;
      bag[id] = have - take;
      if (bag[id] <= 0) delete bag[id];
      itemDelta[id] = (itemDelta[id] || 0) - take;
    },
    /* `res.progress` is EMPTY on a burn — a "cook N dishes" goal counts
       successful cooks only (src/core/artisan.js BENCH_COUNTERS). The AMOUNT is
       1 per action, which is what resolveArtisanTick passes; passing it through
       rather than assuming is the same defect class as the b352 recipe-scroll
       `add: 1` the parity guard caught. */
    updateDaily(type, amt) { goals.daily(type, amt == null ? 1 : amt); },
    updateQuest(type, amt /* , meta */) { goals.quest(type, amt == null ? 1 : amt); },
    /* WHICH ingredient ran out, captured at the stop. The client has shown that
       line since b228 ("Out of Raw Shrimp — cooking stopped") and it is the
       single most useful sentence in a welcome-back summary; the span reports
       it too (`stoppedById`), and this handler exists so the two agree.
       `onBurn` is deliberately absent: a burn is already counted in
       `state.stats.burnt` and the summary, and a per-burn handler on a
       ~14,000-action night is the per-tick journalling this file's header
       forbids. */
    onStop(reason, skill, targetId, missing) { stoppedInput = missing || null; },
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
    maxActions: (inp.actionBudget === null || inp.actionBudget === undefined)
      ? null : Number(inp.actionBudget),
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
  const recipeOps = [];
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
  const startQty = (id) => Math.floor(nat((inp.inventory || {})[id], 0));
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
    /* b352: a recipe scroll is an UNLOCK, not an inventory row — the same rule
       both other builders apply, `add` included; `flag` is in hr_apply's
       allowlist. No authored recipe OUTPUTS a scroll today, so this arm is
       unreachable at runtime and is held to the combat arm by the structural
       census in tests/artisan-progress-model.mjs A10(v).
       ⚠ Only a positive delta becomes a flag. A scroll cannot be CONSUMED as a
         recipe input either (nothing authored does it), but if one ever were,
         proposing a negative `add` would be refused by hr_apply with the whole
         night attached — so it falls through to the item path, where the signed
         contract is the one that exists. */
    if (items[id] && items[id].recipe) {
      const got = Math.floor(itemDelta[id]);
      if (got > 0) {
        recipeOps.push({ kind: 'flag', key: `recipe:${id}`, period: '', add: got, state: 'active' });
      }
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
  const stopped = summary.stoppedBy === ARTISAN_STOP.SUPPLIES
                || summary.stoppedBy === ARTISAN_STOP.GATE;
  const nothingHappened = itemKinds === 0 && Object.keys(xpDelta).length === 0 && summary.ticks === 0;
  if (nothingHappened && !stopped) return { accrued: false, reason: SKIP.NOTHING, summary };

  const stats = state.stats || {};
  const progress = [];
  for (const op of recipeOps) progress.push(op);
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
  /* THE MODAL-GOAL DAILY COUNTERS (b461). The artisan bench produces no
     chopped/mined/fished/rare drops, so `levelups` is the only counter this
     path can move — one op, and only on a span that actually crossed a level.
     The bench's own dailies (cook / smith / craft) are already carried by
     goalProgressOps above as `ev:cooked` / `ev:smithed` / `ev:crafted`. */
  for (const op of modalGoalOps(nowMs, { levelups: levelUps.length }, events)) progress.push(op);

  /* THE SUB-STEP REMAINDER, DEFERRED RATHER THAN FORFEITED — the same call the
     gather path makes, over the same `sliceSpan` primitive (artisan-sim.js:355).
     A bench that ran out of inputs or hit its gate leaves `remainder >= stepMs`
     and refusal (c) stamps `now()`, so the `activity: idle` statement below is
     never re-opened. */
  const settledTo = settledWatermarkMs(span, summary, summary.intervalMs,
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
        stopped: summary.stoppedBy || null,
        out_of: stoppedInput,
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

/* The carry is a float and jsonb stores it exactly, but 17 significant digits
   per skill in a column read on every accrual is noise: nine decimals is ~1e-9
   of one item, the same epsilon `advanceToolCarry` already uses to decide a
   payout. Quantising at the boundary keeps the stored value readable and
   bounded without changing a payout — asserted, not assumed, by the CARRY
   ROUNDING block in tests/accrual-engine.mjs.
 *
 * ⚠ FLOOR, NEVER ROUND, AND THAT IS A BUG FIX RATHER THAN A PREFERENCE.
 *   `Math.round` was the first version and it is unsafe at exactly one place:
 *   the top of the range. A carry of 0.9999999999 is legal — the range is the
 *   half-open [0,1) — and `Math.round(0.9999999999 * 1e9) / 1e9` is **1**,
 *   which hr_apply refuses as `bad_tool_carry`. That refusal is not on
 *   index.ts's DEGRADABLE list, so it does not shorten the span, it 409s it:
 *   the engine would have proposed an impossible value and cost the player
 *   THE ENTIRE NIGHT. Every raw carry at or above 0.9999999995 hits it.
 *   Flooring cannot leave the range by construction, and it gives away at most
 *   1e-9 of one item — four orders of magnitude inside the payout epsilon.
 *   Found by an edge-case assertion, not by reading the code; the assertion
 *   (`a carry one epsilon under 1.0`) stays. */
function roundCarry(carry) {
  const out = {};
  for (const k in (carry || {})) {
    const n = Number(carry[k]);
    if (Number.isFinite(n) && n > 0 && n < 1) out[k] = Math.floor(n * 1e9) / 1e9;
  }
  return out;
}

/** Derived levels for the envelope, so the client never computes one. */
export function levelsOf(skills) {
  const out = {};
  for (const k in (skills || {})) out[k] = levelFromXp(Number(skills[k]) || 0);
  return out;
}

// ============================================================================
// THE HIRED-WORKER ACCRUAL — the settlement slice that lets the inventory flip
// arm. Read src/data/item-authority.js's "UNBACKED-OWNABLE-MINT LANDMINE" block
// and docs/design/worker-settlement.md before touching this.
//
// ── WHY IT IS NOT A KIND_ACCRUER ────────────────────────────────────────────
// Combat / gather / artisan are the ACTIVE POINTER: exactly one runs, priced
// tick-by-tick over [accrued_to, now()]. Worker production is a PARALLEL,
// CONTINUOUS activity — a hired crew gathers WHILE the player fights, or while
// they are idle, or away — so it has its OWN watermark, `workers_accrued_to`,
// and its own span. It runs ALONGSIDE the pointer accrual (index.ts), never
// through KIND_ACCRUERS, and index.ts must run it EVEN WHEN the pointer accrual
// refuses (idle / below-min / unsupported) — a pointer that owes nothing does
// not mean a crew that owes nothing. That decoupling is the whole slice.
//
// ── DETERMINISTIC BY CONSTRUCTION — NO RNG, SO away == live ─────────────────
// The yield is a pure arithmetic function of (crew, node catalogue, span). It
// draws NO random number — `avgQty` is the band midpoint, exactly as
// src/features/workers.js `accrueWorker` computes it — so a settle over a span
// is byte-identical whether the player was away for it or online for it. There
// is ONE worker settle path (this function); the client's setInterval loop
// becomes display-only prediction reconciled to the server envelope, so there
// is no second path to diverge, the same shape server-farming has.
//
// ── THE RATE TABLE IS src/features/workers.js, VERBATIM ─────────────────────
// BASE_EFF 0.10 + 0.008·(lvl-1), MAX_LVL 10, level = min(10, 1+floor(sqrt(
// xp/2000))), perTickMs = node.ms / eff, ticks = floor(span/perTickMs),
// avgQty = (qty[0]+qty[1])/2, qty = floor(ticks·avgQty), workerXp = floor(
// ticks·node.xp·0.5). This is an AUTHORITY move, not a balance change: the
// numbers are the CURRENT (post-b389) live client numbers, so the flip does not
// alter a single yield. (The change contract's `avgQty=floor(...)` is the one
// place it and workers.js disagree; workers.js's un-floored midpoint is used so
// the [1,2] nodes — e.g. maple_tree — keep their exact live yield. Flagged in
// the report; either is deterministic and safe.)
//
// ── THE CAP AND THE FLOOR ───────────────────────────────────────────────────
// Span is clamped to WORKER_ACCRUE_CAP_MS (24h), the same "workers rest without
// direction" rule the client enforces. Below the pointer's ACCRUE_MIN_MS the
// engine still settles workers (a crew ticks on its own clock, not the
// pointer's) — the only floor is `ticks > 0` per worker.
//
// ── SIGNED-DELTA / CATALOGUE HYGIENE ────────────────────────────────────────
// Every produced id is checked against the ITEMS catalogue (`catalogueHas`),
// exactly as accrueGather does, because hr_apply refuses the WHOLE delta on one
// unknown id and that would cost a crew its whole window. A worker can only ever
// be ASSIGNED a gather node (hr_worker_assign validates skill ∈ {woodcutting,
// mining, fishing} and the node id), so every produced id is a gather product —
// which is exactly why the client mint of these ids is the flip's arm-blocker.
//
// ── PER-WORKER FRACTIONAL CARRY — THE SHARED-WATERMARK FIX ───────────────────
// A single `workers_accrued_to` for a heterogeneous crew breaks a SLOW worker:
// once ANY worker produces (forcing the shared watermark to now()), a worker
// whose perTickMs exceeds the settle cadence has its accumulated-but-un-settled
// time discarded, and — settled frequently enough — produces NOTHING, ever. The
// tool_carry fix applies: each worker carries its leftover time (`acc_ms`) across
// settles, so no fraction of a tick is lost.
//
// TWO RULES MAKE IT EXACT AND SAFE:
//   1. A settle that produces NOTHING (all workers sub-tick) does NOT advance the
//      watermark and writes nothing — the un-advanced watermark preserves every
//      worker's time for free, so `acc_ms` is only ever needed to bridge the
//      settles a FASTER worker forces. This is why a pure-slow crew never loses
//      time even without the carry, and why the carry is the answer only for the
//      MIXED-speed case.
//   2. When a settle DOES produce, EVERY assigned worker's new `acc_ms` is
//      persisted against the advanced watermark, so the slow worker's remainder
//      rides forward instead of being discarded.
//
// ── THE ANCHOR (b497) ───────────────────────────────────────────────────────
// A worker's tick is `workerAnchorMs(node.ms) / eff`, and the anchor is the
// PACED action interval — what an active player actually takes at that node —
// NOT the raw `node.ms`. This engine divided the un-paced number for four
// builds, which paid every crew PACE.actionMs (1.60x) more than the b389
// rebalance said it did. The formula, the efficiency curve and the constants now
// live in src/core/workers.js and are imported by BOTH engines; see that file's
// header for the measurement and for why the player's own perks/tools are
// deliberately not in the anchor.
//
// EXACTNESS — away == live byte-identical. `eff` is EXACTLY rational with
// denominator 1000: eff = (100 + 8·(lvl-1)) / 1000, and the anchor is an INTEGER
// number of ms (pacedActionMs floors). So perTickMs = anchorMs·1000/E with
// E = 100+8·(lvl-1) an integer, and the whole-ticks / leftover split is exact
// integer arithmetic (no float remainder to drift). For a worker at a FIXED level
// (E constant) one 24h settle and N small settles produce byte-identical totals —
// proven in tests/worker-accrual.mjs. (For a worker CROSSING a level boundary the
// two genuinely differ, exactly as the pre-flip client's online vs offline did,
// because eff changes mid-span; that is a property of the rate curve, not a bug.)
//
// ── THE DEPLOY BOUNDARY (a rate change with money in the bank) ───────────────
// `acc_ms` is banked TIME, not banked output, and the anchor only ever makes a
// tick LONGER. A carry written under the old anchor is < oldPerTick < newPerTick,
// so on the first settle after the deploy it still buys strictly less than one
// tick: no burst, and nothing is confiscated either (the time is re-priced, not
// dropped). Proven in tests/worker-accrual.mjs W12 rather than argued here.
// ============================================================================
/* RE-EXPORTED, NOT REDEFINED. index.ts and tests/worker-accrual.mjs import these
   names from this module; they resolve to src/core/workers.js, so there is one
   definition and no mirror to drift. */
export {
  WORKER_BASE_EFF, WORKER_EFF_PER_LVL, WORKER_MAX_LVL,
  WORKER_ACCRUE_CAP_MS, WORKER_MAX_ACC_MS,
  workerLevel, workerEff, workerEffE, workerAnchorMs,
};

/**
 * Settle a hired crew over [workers_accrued_to, now()].
 *
 * @param input  every field is SERVER-owned. Nothing here may originate in a
 *               request body — the crew and its assignments are written only by
 *               hr_worker_hire / hr_worker_assign, the node catalogue is
 *               authored data, and the clock is `now()`.
 *   nowMs               the SERVER clock
 *   workersAccruedToMs  player_state.workers_accrued_to (null/absent → nowMs,
 *                       i.e. a brand-new column settles nothing on the first pass
 *                       — the self-configuring switch tool_carry/fight use)
 *   crew                [{ uid, skill, target_id, xp }] from player_workers
 *   nodes               the GATHER INDEX — GATHER_NODES, `{ id: {skill, node} }`,
 *                       null-prototype (indexGatherNodes). The SAME index
 *                       accrueGather reads, so a worker and a live gatherer price
 *                       one node identically.
 *   items               the ITEMS catalogue (unknown-id hygiene)
 *
 * @returns { accrued:false, reason } when nothing was produced (no crew, no
 *          span, or every worker idle/sub-tick) — index.ts then advances no
 *          worker watermark, so the window is deferred, never confiscated —
 *          OR { accrued:true, items, workers, summary } where:
 *            items    `{ id: +qty }`  (POSITIVE only — a crew never debits)
 *            workers  `{ uid: { xp: +n } }`  per-worker, NEVER player xp
 *            summary  aggregate scalars for the ledger meta (never per-tick)
 */
export function accrueWorkers(input) {
  const inp = input || {};
  const nowMs = nat(inp.nowMs, 0);
  const fromMs = nat(inp.workersAccruedToMs, nowMs);
  const crew = Array.isArray(inp.crew) ? inp.crew : [];
  const nodes = inp.nodes || {};
  const items = inp.items || {};

  if (!crew.length) return { accrued: false, reason: 'no_crew' };
  const baseMs = Math.min(Math.max(0, nowMs - fromMs), WORKER_ACCRUE_CAP_MS);
  if (baseMs <= 0) return { accrued: false, reason: 'no_span' };

  const itemDelta = Object.create(null);
  // Per-worker OUTPUT of this settle. Every ASSIGNED worker gets an entry (its
  // new carry `acc_ms`); `xp` is present only when it earned some. The entry is
  // only ACTED ON (written) if the settle as a whole produced — see `produced`.
  const workerOut = Object.create(null);
  let itemKinds = 0;
  let totalQty = 0;
  let workingCount = 0;
  let produced = false;
  let paidSpanMs = 0;
  // R1 (2026-09-08 security review): wrong-order visibility. See the warn below.
  let missingHiredAt = 0;

  for (const w of crew) {
    if (!w || typeof w.uid !== 'string' || !/^[a-z0-9_]{1,64}$/.test(w.uid)) continue;
    // OWN-PROPERTY lookup on the null-prototype index (see accrueGather). An
    // idle worker (no target) or an inconsistent assignment (skill ≠ the node's
    // skill) produces NOTHING and carries NOTHING — never a mispriced haul.
    if (!w.target_id || !catalogueHas(nodes, w.target_id)) continue;
    const entry = nodes[w.target_id];
    if (!entry || !entry.node || !w.skill || entry.skill !== w.skill) continue;
    const node = entry.node;
    const ms = nat(node.ms, 0);
    if (!(ms > 0)) continue;

    /* ── A WORKER IS NEVER PAID FOR TIME BEFORE IT EXISTED (2026-09-08, P0) ──
       `workers_accrued_to` is a SHARED watermark that rule 1 above deliberately
       does NOT advance on a settle that produced nothing — and a character with
       NO crew produces nothing, for as long as they have no crew. So the
       watermark sits at wherever it was last left (character creation, for a
       player who never hired) while the calendar runs, and the FIRST settle
       after the first hire pays the whole backlog, clamped only by the 24h cap.

       MEASURED LIVE (QA 0a47ba77, slot 2, 2026-09-09 03:06:57Z, b527): Aldric
       was hired at 03:00:33 and the very next accrue — a 440,102 ms window —
       journaled 1,891 copper_ore. 91 of those were the player's own gathering
       (440,102 / 4,800 ms); the other 1,800 were this function paying a
       six-minute-old worker a full 24 hours at copper_rock (86,400,000 ms /
       48,000 ms per tick). The mint is self-confirming: 1,800 ticks credited
       the worker 18,900 xp, which is level 4, and every subsequent worker row
       lands at 38.7 s — exactly the level-4 tick this settle created.
       It is NOT a one-off, and it is not an exploit that needs a fire/re-hire
       (there is no dismiss RPC and no client write path: hr_worker_hire is the
       only writer on this table). The repeat vectors are ORDINARY PLAY:
         (a) EVERY character's first hire made 24h or more after the character
             was created — the common case, and the one measured above;
         (b) a hire into a FRESH SLOT on an old account, same arithmetic;
         (c) the WHOLE crew left idle (a producing member advances the shared
             watermark for the parked ones, so it takes all of them) and then
             re-assigned — the second half, which hired_at does NOT close and
             which needs `assigned_at` (its own lane-C item).

       The fix is the honest floor, and it is PER WORKER because the watermark
       is shared and a crew is heterogeneous: this worker's payable window opens
       at `hired_at`, never before. A worker hired mid-window is paid the part
       of the window it was alive for, so nothing legitimate is confiscated.

       FAIL CLOSED ON A MISSING `hired_at`, which is the opposite of the
       tool_carry self-configuring switch and deliberately so: the "absent =
       previous behaviour" default IS the mint. `hired_at` is projected by
       hr_state_of as of 2026-09-12-worker-hired-at-projection.sql, so THAT
       MIGRATION MUST BE APPLIED BEFORE THIS ENGINE IS DEPLOYED. If it is not,
       every worker's span is zero and the crew under-pays (its `acc_ms` is
       preserved, so only the un-settled span is lost) — an outage a redeploy
       fixes, rather than a faucet a wipe fixes. */
    const hiredAtMs = Number(w.hired_at ? Date.parse(String(w.hired_at)) : NaN);
    if (!Number.isFinite(hiredAtMs)) missingHiredAt++;
    const payFromMs = Number.isFinite(hiredAtMs) ? Math.max(fromMs, hiredAtMs) : nowMs;
    const spanMs = Math.min(Math.max(0, nowMs - payFromMs), WORKER_ACCRUE_CAP_MS);

    // EXACT-ARITHMETIC TICK SPLIT. eff = E/1000 with E an integer and the anchor
    // is integer ms, so perTickMs = anchorMs·1000/E and the whole-tick / leftover
    // split is done in INTEGER units of (ms·E) — no float remainder to drift, so N
    // small settles and one big settle land on the SAME tick boundaries for a
    // constant-eff worker (W8). The carry is stored as milliseconds
    // (leftoverScaled/E) as a float8; re-reading it and multiplying by E recovers
    // the exact integer remainder, because the value is an integer/E and float8
    // round-trips it well inside 0.5. The carry read from the row is clamped
    // defensively (hr_apply already refuses an out-of-range write).
    const E = workerEffE(w.xp);
    const accMs = Math.min(Math.max(0, Number(w.acc_ms) || 0), WORKER_MAX_ACC_MS);
    /* THE ANCHOR — the PACED interval an active player takes at this node, not
       the raw catalogue `ms`. src/core/workers.js owns the formula and the
       client reads the same function, so a display and this settle cannot
       disagree. Integer, so the split below stays exact. */
    const divScaled = workerAnchorMs(ms) * 1000;       // perTick in (ms·E) units
    const carryScaled = Math.round(accMs * E);         // exact remainder, (ms·E) units
    const nScaled = spanMs * E + carryScaled;          // total available, (ms·E) units
    const ticks = Math.floor(nScaled / divScaled);
    const remScaled = nScaled - ticks * divScaled;     // leftover, (ms·E) units, < divScaled
    const newAccMs = remScaled / E;                    // back to ms (the stored carry)
    const out = { acc_ms: newAccMs > 0 ? newAccMs : 0 };

    if (ticks > 0) {
      workingCount++;
      if (spanMs > paidSpanMs) paidSpanMs = spanMs;
      // avgQty = the band MIDPOINT, un-floored (workers.js), so [1,2] nodes keep
      // their exact live yield — a deliberate parity decision, not a rebalance.
      const q0 = nat(node.qty && node.qty[0], 0);
      const q1 = nat(node.qty && node.qty[1], 0);
      const avgQty = (q0 + q1) / 2;
      const qty = Math.max(0, Math.floor(ticks * avgQty));
      const prod = node.prod;
      if (qty > 0 && prod && catalogueHas(items, prod)) {
        itemDelta[prod] = (itemDelta[prod] || 0) + qty;
        totalQty += qty;
        produced = true;
      }
      // WORKER XP — per-worker, never player xp, never a skill row (workers.js).
      const xpGain = Math.floor(ticks * nat(node.xp, 0) * 0.5);
      if (xpGain > 0) { out.xp = xpGain; produced = true; }
    }
    workerOut[w.uid] = out;
  }

  /* R1 — WRONG-ORDER VISIBILITY (2026-09-08 security review). The fail-closed
     branch above is safe (it defers, it never mints) but it is SILENT: neither
     the payload guard nor apply-order-honesty can see "engine deployed,
     projection absent", and the only downstream signal is `vitals` workers
     falling to zero a day later. One line per settle, not per worker, so a
     six-worker crew cannot spam the function log. */
  if (missingHiredAt > 0 && typeof console !== 'undefined' && console && console.warn) {
    console.warn('accrueWorkers: ' + missingHiredAt + ' assigned crew row(s) carry no hired_at — '
      + 'they are paid NOTHING this settle (fail-closed). Apply '
      + '2026-09-12-worker-hired-at-projection.sql; the deferred span is refunded on the next '
      + 'settle once hr_state_of projects it.');
  }

  for (const id in itemDelta) itemKinds++;

  // NO PRODUCTION (every assigned worker still sub-tick) → DEFER. The watermark
  // is NOT advanced and NOTHING is written, so every worker's time is preserved
  // for free by the un-advanced watermark — the carry is only ever needed to
  // bridge the settles a FASTER worker forces (see the header). index.ts omits
  // the whole delta on this branch.
  // 2026-08-31: SKIP.NOTHING, not the bare literal — 'nothing_accrued' IS the
  // partition's vocabulary (SAFE_SKIP_REASONS lists it), and a literal spelling
  // of a partition word is exactly how `no_cap` escaped it for four builds
  // (activity-intent A17, which now runs and enforces this).
  if (!produced) return { accrued: false, reason: SKIP.NOTHING };

  const items_ = {};
  for (const id in itemDelta) items_[id] = itemDelta[id];

  return {
    accrued: true,
    items: items_,
    // Every ASSIGNED worker's new carry (and xp where earned) is persisted, so
    // the slow worker's remainder rides forward past this producing settle.
    workers: workerOut,
    summary: {
      /* THE SPAN THAT WAS ACTUALLY PAID, which is the LONGEST per-worker window
         and no longer the shared one: since the hired_at floor a worker hired
         inside this window is paid less than `baseMs`, and a journal that kept
         quoting `baseMs` would be describing time the crew was not paid for. */
      spanMs: paidSpanMs, itemKinds, qty: totalQty, workers: workingCount,
      capped: (nowMs - fromMs) > baseMs,
    },
  };
}
