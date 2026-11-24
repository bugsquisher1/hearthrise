// ============================================================
// src/core/hunt/amount.js — THE AMOUNT PIPELINE: EVERY AMOUNT IN A FIGHT, IN STEPS (lane/stage3-pipeline; 27-formula-overhaul.md D-1 to D-8,
// 04-math-strategy.md sections 2, 3 and 12).
//
// One function for a blow and one for a heal, four stages in a fixed order, each traced (src/data/amount.js says why each number is what
// it is):
//   1. base share   the move's share (the caller's `mean`, in the source's units) x the source's top share (a hero: blowTopBp of its weapon;
//                   a monster: its row's blow x pressurePm) x the caller's multipliers (`mult`: a version's step, a store shot's share, the
//                   hero's stance, a called boss's guard)
//   2. x s ^ gap    s = 1 + DANGER.powerStep; gap = the attacker's rating - the defender's (src/core/bands.js ratingPm), in whole steps,
//                   with every active conditional step added (the power ledger, the party's auras, the worn Traits that hold on this blow
//                   or heal, src/core/hunt/trait-rules.js, and each D-8 multiplier as steps)
//   3. x the roll   one draw, (1000 - rollSpreadPm) .. (1000 + rollSpreadPm) permille, on the hunt's own `s` stream
//   4. x reference  the display curve of the Level the amount is read against (refHealth): the ground's refLevel for a monster, the hero's
//                   own Level for a blow at a hero or a heal it casts
// rounded once, at least 1. A ground's reference company sits at a gap of 0 on its reference step (refRatingPm), so the reference fight
// starts where it was and every other company is so many steps from it.
//
//   stepsOn(inst)                    is the pipeline on for this hunt? (on the Danger scale, on a ground that names its reference Level)
//   refHealth(L), refMana(L)         the display curves (core-model.js VITALS with no armor bonus)
//   refRatingPm(ground)              R: the reference company's rating on the ground, thousandths of a Level
//   offensePm(u), defensePm(u, ward) a hero's two ratings (its armor or its ward), thousandths of a Level
//   stepsOf(mult)                    the whole power steps nearest a multiplier, exactly (no logarithm: the browser and the edge agree)
//   ratioOf(steps)                   (1 + powerStep) ^ steps, exactly
//   blowAmount(inst, c)              one blow on the scale (damage.js hurt), with its trace when c.trace is an object
//   healAmount(inst, u, mean, c)     one heal or shell on the scale (abilities.js)
//   manaOn(inst, u, n), supplyOn(inst, u, stat, n)  a typed mana cost, a food's or a drink's restore, as shares of the reference
//   defenseGearPm(equipment, items)  { armorPm, wardPm }: the gear part split by armor weight (data/amount.js defenseSplit)
//   THE REFERENCE OUTPUT stage 4 (monster-formula) reads: a basic blow of weapon type w at a gap of 0 against a monster of Level L lands
//   AMOUNT.blowTopBp[w] / 10000 x refHealth(L) / 2 HP on its mean (its top over the old 1-to-max roll), every move a share of that
//
// Off the scale nothing here is read: damage.js, abilities.js, status.js and monster-spells.js play the old chain.
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random, no Math.log or Math.pow: multiplications, one division and Math.round.
// ============================================================

import { DANGER, DANGER_GROUNDS, GEAR_STEPS } from '../../data/danger.js';
import { AMOUNT } from '../../data/amount.js';
import { VITALS, ARMOUR_WEIGHT, refHealthOf } from '../../data/core-model.js';
import { powSquare } from '../../data/wage.js';
import { ratingPm, bandAbs } from '../bands.js';
import { ledgerSteps } from '../power-ledger.js';
import { temperLevelsOn } from '../temper-steps.js';
import { auraRowsOn } from './auras.js';
import { withTraits } from './trait-rules.js';
import { dangerOn, itemLevelOf } from './danger.js';
import { isHero, isMonster } from './sides.js';

const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const lvOf = (u) => (u && Number.isInteger(u.heroLv) && u.heroLv >= 1 ? u.heroLv : 1);
const S = 1 + DANGER.powerStep;
const CAP = GEAR_STEPS.conditionalStepsMax;

/** The display curve of health at Level `level` (VITALS, no armor bonus): what a share of health is read against. Its one home is the data
    (core-model.js refHealthOf), which the skill clock counts in too. */
