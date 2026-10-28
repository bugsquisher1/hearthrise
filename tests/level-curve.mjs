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
//   C2  at the reference rate every target Level is within LEVEL_PACE.tolerance
//   C3  the careers themselves (the real engine, not the per-Level model) reached
//       every target Level they could reach within the tolerance, and Level
//       LEVEL_PACE.early.level inside its hours (the tutorial's promise)
//   C4  every Level costs more XP than the one before (to Level 5,000), the first 1+
//   C5  LEVEL_PACE.contract is today's ladder: at Levels 50, 100, 300 and 1,000 it
//       pays within 10% of the measured ladder's own fit
//   C6  NO WALL (the 10-28 new-player walk: Level 6 took 7x Level 5's 5 minutes, just as
//       the hero reached the Thicket): from LEVEL_PACE.smooth.from to the ceiling, no
//       Level takes more than LEVEL_PACE.smooth.ratio times the hours of the Level before
//       it at the reference rate. Hours, not XP: a ground that pays three times more
//       (the Thicket over the Cellar) must charge three times the XP for the same minutes
// A red C1 is not a curve bug: the content moved. Re-measure (2-3 h on 4 workers:
// eight careers of ~170 h) and re-pin, then re-fit if C2/C3 go red (a fit that moves
// only the brackets past the ceiling, --fit --fit-past, needs no re-measure):
//   node tools/balance-sim/sim.mjs --plan pace --out tools/balance-sim/out/pace
//   node tools/balance-sim/sim.mjs --plan ladder --out tools/balance-sim/out/ladder
//   node tools/balance-sim/pace.mjs --fit --write
//
//   node tests/level-curve.mjs            run
//   node tests/level-curve.mjs --selftest each planted defect must turn its claim red
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import * as XP from '../src/core/xp.js';
import { LEVEL_CURVE, LEVEL_PACE } from '../src/data/core-model.js';
import { paceFingerprint, loadPaceData, hoursTo, referenceRate } from '../tools/balance-sim/pace.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = JSON.parse(readFileSync(join(ROOT, 'tools/balance-sim/level-pace.json'), 'utf8'));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';

/** Every failed claim for one world: { xpFor, rows, curve, snap, fingerprint, pace }. */
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
     it) is what they measured; a bracket from the ceiling on is judged by C2 alone (pace.mjs --fit --fit-past) */
  const below = (c) => ({ first: c.first, brackets: c.brackets.filter((b) => b.from < snap.ceiling) });
  if (!same(below(snap.curve), below(w.curve))) out.push('C1: tools/balance-sim/level-pace.json was measured on another LEVEL_CURVE below Level ' + snap.ceiling + ': re-measure (see the header)');
  if (snap.fingerprint !== w.fingerprint) out.push(`C1: the grounds or monsters changed since the pace was measured (${snap.fingerprint} -> ${w.fingerprint}): re-measure (see the header)`);
  /* C2 */
  const R = referenceRate(snap, pace.contract);
  const h = hoursTo(xpFor, R, pace.targets.map((t) => t[0]));
  for (const [L, T] of pace.targets) {
    const e = h[L] / T - 1;
    if (!(Math.abs(e) <= pace.tolerance)) out.push(`C2: Level ${L} takes ${h[L].toFixed(1)} h at the reference rate, target ${T} h (${pct(e)}, tolerance ${pct(pace.tolerance)})`);
  }
  /* C3 */
  for (const [L, T] of pace.targets) {
    if (L > snap.ceiling) continue;
    const m = snap.measuredHours[L];
    if (!Number.isFinite(m)) { out.push(`C3: the careers never reached Level ${L} (ceiling ${snap.ceiling})`); continue; }
    if (!(Math.abs(m / T - 1) <= pace.tolerance)) out.push(`C3: the careers reached Level ${L} in ${m.toFixed(1)} h, target ${T} h (${pct(m / T - 1)})`);
  }
  if (pace.early) {
    const m = snap.measuredHours[pace.early.level];
    if (!(m >= pace.early.hours[0] && m <= pace.early.hours[1])) out.push(`C3: the careers reached Level ${pace.early.level} in ${m} h, the tutorial says ${pace.early.hours.join('-')} h`);
  }
  /* C4 */
  if (!(xpFor(2) - xpFor(1) >= 1)) out.push('C4: Level 2 costs no XP');
  let prev = 0;
  for (let L = 1; L < 5000; L++) {
    const step = xpFor(L + 1) - xpFor(L);
    if (!(step > prev)) { out.push(`C4: Level ${L + 1} costs ${step} XP, no more than Level ${L} (${prev})`); break; }
    prev = step;
  }
  /* C5 */
  if (!snap.ladder) out.push('C5: the snapshot carries no measured ladder (run plan ladder, then pace.mjs --write)');
  else {
    for (const L of [50, 100, 300, 1000]) {
      const r = (pace.contract.a * L ** pace.contract.b) / (snap.ladder.a * L ** snap.ladder.b) - 1;
      if (!(Math.abs(r) <= 0.1)) { out.push(`C5: at Level ${L} the contract pays ${pct(r)} against the measured ladder (${snap.ladder.a} x L^${snap.ladder.b})`); break; }
    }
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
  return { out, h, R };
}

