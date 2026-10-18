// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/death-explain.js — WHY A HERO FELL, IN PLAIN WORDS (QoL 8).
//
// PURE. From the last EXPLAIN_WINDOW_MS of the server's event timeline
// (src/core/hunt/events.js: dmg, heal, eat, drink, slot_dry, fall, wipe) it
// answers the player's question "what just happened?":
//
//   "Knight fell: 3 Rat King hits (42, 38, 51), no heal for 6 s, Druid at
//    4 mana; heal rule 'Knight below 50%' was waiting for mana."
//
// It READS events, it authors nothing: every number is one the server sent,
// and an event with the same id counts once (the recorder de-duplicates).
//
// Events arrive as the timeline delivers them, each stamped by the recorder
// with the names resolved AT THE TIME (`an` attacker, `tn` target), because
// the pose forgets a unit once it is gone:
//   { id|key, type, atMs, u, t, amount, ability, element, item, monster, ... }
//
// RULES (the action engine's lane adds these; this degrades without them):
// an event may carry `rule` (the rule's id, optionally `rule_label`) when a
// rule fired it, and a `rule_wait` event
//   { type: 'rule_wait', u, rule, rule_label?, why: 'mana'|'supplies'|'cooldown'|<text> }
// says a rule's action was ready to run but a condition kept it waiting.
// Without either, the explanation names damage, healing gaps and supplies
// only. Nothing is guessed.
// ════════════════════════════════════════════════════════════════════════

export const EXPLAIN_WINDOW_MS = 10000;
const MAX_HITS_LISTED = 4;
const MAX_GROUPS = 3;
const LOW_MANA = 0.15;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const secs = (ms) => Math.max(1, Math.round(ms / 1000));
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const spell = (id) => String(id).replace(/_/g, ' ');

const WHY_WORDS = Object.freeze({
  mana: 'mana', supplies: 'supplies', cooldown: 'its cooldown', range: 'range', target: 'a target',
});
const whyWords = (why) => (typeof why === 'string' && why ? (WHY_WORDS[why] || spell(why).slice(0, 40)) : null);

const ruleName = (ev) => (typeof ev.rule_label === 'string' && ev.rule_label ? ev.rule_label.slice(0, 48) : String(ev.rule).slice(0, 48));

/** The tail of an ability name / element for a damage line; '' when the event names neither. */
const kindOf = (ev) => (typeof ev.element === 'string' && ev.element ? spell(ev.element) : 'physical');

/**
 * Explain ONE fall.
 * @param {object[]} events   the retained events, any order, ids unique
 * @param {object} fall       the `fall` event
 * @param {{name: string, vitals?: {mana?: number, manaMax?: number}, others?: {name: string, mana: number, manaMax: number}[]}} who
 * @returns {{unit: number, name: string, atMs: number, headline: string, lines: string[], damageByType: {type: string, total: number}[], hits: number, killingBlow: object|null}}
 */
