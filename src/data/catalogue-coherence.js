// ============================================================
// src/data/catalogue-coherence.js — WHERE EVERY ITEM COMES FROM, WHO USES IT,
// AND WHO CONSUMES EVERY SKILL. Derived from the data modules, never a hand list.
//
// W0 (coherence audit, 2026-10-10). The audit found 40 items no player could
// obtain — catalogued ahead of engines that never landed — and a Collection Log
// that counted all of them, so 100% was impossible. They were cut. This module
// is what keeps the class closed at 10x content:
//
//   itemSources()   id -> [labels]  every door an item can enter a bag through
//   itemUses()      id -> [labels]  everything that spends, wears, eats, plants
//                                   or redeems it
//   reachableSources() id -> door   only the doors a player can walk through
//                                   (open grounds, the listed shop, crafts from
//                                   reachable inputs); UNREACHABLE tags the rest
//   obtainableItemIds()             the Collection Log's denominator
//   skillConsumers() skill -> [labels]  who uses what the skill makes (or, for a
//                                   combat skill, which engine reads its level)
//
// tests/catalogue-coherence.mjs is the standing guard: every item has a source
// AND a use, every declared effect kind is live, every skill has a consumer, and
// the Local Shop sells starter gear only. The Collection Log reads
// obtainableItemIds() so it can never again count something nobody can get.
//
// A source or use the data cannot show — a grant hard-coded in an engine — is
// declared below with the file that performs it, and the guard proves that file
// still names the id. No exemption is silent.
//
// PURE ESM. No DOM. Imports cleanly in Node, Deno and the browser.
// ============================================================

import { ITEMS } from './items.js?v=0.2.56';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.56';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=0.2.56';
import { SKILLS_DEF } from './skills.js?v=0.2.56';
import { SHOP_OFFERS } from './shops.js?v=0.2.56';
import { SHOP_LISTED_OFFER_IDS } from './supply-basics.js?v=0.2.56';
import { START_INVENTORY, START_EQUIPMENT } from './start-kit.js?v=0.2.56';
import { PREMIUM_LOGIN_REWARD } from './premium.js?v=0.2.56';
import { HEARTHFIND_ITEMS, HEARTHFIND_TABLE } from './hearthfind.js?v=0.2.56';
import { EFFECT_KINDS } from './item-effects.js?v=0.2.56';
import { MONSTERS } from './monsters.js?v=0.2.56';
import { NAMED_FUELS } from './hearth.js?v=0.2.56';
import { HUNT_GROUNDS, OPEN_GROUNDS } from './hunt-grounds.js?v=0.2.56';
import { HUNT_INDEX } from './hunts.js?v=0.2.56';
import {
  gatherProductIds, cropProductIds, seedIds, combatDropIds, artisanOutputIds,
} from './item-authority.js?v=0.2.56';

/* The data identities this module reads, re-exported so a Node guard can mutate
   the SAME objects (a bare import without the ?v= query is a second module
   instance, and a plant there would never reach these functions). */
export { ITEMS, SKILLS_DEF, SHOP_OFFERS, SHOP_LISTED_OFFER_IDS, ARTISAN_RECIPES, MONSTERS };

/* ── SOURCES AN ENGINE HARD-CODES ───────────────────────────────────────────
   id -> { label, file, needle }. The guard reads `file` and fails unless it
   still contains `needle`, so a row here cannot outlive the code it describes. */
export const CODED_SOURCES = Object.freeze({
  burnt_food:    Object.freeze({ label: 'a burnt cook', file: 'src/core/artisan.js', needle: "BURNT_ITEM = 'burnt_food'" }),
  /* dungeon_scrip's row left with the dungeon settle (lane C2 deleted
     supabase/functions/hr-accrue/dungeon-settle.js; dungeons are paused).
     hearth_token's row left with the client IAP code (the demolition); it waits
     on AWAITING_ROSTER below. */
});

/* ── USES AN ENGINE HARD-CODES ──────────────────────────────────────────────
   Same contract as CODED_SOURCES. */
export const CODED_USES = Object.freeze({
  /* (hearth_token's redeem and IAP grant left with the IAP store, 2026-10-14.) */
});

