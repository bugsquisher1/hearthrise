#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bands.mjs — A GROUND'S BAND IN ABSOLUTE STEPS, THE RATING AND "DEPTH N OF 20" (lane/foundations-block, 2026-11-23).
//
//   node tests/bands.mjs
//   node tests/bands.mjs --mutate    each rule planted back in a temp copy (tests/hunt-core/fixtures/h1.js plant), each caught by this file
//                                    or by tests/sustain.mjs (the sustain levers ride here: one proof for the foundations' two tests)
//
// mutant-anchors: src/core/bands.js src/data/bands.js src/data/sustain.js src/session/danger-sections.js src/data/danger.js
// mutant-writes-tree: no — every mutant is planted into a temp copy (plant), never the tree
//
// src/data/bands.js and src/core/bands.js (26-architecture-pass.md rank 2, 04 sections 1 and 4, 27 S-5, K-5, K-6):
//   BD-1  THE REFERENCE SKILL LINE is the career it was read from: every SKILL_LINE point within 1 of tools/balance-sim/skill-lines.json's
//         'party' line (hammer for melee, mage for magic, bow for ranged), so a re-measured career turns this red until the line is re-read
//   BD-2  skillLevelPm reads the line backwards: each point's skill gives its Level exactly, it never falls as the skill rises, a skill past
//         the last point carries on at the last slope, and an unknown skill is null
//   BD-3  THE RATING (04 section 1): a hero with every part at its Level rates its Level; a gear part under it counts at weightGearBelowPm,
//         over it at weightGearPm, a skill Level at weightSkillPm, the weights the engine's own (src/data/danger.js POWER)
//   BD-4  THE BAND IS A FORMULA of the row: every scale ground's bandAbs is the rating of its three companies (a fresh four one tier back at
//         the entry Level, the reference at refLevel, a strong four one tier ahead at its hunt's top Level; a ground whose band sits inside
//         its own base tier, both in its own kit: 29-tuning-pass.md 7.5, insideOneTier), recomputed here by hand, and ordered floor <
//         reference < top; refLevel sits inside the hunt's Level band (27 K-5)
//   BD-5  THE BRIDGE: absPmOf maps the row's floorStep, reference hold (refHeldOf) and topStep to the formula's three points exactly and
//         never falls with the step
//   BD-6  ONE DEPTH: depthAt reads Depth 1 at the floor and DEPTHS at the top, never falls with the step, stays in 1..DEPTHS, and is an even
//         cut in absolute steps (the reference hold sits at its absolute share of the band); the browser's danger-sections.js depthOf and
//         the edge's drop-rate.js depthOf read it for every step of every band
//   BD-7  27 K-6, THE HANDOVER: a scale ground one tier over another starts at or under where the lower one tops out
//   BD-8  THE READING'S MIDDLE IS A HOLD (lane/depth-reading-fix, 12-targets 3.1a; at the band's grain, lane/monster-roles-ford-wings): a
//         formula ground's middle (refHeld, else refStep) is its pin's MID four's hold to BAND_RULE.topTo; a ground carrying refHeld (its
//         refStep is the chosen anchor, not where the reference four holds), a whole step inside its band; refHeldOf reads it, else refStep
//   BD-9  AN ORDINARY CLIMB READS RIGHT, ON THE MEASURED COMPANIES (12-targets 3.1 and 3.1a): on every pinned ground the arriving company
//         (its pin's floor evidence, one tier back at the entry Level) reads at most ARRIVE_MAX and the reference company (its MID evidence)
//         reads within one depth of its share of the band; on Muster Barrows (tools/balance-program/redesign/depth-budget) the arriving
//         four, the plain grown four, the strong four on Steady and on Bold read a climb (arriving <= 6, strong >= 16, Bold >= 19). Red on
//         the floor cut two tiers back (arriving depth 9) and on a reading whose middle is the anchor refStep (8). Nothing here caps a
//         company: these read measured holds, they never hold a step back (Tyler 2026-11-23)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { SKILL_LINE, BAND_ABS } = await imp('src/data/bands.js');
const { DANGER_GROUNDS, DEPTHS, POWER, BAND_RULE } = await imp('src/data/danger.js');
const { GEAR_STEPS } = await imp('src/data/gear-steps.js');
const { HUNT_INDEX } = await imp('src/data/hunts.js');
const B = await imp('src/core/bands.js');
const { depthOf: clientDepth } = await imp('src/session/danger-sections.js');
const { depthOf: edgeDepth } = await imp('src/core/drop-rate.js');
const SL = await imp('tools/balance-sim/skill-lines.mjs');

