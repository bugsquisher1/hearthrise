// ============================================================
// src/core/hunt/damage.js — ONE hurt() (spec §2 damage; parity DM-*)
//
// Every blow any unit lands goes through `hurt`: element (permille, never 0: no immunities),
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
// character's own gear and skills; a monster swings from its row (rowOf: the instance's table, a scaled hunt's or the catalogue).
// Melee swing only standing on a tile; ranged also while moving (RO-19).
// Dice: the swing's `s` stream, units in id order (engine contract #3).
//
// A blow of an element with a FIXED RULE (data/elements.js ELEMENT_ON_HERO: Necrotic, Storm) that took a hero's HP
// brings that rule too, in landHit: the Withered status, or mana burned beside the HP.
//
// An ability passes its own multiplier as `ability.mult` (permille); landHit folds
// a target's mark (`markPm` until `markUntil`, abilities.js) into it. A shield is the
// target's `shield`, persisted by abilities.js; hurt only spends it.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS, monsterLevelOf } from '../../data/monsters.js';
import { atTier, levelAtTier } from '../../data/hunt-tiers.js';
import { HUNT_TUNING } from '../../data/hunt-tuning.js';
import { HUNT_STANCES, DEFAULT_STANCE } from '../../data/rule-subjects.js';
import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit, defenceReduction, monsterAccuracy, monsterMaxHit } from '../combat.js';
import { cheb } from './grid.js';
import { atRest, unitById } from './movement.js';
import { makeEvent } from './events.js';
import { roleOf, elementOn, inRange, peel, engaged } from './targeting.js';
import { fallen } from './pull-cycle.js';
import { shareKillXp } from './xp-share.js';
import { payBasic, shotLine, ownShotLine } from './abilities.js';
import { slotsFor, shotPasses, attackOrder, bestAim, footprintOf, inFootprint, itemRow, DEFAULT_ATTACK_ROW } from './conditions.js';
import { shootsItem } from '../../data/hunt-roles.js';
import { mitigate, mitigationOf, NO_MITIGATION } from '../mitigation.js';
import { BASIC_EFFECT_SHARE } from '../../data/supply-basics.js';
import { temperedAmount } from '../temper.js';
import { swingRow, crossLines, guardPmOf, rampTick } from './boss-phases.js';
import { dummyBlow, dummyStands, trainingBasic } from './training.js';
import { reaches } from './shooters.js';
import { splashOn, roleMaxHit } from './monster-roles.js';
import { monsterArmorPm } from './monster-formula.js';
import { elementOnHeroOf } from '../../data/elements.js';
import { applyStatus, statusRow } from './status.js';
import { effectPm } from './status-effects.js';
import { noteHurt, breaksOff } from './danger.js';
import { stepsOn, blowAmount, manaOn } from './amount.js';
import { AMOUNT } from '../../data/amount.js';
import { isEnemy, isHero, isMonster } from './sides.js';

/* A store shot's share of its partner's ammo bonus, permille. */
const BASIC_SHOT_PM = Math.round(BASIC_EFFECT_SHARE * 1000);
/* A HERO'S TOP ON THE SCALE: a move's share is thousandths of it (src/core/hunt/amount.js blowAmount: the weapon's blowTopBp of a reference
   health); a basic blow's mean is half of it, as the old 1-to-max roll's */
export const PIPE_TOP = 1000;

/* stance: the hero's setting. acc (permille), maxHit, def, element: its combat snapshot.
   swingLeftMs: ms until the unit may swing again.
   fightAt (world): the instant a blow last landed on a monster, the no-fight end's clock (action-rules.js `no_fight`):
   stored with the world, so every settle cut reads the same boundary. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['stance', 'str'], ['acc', 'int'], ['maxHit', 'int'], ['def', 'int'], ['element', 'str'], ['swingLeftMs', 'int']]),
  world: Object.freeze([['fightAt', 'int']]),
  pack: Object.freeze([]),
});

/* WHAT A UNIT'S STATUSES DO TO A BLOW AND A CLOCK (status-effects.js effectPm, by stacking key): takenPm (Sickness +, a hero's guard -),
   dealtPm (Weakened -, a hero's boon +), armorPm (Armor Break: a monster's defence), slowPm (Chill, at the rune tier it landed with). */
