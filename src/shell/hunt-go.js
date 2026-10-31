// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-go.js — GOING HUNTING: AS WHICH SETUP, WITH WHAT, AND WITH WHOM.
//
// PURE readers of the server's projection for the Hunts window's ground page
// (designer plan 2026-10-22: Hunt prep is absorbed into the moment a hunt is
// chosen). Every number is the envelope's, read again for every patch and
// replaced by the next envelope, never merged upward (CLAUDE.md §6). Nothing
// here gates a press: the server decides each one.
//   setupsOf(cs)        "Go as" (A #1): the setups this hero can put on (the server's
//                       hunt_presets) and the one it is on (hunt_settings.preset), each
//                       with its weapon, the role that weapon plays and, for the one in
//                       use, its bar's first four actions (the only bar the envelope
//                       carries). The default is the setup in use.
//   beforeLines(cs, o)  "Before you go" (A #5), replacing the readiness checklist: one
//                       line per kind of supply the bar spends, in slot order ("Food: 20
//                       Cooked Shrimp of yours, then Salted Shrimp from the store, 14 gp
//                       each"), the stamina when it will end the hunt soon, the gold when
//                       the store is paid from it. A line shows only when it informs.
//   freeHeroes(cs, all) "Bring your heroes" (B #3): this account's other open
//                       characters that sit in no party (own characters join at once,
//                       PARTY_SPEC 10-19).
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, staminaOf } from '../session/hunt-sections.js?v=0.2.77';
import { presetsOf, equipmentOf, goldOf, nameOf, carriedOf } from '../session/item-sections.js?v=0.2.77';
import { partyMembershipOf } from '../session/party-sections.js?v=0.2.77';
import { ITEMS } from '../data/items.js?v=0.2.77';
import { HUNT_ROLES, wornRoleKey, roleForWeapon, shootsItem } from '../data/hunt-roles.js?v=0.2.77';
import { hasShot } from './action-facts.js?v=0.2.77';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.77';
import { ABILITIES } from '../data/abilities.js?v=0.2.77';
import { storeOf, storeName } from './bar-draft.js?v=0.2.77';
import { itemName, runeWords, familyCount } from './widgets/bits.js?v=0.2.77';
import { whole, gold } from '../render/format.js?v=0.2.77';

/* How many of the bar's actions a setup line shows. */
const SETUP_ICONS = 4;
/* Stamina under this much is said before a hunt (the hunt will end on it soon). */
const STAMINA_SAY_MS = 2 * 3600000;

/* The role a worn set plays (src/data/hunt-roles.js, the ONE weapon -> role source: the weapon and the shield
   beside it), or null with no weapon. */
const roleOfGear = (gear) => (gear && gear.weapon && ITEMS[gear.weapon] ? roleForWeapon(wornRoleKey(gear, ITEMS), null) : null);

/**
 * "Go as": [{ preset, name, inUse, weapon, role, roleWords, bar }] in setup order, or null when the server
 * sent no hunt_settings. `bar` is the first SETUP_ICONS actions of the setup in use, null for the others.
 */
export function setupsOf(cs) {
  const s = settingsOf(cs);
  if (!s) return null;
  const saved = presetsOf(cs) || [];
  const named = (n) => (s.presets.find((p) => p.preset === n) || saved.find((p) => p.preset === n) || {}).name || 'Setup ' + (n + 1);
  const ids = new Set(saved.map((p) => p.preset).concat([s.preset]));
  return Array.from(ids).sort((a, b) => a - b).map((n) => {
    const inUse = n === s.preset;
    const p = saved.find((x) => x.preset === n);
    /* The setup in use wears what the hero has on now (the server's equipment); another wears its saved gear. */
    const weapon = inUse ? (equipmentOf(cs) || {}).weapon || null : (p && p.gear.weapon) || null;
    const role = inUse && s.role && HUNT_ROLES[s.role] ? s.role : roleOfGear(inUse ? equipmentOf(cs) : p && p.gear);
    return {
      preset: n, name: named(n), inUse, weapon, role, roleWords: role ? HUNT_ROLES[role].label : null,
      bar: inUse ? s.slots.filter((sl) => !sl.empty).slice(0, SETUP_ICONS).map((sl) => sl.action) : null,
    };
  });
}

