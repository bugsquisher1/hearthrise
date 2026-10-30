// ============================================================
// src/data/stonecraft.js — RUNECRAFTING (and the whetstone/blank items), as data.
//
// docs/design/consumable-economy.md, rulings R1-R10. Fletching owns the
// `fletch_*` rows in slot-ladders.js — NOTHING in this file touches them.
//
// R6: Runecrafting is an ARTISAN skill: the artisan engine is generic over
// `ARTISAN_RECIPES[skill]`, so a lane is DATA — which is this file.
//
// DEMOLITION (designer ruling, 2026-10-14): the Stonemason skill was CUT and
// each of its outputs moved to the skill that consumes it — whetstones are
// smithed (src/data/recipes.js), the fine and deep blanks are cut here from
// Rune Essence, and the keystone is crafted. Quarried stone, blocks and ashlar
// were deleted. Enchant v1 went too, and with it the three elemental runes.
//
// Runecrafting is playable at level 1 with NOTHING else trained: it mines its
// own essence, cuts its own blanks, and the Local Shop also stocks Blank Runes
// (above book value, so there is no vendor arbitrage).
//
// E1, the per-swing ammo spend, LANDED 2026-08-31 — `simulateTick` charges
// `spendForSwings` every swing, so runes burn at 1/cast and whetstones at
// 0.02/swing on both the live and the away path.
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// WHY THE BATCHES ARE ~50 AND NOT ~500 — THE CLAMP IS A DESIGN INPUT
//
// `hr_apply` clamps one apply at `c_max_item_delta = 1,000,000` units of any
// single item, and the reachable offline cap is 15 hours (12 base + 3 clan).
// The seven shipped `fletch_*` rows produce 500-1,000 arrows per craft, so a
// full night on one of them moves 4.0-7.7 MILLION units, blows the clamp, and
// the server's degrade ladder halves the proposal until it fits — paying the
// player roughly an EIGHTH of their night with an incident logged on every
// rejected attempt. Security held the clamp (raising it 12x would widen the
// blast radius of every compromised apply in the game) and routed the yield
// to this desk as a design defect. `AMMO_CLAMP_BASELINE` in
// tests/accrual-engine.mjs amnesties those seven ids and RATCHETS them.
//
// NOTHING IN THIS FILE JOINS THAT LIST. Every rung below is sized so a full
// 15-hour night moves under 60% of the clamp — measured, not estimated:
//   units = floor(54,000,000 / (ms x PACE.actionMs)) x outputQty
// The worst rung here sits at 54%. The guard fails the build otherwise, which
// is the intended behaviour and the reason the numbers look the way they do.
//
// WHAT THAT COSTS THE PLAYER, ARITHMETIC FIRST: the clamp caps production at
// ~40,000 units per hour of crafting. Magic burns 1,429 runes/h (a 2,520 ms
// cast interval, measured), so ONE HOUR OF RUNECRAFTING SUPPLIES ROUGHLY A DAY
// OF CASTING — and a typical 8-hour absence costs about 23 minutes of active
// crafting. I looked hard at that number and I think it is BETTER than the
// ~4 minutes the 500-batch would have given, not merely tolerable:
//
//   • it is the right idle-game shape — active preparation, passive payoff;
//   • at 4 minutes a night the skill is a tax with a level number attached,
//     and nobody would ever choose to train it for its own sake;
//   • it leaves the ladder somewhere to go: the rungs climb in throughput as
//     well as in stat, so levelling Runecrafting visibly shortens the chore.
//
// HANDOFF TO FLETCHING: adopt these batch sizes. Arrows burn at 1,705/h
// against magic's 1,429/h, so an arrow rung at the same ~45% of clamp supplies
// a night in ~28 minutes — and `fletch_*` comes OFF the amnesty list, which
// the baseline's property (3) already reports as a stale exception waiting to
// be removed.
// ══════════════════════════════════════════════════════════════════════════

import { RUNE_FAMILIES, RUNE_TIERS, runeId, runeName } from './runes.js?v=0.2.72';