function explainFall(events, fall, who) {
  const v = fall.u;
  const to = fall.atMs, from = to - EXPLAIN_WINDOW_MS;
  const inWin = events.filter((e) => Number.isInteger(e.atMs) && e.atMs >= from && e.atMs <= to).sort((a, b) => a.atMs - b.atMs);
  const hits = inWin.filter((e) => e.type === 'dmg' && e.t === v && num(e.amount) !== null);
  const heals = inWin.filter((e) => e.type === 'heal' && e.t === v);
  const ate = inWin.filter((e) => (e.type === 'eat' || e.type === 'drink') && e.u === v);
  const dry = inWin.filter((e) => e.type === 'slot_dry' && (e.u === undefined || e.u === v));
  const waits = inWin.filter((e) => e.type === 'rule_wait' && (e.u === v || e.t === v || (e.u === undefined && e.t === undefined)) && typeof e.rule === 'string');
  const fired = inWin.filter((e) => typeof e.rule === 'string' && e.type !== 'rule_wait' && e.u === v);

  const parts = [];
  const groups = new Map();
  for (const h of hits) {
    const k = h.an || 'Something';
    if (!groups.has(k)) groups.set(k, { who: k, amounts: [], total: 0 });
    const g = groups.get(k);
    g.amounts.push(h.amount);
    g.total += h.amount;
  }
  const ordered = Array.from(groups.values()).sort((a, b) => b.total - a.total).slice(0, MAX_GROUPS);
  for (const g of ordered) {
    const shown = g.amounts.slice(-MAX_HITS_LISTED);
    parts.push(plural(g.amounts.length, g.who + ' hit', g.who + ' hits') + ' (' + shown.join(', ') + (g.amounts.length > shown.length ? ', …' : '') + ')');
  }
  if (!hits.length) parts.push('no damage was seen in the last ' + secs(EXPLAIN_WINDOW_MS) + ' s');

  const lastHeal = heals.length ? heals[heals.length - 1].atMs : null;
  if (lastHeal === null) parts.push('no heal in the last ' + secs(EXPLAIN_WINDOW_MS) + ' s');
  else if (to - lastHeal >= 3000) parts.push('no heal for ' + secs(to - lastHeal) + ' s');
  if (dry.length) parts.push('ran out of ' + dry.map((d) => spell(d.item)).filter((x, i, a) => a.indexOf(x) === i).join(' and '));
  else if (!ate.length && lastHeal === null) parts.push('nothing eaten or drunk');

  const low = [];
  const vit = who.vitals;
  if (vit && num(vit.mana) !== null && num(vit.manaMax) > 0 && vit.mana / vit.manaMax <= LOW_MANA) low.push(who.name + ' at ' + Math.round(vit.mana) + ' mana');
  for (const o of who.others || []) if (num(o.mana) !== null && num(o.manaMax) > 0 && o.mana / o.manaMax <= LOW_MANA) low.push(o.name + ' at ' + Math.round(o.mana) + ' mana');
  parts.push(...low);

  const rules = [];
  const seenRule = new Set();
  for (const w of waits) {
    if (seenRule.has(w.rule)) continue;
    seenRule.add(w.rule);
    const why = whyWords(w.why);
    rules.push("rule '" + ruleName(w) + "' was waiting" + (why ? ' for ' + why : ''));
  }
  const firedBy = new Map();
  for (const f of fired) firedBy.set(f.rule, (firedBy.get(f.rule) || { n: 0, label: ruleName(f) }));
  for (const f of fired) firedBy.get(f.rule).n++;
  for (const [id, r] of firedBy) if (!seenRule.has(id)) rules.push("rule '" + r.label + "' fired " + plural(r.n, 'time', 'times'));

  const last = hits.length ? hits[hits.length - 1] : null;
  const killingBlow = last ? { by: last.an || 'Something', amount: last.amount, ability: typeof last.ability === 'string' ? last.ability : null } : null;
  const killer = typeof fall.monster === 'string' ? spell(fall.monster) : null;

  const lines = [];
  lines.push(who.name + ' fell: ' + parts.join(', ') + (rules.length ? '; ' + rules.join('; ') : '') + '.');
  if (killingBlow) lines.push('The killing blow was ' + killingBlow.amount + ' from ' + killingBlow.by + '.');
  else if (killer) lines.push('The killing blow came from a ' + killer + '.');

  const byType = new Map();
  for (const h of hits) byType.set(kindOf(h), (byType.get(kindOf(h)) || 0) + h.amount);
  const damageByType = Array.from(byType, ([type, total]) => ({ type, total })).sort((a, b) => b.total - a.total);

  return { unit: v, name: who.name, atMs: to, headline: lines[0], lines, damageByType, hits: hits.length, killingBlow };
}

/**
 * Explain every fall in the retained events whose time is inside the last
 * `sinceMs` window (or all of them), oldest first; a `wipe` is the party
 * falling together, so a wipe reads as one lead line over each hero's story.
 * @param {object[]} events
 * @param {{whoOf: (unit: number, fall: object) => object, since?: number}} o
 * @returns {{kind: 'none'|'fall'|'wipe', wipe: boolean, falls: object[]}}
 */
export function explainDeaths(events, o) {
  const since = Number.isInteger(o.since) ? o.since : -Infinity;
  const falls = events.filter((e) => e.type === 'fall' && Number.isInteger(e.u) && e.atMs >= since).sort((a, b) => a.atMs - b.atMs);
  const wipe = events.some((e) => e.type === 'wipe' && e.atMs >= since);
  const out = falls.map((f) => explainFall(events, f, o.whoOf(f.u, f)));
  return { kind: wipe ? 'wipe' : out.length ? 'fall' : 'none', wipe, falls: out };
}
