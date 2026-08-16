// ============================================================
// src/data/library2-items.js — THE APPROVED ITEM CATALOGUE (review book, Library 2)
//
// SOURCE OF TRUTH: docs/design/review-book-content.md §2B (ITEM-PLAN-*) and §2C
// (ITEM-NEW-*), approved in full by Tyler on 2026-08-16
// (.claude/coordination/DECISIONS.md, "REVIEW BOOK ROUND 2"). The six rejected
// candidates — ITEM-NEW-01, -06, -18, -19, -22, -27 — are absent and their ids
// are retired, not reused. Names are the doc's verbatim, including Tyler's
// renames (Lazlo's Maul, Dragonrib Bow, Rat Stick, Bramble Blade).
//
// ⚖ LEGAL, BINDING: ITEM-NEW-02 "Lazlo's Maul" carries Tyler's name and its
//   description must NEVER reference any television show or any property. Its
//   fiction is a grave-robbing blacksmith of that name and nothing else. Called
//   out at the point of authorship so a later flavour pass cannot drift it.
//
// ── HOW THIS FILE IS ORGANISED, AND WHY IT IS ONE FILE ─────────────────────
// It follows the shape wave3-uniques.js and slot-ladders.js established: a data
// module that exports items + recipes + flavour, spread into ITEMS /
// ARTISAN_RECIPES / ITEM_DESC by their owning modules. One file rather than
// six because these ~86 rows were approved as ONE decision and share one power
// budget; splitting them would put the budget argument in no file at all.
//
// ── THE THREE LANDING STATES (read this before adding a row) ───────────────
// Not every approved item can be PLAYED today; several need engines that are
// separate workstreams. Each row is therefore in exactly one state, and the
// state is data, not a comment:
//
//   1. PLAYABLE   — has a faucet (a recipe below) and every effect it declares
//                   is live. A player can get it and it does what it says.
//   2. `effects:` with a non-live kind → CATALOGUED, NOT OBTAINABLE. No recipe,
//                   no drop, no shop. The id, stats, value, description, server
//                   catalogue row and icon slot all exist; the item does not
//                   enter the world until its engine does. See
//                   src/data/item-effects.js for the guard that inverts the day
//                   the engine lands.
//   3. `pendingSkill:` — the item belongs to a skill that does not exist yet
//                   (Fletching / Runecrafting / Stonemason). Same treatment,
//                   different axis, same self-closing guard.
//
// States 2 and 3 are worth landing precisely because the id is the SAVE KEY and
// the server catalogue is generated from this table: getting the ids and the
// stat curves right ONCE, now, is what stops a later content wave from being a
// migration.
//
// ── THE POWER FUSE ─────────────────────────────────────────────────────────
// docs/design/pacing-overhaul.md's permanent stack is +52% (fuse ≤ 0.60), and
// src/features/power-budget.js clamps each GOVERNED key at 0.20 permanent /
// 0.15 temporary. **NOT ONE ITEM IN THIS FILE ADDS TO A GOVERNED getBonus KEY.**
// That is an invariant with a test, not a coincidence:
//   • bane is a class multiplier inside weaknessInfo (src/core/bane.js) —
//     outside the fuse by construction, and scoped to one class;
//   • the armour sets carry defB and the triangle fields, which are combat
//     stats, not throughput multipliers;
//   • the tool ladders carry toolSpeed, which src/core/tools.js applies
//     directly and which has never been inside getBonus;
//   • every "costs budget" card in the review book (Traveller's Stew, Kettle
//     Tea, Surveyor's Chain, the two tool ladders) lands in state 2 or 3, so it
//     spends NOTHING today and its magnitude is the Designer's call on the day
//     its engine ships.
// Net permanent budget consumed by this landing: **0.00 of the +52%.**
//
// ── STAT DERIVATION ────────────────────────────────────────────────────────
// Nothing here is invented. Weapons take their tier's family curve from
// gear-tiers.js WEAPON_FAMILIES and are then scaled to ~85%, because a bane
// weapon must be a SECOND weapon on the belt and not a strict upgrade — if it
// beat the generic rung outright the "keep two weapons" decision the review
// book is buying would not exist. Armour sets take their line's exact generated
// stat block (ARMOUR_SLOTS.def × line.defMul, plus line.fields) because an
// alternate SUPPLY CHAIN at the same tier must be the same POWER — otherwise it
// is not an alternative, it is a tier. Values use round5(vmul × tier.value ×
// line.vmul), the same expression the generator uses.
// ============================================================

import { MAX_BANE_MULT } from '../core/bane.js?v=359';

/* The generator's own value expression, so a hand-authored rung and a generated
   one can never price differently. Kept local rather than exported from
   gear-tiers.js only because that module does not export it today. */
const TIER_VALUE = [0.6, 1.3, 5, 15, 45, 130, 360];
const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);
const priced = (vmul, tier, lineMul) => round5(vmul * TIER_VALUE[tier - 1] * (lineMul || 1));

/* Bane is authored once, here, so no row can typo the magnitude. The review
   book approved +40% for all five; MAX_BANE_MULT is the formula's ceiling and
   this is the table's single value. */
const BANE = (cls) => ({ class: cls, mult: MAX_BANE_MULT });

/* ══════════════════════════════════════════════════════════════════════════
   1 · BANE GEAR — ITEM-NEW-02/03/04/05/07          STATE: PLAYABLE
   The OSRS steal that makes the taxonomy matter. Each targets ONE of the
   eleven classes in Library 1 §1A. The multiplier lives in `bane` and is read
   by weaknessInfo; it is NOT a getBonus key — see src/core/bane.js for why
   that distinction is the difference between working and reading zero while
   the player is asleep.
   ══════════════════════════════════════════════════════════════════════════ */
