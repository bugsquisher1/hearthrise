// tests/hunt-core/talents.mjs — THE ROADS SAMPLE: the map as data, the path rules, the caps, the ramp, and the engine reading a build
// (lane/roads-sample, systems, 2026-11-23; docs/design/redesign/17-talent-tree.md v3, 19-power-ledger.md). Run by run-all.mjs.
//
//   map-valid        src/data/talents.js validates against the live moves; every road is 5 stones and 2 crossroads; the map is a tree
//   path-rules       src/core/talents.js spendProblem: reachability, picks, points, the vow Level and slots, a hybrid's two crossroads
//   walk-through     17 section 13: the suggested Shield road at Levels 5, 9, 11, 28; never a vow; the solo plan's own pick
//   ramp-and-caps    numbers x ramp(L), tiles whole; the build slice's clamp (14 x ramp) on the net, a vow's cost never clamped
//   vow-weapon       a vow counts only on its own weapon
//   idle-points      19 row 2: an unspent point, or a rank on a move never cast, costs a third of a step, never ramped
//   borrow-opens     17 section 3: priced by value, opens at max(20, 200 V / 14) rounded up to 10, never a native move, none unmeasured
//   engine-rows      the cast path reads the hero's modified rows (cooldown, hold, reach); a build's conditional row holds only on its condition
//   real-settle-both-paths  the real settle grants a build (heroSetup -> member -> syncUnit), and 10-minute and 100-second windows agree
//   no-build-no-change a hero with no build writes no field and reads the shared rows (the switch off plays as before)
//
// mutant-anchors: src/core/talents.js src/core/hunt/talent-rows.js src/core/hunt/abilities.js src/core/hunt/targeting.js src/core/hunt/auras.js src/core/member.js
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { H, E, inst2, sc2, world } from './fixtures/h2.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.TD = await imp('src/data/talents.js');
  M.T = await imp('src/core/talents.js');
  M.TR = await imp('src/core/hunt/talent-rows.js');
  M.PL = await imp('src/core/power-ledger.js');
  M.AU = await imp('src/core/hunt/auras.js');
  M.AB = await imp('src/data/abilities.js');
  M.roleData = await imp('src/data/hunt-roles.js');
  M.conditions = M.hunt.conditions;
  return M;
}

