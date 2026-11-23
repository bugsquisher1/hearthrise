// ============================================================
// src/core/hunt/danger.js — THE DANGER SCALE: one step, the climb and the fall back, pulls on readiness (lane/v1-climb).
//
// docs/design/redesign/02-architecture.md package 3 and section 11: "The step is read for each pull inside the one settle. Climb and
// fall back are engine states, viewed or not", and "the settle starts a pull only when the party meets the readiness rule". Every
// number is src/data/danger.js's. A hunt plays the scale when its leader's plan names a risk stance (`hero.risk`, frozen on the world
// when it opens, with the step the company held before, `hero.danger`); a hunt with none plays its tier row exactly as before.
//
// HUNT STATE, PERSISTED WITH THE WORLD (so any cut of the settle windows walks the same steps, and a viewed hunt and a closed one
// are the one hunt):
//   risk    the stance ('' = the scale is off: a tier hunt)
//   danger  the step the next pull is made at (0 = the ground as built)
//   climb   how far the next climb goes (1, doubling on each climb up to CLIMB.climbMax, back to 1 on any pull that is not clean)
//   clean   clean pulls in a row since the last climb
//   low     the lowest HP any hero reached in the pull under way, permille of its max (1000 at each pull's start; 0 = a hero died)
//   cool    pulls left before the party may climb again after a fall back
//   lowHero the seat of the hero that reached `low` (null: none yet, or a hero with no seat), and lowBy the kind of the monster whose
//           blow took it there ('' for none): what a fall back names (R2, lane/r2-danger-falls). Persisted with `low` because the blow
//           and the break-off can sit either side of a settle cut, and a hero that died has left the world by the next window.
// The step changes only where a pull ends (pullEnds), and from that instant every reader sees it: the swing's dial (inst.tier) and the
// pull size (world.density) are set here, and the next pull's pack is re-formed and re-sized to it (pull-cycle.js startPull).
// Each pull's end is a `danger` event (step, to, low, why): what the hunt report and the probe read. A fall back or a death also names
// its cause: `hero` (the seat of the hero that broke the pull off, when it has one) and `monster` (the kind whose blow took it under the
// line, 'unknown' for none). The analyzer tally keeps the deepest step and the last falls (src/core/hunt/report.js).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random: nothing here draws a die.
// ============================================================

import { DANGER, CLIMB, RISKS, PAY, DANGER_GROUNDS, POWER, GEAR_STEPS, HOLDER } from '../../data/danger.js';
import { holderTank } from './targeting.js';
import { WAGE, powSquare } from '../../data/wage.js';
import { LEVEL_PACE } from '../../data/core-model.js';
import { charXpForLevel } from '../xp.js';
import { ledgerSteps } from '../power-ledger.js';
import { auraRowsOn } from './auras.js';
import { temperLevelsOn } from '../temper-steps.js';
import { makeEvent } from './events.js';
import { isHero, isMonster } from './sides.js';

/* down (a pack): its monsters killed since it last stood up whole (spawnPack). A broken-off pack is re-pulled as it stands, its dead
   still down until its normal respawn (fitPull): never re-formed whole, so kill, break off, re-kill pays nothing twice (wave 1). */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([]),
  world: Object.freeze([['risk', 'str'], ['danger', 'int'], ['climb', 'int'], ['clean', 'int'], ['low', 'int'], ['cool', 'int'],
    ['lowHero', 'int?'], ['lowBy', 'str']]),
  pack: Object.freeze([['down', 'int']]),
});

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const clampStep = (s) => Math.max(0, Math.min(DANGER.stepMax, Number.isInteger(s) ? s : 0));
/* THE TOP OF THE GROUND (lane/r10-more-grounds; 12-targets.md 3.2): no step past its band's topStep (DANGER_GROUNDS), so the climb stops at
   depth 20 on every stance and a start held from before plays there; a ground with no row is held only by the scale's stepMax. */
const stepOn = (ground, s) => {
  const row = ground && own(DANGER_GROUNDS, ground.id) ? DANGER_GROUNDS[ground.id] : null;
  return Math.min(row && Number.isInteger(row.topStep) ? row.topStep : DANGER.stepMax, clampStep(s));
};

/** True when this world plays the Danger scale (its plan named a stance). The server freezes a stance only on a ground of
    DANGER_GROUNDS (hr_danger_grounds); the engine plays what it was handed. */
