// ════════════════════════════════════════════════════════════════════════
// src/shell/action-facts.js — WHAT A BAR ACTION IS, IN PLAIN WORDS, FROM ITS CATALOGUE ROW.
//
// One home for the words the Configure action window and the bar's slot
// tooltip both show, so they can never disagree:
//   TABS / choicesFor   Spells (the abilities the worn weapon gives, by the
//                       server's `role`), Runes (the spells a rune fuels), Food &
//                       drink (own, or the store's behind it) and Ammo (its own
//                       tab, Tyler 2026-10-25)
//                       — the same ids the server accepts (src/core/hunt/
//                       conditions.js actionKnown), never a typed list
//   factsOf             type line, cost, cooldown, effect, requirement
//   supplyLines         own stock first, then the store per use at its price
//   conflictsOf         a slot that can NEVER fire because an earlier slot always
//                       wins, by the engine's own rule (pickSlot: slots in order,
//                       the first whose conditions pass AND that can act fires)
// Display only: every number is a catalogue row or the server's projection.
// ════════════════════════════════════════════════════════════════════════
import { ATTACK_KINDS } from '../data/condition-metrics.js?v=0.2.77';
import { ABILITIES } from '../data/abilities.js?v=0.2.77';
import { aimsAtMonsters } from '../core/hunt/conditions.js?v=0.2.77';
import { CONSUMABLES, CONSUMABLE_RULES } from '../data/consumables.js?v=0.2.77';
import { STATUSES } from '../data/statuses.js?v=0.2.77';
import { HUNT_ROLES, ROLE_KEYS, shootsItem } from '../data/hunt-roles.js?v=0.2.77';
import { ITEMS } from '../data/items.js?v=0.2.77';
import { isRune } from '../data/supplies.js?v=0.2.77';
import { WEAPON_WORDS } from '../data/hunt-hud.js?v=0.2.77';
import { itemName, abilityName, runeWords, familyCount } from './widgets/bits.js?v=0.2.77';
import { storeOf, storeWords, conditionWords } from './bar-draft.js?v=0.2.77';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const secs = (ms) => (ms % 1000 ? (ms / 1000).toFixed(1) : String(ms / 1000));

/** The four tabs of the Configure action window: spells, the spells that spend a rune, food and drink, and ammo
    (Tyler 2026-10-25: ammo keeps its own tab, never mixed in with food and drink). */
export const TABS = Object.freeze([['spells', 'Spells'], ['runes', 'Runes'], ['food', 'Food & drink'], ['ammo', 'Ammo']]);

/** The tab an action belongs to (a rune spell under Runes; a shot under Ammo; food and drink under Food & drink). */
export function tabOf(a) {
  if (!a || a.type === 'ability') return a && ABILITIES[a.id] && ABILITIES[a.id].rune ? 'runes' : 'spells';
  return a.type === 'attack_with_item' ? 'ammo' : 'food';
}

/** An action's player-facing name. */
export function actionName(a) {
  if (a.type === 'ability') return abilityName(a.id);
  return own(ATTACK_KINDS, a.id) ? 'The loaded ammo' : itemName(a.id);
}

/* The worn sets that give a discipline, in words ("Shield or Bare hands"): every role key playing it (ROLE_KEYS). */
function weaponsFor(disc) {
  const w = Object.keys(ROLE_KEYS).filter((k) => ROLE_KEYS[k].discipline === disc).map((k) => WEAPON_WORDS[k] || k);
  return w.length ? w.join(' or ') : disc;
}

/* The worn sets that play any of `roles`, in words ("Bow or Crossbow"), each word once (ROLE_KEYS). */
function weaponsOf(roles) {
  const seen = new Set();
  const w = [];
  for (const k of Object.keys(ROLE_KEYS)) {
    if (!ROLE_KEYS[k].roles.some((r) => roles.includes(r))) continue;
    for (const word of String(WEAPON_WORDS[k] || k).split(' or ')) {
      if (!seen.has(word.toLowerCase())) { seen.add(word.toLowerCase()); w.push(word.charAt(0).toUpperCase() + word.slice(1)); }
    }
  }
  return w.join(' or ');
}

