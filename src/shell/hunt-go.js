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
import { settingsOf, staminaOf } from '../session/hunt-sections.js?v=0.2.59';
import { presetsOf, equipmentOf, goldOf, nameOf, carriedOf } from '../session/item-sections.js?v=0.2.59';
import { partyMembershipOf } from '../session/party-sections.js?v=0.2.59';
import { ITEMS } from '../data/items.js?v=0.2.59';
import { HUNT_ROLES, wornRoleKey, roleForWeapon } from '../data/hunt-roles.js?v=0.2.59';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.59';
import { ABILITIES } from '../data/abilities.js?v=0.2.59';
import { storeOf } from './bar-draft.js?v=0.2.59';
import { itemName, runeWords, familyCount } from './widgets/bits.js?v=0.2.59';
import { whole, gold } from '../render/format.js?v=0.2.59';

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
    return { kind: 'rune', spell: ABILITIES[a.id].n, own: { id: r, n, name: runeWords(r, n) }, store: off ? null : store, off };
  }
  return null;
}

/* What a kind with nothing usable means for the hunt. Food, drink and ammo leave the hero bare (a short
   line); a rune spell that cannot fire only loses that spell, and says which. */
const BARE_WORDS = Object.freeze({ food: 'Nothing will be eaten', drink: 'Nothing will be drunk', ammo: 'Nothing to shoot' });
function bareWords(kind, parts) {
  if (kind !== 'rune') return BARE_WORDS[kind];
  const spells = Array.from(new Set(parts.map((p) => p.spell).filter(Boolean)));
  return spells.length ? spells.join(' and ') + ' will not fire' : 'Nothing to cast';
}

/* One part of a supply line: "20 Cooked Shrimp of yours", "no Cooked Shrimp left", "Salted Shrimp from the store, 14 gp each". */
function partWords(p) {
  const name = p.own ? p.own.name || itemName(p.own.id) : '';
  const own = p.own ? (p.own.n > 0 ? whole(p.own.n) + ' ' + name + ' of yours' : 'no ' + name + ' left') : null;
  const store = p.store ? p.store.name + ' from the store, ' + p.store.price + ' gp ' + p.store.each : null;
  return [own, store].filter(Boolean).join(', then ');
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
    for (const [kind, parts] of kinds) {
      const words = parts.map(partWords).filter(Boolean);
      const usable = parts.some((p) => (p.own && p.own.n > 0) || p.store);
      if (parts.some((p) => p.store)) paysStore = true;
      out.push({ id: kind, text: KIND_WORDS[kind] + ': ' + (words.length ? words.join(', then ') : 'nothing this bar can use') + (usable ? '' : '. ' + bareWords(kind, parts)), short: !usable && kind !== 'rune' });
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
