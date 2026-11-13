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
//   sentenceOf(action)    the slot read as words ("Eat", "Cast", "Shoot with")
//   compareLines(a, b)    the hovered row against the picked one, in signed words
//   wasteLine(row, …)     "At 45% you’re only missing 121 HP, so 167 of its 288 goes to waste."
// No DOM, no clock, no state. Nothing here gates or spends anything.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js?v=0.2.128';
import { CONSUMABLES, CONSUMABLE_RULES } from '../data/consumables.js?v=0.2.128';
import { SUPPLIES } from '../data/supplies.js?v=0.2.128';
import { ITEMS } from '../data/items.js?v=0.2.128';
import { HUNT_ROLES, shootsItem } from '../data/hunt-roles.js?v=0.2.128';
import { ATTACK_KINDS } from '../data/condition-metrics.js?v=0.2.128';
import { itemName, abilityName, runeWords } from './widgets/bits.js?v=0.2.128';
import { shortOf } from './item-lore.js?v=0.2.128';
import { castOf } from './cast-facts.js?v=0.2.128';
import { t } from '../render/player-text.js?v=0.2.128';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const secs = (ms) => (ms % 1000 ? (ms / 1000).toFixed(1) : String(ms / 1000));
const fixed = (n) => (Math.round(n * 100) / 100).toFixed(2);

