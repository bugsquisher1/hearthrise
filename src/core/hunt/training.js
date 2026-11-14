// ============================================================
// src/core/hunt/training.js — THE TRAINING GROUND'S RULES IN THE ONE ENGINE (src/data/training.js; Tyler 2026-11-08, 2026-10-14)
//
// A training session is a hunt instance on a training ground (hunt-grounds.js TRAINING_GROUNDS, `train` { place, skill }),
// settled by src/core/combat-sim.js like any hunt, viewed or not (CLAUDE.md §6: one engine, no second XP path). Four rules
// tell it apart, and every one lives here so the hunt files carry one call each:
//
//   THE DUMMY NEVER FALLS (damage.js hurt -> dummyStands): a blow that empties a `dummy` row finds it whole again at once. No
//     kill event, so no Level XP, coin, drop, kill counter, Bestiary or task credit can follow from it.
//   ITS BLOW NEVER TAKES A HERO UNDER THE FLOOR (damage.js hurt -> dummyBlow): TRAINING_RULES.hpFloorPm of the hero's max HP.
//     Nobody dies in the yard, so nobody pays a death's price there.
//   THE PAY (hunt-rewards.js -> trainingSwing): the trained skill ONLY, at its TRAINING_RULES.xpPermille of what the same event
//     teaches on a hunting ground: Melee and Ranged per HP the hero's blows remove (COMBAT_XP.hitXpPerDamage), Magic per mana
//     spent (xp-share.js magicXpFor), Defense per blow aimed at an armoured hero (a shield's block at blockMult) read at the
//     HERO'S own Level, since the dummy keeps pace with whoever trains on it. Nothing else is paid by any route.
//   NO STAMINA (combat-sim.js): a training session spends none and proposes none; the pool rests while the hero trains
//     (the server's hr_stamina_of). And THE HOUR'S EDGE (trainingStopMs, the edge settle): a settle of a yard session that
//     still has hours to buy stops at the first instant of its next unpaid hour, so the server charges that hour (or ends
//     the session `gold_out`) before a swing of it is played.
//
// Draws nothing. PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { TRAINING_RULES } from '../../data/training.js?v=0.2.130';
import { COMBAT_XP } from '../../data/core-model.js?v=0.2.130';
import { FAMILY_SKILL, DAMAGE_XP_FAMILIES } from '../../data/skills.js?v=0.2.130';
import { magicXpFor } from './xp-share.js?v=0.2.130';

const call = (fx, name, ...args) => (fx && typeof fx[name] === 'function' ? fx[name](...args) : undefined);

/** What ground `ground` trains, { place, skill }, or null for a hunting ground. */
export function trainOf(ground) {
  const t = ground && ground.train;
  return t && typeof t.skill === 'string' && typeof t.place === 'string' ? t : null;
}

/** A DUMMY'S BLOW AT A HERO (damage.js hurt): `dmg` as it would land, capped so the hero stays at or over the floor. Any other blow: `dmg`. */
export function dummyBlow(dealerRow, target, dmg) {
  if (!dealerRow || dealerRow.dummy !== true || !target || target.side !== 'hero') return dmg;
  const floor = Math.ceil((Number(target.maxHp) || 0) * TRAINING_RULES.hpFloorPm / 1000);
  return Math.max(0, Math.min(dmg, (Number(target.hp) || 0) - floor));
}

/** A DUMMY NEVER FALLS (damage.js hurt): a `dummy` row brought to 0 HP stands whole again, before anyone can read it as a kill. */
export function dummyStands(row, target) {
  if (row && row.dummy === true && target && target.side === 'mon' && target.hp <= 0) target.hp = target.maxHp;
}

/**
 * THE YARD'S EDGE (supabase/functions/hr-accrue/hunt-settle.js readHuntSettle): the instant a settle of `session` (the server's
 * read: hunt_from_ms, hours_limit) on `ground` must stop at, or Infinity. A yard session's hours_limit is the hours it has PAID
 * (hr_training_start pays the first, the settle that lands on each later hour's first instant pays that one); while it can still
 * buy one (under TRAINING_RULES.maxHours) its settle stops exactly there, so the hour is paid before a swing of it is played. At
 * the last hour, or on the house dummy (paid once), nothing is cut: the engine's own `hours` end stands. `fromMs` is the window's
 * start: a stop the window already stands on (a server that has not paid that hour) cuts nothing, so the engine ends the session
 * `hours` at it and no session is ever left owed and unplayable.
 */
