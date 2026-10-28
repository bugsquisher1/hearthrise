// ════════════════════════════════════════════════════════════════════════
// src/session/tally-sections.js — TAMSIN'S TALLY AS THE SERVER SEES IT, READ SAFELY.
//
// PURE. Reads the `tally` section (supabase/migrations/2026-12-23-tally-tasks.sql,
// hr_tally_section) of the record a CharacterSession holds:
//   { held: [{ place, task, hunt, monster, kills, target, keep, done, done_at, wait }],
//     paid_today, per_day, held_max, weight, order: [slot…],
//     recent: [{ claim, at, task, gold, item, qty, pick }], day_ends_at }
// Every number is the server's: the kills (counted inside the hunt settle, never
// here), whether a task is done, how many she paid today and why one waits. The
// section is REPLACED by each envelope (CLAUDE.md §6): one parse per section object,
// nothing kept from an older one. Null = the server sent no tally yet, and every
// Tally control stays off (fail safe).
// ════════════════════════════════════════════════════════════════════════
import { tallyTask } from '../data/tally-tasks.js?v=0.2.61';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const WEIGHTS = new Set(['heavy', 'medium', 'light']);
const SEEN = new WeakMap();

function heldRow(r) {
  if (!isObj(r) || !ID.test(String(r.task)) || !ID.test(String(r.hunt)) || !ID.test(String(r.monster))) return null;
  const kills = count(r.kills), target = count(r.target), place = count(r.place);
  if (kills === null || target === null || target < 1 || place === null) return null;
  return Object.freeze({ place, task: r.task, hunt: r.hunt, monster: r.monster, kills: Math.min(kills, target), target,
    keep: r.keep === true, done: r.done === true, doneAt: typeof r.done_at === 'string' ? r.done_at : null,
    wait: r.wait === 'bag_full' ? 'bag_full' : null });
}

function paidRow(r) {
  if (!isObj(r) || typeof r.claim !== 'string' || !ID.test(String(r.task)) || !ID.test(String(r.item))) return null;
  const gold = count(r.gold), qty = count(r.qty);
  if (gold === null || qty === null) return null;
  return Object.freeze({ claim: r.claim, at: typeof r.at === 'string' ? r.at : null, task: r.task, gold, item: r.item, qty,
    pick: r.pick === 'piece' ? 'piece' : 'material' });
}

/**
 * `tally`: { held, paidToday, perDay, heldMax, weight, order, recent, dayEndsAt }, or null.
 * @param {object} cs  a CharacterSession (or anything with read(key))
 */
export function tallyOf(cs) {
  const raw = cs && typeof cs.read === 'function' ? cs.read('tally') : undefined;
  return parseTally(raw);
}

/** The same read over a raw section object (the board's answer carries one too). */
export function parseTally(raw) {
  if (!isObj(raw)) return null;
  const had = SEEN.get(raw);
  if (had) return had;
  const perDay = count(raw.per_day), heldMax = count(raw.held_max), paidToday = count(raw.paid_today);
  if (perDay === null || heldMax === null || paidToday === null) return null;
  const out = Object.freeze({
    held: Object.freeze((Array.isArray(raw.held) ? raw.held : []).map(heldRow).filter(Boolean).slice(0, heldMax)),
    paidToday, perDay, heldMax,
    weight: WEIGHTS.has(raw.weight) ? raw.weight : null,
    order: Object.freeze((Array.isArray(raw.order) ? raw.order : []).filter((s) => ID.test(String(s)))),
    recent: Object.freeze((Array.isArray(raw.recent) ? raw.recent : []).map(paidRow).filter(Boolean)),
    dayEndsAt: typeof raw.day_ends_at === 'string' ? raw.day_ends_at : null,
  });
  SEEN.set(raw, out);
  return out;
}

/** The held tasks on one hunt ground (the hunt cards and the HUD during that hunt). */
export function heldOn(tally, hunt) {
  return tally ? tally.held.filter((h) => h.hunt === hunt) : [];
}

/** "Gray Wolves 112/200" — the board's label of the task, the server's count. */
export function tallyLine(h) {
  const row = h ? tallyTask(h.task) : null;
  const label = row ? row.label.charAt(0).toUpperCase() + row.label.slice(1) : 'Tally';
  return label + ' ' + h.kills + '/' + h.target;
}

/** Her pick in words: "an Apprentice Hat", "4 Slime Gel" (`nameOf` names an item id). */
export function pickWords(pick, nameOf) {
  if (!pick || !pick.item) return '';
  const n = nameOf(pick.item);
  if (pick.kind === 'piece' || pick.pick === 'piece') return (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n;
  return pick.qty + ' ' + n;
}

/**
 * Why a DONE task is not paid yet, in the words the board and the HUD use.
 * @param {object} t        tallyOf()
 * @param {object} h        a held row with done = true
 * @param {boolean} hunting the hero's hunt section says it is hunting
 */
export function waitWords(t, h, hunting) {
  if (!h || !h.done) return '';
  if (t.paidToday >= t.perDay) return 'Done. Tamsin pays for ' + t.perDay + ' tasks a day: this one\'s paid tomorrow.';
  if (h.wait === 'bag_full') return 'Done. Make room in your bag for what Tamsin gives you.';
  return hunting ? 'Done. Tamsin pays when you are back in town.' : 'Done. Visit Tamsin to be paid.';
}
