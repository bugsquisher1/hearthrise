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
// ── WAVE 2 — TYLER'S HAND-GENERATED EXPORTS (Art Director, 2026-08-16) ─────
// 428 -> 473. 71 PNGs hand-made in the Recraft WEB UI (no API spend, $0.00),
// resolving to 62 ids of which 55 are live ITEMS keys. All 71 verified colour
// type 6 / 8-bit; 67 carry real alpha and FOUR were flattened exports (three
// with a baked transparency CHECKERBOARD), matted LOCALLY by
// `tools/art-wave-matte.mjs` — measured key, border flood fill, colour
// decontamination — never a paid endpoint. Every file was then judged by eye
// at three sizes: a 265 px identity sheet against `item-session-pack.txt`, a
// 420 px zoom on each marginal call, and a 38 px shelf at true render size.
// 45 wired, 10 refused, 7 good but unmappable. The ruling, with a one-line
// reason per refusal, is CODE — `tools/art-wave2-select.mjs` — not a chat log.
//
// This wave breaks two of the three classes b361 recorded as unsolved. BARS
// AND ORES: `iron_bar` was an anvil, `steel_bar` a framed landscape painting,
// `gold_ore` a golden fist — all four bars plus both ores now depict what they
// name. `potato` returned a humanoid figure three times running and is now a
// potato. STAVES AND RODS remain the hard class but are no longer a shutout:
// 4 of 6 delivered fishing rods and 4 of 7 staves read correctly, while
// `apprentice_staff`, `maple_staff` and `oak_staff` came back as the same
// short fat baton b361 documented. The lever there is still an API field.
//
// NOT FIXED, AND FOUND BY LOOKING AT THE CONTROL RATHER THAN THE NEW WORK:
// several files wired in b358/b361 depict the wrong object and nobody caught
// it, because a shipped id is never re-reviewed. `oak_plank`, `duskwood_plank`
// and `runewood_plank` are round SHIELDS; `bronze_bar` is a hammer on an anvil
// and `copper_bar` is a sphere. They render that way in the Recipe Book right
// now. They are NOT touched by this pass — unwiring them swaps wrong art for a
// fallback glyph and needs its own verified pass — but they are the top of the
// re-shoot worklist and they are the reason to distrust "already shipped".
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
 * not a live `ITEMS` key. 473 entries.
 */
