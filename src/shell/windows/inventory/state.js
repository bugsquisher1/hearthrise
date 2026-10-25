// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/state.js — THE INVENTORY'S READING OF ONE CHARACTER.
//
// What the Inventory draws, gathered in one place for its skeleton, its patch
// and its actions (index.js, grid.js, doll.js, actions.js):
//   from the server   the bag, its stack cap, the gold, the worn set, the bag
//                     rules, the shop's bids, the action bar, this hunt's loot,
//                     the "Equip upgrades" plan
//                     (src/session/*-sections.js)
//   residue           the remembered category, sort and Advanced view, and the
//                     "new" marks
//   scratch           the search text, the selection, the cursor, the open
//                     menu, the open doll slot and the confirmation, an intent
//                     in flight and its words (`msg`) with the line it was
//                     pressed on (`msgAt`: 'pick:<item>', 'slot', 'upgrade', or null
//                     for the window's own line). Display only: nothing reads
//                     it but this window, nothing spends it.
//   the town ticker   what running town work has certainly done since the
//                     server's watermark (`tick`, town-work.js tickOf): the
//                     pockets show it as pending; `items` and `qty`, which every
//                     action reads, stay the server's.
// ════════════════════════════════════════════════════════════════════════
import { bagOf, bagCapOf, goldOf, rulesOf, shopOf, equipmentOf, huntLootOf } from '../../../session/item-sections.js?v=0.2.46';
import { settingsOf, analyzerOf } from '../../../session/hunt-sections.js?v=0.2.46';
import { BAG_CATS, BAG_SORTS, view, kindOf, equipSlotFor, sellPlan, junkIds } from '../../bag-model.js?v=0.2.46';
import { barKind, barIndexOf } from '../../bar-assign.js?v=0.2.46';
import { itemName } from '../../widgets/bits.js?v=0.2.46';
import { buryRecipeOf, buryLabel } from './bury.js?v=0.2.46';
import { upgradeOf } from '../../widgets/upgrade-line.js?v=0.2.46';
import { tickOf } from '../../town-work.js?v=0.2.46';

const SCRATCH = new WeakMap();
const CAT_IDS = new Set(BAG_CATS.map(([id]) => id));
const SORT_IDS = new Set(BAG_SORTS.map(([id]) => id));

/** This character's Inventory scratch (made on first use). */
export function scratchOf(cs) {
  let s = SCRATCH.get(cs);
  if (!s) {
    s = { tab: 'bag', query: '', sel: new Set(), cursor: null, anchor: null, menu: null, menuOwner: null, confirm: null, slot: null,
      pending: false, wearing: null, msg: '', msgAt: null, shownNew: new Set(), press: null, pressed: false };
    SCRATCH.set(cs, s);
  }
  return s;
}

/** The remembered category, sort and Advanced view (residue `bagView`), falling back to All / Type / off. */
export function prefsOf(cs) {
  const v = cs && cs.record && cs.record.residue ? cs.record.residue.bagView : null;
  return { cat: v && CAT_IDS.has(v.cat) ? v.cat : 'all', sort: v && SORT_IDS.has(v.sort) ? v.sort : 'type', advanced: !!(v && v.advanced === true) };
}

/** Write one remembered preference, keeping the others. */
export function setPref(cs, key, value) {
  const p = prefsOf(cs);
  p[key] = value;
  if (!p.advanced) delete p.advanced;
  cs.setResidue('bagView', p);
}

/** The "new" marks (residue `bagSeen`); null when this character has never had any. */
export function seenOf(cs) {
  const r = cs && cs.record && cs.record.residue;
  return r && r.bagSeen && typeof r.bagSeen === 'object' ? r.bagSeen : null;
}

/** Everything the Inventory draws for this character, read once per paint. */
export function stateOf(ctx) {
  const cs = ctx.character;
  const items = bagOf(cs);
  const shop = shopOf(cs);
  const prefs = prefsOf(cs);
  const sc = scratchOf(cs);
  const list = items || [];
  /* A character with no marks yet starts with everything already in the bag seen:
     "new" means new since the player last looked, not "never marked". */
  const stored = seenOf(cs);
  const seen = stored || Object.fromEntries(list.map((r) => [r.id, [r.qty, 0]]));
  const shown = view(list, { cat: prefs.cat, query: sc.query, sort: prefs.sort, bids: shop ? shop.bids : null, seen });
  return { cs, items: list, loaded: !!items, cap: bagCapOf(cs), gold: goldOf(cs), rules: rulesOf(cs), shop, eq: equipmentOf(cs) || {},
    bar: settingsOf(cs), prefs, sc, seen, unmarked: !stored, shown, qty: new Map(list.map((r) => [r.id, r.qty])),
    /* What "Equip upgrades" would put on (src/shell/upgrade-plan.js), from the same server sections. */
    upgrade: upgradeOf(cs),
    /* Display only: the pockets' pending counts (grid.js). Never read by an action. */
    tick: tickOf(cs) };
}

/** This hunt's pickups: the server's hunt loot, else the analyzer's loot list, else null. */
export function huntLoot(cs) {
  const l = huntLootOf(cs);
  if (l) return l;
  const a = analyzerOf(cs);
  return a ? a.hero.loot.map((x) => ({ item: x.item, count: x.count })) : null;
}

/** The one primary action for a stack: [verb, label], or null. */
export function primaryOf(st, id) {
  if (!id || !st.qty.has(id)) return null;
  const k = kindOf(id);
  if (k === 'gear') return equipSlotFor(id, st.eq) ? ['equip', 'Equip'] : null;
  if (k === 'food') return ['eat', 'Eat'];
  if (barKind(id) && st.bar && barIndexOf(st.cs, id) < 0) return ['bar', 'Put on the bar'];
  const br = buryRecipeOf(id);
  if (br) return ['bury', buryLabel(br, st.qty.get(id))];
  if (st.shop && st.shop.bids.has(id) && !(st.rules && st.rules.locked.has(id))) return ['sell', 'Sell'];
  return null;
}

/**
 * A confirmation for selling `ids` whole: { label, plan } (the server's bids,
 * locked stacks kept), or null when nothing could be sold.
 */
export function confirmFor(st, ids, label) {
  if (!st.shop) return null;
  const plan = sellPlan(st.items, ids, { locked: st.rules ? st.rules.locked : null, bids: st.shop.bids });
  if (!plan.lines.length) return { label, plan, empty: true };
  return { label, plan, empty: false };
}

/** The stacks "Sell junk" names: the loot filter's "sell" rule. */
export function junkOf(st) {
  return junkIds(st.items, st.rules);
}

/** The words for a confirmation: the question, then what is kept and why. */
export function confirmWords(c) {
  const p = c.plan;
  const n = p.lines.length;
  const lines = [];
  if (c.empty) lines.push(p.kept.length ? 'Everything chosen is locked, so nothing will be sold.' : 'The shop has no price for these yet.');
  else lines.push('Sell ' + (n === 1 ? itemName(p.lines[0].item) + ' ×' + p.lines[0].qty : n + ' stacks') + '?');
  if (p.kept.length) lines.push(p.kept.length + (p.kept.length === 1 ? ' locked stack is' : ' locked stacks are') + ' kept.');
  if (p.unpriced.length) lines.push(p.unpriced.length + (p.unpriced.length === 1 ? ' stack has' : ' stacks have') + ' no shop price and stays.');
  return lines;
}
