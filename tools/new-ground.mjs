#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/new-ground.mjs — PUT A GROUND ON THE DANGER SCALE IN ONE COMMAND (lane/content-pipeline, 2026-11-22).
//
//   node tools/new-ground.mjs <ground> --entry L --top L [--mid L] [--seeds 4] [--hours 12] [--settle 4] [--hold-level] [--workers 6] [--write]
//   node tools/new-ground.mjs <ground> --ref a.json --top-report b.json --floor c.json [--write]     (read reports already run)
//
// THE BAND IS A FORMULA, THIS IS ITS MEASURING CHECK (lane/foundations-block, 2026-11-23; src/data/bands.js): a ground's band in absolute
// steps is a formula of its entry Level, top Level and tier (src/core/bands.js bandAbs), so it exists before any run. What this measures is
// the bridge: the own step where the formula's three companies hold (until monsters and blows are on the step, a ground's own step is not
// an absolute one), and it checks the cut: no Steady death, the bands ordered, 27 K-6's handover from the ground a tier under, the MID cell
// at the row's refLevel, and the reference company's sustain shares inside src/data/sustain.js's bands.
// docs/design/redesign/24-content-pipeline.md section 2. R10 cut three bands by hand: three v1-climb runs a ground (LOW kits at the
// entry Level, BIS at the top Level, MID at the middle), then the rounding and the cap read off by eye into src/data/danger.js. This
// runs the same three cells (tools/balance-program/redesign/v1-climb.mjs, the Steady mixed four, held from hour 4), cuts the band by
// the band rule (src/data/danger.js BAND_RULE: the floor where the fresh LOW four holds, lane/band-floor; tools/lib/danger-band.mjs),
// and prints the verdict:
//   OPEN     no Steady death in any cell and the band is ordered (the LOW four holds depth 1 by the rule)
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
import { bandFromReports, packPrint, rewriteRow, anchorOf } from './lib/danger-band.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const G = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const die = (m, code = 2) => { console.error('new-ground: ' + m); process.exit(code); };
if (!G) die('usage: node tools/new-ground.mjs <ground> --entry L --top L [--mid L] [--write]');

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { DANGER_GROUNDS, PAY, DEPTHS, BAND_RULE } = await imp('src/data/danger.js');
/* THE ABSOLUTE BAND (lane/foundations-block): the band is a formula of the row (src/core/bands.js bandAbs); the cells measure its bridge */
const { bandAbs, absPmOf, depthAt } = await imp('src/core/bands.js');
const { GEAR_STEPS } = await imp('src/data/gear-steps.js');
const { SUSTAIN } = await imp('src/data/sustain.js');
const { HUNT_GROUNDS, monstersOn } = await imp('src/data/hunt-grounds.js');
const { MONSTERS } = await imp('src/data/monsters.js');
const ground = HUNT_GROUNDS[G];
if (!ground) die(G + ' is not a ground (src/data/hunt-grounds.js HUNT_GROUNDS): author its pack first (node tools/pack.mjs new ...)');

