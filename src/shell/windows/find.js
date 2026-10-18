// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/find.js — FIND AN ITEM ACROSS YOUR CHARACTERS (QoL 5).
//
// One search box: where is it? Each line names the character, where the item
// sits (bag, bank or worn) and how many. The answer is the server's account-
// wide read (AccountSession.findItems → hr_account_items). Until the server
// answers it — or while that read is not on the server yet — the lines come
// from the envelopes of the characters open on this page (their bag, bank and
// worn set), and the window says which it is showing. Read only.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, element } from '../../render/paint.js?v=0.2.0';
import { whole } from '../../render/format.js?v=0.2.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.0';
import { glyphSvg } from '../launcher.js?v=0.2.0';
import { itemIconHtml, itemName } from '../widgets/bits.js?v=0.2.0';
import { nameOf } from '../../session/item-sections.js?v=0.2.0';

const WHERE = Object.freeze({ bag: 'in the bag', bank: 'in the bank', worn: 'worn' });
const DEBOUNCE_MS = 300;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { q: '', rows: null, from: null, timer: null, asked: '' }; SCRATCH.set(cs, s); } return s; };

/* The open characters' own envelopes, searched by item name. */
function localRows(peers, q) {
  const out = [];
  for (const p of peers) {
    const name = nameOf(p) || 'Character ' + (p.slot + 1);
    const add = (map, where) => { if (map && typeof map === 'object') for (const [id, v] of Object.entries(map)) {
      const qty = where === 'worn' ? 1 : v;
      const item = where === 'worn' ? v : id;
      if (typeof item === 'string' && Number.isSafeInteger(qty) && qty > 0 && itemName(item).toLowerCase().includes(q)) out.push({ slot: p.slot, name, item, qty, where });
    } };
    add(p.read('inventory'), 'bag');
    add(p.read('bank'), 'bank');
    add(p.read('equipment'), 'worn');
  }
  return out;
}

/** The skeleton (built once per opening). */
export function renderFind(ctx) {
  return '<div class="hw-find-all">'
    + '<span class="hw-search">' + glyphSvg(ctx.glyphs, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="q" placeholder="Item name" aria-label="Find an item" autocomplete="off"></span>'
    + '<p class="hw-cap"><span class="hw-find-from"></span></p>'
    + '<ul class="hw-ledger hw-found"></ul><p class="hh-empty hw-found-none"></p></div>';
}

renderFind.patch = function patchFind(body, ctx) {
  const sc = scratchOf(ctx.character);
  const root = body.querySelector('.hw-find-all');
  const q = sc.q.trim().toLowerCase();
  const list = q.length < 2 ? [] : (sc.rows && sc.asked === q ? sc.rows : localRows(ctx.peers(), q));
  const from = q.length < 2 ? '' : sc.rows && sc.asked === q ? 'All your characters' : 'Characters open here (the account-wide search is not on the server yet)';
  text(root.querySelector('.hw-find-from'), from);
  rows(root.querySelector('.hw-found'), list, {
    key: (r) => r.slot + ':' + r.where + ':' + r.item,
    build: (r) => element(ctx.doc, '<li class="hw-line"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.item) + '</span><span class="hw-line-name"><b>' + esc(itemName(r.item)) + '</b><small></small></span></li>'),
    patch: (li, r) => text(li.querySelector('small'), (r.name || 'Character ' + (r.slot + 1)) + ' · ' + WHERE[r.where] + (r.where === 'worn' ? '' : ' · ×' + whole(r.qty))),
  });
  const none = root.querySelector('.hw-found-none');
  cls(none, 'is-on', !list.length);
  text(none, q.length < 2 ? 'Type two letters or more to see where an item is.' : 'None of your characters has that.');
};

renderFind.events = Object.freeze(['input']);

renderFind.act = function actFind(ctx, body, action, ev, t) {
  if (action !== 'q' || ev.type !== 'input') return false;
  const sc = scratchOf(ctx.character);
  sc.q = t.value.slice(0, 40);
  renderFind.patch(body, ctx);
  clearTimeout(sc.timer);
  const q = sc.q.trim().toLowerCase();
  if (!ctx.account || q.length < 2) return false;
  sc.timer = setTimeout(async () => {
    const r = await ctx.account.findItems(q);
    if (sc.q.trim().toLowerCase() !== q) return;
    sc.asked = q;
    sc.rows = r.ok ? r.rows : null;
    renderFind.patch(body, ctx);
  }, DEBOUNCE_MS);
  return false;
};
