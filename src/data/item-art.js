// ════════════════════════════════════════════════════════════════════════
// src/data/item-art.js — THE HEARTHFIRE ITEM ART MANIFEST
//
// The item-side twin of `monster-art.js`, and it exists for the same reason:
// 512 hand-written map lines is a mis-map waiting to happen, and this repo has
// already shipped a wild boar wired to `bear.png`. So the FILENAME IS DERIVED
// FROM THE ID (`fileFor`) and can never drift from it; the only hand-authored
// data here is which ids have art, and in which category folder it lives —
// and `tests/run-smoke.mjs` reconciles that against the real filesystem in
// BOTH directions, so it cannot rot and cannot be padded with wishful entries.
//
// ── WHAT SHIPPED, AND WHAT DID NOT (Art Director, 2026-08-16) ──────────────
// The generated batch delivered 512 files. All 512 are technically clean
// (1024² RGBA, real alpha, no hash-duplicates, no backdrops). They are NOT all
// correct: a review of every one of the 512 at render size, on the hearthlight
// surface, against `docs/design/item-art-prompts.md`, found 108 that depict the
// WRONG OBJECT — `yew_staff` is a woodcutting axe, `iron_ore` is a hammer,
// `slime_gel` is a pool ball, `yew_plank` is a chessboard, and `potato`,
// `gold_ore`, `granite` and `troll_hide` are humanoid FIGURES, which the
// prompt wrapper bans outright. A further 27 filenames do not resolve to a
// live item id at all (speculative Review-Book ids from the prompt sheet).
//
// Those 135 files are NOT copied into the shipped bundle and are NOT
// mapped. Their ids keep the existing painted/generated-gear/emoji fallback
// chain, exactly as before this change — a mixed shelf is a known cost, and
// it is a far smaller one than shipping a chessboard called "yew plank".
// The raws stay in `assets/art-pilot/batch-items/` (unshipped) for re-generation.
//
// ── THE SIZE SPEC: 128 px LONG EDGE. The discrepancy dies here. ────────────
// `docs/design/item-art-prompts.md` said 128; the 13-image pilot shipped 256
// and argued devicePixelRatio. The pilot's argument double-counts. Measured:
// no item icon in this game renders above **64 CSS px** (the item-detail
// modal), and the inventory grid is 34 px. 64 CSS px at DPR 2 is 128 device
// px — so 128 px art is exactly 1:1 there. On a DPR 3 phone items render at
// 34–44 CSS px = 102–132 device px, so 128 is ~1:1 there too. A 128-vs-256
// A/B rendered into the real 64 px and 34 px boxes at DPR 2 is
// indistinguishable, and 256 costs 4× the bytes (47 MB vs 14 MB across the
// batch; the whole existing `assets/icons-bundle/` is 6 MB). 128 it is.
//
// ── FOLDERS ───────────────────────────────────────────────────────────────
// Four category subfolders, matching the batch layout and the pilot's
// `hearthfire/` root. The category is part of the path, so it is data here
// rather than something `pathFor` has to guess from an item's type field.
// ════════════════════════════════════════════════════════════════════════

/** The chosen direction (Tyler, 2026-08-16). All item art lands here. */
export const HEARTHFIRE_DIR = 'assets/icons-bundle/hearthfire/';

/** Category subfolders, in the order the batch was organised. */
export const CATEGORIES = Object.freeze(['armour', 'food', 'items', 'weapons']);

/** `<id>.png` — DERIVED, so the PNG name and the item id cannot disagree. */
export function fileFor(id) { return String(id) + '.png'; }

/**
 * Ids whose art EXISTS in the repo right now, by category folder.
 *
 * Hand-maintained on purpose (the browser cannot stat a file, so "does this
 * art exist?" has to be data) but NOT trusted: `tests/run-smoke.mjs` walks
 * `assets/icons-bundle/hearthfire/**` in Node and fails if this list and the
 * filesystem disagree in either direction, and fails again if any id here is
 * not a live `ITEMS` key. 386 entries.
 */
