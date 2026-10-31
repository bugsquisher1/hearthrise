#!/usr/bin/env node
// ============================================================
// tests/supplies-catalogue.mjs — THE HUNT BAG, THE SHOP'S PER-USE SUPPLIES,
// THE ACTION BAR AND THE END CARD ARE WELL-FORMED DATA (Hunt Sessions, ruling
// HR-2026-10-14 and Tyler's 2026-10-14 supply rulings, lane D).
//
//   node tests/supplies-catalogue.mjs             the guard
//   node tests/supplies-catalogue.mjs --selftest  mutation proof (every arm bites)
//
//   S1 every packed supply row names an item that exists
//   S2 its kind is the kind the item's own data says (raw food is never one)
//   S3 it is crafted or sold: an artisan recipe or a LISTED shop offer makes it (or it is a free kit
//      rung that is never spent and never bought by a vendor, so it cannot be lost)
//   S4 no id twice; S5 every item that IS a supply is listed (completeness)
//   S6 essential: heals yes; drinks and buffs no; ammo only where an empty
//      slot hurts
//   S7 heal and buff values are the item's own, never a copy
//   S8 every buff type is sorted into COMBAT or IDLE, and only once
//   S9 HEAL_ORDER is every heal, cheapest first
//   M1 every staged drink is a mana item with a Cooking recipe from one crop,
//      a flavour line, and a batch that never vends for more than 5x its crop
//   K1 heal, mana and ammo each have a shop supply paid per use
//   B1 every shop supply is not an item, names a crafted partner of its kind,
//      gives 3/4 of the partner's heal or mana (an arrow: 3/4 of its ammo bonus,
//      applied per shot by the engine), and costs more per point than the
//      partner's book value (a shot: at least BASIC_AMMO_PREMIUM x it, 1 since
//      the designer's spell-release balance, 2026-10-23)
//   B2 every crafted ARROW from tier 2 up has a shop version; a RUNE has one
//      exactly when an active ability spends it (designer 2026-10-21: Plain
//      Fire Rune; Tyler 10-15 "runes and ammo: carried first, then the store");
//      no store row names a hunt tier (Tyler 2026-10-19: the player's slot picks
//      the store item, never the hunt)
//   B5 every packed heal, drink and ammo line has a store row behind it, or is
//      listed in supply-basics.js NO_STORE_PARTNER with its reason, never both
//      (Tyler 2026-10-23: "like anything else the arrows should then be bought
//      from the store"; Iron Arrows had none)
//   L1 ONE food-and-drink cooldown at 2 s (Tyler 2026-10-19, consumables.js
//      laneMs, the one source); the ability lanes are abilities.js's
//   B4 no GOLD offer on a counter (src/data/shops.js) sells a heal or a drink
//      for less gold per point than the shop's per-use basic of that tier
//      (master plan row 2: the Counter's seed.cooked_* sold food ~4x cheaper
//      per HP than the basic, so the per-use price meant nothing)
//   B3 a bigger shop heal or drink never costs less per point than a smaller
//   R1 the hero settings (target modes, stances, action-set limits, role
//      defaults) are frozen, and the action set is 5 presets of 20 ability slots
//   R2 the default hero eats under 50% HP and drinks under 30% mana
//      (consumables.js, ASSUMED by lane H4), own stock first, then the store
//      (SUPPLY_SOURCE mine + ON_EMPTY switch, Tyler 10-16). Lane S1 retired the
//      C2 conditional supply bar (rule subjects, presets of supply slots): hunts
//      are idle and the bar is ability ids (Tyler 10-16)
//   H1 every hunt walks 10..300 s in whole ticks; every monster tier has a walk
//   G1 every hunt has a melee, ranged and magic bag and every monster tier a
//      bag; lines are packed supplies of the right kind; no parked buffs
//   L1 falls 3 (1–6), hours 1–24 (off by default), 10 bag lines
//   C1 the end order is the ruling's, and every reason and event has copy
//      that uses only known placeholders and never says "1 times"
//
// Exit 0 clean, 1 on any violation, 2 harness error.
// ============================================================

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  SUPPLY_KINDS, COMBAT_BUFF_TYPES, IDLE_BUFF_TYPES, SUPPLY_ROWS, MANA_SUPPLY_ROWS, SUPPLIES, HEAL_ORDER,
  supplyKindOf, BAG_TARGET_HOURS, BAG_GUIDE_BY_HUNT, BAG_GUIDE_BY_TIER, bagGuideFor,
} from '../src/data/supplies.js';
import { BASIC_SUPPLIES, BASIC_EFFECT_SHARE, BASIC_AMMO_PREMIUM, NO_STORE_PARTNER } from '../src/data/supply-basics.js';
import { FOOD_HEAL_SCALE } from '../src/data/core-model.js';
import { DRINK_ITEMS, DRINK_RECIPES, DRINK_DESC } from '../src/data/drinks.js';
import { TARGET_MODES, HUNT_STANCES, ROLE_DEFAULTS, ACTION_SET_LIMITS } from '../src/data/rule-subjects.js';
import { CONSUMABLE_RULES } from '../src/data/consumables.js';
import { ABILITY_LANES, ABILITIES } from '../src/data/abilities.js';
import {
  SUPPLY_SOURCE, ON_EMPTY, SESSION_LIMITS, END_ORDER, END_CARD_COPY, END_REASON_COPY, TIMELINE_COPY, EVENT_COPY,
} from '../src/data/hunt-sessions.js';
import { HUNTS, TRAINING_TRAVEL_S, trainingHunt } from '../src/data/hunts.js';
import { CROPS } from '../src/data/gathering.js';
import { itemSources, ITEMS, MONSTERS } from '../src/data/catalogue-coherence.js';
import { BUFFS_DEF } from '../src/core/buffs.js';
import { styleNeedsAmmo } from '../src/core/ammo.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { isMain as isEntryModule } from './_is-main.mjs';

