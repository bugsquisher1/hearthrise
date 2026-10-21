// tests/hunt-core/roles.mjs — src/core/hunt/roles.js + src/data/hunt-roles.js (spec §3.2 #1-10; parity RO-01..18).
// Run by run-all.mjs.
import { suite, H, E, inst2, sc2, run, world } from './fixtures/h2.js';

const R = 'src/core/hunt/roles.js';
const aggro0 = () => [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }];
const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight', leader: 1, packs: aggro0() }, o || {})));
const place = (M, inst) => { M.movement.occupancy(inst); const sc = sc2(M, 1); M.targeting.chooseTargets(inst, sc); M.roles.positionHeroes(inst, sc); return sc; };
const gapOf = (inst, x, y) => Math.min(...inst.world.units.filter((u) => u.side === 'mon' && u.alive).map((m) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y))));

const cases = {
  /* RO-01: with a monster on him the tank stands still; none near, chase on → he steps toward the nearest; chase off → he holds. */
  'tank-holds': (M) => {
    const k = H(M, 1, 12, 3, 'tank');
    const inst = fight(M, [k, E(M, 2, 0, 13, 3, 1, { hp: 1000, maxHp: 1000 })]);
    let moved = null;
    run(M, inst, 30, sc2(M, 1), () => { if (k.x !== 12 || k.y !== 3 || k.path.length) moved = moved || [k.x, k.y]; });
    if (moved) return 'the tank left his tile with a monster on him: ' + JSON.stringify(moved);
    const kw = H(M, 1, 12, 3, 'tank', { goal: [12, 5], path: [[12, 4], [12, 5]] });
    const iw = fight(M, [kw, E(M, 2, 0, 13, 3, 1)]);
    place(M, iw);
    if (kw.path.length || kw.goal) return 'a monster reached the walking tank and he kept walking';
    const k2 = H(M, 1, 11, 3, 'tank'); const far = E(M, 2, 0, 17, 5, 1);
    const i2 = fight(M, [k2, far]);
    place(M, i2);
    if (!k2.goal || Math.max(Math.abs(k2.goal[0] - far.x), Math.abs(k2.goal[1] - far.y)) !== 1) return 'chase on: the tank did not step to the nearest monster (goal ' + JSON.stringify(k2.goal) + ')';
    const k3 = H(M, 1, 11, 3, 'tank', { chase: false });
    const i3 = fight(M, [k3, E(M, 2, 0, 17, 5, 1)]);
    place(M, i3);
    return k3.goal === null ? null : 'chase off: the tank walked';
  },
  /* RO-02: monsters take the slots by their target, nearest first; the extra queues on ring 2. */
  'surround-then-queue': (M) => {
    const k = H(M, 1, 9, 8, 'tank');
    const a = E(M, 2, 2, 12, 8, 1); const b = E(M, 3, 2, 13, 8, 1); const c = E(M, 4, 2, 15, 8, 1);
    const inst = fight(M, [k, a, b, c], { packs: [{ aggro: false, holder: null }, { aggro: false, holder: null }, { aggro: true, holder: 1 }] });
    place(M, inst);
    const adj = (m) => m.goal && Math.max(Math.abs(m.goal[0] - 9), Math.abs(m.goal[1] - 8)) === 1;
    if (!adj(a) || JSON.stringify(a.goal) !== '[10,8]') return 'the nearest monster did not take the nearest slot: ' + JSON.stringify(a.goal);
    if (!adj(b) || a.queued || b.queued) return 'the second monster did not take the other slot';
    if (!c.queued || !c.goal || Math.max(Math.abs(c.goal[0] - 9), Math.abs(c.goal[1] - 8)) !== 2) return 'the extra did not queue on ring 2: ' + JSON.stringify(c.goal);
    return null;
  },
  /* RO-03: the Melee DPS takes a slot by the TANK's target, not its own nearest. */
  'melee-dps-slot': (M) => {
    const k = H(M, 1, 12, 3, 'tank'); const d = H(M, 2, 11, 6, 'melee_dps', { tmode: 'follow' });
    const duty = E(M, 3, 0, 13, 3, 1); const near = E(M, 4, 0, 12, 5, 1);
    const inst = fight(M, [k, d, duty, near], { leaderLast: 3 });
    place(M, inst);
    if (!d.goal) return 'the Melee DPS has no goal';
    return Math.max(Math.abs(d.goal[0] - 13), Math.abs(d.goal[1] - 3)) === 1 ? null : 'the Melee DPS went for its own nearest, goal ' + JSON.stringify(d.goal);
  },
  /* RO-04 / RO-06: a ranged hero's spot is at its distance from ITS OWN target, with sight, off every monster. */
  'ranged-distance-from-own-target': (M) => {
    const k = H(M, 1, 10, 5, 'tank'); const r = H(M, 2, 17, 5, 'ranger', { dist: 3 });
    const own = E(M, 4, 0, 18, 1, 1); const tankTarget = E(M, 3, 0, 11, 5, 1);
    const inst = fight(M, [k, r, tankTarget, own]);
    place(M, inst);
    if (r.target !== 4) return 'fixture: the ranger should target 4, it targets ' + r.target;
    if (!r.spot) return 'the ranger claimed no spot';
    const d = Math.hypot(r.spot[0] - own.x, r.spot[1] - own.y);
    if (d < 2 || d > 4.2) return 'the spot is ' + d.toFixed(2) + ' from the ranger\'s own target, outside [2, 4.2]';
    if (!M.grid.los(inst.grid, { x: r.spot[0], y: r.spot[1] }, own)) return 'no line of sight from the spot';
    return gapOf(inst, r.spot[0], r.spot[1]) >= 2 ? null : 'the spot is next to a monster';
  },
  /* RO-07: two ranged heroes on one target never claim one tile. */
  'two-rangers-two-spots': (M) => {
    const k = H(M, 1, 11, 3, 'tank');
    const a = H(M, 2, 17, 5, 'ranger', { dist: 3 }); const b = H(M, 3, 17, 6, 'ranger', { dist: 3 });
    const inst = fight(M, [k, a, b, E(M, 4, 0, 16, 1, 1)]);
    place(M, inst);
    if (!a.spot || !b.spot) return 'a ranger has no spot';
    return a.spot[0] === b.spot[0] && a.spot[1] === b.spot[1] ? 'both rangers claimed ' + JSON.stringify(a.spot) : null;
  },
  /* RO-09: kiting = chase off AND distance > 1; distance 1 with chase off holds. */
  'kite-predicate': (M) => {
    const k = M.roles.kites;
    if (!k({ chase: false, dist: 2 }) || k({ chase: false, dist: 1 }) || k({ chase: true, dist: 5 })) return 'kites() truth table is wrong';
    const r = H(M, 2, 17, 5, 'ranger', { dist: 1, chase: false, goal: [15, 5], path: [[16, 5], [15, 5]] });
    const inst = fight(M, [H(M, 1, 11, 3, 'tank'), r, E(M, 3, 0, 12, 3, 1)]);
    place(M, inst);
    return r.goal === null && !r.path.length ? null : 'distance 1 + chase off must hold position';
  },
  /* RO-10: a kiter out of range of monsters that cannot come out closes in, to a tile in range, inside the area, short of them. */
  'kiter-closes-in-when-out-of-range': (M) => {
    const k = H(M, 1, 12, 3, 'tank');
    const mage = H(M, 2, 3, 8, 'mage', { dist: 3, chase: false });
    const m = E(M, 3, 0, 13, 3, 1, { hp: 5000, maxHp: 5000 });
    const inst = fight(M, [k, mage, m]);
    if (M.targeting.inRange(inst, mage, m)) return 'fixture: the mage starts in range';
    run(M, inst, 120, sc2(M, 1));
    if (!M.targeting.inRange(inst, mage, m)) return 'the kiter never closed in: at ' + JSON.stringify([mage.x, mage.y]);
    if (!M.leash.inArea(inst, 0, mage.x, mage.y)) return 'the kiter shoots from outside the pack area';
    return gapOf(inst, mage.x, mage.y) >= 2 ? null : 'the kiter closed in next to a monster';
  },
  /* RO-12 / RO-13: a kiter with a monster closing retreats AWAY from the pack, never next to a monster, inside the area. */
  'kite-retreats-away-from-pack': (M) => {
    /* Cornered at the room's north-west, a monster beside it and one across the room: the nearest
       tile that restores the gap lies toward the pack centre (12.5, 3); the kiter must go round. */
    const mage = H(M, 2, 11, 1, 'mage', { dist: 3, chase: false });
    const inst = fight(M, [H(M, 1, 10, 6, 'tank'), mage, E(M, 3, 0, 10, 1, 2), E(M, 4, 0, 15, 5, 2)]);
    place(M, inst);
    if (!mage.goal) return 'the kiter did not move with a monster beside it';
    const [gx, gy] = mage.goal;
    const [cx, cy] = [12.5, 3];
    if (Math.hypot(gx - cx, gy - cy) - Math.hypot(11 - cx, 1 - cy) <= 0.5) return 'the retreat is not away from the pack: ' + JSON.stringify(mage.goal);
    if (gapOf(inst, gx, gy) < 2) return 'the retreat tile is next to a monster';
    return M.leash.inArea(inst, 0, gx, gy) ? null : 'the retreat tile is outside the pack area';
  },
  /* RO-14 / RO-15 / a solo hunt is a party of one: per-role defaults; no Melee → the ranged kite; alone, follow is nearest. */
  'defaults-per-role': (M) => {
    const d = M.roles.defaultSettings;
    const party = ['tank', 'ranger', 'mage', 'healer'];
    const want = { tank: [1, true], ranger: [3, true], mage: [6, true], healer: [5, true], melee_dps: [1, true] };
    for (const [role, [dist, chase]] of Object.entries(want)) {
      const s = d(role, party);
      if (s.dist !== dist || s.chase !== chase) return role + ': expected dist ' + dist + ' chase ' + chase + ', got ' + JSON.stringify(s);
    }
    const noMelee = ['ranger', 'mage', 'healer'];
    for (const r of noMelee) if (d(r, noMelee).chase !== false) return 'with no Melee the ' + r + ' does not kite';
    if (d('ranger', ['ranger']).tmode !== M.RS.DEFAULT_TARGET_MODE) return 'a party of one has no leader to follow';
    return d('melee_dps', ['tank', 'melee_dps']).tmode === 'follow' ? null : 'the Melee DPS should follow the tank';
  },
  /* spec §3.2 #3: the pull leader is the first hero by role order (tank, Melee DPS, Ranger, Mage, Healer), ties by id. */
  'pull-leader-order': (M) => {
    const u = (id, role) => ({ id, side: 'hero', role });
    const L = M.roles.pickLeader;
    if (L([u(1, 'healer'), u(2, 'ranger'), u(3, 'melee_dps'), u(4, 'tank')]) !== 4) return 'the tank does not lead';
    if (L([u(1, 'healer'), u(2, 'mage'), u(3, 'melee_dps')]) !== 3) return 'with no tank the Melee DPS does not lead';
    if (L([u(5, 'ranger'), u(2, 'ranger'), u(1, 'healer')]) !== 2) return 'two of a role: the lower id must lead';
    return L([{ id: 1, side: 'mon', role: 'tank' }]) === null ? null : 'a monster led the pull';
  },
  /* RO-18 / RO-17: role from the weapon type; a staff is a Mage unless Healer is picked; the table validates. */
  'role-from-weapon': (M) => {
    const f = M.roleData.roleForWeapon;
    const bad = M.roleData.validate();
    if (bad.length) return bad.join('; ');
    if (f('shield') !== 'tank' || f('dual_axe') !== 'melee_dps' || f('crossbow') !== 'ranger') return 'weapon → role is wrong';
    /* Tyler 2026-10-19: Mage = wand (+ spellbook), Healer = staff; neither offers the other role. */
    if (f('staff') !== 'healer' || f('staff', 'mage') !== 'healer' || f('wand') !== 'mage' || f('wand', 'healer') !== 'mage') return 'the wand / staff roles are wrong';
    const RW = M.roleData.roleWeaponOf;
    if (RW({ weaponType: 'magic', discipline: 'restoration' }) !== 'staff' || RW({ weaponType: 'magic', discipline: 'destruction' }) !== 'wand' || RW(null) !== 'neutral') return 'roleWeaponOf does not read the magic discipline';
    return f('no_such_weapon') === null ? null : 'an unknown weapon got a role';
  },
};

