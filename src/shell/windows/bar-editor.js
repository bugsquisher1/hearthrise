// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/bar-editor.js — THE BAR'S SLOT EDITOR: "IF … THEN …".
//
// Part of the hunt settings window. The bar is a priority list: slot 1 is
// tried first and the next eligible slot is the fallback. Each slot is
//   { action: { type, id }, conditions: [{ metric, op, value, subject? }] (≤ 3), join }
// (src/data/condition-metrics.js). The pickers are built from that file's
// METRICS / OPERATORS / ACTION_TYPES only, never a hard-coded set.
//
// The list shows what the SERVER holds (hunt_settings.slots). Editing a slot
// works on a draft, which is display scratch: nothing spends it and nothing
// else reads it. Save, Empty and the move arrows each send ONE intent — the
// whole bar restated (hr_action_set_options { slots }) — every control stays
// off until the server has answered and the re-read envelope replaced the
// section, and a refusal is shown inline on the slot and condition it names.
// Join (and/or) sits under "More options".
// ════════════════════════════════════════════════════════════════════════
import { METRICS, OPERATORS, ACTION_TYPES, MAX_CONDITIONS } from '../../data/condition-metrics.js?v=0.2.1';
import { ABILITIES } from '../../data/abilities.js?v=0.2.1';
import { STATUSES } from '../../data/statuses.js?v=0.2.1';
import { ITEMS } from '../../data/items.js?v=0.2.1';
import { DRINK_ITEMS } from '../../data/drinks.js?v=0.2.1';
import { BAR_SLOTS } from '../../data/hunt-hud.js?v=0.2.1';
import { settingsOf, wireSlot } from '../../session/hunt-sections.js?v=0.2.1';
import { rows, text, attr, prop, cls, element } from '../../render/paint.js?v=0.2.1';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.1';
import { itemName, abilityName } from '../widgets/bits.js?v=0.2.1';

const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;
const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const SCRATCH = new WeakMap();   // CharacterSession -> { open: index|null, draft }

/* Where each action type's ids come from (catalogue rows; the server validates the pick). */
const ACTION_IDS = Object.freeze({
  abilities: () => Object.keys(ABILITIES).map((id) => [id, abilityName(id)]),
  /* A kind first (the best line of it: own stock, then the store), then single items. */
  supplies: () => [['food', 'Any food'], ['drink', 'Any drink']].concat(Object.keys(ITEMS).filter((id) => ITEMS[id].heals > 0).concat(Object.keys(DRINK_ITEMS)).map((id) => [id, itemName(id)])),
  ammo: () => Object.keys(ITEMS).filter((id) => /_(arrows|rune)$/.test(id)).map((id) => [id, itemName(id)]),
});

/* A consume slot that names a kind, in words. */
const KIND_WORDS = Object.freeze({ food: 'Any food', drink: 'Any drink' });

/* Plain words for the server's validation codes. */
const REFUSAL = Object.freeze({
  bad_option: 'The server does not take bar edits yet.',
  bad_condition: 'The server refused this condition.',
  bad_metric: 'The server does not know this test.',
  bad_op: 'That comparison does not fit this test.',
  bad_value: 'That value is out of range.',
  bad_action: 'This slot cannot do that action.',
  bad_subject: 'That choice of whose value does not fit this test.',
  bad_join: 'Choose all or any.',
  bad_slot: 'The server refused this slot.',
  too_many_slots: 'The bar is full.',
  too_many_conditions: 'A slot takes at most ' + MAX_CONDITIONS + ' conditions.',
  rate_limited: 'Too many changes at once. Try again in a moment.',
  settle_first: 'The hunt is catching up. Try again in a few seconds.',
});

const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { open: null, draft: null, error: null }; SCRATCH.set(cs, s); } return s; };
const options = (pairs) => pairs.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');

/** Open the editor on slot `i` for this character (the bar's slot press). */
export function openSlot(cs, i) {
  const s = scratchOf(cs);
  const set = settingsOf(cs);
  const cur = set && set.slots[i];
  s.open = Number.isInteger(i) && i >= 0 && i < SLOTS ? i : null;
  s.draft = draftOf(cur && !cur.empty ? wireSlot(cur) : null);
  s.error = null;
}

