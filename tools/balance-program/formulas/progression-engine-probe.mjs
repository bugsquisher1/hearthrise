#!/usr/bin/env node
// tools/balance-program/formulas/progression-engine-probe.mjs — READ-ONLY: the REAL engine past Level 400 (formula audit, 42-formulas-progression.md §7).
// The progression grid stops at 400. This plays the same cells (progression-grid.mjs buildCell -> tools/balance-sim/worker.mjs -> the hr-accrue settle ->
// src/core/combat-sim.js) at 400, 1,000, 2,000 and 5,000, on the grid's own placeholder ground (STAT_FORMULA at that floor) and its projected gear line
// (Dawnsteel x Level / 110). Two things differ from the grid, both said in the output:
//   skills   'line'  the grid's own skill-lines extrapolation (a straight line on the last ten measured Levels)
//            'curve' the skill the curve allows IF the pace contract holds (Melee XP an hour = 1.5 x damage an hour, on xp.js's curve)
//   gear     'line'  the projected line (MID)          'frozen' the best real gear in the data today (the grid's kit at Level 185, worn at L)
//   node tools/balance-program/formulas/progression-engine-probe.mjs [--levels 400,1000,2000,5000] [--hours 1] [--workers 3] [--json out.json]
// Writes nothing unless --json. Changes no game file.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LEVELS = arg('levels', '400,1000,2000,5000').split(',').map(Number);
const HOURS = Number(arg('hours', '1')), WORKERS = Math.min(3, Number(arg('workers', '3')));

const PG = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const XP = await imp('src/core/xp.js');
const CM = await imp('src/data/core-model.js');
const BS = await imp('src/data/balance-sheet.js');
const D = await PG.loadGridData(ROOT), K = await loadKits(ROOT);

/* the skill the curve allows at Level L if the pace contract holds all the way (the probe's analytic twin, progression-probe.mjs careerSkill) */
const contract = BS.contractXpPerH, step = (L) => XP.charXpForLevel(L + 1) - XP.charXpForLevel(L);
const xpPerHp = (L) => Math.max(BS.STAT_FORMULA.xp.min, BS.STAT_FORMULA.xp.a * L ** BS.STAT_FORMULA.xp.b);
let sxp = 0; const curveSkill = {};
const top = Math.max(...LEVELS);
for (let L = 1; L <= top; L++) { curveSkill[L] = XP.skillLevelFromXp('melee', sxp); sxp += (step(L) / contract(L)) * CM.COMBAT_XP.hitXpPerDamage * (contract(L) / xpPerHp(L)); }

const PARTIES = [[['hammer'], 'h'], [['tank', 'healer', 'bow', 'mage'], 'thbm']];
const jobs = [], meta = {};
for (const L of LEVELS) for (const [styles, comp] of PARTIES) for (const tier of ['normal', 'deadly']) for (const variant of ['line/line', 'curve/line', 'curve/frozen']) {
  const [skillMode, gearMode] = variant.split('/');
  const ground = D.groundAt(L, styles.length);
  let b;
  try { b = PG.buildCell(D, K, { L, gear: 'mid', styles, tier, ground }); } catch (e) { console.error('skip ' + L + ' ' + comp + ' ' + tier + ': ' + e.message); continue; }
  const cell = JSON.parse(JSON.stringify(b.cell)); let whatIf = b.whatIf ? JSON.parse(JSON.stringify(b.whatIf)) : null;
  if (skillMode === 'curve') cell.skillsBySeat = cell.skillsBySeat.map((s, i) => {
    const main = PG.MAIN[styles[i]] || 'melee', ratio = (s.defense || 1) / Math.max(1, s[main] || 1);
    /* the main skill on the curve; Defense keeps the share of it the measured line holds */
    return { ...s, [main]: curveSkill[L], defense: Math.max(1, Math.round(curveSkill[L] * Math.min(1, ratio))) };
  });
  if (gearMode === 'frozen') {
    /* the kit a hero of Level 185 wears (the last real and staged gear), on this Level's monsters: no projected item rows */
    const f = PG.buildCell(D, K, { L: 185, gear: 'mid', styles, tier, ground: D.groundAt(185, styles.length) });
    cell.gearBySeat = JSON.parse(JSON.stringify(f.cell.gearBySeat));
    if (f.cell.temper) cell.temper = f.cell.temper; else delete cell.temper;
    if (whatIf) { delete whatIf.items; }
  }
  const key = [L, comp, tier, variant].join('|');
  meta[key] = { L, comp, tier, variant, size: styles.length, skills: cell.skillsBySeat.map((s, i) => s[PG.MAIN[styles[i]] || 'melee']) };
  for (let s = 0; s < 2; s++) jobs.push({ id: key + '#' + s, key, whatIf, cell: { ...cell, id: 'FPROBE:' + key, hours: HOURS, seeds: 1, seedBase: s } });
}
console.error(jobs.length + ' seed jobs on ' + WORKERS + ' workers, ' + HOURS + ' h each');
const { results, errors } = await PG.playAll(jobs, WORKERS, { log: (m) => { if (/\[(\d+)0\//.test(m) || /\/\d+\] .*#1 /.test(m) === false) return; } });
for (const e of errors) console.error('ERROR ' + e.id + ': ' + e.error);

const rows = [];
for (const [key, m] of Object.entries(meta)) {
  const seeds = Object.values(results).filter((r) => r.id.startsWith(key + '#')).map((r) => r.result);
  if (!seeds.length) continue;
  const heroH = seeds.reduce((s, r) => s + r.heroes.reduce((a, h) => a + h.hours, 0), 0) || 1e-9;
  const sum = (f) => seeds.reduce((s, r) => s + r.heroes.reduce((a, h) => a + f(h), 0), 0);
  const xpH = sum((h) => h.raw.levelXp) / heroH, deaths = sum((h) => h.deaths || 0);
  const kills =seeds.reduce((s, r) => s + r.party.killsPerH, 0) / seeds.length;
  const lows = seeds.flatMap((r) => r.heroes.map((h) => h.encMinHpPct)).filter((x) => x && typeof x === 'object');
  rows.push({ L: m.L, party: m.size, tier: m.tier, 'skills/gear': m.variant, mainSkill: m.skills.join(','), levelXpPerHeroH: Math.round(xpH), contract: Math.round(contract(m.L)), xContract: Math.round((xpH / contract(m.L)) * 100) / 100,
    killsPerH: Math.round(kills), deathsPerHeroH: Math.round((deaths / heroH) * 100) / 100, takenPerH: Math.round(sum((h) => h.takenPerH * h.hours) / heroH), maxHp: seeds[0].heroes.map((h) => h.maxHp).join(','),
    hoursALevel: Math.round((step(m.L) / Math.max(1, xpH)) * 10) / 10 });
}
console.table(rows);
if (arg('json', null)) writeFileSync(arg('json', null), JSON.stringify({ hours: HOURS, seeds: 2, rows, errors }, null, 1));
