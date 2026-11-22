#!/usr/bin/env node
/**
 * Coordinator one-screen tool (CLAUDE.md §9, local only, no secrets): re-seed tests/live-hash-drift.baseline.json after a
 * staged-SQL merge WITHOUT losing the STAGED whys. `live-hash-drift --write --no-live` resets every divergent entry's `why`
 * to a "REVIEW <date>" placeholder; this keeps a backup, writes, restores each old why whose sig and replay md5 are
 * unchanged, writes a STAGED why from `touched_by` for a new divergence, then runs the guard and apply-order-honesty.
 *
 *   node tools/live-hash-reseed.local.mjs [--release v0.2.144]
 *
 * Exit 0 only when the guard and apply-order-honesty both exit 0. Never touches production (--no-live only).
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'tests', 'live-hash-drift.baseline.json');
const at = process.argv.indexOf('--release');
const release = at > 0 ? process.argv[at + 1] : 'v0.2.144';
const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

const backup = join(tmpdir(), `live-hash-backup-${Date.now()}.json`);
copyFileSync(BASE, backup);
const w = run(['tests/live-hash-drift.mjs', '--write', '--no-live']);
if (w.status !== 0) { console.error(w.stdout + w.stderr); console.error(`--write exited ${w.status}; backup at ${backup}`); process.exit(1); }

const now = JSON.parse(readFileSync(BASE, 'utf8'));
const old = JSON.parse(readFileSync(backup, 'utf8'));
const bySig = new Map(old.functions.map((e) => [e.sig, e]));
let restored = 0, written = 0; const left = [];
for (const e of now.functions) {
  if (!(typeof e.why === 'string' && /^REVIEW\b/.test(e.why))) continue;
  const o = bySig.get(e.sig);
  if (o && o.why && !/^REVIEW\b/.test(o.why) && o.replay && e.replay && o.replay.md5 === e.replay.md5) { e.why = o.why; restored++; continue; }
  const files = (e.touched_by || []).filter((f) => /^\d{4}-/.test(f) && !/^20\d\d-/.test(f));
  if (files.length) {
    e.why = `STAGED for the ${release} release by ${files.join(', ')} (production frozen on the live version; staged server changes apply together at the release). Live is the current body${e.live ? '' : ' (absent on production)'}, replay is the staged body from ${files[files.length - 1]}.`;
    written++; continue;
  }
  left.push(e.sig);
}
writeFileSync(BASE, JSON.stringify(now, null, 2) + '\n');
console.log(`restored ${restored}, written ${written}${left.length ? `, LEFT as REVIEW (write a why by hand): ${left.join('; ')}` : ''}`);

const g = run(['tests/live-hash-drift.mjs', '--no-live']);
const a = run(['tests/apply-order-honesty.mjs']);
console.log(`live-hash-drift --no-live: ${g.status}   apply-order-honesty: ${a.status}`);
if (g.status !== 0) console.error(g.stdout.split('\n').filter((l) => /RED|✗/.test(l)).slice(0, 10).join('\n'));
if (a.status !== 0) console.error(a.stdout.split('\n').slice(-6).join('\n'));
process.exit(g.status === 0 && a.status === 0 && !left.length ? 0 : 1);
