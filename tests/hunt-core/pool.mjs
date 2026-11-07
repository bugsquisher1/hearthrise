// tests/hunt-core/pool.mjs — run-all.mjs's pool: every file once, never past its size, no batch barrier.
// Run by tests/hunt-core/run-all.mjs (cases and mutants at once, like every file here).
//
// WHY (lane r-green-first, 2026-11-07): the step ran fixed batches of four and waited for each
// batch's slowest file, 989 s of step for 1,365 s of work on run 42351653896. The properties
// below are judged on a logical clock (setImmediate turns), never on wall time, so a slow
// runner cannot make them flaky.
import { pool } from './run-all.mjs';

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

let bad = 0;
const real = await properties(pool);
for (const f of real) { console.log('FAIL  ' + f); bad++; }
for (const [name, impl] of WRONG_POOLS) {
  const f = await properties(impl);
  if (f.length) console.log(`CAUGHT  ${name}: ${f[0]}`);
  else { console.log(`MISSED  ${name}`); bad++; }
}
console.log(bad ? `hunt-core/pool: ${bad} FAILED` : `hunt-core/pool: green, ${WRONG_POOLS.length}/${WRONG_POOLS.length} mutants caught`);
process.exit(bad ? 1 : 0);
