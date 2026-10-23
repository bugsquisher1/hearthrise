// tests/hunt-core/targeting.mjs — src/core/hunt/targeting.js (spec §3.2 #11-15; parity TG-01..08). Run by run-all.mjs.
import { suite, H, E, inst2, sc2, world } from './fixtures/h2.js';

const T = 'src/core/hunt/targeting.js';
const ids = (list) => list.map((u) => u.id).join(',');
const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight' }, o || {})));

const cases = {
  /* TG-01: each target mode orders the engaged monsters its own way; ties by id. */
  'mode-order-each': (M) => {
    const u = H(M, 1, 11, 3, 'ranger');
    const a = E(M, 2, 0, 12, 3, 1, { hp: 9, maxHp: 9 });
    const b = E(M, 3, 0, 16, 5, 1, { hp: 2, maxHp: 20 });
    const c = E(M, 4, 0, 14, 1, 1, { hp: 15, maxHp: 15 });
    const idle = M.worldstate.makeUnit({ id: 5, side: 'mon', kind: 'rat', pocket: 0, alive: true, hp: 1, maxHp: 1, x: 11, y: 4, fx: 11, fy: 4 });
    const inst = fight(M, [u, a, b, c, idle, H(M, 9, 17, 2, 'tank')], { leader: 9, leaderLast: 3 });
    const want = { nearest: '2,4,3', weakest: '3,2,4', strongest: '3,4,2', follow: '3,2,4' };
    for (const [mode, order] of Object.entries(want)) {
      const got = ids(M.targeting.pickTargets(inst, u, { tmode: mode }));
      if (got !== order) return mode + ': expected ' + order + ', got ' + got + ' (an idle monster is never a target)';
    }
    inst.world.leader = 1;
    if (ids(M.targeting.pickTargets(inst, u, { tmode: 'follow' })) !== '2,4,3') return 'the leader follows no one: follow must be nearest for him';
    return null;
  },
  /* TG-02: Melee = adjacent; ranged = range + line of sight. */
  'in-range': (M) => {
    const melee = H(M, 1, 11, 3, 'melee_dps');
    const r1 = H(M, 2, 8, 1, 'ranger'); const r2 = H(M, 3, 8, 3, 'ranger');
    const adj = E(M, 4, 0, 12, 4, 1); const two = E(M, 5, 0, 13, 3, 1);
    const behindWall = E(M, 6, 0, 11, 1, 1); const throughDoor = E(M, 7, 0, 11, 3, 1);
    const far = E(M, 8, 0, 16, 3, 1);
    const inst = fight(M, [melee, r1, r2, adj, two, behindWall, throughDoor, far]);
    const R = M.targeting.inRange;
    if (!R(inst, melee, adj) || R(inst, melee, two)) return 'melee must reach exactly the adjacent tiles';
    if (R(inst, r1, behindWall)) return 'a wall must block a ranged shot';
    if (!R(inst, r2, throughDoor)) return 'the door must not block a ranged shot';
    if (R(inst, r2, far)) return 'a ranger (range 7) reached 8 tiles';
    return null;
  },
  /* TG-03: prefer a target the element hurts; an immune one is still attacked when it is the only one, and takes 0. */
  'immune-target-still-hit-when-only-one': (M) => {
    if (!M.MONSTERS.slime.elementImmune.includes('ember')) return 'fixture: the slime is no longer immune to ember';
    const u = H(M, 1, 12, 3, 'ranger', { element: 'ember', tmode: 'weakest' });
    const slime = E(M, 2, 0, 14, 3, 1, { kind: 'slime', hp: 1, maxHp: 8 });
    const rat = E(M, 3, 0, 15, 3, 1, { hp: 9, maxHp: 9 });
    const inst = fight(M, [u, slime, rat]);
    if (M.targeting.basicTarget(inst, u) !== rat) return 'with a rat in range the ember shot went to the immune slime';
    rat.alive = false;
    if (M.targeting.basicTarget(inst, u) !== slime) return 'the only target in range (immune) was not attacked';
    const r = M.damage.hurt(inst, slime, 7, u, 'ember', null);
    return r.immune && r.dmg === 0 && slime.hp === 1 ? null : 'the immune slime took ' + r.dmg;
  },
  /* TG-04: the leader's last target is remembered; a follower's "follow" puts it first. */
  'follow-uses-leader-last': (M) => {
    const k = H(M, 1, 12, 3, 'tank', { target: 3 });
    const f = H(M, 2, 16, 4, 'ranger', { tmode: 'follow' });
    const inst = fight(M, [k, f, E(M, 3, 0, 13, 3, 1), E(M, 4, 0, 16, 5, 2)], { leader: 1 });
    M.movement.occupancy(inst);
    M.damage.resolveAttacks(inst, sc2(M, 1));
    if (inst.world.leaderLast !== 3) return 'the leader hit 3; leaderLast is ' + inst.world.leaderLast;
    return M.targeting.pickTargets(inst, f)[0].id === 3 ? null : 'follow did not put the leader\'s target first';
  },
  /* TG-05 / TG-06: a monster whose target fell turns on the leader; with no leader standing, on no one. */
  'monster-retargets-on-death': (M) => {
    const k = H(M, 1, 12, 3, 'tank'); const down = H(M, 2, 16, 4, 'ranger', { alive: false });
    const m = E(M, 3, 0, 15, 4, 2);
    const inst = fight(M, [k, down, m], { leader: 1 });
    const sc = sc2(M, 1);
    M.targeting.chooseTargets(inst, sc);
    if (m.target !== 1) return 'the monster kept a fallen target (' + m.target + ')';
    if (!sc.events.some((e) => e.type === 'target' && e.u === 3 && e.t === 1)) return 'no target event for the switch';
    k.alive = false;
    M.targeting.chooseTargets(inst, sc2(M, 1));
    return m.target === null ? null : 'with the leader down the monster still holds ' + m.target;
  },
  /* TG-07: a Healer's attack can draw a queued monster onto her (seeded); a role with no peel chance draws nothing. */
  'peel-seeded': (M) => {
    const mk = (role) => {
      const k = H(M, 1, 12, 3, 'tank');
      /* (a caster's basic costs mana since lane b-spell-core: the Healer has some to swing with) */
      const h = H(M, 2, 16, 3, role, { target: 3, mana: 100, maxMana: 100 });
      const m = E(M, 3, 0, 14, 3, 1, { queued: true });
      return { inst: fight(M, [k, h, m], { leader: 1 }), m };
    };
    const rig = (n) => Object.assign(sc2(M, 1), { rng: { chance: () => true, int: (lo, hi) => Math.min(hi, Math.max(lo, n)) } });
    const a = mk('healer'); M.movement.occupancy(a.inst);
    M.damage.resolveAttacks(a.inst, rig(1));
    if (a.m.target !== 2) return 'a peel roll under the Healer\'s chance did not draw the queued monster';
    const b = mk('healer'); M.movement.occupancy(b.inst);
    M.damage.resolveAttacks(b.inst, rig(1000));
    if (b.m.target !== 1) return 'a peel roll over the chance drew the monster anyway';
    const c = mk('ranger'); M.movement.occupancy(c.inst);
    const sc = sc2(M, 1); let peelDraws = 0;
    sc.rng = { chance: () => true, int: (lo, hi) => { if (lo === 1 && hi === 1000) peelDraws++; return lo; } };
    M.damage.resolveAttacks(c.inst, sc);
    return peelDraws === 0 && c.m.target === 1 ? null : 'a role with no peel chance drew a peel roll';
  },
  /* TG-08: the tank Challenges every engaged monster within the radius that is not on him; then waits the cooldown. */
  'challenge-when-monster-off-tank': (M) => {
    const { CHALLENGE } = M.roleData;
    const k = H(M, 1, 11, 3, 'tank'); const r = H(M, 2, 16, 5, 'ranger');
    const near = E(M, 3, 0, 15, 5, 2); const far = E(M, 4, 0, 11 + CHALLENGE.radius + 1, 5, 2);
    const inst = fight(M, [k, r, near, far], { leader: 1 });
    const sc = sc2(M, 1);
    M.targeting.chooseTargets(inst, sc);
    if (near.target !== 1) return 'an on-screen monster off the tank was not Challenged';
    if (far.target !== 2) return 'a monster beyond the Challenge radius was pulled';
    if (sc.events.filter((e) => e.type === 'challenge' && e.u === 1).length !== 1) return 'expected one challenge event';
    if (!sc.events.some((e) => e.type === 'cast' && e.u === 1 && e.ability === 'challenge')) return 'the auto-Challenge is not a cast of the challenge ability';
    near.target = 2; near.holdMs = 0;
    const cdMs = M.abilityData.ABILITIES.challenge.cdMs;
    for (let i = 1; i < cdMs / 100; i++) {
      M.targeting.chooseTargets(inst, sc2(M, 1, i * 100));
      if (near.target === 1) return 'Challenged again ' + i * 100 + ' ms into an ' + cdMs + ' ms cooldown';
    }
    M.targeting.chooseTargets(inst, sc2(M, 1, cdMs));
    if (near.target !== 1) return 'no Challenge once the cooldown ran out';
    const dps = H(M, 1, 11, 3, 'melee_dps');
    const i2 = fight(M, [dps, H(M, 2, 16, 5, 'ranger'), E(M, 3, 0, 15, 5, 2)], { leader: 1 });
    M.targeting.chooseTargets(i2, sc2(M, 1));
    return i2.world.units[2].target === 2 ? null : 'a leader who is not a tank Challenged';
  },
  /* TG-08 with TWO tanks, ONE HOLDER A LAP (designer 2026-10-21, Option A; live v0.2.24: "monsters are
     retargeting onto the secondary member often, until the primary uses Challenge"). Lap 0: the leader holds
     and the second tank never takes from it; it takes only a monster on a non-tank (the overflow). Lap 1:
     the second tank holds, takes the pack, and the leader never takes it back. */
  'one-holder-a-lap': (M) => {
    const k1 = H(M, 1, 11, 3, 'tank'); const k2 = H(M, 2, 13, 5, 'tank'); const healer = H(M, 5, 14, 6, 'healer');
    const a = E(M, 3, 0, 12, 3, 1); const b = E(M, 4, 0, 12, 4, 1);
    const inst = fight(M, [k1, k2, a, b, healer], { leader: 1, runs: 0 });
    if (M.targeting.holderTank(inst) !== k1) return 'lap 0: the holder is not the leader\'s tank';
    for (let t = 0; t <= 20000; t += 100) {
      const sc = sc2(M, 1, t);
      M.targeting.chooseTargets(inst, sc);
      if (a.target !== 1 || b.target !== 1) return 'lap 0: the second tank took the leader\'s pack ' + t + ' ms in (targets ' + a.target + ',' + b.target + ')';
      if (sc.events.some((e) => e.type === 'cast' && e.u === 2)) return 'lap 0: the second tank cast Challenge on a pack already on a tank';
    }
    /* the overflow: the holder's Challenge is cooling, a monster turns on the Healer, the second tank takes it */
    k1.cds = { challenge: 999999 }; b.target = 5; b.holdMs = 0;
    M.targeting.chooseTargets(inst, sc2(M, 1, 20100));
    if (b.target !== 2) return 'the overflow: a monster on the Healer went to ' + b.target + ', not the second tank';
    /* it stays there its hold (the second tank trains on it), though the holder's Challenge is ready again */
    k1.cds = {};
    for (let t = 20200; t < 20100 + M.roleData.CHALLENGE.holdMs; t += 100) {
      M.targeting.chooseTargets(inst, sc2(M, 1, t));
      if (b.target !== 2) return 'the holder took the overflow back ' + (t - 20100) + ' ms into its hold';
    }
    /* the holder first: with both Challenges ready, an overflow goes to the holder (lap 1: the second tank) */
    /* lap 1: the second tank holds */
    inst.world.runs = 1; a.holdMs = 0; b.holdMs = 0; k1.cds = {}; k2.cds = {};
    if (M.targeting.holderTank(inst) !== k2) return 'lap 1: the holder is not the next tank by seat';
    for (let t = 30000; t <= 50000; t += 100) {
      M.targeting.chooseTargets(inst, sc2(M, 1, t));
      if (a.target !== 2 || b.target !== 2) return 'lap 1: the pack is on ' + a.target + ',' + b.target + ' ' + (t - 30000) + ' ms in, not on the holding second tank';
    }
    a.target = 5; a.holdMs = 0; b.holdMs = 0; k1.cds = {}; k2.cds = {};
    M.targeting.chooseTargets(inst, sc2(M, 1, 50100));
    return a.target === 2 ? null : 'lap 1: with both Challenges ready an overflow went to ' + a.target + ', not the holder';
  },
  /* A MUCH WEAKER TANK NEVER HOLDS (designer 2026-10-21: an L9 + L19 pair at Sewer density 7 died in 2 min,
     the L9 leading and holding every other lap). L9 in bronze plate = 251 max HP, L19 in iron = 330
     (vitals.js maxHpFor); 251 is under CHALLENGE.holderMinHpPm of 330, so the L19 holds every lap even
     though the L9 leads, and takes the pack off the L9 the moment its Challenge is ready. A tank at the
     floor still rotates. */
  'weak-tank-never-holds': (M) => {
    const weak = H(M, 1, 11, 3, 'tank', { hp: 251, maxHp: 251 }); const strong = H(M, 2, 13, 5, 'tank', { hp: 330, maxHp: 330 });
    const a = E(M, 3, 0, 12, 3, 1); const b = E(M, 4, 0, 12, 4, 1);
    const inst = fight(M, [weak, strong, a, b], { leader: 1, runs: 0 });
    for (let runs = 0; runs < 6; runs++) {
      inst.world.runs = runs;
      if (M.targeting.holderTank(inst) !== strong) return 'lap ' + runs + ': the L9 tank (251 max HP beside 330) holds';
    }
    inst.world.runs = 0;
    M.targeting.chooseTargets(inst, sc2(M, 1, 0));
    if (a.target !== 2 || b.target !== 2) return 'the L19 did not take the pack off the leading L9 (targets ' + a.target + ',' + b.target + ')';
    const floor = Math.ceil(330 * M.roleData.CHALLENGE.holderMinHpPm / 1000);
    weak.maxHp = floor; weak.hp = floor; inst.world.runs = 0;
    return M.targeting.holderTank(inst) === weak ? null : 'a leading tank at the floor (' + floor + ' of 330) did not hold its lap';
  },
  /* ONE TANK HOLDS (Tyler 2026-10-22, the party's "One tank holds"): the tank the leader picked holds every lap,
     even one far under the floor beside the strongest (the leader's pick wins over it), takes the pack off the
     leader's tank, and the leader's tank takes only what turns on a non-tank (the overflow off the Healer). */
  'leader-pick-holds-every-lap': (M) => {
    const k1 = H(M, 1, 11, 3, 'tank', { hp: 616, maxHp: 616 }); const k2 = H(M, 2, 13, 5, 'tank', { hp: 300, maxHp: 300 });
    const healer = H(M, 5, 14, 6, 'healer');
    const a = E(M, 3, 0, 12, 3, 1); const b = E(M, 4, 0, 12, 4, 1);
    const inst = fight(M, [k1, k2, a, b, healer], { leader: 1, runs: 0, hold: 2, holdNext: 2 });
    for (let runs = 0; runs < 6; runs++) {
      inst.world.runs = runs;
      if (M.targeting.holderTank(inst) !== k2) return 'lap ' + runs + ': the picked tank (300 max HP beside 616) did not hold';
    }
    inst.world.runs = 0;
    M.targeting.chooseTargets(inst, sc2(M, 1, 0));
    if (a.target !== 2 || b.target !== 2) return 'the pick did not take the pack off the leader’s tank (targets ' + a.target + ',' + b.target + ')';
    /* its Challenge cooling, a monster turns on the Healer: the leader's tank takes that one, and nothing on the pick */
    k2.cds = { challenge: 999999 }; a.holdMs = 0; b.target = 5; b.holdMs = 0; k1.cds = {};
    M.targeting.chooseTargets(inst, sc2(M, 1, 100));
    if (a.target !== 2) return 'the leader’s tank took a monster off the picked tank';
    return b.target === 1 ? null : 'the overflow off the Healer went to ' + b.target + ', not the leader’s tank';
  },
  /* THE PICK IS GONE (it fell, or left the hunt): the tanks still standing take turns. A pick that is no tank
     (its weapon changed) holds nothing either. */
  'pick-gone-tanks-take-turns': (M) => {
    const k1 = H(M, 1, 11, 3, 'tank'); const k2 = H(M, 2, 13, 5, 'tank'); const k3 = H(M, 3, 12, 6, 'tank');
    const inst = fight(M, [k1, k2, k3], { leader: 1, runs: 0, hold: 3, holdNext: 3 });
    if (M.targeting.holderTank(inst) !== k3) return 'the standing pick did not hold';
    k3.alive = false;
    const laps = [0, 1, 2, 3].map((r) => { inst.world.runs = r; return M.targeting.holderTank(inst).id; }).join(',');
    if (laps !== '1,2,1,2') return 'with the pick fallen the laps went to ' + laps + ', not the two left by turns (1,2,1,2)';
    k3.alive = true; k3.role = 'melee_dps'; k3.kind = 'melee_dps'; inst.world.runs = 0;
    return M.targeting.holderTank(inst) === k1 ? null : 'a pick that is no tank held the pack';
  },
  /* TG-01 ties (Andy 2026-10-21: "Strongest and follow player both seem to just target the first creature"):
     monsters a mode cannot tell apart fall to the NEARER, not to the first spawned. */
  'mode-ties-fall-to-nearest': (M) => {
    const u = H(M, 1, 11, 3, 'ranger');
    const far = E(M, 2, 0, 16, 5, 9, { hp: 20, maxHp: 20 }); const near = E(M, 3, 0, 13, 3, 9, { hp: 20, maxHp: 20 });
    const inst = fight(M, [u, far, near, H(M, 9, 17, 2, 'tank')], { leader: 9 });
    for (const mode of ['strongest', 'weakest', 'highest_pct', 'follow']) {
      const got = ids(M.targeting.pickTargets(inst, u, { tmode: mode }));
      if (got !== '3,2') return mode + ': two equal monsters ordered ' + got + ', not nearest first (3,2)';
    }
    return null;
  },
  /* A MELEE hero no monster is on takes its MARK, the first its Target setting names, not the first
     monster that happens to stand beside it; it keeps the one it stands beside until that one falls. */
  'melee-takes-its-mark': (M) => {
    const k = H(M, 1, 12, 3, 'tank');
    const d = H(M, 2, 14, 5, 'melee_dps', { tmode: 'strongest' });
    const rat = E(M, 3, 0, 15, 5, 1, { hp: 9, maxHp: 9 }); const big = E(M, 4, 0, 13, 3, 1, { hp: 60, maxHp: 60 });
    const inst = fight(M, [k, d, rat, big], { leader: 1 });
    M.movement.occupancy(inst);
    M.targeting.chooseTargets(inst, sc2(M, 1));
    if (d.target !== 4) return '"Strongest" took ' + d.target + ' (the monster beside it), not its mark 4';
    d.x = 14; d.y = 4; d.fx = 14; d.fy = 4;
    inst.world.units.push(E(M, 5, 0, 17, 2, 1, { hp: 100, maxHp: 100 }));
    M.targeting.chooseTargets(inst, sc2(M, 1));
    return d.target === 4 ? null : 'beside its mark it switched to ' + d.target;
  },
};

