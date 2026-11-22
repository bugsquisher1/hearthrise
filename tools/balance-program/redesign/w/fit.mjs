#!/usr/bin/env node
// tools/balance-program/redesign/w/fit.mjs — lane/w-wage's reading of the wage (2026-11-22). No engine run: arithmetic on the kept reports
// beside it (v1-climb.mjs --json, the Steady mixed MID four on the Danger scale from a held start) and the pinned overhaul-start baseline
// (tools/balance-program/baseline/overhaul-start/results.json.gz, the Lab's real-engine matrix, 8 seeds a cell).
//
//   node tools/balance-program/redesign/w/fit.mjs        Exit 0 printed · 2 a report missing
//
// WHAT AN HOUR PAYS: coin plus loot at the store's price, Rares and trophies left out (cell.mjs `income`), a hunted hero-hour, gross.
// THE ANCHOR is the scale's only reference ground (Muster Barrows, DANGER_GROUNDS refStep 590) at R4's Levels 60, 63 and 70: there a
// reference hour on Steady is measured as the game plays it. THE SLOPE is the pay of the same four on its own ground across Levels 20 to
// 400, fitted in logs and weighted by the hours each Level takes (the Level hours table, src/core/hunt/danger.js hoursForLevel): a Level a
// hero spends 30 hours in counts 30 times a Level it spends one in. Two readings of that slope:
//   lab    the baseline matrix's four on its own ground on Normal (the as-built pull, the tier's coin dial 1000), Levels 20..400
//   scale  the v1-climb ground runs below: the scale played on each Level's ground. A ground with no DANGER_GROUNDS row pays coin at the
//          120-step gap cap (1.007^120 = 2.31x) once it holds past step 120, so its coin is divided by that to read a reference pull
// The shipped levers (src/data/wage.js) are printed against every point: measured / wage, in band when inside BAND.
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { hoursForLevel } = await imp('src/core/hunt/danger.js');
const { wage, levelStep, blockPrice } = await imp('src/core/wage.js');
const { WAGE } = await imp('src/data/wage.js');
const { PAY } = await imp('src/data/danger.js');
const BAND = [0.75, 1.33];
const read = (f) => (existsSync(join(HERE, f)) ? JSON.parse(readFileSync(join(HERE, f), 'utf8')) : null);
let missing = 0;

/* the hours each checkpoint stands for: the table's hours over the Levels halfway to its neighbours */
const weights = (Ls) => Ls.map((L, i) => {
  const lo = i === 0 ? L : Math.round((Ls[i - 1] + L) / 2), hi = i === Ls.length - 1 ? L : Math.round((L + Ls[i + 1]) / 2);
  let h = 0;
  for (let l = lo; l <= hi; l++) h += hoursForLevel(l);
  return h;
});
/* weighted least squares of ln(pay) on the step: ln(pay) = a + b x step */
function fitLog(pts) {
  const points = pts.map((p) => ({ ...p, step: levelStep(p.L) }));
  const w = weights(points.map((p) => p.L)), W = w.reduce((s, x) => s + x, 0);
  const mx = points.reduce((s, p, i) => s + w[i] * p.step, 0) / W, my = points.reduce((s, p, i) => s + w[i] * Math.log(p.pay), 0) / W;
  const sxy = points.reduce((s, p, i) => s + w[i] * (p.step - mx) * (Math.log(p.pay) - my), 0), sxx = points.reduce((s, p, i) => s + w[i] * (p.step - mx) ** 2, 0);
  const b = sxy / sxx;
  return { stepRate: Math.exp(b) - 1, base: Math.exp(my - b * mx), weights: w };
}

/* ── the scale's anchor: Muster Barrows at R4's Levels ── */
const anchor = [];
const m = read('steady-muster-L60.json');
if (!m) missing++;
else for (const id of ['base:steady', 'levels:steady', 'high:steady']) {
  const c = m.cells[id];
  anchor.push({ where: 'muster_barrows', L: c.L, held: c.held.mean, pay: c.gold.incomePerHeroH.mean, coin: c.gold.coinPerHeroH.mean, store: c.gold.storePerHeroH.mean });
}

/* ── the scale on each Level's ground (no DANGER_GROUNDS row: coin read at the gap cap, divided back to a reference pull) ── */
const CAP = (1 + PAY.payStepCoin) ** PAY.gapMax;
const scale = [];
for (const [g, L] of [['mosslight_glade', 20], ['hasks_ford', 45], ['krells_hold', 88], ['wyvern_roost', 145], ['unmarked_catacombs', 185], ['unmarked_catacombs', 400]]) {
  const r = read('steady-' + g + '-L' + L + '.json');
  if (!r) { missing++; continue; }
  const c = r.cells['base:steady'], gold = c.gold;
  const coin0 = gold.coinPerHeroH.mean / CAP;
  scale.push({ where: g, L, held: c.held.mean, pay: Math.round(coin0 + gold.incomePerHeroH.mean - gold.coinPerHeroH.mean), coin: Math.round(coin0), store: gold.storePerHeroH.mean,
    deaths: c.deaths, fourH: c.fourH });
}

