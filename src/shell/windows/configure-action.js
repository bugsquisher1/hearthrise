// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/configure-action.js — "CONFIGURE ACTION": ONE BAR SLOT AS ONE SENTENCE.
//
// Tyler 2026-10-18 (the flow) and 2026-10-21 (a slot names ONE item; the game never
// picks one), built to the art direction spec of 2026-10-21 (Charcoal & Gold):
//   top       "Slot 3 · tried after slot 2", the Spells | Runes | Food & drink | Ammo tabs, Earlier / Later
//   sentence  the slot read as one editable sentence: "Eat [Salted Trout] when [my HP]
//             [is at or below] [−45+]%", then "and …" for each further condition (all
//             must match), "+ Add a condition", and the heal warning under it (the
//             hunt's hardest blow, pull-cycle.js biggestBlowOn, against the server's max HP)
//   table     the tab's items in runs (Food and Drink; Ammo on its own tab), each row its numbers from the
//             SERVER's rows (hunt_settings.store), sorted cheapest per point
//             (action-table.js tableOf); the picked row gold and pinned at the top
//   detail    the hovered or focused row against the pick (signed differences, the
//             waste at the slot's own threshold), where its uses come from, food's rule;
//             a rune spell's choice: carried runes only, or the store rune at its price
//   foot      the status line (pending, the server's refusal in words), Empty slot,
//             Cancel, Save
// Nothing applies until Save; Save, Empty slot and a move each send ONE intent
// (bar-draft.js), every control stays off until the server has answered, and a refusal
// keeps the draft and outlines its condition. On a phone (922×423) it is a full sheet.
// ════════════════════════════════════════════════════════════════════════
import { METRICS, OPERATORS, MAX_CONDITIONS } from '../../data/condition-metrics.js?v=0.2.75';
import { STATUSES } from '../../data/statuses.js?v=0.2.75';
import { settingsOf, huntOf, partyOf } from '../../session/hunt-sections.js?v=0.2.75';
import { vitalsOf } from '../../session/party-sections.js?v=0.2.75';
import { biggestBlowOn } from '../../core/hunt/pull-cycle.js?v=0.2.75';
import { carriedOf, equipmentOf } from '../../session/item-sections.js?v=0.2.75';
import { rows, text, attr, prop, cls, element } from '../../render/paint.js?v=0.2.75';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.75';
import { actionIconHtml } from '../widgets/bits.js?v=0.2.75';
import { SLOTS, draftOf, openSlot, closeSlot, conditionFor, blankCondition, saveOpen, emptyOpen, moveSlot, startConditions, storeChoices, storeChoiceWords, storeDefault } from '../bar-draft.js?v=0.2.75';
import { TABS, tabOf, factsOf, carried, healWarning, weaponWarning, reasonOf } from '../action-facts.js?v=0.2.75';
import { glyphSvg } from '../launcher.js?v=0.2.75';
import { tableOf, rowIn, cellsOf, sentenceOf, compareLines, wasteLine, sourceLine, effectLine } from '../action-table.js?v=0.2.75';

const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const options = (pairs) => pairs.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
const VIEW = new WeakMap();   // CharacterSession -> { tab, hover } (display scratch)
const viewOf = (cs) => { let v = VIEW.get(cs); if (!v) { v = { tab: null, hover: null }; VIEW.set(cs, v); } return v; };
const keyOf = (a) => (a && a.id ? a.type + ':' + a.id : '');
/* The tab of the slot type the player last picked (an empty slot opens on it, else Spells: art spec §9). */
const LAST_TAB = new WeakMap();

function tool(x, label, extra) {
  return '<button type="button" class="hh-tool' + (extra || '') + '" data-hs-act="cfg" data-x="' + x + '">' + label + '</button>';
}

