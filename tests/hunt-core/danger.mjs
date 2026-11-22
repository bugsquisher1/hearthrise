// tests/hunt-core/danger.mjs — THE DANGER SCALE (src/core/hunt/danger.js, lane/v1-climb: the roadmap's probe V1). Run by run-all.mjs.
// One step in place of the three tiers, a climb and a fall back read off each pull's lowest HP, and pulls that wait for the party to be
// ready: hunt state in the one engine, persisted with the world, so the same seed walks the same steps however the settle is cut (a
// viewed hunt and a closed one are the one hunt, CLAUDE.md section 6).
//
//   trace   a two-hero party on the h1 ground plans Steady from step 0 for twelve minutes, cut three ways (one window; 10 s windows;
//           odd cuts), the world through JSON at every cut: the same step trace, digit for digit; every pull's end is a `danger`
//           event whose step is the last one's `to`; the step climbed; a blow landed on a hero lowered some pull's margin.
//   off     the same party with no stance: no `danger` event, the world's risk is '' (a tier hunt plays as before).
//   rule    the climb on one world, pull by pull: two clean pulls climb one step, the next two climb two (the climb doubles), a pull
//           between the stance's thresholds holds and puts the climb back to one, a pull under the trigger falls CLIMB.fallSteps, a
//           pull with a death falls CLIMB.deathSteps, and no fall goes under step 0.
//   ready   the regroup's exit waits for every standing hero at DANGER.readyPm of its max HP, and leaves at the sub-step the last one
//           gets there; off the scale a hurt party leaves at once.
//   scale   the dial: a pull's total health and blow grow by exactly (1 + powerStep) a step and its Level XP by (1 + payStepXp),
//           across every size change (no jump), and the aim and Level stay the row's.
//   mutants each rule planted back, each caught by its own case.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCore, plant, makeReport, member, groundRow, gridOf, world, hero, instOf, subStep, T0 } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
const load = async (root) => {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.danger = await imp('src/core/hunt/danger.js');
  M.dangerData = await imp('src/data/danger.js');
  M.tiers = await imp('src/data/hunt-tiers.js');
  return M;
};

/* A two-hero party walking into an empty instance (the engine opens the world at the first boundary, from the leader's plan). */
function party(M, plan) {
  const ms = [member(M, 'a', { seat: 0, maxHp: 60, hp: 60, maxHit: 12 }), member(M, 'b', { seat: 1, maxHp: 60, hp: 60, maxHit: 12 })];
  if (plan) for (const m of ms) m.hero = { ...m.hero, ...plan };
  return ms;
}
/* Play [T0, T0 + spanMs) cut at `cuts`, the world through JSON at every cut; answers the run's danger events and its last world. */
function play(M, plan, spanMs, cuts) {
  const ground = groundRow(), grid = gridOf(M);
  const members = party(M, plan);
  const ctx = { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('danger', 7, d, i), monsters: M.MONSTERS, ground, grid };
  const edges = [T0, ...cuts.filter((c) => c > T0 && c < T0 + spanMs).sort((a, b) => a - b), T0 + spanMs];
  let w = null, next = T0;
  const events = [];
  for (let i = 1; i < edges.length; i++) {
    w = w ? M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))) : null;
    const r = M.cs.simulateHuntInstance({ world: w, nextSwingAtMs: next, members }, { ...ctx, toMs: edges[i] });
    w = r.world; next = r.nextSwingAtMs;
    events.push(...r.events);
  }
  return { danger: events.filter((e) => e.type === 'danger'), events, world: w };
}

