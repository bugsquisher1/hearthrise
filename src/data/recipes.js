// Artisan recipes (cooking/smithing/crafting/prayer)
//
// b139 (QA sweep §1.1): consolidated from legacy.js's Phase A.1 NEW_RECIPES
// IIFE. Now uses the modern multi-input schema (`inputs: {id: qty}`) for
// new recipes; legacy single-input recipes (`input: id, secondary: {...}`)
// stay in their original form because the runtime helper
// `getInputs(recipe)` in legacy.js handles BOTH shapes.
//
// Why this consolidation matters: legacy.js's `add(skill, recipe)` calls
// pushed into `window.ARTISAN_RECIPES` BEFORE main.js ran its
// `Object.assign(window, { ARTISAN_RECIPES })` overwrite. So Phase A.1
// recipes were silently dropped on every boot. Cooked-meat / buff-food /
// new-bar / gated-recipe chains were all dead. This module is now the
// single source of truth.

import { GEAR_RECIPES } from './gear-tiers.js?v=550';
import { WAVE3_RECIPES } from './wave3-uniques.js?v=550';
import { SLOT_RECIPES } from './slot-ladders.js?v=550';
/* b356 — the review-book catalogue's faucets. APPENDED ONLY: this import and
   the two `LIB2_RECIPES.*` terms in ARTISAN_RECIPES below are the whole edit,
   so the parallel Runecrafting/Stonemason lanes merge without a conflict. */
import { LIB2_RECIPES } from './library2-items.js?v=550';
import { ITEMS, foodClassOf } from './items.js?v=550';
import { STONECRAFT_RECIPES } from './stonecraft.js?v=550';

