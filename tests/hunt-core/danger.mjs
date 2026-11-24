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
//   power   (lane/r9) THE POWER STEP: the snapshot's gear part (the gear table: item Level x slot weight) rides the unit and the frozen
//           peer; on the scale a tier of gear moves a blow at a monster by (1 + powerStep)^steps and a blow at the hero the other way,
//           after the armor cap, to within half a permille; never off the scale, at the ground's gear Level, or between two heroes.
//   skill   (lane/foundations-block) THE SKILL PART: the snapshot's skill gap (the style's skill as a Level on the reference career line,
//           over the hero's own Level: 0 on the line) rides the unit and the frozen peer; on the scale a skill 20 Levels behind its line moves a
//           blow at a monster by (1 + powerStep)^round(20 x weightSkill) down and a blow at the hero up by the same; never off the scale.
//   loot    (lane/foundations-block) LOOT FOLLOWS DEPTH: the dial's dropPm is 1000 at the reference step, an hour a step deeper drops
//           (1 + payStepLoot) more of the kill's table (the pull's share paid back), never under PAY.floor of it below the reference; a
//           kill's drop rolls read it (a row's chance x dropPm / 1000, a certainty untouched, never past one roll a kill); off the scale none.
//           Read on every scale ground, each on its monster formula: its loot follows the pull it fights (lane/monster-roles-ford-wings).
//   rowskept (lane/monster-roles-ford-wings) ROWS KEPT IN THEIR HOURS: a ground whose rows were written at another kill rate
//           (DANGER_GROUNDS rowsKillsHead) pays each kill that rate over its reference kills of its row's coin and of its drop table, at
//           every step and party size; a ground with none pays its as-built share and the table as written.
//   ledger  (lane/ledger-l1-l3, 19-power-ledger.md L1) THE LEDGER'S CLAMP: the slice caps at Levels 10, 30, 60, 200 and 400
//           (src/core/power-ledger.js on src/data/power-ledger.js), no ramp on what a hero finds, gains-only and signed slices, one key,
//           an ally's party row, the closed clan slice, and the engine's power step reading the clamped steps both ways on the scale only.
//   top     (lane/r10) THE TOP OF THE GROUND: no climb, dial or start past a scale ground's band top, no pay past it; off the scale, no top.
//   ilevel  (lane/r10) ONE BASE A GROUND: every gear drop of every scale ground carries its ground's gearLevel as `iL`, which the gear part reads.
//   drops   (lane/r10) A GROUND'S OWN ROWS: a wing's monsters carry its rows after their own; a ground with none reads the catalogue.
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
  M.amount = await imp('src/core/hunt/amount.js');
  M.dangerData = await imp('src/data/danger.js');
  M.tiers = await imp('src/data/hunt-tiers.js');
  M.coreModel = await imp('src/data/core-model.js');
  M.wageData = await imp('src/data/wage.js');
  M.xp = await imp('src/core/xp.js');
  M.huntReport = await imp('src/data/hunt-report.js');
  M.ledger = await imp('src/core/power-ledger.js');
  M.ledgerData = await imp('src/data/power-ledger.js');
  M.grounds = await imp('src/data/hunt-grounds.js');
  M.items = await imp('src/data/items.js');
  M.GEAR_W = M.dangerData.GEAR_STEPS.slotPm.weapon;
  M.bands = await imp('src/core/bands.js');
  M.bandsData = await imp('src/data/bands.js');
  return M;
};