export const SHIPPED = Object.freeze({
  armour: Object.freeze([
    'adept_belt', 'adept_body', 'adept_boots', 'adept_gloves', 'adept_helmet', 'adept_pants',
    'apprentice_belt', 'apprentice_body', 'apprentice_boots', 'apprentice_gloves',
    'apprentice_helmet', 'apprentice_pants', 'archmage_belt', 'archmage_body', 'archmage_boots',
    'archmage_gloves', 'archmage_helmet', 'archmage_pants', 'boarhide_belt', 'boarhide_body',
    'boarhide_boots', 'boarhide_gloves', 'boarhide_helmet', 'boarhide_pants', 'bronze_belt',
    'bronze_boots', 'bronze_gauntlets', 'bronze_helm', 'bronze_platebody', 'bronze_platelegs',
    'dawn_belt', 'dawn_boots', 'dawn_gauntlets', 'dawn_helm', 'dawn_platebody', 'dawn_platelegs',
    'dragonhide_belt', 'dragonhide_body', 'dragonhide_boots', 'dragonhide_gloves',
    'dragonhide_helmet', 'dragonhide_pants', 'ember_belt', 'ember_boots', 'ember_gauntlets',
    'ember_helm', 'ember_platebody', 'ember_platelegs', 'iron_belt', 'iron_boots',
    'iron_gauntlets', 'iron_helm', 'iron_platebody', 'iron_platelegs', 'leather_belt',
    'leather_body', 'leather_boots', 'leather_gloves', 'leather_helmet', 'leather_pants',
    'mithril_belt', 'mithril_boots', 'mithril_gauntlets', 'mithril_helm', 'mithril_platebody',
    'mithril_platelegs', 'rune_belt', 'rune_boots', 'rune_gauntlets', 'rune_helm',
    'rune_platebody', 'rune_platelegs', 'scholar_belt', 'scholar_body', 'scholar_boots',
    'scholar_gloves', 'scholar_helmet', 'scholar_pants', 'snakeskin_belt', 'snakeskin_body',
    'snakeskin_boots', 'snakeskin_gloves', 'snakeskin_helmet', 'snakeskin_pants',
    'sorcerer_belt', 'sorcerer_body', 'sorcerer_boots', 'sorcerer_gloves', 'sorcerer_helmet',
    'sorcerer_pants', 'steel_belt', 'steel_boots', 'steel_gauntlets', 'steel_helm',
    'steel_platebody', 'steel_platelegs', 'studded_belt', 'studded_body', 'studded_boots',
    'studded_gloves', 'studded_helmet', 'studded_pants', 'voidhide_belt', 'voidhide_body',
    'voidhide_boots', 'voidhide_gloves', 'voidhide_helmet', 'voidhide_pants', 'voidweave_belt',
    'voidweave_body', 'voidweave_boots', 'voidweave_gloves', 'voidweave_helmet',
    'voidweave_pants', 'warlock_belt', 'warlock_body', 'warlock_boots', 'warlock_gloves',
    'warlock_helmet', 'warlock_pants', 'wyvernhide_belt', 'wyvernhide_body', 'wyvernhide_boots',
    'wyvernhide_gloves', 'wyvernhide_helmet', 'wyvernhide_pants',
  ]),
  food: Object.freeze([
    'baked_potato', 'bear_claw_pie', 'burnt_food', 'carrot', 'carrot_seed', 'carrot_stew',
    'cooked_bear_meat', 'cooked_frostfin', 'cooked_herring', 'cooked_lobster', 'cooked_moonfish',
    'cooked_panther_meat', 'cooked_shark', 'cooked_shrimp', 'cooked_swordfish', 'cooked_trout',
    'cooked_wolf_meat', 'dragon_stew', 'ember_tart', 'emberfruit', 'emberfruit_seed', 'frostfin',
    'goldenroot', 'goldenroot_roast', 'goldenroot_seed', 'grave_salt', 'hearthbread', 'herring',
    'hunters_feast', 'kettle_tea', 'lich_soul_soup', 'lobster', 'moonbloom', 'moonbloom_elixir',
    'moonbloom_seed', 'moonfish', 'potato', 'potato_seed', 'pumpkin', 'pumpkin_pie',
    'pumpkin_seed', 'ratters_bait', 'raw_bear_meat', 'raw_panther_meat', 'raw_wolf_meat',
    'roasted_carrot', 'roasted_pumpkin', 'shark', 'shrimp', 'swordfish', 'tomato', 'tomato_seed',
    'tomato_soup', 'travellers_stew', 'trout', 'turnip', 'turnip_mash', 'turnip_seed',
    'vegetable_stew', 'void_banquet', 'wheat', 'wheat_bread', 'wheat_seed', 'winterdraught',
  ]),
  items: Object.freeze([
    'abyssal_greaves', 'abyssal_pearl', 'air_rune', 'alpha_cloak', 'alpha_fang', 'alpha_pattern',
    'ancient_claw', 'ancient_fragment', 'ancient_rune', 'arcane_tome', 'ashcrown_greatsword',
    'ashlar', 'banded_signet', 'basalt', 'basalt_block', 'bat_wing', 'bear_claw', 'bear_pelt',
    'bestiary_cloak', 'big_bones', 'blood_rune', 'bone_chips', 'bone_earrings', 'bone_key',
    'bones', 'bronze_bar', 'brute_plate', 'captain_medal', 'captain_recipe', 'captains_ribblade',
    'carters_strap', 'chaos_rune', 'chitinweave_cloak', 'choirbone', 'choirbone_gauntlets',
    'chronicle_ribbon', 'coal', 'coarse_whetstone', 'colossus_plate', 'colossus_seal',
    'copper_bar', 'copper_ore', 'copper_ring', 'copper_studs', 'copper_whetstone',
    'cracked_spellstone', 'crown_of_the_fallen_king', 'cutpurse_gloves', 'dark_sigil',
    'dawn_bar', 'dawn_whetstone', 'dawnbound_amulet', 'dawnforged_signet', 'dawnlit_mantle',
    'dawnstone_ore', 'death_rune', 'death_steel', 'deep_rune_blank', 'demon_shard', 'dire_fang',
    'draconias_jaw', 'dragon_bones', 'dragon_gem', 'dragon_gem_earrings', 'dragon_marrow_recipe',
    'dragon_relic', 'dragon_scale', 'dragonfang_pike', 'dragonrend_greatblade',
    'dragonsbane_key', 'dressed_block', 'dungeon_scrip', 'duskwood_log', 'duskwood_plank',
    'earth_rune', 'elderscale_heart', 'ember_bar', 'emberfang_blade', 'emberstone_ore',
    'fang_studs', 'fangdart_recurve', 'farm_deed', 'field_cookbook', 'field_ledger',
    'field_ration', 'fine_rune_blank', 'fire_rune', 'forge_blueprint_t2', 'forge_blueprint_t3',
    'fox_companion', 'frost_locket', 'gemcutter_note', 'goblin_ear', 'goblin_seal',
    'goblin_totem', 'gold_amulet', 'gold_bar', 'gold_ore', 'gold_ring', 'granite',
    'granite_block', 'grave_dust', 'hearth_token', 'hearthstone_signet', 'heartwood_cape',
    'hell_ember', 'hollow_sigil', 'hollow_sigil_ring', 'houndskin_cloak', 'hunter_necklace',
    'hunters_torc', 'iron_bar', 'iron_fitting', 'iron_ore', 'iron_whetstone', 'keystone',
    'kitchen_blueprint_t2', 'kitchen_blueprint_t3', 'lexarch_seal', 'library_blueprint_t2',
    'library_blueprint_t3', 'lich_soul', 'magic_essence', 'maple_log', 'maple_plank',
    'marrow_cookbook', 'mithril_bar', 'mithril_ore', 'mithril_whetstone', 'night_fang',
    'nightstalker_pelt', 'normal_log', 'normal_plank', 'oak_log', 'oak_plank', 'obsidian_sigil',
    'panthers_eye_pendant', 'pathfinder_studs', 'pitlord_irons', 'plague_ichor',
    'plaguewarden_greaves', 'quiet_coat', 'rat_tail', 'razor_claw', 'regent_helm',
    'riftmaw_husk', 'rubble', 'ruby', 'ruby_signet', 'rubyfire_studs', 'rune_bar', 'rune_blank',
    'rune_frag', 'rune_of_ember', 'rune_of_frost', 'rune_whetstone', 'runewood_log',
    'runewood_plank', 'shadow_pelt', 'shadow_thread', 'shadowsilk_cape', 'silk_thread',
    'slagheart_core', 'slagheart_platebody', 'slime_gel', 'small_fang', 'soul_recipe',
    'spellstone_diagram', 'spellstone_ring', 'spider_eye', 'spidereye_studs',
    'spidersilk_choker', 'steel_bar', 'steel_whetstone', 'sticky_core', 'surveyors_chain',
    'swarm_heart', 'tally_ring', 'timber_beam', 'tithe_box', 'traveler_cape', 'troll_hide',
    'trollhide_cape', 'trophy_blueprint_t2', 'trophy_blueprint_t3', 'unlit_earrings',
    'vamp_dust', 'venom_sac', 'void_chitin', 'void_core', 'void_essence', 'void_fragment',
    'voidmaw_scepter', 'voidwoven_sigil', 'war_crown', 'warband_bulwark', 'warboss_standard',
    'warden_girdle', 'warden_seal', 'warlord_badge', 'warlords_torc', 'water_rune',
    'weathervane', 'whispering_codex', 'willow_log', 'willow_plank', 'wolf_pelt',
    'wolfbone_torc', 'woolen_cloak', 'wraith_veil', 'wraithglass_drops', 'wraithsilk_shroud',
    'wyrm_gilding', 'wyrmgilt_mantle', 'yew_log', 'yew_plank',
  ]),
  weapons: Object.freeze([
    'barbed_arrows', 'bone_needle', 'bramble_blade', 'bronze_arrows', 'bronze_axe',
    'bronze_hammer', 'bronze_knife', 'bronze_pickaxe', 'bronze_sword', 'chief_blade',
    'chief_blade_recipe', 'dawn_axe', 'dawn_pickaxe', 'dawn_sword', 'dawn_warhammer',
    'dawnpoint_arrows', 'dawnsteel_rod', 'dragonrib_bow', 'duskwood_bow', 'duskwood_rod',
    'duskwood_staff', 'ember_axe', 'ember_pickaxe', 'ember_sword', 'ember_warhammer',
    'emberhead_arrows', 'iron_arrows', 'iron_axe', 'iron_pickaxe', 'iron_sword',
    'iron_warhammer', 'lazlos_maul', 'longbow', 'maple_bow', 'mithril_arrows', 'mithril_axe',
    'mithril_pickaxe', 'mithril_sword', 'mithril_warhammer', 'oak_rod', 'rat_stick',
    'rune_arrows', 'rune_axe', 'rune_hammer', 'rune_knife', 'rune_pickaxe', 'rune_sword',
    'rune_warhammer', 'runewood_bow', 'runewood_rod', 'runewood_staff', 'shortbow',
    'steel_arrows', 'steel_axe', 'steel_hammer', 'steel_knife', 'steel_needle', 'steel_pickaxe',
    'steel_sword', 'steel_warhammer', 'stone_maul', 'void_censer', 'wartusk_cleaver',
    'willow_longbow', 'willow_staff', 'yew_bow', 'yew_staff',
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

/*
 * b361 — 107 became 65. What re-rolling actually taught us, kept HERE because
 * the next person to fund a batch will read this file before the picker.
 *
 * THE ONE REPRODUCIBLE FIX: a garment must be described as an OBJECT AT REST,
 * not as clothing. "an empty hooded cloak hanging flat with no one wearing it"
 * / "laid out flat with its sleeves spread, no wearer" took the cloak, cape,
 * mantle, robe, sash and leggings classes from a 73% failure rate to 15 of 17
 * correct. b360 disconfirmed that ANATOMY words ("shoulders", "hem") were the
 * fault, and this is why it was right to: the fault was never a word that was
 * present, it was a state that was absent. Every one of those lines still names
 * shoulders and collars.
 *
 * SECOND FIX: an arrow must be spelled out as three parts in reading order —
 * "a single arrow: one long straight <colour> wooden shaft, three <colour>
 * feather vanes at the lower end, and a small <material> point at the upper
 * end". Before: an axe or a ringed archery target (`steel_arrows` came back as
 * a round shield). After: 5 of 8. And a bow needs its STRING named — P-BOW says
 * "a taut thin bowstring running the whole way from upper tip to lower tip",
 * which is the one feature no other object in the batch has.
 *
 * THE CLASS THAT DOES NOT YIELD, and it is a MODEL limit rather than a prompt
 * defect: staves and fishing rods. Two funded probes, ten generations, three
 * different wrapper cuts. Removing "filling the frame" and "chunky-heroic
 * exaggerated proportions" DID kill the hammer head that had been growing on
 * every haft — so that diagnosis was correct — but the model then returns a
 * short fat baton and simply ignores an explicit eight-to-one aspect ratio.
 * Naming a canonical thin noun made it WORSE: `oak_staff` came back as a
 * signpost with the word "Quarterstaff" rendered as text on it, `yew_staff` as
 * a candy cane. Do NOT spend a fourth round re-wording this class. The lever,
 * if there is one, is a non-square canvas or a different model — an API field,
 * which is where every real lever in this programme has been.
 *
 * ALSO UNSOLVED: bars/ingots (0 of 4 — `iron_bar` is an ANVIL even when the
 * line says "solid rectangular brick-shaped block"; `mithril_bar` and
 * `death_steel` come back as dice; `steel_bar` came back as a framed landscape
 * PAINTING), raw ore and formless stone (`gold_ore` is a golden FIST), and
 * `potato`, which has now returned a humanoid figure three times running.
 */
export const REJECTED_WRONG_SUBJECT = Object.freeze([
  'armour/chitinweave_chaps', 'armour/chitinweave_helm', 'armour/watchknight_sabatons',
  'items/alphaheart_longbow', 'items/blight_arrows', 'items/demoncaller_staff',
  'items/frost_arrows', 'items/vaultstone', 'items/widows_fang', 'weapons/apprentice_staff',
  'weapons/deathsteel_ingot', 'weapons/maple_rod', 'weapons/maple_staff',
  'weapons/masons_rule_t4', 'weapons/masons_rule_t7', 'weapons/oak_staff', 'weapons/rune_needle',
  'weapons/void_chitin_weave', 'weapons/willow_rod', 'weapons/yew_rod',
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