const BASE_RECIPES = {
  cooking: [
    // Fish — original starter chain
    {id:'cook_shrimp',  name:'Cook Shrimp',  icon:'🦐', input:'shrimp',  output:'cooked_shrimp',  xp:30,  req:1,  ms:2400},
    {id:'cook_trout',   name:'Cook Trout',   icon:'🐟', input:'trout',   output:'cooked_trout',   xp:50,  req:15, ms:3000},
    {id:'cook_lobster', name:'Cook Lobster', icon:'🦞', input:'lobster', output:'cooked_lobster', xp:100, req:30, ms:3600},
    {id:'cook_shark',   name:'Cook Shark',   icon:'🦈', input:'shark',   output:'cooked_shark',   xp:200, req:60, ms:5000},
    /* b215: new fish + late crops so cooking has a rung every ~10 levels to 99 */
    {id:'cook_herring',   name:'Cook Herring',   icon:'🐟', input:'herring',   output:'cooked_herring',   xp:40,  req:8,  ms:2600},
    {id:'cook_frostfin',  name:'Cook Frostfin',  icon:'❄️', input:'frostfin',  output:'cooked_frostfin',  xp:260, req:70, ms:5400},
    {id:'cook_swordfish', name:'Cook Swordfish', icon:'🐠', input:'swordfish', output:'cooked_swordfish', xp:150, req:45, ms:4200},
    {id:'cook_moonfish',  name:'Cook Moonfish',  icon:'🌙', input:'moonfish',  output:'cooked_moonfish',  xp:420, req:88, ms:6000},
    /* "Reed & Tide" — the cooking half of the four new fishing rungs, plus
       two multi-input dishes that make late cooking want river crops.
       SHAPE: the four singles use the SINGULAR `input` like every fish sibling
       above; the two combos use `inputs:{}` like cook_veg_stew / cook_bear_pie.
       Both shapes are read by the ONE helper — src/core/artisan.js
       `recipeInputs` (`if (recipe.input) i[recipe.input] = recipe.inputQty||1`)
       — which is also what the edge engine imports, so away accrual debits the
       combos correctly without a second code path. */
    {id:'cook_pikeperch',   name:'Grill Pikeperch',    icon:'🐠', input:'pikeperch',   output:'cooked_pikeperch',   xp:57, req:18, ms:3100},
    {id:'cook_copper_crab', name:'Steam Copper Crab',  icon:'🦞', input:'copper_crab', output:'cooked_copper_crab', xp:66, req:21, ms:3200},
    {id:'cook_silverfin',   name:'Cook Silverfin',     icon:'🍥', input:'silverfin',   output:'cooked_silverfin',   xp:76, req:24, ms:3350},
    {id:'cook_goldgill',    name:'Sear Goldgill',      icon:'🍣', input:'goldgill',    output:'cooked_goldgill',    xp:88, req:27, ms:3500},
    {id:'cook_river_chowder',name:'River Chowder',     icon:'🍲', inputs:{silverfin:2, potato:2, carrot:1}, output:'river_chowder', xp:198, req:52, ms:4600},
    {id:'cook_fishers_pie', name:"Fisher's Pie",       icon:'🥧', inputs:{goldgill:2, wheat:3, potato:1},  output:'fishers_pie',   xp:218, req:56, ms:4700},
    // Combat-meat chain (Phase A.1 — needs raw_*_meat drops from beasts)
    {id:'cook_wolf_meat',    name:'Cook Wolf Meat',    icon:'🥩', inputs:{raw_wolf_meat:1},    output:'cooked_wolf_meat',    xp:35,  req:5,  ms:2400},
    {id:'cook_panther_meat', name:'Cook Panther Meat', icon:'🥩', inputs:{raw_panther_meat:1}, output:'cooked_panther_meat', xp:60,  req:25, ms:2800},
    {id:'cook_bear_meat',    name:'Cook Bear Meat',    icon:'🥩', inputs:{raw_bear_meat:1},    output:'cooked_bear_meat',    xp:120, req:40, ms:3400},
    // Crops — starter cook (Wave 2: turnip was the only crop with no recipe)
    {id:'cook_turnip',      name:'Boil Turnip Mash', icon:'🥣', inputs:{turnip:1},                       output:'turnip_mash',    xp:8,   req:1,  ms:1600},
    // Tier 2 buff foods
    {id:'cook_carrot',      name:'Roast Carrot',     icon:'🥕', inputs:{carrot:1},                       output:'roasted_carrot', xp:20,  req:5,  ms:1500},
    {id:'cook_wheat_bread', name:'Bake Wheat Bread', icon:'🍞', inputs:{wheat:3},                        output:'wheat_bread',    xp:55,  req:20, ms:3000},
    {id:'cook_tomato_soup', name:'Tomato Soup',      icon:'🥣', inputs:{tomato:3, carrot:1},             output:'tomato_soup',    xp:120, req:35, ms:3600},
    {id:'cook_pumpkin',     name:'Roast Pumpkin',    icon:'🎃', inputs:{pumpkin:1},                      output:'roasted_pumpkin',xp:140, req:40, ms:4000},
    {id:'cook_veg_stew',    name:'Vegetable Stew',   icon:'🍲', inputs:{potato:2, carrot:2, tomato:1},   output:'vegetable_stew', xp:180, req:50, ms:4500},
    // Farm-crop intermediates — fill the mid-cooking gap so vegetable XP gain isn't a dead end
    {id:'cook_baked_potato', name:'Baked Potato',    icon:'🥔', inputs:{potato:2},                       output:'baked_potato',   xp:90,  req:25, ms:3200},
    {id:'cook_carrot_stew',  name:'Carrot Stew',     icon:'🍲', inputs:{carrot:3, potato:1},             output:'carrot_stew',    xp:150, req:45, ms:4000},
    {id:'cook_pumpkin_pie',  name:'Pumpkin Pie',     icon:'🥧', inputs:{pumpkin:1, wheat:2},             output:'pumpkin_pie',    xp:240, req:60, ms:4800},
    // Tier 3 — unlocked by recipe scrolls (gated check at runtime)
    {id:'cook_bear_pie',     name:'Bear Claw Pie',   icon:'🥧', inputs:{bear_claw:1, wheat:3}, output:'bear_claw_pie',  xp:280, req:70, ms:5000},
    {id:'cook_hunters_feast',name:"Hunter's Feast",  icon:'🍱', inputs:{troll_hide:1, bear_pelt:1, cooked_trout:2}, output:'hunters_feast', xp:320, req:75, ms:5500, gated:'field_cookbook'},
    {id:'cook_dragon_stew',  name:'Dragon Stew',     icon:'🍜', inputs:{dragon_scale:1, carrot:1, tomato:1, pumpkin:1, potato:1}, output:'dragon_stew', xp:450, req:85, ms:6000, gated:'marrow_cookbook'},
    {id:'cook_lich_soup',    name:'Lich Soul Soup',  icon:'🥣', inputs:{lich_soul:1, wheat:1}, output:'lich_soul_soup', xp:600, req:90, ms:6500, gated:'soul_recipe'},
    {id:'cook_void_banquet', name:'Void Banquet',    icon:'🎂', inputs:{void_core:1, dragon_bones:1, cooked_shark:3}, output:'void_banquet', xp:900, req:99, ms:7000},
    /* b215: sinks for the three late-game crops */
    {id:'cook_goldenroot',  name:'Goldenroot Roast',  icon:'🍠', inputs:{goldenroot:2},                 output:'goldenroot_roast', xp:300, req:65, ms:5000},
    {id:'cook_ember_tart',  name:'Ember Tart',        icon:'🥧', inputs:{emberfruit:2, wheat:2},        output:'ember_tart',       xp:520, req:78, ms:5600},
    {id:'cook_moon_elixir', name:'Moonbloom Elixir',  icon:'🍶', inputs:{moonbloom:2, magic_essence:1}, output:'moonbloom_elixir', xp:780, req:92, ms:6400},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). The hold marches on
       rations, not on banquets: this is the only cooking output with no
       `heals` and no `buff`, because it is stores, not a meal. */
    {id:'cook_field_ration', name:'Field Rations ×4', icon:'🥖', inputs:{wheat:4, cooked_wolf_meat:2, carrot:2}, output:'field_ration', outputQty:4, xp:160, req:22, ms:3800},
  ],
  smithing: [
    // Bar smelting — full chain so steel_bar + rune_bar exist as ingredients for forging.
    {id:'smelt_copper',  name:'Copper Bar',  icon:'🟤', input:'copper_ore',  output:'copper_bar',  xp:15,  req:1,  ms:2400},
    /* Game-design ruling, found by playing: THE BRONZE WALL. Bronze bar
       used to cost 1 coal at Smithing 8, and the only coal source in the game is
       Coal Rock at MINING 30 (or a mid-tier monster drop). So the tier-1 armour
       chain a brand-new player is pointed at — mine copper, smelt, forge a helm —
       was gated on a level-30 mining grind, and Iron gear (Mining 15) was
       reachable BEFORE Bronze. The whole starter tier was unreachable in the
       order the game teaches it.
       THE RULING: coal is the TIER-3 reagent and its first gate is Steel, which
       already sits at Smithing 35 next to Coal Rock's Mining 30. Bronze and Iron
       are single-ore smelts. Bronze drops to req 1 so a fresh smith's very first
       action produces the bar the starter armour is made of (gear-tiers.js has
       always declared bronze smith:1 — the bar was the one row that disagreed),
       and costs 2 copper_ore so it is ore-hungrier than the copper bar it beats
       on xp/sec (20/2.6 = 7.69 vs 15/2.4 = 6.25): a real choice, not a dead rung.
       Deliberately NOT done: a new tin ore or a low-level coal seam. Both add a
       faucet — coal is v:40, four times copper ore, so a Mining-5 coal node would
       hand a starter 600 g/min — and a new item id needs a catalogue row, an
       icon and drop-table work for zero extra decisions. Removing a reagent that
       nothing else in the tier can supply is the smaller, stronger fix.
       Coal keeps every one of its OTHER sinks (steel 2, gold 2, mithril 3, rune 4,
       ember 4, dawn 5, and the steel forge lines), so the Mining-30 seam and the
       Mining-52 rich seam lose no demand — they lose only the demand they could
       not legally serve. */
    {id:'smelt_bronze',  name:'Bronze Bar',  icon:'🟫', inputs:{copper_ore:2},                                output:'bronze_bar',  xp:20,  req:1,  ms:2600},
    {id:'smelt_iron',    name:'Iron Bar',    icon:'⬜', input:'iron_ore',    output:'iron_bar',    xp:30,  req:15, ms:3000},
    /* ── THE SELF-SUPPLY RULING (game-designer, 2026-09-13, final) ─────────
       THE RULE, in one line: **a material is made where its tier opens, and no
       rung may ask for a tier the player cannot yet open** — formally, for every
       recipe R and every input i, `req(R) >= the cheapest level at which i can be
       MADE`. DEEPSEAM-5 measured 57 shipped rungs that broke it and froze the
       count; this is the build that pays it to ZERO, and the guard now asserts
       zero with a mutation arm.

       WHY THE BAR MOVED AND NOT THE ARMOUR. A tier's gear is generated at
       `MATERIAL_TIERS.smith + slot.lvOff` (gear-tiers.js), so the tier's FIRST
       rung is its gauntlets at smith+1 — while the bar these forges eat sat
       *above the whole band*: steel bar 35 vs steel gauntlets 31, mithril bar 55
       vs a band running 46-55, rune bar 75 above a band that ENDS at 70. Pushing
       consumers up instead would have collapsed six-rung bands onto one level and
       shoved rune gauntlets (61) into the Emberforged tier, i.e. it would have
       taken content away from the player to fix a bookkeeping error. Moving the
       bar to `MATERIAL_TIERS.smith` — the number that already MEANS "this tier
       opens now" — makes the ladder read the way it always claimed to:
           30 you can work steel → 31 the gauntlets → 40 the platebody.
       And it holds FOR EVERY FUTURE TIER by construction, because smith+0 is
       below smith+lvOff for every slot and weapon family there can ever be.
       Bars keep their xp and ms, so nothing about the paced artisan curve moves;
       only the level at which the rung appears does (steel 19.4 xp/s, verdite
       22.6, mithril 24.0 … the series is still strictly increasing BY LEVEL:
       iron 10.0 @15 → gold 15.0 @25 → steel 19.4 @30 → verdite 22.6 @42 →
       mithril 24.0 @45 → rune 40.0 @60 → ember 53.1 @75 → dawn 68.6 @88).
       The ORE is unchanged and still arrives on the Mining ladder (mithril rock
       60, emberstone 75, dawnstone 90): the smith who mines is early to the bar
       and late to the ore, which is what the market, the drop tables and the
       Deep Seam band are for. What is gone is the LIE — a forge rung you have
       the level for and a bar rung you do not.

       GOLD IS NOT A GEAR TIER (no MATERIAL_TIERS row, no armour, no weapon): its
       only reason to exist is the jewellery lane, whose first two rungs — Gold
       Ring and Hunter Necklace — are Crafting 25. So the rule's other half
       applies: a supply rung never sits above the first rung that consumes it.
       40 → 25. Gold ore is a Mining-45 rock AND a drop off two mid monsters
       (Bandit 6%, Captain 50% + the bar itself at 25%), so a Crafting-25 ring
       has a real supply that is not "wait twenty Mining levels".
       The row is also MOVED above steel so the lane renders in level order.

       AND IT LOSES ITS COAL — the b525 BRONZE WALL, one rung over. That ruling
       (played, live, 2026-09-09) is a rule and not a number: *nothing reachable
       before coal is minable may demand coal*, because the only gatherable coal
       in the game is the Mining-30 Coal Rock. Bronze was freed by REMOVING the
       reagent rather than by inventing a low-level coal node — "removing a
       reagent that nothing else in the tier can supply is the smaller, stronger
       fix" (the Bronze Wall note above) — and a Smithing-25 gold bar priced in
       Mining-30 coal is the same wall in the same place. Gold keeps its ore, its
       xp and its ms. Coal's first sink is now STEEL at Smithing 30, which is
       exactly where Coal Rock opens at Mining 30 — the two ladders finally meet
       on the same rung — and it keeps every sink above that (steel 2, mithril 3,
       rune 4, ember 4, dawn 5, deathsteel 6 and the forge lines). */
    {id:'smelt_gold',    name:'Gold Bar',    icon:'🟡', input:'gold_ore',    output:'gold_bar',    xp:60,  req:25, ms:4000},
    {id:'smelt_steel',   name:'Steel Bar',   icon:'⬜', inputs:{iron_bar:1, coal:2},                          output:'steel_bar',   xp:70,  req:30, ms:3600},
    /* ── "DEEP SEAM" — the Steel(35)→Mithril(55) bar silence ───────────────
       Verdite is the one bar between them, and it does NOT eat coal: it eats
       FLUXSALT (its own Mining-40 rung). That is deliberate and it is the
       reason the batch adds a second node type. Coal already has seven sinks
       and is the reagent this game has choked on twice (the Bronze Wall note
       above, and the Mining-30 chokepoint); a mid-band bar priced in coal
       would make the band a coal grind wearing a new name. Fluxsalt gives the
       new metal its own supply line, and the smelt pays 22.6 xp/s against
       steel's 19.4 and mithril's 24.0 — seated, not a new best. */
    {id:'smelt_verdite', name:'Verdite Bar', icon:'🟩', inputs:{verdite_ore:2, flux_salt:1}, output:'verdite_bar', xp:95, req:42, ms:4200},
    {id:'smelt_mithril', name:'Mithril Bar', icon:'🔵', input:'mithril_ore', output:'mithril_bar', xp:120, req:45, ms:5000, secondary:{coal:3}},
    {id:'smelt_rune',    name:'Rune Bar',    icon:'🔷', inputs:{mithril_bar:1, magic_essence:1, coal:4},      output:'rune_bar',    xp:240, req:60, ms:6000},
    /* b215: the last two bars — smithing had nothing new between 75 and 99. */
    {id:'smelt_ember',   name:'Emberforged Bar', icon:'🟧', inputs:{emberstone_ore:1, coal:4},                output:'ember_bar',   xp:340, req:75, ms:6400},
    {id:'smelt_dawn',    name:'Dawnsteel Bar',   icon:'🟪', inputs:{dawnstone_ore:1, ember_bar:1, coal:5},    output:'dawn_bar',    xp:480, req:88, ms:7000},
    /* b215: tool ladder tiers 6-7 (best owned tool auto-applies) */
    {id:'forge_ember_axe',     name:'Forge Emberforged Axe',     icon:'🪓', inputs:{ember_bar:2, runewood_plank:1}, output:'ember_axe',     xp:2600, req:80, ms:5800},
    {id:'forge_dawn_axe',      name:'Forge Dawnsteel Axe',       icon:'🪓', inputs:{dawn_bar:2, duskwood_plank:1},  output:'dawn_axe',      xp:4200, req:92, ms:6400},
    {id:'forge_ember_pickaxe', name:'Forge Emberforged Pickaxe', icon:'⛏️', inputs:{ember_bar:2, runewood_plank:1}, output:'ember_pickaxe', xp:2600, req:80, ms:5800},
    {id:'forge_dawn_pickaxe',  name:'Forge Dawnsteel Pickaxe',   icon:'⛏️', inputs:{dawn_bar:2, duskwood_plank:1},  output:'dawn_pickaxe',  xp:4200, req:92, ms:6400},
    /* Wave 3: ARTISAN tools forged at the anvil — hammers (smithing) and knives
       (cooking) speed their skill + grant XP + a double-craft chance. */
    {id:'forge_bronze_hammer', name:'Forge Bronze Hammer', icon:'🔨', inputs:{bronze_bar:2},  output:'bronze_hammer', xp:45,   req:5,  ms:2600},
    {id:'forge_steel_hammer',  name:'Forge Steel Hammer',  icon:'🔨', inputs:{steel_bar:2},   output:'steel_hammer',  xp:330,  req:35, ms:3800},
    {id:'forge_rune_hammer',   name:'Forge Rune Hammer',   icon:'🔨', inputs:{rune_bar:2},    output:'rune_hammer',   xp:1500, req:75, ms:5500},
    {id:'forge_bronze_knife',  name:'Forge Bronze Knife',  icon:'🔪', inputs:{bronze_bar:1},  output:'bronze_knife',  xp:40,   req:5,  ms:2400},
    {id:'forge_steel_knife',   name:'Forge Steel Knife',   icon:'🔪', inputs:{steel_bar:1},   output:'steel_knife',   xp:320,  req:35, ms:3600},
    {id:'forge_rune_knife',    name:'Forge Rune Knife',    icon:'🔪', inputs:{rune_bar:1},    output:'rune_knife',    xp:1500, req:75, ms:5500},
    // Forge weapons — use the new bars now that they exist
    {id:'forge_bronze_sword',  name:'Forge Bronze Sword',  icon:'⚔️', inputs:{bronze_bar:2, normal_plank:1},                output:'bronze_sword',  xp:60,    req:5,  ms:2500},
    {id:'forge_iron_sword',    name:'Forge Iron Sword',    icon:'⚔️', inputs:{iron_bar:3, oak_plank:1},                     output:'iron_sword',    xp:180,   req:20, ms:3000},
    {id:'forge_steel_sword',   name:'Forge Steel Sword',   icon:'⚔️', inputs:{steel_bar:3, willow_plank:1},                 output:'steel_sword',   xp:400,   req:40, ms:3800},
    {id:'forge_rune_sword',    name:'Forge Rune Sword',    icon:'⚔️', inputs:{rune_bar:3, magic_essence:2, maple_plank:1},  output:'rune_sword',    xp:1200,  req:75, ms:5500},
    {id:'forge_stone_maul',    name:'Forge Stone Maul',    icon:'🔨', inputs:{normal_plank:2, copper_ore:4},                output:'stone_maul',    xp:100,   req:10, ms:2700},
    {id:'forge_iron_warhammer',name:'Forge Iron Warhammer',icon:'🔨', inputs:{iron_bar:4, oak_plank:2},                     output:'iron_warhammer',xp:350,   req:35, ms:3800},
    /* Forge armor.
       ── b348 · THE LEVEL GATES BELOW ARE THE GENERATED CURVE, NOT GUESSES ──
       Xarn, live report: "Steel Platebody adds 22 Def requires 60 smithing;
       Mithril Platebody adds 34 Def requires 54ish… the order of armour items
       to smith is not based on requirement yet." Measured: he was exactly
       right, and it was not a typo. These five rows share an id with their
       GENERATED twin in gear-tiers.js, so `mergeGenerated` below drops the
       generated recipe and this `req` silently replaces the curve — invisibly,
       because the ids match. Three lanes were disordered by it:
         plate/platebody  steel 60  >  mithril 55   (INVERTED — Xarn's report)
         plate/helm       steel 50  =  mithril 50   (TIED: a strictly better
                                                     helm at the same level)
         plate/belt       bronze 18 =  iron 18      (TIED, at the bottom rung)
       Each `req` is now `MATERIAL_TIERS[t].smith + ARMOUR_SLOTS[s].lvOff` —
       the same expression the generator uses, so the lane reads 15 levels a
       rung like every other slot. Everything else about these recipes (their
       bespoke bar costs, XP and durations) is untouched: the hand-authored row
       still wins, it just no longer wins an argument about ORDER.
       `GEAR_LADDERS` + the b348 guard in smoke-test.js keep it that way. */
    {id:'forge_iron_helm',     name:'Forge Iron Helm',     icon:'⛑️', inputs:{iron_bar:2},  output:'iron_helm',      xp:200, req:20, ms:3000},
    {id:'forge_iron_platebody',name:'Forge Iron Platebody',icon:'🦺', inputs:{iron_bar:5},  output:'iron_platebody', xp:350, req:25, ms:3800},
    {id:'forge_steel_helm',    name:'Forge Steel Helm',    icon:'⛑️', inputs:{steel_bar:3}, output:'steel_helm',     xp:600, req:35, ms:4500},
    {id:'forge_steel_platebody',name:'Forge Steel Platebody',icon:'🦺',inputs:{steel_bar:7},output:'steel_platebody',xp:900, req:40, ms:5000},
    {id:'forge_bronze_belt',   name:'Forge Bronze Belt',   icon:'🟫', inputs:{bronze_bar:2, wolf_pelt:1}, output:'bronze_belt', xp:120, req:4, ms:2800},
    /* ── "DEEP SEAM" — the five verdite forges (Smithing 45-52) ────────────
       XP is the GENERATED curve's own expression at the bridge's half-tier,
       round(20 × bars × (1 + 3.5 × 0.85)) for armour and round(45 × (1 + 3.5 ×
       0.95)) for a weapon, so these rungs pay what a tier-3½ piece should pay
       and not a hand-picked number. Every one of them is makeable at its own
       level: verdite_bar smelts at 42, its ore opens at Mining 36 and the
       fluxsalt at 40 — deliberately, because the curve these sit beside does
       NOT have that property (57 shipped rungs, 34 of them here, ask for a
       material their own level cannot make; measured and filed in DISCOVERIES,
       frozen by DEEPSEAM-5 so the list can only shrink). The platebody also asks for two
       fluxsalt: the biggest piece is the one that should still want the mine. */
    {id:'forge_verdite_helm',      name:'Forge Verdite Helm',      icon:'⛑️', inputs:{verdite_bar:2},                              output:'verdite_helm',      xp:160, req:45, ms:3900},
    {id:'forge_verdite_blade',     name:'Forge Verdite Blade',     icon:'⚔️', inputs:{verdite_bar:3, willow_plank:1},              output:'verdite_blade',     xp:210, req:46, ms:3900},
    {id:'forge_verdite_platelegs', name:'Forge Verdite Platelegs', icon:'👖', inputs:{verdite_bar:4},                              output:'verdite_platelegs', xp:320, req:47, ms:4000},
    {id:'forge_verdite_platebody', name:'Forge Verdite Platebody', icon:'🦺', inputs:{verdite_bar:5, flux_salt:2},                 output:'verdite_platebody', xp:400, req:50, ms:4400},
    {id:'forge_heartgarnet_maul',  name:'Forge Heartgarnet Maul',  icon:'🔨', inputs:{verdite_bar:3, heartgarnet:1, willow_plank:2}, output:'heartgarnet_maul', xp:480, req:52, ms:4600},
    // Gated forges (a recipe scroll is READ in the bag; hr_recipe_learn consumes it and writes the flag)
    {id:'forge_chief_blade',   name:"Chief's Blade",       icon:'🗡️', inputs:{warlord_badge:1, iron_bar:4, oak_plank:2},    output:'chief_blade',       xp:600,  req:50, ms:5000, gated:'chief_blade_recipe'},
    {id:'forge_captain_blade', name:"Captain's Ribblade",  icon:'🗡️', inputs:{captain_medal:1, steel_bar:4, maple_plank:2},output:'captains_ribblade', xp:1100, req:70, ms:6000, gated:'captain_recipe'},
    // Gathering tools (b201, SYS-3) — the OSRS tool ladder. Each tier speeds
    // its gathering skill (see items.js toolSpeed + features/tools.js).
    {id:'forge_bronze_axe',     name:'Forge Bronze Axe',      icon:'🪓', inputs:{bronze_bar:1, normal_plank:1},   output:'bronze_axe',      xp:40,   req:3,  ms:2500},
    {id:'forge_iron_axe',       name:'Forge Iron Axe',        icon:'🪓', inputs:{iron_bar:2, oak_plank:1},        output:'iron_axe',        xp:140,  req:18, ms:3000},
    {id:'forge_steel_axe',      name:'Forge Steel Axe',       icon:'🪓', inputs:{steel_bar:2, willow_plank:1},    output:'steel_axe',       xp:320,  req:38, ms:3800},
    {id:'forge_mithril_axe',    name:'Forge Mithril Axe',     icon:'🪓', inputs:{mithril_bar:2, maple_plank:1},   output:'mithril_axe',     xp:700,  req:58, ms:4500},
    {id:'forge_rune_axe',       name:'Forge Rune Axe',        icon:'🪓', inputs:{rune_bar:2, yew_plank:1},        output:'rune_axe',        xp:1500, req:78, ms:5500},
    {id:'forge_bronze_pickaxe', name:'Forge Bronze Pickaxe',  icon:'⛏️', inputs:{bronze_bar:1, normal_plank:1},   output:'bronze_pickaxe',  xp:40,   req:3,  ms:2500},
    {id:'forge_iron_pickaxe',   name:'Forge Iron Pickaxe',    icon:'⛏️', inputs:{iron_bar:2, oak_plank:1},        output:'iron_pickaxe',    xp:140,  req:18, ms:3000},
    {id:'forge_steel_pickaxe',  name:'Forge Steel Pickaxe',   icon:'⛏️', inputs:{steel_bar:2, willow_plank:1},    output:'steel_pickaxe',   xp:320,  req:38, ms:3800},
    {id:'forge_mithril_pickaxe',name:'Forge Mithril Pickaxe', icon:'⛏️', inputs:{mithril_bar:2, maple_plank:1},   output:'mithril_pickaxe', xp:700,  req:58, ms:4500},
    {id:'forge_rune_pickaxe',   name:'Forge Rune Pickaxe',    icon:'⛏️', inputs:{rune_bar:2, yew_plank:1},        output:'rune_pickaxe',    xp:1500, req:78, ms:5500},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). Bone Chips are the
       hardener: bone ash for case-hardening is real metallurgy, and it gives
       the 45-60% drop from Weak Skeleton / Skeleton its first ever use. */
    {id:'smith_iron_fitting', name:'Iron Fitting', icon:'🔩', inputs:{iron_bar:3, copper_bar:2, bone_chips:2}, output:'iron_fitting', xp:210, req:25, ms:4200},
    /* b223 — THE HUNT-FORGED KIT (clan-boss-events.md §3.4).
       Five of the six Hunt signature materials are smithed here; the sixth
       (Wyrm Gilding) is tailored under crafting. These recipes are the reason
       the six boss materials are allowed to exist: a signature drop with no
       recipe is vendor trash, and the spec calls that a hard requirement, not
       a nice-to-have. They sit above Dawnsteel and each one needs a material
       that ONLY the clan Hunt drops — the single piece of gear in the game
       that solo play cannot EARN at any level (it can still be bought on the
       market, at a price a clan sets: clan-boss-events.md §3.4a).

       b223 Designer ruling (§3.4a): the level gates were INVERTED. Generated
       Dawnsteel recipes require `88 + slot.lvOff` — gauntlets 89, boots 90,
       belt 91, helm 93, legs 96, body 98 — so a Hunt-forged helm at 92 and a
       platebody at 95 unlocked BELOW the Dawnsteel rung they replace, and the
       girdle tied. Each piece now sits strictly one level above the rung
       beneath it. The band is therefore Smithing 90-99, and the best armour
       piece in the game asks for a maxed Smithing AND a clan that kills Hunt
       bosses — which is the two north-star pillars meeting, on purpose. */
    {id:'forge_regent_helm',         name:'Forge Hollow Regent Helm', icon:'⛑️', inputs:{dawn_bar:3, hollow_sigil:3},   output:'regent_helm',         xp:3600, req:94, ms:6600},
    {id:'forge_slagheart_platebody', name:'Forge Slagheart Platebody',icon:'🦺', inputs:{dawn_bar:6, slagheart_core:3}, output:'slagheart_platebody', xp:6000, req:99, ms:7200},
    {id:'forge_abyssal_greaves',     name:'Forge Abyssal Greaves',    icon:'🦿', inputs:{dawn_bar:5, abyssal_pearl:3},  output:'abyssal_greaves',     xp:5000, req:97, ms:7000},
    {id:'forge_choirbone_gauntlets', name:'Forge Choirbone Gauntlets',icon:'🧤', inputs:{dawn_bar:2, choirbone:2},      output:'choirbone_gauntlets', xp:2400, req:90, ms:6000},
    {id:'forge_warden_girdle',       name:"Forge Warden's Girdle",    icon:'🟫', inputs:{dawn_bar:2, warden_seal:2},    output:'warden_girdle',       xp:2600, req:92, ms:6200},
  ],
  crafting: [
    // Plank sawing
    {id:'saw_normal', name:'Normal Plank', icon:'🪵', input:'normal_log', output:'normal_plank', xp:10,  req:1,  ms:2400},
    {id:'saw_oak',    name:'Oak Plank',    icon:'🪵', input:'oak_log',    output:'oak_plank',    xp:25,  req:15, ms:3000},
    {id:'saw_willow', name:'Willow Plank', icon:'🪵', input:'willow_log', output:'willow_plank', xp:50,  req:30, ms:3600},
    {id:'saw_maple',  name:'Maple Plank',  icon:'🍁', input:'maple_log',  output:'maple_plank',  xp:90,  req:45, ms:4500},
    {id:'saw_yew',    name:'Yew Plank',    icon:'🌲', input:'yew_log',    output:'yew_plank',    xp:160, req:60, ms:6000},
    // Carved weapons
    {id:'carve_shortbow',         name:'Carve Shortbow',          icon:'🏹', inputs:{normal_plank:2, silk_thread:1},       output:'shortbow',         xp:60,  req:5,  ms:2400},
    /* ── THE SELF-SUPPLY RULING, WOOD HALF (2026-09-13; the rule is stated in
       full above the smelting lane) ─────────────────────────────────────────
       These two rungs ask for a plank ONE WOOD TIER ABOVE their own: the Longbow
       is the tier-2 bow (GEAR_LADDERS weapon/bow) and wanted WILLOW, which is
       tier 3 and saws at Crafting 30 — five levels above the bow itself; the
       Apprentice Staff is the tier-1 staff and wanted OAK (tier 2, Crafting 15)
       at level 12. Here the LEVEL is the authored pacing decision and the WOOD is
       the slip, so the wood moves: tier 2 → oak, tier 1 → normal, exactly what
       MATERIAL_TIERS pairs with iron and bronze. The levels do not move, because
       moving them would have tied the Longbow to the Willow Longbow's rung (35 →
       nothing to look forward to) and put the Apprentice Staff on top of the Oak
       Staff, which is the b348 disorder class one lane over. It also un-doubles
       the bow lane: t2 and t3 both used willow, so the ladder's second rung read
       as "the same bow again, bigger". Plank count is unchanged (3 / 2). */
    {id:'carve_longbow',          name:'Carve Longbow',           icon:'🏹', inputs:{oak_plank:3, silk_thread:2},          output:'longbow',          xp:240, req:25, ms:3600},
    {id:'carve_apprentice_staff', name:'Carve Apprentice Staff',  icon:'🪄', inputs:{normal_plank:2, magic_essence:1},     output:'apprentice_staff', xp:120, req:12, ms:2800},
    {id:'carve_oak_staff',        name:'Carve Oak Staff',         icon:'🪄', inputs:{willow_plank:3, magic_essence:2, ancient_rune:1}, output:'oak_staff', xp:300, req:30, ms:4000},
    /* ⚠ THE BATCH STAYS AT 50. DO NOT RAISE IT TO MATCH THE `fletch_*` LADDER.
       This was tried on 2026-08-18 and the accrual guard caught it: at ×500 a
       15-hour absence moves 4,821,000 units of one item against the server's
       `c_max_item_delta = 1,000,000`, i.e. 482% of a clamp that HONEST PLAY
       would then trip — costing the player part of an absence via index.ts's
       degrade ladder. The seven `fletch_*` rungs are over that clamp too, but
       they carry a named Security amnesty (AMMO_CLAMP_BASELINE in
       tests/accrual-engine.mjs, ruled 2026-08-16). An eighth id on that list is
       a NEW Security decision, not an inherited one, and it is not a bug fix's
       to make.

       The faucet was never the batch anyway — it was `iron_arrows.v` at 60,
       fixed at the item (see the block in src/data/items.js). At v:1 this rung
       vendors for 50 g against 180 g of input, i.e. it is no longer profitable
       to farm, which is CORRECT for a consumable: arrows are made to be shot,
       not sold, and paying for the capability is the point.

       ⏳ REDUNDANCY, STATED FOR THE GAME DESIGNER: `fletch_barbed_arrows` is
       the same iron-tier arrow, properly costed, at a supply rate ten times
       this one — so this rung is now strictly dominated and is a retire-or-merge
       candidate. Deliberately NOT done here: that is a content decision. */
    {id:'craft_iron_arrows',      name:'Craft Iron Arrows ×50',   icon:'🏹', inputs:{iron_bar:1, normal_plank:5},          output:'iron_arrows', outputQty:50, xp:120, req:20, ms:3500},
    // Tailoring
    {id:'tailor_leather_boots',   name:'Tailor Leather Boots',    icon:'🥾', inputs:{wolf_pelt:2},                          output:'leather_boots',  xp:80,  req:8,  ms:2400},
    {id:'tailor_leather_gloves',  name:'Tailor Leather Gloves',   icon:'🧤', inputs:{wolf_pelt:1, silk_thread:1},           output:'leather_gloves', xp:120, req:12, ms:2800},
    {id:'tailor_traveler_cape',   name:'Tailor Traveler Cape',    icon:'🦸', inputs:{silk_thread:3, wolf_pelt:2},           output:'traveler_cape',  xp:140, req:15, ms:3000},
    /* ── ELEMENTS v1 — RUNE BINDING: MOVED TO RUNECRAFTING (b432) ─────────
       The three `bind_*_rune` rows lived here, at Crafting 25, in a Crafting
       lane labelled "Runes" — while a skill named Runecrafting made a
       different set of runes entirely. That is the incoherence Tyler named,
       and the ruling is recorded in full at the top of src/data/stonecraft.js:
       RUNECRAFTING OWNS EVERY RUNE IN THE GAME. The rows are now in
       `STONECRAFT_RECIPES.runecrafting` with their essence inputs unchanged
       (plus a Blank Rune, so the whole bench has one grammar) and the same
       level 25 gate, so no live player's supply chain moved.

       ⚠ Do not re-add a rune recipe here. The `out.tag === 'rune'` branch in
         `recipeCategory('crafting')` went with them, and the `uncategorized`
         regression test will catch a re-add on the next run. */
    // Jewelry
    {id:'jewel_copper_ring',      name:'Set Copper Ring',         icon:'💍', inputs:{copper_bar:1, magic_essence:1},        output:'copper_ring',     xp:180, req:20, ms:3000},
    {id:'jewel_hunter_necklace',  name:'String Hunter Necklace',  icon:'📿', inputs:{gold_bar:1, wolf_pelt:1},              output:'hunter_necklace', xp:240, req:25, ms:3500},
    // Gated crafts
    {id:'craft_alpha_cloak',      name:'Craft Alpha Cloak',       icon:'🦸', inputs:{bear_pelt:2, silk_thread:3},           output:'alpha_cloak',     xp:1200, req:60, ms:5500, gated:'alpha_pattern'},
    // Fishing rods (b201, SYS-3 tool ladder — crafted from planks + thread)
    {id:'carve_willow_rod',   name:'Carve Willow Rod',   icon:'🎣', inputs:{normal_plank:2, silk_thread:1},  output:'willow_rod',   xp:50,   req:3,  ms:2400},
    {id:'carve_oak_rod',      name:'Carve Oak Rod',      icon:'🎣', inputs:{oak_plank:2, silk_thread:1},     output:'oak_rod',      xp:150,  req:18, ms:3000},
    {id:'carve_maple_rod',    name:'Carve Maple Rod',    icon:'🎣', inputs:{willow_plank:2, silk_thread:2},  output:'maple_rod',    xp:340,  req:38, ms:3800},
    {id:'carve_yew_rod',      name:'Carve Yew Rod',      icon:'🎣', inputs:{maple_plank:2, silk_thread:3},   output:'yew_rod',      xp:750,  req:58, ms:4500},
    {id:'carve_runewood_rod', name:'Carve Runewood Rod', icon:'🎣', inputs:{yew_plank:3, silk_thread:4, magic_essence:2}, output:'runewood_rod', xp:1600, req:78, ms:5500},
    /* Wave 4: gold jewelry — the real sink that gives Gold ore/bar a purpose. */
    {id:'craft_gold_ring',   name:'Craft Gold Ring',   icon:'💍', inputs:{gold_bar:1},         output:'gold_ring',   xp:80,  req:25, ms:3000},
    {id:'craft_gold_amulet', name:'Craft Gold Amulet', icon:'📿', inputs:{gold_bar:2, ruby:1}, output:'gold_amulet', xp:180, req:40, ms:3600},
    /* Wave 3: ARTISAN tools — sewing needles speed crafting + grant XP + double-craft. */
    {id:'craft_bone_needle',  name:'Carve Bone Needle',  icon:'🪡', inputs:{bones:3, silk_thread:1},      output:'bone_needle',  xp:45,   req:5,  ms:2600},
    {id:'craft_steel_needle', name:'Forge Steel Needle', icon:'🪡', inputs:{steel_bar:1, silk_thread:2}, output:'steel_needle', xp:330,  req:35, ms:3800},
    {id:'craft_rune_needle',  name:'Forge Rune Needle',  icon:'🪡', inputs:{rune_bar:1, silk_thread:3},  output:'rune_needle',  xp:1500, req:75, ms:5500},
    /* b215: the last two planks + rods — crafting stopped at 78 before this. */
    {id:'saw_runewood', name:'Runewood Plank', icon:'🪵', input:'runewood_log', output:'runewood_plank', xp:260, req:75, ms:6500},
    /* SELF-SUPPLY RULING (2026-09-13): 90 → 88, the Dawnsteel tier's own craft
       gate (MATERIAL_TIERS.dawn.craft). Every other plank already sits exactly on
       its tier's gate (normal 1, oak 15, willow 30, maple 45, yew 60, runewood
       75); duskwood alone was pinned to the TREE's Woodcutting level (90), two
       above the tier — so the tier-7 leather and cloth gauntlets, generated at
       craft+lvOff = 89, asked for a plank the crafter could not saw yet. One
       number fixes the whole duskwood line instead of nudging each piece up.
       The LOG is still Woodcutting 90, the same way the ore stays on the Mining
       ladder above its bar. */
    {id:'saw_duskwood', name:'Duskwood Plank', icon:'🪵', input:'duskwood_log', output:'duskwood_plank', xp:380, req:88, ms:7200},
    {id:'carve_duskwood_rod',  name:'Carve Duskwood Rod',  icon:'🎣', inputs:{runewood_plank:3, silk_thread:5, magic_essence:3}, output:'duskwood_rod',  xp:2600, req:84, ms:6000},
    {id:'carve_dawnsteel_rod', name:'Carve Dawnsteel Rod', icon:'🎣', inputs:{duskwood_plank:3, dawn_bar:1, silk_thread:6},      output:'dawnsteel_rod', xp:4200, req:94, ms:6600},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). Slime Gel is the binder:
       it is a resin, it is an 80% drop from tier-1 Slimes, it was worth 5g and
       used by NOTHING — and it is now the thing that holds the castle
       together, so a level-3 player farming slimes is materially useful on
       build day. That is the "every level matters" pillar, made structural. */
    {id:'craft_timber_beam', name:'Timber Beam', icon:'🪵', inputs:{normal_plank:5, oak_plank:2, slime_gel:2}, output:'timber_beam', xp:200, req:25, ms:4200},
    /* The top of the ladder: two castle goods plus two of the rarest orphan
       drops in the game (Ancient Fragment, Cracked Spellstone). */
    /* `craft_keystone` MOVED TO STONEMASON (consumable-economy.md §8.1/§8.2).
       A keystone is the single most masonic object in architecture, and this
       row had exactly the same story as the seven `fletch_*` rows: written
       where a skill existed, waiting for the skill that should own it. The id,
       inputs, xp and req are unchanged, so `clan-seat.js`'s material route
       (`ancient_fragment` / `cracked_spellstone` → via: 'craft_keystone') and
       the eight shop offers that spend keystones all still resolve. See
       src/data/stonecraft.js's castle lane. */
    /* b223 — the sixth Hunt-forged piece. The Crownless Wyrm's gilding is
       worked into cloth rather than steel, which is what gives the cape slot
       its first endgame rung (it has had exactly two entries since launch). */
    {id:'craft_wyrmgilt_mantle', name:'Tailor Wyrmgilt Mantle', icon:'🦸', inputs:{duskwood_plank:3, silk_thread:6, wyrm_gilding:3}, output:'wyrmgilt_mantle', xp:5200, req:95, ms:7000},
  ],
  /* ── PRAYER ─────────────────────────────────────────────────────────────
     THE VOID: this bench shipped with THREE rows — 1, 15, 35 — and then nothing
     from 36 to 99. A player who reached Prayer 36 had no new Prayer action for
     the remaining 64 levels of the skill, on the only bench in the game whose
     whole output is XP. `bury_dragon` at 72 XP per 2 s is ~130k XP/hour against
     a 99 curve of ~13M, so the top of the skill was not slow, it was ABSENT.

     THE SHAPE IS DELIBERATELY THE ONE THE BENCH ALREADY HAS, not a new system:
     `{id,name,icon,input,output:null,xp,req,ms}`. `output:null` makes each row a
     PURE SINK — src/core/artisan.js `recipeInputs` reads singular `input` (→
     `{[input]:1}`) and `produced` is null when `output` is falsy, so the away
     engine, the ledger's craft kind and the attended loop all already handle it
     (this is exactly how `bury_dragon` accrues). ZERO engine code was added for
     these ten rows, which is the test that they are data and not a feature.

     INPUTS ARE MONSTER DROPS, ten of them, chosen so the ladder is fed by the
     combat tier a player is fighting at that Prayer level rather than by a
     second gathering lane — and so ten drops that had a vendor price and no
     other sink acquire one. Every id is verified present in src/data/items.js
     and every one already carries painted or bundle art in
     `LOCAL_ITEM_ICON` (src/render/icons.js), so no icon mapping is owed; each
     row's glyph is its INPUT's own icon, the same relationship `bury_bones`
     has to `bones`.

     The XP curve steps ~1.4x per rung against ms that grows only 2.2 s → 3.8 s,
     which is the standard artisan shape: the later rungs are worth more per
     action AND per hour, but each one costs a rarer drop. Levels are the
     Designer's (ruling 2026-09-12, final); nothing here is derived, so retuning
     is a data edit plus a catalogue regenerate.

     ⚠ ADDING A ROW HERE MOVES THE SERVER. tools/gen-catalogues.mjs emits one
     `hr_activities` row per recipe (kind 'artisan', req_skill = the bench, req_lv
     = `req`) — that row is what lets `set_activity` accept the id at all, so the
     catalogue MUST be applied before the client that offers the tile. `xp` and
     `ms` are NOT in hr_activities; they reach the server through the EDGE
     PAYLOAD, which imports this file (supabase/functions/hr-accrue/catalogue.js),
     so hr-accrue must be redeployed at the same cut. */
  prayer: [
    {id:'bury_bones',     name:'Bury Bones',         icon:'🦴', input:'bones',         output:null, xp:4.5, req:1,  ms:1200},
    {id:'bury_big',       name:'Bury Big Bones',     icon:'🦴', input:'big_bones',     output:null, xp:15,  req:15, ms:1500},
    {id:'bury_dragon',    name:'Bury Dragon Bones',  icon:'🦴', input:'dragon_bones',  output:null, xp:72,  req:35, ms:2000},
    {id:'bury_bone_chips',        name:'Sift Bone Chips',          icon:'🦴',  input:'bone_chips',   output:null, xp:105,  req:40, ms:2200},
    {id:'consecrate_grave_dust',  name:'Consecrate Grave Dust',    icon:'⚱️',  input:'grave_dust',   output:null, xp:155,  req:46, ms:2400},
    {id:'offer_razor_claw',       name:'Offer Razor Claw',         icon:'爪',  input:'razor_claw',   output:null, xp:212,  req:52, ms:2500},
    {id:'scatter_vamp_dust',      name:'Scatter Vampire Dust',     icon:'💜',  input:'vamp_dust',    output:null, xp:295,  req:58, ms:2600},
    {id:'banish_demon_shard',     name:'Banish Demon Shard',       icon:'🔴',  input:'demon_shard',  output:null, xp:420,  req:65, ms:2800},
    {id:'unbind_wraith_veil',     name:'Unbind Wraith Veil',       icon:'👻',  input:'wraith_veil',  output:null, xp:600,  req:72, ms:3000},
    {id:'consecrate_dragon_scale',name:'Consecrate Dragon Scale',  icon:'🐲',  input:'dragon_scale', output:null, xp:855,  req:79, ms:3200},
    {id:'release_lich_soul',      name:'Release Lich Soul',        icon:'☠️',  input:'lich_soul',    output:null, xp:1210, req:86, ms:3400},
    {id:'offer_ancient_claw',     name:'Offer Ancient Claw',       icon:'爪',  input:'ancient_claw', output:null, xp:1700, req:92, ms:3600},
    {id:'purge_void_chitin',      name:'Purge Void Chitin',        icon:'🪲',  input:'void_chitin',  output:null, xp:2400, req:99, ms:3800},
  ]
};