export const SHIPPED = Object.freeze({
  armour: Object.freeze([
    'adept_belt', 'adept_body', 'adept_boots', 'adept_gloves', 'adept_helmet', 'adept_pants',
    'apprentice_belt', 'apprentice_body', 'apprentice_boots', 'apprentice_gloves',
    'apprentice_helmet', 'apprentice_pants', 'archmage_belt', 'archmage_boots', 'archmage_gloves',
    'archmage_helmet', 'boarhide_belt', 'boarhide_body', 'boarhide_boots', 'boarhide_gloves',
    'boarhide_pants', 'bronze_belt', 'bronze_boots', 'bronze_gauntlets', 'bronze_helm',
    'bronze_platebody', 'bronze_platelegs', 'dawn_belt', 'dawn_boots', 'dawn_gauntlets',
    'dawn_helm', 'dawn_platelegs', 'dragonhide_belt', 'dragonhide_body', 'dragonhide_boots',
    'dragonhide_gloves', 'dragonhide_helmet', 'dragonhide_pants', 'ember_belt', 'ember_gauntlets',
    'ember_helm', 'ember_platebody', 'ember_platelegs', 'iron_belt', 'iron_boots',
    'iron_gauntlets', 'iron_helm', 'iron_platebody', 'iron_platelegs', 'leather_belt',
    'leather_body', 'leather_boots', 'leather_gloves', 'leather_helmet', 'leather_pants',
    'mithril_belt', 'mithril_boots', 'mithril_gauntlets', 'mithril_helm', 'mithril_platebody',
    'mithril_platelegs', 'rune_belt', 'rune_boots', 'rune_gauntlets', 'rune_helm',
    'rune_platebody', 'rune_platelegs', 'scholar_boots', 'scholar_gloves', 'scholar_helmet',
    'scholar_pants', 'snakeskin_belt', 'snakeskin_body', 'snakeskin_boots', 'snakeskin_gloves',
    'snakeskin_helmet', 'snakeskin_pants', 'sorcerer_belt', 'sorcerer_boots', 'sorcerer_gloves',
    'sorcerer_helmet', 'sorcerer_pants', 'steel_belt', 'steel_boots', 'steel_gauntlets',
    'steel_helm', 'steel_platebody', 'steel_platelegs', 'studded_belt', 'studded_body',
    'studded_boots', 'studded_gloves', 'studded_helmet', 'studded_pants', 'voidhide_belt',
    'voidhide_body', 'voidhide_boots', 'voidhide_gloves', 'voidhide_helmet', 'voidweave_boots',
    'voidweave_gloves', 'voidweave_helmet', 'voidweave_pants', 'warlock_boots', 'warlock_gloves',
    'warlock_helmet', 'warlock_pants', 'wyvernhide_belt', 'wyvernhide_body', 'wyvernhide_boots',
    'wyvernhide_gloves', 'wyvernhide_helmet',
  ]),
  food: Object.freeze([
    'baked_potato', 'bear_claw_pie', 'burnt_food', 'carrot', 'carrot_seed', 'carrot_stew',
    'cooked_bear_meat', 'cooked_frostfin', 'cooked_herring', 'cooked_lobster', 'cooked_moonfish',
    'cooked_panther_meat', 'cooked_shark', 'cooked_shrimp', 'cooked_swordfish', 'cooked_trout',
    'cooked_wolf_meat', 'dragon_stew', 'ember_tart', 'emberfruit', 'emberfruit_seed', 'frostfin',
    'goldenroot', 'goldenroot_roast', 'goldenroot_seed', 'grave_salt', 'hearthbread',
    'hunters_feast', 'kettle_tea', 'lich_soul_soup', 'lobster', 'moonbloom', 'moonbloom_elixir',
    'moonbloom_seed', 'moonfish', 'potato_seed', 'pumpkin', 'pumpkin_pie', 'pumpkin_seed',
    'raw_bear_meat', 'raw_panther_meat', 'raw_wolf_meat', 'roasted_carrot', 'roasted_pumpkin',
    'shark', 'shrimp', 'tomato', 'tomato_seed', 'tomato_soup', 'travellers_stew', 'trout',
    'turnip', 'turnip_mash', 'turnip_seed', 'vegetable_stew', 'void_banquet', 'wheat',
    'wheat_bread', 'wheat_seed', 'winterdraught',
  ]),
  items: Object.freeze([
    'abyssal_pearl', 'air_rune', 'alpha_cloak', 'alpha_fang', 'alpha_pattern', 'ancient_claw',
    'ancient_fragment', 'ancient_rune', 'arcane_tome', 'ashcrown_greatsword', 'ashlar',
    'banded_signet', 'basalt', 'bat_wing', 'bear_claw', 'bear_pelt', 'big_bones', 'blood_rune',
    'bone_chips', 'bone_earrings', 'bone_key', 'bones', 'bronze_bar', 'captain_medal',
    'captain_recipe', 'carters_strap', 'chaos_rune', 'choirbone', 'choirbone_gauntlets',
    'chronicle_ribbon', 'coal', 'colossus_plate', 'colossus_seal', 'copper_bar', 'copper_ore',
    'copper_ring', 'copper_studs', 'copper_whetstone', 'cracked_spellstone',
    'crown_of_the_fallen_king', 'cutpurse_gloves', 'dark_sigil', 'dawn_bar', 'dawn_whetstone',
    'dawnbound_amulet', 'dawnforged_signet', 'dawnstone_ore', 'death_rune', 'demon_shard',
    'draconias_jaw', 'dragon_gem', 'dragon_gem_earrings', 'dragon_marrow_recipe', 'dragon_relic',
    'dragon_scale', 'dragonfang_pike', 'dragonrend_greatblade', 'dragonsbane_key', 'dungeon_scrip',
    'duskwood_log', 'duskwood_plank', 'earth_rune', 'elderscale_heart', 'ember_bar',
    'emberfang_blade', 'emberstone_ore', 'fang_studs', 'farm_deed', 'field_cookbook',
    'field_ledger', 'field_ration', 'fine_rune_blank', 'fire_rune', 'forge_blueprint_t2',
    'forge_blueprint_t3', 'frost_locket', 'gemcutter_note', 'goblin_ear', 'goblin_seal',
    'goblin_totem', 'gold_amulet', 'gold_bar', 'gold_ring', 'grave_dust', 'hearth_token',
    'hearthstone_signet', 'hell_ember', 'hollow_sigil', 'hollow_sigil_ring', 'hunter_necklace',
    'hunters_torc', 'iron_fitting', 'iron_ore', 'iron_whetstone', 'keystone', 'kitchen_blueprint_t2',
    'kitchen_blueprint_t3', 'library_blueprint_t2', 'library_blueprint_t3', 'magic_essence',
    'maple_log', 'marrow_cookbook', 'mithril_ore', 'night_fang',
    'nightstalker_pelt', 'normal_log', 'normal_plank', 'oak_log', 'oak_plank', 'obsidian_sigil',
    'panthers_eye_pendant', 'pathfinder_studs', 'pitlord_irons', 'plague_ichor',
    'plaguewarden_greaves', 'quiet_coat', 'rat_tail', 'regent_helm', 'riftmaw_husk', 'ruby',
    'ruby_signet', 'rubyfire_studs', 'rune_bar', 'rune_blank', 'rune_frag', 'rune_of_ember',
    'rune_of_frost', 'rune_whetstone', 'runewood_log', 'runewood_plank', 'shadow_pelt',
    'shadow_thread', 'silk_thread', 'slagheart_core', 'slagheart_platebody', 'small_fang',
    'spellstone_ring', 'spider_eye', 'spidereye_studs', 'spidersilk_choker', 'steel_whetstone',
    'sticky_core', 'surveyors_chain', 'swarm_heart', 'timber_beam', 'tithe_box', 'trollhide_cape',
    'trophy_blueprint_t2', 'trophy_blueprint_t3', 'unlit_earrings', 'vamp_dust', 'venom_sac',
    'void_core', 'void_essence', 'void_fragment', 'voidwoven_sigil', 'war_crown', 'warden_seal',
    'warlord_badge', 'warlords_torc', 'water_rune', 'weathervane', 'whispering_codex',
    'willow_log', 'wolfbone_torc', 'woolen_cloak', 'wraith_veil', 'wraithglass_drops',
    'wraithsilk_shroud', 'wyrm_gilding', 'yew_log',
  ]),
  weapons: Object.freeze([
    'bramble_blade', 'bronze_axe', 'bronze_hammer', 'bronze_knife', 'bronze_pickaxe',
    'bronze_sword', 'chief_blade', 'dawn_axe', 'dawn_pickaxe', 'dawn_sword', 'dawn_warhammer',
    'dragonrib_bow', 'duskwood_bow', 'ember_axe', 'ember_pickaxe', 'ember_sword',
    'ember_warhammer', 'iron_axe', 'iron_pickaxe', 'iron_sword', 'iron_warhammer', 'lazlos_maul',
    'longbow', 'maple_bow', 'mithril_axe', 'mithril_pickaxe', 'mithril_sword', 'mithril_warhammer',
    'rune_axe', 'rune_hammer', 'rune_pickaxe', 'rune_sword', 'rune_warhammer', 'shortbow',
    'steel_axe', 'steel_hammer', 'steel_knife', 'steel_pickaxe', 'steel_sword', 'steel_warhammer',
    'stone_maul', 'wartusk_cleaver', 'yew_bow',
  ]),
});

