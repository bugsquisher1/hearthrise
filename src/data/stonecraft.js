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

/* ── R7: ONE STAT CURVE ACROSS ALL THREE AMMO LADDERS ─────────────────
   `2 / 3 / 5 / 8 / 11 / 14 / 18` at tiers 1-7, because arrows, runes and
   whetstones are the SAME SLOT and no style may be quietly ahead. It is the
   curve the shipped arrow ladder already carries; a guard asserts all three
   at once so a future item that breaks it names itself.

   And what these items DELIBERATELY DO NOT CARRY:
     • no `critB`. `equipmentStats` sums crit from every slot regardless of the
       active style, so a MELEE player equipping Dawnpoint Arrows gets +0.03
       crit for free today (measured). The shipped arrows have that leak; the
       two ladders below do not add to it.
     • no `spdB`. The best-in-slot spdB sum is 0.16 against the engine's 0.20
       clamp — the b343 speed ladder is CLOSED, and a new speed item would turn
       every future speed item into a null item.
   Runes carry `magicStrB` only; whetstones carry `strB` only. Each pays the
   one style that would ever equip it. */
const AMMO_STAT = [2, 3, 5, 8, 11, 14, 18];
const AMMO_REQ_LV = [1, 15, 30, 45, 60, 75, 88];
const AMMO_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary', 'mythic'];

/* ── THE TIER-1 RUNG IS FREE, AND IT IS A RULING ──────────────────────
   `ammoPerShot: 0` on the first rung of every ladder. The b343 ruling derived
   it for arrows and it applies identically here: a tier-1 caster fires ~13,900
   times across an 8-hour absence and grosses ~18,600 gold doing it, so there
   is NO integer price at which tier-1 ammo costs less than a third of the
   income it earns. Training ammo, permanently. The supply loop starts at
   tier 2, where the same night costs a real but bounded share of gross.

   Consequence worth knowing rather than discovering (it is true of Bronze
   Arrows today too): at `ammoPerShot: 0` a single Air Rune is a permanent
   supply, so the batch of 42 is generous rather than necessary. That is fine —
   it is a clean first Runecrafting action and an honest XP rung. */
/* W0 (Security #1): the free tier-1 rungs also BOOK at v 0 — they are kit and
   shop stock, so a vendor bid would turn every new kit and every shop bundle
   into gold (the 1 g floor made the 50% buy-back cap unreachable). */
