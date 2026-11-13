// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/elsewhere.js — "FIND AN ITEM": WHERE ELSE IT IS.
//
// Finding an item is the Inventory's own search (Tyler 10-18: not a window of
// its own). The grid shows the matches in this bag; under it, this part lists
// where ELSE the item is: the account's storage (ONE for every character,
// 2026-11-27-account-depot.sql) and every other character's bag and worn set.
// The list is ONLY the server's account-wide read (AccountSession.findItems →
// hr_account_items, 2026-10-25-account-items.sql): until it answers this search
// the list says "Searching…", and a refused or lost read says so with no rows.
// Nothing here builds a list from the envelopes open on this page (§1, §6).
// Read only.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, element } from '../../../render/paint.js?v=0.2.125';
import { whole } from '../../../render/format.js?v=0.2.125';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.125';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.125';

const WHERE = Object.freeze({ bag: 'in the bag', worn: 'worn' });
const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
const SEARCHING = 'Searching…';
const FROM_SERVER = 'All your characters';
const NO_ANSWER = 'The search did not go through, so nothing is listed. Change the search to try again.';
const SCRATCH = new WeakMap();
/* `want`: the search last sent; `asked` and `rows`: the search the server answered and its rows (null: refused or lost). */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { rows: null, timer: null, asked: '', want: '' }; SCRATCH.set(cs, s); } return s; };

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
  const answered = sc.asked === q;
  const list = answered && sc.rows ? sc.rows.filter((r) => !(r.slot === cs.slot && r.where === 'bag')) : [];
  text(box.querySelector('.hw-find-from'), !answered ? SEARCHING : sc.rows ? FROM_SERVER : NO_ANSWER);
  rows(box.querySelector('.hw-found'), list, {
    key: (r) => (r.slot === null ? 'account' : r.slot) + ':' + r.where + ':' + r.item,
    build: (r) => element(ctx.doc, '<li class="hw-line"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.item) + '</span><span class="hw-line-name"><b>' + esc(itemName(r.item)) + '</b><small></small></span></li>'),
    patch: (li, r) => text(li.querySelector('small'), (r.where === 'bank' ? 'In storage (all your characters)'
      : (r.slot === cs.slot ? 'This character' : (r.name || 'Character ' + (r.slot + 1))) + ' · ' + WHERE[r.where]) + (r.where === 'worn' ? '' : ' · ×' + whole(r.qty))),
  });
  /* "Nowhere else." comes only from the server's answer: never while it searches, never after a read that failed. */
  const none = box.querySelector('.hw-found-none');
  cls(none, 'is-on', answered && !!sc.rows && !list.length);
  text(none, 'Nowhere else.');
}

/** The search text changed: ask the server's account-wide read once the typing pauses. Only the last search's answer is kept. */
export function askElsewhere(ctx, query, repaint) {
  const sc = scratchOf(ctx.character);
  clearTimeout(sc.timer);
  const q = String(query || '').trim().toLowerCase();
  if (q.length < MIN_QUERY) return;
  sc.want = q;
  if (!ctx.account) { sc.asked = q; sc.rows = null; repaint(); return; }
  sc.timer = setTimeout(async () => {
    const r = await ctx.account.findItems(q);
    if (sc.want !== q) return;
    sc.asked = q;
    sc.rows = r.ok ? r.rows : null;
    repaint();
  }, DEBOUNCE_MS);
}
