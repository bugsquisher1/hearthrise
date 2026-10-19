// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/configure-action.js — "CONFIGURE ACTION": ONE BAR SLOT, WHAT AND WHEN.
//
// A press on a bar slot (in a hunt or in town) opens this window on that slot.
//   kind      Use an ability / Eat or drink / Attack with an item
//             (ACTION_TYPES, src/data/condition-metrics.js)
//   list      the choices of that kind: the abilities the worn weapon gives
//             (the server's `role`), every food and drink the bag may carry
//             plus "Any food" / "Any drink", every ammo line plus "The
//             loaded ammo" — the same rows the server accepts
//             (src/core/hunt/conditions.js actionKnown), never a typed list
//   details   what the picked choice does, read from its catalogue row
//   conditions up to MAX_CONDITIONS tests from the registry (metric, whose,
//             comparison, value with − / +), all or any; with none, the
//             action's own trigger, spelled out
//   priority  Earlier / Later moves the slot in the bar (slot 1 fires first)
// Save, Empty slot and the moves each send ONE intent through bar-draft.js;
// every control stays off until the server has answered and the re-read
// envelope has replaced hunt_settings, and a refusal is shown on its condition.
// ════════════════════════════════════════════════════════════════════════
import { METRICS, OPERATORS, ACTION_TYPES, MAX_CONDITIONS, CONSUME_KINDS, ATTACK_KINDS } from '../../data/condition-metrics.js?v=0.2.1';
import { ABILITIES } from '../../data/abilities.js?v=0.2.1';
import { CONSUMABLES, CONSUMABLE_RULES } from '../../data/consumables.js?v=0.2.1';
import { SUPPLIES } from '../../data/supplies.js?v=0.2.1';
import { STATUSES } from '../../data/statuses.js?v=0.2.1';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.1';
import { defaultConditions } from '../../core/hunt/conditions.js?v=0.2.1';
import { settingsOf } from '../../session/hunt-sections.js?v=0.2.1';
import { bagOf } from '../../session/item-sections.js?v=0.2.1';
import { rows, text, attr, prop, cls, element } from '../../render/paint.js?v=0.2.1';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.1';
import { glyphSvg } from '../launcher.js?v=0.2.1';
import { itemName, abilityName, itemIconHtml } from '../widgets/bits.js?v=0.2.1';
import { SLOTS, draftOf, openSlot, closeSlot, conditionFor, blankCondition, conditionWords, saveOpen, emptyOpen, moveSlot, storeOf, storeWords } from '../bar-draft.js?v=0.2.1';

const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const options = (pairs) => pairs.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
const secs = (ms) => (ms % 1000 ? (ms / 1000).toFixed(1) : String(ms / 1000));

/* The choices of each action type: [id, name, glyph-or-null] (a null glyph = the item's own icon). */
const KIND_ROWS = Object.freeze({
  food: ['food', 'Any food', 'uiChest'], drink: ['drink', 'Any drink', 'uiPotion'], loaded: ['loaded', 'The loaded ammo', 'uiSword'],
});
function choicesOf(type, role) {
  if (type === 'ability') {
    const disc = role && HUNT_ROLES[role] ? HUNT_ROLES[role].discipline : null;
    return Object.values(ABILITIES).filter((a) => a.active && (!disc || a.disciplines.includes(disc))).map((a) => [a.id, a.n, 'uiSpark']);
  }
  if (type === 'consume') {
    return Object.keys(CONSUME_KINDS).map((k) => KIND_ROWS[k])
      .concat(Object.values(CONSUMABLES).filter((r) => r.source === 'own').map((r) => [r.id, itemName(r.id), null]));
  }
  return Object.keys(ATTACK_KINDS).map((k) => KIND_ROWS[k])
    .concat(Object.values(SUPPLIES).filter((r) => r.kind === 'ammo').map((r) => [r.id, itemName(r.id), null]));
}

/* What a choice does, in plain lines, from its catalogue row. */
function factsOf(a, set, bag) {
  return whatOf(a).concat(supplyOf(a, set, bag));
}

/* How many of a choice the bag holds (a kind: every line of it), from the server's inventory. */
function carried(a, bag) {
  if (!bag) return null;
  const kinds = { food: 'food', drink: 'drink' };
  const of = (id) => (bag.find((l) => l.id === id) || { qty: 0 }).qty;
  if (a.type === 'consume' && kinds[a.id]) return bag.filter((l) => CONSUMABLES[l.id] && CONSUMABLES[l.id].source === 'own' && CONSUMABLES[l.id].kind === kinds[a.id]).reduce((n, l) => n + l.qty, 0);
  if (a.id === 'loaded') return null;
  return a.type === 'ability' ? null : of(a.id);
}

