// ============================================================
// src/data/gear-tiers.js — THE PROGRESSION SPINE (b215)
//
// One table drives every piece of tiered gear in Hearthrise. Hand-authoring
// ~70 armour/weapon entries guarantees drift (a missing tier, a stat that
// doesn't follow the curve). Instead the material ladder lives here as data,
// and the items are GENERATED from it. (The recipe half was deleted with
// crafted gear in the 2026-10-14 demolition.)
//
// THE STATS ARE THE ONE FORMULA'S (lane/gear-catalogue-steps, 2026-11-22): a
// piece's base stats are derived from its slot, its item Level and its family
// or weight (src/data/gear-profiles.js, src/core/gear-stats.js), written by
// tools/gen-gear.mjs and read back through withGearStats. No row or
// table here types a stat: a new tier is one MATERIAL_TIERS row, a new family
// one WEAPON_FAMILIES row and its profile.
//
// Design rules this encodes:
//   • ONE MATERIAL A TIER ON ONE GRID (12-targets 8.3, lane/gear-phase-b): a tier's
//     item Level is GEAR_STEPS.tierSteps x (tier - 1), bronze 0 to Wolfram 160, worn
//     from it less wearAhead, so a player is never more than one tier (20 Levels)
//     from the next upgrade and every Level band has its base tier. A new tier past
//     the last is one STEP_TIERS row below (its words, homes and parts).
//   • Every armour slot exists at every tier — you can always complete a set.
//   • Every weapon family runs the full ladder, so every combat style
//     progresses at the same pace.
//   • The top two shipped tiers are original to Hearthrise: EMBERFORGED and
//     DAWNSTEEL — the game's own name read as a promise (hearth → ember, rise → dawn).
//
// Hand-authored entries in items.js keep their own names and values over the
// generated twin; their stats are the twin's (the formula's).
// ============================================================

/* ── GEAR IS WORN BY LEVEL (Tyler 2026-10-24: "I think all gear should just be hero level"; then "Supplies/runes
   stick to skill level"). Every piece of equipment, armor of every weight, shields, spellbooks, weapons, capes and
   jewelry, names the hero's LEVEL as its requirement: `reqSkill: LEVEL_REQ` with `reqLv` the Level. Never a skill:
   a Mage or a Ranger in a party with a tank earns almost no Defense (the designer measured about 210 h for a solo
   Mage to go from Defense 19 to 30), so a Defense gate kept them out of their own upgrades (QA mage Fingerguns,
   Defense 19, refused the Steel Helm, "Needs Defense 30"). Classless still: any hero wears any weight; skills keep
   driving accuracy, damage and defense. Supplies keep their skill (ammo and whetstones, runes, food, drinks). The
   server reads the same row (hr_items.req_skill = 'level', hr_apply through hr_item_requirement_unmet, the hero's
   Level from player_state.level_xp), so the screen and the refusal agree. */
export const LEVEL_REQ = 'level';

import { withGearStats } from './gear-profiles.js';
import { GEAR_STEPS, tierLevel } from './danger.js';
import { wage } from './wage.js';

/* ── The material ladder ───────────────────────────────────────────────
   tier   = the rung, 1 up (every ladder's ids are indexed by it, GEAR_LADDERS)
   iL     = the ITEM LEVEL a piece of the tier is (the one number the power step and the stat formula read: src/data/gear-steps.js)
   level  = the hero LEVEL the tier's gear is worn at: its item Level less GEAR_STEPS.wearAhead (12-targets 8.3: the old 1/15/30/45/60/75/88
            stopped being a wear gate)
   smith  = smithing level the tier's *base* piece unlocks at
   craft  = crafting level for the wood-based families at this tier
   value  = economic multiplier; item value = slot.vmul * tier.value
   ONE MATERIAL A TIER (the designer, lane/base-tier-ruling 2026-11-23, 12-targets.md 8.3): every tier is GEAR_STEPS.tierSteps item Levels,
   item Level = tierLevel(tier - 1): bronze 0, iron 20, steel 40, mithril 60, rune 80, Emberforged 100, Dawnsteel 120, then the tiers below.
   Smithing and Crafting levels gate making, not wearing, and stay. */
