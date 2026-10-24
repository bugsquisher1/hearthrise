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
//   rung 1  skill 15   tier 2, the Sewer's band     <- THIS FILE (the first upgrade, every style)
//   rung 2  skill 30   tier 3, the Warrens floor    <- the next batch (STYLE_LADDER `next`)
// Each monster carries ONE equipment row (L1, Tyler 10-14) and the grounds' five slots are full,
// so the drop tables cannot hold six more weapons. The other door is the Work window: each rung
// is MADE, from wood the hero cuts and a material the Sewer or the Cellar drops, so the hunt
// feeds the bench (DESIGN_STANDARDS §1: skills that feed each other). The sword keeps its drop:
// a style's rung has one door, and a second door is only added where it adds a decision.
//   Silk Thread  Hive Wasp (Cellar, 15%), Cistern Spider (Sewer, 30%)   cloth, wand grips, strings
//   Bat Wing     Culvert Bat (Sewer, 70%)                               spellbook vellum, adept lining
//   Bone Chips   Kobold Tosher (Sewer, 50%)                             the staff's bone cap
//   Oak Plank    Woodcutting 15 oak, sawn at Crafting 15                 the tier-2 wand, book, staff and bows
//   Normal Plank Woodcutting 1, sawn at Crafting 1                       the hafts: a smith needs no Crafting 15
//   Iron Bar     Mining 15 iron, smelted at Smithing 15                  hatchets and the club's head
// Cloth is the caster's line from Level 1 (Defense 1 to wear): a Mage or Healer sews a robe from
// the Cellar's silk in the first hour, as the Melee hero finds plate in the Sewer and the Ranger
// leather in the Thicket.
//
// THE ECONOMY RULE (tests/style-gear.mjs SG-4). A made piece never sells for more than the BOOK
// value of what went in (catalogue.js vendorPriceOf(output) <= sum of inputs' `v`), so the bench is
// never a gold faucet beyond the raw-to-made uplift smelting already pays. Three legacy hand-authored
// values (Longbow 400, Oak Staff 300, Iron Warhammer 550) fell to their ladder's generated value
// for it (items.js).
//
// Recipe levels: a weapon opens at its tier's craft gate (gear-tiers.js MATERIAL_TIERS.craft 15),
// the level it is worn at. Cloth opens a little after each piece's material, the body last.
// PURE ESM, data only. Spread into ARTISAN_RECIPES by recipes.js.
// ════════════════════════════════════════════════════════════════════════

/* style -> the practice weapon, the rungs that ship (each item's door is its recipe or drop row: tier 2 made here,
   tier 3 a Warrens drop, src/data/monsters.js, the loot bands 2026-10-23), and what comes next. A style is a ROLE
   weapon key (hunt-roles.js WEAPON_ROLES). */
export const STYLE_LADDER = Object.freeze({
  sword:     Object.freeze({ practice: 'practice_sword',     rungs: Object.freeze(['iron_sword', 'steel_sword']), next: '' }),
  dual_axe:  Object.freeze({ practice: 'practice_hatchets',  rungs: Object.freeze(['iron_hatchets', 'steel_hatchets']),  next: '' }),
  club:      Object.freeze({ practice: 'practice_club',      rungs: Object.freeze(['iron_warhammer', 'steel_warhammer']), next: '' }),
  bow:       Object.freeze({ practice: 'practice_bow',       rungs: Object.freeze(['longbow', 'willow_longbow']),        next: '' }),
  crossbow:  Object.freeze({ practice: 'practice_crossbow',  rungs: Object.freeze(['oak_crossbow', 'willow_crossbow']),  next: '' }),
  wand:      Object.freeze({ practice: 'practice_wand',      rungs: Object.freeze(['oak_wand', 'willow_wand']),          next: '' }),
  spellbook: Object.freeze({ practice: 'practice_spellbook', rungs: Object.freeze(['oak_spellbook', 'willow_spellbook']), next: '' }),
  staff:     Object.freeze({ practice: 'practice_staff',     rungs: Object.freeze(['oak_staff', 'willow_staff']),        next: '' }),
});

/* The light line, made: tier 1 (Apprentice, Defense 1) and tier 2 (Adept, Defense 15); helmet, body, legs, boots.
   Gloves and belt come from the Shop's outfitter for every style. Scholar (tier 3) is the next batch. */
