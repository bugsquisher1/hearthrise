#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/pace-step.mjs — THE PACE A HELD STEP BUYS, GROUND BY GROUND (game designer,
// lane/pace-step-per-ground, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Decision: the pace step, ground by ground").
//
//   node tools/balance-program/redesign/signature-depth/pace-step.mjs           the readings (pace-step/run.sh's reports) as a markdown table
//   node tools/balance-program/redesign/signature-depth/pace-step.mjs --check   exit 1 if PACE_STEP below is not what its reports read (each
//                                                                                value within 0.005 of its fit), 2 a report missing
//
// A Signature's size is its paired pace delta (v1-climb payX, %) over the pace one held step buys ON THE CELL IT IS READ ON (sum.mjs paceOf,
// roads/e5/sum.mjs). The one global 0.43 was fit on Muster-like cells, and a held step buys 0.39% on Muster and 1.05% on Carter's Rest. So
// each ground carries its own, MEASURED with a lever that moves depth and nothing else (pace-step/defense-k10.json and -k20.json: every blow
// at every hero 10 or 20 power steps lower), on the ground's reference four (MID kits at its refLevel, Steady, 8 h, held from hour 4), 24
// seeds paired on the same dice: the pooled ratio of the pace moves to the held moves over both lever sizes (a fit through the origin, each
// seed weighted by its held move), its se by the delta method. Keyed by ground for a party of four (every four of four on a ground sits
// near its reference: the bands are cut on the reference four) and by ground:1 for a lone hero, who can sit far from it.
//
// A cell whose value is null holds under its band and is paid at the floor (danger.js PAY.floor): a deeper step there pays nothing and only
// meets a tougher monster, so a held step buys no pace (a lone sword on Muster Barrows: -0.29%). No Signature is sized there; as a second
// ground it reads in its best cell's pace steps, so the spread bar compares pace itself. A ground with no row is no Signature cell until it is
// measured: sum.mjs stops. A lever: re-measure (pace-step/run.sh, then --check) when the pay rule (danger.js PAY), the power step (powerStep),
// the climb (CLIMB, RISKS) or a ground's band moves.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'pace-step');

/* THE PACE A HELD STEP BUYS (%): key -> [value | null, its se, the cell it was fit on (pace-step/run.sh ps-<cell>-*)]. Played on
   lane/pace-step-per-ground (the hunt engine of set/v0.2.144 d501d3754) */
