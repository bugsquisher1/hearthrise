// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/item-tip.js — THE ITEM TOOLTIP (bag, gear, shop, prep).
//
// One floating tooltip per page, shown on hover or keyboard focus of an item:
//   the name in its rarity, what kind of thing it is, its line of flavour,
//   its stats and — for gear — what changes against the piece worn in that
//   slot, where it comes from, what it is for, what the shop pays for it
//   (the server's bid, never a client price), its lock and loot rule.
// Display only: it reads the catalogue (src/shell/item-lore.js) and the
// numbers the window hands it from the envelope, and sends nothing.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.33';
import { whole, gold } from '../../render/format.js?v=0.2.33';
import { itemName } from '../widgets/bits.js?v=0.2.33';
import { kindWords, sourcesOf, usesOf, flavourOf, needOf } from '../item-lore.js?v=0.2.33';
import { statLines, compare, rarityOf } from '../bag-model.js?v=0.2.33';

const RULE_WORDS = Object.freeze({ keep: 'Keep', sell: 'Sell at the shop', ignore: 'Leave on the ground' });
const GAP = 10;

/**
 * The tooltip's HTML for one item.
 * @param {string} id
 * @param {{qty?:number, bid?:number|null, worn?:string|null, locked?:boolean, rule?:string|null, offers?:object[], skills?:object}} o
 */
function tipHtml(id, o) {
  const opt = o || {};
  const rar = rarityOf(id);
  let h = '<b class="hw-tip-name' + (rar ? ' rar-' + rar : '') + '">' + esc(itemName(id)) + '</b>'
    + '<span class="hw-tip-kind">' + esc(kindWords(id)) + '</span>';
  const fl = flavourOf(id);
  if (fl) h += '<i class="hw-tip-flavour">' + esc(fl) + '</i>';
  const stats = statLines(id);
  if (stats.length) h += '<dl class="hw-tip-stats">' + stats.map((s) => '<dt>' + esc(s.label) + '</dt><dd>' + esc(s.text) + '</dd>').join('') + '</dl>';
  if (stats.length && opt.worn !== undefined) {
    if (opt.worn === id) h += '<p class="hw-tip-cmp">You are wearing this.</p>';
    else {
      const d = compare(id, opt.worn);
      h += '<p class="hw-tip-cmp">' + (opt.worn ? 'Against your ' + esc(itemName(opt.worn)) : 'Against an empty slot') + ':</p>';
      h += d.length ? '<ul class="hw-tip-delta">' + d.map((x) => '<li class="' + (x.delta > 0 ? 'is-gain' : 'is-loss') + '">' + esc(x.text + ' ' + x.label) + '</li>').join('') + '</ul>'
        : '<p class="hw-tip-cmp">No change.</p>';
    }
  }
  const need = needOf(id, opt.skills);
  if (need) h += '<p class="hw-tip-need' + (need.short ? ' is-short' : '') + '">' + esc(need.text) + '</p>';
  const src = sourcesOf(id, opt.offers);
  if (src.length) h += '<p class="hw-tip-line"><small>Comes from</small>' + esc(src.join('. ')) + '</p>';
  h += '<p class="hw-tip-line"><small>Used for</small>' + esc(usesOf(id).join('. ')) + '</p>';
  if (opt.bid !== undefined) {
    const each = opt.bid === null ? 'The shop has not priced this yet' : 'The shop pays ' + gold(opt.bid) + ' each';
    const all = opt.bid !== null && opt.qty > 1 ? ' · ' + gold(opt.bid * opt.qty) + ' for ' + whole(opt.qty) : '';
    h += '<p class="hw-tip-line"><small>Value</small>' + esc(each + all) + '</p>';
  }
  if (opt.locked) h += '<p class="hw-tip-line"><small>Locked</small>Bulk sales never take it.</p>';
  if (opt.rule && RULE_WORDS[opt.rule]) h += '<p class="hw-tip-line"><small>On pickup</small>' + esc(RULE_WORDS[opt.rule]) + '</p>';
  return h;
}

function tipEl(doc) {
  let el = doc.querySelector('.hw-tip');
  if (!el) {
    el = doc.createElement('div');
    el.className = 'hw-tip';
    el.setAttribute('role', 'tooltip');
    doc.body.appendChild(el);
  }
  return el;
}

/** Show the tooltip for `id` beside `anchor` (kept on screen). */
export function showTip(doc, anchor, id, o) {
  const el = tipEl(doc);
  const key = id + '|' + JSON.stringify(Object.assign({}, o, { skills: undefined, offers: undefined }));
  if (el.getAttribute('data-for') !== key) { el.innerHTML = tipHtml(id, o); el.setAttribute('data-for', key); }
  el.classList.add('is-on');
  const view = doc.defaultView;
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = r.left - w - GAP;
  if (x < 4) x = r.right + GAP;
  if (x + w > view.innerWidth - 4) x = Math.max(4, view.innerWidth - w - 4);
  const y = Math.max(4, Math.min(view.innerHeight - h - 4, r.top));
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
}

/** Hide the tooltip. */
export function hideTip(doc) {
  const el = doc.querySelector('.hw-tip');
  if (el) el.classList.remove('is-on');
}