/* --mutate: each rule planted back, each caught (exit 1) by the test that owns it */
if (process.argv.includes('--mutate')) {
  const { plant } = await imp('tests/hunt-core/fixtures/h1.js');
  /* BD-9 reads the band pins and the measured companies: every pin's evidence and the depth-budget runs ride into the plant */
  const evidence = Object.values(JSON.parse(readFileSync(join(ROOT, 'tests', 'danger-band-pins.json'), 'utf8')).grounds).flatMap((p) => p.evidence || []);
  const ALSO = [...new Set(['src/session', 'tools/balance-sim', 'tests/bands.mjs', 'tests/sustain.mjs', 'tests/_is-main.mjs', 'tools/balance-program/redesign/foundations',
    'tests/danger-band-pins.json', 'tools/balance-program/redesign/depth-budget', ...evidence])];
  const MUT = [
    ['tests/bands.mjs', 'a ground inside one tier reads the next tier\'s strong four (29 7.5)', [['src/core/bands.js', 'topPm: at(top, own ? g.gearLevel : Math.max(', 'topPm: at(top, false ? g.gearLevel : Math.max(']]],
    ['tests/bands.mjs', 'no ground is ever inside one tier', [['src/core/bands.js', '  return g.entryLevel >= g.gearLevel && top < g.gearLevel + GEAR_STEPS.tierSteps;', '  return false;']]],
  /* the controls: each test passes on the clean plant, so a mutant's red is its own and not a file the plant left out (until 2026-11-23
     every planted run died on a missing tests/_is-main.mjs, which tools/balance-sim/skill-lines.mjs imports, so every mutant read caught) */
  ['tests/bands.mjs', 'CONTROL: the clean plant', []],
  ['tests/sustain.mjs', 'CONTROL: the clean plant', []],
  ['tests/bands.mjs', 'the reading\'s middle is the pay anchor, not the reference hold', [['src/core/bands.js', 'm = g ? refHeldOf(groundId) : null;', 'm = g ? g.refStep : null;']]],
  ['tests/bands.mjs', 'refHeldOf ignores the row\'s refHeld', [['src/core/bands.js', 'return g.refHeld === undefined ? g.refStep : g.refHeld;', 'return g.refStep;']]],
  ['tests/bands.mjs', 'Muster\'s floor cut two tiers back', [['src/data/danger.js', 'refStep: 610, floorStep: 575, topStep: 700, coinPm: 7000,', 'refStep: 610, floorStep: 525, topStep: 700, coinPm: 7000,']]],
  ['tests/bands.mjs', 'a formula ground with no measured hold', [['src/data/danger.js', 'refStep: 110, floorStep: 0, topStep: 190, refKillsHead: 125, refHeld: 115,', 'refStep: 110, floorStep: 0, topStep: 190, refKillsHead: 125,']]],
  /* (lane/monster-roles-ford-wings) the Flooded Wing's middle at the pay's grain (450 for a hold of 453.5): its reference four reads 2 depths deep */
  ['tests/bands.mjs', 'the reading\'s middle at the pay\'s grain', [['src/data/danger.js', 'topStep: 465, refHeld: 455, formulaStep: 500,', 'topStep: 465, formulaStep: 500,']]],
  ['tests/bands.mjs', 'depth floors, not half up', [['src/core/bands.js', '(DEPTHS - 1) + span * den) / (2 * span * den));', '(DEPTHS - 1)) / (2 * span * den));']]],
  ['tests/bands.mjs', 'the top wears the base', [['src/core/bands.js', 'Math.min(g.gearLevel + T * BAND_ABS.topTiersAhead, wearableTierLevel(top))', 'g.gearLevel']]],
  /* lane/scale-early-grounds: the strong four wears what its top Level can wear, at the Level its hunt still plays */
  ['tests/bands.mjs', 'the top wears a tier its Level cannot', [['src/core/bands.js', 'Math.min(g.gearLevel + T * BAND_ABS.topTiersAhead, wearableTierLevel(top))', 'g.gearLevel + T * BAND_ABS.topTiersAhead']]],
  ['tests/bands.mjs', 'the top Level past the hunt\'s exit', [['src/core/bands.js', 'return gr && Number.isInteger(gr.endsAtLevel) ? Math.min(top, gr.endsAtLevel - 1) : top;', 'return top;']]],
  ['tests/bands.mjs', 'one gear weight both sides', [['src/core/bands.js', 'const wG = gGap < 0 ? POWER.weightGearBelowPm : POWER.weightGearPm;', 'const wG = POWER.weightGearPm;']]],
  ['tests/bands.mjs', 'the skill weight dropped from the rating', [['src/core/bands.js', 'gGap * wG + sGap * POWER.weightSkillPm', 'gGap * wG']]],
  ['tests/bands.mjs', 'the browser cuts its own depth', [['src/session/danger-sections.js', '  const depth = depthAt(hunt, s);', '  const g = DANGER_GROUNDS[hunt], span = Math.max(1, g.topStep - g.floorStep);\n  const depth = Math.max(1, Math.min(DEPTHS, 1 + Math.round(((s - g.floorStep) / span) * (DEPTHS - 1))));']]],
  ['tests/bands.mjs', 'a skill line point drifts from its career', [['src/data/bands.js', '[60, 52], [75, 61]', '[60, 55], [75, 61]']]],
  ['tests/bands.mjs', 'the line stops at its last point', [['src/core/bands.js', 'while (k < L.length - 1 && v > L[k][1]) k++;', 'while (k < L.length - 1 && v > L[k][1]) k++;\n  if (v >= L[L.length - 1][1]) return 1000 * L[L.length - 1][0];']]],
  ['tests/bands.mjs', 'the bridge misses its reference point', [['src/core/bands.js', 'const [[a, A], [b, B]] = s <= p[1][0] ? [p[0], p[1]] : [p[1], p[2]];', 'const [[a, A], [b, B]] = [p[0], p[2]];']]],
  ['tests/sustain.mjs', 'a share starts outside its band', [['src/data/sustain.js', 'freePm: lever(150, [100, 250]),', 'freePm: lever(300, [100, 250]),']]],
  ['tests/sustain.mjs', 'a band too tight for the measured reference', [['src/data/sustain.js', 'healerPm: lever(830, [700, 900]),', 'healerPm: lever(830, [800, 900]),']]],
  ['tests/sustain.mjs', 'the healer holds twice the mana seconds', [['src/data/sustain.js', 'manaSeconds: lever(75, [60, 90]),', 'manaSeconds: lever(150, [140, 160]),']]],
];

  let caught = 0;
  for (const [test, name, edits] of MUT) {
    const p = plant(edits, ALSO);
    let code = 0;
    try { execFileSync(process.execPath, [join(p.root, test)], { stdio: 'ignore', cwd: p.root }); } catch (e) { code = e.status; }
    p.done();
    const good = edits.length ? code === 1 : code === 0;
    console.log((good ? (edits.length ? '  caught  ' : '  clean   ') : (edits.length ? '  MISSED  ' : '  RED     ')) + test + ': ' + name);
    if (good) caught++;
  }
  console.log((caught === MUT.length ? '✓' : '✗') + ' bands --mutate: ' + caught + ' of ' + MUT.length + ' judged right (the clean plant green, every mutant caught)');
  process.exit(caught === MUT.length ? 0 : 1);
}

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* BD-1 */
const lines = SL.loadLines(join(ROOT, 'tools', 'balance-sim', 'skill-lines.json'));
for (const [skill, style] of [['melee', 'hammer'], ['magic', 'mage'], ['ranged', 'bow']]) {
  for (const [L, v] of SKILL_LINE[skill]) {
    const career = SL.skillsAt(lines, 'party', style, L)[skill];
    ok(Math.abs(career - v) <= 1, 'BD-1 SKILL_LINE.' + skill + ' at Level ' + L + ' is ' + v + ', the ' + style + ' party career reads ' + career);
  }
}

