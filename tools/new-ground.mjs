#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/new-ground.mjs — PUT A GROUND ON THE DANGER SCALE IN ONE COMMAND (lane/content-pipeline, 2026-11-22).
//
//   node tools/new-ground.mjs <ground> --entry L --top L [--mid L] [--seeds 4] [--hours 12] [--workers 6] [--write]
//   node tools/new-ground.mjs <ground> --ref a.json --top-report b.json [--floor c.json] [--write]     (read reports already run)
//
// docs/design/redesign/24-content-pipeline.md section 2. R10 cut three bands by hand: three v1-climb runs a ground (LOW kits at the
// entry Level, BIS at the top Level, MID at the middle), then the rounding and the cap read off by eye into src/data/danger.js. This
// runs the same three cells (tools/balance-program/redesign/v1-climb.mjs, the Steady mixed four, held from hour 4), cuts the band by
// R10's rule (tools/lib/danger-band.mjs), and prints the verdict:
//   OPEN     no Steady death in any cell, the band is ordered, the LOW four opens at depth 1 to 3
//   REVIEW   ordered and deathless, but something reads off (a note says what)
//   STAGED   a Steady death (12-targets C-3): the band is cut, the ground waits for its monsters' fit
// --write  rewrites the band on the ground's EXISTING DANGER_GROUNDS row and pins it, with the print of the rows it was measured on,
//          in tests/danger-band-pins.json (tests/content-coherence.mjs CC-2 reds a band whose ground changed since). A ground with no
//          row yet gets the row printed to paste: its gear base (gearLevel), drop home (ladderTier or named) and Trait pool are the
//          designer's, never a tool's. Paste it and run again with --write.
// Reports land in tools/balance-program/redesign/grounds/<ground>-{floor,top,ref}.{json,txt}.
//
// Exit 0 cut (any verdict) · 1 --write refused (no row) · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bandFromReports, packPrint, rewriteRow } from './lib/danger-band.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const G = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const die = (m, code = 2) => { console.error('new-ground: ' + m); process.exit(code); };
if (!G) die('usage: node tools/new-ground.mjs <ground> --entry L --top L [--mid L] [--write]');

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { DANGER_GROUNDS, PAY, DEPTHS } = await imp('src/data/danger.js');
const { HUNT_GROUNDS, monstersOn } = await imp('src/data/hunt-grounds.js');
const { MONSTERS } = await imp('src/data/monsters.js');
const ground = HUNT_GROUNDS[G];
if (!ground) die(G + ' is not a ground (src/data/hunt-grounds.js HUNT_GROUNDS): author its pack first (node tools/pack.mjs new ...)');

