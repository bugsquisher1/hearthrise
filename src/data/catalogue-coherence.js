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

import { ITEMS } from './items.js?v=564';
import { ARTISAN_RECIPES } from './recipes.js?v=564';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from './gathering.js?v=564';
import { SKILLS_DEF } from './skills.js?v=564';
import { DUNGEONS, QM_STOCK } from './dungeons.js?v=564';
import { SHOP_OFFERS } from './shops.js?v=564';
import { START_INVENTORY, START_EQUIPMENT } from './start-kit.js?v=564';
import { HEARTHFIND_ITEMS } from './hearthfind.js?v=564';
import { EFFECT_KINDS } from './item-effects.js?v=564';
import { MONSTERS } from './monsters.js?v=564';
import {
  gatherProductIds, cropProductIds, seedIds, combatDropIds, artisanOutputIds,
  qmStockIds, shopGrantIds, goalRewardIds, raidRewardIds, dungeonRewardIds,
} from './item-authority.js?v=564';

/* The data identities this module reads, re-exported so a Node guard can mutate
   the SAME objects (a bare import without the ?v= query is a second module
   instance, and a plant there would never reach these functions). */
export { ITEMS, SKILLS_DEF, SHOP_OFFERS, ARTISAN_RECIPES, MONSTERS };

/* ── SOURCES AN ENGINE HARD-CODES ───────────────────────────────────────────
   id -> { label, file, needle }. The guard reads `file` and fails unless it
   still contains `needle`, so a row here cannot outlive the code it describes. */
export const CODED_SOURCES = Object.freeze({
  burnt_food:    Object.freeze({ label: 'a burnt cook', file: 'src/core/artisan.js', needle: "BURNT_ITEM = 'burnt_food'" }),
  dungeon_scrip: Object.freeze({ label: 'dungeon clears (hr_dungeon_settle)', file: 'supabase/functions/hr-accrue/dungeon-settle.js', needle: 'scrip' }),
  hearth_token:  Object.freeze({ label: 'platform purchase only (never PvE)', file: 'src/legacy.js', needle: "addItem('hearth_token'" }),
});

/* ── USES AN ENGINE HARD-CODES ──────────────────────────────────────────────
   Same contract as CODED_SOURCES. */
export const CODED_USES = Object.freeze({
  hearth_token: Object.freeze({ label: 'redeemed for gems or traded on the Market', file: 'src/legacy.js', needle: 'hearth_token' }),
});

/* ── VENDOR TRASH — the one use that is selling ──────────────────────────────
   A few early drops have no craft use ON PURPOSE: they are the early gold
   faucet (slime/goblin tier), worth carrying to town and nothing more, and a
   burnt cook is the price of a missed one. An explicit, named list so a NEW
   dead end fails the guard instead of quietly joining it. Was legacy.js
   window.__DROP_SINK_EXEMPT; this is now its only home. */
export const VENDOR_TRASH = Object.freeze(['sticky_core', 'goblin_ear', 'goblin_totem', 'burnt_food']);

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
  addSet(m, qmStockIds(), 'Quartermaster');
  addSet(m, shopGrantIds(), 'shop');
  addSet(m, goalRewardIds(), 'quest or daily reward');
  addSet(m, raidRewardIds(), 'clan hunt chest');
  addSet(m, dungeonRewardIds(DUNGEONS), 'dungeon');
  addSet(m, Object.keys(START_INVENTORY), 'start kit');
  addSet(m, Object.values(START_EQUIPMENT).filter(Boolean), 'start kit');
  addSet(m, HEARTHFIND_ITEMS, 'hearthfind');
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
  if (QM_STOCK.length) push(m, 'dungeon_scrip', 'spent at the Quartermaster');
  addSet(m, seedIds(), 'planted');
  addSet(m, HEARTHFIND_ITEMS, 'a Hearthfind set piece');
  const roomOffer = new Set(SHOP_OFFERS.map((o) => o && o.id).filter(Boolean));
  for (const id of VENDOR_TRASH) push(m, id, 'vendor trash');
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id] || {};
    if (EQUIP_TYPES[it.type] || it.slot) push(m, id, 'worn');
    if (it.type === 'tool' && it.toolSkill && SKILLS_DEF[it.toolSkill]) push(m, id, it.toolSkill + ' tool');
    if (Number(it.heals) > 0 || it.buff) push(m, id, 'eaten');
    if (it.unlocks && DUNGEONS[it.unlocks]) push(m, id, 'opens ' + it.unlocks);
    if (it.unlocks && roomOffer.has('room.' + it.unlocks)) push(m, id, 'opens room rung ' + it.unlocks);
    if (it.tag === 'rune' && it.element) push(m, id, 'enchants a weapon (' + it.element + ')');
    if (it.tag === 'castle') push(m, id, 'clan castle stores');
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
  attack:       Object.freeze({ label: 'hit chance (combat engine)', file: 'src/core/combat.js', needle: 'attack' }),
  strength:     Object.freeze({ label: 'max hit (combat engine)', file: 'src/core/combat.js', needle: 'strength' }),
  defense:      Object.freeze({ label: 'damage taken (combat engine)', file: 'src/core/combat.js', needle: 'defense' }),
  hitpoints:    Object.freeze({ label: 'max HP (accrual engine)', file: 'supabase/functions/hr-accrue/accrual.js', needle: "ev.skill === 'hitpoints'" }),
  ranged:       Object.freeze({ label: 'ranged accuracy and damage (combat engine)', file: 'src/core/combat.js', needle: 'ranged' }),
  magic:        Object.freeze({ label: 'magic accuracy and damage (combat engine)', file: 'src/core/combat.js', needle: 'magic' }),
  bountyHunter: Object.freeze({ label: 'contract boards (bounty engine)', file: 'src/core/bounty.js', needle: 'bountyHunter' }),
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
