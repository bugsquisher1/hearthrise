// ============================================================
// src/core/ammo.js — THE CONSUMPTION SEAM. One field, one carry, one guard.
//
// docs/design/consumable-economy.md R1: "Ranged, magic and melee all consume
// through the SAME per-swing field (`ammoPerShot`) in the SAME slot (`ammo`).
// There is not a second consumption path."
//
// The rules here are read by the one hunt engine: a shot pays `ammoPerShot`
// from the hunt's bag (src/core/hunt/abilities.js), a melee swing wears its
// hone by `honeWornAt` (src/core/member.js), and an unsupplied style fights at
// `AMMO_DRY_MULT` (`ammoDamageMult`, `readAmmo`). One engine, so there is one
// spend path whether the hunt is watched or not.
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
   that should be free is authored `0` (Bronze Arrows are), which is a data
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

   FLIPPED TO TRUE — W0 coherence audit, Top-10 #7 (Game Designer, 2026-10-09;
   Tyler: "do it all"). An empty ammo slot on a bow or a staff is now "run
   dry", so the empty quiver stops being the dominant play and Fletching and
   Runecrafting get a buyer. What keeps it from punishing a new player: the
   tier-1 arrow is free (`ammoPerShot: 0`, never depletes), it
   is in the starter kit (src/data/start-kit.js) and it is on the Local Shop
   counter, so "supplied" costs a brand-new character nothing. And the floor
   argument below still holds: at low levels x0.25 and x1 are the same max hit.
   The indicator the coupling below demands ships in the same build: the
   combat rail's ammo slot carries `hr-ammo-dry` (src/features/combat-screens.js).

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
export const AMMO_EMPTY_SLOT_IS_DRY = true;

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
 * `ammoPerShot: 0` is a shipped, deliberate value and not "missing": Bronze
 * Arrows are the one free rung (designer 2026-10-31), because a basic attack costs
 * nothing you can run out of and no integer price keeps that arrow under a third
 * of the income it earns. A zero here means the stack never depletes and the slot
 * is never dry — training ammo. Air Runes no longer exist; Coarse Whetstones wear
 * at 0.02 a swing.
 *
 * An item with no `ammoPerShot` field burns nothing, which is the safe
 * direction: a future ammo-slot item that forgot the field is inert rather
 * than silently eating a player's stack at 1/swing.
 */
export function ammoPerShot(itemDef) {
  const n = itemDef && Number(itemDef.ammoPerShot);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ── THE HONE: THE AMMO-SLOT ITEM A SWING WEARS INSTEAD OF SHOOTING (lane c-work-fixes, 2026-10-22) ──
   The hunt engine spends arrows and runes per SHOT (hunt/abilities.js payBasic), but a whetstone is
   never shot, so the one engine wore none: any whetstone, any tier, was +strB forever for nothing.
   A whetstone (an ammo item whose own `reqSkill` is melee) is now worn by the hunting hero's swing
   clock: `honeWornAt(i, p)` stones at member swing index i, i.e. floor(i·p) − floor((i−1)·p), so 0.02
   is one stone every fiftieth swing. Keyed by the session's PERSISTED swing index, it needs no carry
   column and lands on the same swing however the settles are cut (TICK-1), on both paths. When the
   hunt's stock is spent the stone's bonus stops at that swing (src/core/member.js wear). */
export function honeOf(equipment, items) {
  const id = equipment && typeof equipment.ammo === 'string' ? equipment.ammo : null;
  const def = id && items ? items[id] : null;
  return def && def.reqSkill === 'melee' && ammoPerShot(def) > 0 ? id : null;
}

/** Whole hones worn at the member's swing `index` (the swing index after it counts this swing). */
export function honeWornAt(index, perShot) {
  const i = Math.floor(Number(index) || 0);
  const p = Number(perShot);
  if (!(i > 0) || !(p > 0)) return 0;
  return Math.floor(i * p + 1e-9) - Math.floor((i - 1) * p + 1e-9);
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
  if (!(Number(perShot) > 0)) return 1;      // the free rung never runs dry
  return (Number(stock) || 0) > 0 ? 1 : AMMO_DRY_MULT;
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
    /* `dry` means "this style wants ammo and the swing is unsupplied": either
       a paid rung with none left, or (AMMO_EMPTY_SLOT_IS_DRY) nothing in the
       slot at all. Derived from `mult` so the flag and the penalty are one
       statement and cannot disagree. */
    dry: mult < 1,
    mult,
  };
}