const SHIPPED_TIERS = [
  { id: 'bronze',  name: 'Bronze',      tier: 1, level: 1,  smith: 1,  craft: 1,  value: 0.6,
    bar: 'bronze_bar',  plank: 'normal_plank',   wood: 'normal',   rarity: 'common' },
  { id: 'iron',    name: 'Iron',        tier: 2, level: 15, smith: 15, craft: 15, value: 1.3,
    bar: 'iron_bar',    plank: 'oak_plank',      wood: 'oak',      rarity: 'uncommon' },
  { id: 'steel',   name: 'Steel',       tier: 3, level: 30, smith: 30, craft: 30, value: 5,
    bar: 'steel_bar',   plank: 'willow_plank',   wood: 'willow',   rarity: 'rare' },
  { id: 'mithril', name: 'Mithril',     tier: 4, level: 45, smith: 45, craft: 45, value: 15,
    bar: 'mithril_bar', plank: 'maple_plank',    wood: 'maple',    rarity: 'epic' },
  { id: 'rune',    name: 'Rune',        tier: 5, level: 60, smith: 60, craft: 60, value: 45,
    bar: 'rune_bar',    plank: 'yew_plank',      wood: 'yew',      rarity: 'legendary' },
  /* item Level 100: Carter's Rest's base (12-targets 8.3); Carter's parts make its jewels and cloak */
  { id: 'ember',   name: 'Emberforged', tier: 6, level: 75, smith: 75, craft: 75, value: 130,
    bar: 'ember_bar',   plank: 'runewood_plank', wood: 'runewood', rarity: 'legendary',
    words: { wood: ['runewood', 'Runewood'], leather: ['dragonhide', 'Dragonhide'], cloth: ['archmage', 'Archmage'] },
    homes: ['carters_rest'], parts: { ring: 'pewter_spoon', earrings: 'stable_bit', necklace: 'coal_tongs', cape: 'cellar_tally' } },
  /* item Level 120: the Ox Road's base */
  { id: 'dawn',    name: 'Dawnsteel',   tier: 7, level: 88, smith: 88, craft: 88, value: 360,
    bar: 'dawn_bar',    plank: 'duskwood_plank', wood: 'duskwood', rarity: 'mythic',
    words: { wood: ['duskwood', 'Duskwood'], leather: ['dawnhide', 'Dawnhide'], cloth: ['duskweave', 'Duskweave'] },
    homes: ['ox_road'], parts: { ring: 'runners_tin', earrings: 'wagon_pin', necklace: 'ox_shoe', cape: 'waybill' } },
].map((t) => {
  const iL = tierLevel(t.tier - 1);
  return { ...t, step: t.tier - 1, iL, level: Math.max(1, iL - GEAR_STEPS.wearAhead),
    ...(t.words ? { words: Object.freeze({ wood: Object.freeze(t.words.wood), leather: Object.freeze(t.words.leather), cloth: Object.freeze(t.words.cloth) }),
      homes: Object.freeze(t.homes.slice()), parts: Object.freeze({ ...t.parts }) } : {}) };
});

/* ── THE LADDER ON STEPS (lane/gear-phase-b, systems, 2026-11-23; docs/design/redesign/27-formula-overhaul.md G-2 phase B and 2.3,
   12-targets.md 3.3 and 8, 19-power-ledger.md). Past the shipped seven the ladder runs on gear-steps.js's grid: a tier is
   GEAR_STEPS.tierSteps item Levels over the one under it (tierLevel(step)), worn from its item Level less GEAR_STEPS.wearAhead (the rule
   every piece is worn by), so every Level band has its base tier and a new tier is ONE row below (the designer's 8.3 puts the shipped seven
   on the same grid: Emberforged and Dawnsteel are the 100 and 120 tiers, their homes Carter's Rest and the Ox Road above). Every slot ladder
   follows the row with nothing typed: the three armor weights and every weapon family here, the spellbook, the shield (shields.js) and
   the jewels and the cloak (slot-ladders.js), each piece's stats the one formula's at its item Level (tools/gen-gear.mjs, src/core/gear-
   stats.js: past Dawnsteel the budget grows in proportion to item Level, never held).
     step     the grid tier: item Level = tierLevel(step) (step 8 is item Level 160, the Catacomb wings' base, danger.js DANGER_GROUNDS)
     id, name the metal (plate, sword, warhammer, hatchets, shield, the jewels: "<name> Helm", "<name> Sword")
     wood     [id, word] the bow, crossbow, staff, wand and codex ("<word> Bow", "<word> Codex"); leather and cloth the same for their lines
     homes    the grounds that DROP the tier's base (12-targets 3.3: the gear base is fixed by the ground, drops with a home): every armor
              piece, weapon, shield and codex rolls there as a plain row in hours (src/data/base-drops.js). The jewels and the cloak are made
              at the bench from a home's part (slot-ladders.js), never dropped (09-crafting: a crafter makes the two slot families a Trait
              rides on)
     parts    { ring, earrings, necklace, cape }: the part (an imbuement item a body on a home drops, drop-hours.js DROP_HOURS.made) the bench
              takes for each made piece
   VALUE: the shipped top's multiplier carried up the wage curve at the piece's item step (src/data/wage.js: "goods and gear read wage(step)
   at DEPTH, the piece's item step"), so a tier's book climbs with the coin a hunted hour pays there and its sale stays over its twin's
   (loot-bands.js gearSaleRate). STARTING VALUES, NOT RULINGS: the words are this lane's (short real words with a root, never a mood word,
   no other game's names) and the naming pass may move any of them in one place; the pace and the book are levers the designer owns. */
