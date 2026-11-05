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
import { METRICS, OPERATORS } from '../data/condition-metrics.js?v=0.2.96';
import { STATUSES } from '../data/statuses.js?v=0.2.96';
import { BAR_SLOTS, BAR_ANSWER_MS } from '../data/hunt-hud.js?v=0.2.96';
import { BASIC_INDEX } from '../data/supply-basics.js?v=0.2.96';
import { isRune } from '../data/supplies.js?v=0.2.96';
import { runeTierOf, versionLevel } from '../data/runes.js?v=0.2.96';
import { ITEMS } from '../data/items.js?v=0.2.96';
import { suggestedConditions, aimsAtMonsters } from '../core/hunt/conditions.js?v=0.2.96';
import { settingsOf, wireSlot } from '../session/hunt-sections.js?v=0.2.96';
import { ABILITIES, abilitySkill, versionOf, outputPm } from '../data/abilities.js?v=0.2.96';
import { refusalWords } from './intent-words.js?v=0.2.96';
import { skillName } from './widgets/bits.js?v=0.2.96';

export const SLOTS = BAR_SLOTS.rows * BAR_SLOTS.cols;
const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const SCRATCH = new WeakMap();   // CharacterSession -> { open: index|null, draft, error, pending, msg }

/** A move the worn weapon (`discipline`, the server's hunt_settings) can't use: the engine drops it (conditions.js heroSlots), so it never fires and spends nothing. */
export function moveOffWeapon(discipline, abilityId) {
  const r = ABILITIES[abilityId];
  return !!r && !!discipline && !r.universal && !r.disciplines.includes(discipline);
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
  s.draft = cur ? Object.assign(JSON.parse(JSON.stringify(cur)), { join: 'and' }) : { action: { type: 'consume', id: null }, conditions: [], join: 'and' };
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
 * A NEW slot's starting conditions, written on it where the player sees and edits them
 * (Tyler 10-19: the Eat at / Drink at settings are gone; 10-23: nothing hidden stands
 * behind a slot): food under 50% HP, a drink under 30% mana (CONSUMABLE_RULES), an
 * ability its own trigger (a heal under its threshold, an area at two monsters), the
 * engine's one rule (src/core/hunt/conditions.js suggestedConditions). Ammo starts with none.
 */
export function startConditions(a) {
  return suggestedConditions(a);
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
 * THE STORE BEHIND A SLOT (Tyler 2026-10-21, designer-confirmed: a slot names ONE
 * item, with no hidden fallback). `rows` are the SERVER's store rows
 * (settingsOf(cs).store, hr_hunt_basic_supplies at its price), never a client
 * copy: with no rows read yet the answer is null. What one use buys:
 *   a store food or drink   that row, per use (it is the slot's item)
 *   a crafted food or drink nothing: own stock only (null)
 *   an ammo line            an arrow's plain partner once yours are gone; the loaded ammo, the partner of
 *                           `worn` (what is in the ammo slot: the free rung has none, nor does an empty slot);
 *                           a rune nothing (its store row feeds spells only: supplies.js isRune)
 *   a rune spell            the store rune the slot names; with none, carried runes only
 * { id, name, price, amount } or null.
 */
export function storeOf(a, rows, worn) {
  if (!a || !a.id || !Array.isArray(rows)) return null;
  const row = (b) => ({ id: b.id, name: storeName(b.id), price: b.price, amount: b.amount });
  if (a.type === 'consume') { const b = rows.find((r) => r.id === a.id); return b ? row(b) : null; }
  if (a.type === 'ability') {
    const b = a.store ? rows.find((r) => r.id === a.store) : null;
    return b ? row(b) : null;
  }
  const id = a.type === 'attack_with_item' && a.id === 'loaded' ? worn : a.id;
  if (!id || (a.type === 'attack_with_item' && isRune(ITEMS[id]))) return null;
  const b = rows.find((r) => r.partner === id);
  return b ? row(b) : null;
}

/* A store row's name (a label only: every number is the server's row). */
export function storeName(id) {
  return BASIC_INDEX[id] ? BASIC_INDEX[id].n : String(id).replace(/_/g, ' ');
}

/**
 * A RUNE SPELL'S STORE CHOICE (designer 2026-11-05: every default rune slot starts with its store rune on, shown, and the player can change it; the rune ladder, Tyler
 * 2026-11-05): "Carried runes only" (`id` null), then every store row of the spell's family, Plain first, at the
 * server's price a cast. Each row is what the player compares: `mana` a cast, `times` the power against Plain's
 * at the hero's own level (`skills`, the server's; null until it has said), `needs` the level its version takes and
 * `short` when the hero is under it (the engine's rule, abilities.js runeFor: it waits, it never casts a cheaper one).
 * [] for every other action (a food or drink slot names its one item).
 */
export function storeChoices(a, rows, skills) {
  if (!a || !Array.isArray(rows)) return [];
  const spell = a.type === 'ability' ? ABILITIES[a.id] : null;
  const family = spell && spell.rune && ITEMS[spell.rune] ? ITEMS[spell.rune].family : null;
  if (!family) return [];
  const skill = abilitySkill(spell);
  const have = skills && skills[skill] && Number.isInteger(skills[skill].level) ? skills[skill].level : null;
  const list = rows.filter((r) => ITEMS[r.partner] && ITEMS[r.partner].family === family && runeTierOf(ITEMS[r.partner]))
    .map((r) => {
      const tier = runeTierOf(ITEMS[r.partner]);
      return { id: r.id, name: storeName(r.id), price: r.price, tier, mana: versionOf(spell, tier).mana,
        times: have === null ? null : outputPm(spell, tier, have) / outputPm(spell, 1, have),
        needs: skillName(skill) + ' ' + versionLevel(tier), short: have !== null && have < versionLevel(tier) };
    }).sort((x, y) => x.tier - y.tier);
  return list.length ? [{ id: null, name: 'Carried runes only', price: null, tier: 0, mana: 0, times: null, needs: '', short: false }].concat(list) : [];
}

/** A rune choice in words: "Plain Scored Fire Rune · 8 g a cast · 30 mana · 1.6x the power", or what it waits for. */
export function storeChoiceWords(c) {
  if (c.price === null) return c.name;
  const power = c.tier > 1 && c.times !== null ? ' · ' + (Math.round(c.times * 10) / 10) + 'x the power' : '';
  return c.name + ' · ' + c.price + ' g a cast · ' + c.mana + ' mana' + (c.short ? ' · needs ' + c.needs : power);
}

/** The store choice a freshly picked rune spell starts with: Plain, its family's cheapest row (shown, changeable), else
    none. Never a deeper tier: that is the player's own pick (Tyler 2026-10-21, the game never decides which supply is best). */
export function storeDefault(a, rows) {
  const c = storeChoices(a, rows);
  return c.length > 1 ? c[1].id : null;
}

/** The store line in words: "then the store's, from 14 g each, paid as used". */
export function storeWords(st) {
  return st ? 'then the store’s ' + st.name + ', ' + st.price + ' g each, paid as used' : '';
}

function valueWords(c, m) {
  if (m.value === 'pct') return c.value + '%';
  if (m.value === 'effect') return (STATUSES[c.value] && STATUSES[c.value].name) || String(c.value);
  return String(c.value);
}

/* Whose effect, as the subject of a sentence (an effect test reads "my target lacks Burn", "I have Shielded"). */
const EFFECT_WHO = Object.freeze({ target: 'my target', self: 'I', ally: 'the ally I would heal' });

/** One condition as a plain sentence, in the words Configure action uses (the registry's `say`): "my HP is at or
    below 50%", "the HP of the lowest ally is below 60%", "the number of allies under half health is above 1". Never
    the picker's labels ("My HP % below 50%" read like a form field on every slot's tooltip, core-loop play 2026-10-30). */
export function conditionWords(c) {
  const m = METRIC.get(c.metric);
  if (!m) return c.metric;
  const op = OPERATORS[c.op] ? OPERATORS[c.op].say : c.op;
  if (m.value === 'bool') {
    const what = m.label.charAt(0).toLowerCase() + m.label.slice(1);
    return (c.op === 'eq') === (c.value === true) ? what : what.replace(' is ', ' is not ');
  }
  if (m.value === 'effect') {
    const who = EFFECT_WHO[c.subject] || EFFECT_WHO.target;
    const verb = who === 'I' ? (c.op === 'has_effect' ? 'have' : 'lack') : op;
    return who + ' ' + verb + ' ' + valueWords(c, m);
  }
  const whose = c.subject && m.subject ? ' ' + (m.subject[c.subject] || c.subject) : '';
  /* a count of things reads as "the number of ..." (allies, monsters); a count left in the bag already says "what" */
  const what = m.value === 'count' && !/^what /.test(m.say) ? 'the number of ' + m.say.replace(/^the /, '') : m.say;
  return what + whose + ' ' + op + ' ' + valueWords(c, m);
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
  else { s.error = r; s.msg = refusalWords(r.error); }
  repaint();
  return r;
}

/**
 * THE SLOT AS SAVED: the draft, without an ignore list when its action never aims at a monster (a food, a drink,
 * a heal or a shield: conditions.js aimsAtMonsters, Coordinator 2026-10-23). Such a slot never reads one, so the
 * window hides the choice and a list carried over from an attack slot is dropped rather than kept unseen.
 */
export function slotForSave(d) {
  if (!d || !Array.isArray(d.ignore) || aimsAtMonsters(d)) return d;
  const out = Object.assign({}, d);
  delete out.ignore;
  return out;
}

/** Save the open slot's draft into the server's bar (one intent); the slot closes on ok. */
export function saveOpen(cs, repaint, onOk) {
  const s = draftOf(cs);
  const bar = serverBar(cs);
  if (!bar || s.open === null || !s.draft) return;
  bar[s.open] = slotForSave(s.draft);
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