const takenPmOf = (u) => effectPm(u, 'takenPm');
const slowPmOf = (u) => effectPm(u, 'slowPm');

/** A clock of `ms` that unit `u` starts NOW, slowed by its live slowing statuses (a wiki formula, Chill's slowPm 300 = 30%):
      slowed = ceil(ms x (1000 + slowPm) / 1000 / stepMs) x stepMs   (stepMs: hunt-tuning.js, 100 ms),
    so a chilled 2 s swing waits 2.6 s and a chilled 1.6 s windup 2.1 s. Fixed as it starts: a slow that lands later
    stretches the next one. Unslowed it is `ms`. */
export function slowed(u, ms, inst) {
  /* ON THE SCALE (`inst` given and the pipeline on) a slow is conditional steps off the slowed unit's blows (src/core/hunt/amount.js), so
     no clock stretches */
  const pm = inst && stepsOn(inst) ? 0 : slowPmOf(u);
  if (!pm) return ms;
  const step = HUNT_TUNING.stepMs;
  return Math.ceil((ms * (1000 + pm)) / (1000 * step)) * step;
}

const stanceOf = (u) => HUNT_STANCES[u && u.stance] || HUNT_STANCES[DEFAULT_STANCE];
/* A MONSTER'S ROW, through the instance's one door (world-step.js inst.monsters: a scaled hunt's table, combat-sim.js huntPlayOf), the catalogue for a bare caller. */
export const rowOf = (inst, kind) => (inst.monsters || MONSTERS)[kind];

/* WHAT THE HERO'S ARMOUR DOES TO THIS BLOW (mitigation.js): its values against the attacker's own level, the ground's tier on it (hunt-tiers.js). A status tick whose dealer has left the world has no level to read: 1. */
const armourVs = (inst, target, source) => (target.armour
  ? mitigationOf(target.armour, isMonster(source) ? levelAtTier(monsterLevelOf(rowOf(inst, source.kind)), inst.tier) : 1) : NO_MITIGATION);

/* A monster's element permille `el` for a hit tagged `ability`: a weakness (over 1000) at the tag's `weakPm` share, else `el` itself. */
const weakShare = (el, ability) => (el > 1000 && ability && Number.isInteger(ability.weakPm) ? 1000 + Math.floor(((el - 1000) * ability.weakPm) / 1000) : el);

/* A MONSTER'S DEFENCE AGAINST A BLOW (combat.js defenceReduction), moved by its statuses' armorPm (status-effects.js: Armor Break -250
   keeps three quarters): floor(reduction x (1000 + armorPm) / 1000), never under 0. Unmoved, the reduction itself. */
function defenceKept(inst, target) {
  const red = defenceReduction(rowOf(inst, target.kind));
  const pm = red > 0 ? effectPm(target, 'armorPm') : 0;
  return pm ? Math.max(0, Math.floor((red * (1000 + pm)) / 1000)) : red;
}

/* A FORMULA MONSTER'S ARMOR NOW: its role armor (monsterArmorPm), x (1000 + its statuses' armorPm) / 1000, never under 0 */
function armorKept(inst, target) {
  const arm = monsterArmorPm(inst, target);
  const pm = arm > 0 ? effectPm(target, 'armorPm') : 0;
  return pm ? Math.max(0, Math.floor((arm * (1000 + pm)) / 1000)) : arm;
}

/**
 * Apply `amount` from `source` to `target`; answers what landed:
 * { dmg (HP removed), absorbed (shield spent), killed }.
 */