export const refHealth = refHealthOf;
/** The display curve of mana at Level `level`, the same. */
export const refMana = (level) => VITALS.manaBase + VITALS.manaPerLevel * (Math.max(1, Math.floor(Number(level) || 1)) - 1);

const groundRow = (ground) => (ground && own(DANGER_GROUNDS, ground.id) ? DANGER_GROUNDS[ground.id] : null);
const refLevelOf = (ground) => { const g = groundRow(ground); return g && Number.isInteger(g.refLevel) ? g.refLevel : null; };

/** Is the pipeline on for `inst`? On the Danger scale, on a ground whose row names the Level it was built for. */
export const stepsOn = (inst) => !!inst && dangerOn(inst.world) && refLevelOf(inst.ground) !== null;

const R_PM = new Map();
/** R: the reference company's rating on `ground` (src/core/bands.js bandAbs refPm: the ground's refLevel in its base kit), thousandths. */
export function refRatingPm(ground) {
  const id = ground && ground.id;
  if (R_PM.has(id)) return R_PM.get(id);
  const g = groundRow(ground), b = g ? bandAbs(id) : null;
  const r = b ? b.refPm : g && Number.isInteger(g.refLevel) ? ratingPm({ levelPm: 1000 * g.refLevel, gearPm: 1000 * (g.gearLevel || g.refLevel) }) : null;
  R_PM.set(id, r);
  return r;
}

/* the skill Level a unit's skill part says (member.js heroSnapshot skillGapPm over its Level), thousandths */
const skillPmOf = (u) => 1000 * lvOf(u) + (Number.isInteger(u.skillGapPm) ? u.skillGapPm : 0);
/** A hero's OFFENSE rating: its Level, its gear part and its skill part (src/core/bands.js ratingPm), thousandths of a Level. */
export const offensePm = (u) => ratingPm({ levelPm: 1000 * lvOf(u), gearPm: int(u.gearPm), skillLevelPm: skillPmOf(u) });
/** A hero's DEFENSE rating against a plain blow (its armor) or an elemental one (`ward`), thousandths of a Level. */
export const defensePm = (u, ward) => ratingPm({ levelPm: 1000 * lvOf(u), gearPm: int(ward ? u.wardPm : u.armorGearPm), skillLevelPm: skillPmOf(u) });

/* ── exact ratios ── */
const RATIO = new Map();
/** (1 + powerStep) ^ steps for a whole `steps`, either sign, by squaring (the same last bit on every engine). */
export function ratioOf(steps) {
  const n = Math.max(-DANGER.stepMax, Math.min(DANGER.stepMax, Math.round(steps)));
  let r = RATIO.get(n);
  if (r === undefined) {
    r = n >= 0 ? powSquare(S, n) : 1 / powSquare(S, -n);
    if (RATIO.size < 8192) RATIO.set(n, r);
  }
  return r;
}
const STEPS = new Map();
/** THE WHOLE STEPS NEAREST A MULTIPLIER `mult` (> 0): the n whose ratioOf(n) is closest to it, by bisection on the exact ratios (no
    logarithm, so the browser and the edge agree). 0 for 1 or for anything that is not a positive number. */
export function stepsOf(mult) {
  if (!(mult > 0) || mult === 1) return 0;
  const hit = STEPS.get(mult);
  if (hit !== undefined) return hit;
  let lo = -Number(DANGER.stepMax), hi = Number(DANGER.stepMax);
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ratioOf(mid) <= mult) lo = mid; else hi = mid; }
  /* nearest of lo and hi, compared without a division: mult / r(lo) against r(hi) / mult */
  const n = mult * mult <= ratioOf(lo) * ratioOf(hi) ? lo : hi;
  if (STEPS.size < 4096) STEPS.set(mult, n);
  return n;
}
/* a gain held to the conditional ceiling; a cost whole */
const held = (n) => (n > CAP ? CAP : n);

/** THE GEAR PART BY ARMOR WEIGHT (data/amount.js defenseSplit): { armorPm, wardPm }, each piece's item Level plus its weight's split in
    steps (heavy more armor and less ward, light the reverse, medium and a piece with no weight neither), x its slot's weight, thousandths.
    ADDITIVE, so a heavy piece is the same steps of armor at item Level 30 and 3,000 (a share of the item Level would grow with it). */