/* ── VENDOR TRASH — the one use that is selling ──────────────────────────────
   A few early drops have no craft use ON PURPOSE: they are the early gold
   faucet (slime/goblin tier), worth carrying to town and nothing more, and a
   burnt cook is the price of a missed one. An explicit, named list so a NEW
   dead end fails the guard instead of quietly joining it. Was legacy.js
   window.__DROP_SINK_EXEMPT; this is now its only home. */
export const VENDOR_TRASH = Object.freeze(['sticky_core', 'goblin_ear', 'goblin_totem', 'burnt_food',
  /* DEMOLITION (2026-10-14): crafted gear, its recipes and the dungeon chests
     were deleted, and these lost every consumer they had. They still drop
     (or, for the two bars and heartgarnet, are still made or mined),
     so until the new roster gives them a job they are sold, nothing more.
     rat_tail and small_fang are also the coach's sell-loot step (coach.js
     COACH_LOOT). Heartgarnet's Mining node is a dead end awaiting a designer
     ruling. Shrink this list as the roster lands. */
  'bat_wing', 'rune_frag', 'ruby', 'rat_tail', 'small_fang', 'night_fang', 'dark_sigil',
  'venom_sac', 'spider_eye', 'brute_plate', 'dire_fang', 'alpha_fang', 'plague_ichor',
  'swarm_heart', 'warlord_badge', 'hell_ember', 'shadow_thread', 'captain_medal',
  'shadow_pelt', 'death_steel', 'hollow_sigil', 'abyssal_pearl', 'gold_bar', 'verdite_bar',
  'heartgarnet',
  /* CORE REBUILD (2026-10-19): the Rat King's Crown Shard lost its old altar offering (Tyler's
     deletion list); "a trader pays well for it" is its whole job until the roster gives it one. */
  'crown_shard',
  /* THE IMBUEMENT SLOT (lane c-loot-loop, designer 2026-10-21; src/data/imbuements.js). One item per Thicket and
     Sewer monster, the imbuer's input once L4 builds imbuing. Until then the vendor is their only use: SHRINK these
     when the imbuement recipes land. */
  'whelp_milk_tooth', 'gray_dewclaw', 'briar_burr', 'dire_hackle', 'grayjaw_whisker', 'rat_incisor', 'sump_membrane',
  'kobold_scale', 'culvert_bat_fang', 'cistern_venom_gland', 'knotted_tails',
  /* Mosslight Glade's five (lane c-ground-16-31), the same promise; and Rook's Whistle, the glade's rare, a
     collector's piece like the Alpha Fang and the Crown Shard until the roster gives the rares a job. */
  'crow_quill', 'snare_wire', 'mosslight_tendril', 'sluice_crust', 'rooks_moss_charm', 'rooks_whistle',
  /* The Cellar's and the Warrens' imbuement items (loot bands phase C, the same promise), and the two boss Trophies: collector's
     pieces until the Trophy Room wall hangs boss trophies (it hangs Bestiary mounts only today). */
  'giant_rat_hide', 'hive_wasp_stinger', 'glowing_copper_fleck', 'skulkers_shiv', 'dented_copper_pot', 'foremans_lash', 'coppercaps_tallow',
  'rat_kings_crown', 'coppercaps_cauldron',
]);

/* ── AWAITING THE ROSTER — catalogued, kept, and deliberately unobtainable ───
   DEMOLITION (2026-10-14). Crafted gear, the dungeons and their chests were
   deleted; the ITEMS rows they produced stay until Tyler's new roster replaces
   the catalogue (demolition plan §4). Each id below has NO source today. The
   Collection Log's denominator (obtainableItemIds) leaves them out, so 100% is
   still reachable. SHRINK-ONLY: tests/catalogue-coherence.mjs fails a row that
   gains a source or leaves ITEMS, and an id may never be added — a new item
   with no source is a C1 failure, not a candidate for this list. */
