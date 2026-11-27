// ════════════════════════════════════════════════════════════════════════
// src/session/time-sections.js — BOUGHT TOWN WORK, THE STANDING RULE AND ITS OFFER, AS THE SERVER HOLDS THEM
//   (lane B1, supabase/migrations/1071-work-blocks.sql; the `time_blocks` section; the hunting block's reader is item-sections.js
//   huntBlockOf).
//
//   time_blocks.work   { available, why, block_ms, price, n, bought, per_day, cap_ms, used_ms, left_ms, room_ms, auto }
//   time_blocks.<kind>.auto  { up_to, max_price, bought } or null: the hero's standing "buy up to N a day" rule (null = off, the default)
//   time_blocks.offer  { kind, choices, threshold, purse } or null: the coach card's offer of the rule (12-targets 9.3), once per account
// Display only: every envelope replaces these, every press re-reads, and the server decides every purchase.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const read = (cs, key) => (cs && typeof cs.read === 'function' ? cs.read(key) : undefined);

const WORK_WHY = Object.freeze(['block_limit', 'day_ending']);
const KINDS = Object.freeze(['hunt', 'work']);

/** `time_blocks.work`: the next bought block of town work as the server prices it, or null (control off). */
export function workBlockOf(cs) {
  const all = read(cs, 'time_blocks');
  const q = isObj(all) ? all.work : null;
  if (!isObj(q) || typeof q.available !== 'boolean' || count(q.bought) === null || count(q.per_day) === null || !count(q.block_ms)) return null;
  if (q.available && !count(q.price)) return null;
  return {
    available: q.available, why: q.available ? null : (WORK_WHY.includes(q.why) ? q.why : 'unavailable'),
    price: q.available ? q.price : null, blockMs: q.block_ms, perDay: q.per_day, boughtToday: q.bought,
    leftMs: count(q.left_ms) ?? 0, capMs: count(q.cap_ms) ?? 0,
  };
}

/** The hero's standing rule for `kind` ('hunt' | 'work'): { upTo, maxPrice, boughtToday, perDay }, upTo 0 when off; null before the server
    has the rule (an older database: the control stays hidden). */
export function timeRuleOf(cs, kind) {
  const all = read(cs, 'time_blocks');
  const q = KINDS.includes(kind) && isObj(all) ? all[kind] : null;
  if (!isObj(q) || !('auto' in q) || count(q.per_day) === null) return null;
  const a = isObj(q.auto) ? q.auto : null;
  return {
    upTo: a ? count(a.up_to) ?? 0 : 0, maxPrice: a ? count(a.max_price) : null,
    boughtToday: a ? count(a.bought) ?? 0 : 0, perDay: q.per_day,
  };
}

/** The account's one offer of the standing rule (the coach card's state, 12-targets 9.3), or null: { kind, choices, threshold }. */
export function timeOfferOf(cs) {
  const all = read(cs, 'time_blocks');
  const o = isObj(all) ? all.offer : null;
  if (!isObj(o) || !KINDS.includes(o.kind) || !Array.isArray(o.choices)) return null;
  const choices = o.choices.filter((n) => Number.isSafeInteger(n) && n >= 1 && n <= 24);
  return choices.length ? { kind: o.kind, choices, threshold: count(o.threshold) } : null;
}
