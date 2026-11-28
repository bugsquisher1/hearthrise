#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/pace-step.mjs — THE PACE A HELD STEP BUYS, GROUND BY GROUND (game designer,
// lane/pace-step-per-ground, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Decision: the pace step, ground by ground").
//
//   node tools/balance-program/redesign/signature-depth/pace-step.mjs           the readings (pace-step/run.sh's reports) as a markdown table
//   node tools/balance-program/redesign/signature-depth/pace-step.mjs --check   exit 1 if PACE_STEP below is not what the reports read (each
//                                                                                ground's value within 0.005 of its fit), 2 a report missing
//
// A Signature's size is its paired pace delta (v1-climb payX, %) over the pace one held step buys ON THE CELL IT IS READ ON (sum.mjs paceOf,
// roads/e5/sum.mjs). The global 0.43 was fit on Muster-like cells, and a held step pays more where a four falls back often: on Carter's Rest
// a step held is also a fall-back not taken. So each ground carries its own, MEASURED with a lever that moves depth and nothing else
// (pace-step/defense-k10.json: every blow at every hero 10 power steps lower), on the ground's reference four (MID kits at its refLevel,
// Steady, 8 h, held from hour 4), 24 seeds paired on the same dice: the ratio of the mean pace move to the mean held move, its se by the
// delta method. A ground with no value here is no Signature cell: sum.mjs prints it owed. A lever: re-measure (pace-step/run.sh, then
// --check) when the pay rule (danger.js PAY), the power step (powerStep), the climb (CLIMB, RISKS) or a ground's band moves.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'pace-step');

/* THE PACE A HELD STEP BUYS (%), a ground: [value, se, the cell it was fit on (pace-step/run.sh ps-<cell>)]. Fit on set/v0.2.144 d501d3754 */
export const PACE_STEP = Object.freeze({
  /* (filled from the reports by the designer; --check holds each to its report) */
});

/** The pace one held step buys on `ground` (%), or null: a ground with no fit is no Signature cell until it is measured. */
export function paceStepPct(ground) {
  const r = Object.prototype.hasOwnProperty.call(PACE_STEP, ground) ? PACE_STEP[ground] : null;
  return r ? r[0] : null;
}

/* ── the fit from the reports ── */
const cellOf = (name) => {
  const f = join(DIR, name + '.json');
  if (!existsSync(f)) return null;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return { ground: r.ground, ...Object.values(r.cells)[0] };
};
/** One lever arm against its plain four, paired by seed: the held move, the pace move (%), and their ratio with its delta-method se. */
export function fitOf(p, s) {
  const h = [], y = [];
  p.held.perSeed.forEach((x, i) => {
    const a = p.payX.exact[i], b = s.payX.exact[i], z = s.held.perSeed[i];
    if (Number.isFinite(x) && Number.isFinite(z) && a > 0 && b > 0) { h.push(z - x); y.push((b / a - 1) * 100); }
  });
  const n = h.length;
  if (n < 2) return null;
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const se = (v) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) / v.length); };
  const hm = mean(h), ym = mean(y), R = ym / hm;
  const res = h.map((x, i) => y[i] - R * x);
  return { n, held: { m: hm, se: se(h) }, pace: { m: ym, se: se(y) }, R, se: Math.sqrt(res.reduce((a, b) => a + b * b, 0) / (n - 1) / n) / Math.abs(hm) };
}
/* every cell pace-step/run.sh plays: [cell, ground, the four, the lever arms] */
export const CELLS = [
  ['muster-mixed', 'muster_barrows', 'hammer, bow, mage, healer', ['k10', 'k20']],
  ['muster-tank', 'muster_barrows', 'tank, bow, mage, healer', ['k10']],
  ['muster-lone', 'muster_barrows', 'a lone sword', ['k10']],
  ['carters-mixed', 'carters_rest', 'hammer, bow, mage, healer', ['k10', 'k20']],
  ['pyre-mixed', 'pyre_field', 'hammer, bow, mage, healer', ['k10']],
  ['pyre-sword', 'pyre_field', 'sword, bow, mage, healer', ['k10']],
  ['roost-crossbow', 'wyvern_roost', 'hammer, crossbow, mage, healer', ['k10']],
  ['slake-mixed', 'the_slake', 'hammer, bow, mage, healer', ['k10']],
  ['slake-lone', 'the_slake', 'a lone sword', ['k10']],
  ['krell-mixed', 'krells_hold', 'hammer, bow, mage, healer', ['k10']],
  ['ox-mixed', 'ox_road', 'hammer, bow, mage, healer', ['k10']],
  ['bone-mixed', 'catacomb_bone_wing', 'hammer, bow, mage, healer', ['k10']],
  ['flood-axes', 'catacomb_flooded_wing', 'axes, bow, mage, healer', ['k10']],
  ['hask-mixed', 'hasks_ford', 'hammer, bow, mage, healer', ['k10']],
];
export function readings() {
  return CELLS.map(([id, ground, four, arms]) => {
    const p = cellOf('ps-' + id + '-plain');
    return { id, ground, four, plain: p, arms: arms.map((k) => { const s = cellOf('ps-' + id + '-' + k); return { k, fit: p && s ? fitOf(p, s) : null, owed: !s }; }) };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const R = readings();
  if (process.argv.includes('--check')) {
    let bad = 0;
    for (const [g, [v]] of Object.entries(PACE_STEP)) {
      const c = R.find((x) => x.ground === g && x.arms[0].fit);
      if (!c) { console.error('pace-step: no report fits ' + g); process.exit(2); }
      if (Math.abs(c.arms[0].fit.R - v) > 0.005) { console.error('pace-step: ' + g + ' carries ' + v + ', its report fits ' + c.arms[0].fit.R.toFixed(4)); bad++; }
    }
    console.log('pace-step --check: ' + Object.keys(PACE_STEP).length + ' grounds, ' + (bad ? bad + ' off their reports' : 'each on its report'));
    process.exit(bad ? 1 : 0);
  }
  const f2 = (x) => x.toFixed(2), sg = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  console.log('| Cell | Ground | Four | Plain held | Falls/h | Lever | Held move (se) | Pace move, % (se) | Pace a held step buys, % (se) | Seeds |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of R) for (const a of c.arms) {
    const t = a.fit;
    console.log('| ' + [c.id, c.ground, c.four, c.plain ? c.plain.held.mean : 'owed', c.plain ? c.plain.fallsPerH : '', a.k,
      t ? sg(t.held.m) + ' (' + t.held.se.toFixed(1) + ')' : 'owed', t ? sg(t.pace.m) + ' (' + f2(t.pace.se) + ')' : '',
      t ? t.R.toFixed(3) + ' (' + t.se.toFixed(3) + ')' : '', t ? t.n : ''].join(' | ') + ' |');
  }
}
