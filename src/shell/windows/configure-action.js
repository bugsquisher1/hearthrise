// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/configure-action.js — "CONFIGURE ACTION": ONE BAR SLOT AS ONE SENTENCE.
//
// Tyler 2026-10-18 (the flow) and 2026-10-21 (a slot names ONE item; the game never
// picks one), built to the art direction spec of 2026-10-21 (Charcoal & Gold):
//   top       "Slot 3 · tried after slot 2", the Spells | Food & drink | Ammo tabs (a rune spell is a spell, Tyler
//             2026-11-08), Earlier / Later
//   sentence  the slot read as one editable sentence: "Eat [Salted Trout] when [my HP]
//             [is at or below] [−45+]%", then "and …" for each further condition (all
//             must match), "+ Add a condition", and the heal warning under it (the
//             hunt's hardest blow, pull-cycle.js biggestBlowOn, against the server's max HP); while
//             the hero hunts, the slot's supply waiting in the bag and "Carry 40 into this hunt"
//             (carry-in.js, Tyler 2026-11-02)
//   table     the tab's items in runs (Food and Drink; Ammo on its own tab), each row its numbers from the
//             SERVER's rows (hunt_settings.store), sorted cheapest per point
//             (action-table.js tableOf); the picked row gold and pinned at the top
//   detail    the hovered or focused row against the pick (signed differences, the
//             waste at the slot's own threshold), where its uses come from, food's rule;
//             a rune spell's supply (configure-runes.js, Tyler 2026-11-08): which carried runes it spends, then
//             what it does when they run out, buy from the rune shop or leave the hunt
//   foot      the status line (pending, the server's refusal in words), Empty slot,
//             Cancel, Save
// Nothing applies until Save; Save, Empty slot and a move each send ONE intent
// (bar-draft.js), every control stays off until the server has answered, and a refusal
// keeps the draft and outlines its condition. On a phone (922×423) it is a full sheet.
// ════════════════════════════════════════════════════════════════════════
import { METRICS, MAX_CONDITIONS } from '../../data/condition-metrics.js?v=0.2.112';
import { STATUSES } from '../../data/statuses.js?v=0.2.112';
import { settingsOf, huntOf, partyOf } from '../../session/hunt-sections.js?v=0.2.112';
import { vitalsOf } from '../../session/party-sections.js?v=0.2.112';
import { biggestBlowOn } from '../../core/hunt/pull-cycle.js?v=0.2.112';
import { carriedOf, skillsOf, equipmentOf } from '../../session/item-sections.js?v=0.2.112';
import { rows, text, attr, prop, cls, element } from '../../render/paint.js?v=0.2.112';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.112';
import { actionIconHtml, itemName } from '../widgets/bits.js?v=0.2.112';
import { SLOTS, draftOf, openSlot, closeSlot, conditionFor, blankCondition, saveOpen, emptyOpen, moveSlot, startConditions, serverBar, opWords, unitWords } from '../bar-draft.js?v=0.2.112';
import { startSupply } from '../rune-supply.js?v=0.2.112';
import { runesHtml, patchRunes, runesEdit } from './configure-runes.js?v=0.2.112';
import { TABS, tabOf, factsOf, carried, healWarning, weaponWarning, sharedCooldownOf } from '../action-facts.js?v=0.2.112';
import { whyFacts, slotWhy, setupNote } from '../slot-waits.js?v=0.2.112';
import { glyphSvg } from '../launcher.js?v=0.2.112';
import { tableOf, rowIn, cellsOf, sentenceOf, compareLines, wasteLine, effectLine } from '../action-table.js?v=0.2.112';
import { carryFor, carryWords, askCarry } from '../carry-in.js?v=0.2.112';
import { whole } from '../../render/format.js?v=0.2.112';

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

/* One condition line, read as the sentence the slot's summary repeats word for word (bar-draft.js conditionWords; Tyler
   2026-11-08, "at or above 2 what?"): "when|and [metric] [whose] [comparison] [− value +] [noun] [whose, read after] [effect] ×",
   so "when [my HP] [is at most] [− 50% +]", "when [it would hit] [at least] [− 2 +] monsters". */
