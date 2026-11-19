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
//   materialsToStore(bag, bank, depot, locked)  what "Deposit all materials"
//                                names: { ids, left } (audit 2026-11-18 A8)
//   queuePress(queue, press)     a press made while another is out joins the
//                                queue, merged with one on the same stack
//   nextBatch(queue)             what the queue sends next: { take, rest }
//   storeAwayWords(cs)           why a move is off while the hero's session is open: the hunt's
//                                "Storage is in town", or at the yard "Stop training to use Storage"
// ════════════════════════════════════════════════════════════════════════
import { BAG_CATS, BAG_SORTS, kindOf } from './bag-model.js?v=0.2.140';
import { busyWords } from './training-words.js?v=0.2.140';
import { t } from '../render/player-text.js?v=0.2.140';

/**
 * WHY STORAGE IS OFF WHILE THE HERO IS OUT, IN THE PLAYER'S TERMS (post-140 audit C7, Storage's half): the server refuses every bank move during
 * any open session (hr_hunt_lock), so the moves stay off; on a hunt the chest is at home and the hero is not ("Storage is in town"), at the
 * Training Yard the press that frees it is Stop ("Stop training to use Storage", training-words.js busyWords). The Storage window's note, its
 * press's answer and the bag's Deposit all say this one sentence. Pure over the server's `hunt`.
 */
export function storeAwayWords(cs) {
  return busyWords(cs, t('bag.storage_away'), 'training.busy_storage');
}

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

/**
 * "DEPOSIT ALL MATERIALS" (audit 2026-11-18 A8: a full bag at Level 45 took 46 shift-clicks): the bag's Material stacks (bag-model.js kindOf), in the
 * bag's order, never a locked one (a lock keeps a stack in the bag; the server refuses item_locked), and only as many NEW kinds as Storage has room for
 * (`depot`: the server's used / cap / kept for listings; a kind Storage already holds merges and takes none), so ONE hr_bank_move_many (all or nothing)
 * is not refused whole for one stack too many. `left`: the materials that do not fit. Pure: ids only, the server moves each stack at its own count.
 * @param {{id:string, qty:number}[]} bag
 * @param {{id:string}[]|null} bank
 * @param {{used:number, cap:number, reserved?:number}|null} depot  null (not read yet): the server judges the room
 * @param {Set<string>|null} locked
 */
export function materialsToStore(bag, bank, depot, locked) {
  const held = new Set((bank || []).map((r) => r.id));
  let room = depot ? Math.max(0, depot.cap - depot.used - (depot.reserved || 0)) : Infinity;
  const ids = [];
  let left = 0;
  for (const r of bag || []) {
    if (kindOf(r.id) !== 'material' || (locked && locked.has(r.id))) continue;
    if (held.has(r.id)) ids.push(r.id);
    else if (room > 0) { ids.push(r.id); room--; } else left++;
  }
  return { ids, left };
}

/**
 * PRESSES QUEUE, THEY ARE NEVER DROPPED OR REFUSED FOR SPEED (audit 2026-11-18 A8: two presses a second dropped some while one was out and the rest met
 * "Too many changes, try again"). A press made while another is out joins the queue: one on a stack already queued the same way is merged with it (a
 * count adds, a whole stack wins), so a burst becomes few asks. A press is { id, dir: 'deposit'|'withdraw', qty: n|'all' }. Returns the new queue. Pure.
 */
export function queuePress(queue, press) {
  const q = (queue || []).slice();
  const same = q.findIndex((p) => p.id === press.id && p.dir === press.dir);
  if (same < 0) return q.concat([{ ...press }]);
  const had = q[same];
  q[same] = { ...had, qty: had.qty === 'all' || press.qty === 'all' ? 'all' : had.qty + press.qty };
  return q;
}

/**
 * What the queue sends next: the head press, with every other WHOLE-stack press of its direction when the head is one (ONE hr_bank_move_many for all
 * of them: one ask, one rate token, all or nothing), else the head alone (ONE hr_bank_move at its count). { take, rest }. Pure.
 */
export function nextBatch(queue) {
  const q = queue || [];
  if (!q.length) return { take: [], rest: [] };
  const head = q[0];
  const take = head.qty === 'all' ? q.filter((p) => p.qty === 'all' && p.dir === head.dir) : [head];
  return { take, rest: q.filter((p) => !take.includes(p)) };
}
