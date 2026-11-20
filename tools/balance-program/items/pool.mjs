#!/usr/bin/env node
// tools/balance-program/items/pool.mjs: THE ADD POOL, MEASURED WHOLE (balance program dive 23, question 1).
// A measuring tool: it writes nothing under src/ and grades nothing. It runs `measure.mjs what` with ONE patch file a point, on the
// lone seat and the four, so the pool's levers are read together (01-model.md section 2: damage-side levers never one at a time).
//
//   node tools/balance-program/items/pool.mjs [--at glade,slake,pyre,hold] [--seats lone,four] [--hours 2] [--seeds 2]
//
// The rows: the played kit with its jewelry off, Tempering 5 of 5 on both tracks at the point's gear tier, +10 main skill and
// Defense (the yard, the dummy and +skill pieces), then all of them worn. The whole pool is the last row over the first.
// Linings, worn in and perks past tier 3 are not built, so no engine plays them: 23-items.md sizes those from their designs.
// Exit 0 when it ran, 2 on a bad argument.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
/* the gear tier a hero wears at each reference point (01-model.md section 4) */
const TIER = { thicket: 1, glade: 3, ford: 4, slake: 5, pyre: 6, hold: 7, rest: 7, catacombs: 7 };
const points = arg('at', 'glade,slake,pyre,hold').split(',');
const seats = arg('seats', 'lone,four').split(',');
for (const p of points) if (!TIER[p]) { console.error('unknown point ' + p); process.exit(2); }

const dir = join(tmpdir(), 'hr-items-pool');
mkdirSync(dir, { recursive: true });
for (const p of points) {
  const t = TIER[p];
  const temper = t >= 2 ? { ['temper:blows:' + t]: 5, ['temper:armor:' + t]: 5 } : {};
  const steps = [
    { label: 'jewelry off', patch: { gear: { accessories: false } } },
    { label: 'Tempering 5 of 5 both tracks (tier ' + t + ')', patch: { temper } },
    { label: '+10 main skill and Defense', patch: { skillBump: 10 } },
    { label: 'jewelry + Tempering + 10 skills', patch: { temper, skillBump: 10 } },
  ];
  const file = join(dir, p + '.json');
  writeFileSync(file, JSON.stringify(steps));
  for (const seat of seats) {
    console.log('\n=== ' + p + ' / ' + seat);
    const r = spawnSync(process.execPath, [join(ROOT, 'tools/balance-program/measure.mjs'), 'what', '--at', p, '--seat', seat,
      '--patch-file', file, '--hours', arg('hours', '2'), '--seeds', arg('seeds', '2')], { cwd: ROOT, encoding: 'utf8' });
    process.stdout.write(r.stdout || '');
    if (r.status) process.stdout.write('EXIT ' + r.status + '\n' + (r.stderr || '').slice(0, 800) + '\n');
  }
}
