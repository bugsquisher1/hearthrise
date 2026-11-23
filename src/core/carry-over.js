// ════════════════════════════════════════════════════════════════════════
// src/core/carry-over.js — CARRY-OVER'S RULE AND QUOTE (systems, lane/flame-temper-build, 2026-11-22; 21-flame-temper-imbue-loot.md
// section 2.3; the levers are src/data/gear-steps.js CARRY, read through src/data/danger.js).
//
// A PIECE here is the trait_pieces row's shape (12-targets section 8, wave 4): { slot, tier, rarity, traits: [{ id, rank }], signature,
// escrow }. The server's job (hr_carry_over, owed with trait_pieces) reads both pieces from its own rows, never the client's, and asks
// this rule's SQL twin (hr_carry_fee, supabase/migrations/1063-flame-temper-catalogue.generated.sql) for the gold.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Nothing rolls: no failure, no reroll (02 package 2).
// ════════════════════════════════════════════════════════════════════════
import { GEAR_STEPS, CARRY, TRAITS } from '../data/danger.js';
import { wage } from '../data/wage.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** The fee in whole gold for Traits worth `steps` (the sum of their traitSteps) onto a base of item Level `itemLevel`, burned. */
export function carryFee(steps, itemLevel) {
  const s = Math.max(0, Math.floor(Number(steps) || 0));
  return s === 0 ? 0 : Math.ceil((s * CARRY.hoursPerStepPm * wage(Math.max(1, Math.floor(Number(itemLevel) || 1)))) / 1000);
}

/**
 * Can `from`'s Traits move onto `to`, and at what price? { ok: false, why } with the server's refusal word, or
 * { ok: true, parts: { <ground>: count }, steps, fee, workPm }. `to.itemLevel` prices the fee (the new base's item Level).
 */
export function carryQuote(from, to) {
  const f = from || {}, t = to || {};
  const traits = Array.isArray(f.traits) ? f.traits : [];
  if (f.signature) return { ok: false, why: 'signature' };
  if (f.escrow || t.escrow) return { ok: false, why: 'escrowed' };
  if (traits.length === 0) return { ok: false, why: 'no_trait' };
  if (Array.isArray(t.traits) && t.traits.length > 0) return { ok: false, why: 'not_plain' };
  if (GEAR_STEPS.carryOver.slot === 'same' && f.slot !== t.slot) return { ok: false, why: 'wrong_slot' };
  if (!(Number.isInteger(f.tier) && Number.isInteger(t.tier)) || t.tier - f.tier < GEAR_STEPS.carryOver.tierMin) return { ok: false, why: 'lower_tier' };
  const parts = {};
  let steps = 0;
  for (const tr of traits) {
    const row = tr && own(TRAITS, tr.id) ? TRAITS[tr.id] : null;
    const rank = tr ? Math.floor(Number(tr.rank)) : 0;
    if (!row || !(rank >= 1 && rank <= GEAR_STEPS.traitSteps.length)) return { ok: false, why: 'bad_trait' };
    parts[row.source] = (parts[row.source] || 0) + CARRY.partsBase + rank;
    steps += GEAR_STEPS.traitSteps[rank - 1];
  }
  return { ok: true, parts, steps, fee: carryFee(steps, t.itemLevel), workPm: CARRY.workPm };
}
