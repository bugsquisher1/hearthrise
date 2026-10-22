// ============================================================
// src/data/gear-tiers.js — THE PROGRESSION SPINE (b215)
//
// One table drives every piece of tiered gear in Hearthrise. Hand-authoring
// ~70 armour/weapon entries guarantees drift (a missing tier, a stat that
// doesn't follow the curve). Instead the material ladder and the per-slot stat
// curves live here as data, and the items are GENERATED from them. (The recipe
// half was deleted with crafted gear in the 2026-10-14 demolition.)
//
// Design rules this encodes:
//   • Seven material tiers spanning levels 1 → 88, so a player is never more
//     than ~15 levels from the next visible upgrade. No cliff before 99.
//   • Every armour slot exists at every tier — you can always complete a set.
//   • Four weapon families (sword / warhammer / bow / staff) each run the full
//     ladder, so every combat style progresses at the same pace.
//   • The top two tiers are original to Hearthrise: EMBERFORGED and DAWNSTEEL
//     — the game's own name read as a promise (hearth → ember, rise → dawn).
//
// Hand-authored entries in items.js intentionally WIN over anything
// generated here (they're spread first), so historical ids keep their exact
// stats and values and old saves stay valid.
// ============================================================

/* ── The material ladder ───────────────────────────────────────────────
   smith  = smithing level the tier's *base* piece unlocks at
   craft  = crafting level for the wood-based families at this tier
   value  = economic multiplier; item value = slot.vmul * tier.value        */
export const MATERIAL_TIERS = [
  { id: 'bronze',  name: 'Bronze',      tier: 1, smith: 1,  craft: 1,  value: 0.6,
    bar: 'bronze_bar',  plank: 'normal_plank',   wood: 'normal',   rarity: 'common' },
  { id: 'iron',    name: 'Iron',        tier: 2, smith: 15, craft: 15, value: 1.3,
    bar: 'iron_bar',    plank: 'oak_plank',      wood: 'oak',      rarity: 'uncommon' },
  { id: 'steel',   name: 'Steel',       tier: 3, smith: 30, craft: 30, value: 5,
    bar: 'steel_bar',   plank: 'willow_plank',   wood: 'willow',   rarity: 'rare' },
  { id: 'mithril', name: 'Mithril',     tier: 4, smith: 45, craft: 45, value: 15,
    bar: 'mithril_bar', plank: 'maple_plank',    wood: 'maple',    rarity: 'epic' },
  { id: 'rune',    name: 'Rune',        tier: 5, smith: 60, craft: 60, value: 45,
    bar: 'rune_bar',    plank: 'yew_plank',      wood: 'yew',      rarity: 'legendary' },
  { id: 'ember',   name: 'Emberforged', tier: 6, smith: 75, craft: 75, value: 130,
    bar: 'ember_bar',   plank: 'runewood_plank', wood: 'runewood', rarity: 'legendary' },
  { id: 'dawn',    name: 'Dawnsteel',   tier: 7, smith: 88, craft: 88, value: 360,
    bar: 'dawn_bar',    plank: 'duskwood_plank', wood: 'duskwood', rarity: 'mythic' },
];

/* ── Armour slots ─────────────────────────────────────────────────────
   def   = defence bonus per tier (index 0 = tier 1). These curves were fitted
           to the values the original hand-made pieces already used, so
           iron_helm(5) / steel_helm(10) / iron_platebody(12) / steel_platebody(22)
           sit exactly on the line the generated pieces continue.
   bars  = bars consumed; lvOff = levels above the tier gate it unlocks       */
export const ARMOUR_SLOTS = [
  { key: 'helm',      slot: 'helmet', label: 'Helm',      def: [3, 5, 10, 16, 24, 33, 44],  bars: 2, vmul: 120, lvOff: 5 },
  { key: 'platebody', slot: 'body',   label: 'Platebody', def: [6, 12, 22, 34, 50, 68, 90], bars: 5, vmul: 300, lvOff: 10 },
  { key: 'platelegs', slot: 'pants',  label: 'Platelegs', def: [4, 8, 15, 24, 35, 48, 64],  bars: 4, vmul: 220, lvOff: 8 },
  { key: 'boots',     slot: 'boots',  label: 'Boots',     def: [2, 4, 7, 11, 16, 22, 30],   bars: 2, vmul: 80,  lvOff: 2 },
  { key: 'gauntlets', slot: 'gloves', label: 'Gauntlets', def: [1, 3, 5, 8, 12, 17, 23],    bars: 1, vmul: 70,  lvOff: 1 },
  { key: 'belt',      slot: 'belt',   label: 'Belt',      def: [2, 4, 7, 11, 16, 22, 30],   bars: 1, vmul: 80,  lvOff: 3 },
];

