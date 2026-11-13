// ════════════════════════════════════════════════════════════════════════
// src/shell/action-facts.js — WHAT A BAR ACTION IS, IN PLAIN WORDS, FROM ITS CATALOGUE ROW.
//
// One home for the words the Configure action window and the bar's slot
// tooltip both show, so they can never disagree:
//   TABS / choicesFor   Spells (every spell, a rune spell with its rune on its row:
//                       Tyler 2026-11-08 merged the Runes tab in), Food & drink
//                       (own, or the store's behind it) and Ammo (its own tab,
//                       Tyler 2026-10-25)
//                       — the same ids the server accepts (src/core/hunt/
//                       conditions.js actionKnown), never a typed list
//   factsOf             type line, cost line, cooldown, effect, requirement, for THIS hero: the rune
//                       version its slot casts at its level (cast-facts.js castOf, the engine's rule)
//   hoverLines          the bar hover: a short read-only subset of those facts (Tyler 2026-11-08)
//   conflictsOf         a slot that can NEVER fire because an earlier slot always
//                       wins, by the engine's own rule (pickSlot: slots in order,
//                       the first whose conditions pass AND that can act fires)
// Display only: every number is a catalogue row or the server's projection.
// ════════════════════════════════════════════════════════════════════════
import { ATTACK_KINDS } from '../data/condition-metrics.js?v=0.2.126';
import { ABILITIES } from '../data/abilities.js?v=0.2.126';
import { aimsAtMonsters, runeSupplyOf } from '../core/hunt/conditions.js?v=0.2.126';
import { CONSUMABLES, CONSUMABLE_RULES } from '../data/consumables.js?v=0.2.126';
import { STATUSES } from '../data/statuses.js?v=0.2.126';
import { HUNT_ROLES, ROLE_KEYS, shootsItem } from '../data/hunt-roles.js?v=0.2.126';
import { ITEMS } from '../data/items.js?v=0.2.126';
import { isRune } from '../data/supplies.js?v=0.2.126';
import { WEAPON_WORDS } from '../data/hunt-hud.js?v=0.2.126';
import { itemName, abilityName, runeWords } from './widgets/bits.js?v=0.2.126';
import { ownCount } from './rune-supply.js?v=0.2.126';
import { shortOf } from './item-lore.js?v=0.2.126';
import { storeOf, storeChoices, conditionWords } from './bar-draft.js?v=0.2.126';
import { castOf, costLine, landed } from './cast-facts.js?v=0.2.126';
import { listWords, whole } from '../render/format.js?v=0.2.126';
import { t } from '../render/player-text.js?v=0.2.126';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const secs = (ms) => (ms % 1000 ? (ms / 1000).toFixed(1) : String(ms / 1000));

/** The three tabs of the Configure action window: spells (a rune spell among them: Tyler 2026-11-08, "why bother having a
    'spells' and 'runes' section if rune selection already exists in the spells tab?"), food and drink, and ammo (Tyler
    2026-10-25: ammo keeps its own tab, never mixed in with food and drink). */
export const TABS = Object.freeze([['spells', t('bar.tab_spells')], ['food', t('bar.tab_food')], ['ammo', t('bar.tab_ammo')]]);

/** The tab an action belongs to (a spell under Spells; a shot under Ammo; food and drink under Food & drink). */
export function tabOf(a) {
  if (!a || a.type === 'ability') return 'spells';
  return a.type === 'attack_with_item' ? 'ammo' : 'food';
}

/** An action's player-facing name. */
export function actionName(a) {
  if (a.type === 'ability') return abilityName(a.id);
  return own(ATTACK_KINDS, a.id) ? t('bar.loaded_ammo') : itemName(a.id);
}

/* The worn sets that give a discipline, in words ("Shield or Bare hands"), each word once: every role key playing it (ROLE_KEYS). */
function weaponsFor(disc) {
  return wordsOfKeys(Object.keys(ROLE_KEYS).filter((k) => ROLE_KEYS[k].discipline === disc)) || disc;
}