/* The rulings' own lists, typed once here so the data can be held to them. */
/* 'vigour' LEFT the end order (designer ruling, 2026-10-14 loop check) and
   'stamina' took its place (Tyler, same day: "steal the stamina system, 1:1
   like Huntera"); `gold_out` follows the bag's own ends (Tyler, same day: a
   shop supply the purse cannot pay ends the hunt). `rule` (Tyler 2026-10-18, the
   conditional action engine): one of the hero's own stop rules held. */
/* Core rebuild (Tyler 2026-10-19): a death ends the hunt (`died`); there is no falls limit. LEAVE TOGETHER (Tyler
   2026-10-22): another member's end sends a ticked hero home, `party_member_died` after a death, else `party_member_left`. */
const RULING_END_ORDER = ['died', 'party_member_died', 'party_member_left', 'heals_out', 'ammo_out', 'gold_out', 'rule', 'stamina', 'hours', 'left', 'changed', 'no_fight', 'server'];
/* vigour_low -> stamina_low (master plan row 4); `cover` = sell-to-cover (row 3). */
const RULING_EVENTS = ['entered', 'level_up', 'rare_drop', 'death', 'slot_dry', 'stamina_low', 'cover', 'ended'];
const PER_USE_KINDS = ['heal', 'mana', 'ammo'];   // buff is parked
/* `activity`: the server's name for what the character resumes after an
   automatic end ("fishing at Shrimp Spot", Tyler 2026-10-14). */
const PLACEHOLDERS = new Set(['hunt', 'item', 'skill', 'level', 'n', 'have', 'need', 'monster', 'reason', 'activity', 'name', 'ground', 'member']);
const BATCH_FAUCET_CAP = 5;                       // tests/recipe-yield-guard.mjs
const STYLES = ['melee', 'ranged', 'magic'];

const AMMO_FAMILY = { ranged: 'ranged', magic: 'magic' };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function deepFrozen(o) {
  if (o === null || typeof o !== 'object') return true;
  if (!Object.isFrozen(o)) return false;
  return Object.values(o).every(deepFrozen);
}

function crafted(sources, id) {
  return (sources.get(id) || []).some((l) => l === 'shop' || l.startsWith('made by '));
}

/* (A FREE KIT RUNG once stood in for a source: the Air Rune, kit-only, never spent and worth nothing. It left with the
   old rune ladder, 2026-10-23, so every packed supply now needs a recipe or a listed shop row: S3 has no exemption.) */

/** What one point (or one shot) of a partner costs at book value. */
function partnerUnit(p, kind) {
  if (kind === 'heal') return p.v / p.heals;
  if (kind === 'mana') return p.v / p.mana;
  return p.v * p.ammoPerShot;
}

