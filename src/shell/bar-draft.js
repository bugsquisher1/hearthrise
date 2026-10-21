// ════════════════════════════════════════════════════════════════════════
// src/shell/bar-draft.js — ONE CHARACTER'S BAR EDIT: THE OPEN SLOT, ITS DRAFT, ONE INTENT.
//
// The bar is a priority list (src/data/condition-metrics.js): slot 1 is tried
// first, the next slot whose conditions pass is the fallback. The bar
// (widgets/action-bar.js: a press, a drag) and the Configure action window
// (windows/configure-action.js) share this state, so they never disagree.
// The draft is display scratch: nothing spends it and nothing else reads it.
// Save, Empty, a move and a drag each send ONE intent, the whole bar restated
// (hr_action_set_options { slots }); `pending` keeps the window's controls off
// until the server has answered and the re-read envelope has replaced
// hunt_settings (CLAUDE.md §6). A refusal names its slot and condition.
// ════════════════════════════════════════════════════════════════════════
import { METRICS, OPERATORS, MAX_CONDITIONS, CONSUME_KINDS } from '../data/condition-metrics.js?v=0.2.22';
import { STATUSES } from '../data/statuses.js?v=0.2.22';
import { BAR_SLOTS, BAR_ANSWER_MS } from '../data/hunt-hud.js?v=0.2.22';
import { BASIC_SUPPLIES } from '../data/supply-basics.js?v=0.2.22';
import { CONSUMABLES, CONSUMABLE_RULES } from '../data/consumables.js?v=0.2.22';
import { settingsOf, wireSlot } from '../session/hunt-sections.js?v=0.2.22';

export const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;
const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const SCRATCH = new WeakMap();   // CharacterSession -> { open: index|null, draft, error, pending, msg }

/* Plain words for the server's validation codes. */
const REFUSAL = Object.freeze({
  bad_option: 'The server does not take bar changes yet.',
  bad_condition: 'The server refused this condition.',
  bad_metric: 'The server does not know this test.',
  bad_op: 'That comparison does not fit this test.',
  bad_value: 'That value is out of range.',
  bad_action: 'This slot cannot do that action.',
  bad_subject: 'That choice does not fit this test.',
  bad_join: 'Choose all or any.',
  bad_slot: 'The server refused this slot.',
  too_many_slots: 'The bar is full.',
  too_many_conditions: 'A slot takes at most ' + MAX_CONDITIONS + ' conditions.',
  rate_limited: 'Too many changes at once. Try again in a moment.',
  settle_first: 'The hunt is catching up. Try again in a few seconds.',
  network: 'No connection. Nothing was changed.',
  timeout: 'The server has not answered. The bar shows what it last confirmed.',
  busy: 'Still saving the last change. Try again in a moment.',
  no_room: 'No empty slot after it to shift into.',
});

/** A refused bar intent in plain words. */
export function barRefusalWords(code) {
  return REFUSAL[code] || 'Not saved: the server refused it.';
}

/** This character's bar edit state (created empty on first use). */
export function draftOf(cs) {
  let s = SCRATCH.get(cs);
  if (!s) { s = { open: null, draft: null, error: null, pending: false, msg: '' }; SCRATCH.set(cs, s); }
  return s;
}

/** The server's bar in the wire shape, one entry per slot (null = empty). */
export function serverBar(cs) {
  const set = settingsOf(cs);
  return set ? Array.from({ length: SLOTS }, (_, i) => wireSlot(set.slots[i])) : null;
}

/** Open slot `i` for editing: the draft starts as the server's slot (or a blank one). */
export function openSlot(cs, i) {
  const s = draftOf(cs);
  const bar = serverBar(cs);
  s.open = Number.isInteger(i) && i >= 0 && i < SLOTS ? i : null;
  const cur = bar && s.open !== null ? bar[s.open] : null;
  s.draft = cur ? Object.assign(JSON.parse(JSON.stringify(cur)), { join: 'and' }) : { action: { type: 'consume', id: 'food' }, conditions: [], join: 'and' };
  s.error = null;
  s.msg = '';
}

/** Close the open slot and drop its draft. */
export function closeSlot(cs) {
  const s = draftOf(cs);
  s.open = null; s.draft = null; s.error = null; s.msg = '';
}

/* A number test starts at the middle of a percent (50) or the lowest count; a yes/no test at yes. */
const startValue = (m) => (m.value === 'pct' ? Math.round((m.range[0] + m.range[1]) / 2) : m.range ? m.range[0] : true);

