// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/held-four.mjs — A COMPANY PLAYED AT ITS HELD DEPTH, ON THE REAL ENGINE (lane/r6-release-plan, 2026-11-22).
//
// The shared reader for two guards that judge the Danger scale from a HELD start, not from step 0 (12-targets section 2.6):
//   tests/level-curve.mjs C7   T-02 re-aimed: a Steady four at its held depth earns the hours table, +-20%
//   tests/lineup-v4.mjs        T-03 retired into V4: a four of one style loses to a mixed four; no lineup is best on every scale ground
// Every number comes off the same path v1-climb.mjs plays (tools/balance-sim/worker.mjs -> cell.mjs runCell -> hr-accrue accrueHunt ->
// src/core/combat-sim.js): the matrix's MID kits and played bars, a real hunt with the real death rule, one engine a process.
//
// THE HELD START is the game's own start rule (src/data/danger.js DANGER.startMargin): a company opens `startMargin` steps under the step it
// held before. The step it holds on a scale ground is that ground's reference step (DANGER_GROUNDS refStep: the band's middle, MEASURED
// as the Steady four's hold, 12-targets 2.5), so a held start is refStep - startMargin, unless a cell names another start.
//
//   import { playCells, tableRate } from './held-four.mjs';
//   const out = await playCells(ROOT, [{ id, ground, L, styles, risk, start, hours, seeds }], { workers });
//   out[id] = { xpHeadH, xpHeadHSeeds, deaths, held, killsH }
// PURE ESM; Node only (it forks the simulator's worker).
// ════════════════════════════════════════════════════════════════════════
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';

const imp = (root, p) => import(pathToFileURL(join(root, p)).href);

/** The hours table's Level XP a head an hour at Level L: the XP to the next Level over the hours that Level takes (danger.js hoursForLevel). */
export async function tableRate(root, L) {
  const { hoursForLevel } = await imp(root, 'src/core/hunt/danger.js');
  const XP = await imp(root, 'src/core/xp.js');
  return (XP.charXpForLevel(L + 1) - XP.charXpForLevel(L)) / hoursForLevel(L);
}

/** The step a company holds before (the ground's reference step) less the game's start margin. */
export async function heldStart(root, ground) {
  const { DANGER, DANGER_GROUNDS } = await imp(root, 'src/data/danger.js');
  const g = DANGER_GROUNDS[ground];
  if (!g) throw new Error(`held-four: ${ground} is not a scale ground (src/data/danger.js DANGER_GROUNDS)`);
  return Math.max(0, g.refStep - DANGER.startMargin);
}

function pool(root, jobs, n) {
  const queue = jobs.slice(), out = {}, errors = [];
  return new Promise((finish) => {
    let alive = Math.max(1, Math.min(n, queue.length));
    for (let i = 0, k = alive; i < k; i++) {
      const w = fork(join(root, 'tools', 'balance-sim', 'worker.mjs'), [root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const feed = () => { const j = queue.shift(); if (!j) { w.kill(); return; } w.cur = j; w.send({ type: 'job', job: j.job }); };
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(); return; }
        if (m.type === 'done') out[w.cur.key] = m.result; else errors.push(`${w.cur.key}: ${String(m.error).split('\n')[0]}`);
        w.cur = null; feed();
      });
      w.on('exit', () => { if (w.cur) errors.push(`${w.cur.key}: the worker exited`); if (--alive === 0) finish({ out, errors }); });
    }
  });
}

/**
 * Play every cell `seeds` times and read each one's Level XP a head an hour (the party's, over the whole hunt).
 * A cell: { id, ground, L, styles, risk, start?, hours, seeds, gear? }. Throws on any worker error (a harness fault, never a verdict).
 */
export async function playCells(root, cells, { workers = Math.max(1, Math.min(8, cpus().length - 1)) } = {}) {
  const { loadGridData, buildCell } = await imp(root, 'tools/balance-program/progression-grid.mjs');
  const { loadKits } = await imp(root, 'tools/balance-program/grid-kit.mjs');
  const D = await loadGridData(root), K = await loadKits(root);
  const jobs = [];
  for (const c of cells) {
    const start = Number.isInteger(c.start) ? c.start : await heldStart(root, c.ground);
    const b = buildCell(D, K, { L: c.L, gear: c.gear || 'mid', styles: c.styles, tier: 'normal', ground: c.ground });
    const cell = { ...b.cell, options: { risk: c.risk, danger: start }, hours: c.hours, seeds: 1 };
    for (let s = 0; s < c.seeds; s++) jobs.push({ key: `${c.id}#${s}`, job: { ...cell, id: `HELD:${c.id}#${s}`, seedBase: 1000 + s } });
  }
  const { out, errors } = await pool(root, jobs, workers);
  if (errors.length) throw new Error('held-four: the simulator failed:\n  ' + errors.join('\n  '));
  const res = {};
  for (const c of cells) {
    const seeds = [];
    for (let s = 0; s < c.seeds; s++) seeds.push(out[`${c.id}#${s}`]);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const xs = seeds.map((r) => r.party.levelXpPerHeroPerH);
    res[c.id] = {
      xpHeadH: mean(xs), xpHeadHSeeds: xs.map(Math.round),
      killsH: mean(seeds.map((r) => r.party.killsPerH)),
      deaths: seeds.reduce((a, r) => a + r.heroes.reduce((b, h) => b + h.deaths, 0), 0),
      held: mean(seeds.map((r) => { const d = r.party.danger || []; return d.length ? d[d.length - 1][3] : NaN; })),
    };
  }
  return res;
}
