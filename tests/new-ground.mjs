#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/new-ground.mjs — THE NEW-GROUND TOOL CUTS EVERY BAND BY THE BAND RULE (lane/content-pipeline, 2026-11-22; the floor rule,
// lane/band-floor 2026-11-22).
//
//   node tests/new-ground.mjs
//
// tools/new-ground.mjs puts a ground on the Danger scale from three v1-climb runs (docs/design/redesign/24-content-pipeline.md
// section 2) and cuts its band by src/data/danger.js BAND_RULE (tools/lib/danger-band.mjs). From the reports each pin names
// (tests/danger-band-pins.json evidence, tools/balance-program/redesign/grounds) and R10's older ones (tools/balance-program/redesign/r10):
//   NG-1  every pinned band cuts back exactly from its own evidence (a hand pin: its floor, the part the rule owns)
//   NG-2  a Steady death in any cell is STAGED (12-targets C-3): Krell's Hold (4 of 4); Hask's Ford is OPEN
//   NG-3  THE FLOOR (24-content-pipeline.md G3): depth 1 is where a fresh company holds (12-targets 3.1), so on every report set the
//         floor sits at or under the LOW four's LOWEST seed, by floorUnder or one depth of the band if that is less (lane/tuning-pass:
//         a band one tier wide has 5-step depths, and 10 put the Bone Wing's fresh four at depth 4), never more than a floorTo further. R10's Muster
//         Barrows (LOW 320.9 at Level 55, 316 its lowest seed) cuts at 305, where R10's rule (2 x ref - top) cut 480; no band without
//         its LOW cell
//   NG-4  --write's row edit sets the band on an existing row, adds or drops refKillsHead, leaves every other row alone, and refuses
//         a ground with no row (a new ground's gear base, drop home and Trait pool are the designer's)
//   NG-5  the print moves when a ground's monster numbers or pockets move, and not for a name, an icon or a drop; on the formula, when its
//         anchor (DANGER_GROUNDS formulaStep, lane/monster-roles-ford-wings) moves
//   NG-6  THE MEASURING CHECK OF THE ABSOLUTE BAND (lane/foundations-block; src/core/bands.js bandAbs, src/data/sustain.js): every pinned
//         ground's evidence read with its formula band keeps its pin's verdict (today's rows pass), and each failure the check exists for is
//         a REVIEW note: a ground a tier under that tops out under this floor (27 K-6), a MID cell measured off the row's refLevel (27 K-5),
//         and a reference company whose regeneration, heal spells or food leave their sustain bands (04 section 3)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bandFromReports, rewriteRow, packPrint, lowestSeed } from '../tools/lib/danger-band.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { DANGER_GROUNDS, PAY, DEPTHS, BAND_RULE } = await imp('src/data/danger.js');
const { HUNT_GROUNDS, monstersOn } = await imp('src/data/hunt-grounds.js');
const { MONSTERS } = await imp('src/data/monsters.js');
const { bandAbs } = await imp('src/core/bands.js');
const { SUSTAIN } = await imp('src/data/sustain.js');
const PINS = JSON.parse(readFileSync(join(ROOT, 'tests', 'danger-band-pins.json'), 'utf8')).grounds;
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const R10 = 'tools/balance-program/redesign/r10/';
const cut = (set) => bandFromReports(set, PAY, DEPTHS, BAND_RULE);
/* a pin's evidence: [ref, top, floor] as new-ground writes it, or the grounds/<id>-{floor,top,ref}.json pattern */
const evidenceOf = (g, pin) => {
  const ev = pin.evidence || [];
  if (ev.length === 3) return { ref: json(ev[0]), top: json(ev[1]), floor: json(ev[2]) };
  const base = String(ev[0] || '').replace('{floor,top,ref}.json', '');
  return { ref: json(base + 'ref.json'), top: json(base + 'top.json'), floor: json(base + 'floor.json') };
};

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* NG-1 */
for (const [g, pin] of Object.entries(PINS)) {
  const row = DANGER_GROUNDS[g];
  ok(row, 'NG-1 a pin for ' + g + ' with no DANGER_GROUNDS row');
  if (!row) continue;
  const c = cut(evidenceOf(g, pin));
  const keys = pin.hand ? ['floorStep'] : ['refStep', 'floorStep', 'topStep', 'refKillsHead'];
  for (const k of keys) ok(c.band[k] === row[k], 'NG-1 ' + g + ' ' + k + ' cuts ' + c.band[k] + ' from its evidence, the row says ' + row[k]);
  ok(c.verdict === pin.verdict, 'NG-1 ' + g + ' verdict ' + c.verdict + ', its pin says ' + pin.verdict);
}
/* NG-2 */
const r10 = (g, refCell) => cut({ ref: json(R10 + g + '-' + refCell + '.json'), top: json(R10 + g + '-top.json'), floor: json(R10 + g + '-floor.json') });
ok(r10('krells_hold', 'check').verdict === 'STAGED', 'NG-2 krells_hold (Steady died 4 of 4) is not STAGED');
ok(r10('hasks_ford', 'check').verdict === 'OPEN', 'NG-2 hasks_ford (no Steady death) is not OPEN: ' + r10('hasks_ford', 'check').notes.join(' | '));
/* NG-3 */
const sets = [['muster_barrows', 'check'], ['hasks_ford', 'check'], ['catacomb_bone_wing', 'final'], ['catacomb_flooded_wing', 'final'], ['krells_hold', 'check'], ['pyre_field', 'check']]
  .map(([g, rc]) => [g + ' (R10)', { ref: json(R10 + g + '-' + rc + '.json'), top: json(R10 + g + '-top.json'), floor: json(R10 + g + '-floor.json') }])
  .concat(Object.entries(PINS).map(([g, pin]) => [g + ' (pinned)', evidenceOf(g, pin)]));
