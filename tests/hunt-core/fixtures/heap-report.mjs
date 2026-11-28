// tests/hunt-core/fixtures/heap-report.mjs — preloaded (--import) into every hunt-core process by run-all.mjs: at exit, one line of
// { heapMB, rssMB } appended to $HR_HEAP_REPORT (its JS heap then, and the OS's peak resident size), so run-all can hold each file to
// its heap budget. A mutant batch child (fixtures/h1.js judgeMutants) inherits the preload and the path and reports too. No path, no line.
import { appendFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';

const to = process.env.HR_HEAP_REPORT;
if (to) {
  process.on('exit', () => {
    const line = JSON.stringify({ heapMB: Math.round(getHeapStatistics().used_heap_size / 1048576), rssMB: Math.round(process.resourceUsage().maxRSS / 1024),
      batch: process.argv.find((a) => a.startsWith('--mutant-batch=')) || null });
    try { appendFileSync(to, line + '\n'); } catch { /* the report is advisory to its own process; run-all reads a missing line as unmeasured */ }
  });
}