/* A two-hero party walking into an empty instance (the engine opens the world at the first boundary, from the leader's plan). */
function party(M, plan) {
  const ms = [member(M, 'a', { seat: 0, maxHp: 60, hp: 60, maxHit: 12 }), member(M, 'b', { seat: 1, maxHp: 60, hp: 60, maxHit: 12 })];
  if (plan) for (const m of ms) m.hero = { ...m.hero, ...plan };
  return ms;
}
/* Play [T0, T0 + spanMs) cut at `cuts`, the world through JSON at every cut; answers the run's danger events and its last world. */
function play(M, plan, spanMs, cuts, groundOver) {
  const ground = groundOver || groundRow(), grid = gridOf(M);
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
    /* BOLD FIGHTS THE PULL TO THE END (RISKS.bold.breakOff false): under its line the pull goes on; the line is read when it ends */
    const bd = RISKS.bold;
    if (bd.breakOff !== false) return 'fixture: Bold breaks off (breakOff ' + bd.breakOff + ')';
    const bold = run('bold', bd.fallPm - 1);
    if (bold.w.phase !== 'fight' || !bold.w.packs[0].aggro) return 'Bold under its line (' + (bd.fallPm - 1) + ') broke the pull off (' + bold.w.phase + ')';
    const bi = instOf(M, bold.w), bsc = subStep(0);
    M.danger.pullEnds(bi, bsc, true);
    if (bold.w.danger !== 200 - CLIMB.fallSteps) return 'Bold ending a pull under its line left the step at ' + bold.w.danger + ', not a fall back to ' + (200 - CLIMB.fallSteps);
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
  /* THE HOLDER'S LINE (23-spell-audit.md section 3; Tyler 2026-11-22: "the tank falls back at 15% on Steady while others fall back at
     25%"): the lap's holding tank reads the stance's thresholds times HOLDER.linePm, every other hero the stance's own; the margin is
     whichever hero is furthest under its own line, and a fall back names the HP that hero really reached */
  holder(M) {
    const { RISKS, HOLDER } = M.dangerData;
    const st = RISKS.steady, line = (pm) => Math.ceil((pm * HOLDER.linePm) / 1000);
    if (!(line(st.fallPm) < st.fallPm)) return 'the holder\'s line (' + HOLDER.linePm + ') is not under everyone else\'s';
    /* `mid`: between the tank's line and everyone else's */
    const mid = Math.floor((line(st.fallPm) + st.fallPm) / 2);
    const pullAt = (hurts, cleared = true) => {
      /* (the seat is the settle's, written at every boundary and never persisted: makeUnit drops it, so it is set here) */
      const tank = Object.assign(hero(M, 1, 3, 3, { role: 'tank', hp: 1000, maxHp: 1000 }), { seat: 0 }), dps = Object.assign(hero(M, 2, 4, 3, { role: 'melee_dps', hp: 1000, maxHp: 1000 }), { seat: 1 });
      const w = world(M, [tank, dps]);
      M.danger.openDanger(w, 'steady', 500);
      const inst = instOf(M, w), sc = subStep(0);
      for (const [u, hp] of hurts.map(([who, hp]) => [who === 'tank' ? tank : dps, hp])) { u.hp = hp; M.danger.noteHurt(inst, u, null); }
      const breaks = M.danger.breaksOff(inst);
      M.danger.pullEnds(inst, sc, cleared);
      const ev = sc.events.find((e) => e.type === 'danger');
      return { breaks, why: ev.why, low: ev.low, hero: ev.hero, to: w.danger };
    };
    const show = (r) => JSON.stringify(r);
    /* the tank under everyone else's line and over its own holds; at exactly its own holds; under it falls back, naming its own HP */
    let r = pullAt([['tank', mid]]);
    if (r.breaks || r.why !== 'hold') return 'the tank at ' + mid + ' broke the pull off on Steady: ' + show(r);
    r = pullAt([['tank', line(st.fallPm)]]);
    if (r.breaks || r.why !== 'hold') return 'the tank at its line (' + line(st.fallPm) + ') fell back: ' + show(r);
    r = pullAt([['tank', line(st.fallPm) - 1]]);
    if (!r.breaks || r.why !== 'fall' || r.low !== line(st.fallPm) - 1 || r.hero !== 0) return 'the tank under its line did not fall back on its own HP: ' + show(r);
    /* another hero still falls back on the stance's own line */
    r = pullAt([['dps', st.fallPm - 1]]);
    if (!r.breaks || r.why !== 'fall' || r.hero !== 1) return 'a hero beside the tank under 25% did not fall back: ' + show(r);
    /* the margin is the hero furthest under its own line, not the lowest HP: the tank at `mid` first, then the axes under 25% */
    r = pullAt([['tank', mid], ['dps', st.fallPm - 10]]);
    if (!r.breaks || r.why !== 'fall' || r.hero !== 1 || r.low !== st.fallPm - 10) return 'the axes under 25% after the tank at ' + mid + ' did not break the pull: ' + show(r);
    r = pullAt([['dps', st.fallPm + 10], ['tank', mid]]);
    if (r.breaks || r.why !== 'hold' || r.low !== st.fallPm + 10) return 'the tank at ' + mid + ' after the axes at 26% read as the margin: ' + show(r);
    /* the climb: the tank clean at its own share of the climb line */
    const twice = (hp) => {
      const tank = Object.assign(hero(M, 1, 3, 3, { role: 'tank', hp: 1000, maxHp: 1000 }), { seat: 0 });
      const w = world(M, [tank]);
      M.danger.openDanger(w, 'steady', 500);
      const inst = instOf(M, w), sc = subStep(0);
      for (let i = 0; i < 2; i++) { tank.hp = hp; M.danger.noteHurt(inst, tank, null); M.danger.pullEnds(inst, sc, true); }
      return w.danger;
    };
    if (twice(line(st.cleanPm)) !== 501) return 'two pulls with the tank at its climb line (' + line(st.cleanPm) + ') did not climb: ' + twice(line(st.cleanPm));
    if (twice(line(st.cleanPm) - 1) !== 500) return 'two pulls with the tank under its climb line climbed';
    /* a hero that is not the holding tank (no tank in the party) reads the stance's own line */
    const lone = Object.assign(hero(M, 1, 3, 3, { role: 'melee_dps', hp: 200, maxHp: 1000 }), { seat: 0 });
    const w = world(M, [lone]);
    M.danger.openDanger(w, 'steady', 500);
    const inst = instOf(M, w);
    M.danger.noteHurt(inst, lone, null);
    if (!M.danger.breaksOff(inst)) return 'a lone sword at 20% held the line the holding tank holds';
    return null;
  },
  scale(M) {
    const { DANGER } = M.dangerData;
    const g = groundRow({ pockets: [
      { room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 14, y: 3 }, { monster: 'rat', x: 15, y: 4 }, { monster: 'rat', x: 16, y: 4 }] },
      { room: [1, 1, 8, 6], spawns: [{ monster: 'slime', x: 4, y: 3 }, { monster: 'slime', x: 5, y: 3 }] },
      { room: [1, 8, 18, 8], spawns: [{ monster: 'rat', x: 9, y: 8 }, { monster: 'rat', x: 10, y: 8 }, { monster: 'rat', x: 11, y: 8 }] }] });
    const { PAY } = M.dangerData;
    /* one coin ratio a step (lane/econ-levers): the wage's, inside a ground as across grounds, an HOUR's (lane/ledger-l10): a pull's coin
       grows by the wage's ratio times the step's health, the pull's length paid back */
    const r = 1 + DANGER.powerStep, p = (s) => (s < PAY.gapMax ? r * (1 + M.wageData.WAGE.payStepCoin) : 1);
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
  /* (lane/r10) THE TOP OF THE GROUND (12-targets.md 3.2): on a scale ground the climb stops at the band's top on every stance, a start held
     from past it opens there, the dial is never deeper, and a kill pays no more past it; a ground with no row is held only by the scale. */
  top(M) {
    const { DANGER_GROUNDS, PAY, DANGER } = M.dangerData;
    const id = 'muster_barrows', row = DANGER_GROUNDS[id], g = { ...groundRow(), id };
    const w = world(M, []);
    M.danger.openDanger(w, 'bold', row.topStep - 1);
    const inst = instOf(M, w, g), sc = subStep(0);
    for (let i = 0; i < 12; i++) { w.low = 1000; M.danger.pullEnds(inst, sc, true); }
    if (w.danger !== row.topStep) return 'twelve clean pulls from one under the top stood at ' + w.danger + ', not the top ' + row.topStep;
    if (M.danger.dangerDial(g, row.topStep + 50).step !== row.topStep) return 'the dial past the top reads step ' + M.danger.dangerDial(g, row.topStep + 50).step;
    if (M.danger.dangerDial(groundRow(), row.topStep + 50).step !== row.topStep + 50) return 'a ground off the scale was held at a band top';
    /* the pay's reference is where the reference company holds (lane/scale-early-grounds: src/core/hunt/danger.js payRowOf) */
    const payRef = row.refStep, ceiling = Math.min(PAY.gapMax, row.topStep - payRef);
    if (M.danger.levelShareXp(60, row.topStep + 40, g) !== M.danger.levelShareXp(60, payRef + ceiling, g)) return 'a kill past the top pays more than at it';
    /* the engine opens a start held from past the top AT the top (combat-sim.js: the plan's step through the dial) */
    const r = play(M, { risk: 'steady', danger: DANGER.stepMax }, 3 * 60000, [], g);
    if (!r.danger.length) return 'CONTROL: no pull ended on the scale from a start past the top';
    if (r.danger[0].step !== row.topStep) return 'a start held past the top made its first pull at step ' + r.danger[0].step + ', not the top ' + row.topStep;
    return null;
  },
  /* (lane/r10) ONE BASE A GROUND (12-targets.md 3.3 and 8): every gear piece a scale ground can drop (each monster's rows on its route and the
     ground's own rows) carries the ground's gearLevel as its item Level `iL`, and the power step reads that, not its reqLv. */
  ilevel(M) {
    const { DANGER_GROUNDS } = M.dangerData;
    let n = 0;
    for (const [id, row] of Object.entries(DANGER_GROUNDS)) {
      const g = M.grounds.HUNT_GROUNDS[id];
      if (!g) return id + ' is on the scale and no hunting ground';
      const rows = [...M.grounds.monstersOn(g)].flatMap((m) => (M.MONSTERS[m] && M.MONSTERS[m].drops) || []).concat(g.drops || []);
      let gear = 0;
      for (const d of rows) {
        const it = M.items.ITEMS[d.id];
        if (!it || !it.slot || it.type === 'ammo') continue;
        gear++; n++;
        if (it.iL !== row.gearLevel) return id + ' drops ' + d.id + ' at item Level ' + it.iL + ', its ground\'s base is ' + row.gearLevel;
      }
      if (!gear) return 'CONTROL: ' + id + ' drops no gear';
    }
    /* a one-handed weapon whose item Level is not its reqLv: the gear part is its slot's weight x its item Level */
    const piece = Object.entries(M.items.ITEMS).find(([, it]) => Number.isInteger(it.iL) && it.slot === 'weapon' && !it.twoHanded && it.reqLv !== it.iL);
    if (!piece) return 'CONTROL: no weapon whose item Level is not its reqLv';
    const items = { [piece[0]]: piece[1] };
    if (M.danger.gearPartPm({ weapon: piece[0] }, items) !== M.GEAR_W * piece[1].iL) return 'the gear part reads ' + M.danger.gearPartPm({ weapon: piece[0] }, items) + ' for ' + piece[0] + ', not its item Level ' + piece[1].iL;
    return n ? null : 'CONTROL: no gear drop read';
  },
  /* (lane/r10) A GROUND'S OWN DROP ROWS (the Catacombs' wings, catacomb-wings.js): the instance's monster rows on a wing carry every one of the
     ground's rows after their own (no earlier draw moves), and a ground with none reads the catalogue untouched. */
  drops(M) {
    const wing = M.grounds.HUNT_GROUNDS.catacomb_bone_wing;
    if (!wing || !(wing.drops || []).length) return 'CONTROL: the Bone Wing has no rows of its own';
    const play = M.cs.huntPlayOf('catacomb_bone_wing', null);
    if (!play.monsters) return 'a ground with its own rows plays the bare catalogue';
    for (const m of M.grounds.monstersOn(wing)) {
      const own = M.MONSTERS[m].drops || [], got = play.monsters[m].drops || [];
      if (JSON.stringify(got.slice(0, own.length)) !== JSON.stringify(own)) return m + '\'s own rows moved on the wing';
      if (JSON.stringify(got.slice(own.length)) !== JSON.stringify(wing.drops)) return m + ' on the wing carries ' + (got.length - own.length) + ' of the ground\'s ' + wing.drops.length + ' rows';
    }
    if (M.cs.huntPlayOf('muster_barrows', null).monsters !== null) return 'a ground with no rows of its own reads a changed table';
    return null;
  },
  pay(M) {
    const { PAY, DANGER_GROUNDS } = M.dangerData;
    /* lane/formula-overhaul: the hours a Level takes is core-model.js LEVEL_HOURS's formula, ceiling x L^2 / ((L + half) x (L + early)),
       rising without a jump and levelling off under its ceiling */
    const { LEVEL_HOURS } = M.coreModel;
    for (const L of [1, 2, 9, 40, 60, 75, 300, 1000, 5000]) {
      const want = (LEVEL_HOURS.ceiling * L * L) / ((L + LEVEL_HOURS.half) * (L + LEVEL_HOURS.early));
      if (M.danger.hoursForLevel(L) !== want) return 'Level ' + L + ' takes ' + M.danger.hoursForLevel(L) + ' h, the formula ' + want;
    }
    for (let L = 1; L < 1200; L++) {
      const a = M.danger.hoursForLevel(L), b = M.danger.hoursForLevel(L + 1);
      if (!(b >= a) || b - a > 2 || !(b < LEVEL_HOURS.ceiling)) return 'the hours a Level takes jump, fall or pass the ceiling at Level ' + L + ': ' + a + ' -> ' + b;
    }
    /* the pay's reference: refStep, where the reference company holds (a formula ground's monsters may stand at formulaStep) */
    const MR = DANGER_GROUNDS.muster_barrows, g = { id: 'muster_barrows' }, ref = MR.refStep;
    for (const L of [1, 9, 40, 60, 75, 300]) {
      const toNext = M.xp.charXpForLevel(L + 1) - M.xp.charXpForLevel(L);
      const perHour = M.danger.levelShareXp(L, ref, g) * PAY.refKillsHead;
      if (Math.abs(perHour * M.danger.hoursForLevel(L) / toNext - 1) > 1e-9) return 'Level ' + L + ' at the reference step earns ' + perHour + ' an hour, the table ' + (toNext / M.danger.hoursForLevel(L));
      const deeper = M.danger.levelShareXp(L, ref + 1, g) / M.danger.levelShareXp(L, ref, g);
      if (Math.abs(deeper - (1 + PAY.payStepXp)) > 1e-9) return 'a step deeper pays x' + deeper;
      if (M.danger.levelShareXp(L, ref + PAY.gapMax + 9, g) !== M.danger.levelShareXp(L, ref + PAY.gapMax, g)) return 'depth pays past the gap ceiling';
      if (!(M.danger.levelShareXp(L, ref - 40, g) < M.danger.levelShareXp(L, ref, g))) return 'a shallower hold pays as much a kill';
    }
    /* (lane/r10) a ground's own kill rate: at its reference a Steady four killing its refKillsHead a head earns the table, never under the scale's */
    for (const [id, row] of Object.entries(DANGER_GROUNDS)) {
      const kills = Number.isInteger(row.refKillsHead) ? row.refKillsHead : PAY.refKillsHead, L = 50;
      if (kills < PAY.refKillsHead) return id + ' splits the table over ' + kills + ' kills a head, under the scale\'s ' + PAY.refKillsHead;
      const toNext = M.xp.charXpForLevel(L + 1) - M.xp.charXpForLevel(L);
      const rate = M.danger.levelShareXp(L, row.refStep, { id }) * kills * M.danger.hoursForLevel(L) / toNext;
      if (Math.abs(rate - 1) > 1e-9) return id + ' at its reference pays ' + rate + 'x the table at its own kill rate';
    }
    /* lane/econ-levers + lane/ledger-l10 (19 L10, V13): an HOUR a step deeper pays the wage's one coin ratio more coin. A pull's coin over
       the pull's whole health (what clearing it takes) is the coin an hour of clearing pays; a step deeper that is (1 + payStepCoin), so
       the pull itself pays the step's length back too (the floor is the floor case's) */
    const g2 = groundRow({ id: 'muster_barrows' });
    const pullCoin = (s) => { const d = M.danger.dangerDial(g2, s); return d.coinPm * d.pull[0]; };
    const pullHp = (s) => { const d = M.danger.dangerDial(g2, s); return d.hpPm * d.pull[0]; };
    const wageR = 1 + M.wageData.WAGE.payStepCoin;
    for (const s of [ref, ref + 1, ref + 37, ref + 60]) {
      const hourR = (pullCoin(s + 1) / pullHp(s + 1)) / (pullCoin(s) / pullHp(s));
      if (Math.abs(hourR - wageR) > 1e-9) return 'an hour a step deeper (step ' + s + ') pays coin x' + hourR + ', not the wage ratio ' + wageR + ' (a pull x' + pullCoin(s + 1) / pullCoin(s) + ')';
    }
    if (!(pullCoin(ref) > 0)) return 'CONTROL: no coin at the reference';
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
    /* the pay's reference: refStep, where the reference company holds (a formula ground's monsters may stand at formulaStep) */
    const MR = DANGER_GROUNDS.muster_barrows, g = { id: 'muster_barrows' }, ref = MR.refStep;
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
    /* (Muster's id: its rows are written at its own kill rate, no rowsKillsHead; the case rowskept reads a ground that keeps another's) */
    const gm = groundRow({ id: 'muster_barrows' });
    const d = M.danger.dangerDial(gm, 0), d1 = M.danger.dangerDial(gm, ref);
    /* the AS-BUILT pull's share, the one a kill's coin keeps on either monster switch (a formula ground's pull is sized to the party, its coin
       is not: lane/monster-formula; every scale ground plays the formula since lane/monster-roles-ford-wings) */
    const { DANGER } = M.dangerData, n0 = gm.route.reduce((a, p) => a + gm.pockets[p].spawns.length, 0) / gm.route.length;
    const share = (x) => n0 / Math.max(1, Math.min(DANGER.pullMax, Math.round(n0 * Math.pow(1 + DANGER.pullStep, x.step))));
    /* ...at its own coin level (lane/scale-early-grounds: DANGER_GROUNDS coinPm, danger.js coinLevelOf; PAY.coinPm on a ground with none) */
    const lvl = Number.isInteger(MR.coinPm) ? MR.coinPm : PAY.coinPm;
    if (Math.abs(d.coinPm / (lvl * share(d)) - PAY.floor) > 1e-9) return 'step 0 on Muster pays coin x' + d.coinPm / (lvl * share(d)) + ', not the floor';
    if (Math.abs(d1.coinPm / (lvl * share(d1)) - 1) > 1e-9) return 'the reference step pays coin x' + d1.coinPm / (lvl * share(d1));
    return null;
  },
  /* (lane/r9) THE POWER STEP: a hero's gear part rides its snapshot (danger.js gearPartPm on the gear table, src/data/gear-steps.js: item
     Level x slot weight, a whole kit at X is X, an empty slot 0, a two-handed weapon carrying the off-hand's weight) and its unit and the
     browser's frozen peer; on the scale, on a ground with a gearLevel, a blow at a monster grows by (1 + powerStep)^steps and a blow at the
     hero shrinks by the same, AFTER the armor chain's cap; off the scale, on a ground with no row, at the ground's level, or between two
     heroes, the blow is what it was. One tier on a whole kit is GEAR_STEPS.tierSteps steps (weightGear 1000), within half a permille. */
  power(M) {
    const { DANGER, DANGER_GROUNDS, GEAR_STEPS, POWER } = M.dangerData;
    const gl = DANGER_GROUNDS.muster_barrows.gearLevel;
    if (!Number.isInteger(gl)) return 'CONTROL: Muster carries no gearLevel';
    const IRON = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' };
    const { eq, setBonus, profile } = M.member.loadoutOf(IRON, M.ITEMS);
    const snap = M.member.heroSnapshot({ skills: { melee: 0, defense: 0 }, levelXp: 0 }, { eq, equipment: IRON, items: M.ITEMS, bonus: () => 0, setBonus, profile });
    const W = GEAR_STEPS.slotPm, lv = (id) => M.ITEMS[id].reqLv;
    const want = Object.entries(IRON).reduce((a, [s, id]) => a + W[s] * lv(id), 0);
    if (snap.gearPm !== want) return 'the snapshot carries a gear part of ' + snap.gearPm + ', the table ' + want + ' (an empty slot adds 0)';
    const kit = Object.fromEntries(Object.keys(W).map((s) => [s, 'iron_helm']));
    if (M.danger.gearPartPm(kit, M.ITEMS) !== 1000 * lv('iron_helm')) return 'a whole kit at one item Level reads ' + M.danger.gearPartPm(kit, M.ITEMS) + ', not 1000 x ' + lv('iron_helm');
    const two = Object.keys(M.ITEMS).find((id) => M.ITEMS[id].twoHanded === true && M.ITEMS[id].slot === 'weapon' && M.ITEMS[id].reqLv > 1);
    if (!two) return 'CONTROL: no two-handed weapon in the catalogue';
    const carried = GEAR_STEPS.twoHand.reduce((a, s) => a + W[s], 0) * lv(two);
    if (M.danger.gearPartPm({ weapon: two }, M.ITEMS) !== carried) return 'a two-handed weapon carries ' + M.danger.gearPartPm({ weapon: two }, M.ITEMS) + ', not the off-hand\'s weight too (' + carried + ')';
    /* the blow, through hurt: on the scale THE AMOUNT PIPELINE (src/core/hunt/amount.js, lane/stage3-pipeline) reads the gear part in the
       hero's rating, the reference company's (the ground's gear Level at its refLevel) a gap of 0; off the scale the old chain never reads it */
    const tier = GEAR_STEPS.tierSteps, steps = Math.round((tier * POWER.weightGearPm) / 1000), ratio = Math.pow(1 + DANGER.powerStep, steps);
    if (steps < 10) return 'CONTROL: a tier is ' + steps + ' power steps';
    const ref = 1000 * gl, up1 = 1000 * (gl + tier), dn1 = 1000 * (gl - tier), L0 = DANGER_GROUNDS.muster_barrows.refLevel;
    const rng = { chance: () => false, int: (a) => a };
    const instOn = (risk, id) => ({ world: { risk, units: [] }, ground: { id }, monsters: M.MONSTERS, tier: null });
    const blow = (inst, from, to, n) => M.hunt.damage.hurt(inst, { ...to, alive: true, hp: 1e9, maxHp: 1e9 }, n, from, null, null, rng).dmg;
    const heroAt = (g) => ({ side: 'hero', id: 1, gearPm: g, armorGearPm: g, wardPm: g, heroLv: L0 });
    const rat = { side: 'mon', id: 2, kind: 'rat' };
    const N = 100000;
    if (blow(instOn('', 'muster_barrows'), heroAt(up1), rat, N) !== blow(instOn('', 'muster_barrows'), heroAt(ref), rat, N)) return 'off the scale the gear part moved the blow';
    const base = blow(instOn('steady', 'muster_barrows'), heroAt(ref), rat, N);
    const tr = {};
    M.amount.blowAmount(instOn('steady', 'muster_barrows'), { source: heroAt(ref), target: rat, mean: N, el: 1000, rng, trace: tr });
    if (tr.steps !== 0) return 'at the ground\'s gear Level the reference company is ' + tr.steps + ' steps from the ground';
    const up = blow(instOn('steady', 'muster_barrows'), heroAt(up1), rat, N) / base;
    if (Math.abs(up - ratio) > 6e-4) return 'a tier of gear on the scale moved the blow x' + up + ', not x' + ratio;
    const back = blow(instOn('steady', 'muster_barrows'), heroAt(dn1), rat, N) / base;
    /* ONE-SIDED (lane/econ-levers): under the hero's Level a gear step counts weightGearBelowPm (src/core/bands.js ratingPm) */
    const below = Math.pow(1 + DANGER.powerStep, Math.round((tier * POWER.weightGearBelowPm) / 1000));
    if (!(POWER.weightGearBelowPm > 0 && POWER.weightGearBelowPm < POWER.weightGearPm)) return 'CONTROL: the weight under the base is ' + POWER.weightGearBelowPm + ', not under the weight over it';
    if (Math.abs(back - 1 / below) > 6e-4) return 'a tier back moved the blow x' + back + ', not x' + 1 / below + ' (weightGearBelowPm)';
    /* at the hero, with no cap: a Tempering cut on the hero and a tier of armor, each its own steps */
    const atHero = (g) => blow(instOn('steady', 'muster_barrows'), rat, heroAt(g), N);
    if (Math.abs(atHero(up1) / atHero(ref) - 1 / ratio) > 6e-4) return 'a tier of armor moved the blow at the hero x' + atHero(up1) / atHero(ref) + ', not x' + 1 / ratio;
    /* in play: the unit carries the snapshot's gear part at every boundary */
    const ms = party(M, { risk: 'steady', danger: 0 }).map((m) => ({ ...m, snapshot: () => ({ acc: 900, maxHit: 12, def: 1, gearPm: up1 }) }));
    const ground = groundRow(), grid = gridOf(M);
    const r = M.cs.simulateHuntInstance({ world: null, nextSwingAtMs: T0, members: ms },
      { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('power', 1, d, i), monsters: M.MONSTERS, ground, grid, toMs: T0 + 30000 });
    const hs = (r.world && r.world.units || []).filter((u) => u.side === 'hero');
    if (!hs.length) return 'CONTROL: no hero in the world';
    if (!hs.every((u) => u.gearPm === up1)) return 'a hero unit carries a gear part of ' + hs.map((u) => u.gearPm);
    /* the browser's peer: the frozen row the server hands it carries the same gear part (member.js frozenOf -> frozenSide) */
    const side = M.member.memberSide({ key: 'a', seat: 0, equipment: IRON, skills: {}, levelXp: 0, hp: 100, gold: 0, hero: { role: 'melee_dps', slots: [] } }, { items: M.ITEMS });
    const fr = M.member.frozenOf(side, [], 0, M.MONSTERS), peer = M.member.frozenSide({ key: 'a', seat: 0, unitId: 1, frozen: fr }).member.snapshot();
    if (peer.gearPm !== snap.gearPm) return 'the browser\'s peer fights at a gear part of ' + peer.gearPm + ', the server\'s ' + snap.gearPm;
    return null;
  },
  skill(M) {
    const { DANGER, DANGER_GROUNDS, POWER } = M.dangerData;
    /* the career's skill at Level 60 on the Level clock (stage 7: src/core/bands.js skillLevelPm; at the data's pace it is 60) */
    const B = M.bands, L = 60;
    let v0 = 1;
    while (B.skillLevelPm('melee', v0 + 1) <= 1000 * L) v0++;
    const line = [L, v0];
    if (B.skillLevelPm('melee', v0) !== 1000 * L) return 'CONTROL: no melee skill reads Level 60 on the clock (' + v0 + ' reads ' + B.skillLevelPm('melee', v0) + ')';
    const IRON = { weapon: 'iron_sword', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots' };
    const { eq, setBonus, profile } = M.member.loadoutOf(IRON, M.ITEMS);
    const snapAt = (melee) => M.member.heroSnapshot({ skills: { melee: M.xp.skillXpForLevel('melee', melee), defense: 0 }, levelXp: M.xp.charXpForLevel(L) },
      { eq, equipment: IRON, items: M.ITEMS, bonus: () => 0, setBonus, profile });
    if (snapAt(line[1]).level !== L) return 'CONTROL: the snapshot is at Level ' + snapAt(line[1]).level;
    if (snapAt(line[1]).skillGapPm !== 0) return 'a hero on its career line carries a skill gap of ' + snapAt(line[1]).skillGapPm;
    const behind = snapAt(line[1] - 6), want = B.skillLevelPm('melee', line[1] - 6) - 1000 * L;
    if (!(want < 0) || behind.skillGapPm !== want) return 'a hero 6 skill under its line carries ' + behind.skillGapPm + ', the line says ' + want;
    /* the blow, through hurt, at the ground's gear Level so only the skill part moves it */
    const gl = DANGER_GROUNDS.muster_barrows.gearLevel, gap = -20000;
    const steps = Math.round((gap * POWER.weightSkillPm) / 1e6), ratio = Math.pow(1 + DANGER.powerStep, steps);
    if (steps === 0) return 'CONTROL: 20 Levels of skill are 0 steps at weightSkillPm ' + POWER.weightSkillPm;
    const rng = { chance: () => false, int: (a) => a };
    const instOn = (risk) => ({ world: { risk, units: [] }, ground: { id: 'muster_barrows' }, monsters: M.MONSTERS, tier: null });
    const blow = (inst, from, to, n) => M.hunt.damage.hurt(inst, { ...to, alive: true, hp: 1e9, maxHp: 1e9 }, n, from, null, null, rng).dmg;
    const heroAt = (sk) => ({ side: 'hero', id: 1, gearPm: 1000 * gl, skillGapPm: sk });
    const rat = { side: 'mon', id: 2, kind: 'rat' };
    const N = 100000, base = blow(instOn('steady'), heroAt(0), rat, N);
    if (blow(instOn(''), heroAt(gap), rat, N) !== blow(instOn(''), heroAt(0), rat, N)) return 'off the scale the skill part moved the blow';
    if (Math.abs(blow(instOn('steady'), heroAt(gap), rat, N) / base - ratio) > 6e-4) return 'a skill 20 Levels behind moved the blow x' + blow(instOn('steady'), heroAt(gap), rat, N) / base + ', not x' + ratio;
    const atHero = (sk) => blow(instOn('steady'), rat, { ...heroAt(sk), armorGearPm: 1000 * gl, wardPm: 1000 * gl }, N);
    if (Math.abs(atHero(gap) / atHero(0) - 1 / ratio) > 6e-4) return 'a skill 20 Levels behind moved the blow at the hero x' + atHero(gap) / atHero(0) + ', not x' + 1 / ratio;
    /* in play and on the browser's peer: the unit carries it */
    const ms = party(M, { risk: 'steady', danger: 0 }).map((m) => ({ ...m, snapshot: () => ({ acc: 900, maxHit: 12, def: 1, gearPm: 0, skillGapPm: gap }) }));
    const r = M.cs.simulateHuntInstance({ world: null, nextSwingAtMs: T0, members: ms },
      { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('skill', 1, d, i), monsters: M.MONSTERS, ground: groundRow(), grid: gridOf(M), toMs: T0 + 30000 });
    const hs = (r.world && r.world.units || []).filter((u) => u.side === 'hero');
    if (!hs.length || !hs.every((u) => u.skillGapPm === gap)) return 'a hero unit carries a skill gap of ' + hs.map((u) => u.skillGapPm);
    const side = M.member.memberSide({ key: 'a', seat: 0, equipment: IRON, skills: { melee: M.xp.skillXpForLevel('melee', line[1] - 6) }, levelXp: M.xp.charXpForLevel(L), hp: 100, gold: 0, hero: { role: 'melee_dps', slots: [] } }, { items: M.ITEMS });
    const fr = M.member.frozenOf(side, [], 0, M.MONSTERS), peer = M.member.frozenSide({ key: 'a', seat: 0, unitId: 1, frozen: fr }).member.snapshot();
    if (peer.skillGapPm !== behind.skillGapPm) return 'the browser\'s peer fights at a skill gap of ' + peer.skillGapPm + ', the server\'s ' + behind.skillGapPm;
    return null;
  },
  /* (lane/monster-roles-ford-wings) ROWS KEPT IN THEIR HOURS: a ground whose rows were written at another kill rate (DANGER_GROUNDS
     rowsKillsHead: Hask's Ford's, on its hand rows, which the tier path still plays) pays every kill rowsKillsHead / its reference kills of
     its row's coin and of its drop table, at every step and party size, so its hour's coin and loot stand where its rows were written; a
     ground with none pays exactly the as-built share and the table as written (x 1) */
  rowskept(M) {
    const { DANGER, DANGER_GROUNDS, PAY } = M.dangerData;
    const COIN = (1 + M.wageData.WAGE.payStepCoin) * (1 + DANGER.powerStep) - 1;
    let kept = 0;
    for (const [gid, row] of Object.entries(DANGER_GROUNDS)) {
      const g = M.grounds.HUNT_GROUNDS[gid];
      if (!g) return 'CONTROL: scale ground ' + gid + ' has no ground row';
      const n0 = g.route.reduce((a, p) => a + g.pockets[p].spawns.length, 0) / g.route.length;
      const want = Number.isInteger(row.rowsKillsHead) ? row.rowsKillsHead / (Number.isInteger(row.refKillsHead) ? row.refKillsHead : PAY.refKillsHead) : 1;
      if (want !== 1) kept++;
      for (const s of [0, row.floorStep, row.refStep, row.topStep]) {
        const pull = Math.max(1, Math.min(DANGER.pullMax, Math.round(n0 * Math.pow(1 + DANGER.pullStep, s))));
        /* at the ground's own coin level (lane/scale-early-grounds: DANGER_GROUNDS coinPm, danger.js coinLevelOf), else PAY.coinPm */
        const base = (n0 / pull) * M.danger.gapPayRatio(Math.min(PAY.gapMax, row.topStep - row.refStep, s - row.refStep), COIN) * (Number.isInteger(row.coinPm) ? row.coinPm : PAY.coinPm);
        for (const h of [1, 4]) {
          const got = M.danger.dangerDial(g, s, h).coinPm / base;
          if (Math.abs(got - want) > 1e-9) return gid + ' at step ' + s + ' (' + h + ' heroes) pays a kill x' + got + ' of its row\'s coin, its rows are kept at x' + want;
        }
        /* its drop table at the reference step, for a lone hero and a four: the table as written, x the same ratio */
        for (const h of [1, 4]) {
          const dropAt = M.danger.dangerDial(g, row.refStep, h).dropPm / 1000;
          if (Math.abs(dropAt - want) > 1e-9) return gid + ' at its reference step (' + h + ' heroes) drops x' + dropAt + ' of its table, its rows are kept at x' + want;
        }
      }
    }
    if (!kept) return 'CONTROL: no scale ground keeps rows written at another kill rate';
    return null;
  },
  loot(M) {
    const { DANGER, DANGER_GROUNDS, PAY } = M.dangerData;
    /* EVERY SCALE GROUND, each on its monster formula (lane/monster-roles-ford-wings): its pull is sized to the party, and its loot follows
       THAT pull, as a hand ground's follows its as-built one (a formula ground read the as-built pull until this lane: an hour's loot jumped
       where the two pulls round apart, Muster under 547, the Ford under 579) */
    let sizes = 0;
    for (const [gid, row] of Object.entries(DANGER_GROUNDS)) {
      const g = M.grounds.HUNT_GROUNDS[gid];
      if (!g) return 'CONTROL: scale ground ' + gid + ' has no ground row';
      const d = (s) => M.danger.dangerDial(g, s);
      /* (a ground whose rows were written at another kill rate drops that ratio more of them at every step: the case rowskept) */
      const kept = Number.isInteger(row.rowsKillsHead) ? row.rowsKillsHead / (Number.isInteger(row.refKillsHead) ? row.refKillsHead : PAY.refKillsHead) : 1;
      if (Math.abs(d(row.refStep).dropPm / kept - 1000) > 1e-9) return gid + ': the reference step drops ' + d(row.refStep).dropPm + ' permille of the table, not the table x' + kept;
      /* an hour's loot: dropPm x the pull's size (a pull's length grows by the step's health, paid back in the ratio) */
      const hour = (s) => d(s).dropPm * d(s).pull[0];
      const want = (1 + PAY.payStepLoot) * (1 + DANGER.powerStep);
      for (let s = row.refStep; s < row.topStep; s++) {
        const got = hour(s + 1) / hour(s);
        if (Math.abs(got - want) > 1e-9) return gid + ': step ' + s + ' to ' + (s + 1) + ': a pull\'s loot grew x' + got + ', not x' + want;
      }
      /* under the reference, an hour's loot is the depth ratio exactly, floored, whatever the pull's size */
      for (let s = row.floorStep; s < row.refStep; s++) {
        if (d(s + 1).pull[0] !== d(s).pull[0]) sizes++;
        const r = hour(s) / hour(row.refStep), want2 = Math.max(PAY.floor, 1 / Math.pow(want, row.refStep - s));
        if (Math.abs(r / want2 - 1) > 1e-6) return gid + ': step ' + s + ' under the reference drops x' + r + ' of the reference pull\'s loot, want x' + want2;
      }
    }
    if (!sizes) return 'CONTROL: no scale ground\'s pull changes size under its reference';
    /* the kill's rolls read it: a row's chance x dropPm / 1000, a certainty untouched, never over 0.95 */
    const asked = [];
    const rng = { chance: (pp) => { asked.push(pp); return false; }, int: (a) => a };
    const mk = () => ({ family: 'sword', bonus: () => 0, weakness: () => ({ dropMult: 1 }), state: { stats: {}, gold: 0 }, hs: { tally: { kills: 0 } }, fx: {} });
    /* a monster whose table holds a certainty and a chance */
    const kind = Object.keys(M.MONSTERS).find((k) => { const dr = M.MONSTERS[k].drops || []; return dr.some((x) => x.ch >= 1) && dr.some((x) => x.ch > 0 && x.ch < 0.4); });
    if (!kind) return 'CONTROL: no monster drops a certainty beside a chance';
    const table = M.MONSTERS[kind].drops;
    const w = { units: [{ id: 1, side: 'hero', alive: true }, { id: 9, side: 'mon', kind, alive: true, hp: 0 }] };
    const rolls = (tier) => { asked.length = 0; M.rewards.rewardSwing(new Map([[1, mk()]]), [{ type: 'kill', u: 1, t: 9, atMs: 0 }], w, { rng, monsters: M.MONSTERS, ...(tier ? { tier } : {}) }); return asked.slice(0, table.length); };
    const plain = rolls(null), deep = rolls({ coinPm: 1000, dropPm: 2000 });
    if (plain.length !== table.length) return 'CONTROL: a ' + kind + ' kill rolled ' + plain.length + ' of its ' + table.length + ' rows';
    for (let i = 0; i < plain.length; i++) {
      const ch = table[i].ch, w2 = ch >= 1 ? 1 : Math.min(0.95, plain[i] * 2);
      if (Math.abs(deep[i] - w2) > 1e-12) return 'a row rolled at ' + deep[i] + ' with dropPm 2000, want ' + w2 + ' (plain ' + plain[i] + ')';
    }
    return null;
  },
  /* (lane/ledger-l1-l3, 19-power-ledger.md section 2 and L1) THE LEDGER'S CLAMP: a hero at Levels 10, 30, 60 and 200 reads the caps of
     section 2 (build 0.7 / 2.1 / 4.2 / 14, consumables 0.3 / 0.9 / 1.8 / 6), and what a hero FINDS never ramps (Tyler 2026-11-22: "I
     don't want to punish people who are theory crafting or getting lucky with drops"): the gear slice (Traits and the Signature) is 20 and
     Temper 5 at every Level, a Trait counts whole at Level 10. Rows of a ramping slice are written at full size and counted x ramp (a vow
     +18 / -8 nets 1.5 at Level 30, 10 at 200); a gains-only slice clamps its gains and never its costs, the build slice its net; one key
     counts its largest; an ally's party-wide row reaches the hero whole and outside its own cap, counted once; and on the scale the
     engine's power step reads the clamped steps on a blow at a monster (offense) and at the hero (defense), never off the scale. */
  ledger(M) {
    const { sliceCap, clampLedger, ledgerSteps } = M.ledger;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const want = { 10: { build: 0.7, gear: 20, consumable: 0.3, temper: 5 }, 30: { build: 2.1, gear: 20, consumable: 0.9, temper: 5 },
      60: { build: 4.2, gear: 20, consumable: 1.8, temper: 5 }, 200: { build: 14, gear: 20, consumable: 6, temper: 5 }, 400: { build: 14, gear: 20 } };
    for (const [L, caps] of Object.entries(want)) {
      for (const [s, c] of Object.entries(caps)) if (!near(sliceCap(s, Number(L)), c)) return 'Level ' + L + ' reads a ' + s + ' cap of ' + sliceCap(s, Number(L)) + ', not ' + c;
    }
    if (M.ledgerData.ramp(100) !== 0.5 || M.ledgerData.ramp(250) !== 1 || M.ledgerData.ramp(0) !== 0) return 'the ramp is not min(1, L / 200)';
    const g = (steps, key, o = {}) => ({ slice: 'gear', raises: 'offense', steps, key, ...o });
    const off = (rows, L) => clampLedger(rows, L).offense;
    if (!near(off([g(10, 'a'), g(10, 'b')], 10), 20)) return 'two Traits at Level 10 read ' + off([g(10, 'a'), g(10, 'b')], 10) + ', not whole (20): found gear was scaled by Level';
    if (!near(off([g(10, 'a'), g(10, 'b'), g(10, 'c')], 200), 20)) return 'three Traits were not held to the gear cap 20';
    if (!near(off([g(7, 'a'), g(10, 'a')], 200), 10)) return 'two Traits of one key stacked: ' + off([g(7, 'a'), g(10, 'a')], 200);
    if (!near(clampLedger([{ slice: 'temper', raises: 'offense', steps: 5 }], 10).offense, 5)) return 'Temper was scaled by Level';
    if (sliceCap('clan', 200) !== 0 || clampLedger([{ slice: 'clan', raises: 'offense', steps: 4 }], 200).offense !== 0) return 'the clan slice counts before clans ship';
    /* a trade (Hask's Bargain): its gain whole under the cap, its cost whole */
    const trade = clampLedger([g(18, 'bargain'), g(-10, 'bargain', { raises: 'defense' })], 60);
    if (!near(trade.offense, 18) || !near(trade.defense, -10)) return 'a trade at Level 60 reads ' + JSON.stringify(trade) + ', not its gain and its cost whole';
    if (!near(off([g(15, 'a'), g(15, 'b'), g(-6, 'c')], 200), 14)) return 'a gains-only slice clamped its cost (' + off([g(15, 'a'), g(15, 'b'), g(-6, 'c')], 200) + ', not 20 - 6)';
    /* the build slice: the net, x ramp; a vow (+18 / -8) lands at 10 at full size and 1.5 at Level 30; two at the cap; a net cost never clamped */
    const b = (steps, key) => ({ slice: 'build', raises: 'offense', steps, key });
    if (!near(off([b(18, 'v1'), b(-8, 'v1c')], 200), 10)) return 'a vow at Level 200 nets ' + off([b(18, 'v1'), b(-8, 'v1c')], 200) + ', not 10';
    if (!near(off([b(18, 'v1'), b(-8, 'v1c')], 30), 1.5)) return 'a vow at Level 30 nets ' + off([b(18, 'v1'), b(-8, 'v1c')], 30) + ', not 1.5 (its numbers x ramp)';
    if (!near(off([b(18, 'v1'), b(18, 'v2'), b(-8, 'c1'), b(-8, 'c2')], 200), 14)) return 'two vows were not held to the build cap 14';
    if (!near(off([b(-20, 'c')], 200), -20)) return 'a net build cost was clamped';
    /* an ally's party row: whole, outside this hero's cap, counted once a key */
    const lent = g(7, 'boss', { scope: 'party', worn: false });
    if (!near(off([g(10, 'a'), g(10, 'b'), lent], 200), 27)) return 'an ally\'s party row took room in the hero\'s own cap: ' + off([g(10, 'a'), g(10, 'b'), lent], 200);
    if (!near(off([g(4, 'boss'), lent], 200), 7) || !near(off([g(10, 'boss'), lent], 200), 10)) return 'a party row and the hero\'s own of one key both counted';
    if (clampLedger([{ slice: 'luck', raises: 'offense', steps: 9 }, { slice: 'gear', raises: 'speed', steps: 9 }, g(NaN, 'x')], 200).offense !== 0) return 'a row of no slice, channel or number counted';
    if (ledgerSteps({ heroLv: 200 }, 'offense') !== 0) return 'a unit with no ledger read steps';
    /* in the engine: the power step reads the clamped steps */
    const { DANGER, DANGER_GROUNDS } = M.dangerData;
    const ref = 1000 * DANGER_GROUNDS.muster_barrows.gearLevel;
    const rng = { chance: () => false, int: (a) => a };
    const instOn = (risk) => ({ world: { risk, units: [] }, ground: { id: 'muster_barrows' }, monsters: M.MONSTERS, tier: null });
    const blow = (inst, from, to, n) => M.hunt.damage.hurt(inst, { ...to, alive: true, hp: 1e9, maxHp: 1e9 }, n, from, null, null, rng).dmg;
    const heroAt = (lv, ledger) => ({ side: 'hero', id: 1, gearPm: ref, armorGearPm: ref, wardPm: ref, heroLv: lv, ledger });
    const rat = { side: 'mon', id: 2, kind: 'rat' };
    const N = 100000, r = (s) => Math.pow(1 + DANGER.powerStep, s);
    const base = blow(instOn('steady'), heroAt(60), rat, N);
    const rows = [b(14, 'v')];
    if (blow(instOn(''), heroAt(60, rows), rat, N) !== blow(instOn(''), heroAt(60), rat, N)) return 'the ledger stepped a blow off the scale';
    const at60 = blow(instOn('steady'), heroAt(60, rows), rat, N) / base, at200 = blow(instOn('steady'), heroAt(200, rows), rat, N) / blow(instOn('steady'), heroAt(200), rat, N);
    if (Math.abs(at60 - r(4)) > 6e-4 || Math.abs(at200 - r(14)) > 6e-4) return 'the engine stepped a blow x' + at60 + ' at Level 60 and x' + at200 + ' at 200, not x' + r(4) + ' and x' + r(14);
    const def = [g(10, 'a', { raises: 'defense' })];
    const hit = blow(instOn('steady'), rat, heroAt(20, def), N) / blow(instOn('steady'), rat, heroAt(20), N);
    if (Math.abs(hit - 1 / r(10)) > 6e-4) return 'a defense Trait moved the blow at a Level 20 hero x' + hit + ', not x' + 1 / r(10);
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
  /* lane/foundations-block: the skill part and loot by depth */
  { name: 'the skill part never reaches a blow at a monster', case: 'skill', edits: [['src/core/hunt/amount.js', 'export const offensePm = (u) => ratingPm({ levelPm: 1000 * lvOf(u), gearPm: int(u.gearPm), skillLevelPm: skillPmOf(u) });', 'export const offensePm = (u) => ratingPm({ levelPm: 1000 * lvOf(u), gearPm: int(u.gearPm) });']] },
  { name: 'the skill part never reaches a blow at the hero', case: 'skill', edits: [['src/core/hunt/amount.js', 'gearPm: int(ward ? u.wardPm : u.armorGearPm), skillLevelPm: skillPmOf(u) });', 'gearPm: int(ward ? u.wardPm : u.armorGearPm) });']] },
  { name: 'the snapshot reads the skill, not its Level on the line', case: 'skill', edits: [['src/core/member.js', 'const skillGapPm = skillLv === null ? 0 : skillLv - 1000 * level;', 'const skillGapPm = 0;']] },
  { name: 'the unit never carries the skill part', case: 'skill', edits: [['src/core/combat-sim.js', '  u.skillGapPm = Number.isInteger(snap.skillGapPm) ? snap.skillGapPm : 0;\n', '']] },
  { name: 'the browser\'s peer fights on its line', case: 'skill', edits: [['src/core/member.js', '      skillGapPm: snap.skillGapPm || 0,\n', '']] },
  { name: 'loot does not follow depth', case: 'loot', edits: [['src/core/hunt/danger.js', 'const dropPmAt = (ground, s, n, pull) => ((1000 * pullAt(n, refOf(ground))) / pull) * depthRatio(ground, s, LOOT_STEP) * rowsKeptOf(ground);', 'const dropPmAt = (ground) => 1000 * rowsKeptOf(ground);']] },
  /* (lane/monster-roles-ford-wings) a ground's rows written at another kill rate are not kept in their hours, or kept upside down */
  { name: 'coin is never kept at the kill rate it was written for', case: 'rowskept', edits: [['src/core/hunt/danger.js', '  dial.coinPm *= rowsKeptOf(ground);\n', '']] },
  { name: 'the drop table is never kept at the kill rate it was written for', case: 'rowskept', edits: [['src/core/hunt/danger.js', ' * depthRatio(ground, s, LOOT_STEP) * rowsKeptOf(ground);', ' * depthRatio(ground, s, LOOT_STEP);']] },
  { name: 'rows are kept upside down', case: 'rowskept', edits: [['src/core/hunt/danger.js', 'row.rowsKillsHead / refKillsOf(ground)', 'refKillsOf(ground) / row.rowsKillsHead']] },
  /* (lane/monster-roles-ford-wings) a formula ground's loot reads the as-built pull, not the one it fights */
  { name: 'a formula ground\'s loot follows the as-built pull', case: 'loot', edits: [['src/core/hunt/danger.js', '  dial.dropPm = dropPmAt(ground, s, nf, pull);\n', '']] },
  { name: 'loot pays the step a pull, not an hour', case: 'loot', edits: [['src/core/hunt/danger.js', 'const LOOT_STEP = (1 + PAY.payStepLoot) * (1 + DANGER.powerStep) - 1;', 'const LOOT_STEP = PAY.payStepLoot;']] },
  { name: 'a bigger pull drops more of the table', case: 'loot', edits: [['src/core/hunt/danger.js', 'const dropPmAt = (ground, s, n, pull) => ((1000 * pullAt(n, refOf(ground))) / pull) * depthRatio(ground, s, LOOT_STEP) * rowsKeptOf(ground);', 'const dropPmAt = (ground, s) => 1000 * depthRatio(ground, s, LOOT_STEP) * rowsKeptOf(ground);']] },
  { name: 'the kill\'s rolls never read the depth', case: 'loot', edits: [['src/core/hunt-rewards.js', 'rollDropTable(row.drops, { depthPm, dropMult:', 'rollDropTable(row.drops, { dropMult:']] },
  { name: 'depth scales a certainty', case: 'loot', edits: [['src/core/drops.js', '  if (row.ch >= 1) return Math.min(1, row.ch);\n', '']] },
  /* lane/moves-pass-1: the holder's line */
  { name: 'the holder reads the stance\'s own line', case: 'holder', edits: [['src/core/hunt/danger.js', 'const marginOf = (pm, seat, hs) => (hs !== null && seat === hs && pm < 1000 ?', 'const marginOf = (pm, seat, hs) => (false && hs !== null && seat === hs && pm < 1000 ?']] },
  { name: 'the margin keeps the lowest HP, not the hero furthest under its line', case: 'holder', edits: [['src/core/hunt/danger.js', '  if (marginOf(pm, seat, hs) >= marginOf(w.low, w.lowHero, hs)) return;\n', '  if (pm >= w.low) return;\n']] },
  { name: 'a fall back names the margin, not the HP the hero reached', case: 'holder', edits: [['src/core/hunt/danger.js', "{ step: from, to: w.danger, low, why,", "{ step: from, to: w.danger, low: margin, why,"]] },
  { name: 'the holder climbs on the stance\'s own line', case: 'holder', edits: [['src/core/hunt/danger.js', '  } else if (margin >= st.cleanPm) {', '  } else if (low >= st.cleanPm) {']] },
  { name: 'the break-off reads the HP, not the margin', case: 'holder', edits: [['src/core/hunt/danger.js', ' && marginPm(inst) < RISKS[inst.world.risk].fallPm;', ';']] },
  { name: 'the step never climbs', case: 'rule', edits: [['src/core/hunt/danger.js', "why = 'climb'; to = from + w.climb;", "why = 'climb'; to = from;"]] },
  { name: 'the climb never doubles', case: 'rule', edits: [['src/core/hunt/danger.js', 'w.climb = Math.min(CLIMB.climbMax, w.climb * 2);', 'w.climb = 1;']] },
  { name: 'a fall back keeps the doubled climb', case: 'rule', edits: [['src/core/hunt/danger.js', 'w.climb = 1; w.clean = 0; w.cool = CLIMB.coolPulls;', 'w.clean = 0; w.cool = CLIMB.coolPulls;']] },
  { name: 'no cool-down after a fall back', case: 'rule', edits: [['src/core/hunt/danger.js', '  if (cooling) w.cool -= 1;\n', '  if (cooling) w.cool = 0;\n']] },
  { name: 'a clean pull in the cool-down counts', case: 'rule', edits: [['src/core/hunt/danger.js', '    if (!cooling && cleared) {\n      w.clean += 1;', '    if (cleared) {\n      w.clean += 1;']] },
  { name: 'the fall back ignores the stance\'s trigger', case: 'rule', edits: [['src/core/hunt/danger.js', 'if (low <= 0 || margin < st.fallPm) {', 'if (low <= 0) {']] },
  { name: 'a death falls no further than a fall back', case: 'rule', edits: [['src/core/hunt/danger.js', 'to = from - (low <= 0 ? CLIMB.deathSteps : CLIMB.fallSteps);', 'to = from - CLIMB.fallSteps;']] },
  { name: 'the clean run does not survive a settle cut', case: 'trace', edits: [['src/core/hunt/danger.js', "['climb', 'int'], ['clean', 'int'], ['low', 'int'],", "['climb', 'int'], ['low', 'int'],"]] },
  { name: 'the climb does not survive a settle cut', case: 'trace', edits: [['src/core/hunt/danger.js', "['danger', 'int'], ['climb', 'int'], ['clean', 'int'],", "['danger', 'int'], ['clean', 'int'],"]] },
  { name: 'the margin is never read where HP falls', case: 'trace', edits: [['src/core/hunt/damage.js', '  if (!isMonster(target) && r.dmg > 0) noteHurt(inst, target, source);\n', '']] },
  { name: 'the engine never opens the plan', case: 'trace', edits: [['src/core/combat-sim.js', '          if (plan) openDanger(world, plan.risk, tier.step);\n', '']] },
  { name: 'a hunt with no stance opens on one', case: 'off', edits: [['src/core/combat-sim.js', '  return riskOf(lead);\n}', "  return riskOf(lead) || { risk: 'steady', step: 0 };\n}"]] },
  { name: 'the regroup never waits for readiness', case: 'ready', edits: [['src/core/hunt/danger.js', 'return heroes.every((h) => !h.alive || h.hp * 1000 >= DANGER.readyPm * h.maxHp);', 'return heroes.length >= 0;']] },
  { name: 'readiness is read off the scale too', case: 'ready', edits: [['src/core/hunt/danger.js', '  if (!dangerOn(inst.world)) return true;\n  return heroes.every', '  return heroes.every']] },
  { name: 'a death leaves the stance as it was', case: 'rule', edits: [['src/core/hunt/danger.js', "  if (why === 'death' && own(RISKS, st.afterDeath)) w.risk = st.afterDeath;\n", '']] },
  { name: 'monsters swing on after a hero is under the line', case: 'breakoff', edits: [['src/core/hunt/damage.js', '      if (breaksOff(inst)) continue;\n', '']] },
  { name: 'a pull is never broken off', case: 'breakoff', edits: [['src/core/hunt/pull-cycle.js', '    } else if (breaksOff(inst)) breakOff(inst, sc);\n', '    }\n']] },
  { name: 'the broken-off pack stays on the party', case: 'breakoff', edits: [['src/core/hunt/pull-cycle.js', '  for (let p = 0; p < w.packs.length; p++) if (w.packs[p].aggro) resetPack(inst, p, sc);\n  for (const h of heroes(inst)) h.target = null;\n', '  for (const h of heroes(inst)) h.target = null;\n']] },
  { name: 'a break-off moves on to the next pocket', case: 'breakoff', edits: [['src/core/hunt/pull-cycle.js', 'w.phase = PHASE.REGROUP; w.phaseMs = HUNT_TUNING.regroupMs; w.regroupNext = false;\n}', 'w.phase = PHASE.REGROUP; w.phaseMs = HUNT_TUNING.regroupMs; w.regroupNext = true;\n}']] },
  { name: 'Bold breaks off like Steady', case: 'breakoff', edits: [['src/core/hunt/danger.js', 'dangerOn(inst.world) && RISKS[inst.world.risk].breakOff !== false\n', 'dangerOn(inst.world)\n']] },
  { name: 'the break-off waits for the climb threshold', case: 'breakoff', edits: [['src/core/hunt/danger.js', 'inst.world.low < RISKS[inst.world.risk].fallPm && marginPm(inst) < RISKS[inst.world.risk].fallPm;', 'inst.world.low < RISKS[inst.world.risk].cleanPm && marginPm(inst) < RISKS[inst.world.risk].cleanPm;']] },
  { name: 'a size change puts a jump in the curve', case: 'scale', edits: [['src/core/hunt/danger.js', 'const share = n0 / pull;', 'const share = 1;']] },
  { name: 'the step raises the aim too', case: 'scale', edits: [['src/core/hunt/danger.js', 'aimPm: 1000, lvPm: 1000,', 'lvPm: 1000,']] },
  { name: 'the scale pays the row XP again', case: 'pay', edits: [['src/core/hunt/xp-share.js', '  if (world && dangerOn(world)) return depthSplit(heroes, sc, ground, world.danger);\n', '']] },
  { name: 'the hours are not the formula', case: 'pay', edits: [['src/core/hunt/danger.js', '  return levelHoursOf(level);', '  return levelHoursOf(level) * (level > 60 ? 1.01 : 1);']] },
  { name: 'depth pays past the gap ceiling', case: 'pay', edits: [['src/core/hunt/danger.js', '  return Math.min(PAY.gapMax, row ? row.topStep - row.refStep : PAY.gapMax, clampStep(step) - (row ? row.refStep : 0));', '  return clampStep(step) - (row ? row.refStep : 0);']] },
  /* lane/scale-early-grounds: a formula ground pays the hours table where its reference company holds, not at the monsters' anchor */
  { name: 'the pay reads the monsters\' anchor', case: 'pay', edits: [['src/core/hunt/danger.js', 'clampStep(step) - (row ? row.refStep : 0));', 'clampStep(step) - (row ? formulaStepOf(row) : 0));']] },
  { name: 'depth does not pay', case: 'pay', edits: [['src/core/hunt/danger.js', '  return levelShareAt(level, refKillsOf(ground)) * depthRatio(ground, step, PAY.payStepXp);', '  return levelShareAt(level, refKillsOf(ground));']] },
  { name: 'coin does not follow the step', case: 'scale', edits: [['src/core/hunt/danger.js', 'coinPm: share * depthRatio(ground, s, COIN_STEP) * PAY.coinPm };', 'coinPm: share * PAY.coinPm };']] },
  /* lane/econ-levers: one coin ratio a step, and the floor on coin too */
  { name: 'coin climbs at the XP ratio again', case: 'scale', edits: [['src/core/hunt/danger.js', 'coinPm: share * depthRatio(ground, s, COIN_STEP) * PAY.coinPm };', 'coinPm: share * depthRatio(ground, s, PAY.payStepXp) * PAY.coinPm };']] },
  /* lane/ledger-l10: coin paid a step a PULL, so a deeper hour pays about nothing more (+38 held steps: gold +59 +- 63 a hero-hour) */
  { name: 'coin pays the step a pull, not an hour', case: 'scale', edits: [['src/core/hunt/danger.js', 'const COIN_STEP = (1 + WAGE.payStepCoin) * (1 + DANGER.powerStep) - 1;', 'const COIN_STEP = WAGE.payStepCoin;']] },
  { name: 'the floor pays XP only', case: 'floor', edits: [['src/core/hunt/danger.js', 'coinPm: share * depthRatio(ground, s, COIN_STEP) * PAY.coinPm };', 'coinPm: share * (gapOf(ground, s) >= 0 ? powStep(1 + COIN_STEP, gapOf(ground, s)) : 1 / powStep(1 + COIN_STEP, -gapOf(ground, s))) * PAY.coinPm };']] },
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
  { name: 'the margin names the first blow, not the lowest', case: 'falls', edits: [['src/core/hunt/danger.js', '  if (marginOf(pm, seat, hs) >= marginOf(w.low, w.lowHero, hs)) return;\n  w.low = pm;\n  w.lowHero', '  if (marginOf(pm, seat, hs) >= marginOf(w.low, w.lowHero, hs)) return;\n  w.low = pm;\n  if (w.lowHero !== null) return;\n  w.lowHero']] },
  /* lane/r10: the top of the ground, one base a ground, a ground's own rows */
  { name: 'the climb goes past the top', case: 'top', edits: [['src/core/hunt/danger.js', '  w.danger = stepOn(inst.ground, to);', '  w.danger = clampStep(to);']] },
  { name: 'the dial goes past the top', case: 'top', edits: [['src/core/hunt/danger.js', '  const s = stepOn(ground, step);', '  const s = clampStep(step);']] },
  { name: 'the top holds a ground off the scale', case: 'top', edits: [['src/core/hunt/danger.js', 'row && Number.isInteger(row.topStep) ? row.topStep : DANGER.stepMax', 'row && Number.isInteger(row.topStep) ? row.topStep : 710']] },
  { name: 'a start past the top opens past it', case: 'top', edits: [['src/core/combat-sim.js', '          if (plan) openDanger(world, plan.risk, tier.step);', '          if (plan) openDanger(world, plan.risk, plan.step);']] },
  { name: 'pay grows past the top', case: 'top', edits: [['src/data/danger.js', "muster_barrows: ground({ refStep: 610, floorStep: 575, topStep: 700,", "muster_barrows: ground({ refStep: 610, floorStep: 575, topStep: 650,"],
    ['src/core/hunt/danger.js', 'Math.min(PAY.gapMax, row ? row.topStep - row.refStep : PAY.gapMax, ', 'Math.min(PAY.gapMax, ']] },
  { name: 'every ground splits the table over the scale\'s kill rate', case: 'pay', edits: [['src/core/hunt/danger.js', 'return row && Number.isInteger(row.refKillsHead) ? row.refKillsHead : PAY.refKillsHead;', 'return row ? PAY.refKillsHead : PAY.refKillsHead;']] },
  { name: 'a scale drop keeps its reqLv', case: 'ilevel', edits: [['src/data/items.js', 'for (const [id, iL] of Object.entries(SCALE_ITEM_LEVELS)) ITEMS[id] = { ...ITEMS[id], iL };', 'void SCALE_ITEM_LEVELS;'],
    /* every piece's item Level also rides its generated stat row (lane/gear-catalogue-steps): a drop that kept its reqLv kept it there too */
    ['src/data/gear-stats.generated.js', '"mithril_platebody": f({', '"mithril_platebody": f({ iL: 45 }), "mithril_platebody~shipped": f({']] },
  { name: 'the wings drop the ladder tier', case: 'ilevel', edits: [['src/data/danger.js', "    if (row.named === 'catacomb') for (const id of Object.keys(named || {})) put(id, row.gearLevel, g);", '']] },
  { name: 'the power step reads reqLv over iL', case: 'ilevel', edits: [['src/core/hunt/danger.js', 'Number.isInteger(it.iL) ? it.iL : it.reqLv', 'it.reqLv']] },
  { name: 'a ground\'s rows never ride its kills', case: 'drops', edits: [['src/core/hunt/play-rows.js', "  if (!g || !Array.isArray(g.drops) || !g.drops.length) return null;", '  return null;']] },
  { name: 'a ground\'s rows go first', case: 'drops', edits: [['src/core/hunt/play-rows.js', "drops: (out[id].drops || []).concat(g.drops)", "drops: g.drops.concat(out[id].drops || [])"]] },
  { name: 'every ground reads a copied table', case: 'drops', edits: [['src/core/hunt/play-rows.js', "  if (!g || !Array.isArray(g.drops) || !g.drops.length) return null;", "  if (!g) return null;"]] },
  /* lane/r9: the pay floor and the power step */
  { name: 'no pay floor under the reference', case: 'floor', edits: [['src/core/hunt/danger.js', 'Math.max(PAY.floor, 1 / powStep(1 + rate, -g))', '1 / powStep(1 + rate, -g)']] },
  { name: 'the floor lifts the pay over the reference too', case: 'floor', edits: [['src/core/hunt/danger.js', 'return g >= 0 ? powStep(1 + rate, g) : Math.max', 'return g >= 0 ? Math.max(PAY.floor * 2.5, powStep(1 + rate, g)) : Math.max']] },
  { name: 'the ramp is never taken', case: 'ledger', edits: [['src/data/power-ledger.js', '  return L >= POWER_LEDGER.rampLevel ? 1 : L / POWER_LEDGER.rampLevel;', '  return 1;']] },
  { name: 'found gear ramps by Level', case: 'ledger', edits: [['src/data/power-ledger.js', '  gear: Object.freeze({ max: null, ramps: false, signed: false }),', '  gear: Object.freeze({ max: null, ramps: true, signed: false }),']] },
  { name: 'Temper ramps by Level', case: 'ledger', edits: [['src/data/power-ledger.js', '  temper: Object.freeze({ max: POWER_LEDGER.temperStepsMax, ramps: false, signed: false }),', '  temper: Object.freeze({ max: POWER_LEDGER.temperStepsMax, ramps: true, signed: false }),']] },
  { name: 'the clan slice opens early', case: 'ledger', edits: [['src/core/power-ledger.js', '  if (s.open === false) return 0;\n', '']] },
  { name: 'a ramping row counts at full size', case: 'ledger', edits: [['src/core/power-ledger.js', '      gains *= k; costs *= k; lent *= k;\n', '']] },
  { name: 'a gains-only slice clamps its costs', case: 'ledger', edits: [['src/core/power-ledger.js', '(signed ? Math.min(cap, gains + costs) : Math.min(cap, gains) + costs)', 'Math.min(cap, gains + costs)']] },
  { name: 'the build slice clamps gains alone', case: 'ledger', edits: [['src/core/power-ledger.js', '(signed ? Math.min(cap, gains + costs) : Math.min(cap, gains) + costs)', '(Math.min(cap, gains) + costs)']] },
  { name: 'one key stacks', case: 'ledger', edits: [['src/core/power-ledger.js', 'if (r.steps > 0) kv[0] = Math.max(kv[0], r.steps);', 'if (r.steps > 0) kv[0] += r.steps;']] },
  { name: 'an ally\'s party row fills the hero\'s cap', case: 'ledger', edits: [['src/core/power-ledger.js', 'if (g > mine) lent += g; else gains += mine;', 'if (g > mine) gains += g; else gains += mine;']] },
  { name: 'the engine never reads the ledger', case: 'ledger', edits: [['src/core/hunt/amount.js', "      cond += ledgerSteps(source, 'offense',", "      cond += 0 * ledgerSteps(source, 'offense',"]] },
  { name: 'a defense row raises the blow at the hero', case: 'ledger', edits: [['src/core/hunt/amount.js', "    cond -= ledgerSteps(target, 'defense',", "    cond += ledgerSteps(target, 'defense',"]] },
  { name: 'the power step is never read', case: 'power', edits: [['src/core/hunt/amount.js', 'export const stepsOn = (inst) => !!inst && dangerOn(inst.world) && refLevelOf(inst.ground) !== null;', 'export const stepsOn = (inst) => false;']] },
  { name: 'the power step plays off the scale', case: 'power', edits: [['src/core/hunt/amount.js', 'export const stepsOn = (inst) => !!inst && dangerOn(inst.world) && refLevelOf(inst.ground) !== null;', 'export const stepsOn = (inst) => !!inst && refLevelOf(inst.ground) !== null;']] },
  { name: 'armor raises the blows at its wearer', case: 'power', edits: [['src/core/hunt/amount.js', '    gap = (R - defensePm(target, c.ward)) / 1000;', '    gap = (defensePm(target, c.ward) - R) / 1000;']] },
  { name: 'a tier of armor is half its steps at the hero', case: 'power', edits: [['src/core/hunt/amount.js', '    gap = (R - defensePm(target, c.ward)) / 1000;', '    gap = (R - defensePm(target, c.ward)) / 2000;']] },
  { name: 'the slot weights are dropped', case: 'power', edits: [['src/core/hunt/danger.js', '    sum += W[slot] * levelOn(slot);', '    sum += 100 * levelOn(slot);']] },
  { name: 'a two-handed weapon leaves the off-hand weight empty', case: 'power', edits: [['src/core/hunt/danger.js', "const carried = weapon && weapon.twoHanded === true ? GEAR_STEPS.twoHand : null;", 'const carried = null;']] },
  { name: 'the ground reads no gear Level', case: 'power', edits: [['src/core/hunt/amount.js', '  const r = b ? b.refPm :', '  const r = b ? b.refPm - 20000 :']] },
  { name: 'the weight under the base is the weight over it', case: 'power', edits: [['src/core/bands.js', 'const wG = gGap < 0 ? POWER.weightGearBelowPm : POWER.weightGearPm;', 'const wG = POWER.weightGearPm;']] },
  { name: 'the snapshot carries no gear part', case: 'power', edits: [['src/core/member.js', '    gearPm,\n', '\n']] },
  { name: 'the frozen row drops the gear part', case: 'power', edits: [['src/core/member.js', '...jewelSnap(snap), gearPm: snap.gearPm || 0,\n', '...jewelSnap(snap),\n']] },
  { name: 'the unit never carries the gear part', case: 'power', edits: [['src/core/combat-sim.js', '  u.gearPm = Number.isInteger(snap.gearPm) ? snap.gearPm : 0;\n', '']] },
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
