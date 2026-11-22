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
//           pull with a death falls CLIMB.deathSteps, and no fall goes under step 0; a pull that cleared nothing (the leash took it home)
//           is never clean (wave 1: every climb is cleared pulls, which the server's time bound reads), but it still falls back.
//   ready   the regroup's exit waits for every standing hero at DANGER.readyPm of its max HP, and leaves at the sub-step the last one
//           gets there; off the scale a hurt party leaves at once.
//   scale   the dial: a pull's total health and blow grow by exactly (1 + powerStep) a step and its coin by (1 + payStepCoin) up to the
//           gap ceiling, across every size change (no jump); a kill's row XP, the aim and the Level stay the row's.
//   pay     (wave 1) PAY BY DEPTH FROM THE HOURS TABLE: hoursForLevel is each span of LEVEL_PACE.targets at its middle and straight between
//           (continuous, never falling); one kill alone at the ground's reference step pays XP to the next Level / (its hours x
//           refKillsHead); a step deeper pays (1 + payStepXp) more, held at PAY.gapMax; and in play every kill's xp event on the scale
//           is that share at the kill's step over the heroes there (no row XP, no party table).
//   down    (wave 1) KILLED STAYS DEAD: a pack row that falls on the scale counts its pack down; a pack broken off with one down is
//           re-pulled as it stands (never re-formed whole), a whole one is re-formed at the step's size, and a respawn stands it up whole.
//   falls   (R2) A FALL BACK NAMES ITS CAUSE: a Bold party far too deep falls back and dies; each fall and death names the seat of the
//           hero that broke the pull off and the monster kind whose blow did it, the same in one window, every 2 s swing and odd cuts,
//           and the analyzer reports folded window by window hold the same falls and deepest step for every hero.
//   floor   (lane/r9) THE PAY FLOOR: under the reference step a kill pays down to PAY.floor of the table and never less, XP and coin.
//   power   (lane/r9) THE POWER STEP: the snapshot's gear Levels (weapon; six armor slots, an empty one 0) ride the unit; on the scale a
//           tier of gear moves a blow at a monster by (1 + powerStep)^steps and a blow at the hero the other way, after the armor cap,
//           to within half a permille (the move is a whole permille); never off the scale, at the reference kit, or between two heroes.
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
  M.coreModel = await imp('src/data/core-model.js');
  M.xp = await imp('src/core/xp.js');
  M.huntReport = await imp('src/data/hunt-report.js');
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
  const events = [], windows = [];
  for (let i = 1; i < edges.length; i++) {
    w = w ? M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))) : null;
    const r = M.cs.simulateHuntInstance({ world: w, nextSwingAtMs: next, members }, { ...ctx, toMs: edges[i] });
    w = r.world; next = r.nextSwingAtMs;
    events.push(...r.events);
    /* each window as the settle's analyzer reads it (hr-accrue accrue-hunt.js: the heroes ever in it, the kinds it met) */
    windows.push({ events: r.events, kinds: r.kinds, heroes: [...new Set(Object.values(r.members).map((m) => m.unitIdEver).filter(Number.isInteger))] });
    if (!w) break;
  }
  return { danger: events.filter((e) => e.type === 'danger'), events, world: w, windows };
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
    const pull = (low, cleared = true) => { w.low = low; M.danger.pullEnds(inst, sc, cleared); steps.push(w.danger); };
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
    /* ONLY A CLEARED PULL IS CLEAN (wave 1): pulls the leash took home climb nothing however whole the party stayed, and leave the run as
       it was; one under the trigger still falls back */
    const w2 = world(M, []);
    M.danger.openDanger(w2, 'steady', 500);
    const inst2 = instOf(M, w2), sc2 = subStep(0);
    for (let i = 0; i < 6; i++) { w2.low = 1000; M.danger.pullEnds(inst2, sc2, false); }
    if (w2.danger !== 500) return 'six pulls that cleared nothing climbed the step to ' + w2.danger;
    w2.low = 1000; M.danger.pullEnds(inst2, sc2, true);
    w2.low = 1000; M.danger.pullEnds(inst2, sc2, true);
    if (w2.danger !== 501) return 'two cleared pulls after them climbed to ' + w2.danger + ', not 501';
    w2.low = RISKS.steady.fallPm - 1; M.danger.pullEnds(inst2, sc2, false);
    if (w2.danger !== 501 - CLIMB.fallSteps) return 'an uncleared pull under the trigger left the step at ' + w2.danger;
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
    const { PAY } = M.dangerData;
    const r = 1 + DANGER.powerStep, p = (s) => (s < PAY.gapMax ? 1 + PAY.payStepCoin : 1);
    const total = (s, k) => { const d = M.danger.dangerDial(g, s); return d.pull[0] * d[k]; };
    let sizes = 0;
    for (let s = 0; s < 900; s++) {
      const a = M.danger.dangerDial(g, s), b = M.danger.dangerDial(g, s + 1);
      if (b.pull[0] !== a.pull[0]) sizes++;
      if (b.xpPm !== 1000) return 'step ' + (s + 1) + ' moves a kill\'s row XP (' + b.xpPm + '): the scale pays a share of the killer\'s Level';
      for (const [k, ratio] of [['hpPm', r], ['dmgPm', r], ['coinPm', p(s)]]) {
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
  pay(M) {
    const { PAY, DANGER_GROUNDS } = M.dangerData;
    const { LEVEL_PACE } = M.coreModel;
    const t = [[0, 0], ...LEVEL_PACE.targets];
    for (let i = 1; i < t.length; i++) {
      const mid = (t[i - 1][0] + t[i][0]) / 2, per = (t[i][1] - t[i - 1][1]) / (t[i][0] - t[i - 1][0]);
      if (Number.isInteger(mid) && Math.abs(M.danger.hoursForLevel(mid) - per) > 1e-9) return 'Level ' + mid + ' takes ' + M.danger.hoursForLevel(mid) + ' h, its span ' + per;
    }
    for (let L = 1; L < 1200; L++) {
      const a = M.danger.hoursForLevel(L), b = M.danger.hoursForLevel(L + 1);
      if (!(b >= a) || b - a > 2) return 'the hours a Level takes jump or fall at Level ' + L + ': ' + a + ' -> ' + b;
    }
    const g = { id: 'muster_barrows' }, ref = DANGER_GROUNDS.muster_barrows.refStep;
    for (const L of [1, 9, 40, 60, 75, 300]) {
      const toNext = M.xp.charXpForLevel(L + 1) - M.xp.charXpForLevel(L);
      const perHour = M.danger.levelShareXp(L, ref, g) * PAY.refKillsHead;
      if (Math.abs(perHour * M.danger.hoursForLevel(L) / toNext - 1) > 1e-9) return 'Level ' + L + ' at the reference step earns ' + perHour + ' an hour, the table ' + (toNext / M.danger.hoursForLevel(L));
      const deeper = M.danger.levelShareXp(L, ref + 1, g) / M.danger.levelShareXp(L, ref, g);
      if (Math.abs(deeper - (1 + PAY.payStepXp)) > 1e-9) return 'a step deeper pays x' + deeper;
      if (M.danger.levelShareXp(L, ref + PAY.gapMax + 9, g) !== M.danger.levelShareXp(L, ref + PAY.gapMax, g)) return 'depth pays past the gap ceiling';
      if (!(M.danger.levelShareXp(L, ref - 40, g) < M.danger.levelShareXp(L, ref, g))) return 'a shallower hold pays as much a kill';
    }
    /* in play: every kill on the scale pays its share at a step the trace walked, over one or two heroes */
    const run = play(M, { risk: 'steady', danger: 0 }, 6 * 60000, []);
    const steps = new Set([0, ...run.danger.map((e) => e.step), ...run.danger.map((e) => e.to)]);
    const xps = run.events.filter((e) => e.type === 'xp');
    if (xps.length < 4) return 'CONTROL: ' + xps.length + ' xp events in six minutes on the scale';
    const ground = groundRow();
    for (const e of xps) {
      const fits = [...steps].some((s) => [1, 2].some((n) => Math.floor(M.danger.levelShareXp(1, s, ground) / n + 1e-9) === e.amount));
      if (!fits) return 'a kill on the scale paid ' + e.amount + ', no share of the Level at any step walked (' + [...steps].slice(0, 6) + ')';
    }
    return null;
  },
  /* (lane/r9) THE PAY FLOOR: under the reference step a kill pays (1 + payStepXp)^gap down to PAY.floor and never less, XP and coin
     alike; at and over the reference nothing moved (the most a kill pays, the server's bound, is the same). */
  floor(M) {
    const { PAY, DANGER_GROUNDS } = M.dangerData;
    if (!(PAY.floor > 0 && PAY.floor < 1)) return 'CONTROL: the floor ' + PAY.floor + ' is no share of the table';
    const g = { id: 'muster_barrows' }, ref = DANGER_GROUNDS.muster_barrows.refStep;
    const deep = Math.ceil(Math.log(1 / PAY.floor) / Math.log(1 + PAY.payStepXp)) + 5;
    for (const L of [1, 40, 60, 300]) {
      const at = M.danger.levelShareXp(L, ref, g);
      if (Math.abs(M.danger.levelShareXp(L, ref - 1, g) * (1 + PAY.payStepXp) / at - 1) > 1e-9) return 'Level ' + L + ': one step under the reference does not pay one step less';
      for (const gap of [deep, deep + 40, ref]) {
        const got = M.danger.levelShareXp(L, ref - gap, g) / at;
        if (Math.abs(got - PAY.floor) > 1e-9) return 'Level ' + L + ', ' + gap + ' steps under the reference, a kill pays x' + got + ' of the table, not the floor ' + PAY.floor;
      }
    }
    /* coin: a ground with a reference step (the fixture's pockets under Muster's id), far under it, pays the pull's share x the floor */
    const gm = groundRow({ id: 'muster_barrows' });
    const d = M.danger.dangerDial(gm, 0), d1 = M.danger.dangerDial(gm, ref);
    const share = (x) => x.hpPm / (1000 * Math.pow(1 + M.dangerData.DANGER.powerStep, x.step));
    if (Math.abs(d.coinPm / (1000 * share(d)) - PAY.floor) > 1e-9) return 'step 0 on Muster pays coin x' + d.coinPm / (1000 * share(d)) + ', not the floor';
    if (Math.abs(d1.coinPm / (1000 * share(d1)) - 1) > 1e-9) return 'the reference step pays coin x' + d1.coinPm / (1000 * share(d1));
    return null;
  },
  /* (lane/r9) THE POWER STEP: a hero's gear Levels ride its snapshot (the weapon's item Level; the six armor slots' mean, an empty slot 0)
     and its unit; on the scale, on a ground with a reference kit, a blow at a monster grows by (1 + powerStep)^steps and a blow at the hero
     shrinks by the defense steps, AFTER the armor chain's cap; off the scale, on a ground with no row, or at the reference kit, the blow is
     what it was. */
  power(M) {
    const { POWER, DANGER, DANGER_GROUNDS } = M.dangerData;
    const ref = DANGER_GROUNDS.muster_barrows.gearLv;
    if (!Number.isInteger(ref)) return 'CONTROL: Muster carries no gear Level';
    const IRON = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' };
    const { eq, setBonus, profile } = M.member.loadoutOf(IRON, M.ITEMS);
    const snap = M.member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 }, { eq, equipment: IRON, items: M.ITEMS, bonus: () => 0, setBonus, profile });
    const lv = (id) => M.ITEMS[id].reqLv;
    if (snap.offLv !== lv('iron_sword')) return 'the snapshot reads the weapon at item Level ' + snap.offLv + ', not ' + lv('iron_sword');
    const def = Math.floor((lv('iron_helm') + lv('iron_platebody') + lv('iron_platelegs') + lv('iron_boots')) / 6);
    if (snap.defLv !== def) return 'the snapshot reads four armor pieces in six slots at ' + snap.defLv + ', not ' + def + ' (an empty slot counts 0)';
    /* the blow, through hurt */
    const tier = 15, steps = Math.round((tier * POWER.gearStepsPm) / 1000), ratio = Math.pow(1 + DANGER.powerStep, steps);
    if (steps < 10) return 'CONTROL: a tier is ' + steps + ' power steps';
    const rng = { chance: () => false, int: (a) => a };
    const instOn = (risk, id) => ({ world: { risk, units: [] }, ground: { id }, monsters: M.MONSTERS, tier: null });
    const blow = (inst, from, to, n) => M.hunt.damage.hurt(inst, { ...to, alive: true, hp: 1e9, maxHp: 1e9 }, n, from, null, null, rng).dmg;
    const heroAt = (o, d) => ({ side: 'hero', id: 1, offLv: o, defLv: d });
    const rat = { side: 'mon', id: 2, kind: 'rat' };
    const N = 100000;
    const base = blow(instOn('', 'muster_barrows'), heroAt(ref + tier, ref + tier), rat, N);
    if (blow(instOn('steady', 'muster_barrows'), heroAt(ref, ref), rat, N) !== base) return 'at the reference kit the blow moved on the scale';
    if (blow(instOn('steady', 'h1_fixture'), heroAt(ref + tier, ref + tier), rat, N) !== base) return 'a ground with no reference kit stepped the blow';
    const up = blow(instOn('steady', 'muster_barrows'), heroAt(ref + tier, ref), rat, N) / base;
    if (Math.abs(up - ratio) > 6e-4) return 'a tier of weapon on the scale moved the blow x' + up + ', not x' + ratio;
    const back = blow(instOn('steady', 'muster_barrows'), heroAt(ref - tier, ref), rat, N) / base;
    if (Math.abs(back - 1 / ratio) > 6e-4) return 'a tier back moved the blow x' + back + ', not x' + 1 / ratio;
    /* at the hero, past the cap: a Tempering cut that alone reaches the 60% cap, then the defense steps under it */
    const atHero = (d) => blow(instOn('steady', 'muster_barrows'), rat, { ...heroAt(ref, d), armorPm: 999 }, N);
    const capped = blow(instOn('', 'muster_barrows'), rat, { ...heroAt(ref, ref + tier), armorPm: 999 }, N);
    if (atHero(ref) !== capped) return 'at the reference kit the blow at the hero moved';
    if (Math.abs(atHero(ref + tier) / capped - 1 / ratio) > 6e-4) return 'a tier of armor moved the capped blow x' + atHero(ref + tier) / capped + ', not x' + 1 / ratio + ' (the cap ate the step)';
    if (blow(instOn('steady', 'muster_barrows'), heroAt(ref + tier, ref + tier), heroAt(ref, ref), N) !== blow(instOn('', 'muster_barrows'), heroAt(ref + tier, ref + tier), heroAt(ref, ref), N)) return 'a blow between two heroes was stepped';
    /* in play: the unit carries the snapshot's gear Levels at every boundary */
    const ms = party(M, { risk: 'steady', danger: 0 }).map((m) => ({ ...m, snapshot: () => ({ acc: 900, maxHit: 12, def: 1, offLv: ref + tier, defLv: ref - tier }) }));
    const ground = groundRow(), grid = gridOf(M);
    const r = M.cs.simulateHuntInstance({ world: null, nextSwingAtMs: T0, members: ms },
      { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('power', 1, d, i), monsters: M.MONSTERS, ground, grid, toMs: T0 + 30000 });
    const hs = (r.world && r.world.units || []).filter((u) => u.side === 'hero');
    if (!hs.length) return 'CONTROL: no hero in the world';
    if (!hs.every((u) => u.offLv === ref + tier && u.defLv === ref - tier)) return 'a hero unit carries gear Levels ' + hs.map((u) => u.offLv + '/' + u.defLv);
    return null;
  },
  /* (R2, lane/r2-danger-falls) A FALL BACK NAMES ITS CAUSE, HOWEVER THE SETTLE IS CUT: a two-hero party planned on Bold far deeper than it
     can hold falls back and dies. Every fall and death's `danger` event names the seat of the hero that broke the pull off (the party's
     seats: syncUnit writes them, never persisted) and the kind of the monster whose blow did it, with the margin it read; cut into one
     window, into every 2 s swing (a blow and its break-off, a death and the next window's break-off, on either side of a cut: lowHero and
     lowBy ride the world) and at odd instants, the events are the same, and each cut's analyzer reports, folded window by window
     (report.js addReport), hold the same falls and deepest step, each hero the company's. */
  falls(M) {
    const plan = { risk: 'bold', danger: 700 };
    const span = 2 * 60000;
    const cuts = [[], Array.from({ length: span / 2000 }, (_, i) => T0 + (i + 1) * 2000), [T0 + 9300, T0 + 11650, T0 + 20000, T0 + 41700, T0 + 63000]];
    const runs = cuts.map((c) => play(M, plan, span, c));
    const causes = (r) => r.danger.filter((e) => e.why === 'fall' || e.why === 'death');
    const one = causes(runs[0]);
    if (!one.some((e) => e.why === 'fall') || !one.some((e) => e.why === 'death')) return 'CONTROL: the deep Bold party ' + JSON.stringify(one.map((e) => e.why)) + ', not a fall back and a death';
    for (const e of one) {
      if (![0, 1].includes(e.hero)) return 'a ' + e.why + ' at ' + e.atMs + ' names hero ' + JSON.stringify(e.hero) + ', no seat of the party';
      if (!Object.prototype.hasOwnProperty.call(M.MONSTERS, e.monster)) return 'a ' + e.why + ' at ' + e.atMs + ' names monster ' + JSON.stringify(e.monster);
      if ((e.why === 'death') !== (e.low === 0)) return 'a ' + e.why + ' read a margin of ' + e.low;
    }
    if (new Set(one.map((e) => e.hero)).size < 2) return 'CONTROL: every fall named the same seat (' + one[0].hero + ')';
    for (const [i, r] of runs.entries()) if (JSON.stringify(causes(r)) !== JSON.stringify(one)) return 'cut ' + i + ' names the falls ' + JSON.stringify(causes(r)).slice(0, 240) + ' vs ' + JSON.stringify(one).slice(0, 240);
    const folded = runs.map((r) => {
      const acc = {};
      for (const win of r.windows) {
        const t = M.tally.tallyEvents(win.events, { heroes: win.heroes, kinds: win.kinds });
        for (const [id, h] of Object.entries(t.heroes)) acc[id] = M.tally.addTally(acc[id] || M.tally.emptyTally(), h);
      }
      return Object.values(acc).map((h) => JSON.stringify({ deep: h.report.deep, falls: h.report.falls }));
    });
    const want = JSON.stringify({ deep: plan.danger, falls: one.slice(-M.huntReport.HUNT_REPORT.fallsMax).map((e) => ({ at: e.atMs, from: e.step, to: e.to, hero: e.hero, pm: e.low, monster: e.monster })) });
    for (const [i, f] of folded.entries()) {
      if (!f.length || f.some((x) => x !== want)) return 'cut ' + i + '\'s reports fold to ' + f.join(' | ').slice(0, 300) + ', the falls ' + want.slice(0, 300);
    }
    /* THE BLOW IN ONE WINDOW, ITS BREAK-OFF IN THE NEXT (a swing's last sub-step, so rare in play that the cuts above need not meet it): two
       heroes struck in the pull, the second lower; the world through its encoding (seats are never persisted); the break-off names the
       LOWEST, by the monster that took it there */
    const mk = M.hunt['world-state'].makeUnit;
    /* blows: [[hero index, its HP after the blow (of 30), the dealer's index or null]]; answers the break-off's `danger` event */
    const split = (blows) => {
      const hs = [hero(M, 1, 12, 3, { hp: 30, maxHp: 30 }), hero(M, 3, 11, 3, { hp: 30, maxHp: 30 })];
      const ms = [mk({ id: 2, side: 'mon', kind: 'rat', pocket: 0, alive: true, hp: 10, maxHp: 10, target: 1, x: 13, y: 3, fx: 13, fy: 3, home: [13, 3], speed: 2400 }),
        mk({ id: 4, side: 'mon', kind: 'slime', pocket: 0, alive: true, hp: 10, maxHp: 10, target: 3, x: 10, y: 3, fx: 10, fy: 3, home: [10, 3], speed: 2400 })];
      const w0 = world(M, [...hs, ...ms], { leader: 1, phase: 'fight', routeIdx: 0,
        packs: [{ aggro: true, holder: 1, alive: true }, { aggro: false, holder: null, alive: true }, { aggro: false, holder: null, alive: true }] });
      M.danger.openDanger(w0, 'steady', 200);
      hs.forEach((h, i) => { h.seat = i; });
      for (const [i, hp, by] of blows) { hs[i].hp = hp; M.danger.noteHurt(instOf(M, w0), hs[i], by === null ? null : ms[by]); }
      const w1 = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w0))));
      const sc = subStep(0);
      M.pullcycle.runPhase(instOf(M, w1), sc);
      return sc.events.find((x) => x.type === 'danger') || null;
    };
    const lower = split([[0, 12, 0], [1, 3, 1]]);
    if (!lower || lower.why !== 'fall' || lower.low !== 100 || lower.hero !== 1 || lower.monster !== 'slime') return 'across a cut the break-off read ' + JSON.stringify(lower) + ', not seat 1 at 100 by the slime';
    const bare = split([[0, 12, 0], [1, 3, 1], [0, 2, null]]);
    if (!bare || bare.low !== 66 || bare.hero !== 0 || bare.monster !== 'unknown') return 'a blow with no dealer read ' + JSON.stringify(bare) + ', not seat 0 at 66 by no monster';
    return null;
  },
  down(M) {
    const run = (down, risk) => {
      const h = hero(M, 1, 14, 4, { hp: 30, maxHp: 30 });
      const m = M.hunt['world-state'].makeUnit({ id: 2, side: 'mon', kind: 'rat', pocket: 0, alive: true, hp: 10, maxHp: 10, target: null,
        x: 14, y: 3, fx: 14, fy: 3, home: [14, 3], speed: 2400 });
      const w = world(M, [h, m], { leader: 1, phase: 'travel', routeIdx: 0, nextId: 10,
        packs: [{ aggro: false, holder: null, alive: true, down }, { aggro: false, holder: null, alive: true }, { aggro: false, holder: null, alive: true }] });
      if (risk) M.danger.openDanger(w, risk, 0);
      w.density = 3;
      const inst = { ...instOf(M, w), makeUnit: M.worldstate.makeUnit };
      const sc = subStep(0);
      M.pullcycle.runPhase(inst, sc);
      return { w, inst, sc, living: w.units.filter((u) => u.side !== 'hero' && u.alive && u.pocket === 0).length };
    };
    const whole = run(0, 'steady');
    if (whole.w.phase !== 'fight') return 'CONTROL: the leader beside the pack did not pull it (' + whole.w.phase + ')';
    if (whole.living !== 3) return 'CONTROL: a whole pack was not re-formed at the step\'s size (' + whole.living + ' of 3)';
    const broken = run(1, 'steady');
    if (broken.w.phase !== 'fight') return 'CONTROL: the broken-off pack was not pulled again';
    if (broken.living !== 1) return 'a pack broken off with a monster down came back with ' + broken.living + ' standing: the dead stood up again';
    /* the count: a pack row that falls on the scale counts down, off the scale nothing is counted */
    const k = run(0, 'steady'), mon = k.w.units.find((u) => u.side !== 'hero' && u.alive);
    M.pullcycle.fallen(k.inst, mon, k.sc);
    if (k.w.packs[0].down !== 1) return 'a pack row fell on the scale and its pack counts ' + k.w.packs[0].down + ' down';
    const off = run(0, null), om = off.w.units.find((u) => u.side !== 'hero' && u.alive && u.pocket === 0);
    M.pullcycle.fallen(off.inst, om, off.sc);
    if (off.w.packs[0].down) return 'off the scale a fallen monster was counted down';
    /* a respawn stands the pack up whole */
    k.w.packs[0].alive = false;
    M.pullcycle.spawnPack(k.inst, 0, k.sc);
    if (k.w.packs[0].down) return 'a respawned pack still counts ' + k.w.packs[0].down + ' down';
    return null;
  },
};

