// tools/balance-sim/played.mjs — THE PLAYED PROFILE: how real players set a hero up, where the harness's default hero differs.
//
// WHY (lane/d-balance-audit, 2026-11-19, measured by calibrate.mjs on the ten recorded hunts of 2026-11-17 and 11-18): the harness's default hero (the ladder kit, the
// role's default rules, every supply bought at the store) played in the seats of real hunts killed 0.55-0.83x as fast as the recorded
// heroes, took 1.4-2.4x the damage, paid 3-10x the store gold and its Deadly fours died 0.5-6.5 times an hour where the recorded Deadly parties died 0 times in
// 174 hero-hours. Swapping one recorded field at a time into the harness hero named three causes, and this file answers each one:
//   BAR   every recorded role casts rune spells from its bar (the sword's Flame Strike and Challenge, the bow's Flame Volley, the Mage's
//         Fireball + Hoarfrost with no mana gate, the Healer's Spring Tide, Circle of Renewal and Protective Ward), on store runes of the
//         tier its Magic allows. The default rules (rule-subjects.js ROLE_RULES) cast none of the melee or bow spells.
//   KIT   recorded heroes wear two rings, earrings, a necklace and a cloak, and spend whetstones and tier arrows. The ladder kit wore none.
//   STOCK recorded heroes carry their own runes, arrows and food and buy little: the harness bought every use at the store.
// SKILLS are the fourth cause and are NOT answered here (a cell's skills are a career's to carry: cell.skillsBySeat / startBySeat): the
// harness's "every combat skill at the hero's Level" is 10-15 levels LOW for a lone hero who used the Training Yard (Level 26: Melee 36,
// Defense 32) and 15 levels HIGH for a hero levelled in a Deadly party (Level 72: main skill 56-59, a caster's Defense 14-24).
//
// A cell asks for it with `profile: 'played'` (cell.mjs). Nothing here is a combat number: slots name abilities and items by id.
// PURE ESM. Data only. Imports only the rune gates (src/data/runes.js) and the move rows (src/data/abilities.js: playedSlot's rune family).
import { versionLevel } from '../../src/data/runes.js';
import { ABILITIES } from '../../src/data/abilities.js';

/* The store rune a slot names at a Magic level: a spell's version N casts at the tier's Magic gate (runes.js versionLevel over core-model.js
   SUPPLY_GATES.magic, 1 / 8 / 15 / 39 / 71: each tier at the Level the old careers reached it, the designer's ruling 29 section 7 item 10).
   Read, never typed: a typed copy of the old gates (1 / 15 / 30 / 45 / 60) put the harness's Level 60 mage a rune tier deeper than the
   game's gates do once skills ran on the Level clock (lane/skills-time-parity, EL-KIT 0.29 -> 0.35). */
export const RUNE_TIERS = Object.freeze(['graven', 'carved', 'etched', 'scored', 'chalked'].map((t, i) => [versionLevel(5 - i), t]));
export const runeTierAt = (magic) => (RUNE_TIERS.find(([lv]) => magic >= lv) || RUNE_TIERS[RUNE_TIERS.length - 1])[1];
/* HOW REAL PLAYERS BUY RUNES (docs/design/balance-program/11-krell-hunt-2026-11-20.md section 4, 51-baseline.md F5): "the mage and the healer
   buy Carved and Etched runes and not Graven, and the healer heals on the cheapest water rune". `rule` 'real': every rune spell one tier under
   the tier the hero's Magic allows, a Healer's water spells (its heals) on the cheapest water rune; 'allowed' (a BiS hero, and the old rule):
   the tier its Magic allows. */
export const SHOPPING = Object.freeze(['real', 'allowed']);
export function shoppingTier(role, family, magic, rule = 'allowed') {
  if (!SHOPPING.includes(rule)) throw new Error('played: no shopping rule ' + rule);
  const allowed = runeTierAt(magic || 1);
  if (rule === 'allowed') return allowed;
  if (role === 'healer' && family === 'water') return RUNE_TIERS[RUNE_TIERS.length - 1][1];
  const i = RUNE_TIERS.findIndex(([, t]) => t === allowed);
  return RUNE_TIERS[Math.min(RUNE_TIERS.length - 1, i + 1)][1];
}
const storeRune = (family, tier) => (tier === 'chalked' ? `plain_${family}_rune` : `plain_${tier}_${family}_rune`);
const ownRunes = (family) => RUNE_TIERS.map(([, t]) => `${t}_${family}_rune`).reverse();
const spellOn = (id, family, tier, conditions = []) => ({ id: 'p_' + id, join: 'and', conditions,
  action: { id, type: 'ability', own: ownRunes(family), store: storeRune(family, tier), onEmpty: 'store' } });
const move = (id, conditions = []) => ({ id: 'p_' + id, join: 'and', conditions, action: { id, type: 'ability' } });
const eat = (id, pct, key = 'p_food') => ({ id: key, join: 'and', action: { id, type: 'consume' }, conditions: [{ op: 'lt', value: pct, metric: 'self_hp_pct' }] });
const drink = (id, pct) => ({ id: 'p_drink', join: 'and', action: { id, type: 'consume' }, conditions: [{ op: 'lt', value: pct, metric: 'self_mana_pct' }] });
const AOE = (n) => [{ op: 'gte', value: n, metric: 'enemies_in_aoe' }];