/* ── R7: ONE STAT CURVE ACROSS THE AMMO LADDERS ───────────────────────
   `2 / 3 / 5 / 8 / 11 / 14 / 18` at tiers 1-7, because arrows and whetstones
   are the SAME SLOT and no style may be quietly ahead (runes left the ladder:
   they fuel spells only, Tyler 2026-10-23). It is the curve the shipped arrow
   ladder already carries; a guard asserts them at once so a future item that
   breaks it names itself.

   And what these items DELIBERATELY DO NOT CARRY:
     • no `critB`. `equipmentStats` sums crit from every slot regardless of the
       active style, so a MELEE player equipping Dawnpoint Arrows gets +0.03
       crit for free today (measured). The shipped arrows have that leak; the
       two ladders below do not add to it.
     • no `spdB`. The best-in-slot spdB sum is 0.16 against the engine's 0.20
       clamp — the b343 speed ladder is CLOSED, and a new speed item would turn
       every future speed item into a null item.
   Whetstones carry `strB` only: they pay the one style that would ever equip them. */
const AMMO_STAT = [2, 3, 5, 8, 11, 14, 18];
const AMMO_REQ_LV = [1, 15, 30, 45, 60, 75, 88];
const AMMO_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary', 'mythic'];

/* ── THE RUNES: FAMILY x TIER (Tyler 2026-10-23, rulings of record RUNE FAMILIES and COMBAT AUDIT ANSWERS;
   src/data/runes.js is the vocabulary) ─────────────────────────────────────────────────────────────────
   A rune fuels a SPELL, never a basic attack. Each crafted family has one rune per tier, Chalked to Graven,
   named and keyed by runes.js (runeId / runeName: "graven_rupture_rune", "Graven Rupture Rune"), each bound
   from the one Blank Rune at its tier's Runecrafting level (the deeper the mark, the stronger the rune). A
   tier-N rune casts version N of its family's spells (src/data/abilities.js `versions`). The rows carry no
   strength: nothing reads a rune in the ammo slot (src/core/member.js combatWorn), and a basic attack never
   spends one (src/core/hunt/abilities.js shotLine); `ammoPerShot: 1` is the one rune a CAST spends.
   VALUES are book value by tier (PROVISIONAL, the designer re-tunes in the balance phase). The CHALKED rune
   books at 0, like every free first rung (W0, Security #1): the store's basic rune (supply-basics.js, one a
   family) costs 1 g a cast, and BASIC_AMMO_PREMIUM x 0 holds it. MEASURED on the real settle (lane
   b-spell-content): at 2 g a cast (Chalked at 1) the Sewer floor party's runes took its net under the
   Thicket's (tests/hunt-core/forest-cave.mjs first-grounds-net-chain).
   Air is a family with no rows: it is hidden until a spell spends it (Tyler 10-23), and an item with no
   source and no use is not authored (tests/catalogue-coherence.mjs C1, the W0 rule). */
const RUNE_VALUE = [0, 2, 4, 6, 9];
const RUNE_GLYPH = Object.freeze({ fire: '🔥', earth: '🌍', water: '💧', ice: '❄️', poison: '🧪', rupture: '🩸' });
/* The families bound into family x tier rows: every family a spell spends (none is hidden). The sample was the
   Fire family; the others followed in batches of 20 rows or fewer (DESIGN_STANDARDS §9). */
export const CRAFTED_RUNE_FAMILIES = Object.freeze(Object.keys(RUNE_FAMILIES).filter((f) => !RUNE_FAMILIES[f].hidden));
const runeRow = (family, t) => ({ n: runeName(family, t.tier), icon: RUNE_GLYPH[family], v: RUNE_VALUE[t.tier - 1], type: 'ammo', slot: 'ammo',
  tier: t.tier, rarity: AMMO_RARITY[t.tier - 1], reqSkill: 'magic', reqLv: t.level, ammoPerShot: 1, family, runeTier: t.tier });
const RUNE_ROWS = Object.fromEntries(CRAFTED_RUNE_FAMILIES.flatMap((f) => RUNE_TIERS.map((t) => [runeId(f, t.tier), runeRow(f, t)])));

/* ONE BIND RECIPE A RUNE: the Blank Rune in, at the tier's Runecrafting level. A deeper mark takes more stone: a
   higher tier spends more blanks and yields fewer runes a craft, so every rung turns its blanks into about 2.3-2.5x
   their value at the vendor (tests/recipe-yield-guard.mjs: a batch is no faucet past 5x). XP is book value (the old
   ladder's rungs at the same levels: 12 at 1, 185 at 30, 500 at 45, 940 at 60). Sized under the clamp like every
   rung here (the note above). */