const KIND_WORDS = Object.freeze({ food: 'Food', drink: 'Drink', ammo: 'Ammo', rune: 'Runes' });

/* What one bar slot spends: { kind, own: { id, n } | null, store: { name, price, each } | null, off }, or null. */
function slotSupply(sl, s, carried) {
  if (!sl || sl.empty) return null;
  const a = sl.action;
  const have = (id) => (carried.find((r) => r.id === id) || {}).qty || 0;
  const st = storeOf(a, s.store);
  const store = st && st.price !== null ? { name: st.name, price: st.price, each: a.type === 'ability' ? 'a cast' : 'each' } : null;
  /* A slot the server struck because the store is off for this hero buys nothing. */
  const off = sl.why === 'store_off';
  if (a.type === 'consume') {
    const c = CONSUMABLES[a.id];
    if (!c || !KIND_WORDS[c.kind]) return null;
    /* A store row IS the slot's item: it is bought per use; anything else is own stock (the server's count). */
    return c.source === 'store' ? { kind: c.kind, own: null, store: off ? null : store, off }
      : { kind: c.kind, own: { id: a.id, n: Number.isInteger(sl.count) ? sl.count : have(a.id) }, store: null, off };
  }
  if (a.type === 'attack_with_item') {
    const kind = /_rune$/.test(a.id) ? 'rune' : 'ammo';
    return { kind, own: a.id === 'loaded' ? null : { id: a.id, n: have(a.id) }, store: off ? null : store, off };
  }
  if (a.type === 'ability' && ABILITIES[a.id] && ABILITIES[a.id].rune) {
    /* a rune spell spends any tier of its family: count them all, say the family */
    const r = ABILITIES[a.id].rune, n = familyCount(r, carried);
    /* the store's rune of that family, the way to fix a slot that casts own runes only (starter bars, 2026-10-29) */
    const fam = Array.isArray(s.store) ? s.store.find((x) => x && x.partner === r && Number.isInteger(x.price)) : null;
    return { kind: 'rune', spell: ABILITIES[a.id].n, own: { id: r, n, name: runeWords(r, n) }, store: off ? null : store, off,
      fix: fam ? { name: storeName(fam.id), price: fam.price } : null };
  }
  return null;
}

/* What a kind with nothing usable means for the hunt. Empty ammo leaves a hero that shoots unable to attack (a
   short line). An empty food or drink slot is a heads-up, never a stop: hunting without them is a fair choice, HP
   and mana come back between fights (designer 2026-10-29, Tyler's "0 food" report); food the bag carries but the bar
   does not name is said with the fix. A rune spell that cannot fire only loses that spell, and says which. */
export const BARE_WORDS = Object.freeze({ food: 'Nothing will be eaten: HP comes back only between fights',
  drink: 'Nothing will be drunk: mana comes back only between fights', ammo: 'Nothing to shoot' });
/** The kinds an empty slot of which stops nothing: food and drink (a heads-up line). */
export const HEADS_UP_KINDS = Object.freeze(new Set(['food', 'drink']));

/**
 * "You carry 12 Trout: put it on the bar to eat it", or '': the biggest own stack of a food or drink in `rows`
 * (the server's bag) that the bar does not name (`named`, a Set of item ids). Display only.
 */
export function spareWords(kind, rows, named) {
  let best = null;
  for (const r of rows || []) {
    const c = CONSUMABLES[r.id];
    if (c && c.kind === kind && c.source !== 'store' && !named.has(r.id) && r.qty > 0 && (!best || r.qty > best.qty)) best = r;
  }
  return best ? 'You carry ' + whole(best.qty) + ' ' + itemName(best.id) + ': put it on the bar to ' + (kind === 'food' ? 'eat' : 'drink') + ' it' : '';
}

