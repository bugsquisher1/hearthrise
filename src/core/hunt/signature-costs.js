// ============================================================
// src/core/hunt/signature-costs.js — WHAT A WORN SIGNATURE CHANGES ABOUT WHAT ITS HERO PAYS: a cast's cost and a saved shot (systems,
// lane/signatures-batch-4, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Batch 4: what is left, and the pieces it needs",
// P2 and P3; the rows are src/data/signatures.js `costs` and `saves: { ammo }`). The rune a Signature saves (`saves: { family }`, #25) is
// abilities.js fire's own, beside this.
//
// A CAST'S COST (P2, `costs`: Ledger Ring, Lychgate Leggings, Pyre Priest's Hood): on a cast of its kind that costs mana, the Signature
// sets what the cast pays instead of its mana:
//   of     'spell' a cast that spends a rune (runes fuel spells only, Tyler 2026-10-15), 'heal' a cast that heals (abilities.js heals)
//   pay    'none' the cast pays no mana; 'hp' it pays health instead, 1 a mana, straight off its own HP (never a shell's, never under
//          1 HP and never a kill: a cast that would leave the hero under 1 HP pays its mana as written)
//   every  only the every-th cast of its kind (the count on the hero's cooldowns, '~n:<id>': "a ledger counts", no dice)
//   aboveHpPm   only while the hero's health is over that share of its max
//   belowManaPm + ms + clockMs   a window: a cast of its kind begun under that share of max mana opens `ms` in which every cast of its
//          kind pays the Signature's way ('~w:<id>', its end), at most once a `clockMs` ('~r:<id>'), the cast that opens it the first
// The counts, the window and the clock are on the cooldowns, persisted with them, so a settle cut anywhere resumes the same costs.
// The mana not paid is a supply not bought: a drink the hero never needs. No money moves (13 N-14).
//
// A SAVED SHOT (P3, `saves: { ammo: true, every, hit: true }`: Brood Bracers, "every fifth arrow that hits costs no arrow"): the hero's
// basic shots that land are counted on its cooldowns ('~n:<id>', 0..every); at the every-th the count holds `every`, a CREDIT, and the next
// basic shot that would take an arrow (its own, or one bought from the store) takes none from the bag and buys none, the count back to 0.
// One arrow saved a run of `every` landed shots, as the row reads, with no dice and no arrow ever put in a bag (a refund of nothing,
// never a mint: 13 N-14). The free rung (ammoPerShot 0) never spends the credit: it takes no arrow anyway.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { SIGNATURES } from '../../data/signatures.js';
import { heals } from '../../data/abilities.js';

const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const readyAt = (o, k) => (o && typeof o === 'object' && Number.isInteger(o[k]) ? o[k] : 0);
const sigOf = (u) => (u && own(SIGNATURES, u.signature) ? SIGNATURES[u.signature] : null);

/* is `row` of the kind a `costs` reads (the header) */
const ofKind = (of, row) => !!row && (of === 'spell' ? typeof row.rune === 'string' && !!row.rune : of === 'heal' ? heals(row) : false);

/**
 * WHAT HERO `u`'s CAST OF `row` PAYS AT `atMs`, its mana as written being `mana`: null when its worn Signature has no `costs` for it (the
 * cast pays its mana), else { mana, hp, writes } (the mana and the health it pays, and the cooldown keys the cast writes when it fires).
 * Pure: reads the hero's mana, health and cooldowns, writes nothing.
 */
export function castCostOf(u, row, mana, atMs) {
  const s = sigOf(u);
  const c = s && s.costs;
  if (!c || !(mana > 0) || !ofKind(c.of, row)) return null;
  const writes = {};
  let paysOther = true;
  if (c.every) {
    const key = '~n:' + s.id, n = (readyAt(u.cds, key) + 1) % c.every;
    writes[key] = n;
    if (n !== 0) paysOther = false;
  }
  if (c.aboveHpPm !== undefined && !(int(u.hp) * 1000 > c.aboveHpPm * int(u.maxHp))) paysOther = false;
  if (c.belowManaPm !== undefined) {
    const open = readyAt(u.cds, '~w:' + s.id) > atMs;
    if (!open) {
      const opens = int(u.mana) * 1000 < c.belowManaPm * int(u.maxMana) && !(readyAt(u.cds, '~r:' + s.id) > atMs);
      if (opens) { writes['~w:' + s.id] = atMs + c.ms; writes['~r:' + s.id] = atMs + c.clockMs; } else paysOther = false;
    }
  }
  if (!paysOther) return Object.keys(writes).length ? { mana, hp: 0, writes } : null;
  if (c.pay === 'none') return { mana: 0, hp: 0, writes };
  /* health for mana, 1 a mana, never under 1 HP: a cast that cannot pay it so pays its mana */
  if (c.pay === 'hp') return int(u.hp) - mana >= 1 ? { mana: 0, hp: mana, writes } : Object.keys(writes).length ? { mana, hp: 0, writes } : null;
  return null;
}

/** The saved shot hero `u`'s worn Signature keeps ({ id, every }), or null (none, or a Signature that saves no arrow). */
export function shotSaveOf(u) {
  const s = sigOf(u);
  return s && s.saves && s.saves.ammo === true ? { id: s.id, every: s.saves.every } : null;
}

/** Does hero `u` hold a saved shot's credit now (its count at `every`): its next arrow is taken from nowhere. */
export function shotCredit(u) {
  const s = shotSaveOf(u);
  return !!s && readyAt(u.cds, '~n:' + s.id) >= s.every;
}

/** THE COUNT AFTER A BASIC SHOT (damage.js resolveAttacks): a shot that spent the credit sets it back to 0 (`spent`), a shot that landed
    counts one, never past `every` (the credit waits for the next arrow). Writes the hero's cooldowns; nothing for a hero with none. */
export function noteShot(u, spent, landed) {
  const s = shotSaveOf(u);
  if (!s) return;
  const key = '~n:' + s.id;
  let n = spent ? 0 : readyAt(u.cds, key);
  if (landed && n < s.every) n += 1;
  if (n !== readyAt(u.cds, key)) u.cds = Object.assign({}, u.cds || {}, { [key]: n });
}