/* ══════════════════════════════════════════════════════════════════════
   b215 — fold in the generated tier ladder (src/data/gear-tiers.js).

   A hand-authored recipe always wins: we skip a generated one if either its
   id OR its output already exists above. That keeps historical recipes (e.g.
   forge_bronze_sword, which uses a bespoke bar+plank cost) authoritative
   while the generator fills in every rung nobody wrote by hand.

   ── b348: WINNING THE MERGE IS NOT THE SAME AS OWNING THE LADDER ─────────
   Sixteen hand-authored rows sit on a generated lane, and each one's `req`
   replaces the curve for that rung. That is fine for a bespoke COST and fatal
   for ORDER: three lanes ended up with a lower tier gated above a higher one
   (see the note on the armour block). The override is deliberately kept — but
   `GEAR_LADDERS` (gear-tiers.js) now publishes every lane with the curve value
   it generated, and the b348 guard asserts the LIVE gate is strictly
   increasing in material tier down each lane. A deviation from the curve is
   allowed; a deviation that disorders the ladder is not.

   Recipes are then sorted by required level so each artisan panel reads as a
   clean ladder instead of "original chain, then a pile of new stuff".
   ══════════════════════════════════════════════════════════════════════ */
function mergeGenerated(base, generated) {
  const seenIds = new Set(base.map((r) => r.id));
  const seenOutputs = new Set(base.map((r) => r.output).filter(Boolean));
  const additions = (generated || []).filter(
    (r) => !seenIds.has(r.id) && !seenOutputs.has(r.output)
  );
  return base.concat(additions).sort((a, b) => (a.req || 0) - (b.req || 0));
}

