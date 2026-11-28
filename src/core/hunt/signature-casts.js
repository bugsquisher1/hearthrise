// ============================================================
// src/core/hunt/signature-casts.js — WHAT A WORN SIGNATURE CHANGES ABOUT A CAST BEYOND ITS COST: what it lands and where it aims (systems,
// lane/signatures-batch-5, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Batch 5: the rows and their moves"; the rows are
// src/data/signatures.js `raise` and `aim`). What a cast PAYS is signature-costs.js's; the rune it saves is abilities.js fire's own.
//
// A STANDING RAISE (`raise: { family, pm, of }`, #26 Thrower's Ring, "Earth rune shields you cast are 30% stronger"): every cast of the
// wearer's whose rune is of `family` lands pm permille more, as a version's step (abilities.js fire's output, where Kindled's next cast
// raised lands too: a hit, a heal and a shell alike read it), never spent. `of` 'shell' narrows it to the casts that lay a shield (the
// tip's "shields"): the hammer's Stagger is an Earth rune strike, and a ring a hammer wears raises no blow.
//
// A GUARDING AIM (`aim: { move, r }`, Ledgehide Breeches, "Parry also guards an ally: it can answer a monster next to you winding up a blow
// at another hero"): the wearer's `move` answers a wind-up that is not its own target's. A monster in the move's reach (the hero's own:
// the sword's is beside it), living and in the fight, winding up a blow (monster-spells.js `cast` with time left, never a mend: a mend
// aims at a packmate) at a living hero of the wearer's side within `r` tiles of the wearer, and holding none of the move's own status
// (Parried: a cast never lands for nothing), is the move's GUARD: the slot's "my target is winding up" holds on it (conditions.js
// target_winding_up, the slot's own move only) and the cast takes it (abilities.js targetFor). The hero's own target winding up comes
// first, as it always did; of the guards the nearest to the wearer, ties by id. The wind-up's hero is its caster's target (`target`).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { SIGNATURES } from '../../data/signatures.js';
import { ABILITIES, shells } from '../../data/abilities.js';
import { ITEMS } from '../../data/items.js';
import { cheb } from './grid.js';
import { isMonster, isHero, isAlly } from './sides.js';

const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const sigOf = (u) => (u && own(SIGNATURES, u.signature) ? SIGNATURES[u.signature] : null);
/* the rune family of move `row` (its Chalked rune's, src/data/items.js), or null */
const familyOf = (row) => (row && typeof row.rune === 'string' && own(ITEMS, row.rune) ? ITEMS[row.rune].family || null : null);

/** THE STANDING RAISE hero `u`'s worn Signature lands on its cast of `row`, permille (0 with none: the header). Pure. */
export function castRaiseOf(u, row) {
  const s = sigOf(u), r = s && s.raise;
  if (!r || familyOf(row) !== r.family || (r.of === 'shell' && !shells(row))) return 0;
  return r.pm;
}

/* does `m` hold a live stack of status `id` */
const holds = (m, id) => Array.isArray(m.statuses) && m.statuses.some((st) => st.s === id && st.left > 0);

/**
 * THE GUARD hero `u`'s worn Signature's aim gives its move now (the header): { move, m } with `m` the monster the move answers, or null
 * (no aim, or no such wind-up). `reach(m)`: is monster m in the hero's reach (abilities.js inReach, the caller's). Pure: reads the world,
 * writes nothing.
 */
export function guardOf(inst, u, reach) {
  const s = sigOf(u), a = s && s.aim;
  if (!a || !inst || !inst.world || !own(ABILITIES, a.move)) return null;
  const st = ABILITIES[a.move].status;
  let best = null;
  for (const m of inst.world.units) {
    if (m.alive !== true || !isMonster(m) || !Number.isInteger(m.target) || !m.cast || !(int(m.cast.left) > 0)) continue;
    /* (a mend's cast is placed as kind 'mend', monster-spells.js begin) */
    if (m.cast.kind === 'mend' || (st && holds(m, st)) || !reach(m)) continue;
    const t = inst.world.units.find((x) => x.id === m.target);
    if (!t || t.alive !== true || !isHero(t) || (t !== u && !isAlly(u, t)) || cheb(u, t) > a.r) continue;
    if (!best || cheb(u, m) < cheb(u, best) || (cheb(u, m) === cheb(u, best) && m.id < best.id)) best = m;
  }
  return best ? { move: a.move, m: best } : null;
}
