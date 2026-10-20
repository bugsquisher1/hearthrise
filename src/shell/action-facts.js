// ════════════════════════════════════════════════════════════════════════
// src/shell/action-facts.js — WHAT A BAR ACTION IS, IN PLAIN WORDS, FROM ITS CATALOGUE ROW.
//
// One home for the words the Configure action window and the bar's slot
// tooltip both show, so they can never disagree:
//   TABS / choicesFor   Spells (the abilities the worn weapon gives, by the
//                       server's `role`), Runes (rune ammo), Items (food and
//                       drink, own or "any" with the store behind it, and ammo)
//                       — the same ids the server accepts (src/core/hunt/
//                       conditions.js actionKnown), never a typed list
//   factsOf             type line, cost, cooldown, effect, requirement
//   supplyLines         own stock first, then the store per use at its price
//   conflictsOf         a slot that can NEVER fire because an earlier slot always
//                       wins, by the engine's own rule (pickSlot: slots in order,
//                       the first whose conditions pass AND that can act fires)
// Display only: every number is a catalogue row or the server's projection.
// ════════════════════════════════════════════════════════════════════════
import { CONSUME_KINDS, ATTACK_KINDS } from '../data/condition-metrics.js?v=0.2.13';
import { ABILITIES } from '../data/abilities.js?v=0.2.13';
import { CONSUMABLES, CONSUMABLE_RULES } from '../data/consumables.js?v=0.2.13';
import { SUPPLIES } from '../data/supplies.js?v=0.2.13';
import { STATUSES } from '../data/statuses.js?v=0.2.13';
import { HUNT_ROLES, WEAPON_ROLES } from '../data/hunt-roles.js?v=0.2.13';
import { WEAPON_WORDS } from '../data/hunt-hud.js?v=0.2.13';
import { defaultConditions } from '../core/hunt/conditions.js?v=0.2.13';
import { itemName, abilityName } from './widgets/bits.js?v=0.2.13';
import { storeOf, storeWords, conditionWords } from './bar-draft.js?v=0.2.13';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const secs = (ms) => (ms % 1000 ? (ms / 1000).toFixed(1) : String(ms / 1000));
const isRune = (id) => /_rune$/.test(id);
const KIND_NAME = Object.freeze({ food: 'Any food', drink: 'Any drink', loaded: 'The loaded ammo' });

/** The three tabs of the Configure action window. */
export const TABS = Object.freeze([['spells', 'Spells'], ['runes', 'Runes'], ['items', 'Items']]);

/** The tab an action belongs to. */
export function tabOf(a) {
  if (!a || a.type === 'ability') return 'spells';
  return a.type === 'attack_with_item' && isRune(a.id) ? 'runes' : 'items';
}

/** An action's player-facing name. */
export function actionName(a) {
  if (a.type === 'ability') return abilityName(a.id);
  return KIND_NAME[a.id] || itemName(a.id);
}

/** The choices of a tab: [{ type, id, name }], what the server accepts for that slot. */
export function choicesFor(tab, role) {
  const at = (type) => (id) => ({ type, id, name: actionName({ type, id }) });
  if (tab === 'spells') {
    const disc = role && HUNT_ROLES[role] ? HUNT_ROLES[role].discipline : null;
    return Object.values(ABILITIES).filter((a) => a.active && (!disc || a.disciplines.includes(disc))).map((a) => at('ability')(a.id));
  }
  const ammo = Object.values(SUPPLIES).filter((r) => r.kind === 'ammo').map((r) => r.id);
  if (tab === 'runes') return ammo.filter(isRune).map(at('attack_with_item'));
  return Object.keys(CONSUME_KINDS).map(at('consume'))
    .concat(Object.values(CONSUMABLES).filter((r) => r.source === 'own').map((r) => at('consume')(r.id)))
    .concat(Object.keys(ATTACK_KINDS).map(at('attack_with_item')))
    .concat(ammo.filter((id) => !isRune(id)).map(at('attack_with_item')));
}