/* WHAT THE WORN WEAPON CAN SHOOT, in words: the engine's own rule (hunt-roles.js shootsItem; damage.js pickShot
   passes over any other item, Andy 2026-10-23: a bow loosed Copper Whetstones from an attack slot). '' when the
   hero's weapon (the server's role) can shoot the slot's item, or the slot is no item attack. A whetstone and a
   rune are no one's shot (the server refuses either in an attack slot: 2027-01-13-slot-truth.sql). */
function shotProblem(a, role) {
  if (!a || a.type !== 'attack_with_item' || own(ATTACK_KINDS, a.id)) return '';
  const it = ITEMS[a.id];
  if (shootsItem(role, it)) return '';
  if (it && it.reqSkill === 'melee') return 'A whetstone is not a shot: it sharpens a Melee weapon worn in the ammo slot. No weapon shoots it, so this slot never fires.';
  if (isRune(it)) return 'A rune isn’t a shot: it fuels your spells. No weapon shoots it, so this slot never fires.';
  const by = weaponsOf(Object.keys(HUNT_ROLES).filter((r) => shootsItem(r, it)));
  if (!by) return 'No weapon shoots this, so this slot never fires.';
  return (role && HUNT_ROLES[role] ? 'Your weapon can’t shoot this' : 'No weapon worn') + '. The slot stays struck until you wield a ' + by + '.';
}

/** "Your weapon can’t cast this. The slot stays struck until you wield a Shield." for a spell the hero's worn
    set (the server's discipline, hunt_settings.discipline) cannot cast, or the same for an attack item its
    weapon (the server's role, hunt_settings.role) cannot shoot; '' otherwise. A warning, never a refusal
    (art spec §8): the bar is configured for whichever weapon the hero wields next. */
export function weaponWarning(a, disc, role) {
  if (a && a.type === 'attack_with_item') return shotProblem(a, role);
  const r = a && a.type === 'ability' ? ABILITIES[a.id] : null;
  if (!r || r.universal || (disc && r.disciplines.includes(disc))) return '';
  return 'Your weapon can’t cast this. The slot stays struck until you wield a ' + weaponsFor(r.disciplines[0]) + '.';
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
    const cost = [r.mana ? r.mana + ' mana' : 'No mana'].concat(r.rune ? ['1 ' + runeWords(r.rune, 1)] : [], r.ammo ? [r.ammo + ' ammo'] : []).join(' · ');
    /* (an ally shield is a ward, not a heal; the universal self-heal needs no particular weapon) */
    const type = r.target === 'ally' && r.shield ? 'Ward: shields the ally who needs it most.' : TARGET_LINE[r.target] || null;
    return { type, cost, cooldown: secs(r.cdMs) + ' s cooldown', effect, requires: r.universal ? 'Requires: any weapon.' : 'Requires: ' + weaponsFor(r.disciplines[0]) + '.' };
  }
  if (a.type === 'consume') {
    const spread = 'Half lands at once, the rest over ' + secs(CONSUMABLE_RULES.overTimeMs) + ' s.';
    const r = CONSUMABLES[a.id];
    if (!r) return { type: null, cost: null, cooldown: null, effect: [], requires: null };
    return { type: r.kind === 'drink' ? 'Drink: restores mana.' : 'Food: restores health.', cost: null, cooldown: null,
      effect: ['Restores ' + r.amount + (r.kind === 'drink' ? ' mana.' : ' health.'), spread], requires: null };
  }
  if (own(ATTACK_KINDS, a.id)) return { type: 'Ammo: your attacks use whatever you have loaded.', cost: null, cooldown: null, effect: [], requires: null };
  /* (A rune is no ammo: it fuels spells only, Tyler 2026-10-23, so no attack slot names one.) */
  return { type: 'Ammo: your attacks use it, one per shot.', cost: null, cooldown: null, effect: [], requires: null };
}