const SPAN = 12 * 60000;
const CASES = {
  trace(M) {
    const plan = { risk: 'steady', danger: 0 };
    const one = play(M, plan, SPAN, []);
    const tens = play(M, plan, SPAN, Array.from({ length: SPAN / 10000 }, (_, i) => T0 + (i + 1) * 10000));
    const odd = play(M, plan, SPAN, [T0 + 7300, T0 + 61000, T0 + 200100, T0 + 333000, T0 + 500000]);
    const a = JSON.stringify(one.danger);
    if (one.danger.length < 6) return 'CONTROL: ' + one.danger.length + ' pulls ended on the scale in twelve minutes';
    if (JSON.stringify(tens.danger) !== a) return 'the step trace moved with 10 s windows: ' + JSON.stringify(tens.danger).slice(0, 160) + ' vs ' + a.slice(0, 160);
    if (JSON.stringify(odd.danger) !== a) return 'the step trace moved with odd cuts: ' + JSON.stringify(odd.danger).slice(0, 160) + ' vs ' + a.slice(0, 160);
    if (JSON.stringify(M.worldstate.encode(odd.world)) !== JSON.stringify(M.worldstate.encode(one.world))) return 'the world after the span moved with the cut';
    for (let i = 1; i < one.danger.length; i++) if (one.danger[i].step !== one.danger[i - 1].to) return 'pull ' + i + ' was made at step ' + one.danger[i].step + ', the last one ended at ' + one.danger[i - 1].to;
    if (one.danger[0].step !== 0) return 'the first pull was made at step ' + one.danger[0].step + ', not the plan\'s 0';
    if (!one.danger.some((e) => e.why === 'climb') || !(one.world.danger > 0)) return 'the step never climbed (' + one.world.danger + '): ' + a.slice(0, 200);
    if (!one.danger.some((e) => e.low < 1000)) return 'no pull\'s margin moved: no blow on a hero was read';
    if (one.world.risk !== 'steady') return 'the world carries the stance ' + JSON.stringify(one.world.risk);
    return null;
  },
  off(M) {
    const r = play(M, null, 4 * 60000, []);
    if (!r.events.some((e) => e.type === 'pull')) return 'CONTROL: nothing was pulled';
    if (r.danger.length) return 'a hunt with no stance ended ' + r.danger.length + ' pulls on the scale';
    return r.world.risk === '' ? null : 'a hunt with no stance opened the world on ' + JSON.stringify(r.world.risk);
  },
  rule(M) {
    const { CLIMB, RISKS } = M.dangerData;
    const st = RISKS.steady, clean = st.cleanPm, between = Math.floor((st.fallPm + st.cleanPm) / 2), under = st.fallPm - 1;
    const w = world(M, []);
    M.danger.openDanger(w, 'steady', 1000);
    const inst = instOf(M, w);
    const sc = subStep(0);
    const steps = [];
    const pull = (low) => { w.low = low; M.danger.pullEnds(inst, sc); steps.push(w.danger); };
    /* two clean pulls climb one, two more climb two; a pull between holds and resets the climb; two clean climb one again */
    for (const low of [clean, 1000, clean, 990, between, clean, clean]) pull(low);
    const want = [1000, 1001, 1001, 1003, 1003, 1003, 1004];
    if (CLIMB.cleanRun !== 2) return 'fixture: the rule case is written for two clean pulls a climb, the data says ' + CLIMB.cleanRun;
    if (JSON.stringify(steps) !== JSON.stringify(want)) return 'the climb walked ' + JSON.stringify(steps) + ', the rule ' + JSON.stringify(want);
    pull(under);
    const fell = 1004 - CLIMB.fallSteps;
    if (w.danger !== fell) return 'a pull under the trigger (' + under + ') left the step at ' + w.danger + ', not ' + fell;
    /* after a fall back: CLIMB.coolPulls clean pulls climb nothing (the party steadies), then the climb starts again at one step and doubles */
    if (!(CLIMB.coolPulls > 0)) return 'fixture: the rule case is written for a cool-down after a fall back, the data says ' + CLIMB.coolPulls;
    for (let i = 0; i < CLIMB.coolPulls; i++) pull(1000);
    if (w.danger !== fell) return 'the party climbed inside its cool-down after a fall back: ' + w.danger;
    for (let i = 0; i < 4; i++) pull(1000);
    if (w.danger !== fell + 3) return 'after its cool-down the climb walked to ' + w.danger + ', not one step then two (' + (fell + 3) + ')';
    pull(0);
    if (w.danger !== fell + 3 - CLIMB.deathSteps) return 'a pull with a death left the step at ' + w.danger + ', not ' + (fell + 3 - CLIMB.deathSteps);
    if (w.risk !== RISKS.steady.afterDeath || RISKS.steady.afterDeath === 'steady') return 'after a death the hunt plays ' + w.risk + ', not the safer ' + RISKS.steady.afterDeath;
    w.danger = 3;
    pull(0);
    if (w.danger !== 0) return 'a fall went under step 0: ' + w.danger;
    const wantWhys = ['hold', 'climb', 'hold', 'climb', 'hold', 'hold', 'climb', 'fall', ...Array(CLIMB.coolPulls).fill('hold'), 'hold', 'climb', 'hold', 'climb', 'death', 'death'].join(',');
    const whys = sc.events.filter((e) => e.type === 'danger').map((e) => e.why).join(',');
    if (whys !== wantWhys) return 'the pulls\' reasons read ' + whys;
    if (w.low !== 1000) return 'the margin was not made whole for the next pull: ' + w.low;
    return null;
  },
  ready(M) {
    const { DANGER } = M.dangerData;
    const run = (risk) => {
      const a = hero(M, 1, 3, 3, { hp: 3, maxHp: 30, regenPm: 1000 }), b = hero(M, 2, 4, 3, { hp: 30, maxHp: 30, regenPm: 1000 });
      const w = world(M, [a, b], { leader: 1, phase: 'regroup', phaseMs: 0, regroupNext: false });
      if (risk) M.danger.openDanger(w, risk, 0);
      const inst = instOf(M, w);
      const sc = subStep(0);
      for (let i = 0; i < 400; i++) {
        sc.atMs = i * 100;
        const before = a.hp;
        M.pullcycle.runPhase(inst, sc);
        if (w.phase !== 'regroup') return { left: i, hpAt: a.hp, before };
      }
      return { left: null, hpAt: a.hp };
    };
    const off = run(null);
    if (off.left !== 0) return 'off the scale a hurt party waited ' + off.left + ' sub-steps to leave its regroup';
    const on = run('steady');
    if (on.left === null) return 'on the scale the regroup never ended (the hurt hero reached ' + on.hpAt + ')';
    const need = Math.ceil((DANGER.readyPm * 30) / 1000);
    if (on.hpAt < need) return 'the party left its regroup with a hero at ' + on.hpAt + ' of 30 (ready is ' + need + ')';
    if (on.before >= need) return 'the party waited past ready: the hero stood at ' + on.before + ' a sub-step before it left';
    return null;
  },
  breakoff(M) {
    const { CLIMB, RISKS } = M.dangerData;
    const run = (risk, low) => {
      const h = hero(M, 1, 12, 3, { hp: 20, maxHp: 30 }), m = M.hunt['world-state'].makeUnit({ id: 2, side: 'mon', kind: 'rat', pocket: 0, alive: true,
        hp: 4, maxHp: 10, target: 1, x: 13, y: 3, fx: 13, fy: 3, home: [14, 3], speed: 2400 });
      const w = world(M, [h, m], { leader: 1, phase: 'fight', routeIdx: 0,
        packs: [{ aggro: true, holder: 1, alive: true }, { aggro: false, holder: null, alive: true }, { aggro: false, holder: null, alive: true }] });
      if (risk) { M.danger.openDanger(w, risk, 200); w.low = low; }
      const sc = subStep(0);
      M.pullcycle.runPhase(instOf(M, w), sc);
      return { w, m, sc };
    };
    const st = RISKS.steady;
    const off = run(null, 0);
    if (off.w.phase !== 'fight' || !off.w.packs[0].aggro) return 'off the scale a pull broke off (' + off.w.phase + ')';
    const held = run('steady', st.fallPm);
    if (held.w.phase !== 'fight') return 'a margin at the trigger (' + st.fallPm + ') broke the pull off';
    const under = run('steady', st.fallPm - 1);
    if (under.w.phase !== 'regroup' || under.w.regroupNext !== false) return 'a hero under the trigger left the party in ' + under.w.phase + ' (regroupNext ' + under.w.regroupNext + '), not resting before the same pocket';
    if (under.w.packs[0].aggro || under.m.target !== null || under.m.hp !== under.m.maxHp) return 'the broken-off pack still fights: aggro ' + under.w.packs[0].aggro + ', target ' + under.m.target + ', HP ' + under.m.hp + '/' + under.m.maxHp;
    if (under.w.danger !== 200 - CLIMB.fallSteps) return 'the break-off left the step at ' + under.w.danger + ', not ' + (200 - CLIMB.fallSteps);
    if (!under.sc.events.some((e) => e.type === 'danger' && e.why === 'fall') || !under.sc.events.some((e) => e.type === 'pack_reset')) return 'the break-off told nobody: ' + JSON.stringify(under.sc.events.map((e) => e.type));
    const dead = run('steady', 0);
    if (dead.w.phase !== 'regroup' || dead.w.danger !== Math.max(0, 200 - CLIMB.deathSteps)) return 'a death in the pull left phase ' + dead.w.phase + ' and step ' + dead.w.danger;
    /* no monster swings once a hero is under the line, even in the sub-step before the break-off */
    const swings = (low) => {
      const h = hero(M, 1, 12, 3, { hp: 20, maxHp: 30 }), m = M.hunt['world-state'].makeUnit({ id: 2, side: 'mon', kind: 'rat', pocket: 0, alive: true,
        hp: 10, maxHp: 10, target: 1, x: 13, y: 3, fx: 13, fy: 3, home: [13, 3], speed: 2400, swingLeftMs: 0 });
      const w = world(M, [h, m], { leader: 1, phase: 'fight', packs: [{ aggro: true, holder: 1, alive: true }, { aggro: false, holder: null, alive: true }, { aggro: false, holder: null, alive: true }] });
      M.danger.openDanger(w, 'steady', 200);
      w.low = low;
      const sc = { ...subStep(0), rng: M.rng.createRng(7) };
      M.damage.resolveAttacks(instOf(M, w), sc);
      return sc.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 2).length;
    };
    if (swings(1000) === 0) return 'CONTROL: the rat beside the hero did not swing';
    if (swings(st.fallPm - 1) !== 0) return 'a monster swung at a party with a hero under the line';
    return null;
  },
  scale(M) {
    const { DANGER } = M.dangerData;
    const g = groundRow({ pockets: [
      { room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 14, y: 3 }, { monster: 'rat', x: 15, y: 4 }, { monster: 'rat', x: 16, y: 4 }] },
      { room: [1, 1, 8, 6], spawns: [{ monster: 'slime', x: 4, y: 3 }, { monster: 'slime', x: 5, y: 3 }] },
      { room: [1, 8, 18, 8], spawns: [{ monster: 'rat', x: 9, y: 8 }, { monster: 'rat', x: 10, y: 8 }, { monster: 'rat', x: 11, y: 8 }] }] });
    const r = 1 + DANGER.powerStep, p = 1 + DANGER.payStepXp;
    const total = (s, k) => { const d = M.danger.dangerDial(g, s); return d.pull[0] * d[k]; };
    let sizes = 0;
    for (let s = 0; s < 900; s++) {
      const a = M.danger.dangerDial(g, s), b = M.danger.dangerDial(g, s + 1);
      if (b.pull[0] !== a.pull[0]) sizes++;
      for (const [k, ratio] of [['hpPm', r], ['dmgPm', r], ['xpPm', p]]) {
        const got = total(s + 1, k) / total(s, k);
        if (Math.abs(got - ratio) > 1e-9) return 'step ' + s + ' to ' + (s + 1) + ': the pull\'s ' + k + ' grew by ' + got + ', not ' + ratio + ' (pull ' + a.pull[0] + ' to ' + b.pull[0] + ')';
      }
      if (b.aimPm !== 1000 || b.lvPm !== 1000) return 'step ' + (s + 1) + ' moves the aim or the Level (' + b.aimPm + ', ' + b.lvPm + ')';
    }
    if (sizes < 2) return 'CONTROL: the pull changed size ' + sizes + ' times in 900 steps';
    const row = M.MONSTERS.rat, d = M.danger.dangerDial(g, 200), at = M.tiers.atTier(row, d);
    if (Math.abs(at.atk - ((row.atk || 1) * d.dmgPm) / 1000) > 1e-9) return 'atTier read the blow as ' + at.atk;
    if (Number.isFinite(row.aim) && at.aim !== row.aim) return 'atTier moved the aim to ' + at.aim;
    if (M.tiers.levelAtTier(40, d) !== 40) return 'levelAtTier moved the Level to ' + M.tiers.levelAtTier(40, d);
    return null;
  },
};

