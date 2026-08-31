// ============================================================
// src/core/ammo.js — THE CONSUMPTION SEAM. One field, one carry, one guard.
//
// docs/design/consumable-economy.md R1: "Ranged, magic and melee all consume
// through the SAME per-swing field (`ammoPerShot`) in the SAME slot (`ammo`).
// There is not a second consumption path."
//
// ── WHY THIS FILE EXISTS SEPARATELY FROM combat-sim.js ────────────────
// `ammoPerShot` shipped as DATA in b343 (`src/data/slot-ladders.js`) with its
// own header admitting "NOTHING CONSUMES THESE YET", and the design doc then
// MEASURED the inertness rather than assuming it: a 12-hour away run loosed
// 20,454 arrows and called `fx.removeItem` zero times. Three skills —
// Fletching, Runecrafting and Stonemason — are all specified against that one
// field, and they are being built by different agents at different times.
//
// If each of them brings its own arithmetic, the three will drift exactly the
// way `processOfflineCombat` drifted from `combatTick` (b325) and `deriveTickMs`
// drifted from its caller. So the arithmetic is authored ONCE, here, ahead of
// its consumers, and every consumer imports it:
//
//   • the pre-flight supply projection  (docs/design/supply-projection.md)
//   • the away card's dry-out line      (consumable-economy.md §10)
//   • the combat loop's per-swing spend (E1, NOT YET WIRED — see below)
//   • the server's away accrual         (same functions, vendored)
//
// §4.5 of the design states the requirement this file discharges verbatim:
// "`consumablesPerHour` and `hoursOfSupply` MUST live beside [swingIntervalMs]
// in `src/core/**` and be called by BOTH the pre-flight projection and the
// server's away accrual. If the projection computes its own copy, the two will
// disagree, and the player will be told a number the night does not honour."
//
// ── E1 IS WIRED (2026-08-31) ─────────────────────────────────────────────
// `simulateTick` in src/core/combat-sim.js NOW calls `spendForSwings(state, 1,
// ctx)` on every swing — the live 2.4s tick and the server's away accrual are
// the same call, because they are the same function. Paione, 2026-08-20:
// "crafted arrows are never spent in combat." They are now.
//
// The wiring is CTX-BLIND on purpose: nothing below and nothing at the call
// site reads `ctx.away`. That is what keeps AWAY-1 true — a seeded fight
// consumes the identical number of arrows through both paths, because there is
// only one path.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* ── R2: FAIL-SOFT, NOT FAIL-CLOSED ───────────────────────────────────
   An unsupplied fighter keeps fighting at a quarter max hit. Measured across
   ten builds and four monster tiers (consumable-economy.md §3.2): 0.25 on max
   hit pays 25-33% of a supplied night's XP and 26-38% of its gross.

   MAX HIT is the lever, and the alternatives were rejected with reasons:
     • accuracy is clamped to [0.15, 0.95], so a multiplier on it is
       non-linear AND monster-dependent — unprojectable, and backwards (a
       player already at the floor against a hard foe would lose nothing);
     • XP-only would leave kills, gold and drops flowing unchanged, so a
       loot-focused player would deliberately run dry. A perverse optimum is
       worse than a punishment.

   The engine already floors max hit at 1 (`Math.max(1, floor(...))`), which is
   why a brand-new character cannot be hurt by this system at all: at level 10
   against a Goblin, x0.25 and x0.15 are the same number. That is not a happy
   accident — it is the property that makes shipping this to new players safe,
   and it must be preserved by anyone who retunes the constant. */
export const AMMO_DRY_MULT = 0.25;

/* ── TWO QUESTIONS, TWO TABLES. THEY ARE NOT THE SAME QUESTION. ────────
   This file originally answered both from `AMMO_STYLES`, and using one table
   for two facts had a measurable cost: because `spendForSwings` gated on it, a
   melee player could equip a Dawnsteel Whetstone (+18 strB, v=990) and wear it
   FOREVER for free. §6.3 prices that stone at 240 a night / 15,840 g of input;
   the engine charged nothing. Splitting the tables is what makes R5 sayable in
   full — melee's FLOOR is free, melee's CEILING is paid — instead of only its
   first half.

   Both are FROZEN DATA, deliberately, so the Game Designer retunes a row
   rather than a branch. */