/** How many of an action's ONE item the bag holds, from the server's inventory; null = not counted (a spell, the loaded ammo, a store item). */
export function carried(a, bag) {
  if (!bag || a.type === 'ability' || own(ATTACK_KINDS, a.id) || (CONSUMABLES[a.id] && CONSUMABLES[a.id].source === 'store')) return null;
  return (bag.find((l) => l.id === a.id) || { qty: 0 }).qty;
}

/** Where an action's uses come from: own stock first, then the store per use, and the supply setting. */
export function supplyLines(a, set, bag) {
  const st = storeOf(a, set && set.store);
  if (a.type === 'ability') {
    const r = ABILITIES[a.id];
    if (!r || !r.rune) return [];
    const have = familyCount(r.rune, bag);
    return ['You carry ' + have + ' ' + runeWords(r.rune, have) + '. ' + (st ? 'Own runes first, ' + storeWords(st) + '.' : 'Carried runes only: once they are gone this slot waits.')];
  }
  const n = carried(a, bag);
  const out = [];
  /* ONE item a slot (Tyler 2026-10-21): a store item is bought per use; a crafted one is your own stock only. */
  if (a.type === 'consume' && st && n === null) out.push('Bought from the store at ' + st.price + ' g each, paid as used.');
  else if (n !== null && n > 0) out.push('You carry ' + n + '. ' + (st && a.type !== 'consume' ? 'Own stock first, ' + storeWords(st) + '.' : 'When they run out, this slot waits and the next slot fires.'));
  else if (n !== null) out.push(st && a.type !== 'consume' ? 'You carry none: ' + storeWords(st).replace(/^then /, '') + '.' : 'You carry none, so this slot waits and the next slot fires.');
  else if (st) out.push('Own stock first, ' + storeWords(st) + '.');
  if (st && set && set.supplySource !== 'store' && set.onEmpty !== 'switch') out.push('This hero is set to end the hunt when its own stock runs out, so the store stays off.');
  return out;
}

/** A slot's setup in words: its conditions, exactly as the engine tests them (none: whenever it is ready,
    Tyler 2026-10-23: nothing hidden stands behind a slot). */
export function setupWords(w) {
  if (!w.conditions.length) return 'Always: whenever it is ready (no conditions).';
  return (w.conditions.length > 1 ? (w.join === 'or' ? 'Any of: ' : 'All of: ') : 'When ') + w.conditions.map(conditionWords).join('; ') + '.';
}

/* A slot that heals its own hero: a food, or a self spell that heals. */
function healsSelf(a) {
  if (a.type === 'consume') return !!CONSUMABLES[a.id] && CONSUMABLES[a.id].kind === 'food';
  return a.type === 'ability' && !!ABILITIES[a.id] && ABILITIES[a.id].target === 'self' && !!ABILITIES[a.id].heal;
}

/**
 * THE HEAL WARNING (designer ruling 2026-10-21, Andy's Sewer death): a heal slot whose HP % (its
 * own "My HP % below" test) is fewer HP than the biggest blow the hunt can land,
 * so one hit can kill before it fires. `blow` is pull-cycle.js biggestBlowOn, `hpMax` the server's.
 * '' when it is safe or a number is unknown.
 */
export function healWarning(w, set, blow, hpMax) {
  if (!w || !w.action || !w.action.id || !blow || !(hpMax > 0) || !healsSelf(w.action)) return '';
  const c = w.conditions.find((x) => x.metric === 'self_hp_pct' && (x.op === 'lt' || x.op === 'lte') && Number.isFinite(x.value));
  if (!c) return '';
  const at = Math.floor((hpMax * c.value) / 100);
  return at < blow.hit ? 'The ' + blow.name + ' can hit for ' + blow.hit + '. At ' + c.value + '% you have ' + at + ' HP, so one hit can kill you before you '
    + (w.action.type === 'consume' ? 'eat' : 'heal') + '.' : '';
}
const condKey = (c) => JSON.stringify([c.metric, c.op, c.value, c.subject || null]);
/* A passes whenever B passes: A is On, ignores no monster B fights, and A's conditions are all among B's
   (both "all of"), or A has none. An ignore list binds only a slot that aims at monsters (aimsAtMonsters):
   a food, drink, heal or shield slot never reads one. */
