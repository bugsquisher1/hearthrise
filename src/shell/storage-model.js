// ════════════════════════════════════════════════════════════════════════
// src/shell/storage-model.js — HOW THE STORAGE WINDOW SORTS AND FILTERS.
//
// PURE (no DOM). Tyler 10-22: "storage doesn't have a way to sort or filter."
// The Storage window shows the server's depot and bag (src/session/item-
// sections.js bankOf / bagOf) through the Inventory's own view (bag-model.js
// `view`: a kind chip, the "Find an item" search, a sort). This file only
// keeps what the Storage window remembers, all of it display-only residue
// (src/session/residue.js): it gates nothing and spends nothing.
//
//   storePrefsOf(residue)        the remembered kind chip and sort (`storeView`)
//   markStored(seen, items, max) the "recently added" marks (`storeSeen`) after
//                                this paint: one per stack in storage now, a
//                                stack that grew becomes the newest; null when
//                                nothing changed (no write)
// ════════════════════════════════════════════════════════════════════════
import { BAG_CATS, BAG_SORTS } from './bag-model.js?v=0.2.36';

const CAT_IDS = new Set(BAG_CATS.map(([id]) => id));
const SORT_IDS = new Set(BAG_SORTS.map(([id]) => id));

/** The Storage window's remembered chip and sort (residue `storeView`), falling back to All / Type. */
export function storePrefsOf(residue) {
  const v = residue && residue.storeView;
  return { cat: v && CAT_IDS.has(v.cat) ? v.cat : 'all', sort: v && SORT_IDS.has(v.sort) ? v.sort : 'type' };
}

/**
 * The storage's marks after a paint: exactly the stacks in `items`, each [count, order]. The first
 * marking puts every stack at 0 (nothing reads as new on the first look); a stack that is new or grew
 * takes the next order; a stack that shrank keeps its own. A stack taken out loses its mark, so storing
 * it again later is "recently added". Null when nothing changed, or when there are more stacks than the
 * residue keeps (it would drop a mark and this would write it back on every paint).
 */
export function markStored(seen, items, max) {
  const list = items || [];
  if (list.length > max) return null;
  const prev = seen && typeof seen === 'object' ? seen : null;
  const out = {};
  let next = 0;
  if (prev) for (const v of Object.values(prev)) if (v[1] >= next) next = v[1] + 1;
  for (const { id, qty } of list) {
    const s = prev && prev[id];
    out[id] = [qty, !prev ? 0 : s && qty <= s[0] ? s[1] : next++];
  }
  if (prev) {
    const keys = Object.keys(prev);
    if (keys.length === list.length && keys.every((id) => out[id] && out[id][0] === prev[id][0] && out[id][1] === prev[id][1])) return null;
  }
  return out;
}