async function world() {
  const D = await loadPaceData(ROOT);
  return { xpFor: XP.charXpForLevel, rows: XP.levelCurveRows(), curve: JSON.parse(JSON.stringify(LEVEL_CURVE)), snap: SNAP,
    fingerprint: paceFingerprint(D), pace: LEVEL_PACE, D };
}
/* the fingerprint of the data with one monster row or the Hunts window's pick changed */
const withMonster = (w, id, field, k) => paceFingerprint({ ...w.D, MONSTERS: { ...w.D.MONSTERS, [id]: { ...w.D.MONSTERS[id], [field]: w.D.MONSTERS[id][field] * k } } });
const firstGlade = (w) => Object.values(w.D.OPEN_GROUNDS).find((g) => g.id === 'mosslight_glade').pockets[0].spawns[0].monster;

/* Planted defects: each must turn its claim red. */
const scaled = (k) => (L) => Math.round(XP.charXpForLevel(L) * k);
const MUTANTS = [
  ['C2', 'the 10-19 quartic back (Level 10 in about an hour)', { xpFor: (L) => { const n = L - 1; return n ** 4 + 20 * n ** 3 + 50 * n; } }],
  ['C2', 'every Level 15% dearer', { xpFor: scaled(1.15) }],
  ['C2', 'every Level 15% cheaper', { xpFor: scaled(0.85) }],
  ['C2', 'the long climb past Level 300 half as steep', { xpFor: (L) => (L <= 300 ? XP.charXpForLevel(L) : XP.charXpForLevel(300) + Math.round((XP.charXpForLevel(L) - XP.charXpForLevel(300)) / 2)) }],
  ['C0', 'xp.js reads its brackets one Level late', { xpFor: (L) => XP.charXpForLevel(Math.max(1, L - 1)) }],
  ['C0', 'xp.js totals one XP short past Level 60', { xpFor: (L) => (L > 60 ? XP.charXpForLevel(L) - 1 : XP.charXpForLevel(L)) }],
  ['C1', 'the curve was re-tuned without re-measuring', { curve: (w) => { const c = JSON.parse(JSON.stringify(w.curve)); c.brackets[2].bend += 1; return c; }, rowsFollow: true }],
  ['C1', 'a Glade monster pays double XP since the measurement', { fingerprint: (w) => withMonster(w, firstGlade(w), 'xp', 2) }],
  ['C1', 'a Glade monster has 20% more HP since the measurement', { fingerprint: (w) => withMonster(w, firstGlade(w), 'hp', 1.2) }],
  ['C1', 'the Hunts window sends a lone hero to the Warrens from Level 41', { fingerprint: (w) => paceFingerprint({ ...w.D, recommend: (L) => (L >= 41 ? 'coppercap_warrens' : w.D.recommend(L)) }) }],
  ['C3', 'the careers took 20% longer to every Level', { snap: (w) => ({ ...w.snap, measuredHours: Object.fromEntries(Object.entries(w.snap.measuredHours).map(([L, x]) => [L, x * 1.2])) }) }],
  ['C3', 'the Mill Cellar holds a new hero for an hour', { snap: (w) => ({ ...w.snap, measuredHours: { ...w.snap.measuredHours, [LEVEL_PACE.early.level]: 1 } }) }],
  ['C4', 'a flat Level (the same XP as the one before)', { xpFor: (L) => (L <= 40 ? XP.charXpForLevel(L) : XP.charXpForLevel(L) - (XP.charXpForLevel(41) - XP.charXpForLevel(40)) + (XP.charXpForLevel(40) - XP.charXpForLevel(39))) }],
  ['C5', 'the contract outpaces the ladder (b + 0.1)', { pace: (w) => ({ ...w.pace, contract: { ...w.pace.contract, b: w.pace.contract.b + 0.1 } }) }],
  ['C6', 'the 10-27 first Levels back (Level 6 a 7x wall over Level 5)', { xpFor: (L) => XP.xpForLevelOn(XP.levelCurveRowsOf({ first: 60,
    brackets: [{ from: 1, rise: 0, bend: 122 }, { from: 5, rise: 12591, bend: 0 }, ...LEVEL_CURVE.brackets.filter((b) => b.from >= 10)] }), L) }],
  ['C6', 'a wall at Level 30 (one Level three times the one before)', { xpFor: (L) => XP.charXpForLevel(L) + (L > 30 ? 2 * (XP.charXpForLevel(31) - XP.charXpForLevel(30)) : 0) }],
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
    for (const [claim, name, over] of MUTANTS) {
      const m = { ...w };
      for (const [k, v] of Object.entries(over)) if (k !== 'rowsFollow') m[k] = typeof v === 'function' && k !== 'xpFor' ? v(w) : v;
      if (over.rowsFollow) m.rows = XP.levelCurveRowsOf(m.curve);
      const red = judge(m).out.filter((s) => s.startsWith(claim));
      console.log(`  ${red.length ? 'ok  ' : 'MISS'} ${claim} ${name}`);
      if (!red.length) miss++;
    }
    console.log(miss ? `level-curve --selftest: ${miss} defect(s) not caught` : `level-curve --selftest: all ${MUTANTS.length} defects caught`);
    process.exit(miss ? 1 : 0);
  }
  const { out, h } = judge(w);
  for (const x of out) console.error('✗ ' + x);
  const line = LEVEL_PACE.targets.map(([L, T]) => `L${L} ${h[L].toFixed(0)}/${T} h`).join(', ');
  console.log(out.length ? `level-curve: ${out.length} claim(s) red` : `level-curve: green (${line}; measured to L${SNAP.ceiling} on ${SNAP.styles.length} styles)`);
  process.exit(out.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