export function hurt(inst, target, amount, source, element, ability, rng) {
  if (!target || !target.alive) return { dmg: 0, killed: false };
  /* NO IMMUNITIES (Tyler 2026-11-06): the target's element profile is a percentage, never 0 (core/elements.js). */
  const el = elementOn(target, element);
  /* ON THE DANGER SCALE, THE AMOUNT PIPELINE (src/core/hunt/amount.js): `amount` is the move's MEAN in its source's units, and the one
     pipeline lands it (base share, the step contest with every conditional step, one roll, the reference health), rounded once. The
     monster's flat defence, the armor chain and its cap, Tempering's draw and the after-the-chain power step are not read there. */
  if (stepsOn(inst)) return landOn(inst, target, source, pipedAmount(inst, target, amount, source, element, ability, el, rng));
  /* A monster's defence comes off a hero's blow after its element. A blow AT A HERO keeps its
     element for the armour chain below (ruling K7). */
  let n = Math.max(0, Math.floor(amount));
  /* A HIT THAT LANDS PART OF A WEAKNESS (`weakPm`, abilities.js: the fist line's strikes, half): the monster's bonus over 1000 at that
     share, a resistance in full (a wiki formula: weak = 1000 + floor((el - 1000) x weakPm / 1000) when el > 1000). */
  if (isMonster(target)) n = Math.floor((n * weakShare(el, ability)) / 1000) - defenceKept(inst, target);
  /* A FORMULA MONSTER'S ARMOR (monster-formula.js monsterArmorPm, its role's armor): a share of the blow, moved by the same statuses'
     armorPm as its defence (Armor Break -250 keeps three quarters); 0 on a hand row */
  const arm = isMonster(target) ? armorKept(inst, target) : 0;
  if (arm > 0 && n > 0) n = Math.floor((n * (1000 - arm)) / 1000);
  if (ability && Number.isInteger(ability.mult)) n = Math.floor((n * ability.mult) / 1000);
  /* A CALLED BOSS BEHIND HIS ADDS takes his guard's share of every blow (boss-phases.js); any other monster all of it. */
  if (isMonster(target)) n = Math.floor((n * guardPmOf(inst, target)) / 1000);
  n = Math.floor((n * stanceOf(source).dealt) / 1000);
  n = Math.floor((n * stanceOf(target).taken) / 1000);
  /* THE HERO'S ARMOUR, in the fixed order (dodge was rolled by landHit): absorb, resistances,
     ward, never past the total cap (src/core/mitigation.js), then the shield below and HP.
     Every landed blow deals at least 1. */
  n = isHero(target) ? mitigate(n, el, armourVs(inst, target, source), target.armorPm, rng) : Math.max(1, n);
  /* TEMPERING: a hero's rung raises what lands on a monster, last, so +1% is +1% of the damage whatever the monster's defence (src/core/temper.js: the part of a point is one draw, made only by a hero with a rung).
     (Off the scale only: on it the power step and Tempering are the amount pipeline's steps, src/core/hunt/amount.js.) */
  const pm = source && source.blowsPm > 0 && isMonster(target) ? source.blowsPm : 0;
  if (pm) n = Math.max(1, temperedAmount(n, pm, rng));
  return landOn(inst, target, source, n);
}

/* THE PIPELINE'S BLOW (src/core/hunt/amount.js blowAmount) from what hurt was handed: the move's multipliers (its version or store share,
   the dealer's stance, the target's stance, a called boss's guard) as one base-share permille, the element answer as steps, and the mark
   and the slow that landHit and the dealer carry (`ability.markPm`, the source's slowPm). */
function pipedAmount(inst, target, mean, source, element, ability, el, rng) {
  let mult = ability && Number.isInteger(ability.mult) ? ability.mult : 1000;
  if (isMonster(target)) mult = (mult * guardPmOf(inst, target)) / 1000;
  /* a formula monster's role armor (monsterArmorPm, Armor Break moving it: armorKept) is a share of the blow on the scale too: the monster
     formula wrote its health net of it, so secondsToKill holds and an answer that strips it is a real gain in kill time */
  const arm = isMonster(target) ? armorKept(inst, target) : 0;
  if (arm > 0) mult = (mult * (1000 - arm)) / 1000;
  mult = (mult * stanceOf(source).dealt * stanceOf(target).taken) / 1000000;
  return blowAmount(inst, { source, target, mean: Math.max(0, mean), mult, el: isMonster(target) ? weakShare(el, ability) : el, ward: !!element && element !== 'physical',
    answerPm: ability && ability.answerPm, markPm: ability && ability.markPm, dealerPm: ability && ability.dealerPm, slowPm: source ? slowPmOf(source) : 0,
    critMult: COMBAT_BALANCE.critMult, rng });
}
/* WHAT A BLOW DOES ONCE ITS AMOUNT IS KNOWN (both chains): the target's shield first, then HP. */
function landOn(inst, target, source, n) {
  const absorbed = Number.isInteger(target.shield) && target.shield > 0 ? Math.min(target.shield, n) : 0;
  if (absorbed) target.shield -= absorbed;
  /* A TRAINING DUMMY (src/core/hunt/training.js): its blow never takes a hero under the floor, and it never falls (whole again before anyone reads a kill). */
  const dmg = dummyBlow(isMonster(source) ? rowOf(inst, source.kind) : null, target, Math.min(target.hp, n - absorbed));
  target.hp -= dmg;
  if (isMonster(target)) dummyStands(rowOf(inst, target.kind), target);
  return { dmg, absorbed, killed: target.hp <= 0 };
}

