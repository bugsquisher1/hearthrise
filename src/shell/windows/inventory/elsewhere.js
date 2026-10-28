// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/elsewhere.js — "FIND AN ITEM": WHERE ELSE IT IS.
//
// Finding an item is the Inventory's own search (Tyler 10-18: not a window of
// its own). The grid shows the matches in this bag; under it, this part lists
// where ELSE the item is: the account's storage (ONE for every character,
// 2026-11-27-account-depot.sql) and every other character's bag and worn set. The answer is the server's account-wide read
// (AccountSession.findItems → hr_account_items); until the server answers, or
// while that read is not on the server yet, the lines come from the envelopes
// of the characters open on this page, and the list says which it is showing.
// Read only.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, element } from '../../../render/paint.js?v=0.2.59';
import { whole } from '../../../render/format.js?v=0.2.59';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.59';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.59';
import { nameOf } from '../../../session/item-sections.js?v=0.2.59';

const WHERE = Object.freeze({ bag: 'in the bag', worn: 'worn' });
const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { rows: null, timer: null, asked: '' }; SCRATCH.set(cs, s); } return s; };

/* The open characters' own envelopes, searched by item name. The storage is the account's: every
   envelope carries the same one, so it is listed once (slot null), from the first open character. */
function localRows(peers, q) {
  const out = [];
  let bankDone = false;
  for (const p of peers) {
    const name = nameOf(p) || 'Character ' + (p.slot + 1);
    const add = (map, where) => { if (map && typeof map === 'object') for (const [id, v] of Object.entries(map)) {
      const qty = where === 'worn' ? 1 : v;
      const item = where === 'worn' ? v : id;
      if (typeof item === 'string' && Number.isSafeInteger(qty) && qty > 0 && itemName(item).toLowerCase().includes(q)) out.push({ slot: where === 'bank' ? null : p.slot, name: where === 'bank' ? null : name, item, qty, where });
    } };
    add(p.read('inventory'), 'bag');
    if (!bankDone && p.read('bank')) { add(p.read('bank'), 'bank'); bankDone = true; }
    add(p.read('equipment'), 'worn');
  }
  return out;
}

/** The list's skeleton, inside the bag pane under the grid. */
export function elsewhereHtml() {
  return '<div class="hw-elsewhere"><h3 class="hw-ledger-head is-on">Also found</h3><p class="hw-cap"><span class="hw-find-from"></span></p>'
    + '<ul class="hw-ledger hw-found"></ul><p class="hh-empty hw-found-none"></p></div>';
}

/** Draw where else `query` is; nothing at all under two letters. The open bag's own stacks are the grid's. */
export function patchElsewhere(pane, ctx, query) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const box = pane.querySelector('.hw-elsewhere');
  const q = String(query || '').trim().toLowerCase();
  cls(box, 'is-on', q.length >= MIN_QUERY);
  if (q.length < MIN_QUERY) return;
  const server = sc.rows && sc.asked === q;
  const all = server ? sc.rows : localRows(ctx.peers(), q);
  const list = all.filter((r) => !(r.slot === cs.slot && r.where === 'bag'));
  text(box.querySelector('.hw-find-from'), server ? 'All your characters' : 'Characters open here (the account-wide search is not on the server yet)');
  rows(box.querySelector('.hw-found'), list, {
    key: (r) => (r.slot === null ? 'account' : r.slot) + ':' + r.where + ':' + r.item,
    build: (r) => element(ctx.doc, '<li class="hw-line"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.item) + '</span><span class="hw-line-name"><b>' + esc(itemName(r.item)) + '</b><small></small></span></li>'),
    patch: (li, r) => text(li.querySelector('small'), (r.where === 'bank' ? 'In storage (all your characters)'
      : (r.slot === cs.slot ? 'This character' : (r.name || 'Character ' + (r.slot + 1))) + ' · ' + WHERE[r.where]) + (r.where === 'worn' ? '' : ' · ×' + whole(r.qty))),
  });
  const none = box.querySelector('.hw-found-none');
  cls(none, 'is-on', !list.length);
  text(none, 'Nowhere else.');
}

/** The search text changed: ask the server's account-wide read once the typing pauses. */
export function askElsewhere(ctx, query, repaint) {
  const sc = scratchOf(ctx.character);
  clearTimeout(sc.timer);
  const q = String(query || '').trim().toLowerCase();
  if (!ctx.account || q.length < MIN_QUERY) return;
  sc.timer = setTimeout(async () => {
    const r = await ctx.account.findItems(q);
    sc.asked = q;
    sc.rows = r.ok ? r.rows : null;
    repaint();
  }, DEBOUNCE_MS);
}
