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
//   panel    the setup in use (a setup owns this bar; Saved setups switch it,
//            designer ruling 2026-10-22), target, stance, chase,
//            distance and the gold to keep (gold_floor): each ONE intent
//            (settings-intent.js), shown from the server only once it confirms
// Shown in town too (Tyler 10-18: set it up before leaving). Every value is
// the server's; the bar changes only when the re-read envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { BAR_SLOTS } from '../../data/hunt-hud.js?v=0.2.31';
import { ABILITIES } from '../../data/abilities.js?v=0.2.31';
import { huntOf, settingsOf, wireSlot } from '../../session/hunt-sections.js?v=0.2.31';
import { carriedOf } from '../../session/item-sections.js?v=0.2.31';
import { text, cls, attr, element, keyedChild, prop } from '../../render/paint.js?v=0.2.31';
import { whole } from '../../render/format.js?v=0.2.31';
import { glyphSvg } from '../launcher.js?v=0.2.31';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.31';
import { actionIconHtml } from './bits.js?v=0.2.31';
import { hubHtml, patchHub } from './vitals-hub.js?v=0.2.31';
import { openSlot, sendPlan, movePlan, swapPlan, insertPlan, serverBar, answerWithin } from '../bar-draft.js?v=0.2.31';
import { actionName, factsOf, carried, supplyLines, setupWords, conflictsOf, reasonOf, sharedCooldownOf } from '../action-facts.js?v=0.2.31';
import { resetConfigureView } from '../windows/configure-action.js?v=0.2.31';
import { assignToBar, barKind } from '../bar-assign.js?v=0.2.31';
import { DRAG_TYPE } from '../windows/inventory/actions.js?v=0.2.31';
import { refusalWords } from '../intent-words.js?v=0.2.31';
import { targetOptionsHtml, stanceButtonsHtml, distanceHtml, goldFloorHtml, patchControls, sendOption } from './settings-intent.js?v=0.2.31';
import { ATTACK_KINDS } from '../../data/condition-metrics.js?v=0.2.31';
import { nameEditorHtml, openNameEditor, nameKey } from '../inline-name.js?v=0.2.31';
import { renameActionSet } from '../../session/preset-intents.js?v=0.2.31';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;
const SLOT_DRAG = 'application/x-hr-bar-slot';
const LONG_PRESS_MS = 450;
const KINDS = new Set(Object.keys(ATTACK_KINDS));
const PRESS = new WeakMap();   // the bar element -> { timer, held }
const DROP = new WeakMap();    // the bar element -> { from, to, off } while the drop menu is open
const PANEL = new WeakMap();   // the bar element -> the open sheet's listener cleanup (phone)
const CASTS = new WeakMap();   // the bar element -> { cs, off, at: Map(ability -> client ms of the hero's last cast) }
const RENAMING = new WeakSet(); // the bar elements whose set rename is with the server (its name control stays off)

/* THE COOLDOWN EMBER (the sim's, Tyler 10-19): when the server's timeline plays the viewed hero's
   `cast` of an ability, its slot cools for that ability's catalogue cooldown (cdMs, the clock the
   engine runs): a veil over the slot, an ember rising from the bottom as the cooldown runs out, and
   the seconds left. Played in step with the scene (timeline.subscribe), from server events only. */
function watchCasts(el, ctx) {
  const cs = ctx.character;
  const w = CASTS.get(el);
  if (w && w.cs === cs) return w;
  if (w) w.off();
  const at = new Map();
  const tl = cs && cs.timeline;
  const off = tl && typeof tl.subscribe === 'function' ? tl.subscribe((ev) => {
    const h = huntOf(cs);
    if (!ev || ev.type !== 'cast' || !ABILITIES[ev.ability] || !h || ev.u !== h.hero.unit) return;
    const c = typeof tl.clientAt === 'function' ? tl.clientAt(ev.atMs) : null;
    at.set(ev.ability, Number.isFinite(c) ? c : ctx.now());
  }) : () => {};
  const out = { cs, off, at };
  CASTS.set(el, out);
  return out;
}

