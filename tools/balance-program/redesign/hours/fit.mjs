#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/hours/fit.mjs — THE HOURS A LEVEL TAKES, READ BACK OFF THE REAL ENGINE (lane/formula-overhaul, 2026-11-22).
//
//   node tools/balance-program/redesign/hours/fit.mjs [--seeds 4] [--hours 4] [--workers 6] [--json <file>]
//
// docs/design/redesign/27-formula-overhaul.md row P-1. The hours a Level takes is a formula (src/data/core-model.js LEVEL_HOURS) and the pay a
// kill makes on the Danger scale is derived from it (src/core/hunt/danger.js levelShareXp), so a company that holds its ground's reference step
// at its ground's reference kill rate earns the formula exactly. What the engine decides is how far a real company sits from that: the depth
// it holds (pay x (1 + payStepXp) ^ gap, floored and capped) and the kills a head it makes. This plays the Steady mixed four (hammer, bow, mage,
// healer; MID kits; tools/balance-program/redesign/held-four.mjs, the same path as tests/level-curve.mjs C7) from its held start on every scale
// ground at Levels across the ground's band and past its top, and reads:
//   ratio      Level XP a head an hour over the formula's (1.00 = the formula's hours)
//   realized   the hours that Level really takes for that company (formula / ratio)
// Levels with no scale ground under them (under 45, 76 to 164, past 185) are not played: there is no band to hold. Their pace is the formula's
// by construction once a ground's band exists there (the scale test, 04 section 14), and today they pay by the old row XP.
//
// Exit 0 ran (a table is printed, never a verdict) · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 4)), HOURS = Number(arg('hours', 4)), WORKERS = Number(arg('workers', 6));
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { playCells, tableRate } = await imp('tools/balance-program/redesign/held-four.mjs');
const { hoursForLevel } = await imp('src/core/hunt/danger.js');
const { DANGER_GROUNDS } = await imp('src/data/danger.js');
const { LEVEL_HOURS } = await imp('src/data/core-model.js');

/* each scale ground at its entry, its middle, its top and past its top (the band the ground covers: 12-targets 3) */
const PLAN = {
  hasks_ford: [45, 50, 55, 60, 70],
  muster_barrows: [55, 60, 65, 70, 75, 90],
  catacomb_bone_wing: [165, 175, 185, 200],
  catacomb_flooded_wing: [165, 175, 185, 200],
};
const MIXED = ['hammer', 'bow', 'mage', 'healer'];
const cells = [];
for (const [g, Ls] of Object.entries(PLAN)) {
  if (!DANGER_GROUNDS[g]) continue;
  for (const L of Ls) cells.push({ id: `${g}:${L}`, ground: g, L, styles: MIXED, risk: 'steady', hours: HOURS, seeds: SEEDS });
}
const t0 = Date.now();
let res;
try { res = await playCells(ROOT, cells, { workers: WORKERS }); } catch (e) { console.error(String(e.message || e)); process.exit(2); }
const rows = [];
for (const c of cells) {
  const r = res[c.id], table = await tableRate(ROOT, c.L), ratio = r.xpHeadH / table;
  const sd = Math.sqrt(r.xpHeadHSeeds.reduce((a, x) => a + (x / table - ratio) ** 2, 0) / Math.max(1, r.xpHeadHSeeds.length - 1));
  rows.push({ ground: c.ground, L: c.L, refStep: DANGER_GROUNDS[c.ground].refStep, topStep: DANGER_GROUNDS[c.ground].topStep, held: Math.round(r.held),
    killsHeadH: Math.round(r.killsH / 4), ratio: Math.round(ratio * 1000) / 1000, ratioSd: Math.round(sd * 1000) / 1000, deaths: r.deaths,
    formulaH: Math.round(hoursForLevel(c.L) * 100) / 100, realizedH: Math.round((hoursForLevel(c.L) / ratio) * 100) / 100 });
}
console.log(`HOURS A LEVEL: formula ceiling ${LEVEL_HOURS.ceiling} x L^2 / ((L + ${LEVEL_HOURS.half})(L + ${LEVEL_HOURS.early})); Steady mixed four, MID kits, held start, ${SEEDS} seeds x ${HOURS} h`);
console.log('ground                  L    ref  top  held kills/hd  ratio (sd)     formula h  realized h  deaths');
for (const r of rows) console.log(`${r.ground.padEnd(22)} ${String(r.L).padStart(4)} ${String(r.refStep).padStart(5)} ${String(r.topStep).padStart(4)} ${String(r.held).padStart(5)} ${String(r.killsHeadH).padStart(8)}  ${r.ratio.toFixed(2)} (${r.ratioSd.toFixed(2)})  ${String(r.formulaH).padStart(9)}  ${String(r.realizedH).padStart(10)}  ${r.deaths}`);
console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
const out = arg('json');
if (out) writeFileSync(out, JSON.stringify({ when: new Date().toISOString().slice(0, 10), levers: LEVEL_HOURS, seeds: SEEDS, hours: HOURS, rows }, null, 1) + '\n');
