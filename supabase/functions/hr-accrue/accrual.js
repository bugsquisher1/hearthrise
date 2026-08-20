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
import { resolveAutoEat, thresholdFromPct } from '../../../src/core/auto-eat.js';
import { killBonusesFor } from '../../../src/core/botd.js';
/* WHICH hours of an over-cap absence are credited. One definition, imported by
   both the server and (through core-bridge) the client — the flip from
   last-window to first-window crediting is a property of the away model, not a
   line of arithmetic each side gets to write for itself. */
import { creditWindow } from '../../../src/core/away.js';
import { createRng } from '../../../src/core/rng.js';
import { grantXp } from '../../../src/core/progression.js';
import { resolveStyle } from '../../../src/core/styles.js';
import { levelFromXp } from '../../../src/core/xp.js';
/* THE PERMANENT PERK CHANNEL — the same module src/legacy.js getBonus is layer
   0 of. `makeBonus(perkState)` replaces `zeroBonus` at every site below. */
import { makeBonus, EMPTY_PERKS } from '../../../src/core/perks.js';
/* LAYER 1 — the equipped companion's passive bonus, summed on top of the fused
   layer 0 by bonusFor below. Pure, draw-free, permanent-scope. */
import { companionBonus } from '../../../src/core/companion-perk.js';
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
} from '../../../src/core/goals.js';
/* The ONE catalogue-lookup guard in this payload. See its definition for why a
   truthiness test on a `[a-z0-9_]` id is not one. ./intents.js imports nothing,
   so this cannot cycle. */
import { catalogueHas } from './intents.js';

/* The floor on an accrual. Below this nothing is simulated and — unlike the
   client, which advances its watermark regardless (legacy.js:987) — NOTHING IS
   WRITTEN. The client had to advance, because its watermark was also its
   "have I already paid this?" record. The server's watermark is `accrued_to`,
   and leaving it alone simply means the next call sees a slightly longer span.
   That is strictly better: the client's behaviour quietly confiscates every
   sub-threshold absence, and the server has no reason to inherit that. */
export const ACCRUE_MIN_MS = 60000;

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

   ⚠ ONE BENCH OF THE FOUR IS STILL HELD BACK, AND IT IS HELD BACK BY A
     PROPERTY RATHER THAN BY ITS NAME. Reading a Kitchen rung is not owning it:
     `src/legacy.js upgradeRoom()` still writes `G.rooms` locally, `hr_unlock_buy`
     has no client call site, and `rooms` is not on SERVER_OF_RECORD — so the two
     copies agree only because the cutover import copied one into the other once,
     and diverge at the first rung bought after it. For every other perk that
     divergence under-pays a bonus; for `noBurn` it turns the recipe's INPUT into
     `burnt_food`. `benchPayable` in src/core/artisan-sim.js is that rule, and
     `SERVER_OWNED_BONUS_KEYS` is the one line that opens it. §9(3) of
     2026-08-16-artisan-progress-model.sql authorises exactly this shape.

   ⚠ AND `PAYABLE_KINDS` IS THE WRONG PLACE TO EXPRESS IT. Removing `artisan`
     from this array would take the other 261 recipes down with it AND make
     cooking un-settable-but-silent again; instead the intent refuses an
     unpayable BENCH on shape (set-activity.js) and the engine answers a pointer
     that somehow holds one with `unpayable_bench`, which DEFERS. Kind-level
     coarseness is how "cooking is not ready" would have become "artisan pays
     nothing", which is where this whole item started. */