function patchCooldown(li, s, casts, now) {
  const r = !s.empty && s.action.type === 'ability' ? ABILITIES[s.action.id] : null;
  const t0 = r ? casts.at.get(s.action.id) : undefined;
  const left = r && Number.isFinite(t0) ? r.cdMs - (now - t0) : 0;
  const on = left > 0;
  cls(li, 'is-cooling', on);
  if (!on) return;
  li.querySelector('.hb-cd-ember').style.height = (Math.round((1 - left / r.cdMs) * 1000) / 10) + '%';
  text(li.querySelector('.hb-cd-s'), left < 10000 ? (left / 1000).toFixed(1) : String(Math.ceil(left / 1000)));
}

function slotHtml(i) {
  return '<li class="hb-slot is-empty" data-slot="' + i + '" data-hs-act="slot" role="button" tabindex="0" aria-label="Slot ' + (i + 1) + '">'
    + '<span class="hb-slot-ico"></span><small class="hb-n">' + (i + 1) + '</small><small class="hb-count"></small><b class="hb-warn" aria-hidden="true">!</b>'
    + '<span class="hb-why" aria-hidden="true"></span><span class="hb-plus" aria-hidden="true">+</span>'
    + '<span class="hb-cd" aria-hidden="true"><i class="hb-cd-ember"></i><b class="hb-cd-s"></b></span></li>';
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
    /* The set's name renames in place (inline-name.js; ONE hr_action_set_rename, ruling C4). */
    + '<div class="hb-pl-row"><span class="hb-label">Setup</span><span class="hb-set">' + nameEditorHtml('set-rename', '', 'New name for this setup') + '</span>'
    + '<button type="button" class="hh-tool" data-hs-act="setups" aria-label="Saved setups: switch or save">' + glyphSvg(g, 'uiCheck') + '</button>'
    /* On a phone the rest of the panel is a slide-out sheet (hunt.css): this opens it. */
    + '<button type="button" class="hh-tool hb-more" data-hs-act="panel" aria-expanded="false" aria-label="Fight settings">' + glyphSvg(g, 'uiSettings') + '</button></div>'
    + '<div class="hb-pl-more" role="group" aria-label="Fight settings">'
    + '<div class="hb-pl-head"><b>Fight settings</b><button type="button" class="hh-tool" data-hs-act="panel" aria-label="Close">×</button></div>'
    + '<label class="hb-pl-row"><span class="hb-label">Target</span><select class="hh-select" data-opt="target_mode" data-hs-act="opt" aria-label="Target">' + targetOptionsHtml() + '</select></label>'
    + '<div class="hb-pl-row"><span class="hh-segs hb-stance" role="group" aria-label="Stance">' + stanceButtonsHtml() + '</span></div>'
    + '<div class="hb-pl-row"><button type="button" class="hh-seg" data-opt="chase" data-hs-act="opt" aria-pressed="false" title="With chase off, the hero keeps its distance">Chase</button>'
    + '<span class="hb-label">Distance</span>' + distanceHtml() + '</div>'
    + '<label class="hb-pl-row is-gold"><span class="hb-label">Keep at least</span>' + goldFloorHtml() + '<span class="hb-label">gold</span></label></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>'
    + '<div class="hb-tip" role="tooltip"></div>'
    + '<div class="hb-drop" role="menu" aria-label="Drop the action"><b class="hb-drop-t"></b>'
    + '<button type="button" class="hh-tool" role="menuitem" data-hs-act="drop" data-x="swap"></button>'
    + '<button type="button" class="hh-tool" role="menuitem" data-hs-act="drop" data-x="insert">Insert here (shift the rest)</button>'
    + '<button type="button" class="hh-tool" role="menuitem" data-hs-act="drop" data-x="cancel">Cancel</button></div>'
    + '</div>';
}