export const AWAITING_ROSTER = Object.freeze([
  'oak_rod',   // the road_cook reward until the 2026-10-14 re-reward; rods have no recipe yet
  'abyssal_greaves', 'alphaheart_longbow',
  'archmage_belt', 'archmage_body', 'archmage_helmet',
  'archmage_pants', 'ashcrown_greatsword', 'bone_needle',
  'bronze_hammer', 'bronze_knife',
  'chitin_belt', 'chitin_body',
  'chitin_boots', 'chitin_gloves', 'chitin_helmet', 'chitin_pants', 'choirbone',
  'choirbone_gauntlets', 'crown_of_the_fallen_king', 'dawn_belt',
  'dawn_boots', 'dawn_gauntlets', 'dawn_helm', 'dawn_platebody',
  'dawn_platelegs', 'dawn_sword', 'dawn_warhammer', 'dawnbound_amulet', 'dawnforged_signet',
  'dawnlit_mantle', 'dawnsteel_rod', 'demoncaller_staff', 'dragon_gem_earrings',
  'dragon_relic', 'dragonfang_pike', 'dragonhide_belt', 'dragonhide_body', 'dragonhide_boots',
  'dragonhide_gloves', 'dragonhide_helmet', 'dragonhide_pants', 'dragonrend_greatblade',
  'duskwood_bow', 'duskwood_rod', 'duskwood_staff', 'elderscale_heart', 'elderscale_platebody',
  'ember_belt', 'ember_boots', 'ember_helm', 'ember_platebody',
  'ember_platelegs', 'ember_sword', 'ember_warhammer', 'fangdart_recurve', 'gold_amulet',
  'gold_ring', 'heartgarnet_maul', 'hollow_sigil_ring', 'houndskin_cloak',
  'lexarch_seal',
  'maple_rod', 'maple_staff', 'mithril_helm',
  'mithril_platebody', 'mithril_platelegs', 'mithril_sword', 'mithril_warhammer',
  'nightstalker_pelt', 'plaguewarden_greaves', 'quiet_coat', 'regent_helm',
  'riftmaw_carapace', 'riftmaw_husk', 'ruby_signet', 'rubyfire_studs',
  'rune_hammer', 'rune_helm', 'rune_knife', 'rune_needle', 'rune_platebody',
  'rune_platelegs', 'rune_warhammer', 'runewood_bow', 'runewood_rod',
  'slagheart_core', 'slagheart_platebody', 'snakeskin_body',
  'snakeskin_helmet', 'snakeskin_pants', 'sorcerer_body', 'sorcerer_helmet', 'sorcerer_pants',
  'spellstone_ring', 'spidereye_studs', 'steel_hammer', 'steel_knife',
  'steel_needle',
  'verdite_blade', 'verdite_helm', 'verdite_platebody',
  'verdite_platelegs', 'void_essence', 'voidheart_robe', 'voidhide_belt', 'voidhide_body',
  'voidhide_boots', 'voidhide_gloves', 'voidhide_helmet', 'voidhide_pants', 'voidmaw_scepter',
  'voidweave_belt', 'voidweave_body', 'voidweave_boots', 'voidweave_gloves',
  'voidweave_helmet', 'voidweave_pants', 'voidwoven_sigil', 'warband_bulwark',
  'warboss_standard', 'warden_girdle', 'warden_seal', 'warlock_body', 'warlock_pants',
  'wartusk_cleaver', 'watchknight_belt', 'watchknight_body', 'watchknight_boots',
  'watchknight_gloves', 'watchknight_helmet', 'watchknight_pants', 'whispering_codex',
  'widows_fang', 'willow_rod', 'woolen_cloak', 'wyrm_gilding', 'wyrmgilt_mantle',
  'wyvernhide_body', 'wyvernhide_helmet', 'wyvernhide_pants', 'yew_rod',
  /* The Hearth Token (IAP bond): its redeem, IAP grant and store left with the
     client in the same demolition; the row stays because hr_items and
     account_wallet.hearth_tokens still carry it until the M2 migration drops it. */
  'hearth_token',
]);