const near = (a, b) => Math.abs(a - b) < 1e-9;
const session = (M) => M.AR.newHuntSession({ id: 'tl', huntFromMs: 0, bag: {}, basics: {}, purse: 0, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch' });
const barOf = (M, bar) => ({ hs: session(M), actionSet: 'hunt', range: 1, slots: M.conditions.heroSlots(bar, null) });
const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight' }, o || {})));

const cases = {
  'map-valid': (M) => {
    const bad = M.TD.validate(M.TD.TALENT_NODES, { moves: Object.keys(M.AB.ABILITIES) });
    if (bad.length) return 'the map: ' + bad.join('; ');
    /* the validator bites: a node touching nothing earlier, a vow with no cost, a step on a condition the engine never reads */
    const n = M.TD.TALENT_NODES;
    const plant1 = n.map((x) => (x.id === 'challenge.r2' ? { ...x, after: ['shelter.x2'] } : x));
    if (!M.TD.validate(plant1).some((s) => /earlier node/.test(s))) return 'a node after a later one passed';
    const plant2 = n.map((x) => (x.id === 'vow.last_stand' ? { ...x, effects: [x.effects[0]] } : x));
    if (!M.TD.validate(plant2).some((s) => /cost that always bites/.test(s))) return 'a vow with no cost passed';
    const plant3 = n.map((x) => (x.id === 'challenge.w2' ? { ...x, effects: [{ kind: 'step', raises: 'defense', steps: 6, key: 'k', when: 'moon_is_full' }] } : x));
    if (!M.TD.validate(plant3).some((s) => /not a condition/.test(s))) return 'an unread condition passed';
    for (const [c, moves] of Object.entries(M.TD.COUNTRY_ROADS)) for (const m of moves) {
      if (!M.T.suggestedOrder(c === 'hearth' ? 'sword' : c, 'party').some(([id]) => id === m + '.x2')) return 'road ' + m + ' is not on its country\'s suggested order';
    }
    return null;
  },
  'path-rules': (M) => {
    const T = M.T;
    if (T.pointsAt(1) !== 0 || T.pointsAt(2) !== 1 || T.pointsAt(60) !== 59) return 'a point a Level from 2: ' + [1, 2, 60].map(T.pointsAt);
    if (T.spendProblem({}, 'challenge.r2', null, 60) !== 'not_reachable') return 'a stone past an unowned one was bought';
    if (T.spendProblem({}, 'challenge.r1', null, 60) !== null) return 'the first stone off the Hearth was refused: ' + T.spendProblem({}, 'challenge.r1', null, 60);
    if (T.spendProblem({}, 'challenge.r1', null, 1) !== 'no_points') return 'a Level 1 hero spent a point';
    let b = {};
    for (const id of ['challenge.r1', 'challenge.r2', 'challenge.r3']) b = T.spend(b, id, null);
    if (T.spendProblem(b, 'challenge.r1', null, 60) !== 'owned') return 'a stone bought twice';
    if (T.spendProblem(b, 'challenge.x1', 'no_such', 60) !== 'bad_pick') return 'a crossroads took a made-up pick';
    if (T.spendProblem(b, 'challenge.x1', null, 60) !== 'bad_pick') return 'a crossroads took no pick';
    if (T.spendProblem(b, 'challenge.r3', 'long_hold', 60) === null) return 'a stone took a pick';
    b = T.spend(b, 'challenge.x1', 'long_hold');
    if (T.spendProblem(b, 'vow.last_stand', null, 29) !== 'vow_level') return 'a vow before Level 30';
    b = T.spend(b, 'vow.last_stand', null);
    if (T.spendProblem(b, 'vow.hold_fast', null, 49) !== 'vow_slots') return 'a second vow before Level 50';
    if (T.spendProblem(b, 'vow.hold_fast', null, 50) !== null) return 'the second vow refused at Level 50';
    b = T.spend(b, 'border.shield_restoration.town', 'use_shelter');
    if (T.spendProblem(b, 'border.shield_restoration.x', 'guarded_mend', 60) !== 'needs_crossroads') return 'a hybrid with no Restoration crossroads';
    for (const id of ['greater_mend.r1', 'greater_mend.r2', 'greater_mend.r3']) b = T.spend(b, id, null);
    b = T.spend(b, 'greater_mend.x1', 'split_mending');
    if (T.spendProblem(b, 'border.shield_restoration.x', 'guarded_mend', 60) !== null) return 'a hybrid with both crossroads refused';
    b = T.spend(b, 'havora', 'use_fireball');
    if (T.buildProblems(b, 60).length) return 'a legal build reads ' + JSON.stringify(T.buildProblems(b, 60));
    if (!T.buildProblems({ 'shelter.x2': 'long_shelter' }).some((p) => p.why === 'not_reachable')) return 'a saved build with a floating node passed';
    if (!T.buildProblems({ 'no.such': true }).some((p) => p.why === 'unknown_node')) return 'a saved build naming no node passed';
    if (!T.buildProblems(T.spendSuggested({}, 'shield', 'party', 100), 30).some((p) => p.why === 'no_points')) return 'a build past the Level passed at Level 30';
    return null;
  },
  'walk-through': (M) => {
    const T = M.T;
    const at = (L, plan) => T.spendSuggested({}, 'shield', plan || 'party', L);
    if (at(5)['challenge.x1'] !== 'long_hold' || T.pointsSpent(at(5)) !== 4) return 'Level 5: crossroads I is not Long Hold: ' + JSON.stringify(at(5));
    if (at(5, 'solo')['challenge.x1'] !== 'hard_challenge') return 'the solo plan did not take Hard Challenge';
    if (at(9)['challenge.x2'] !== 'mended') return 'Level 9: crossroads II is not Mended';
    if (!at(11)['frost_slam.r1']) return 'Level 11: Frost Slam\'s road did not start';
    const b28 = at(28);
    if (!b28['shelter.w2'] || T.pointsSpent(b28) !== 27) return 'Level 28: the Shield country is not whole';
    for (const L of [30, 50, 200, 400]) if (Object.keys(at(L)).some((k) => k.startsWith('vow.'))) return 'the suggested rule took a vow at Level ' + L;
    if (T.pointsSpent(at(400)) !== T.pointsAt(400) || !(at(400)['challenge.open'] > 0)) return 'past the map the points did not go to the open road';
    const f = T.nextFork({}, 'shield', 'party');
    if (!f || f.id !== 'challenge.x1' || f.cost !== 4 || !f.options.find((o) => o.id === 'long_hold').suggested) return 'the next fork: ' + JSON.stringify(f);
    return null;
  },
  'ramp-and-caps': (M) => {
    const T = M.T;
    const base = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true };
    const g100 = T.grantsOf({ ...base, 'challenge.x1': 'long_hold' }, 'shield', 100);
    if (g100.mods.challenge.cdMs !== 2000 || g100.mods.challenge.holdMs !== 2000) return 'Long Hold at Level 100 (ramp 0.5): ' + JSON.stringify(g100.mods.challenge);
    if (T.grantsOf({ ...base, 'challenge.x1': 'long_hold' }, 'shield', 400).mods.challenge.cdMs !== 4000) return 'past 200 a number is not whole';
    const w = T.grantsOf({ ...base, 'challenge.x1': 'long_hold', 'challenge.w1': true }, 'shield', 20);
    if (w.mods.challenge.tauntRadius !== 1) return 'a tile is a rule, whole from Level 1: ' + JSON.stringify(w.mods.challenge);
    /* the clamp: Hard Challenge (+17) and Last Stand (+18) on defense, Last Stand's -8 on offense */
    const b = { ...base, 'challenge.x1': 'hard_challenge', 'vow.last_stand': true };
    /* the build slice alone (the idle points' own case is idle-points) */
    const rows = (L) => { const g = T.grantsOf(b, 'shield', L); return g.ledger.concat(g.when).filter((x) => x.slice === 'build'); };
    const c60 = M.PL.clampLedger(rows(60), 60), c200 = M.PL.clampLedger(rows(200), 200);
    if (!near(c60.defense, 14 * 0.3) || !near(c200.defense, 14)) return 'the build slice did not clamp at 14 x ramp: ' + c60.defense + ' / ' + c200.defense;
    if (!near(c200.offense, -8) || !near(c60.offense, -8 * 0.3)) return 'the vow\'s cost: ' + c60.offense + ' / ' + c200.offense;
    return null;
  },
  'vow-weapon': (M) => {
    const T = M.T;
    const b = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true, 'challenge.x1': 'long_hold', 'vow.last_stand': true };
    const sh = T.grantsOf(b, 'shield', 200), re = T.grantsOf(b, 'restoration', 200);
    if (!sh.when.some((r) => r.key === 'last_stand') || !sh.ledger.some((r) => r.key === 'vow.last_stand')) return 'a Shield vow did nothing on a shield';
    if (re.when.some((r) => r.key === 'last_stand') || re.ledger.some((r) => r.key === 'vow.last_stand')) return 'a Shield vow counted on a staff';
    return null;
  },
  'idle-points': (M) => {
    const T = M.T;
    const none = T.grantsOf({}, 'shield', 61);
    const c = M.PL.clampLedger(none.ledger, 61);
    if (none.idle !== 60 || !near(c.offense, -60 * 0.333) || !near(c.defense, -60 * 0.333)) return 'sixty unspent points: ' + none.idle + ' ' + JSON.stringify(c);
    const own = T.grantsOf({ 'challenge.r1': true, 'challenge.r2': true }, 'shield', 3);
    if (own.idle !== 0 || own.ledger.length) return 'two stones on a move cast at Level 3 left points idle: ' + own.idle;
    const away = T.grantsOf({ 'greater_mend.r1': true, 'greater_mend.r2': true }, 'shield', 3);
    if (away.idle !== 2) return 'ranks on a move a shield never casts did not count idle: ' + away.idle;
    if (!near(M.PL.clampLedger(T.grantsOf({}, 'shield', 400).ledger, 400).offense, -399 * 0.333)) return 'the idle cost ramps';
    return null;
  },
  'borrow-opens': (M) => {
    const T = M.T;
    const sh = T.borrowBand('shelter', 'border');
    if (!sh || sh.penaltyPm !== 300 || sh.opensAt !== 90) return 'Shelter at a border: ' + JSON.stringify(sh);
    if (T.borrowBand('greater_mend', 'border') !== null) return 'an unmeasured Greater Mend is offered';
    if (T.borrowBand('hoarfrost', 'havora') !== null) return 'Hoarfrost is offered at Havora';
    if (T.borrowBand('hunters_mark', 'border').opensAt !== 30 || T.borrowBand('fireball', 'border').opensAt !== 80) return 'the table\'s Levels moved';
    const b = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true, 'challenge.x1': 'long_hold', 'border.shield_restoration.town': 'use_shelter', havora: 'use_fireball' };
    if (T.grantsOf(b, 'restoration', 89).borrowed.includes('shelter')) return 'Shelter opened before Level 90';
    const g90 = T.grantsOf(b, 'restoration', 90);
    if (!g90.borrowed.includes('shelter') || g90.mods.shelter.penaltyPm !== 300) return 'Shelter at 90: ' + JSON.stringify(g90);
    if (T.grantsOf(b, 'shield', 200).borrowed.includes('shelter')) return 'a native move counted as borrowed';
    const fb = T.grantsOf(b, 'restoration', 60);
    if (!fb.borrowed.includes('fireball') || fb.mods.fireball.penaltyPm !== 500) return 'Fireball through Havora: ' + JSON.stringify(fb);
    const row = M.TR.moddedRow(M.AB.ABILITIES.fireball, fb.mods.fireball);
    if (row.hitPm !== Math.floor(M.AB.ABILITIES.fireball.hitPm / 2)) return 'the penalty did not reach what it lands: ' + row.hitPm;
    return null;
  },
  'engine-rows': (M) => {
    const T = M.T;
    /* the tank's build: Long Hold and the reach waystone at Level 200 (cooldown 12 s, hold 12 s, reach 7) */
    const b = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true, 'challenge.x1': 'long_hold', 'challenge.w1': true };
    const k = H(M, 1, 11, 3, 'tank'); const r = H(M, 2, 16, 5, 'ranger');
    const far = E(M, 3, 0, 11 + M.roleData.CHALLENGE.radius + 1, 3, 2);
    const inst = fight(M, [k, r, far], { leader: 1 });
    M.TR.syncTalents(k, { talents: b, discipline: 'shield' }, 200);
    if (k.tauntHoldMs !== 12000 || k.tauntRadius !== 7) return 'the boundary did not write the hold and reach: ' + k.tauntHoldMs + ' ' + k.tauntRadius;
    inst.heroes = { 1: barOf(M, ['challenge']) };
    const sc = sc2(M, 1);
    M.targeting.chooseTargets(inst, sc); M.abilities.castAbilities(inst, sc);
    if (far.target !== 1) return 'a monster one tile past the old reach was not taken';
    if (far.holdMs !== 12000) return 'the taunt held ' + far.holdMs + ' ms, not 12000';
    if (k.cds.challenge !== 12000) return 'the cast took the shared cooldown: ' + k.cds.challenge;
    /* the conditional row: Hard Challenge's defense holds only while a monster is held on the tank */
    M.TR.syncTalents(k, { talents: { ...b, 'challenge.x1': 'hard_challenge' }, discipline: 'shield' }, 200);
    const held = M.AU.auraRowsOn(inst, k);
    if (!held.some((x) => x.key === 'taunted_less')) return 'a held monster did not raise the holding tank\'s row';
    far.holdMs = 0;
    if (M.AU.auraRowsOn(inst, k).some((x) => x.key === 'taunted_less')) return 'the row held with no taunt';
    /* "for 4 s after a cast": the clock on the instance */
    M.TR.syncTalents(k, { talents: { ...b, 'challenge.x2': 'mended', 'challenge.r4': true, 'challenge.r5': true, 'challenge.w2': true }, discipline: 'shield' }, 200);
    k.cds = { challenge: 12000 };
    inst.atMs = 3900;
    if (!M.AU.auraRowsOn(inst, k).some((x) => x.key === 'taunt_brace')) return 'the brace did not hold 3.9 s after the cast';
    inst.atMs = 4100;
    if (M.AU.auraRowsOn(inst, k).some((x) => x.key === 'taunt_brace')) return 'the brace held past 4 s';
    return null;
  },
  /* THE REAL SETTLE, BOTH PATHS (CLAUDE.md §4: a hunt viewed settles in short windows, a closed one in long ones): a tank's build reaches
     the engine through heroSetup, the member and syncUnit (the idle cost moves the hunt), and the same build cut two ways plays the same */
  'real-settle-both-paths': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'healer'];
    const go = (build, windowMs) => P.run('muster_barrows', 60, four, { spanMs: 900000, windowMs, secret: '-4611686018427387904',
      options: () => ({ risk: 'steady', danger: 570 }), ...(build ? { roads: (r, i) => (i === 0 ? build : null) } : {}) });
    const sig = (r) => JSON.stringify({ t: r.totals, x: r.heroXp });
    const none = sig(go(null, 600000)), banked = sig(go({}, 600000));
    if (none === banked) return 'a tank with sixty idle points played exactly as one with no build: the build never reached the engine';
    const b = M.T.spendSuggested({}, 'shield', 'party', 60);
    const closed = sig(go(b, 600000)), viewed = sig(go(b, 100000));
    if (closed !== viewed) return 'the same build settled in 10-minute and 100-second windows played two hunts';
    return null;
  },
  'no-build-no-change': (M) => {
    const k = H(M, 1, 11, 3, 'tank');
    M.TR.syncTalents(k, { talents: { 'challenge.r1': true }, discipline: 'shield' }, 60);
    M.TR.syncTalents(k, {}, 60);
    for (const f of ['ledger', 'talentWhen', 'moveMods', 'tauntHoldMs', 'tauntRadius']) if (k[f] !== undefined) return 'a hero whose build went kept ' + f;
    if (M.TR.rowsFor(k) !== M.AB.ABILITIES) return 'a hero with no modifier reads a copy of the table';
    const s = M.hs ? M.hs : M.spawn;
    const plain = s.heroSetup({ weaponType: 'sword_shield', options: {}, bar: null });
    if (plain && (plain.talents || plain.discipline)) return 'heroSetup wrote a build that was never handed';
    return null;
  },
};

