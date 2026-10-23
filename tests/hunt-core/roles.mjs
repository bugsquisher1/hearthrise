// tests/hunt-core/roles.mjs — src/core/hunt/roles.js + src/data/hunt-roles.js (spec §3.2 #1-10; parity RO-01..18).
// Run by run-all.mjs.
import { suite, H, E, inst2, sc2, run, world, groundRow } from './fixtures/h2.js';

const R = 'src/core/hunt/roles.js';
const aggro0 = () => [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }];
const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight', leader: 1, packs: aggro0() }, o || {})));
const place = (M, inst) => { M.movement.occupancy(inst); const sc = sc2(M, 1); M.targeting.chooseTargets(inst, sc); M.roles.positionHeroes(inst, sc); return sc; };
const gapOf = (inst, x, y) => Math.min(...inst.world.units.filter((u) => u.side === 'mon' && u.alive).map((m) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y))));

/* A room with one free tile beside the monster at (5,3) that nobody can walk to: (6,4), walled in on
   every side and cut off from the monster's own tile by the two walls a diagonal step would clip. It is
   the free tile NEAREST (straight line) to a hero coming from the south-east. */
const NOTCH = Object.freeze([
  '############', // 0
  '#..........#', // 1
  '#..........#', // 2
  '#....M##...#', // 3
  '#....#.#...#', // 4  (6,4): the unreachable tile
  '#....###...#', // 5
  '#..........#', // 6
  '#..........#', // 7
  '#..........#', // 8
  '############', // 9
]);

