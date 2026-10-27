// tools/balance-sim/worker.mjs — one simulator process: loads the real engine once, then plays the jobs its parent
// sends (a cell, or a career run) and answers each one's metrics. A job's `whatIf` mutates the ENGINE'S own data rows
// (the ?v= module instances src/core reads, and the runner's copies) for that job only, and restores them after.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCellRunner } from './cell.mjs';
import { runCareer } from './career.mjs';

const root = process.argv[2];
const R = await loadCellRunner(root);
const { BUILD } = await import(pathToFileURL(join(root, 'src/build-info.js')).href);
const v = '?v=' + BUILD.version;
const ENG = {
  monsters: [(await import(pathToFileURL(join(root, 'src/data/monsters.js')).href + v)).MONSTERS, (await import(pathToFileURL(join(root, 'src/data/monsters.js')).href)).MONSTERS],
  items: [(await import(pathToFileURL(join(root, 'src/data/items.js')).href + v)).ITEMS, (await import(pathToFileURL(join(root, 'src/data/items.js')).href)).ITEMS],
  combat: [(await import(pathToFileURL(join(root, 'src/core/combat.js')).href + v)).COMBAT_BALANCE],
};
/* THE GAME'S OWN HUNT ADVICE (the Hunts window's default pick): a career hunts where the game tells it to */
const { recommendedHunt } = await import(pathToFileURL(join(root, 'src/shell/hunt-list.js')).href + v);
const recommend = (levels, n) => recommendedHunt(levels, n).hunt;

/* A WHAT-IF: { monsters: { id | '*': { field: value | '*x' multiplier } }, items: { id: { field: value } },
   combat: { field: value } } on every engine instance; answers the undo list. Scratch only: never written to disk. */
function applyWhatIf(w) {
  const undo = [];
  const set = (row, k, val) => {
    undo.push([row, k, Object.prototype.hasOwnProperty.call(row, k), row[k]]);
    row[k] = typeof val === 'string' && val.startsWith('*') ? Math.max(1, Math.round(Number(row[k] || 0) * Number(val.slice(1)))) : val;
  };
  for (const [table, rows] of Object.entries(w || {})) {
    for (const inst of ENG[table] || []) {
      if (table === 'combat') { for (const [k, val] of Object.entries(rows)) set(inst, k, val); continue; }
      for (const [id, fields] of Object.entries(rows)) {
        const ids = id === '*' ? Object.keys(inst) : [id];
        for (const x of ids) if (inst[x]) for (const [k, val] of Object.entries(fields)) set(inst[x], k, val);
      }
    }
  }
  return undo;
}
function undoWhatIf(undo) {
  for (let i = undo.length - 1; i >= 0; i--) {
    const [row, k, had, val] = undo[i];
    if (had) row[k] = val; else delete row[k];
  }
}

process.on('message', (msg) => {
  if (!msg || msg.type !== 'job') return;
  const t = Date.now();
  let undo = [];
  try {
    undo = applyWhatIf(msg.job.whatIf);
    const result = msg.job.kind === 'career' ? runCareer(R, { ...msg.job, recommend }) : R.runCell(msg.job);
    process.send({ type: 'done', id: msg.job.id, ms: Date.now() - t, result });
  } catch (e) {
    process.send({ type: 'error', id: msg.job.id, ms: Date.now() - t, error: String((e && e.stack) || e) });
  } finally {
    undoWhatIf(undo);
  }
});
process.send({ type: 'ready' });