const BANE_GEAR = {
  // ITEM-NEW-02 · hammer T4 · vs Undead. Warhammer T4 curve (14/28) × 0.85.
  lazlos_maul: {
    n: "Lazlo's Maul", icon: '🔨', v: priced(110, 4), type: 'weapon', slot: 'weapon',
    weaponType: 'hammer', atkB: 12, strB: 24, tier: 4, rarity: 'epic',
    reqSkill: 'attack', reqLv: 45, bane: BANE('undead'), effects: ['bane'],
  },
  // ITEM-NEW-03 · ranged T6 · vs Dragon. Bow T6 curve (35/28) × 0.85.
  dragonrib_bow: {
    n: 'Dragonrib Bow', icon: '🏹', v: priced(105, 6), type: 'weapon', slot: 'weapon',
    weaponType: 'ranged', atkB: 30, strB: 24, rangeAtkB: 30, rangeStrB: 24,
    tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: 75,
    bane: BANE('dragon'), effects: ['bane'],
  },
  // ITEM-NEW-04 · sword T2 · vs Plant. Sword T2 curve (7/6) × 0.85. Cheap and
  // early on purpose: T2 is where the bane grammar is taught.
  bramble_blade: {
    n: 'Bramble Blade', icon: '⚔️', v: priced(100, 2), type: 'weapon', slot: 'weapon',
    weaponType: 'sword', atkB: 6, strB: 5, tier: 2, rarity: 'uncommon',
    reqSkill: 'attack', reqLv: 15, bane: BANE('plant'), effects: ['bane'],
  },
  // ITEM-NEW-05 · magic T5 · vs Extra Dimensional. Staff T5 curve (21/29) × 0.85.
  // The review book also gives it "reveals the hidden element weakness"; that is
  // `reveal_hidden_weak` and it is NOT live — the element axis does not exist.
  // The censer therefore ships on its bane alone and its description promises
  // nothing else. Flagged in the change contract.
  void_censer: {
    n: 'Void Censer', icon: '🪔', v: priced(100, 5), type: 'weapon', slot: 'weapon',
    weaponType: 'magic', atkB: 18, strB: 25, magicAtkB: 18, magicStrB: 25,
    tier: 5, rarity: 'legendary', reqSkill: 'magic', reqLv: 60,
    bane: BANE('extra_dimensional'), effects: ['bane'],
  },
  // ITEM-NEW-07 · hammer T3 · vs Vermin. Warhammer T3 curve (9/19) × 0.85.
  rat_stick: {
    n: 'Rat Stick', icon: '🔨', v: priced(110, 3), type: 'weapon', slot: 'weapon',
    weaponType: 'hammer', atkB: 8, strB: 16, tier: 3, rarity: 'rare',
    reqSkill: 'attack', reqLv: 30, bane: BANE('vermin'), effects: ['bane'],
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   2 · ARMOUR SETS + THE MATERIALS THAT CLOSE FOUR ORPHAN DROPS
   ITEM-NEW-32/33/34/43/44                          STATE: PLAYABLE

   Stats are the GENERATED block for their line and tier, to the number. An
   alternate supply chain at the same tier must be the same power — otherwise
   it is a tier, not an alternative, and the review book's whole argument for
   Chitin Weave ("the second armour supply chain") evaporates.

   armorSetBonus (src/core/combat.js) keys on `tier|armourClass`, so Chitin
   pieces set-bonus interchangeably with Snakeskin. That is deliberate: the
   standing mix-and-match ruling in gear-tiers.js says a player must be able to
   combine lines, and two T4 leather supply chains that could not complete a set
   together would be a trap.
   ══════════════════════════════════════════════════════════════════════════ */

/* Leather T4 (defMul 0.55, vmul 0.70) — the exact generated numbers. */
const chitin = (slot, base, def, vmul) => ({
  n: 'Chitin ' + slot.label, icon: '🪲', v: priced(vmul, 4, 0.70), type: 'armor',
  slot: slot.slot, defB: def, armourClass: 'leather', rarity: 'epic', tier: 4,
  reqSkill: 'defense', reqLv: 45,
  rangeAtkB: Math.round(base * 0.5), critB: 0.016, magicAtkB: -Math.round(base * 0.15),
});
/* Plate T5 (defMul 1.00, vmul 1.00). */
const watch = (slot, base, vmul) => ({
  n: 'Watchknight ' + slot.label, icon: '🛡️', v: priced(vmul, 5), type: 'armor',
  slot: slot.slot, defB: base, armourClass: 'plate', rarity: 'legendary', tier: 5,
  reqSkill: 'defense', reqLv: 60,
  rangeAtkB: -Math.round(base * 0.25), magicAtkB: -Math.round(base * 0.5),
  /* The review book's set identity is "damage taken WHILE AWAY reduced". That
     needs src/core/away.js AWAY_SCOPE and is not built, so it is declared and
     dormant. The pieces still ship PLAYABLE because they are honest plate at
     their tier and because they are the only sink that closes `death_steel`
     (a live orphan drop, ITEM-NEW-43's whole purpose). Their descriptions
     promise the armour, never the unshipped bonus. Flagged in the contract. */
  awayEffect: 'away_mitigation',
});

const SL = {
  helmet: { slot: 'helmet', label: 'Helm' }, body: { slot: 'body', label: 'Cuirass' },
  pants: { slot: 'pants', label: 'Greaves' }, boots: { slot: 'boots', label: 'Boots' },
  gloves: { slot: 'gloves', label: 'Gauntlets' }, belt: { slot: 'belt', label: 'Belt' },
};
const SLC = {
  helmet: { slot: 'helmet', label: 'Coif' }, body: { slot: 'body', label: 'Body' },
  pants: { slot: 'pants', label: 'Chaps' }, boots: { slot: 'boots', label: 'Boots' },
  gloves: { slot: 'gloves', label: 'Vambraces' }, belt: { slot: 'belt', label: 'Belt' },
};

const ARMOUR_SETS = {
  // ITEM-NEW-32 · Chitin Weave (6) — leather T4 from Vermin chitin, not pelts.
  chitin_helmet: chitin(SLC.helmet, 16, 9, 120),
  chitin_body:   chitin(SLC.body, 34, 19, 300),
  chitin_pants:  chitin(SLC.pants, 24, 13, 220),
  chitin_boots:  chitin(SLC.boots, 11, 6, 80),
  chitin_gloves: chitin(SLC.gloves, 8, 4, 70),
  chitin_belt:   chitin(SLC.belt, 11, 6, 80),

  // ITEM-NEW-33 · Watchknight Shell (6) — plate T5, forged from Deathsteel.
  watchknight_helmet: watch(SL.helmet, 24, 120),
  watchknight_body:   watch(SL.body, 50, 300),
  watchknight_pants:  watch(SL.pants, 35, 220),
  watchknight_boots:  watch(SL.boots, 16, 80),
  watchknight_gloves: watch(SL.gloves, 12, 70),
  watchknight_belt:   watch(SL.belt, 16, 80),

  /* ITEM-NEW-34 · Quiet Coat — cloth T6 body, the generated block exactly
     (def 68 × 0.30 = 20; magicAtkB 41, magicStrB 27, atkB −17, rangeAtkB −14).

     ⚠ THE ONE DELIBERATE COMPROMISE IN THIS FILE, stated rather than buried.
     Its signature effect (Extra Dimensional monsters lose their first strike)
     has no engine — there is no first-strike model at all. It nonetheless ships
     PLAYABLE, because it is the sink for `voidchitin_weave`, which is the only
     thing that closes `void_chitin` + `hell_ember` + `war_crown` (ITEM-NEW-44,
     three live orphan drops). Held back, the coat strands the material that was
     approved specifically to un-strand three others. It is honest cloth armour
     at its tier and its description says exactly that and nothing more.
     Designer/Coordinator: this is the one card to re-read at integration. */
  quiet_coat: {
    n: 'Quiet Coat', icon: '🧥', v: priced(300, 6, 0.70), type: 'armor', slot: 'body',
    defB: 20, armourClass: 'cloth', rarity: 'legendary', tier: 6,
    reqSkill: 'defense', reqLv: 75,
    magicAtkB: 41, magicStrB: 27, atkB: -17, rangeAtkB: -14,
    awayEffect: 'first_strike_deny',
  },

  // ITEM-NEW-43 · Deathsteel Ingot — gives `death_steel` (live orphan, Death
  // Knight 25%) its first recipe. Material tier 5, priced on the bar curve
  // (rune_bar 1200) because that is what it competes with at the forge.
  deathsteel_bar: { n: 'Deathsteel Ingot', icon: '⚙️', v: 1500, tier: 5, tag: 'crafting-mat', rarity: 'epic' },

  // ITEM-NEW-44 · Void-Chitin Weave — one endgame target for three orphans.
  voidchitin_weave: { n: 'Void-Chitin Weave', icon: '🕸️', v: 4200, tier: 6, tag: 'crafting-mat', rarity: 'legendary' },
};

/* ══════════════════════════════════════════════════════════════════════════
   3 · CHARMS · CONSUMABLES · UTILITY · IDENTITY GEAR · COSMETICS
   ITEM-NEW-08..17, 20, 21, 23..26, 28..31, 35..40   STATE: CATALOGUED, NOT OBTAINABLE

   Every row here declares an `effects` kind that no engine reads yet, so the
   reachability guard requires it to have NO faucet and the effect guard
   requires that to stay true until the engine lands. The stats and values are
   still derived properly, because the ID IS THE SAVE KEY and the server
   catalogue is generated from this table — doing it right once now is what
   stops the engine wave from also being a migration.
   ══════════════════════════════════════════════════════════════════════════ */
const DORMANT = {
  /* ── Charms & amulets (Tibia's bestiary-charm idea as equipment) ── */
  // ITEM-NEW-08 · necklace T3. Jewelry values follow slot-ladders' necklace lane.
  hunters_torc:    { n: "Hunter's Torc", icon: '📿', v: priced(150, 3), type: 'jewelry', slot: 'necklace', tier: 3, rarity: 'rare', effects: ['drop_band_vs_class'], baneClassHint: 'mammal' },
  // ITEM-NEW-09 · necklace T4.
  frost_locket:    { n: 'Frost Locket', icon: '📿', v: priced(150, 4), type: 'jewelry', slot: 'necklace', tier: 4, rarity: 'epic', effects: ['element_pierce'] },
  // ITEM-NEW-10 · ring T2. Pure progression, zero combat power — no stats at all,
  // which is the point: it is the first item in Hearthrise that is worth wearing
  // and makes you no stronger.
  tally_ring:      { n: 'Tally Ring', icon: '💍', v: priced(140, 2), type: 'jewelry', slot: 'ring', tier: 2, rarity: 'uncommon', effects: ['bestiary_rate'] },
  // ITEM-NEW-11/12/13 · earrings T4/T3/T6 — the slot that was empty until b343.
  bone_earrings:      { n: 'Bone Earrings', icon: '🦴', v: priced(130, 4), type: 'jewelry', slot: 'earrings', tier: 4, rarity: 'epic', effects: ['passive_bone_prayer'] },
  pathfinder_studs:   { n: 'Pathfinder Studs', icon: '🧭', v: priced(130, 3), type: 'jewelry', slot: 'earrings', tier: 3, rarity: 'rare', effects: ['ui_next_threshold'] },
  unlit_earrings:     { n: 'Unlit Earrings', icon: '🌑', v: priced(130, 6), type: 'jewelry', slot: 'earrings', tier: 6, rarity: 'legendary', effects: ['reveal_hidden_weak'] },

  /* ── Consumables ── */
  // ITEM-NEW-14 · food T1. Heals over N swings instead of instantly. NO `heals`
  // field: a `heals` value would make foodClassOf() answer 'healing' and let
  // auto-eat spend it as an ordinary heal, which is the opposite of the design.
  hearthbread:     { n: 'Hearthbread', icon: '🍞', v: 30, foodTier: 1, effects: ['heal_over_swings'] },
  // ITEM-NEW-15 · food (buff) T2. "costs (small)" in the review book — it spends
  // nothing today because next_tier_yield is an output proc, and §2.5 of the
  // bonus grammar puts output procs outside the governed keys regardless.
  travellers_stew: { n: "Traveller's Stew", icon: '🍲', v: 180, foodTier: 2, foodClass: 'buff', effects: ['next_tier_yield'] },
  // ITEM-NEW-16 · consumable T4. CHARGES, not a timer (the b336 rule).
  winterdraught:   { n: 'Winterdraught', icon: '🍶', v: 900, charges: 1, effects: ['element_pierce'] },
  // ITEM-NEW-17 · utility T1. Turns a farm plot into a combat faucet.
  ratters_bait:    { n: "Ratter's Bait", icon: '🧀', v: 40, effects: ['spawn_class_local'], baneClassHint: 'vermin' },
  // ITEM-NEW-20 · consumable T4. Hard-capped at once per real day, and that cap
  // MUST be a server ledger — a client-side daily counter is a forged value.
  grave_salt:      { n: 'Grave Salt', icon: '🧂', v: 1200, charges: 1, effects: ['guaranteed_rare'] },
  // ITEM-NEW-21 · food (buff) T2. "costs (2%)" — adds to whichever blessing is
  // ACTIVE, which is why it cannot be a fixed getBonus key.
  kettle_tea:      { n: 'Kettle Tea', icon: '🍵', v: 200, foodTier: 2, foodClass: 'buff', effects: ['blessing_amplify'] },

  /* ── Utility — items that change what you can DO ── */
  field_ledger:    { n: 'Field Ledger', icon: '📒', v: 600, effects: ['queue_slot'] },              // ITEM-NEW-23 · T2
  tithe_box:       { n: 'Tithe Box', icon: '🧰', v: 6000, effects: ['auto_vendor_marked'] },        // ITEM-NEW-24 · T4
  carters_strap:   { n: "Carter's Strap", icon: '🎒', v: 2500, effects: ['market_slot'] },          // ITEM-NEW-25 · T3
  // ITEM-NEW-26 · tool T5. `type:'tool'` is withheld deliberately: a tool row is
  // picked up by bestTool() the moment it is in the bag, and this one has no
  // toolSkill an engine serves. It becomes a tool when byproduct_upgrade ships.
  surveyors_chain: { n: "Surveyor's Chain", icon: '⛓️', v: 12000, effects: ['byproduct_upgrade'] },

  /* ── Gear with identity ── */
  // ITEM-NEW-28 · body T6 plate. A real trade, so it cannot ship on stats alone.
  colossus_plate:  { n: 'Colossus Plate', icon: '🛡️', v: priced(300, 6), type: 'armor', slot: 'body', defB: 68, armourClass: 'plate', rarity: 'legendary', tier: 6, reqSkill: 'defense', reqLv: 75, rangeAtkB: -17, magicAtkB: -34, effects: ['sunder_vs_class'] },
  // ITEM-NEW-29 · cape T6.
  heartwood_cape:  { n: 'Heartwood Cape', icon: '🦸', v: priced(90, 6), type: 'armor', slot: 'cape', defB: 12, atkB: 5, rarity: 'legendary', tier: 6, effects: ['regen_vs_class'] },
  // ITEM-NEW-30 · helmet T6 plate.
  draconias_jaw:   { n: "Draconia's Jaw", icon: '⛑️', v: priced(120, 6), type: 'armor', slot: 'helmet', defB: 33, armourClass: 'plate', rarity: 'legendary', tier: 6, reqSkill: 'defense', reqLv: 75, rangeAtkB: -8, magicAtkB: -17, effects: ['element_immunity'] },
  // ITEM-NEW-31 · gloves T2. The first real build decision, at T2.
  cutpurse_gloves: { n: 'Cutpurse Gloves', icon: '🧤', v: priced(70, 2), type: 'armor', slot: 'gloves', defB: 3, armourClass: 'leather', rarity: 'uncommon', tier: 2, reqSkill: 'defense', reqLv: 15, effects: ['gold_vs_class'] },
  // ITEM-NEW-35 · boots T6. A gate key wearing armour.
  pitlord_irons:   { n: 'Pitlord Irons', icon: '🥾', v: priced(80, 6), type: 'armor', slot: 'boots', defB: 22, armourClass: 'plate', rarity: 'legendary', tier: 6, reqSkill: 'defense', reqLv: 75, rangeAtkB: -6, magicAtkB: -11, effects: ['arena_key'] },

  /* ── Cosmetics with function ── */
  bestiary_cloak:    { n: 'Bestiary Cloak', icon: '🦸', v: 0, type: 'armor', slot: 'cape', defB: 0, tag: 'cosmetic', rarity: 'epic', effects: ['cosmetic_dyed'] },       // ITEM-NEW-36
  hearthstone_signet:{ n: 'Hearthstone Signet', icon: '💍', v: 0, type: 'jewelry', slot: 'ring', tag: 'cosmetic', rarity: 'epic', effects: ['cosmetic_profile'] },      // ITEM-NEW-37
  chronicle_ribbon:  { n: 'Chronicle Ribbon', icon: '🎗️', v: 0, type: 'trophy', tag: 'cosmetic', rarity: 'epic', effects: ['cosmetic_pin'] },                          // ITEM-NEW-38
  // ITEM-NEW-39 · cosmetic AND the Iron Colossus's dungeon key. `unlocks` is the
  // established key field (bone_key, obsidian_sigil …); the dungeon does not
  // exist yet, so the id it names is reserved here and nothing consumes it.
  colossus_seal:     { n: 'Colossus Seal', icon: '🔱', v: 0, bop: true, tag: 'cosmetic', rarity: 'legendary', unlocks: 'iron_colossus', effects: ['dungeon_key'] },      // ITEM-NEW-39
  weathervane:       { n: 'Weathervane', icon: '🧭', v: 3000, tag: 'housing', rarity: 'rare', effects: ['cosmetic_homestead'] },                                         // ITEM-NEW-40
};

/* ══════════════════════════════════════════════════════════════════════════
   4 · THE THREE CONSUMABLE SUPPLY CHAINS — ITEM-PLAN-02/03/04/05/06
                                                    STATE: pendingSkill

   Every id, stat, level gate and value below is TAKEN FROM
   docs/design/consumable-economy.md §6.2 (runes), §6.3 (whetstones), §8.2
   (castle goods), §8.4 + §9.5 (stone), §11.3 (elements) — not re-derived. The
   Designer pinned those numbers against two inequalities (the 4–10% of gross
   supply cost, and the ≤2× anti-faucet rule); re-deriving them here would be a
   second authority for one fact.

   ⚠ LANE NOTE (parallel work, 2026-08-16): the SKILLS workstream owns the
   Runecrafting and Stonemason RECIPES in src/data/recipes.js and the
   SKILLS_DEF rows. This file lands the ITEM rows only — no recipe below
   produces any of them. When `stonemason` / `runecrafting` / `fletching` enter
   SKILLS_DEF, the `pendingSkill` exemption expires automatically and the
   reachability guard will demand the recipes. That is the handshake.

   One rename applied from the review book: the Designer's `rune_of_blight`
   becomes `rune_of_poison` — "*Blight* is **Poison** throughout" (§2C taxonomy
   sweep). Elemental arrow/whetstone ids use the same `_of_<element>` shape so
   the three element lines read as one family and cannot be confused with the
   MATERIAL rung `emberhead_arrows` (tier 6, a different axis entirely).
   ══════════════════════════════════════════════════════════════════════════ */

/* R7: the three ammo-slot ladders share ONE stat curve, because they are one
   slot. A guard asserts this across all three at once. */
const AMMO_STR = [2, 3, 5, 8, 11, 14, 18];
const AMMO_VALUE = [1, 1, 2, 4, 6, 9, 12];
const AMMO_REQ = [1, 15, 30, 45, 60, 75, 88];
const AMMO_RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary', 'mythic'];

const rune = (id, name, i) => [id, {
  n: name, icon: '🔷', v: AMMO_VALUE[i], type: 'ammo', slot: 'ammo', tier: i + 1,
  rarity: AMMO_RARITY[i], reqSkill: 'magic', reqLv: AMMO_REQ[i],
  magicStrB: AMMO_STR[i], ammoPerShot: i === 0 ? 0 : 1,
  pendingSkill: 'runecrafting',
}];
/* Whetstones burn 0.02/swing (§7.2 — charges on the consumption channel, not a
   timer) and carry `strB` ONLY: critB would leak to every style through
   equipmentStats, and spdB is closed by the b343 ruling. */
const whet = (id, name, i, v) => [id, {
  n: name, icon: '🪨', v, type: 'ammo', slot: 'ammo', tier: i + 1,
  rarity: AMMO_RARITY[i], reqSkill: 'attack', reqLv: AMMO_REQ[i],
  strB: AMMO_STR[i], ammoPerShot: i === 0 ? 0 : 0.02,
  pendingSkill: 'stonemason',
}];

const SUPPLY_CHAINS = Object.fromEntries([
  /* ITEM-PLAN-04 · stone raws (Mining by-product, §8.4 P1) + blocks + blanks.
     `raw: true` is set explicitly — the RAW_MATERIAL_IDS derivation in items.js
     walks `prod` on the gathering rows, and a by-product is not a `prod`. That
     gap is exactly the faucet §8.4 warned about (vendoring at 100% instead of
     20%), so it is closed at the point of authorship. */
  ['rubble',  { n: 'Rubble',  icon: '🪨', v: 6,  tier: 1, raw: true, pendingSkill: 'stonemason' }],
  ['granite', { n: 'Granite', icon: '🪨', v: 22, tier: 3, raw: true, pendingSkill: 'stonemason' }],
  ['basalt',  { n: 'Basalt',  icon: '🪨', v: 60, tier: 5, raw: true, pendingSkill: 'stonemason' }],
  ['dressed_block', { n: 'Dressed Block', icon: '🧱', v: 20,  tier: 1, pendingSkill: 'stonemason' }],
  ['granite_block', { n: 'Granite Block', icon: '🧱', v: 120, tier: 3, pendingSkill: 'stonemason' }],
  ['basalt_block',  { n: 'Basalt Block',  icon: '🧱', v: 300, tier: 5, pendingSkill: 'stonemason' }],
  ['rune_blank',      { n: 'Rune Blank',      icon: '⬜', v: 5,  tier: 1, pendingSkill: 'stonemason' }],
  ['fine_rune_blank', { n: 'Fine Rune Blank', icon: '⬜', v: 24, tier: 3, pendingSkill: 'stonemason' }],
  ['deep_rune_blank', { n: 'Deep Rune Blank', icon: '⬜', v: 60, tier: 5, pendingSkill: 'stonemason' }],

  /* ITEM-PLAN-05 · the castle goods. `keystone` already exists (items.js, b222)
     and is NOT re-declared here — it is adopted by Stonemason, recipe and cost
     unchanged (§8.2). Only the two new ones land.
     PERSONAL sink = ashlar (property tiers 4-6 + room rungs L4).
     CLAN sink     = vaultstone (hr_castle_tiers 4-5). They must not share a
     good, or a player chooses between their house and their clan's wall. */
  ['ashlar',     { n: 'Ashlar',     icon: '🧱', v: 1200, tier: 4, tag: 'castle', pendingSkill: 'stonemason' }],
  ['vaultstone', { n: 'Vaultstone', icon: '🧱', v: 9000, tier: 7, tag: 'castle', pendingSkill: 'stonemason', pendingSystem: 'castle_tiers' }],

  /* ITEM-PLAN-02 · the bound rune ladder (§6.2). Rune values equal arrow values
     exactly, which is what makes magic's and ranged's supply cost comparable. */
  rune('air_rune',   'Air Rune',   0), rune('earth_rune', 'Earth Rune', 1),
  rune('water_rune', 'Water Rune', 2), rune('fire_rune',  'Fire Rune',  3),
  rune('chaos_rune', 'Chaos Rune', 4), rune('death_rune', 'Death Rune', 5),
  rune('blood_rune', 'Blood Rune', 6),

  /* ITEM-PLAN-03 · the whetstone ladder (§6.3). Values are the Designer's
     derived band — the steel rung at 130 gives 10 × 130 / 660 = 1.97×, just
     inside the anti-faucet rule; 200 would have been a 3.03× faucet. */
  whet('coarse_whetstone',  'Coarse Whetstone',    0, 5),
  whet('copper_whetstone',  'Copper Whetstone',    1, 20),
  whet('iron_whetstone',    'Iron Whetstone',      2, 55),
  whet('steel_whetstone',   'Steel Whetstone',     3, 130),
  whet('mithril_whetstone', 'Mithril Whetstone',   4, 300),
  whet('rune_whetstone',    'Rune Whetstone',      5, 700),
  whet('dawn_whetstone',    'Dawnsteel Whetstone', 6, 1600),

  /* ITEM-PLAN-06 · phase two, 9 items and not 42 (§11.3). Elemental variants
     exist at ONE high tier band only. `element` is authored now so the element
     axis, when it ships, is a read and not a re-tag. */
  ['rune_of_ember',  { n: 'Rune of Ember',  icon: '🔥', v: 9, type: 'ammo', slot: 'ammo', tier: 5, rarity: 'legendary', reqSkill: 'magic', reqLv: 65, magicStrB: 11, ammoPerShot: 1, element: 'ember',  pendingSkill: 'runecrafting', pendingSystem: 'elements' }],
  ['rune_of_frost',  { n: 'Rune of Frost',  icon: '❄️', v: 6, type: 'ammo', slot: 'ammo', tier: 4, rarity: 'epic',      reqSkill: 'magic', reqLv: 45, magicStrB: 8,  ammoPerShot: 1, element: 'frost',  pendingSkill: 'runecrafting', pendingSystem: 'elements' }],
  ['rune_of_poison', { n: 'Rune of Poison', icon: '🟣', v: 12, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'magic', reqLv: 85, magicStrB: 14, ammoPerShot: 1, element: 'poison', pendingSkill: 'runecrafting', pendingSystem: 'elements' }],
  ['arrows_of_ember',  { n: 'Ember Arrows',  icon: '🏹', v: 11, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: 75, rangeStrB: 14, critB: 0.02, ammoPerShot: 1, element: 'ember',  pendingSkill: 'fletching' }],
  ['arrows_of_frost',  { n: 'Frost Arrows',  icon: '🏹', v: 11, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: 75, rangeStrB: 14, critB: 0.02, ammoPerShot: 1, element: 'frost',  pendingSkill: 'fletching' }],
  ['arrows_of_poison', { n: 'Poison Arrows', icon: '🏹', v: 11, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'ranged', reqLv: 75, rangeStrB: 14, critB: 0.02, ammoPerShot: 1, element: 'poison', pendingSkill: 'fletching' }],
  ['whetstone_of_ember',  { n: 'Ember Whetstone',  icon: '🔥', v: 850, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'attack', reqLv: 75, strB: 14, ammoPerShot: 0.02, element: 'ember',  pendingSkill: 'stonemason', pendingSystem: 'elements' }],
  ['whetstone_of_frost',  { n: 'Frost Whetstone',  icon: '❄️', v: 850, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'attack', reqLv: 75, strB: 14, ammoPerShot: 0.02, element: 'frost',  pendingSkill: 'stonemason', pendingSystem: 'elements' }],
  ['whetstone_of_poison', { n: 'Poison Whetstone', icon: '🟣', v: 850, type: 'ammo', slot: 'ammo', tier: 6, rarity: 'legendary', reqSkill: 'attack', reqLv: 75, strB: 14, ammoPerShot: 0.02, element: 'poison', pendingSkill: 'stonemason', pendingSystem: 'elements' }],

  /* ITEM-NEW-41/42 · the two artisan TOOL ladders. Artisan skills get 3 rungs
     where gathering gets 7 (the live shape: bronze/steel/rune hammer at
     .05/.15/.25), and these two are needed the day their skills ship. Values
     and speeds are the existing artisan-tool ladder to the number — a new
     skill's tools must not be a different economy. */
  ['bone_fletching_knife',  { n: 'Bone Fletching Knife',  icon: '🔪', v: 70,   type: 'tool', toolSkill: 'fletching',  toolTier: 1, toolSpeed: 0.05, pendingSkill: 'fletching' }],
  ['steel_fletching_knife', { n: 'Steel Fletching Knife', icon: '🔪', v: 950,  type: 'tool', toolSkill: 'fletching',  toolTier: 3, toolSpeed: 0.15, pendingSkill: 'fletching' }],
  ['dawn_fletching_knife',  { n: 'Dawnsteel Fletching Knife', icon: '🔪', v: 9200, type: 'tool', toolSkill: 'fletching', toolTier: 5, toolSpeed: 0.25, pendingSkill: 'fletching' }],
  ['bronze_masons_rule', { n: "Bronze Mason's Rule", icon: '📐', v: 70,   type: 'tool', toolSkill: 'stonemason', toolTier: 1, toolSpeed: 0.05, pendingSkill: 'stonemason', pendingSystem: 'tool_ladder' }],
  ['steel_masons_rule',  { n: "Steel Mason's Rule",  icon: '📐', v: 950,  type: 'tool', toolSkill: 'stonemason', toolTier: 3, toolSpeed: 0.15, pendingSkill: 'stonemason', pendingSystem: 'tool_ladder' }],
  ['dawn_masons_rule',   { n: "Dawnsteel Mason's Rule", icon: '📐', v: 9200, type: 'tool', toolSkill: 'stonemason', toolTier: 5, toolSpeed: 0.25, pendingSkill: 'stonemason', pendingSystem: 'tool_ladder' }],
]);

export const LIB2_ITEMS = {
  ...BANE_GEAR, ...ARMOUR_SETS, ...DORMANT, ...SUPPLY_CHAINS,
};

/* ══════════════════════════════════════════════════════════════════════════
   5 · THE FAUCETS — recipes for the PLAYABLE rows, and only those.
   Merged into ARTISAN_RECIPES by src/data/recipes.js. Every input is an item a
   player can already obtain today; the b243 reachability guard proves it rather
   than being asked to trust it.
   ══════════════════════════════════════════════════════════════════════════ */
export const LIB2_RECIPES = {
  smithing: [
    { id: 'forge_bramble_blade', name: 'Forge Bramble Blade', icon: '⚔️',
      inputs: { iron_bar: 2, oak_plank: 2 }, output: 'bramble_blade', xp: 260, req: 23, ms: 3600 },
    { id: 'forge_rat_stick', name: 'Forge Rat Stick', icon: '🔨',
      inputs: { steel_bar: 2, willow_plank: 2, rat_tail: 25 }, output: 'rat_stick', xp: 640, req: 38, ms: 4000 },
    { id: 'forge_lazlos_maul', name: "Forge Lazlo's Maul", icon: '🔨',
      inputs: { mithril_bar: 3, grave_dust: 20, big_bones: 10 }, output: 'lazlos_maul', xp: 1150, req: 53, ms: 4400 },
    /* ITEM-NEW-43 — death_steel finally has somewhere to go. */
    { id: 'smelt_deathsteel_ingot', name: 'Smelt Deathsteel Ingot', icon: '⚙️',
      inputs: { death_steel: 2, coal: 6 }, output: 'deathsteel_bar', xp: 380, req: 62, ms: 3400 },
    /* ITEM-NEW-33 — the Watchknight Shell, plate T5, the ingot's only sink. */
    { id: 'forge_watchknight_helmet', name: 'Forge Watchknight Helm', icon: '⛑️',
      inputs: { deathsteel_bar: 2 }, output: 'watchknight_helmet', xp: 700, req: 65, ms: 4000 },
    { id: 'forge_watchknight_body', name: 'Forge Watchknight Cuirass', icon: '🛡️',
      inputs: { deathsteel_bar: 5 }, output: 'watchknight_body', xp: 1750, req: 70, ms: 4600 },
    { id: 'forge_watchknight_pants', name: 'Forge Watchknight Greaves', icon: '🦿',
      inputs: { deathsteel_bar: 4 }, output: 'watchknight_pants', xp: 1400, req: 68, ms: 4400 },
    { id: 'forge_watchknight_boots', name: 'Forge Watchknight Boots', icon: '🥾',
      inputs: { deathsteel_bar: 2 }, output: 'watchknight_boots', xp: 700, req: 62, ms: 3800 },
    { id: 'forge_watchknight_gloves', name: 'Forge Watchknight Gauntlets', icon: '🧤',
      inputs: { deathsteel_bar: 1 }, output: 'watchknight_gloves', xp: 350, req: 61, ms: 3600 },
    { id: 'forge_watchknight_belt', name: 'Forge Watchknight Belt', icon: '🟫',
      inputs: { deathsteel_bar: 1 }, output: 'watchknight_belt', xp: 350, req: 63, ms: 3600 },
  ],
  crafting: [
    { id: 'craft_void_censer', name: 'Craft Void Censer', icon: '🪔',
      inputs: { yew_plank: 2, void_chitin: 2, magic_essence: 10 }, output: 'void_censer', xp: 1400, req: 66, ms: 4400 },
    { id: 'craft_dragonrib_bow', name: 'Craft Dragonrib Bow', icon: '🏹',
      inputs: { dragon_bones: 5, runewood_plank: 3, silk_thread: 20 }, output: 'dragonrib_bow', xp: 2100, req: 80, ms: 4800 },
    /* ITEM-NEW-32 — the second leather supply chain: chitin, not pelts. */
    { id: 'craft_chitin_helmet', name: 'Craft Chitin Coif', icon: '🪲',
      inputs: { void_chitin: 1, silk_thread: 4 }, output: 'chitin_helmet', xp: 420, req: 47, ms: 3600 },
    { id: 'craft_chitin_body', name: 'Craft Chitin Body', icon: '🪲',
      inputs: { void_chitin: 3, silk_thread: 10 }, output: 'chitin_body', xp: 1050, req: 55, ms: 4200 },
    { id: 'craft_chitin_pants', name: 'Craft Chitin Chaps', icon: '🪲',
      inputs: { void_chitin: 2, silk_thread: 8 }, output: 'chitin_pants', xp: 840, req: 53, ms: 4000 },
    { id: 'craft_chitin_boots', name: 'Craft Chitin Boots', icon: '🪲',
      inputs: { void_chitin: 1, silk_thread: 3 }, output: 'chitin_boots', xp: 420, req: 47, ms: 3400 },
    { id: 'craft_chitin_gloves', name: 'Craft Chitin Vambraces', icon: '🪲',
      inputs: { void_chitin: 1, silk_thread: 2 }, output: 'chitin_gloves', xp: 380, req: 46, ms: 3400 },
    { id: 'craft_chitin_belt', name: 'Craft Chitin Belt', icon: '🪲',
      inputs: { void_chitin: 1, silk_thread: 3 }, output: 'chitin_belt', xp: 420, req: 48, ms: 3400 },
    /* ITEM-NEW-44 — one recipe, three orphans closed: void_chitin (Shadow
       Creeper / Void Parasite), hell_ember (Lesser Demon) and war_crown
       (War King, the only 8% drop in the game with no use whatsoever). */
    { id: 'weave_voidchitin', name: 'Weave Void-Chitin', icon: '🕸️',
      inputs: { void_chitin: 4, hell_ember: 2, war_crown: 1 }, output: 'voidchitin_weave', xp: 1800, req: 82, ms: 4600 },
    { id: 'craft_quiet_coat', name: 'Craft Quiet Coat', icon: '🧥',
      inputs: { voidchitin_weave: 2, shadow_thread: 8 }, output: 'quiet_coat', xp: 2600, req: 86, ms: 5000 },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   6 · FLAVOUR. One line per item, medieval voice, original IP.
   ⚖ `lazlos_maul` — grave-robbing blacksmith. No show. No property. Ever.
   Descriptions describe what the item IS, never a mechanic that has not
   shipped: an unbuilt promise in a tooltip is the same lie as a broken stat.
   ══════════════════════════════════════════════════════════════════════════ */
export const LIB2_DESC = {
  lazlos_maul: 'Lazlo dug graves for coin and forged this to settle what climbed back out; the head is cast from the fittings of coffins he emptied',
  dragonrib_bow: 'A wyrm\'s rib bent against its own sinew — the only bow that was grown before it was strung',
  bramble_blade: 'A short blade wound with living thorn, kept sharp by the very hedges it was cut to clear',
  void_censer: 'A censer that burns nothing and still smokes, and the smoke always leans toward the thing that should not be there',
  rat_stick: 'A stick. Weighted at one end, worn smooth at the other. It is very good at rats',

  chitin_helmet: 'A coif plated in overlapping vermin shell, lighter than leather and colder to the touch',
  chitin_body: 'Chitin scales laid like roof tiles, stitched to a hide backing — armour grown, not skinned',
  chitin_pants: 'Segmented chitin chaps that click faintly with every stride',
  chitin_boots: 'Shell-capped boots that turn a bite the way tanned hide never could',
  chitin_gloves: 'Vambraces of banded chitin, clawed at the knuckle out of habit rather than design',
  chitin_belt: 'A belt of linked shell plates, each one a different creature',

  watchknight_helmet: 'A closed helm of deathsteel, visored so narrowly that the wearer must turn to look',
  watchknight_body: 'Deathsteel plate, dark and unreflective, built for the long watch rather than the short charge',
  watchknight_pants: 'Heavy deathsteel greaves that stand on their own when set down',
  watchknight_boots: 'Sabatons of deathsteel, weighted at the heel so a tired man still stands straight',
  watchknight_gloves: 'Deathsteel gauntlets, articulated finely enough to hold a cup at the end of a long night',
  watchknight_belt: 'A deathsteel warbelt, buckled once and rarely undone',

  quiet_coat: 'A long coat of void-chitin weave that makes no sound at all — not the cloth, not the buckles, not the man inside it',
  deathsteel_bar: 'Death Knight steel, smelted down and poured honest, still holding the cold of wherever it was dug up',
  voidchitin_weave: 'Chitin, ember and gold beaten into one dark cloth — three trophies nobody knew what to do with, made into something',

  hunters_torc: 'A torc of braided sinew and tooth, worn by trackers who counted their kills in fur',
  frost_locket: 'A locket cold enough to ache, holding a single unmelting flake',
  tally_ring: 'A plain band notched once for every beast; it makes you no stronger and you will never take it off',
  bone_earrings: 'Bone studs carved with a prayer so small only the wearer can read it',
  pathfinder_studs: 'Small brass studs a surveyor wore, forever pointing at the next thing worth doing',
  unlit_earrings: 'Earrings of unlit stone that darken further near things which do not belong here',

  hearthbread: 'A dense dark loaf baked to be eaten slowly on the road, a corner at a time',
  travellers_stew: 'Whatever the pot had, cooked long enough that nobody asks',
  winterdraught: 'A single draught of meltwater from a peak that has never thawed',
  ratters_bait: 'Rank cheese and rendered fat, wrapped in cloth and best carried at arm\'s length',
  grave_salt: 'Coarse grey salt taken from a barrow floor; gravediggers swear by it and will not say why',
  kettle_tea: 'Strong black tea from a kettle that has never once been fully emptied',

  field_ledger: 'A ruled ledger for keeping two jobs straight when one pair of hands must do both',
  tithe_box: 'A locked collection box with a slot in the lid and an honest reckoning inside',
  carters_strap: 'A carter\'s broad shoulder strap, cut for one more crate than is sensible',
  surveyors_chain: 'A hundred links of measured iron, and the eye to know which stone is worth cutting',

  colossus_plate: 'Plate cut from the shell of something that was built rather than born',
  heartwood_cape: 'A cape of living heartwood grain that greens faintly in the presence of growing things',
  draconias_jaw: 'A helm shaped from a great wyrm\'s lower jaw, still warm along the teeth',
  cutpurse_gloves: 'Thin gloves with the fingertips worn through, cut for pockets rather than for fighting',
  pitlord_irons: 'Boots banded in black iron that has stood in fire long enough to stop caring',

  bestiary_cloak: 'A scholar\'s cloak dyed by what its wearer has studied to the end',
  hearthstone_signet: 'A signet cut with the shape of your own hearth, for pressing into wax',
  chronicle_ribbon: 'A single ribbon pinned to name the one deed you would be remembered by',
  colossus_seal: 'A heavy seal of grooved bronze that is worn as an ornament and turned as a key',
  weathervane: 'A rooftop vane that reads more than the wind',

  rubble: 'Broken stone struck loose alongside the ore, worth carrying only in quantity',
  granite: 'Hard speckled granite, the stone that outlasts the mason who cut it',
  basalt: 'Black basalt, dense and close-grained, cooled from something that was once moving',
  dressed_block: 'A rough block squared on all six faces — the mason\'s first honest day',
  granite_block: 'A dressed granite block, heavy enough that two men set it and one man regrets it',
  basalt_block: 'A dressed basalt block, dark as a well and twice as cold',
  rune_blank: 'A blank stone chip, cut square and waiting for a mark',
  fine_rune_blank: 'A finely cut blank of granite, smooth enough to take a small and complicated mark',
  deep_rune_blank: 'A basalt blank cut deep, for marks that must not wear away',
  ashlar: 'Squared facing stone, laid so precisely that no mortar shows',
  vaultstone: 'The stone a vault closes on, cut once and never cut again',

  air_rune: 'A blank marked with the first and simplest sign, and it still moves the air',
  earth_rune: 'A stone rune heavy in the palm out of all proportion to its size',
  water_rune: 'A rune that beads with moisture in a dry room',
  fire_rune: 'A rune warm enough to find in a dark pack',
  chaos_rune: 'A rune whose mark will not stay quite the same shape between glances',
  death_rune: 'A cold rune cut on a blank taken from beneath a barrow',
  blood_rune: 'A deep-cut rune that darkens in the groove and never quite dries',
  rune_of_ember: 'A rune bound to ember, and it will burn whether you cast it or spend it',
  rune_of_frost: 'A rune bound to frost, aching cold through a glove',
  rune_of_poison: 'A rune bound to poison, cut on stone nothing will grow on',

  coarse_whetstone: 'A rough field stone that puts an edge on anything and a good edge on nothing',
  copper_whetstone: 'A copper-bound stone, the first one worth keeping in the pack',
  iron_whetstone: 'An iron-backed whetstone with a groove worn down its centre',
  steel_whetstone: 'A close-grained stone that leaves an edge you can hear',
  mithril_whetstone: 'A pale stone that takes almost nothing off and gives a great deal back',
  rune_whetstone: 'A marked whetstone that sharpens a little more than the honing accounts for',
  dawn_whetstone: 'Dawnsteel grit bound in basalt — the last stone a blade will ever need',
  whetstone_of_ember: 'A whetstone that leaves the edge faintly warm',
  whetstone_of_frost: 'A whetstone that leaves frost along the blade for a breath after honing',
  whetstone_of_poison: 'A whetstone honed dark, and one does not lick the thumb after using it',

  arrows_of_ember: 'Arrowheads quenched in something still burning',
  arrows_of_frost: 'Arrowheads that fog in warm air and sting the fingers through the glove',
  arrows_of_poison: 'Arrowheads grooved to carry what the groove is for',

  bone_fletching_knife: 'A bone-handled knife ground thin for splitting shafts and trimming vane',
  steel_fletching_knife: 'A steel fletching knife with a hooked point for the nock',
  dawn_fletching_knife: 'A dawnsteel blade so fine it parts a feather without bending it',
  bronze_masons_rule: 'A folding bronze rule, dented at every joint',
  steel_masons_rule: 'A steel mason\'s rule, true enough to argue with',
  dawn_masons_rule: 'A dawnsteel rule that has never been out by the width of a hair',
};

/* ══════════════════════════════════════════════════════════════════════════
   7 · THE ART MANIFEST — id → expected filename, one per new item.
   `assets/icons-bundle/<folder>/<id>.png`, generated by the art batch later.

   NOTHING IS WIRED INTO `LOCAL_ITEM_ICON` YET, and that is the graceful
   degradation: `_itemPath[id]` is only consulted if present, and every render
   site falls back to the item's emoji `icon`. Wiring a path to a file that does
   not exist yet would produce a broken-image box on every one of these rows —
   strictly worse than the fallback. The art workstream wires the map in the
   same commit that lands the files; this manifest is the work order.
   ══════════════════════════════════════════════════════════════════════════ */
export const LIB2_ICON_FILES = Object.keys(LIB2_ITEMS)
  .reduce((m, id) => { m[id] = id + '.png'; return m; }, {});