/** The column headers of a run (the sort column says "cheapest first"). */
const cols = (...ids) => Object.freeze(ids.map((id) => (id ? t(id) : '')));
export const RUN_COLUMNS = Object.freeze({
  food: cols('bar.col_heals', 'bar.col_gold', 'bar.col_per_hp', 'bar.col_carry'),
  drink: cols('bar.col_mana', 'bar.col_gold', 'bar.col_per_mana', 'bar.col_carry'),
  ammo: cols('bar.col_damage', 'bar.col_gold', 'bar.col_per_shot', 'bar.col_carry'),
  spells: cols('bar.col_mana', 'bar.col_cooldown', 'bar.col_rune', ''),
});
const RUN_LABEL = Object.freeze({ food: t('bar.run_food'), drink: t('bar.run_drink'), ammo: t('bar.run_ammo') });

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
  if (own(ATTACK_KINDS, id)) return { action: { type: 'attack_with_item', id }, kind: 'ammo', name: t('bar.loaded_ammo'), store: false, amount: null, price: null, per: null, carry: null, unpriced: false, none: false };
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
 * inventory rows), store (the server's store rows: settingsOf(cs).store), skills and set (the server's skills and
 * hunt_settings: a spell's mana is the version it would cast, cast-facts.js castOf), picked (the slot's action: the spell it
 * holds shows the price of the store rune it names, never Plain's) }.
 */
export function tableOf(tab, ctx) {
  const c = ctx || {};
  const disc = c.discipline || null;
  if (tab === 'spells') {
    /* Every spell in the game, a rune spell with its rune on its row (Tyler 2026-11-08: one Spells tab), the weapon's own first
       (castable, then the catalogue's order): one the weapon cannot cast is still listed and can be picked, LOCKED (art spec §5, §8). */
    const rows = Object.values(ABILITIES).filter((a) => a.active).map((a) => {
      const p = a.rune ? partnerRow(c.store, a.rune) : null;
      const picked = c.picked && c.picked.id === a.id ? c.picked : null;
      /* its mana is the version it would cast for this hero (cast-facts.js castOf): the pick's own supply, else what a pick starts with */
      const cast = castOf(picked || { type: 'ability', id: a.id, ...(p ? { store: p.id } : {}) }, c);
      return { action: { type: 'ability', id: a.id }, kind: 'spells', name: abilityName(a.id), store: false,
        amount: cast ? cast.mana : a.mana, price: null, per: null, carry: null,
        cooldown: t('bar.secs', { secs: secs(a.cdMs) }), rune: a.rune ? t('bar.cost_rune', { rune: runeWords(a.rune, 1) }) : '—', unpriced: false, none: false,
        locked: !disc || !(a.universal || a.disciplines.includes(disc)) };
    });
    rows.sort((a, b) => a.locked - b.locked);
    return { runs: rows.length ? [{ kind: tab, label: null, cols: RUN_COLUMNS[tab], rows }] : [], empty: rows.length ? null : t('bar.no_spells') };
  }
  const runs = [];
  if (tab === 'food') {
    for (const kind of ['food', 'drink']) {
      const rows = Object.values(CONSUMABLES).filter((x) => x.kind === kind).map((x) => supplyRow(x, c.store, c.bag)).sort(byValue);
      if (rows.length) runs.push({ kind, label: RUN_LABEL[kind], cols: RUN_COLUMNS[kind], rows });
    }
    return { runs, empty: runs.length ? null : t('bar.no_food') };
  }
  if (tab !== 'ammo') return { runs, empty: null };
  /* THE SHOTS (hunt-roles.js shootsItem, the engine's rule): only ammo some weapon can loose is offered — a
     whetstone sharpens a Melee weapon from the ammo slot and is no one's shot (Andy 2026-10-23: a bow loosed
     Copper Whetstones from an attack slot), nor is a rune (it fuels spells only, Tyler 2026-10-23) — and one the
     worn weapon cannot shoot is listed LOCKED, as a spell is. */
  const roles = Object.keys(HUNT_ROLES);
  const ammo = Object.keys(ATTACK_KINDS).concat(Object.values(SUPPLIES).filter((r) => r.kind === 'ammo' && roles.some((k) => shootsItem(k, ITEMS[r.id]))).map((r) => r.id))
    .map((id) => {
      /* under its skill it is locked too, and keeps its place on a bar for the level (abilities.js shotLine); `skills` is the server's */
      const short = shortOf(id, c.skills, null);
      return Object.assign(ammoRow(id, c.store, c.bag), { locked: !own(ATTACK_KINDS, id) && (!shootsItem(c.role, ITEMS[id]) || !!short), lockWhy: short ? short.text : null });
    });
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
  const carry = r.carry === 'store' ? t('bar.cell_store') : r.carry === null ? '—' : r.carry > 0 ? '×' + r.carry : t('bar.cell_none');
  if (r.kind === 'spells') return [String(r.amount), r.cooldown, r.rune, ''];
  if (r.kind === 'ammo') return [r.amount ? '+' + r.amount : '—', dash(r.price), r.per === null ? '—' : String(r.per), carry];
  return [dash(r.amount), dash(r.price), r.per === null ? '—' : fixed(r.per), carry];
}

/** The slot's verb and object, as the sentence starts: { verb, item, note }. */
export function sentenceOf(action) {
  if (!action || !action.id) return { verb: '', item: '', note: '' };
  /* (a spell's rune is its cost line's, in the detail pane: "Cost: 30 mana · 1 Scored Fire Rune (8 g)", Tyler 2026-11-08) */
  if (action.type === 'ability') return { verb: t('bar.verb_cast'), item: abilityName(action.id), note: '' };
  /* WHICH ARROWS FIRE (Andy #63; src/core/hunt/conditions.js attackOrder, the engine's one order): what you carry
     first, the worn ammo ahead of the bar's other ammo unless a slot has conditions, the store last. */
  if (action.type === 'attack_with_item') {
    const worn = own(ATTACK_KINDS, action.id);
    return { verb: t('bar.verb_shoot'), item: worn ? t('bar.the_loaded_ammo') : itemName(action.id), note: worn ? t('bar.note_loaded') : t('bar.note_shot') };
  }
  const c = CONSUMABLES[action.id];
  return { verb: c && c.kind === 'drink' ? t('bar.verb_drink') : t('bar.verb_eat'), item: itemName(action.id), note: '' };
}

/** The hovered row against the picked one, one fact a line, signed ([] when there is nothing to compare). */
export function compareLines(row, picked) {
  if (!row || !picked || row === picked || row.kind !== picked.kind || !['food', 'drink'].includes(row.kind)) return [];
  const food = row.kind === 'food';
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  const out = [];
  if (row.amount !== null && picked.amount !== null) out.push(t(food ? 'bar.cmp_hp_use' : 'bar.cmp_mana_use', { diff: sign(row.amount - picked.amount) }));
  if (row.price !== null && picked.price !== null) out.push(t('bar.cmp_gold_use', { diff: sign(row.price - picked.price) }));
  if (row.per !== null && picked.per !== null && picked.per > 0) out.push(t(food ? 'bar.cmp_gold_per_hp' : 'bar.cmp_gold_per_mana', { ratio: Math.round((row.per / picked.per) * 10) / 10 }));
  return out;
}

/**
 * The honest cost of a big heal: "At 45% you’re only missing 121 HP, so 167 of its 288 goes to waste."
 * `pct` is the slot's own "at or below N%" (its first HP / mana test), `max` the server's max pool.
 */
export function wasteLine(row, pct, max) {
  if (!row || !['food', 'drink'].includes(row.kind) || !(row.amount > 0) || !(max > 0) || !Number.isFinite(pct)) return '';
  const missing = Math.round((max * (100 - pct)) / 100);
  const lost = row.amount - missing;
  return lost > 0 ? t(row.kind === 'food' ? 'bar.waste_hp' : 'bar.waste_mana', { pct, missing, lost, amount: row.amount }) : '';
}

/** Food and drink's shared rule, in words. */
export function effectLine(row) {
  return row && ['food', 'drink'].includes(row.kind)
    ? t(row.kind === 'food' ? 'bar.effect_food' : 'bar.effect_drink', { secs: secs(CONSUMABLE_RULES.overTimeMs), lane: secs(CONSUMABLE_RULES.laneMs) })
    : '';
}