function bareWords(kind, parts, carried) {
  if (kind !== 'rune') return spareWords(kind, carried, new Set(parts.map((p) => (p.own ? p.own.id : null)))) || BARE_WORDS[kind];
  const spells = Array.from(new Set(parts.map((p) => p.spell).filter(Boolean)));
  if (!spells.length) return 'Nothing to cast';
  /* NO UNEXPLAINED DEAD BUTTON (designer 2026-10-29, lane/a-starter-bars): a style's default bar may hold a rune spell
     that casts own runes only; before the first hunt this line is where a new hero meets it, so it says the fix */
  const fixes = Array.from(new Map(parts.filter((p) => p.spell && p.fix).map((p) => [p.fix.name, p.fix])).values());
  return spells.join(' and ') + ' will not fire' + (fixes.length ? '. To cast ' + (spells.length > 1 ? 'them' : 'it') + ', press ' + (spells.length > 1 ? 'each' : 'its')
    + ' slot and pick ' + fixes.map((x) => x.name + ' (' + x.price + ' gp a cast)').join(' or ') + ' under "When your runes run out"' : '');
}

/* One part of a supply line: "20 Cooked Shrimp of yours", "no Cooked Shrimp left", "Salted Shrimp from the store, 14 gp each". */
function partWords(p) {
  const name = p.own ? p.own.name || itemName(p.own.id) : '';
  /* a rune a new hero never had is not "left": "no Fire runes of yours". With the store behind it the empty stock says
     nothing ("no Fire runes of yours, then Plain Fire Rune..." read like a robot, first-hour play 2026-10-31). */
  const own = p.own ? (p.own.n > 0 ? whole(p.own.n) + ' ' + name + ' of yours' : p.kind === 'rune' && p.store ? null : 'no ' + name + (p.kind === 'rune' ? ' of yours' : ' left')) : null;
  const store = p.store ? p.store.name + ' from the store, ' + p.store.price + ' gp ' + p.store.each : null;
  return [own, store].filter(Boolean).join(', then ');
}

/* THE RUNES LINE: what casts, in slot order, each stock or store rune once (two spells of one family name it once), then
   the spells that will not fire and their fix. Nothing usable keeps the listed stocks (bareWords). */
function runeLine(parts, carried) {
  const live = parts.filter((p) => (p.own && p.own.n > 0) || p.store);
  if (!live.length) return parts.map(partWords).filter(Boolean).join(', ') + '. ' + bareWords('rune', parts, carried);
  const words = Array.from(new Set(live.map(partWords).filter(Boolean)));
  const dead = parts.filter((p) => !live.includes(p) && p.spell);
  return words.join(', then ') + (dead.length ? '. ' + bareWords('rune', dead, carried) : '');
}

/* THE SHOOTER'S LINE (first-hour play 2026-10-31): the bar names no shot for a bow that shoots what is loaded, so this
   line is the only warning of a hero that will not attack at all. Null for a hero that does not shoot, or whose bar names
   its ammo (that slot's own line says it). `short` when nothing can be shot. */
function shotLine(s, cs, carried) {
  if (!s.role || !shootsItem(s.role, { slot: 'ammo', reqSkill: 'ranged' })) return null;
  const worn = (equipmentOf(cs) || {}).ammo || null;
  if (worn && shootsItem(s.role, ITEMS[worn])) {
    const n = (carried.find((r) => r.id === worn) || {}).qty || 0;
    if (s.slots.some((sl) => !sl.empty && sl.action.type === 'attack_with_item')) return null;
    /* The free rung (Bronze Arrows, designer 2026-10-31) shows no count: "49 of yours" read as 49 shots left. */
    return { id: 'ammo', text: Number(ITEMS[worn].ammoPerShot) > 0 ? 'Ammo: ' + whole(n) + ' ' + itemName(worn) + ' of yours, loaded.' : 'Ammo: ' + itemName(worn) + ' loaded. They never run out.', short: false };
  }
  if (hasShot(s, carried, worn)) return null;
  const spare = carried.find((r) => r.qty > 0 && shootsItem(s.role, ITEMS[r.id]));
  return { id: 'ammo', text: 'Ammo: nothing loaded, so your weapon can\'t shoot and your hero won\'t attack. '
    + (spare ? 'Open your bag, press ' + itemName(spare.id) + ', then Put on the bar.' : 'Press an empty slot on your bar, then Ammo, and pick a shot from the store.'), short: true };
}