export const dangerOn = (world) => !!world && typeof world.risk === 'string' && own(RISKS, world.risk);

/** A plan's stance and starting step from a hero (the party leader's), or null when it names none. */
export function riskOf(hero) {
  if (!hero || typeof hero.risk !== 'string' || !own(RISKS, hero.risk)) return null;
  return { risk: hero.risk, step: clampStep(hero.danger) };
}

/* THE GROUND AS BUILT: the mean size of its route's pockets (each pocket's `spawns`, the pull a density of 0 makes). Once a ground ROW:
   keyed by the row itself, not its id, so a what-if copy of a ground (play-ground.mjs opts.ground, a test's stage) never reads the
   original's size, nor the original the copy's (lane/drop-formula 2026-11-22: the cache was keyed by id). */
const BASE = new WeakMap();
function basePull(ground) {
  const k = ground;
  if (BASE.has(k)) return BASE.get(k);
  const route = Array.isArray(ground.route) && ground.route.length ? ground.route : ground.pockets.map((_, i) => i);
  const n = route.reduce((a, p) => a + ground.pockets[p].spawns.length, 0) / route.length;
  BASE.set(k, n);
  return n;
}

/**
 * THE DIAL OF STEP `step` ON `ground` (a hunt-tiers.js-shaped dial, read through atTier / levelAtTier by every engine reader):
 *   pull   monsters a pull, one entry per party size (the same for every size, as a tier's)
 *   hpPm   each monster's health, permille of its row: the step's ratio over the pull, times the as-built mean over this pull's size
 *   dmgPm  each monster's blow, the same share
 *   aimPm, lvPm  1000: its aim and its Level stay the row's, so the step's growth is the ratio exactly, once on health and once on blow
 *   xpPm   1000: a kill's Level XP on the scale is a share of each killer's own Level (levelShareXp, xp-share.js), never its row's
 *   coinPm a kill's coin: PAY.coinPm x the pull's share x the depth ratio at COIN_STEP (hunt-rewards.js payKill), so a pull of any size
 *          pays the as-built pull's coin times the scale's gold level, and an HOUR a step deeper pays the wage's coin ratio more
 */
export function dangerDial(ground, step) {
  const s = stepOn(ground, step);
  const n0 = basePull(ground);
  const pull = Math.max(1, Math.min(DANGER.pullMax, Math.round(n0 * powStep(1 + DANGER.pullStep, s))));
  const share = n0 / pull;
  const each = 1000 * powStep(1 + DANGER.powerStep, s) * share;
  return { id: 'danger', step: s, pull: [pull, pull, pull, pull], hpPm: each, dmgPm: each, aimPm: 1000, lvPm: 1000,
    xpPm: 1000, coinPm: share * depthRatio(ground, s, COIN_STEP) * PAY.coinPm };
}
/* THE COIN RATIO A PULL, SO THE HOUR PAYS THE WAGE'S (lane/ledger-l10, 19-power-ledger L10, V13 "gold follows depth"): a pull a step deeper
   carries (1 + powerStep) more health, so it takes about that much longer to clear and an hour holds that many fewer pulls. Paid at the
   wage's payStepCoin a PULL, coin an HOUR rose only (1 + payStepCoin) / (1 + powerStep), 0.05% a step, and loot (a kill's rows, no depth
   term) fell with the kills: +38 held steps moved gold +59 +- 63 a hero-hour (measured, tools/balance-program/redesign/roads l10). A pull
   pays the step's length back too, so an hour a step deeper pays payStepCoin more: one coin ratio a step, per hour, across grounds (the
   wage) and inside one. At the reference step it is 1: the reference hour is unchanged. One multiplication, exactly rounded everywhere. */
const COIN_STEP = (1 + WAGE.payStepCoin) * (1 + DANGER.powerStep) - 1;

/* A RATIO TO A WHOLE STEP by squaring: multiplications only, each exactly rounded on every JS engine, so a browser's live view and the
   edge's settle reach the same last bit (tests/hunt-scene-live.mjs LV-33). One home: src/data/wage.js powSquare. */
const powStep = powSquare;

/* THE GAP THAT PAYS: the step over the ground's reference step (DANGER_GROUNDS; 0 on a ground with none, which the server never opens),
   held to PAY.gapMax above and to the ground's top (12-targets.md 3.2: no more pay past depth 20); under the reference it is never held
   (a shallower hold earns less a kill, so depth always pays). */
