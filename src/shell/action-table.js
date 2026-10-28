// ════════════════════════════════════════════════════════════════════════
// src/shell/action-table.js — CONFIGURE ACTION'S TABLE, SENTENCE AND COMPARISON (pure).
//
// Tyler 2026-10-21 (designer-confirmed): a bar slot names ONE item and the game
// never judges which is best. A crafted food or drink comes from the hero's own
// stock only; a store food or drink is bought per use; the player builds the
// fallback by slot ORDER. This module turns the catalogue into what the window
// shows (art direction spec 2026-10-21, docs/ART_DIRECTION.md):
//   tableOf(tab, ctx)     the rows a tab offers, in runs (Food, Drink, Ammo), each
//                         row its numbers; store numbers are the SERVER's rows
//                         (hunt_settings.store), never a client copy; sorted
//                         cheapest per point, unpriced last, ties the bigger first
//   sentenceOf(action)    the slot read as words ("Eat", "Cast … (uses 1 Fire Rune)")
//   compareLines(a, b)    the hovered row against the picked one, in signed words
//   wasteLine(row, …)     "At 45% you are missing 121 HP; 167 of its 288 would be wasted."
//   sourceLine(row, ctx)  where its uses come from
// No DOM, no clock, no state. Nothing here gates or spends anything.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js?v=0.2.62';
import { CONSUMABLES, CONSUMABLE_RULES } from '../data/consumables.js?v=0.2.62';
import { SUPPLIES } from '../data/supplies.js?v=0.2.62';
import { ITEMS } from '../data/items.js?v=0.2.62';
import { HUNT_ROLES, shootsItem } from '../data/hunt-roles.js?v=0.2.62';
import { ATTACK_KINDS } from '../data/condition-metrics.js?v=0.2.62';
import { itemName, abilityName, runeWords, familyCount } from './widgets/bits.js?v=0.2.62';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const secs = (ms) => (ms % 1000 ? (ms / 1000).toFixed(1) : String(ms / 1000));
const fixed = (n) => (Math.round(n * 100) / 100).toFixed(2);

/** The column headers of a run (the sort column says "cheapest first"). */
export const RUN_COLUMNS = Object.freeze({
  food: Object.freeze(['Heals', 'Gold', 'g per HP, cheapest first', 'You carry']),
  drink: Object.freeze(['Mana', 'Gold', 'g per mana, cheapest first', 'You carry']),
  ammo: Object.freeze(['Damage', 'Gold', 'g per shot, cheapest first', 'You carry']),
  spells: Object.freeze(['Mana', 'Cooldown', 'Rune', '']),
  runes: Object.freeze(['Rune', '', 'g per cast, cheapest first', 'You carry']),
});
const RUN_LABEL = Object.freeze({ food: 'Food', drink: 'Drink', ammo: 'Arrows and bolts' });

/* The store row a crafted ammo or rune falls back to, from the SERVER's rows. */
const partnerRow = (store, id) => (store || []).find((r) => r.partner === id) || null;
const countOf = (bag, id) => (bag ? (bag.find((l) => l.id === id) || { qty: 0 }).qty : null);

/* A food or drink row. A store row is priced by the server; a crafted one is own stock only. */
function supplyRow(c, store, bag) {
  const srv = c.source === 'store' ? (store || []).find((r) => r.id === c.id) : null;
  /* A store row the server has not sent reads "—" (never a client copy of its numbers). */
  const amount = srv ? srv.amount : c.source === 'store' ? null : c.amount;
  const price = srv ? srv.price : null;
  const carry = c.source === 'store' ? 'store' : countOf(bag, c.id);
  return { action: { type: 'consume', id: c.id }, kind: c.kind, name: itemName(c.id),
    store: c.source === 'store', amount, price, per: price !== null && amount > 0 ? price / amount : null, carry,
    unpriced: c.source === 'store' ? price === null : false, none: c.source !== 'store' && !(carry > 0) };
}

/* An ammo row: own stock first, then its plain partner per shot (the server's price; Tyler 2026-10-23:
   arrows are bought from the store like anything else). A rune is no ammo (tableOf leaves it out). */
function ammoRow(id, store, bag) {
  if (own(ATTACK_KINDS, id)) return { action: { type: 'attack_with_item', id }, kind: 'ammo', name: 'The loaded ammo', store: false, amount: null, price: null, per: null, carry: null, unpriced: false, none: false };
  const it = ITEMS[id] || {};
  const p = partnerRow(store, id);
  const carry = countOf(bag, id);
  return { action: { type: 'attack_with_item', id }, kind: 'ammo', name: itemName(id), store: false,
    amount: Number(it.rangeStrB || it.magicStrB || it.strB) || 0, price: p ? p.price : null, per: p ? p.price : null, carry,
    unpriced: !p, none: !(carry > 0) && !p };
}