const MUTANTS = [
  { name: 'the step never climbs', case: 'rule', edits: [['src/core/hunt/danger.js', "why = 'climb'; to = from + w.climb;", "why = 'climb'; to = from;"]] },
  { name: 'the climb never doubles', case: 'rule', edits: [['src/core/hunt/danger.js', 'w.climb = Math.min(CLIMB.climbMax, w.climb * 2);', 'w.climb = 1;']] },
  { name: 'a fall back keeps the doubled climb', case: 'rule', edits: [['src/core/hunt/danger.js', 'w.climb = 1; w.clean = 0; w.cool = CLIMB.coolPulls;', 'w.clean = 0; w.cool = CLIMB.coolPulls;']] },
  { name: 'no cool-down after a fall back', case: 'rule', edits: [['src/core/hunt/danger.js', '  if (cooling) w.cool -= 1;\n', '  if (cooling) w.cool = 0;\n']] },
  { name: 'a clean pull in the cool-down counts', case: 'rule', edits: [['src/core/hunt/danger.js', '    if (!cooling && cleared) {\n      w.clean += 1;', '    if (cleared) {\n      w.clean += 1;']] },
  { name: 'the fall back ignores the stance\'s trigger', case: 'rule', edits: [['src/core/hunt/danger.js', 'if (low <= 0 || low < st.fallPm) {', 'if (low <= 0) {']] },
  { name: 'a death falls no further than a fall back', case: 'rule', edits: [['src/core/hunt/danger.js', 'to = from - (low <= 0 ? CLIMB.deathSteps : CLIMB.fallSteps);', 'to = from - CLIMB.fallSteps;']] },
  { name: 'the clean run does not survive a settle cut', case: 'trace', edits: [['src/core/hunt/danger.js', "['climb', 'int'], ['clean', 'int'], ['low', 'int'],", "['climb', 'int'], ['low', 'int'],"]] },
  { name: 'the climb does not survive a settle cut', case: 'trace', edits: [['src/core/hunt/danger.js', "['danger', 'int'], ['climb', 'int'], ['clean', 'int'],", "['danger', 'int'], ['clean', 'int'],"]] },
  { name: 'the margin is never read where HP falls', case: 'trace', edits: [['src/core/hunt/damage.js', '  if (!isMonster(target) && r.dmg > 0) noteHurt(inst, target, source);\n', '']] },
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
  { name: 'the scale pays the row XP again', case: 'pay', edits: [['src/core/hunt/xp-share.js', '  if (world && dangerOn(world)) return depthSplit(heroes, sc, ground, world.danger);\n', '']] },
  { name: 'the hours jump at a target Level', case: 'pay', edits: [['src/core/hunt/danger.js', '    if (L <= b) return ha + ((L - a) * (hb - ha)) / (b - a);', '    if (L <= b) return ha;']] },
  { name: 'depth pays past the gap ceiling', case: 'pay', edits: [['src/core/hunt/danger.js', '  return Math.min(PAY.gapMax, clampStep(step) - (row ? row.refStep : 0));', '  return clampStep(step) - (row ? row.refStep : 0);']] },
  { name: 'depth does not pay', case: 'pay', edits: [['src/core/hunt/danger.js', '  return (toNext / (hoursForLevel(L) * PAY.refKillsHead)) * depthRatio(ground, step, PAY.payStepXp);', '  return toNext / (hoursForLevel(L) * PAY.refKillsHead);']] },
  { name: 'coin does not follow the step', case: 'scale', edits: [['src/core/hunt/danger.js', 'coinPm: share * depthRatio(ground, s, PAY.payStepCoin) * 1000 };', 'coinPm: share * 1000 };']] },
  { name: 'a broken-off pack is re-formed whole', case: 'down', edits: [['src/core/hunt/pull-cycle.js', '  if (mons.length !== size && packWhole(w.packs[p])) {', '  if (mons.length !== size) {']] },
  { name: 'a fallen pack row is never counted', case: 'down', edits: [['src/core/hunt/pull-cycle.js', '    if (Number.isInteger(u.pocket) && !isAdd(inst, u)) packDown(inst.world, u.pocket);\n', '']] },
  { name: 'a pull the leash took home counts clean', case: 'rule', edits: [['src/core/hunt/danger.js', '    if (!cooling && cleared) {', '    if (!cooling) {']] },
  { name: 'a cleared pull is never told so', case: 'trace', edits: [['src/core/hunt/pull-cycle.js', '      pullEnds(inst, sc, true);', '      pullEnds(inst, sc);']] },
  { name: 'a respawn keeps the count', case: 'down', edits: [['src/core/hunt/pull-cycle.js', '  if (w.packs[p].down) w.packs[p].down = 0;\n', '']] },
  /* R2: a fall back names its cause */
  { name: 'a fall names no hero', case: 'falls', edits: [['src/core/hunt/danger.js', '  w.lowHero = Number.isSafeInteger(u.seat) && u.seat >= 0 ? u.seat : null;', '  w.lowHero = null;']] },
  { name: 'a fall names no monster', case: 'falls', edits: [['src/core/hunt/danger.js', "  w.lowBy = isMonster(source) && typeof source.kind === 'string' ? source.kind : '';", "  w.lowBy = '';"]] },
  { name: 'the fall\'s hero does not survive a settle cut', case: 'falls', edits: [['src/core/hunt/danger.js', "    ['lowHero', 'int?'], ['lowBy', 'str']]),", "    ['lowBy', 'str']]),"]] },
  { name: 'the fall\'s monster does not survive a settle cut', case: 'falls', edits: [['src/core/hunt/danger.js', "    ['lowHero', 'int?'], ['lowBy', 'str']]),", "    ['lowHero', 'int?']]),"]] },
  { name: 'a hero carries no seat', case: 'falls', edits: [['src/core/combat-sim.js', '  if (Number.isSafeInteger(m.seat) && m.seat >= 0) u.seat = m.seat; else if (u.seat !== undefined) delete u.seat;\n', '']] },
  { name: 'the margin names the first blow, not the lowest', case: 'falls', edits: [['src/core/hunt/danger.js', '  if (pm >= w.low) return;\n  w.low = pm;\n  w.lowHero', '  if (pm >= w.low) return;\n  w.low = pm;\n  if (w.lowHero !== null) return;\n  w.lowHero']] },
  /* lane/r9: the pay floor and the power step */
  { name: 'no pay floor under the reference', case: 'floor', edits: [['src/core/hunt/danger.js', 'Math.max(PAY.floor, 1 / powStep(1 + rate, -g))', '1 / powStep(1 + rate, -g)']] },
  { name: 'the floor lifts the pay over the reference too', case: 'floor', edits: [['src/core/hunt/danger.js', 'return g >= 0 ? powStep(1 + rate, g) : Math.max', 'return g >= 0 ? Math.max(PAY.floor * 2.5, powStep(1 + rate, g)) : Math.max']] },
  { name: 'the power step is never read', case: 'power', edits: [['src/core/hunt/danger.js', '  if (!inst || !dangerOn(inst.world)) return base;\n', '  return base;\n']] },
  { name: 'the power step plays off the scale', case: 'power', edits: [['src/core/hunt/danger.js', '  if (!inst || !dangerOn(inst.world)) return base;\n', '  if (!inst) return base;\n']] },
  { name: 'armor raises the blows at its wearer', case: 'power', edits: [['src/core/hunt/danger.js', 'steps = -gearSteps(target.defLv, row);', 'steps = gearSteps(target.defLv, row);']] },
  { name: 'the defense step sits under the armor cap', case: 'power', edits: [
    ['src/core/hunt/damage.js', 'mitigate(n, el, armourVs(inst, target, source), target.armorPm, rng)', 'mitigate(n, el, armourVs(inst, target, source), isHero(target) ? (target.armorPm || 0) - powerPm(inst, source, target, 0) : target.armorPm, rng)'],
    ['src/core/hunt/damage.js', '  if (pm) n = Math.max(1, temperedAmount(n, pm, rng));', '  if (pm && isMonster(target)) n = Math.max(1, temperedAmount(n, pm, rng));']] },
  { name: 'one good armor piece stands for the set', case: 'power', edits: [['src/core/hunt/danger.js', '  let sum = 0;\n', '  let sum = 0, worn = 0;\n'],
    ['src/core/hunt/danger.js', 'sum += itemLv(it); }', '{ sum += itemLv(it); worn++; } }'], ['src/core/hunt/danger.js', 'Math.floor(sum / ARMOUR_SLOTS.length)', 'Math.floor(sum / Math.max(1, worn))']] },
  { name: 'the snapshot carries no gear Levels', case: 'power', edits: [['src/core/member.js', '    offLv: gear.off, defLv: gear.def,\n', '\n']] },
  { name: 'the unit never carries the gear Levels', case: 'power', edits: [['src/core/combat-sim.js', '  u.offLv = Number.isInteger(snap.offLv) ? snap.offLv : 0; u.defLv = Number.isInteger(snap.defLv) ? snap.defLv : 0;\n', '']] },
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
