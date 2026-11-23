// ============================================================
// src/core/power-ledger.js — THE POWER LEDGER'S CLAMP: every conditional step on a hero, summed by slice and held to the slice's cap
// (systems, lane/ledger-l1-l3, 2026-11-22; docs/design/redesign/19-power-ledger.md sections 1, 2 and 5 L1).
//
// The numbers are src/data/power-ledger.js's (the ramp, the slices) and the gear table's conditionalStepsMax (src/data/gear-steps.js,
// read through src/data/danger.js, its one importer). A LEDGER ROW is one source's steps that hold at this instant:
//   { slice: 'gear' | 'build' | 'consumable' | 'temper', raises: 'offense' | 'defense' | 'heal', steps, key?, scope?: 'self' | 'party', worn? }
//   steps  a gain (> 0) or a cost (< 0), in power steps (DANGER.powerStep)
//   key    no stacking: rows of one key in one slice and channel count the largest gain (and the deepest cost), never both (04 guard 3)
//   scope  'party' with worn false: an ally's party-wide row, counted once a party and IN THE WEARER'S SLICE (19 section 3), so it reaches
//          this hero whole and never takes room in this hero's own cap
// ROWS ARE WRITTEN AT FULL SIZE. In a slice that ramps (what a hero grows into: build, consumable) each row's steps and the cap are x
// ramp(Level) here, once, so no source scales its own number; a slice that does not ramp (gear, Traits, Signatures, Temper: what a hero
// finds, Tyler 2026-11-22) counts whole at every Level.
// THE CLAMP, per slice and per channel (what holds on one blow or one heal at once): the cap is the slice's max (x ramp(Level) if it ramps);
//   gains only (gear, consumable, temper)  min(cap, gains) + costs: costs are never clamped
//   signed (build)                         min(cap, gains + costs): a vow buys past the cap only by paying for it; a net cost stays whole
// The ramp, the caps and the sums are plain arithmetic (no pow): the same bit on every engine.
//
// THE ENGINE READS IT through ledgerSteps (src/core/hunt/danger.js powerPm): a unit's `ledger` rows, its `heroLv` the Level. No source
// writes a row yet (Traits wave 4, talents L8, Temper on steps L11, imbuements wave 4), so every hunt reads 0 today: it lands dark.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { LEDGER_SLICES, ramp } from '../data/power-ledger.js';
import { GEAR_STEPS } from '../data/danger.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const CHANNELS = Object.freeze(['offense', 'defense', 'heal']);

/* the share of its full size a slice counts at hero Level `level`: ramp(L) if it ramps, else whole */
const shareOf = (slice, level) => (LEDGER_SLICES[slice].ramps ? ramp(level) : 1);

/** The cap of slice `slice` at hero Level `level`, in steps: its max, x ramp(L) if the slice ramps. 0 for no such slice. */
export function sliceCap(slice, level) {
  if (!own(LEDGER_SLICES, slice)) return 0;
  const s = LEDGER_SLICES[slice];
  if (s.open === false) return 0;
  const max = s.max === null ? GEAR_STEPS.conditionalStepsMax : s.max;
  return max * shareOf(slice, level);
}

/**
 * THE CLAMPED STEPS of a hero's ledger rows at Level `level`: { offense, defense, heal }, each a number of steps (a fraction is kept:
 * the reader rounds once). A row of no known slice or channel, or of steps that is no finite number, counts nothing.
 */
export function clampLedger(rows, level) {
  const out = { offense: 0, defense: 0, heal: 0 };
  if (!Array.isArray(rows) || rows.length === 0) return out;
  /* slice -> channel -> { mine: key -> [gain, cost], ally: key -> gain }: one key counts its largest gain and its deepest cost */
  const by = new Map();
  rows.forEach((r, i) => {
    if (!r || !own(LEDGER_SLICES, r.slice) || !CHANNELS.includes(r.raises) || !Number.isFinite(r.steps) || r.steps === 0) return;
    const key = typeof r.key === 'string' && r.key ? r.key : '#' + i;
    const ally = r.scope === 'party' && r.worn === false;
    let sl = by.get(r.slice);
    if (!sl) by.set(r.slice, (sl = new Map()));
    let ch = sl.get(r.raises);
    if (!ch) sl.set(r.raises, (ch = { mine: new Map(), ally: new Map() }));
    if (ally) { if (r.steps > 0) ch.ally.set(key, Math.max(ch.ally.get(key) || 0, r.steps)); return; }
    const kv = ch.mine.get(key) || [0, 0];
    if (r.steps > 0) kv[0] = Math.max(kv[0], r.steps); else kv[1] = Math.min(kv[1], r.steps);
    ch.mine.set(key, kv);
  });
  for (const [slice, sl] of by) {
    const cap = sliceCap(slice, level), signed = LEDGER_SLICES[slice].signed, k = shareOf(slice, level);
    for (const [channel, ch] of sl) {
      let gains = 0, costs = 0;
      for (const [key, [g, c]] of ch.mine) { if (!ch.ally.has(key)) gains += g; costs += c; }
      /* a key both worn here and lent by an ally counts once: the larger, the ally's whole when it is the larger */
      let lent = 0;
      for (const [key, g] of ch.ally) {
        const mine = ch.mine.has(key) ? ch.mine.get(key)[0] : 0;
        if (g > mine) lent += g; else gains += mine;
      }
      gains *= k; costs *= k; lent *= k;
      out[channel] += (signed ? Math.min(cap, gains + costs) : Math.min(cap, gains) + costs) + lent;
    }
  }
  return out;
}

/** A unit's clamped steps in one channel (src/core/hunt/danger.js powerPm): its `ledger` rows, and `extra` rows that hold on it now (the
    party's auras, src/core/hunt/auras.js), at its `heroLv`. 0 with no rows. */
export function ledgerSteps(unit, channel, extra) {
  const own = unit && Array.isArray(unit.ledger) ? unit.ledger : [];
  const rows = Array.isArray(extra) && extra.length ? own.concat(extra) : own;
  if (!unit || rows.length === 0) return 0;
  return clampLedger(rows, unit.heroLv)[channel] || 0;
}
