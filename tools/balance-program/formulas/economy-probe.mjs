#!/usr/bin/env node
// tools/balance-program/formulas/economy-probe.mjs — READ-ONLY probe for the formula audit (43-formulas-economy.md, section 7).
// Reads the game's own formula functions (src/data/balance-sheet.js formulaStats and contractXpPerH, src/core/xp.js, the price functions
// of src/data/*) at Levels well past 400, and the cached real-engine grid (progression-grid.json) where it has cells. Plays nothing,
// writes nothing. LABELS: FORMULA = the game's function evaluated; GRID = the cached real-engine cell (PROJECTED past Level 185);
// DERIVED = arithmetic on those.
//   node tools/balance-program/formulas/economy-probe.mjs [--json]
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..', '..', '..');
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { formulaStats, contractXpPerH, STAT_FORMULA } = await mod('src/data/balance-sheet.js');
const { charXpForLevel } = await mod('src/core/xp.js');
const { refillPrice, STAMINA_REFILL } = await mod('src/data/stamina-refill.js');
const { blessingPrice } = await mod('src/core/wage.js');
/* (the scaled hour's price left with the scaled hunts, lane/retire-tier-chain 2026-11-26) */
const { DEATH_XP_LOSS, STAMINA_MAX_MS } = await mod('src/data/hunt-sessions.js');
const { TEMPER_STEPS } = await mod('src/data/temper.js');

const LEVELS = [1, 10, 30, 50, 100, 200, 400, 1000, 2000, 5000];
const rows = [];
for (const L of LEVELS) {
  const s = formulaStats({ level: L, role: 'regular', floor: L, tier: 6, fit: 'both', ground: '' });
  const gpMean = (s.gp[0] + s.gp[1]) / 2, contract = contractXpPerH(L);
  const killsPerH = contract / s.xp;                       // DERIVED: the kills an hour a lone hero on the pace contract makes
  const coinPerH = killsPerH * gpMean;                     // DERIVED: coin only, no sold loot, no supplies
  let xpToNext = null, total = null;
  try { total = charXpForLevel(L); xpToNext = charXpForLevel(L + 1) - total; } catch { /* the curve refuses this Level */ }
  const capMin = STAMINA_MAX_MS.free / 60000;
  const refills = [];
  for (let n = 0; n < STAMINA_REFILL.perDay; n++) { const q = refillPrice({ level: L, currentMin: 0, capMin, boughtToday: n }); refills.push(q ? q.price : null); }
  const bless = blessingPrice(L);   /* the ONE Blessing (lane/level-costs, 2026-11-22) */
  rows.push({ L, hp: s.hp, xpKill: s.xp, gpMean, coinPerXp: +(gpMean / s.xp).toFixed(4), contractXpPerH: Math.round(contract), killsPerH: Math.round(killsPerH),
    coinPerH: Math.round(coinPerH), hoursALevel: xpToNext == null ? null : +(xpToNext / contract).toFixed(2),
    refill1: refills[0], refill1Over4hCoin: +(refills[0] / (4 * coinPerH)).toFixed(3), sixRefills: refills.reduce((a, b) => a + (b || 0), 0),
    blessing: bless, blessOverHourCoin: +(bless / coinPerH).toFixed(3), deathHours: total == null ? null : +((total * DEATH_XP_LOSS) / contract).toFixed(1) });
}

// GRID: what the real engine measured at each checkpoint (MID gear, Normal), a lone hero and a four.
let grid = null;
try {
  const g = JSON.parse(readFileSync(join(HERE, '..', 'progression-grid.json'), 'utf8'));
  const cf = g.cellFields, rf = g.rateFields, at = (f) => rf.indexOf(f), c0 = (f) => cf.indexOf(f);
  grid = g.cells.map(([c, r]) => ({ L: c[c0('L')], gear: c[c0('gear')], party: c[c0('party')], tier: c[c0('tier')], ground: c[c0('ground')],
    label: c[c0('label')], error: c[c0('error')], coin: r && r[at('coinPerH')], income: r && r[at('incomePerH')], store: r && r[at('storePerH')],
    net: r && r[at('netPerH')], kills: r && r[at('killsPerH')], xp: r && r[at('levelXpPerH')] }))
    .filter((x) => x.gear === 'mid' && x.tier === 'normal' && (x.party === 1 || x.party === 4) && !x.error);
} catch { grid = null; }

const gridRows = [];
if (grid) {
  const by = new Map();
  for (const x of grid) {
    const k = x.L + '|' + x.party;
    const a = by.get(k) || { L: x.L, party: x.party, n: 0, coin: 0, income: 0, store: 0, net: 0, kills: 0, xp: 0, label: x.label, ground: x.ground };
    a.n++;
    for (const f of ['coin', 'income', 'store', 'net', 'kills', 'xp']) a[f] += Number(x[f]) || 0;
    by.set(k, a);
  }
  for (const a of by.values()) gridRows.push({ L: a.L, party: a.party, label: a.label, ground: a.ground, n: a.n, xpPerH: Math.round(a.xp / a.n), coinPerH: Math.round(a.coin / a.n),
    incomePerH: Math.round(a.income / a.n), storePerH: Math.round(a.store / a.n), netPerH: Math.round(a.net / a.n), killsPerH: Math.round(a.kills / a.n) });
}

// THE ACCOUNT-DAY (DERIVED from GRID): four heroes at 12 h each on the free 8 h bar, so one 4 h refill a hero a day at the first price.
// `party` 1 = four heroes each hunting alone, 4 = the account's own four. Repeating sinks = the store bill + the refills (G-9's numerator).
const dayRows = gridRows.filter((g) => [10, 30, 50, 75, 100, 110, 145, 185, 200, 300, 400].includes(g.L)).map((g) => {
  const q = refillPrice({ level: g.L, currentMin: 0, capMin: STAMINA_MAX_MS.free / 60000, boughtToday: 0 });
  const goldIn = 48 * g.incomePerH, store = 48 * g.storePerH, refills = 4 * q.price;
  return { L: g.L, party: g.party, label: g.label, goldInADay: goldIn, storeADay: store, refillsADay: refills, repeatingShare: +((store + refills) / goldIn).toFixed(2), netADay: goldIn - store - refills };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, grid: gridRows, accountDay: dayRows, temperRanks: TEMPER_STEPS.ranks, xpFormula: STAT_FORMULA.xp, gpFormula: STAT_FORMULA.gp }, null, 1));
} else {
  console.log('FORMULA and DERIVED: a regular monster of Level L on a ground whose floor is L, a lone hero on the pace contract');
  console.table(rows);
  if (gridRows.length) {
    console.log('GRID (real engine, MID gear, Normal; mean over the ways at the checkpoint, per hero-hour as the grid stores it; PROJECTED past 185):');
    if (!process.argv.includes('--day')) console.table(gridRows);
    console.log('ACCOUNT-DAY (DERIVED from GRID): four heroes x 12 h, one refill a hero; party 1 = four lone heroes, 4 = the own four:');
    console.table(dayRows);
  }
}
