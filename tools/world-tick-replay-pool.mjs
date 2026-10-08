// ============================================================================
// tools/world-tick-replay-pool.mjs — RUN DETERMINISTIC REPLAY TASKS ACROSS CORES.
//
// The seeded replays (services/world-tick/parity-replay.js) are pure functions
// of their arguments: replica r of a probe returns the same fields wherever it
// runs. The CI arms that read them (tools/world-tick-parity.mjs --selftest at
// 120 replicas, tests/world-tick-probe-bar.mjs, tests/world-tick-vigour-line.mjs
// at 300 seeds) were ~13 + ~5 min of ONE core on a four-core runner
// (db-replay-5 cancelled at its 20-min timeout, run 37725703255; the
// replay arms were ~42 s on main before 2026-10-07). This spreads the same
// tasks over worker threads and hands the
// results back IN TASK ORDER, so every statistic computed from them is the
// one the serial loop computes — the replica count, the fixtures and the bars
// are untouched.
//
//   poolMap(moduleUrl, fnName, argsList) → Promise<results[]>
//     each task runs `await (await import(moduleUrl))[fnName](...args)` in a
//     worker; args and results cross by structured clone (plain data only).
//     A worker takes one task at a time, so an async task never interleaves.
//
// Workers are kept per (module, function) for the life of the process and
// unref'd while idle, so a caller that maps many batches pays the module
// import once per thread and still exits when its work is done.
// HR_REPLAY_THREADS=1 runs inline on this thread (the serial reference);
// unset, min(tasks, availableParallelism()). A worker error rejects the whole
// map — a partial sample set is never returned.
// ============================================================================

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export function poolThreads(n) {
  const env = Math.floor(Number(process.env.HR_REPLAY_THREADS));
  const want = env >= 1 ? env : availableParallelism();
  return Math.max(1, Math.min(n, want));
}

const POOLS = new Map();   // `${moduleUrl}#${fnName}` → Worker[]

function workersFor(moduleUrl, fnName, k) {
  const key = `${moduleUrl}#${fnName}`;
  const list = POOLS.get(key) || [];
  while (list.length < k) {
    const w = new Worker(new URL(import.meta.url), { workerData: { moduleUrl, fnName } });
    /* A dead worker leaves the pool (a map running on it rejects through its
       own listeners); an idle one that dies is replaced by the next map. */
    w.on('error', () => {});
    w.on('exit', () => { const at = list.indexOf(w); if (at >= 0) list.splice(at, 1); });
    w.unref();
    list.push(w);
  }
  POOLS.set(key, list);
  return list.slice(0, k);
}

export async function poolMap(moduleUrl, fnName, argsList) {
  const n = argsList.length;
  if (!n) return [];
  const threads = poolThreads(n);
  if (threads <= 1) {
    const fn = (await import(moduleUrl))[fnName];
    if (typeof fn !== 'function') throw new Error(`poolMap: ${fnName} is not exported by ${moduleUrl}`);
    const serial = [];
    for (const a of argsList) serial.push(await fn(...a));
    return serial;
  }
  const out = new Array(n);
  const workers = workersFor(moduleUrl, fnName, threads);
  let next = 0;
  let done = 0;
  const listeners = [];
  try {
    await new Promise((resolve, reject) => {
      const feed = (w) => {
        if (next >= n) return;
        const i = next++;
        w.postMessage({ i, args: argsList[i] });
      };
      for (const w of workers) {
        const onMsg = (m) => {
          if (m.error) { reject(new Error(`poolMap task ${m.i}: ${m.error}`)); return; }
          out[m.i] = m.out;
          if (++done === n) resolve(); else feed(w);
        };
        const onExit = (code) => reject(new Error(`poolMap: a worker exited (${code}) with ${n - done} task(s) open`));
        w.on('message', onMsg);
        w.on('error', reject);
        w.on('exit', onExit);
        listeners.push([w, onMsg, reject, onExit]);
        w.ref();
        feed(w);
      }
    });
  } finally {
    for (const [w, onMsg, onErr, onExit] of listeners) {
      w.off('message', onMsg);
      w.off('error', onErr);
      w.off('exit', onExit);
      w.unref();
    }
  }
  return out;
}

if (!isMainThread && parentPort && workerData && workerData.moduleUrl) {
  const fn = (await import(workerData.moduleUrl))[workerData.fnName];
  parentPort.on('message', async ({ i, args }) => {
    try {
      if (typeof fn !== 'function') throw new Error(`${workerData.fnName} is not exported by ${workerData.moduleUrl}`);
      parentPort.postMessage({ i, out: await fn(...args) });
    } catch (e) {
      parentPort.postMessage({ i, error: String((e && e.stack) || e) });
    }
  });
}
