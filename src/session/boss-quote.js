// ════════════════════════════════════════════════════════════════════════
// src/session/boss-quote.js — THE SERVER'S QUOTE FOR CALL OUT (src/data/boss-calls.js; supabase/migrations/2027-04-24-boss-call-series.sql).
//
// A read, not an intent: hr_boss_call_view while the ground's page is open. A server that won't say answers null, and the
// page then keeps the press off and says so. Nothing here prices or gates anything.
// A SERIES (Tyler 2026-11-14): the quote is ONE FIGHT'S price (gold and stamina), the most fights one call may queue, what the
// room's stamina and gold cover right now, and the bill of every count the slider can pick (`totals`, the server's own sums:
// the pane reads the picked count's entry and never multiplies).
// A FREE FIGHT IS A PRICE (2027-03-22-live-events.sql §4): an event's fee dial (Open Halls) quotes 0 gold, the verb takes 0, and
// the quote names the event that set it (`event`). It waives gold only: a fight's stamina is the same.
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALLS } from '../data/boss-calls.js?v=0.2.138';

const whole = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const table = (v, n) => (Array.isArray(v) && v.length === n && v.every((x) => Number.isSafeInteger(x) && x >= 0) ? v.slice() : null);
const ITEM = /^[a-z0-9_]{1,64}$/;

/* WHAT A WIN CAN DROP (audit F24): the server's list, in its order, each row's odds in parts per million. A row that isn't one is dropped. */
function dropsOf(v) {
  const out = [];
  for (const d of Array.isArray(v) ? v.slice(0, 32) : []) {
    if (d && typeof d === 'object' && typeof d.item === 'string' && ITEM.test(d.item) && Number.isSafeInteger(d.ppm) && d.ppm >= 1 && d.ppm <= 1000000) out.push({ item: d.item, ppm: d.ppm });
  }
  return out;
}
/* THE DANGER, the server's own reading of the room (hr_boss_call_quote `danger`), or null when it did not say: his Level, how many seats are under it and
   the lowest, whether the room holds a tank and a healer, how many bars hold no food. Nothing here judges a hero. */
function dangerOf(v) {
  if (!v || typeof v !== 'object' || !Number.isInteger(v.boss_level) || v.boss_level < 1) return null;
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  return { bossLevel: v.boss_level, under: count(v.under), lowest: Number.isInteger(v.lowest) && v.lowest >= 1 ? v.lowest : null,
    tank: v.tank === true, healer: v.healer === true, noFood: count(v.no_food) };
}

/* NATURAL WINS BEFORE THE CALL (2027-05-05-entry-gates.sql, Tyler 2026-11-18): the boss counted, the server's number, this hero's count and every
   OTHER seat short of it by name, or null when the quote does not say (an older server: the press still waits on `available`). */
function winsOf(v) {
  if (!v || typeof v !== 'object' || typeof v.boss !== 'string' || !ITEM.test(v.boss) || !(Number.isSafeInteger(v.need) && v.need > 0) || whole(v.have) === null) return null;
  const short = (Array.isArray(v.short) ? v.short.slice(0, 7) : [])
    .filter((s) => s && typeof s === 'object' && typeof s.name === 'string' && s.name.trim() && whole(s.have) !== null)
    .map((s) => ({ name: s.name.trim().slice(0, 40), have: s.have }));
  return { boss: v.boss, need: v.need, have: v.have, short };
}

