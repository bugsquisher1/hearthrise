// ============================================================
// src/core/hunt/damage.js — ONE hurt() (spec §2 damage; parity DM-*)
//
// Every blow any unit lands goes through `hurt`: element (permille, 0 = immune),
// the target's defence, the dealer's and the target's stance, minimum 1, the
// target's shield first, then HP, and the kill hand-off. The pieces of the
// arithmetic are src/core/combat.js's (defenceReduction, monsterAccuracy,
// monsterMaxHit, elementPermille, rollAttack): this file adds no second copy.
//
// `resolveAttacks` swings every unit whose swing is due, on the universal
// COMBAT_BALANCE.tickMs (the one basic-attack interval). A hero swings with the combat snapshot on its unit
// (acc permille, maxHit, element, def), which the settle writes from the
// character's own gear and skills; a monster swings from its MONSTERS row.
// Melee swing only standing on a tile; ranged also while moving (RO-19).
// Dice: the swing's `s` stream, units in id order (engine contract #3).
//
// Mark and vulnerability are abilities.js's (lane H4) statuses: an ability
// passes its own multiplier as `ability.mult` (permille). A shield is the
// target's `shield`, persisted by abilities.js; hurt only spends it.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.13';
import { HUNT_STANCES, DEFAULT_STANCE } from '../../data/rule-subjects.js?v=0.2.13';
import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit, defenceReduction, monsterAccuracy, monsterMaxHit } from '../combat.js?v=0.2.13';
import { cheb } from './grid.js?v=0.2.13';
import { atRest, unitById } from './movement.js?v=0.2.13';
import { makeEvent } from './events.js?v=0.2.13';
import { roleOf, elementOn, inRange, peel, engaged } from './targeting.js?v=0.2.13';
import { fallen, partySize } from './pull-cycle.js?v=0.2.13';
import { shareKillXp } from './xp-share.js?v=0.2.13';
import { payBasic } from './abilities.js?v=0.2.13';
import { slotsFor, pickSlot, bestAim, footprintOf, inFootprint, DEFAULT_ATTACK_ROW } from './conditions.js?v=0.2.13';
import { resolveLine } from '../action-rules.js?v=0.2.13';
import { elementWithFloor } from '../../data/hunt-grounds.js?v=0.2.13';

/* stance: the hero's setting. acc (permille), maxHit, def, element: its combat snapshot.
   swingLeftMs: ms until the unit may swing again. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['stance', 'str'], ['acc', 'int'], ['maxHit', 'int'], ['def', 'int'], ['element', 'str'], ['swingLeftMs', 'int']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

/** The permille of its row's kill yield a monster pays (pull-cycle.js spawnPack stamps it; unstamped = all). */
export const yieldOf = (m) => (Number.isInteger(m && m.yieldPm) && m.yieldPm > 0 ? m.yieldPm : 1000);
const stanceOf = (u) => HUNT_STANCES[u && u.stance] || HUNT_STANCES[DEFAULT_STANCE];

/**
 * Apply `amount` from `source` to `target`; answers what landed:
 * { dmg (HP removed), absorbed (shield spent), killed, immune }.
 */
export function hurt(inst, target, amount, source, element, ability) {
  if (!target || !target.alive) return { dmg: 0, killed: false };
  /* THE SOLO HEALER FLOOR (hunt-grounds.js, BALANCE_RULINGS 2026-10-16): a Healer
     alone lands every blow at least at the floor, whatever the target's profile. */
  const el = source && source.side === 'hero'
    ? elementWithFloor(elementOn(target, element), source.role, partySize(inst)) : elementOn(target, element);
  if (el === 0) return { dmg: 0, absorbed: 0, killed: false, immune: true };
  let n = Math.floor((Math.max(0, Math.floor(amount)) * el) / 1000);
  if (target.side === 'mon') n -= defenceReduction(MONSTERS[target.kind]);
  if (ability && Number.isInteger(ability.mult)) n = Math.floor((n * ability.mult) / 1000);
  n = Math.floor((n * stanceOf(source).dealt) / 1000);
  n = Math.floor((n * stanceOf(target).taken) / 1000);
  n = Math.max(1, n);
  const absorbed = Number.isInteger(target.shield) && target.shield > 0 ? Math.min(target.shield, n) : 0;
  if (absorbed) target.shield -= absorbed;
  const dmg = Math.min(target.hp, n - absorbed);
  target.hp -= dmg;
  return { dmg, absorbed, killed: target.hp <= 0, immune: false };
}

