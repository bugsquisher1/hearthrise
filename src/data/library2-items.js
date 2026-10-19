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
// module that exports items + flavour, spread into ITEMS / ITEM_DESC by their
// owning modules (its gear recipes were deleted in the 2026-10-14 demolition). One file rather than
// six because these ~86 rows were approved as ONE decision and share one power
// budget; splitting them would put the budget argument in no file at all.
//
// ── EVERY ROW IS PLAYABLE (W0, 2026-10-10) ─────────────────────────────────
// This file used to carry two "catalogued, not obtainable" states — rows whose
// `effects` no engine read, and rows waiting on a skill or system. 40 such rows
// sat in the catalogue for two months with no source and no use, and made the
// Collection Log impossible to finish. The wipe made cutting them free, so they
// were cut. The rule now is the one tests/catalogue-coherence.mjs enforces for
// the WHOLE catalogue: every item has a source and a use. An item whose engine
// does not exist yet is not authored until it does.
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
//   • the "costs budget" cards in the review book (Traveller's Stew, Kettle
//     Tea, Surveyor's Chain, the two tool ladders) were cut in W0 with the
//     other unbuilt rows, so they spend nothing.
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

import { MAX_BANE_MULT } from '../core/bane.js?v=0.2.8';

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
    reqSkill: 'melee', reqLv: 45, bane: BANE('undead'), effects: ['bane'],
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
    reqSkill: 'melee', reqLv: 15, bane: BANE('plant'), effects: ['bane'],
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
    reqSkill: 'melee', reqLv: 30, bane: BANE('vermin'), effects: ['bane'],
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

  // ITEM-NEW-44 · Void-Chitin Weave — one endgame target for three orphans.
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
   Runecrafting RECIPES in src/data/recipes.js and the
   SKILLS_DEF rows. This file lands the ITEM rows only — no recipe below
   produces any of them. When `runecrafting` / `fletching` enter
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
  rarity: AMMO_RARITY[i], reqSkill: 'melee', reqLv: AMMO_REQ[i],
  strB: AMMO_STR[i], ammoPerShot: i === 0 ? 0 : 0.02,
  pendingSkill: 'smithing',
}];

const SUPPLY_CHAINS = Object.fromEntries([
  /* ITEM-PLAN-04 · the graded blanks, cut at Runecrafting. (Quarried stone,
     blocks and ashlar were deleted with Stonemason in the 2026-10-14 demolition.) */
  ['rune_blank',      { n: 'Blank Rune',      icon: '⬜', v: 5,  tier: 1, pendingSkill: 'runecrafting' }],
  ['fine_rune_blank', { n: 'Fine Blank Rune', icon: '⬜', v: 24, tier: 3, pendingSkill: 'runecrafting' }],
  ['deep_rune_blank', { n: 'Deep Blank Rune', icon: '⬜', v: 60, tier: 5, pendingSkill: 'runecrafting' }],

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

  /* W0 (2026-10-10): the six elemental arrow/whetstone variants and the two
     artisan tool ladders (fletching knives, mason's rules) were CUT. Their
     transfer recipes and their skills never landed, so they had no source and
     no use; the wipe made removing them free. */
]);

export const LIB2_ITEMS = {
  ...BANE_GEAR, ...ARMOUR_SETS, ...SUPPLY_CHAINS,
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

  rune_essence: 'Pale humming stone off the essence face, the raw stuff every blank rune is cut out of',
  rune_blank: 'A blank stone chip, cut square and waiting for a mark',
  fine_rune_blank: 'A finely cut blank of granite, smooth enough to take a small and complicated mark',
  deep_rune_blank: 'A basalt blank cut deep, for marks that must not wear away',

  /* ── STAFF RUNES: SAY THE MECHANIC, THEN THE FLAVOUR (b432) ──────────────
     These were pure atmosphere, on the one screen where a player is looking at
     eleven near-identical tiles and asking "what does a rune actually DO?".
     Each line now opens with the answer — it goes in the ammo slot and raises
     Magic strength — and earns its keep as flavour afterwards.

     ⚠ THE BURN IS REAL NOW (E1, 2026-08-31): `simulateTick` calls
       `spendForSwings` on every swing, so every rung above tier 1 is spent at
       1 rune per cast. The copy below still does not SAY so, and that is a
       deliberate hold rather than an oversight: consumable-economy.md §14 hands
       the Art Director "the empty-quiver state must read on the equip doll and
       in the combat panel", and an item tooltip that says "spent" while no
       surface shows the remaining count teaches the mechanic in the worst
       possible order. These seven lines are the one place the wording changes
       when that indicator lands. */
  air_rune: 'Socketed in a staff for a first thread of Magic strength, and it never runs out — a student\'s whole arsenal',
  earth_rune: 'Socketed for Magic strength and spent one per cast; a stone rune heavy in the palm out of all proportion to its size',
  water_rune: 'Socketed for Magic strength; a rune that beads with moisture in a dry room',
  fire_rune: 'Socketed for Magic strength; a rune warm enough to find in a dark pack',
  chaos_rune: 'Socketed for Magic strength; its mark will not stay quite the same shape between glances',
  death_rune: 'Socketed for Magic strength; cold, and cut on a blank taken from beneath a barrow',
  blood_rune: 'The deepest binding a staff will take — deep-cut, dark in the groove, and never quite dry',

  coarse_whetstone: 'A rough field stone that puts an edge on anything and a good edge on nothing',
  copper_whetstone: 'A copper-bound stone, the first one worth keeping in the pack',
  iron_whetstone: 'An iron-backed whetstone with a groove worn down its centre',
  steel_whetstone: 'A close-grained stone that leaves an edge you can hear',
  mithril_whetstone: 'A pale stone that takes almost nothing off and gives a great deal back',
  rune_whetstone: 'A marked whetstone that sharpens a little more than the honing accounts for',
  dawn_whetstone: 'Dawnsteel grit bound in basalt — the last stone a blade will ever need',
};
