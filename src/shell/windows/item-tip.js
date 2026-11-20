// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/item-tip.js — THE ITEM TOOLTIP (bag, gear, shop, prep).
//
// One floating tooltip per page, shown on hover or keyboard focus of an item:
//   the name in its rarity, what kind of thing it is, its line of flavour,
//   its stats (its own attribute among them: a resistance, a bane) and — for gear — what changes against the piece worn in that
//   slot, what it does on the hero's ground, what its armor weight gives, where it comes from, what it is for, what the shop pays for it
//   (the server's bid, never a client price), its lock and loot rule.
// Display only: it reads the catalogue (src/shell/item-lore.js) and the
// numbers the window hands it from the envelope, and sends nothing.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.143';
import { whole, gold } from '../../render/format.js?v=0.2.143';
import { itemName } from '../widgets/bits.js?v=0.2.143';
import { kindWords, sourcesOf, usesOf, flavourOf, needOf, saleWords, groundEdgeWords, possiblePerksOf } from '../item-lore.js?v=0.2.143';
import { t } from '../../render/player-text.js?v=0.2.143';
import { statLines, compare, rarityOf } from '../bag-model.js?v=0.2.143';
import { planWords } from '../loot-dispatch.js?v=0.2.143';
import { pieceWords } from '../../data/armour-weights.js?v=0.2.143';
import { ITEMS } from '../../data/items.js?v=0.2.143';
import { JEWEL_PERKS, perkWords } from '../../data/jewelry.js?v=0.2.143';

const GAP = 10;

/**
 * The tooltip's HTML for one item.
 * @param {string} id
 * @param {{qty?:number, bid?:number|null, worn?:string|null, locked?:boolean, rule?:string|null, offers?:object[], skills?:object, level?:number|null, ground?:string|null, features?:string[]}} o
 *   ground: the hunt id of the hero's ground (widgets/first-target.js heroGroundOf), for the line on what the piece does there
 *   features: the server switches on for the hero's account (character-sections.js featuresOf), so a use behind one is named only there
 */
function tipHtml(id, o) {
  const opt = o || {};
  const rar = rarityOf(id);
  let h = '<b class="hw-tip-name' + (rar ? ' rar-' + rar : '') + '">' + esc(itemName(id)) + '</b>'
    + '<span class="hw-tip-kind">' + esc(kindWords(id)) + '</span>';
  const fl = flavourOf(id);
  if (fl) h += '<i class="hw-tip-flavour">' + esc(fl) + '</i>';
  /* The ladder's numbers and the piece's own attribute (a resistance, a bane) in the engine's numbers, one list (designer re-read 2026-11-11:
     the Bramble Blade's tip said only +2/+2; its bane was a line of its own until lane/a-compare-lines put it with the stats and the compare). */
  const stats = statLines(id);
  if (stats.length) h += '<dl class="hw-tip-stats">' + stats.map((s) => '<dt>' + esc(s.label) + '</dt><dd>' + esc(s.text) + '</dd>').join('') + '</dl>';
  /* A crafted piece's perks (src/data/jewelry.js), each in what a player sees; each counts once on a hero, however many pieces carry it. */
  const perks = ITEMS[id] && ITEMS[id].jewelPerks ? Object.entries(ITEMS[id].jewelPerks) : [];
  if (perks.length) h += '<dl class="hw-tip-stats hw-tip-perks">' + perks.map(([p, pm]) => '<dt>' + esc(JEWEL_PERKS[p] ? JEWEL_PERKS[p].name : p) + '</dt><dd>' + esc(perkWords(p, pm)) + '</dd>').join('') + '</dl>'
    + '<p class="hw-tip-line"><small>Perks</small>No stacking across pieces</p>';
  /* a plain crafted piece: the perks a gem set in it at its bench can add (item-lore.js possiblePerksOf) */
  const may = possiblePerksOf(id);
  if (may.length) h += '<p class="hw-tip-line"><small>' + esc(t('item.perks_possible')) + '</small>' + esc(may.join(', ')) + '</p>';
  /* ON THIS GROUND (lane/a-honest-lines): a unique that reads worse than the ladder's piece can still win where the hero hunts, by its
     bane or its resistance against the monsters there. Nothing when it does nothing special there, or no ground is known. */
  const edge = groundEdgeWords(id, opt.ground);
  if (edge) h += '<p class="hw-tip-line hw-tip-ground"><small>' + esc(edge.ground) + '</small>' + esc(edge.lines.join('. ')) + '</p>';
  if (stats.length && opt.worn !== undefined) {
    if (opt.worn === id) h += '<p class="hw-tip-cmp">Equipped</p>';
    else {
      /* ONE BLOCK, so the short screen's two columns (windows.css .hw-tip > *: break-inside avoid) never leave "vs Iron Sword:" at the foot
         of one column and its lines at the head of the next (a Bramble Blade's tip at 922x423 did, once its bane joined the list). */
      const d = compare(id, opt.worn);
      h += '<div class="hw-tip-vs"><p class="hw-tip-cmp">' + (opt.worn ? 'vs ' + esc(itemName(opt.worn)) : 'vs empty slot') + ':</p>';
      h += (d.length ? '<ul class="hw-tip-delta">' + d.map((x) => '<li class="' + (x.delta > 0 ? 'is-gain' : 'is-loss') + '">' + esc(x.text + ' ' + x.label) + '</li>').join('') + '</ul>'
        : '<p class="hw-tip-cmp">No change.</p>') + '</div>';
    }
  }
  /* what its weight gives (Tyler 2026-10-25: players did not know heavy, medium and light differ) */
  const wt = pieceWords(id);
  if (wt) h += '<p class="hw-tip-line hw-tip-weight"><small>' + esc(wt.head) + '</small>' + esc(wt.text) + '</p>';
  const need = needOf(id, opt.skills, opt.level);
  if (need) h += '<p class="hw-tip-need' + (need.short ? ' is-short' : '') + '">' + esc(need.text) + '</p>';
  const src = sourcesOf(id, opt.offers);
  if (src.length) h += '<p class="hw-tip-line"><small>Comes from</small>' + esc(src.join('. ')) + '</p>';
  h += '<p class="hw-tip-line"><small>Used for</small>' + esc(usesOf(id, opt.features).join('. ')) + '</p>';
  /* The server's bid, for what the bag holds. No bid: the row says who won't buy it; the shop bids only on bag stacks, so an
     item the bag doesn't hold (a Buy row) just has no value line. */
  const sale = saleWords(id);
  if (opt.bid !== undefined && opt.bid !== null) {
    h += '<p class="hw-tip-line"><small>Value</small>' + esc('The shop pays ' + gold(opt.bid) + ' each' + (opt.qty > 1 ? ', ' + gold(opt.bid * opt.qty) + ' for ' + whole(opt.qty) : '')) + '</p>';
  }
  if (sale) h += '<p class="hw-tip-line"><small>' + (opt.bid === undefined || opt.bid === null ? 'Value' : 'Market') + '</small>' + esc(sale) + '</p>';
  if (opt.locked) h += '<p class="hw-tip-line"><small>Locked</small>Bulk sales never take it.</p>';
  if (opt.rule) h += '<p class="hw-tip-line"><small>' + (opt.rule === 'ignore' ? 'On pickup' : 'Loot plan') + '</small>' + esc(planWords(opt.rule)) + '</p>';
  return h;
}