export const ARTISAN_RECIPES = {
  cooking:  BASE_RECIPES.cooking.slice().sort((a, b) => (a.req || 0) - (b.req || 0)),
  smithing: mergeGenerated(BASE_RECIPES.smithing, GEAR_RECIPES.smithing.concat(WAVE3_RECIPES.smithing, SLOT_RECIPES.smithing, LIB2_RECIPES.smithing)),
  crafting: mergeGenerated(BASE_RECIPES.crafting, GEAR_RECIPES.crafting.concat(WAVE3_RECIPES.crafting, SLOT_RECIPES.crafting, LIB2_RECIPES.crafting)),
  prayer:   BASE_RECIPES.prayer,
  /* The consumable economy's two new benches (R6). Sorted by req like every
     other lane so each panel reads as a ladder rather than as authoring order.
     No `mergeGenerated` — nothing generates into these yet; the staff/bow
     generator hand-off (E7) is Fletching's to make. */
  runecrafting: STONECRAFT_RECIPES.runecrafting.slice().sort((a, b) => (a.req || 0) - (b.req || 0)),
  stonemason:   STONECRAFT_RECIPES.stonemason.slice().sort((a, b) => (a.req || 0) - (b.req || 0)),
};

/* ══════════════════════════════════════════════════════════════════════
   b220 — ARTISAN CATEGORIES (crafting-cooking-taxonomy §§3-5)

   Smithing carries ~81 recipes and crafting ~46. As one level-sorted column
   that is not a ladder, it is a haystack: a player at Smithing 45 hunting
   "the next platebody" scrolls past bars, axes, swords and five other slots.

   The categories below are DERIVED, never authored. There are ~150 recipes;
   a hand-written `category:` field on each is a drift generator (the exact
   problem gear-tiers.js was built to remove — the ladder is generated, so a
   tag would have to be generated too, and then it isn't data, it's a copy).
   Everything here reads fields the recipe and its output item already carry:
   `output.type`, the `_bar` / `_plank` id suffix, and `foodClass`.

   Consequence that matters: a NEW recipe lands in the right tab the moment
   it is written, with nothing else to remember.

   Prayer is deliberately absent — three bury actions are a list, not a
   taxonomy, and it has no output item to derive from.

   b222 — the "Castle Stores" lane (clan-overhaul v2 §15 conflict 2). Keyed on
   `ITEMS[out].tag === 'castle'`, it lands in the SAME commit as the four goods
   it categorises, because `uncategorized` being empty is a regression test and
   adding the items alone would break it.

   It is the LAST claim in every skill, deliberately. A derived taxonomy must
   never *steal* a recipe from a more specific lane: a Phase-B Cellar ale
   (`foodClass:'buff'` AND `tag:'castle'`, §4.5) belongs in Feasts & Draughts
   where the player drinks it, and a hypothetical castle-tagged weapon belongs
   in Weapons. Castle Stores claims exactly what nothing else wants — which
   today is precisely the four typeless, foodClass-less goods.
   ══════════════════════════════════════════════════════════════════════ */