const OUT = join(ROOT, 'tools', 'balance-program', 'redesign', 'grounds');
const readJson = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
let reports, levels;
if (arg('ref')) {
  if (!arg('top-report') || !arg('floor')) die('--ref needs --top-report and --floor (the floor is where the fresh LOW four holds, danger.js BAND_RULE)');
  reports = { ref: readJson(arg('ref')), top: readJson(arg('top-report')), floor: readJson(arg('floor')) };
  levels = { entry: reports.floor.levels[0], top: reports.top.levels[0], mid: reports.ref.levels[0] };
} else {
  const entry = Number(arg('entry')), top = Number(arg('top'));
  if (!(entry > 0 && top > entry)) die('--entry and --top are the ground\'s Level band (entry < top)');
  /* the MID cell is the reference company: at the row's refLevel (27 K-5), else the band's middle for a ground with no row yet */
  const mid = Number(arg('mid', DANGER_GROUNDS[G] && Number.isInteger(DANGER_GROUNDS[G].refLevel) ? DANGER_GROUNDS[G].refLevel : Math.round((entry + top) / 2)));
  levels = { entry, top, mid };
  mkdirSync(OUT, { recursive: true });
  const V1 = join(ROOT, 'tools', 'balance-program', 'redesign', 'v1-climb.mjs');
  const run = (cell, L, gear) => {
    const json = join(OUT, G + '-' + cell + '.json');
    process.stderr.write('new-ground: ' + G + ' ' + cell + ' (' + gear + ' kits, Level ' + L + ')\n');
    /* --hold-level (lane/scale-early-grounds): each company stays at its Level all day (v1-climb.mjs --hold-level), for a ground whose
       Levels come faster than a measuring day (under about Level 20) or whose hunt ends at a Level (the Mill Cellar's at 5) */
    const txt = execFileSync(process.execPath, [V1, '--ground', G, '--level', String(L), '--gear', gear, '--seeds', arg('seeds', '4'), '--hours', arg('hours', '12'),
      '--settle', arg('settle', '4'), '--workers', arg('workers', '6'), '--only', 'base:steady', '--json', json, ...(argv.includes('--hold-level') ? ['--hold-level'] : [])],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
    writeFileSync(join(OUT, G + '-' + cell + '.txt'), txt);
    return readJson(json);
  };
  reports = { floor: run('floor', entry, 'low'), top: run('top', top, 'bis'), ref: run('ref', mid, 'mid') };
}

/* the scale ground one tier under this one (27 K-6: its top must reach this floor), by the rows' gear base */
const prev = DANGER_GROUNDS[G] ? Object.keys(DANGER_GROUNDS).find((k) => DANGER_GROUNDS[k].gearLevel === DANGER_GROUNDS[G].gearLevel - GEAR_STEPS.tierSteps) : null;
const abs = DANGER_GROUNDS[G] ? { band: bandAbs(G), prevTopPm: prev && bandAbs(prev) ? bandAbs(prev).topPm : null, refLevel: DANGER_GROUNDS[G].refLevel, sustain: SUSTAIN } : null;
/* a ground on the monster formula keeps its refStep (the monsters' and the pay's anchor, chosen by hand) and pins the MID four's hold as
   refHeld, the depth reading's middle point (tools/lib/danger-band.mjs, lane/depth-reading-fix) */
const anchorStep = anchorOf(DANGER_GROUNDS[G]);
/* the ground's coin level (tools/lib/danger-band.mjs coinLevelFrom): the reference hour against the wage at the row's refLevel, the cells
   played at the row's own level (else PAY.coinPm) */
const { wage, levelStep } = await imp('src/core/wage.js');
const coin = DANGER_GROUNDS[G] && Number.isInteger(DANGER_GROUNDS[G].refLevel)
  ? { wage: wage(levelStep(DANGER_GROUNDS[G].refLevel)), played: Number.isInteger(DANGER_GROUNDS[G].coinPm) ? DANGER_GROUNDS[G].coinPm : PAY.coinPm, payCoinPm: PAY.coinPm } : null;
const cut = bandFromReports(reports, PAY, DEPTHS, BAND_RULE, abs, { anchorStep, coin });
const { _lowDepth, ...band } = cut.band;
const print = packPrint(ground, MONSTERS, monstersOn, DANGER_GROUNDS[G] && DANGER_GROUNDS[G].monsters, DANGER_GROUNDS[G] && DANGER_GROUNDS[G].formulaStep);
const row = DANGER_GROUNDS[G];
console.log('\n' + G + ' on the Danger scale (the Steady mixed four, v1-climb.mjs): ' + cut.verdict);
console.log('  MID  Level ' + cut.cells.ref.L + ': held ' + cut.cells.ref.held + ', ' + cut.cells.ref.killsPerH + ' kills an hour');
console.log('  BIS  Level ' + cut.cells.top.L + ': held ' + cut.cells.top.held);
console.log('  LOW  Level ' + cut.cells.floor.L + ': held ' + cut.cells.floor.held + ', lowest seed ' + cut.cells.floor.lowest + ' (depth ' + _lowDepth + ' of ' + DEPTHS + ')');
console.log('  band refStep ' + band.refStep + (anchorStep === null ? '' : ' (the formula\'s anchor, kept)') + '  floorStep ' + band.floorStep + '  topStep ' + band.topStep + (band.refKillsHead ? '  refKillsHead ' + band.refKillsHead : '  refKillsHead (PAY.refKillsHead ' + PAY.refKillsHead + ')')
  + (band.refHeld !== undefined ? '  refHeld ' + band.refHeld + ' (the reference four\'s hold, the depth reading\'s middle)' : '')
  + (band.coinPm !== undefined ? '  coinPm ' + band.coinPm + ' (the ground\'s coin level)' : ''));
if (row) console.log('  today  refStep ' + row.refStep + '  floorStep ' + row.floorStep + '  topStep ' + row.topStep + '  refKillsHead ' + (row.refKillsHead || '-') + '  refHeld ' + (row.refHeld === undefined ? '-' : row.refHeld));
for (const n of cut.notes) console.log('  note: ' + n);
for (const n of cut.info) console.log('  info: ' + n);
console.log('  print of the rows measured: ' + print);
/* the measured holds read through the row's bridge as absolute steps (src/core/bands.js absPmOf): where each company sits in Levels of strength */
if (row) console.log('  as absolute steps on the row: LOW ' + (absPmOf(G, Math.round(cut.cells.floor.held)) / 1000).toFixed(1) + ', MID ' + (absPmOf(G, Math.round(cut.cells.ref.held)) / 1000).toFixed(1) + ', BIS ' + (absPmOf(G, Math.round(cut.cells.top.held)) / 1000).toFixed(1) + ' (refLevel ' + row.refLevel + '); depths LOW ' + depthAt(G, Math.round(cut.cells.floor.lowest)) + ' (lowest seed), MID ' + depthAt(G, Math.round(cut.cells.ref.held)) + ', BIS ' + depthAt(G, Math.round(cut.cells.top.held)));

if (!argv.includes('--write')) { console.log('\n(dry run: --write sets the band on the row and pins it in tests/danger-band-pins.json)'); process.exit(0); }
if (!row) {
  console.log('\nNo DANGER_GROUNDS row for ' + G + ' yet. Paste this into src/data/danger.js (the gear base, drop home and Trait pool are yours),');
  console.log('then run again with --write so the pin records the print:\n');
  console.log('  ' + G + ': ground({ refStep: ' + band.refStep + ', floorStep: ' + band.floorStep + ', topStep: ' + band.topStep + ', '
    + (band.refKillsHead ? 'refKillsHead: ' + band.refKillsHead + ', ' : '') + 'gearLevel: tierLevel(<tier>), ladderTier: <tier> /* or named */, traits: traitPool(\'' + G + '\'), '
    + 'entryLevel: ' + (levels.entry || '<its hunt\'s band floor>') + ' }),');
  process.exit(1);
}
const DJS = join(ROOT, 'src', 'data', 'danger.js');
const next = rewriteRow(readFileSync(DJS, 'utf8'), G, band);
if (next === null) die('the ' + G + ' row in src/data/danger.js is not on one line in the refStep, floorStep, topStep order: set it by hand, then pin', 1);
writeFileSync(DJS, next);
const PINS = join(ROOT, 'tests', 'danger-band-pins.json');
const pins = existsSync(PINS) ? readJson(PINS) : { _why: '', grounds: {} };
pins.grounds[G] = { ...band, print, verdict: cut.verdict, levels, measured: new Date().toISOString().slice(0, 10), evidence: arg('ref') ? [arg('ref'), arg('top-report'), arg('floor')] : ['tools/balance-program/redesign/grounds/' + G + '-{floor,top,ref}.json'] };
writeFileSync(PINS, JSON.stringify(pins, null, 1) + '\n');
console.log('\nwrote the band to src/data/danger.js and the pin to tests/danger-band-pins.json. Review the diff; the server catalogue: node tools/gen-danger.mjs');
