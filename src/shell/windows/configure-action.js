// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/configure-action.js — "CONFIGURE ACTION": ONE BAR SLOT, WHAT AND WHEN.
//
// Tyler's spec (2026-10-18; Huntera's flow, never its look): a press on a bar
// slot (its "+" when empty) opens this window CENTRED over the World (a modal
// row, src/data/shell-windows.js), in town or in a hunt.
//   tabs      Spells | Runes | Items (action-facts.js TABS / choicesFor: the ids
//             the server accepts; Items carries food, drink and ammo, own stock
//             and "Any food" / "Any drink" with the store behind them at its
//             price per use)
//   list      icon + name per choice (+ how many you carry, the store price)
//   details   icon + name, type line, cost · cooldown, effect, where its uses
//             come from (own first, then the store), requirement
//   conditions up to MAX_CONDITIONS registry tests (metric, whose, comparison,
//             − value +), all or any; with none, the action's own trigger
//   priority  Earlier / Later (slot 1 fires first); dragging on the bar too
// Nothing applies until Save; Save, Empty slot and a move each send ONE intent
// (bar-draft.js), every control stays off until the server has answered and the
// re-read envelope has replaced hunt_settings, and a refusal shows on its
// condition. Not here yet, because the server's slot holds no field for them:
// an Enabled switch and a slot's ignored monsters (half-built stays hidden).
// ════════════════════════════════════════════════════════════════════════
import { METRICS, OPERATORS, MAX_CONDITIONS } from '../../data/condition-metrics.js?v=0.2.13';
import { STATUSES } from '../../data/statuses.js?v=0.2.13';
import { settingsOf } from '../../session/hunt-sections.js?v=0.2.13';
import { bagOf } from '../../session/item-sections.js?v=0.2.13';
import { rows, text, attr, prop, cls, element } from '../../render/paint.js?v=0.2.13';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.13';
import { actionIconHtml } from '../widgets/bits.js?v=0.2.13';
import { SLOTS, draftOf, openSlot, closeSlot, conditionFor, blankCondition, saveOpen, emptyOpen, moveSlot, storeOf, supplyDefault } from '../bar-draft.js?v=0.2.13';
import { TABS, tabOf, choicesFor, actionName, factsOf, carried, supplyLines, setupWords } from '../action-facts.js?v=0.2.13';

const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const options = (pairs) => pairs.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
const VIEW = new WeakMap();   // CharacterSession -> the tab on show (display scratch)

function condHtml(i) {
  const b = (x, label, body) => '<button type="button" class="hh-seg" data-hs-act="cfg" data-x="' + x + '" data-i="' + i + '" aria-label="' + label + '">' + body + '</button>';
  return '<li class="hc-cond" data-cond="' + i + '">'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="metric" data-i="' + i + '" aria-label="Test ' + (i + 1) + '">' + options(METRICS.map((m) => [m.id, m.label])) + '</select>'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="subject" data-i="' + i + '" aria-label="Whose"></select>'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="op" data-i="' + i + '" aria-label="Comparison"></select>'
    + '<span class="hc-num hh-step">' + b('dec', 'Lower', '−')
    + '<input class="hh-num" type="number" inputmode="numeric" data-hs-act="cfg-f" data-f="value" data-i="' + i + '" aria-label="Value"><span class="he-unit"></span>'
    + b('inc', 'Higher', '+') + '</span>'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="effect" data-i="' + i + '" aria-label="Effect">' + options(Object.values(STATUSES).map((s) => [s.id, s.name])) + '</select>'
    + b('drop', 'Remove this condition', '×') + '</li>';
}

/** The skeleton (built once per opening). */
export function renderConfigureAction() {
  let conds = '';
  for (let i = 0; i < MAX_CONDITIONS; i++) conds += condHtml(i);
  const btn = (x, label, extra) => '<button type="button" class="hh-tool' + (extra || '') + '" data-hs-act="cfg" data-x="' + x + '">' + label + '</button>';
  return '<div class="hc-cfg">'
    + '<p class="hh-empty hc-none">Your bar shows here once your character has loaded.</p>'
    + '<div class="hc-form">'
    + '<div class="hc-head"><b class="hc-title"></b><small class="hc-rank"></small>' + btn('up', 'Earlier') + btn('down', 'Later') + '</div>'
    + '<div class="hc-tabs" role="tablist" aria-label="Kind of action">'
    + TABS.map(([k, l]) => '<button type="button" class="hc-tab" role="tab" data-hs-act="cfg" data-x="tab" data-tab="' + k + '" aria-selected="false">' + l + '</button>').join('')
    + '</div>'
    + '<div class="hc-pick"><ul class="hc-list" role="listbox" aria-label="Choose the action"></ul>'
    + '<div class="hc-detail"><div class="hc-detail-head"><span class="hc-detail-icon"></span><b class="hc-name"></b></div>'
    + '<p class="hc-type"></p><p class="hc-cost"></p><ul class="hc-facts"></ul><p class="hc-req"></p></div></div>'
    + '<div class="hc-conds-head"><h3 class="hs-sub">Conditions</h3>' + btn('add', '+ Add condition') + '</div>'
    + '<p class="hs-note hc-rule"></p>'
    + '<ol class="hc-conds">' + conds + '</ol>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<div class="hc-foot">' + btn('clear', 'Empty slot') + btn('cancel', 'Cancel') + btn('save', 'Save', ' is-primary') + '</div>'
    + '</div></div>';
}