function checkPacked(d, f) {
  const sources = itemSources();
  const seen = new Set();
  const listed = Object.create(null);
  for (const [kind, id, essential] of d.rows) {
    const it = d.items[id];
    if (!it) { f('S1', `supply '${id}' is not an item in src/data/items.js`); continue; }
    if (seen.has(id)) f('S4', `supply '${id}' is listed twice`);
    seen.add(id);
    listed[id] = kind;
    if (!SUPPLY_KINDS.includes(kind)) f('S2', `supply '${id}' has unknown kind '${kind}'`);
    const real = supplyKindOf(it);
    if (real !== kind) f('S2', `supply '${id}' is listed as '${kind}' but its item data says '${real}'`);
    if (!crafted(sources, id)) f('S3', `supply '${id}' has no recipe and no shop offer (sources: ${(sources.get(id) || []).join(', ') || 'none'})`);
    const want = kind === 'heal' ? true : (kind === 'buff' || kind === 'mana') ? false
      : styleNeedsAmmo(AMMO_FAMILY[it.reqSkill] || 'sword');
    if (essential !== want) f('S6', `supply '${id}' essential=${essential}, the rule says ${want}`);
  }
  for (const id of Object.keys(d.items)) {
    if (supplyKindOf(d.items[id]) && !(id in listed)) f('S5', `'${id}' is a ${supplyKindOf(d.items[id])} item with no supply row`);
  }
  if (d.checkValues) {
    for (const id of Object.keys(SUPPLIES)) {
      const s = SUPPLIES[id]; const it = d.items[id] || {};
      if (s.kind === 'heal' && s.heals !== it.heals) f('S7', `'${id}' heals ${s.heals}, the item says ${it.heals}`);
      if (s.kind === 'buff' && JSON.stringify(s.buff) !== JSON.stringify(it.buff)) f('S7', `'${id}' buff differs from the item`);
    }
  }
  const types = [...d.combatBuffs, ...IDLE_BUFF_TYPES];
  if (new Set(types).size !== types.length) f('S8', 'a buff type is in both COMBAT and IDLE');
  for (const t of Object.keys(BUFFS_DEF)) if (!types.includes(t)) f('S8', `buff type '${t}' is in neither COMBAT_BUFF_TYPES nor IDLE_BUFF_TYPES`);
  for (const t of types) if (!(t in BUFFS_DEF)) f('S8', `'${t}' is not a buff type in src/core/buffs.js`);
  const heals = d.rows.filter((r) => r[0] === 'heal').map((r) => r[1]);
  if (JSON.stringify([...HEAL_ORDER].sort()) !== JSON.stringify([...heals].sort())) f('S9', 'HEAL_ORDER is not exactly the heal rows');
  for (let i = 1; i < HEAL_ORDER.length; i++) {
    if (ITEMS[HEAL_ORDER[i]].v < ITEMS[HEAL_ORDER[i - 1]].v) f('S9', `HEAL_ORDER puts '${HEAL_ORDER[i]}' after a dearer heal`);
  }
}

function checkDrinks(d, f) {
  const crops = new Set(Object.values(CROPS).map((c) => c.prod));
  /* Every drink, staged or live (lane S2 moved all six into SUPPLY_ROWS), is held to the same rules. */
  const staged = new Set(MANA_SUPPLY_ROWS.map((r) => r[1]));
  for (const [kind, id, essential] of [...MANA_SUPPLY_ROWS, ...d.rows.filter((r) => r[0] === 'mana')]) {
    const it = d.drinks[id];
    if (!it) { f('M1', `mana row '${id}' has no drink in src/data/drinks.js`); continue; }
    if (kind !== 'mana' || supplyKindOf(it) !== 'mana' || essential !== false) f('M1', `'${id}' is not a non-essential mana supply`);
    if (staged.has(id) && own(ITEMS, id) && !d.rows.some((r) => r[1] === id)) f('M1', `'${id}' is in ITEMS but still staged: move it into SUPPLY_ROWS`);
    if (!own(DRINK_DESC, id)) f('M1', `'${id}' has no flavour line`);
    const r = d.drinkRecipes.find((x) => x.output === id);
    if (!r) { f('M1', `'${id}' has no Cooking recipe`); continue; }
    const ins = Object.keys(r.inputs || {});
    if (ins.length !== 1 || !crops.has(ins[0])) f('M1', `'${id}' is not made from one Farming crop`);
    const cropVendor = vendorPriceOf(ITEMS, ins[0]) * (r.inputs[ins[0]] || 0);
    if (r.outputQty * it.v > BATCH_FAUCET_CAP * cropVendor) f('M1', `'${id}' vends ${r.outputQty * it.v} g a batch from a ${cropVendor} g crop (over ${BATCH_FAUCET_CAP}x)`);
  }
}

