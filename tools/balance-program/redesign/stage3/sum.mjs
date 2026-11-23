#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/stage3/sum.mjs — ONE TABLE FROM v1-climb REPORTS, READ AGAINST 27's C-TARGETS (lane/stage3-pipeline).
//
//   node tools/balance-program/redesign/stage3/sum.mjs <label>=<report.json> ...
//
// Per cell: the held step (mean +- sd over seeds), its depth, Level XP over the hours formula (T-02 / C7: 0.8 to 1.2), coin a hero-hour over
// wage(Level) (EL-PAY: 0.95 to 1.05 on Steady), the kit share of income (0.2 to 0.3), fall backs an hour, deaths (C-3: none on Careful and
// Steady), the front hero's share of the damage taken, and the sustain shares (regeneration / heal spells / food). Then, per report, the
// paired power moves of v1-climb's variants (C-2: a gear tier moves the hold 1 to 3 depths) and Careful and Bold over Steady (C-5, C-4).
// Exit 0 printed · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { wage } = await import(pathToFileURL(join(ROOT, 'src/data/wage.js')).href);
const { DANGER_GROUNDS, DEPTHS } = await import(pathToFileURL(join(ROOT, 'src/data/danger.js')).href);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const depthOf = (g, s) => { const r = DANGER_GROUNDS[g]; if (!r || !Number.isFinite(s)) return null; return Math.max(1, Math.min(DEPTHS, 1 + Math.round(((s - r.floorStep) * (DEPTHS - 1)) / (r.topStep - r.floorStep)))); };
const rows = [];
for (const a of process.argv.slice(2)) {
  const [label, file] = a.includes('=') ? a.split('=') : [a, a];
  const j = JSON.parse(readFileSync(file, 'utf8'));
  for (const c of Object.values(j.cells)) {
    const coin = c.gold && c.gold.coinPerHeroH ? c.gold.coinPerHeroH.mean : null, inc = c.gold && c.gold.incomePerHeroH ? c.gold.incomePerHeroH.mean : null;
    const store = c.gold && c.gold.storePerHeroH ? c.gold.storePerHeroH.mean : null;
    const front = Array.isArray(c.takenShare) && c.takenShare.length ? c.takenShare[0].mean : null;
    rows.push({ label, ground: j.ground, id: c.id, L: c.L, held: c.held.mean, sd: c.held.sd, depth: depthOf(j.ground, c.held.mean), pay: c.payX && c.payX.mean,
      wage: coin !== null ? coin / wage(c.L) : null, kit: inc ? store / inc : null, falls: c.fallsPerH, deaths: c.deaths, seedsDead: c.seedsWithADeath, front,
      sus: c.sustain ? [c.sustain.freePm, c.sustain.spellPm, c.sustain.foodPm].join('/') : '-', kills: c.killsPerH, perSeed: c.held.perSeed });
  }
}
console.log('label            cell                L   held (sd)        depth  XP/formula  coin/wage  kit   falls/h  deaths  front  sustain free/spell/food');
for (const r of rows) console.log([r.label.padEnd(16), r.id.padEnd(18), String(r.L).padStart(3), (f1(r.held) + ' (' + f1(r.sd) + ')').padEnd(16), String(r.depth).padStart(5),
  f2(r.pay).padStart(10), f2(r.wage).padStart(10), f2(r.kit).padStart(5), f1(r.falls).padStart(8), (r.deaths + '/' + r.seedsDead).padStart(7), f2(r.front).padStart(6), r.sus].join(' '));
/* paired moves and stance ratios, per label */
const by = (label, id) => rows.find((r) => r.label === label && r.id === id);
const labels = [...new Set(rows.map((r) => r.label))];
console.log('\npaired reads (held step differences are paired by seed; depth = band/19 steps)');
for (const label of labels) {
  const g = rows.find((r) => r.label === label).ground, band = DANGER_GROUNDS[g], perDepth = (band.topStep - band.floorStep) / (DEPTHS - 1);
  for (const risk of ['careful', 'steady', 'bold']) {
    const base = by(label, 'base:' + risk);
    if (!base) continue;
    for (const v of ['weapon', 'armor', 'skill', 'levels']) {
      const x = by(label, v + ':' + risk);
      if (!x || !x.perSeed || !base.perSeed) continue;
      const d = x.perSeed.map((s, i) => s - base.perSeed[i]).filter(Number.isFinite), m = d.reduce((a, b) => a + b, 0) / d.length;
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1)), se = sd / Math.sqrt(d.length);
      console.log('  ' + label.padEnd(14) + ' ' + (v + ':' + risk).padEnd(16) + ' held ' + (m >= 0 ? '+' : '') + f1(m) + ' (se ' + f1(se) + ') = ' + f2(m / perDepth) + ' depths');
    }
  }
  const st = by(label, 'base:steady');
  for (const risk of ['careful', 'bold']) {
    const x = by(label, 'base:' + risk);
    if (st && x && st.pay && x.pay) console.log('  ' + label.padEnd(14) + ' ' + (risk + ' / steady').padEnd(16) + ' XP ' + f2(x.pay / st.pay) + '  coin ' + f2(x.wage / st.wage));
  }
}
