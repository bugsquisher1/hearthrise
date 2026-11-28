#!/usr/bin/env node
// tests/hunt-core/run-all.mjs — THE ONE CI STEP FOR THE HUNT CORE (HUNT_SCREEN_SPEC §1.6).
//
// Runs every tests/hunt-core/*.mjs (this file excepted), each in its own node
// process, and exits non-zero if any is red. Each test file carries its own
// cases AND its mutation proofs (planted into temp copies of src/core +
// src/data, never the tree), so this step is the plain run and the proof at
// once. A core lane adds a test file here; nobody edits smoke.yml for it.
//
//   node tests/hunt-core/run-all.mjs            every file
//   node tests/hunt-core/run-all.mjs leash grid  just those
//
// FOUR AT A TIME, AS A POOL (lane r-green-first, 2026-11-07). This ran the files in fixed
// batches of four and waited for each batch's slowest before starting the next, so the
// step cost the SUM of nine batch maxima: drop-tables (335 s), first-week-bands (287 s) and
// temper-play (110 s, retired 2026-11-26) each held three idle slots. Run 42351653896: 33 files, 1,365 s of
// work, 989 s of step (16.5 min, the long pole of economy-selftests and so of most
// releases). A free slot now takes the next file at once: the same 33 files, the same 4
// processes, the same verdict; ~400 s modelled from that run's own per-file times.
// tests/hunt-core/pool.mjs proves the pool (every file once, never past four, no barrier).
//
// ITS OWN JOB (lane/ci-reds-1127): this step ran 11.0-26.5 min (first-week-bands alone up to 24.4) and took economy-selftests past its 52
// on 45939361593, so it stands alone in economy-selftests-5.
// ci-step: economy-selftests-5 | Hunt core — movement, leash, world step (cases + mutants)
// ci-run: node tests/hunt-core/run-all.mjs
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { isMain } from '../_is-main.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
export const POOL = 4;

/**
 * Run `work(item)` for every item, at most `size` at once; a free slot takes the next item at
 * once. Resolves to the results in the items' order.
 */
export async function pool(items, size, work) {
  const out = new Array(items.length);
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; out[i] = await work(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, lane));
  return out;
}

/* EVERY FILE UNDER A HEAP BUDGET (lane/nightly-red-1128). A file that imports a planted copy of src per mutant keeps every copy (ES
   modules never unload): abilities reached 1,509 MB, conditions 1,254, signature-rules 1,120, danger 1,035 and first-week-bands 954 in
   one process (set/v0.2.144 26962cd28, Node 26, heap at exit), each now judged in batches, against the ~2,048 MB
   heap of GitHub's Node 20 that killed alpha-windows-pure the same way (nightly 46142108500). Each process here (and each mutant batch
   it spawns, fixtures/h1.js judgeMutants) writes its heap at exit (fixtures/heap-report.mjs); a file over HEAP_BUDGET_MB, half that
   heap, is RED while it still runs, never an out-of-memory crash a night later. pool.mjs proves the budget bites. */
export const HEAP_BUDGET_MB = 1024;
const HEAP_REPORT = pathToFileURL(join(DIR, 'fixtures', 'heap-report.mjs')).href;

/** The largest heap any of a file's processes wrote ({ heapMB, rssMB } lines), or null when none did. */
export function heapOf(text) {
  let top = null;
  for (const l of String(text || '').split('\n')) {
    try { const r = JSON.parse(l); if (Number.isFinite(r.heapMB) && (!top || r.heapMB > top.heapMB)) top = r; } catch { /* not a report line */ }
  }
  return top;
}

/** A file's verdict under its heap budget: its exit code, or 1 with the reason when its heap went over. */
export function underBudget(r, budgetMB = HEAP_BUDGET_MB) {
  if (!r.heap || r.heap.heapMB <= budgetMB) return r;
  return { ...r, code: r.code || 1, out: r.out + '\nHEAP  ' + r.f + ' held ' + r.heap.heapMB + ' MB of heap, over its ' + budgetMB
    + ' MB budget (GitHub\'s Node 20 stops near 2,048): judge its mutants in batches (fixtures/h1.js judgeMutants)' };
}

export const runOne = (f, { dir = DIR, budgetMB = HEAP_BUDGET_MB, measure = heapOf, verdict = underBudget } = {}) => new Promise((resolve) => {
  const t0 = Date.now();
  const report = join(mkdtempSync(join(tmpdir(), 'hr-heap-')), 'heap.jsonl');
  const p = spawn(process.execPath, ['--import=' + HEAP_REPORT, join(dir, f)], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HR_HEAP_REPORT: report } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => {
    let heap = null;
    try { heap = measure(readFileSync(report, 'utf8')); } catch { /* no process wrote a line: unmeasured */ }
    rmSync(dirname(report), { recursive: true, force: true });
    resolve(verdict({ f, code, out, ms: Date.now() - t0, heap }, budgetMB));
  });
});

async function main(argv) {
  const only = argv.filter((a) => !a.startsWith('-'));
  const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== 'run-all.mjs')
    .filter((f) => !only.length || only.includes(f.replace(/\.mjs$/, ''))).sort();
  if (!files.length) { console.error('run-all: no hunt-core test files matched'); return 1; }
  const t0 = Date.now();
  const results = await pool(files, POOL, runOne);
  let red = 0;
  for (const r of results) {
    const tag = r.code === 0 ? 'ok ' : 'RED';
    console.log(tag + ' ' + r.f + ' (' + r.ms + ' ms, ' + (r.heap ? r.heap.heapMB + ' MB heap' : 'heap unmeasured') + ')');
    if (r.code !== 0) { red++; console.log(r.out.trim().split('\n').map((l) => '    ' + l).join('\n')); }
  }
  const top = results.filter((r) => r.heap).sort((a, b) => b.heap.heapMB - a.heap.heapMB)[0];
  console.log('hunt-core: ' + (results.length - red) + '/' + results.length + ' green, ' + Math.round((Date.now() - t0) / 1000) + ' s, ' + POOL + ' at a time'
    + (top ? ', top heap ' + top.heap.heapMB + ' MB (' + top.f + ') of a ' + HEAP_BUDGET_MB + ' MB budget' : ''));
  return red ? 1 : 0;
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => process.exit(c));
