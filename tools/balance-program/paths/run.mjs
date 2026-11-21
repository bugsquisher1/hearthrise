// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/paths/run.mjs — ONE SOLVER PROCESS: load the atlas once, play the scenarios it is handed.
//
//   setup(opts) -> { atlas, D, kits, S }            (shared by paths.mjs in-process and by the worker threads)
//   playScenario(ctx, sc) -> { sc, bands, level }   one scenario's gear path (paths/solve.mjs gearPath) and, for the goal 'level', its level path
// As a worker thread (node:worker_threads) it reads { opts, scenarios } and posts one result a scenario.
// ════════════════════════════════════════════════════════════════════════
import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { atlasOf } from '../sources.mjs';
import { makeSolver, GEAR_BANDS } from './solve.mjs';
import { townModel } from '../atlas/town.mjs';
import { luckAt } from '../atlas/sources-hunt.mjs';

export async function setup(opts = {}) {
  const { atlas, D, kits, rates } = await atlasOf({ quick: !!opts.quick, D: opts.D, kits: undefined });
  const P = atlas._pricer;
  const T = townModel(D);
  const level = makeSolver({ D, P, kits, opts: { beam: 1, T, luckAt } }).levelPath({ party: 1, comp: ['hammer'], payer: 'free', townH: 12 });
  /* the town and the Luck bar carried into a band: what a hero has at the band's floor on the lone path (hunted hours so far; town skills
     unknown before the band, so each band starts its own: a conservative floor the solver must climb) */
  const huntedAt = (L) => (level.at[L] !== undefined ? level.at[L] * 12 : L * 10);
  const S = makeSolver({ D, P, kits, opts: { beam: opts.beam || 4, T, luckAt, huntedAt, maxDays: opts.maxDays || 400 } });
  return { atlas, D, kits, S, P, T, rates };
}

export function playScenario(ctx, sc) {
  const t0 = Date.now();
  const bands = sc.bands ? GEAR_BANDS.filter((b) => sc.bands.includes(b.id)) : GEAR_BANDS;
  const out = { sc: { ...sc, without: sc.without ? [...sc.without] : undefined }, ms: 0 };
  const sc2 = { ...sc, without: sc.without ? new Set(sc.without) : undefined };
  if (sc.goal === 'level') out.level = ctx.S.levelPath(sc2);
  else {
    out.bands = ctx.S.gearPath(sc2, sc.goal, bands, !!sc.sample);
    if (sc.sample) for (const b of out.bands) { b.sampled = ctx.S.sample(b, sc.sample, 7); delete b.rates; }
  }
  out.ms = Date.now() - t0;
  return out;
}

if (!isMainThread && parentPort && workerData && workerData.kind === 'paths') {
  const ctx = await setup(workerData.opts);
  for (const sc of workerData.scenarios) parentPort.postMessage({ type: 'done', result: playScenario(ctx, sc) });
  parentPort.postMessage({ type: 'end' });
}
