// ════════════════════════════════════════════════════════════════════════
// tests/_mutant-batch.mjs — ONE MODULE GRAPH A BATCH: a mutant runner that imports a planted copy of src per mutant judges them in
// child processes, a batch at a time, so no process holds more than one batch of copies. It holds no rule.
//
// THE INCIDENT (lane/nightly-red-1128). ES modules never unload, so a runner that imports a planted copy of src per mutant keeps every
// copy until it exits. On GitHub's Node 20 (heap ~2,048 MB) that killed alpha-windows-pure (nightly 46142108500, 149 mutants, 45 s)
// and hunt-scene-live (next 46158422801, ~30 MB a mutant, 611 s in), and on set/v0.2.144 26962cd28 (Node 26, heap at exit) one process
// held abilities 1,509 MB, conditions 1,254, signature-rules 1,120, danger 1,035 and first-week-bands 954.
//
// judgeMutants(mutants, judge) answers judge(mu) for every mutant, in their order: a batch of `per` runs in a child (this same script,
// run again with `--mutant-batch=a:b`), which writes each answer as one JSON line and exits with its copies. An answer is whatever
// judge returned (JSON); a throw answers 'threw <message>'; a mutant whose batch died answers 'HARNESS: ...', never a catch. A runner
// skips its own clean run in a batch child (inMutantBatch): the parent ran it. tests/hunt-core/run-all.mjs holds every hunt-core file
// and batch to a heap budget; tests/hunt-core/pool.mjs proves the round trip (HB-4) and the budget.
// ════════════════════════════════════════════════════════════════════════
import { writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const MUTANT_BATCH = 20;
const BATCH_ARG = '--mutant-batch=';
const ANSWER = 'MUTANT-ANSWER ';
export const inMutantBatch = (argv = process.argv) => argv.some((a) => a.startsWith(BATCH_ARG));

/** `judge(mu)` → its answer for every mutant, in their order. Never returns in a batch child. */
export async function judgeMutants(mutants, judge, { per = MUTANT_BATCH, argv = process.argv } = {}) {
  const mine = argv.find((a) => a.startsWith(BATCH_ARG));
  if (mine) {
    const [a, b] = mine.slice(BATCH_ARG.length).split(':').map(Number);
    for (let i = a; i < Math.min(b, mutants.length); i++) {
      let why = null;
      try { why = await judge(mutants[i]); } catch (e) { why = 'threw ' + (e && e.message); }
      /* fd 1 written synchronously: the exit below cannot cut a line a pipe still holds */
      writeSync(1, ANSWER + JSON.stringify([i, why === undefined ? null : why]) + '\n');
    }
    process.exit(0);
  }
  const whys = new Array(mutants.length);
  for (let a = 0; a < mutants.length; a += per) {
    const b = Math.min(a + per, mutants.length);
    const r = spawnSync(process.execPath, [...process.execArgv, argv[1], ...argv.slice(2), BATCH_ARG + a + ':' + b], { encoding: 'utf8', maxBuffer: 1e8 });
    for (const l of String(r.stdout || '').split('\n')) {
      if (!l.startsWith(ANSWER)) continue;
      try { const [i, why] = JSON.parse(l.slice(ANSWER.length)); if (Number.isInteger(i) && i >= a && i < b) whys[i] = why; } catch { /* a torn line: that mutant stays unanswered */ }
    }
    const said = String(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ').slice(0, 240);
    for (let i = a; i < b; i++) if (whys[i] === undefined) whys[i] = 'HARNESS: mutants ' + a + '..' + (b - 1) + ' ran in a process that exited ' + r.status + ' with no answer for this one: ' + said;
  }
  return whys;
}
