// ════════════════════════════════════════════════════════════════════════
// src/session/catacomb-sections.js — THE UNMARKED CATACOMBS' DESCENT AS THE SERVER STATES IT, FOR ONE HERO.
//
// PURE. Reads the envelope's `catacomb` section (supabase/migrations/2027-05-08-catacombs.sql hr_catacomb_section):
//   null / absent   the `unmarked_catacombs` switch is off for this account: the Tower window draws no Catacombs tab, nothing to press
//   { wings [{ wing, hunt, name, best, record, checkpoints [door], last_start }], last_wing,
//     rules { room_size, door_every, room_limit_ms, door_limit_ms, room_top },
//     gate { need, level, ok, short [{ seat, name, level }] },
//     pays { xp_pm, coin, drops, bestiary, death_loss_pm, blessings, stamina },
//     run { session, wing, start, top, floors, room } | null,
//     last { session, wing, start, top, floors, end_reason, ended_at, keys [{ door, key }], withheld, board } | null,
//     party [{ seat, name, best { <wing>: n }, outfit }],
//     field { solo?, party? } (each the board's field, ./tower-sections.js fieldOf: "Catacombs, Deepest" alone and in a party),
//     chest (hr_chest_section, ./tower-sections.js chestOf) }
//
// A WING is a run ground the hero picks before Enter (Tyler 2026-11-16); its `best` is the hero's own deepest room cleared, its `record`
// the one its door reads (a party's lowest seat's), its `checkpoints` the vault doors a descent may start after (0: room 1), the ONE list
// hr_catacomb_start(p_slot, p_wing, p_landing, p_idem) checks p_landing against, and `last_start` the door its newest descent started
// after (null: none). Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). A row that is not the
// server's shape is dropped, never mended: the tab shows less, never something the server did not say.
// ════════════════════════════════════════════════════════════════════════

import { paysOf, fieldOf, climbPlaceOf, chestOf } from './tower-sections.js?v=0.2.143';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const pos = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };
const sid = (v) => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null);
const name = (v) => (typeof v === 'string' && v.trim() && v.length <= 60 ? v.trim() : null);

/* A list of whole numbers 0 and up, strictly rising (the server sorts them), or null. */
function rising(v, max = 512) {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, max).map(nat);
  if (out.some((x) => x === null)) return null;
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) return null;
  return Object.freeze(out);
}

function rulesOf(r) {
  if (!isObj(r)) return null;
  const o = { roomSize: pos(r.room_size), doorEvery: pos(r.door_every), roomLimitMs: pos(r.room_limit_ms), doorLimitMs: pos(r.door_limit_ms),
    roomTop: pos(r.room_top) };
  return Object.values(o).some((v) => v === null) ? null : Object.freeze(o);
}

/* One wing: its id, hunt, name and the hero's numbers in it. A start list out of the server's shape is no start (never mended). */
function wingOf(w) {
  if (!isObj(w) || !word(w.wing) || !word(w.hunt) || !name(w.name)) return null;
  return Object.freeze({ wing: w.wing, hunt: w.hunt, name: name(w.name), best: nat(w.best) ?? 0, record: nat(w.record),
    checkpoints: rising(w.checkpoints) || Object.freeze([]), lastStart: nat(w.last_start) });
}

/* The door's Level as the server judged it: the hero's and every seat's (`ok`), and each seat under it by name. */
function gateOf(g) {
  if (!isObj(g) || pos(g.need) === null || typeof g.ok !== 'boolean') return null;
  const short = (Array.isArray(g.short) ? g.short : []).slice(0, 7).filter((x) => isObj(x) && name(x.name) && pos(x.level) !== null)
    .map((x) => Object.freeze({ seat: nat(x.seat), name: name(x.name), level: x.level }));
  return Object.freeze({ need: g.need, level: pos(g.level), ok: g.ok, short: Object.freeze(short) });
}

function runOf(r, wings) {
  if (!isObj(r) || !sid(r.session) || pos(r.start) === null || !wings.some((w) => w.wing === r.wing)) return null;
  return Object.freeze({ session: sid(r.session), wing: r.wing, start: r.start, top: pos(r.top), floors: nat(r.floors) ?? 0, room: pos(r.room) });
}

function lastOf(r, wings) {
  if (!isObj(r) || !sid(r.session) || pos(r.start) === null || !wings.some((w) => w.wing === r.wing)) return null;
  const keys = (Array.isArray(r.keys) ? r.keys : []).slice(0, 64).filter((k) => isObj(k) && pos(k.door) !== null && word(k.key))
    .map((k) => Object.freeze({ door: k.door, key: k.key }));
  return Object.freeze({ session: sid(r.session), wing: r.wing, start: r.start, top: pos(r.top), floors: nat(r.floors) ?? 0,
    endReason: word(r.end_reason), endedAt: at(r.ended_at), keys: Object.freeze(keys), withheld: nat(r.withheld) ?? 0, board: climbPlaceOf(r.board) });
}

/* Every OTHER seat of the hero's party: its name, its best in each wing the server names, its worn outfit. */
function seatOf(p, wings) {
  if (!isObj(p) || !name(p.name)) return null;
  const best = {};
  for (const w of wings) best[w.wing] = isObj(p.best) ? nat(p.best[w.wing]) ?? 0 : 0;
  return Object.freeze({ seat: nat(p.seat), name: name(p.name), best: Object.freeze(best), outfit: word(p.outfit) });
}

/** The section, checked field by field and frozen, or null when the server did not send it (the switch is off). */
export function catacombOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('catacomb') : undefined;
  if (!isObj(s) || !Array.isArray(s.wings)) return null;
  const rules = rulesOf(s.rules);
  /* one row a wing, the first the server lists for an id kept */
  const wings = Object.freeze(s.wings.slice(0, 8).map(wingOf).filter((w, i, all) => w && all.findIndex((x) => x && x.wing === w.wing) === i));
  if (!rules || !wings.length) return null;
  const f = isObj(s.field) ? s.field : {};
  return Object.freeze({
    wings, lastWing: wings.some((w) => w.wing === s.last_wing) ? s.last_wing : null, rules, gate: gateOf(s.gate), pays: paysOf(s.pays),
    run: runOf(s.run, wings), last: lastOf(s.last, wings),
    party: Object.freeze((Array.isArray(s.party) ? s.party : []).slice(0, 7).map((p) => seatOf(p, wings)).filter(Boolean)),
    field: Object.freeze({ solo: fieldOf(f.solo), party: fieldOf(f.party) }),
    chest: chestOf(s.chest),
  });
}

/** The wing row `wing`, or null. Pure. */
export const wingRow = (cat, wing) => (cat ? cat.wings.find((w) => w.wing === wing) || null : null);

/* The key rows a wing's doors hand out (the server's rows whose ground is the wing's), lowest door first. */
function wingKeys(cat, w) {
  if (!cat || !cat.chest || !w) return [];
  return cat.chest.keys.filter((k) => k.ground === w.hunt).slice().sort((a, b) => a.from - b.from);
}

/** The key vault door `door` of a wing gives: the highest of the wing's rows at or under it (the server's mint rule, on its own rows), or
    null. Pure. */
export function keyForDoor(cat, w, door) {
  let best = null;
  for (const k of wingKeys(cat, w)) if (k.from <= door && (!best || k.from > best.from)) best = k;
  return best;
}
