// ============================================================
// src/data/gear-tiers.js — THE PROGRESSION SPINE (b215)
//
// One table drives every piece of tiered gear in Hearthrise. Hand-authoring
// ~70 armour/weapon entries guarantees drift (a missing tier, a stat that
// doesn't follow the curve, a recipe pointing at the wrong bar). Instead the
// material ladder, the per-slot stat curves, and the recipe shapes live here
// as data, and the items + recipes are GENERATED from them.
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
// Hand-authored entries in items.js/recipes.js intentionally WIN over anything
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
  {
    key: 'warhammer', label: 'Warhammer', weaponType: 'hammer', skill: 'smithing', mat: 'bar',
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
  {
    key: 'staff', label: 'Staff', weaponType: 'magic', skill: 'crafting', mat: 'plank',
    atk: [3, 6, 10, 15, 21, 28, 36], str: [5, 9, 14, 21, 29, 38, 49],
    vmul: 100, lvOff: 6, planks: 2, essence: 1,
    names: ['Apprentice Staff', 'Oak Staff', 'Willow Staff', 'Maple Staff', 'Yew Staff', 'Runewood Staff', 'Duskwood Staff'],
    ids:   ['apprentice_staff', 'oak_staff', 'willow_staff', 'maple_staff', 'yew_staff', 'runewood_staff', 'duskwood_staff'],
  },
];

const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);

// ── Generate the gear items ──────────────────────────────────────────
export const GEAR_ITEMS = (() => {
  const out = {};

  // Armour — every slot at every tier.
  ARMOUR_SLOTS.forEach((slotDef) => {
    MATERIAL_TIERS.forEach((mat, i) => {
      out[mat.id + '_' + slotDef.key] = {
        n: mat.name + ' ' + slotDef.label,
        icon: '🛡️',
        v: round5(slotDef.vmul * mat.value),
        type: 'armor',
        slot: slotDef.slot,
        defB: slotDef.def[i],
        rarity: mat.rarity,
        tier: mat.tier,
        /* b246: armour is gated on DEFENCE at the tier's level, so wielding it is
           a real progression gate (enforced at equipItem, grandfathered for gear
           already worn). Bronze (Lv 1) is effectively ungated. */
        reqSkill: 'defense',
        reqLv: mat.smith,
      };
    });
  });

  // Weapons — every family at every tier.
  WEAPON_FAMILIES.forEach((fam) => {
    MATERIAL_TIERS.forEach((mat, i) => {
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
        reqSkill: fam.weaponType === 'ranged' ? 'ranged' : fam.weaponType === 'magic' ? 'magic' : 'attack',
        reqLv: mat.smith,
      };
      // Ranged and magic weapons carry their style's own attack/strength too,
      // so the combat engine rolls them against the right stats.
      if (fam.weaponType === 'ranged') { item.rangeAtkB = fam.atk[i]; item.rangeStrB = fam.str[i]; }
      if (fam.weaponType === 'magic')  { item.magicAtkB = fam.atk[i]; item.magicStrB = fam.str[i]; }
      out[fam.ids[i]] = item;
    });
  });

  return out;
})();

// ── Generate the recipes that produce them ───────────────────────────
// Returns { smithing:[...], crafting:[...] } in the engine's recipe shape.
export const GEAR_RECIPES = (() => {
  const smithing = [];
  const crafting = [];

  ARMOUR_SLOTS.forEach((slotDef) => {
    MATERIAL_TIERS.forEach((mat, i) => {
      const inputs = {};
      inputs[mat.bar] = slotDef.bars;
      smithing.push({
        id: 'forge_' + mat.id + '_' + slotDef.key,
        name: 'Forge ' + mat.name + ' ' + slotDef.label,
        icon: '🛡️',
        inputs,
        output: mat.id + '_' + slotDef.key,
        // XP tracks material value and bulk — deeper tiers are worth the trip.
        xp: Math.round(20 * slotDef.bars * (1 + mat.tier * 0.85)),
        req: Math.min(99, mat.smith + slotDef.lvOff),
        ms: 2400 + mat.tier * 320,
      });
    });
  });

  WEAPON_FAMILIES.forEach((fam) => {
    MATERIAL_TIERS.forEach((mat, i) => {
      const inputs = {};
      if (fam.mat === 'bar') {
        inputs[mat.bar] = fam.bars;
        if (fam.planks) inputs[mat.plank] = fam.planks;
      } else {
        inputs[mat.plank] = fam.planks;
        if (fam.thread) inputs.silk_thread = fam.thread;
        if (fam.essence) inputs.magic_essence = fam.essence;
      }
      const recipe = {
        id: 'make_' + fam.ids[i],
        name: (fam.mat === 'bar' ? 'Forge ' : 'Carve ') + fam.names[i],
        icon: fam.weaponType === 'ranged' ? '🏹' : fam.weaponType === 'magic' ? '🪄' : fam.weaponType === 'hammer' ? '🔨' : '⚔️',
        inputs,
        output: fam.ids[i],
        xp: Math.round(45 * (1 + mat.tier * 0.95)),
        req: Math.min(99, (fam.mat === 'bar' ? mat.smith : mat.craft) + fam.lvOff),
        ms: 2400 + mat.tier * 340,
      };
      (fam.mat === 'bar' ? smithing : crafting).push(recipe);
    });
  });

  return { smithing, crafting };
})();
