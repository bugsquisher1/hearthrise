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
      const h = H(M, 2, 16, 3, role, { target: 3 });
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
    near.target = 2;
    const steps = CHALLENGE.cooldownMs / 100;
    for (let i = 1; i < steps; i++) {
      M.targeting.chooseTargets(inst, sc2(M, 1));
      if (near.target === 1) return 'Challenged again ' + i * 100 + ' ms into an ' + CHALLENGE.cooldownMs + ' ms cooldown';
    }
    M.targeting.chooseTargets(inst, sc2(M, 1));
    if (near.target !== 1) return 'no Challenge once the cooldown ran out';
    const dps = H(M, 1, 11, 3, 'melee_dps');
    const i2 = fight(M, [dps, H(M, 2, 16, 5, 'ranger'), E(M, 3, 0, 15, 5, 2)], { leader: 1 });
    M.targeting.chooseTargets(i2, sc2(M, 1));
    return i2.world.units[2].target === 2 ? null : 'a leader who is not a tank Challenged';
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
  { name: 'a fallen target is kept', case: 'monster-retargets-on-death', edits: [[T, 'if (!t || !t.alive) retarget(', 'if (!t) retarget(']] },
  { name: 'peel ignores the roll', case: 'peel-seeded', edits: [[T, ' || sc.rng.int(1, 1000) > row.peel) return null;', ') return null;']] },
  { name: 'every role peels', case: 'peel-seeded', edits: [[T, "if (!row || !row.peel || !k || k === hero) return null;", 'if (!row || !k || k === hero) return null;']] },
  { name: 'the Challenge has no radius', case: 'challenge-when-monster-off-tank', edits: [[T, ' && cheb(m, k) <= CHALLENGE.radius);', ');']] },
  { name: 'the Challenge has no cooldown', case: 'challenge-when-monster-off-tank', edits: [[T, '  k.chalMs = CHALLENGE.cooldownMs;', '  k.chalMs = 0;']] },
  { name: 'any role Challenges', case: 'challenge-when-monster-off-tank', edits: [[T, "if (!k || !roleOf(k) || !roleOf(k).tank) return;", 'if (!k || !roleOf(k)) return;']] },
];

await suite('hunt-core/targeting', cases, mutants);