const STEP_TIERS = [
  /* item Level 140, worn from 130. Wyvern Roost: cobalt the blue ore of the crags (the miners named it for the kobolds they blamed for it),
     juniper the twisted wood that grows on the ledges, drakehide off the wyverns, samite the silk the wyverns carry up to their nests */
  { step: 7, id: 'cobalt', name: 'Cobalt', wood: ['juniper', 'Juniper'], leather: ['drakehide', 'Drakehide'], cloth: ['samite', 'Samite'],
    homes: ['wyvern_roost'],
    parts: { ring: 'gizzard_stone', earrings: 'tail_spur', necklace: 'fire_gland', cape: 'stolen_fleece' } },
  /* item Level 160, worn from 150. The Catacombs under Havora: wolfram is the heavy grey ore the vault cutters struck (its old name, wolf's
     foam), rowan the tree hung over the dead to keep them down, eelskin the hide of what lives in the Flooded Wing, cerecloth the waxed linen
     the Keepers wrap the dead in */
  { step: 8, id: 'wolfram', name: 'Wolfram', wood: ['rowan', 'Rowan'], leather: ['eelskin', 'Eelskin'], cloth: ['cerecloth', 'Cerecloth'],
    homes: ['catacomb_bone_wing', 'catacomb_flooded_wing'],
    parts: { ring: 'owing_tag', earrings: 'candle_snuffer', necklace: 'lime_mortar', cape: 'leech_jaw' } },
];
const SHIPPED_TOP = SHIPPED_TIERS[SHIPPED_TIERS.length - 1];
export const MATERIAL_TIERS = [
  ...SHIPPED_TIERS,
  ...STEP_TIERS.slice().sort((a, b) => a.step - b.step).map((s, i) => {
    const iL = tierLevel(s.step), level = Math.max(1, iL - GEAR_STEPS.wearAhead);
    if (s.step !== SHIPPED_TIERS.length + i) throw new Error('gear-tiers.js: step tier ' + s.id + ' is not the next tier on the grid');
    return {
      id: s.id, name: s.name, tier: SHIPPED_TIERS.length + 1 + i, step: s.step, iL, level, smith: level, craft: level,
      value: Math.round((SHIPPED_TOP.value * wage(iL)) / wage(SHIPPED_TOP.iL)), rarity: SHIPPED_TOP.rarity,
      words: Object.freeze({ wood: Object.freeze(s.wood.slice()), leather: Object.freeze(s.leather.slice()), cloth: Object.freeze(s.cloth.slice()) }),
      homes: Object.freeze(s.homes.slice()), parts: Object.freeze({ ...s.parts }),
    };
  }),
];
/** The tiers with HOMES (a ground that drops their base and the parts its bench takes): base-drops.js, shields.js and slot-ladders.js build
    their dropped and made pieces from them. Every material is on the grid; the shipped seven keep their own ladder rows. */