/* BD-2 */
for (const skill of Object.keys(SKILL_LINE)) {
  const pts = SKILL_LINE[skill];
  for (const [L, v] of pts) ok(B.skillLevelPm(skill, v) === 1000 * L, 'BD-2 ' + skill + ' ' + v + ' reads Level ' + B.skillLevelPm(skill, v) / 1000 + ', its point says ' + L);
  let last = -Infinity;
  for (let v = 0; v <= pts[pts.length - 1][1] + 20; v++) { const x = B.skillLevelPm(skill, v); ok(x >= last, 'BD-2 ' + skill + ' falls at ' + v); last = x; }
  const [a, b] = pts.slice(-2), past = b[1] + 4;
  ok(B.skillLevelPm(skill, past) === 1000 * b[0] + Math.floor((2 * 1000 * 4 * (b[0] - a[0]) + (b[1] - a[1])) / (2 * (b[1] - a[1]))), 'BD-2 ' + skill + ' past the last point is not its last slope');
}
ok(B.skillLevelPm('defense', 50) === null && B.skillLevelPm('melee', 'x') === null, 'BD-2 an unknown skill or value reads a Level');

/* BD-3 */
ok(B.ratingPm({ levelPm: 60000 }) === 60000, 'BD-3 every part at Level 60 does not rate 60');
ok(B.ratingPm({ levelPm: 60000, gearPm: 40000 }) === 60000 - (20000 * POWER.weightGearBelowPm) / 1000, 'BD-3 a gear part 20 under is not at the weight under');
ok(B.ratingPm({ levelPm: 60000, gearPm: 80000 }) === 60000 + (20000 * POWER.weightGearPm) / 1000, 'BD-3 a gear part 20 over is not at the weight over');
ok(B.ratingPm({ levelPm: 60000, skillLevelPm: 70000 }) === 60000 + (10000 * POWER.weightSkillPm) / 1000, 'BD-3 a skill Level 10 over is not at the skill weight');

