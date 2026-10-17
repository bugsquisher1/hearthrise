// ============================================================
// src/core/hunt/consumables.js — FOOD AND DRINK (spec §3.4; parity CO-01..CO-08)
//
// One sub-step hook, `consume(inst, sc)`, for every living hero:
//   1. its over-time halves tick (one tick a CONSUMABLE_RULES.overTimeTickMs);
//   2. while the ONE food-and-drink lane is locked, nothing more;
//   3. under the drink threshold (and no drink still ticking) it DRINKS;
//   4. else under the food threshold, with no heal in the last noHealWindowMs
//      (and no food still ticking), it EATS.
// Food restores HP and drink restores mana, never both (no potions). Each use
// lands instantPct now and the rest over overTimeMs, in whole ticks; the last
// tick carries the remainder, so a use restores exactly its amount (capped at
// the pool's max as it lands).
//
// SUPPLY. Each hero's line comes from `resolveLine` (src/core/action-rules.js,
// the one resolver): its own carried stack first, free; then the store row for
// the hunt's tier at store price, on the player's choice; a store use the
// purse cannot pay marks the session goldOut (the hunt ends gold_out). A hero
// with nothing to eat simply keeps fighting: running out never stops a hunt.
//
// INJECTED, never read from a global: `inst.heroes[unitId]` (from the settle's
// swingCtx.heroes) = { hs, foodBelowPct, drinkBelowPct } — `hs` is that
// member's hunt session (bag, shop, purse, tally; the server's rows). A hero
// with no entry has no supplies and eats nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { CONSUMABLE_RULES as R, CONSUMABLE_KINDS } from '../../data/consumables.js?v=589';
import { resolveLine, takeLine, lineAmount } from '../action-rules.js?v=589';
import { makeEvent } from './events.js?v=589';

/* An over-time half is [left, nextTickAtMs, ticksLeft] (integers), or null. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['laneAt', 'int'], ['otHp', 'json'], ['otMana', 'json'], ['healedAt', 'int?']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const OT_KEY = Object.freeze({ hp: 'otHp', mana: 'otMana' });
const MAX_OF = Object.freeze({ hp: 'maxHp', mana: 'maxMana' });
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };

/** Stamp a heal landing on `unit` (abilities.js calls it; food waits noHealWindowMs after one). */
export function markHealed(unit, atMs) { unit.healedAt = atMs; }

/* Raise `stat` by `n`, never past its max; answers what landed. */
function raise(u, stat, n) {
  const before = int(u[stat]);
  u[stat] = Math.min(int(u[MAX_OF[stat]]), before + Math.max(0, n));
  if (u[stat] < before) u[stat] = before;
  return u[stat] - before;
}

/** Tick `unit`'s over-time halves due at `atMs`. */
function tickOverTime(u, atMs) {
  for (const stat of ['hp', 'mana']) {
    const k = OT_KEY[stat];
    const ot = u[k];
    if (!Array.isArray(ot)) continue;
    let [left, at, n] = ot;
    while (n > 0 && atMs >= at) {
      const part = n === 1 ? left : Math.floor(left / n);
      raise(u, stat, part);
      left -= part; n -= 1; at += R.overTimeTickMs;
    }
    u[k] = n > 0 ? [left, at, n] : null;
  }
}

/* Is `u` under `pct` percent of its `stat`? Integer compare, no floats. */
const under = (u, stat, pct) => int(u[MAX_OF[stat]]) > 0 && int(u[stat]) * 100 < pct * int(u[MAX_OF[stat]]);
const pctOf = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : d);

/**
 * One food-or-drink decision for one hero at `atMs`: what it would use, or why
 * not. Pure: mutates nothing. `kind` is 'drink' or 'food'.
 */
export function wants(u, hero, kind, atMs) {
  const stat = CONSUMABLE_KINDS[kind].stat;
  if (u[OT_KEY[stat]]) return { why: 'ticking' };
  const below = kind === 'drink' ? pctOf(hero.drinkBelowPct, R.drinkBelowPct) : pctOf(hero.foodBelowPct, R.foodBelowPct);
  if (!under(u, stat, below)) return { why: 'above' };
  if (kind === 'food' && u.healedAt !== null && u.healedAt !== undefined && atMs - u.healedAt <= R.noHealWindowMs) return { why: 'healed' };
  const line = resolveLine(hero.hs, CONSUMABLE_KINDS[kind].supply, int(u[MAX_OF[stat]]) - int(u[stat]));
  return line.id && !line.why ? { line } : line;
}

/* Use one line: pay for it, land the instant half, queue the rest. */
function use(u, hero, kind, line, sc) {
  if (!takeLine(hero.hs, line, sc.atMs)) return false;
  const stat = CONSUMABLE_KINDS[kind].stat;
  const amount = lineAmount(hero.hs, line);
  const now = Math.floor((amount * R.instantPct) / 100);
  const landed = raise(u, stat, now);
  const later = amount - now;
  const ticks = R.overTimeMs / R.overTimeTickMs;
  u[OT_KEY[stat]] = later > 0 ? [later, sc.atMs + R.overTimeTickMs, ticks] : null;
  u.laneAt = sc.atMs + R.laneMs;
  sc.emit(makeEvent(kind === 'drink' ? 'drink' : 'eat', sc.atMs,
    { u: u.id, item: line.id, source: line.source, gold: line.price, amount, landed }));
  return true;
}

/** Consumable hook: each hero eats or drinks by its thresholds; own stock first, then the store. */
export function consume(inst, sc) {
  const heroes = inst.heroes || null;
  for (const u of inst.world.units) {
    if (u.side !== 'hero' || !u.alive) continue;
    tickOverTime(u, sc.atMs);
    if (int(u.laneAt) > sc.atMs) continue;
    const hero = heroes && heroes[u.id];
    if (!hero || !hero.hs) continue;
    /* Drink first (spec §3.4 #4), then food; one use per lane. */
    for (const kind of ['drink', 'food']) {
      const w = wants(u, hero, kind, sc.atMs);
      if (w.why === 'gold_short') { hero.hs.goldOut = true; continue; }
      if (w.line && use(u, hero, kind, w.line, sc)) break;
    }
  }
}