/* One condition line: "when|and [metric] [whose] [comparison] [− value +] [effect] ×". */
function condHtml(i) {
  const b = (x, label, body) => '<button type="button" class="hh-seg ca-step" data-hs-act="cfg" data-x="' + x + '" data-i="' + i + '" aria-label="' + label + '">' + body + '</button>';
  return '<li class="ca-cond" data-cond="' + i + '"><span class="ca-glue">' + (i ? 'and' : 'when') + '</span> '
    + '<select class="ca-token" data-hs-act="cfg-f" data-f="metric" data-i="' + i + '" aria-label="Test ' + (i + 1) + '">' + options(METRICS.map((m) => [m.id, m.say])) + '</select>'
    + '<select class="ca-token" data-hs-act="cfg-f" data-f="subject" data-i="' + i + '" aria-label="Whose"></select>'
    + '<select class="ca-token" data-hs-act="cfg-f" data-f="op" data-i="' + i + '" aria-label="Comparison"></select>'
    + '<span class="ca-num">' + b('dec', 'Lower', '−')
    + '<input class="ca-token ca-val" type="number" inputmode="numeric" data-hs-act="cfg-f" data-f="value" data-i="' + i + '" aria-label="Value"><span class="ca-unit"></span>'
    + b('inc', 'Higher', '+') + '</span>'
    + '<select class="ca-token" data-hs-act="cfg-f" data-f="effect" data-i="' + i + '" aria-label="Effect">' + options(Object.values(STATUSES).map((s) => [s.id, s.name])) + '</select>'
    + '<button type="button" class="hh-tool ca-drop" data-hs-act="cfg" data-x="drop" data-i="' + i + '" aria-label="Remove this condition">×</button></li>';
}

/** The skeleton (built once per opening). The sentence and the list share `.ca-mid`: one box on a desktop
 *  (display: contents), the phone sheet's one scroller between its fixed top row and foot (hunt.css). */
export function renderConfigureAction(ctx) {
  let conds = '';
  for (let i = 0; i < MAX_CONDITIONS; i++) conds += condHtml(i);
  const move = '<span class="ca-move">' + tool('up', 'Earlier') + tool('down', 'Later') + '</span>';
  /* The phone sheet has no title band: its close is the window's own square steel close. */
  const close = glyphSvg(ctx && ctx.glyphs, 'uiClose') || '×';
  return '<div class="ca">'
    + '<p class="ca-loading">Your bar loads from the server…</p>'
    + '<div class="ca-form">'
    + '<div class="ca-top"><span class="ca-rank"></span>'
    + '<span class="ca-tabs" role="tablist" aria-label="Kind of action">'
    + TABS.map(([k, l]) => '<button type="button" class="ca-tab" role="tab" data-hs-act="cfg" data-x="tab" data-tab="' + k + '" aria-selected="false">' + l + '</button>').join('')
    + '</span>' + move + '<button type="button" class="hs-close ca-close" data-hs-act="cfg" data-x="cancel" aria-label="Close">' + close + '</button></div>'
    + '<div class="ca-mid">'
    + '<p class="ca-why" role="note"></p>'
    + '<div class="ca-sentence">'
    + '<p class="ca-lead"><span class="ca-verb"></span> <button type="button" class="ca-item" data-hs-act="cfg" data-x="find"></button>'
    + '<span class="ca-note"></span><span class="ca-ready"></span></p>'
    + '<ol class="ca-conds">' + conds + '</ol>'
    + '<p class="ca-weapon" role="note"></p>'
    + tool('add', '+ Add a condition', ' ca-add')
    + '<p class="ca-warn" role="note"></p></div>'
    + '<div class="ca-pick">'
    + '<div class="ca-well"><div class="ca-pinned" aria-hidden="true"></div><div class="ca-runs" role="listbox" aria-label="Choose what this slot does"></div><p class="ca-empty"></p></div>'
    + '<div class="ca-detail" aria-live="polite">'
    + '<div class="ca-d-head"><span class="ca-d-icon"></span><b class="ca-d-name"></b></div>'
    + '<p class="ca-vs"></p><ul class="ca-cmp"></ul><p class="ca-waste"></p>'
    + '<p class="ca-src"></p><p class="ca-eff"></p><p class="ca-req"></p><p class="ca-d-warn"></p>'
    + '<div class="ca-runestore"><p class="ca-rs-q">When your runes run out:</p><ul class="ca-rs-list" role="listbox" aria-label="Rune from the store"></ul></div>'
    + '<div class="ca-move-phone">' + tool('up', 'Earlier') + tool('down', 'Later') + '</div>'
    + '</div></div></div>'
    + '<p class="hh-intent-msg ca-msg" role="status" aria-live="polite"></p>'
    + '<div class="hc-foot ca-foot">' + tool('clear', 'Empty slot') + tool('cancel', 'Cancel') + tool('save', 'Save', ' is-primary') + '</div>'
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
  fill(op, m.ops.map((o) => [o, OPERATORS[o] ? OPERATORS[o].say : o]));
  prop(op, 'value', c.op);
  const numeric = m.value === 'pct' || m.value === 'count';
  cls(row.querySelector('.ca-num'), 'is-on', numeric);
  const num = row.querySelector('[data-f="value"]');
  if (m.range) { attr(num, 'min', m.range[0]); attr(num, 'max', m.range[1]); }
  if (numeric && doc.activeElement !== num) prop(num, 'value', String(c.value));
  text(row.querySelector('.ca-unit'), m.value === 'pct' ? '%' : '');
  const eff = row.querySelector('[data-f="effect"]');
  cls(eff, 'is-on', m.value === 'effect');
  if (m.value === 'effect') prop(eff, 'value', String(c.value));
}