const mutants = [
  { name: 'the tank chases with a monster on him', case: 'tank-holds',
    edits: [[R, "if (!h.chase || mons.some((m) => cheb(m, h) <= 1)) { clearGoal(h); return; }", 'if (!h.chase) { clearGoal(h); return; }']] },
  { name: 'the farthest monster picks first', case: 'surround-then-queue',
    edits: [[R, '    .sort(([a, ta], [b, tb]) => dist2(a, ta) - dist2(b, tb) || a.id - b.id);', '    .sort(([a, ta], [b, tb]) => dist2(b, tb) - dist2(a, ta) || a.id - b.id);']] },
  { name: 'no queue: extras stand', case: 'surround-then-queue', edits: [[R, '    if (q) setGoal(inst, m, q[0], q[1]);', '']] },
  { name: 'the Melee DPS ignores the tank\'s target', case: 'melee-dps-slot',
    edits: [[R, "closeIn(inst, h, (lt && lt.alive && mons.includes(lt)) ? lt : unitById(inst, h.target));", 'closeIn(inst, h, nearestTo(mons, h));']] },
  { name: 'ranged distance measured from the leader', case: 'ranged-distance-from-own-target',
    edits: [[R, "  const tgt = unitById(inst, h.target);\n  if (!tgt) return;\n  const nearMon", "  const tgt = Object.assign({}, leaderOf(inst), { pocket: unitById(inst, h.target).pocket });\n  if (!tgt) return;\n  const nearMon"]] },
  { name: 'the spot band ignores the setting', case: 'ranged-distance-from-own-target', edits: [[R, '  const want = h.dist;\n  const living', '  const want = 6;\n  const living']] },
  { name: 'kiting needs only chase off', case: 'kite-predicate', edits: [[R, 'export const kites = (u) => !u.chase && u.dist > 1;', 'export const kites = (u) => !u.chase;']] },
  { name: 'the kiter never closes in', case: 'kiter-closes-in-when-out-of-range', edits: [[R, '    if (best) setGoal(inst, h, best[0], best[1]);\n    return;', '    return;']] },
  { name: 'the kiter closes in from outside the area', case: 'kiter-closes-in-when-out-of-range',
    edits: [[R, '    for (const [x, y] of candidateTiles(inst, h, pocket, n.x, n.y, want)) {', '    for (const [x, y] of [[4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8]]) {']] },
  { name: 'the retreat may go toward the pack', case: 'kite-retreats-away-from-pack', edits: [[R, '    if (Math.hypot(x - cx, y - cy) - here <= KITE.awayMin) continue;\n', '']] },
  { name: 'no Melee does not change chase', case: 'defaults-per-role', edits: [[R, '    chase: HUNT_ROLES[role].melee ? d.chase : (noMelee ? false : d.chase),', '    chase: d.chase,']] },
  { name: 'the leader is the first hero by id', case: 'pull-leader-order', edits: [[R, "    const r = u.side === 'hero' ? ROLE_ORDER.indexOf(u.role) : -1;", "    const r = u.side === 'hero' && ROLE_ORDER.includes(u.role) ? 0 : -1;"]] },
  { name: 'a staff offers the Mage too', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  staff: Object.freeze(['healer']),", "  staff: Object.freeze(['mage', 'healer']),"]] },
  { name: 'a wand plays the Healer', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  wand: Object.freeze(['mage']),", "  wand: Object.freeze(['healer']),"]] },
  { name: 'a magic weapon ignores its discipline', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  if (item.weaponType === 'magic') return MAGIC_ROLE_WEAPON[item.discipline] || 'wand';", "  if (item.weaponType === 'magic') return 'wand';"]] },
];

await suite('hunt-core/roles', cases, mutants);