/* ── OUT OF REACH — a source on paper that no player can use (designer 2026-10-22) ──
   itemSources() counts every door in the data, so a drop from a monster no open ground
   spawns (most of the old catalogue's creatures), a row in a shop table the Shop does
   not list, or a craft from such an input all read as "a source". To a player that is a
   lie. reachableSources() keeps only the doors a player can walk through: monsters on
   OPEN grounds, the LISTED shop table, the start kit, gathering, server quest rewards,
   coded grants, and the crops and crafts whose every input is itself reachable.

   Each fate names the DOOR that will source its items. A planned door (`open`) is
   PROVED by tests/catalogue-coherence.mjs C11: with every planned door open the item is
   reachable, and with every door but its own it is not. A fate with no door is never
   reachable, so a row there that becomes reachable is stale. Buckets: (a) belongs to a
   planned ground or system, (b) needed now (its source is a listing away), (c) no home in
   Early Access, listed for Tyler's keep-or-cut. */
export const UNREACHABLE_FATES = Object.freeze({
  staged:     Object.freeze({ bucket: 'a', door: 'its staged ground opens (Mosslight Glade, waiting on its art)', open: Object.freeze({ grounds: HUNT_GROUNDS }) }),
  premium:    Object.freeze({ bucket: 'a', door: 'premium sells and the daily login claim pays', open: Object.freeze({ premium: true }) }),
  greenhaven: Object.freeze({ bucket: 'a', door: 'a Greenhaven ground not yet built puts it on one of its creatures' }),
  later:      Object.freeze({ bucket: 'c', door: 'none in Early Access: kept for a later region, or cut (Tyler)' }),
  cut:        Object.freeze({ bucket: 'c', door: 'none: dead weight, listed for a cut (Tyler approves)' }),
});

/* SHRINK-ONLY. An id leaves its row the build it becomes reachable (C11 fails a stale row).
   Only `staged` may grow, and only with a ground whose opening the guard proves; every
   other fate is held under UNREACHABLE_CEILING. */
export const UNREACHABLE = Object.freeze({
  /* Empty since Mosslight Glade opened on its art (lane b-mosslight-art, v0.2.31): its drops and the Magic Essence line
     (deep runes, the rune bar) are reachable. A ground staged again may refill it, with the guard's proof of its opening. */
  staged: Object.freeze([]),
  premium: Object.freeze(['oak_practice_blade']),
  /* Tier 1-3 gear and Greenhaven-fit materials (roads, greenwood, farm edge, ruins) for the region's next
     grounds. Gloves, belts and the caster's cloth line have NO reachable piece today. */
  greenhaven: Object.freeze([
    'bronze_gauntlets', 'iron_gauntlets', 'steel_gauntlets', 'studded_gloves', 'boarhide_gloves', 'apprentice_gloves',
    'adept_gloves', 'scholar_gloves', 'leather_belt', 'iron_belt', 'steel_belt', 'studded_belt', 'boarhide_belt',
    'apprentice_belt', 'adept_belt', 'scholar_belt',
        'bramble_blade', 'rat_stick',
    'fang_studs', 'wolfbone_torc', 'spidersilk_choker', 'banded_signet', 'tusker_charm', 'packlord_band',
    'mirewort_drops', 'ancient_fragment', 'cracked_spellstone', 'grave_dust', 'razor_claw', 'bear_pelt', 'bear_claw',
    'raw_bear_meat', 'cooked_bear_meat', 'bear_claw_pie',
  ]),
  /* Tier 4+ ladder rungs, the old roster's uniques, and the dragon, undead, demon, troll and void materials
     with the late recipes they feed (Cooking 25 panther and 70+, Inner Flame 35+, Crafting 60 keystones). */
  later: Object.freeze([
    'mithril_boots', 'rune_boots', 'mithril_gauntlets', 'rune_gauntlets', 'ember_gauntlets', 'mithril_belt',
    'rune_belt', 'snakeskin_boots', 'wyvernhide_boots', 'snakeskin_gloves', 'wyvernhide_gloves', 'snakeskin_belt',
    'wyvernhide_belt', 'warlock_helmet', 'warlock_boots', 'sorcerer_boots', 'archmage_boots', 'warlock_gloves',
    'sorcerer_gloves', 'archmage_gloves', 'warlock_belt', 'sorcerer_belt', 'rune_sword', 'maple_bow', 'yew_bow',
    'yew_staff', 'runewood_staff', 'maple_wand', 'yew_wand', 'runewood_wand', 'maple_spellbook', 'yew_spellbook',
    'runewood_codex', 'emberfang_blade', 'panthers_eye_pendant', 'wraithsilk_shroud', 'chitinweave_cloak',
    'wraithglass_drops', 'trollhide_cape', 'shadowsilk_cape', 'warlords_torc', 'lazlos_maul', 'dragonrib_bow',
    'void_censer', 'barrowking_mantle', 'jarls_rimetorc', 'captains_ribblade', 'chief_blade', 'alpha_cloak',
    'keystone',
    'dragon_bones', 'troll_hide', 'vamp_dust', 'demon_shard', 'dragon_scale', 'lich_soul', 'ancient_rune',
    'dragon_gem', 'wraith_veil', 'void_chitin', 'void_core', 'ancient_claw', 'raw_panther_meat', 'cooked_panther_meat',
    'hunters_feast', 'dragon_stew', 'lich_soul_soup', 'void_banquet', 'soul_recipe', 'marrow_cookbook',
    'field_cookbook', 'emberheart',
  ]),
  /* Vendor trash of creatures with no home in the plan: no recipe, room or quest reads them. */
  cut: Object.freeze([
    'rune_frag', 'ruby', 'night_fang', 'dark_sigil', 'spider_eye', 'brute_plate', 'dire_fang', 'plague_ichor',
    'swarm_heart', 'warlord_badge', 'hell_ember', 'shadow_thread', 'captain_medal', 'shadow_pelt', 'death_steel',
    'hollow_sigil', 'abyssal_pearl',
    /* A copy of the Practice Sword, stat for stat (designer 2026-10-22: the rung-1 copies of the practice kit are cut). */
    'bronze_sword',
  ]),
});
/* Every row outside `staged`. It only falls: lower it in the commit that sources or cuts an item. */
/* 172 -> 140 (lane/c-style-gear's merge, 2026-10-22): the seed counter and the outfitter landed (the `farming` and
   `shop_gear` fates closed, 33 rows; Bronze Sword left the unlisted counter for `cut`). 140 -> 134: the style
   ladder makes six greenhaven rows (Oak Wand, Oakboard Spellbook, Iron Warhammer, Apprentice and Adept Slippers,
   Adept Robe Top); the Longbow left `staged` (made at Crafting 15 too). 134 -> 133 (lane b-loot-bands): Old Grayjaw's
   Rare row sources the Studded Leather Coif. 133 -> 132: the Sewer's kobolds drop the Iron Boots; 132 -> 131: Rook hides the Boarhide Coif; 131 -> 129: the Warrens drop the Steel and Scholar boots.  129 -> 125: the Warrens' willow Rares. */
