// ============================================================
// src/core/hunt/abilities.js — THE ACTION BAR (spec §2 abilities; parity AB-01..AB-17)
//
// Hunts are idle (Tyler 2026-10-16): there is no press path. Each sub-step,
// every living hero in a fight regenerates mana, then fires the FIRST usable
// ability in its bar order (AB-10). An ability is usable when:
//   it is active and its action set does not skip it (AB-11),
//   its own cooldown and its lane are ready (AB-01/02),
//   the hero has the mana (AB-12), its rune and its shots resolve — own line
//   first, then the store (AB-05/06, src/core/action-rules.js resolveLine),
//   and its target rule finds a target (AB-03).
// Firing spends the mana, the rune and the shots, sets the cooldown and the
// lane (AB-07), and applies the effect (AB-08): taunt, mark, hit (with a status
// per hit, H3), area (+ vulnerability), cleave, shield, ally heal, party heal.
// A heal is capped at the missing HP and stamps healedAt (AB-09).
//
// SEAMS to the other core lanes, called through their agreed signatures only:
// damage.hurt (H2) for every hit, status.applyStatus (H3) for a status, and
// the fields damage.js reads: `markBy`/`markUntil`, `vulnUntil`, `shield`.
// Magic XP is H5's: each `cast` event carries `mana` and `magicXpMult`.
//
// INJECTED: `inst.heroes[unitId]` = { hs, bar: [abilityId…], actionSet,
// range (tiles; 1 = Melee), ammo (the loaded ammo item id) }. A hero with no
// entry fires nothing. Draws: the swing's stream `sc.rng`, heroes in id order,
// one `int` per hit roll (spec §1.1 #3).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ABILITIES, ABILITY_LANES, ABILITY_RULES, ACTION_SET_SKIPS } from '../../data/abilities.js?v=590';
import { resolveLine, takeLine, canAfford, shopShotFor } from '../action-rules.js?v=590';
import { cheb, dist2, los } from './grid.js?v=590';
import { makeEvent } from './events.js?v=590';
import { hurt } from './damage.js?v=590';
import { applyStatus } from './status.js?v=590';
import { markHealed } from './consumables.js?v=590';

