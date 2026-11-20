#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/start-kit-pace.mjs — THE NEW PLAYER'S FIRST FIFTEEN LEVELS, PLAYED ON THE REAL ENGINE.
//
// Tyler ruled balance call 27-2 "recommended" (2026-11-20; docs/design/balance-program/27-retention.md, 30-plan.md row L05 and
// guard line G6): hold "Level 10 in 6 hours" on the hero a new player really is, with no event, and re-cut Levels 7 to 9 so none
// takes over 2 hours; Levels 10 to 15 take the XP back. Both light real players quit at Levels 7 to 9, where one Level took this
// hero 2.6 and 3.0 hours (Level 10 at 8.6 h on v0.2.142). The hero and its bounds are data, src/data/core-model.js
// LEVEL_PACE.newPlayer: the sword and shield on the start kit and the start bar, Normal, the Mill Cellar until its hunt ends at
// Level 5, then the ground the Hunts window advises, every supply bought (tools/balance-sim/life.mjs playLife, policy idle). The
// same commit plays the same dice.
//
//   SK-1  the hero reaches newPlayer.level inside newPlayer.hours [lo, hi] hunted hours
//   SK-2  every step L -> L+1 inside a newPlayer.steps band takes at most that band's h hours
//   SK-3  the life reaches the top of the last band (every judged step is played) inside the hours the bounds allow
//
//   node tests/start-kit-pace.mjs           the guard (one life, about 20 s)
//   node tests/start-kit-pace.mjs --mutate  each planted drift must turn its own line red (one life each)
//
// mutant-anchors: none — every mutant plants a curve or a monster scale in memory, never a file
//
// A red SK-1 or SK-2 is a curve or content change that moved the first hours: re-cut src/data/core-model.js LEVEL_CURVE (steps
// 7-15, the total to Level 16 held) and re-measure the careers (tests/level-curve.mjs C1).
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import * as XP from '../src/core/xp.js';
import { LEVEL_PACE } from '../src/data/core-model.js';
import { playLife } from '../tools/balance-sim/life.mjs';
import { scaleMonsters } from '../tools/balance-sim/calibrate.mjs';

const NP = LEVEL_PACE.newPlayer;

/** Level reads for any total-XP function (rising in L): the planted curves' twin of xp.js charLevelFromXp. */
function curveOf(xpFor) {
  return {
    charXpForLevel: xpFor,
    charLevelFromXp: (x) => { let L = 1; while (L < 5000 && xpFor(L + 1) <= x) L++; return L; },
  };
}
/** The top Level the bands judge (the last step's next Level) and the hours a life on the bounds may take to reach it. */
const topOf = (np) => Math.max(...np.steps.map((b) => b.to)) + 1;
const budgetOf = (np) => np.hours[1] + np.steps.reduce((s, b) => s + Math.max(0, b.to - Math.max(b.from, np.level) + 1) * b.h, 0);

/** Every failed line for one played life (`miles` as playLife returns them). */
export function judge(life, np = NP) {
  const out = [];
  const at = (L) => (L === 1 ? 0 : life.miles['0:' + L] ? life.miles['0:' + L].h : null);
  const top = topOf(np);
  if (at(top) === null) out.push(`SK-3: the hero stopped at Level ${life.reached[0]} after ${life.hours.toFixed(1)} h, short of Level ${top} (budget ${budgetOf(np)} h)`);
  const t = at(np.level);
  if (t === null || !(t >= np.hours[0] && t <= np.hours[1])) out.push(`SK-1: Level ${np.level} at ${t === null ? 'never' : t + ' h'}, held to ${np.hours.join('-')} h`);
  for (const b of np.steps) for (let L = b.from; L <= b.to; L++) {
    const a = at(L), z = at(L + 1);
    if (a === null || z === null) continue; /* SK-3 names a life that stopped short */
    if (z - a > b.h) out.push(`SK-2: Level ${L} -> ${L + 1} takes ${(z - a).toFixed(2)} h, at most ${b.h} h`);
  }
  return out;
}

/** One life of the start-kit hero, on the game's curve or a planted one. */
const lifeOf = (np, xp = null) => playLife({ party: [...np.party], policy: np.policy, to: topOf(np), maxHours: budgetOf(np), xp });