const BIND = Object.freeze([
  { blanks: 6, qty: 45, xp: 12, ms: 3400 },
  { blanks: 12, qty: 40, xp: 60, ms: 3500 },
  { blanks: 20, qty: 36, xp: 185, ms: 3600 },
  { blanks: 28, qty: 32, xp: 500, ms: 3800 },
  { blanks: 36, qty: 28, xp: 940, ms: 4000 },
]);
const bindRecipe = (family, t) => {
  const b = BIND[t.tier - 1];
  return { id: 'bind_' + runeId(family, t.tier) + 's', name: 'Bind ' + runeName(family, t.tier) + 's', icon: RUNE_GLYPH[family],
    inputs: { rune_blank: b.blanks }, output: runeId(family, t.tier), outputQty: b.qty, xp: b.xp, req: t.level, ms: b.ms };
};
const BIND_RECIPES = CRAFTED_RUNE_FAMILIES.flatMap((f) => RUNE_TIERS.map((t) => bindRecipe(f, t)));

/* ══════════════════════════════════════════════════════════════════════════
   ITEMS
   ══════════════════════════════════════════════════════════════════════════ */
export const STONECRAFT_ITEMS = {
  /* ══ RUNE BLANKS — Runecrafting supplies itself: essence → blanks → runes.
     (The Stonemason seam was cut in the 2026-10-14 demolition.)
     W0: Runecrafting's own blank stock, mined on its bench (RAW_QUARRIED).
     v 15 keeps the essence->blank cuts at 3.0x/3.3x vendor, 1.0x/1.1x book. */
  rune_essence:    { n: 'Rune Essence',    icon: '🪨', v: 15, tier: 1, rarity: 'common' },
  rune_blank:      { n: 'Blank Rune',      icon: '⬜', v: 3,  tier: 1, rarity: 'common' },

  /* ══ RUNES — spell reagents, family x tier (RUNE_ROWS above; Tyler 2026-10-23,
     src/data/runes.js). The old one-a-family ammo ladder (Air to Blood) is gone:
     a rune fuels a spell, never a staff's blow. */
  ...RUNE_ROWS,

  /* ══ WHETSTONES — melee's ammo, and the charge-not-timer ruling (R4) ═════
     Tyler asked for "sharpening stones that temporarily increase melee weapon
     stats". A TIMED BUFF cannot deliver that in this game and the reason is
     disqualifying rather than aesthetic: the away ruling (away-time-ruling.md,
     binding) freezes buffs while the player is away — "it neither pays nor
     ticks down" — so a duration-based whetstone pays NOTHING overnight, in a
     game whose entire pitch is that it plays while you are away. It also fails
     projection: "lasts 20 minutes" is a lie the moment the tab closes.

     So the whetstone is not a buff. It is a CHARGE on the consumption channel,
     at `ammoPerShot: 0.02` — one honing per fifty swings, ~30 stones an hour.
     Consequences: it works unattended; it is projectable by the same formula
     as arrows; it does not touch `AWAY_SCOPE` at all; and the player-facing
     copy can still read "Keen edge: 8h 00m", DERIVED from stones / rate and
     never stored, so it cannot drift from the thing it describes.

     ⚠ Recorded so nobody later "fixes" this into BUFFS_DEF: making a whetstone
       a timed buff would silently return it to paying zero overnight.

     R5 — MELEE'S FLOOR STAYS FREE. Whetstones buy melee's CEILING (+14-18%
     max hit); an unsharpened sword takes no x0.25 penalty. The starting weapon
     is a Bronze Sword, so a paid melee floor would put every brand-new
     character in the penalty state from second one, and the only other way to
     price the floor is weapon durability. The asymmetry is deliberate and it
     is stated in the item copy rather than hidden.

     `strB` only — see the stat-curve note above. */
  /* THE COARSE STONE WEARS TOO (lane c-work-fixes, 2026-10-22). It was the free rung, and a whetstone
     is a CEILING, not a floor (R5): melee loses nothing when it is gone, so there is no new player to
     protect and a free stone was a free +2 strB forever. 0.02 like its ladder: one stone per fifty
     swings. The arrow's first rung stays FREE: an empty quiver IS a penalty. It books at 0 (W0). */
  coarse_whetstone:  { n: 'Coarse Whetstone',   icon: '🪨', v: 0,   type: 'ammo', slot: 'ammo', tier: 1, rarity: AMMO_RARITY[0], reqSkill: 'melee', reqLv: AMMO_REQ_LV[0], strB: AMMO_STAT[0], ammoPerShot: 0.02 },
  copper_whetstone:  { n: 'Copper Whetstone',   icon: '🪨', v: 15,  type: 'ammo', slot: 'ammo', tier: 2, rarity: AMMO_RARITY[1], reqSkill: 'melee', reqLv: AMMO_REQ_LV[1], strB: AMMO_STAT[1], ammoPerShot: 0.02 },
  iron_whetstone:    { n: 'Iron Whetstone',     icon: '🪨', v: 48,  type: 'ammo', slot: 'ammo', tier: 3, rarity: AMMO_RARITY[2], reqSkill: 'melee', reqLv: AMMO_REQ_LV[2], strB: AMMO_STAT[2], ammoPerShot: 0.02 },
  steel_whetstone:   { n: 'Steel Whetstone',    icon: '🪨', v: 108, type: 'ammo', slot: 'ammo', tier: 4, rarity: AMMO_RARITY[3], reqSkill: 'melee', reqLv: AMMO_REQ_LV[3], strB: AMMO_STAT[3], ammoPerShot: 0.02 },
  mithril_whetstone: { n: 'Mithril Whetstone',  icon: '🪨', v: 190, type: 'ammo', slot: 'ammo', tier: 5, rarity: AMMO_RARITY[4], reqSkill: 'melee', reqLv: AMMO_REQ_LV[4], strB: AMMO_STAT[4], ammoPerShot: 0.02 },
  rune_whetstone:    { n: 'Rune Whetstone',     icon: '🪨', v: 365, type: 'ammo', slot: 'ammo', tier: 6, rarity: AMMO_RARITY[5], reqSkill: 'melee', reqLv: AMMO_REQ_LV[5], strB: AMMO_STAT[5], ammoPerShot: 0.02 },
  dawn_whetstone:    { n: 'Dawnsteel Whetstone',icon: '🪨', v: 990, type: 'ammo', slot: 'ammo', tier: 7, rarity: AMMO_RARITY[6], reqSkill: 'melee', reqLv: AMMO_REQ_LV[6], strB: AMMO_STAT[6], ammoPerShot: 0.02 },

};