export const ARTISAN_CATEGORIES = {
  smithing: [
    { key: 'smelting', label: 'Smelting' },
    { key: 'weapons',  label: 'Weapons' },
    { key: 'armour',   label: 'Armour' },
    { key: 'tools',    label: 'Tools' },
    { key: 'castle',   label: 'Castle Stores' },
  ],
  crafting: [
    { key: 'sawmill',    label: 'Sawmill' },
    { key: 'weapons',    label: 'Weapons' },
    { key: 'armour',     label: 'Armour' },
    { key: 'jewellery',  label: 'Jewellery' },
    { key: 'tools',      label: 'Tools' },
    { key: 'ammunition', label: 'Ammunition' },
    /* b356 — Crafting's INTERMEDIATE lane. Smithing has had one since the
       beginning (`/_bar$/` → Smelting) and Crafting has had half of one
       (`/_plank$/` → Sawmill), but a crafted material that is neither a bar
       nor a plank had nowhere to land: `weave_voidchitin` (the recipe that
       finally gives void_chitin, hell_ember and war_crown a shared target)
       fell straight through to `uncategorized`, which b220 asserts is empty.
       Keyed on the EXISTING `tag:'crafting-mat'` field rather than a new one. */
    { key: 'materials',  label: 'Materials' },
    /* b432: the "Runes" lane left with the three bind recipes it was built
       for — Runecrafting owns them now (stonecraft.js header). A declared lane
       with nothing in it is a dead tab, so it goes in the same change. */
    { key: 'castle',     label: 'Castle Stores' },
  ],
  cooking: [
    { key: 'provisions', label: 'Provisions' },
    { key: 'feasts',     label: 'Feasts & Draughts' },
    { key: 'castle',     label: 'Castle Stores' },
  ],
  /* b432 — RUNECRAFTING'S TWO LANES, AND THEY ARE THE SKILL'S WHOLE PITCH.
     The single `runes` lane rendered as no strip at all (one category is not a
     choice), so the screen was eleven near-identical tiles and no statement of
     what any of them was for. There are genuinely TWO kinds of rune and they
     do different jobs, so the strip now says so in the player's own words:

       • STAFF RUNES  — `type:'ammo'`. Socketed in the ammo slot for Magic
         strength. The air→blood ladder.
       • WEAPON ENCHANTS — `tag:'rune'`. SPENT to brand a weapon with an
         element, worth +15% against a monster weak to it (core/elements.js).

     Two labels, one derivation each, no hand-tagging — and the answer to "why
     would I choose this one" is finally on the screen. */
  runecrafting: [
    { key: 'staff',   label: 'Staff Runes' },
    { key: 'enchant', label: 'Weapon Enchants' },
  ],
  /* Stonemason has FOUR lanes, which is the reason it needs a strip at all:
     a mason who wants "the next whetstone" must not scroll past quarry rungs,
     blocks and blanks to find it. Landed in the SAME commit as the recipes,
     because `categorizeRecipes(...).uncategorized` being empty is a regression
     test and adding the rows alone would break it. */
  stonemason: [
    { key: 'quarry',     label: 'Quarry' },
    { key: 'masonry',    label: 'Masonry' },
    { key: 'blanks',     label: 'Blank Runes' },
    { key: 'whetstones', label: 'Whetstones' },
    { key: 'castle',     label: 'Castle Stores' },
  ],
};

