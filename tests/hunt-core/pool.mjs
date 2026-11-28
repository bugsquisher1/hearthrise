// tests/hunt-core/pool.mjs — run-all.mjs's pool: every file once, never past its size, no batch barrier; its heap budget and its mutant batches (HB-1 .. HB-6).
// Run by tests/hunt-core/run-all.mjs (cases and mutants at once, like every file here).
//
// WHY (lane r-green-first, 2026-11-07): the step ran fixed batches of four and waited for each
// batch's slowest file, 989 s of step for 1,365 s of work on run 42351653896. The properties
// below are judged on a logical clock (setImmediate turns), never on wall time, so a slow
// runner cannot make them flaky.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pool, runOne, heapOf, underBudget } from './run-all.mjs';

const turns = (n) => new Promise((r) => { const go = (k) => (k ? setImmediate(() => go(k - 1)) : r()); go(n); });
const range = (n) => Array.from({ length: n }, (_, i) => i);

async function properties(impl) {
  const fails = [];
  /* P1-P3: one result per item, in the items' order; every item once; never past the size, and the size used. */
  let running = 0; let peak = 0; const seen = [];
  const res = await impl(range(9), 4, async (x) => { running++; peak = Math.max(peak, running); seen.push(x); await turns(1 + (x % 3)); running--; return x * 10; });
  if (JSON.stringify(res) !== JSON.stringify(range(9).map((x) => x * 10))) fails.push(`P1 one result per item, in order: ${JSON.stringify(res)}`);
  if ([...seen].sort((a, b) => a - b).join() !== range(9).join()) fails.push(`P2 every item runs once: ${JSON.stringify(seen)}`);
  if (peak > 4) fails.push(`P3 never past the pool size (peak ${peak} of 4)`);
  if (peak < 4) fails.push(`P3 the pool uses its four slots (peak ${peak})`);
  /* P4 no barrier: while item 0 is still running, the three other slots take items 4..7 as they free up. */
  let release; const held = new Promise((r) => { release = r; });
  const started = new Set(); let done = 0; let atRelease = 0;
  const freeItemZero = () => { if (!atRelease) atRelease = started.size; release(); };
  const p = impl(range(8), 4, async (x) => {
    started.add(x);
    if (x === 0) { await held; return; }
    await turns(1);
    if (++done === 3) { await turns(20); freeItemZero(); }
  });
  /* A pool that never frees a slot would wait on item 0 for ever: let it go after a bounded wait. */
  turns(400).then(freeItemZero);
  await p;
  if (atRelease !== 8) fails.push(`P4 a slow file holds one slot, not four: ${atRelease} of 8 started while it ran`);
  /* P5 the edges: nothing to run, and more slots than items. */
  if ((await impl([], 4, async () => 1)).length !== 0) fails.push('P5 an empty list runs nothing');
  if ((await impl([7], 4, async (x) => x)).join() !== '7') fails.push('P5 one item, four slots');
  return fails;
}

const WRONG_POOLS = [
  ['the batch barrier this replaced (wait for the slowest of each four)', async (items, size, work) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map((x, j) => work(x, i + j))));
    return out;
  }],
  ['one item short', async (items, size, work) => {
    const out = new Array(items.length); let next = 0;
    const lane = async () => { while (next < items.length - 1) { const i = next++; out[i] = await work(items[i], i); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, lane));
    return out;
  }],
  ['one lane too many', (items, size, work) => pool(items, size + 1, work)],
  ['results in finishing order', async (items, size, work) => {
    const out = []; let next = 0;
    const lane = async () => { while (next < items.length) { const i = next++; out.push(await work(items[i], i)); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, lane));
    return out;
  }],
  ['one at a time', (items, size, work) => pool(items, 1, work)],
];

/* ── THE HEAP BUDGET (lane/nightly-red-1128): run-all holds every file, and every mutant batch it spawns, to HEAP_BUDGET_MB ──
   Judged on real child processes in a temp dir, at a 48 MB budget: a file holding 96 MB, a file holding nothing, and a file whose
   96 MB is held by its one mutant batch (fixtures/h1.js judgeMutants), whose answers come back in order and whose dead batch is HARNESS. */
const BATCH_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '_mutant-batch.mjs'), 'utf8');
const HOLD = 'globalThis.held = Array.from({ length: 96 }, () => new Array(131072).fill(1.5));';
const PLANTS = {
  'hog.mjs': HOLD + "\nconsole.log('hog: green');\n",
  'idle.mjs': "console.log('idle: green');\n",
  /* four mutants two a batch: the first batch's second holds the heap; the second batch's first throws, its last dies unanswered */
  'batch.mjs': "import { judgeMutants } from './_mutant-batch.mjs';\n"
    + `const whys = await judgeMutants(['A-0', 'A-1', 'A-T', 'A-2'], async (m) => { if (m === 'A-1') { ${HOLD} } if (m === 'A-T') throw new Error('boom'); if (m === 'A-2') process.exit(3); return m + ' caught'; }, { per: 2 });\n`
    + "console.log('WHYS ' + JSON.stringify(whys));\n",
  /* a file whose heap line never comes (its exit listeners are gone) */
  'mute.mjs': "process.removeAllListeners('exit');\nconsole.log('mute: green');\n",
  '_mutant-batch.mjs': BATCH_SRC,
};
const TMP = mkdtempSync(join(tmpdir(), 'hr-pool-heap-'));
for (const [f, text] of Object.entries(PLANTS)) writeFileSync(join(TMP, f), text);

