// ============================================================
// src/core/hunt/damage.js — ONE hurt() (spec §2 damage; parity DM-*)
//
// Every blow any unit lands goes through `hurt`: element (permille, 0 = immune),
// the target's defence, the dealer's and the target's stance, minimum 1, the
// target's shield first, then HP, and the kill hand-off. A blow AT A HERO takes
// the armour chain of ruling K7 instead of a monster's defence: dodge (landHit),
// absorb, resistances, ward, under one total cap (src/core/mitigation.js, the
// profile the settle writes on the unit as `mit`). The pieces of the
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
// An ability passes its own multiplier as `ability.mult` (permille); landHit folds
// a target's mark (`markPm` until `markUntil`, abilities.js) into it. A shield is the
// target's `shield`, persisted by abilities.js; hurt only spends it.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.71';
import { STATUSES } from '../../data/statuses.js?v=0.2.71';
import { HUNT_STANCES, DEFAULT_STANCE } from '../../data/rule-subjects.js?v=0.2.71';
import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit, defenceReduction, monsterAccuracy, monsterMaxHit } from '../combat.js?v=0.2.71';
import { cheb } from './grid.js?v=0.2.71';
import { atRest, unitById } from './movement.js?v=0.2.71';
import { makeEvent } from './events.js?v=0.2.71';
import { roleOf, elementOn, inRange, peel, engaged } from './targeting.js?v=0.2.71';
import { fallen, partySize } from './pull-cycle.js?v=0.2.71';
import { shareKillXp } from './xp-share.js?v=0.2.71';
import { payBasic, shotLine, ownShotLine } from './abilities.js?v=0.2.71';
import { slotsFor, shotPasses, attackOrder, bestAim, footprintOf, inFootprint, itemRow, DEFAULT_ATTACK_ROW } from './conditions.js?v=0.2.71';
import { shootsItem } from '../../data/hunt-roles.js?v=0.2.71';
import { elementWithFloor } from '../../data/hunt-grounds.js?v=0.2.71';
import { mitigate } from '../mitigation.js?v=0.2.71';
import { BASIC_EFFECT_SHARE } from '../../data/supply-basics.js?v=0.2.71';

/* A store shot's share of its partner's ammo bonus, permille. */
const BASIC_SHOT_PM = Math.round(BASIC_EFFECT_SHARE * 1000);

/* stance: the hero's setting. acc (permille), maxHit, def, element: its combat snapshot.
   swingLeftMs: ms until the unit may swing again. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['stance', 'str'], ['acc', 'int'], ['maxHit', 'int'], ['def', 'int'], ['element', 'str'], ['swingLeftMs', 'int']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

/* How much more a unit takes from its MARKING statuses (statuses.js takenPm), permille: the strongest live stack's
   (a marking status never stacks past its row's maxStacks, and two marks of one kind never add). */