/* ── Weapon families ──────────────────────────────────────────────────
   Every style climbs the same seven rungs so no build stalls. Swords are the
   balanced baseline; warhammers trade accuracy for raw damage; bows and
   staves are crafted from wood and carry their style's attack/strength.
   `names` lets a family keep its established early-game names.              */
export const WEAPON_FAMILIES = [
  {
    key: 'sword', label: 'Sword', weaponType: 'sword', skill: 'smithing', mat: 'bar',
    atk: [4, 7, 12, 18, 25, 33, 42], str: [3, 6, 10, 15, 20, 27, 35],
    vmul: 100, lvOff: 5, bars: 2, planks: 1,
    names: ['Bronze Sword', 'Iron Sword', 'Steel Sword', 'Mithril Sword', 'Rune Sword', 'Emberforged Sword', 'Dawnsteel Sword'],
    ids:   ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword', 'rune_sword', 'ember_sword', 'dawn_sword'],
  },
  /* THE CLUB (Tyler 2026-10-16: two-handed club = crush). The practice club is two-handed, so every
     rung above it is too (designer 2026-10-22, the style ladder): no shield beside a crusher. */
  {
    key: 'warhammer', label: 'Warhammer', weaponType: 'hammer', skill: 'smithing', mat: 'bar', twoHanded: true,
    atk: [3, 7, 9, 14, 19, 25, 32], str: [7, 12, 19, 28, 39, 52, 68],
    vmul: 110, lvOff: 8, bars: 3, planks: 2,
    names: ['Stone Maul', 'Iron Warhammer', 'Steel Warhammer', 'Mithril Warhammer', 'Rune Warhammer', 'Emberforged Warhammer', 'Dawnsteel Warhammer'],
    ids:   ['stone_maul', 'iron_warhammer', 'steel_warhammer', 'mithril_warhammer', 'rune_warhammer', 'ember_warhammer', 'dawn_warhammer'],
  },
  {
    key: 'bow', label: 'Bow', weaponType: 'ranged', skill: 'crafting', mat: 'plank',
    atk: [5, 9, 14, 20, 27, 35, 45], str: [3, 6, 10, 15, 21, 28, 36],
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
    atk: [3, 6, 10, 15, 21, 28, 36], str: [5, 9, 14, 21, 29, 38, 49],
    vmul: 100, lvOff: 6, planks: 2, essence: 1,
    names: ['Apprentice Staff', 'Oak Staff', 'Willow Staff', 'Maple Staff', 'Yew Staff', 'Runewood Staff', 'Duskwood Staff'],
    ids:   ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff', 'yew_staff', 'runewood_staff', 'duskwood_staff'],
  },
  /* The Mage's wand: one hand, so a spellbook rides in the off-hand. Alone it hits a
     little under the staff; with its tier's spellbook it out-damages the staff by about
     a third (the Mage deals damage, the Healer heals). Six tiers: a Duskwood wand waits
     for tier-7 content (an item ships only with a source). */
  {
    key: 'wand', label: 'Wand', weaponType: 'magic', skill: 'crafting', mat: 'plank',
    discipline: 'destruction',
    atk: [4, 7, 12, 18, 25, 33], str: [4, 8, 13, 19, 27, 35],
    vmul: 90, lvOff: 6, planks: 1, essence: 1,
    names: ['Apprentice Wand', 'Oak Wand', 'Willow Wand', 'Maple Wand', 'Yew Wand', 'Runewood Wand'],
    ids:   ['apprentice_wand', 'oak_wand', 'willow_wand', 'maple_wand', 'yew_wand', 'runewood_wand'],
  },
  /* THE STYLE LADDER (designer 2026-10-22, src/data/style-gear.js). Dual axes (bleed) and the crossbow had no
     rung above the practice kit. A `null` id is a rung the PRACTICE KIT holds (tier 1: the bound practice
     weapon), so no tier-1 copy of it is generated. A rung ships only with a source (style-gear.js recipes);
     the steel rungs and up wait for the next batch. Hatchets: a pair, two-handed, even accuracy and damage
     (the practice pair's 4/4 shape). Crossbow: a little less accuracy and a little more damage than the
     bow of its tier (the practice crossbow's 4/4 against the bow's 5/3). */
  {
    key: 'hatchets', label: 'Hatchets', weaponType: 'axe', skill: 'smithing', mat: 'bar', twoHanded: true,
    atk: [4, 7, 12, 18, 25, 33, 42], str: [4, 7, 11, 16, 22, 29, 38],
    vmul: 100,
    names: [null, 'Iron Hatchets'],
    ids:   [null, 'iron_hatchets'],
  },
  {
    key: 'crossbow', label: 'Crossbow', weaponType: 'ranged', skill: 'crafting', mat: 'plank',   // wood-named, as the bow line is
    atk: [4, 8, 13, 19, 26, 34, 43], str: [4, 7, 11, 16, 22, 29, 37],
    vmul: 100,
    names: [null, 'Oak Crossbow'],
    ids:   [null, 'oak_crossbow'],
  },
];