/* BD-4 */
const T = GEAR_STEPS.tierSteps;
const byHand = (L, gear) => {
  const gap = gear - L, w = gap < 0 ? POWER.weightGearBelowPm : POWER.weightGearPm;
  return Math.floor((2 * (1000 * 1000 * L + 1000 * gap * w) + 1000) / 2000);
};
/* (lane/scale-early-grounds) the top Level is the last one the ground's hunt plays (an endsAtLevel ground's: the Mill Cellar's 4), and the
   strong four wears the tier ahead only if that Level can wear it (a piece is worn from its item Level less wearAhead), else its own tier */
const { HUNT_GROUNDS } = await imp('src/data/hunt-grounds.js');
const topOf = (id, band) => (Number.isInteger(HUNT_GROUNDS[id] && HUNT_GROUNDS[id].endsAtLevel) ? Math.min(band[1], HUNT_GROUNDS[id].endsAtLevel - 1) : band[1]);
/* (29-tuning-pass.md 7.5) a ground whose band, entry to top, sits inside its own base tier's Levels: both companies in its own kit */
const insideOf = (g, top) => g.entryLevel >= g.gearLevel && top < g.gearLevel + T;
const strongKit = (g, L) => {
  if (insideOf(g, L)) return g.gearLevel;
  let kit = g.gearLevel + T * BAND_ABS.topTiersAhead;
  while (kit > g.gearLevel && kit - GEAR_STEPS.wearAhead > L) kit -= T;
  return kit;
};
for (const [id, g] of Object.entries(DANGER_GROUNDS)) {
  const b = B.bandAbs(id), band = HUNT_INDEX[id] && HUNT_INDEX[id].band;
  ok(b, 'BD-4 ' + id + ' has no absolute band');
  if (!b) continue;
  const top = topOf(id, band);
  const freshKit = insideOf(g, top) ? g.gearLevel : Math.max(0, g.gearLevel - T * BAND_ABS.freshTiersBack);
  ok(b.floorPm === byHand(g.entryLevel, freshKit), 'BD-4 ' + id + ' floor ' + b.floorPm + ' is not the fresh four\'s rating (kit ' + freshKit + ')');
  ok(B.insideOneTier(id) === insideOf(g, top), 'BD-4 ' + id + ' insideOneTier reads ' + B.insideOneTier(id) + ', its band ' + g.entryLevel + ' to ' + top + ' on base ' + g.gearLevel + ' says ' + insideOf(g, top));
  ok(b.refPm === byHand(g.refLevel, g.gearLevel), 'BD-4 ' + id + ' reference ' + b.refPm + ' is not the reference company\'s rating');
  ok(b.topPm === byHand(top, strongKit(g, top)), 'BD-4 ' + id + ' top ' + b.topPm + ' is not the strong four\'s rating (Level ' + top + ', kit ' + strongKit(g, top) + ')');
  ok(b.floorPm < b.refPm && b.refPm < b.topPm, 'BD-4 ' + id + ' band is not ordered: ' + JSON.stringify(b));
  ok(Number.isInteger(g.refLevel) && g.refLevel >= band[0] && g.refLevel <= band[1], 'BD-4 ' + id + ' refLevel ' + g.refLevel + ' outside its Level band ' + band);
}