/* The worn sets that play any of `roles`, in words ("Bow or Crossbow"), each word once (ROLE_KEYS). */
function weaponsOf(roles) {
  return wordsOfKeys(Object.keys(ROLE_KEYS).filter((k) => ROLE_KEYS[k].roles.some((r) => roles.includes(r))));
}

function wordsOfKeys(keys) {
  const seen = new Set();
  const w = [];
  for (const k of keys) {
    for (const word of String(WEAPON_WORDS[k] || k).split(' or ')) {
      if (!seen.has(word.toLowerCase())) { seen.add(word.toLowerCase()); w.push(word.charAt(0).toUpperCase() + word.slice(1)); }
    }
  }
  return w.join(' or ');
}

/* WHAT THE WORN WEAPON CAN SHOOT, in words: the engine's own rule (hunt-roles.js shootsItem; damage.js pickShot
   passes over any other item, Andy 2026-10-23: a bow loosed Copper Whetstones from an attack slot). '' when the
   hero's weapon (the server's role) can shoot the slot's item, or the slot is no item attack. A whetstone and a
   rune are no one's shot (the server refuses either in an attack slot: 2027-01-13-slot-truth.sql). A shot the weapon can
   loose whose skill the hero is under waits (abilities.js shotLine; SAY WHY, Tyler 2026-10-25): `skills` is the server's. */
function shotProblem(a, role, skills) {
  if (!a || a.type !== 'attack_with_item' || own(ATTACK_KINDS, a.id)) return '';
  const it = ITEMS[a.id];
  if (shootsItem(role, it)) { const need = shortOf(a.id, skills, null); return need ? t('bar.shot_waits', { need: need.text }) : ''; }
  if (it && it.reqSkill === 'melee') return t('bar.shot_whetstone');
  if (isRune(it)) return t('bar.shot_rune');
  const by = weaponsOf(Object.keys(HUNT_ROLES).filter((r) => shootsItem(r, it)));
  if (!by) return t('bar.shot_nobody');
  return t(role && HUNT_ROLES[role] ? 'bar.shot_wrong_weapon' : 'bar.shot_no_weapon', { weapons: by });
}

/** "Your weapon can’t cast this. It works once you hold a Shield." for a spell the hero's worn
    set (the server's discipline, hunt_settings.discipline) cannot cast, or the same for an attack item its
    weapon (the server's role, hunt_settings.role) cannot shoot or the hero's skill (`skills`, the server's) cannot use yet; '' otherwise.
    A warning, never a refusal (art spec §8): the bar is configured for whichever weapon the hero wields next. */
export function weaponWarning(a, disc, role, skills) {
  if (a && a.type === 'attack_with_item') return shotProblem(a, role, skills);
  const r = a && a.type === 'ability' ? ABILITIES[a.id] : null;
  if (!r || r.universal || (disc && r.disciplines.includes(disc))) return '';
  return t('bar.cast_wrong_weapon', { weapons: weaponsFor(r.disciplines[0]) });
}

/* THE ALONE CALLOUT (Tyler 2026-11-09: "Make that callout clear to the player"): a spell marked `alone` (src/data/abilities.js)
   casts only while no other living hero shares its hunt. Said on its card, its slot's tooltip and, in a party, on the slot (bar.alone). */

/**
 * WHY AN ALONE SPELL'S SLOT WAITS (the engine's own rule, src/core/hunt/abilities.js aloneIn): `alone` is false when another
 * hero shares the hunt (slot-waits.js whyFacts: the running prediction's world, else the server's party), so the slot greys.
 * Null for any other slot, or while the hero hunts alone.
 */
export function aloneReason(sl, alone) {
  const r = sl && !sl.empty && sl.action && sl.action.type === 'ability' ? ABILITIES[sl.action.id] : null;
  return r && r.alone && alone === false ? { code: 'alone', text: t('bar.alone'), glyph: 'uiPeople', strike: true } : null;
}

