// ════════════════════════════════════════════════════════════════════════
// src/session/piece-sections.js — THE ACCOUNT'S TRAIT PIECES, AS THE SERVER SENDS THEM (the `pieces` section, 1071-trait-pieces.sql
//   hr_trait_pieces_view, restated by 1072-piece-verbs.sql; and a settle answer's `hunt_settle.found`, the drop moment).
//
//   piecesOf(cs)              { pieces, sellLeft } or null (no section: the trait_pieces switch is off, so nothing shows)
//   wornPieceOf(cs, k)        the piece this hero wears in equip slot k (its base is the item the slot holds), or null
//   wornPiecesOf(cs)          every piece this hero wears, { equip slot: piece } (Equip upgrades weighs them: src/core/upgrade-pick.js)
// The list is the ACCOUNT's newest any open hero was told (item-sections.js accountSection), so one hero's wear or sale shows on the others.
//   freePiecesOf(cs)          the account's pieces no hero wears and no market holds, newest first
//   piecesFoundIn(cs, sid)    the pieces this hero found in hunt session `sid` (the return card's line)
//   foundNowOf(cs)            the pieces the answer this record came from says just landed for this hero (hunt_settle.found), as the
//                             section holds them; [] for any other answer
// A PIECE is { id, base, slot, rarity, traits: [{ id, rank }], signature, il, ground, depth, foundBy, session, atMs, worn: { slot,
//   equipSlot } | null, escrow, sell }: `sell` is what the store pays for it now (the server's price, sent back as is by the Sell press),
//   null where it buys none. The shape src/shell/item-standing.js standingOf reads (base, rarity, traits, signature).
// A read of the envelope only, REPLACED by each envelope (CLAUDE.md §6). Nothing here computes a number.
// ════════════════════════════════════════════════════════════════════════
import { equipmentOf, accountSection } from './item-sections.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = /^[a-z0-9_]{1,64}$/;
const RARITIES = new Set(['rare', 'very_rare', 'signature']);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;

/* One server row as the client reads it, or null for a row that is not one. */
function pieceOf(r) {
  if (!isObj(r) || typeof r.id !== 'string' || !ID.test(r.id) || typeof r.base !== 'string' || !NAME.test(r.base) || !RARITIES.has(r.rarity)) return null;
  const traits = Array.isArray(r.traits) ? r.traits.filter((t) => isObj(t) && typeof t.id === 'string' && NAME.test(t.id) && Number.isInteger(t.rank) && t.rank >= 1)
    .map((t) => Object.freeze({ id: t.id, rank: t.rank })) : [];
  const worn = isObj(r.worn) && Number.isInteger(r.worn.slot) && typeof r.worn.equip_slot === 'string' ? Object.freeze({ slot: r.worn.slot, equipSlot: r.worn.equip_slot }) : null;
  return Object.freeze({
    id: r.id, base: r.base, slot: typeof r.slot === 'string' ? r.slot : '', rarity: r.rarity, traits: Object.freeze(traits),
    signature: typeof r.signature === 'string' && NAME.test(r.signature) ? r.signature : null,
    il: whole(r.il) ? r.il : null, ground: typeof r.ground === 'string' ? r.ground : null, depth: whole(r.depth) ? r.depth : null,
    foundBy: Number.isInteger(r.found_by) ? r.found_by : null, session: typeof r.session === 'string' ? r.session : null,
    atMs: whole(r.at_ms) ? r.at_ms : null, worn, escrow: typeof r.escrow === 'string' ? r.escrow : null, sell: whole(r.sell) ? r.sell : null,
  });
}

/** The section, or null (no section yet, or the switch is off). */
export function piecesOf(cs) {
  /* the account's newest list any open hero was told (item-sections.js accountSection): a wear or a sale on another hero moves it here */
  const raw = cs && typeof cs.read === 'function' ? accountSection(cs, 'pieces') : undefined;
  if (!isObj(raw) || !Array.isArray(raw.pieces)) return null;
  return { pieces: raw.pieces.map(pieceOf).filter(Boolean), sellLeft: whole(raw.sell_left) ? raw.sell_left : 0 };
}

/** The piece this hero wears in equip slot `k`, read only while the slot holds its base (the server's own rule: hr_worn_traits_of). */
export function wornPieceOf(cs, k) {
  const sec = piecesOf(cs);
  if (!sec || !cs) return null;
  const eq = equipmentOf(cs) || {};
  return sec.pieces.find((p) => p.worn && p.worn.slot === cs.slot && p.worn.equipSlot === k && eq[k] === p.base) || null;
}

/** Every piece this hero wears, { equip slot: piece }, each only while its slot holds its base (wornPieceOf's rule): what Equip upgrades
    weighs in steps (src/core/upgrade-pick.js). {} with no section. */
export function wornPiecesOf(cs) {
  const sec = piecesOf(cs), out = {};
  if (!sec || !cs) return out;
  const eq = equipmentOf(cs) || {};
  for (const p of sec.pieces) if (p.worn && p.worn.slot === cs.slot && eq[p.worn.equipSlot] === p.base) out[p.worn.equipSlot] = p;
  return out;
}

/** The account's pieces no hero wears and no market holds, newest first (the server's order). */
export function freePiecesOf(cs) {
  const sec = piecesOf(cs);
  return sec ? sec.pieces.filter((p) => !p.worn && !p.escrow) : [];
}

/** The pieces this hero found in hunt session `sid`. */
export function piecesFoundIn(cs, sid) {
  const sec = piecesOf(cs);
  if (!sec || !cs || typeof sid !== 'string') return [];
  return sec.pieces.filter((p) => p.session === sid && p.foundBy === cs.slot);
}

/** The pieces the answer this record came from says just landed for this hero (`hunt_settle.found`), as the section holds them. */
export function foundNowOf(cs) {
  const hs = cs && typeof cs.read === 'function' ? cs.read('hunt_settle') : undefined;
  const ids = isObj(hs) && Array.isArray(hs.found) ? new Set(hs.found.filter((f) => isObj(f) && typeof f.id === 'string').map((f) => f.id)) : null;
  const sec = ids && ids.size ? piecesOf(cs) : null;
  return sec ? sec.pieces.filter((p) => ids.has(p.id)) : [];
}