/* Where its uses come from: own stock first, then the store per use (or nothing), and the supply setting. */
function supplyOf(a, set, bag) {
  if (a.type === 'ability') return [];
  const st = storeOf(a);
  const n = carried(a, bag);
  const out = [];
  if (n !== null) out.push(n > 0 ? 'You carry ' + n + '. ' + (st ? 'Own stock first, ' + storeWords(st) + '.' : 'When they run out, this slot waits.') : st ? 'You carry none: ' + storeWords(st).replace(/^then /, '') + '.' : 'You carry none, so this slot waits.');
  else if (st) out.push('Own stock first, ' + storeWords(st) + '.');
  if (st && set && set.supplySource !== 'store' && set.onEmpty !== 'switch') out.push('Your supply setting keeps the store off (Hunt settings, When my bag runs out).');
  if (!st && a.type === 'consume') out.push('Choose Any food or Any drink to fall back on the store.');
  return out;
}

function whatOf(a) {
  if (a.type === 'ability') {
    const r = ABILITIES[a.id];
    if (!r) return [];
    const out = [r.mana ? 'Costs ' + r.mana + ' mana.' : 'Costs no mana.', 'Ready again after ' + secs(r.cdMs) + ' seconds.'];
    const el = r.element ? ' ' + r.element : '';
    if (r.target === 'taunt') out.push('Pulls the monsters near you onto you.');
    if (r.target === 'mark') out.push('Your target takes ' + r.bonusPct + '% more damage for ' + secs(r.durMs) + ' seconds.');
    if (r.dmg) out.push('Deals ' + r.dmg[0] + '–' + r.dmg[1] + el + ' damage' + (r.target === 'area' ? ' to every monster in the area.' : r.maxHits ? ' to up to ' + r.maxHits + ' monsters.' : r.hits ? ', ' + r.hits + ' times.' : '.'));
    if (r.heal) out.push('Heals ' + r.heal[0] + '–' + r.heal[1] + (r.target === 'party' ? ' to everyone nearby.' : ' to the ally who needs it most.'));
    if (r.shield) out.push('Puts a ' + r.shield + '-point shield on you.');
    if (r.status && STATUSES[r.status]) out.push('Causes ' + STATUSES[r.status].name.toLowerCase() + '.');
    if (r.rune) out.push('Uses one ' + itemName(r.rune) + ' each time.');
    if (r.ammo) out.push('Uses ' + r.ammo + ' of your loaded ammo.');
    return out;
  }
  if (a.type === 'consume') {
    const stat = (k) => (k === 'drink' || k === 'mana' ? 'mana' : 'health');
    const spread = 'Half lands at once, the rest over ' + secs(CONSUMABLE_RULES.overTimeMs) + ' seconds.';
    if (own(CONSUME_KINDS, a.id)) return ['Uses the best ' + a.id + ' you carry.', spread];
    const r = CONSUMABLES[a.id];
    return r ? ['Restores ' + r.amount + ' ' + stat(r.kind) + '.', spread] : [];
  }
  if (own(ATTACK_KINDS, a.id)) return ['Attacks with whatever ammo you have loaded.'];
  return ['Attacks with it. Each shot uses one.'];
}

