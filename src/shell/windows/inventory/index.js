// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/index.js — THE INVENTORY: THE PAPER DOLL BESIDE THE BAG.
//
// ONE window (Tyler 10-18: the bag and the gear were two, and the bag's items
// were far too big). Its parts, each its own module:
//   state.js      what it reads from the server, the residue and its scratch
//   doll.js       the equipment column: small slots in the shape of a body
//   grid.js       the toolbar (tabs, the item search, sort, categories), the
//                 item grid, This hunt, the picked line and the bulk tools
//   pockets.js    the one pocket every grid shares (also the Storage window's)
//   elsewhere.js  under the grid while searching: where else the item is
//   advanced.js   the Advanced view (effects, the worn set, imbuements)
//   actions.js    every gesture: one intent each, controls off until it answers
// Laid out as   [ toolbar                       ]
//               [ doll ][ grid                   ]
//               [ capacity · Advanced view · gold ]
//               [ slot line / picked line / tools ]
//               [ advanced section (when on)     ]
// Built once per opening; every envelope and display tick patches it in place
// (src/render/paint.js). Opening it again is what clears the "new" marks the
// player was shown last time (the residue `bagSeen`).
// ════════════════════════════════════════════════════════════════════════
import { text, cls, prop, style } from '../../../render/paint.js?v=0.2.42';
import { whole, gold } from '../../../render/format.js?v=0.2.42';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.42';
import { closeFloatMenu } from '../float-menu.js?v=0.2.42';
import { stateOf } from './state.js?v=0.2.42';
import { dollHtml, slotLineHtml, patchDoll, patchSlotLine } from './doll.js?v=0.2.42';
import { toolbarHtml, gridHtml, toolsHtml, patchToolbar, patchGrid, patchTools, KEYS } from './grid.js?v=0.2.42';
import { advancedHtml, patchAdvanced } from './advanced.js?v=0.2.42';
import { actInventory, commitSeen, INVENTORY_EVENTS } from './actions.js?v=0.2.42';

/** The skeleton (built once per opening). */
export function renderInventory(ctx) {
  const g = ctx.glyphs;
  if (ctx.character) commitSeen(ctx.character);
  return '<div class="hw-inv" tabindex="0" data-hs-act="inv" aria-label="Inventory">'
    + toolbarHtml(g)
    + '<div class="hw-inv-cols">' + dollHtml(g) + '<div class="hw-inv-grid" data-hs-act="grid">' + gridHtml() + '</div></div>'
    + '<div class="hw-inv-foot"><span class="hw-capacity"><span class="hw-capbar" role="meter" aria-label="Bag spaces used" aria-valuemin="0"><i class="hw-capfill"></i></span><small class="hw-captext"></small></span>'
    + '<label class="hw-adv-toggle"><input type="checkbox" data-hs-act="advanced"> Advanced view</label>'
    + '<b class="hw-gold"></b></div>'
    + slotLineHtml() + toolsHtml(g) + advancedHtml()
    + '<p class="hw-keys">' + esc(KEYS) + '</p></div>';
}

/* The foot: the bag's spaces against the server's stack cap (hidden when the server sends none), and the gold. */
function patchFoot(root, st) {
  const cap = st.cap;
  const used = st.items.length;
  const box = root.querySelector('.hw-capacity');
  cls(box, 'is-on', !!cap && st.loaded);
  if (cap) {
    const f = Math.max(0, Math.min(1, used / cap));
    style(box.querySelector('.hw-capfill'), 'width', (Math.round(f * 1000) / 10) + '%');
    cls(box, 'is-full', used >= cap);
    text(box.querySelector('.hw-captext'), whole(used) + ' of ' + whole(cap) + ' spaces');
    box.querySelector('.hw-capbar').setAttribute('aria-valuenow', String(used));
  }
  text(root.querySelector('.hw-gold'), st.gold === null ? '' : 'Your gold ' + gold(st.gold));   // the ACCOUNT's purse, every hero's
  prop(root.querySelector('[data-hs-act="advanced"]'), 'checked', st.prefs.advanced);
}

renderInventory.patch = function patchInventory(body, ctx) {
  const st = stateOf(ctx);
  if (st.unmarked && st.loaded && st.items.length) commitSeen(st.cs, st.items.map((r) => r.id));
  const root = body.querySelector('.hw-inv');
  patchToolbar(root, st, ctx);
  patchDoll(root, st, ctx);
  patchGrid(root, st, ctx);
  patchFoot(root, st);
  patchSlotLine(root, st, ctx);
  patchTools(root, st, ctx);
  patchAdvanced(root, st, ctx);
  cls(root, 'is-pending', st.sc.pending);
  if (!st.sc.menu) closeFloatMenu(ctx.doc, st.sc.menuOwner || null);   // its own menu only: a world or chat menu stays open
};

renderInventory.events = INVENTORY_EVENTS;
renderInventory.act = function act(ctx, body, action, ev, t) {
  return actInventory(ctx, body, action, ev, t, () => renderInventory.patch(body, ctx));
};