const mutants = [
  { name: 'every mode is nearest', case: 'mode-order-each', edits: [[T, '(ORDER[mode] || ORDER[DEFAULT_TARGET_MODE])', 'ORDER[DEFAULT_TARGET_MODE]']] },
  { name: 'follow forgets the leader', case: 'mode-order-each', edits: [[T, "const lt = inst.world.leader !== u.id ? inst.world.leaderLast : null;", 'const lt = null;']] },
  { name: 'ranged ignores line of sight', case: 'in-range', edits: [[T, ' && los(inst.grid, u, m);', ';']] },
  { name: 'the basic target ignores the element', case: 'immune-target-still-hit-when-only-one',
    edits: [[T, 'return inR.find((m) => elementOn(m, u.element) > 0) || inR[0] || null;', 'return inR[0] || null;']] },
  { name: 'an immune target is skipped even alone', case: 'immune-target-still-hit-when-only-one',
    edits: [[T, 'return inR.find((m) => elementOn(m, u.element) > 0) || inR[0] || null;', 'return inR.find((m) => elementOn(m, u.element) > 0) || null;']] },
  { name: 'the leader\'s target is not remembered', case: 'follow-uses-leader-last',
    edits: [['src/core/hunt/damage.js', 'if (inst.world.leader === u.id) inst.world.leaderLast = aim.id;', '']] },
  { name: 'a fallen target is kept', case: 'monster-retargets-on-death', edits: [[T, 'if (!t || !t.alive) { retarget(', 'if (!t) { retarget(']] },
  { name: 'peel ignores the roll', case: 'peel-seeded', edits: [[T, ' || sc.rng.int(1, 1000) > row.peel) return null;', ') return null;']] },
  { name: 'every role peels', case: 'peel-seeded', edits: [[T, "if (!row || !row.peel || !k || k === hero) return null;", 'if (!row || !k || k === hero) return null;']] },
  { name: 'the Challenge has no radius', case: 'challenge-when-monster-off-tank', edits: [[T, ' && cheb(m, k) <= CHALLENGE.radius', '']] },
  { name: 'the Challenge has no cooldown', case: 'challenge-when-monster-off-tank', edits: [[T, '[CHALLENGE_ROW.id]: sc.atMs + CHALLENGE_ROW.cdMs', '[CHALLENGE_ROW.id]: sc.atMs']] },
  { name: 'any role Challenges', case: 'challenge-when-monster-off-tank', edits: [[T, 'if (!isTank(k) || !k.alive) return [];', 'if (!roleOf(k) || !k.alive) return [];']] },
  { name: 'a Challenge holds nothing', case: 'one-holder-a-lap', edits: [[T, 'm.queued = false; m.holdMs = CHALLENGE.holdMs; }', 'm.queued = false; }']] },
  { name: 'a non-holder steals from the holder (live v0.2.24)', case: 'one-holder-a-lap', edits: [[T, ' && (holds || onNonTank(m)));', ');']] },
  { name: 'a much weaker tank holds its turn (live v0.2.25 lane: L9 + L19 died)', case: 'weak-tank-never-holds',
    edits: [[T, 'living.filter((u) => !underHoldFloor(u, living))', 'living.slice()']] },
  { name: 'the weak-tank floor is strict', case: 'weak-tank-never-holds',
    edits: [[T, 'u.maxHp * 1000 < living.reduce', 'u.maxHp * 1000 <= living.reduce']] },
  { name: 'the leader’s pick is ignored (Tyler 2026-10-22)', case: 'leader-pick-holds-every-lap', edits: [[T, '  if (pick) return pick;\n', '']] },
  { name: 'the floor beats the leader’s pick', case: 'leader-pick-holds-every-lap',
    edits: [[T, 'inst.world.units.find((u) => u.id === id && u.alive && isTank(u))', 'turnTanks(inst).find((u) => u.id === id)']] },
  { name: 'a fallen pick still holds', case: 'pick-gone-tanks-take-turns',
    edits: [[T, 'u.id === id && u.alive && isTank(u)', 'u.id === id && isTank(u)']] },
  { name: 'the holder never rotates', case: 'one-holder-a-lap', edits: [[T, 'return tanks[runs % tanks.length];', 'return tanks[0];']] },
  { name: 'an overflow goes to whichever tank comes first by id', case: 'one-holder-a-lap',
    edits: [[T, 'for (const k of h ? [h, ...inst.world.units.filter((u) => u !== h)] : inst.world.units) {', 'for (const k of inst.world.units) {']] },
  { name: 'ties fall to id (live v0.2.22)', case: 'mode-ties-fall-to-nearest', edits: [[T, 'cmp(a, b) || dist2(a, unit) - dist2(b, unit) || a.id - b.id', 'cmp(a, b) || a.id - b.id']] },
  { name: 'a melee hits whatever stands beside it (live v0.2.22)', case: 'melee-takes-its-mark', edits: [[T, 'const b = marks ? null : basicTarget(inst, u);', 'const b = basicTarget(inst, u);']] },
  { name: 'a melee drops the target it stands beside', case: 'melee-takes-its-mark', edits: [[T, '(inRange(inst, u, cur) || enRoute)) continue;', 'enRoute) continue;']] },
];

await suite('hunt-core/targeting', cases, mutants);