export function trainingStopMs(ground, session, fromMs) {
  if (!trainOf(ground) || !session) return Infinity;
  const hours = Math.floor(Number(session.hours_limit));
  const from = Math.floor(Number(session.hunt_from_ms));
  if (!(hours >= 1) || hours >= TRAINING_RULES.maxHours || !Number.isFinite(from)) return Infinity;
  const stop = from + hours * TRAINING_RULES.hourMs;
  return stop > Math.floor(Number(fromMs)) ? stop : Infinity;
}

/* THE DEFENSE A BLOW AIMED AT `m` TEACHES on a training ground, before the share: only while it wears armour, read at the hero's own Level
   (its unit's heroLv, combat-sim.js syncUnit), a shield's block at blockMult; a dodge pays the plain rate (hunt-rewards.js defenseXp's rule). */
function defenseOf(m, heroUnit, attacker, blocked) {
  if (!m || m.armoured !== true || !attacker || attacker.side !== 'mon') return 0;
  const lv = heroUnit && Number.isInteger(heroUnit.heroLv) && heroUnit.heroLv > 0 ? heroUnit.heroLv : 1;
  return (lv * COMBAT_XP.defenseXpPerLevelPermille / 1000) * (blocked && m.shield === true ? COMBAT_XP.blockMult : 1);
}

/**
 * WHAT ONE SWING ON A TRAINING GROUND PAYS (hunt-rewards.js's one door for it). `members` maps a hero unit id to its member, `events` are
 * the swing's world events, `unitOf(id)` the swing's units, `ctx.train` the ground's { place, skill }. Only the trained skill is credited,
 * through the member's own fx sink (addXp), at that skill's TRAINING_RULES.xpPermille. Answers the swing's deaths (a hero killed: the floor makes it a
 * defect, answered as a hunt answers one, and the server refuses a training window that holds one).
 */
export function trainingSwing(members, events, unitOf, ctx) {
  const skill = ctx.train.skill;
  const pm = (Number(TRAINING_RULES.xpPermille[skill]) || 0) / 1000;
  const pay = (m, n) => { if (m && n > 0) call(m.fx, 'addXp', skill, n * pm); };
  const deaths = [];
  for (const ev of events) {
    switch (ev.type) {
      case 'dmg': {
        const m = members.get(ev.u);
        const t = unitOf(ev.t);
        /* a blow trains its weapon's skill (skills.js FAMILY_SKILL): paid only when that is the skill trained here */
        if (m && t && t.side === 'mon' && ev.amount > 0 && DAMAGE_XP_FAMILIES.includes(m.family) && FAMILY_SKILL[m.family] === skill) {
          pay(m, ev.amount * COMBAT_XP.hitXpPerDamage);
        }
        /* A status tick (`dot`) is not a blow: it trains no Defense (Tyler 2026-10-22). */
        if (skill === 'defense' && ev.dot !== true) pay(members.get(ev.t), defenseOf(members.get(ev.t), unitOf(ev.t), unitOf(ev.u), false));
        break;
      }
      case 'miss': {
        /* A dodge trains Defense at the plain rate, a shield's block at its multiple (hunt-rewards.js, the same rule). */
        if (skill === 'defense') pay(members.get(ev.t), defenseOf(members.get(ev.t), unitOf(ev.t), unitOf(ev.u), ev.dodge !== true));
        break;
      }
      case 'cast':
      case 'shot': {
        const m = members.get(ev.u);
        if (skill === 'magic' && m && ev.mana > 0 && ev.magicXpMult > 0) pay(m, magicXpFor(ev.mana, ev.magicXpMult / 1000));
        break;
      }
      case 'kill': {
        if (members.has(ev.t)) {
          const k = unitOf(ev.u);
          deaths.push({ unit: ev.t, atMs: ev.atMs, monster: k && k.side === 'mon' ? k.kind : '' });
        }
        break;
      }
      default: break;
    }
  }
  return deaths;
}