/* TOUCH (panel 2026-11-01: a tapped Bones' tooltip lay over Burn all; a card showed in the Shop with no tap at all): the
   browser's emulated hover shows a tip only for the item just pressed, beside the sheet and never on it (the anchor
   below is the sheet), it takes no press (windows.css), and the next press anywhere puts it away. */
let pressed = null, tipFor = null;
const touching = (doc) => !!doc.documentElement && doc.documentElement.classList.contains('is-touch');
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('pointerdown', (e) => { pressed = e.target; if (touching(document) && !(tipFor && tipFor.contains(pressed))) hideTip(document, true); }, true);
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
  const touch = touching(doc);
  if (touch && !(pressed && anchor.contains(pressed))) return;
  tipFor = anchor;
  const el = tipEl(doc);
  const key = id + '|' + JSON.stringify(Object.assign({}, o, { skills: undefined, offers: undefined }));
  if (el.getAttribute('data-for') !== key) { el.innerHTML = tipHtml(id, o); el.setAttribute('data-for', key); }
  el.classList.add('is-on');
  const view = doc.defaultView;
  const r = ((touch && anchor.closest('.hs-win')) || anchor).getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = r.left - w - GAP;
  if (x < 4) x = touch ? 4 : r.right + GAP;
  if (x + w > view.innerWidth - 4) x = Math.max(4, view.innerWidth - w - 4);
  const y = Math.max(4, Math.min(view.innerHeight - h - 4, r.top));
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
}

/** Hide the tooltip. On touch only a press does (`byPress`): the emulated hover's mouseout fires when the row it points at moves. */
export function hideTip(doc, byPress) {
  if (touching(doc) && !byPress) return;
  const el = doc.querySelector('.hw-tip');
  if (el) el.classList.remove('is-on');
}

/** Put the tooltip away when what it points at has gone: its window closing (the hotkey fires no mouseout: a Raw Shrimp tip stood over the World
    through mouse moves and a hunt start, designer re-read 2026-11-11) or its row no longer drawn. The shell calls it after every window change. */
export function hideTipIfGone(doc) {
  if (!tipFor) return;
  if (tipFor.isConnected && !(tipFor.closest && tipFor.closest('.is-leaving'))) return;
  tipFor = null;
  const el = doc.querySelector('.hw-tip');
  if (el) el.classList.remove('is-on');
}