/**
 * The bar a recorded hero of `role` runs (the recorded bars' slots, in their order; the food, drink and rune tier are the hero's own).
 * o: { magic (the hero's Magic level), food (own cooked food id), storeFood, storeDrink, arrows (the ammo it shoots, a Ranger's),
 * tierOf (family -> the store rune tier its spells cast on: shoppingTier; absent, the tier the Magic allows) }.
 */
export function playedBar(role, o) {
  const t0 = runeTierAt(o.magic || 1);
  const tierOf = typeof o.tierOf === 'function' ? o.tierOf : () => t0;
  /* `t` (null) asks the shopping rule for the spell's family; a slot that names its own tier (the barrier on Chalked) keeps it */
  const t = null;
  const spell = (id, family, tier, conditions = []) => spellOn(id, family, tier || tierOf(family), conditions);
  const food = [o.food ? eat(o.food, 45) : null, o.storeFood ? eat(o.storeFood, 45, 'p_food_store') : null, o.storeDrink ? drink(o.storeDrink, 30) : null].filter(Boolean);
  if (role === 'tank' || role === 'melee_dps') {
    /* THE SPELL RULE (lane/c-spell-rule, Tyler 2026-11-21): Cleave merged into Turning Cut (32-2), so the recorded heroes' two-monster
       button is Turning Cut at 2; the axes lost Power Strike (32-3), so their strike is Rend on its own Rupture runes. */
    return [move('challenge'), move('turning_cut', AOE(2)), spell('flame_strike', 'fire', t), spell('rend', 'rupture', t), move('power_strike'),
      move('mend', [{ op: 'lt', value: 50, metric: 'self_hp_pct' }]), ...food];
  }
  if (role === 'ranger') {
    return [spell('flame_volley', 'fire', t, AOE(2)), move('raking_shot', AOE(2)), move('hunters_mark'), move('precision_shot'), ...food,
      ...(o.arrows ? [{ id: 'p_arrows', join: 'and', conditions: [], action: { id: o.arrows, type: 'attack_with_item' } }] : [])];
  }
  if (role === 'mage') {
    return [spell('fireball', 'fire', t, AOE(2)), spell('hoarfrost', 'ice', t, AOE(2)), spell('frost_lance', 'ice', t),
      spell('arcane_barrier', 'earth', 'chalked', [{ op: 'lt', value: 85, metric: 'self_hp_pct' }]), ...food];
  }
  if (role === 'healer') {
    return [spell('green_sickness', 'poison', t, AOE(2)), spell('undertow', 'water', t),
      spell('spring_tide', 'water', t, [{ op: 'lt', value: 85, metric: 'party_hp_pct' }, { op: 'eq', value: true, metric: 'in_fight' }, { op: 'gte', value: 30, metric: 'self_mana_pct' }]),
      spell('circle_of_renewal', 'water', t, [{ op: 'gte', value: 2, metric: 'allies_below', subject: 'under_90' }]),
      spell('greater_mend', 'water', t, [{ op: 'lt', value: 80, metric: 'ally_hp_pct', subject: 'lowest' }]),
      spell('protective_ward', 'earth', t, [{ op: 'lt', value: 95, metric: 'ally_hp_pct', subject: 'lowest' }]),
      move('mend', [{ op: 'lt', value: 50, metric: 'self_hp_pct' }]), ...food];
  }
  return food;
}

/**
 * ONE PLAYED SLOT FOR MOVE `id`, a move the recorded bars never cast (a Lab cell adds it: a Signature's own move, Frost Slam or Shelter on the
 * tank, lane/signatures-batch-2; cell.mjs addMovesBySeat): a rune spell on its family's store rune at the shopping tier, as playedBar writes
 * its own, else a plain move, with no conditions: a hero wearing a Signature for that move casts it whenever it is ready (Shelter's own
 * trigger, two allies under 80%, left the reference four on Krell's Hold playing the identical hunt with Shelter and without it).
 * o: { magic, tierOf } as playedBar's.
 */
export function playedSlot(id, o) {
  const row = ABILITIES[id];
  if (!row) throw new Error('played: no move ' + id);
  const cond = [];
  const fam = typeof row.rune === 'string' ? row.rune.replace(/^chalked_/, '').replace(/_rune$/, '') : null;
  if (!fam) return move(id, cond);
  const tierOf = o && typeof o.tierOf === 'function' ? o.tierOf : () => runeTierAt((o && o.magic) || 1);
  return spellOn(id, fam, tierOf(fam), cond);
}

/* The hunt options recorded heroes run (the action set's own row): press the fight, follow the party's target, stand at the role's range. */
export const PLAYED_OPTIONS = Object.freeze({
  tank: Object.freeze({ chase: true, stance: 'offensive', distance: 1, target_mode: 'follow' }),
  melee_dps: Object.freeze({ chase: true, stance: 'offensive', distance: 1, target_mode: 'follow' }),
  ranger: Object.freeze({ chase: true, stance: 'offensive', distance: 4, target_mode: 'follow' }),
  mage: Object.freeze({ chase: true, stance: 'offensive', distance: 6, target_mode: 'follow' }),
  healer: Object.freeze({ chase: true, stance: 'offensive', distance: 3, target_mode: 'follow' }),
});

/* The rune families a role's played bar spends (its carried stock, when the cell's supply is 'own'). */
export const PLAYED_RUNES = Object.freeze({ tank: ['fire'], melee_dps: ['fire', 'rupture'], ranger: ['fire'], mage: ['fire', 'ice', 'earth'], healer: ['poison', 'water', 'earth'] });