/* BD-5 and BD-6 */
const shareOf = (b) => 1 + Math.round(((b.refPm - b.floorPm) * (DEPTHS - 1)) / (b.topPm - b.floorPm));
for (const [id, g] of Object.entries(DANGER_GROUNDS)) {
  const b = B.bandAbs(id), held = B.refHeldOf(id);
  if (!b) continue;
  ok(B.absPmOf(id, g.floorStep) === b.floorPm && B.absPmOf(id, held) === b.refPm && B.absPmOf(id, g.topStep) === b.topPm, 'BD-5 ' + id + ' bridge does not meet the formula at its floor, reference hold ' + held + ' and top');
  ok(B.depthAt(id, g.floorStep) === 1 && B.depthAt(id, g.topStep) === DEPTHS, 'BD-6 ' + id + ' floor reads ' + B.depthAt(id, g.floorStep) + ', top ' + B.depthAt(id, g.topStep));
  const want = shareOf(b);
  ok(B.depthAt(id, held) === want, 'BD-6 ' + id + ' reference hold reads depth ' + B.depthAt(id, held) + ', its absolute share of the band is ' + want);
  let lastAbs = -Infinity, lastD = 0;
  for (let s = Math.max(0, g.floorStep - 30); s <= g.topStep + 30; s++) {
    const a = B.absPmOf(id, s), d = B.depthAt(id, s);
    ok(a >= lastAbs, 'BD-5 ' + id + ' absolute step falls at ' + s);
    ok(d >= lastD && d >= 1 && d <= DEPTHS, 'BD-6 ' + id + ' depth ' + d + ' at ' + s);
    const c = clientDepth(id, s);
    ok(c && c.depth === d && c.of === DEPTHS, 'BD-6 ' + id + ' the browser reads depth ' + (c && c.depth) + ' at ' + s + ', depthAt ' + d);
    ok(edgeDepth(id, s) === d, 'BD-6 ' + id + ' the edge reads depth ' + edgeDepth(id, s) + ' at ' + s + ', depthAt ' + d);
    lastAbs = a; lastD = d;
  }
}
ok(B.depthAt('nowhere', 10) === null && B.absPmOf('nowhere', 10) === null && B.bandAbs('nowhere') === null, 'BD-6 a ground off the scale has a depth');

/* BD-7 */
for (const [id, g] of Object.entries(DANGER_GROUNDS)) {
  for (const [pid, p] of Object.entries(DANGER_GROUNDS)) {
    if (p.gearLevel !== g.gearLevel - T) continue;
    ok(B.bandAbs(pid).topPm >= B.bandAbs(id).floorPm, 'BD-7 ' + pid + ' tops out at ' + B.bandAbs(pid).topPm + ', under ' + id + '\'s floor ' + B.bandAbs(id).floorPm);
  }
}

