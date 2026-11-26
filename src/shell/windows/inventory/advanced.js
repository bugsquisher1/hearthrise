// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/advanced.js — THE INVENTORY'S ADVANCED VIEW.
//
// Off by default (Tyler 10-18: the clean view is the doll, the items and the
// gold); the toggle is remembered (residue `bagView.advanced`, display only).
// On, a section under the two columns lists:
//   Active effects  the server's buff queue (`buffs`): name, effect, time left
//   Worn set        the hunt role the worn weapon gives and the set's totals
//                   from the catalogue rows of what the server says is worn
//   Imbuements      per equip slot, the imbuement it wears and its hunted time
//                   left (21 section 3.6). Drawn ONLY when the server sends
//                   `imbues` (dark while the `imbuements` switch is off): never
//                   an empty placeholder.
// Read only; every number is the envelope's.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../data/items.js';
import { HUNT_ROLES } from '../../../data/hunt-roles.js';
import { BUFFS_DEF } from '../../../core/buffs.js';
import { buffsOf, imbuesOf, roleOf } from '../../../session/item-sections.js';
import { partyOf } from '../../../session/hunt-sections.js';
import { rows, text, cls, element } from '../../../render/paint.js';
import { escapeHtml as esc } from '../../../utils/dom.js';
import { itemName } from '../../widgets/bits.js';
import { DOLL } from './doll.js';

const TOTALS = Object.freeze([['atkB', 'Melee accuracy'], ['strB', 'Melee damage'], ['defB', 'Defense'], ['rangeAtkB', 'Ranged'], ['magicAtkB', 'Magic']]);
const SLOT_LABEL = new Map(DOLL.map(([s, l]) => [s, l]));

/** "1 h 20 min" / "12 min" / "under a minute". */
function timeLeft(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'under a minute';
  return m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min';
}

/** The section's skeleton. */
export function advancedHtml() {
  return '<section class="hw-advanced">'
    + '<h3 class="hw-ledger-head is-on">Active effects</h3><ul class="hw-ledger hw-buffs"></ul><p class="hh-empty hw-buffs-none">No food or drink effects right now.</p>'
    + '<h3 class="hw-ledger-head is-on">Worn set</h3><p class="hw-role"></p>'
    + '<dl class="hw-totals">' + TOTALS.map(([k, l]) => '<div><dt>' + esc(l) + '</dt><dd data-total="' + k + '"></dd></div>').join('') + '</dl>'
    + '<div class="hw-imbue"><h3 class="hw-ledger-head is-on">Imbuements</h3><ul class="hw-ledger hw-imbue-list"></ul></div>'
    + '</section>';
}

/** The role words: the server's role for the worn weapon, or the party's reading of it. */
function roleWords(cs, eq) {
  const r = roleOf(cs);
  let id = r ? r.id : null;
  if (!id) {
    const p = partyOf(cs);
    const me = p && p.members.find((m) => m.unit === p.self);
    id = me ? me.role : null;
  }
  const w = eq.weapon ? itemName(eq.weapon) : null;
  if (id && HUNT_ROLES[id]) return 'Role: ' + HUNT_ROLES[id].label + (w ? ', from the ' + w : '');
  return w ? 'Role: none yet for the ' + w : 'Role: none, no weapon';
}

function buffWords(b) {
  const d = BUFFS_DEF[b.type];
  const label = d ? d.label : b.type.replace(/_/g, ' ');
  const amount = d && d.isPercent ? '+' + b.magnitude + '%' : '+' + b.magnitude;
  return [label, amount + ', ' + timeLeft(b.msLeft) + ' left'];
}

/** Patch the section; it is hidden (and left alone) while the Advanced view is off. */
export function patchAdvanced(root, st, ctx) {
  const box = root.querySelector('.hw-advanced');
  cls(box, 'is-on', st.prefs.advanced);
  if (!st.prefs.advanced) return;
  const cs = st.cs;
  const buffs = buffsOf(cs) || [];
  rows(box.querySelector('.hw-buffs'), buffs, {
    key: (b) => b.type,
    build: () => element(ctx.doc, '<li class="hw-line hw-buff"><span class="hw-line-name"><b></b><small></small></span></li>'),
    patch: (li, b) => { const [n, w] = buffWords(b); text(li.querySelector('b'), n); text(li.querySelector('small'), w); },
  });
  cls(box.querySelector('.hw-buffs-none'), 'is-on', !buffs.length);
  text(box.querySelector('.hw-role'), roleWords(cs, st.eq));
  for (const [k] of TOTALS) {
    const v = Object.values(st.eq).reduce((s, id) => s + (ITEMS[id] && Number.isFinite(ITEMS[id][k]) ? ITEMS[id][k] : 0), 0);
    text(box.querySelector('[data-total="' + k + '"]'), v > 0 ? '+' + v : '0');
  }
  const imb = imbuesOf(cs);
  const imbBox = box.querySelector('.hw-imbue');
  const lines = imb ? DOLL.filter(([s]) => imb[s] && st.eq[s]).map(([s]) => ({ slot: s, item: st.eq[s], v: imb[s] })) : [];
  cls(imbBox, 'is-on', lines.length > 0);
  rows(imbBox.querySelector('.hw-imbue-list'), lines, {
    key: (l) => l.slot,
    build: () => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span></li>'),
    patch: (li, l) => {
      text(li.querySelector('b'), SLOT_LABEL.get(l.slot) + ': ' + itemName(l.item));
      text(li.querySelector('small'), l.v.name + ' · ' + timeLeft(l.v.msLeft) + ' left');
    },
  });
}
