#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/level-curve.mjs — THE LEVEL CURVE KEEPS TYLER'S PACE, MEASURED.
//
// Tyler's balance ruling 2026-10-25 §2 (src/data/core-model.js LEVEL_PACE): Level
// 10 in 6 hunting hours, 25 in 36, 50 in 168, 100 in 600 ... 1,000 in 23,520, of
// reasonably efficient hunting. LEVEL_CURVE (pace brackets) is fitted to it on the
// real engine by the balance simulator, whose measurement is committed as
// tools/balance-sim/level-pace.json (tools/balance-sim/pace.mjs --write): each
// Level's Level XP an hour of a lone hero hunting where the game recommends, to the
// top of the highest ground, and past it LEVEL_PACE.contract (what a new ground
// must pay). Claims:
//   C0  src/core/xp.js is the data's curve: its rows are levelCurveRowsOf(LEVEL_CURVE)
//       and every total to Level 3,000 is the plain sum of the steps
//   C1  the measurement is THIS game's: taken on this LEVEL_CURVE, and the data a
//       ground's XP an hour is made of (monsters' xp/hp/level/atk/def, the open
//       grounds' bands, fits, respawns and pockets) is unchanged since
//   C2, C3, C5  RETIRED 2026-11-22 (lane/r6-release-plan; docs/design/redesign/12-targets.md 2.6): they held a lone
//       hero's careers to the old pace table and waited on FB-8, which the redesign REPLACED, so they could never go
//       green (known red T-02). Their exit is C7 below. The Level 10 promise stays held by tests/start-kit-pace.mjs.
//   C4  every Level costs more XP than the one before (to Level 5,000), the first 1+
//   C6  NO WALL (the 10-28 new-player walk: Level 6 took 7x Level 5's 5 minutes, just as
//       the hero reached the Thicket): from LEVEL_PACE.smooth.from to the ceiling, no
//       Level takes more than LEVEL_PACE.smooth.ratio times the hours of the Level before
//       it at the reference rate. Hours, not XP: a ground that pays three times more
//       (the Thicket over the Cellar) must charge three times the XP for the same minutes
//   C7  T-02 RE-AIMED (12-targets 2.6): on every scale ground (src/data/danger.js DANGER_GROUNDS), a Steady mixed four
//       (hammer, bow, mage, healer; MID kits) started at its held depth (the game's own start: refStep - startMargin)
//       earns the hours table's Level XP a head an hour, +-20%, at the ground's reference Level and 10 Levels over it.
//       The real engine (tools/balance-program/redesign/held-four.mjs: 3 seeds x 2 h a cell, about 15 s). Ground rows
//       not on the scale are not judged. A scale ground with no reference Level in REF_LEVEL below is red: name the
//       Level its refStep was measured at.
//   C8  THE HOURS FORMULA KEEPS ITS DESIGN (lane/formula-overhaul, 2026-11-22; src/data/core-model.js LEVEL_HOURS, 27-formula-overhaul.md P-1):
//       the hours a Level takes is a formula, so a lever move is judged on what it promises the player, on the 10 h hunting day:
//         a  the first day: Level 10 within 10 hunted hours
//         b  Level 200 is a big deal: 120 to 240 days (1,200 to 2,400 hunted hours)
//         c  it levels off: no Level takes LEVEL_HOURS.ceiling or more, and Level 2,000 takes under 1.25x Level 400's hours
//         d  no wall: from Level 2 on, no Level takes more than twice the one before, and none takes less
// A red C1 is not a curve bug: the content moved. Re-measure (2-3 h on 4 workers:
// eight careers of ~170 h) and re-pin (C6 reads the reference rate it measured):
//   node tools/balance-sim/sim.mjs --plan pace --out tools/balance-sim/out/pace
//   node tools/balance-sim/sim.mjs --plan ladder --out tools/balance-sim/out/ladder
//   node tools/balance-sim/pace.mjs --fit --write
//
//   node tests/level-curve.mjs            run
//   node tests/level-curve.mjs --selftest each planted defect must turn its claim red
//
// A STEP OF ITS OWN (it plays the engine for C7). T-02 has an exit now: C7 is green on the shipped scale.
// ci-step: db-replay-8 | Level hours - the Level curve, and a Steady four at its held depth earns the hours table (T-02 re-aimed)
// ci-run: node tests/level-curve.mjs
// ci-run: node tools/mutant-gate.mjs node tests/level-curve.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import * as XP from '../src/core/xp.js';
import { LEVEL_CURVE, LEVEL_PACE, LEVEL_HOURS, levelHoursOf } from '../src/data/core-model.js';
import { DANGER_GROUNDS } from '../src/data/danger.js';
import { paceFingerprint, loadPaceData, referenceRate } from '../tools/balance-sim/pace.mjs';
import { playCells, tableRate } from '../tools/balance-program/redesign/held-four.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = JSON.parse(readFileSync(join(ROOT, 'tools/balance-sim/level-pace.json'), 'utf8'));