function patchSlot(li, s, w, ctx, bag, conflict, why) {
  const key = s.empty ? '' : s.action.type + ':' + s.action.id;
  if (li.getAttribute('data-item') !== key) {
    attr(li, 'data-item', key);
    /* The slot keeps the icon node of each action it has shown: a slot the server empties for one
       envelope and fills again shows the same <img>, never a new image request. */
    keyedChild(li.querySelector('.hb-slot-ico'), key, () => element(ctx.doc, actionIconHtml(ctx.glyphs, s.action)));
    attr(li, 'draggable', s.empty ? null : 'true');
  }
  /* The count: the server's own count for a slot naming one item (a store item has none); the loaded ammo's is the bag's. */
  const n = s.empty || s.action.type === 'ability' ? null : Number.isInteger(s.count) && !KINDS.has(s.action.id) ? s.count : carried(s.action, bag);
  /* WHY it cannot fire (action-facts.js reasonOf): struck when the server would not fire it, a glyph either way. */
  const out = !!why && why.strike;
  cls(li, 'is-empty', s.empty);
  cls(li, 'is-off', out);
  cls(li, 'is-wait', !!why && !why.strike);
  cls(li, 'is-blocked', !!conflict);
  const g = li.querySelector('.hb-why');
  if (g.getAttribute('data-for') !== (why ? why.code : '')) { g.innerHTML = why ? glyphSvg(ctx.glyphs, why.glyph) : ''; attr(g, 'data-for', why ? why.code : ''); }
  text(li.querySelector('.hb-count'), n ? whole(n) : '');
  attr(li, 'aria-label', 'Slot ' + (li.getAttribute('data-slot') * 1 + 1) + ': ' + (s.empty ? 'empty, press to configure' : actionName(s.action) + (why ? ': ' + why.text : '') + (conflict ? ', never fires' : '')));
}

/* The tooltip's lines for slot i (Tyler's spec): what the action is, then its setup and any conflict. */
function tipHtml(i, ctx) {
  const set = settingsOf(ctx.character);
  const s = set && set.slots[i];
  if (!s || s.empty) return '<b>Slot ' + (i + 1) + '</b><p>Empty. Press to choose a spell, rune or item for it.</p>';
  const w = wireSlot(s);
  const f = factsOf(s.action);
  const wires = Array.from({ length: SLOTS }, (_, k) => wireSlot(set.slots[k]));
  const conflict = conflictsOf(wires, set).get(i);
  const h = huntOf(ctx.character);
  const bag = carriedOf(ctx.character);
  const why = reasonOf(s, set, bag, h && !h.ended ? h.hero : null);
  const shared = sharedCooldownOf(wires, i);
  const lines = [f.cost ? (f.cost.includes('mana') ? 'Cost: ' + f.cost : f.cost) : null, f.type, f.cooldown].concat(f.effect, supplyLines(s.action, set, bag)).filter(Boolean);
  return '<b>' + esc(actionName(s.action)) + '</b><small class="hb-tip-n">Slot ' + (i + 1) + '</small>'
    + (why ? '<p class="is-warn is-why">' + esc(why.text) + '</p>' : '')
    + lines.map((l) => '<p>' + esc(l) + '</p>').join('')
    + '<hr><p class="is-setup">' + esc(setupWords(w, set)) + '</p>'
    + (shared ? '<p class="is-setup">' + esc(shared) + '</p>' : '')
    + (conflict ? '<p class="is-warn">' + esc(conflict.why) + '</p>' : '');
}

