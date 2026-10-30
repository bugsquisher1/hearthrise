// ============================================================
// src/core/hunt/consumables.js — FOOD AND DRINK (spec §3.4; parity CO-01..CO-08)
//
// One sub-step hook, `consume(inst, sc)`, for every living hero:
//   1. its over-time halves tick (one tick a CONSUMABLE_RULES.overTimeTickMs);
//   2. while the ONE food-and-drink lane is locked, nothing more;
//   3. its consume SLOTS are walked in order (conditions.js): the first whose
//      conditions pass, that has something to restore (HP below max for food,
//      mana below max for a drink) and something to use fires. When to eat or
//      drink is ONLY the slot's own conditions (Tyler 2026-10-23: the eat-at /
//      drink-at settings are retired; a new slot starts with them written on it).
// Food restores HP and drink restores mana, never both (no potions). Each use
// lands instantPct now and the rest over overTimeMs, in whole ticks; the last
// tick carries the remainder, so a use restores exactly its amount (capped at
// the pool's max as it lands).
//
// ALWAYS FIRES (Tyler 2026-10-19): a food or drink slot whose conditions pass
// fires whenever the ONE shared 2 s cooldown (laneMs) is free — nothing else
// holds it (no wait for a running over-time half, no wait after an ability
// heal). Its instant half always lands; its over-time half REPLACES what is
// left of the same pool's (never stacked). FOOD STANDS BEFORE DRINK in the start
// kit's bar (start-kit.js START_BAR): a drink that always fires would otherwise
// take every cooldown while mana stays low and starve food. A player's own bar
// keeps the player's order, with ONE yield
// (Andy live 10-21, "foods usable while the regen potion is ticking"): while a
// drink's over-time half is still landing, a matching FOOD slot goes before
// the drink slots. A drink re-fired mid-tick only replaces what was still
// coming, so it must not hold the shared cooldown from a hero who needs to eat.
//
// EVERY HP POINT FOOD RESTORES IS A `heal` EVENT (u = t = the eater, `item` =
// the food): the instant half, and each over-time tick that landed. The
// analyzer's healed total (tally.js) is the sum of `heal` events, so it equals
// the HP food actually restored (it read 0 for every food before this).
//
// SUPPLY. A slot names ONE item (Tyler 2026-10-21, designer-confirmed): a crafted
// food or drink comes from the hero's own stack only (none left, the slot is out of
// stock and the next slot fires), a store food or drink is bought per use at the
// server catalogue's price (`resolveLine`, src/core/action-rules.js); a store use the
// purse cannot pay marks the session goldOut (the hunt ends gold_out). A hero
// with nothing to eat simply keeps fighting: running out never stops a hunt.
//
// INJECTED, never read from a global: `inst.heroes[unitId]` (from the settle's
// swingCtx.heroes) = { hs, slots } — `hs` is that
// member's hunt session (bag, shop, purse, tally; the server's rows). A hero
// with no entry has no supplies and eats nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { CONSUMABLE_RULES as R, CONSUMABLE_KINDS, CONSUMABLES } from '../../data/consumables.js?v=0.2.74';
import { slotsFor, pickSlot } from './conditions.js?v=0.2.74';
import { resolveLine, takeLine, lineAmount } from '../action-rules.js?v=0.2.74';
import { makeEvent } from './events.js?v=0.2.74';

/* An over-time half is [left, nextTickAtMs, ticksLeft, itemId], or null. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['laneAt', 'int'], ['otHp', 'json'], ['otMana', 'json']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const OT_KEY = Object.freeze({ hp: 'otHp', mana: 'otMana' });
const MAX_OF = Object.freeze({ hp: 'maxHp', mana: 'maxMana' });
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };

/* Raise `stat` by `n`, never past its max; answers what landed. */
function raise(u, stat, n) {
  const before = int(u[stat]);
  u[stat] = Math.min(int(u[MAX_OF[stat]]), before + Math.max(0, n));
  if (u[stat] < before) u[stat] = before;
  return u[stat] - before;
}

/* The `heal` event of HP food restored (none when nothing landed). */
function healed(u, landed, item, sc) {
  if (landed > 0) sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: u.id, amount: landed, item: String(item || 'food') }));
}

