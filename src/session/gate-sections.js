// ════════════════════════════════════════════════════════════════════════
// src/session/gate-sections.js — THE TWO DOORS THE SERVER KEEPS, AS IT STATES THEM FOR ONE HERO (Tyler 2026-11-18: "A minimum level to enter
// the tower, and you have to beat the boss in the hunting ground X times before you can call them out").
//
// PURE. Reads the envelope's `entry_gates` section (supabase/migrations/2027-05-05-entry-gates.sql hr_entry_gates_view):
//   { tower: { need, level, ok, short [{ seat, name, level }] } | null (the burning_tower switch off),
//     calls: { <call id>: { boss, need, have, ok, short [{ seat, name, have }] } } }
// `ok` is the server's: this hero AND every other seat of its party meet the number (what hr_tower_start and hr_boss_call check); `short`
// is every OTHER seat that does not. A gate that is not the server's shape reads as null, and a window reads null as locked (CLAUDE.md §6:
// a gate reads the server-mirrored value, failing safe). Every envelope replaces it; nothing here holds a number of its own.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const pos = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
const name = (v) => (typeof v === 'string' && v.trim() && v.length <= 60 ? v.trim() : null);
const CALL = /^[a-z0-9_]{1,64}$/;

const section = (cs) => { const s = cs && typeof cs.read === 'function' ? cs.read('entry_gates') : null; return isObj(s) ? s : null; };
/* the other seats that fall short, each with its name and the server's number under `field` (a row without both is not the server's) */
function shortOf(v, field) {
  return Object.freeze((Array.isArray(v) ? v : []).slice(0, 7)
    .filter((x) => isObj(x) && name(x.name) && nat(x[field]) !== null)
    .map((x) => Object.freeze({ seat: nat(x.seat), name: name(x.name), [field]: x[field] })));
}

/** The Tower's door: { need, level, ok, short } or null (no section, the switch off, or not the server's shape). Pure. */
export function towerGateOf(cs) {
  const s = section(cs);
  const g = s && isObj(s.tower) ? s.tower : null;
  if (!g || pos(g.need) === null || pos(g.level) === null || typeof g.ok !== 'boolean') return null;
  return Object.freeze({ need: g.need, level: g.level, ok: g.ok, short: shortOf(g.short, 'level') });
}

/** A call's natural wins: { boss, need, have, ok, short } or null (no section, no such call, or not the server's shape). Pure. */
export function callGateOf(cs, call) {
  const s = section(cs);
  const all = s && isObj(s.calls) ? s.calls : null;
  const g = all && typeof call === 'string' && CALL.test(call) && Object.hasOwn(all, call) && isObj(all[call]) ? all[call] : null;
  if (!g || typeof g.boss !== 'string' || !CALL.test(g.boss) || pos(g.need) === null || nat(g.have) === null || typeof g.ok !== 'boolean') return null;
  return Object.freeze({ boss: g.boss, need: g.need, have: g.have, ok: g.ok, short: shortOf(g.short, 'have') });
}
