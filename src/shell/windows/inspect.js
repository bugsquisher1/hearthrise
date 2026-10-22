// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inspect.js — ANOTHER PLAYER'S WORN GEAR, READ-ONLY.
//
// Opened by the player menu's "Inspect gear". Shows what hr_inspect answered
// (ctx.account.social.inspected, src/social/inspect.js): the name, combat
// level and role, and each WORN item by slot — the server never sends a bag or
// a bank. Hovering an item opens the shared item tooltip (./item-tip.js).
// Nothing here can change anything.
// ════════════════════════════════════════════════════════════════════════
import { refusalWords } from '../intent-words.js?v=0.2.27';
import { EQUIP_SLOT_META } from '../../data/gathering.js?v=0.2.27';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.27';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.27';
import { showTip, hideTip } from './item-tip.js?v=0.2.27';
import { rows, text, element } from '../../render/paint.js?v=0.2.27';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.27';

export function renderInspect() {
  return '<div class="hi-inspect"><h3 class="hs-sub hi-who"></h3><p class="hi-line"></p>'
    + '<ul class="hi-gear"></ul><p class="hh-empty hi-msg" role="status"></p></div>';
}

renderInspect.patch = function patchInspect(body, ctx) {
  const social = ctx.account && ctx.account.social;
  const v = social && social.inspected;
  const ready = !!(v && v.gear);
  text(body.querySelector('.hi-who'), v ? v.name || 'A player' : 'Nobody yet');
  text(body.querySelector('.hi-line'), ready ? 'Level ' + (v.level === null ? '?' : v.level) + (v.role && HUNT_ROLES[v.role] ? ' · ' + HUNT_ROLES[v.role].label : '') : '');
  rows(body.querySelector('.hi-gear'), ready ? v.gear : [], {
    key: (g) => g.slot + ':' + g.item,
    build: (g) => element(ctx.doc, '<li class="hi-item" data-hs-act="item" data-item="' + esc(g.item) + '" tabindex="0">' + itemIconHtml(ctx.glyphs, g.item)
      + '<small class="hi-slot">' + esc((EQUIP_SLOT_META[g.slot] && EQUIP_SLOT_META[g.slot].label) || g.slot) + '</small><b class="hi-name">' + esc(itemName(g.item)) + '</b></li>'),
    patch: () => {},
  });
  text(body.querySelector('.hi-msg'), !v ? 'Right-click a player and pick Inspect gear.'
    : v.pending ? 'Looking…' : v.error ? refusalWords(v.error) : !v.gear.length ? 'Nothing worn.' : '');
};

renderInspect.events = Object.freeze(['mouseover', 'mouseout']);

renderInspect.act = function actInspect(ctx, body, action, ev, t) {
  if (action !== 'item') return false;
  if (ev.type === 'mouseover' || ev.type === 'click') showTip(ctx.doc, t, t.getAttribute('data-item'), {});
  else if (ev.type === 'mouseout' && !t.contains(ev.relatedTarget)) hideTip(ctx.doc);
  return false;
};
