// ════════════════════════════════════════════════════════════════════════
// src/core/temper-steps.js — TEMPER ON STEPS: what a slot's ranks add, when they open, what they cost (systems, lane/flame-temper-build,
// 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md section 2; the rule is src/data/temper.js TEMPER_STEPS's header).
//
// WHAT THE FIGHT READS. hr_perks_of's `temperSteps` map, { <equip slot>: seated ranks } (the server's: hr_temper_steps_of, only seated
// ranks, empty while the `temper_steps` switch is off), rides the member into heroSnapshot, and src/core/hunt/danger.js gearPartPm adds
// each rank as +ilPerRank item Level on whatever that slot wears. Absent or empty: the gear part is byte for byte what it was.
// WHAT THE SERVER PRICES. Every price below is the twin of the catalogue's SQL (supabase/migrations/1063-flame-temper-catalogue.generated.sql,
// pinned there at the values this file answers): whole milli-hours of wage, times the wage at the worn piece's item Level, ceiled once.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════
import { TEMPER_STEPS } from '../data/temper.js';
import { GEAR_STEPS } from '../data/danger.js';
import { wage } from '../data/wage.js';
import { faceOf } from '../data/trades.js';
import { bandOf } from './trades.js';

const T = TEMPER_STEPS;
const SLOTS = Object.keys(GEAR_STEPS.slotPm);
const RANK_SUM = (T.ranks * (T.ranks + 1)) / 2;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const whole = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** The most ranks a hero of Level `level` may hold on a slot: one every rankEvery Levels, at most `ranks` (21 D-2). */
export function rankCapAt(level) {
  return Math.min(T.ranks, Math.floor(whole(level) / T.rankEvery));
}

/** Rank `rank`'s full price on slot `slot`, in milli-hours of wage: rank / 15 of the slot's full Temper (weapon rank 1: 520). 0 off the table. */
export function rankMilliHours(slot, rank) {
  const r = whole(rank);
  if (!own(GEAR_STEPS.slotPm, slot) || r < 1 || r > T.ranks) return 0;
  return Math.ceil((T.hoursPm * SLOTS.length * GEAR_STEPS.slotPm[slot] * r) / (1000 * RANK_SUM));
}

/**
 * THE QUOTE FOR THE NEXT RANK (hr_temper_rank's twin): rank `rank` on `slot`, the worn piece at item Level `itemLevel`. { fee, kits }:
 * the gold fee (burned) and the Temper Kits, kitSharePm of the hours in kits of kitHoursPm each, the rest in gold at wage(itemLevel).
 */
export function rankQuote(slot, rank, itemLevel) {
  const mh = rankMilliHours(slot, rank);
  if (!mh) return null;
  const w = wage(whole(itemLevel) || 1);
  return {
    fee: Math.ceil((mh * (1000 - T.kitSharePm) * w) / 1000000),
    kits: Math.ceil((mh * T.kitSharePm) / (1000 * T.kitHoursPm)),
  };
}

/** THE TEMPER KIT a rank on a piece of item Level `itemLevel` takes: its band's (src/data/trades.js KIT_FACES temper_kit, the K1 kit trade
    Smithing makes), or null where no band's kit is named (Bronze, and the bands past Dawnsteel until their grounds open): the server refuses
    that rank `kits_owed`, never sells it for gold alone. */
export const temperKitAt = (itemLevel) => faceOf('temper_kit', bandOf(whole(itemLevel)));

/** THE RE-SEAT (hr_temper_seat's twin): carryPm of every held rank's full price at the new item Level, in gold, burned (D-3). */
export function seatPrice(slot, ranks, itemLevel) {
  const n = Math.min(T.ranks, whole(ranks));
  let mh = 0;
  for (let r = 1; r <= n; r++) mh += rankMilliHours(slot, r);
  return mh === 0 ? 0 : Math.ceil((mh * T.carryPm * wage(whole(itemLevel) || 1)) / 1000000);
}

/** The item Levels Temper adds on `slot` (danger.js gearPartPm): the seated ranks the server sent, x ilPerRank. 0 with none. */
export function temperLevelsOn(temperSteps, slot) {
  return temperSteps && own(temperSteps, slot) ? Math.min(T.ranks, whole(temperSteps[slot])) * T.ilPerRank : 0;
}