/* Cheapest per point first; unpriced rows last; on a tie the bigger first, then the name. */
const byValue = (a, b) => ((a.per === null) - (b.per === null)) || ((a.per || 0) - (b.per || 0))
  || ((b.amount || 0) - (a.amount || 0)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * The runs a tab shows: [{ kind, label, cols, rows }], plus `empty` (why there is
 * nothing to pick) when no run has a row. `ctx` = { discipline, role (the server's, hunt_settings), bag (the server's
 * inventory rows), store (the server's store rows: settingsOf(cs).store) }.
 */
export function tableOf(tab, ctx) {
  const c = ctx || {};
  const disc = c.discipline || null;
  if (tab === 'spells' || tab === 'runes') {
    const runes = tab === 'runes';
    /* Every spell in the game, the weapon's own first (castable, then the catalogue's order; runes cheapest
       per cast): one the weapon cannot cast is still listed and can be picked, LOCKED (art spec §5, §8). */
    const rows = Object.values(ABILITIES).filter((a) => a.active && (!runes || a.rune)).map((a) => {
      const p = a.rune ? partnerRow(c.store, a.rune) : null;
      return { action: { type: 'ability', id: a.id }, kind: runes ? 'runes' : 'spells', name: abilityName(a.id), store: false,
        amount: a.mana, price: p ? p.price : null, per: p ? p.price : null, carry: a.rune ? familyCount(a.rune, c.bag) : null,
        cooldown: secs(a.cdMs) + ' s', rune: a.rune ? '1 ' + runeWords(a.rune, 1) : '—', unpriced: false, none: false,
        locked: !disc || !(a.universal || a.disciplines.includes(disc)) };
    });
    rows.sort((a, b) => (a.locked - b.locked) || (runes ? byValue(a, b) : 0));
    const empty = rows.length ? null : runes ? 'No rune spells in the game yet.' : 'No spells in the game yet.';
    return { runs: rows.length ? [{ kind: tab, label: null, cols: RUN_COLUMNS[tab], rows }] : [], empty };
  }
  const runs = [];
  if (tab === 'food') {
    for (const kind of ['food', 'drink']) {
      const rows = Object.values(CONSUMABLES).filter((x) => x.kind === kind).map((x) => supplyRow(x, c.store, c.bag)).sort(byValue);
      if (rows.length) runs.push({ kind, label: RUN_LABEL[kind], cols: RUN_COLUMNS[kind], rows });
    }
    return { runs, empty: runs.length ? null : 'No food or drink in the game yet.' };
  }
  if (tab !== 'ammo') return { runs, empty: null };
  /* THE SHOTS (hunt-roles.js shootsItem, the engine's rule): only ammo some weapon can loose is offered — a
     whetstone sharpens a Melee weapon from the ammo slot and is no one's shot (Andy 2026-10-23: a bow loosed
     Copper Whetstones from an attack slot), nor is a rune (it fuels spells only, Tyler 2026-10-23) — and one the
     worn weapon cannot shoot is listed LOCKED, as a spell is. */
  const roles = Object.keys(HUNT_ROLES);
  const ammo = Object.keys(ATTACK_KINDS).concat(Object.values(SUPPLIES).filter((r) => r.kind === 'ammo' && roles.some((k) => shootsItem(k, ITEMS[r.id]))).map((r) => r.id))
    .map((id) => Object.assign(ammoRow(id, c.store, c.bag), { locked: !own(ATTACK_KINDS, id) && !shootsItem(c.role, ITEMS[id]) }));
  const loaded = ammo.filter((r) => own(ATTACK_KINDS, r.action.id));
  runs.push({ kind: 'ammo', label: RUN_LABEL.ammo, cols: RUN_COLUMNS.ammo, rows: loaded.concat(ammo.filter((r) => !own(ATTACK_KINDS, r.action.id)).sort((a, b) => (a.locked - b.locked) || byValue(a, b))) });
  return { runs, empty: null };
}

/** The row of `action` in a table, or null. */
export function rowIn(table, action) {
  if (!table || !action || !action.id) return null;
  for (const run of table.runs) for (const r of run.rows) if (r.action.type === action.type && r.action.id === action.id) return r;
  return null;
}

/** The row's cells as text, in its run's column order (unknown values read "—", never 0). */
export function cellsOf(r) {
  const dash = (v) => (v === null || v === undefined ? '—' : v);
  const carry = r.carry === 'store' ? 'store' : r.carry === null ? '—' : r.carry > 0 ? '×' + r.carry : 'none';
  if (r.kind === 'spells') return [String(r.amount), r.cooldown, r.rune, ''];
  if (r.kind === 'runes') return [r.rune, '', r.per === null ? '—' : String(r.per), carry];
  if (r.kind === 'ammo') return [r.amount ? '+' + r.amount : '—', dash(r.price), r.per === null ? '—' : String(r.per), carry];
  return [dash(r.amount), dash(r.price), r.per === null ? '—' : fixed(r.per), carry];
}

/** The slot's verb and object, as the sentence starts: { verb, item, note }. */
export function sentenceOf(action, store) {
  if (!action || !action.id) return { verb: '', item: '', note: '' };
  if (action.type === 'ability') {
    const a = ABILITIES[action.id];
    if (!a || !a.rune) return { verb: 'Cast', item: abilityName(action.id), note: '' };
    const p = action.store ? (store || []).find((r) => r.id === action.store) : null;
    return { verb: 'Cast', item: abilityName(action.id),
      note: '(uses 1 ' + runeWords(a.rune, 1) + (p ? ', ' + p.price + ' g a cast from the store once yours are gone)' : ', carried runes only)') };
  }
  /* WHICH ARROWS FIRE (Andy #63; src/core/hunt/conditions.js attackOrder, the engine's one order): what you carry
     first, the worn ammo ahead of the bar's other ammo unless a slot has conditions, the store last. */
  if (action.type === 'attack_with_item') {
    const worn = own(ATTACK_KINDS, action.id);
    return { verb: 'Shoot with', item: worn ? 'the loaded ammo' : itemName(action.id),
      note: worn ? '(the ammo you wear shoots first; the store sells a shot only once everything you carry is gone)'
        : '(after the ammo you wear, unless you give this slot conditions; the store sells a shot only once everything you carry is gone)' };
  }
  const c = CONSUMABLES[action.id];
  return { verb: c && c.kind === 'drink' ? 'Drink' : 'Eat', item: itemName(action.id), note: '' };
}

/** The hovered row against the picked one, one fact a line, signed ([] when there is nothing to compare). */
export function compareLines(row, picked) {
  if (!row || !picked || row === picked || row.kind !== picked.kind || !['food', 'drink'].includes(row.kind)) return [];
  const unit = row.kind === 'food' ? 'HP' : 'mana';
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  const out = [];
  if (row.amount !== null && picked.amount !== null) out.push(sign(row.amount - picked.amount) + ' ' + unit + ' a use');
  if (row.price !== null && picked.price !== null) out.push(sign(row.price - picked.price) + ' gold a use');
  if (row.per !== null && picked.per !== null && picked.per > 0) out.push((Math.round((row.per / picked.per) * 10) / 10) + '× the gold per ' + unit);
  return out;
}

/**
 * The honest cost of a big heal: "At 45% you are missing 121 HP; 167 of its 288 would be wasted."
 * `pct` is the slot's own "at or below N%" (its first HP / mana test), `max` the server's max pool.
 */
export function wasteLine(row, pct, max) {
  if (!row || !['food', 'drink'].includes(row.kind) || !(row.amount > 0) || !(max > 0) || !Number.isFinite(pct)) return '';
  const unit = row.kind === 'food' ? 'HP' : 'mana';
  const missing = Math.round((max * (100 - pct)) / 100);
  const lost = row.amount - missing;
  return lost > 0 ? 'At ' + pct + '% you are missing ' + missing + ' ' + unit + '; ' + lost + ' of its ' + row.amount + ' would be wasted.' : '';
}

/** Where a row's uses come from, in one sentence. */
export function sourceLine(row) {
  if (!row) return '';
  if (row.kind === 'spells' || row.kind === 'runes') return row.rune === '—' ? 'Costs only mana.' : 'Each cast uses ' + row.rune + '.';
  if (row.action.type === 'attack_with_item' && row.carry === null) return 'Uses whatever ammo you have loaded.';
  if (row.store) return row.unpriced ? 'The server has not priced this yet.' : 'The store sells it at ' + row.price + ' g each, paid as used.';
  const n = row.carry > 0 ? row.carry : 0;
  if (row.kind === 'ammo') return row.price !== null
    ? (n ? 'Uses your ' + n + ' first, then the store at ' + row.price + ' g a shot.' : 'You carry none. The store sells it at ' + row.price + ' g a shot.')
    : (n ? 'You carry ' + n + '. The store does not sell it, so after ' + n + ' shots this slot waits.' : 'You carry none, and the store does not sell it.');
  return n ? 'You carry ' + n + '. The store does not sell it, so after ' + n + ' uses this slot waits; put a store item in a later slot to carry on.'
    : 'You carry none, so this slot waits. The store does not sell it.';
}

/** Food and drink's shared rule, in words. */
export function effectLine(row) {
  return row && ['food', 'drink'].includes(row.kind)
    ? 'Half ' + (row.kind === 'food' ? 'heals' : 'restores') + ' at once, the rest over ' + secs(CONSUMABLE_RULES.overTimeMs) + ' s. Food and drink share a ' + secs(CONSUMABLE_RULES.laneMs) + ' s cooldown.'
    : '';
}