function condHtml(i) {
  const b = (x, label, body) => '<button type="button" class="hh-seg ca-step" data-hs-act="cfg" data-x="' + x + '" data-i="' + i + '" aria-label="' + label + '">' + body + '</button>';
  const whose = (cls) => '<select class="ca-token ' + cls + '" data-hs-act="cfg-f" data-f="subject" data-i="' + i + '" aria-label="Whose"></select>';
  return '<li class="ca-cond" data-cond="' + i + '"><span class="ca-glue">' + (i ? 'and' : 'when') + '</span> '
    + '<select class="ca-token" data-hs-act="cfg-f" data-f="metric" data-i="' + i + '" aria-label="Test ' + (i + 1) + '">' + options(METRICS.map((m) => [m.id, m.say])) + '</select>'
    + whose('ca-whose')
    + '<select class="ca-token" data-hs-act="cfg-f" data-f="op" data-i="' + i + '" aria-label="Comparison"></select>'
    + '<span class="ca-num">' + b('dec', 'Lower', '−')
    + '<input class="ca-token ca-val" type="number" inputmode="numeric" data-hs-act="cfg-f" data-f="value" data-i="' + i + '" aria-label="Value"><span class="ca-unit"></span>'
    + b('inc', 'Higher', '+') + '</span><span class="ca-unit ca-noun" hidden></span>' + whose('ca-whose-after')
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
    /* CARRY IN (src/shell/carry-in.js): while this hero hunts, the slot's own supply waiting in the bag, and the press. */
    + '<p class="ca-carry" hidden><span class="ca-carry-t"></span> ' + tool('carry', '') + '</p>'
    + tool('add', '+ Add a condition', ' ca-add')
    + '<p class="ca-warn" role="note"></p></div>'
    + '<div class="ca-pick">'
    + '<div class="ca-well"><div class="ca-pinned" aria-hidden="true"></div><div class="ca-runs" role="listbox" aria-label="Choose what this slot does"></div><p class="ca-empty"></p></div>'
    + '<div class="ca-detail" aria-live="polite">'
    + '<div class="ca-d-head"><span class="ca-d-icon"></span><b class="ca-d-name"></b></div>'
    + '<p class="ca-vs"></p><ul class="ca-cmp"></ul><p class="ca-waste"></p>'
    + '<p class="ca-src"></p><p class="ca-eff"></p><p class="ca-req"></p><p class="ca-d-warn"></p>'
    + runesHtml()
    + '<div class="ca-move-phone">' + tool('up', 'Earlier') + tool('down', 'Later') + '</div>'
    + '</div></div></div>'
    + '<p class="hh-intent-msg ca-msg" role="status" aria-live="polite"></p>'
    + '<div class="hc-foot ca-foot"><p class="ca-self hw-phone-only">Your hero uses this by itself. Here you choose when.</p>' + tool('clear', 'Empty slot') + tool('cancel', 'Cancel') + tool('save', 'Save', ' is-primary') + '</div>'
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
  /* whose: before the comparison ("the HP of [the lowest ally]"), or after the number as its unit ("2 heroes under [half health]") */
  for (const [sel, here] of [['.ca-whose', !!m.subject && !m.subjectAfter], ['.ca-whose-after', !!m.subject && !!m.subjectAfter]]) {
    const subj = row.querySelector(sel);
    fill(subj, here ? Object.entries(m.subject) : []);
    cls(subj, 'is-on', here);
    if (here) prop(subj, 'value', c.subject || Object.keys(m.subject)[0]);
  }
  const op = row.querySelector('[data-f="op"]');
  fill(op, m.ops.map((o) => [o, opWords(o, m)]));
  prop(op, 'value', c.op);
  /* a yes/no test has one comparison, already in its words ("when my target is a boss") */
  prop(op, 'hidden', m.value === 'bool');
  const numeric = m.value === 'pct' || m.value === 'count';
  cls(row.querySelector('.ca-num'), 'is-on', numeric);
  const num = row.querySelector('[data-f="value"]');
  if (m.range) { attr(num, 'min', m.range[0]); attr(num, 'max', m.range[1]); }
  if (numeric && doc.activeElement !== num) prop(num, 'value', String(c.value));
  /* the unit, from the registry: a percent's % inside the number box, a count's noun after it */
  text(row.querySelector('.ca-num .ca-unit'), m.value === 'pct' ? unitWords(m, c.value) : '');
  const noun = m.value === 'count' ? unitWords(m, c.value).trim() : '';
  text(row.querySelector('.ca-noun'), noun);
  prop(row.querySelector('.ca-noun'), 'hidden', !noun);
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
  cls(el, 'is-mana', r.kind === 'drink' || r.kind === 'spells');
  cls(el, 'is-locked', !!r.locked);
  attr(el, 'title', r.locked ? (r.lockWhy || (r.kind === 'ammo' ? 'Your weapon can’t shoot this' : 'Your weapon can’t cast this')) : '');
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
  /* What a use costs and lands is this hero's (cast-facts.js): its bag, the server's store rows, its skills, its supply setting, its worn ammo. */
  const facts = { bag, store: set.store, skills: skillsOf(cs), set, worn: /** @type {{ ammo?: string }} */ (equipmentOf(cs) || {}).ammo };
  const table = tableOf(tab, { discipline: set.discipline, role: set.role, bag, store: set.store, skills: facts.skills, set, picked: d.action });
  const picked = rowIn(table, d.action);
  /* THE TOP LINE */
  text(root.querySelector('.ca-rank'), 'Slot ' + (s.open + 1) + (s.open === 0 ? ' · tried first' : ' · tried after slot ' + s.open));
  /* Why this slot's action will not fire, as the bar's tooltip says it: a phone has no hover and a press on a slot opens
     this window, so the words are here, first (shown on a phone only, hunt.css). */
  const saved = set.slots[s.open];
  const fireWhy = saved && !saved.empty ? slotWhy(saved, whyFacts(cs)) : null;
  text(root.querySelector('.ca-why'), fireWhy ? fireWhy.text : '');
  /* CARRY IN: the most of this action's supply the bag holds while the hunt runs (every tier of a rune spell's family). */
  const carry = d.action.id ? (carryFor(cs, d.action) || [])[0] || null : null;
  const cl = root.querySelector('.ca-carry');
  prop(cl, 'hidden', !carry);
  if (carry) {
    text(cl.querySelector('.ca-carry-t'), whole(carry.have) + ' ' + itemName(carry.id) + ' in your backpack, ' + whole(carry.inHunt) + ' in this hunt.' + (carry.wait ? ' ' + carry.wait : ''));
    const b = cl.querySelector('[data-x="carry"]');
    text(b, carryWords(carry));
    attr(b, 'data-item', carry.id);
  }
  for (const b of root.querySelectorAll('.ca-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === tab));
  /* THE SENTENCE */
  const say = sentenceOf(d.action);
  const lead = root.querySelector('.ca-lead');
  cls(lead, 'is-blank', !d.action.id);
  text(root.querySelector('.ca-verb'), d.action.id ? say.verb : 'Choose what this slot does.');
  text(root.querySelector('.ca-item'), say.item);
  text(root.querySelector('.ca-note'), say.note ? ' ' + say.note : '');
  text(root.querySelector('.ca-ready'), d.action.id && !d.conditions.length ? ' whenever it is ready.' : '');
  root.querySelectorAll('.ca-cond').forEach((row, i) => patchCond(row, d.conditions[i], i, s, ctx.doc));
  text(root.querySelector('.ca-weapon'), weaponWarning(d.action, set.discipline, set.role, skillsOf(cs)));
  /* The heal warning: the hero's hunt (running, else the last one), its biggest blow for any party size (2026-11-08), the server's max HP. */
  const h = huntOf(cs), p = partyOf(cs);
  const blow = h && h.huntId ? biggestBlowOn(h.huntId) : null;
  /* ...and what the slot's conditions will mean in a fight (slot-waits.js): a player setting it up reads it here, in town too. */
  /* (and the earlier slot it shares a cooldown with: the bar's hover no longer says it, Tyler 2026-11-08) */
  const wires = serverBar(cs);
  if (wires) wires[s.open] = d.action.id ? d : null;
  const warn = [healWarning(d, set, blow, vitalsOf(cs).hpMax), setupNote(d, p ? p.members.length : 1), wires ? sharedCooldownOf(wires, s.open) : null].filter(Boolean).join(' ');
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
  /* The facts the bar's hover shows a subset of (action-facts.js factsOf): the cost line, then what it does, for THIS hero.
     The pick is the draft's own action (its rune supply); another rune spell's row is what a pick starts with (startSupply). */
  const named = shown && picked && keyOf(shown.action) === keyOf(picked.action) ? d.action : shown ? startSupply(shown.action, set.store) : null;
  const f = named ? factsOf(named, facts) : null;
  text(root.querySelector('.ca-src'), f && f.cost ? f.cost : '');
  text(root.querySelector('.ca-eff'), f && named.type === 'ability' ? [f.type].concat(f.effect).filter(Boolean).join(' ') : effectLine(shown));
  /* The spell card's requirement, and an alone spell's callout beside it (Tyler 2026-11-09: "Make that callout clear to the player"). */
  text(root.querySelector('.ca-req'), f && f.requires ? f.requires + (f.alone ? ' ' + f.alone : '') : '');
  /* A rune spell's supply (configure-runes.js): the carried runes it may spend, then the rune shop or leaving the hunt. */
  patchRunes(root, d, { doc: ctx.doc, bag, store: set.store, skills: facts.skills, off });
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
    /* A pick grows the sentence above the list, so the list moves under a pointer that has not: the browser's mouseover then names
       a row nobody aimed at, and Details describes it (pick Mend, read Power Strike: art audit 2026-11-04). A row counts from the pointer's next move. */
    if (ev.type === 'mouseover' && v.pickedAt && v.pickedAt.x === ev.clientX && v.pickedAt.y === ev.clientY) return false;
    v.pickedAt = null;
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
      /* a rune spell starts with every rune of its family ticked and the rune shop's Plain on empty (rune-supply.js startSupply) */
      d.action = startSupply({ type: t.getAttribute('data-type'), id: t.getAttribute('data-id') }, (settingsOf(cs) || {}).store);
      v.hover = null;
      v.pickedAt = { x: ev.clientX, y: ev.clientY };
      LAST_TAB.set(cs, tabOf(d.action));
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
    else if (x === 'store') d.action = runesEdit(d, t, (settingsOf(cs) || {}).store) || d.action;
    else if (x === 'add' && d.conditions.length < MAX_CONDITIONS) d.conditions.push(blankCondition());
    else if (x === 'drop' && c) d.conditions.splice(Number(t.getAttribute('data-i')), 1);
    else if ((x === 'inc' || x === 'dec') && c) nudge(c, x === 'inc' ? 1 : -1);
    else if (x === 'up' || x === 'down') { moveSlot(cs, s.open, x === 'up' ? -1 : 1, repaint); return; }
    else if (x === 'carry') {
      const row = (carryFor(cs, d.action) || []).find((r) => r.id === t.getAttribute('data-item'));
      const at = t.getBoundingClientRect();
      if (row) askCarry(ctx, body, s, repaint, row, { x: at.left, y: at.bottom });
      return;
    }
    else if (x === 'save') { saveOpen(cs, repaint, done); return; }
    else if (x === 'clear') { emptyOpen(cs, repaint, done); return; }
    else if (x === 'cancel') { closeSlot(cs); done(); return; }
    repaint();
    return;
  }
  if (action !== 'cfg-f' || ev.type !== 'change') return;
  const f = t.getAttribute('data-f');
  if (f === 'rn-own' || f === 'rn-tick' || f === 'rn-empty') { d.action = runesEdit(d, t, (settingsOf(cs) || {}).store) || d.action; repaint(); return; }
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