/**
 * "Before you go": [{ id, text, short }] for the setup in use, or null when the server sent no bar.
 * `o.other` names another setup chosen under Go as: its bar is not in the envelope, so one line says
 * its supplies follow its own bar. `short` marks a line that will stop the hunt or leaves it bare.
 */
export function beforeLines(cs, o) {
  const s = settingsOf(cs);
  if (!s) return null;
  const out = [];
  let paysStore = false;
  if (o && o.other) out.push({ id: 'other', text: 'Supplies: as ' + o.other + '’s own bar sets them. It shows here once that setup is on.', short: false });
  else {
    const carried = carriedOf(cs) || [];
    const kinds = new Map();
    const seen = new Set();
    for (const sl of s.slots) {
      const p = slotSupply(sl, s, carried);
      if (!p) continue;
      /* Two slots spending the same stock (a rune spell and a rune attack) say it once. */
      if (p.own && seen.has(p.own.id)) p.own = null;
      else if (p.own) seen.add(p.own.id);
      if (!p.own && !p.store && !p.off) continue;
      if (!kinds.has(p.kind)) kinds.set(p.kind, []);
      kinds.get(p.kind).push(p);
    }
    const shot = shotLine(s, cs, carried);
    if (shot) out.push(shot);
    for (const [kind, parts] of kinds) {
      const words = parts.map(partWords).filter(Boolean);
      const usable = parts.some((p) => (p.own && p.own.n > 0) || p.store);
      if (parts.some((p) => p.store)) paysStore = true;
      if (kind === 'rune') { out.push({ id: kind, text: KIND_WORDS[kind] + ': ' + runeLine(parts, carried), short: false }); continue; }
      /* nothing usable: the stocks are listed, never chained with "then" (no fallback runs between empties) */
      out.push({ id: kind, text: KIND_WORDS[kind] + ': ' + (words.length ? words.join(usable ? ', then ' : ', ') : 'nothing this bar can use') + (usable ? '' : '. ' + bareWords(kind, parts, carried)), short: !usable && !HEADS_UP_KINDS.has(kind) });
    }
    if (!kinds.has('food') && !kinds.has('drink')) out.push({ id: 'none', text: 'Your bar eats and drinks nothing: HP and mana come back only between fights.', short: false });
  }
  const st = staminaOf(cs);
  if (st && st.msLeft <= 0) out.push({ id: 'stamina', text: 'No stamina left: rest in town before you go.', short: true });
  else if (st && st.msLeft < STAMINA_SAY_MS) {
    const m = Math.floor(st.msLeft / 60000);
    out.push({ id: 'stamina', text: 'Stamina: ' + (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min left, then the hunt ends.', short: false });
  }
  const gp = goldOf(cs);
  if (paysStore && gp !== null) {
    out.push(gp > 0 ? { id: 'gold', text: 'Gold: ' + gold(gp) + ' pays the store as you use it.', short: false }
      : { id: 'gold', text: 'No gold for the store: the hunt ends when your own supplies run out.', short: true });
  }
  return out;
}

/** "Bring your heroes": this account's other open characters in no party, [{ slot, name }]. */
export function freeHeroes(cs, all) {
  return (all || []).filter((o) => o && o !== cs && o.status !== 'closed' && Number.isInteger(o.slot) && !partyMembershipOf(o))
    .map((o) => ({ slot: o.slot, name: nameOf(o) || 'Character ' + (o.slot + 1) }));
}