const ignoresOf = (s) => (aimsAtMonsters(s) && Array.isArray(s.ignore) ? s.ignore : []);
function weaker(a, b) {
  if (a.enabled === false) return false;
  const bIgnores = new Set(ignoresOf(b));
  if (ignoresOf(a).some((m) => !bIgnores.has(m))) return false;
  const ca = a.conditions, cb = b.conditions;
  if (!ca.length) return true;
  if ((ca.length > 1 && a.join === 'or') || (cb.length > 1 && b.join === 'or')) return false;
  const keys = new Set(cb.map(condKey));
  return ca.every((c) => keys.has(condKey(c)));
}

/**
 * Which slots can never fire, and why: Map index -> { by: earlier index, why }.
 * The engine walks a lane's slots in order and fires the first that passes and can
 * act (conditions.js pickSlot), so a later slot never fires when an earlier one
 * does the same action under conditions it always meets.
 */
export function conflictsOf(wires) {
  const out = new Map();
  wires.forEach((b, j) => {
    if (!b) return;
    for (let i = 0; i < j; i++) {
      const a = wires[i];
      if (!a || !weaker(a, b)) continue;
      if (a.action.type === b.action.type && a.action.id === b.action.id) {
        out.set(j, { by: i, why: 'Blocked by ' + actionName(a.action) + ' (slot ' + (i + 1) + '): the same action, and it fires first whenever this one could.' });
        break;
      }
    }
  });
  return out;
}

/* A SHOT SPELL'S SHOTS (Andy #62: Precision Shot and Flame Volley looked ready and never fired). A cast looses what
   the attack lane would (abilities.js castShotOf): the worn ammo, or the item of an ammo slot on the bar, that the worn
   weapon shoots, carried, or bought from its store row while the store is on. With none the engine never casts it. */
export function hasShot(set, bag, worn) {
  const storeOn = set.supplySource === 'store' || set.onEmpty === 'switch';
  const ids = new Set([worn]);
  for (const s of set.slots || []) if (s && !s.empty && s.enabled !== false && s.action.type === 'attack_with_item') ids.add(own(ATTACK_KINDS, s.action.id) ? worn : s.action.id);
  for (const id of ids) {
    if (!id || !shootsItem(set.role, ITEMS[id])) continue;
    if ((bag || []).some((l) => l && l.id === id && l.qty > 0)) return true;
    if (storeOn && storeOf({ type: 'attack_with_item', id }, set.store)) return true;
  }
  return false;
}

/**
 * WHY A SLOT CANNOT FIRE NOW, from the server's own facts and the catalogue
 * rules the server applies (hr_hunt_settings_view `usable`: the ability is
 * active, of the worn weapon's discipline, its rune in the bag; a consume or
 * attack slot: stock, or the store behind it under the supply setting):
 *   { code, text, glyph, strike }   or null when nothing stops it.
 * `strike` = the server would not fire it at all; a reason without strike
 * (mana short) only waits. Order: the first rule that fails is the one named.
 * `worn` is the worn ammo (the equipment's `ammo`): the attack lane's default shot (hasShot).
 */
