// ════════════════════════════════════════════════════════════════════════
// src/shell/piece-words.js — A TRAIT PIECE IN WORDS, AND ITS DROP MOMENT (lane/t1b-piece-verbs, 2026-11-26; 12-targets 8.6, 21 section 4.5).
//
//   pieceName(p)          the piece's name: its Signature's, else its base item's
//   traitWords(p)         "First Rank III" or "File Breaker I · Worrier II"; '' for a Signature (the piece is its rule)
//   foundWords(p)         "Item Level 60 · Muster Barrows, depth 3"
//   standingWord(p)       "Rare" / "Very Rare" / "Signature"
//   pieceNewsOf(cs, told, who, nowMs)   the drop moment: one `rare` alert a piece this hero just found (the answer's hunt_settle.found,
//                         or the section's newest finds of its open hunt), each once (`told` by id)
// Display only: every fact is the server's row (src/session/piece-sections.js). Nothing here counts or prices.
// ════════════════════════════════════════════════════════════════════════
import { TRAITS } from '../data/traits.js';
import { SIGNATURES } from '../data/signatures.js';
import { itemName } from './widgets/bits.js';
import { huntName } from '../session/party-sections.js';
import { huntOf } from '../session/hunt-sections.js';
import { piecesOf, foundNowOf } from '../session/piece-sections.js';
import { whole } from '../render/format.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V']);
const STANDING = Object.freeze({ rare: 'Rare', very_rare: 'Very Rare', signature: 'Signature' });
/* the section's finds a frame carries (an unviewed hero's) are news while they are this fresh on the server's clock; older ones are the
   return card's line (away.js) */
export const PIECE_NEWS_MS = 10 * 60 * 1000;

export const pieceName = (p) => (p && p.signature && own(SIGNATURES, p.signature) ? SIGNATURES[p.signature].name : itemName(p ? p.base : ''));
export const standingWord = (p) => (p && own(STANDING, p.rarity) ? STANDING[p.rarity] : '');
export function traitWords(p) {
  return (p && p.traits ? p.traits : []).map((t) => (own(TRAITS, t.id) ? TRAITS[t.id].name : t.id) + (ROMAN[t.rank] ? ' ' + ROMAN[t.rank] : '')).join(' · ');
}
export function foundWords(p) {
  if (!p) return '';
  const where = p.ground ? huntName(p.ground) + (Number.isInteger(p.depth) ? ', depth ' + whole(p.depth) : '') : '';
  return [Number.isInteger(p.il) ? 'Item Level ' + whole(p.il) : '', where].filter(Boolean).join(' · ');
}

/** The drop moment's alerts for this hero: [{ id, kind: 'rare', session, item, piece, text, hero, place, at }]. */
export function pieceNewsOf(cs, told, who, nowMs) {
  const sec = piecesOf(cs);
  if (!sec || !cs) return [];
  const h = huntOf(cs);
  const open = h && !h.ended ? h.sessionId : null;
  const fresh = sec.pieces.filter((p) => p.foundBy === cs.slot && p.session && p.session === open
    && Number.isFinite(nowMs) && Number.isFinite(p.atMs) && nowMs - p.atMs <= PIECE_NEWS_MS);
  const all = new Map([...foundNowOf(cs), ...fresh].map((p) => [p.id, p]));
  return [...all.values()].filter((p) => !told('piece:' + p.id)).map((p) => ({
    id: 'piece:' + p.id, kind: 'rare', session: p.session, item: p.base, piece: p,
    text: standingWord(p) + ' for ' + who + ': ' + pieceName(p) + (traitWords(p) ? ' · ' + traitWords(p) : ''),
    hero: who, place: p.ground ? huntName(p.ground) : '', at: p.atMs }));
}
