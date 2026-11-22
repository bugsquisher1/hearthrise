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
// The step changes only where a pull ends (pullEnds), and from that instant every reader sees it: the swing's dial (inst.tier) and the
// pull size (world.density) are set here, and the next pull's pack is re-formed and re-sized to it (pull-cycle.js startPull).
// Each pull's end is a `danger` event (step, to, low, why): what the hunt report and the probe read.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random: nothing here draws a die.
// ============================================================

import { DANGER, CLIMB, RISKS, PAY, DANGER_GROUNDS } from '../../data/danger.js';
import { LEVEL_PACE } from '../../data/core-model.js';
import { charXpForLevel } from '../xp.js';
import { makeEvent } from './events.js';
import { isHero } from './sides.js';

/* down (a pack): its monsters killed since it last stood up whole (spawnPack). A broken-off pack is re-pulled as it stands, its dead
   still down until its normal respawn (fitPull): never re-formed whole, so kill, break off, re-kill pays nothing twice (wave 1). */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([]),
  world: Object.freeze([['risk', 'str'], ['danger', 'int'], ['climb', 'int'], ['clean', 'int'], ['low', 'int'], ['cool', 'int']]),
  pack: Object.freeze([['down', 'int']]),
});

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const clampStep = (s) => Math.max(0, Math.min(DANGER.stepMax, Number.isInteger(s) ? s : 0));

/** True when this world plays the Danger scale (its plan named a stance). The server freezes a stance only on a ground of
    DANGER_GROUNDS (hr_danger_grounds); the engine plays what it was handed. */
export const dangerOn = (world) => !!world && typeof world.risk === 'string' && own(RISKS, world.risk);

/** A plan's stance and starting step from a hero (the party leader's), or null when it names none. */
export function riskOf(hero) {
  if (!hero || typeof hero.risk !== 'string' || !own(RISKS, hero.risk)) return null;
  return { risk: hero.risk, step: clampStep(hero.danger) };
}