/** Configure action's line for a draft of an alone spell in a party of `party` heroes (bar.alone_party), else ''. */
export function aloneNote(action, party) {
  const r = action && action.type === 'ability' ? ABILITIES[action.id] : null;
  return r && r.alone && party > 1 ? t('bar.alone_party') : '';
}

/* The line for each spell target (bar.target_<target>). */
const TARGET_LINE = Object.freeze({
  taunt: 'bar.target_taunt', mark: 'bar.target_mark', enemy: 'bar.target_enemy', area: 'bar.target_area',
  cleave: 'bar.target_cleave', self: 'bar.target_self', ally: 'bar.target_ally', party: 'bar.target_party',
});

/* "Deals 4–9 fire damage to each monster hit." by the spell's shape: area, a cap on monsters, repeated hits, or one;
   its numbers at the cast's `pm` (cast-facts.js castOf), landed as the engine lands them. */
function damageLine(r, pm) {
  const shape = r.target === 'area' ? '_area' : r.maxHits ? '_max' : r.hits ? '_hits' : '';
  /** @type {Record<string, number|string>} */
  const v = { lo: landed(r.dmg[0], pm), hi: landed(r.dmg[1], pm) };
  if (r.element) v.element = r.element;
  if (shape === '_max') v.max = r.maxHits;
  if (shape === '_hits') v.hits = r.hits;
  return t('bar.effect_dmg' + shape + (r.element ? '_el' : ''), v);
}

/**
 * What an action is FOR THIS HERO: { type, cost, cooldown, numbers[], effect[], version, requires } (absent fields are
 * null). `numbers` are the lines a hover shows (damage, heal, shield, mark); `effect` is those and the status a cast
 * causes. A spell's mana and numbers are the version its slot casts at the hero's level (cast-facts.js castOf: the rune
 * it would spend, own first, then the store rune the slot names), and its cost line is the same cast's (costLine). `ctx` =
 * { bag, store, skills, set, worn }, all the server's; without them the numbers are version I's at level 1, as `version` says.
 * `alone` is an alone spell's callout (bar.alone), else null.
 */
export function factsOf(a, ctx) {
  const none = { type: null, cost: null, cooldown: null, numbers: [], effect: [], requires: null, alone: null };
  if (a.type === 'ability') {
    const k = castOf(a, ctx);
    if (!k) return none;
    const r = k.row;
    const numbers = [];
    if (r.target === 'mark') numbers.push(t('bar.effect_mark', { pct: r.bonusPct, secs: secs(r.durMs) }));
    if (r.dmg) numbers.push(damageLine(r, k.pm));
    if (r.heal) numbers.push(t('bar.effect_heal', { lo: landed(r.heal[0], k.pm), hi: landed(r.heal[1], k.pm) }));
    if (r.shield) numbers.push(t('bar.effect_shield', { points: landed(r.shield, k.pm) }));
    const effect = numbers.concat(r.status && STATUSES[r.status] ? [t('bar.effect_status', { status: STATUSES[r.status].name.toLowerCase() })] : []);
    /* (an ally shield is a ward, not a heal; the universal self-heal needs no particular weapon) */
    const type = r.target === 'ally' && r.shield ? t('bar.target_ward') : own(TARGET_LINE, r.target) ? t(TARGET_LINE[r.target]) : null;
    return { type, cost: costLine(a, ctx), cooldown: t('bar.cooldown', { secs: secs(r.cdMs) }), numbers, effect,
      requires: r.universal ? t('bar.requires_any') : t('bar.requires', { weapons: weaponsFor(r.disciplines[0]) }), alone: r.alone ? t('bar.alone') : null };
  }
  const cost = costLine(a, ctx) || null;
  if (a.type === 'consume') {
    const r = CONSUMABLES[a.id];
    if (!r) return none;
    const restores = t(r.kind === 'drink' ? 'bar.restores_mana' : 'bar.restores_health', { amount: r.amount });
    return Object.assign({}, none, { type: r.kind === 'drink' ? t('bar.type_drink') : t('bar.type_food'), cost,
      numbers: [restores], effect: [restores, t('bar.spread', { secs: secs(CONSUMABLE_RULES.overTimeMs) })] });
  }
  /* (A rune is no ammo: it fuels spells only, Tyler 2026-10-23, so no attack slot names one.) */
  return Object.assign({}, none, { type: own(ATTACK_KINDS, a.id) ? t('bar.type_loaded') : t('bar.type_ammo'), cost });
}