const cases = {
  /* SECONDARY HERO PATHING (Andy 2026-10-21: "if it hesitates choosing a spot (diagonal or moves after
     killing maybe) the secondary player just stands there"). A Melee hero walks to a free tile beside its
     target it can REACH (heroes pass through heroes; a monster blocks), and hits it. */
  'melee-reaches-a-free-tile': (M) => {
    const grid = M.grid.makeGrid(12, 10, (x, y) => NOTCH[y][x] !== '#', (x, y) => NOTCH[y][x] === '#');
    const ground = groundRow({ start: [[1, 1], [2, 1]], route: [0],
      pockets: [{ room: [1, 1, 10, 8], spawns: [{ monster: 'rat', x: 5, y: 3 }] }] });
    const k = H(M, 1, 4, 3, 'tank');
    const d = H(M, 2, 9, 6, 'melee_dps', { tmode: 'nearest' });
    const m = E(M, 3, 0, 5, 3, 1, { hp: 5000, maxHp: 5000 });
    const w = world(M, [k, d, m], { phase: 'fight', leader: 1, leaderLast: 3, packs: [{ aggro: true, holder: 1 }] });
    const inst = { world: w, ground, grid, occ: null, makeUnit: M.worldstate.makeUnit };
    const sc = sc2(M, 1);
    run(M, inst, 80, sc);
    if (Math.max(Math.abs(d.x - 5), Math.abs(d.y - 3)) > 1) return 'after 8 s the second hero stands at ' + d.x + ',' + d.y + ' (goal ' + JSON.stringify(d.goal) + '), not beside its target';
    return sc.events.some((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 2) ? null : 'the second hero reached its target but never swung';
  },
  /* A SECOND TANK the pack is not on walks to its mark (its Target setting), not holding beside the
     first monster that stands next to it. */
  'second-tank-walks-to-its-mark': (M) => {
    const k1 = H(M, 1, 12, 3, 'tank'); const k2 = H(M, 2, 14, 5, 'tank', { tmode: 'strongest' });
    const rat = E(M, 3, 0, 15, 5, 1, { hp: 9, maxHp: 9, holdMs: 5000 }); const big = E(M, 4, 0, 13, 2, 1, { hp: 60, maxHp: 60, holdMs: 5000 });
    const inst = fight(M, [k1, k2, rat, big]);
    place(M, inst);
    if (k2.target !== 4) return 'fixture: the second tank should mark 4, it marks ' + k2.target;
    return k2.goal && Math.max(Math.abs(k2.goal[0] - 13), Math.abs(k2.goal[1] - 2)) === 1 ? null : 'the second tank did not walk to its mark (goal ' + JSON.stringify(k2.goal) + ')';
  },
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
    /* Tyler 2026-10-23: a sword ALONE plays Melee damage; the club and bare hands Melee damage too. */
    if (f('sword') !== 'melee_dps' || f('club') !== 'melee_dps' || f('hammer') !== 'melee_dps' || f('neutral') !== 'melee_dps') return 'a sword alone, a club or bare hands play ' + [f('sword'), f('club'), f('hammer'), f('neutral')];
    /* Tyler 2026-10-19: Mage = wand (+ spellbook), Healer = staff; neither offers the other role. */
    if (f('staff') !== 'healer' || f('staff', 'mage') !== 'healer' || f('wand') !== 'mage' || f('wand', 'healer') !== 'mage') return 'the wand / staff roles are wrong';
    const RW = M.roleData.roleWeaponOf;
    if (RW({ weaponType: 'magic', discipline: 'restoration' }) !== 'staff' || RW({ weaponType: 'magic', discipline: 'destruction' }) !== 'wand' || RW(null) !== 'neutral') return 'roleWeaponOf does not read the magic discipline';
    return f('no_such_weapon') === null ? null : 'an unknown weapon got a role';
  },
  /* EVERY MAGIC WEAPON NAMES ITS DISCIPLINE (roadmap p23, audit m03): none falls to the Mage by default. The four
     hand-authored drops: the Demoncaller staff and the Void Censer heal, the Whispering Codex and the Voidmaw
     Scepter strike. */
  'every-magic-weapon-has-a-discipline': (M) => {
    const RW = M.roleData.roleWeaponOf;
    const loose = Object.keys(M.ITEMS).filter((id) => M.ITEMS[id] && M.ITEMS[id].weaponType === 'magic' && !['destruction', 'restoration'].includes(M.ITEMS[id].discipline));
    if (loose.length) return 'magic weapons with no discipline: ' + loose.join(', ');
    const want = { demoncaller_staff: 'staff', void_censer: 'staff', whispering_codex: 'wand', voidmaw_scepter: 'wand' };
    for (const [id, key] of Object.entries(want)) if (RW(M.ITEMS[id]) !== key) return id + ' plays ' + RW(M.ITEMS[id]) + ', want ' + key;
    return M.ITEMS.demoncaller_staff.twoHanded === true ? null : 'the Demoncaller staff is one-handed (a staff fills both hands, Tyler 10-19)';
  },
  /* THE SHIELD MAKES THE TANK (Tyler 2026-10-23, SHIELDS; roadmap p15, audit c02): a one-hand melee weapon and a
     shield play the tank, a sword alone Melee damage; a crossbow and a shield a Ranger (with guard), never a tank;
     a spellbook beside a wand or a sword is no shield; a BOW fills both hands (every bow is two-handed, every
     crossbow one-handed, so the server's two_handed refusal keeps a shield off a bow). The worn set's key reads both
     hands (wornRoleKey) and heroSetup plays it: a sword alone carries no Challenge on its bar. */
  'the-shield-makes-the-tank': (M) => {
    const R = M.roleData, I = M.ITEMS, f = (w, o) => R.roleForWeapon(R.roleKeyOf(I[w] || null, I[o] || null));
    const want = [['practice_sword', 'practice_shield', 'tank'], ['practice_sword', null, 'melee_dps'], ['iron_sword', 'kingsgrate', 'tank'],
      ['practice_crossbow', 'bronze_rimmed_shield', 'ranger'], ['oak_crossbow', 'steelgrate', 'ranger'], ['practice_wand', 'practice_spellbook', 'mage'],
      ['practice_sword', 'practice_spellbook', 'melee_dps'], [null, 'ironbound_shield', 'tank'], ['practice_wand', 'bronze_rimmed_shield', 'mage']];
    for (const [w, o, role] of want) if (f(w, o) !== role) return w + ' with ' + o + ' plays ' + f(w, o) + ', want ' + role;
    if (R.wornRoleKey({ weapon: 'iron_sword', shield: 'ironbound_shield' }, I) !== 'shield' || R.wornRoleKey({ weapon: 'iron_sword' }, I) !== 'sword') return 'the worn set\'s key does not read the shield slot';
    const ranged = Object.keys(I).filter((id) => I[id].slot === 'weapon' && I[id].weaponType === 'ranged');
    const oneHandBow = ranged.filter((id) => !/crossbow/.test(id) && I[id].twoHanded !== true);
    const twoHandXbow = ranged.filter((id) => /crossbow/.test(id) && I[id].twoHanded === true);
    if (oneHandBow.length || twoHandXbow.length || !ranged.some((id) => /crossbow/.test(id))) return 'a bow is one-handed (' + oneHandBow + ') or a crossbow two-handed (' + twoHandXbow + ')';
    const tank = M.hs.heroSetup({ weaponType: 'shield', options: {}, bar: [], partyRoles: [] });
    const sword = M.hs.heroSetup({ weaponType: 'sword', options: {}, bar: [], partyRoles: [] });
    const acts = (h) => h.slots.filter((s) => s.slot.action.type === 'ability').map((s) => s.slot.action.id);
    if (tank.role !== 'tank' || !acts(tank).includes('challenge')) return 'sword and shield: role ' + tank.role + ', bar ' + acts(tank);
    if (sword.role !== 'melee_dps' || acts(sword).includes('challenge') || !acts(sword).includes('flame_strike') || !acts(sword).includes('power_strike')) return 'a sword alone: role ' + sword.role + ', bar ' + acts(sword);
    return null;
  },
  /* DISCIPLINE LISTS LIVE IN DATA ONLY (roadmap p15, audit c03): the club is its own discipline (the axes' sweep,
     never their bleed), every role key names a discipline of abilities.js DISCIPLINES, and a hero's bar holds only
     its key's list (heroSetup). */
  'the-club-is-its-own-discipline': (M) => {
    const R = M.roleData, AD = M.abilityData;
    if (R.disciplineOf('club') === R.disciplineOf('dual_axe') || R.disciplineOf('hammer') !== 'club') return 'the club plays the ' + R.disciplineOf('club') + ' list, the axes ' + R.disciplineOf('dual_axe');
    const club = AD.disciplineAbilities('club'), axes = AD.disciplineAbilities('dual_axe');
    if (club.includes('rend') || !axes.includes('rend') || !club.includes('cleave')) return 'the club holds ' + club + ', the axes ' + axes;
    for (const [k, row] of Object.entries(R.ROLE_KEYS)) if (!AD.DISCIPLINES[row.discipline]) return k + ' names discipline ' + row.discipline + ', no abilities.js row';
    const h = M.hs.heroSetup({ weaponType: 'hammer', options: {}, bar: ['rend', 'cleave'], partyRoles: [] });
    const acts = h.slots.filter((s) => s.slot.action.type === 'ability').map((s) => s.slot.action.id);
    return JSON.stringify(acts) === '["cleave"]' ? null : 'a club hero\'s stored Rend + Cleave bar runs ' + JSON.stringify(acts);
  },
};