/* ── the Lab: the baseline matrix's four (mixed MID, hbmh) on Normal on its own ground ── */
const lab = [];
const B = join(ROOT, 'tools/balance-program/baseline/overhaul-start/results.json.gz');
if (!existsSync(B)) missing++;
else {
  const j = JSON.parse(gunzipSync(readFileSync(B)));
  const ix = Object.fromEntries(j.outcomeIds.map((k, i) => [k, i]));
  const mean = (c, k) => { const v = c.seeds.map((s) => s[ix[k]]).filter(Number.isFinite); return v.reduce((a, b) => a + b, 0) / v.length; };
  /* one cell a Level: the four block where it exists, the pace4 / beyond block where not (the Level's own ground, as the matrix seats it) */
  const pick = new Map();
  for (const c of j.cells) {
    if (c.party !== 4 || c.gear !== 'mid' || c.comp !== 'hbmh' || c.tier !== 'normal' || !['four', 'pace4', 'beyond'].includes(c.block)) continue;
    if (c.L < 20 || c.L > 400) continue;
    if (!pick.has(c.L) || c.block === 'four') pick.set(c.L, c);
  }
  for (const [L, c] of [...pick].sort((a, b) => a[0] - b[0])) lab.push({ where: c.ground, L, pay: Math.round(mean(c, 'incomePerH')), coin: Math.round(mean(c, 'coinPerH')), store: Math.round(mean(c, 'storePerH')) });
}

const r0 = (x) => Math.round(x);
const pct = (x) => (Math.round(x * 10000) / 100) + '%';
const show = (title, pts, offset = 1) => {
  console.log('\n' + title);
  console.log('  Level  ground                held    pay/h   coin/h  store/h   wage(levelStep(L))  pay / wage' + (offset === 1 ? '' : ' / ' + offset.toFixed(2)));
  for (const p of pts) {
    const w = wage(levelStep(p.L)), x = p.pay / w / offset, ok = x >= BAND[0] && x <= BAND[1];
    console.log('  ' + String(p.L).padEnd(6) + p.where.padEnd(22) + String(p.held === undefined ? '' : r0(p.held)).padStart(5) + String(p.pay).padStart(9) + String(p.coin).padStart(9)
      + String(p.store).padStart(9) + String(w).padStart(20) + '  ' + (Math.round(x * 100) / 100).toFixed(2) + (ok ? '' : '  OUT OF BAND') + (p.deaths ? '  (' + p.deaths + ' deaths, four ' + p.fourH + ' h)' : ''));
  }
};

console.log('THE WAGE (src/data/wage.js): wageBase ' + WAGE.wageBase + ', payStepCoin ' + pct(WAGE.payStepCoin) + '; band ' + BAND.join(' to ') + ' of the wage');
const fl = fitLog(lab), fs = scale.length > 2 ? fitLog(scale) : null;
console.log('slope fitted on the Lab (Normal, own ground, 20-400, hours-weighted): ' + pct(fl.stepRate) + ' a step, base ' + r0(fl.base));
if (fs) console.log('slope fitted on the scale ground runs (20-400, hours-weighted):        ' + pct(fs.stepRate) + ' a step, base ' + r0(fs.base));
const anchorX = anchor.length ? Math.exp(anchor.reduce((s, p) => s + Math.log(p.pay / wage(levelStep(p.L))), 0) / anchor.length) : null;
console.log('the anchor (Muster Barrows on the scale, L60/63/70): pay / wage, geometric mean ' + (anchorX === null ? 'n/a' : anchorX.toFixed(3)));
show('THE ANCHOR: the scale as played (Muster Barrows, refStep 590), 6 seeds x 8 h, held start', anchor);
show('THE SCALE ON EACH LEVEL\'S GROUND (what-if: no refStep row; coin read back from the gap cap), 4 seeds x 6 h, held start', scale);
const labX = Math.exp(lab.reduce((s, p) => s + Math.log(p.pay / wage(levelStep(p.L))), 0) / lab.length);
show('THE LAB: the baseline matrix four on Normal on its own ground (8 seeds a cell). The old tier pays ' + labX.toFixed(2)
  + 'x the scale on the whole, so its SHAPE is read: pay / wage over that mean', lab, labX);
const first = (L) => blockPrice({ kind: 'hunt', level: L, n: 1 });
console.log('\nTHE FIRST HUNTING BLOCK (src/core/wage.js blockPrice) against what its 2 h pay at the anchor:');
for (const p of anchor) console.log('  L' + p.L + ': block ' + first(p.L) + ' gold for 2 h that pay ' + r0(2 * p.pay) + ' gross (' + (Math.round((first(p.L) / (2 * p.pay)) * 100) / 100) + 'x) and ' + r0(2 * (p.pay - p.store)) + ' net of the store');
process.exit(missing ? 2 : 0);