function condHtml(i) {
  const b = (x, label, body) => '<button type="button" class="hh-seg" data-hs-act="cfg" data-x="' + x + '" data-i="' + i + '" aria-label="' + label + '">' + body + '</button>';
  return '<li class="hc-cond" data-cond="' + i + '">'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="metric" data-i="' + i + '" aria-label="Test ' + (i + 1) + '">' + options(METRICS.map((m) => [m.id, m.label])) + '</select>'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="subject" data-i="' + i + '" aria-label="Whose"></select>'
    + '<select class="hh-select" data-hs-act="cfg-f" data-f="op" data-i="' + i + '" aria-label="Comparison"></select>'
    + '<span class="hc-num">' + b('dec', 'Lower', '−')
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
    + '<div class="hh-segs hc-types" role="group" aria-label="Kind of action">'
    + Object.entries(ACTION_TYPES).map(([k, t]) => '<button type="button" class="hh-seg" data-hs-act="cfg" data-x="type" data-type="' + esc(k) + '" aria-pressed="false">' + esc(t.label) + '</button>').join('')
    + '</div>'
    + '<div class="hc-pick"><ul class="hc-list" role="listbox" aria-label="Choose the action"></ul>'
    + '<div class="hc-detail"><p class="hc-name"></p><ul class="hc-facts"></ul></div></div>'
    + '<div class="hc-conds-head"><h3 class="hs-sub">Conditions</h3>' + btn('add', 'Add a condition') + '</div>'
    + '<p class="hs-note hc-rule"></p>'
    + '<label class="hc-join"><span class="he-label">With more than one</span><select class="hh-select" data-hs-act="cfg-f" data-f="join">'
    + '<option value="and">all must pass</option><option value="or">any one passes</option></select></label>'
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
  text(root.querySelector('.hc-title'), 'Slot ' + (s.open + 1));
  text(root.querySelector('.hc-rank'), s.open === 0 ? 'Tried first' : 'Tried after slot ' + s.open);
  for (const b of root.querySelectorAll('.hc-types [data-type]')) attr(b, 'aria-pressed', String(b.getAttribute('data-type') === d.action.type));
  const choices = choicesOf(d.action.type, set.role);
  const bag = bagOf(cs);
  rows(root.querySelector('.hc-list'), choices, {
    key: (c) => d.action.type + ':' + c[0],
    build: (c) => element(ctx.doc, '<li role="option"><button type="button" class="hc-choice" data-hs-act="cfg" data-x="pick" data-id="' + esc(c[0]) + '">'
      + (c[2] ? '<span class="hh-icon is-glyph">' + glyphSvg(ctx.glyphs, c[2]) + '</span>' : itemIconHtml(ctx.glyphs, c[0])) + '<span class="hc-choice-name">' + esc(c[1]) + '</span><small class="hc-choice-note"></small></button></li>'),
    patch: (li, c) => {
      attr(li, 'aria-selected', String(c[0] === d.action.id)); cls(li, 'is-on', c[0] === d.action.id); prop(li.firstElementChild, 'disabled', off);
      const a = { type: d.action.type, id: c[0] }, st = storeOf(a), n = carried(a, bag);
      text(li.querySelector('.hc-choice-note'), [n ? '×' + n : '', st && st.price !== null ? (st.from ? 'store from ' : 'store ') + st.price + ' g each' : st ? 'store' : ''].filter(Boolean).join(' · '));
    },
  });
  text(root.querySelector('.hc-name'), d.action.id ? (d.action.type === 'ability' ? abilityName(d.action.id) : (choices.find((c) => c[0] === d.action.id) || [0, itemName(d.action.id)])[1]) : 'Choose one from the list');
  rows(root.querySelector('.hc-facts'), d.action.id ? factsOf(d.action, set, bag) : [], {
    key: (f) => f, build: () => element(ctx.doc, '<li></li>'), patch: (li, f) => text(li, f),
  });
  const n = d.conditions.length;
  const dflt = d.action.id ? defaultConditions(d, { foodBelowPct: set.foodPct, drinkBelowPct: set.drinkPct }) : [];
  text(root.querySelector('.hc-rule'), n ? (n > 1 ? (d.join === 'or' ? 'Fires when any one of these passes.' : 'Fires when all of these pass.') : 'Fires when this passes.')
    : 'No conditions: ' + (dflt.length ? 'it fires when ' + dflt.map(conditionWords).join(' and ') + '.' : 'it fires whenever it is ready.'));
  cls(root.querySelector('.hc-join'), 'is-on', n > 1);
  prop(root.querySelector('[data-f="join"]'), 'value', d.join);
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
  const repaint = () => { ctx.refresh('configure-action'); ctx.refresh('hunt-settings'); };
  const done = () => ctx.wm.close('configure-action');
  const d = s.draft;
  const c = d.conditions[Number(t.getAttribute('data-i'))];
  if (action === 'cfg' && ev.type === 'click') {
    const x = t.getAttribute('data-x');
    if (x === 'type' && d.action.type !== t.getAttribute('data-type')) {
      const type = t.getAttribute('data-type');
      const first = choicesOf(type, (settingsOf(cs) || {}).role)[0];
      d.action = { type, id: first ? first[0] : '' };
    } else if (x === 'pick') d.action.id = t.getAttribute('data-id');
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
  if (f === 'join') d.join = t.value === 'or' ? 'or' : 'and';
  else if (c && f === 'metric') { const n = conditionFor(t.value); if (n) d.conditions[Number(t.getAttribute('data-i'))] = n; }
  else if (c && f === 'op') c.op = t.value;
  else if (c && f === 'subject') c.subject = t.value;
  else if (c && f === 'value') c.value = Math.round(Number(t.value)) || 0;
  else if (c && f === 'effect') c.value = t.value;
  repaint();
};
