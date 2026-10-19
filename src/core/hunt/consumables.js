// ============================================================
// src/core/hunt/consumables.js — FOOD AND DRINK (spec §3.4; parity CO-01..CO-08)
//
// One sub-step hook, `consume(inst, sc)`, for every living hero:
//   1. its over-time halves tick (one tick a CONSUMABLE_RULES.overTimeTickMs);
//   2. while the ONE food-and-drink lane is locked, nothing more;
//   3. its consume SLOTS are walked in order (conditions.js): the first whose
//      conditions pass and that has something to use fires. With no consume
//      slot on its bar the defaults stand: drink under drink_below_pct, then
//      eat under food_below_pct (the eat-at / drink-at options ARE these slots'
//      values: one system). A drink waits while one still ticks; food also
//      waits noHealWindowMs after a heal landed.
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
// swingCtx.heroes) = { hs, slots, foodBelowPct, drinkBelowPct } — `hs` is that
// member's hunt session (bag, shop, purse, tally; the server's rows). A hero
// with no entry has no supplies and eats nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { CONSUMABLE_RULES as R, CONSUMABLE_KINDS, CONSUMABLES } from '../../data/consumables.js?v=0.2.8';
import { CONSUME_KINDS } from '../../data/condition-metrics.js?v=0.2.8';
import { slotsFor, pickSlot } from './conditions.js?v=0.2.8';
import { resolveLine, takeLine, lineAmount } from '../action-rules.js?v=0.2.8';
import { makeEvent } from './events.js?v=0.2.8';

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

/* Use one line: pay for it, land the instant half, queue the rest. `d` is the
   decision (its rule id and the conditions that passed). */
function use(u, hero, kind, line, sc, d) {
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
    { u: u.id, item: line.id, source: line.source, gold: line.price, amount, landed,
      ...(d && typeof d.rule === 'string' ? { rule: d.rule, rule_label: d.label, pass: d.mask } : {}) }));
  return true;
}

/* What a consume slot's action would use now (its conditions already passed), or
   why not. `id` is a KIND ('food' | 'drink': the best line of it, own first, then
   the store) or one own item (its own stack only: none left falls back). */
function slotWants(u, hero, id, atMs) {
  const kind = CONSUME_KINDS[id] ? id : (CONSUMABLES[id] ? CONSUMABLES[id].kind : null);
  if (!kind) return { why: 'none' };
  const stat = CONSUMABLE_KINDS[kind].stat;
  if (u[OT_KEY[stat]]) return { kind, why: 'ticking' };
  if (kind === 'food' && u.healedAt !== null && u.healedAt !== undefined && atMs - u.healedAt <= R.noHealWindowMs) return { kind, why: 'healed' };
  if (!CONSUME_KINDS[id]) {
    const l = hero.hs.bag && hero.hs.bag[id];
    return l && int(l.left) > 0 ? { kind, line: { id, source: 'own', price: 0 } } : { kind, why: 'none' };
  }
  const line = resolveLine(hero.hs, CONSUMABLE_KINDS[kind].supply, int(u[MAX_OF[stat]]) - int(u[stat]));
  return line.id && !line.why ? { kind, line } : Object.assign({ kind }, line);
}

/**
 * Consumable hook: while the ONE food-and-drink lane is free, each hero walks its
 * consume slots in order (conditions.js; its defaults are drink-at, then eat-at)
 * and uses the first whose conditions pass and that has something to use.
 */
export function consume(inst, sc) {
  const heroes = inst.heroes || null;
  for (const u of inst.world.units) {
    if (u.side !== 'hero' || !u.alive) continue;
    tickOverTime(u, sc.atMs);
    if (int(u.laneAt) > sc.atMs) continue;
    const hero = heroes && heroes[u.id];
    if (!hero || !hero.hs) continue;
    const got = pickSlot(inst, u, hero, slotsFor(hero, 'consume'), (slot) => {
      const w = slotWants(u, hero, slot.action.id, sc.atMs);
      /* A FOOD the purse cannot buy ends the hunt gold_out (a hero cannot heal);
         a DRINK it cannot buy only goes without (mana feeds abilities, and a basic
         swing needs none): a hunt never stops for a drink (spec §3.4 #7). */
      if (w.why === 'gold_short') { if (w.kind === 'food') hero.hs.goldOut = true; return { why: 'gold_short' }; }
      if (w.line) return w;
      return { why: w.why === 'ticking' || w.why === 'healed' ? 'busy' : 'no_stock' };
    }, sc, 'consume');
    if (got) use(u, hero, got.pick.kind, got.pick.line, sc, got);
  }
}