/* One table row (button, role option): icon · name · four number cells. */
function rowHtml(ctx, r) {
  return '<button type="button" class="ca-row" role="option" data-hs-act="cfg" data-x="pick" data-type="' + esc(r.action.type) + '" data-id="' + esc(r.action.id) + '">'
    + '<span class="ca-ico">' + actionIconHtml(ctx.glyphs, r.action) + '</span>'
    + '<span class="ca-namebox"><span class="ca-name"></span><span class="ca-lock" aria-hidden="true">' + glyphSvg(ctx.glyphs, 'uiLock') + '</span></span>'
    + '<span class="ca-c" data-c="0"></span><span class="ca-c" data-c="1"></span><span class="ca-c ca-sort" data-c="2"></span><span class="ca-c" data-c="3"></span></button>';
}
function patchRow(el, r, picked, off) {
  text(el.querySelector('.ca-name'), r.name);
  cellsOf(r).forEach((v, i) => text(el.querySelector('[data-c="' + i + '"]'), String(v)));
  attr(el, 'aria-selected', String(picked));
  cls(el, 'is-on', picked);
  cls(el, 'is-none', !!r.none || !!r.unpriced);
  cls(el, 'is-store', r.carry === 'store');
  cls(el, 'is-mana', r.kind === 'drink' || r.kind === 'spells' || r.kind === 'runes');
  cls(el, 'is-locked', !!r.locked);
  attr(el, 'title', r.locked ? (r.kind === 'ammo' ? 'Your weapon can’t shoot this' : 'Your weapon can’t cast this') : '');
  prop(el, 'disabled', off);
}

/* The slot's first "my HP / my mana at or below N%" test: the threshold the waste line reads. */
function threshold(d, kind) {
  const metric = kind === 'drink' ? 'self_mana_pct' : 'self_hp_pct';
  const c = d.conditions.find((x) => x.metric === metric && (x.op === 'lt' || x.op === 'lte') && Number.isFinite(x.value));
  return c ? c.value : null;
}