/**
 * THE BAR HOVER (Tyler 2026-11-08: "all of this should be decided in the configure actions, and simplified when hovering
 * the skill on the bar"): short and read-only, a SUBSET of Configure action's facts (factsOf, the same cast), never other
 * numbers. [{ text, cls }] in order: why it can't fire (only when it can't), an alone spell's callout, the cost line, its numbers for this hero and
 * version, its cooldown, one When line (only when it has conditions), and the slot that always fires first (only when one
 * does). `w` is the wire slot (wireSlot), `ctx` factsOf's, `why` slot-waits.js slotWhy's, `conflict` conflictsOf's entry.
 */
export function hoverLines(w, ctx, why, conflict) {
  const f = factsOf(w.action, ctx);
  const line = (text, cls) => (text ? { text, cls: cls || '' } : null);
  /* an alone spell says so before the hunt starts (Tyler 2026-11-09), once: in a party the why line already says it */
  const alone = f.alone && !(why && why.code === 'alone') ? line(f.alone, 'is-why') : null;
  return [why ? line(why.text, why.quiet ? 'is-why' : 'is-warn is-why') : null, alone, line(f.cost)]
    .concat(f.numbers.map((n) => line(n)), [line(f.cooldown), w.conditions.length ? line(setupWords(w), 'is-setup') : null, conflict ? line(conflict.why, 'is-warn') : null])
    .filter(Boolean);
}

/** How many of an action's ONE item the bag holds, from the server's inventory; null = not counted (a spell, the loaded ammo, a store item). */
export function carried(a, bag) {
  if (!bag || a.type === 'ability' || own(ATTACK_KINDS, a.id) || (CONSUMABLES[a.id] && CONSUMABLES[a.id].source === 'store')) return null;
  return (bag.find((l) => l.id === a.id) || { qty: 0 }).qty;
}

/* A slot's conditions in words, exactly as the engine tests them and as Configure action's picker reads them ("When it would
   hit at least 2 monsters."). Only a slot with conditions has the line: one with none fires whenever it is ready. */
function setupWords(w) {
  const conditions = listWords(w.conditions.map(conditionWords), Infinity, w.join === 'or' ? 'or' : 'and');
  return t(w.conditions.length > 1 && w.join === 'or' ? 'bar.setup_any' : 'bar.setup_when', { conditions });
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
  return at < blow.hit ? t(w.action.type === 'consume' ? 'bar.heal_warning_eat' : 'bar.heal_warning_heal', { monster: blow.name, hit: blow.hit, pct: c.value, hp: at }) : '';
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
        out.set(j, { by: i, why: t('bar.blocked_by', { action: actionName(a.action), slot: i + 1 }) });
        break;
      }
    }
  });
  return out;
}

/* A SHOT SPELL'S SHOTS (Andy #62: Precision Shot and Flame Volley looked ready and never fired). A cast looses what
   the attack lane would (abilities.js castShotOf): the worn ammo, or the item of an ammo slot on the bar, that the worn
   weapon shoots and the hero's skill allows, carried, or bought from its store row while the store is on. With none the engine never casts it. */
export function hasShot(set, bag, worn, skills) {
  const storeOn = set.supplySource === 'store' || set.onEmpty === 'switch';
  const ids = new Set([worn]);
  for (const s of set.slots || []) if (s && !s.empty && s.enabled !== false && s.action.type === 'attack_with_item') ids.add(own(ATTACK_KINDS, s.action.id) ? worn : s.action.id);
  for (const id of ids) {
    if (!id || !shootsItem(set.role, ITEMS[id]) || shortOf(id, skills, null)) continue;
    if ((bag || []).some((l) => l && l.id === id && l.qty > 0)) return true;
    if (storeOn && storeOf({ type: 'attack_with_item', id }, set.store)) return true;
  }
  return false;
}