/**
 * Land a blow and tell the client: the one place a `dmg` / `immune` / `kill` event
 * is made, and the kill hand-off (pull-cycle.fallen, then xp-share.shareKillXp for a
 * monster). `dmg` names its ability ('basic' for a swing) and element (null for none),
 * which the analyzer tally reads. abilities.js lands its hits here too.
 */
export function landHit(inst, sc, source, target, amount, element, ability, crit) {
  if (!target || !target.alive) return { dmg: 0, absorbed: 0, killed: false };
  const r = hurt(inst, target, amount, source, element, ability);
  /* A status tick whose source has left the world lands with no dealer (u null). */
  const u = source ? source.id : null;
  if (r.immune) sc.emit(makeEvent('immune', sc.atMs, { u, t: target.id }));
  else {
    sc.emit(makeEvent('dmg', sc.atMs, { u, t: target.id, amount: r.dmg,
      ability: (ability && ability.id) || 'basic', element: element || null, ...(crit ? { crit: true } : {}) }));
  }
  if (r.killed) {
    sc.emit(makeEvent('kill', sc.atMs, { u, t: target.id }));
    fallen(inst, target, sc);
    if (target.side === 'mon') shareKillXp(inst, { t: target.id, u, xp: Math.round((MONSTERS[target.kind].xp * yieldOf(target)) / 1000) }, sc);
  }
  return r;
}

/* One swing of `u` at `t`: miss → a miss event; a hit → landHit. Two draws at most (rollAttack). */
/* A CRIT is gear (critB + the set bonus + a crit buff, combat.js playerCombatRolls
   critChance): rolled only on a landed hero blow and only when the chance is
   above zero, so a hero with no crit draws no extra number. */
/* A unit that swings waits the one basic-attack interval for its next. */
function restart(u) { u.swingLeftMs = COMBAT_BALANCE.tickMs; }

function swing(inst, sc, u, t, accuracy, maxHit, critChance) {
  restart(u);
  return roll(inst, sc, u, t, accuracy, maxHit, critChance);
}
/* The dice of one blow (a swing, or each target of an area shot), clock untouched. */
function roll(inst, sc, u, t, accuracy, maxHit, critChance) {
  let amount = rollAttack(sc.rng, accuracy, maxHit);
  if (amount <= 0) { sc.emit(makeEvent('miss', sc.atMs, { u: u.id, t: t.id })); return null; }
  const crit = critChance > 0 && rollCrit(sc.rng, critChance);
  if (crit) amount = applyCrit(amount, COMBAT_BALANCE.critMult);
  return landHit(inst, sc, u, t, amount, u.side === 'hero' ? u.element : null, null, crit);
}