renderConfigureAction.patch = function patchConfigureAction(body, ctx) {
  const cs = ctx.character;
  const set = settingsOf(cs);
  const s = draftOf(cs);
  /* Opened by its key with no slot picked: the first empty slot (else slot 1). */
  if (set && (s.open === null || !s.draft)) { const e = set.slots.findIndex((x) => !x || x.empty); openSlot(cs, e >= 0 && e < SLOTS ? e : 0); }
  const root = body.querySelector('.ca');
  const on = !!set && s.open !== null && !!s.draft;
  cls(root, 'is-empty', !on);
  if (!on) return;
  const d = s.draft;
  const off = s.pending;
  /* What the hero carries NOW (carriedOf): in a hunt, the hunt bag. */
  const bag = carriedOf(cs);
  const v = viewOf(cs);
  const tab = v.tab || (d.action.id ? tabOf(d.action) : LAST_TAB.get(cs) || 'spells');
  const table = tableOf(tab, { discipline: set.discipline, role: set.role, bag, store: set.store });
  const picked = rowIn(table, d.action);
  /* THE TOP LINE */
  text(root.querySelector('.ca-rank'), 'Slot ' + (s.open + 1) + (s.open === 0 ? ' · tried first' : ' · tried after slot ' + s.open));
  /* Why this slot's action will not fire, as the bar's tooltip says it: a phone has no hover and a press on a slot opens
     this window, so the words are here, first (shown on a phone only, hunt.css). */
  const saved = set.slots[s.open];
  const hunt = huntOf(cs);
  const fireWhy = saved && !saved.empty ? reasonOf(saved, set, bag, hunt && !hunt.ended ? hunt.hero : null, (equipmentOf(cs) || {}).ammo) : null;
  text(root.querySelector('.ca-why'), fireWhy ? fireWhy.text : '');
  for (const b of root.querySelectorAll('.ca-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === tab));
  /* THE SENTENCE */
  const say = sentenceOf(d.action, set.store);
  const lead = root.querySelector('.ca-lead');
  cls(lead, 'is-blank', !d.action.id);
  text(root.querySelector('.ca-verb'), d.action.id ? say.verb : 'Choose what this slot does.');
  text(root.querySelector('.ca-item'), say.item);
  text(root.querySelector('.ca-note'), say.note ? ' ' + say.note : '');
  text(root.querySelector('.ca-ready'), d.action.id && !d.conditions.length ? ' whenever it is ready.' : '');
  root.querySelectorAll('.ca-cond').forEach((row, i) => patchCond(row, d.conditions[i], i, s, ctx.doc));
  text(root.querySelector('.ca-weapon'), weaponWarning(d.action, set.discipline, set.role));
  /* The heal warning: the hero's hunt (running, else the last one) at the party's size, the server's max HP. */
  const h = huntOf(cs), p = partyOf(cs);
  const blow = h && h.huntId ? biggestBlowOn(h.huntId, p ? p.members.length : 1) : null;
  const warn = healWarning(d, set, blow, vitalsOf(cs).hpMax);
  text(root.querySelector('.ca-warn'), warn);
  /* On a phone the sentence's warning is one line with an ellipsis; the detail pane says it whole. */
  text(root.querySelector('.ca-d-warn'), warn);
  /* THE TABLE: runs of rows, the pick pinned at the top of the well */
  rows(root.querySelector('.ca-runs'), table.runs, {
    key: (run) => tab + ':' + run.kind,
    build: (run) => element(ctx.doc, '<section class="ca-run" data-run="' + esc(run.kind) + '">' + (run.label ? '<h3 class="ca-run-label">' + esc(run.label) + '</h3>' : '')
      /* Each head cell carries its column's data-c, so a rule that hides a column hides its head with it. */
      + '<div class="ca-head" aria-hidden="true"><span></span><span class="ca-name">Name</span>' + run.cols.map((c, i) => '<span class="ca-c' + (i === 2 ? ' ca-sort' : '') + '" data-c="' + i + '">' + esc(c) + '</span>').join('') + '</div>'
      + '<div class="ca-list"></div></section>'),
    patch: (sec, run) => rows(sec.querySelector('.ca-list'), run.rows, {
      key: (r) => keyOf(r.action),
      build: (r) => element(ctx.doc, rowHtml(ctx, r)),
      patch: (el, r) => patchRow(el, r, keyOf(r.action) === keyOf(d.action), off),
    }),
  });
  const pin = root.querySelector('.ca-pinned');
  const pinKey = picked ? keyOf(picked.action) : '';
  if (pin.getAttribute('data-for') !== pinKey) { pin.innerHTML = picked ? rowHtml(ctx, picked).replace('data-x="pick"', 'data-x="find"') : ''; attr(pin, 'data-for', pinKey); }
  if (picked) patchRow(pin.firstElementChild, picked, true, off);
  cls(pin, 'is-on', !!picked);
  text(root.querySelector('.ca-empty'), table.empty || '');
  /* THE DETAIL: the hovered row against the pick, else the pick */
  const hover = v.hover ? rowIn(table, v.hover) : null;
  const shown = hover || picked;
  const icon = root.querySelector('.ca-d-icon');
  const ik = shown ? keyOf(shown.action) : '';
  if (icon.getAttribute('data-for') !== ik) { icon.innerHTML = shown ? actionIconHtml(ctx.glyphs, shown.action) : ''; attr(icon, 'data-for', ik); }
  text(root.querySelector('.ca-d-name'), shown ? shown.name : '');
  const cmp = hover && picked && hover !== picked ? compareLines(hover, picked) : [];
  text(root.querySelector('.ca-vs'), cmp.length ? 'vs your ' + picked.name : '');
  rows(root.querySelector('.ca-cmp'), cmp, { key: (x) => x, build: () => element(ctx.doc, '<li></li>'), patch: (li, x) => text(li, x) });
  const max = shown && shown.kind === 'drink' ? vitalsOf(cs).manaMax : vitalsOf(cs).hpMax;
  text(root.querySelector('.ca-waste'), shown ? wasteLine(shown, threshold(d, shown.kind), max) : '');
  text(root.querySelector('.ca-src'), shown ? sourceLine(shown) : '');
  text(root.querySelector('.ca-eff'), effectLine(shown));
  const f = shown ? factsOf(shown.action) : null;
  text(root.querySelector('.ca-req'), f && f.requires ? f.requires : '');
  /* A rune spell's store choice: carried runes only, or its store rune at the server's price a cast. */
  const runes = storeChoices(d.action, set.store);
  cls(root.querySelector('.ca-runestore'), 'is-on', runes.length > 0);
  rows(root.querySelector('.ca-rs-list'), runes, {
    key: (c) => c.id || '-',
    build: (c) => element(ctx.doc, '<li><button type="button" class="ca-rs" role="option" data-hs-act="cfg" data-x="store" data-store="' + esc(c.id || '') + '"></button></li>'),
    patch: (li, c) => {
      const sel = (d.action.store || null) === c.id;
      const b = li.firstElementChild;
      attr(b, 'aria-selected', String(sel)); cls(b, 'is-on', sel); prop(b, 'disabled', off);
      text(b, storeChoiceWords(c));
    },
  });
  /* THE FOOT */
  const msg = root.querySelector('.ca-msg');
  text(msg, s.msg);
  cls(msg, 'is-error', !!s.error);
  for (const el of root.querySelectorAll('.ca-form select, .ca-form input, .ca-form .hh-tool, .ca-form .ca-step, .ca-close, .ca-item, .ca-tab')) prop(el, 'disabled', off);
  prop(root.querySelector('.ca-add'), 'disabled', off || d.conditions.length >= MAX_CONDITIONS || !d.action.id);
  for (const b of root.querySelectorAll('[data-x="up"]')) prop(b, 'disabled', off || s.open === 0);
  for (const b of root.querySelectorAll('[data-x="down"]')) prop(b, 'disabled', off || s.open === SLOTS - 1);
  prop(root.querySelector('.ca-foot [data-x="save"]'), 'disabled', off || !d.action.id);
};

/* A numeric value nudged by − / + (5 on a percent, 1 on a count), kept inside its range. */
function nudge(c, by) {
  const m = METRIC.get(c.metric);
  if (!m || !m.range) return;
  const step = m.value === 'pct' ? 5 : 1;
  c.value = Math.max(m.range[0], Math.min(m.range[1], (Number(c.value) || 0) + by * step));
}

renderConfigureAction.events = ['mouseover', 'focusin'];

renderConfigureAction.act = function actConfigureAction(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const s = draftOf(cs);
  const v = viewOf(cs);
  const repaint = () => ctx.refresh('configure-action');
  /* Hover or focus compares a row against the pick (display only). */
  if ((ev.type === 'mouseover' || ev.type === 'focusin') && action === 'cfg') {
    if (t.getAttribute('data-x') !== 'pick') return false;
    const next = { type: t.getAttribute('data-type'), id: t.getAttribute('data-id') };
    if (keyOf(v.hover) !== keyOf(next)) { v.hover = next; repaint(); }
    return false;
  }
  if (s.pending || !s.draft) return;
  const done = () => { VIEW.delete(cs); ctx.wm.close('configure-action'); };
  const d = s.draft;
  const c = d.conditions[Number(t.getAttribute('data-i'))];
  if (action === 'cfg' && ev.type === 'click') {
    const x = t.getAttribute('data-x');
    if (x === 'tab') { v.tab = t.getAttribute('data-tab'); v.hover = null; repaint(); listToTop(body); return; }
    else if (x === 'pick') {
      d.action = { type: t.getAttribute('data-type'), id: t.getAttribute('data-id') };
      v.hover = null;
      LAST_TAB.set(cs, tabOf(d.action));
      const st = storeDefault(d.action, (settingsOf(cs) || {}).store);
      if (st) d.action.store = st;
      /* A slot with no condition yet starts with its action's own, written on it: food at HP below 50%, drink at
         mana below 30%, a heal or a shield under its threshold, an area at two monsters (nothing hidden behind it). */
      if (!d.conditions.length) d.conditions = startConditions(d.action);
    }
    else if (x === 'find') {
      /* The item token names the pick: bring its row into view. */
      const row = body.querySelector('.ca-runs .ca-row[aria-selected="true"]');
      if (row && row.scrollIntoView) { row.scrollIntoView({ block: 'nearest' }); row.focus(); }
      return;
    }
    else if (x === 'store') {
      const id = t.getAttribute('data-store');
      d.action = Object.assign({ type: d.action.type, id: d.action.id }, id ? { store: id } : {});
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

/* A new tab's list starts at its first row: the desktop's well back to its top, and on a phone the sheet's one
   scroller (.ca-mid) back to the list's top when it had scrolled past it (the sentence stays scrolled by). */
function listToTop(body) {
  const well = body.querySelector('.ca-well'), mid = body.querySelector('.ca-mid');
  if (!well) return;
  well.scrollTop = 0;
  const past = mid ? well.getBoundingClientRect().top - mid.getBoundingClientRect().top : 0;
  if (past < 0) mid.scrollTop += past;
}

/** Forget the tab on show (the bar opens the window on a slot's own tab). */
export function resetConfigureView(cs) { VIEW.delete(cs); }
