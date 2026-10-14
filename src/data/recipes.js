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

/* The fletching ladder (arrows). Crafted gear — the generated gear-tiers
   recipes, the wave-3 uniques, the library-2 sets, the boss forge and the
   jewellery/cape rows — was deleted in the 2026-10-14 demolition. */
import { SLOT_RECIPES } from './slot-ladders.js?v=584';
import { ITEMS, foodClassOf } from './items.js?v=584';
import { STONECRAFT_RECIPES } from './stonecraft.js?v=584';
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
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). Bone Chips are the
       hardener: bone ash for case-hardening is real metallurgy, and it gives
       the 45-60% drop from Weak Skeleton / Skeleton its first ever use. */
    {id:'smith_iron_fitting', name:'Iron Fitting', icon:'🔩', inputs:{iron_bar:3, copper_bar:2, bone_chips:2}, output:'iron_fitting', xp:210, req:25, ms:4200},
    /* WHETSTONES — melee's ammo, moved here from the cut Stonemason bench
       (designer ruling, demolition 2026-10-14). xp, ms and the batch of 10 are
       unchanged; reqs and inputs are the ruling's (UNVERIFIED until a sim run). */
    {id:'grind_coarse_whetstone',  name:'Grind Coarse Whetstones',    icon:'🪨', inputs:{copper_ore:2},                         output:'coarse_whetstone',  outputQty:10, xp:19,   req:1,  ms:2600},
    {id:'grind_copper_whetstone',  name:'Grind Copper Whetstones',    icon:'🪨', inputs:{copper_bar:1, copper_ore:5},           output:'copper_whetstone',  outputQty:10, xp:70,   req:10, ms:2900},
    {id:'grind_iron_whetstone',    name:'Grind Iron Whetstones',      icon:'🪨', inputs:{iron_bar:2, iron_ore:3},               output:'iron_whetstone',    outputQty:10, xp:168,  req:20, ms:3200},
    {id:'grind_steel_whetstone',   name:'Grind Steel Whetstones',     icon:'🪨', inputs:{steel_bar:2, coal:7},                  output:'steel_whetstone',   outputQty:10, xp:500,  req:35, ms:3600},
    {id:'grind_mithril_whetstone', name:'Grind Mithril Whetstones',   icon:'🪨', inputs:{mithril_bar:1, coal:9},                output:'mithril_whetstone', outputQty:10, xp:1000, req:50, ms:4000},
    {id:'grind_rune_whetstone',    name:'Grind Rune Whetstones',      icon:'🪨', inputs:{rune_bar:1, mithril_bar:1, coal:2},    output:'rune_whetstone',    outputQty:10, xp:1600, req:65, ms:4400},
    {id:'grind_dawn_whetstone',    name:'Grind Dawnsteel Whetstones', icon:'🪨', inputs:{dawn_bar:1, rune_bar:1},               output:'dawn_whetstone',    outputQty:10, xp:3000, req:90, ms:4800},
  ],
  crafting: [
    // Plank sawing
    {id:'saw_normal', name:'Normal Plank', icon:'🪵', input:'normal_log', output:'normal_plank', xp:10,  req:1,  ms:2400},
    {id:'saw_oak',    name:'Oak Plank',    icon:'🪵', input:'oak_log',    output:'oak_plank',    xp:25,  req:15, ms:3000},
    {id:'saw_willow', name:'Willow Plank', icon:'🪵', input:'willow_log', output:'willow_plank', xp:50,  req:30, ms:3600},
    {id:'saw_maple',  name:'Maple Plank',  icon:'🍁', input:'maple_log',  output:'maple_plank',  xp:90,  req:45, ms:4500},
    {id:'saw_yew',    name:'Yew Plank',    icon:'🌲', input:'yew_log',    output:'yew_plank',    xp:160, req:60, ms:6000},
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
    /* b215: the last two planks — crafting stopped at 78 before this. */
    {id:'saw_runewood', name:'Runewood Plank', icon:'🪵', input:'runewood_log', output:'runewood_plank', xp:260, req:75, ms:6500},
    /* SELF-SUPPLY RULING (2026-09-13): 90 → 88, the Dawnsteel tier's own craft
       gate (MATERIAL_TIERS.dawn.craft). Every other plank already sits exactly on
       its tier's gate (normal 1, oak 15, willow 30, maple 45, yew 60, runewood
       75); duskwood alone was pinned to the TREE's Woodcutting level (90), two
       above the tier. The LOG is still Woodcutting 90, the same way the ore stays on the Mining
       ladder above its bar. */
    {id:'saw_duskwood', name:'Duskwood Plank', icon:'🪵', input:'duskwood_log', output:'duskwood_plank', xp:380, req:88, ms:7200},
    /* b222 — Castle Stores (clan-overhaul v2 §4.3). Slime Gel is the binder:
       it is a resin, it is an 80% drop from tier-1 Slimes, it was worth 5g and
       used by NOTHING — and it is now the thing that holds the castle
       together, so a level-3 player farming slimes is materially useful on
       build day. That is the "every level matters" pillar, made structural. */
    {id:'craft_timber_beam', name:'Timber Beam', icon:'🪵', inputs:{normal_plank:5, oak_plank:2, slime_gel:2}, output:'timber_beam', xp:200, req:25, ms:4200},
    /* The keystone came back from the cut Stonemason bench (designer ruling,
       demolition 2026-10-14): id, inputs, xp and req unchanged, so every room
       and property offer that spends keystones still resolves. */
    {id:'craft_keystone', name:'Set Keystone', icon:'🧱', inputs:{timber_beam:3, iron_fitting:3, ancient_fragment:2, cracked_spellstone:1}, output:'keystone', outputQty:1, xp:900, req:60, ms:6500},
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

/* Every lane is sorted by required level so each artisan panel reads as a
   ladder rather than as authoring order. Crafting appends the fletching rows
   (slot-ladders.js); nothing else is generated into a lane any more. */
const byReq = (list) => list.slice().sort((a, b) => (a.req || 0) - (b.req || 0));

export const ARTISAN_RECIPES = {
  cooking:  byReq(BASE_RECIPES.cooking),
  smithing: byReq(BASE_RECIPES.smithing),
  crafting: byReq(BASE_RECIPES.crafting.concat(SLOT_RECIPES.crafting)),
  prayer:   BASE_RECIPES.prayer,
  runecrafting: byReq(STONECRAFT_RECIPES.runecrafting),
};

/* ══════════════════════════════════════════════════════════════════════
   b220 — ARTISAN CATEGORIES (crafting-cooking-taxonomy §§3-5)

   The categories below are DERIVED, never authored: a hand-written
   `category:` field on each recipe is a drift generator. Everything here
   reads fields the recipe and its output item already carry: `output.type`,
   the `_bar` / `_plank` / `_blank` id suffix, and `foodClass`. A NEW recipe
   lands in the right tab the moment it is written, and one that no lane
   claims surfaces as `uncategorized` (asserted empty) instead of vanishing.

   Prayer is deliberately absent — its bench is a list, not a taxonomy, and
   it has no output item to derive from.

   Demolition (2026-10-14): the weapon, armour, jewellery, tool, materials and
   weapon-enchant lanes went with crafted gear, tools and Enchant v1, and the
   Stonemason bench was cut (designer ruling): whetstones are smithed, rune
   blanks are cut at Runecrafting and the keystone is crafted. "Building
   Materials" (`tag:'castle'`) is the LAST claim in every skill so it never
   steals a recipe from a more specific lane.
   ══════════════════════════════════════════════════════════════════════ */
export const ARTISAN_CATEGORIES = {
  smithing: [
    { key: 'smelting',   label: 'Smelting' },
    { key: 'whetstones', label: 'Whetstones' },
    { key: 'castle',     label: 'Building Materials' },
  ],
  crafting: [
    { key: 'sawmill',    label: 'Sawmill' },
    { key: 'ammunition', label: 'Ammunition' },
    { key: 'castle',     label: 'Building Materials' },
  ],
  cooking: [
    { key: 'provisions', label: 'Provisions' },
    { key: 'feasts',     label: 'Feasts & Draughts' },
    { key: 'castle',     label: 'Building Materials' },
  ],
  /* Runecrafting: the self-supply lane first (mine Rune Essence, cut it to
     blanks), then the staff runes socketed in the ammo slot. */
  runecrafting: [
    { key: 'essence', label: 'Essence & Blanks' },
    { key: 'staff',   label: 'Staff Runes' },
  ],
};

/* isCastleGood(item) — the single predicate behind the "Building Materials"
   lane: the goods the Homestead's rooms and properties are built from. A
   function rather than an inline `.tag === 'castle'` so every reader agrees. */
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
    if (/_bar$/.test(outId)) return 'smelting';   // ore → bar
    if (type === 'ammo') return 'whetstones';     // strB stones, ammo slot
    if (isCastleGood(out)) return 'castle';       // Iron Fitting
    return null;
  }

  if (skillId === 'crafting') {
    if (/_plank$/.test(outId)) return 'sawmill';  // log → plank
    if (type === 'ammo') return 'ammunition';
    if (isCastleGood(out)) return 'castle';       // Timber Beam, Keystone
    return null;
  }

  if (skillId === 'runecrafting') {
    if (type === 'ammo') return 'staff';
    /* The self-supply lane: the input-free essence rung and every blank cut. */
    const rcInputs = recipe.inputs || (recipe.input ? { [recipe.input]: 1 } : {});
    if (Object.keys(rcInputs).length === 0 || /_blank$/.test(outId)) return 'essence';
    return null;
  }

  if (skillId === 'cooking') {
    const fc = foodClassOf(out);
    if (fc === 'buff') return 'feasts';
    if (fc === 'healing') return 'provisions';
    if (isCastleGood(out)) return 'castle';       // Field Ration
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