/* C7: the Level each scale ground's refStep was measured at (src/data/danger.js: muster_barrows 590, the Steady four at Level 60; lane/r10: Hask's
   Ford 590 at 45 to 55 in its own tier's kit (held 573 and 594; at 62 the four wears Muster's tier and holds deeper), each wing 480 / 440 at 175) */
export const REF_LEVEL = { muster_barrows: 60, hasks_ford: 45, catacomb_bone_wing: 175, catacomb_flooded_wing: 175 };
const C7_BAND = 0.2, C7_OVER = 10, C7_SEEDS = 3, C7_HOURS = 2;
const MIXED = ['hammer', 'bow', 'mage', 'healer'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Every failed claim for one world: { xpFor, rows, curve, snap, fingerprint, pace, scaleGrounds, held }. */
function judge(w) {
  const out = [];
  const { xpFor, snap, pace } = w;
  /* C0 */
  if (!same(w.rows, XP.levelCurveRowsOf(w.curve))) out.push('C0: src/core/xp.js rows are not levelCurveRowsOf(LEVEL_CURVE)');
  else {
    /* the plain walk: Level L -> L+1 costs first + rise m + bend m^2 of L's bracket; a new bracket's first step is the
       bracket before it one Level further */
    let total = 0, first = w.curve.first, bi = 0;
    const bs = w.curve.brackets;
    for (let L = 1; L <= 3000; L++) {
      if (xpFor(L) !== total) { out.push(`C0: Level ${L} totals ${xpFor(L)} XP, the steps sum to ${total}`); break; }
      while (bi + 1 < bs.length && bs[bi + 1].from <= L) {
        const len = bs[bi + 1].from - bs[bi].from;
        first += bs[bi].rise * len + bs[bi].bend * len * len;
        bi += 1;
      }
      const m = L - bs[bi].from;
      total += first + bs[bi].rise * m + bs[bi].bend * m * m;
    }
  }
  /* C1: the careers end at the ceiling, so only the curve below it (the first step and every bracket starting under
     it) is what they measured; a bracket from the ceiling on is judged by C6 alone */
  const below = (c) => ({ first: c.first, brackets: c.brackets.filter((b) => b.from < snap.ceiling) });
  if (!same(below(snap.curve), below(w.curve))) out.push('C1: tools/balance-sim/level-pace.json was measured on another LEVEL_CURVE below Level ' + snap.ceiling + ': re-measure (see the header)');
  if (snap.fingerprint !== w.fingerprint) out.push(`C1: the grounds or monsters changed since the pace was measured (${snap.fingerprint} -> ${w.fingerprint}): re-measure (see the header)`);
  const R = referenceRate(snap, pace.contract);
  /* C4 */
  if (!(xpFor(2) - xpFor(1) >= 1)) out.push('C4: Level 2 costs no XP');
  let prev = 0;
  for (let L = 1; L < 5000; L++) {
    const step = xpFor(L + 1) - xpFor(L);
    if (!(step > prev)) { out.push(`C4: Level ${L + 1} costs ${step} XP, no more than Level ${L} (${prev})`); break; }
    prev = step;
  }
  /* C6 */
  if (!pace.smooth) out.push('C6: LEVEL_PACE.smooth is missing');
  else {
    const hrs = (L) => (xpFor(L + 1) - xpFor(L)) / R(L);
    for (let L = pace.smooth.from; L + 1 < snap.ceiling; L++) {
      const k = hrs(L + 1) / hrs(L);
      if (!(k <= pace.smooth.ratio)) {
        out.push(`C6: Level ${L + 1} -> ${L + 2} takes ${(hrs(L + 1) * 60).toFixed(1)} min, ${k.toFixed(2)}x Level ${L} -> ${L + 1}'s ${(hrs(L) * 60).toFixed(1)} min (at most ${pace.smooth.ratio}x)`);
        break;
      }
    }
  }
  /* C7: every scale ground, judged from the held start (12-targets 2.6) */
  for (const g of w.scaleGrounds) {
    const L0 = REF_LEVEL[g];
    if (!Number.isInteger(L0)) { out.push(`C7: scale ground ${g} has no reference Level (tests/level-curve.mjs REF_LEVEL): name the Level its refStep was measured at`); continue; }
    for (const L of [L0, L0 + C7_OVER]) {
      const m = w.held && w.held[g] && w.held[g][L];
      if (!m || !Number.isFinite(m.ratio)) { out.push(`C7: ${g} at Level ${L} was not measured`); continue; }
      if (!(Math.abs(m.ratio - 1) <= C7_BAND)) out.push(`C7: a Steady four at its held depth on ${g}, Level ${L}, earns ${m.ratio.toFixed(2)}x the hours table (${Math.round(m.xpHeadH)} of ${Math.round(m.table)} Level XP a head an hour; band ${1 - C7_BAND}-${1 + C7_BAND})`);
    }
  }
  /* C8: the hours formula's promises (w.hours: the engine's hours a Level, src/core/hunt/danger.js hoursForLevel) */
  {
    const H = w.hours, cum = (L) => { let t = 0; for (let l = 1; l < L; l++) t += H(l); return t; };
    if (!(cum(10) <= 10)) out.push('C8a: Level 10 takes ' + cum(10).toFixed(1) + ' hunted hours, more than the first 10 h day');
    const h200 = cum(200);
    if (!(h200 >= 1200 && h200 <= 2400)) out.push('C8b: Level 200 takes ' + Math.round(h200) + ' hunted hours (' + Math.round(h200 / 10) + ' days at 10 h), outside 120 to 240 days');
    for (let L = 1; L <= 5000; L++) if (!(H(L) < w.levelHours.ceiling)) { out.push('C8c: Level ' + L + ' takes ' + H(L) + ' h, at or over the ceiling ' + w.levelHours.ceiling); break; }
    if (!(H(2000) < 1.25 * H(400))) out.push('C8c: Level 2,000 takes ' + H(2000).toFixed(2) + ' h, 1.25x or more Level 400\'s ' + H(400).toFixed(2) + ': it does not level off');
    for (let L = 2; L < 3000; L++) { const k = H(L + 1) / H(L); if (!(k >= 1 && k <= 2)) { out.push('C8d: Level ' + (L + 1) + ' takes ' + k.toFixed(2) + 'x Level ' + L + '\'s hours'); break; } }
  }
  return { out, R };
}

/** C7's measurement: every scale ground at its reference Level and C7_OVER over it, from the held start unless `start` names one. */
async function measureHeld({ start } = {}) {
  const cells = [];
  for (const g of Object.keys(DANGER_GROUNDS)) {
    const L0 = REF_LEVEL[g];
    if (!Number.isInteger(L0)) continue;
    for (const L of [L0, L0 + C7_OVER]) cells.push({ id: `${g}:${L}`, ground: g, L, styles: MIXED, risk: 'steady', hours: C7_HOURS, seeds: C7_SEEDS, ...(Number.isInteger(start) ? { start } : {}) });
  }
  const res = await playCells(ROOT, cells);
  const held = {};
  for (const c of cells) {
    const table = await tableRate(ROOT, c.L);
    (held[c.ground] ||= {})[c.L] = { xpHeadH: res[c.id].xpHeadH, table, ratio: res[c.id].xpHeadH / table, seeds: res[c.id].xpHeadHSeeds, deaths: res[c.id].deaths };
  }
  return held;
}

async function world() {
  const D = await loadPaceData(ROOT);
  return { xpFor: XP.charXpForLevel, rows: XP.levelCurveRows(), curve: JSON.parse(JSON.stringify(LEVEL_CURVE)), snap: SNAP,
    fingerprint: paceFingerprint(D, SNAP.ceiling), pace: LEVEL_PACE, D, scaleGrounds: Object.keys(DANGER_GROUNDS), held: await measureHeld(),
    hours: (await import('../src/core/hunt/danger.js')).hoursForLevel, levelHours: LEVEL_HOURS };
}
/* a new ground on the data: a copy of the Glade under a new id, at `band` (a ground pack's shape, src/data/grounds) */
const withGround = (w, band) => {
  const g = w.D.OPEN_GROUNDS.mosslight_glade;
  /* the window sends a lone hero there across its band, as recommendation() does for the highest floor that holds a Level */
  return paceFingerprint({ ...w.D, OPEN_GROUNDS: { ...w.D.OPEN_GROUNDS, probe_ground: { ...g, id: 'probe_ground', hunt: 'probe_hunt' } },
    HUNT_INDEX: { ...w.D.HUNT_INDEX, probe_hunt: { ...w.D.HUNT_INDEX[g.hunt], id: 'probe_hunt', band } },
    recommend: (L) => (L >= band[0] && L <= band[1] ? 'probe_hunt' : w.D.recommend(L)) }, w.snap.ceiling);
};
/* the fingerprint of the data with one monster row or the Hunts window's pick changed */
const withMonster = (w, id, field, k) => paceFingerprint({ ...w.D, MONSTERS: { ...w.D.MONSTERS, [id]: { ...w.D.MONSTERS[id], [field]: w.D.MONSTERS[id][field] * k } } }, w.snap.ceiling);
const firstGlade = (w) => Object.values(w.D.OPEN_GROUNDS).find((g) => g.id === 'mosslight_glade').pockets[0].spawns[0].monster;
/* C7's measurement with every Level XP an hour times k */
const scaleHeld = (w, k) => Object.fromEntries(Object.entries(w.held).map(([g, byL]) => [g, Object.fromEntries(Object.entries(byL).map(([L, m]) => [L, { ...m, xpHeadH: m.xpHeadH * k, ratio: m.ratio * k }]))]));

/* Planted defects: each must turn its claim red. */
const MUTANTS = [
  ['C0', 'xp.js reads its brackets one Level late', { xpFor: (L) => XP.charXpForLevel(Math.max(1, L - 1)) }],
  ['C0', 'xp.js totals one XP short past Level 60', { xpFor: (L) => (L > 60 ? XP.charXpForLevel(L) - 1 : XP.charXpForLevel(L)) }],
  ['C1', 'the curve was re-tuned without re-measuring', { curve: (w) => { const c = JSON.parse(JSON.stringify(w.curve)); c.brackets[2].bend += 1; return c; }, rowsFollow: true }],
  ['C1', 'a Glade monster pays double XP since the measurement', { fingerprint: (w) => withMonster(w, firstGlade(w), 'xp', 2) }],
  ['C1', 'a Glade monster has 20% more HP since the measurement', { fingerprint: (w) => withMonster(w, firstGlade(w), 'hp', 1.2) }],
  ['C1', 'the Hunts window sends a lone hero to the Warrens from Level 41', { fingerprint: (w) => paceFingerprint({ ...w.D, recommend: (L) => (L >= 41 ? 'coppercap_warrens' : w.D.recommend(L)) }, w.snap.ceiling) }],
  ['C1', 'a new ground opens under the ceiling (Levels 25-40)', { fingerprint: (w) => withGround(w, [25, 40]) }],
  ['C1', 'a new ground opens one Level under the ceiling', { fingerprint: (w) => withGround(w, [w.snap.ceiling - 1, w.snap.ceiling + 15]) }],
  ['C4', 'a flat Level (the same XP as the one before)', { xpFor: (L) => (L <= 40 ? XP.charXpForLevel(L) : XP.charXpForLevel(L) - (XP.charXpForLevel(41) - XP.charXpForLevel(40)) + (XP.charXpForLevel(40) - XP.charXpForLevel(39))) }],
  ['C6', 'the 10-27 first Levels back (Level 6 a 7x wall over Level 5)', { xpFor: (L) => XP.xpForLevelOn(XP.levelCurveRowsOf({ first: 60,
    brackets: [{ from: 1, rise: 0, bend: 122 }, { from: 5, rise: 12591, bend: 0 }, ...LEVEL_CURVE.brackets.filter((b) => b.from >= 10)] }), L) }],
  ['C6', 'a wall at Level 30 (one Level three times the one before)', { xpFor: (L) => XP.charXpForLevel(L) + (L > 30 ? 2 * (XP.charXpForLevel(31) - XP.charXpForLevel(30)) : 0) }],
  /* C7 planted on the measurement (the engine's own mutant, the opening climb counted, runs in main below) */
  ['C7', 'a kill pays double at depth', { held: (w) => scaleHeld(w, 2) }],
  ['C7', 'a kill pays a quarter short at depth', { held: (w) => scaleHeld(w, 0.75) }],
  ['C7', 'a scale ground never measured', { held: (w) => ({ ...w.held, [w.scaleGrounds[0]]: undefined }) }],
  ['C7', 'a second scale ground opens with no reference Level', { scaleGrounds: (w) => [...w.scaleGrounds, 'probe_ground'] }],
  /* C8 planted on the hours function (a lever move the design would not make) */
  ['C8', 'the first Levels as slow as Level 50', { hours: () => () => levelHoursOf(50) }],
  ['C8', 'the ceiling doubled (Level 200 in about 330 days)', { hours: () => (L) => levelHoursOf(L, { ...LEVEL_HOURS, ceiling: 2 * LEVEL_HOURS.ceiling }) }],
  ['C8', 'the retired hand table back (40 h a Level at 1,000, still rising)', { hours: () => (L) => Math.min(40.32, 0.6 + L * 0.0397) }],
  ['C8', 'a half point of 1 (full ceiling by Level 2: a wall in the first hour)', { hours: () => (L) => levelHoursOf(L, { ...LEVEL_HOURS, half: 1 }) }],
];

async function main() {
  const w = await world();
  if (process.argv.includes('--selftest')) {
    if (judge(w).out.length) { console.error('level-curve --selftest: the shipped curve already fails:\n  ' + judge(w).out.join('\n  ')); process.exit(1); }
    let miss = 0;
    /* CONTROL: a bracket past the ceiling re-fitted by one bend is no reason to re-measure (C1 stays quiet) */
    {
      const c = JSON.parse(JSON.stringify(w.curve));
      c.brackets[c.brackets.length - 1].bend += 1;
      const quiet = !judge({ ...w, curve: c, rows: XP.levelCurveRowsOf(c), xpFor: (L) => XP.xpForLevelOn(XP.levelCurveRowsOf(c), L) }).out.some((s) => s.startsWith('C1'));
      console.log(`  ${quiet ? 'ok  ' : 'MISS'} control: a bracket past Level ${w.snap.ceiling} re-fitted needs no re-measure`);
      if (!quiet) miss++;
    }
    /* CONTROL: a new ground from the ceiling up (a ground pack past the content) moves nothing the careers measured (C1 stays quiet) */
    {
      const quiet = !judge({ ...w, fingerprint: withGround(w, [w.snap.ceiling, w.snap.ceiling + 15]) }).out.some((s) => s.startsWith('C1'));
      console.log(`  ${quiet ? 'ok  ' : 'MISS'} control: a new ground from Level ${w.snap.ceiling} up needs no re-measure`);
      if (!quiet) miss++;
    }
    /* C7 ON THE ENGINE: the same four started at step 0 (the opening climb counted, as V2's 0.72x was read) must read short */
    {
      const red = judge({ ...w, held: await measureHeld({ start: 0 }) }).out.filter((s) => s.startsWith('C7'));
      console.log(`  ${red.length ? 'ok  ' : 'MISS'} C7 the four starts at step 0, not at its held depth (the real engine)`);
      if (!red.length) miss++;
    }
    for (const [claim, name, over] of MUTANTS) {
      const m = { ...w };
      for (const [k, v] of Object.entries(over)) if (k !== 'rowsFollow') m[k] = typeof v === 'function' && k !== 'xpFor' ? v(w) : v;
      if (over.rowsFollow) m.rows = XP.levelCurveRowsOf(m.curve);
      const red = judge(m).out.filter((s) => s.startsWith(claim));
      console.log(`  ${red.length ? 'ok  ' : 'MISS'} ${claim} ${name}`);
      if (!red.length) miss++;
    }
    console.log(miss ? `level-curve --selftest: ${miss} defect(s) not caught` : `level-curve --selftest: all ${MUTANTS.length + 1} defects caught`);
    process.exit(miss ? 1 : 0);
  }
  const { out } = judge(w);
  for (const x of out) console.error('✗ ' + x);
  const line = Object.entries(w.held).flatMap(([g, byL]) => Object.entries(byL).map(([L, m]) => `${g} L${L} ${m.ratio.toFixed(2)}x`)).join(', ');
  console.log(out.length ? `level-curve: ${out.length} claim(s) red` : `level-curve: green (C7: ${line} the hours table, a Steady four at its held depth)`);
  process.exit(out.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
