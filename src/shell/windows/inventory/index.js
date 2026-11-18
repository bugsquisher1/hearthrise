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
// Laid out as   [ toolbar                                  ]
//               [ doll ][ grid (its own scroll)              ]
//               [      ][ armor worn: heavy · medium · light ]
//               [      ][ capacity · Advanced view · gold    ]
//               [      ][ slot line / picked line / tools    ]
//               [      ][ advanced section (when on)         ]
// THE DOLL NEVER SCROLLS (Tyler 2026-11-17: "why am i scrolling to see my belt/ammo slots?"): its column runs
// beside everything under the toolbar, only the bag's grid scrolls, and its wells fit the room (doll.js fitDoll).
// On a phone's sheet the doll stands beside the toolbar and the sheet scrolls as one (windows.css).
// Built once per opening; every envelope and display tick patches it in place
// (src/render/paint.js). Opening it again is what clears the "new" marks the
// player was shown last time (the residue `bagSeen`).
// ════════════════════════════════════════════════════════════════════════
import { text, cls, prop, style } from '../../../render/paint.js?v=0.2.137';
import { MOBILE_QUERY } from '../../../world/core/camera.js?v=0.2.137';
import { whole, gold } from '../../../render/format.js?v=0.2.137';
import { closeFloatMenu } from '../float-menu.js?v=0.2.137';
import { stateOf } from './state.js?v=0.2.137';
import { dollHtml, slotLineHtml, weightsHtml, patchDoll, patchSlotLine, patchWeights, fitDoll } from './doll.js?v=0.2.137';
import { toolbarHtml, gridHtml, toolsHtml, patchToolbar, patchGrid, patchTools } from './grid.js?v=0.2.137';
import { advancedHtml, patchAdvanced } from './advanced.js?v=0.2.137';
import { actInventory, commitSeen, INVENTORY_EVENTS } from './actions.js?v=0.2.137';
import { t } from '../../../render/player-text.js?v=0.2.137';

/** The skeleton (built once per opening). */
export function renderInventory(ctx) {
  const g = ctx.glyphs;
  if (ctx.character) commitSeen(ctx.character);
  return '<div class="hw-inv" tabindex="0" data-hs-act="inv" aria-label="Inventory">'
    + toolbarHtml(g)
    + '<div class="hw-inv-cols">' + dollHtml(g)
    + '<div class="hw-inv-side"><div class="hw-inv-scroll"><div class="hw-inv-grid" data-hs-act="grid">' + gridHtml() + '</div></div>'
    /* under the bag, about the bag: the armor worn, what it is worth, Advanced view */
    + '<div class="hw-inv-under">' + weightsHtml() + '<small class="hw-value"></small><label class="hw-adv-toggle"><input type="checkbox" data-hs-act="advanced"> Advanced view</label></div>'
    + '<p class="hw-why hw-over"></p>'
    + slotLineHtml() + toolsHtml(g) + advancedHtml() + '</div></div>'
    /* THE FOOT (UI audit 2026-11-18 UI-5: three rows of bag under a stack of lines): the bag's spaces, the gold and Dispatch loot on one line
       under both columns, why Dispatch is off under it, so the grid takes the window's height */
    + '<div class="hw-inv-foot"><span class="hw-capacity"><span class="hw-capbar" role="meter" aria-label="Bag spaces used" aria-valuemin="0"><i class="hw-capfill"></i></span><small class="hw-captext"></small></span>'
    + '<b class="hw-gold"></b><p class="hw-why hw-dispatch-why" role="status" aria-live="polite"></p>'
    + '<button type="button" class="hh-tool" data-hs-act="dispatch">' + t('controls.dispatch_loot') + '</button></div></div>';
}

/** What a bag at or past its spaces means (midgame panel 2026-11-01: "114 of 100 spaces" with no word): the server's rule, 2027-02-11-hunt-loot-past-bag-cap.sql. Pure. */
export function overBagWords(used, cap) {
  return used >= cap ? 'Bag full: sell or deposit to make room' : '';
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
    text(root.querySelector('.hw-over'), overBagWords(used, cap));
  } else text(root.querySelector('.hw-over'), '');
  text(root.querySelector('.hw-gold'), st.gold === null ? '' : 'Gold: ' + gold(st.gold));   // the ACCOUNT's purse, every hero's
  prop(root.querySelector('[data-hs-act="advanced"]'), 'checked', st.prefs.advanced);
}