async function heapProperties(impl = {}) {
  const fails = [];
  const run = (f) => runOne(f, { dir: TMP, budgetMB: 48, ...impl });
  const [hog, idle, batch, mute] = await Promise.all(['hog.mjs', 'idle.mjs', 'batch.mjs', 'mute.mjs'].map(run));
  if (!(hog.code === 1 && /HEAP {2}hog\.mjs held \d+ MB of heap, over its 48 MB budget/.test(hog.out))) fails.push(`HB-1 a file holding 96 MB is red under a 48 MB budget: code ${hog.code}, heap ${JSON.stringify(hog.heap)}`);
  if (!(idle.code === 0 && idle.heap && idle.heap.heapMB < 48)) fails.push(`HB-2 a file holding nothing stays green, its heap measured: code ${idle.code}, heap ${JSON.stringify(idle.heap)}`);
  if (!(batch.code === 1 && /HEAP {2}batch\.mjs/.test(batch.out))) fails.push(`HB-3 a heap held by a mutant batch counts for its file: code ${batch.code}, heap ${JSON.stringify(batch.heap)}`);
  const whys = JSON.parse((/WHYS (.*)/.exec(batch.out) || [, 'null'])[1]);
  if (!(whys && whys[0] === 'A-0 caught' && whys[1] === 'A-1 caught' && whys[2] === 'threw boom' && /^HARNESS: mutants 2\.\.3 ran in a process that exited 3/.test(whys[3])))
    fails.push(`HB-4 answers come back in order, a throw is a throw and a dead batch's mutant is HARNESS: ${JSON.stringify(whys)}`);
  if (!(mute.code === 1 && /HEAP {2}mute\.mjs wrote no heap line/.test(mute.out))) fails.push(`HB-6 a file nothing measured is red, never green by silence: code ${mute.code}`);
  if (heapOf('{"heapMB":5}\nnot json\n{"heapMB":70}\n{"heapMB":9}').heapMB !== 70 || heapOf('') !== null) fails.push('HB-5 the largest line is the heap, junk is skipped, none is unmeasured');
  return fails;
}

const WRONG_BUDGETS = [
  ['the budget is never read', { verdict: (r) => r }],
  ['a budget at the runner\'s whole heap', { verdict: (r) => underBudget(r, 2048) }],
  ['only the file\'s own process is measured (its line, the last)', { measure: (t) => heapOf(String(t).trim().split('\n').pop()) }],
  ['nothing is measured', { measure: () => null }],
  ['an unmeasured file is green', { verdict: (r, b) => (r.heap ? underBudget(r, b) : r) }],
];
/* tests/_mutant-batch.mjs itself, planted: each wrong copy must turn HB-4 red */
const WRONG_BATCHES = [
  ['a dead batch reads as a catch', "whys[i] = 'HARNESS: mutants '", "whys[i] = 'X-1 caught: mutants '"],
  ['answers land on the wrong mutant', 'whys[i] = why; }', 'whys[a] = why; }'],
  ['a throw reads as a catch', "why = 'threw ' + (e && e.message);", "why = 'X-1 ' + (e && e.message);"],
  ['a batch skips its last mutant', 'i < Math.min(b, mutants.length); i++', 'i < Math.min(b, mutants.length) - 1; i++'],
];

let bad = 0;
const real = await properties(pool);
for (const f of real) { console.log('FAIL  ' + f); bad++; }
for (const [name, impl] of WRONG_POOLS) {
  const f = await properties(impl);
  if (f.length) console.log(`CAUGHT  ${name}: ${f[0]}`);
  else { console.log(`MISSED  ${name}`); bad++; }
}
const heapReal = await heapProperties();
for (const f of heapReal) { console.log('FAIL  ' + f); bad++; }
for (const [name, impl] of WRONG_BUDGETS) {
  const f = await heapProperties(impl);
  if (f.length) console.log(`CAUGHT  ${name}: ${f[0]}`);
  else { console.log(`MISSED  ${name}`); bad++; }
}
for (const [name, from, to] of WRONG_BATCHES) {
  if (BATCH_SRC.split(from).length !== 2) { console.log(`MISSED  ${name}: its anchor is not in tests/_mutant-batch.mjs once`); bad++; continue; }
  writeFileSync(join(TMP, '_mutant-batch.mjs'), BATCH_SRC.replace(from, () => to));
  const f = (await heapProperties()).filter((x) => x.startsWith('HB-4'));
  if (f.length) console.log(`CAUGHT  ${name}: ${f[0].slice(0, 160)}`);
  else { console.log(`MISSED  ${name}`); bad++; }
}
rmSync(TMP, { recursive: true, force: true });
const n = WRONG_POOLS.length + WRONG_BUDGETS.length + WRONG_BATCHES.length;
console.log(bad ? `hunt-core/pool: ${bad} FAILED` : `hunt-core/pool: green, the pool and the heap budget, ${n}/${n} mutants caught`);
process.exit(bad ? 1 : 0);
