// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/action-bar.js — THE ACTION BAR AT THE BOTTOM (Tyler's spec, 2026-10-18).
//
// Hunts are idle (Tyler 10-16): the bar is CONFIGURATION, never a cast button.
//   hub      the vitals hub at the centre (vitals-hub.js): the level medallion,
//            HP and mana arcs round it, their readouts, stamina, Food and Charm
//   slots    2 rows x 10 square slots, slot order = priority, split round the
//            hub as the sim splits them: 1-5 and 11-15 on its left, 6-10 and
//            16-20 on its right (slot 1 fires first, conditions.js pickSlot). A filled
//            slot: the action's icon, its small slot number, ONE count badge
//            (what the bag holds of it, from the server), a diagonal strike when
//            the server marks it unusable or it has nothing left and no store
//            behind it, a "!" when an earlier slot always wins (action-facts.js
//            conflictsOf). An empty slot shows only a "+". A press (or the "+")
//            opens Configure action, centred; dragging a slot onto another moves
//            it there (ONE intent, the whole bar restated); a bag stack dropped
//            on a slot puts it there (src/shell/bar-assign.js)
//   tooltip  hover, focus or a long press: name, cost, type, cooldown, effect,
//            then the slot's setup and any conflict (action-facts.js)
//   plaque   the action set's name, Hunt settings and the saved setups
// Shown in town too (Tyler 10-18: set it up before leaving). Every value is
// the server's; the bar changes only when the re-read envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { BAR_SLOTS } from '../../data/hunt-hud.js?v=0.2.6';
import { CONSUME_KINDS, ATTACK_KINDS } from '../../data/condition-metrics.js?v=0.2.6';
import { huntOf, settingsOf, wireSlot } from '../../session/hunt-sections.js?v=0.2.6';
import { bagOf } from '../../session/item-sections.js?v=0.2.6';
import { text, cls, attr } from '../../render/paint.js?v=0.2.6';
import { whole } from '../../render/format.js?v=0.2.6';
import { glyphSvg } from '../launcher.js?v=0.2.6';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.6';
import { actionIconHtml } from './bits.js?v=0.2.6';
import { hubHtml, patchHub } from './vitals-hub.js?v=0.2.6';
import { openSlot, storeOf, placeSlot } from '../bar-draft.js?v=0.2.6';
import { actionName, factsOf, carried, supplyLines, setupWords, conflictsOf } from '../action-facts.js?v=0.2.6';
import { resetConfigureView } from '../windows/configure-action.js?v=0.2.6';
import { assignToBar, barKind } from '../bar-assign.js?v=0.2.6';
import { DRAG_TYPE } from '../windows/inventory/actions.js?v=0.2.6';
import { refusalWords } from '../intent-words.js?v=0.2.6';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;
const SLOT_DRAG = 'application/x-hr-bar-slot';
const LONG_PRESS_MS = 450;
const KINDS = new Set(Object.keys(CONSUME_KINDS).concat(Object.keys(ATTACK_KINDS)));
const PRESS = new WeakMap();   // the bar element -> { timer, held }

function slotHtml(i) {
  return '<li class="hb-slot is-empty" data-slot="' + i + '" data-hs-act="slot" role="button" tabindex="0" aria-label="Slot ' + (i + 1) + '">'
    + '<span class="hb-slot-ico"></span><small class="hb-n">' + (i + 1) + '</small><small class="hb-count"></small><b class="hb-warn" aria-hidden="true">!</b>'
    + '<span class="hb-plus" aria-hidden="true">+</span></li>';
}

/** The skeleton (built once). */
export function renderActionBar(ctx) {
  const g = ctx.glyphs;
  /* Each row of ten splits round the hub: its first half on the left, its second on the right. */
  const half = BAR_SLOTS.cols / 2;
  const side = (right) => {
    let h = '';
    for (let r = 0; r < BAR_SLOTS.rows; r++) for (let c = 0; c < half; c++) h += slotHtml(r * BAR_SLOTS.cols + c + (right ? half : 0));
    return h;
  };
  return '<div class="hb-bar" role="group" aria-label="Action bar">'
    + '<ol class="hb-slots" aria-label="Slots 1 to 5 and 11 to 15, slot 1 tried first">' + side(false) + '</ol>'
    + hubHtml(g)
    + '<ol class="hb-slots" aria-label="Slots 6 to 10 and 16 to 20">' + side(true) + '</ol>'
    + '<div class="hb-plaque">'
    + '<span class="hb-label">Action set</span><b class="hb-set"></b>'
    + '<span class="hb-tools"><button type="button" class="hh-tool" data-hs-act="editor" aria-label="Hunt settings">' + glyphSvg(g, 'uiSettings') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="setups" aria-label="Saved setups">' + glyphSvg(g, 'uiCheck') + '</button></span>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>'
    + '<div class="hb-tip" role="tooltip"></div>'
    + '</div>';
}

