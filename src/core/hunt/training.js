// ============================================================
// src/core/hunt/training.js — THE TRAINING GROUND'S RULES IN THE ONE ENGINE (src/data/training.js; Tyler 2026-11-08, 2026-10-14, 2026-11-14)
//
// A training session is a hunt instance on a training ground (hunt-grounds.js TRAINING_GROUNDS, `train` { place, skill }),
// settled by src/core/combat-sim.js like any hunt, viewed or not (CLAUDE.md §6: one engine, no second XP path). These rules
// tell it apart, and every one lives here so the hunt files carry one call each:
//
//   THE DUMMY NEVER FALLS (damage.js hurt -> dummyStands): a blow that empties a `dummy` row finds it whole again at once. No
//     kill event, so no Level XP, coin, drop, kill counter, Bestiary or task credit can follow from it.
//   ITS BLOW NEVER TAKES A HERO UNDER THE FLOOR (damage.js hurt -> dummyBlow): TRAINING_RULES.hpFloorPm of the hero's max HP.
//     Nobody dies in the yard, so nobody pays a death's price there.
//   THE PAY IS THE SETTLED TIME (combat-sim.js -> trainingTick, Tyler 2026-11-14: "the same RATE for every skill/level"): every
//     paid swing interval pays the trained skill TRAINING_RULES.xpPerHour for its share of the hour, and TRAINING_GEAR.boostPermille
//     of it while the hero's training-item hours last (the server's read, trainBoostMs), whatever the blows. The blows, casts and
//     hits taken stay for the look and pay nothing (hunt-rewards.js -> trainingSwing answers only a death). EXACT: the pay of
//     interval i is K(i) - K(i - 1) units of the carry (progression.js XP_FRAC_SCALE), K(i) = floor(i x rate x interval x SCALE /
//     hour), so any run of intervals pays the floor of its exact sum and a whole hour pays exactly the rate, however the windows
//     were cut (TICK-1). No XP perk, buff or pace dial reaches it (member.js addFixedXp).
//   NO SUPPLY (combat-sim.js, damage.js pickShot -> trainingBasic): the hero's bar is shut (only its plain basic swings, for free:
//     no mana, no ammo, no rune, no food; a bow with nothing loaded shoots all the same), and its stop rules don't apply; the yard
//     is no hunt.
//   NO NO-FIGHT END (combat-sim.js): the pay is the time whatever the blows, so the hunt's ten quiet minutes never end a session.
//   NO STAMINA (combat-sim.js): a training session spends none and proposes none; the pool rests while the hero trains
//     (the server's hr_stamina_of). And THE HOUR'S EDGE (trainingStopMs, the edge settle): a settle of a yard session that
//     still has hours to buy stops at the first instant of its next unpaid hour, so the server charges that hour (or ends
//     the session `gold_out`) before a swing of it is played.
//
// Draws nothing. PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { TRAINING_RULES, TRAINING_GEAR } from '../../data/training.js?v=0.2.142';
import { XP_FRAC_SCALE } from '../progression.js?v=0.2.142';
import { DEFAULT_ATTACK_ROW } from './conditions.js?v=0.2.142';

const call = (fx, name, ...args) => (fx && typeof fx[name] === 'function' ? fx[name](...args) : undefined);

/** What ground `ground` trains, { place, skill }, or null for a hunting ground. */
export function trainOf(ground) {
  const t = ground && ground.train;
  return t && typeof t.skill === 'string' && typeof t.place === 'string' ? t : null;
}

/** The bar a training hero fights with (combat-sim.js): its plain basic alone. No spell, no rune, no food, no drink. */
export const TRAINING_SLOTS = Object.freeze([DEFAULT_ATTACK_ROW]);

/**
 * THE YARD'S BASIC, ITS ONE DOOR FOR SUPPLY (damage.js pickShot, the loaded row): on a training ground the plain basic swings at
 * `t` for free, priced at nothing (no ammo, no mana, so payBasic is never asked), whatever the hero carries: a bow with no arrows
 * loaded or none left shoots the dummy too (Tyler 2026-11-16: it never landed a blow and the session ended `no_fight` after ten
 * minutes). Null on a hunting ground, where the shot is the bar's.
 */
export function trainingBasic(ground, t) {
  return trainOf(ground) ? { ammo: null, price: undefined, size: 1, aim: t } : null;
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

/* THE EXACT SLICE: K(i) = floor(i x num / den) in carry units, the fraction reduced once so i x num stays a safe integer for any
   session (12 hours of 100 ms intervals x 2.5e6 is about 1.1e12); past that, BigInt. */
const gcd = (a, b) => { let x = a, y = b; while (y) [x, y] = [y, x % y]; return x; };
function slicer(perHour, tickMs) {
  const num0 = perHour * tickMs * XP_FRAC_SCALE, den0 = TRAINING_RULES.hourMs;
  const g = gcd(num0, den0);
  const num = num0 / g, den = den0 / g;
  const K = (i) => (Number.isSafeInteger(i * num) ? Math.floor((i * num) / den) : Number((BigInt(i) * BigInt(num)) / BigInt(den)));
  return (i) => K(i) - K(i - 1);
}
const SLICERS = new Map();
function sliceOf(perHour, tickMs) {
  const key = perHour + ':' + tickMs;
  let f = SLICERS.get(key);
  if (!f) { f = slicer(perHour, tickMs); SLICERS.set(key, f); }
  return f;
}

/**
 * ONE PAID SWING INTERVAL OF A TRAINING SESSION (combat-sim.js, right after the interval is counted): member `m` (its hs and fx)
 * trains `train.skill` for `tickMs`. Pays the rate's slice of interval hs.swingIndex (the session's own count, the same however the
 * windows were cut), plus the boost's slice while the server-read item hours (hs.trainBoostMs) cover a whole interval; those hours
 * fall by the interval and hs.tally.boostMs counts them (the settle's claim, which the server re-proves and spends).
 */
export function trainingTick(m, train, tickMs) {
  const hs = m && m.hs;
  if (!hs || !train || !(tickMs > 0)) return;
  const i = Math.max(1, Math.floor(Number(hs.swingIndex) || 0));
  let units = sliceOf(TRAINING_RULES.xpPerHour, tickMs)(i);
  if (Math.floor(Number(hs.trainBoostMs) || 0) >= tickMs) {
    units += sliceOf(TRAINING_RULES.xpPerHour * (TRAINING_GEAR.boostPermille - 1000) / 1000, tickMs)(i);
    hs.trainBoostMs -= tickMs;
    hs.tally.boostMs = (Number(hs.tally.boostMs) || 0) + tickMs;
  }
  if (units > 0) call(m.fx, 'addFixedXp', train.skill, units / XP_FRAC_SCALE);
}

/**
 * WHAT ONE SWING ON A TRAINING GROUND PAYS (hunt-rewards.js's one door for it): NOTHING. The pay is the time (trainingTick); a
 * blow, a cast, a hit taken or a kill event moves no value. Answers only the swing's deaths (a hero killed: the floor makes it a
 * defect, answered as a hunt answers one, and the server refuses a training window that holds one).
 */
export function trainingSwing(members, events, unitOf) {
  const deaths = [];
  for (const ev of events) {
    if (ev.type !== 'kill' || !members.has(ev.t)) continue;
    const k = unitOf(ev.u);
    deaths.push({ unit: ev.t, atMs: ev.atMs, monster: k && k.side === 'mon' ? k.kind : '' });
  }
  return deaths;
}
