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

import { ITEMS } from './items.js?v=0.2.13';
import { ARTISAN_RECIPES } from './recipes.js?v=0.2.13';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=0.2.13';
import { SKILLS_DEF } from './skills.js?v=0.2.13';
import { SHOP_OFFERS } from './shops.js?v=0.2.13';
import { START_INVENTORY, START_EQUIPMENT } from './start-kit.js?v=0.2.13';
import { PREMIUM_LOGIN_REWARD } from './premium.js?v=0.2.13';
import { HEARTHFIND_ITEMS } from './hearthfind.js?v=0.2.13';
import { EFFECT_KINDS } from './item-effects.js?v=0.2.13';
import { MONSTERS } from './monsters.js?v=0.2.13';
import {
  gatherProductIds, cropProductIds, seedIds, combatDropIds, artisanOutputIds,
  shopGrantIds, goalRewardIds,
} from './item-authority.js?v=0.2.13';

/* The data identities this module reads, re-exported so a Node guard can mutate
   the SAME objects (a bare import without the ?v= query is a second module
   instance, and a plant there would never reach these functions). */
export { ITEMS, SKILLS_DEF, SHOP_OFFERS, ARTISAN_RECIPES, MONSTERS };

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
  /* CORE REBUILD (2026-10-19): the Rat King's Crown Shard lost its Prayer offering (Tyler's
     deletion list); "a trader pays well for it" is its whole job until the roster gives it one. */
  'crown_shard',
  /* PEBBLEBROOK BANK (2026-10-19): the crayfish claw is the bank's junk; the carapace plate is its
     imbuement material and sells until armour imbuements open (ARCHITECTURE_CONTRACTS §8). */
  'crayfish_claw', 'carapace_plate',
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
  'abyssal_greaves', 'adept_helmet', 'adept_pants', 'alphaheart_longbow', 'apprentice_body',
  'apprentice_helmet', 'apprentice_pants', 'archmage_belt', 'archmage_body', 'archmage_helmet',
  'archmage_pants', 'ashcrown_greatsword', 'boarhide_pants', 'bone_needle',
  'bronze_hammer', 'bronze_helm', 'bronze_knife',
  'bronze_platebody', 'bronze_platelegs', 'chitin_belt', 'chitin_body',
  'chitin_boots', 'chitin_gloves', 'chitin_helmet', 'chitin_pants', 'choirbone',
  'choirbone_gauntlets', 'copper_studs', 'crown_of_the_fallen_king', 'dawn_belt',
  'dawn_boots', 'dawn_gauntlets', 'dawn_helm', 'dawn_platebody',
  'dawn_platelegs', 'dawn_sword', 'dawn_warhammer', 'dawnbound_amulet', 'dawnforged_signet',
  'dawnlit_mantle', 'dawnsteel_rod', 'demoncaller_staff', 'dragon_gem_earrings',
  'dragon_relic', 'dragonfang_pike', 'dragonhide_belt', 'dragonhide_body', 'dragonhide_boots',
  'dragonhide_gloves', 'dragonhide_helmet', 'dragonhide_pants', 'dragonrend_greatblade',
  'duskwood_bow', 'duskwood_rod', 'duskwood_staff', 'elderscale_heart', 'elderscale_platebody',
  'ember_belt', 'ember_boots', 'ember_helm', 'ember_platebody',
  'ember_platelegs', 'ember_sword', 'ember_warhammer', 'fangdart_recurve', 'gold_amulet',
  'gold_ring', 'heartgarnet_maul', 'hollow_sigil_ring', 'houndskin_cloak', 'iron_helm',
  'iron_platebody', 'iron_platelegs', 'leather_body', 'leather_pants', 'lexarch_seal',
  'longbow', 'maple_rod', 'maple_staff', 'mithril_helm',
  'mithril_platebody', 'mithril_platelegs', 'mithril_sword', 'mithril_warhammer',
  'nightstalker_pelt', 'oak_staff', 'plaguewarden_greaves', 'quiet_coat', 'regent_helm',
  'riftmaw_carapace', 'riftmaw_husk', 'ruby_signet', 'rubyfire_studs',
  'rune_hammer', 'rune_helm', 'rune_knife', 'rune_needle', 'rune_platebody',
  'rune_platelegs', 'rune_warhammer', 'runewood_bow', 'runewood_rod', 'scholar_body',
  'scholar_helmet', 'scholar_pants', 'slagheart_core', 'slagheart_platebody', 'snakeskin_body',
  'snakeskin_helmet', 'snakeskin_pants', 'sorcerer_body', 'sorcerer_helmet', 'sorcerer_pants',
  'spellstone_ring', 'spidereye_studs', 'steel_hammer', 'steel_knife',
  'steel_needle', 'steel_platelegs', 'steel_warhammer',
  'studded_body', 'studded_pants', 'verdite_blade', 'verdite_helm', 'verdite_platebody',
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


const EQUIP_TYPES = Object.freeze({ weapon: 1, armor: 1, jewelry: 1, ammo: 1, companion: 1 });

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
  addSet(m, shopGrantIds(), 'shop');
  addSet(m, goalRewardIds(), 'quest reward');
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
