// ════════════════════════════════════════════════════════════════════════
// src/session/recruit-sections.js — THE RECRUIT PRESS AS THE SERVER WILL MAKE IT (the `recruits` section; 1053-recruits.sql hr_recruits_view).
//
//   recruitsOf(cs)   { ready, at, level, first, slots, sets }: whether the first hero has reached the Level the press opens at (`at`), the
//                    Level the recruits arrive at, the first hero's slot, the empty slots they take and the STARTER_SETS id each wears, in
//                    slot order; null for a company of two or more, once the press is made, or when the server sent no section
//
// A read of the envelope only: nothing here is a gate the server trusts, and a missing section offers nothing (never a default).
// ════════════════════════════════════════════════════════════════════════

const SET = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_SLOT = 5;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const lv = (v) => (Number.isInteger(v) && v >= 1 ? v : null);
const slotOk = (s) => Number.isInteger(s) && s >= 0 && s <= MAX_SLOT;

/** The `recruits` section, bounded; null when the server sent none or it is not an offer. */
export function recruitsOf(cs) {
  const r = cs && typeof cs.read === 'function' ? cs.read('recruits') : null;
  if (!isObj(r) || typeof r.ready !== 'boolean' || !lv(r.at) || !lv(r.level) || !slotOk(r.first)) return null;
  const slots = Array.isArray(r.slots) ? r.slots.slice(0, MAX_SLOT) : [];
  const sets = Array.isArray(r.sets) ? r.sets.slice(0, MAX_SLOT) : [];
  if (!slots.length || slots.length !== sets.length || !slots.every(slotOk) || !sets.every((s) => typeof s === 'string' && SET.test(s))) return null;
  return { ready: r.ready, at: r.at, level: r.level, first: r.first, slots, sets };
}