for (const [name, set] of sets) {
  const c = cut(set), low = lowestSeed(set.floor.cells['base:steady']);
  /* the margin: floorUnder, never more than one depth of the band (the lowest fresh seed at depth 2; lane/tuning-pass, 29-tuning-pass.md) */
  const under = low - c.band.floorStep, margin = Math.min(BAND_RULE.floorUnder, (c.band.topStep - low) / (DEPTHS - 2));
  ok(under >= margin && under < margin + BAND_RULE.floorTo, 'NG-3 ' + name + ' floor ' + c.band.floorStep + ' is ' + under + ' under the fresh four\'s lowest seed ' + low + ', the rule says ' + margin.toFixed(1) + ' to under ' + (margin + BAND_RULE.floorTo).toFixed(1));
  ok(c.band._lowDepth <= 3, 'NG-3 ' + name + ' fresh four reads depth ' + c.band._lowDepth);
}
const m10 = r10('muster_barrows', 'check');
ok(m10.band.floorStep === 305 && m10.band.floorStep < 316, 'NG-3 R10 Muster cuts its floor at ' + m10.band.floorStep + ', want 305 (its fresh four held 316 to 329)');
let threw = false;
try { cut({ ref: json(R10 + 'hasks_ford-check.json'), top: json(R10 + 'hasks_ford-top.json'), floor: null }); } catch { threw = true; }
ok(threw, 'NG-3 a band was cut with no LOW cell');
/* NG-4 */
const src = readFileSync(join(ROOT, 'src', 'data', 'danger.js'), 'utf8');
const lineOf = (text, g) => text.split('\n').find((l) => new RegExp('^  ' + g + ': [\\w.]+\\(\\{ refStep').test(l));
ok(lineOf(src, 'muster_barrows') && lineOf(src, 'hasks_ford'), 'NG-4 the DANGER_GROUNDS rows are not one line each in the refStep, floorStep, topStep order (tools/lib/danger-band.mjs rewriteRow)');
const a = rewriteRow(src, 'muster_barrows', { refStep: 600, floorStep: 490, topStep: 720, refKillsHead: 130 });
ok(a && /refStep: 600, floorStep: 490, topStep: 720, refKillsHead: 130, gearLevel: tierLevel\(3\)/.test(lineOf(a, 'muster_barrows')), 'NG-4 muster row not rewritten: ' + (a && lineOf(a, 'muster_barrows')));
ok(a && lineOf(a, 'hasks_ford') === lineOf(src, 'hasks_ford'), 'NG-4 another row moved');
const b = rewriteRow(src, 'hasks_ford', { refStep: 590, floorStep: 470, topStep: 710 });
/* (the row's other fields stay where they stood: the Ford's rowsKillsHead, lane/monster-roles-ford-wings, follows the band) */
ok(b && /topStep: 710, /.test(lineOf(b, 'hasks_ford')) && !/refKillsHead/.test(lineOf(b, 'hasks_ford')) && /gearLevel: tierLevel\(2\)/.test(lineOf(b, 'hasks_ford')), 'NG-4 refKillsHead not dropped: ' + (b && lineOf(b, 'hasks_ford')));
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
/* (lane/monster-formula) the ground's monsters switch: on the formula its rows play other numbers, so the print moves; on its rows it stays */
ok(packPrint(g, MONSTERS, monstersOn, 'formula') !== base, 'NG-5 the monsters switch to the formula kept the print');
ok(packPrint(g, MONSTERS, monstersOn, 'rows') === base, 'NG-5 a ground on its rows moved the print');
/* (lane/monster-roles-ford-wings) the formula's anchor: moved, every hold moves with it; on its rows it plays no part */
ok(packPrint(g, MONSTERS, monstersOn, 'formula', 520) !== packPrint(g, MONSTERS, monstersOn, 'formula'), 'NG-5 the formula\'s anchor moved and kept the print');
ok(packPrint(g, MONSTERS, monstersOn, 'rows', 520) === base, 'NG-5 an anchor on a ground on its rows moved the print');

