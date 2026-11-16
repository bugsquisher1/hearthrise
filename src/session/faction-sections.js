// ════════════════════════════════════════════════════════════════════════
// src/session/faction-sections.js — THE TWO FACTIONS AS THE SERVER STATES THEM, FOR ONE HERO.
//
// PURE. Reads the envelope's `factions` section (supabase/migrations/2027-04-23-faction-section.sql hr_faction_section: the view of
// 2027-04-22-faction-standing.sql plus the swap's need and the cooldown):
//   null / absent   the `factions` switch is off for this account: no Faction tab, no join prompt, nothing to press
//   { faction: side id | null,        the hero's side (null: none yet)
//     can_join,                       the server counted the hero's Krell kill and it has no side
//     joined_at,
//     swap: { to, started_at, ms, need_ms } | null,   an open swap and the hunting time the settle has credited it
//     swap_ready_at,                  when the hero may start the next swap (its last change of side + the cooldown)
//     standing: { side: ms },         per side, never lost
//     today_ms, day_cap_ms,
//     pieces: [{ id, faction, need_ms, held }],
//     swap_need_ms, cooldown_ms }
// Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). A side, a piece or a number that is not the
// server's shape is dropped: the tab never invents one.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,32}$/;
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };

function swapOf(s) {
  if (!isObj(s) || !word(s.to) || nat(s.ms) === null || nat(s.need_ms) === null) return null;
  return Object.freeze({ to: s.to, startedAt: at(s.started_at), ms: s.ms, needMs: s.need_ms });
}

function pieceOf(p) {
  if (!isObj(p) || !word(p.id) || !word(p.faction) || nat(p.need_ms) === null) return null;
  return Object.freeze({ id: p.id, side: p.faction, needMs: p.need_ms, held: p.held === true });
}

/** The section, checked field by field and frozen, or null when the server did not send it. */
export function factionOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('factions') : undefined;
  if (!isObj(s) || !isObj(s.standing) || !Array.isArray(s.pieces)) return null;
  const standing = {};
  for (const [k, v] of Object.entries(s.standing)) if (word(k) && nat(v) !== null) standing[k] = v;
  const side = word(s.faction);
  const pieces = s.pieces.slice(0, 64).map(pieceOf).filter(Boolean);
  /* THE SIDES IN THE SERVER'S ORDER: a jsonb object's keys come back sorted by length, so the order is the pieces' (the catalogue's
     ord), then any side that has standing and no piece. Both sides are always drawn the same way, in this one order. */
  const sides = [...new Set([...pieces.map((p) => p.side), ...Object.keys(standing)])];
  return Object.freeze({
    side,
    canJoin: side === null && s.can_join === true,
    sides: Object.freeze(sides),
    standing: Object.freeze(standing),
    swap: side === null ? null : swapOf(s.swap),
    swapReadyAt: side === null ? null : at(s.swap_ready_at),
    swapNeedMs: nat(s.swap_need_ms),
    cooldownMs: nat(s.cooldown_ms),
    pieces: Object.freeze(pieces),
  });
}

/** This hero's standing on one side (ms), 0 when the server holds none. Pure. */
export const standingOn = (f, side) => (f && Number.isSafeInteger(f.standing[side]) ? f.standing[side] : 0);

/** May this piece be claimed now, by the server's own numbers? Never true for a piece held or a number missing. Pure. */
export const claimable = (f, p) => !!f && !!p && !p.held && standingOn(f, p.side) >= p.needMs;

/** The side a member would swap to: the other one the server lists, or null. Pure. */
export const otherSide = (f) => (f && f.side ? f.sides.find((s) => s !== f.side) || null : null);