function gapOf(ground, step) {
  const row = ground && Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, ground.id) ? DANGER_GROUNDS[ground.id] : null;
  return Math.min(PAY.gapMax, row ? row.topStep - row.refStep : PAY.gapMax, clampStep(step) - (row ? row.refStep : 0));
}
/* (1 + rate) ^ gap, by squaring both ways (a negative gap divides): multiplications and one division, exact on every engine. Under the
   reference it never falls past PAY.floor (12-targets 2.1): a shallower hold costs its kills an hour, not twice. */
function depthRatio(ground, step, rate) {
  return gapPayRatio(gapOf(ground, step), rate);
}
/** THE PAY RULE ON A WHOLE GAP (04 section 7: pay = reference pay x payStep ^ gap, never under PAY.floor below; the caller holds the gap to
    its ceiling, gapOf here, src/core/hunt/tower.js towerShareXp on the Tower): the one ratio a scale ground's depth and the Burning Tower's
    floors both pay by. */
export function gapPayRatio(gap, rate) {
  const g = Math.trunc(Number(gap) || 0);
  return g >= 0 ? powStep(1 + rate, g) : Math.max(PAY.floor, 1 / powStep(1 + rate, -g));
}

/* ── THE POWER STEP (lane/r9-power-step; src/data/danger.js POWER, the gear table src/data/gear-steps.js through it) ── */
/* A piece's item Level: its row's `iL` (every scale ground's drop carries its ground's: src/data/danger.js scaleItemLevels); a piece no
   scale ground drops has none, and its `reqLv` stands in. */
