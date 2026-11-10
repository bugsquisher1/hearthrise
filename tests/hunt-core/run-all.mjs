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
// temper-play (110 s) each held three idle slots. Run 42351653896: 33 files, 1,365 s of
// work, 989 s of step (16.5 min, the long pole of economy-selftests and so of most
// releases). A free slot now takes the next file at once: the same 33 files, the same 4
// processes, the same verdict; ~400 s modelled from that run's own per-file times.
// tests/hunt-core/pool.mjs proves the pool (every file once, never past four, no barrier).
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const runOne = (f) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [join(DIR, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ f, code, out, ms: Date.now() - t0 }));
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
    console.log(tag + ' ' + r.f + ' (' + r.ms + ' ms)');
    if (r.code !== 0) { red++; console.log(r.out.trim().split('\n').map((l) => '    ' + l).join('\n')); }
  }
  console.log('hunt-core: ' + (results.length - red) + '/' + results.length + ' green, ' + Math.round((Date.now() - t0) / 1000) + ' s, ' + POOL + ' at a time');
  return red ? 1 : 0;
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then((c) => process.exit(c));