/**
 * A new food or drink slot's starting condition (Tyler 10-19: the Eat at / Drink at
 * settings are gone; food and drink fire from their slot's condition, starting where
 * the hero's defaults stood: HP below 50%, mana below 30%, CONSUMABLE_RULES). Other
 * actions start with none.
 */
export function supplyDefault(a) {
  if (!a || a.type !== 'consume') return [];
  const kind = Object.prototype.hasOwnProperty.call(CONSUME_KINDS, a.id) ? a.id : CONSUMABLES[a.id] ? CONSUMABLES[a.id].kind : null;
  if (kind === 'food') return [{ metric: 'self_hp_pct', op: 'lt', value: CONSUMABLE_RULES.foodBelowPct }];
  if (kind === 'drink') return [{ metric: 'self_mana_pct', op: 'lt', value: CONSUMABLE_RULES.drinkBelowPct }];
  return [];
}

/** A fresh condition on the registry's first test. */
export function blankCondition() {
  const m = METRICS[0];
  return { metric: m.id, op: m.ops[0], value: startValue(m) };
}

/** A condition re-pointed at another test: that test's first comparison, first subject and lowest value. */
export function conditionFor(metric) {
  const m = METRIC.get(metric);
  if (!m) return null;
  const c = { metric: m.id, op: m.ops[0], value: m.value === 'effect' ? Object.keys(STATUSES)[0] : startValue(m) };
  if (m.subject) c.subject = Object.keys(m.subject)[0];
  return c;
}

/**
 * THE STORE BEHIND A SLOT (Tyler 10-18; src/core/action-rules.js "THE STORE"):
 * what the server buys per use, at its NPC price, when the slot's own stock is
 * gone and the supply setting allows it. "Any food" / "Any drink" fall back to
 * the hunting ground's tier row (the cheapest is the first grounds'; `from`
 * marks a price that rises with the tier); an ammo line falls back to its plain
 * partner; one named food or drink, a rune or an ability has no store behind it.
 * Prices are the catalogue rows the server's hr_hunt_basic_supplies is
 * generated from (tests/supplies-catalogue.mjs pins them equal).
 */
export function storeOf(a) {
  if (!a || !a.id) return null;
  if (a.type === 'consume' && Object.prototype.hasOwnProperty.call(CONSUME_KINDS, a.id)) {
    const rows = BASIC_SUPPLIES.filter((b) => b.kind === CONSUME_KINDS[a.id]);
    const low = rows.reduce((m, b) => (!m || b.price < m.price ? b : m), null);
    return low ? { name: a.id, price: low.price, from: rows.length > 1 } : null;
  }
  if (a.type === 'attack_with_item') {
    if (a.id === 'loaded') return { name: 'the matching plain ammo', price: null, from: false };
    const b = BASIC_SUPPLIES.find((r) => r.kind === 'ammo' && r.partner === a.id);
    return b ? { name: b.n, price: b.price, from: false } : null;
  }
  return null;
}

/** The store line in words: "then the store's, from 14 g each, paid as used". */
export function storeWords(st) {
  if (!st) return '';
  return st.price === null ? 'then the store’s ' + st.name + ', paid as used'
    : 'then the store’s ' + st.name + ', ' + (st.from ? 'from ' : '') + st.price + ' g each, paid as used';
}

function valueWords(c, m) {
  if (m.value === 'pct') return c.value + '%';
  if (m.value === 'effect') return (STATUSES[c.value] && STATUSES[c.value].name) || String(c.value);
  return String(c.value);
}

/** One condition in words: "My HP % at or below 50%". */
export function conditionWords(c) {
  const m = METRIC.get(c.metric);
  if (!m) return c.metric;
  const what = m.label + (c.subject && m.subject ? ' (' + (m.subject[c.subject] || c.subject) + ')' : '');
  if (m.value === 'bool') return what + ((c.op === 'eq') === (c.value === true) ? '' : ' is false');
  return what + ' ' + (OPERATORS[c.op] ? OPERATORS[c.op].label : c.op) + ' ' + valueWords(c, m);
}


/**
 * The server's answer to one intent, or { ok:false, error:'timeout' } once
 * BAR_ANSWER_MS has passed (a throw reads as 'network'). Never rejects, so a
 * status line and a pending flag always come back: on the answer, on a
 * refusal or on the timeout. A late answer is not shown here; its effect
 * arrives with the re-read envelope like any other (CLAUDE.md §6).
 */