/**
 * Land a blow and tell the client: the one place a `dmg` / `kill` event
 * is made, and the kill hand-off (pull-cycle.fallen, then xp-share.shareKillXp for a
 * monster). `dmg` names its ability ('basic' for a swing) and element (null for none),
 * which the analyzer tally reads. abilities.js lands its hits here too.
 */
export function landHit(inst, sc, source, target, amount, element, ability, crit) {
  if (!target || !target.alive) return { dmg: 0, absorbed: 0, killed: false };
  /* DODGE, the chain's first step (ruling K7): a BLOW at a hero wearing medium armour misses
     outright on its dodge chance — one draw on the `s` stream, made only when the chance is above
     zero, so a hero with no medium armour draws nothing. A status tick is not a blow (`dot`). */
  const piped = stepsOn(inst);
  const dodgePm = !piped && isHero(target) && !(ability && ability.dot) ? armourVs(inst, target, source).dodgePm : 0;
  if (dodgePm > 0 && sc.rng.chance(dodgePm / 1000)) {
    sc.emit(makeEvent('miss', sc.atMs, { u: source ? source.id : null, t: target.id, dodge: true }));
    return { dmg: 0, absorbed: 0, killed: false, dodged: true };
  }
  /* A MARKED target (abilities.js: Hunter's Mark) takes markPm permille more from every blow until
     markUntil, and a target under a status that moves what it takes (status-effects.js takenPm: Green Sickness +, a hero's guard -)
     that much more or less, added together and folded into the one multiplier hurt applies (`ability.mult`). A DEALER under a status
     that moves what it deals (dealtPm: Weakened -, a boon +) moves it after, its own factor (never under 1 permille). */
  const markPm = (Number.isInteger(target.markPm) && target.markPm > 0 && target.markUntil > sc.atMs ? target.markPm : 0) + takenPmOf(target);
  const dealtPm = source ? effectPm(source, 'dealtPm') : 0;
  const base = ability && Number.isInteger(ability.mult) ? ability.mult : 1000;
  let mult = markPm ? Math.floor((base * Math.max(1, 1000 + markPm)) / 1000) : base;
  if (dealtPm) mult = Math.floor((mult * Math.max(1, 1000 + dealtPm)) / 1000);
  const before = target.hp;
  const shieldBy = Number.isInteger(target.shield) && target.shield > 0 ? target.shieldBy : undefined;
  /* ON THE SCALE a mark and a dealer's status are conditional steps (src/core/hunt/amount.js), never a multiplier */
  const tag = piped ? (markPm || dealtPm ? Object.assign({}, ability, { markPm, dealerPm: dealtPm }) : ability)
    : markPm || dealtPm ? Object.assign({}, ability, { mult }) : ability;
  const r = hurt(inst, target, amount, source, element, tag, sc.rng);
  /* A status tick whose source has left the world lands with no dealer (u null). */
  const u = source ? source.id : null;
  if (isMonster(target)) inst.world.fightAt = sc.atMs;
  /* THE DANGER SCALE'S MARGIN (danger.js): the lowest HP a hero reached in this pull and the monster whose blow took it there, read where
     HP falls (a hunt off the scale reads nothing) */
  if (!isMonster(target) && r.dmg > 0) noteHurt(inst, target, source);
  /* AN ELEMENT'S FIXED RULE ON A HERO (data/elements.js ELEMENT_ON_HERO, itemization plan Appendix B1), when the blow took HP: a storm
     blow also burns half the HP it took from the hero's mana (`burn` on the dmg event, never past what it holds), a necrotic one
     Withers the hero (statuses.js: every heal it takes is cut for 6 s; status.js applyStatus emits it). Nothing else has a rule, so
     every other blow lands exactly as before. */
  const rule = isHero(target) && r.dmg > 0 ? elementOnHeroOf(element) : null;
  const burn = rule && rule.manaBurnPm ? Math.min(Math.max(0, Math.floor(Number(target.mana) || 0)), Math.floor((r.dmg * rule.manaBurnPm) / 1000)) : 0;
  if (burn > 0) target.mana = Math.floor(Number(target.mana)) - burn;
  /* A BLOW AT A HERO says the HP it left and the hero's max (the hunt report's lowest health and close calls, src/core/hunt/report.js):
     a reading of the unit, never a played number. */
  const vit = isHero(target) ? { hp: Math.max(0, Math.floor(Number(target.hp) || 0)), max: Math.max(0, Math.floor(Number(target.maxHp) || 0)) } : null;
  sc.emit(makeEvent('dmg', sc.atMs, { u, t: target.id, amount: r.dmg,
    ability: (ability && ability.id) || 'basic', element: element || null, ...(crit ? { crit: true } : {}), ...(ability && ability.follow ? { follow: true } : {}),
    ...(ability && ability.dot ? { dot: true } : {}), ...(burn > 0 ? { burn } : {}), ...(vit || {}) }));
  /* A SHIELD THAT BROKE (it held before this blow and is spent now): `shield_break` names the hero who cast it (`by`) and the blow's
     dealer (`u`), so the bar's triggers and the report read one event (abilities.js offerShield writes every shield). */
  if (shieldBy !== undefined && r.absorbed > 0 && !(target.shield > 0)) {
    sc.emit(makeEvent('shield_break', sc.atMs, { u, t: target.id, by: Number.isInteger(shieldBy) ? shieldBy : null }));
  }
  if (rule && rule.withers) applyStatus(inst, target, statusRow(rule.withers), { u }, sc);
  if (isMonster(target)) crossLines(inst, sc, target, before);
  if (r.killed) {
    sc.emit(makeEvent('kill', sc.atMs, { u, t: target.id }));
    fallen(inst, target, sc);
    if (isMonster(target)) { const row = rowOf(inst, target.kind); shareKillXp(inst, { t: target.id, u, xp: Math.round(atTier(row, inst.tier).xp), ...(Number.isInteger(row.partyPm) ? { partyPm: row.partyPm } : {}) }, sc); focusBack(source, target); }
  }
  return r;
}