/* isCastleGood(item) — the single predicate behind the lane AND the Storehouse
   deposit filter. One reader today, two once the Storehouse modal lands; it is
   a function rather than an inline `.tag === 'castle'` so the two can never
   drift apart. */
export function isCastleGood(item) {
  return !!(item && item.tag === 'castle');
}

/* recipeCategory(skillId, recipe) → category key, or null.
   Pure: pass `items` explicitly to classify against a different item table
   (the engine passes window.ITEMS, which is the same object post-merge).
   null means "this skill has no categories" OR "nothing claimed this recipe";
   callers must surface an unclaimed recipe rather than hide it — see
   categorizeRecipes(). */
export function recipeCategory(skillId, recipe, items = ITEMS) {
  if (!recipe) return null;
  const outId = recipe.output || '';
  const out = outId && items ? items[outId] : null;
  const type = out ? out.type : null;

  if (skillId === 'smithing') {
    if (type === 'tool') return 'tools';          // axes + pickaxes
    if (/_bar$/.test(outId)) return 'smelting';   // ore → bar
    if (type === 'weapon') return 'weapons';
    if (type === 'armor') return 'armour';
    if (isCastleGood(out)) return 'castle';       // b222 — Iron Fitting
    return null;
  }

  if (skillId === 'crafting') {
    if (/_plank$/.test(outId)) return 'sawmill';  // log → plank
    if (type === 'tool') return 'tools';          // fishing rods
    if (type === 'ammo') return 'ammunition';
    if (type === 'jewelry') return 'jewellery';
    if (type === 'weapon') return 'weapons';      // bows + staves
    if (type === 'armor') return 'armour';        // leather + cloth
    if (out && out.tag === 'crafting-mat') return 'materials'; // b356 — woven/worked intermediates
    if (isCastleGood(out)) return 'castle';       // b222 — Timber Beam, Keystone
    return null;
  }

  if (skillId === 'runecrafting') {
    /* b432 — the enchant lane is claimed FIRST and on the more specific field.
       `tag:'rune'` is what core/elements.js `runeElement()` reads to map a rune
       to its element, so it is the field that actually distinguishes an
       enchanting rune from a socketed one. Ordering matters if a future rune
       is ever both (§11.2 wants exactly that): a dual-use rune belongs in the
       lane that describes the SCARCE use — you can always socket it, but you
       can only enchant with it once. */
    if (out && out.tag === 'rune') return 'enchant';
    if (type === 'ammo') return 'staff';
    return null;
  }

  if (skillId === 'stonemason') {
    /* THE QUARRY LANE IS DERIVED FROM ITS DEFINING PROPERTY, not from a tag:
       a Stonemason rung with no inputs is a rung where stone ENTERS the game
       (§8.4). Read off the same `recipeInputs`-shaped fields the engine reads,
       so a quarry rung cannot be added without landing in the right tab. */
    const inputs = recipe.inputs || (recipe.input ? { [recipe.input]: 1 } : {});
    if (Object.keys(inputs).length === 0) return 'quarry';
    if (type === 'ammo') return 'whetstones';      // strB stones, ammo slot
    if (/_blank$/.test(outId)) return 'blanks';    // Runecrafting's supply
    if (/_block$/.test(outId)) return 'masonry';   // stone → dressed block
    if (isCastleGood(out)) return 'castle';        // ashlar, keystone
    return null;
  }

  if (skillId === 'cooking') {
    const fc = foodClassOf(out);
    if (fc === 'buff') return 'feasts';
    if (fc === 'healing') return 'provisions';
    if (isCastleGood(out)) return 'castle';       // b222 — Field Ration
    return null;
  }

  return null;
}