const MUTANTS = [
  { name: 'the step never climbs', case: 'rule', edits: [['src/core/hunt/danger.js', "why = 'climb'; to = from + w.climb;", "why = 'climb'; to = from;"]] },
  { name: 'the climb never doubles', case: 'rule', edits: [['src/core/hunt/danger.js', 'w.climb = Math.min(CLIMB.climbMax, w.climb * 2);', 'w.climb = 1;']] },
  { name: 'a fall back keeps the doubled climb', case: 'rule', edits: [['src/core/hunt/danger.js', 'w.climb = 1; w.clean = 0; w.cool = CLIMB.coolPulls;', 'w.clean = 0; w.cool = CLIMB.coolPulls;']] },
  { name: 'no cool-down after a fall back', case: 'rule', edits: [['src/core/hunt/danger.js', '  if (cooling) w.cool -= 1;\n', '  if (cooling) w.cool = 0;\n']] },
  { name: 'a clean pull in the cool-down counts', case: 'rule', edits: [['src/core/hunt/danger.js', '    if (!cooling) {\n      w.clean += 1;', '    {\n      w.clean += 1;']] },
  { name: 'the fall back ignores the stance\'s trigger', case: 'rule', edits: [['src/core/hunt/danger.js', 'if (low <= 0 || low < st.fallPm) {', 'if (low <= 0) {']] },
  { name: 'a death falls no further than a fall back', case: 'rule', edits: [['src/core/hunt/danger.js', 'to = from - (low <= 0 ? CLIMB.deathSteps : CLIMB.fallSteps);', 'to = from - CLIMB.fallSteps;']] },
  { name: 'the clean run does not survive a settle cut', case: 'trace', edits: [['src/core/hunt/danger.js', "['climb', 'int'], ['clean', 'int'], ['low', 'int'],", "['climb', 'int'], ['low', 'int'],"]] },
  { name: 'the climb does not survive a settle cut', case: 'trace', edits: [['src/core/hunt/danger.js', "['danger', 'int'], ['climb', 'int'], ['clean', 'int'],", "['danger', 'int'], ['clean', 'int'],"]] },
  { name: 'the margin is never read where HP falls', case: 'trace', edits: [['src/core/hunt/damage.js', '  else if (r.dmg > 0) noteHurt(inst, target);\n', '']] },
  { name: 'the engine never opens the plan', case: 'trace', edits: [['src/core/combat-sim.js', '          if (plan) openDanger(world, plan.risk, plan.step);\n', '']] },
  { name: 'a hunt with no stance opens on one', case: 'off', edits: [['src/core/combat-sim.js', 'const riskPick = (ms) => { const lead = ms.find((x) => x.hero.lead === true) || ms[0]; return riskOf(lead && lead.hero); };',
    "const riskPick = (ms) => { const lead = ms.find((x) => x.hero.lead === true) || ms[0]; return riskOf(lead && lead.hero) || { risk: 'steady', step: 0 }; };"]] },
  { name: 'the regroup never waits for readiness', case: 'ready', edits: [['src/core/hunt/danger.js', 'return heroes.every((h) => !h.alive || h.hp * 1000 >= DANGER.readyPm * h.maxHp);', 'return heroes.length >= 0;']] },
  { name: 'readiness is read off the scale too', case: 'ready', edits: [['src/core/hunt/danger.js', '  if (!dangerOn(inst.world)) return true;\n  return heroes.every', '  return heroes.every']] },
  { name: 'a death leaves the stance as it was', case: 'rule', edits: [['src/core/hunt/danger.js', "  if (why === 'death' && own(RISKS, st.afterDeath)) w.risk = st.afterDeath;\n", '']] },
  { name: 'monsters swing on after a hero is under the line', case: 'breakoff', edits: [['src/core/hunt/damage.js', '      if (breaksOff(inst.world)) continue;\n', '']] },
  { name: 'a pull is never broken off', case: 'breakoff', edits: [['src/core/hunt/pull-cycle.js', '    } else if (breaksOff(w)) breakOff(inst, sc);\n', '    }\n']] },
  { name: 'the broken-off pack stays on the party', case: 'breakoff', edits: [['src/core/hunt/pull-cycle.js', '  for (let p = 0; p < w.packs.length; p++) if (w.packs[p].aggro) resetPack(inst, p, sc);\n  for (const h of heroes(inst)) h.target = null;\n', '  for (const h of heroes(inst)) h.target = null;\n']] },
  { name: 'a break-off moves on to the next pocket', case: 'breakoff', edits: [['src/core/hunt/pull-cycle.js', 'w.phase = PHASE.REGROUP; w.phaseMs = HUNT_TUNING.regroupMs; w.regroupNext = false;\n}', 'w.phase = PHASE.REGROUP; w.phaseMs = HUNT_TUNING.regroupMs; w.regroupNext = true;\n}']] },
  { name: 'the break-off waits for the climb threshold', case: 'breakoff', edits: [['src/core/hunt/danger.js', 'world.low < RISKS[world.risk].fallPm;', 'world.low < RISKS[world.risk].cleanPm;']] },
  { name: 'a size change puts a jump in the curve', case: 'scale', edits: [['src/core/hunt/danger.js', 'const share = n0 / pull;', 'const share = 1;']] },
  { name: 'the step raises the aim too', case: 'scale', edits: [['src/core/hunt/danger.js', 'aimPm: 1000, lvPm: 1000,', 'lvPm: 1000,']] },
];

const R = makeReport('hunt-core/danger');
const M = await load(ROOT);
for (const [cn, fn] of Object.entries(CASES)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of MUTANTS) {
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = CASES[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(CASES).length + ' cases, ' + MUTANTS.length + ' mutants caught');
R.finish();