const mutants = [
  { name: '[spell-content] a dropped staff plays the Mage again', case: 'every-magic-weapon-has-a-discipline',
    edits: [['src/data/wave3-uniques.js', "weaponType:'magic',discipline:'restoration',twoHanded:true,", "weaponType:'magic',twoHanded:true,"]] },
  { name: '[spell-content] the Codex heals', case: 'every-magic-weapon-has-a-discipline',
    edits: [['src/data/items.js', "weaponType:'magic', discipline:'destruction', atkB:15,", "weaponType:'magic', discipline:'restoration', atkB:15,"]] },
  { name: 'the tank chases with a monster on him', case: 'tank-holds',
    edits: [[R, "  if (mons.some((m) => cheb(m, h) <= 1)) { clearGoal(h); return; }\n", '']] },
  { name: 'the nearest free tile by straight line, reachable or not (live v0.2.22)', case: 'melee-reaches-a-free-tile',
    edits: [[R, '  if (goToNearest(inst, h, beside([tgt]))) return;', "  { const t = ringFree(inst.grid, tgt, 1, h, (x, y) => !standable(inst, h, tgt.pocket, x, y)); if (t) { setGoal(inst, h, t[0], t[1]); return; } }"]] },
  { name: 'a second tank stands by whatever is beside it (live v0.2.20)', case: 'second-tank-walks-to-its-mark',
    edits: [[R, "  if (!h.chase) { clearGoal(h); return; }\n  /* A tank no monster", "  if (!h.chase || mons.some((m) => cheb(m, h) <= 1)) { clearGoal(h); return; }\n  /* A tank no monster"]] },
  { name: 'the farthest monster picks first', case: 'surround-then-queue',
    edits: [[R, '    .sort(([a, ta], [b, tb]) => dist2(a, ta) - dist2(b, tb) || a.id - b.id);', '    .sort(([a, ta], [b, tb]) => dist2(b, tb) - dist2(a, ta) || a.id - b.id);']] },
  { name: 'no queue: extras stand', case: 'surround-then-queue', edits: [[R, '    if (q) setGoal(inst, m, q[0], q[1]);', '']] },
  { name: 'the Melee DPS ignores the tank\'s target', case: 'melee-dps-slot',
    edits: [[R, "closeIn(inst, h, unitById(inst, h.target));", 'closeIn(inst, h, nearestTo(mons, h));']] },
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
  { name: 'a staff offers the Mage too', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  staff: key(['healer'], 'restoration'),", "  staff: key(['mage', 'healer'], 'restoration'),"]] },
  { name: 'a wand plays the Healer', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  wand: key(['mage'], 'destruction'),", "  wand: key(['healer'], 'destruction'),"]] },
  { name: 'a sword alone plays the tank again (audit c02)', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  sword: key(['melee_dps'], 'sword'),", "  sword: key(['tank'], 'shield'),"]] },
  { name: 'a sword and a shield play no tank', case: 'the-shield-makes-the-tank',
    edits: [['src/data/hunt-roles.js', "export const SHIELD_ARM = Object.freeze({ sword: 'shield', neutral: 'shield' });", "export const SHIELD_ARM = Object.freeze({ neutral: 'shield' });"]] },
  { name: 'a crossbow and a shield play the tank', case: 'the-shield-makes-the-tank',
    edits: [['src/data/hunt-roles.js', "export const SHIELD_ARM = Object.freeze({ sword: 'shield', neutral: 'shield' });", "export const SHIELD_ARM = Object.freeze({ sword: 'shield', neutral: 'shield', ranged: 'shield' });"]] },
  { name: 'a spellbook counts as a shield', case: 'the-shield-makes-the-tank',
    edits: [['src/data/shields.js', "export const isShield = (item) => !!item && item.slot === 'shield' && item.offhand === 'shield';", "export const isShield = (item) => !!item && item.slot === 'shield';"]] },
  { name: 'the worn set ignores the shield slot', case: 'the-shield-makes-the-tank',
    edits: [['src/data/hunt-roles.js', 'items && e.shield ? items[e.shield] : null', 'null']] },
  { name: 'a bow is one-handed again', case: 'the-shield-makes-the-tank',
    edits: [['src/data/gear-tiers.js', "    key: 'bow', label: 'Bow', weaponType: 'ranged', skill: 'crafting', mat: 'plank', twoHanded: true,", "    key: 'bow', label: 'Bow', weaponType: 'ranged', skill: 'crafting', mat: 'plank',"]] },
  { name: 'the club shares the axes\' list (audit c03)', case: 'the-club-is-its-own-discipline',
    edits: [['src/data/hunt-roles.js', "  club: key(['melee_dps'], 'club'),\n  hammer: key(['melee_dps'], 'club'),", "  club: key(['melee_dps'], 'dual_axe'),\n  hammer: key(['melee_dps'], 'dual_axe'),"]] },
  { name: 'the club bleeds', case: 'the-club-is-its-own-discipline',
    edits: [['src/data/abilities.js', "  ab({ id: 'rend', n: 'Rend', disciplines: ['dual_axe'],", "  ab({ id: 'rend', n: 'Rend', disciplines: ['dual_axe', 'club'],"]] },
  { name: 'a stored bar keeps an ability its discipline does not hold', case: 'the-club-is-its-own-discipline',
    edits: [['src/core/hunt-spawn.js', 'slots: heroSlots(o.bar, role, (id) => allowed.includes(id)),', 'slots: heroSlots(o.bar, role, null),']] },
  { name: 'a magic weapon ignores its discipline', case: 'role-from-weapon', edits: [['src/data/hunt-roles.js', "  if (item.weaponType === 'magic') return MAGIC_ROLE_WEAPON[item.discipline] || 'wand';", "  if (item.weaponType === 'magic') return 'wand';"]] },
];

await suite('hunt-core/roles', cases, mutants);