/* (1) WHO PAYS. Does swinging this weapon family spend the ammo slot?
   Everything that swings does, because the slot's occupant is what is being
   consumed and the item's own `ammoPerShot` already decides the rate — a rung
   that should be free is authored `0` (every tier-1 rung is), which is a data
   statement and not a family exemption.
   `neutral` is FALSE: an unarmed player looses no arrow. That is the one
   family with no swing to charge for. */
export const AMMO_SPEND_STYLES = Object.freeze({
  ranged: true,
  magic: true,
  sword: true,
  hammer: true,
  neutral: false,
});

/* (2) WHO SUFFERS. Does an EMPTY slot cost this family max hit?

   R5, and it is a ruling rather than an omission: MELEE'S FLOOR IS FREE. A
   sword works unsharpened, so melee takes no depletion penalty; what melee
   buys with a whetstone is its CEILING (+14-18% max hit). The asymmetry is
   deliberate — the starting weapon is a Bronze Sword, so a paid melee floor
   would put a brand-new character in the penalty state from second one, and
   the only other way to price melee's floor is weapon durability, which is
   the most-hated mechanic in the genre and the one version of this design
   that could make a player worse off for having played.

   `neutral` is here because `WEAPON_SPEED_MOD` carries it and an unarmed
   player must not be penalised for owning no bow. */
export const AMMO_STYLES = Object.freeze({
  ranged: true,
  magic: true,
  sword: false,
  hammer: false,
  neutral: false,
});

/** Does swinging this weapon family spend from the ammo slot? */
export function styleSpendsAmmo(weaponType) {
  return AMMO_SPEND_STYLES[weaponType] === true;
}

/** Does this weapon family take a depletion penalty when the slot is empty? */
export function styleNeedsAmmo(weaponType) {
  return AMMO_STYLES[weaponType] === true;
}

/* ── THE OPT-OUT, NAMED AND LEFT SHUT ──────────────────────────────────
   Today an ammo-hungry style with a COMPLETELY EMPTY slot fights at FULL
   strength, because `ammoDamageMult` reads `perShot === 0` and cannot tell a
   loaded free tier-1 rung apart from an empty slot. MEASURED by running
   `playerCombatRolls` on the real catalogue at Ranged 99, Duskwood Bow:

     dawnpoint_arrows, supplied   maxHit 69
     dawnpoint_arrows, run dry    maxHit 17   (x0.25, floored)
     no ammo equipped at all      maxHit 58   (loses only the +18 rangeStrB)

   So NOT equipping is 3.4x better than running dry, which makes the whole
   mechanic OPT-OUT: the dominant play is an empty quiver. R2's own words are
   the other way — "you can still train ranged or magic with NO arrows/runes,
   it is just very very weak."

   It is a DATA FLIP rather than a fix here, and it is left FALSE.

   ⚠⚠ THE HARD COUPLING — THIS FLAG MAY NOT FLIP TO TRUE WITHOUT THE
       EMPTY-QUIVER INDICATOR IN THE SAME BUILD. Not a preference; a
       KNOWLEDGE TAX, and that is the whole argument:

         · a player who KNOWS about the rule opts out of it — an empty slot
           costs 58 vs 17 maxHit, so the informed play is to unequip;
         · a player who does NOT know silently eats x0.25 for the whole night
           and has no surface anywhere that says why.

       Flipped without the sign, the mechanic therefore stops taxing
       PREPARATION (which is the design's entire intent — §4: "the loadout
       decision made before the tab closes is THE decision") and starts taxing
       INFORMATION. That is a strictly worse game, and it is worse for exactly
       the newest players, who are the ones §12.2 argues this is safe to ship
       to. §14 already assigns the surface to the Art Director: "the
       empty-quiver state must read on the equip doll and in the combat panel —
       a player fighting at x0.25 who cannot see why is a support ticket."

   THE COUPLING IS ENFORCED, NOT ONLY DOCUMENTED. `tests/accrual-engine.mjs`
   AMMO-E4 asserts the IMPLICATION `flag === true  =>  the marker exists`:

       THE MARKER IS THE LITERAL TOKEN  hr-ammo-dry  ANYWHERE UNDER src/.

   The name is mine (so the guard has something to grep); the MECHANISM is the
   Art Director's — a CSS class, a `data-` attribute, a glyph key, a render
   helper, whatever the indicator honestly wants to be. It only has to carry
   that token so the build can see it.

   It is an IMPLICATION and deliberately NOT a biconditional: the indicator is
   allowed to land FIRST and on its own (an empty-quiver badge is useful copy
   even while the penalty is off), so a UI-without-flag build stays green. Only
   the dangerous ordering — penalty without sign — goes red, and it goes red
   with the reason attached. */