export function defenseGearPm(equipment, items, temperSteps) {
  const eq = equipment || {}, W = GEAR_STEPS.slotPm;
  const at = (slot) => (eq[slot] && items ? items[eq[slot]] : null);
  const weapon = at('weapon');
  const carried = weapon && weapon.twoHanded === true ? GEAR_STEPS.twoHand : null;
  let armorPm = 0, wardPm = 0;
  for (const slot of Object.keys(W)) {
    const it = carried && carried.includes(slot) ? (slot === 'weapon' ? weapon : null) : at(slot);
    const w = carried && slot === 'weapon' ? carried.reduce((a, s) => a + (W[s] || 0), 0) : carried && carried.includes(slot) ? 0 : W[slot];
    if (!it || !w) continue;
    const split = it.slot && ARMOUR_WEIGHT[it.armourClass] ? AMOUNT.defenseSplit[ARMOUR_WEIGHT[it.armourClass]] : null;
    /* (Temper on steps, src/core/temper-steps.js: a slot's seated ranks are item Levels on what it wears, as in the gear part) */
    const il = itemLevelOf(it) + temperLevelsOn(temperSteps, slot);
    armorPm += w * (il + (split ? split.armorSteps : 0));
    wardPm += w * (il + (split ? split.wardSteps : 0));
  }
  return { armorPm, wardPm };
}

/** A hero's TOP SHARE of a basic blow, hundredths of a percent of a reference health (data/amount.js blowTopBp by its weapon type). */
export const topBpOf = (u) => (u && Number.isInteger(u.blowBp) && u.blowBp > 0 ? u.blowBp : AMOUNT.blowTopBp.neutral);

/* the D-8 multipliers a hero carries, as ledger rows of the gear slice (crit, the answer to this monster), the consumable slice (a damage
   food) and the temper slice (Tempering), so each is held to its slice's cap and none stacks past it */
function heroRows(u, channel, c) {
  const rows = [];
  const add = (slice, steps, key) => { if (steps) rows.push({ slice, raises: channel, steps, key }); };
  if (channel === 'offense' || channel === 'heal') {
    add('temper', stepsOf(1 + int(u.blowsPm) / 1000), 'blows');
    add('consumable', stepsOf(1 + int(u.buffDmgPm) / 1000), 'food');
  }
  if (channel === 'offense') {
    add('gear', stepsOf(1 + (int(u.critPm) / 1000) * (c.critMult - 1)), 'crit');
    const answer = stepsOf(int(c.answerPm || 1000) / 1000);
    if (answer > 0) add('gear', answer, 'answer');
  }
  if (channel === 'defense') add('temper', stepsOf(1000 / (1000 - Math.min(999, Math.max(0, int(u.armorPm))))), 'armor');
  return rows;
}

/**
 * ONE BLOW ON THE SCALE (damage.js hurt): c = { source, target, mean (the move's mean, in the source's units: a hero's thousandths of its top,
 * a monster's row blow), mult (permille: a version's step, a store shot's share, stances, a guard), el (the target's element permille for
 * this blow), ward (the blow has an element: it reads ward), answerPm (a hero's weapon weakness x bane x enchant, permille), markPm (the
 * target's mark and marking statuses), slowPm (the source's slow), critMult, rng, trace?, tag? (the hit's tag: the move a worn Trait's `move`
 * reads) }. Answers the whole HP it lands (at least 1); the worn Traits that held on it are left on c.traits (trait-rules.js withTraits).
 */