/**
 * Delivered by the batch and DELIBERATELY WITHHELD: the file depicts the
 * wrong object. Listed `category/id` so it reads against the batch folder.
 * This is the re-generation worklist — see the handoff to the Asset Director.
 * A withheld id is NOT an absent id: it keeps its old fallback art.
 */
/**
 * ONE id here does NOT come from this batch: `iron_ore`. The batch's
 * `items/iron_ore.png` is a HAMMER and must be re-generated — but the b357 pilot
 * already shipped an `iron_ore` painting, and dropping it would have been a
 * silent regression caused by this change rather than by the batch. So the
 * PILOT raw (`assets/art-pilot/hearthfire/items/iron_ore.png`) was re-run
 * through `tools/art-batch-process.mjs` at the 128 px spec and kept. It is
 * still weak at render size (the pilot's own verdict: "reads as raw meat")
 * and it is on the re-generation worklist — but it is not worse than what
 * shipped yesterday, which is the bar a wiring pass has to clear. It is
 * therefore NOT in REJECTED_WRONG_SUBJECT — that list describes files that
 * were kept OFF the shelf, and this id is on it — but it is still worklisted.
 */
export const REGENERATE_DESPITE_SHIPPING = Object.freeze(['items/iron_ore']);

export const REJECTED_WRONG_SUBJECT = Object.freeze([
  'armour/archmage_body', 'armour/archmage_pants', 'armour/boarhide_helmet',
  'armour/chitinweave_chaps', 'armour/chitinweave_helm', 'armour/dawn_platebody',
  'armour/ember_boots', 'armour/scholar_belt', 'armour/scholar_body', 'armour/sorcerer_body',
  'armour/voidhide_pants', 'armour/voidweave_belt', 'armour/voidweave_body', 'armour/warlock_belt',
  'armour/warlock_body', 'armour/watchknight_sabatons', 'armour/wyvernhide_pants', 'food/herring',
  'food/potato', 'food/ratters_bait', 'food/swordfish', 'items/abyssal_greaves',
  'items/alphaheart_longbow', 'items/basalt_block', 'items/bestiary_cloak', 'items/blight_arrows',
  'items/brute_plate', 'items/captains_ribblade', 'items/chitinweave_cloak',
  'items/coarse_whetstone', 'items/dawnlit_mantle', 'items/death_steel', 'items/deep_rune_blank',
  'items/demoncaller_staff', 'items/dire_fang', 'items/dragon_bones', 'items/dressed_block',
  'items/fangdart_recurve', 'items/fox_companion', 'items/frost_arrows', 'items/gold_ore',
  'items/granite', 'items/granite_block', 'items/heartwood_cape', 'items/houndskin_cloak',
  'items/iron_bar', 'items/lexarch_seal', 'items/lich_soul', 'items/maple_plank',
  'items/mithril_bar', 'items/mithril_whetstone', 'items/razor_claw', 'items/rubble',
  'items/shadowsilk_cape', 'items/slime_gel', 'items/soul_recipe', 'items/spellstone_diagram',
  'items/steel_bar', 'items/tally_ring', 'items/traveler_cape', 'items/troll_hide',
  'items/vaultstone', 'items/void_chitin', 'items/voidmaw_scepter', 'items/warband_bulwark',
  'items/warboss_standard', 'items/warden_girdle', 'items/widows_fang', 'items/willow_plank',
  'items/wolf_pelt', 'items/wyrmgilt_mantle', 'items/yew_plank', 'weapons/apprentice_staff',
  'weapons/barbed_arrows', 'weapons/bone_needle', 'weapons/bronze_arrows',
  'weapons/chief_blade_recipe', 'weapons/dawnpoint_arrows', 'weapons/dawnsteel_rod',
  'weapons/deathsteel_ingot', 'weapons/duskwood_rod', 'weapons/duskwood_staff',
  'weapons/emberhead_arrows', 'weapons/iron_arrows', 'weapons/maple_rod', 'weapons/maple_staff',
  'weapons/masons_rule_t4', 'weapons/masons_rule_t7', 'weapons/mithril_arrows', 'weapons/oak_rod',
  'weapons/oak_staff', 'weapons/rat_stick', 'weapons/rune_arrows', 'weapons/rune_knife',
  'weapons/rune_needle', 'weapons/runewood_bow', 'weapons/runewood_rod', 'weapons/runewood_staff',
  'weapons/steel_arrows', 'weapons/steel_needle', 'weapons/void_censer',
  'weapons/void_chitin_weave', 'weapons/willow_longbow', 'weapons/willow_rod',
  'weapons/willow_staff', 'weapons/yew_rod', 'weapons/yew_staff',
]);