/* ══════════════════════════════════════════════════════════════════════════
   RECIPES

   XP is BOOK VALUE. The player receives `book x PACE.xp (0.39)` at the one
   choke-point, and the tiles print the effective number — never the book one.
   Calibrated so both skills land in the 25-35 hour band that Smithing (27.8 h)
   and Crafting (25.5 h) already occupy: anything slower would be a second
   Cooking (155 h), anything faster would be free. An artisan skill's real cost
   is its INPUT CHAIN, not its XP treadmill, which is exactly why three artisan
   skills add progression depth without adding a second grind.
   ══════════════════════════════════════════════════════════════════════════ */
export const STONECRAFT_RECIPES = {
  runecrafting: [
    /* W0 RUNECRAFTING RULING (2026-10-09): the first rung makes a SPENT rune
       (every family's Chalked rune, at 1); the skill mines its own essence (a
       bench row paid to Mining, the quarry pattern: a level-1 ROCKS node would
       break the one-node-per-level bench gate) and cuts its own blanks. */
    { id: 'cut_rune_blanks',    name: 'Cut Blank Runes',      icon: '⬜', inputs: { rune_essence: 4 },            output: 'rune_blank', outputQty: 12, xp: 8,   req: 1,  ms: 2800 },
    { id: 'split_rune_blanks',  name: 'Split Blank Runes',    icon: '⬜', inputs: { rune_essence: 6 },            output: 'rune_blank', outputQty: 6,  xp: 40,  req: 12, ms: 3000 },
    /* THE BIND LADDER (lane b-spell-content, Tyler 2026-10-23): one bind a rune, family x tier (BIND_RECIPES
       above), the Blank Rune in, a new tier every 15 levels from 1 to 60. Runecrafting above 60 waits on later
       content (Tyler 10-23: more tiers and spells later). */
    ...BIND_RECIPES,
    /* (The Fine and Deep Blank Runes and their cuts left with the family x tier runes, 2026-10-23: every tier is
       bound from the one Blank Rune, the designer's d3-tiers.) */
  ],
};