function draftOf(w) {
  return w ? JSON.parse(JSON.stringify(w)) : { action: { type: 'consume', id: '' }, conditions: [], join: 'and' };
}

function valueWords(c) {
  const m = METRIC.get(c.metric);
  if (!m) return String(c.value);
  if (m.value === 'pct') return c.value + '%';
  if (m.value === 'bool') return c.value ? 'yes' : 'no';
  if (m.value === 'effect') return (STATUSES[c.value] && STATUSES[c.value].name) || String(c.value);
  return String(c.value);
}

/** "IF My HP % at or below 50% THEN Eat or drink: Wheat Bread". */
function slotWords(w) {
  if (!w) return 'Empty';
  const act = (ACTION_TYPES[w.action.type] || { label: w.action.type }).label + ': '
    + (w.action.type === 'ability' ? abilityName(w.action.id) : KIND_WORDS[w.action.id] || itemName(w.action.id));
  if (!w.conditions.length) return 'ALWAYS ' + act;
  const conds = w.conditions.map((c) => {
    const m = METRIC.get(c.metric);
    const what = (m ? m.label : c.metric) + (c.subject && m && m.subject ? ' (' + (m.subject[c.subject] || c.subject) + ')' : '');
    if (m && m.value === 'bool') return what + ((c.op === 'eq') === (c.value === true) ? '' : ' is false');
    return what + ' ' + (OPERATORS[c.op] ? OPERATORS[c.op].label : c.op) + ' ' + valueWords(c);
  });
  return 'IF ' + conds.join(w.join === 'or' ? ' OR ' : ' AND ') + ' THEN ' + act;
}

function condHtml(i) {
  return '<div class="hx-cond" data-cond="' + i + '"><span class="hx-kw">' + (i === 0 ? 'IF' : '<span data-join-word></span>') + '</span>'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="metric" data-i="' + i + '" aria-label="Test ' + (i + 1) + '">' + options(METRICS.map((m) => [m.id, m.label])) + '</select>'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="subject" data-i="' + i + '" aria-label="Whose"></select>'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="op" data-i="' + i + '" aria-label="Comparison"></select>'
    + '<input class="hh-num" type="number" data-hs-act="bar-f" data-f="value" data-i="' + i + '" aria-label="Value">'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="effect" data-i="' + i + '" aria-label="Effect">' + options(Object.values(STATUSES).map((s) => [s.id, s.name])) + '</select>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="drop" data-i="' + i + '" aria-label="Remove this condition">×</button></div>';
}

/** The skeleton (built once, inside the hunt settings window). */
export function barEditorHtml() {
  let conds = '';
  for (let i = 0; i < MAX_CONDITIONS; i++) conds += condHtml(i);
  return '<section class="hx-bar" aria-label="Bar">'
    + '<h3 class="hs-sub">Bar</h3><p class="hs-note">Slot 1 is tried first; when its test fails, the next slot that passes fires.</p>'
    + '<ol class="hx-slots"></ol>'
    + '<div class="hx-form"><p class="hx-title"></p>' + conds
    + '<button type="button" class="hh-tool" data-hs-act="bar" data-x="add">Add a condition</button>'
    + '<div class="hx-then"><span class="hx-kw">THEN</span>'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="type" aria-label="Action">' + options(Object.entries(ACTION_TYPES).map(([k, t]) => [k, t.label])) + '</select>'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="id" aria-label="Which"></select></div>'
    + '<details class="hx-more"><summary>More options</summary><label class="he-row"><span class="he-label">With more than one condition</span>'
    + '<select class="hh-select" data-hs-act="bar-f" data-f="join"><option value="and">all must pass</option><option value="or">any one passes</option></select></label></details>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<div class="hx-actions"><button type="button" class="hh-tool is-primary" data-hs-act="bar" data-x="save">Save slot</button>'
    + '<button type="button" class="hh-tool" data-hs-act="bar" data-x="clear">Empty slot</button>'
    + '<button type="button" class="hh-tool" data-hs-act="bar" data-x="cancel">Cancel</button></div></div></section>';
}