export const PACE_STEP = Object.freeze({
  /* (the tank four on Muster reads 0.407 (0.009): the four does not move it there) */
  muster_barrows: [0.398, 0.007, 'muster-mixed'],
  /* (a lone sword holds 367, far under the band's floor 520: paid at the floor, a held step costs 0.29% pace) */
  'muster_barrows:1': [null, 0.023, 'muster-lone'],
  hasks_ford: [0.397, 0.005, 'hask-mixed'],
  the_slake: [0.415, 0.007, 'slake-mixed'],
  'the_slake:1': [0.427, 0.007, 'slake-lone'],
  /* (the sword four reads 0.634 (0.031) here: a sword four's back row is struck more, so a cut on every blow buys more speed too) */
  pyre_field: [0.487, 0.020, 'pyre-mixed'],
  krells_hold: [0.610, 0.036, 'krell-mixed'],
  carters_rest: [1.056, 0.020, 'carters-mixed'],
  ox_road: [0.346, 0.006, 'ox-mixed'],
  /* (the crossbow four: the one four a Signature is read on here) */
  wyvern_roost: [0.429, 0.004, 'roost-crossbow'],
  catacomb_bone_wing: [0.453, 0.015, 'bone-mixed'],
  /* (the axes four, the one a Signature is read on here; its held move is small against its spread, se 0.087) */
  catacomb_flooded_wing: [0.874, 0.087, 'flood-axes'],
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** The key of a cell: its ground, and `:1` for a lone hero. */
export const keyOf = (ground, heroes) => (heroes === 1 ? ground + ':1' : ground);
/**
 * The pace one held step buys (%) on `ground` for a party of `heroes`: a number, `null` for a cell paid at the floor (a held step buys no
 * pace there), or `undefined` for a cell nobody measured.
 */
export function paceStepPct(ground, heroes = 4) {
  const k = keyOf(ground, heroes);
  return own(PACE_STEP, k) ? PACE_STEP[k][0] : undefined;
}

/* ── the fit from the reports ── */
const cellOf = (name) => {
  const f = join(DIR, name + '.json');
  if (!existsSync(f)) return null;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return { ground: r.ground, ...Object.values(r.cells)[0] };
};
/* the paired points of one lever arm against its plain four, seed by seed: [held move, pace move %] */
const pointsOf = (p, s) => {
  const out = [];
  p.held.perSeed.forEach((x, i) => {
    const a = p.payX.exact[i], b = s.payX.exact[i], z = s.held.perSeed[i];
    if (Number.isFinite(x) && Number.isFinite(z) && a > 0 && b > 0) out.push([z - x, (b / a - 1) * 100]);
  });
  return out;
};
/** A fit through the origin on paired points: the held move and pace move (means, se), and their ratio with its delta-method se. */
export function fitOf(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const se = (v) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) / v.length); };
  const h = pts.map((x) => x[0]), y = pts.map((x) => x[1]);
  const hm = mean(h), ym = mean(y), R = ym / hm;
  const res = pts.map(([x, z]) => z - R * x);
  return { n, held: { m: hm, se: se(h) }, pace: { m: ym, se: se(y) }, R, se: Math.sqrt(res.reduce((a, b) => a + b * b, 0) / (n - 1) / n) / Math.abs(hm) };
}
/* every cell pace-step/run.sh plays: [cell, ground, heroes, the party] */
export const CELLS = [
  ['muster-mixed', 'muster_barrows', 4, 'hammer, bow, mage, healer'],
  ['muster-tank', 'muster_barrows', 4, 'tank, bow, mage, healer'],
  ['muster-lone', 'muster_barrows', 1, 'a lone sword'],
  ['carters-mixed', 'carters_rest', 4, 'hammer, bow, mage, healer'],
  ['pyre-mixed', 'pyre_field', 4, 'hammer, bow, mage, healer'],
  ['pyre-sword', 'pyre_field', 4, 'sword, bow, mage, healer'],
  ['roost-crossbow', 'wyvern_roost', 4, 'hammer, crossbow, mage, healer'],
  ['slake-mixed', 'the_slake', 4, 'hammer, bow, mage, healer'],
  ['slake-lone', 'the_slake', 1, 'a lone sword'],
  ['krell-mixed', 'krells_hold', 4, 'hammer, bow, mage, healer'],
  ['ox-mixed', 'ox_road', 4, 'hammer, bow, mage, healer'],
  ['bone-mixed', 'catacomb_bone_wing', 4, 'hammer, bow, mage, healer'],
  ['flood-axes', 'catacomb_flooded_wing', 4, 'axes, bow, mage, healer'],
  ['hask-mixed', 'hasks_ford', 4, 'hammer, bow, mage, healer'],
];
const ARMS = ['k10', 'k20'];
/** Each cell's readings: its plain four, each lever arm's fit, and the pooled fit over both (the cell's value). */
export function readings() {
  return CELLS.map(([id, ground, heroes, party]) => {
    const p = cellOf('ps-' + id + '-plain');
    const arms = ARMS.map((k) => { const s = cellOf('ps-' + id + '-' + k); return { k, s, pts: p && s ? pointsOf(p, s) : null }; });
    const all = arms.every((a) => a.pts) ? arms.flatMap((a) => a.pts) : null;
    return { id, ground, heroes, party, key: keyOf(ground, heroes), plain: p, arms: arms.map((a) => ({ k: a.k, s: a.s, fit: a.pts ? fitOf(a.pts) : null })), pooled: all ? fitOf(all) : null };
  });
}

if (isMain(import.meta.url)) {
  const R = readings();
  if (process.argv.includes('--check')) {
    let bad = 0;
    for (const [k, [v, , cell]] of Object.entries(PACE_STEP)) {
      const c = R.find((x) => x.id === cell);
      if (!c || !c.pooled) { console.error('pace-step: ' + k + ' names ' + cell + ', which has no reports'); process.exit(2); }
      if (c.key !== k) { console.error('pace-step: ' + k + ' is fit on ' + cell + ', a ' + c.key + ' cell'); bad++; continue; }
      /* (a null is a cell paid at the floor: its fit must buy no pace) */
      const off = v === null ? c.pooled.R > 0 : Math.abs(c.pooled.R - v) > 0.005;
      if (off) { console.error('pace-step: ' + k + ' carries ' + v + ', its reports fit ' + c.pooled.R.toFixed(4)); bad++; }
    }
    console.log('pace-step --check: ' + Object.keys(PACE_STEP).length + ' cells, ' + (bad ? bad + ' off their reports' : 'each on its reports'));
    process.exit(bad ? 1 : 0);
  }
  const f = (x, d) => x.toFixed(d), sg = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
  console.log('| Cell | Key | Party | Plain held | Falls/h plain / k10 / k20 | Lever | Held move (se) | Pace move, % (se) | Pace a held step buys, % (se) | Seeds |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of R) {
    const falls = [c.plain, ...c.arms.map((a) => a.s)].map((x) => (x ? x.fallsPerH : '-')).join(' / ');
    const rows = c.arms.map((a) => [a.k, a.fit]).concat([['pooled', c.pooled]]);
    for (const [k, t] of rows) {
      console.log('| ' + [c.id, c.key, c.party, c.plain ? c.plain.held.mean : 'owed', falls, k, t ? sg(t.held.m) + ' (' + f(t.held.se, 1) + ')' : 'owed',
        t ? sg(t.pace.m) + ' (' + f(t.pace.se, 2) + ')' : '', t ? (k === 'pooled' ? '**' + f(t.R, 3) + '** (' : f(t.R, 3) + ' (') + f(t.se, 3) + ')' : '', t ? t.n : ''].join(' | ') + ' |');
    }
  }
}