export const STEP_MATERIALS = Object.freeze(MATERIAL_TIERS.filter((t) => Array.isArray(t.homes)));
/* the tiers past the shipped seven: every slot ladder's next rungs (stepRungs, stepWords) */
const NEW_MATERIALS = MATERIAL_TIERS.slice(SHIPPED_TIERS.length);
/** A material word for a step tier's `line` (wood, leather or cloth) or its metal ('metal'): [id, word]. */
export const materialWord = (mat, line) => (line === 'metal' ? [mat.id, mat.name] : mat.words[line]);
/** THE FIELD A STEP-TIER PIECE CARRIES: `step`, its grid tier (12-targets 8: the piece's tier is its item Level over tierSteps). src/data/items.js
    stamps the item Level tierLevel(step) from it (ITEM_LEVELS) and tools/gen-gear.mjs sizes the piece there, never at the iL the generated table
    wrote back. Every material's piece carries it (12-targets 8.3). */
export const stepOf = (mat) => (mat && Number.isInteger(mat.step) ? { step: mat.step } : {});
/** A NAMED PIECE STAMPED TO TIER `tier` (12-targets 8.3: "on every named twin stamped to a tier"): its material's grid step and worn from that
    item Level less wearAhead, so a named piece is its tier's numbers plus its rule (28-named-pieces.md) and no row types a wear Level. */
export const onTier = (tier) => { const m = MATERIAL_TIERS[tier - 1]; return m ? { reqLv: m.level, ...stepOf(m) } : {}; };

/* ── Armour slots ─────────────────────────────────────────────────────
   Each slot's armor is its share of the formula's defense budget (src/data/gear-profiles.js: the slot's
   GEAR_STEPS.slotPm, the line's profile, the tier's item Level); the hand table that stood here is gone.
   bars  = bars consumed; lvOff = levels above the tier gate it unlocks       */
export const ARMOUR_SLOTS = [
  { key: 'helm',      slot: 'helmet', label: 'Helm',      bars: 2, vmul: 120, lvOff: 5 },
  { key: 'platebody', slot: 'body',   label: 'Platebody', bars: 5, vmul: 300, lvOff: 10 },
  { key: 'platelegs', slot: 'pants',  label: 'Platelegs', bars: 4, vmul: 220, lvOff: 8 },
  { key: 'boots',     slot: 'boots',  label: 'Boots',     bars: 2, vmul: 80,  lvOff: 2 },
  { key: 'gauntlets', slot: 'gloves', label: 'Gauntlets', bars: 1, vmul: 70,  lvOff: 1 },
  { key: 'belt',      slot: 'belt',   label: 'Belt',      bars: 1, vmul: 80,  lvOff: 3 },
];

/* ── Weapon families ──────────────────────────────────────────────────
   Every style climbs the same seven rungs so no build stalls. Swords are the
   balanced baseline; warhammers trade accuracy for raw damage; bows and
   staves are crafted from wood and carry their style's attack/strength.
   A family's accuracy and damage are its profile's (src/data/gear-profiles.js GEAR_PROFILES, keyed as
   src/core/gear-stats.js profileKeyOf reads the row: weaponType, hands, discipline), never a number here.
   `names` lets a family keep its established early-game names. Past the shipped seven every family's rung is
   its step tier's word and its own label ("Wolfram Sword", "Rowan Bow": stepRungs below), so a tier row is the
   whole family's next rung.                                                   */