const T = 'src/core/talents.js';
const TR = 'src/core/hunt/talent-rows.js';
const mutants = [
  { name: 'a stone floats free of the road', case: 'path-rules', edits: [[T, "  if (!n.after.some((a) => owns(nodes, a))) return 'not_reachable';\n", '']] },
  { name: 'a vow before its slot', case: 'path-rules', edits: [[T, ".length + 1 > vowSlotsAt(level)) return 'vow_slots';", ".length + 1 > 3) return 'vow_slots';"]] },
  { name: 'a hybrid without both crossroads', case: 'path-rules', edits: [[T, "!n.needs.crossroadsIn.every((c) => crossroadsIn(nodes, c))) return 'needs_crossroads';", "false) return 'needs_crossroads';"]] },
  { name: 'the suggested pick ignores the plan', case: 'walk-through', edits: [[T, 'list.find((o) => o.suggested === plan) || ', '']] },
  { name: 'the numbers never ramp', case: 'ramp-and-caps', edits: [[T, 'const v = MOD_WHOLE.includes(f) ? r[f] : r[f] * k;', 'const v = r[f];']] },
  { name: 'a vow counts on any weapon', case: 'vow-weapon', edits: [[T, '    if (!wields(n)) continue;\n', '']] },
  { name: 'unspent points cost nothing', case: 'idle-points', edits: [[T, '  if (idle > 0) {\n', '  if (idle < 0) {\n']] },
  { name: 'a borrow opens at once', case: 'borrow-opens', edits: [[T, '    if (!band || L < band.opensAt) continue;', '    if (!band) continue;']] },
  { name: 'a borrow pays no penalty', case: 'borrow-opens', edits: [[TR, "  const f = (1000 + (mod.outPm || 0)) * (1000 - (mod.penaltyPm || 0));", '  const f = (1000 + (mod.outPm || 0)) * 1000;']] },
  { name: 'the cast path reads the shared rows', case: 'engine-rows', edits: [['src/core/hunt/abilities.js', '  const ABILITIES = rowsFor(hero);\n', '']] },
  { name: 'the Challenge holds its old time', case: 'engine-rows', edits: [['src/core/hunt/targeting.js', 'm.queued = false; m.holdMs = tauntHold(k); }', 'm.queued = false; m.holdMs = CHALLENGE.holdMs; }']] },
  { name: 'a conditional row always holds', case: 'engine-rows', edits: [[TR, '  for (const r of when) if (holds(inst, u, r.when)) (out || (out = rows.slice())).push(r);', '  for (const r of when) (out || (out = rows.slice())).push(r);']] },
  { name: 'the auras forget the hero\'s rows', case: 'engine-rows', edits: [['src/core/hunt/auras.js', ' ? withTalentRows(inst, unit, auras) : auras;', ' ? auras : auras;']] },
  { name: 'the member drops the build (the settle never grants it)', case: 'real-settle-both-paths', edits: [['src/core/member.js', "        ...(h.talents && typeof h.talents === 'object' ? { talents: h.talents, discipline: h.discipline } : {}),\n", '']] },
  { name: 'a hero whose build went keeps its rows', case: 'no-build-no-change', edits: [[TR, '  if (!hero || !hero.talents) { for (const k of TALENT_KEYS) if (u[k] !== undefined) delete u[k]; return; }', '  if (!hero || !hero.talents) return;']] },
];

/* the suite: cases on the repo, each mutant on a planted copy must be caught (h1/h2's rule) */
const R = makeReport('talents');
const M0 = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = await fn(M0); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
if (!process.argv.includes('--no-mutants')) for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, ['src/render', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