/* The weapons that give a discipline, in words ("Sword or Shield"). */
function weaponsFor(disc) {
  const roles = Object.keys(HUNT_ROLES).filter((r) => HUNT_ROLES[r].discipline === disc);
  const w = Object.keys(WEAPON_ROLES).filter((k) => WEAPON_ROLES[k].some((r) => roles.includes(r))).map((k) => WEAPON_WORDS[k] || k);
  return w.length ? w.join(' or ') : disc;
}

const TARGET_LINE = Object.freeze({
  taunt: 'Taunt: pulls the monsters near you onto you.',
  mark: 'Mark: marks your current target.',
  enemy: 'Attack spell: casts on your current target.',
  area: 'Area spell: hits the monsters round your target.',
  cleave: 'Cleave: hits the monsters in front of you.',
  self: 'Self spell: casts on yourself.',
  ally: 'Heal: casts on the ally who needs it most.',
  party: 'Group heal: heals everyone near you.',
});

/**
 * What an action is: { type, cost, cooldown, effect[], requires } (absent fields
 * are null). All from catalogue rows.
 */
export function factsOf(a) {
  if (a.type === 'ability') {
    const r = ABILITIES[a.id];
    if (!r) return { type: null, cost: null, cooldown: null, effect: [], requires: null };
    const el = r.element ? ' ' + r.element : '';
    const effect = [];
    if (r.target === 'mark') effect.push('Your target takes ' + r.bonusPct + '% more damage for ' + secs(r.durMs) + ' s.');
    if (r.dmg) effect.push('Deals ' + r.dmg[0] + '–' + r.dmg[1] + el + ' damage' + (r.target === 'area' ? ' to each monster hit.' : r.maxHits ? ' to up to ' + r.maxHits + ' monsters.' : r.hits ? ', ' + r.hits + ' times.' : '.'));
    if (r.heal) effect.push('Heals ' + r.heal[0] + '–' + r.heal[1] + '.');
    if (r.shield) effect.push('A ' + r.shield + '-point shield.');
    if (r.status && STATUSES[r.status]) effect.push('Causes ' + STATUSES[r.status].name.toLowerCase() + '.');
    const cost = [r.mana ? r.mana + ' mana' : 'No mana'].concat(r.rune ? ['1 ' + itemName(r.rune)] : [], r.ammo ? [r.ammo + ' ammo'] : []).join(' · ');
    return { type: TARGET_LINE[r.target] || null, cost, cooldown: secs(r.cdMs) + ' s cooldown', effect, requires: 'Requires: ' + weaponsFor(r.disciplines[0]) + '.' };
  }
  if (a.type === 'consume') {
    const spread = 'Half lands at once, the rest over ' + secs(CONSUMABLE_RULES.overTimeMs) + ' s.';
    if (own(CONSUME_KINDS, a.id)) {
      const stat = a.id === 'drink' ? 'mana' : 'health';
      return { type: (a.id === 'drink' ? 'Drink' : 'Food') + ': your best ' + a.id + ' first, restoring ' + stat + '.', cost: null, cooldown: null, effect: [spread], requires: null };
    }
    const r = CONSUMABLES[a.id];
    if (!r) return { type: null, cost: null, cooldown: null, effect: [], requires: null };
    return { type: r.kind === 'drink' ? 'Drink: restores mana.' : 'Food: restores health.', cost: null, cooldown: null,
      effect: ['Restores ' + r.amount + (r.kind === 'drink' ? ' mana.' : ' health.'), spread], requires: null };
  }
  if (own(ATTACK_KINDS, a.id)) return { type: 'Ammo: your attacks use whatever you have loaded.', cost: null, cooldown: null, effect: [], requires: null };
  return { type: (isRune(a.id) ? 'Rune' : 'Ammo') + ': your attacks use it, one per shot.', cost: null, cooldown: null, effect: [], requires: null };
}

