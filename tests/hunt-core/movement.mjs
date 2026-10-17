// tests/hunt-core/movement.mjs — src/core/hunt/movement.js (spec §3.1 #1-4, #8, #10-11; parity MV-01..12,
// RO-07/08). Run by tests/hunt-core/run-all.mjs.
import { suite, hero, mon, world, instOf, subStep, move } from './fixtures/h1.js';

const at = (u) => u.x + ',' + u.y;

const cases = {
  /* MV-03 / §3.1 #1: two heroes walk the one-tile corridor head-on and pass straight through. */
  'heroes-pass-through': (M) => {
    const a = hero(M, 1, 5, 8); const b = hero(M, 2, 13, 8);
    const inst = instOf(M, world(M, [a, b]));
    M.movement.setGoal(inst, a, 13, 8); M.movement.setGoal(inst, b, 5, 8);
    let waited = 0;
    move(M, inst, 26, subStep(), () => { waited += a.waitMs + b.waitMs; });
    if (at(a) !== '13,8' || at(b) !== '5,8') return 'they did not pass: a ' + at(a) + ', b ' + at(b);
    if (waited) return 'a hero waited on a hero (' + waited + ' ms)';
    return null;
  },
  /* MV-03 / §3.1 #2: a monster blocks a hero, a hero blocks a monster, a monster blocks a monster. */
  'monsters-block': (M) => {
    const h = hero(M, 1, 5, 8); const m = mon(M, 2, 2, 9, 8);
    let inst = instOf(M, world(M, [h, m]));
    M.movement.setGoal(inst, h, 13, 8);
    let onMonster = false; let waited = false;
    move(M, inst, 40, subStep(), () => { if (at(h) === '9,8') onMonster = true; if (h.waitMs > 0) waited = true; });
    if (onMonster || !waited) return 'a hero walked through a monster';
    /* MV-05: after blockedRepathMs it re-plans round the blocker (here: up through the rooms). */
    move(M, inst, 80, subStep(), () => { if (at(h) === '9,8') onMonster = true; });
    if (onMonster || at(h) !== '13,8') return 'the blocked hero did not re-route to its goal (at ' + at(h) + ')';
    const m2 = mon(M, 2, 2, 5, 8); const stand = hero(M, 1, 9, 8);
    inst = instOf(M, world(M, [stand, m2]));
    M.movement.setGoal(inst, m2, 13, 8);
    move(M, inst, 40, subStep());
    if (m2.x !== 8) return 'a monster walked through a hero (monster at ' + at(m2) + ')';
    const m3 = mon(M, 1, 2, 5, 8); const wall = mon(M, 2, 2, 9, 8);
    inst = instOf(M, world(M, [m3, wall]));
    M.movement.setGoal(inst, m3, 13, 8);
    move(M, inst, 40, subStep());
    if (m3.x !== 8) return 'a monster walked through a monster (at ' + at(m3) + ')';
    return null;
  },
  /* MV-04 / MV-06 (not rebuilt): a standing hero is never swapped or pushed by one walking through. */
  'no-hero-swap': (M) => {
    const walker = hero(M, 1, 5, 8); const idle = hero(M, 2, 9, 8);
    const inst = instOf(M, world(M, [walker, idle]));
    M.movement.setGoal(inst, walker, 13, 8);
    let shared = false; let moved = false;
    move(M, inst, 30, subStep(), () => {
      if (at(walker) === '9,8') shared = true;
      if (at(idle) !== '9,8' || idle.fx !== 9) moved = true;
    });
    if (moved) return 'the idle hero was moved';
    if (!shared || at(walker) !== '13,8') return 'the walker did not walk through the idle hero';
    return null;
  },
  /* MV-02 / §3.1 #11: the budget rolls from tile to tile with no stop at the centre. */
  'continuous-roll-between-tiles': (M) => {
    const h = hero(M, 1, 5, 8);
    const inst = instOf(M, world(M, [h]));
    M.movement.setGoal(inst, h, 13, 8);
    move(M, inst, 4, subStep());
    /* 4 x 320 = 1280 millitiles: one tile done, 280 into the second. */
    if (h.fx !== 6 || h.x !== 7 || h.prog !== 280) return 'after 4 sub-steps expected fx 6, x 7, prog 280; got ' + [h.fx, h.x, h.prog];
    move(M, inst, 6, subStep());
    if (h.fx !== 8 || h.x !== 9 || h.prog !== 200) return 'after 10 sub-steps expected fx 8, x 9, prog 200; got ' + [h.fx, h.x, h.prog];
    const d = hero(M, 2, 2, 2);
    const inst2 = instOf(M, world(M, [d]));
    M.movement.setGoal(inst2, d, 5, 5);
    move(M, inst2, 5, subStep());
    /* 1600 millitiles on 1414-long diagonals: one done, 186 into the next. */
    if (d.fx !== 3 || d.x !== 4 || d.prog !== 186) return 'diagonal roll: expected fx 3, x 4, prog 186; got ' + [d.fx, d.x, d.prog];
    return null;
  },
  /* MV-08 / MV-09 / §3.1 #8: the follower walks the trail until it has a target of its own. */
  'follow-trail-until-target': (M) => {
    const lead = hero(M, 1, 12, 3); const f = hero(M, 2, 13, 3);
    const w = world(M, [lead, f], { leader: 1 });
    const inst = instOf(M, w);
    M.movement.setGoal(inst, lead, 2, 8);
    const sc = subStep();
    for (let i = 0; i < 30; i++) {
      M.movement.recordTrail(inst); M.movement.followTrail(inst); M.movement.moveAll(inst, sc);
    }
    if (w.trail.length < 5) return 'the leader left no trail';
    if (f.x >= 12) return 'the follower did not follow (at ' + at(f) + ')';
    const slot = w.trail[w.trail.length - 1 - 2];
    if (!f.goal || f.goal[0] !== slot[0] || f.goal[1] !== slot[1]) {
      /* it may be one re-aim behind; it must at least be aiming at a trail tile */
      if (!w.trail.some((t) => f.goal && t[0] === f.goal[0] && t[1] === f.goal[1])) return 'the follower is not aiming at the trail';
    }
    f.target = 99;
    const held = JSON.stringify(f.goal);
    for (let i = 0; i < 20; i++) { M.movement.recordTrail(inst); M.movement.followTrail(inst); M.movement.moveAll(inst, sc); }
    if (JSON.stringify(f.goal) !== held) return 'a hero with its own target was still pulled along the trail';
    return null;
  },
  /* RO-07: no two heroes claim one tile. */
  'spot-claimed-once': (M) => {
    const a = hero(M, 1, 12, 2); const b = hero(M, 2, 12, 5);
    const inst = instOf(M, world(M, [a, b]));
    const pick = (best) => ({ pocket: 0, best, bestScore: 1, curScore: 5, hysteresis: 0.5, valid: () => true });
    if (JSON.stringify(M.movement.chooseSpot(inst, a, pick([16, 3]))) !== '[16,3]') return 'the first hero could not claim a free spot';
    if (M.movement.chooseSpot(inst, b, pick([16, 3])) !== null) return 'a second hero claimed a taken spot';
    if (!M.movement.spotTaken(inst, b, 16, 3)) return 'spotTaken does not see the claim';
    return null;
  },
  /* RO-08 / §3.1 #10: kept while valid; given up only for a tile better by the hysteresis; never re-picked en route. */
  'hysteresis-holds-spot': (M) => {
    const a = hero(M, 1, 16, 3, { spot: [16, 3] });
    const inst = instOf(M, world(M, [a]));
    const pick = (bestScore) => ({ pocket: 0, best: [14, 2], bestScore, curScore: 10, hysteresis: 0.5, valid: () => true });
    if (JSON.stringify(M.movement.chooseSpot(inst, a, pick(9.6))) !== '[16,3]') return 'a 0.4-better tile moved the hero (hysteresis 0.5)';
    if (JSON.stringify(M.movement.chooseSpot(inst, a, pick(9.5))) !== '[14,2]') return 'a 0.5-better tile did not move the hero';
    /* now en route to (14,2): a far better tile does not re-pick it */
    const enRoute = { pocket: 0, best: [17, 6], bestScore: 0, curScore: 10, hysteresis: 0.5, valid: () => true };
    if (JSON.stringify(M.movement.chooseSpot(inst, a, enRoute)) !== '[14,2]') return 'the spot was re-picked en route';
    /* an invalid held spot is released for the best one */
    const lost = { pocket: 0, best: [17, 6], bestScore: 3, curScore: 10, hysteresis: 0.5, valid: (x, y) => !(x === 14 && y === 2) };
    if (JSON.stringify(M.movement.chooseSpot(inst, a, lost)) !== '[17,6]') return 'an invalid spot was kept';
    return null;
  },
  /* MV-07 */
  'facing-8-way': (M) => {
    const want = { '0,1': 'south', '1,1': 'south-east', '1,0': 'east', '1,-1': 'north-east', '0,-1': 'north', '-1,-1': 'north-west', '-1,0': 'west', '-1,1': 'south-west' };
    for (const [k, name] of Object.entries(want)) {
      const [dx, dy] = k.split(',').map(Number);
      if (M.movement.DIRS[M.movement.dirOf(dx * 3, dy * 2)] !== name) return k + ' should face ' + name;
    }
    return null;
  },
  /* MV-01: the same goal keeps its path. */
  'same-goal-keeps-path': (M) => {
    const h = hero(M, 1, 5, 8);
    const inst = instOf(M, world(M, [h]));
    M.movement.setGoal(inst, h, 13, 8);
    const p = h.path;
    M.movement.setGoal(inst, h, 13, 8);
    return h.path === p ? null : 'the same goal re-planned';
  },
};

