// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/measure.mjs — PLAY THE GROUND-RATE TABLE (the cached full run of `sources.mjs --measure`).
//
// Every ground at both ends of its band, every party size of 50-standards 1.3 and every tier it has, MID kit, on the real settle.
// ONE SOURCE OF RATES (the Coordinator 2026-11-21): the cells are the balance matrix's `grounds` block (tools/balance-program/balance-matrix.mjs
// runGroundRates, matrix-plan.mjs), built by the progression grid's buildCell, so the solver, the grid and the dashboard read the same cells
// played the same way (the grid's kits, career-line skills and the tier row's pull: this table's own jobs once played a harder tier at the
// ground's built pull). Writes tools/balance-program/ground-rates.json in the table's schema, stamped with the commit and the matrix hash.
// --quick plays sizes 1 and 4, one composition, Normal and the hardest tier, 1 seed x 1 h; the full run 2 seeds x 1 h, every tier and comp.
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { ROOT } from './data.mjs';

export const RATES_FILE = join(ROOT, 'tools', 'balance-program', 'ground-rates.json');

/** D is the atlas's data (unused: the matrix plans from the tree itself); opts { quick, only, workers, log }. Answers { table, res, jsonl }. */
export async function measureGroundRates(D, opts = {}) {
  void D;
  const { runGroundRates } = await import('../balance-matrix.mjs');
  return runGroundRates({ quick: !!opts.quick, only: opts.only || null, workers: Math.min(opts.workers || 4, 4), log: opts.log });
}