/* NG-6 */
const absOf = (g, o = {}) => ({ band: bandAbs(g), prevTopPm: null, refLevel: DANGER_GROUNDS[g].refLevel, sustain: SUSTAIN, ...o });
for (const [g, pin] of Object.entries(PINS)) {
  if (!DANGER_GROUNDS[g] || pin.hand) continue;
  const ev = evidenceOf(g, pin), c = bandFromReports(ev, PAY, DEPTHS, BAND_RULE, absOf(g, { refLevel: ev.ref.levels[0] }));
  ok(c.verdict === pin.verdict, 'NG-6 ' + g + ' with its absolute band reads ' + c.verdict + ', its pin ' + pin.verdict + ': ' + c.notes.join(' | '));
  ok(c.info.some((x) => /absolute band/.test(x)), 'NG-6 ' + g + ' does not print its absolute band');
}
{
  const g = 'muster_barrows', ev = evidenceOf(g, PINS[g]), b = bandAbs(g);
  const gap = bandFromReports(ev, PAY, DEPTHS, BAND_RULE, absOf(g, { prevTopPm: b.floorPm - 1000, refLevel: ev.ref.levels[0] }));
  ok(gap.verdict === 'REVIEW' && gap.notes.some((x) => /K-6/.test(x)), 'NG-6 a ground a tier under topping out under the floor was not a K-6 note: ' + gap.verdict);
  const off = bandFromReports(ev, PAY, DEPTHS, BAND_RULE, absOf(g, { refLevel: ev.ref.levels[0] + 5 }));
  ok(off.verdict === 'REVIEW' && off.notes.some((x) => /K-5/.test(x)), 'NG-6 a MID cell off the refLevel was not a K-5 note: ' + off.verdict);
  const withSustain = (sus) => ({ ...ev, ref: { ...ev.ref, cells: { ...ev.ref.cells, 'base:steady': { ...ev.ref.cells['base:steady'], sustain: sus } } } });
  const inBand = { freePm: SUSTAIN.freePm.at, spellPm: SUSTAIN.healerPm.at, foodPm: SUSTAIN.supplyPm.at, takenPmS: 10 };
  const fine = bandFromReports(withSustain(inBand), PAY, DEPTHS, BAND_RULE, absOf(g, { refLevel: ev.ref.levels[0] }));
  ok(fine.verdict === PINS[g].verdict && fine.info.some((x) => /sustain at the reference/.test(x)), 'NG-6 a sustain reading in band moved the verdict or went unprinted: ' + fine.notes.join(' | '));
  for (const [k, field] of [['freePm', 'freePm'], ['healerPm', 'spellPm'], ['supplyPm', 'foodPm']]) {
    const bad = bandFromReports(withSustain({ ...inBand, [field]: SUSTAIN[k].band[1] + 1 }), PAY, DEPTHS, BAND_RULE, absOf(g, { refLevel: ev.ref.levels[0] }));
    ok(bad.verdict === 'REVIEW' && bad.notes.some((x) => x.includes(k)), 'NG-6 a reference ' + k + ' over its band was not a note');
  }
}

if (fails.length) { console.error('new-ground: ' + fails.length + ' failed\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('new-ground: every pinned band cuts back from its evidence, the floor sits under every fresh four, verdicts read the deaths, the row edit and the print hold');
