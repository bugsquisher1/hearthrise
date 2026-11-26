// ════════════════════════════════════════════════════════════════════════
// src/shell/item-standing.js — WHICH PIECES STAND OUT: PLAIN, RARE OR SIGNATURE (art director, lane/a1-rare-frame, 2026-11-26;
// docs/design/redesign/20-v030-the-roads.md A1 and gate 12, the four rarity steps of 06-comparison.md section 2c).
//
// Plain gear is the floor. A Rare carries a Trait (a Very Rare two), a Signature is a named piece with one fixed rule. The step is
// the PIECE's, never the catalogue's: a catalogue row's `rarity` (common .. unique) is its metal's rung on the old ladder, so a
// steel sword is plain however it reads there. What stands out:
//   signature   an item id that names a Signature (src/data/signatures.js: the Signature's id is its piece's item id), or a piece
//               whose `signature` names one
//   rare        a piece whose `rarity` is 'rare', or that carries a Trait
//   very_rare   a piece whose `rarity` is 'very_rare' (the next patch; drawn in the Rare frame until it has its own)
// A PIECE is the trait_pieces row's shape (src/core/carry-over.js; 12-targets section 8, wave 4): { base, slot, tier, rarity,
// traits: [{ id, rank }], signature, escrow }. Until that table lands every bag stack is a plain id, so only a Signature id stands.
// The frame itself is drawn once, by src/shell/widgets/bits.js itemIconHtml (hunt.css .hh-std); every surface that shows an item's
// icon goes through it (tests/item-standing.mjs).
//
// Display only. Pure: no DOM.
// ════════════════════════════════════════════════════════════════════════
import { SIGNATURES } from '../data/signatures.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const isPiece = (item) => !!item && typeof item === 'object';

/** The item id whose icon and name a bag entry shows: the id itself, or a piece's Signature, else its base. */
export function itemIdOf(item) {
  if (!isPiece(item)) return typeof item === 'string' ? item : '';
  if (typeof item.signature === 'string' && own(SIGNATURES, item.signature)) return item.signature;
  return typeof item.base === 'string' ? item.base : typeof item.id === 'string' ? item.id : '';
}

/** 'signature' | 'rare' | 'very_rare' for a piece that stands out, else null (a plain piece, a stack, anything not gear). */
export function standingOf(item) {
  if (typeof item === 'string') return own(SIGNATURES, item) ? 'signature' : null;
  if (!isPiece(item)) return null;
  if (typeof item.signature === 'string' && own(SIGNATURES, item.signature)) return 'signature';
  if (typeof item.base === 'string' && own(SIGNATURES, item.base)) return 'signature';
  if (item.rarity === 'very_rare') return 'very_rare';
  if (item.rarity === 'rare' || (Array.isArray(item.traits) && item.traits.length > 0)) return 'rare';
  return null;
}