export function answerWithin(send, ms = BAR_ANSWER_MS) {
  let timer = null;
  const late = new Promise((ok) => { timer = setTimeout(() => ok({ ok: false, error: 'timeout' }), ms); });
  const sent = Promise.resolve().then(send).then((r) => r || { ok: false, error: 'refused' }, () => ({ ok: false, error: 'network' }));
  return Promise.race([sent, late]).finally(() => clearTimeout(timer));
}

/**
 * Send the whole bar as ONE intent. Every control of both surfaces is off
 * until the server answers; on ok `onOk()` runs, on a refusal the error is
 * kept (its slot and condition are shown) with its words. `repaint` runs at
 * the start and the end.
 */
export async function sendBar(cs, bar, repaint, onOk) {
  const set = settingsOf(cs);
  const s = draftOf(cs);
  if (!set || s.pending) return { ok: false, error: 'busy' };
  s.pending = true; s.error = null; s.msg = 'Saving…';
  repaint();
  const r = await answerWithin(() => cs.setHuntOptions(set.preset, { slots: bar }));
  s.pending = false;
  if (r.ok) { s.msg = ''; if (onOk) onOk(); }
  else { s.error = r; s.msg = barRefusalWords(r.error); }
  repaint();
  return r;
}

/** Save the open slot's draft into the server's bar (one intent); the slot closes on ok. */
export function saveOpen(cs, repaint, onOk) {
  const s = draftOf(cs);
  const bar = serverBar(cs);
  if (!bar || s.open === null || !s.draft) return;
  bar[s.open] = s.draft;
  sendBar(cs, bar, repaint, () => { closeSlot(cs); if (onOk) onOk(); });
}

/** Empty the open slot on the server (one intent); the slot closes on ok. */
export function emptyOpen(cs, repaint, onOk) {
  const s = draftOf(cs);
  const bar = serverBar(cs);
  if (!bar || s.open === null) return;
  bar[s.open] = null;
  sendBar(cs, bar, repaint, () => { closeSlot(cs); if (onOk) onOk(); });
}

/* THE THREE DROPS (Tyler 10-19: a drag never moves anything it was not told to).
   Each is a pure plan over the server's bar, then ONE intent; nothing on screen
   moves until the re-read envelope says so. A plan is null when it cannot apply. */
const inRange = (i) => Number.isInteger(i) && i >= 0 && i < SLOTS;

/** Onto an EMPTY slot: the action moves there; its old slot empties. */
export function movePlan(bar, from, to) {
  if (!bar || !inRange(from) || !inRange(to) || from === to || !bar[from] || bar[to]) return null;
  const out = bar.slice();
  out[to] = out[from]; out[from] = null;
  return out;
}

/** Swap: the dragged action and the target change places; nothing else moves. */
export function swapPlan(bar, from, to) {
  if (!bar || !inRange(from) || !inRange(to) || from === to || !bar[from] || !bar[to]) return null;
  const out = bar.slice();
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

/**
 * Insert here: the dragged action takes the target slot; the target and the slots
 * after it shift one place later, up to the first empty slot (its old slot counts,
 * once emptied). With no empty slot after the target there is no room: null.
 */
export function insertPlan(bar, from, to) {
  if (!bar || !inRange(from) || !inRange(to) || from === to || !bar[from] || !bar[to]) return null;
  const out = bar.slice();
  const x = out[from];
  out[from] = null;
  let k = to;
  while (k < SLOTS && out[k]) k++;
  if (k >= SLOTS) return null;
  for (let j = k; j > to; j--) out[j] = out[j - 1];
  out[to] = x;
  return out;
}

/** Send a drop's plan (ONE intent); resolves to the server's answer, or { ok:false } when the plan cannot apply. */
export function sendPlan(cs, plan, repaint) {
  const bar = plan(serverBar(cs));
  if (!bar) return Promise.resolve({ ok: false, error: 'no_room' });
  return sendBar(cs, bar, repaint, () => closeSlot(cs));
}

/** Move slot `i` one place earlier (by -1) or later (+1) on the server; an open slot's draft follows it. */
export function moveSlot(cs, i, by, repaint) {
  const bar = serverBar(cs);
  const j = i + by;
  if (!bar || !(i >= 0 && i < SLOTS) || j < 0 || j >= SLOTS) return false;
  [bar[i], bar[j]] = [bar[j], bar[i]];
  const s = draftOf(cs);
  sendBar(cs, bar, repaint, () => { if (s.open === i) s.open = j; else if (s.open === j) s.open = i; });
  return true;
}