/* FOCUS (src/data/jewelry.js): the hero whose blow fell a monster gets `focusPm` permille of its max mana back (at least 1), never past
   the max. Only a hero that wears the perk; no draw, so every other kill plays what it played before. A training dummy never falls. */
function focusBack(u, t) {
  if (!isHero(u) || !u.alive || !(u.focusPm > 0) || !isMonster(t)) return;
  const max = Math.floor(Number(u.maxMana) || 0);
  if (max <= 0) return;
  u.mana = Math.min(max, Math.floor(Number(u.mana) || 0) + Math.max(1, Math.floor((max * u.focusPm) / 1000)));
}

/* One swing of `u` at `t`: miss → a miss event; a hit → landHit. Two draws at most (rollAttack). */
/* A CRIT is gear (critB + the set bonus + a crit buff, combat.js playerCombatRolls
   critChance): rolled only on a landed hero blow and only when the chance is
   above zero, so a hero with no crit draws no extra number. */
/* A unit that swings waits the one basic-attack interval for its next, slowed by a Chill on it as it swings (slowed). */
export function restart(u, inst) { u.swingLeftMs = slowed(u, COMBAT_BALANCE.tickMs, inst); }

/* (a monster's swing, its only caller: on the Danger scale its ROLE's share of the blow, monster-roles.js roleMaxHit; the row's off it) */
function swing(inst, sc, u, t, accuracy, maxHit, critChance) {
  restart(u, inst);
  return roll(inst, sc, u, t, accuracy, roleMaxHit(inst, u, maxHit), critChance);
}
/* The dice of one blow (a swing, or each target of an area shot), clock untouched. */
function roll(inst, sc, u, t, accuracy, maxHit, critChance, answer) {
  /* ON THE SCALE (src/core/hunt/amount.js): the roll to hit only while AMOUNT.hitRoll holds (27 K-2), then the blow's MEAN to the pipeline,
     which draws its one roll; a crit is steps there (the chance's mean), never a second draw; the weapon's answer to this monster rides
     the tag (`answerPm`). The follow-through lands the same mean. */
  if (stepsOn(inst)) {
    if (AMOUNT.hitRoll && !sc.rng.chance(accuracy)) { sc.emit(makeEvent('miss', sc.atMs, { u: u.id, t: t.id })); return null; }
    const mean = (maxHit + 1) / 2;
    const tag = answer > 0 && answer !== 1 ? { id: 'basic', answerPm: Math.round(answer * 1000) } : null;
    const r = landHit(inst, sc, u, t, mean, isHero(u) ? u.element : null, tag, false);
    followThrough(inst, sc, u, t, mean, false);
    return r;
  }
  let amount = rollAttack(sc.rng, accuracy, maxHit);
  if (amount <= 0) { sc.emit(makeEvent('miss', sc.atMs, { u: u.id, t: t.id })); return null; }
  const crit = critChance > 0 && rollCrit(sc.rng, critChance);
  if (crit) amount = applyCrit(amount, COMBAT_BALANCE.critMult);
  const r = landHit(inst, sc, u, t, amount, isHero(u) ? u.element : null, null, crit);
  followThrough(inst, sc, u, t, amount, crit);
  return r;
}