/* BD-8 */
const BD8_PINS = JSON.parse(readFileSync(join(ROOT, 'tests', 'danger-band-pins.json'), 'utf8')).grounds;
for (const [id, g] of Object.entries(DANGER_GROUNDS)) {
  /* a formula ground's reading reads its reference four's MEASURED hold (its pin's MID evidence) at the band's grain: refHeld where that is
     not refStep (the Thicket 113.2, the Mill Cellar 55.2, the Flooded Wing 453.5: 110, 60 and 450 to the pay's grain), refStep where it is
     (lane/monster-roles-ford-wings: the Ford holds on its anchor, the Bone Wing's refStep is cut from its hold) */
  if (g.monsters === 'formula') {
    const ev = BD8_PINS[id] && Array.isArray(BD8_PINS[id].evidence) ? BD8_PINS[id].evidence[0] : null;
    const c = ev ? JSON.parse(readFileSync(join(ROOT, ev), 'utf8')).cells['base:steady'] : null;
    const held = c && c.held ? Math.round(c.held.mean / BAND_RULE.topTo) * BAND_RULE.topTo : NaN;
    ok(B.refHeldOf(id) === held, 'BD-8 ' + id + ' plays the monster formula and the middle of its reading ' + B.refHeldOf(id) + ' is not the hold of its reference four ' + held + ' (' + ev + '; node tools/new-ground.mjs ' + id + ' ... --write)');
  }
  if (g.refHeld !== undefined) {
    ok(Number.isInteger(g.refHeld) && g.floorStep < g.refHeld && g.refHeld < g.topStep, 'BD-8 ' + id + ' refHeld ' + g.refHeld + ' is not a whole step inside ' + g.floorStep + '..' + g.topStep);
    ok(B.refHeldOf(id) === g.refHeld, 'BD-8 ' + id + ' refHeldOf reads ' + B.refHeldOf(id) + ', the row says ' + g.refHeld);
  } else ok(B.refHeldOf(id) === g.refStep, 'BD-8 ' + id + ' has no refHeld and refHeldOf reads ' + B.refHeldOf(id) + ', not its refStep');
}
ok(B.refHeldOf('nowhere') === null, 'BD-8 a ground off the scale has a reference hold');

/* BD-9 */
const ARRIVE_MAX = 6; /* the brief's "about 6"; 12-targets 3.1 wants a company that topped the last ground at depth 1 to 3, read in own steps */
const PINS = JSON.parse(readFileSync(join(ROOT, 'tests', 'danger-band-pins.json'), 'utf8')).grounds;
const report = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const heldIn = (rel, cell = 'base:steady') => { const r = report(rel); const c = r.cells[cell]; return c && c.held ? c.held.mean : NaN; };
const readAt = (id, held) => (Number.isFinite(held) ? B.depthAt(id, Math.round(held)) : null);
for (const [id, pin] of Object.entries(PINS)) {
  if (!DANGER_GROUNDS[id] || !Array.isArray(pin.evidence) || pin.evidence.length !== 3) continue;
  const [refRel, , floorRel] = pin.evidence, b = B.bandAbs(id);
  const arrive = readAt(id, heldIn(floorRel)), ref = readAt(id, heldIn(refRel));
  ok(arrive !== null && arrive <= ARRIVE_MAX, 'BD-9 ' + id + ': the arriving company (' + floorRel + ') reads depth ' + arrive + ', over ' + ARRIVE_MAX);
  ok(ref !== null && Math.abs(ref - shareOf(b)) <= 1, 'BD-9 ' + id + ': the reference company (' + refRel + ') reads depth ' + ref + ', its share of the band is ' + shareOf(b));
}
{
  const M = 'muster_barrows', DB = 'tools/balance-program/redesign/depth-budget/';
  const arrive = readAt(M, heldIn(DB + 'muster-a.json')), grown = readAt(M, heldIn(DB + 'muster-c.json', 'back:steady'));
  const strong = readAt(M, heldIn(DB + 'muster-cplus.json', 'back:steady')), bold = readAt(M, heldIn(DB + 'muster-cplus.json', 'back:bold'));
  const climb = 'arriving ' + arrive + ', grown ' + grown + ', strong ' + strong + ', Bold ' + bold;
  ok(arrive !== null && arrive <= ARRIVE_MAX, 'BD-9 Muster Barrows: the arriving four (the Ford\'s kit at Level 55) reads depth ' + arrive + ', over ' + ARRIVE_MAX + ' (' + climb + ')');
  ok(strong >= 16 && bold >= 19, 'BD-9 Muster Barrows: the strong four does not reach the top on its own drops (' + climb + ')');
  ok(arrive < grown && grown < strong && strong <= bold, 'BD-9 Muster Barrows: the measured companies do not read a climb (' + climb + ')');
}

if (fails.length) { console.error('✗ bands: ' + fails.length + ' failing\n  ' + fails.slice(0, 30).join('\n  ')); process.exit(1); }
console.log('✓ bands: BD-1..9 (' + Object.keys(DANGER_GROUNDS).length + ' scale grounds, the skill line on its career, one depth for the browser and the edge, the reading\'s middle a measured hold, an ordinary climb reads right)');