/* A select's options, rebuilt only when the list it should hold changes. */
function fill(sel, pairs) {
  const key = pairs.map((p) => p[0]).join('|');
  if (sel.getAttribute('data-for') === key) return;
  sel.innerHTML = options(pairs);
  attr(sel, 'data-for', key);
}

function patchCond(row, c, i, s, doc) {
  cls(row, 'is-on', !!c);
  cls(row, 'is-error', !!s.error && s.error.condition === i);
  if (!c) return;
  const m = METRIC.get(c.metric) || METRICS[0];
  prop(row.querySelector('[data-f="metric"]'), 'value', m.id);
  const subj = row.querySelector('[data-f="subject"]');
  fill(subj, m.subject ? Object.entries(m.subject) : []);
  cls(subj, 'is-on', !!m.subject);
  if (m.subject) prop(subj, 'value', c.subject || Object.keys(m.subject)[0]);
  const op = row.querySelector('[data-f="op"]');
  fill(op, m.ops.map((o) => [o, OPERATORS[o] ? OPERATORS[o].label : o]));
  prop(op, 'value', c.op);
  const numeric = m.value === 'pct' || m.value === 'count';
  cls(row.querySelector('.hc-num'), 'is-on', numeric);
  const num = row.querySelector('[data-f="value"]');
  if (m.range) { attr(num, 'min', m.range[0]); attr(num, 'max', m.range[1]); }
  if (numeric && doc.activeElement !== num) prop(num, 'value', String(c.value));
  text(row.querySelector('.he-unit'), m.value === 'pct' ? '%' : '');
  const eff = row.querySelector('[data-f="effect"]');
  cls(eff, 'is-on', m.value === 'effect');
  if (m.value === 'effect') prop(eff, 'value', String(c.value));
}

/* The list's small note: how many you carry, and the store's price per use. */
function choiceNote(a, bag) {
  const st = storeOf(a), n = carried(a, bag);
  return [n ? '×' + n : '', st && st.price !== null ? (st.from ? 'store from ' : 'store ') + st.price + ' g each' : st ? 'store' : ''].filter(Boolean).join(' · ');
}