const FREE = 0;

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
  fine_rune_blank: { n: 'Fine Blank Rune', icon: '🔲', v: 28, tier: 3, rarity: 'uncommon' },
  deep_rune_blank: { n: 'Deep Blank Rune', icon: '🔳', v: 60, tier: 5, rarity: 'rare' },

  /* ══ RUNES — magic's ammo. The staff has a socket; you load a bound rune ══
     Values are IDENTICAL to the arrow ladder at every tier (1/1/2/4/6/9/12).
     R7's real claim is not "the numbers match" but "the gold-per-hour cost of
     being fully supplied is the same for all three styles"; the item value is
     an OUTPUT of that constraint, bounded by the anti-faucet rule, not a
     number anybody chose.

     The names are picked so PHASE TWO can hang elements on them with no
     renames — an Ice Troll weak to both arrows and fire is the target shape,
     and none of it ships in round 2. */
  air_rune:   { n: 'Air Rune',   icon: '🌀', v: 0,  type: 'ammo', slot: 'ammo', tier: 1, rarity: AMMO_RARITY[0], reqSkill: 'magic', reqLv: AMMO_REQ_LV[0], magicStrB: AMMO_STAT[0], ammoPerShot: FREE },
  earth_rune: { n: 'Earth Rune', icon: '🌍', v: 1,  type: 'ammo', slot: 'ammo', tier: 2, rarity: AMMO_RARITY[1], reqSkill: 'magic', reqLv: AMMO_REQ_LV[1], magicStrB: AMMO_STAT[1], ammoPerShot: 1 },
  water_rune: { n: 'Water Rune', icon: '💧', v: 2,  type: 'ammo', slot: 'ammo', tier: 3, rarity: AMMO_RARITY[2], reqSkill: 'magic', reqLv: AMMO_REQ_LV[2], magicStrB: AMMO_STAT[2], ammoPerShot: 1 },
  fire_rune:  { n: 'Fire Rune',  icon: '🔥', v: 4,  type: 'ammo', slot: 'ammo', tier: 4, rarity: AMMO_RARITY[3], reqSkill: 'magic', reqLv: AMMO_REQ_LV[3], magicStrB: AMMO_STAT[3], ammoPerShot: 1 },
  chaos_rune: { n: 'Chaos Rune', icon: '🌪️', v: 6,  type: 'ammo', slot: 'ammo', tier: 5, rarity: AMMO_RARITY[4], reqSkill: 'magic', reqLv: AMMO_REQ_LV[4], magicStrB: AMMO_STAT[4], ammoPerShot: 1 },
  death_rune: { n: 'Death Rune', icon: '💀', v: 9,  type: 'ammo', slot: 'ammo', tier: 6, rarity: AMMO_RARITY[5], reqSkill: 'magic', reqLv: AMMO_REQ_LV[5], magicStrB: AMMO_STAT[5], ammoPerShot: 1 },
  blood_rune: { n: 'Blood Rune', icon: '🩸', v: 12, type: 'ammo', slot: 'ammo', tier: 7, rarity: AMMO_RARITY[6], reqSkill: 'magic', reqLv: AMMO_REQ_LV[6], magicStrB: AMMO_STAT[6], ammoPerShot: 1 },

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
  coarse_whetstone:  { n: 'Coarse Whetstone',   icon: '🪨', v: 0,   type: 'ammo', slot: 'ammo', tier: 1, rarity: AMMO_RARITY[0], reqSkill: 'attack', reqLv: AMMO_REQ_LV[0], strB: AMMO_STAT[0], ammoPerShot: FREE },
  copper_whetstone:  { n: 'Copper Whetstone',   icon: '🪨', v: 15,  type: 'ammo', slot: 'ammo', tier: 2, rarity: AMMO_RARITY[1], reqSkill: 'attack', reqLv: AMMO_REQ_LV[1], strB: AMMO_STAT[1], ammoPerShot: 0.02 },
  iron_whetstone:    { n: 'Iron Whetstone',     icon: '🪨', v: 48,  type: 'ammo', slot: 'ammo', tier: 3, rarity: AMMO_RARITY[2], reqSkill: 'attack', reqLv: AMMO_REQ_LV[2], strB: AMMO_STAT[2], ammoPerShot: 0.02 },
  steel_whetstone:   { n: 'Steel Whetstone',    icon: '🪨', v: 108, type: 'ammo', slot: 'ammo', tier: 4, rarity: AMMO_RARITY[3], reqSkill: 'attack', reqLv: AMMO_REQ_LV[3], strB: AMMO_STAT[3], ammoPerShot: 0.02 },
  mithril_whetstone: { n: 'Mithril Whetstone',  icon: '🪨', v: 190, type: 'ammo', slot: 'ammo', tier: 5, rarity: AMMO_RARITY[4], reqSkill: 'attack', reqLv: AMMO_REQ_LV[4], strB: AMMO_STAT[4], ammoPerShot: 0.02 },
  rune_whetstone:    { n: 'Rune Whetstone',     icon: '🪨', v: 365, type: 'ammo', slot: 'ammo', tier: 6, rarity: AMMO_RARITY[5], reqSkill: 'attack', reqLv: AMMO_REQ_LV[5], strB: AMMO_STAT[5], ammoPerShot: 0.02 },
  dawn_whetstone:    { n: 'Dawnsteel Whetstone',icon: '🪨', v: 990, type: 'ammo', slot: 'ammo', tier: 7, rarity: AMMO_RARITY[6], reqSkill: 'attack', reqLv: AMMO_REQ_LV[6], strB: AMMO_STAT[6], ammoPerShot: 0.02 },

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
    /* ── THE BIND LADDER. Seven tiers, plus four "Deepbind" rungs that are
       strictly better on BOTH axes a player cares about — more runes per
       action AND more runes per blank. Seven rungs across 1-88 is a rung every
       twelve levels, which reads thin; interleaved with the Deepbinds it is a
       rung every ~8, which is the density pacing-overhaul asks for. */
    /* W0 RUNECRAFTING RULING (2026-10-09): the first rung makes a SPENT rune
       (Earth, at 1); air runes are kit + shop only; the skill mines its own
       essence (a bench row paid to Mining, the quarry pattern: a level-1 ROCKS
       node would break the one-node-per-level bench gate) and cuts its own
       blanks. */
    { id: 'cut_rune_blanks',    name: 'Cut Blank Runes',      icon: '⬜', inputs: { rune_essence: 4 },            output: 'rune_blank', outputQty: 12, xp: 8,   req: 1,  ms: 2800 },
    { id: 'bind_earth_runes',   name: 'Bind Earth Runes',     icon: '🌍', inputs: { rune_blank: 6 },              output: 'earth_rune', outputQty: 45, xp: 12,  req: 1,  ms: 3400 },
    { id: 'split_rune_blanks',  name: 'Split Blank Runes',    icon: '⬜', inputs: { rune_essence: 6 },            output: 'rune_blank', outputQty: 6,  xp: 40,  req: 12, ms: 3000 },
    { id: 'deepbind_earth',     name: 'Deepbind Earth Runes', icon: '🌍', inputs: { rune_blank: 7 },              output: 'earth_rune', outputQty: 58, xp: 105,  req: 24, ms: 3600 },
    { id: 'bind_water_runes',   name: 'Bind Water Runes',     icon: '💧', inputs: { rune_blank: 6, coal: 1 },     output: 'water_rune', outputQty: 48, xp: 185,  req: 30, ms: 3600 },
    { id: 'deepbind_water',     name: 'Deepbind Water Runes', icon: '💧', inputs: { rune_blank: 7, coal: 1 },     output: 'water_rune', outputQty: 60, xp: 330, req: 39, ms: 3800 },
    { id: 'bind_fire_runes',    name: 'Bind Fire Runes',      icon: '🔥', inputs: { fine_rune_blank: 6, coal: 1 },output: 'fire_rune',  outputQty: 50, xp: 500, req: 45, ms: 3800 },
    { id: 'bind_chaos_runes',   name: 'Bind Chaos Runes',     icon: '🌪️', inputs: { fine_rune_blank: 6 },         output: 'chaos_rune', outputQty: 54, xp: 940, req: 60, ms: 4000 },
    { id: 'deepbind_chaos',     name: 'Deepbind Chaos Runes', icon: '🌪️', inputs: { fine_rune_blank: 7 },         output: 'chaos_rune', outputQty: 64, xp: 1400, req: 69, ms: 4200 },
    { id: 'bind_death_runes',   name: 'Bind Death Runes',     icon: '💀', inputs: { deep_rune_blank: 6 },         output: 'death_rune', outputQty: 56, xp: 1500, req: 75, ms: 4200 },
    { id: 'bind_blood_runes',   name: 'Bind Blood Runes',     icon: '🩸', inputs: { deep_rune_blank: 6 },         output: 'blood_rune', outputQty: 58, xp: 2200,req: 88, ms: 4400 },
    { id: 'deepbind_blood',     name: 'Deepbind Blood Runes', icon: '🩸', inputs: { deep_rune_blank: 7 },         output: 'blood_rune', outputQty: 68, xp: 2900,req: 93, ms: 4600 },

    /* ── THE GRADED BLANKS (designer ruling, demolition 2026-10-14). The
       Stonemason bench was cut, so the fine and deep blanks are cut here from
       Rune Essence like the base blank. `magic_essence` still enters at the
       DEEP blank and nowhere below it. Numbers UNVERIFIED until a sim run. */
    { id: 'cut_fine_blanks',    name: 'Cut Fine Blank Runes', icon: '🔲', inputs: { rune_essence: 6, coal: 3 },                     output: 'fine_rune_blank', outputQty: 14, xp: 400,  req: 38, ms: 3400 },
    { id: 'cut_deep_blanks',    name: 'Cut Deep Blank Runes', icon: '🔳', inputs: { fine_rune_blank: 14, coal: 4, magic_essence: 2 }, output: 'deep_rune_blank', outputQty: 20, xp: 1500, req: 74, ms: 4000 },
  ],
};