/**
 * WHY A SLOT CANNOT FIRE NOW, from the server's own facts and the catalogue
 * rules the server applies (hr_hunt_settings_view `usable`: the ability is
 * active, of the worn weapon's discipline, a rune it can cast where the engine
 * spends it, or the store's behind the slot; a consume or
 * attack slot: stock, or the store behind it under the supply setting):
 *   { code, text, glyph, strike }   or null when nothing stops it.
 * `strike` = the server would not fire it at all; a reason without strike
 * (mana short) only waits. Order: the first rule that fails is the one named.
 * `worn` is the worn ammo (the equipment's `ammo`): the attack lane's default shot (hasShot). `skills` is the server's skills section.
 * `pack` is what a running hunt could carry in from the bag (carry-in.js carryRows: [{ id, have }]), or null: a
 * stock the hunt is out of but the bag holds says so, and that a press on the slot carries it in (Andy, 2026-11-02).
 * A shot under its skill reads its level wait first: stock could not make it fire, so it never offers a carry as the fix.
 */
export function reasonOf(sl, set, bag, hero, worn, skills, pack) {
  if (!sl || sl.empty) return null;
  const a = sl.action;
  /* "N Cooked Shrimp wait in your backpack. Press this slot to carry them in." for what the bag holds, or null. */
  const waiting = (n) => (n > 0 ? t('bar.waiting', { count: n, n: whole(n) }) : null);
  /* The same, naming the item ("3 Cooked Shrimp wait in your backpack…"). */
  const waitingItem = (n, id) => (n > 0 ? t('bar.waiting_item', { count: n, n: whole(n), item: itemName(id) }) : null);
  const inPack = (id) => ((pack || []).find((r) => r.id === id) || {}).have || 0;
  const SERVER = { code: 'server', text: t('bar.server_refused'), glyph: 'uiLock', strike: true };
  if (a.type === 'ability') {
    const r = ABILITIES[a.id];
    if (!r) return { code: 'unknown', text: t('bar.unknown_ability'), glyph: 'uiLock', strike: true };
    if (!r.active) return { code: 'inactive', text: t('bar.inactive', { ability: abilityName(a.id) }), glyph: 'uiLock', strike: true };
    const disc = set && set.discipline ? set.discipline : null;
    if (!disc) return { code: 'weapon', text: r.universal ? t('bar.no_weapon_any') : t('bar.no_weapon', { weapons: weaponsFor(r.disciplines[0]) }), glyph: 'uiLock', strike: true };
    if (!r.universal && !r.disciplines.includes(disc)) return { code: 'weapon', text: t('bar.weapon_cant_use', { weapons: weaponsFor(r.disciplines[0]) }), glyph: 'uiLock', strike: true };
    const storeOn = !!set && (set.supplySource === 'store' || set.onEmpty === 'switch');
    /* RUNE SUPPLY PER SLOT (Tyler 2026-11-08): only the runes the slot ticked count, and the shop only when it buys on empty */
    const sup = r.rune ? runeSupplyOf(a) : null;
    const packed = sup ? waiting(ownCount(a, (pack || []).map((x) => ({ id: x.id, qty: x.have })))) : null;
    if (sup && sup.onEmpty === 'leave' && !(ownCount(a, bag) > 0)) {
      return { code: 'runes_out', text: packed ? t('bar.rune_leaves_packed', { waiting: packed }) : t('bar.rune_leaves'), glyph: 'uiChest', strike: true };
    }
    if (sup && !(ownCount(a, bag) > 0) && !(storeOn && sup.onEmpty === 'store' && storeOf({ ...a, store: sup.store }, set && set.store))) {
      const rune = runeWords(r.rune, 1);
      const an = /^[aeiou]/i.test(rune) ? 'an' : 'a';
      return { code: 'rune', text: packed ? t('bar.rune_needs_' + an + '_packed', { rune, waiting: packed }) : t('bar.rune_needs_' + an, { rune }), glyph: 'uiChest', strike: true };
    }
    if (r.ammo > 0 && set && !hasShot(set, bag, worn, skills)) {
      return { code: 'ammo', text: t('bar.no_shot'), glyph: 'uiChest', strike: true };
    }
    if (sl.usable === false && sl.why === 'rune_level') {
      return { code: 'rune_level', text: t('bar.rune_level', { runes: runeWords(r.rune, 2) }), glyph: 'uiLock', strike: true };
    }
    if (sl.usable === false && sl.why === 'store_level') {
      const c = storeChoices(a, set && set.store, skills).find((x) => x.id === a.store);
      return { code: 'store_level', text: c ? t('bar.store_level_named', { name: c.name, needs: c.needs }) : t('bar.store_level'), glyph: 'uiLock', strike: true };
    }
    if (sl.usable === false && sl.why === 'runes_out') return { code: 'runes_out', text: t('bar.rune_leaves'), glyph: 'uiChest', strike: true };
    if (sl.usable === false) return SERVER;
    /* the mana of the version this slot casts (castOf: the rune it would spend), never version I's */
    const need = /** @type {{ mana: number }} */ (castOf(a, { bag, store: set && set.store, skills, set })).mana;
    if (hero && Number.isFinite(hero.mana) && need > hero.mana) return { code: 'mana', text: t('bar.mana_short', { mana: need, have: Math.floor(hero.mana) }), glyph: 'uiPotion', strike: false };
    return null;
  }
  /* A food or drink's struck state is the SERVER's (hr_hunt_settings_view `usable` + `why`), never the browser's own count. */
  if (a.type === 'consume' && sl.usable === false) {
    if (sl.why === 'none_left') {
      const packed = waitingItem(inPack(a.id), a.id);
      return { code: 'none_left', text: packed ? t('bar.none_in_hunt', { waiting: packed }) : t('bar.none_left', { item: itemName(a.id) }), glyph: 'uiChest', strike: true };
    }
    if (sl.why === 'store_off') return { code: 'store_off', text: t('bar.store_off'), glyph: 'uiChest', strike: true };
  }
  /* An attack item the worn weapon cannot shoot, or the hero's skill cannot use yet, never fires (the engine passes it over: damage.js pickShot). */
  const shot = shotProblem(a, set && set.role, skills);
  if (shot) return { code: shootsItem(set && set.role, ITEMS[a.id]) ? 'skill' : 'weapon', text: shot, glyph: 'uiLock', strike: true };
  if (sl.usable === false) return SERVER;
  if (a.type === 'consume') return null;
  const n = Number.isInteger(sl.count) && !own(ATTACK_KINDS, a.id) ? sl.count : carried(a, bag);
  if (n === null || n > 0) return null;
  const st = storeOf(a, set && set.store);
  const storeOn = !!set && (set.supplySource === 'store' || set.onEmpty === 'switch');
  if (st && storeOn) return null;
  const packed = waitingItem(inPack(a.id), a.id);
  if (packed) return { code: 'stock', text: t('bar.none_in_hunt', { waiting: packed }), glyph: 'uiChest', strike: true };
  if (st) return { code: 'store_off', text: t('bar.out_store_off'), glyph: 'uiChest', strike: true };
  return { code: 'stock', text: t('bar.out_no_store'), glyph: 'uiChest', strike: true };
}

/* THE CHALLENGE SLOT READS AS WORKING (bug #61; Coordinator ruling 2026-10-22): a tank that holds every engaged
   monster has nothing to Challenge (Tyler 10-16: it Challenges only what is not on it), so its taunt slot rests in a
   quiet state that says so, instead of looking broken. Not a stop: it fires the moment something leaves the tank. */
const HOLDING = Object.freeze({ code: 'holding', text: t('bar.holding'), glyph: 'uiShield', strike: false, quiet: true });

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
    if (ra && ra.lane === rb.lane) return t('bar.shared_cooldown', { action: abilityName(a.action.id), slot: k + 1 });
  }
  return null;
}