/** How many of an action the bag holds (a kind: every own line of it), from the server's inventory; null = not counted. */
export function carried(a, bag) {
  if (!bag || a.type === 'ability' || a.id === 'loaded') return null;
  const want = own(CONSUME_KINDS, a.id) ? a.id : null;
  if (want) return bag.filter((l) => CONSUMABLES[l.id] && CONSUMABLES[l.id].source === 'own' && CONSUMABLES[l.id].kind === want).reduce((n, l) => n + l.qty, 0);
  return (bag.find((l) => l.id === a.id) || { qty: 0 }).qty;
}

/** Where an action's uses come from: own stock first, then the store per use, and the supply setting. */
export function supplyLines(a, set, bag) {
  if (a.type === 'ability') return [];
  const st = storeOf(a);
  const n = carried(a, bag);
  const out = [];
  if (n !== null && n > 0) out.push('You carry ' + n + '. ' + (st ? 'Own stock first, ' + storeWords(st) + '.' : 'When they run out, this slot waits.'));
  else if (n !== null) out.push(st ? 'You carry none: ' + storeWords(st).replace(/^then /, '') + '.' : 'You carry none, so this slot waits.');
  else if (st) out.push('Own stock first, ' + storeWords(st) + '.');
  if (st && set && set.supplySource !== 'store' && set.onEmpty !== 'switch') out.push('This hero is set to end the hunt when its own stock runs out, so the store stays off.');
  if (!st && a.type === 'consume') out.push('Choose Any food or Any drink to fall back on the store.');
  return out;
}

/** A slot's setup in words: its conditions, or its own trigger when it has none. */
export function setupWords(w, set) {
  if (!w.conditions.length) {
    const d = defaultConditions(w, { foodBelowPct: set && set.foodPct, drinkBelowPct: set && set.drinkPct });
    return d.length ? 'No conditions: fires when ' + d.map(conditionWords).join(' and ') + '.' : 'Always (no conditions).';
  }
  return (w.conditions.length > 1 ? (w.join === 'or' ? 'Any of: ' : 'All of: ') : 'When ') + w.conditions.map(conditionWords).join('; ') + '.';
}

/* A slot's conditions as the engine tests them: its own, else its action's defaults. */
function effective(w, set) {
  return w.conditions.length ? w.conditions : defaultConditions(w, { foodBelowPct: set && set.foodPct, drinkBelowPct: set && set.drinkPct });
}
const condKey = (c) => JSON.stringify([c.metric, c.op, c.value, c.subject || null]);
/* A passes whenever B passes: A's conditions are all among B's (both "all of"), or A has none. */
function weaker(a, b, set) {
  const ca = effective(a, set), cb = effective(b, set);
  if (!ca.length) return true;
  if ((ca.length > 1 && a.join === 'or') || (cb.length > 1 && b.join === 'or')) return false;
  const keys = new Set(cb.map(condKey));
  return ca.every((c) => keys.has(condKey(c)));
}

/**
 * Which slots can never fire, and why: Map index -> { by: earlier index, why }.
 * The engine walks a lane's slots in order and fires the first that passes and can
 * act (conditions.js pickSlot), so a later slot never fires when an earlier one
 * (1) does the same action under conditions it always meets, or (2) is Any food /
 * Any drink under such conditions while it names one food or drink of that kind
 * (whenever that item is in the bag, the earlier slot has a line to use).
 */
export function conflictsOf(wires, set) {
  const out = new Map();
  wires.forEach((b, j) => {
    if (!b) return;
    for (let i = 0; i < j; i++) {
      const a = wires[i];
      if (!a || !weaker(a, b, set)) continue;
      const same = a.action.type === b.action.type && a.action.id === b.action.id;
      const kind = a.action.type === 'consume' && b.action.type === 'consume' && own(CONSUME_KINDS, a.action.id)
        && CONSUMABLES[b.action.id] && CONSUMABLES[b.action.id].kind === a.action.id;
      if (same || kind) {
        out.set(j, { by: i, why: 'Blocked by ' + actionName(a.action) + ' (slot ' + (i + 1) + '): ' + (same ? 'the same action, and it fires first whenever this one could.' : 'it uses your ' + a.action.id + ' first whenever this one could.') });
        break;
      }
    }
  });
  return out;
}

