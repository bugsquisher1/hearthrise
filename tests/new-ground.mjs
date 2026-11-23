#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/new-ground.mjs — THE NEW-GROUND TOOL CUTS R10'S BANDS (lane/content-pipeline, 2026-11-22).
//
//   node tests/new-ground.mjs
//
// tools/new-ground.mjs puts a ground on the Danger scale from three v1-climb runs (docs/design/redesign/24-content-pipeline.md
// section 2). Its cut (tools/lib/danger-band.mjs) must give back, from R10's own reports (tools/balance-program/redesign/r10), the
// bands R10 wrote into src/data/danger.js by hand, and its verdicts must read the deaths those reports hold:
//   NG-1  Hask's Ford, both Catacomb wings: the band and refKillsHead equal DANGER_GROUNDS' rows
//   NG-2  a Steady death in any cell is STAGED (12-targets C-3): the wings and Krell's Hold; Hask's Ford is OPEN
//   NG-3  Muster Barrows' LOW four (320.9 at Level 55) is read as under the floor (the gap 24 section 5 names)
//   NG-4  --write's row edit sets the band on an existing row, adds or drops refKillsHead, leaves every other row alone, and refuses
//         a ground with no row (a new ground's gear base, drop home and Trait pool are the designer's)
//   NG-5  the print moves when a ground's monster numbers or pockets move, and not for a name, an icon or a drop
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bandFromReports, rewriteRow, packPrint } from '../tools/lib/danger-band.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { DANGER_GROUNDS, PAY, DEPTHS } = await imp('src/data/danger.js');
const { HUNT_GROUNDS, monstersOn } = await imp('src/data/hunt-grounds.js');
const { MONSTERS } = await imp('src/data/monsters.js');
const R10 = join(ROOT, 'tools', 'balance-program', 'redesign', 'r10');
const rep = (g, cell) => JSON.parse(readFileSync(join(R10, g + '-' + cell + '.json'), 'utf8'));
const cutOf = (g, refCell) => bandFromReports({ ref: rep(g, refCell), top: rep(g, 'top'), floor: rep(g, 'floor') }, PAY, DEPTHS);

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* NG-1, NG-2 (R10's MID cell: the Ford's check run, the wings' final runs after lane/econ-levers) */
for (const [g, refCell, verdict] of [['hasks_ford', 'check', 'OPEN'], ['catacomb_bone_wing', 'final', 'STAGED'], ['catacomb_flooded_wing', 'final', 'STAGED']]) {
  const { band, verdict: v } = cutOf(g, refCell), row = DANGER_GROUNDS[g];
  for (const k of ['refStep', 'floorStep', 'topStep', 'refKillsHead']) ok(band[k] === row[k], 'NG-1 ' + g + ' ' + k + ' cut ' + band[k] + ', the row says ' + row[k]);
  ok(v === verdict, 'NG-2 ' + g + ' verdict ' + v + ', want ' + verdict);
}
ok(cutOf('krells_hold', 'check').verdict === 'STAGED', 'NG-2 krells_hold (Steady died 4 of 4) is not STAGED');
/* NG-3 */
const muster = cutOf('muster_barrows', 'check');
ok(muster.band.refStep === DANGER_GROUNDS.muster_barrows.refStep && muster.band.refKillsHead === undefined, 'NG-3 muster ref ' + muster.band.refStep + ' / kills ' + muster.band.refKillsHead);
ok(muster.notes.some((n) => /under the floor/.test(n)) && muster.verdict === 'REVIEW', 'NG-3 muster LOW under the floor not read: ' + muster.verdict + ' ' + muster.notes.join(' | '));
/* NG-4 */
const src = readFileSync(join(ROOT, 'src', 'data', 'danger.js'), 'utf8');
const lineOf = (text, g) => text.split('\n').find((l) => l.startsWith('  ' + g + ': Object.freeze({'));
const a = rewriteRow(src, 'muster_barrows', { refStep: 600, floorStep: 490, topStep: 720, refKillsHead: 130 });
ok(a && /refStep: 600, floorStep: 490, topStep: 720, refKillsHead: 130, gearLevel: tierLevel\(3\)/.test(lineOf(a, 'muster_barrows')), 'NG-4 muster row not rewritten: ' + (a && lineOf(a, 'muster_barrows')));
ok(a && lineOf(a, 'hasks_ford') === lineOf(src, 'hasks_ford'), 'NG-4 another row moved');
const b = rewriteRow(src, 'hasks_ford', { refStep: 590, floorStep: 470, topStep: 710 });
ok(b && /topStep: 710, gearLevel/.test(lineOf(b, 'hasks_ford')), 'NG-4 refKillsHead not dropped: ' + (b && lineOf(b, 'hasks_ford')));
ok(rewriteRow(src, 'hasks_ford', DANGER_GROUNDS.hasks_ford) === src, 'NG-4 the same band is not a no-op');
ok(rewriteRow(src, 'nowhere_field', { refStep: 1, floorStep: 0, topStep: 2 }) === null, 'NG-4 a ground with no row was written');
/* NG-5 */
const g = HUNT_GROUNDS.muster_barrows, base = packPrint(g, MONSTERS, monstersOn);
const id = [...monstersOn(g)][0];
const withRow = (patch) => ({ ...MONSTERS, [id]: { ...MONSTERS[id], ...patch } });
ok(packPrint(g, withRow({ hp: MONSTERS[id].hp + 1 }), monstersOn) !== base, 'NG-5 a monster hp change kept the print');
ok(packPrint(g, withRow({ name: 'Renamed', icon: 'x', drops: [] }), monstersOn) === base, 'NG-5 a name, icon or drop moved the print');
const moved = { ...g, pockets: g.pockets.map((p, i) => (i === g.route[0] ? { ...p, pack: (p.pack || p.spawns).slice(1) } : p)) };
ok(packPrint(moved, MONSTERS, monstersOn) !== base, 'NG-5 a pocket losing a monster kept the print');

if (fails.length) { console.error('new-ground: ' + fails.length + ' failed\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('new-ground: R10\'s three bands cut back exactly, verdicts read the deaths, the row edit and the print hold');