const SHIPPED_FAMILIES = [
  {
    key: 'sword', label: 'Sword', weaponType: 'sword', skill: 'smithing', mat: 'bar',
    vmul: 100, lvOff: 5, bars: 2, planks: 1,
    names: ['Bronze Sword', 'Iron Sword', 'Steel Sword', 'Mithril Sword', 'Rune Sword', 'Emberforged Sword', 'Dawnsteel Sword'],
    ids:   ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword', 'rune_sword', 'ember_sword', 'dawn_sword'],
  },
  /* THE CLUB (Tyler 2026-10-16: two-handed club = crush). The practice club is two-handed, so every
     rung above it is too (designer 2026-10-22, the style ladder): no shield beside a crusher. */
  {
    key: 'warhammer', label: 'Warhammer', weaponType: 'hammer', skill: 'smithing', mat: 'bar', twoHanded: true,
    vmul: 110, lvOff: 8, bars: 3, planks: 2,
    names: ['Stone Maul', 'Iron Warhammer', 'Steel Warhammer', 'Mithril Warhammer', 'Rune Warhammer', 'Emberforged Warhammer', 'Dawnsteel Warhammer'],
    ids:   ['stone_maul', 'iron_warhammer', 'steel_warhammer', 'mithril_warhammer', 'rune_warhammer', 'ember_warhammer', 'dawn_warhammer'],
  },
  {
    /* A BOW FILLS BOTH HANDS (Tyler 2026-10-23, SHIELDS: a bow can't carry a shield; a crossbow and a shield can). */
    key: 'bow', label: 'Bow', weaponType: 'ranged', skill: 'crafting', mat: 'plank', twoHanded: true,
    vmul: 105, lvOff: 5, planks: 3, thread: 2,
    names: ['Shortbow', 'Longbow', 'Willow Longbow', 'Maple Bow', 'Yew Bow', 'Runewood Bow', 'Duskwood Bow'],
    ids:   ['shortbow', 'longbow', 'willow_longbow', 'maple_bow', 'yew_bow', 'runewood_bow', 'duskwood_bow'],
  },
  /* MAGE = WAND + SPELLBOOK, HEALER = STAFF (Tyler 2026-10-19). Both are weaponType
     'magic' (the combat style: Magic accuracy and damage, the weakness triangle); the
     ROLE is the item's `discipline` (src/data/hunt-roles.js HUNT_ROLES: destruction =
     Mage, restoration = Healer). A staff is two-handed: no off-hand beside it. */
  {
    key: 'staff', label: 'Staff', weaponType: 'magic', skill: 'crafting', mat: 'plank',
    discipline: 'restoration', twoHanded: true,
    vmul: 100, lvOff: 6, planks: 2, essence: 1,
    names: ['Apprentice Staff', 'Oak Staff', 'Willow Staff', 'Maple Staff', 'Yew Staff', 'Runewood Staff', 'Duskwood Staff'],
    ids:   ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff', 'yew_staff', 'runewood_staff', 'duskwood_staff'],
  },
  /* The Mage's wand: one hand, so a spellbook rides in the off-hand. Alone it hits a
     little under the staff; with its tier's spellbook it out-damages the staff by about
     a third (the Mage deals damage, the Healer heals). Seven tiers: the Duskwood Wand is a Krell's
     Hold hall prize (designer 2026-11-13, lane/d-barrow-data; its door is that design's piece 5, PENDING_SOURCE). */
  {
    key: 'wand', label: 'Wand', weaponType: 'magic', skill: 'crafting', mat: 'plank',
    discipline: 'destruction',
    vmul: 90, lvOff: 6, planks: 1, essence: 1,
    names: ['Apprentice Wand', 'Oak Wand', 'Willow Wand', 'Maple Wand', 'Yew Wand', 'Runewood Wand', 'Duskwood Wand'],
    ids:   ['apprentice_wand', 'oak_wand', 'willow_wand', 'maple_wand', 'yew_wand', 'runewood_wand', 'duskwood_wand'],
  },
  /* THE STYLE LADDER (designer 2026-10-22, src/data/style-gear.js). Dual axes (bleed) and the crossbow had no
     rung above the practice kit. A `null` id is a rung the PRACTICE KIT holds (tier 1: the practice
     weapon), so no tier-1 copy of it is generated. A rung ships only with a source: tier 2 is made (style-gear.js),
     tier 3 a Warrens Rare (the loot bands, 2026-10-23), tier 4 made at Smithing or Crafting 45 (lane/b-phase0-tier4). Hatchets: a pair, two-handed, even accuracy and damage
     (the practice pair's 4/4 shape). Crossbow: a little less accuracy and a little more damage than the
     bow of its tier (the practice crossbow's 4/4 against the bow's 5/3). */
  {
    key: 'hatchets', label: 'Hatchets', weaponType: 'axe', skill: 'smithing', mat: 'bar', twoHanded: true,
    vmul: 100,
    /* tiers 5 to 7 (designer 2026-11-13, lane/d-barrow-data): Rares on the Barrow March beside the other weapons of their tier
       (the Barrow Knights at 5, the Pyre Field's Provost at 6, Krell's hall prize at 7) */
    names: [null, 'Iron Hatchets', 'Steel Hatchets', 'Mithril Hatchets', 'Rune Hatchets', 'Emberforged Hatchets', 'Dawnsteel Hatchets'],
    ids:   [null, 'iron_hatchets', 'steel_hatchets', 'mithril_hatchets', 'rune_hatchets', 'ember_hatchets', 'dawn_hatchets'],
  },
  {
    key: 'crossbow', label: 'Crossbow', weaponType: 'ranged', skill: 'crafting', mat: 'plank',   // wood-named, as the bow line is
    vmul: 100,
    /* tiers 5 to 7 as the hatchets' (Captain Hask at 5, beside his Yew Bow) */
    names: [null, 'Oak Crossbow', 'Willow Crossbow', 'Maple Crossbow', 'Yew Crossbow', 'Runewood Crossbow', 'Duskwood Crossbow'],
    ids:   [null, 'oak_crossbow', 'willow_crossbow', 'maple_crossbow', 'yew_crossbow', 'runewood_crossbow', 'duskwood_crossbow'],
  },
];
/* A ladder's ids and names carried up every step tier: `line` names the tier's word (the metal, or the wood) and `label` the piece. */
const stepRungs = (names, ids, line, label) => ({
  names: Object.freeze([...names, ...NEW_MATERIALS.map((m) => materialWord(m, line)[1] + ' ' + label)]),
  ids: Object.freeze([...ids, ...NEW_MATERIALS.map((m) => materialWord(m, line)[0] + '_' + label.toLowerCase())]),
});
export const WEAPON_FAMILIES = SHIPPED_FAMILIES.map((f) => Object.freeze({ ...f, ...stepRungs(f.names, f.ids, f.mat === 'bar' ? 'metal' : 'wood', f.label) }));

