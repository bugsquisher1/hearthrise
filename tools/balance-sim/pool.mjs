// tools/balance-sim/pool.mjs — run jobs on at most N worker processes (capped at 4: other lanes share this PC),
// holding new work while the machine is busier than `cpuMax` percent, appending each finished job to a JSONL file
// so a stopped run resumes where it left off.
import { fork } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

export const MAX_WORKERS = 4;
const HERE = dirname(fileURLToPath(import.meta.url));

/* Whole-machine CPU busy percent over `ms` (os.cpus() deltas: works on Windows, where loadavg is 0). */
export function cpuBusy(ms = 1000) {
  const snap = () => cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.all += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, all: 0 });
  const a = snap();
  return new Promise((res) => setTimeout(() => { const b = snap(); res(Math.round(100 * (1 - (b.idle - a.idle) / Math.max(1, b.all - a.all)))); }, ms));
}

/** The ids already finished in `file` (a resumed run skips them). */
export function doneIds(file) {
  if (!existsSync(file)) return new Set();
  const out = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) { if (!line.trim()) continue; try { out.add(JSON.parse(line).id); } catch { /* a torn last line */ } }
  return out;
}

/**
 * Run `jobs` ({ id, ... }) on `workers` processes; each result is appended to `outFile` as one JSON line.
 * opts: { root, workers, cpuMax (default 85), log }. Resolves { done, failed, ms }.
 */
export async function runPool(jobs, outFile, opts) {
  const n = Math.max(1, Math.min(MAX_WORKERS, opts.workers || MAX_WORKERS));
  const cpuMax = opts.cpuMax || 85;
  const log = opts.log || ((s) => process.stderr.write(s + '\n'));
  mkdirSync(dirname(outFile), { recursive: true });
  const errFile = outFile.replace(/\.jsonl$/, '') + '.errors.jsonl';
  const skip = doneIds(outFile);
  const queue = jobs.filter((j) => !skip.has(j.id));
  log('balance-sim: ' + queue.length + ' jobs to run (' + skip.size + ' already done), ' + n + ' workers, hold above ' + cpuMax + '% CPU');
  const t0 = Date.now();
  let done = 0, failed = 0, running = 0;
  const total = queue.length;
  return await new Promise((resolve) => {
    if (!total) { resolve({ done: 0, failed: 0, ms: 0 }); return; }
    const workers = [];
    const finish = () => { if (running === 0 && !queue.length) { for (const w of workers) w.kill(); resolve({ done, failed, ms: Date.now() - t0 }); } };
    const feed = async (w) => {
      if (!queue.length) { finish(); return; }
      /* back off while the machine is busy (this pool's own workers included) */
      for (let tries = 0; tries < 40; tries++) { const busy = await cpuBusy(800); if (busy <= cpuMax) break; if (tries % 5 === 0) log('  cpu ' + busy + '%: holding'); await new Promise((r) => setTimeout(r, 4000)); }
      const job = queue.shift();
      if (!job) { finish(); return; }
      running++;
      w.job = job;
      w.send({ type: 'job', job });
    };
    for (let i = 0; i < n; i++) {
      const w = fork(join(HERE, 'worker.mjs'), [opts.root], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      workers.push(w);
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(w); return; }
        running--;
        w.job = null;
        if (m.type === 'done') { done++; appendFileSync(outFile, JSON.stringify({ id: m.id, ms: m.ms, ...m.result }) + '\n'); }
        else { failed++; appendFileSync(errFile, JSON.stringify(m) + '\n'); log('  FAILED ' + m.id + ': ' + String(m.error).split('\n')[0]); }
        const el = (Date.now() - t0) / 1000, k = done + failed;
        log('  [' + k + '/' + total + '] ' + m.id + ' ' + Math.round(m.ms / 1000) + ' s · elapsed ' + Math.round(el) + ' s · eta ' + Math.round((el / k) * (total - k)) + ' s');
        feed(w);
      });
      w.on('exit', (code) => { if (w.job && code && running > 0) { running--; failed++; log('  worker died on ' + w.job.id); finish(); } });
    }
  });
}
