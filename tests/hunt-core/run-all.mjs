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
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const DIR = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== 'run-all.mjs')
  .filter((f) => !only.length || only.includes(f.replace(/\.mjs$/, ''))).sort();
if (!files.length) { console.error('run-all: no hunt-core test files matched'); process.exit(1); }

const runOne = (f) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [join(DIR, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ f, code, out, ms: Date.now() - t0 }));
});

const results = [];
const POOL = 4;
for (let i = 0; i < files.length; i += POOL) results.push(...await Promise.all(files.slice(i, i + POOL).map(runOne)));
let red = 0;
for (const r of results) {
  const tag = r.code === 0 ? 'ok ' : 'RED';
  console.log(tag + ' ' + r.f + ' (' + r.ms + ' ms)');
  if (r.code !== 0) { red++; console.log(r.out.trim().split('\n').map((l) => '    ' + l).join('\n')); }
}
console.log('hunt-core: ' + (results.length - red) + '/' + results.length + ' green');
process.exit(red ? 1 : 0);
