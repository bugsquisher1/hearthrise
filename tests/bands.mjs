#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bands.mjs — A GROUND'S BAND IN ABSOLUTE STEPS, THE RATING AND "DEPTH N OF 20" (lane/foundations-block, 2026-11-23).
//
//   node tests/bands.mjs
//   node tests/bands.mjs --mutate    each rule planted back in a temp copy (tests/hunt-core/fixtures/h1.js plant), each caught by this file
//                                    or by tests/sustain.mjs (the sustain levers ride here: one proof for the foundations' two tests)
//
// mutant-anchors: src/core/bands.js src/core/xp.js src/data/sustain.js src/session/danger-sections.js src/data/danger.js src/data/core-model.js src/data/runes.js
// mutant-writes-tree: no — every mutant is planted into a temp copy (plant), never the tree
//
// src/data/bands.js and src/core/bands.js (26-architecture-pass.md rank 2, 04 sections 1 and 4, 27 S-5, K-5, K-6):
//   BD-1  THE SKILL LINE IS THE LEVEL CLOCK (stage 7, lane/skills-time-parity): at the data's pace (1000) a combat skill reads its own
//         Level, exactly; at another pace skillLevelPm reads the Level whose hours from Level 1 are pace x the hours to the skill (the hours
//         formula summed here by hand); and the curve is built on that clock: each combat skill level's XP over the reference rate
//         (SKILL_CURVE.xpPerHealthHour x the reference health of its Level) is pace x the hours that Level takes, to the whole XP
//   BD-2  skillLevelPm never falls as the skill rises, reads a skill under 1 as Level 1, and Inner Flame (its own curve), a capped skill
//         or a value that is not a number read null
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
//   BD-7  27 K-6, THE HANDOVER: a scale ground one tier over another starts at or under where the lower one tops out. Judged from a
//         lower ground of base tier 1 or more (29-tuning-pass.md 7.5 read for K-6 as for C-2 and V4; lane/scale-grounds-2): out of
//         tier 0, the starting kit, both companies wear that kit and the handover is the Levels between the bands, not a strength skip
//   BD-8  THE READING'S MIDDLE IS A HOLD (lane/depth-reading-fix, 12-targets 3.1a; at the band's grain, lane/monster-roles-ford-wings): a
//         formula ground's middle (refHeld, else refStep) is its pin's MID four's hold to BAND_RULE.topTo; a ground carrying refHeld (its
//         refStep is the chosen anchor, not where the reference four holds), a whole step inside its band; refHeldOf reads it, else refStep
//   BD-9  AN ORDINARY CLIMB READS RIGHT, ON THE MEASURED COMPANIES (12-targets 3.1 and 3.1a): on every pinned ground the arriving company
//         (its pin's floor evidence, one tier back at the entry Level) reads at most ARRIVE_MAX and the reference company (its MID evidence)
//         reads within one depth of its share of the band; on Muster Barrows (tools/balance-program/redesign/depth-budget) the arriving
//         four, the plain grown four, the strong four on Steady and on Bold read a climb (arriving <= 6, strong >= 16, Bold >= 19). Red on
//         the floor cut two tiers back (arriving depth 9) and on a reading whose middle is the anchor refStep (8). Nothing here caps a
//         company: these read measured holds, they never hold a step back (Tyler 2026-11-23)
//   BD-10 THE SUPPLY GATES KEEP THEIR LEVEL (the designer's ruling 29 section 7 item 10): every tier of core-model.js SUPPLY_GATES is the
//         Level the reference four's measured old career (tools/balance-sim/skill-lines-geometric.json 'party', as measured, frozen when the
//         live lines moved onto the Level clock) first reached the old gate
//         (1 / 15 / 30 / 45 / 60 / 75 / 88): Melee on the hammer, Ranged on the bow, Magic on the mage; a rune's item gate and its spell
//         version read that row, and the store prices it at the made-at Level, never the gate. A RUNG OPENS BY ITS BAND (09 4.16): rung
//         r's gate is capped at band r - 1's gear item Level (20 x (r - 1)), and each metal's whetstone sits on its metal's arrow's rung
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { BAND_ABS } = await imp('src/data/bands.js');
const CM = await imp('src/data/core-model.js');
const XP = await imp('src/core/xp.js');
const { DANGER_GROUNDS, DEPTHS, POWER, BAND_RULE } = await imp('src/data/danger.js');
const { GEAR_STEPS } = await imp('src/data/gear-steps.js');
const { HUNT_INDEX } = await imp('src/data/hunts.js');
const B = await imp('src/core/bands.js');
const SL = await imp('tools/balance-sim/skill-lines.mjs');
const RN = await imp('src/data/runes.js');
const { ITEMS } = await imp('src/data/items.js');
const { depthOf: clientDepth } = await imp('src/session/danger-sections.js');
const { depthOf: edgeDepth } = await imp('src/core/drop-rate.js');