renderConfigureAction.patch = function patchConfigureAction(body, ctx) {
  const cs = ctx.character;
  const set = settingsOf(cs);
  const s = draftOf(cs);
  /* Opened by its key with no slot picked: the first empty slot (else slot 1). */
  if (set && (s.open === null || !s.draft)) { const e = set.slots.findIndex((x) => !x || x.empty); openSlot(cs, e >= 0 && e < SLOTS ? e : 0); }
  const root = body.querySelector('.hc-cfg');
  const on = !!set && s.open !== null && !!s.draft;
  cls(root, 'is-empty', !on);
  if (!on) return;
  const d = s.draft;
  const off = s.pending;
  const bag = bagOf(cs);
  const tab = VIEW.get(cs) || tabOf(d.action);
  text(root.querySelector('.hc-title'), 'Slot ' + (s.open + 1));
  text(root.querySelector('.hc-rank'), s.open === 0 ? 'Tried first' : 'Tried after slot ' + s.open);
  for (const b of root.querySelectorAll('.hc-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === tab));
  rows(root.querySelector('.hc-list'), choicesFor(tab, set.role), {
    key: (c) => c.type + ':' + c.id,
    build: (c) => element(ctx.doc, '<li role="option"><button type="button" class="hc-choice" data-hs-act="cfg" data-x="pick" data-type="' + esc(c.type) + '" data-id="' + esc(c.id) + '">'
      + actionIconHtml(ctx.glyphs, c) + '<span class="hc-choice-name">' + esc(c.name) + '</span><small class="hc-choice-note"></small></button></li>'),
    patch: (li, c) => {
      const picked = c.type === d.action.type && c.id === d.action.id;
      attr(li, 'aria-selected', String(picked)); cls(li, 'is-on', picked); prop(li.firstElementChild, 'disabled', off);
      text(li.querySelector('.hc-choice-note'), choiceNote(c, bag));
    },
  });
  const icon = root.querySelector('.hc-detail-icon');
  const key = d.action.type + ':' + d.action.id;
  if (icon.getAttribute('data-for') !== key) { icon.innerHTML = d.action.id ? actionIconHtml(ctx.glyphs, d.action) : ''; attr(icon, 'data-for', key); }
  text(root.querySelector('.hc-name'), d.action.id ? actionName(d.action) : 'Choose one from the list');
  const f = d.action.id ? factsOf(d.action) : { type: null, cost: null, cooldown: null, effect: [], requires: null };
  text(root.querySelector('.hc-type'), f.type || '');
  text(root.querySelector('.hc-cost'), [f.cost, f.cooldown].filter(Boolean).join(' · '));
  rows(root.querySelector('.hc-facts'), f.effect.concat(d.action.id ? supplyLines(d.action, set, bag) : []), {
    key: (x) => x, build: () => element(ctx.doc, '<li></li>'), patch: (li, x) => text(li, x),
  });
  text(root.querySelector('.hc-req'), f.requires || '');
  const n = d.conditions.length;
  text(root.querySelector('.hc-rule'), n ? 'All conditions must match (up to ' + MAX_CONDITIONS + ').'
    : (d.action.id ? setupWords(d, set) : 'No conditions: the action’s own trigger.'));
  root.querySelectorAll('.hc-cond').forEach((row, i) => patchCond(row, d.conditions[i], i, s, ctx.doc));
  const msg = root.querySelector('.hh-intent-msg');
  text(msg, s.msg);
  cls(msg, 'is-error', !!s.error);
  for (const el of root.querySelectorAll('.hc-form select, .hc-form input, .hc-form button:not(.hc-choice)')) prop(el, 'disabled', off);
  prop(root.querySelector('[data-x="add"]'), 'disabled', off || n >= MAX_CONDITIONS);
  prop(root.querySelector('[data-x="up"]'), 'disabled', off || s.open === 0);
  prop(root.querySelector('[data-x="down"]'), 'disabled', off || s.open === SLOTS - 1);
  prop(root.querySelector('[data-x="save"]'), 'disabled', off || !d.action.id);
};

/* A numeric value nudged by − / + (5 on a percent, 1 on a count), kept inside its range. */
function nudge(c, by) {
  const m = METRIC.get(c.metric);
  if (!m || !m.range) return;
  const step = m.value === 'pct' ? 5 : 1;
  c.value = Math.max(m.range[0], Math.min(m.range[1], (Number(c.value) || 0) + by * step));
}

renderConfigureAction.act = function actConfigureAction(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const s = draftOf(cs);
  if (s.pending || !s.draft) return;
  const repaint = () => ctx.refresh('configure-action');
  const done = () => { VIEW.delete(cs); ctx.wm.close('configure-action'); };
  const d = s.draft;
  const c = d.conditions[Number(t.getAttribute('data-i'))];
  if (action === 'cfg' && ev.type === 'click') {
    const x = t.getAttribute('data-x');
    if (x === 'tab') VIEW.set(cs, t.getAttribute('data-tab'));
    else if (x === 'pick') {
      d.action = { type: t.getAttribute('data-type'), id: t.getAttribute('data-id') };
      /* A food or drink slot with no condition yet starts at HP below 50% / mana below 30%. */
      if (!d.conditions.length) d.conditions = supplyDefault(d.action);
    }
    else if (x === 'add' && d.conditions.length < MAX_CONDITIONS) d.conditions.push(blankCondition());
    else if (x === 'drop' && c) d.conditions.splice(Number(t.getAttribute('data-i')), 1);
    else if ((x === 'inc' || x === 'dec') && c) nudge(c, x === 'inc' ? 1 : -1);
    else if (x === 'up' || x === 'down') { moveSlot(cs, s.open, x === 'up' ? -1 : 1, repaint); return; }
    else if (x === 'save') { saveOpen(cs, repaint, done); return; }
    else if (x === 'clear') { emptyOpen(cs, repaint, done); return; }
    else if (x === 'cancel') { closeSlot(cs); done(); return; }
    repaint();
    return;
  }
  if (action !== 'cfg-f' || ev.type !== 'change') return;
  const f = t.getAttribute('data-f');
  if (c && f === 'metric') { const n = conditionFor(t.value); if (n) d.conditions[Number(t.getAttribute('data-i'))] = n; }
  else if (c && f === 'op') c.op = t.value;
  else if (c && f === 'subject') c.subject = t.value;
  else if (c && f === 'value') c.value = Math.round(Number(t.value)) || 0;
  else if (c && f === 'effect') c.value = t.value;
  repaint();
};

/** Forget the tab on show (the bar opens the window on a slot's own tab). */
export function resetConfigureView(cs) { VIEW.delete(cs); }