/**
 * Delivered filenames that do not resolve to any live `ITEMS` key. These come
 * from the prompt sheet's speculative Review-Book section, where the `File`
 * column proposed an id the implementation later named differently. They are
 * NOT guessed into place — several are genuinely ambiguous (`fletchers_knife_t1`
 * against `bone_fletching_knife`/`steel_fletching_knife`/`dawn_fletching_knife`
 * is a tier-order guess, not a fact). Renaming is an Asset Director task.
 */
/**
 * Delivered, correct, and STILL withheld — because something better already
 * ships for that id. `muster_seal` is a struck vector seal
 * (`icons-bundle/medieval/muster-seal.svg`) referenced directly from
 * `items.js` and from `muster.js`; it is a CURRENCY, it renders inside the
 * `.hr-med` medallion, and the medallion's whole design language is a centred
 * vector glyph that cannot go soft at any size. A raster painting is a
 * downgrade there, so the b220 guard that pins it stays strict rather than
 * being widened to let this batch through.
 */
export const WITHHELD_BESPOKE_ART = Object.freeze(['items/muster_seal']);

export const UNRESOLVED_FILES = Object.freeze([
  'armour/chitinweave_belt', 'armour/chitinweave_body', 'armour/chitinweave_boots',
  'armour/chitinweave_chaps', 'armour/chitinweave_helm', 'armour/chitinweave_vambraces',
  'armour/watchknight_cuirass', 'armour/watchknight_gauntlets', 'armour/watchknight_girdle',
  'armour/watchknight_greaves', 'armour/watchknight_helm', 'armour/watchknight_sabatons',
  'items/blight_arrows', 'items/blight_whetstone', 'items/ember_arrows', 'items/ember_whetstone',
  'items/frost_arrows', 'items/frost_whetstone', 'items/rune_of_blight',
  'weapons/deathsteel_ingot', 'weapons/fletchers_knife_t1', 'weapons/fletchers_knife_t4',
  'weapons/fletchers_knife_t7', 'weapons/masons_rule_t1', 'weapons/masons_rule_t4',
  'weapons/masons_rule_t7', 'weapons/void_chitin_weave',
]);

/** The full path for an id, or '' if this id has no hearthfire art. */
export function pathFor(id) {
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    if (SHIPPED[c].indexOf(id) >= 0) return HEARTHFIRE_DIR + c + '/' + fileFor(id);
  }
  return '';
}

/**
 * The map wired into `window._itemPath`: every id with real art on disk.
 * An id absent from here gets NO entry, so the existing painted / generated-
 * gear / emoji fallback chain takes over — no 404, no broken image.
 */
export function wiredIconMap() {
  const out = {};
  CATEGORIES.forEach((c) => {
    SHIPPED[c].forEach((id) => { out[id] = HEARTHFIRE_DIR + c + '/' + fileFor(id); });
  });
  return out;
}
