// ════════════════════════════════════════════════════════════════════════
// src/data/style-gear.js — THE STYLE LADDER: every way to fight climbs (designer 2026-10-22)
//
// THE PROBLEM. The weapon sets the style (Tyler 2026-10-16) and every hero starts with all seven
// practice weapons (Tyler 2026-10-20). On the open grounds (Mill Cellar, Thicket, Sewer, Warrens)
// only the sword climbed: Iron Sword from the Cistern Spider, Steel Sword from the Goblin Skulker.
// The wand, spellbook, staff, bow, crossbow, hatchets and club never left the practice kit, and no
// cloth armour (the light line, Mage and Healer) could be had at all. Four of six styles had no
// gear chase.
//
// THE RULING. Each style climbs at the SAME rungs the sword does:
//   rung 0  Level 1    the practice kit (start-kit.js) + the Shop outfitter's small pieces
//   rung 1  Level 15   tier 2, the Sewer's band     (the first upgrade, every style)
//   rung 2  Level 30   tier 3, the Warrens floor
// ARMOR, WEAPONS AND SHIELDS DROP; A BENCH MAKES NONE (Tyler 2026-11-18, answering the itemization audit;
// lane/d-drop-homes, designer). Until then each tier-2 rung, the tier-1 and tier-2 cloth, the other
// weights' first gloves and belts, the tier-4 hatchets and crossbow and three shields were MADE here,
// and the cloth sewing competed with the hourly cloth drops. Every one of those 24 recipes is cut and
// each piece has a drop home (src/data/monsters.js and the ground packs, src/data/loot-bands.js rules:
// one Scarce weapon a monster, the 5% row ceiling, one home a player can learn):
//   tier 2   the Sewer: Iron Sword (kobolds), Ironbound Shield (rats), Oak Wand (slimes), Oakboard
//            Spellbook (bats). Wickstead: Bramble Blade (Turncoats), Iron Hatchets (boars). The Glade:
//            Longbow (poachers), Oak Crossbow (Rook), Oak Staff (vines), Iron Warhammer (sluicers).
//   tier 4   Hask's Ford: Maple Crossbow (Pikemen), Mithril Hatchets (Fordsunk), Mithril-Faced Shield
//            (Bannerman). The Slake keeps the sword, warhammer, bow and staff.
// KLAPPA'S KLUB STAYS (Tyler 2026-11-18: it CANNOT be removed from the game). Since the bench cut
// (09-crafting 4.13, lane/bench-cut-data 2026-11-28) no bench reforges anything: the Klub is a Scarce drop
// of the Thicket's Gray Whelps, at its own Level 5, and the Steelgrate a Rare of Chief Coppercap (shields.js).
// PURE ESM, data only.
// ════════════════════════════════════════════════════════════════════════

/* style -> the practice weapon, the rungs that ship (each item's door is a drop row, src/data/monsters.js and the ground packs, the
   loot bands 2026-10-23; Klappa's Klub a Gray Whelp's), and what comes next. A style is a ROLE weapon key (hunt-roles.js WEAPON_ROLES). */
export const STYLE_LADDER = Object.freeze({
  sword:     Object.freeze({ practice: 'practice_sword',     rungs: Object.freeze(['iron_sword', 'steel_sword']), next: '' }),
  dual_axe:  Object.freeze({ practice: 'practice_hatchets',  rungs: Object.freeze(['iron_hatchets', 'steel_hatchets', 'mithril_hatchets']),  next: '' }),
  club:      Object.freeze({ practice: 'practice_club',      rungs: Object.freeze(['klappas_club', 'iron_warhammer', 'steel_warhammer']), next: '' }),
  bow:       Object.freeze({ practice: 'practice_bow',       rungs: Object.freeze(['longbow', 'willow_longbow']),        next: '' }),
  crossbow:  Object.freeze({ practice: 'practice_crossbow',  rungs: Object.freeze(['oak_crossbow', 'willow_crossbow', 'maple_crossbow']),  next: '' }),
  wand:      Object.freeze({ practice: 'practice_wand',      rungs: Object.freeze(['oak_wand', 'willow_wand']),          next: '' }),
  spellbook: Object.freeze({ practice: 'practice_spellbook', rungs: Object.freeze(['oak_spellbook', 'willow_spellbook']), next: '' }),
  staff:     Object.freeze({ practice: 'practice_staff',     rungs: Object.freeze(['oak_staff', 'willow_staff']),        next: '' }),
});

/* The light line: tier 1 (Apprentice, worn at Level 1) and tier 2 (Adept, worn at Level 15); helmet, body, legs, boots, each a
   Scarce drop in its ground's three weights (src/data/monsters.js). Gloves and belt: the Shop's outfitter sells medium gloves and a
   heavy belt; the other weights' tier-1 pair are the Thicket's Rares (lane/d-drop-homes, 2026-11-18). */
export const CLOTH_LADDER = Object.freeze({
  1: Object.freeze(['apprentice_helmet', 'apprentice_body', 'apprentice_pants', 'apprentice_boots']),
  2: Object.freeze(['adept_helmet', 'adept_body', 'adept_pants', 'adept_boots']),
});
/* The style ladder's new weapons' flavour lines (item-descriptions.js spreads them); every tier drops. */
export const STYLE_GEAR_DESC = Object.freeze({
  iron_hatchets: 'A pair of iron hatchets on oak handles. They\'re made to cut deep and keep a monster bleeding',
  oak_crossbow: 'An oak crossbow strung with spider silk, slower to draw than a bow and harder where it lands',
  steel_hatchets: 'Steel hatchets for a fighter who likes to make monsters bleed. A Coppercap foreman keeps a pair for splitting pit props',
  willow_crossbow: 'A willow crossbow for a ranger who keeps a shield up, the kind the goblin skulkers shoot down the galleries',
  mithril_hatchets: 'Mithril hatchets on oak handles, light enough to swing all day. They\'re made to keep a monster bleeding',
  maple_crossbow: 'A maple crossbow strung with spider silk for a ranger who keeps a shield up and wants the bolt to land hard',
  rune_hatchets: "Rune hatchets that Hask's sergeants carried. The Barrow Knights were buried with them",
  yew_crossbow: "Captain Hask's own crossbow. It has a yew stock with his mark burned into it",
  ember_hatchets: 'Emberforged hatchets from the Pyre Field, still black from the fire',
  runewood_crossbow: 'A runewood crossbow the Provost kept for shooting anyone who ran from the pyres',
  dawn_hatchets: "Dawnsteel hatchets out of Lord Krell's hall. Nobody else in the March could afford them",
  duskwood_crossbow: "A duskwood crossbow from Lord Krell's hall, the best one in the March",
});