export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan']);

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
export function bonusFor(perkState) {
  const base = makeBonus(perkState || EMPTY_PERKS);
  const comp = companionBonus(perkState || EMPTY_PERKS);
  return (key) => base(key) + comp(key);
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
 *   autoEatEnabled  player_state.auto_eat_enabled — the purchased-trait
 *                receipt. FALSE by default and false for every character until
 *                hr_set_auto_eat is called, so this handler is inert rather
 *                than generous on the day it ships.
 *   autoEatFood  player_state.auto_eat_food — the nominated Provision, or null
 *   autoEatPct   player_state.auto_eat_pct — integer percent, 0..100
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
 *   enchant      player_state.enchant — the server-owned weapon enchant,
 *                `{ <equip_slot>: <element> }` from hr_state_of, or `{}` when
 *                the column is absent. A READ-ONLY input to
 *                `equipmentStats(equipment, items, enchant)`: it changes how the
 *                fight resolves (the weapon's element vs the monster's weakness)
 *                but NO delta key is derived from it, so unlike toolCarry/fight
 *                an absent value is simply `{}` with no self-configuring switch.
 *                Written only by the `enchant` intent, never a client value.
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
  /* OWN-PROPERTY, never truthiness. `activeId` is bounded by
     /^[a-z0-9_]{1,64}$/ at the request layer — which matches `constructor` and
     `__proto__`, both of which are truthy on any plain object. See catalogueHas
     in ./intents.js for the measurement and for why it stops being harmless the
     moment a lookup is followed by a property read.
     (The gather index is null-prototype, so its own lookup needs no such
     guard — see `indexGatherNodes`. It is checked through the same helper
     anyway, because one reader is one rule.) */
  if (inp.activeKind === 'combat' && !catalogueHas(monsters, inp.activeId)) {
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
  const elapsedMs = Math.max(0, nowMs - accruedToMs);
  const sinceActivityMs = Math.max(0, nowMs - sinceMs);
  const grantMs = Math.min(elapsedMs, sinceActivityMs, capMs);

  if (!(capMs > 0)) return { accrued: false, reason: SKIP.NO_CAP };
  if (grantMs < ACCRUE_MIN_MS) return { accrued: false, reason: SKIP.TOO_SOON };
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
    watermarkMs: accruedToMs, activeSinceMs: sinceMs, nowMs, grantMs,
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
  if (inp.activeKind !== 'combat') return { accrued: false, reason: SKIP.UNSUPPORTED };

  // ── (2) The simulation state. Field by field, from server rows. ──────────
  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);

  const items = inp.items || {};
  const equipment = inp.equipment || {};
  /* ELEMENTS v1: `eq` is built from equipment PLUS the server-owned enchant
     state, so `weakness(m)` below (weaknessInfo(m, eq)) sees the weapon's
     element on the AWAY path exactly as the live tick does. ONE eq, one
     weakness calc — there is no second element resolution. `equipmentStats`
     takes the enchant as its third argument (src/core/combat.js); an older core
     that ignores it degrades to the pre-ELEMENTS behaviour, and an absent enchant
     is `{}`. Never a client value — `inp.enchant` is read from hr_state_of. */
  const eq = equipmentStats(equipment, items, inp.enchant || {});
  const setBonus = armorSetBonus(equipment, items);
  const profile = deriveProfile(eq.weaponType);
  /* The player's chosen style is NOT server state yet (there is no column and
     no intent that sets it), so the server uses the default for the equipped
     weapon family. See "Known limitations" in the change contract — this
     changes XP ROUTING (Accurate trains Attack, Aggressive trains Strength),
     never the total, and it closes when a set_style intent exists. */
  const style = resolveStyle(eq.weaponType, null);

  const maxHp = Math.max(1, nat(inp.maxHp, 10));

  /* ── THE CHECKPOINT (Phase 0) ────────────────────────────────────────────
     `fight0` is the fight that was in flight at `accrued_to`. `null` means this
     database has no `fight` column and the engine must not propose the key at
     all (see normaliseFight). `{}` means there was no fight.

     THE GUARD IS `fight.monster === activeId`, and it FAILS CLOSED: a carried
     fight that does not name the target the pointer names starts fresh. The
     only direction a mismatch can be wrong in is a small under-payment (one
     restarted fight), and the direction it must never be wrong in — resuming a
     half-dead monster the character is no longer fighting — is exactly the
     "bank a nearly-dead boss" exploit. hr_apply enforces the same agreement
     against the row it is writing, from the OTHER side of the hop, and voids
     the whole triple on any `activity` delta; neither check is load-bearing
     alone. See §2.2 of docs/design/live-settlement.md.

     `monsterMaxHp` is re-derived from the CATALOGUE, never carried: it is a
     property of the monster, not of the fight, and carrying it would make a
     forged max the divisor of every later clamp. `monsterHp` is additionally
     capped at it here, so even a proposal hr_apply somehow admitted cannot
     start a fight with more HP than the monster has.

     `combatKillsThisFoe` is carried because it is the same fact the client's
     kill-streak readout shows (legacy.js:8742) and a settle must not reset it.
     ⚠ STATED HONESTLY: it drives NOTHING inside the simulation today —
       resolveKill increments it and nothing reads it. It is carried so the
       counter survives the cutover to server-of-record, not because a number
       changes. */
  const fight0 = normaliseFight(inp.fight);
  const resumed = (fight0 && fight0.monster === inp.activeId
                   && monsters[inp.activeId] && fight0.hp > 0)
    ? { hp: Math.min(fight0.hp, Math.max(1, nat(monsters[inp.activeId].hp, 1))),
        maxHp: Math.max(1, nat(monsters[inp.activeId].hp, 1)),
        kills: fight0.kills }
    : null;

  const state = {
    activeMonster: inp.activeId,
    /* 0/0 when there is nothing to resume — repaired to a FULL monster by
       simulateSpan, which is byte-for-byte the pre-Phase-0 behaviour and the
       reason the AWAY-1 parity fixtures still cover the bytes they were
       written against. A resumed fight is the SAME simulation started from a
       checkpoint; it is not a second code path. */
    monsterHp: resumed ? resumed.hp : 0,
    monsterMaxHp: resumed ? resumed.maxHp : 0,
    playerHp: Math.min(maxHp, Math.max(0, nat(inp.hp, maxHp))),
    playerMaxHp: maxHp,
    gold: 0,                                 // a DELTA accumulator, see below
    /* A COPY. `grantXp` mutates `state.skills` in place, so handing it
       `skills0` itself would make the "before" and the "after" the same object
       and every XP delta below would compute as zero — a silent, total loss of
       every skill grant in an absence, with kills, gold and drops all still
       correct so nothing looks wrong. Found by the parity test; it is exactly
       the always-null-probe shape this program has been bitten by four times. */
    skills: { ...skills0 },
    stats: {},
    combatKillsThisFoe: resumed ? resumed.kills : 0,
  };
  /* `state.gold` starts at ZERO rather than at the player's balance. resolveKill
     does `state.gold = state.gold + gp`, so it accumulates the delta directly —
     and hr_apply's `gold` key is a DELTA, not an absolute. Seeding it with the
     real balance and subtracting afterwards would work too, but it would put a
     player's whole fortune inside a simulation that has no reason to know it,
     and one careless `= ` instead of `+=` downstream would then send an
     absolute to a contract expecting a delta. Start at zero and the mistake is
     unreachable. */

  // ── (3) The delta accumulators, fed by the effect sink. ──────────────────
  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];

  /* THE LIVE BAG. A running view of what the character owns DURING the
     absence, not just what they gained: `startInv + everything addItem has
     credited - everything autoEat has consumed`.

     It has to be live rather than a snapshot for one reason the parity test
     pins: the client's maybeAutoEat reads `G.inventory`, which `addItem`
     mutates, so a Cooked Shark that DROPS at hour two is edible at hour three.
     A server that ate only from the starting stack would diverge from the
     client on exactly the long absences where it matters most.

     Quantities are coerced through nat() because they arrive from a jsonb
     round trip, where a bigint is a string. `'5000' - 1` is 4999 in JS but
     `'5000' > 0` and `Number('5000')` are the only forms that survive being
     compared and decremented, so the coercion is not decoration. */
  const bag = Object.create(null);
  for (const id in (inp.inventory || {})) {
    const q = Math.floor(nat(inp.inventory[id], 0));
    if (q > 0) bag[id] = q;
  }

  /* THE PURCHASED-TRAIT GATE, and it fails CLOSED.
     Auto-Eat costs 100 Bounty Marks in the Store and the client refuses to eat
     without `G.traits.auto_eat` (auto-actions.js). `player_state.auto_eat_enabled`
     can only be set true by hr_set_auto_eat, which requires the server-side
     ownership flag — so the column IS the receipt that the trait was owned when
     it was switched on. Reading it here rather than re-deriving ownership from
     the progress envelope is deliberate: that envelope is LIMIT-ed (hr_state_of
     caps the progress read at 1000 rows and reports `progress_truncated`), and a
     survival mechanic must never depend on a read that can be truncated. One
     non-truncatable column on the row hr_apply already locks. */
  /* ONE input, not two. `resolveAutoEat` takes `enabled` and `owned`
     separately because the CLIENT genuinely holds two facts —
     `G.autoActions.eat.enabled` (the toggle) and `G.traits.auto_eat` (the
     purchase). The server holds one: hr_set_auto_eat refuses to write
     `auto_eat_enabled = true` without the ownership flag, so the column IS
     both facts and there is nothing to cross-check.
     Deriving them from the same value under two names was the first shape
     here, and it was worse than useless: it read like defence in depth while
     being one variable, so a mutation that bypassed `owned` changed nothing and
     the test that was supposed to catch it passed. One name, and the core's
     `owned` gate is asserted directly in tests/accrual-engine.mjs instead. */
  /* THE PERK STACK for this accrual, built ONCE per call from the state
     `hr_perks_of` returned. Memoised inside makeBonus, because
     `resolveArtisanAction`/`grantXp` ask for the same handful of keys on every
     one of ~18,000 ticks in a 12h night. `inp.perks` absent → EMPTY_PERKS → 0
     for every key, which is exactly the `zeroBonus` behaviour this replaces. */
  const bonus = bonusFor(inp.perks);
  /* THE GOAL COUNTER (b353). Fed by the `updateDaily`/`updateQuest` fx handlers
     below — the two seams resolveKill has always called and this engine has
     always ignored. */
  const goals = makeGoalCounter();
  /* THE BESTIARY (Slice 1) + COLLECTION (Slice 2) counters. Siblings of the
     goal counter fed from the SAME seams: the bestiary reads `updateQuest(
     'kill_monster', {target})` (per-monster kills), the collection reads the
     `addItem` LOOT seam below (per-item drops). Both fold their ops into THIS
     combat delta — server-derived, never client input. */
  const bestiary = makeBestiaryCounter();
  const collection = makeCollectionCounter();
  const autoEatOn = inp.autoEatEnabled === true;
  const eatCfg = {
    enabled: autoEatOn,
    owned: autoEatOn,
    threshold: thresholdFromPct(inp.autoEatPct),
    foodId: (typeof inp.autoEatFood === 'string' && inp.autoEatFood) ? inp.autoEatFood : null,
  };
  let foodEaten = 0;

  const fx = {
    /* XP goes through the SHARED grant, not a bare accumulator. grantXp applies
       PACE.xp (0.39 — a raw sum would over-pay by 2.5x), the perk block, the
       single floor and the "a positive grant never rounds to zero" rule, and it
       mutates state.skills. Skipping it would not be an optimisation; it would
       be a second XP formula. */
    addXp(skillId, amt) {
      const res = grantXp(state, skillId, amt, {
        bonus,
        xpB: eq.xpB || 0,
        restedQuantum: 0,     // Rested XP is not server state yet.
        authored: false,
      });
      for (const ev of res.events) {
        if (ev.type !== 'levelup') continue;
        /* The client raises max HP on a Hitpoints level (legacy.js:2003). The
           server must do the same or a long absence ends with a character whose
           max HP silently disagrees with their level. */
        if (ev.skill === 'hitpoints') state.playerMaxHp = ev.to;
        levelUps.push({ skill: ev.skill, from: ev.from, to: ev.to });
      }
    },
    addItem(id, qty) {
      const n = Math.floor(Number(qty) || 0);
      if (!id || n <= 0) return;
      itemDelta[id] = (itemDelta[id] || 0) + n;
      bag[id] = (bag[id] || 0) + n;      // edible from the moment it drops
      collection.record(id, n);          // Slice 2: the per-item loot counter
    },
    onDrop(ev) { if (ev && ev.rare) events.push({ type: 'rare_drop', item: ev.id }); },

    /* ── AUTO-EAT ─ survival, not a bonus. The ruling is explicit that it
       stays away and keeps consuming, and combat-sim.js calls it after the
       monster's swing and BEFORE the death check, so a successful eat is what
       keeps an unattended night running.

       It was absent here until 2026-08-15, and because a missing fx handler is
       a no-op by construction the absence was silent: the server never healed,
       the character died at the first bad streak, and everything after that
       moment paid nothing. Measured against the client on the same seed and
       the same state — the ONLY difference being whether this handler exists:

         early-game goblin        -90.5% kills, died 1.17h into a 12h night
         maxed vs slime           -62.9% kills, died 4.44h in
         maxed vs the day-1 boss  -99.0% kills, died 7.9 MINUTES in

       The decision is `src/core/auto-eat.js resolveAutoEat` — literally the
       same function `HearthriseAuto.maybeAutoEat()` now calls — so the two
       sides cannot answer differently. Only the APPLY differs: the client
       mutates G, this accumulates a delta.

       IT DRAWS NO RANDOM NUMBERS. That is a contract, not a coincidence: the
       fight is seeded, so a handler that consumed a draw would shift every
       later roll and the parity test would be comparing two different fights.

       The debit is signed into the SAME `items` map as the gains, because
       hr_apply's item block is signed and re-checks `have + delta >= 0`
       server-side. The bag bookkeeping means the engine structurally cannot
       propose eating food the character does not own — which matters because
       `insufficient_item` is NOT on index.ts's DEGRADABLE list, so proposing
       one would 409 an entire night rather than shorten it. */
    autoEat() {
      const decision = resolveAutoEat({
        enabled: eatCfg.enabled,
        owned: eatCfg.owned,
        hp: state.playerHp,
        maxHp: state.playerMaxHp,
        threshold: eatCfg.threshold,
        foodId: eatCfg.foodId,
        inventory: bag,
        items,
      });
      if (!decision) return false;
      state.playerHp = decision.hp;
      bag[decision.foodId] -= 1;
      if (bag[decision.foodId] <= 0) delete bag[decision.foodId];
      itemDelta[decision.foodId] = (itemDelta[decision.foodId] || 0) - 1;
      foodEaten++;
      return true;
    },

    /* ── THE DAILY / QUEST COUNTERS (b353, Designer Ruling 3.1) ──────────
       Two of the named gaps above, CLOSED. `resolveKill` has always called
       both of these — `fx.updateDaily('kill_any', 1)` and
       `fx.updateQuest('kill_any', 1, {target})` — on the same function body
       the live client runs; a missing handler is a no-op by construction, so
       for every away night since accrual shipped the kills were paid and the
       counters were not. That is the ruling's exact wording: "an away night
       that pays XP and items but leaves 'Slay 10 monsters' at 0/10".

       The two seams are kept SEPARATE rather than folded into one accumulator.
       They are called at the same sites with the same amounts today, and a
       single counter fed by both would double every count — so mirroring the
       seam is not tidiness, it is the difference between 25 kills and 50.

       `meta` is accepted and ignored: the client only consults `meta.target`
       for a quest row that declares `q.target`, and no authored row does.
       tests/goal-counters.mjs asserts that, so it is a stated equivalence
       rather than an assumption. */
    updateDaily(type, amt) { goals.daily(type, amt == null ? 1 : amt); },
    /* `meta` is now READ — the bestiary (Slice 1) consumes the TARGET-SCOPED
       `kill_monster` emit resolveKill produces alongside `kill_any`, filing it
       per `meta.target`. The goal model still ignores `meta` (no authored quest
       declares a target), so the two models PARTITION the event: one aggregate
       count under `ev:kill_any`, one per-monster count under
       `ev:kill_monster:<id>`, never double-counted. See src/core/goals.js. */
    updateQuest(type, amt, meta) { goals.quest(type, amt == null ? 1 : amt); bestiary.record(type, amt == null ? 1 : amt, meta); },

    /* Still deliberately ABSENT, and each absence is a decision, not an
       oversight:
         killMonster  — the client's five wrappers (dungeon keys, companions,
                        pets, collection log, chronicle) are client features
                        with no server model. simulateTick falls back to
                        resolveKill, which is the whole reward path.
         recordKill / rollKillDeed / handleBountyKill — the drop log, Farmer's
                        Deeds and bounties have no server progress model yet.
                        Emitting invented progress keys for them now would hand
                        those workstreams a contract they have to break. Stats
                        ARE journalled (below), because `stat` is already a
                        legal progress kind with a defined meaning.
       A missing fx handler is a no-op by construction in combat-sim.js, so
       every one of these is a silent skip rather than a crash — which is why
       they are listed here instead of being discovered by their absence.

       ⚠ AND UNDER THE 2026-08-15 RULING ("the offline portion should function
         exactly the same as if the player was still online", Tyler) every one
         of them is a MUST-CLOSE, not a tradeoff. They are listed as remaining
         work with a named dependency, not as accepted behaviour. */
  };

  // ── (4) The ctx. CONSTRUCTED FIELD BY FIELD. ─────────────────────────────
  // ⚠ THE RULE (design §3): there is no spread of a caller object anywhere in
  //   this literal, and there must never be one. `tickMs` is derived below;
  //   `minTickMs` is NOT SET AT ALL, so `resolveTickMs` uses the real 600ms
  //   floor. If this were built by spreading a request body, `minTickMs` would
  //   ride in through the same door as `tickMs` and defeat the clamp that is
  //   supposed to be the second line of defence. Adding a field here is a
  //   deliberate act; that is the entire point of the shape.
  /* b329: the style is passed because it now carries a speed term. It is the
     SAME `style` object simulateSpan routes XP through, resolved above from
     server-owned equipment — never from the request body. */
  const tickMs = deriveTickMs(equipment, items, style);
  const ctx = {
    away: true,                    // this IS the away path (docs/design/away-time-ruling.md)
    /* THE FIRST `grantMs` AFTER THE PLAYER LEFT, not the last before they came
       back (Ruling 2). This is the line the Boss-of-the-Day segmentation is
       computed from, which is exactly why it may not be anchored to a return
       instant the player chooses. */
    fromMs: credit.fromMs,
    toMs: credit.toMs,
    tickMs,                        // DERIVED from server-owned equipment
    capped,
    rng: createRng(nat(inp.seed, 0)),
    monsters,
    items,
    bonus,
    style,
    /* activeBuffCount = 0: the server holds no buffs, so `buffsPaused` reports
       false and the welcome-back line cannot claim buffs were paused when the
       player had none. Stating it beats letting the null-default guess. */
    activeBuffCount: 0,
    playerRolls(m) {
      return playerCombatRolls(m, {
        eq, equipment, items, skills: state.skills,
        bonus, setBonus, profile, style,
      });
    },
    monsterRolls(m) {
      return monsterCombatRolls(m, { eq, skills: state.skills, bonus });
    },
    weakness(m) { return weaknessInfo(m, eq); },
    /* Boss of the Day, resolved PER UTC-DAY SEGMENT of the absence, from the
       SERVER instant. simulateSpan rebinds this per segment, so an absence
       crossing UTC midnight pays each half its own day's boss (the ruling). */
    botdFor(atMs) {
      return { killBonuses(id) { return killBonusesFor(id, atMs, monsters); } };
    },
    fx,
  };

  // ── (5) Run the SHARED span. ─────────────────────────────────────────────
  const summary = simulateSpan(state, ctx);

  // ── (6) Turn the mutated state into a delta hr_apply will accept. ────────
  // Every value below is an INTEGER. hr_apply casts with `::bigint`, and a
  // fractional string ('12.32' — which a 0.33-ratio style XP split produces
  // before grantXp floors it) raises invalid_text_representation and comes back
  // as `bad_delta`. Integers are a contract requirement, not tidiness.
  const xpDelta = {};
  for (const k in state.skills) {
    const gained = Math.floor((state.skills[k] || 0) - (skills0[k] || 0));
    if (gained > 0) xpDelta[k] = gained;
  }
  const goldDelta = Math.floor(state.gold || 0);

  /* THE ITEM DELTA IS SIGNED. Gains come from drops; the one negative is food
     auto-eat consumed. hr_apply's item block is signed too — it re-reads
     `player_inventory` under the row lock and rejects `have + delta < 0` as
     `insufficient_item` — so the bag arithmetic above is the engine's promise
     and that check is the database's verification of it. */
  const items_ = {};
  let itemKinds = 0;
  const recipeOps = [];
  const startQty = (id) => Math.floor(nat((inp.inventory || {})[id], 0));
  for (const id in itemDelta) {
    // Unknown ids are refused by hr_apply against the generated hr_items
    // catalogue, which would reject the WHOLE delta — one cut monster drop
    // would cost a player their entire night. Filter here against the same
    // authored data the catalogue is generated from, and report it.
    if (!catalogueHas(items, id)) { events.push({ type: 'unknown_item_skipped', item: id }); continue; }
    /* b352: a recipe scroll is an UNLOCK, not an inventory row. Mirrors
       src/legacy.js's addItem wrapper, which unlocks and consumes. `flag` is in
       hr_apply's allowlist, so the engine may grant a scroll it rolled.

       ⚠ `add` IS THE QUANTITY ROLLED, not a hardcoded 1. The first draft wrote
         1 and the parity guard caught it: a night that rolled five scrolls
         proposed `add:1` and four vanished with no record anywhere. The gate
         opens either way (it reads value > 0), so nothing would have gone
         visibly wrong — which is exactly why it needed a test. A non-positive
         quantity is dropped rather than falling through to the item path: a
         scroll cannot be spent, so a debit is nonsense, and hr_apply refuses a
         negative `add` with the whole night attached. */
    if (items[id] && items[id].recipe) {
      const got = Math.floor(itemDelta[id]);
      if (got > 0) {
        recipeOps.push({ kind: 'flag', key: `recipe:${id}`, period: '', add: got, state: 'active' });
      }
      continue;
    }
    const n = Math.floor(itemDelta[id]);
    // A net zero is not a no-op to hr_apply — it is a catalogue lookup, a row
    // lock and a ledger byte for nothing. Drop it.
    if (n === 0) continue;
    /* THE FLOOR, and it is deliberately redundant. `bag` already makes a
       propose-more-than-owned impossible, but this delta is the thing that
       crosses a network hop into a function whose rejection costs the player a
       whole night — and `insufficient_item` is NOT on index.ts's DEGRADABLE
       list, so it does not shorten the span, it 409s it. Two independent locks
       on the one error that has no recovery path. */
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

  const nothingHappened =
    goldDelta === 0 && itemKinds === 0 && Object.keys(xpDelta).length === 0
    && !summary.died && summary.ticks === 0;
  if (nothingHappened) return { accrued: false, reason: SKIP.NOTHING, summary };

  const stats = state.stats || {};
  const progress = [];
  for (const op of recipeOps) progress.push(op);   // b352: scroll drops become unlock rows
  const stat = (key, n) => { if (n > 0) progress.push({ kind: 'stat', key, period: '', add: Math.floor(n), state: 'active' }); };
  stat('kills', stats.kills);
  stat('crits', stats.crits);
  stat('deaths', stats.deaths);
  stat('rare_drops', stats.rareDrops);
  /* THE GOAL COUNTERS. `nowMs` — the day the player RETURNS — is the daily
     period, not the credited window; src/core/goals.js states why the other
     two anchors both reproduce the failure this closes. `events` is passed so
     a clamp or an unknown type leaves a receipt instead of vanishing.
     ⚠ `stat:kills` and `stat:ev:kill_any` are BOTH written, deliberately: the
       first is the lifetime kill count the Hero screen reads, the second is
       the goal-event counter. They will agree on a combat night, and G3
       asserts that they do — the redundancy IS the drift guard. */
  for (const op of goalProgressOps(goals, nowMs, events)) progress.push(op);
  /* THE BESTIARY OPS (Slice 1) — per-monster kill counts. A combat span fights
     a SINGLE activeId, so `bestiary` holds exactly one key and this pushes
     exactly one op; it cannot approach c_max_progress_ops. Folded into the same
     delta as the goal ops, server-derived, re-clamped by hr_apply. */
  for (const op of bestiaryProgressOps(bestiary, events)) progress.push(op);
  /* THE COLLECTION OPS (Slice 2) — per-item loot counts, one op per distinct
     item dropped this span. Bounded by the monster's drop table (well under the
     op cap; COLLECTION-2 asserts a 20-distinct span stays under it). */
  for (const op of collectionProgressOps(collection, events)) progress.push(op);

  const delta = {
    // A watermark the SERVER computed and hr_apply then clamps into
    // [old, now()] — it can move neither backwards (paying the same seconds
    // twice) nor forwards (paying for time that has not happened).
    //
    // NOTE it is `now`, not `fromMs + grantMs`, even when CAPPED. A capped
    // absence forfeits its excess, which is the b307 per-absence rule the
    // ruling explicitly preserves ("signing in resets the timer"). Advancing
    // only to the paid instant would let a 40-hour absence be collected as four
    // full 12h nights in a row — a cap that can be drained in instalments is
    // not a cap.
    accrued_to: new Date(nowMs).toISOString(),
    hp: Math.max(0, Math.min(state.playerMaxHp, Math.floor(state.playerHp))),
    journal: {
      kind: 'combat',
      intent: 'accrue',
      // AGGREGATE, never per-tick and never per-kill. The receipt for why:
      // game_events reached 1.6M rows / 229 MB from six players in four days by
      // journalling every kill. One row per accrual, a handful of scalars.
      // `ate` is the count of auto-eats. It is an aggregate like everything
      // else here — never a row per meal — and it is the only trace of the
      // food a night consumed, which a support request about a vanished
      // Cooked Shark stack has to be answerable from.
      /* `from`/`to` are the CREDITED WINDOW, journalled because after Ruling 2
         "how long" no longer implies "which hours": a capped night forfeits its
         tail, and a dispute about a Boss-of-the-Day multiplier is only
         answerable from the instants the segments were resolved at. */
      meta: { ms: grantMs, ticks: summary.ticks, kills: summary.kills, capped,
              ate: foodEaten,
              from: new Date(credit.fromMs).toISOString(),
              to: new Date(credit.toMs).toISOString() },
    },
  };
  if (goldDelta > 0) delta.gold = goldDelta;
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
  if (progress.length) delta.progress = progress;
  // A death ends the fight. Sent only when it happened, because an `activity`
  // key is a complete, re-validated activity statement (hr_apply R11) and
  // restating an unchanged pointer buys nothing but a catalogue lookup.
  if (summary.died || !state.activeMonster) delta.activity = { kind: 'idle', id: null };

  /* ── THE END-OF-WINDOW CHECKPOINT (Phase 0) ──────────────────────────────
     ABSOLUTE, not a delta — the second key in this contract that is, and for
     the same reason `tool_carry` is: the engine computes the RESULTING state
     from a starting one it was handed, and adding two partial fights is
     arithmetic nobody defined.

     `if (fight0)` is the self-configuring switch: a null input means the column
     does not exist and the key must be OMITTED, because hr_apply refuses an
     unknown delta key with a 409 that costs the player the whole window.

     `{}` — an explicit VOID — is sent whenever the fight ended, which is the
     honest statement and not merely the absence of one: a death, a stop, or a
     monster on exactly 0 HP all mean "there is nothing in flight", and leaving
     the previous checkpoint in place would resume a fight the simulation has
     already finished. Note that a KILL respawns the same foe at full HP inside
     resolveKill, so the ordinary end of a combat window is a full-HP
     checkpoint, which is byte-for-byte equivalent to no checkpoint at all. */
  if (fight0) {
    const alive = state.activeMonster && !summary.died
      && Number.isFinite(state.monsterHp) && state.monsterHp > 0;
    delta.fight = alive
      ? { monster: state.activeMonster,
          hp: Math.floor(state.monsterHp),
          kills: Math.max(0, Math.floor(state.combatKillsThisFoe || 0)) }
      : {};
  }

  return {
    accrued: true,
    delta,
    grantMs,
    capped,
    tickMs,
    foodEaten,
    watermark: delta.accrued_to,
    events,
    levelUps,
    summary: {
      ...summary,
      // The Art Director's b326 field. Computed server-side, by the simulation,
      // so the welcome-back line can say "+50% drops" (daily) or "+100%"
      // (weekly) instead of a renderer guessing and halving a weekly night.
      featuredDropMult: summary.featuredDropMult,
      ...windowEnvelope(credit, summary.died ? summary.survivedMs : null),
      gold: goldDelta,
      xp: xpDelta,
      items: items_,
      levelUps,
    },
  };
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
     for every key, which is exactly the `zeroBonus` behaviour this replaces. */
  const bonus = bonusFor(inp.perks);

  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);

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
    inventory: bag,
    equipment,
    toolCarry: { ...(carry0 || {}) },
    stats: {},
  };

  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];
  /* THE GOAL COUNTER (b353). Same module, same shapes, same clamp as the
     combat path — one contract, not a gather-flavoured copy of one. */
  const goals = makeGoalCounter();

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

  const delta = {
    accrued_to: new Date(nowMs).toISOString(),
    journal: {
      kind: 'gather',
      intent: 'accrue',
      // AGGREGATE, never per-action. A 24h woodcutting night is ~27,000
      // actions; the receipt for what per-action journalling costs is
      // game_events — 1.6M rows / 229 MB from six players in four days.
      meta: { ms: grantMs, ticks: summary.ticks, qty: stats.gathered || 0,
              capped, node: summary.nodeId, skill: summary.skill,
              // The credited window, for the reason the combat journal carries it.
              from: new Date(credit.fromMs).toISOString(),
              to: new Date(credit.toMs).toISOString() },
    },
  };
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
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
  if (summary.stoppedBy === STOP_REASON.LEVEL) delta.activity = { kind: 'idle', id: null };

  return {
    accrued: true,
    delta,
    grantMs,
    capped,
    tickMs: summary.intervalMs,     // the ACTION interval; same field name, same meaning
    foodEaten: 0,
    watermark: delta.accrued_to,
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
     `benchPayable` refuses the cooking bench until the rung's WRITE path is
     server-owned — see the block at the foot of src/core/artisan-sim.js. */
  const bonus = bonusFor(inp.perks);

  const skills0 = {};
  for (const k in (inp.skills || {})) skills0[k] = nat(inp.skills[k], 0);

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
    /* NO BUFFS. The server holds no buff queue (there is no column and no
       intent that writes one), so `sliceSpan` sees no boundary and runs the
       window in one slice. Stated rather than left to a null-default, because
       `simulateArtisanSpan` DRAINS what it pays and a caller that handed it a
       queue it could not persist would spend a consumable into nothing. */
    buffs: [],
  };

  const itemDelta = Object.create(null);
  const events = [];
  const levelUps = [];
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

  const delta = {
    accrued_to: new Date(nowMs).toISOString(),
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
        // The credited window, for the reason the other two journals carry it.
        from: new Date(credit.fromMs).toISOString(),
        to: new Date(credit.toMs).toISOString(),
      },
    },
  };
  if (itemKinds > 0) delta.items = items_;
  if (Object.keys(xpDelta).length) delta.xp = xpDelta;
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