function checkBasics(d, f) {
  const kinds = new Set();
  for (const b of d.basics) {
    kinds.add(b.kind);
    if (own(d.items, b.id) || own(d.drinks, b.id)) f('B1', `shop supply '${b.id}' collides with an item id`);
    const p = d.items[b.partner] || d.drinks[b.partner];
    if (!p || supplyKindOf(p) !== b.kind) { f('B1', `'${b.id}' partner '${b.partner}' is not a crafted ${b.kind} item`); continue; }
    if (!(Number.isInteger(b.price) && b.price > 0)) f('B1', `'${b.id}' price ${b.price} is not a whole number of gold`);
    if (b.kind === 'heal' || b.kind === 'mana') {
      const key = b.kind === 'heal' ? 'heals' : 'mana';
      /* Heals and mana: three quarters at the pre-x12 grain (FOOD_HEAL_SCALE), so the core rebuild's x12 kept
         every basic's ratio (drinks moved x12 with the food: designer 2026-10-21). */
      const S = FOOD_HEAL_SCALE;
      if (b[key] !== S * Math.floor((p[key] / S) * BASIC_EFFECT_SHARE) || !(b[key] < p[key])) f('B1', `'${b.id}' gives ${b[key]}, not ${BASIC_EFFECT_SHARE} of '${b.partner}' (${p[key]})`);
      if (!(b.price / b[key] > partnerUnit(p, b.kind))) f('B1', `'${b.id}' costs ${(b.price / b[key]).toFixed(1)} g a point, not more than '${b.partner}' at ${partnerUnit(p, b.kind).toFixed(1)}`);
    } else {
      const abilityRune = p.reqSkill === 'magic' && d.runesSpent.has(b.partner);
      /* A shot the store sells stands behind an arrow a shot SPENDS. */
      if (!abilityRune && (!(Number(p.ammoPerShot) > 0) || p.reqSkill !== 'ranged')) f('B1', `'${b.id}' partner '${b.partner}' is not a spent arrow or a rune an ability spends`);
      if (b.price < BASIC_AMMO_PREMIUM * partnerUnit(p, 'ammo')) f('B1', `'${b.id}' costs ${b.price} g a shot, under ${BASIC_AMMO_PREMIUM}x '${b.partner}'`);
    }
  }
  for (const k of PER_USE_KINDS) if (!kinds.has(k)) f('K1', `no shop ${k} is sold per use: a player without the skill cannot supply one`);

  const partnered = new Set(d.basics.map((b) => b.partner));
  for (const [kind, id] of d.rows) {
    const it = d.items[id] || {};
    /* EVERY ARROW COSTS A SHOT AND HAS A STORE ROW (Tyler 10-15, 10-23): no free rung. */
    if (kind === 'ammo' && it.reqSkill === 'ranged' && !(Number(it.ammoPerShot) > 0)) f('B2', `arrow '${id}' costs no shot (ammoPerShot ${it.ammoPerShot}): "Arrows keep a per-shot cost"`);
    if (kind === 'ammo' && it.reqSkill === 'ranged' && !partnered.has(id)) f('B2', `crafted arrow '${id}' (tier ${it.tier}) has no shop version`);
    if (kind === 'ammo' && it.reqSkill === 'magic' && partnered.has(id) && !d.runesSpent.has(id)) f('B2', `rune '${id}' has a shop version, but no active ability spends it`);
    if (kind === 'ammo' && it.reqSkill === 'magic' && d.runesSpent.has(id) && !partnered.has(id)) f('B2', `rune '${id}' is spent by an ability and has no shop version: the ability cannot cast once the carried runes are gone`);
  }
  for (const b of d.basics) if ('tiers' in b || 'tier' in b) f('B2', `store row '${b.id}' names a hunt tier: the slot picks the store item, never the hunt`);
  /* B5 EVERY SUPPLY A HUNT SPENDS HAS A STORE FALLBACK (Tyler 2026-10-23: food, drink, a slot-named spell rune,
     arrows), or is listed with its reason (supply-basics.js NO_STORE_PARTNER) — and a listed line has none. */
  for (const [kind, id] of d.rows) {
    if (!['heal', 'mana', 'ammo'].includes(kind)) continue;
    const why = Object.prototype.hasOwnProperty.call(d.noPartner, id) ? d.noPartner[id] : null;
    if (!partnered.has(id) && !(typeof why === 'string' && why.length > 20)) f('B5', `${kind} '${id}' has no store row to fall back on and no reason listed (NO_STORE_PARTNER)`);
    if (partnered.has(id) && why !== null) f('B5', `'${id}' is listed as needing no store row, yet one stands behind it`);
  }
  for (const id of Object.keys(d.noPartner)) if (!d.rows.some((r) => r[1] === id)) f('B5', `NO_STORE_PARTNER lists '${id}', which is no packed supply`);
  for (const k of ['heal', 'mana']) {
    const key = k === 'heal' ? 'heals' : 'mana';
    const ladder = d.basics.filter((b) => b.kind === k).sort((a, b) => a[key] - b[key]);
    for (let i = 1; i < ladder.length; i++) {
      if (ladder[i].price / ladder[i][key] < ladder[i - 1].price / ladder[i - 1][key]) f('B3', `${ladder[i].n} costs less per point than ${ladder[i - 1].n}, so the smaller one is never fired`);
    }
  }
  /* B4: every gold offer that hands over something a hunt can eat or drink,
     priced per point against the per-use basic of the item's own tier (the
     basic's own row when it is the partner). Gold only: a gem or item cost is
     no NPC price. */
  for (const o of d.offers) {
    const gold = (o.cost || []).filter((c) => c.kind === 'currency' && c.id === 'gold').reduce((a, c) => a + c.amount, 0);
    if (!(gold > 0) || (o.cost || []).length !== 1) continue;
    for (const g of (o.grant || [])) {
      const it = g.kind === 'item' && d.items[g.id];
      if (!it) continue;
      for (const [kind, key] of [['heal', 'heals'], ['mana', 'mana']]) {
        const pts = Number(it[key]) || 0;
        if (!(pts > 0)) continue;
        /* Its own store row, else the store's cheapest per point of that kind (the floor a counter must not undercut). */
        const per = (b) => b.price / b[key];
        const basic = d.basics.find((b) => b.kind === kind && b.partner === g.id)
          || d.basics.filter((b) => b.kind === kind).sort((a, b) => per(a) - per(b))[0];
        if (!basic) { f('B4', `${o.id} sells ${g.id} (${kind}) and no shop ${kind} prices its tier`); continue; }
        const offerPer = gold / (g.amount * pts);
        const basicPer = basic.price / basic[key];
        if (offerPer < basicPer) f('B4', `${o.id} sells ${g.id} at ${offerPer.toFixed(2)} g a point, under the shop's ${basic.id} at ${basicPer.toFixed(2)}`);
      }
    }
  }
}