export const CLOTH_LADDER = Object.freeze({
  1: Object.freeze(['apprentice_helmet', 'apprentice_body', 'apprentice_pants', 'apprentice_boots']),
  2: Object.freeze(['adept_helmet', 'adept_body', 'adept_pants', 'adept_boots']),
});

const r = (id, name, icon, inputs, output, xp, req, ms) => Object.freeze({ id, name, icon, inputs: Object.freeze(inputs), output, xp, req, ms });

export const STYLE_GEAR_RECIPES = Object.freeze({
  smithing: Object.freeze([
    r('forge_iron_hatchets',  'Forge Iron Hatchets',  '🪓', { iron_bar: 2, normal_plank: 1 }, 'iron_hatchets',  120, 15, 3400),
    r('forge_iron_warhammer', 'Forge Iron Warhammer', '🔨', { iron_bar: 3, normal_plank: 2 }, 'iron_warhammer', 150, 15, 3600),
  ]),
  crafting: Object.freeze([
    /* Tier-2 weapons: oak stock at Crafting 15, the level they are worn at. */
    r('carve_oak_wand',       'Carve Oak Wand',          '🪄', { oak_plank: 2, silk_thread: 1 }, 'oak_wand',      90,  15, 3200),
    r('bind_oak_spellbook',   'Bind Oakboard Spellbook', '📕', { oak_plank: 2, bat_wing: 4 },    'oak_spellbook', 90,  15, 3400),
    r('carve_oak_staff',      'Carve Oak Staff',         '🔮', { oak_plank: 3, bone_chips: 3 },  'oak_staff',     110, 15, 3600),
    r('string_longbow',       'String Longbow',          '🏹', { oak_plank: 3, silk_thread: 2 }, 'longbow',       110, 15, 3600),
    r('string_oak_crossbow',  'String Oak Crossbow',     '🏹', { oak_plank: 3, silk_thread: 1 }, 'oak_crossbow',  110, 15, 3600),
    /* Apprentice cloth (worn at Level 1): the Cellar's silk, a first spark for a caster. */
    r('sew_apprentice_boots',  'Sew Apprentice Slippers',    '🧵', { silk_thread: 1 }, 'apprentice_boots',  14, 1, 2800),
    r('sew_apprentice_helmet', 'Sew Apprentice Hat',         '🧵', { silk_thread: 1 }, 'apprentice_helmet', 16, 3, 2800),
    r('sew_apprentice_pants',  'Sew Apprentice Robe Bottom', '🧵', { silk_thread: 2 }, 'apprentice_pants',  28, 6, 3000),
    r('sew_apprentice_body',   'Sew Apprentice Robe Top',    '🧵', { silk_thread: 3 }, 'apprentice_body',   40, 9, 3200),
    /* Adept cloth (worn at Level 15): silk lined with the Culvert Bat's wing leather. */
    r('sew_adept_boots',  'Sew Adept Slippers',    '🧵', { silk_thread: 1, bat_wing: 2 }, 'adept_boots',  70,  15, 3200),
    r('sew_adept_helmet', 'Sew Adept Hat',         '🧵', { silk_thread: 2, bat_wing: 1 }, 'adept_helmet', 85,  17, 3200),
    r('sew_adept_pants',  'Sew Adept Robe Bottom', '🧵', { silk_thread: 3, bat_wing: 4 }, 'adept_pants',  120, 19, 3400),
    r('sew_adept_body',   'Sew Adept Robe Top',    '🧵', { silk_thread: 4, bat_wing: 6 }, 'adept_body',   150, 22, 3600),
  ]),
});

/* The style ladder's new weapons' flavour lines (item-descriptions.js spreads them): tier 2 made, tier 3 dropped. */
export const STYLE_GEAR_DESC = Object.freeze({
  iron_hatchets: 'A matched pair of iron hatchets on oak hafts, made to open a wound and keep it bleeding',
  oak_crossbow: 'An oak crossbow strung with spider silk, slower to draw than a bow and harder where it lands',
  steel_hatchets: 'Steel hatchets for a fighter who bleeds a foe, the pair a Coppercap foreman keeps for splitting pit props',
  willow_crossbow: 'A willow crossbow for a ranger who keeps a shield up, the kind the goblin skulkers shoot down the galleries',
});