export const PERSISTED = Object.freeze({
  unit: Object.freeze([['mana', 'int'], ['maxMana', 'int'], ['manaMilli', 'int'], ['lanes', 'json'], ['cds', 'json'],
    ['shield', 'int'], ['markBy', 'int?'], ['markUntil', 'int'], ['vulnUntil', 'int']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const readyAt = (o, k) => (o && typeof o === 'object' && Number.isInteger(o[k]) ? o[k] : 0);
const living = (inst, side) => inst.world.units.filter((u) => u.side === side && u.alive);
/* A monster is in the fight once it holds a target. */
const engaged = (inst) => living(inst, 'mon').filter((m) => m.target !== null && m.target !== undefined);

/** In reach: Melee (range 1) is adjacent; ranged is within `range` tiles with line of sight. */
export function inReach(inst, hero, range, t) {
  const r = Math.max(1, int(range) || 1);
  if (r <= 1) return cheb(hero, t) <= 1;
  return dist2(hero, t) <= r * r && los(inst.grid, hero, t);
}

/* Order candidates: the hero's own target first, then nearest, then id. */
const byPreference = (hero) => (a, b) => ((b.id === hero.target) - (a.id === hero.target))
  || (dist2(a, hero) - dist2(b, hero)) || (a.id - b.id);

/* The target an ability would take now, or null (AB-03). Pure. */
function targetFor(inst, hero, h, row, sc) {
  const mons = engaged(inst);
  const near = mons.filter((m) => inReach(inst, hero, h.range, m)).sort(byPreference(hero));
  const pct = (u) => (int(u.maxHp) > 0 ? (int(u.hp) * 100) / int(u.maxHp) : 100);
  switch (row.target) {
    case 'taunt': return mons.some((m) => m.target !== hero.id) ? hero : null;
    case 'mark': {
      const t = near.slice().sort((a, b) => (int(b.hp) - int(a.hp)) || (a.id - b.id))[0];
      return t && !(t.markUntil > sc.atMs) ? t : null;
    }
    case 'enemy': case 'cleave': return near[0] || null;
    case 'area': {
      const around = (c) => mons.filter((o) => cheb(o, c) <= 1).length;
      const c = near.slice().sort((a, b) => (around(b) - around(a)) || (a.id - b.id))[0];
      return c && around(c) >= ABILITY_RULES.areaMin ? c : null;
    }
    case 'self': return pct(hero) < row.whenBelowPct && !(int(hero.shield) > 0) ? hero : null;
    case 'ally': return living(inst, 'hero').filter((a) => pct(a) < row.whenBelowPct && (a === hero || inReach(inst, hero, h.range, a)))
      .sort((a, b) => (pct(a) - pct(b)) || (a.id - b.id))[0] || null;
    case 'party': return living(inst, 'hero').filter((a) => pct(a) < row.whenBelowPct).length >= row.minHurt ? hero : null;
    default: return null;
  }
}

/* The supply lines one cast needs, or the reason it cannot have them. */
function suppliesFor(h, row) {
  const lines = [];
  if (row.rune) {
    const l = resolveLine(h.hs, row.rune, 1);
    if (!l.id || l.why) return { why: 'no_rune', short: l.why === 'gold_short' };
    lines.push(l);
  }
  if (row.ammo > 0) {
    if (!h.ammo) return { why: 'no_ammo' };
    /* Own shots first, the rest from the store shot behind the line (one resolver). */
    const line = h.hs.bag && h.hs.bag[h.ammo];
    const own = Math.min(row.ammo, Math.max(0, int(line && line.left)));
    for (let i = 0; i < own; i++) lines.push({ id: h.ammo, source: 'own', price: 0 });
    if (own < row.ammo) {
      /* (storeAllowed under 'switch' opens the store only once the carried line is empty.) */
      const shot = shopShotFor(h.hs, h.ammo);
      if (!shot) return { why: 'no_ammo' };
      for (let i = own; i < row.ammo; i++) lines.push({ id: shot.id, source: 'store', price: shot.price });
    }
  }
  /* The whole cast must be payable at once: no rune is spent on a cast whose shots the purse cannot buy. */
  const cost = lines.reduce((a, l) => a + l.price, 0);
  if (cost > 0 && !canAfford(h.hs, cost)) return { why: 'no_ammo', short: true };
  return { lines };
}

/** Why `row` cannot fire for `hero` now, or null when it can (AB-01, 02, 11, 12). Pure. */
export function gateOf(hero, h, row, atMs) {
  if (!row || !row.active) return 'inactive';
  const skip = ACTION_SET_SKIPS[h.actionSet] || ACTION_SET_SKIPS.hunt;
  if ((skip.rune && row.rune) || (skip.area && row.target === 'area')) return 'action_set';
  if (readyAt(hero.cds, row.id) > atMs) return 'cooldown';
  if (readyAt(hero.lanes, row.lane) > atMs) return 'lane';
  if (int(hero.mana) < row.mana) return 'mana';
  return null;
}

/** The first usable ability in bar order for `hero`, with its target and supply lines, or null. */
export function firstUsable(inst, hero, sc) {
  const h = hero && inst.heroes && inst.heroes[hero.id];
  if (!h || !h.hs || !Array.isArray(h.bar)) return null;
  for (const id of h.bar) {
    const row = ABILITIES[id];
    if (gateOf(hero, h, row, sc.atMs)) continue;
    const t = targetFor(inst, hero, h, row, sc);
    if (!t) continue;
    const s = suppliesFor(h, row);
    if (s.why) { if (s.short) h.hs.goldOut = true; continue; }
    return { row, target: t, lines: s.lines };
  }
  return null;
}

/* Heal `t` by up to `n`, capped at its missing HP (AB-09). */
function healOne(u, t, n, sc) {
  const got = Math.max(0, Math.min(n, int(t.maxHp) - int(t.hp)));
  t.hp = int(t.hp) + got;
  markHealed(t, sc.atMs);
  sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: t.id, amount: got }));
}
const roll = (sc, r) => sc.rng.int(r[0], r[1]);

/* Apply a fired ability's effect (AB-08). */
function effect(inst, u, row, t, sc) {
  const el = row.element || null;
  switch (row.target) {
    case 'taunt':
      for (const m of engaged(inst)) if (m.target !== u.id) m.target = u.id;
      sc.emit(makeEvent('challenge', sc.atMs, { u: u.id }));
      break;
    case 'mark':
      t.markBy = u.id; t.markUntil = sc.atMs + row.durMs;
      sc.emit(makeEvent('mark', sc.atMs, { u: u.id, t: t.id }));
      break;
    case 'enemy':
      for (let i = 0; i < (row.hits || 1); i++) {
        hurt(inst, t, roll(sc, row.dmg), u, el, row.id);
        if (row.status) applyStatus(inst, t, { id: row.status }, u, sc);
      }
      break;
    case 'area':
      for (const m of engaged(inst).filter((o) => cheb(o, t) <= 1).sort((a, b) => a.id - b.id)) {
        if (row.vuln) m.vulnUntil = sc.atMs + ABILITY_RULES.vulnMs;
        hurt(inst, m, roll(sc, row.dmg), u, el, row.id);
      }
      break;
    case 'cleave': {
      const hits = [t, ...engaged(inst).filter((m) => m !== t && cheb(m, u) <= 1).sort((a, b) => a.id - b.id)].slice(0, row.maxHits);
      for (const m of hits) hurt(inst, m, roll(sc, row.dmg), u, el, row.id);
      break;
    }
    case 'self':
      u.shield = row.shield;
      sc.emit(makeEvent('shield', sc.atMs, { u: u.id, t: u.id, amount: row.shield }));
      break;
    case 'ally': healOne(u, t, roll(sc, row.heal), sc); break;
    case 'party':
      for (const a of living(inst, 'hero').sort((x, y) => x.id - y.id)) {
        if (a === u || dist2(a, u) <= row.radius * row.radius) healOne(u, a, roll(sc, row.heal), sc);
      }
      break;
    default: break;
  }
}

/** Fire `pick` (from firstUsable): pay, set the clocks, apply. False when a supply could not be paid. */
export function fire(inst, u, pick, sc) {
  const h = inst.heroes[u.id];
  for (const l of pick.lines) if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }
  const row = pick.row;
  u.mana = int(u.mana) - row.mana;
  u.cds = Object.assign({}, u.cds || {}, { [row.id]: sc.atMs + row.cdMs });
  u.lanes = Object.assign({}, u.lanes || {}, { [row.lane]: sc.atMs + ABILITY_LANES[row.lane] });
  /* The tally's supply split (§3.8): any store line makes the cast 'store'; `gold` is what it cost. */
  const gold = pick.lines.reduce((a, l) => a + l.price, 0);
  const source = pick.lines.some((l) => l.source === 'store') ? 'store' : 'own';
  sc.emit(makeEvent('cast', sc.atMs, { u: u.id, ability: row.id, t: pick.target.id, mana: row.mana, magicXpMult: row.magicXpMult, source, gold }));
  effect(inst, u, row, pick.target, sc);
  return true;
}

