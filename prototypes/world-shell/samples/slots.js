// prototypes/world-shell/samples/slots.js — SAMPLE 2 (prototype only; see slots.html).
import { ITEMS } from '../../../src/data/items.js';
import { PIXEL_DIR, fileFor } from '../../../src/data/item-art.js';

const RANK = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const it = (id) => ITEMS[id] || { n: id };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const kindOf = (id) => { const x = it(id); if (x.slot) return 'gear'; if (x.tag === 'key' || x.bop) return 'quest'; if (x.heals) return 'food'; return 'material'; };
const rarityOf = (id) => it(id).rarity || 'common';

/** One pocket. opts: n (count), key (bar key), state ('hover'|'sel'), worn. */
function slot(id, opts = {}) {
  if (!id) return '<span class="slot ' + (opts.locked ? 'is-locked' : 'is-empty') + '"></span>';
  const k = kindOf(id), r = rarityOf(id), rank = RANK.indexOf(r);
  const cls = ['slot', 'is-' + k];
  if (k === 'gear') cls.push('is-gear', r === 'mythic' ? 'is-mythic' : '');
  if (opts.state) cls.push('is-' + opts.state);
  const style = k === 'gear' ? ' style="--rc: var(--rar-' + r + ')"' : '';
  const pips = k === 'gear' && rank > 0 ? '<span class="pips">' + '<i></i>'.repeat(Math.min(rank, 5)) + '</span>' : '';
  return '<span class="' + cls.join(' ') + '"' + style + ' title="' + esc(it(id).n) + '">'
    + '<img src="' + PIXEL_DIR + fileFor(id) + '" alt="' + esc(it(id).n) + '">'
    + pips
    + (opts.key ? '<span class="key">' + opts.key + '</span>' : '')
    + (k === 'quest' ? '<span class="seal"></span>' : '')
    + (opts.worn ? '<span class="worn">Worn</span>' : '')
    + (opts.n > 1 ? '<span class="n">' + opts.n + '</span>' : '')
    + '</span>';
}
const cell = (html, label) => '<div class="cell">' + html + '<span>' + label + '</span></div>';

document.querySelector('[data-ladder]').innerHTML = ['bronze_sword', 'iron_sword', 'steel_sword', 'mithril_sword', 'rune_sword', 'dawn_sword']
  .map((id) => cell(slot(id), cap(rarityOf(id)))).join('');

document.querySelector('[data-kinds]').innerHTML = [
  cell(slot('iron_ore', { n: 22 }), 'Material'),
  cell(slot('cooked_trout', { n: 12, key: '1' }), 'Consumable, on key 1'),
  cell(slot('steel_helm'), 'Equipment (rare)'),
  cell(slot('bone_key'), 'Quest or key'),
].join('');

document.querySelector('[data-states]').innerHTML = [
  cell(slot('steel_sword'), 'Normal'),
  cell(slot('steel_sword', { state: 'hover' }), 'Hover or focus'),
  cell(slot('steel_sword', { state: 'sel' }), 'Selected'),
  cell(slot('steel_sword', { worn: true }), 'Worn'),
  cell(slot(null), 'Empty'),
  cell(slot(null, { locked: true }), 'Locked space'),
].join('');

/* Tooltips: name in the rarity colour, the kind line in the label face, stats as analyzer rows. */
function tip(id, n) {
  const x = it(id), k = kindOf(id), r = rarityOf(id);
  const kindLine = k === 'gear' ? cap(r) + ' ' + (x.weaponType || x.slot) : k === 'food' ? 'Food' : k === 'quest' ? 'Key, bound to you' : 'Material';
  const rows = [];
  if (x.atkB) rows.push(['Attack', '+' + x.atkB, 'is-gain']);
  if (x.strB) rows.push(['Strength', '+' + x.strB, 'is-gain']);
  if (x.defB) rows.push(['Defence', '+' + x.defB, 'is-gain']);
  if (x.heals) rows.push(['Heals', x.heals + ' HP', '']);
  if (x.buff) rows.push(['Then', '+' + x.buff.magnitude + '% XP for ' + Math.round(x.buff.durationMs / 60000) + ' min', '']);
  if (x.unlocks) rows.push(['Opens', cap(String(x.unlocks).replace(/_/g, ' ')), '']);
  if (x.reqLv) rows.push(['Requires', cap(x.reqSkill) + ' ' + x.reqLv, x.reqLv > 34 ? 'is-cost' : '']);
  const foot = k === 'quest' ? '<span>Cannot be sold or traded</span>' : '<span>' + (n ? n + ' in your bag' : 'Click to equip') + '</span><span class="gp">' + x.v + ' gp</span>';
  return '<section class="tip"' + (k === 'gear' ? ' style="--rc: var(--rar-' + r + ')"' : '') + '><header><img src="' + PIXEL_DIR + fileFor(id) + '" alt=""><div><b>' + esc(x.n) + '</b><small>' + esc(kindLine) + '</small></div></header>'
    + '<dl>' + rows.map(([a, b, c]) => '<div><dt>' + a + '</dt><dd' + (c ? ' class="' + c + '"' : '') + '>' + esc(b) + '</dd></div>').join('') + '</dl>'
    + '<footer>' + foot + '</footer></section>';
}
document.querySelector('[data-tips]').innerHTML = tip('steel_sword') + tip('mithril_sword') + tip('cooked_trout', 12) + tip('bone_key');
document.body.dataset.ready = '1';