function showTip(el, li, ctx) {
  const tip = el.querySelector('.hb-tip');
  const i = Number(li.getAttribute('data-slot'));
  if (tip.getAttribute('data-for') !== String(i)) { tip.innerHTML = tipHtml(i, ctx); attr(tip, 'data-for', String(i)); }
  cls(tip, 'is-on', true);
  /* Its own width (wider on a phone, hunt.css), centred on the slot and kept inside the bar. */
  const bar = el.querySelector('.hb-bar').getBoundingClientRect(), r = li.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = Math.round(Math.max(0, Math.min(bar.width - w, r.left - bar.left + r.width / 2 - w / 2))) + 'px';
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
  const bag = carriedOf(cs);
  const hero = h && !h.ended ? h.hero : null;
  const casts = watchCasts(el, ctx);
  const now = ctx.now();
  for (const li of el.querySelectorAll('.hb-slot')) {
    const i = Number(li.getAttribute('data-slot'));
    const sl = slots[i] || { empty: true };
    patchSlot(li, sl, wires[i], ctx, bag, conflicts.get(i), reasonOf(sl, s, bag, hero));
    patchCooldown(li, sl, casts, now);
  }
  const set = s && s.presets.find((p) => p.preset === s.preset);
  const nm = el.querySelector('.hb-set');
  text(nm.querySelector('.hs-name-t'), set ? set.name : s ? 'Set ' + (s.preset + 1) : '–');
  for (const c of nm.querySelectorAll('button, input')) prop(c, 'disabled', !s || RENAMING.has(el));
  patchControls(el.querySelector('.hb-plaque'), cs);
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
    const bar = serverBar(ctx.character);
    if (!bar || from === to || !bar[from]) return true;
    /* Onto an empty slot it just moves; onto an action, the player chooses: swap or insert. */
    if (!bar[to]) runDrop(ctx, el, (b) => movePlan(b, from, to));
    else openDropMenu(ctx, el, t, from, to, bar);
    return true;
  }
  const id = ev.dataTransfer.getData(DRAG_TYPE);
  if (!barKind(id)) { text(msg, refusalWords('not_for_bar')); return true; }
  text(msg, 'Putting it on the bar…');
  answerWithin(() => assignToBar(ctx.character, id, to)).then((r) => { text(msg, r.ok ? '' : refusalWords(r.error)); repaint(); });
  return true;
}

/* One drop's intent; the status line says it is on its way and ALWAYS comes back: cleared on the server's
   answer, its words on a refusal, a plain line on the timeout (bar-draft.js answerWithin never rejects). */
function runDrop(ctx, el, plan) {
  const msg = el.querySelector('.hb-plaque .hh-intent-msg');
  text(msg, 'Moving it…');
  sendPlan(ctx.character, plan, () => renderActionBar.patch(el, ctx))
    .then((r) => { text(msg, r.ok ? '' : refusalWords(r.error)); renderActionBar.patch(el, ctx); });
}

/* THE PANEL SHEET (phone): the bar keeps the set's name and its buttons; the rest slides out from the
   right. Escape, its ×, or a press outside it closes it. Display only: nothing is sent. */
function setPanel(ctx, el, open) {
  const plaque = el.querySelector('.hb-plaque');
  const off = PANEL.get(el);
  if (off) { off(); PANEL.delete(el); }
  cls(plaque, 'is-open', open);
  attr(plaque.querySelector('.hb-more'), 'aria-expanded', String(open));
  if (!open) return;
  const doc = ctx.doc, sheet = plaque.querySelector('.hb-pl-more');
  /* Inside the World like a window sheet (never over the top strip and its icons), and under the hunt bar
     (Leave hunt stays in reach). Measured at each opening; a desktop shows the rows in the panel instead. */
  const hud = el.closest('.hs-hud'), ht = hud && hud.querySelector('.ht-bar');
  if (hud) {
    const box = hud.getBoundingClientRect(), hb = ht && ht.getClientRects().length ? ht.getBoundingClientRect() : null;
    sheet.style.top = Math.round(Math.max(box.top, hb ? hb.bottom + 4 : box.top)) + 'px';
    sheet.style.bottom = Math.round(Math.max(0, doc.documentElement.clientHeight - box.bottom)) + 'px';
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPanel(ctx, el, false); } };
  const onDown = (e) => { if (!sheet.contains(e.target) && !plaque.querySelector('.hb-more').contains(e.target)) setPanel(ctx, el, false); };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onDown, true);
  PANEL.set(el, () => { doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('pointerdown', onDown, true); });
}

/* THE DROP MENU (Tyler 10-19): dropped onto an action, the dragged action's name, Swap with <target>,
   Insert here (shift the rest) — off when there is no empty slot to shift into — and Cancel; Escape or a
   press anywhere else cancels. Nothing moves until the server confirms the one intent a choice sends. */