function checkRules(d, f) {
  /* L1: the ONE food-and-drink cooldown (Tyler 2026-10-19: 2 s; consumables.js is its one source). */
  if (d.consumable.laneMs !== 2000) f('L1', `the food-and-drink cooldown is ${d.consumable.laneMs} ms, not Tyler's 2 s`);
  if (!(ABILITY_LANES.offense > 0 && ABILITY_LANES.heal > 0)) f('L1', 'the ability lanes are not abilities.js offense + heal');
  for (const [name, o] of Object.entries({ TARGET_MODES: d.targets, HUNT_STANCES, ROLE_DEFAULTS, ACTION_SET_LIMITS, CONSUMABLE_RULES: d.consumable })) {
    if (!deepFrozen(o)) f('R1', `${name} is not frozen all the way down`);
  }
  /* 20 slots: Huntera's bar, two rows of ten (Tyler 2026-10-14); the bar holds ability ids. */
  if (ACTION_SET_LIMITS.presets !== 5 || ACTION_SET_LIMITS.slots !== 20) f('R1', 'action-set limits are not 5 presets of 20 slots');
  /* R2: the default hero. */
  if (d.consumable.foodBelowPct !== 50 || d.consumable.drinkBelowPct !== 30) f('R2', `the default hero eats under ${d.consumable.foodBelowPct}% and drinks under ${d.consumable.drinkBelowPct}%, not 50% / 30%`);
  if (d.supply.default !== 'mine' || d.onEmpty.default !== 'switch') f('R2', `the default supply is ${d.supply.default} + ${d.onEmpty.default}, not own stock first then the store`);
}

function checkHuntsAndGuides(d, f) {
  for (const h of d.hunts) {
    /* Tyler 2026-10-19: no walk until the town has destinations to walk through. */
    if (h.travelS !== 0) f('H1', `hunt '${h.id}' travelS ${h.travelS} is not 0 (no walk time until town destinations exist)`);
  }
  /* Tyler 2026-10-19: the first party ground is "The Sewer" (its id stays millrace_sewer). */
  const sewer = d.hunts.find((h) => h.id === 'millrace_sewer');
  if (!sewer || sewer.name !== 'The Sewer') f('H1', `the sewer ground is named ${sewer && sewer.name}, not "The Sewer"`);
  const tiers = [...new Set(Object.values(MONSTERS).map((m) => m.tier).filter(Boolean))];
  for (const t of tiers) {
    const s = TRAINING_TRAVEL_S[t];
    if (s !== 0) f('H1', `monster tier ${t}'s training walk is ${s}, not 0`);
    if (trainingHunt('x', { tier: t }).travelS !== s) f('H1', `trainingHunt ignores TRAINING_TRAVEL_S for tier ${t}`);
  }
  const staged = new Set(MANA_SUPPLY_ROWS.map((r) => r[1]));
  const lineOk = (line, kind, where) => {
    if (!line) { f('G1', `${where}: no ${kind} line`); return; }
    const ok = kind === 'mana' ? staged.has(line.id) || (SUPPLIES[line.id] || {}).kind === 'mana' : (SUPPLIES[line.id] || {}).kind === kind;
    if (!ok) f('G1', `${where}: '${line.id}' is not a packed ${kind} supply`);
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 100000) f('G1', `${where}: qty ${line.qty} is not a whole bag line`);
  };
  const styleOk = (bag, style, where) => {
    if (!bag) { f('G1', `${where}: no ${style} bag`); return; }
    for (const k of Object.keys(bag)) if (!['heal', 'mana', 'ammo'].includes(k)) f('G1', `${where} ${style}: suggests a '${k}' line (buffs are parked)`);
    lineOk(bag.heal, 'heal', `${where} ${style}`);
    if (style !== 'melee') lineOk(bag.ammo, 'ammo', `${where} ${style}`);
    if (style === 'magic') lineOk(bag.mana, 'mana', `${where} ${style}`);
  };
  for (const h of d.hunts) {
    const g = d.guides[h.id];
    if (!g || !tiers.includes(g.tier)) { f('G1', `hunt '${h.id}' has no bag guide with a monster tier`); continue; }
    for (const s of STYLES) styleOk(g[s], s, `hunt '${h.id}'`);
  }
  for (const id of Object.keys(d.guides)) if (!d.hunts.some((h) => h.id === id)) f('G1', `bag guide for unknown hunt '${id}'`);
  for (const t of tiers) styleOk((BAG_GUIDE_BY_TIER[t] || {}).melee, 'melee', `tier ${t}`);
  if (bagGuideFor('mill_cellar', 6) !== BAG_GUIDE_BY_HUNT.mill_cellar || bagGuideFor('panther', 5) !== BAG_GUIDE_BY_TIER[5]) f('G1', 'bagGuideFor does not prefer the hunt row, then the tier');
  if (!(BAG_TARGET_HOURS >= 2 && BAG_TARGET_HOURS <= 6)) f('G1', `BAG_TARGET_HOURS ${BAG_TARGET_HOURS} is outside the ruling's 2–6 h`);
}