const real = (L) => XP.charXpForLevel(L);
/* v0.2.142's curve to Level 16 (steps 7-9 at 25,072 / 68,087 / 83,477 XP, then 83,478 + 657 m^2), the same total from 16 on */
const V142 = [0, 0, 210, 619, 1417, 2977, 9418, 21731, 46803, 114890, 198367, 281845, 365980, 452086, 541477, 635467, 735370];
/* Planted drifts: [line, what, { xpFor } | { monsters }]. Each must turn its own line red. */
const MUTANTS = [
  ['SK-1', 'the v0.2.142 curve back (Level 10 at 8.6 h, Levels 8 and 9 at 2.6 and 3.0 h)', { xpFor: (L) => (L <= 16 ? V142[L] : real(L)) }],
  ['SK-1', 'monsters with half again their HP (a content change slows every kill)', { monsters: { hp: 1.5 } }],
  ['SK-1', 'Levels 2-10 at half price (the first ten Levels rushed)', { xpFor: (L) => (L <= 10 ? Math.round(real(L) / 2) : real(L) - Math.round(real(10) / 2)) }],
  ['SK-2', '30,000 XP moved from Level 9 to Level 8 (a 2.5-hour Level under 10, Level 10 still inside 6 h)', { xpFor: (L) => real(L) + (L === 9 ? 30000 : 0) }],
  ['SK-2', 'Level 12 -> 13 costs 45,000 more (a 5-hour Level where 10-15 take the XP back)', { xpFor: (L) => real(L) + (L > 12 ? 45000 : 0) }],
  ['SK-3', 'a wall at Level 15 (its step ten times dearer: the life never reaches 16)', { xpFor: (L) => real(L) + (L > 15 ? 9 * (real(16) - real(15)) : 0) }],
];

function table(life, np = NP) {
  const at = (L) => (L === 1 ? 0 : life.miles['0:' + L] ? life.miles['0:' + L].h : null);
  const cap = (L) => (np.steps.find((b) => L >= b.from && L <= b.to) || {}).h;
  const rows = [];
  for (let L = 1; L < topOf(np); L++) {
    const a = at(L), z = at(L + 1);
    rows.push(`L${L}->${L + 1} ${a === null || z === null ? '-' : (z - a).toFixed(2)}${cap(L) ? '/' + cap(L) : ''}`);
  }
  return rows.join('  ');
}

async function main() {
  if (!NP || !Array.isArray(NP.steps) || !NP.steps.length || !Array.isArray(NP.hours)) {
    console.error('start-kit-pace: HARNESS — src/data/core-model.js LEVEL_PACE.newPlayer is missing or malformed');
    process.exit(2);
  }
  const life = await lifeOf(NP);
  const out = judge(life);
  if (process.argv.includes('--mutate')) {
    if (out.length) { console.error('start-kit-pace --mutate: the shipped game is already red:\n  ' + out.join('\n  ')); process.exit(1); }
    let miss = 0;
    for (const [line, what, plant] of MUTANTS) {
      let undo = null, red = [];
      try {
        if (plant.monsters) undo = await scaleMonsters(plant.monsters);
        red = judge(await lifeOf(NP, plant.xpFor ? curveOf(plant.xpFor) : null)).filter((s) => s.startsWith(line));
      } finally { if (undo) undo(); }
      console.log(`  ${red.length ? 'ok  ' : 'MISS'} ${line} ${what}${red.length ? ' (' + red[0] + ')' : ''}`);
      if (!red.length) miss++;
    }
    /* the monster plant is undone: the shipped game must read green again in the same process */
    const again = judge(await lifeOf(NP));
    if (again.length) { console.error('start-kit-pace --mutate: a plant leaked, the shipped game reads red after the mutants: ' + again[0]); miss++; }
    console.log(miss ? `start-kit-pace --mutate: ${miss} drift(s) not caught` : `start-kit-pace --mutate: all ${MUTANTS.length} drifts caught`);
    process.exit(miss ? 1 : 0);
  }
  for (const x of out) console.error('✗ ' + x);
  console.log('  ' + table(life));
  const L10 = life.miles['0:' + NP.level];
  console.log(out.length ? `start-kit-pace: ${out.length} line(s) red`
    : `start-kit-pace: green (${NP.party.join('+')} on the start kit, ${NP.policy}: Level ${NP.level} at ${L10.h} h, held to ${NP.hours.join('-')} h; Level ${topOf(NP)} at ${life.miles['0:' + topOf(NP)].h} h)`);
  process.exit(out.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('start-kit-pace: HARNESS — ' + (e && e.stack ? e.stack : e)); process.exit(2); });