/* ── The off-hand SPELLBOOK (Tyler 2026-10-19: Mage = wand + spellbook). Worn in the
   `shield` slot (src/data/gathering.js EQUIP_SLOTS, labelled Offhand). Its stats are the
   spellbook profile's (src/data/gear-profiles.js): Magic accuracy and damage, a little defence. Worn by Level like every
   piece of gear (LEVEL_REQ, Tyler 2026-10-24). The same rungs as the wand, a codex of the tier's wood past the seventh. */
export const SPELLBOOKS = Object.freeze({
  vmul: 80,
  ...stepRungs(['Apprentice Primer', 'Oakboard Spellbook', 'Willowleaf Spellbook', 'Maplebound Spellbook', 'Yewclasp Spellbook', 'Runewood Codex', 'Duskwood Codex'],
    ['apprentice_primer', 'oak_spellbook', 'willow_spellbook', 'maple_spellbook', 'yew_spellbook', 'runewood_codex', 'duskwood_codex'], 'wood', 'Codex'),
});

const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);

/* ── Armour ARCHETYPES — the combat triangle (b278). ───────────────────────

   ── TWO STANDING RULINGS. DO NOT RE-LITIGATE. ─────────────────────────────
   1. ARMOR IS WORN BY THE HERO'S LEVEL, EVERY LINE (Tyler 2026-10-24: "I think
      all gear should just be hero level"; LEVEL_REQ above). Plate, leather AND
      cloth gate on the hero's Level at the tier's level (MATERIAL_TIERS.level),
      never on a skill. This REPLACES the 2026-08-15 ruling "armour requirements
      are Defence-only, permanently", and keeps its reason: a piece must never be
      gated on Magic or Ranged, because mix-and-match (a melee hero in cloth
      against a magic-weak monster) dies at the requirements screen otherwise.
      Defense failed that same test for casters and rangers, who earn almost no
      Defense behind a tank; the Level rises from every kill in every role.
   2. THE ARCHETYPES ARE TRADES, NOT TIERS. Plate buys survival; cloth buys
      DAMAGE FOR ANY WEAPON — "if someone wants crit instead of armor they can
      still use cloth with melee; cloth should give the character dps
      regardless of the weapon type." So cloth's damage is not a mage
      entitlement to be deleted when magic out-scales melee; the defect to fix
      there is that its damage pays only one weapon class. Any rescale converts
      cloth's damage to weapon-agnostic — it does not remove it.

   Three lines per tier so armour finally participates in the melee/ranged/magic
   triangle instead of one generic "plate" fitting everyone:
     • PLATE (heavy): the highest defence, but it TANKS your ranged and (badly)
       your magic accuracy — a warrior's armour.
     • LEATHER (ranged): ~half the defence, but boosts ranged accuracy + a little
       crit; a mild magic penalty.
     • CLOTH (robes, magic): the least defence, but the only armour that boosts
       magic accuracy AND magic damage; poor for melee/ranged.
   The whole triangle is DATA (each line's profile in src/data/gear-profiles.js): the rolls sum the active style's
   accuracy field (atkB / rangeAtkB / magicAtkB) and damage field across every
   equipped item, so an item carrying a negative magicAtkB literally lowers a
   mage's hit rate. No combat-code change. Plate keeps its exact ids (save-safe);
   the penalty fields are added to it. */
