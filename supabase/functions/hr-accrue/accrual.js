// ============================================================================
// supabase/functions/hr-accrue/accrual.js — the SERVER ACCRUAL ENGINE.
//
// Phase C. Given server-owned state and a server timestamp, decide what a
// player is owed for the time they were away, and express it as a delta for
// hr_apply. This file computes; it does no I/O, opens no connection, reads no
// request and knows nothing about HTTP. index.ts does all of that.
//
// ── ONE DOOR, SIX PIECES (architecture audit item 7, 2026-11-19) ───────────
// This file was 2,473 lines. It is the engine's DOOR now: every caller (index.ts,
// set-activity.js, hunt-settle.js, the tick, the tests and tools) imports from
// here, and the door re-exports what its pieces own. A piece imports only the
// pieces listed before it, never this file, so nothing cycles:
//   accrual-contract.js  SKIP, PAYABLE_KINDS, the caller fence, nat; and the
//                        operator procedure for rolling back a payable kind
//                        (read it BEFORE reverting an Edge deploy or renaming a
//                        catalogue id)
//   accrual-window.js    the floors, the span fuse, the watermark, the receipt,
//                        the tool carry
//   accrue-gather.js     a gathering pointer's window     (KIND_ACCRUERS.gather)
//   accrue-artisan.js    a bench pointer's window         (KIND_ACCRUERS.artisan)
//   accrue-hunt.js       one settle of one hunt instance  (hunt-settle.js)
//   accrue-rested.js     the rested bank on its own watermark (index.ts)
// The text guards read the door and its pieces as ONE engine
// (tests/_accrual-engine.mjs): a piece is read the day an engine file imports it.
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
// away scope from src/core/away.js.
// A second copy of the maths is the failure this whole program exists to
// prevent, so if you find yourself typing an arithmetic operator on a game
// value in this engine, you are writing a bug.
//
// PURE ESM, every piece. No DOM, no window, no timers, no Math.random, no fetch.
// ============================================================================

/* A bench's payability (src/core/artisan-sim.js), the one set-activity.js and
   src/net/activity.js read too. */
import { benchPayable, benchBlockedBy } from '../../../src/core/artisan-sim.js';
/* WHICH hours of an over-cap absence are credited. One definition, imported by
   both the server and (through core-bridge) the client — the flip from
   last-window to first-window crediting is a property of the away model, not a
   line of arithmetic each side gets to write for itself. */
import { creditWindow } from '../../../src/core/away.js';
/* NAMED HUNTS (lane C1). A combat pointer names a hunt (src/data/hunts.js). */
import { huntFor } from '../../../src/core/hunt-spawn.js';
/* The ONE catalogue-lookup guard in this payload. See its definition for why a
   truthiness test on a `[a-z0-9_]` id is not one. ./intents.js imports nothing,
   so this cannot cycle. */
import { catalogueHas } from './intents.js';
import { nat, SKIP, PAYABLE_KINDS, accrualCaller } from './accrual-contract.js';
import { accrueFloorMs, ACCRUE_MAX_SPAN_MS } from './accrual-window.js';
import { accrueGather } from './accrue-gather.js';
import { accrueArtisan } from './accrue-artisan.js';

/* THE DOOR'S EXPORTS, BY PIECE. Every name a caller imports from the engine. */
export { SKIP, PAYABLE_KINDS, ACCRUAL_CALLERS, CALLER_AUTHORITY, accrualCaller } from './accrual-contract.js';
export {
  ACCRUE_MIN_MS, TOWN_SETTLE_MIN_MS, accrueFloorMs, ACCRUE_MAX_SPAN_MS, inventoryBaselineComplete,
  settledWatermarkMs, normaliseToolCarry,
} from './accrual-window.js';
export { HUNT_MAX_WINDOW_MS, encodeWorld, accrueHunt, huntProposal } from './accrue-hunt.js';
export { accrueRested } from './accrue-rested.js';

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

/* ── KIND → THE FUNCTION THAT PRICES IT ────────────────────────────────────
   The mechanism the PAYABLE_KINDS block (./accrual-contract.js) could not previously claim, made real: this is
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
 *   gold         the envelope's purse, which the bench tax reads
 *   skills       { skill_id: xp }        from player_skills
 *   equipment    { equip_slot: item_id } from player_equipment
 *   inventory    { item_id: qty }        from player_inventory — READ, and
 *                SPENT by a bench, which is why its delta is signed.
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
 *   huntOpen     true when the character holds an OPEN session and this call
 *                is NOT the hunt settle (accrue / collect): the engine then
 *                answers SKIP.HUNT_OPEN and prices nothing — the old combat
 *                path can never pay a hunting character (ruling §2: "the
 *                world tick is the only thing that settles a session").
 *   (A hunt's inputs are accrueHunt's, ./accrue-hunt.js. The retired single-foe
 *   fight's, `fight`, `ammoCarry`, `hp`, are read by nothing.)
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
  /* ── HUNT INSTANCES (lane S1) ─────────────────────────────────────────────
     A fight is a hunt instance, priced by `accrueHunt` below and reached only
     through the hunt settle (./hunt-settle.js: the world tick and the player's
     settle). An OPEN session is never priced by this door. */
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

  /* The floor the paid window starts at: the watermark. */
  const payFromMs = accruedToMs;

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
  if (grantMs < accrueFloorMs(inp.activeKind) && accrualCaller(inp) === 'accrue') {
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
       that array with no simulation answers `undefined` — no reason, no delta
       contract — and every caller reads that as whatever its own default is.
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