export const UNREACHABLE_CEILING = 125;

/**
 * id -> the first reachable door (a label). `opts` opens planned doors for C11's proof:
 * { grounds: every ground including staged ones, premium: true }. The Shop is its LISTED rows (SHOP_LISTED_OFFER_IDS).
 */
export function reachableSources(opts = {}) {
  const grounds = opts.grounds || OPEN_GROUNDS;
  const m = new Map();
  const put = (id, label) => { if (!id || !ITEMS[id] || m.has(id)) return false; m.set(id, label); return true; };
  const met = new Set();
  for (const g of Object.values(grounds)) {
    for (const p of g.pockets || []) for (const s of (p.pack || []).concat(p.spawns || [])) met.add(s.monster);
    for (const s of (HUNT_INDEX[g.hunt] || {}).spawns || []) met.add(s.monster);
  }
  for (const id of met) for (const d of (MONSTERS[id] && MONSTERS[id].drops) || []) put(d.id, 'drops from ' + id);
  for (const o of SHOP_OFFERS) if (o && SHOP_LISTED_OFFER_IDS.has(o.id)) for (const g of o.grant || []) if (g && g.kind === 'item') put(g.id, 'shop ' + o.id);
  for (const id of Object.keys(START_INVENTORY)) put(id, 'start kit');
  for (const id of Object.values(START_EQUIPMENT)) put(id, 'start kit');
  for (const id of gatherProductIds()) put(id, 'gathered');
  for (const id of Object.keys(CODED_SOURCES)) put(id, CODED_SOURCES[id].label);
  if (opts.premium && PREMIUM_LOGIN_REWARD.item) put(PREMIUM_LOGIN_REWARD.item, 'premium login reward');
  for (const t of HEARTHFIND_TABLE) if (t.kind === 'node' || met.has(t.id)) put(t.item, 'hearthfind at ' + t.id);
  for (let grew = true; grew;) {
    grew = false;
    for (const k of Object.keys(CROPS)) if (m.has(CROPS[k].seed)) grew = put(CROPS[k].prod, 'harvested') || grew;
    for (const skill of Object.keys(ARTISAN_RECIPES)) {
      for (const r of ARTISAN_RECIPES[skill] || []) {
        if (!r || !r.output || m.has(r.output)) continue;
        const need = Object.keys(recipeInputs(r)).concat(r.gated ? [r.gated] : []);
        if (need.every((id) => m.has(id))) grew = put(r.output, 'made by ' + skill) || grew;
      }
    }
  }
  return m;
}