export function reasonOf(sl, set, bag, hero, worn) {
  if (!sl || sl.empty) return null;
  const a = sl.action;
  if (a.type === 'ability') {
    const r = ABILITIES[a.id];
    if (!r) return { code: 'unknown', text: 'The server does not know this ability.', glyph: 'uiLock', strike: true };
    if (!r.active) return { code: 'inactive', text: 'Not in the game yet: ' + abilityName(a.id) + ' waits on its rune.', glyph: 'uiLock', strike: true };
    const disc = set && set.discipline ? set.discipline : null;
    if (!disc) return { code: 'weapon', text: 'No weapon worn: abilities come from the weapon you wield. Needs ' + (r.universal ? 'any weapon' : weaponsFor(r.disciplines[0])) + '.', glyph: 'uiLock', strike: true };
    if (!r.universal && !r.disciplines.includes(disc)) return { code: 'weapon', text: 'Your weapon can’t use this. Needs ' + weaponsFor(r.disciplines[0]) + '.', glyph: 'uiLock', strike: true };
    const storeOn = !!set && (set.supplySource === 'store' || set.onEmpty === 'switch');
    if (r.rune && !(familyCount(r.rune, bag) > 0) && !(storeOn && storeOf(a, set && set.store))) {
      const rune = runeWords(r.rune, 1);
      return { code: 'rune', text: 'Needs ' + (/^[aeiou]/i.test(rune) ? 'an ' : 'a ') + rune + ' for each cast: you carry none. Pick the store’s rune for this slot to buy one as used.', glyph: 'uiChest', strike: true };
    }
    if (r.ammo > 0 && set && !hasShot(set, bag, worn)) {
      return { code: 'ammo', text: 'Nothing loaded to shoot. Put arrows or bolts on the bar (Ammo): this spell casts them.', glyph: 'uiChest', strike: true };
    }
    if (sl.usable === false) return { code: 'server', text: 'The server says this cannot fire now.', glyph: 'uiLock', strike: true };
    if (hero && Number.isFinite(hero.mana) && r.mana > hero.mana) return { code: 'mana', text: 'Needs ' + r.mana + ' mana, you have ' + Math.floor(hero.mana) + '.', glyph: 'uiPotion', strike: false };
    return null;
  }
  /* A food or drink's struck state is the SERVER's (hr_hunt_settings_view `usable` + `why`), never the browser's own count. */
  if (a.type === 'consume' && sl.usable === false) {
    if (sl.why === 'none_left') return { code: 'none_left', text: 'None left: you carry no ' + itemName(a.id) + '. The next food or drink slot fires instead.', glyph: 'uiChest', strike: true };
    if (sl.why === 'store_off') return { code: 'store_off', text: 'This hero is set to end the hunt rather than buy from the store.', glyph: 'uiChest', strike: true };
  }
  /* An attack item the worn weapon cannot shoot never fires (the engine passes it over: damage.js pickShot). */
  const shot = shotProblem(a, set && set.role);
  if (shot) return { code: 'weapon', text: shot, glyph: 'uiLock', strike: true };
  if (sl.usable === false) return { code: 'server', text: 'The server says this cannot fire now.', glyph: 'uiLock', strike: true };
  if (a.type === 'consume') return null;
  const n = Number.isInteger(sl.count) && !own(ATTACK_KINDS, a.id) ? sl.count : carried(a, bag);
  if (n === null || n > 0) return null;
  const st = storeOf(a, set && set.store);
  const storeOn = !!set && (set.supplySource === 'store' || set.onEmpty === 'switch');
  if (st && storeOn) return null;
  if (st) return { code: 'store_off', text: 'Out of stock, and this hero is set to end the hunt rather than buy from the store.', glyph: 'uiChest', strike: true };
  return { code: 'stock', text: 'Out of stock, and the store does not sell it.', glyph: 'uiChest', strike: true };
}

/* THE CHALLENGE SLOT READS AS WORKING (bug #61; Coordinator ruling 2026-10-22): a tank that holds every engaged
   monster has nothing to Challenge (Tyler 10-16: it Challenges only what is not on it), so its taunt slot rests in a
   quiet state that says so, instead of looking broken. Not a stop: it fires the moment something leaves the tank. */
const HOLDING = Object.freeze({ code: 'holding', text: 'Holding the pack: nothing to Challenge.', glyph: 'uiShield', strike: false, quiet: true });

/** The slot's quiet "Holding" state: a taunt ability's slot while `holding` (live-engine.js holdsPack), else null. */
export function holdingReason(sl, holding) {
  if (!holding || !sl || sl.empty || sl.action.type !== 'ability') return null;
  const r = ABILITIES[sl.action.id];
  return r && r.target === 'taunt' ? HOLDING : null;
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