/** A quote as the server sent it, bounded: whole numbers and a code, or null. A quote that can't draw the slider is no quote. */
export function quoteOf(q) {
  if (!q || typeof q !== 'object' || !Number.isSafeInteger(q.price) || q.price < 0) return null;
  const maxFights = Number.isInteger(q.max_fights) && q.max_fights >= 1 && q.max_fights <= 1000 ? q.max_fights : null;
  const staminaMs = whole(q.fight_stamina_ms), limitMs = whole(q.limit_ms);
  const t = q.totals && typeof q.totals === 'object' ? q.totals : {};
  const fee = maxFights === null ? null : table(t.fee, maxFights), stamina = maxFights === null ? null : table(t.stamina_ms, maxFights);
  if (maxFights === null || !staminaMs || !limitMs || !fee || !stamina) return null;
  return { price: q.price, available: q.available === true, why: typeof q.why === 'string' ? q.why.slice(0, 32) : null,
    /* the seat that can't pay the first fight (the server's own name for it), or null */
    who: typeof q.who === 'string' && q.who.trim() ? q.who.trim().slice(0, 40) : null,
    /* one fight: its stamina and its limit; the most fights one call may queue */
    staminaMs, limitMs, maxFights,
    /* the fights the room's stamina and gold pay for right now (the server's count, at most the top) */
    covers: Math.min(maxFights, whole(q.covers) || 0),
    /* this account's heroes in the room: each pays its own stamina, the one purse pays for all of them */
    heroes: Number.isInteger(q.heroes) && q.heroes >= 1 ? q.heroes : 1,
    /* the bill of n fights, n = 1..maxFights at index n - 1: gold for this account, stamina a hero */
    totals: { fee, staminaMs: stamina },
    /* what a win can drop, and the room's danger: the page names both before the slider (audit F24) */
    drops: dropsOf(q.drops), danger: dangerOf(q.danger), wins: winsOf(q.wins),
    /* the room will hold this hero alone (2027-04-05-call-out-alone.sql): the warning's one more line; a server that doesn't say adds none */
    alone: q.alone === true,
    /* the live event whose fee dial set this price (the quote's `event`), or null: it picks the pane's words, never its number */
    event: typeof q.event === 'string' && /^[a-z0-9_]{1,64}$/.test(q.event) ? q.event : null };
}

/**
 * A KEYED HALL AS THIS HERO'S PAGE SHOWS ITS DOOR: the server's `boss_halls` section (2027-04-25-boss-daily.sql hr_boss_halls_view), or null
 * when the server has not said (the page then shows no loot line, and only this hero's own bag turns the press on). Nothing here decides
 * anything: the day table and the key rule are the server's.
 *   taken     this hero made today's prize roll on the hall's boss (the server's UTC day)
 *   nextAtMs  when it can next (the server's next midnight), null when today's is still to take
 *   key       whose key an open would take (hr_boss_hall_key_of: the leader's own first, else the first seat's not under its lock):
 *             { seat (null alone), own, name (that hero's, when not this one) }, or null when no seat holds one
 *   seats     the heroes an open marches in (1 alone)        left   how many of them still have today's prize to take
 */
export function hallStateOf(cs, hall) {
  const all = cs && typeof cs.read === 'function' ? cs.read('boss_halls') : null;
  const s = all && typeof all === 'object' && typeof hall === 'string' && Object.hasOwn(all, hall) ? all[hall] : null;
  if (!s || typeof s !== 'object' || typeof s.taken !== 'boolean') return null;
  const at = typeof s.next_at === 'string' ? Date.parse(s.next_at) : NaN;
  const whole = (v) => (Number.isInteger(v) && v >= 0 && v <= 8 ? v : null);
  const k = s.key && typeof s.key === 'object' ? s.key : null;
  return { taken: s.taken, first: s.first === true, nextAtMs: s.taken && Number.isFinite(at) ? at : null,
    key: k ? { seat: whole(k.seat), own: k.own === true, name: typeof k.name === 'string' && k.name.trim() ? k.name.trim().slice(0, 40) : null } : null,
    seats: whole(s.seats), left: whole(s.left) };
}

/** The server's quote for `call`, or null with no answer (the press stays off until there is one). */
export async function readCall(account, cs, call) {
  if (!account || !account.server || !cs || cs.status === 'closed' || !Number.isInteger(cs.slot) || !Object.hasOwn(BOSS_CALLS, call)) return null;
  const ans = await account.server.rpc('hr_boss_call_view', { p_slot: cs.slot, p_call: call });
  return ans && ans.ok && ans.body && ans.body.ok === true ? quoteOf(ans.body.quote) : null;
}