function patchSlot(li, s, w, ctx, bag, conflict) {
  const key = s.empty ? '' : s.action.type + ':' + s.action.id;
  if (li.getAttribute('data-item') !== key) {
    attr(li, 'data-item', key);
    li.querySelector('.hb-slot-ico').innerHTML = s.empty ? '' : actionIconHtml(ctx.glyphs, s.action);
    attr(li, 'draggable', s.empty ? null : 'true');
  }
  const st = s.empty ? null : storeOf(s.action);
  /* The count: the server's own count for a slot naming one item; a kind's (Any food) is its lines in the server's bag. */
  const n = s.empty || s.action.type === 'ability' ? null : Number.isInteger(s.count) && !KINDS.has(s.action.id) ? s.count : carried(s.action, bag);
  const out = !s.empty && ((n !== null && n <= 0 && !st) || s.usable === false);
  cls(li, 'is-empty', s.empty);
  cls(li, 'is-off', out);
  cls(li, 'is-blocked', !!conflict);
  text(li.querySelector('.hb-count'), n ? whole(n) : '');
  attr(li, 'aria-label', 'Slot ' + (li.getAttribute('data-slot') * 1 + 1) + ': ' + (s.empty ? 'empty, press to configure' : actionName(s.action) + (out ? ', cannot fire now' : '') + (conflict ? ', never fires' : '')));
}

/* The tooltip's lines for slot i (Tyler's spec): what the action is, then its setup and any conflict. */
function tipHtml(i, ctx) {
  const set = settingsOf(ctx.character);
  const s = set && set.slots[i];
  if (!s || s.empty) return '<b>Slot ' + (i + 1) + '</b><p>Empty. Press to choose a spell, rune or item for it.</p>';
  const w = wireSlot(s);
  const f = factsOf(s.action);
  const conflict = conflictsOf(Array.from({ length: SLOTS }, (_, k) => wireSlot(set.slots[k])), set).get(i);
  const lines = [f.cost ? (f.cost.includes('mana') ? 'Cost: ' + f.cost : f.cost) : null, f.type, f.cooldown].concat(f.effect, supplyLines(s.action, set, bagOf(ctx.character))).filter(Boolean);
  return '<b>' + esc(actionName(s.action)) + '</b><small class="hb-tip-n">Slot ' + (i + 1) + '</small>'
    + lines.map((l) => '<p>' + esc(l) + '</p>').join('')
    + '<hr><p class="is-setup">' + esc(setupWords(w, set)) + '</p>'
    + (conflict ? '<p class="is-warn">' + esc(conflict.why) + '</p>' : '');
}

function showTip(el, li, ctx) {
  const tip = el.querySelector('.hb-tip');
  const i = Number(li.getAttribute('data-slot'));
  if (tip.getAttribute('data-for') !== String(i)) { tip.innerHTML = tipHtml(i, ctx); attr(tip, 'data-for', String(i)); }
  const bar = el.querySelector('.hb-bar').getBoundingClientRect(), r = li.getBoundingClientRect();
  tip.style.left = Math.round(Math.max(0, Math.min(bar.width - 260, r.left - bar.left - 110))) + 'px';
  cls(tip, 'is-on', true);
}
function hideTip(el) { const tip = el.querySelector('.hb-tip'); cls(tip, 'is-on', false); attr(tip, 'data-for', null); }