const itemLevelOf = (it) => {
  const n = Math.floor(Number(it && (Number.isInteger(it.iL) ? it.iL : it.reqLv)));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/**
 * A HERO'S GEAR PART, in thousandths of a step (member.js heroSnapshot, from the server's gear and the catalogue): each worn piece's item
 * Level x its slot's weight (GEAR_STEPS.slotPm; a two-handed weapon also carries GEAR_STEPS.twoHand's other slots). A whole kit at item
 * Level X is 1000 X; an empty slot adds 0; ammo has no weight (a supply). Whole numbers. Read only on the scale (powerPm).
 * TEMPER (src/core/temper-steps.js; 21 section 2): `temperSteps`, the server's seated ranks by slot, add +ilPerRank item Level a rank to
 * whatever that slot wears (a two-handed weapon's carries with it; an empty slot adds nothing). Absent: the part is what it was.
 */
export function gearPartPm(equipment, items, temperSteps) {
  const eq = equipment || {}, W = GEAR_STEPS.slotPm;
  const at = (slot) => (eq[slot] && items ? items[eq[slot]] : null);
  const levelOn = (slot) => { const il = itemLevelOf(at(slot)); return il > 0 ? il + temperLevelsOn(temperSteps, slot) : 0; };
  const weapon = at('weapon');
  const carried = weapon && weapon.twoHanded === true ? GEAR_STEPS.twoHand : null;
  let sum = 0;
  for (const slot of Object.keys(W)) {
    if (carried && carried.includes(slot)) continue;
    sum += W[slot] * levelOn(slot);
  }
  if (carried) sum += carried.reduce((a, s) => a + (W[s] || 0), 0) * levelOn('weapon');
  return sum;
}
const groundRow = (ground) => (ground && own(DANGER_GROUNDS, ground.id) ? DANGER_GROUNDS[ground.id] : null);
/* A gear part's power steps against the ground's base item Level at weightGear (under the base at weightGearBelow, one-sided: lane/econ-levers):
   whole steps, held inside the scale (a safe float). */
function gearSteps(partPm, row) {
  if (!row || !Number.isInteger(row.gearLevel) || !Number.isInteger(partPm)) return 0;
  const gap = partPm - 1000 * row.gearLevel;
  const s = Math.round((gap * (gap < 0 ? POWER.weightGearBelowPm : POWER.weightGearPm)) / (1000 * 1000));
  return Math.max(-DANGER.stepMax, Math.min(DANGER.stepMax, s));
}
/* (1 + powerStep) ^ steps, either sign, once per whole step (a hunt's heroes wear a handful of kits) */
const RATIO = new Map();
export function stepRatio(steps) {
  let r = RATIO.get(steps);
  if (r === undefined) {
    r = steps >= 0 ? powStep(1 + DANGER.powerStep, steps) : 1 / powStep(1 + DANGER.powerStep, -steps);
    if (RATIO.size < 4096) RATIO.set(steps, r);
  }
  return r;
}

/**
 * THE POWER STEP ON A BLOW (damage.js hurt, after the armor chain; the shield's share is still to come): on the scale, a hero's blow at a
 * monster grows by its gear's steps over the ground's base item Level, and a blow at a hero shrinks by the same (the unit's `gearPm`,
 * member.js heroSnapshot). Answers the permille the blow moves by (temper.js temperedAmount, the part of a point one draw): `pm` as given
 * off the scale, at the ground's base, or for any other pair (a heal is never here). `pm` is the move the blow already carries (Tempering),
 * folded in so the blow draws once.
 */
export function powerPm(inst, source, target, pm) {
  const base = Number.isFinite(pm) ? pm : 0;
  if (!inst || !dangerOn(inst.world)) return base;
  const row = groundRow(inst.ground);
  /* the gear base, plus the conditional steps that hold now, each slice held to its cap (src/core/power-ledger.js: 0 until a source writes) */
  let steps = 0;
  if (isHero(source) && isMonster(target)) steps = gearSteps(source.gearPm, row);
  else if (isMonster(source) && isHero(target)) steps = -gearSteps(target.gearPm, row);
  /* (and the party's auras on the hero, src/core/hunt/auras.js: ledger rows by the party-row rule) */
  if (isHero(source) && isMonster(target)) steps += Math.round(ledgerSteps(source, 'offense', auraRowsOn(inst, source)));
  else if (isMonster(source) && isHero(target)) steps -= Math.round(ledgerSteps(target, 'defense', auraRowsOn(inst, target)));
  if (!steps) return base;
  return Math.round((1000 + base) * stepRatio(steps)) - 1000;
}

/* THE HOURS A LEVEL TAKES (LEVEL_PACE.targets, Tyler's ruling 2026-10-25 section 2: [Level, cumulative hunting hours]). Each span of the
   table is its hours over its Levels; the hours for Level L are read straight between the spans' middles (flat before the first and
   after the last), so the pay a kill makes never jumps at a target Level. Rationals only: the browser and the edge agree to the bit. */
const SPANS = (() => {
  const t = [[0, 0], ...LEVEL_PACE.targets];
  const out = [];
  for (let i = 1; i < t.length; i++) out.push([(t[i - 1][0] + t[i][0]) / 2, (t[i][1] - t[i - 1][1]) / (t[i][0] - t[i - 1][0])]);
  return Object.freeze(out.map((p) => Object.freeze(p)));
})();
export function hoursForLevel(level) {
  const L = Number.isInteger(level) && level >= 1 ? level : 1;
  if (L <= SPANS[0][0]) return SPANS[0][1];
  for (let i = 1; i < SPANS.length; i++) {
    const [a, ha] = SPANS[i - 1], [b, hb] = SPANS[i];
    if (L <= b) return ha + ((L - a) * (hb - ha)) / (b - a);
  }
  return SPANS[SPANS.length - 1][1];
}

/* THE KILLS A HEAD AN HOUR THE HOURS TABLE IS SPLIT OVER: the ground's own, measured at its reference step (DANGER_GROUNDS refKillsHead,
   lane/r10-more-grounds: a Steady four on Hask's Ford kills 220 a head an hour where Muster's kills 120), else PAY.refKillsHead. Never under
   it (tools/gen-danger.mjs refuses one), so the server's one ceiling a kill (hr_danger_level_xp_max) bounds every ground. */
export const refKillsOf = (ground) => {
  const row = groundRow(ground);
  return row && Number.isInteger(row.refKillsHead) ? row.refKillsHead : PAY.refKillsHead;
};

/**
 * ONE HERO'S LEVEL XP FOR ONE KILL, ALONE (xp-share.js divides it by the heroes at the kill): the share of its own Level the hours
 * table gives one kill at the reference rate, times the depth ratio. 04 section 5: "a kill pays a share of the killer's own Level".
 */
export function levelShareXp(level, step, ground) {
  return levelShareAt(level, refKillsOf(ground)) * depthRatio(ground, step, PAY.payStepXp);
}
/** The hours table's share of Level `level` one kill pays at the reference, over `refKills` kills a head an hour: (XP to the next Level /
    the hours that Level takes) / refKills. The reference half of every Level-share kill (levelShareXp, the Tower's towerShareXp). */
export function levelShareAt(level, refKills) {
  const L = Number.isInteger(level) && level >= 1 ? level : 1;
  return (charXpForLevel(L + 1) - charXpForLevel(L)) / (hoursForLevel(L) * refKills);
}

/** A world opening on the scale: its stance and the step its plan starts at, nothing climbed yet. */
export function openDanger(world, risk, step) {
  world.risk = risk;
  world.danger = clampStep(step);
  world.climb = 1;
  world.clean = 0;
  world.low = 1000;
  world.cool = 0;
  world.lowHero = null;
  world.lowBy = '';
}

/* The step's dial and pull size on the instance from now (the swing's other readers see it at once). */
function applyStep(inst) {
  const dial = dangerDial(inst.ground, inst.world.danger);
  inst.tier = dial;
  inst.world.density = dial.pull[0];
  return dial;
}

/* THE HOLDER'S LINE (src/data/danger.js HOLDER): the seat of the lap's holding tank (targeting.js holderTank: the leader's pick, else the
   tanks' turn, which moves only between laps), null with none or with no seat. Its HP reads against the stance's thresholds times
   HOLDER.linePm, so its margin is its HP over that share: one number every hero's HP reads as, compared against the stance's own lines.
   Floored: a whole margin is under a whole line exactly when the HP is under the line's share (pm x 1000 / linePm < fallPm). The world
   keeps the HP itself (`low`, what a fall back names: "Bran at 14%") and its seat; the margin is read from the two, so nothing new
   persists and a settle cut anywhere reads the same. */
function holderSeat(inst) {
  const h = holderTank(inst);
  return h && Number.isSafeInteger(h.seat) && h.seat >= 0 ? h.seat : null;
}
const marginOf = (pm, seat, hs) => (hs !== null && seat === hs && pm < 1000 ? Math.min(1000, Math.floor((pm * 1000) / HOLDER.linePm)) : pm);
/** The pull's margin so far: the lowest HP any hero reached, the holder's read on its line (permille, 1000 = whole, 0 = a death). */
export function marginPm(inst) {
  const w = inst.world;
  return w.low >= 1000 ? w.low : marginOf(w.low, w.lowHero, holderSeat(inst));
}

/** THE MARGIN (damage.js landHit, after every blow that lands on a hero): the lowest HP any hero reached in this pull, and who reached
    it by whose blow (`source`, the dealer: a monster names its kind; none, or not a monster, names nothing). The hero is named by its
    seat (combat-sim.js syncUnit writes it at every boundary, never persisted), the identity the server keeps after the hero has gone. */
export function noteHurt(inst, u, source) {
  const w = inst.world;
  if (!dangerOn(w) || !isHero(u)) return;
  const pm = u.maxHp > 0 ? Math.floor((Math.max(0, u.hp) * 1000) / u.maxHp) : 0;
  const seat = Number.isSafeInteger(u.seat) && u.seat >= 0 ? u.seat : null;
  const hs = holderSeat(inst);
  if (marginOf(pm, seat, hs) >= marginOf(w.low, w.lowHero, hs)) return;
  w.low = pm;
  w.lowHero = Number.isSafeInteger(u.seat) && u.seat >= 0 ? u.seat : null;
  w.lowBy = isMonster(source) && typeof source.kind === 'string' ? source.kind : '';
}

/** THE FALL BACK INSIDE A PULL (pull-cycle.js runPhase, breakOff): on the scale, a hero under the stance's trigger (the holder under its
    own line), or dead, breaks the pull off at once, so the fall back comes before the blow that would kill (RD-Q3 a). Never off the
    scale. Read on every swing: an HP at or over the line is never under it, whoever holds (a margin is never under its HP). */
export const breaksOff = (inst) => dangerOn(inst.world) && inst.world.low < RISKS[inst.world.risk].fallPm && marginPm(inst) < RISKS[inst.world.risk].fallPm;

/** A pack monster falls on the scale (pull-cycle.js fallen): its pack counts it down until it stands up whole again (spawnPack). */
export function packDown(world, pocket) {
  const pk = dangerOn(world) && Array.isArray(world.packs) ? world.packs[pocket] : null;
  if (pk) pk.down = (Number.isInteger(pk.down) ? pk.down : 0) + 1;
}
/** May pack `pk` be re-formed at another size (fitPull)? Only whole: none of it is down. */
export const packWhole = (pk) => !pk || !(Number.isInteger(pk.down) && pk.down > 0);

/* The margin made whole for the next pull, with nobody named. */
function wholeMargin(w) {
  w.low = 1000;
  w.lowHero = null;
  w.lowBy = '';
}

/** A pull begins (pull-cycle.js startPull): its margin starts whole. */
export function pullBegins(world) {
  if (dangerOn(world)) wholeMargin(world);
}

/**
 * A PULL ENDS (pull-cycle.js: its pack cleared, its pull abandoned, or its leader dead): the stance reads the pull's margin and the
 * step moves. A hero died (low 0): down CLIMB.deathSteps. Under the stance's trigger: a fall back, down CLIMB.fallSteps. At or over its
 * climb threshold: a clean pull, and CLIMB.cleanRun of them in a row climb. Between the two: the step holds and the climb goes back
 * to one step. Answers the step's dial when it moved, else null.
 * ONLY A CLEARED PULL IS CLEAN (wave 1): a pull the leash took home cleared nothing and proves nothing, so over the climb threshold it
 * holds and leaves the run as it was (under the trigger it still falls back). So every climb is CLIMB.cleanRun cleared pulls, each
 * followed by its regroup: the server bounds a window's climb by its time (1056-danger-scale.sql hr_danger_bound).
 */
export function pullEnds(inst, sc, cleared = false) {
  const w = inst.world;
  if (!dangerOn(w)) return null;
  /* `low` the HP the event names, `margin` what the stance reads (the holder on its own line, marginPm) */
  const st = RISKS[w.risk], from = w.danger, low = w.low, margin = marginPm(inst);
  const cooling = w.cool > 0;
  if (cooling) w.cool -= 1;
  let why = 'hold', to = from;
  if (low <= 0 || margin < st.fallPm) {
    why = low <= 0 ? 'death' : 'fall';
    to = from - (low <= 0 ? CLIMB.deathSteps : CLIMB.fallSteps);
    w.climb = 1; w.clean = 0; w.cool = CLIMB.coolPulls;
  } else if (margin >= st.cleanPm) {
    /* (a clean pull inside the cool-down after a fall back counts for nothing: the party steadies before it climbs again) */
    if (!cooling && cleared) {
      w.clean += 1;
      if (w.clean >= CLIMB.cleanRun) { why = 'climb'; to = from + w.climb; w.climb = Math.min(CLIMB.climbMax, w.climb * 2); w.clean = 0; }
    }
  } else { w.clean = 0; w.climb = 1; }
  w.danger = stepOn(inst.ground, to);
  /* A FALL BACK NAMES ITS CAUSE (R2): the hero that broke the pull off (its seat, when it has one) and the monster whose blow did it */
  const cause = why === 'fall' || why === 'death'
    ? { ...(Number.isSafeInteger(w.lowHero) ? { hero: w.lowHero } : {}), monster: w.lowBy || 'unknown' } : null;
  wholeMargin(w);
  /* A DEATH SETTLES THE STANCE (RISKS afterDeath): the rest of the hunt plays the stance one notch safer, from the next pull */
  if (why === 'death' && own(RISKS, st.afterDeath)) w.risk = st.afterDeath;
  sc.emit(makeEvent('danger', sc.atMs, { step: from, to: w.danger, low, why, risk: w.risk, ...cause }));
  return w.danger !== from ? applyStep(inst) : null;
}

/** READINESS (the regroup's exit, pull-cycle.js): every standing hero at or over DANGER.readyPm of its max HP. Always ready off the scale. */
export function readyToPull(inst, heroes) {
  if (!dangerOn(inst.world)) return true;
  return heroes.every((h) => !h.alive || h.hp * 1000 >= DANGER.readyPm * h.maxHp);
}

/** How long a cleared pack stays down: the scale's short wait (the pace is the party's), else the ground's respawn. */
export const respawnMsOf = (inst) => (dangerOn(inst.world) ? DANGER.respawnMs : inst.ground.respawnMs);
