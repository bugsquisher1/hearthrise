// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/pockets.js — ONE POCKET: THE ITEM SLOT EVERY GRID SHARES.
//
// The Inventory's bag grid and the Storage window draw the same pocket: a sunk
// 36 px square holding the item's 32 px pixel icon at ×1 (a whole-number scale:
// Tyler 10-18, "the items are far too big"), the count in the corner, gear
// framed in its rarity with rank pips (colour is never the only cue), and the
// marks a grid adds (new, locked, the bar key). Built once per stack, patched
// in place. Display only.
// ════════════════════════════════════════════════════════════════════════
import { kindOf, rarityOf } from '../../bag-model.js?v=0.2.141';
import { text, cls } from '../../../render/paint.js?v=0.2.141';
import { whole, short } from '../../../render/format.js?v=0.2.141';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.141';
import { glyphSvg } from '../../launcher.js?v=0.2.141';
import { MOBILE_QUERY } from '../../../world/core/camera.js?v=0.2.141';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.141';

/** A corner count in four characters: 1.4k, 12k, 1.2kk, rounded DOWN (a stack never reads more than it holds; format.js short rounds). Pure. */
export function cornerCount(qty) {
  if (qty < 1000) return whole(qty);
  const v = qty < 1e6 ? qty / 1e3 : qty / 1e6;
  return (v < 10 ? Math.floor(v * 10) / 10 : Math.floor(v)) + (qty < 1e6 ? 'k' : 'kk');
}

const PIPS = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, unique: 5 });

/** A pocket's markup for item `id`; `act` is its [data-hs-act]. */
export function pocketHtml(id, glyphs, act) {
  const rar = rarityOf(id);
  const pips = rar ? '<span class="hw-pips">' + '<i></i>'.repeat(PIPS[rar] || 0) + '</span>' : '';
  return '<li class="hw-pocket is-' + kindOf(id) + (rar ? ' rar-' + rar : '') + '" role="option" tabindex="-1" draggable="true" data-hs-act="' + esc(act || 'pocket') + '" data-item="' + esc(id) + '" aria-label="' + esc(itemName(id)) + '">'
    + '<span class="hw-ico">' + itemIconHtml(glyphs, id) + '</span>' + pips
    + '<b class="hw-count"></b><i class="hw-new" aria-hidden="true"></i><span class="hw-lock">' + glyphSvg(glyphs, 'uiLock') + '</span><small class="hw-barkey"></small></li>';
}

/** The count in the corner: nothing for a single item, short above ten thousand; on a phone's 36 px pocket, above 999 (UI audit
    2026-11-18: "10" and "1,493" side by side read as "101,493"). `ahead` (town-ticker.js): the count includes work the server has not
    paid yet, so it is always written and reads as pending. The whole count stays in the pocket's name (grid.js) and its tooltip. */
export function patchCount(li, qty, ahead) {
  const el = li.querySelector('.hw-count');
  const win = li.ownerDocument && li.ownerDocument.defaultView;
  const phone = !!win && typeof win.matchMedia === 'function' && win.matchMedia(MOBILE_QUERY).matches;
  text(el, ahead || qty > 1 ? (phone && qty >= 1000 ? cornerCount(qty) : qty >= 10000 ? short(qty) : whole(qty)) : '');
  cls(el, 'is-ahead', !!ahead);
}