/** Mana regenerates ABILITY_RULES.manaRegenPctPerMin of max a minute, in milli-mana (AB-13). */
function regenMana(u, dtMs) {
  if (!(int(u.maxMana) > 0)) return;
  u.manaMilli = int(u.manaMilli) + Math.floor((int(u.maxMana) * ABILITY_RULES.manaRegenPctPerMin * 10 * dtMs) / 60000);
  const whole = Math.floor(u.manaMilli / 1000);
  u.manaMilli -= whole * 1000;
  u.mana = Math.min(int(u.maxMana), int(u.mana) + whole);
}

/**
 * The basic attack's cost (AB-12), for damage.js (H2) to ask before a basic
 * swing: a wand or staff basic spends `mana`, a bow or crossbow basic one shot
 * of the loaded ammo (own first, then store). True when it may swing.
 */
export function payBasic(inst, hero, cost, sc) {
  const c = cost || {};
  if (int(c.mana) > 0) {
    if (int(hero.mana) < c.mana) return false;
    hero.mana -= c.mana;
  }
  if (c.ammo) {
    const h = inst.heroes && inst.heroes[hero.id];
    const l = h && h.ammo ? resolveLine(h.hs, h.ammo, 1) : { why: 'none' };
    if (!l.id || l.why) { if (l.why === 'gold_short') h.hs.goldOut = true; return false; }
    if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }
  }
  return true;
}

/** Attack hook: each hero fires its first usable ability. */
export function castAbilities(inst, sc) {
  for (const u of inst.world.units.slice().sort((a, b) => a.id - b.id)) {
    if (u.side !== 'hero' || !u.alive) continue;
    regenMana(u, sc.dtMs);
    if (!engaged(inst).length) continue;
    const pick = firstUsable(inst, u, sc);
    if (pick) fire(inst, u, pick, sc);
  }
}
