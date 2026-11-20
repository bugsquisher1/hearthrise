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
import { bagOf, bagCapOf, goldOf, rulesOf, shopOf, equipmentOf, huntLootOf } from '../../../session/item-sections.js';
import { settingsOf, analyzerOf } from '../../../session/hunt-sections.js';
import { BAG_CATS, BAG_SORTS, view, kindOf, equipSlotFor, sellPlan, namedFuelOf, outgrownIds, upgradeWanted, isSuperRare } from '../../bag-model.js';
import { isRareOnly } from '../../hunt-ground-facts.js';
import { barKind, barIndexOf } from '../../bar-assign.js';
import { itemName } from '../../widgets/bits.js';
import { buryRecipeOf, buryLabel, buryQty } from './bury.js';
import { bundleOutfitOf, bundleUseBlock } from './outfit-bundle.js';
import { patternRowOf, learnBlock } from './pattern.js';
import { upgradeOf } from '../../widgets/upgrade-line.js';
import { tickOf } from '../../town-work.js';
import { ITEMS } from '../../../data/items.js';
import { REFUSAL_WORDS } from '../../../data/refusal-words.js';
import { heroVitalsOf } from '../../../session/character-sections.js';
import { t } from '../../../render/player-text.js';

const SCRATCH = new WeakMap();
const CAT_IDS = new Set(BAG_CATS.map(([id]) => id));
const SORT_IDS = new Set(BAG_SORTS.map(([id]) => id));

/** This character's Inventory scratch (made on first use). */
export function scratchOf(cs) {
  let s = SCRATCH.get(cs);
  if (!s) {
    s = { tab: 'bag', query: '', sel: new Set(), cursor: null, anchor: null, base: null, menu: null, menuOwner: null, confirm: null, planCopy: null, slot: null,
      pending: false, wearing: null, msg: '', msgAt: null, shownNew: new Set(), press: null, pressed: false, touch: false };
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
  const rules = rulesOf(cs), eq = equipmentOf(cs) || {}, upgrade = upgradeOf(cs);
  return { cs, account: ctx.account || null, items: list, loaded: !!items, cap: bagCapOf(cs), gold: goldOf(cs), rules, shop, eq,
    bar: settingsOf(cs), prefs, sc, seen, unmarked: !stored, shown, qty: new Map(list.map((r) => [r.id, r.qty])),
    /* What "Equip upgrades" would put on (src/shell/upgrade-plan.js), from the same server sections. */
    upgrade,
    /* What "Select outgrown" selects (bag-model.js outgrownIds, Rares in): read off the server's bag, worn set and rules; never a locked stack. */
    outgrown: outgrownIds(list, eq, rules, { wanted: upgradeWanted(upgrade) }).filter((id) => !(rules && rules.locked.has(id))),
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

/** Why Eat is off for `id`, or '' (the press goes and the server answers): the engine's own refusal (eat.js
    already_full) for a food that brings no buff while the server's HP is at its max. An unknown HP never blocks. */
export function eatBlock(cs, id) {
  const b = ITEMS[id] && ITEMS[id].buff;
  if (b && typeof b === 'object' && typeof b.type === 'string') return '';
  const v = heroVitalsOf(cs);
  return Number.isFinite(v.hp) && Number.isFinite(v.hpMax) && v.hpMax > 0 && v.hp >= v.hpMax ? REFUSAL_WORDS.already_full : '';
}

/** The one primary action for a stack: [verb, label], or null. */
export function primaryOf(st, id) {
  if (!id || !st.qty.has(id)) return null;
  const k = kindOf(id);
  if (k === 'gear') return equipSlotFor(id, st.eq) ? ['equip', t('controls.equip')] : null;
  if (k === 'food') return ['eat', 'Eat'];
  if (barKind(id) && st.bar && barIndexOf(st.cs, id) < 0) return ['bar', 'Put on the bar'];
  const br = buryRecipeOf(id);
  if (br) return ['bury', buryLabel(br, buryQty(st.cs, id), st.cs)];
  /* a named fuel burns alone in the Great Hearth (bury.js burnNamed) */
  if (namedFuelOf(id)) return ['hearth', 'Burn'];
  /* an outfit's bundle is USED (QA gate 2026-11-17: the strip offered only Sell for the Key Warden); once the server says the hero owns the
     outfit, the bundle is kept to sell or trade and Sell is its press */
  if (bundleOutfitOf(id) && !bundleUseBlock(st.cs, id)) return ['use', t('controls.use')];
  /* a pattern is LEARNED by this hero (pattern.js); once the server says it knows it, the pattern is kept to sell or trade */
  if (patternRowOf(id) && !learnBlock(st.cs, id)) return ['learn', t('controls.learn')];
  if (st.shop && st.shop.bids.has(id) && !(st.rules && st.rules.locked.has(id))) return ['sell', t('controls.sell')];
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

/** The words for a confirmation: the question, then what is kept and why. */
export function confirmWords(c) {
  const p = c.plan;
  const n = p.lines.length;
  const lines = [];
  if (c.empty) lines.push(p.kept.length ? 'Everything chosen is locked, so nothing will be sold.' : 'The shop has no price for these yet.');
  else lines.push('Sell ' + (n === 1 ? itemName(p.lines[0].item) + ' ×' + p.lines[0].qty : n + ' stacks') + '?');
  if (p.kept.length) lines.push(p.kept.length + (p.kept.length === 1 ? ' locked stack is' : ' locked stacks are') + ' kept.');
  if (p.unpriced.length) lines.push(p.unpriced.length + (p.unpriced.length === 1 ? ' stack has' : ' stacks have') + ' no shop price and stays.');
  /* a Rare in the sale is said before the press (never sold unasked, Tyler 2026-10-14), and so is what one sale's 64 stacks leave (audit F18) */
  const rares = c.empty ? 0 : p.lines.filter((l) => isRareOnly(l.item)).length;
  /* ...and a chest's super-rare (the Key Warden bundle, chests.js CHEST_OUTFITS), named so a 0.2% find is never sold on one glance */
  const supers = c.empty ? 0 : p.lines.filter((l) => isSuperRare(l.item)).length;
  const labels = [supers ? t('bag.confirm_super_rares', { count: supers }) : '', rares ? t('bag.confirm_rares', { count: rares }) : '',
    p.more ? t('bag.confirm_remaining', { count: p.more }) : ''].filter(Boolean);
  if (labels.length) lines.push(labels.join(', '));
  return lines;
}