/* FOLLOW-THROUGH (src/data/jewelry.js): a hero's basic blow that landed also lands, `followPm` permille of the time, on ONE more
   monster beside its target (the lowest id), the same blow: two numbers. One draw, made only by a hero that wears the perk and
   only when such a monster stands there, so every other blow draws what it drew before. It never follows through again. */
const FOLLOW_TAG = Object.freeze({ id: 'basic', follow: true });
function followThrough(inst, sc, u, t, amount, crit) {
  if (!(u.followPm > 0) || !isHero(u) || !isEnemy(u, t)) return;
  let next = null;
  for (const m of engaged(inst, u)) if (m !== t && m.alive && cheb(m, t) <= 1 && (!next || m.id < next.id)) next = m;
  if (next && sc.rng.chance(u.followPm / 1000)) landHit(inst, sc, u, next, amount, u.element, FOLLOW_TAG, crit);
}

/** Attack hook: every living unit whose swing is due swings, in id order. */
export function resolveAttacks(inst, sc) {
  for (const u of inst.world.units) {
    if (!u.alive) continue;
    if (u.swingLeftMs > 0) u.swingLeftMs = Math.max(0, u.swingLeftMs - sc.dtMs);
    /* A BOSS'S RAMP counts his fight (boss-phases.js rampTick: only a row with a ramp, only while he holds a target) */
    if (isMonster(u)) rampTick(u, rowOf(inst, u.kind), sc.dtMs);
    /* A MONSTER WINDING UP A SPELL makes no swing (monster-spells.js: the cast is its blow, and its landing restarts
       the swing clock). */
    if (u.cast) continue;
    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;
    const t = unitById(inst, u.target);
    if (!t || !t.alive) continue;
    if (isMonster(u)) {
      /* beside its target, or a SHOOTER within its range in sight (shooters.js reaches) */
      if (!reaches(inst, u, t) || !atRest(u)) continue;
      /* THE DANGER SCALE'S FALL BACK (danger.js breaksOff): once a hero is under the stance's line, no monster swings again in this pull;
         the party breaks off at the next sub-step (pull-cycle.js breakOff). Off the scale it never holds. */
      if (breaksOff(inst)) continue;
      const row = atTier(rowOf(inst, u.kind), inst.tier);
      /* A called boss under his enrage line swings that row raised (boss-phases.js). */
      const blowRow = swingRow(u, row);
      /* The monster's own stats against the hero's own stats, whatever the hero's Level (Tyler 2026-11-04: "They are just simply harder"). The tier the party picked is the monster's stats too (hunt-tiers.js). */
      swing(inst, sc, u, t, monsterAccuracy(blowRow, t.def), monsterMaxHit(blowRow));
      /* A ROLE THAT HITS AN AREA (monster-roles.js splashOn, the Danger scale only): the same blow on each hero beside its target, a share
         of it, each its own roll; none once a hero is under the stance's line (the fall back stops every blow). Off the scale: none. */
      const sp = splashOn(inst, u, t);
      for (const h of sp.heroes) {
        if (breaksOff(inst)) break;
        if (h.alive) roll(inst, sc, u, h, monsterAccuracy(blowRow, h.def), Math.max(1, Math.floor((roleMaxHit(inst, u, monsterMaxHit(blowRow)) * sp.pm) / 1000)), 0);
      }
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
    const hits = [aim].concat(engaged(inst, u).filter((m) => m !== aim && inFootprint(aim, shot.pick.size, m)).sort((a, b) => a.id - b.id));
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
  if (h && isMonster(t) && price !== undefined && (price !== h.ammo || basic) && typeof h.shotRolls === 'function') {
    const base = h.shotRolls(null, price, sharePm), spent = h.shotRolls(rowOf(inst, t.kind), price, sharePm, t.kind);
    /* on the scale a shot's power is the rating (ammo is a supply, no slot weight): the hero's top, its to-hit and its answer */
    if (stepsOn(inst)) return roll(inst, sc, u, t, spent.accuracy, PIPE_TOP, 0, (spent.weak && spent.weak.damageMult) || 1);
    return roll(inst, sc, u, t, spent.accuracy, Math.max(1, Math.floor(Math.max(1, base.maxHit) * ((spent.weak && spent.weak.damageMult) || 1))),
      Number(spent.critChance) || 0);
  }
  const vs = h && isMonster(t) && typeof h.rollsVs === 'function' ? h.rollsVs(rowOf(inst, t.kind), t.kind) : null;
  if (stepsOn(inst)) return roll(inst, sc, u, t, vs ? vs.accuracy : u.acc / 1000, PIPE_TOP, 0, (vs && vs.weak && vs.weak.damageMult) || 1);
  return roll(inst, sc, u, t, vs ? vs.accuracy : u.acc / 1000,
    vs ? Math.max(1, Math.floor(Math.max(1, u.maxHit) * ((vs.weak && vs.weak.damageMult) || 1))) : Math.max(1, u.maxHit),
    vs ? Number(vs.critChance) || 0 : 0);
}

/* Why a shot's line cannot pay, in rule_wait's `why` words (events.js). */
const shotWait = (l) => (l.why === 'gold_short' || l.why === 'level' ? l.why : 'no_stock');

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
      /* THE YARD'S BASIC (training.js trainingBasic): free, whatever the hero carries; no mana, no shot. */
      const yard = trainingBasic(inst.ground, t);
      if (yard) return yard;
      /* THE CASTER'S MANA BASIC: never a rune (a loaded rune adds nothing: member.js combatWorn), its
         role's mana a swing; with too little it waits (`mana`) while the pool regenerates. */
      if (row.basic) {
        const mana = manaOn(inst, u, row.basic.mana);
        return (Number(u.mana) || 0) >= mana ? { ammo: null, price: undefined, size: 1, aim: t, mana, magicXpMult: row.basic.magicXpMult } : { why: 'mana' };
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
        return { why: shotWait(w) };
      }
      return { ammo: shoots ? h.ammo : null, price: shoots ? h.ammo : undefined, size: 1, aim: t };
    }
    /* An item attack slot is a shooter's (a caster's basic spends mana, a melee hero's spends nothing). */
    if (row.melee || row.basic || !h) return null;
    /* AN ITEM THE WORN WEAPON CANNOT SHOOT IS NO SHOT (Andy 2026-10-23): the slot is passed over and the next
       one fires. A bow loosed Copper Whetstones (Melee ammo), one a shot, from a slot ahead of its arrows. */
    if (!shootsItem(u.role, itemRow(h, id))) return null;
    const l = own ? ownShotLine(h, id) : shotLine(h, id);
    if (!l.id || l.why) return { why: shotWait(l) };
    const size = footprintOf(slot, h);
    /* A ONE-TARGET item shoots the swing's own target, as the loaded ammo does (a pull's first shot at a pack
       that holds no target yet fell to the loaded ammo); an area item takes its best aim. */
    const aim = cx.aim && cx.aim.alive ? cx.aim : size <= 1 ? t : (bestAim(inst, u, row.range, size, slot) || {}).aim;
    return aim && inRange(inst, u, aim) ? { ammo: id, price: id, size, aim } : { why: 'out_of_range' };
  }, sc);
  if (!got && wornShort) h.hs.goldOut = true;
  return got;
}
