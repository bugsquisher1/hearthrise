#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/foundations/run.mjs — THE FOUNDATIONS LANE'S MEASURING RUN (lane/foundations-block, 2026-11-23).
//
//   node tools/balance-program/redesign/foundations/run.mjs [--seeds 6] [--hours 10] [--workers 16] [--only muster,hasks,wing,controls]
//
// docs/design/redesign/26-architecture-pass.md ranks 2, 3 and 6. The real engine (v1-climb.mjs, the Steady mixed four: hammer, bow, mage,
// healer) on Muster Barrows, Hask's Ford and the Catacomb's Bone Wing, a fresh (LOW kits at the entry Level), a reference (MID at the
// ground's refLevel) and a top (BIS at the top Level) company, each on Careful, Steady and Bold; the reference also with every seat's
// main skill 10 under its career line (the skill part of the power step). Controls, paired on the same dice: the reference with the skill
// weight off (candidate skill-weight-off) and with loot off depth (candidate loot-depth-off). One JSON and one text a cell set, here.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SEEDS = arg('seeds', '6'), HOURS = arg('hours', '10'), WORKERS = arg('workers', '16');
const ONLY = arg('only', 'muster,hasks,wing,controls').split(',');
const V1 = join(ROOT, 'tools', 'balance-program', 'redesign', 'v1-climb.mjs');
const ALL = 'base:careful,base:steady,base:bold';
const GROUNDS = {
  muster: { id: 'muster_barrows', low: 55, mid: 60, top: 75 },
  hasks: { id: 'hasks_ford', low: 45, mid: 52, top: 60 },
  wing: { id: 'catacomb_bone_wing', low: 165, mid: 175, top: 185 },
};
const runs = [];
for (const [k, g] of Object.entries(GROUNDS)) {
  if (!ONLY.includes(k)) continue;
  runs.push([k + '-fresh', ['--ground', g.id, '--level', String(g.low), '--gear', 'low', '--only', ALL]]);
  runs.push([k + '-ref', ['--ground', g.id, '--level', String(g.mid), '--gear', 'mid', '--only', ALL + ',skill:steady']]);
  runs.push([k + '-top', ['--ground', g.id, '--level', String(g.top), '--gear', 'bis', '--only', ALL]]);
}
if (ONLY.includes('controls')) {
  runs.push(['muster-ref-skill-off', ['--ground', 'muster_barrows', '--level', '60', '--gear', 'mid', '--only', 'base:steady,skill:steady', '--candidate', 'skill-weight-off']]);
  runs.push(['muster-ref-loot-off', ['--ground', 'muster_barrows', '--level', '60', '--gear', 'mid', '--only', ALL, '--candidate', 'loot-depth-off']]);
}
for (const [name, args] of runs) {
  const json = join(HERE, name + '.json');
  process.stderr.write('foundations: ' + name + '\n');
  const txt = execFileSync(process.execPath, [V1, ...args, '--seeds', SEEDS, '--hours', HOURS, '--settle', '4', '--workers', WORKERS, '--json', json],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  writeFileSync(join(HERE, name + '.txt'), txt);
}
process.stderr.write('foundations: done\n');