/* THE PRESS IN HAND STANDS CLEAR OF THE ANSWER LINE (newcomer panel 2026-11-03, 1366x768: "Burn all 23" half under "Put on 1 piece.", Stop wholly under
   "Fueling…"). The column scrolls and the line stands over its foot (windows.css), so when the stack, the job or the line changes the column brings the
   press up from under it, once: the player's own scrolling is never fought. The column is the one beside the doll where it scrolls (a short window),
   else the whole; where neither does (the phone's sheet) the body has its own rule. */
function keepPickClear(root, st) {
  const line = root.querySelector('.hh-intent-msg');
  const shown = root.querySelector('.hw-burying.is-on') || root.querySelector('.hw-pick.is-on ~ .hw-pick-why:not(:empty)') || root.querySelector('.hw-pick.is-on');
  const sig = (shown ? shown.className : '') + '|' + st.sc.cursor + '|' + line.textContent;
  if (st.sc.clearSig === sig) return;
  st.sc.clearSig = sig;
  const col = [root.querySelector('.hw-inv-side'), root].find((e) => e && e.clientHeight && e.scrollHeight > e.clientHeight);
  if (!shown || !col) return;
  const box = col.getBoundingClientRect();
  const floor = line.textContent ? Math.min(box.bottom, line.getBoundingClientRect().top) : box.bottom;
  const over = shown.getBoundingClientRect().bottom - floor;
  if (over > 0) col.scrollTop += over + 4;
}

/* The doll's wells fit its column on each patch, and at once when the window's box, its columns' box or the World changes (the cap the
   shell puts on a docked window lands after the first patch; a coach card squeezes a capped window's columns, not its frame): one frame
   later, so the shell's own observer of the frame is never re-run. */
const WATCHED = new WeakSet();

/* THE BAG ENDS ON A WHOLE ROW (UI audit 2026-11-18 UI-5, AW-93): the grid takes the column's height and its free spaces overflow it, so its
   scroll box ends at the top of the first row its foot would cut, every pocket in view whole; measured with the bag at its top only (a bag
   the player scrolled keeps its height, nothing jumps under the hand). A phone's sheet scrolls as one and is left alone. */
function snapBag(root, phone) {
  const box = root.querySelector('.hw-inv-scroll');
  if (!box || (!phone && box.scrollTop > 0)) return;
  if (box.style.maxHeight) box.style.maxHeight = '';
  if (phone || box.scrollHeight <= box.clientHeight + 1) return;
  const top = box.getBoundingClientRect().top + box.clientTop, foot = top + box.clientHeight;
  let cut = foot;
  for (const li of box.querySelectorAll('li')) {
    const q = li.getBoundingClientRect();
    if (q.height > 0 && q.top < foot - 0.5 && q.bottom > foot + 0.5) cut = Math.min(cut, q.top);
  }
  if (cut < foot) box.style.maxHeight = Math.floor(cut - top) + 'px';
}

function fitNow(root) {
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  const fit = () => { const phone = view.matchMedia(MOBILE_QUERY).matches; fitDoll(root, phone); snapBag(root, phone); };
  fit();
  const frame = root.closest('.hs-win');
  if (WATCHED.has(root) || !frame || !view.ResizeObserver) return;
  WATCHED.add(root);
  let queued = false;
  const ro = new view.ResizeObserver(() => {
    if (queued) return;
    queued = true;
    view.requestAnimationFrame(() => { queued = false; if (root.isConnected) fit(); else ro.disconnect(); });
  });
  ro.observe(frame);
  if (frame.parentElement) ro.observe(frame.parentElement);
  const cols = root.querySelector('.hw-inv-cols');
  if (cols) ro.observe(cols);
}

renderInventory.patch = function patchInventory(body, ctx) {
  const st = stateOf(ctx);
  if (st.unmarked && st.loaded && st.items.length) commitSeen(st.cs, st.items.map((r) => r.id));
  const root = body.querySelector('.hw-inv');
  patchToolbar(root, st, ctx);
  patchDoll(root, st, ctx);
  patchWeights(root, st);
  patchGrid(root, st, ctx);
  patchFoot(root, st);
  patchSlotLine(root, st, ctx);
  patchTools(root, st, ctx);
  patchAdvanced(root, st, ctx);
  cls(root, 'is-pending', st.sc.pending);
  fitNow(root);
  keepPickClear(root, st);
  if (!st.sc.menu) closeFloatMenu(ctx.doc, st.sc.menuOwner || null);   // its own menu only: a world or chat menu stays open
};

renderInventory.events = INVENTORY_EVENTS;
renderInventory.act = function act(ctx, body, action, ev, t) {
  return actInventory(ctx, body, action, ev, t, () => renderInventory.patch(body, ctx));
};