/* THE GROUND AS BUILT: the mean size of its route's pockets (each pocket's `spawns`, the pull a density of 0 makes). Once a ground. */
const BASE = new Map();
function basePull(ground) {
  const k = ground && ground.id;
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
 *   coinPm a kill's coin: the pull's share x the depth ratio (hunt-rewards.js payKill), so a pull of any size pays the as-built pull's coin
 */
export function dangerDial(ground, step) {
  const s = clampStep(step);
  const n0 = basePull(ground);
  const pull = Math.max(1, Math.min(DANGER.pullMax, Math.round(n0 * powStep(1 + DANGER.pullStep, s))));
  const share = n0 / pull;
  const each = 1000 * powStep(1 + DANGER.powerStep, s) * share;
  return { id: 'danger', step: s, pull: [pull, pull, pull, pull], hpPm: each, dmgPm: each, aimPm: 1000, lvPm: 1000,
    xpPm: 1000, coinPm: share * depthRatio(ground, s, PAY.payStepCoin) * 1000 };
}

/* A RATIO TO A WHOLE STEP by squaring: multiplications only, each exactly rounded on every JS engine, so a browser's live view and the
   edge's settle reach the same last bit (tests/hunt-scene-live.mjs LV-33: the spec leaves pow's last bit to each engine). */
function powStep(r, n) {
  let out = 1, b = r, k = n;
  while (k > 0) { if (k % 2 === 1) out *= b; b *= b; k = Math.floor(k / 2); }
  return out;
}

/* THE GAP THAT PAYS: the step over the ground's reference step (DANGER_GROUNDS; 0 on a ground with none, which the server never opens),
   held to PAY.gapMax above; under the reference it is never held (a shallower hold earns less a kill, so depth always pays). */
export function gapOf(ground, step) {
  const row = ground && Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, ground.id) ? DANGER_GROUNDS[ground.id] : null;
  return Math.min(PAY.gapMax, clampStep(step) - (row ? row.refStep : 0));
}
/* (1 + rate) ^ gap, by squaring both ways (a negative gap divides): multiplications and one division, exact on every engine */
function depthRatio(ground, step, rate) {
  const g = gapOf(ground, step);
  return g >= 0 ? powStep(1 + rate, g) : 1 / powStep(1 + rate, -g);
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

/**
 * ONE HERO'S LEVEL XP FOR ONE KILL, ALONE (xp-share.js divides it by the heroes at the kill): the share of its own Level the hours
 * table gives one kill at the reference rate, times the depth ratio. 04 section 5: "a kill pays a share of the killer's own Level".
 */
export function levelShareXp(level, step, ground) {
  const L = Number.isInteger(level) && level >= 1 ? level : 1;
  const toNext = charXpForLevel(L + 1) - charXpForLevel(L);
  return (toNext / (hoursForLevel(L) * PAY.refKillsHead)) * depthRatio(ground, step, PAY.payStepXp);
}

/** A world opening on the scale: its stance and the step its plan starts at, nothing climbed yet. */
export function openDanger(world, risk, step) {
  world.risk = risk;
  world.danger = clampStep(step);
  world.climb = 1;
  world.clean = 0;
  world.low = 1000;
  world.cool = 0;
}

/* The step's dial and pull size on the instance from now (the swing's other readers see it at once). */
function applyStep(inst) {
  const dial = dangerDial(inst.ground, inst.world.danger);
  inst.tier = dial;
  inst.world.density = dial.pull[0];
  return dial;
}

/** THE MARGIN (damage.js landHit, after every blow that lands on a hero): the lowest HP any hero reached in this pull. */
export function noteHurt(inst, u) {
  const w = inst.world;
  if (!dangerOn(w) || !isHero(u)) return;
  const pm = u.maxHp > 0 ? Math.floor((Math.max(0, u.hp) * 1000) / u.maxHp) : 0;
  if (pm < w.low) w.low = pm;
}

/** THE FALL BACK INSIDE A PULL (pull-cycle.js runPhase, breakOff): on the scale, a hero under the stance's trigger, or dead, breaks the
    pull off at once, so the fall back comes before the blow that would kill (RD-Q3 a). Never off the scale. */
export const breaksOff = (world) => dangerOn(world) && world.low < RISKS[world.risk].fallPm;

/** A pack monster falls on the scale (pull-cycle.js fallen): its pack counts it down until it stands up whole again (spawnPack). */
export function packDown(world, pocket) {
  const pk = dangerOn(world) && Array.isArray(world.packs) ? world.packs[pocket] : null;
  if (pk) pk.down = (Number.isInteger(pk.down) ? pk.down : 0) + 1;
}
/** May pack `pk` be re-formed at another size (fitPull)? Only whole: none of it is down. */
export const packWhole = (pk) => !pk || !(Number.isInteger(pk.down) && pk.down > 0);

/** A pull begins (pull-cycle.js startPull): its margin starts whole. */
export function pullBegins(world) {
  if (dangerOn(world)) world.low = 1000;
}

/**
 * A PULL ENDS (pull-cycle.js: its pack cleared, its pull abandoned, or its leader dead): the stance reads the pull's margin and the
 * step moves. A hero died (low 0): down CLIMB.deathSteps. Under the stance's trigger: a fall back, down CLIMB.fallSteps. At or over its
 * climb threshold: a clean pull, and CLIMB.cleanRun of them in a row climb. Between the two: the step holds and the climb goes back
 * to one step. Answers the step's dial when it moved, else null.
 */
export function pullEnds(inst, sc) {
  const w = inst.world;
  if (!dangerOn(w)) return null;
  const st = RISKS[w.risk], from = w.danger, low = w.low;
  const cooling = w.cool > 0;
  if (cooling) w.cool -= 1;
  let why = 'hold', to = from;
  if (low <= 0 || low < st.fallPm) {
    why = low <= 0 ? 'death' : 'fall';
    to = from - (low <= 0 ? CLIMB.deathSteps : CLIMB.fallSteps);
    w.climb = 1; w.clean = 0; w.cool = CLIMB.coolPulls;
  } else if (low >= st.cleanPm) {
    /* (a clean pull inside the cool-down after a fall back counts for nothing: the party steadies before it climbs again) */
    if (!cooling) {
      w.clean += 1;
      if (w.clean >= CLIMB.cleanRun) { why = 'climb'; to = from + w.climb; w.climb = Math.min(CLIMB.climbMax, w.climb * 2); w.clean = 0; }
    }
  } else { w.clean = 0; w.climb = 1; }
  w.danger = clampStep(to);
  w.low = 1000;
  /* A DEATH SETTLES THE STANCE (RISKS afterDeath): the rest of the hunt plays the stance one notch safer, from the next pull */
  if (why === 'death' && own(RISKS, st.afterDeath)) w.risk = st.afterDeath;
  sc.emit(makeEvent('danger', sc.atMs, { step: from, to: w.danger, low, why, risk: w.risk }));
  return w.danger !== from ? applyStep(inst) : null;
}

/** READINESS (the regroup's exit, pull-cycle.js): every standing hero at or over DANGER.readyPm of its max HP. Always ready off the scale. */
export function readyToPull(inst, heroes) {
  if (!dangerOn(inst.world)) return true;
  return heroes.every((h) => !h.alive || h.hp * 1000 >= DANGER.readyPm * h.maxHp);
}

/** How long a cleared pack stays down: the scale's short wait (the pace is the party's), else the ground's respawn. */
export const respawnMsOf = (inst) => (dangerOn(inst.world) ? DANGER.respawnMs : inst.ground.respawnMs);