function openDropMenu(ctx, el, li, from, to, bar) {
  closeDropMenu(el);
  const menu = el.querySelector('.hb-drop');
  text(menu.querySelector('.hb-drop-t'), actionName(bar[from].action));
  text(menu.querySelector('[data-x="swap"]'), 'Swap with ' + actionName(bar[to].action));
  menu.querySelector('[data-x="insert"]').disabled = !insertPlan(bar, from, to);
  const b = el.querySelector('.hb-bar').getBoundingClientRect(), r = li.getBoundingClientRect();
  menu.style.left = Math.round(Math.max(0, Math.min(b.width - 240, r.left - b.left - 90))) + 'px';
  cls(menu, 'is-on', true);
  const doc = ctx.doc;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDropMenu(el); } };
  const onDown = (e) => { if (!menu.contains(e.target)) closeDropMenu(el); };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onDown, true);
  DROP.set(el, { from, to, off: () => { doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('pointerdown', onDown, true); } });
  menu.querySelector('[data-x="swap"]').focus();
}
function closeDropMenu(el) {
  const d = DROP.get(el);
  if (d) d.off();
  DROP.delete(el);
  cls(el.querySelector('.hb-drop'), 'is-on', false);
}

/* A key in the set's name field: Enter sends ONE rename of the set the bar shows (the server's preset) and the
   field closes; the plaque keeps the old name until the re-read carries the new one. Escape puts it back. */
function renameSet(ctx, el, ev, t) {
  const k = nameKey(ev);
  if (!k) return false;
  const nm = el.querySelector('.hb-set'), name = t.value.trim(), s = settingsOf(ctx.character);
  cls(nm, 'is-naming', false);
  t.blur();
  if (k !== 'commit' || !s || !name || name === nm.querySelector('.hs-name-t').textContent) return true;
  const msg = el.querySelector('.hb-plaque .hh-intent-msg');
  RENAMING.add(el);
  text(msg, 'Renaming…');
  renderActionBar.patch(el, ctx);
  answerWithin(() => renameActionSet(ctx.account, ctx.character, s.preset, name)).then((r) => {
    RENAMING.delete(el);
    text(msg, r.ok ? '' : r.error === 'timeout' ? barRefusalWords(r.error) : refusalWords(r.error));
    renderActionBar.patch(el, ctx);
  });
  return true;
}

function openOn(ctx, i) {
  openSlot(ctx.character, i);
  resetConfigureView(ctx.character);
  ctx.show('configure-action');
  ctx.refresh('configure-action');
}

renderActionBar.act = function actActionBar(ctx, el, action, ev, t) {
  /* The panel: target, stance, chase, distance — ONE intent each, the controls off until the server answers (settings-intent.js). */
  if (action === 'opt') {
    /* A button acts on its click, a select on its change; the bar's other events (pointer, drag, key) never send. */
    if (ev.type !== (t.tagName === 'SELECT' || t.tagName === 'INPUT' ? 'change' : 'click')) return;
    sendOption(ctx, el.querySelector('.hb-plaque'), t, () => renderActionBar.patch(el, ctx));
    return;
  }
  if (action === 'set-rename' && ev.type === 'click') {
    const s = settingsOf(ctx.character);
    const nm = el.querySelector('.hb-set');
    if (s && !RENAMING.has(el)) openNameEditor(nm, nm.querySelector('.hs-name-t').textContent, () => cls(nm, 'is-naming', false));
    return;
  }
  if (action === 'set-rename-key') return renameSet(ctx, el, ev, t);
  if (action === 'setups' && ev.type === 'click') { ctx.show('hunt-prep'); return; }
  if (action === 'panel' && ev.type === 'click') { setPanel(ctx, el, !PANEL.has(el)); return; }
  if (action === 'drop' && ev.type === 'click') {
    const d = DROP.get(el);
    const x = t.getAttribute('data-x');
    closeDropMenu(el);
    if (d && x === 'swap') runDrop(ctx, el, (b) => swapPlan(b, d.from, d.to));
    else if (d && x === 'insert') runDrop(ctx, el, (b) => insertPlan(b, d.from, d.to));
    return;
  }
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