/* categorizeRecipes(skillId, recipes?, items?) →
     { groups: [{key, label, recipes[]}], uncategorized: [recipe], total }

   `groups` keeps ARTISAN_CATEGORIES order and only includes categories that
   actually hold something, so an empty lane never becomes a dead tab.
   `uncategorized` must always be empty (a regression test asserts it) — but
   it is returned rather than swallowed so a renderer can show the strays
   instead of making content unreachable. Silence is how content goes missing. */
export function categorizeRecipes(skillId, recipes = ARTISAN_RECIPES[skillId], items = ITEMS) {
  const defs = ARTISAN_CATEGORIES[skillId];
  const list = Array.isArray(recipes) ? recipes : [];
  if (!defs) return { groups: [], uncategorized: [], total: list.length };

  const byKey = new Map(defs.map((d) => [d.key, []]));
  const uncategorized = [];
  list.forEach((r) => {
    const key = recipeCategory(skillId, r, items);
    if (key && byKey.has(key)) byKey.get(key).push(r);
    else uncategorized.push(r);
  });

  const groups = defs
    .filter((d) => byKey.get(d.key).length > 0)
    .map((d) => ({ key: d.key, label: d.label, recipes: byKey.get(d.key) }));

  return { groups, uncategorized, total: list.length };
}