function rowHtml(i) {
  return '<li class="hx-row"><span class="hx-n">' + (i + 1) + '</span><span class="hx-sum"></span>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="up" data-slot="' + i + '" aria-label="Move up">↑</button>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="down" data-slot="' + i + '" aria-label="Move down">↓</button>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="edit" data-slot="' + i + '">Edit</button></li>';
}

/* A select's options, rebuilt only when the list it should hold changes (a user's pick, never a timer). */
function fill(sel, pairs) {
  const key = pairs.map((p) => p[0]).join('|');
  if (sel.getAttribute('data-for') === key) return;
  sel.innerHTML = options(pairs);
  attr(sel, 'data-for', key);
}

function patchForm(form, s, pending, doc) {
  const d = s.draft;
  text(form.querySelector('.hx-title'), 'Slot ' + (s.open + 1));
  form.querySelectorAll('.hx-cond').forEach((row, i) => {
    const c = d.conditions[i];
    cls(row, 'is-on', !!c);
    cls(row, 'is-error', !!s.error && s.error.condition === i);
    if (!c) return;
    const m = METRIC.get(c.metric) || METRICS[0];
    const jw = row.querySelector('[data-join-word]');
    if (jw) text(jw, d.join === 'or' ? 'OR' : 'AND');
    prop(row.querySelector('[data-f="metric"]'), 'value', m.id);
    const subj = row.querySelector('[data-f="subject"]');
    fill(subj, m.subject ? Object.entries(m.subject) : []);
    cls(subj, 'is-on', !!m.subject);
    if (m.subject) prop(subj, 'value', c.subject || Object.keys(m.subject)[0]);
    const op = row.querySelector('[data-f="op"]');
    fill(op, m.ops.map((o) => [o, OPERATORS[o] ? OPERATORS[o].label : o]));
    prop(op, 'value', c.op);
    const num = row.querySelector('[data-f="value"]');
    cls(num, 'is-on', m.value === 'pct' || m.value === 'count');
    if (m.range) { attr(num, 'min', m.range[0]); attr(num, 'max', m.range[1]); }
    if (typeof c.value === 'number' && doc.activeElement !== num) prop(num, 'value', String(c.value));
    const eff = row.querySelector('[data-f="effect"]');
    cls(eff, 'is-on', m.value === 'effect');
    if (m.value === 'effect') prop(eff, 'value', String(c.value));
  });
  prop(form.querySelector('[data-x="add"]'), 'disabled', pending || d.conditions.length >= MAX_CONDITIONS);
  prop(form.querySelector('[data-f="type"]'), 'value', d.action.type);
  const ids = form.querySelector('[data-f="id"]');
  fill(ids, ACTION_IDS[(ACTION_TYPES[d.action.type] || {}).from || 'supplies']());
  if (d.action.id) prop(ids, 'value', d.action.id); else d.action.id = ids.value;
  prop(form.querySelector('[data-f="join"]'), 'value', d.join);
  for (const el of form.querySelectorAll('select, input, button')) if (el.getAttribute('data-x') !== 'add') prop(el, 'disabled', pending);
}

/** Patch the editor under `root` (the hunt settings window's body). */
export function patchBarEditor(root, ctx) {
  const cs = ctx.character;
  const set = settingsOf(cs);
  const s = scratchOf(cs);
  const ed = root.querySelector('.hx-bar');
  const pending = ed.hasAttribute('data-pending');
  const slots = set ? Array.from({ length: SLOTS }, (_, i) => set.slots[i] || { empty: true }) : [];
  /* Empty slots fold away but the first, so the list reads as the priority order it is. */
  const firstEmpty = slots.findIndex((sl) => sl.empty);
  rows(ed.querySelector('.hx-slots'), slots.map((sl, i) => ({ sl, i })), {
    key: (r) => r.i,
    build: (r) => element(ctx.doc, rowHtml(r.i)),
    patch: (li, r) => {
      text(li.querySelector('.hx-sum'), slotWords(r.sl.empty ? null : wireSlot(r.sl)));
      cls(li, 'is-empty', r.sl.empty);
      cls(li, 'is-folded', r.sl.empty && r.i !== firstEmpty && s.open !== r.i);
      cls(li, 'is-open', s.open === r.i);
      cls(li, 'is-error', !!s.error && s.error.slot === r.i);
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', pending);
    },
  });
  const form = ed.querySelector('.hx-form');
  const open = s.open !== null && !!set && !!s.draft;
  cls(form, 'is-on', open);
  if (open) patchForm(form, s, pending, ctx.doc);
  if (open && form.getAttribute('data-open') !== String(s.open) && typeof form.scrollIntoView === 'function') form.scrollIntoView({ block: 'nearest' });
  attr(form, 'data-open', open ? String(s.open) : null);
  cls(ed, 'is-pending', pending);
}

