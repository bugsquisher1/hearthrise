// ════════════════════════════════════════════════════════════════════════
// src/shell/cast-facts.js — WHAT A SLOT'S NEXT USE SPENDS AND LANDS, FOR THIS HERO.
//
// Tyler 2026-11-08: a Fireball slot set to the store's Scored Fire Rune showed version I's 25 mana and 7–12
// damage while the engine casts version II at 30 mana and about 1.7 times as hard. Every screen that shows
// what a slot costs or lands reads it here, by the engine's own rule (src/core/hunt/abilities.js runeFor,
// suppliesFor, firstUsable) on the engine's own data functions (abilities.js versionOf and outputPm):
//   the rune      of the spell's family: the highest tier the hero carries whose version its level in the
//                 spell's skill has unlocked; else, only when the slot names it and the store is on, exactly
//                 that store rune (cast at the store's share, BASIC_EFFECT_SHARE)
//   the version   the rune's tier: its mana (never more with level) and its output, permille of the row's
//                 numbers at the hero's level (outputPm), the store's share on top
//   the cost line "Cost: 30 mana · 1 Scored Fire Rune (8 g)", "(you have 12)" or "(none left)" (Tyler
//                 2026-11-08, "Yes, cost line only"), the same for food, drink and ammo without the mana
// Every input is the server's: the bag (carriedOf), the store rows (hunt_settings.store), the skills (skillsOf)
// and the supply setting (hunt_settings). Display only: nothing here gates or spends anything.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES, abilitySkill, versionOf, outputPm } from '../data/abilities.js?v=0.2.111';
import { BASIC_EFFECT_SHARE } from '../data/supply-basics.js?v=0.2.111';
import { RUNE_FAMILIES, runeTierOf, versionLevel } from '../data/runes.js?v=0.2.111';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.111';
import { ATTACK_KINDS } from '../data/condition-metrics.js?v=0.2.111';
import { ITEMS } from '../data/items.js?v=0.2.111';
import { isRune } from '../data/supplies.js?v=0.2.111';
import { HUNT_ROLES, shootsItem } from '../data/hunt-roles.js?v=0.2.111';
import { ammoPerShot } from '../core/ammo.js?v=0.2.111';
import { itemName, skillName } from './widgets/bits.js?v=0.2.111';
import { whole } from '../render/format.js?v=0.2.111';
import { t } from '../render/player-text.js?v=0.2.111';

/* The store's share in permille, as the engine rounds it (abilities.js BASIC_PM). */
const STORE_PM = Math.round(BASIC_EFFECT_SHARE * 1000);
const qtyOf = (bag, id) => (bag || []).reduce((n, l) => (l && l.id === id ? n + (Number(l.qty) || 0) : n), 0);
/* May the store supply now (action-rules.js storeAllowed)? With no settings read (a catalogue list), the default: yes. */
const storeOn = (set) => !set || set.supplySource === 'store' || set.onEmpty === 'switch';
const priced = (r) => !!r && Number.isInteger(r.price) && r.price > 0;

/**
 * THE CAST `a` (an ability slot's action, its `store` the store rune it names) MAKES FOR THIS HERO:
 * { row, version, level, skill, pm, mana, rune }. `ctx` = { bag, store, skills, set }, all the server's. `rune` is
 * null for a spell that spends none, else { id, name, source: 'own' | 'store' | 'none', have, price }. `level` is null
 * until the server has sent the skills: the numbers are then version I's at level 1 (the version note says so).
 */
export function castOf(a, ctx) {
  const row = a && a.type === 'ability' ? ABILITIES[a.id] : null;
  if (!row) return null;
  const c = ctx || {};
  const skill = abilitySkill(row);
  const s = c.skills && c.skills[skill];
  const level = s && Number.isInteger(s.level) ? s.level : null;
  const lv = level === null ? 1 : level;
  let version = 1; let share = 1000; let rune = null;
  if (row.rune) {
    const fam = ITEMS[row.rune] ? ITEMS[row.rune].family : null;
    /* own runes first: the highest tier unlocked (a tie in tier to the lower id, as the engine walks the sorted bag) */
    let best = null;
    for (const l of (c.bag || []).slice().sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
      const tier = l && l.qty > 0 ? runeTierOf(ITEMS[l.id]) : 0;
      if (!tier || ITEMS[l.id].family !== fam || (level !== null && level < versionLevel(tier))) continue;
      if (!best || tier > best.tier) best = { id: l.id, tier };
    }
    /* then exactly the store rune the slot names, of the family, while the store is on (never a cheaper one) */
    const named = !best && storeOn(c.set) && typeof a.store === 'string' ? (c.store || []).find((r) => r.id === a.store) : null;
    const tier = named && priced(named) && ITEMS[named.partner] && ITEMS[named.partner].family === fam ? runeTierOf(ITEMS[named.partner]) : 0;
    if (best) { version = best.tier; rune = { id: best.id, name: itemName(best.id), source: 'own', have: qtyOf(c.bag, best.id), price: null }; }
    else if (tier) { version = tier; share = STORE_PM; rune = { id: named.id, name: itemName(named.id), source: 'store', have: 0, price: named.price }; }
    else {
      const have = (c.bag || []).filter((l) => l && isRune(ITEMS[l.id]) && ITEMS[l.id].family === fam).reduce((n, l) => n + (Number(l.qty) || 0), 0);
      rune = { id: null, name: fam && RUNE_FAMILIES[fam] ? t('bar.family_rune', { family: RUNE_FAMILIES[fam].label }) : itemName(row.rune), source: 'none', have, price: null };
    }
  }
  return { row, version, level, skill, pm: Math.floor((outputPm(row, version, lv) * share) / 1000), mana: versionOf(row, version).mana, rune };
}