function takenPmOf(u) {
  let best = 0;
  for (const st of Array.isArray(u.statuses) ? u.statuses : []) {
    const row = st && Object.prototype.hasOwnProperty.call(STATUSES, st.s) ? STATUSES[st.s] : null;
    if (row && Number.isInteger(row.takenPm) && row.takenPm > best && st.left > 0) best = row.takenPm;
  }
  return best;
}

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
  /* A monster's defence comes off a hero's blow after its element. A blow AT A HERO keeps its
     element for the armour chain below (ruling K7). */
  let n = Math.max(0, Math.floor(amount));
  if (target.side === 'mon') n = Math.floor((n * el) / 1000) - defenceReduction(MONSTERS[target.kind]);
  if (ability && Number.isInteger(ability.mult)) n = Math.floor((n * ability.mult) / 1000);
  n = Math.floor((n * stanceOf(source).dealt) / 1000);
  n = Math.floor((n * stanceOf(target).taken) / 1000);
  /* THE HERO'S ARMOUR, in the fixed order (dodge was rolled by landHit): absorb, resistances,
     ward, never past the total cap (src/core/mitigation.js), then the shield below and HP.
     Every landed blow deals at least 1. */
  n = target.side === 'hero' ? mitigate(n, el, target.mit) : Math.max(1, n);
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
  /* DODGE, the chain's first step (ruling K7): a BLOW at a hero wearing medium armour misses
     outright on its dodge chance — one draw on the `s` stream, made only when the chance is above
     zero, so a hero with no medium armour draws nothing. A status tick is not a blow (`dot`). */
  const dodgePm = target.side === 'hero' && target.mit && !(ability && ability.dot) ? target.mit.dodgePm || 0 : 0;
  if (dodgePm > 0 && sc.rng.chance(dodgePm / 1000)) {
    sc.emit(makeEvent('miss', sc.atMs, { u: source ? source.id : null, t: target.id, dodge: true }));
    return { dmg: 0, absorbed: 0, killed: false, dodged: true };
  }
  /* A MARKED target (abilities.js: Hunter's Mark) takes markPm permille more from every blow until
     markUntil, and a target under a MARKING status (statuses.js takenPm: Green Sickness) its takenPm more,
     added together and folded into the one multiplier hurt applies (`ability.mult`). */
  const markPm = (Number.isInteger(target.markPm) && target.markPm > 0 && target.markUntil > sc.atMs ? target.markPm : 0) + takenPmOf(target);
  const base = ability && Number.isInteger(ability.mult) ? ability.mult : 1000;
  const r = hurt(inst, target, amount, source, element,
    markPm ? Object.assign({}, ability, { mult: Math.floor((base * (1000 + markPm)) / 1000) }) : ability);
  /* A status tick whose source has left the world lands with no dealer (u null). */
  const u = source ? source.id : null;
  if (r.immune) sc.emit(makeEvent('immune', sc.atMs, { u, t: target.id }));
  else {
    sc.emit(makeEvent('dmg', sc.atMs, { u, t: target.id, amount: r.dmg,
      ability: (ability && ability.id) || 'basic', element: element || null, ...(crit ? { crit: true } : {}),
      ...(ability && ability.dot ? { dot: true } : {}) }));
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
       aim; the lane's last slot is its default, d_attack: the basic attack at the
       target. A ranged basic looses one shot of the LOADED ammo, own first then the
       store's partner arrow, bought per use (abilities.shotLine, the one supply
       resolver; Tyler 10-23: arrows are bought from the store like anything else):
       a bow with no shot does not swing. A CASTER's basic spends its role's mana
       (hunt-roles.js `basic`; Tyler 10-15 K3, 10-23: runes fuel spells only, never a
       basic) and trains Magic from it: no mana, no swing (AB-12). A melee hero swings
       with nothing to pay. A bare fixture unit (no settle entry) runs the default with
       no supplies at all. ONE unit a shot, whatever it hits, and the blow is priced
       by the item it spent (blow below), never by the ammo merely loaded. */
    const h = (inst.heroes && inst.heroes[u.id]) || null;
    const shot = pickShot(inst, u, h, t, sc);
    if (!shot) continue;
    const cost = shot.pick.mana > 0 ? { mana: shot.pick.mana } : shot.pick.ammo !== null ? { ammo: shot.pick.ammo } : null;
    const paid = cost ? payBasic(inst, u, cost, sc) : true;
    if (!paid) continue;
    /* A STORE SHOT is its crafted partner's BASIC version (supply-basics.js BASIC_EFFECT_SHARE). */
    const sharePm = paid !== true && paid.source === 'store' ? BASIC_SHOT_PM : undefined;
    const aim = shot.pick.aim;
    const hits = [aim].concat(engaged(inst).filter((m) => m !== aim && inFootprint(aim, shot.pick.size, m)).sort((a, b) => a.id - b.id));
    /* The decision event: a player's (or role) slot, and every swing that spent mana (its Magic XP is
       paid from it: hunt-rewards.js), never a free default swing every 2 s. */
    if (shot.rule !== DEFAULT_ATTACK_ROW.rule || shot.pick.mana > 0) {
      sc.emit(makeEvent('shot', sc.atMs, { u: u.id, t: aim.id, item: shot.pick.ammo || '', rule: shot.rule, rule_label: shot.label, pass: shot.mask, hits: hits.length,
        ...(shot.pick.mana > 0 ? { mana: shot.pick.mana, magicXpMult: shot.pick.magicXpMult } : {}) }));
    }
    restart(u);
    for (const m of hits) if (m.alive) blow(inst, sc, u, h, m, shot.pick.price, sharePm);
    if (inst.world.leader === u.id) inst.world.leaderLast = aim.id;
    peel(inst, sc, u);
  }
}

/* One hero blow at `t`. AGAINST THIS MONSTER (the settle's rollsVs, combat.js
   playerCombatRolls): the accuracy over its defence with the weapon weakness, and
   the weakness's damage factor on the unit's max hit (its defence is hurt()'s,
   once). A bare fixture unit swings on its snapshot.
   PRICED BY THE ITEM SPENT: `price` is the item the shot spent in the ammo slot,
   undefined = the loadout as worn (melee: its whetstone; a caster: no ammo at all).
   When it is not the loaded ammo, or it came from the store (`sharePm` under 1000:
   the store's basic version, a share of its partner's bonus), the member prices the
   blow with it there instead (member.js shotRolls: a slot naming Barbed Arrows while
   Bronze are loaded hits at Barbed's strength). A peer the browser draws has no
   shotRolls and swings on its frozen numbers until the server's commit lands. */