/* --mutate: each rule planted back, each caught (exit 1) by the test that owns it */
if (process.argv.includes('--mutate')) {
  const { plant } = await imp('tests/hunt-core/fixtures/h1.js');
  /* BD-9 reads the band pins and the measured companies: every pin's evidence and the depth-budget runs ride into the plant */
  const evidence = Object.values(JSON.parse(readFileSync(join(ROOT, 'tests', 'danger-band-pins.json'), 'utf8')).grounds).flatMap((p) => p.evidence || []);
  const ALSO = [...new Set(['src/session', 'tools/balance-sim', 'tests/bands.mjs', 'tests/sustain.mjs', 'tests/_is-main.mjs', 'tools/balance-program/redesign/foundations',
    'tests/danger-band-pins.json', 'tools/balance-program/redesign/depth-budget', ...evidence])];
  const MUT = [
    ['tests/bands.mjs', 'a ground inside one tier reads the next tier\'s strong four (29 7.5)', [['src/core/bands.js', 'strong: own ? g.gearLevel : Math.max(', 'strong: false ? g.gearLevel : Math.max(']]],
    ['tests/bands.mjs', 'a ground inside one tier reads a fresh four a tier back (29 7.5)', [['src/core/bands.js', 'fresh: own ? g.gearLevel : Math.max(', 'fresh: false ? g.gearLevel : Math.max(']]],
    ['tests/bands.mjs', 'no ground is ever inside one tier', [['src/core/bands.js', '  const own = g.entryLevel >= g.gearLevel && top < g.gearLevel + T;', '  const own = false;']]],
  /* the controls: each test passes on the clean plant, so a mutant's red is its own and not a file the plant left out (until 2026-11-23
     every planted run died on a missing tests/_is-main.mjs, which tools/balance-sim/skill-lines.mjs imports, so every mutant read caught) */
  ['tests/bands.mjs', 'CONTROL: the clean plant', []],
  ['tests/sustain.mjs', 'CONTROL: the clean plant', []],
  ['tests/bands.mjs', 'the reading\'s middle is the pay anchor, not the reference hold', [['src/core/bands.js', 'm = g ? refHeldOf(groundId) : null;', 'm = g ? g.refStep : null;']]],
  ['tests/bands.mjs', 'refHeldOf ignores the row\'s refHeld', [['src/core/bands.js', 'return g.refHeld === undefined ? g.refStep : g.refHeld;', 'return g.refStep;']]],
  /* the re-cut Muster (floor 565, its arriving four held 587.4 at depth 4): a floor 115 steps back reads that four 7 deep, past ARRIVE_MAX */
  ['tests/bands.mjs', 'Muster\'s floor cut two tiers back', [['src/data/danger.js', 'refStep: 610, floorStep: 520, topStep: 710, refHeld: 605, coinPm: 7700,', 'refStep: 610, floorStep: 450, topStep: 710, refHeld: 605, coinPm: 7700,']]],
  /* the Sewer's reference four holds 65 on its 60 (lane/front-seat: a hold of 64.x cuts refStep 60; lane/refhero-recut: the Mill Cellar's
     four now holds its own refStep, so it carries none) */
  ['tests/bands.mjs', 'a formula ground with no measured hold', [['src/data/danger.js', 'refStep: 60, floorStep: 0, topStep: 135, refHeld: 65, coinPm: 7500,', 'refStep: 60, floorStep: 0, topStep: 135, coinPm: 7500,']]],
  /* (lane/scale-grounds-2) 27 K-6: the strong company leaves in its own base, so the Glade's top (Level 31 in iron) falls under the Warrens' floor */
  ['tests/bands.mjs', 'the strong company never wears the tier ahead (the handover)', [['src/data/bands.js', 'BAND_ABS = Object.freeze({ freshTiersBack: 1, topTiersAhead: 1 });', 'BAND_ABS = Object.freeze({ freshTiersBack: 1, topTiersAhead: 0 });']]],
  /* (lane/monster-roles-ford-wings) a middle at the pay's grain, not its hold's: after the scale-grounds re-cut the Flooded Wing holds on its
     anchor (507.8 to 510), so the plant drops the Bone Wing's refHeld (585 for a hold of 586.5) and its middle falls back to refStep 590;
     (lane/refhero-recut) on the clock's REF_HERO the Bone Wing holds its refStep and the Flooded Wing carries one again (475 for a hold of 474;
     lane/front-seat: 475 for a hold of 476.7 on refStep 480; lane/designer-bd9: 476.2, its top 500 measured free) */
  ['tests/bands.mjs', 'the reading\'s middle at the pay\'s grain', [['src/data/danger.js', 'topStep: 500, refKillsHead: 140, refHeld: 475, coinPm: 3700,', 'topStep: 500, refKillsHead: 140, coinPm: 3700,']]],
  ['tests/bands.mjs', 'depth floors, not half up', [['src/core/bands.js', '(DEPTHS - 1) + span * den) / (2 * span * den));', '(DEPTHS - 1)) / (2 * span * den));']]],
  ['tests/bands.mjs', 'the top wears the base', [['src/core/bands.js', 'Math.min(g.gearLevel + T * BAND_ABS.topTiersAhead, wearableTierLevel(top))', 'g.gearLevel']]],
  /* lane/scale-early-grounds: the strong four wears what its top Level can wear, at the Level its hunt still plays */
  ['tests/bands.mjs', 'the top wears a tier its Level cannot', [['src/core/bands.js', 'Math.min(g.gearLevel + T * BAND_ABS.topTiersAhead, wearableTierLevel(top))', 'g.gearLevel + T * BAND_ABS.topTiersAhead']]],
  ['tests/bands.mjs', 'the top Level past the hunt\'s exit', [['src/core/bands.js', 'return gr && Number.isInteger(gr.endsAtLevel) ? Math.min(top, gr.endsAtLevel - 1) : top;', 'return top;']]],
  ['tests/bands.mjs', 'one gear weight both sides', [['src/core/bands.js', 'const wG = gGap < 0 ? POWER.weightGearBelowPm : POWER.weightGearPm;', 'const wG = POWER.weightGearPm;']]],
  ['tests/bands.mjs', 'the skill weight dropped from the rating', [['src/core/bands.js', 'gGap * wG + sGap * POWER.weightSkillPm', 'gGap * wG']]],
  ['tests/bands.mjs', 'the browser cuts its own depth', [['src/session/danger-sections.js', '  const depth = depthAt(hunt, s);', '  const g = DANGER_GROUNDS[hunt], span = Math.max(1, g.topStep - g.floorStep);\n  const depth = Math.max(1, Math.min(DEPTHS, 1 + Math.round(((s - g.floorStep) / span) * (DEPTHS - 1))));']]],
  ['tests/bands.mjs', 'a skill reads half a Level over the clock', [['src/core/bands.js', '  if (pacePm === 1000) return 1000 * s;', '  if (pacePm === 1000) return 1000 * s + 500;']]],
  ['tests/bands.mjs', 'the pace read upside down', [['src/core/bands.js', '  const want = (pacePm * hoursTo(s)) / 1000;', '  const want = (1000 * hoursTo(s)) / pacePm;']]],
  ['tests/bands.mjs', 'the curve counts the next Level\'s health', [['src/core/xp.js', 'BigInt(refHealthOf(n))', 'BigInt(refHealthOf(n + 1))']]],
  ['tests/bands.mjs', 'a supply gate drifts from the Level the career reached it', [['src/data/core-model.js', 'ranged: Object.freeze([1, 9, 19, 39, 66, 100, 120]),', 'ranged: Object.freeze([1, 9, 19, 39, 60, 100, 120]),']]],
  ['tests/bands.mjs', 'a rung past its band\'s Level (the career\'s 142, not the band\'s 120)', [['src/data/core-model.js', 'ranged: Object.freeze([1, 9, 19, 39, 66, 100, 120]),', 'ranged: Object.freeze([1, 9, 19, 39, 66, 100, 142]),']]],
  ['tests/bands.mjs', 'a rune\'s spell version reads its old skill gate', [['src/data/runes.js', '  return RUNE_TIERS[tier - 1] && Number.isInteger(gates[tier - 1]) ? gates[tier - 1] : Infinity;', '  return RUNE_TIERS[tier - 1] ? RUNE_TIERS[tier - 1].level : Infinity;']]],
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

/* BD-1: the line is the clock */
const S = CM.SKILL_CURVE, H = CM.LEVEL_HOURS, CLOCK = CM.COMBAT_XP_SKILLS;
const hoursByHand = (L) => (H.ceiling * L * L) / ((L + H.half) * (L + H.early));
const toByHand = (L) => { let h = 0; for (let l = 1; l < L; l++) h += hoursByHand(l); return h; };
for (const skill of CLOCK) {
  for (const v of [1, 2, 10, 30, 60, 100, 175, 400, 1000]) ok(B.skillLevelPm(skill, v) === 1000 * v, 'BD-1 ' + skill + ' ' + v + ' does not read Level ' + v + ' at pace ' + S.pacePm);
}
for (const pace of [800, 1250]) {
  for (const v of [5, 30, 60, 175]) {
    const want = (pace * toByHand(v)) / 1000;
    let L = 1;
    while (toByHand(L + 1) <= want) L++;
    const byHand = 1000 * L + Math.round((1000 * (want - toByHand(L))) / hoursByHand(L));
    ok(Math.abs(B.skillLevelPm('melee', v, pace) - byHand) <= 1, 'BD-1 at pace ' + pace + ' skill ' + v + ' reads ' + B.skillLevelPm('melee', v, pace) + ', the clock by hand ' + byHand);
  }
}
for (const n of [1, 2, 5, 10, 30, 60, 100, 175, 400, 1000, 5000]) {
  const step = XP.skillXpForLevel('melee', n + 1) - XP.skillXpForLevel('melee', n), rate = S.xpPerHealthHour * CM.refHealthOf(n);
  ok(Math.abs(step - (S.pacePm / 1000) * hoursByHand(n) * rate) < 1, 'BD-1 skill level ' + n + ' costs ' + step + ' XP, the clock ' + (S.pacePm / 1000) * hoursByHand(n) * rate);
}

/* BD-2 */
for (const skill of CLOCK) {
  let last = -Infinity;
  for (let v = -3; v <= 320; v++) { const x = B.skillLevelPm(skill, v); ok(x >= last, 'BD-2 ' + skill + ' falls at ' + v); last = x; }
  ok(B.skillLevelPm(skill, 0) === 1000 && B.skillLevelPm(skill, -7) === 1000, 'BD-2 ' + skill + ' under 1 is not Level 1');
}
ok(B.skillLevelPm(CM.FLAME_SKILL_CURVE.skill, 50) === null && B.skillLevelPm('mining', 50) === null && B.skillLevelPm('melee', 'x') === null,
  'BD-2 Inner Flame, a capped skill or a value that is not a number reads a Level');

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
  ok(JSON.stringify(B.companyKits(g, top)) === JSON.stringify({ own: insideOf(g, top), fresh: insideOf(g, top) ? g.gearLevel : Math.max(0, g.gearLevel - T * BAND_ABS.freshTiersBack), strong: strongKit(g, top) }), 'BD-4 ' + id + ' companyKits ' + JSON.stringify(B.companyKits(g, top)) + ' is not the rule by hand');
  ok(Number.isInteger(g.refLevel) && g.refLevel >= band[0] && g.refLevel <= band[1], 'BD-4 ' + id + ' refLevel ' + g.refLevel + ' outside its Level band ' + band);
}
/* ...and the company rule on rows no scale ground carries yet (BD-4 by hand, so a rule no shipped band binds still bites): a Level 18 top
   on an item Level 20 base can wear 20, not 40; a Level 60 top wears the tier ahead; a band inside its own tier wears it at both ends */
for (const [row, top, want] of [[{ entryLevel: 8, gearLevel: 20 }, 18, { own: false, fresh: 0, strong: 20 }], [{ entryLevel: 45, gearLevel: 40 }, 60, { own: false, fresh: 20, strong: 60 }],
  [{ entryLevel: 5, gearLevel: 0 }, 15, { own: true, fresh: 0, strong: 0 }], [{ entryLevel: 25, gearLevel: 20 }, 35, { own: true, fresh: 20, strong: 20 }]]) {
  ok(JSON.stringify(B.companyKits(row, top)) === JSON.stringify(want), 'BD-4 companyKits(' + JSON.stringify(row) + ', ' + top + ') reads ' + JSON.stringify(B.companyKits(row, top)) + ', the rule ' + JSON.stringify(want));
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
    if (p.gearLevel !== g.gearLevel - T || p.gearLevel < T) continue;
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

/* BD-10 */
{
  /* the OLD careers (tools/balance-sim/skill-lines-geometric.json, frozen): the live snapshot is re-measured on the Level clock (lane/refhero-recut,
     12-targets 8.5 item 2), and the gates keep the Levels those careers gave them, so they read the measurement they were derived from */
  const OLD = [1, 15, 30, 45, 60, 75, 88], snap = SL.loadLines(join(ROOT, 'tools', 'balance-sim', 'skill-lines-geometric.json'));
  ok(!!snap && SL.madeOn(snap) === 'geometric' && SL.madeOn(SL.loadLines()) === 'time', 'BD-10 the gates\' provenance is not the frozen geometric careers beside a live snapshot on the clock');
  const firstAt = (style, k, n) => { for (let L = 1; L <= 1000; L++) if (SL.skillsAt(snap, 'party', style, L, SL.AS_MEASURED)[k] >= n) return L; return null; };
  for (const [k, style] of [['melee', 'hammer'], ['ranged', 'bow'], ['magic', 'mage']]) {
    /* A RUNG OPENS BY ITS BAND (09 4.16): rung i + 1 is band i's supply, so its gate is the career's Level capped at that band's gear item
       Level (tierSteps x i) */
    CM.SUPPLY_GATES[k].forEach((g, i) => {
      const want = Math.min(firstAt(style, k, OLD[i]), Math.max(1, GEAR_STEPS.tierSteps * i));
      ok(g === want, 'BD-10 ' + k + ' tier ' + (i + 1) + ' gates at ' + g + ', not ' + want + ' (the ' + style + ' career reached ' + OLD[i] + ' at Level ' + firstAt(style, k, OLD[i]) + ', band ' + i + '\'s gear is item Level ' + GEAR_STEPS.tierSteps * i + ')');
    });
  }
  /* THE STONE SITS ON ITS ARROW'S RUNG (09 4.16): a metal's whetstone is its metal's arrow's rung, gated by the Melee row there */
  for (const [arrow, stone] of [['barbed_arrows', 'iron_whetstone'], ['steel_arrows', 'steel_whetstone'], ['mithril_arrows', 'mithril_whetstone'], ['rune_arrows', 'rune_whetstone'], ['emberhead_arrows', 'ember_whetstone'], ['dawnpoint_arrows', 'dawn_whetstone']]) {
    ok(ITEMS[stone] && ITEMS[stone].tier === ITEMS[arrow].tier && ITEMS[stone].reqLv === CM.SUPPLY_GATES.melee[ITEMS[stone].tier - 1], 'BD-10 ' + stone + ' is not on ' + arrow + '\'s rung (' + (ITEMS[stone] && ITEMS[stone].tier) + ' against ' + ITEMS[arrow].tier + ') at its Melee gate');
  }
  for (let t = 1; t <= RN.RUNE_TIERS.length; t++) {
    ok(RN.versionLevel(t) === CM.SUPPLY_GATES.magic[t - 1] && RN.versionLevel(t, 'melee') === CM.SUPPLY_GATES.melee[t - 1], 'BD-10 a tier ' + t + ' spell version does not read its skill gate');
    ok(ITEMS[RN.runeId('fire', t)].reqLv === CM.SUPPLY_GATES.magic[t - 1] && ITEMS[RN.runeId('fire', t)].madeLv === RN.RUNE_TIERS[t - 1].level, 'BD-10 the tier ' + t + ' Fire Rune gate or made-at Level is off');
  }
  ok(ITEMS.rune_arrows.reqLv === CM.SUPPLY_GATES.ranged[4] && ITEMS.rune_arrows.madeLv === 60 && ITEMS.mithril_whetstone.reqLv === CM.SUPPLY_GATES.melee[3], 'BD-10 an ammo row does not read the clock gate');
}

if (fails.length) { console.error('✗ bands: ' + fails.length + ' failing\n  ' + fails.slice(0, 30).join('\n  ')); process.exit(1); }
console.log('✓ bands: BD-1..10 (' + Object.keys(DANGER_GROUNDS).length + ' scale grounds, the skill line on the Level clock, one depth for the browser and the edge, the reading\'s middle a measured hold, an ordinary climb reads right)');
