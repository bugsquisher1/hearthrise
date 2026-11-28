// ============================================================
// src/core/hunt/signature-casts.js — WHAT A WORN SIGNATURE CHANGES ABOUT WHAT A CAST LANDS (systems, lane/signatures-batch-5, 2026-11-28;
// docs/design/redesign/15-signature-candidates.md "Batch 5: the rows and their moves"; the rows are src/data/signatures.js `raise`). What a
// cast PAYS is signature-costs.js's; the rune it saves is abilities.js fire's own; a next cast raised once (Kindled) is a status's.
//
// A STANDING RAISE (`raise: { family, pm, of }`, #26 Thrower's Ring, "Earth rune shields you cast are 30% stronger"): every cast of the
// wearer's whose rune is of `family` lands pm permille more, as a version's step (abilities.js fire's output, where Kindled's next cast
// raised lands too: a hit, a heal and a shell alike read it), never spent. `of` 'shell' narrows it to the casts that lay a shield (the
// tip's "shields"): the hammer's Stagger is an Earth rune strike, and a ring a hammer wears raises no blow.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { SIGNATURES } from '../../data/signatures.js';
import { shells } from '../../data/abilities.js';
import { ITEMS } from '../../data/items.js';

const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const sigOf = (u) => (u && own(SIGNATURES, u.signature) ? SIGNATURES[u.signature] : null);
/* the rune family of move `row` (its Chalked rune's, src/data/items.js), or null */
const familyOf = (row) => (row && typeof row.rune === 'string' && own(ITEMS, row.rune) ? ITEMS[row.rune].family || null : null);

/** THE STANDING RAISE hero `u`'s worn Signature lands on its cast of `row`, permille (0 with none: the header). Pure. */
export function castRaiseOf(u, row) {
  const s = sigOf(u), r = s && s.raise;
  if (!r || familyOf(row) !== r.family || (r.of === 'shell' && !shells(row))) return 0;
  return r.pm;
}