export const AMMO_EMPTY_SLOT_IS_DRY = false;

/** The greppable proof that the empty-quiver indicator exists. See the block
 *  above: `AMMO_EMPTY_SLOT_IS_DRY` may not be true unless this token appears in
 *  a rendered surface under `src/`. Exported so the guard reads the contract
 *  from the module that owns it rather than re-typing the string. */
export const AMMO_DRY_UI_MARKER = 'hr-ammo-dry';

/* ── THE SECOND OPEN QUESTION, AND IT IS NOT SOLVABLE IN THIS FILE ─────
   AN EMPTIED SLOT KEEPS ITS STATS. `equipmentStats` sums the ammo item's
   bonuses off the EQUIPMENT MAP, and §2.2's slot is a POINTER that survives
   its stack reaching zero — so a burnt-out Dawnsteel Whetstone still pays
   +18 strB forever. For ranged and magic the x0.25 makes that irrelevant (a
   dry archer is four times weaker overall). For MELEE, which by R5 takes no
   depletion penalty at all, it means one stone buys a permanent bonus and the
   consumption is a rounding error on the way there.

   Not a regression — before E1 the stone was never consumed either — but it is
   the half of "melee's ceiling is paid" that consumption alone cannot close.
   Closing it means teaching the STAT layer about stock, i.e. threading the
   inventory into `equipmentStats`/`playerCombatRolls`, which is the one
   function both engines share and every loadout's numbers run through. That is
   a deliberate change with a Designer ruling attached, not a drive-by here.
   tests/accrual-engine.mjs AMMO-E5 pins today's behaviour in both directions so
   the fix arrives as two expected, named failures. */

/**
 * The per-swing burn of an ammo-slot item. DATA, never a branch on the id.
 *
 * `ammoPerShot: 0` is a shipped, deliberate value and not "missing": every
 * ladder's TIER-1 rung is free (Bronze Arrows, Air Runes, Coarse Whetstones),
 * because there is no integer price at which tier-1 ammo costs less than a
 * third of the income it earns. A zero here means the stack never depletes and
 * the slot is never dry — training ammo. The supply loop starts at tier 2.
 *
 * An item with no `ammoPerShot` field burns nothing, which is the safe
 * direction: a future ammo-slot item that forgot the field is inert rather
 * than silently eating a player's stack at 1/swing.
 */