const OUT = join(ROOT, 'tools', 'balance-program', 'redesign', 'grounds');
const readJson = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
let reports, levels;
if (arg('ref')) {
  if (!arg('top-report')) die('--ref needs --top-report');
  reports = { ref: readJson(arg('ref')), top: readJson(arg('top-report')), floor: arg('floor') ? readJson(arg('floor')) : null };
  levels = { entry: reports.floor ? reports.floor.levels[0] : null, top: reports.top.levels[0], mid: reports.ref.levels[0] };
} else {
  const entry = Number(arg('entry')), top = Number(arg('top'));
  if (!(entry > 0 && top > entry)) die('--entry and --top are the ground\'s Level band (entry < top)');
  const mid = Number(arg('mid', Math.round((entry + top) / 2)));
  levels = { entry, top, mid };
  mkdirSync(OUT, { recursive: true });
  const V1 = join(ROOT, 'tools', 'balance-program', 'redesign', 'v1-climb.mjs');
  const run = (cell, L, gear) => {
    const json = join(OUT, G + '-' + cell + '.json');
    process.stderr.write('new-ground: ' + G + ' ' + cell + ' (' + gear + ' kits, Level ' + L + ')\n');
    const txt = execFileSync(process.execPath, [V1, '--ground', G, '--level', String(L), '--gear', gear, '--seeds', arg('seeds', '4'), '--hours', arg('hours', '12'),
      '--settle', '4', '--workers', arg('workers', '6'), '--only', 'base:steady', '--json', json], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
    writeFileSync(join(OUT, G + '-' + cell + '.txt'), txt);
    return readJson(json);
  };
  reports = { floor: run('floor', entry, 'low'), top: run('top', top, 'bis'), ref: run('ref', mid, 'mid') };
}

const cut = bandFromReports(reports, PAY, DEPTHS);
const { _lowDepth, ...band } = cut.band;
const print = packPrint(ground, MONSTERS, monstersOn);
const row = DANGER_GROUNDS[G];
console.log('\n' + G + ' on the Danger scale (the Steady mixed four, v1-climb.mjs): ' + cut.verdict);
console.log('  MID  Level ' + cut.cells.ref.L + ': held ' + cut.cells.ref.held + ', ' + cut.cells.ref.killsPerH + ' kills an hour');
console.log('  BIS  Level ' + cut.cells.top.L + ': held ' + cut.cells.top.held);
if (cut.cells.floor) console.log('  LOW  Level ' + cut.cells.floor.L + ': held ' + cut.cells.floor.held + ' (depth ' + _lowDepth + ' of ' + DEPTHS + ')');
console.log('  band refStep ' + band.refStep + '  floorStep ' + band.floorStep + '  topStep ' + band.topStep + (band.refKillsHead ? '  refKillsHead ' + band.refKillsHead : '  refKillsHead (PAY.refKillsHead ' + PAY.refKillsHead + ')'));
if (row) console.log('  today  refStep ' + row.refStep + '  floorStep ' + row.floorStep + '  topStep ' + row.topStep + '  refKillsHead ' + (row.refKillsHead || '-'));
for (const n of cut.notes) console.log('  note: ' + n);
for (const n of cut.info) console.log('  info: ' + n);
console.log('  print of the rows measured: ' + print);

if (!argv.includes('--write')) { console.log('\n(dry run: --write sets the band on the row and pins it in tests/danger-band-pins.json)'); process.exit(0); }
if (!row) {
  console.log('\nNo DANGER_GROUNDS row for ' + G + ' yet. Paste this into src/data/danger.js (the gear base, drop home and Trait pool are yours),');
  console.log('then run again with --write so the pin records the print:\n');
  console.log('  ' + G + ': Object.freeze({ refStep: ' + band.refStep + ', floorStep: ' + band.floorStep + ', topStep: ' + band.topStep + ', '
    + (band.refKillsHead ? 'refKillsHead: ' + band.refKillsHead + ', ' : '') + 'gearLevel: tierLevel(<tier>), ladderTier: <tier> /* or named */, traits: traitPool(\'' + G + '\') }),');
  process.exit(1);
}
const DJS = join(ROOT, 'src', 'data', 'danger.js');
const next = rewriteRow(readFileSync(DJS, 'utf8'), G, band);
if (next === null) die('the ' + G + ' row in src/data/danger.js is not on one line in the refStep, floorStep, topStep order: set it by hand, then pin', 1);
writeFileSync(DJS, next);
const PINS = join(ROOT, 'tests', 'danger-band-pins.json');
const pins = existsSync(PINS) ? readJson(PINS) : { _why: '', grounds: {} };
pins.grounds[G] = { ...band, print, verdict: cut.verdict, levels, measured: new Date().toISOString().slice(0, 10), evidence: arg('ref') ? [arg('ref'), arg('top-report'), arg('floor')].filter(Boolean) : ['tools/balance-program/redesign/grounds/' + G + '-{floor,top,ref}.json'] };
writeFileSync(PINS, JSON.stringify(pins, null, 1) + '\n');
console.log('\nwrote the band to src/data/danger.js and the pin to tests/danger-band-pins.json. Review the diff; the server catalogue: node tools/gen-danger.mjs');