/** Attack hook: every living unit whose swing is due swings, in id order. */
export function resolveAttacks(inst, sc) {
  for (const u of inst.world.units) {
    if (!u.alive) continue;
    if (u.swingLeftMs > 0) u.swingLeftMs = Math.max(0, u.swingLeftMs - sc.dtMs);
    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;
    const t = unitById(inst, u.target);
    if (!t || !t.alive) continue;
    if (u.side === 'mon') {
      if (cheb(u, t) > 1 || !atRest(u)) continue;
      const row = MONSTERS[u.kind];
      swing(inst, sc, u, t, monsterAccuracy(row, t.def), monsterMaxHit(row));
      continue;
    }
    const row = roleOf(u);
    if (!row || (row.melee && !atRest(u)) || !inRange(inst, u, t)) continue;
    /* THE ATTACK LANE, ONE PATH (conditions.js). The first attack slot whose
       conditions pass and that has a shot picks the item and, by its footprint, the
       aim; the lane's last slot is its default, d_attack: the LOADED ammo at the
       target. A ranged basic looses one shot of it and a caster's basic burns one
       of the rune in its ammo slot (W0: runes are the mage's ammo, spec §3.4 #8),
       own first then the store (abilities.payBasic, the one supply resolver): no
       shot, no swing. A caster with no rune loaded, and any melee hero, swings
       with nothing to pay. A bare fixture unit (no settle entry) runs the default
       with no supplies at all. ONE unit a shot, whatever it hits. */
    const h = (inst.heroes && inst.heroes[u.id]) || null;
    const shot = pickShot(inst, u, h, t, sc);
    if (!shot) continue;
    if (shot.pick.ammo !== null && !payBasic(inst, u, { ammo: shot.pick.ammo }, sc)) continue;
    const aim = shot.pick.aim;
    const hits = [aim].concat(engaged(inst).filter((m) => m !== aim && inFootprint(aim, shot.pick.size, m)).sort((a, b) => a.id - b.id));
    /* The decision event: only a player's (or role) slot, never the default swing every 2 s. */
    if (shot.rule !== DEFAULT_ATTACK_ROW.rule) {
      sc.emit(makeEvent('shot', sc.atMs, { u: u.id, t: aim.id, item: shot.pick.ammo || '', rule: shot.rule, rule_label: shot.label, pass: shot.mask, hits: hits.length }));
    }
    restart(u);
    for (const m of hits) if (m.alive) blow(inst, sc, u, h, m);
    if (inst.world.leader === u.id) inst.world.leaderLast = aim.id;
    peel(inst, sc, u);
  }
}

/* One hero blow at `t`. AGAINST THIS MONSTER (the settle's rollsVs, combat.js
   playerCombatRolls): the accuracy over its defence with the weapon weakness, and
   the weakness's damage factor on the unit's max hit (its defence is hurt()'s,
   once). A bare fixture unit swings on its snapshot. */
function blow(inst, sc, u, h, t) {
  const vs = h && t.side === 'mon' && typeof h.rollsVs === 'function' ? h.rollsVs(MONSTERS[t.kind]) : null;
  return roll(inst, sc, u, t, vs ? vs.accuracy : u.acc / 1000,
    vs ? Math.max(1, Math.floor(Math.max(1, u.maxHit) * ((vs.weak && vs.weak.damageMult) || 1))) : Math.max(1, u.maxHit),
    vs ? Number(vs.critChance) || 0 : 0);
}

/* The attack slot a hero's swing takes now: { pick: { ammo (an item id, or null =
   nothing to pay), size, aim }, rule, mask, label } or null. An item slot is a ranged
   hero's or a caster's; one with no stock or no aim falls back to the next. */
function pickShot(inst, u, h, t, sc) {
  const row = roleOf(u);
  if (!row) return null;
  const rows = h ? slotsFor(h, 'attack') : [DEFAULT_ATTACK_ROW];
  return pickSlot(inst, u, h, rows, (slot, cx) => {
    const id = slot.action.id;
    if (id === 'loaded') {
      const shoots = !!h && (u.role === 'ranger' || ((u.role === 'mage' || u.role === 'healer') && !!h.ammo));
      /* A bow or crossbow with nothing loaded has no shot: no swing (the lane waits, no_stock). */
      if (shoots && !h.ammo) return { why: 'no_stock' };
      return { ammo: shoots ? h.ammo : null, size: 1, aim: t };
    }
    if (row.melee || !h) return null;
    const l = resolveLine(h.hs, id, 1);
    if (!l.id || l.why) return { why: l.why === 'gold_short' ? 'gold_short' : 'no_stock' };
    const size = footprintOf(slot, h);
    const aim = cx.aim && cx.aim.alive ? cx.aim : (bestAim(inst, u, row.range, size) || {}).aim;
    return aim && inRange(inst, u, aim) ? { ammo: id, size, aim } : { why: 'out_of_range' };
  }, sc, 'attack');
}