/** The door options with every planned fate's door open, optionally all but one. */
export function plannedDoors(except) {
  const out = {};
  for (const [fate, f] of Object.entries(UNREACHABLE_FATES)) {
    if (!f.open || fate === except) continue;
    if (f.open.grounds) out.grounds = f.open.grounds;
    if (f.open.premium) out.premium = true;
  }
  return out;
}


const EQUIP_TYPES = Object.freeze({ weapon: 1, armor: 1, jewelry: 1, ammo: 1 });

function push(map, id, label) {
  if (!id) return;
  if (!map.has(id)) map.set(id, []);
  const list = map.get(id);
  if (list.indexOf(label) < 0) list.push(label);
}
function addSet(map, ids, label) { for (const id of ids) push(map, id, label); }

/** Every input id one recipe row spends (the three historical row shapes). */
export function recipeInputs(r) {
  const out = {};
  if (!r) return out;
  if (r.inputs) Object.keys(r.inputs).forEach((k) => { out[k] = r.inputs[k]; });
  if (r.input) out[r.input] = (out[r.input] || 0) + (r.inputQty || 1);
  if (r.secondary) Object.keys(r.secondary).forEach((k) => { out[k] = (out[k] || 0) + r.secondary[k]; });
  return out;
}

/** id -> [source labels]. */
export function itemSources() {
  const m = new Map();
  addSet(m, gatherProductIds(), 'gathered');
  addSet(m, cropProductIds(), 'harvested');
  addSet(m, combatDropIds(), 'monster drop');
  for (const skill of Object.keys(ARTISAN_RECIPES)) addSet(m, artisanOutputIds(skill), 'made by ' + skill);
  /* ONLY A LISTED SHOP ROW IS A SOURCE (lane/b-orphan-sources, 2026-10-22). shop_buy sells only the ids a Shop tab
     lists (catalogue.js offerRefusal: `not_listed`); the other SHOP_OFFERS rows are the vendor's price list, a door
     nobody can open. Counting them hid eleven items no player could ever obtain (the farming seeds, the apprentice
     staff, wand and primer, the stone maul, and the fox companion, cut 2026-10-22). */
  for (const o of SHOP_OFFERS) {
    if (!o || !SHOP_LISTED_OFFER_IDS.has(o.id)) continue;
    for (const g of o.grant || []) if (g && g.kind === 'item' && g.id) push(m, g.id, 'shop');
  }
  addSet(m, Object.keys(START_INVENTORY), 'start kit');
  addSet(m, Object.values(START_EQUIPMENT).filter(Boolean), 'start kit');
  addSet(m, HEARTHFIND_ITEMS, 'hearthfind');
  /* The premium daily login claim (hr_login_claim pays this row, generated from premium.js). */
  if (PREMIUM_LOGIN_REWARD.item) push(m, PREMIUM_LOGIN_REWARD.item, 'premium login reward');
  for (const id of Object.keys(CODED_SOURCES)) push(m, id, CODED_SOURCES[id].label);
  return m;
}