/* a line's tier words carried up every step tier (its own word for the line: materialWord) */
const stepWords = (line, names, ids) => ({
  tierNames: Object.freeze([...names, ...NEW_MATERIALS.map((m) => materialWord(m, line)[1])]),
  tierIds: Object.freeze([...ids, ...NEW_MATERIALS.map((m) => materialWord(m, line)[0])]),
});
const ARMOUR_LINES = [
  { key: 'plate', vmul: 1.00, icon: '🛡️',
    id: (mat, slot) => mat.id + '_' + slot.key,          // UNCHANGED existing ids
    name: (mat, slot) => mat.name + ' ' + slot.label },
  { key: 'leather', vmul: 0.70, icon: '🎽', craftMat: 'plank',
    ...stepWords('leather', ['Leather', 'Studded Leather', 'Boarhide', 'Snakeskin', 'Wyvernhide', 'Dragonhide', 'Dawnhide'],
      ['leather', 'studded', 'boarhide', 'snakeskin', 'wyvernhide', 'dragonhide', 'dawnhide']),
    slotLabels: { helmet: 'Hood', body: 'Body', pants: 'Chaps', boots: 'Boots', gloves: 'Bracers', belt: 'Belt' },
    id: (mat, slot, line, i) => line.tierIds[i] + '_' + slot.slot,
    name: (mat, slot, line, i) => line.tierNames[i] + ' ' + line.slotLabels[slot.slot] },
  /* `craftMat: 'plank'` since b497 — it said `'cloth'` for the line's whole
     life, naming a tiered material this game has never had. Nothing reads the
     field, which is exactly why the lie survived: it described the intent, and
     the recipe generator below silently shipped an UNTIERED cloth cost instead.
     It now names what the recipe actually consumes. */
  { key: 'cloth', vmul: 0.70, icon: '🧥', craftMat: 'plank',
    ...stepWords('cloth', ['Apprentice', 'Adept', 'Scholar', 'Warlock', 'Sorcerer', 'Archmage', 'Duskweave'],
      ['apprentice', 'adept', 'scholar', 'warlock', 'sorcerer', 'archmage', 'duskweave']),
    slotLabels: { helmet: 'Hat', body: 'Robe Top', pants: 'Robe Bottom', boots: 'Slippers', gloves: 'Gloves', belt: 'Sash' },
    id: (mat, slot, line, i) => line.tierIds[i] + '_' + slot.slot,
    name: (mat, slot, line, i) => line.tierNames[i] + ' ' + line.slotLabels[slot.slot],
    /* CLOTH'S DAMAGE IS A PREMIUM, NOT THE HIT (designer 2026-11-15, lane/d-mage-110): a set's Magic damage stays a small share of
       its armor (the cloth profile's magicStrB, src/data/gear-profiles.js), so the Mage's blow sits near the warhammer's at each tier's
       Level (tests/style-gear.mjs SG-8) and a level of Magic is worth what a level of Melee is. Cloth still carries damage (ruling 2
       above); making it count for every weapon is still the open engine piece. */ },
];