/* ── The off-hand SPELLBOOK (Tyler 2026-10-19: Mage = wand + spellbook). Worn in the
   `shield` slot (src/data/gathering.js EQUIP_SLOTS, labelled Offhand). Fixed stats
   (gear ruling): Magic accuracy and damage, a little defence. Gated on Magic like the
   wand it pairs with (the defence-only gate is ARMOUR's; a book is not armour).
   Six tiers, the same rungs as the wand. */
export const SPELLBOOKS = Object.freeze({
  magicAtk: [1, 2, 4, 6, 8, 11], magicStr: [2, 3, 5, 8, 11, 15], def: [1, 2, 3, 5, 7, 9],
  vmul: 80,
  names: ['Apprentice Primer', 'Oakboard Spellbook', 'Willowleaf Spellbook', 'Maplebound Spellbook', 'Yewclasp Spellbook', 'Runewood Codex'],
  ids:   ['apprentice_primer', 'oak_spellbook', 'willow_spellbook', 'maple_spellbook', 'yew_spellbook', 'runewood_codex'],
});

const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);

/* ── Armour ARCHETYPES — the combat triangle (b278). ───────────────────────

   ── TWO STANDING RULINGS (Tyler, 2026-08-15). DO NOT RE-LITIGATE. ─────────
   1. ARMOUR REQUIREMENTS ARE DEFENCE-ONLY, PERMANENTLY. Every line below —
      plate, leather AND cloth — gates on `defense` at the tier's level, and a
      magic/ranged piece must NEVER be gated on Magic/Ranged instead. The
      reasoning is load-bearing rather than cosmetic: defence-only gating is
      exactly what makes MIX-AND-MATCH viable. The planned elemental /
      enemy-type system expects a melee player to put cloth pieces on against a
      magic-weak monster; gate cloth behind a Magic level and that whole
      strategy dies at the requirements screen. (Raised by Xarn on the
      Plaguewarden Greaves; ruled, and closed.)
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
   The whole triangle is DATA: getPlayerCombatRolls already sums the active style's
   accuracy field (atkB / rangeAtkB / magicAtkB) and damage field across every
   equipped item, so an item carrying a negative magicAtkB literally lowers a
   mage's hit rate. No combat-code change. Plate keeps its exact ids (save-safe);
   the penalty fields are added to it. */
const ARMOUR_LINES = [
  { key: 'plate', vmul: 1.00, defMul: 1.00, icon: '🛡️',
    id: (mat, slot) => mat.id + '_' + slot.key,          // UNCHANGED existing ids
    name: (mat, slot) => mat.name + ' ' + slot.label,
    fields: (def, i) => ({ rangeAtkB: -Math.round(def * 0.25), magicAtkB: -Math.round(def * 0.5) }) },
  { key: 'leather', vmul: 0.70, defMul: 0.55, icon: '🎽', craftMat: 'plank',
    tierNames: ['Leather', 'Studded Leather', 'Boarhide', 'Snakeskin', 'Wyvernhide', 'Dragonhide', 'Voidhide'],
    tierIds:   ['leather', 'studded', 'boarhide', 'snakeskin', 'wyvernhide', 'dragonhide', 'voidhide'],
    slotLabels: { helmet: 'Coif', body: 'Body', pants: 'Chaps', boots: 'Boots', gloves: 'Vambraces', belt: 'Belt' },
    id: (mat, slot, line, i) => line.tierIds[i] + '_' + slot.slot,
    name: (mat, slot, line, i) => line.tierNames[i] + ' ' + line.slotLabels[slot.slot],
    fields: (def, i) => ({ rangeAtkB: Math.round(def * 0.5), critB: 0.004 * (i + 1), magicAtkB: -Math.round(def * 0.15) }) },
  /* `craftMat: 'plank'` since b497 — it said `'cloth'` for the line's whole
     life, naming a tiered material this game has never had. Nothing reads the
     field, which is exactly why the lie survived: it described the intent, and
     the recipe generator below silently shipped an UNTIERED cloth cost instead.
     It now names what the recipe actually consumes. */
  { key: 'cloth', vmul: 0.70, defMul: 0.30, icon: '🧥', craftMat: 'plank',
    tierNames: ['Apprentice', 'Adept', 'Scholar', 'Warlock', 'Sorcerer', 'Archmage', 'Voidweave'],
    tierIds:   ['apprentice', 'adept', 'scholar', 'warlock', 'sorcerer', 'archmage', 'voidweave'],
    slotLabels: { helmet: 'Hat', body: 'Robe Top', pants: 'Robe Bottom', boots: 'Slippers', gloves: 'Gloves', belt: 'Sash' },
    id: (mat, slot, line, i) => line.tierIds[i] + '_' + slot.slot,
    name: (mat, slot, line, i) => line.tierNames[i] + ' ' + line.slotLabels[slot.slot],
    fields: (def, i) => ({ magicAtkB: Math.round(def * 0.6), magicStrB: Math.round(def * 0.4), atkB: -Math.round(def * 0.25), rangeAtkB: -Math.round(def * 0.2) }) },
];