/** Tick `unit`'s over-time halves due at `sc.atMs`. */
function tickOverTime(u, sc) {
  for (const stat of ['hp', 'mana']) {
    const k = OT_KEY[stat];
    const ot = u[k];
    if (!Array.isArray(ot)) continue;
    let [left, at, n] = ot;
    const item = ot[3];
    while (n > 0 && sc.atMs >= at) {
      const part = n === 1 ? left : Math.floor(left / n);
      const landed = raise(u, stat, part);
      if (stat === 'hp') healed(u, landed, item, sc);
      left -= part; n -= 1; at += R.overTimeTickMs;
    }
    u[k] = n > 0 ? [left, at, n, ...(item === undefined ? [] : [item])] : null;
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
  /* REPLACES the pool's running over-time half (never stacks with it). */
  u[OT_KEY[stat]] = later > 0 ? [later, sc.atMs + R.overTimeTickMs, ticks, line.id] : null;
  u.laneAt = sc.atMs + R.laneMs;
  sc.emit(makeEvent(kind === 'drink' ? 'drink' : 'eat', sc.atMs,
    { u: u.id, item: line.id, source: line.source, gold: line.price, amount, landed,
      ...(d && typeof d.rule === 'string' ? { rule: d.rule, rule_label: d.label, pass: d.mask } : {}) }));
  if (stat === 'hp') healed(u, landed, line.id, sc);
  /* The hero's own stack just ran out: say so, and which slot takes over (a server commit's event). */
  if (line.source === 'own' && !(int(((hero.hs.bag || {})[line.id] || {}).left) > 0)) {
    const next = takeover(hero, kind, line.id);
    sc.emit(makeEvent('slot_dry', sc.atMs, { u: u.id, item: line.id, next: next ? next.item : null, slot: next ? next.slot : null }));
  }
  return true;
}

/* The kind ('food' | 'drink') of the ONE item a consume slot names, or null. */
const kindOfAction = (id) => (Object.prototype.hasOwnProperty.call(CONSUMABLES, id) ? CONSUMABLES[id].kind : null);

/* What a consume slot's item would use now (its conditions already passed), or why
   not (Tyler 2026-10-21, designer-confirmed): a crafted item from the hero's own
   stack only (none left: the slot is struck and the next slot is tried), a store
   item bought per use. The player builds the fallback by slot order. */
function slotWants(u, hero, action) {
  const kind = kindOfAction(action.id);
  if (!kind) return { why: 'none' };
  /* NOTHING TO RESTORE, NOTHING EATEN: a slot with no conditions fires whenever it is ready (conditions.js),
     and a food at full HP (a drink at full mana) is not ready — it would only throw the use away. */
  const stat = CONSUMABLE_KINDS[kind].stat;
  if (int(u[stat]) >= int(u[MAX_OF[stat]])) return null;
  const line = resolveLine(hero.hs, action.id);
  return line.id && !line.why ? { kind, line } : Object.assign({ kind }, line);
}

/* WHO TAKES OVER when an own stack runs dry (Tyler 2026-10-21: "Cooked Shrimp ran out:
   slot 2 (Salted Shrimp) takes over"): the first slot, in bar order, of the same kind
   that names another item and can still supply it. { item, slot } (slot 1-based) or null. */
function takeover(hero, kind, item) {
  for (const r of slotsFor(hero, 'consume')) {
    const id = r.slot.action.id;
    if (id === item || kindOfAction(id) !== kind) continue;
    const w = resolveLine(hero.hs, id);
    if (w.id && !w.why) return { item: id, slot: Number.isInteger(r.at) ? r.at + 1 : null };
  }
  return null;
}

/* THE ONE YIELD: while the hero's drink is still landing (its over-time half
   ticks), its FOOD slots stand before its drink slots; otherwise bar order. */
function consumeOrder(u, rows) {
  if (!Array.isArray(u.otMana)) return rows;
  const drink = (r) => kindOfAction(r.slot.action.id) === 'drink';
  return rows.filter((r) => !drink(r)).concat(rows.filter(drink));
}

/**
 * Consumable hook: while the ONE food-and-drink lane is free, each hero walks its
 * consume slots in order (conditions.js; no hidden default: a slot's own conditions)
 * and uses the first whose conditions pass and that has something to restore and to use.
 */
export function consume(inst, sc) {
  const heroes = inst.heroes || null;
  for (const u of inst.world.units) {
    if (u.side !== 'hero' || !u.alive) continue;
    tickOverTime(u, sc);
    if (int(u.laneAt) > sc.atMs) continue;
    const hero = heroes && heroes[u.id];
    if (!hero || !hero.hs) continue;
    let starved = false;
    const got = pickSlot(inst, u, hero, consumeOrder(u, slotsFor(hero, 'consume')), (slot) => {
      const w = slotWants(u, hero, slot.action);
      if (!w) return null;   // nothing to restore: not ready, and no wait to report
      if (w.why === 'gold_short') { if (w.kind === 'food') starved = true; return { why: 'gold_short' }; }
      if (w.line) return w;
      return { why: 'no_stock' };
    }, sc, 'consume');
    if (got) use(u, hero, got.pick.kind, got.pick.line, sc, got);
    /* A FOOD the purse cannot buy ends the hunt gold_out (a hero cannot heal), but only
       when NO slot could feed the hero instead: a later slot in the player's order (a
       cheaper store food, an own stack) still eats. A DRINK it cannot buy only goes
       without (mana feeds abilities, a basic swing needs none): a hunt never stops for
       a drink (spec §3.4 #7). */
    else if (starved) hero.hs.goldOut = true;
  }
}
