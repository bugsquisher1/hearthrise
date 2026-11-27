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
//   town-values      every town move measured, every town lends a move, a pick that lends nothing refused not_offered (spend, saved build)
//   engine-rows      the cast path reads the hero's modified rows (cooldown, hold, reach); a build's conditional row holds only on its condition
//   real-settle-both-paths  the real settle grants a build (heroSetup -> member -> syncUnit), and 10-minute and 100-second windows agree
//   borrow-rules     a borrowed move (19 L6, 17 section 3): its heal on Mend's clock, Magic at Mend's rate, an ally row's native reach (the
//                    target rule and its conditions' lowest ally), no native unlock; a borrow handed whole (with its price) and a build's alike
//   borrow-both-paths  a borrowed Greater Mend on the real settle (heroSetup -> member -> syncUnit), 10-minute and 100-second windows agree,
//                    and a handed price reaches the boundary
//   no-build-no-change a hero with no build writes no field and reads the shared rows (the switch off plays as before)
//
// mutant-anchors: src/core/talents.js src/core/hunt/talent-rows.js src/core/hunt/abilities.js src/core/hunt/targeting.js src/core/hunt/auras.js src/core/member.js src/core/hunt/cast-targets.js src/core/hunt/conditions.js src/core/hunt-spawn.js
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
  M.CM = await imp('src/data/condition-metrics.js');
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
    if (M.TD.TALENT_RULES.pointFrom !== 2 || T.vowSlotsAt(29) !== 0 || T.vowSlotsAt(50) !== 2) return 'the vow slots: ' + M.TD.TALENT_RULES.vowSlots;
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
    if (!sh.when.some((r) => r.key === 'last_stand' && r.when === 'near_fall') || !sh.ledger.some((r) => r.key === 'vow.last_stand')) return 'a Shield vow did nothing on a shield';
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
    /* the table on one method (lane/roads-v0-remeasure, 18 section 7): Shelter 1.4 free at a border, opening at the floor */
    if (!sh || sh.penaltyPm !== 0 || sh.opensAt !== 20) return 'Shelter at a border: ' + JSON.stringify(sh);
    if (!(M.TD.BORROW_VALUES.greater_mend > 20) || T.borrowBand('greater_mend', 'border') !== null) return 'Greater Mend is offered before V4 (measured past the last band)';
    if (T.borrowBand('protective_ward', 'havora') !== null) return 'Protective Ward is offered at Havora';
    if (T.borrowBand('protective_ward', 'border').opensAt !== 140 || T.borrowBand('fireball', 'border').opensAt !== 60) return 'the table\'s Levels moved';
    const b = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true, 'challenge.x1': 'long_hold', 'border.shield_restoration.town': 'use_shelter', havora: 'use_fireball' };
    if (T.grantsOf(b, 'restoration', 19).borrowed.includes('shelter')) return 'Shelter opened before Level 20';
    const g20 = T.grantsOf(b, 'restoration', 20);
    if (!g20.borrowed.includes('shelter') || (g20.mods.shelter && g20.mods.shelter.penaltyPm)) return 'Shelter at 20: ' + JSON.stringify(g20);
    if (T.grantsOf(b, 'shield', 200).borrowed.includes('shelter')) return 'a native move counted as borrowed';
    if (T.grantsOf(b, 'restoration', 39).borrowed.includes('fireball')) return 'Fireball through Havora opened before Level 40';
    const fb = T.grantsOf(b, 'restoration', 60);
    if (!fb.borrowed.includes('fireball') || fb.mods.fireball.penaltyPm !== 300) return 'Fireball through Havora: ' + JSON.stringify(fb);
    const row = M.TR.moddedRow(M.AB.ABILITIES.fireball, fb.mods.fireball);
    if (row.hitPm !== Math.floor((M.AB.ABILITIES.fireball.hitPm * 700) / 1000)) return 'the penalty did not reach what it lands: ' + row.hitPm;
    return null;
  },
  /* EVERY TOWN LENDS A MEASURED MOVE (lane/roads-borrow-values; 17 section 3): a hero spends a point on a border town to reach its hybrid,
     so a town move with no measured V0 is a point that buys nothing. Every move a town names has a measured value (validate refuses a row
     that is not one), every town lends at least one move at a border, and a pick that lends nothing (no band: Greater Mend past the last
     one until V4) is refused not_offered at the spend, before the points (the server's order), and in a saved build */
  'town-values': (M) => {
    const TD = M.TD, T = M.T;
    const towns = TD.TALENT_NODES.filter((n) => n.kind === 'border');
    if (towns.length !== TD.BORDERS.length) return towns.length + ' towns for ' + TD.BORDERS.length + ' borders';
    for (const n of towns) {
      const moves = n.options.map((o) => (o.effects.find((e) => e.kind === 'borrow') || {}).move);
      for (const m of moves) {
        const v = Object.prototype.hasOwnProperty.call(TD.BORROW_VALUES, m) ? TD.BORROW_VALUES[m] : undefined;
        if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) return n.id + ': ' + m + ' has no measured value (' + v + ')';
      }
      if (!moves.some((m) => T.borrowBand(m, 'border'))) return n.id + ' lends nothing: ' + moves.join(', ');
    }
    if (!TD.validate(TD.TALENT_NODES, { values: { ...TD.BORROW_VALUES, rend: null } }).some((s) => /rend has no measured V0/.test(s))) return 'validate passed an unmeasured town move';
    /* A SIDE THAT GETS NOTHING: a hero of one of the town's two countries for whom every move it names is its own weapon's or not offered
       still pays a point for nothing. OPEN with the designer (CONFLICTS 2026-11-23, lane/roads-borrow-values): a list that
       only shrinks (a new one is red; one that now lends is taken off). lane/roads-wave3 took two off: Club · Dual Axe lends the axes
       Stagger, Sword · Club lends the sword Stagger */
    const NOTHING = ['border.shield_restoration.town:shield', 'border.destruction_restoration.town:destruction'];
    const nothing = [];
    for (const n of towns) for (const d of n.countries) {
      const moves = n.options.map((o) => (o.effects.find((e) => e.kind === 'borrow') || {}).move);
      if (!moves.some((m) => !M.AB.ABILITIES[m].disciplines.includes(d) && T.borrowBand(m, 'border'))) nothing.push(n.id + ':' + d);
    }
    const grew = nothing.filter((s) => !NOTHING.includes(s)), stale = NOTHING.filter((s) => !nothing.includes(s));
    if (grew.length) return 'a town lends nothing to a hero of one of its countries: ' + grew.join(', ');
    if (stale.length) return 'a town side now lends: take it off NOTHING: ' + stale.join(', ');
    const b = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true, 'challenge.x1': 'long_hold' };
    const town = 'border.shield_restoration.town';
    if (T.borrowBand('greater_mend', 'border') !== null) return 'Greater Mend is offered at a border: no town pick lends nothing to try';
    if (T.spendProblem(b, town, 'use_greater_mend', 60) !== 'not_offered') return 'a town pick that lends nothing answered ' + T.spendProblem(b, town, 'use_greater_mend', 60);
    if (T.spendProblem(b, town, 'use_greater_mend', 5) !== 'not_offered') return 'not_offered is asked after the points: ' + T.spendProblem(b, town, 'use_greater_mend', 5);
    if (T.spendProblem(b, town, 'use_shelter', 60) !== null) return 'the town\'s lending pick was refused: ' + T.spendProblem(b, town, 'use_shelter', 60);
    if (!T.buildProblems({ ...b, [town]: 'use_greater_mend' }, 60).some((p) => p.node === town && p.why === 'not_offered')) return 'a saved build kept a town pick that lends nothing';
    if (T.buildProblems({ ...b, [town]: 'use_shelter' }, 60).length) return 'a saved build with a lending pick reads ' + JSON.stringify(T.buildProblems({ ...b, [town]: 'use_shelter' }, 60));
    return null;
  },
  /* THE WHOLE MAP (lane/roads-countries; 17 sections 4 to 7): every weapon a country, every live move a road but the two 17 and 23 retire
     (Quarry Blow, replaced by Stagger in wave 3; Undertow, cut), four vows a country, every border row its town, hybrid and vow, and a
     shared move's road walked by every weapon that casts it (a Shield hero reaches Power Strike's road in Sword, 17 section 13) */
  'whole-map': (M) => {
    const TD = M.TD, T = M.T, AB = M.AB;
    const RETIRED = ['quarry_blow', 'undertow'];
    for (const d of AB.DISCIPLINE_IDS) if (!TD.COUNTRY_ROADS[d] || !TD.COUNTRY_ROADS[d].length) return 'weapon ' + d + ' has no country';
    for (const m of Object.keys(AB.ABILITIES)) {
      const has = TD.TALENT_NODES.some((n) => n.move === m && n.kind === 'crossroads');
      if (RETIRED.includes(m) ? has : !has) return 'move ' + m + (has ? ' is retired but has a road' : ' has no road');
    }
    for (const d of AB.DISCIPLINE_IDS) {
      const vows = TD.TALENT_NODES.filter((n) => n.kind === 'vow' && n.country === d).length;
      if (vows !== 4) return 'country ' + d + ' has ' + vows + ' vows of 4';
    }
    for (const [a, b] of TD.BORDERS) for (const k of ['border', 'hybrid', 'vow']) {
      if (!TD.TALENT_NODES.some((n) => n.kind === k && n.countries && n.countries.includes(a) && n.countries.includes(b))) return 'border ' + a + ' · ' + b + ' has no ' + k;
    }
    for (const d of AB.DISCIPLINE_IDS) for (const m of AB.disciplineAbilities(d)) {
      if (RETIRED.includes(m) || !TD.NODE_INDEX[m + '.x2']) continue;
      if (!T.suggestedOrder(d, 'party').some(([id]) => id === m + '.x2')) return d + ' casts ' + m + ' but never walks its road';
    }
    return null;
  },
  /* A BAR CAN TEST WHAT A ROAD LAYS (lane/roads-wave3): every status a Roads option, waystone or vow lays on a monster (a reaction's status, a
     mod's second status) is one the bar's effect picker offers (condition-metrics.js EFFECT_IDS, the server's catalogue), so a hero who
     took Breaking Strike can write "my target lacks Armor Break" once and never time it by hand. A ground patch is no effect a unit holds */
  'bar-can-test': (M) => {
    const laid = new Set();
    for (const n of M.TD.TALENT_NODES) for (const fx of [n.effects || [], ...(n.options || []).map((o) => o.effects)]) for (const e of fx) {
      if (e.kind === 'react' && e.do === 'status') laid.add(e.status);
      if (e.kind === 'mod' && e.also) laid.add(e.also);
    }
    if (!laid.size) return 'no Roads option lays a status: nothing read';
    const missing = [...laid].filter((s) => !M.CM.EFFECT_IDS.includes(s));
    return missing.length ? 'a road lays a status the bar cannot test: ' + missing.join(', ') : null;
  },
  /* EVERY NODE LANDS (17 section 9: "no dead nodes"): each mod names a field its move's row reads (outPm on a row that lands something, a
     status's time, strength and second status on a row with a status, a ring's reach on a ring, an area's side on an area, a heal's or a
     shell's pieces on a heal or a shell, the Challenge's on the Challenge), each reaction's `of` a move that lands blows, each cast window
     a move that exists. A field the row never reads is a dead pick */
  'every-node-lands': (M) => {
    const A = M.AB.ABILITIES;
    const lands = (r) => ['hitPm', 'healPm', 'shieldPm', 'healHpPm'].some((k) => Number.isInteger(r[k]));
    const support = (r) => M.AB.heals(r) || M.AB.shells(r);
    const shape = (r) => ['area', 'line', 'ring'].includes(r.target);
    const READS = {
      outPm: lands, statusMs: (r) => !!r.status, statusPm: (r) => !!r.status, also: (r) => !!r.status, windupSlowPm: (r) => !!r.status,
      r: (r) => r.target === 'ring', maxHits: (r) => Number.isInteger(r.maxHits), radius: (r) => Number.isInteger(r.radius),
      side: (r) => r.target === 'area', ground: shape, pick: (r, v) => (v === 'target' ? shape(r) : r.target === 'ally' || r.target === 'party'),
      extra: (r) => r.target === 'ally', range: (r) => r.target === 'ally', limit: (r) => r.target === 'party', refund: (r) => r.target === 'ally' && M.AB.shells(r),
      holdMs: (r) => r.target === 'taunt', tauntRadius: (r) => r.target === 'taunt', holdAll: (r) => r.target === 'taunt',
      overShieldPm: (r) => M.AB.heals(r), healOfShieldPm: (r) => M.AB.shells(r), manaBackNearPm: (r) => M.AB.heals(r),
      hotMs: (r) => M.AB.heals(r), hotPm: (r) => M.AB.heals(r), hotAll: (r) => M.AB.heals(r), alsoPm: (r) => M.AB.heals(r), alsoPick: (r) => M.AB.heals(r),
      cleanse: (r) => M.AB.heals(r), manaToHealedPm: (r) => M.AB.heals(r), solo: (r) => !!r.party,
      cdMs: () => true, cdPm: () => true, mana: () => true, manaPm: () => true, manaOnCastPm: () => true,
    };
    for (const k of ['nearFallPm', 'notNearFallPm', 'frontPm', 'backPm', 'selfPm', 'othersPm', 'tankPm', 'tauntingPm', 'onWindupPm']) READS[k] = support;
    const groups = { '*heal': (r) => M.AB.heals(r), '*spell': (r) => M.AB.abilitySkill(r) === 'magic' && r.mana > 0 };
    for (const n of M.TD.TALENT_NODES) {
      const lists = [...(n.options || []).map((o) => [o.id, o.effects]), ...(n.effects ? [[null, n.effects]] : [])];
      for (const [pick, fx] of lists) for (const e of fx) {
        const at = n.id + (pick ? ':' + pick : '') + ' ';
        if (e.kind === 'mod') {
          const rows = groups[e.move] ? Object.values(A).filter(groups[e.move]) : [A[e.move]];
          for (const f of Object.keys(e)) {
            if (f === 'kind' || f === 'move') continue;
            if (!READS[f]) return at + 'mod field ' + f + ' has no reader in this check';
            if (!rows.some((r) => r && READS[f](r, e[f]))) return at + e.move + ' never reads ' + f;
          }
        } else if (e.kind === 'react') {
          if (e.of && !(A[e.of] && lands(A[e.of]) && !M.AB.heals(A[e.of]))) return at + 'reacts to ' + e.of + ', which lands no blow';
          if ((e.do === 'cast' || e.do === 'reset') && e.move !== '*heal' && !A[e.move]) return at + e.do + ' names no move';
        } else if (e.kind === 'step' || e.kind === 'heal_in') {
          const m = e.when && /^cast:([a-z_]+):/.exec(e.when);
          if (m && !A[m[1]]) return at + 'a cast window on no move ' + m[1];
        }
      }
    }
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
  /* A BORROWED MOVE'S RULES (lane/e5-borrowing; 19 L6, 17 section 3; src/core/hunt/talent-rows.js lend): a heal on Mend's clock (one
     cooldown, casting either starts it), Magic at Mend's rate, an ally row's native reach in its target rule and its conditions' "lowest
     ally", no native unlock; the one borrow list either path hands (a build's grants, a borrow handed whole with its price) */
  'borrow-rules': (M) => {
    const S = M.hs ? M.hs : M.spawn, TR = M.TR, A = M.AB.ABILITIES;
    const mend = A[M.TD.BORROW_RULES.clock];
    if (!mend || !mend.universal || !M.AB.heals(mend) || !(A[M.TD.BORROW_RULES.rate].magicXpMult > 0)) return 'BORROW_RULES names no universal heal with a Magic rate';
    /* nothing borrowed: the grants' own object, or none */
    const g = M.T.grantsOf({ 'challenge.r1': true }, 'shield', 60);
    if (TR.lentModsOf(null, [], null) !== null || TR.lentModsOf(g.mods, [], null) !== g.mods) return 'a hero that borrows nothing read new modifiers';
    /* the row as the borrower casts it */
    const hero = S.heroSetup({ weaponType: 'sword', options: {}, bar: null, borrowed: ['greater_mend', { move: 'shelter', penaltyPm: 300 }] });
    if (hero.borrowed.join() !== 'greater_mend,shelter' || !hero.lentPm || hero.lentPm.shelter !== 300 || 'greater_mend' in hero.lentPm) return 'heroSetup lost a handed borrow or its price: ' + JSON.stringify(hero);
    const k = H(M, 1, 3, 3, 'melee_dps', { hp: 90, maxHp: 200, mana: 900, maxMana: 900 });
    TR.syncTalents(k, hero, 60);
    const gm = TR.rowFor(k, 'greater_mend'), sh = TR.rowFor(k, 'shelter');
    if (!gm.replaces || gm.replaces.join() !== mend.id) return 'a borrowed heal keeps its own clock: ' + JSON.stringify(gm.replaces);
    if (gm.magicXpMult !== mend.magicXpMult || A.greater_mend.magicXpMult === mend.magicXpMult) return 'a borrowed spell pays Magic at ' + gm.magicXpMult;
    if (gm.reach !== M.roleData.HUNT_ROLES.healer.range) return 'a borrowed ally heal reaches ' + gm.reach + ', not its healer\'s ' + M.roleData.HUNT_ROLES.healer.range;
    if (sh.unlock !== undefined || A.shelter.unlock === undefined || sh.reach !== undefined) return 'a borrowed Shelter kept its native unlock, or a party row took a reach';
    if (sh.shieldPm !== Math.floor((A.shelter.shieldPm * 700) / 1000) || gm.healPm !== A.greater_mend.healPm) return 'a handed price missed its move: ' + sh.shieldPm + ' ' + gm.healPm;
    /* THE HEAL RULE AND THE REACH, cast: an ally at 5 tiles under 80%, the borrower itself under 50% */
    const play = (bar, healer) => {
      const u = H(M, 1, 3, 3, healer ? 'healer' : 'melee_dps', { hp: 90, maxHp: 200, mana: 900, maxMana: 900 });
      const ally = H(M, 2, 8, 3, 'tank', { hp: 80, maxHp: 200 });
      if (!healer) TR.syncTalents(u, hero, 60);
      const inst = fight(M, [u, ally], { leader: 1 });
      const slot = (id, cond, own) => ({ id: 's_' + id, join: 'and', conditions: cond || [], action: { id, type: 'ability', ...(own ? { own, onEmpty: 'store' } : {}) } });
      const slots = bar.map((id) => (id === 'greater_mend' ? slot(id, [{ op: 'lt', value: 80, metric: 'ally_hp_pct', subject: 'lowest' }], ['chalked_water_rune']) : slot(id)));
      const hs = M.AR.newHuntSession({ id: 'tl', huntFromMs: 0, bag: { chalked_water_rune: { loaded: 50 } }, basics: {}, purse: 0, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch' });
      inst.heroes = { 1: { hs, actionSet: 'hunt', range: healer ? 7 : 1, slots: M.conditions.heroSlots(slots, null) } };
      const casts = [];
      for (const at of [0, 1000, 2000, 3000, 6000]) {
        const sc = sc2(M, 1, at);
        M.abilities.castAbilities(inst, sc);
        for (const e of sc.events) if (e.type === 'cast') casts.push([at, e.ability, e.t, e.magicXpMult, e.took || null]);
        u.hp = 90; ally.hp = 80;
      }
      return { casts, u };
    };
    const lent = play(['greater_mend', 'mend']);
    const first = lent.casts[0];
    if (!first || first[1] !== 'greater_mend' || first[2] !== 2) return 'the borrowed Greater Mend did not heal the ally 5 tiles off first: ' + JSON.stringify(lent.casts);
    if (first[3] !== mend.magicXpMult || first[4] !== mend.id) return 'the cast paid ' + first[3] + ' and took ' + first[4];
    if (lent.casts.map((c) => c[0]).join() !== '0,6000') return 'a heal cast inside Mend\'s clock: ' + JSON.stringify(lent.casts);
    const mendFirst = play(['mend', 'greater_mend']);
    if (mendFirst.casts.map((c) => c[0] + ':' + c[1]).join() !== '0:mend,6000:mend') return 'Mend\'s cast did not start the borrowed heal\'s clock: ' + JSON.stringify(mendFirst.casts);
    /* the healer's own Greater Mend keeps its own 2 s clock and its own rate */
    const own = play(['greater_mend', 'mend'], true);
    if (!own.casts.some((c) => c[0] === 2000 && c[1] === 'greater_mend') || own.casts[0][3] !== A.greater_mend.magicXpMult) return 'the native Greater Mend took the borrow\'s rules: ' + JSON.stringify(own.casts);
    /* THE ROADS' PATH: a build's town lends Shelter to a healer, lent there too */
    const b = { 'challenge.r1': true, 'challenge.r2': true, 'challenge.r3': true, 'challenge.x1': 'long_hold', 'border.shield_restoration.town': 'use_shelter' };
    const built = S.heroSetup({ weaponType: 'staff', options: { role: 'healer' }, bar: null, talents: b, level: 20 });
    if (!built.borrowed.includes('shelter')) return 'the build lent no Shelter at Level 20: ' + JSON.stringify(built.borrowed);
    const hk = H(M, 3, 3, 3, 'healer');
    TR.syncTalents(hk, built, 20);
    if (!(hk.moveMods && hk.moveMods.shelter && hk.moveMods.shelter.lent === true) || TR.rowFor(hk, 'shelter').unlock !== undefined) return 'a build\'s borrow is not lent: ' + JSON.stringify(hk.moveMods);
    return null;
  },
  /* THE BORROW ON THE REAL SETTLE, BOTH PATHS (CLAUDE.md §4): a sword's borrowed Greater Mend reaches the engine (heroSetup -> member ->
     syncUnit: its Magic XP moves), and 10-minute and 100-second windows play the same hunt */
  'borrow-both-paths': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'melee_dps'];
    const gmSlot = { id: 's_gm', join: 'and', conditions: [{ op: 'lt', value: 80, metric: 'ally_hp_pct', subject: 'lowest' }],
      action: { id: 'greater_mend', type: 'ability', own: [], store: 'plain_water_rune', onEmpty: 'store' } };
    const go = (lend, windowMs) => P.run('muster_barrows', 60, four, { spanMs: 900000, windowMs, secret: '-4611686018427387904',
      options: () => ({ risk: 'steady', danger: 570 }), ...(lend ? { borrowed: (r, i) => (i === 3 ? lend : null), bar: (r, i) => (i === 3 ? [gmSlot, ...P.refBar('muster_barrows')] : P.refBar('muster_barrows')) } : {}) });
    const sig = (r) => JSON.stringify({ t: r.totals, x: r.heroXp });
    const none = go(null, 600000), closed = go(['greater_mend'], 600000), viewed = go(['greater_mend'], 100000);
    const magic = (r) => (r.heroXp[r.heroes[3]] || {}).magic || 0;
    if (!(magic(closed) > magic(none))) return 'the borrowed Greater Mend never cast on the settle: Magic ' + magic(closed) + ' against ' + magic(none);
    if (sig(closed) !== sig(viewed)) return 'the same borrow settled in 10-minute and 100-second windows played two hunts';
    /* a borrow handed with its price plays at that price (the member carries it to the boundary) */
    if (sig(go([{ move: 'greater_mend', penaltyPm: 500 }], 600000)) === sig(closed)) return 'a borrow at -50% played as one at full power';
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
  { name: 'a town move left unmeasured', case: 'town-values', edits: [['src/data/talents.js', '  rend: 7.1,\n', '  rend: null,\n']] },
  { name: 'validate takes an unmeasured value', case: 'town-values', edits: [['src/data/talents.js', "if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) out.push('borrow '", "if (false) out.push('borrow '"]] },
  { name: 'the spend buys a pick that lends nothing', case: 'town-values', edits: [[T, "  if (!offered(n, pick)) return 'not_offered';\n", '']] },
  { name: 'not_offered asked after the points', case: 'town-values', edits: [[T, "  if (!offered(n, pick)) return 'not_offered';\n", ''],
    [T, "  if (pointsSpent(nodes) + 1 > pointsAt(level)) return 'no_points';\n", "  if (pointsSpent(nodes) + 1 > pointsAt(level)) return 'no_points';\n  if (!offered(n, pick)) return 'not_offered';\n"]] },
  { name: 'a saved build keeps a pick that lends nothing', case: 'town-values', edits: [[T, "    if (!offered(n, v)) out.push({ node: id, why: 'not_offered' });\n", '']] },
  { name: 'a town lends a club hero only its own moves', case: 'town-values', edits: [['src/data/talents.js', "...border('club', 'dual_axe', ['rend', 'stagger'],", "...border('club', 'dual_axe', ['turning_cut', 'stagger'],"]] },
  { name: 'a pick whose move never reads its field', case: 'every-node-lands', edits: [['src/data/talents.js', "[mod('rend', { statusMs: 3000 })]", "[mod('power_strike', { statusMs: 3000 })]"]] },
  { name: 'a reaction on a move that lands no blow', case: 'every-node-lands', edits: [['src/data/talents.js', "{ of: 'turning_cut', pm: 10, to: 'self' }", "{ of: 'challenge', pm: 10, to: 'self' }"]] },
  { name: 'a status a road lays is hidden from the bar', case: 'bar-can-test', edits: [['src/data/statuses.js', "sapped: Object.freeze({ id: 'sapped', name: 'Sapped', key: 'monster_deals_less', durationMs", "sapped: Object.freeze({ id: 'sapped', name: 'Sapped', key: 'monster_deals_less', hidden: true, durationMs"]] },
  { name: 'a wave-3 road left off the map', case: 'whole-map', edits: [['src/data/talents.js', "  club: Object.freeze(['turning_cut', 'stagger']),", "  club: Object.freeze(['turning_cut']),"]] },
  { name: 'a shared road is never walked', case: 'whole-map', edits: [[T, ".flatMap((c) => COUNTRY_ROADS[c].filter((m) => own(ABILITIES, m) && ABILITIES[m].disciplines.includes(discipline)));", ".flatMap(() => []);"]] },
  { name: 'the cast path reads the shared rows', case: 'engine-rows', edits: [['src/core/hunt/abilities.js', '  const ABILITIES = rowsFor(hero);\n', '']] },
  { name: 'the Challenge holds its old time', case: 'engine-rows', edits: [['src/core/hunt/targeting.js', 'm.queued = false; m.holdMs = tauntHold(k); }', 'm.queued = false; m.holdMs = CHALLENGE.holdMs; }']] },
  { name: 'a conditional row always holds', case: 'engine-rows', edits: [[TR, '  for (const r of when) if (holds(inst, u, r.when)) (out || (out = rows.slice())).push(r);', '  for (const r of when) (out || (out = rows.slice())).push(r);']] },
  { name: 'the auras forget the hero\'s rows', case: 'engine-rows', edits: [['src/core/hunt/auras.js', ' ? withTalentRows(inst, unit, auras) : auras;', ' ? auras : auras;']] },
  { name: 'the member drops the build (the settle never grants it)', case: 'real-settle-both-paths', edits: [['src/core/member.js', "        ...(h.talents && typeof h.talents === 'object' ? { talents: h.talents, discipline: h.discipline } : {}),\n", '']] },
  { name: 'a hero whose build went keeps its rows', case: 'no-build-no-change', edits: [[TR, "    for (const k of TALENT_KEYS) if (k !== 'moveMods' && u[k] !== undefined) delete u[k];\n", '']] },
  /* lane/e5-borrowing: each of a borrowed move's rules, both paths that hand one, and the member carrying a handed price */
  { name: 'a borrowed heal keeps its own clock', case: 'borrow-rules', edits: [[TR, '  if (heals(row) && row.id !== LENT_CLOCK && !Array.isArray(row.replaces)) o.replaces = Object.freeze([LENT_CLOCK]);\n', '']] },
  { name: 'a borrowed spell pays its native Magic rate', case: 'borrow-rules', edits: [[TR, '  if (row.magicXpMult > 0) o.magicXpMult = LENT_RATE;\n', '']] },
  { name: 'a borrowed ally heal reaches the holder\'s tile', case: 'borrow-rules', edits: [[TR, '  if (Number.isInteger(reach)) o.reach = reach;\n', '']] },
  { name: 'the target rule reads the holder\'s reach', case: 'borrow-rules', edits: [['src/core/hunt/cast-targets.js', '(Number.isInteger(row.reach) ? Math.max(1, row.reach) : Math.max(1, int(h && h.range) || 1))', 'Math.max(1, int(h && h.range) || 1)']] },
  { name: 'the conditions read the holder\'s reach', case: 'borrow-rules', edits: [['src/core/hunt/conditions.js', 'reaches(cx.inst, cx.u, slotReach(cx), a)', 'reaches(cx.inst, cx.u, cx.h && cx.h.range, a)']] },
  { name: 'a borrowed move keeps its native unlock', case: 'borrow-rules', edits: [[TR, '  if (row.unlock !== undefined) delete o.unlock;\n', '']] },
  { name: 'a borrow handed whole is not lent', case: 'borrow-rules', edits: [[TR, '    const lent = lentModsOf(null, hero && hero.borrowed, hero && hero.lentPm);', '    const lent = null;']] },
  { name: 'a build\'s borrow is not lent', case: 'borrow-rules', edits: [[TR, '  const mods = lentModsOf(g.mods, hero.borrowed, hero.lentPm);', '  const mods = g.mods;']] },
  { name: 'heroSetup drops a handed price', case: 'borrow-rules', edits: [['src/core/hunt-spawn.js', '&& Number.isInteger(b.penaltyPm) && b.penaltyPm > 0 && b.penaltyPm < 1000) lentPm[b.move] = b.penaltyPm;', '&& false) lentPm[b.move] = b.penaltyPm;']] },
  { name: 'the member drops a handed price', case: 'borrow-both-paths', edits: [['src/core/member.js', "        ...(h.lentPm && typeof h.lentPm === 'object' ? { lentPm: h.lentPm } : {}),\n", '']] },
  { name: 'the member drops the borrow list', case: 'borrow-both-paths', edits: [['src/core/member.js', '        ...(Array.isArray(h.borrowed) && h.borrowed.length ? { borrowed: h.borrowed } : {}),\n', '']] },
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