/** A row's number `n` at `pm` permille, exactly as the engine lands it (abilities.js effect `scaled`, damage.js `mult`). */
export function landed(n, pm) {
  return pm === 1000 ? n : Math.floor((n * pm) / 1000);
}

/* One supply part of the cost line: "1 Scored Fire Rune (8 g)", "(you have 12)", "(none left)"; a shot "1 shot of …". */
function supplyPart(name, source, have, price, shot) {
  const item = name, n = whole(have);
  if (shot) {
    if (source === 'free') return t('bar.cost_shot_free', { item });
    if (source === 'store') return t('bar.cost_shot_price', { item, price });
    return have > 0 ? t('bar.cost_shot_have', { item, n }) : t('bar.cost_shot_none', { item });
  }
  if (source === 'store') return t('bar.cost_price', { item, price });
  return have > 0 ? t('bar.cost_have', { item, n }) : t('bar.cost_none', { item });
}

/* What one use of a food, drink or attack slot spends: { name, source, have, price, shot }, or null (it spends nothing:
   a loaded slot with nothing loaded, a shot the worn weapon can't loose, a whetstone or a rune: hunt-roles.js shootsItem,
   the engine's rule). Own stock first, then the store's row behind it. */
function stockOf(a, c, worn) {
  const rows = c.store || [];
  if (a.type === 'consume') {
    const cr = CONSUMABLES[a.id];
    if (cr && cr.source === 'store') {
      const r = rows.find((x) => x.id === a.id);
      return priced(r) && storeOn(c.set) ? { name: itemName(a.id), source: 'store', price: r.price } : { name: itemName(a.id), source: 'none', have: 0 };
    }
    return { name: itemName(a.id), source: 'own', have: qtyOf(c.bag, a.id) };
  }
  const id = Object.prototype.hasOwnProperty.call(ATTACK_KINDS, a.id) ? worn : a.id;
  /* the hero's weapon (the server's role) must shoot it; with no settings read, some weapon must */
  if (!id || !(c.set ? shootsItem(c.set.role, ITEMS[id]) : Object.keys(HUNT_ROLES).some((r) => shootsItem(r, ITEMS[id])))) return null;
  const have = qtyOf(c.bag, id);
  if (have > 0) return { name: itemName(id), source: ammoPerShot(ITEMS[id]) === 0 ? 'free' : 'own', have, shot: true };
  const r = storeOn(c.set) ? rows.find((x) => x.partner === id) : null;
  return priced(r) ? { name: itemName(r.id), source: 'store', price: r.price, shot: true } : { name: itemName(id), source: 'none', have: 0, shot: true };
}

/**
 * THE COST LINE of `a` for this hero: "Cost: 30 mana · 1 Scored Fire Rune (8 g)", "Cost: 1 Salted Shrimp (14 g)",
 * "Cost: 1 shot of Steel Arrows (you have 26)", "No mana" for a free spell, or '' for a slot that spends nothing.
 * `ctx` = castOf's, plus `worn`: the ammo slot's item (a loaded slot's shot).
 */
export function costLine(a, ctx) {
  if (!a || !a.id) return '';
  const c = ctx || {};
  if (a.type === 'ability') {
    const k = castOf(a, c);
    if (!k) return '';
    const parts = (k.mana ? [t('bar.cost_mana', { mana: k.mana })] : [])
      .concat(k.rune ? [supplyPart(k.rune.name, k.rune.source, k.rune.have, k.rune.price, false)] : [], k.row.ammo ? [t('bar.cost_ammo', { ammo: k.row.ammo })] : []);
    return parts.length ? t('bar.cost_line', { parts: parts.join(' · ') }) : t('bar.cost_no_mana');
  }
  const s = stockOf(a, c, c.worn);
  return s ? t('bar.cost_line', { parts: supplyPart(s.name, s.source, s.have, s.price, s.shot) }) : '';
}

/** Which numbers a cast's facts are for: "Numbers for the Scored Fire Rune at Magic 20." ('' for a row that never changes). */
export function versionWords(k) {
  if (!k || !(k.row.rune || Number.isInteger(k.row.lvPm))) return '';
  const vars = { skill: skillName(k.skill), level: k.level === null ? 1 : k.level };
  if (!k.row.rune) return t('bar.numbers_at', vars);
  const name = k.rune && k.rune.source !== 'none' ? k.rune.name : itemName(k.row.rune);
  return t('bar.numbers_for', Object.assign(vars, { rune: name }));
}