/** id -> [use labels]. */
export function itemUses() {
  const m = new Map();
  for (const skill of Object.keys(ARTISAN_RECIPES)) {
    for (const r of ARTISAN_RECIPES[skill] || []) {
      Object.keys(recipeInputs(r)).forEach((id) => push(m, id, skill + ' input'));
      if (r.gated) push(m, r.gated, 'unlocks a ' + skill + ' recipe');
    }
  }
  for (const o of SHOP_OFFERS) {
    for (const c of (o && o.cost) || []) if (c && c.kind === 'item') push(m, c.id, 'pays for ' + o.id);
  }
  addSet(m, seedIds(), 'planted');
  addSet(m, HEARTHFIND_ITEMS, 'a Hearthfind set piece');
  for (const id of VENDOR_TRASH) push(m, id, 'vendor trash');
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id] || {};
    if (EQUIP_TYPES[it.type] || it.slot) push(m, id, 'worn');
    if (it.type === 'tool' && it.toolSkill && SKILLS_DEF[it.toolSkill]) push(m, id, it.toolSkill + ' tool');
    if (Number(it.heals) > 0 || it.buff) push(m, id, 'eaten');
    if (Number(it.mana) > 0) push(m, id, 'drunk for mana on a hunt');
  }
  for (const id of Object.keys(CODED_USES)) push(m, id, CODED_USES[id].label);
  /* a named fuel is burnt alone in the Great Hearth (src/data/hearth.js; hr_hearth_burn, 2027-01-31-inner-flame.sql) */
  for (const id of Object.keys(NAMED_FUELS)) push(m, id, 'burnt in the Great Hearth (a named fuel)');
  return m;
}

/** The Collection Log's denominator: every catalogued item a player can get. */
export function obtainableItemIds() {
  const src = itemSources();
  return new Set(Object.keys(ITEMS).filter((id) => src.has(id)));
}

/* ── SKILLS WHOSE CONSUMER IS AN ENGINE, NOT AN ITEM ────────────────────────
   A combat skill makes no item; its "consumer" is the engine that reads its
   level. Declared with the file that reads it, proven by the guard. */
export const ENGINE_SKILL_CONSUMERS = Object.freeze({
  melee:        Object.freeze({ label: 'melee hit chance and max hit (combat engine)', file: 'src/core/combat.js', needle: 'melee' }),
  defense:      Object.freeze({ label: 'damage taken (combat engine)', file: 'src/core/combat.js', needle: 'defense' }),
  ranged:       Object.freeze({ label: 'ranged accuracy and damage (combat engine)', file: 'src/core/combat.js', needle: 'ranged' }),
  magic:        Object.freeze({ label: 'magic accuracy and damage (combat engine)', file: 'src/core/combat.js', needle: 'magic' }),
  /* Inner Flame (Tyler 2026-10-25, replacing Prayer and its PENDING_CONSUMER row): the HP and mana regeneration RATE */
  inner_flame:  Object.freeze({ label: 'HP and mana regeneration rate (vitals)', file: 'src/core/vitals.js', needle: "levelOf(c && c.skills, 'inner_flame')" }),
});

/** skill -> [consumer labels]: who uses what the skill makes. */
export function skillConsumers() {
  const uses = itemUses();
  const m = new Map();
  const productsUsed = (ids, skill) => {
    for (const id of ids) {
      const u = (uses.get(id) || []).filter((l) => l.indexOf(skill + ' input') !== 0);
      if (u.length) push(m, skill, id + ' -> ' + u[0]);
    }
  };
  productsUsed(TREES.map((n) => n.prod), 'woodcutting');
  productsUsed(ROCKS.map((n) => n.prod), 'mining');
  productsUsed(FISH_SPOTS.map((n) => n.prod), 'fishing');
  productsUsed(Object.keys(CROPS).map((k) => CROPS[k].prod), 'farming');
  for (const skill of Object.keys(ARTISAN_RECIPES)) {
    productsUsed([...artisanOutputIds(skill)], skill);
  }
  for (const s of Object.keys(ENGINE_SKILL_CONSUMERS)) push(m, s, ENGINE_SKILL_CONSUMERS[s].label);
  return m;
}

/** Every effect kind an item names that no engine reads. */
export function deadEffectKinds() {
  const out = [];
  for (const id of Object.keys(ITEMS)) {
    for (const k of (ITEMS[id] && ITEMS[id].effects) || []) {
      if (!(EFFECT_KINDS[k] && EFFECT_KINDS[k].live)) out.push(id + ':' + k);
    }
  }
  return out;
}