export function blowAmount(inst, c) {
  const { source, target } = c;
  const R = refRatingPm(inst.ground), L0 = refLevelOf(inst.ground);
  const mult = (Number.isFinite(c.mult) ? c.mult : 1000) / 1000;
  let base, gap = 0, cond = 0;
  if (isMonster(target)) {
    /* a hero's blow at a monster (a source that has left: the reference) */
    base = (c.mean / 1000) * (topBpOf(source) / 10000) * refHealth(L0);
    if (isHero(source)) {
      gap = (offensePm(source) - R) / 1000;
      cond += ledgerSteps(source, 'offense', withTraits(heroRows(source, 'offense', c).concat(auraRowsOn(inst, source)), inst, source, 'offense', c));
    }
    /* the monster's element answer: a weakness is a held gain, a resistance a whole cost */
    const e = stepsOf(c.el / 1000);
    cond += e > 0 ? held(e) : e;
  } else {
    /* a monster's blow at a hero (a tick whose monster has left: the same, from the reference) */
    const L = lvOf(target);
    base = c.mean * (AMOUNT.pressurePm / 1000) * (refHealth(L) / refHealth(L0));
    gap = (R - defensePm(target, c.ward)) / 1000;
    cond -= ledgerSteps(target, 'defense', withTraits(heroRows(target, 'defense', c).concat(auraRowsOn(inst, target)), inst, target, 'defense', c));
    /* the hero's resistance to this blow's element: a held gain for the hero, a weakness a whole cost */
    const e = stepsOf(1000 / Math.max(1, c.el));
    cond -= e > 0 ? held(e) : e;
  }
  /* a mark on the target and a slow on the source: each a held conditional step (27 section 2.1) */
  /* (a status that lowers what a unit takes or deals is a whole cost the other way: a hero's guard, Weakened) */
  if (c.markPm) cond += held(stepsOf(Math.max(1, 1000 + c.markPm) / 1000));
  if (c.dealerPm) cond += held(stepsOf(Math.max(1, 1000 + c.dealerPm) / 1000));
  if (c.slowPm > 0) cond -= held(stepsOf(1 + c.slowPm / 1000));
  const steps = Math.round(gap + cond);
  const sp = AMOUNT.rollSpreadPm;
  const roll = c.rng.int(1000 - sp, 1000 + sp);
  const n = Math.max(1, Math.round(base * mult * (roll / 1000) * ratioOf(steps)));
  if (c.trace && typeof c.trace === 'object') Object.assign(c.trace, { base, mult, gap, cond, steps, ratio: ratioOf(steps), roll, n });
  return n;
}

/**
 * ONE HEAL OR SHELL ON THE SCALE (abilities.js): `mean` a share of the caster's top (thousandths: healPm, shieldPm, a version's step folded
 * in) or, with c.hp, whole HP (Mend's share of its own max HP). The caster's offense over its own Level, its heal ledger and Tempering.
 * c.to: the hero it lands on (a worn Trait's per-target condition reads it; none for an estimate), its Traits that held left on c.traits.
 */
export function healAmount(inst, u, mean, c) {
  const L = lvOf(u);
  const base = c.hp ? mean : (mean / 1000) * (topBpOf(u) / 10000) * refHealth(L);
  const gap = (offensePm(u) - 1000 * L) / 1000;
  const cond = ledgerSteps(u, 'heal', withTraits(heroRows(u, 'heal', c).concat(auraRowsOn(inst, u)), inst, u, 'heal', c));
  const steps = Math.round(gap + cond);
  const sp = AMOUNT.rollSpreadPm;
  /* (no stream: the mean, for an estimate that draws nothing, abilities.js landsShield) */
  const roll = c.rng ? c.rng.int(1000 - sp, 1000 + sp) : 1000;
  const n = Math.max(1, Math.round(base * (roll / 1000) * ratioOf(steps)));
  if (c.trace && typeof c.trace === 'object') Object.assign(c.trace, { base, gap, cond, steps, roll, n });
  return n;
}

/** A TYPED MANA COST as a share of the reference (D-6): the row's cost is its share of the mana of the ground's Level, read at the hero's
    Level. Off the pipeline, or at the ground's Level, it is the row's own. */
export function manaOn(inst, u, n) {
  if (!(n > 0) || !stepsOn(inst)) return n;
  const L0 = refLevelOf(inst.ground);
  return Math.max(1, Math.round((n * refMana(lvOf(u))) / refMana(L0)));
}
/** A FOOD'S OR A DRINK'S RESTORE as a share of the reference (D-5): HP of the ground's Level's health, mana of its mana, read at the hero's. */
export function supplyOn(inst, u, stat, n) {
  if (!(n > 0) || !stepsOn(inst)) return n;
  const L0 = refLevelOf(inst.ground), L = lvOf(u);
  return Math.max(1, Math.round(stat === 'mana' ? (n * refMana(L)) / refMana(L0) : (n * refHealth(L)) / refHealth(L0)));
}