/**
 * WHY A SLOT CANNOT FIRE NOW, from the server's own facts and the catalogue
 * rules the server applies (hr_hunt_settings_view `usable`: the ability is
 * active, of the worn weapon's discipline, its rune in the bag; a consume or
 * attack slot: stock, or the store behind it under the supply setting):
 *   { code, text, glyph, strike }   or null when nothing stops it.
 * `strike` = the server would not fire it at all; a reason without strike
 * (mana short) only waits. Order: the first rule that fails is the one named.
 */
export function reasonOf(sl, set, bag, hero) {
  if (!sl || sl.empty) return null;
  const a = sl.action;
  if (a.type === 'ability') {
    const r = ABILITIES[a.id];
    if (!r) return { code: 'unknown', text: 'The server does not know this ability.', glyph: 'uiLock', strike: true };
    if (!r.active) return { code: 'inactive', text: 'Not in the game yet: ' + abilityName(a.id) + ' waits on its rune.', glyph: 'uiLock', strike: true };
    const role = set && set.role && HUNT_ROLES[set.role] ? HUNT_ROLES[set.role] : null;
    if (!role) return { code: 'weapon', text: 'No weapon worn: abilities come from the weapon you wield. Needs ' + weaponsFor(r.disciplines[0]) + '.', glyph: 'uiLock', strike: true };
    if (!r.disciplines.includes(role.discipline)) return { code: 'weapon', text: 'Your weapon can’t use this. Needs ' + weaponsFor(r.disciplines[0]) + '.', glyph: 'uiLock', strike: true };
    if (r.rune && !((bag || []).some((l) => l.id === r.rune && l.qty > 0))) return { code: 'rune', text: 'Needs a ' + itemName(r.rune) + ' in the bag for each cast; you have none.', glyph: 'uiChest', strike: true };
    if (sl.usable === false) return { code: 'server', text: 'The server says this cannot fire now.', glyph: 'uiLock', strike: true };
    if (hero && Number.isFinite(hero.mana) && r.mana > hero.mana) return { code: 'mana', text: 'Needs ' + r.mana + ' mana, you have ' + Math.floor(hero.mana) + '.', glyph: 'uiPotion', strike: false };
    return null;
  }
  if (sl.usable === false) return { code: 'server', text: 'The server says this cannot fire now.', glyph: 'uiLock', strike: true };
  const n = Number.isInteger(sl.count) && !own(CONSUME_KINDS, a.id) && !own(ATTACK_KINDS, a.id) ? sl.count : carried(a, bag);
  if (n === null || n > 0) return null;
  const st = storeOf(a);
  const storeOn = !!set && (set.supplySource === 'store' || set.onEmpty === 'switch');
  if (st && storeOn) return null;
  if (st) return { code: 'store_off', text: 'Out of stock, and this hero is set to end the hunt rather than buy from the store.', glyph: 'uiChest', strike: true };
  return { code: 'stock', text: 'Out of stock and no store fallback' + (a.type === 'consume' ? ': choose Any food or Any drink to buy as used.' : '.'), glyph: 'uiChest', strike: true };
}

/**
 * The earlier slot sharing this ability's cooldown group (the catalogue's `lane`,
 * src/data/abilities.js ABILITY_LANES — the group the engine locks after a cast),
 * in words, or null. Not a stop: this slot still fires while that one cools down.
 */
export function sharedCooldownOf(wires, i) {
  const b = wires[i];
  const rb = b && b.action.type === 'ability' ? ABILITIES[b.action.id] : null;
  if (!rb) return null;
  for (let k = 0; k < i; k++) {
    const a = wires[k];
    const ra = a && a.action.type === 'ability' ? ABILITIES[a.action.id] : null;
    if (ra && ra.lane === rb.lane) return 'Shares a cooldown with ' + abilityName(a.action.id) + ' (slot ' + (k + 1) + '), which fires first when both are ready.';
  }
  return null;
}