// ── Generate the gear items ──────────────────────────────────────────
export const GEAR_ITEMS = (() => {
  const out = {};

  // Armour — every archetype × every slot × every tier (the combat triangle).
  ARMOUR_LINES.forEach((line) => {
    ARMOUR_SLOTS.forEach((slotDef) => {
      MATERIAL_TIERS.forEach((mat, i) => {
        const def = Math.max(1, Math.round(slotDef.def[i] * line.defMul));
        const item = {
          n: line.name(mat, slotDef, line, i),
          icon: line.icon,
          v: round5(slotDef.vmul * mat.value * line.vmul),
          type: 'armor',
          slot: slotDef.slot,
          defB: def,
          armourClass: line.key,          // heavy / leather / cloth — read by UI + item flyout
          rarity: mat.rarity,
          tier: mat.tier,
          /* b246: armour is gated on DEFENCE at the tier's level. */
          reqSkill: 'defense',
          reqLv: mat.smith,
        };
        // Fold in the archetype's per-style accuracy/damage fields (the triangle).
        const f = line.fields(slotDef.def[i], i);
        Object.keys(f).forEach((k) => { if (f[k]) item[k] = f[k]; });
        out[line.id(mat, slotDef, line, i)] = item;
      });
    });
  });

  // Weapons — every family at every tier it names.
  WEAPON_FAMILIES.forEach((fam) => {
    MATERIAL_TIERS.slice(0, fam.ids.length).forEach((mat, i) => {
      if (!fam.ids[i]) return;   // the practice kit holds this rung
      const item = {
        n: fam.names[i],
        icon: fam.weaponType === 'ranged' ? '🏹' : fam.weaponType === 'magic' ? '🪄' : fam.weaponType === 'hammer' ? '🔨' : '⚔️',
        v: round5(fam.vmul * mat.value),
        type: 'weapon',
        slot: 'weapon',
        weaponType: fam.weaponType,
        atkB: fam.atk[i],
        strB: fam.str[i],
        rarity: mat.rarity,
        tier: mat.tier,
        /* b246: weapons are gated on their own combat style at the tier's level. */
        reqSkill: fam.weaponType === 'ranged' ? 'ranged' : fam.weaponType === 'magic' ? 'magic' : 'melee',
        reqLv: mat.smith,
      };
      // Ranged and magic weapons carry their style's own attack/strength too,
      // so the combat engine rolls them against the right stats.
      if (fam.weaponType === 'ranged') { item.rangeAtkB = fam.atk[i]; item.rangeStrB = fam.str[i]; }
      if (fam.weaponType === 'magic')  { item.magicAtkB = fam.atk[i]; item.magicStrB = fam.str[i]; }
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
      magicAtkB: SPELLBOOKS.magicAtk[i], magicStrB: SPELLBOOKS.magicStr[i], defB: SPELLBOOKS.def[i],
      rarity: mat.rarity, tier: mat.tier, reqSkill: 'magic', reqLv: mat.smith,
    };
  });

  return out;
})();

/* Demolition D2 (2026-10-14): the gear RECIPES and their ladders were deleted
   with crafted gear. GEAR_ITEMS above stays until the new roster replaces the
   catalogue. GEAR_LADDERS is empty only because src/main.js still publishes it;
   lane D1 removes that import, and this export goes with it. */
export const GEAR_LADDERS = Object.freeze([]);