// ── Generate the gear items ──────────────────────────────────────────
export const GEAR_ITEMS = (() => {
  const out = {};
  /* every row's base stats are the formula's (withGearStats below, src/data/gear-stats.generated.js) */

  // Armour — every archetype × every slot × every tier (the combat triangle).
  ARMOUR_LINES.forEach((line) => {
    ARMOUR_SLOTS.forEach((slotDef) => {
      MATERIAL_TIERS.forEach((mat, i) => {
        const item = {
          n: line.name(mat, slotDef, line, i),
          icon: line.icon,
          v: round5(slotDef.vmul * mat.value * line.vmul),
          type: 'armor',
          slot: slotDef.slot,
          armourClass: line.key,          // heavy / leather / cloth — read by UI + item flyout
          rarity: mat.rarity,
          tier: mat.tier,
          /* Worn by the hero's Level at the tier's level (LEVEL_REQ, Tyler 2026-10-24). */
          reqSkill: LEVEL_REQ,
          reqLv: mat.level,
          ...stepOf(mat),
        };
        out[line.id(mat, slotDef, line, i)] = item;
      });
    });
  });

  // Weapons — every family at every tier it names.
  WEAPON_FAMILIES.forEach((fam) => {
    MATERIAL_TIERS.slice(0, fam.ids.length).forEach((mat, i) => {
      if (!fam.ids[i]) return;   // the practice kit holds this rung
      /** @type {any} */
      const item = {
        n: fam.names[i],
        icon: fam.weaponType === 'ranged' ? '🏹' : fam.weaponType === 'magic' ? '🪄' : fam.weaponType === 'hammer' ? '🔨' : '⚔️',
        v: round5(fam.vmul * mat.value),
        type: 'weapon',
        slot: 'weapon',
        weaponType: fam.weaponType,
        /* A weapon carries ITS OWN style's accuracy and damage, the fields the combat engine rolls it on (src/core/member.js
           deriveProfile): its family's profile names only those (src/data/gear-profiles.js; tests/style-gear.mjs SG-9). */
        rarity: mat.rarity,
        tier: mat.tier,
        /* Worn by the hero's Level at the tier's level, whatever the style (LEVEL_REQ, Tyler 2026-10-24). */
        reqSkill: LEVEL_REQ,
        reqLv: mat.level,
        ...stepOf(mat),
      };
      if (fam.discipline) item.discipline = fam.discipline;
      if (fam.twoHanded) item.twoHanded = true;
      out[fam.ids[i]] = item;
    });
  });

  // Spellbooks — the Mage's off-hand, one per wand tier.
  SPELLBOOKS.ids.forEach((id, i) => {
    const mat = MATERIAL_TIERS[i];
    out[id] = {
      n: SPELLBOOKS.names[i], icon: '📕', v: round5(SPELLBOOKS.vmul * mat.value),
      type: 'offhand', slot: 'shield', offhand: 'spellbook', discipline: 'destruction',
      rarity: mat.rarity, tier: mat.tier, reqSkill: LEVEL_REQ, reqLv: mat.level, ...stepOf(mat),
    };
  });

  return withGearStats(out);
})();

/* THE LADDERS, tier by tier (the loot bands, 2026-10-23): each armour line x slot, each weapon family and the
   spellbook, as item ids from tier 1 up (null: a rung the practice kit holds). tests/hunt-core/drop-tables.mjs
   sale-ladder walks them (a piece never sells for less than its lower-tier twin). The recipe ladders that once
   lived here went with crafted gear (demolition D2, 2026-10-14). */
export const GEAR_LADDERS = Object.freeze([
  ...ARMOUR_LINES.flatMap((line) => ARMOUR_SLOTS.map((s) => Object.freeze({ key: line.key + ':' + s.slot,
    ids: Object.freeze(MATERIAL_TIERS.map((mat, i) => line.id(mat, s, line, i))) }))),
  ...WEAPON_FAMILIES.map((f) => Object.freeze({ key: 'weapon:' + f.key, ids: Object.freeze(f.ids.slice()) })),
  Object.freeze({ key: 'spellbook', ids: Object.freeze(SPELLBOOKS.ids.slice()) }),
]);

/** An armour line's word at a tier, for a page that names a set: 'Iron', 'Studded', 'Adept' (null off the ladder). */
export function armourLineWord(armourClass, tier) {
  const i = Math.floor(Number(tier)) - 1;
  const line = ARMOUR_LINES.find((l) => l.key === armourClass);
  if (!line || !(i >= 0 && i < MATERIAL_TIERS.length)) return null;
  return (/** @type {any} */ (line).tierNames ? /** @type {any} */ (line).tierNames[i] : MATERIAL_TIERS[i].name).split(' ')[0];
}
