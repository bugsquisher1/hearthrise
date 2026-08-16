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
// ⚠ WHAT IS *NOT* DONE HERE, STATED SO IT IS NOT DISCOVERED ───────────
// `simulateTick` in src/core/combat-sim.js does NOT yet call `spendForSwings`.
// That wiring is design-doc item E1, and E1 is deliberately a separate commit:
// combat-sim.js is vendored byte-for-byte into `supabase/functions/hr-accrue/`,
// its payload is SHA-pinned by `deployedPayloadGuard`, and `AWAY-1` asserts a
// seeded fight is byte-identical live and away. Landing content and an engine
// re-pin in one change means a parity failure has two candidate causes.
//
// So today this module is COMPLETE, PURE and TESTED, and it is consumed by the
// projection surface and by tests. Until E1 lands, ammo is still not spent in
// the fight — and no player-facing copy anywhere may promise that it is.
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

/* Which weapon families SPEND from the ammo slot at all.

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

/** Does this weapon family take a depletion penalty when the slot is empty? */
export function styleNeedsAmmo(weaponType) {
  return AMMO_STYLES[weaponType] === true;
}

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
 *   an ammo-hungry style with an empty slot                      -> 0.25
 */
export function ammoDamageMult({ weaponType, perShot, stock }) {
  if (!styleNeedsAmmo(weaponType)) return 1;
  if (!(Number(perShot) > 0)) return 1;      // free rung, or an empty-but-inert slot
  return (Number(stock) || 0) > 0 ? 1 : AMMO_DRY_MULT;
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
  const weaponType = (ctx && ctx.weaponType) || 'neutral';
  return {
    id,
    perShot,
    stock,
    weaponType,
    needed: styleNeedsAmmo(weaponType),
    /* `dry` means "this style wants ammo, this rung costs ammo, and there is
       none" — the only combination that pays the penalty. */
    dry: styleNeedsAmmo(weaponType) && perShot > 0 && stock <= 0,
    mult: ammoDamageMult({ weaponType, perShot, stock }),
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
 * @returns { id, spent, before, after, dryAfterSwings, mult, dry }
 *          `dryAfterSwings` is how many of the requested swings were covered
 *          before the stack emptied — `null` when it never emptied. The caller
 *          renders the moment; this function states it.
 */
export function spendForSwings(state, swings, ctx) {
  const c = ctx || {};
  const s = state || {};
  const info = readAmmo(s, c);
  const n = Math.max(0, Math.floor(Number(swings) || 0));

  const base = {
    id: info.id, spent: 0, before: info.stock, after: info.stock,
    dryAfterSwings: null, mult: info.mult, dry: info.dry,
  };
  /* Nothing to spend: melee, a free tier-1 rung, an empty slot, or zero
     swings. All four are ordinary, and none of them is an error. */
  if (!info.needed || info.perShot <= 0 || n === 0) return base;

  if (!s.ammoCarry || typeof s.ammoCarry !== 'object') s.ammoCarry = {};

  /* HOW MANY OF THESE SWINGS THE STACK ACTUALLY COVERS. Computed before the
     carry advances, because a stack that runs out partway through must charge
     only for the swings it paid for — charging for all `n` and then flooring
     the inventory at zero would silently over-bill exactly the night that
     already went wrong. */
  const covered = Math.min(n, Math.floor((info.stock - (s.ammoCarry[info.id] || 0) + 1e-9) / info.perShot));
  const owed = advanceAmmoCarry(s.ammoCarry, info.id, Math.max(0, covered), info.perShot);
  const spent = Math.min(owed, info.stock);

  if (spent > 0 && typeof c.fx?.removeItem === 'function') c.fx.removeItem(info.id, spent);

  const after = info.stock - spent;
  return {
    id: info.id,
    spent,
    before: info.stock,
    after,
    dryAfterSwings: covered < n ? covered : null,
    /* The multiplier the REMAINDER of the run earns. A run that emptied the
       stack fought its first `covered` swings supplied and the rest at 0.25 —
       the caller splits the span on `dryAfterSwings` rather than being told a
       single average, because an average is a number no tick actually ran at. */
    mult: after > 0 ? 1 : AMMO_DRY_MULT,
    dry: after <= 0,
  };
}