export function ammoPerShot(itemDef) {
  const n = itemDef && Number(itemDef.ammoPerShot);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ── R3: BURN IS A PURE FUNCTION OF TIME ──────────────────────────────
   An arrow is spent on the SWING, hit or miss — never on the hit, never on the
   kill, never on a drop roll. This is the property that makes every number
   below honest, and it is worth stating why rather than just asserting it:

   `simulateSpan` runs `floor(spanMs / tickMs)` ticks for the whole span
   regardless of what happens in the fight (measured: ticks = 13,636 in every
   8-hour ranged run, at every damage multiplier, against every monster). So
   consumption is EXACTLY `swings x ammoPerShot`, independent of monster
   choice, accuracy, kill rate and drop luck.

   Spending on HITS would make the burn rate a function of the monster's
   defence and the player's accuracy — still computable, but it would mean a
   high-accuracy build is CHEAPER to run, which inverts the intent, and it
   would couple the pre-flight projection to a monster the player has not
   picked yet. */

/** Consumables spent per hour at this swing interval. */
export function consumablesPerHour(swingIntervalMs, perShot) {
  const ms = Number(swingIntervalMs);
  const per = Number(perShot);
  if (!(ms > 0) || !(per > 0)) return 0;
  return (3600000 / ms) * per;
}

/**
 * How long a stack lasts, in hours. `Infinity` when nothing is spent — which
 * covers BOTH the free tier-1 rungs and melee's empty slot, so a caller never
 * has to special-case "this style does not use ammo".
 */
export function hoursOfSupply(stock, swingIntervalMs, perShot) {
  const rate = consumablesPerHour(swingIntervalMs, perShot);
  if (rate <= 0) return Infinity;
  return Math.max(0, Number(stock) || 0) / rate;
}

/**
 * The instant the stack hits zero, in absolute ms — or `null` for "never".
 *
 * DERIVABLE IN CLOSED FORM BEFORE THE SPAN RUNS, which is the whole point:
 * the server computes it, the client renders it, and neither invents it. The
 * away card's "you ran out 4h 20m in" and the pre-flight "about 7 hours of
 * keen edge" are then the SAME expression evaluated at two moments, so they
 * cannot disagree — see §10's rule that a player who buys exactly what they
 * were quoted must not run dry in the last minute.
 */
export function dryAtMs(fromMs, stock, perShot, tickMs) {
  const per = Number(perShot);
  const ms = Number(tickMs);
  if (!(per > 0) || !(ms > 0)) return null;
  const swings = Math.floor((Math.max(0, Number(stock) || 0) + 1e-9) / per);
  return (Number(fromMs) || 0) + swings * ms;
}

/**
 * The DETERMINISTIC fractional carry for `ammoPerShot < 1` — a whetstone at
 * 0.02 is one honing per fifty swings, and it must be the SAME fifty swings on
 * every replay.
 *
 * Deliberately NOT an RNG roll. `advanceToolCarry` in ./tools.js was written
 * with that same reasoning and this is its twin, including the `+1e-9`
 * correction that file documents: 0.02 accumulated fifty times floats short of
 * 1.0 and would never pay out without it. Roll a dice here and the AWAY-1
 * parity test goes red and the pre-flight projection becomes a lie.
 *
 * Mutates `carry` (a plain `{ [ammoId]: fraction }` bag) and returns the WHOLE
 * units owed for these swings.
 *
 * ⚠ THE CARRY IS PERSISTENT PROGRESS. It belongs in the save snapshot and must
 *   NEVER be added to `NO_SYNC` — save invariant 3: "adding a persistent-
 *   progress field to NO_SYNC = silent cloud data loss". Keyed by AMMO ID
 *   rather than by slot so swapping stacks mid-night cannot silently forgive
 *   or double-charge the fraction already banked against the other stack.
 */
export function advanceAmmoCarry(carry, ammoId, swings, perShot) {
  const per = Number(perShot);
  const n = Math.max(0, Math.floor(Number(swings) || 0));
  if (!(per > 0) || n === 0 || !carry || !ammoId) return 0;
  const c = (Number(carry[ammoId]) || 0) + n * per;
  const whole = Math.floor(c + 1e-9);
  carry[ammoId] = c - whole;
  return whole;
}

/**
 * The damage multiplier this loadout earns from its supply state.
 *
 * The ONE expression the fail-soft ruling reduces to, so nobody re-derives it:
 *   supplied, or a free rung, or a style that does not use ammo  -> 1
 *   an ammo-hungry style whose paid rung has run dry             -> 0.25
 *
 * `equipped` DEFAULTS TO TRUE when the caller does not say, which keeps the
 * published three-field contract byte-for-byte and defaults to the harmless
 * answer. `readAmmo` always states it, so the only callers that omit it are
 * asking the abstract question "what does this rung pay?".
 */
export function ammoDamageMult({ weaponType, perShot, stock, equipped }) {
  if (!styleNeedsAmmo(weaponType)) return 1;
  const loaded = (equipped === undefined) ? true : !!equipped;
  if (!loaded) return AMMO_EMPTY_SLOT_IS_DRY ? AMMO_DRY_MULT : 1;
  if (!(Number(perShot) > 0)) return 1;      // a free tier-1 rung never runs dry
  return (Number(stock) || 0) > 0 ? 1 : AMMO_DRY_MULT;
}

/**
 * APPLY the supply multiplier to a rolled max hit. One expression, so the
 * fight, the projection and any future readout cannot round it differently.
 *
 * `Math.max(1, ...)` is the engine's own floor — the same line the style, the
 * weakness and the food-damage multipliers already end on (src/core/combat.js
 * `playerCombatRolls`) — and it is what makes this safe to ship to a brand-new
 * character: at level 10 against a Goblin, x0.25 and x1.00 are both 1, so the
 * player who has not built a supply chain yet is the least punished by not
 * having one (consumable-economy.md §3.2). Preserve that when retuning.
 *
 * A multiplier of 1 returns the input UNTOUCHED rather than re-flooring an
 * already-floored integer — the identity is what keeps a no-ammo loadout
 * byte-identical to the pre-E1 engine.
 */
export function applyAmmoMult(maxHit, mult) {
  const m = Number(mult);
  if (!(m >= 0) || m === 1) return maxHit;
  return Math.max(1, Math.floor(Number(maxHit) * m));
}

/**
 * THE WEAPON FAMILY, derived from the same catalogue field `equipmentStats`
 * reads (`ITEMS[equipment.weapon].weaponType`).
 *
 * ⚠ WHY THIS IS DERIVED HERE AND NOT PASSED THROUGH `ctx`. The consumption
 *   seam has to work for EVERY caller of `simulateTick` without that caller
 *   adding a field — the live tick, the away accrual, the away replay and
 *   every fixture. A required new ctx key is a key one of those four can
 *   forget, and the failure mode of forgetting it is silent (`undefined` ->
 *   'neutral' -> nothing is ever spent), which is the bug this commit exists
 *   to close, re-introduced through a different door.
 *
 *   `ctx.weaponType` still WINS when it is given, because the pre-flight
 *   projection asks about a hypothetical loadout it holds in its hand rather
 *   than about `state.equipment`. AMMO-5 asserts the derivation agrees with
 *   `equipmentStats().weaponType` for every weapon in the catalogue, so the
 *   two readings cannot drift.
 */
export function weaponTypeOf(state, ctx) {
  const given = ctx && ctx.weaponType;
  if (typeof given === 'string' && given) return given;
  const eqp = (state && state.equipment) || null;
  const id = eqp ? eqp.weapon : null;
  const def = id ? ((ctx && ctx.items) || {})[id] : null;
  return (def && def.weaponType) || 'neutral';
}

/**
 * Read the loadout's ammo situation off server-owned state. One reader, so the
 * projection, the away card and (once E1 lands) the fight all answer the same
 * three questions from the same two fields.
 *
 * The slot is a POINTER, not a container (§2.2): `G.equipment.ammo` names WHICH
 * stack is in use and the whole quiver stays in `inventory`. That is what makes
 * the projection trivially correct — the supply the player is asked about is
 * literally `inventory[ammoId]`, with no second place for it to hide.
 */
export function readAmmo(state, ctx) {
  const s = state || {};
  const items = (ctx && ctx.items) || {};
  const id = (s.equipment && s.equipment.ammo) || null;
  const def = id ? items[id] : null;
  const perShot = ammoPerShot(def);
  const stock = id ? Math.max(0, Number((s.inventory || {})[id]) || 0) : 0;
  const weaponType = weaponTypeOf(s, ctx);
  const mult = ammoDamageMult({ weaponType, perShot, stock, equipped: !!id });
  return {
    id,
    perShot,
    stock,
    weaponType,
    needed: styleNeedsAmmo(weaponType),
    /* Does swinging this family charge the slot at all? The FIRST of the two
       questions the split tables answer — melee says yes here and no to
       `needed`, which is R5 in two booleans. */
    spends: styleSpendsAmmo(weaponType),
    /* `dry` means "this style wants ammo, this rung costs ammo, and there is
       none" — the only combination that pays the penalty. */
    dry: styleNeedsAmmo(weaponType) && perShot > 0 && stock <= 0,
    mult,
  };
}

/**
 * Spend for a run of swings, ONCE, and report what happened.
 *
 * ── THE AGGREGATION IS A HARD REQUIREMENT, NOT AN OPTIMISATION ────────
 * §13.2: "Consumption is a per-tick inventory decrement, and the ledger is
 * append-only and compacted per-absence. It MUST be aggregated into the span's
 * single delta, never written per tick — 13,636 arrows over an 8-hour absence
 * is 13,636 ledger rows if anyone gets that wrong."
 *
 * So the unit of work here is a RUN OF SWINGS, not a swing. A caller that has
 * one swing passes 1; the away path passes the whole slice. Both take exactly
 * one `fx.removeItem` call, and the arithmetic is identical either way, which
 * is what keeps the live tick and the away accrual byte-identical.
 *
 * @param state MUTATED via `fx.removeItem`; `state.ammoCarry` is created if absent.
 * @param swings how many swings to charge for
 * @param ctx { items, weaponType, fx }
 * @returns { id, spent, before, after, dryAfterSwings, startMult, mult, dry }
 *          `dryAfterSwings` is how many of the requested swings were covered
 *          before the stack emptied — `null` when it never emptied. The caller
 *          renders the moment; this function states it.
 *
 *          `startMult` is the multiplier the run's FIRST swing earns and
 *          `mult` the one its REMAINDER earns. They differ by exactly one
 *          case and that case is the whole reason both exist: the swing that
 *          looses the LAST arrow was supplied when it was loosed, so it hits
 *          at full strength and only the NEXT one is weak. A per-swing caller
 *          (simulateTick) reads `startMult`; a whole-slice caller reads both
 *          and splits the span on `dryAfterSwings`. Charging the last arrow's
 *          own swing at x0.25 is an off-by-one a player would feel as "it took
 *          my arrow AND weakened the shot".
 */
export function spendForSwings(state, swings, ctx) {
  const c = ctx || {};
  const s = state || {};
  const info = readAmmo(s, c);
  const n = Math.max(0, Math.floor(Number(swings) || 0));

  const base = {
    id: info.id, spent: 0, before: info.stock, after: info.stock,
    dryAfterSwings: null, startMult: info.mult, mult: info.mult, dry: info.dry,
  };
  /* Nothing to spend: an unarmed swing, a free tier-1 rung, an empty slot, or
     zero swings. All four are ordinary, and none of them is an error.
     ⚠ The gate is `spends`, NOT `needed`. They are different questions and
       conflating them made every whetstone free — see the two tables above. */
  if (!info.spends || info.perShot <= 0 || n === 0) return base;

  if (!s.ammoCarry || typeof s.ammoCarry !== 'object') s.ammoCarry = {};

  /* HOW MANY OF THESE SWINGS THE STACK ACTUALLY COVERS. Computed before the
     carry advances, because a stack that runs out partway through must charge
     only for the swings it paid for — charging for all `n` and then flooring
     the inventory at zero would silently over-bill exactly the night that
     already went wrong.
     Clamped at 0 from below as well as at `n` from above: an empty stack with
     a banked carry makes the division negative, and a negative `covered` would
     be reported as a `dryAfterSwings` of -1 (a moment no clock has). */
  const covered = Math.max(0,
    Math.min(n, Math.floor((info.stock - (s.ammoCarry[info.id] || 0) + 1e-9) / info.perShot)));
  const owed = advanceAmmoCarry(s.ammoCarry, info.id, covered, info.perShot);
  const spent = Math.min(owed, info.stock);

  if (spent > 0 && typeof c.fx?.removeItem === 'function') c.fx.removeItem(info.id, spent);

  const after = info.stock - spent;
  return {
    id: info.id,
    spent,
    before: info.stock,
    after,
    dryAfterSwings: covered < n ? covered : null,
    /* What the run STARTED at — the supplied answer whenever the stack could
       cover the first swing, which is what a per-swing caller needs. */
    startMult: info.mult,
    /* The multiplier the REMAINDER of the run earns. A run that emptied the
       stack fought its first `covered` swings supplied and the rest at 0.25 —
       the caller splits the span on `dryAfterSwings` rather than being told a
       single average, because an average is a number no tick actually ran at.

       ⚠ THROUGH `ammoDamageMult`, NOT `after > 0 ? 1 : AMMO_DRY_MULT`. The bare
         ternary was a SECOND statement of the fail-soft rule that did not know
         about R5, so it reported 0.25 for a melee run with an empty whetstone
         slot — a family that by ruling takes no depletion penalty at all. It
         reached nothing today (the fight reads `startMult`), which is exactly
         the kind of latent wrong answer the next consumer inherits. One
         expression, asked twice. */
    mult: ammoDamageMult({ weaponType: info.weaponType, perShot: info.perShot, stock: after, equipped: !!info.id }),
    dry: info.needed && after <= 0,
  };
}