renderActionBar.patch = function patchActionBar(el, ctx) {
  const cs = ctx.character;
  const h = huntOf(cs);
  const s = settingsOf(cs);
  cls(el.querySelector('.hb-bar'), 'is-town', !h);
  patchHub(el, ctx);
  const slots = s ? Array.from({ length: SLOTS }, (_, i) => s.slots[i] || { empty: true }) : [];
  const wires = slots.map((x) => wireSlot(x));
  const conflicts = s ? conflictsOf(wires, s) : new Map();
  const bag = bagOf(cs);
  for (const li of el.querySelectorAll('.hb-slot')) {
    const i = Number(li.getAttribute('data-slot'));
    patchSlot(li, slots[i] || { empty: true }, wires[i], ctx, bag, conflicts.get(i));
  }
  const set = s && s.presets.find((p) => p.preset === s.preset);
  text(el.querySelector('.hb-set'), set ? set.name : s ? 'Set ' + (s.preset + 1) : '–');
  const tip = el.querySelector('.hb-tip.is-on');
  if (tip) { const i = tip.getAttribute('data-for'); attr(tip, 'data-for', null); const li = el.querySelector('.hb-slot[data-slot="' + i + '"]'); if (li) showTip(el, li, ctx); }
};

renderActionBar.events = Object.freeze(['dragstart', 'dragover', 'dragleave', 'drop', 'dragend', 'mouseover', 'mouseout', 'pointerdown', 'pointerup', 'pointercancel', 'keydown']);

/* A bag stack or another slot dropped on a slot: one bar intent; the bar changes when the server's does. */
function dropOnSlot(ctx, el, ev, t) {
  const types = Array.from((ev.dataTransfer && ev.dataTransfer.types) || []);
  const fromSlot = types.includes(SLOT_DRAG);
  if (!fromSlot && !types.includes(DRAG_TYPE)) return false;
  if (ev.type === 'dragleave') { cls(t, 'is-drop', false); return false; }
  ev.preventDefault();
  cls(t, 'is-drop', ev.type === 'dragover');
  if (ev.type !== 'drop') return true;
  const to = Number(t.getAttribute('data-slot'));
  const msg = el.querySelector('.hb-plaque .hh-intent-msg');
  const repaint = () => renderActionBar.patch(el, ctx);
  if (fromSlot) {
    const from = Number(ev.dataTransfer.getData(SLOT_DRAG));
    if (placeSlot(ctx.character, from, to, repaint)) text(msg, 'Moving it…');
    return true;
  }
  const id = ev.dataTransfer.getData(DRAG_TYPE);
  if (!barKind(id)) { text(msg, refusalWords('not_for_bar')); return true; }
  text(msg, 'Putting it on the bar…');
  assignToBar(ctx.character, id, to).then((r) => { text(msg, r.ok ? '' : refusalWords(r.error)); repaint(); });
  return true;
}

function openOn(ctx, i) {
  openSlot(ctx.character, i);
  resetConfigureView(ctx.character);
  ctx.show('configure-action');
  ctx.refresh('configure-action');
}

renderActionBar.act = function actActionBar(ctx, el, action, ev, t) {
  if (action === 'editor' && ev.type === 'click') { ctx.show('hunt-settings'); return; }
  if (action === 'setups' && ev.type === 'click') { ctx.show('hunt-prep'); return; }
  if (action !== 'slot') return;
  const i = Number(t.getAttribute('data-slot'));
  const press = PRESS.get(el) || { timer: null, held: false };
  PRESS.set(el, press);
  switch (ev.type) {
    case 'mouseover': showTip(el, t, ctx); return;
    case 'mouseout': if (!t.contains(ev.relatedTarget)) hideTip(el); return;
    case 'pointerdown':
      press.held = false;
      if (ev.pointerType === 'touch') press.timer = setTimeout(() => { press.held = true; showTip(el, t, ctx); }, LONG_PRESS_MS);
      return;
    case 'pointerup': case 'pointercancel': clearTimeout(press.timer); return;
    case 'dragstart':
      if (t.classList.contains('is-empty') || !ev.dataTransfer) return;
      ev.dataTransfer.setData(SLOT_DRAG, String(i));
      ev.dataTransfer.effectAllowed = 'move';
      hideTip(el);
      return;
    case 'dragend': for (const s of el.querySelectorAll('.hb-slot.is-drop')) cls(s, 'is-drop', false); return;
    case 'keydown':
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      openOn(ctx, i);
      return true;
    case 'click':
      /* A long press showed the tooltip: that press does not also open the window. */
      if (press.held) { press.held = false; return; }
      hideTip(el);
      openOn(ctx, i);
      return;
    default: return dropOnSlot(ctx, el, ev, t);
  }
};

