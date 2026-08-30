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

/* ── THE LADDERS, AS DATA (b348) ───────────────────────────────────────────
   `GEAR_LADDERS` names every ordered rung the generator lays down: one entry
   per (archetype × slot) and per weapon family, its rungs in material-tier
   order, each rung carrying the item id and the generated recipe id.

   WHY IT IS EXPORTED RATHER THAN RECONSTRUCTED. Xarn reported that a Steel
   Platebody (22 DEF) asked for MORE Smithing than a Mithril one (34 DEF). The
   cause was two authorities: this generator lays a curve, and a hand-authored
   row in recipes.js is spread first and WINS (see the header note). Nothing
   compared the two, so a hand-authored gate could sit anywhere and no test
   could see it — the drift shape this repo has been bitten by repeatedly.

   A guard that rebuilt the lanes by pattern-matching item ids would be a
   SECOND copy of the id scheme (plate is `mat.id + '_' + slot.key`, leather and
   cloth are `tierId + '_' + slot.slot`), i.e. the same failure one layer up.
   So the generator publishes the lanes it actually built, and the guard reads
   the live ARTISAN_RECIPES gate for each rung. One authority for what a lane
   IS; the merged recipe table for what each rung COSTS.                      */
const LADDERS = [];

// ── Generate the recipes that produce them ───────────────────────────
// Returns { smithing:[...], crafting:[...] } in the engine's recipe shape.
export const GEAR_RECIPES = (() => {
  const smithing = [];
  const crafting = [];

  // Armour recipes for all three archetypes (b278): plate is forged (smithing,
  // bars); leather and cloth are crafted (crafting) from planks/thread/essence, so
  // the ranged- and mage-armour lines are a real reason to level Crafting.
  ARMOUR_LINES.forEach((line) => {
    ARMOUR_SLOTS.forEach((slotDef) => {
      const lane = {
        key: line.key + '/' + slotDef.key,
        label: line.key + ' ' + slotDef.label,
        kind: 'armour',
        skill: line.key === 'plate' ? 'smithing' : 'crafting',
        rungs: [],
      };
      LADDERS.push(lane);
      MATERIAL_TIERS.forEach((mat, i) => {
        const output = line.id(mat, slotDef, line, i);
        /* The curve, computed ONCE and shared by the recipe and the lane. A
           rung that quoted the gate separately from the recipe that carries it
           would be the very drift this table exists to detect. */
        const curveReq = line.key === 'plate'
          ? Math.min(99, mat.smith + slotDef.lvOff)
          // Cap below 95 so the Hunt-forged Wyrmgilt Mantle stays the pinnacle crafting rung.
          : Math.min(94, mat.craft + slotDef.lvOff);
        lane.rungs.push({
          tier: mat.tier,
          material: mat.name,
          itemId: output,
          recipeId: (line.key === 'plate' ? 'forge_' : 'craft_') + output,
          curveReq,
        });
        if (line.key === 'plate') {
          const inputs = {}; inputs[mat.bar] = slotDef.bars;
          smithing.push({
            id: 'forge_' + output, name: 'Forge ' + line.name(mat, slotDef, line, i), icon: line.icon,
            inputs, output,
            xp: Math.round(20 * slotDef.bars * (1 + mat.tier * 0.85)),
            req: curveReq,
            ms: 2400 + mat.tier * 320,
          });
        } else {
          /* ── THE ARMOUR COST SHAPE, AND WHY CLOTH DID NOT HAVE IT (b497) ──
             Plate and leather both cost [a TIER-INDEXED material] x [the slot's
             own weight] (+ leather, an untiered reagent rising with the tier).
             The tiered material is what makes the cost climb: bronze_bar 32 g ->
             dawn_bar 4,200 g is 131x, normal_plank 18 -> duskwood_plank 2,600 is
             144x. CLOTH HAD NEITHER TERM. Its inputs were `silk_thread 2+i` and
             `magic_essence 1..2` — both UNTIERED and both blind to the slot — so
             a whole line's cost ran 160 g -> 540 g (3.4x) while its output ran
             50 g -> 75,600 g. Measured against the real ITEMS table:

                            T1    T2    T3    T4    T5    T6     T7   (out/in)
               plate body  1.1   0.9   2.0   1.4   2.3   4.9    5.1
               leather     0.9   0.7   1.4   2.2   3.3   4.5    5.6
               cloth       0.8   1.3   3.9   8.4  22.0  56.3  140.0   <-- faucet

             craft_voidweave_body turned 540 g of thread into a 75,600 g robe,
             and a Voidweave SASH cost exactly what the robe did, because nothing
             in the old expression mentioned the slot at all.

             THE FIX MIRRORS THE OTHER TWO LINES RATHER THAN INVENTING A NUMBER:
             the tier's plank at HALF the slot's weight (rounded up), keeping the
             identity reagents on top. Half, not full: at full weight cloth would
             cost MORE than leather for an item of identical book value while
             carrying 45% less defence, which would kill the line. At half it
             stays the cheapest of the three archetypes to make — its design
             identity — and lands at 5.6x-9.7x at tier 7 against leather's
             3.6x-6.8x, instead of 140x. Tier 1 moves 160 g -> 178-214 g, so the
             opening rungs are where they were.

             NO NEW ITEM IDS, deliberately. A bespoke seven-rung "bolt" ladder is
             the textbook answer and it is a content program (seven items, seven
             sources, art, drop tables) that would also strand every player who
             can craft cloth today. The tier plank is already the crafting
             skill's universal tiered stock — leather armour, every bow and every
             staff draw on it — and the magic staves draw on these EXACT planks
             (yew / runewood / duskwood are the magic woods), so an arcane robe
             framed with the same enchanted timber is the fiction the game
             already ships.
             ⚠ RECIPES ARE VENDORED INTO THE EDGE (supabase/functions/hr-accrue/
             catalogue.js imports src/data/recipes.js). Changing this line needs
             an EDGE REDEPLOY or the server keeps charging the old inputs. */
          const inputs = {};
          if (line.key === 'leather') { inputs[mat.plank] = slotDef.bars; inputs.silk_thread = 1 + i; }
          else {                                                          // cloth
            inputs[mat.plank] = Math.max(1, Math.ceil(slotDef.bars / 2));
            inputs.silk_thread = 2 + i;
            inputs.magic_essence = 1 + (i >= 3 ? 1 : 0);
          }
          crafting.push({
            id: 'craft_' + output, name: (line.key === 'cloth' ? 'Weave ' : 'Stitch ') + line.name(mat, slotDef, line, i), icon: line.icon,
            inputs, output,
            xp: Math.round(18 * slotDef.bars * (1 + mat.tier * 0.85)),
            req: curveReq,
            ms: 2400 + mat.tier * 320,
          });
        }
      });
    });
  });

  WEAPON_FAMILIES.forEach((fam) => {
    const lane = {
      key: 'weapon/' + fam.key,
      label: fam.label,
      kind: 'weapon',
      skill: fam.mat === 'bar' ? 'smithing' : 'crafting',
      rungs: MATERIAL_TIERS.map((mat, i) => ({
        tier: mat.tier, material: mat.name, itemId: fam.ids[i], recipeId: 'make_' + fam.ids[i],
        curveReq: Math.min(99, (fam.mat === 'bar' ? mat.smith : mat.craft) + fam.lvOff),
      })),
    };
    LADDERS.push(lane);
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
        req: lane.rungs[i].curveReq,
        ms: 2400 + mat.tier * 340,
      };
      (fam.mat === 'bar' ? smithing : crafting).push(recipe);
    });
  });

  return { smithing, crafting };
})();

/* Frozen after GEAR_RECIPES has run — the lanes are a description of what was
   generated, never a place to author. */
export const GEAR_LADDERS = LADDERS;