function move(arr, i, by) {
  const j = i + by;
  if (j < 0 || j >= arr.length) return null;
  const out = arr.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

async function send(ctx, root, ed, bar, repaint) {
  const cs = ctx.character;
  const set = settingsOf(cs);
  const s = scratchOf(cs);
  if (!set || ed.hasAttribute('data-pending')) return;
  attr(ed, 'data-pending', true);
  text(ed.querySelector('.hh-intent-msg'), 'Saving…');
  repaint();
  const r = await cs.setHuntOptions(set.preset, { slots: bar });
  attr(ed, 'data-pending', null);
  if (r.ok) { s.open = null; s.draft = null; s.error = null; text(ed.querySelector('.hh-intent-msg'), ''); }
  else { s.error = r; text(ed.querySelector('.hh-intent-msg'), REFUSAL[r.error] || 'Not saved: the server refused it.'); }
  repaint();
}

/** A control of the editor: `action` is 'bar' (buttons, data-x) or 'bar-f' (fields, data-f). */
export function actBarEditor(ctx, root, action, ev, t, repaint) {
  const cs = ctx.character;
  const s = scratchOf(cs);
  const ed = root.querySelector('.hx-bar');
  const set = settingsOf(cs);
  if (!set) return;
  const bar = Array.from({ length: SLOTS }, (_, i) => wireSlot(set.slots[i]));
  if (action === 'bar' && ev.type === 'click') {
    const x = t.getAttribute('data-x');
    const i = Number(t.getAttribute('data-slot'));
    if (x === 'edit') openSlot(cs, i);
    else if (x === 'cancel') { s.open = null; s.draft = null; s.error = null; }
    else if (x === 'add' && s.draft && s.draft.conditions.length < MAX_CONDITIONS) {
      const m = METRICS[0];
      s.draft.conditions.push({ metric: m.id, op: m.ops[0], value: m.range ? m.range[0] : true });
    } else if (x === 'drop' && s.draft) s.draft.conditions.splice(Number(t.getAttribute('data-i')), 1);
    else if ((x === 'up' || x === 'down') && move(bar, i, x === 'up' ? -1 : 1)) { send(ctx, root, ed, move(bar, i, x === 'up' ? -1 : 1), repaint); return; }
    else if (x === 'save' && s.draft) { bar[s.open] = s.draft; send(ctx, root, ed, bar, repaint); return; }
    else if (x === 'clear' && s.open !== null) { bar[s.open] = null; send(ctx, root, ed, bar, repaint); return; }
    repaint();
    return;
  }
  if (action !== 'bar-f' || ev.type !== 'change' || !s.draft) return;
  const f = t.getAttribute('data-f');
  const c = s.draft.conditions[Number(t.getAttribute('data-i'))];
  if (f === 'type') { s.draft.action = { type: t.value, id: '' }; }
  else if (f === 'id') s.draft.action.id = t.value;
  else if (f === 'join') s.draft.join = t.value === 'or' ? 'or' : 'and';
  else if (c && f === 'metric') {
    const m = METRIC.get(t.value);
    if (m) { c.metric = m.id; c.op = m.ops[0]; c.value = m.value === 'effect' ? Object.keys(STATUSES)[0] : m.range ? m.range[0] : true; c.subject = m.subject ? Object.keys(m.subject)[0] : undefined; }
  } else if (c && f === 'op') c.op = t.value;
  else if (c && f === 'subject') c.subject = t.value;
  else if (c && f === 'value') c.value = Number(t.value);
  else if (c && f === 'effect') c.value = t.value;
  repaint();
}