function blow(inst, sc, u, h, t, price, sharePm) {
  const basic = Number.isInteger(sharePm) && sharePm < 1000;
  if (h && t.side === 'mon' && price !== undefined && (price !== h.ammo || basic) && typeof h.shotRolls === 'function') {
    const base = h.shotRolls(null, price, sharePm), spent = h.shotRolls(MONSTERS[t.kind], price, sharePm);
    return roll(inst, sc, u, t, spent.accuracy, Math.max(1, Math.floor(Math.max(1, base.maxHit) * ((spent.weak && spent.weak.damageMult) || 1))),
      Number(spent.critChance) || 0);
  }
  const vs = h && t.side === 'mon' && typeof h.rollsVs === 'function' ? h.rollsVs(MONSTERS[t.kind]) : null;
  return roll(inst, sc, u, t, vs ? vs.accuracy : u.acc / 1000,
    vs ? Math.max(1, Math.floor(Math.max(1, u.maxHit) * ((vs.weak && vs.weak.damageMult) || 1))) : Math.max(1, u.maxHit),
    vs ? Number(vs.critChance) || 0 : 0);
}

/* The attack slot a hero's swing takes now: { pick: { ammo (an item id, or null =
   nothing to pay), price (the item the blow is priced with: blow above), size, aim,
   mana? + magicXpMult? (a caster's basic) }, rule, mask, label } or null. An item slot
   is a shooter's; one with no stock or no aim falls back to the next. THE ORDER (Andy #63; conditions.js
   attackOrder): a bar slot with conditions, then the worn ammo, then the bar's other ammo, each first on
   what the hero carries (`own`), and only then, in the same order, from the store. */
function pickShot(inst, u, h, t, sc) {
  const row = roleOf(u);
  if (!row) return null;
  const rows = attackOrder(h ? slotsFor(h, 'attack') : [DEFAULT_ATTACK_ROW]);
  /* OUT OF GOLD FOR THE BASIC ENDS THE HUNT (Tyler 10-14): when nothing carried can shoot and the purse cannot buy
     the worn ammo's store shot, the swing the hero would take cannot be paid (goldOut), unless another row can. */
  let wornShort = false;
  const got = shotPasses(inst, u, h, rows, (own) => (slot, cx) => {
    const id = slot.action.id;
    if (id === 'loaded') {
      /* THE CASTER'S MANA BASIC: never a rune (a loaded rune adds nothing: member.js combatWorn), its
         role's mana a swing; with too little it waits (`mana`) while the pool regenerates. */
      if (row.basic) {
        return (Number(u.mana) || 0) >= row.basic.mana ? { ammo: null, price: undefined, size: 1, aim: t, mana: row.basic.mana, magicXpMult: row.basic.magicXpMult } : { why: 'mana' };
      }
      const shoots = !!h && u.role === 'ranger';
      /* Loaded ammo the worn weapon cannot shoot (hunt-roles.js shootsItem: a whetstone on a bow) is no shot. */
      const fits = !!h && !!h.ammo && shootsItem(u.role, itemRow(h, h.ammo));
      /* A bow or crossbow with nothing it can loose loaded has no shot: no swing (the lane waits, no_stock). */
      if (shoots && !fits) return { why: 'no_stock' };
      /* The worn ammo's own shot, or (the second pass) its store partner; neither: the next row. */
      const w = shoots ? (own ? ownShotLine(h, h.ammo) : shotLine(h, h.ammo)) : null;
      if (w && (!w.id || w.why)) {
        if (!own && w.why === 'gold_short') wornShort = true;
        return { why: w.why === 'gold_short' ? 'gold_short' : 'no_stock' };
      }
      return { ammo: shoots ? h.ammo : null, price: shoots ? h.ammo : undefined, size: 1, aim: t };
    }
    /* An item attack slot is a shooter's (a caster's basic spends mana, a melee hero's spends nothing). */
    if (row.melee || row.basic || !h) return null;
    /* AN ITEM THE WORN WEAPON CANNOT SHOOT IS NO SHOT (Andy 2026-10-23): the slot is passed over and the next
       one fires. A bow loosed Copper Whetstones (Melee ammo), one a shot, from a slot ahead of its arrows. */
    if (!shootsItem(u.role, itemRow(h, id))) return null;
    const l = own ? ownShotLine(h, id) : shotLine(h, id);
    if (!l.id || l.why) return { why: l.why === 'gold_short' ? 'gold_short' : 'no_stock' };
    const size = footprintOf(slot, h);
    /* A ONE-TARGET item shoots the swing's own target, as the loaded ammo does (a pull's first shot at a pack
       that holds no target yet fell to the loaded ammo); an area item takes its best aim. */
    const aim = cx.aim && cx.aim.alive ? cx.aim : size <= 1 ? t : (bestAim(inst, u, row.range, size, slot) || {}).aim;
    return aim && inRange(inst, u, aim) ? { ammo: id, price: id, size, aim } : { why: 'out_of_range' };
  }, sc);
  if (!got && wornShort) h.hs.goldOut = true;
  return got;
}