function checkLimitsAndCopy(d, f) {
  const L = d.limits;
  /* No falls limit (Tyler 2026-10-19): the first death ends the hunt, so no knockout count is a setting. */
  if ('falls' in L) f('L1', 'a falls limit survives: one death ends a hunt, there is nothing to count');
  if (L.hours.min !== 1 || L.hours.max !== 24 || L.hours.default !== null) f('L1', 'hours is not 1–24, off by default');
  if (L.bagLines !== 10) f('L1', 'a bag is not 10 lines');

  if (JSON.stringify(d.endOrder) !== JSON.stringify(RULING_END_ORDER)) f('C1', `end order ${d.endOrder.join(',')} is not the ruling's`);
  for (const r of RULING_END_ORDER) if (!d.endCopy[r]) f('C1', `end reason '${r}' has no copy`);
  for (const e of RULING_EVENTS) if (!EVENT_COPY[e]) f('C1', `timeline event '${e}' has no copy`);
  const copyTables = { END_REASON_COPY: d.endCopy, EVENT_COPY, END_CARD_COPY, TIMELINE_COPY };
  for (const [tname, table] of Object.entries(copyTables)) {
    for (const [key, entry] of Object.entries(table)) {
      const forms = typeof entry === 'string' ? [['text', entry]] : Object.entries(entry || {});
      if (typeof entry !== 'string' && !entry.one) f('C1', `${tname}.${key} has no 'one' form`);
      for (const [form, text] of forms) {
        for (const m of text.matchAll(/\{([a-z]+)\}/g)) if (!PLACEHOLDERS.has(m[1])) f('C1', `${tname}.${key}.${form} uses unknown placeholder {${m[1]}}`);
        if (/\(s\)|\b1 times\b|\{n\} time\b/.test(text)) f('C1', `${tname}.${key}.${form} has a plural slip: "${text}"`);
        if (form === 'other' && !text.includes('{n}')) f('C1', `${tname}.${key}.other never says the count`);
        if (form === 'one' && text.includes('{n}')) f('C1', `${tname}.${key}.one prints a count that can only be 1`);
      }
    }
  }
}

export function check(d) {
  const fails = [];
  const f = (code, msg) => fails.push(`${code} ${msg}`);
  checkPacked(d, f);
  checkDrinks(d, f);
  checkBasics(d, f);
  checkRules(d, f);
  checkHuntsAndGuides(d, f);
  checkLimitsAndCopy(d, f);
  return fails;
}

const REAL = () => ({
  rows: SUPPLY_ROWS, items: ITEMS, drinks: DRINK_ITEMS, drinkRecipes: DRINK_RECIPES, basics: BASIC_SUPPLIES,
  combatBuffs: COMBAT_BUFF_TYPES, targets: TARGET_MODES, consumable: CONSUMABLE_RULES, supply: SUPPLY_SOURCE, onEmpty: ON_EMPTY,
  hunts: HUNTS, guides: BAG_GUIDE_BY_HUNT,
  runesSpent: new Set(Object.values(ABILITIES).filter((a) => a.active && a.rune).map((a) => a.rune)),
  limits: SESSION_LIMITS, endOrder: END_ORDER, endCopy: END_REASON_COPY, checkValues: true, offers: SHOP_OFFERS,
  noPartner: NO_STORE_PARTNER,
});