const MV = 'src/core/hunt/movement.js';
const mutants = [
  { name: 'heroes block heroes', case: 'heroes-pass-through',
    edits: [[MV, "  return u.side === 'mon' && (inst.occ.hero.get(k) || 0) > 0;", '  return (inst.occ.hero.get(k) || 0) > 0;']] },
  { name: 'heroes do not block monsters', case: 'monsters-block',
    edits: [[MV, "  return u.side === 'mon' && (inst.occ.hero.get(k) || 0) > 0;", '  return false;']] },
  { name: 'a unit stops at every tile centre', case: 'continuous-roll-between-tiles',
    edits: [[MV, '      if (u.prog >= len) { u.fx = u.x; u.fy = u.y; u.prog = 0; }\n      continue;', '      if (u.prog >= len) { u.fx = u.x; u.fy = u.y; u.prog = 0; break; }\n      continue;']] },
  { name: 'followers ignore their own target', case: 'follow-trail-until-target',
    edits: [[MV, '    if (!u.alive || Number.isInteger(u.target)) continue;', '    if (!u.alive) continue;']] },
  { name: 'a claimed spot is not reserved', case: 'spot-claimed-once',
    edits: [[MV, "  return inst.world.units.some((v) => v !== hero && v.alive && v.side === 'hero' && v.spot && v.spot[0] === x && v.spot[1] === y);", '  return false;']] },
  { name: 'no hysteresis', case: 'hysteresis-holds-spot',
    edits: [[MV, 'pick.bestScore + pick.hysteresis > pick.curScore', 'pick.bestScore > pick.curScore']] },
  { name: 're-pick en route', case: 'hysteresis-holds-spot',
    edits: [[MV, '    if (enRoute || !pick.best ||', '    if (!pick.best ||']] },
];

await suite('hunt-core/movement', cases, mutants);