const withBasic = (d, id, patch) => { d.basics = d.basics.map((b) => (b.id === id ? { ...b, ...patch } : b)); };

function selftest() {
  const PLANT = '__supplies_plant_stew';
  const mutants = [
    ['S3', 'a supply with no source recipe or shop', (d) => {
      ITEMS[PLANT] = { n: 'Planted Stew', v: 1, heals: 5, foodClass: 'healing' };
      d.rows = [...d.rows, ['heal', PLANT, true]];
    }],
    ['S1', 'an unknown item id', (d) => { d.rows = [...d.rows, ['heal', 'not_an_item', true]]; }],
    ['K1', 'a kind with no shop supply paid per use', (d) => { d.basics = d.basics.filter((b) => b.kind !== 'mana'); }],
    ['B1', 'a shop heal cheaper per point than the cooked one', (d) => { withBasic(d, 'salted_shark', { price: 100 }); }],
    ['B1', 'a shop heal as big as the cooked one', (d) => { withBasic(d, 'salted_trout', { heals: 14 }); }],
    ['B1', 'a shop supply that is also an item', (d) => { withBasic(d, 'salted_shrimp', { id: 'cooked_trout' }); }],
    /* BASIC_AMMO_PREMIUM is 1 since the spell-release balance (designer 2026-10-23): a store shot at its partner's book (4 g) holds, under it is red. */
    ['B1', 'a shop arrow under the crafted arrow book value per shot', (d) => { withBasic(d, 'plain_mithril_arrows', { price: 3 }); }],
    ['B2', 'a crafted arrow with no shop version', (d) => { d.basics = d.basics.filter((b) => b.id !== 'plain_dawnpoint_arrows'); }],
    ['B5', 'Iron Arrows with no store row again (live 10-23: the Ranger hunted on with no basic)', (d) => { d.basics = d.basics.filter((b) => b.id !== 'plain_iron_arrows'); }],
    ['B5', 'a food listed as needing no store row while one stands behind it', (d) => { d.noPartner = { ...d.noPartner, cooked_trout: 'a stale reason that is long enough' }; }],
    ['B5', 'a reason for a line that is no supply', (d) => { d.noPartner = { ...d.noPartner, not_a_supply: 'a reason for an item nobody packs' }; }],
    ['B2', 'Bronze Arrows with no store row again (the free rung)', (d) => { d.basics = d.basics.filter((b) => b.id !== 'plain_bronze_arrows'); }],
    ['B2', 'an arrow that costs no shot again (the free rung)', (d) => { d.items = { ...d.items, bronze_arrows: { ...d.items.bronze_arrows, ammoPerShot: 0 } }; }],
    ['B2', 'a shop rune no ability spends', (d) => { d.basics = d.basics.concat([{ id: 'plain_scored_fire_rune', kind: 'ammo', n: 'Plain Scored Fire Rune', partner: 'scored_fire_rune', price: 24 }]); }],
    ['B2', 'Flame Strike\'s rune with no store row (live 10-21: Flame Strike unusable)', (d) => { d.basics = d.basics.filter((b) => b.id !== 'plain_fire_rune'); }],
    ['B2', 'a store food served by hunt tier again', (d) => { withBasic(d, 'salted_shrimp', { tiers: [1] }); }],
    ['B4', 'the Counter sells Cooked Shrimp again (seed.cooked_shrimp, 50 g for 5: 1.25 g a point under the 2.3 g Salted Shrimp)', (d) => {
      d.offers = [...d.offers, { id: 'seed.cooked_shrimp', table: 'seed',
        cost: [{ kind: 'currency', id: 'gold', amount: 50 }], grant: [{ kind: 'item', id: 'cooked_shrimp', amount: 5 }] }];
    }],
    ['B3', 'a big shop heal cheaper per point than a small one (Lobster 3.3 g vs Trout 4.0 g)', (d) => { withBasic(d, 'salted_lobster', { price: 60 }); }],
    ['M1', 'a drink batch that vends over 5x its crop', (d) => { d.drinks = { ...d.drinks, turnip_juice: { ...d.drinks.turnip_juice, v: 100 } }; }],
    ['M1', 'a staged drink with no recipe', (d) => { d.drinkRecipes = d.drinkRecipes.filter((r) => r.output !== 'pumpkin_cider'); }],
    ['L1', 'the food cooldown back at 1 s', (d) => { d.consumable = Object.freeze({ ...CONSUMABLE_RULES, laneMs: 1000 }); }],
    ['R1', 'a target-mode table left unfrozen', (d) => { d.targets = { ...TARGET_MODES }; }],
    ['R2', 'the default hero eats only under 30%', (d) => { d.consumable = Object.freeze({ ...CONSUMABLE_RULES, foodBelowPct: 30 }); }],
    ['R2', 'a hunt stops for lack of stock by default', (d) => { d.onEmpty = { ...ON_EMPTY, default: 'end' }; }],
    ['S2', 'raw food listed as a heal', (d) => { d.rows = [...d.rows, ['heal', 'trout', true]]; }],
    ['S5', 'a supply item left off the list', (d) => { d.rows = d.rows.filter((r) => r[1] !== 'cooked_trout'); }],
    ['S6', 'whetstones made essential', (d) => { d.rows = d.rows.map((r) => (r[1] === 'iron_whetstone' ? ['ammo', r[1], true] : r)); }],
    ['S8', 'a buff type sorted nowhere', (d) => { d.combatBuffs = COMBAT_BUFF_TYPES.filter((t) => t !== 'damage'); }],
    ['H1', 'a walk that is not a whole tick', (d) => { d.hunts = d.hunts.map((h, i) => (i ? h : { ...h, travelS: 15 })); }],
    ['H1', 'the sewer keeps its old name', (d) => { d.hunts = d.hunts.map((h) => (h.id === 'millrace_sewer' ? { ...h, name: 'Millrace Sewer' } : h)); }],
    ['H1', 'a walk back before the town has destinations', (d) => { d.hunts = d.hunts.map((h, i) => (i ? h : { ...h, travelS: 30 })); }],
    ['G1', 'a suggested bag with a parked feast', (d) => {
      const g = d.guides.mill_cellar; d.guides = { ...d.guides, mill_cellar: { ...g, melee: { ...g.melee, buff: { id: 'vegetable_stew', qty: 4 } } } };
    }],
    ['G1', 'a mage bag with no drinks', (d) => {
      const g = d.guides.ridge_camp; d.guides = { ...d.guides, ridge_camp: { ...g, magic: { heal: g.magic.heal, ammo: g.magic.ammo } } };
    }],
    ['L1', 'a falls limit is back', (d) => { d.limits = { ...SESSION_LIMITS, falls: { min: 1, max: 6, default: 4 } }; }],
    ['C1', 'the end order shuffled', (d) => { d.endOrder = ['party_member_died', 'died', ...END_ORDER.slice(2)]; }],
    ['C1', 'Vigour ends a hunt again', (d) => { d.endOrder = END_ORDER.map((r) => (r === 'stamina' ? 'vigour' : r)); }],
    ['C1', 'stamina never ends a hunt', (d) => { d.endOrder = END_ORDER.filter((r) => r !== 'stamina'); }],
    ['C1', 'a "(s)" plural hack in end copy', (d) => { d.endCopy = { ...END_REASON_COPY, died: { one: 'You died {n} time(s).' } }; }],
  ];
  let missed = 0;
  for (const [code, name, plant] of mutants) {
    const d = REAL();
    try {
      plant(d);
      const fails = check(d);
      const hit = fails.some((x) => x.startsWith(code + ' '));
      console.log(`  ${hit ? 'RED (good)' : 'MISSED    '} ${code} ${name}${hit ? '' : ' — fails: ' + fails.join(' | ')}`);
      if (!hit) missed++;
    } finally {
      delete ITEMS[PLANT];
    }
  }
  const after = check(REAL());
  if (after.length) { console.error('SELFTEST: a plant leaked:\n  ' + after.join('\n  ')); process.exit(2); }
  console.log(`supplies-catalogue --selftest: ${mutants.length} mutants, ${missed} missed`);
  process.exit(missed ? 1 : 0);
}

const isMain = isEntryModule(import.meta.url);
if (isMain) {
  try {
    if (process.argv.includes('--selftest') || process.argv.includes('--mutate')) selftest();
    const fails = check(REAL());
    if (fails.length) {
      console.error('supplies-catalogue: RED');
      fails.forEach((x) => console.error('  ✗ ' + x));
      process.exit(1);
    }
    const n = (k) => SUPPLY_ROWS.filter((r) => r[0] === k).length;
    console.log(`supplies-catalogue: OK — ${SUPPLY_ROWS.length} packed supplies (${n('heal')} heal, ${n('ammo')} ammo, ${n('buff')} parked buff) `
      + `+ ${MANA_SUPPLY_ROWS.length} staged drinks; ${BASIC_SUPPLIES.length} shop supplies paid per use; ${Object.keys(TARGET_MODES).length} target modes; `
      + `default preset valid; ${HUNTS.length} hunts with walks and melee/ranged/magic bags; `
      + `${END_ORDER.length} end reasons and ${RULING_EVENTS.length} timeline events with copy`);
  } catch (e) {
    console.error('supplies-catalogue: HARNESS ERROR — ' + (e && e.stack || e));
    process.exit(2);
  }
}
