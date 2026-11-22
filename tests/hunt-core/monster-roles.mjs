// tests/hunt-core/monster-roles.mjs — MONSTER ROLES AND THE PARTY'S TWO ROWS (src/core/hunt/monster-roles.js, src/data/monster-roles.js;
// wave 2, lane/w2-roles-rows). Run by run-all.mjs.
//
//   data    the role table is valid (reaches, ranges inside MONSTER_RANGE, splash, an answer each), every monster row's `role` names a row,
//           and the sample is assigned: Muster Barrows' four bodies (swarm, stalker, brute, brute) and Krell's Hold's Lookout (shooter).
//   rows    a hero with no row setting stands front when its role fights beside its target and back otherwise; a setting overrides.
//   reach   on the Danger scale a brute takes the nearest front-row hero, a shooter the farthest back-row hero, a stalker the weakest, and
//           a swarm spreads over the heroes the fewest are on, the front first; a hero outside the pack's area is never taken; with no
//           hero in its row a shooter aims as it always did (the farthest); off the scale every role aims as before (the caller's pick).
//   range   a role's range plays only on the scale and only on a row with none of its own (its own wins).
//   splash  on the scale a caster's blow also lands on a hero beside its target, never on one farther off; off the scale only on its
//           target.
//   play    THE ONE ENGINE (CLAUDE.md section 6): two Melee heroes on the scale, the puller set to the back row and the other to the front
//           (row SETTINGS, through the settle's boundary): brutes turn off the puller onto the front hero (the re-aim), which the puller
//           takes without the role; the hunt plays the same, digit for digit, in one window and in 10 s windows with the world through JSON
//           at every cut; with no stance the role changes nothing.
//   mutants each rule planted back, each caught by its own case.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCore, plant, makeReport, member, groundRow, gridOf, world, hero, mon, instOf, subStep, T0 } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
const load = async (root) => {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.danger = await imp('src/core/hunt/danger.js');
  M.shooters = await imp('src/core/hunt/shooters.js');
  M.roles2 = await imp('src/core/hunt/monster-roles.js');
  M.roleData = await imp('src/data/monster-roles.js');
  M.monsterData = await imp('src/data/monsters.js');
  return M;
};

/* A role on the fixture's rat for one call (the catalogue row, as the engine reads it), put back after. */
function withRole(M, kind, role, fn) {
  const row = M.MONSTERS[kind], had = Object.prototype.hasOwnProperty.call(row, 'role'), was = row.role;
  row.role = role;
  try { return fn(); } finally { if (had) row.role = was; else delete row.role; }
}

/* Three heroes in the east room (pocket 0): a tank in front, a mage and a healer behind; the healer farthest from (14, 3). */
function trio(M) {
  return [hero(M, 1, 11, 2, { role: 'tank', maxHp: 60, hp: 60 }), hero(M, 2, 17, 5, { role: 'mage', maxHp: 30, hp: 30 }),
    hero(M, 3, 11, 6, { role: 'healer', maxHp: 40, hp: 40 })];
}
/* The reaches the engine plays (monster-roles.js BEFORE). */
const REACHES = ['front', 'back', 'weakest', 'spread'];
const onScale = (M, w) => { M.danger.openDanger(w, 'steady', 0); return w; };

const CASES = {
  data(M) {
    const B = M.monsterData.MONSTER_RANGE, ROLES = M.roleData.MONSTER_ROLES, bad = [];
    for (const [id, r] of Object.entries(ROLES)) {
      if (!REACHES.includes(r.reach)) bad.push('role ' + id + ' reach ' + r.reach + ' is none the engine plays (' + REACHES.join(', ') + ')');
      if (!(Number.isInteger(r.range) && (r.range === 0 || (r.range >= B.min && r.range <= B.max)))) bad.push('role ' + id + ' range ' + r.range + ' is not 0 or ' + B.min + '..' + B.max);
      if (r.splash !== undefined && !(Number.isInteger(r.splash.r) && r.splash.r >= 1 && Number.isInteger(r.splash.pm) && r.splash.pm > 0 && r.splash.pm <= 1000)) bad.push('role ' + id + ' splash is not { r >= 1, pm 1..1000 }');
      if (typeof r.answer !== 'string' || !r.answer) bad.push('role ' + id + ' says nothing of what answers it');
    }
    for (const [id, m] of Object.entries(M.MONSTERS)) if (m && m.role !== undefined && !Object.prototype.hasOwnProperty.call(ROLES, m.role)) bad.push('monster ' + id + ' names no role row: ' + m.role);
    if (bad.length) return bad.join('; ');
    const want = { barrow_pikeman: 'swarm', cairn_wight: 'stalker', muster_knight: 'brute', captain_hask: 'brute', hasks_lookout: 'shooter' };
    for (const [id, r] of Object.entries(want)) if (M.MONSTERS[id].role !== r) return id + ' plays ' + M.MONSTERS[id].role + ', the sample says ' + r;
    for (const id of ['brute', 'shooter', 'caster', 'swarm', 'stalker', 'warder']) if (!M.roleData.MONSTER_ROLES[id]) return 'no ' + id + ' row (02 package 3 names six)';
    return null;
  },
  rows(M) {
    const R = M.roles2;
    for (const [role, row] of [['tank', 'front'], ['melee_dps', 'front'], ['ranger', 'back'], ['mage', 'back'], ['healer', 'back']]) {
      if (R.rowOf({ role }) !== row) return role + ' stands in the ' + R.rowOf({ role }) + ' row, not the ' + row;
    }
    if (R.rowOf({ role: 'tank', row: 'back' }) !== 'back') return 'a tank set to the back row stands in the ' + R.rowOf({ role: 'tank', row: 'back' });
    if (R.rowOf({ role: 'mage', row: 'front' }) !== 'front') return 'a mage set to the front row stands in the back';
    return null;
  },
  reach(M) {
    const aim = (kind, units, scale, pocket = 0, fb = 99) => {
      const w = world(M, units.concat([mon(M, 10, pocket, 14, 3, { kind })]));
      if (scale) onScale(M, w);
      return M.shooters.aimOf(instOf(M, w), w.units[w.units.length - 1], fb);
    };
    if (aim('muster_knight', trio(M), true) !== 1) return 'a brute took ' + aim('muster_knight', trio(M), true) + ', not the front row\'s tank';
    if (aim('hasks_lookout', trio(M), true) !== 3) return 'a shooter took ' + aim('hasks_lookout', trio(M), true) + ', not the farthest of the back row';
    if (aim('cairn_wight', trio(M), true) !== 2) return 'a stalker took ' + aim('cairn_wight', trio(M), true) + ', not the weakest (the mage)';
    /* the healer in the west room is outside the pack's area: the shooter takes the mage */
    const away = trio(M); away[2].x = 5; away[2].y = 3; away[2].fx = 5; away[2].fy = 3;
    if (aim('hasks_lookout', away, true) !== 2) return 'a shooter took ' + aim('hasks_lookout', away, true) + ' with the healer outside its area';
    /* no back row: the shooter aims as it always did, at the farthest hero; a tank set to the back is the back row */
    const front = trio(M); front[1].row = 'front'; front[2].row = 'front';
    if (aim('hasks_lookout', front, true) !== 3) return 'with no back row a shooter took ' + aim('hasks_lookout', front, true) + ', not the farthest';
    const tankBack = trio(M); tankBack[0].row = 'back'; tankBack[1].row = 'front'; tankBack[2].row = 'front';
    if (aim('hasks_lookout', tankBack, true) !== 1) return 'a shooter took ' + aim('hasks_lookout', tankBack, true) + ', not the tank set to the back row';
    /* the swarm spreads over the FRONT row: each aimed in turn, the front hero the fewest are on, then the nearest; the back row never.
       The trio and a second front hero (a Melee hero at 13, 2): the four go 4, 1, 4, 1 */
    const units = trio(M).concat([hero(M, 4, 13, 2, { role: 'melee_dps', maxHp: 60, hp: 60 }), mon(M, 10, 0, 14, 3, { kind: 'barrow_pikeman' }),
      mon(M, 11, 0, 14, 4, { kind: 'barrow_pikeman' }), mon(M, 12, 0, 15, 3, { kind: 'barrow_pikeman' }), mon(M, 13, 0, 15, 4, { kind: 'barrow_pikeman' })]);
    const w = onScale(M, world(M, units));
    const inst = instOf(M, w);
    const got = [];
    for (const m of units.slice(4)) { m.target = M.shooters.aimOf(inst, m, 99); got.push(m.target); }
    if (JSON.stringify(got) !== '[4,1,4,1]') return 'a swarm of four aimed ' + JSON.stringify(got) + ', not spread over the front row [4,1,4,1]';
    /* off the scale every role aims as before: a melee row at the caller's pick, a shooter at the farthest */
    for (const k of ['muster_knight', 'cairn_wight', 'barrow_pikeman']) if (aim(k, trio(M), false) !== 99) return 'off the scale a ' + k + ' took ' + aim(k, trio(M), false);
    if (aim('hasks_lookout', trio(M), false) !== 3) return 'off the scale the Lookout took ' + aim('hasks_lookout', trio(M), false);
    return null;
  },
  /* a role keeps to its reach: unheld, a stalker on the tank turns to the weakest and a brute on a back-row hero to the front; held by a
     Challenge it stays; a stalker already on the weakest, a brute already on a front hero, and a swarm stay put; off the scale nothing turns */
  redive(M) {
    /* the trio and a hurt Melee hero beside the monster: front, max HP 30 like the mage, 10 HP left (the weakest by the tie) */
    const one = (kind, target, o = {}) => {
      const m = mon(M, 10, 0, 14, 3, { kind, target, holdMs: o.hold || 0 });
      const w = world(M, trio(M).concat([hero(M, 4, 13, 3, { role: 'melee_dps', maxHp: 30, hp: 10 }), m]));
      if (o.scale !== false) onScale(M, w);
      return M.roles2.reaimOf(instOf(M, w), m);
    };
    if (one('cairn_wight', 1) !== 4) return 'an unheld stalker on the tank turned to ' + one('cairn_wight', 1) + ', not the weakest';
    /* a Challenge's hold (CHALLENGE.holdMs, counting down): a stalker is held its role's heldPm of it, a brute all of it */
    const H = M.huntRoles.CHALLENGE.holdMs, half = (H * M.roleData.MONSTER_ROLES.stalker.heldPm) / 1000;
    if (one('cairn_wight', 1, { hold: H - half + 500 }) !== null) return 'a stalker held by a fresh Challenge turned away';
    if (one('cairn_wight', 1, { hold: H - half - 500 }) !== 4) return 'a stalker past its share of the hold stayed on the tank';
    if (one('muster_knight', 3, { hold: H - half - 500 }) !== null) return 'a brute broke a Challenge\'s hold early';
    if (one('cairn_wight', 2) !== null) return 'a stalker on a hero of the least max HP turned to ' + one('cairn_wight', 2) + ' on a tie';
    if (one('cairn_wight', 3) !== 4) return 'a stalker on the healer (40) kept it over a hero of 30';
    if (one('muster_knight', 3) !== 4) return 'a brute on a back-row hero turned to ' + one('muster_knight', 3) + ', not the nearest front';
    if (one('muster_knight', 1) !== null) return 'a brute on a front hero turned to ' + one('muster_knight', 1) + ', a nearer front one';
    if (one('barrow_pikeman', 3) !== null) return 'a swarm turned from whom it was given';
    if (one('cairn_wight', 1, { scale: false }) !== null) return 'off the scale a stalker turned';
    /* in the fight's own target hook: an engaged stalker on the tank turns to the weakest at the next sub-step, held it stays */
    const hook = (hold) => {
      const m = mon(M, 10, 0, 14, 3, { kind: 'cairn_wight', target: 1, holdMs: hold });
      const w = onScale(M, world(M, trio(M).concat([m]), { phase: 'fight', leader: 1 }));
      w.packs[0].aggro = true;
      M.targeting.chooseTargets(instOf(M, w), subStep(0));
      return m.target;
    };
    if (hook(0) !== 2) return 'the fight\'s target hook left an unheld stalker on ' + hook(0) + ', not the weakest';
    if (hook(5000) !== 1) return 'the fight\'s target hook turned a held stalker to ' + hook(5000);
    return null;
  },
  range(M) {
    const w = onScale(M, world(M, trio(M).concat([mon(M, 10, 0, 14, 3, { kind: 'rat' }), mon(M, 11, 0, 15, 3, { kind: 'hasks_lookout' }), mon(M, 12, 0, 16, 3, { kind: 'cairn_wight' })])));
    const inst = instOf(M, w), [rat, look, wight] = w.units.slice(3);
    const caster = M.roleData.MONSTER_ROLES.caster.range;
    return withRole(M, 'rat', 'caster', () => {
      if (M.shooters.rangeOf(inst, rat) !== caster) return 'a caster with no range of its own shoots from ' + M.shooters.rangeOf(inst, rat) + ', not its role\'s ' + caster;
      /* the Lookout's own 5 tiles against a caster role's 4: its own wins */
      const own = withRole(M, 'hasks_lookout', 'caster', () => M.shooters.rangeOf(inst, look));
      if (own !== M.monsterData.monsterRangeOf(M.MONSTERS.hasks_lookout) || own === caster) return 'the Lookout shoots from ' + own + ' as a caster, not its own range';
      if (M.shooters.rangeOf(inst, wight) !== 0) return 'a stalker shoots from ' + M.shooters.rangeOf(inst, wight);
      w.risk = '';
      if (M.shooters.rangeOf(inst, rat) !== 0) return 'off the scale a caster shoots from ' + M.shooters.rangeOf(inst, rat);
      return null;
    });
  },
  splash(M) {
    const once = (scale) => withRole(M, 'rat', 'caster', () => {
      const heroes = [hero(M, 1, 11, 3, { role: 'tank', maxHp: 5000, hp: 5000 }), hero(M, 2, 11, 4, { role: 'mage', maxHp: 5000, hp: 5000 }),
        hero(M, 3, 11, 6, { role: 'healer', maxHp: 5000, hp: 5000 })];
      /* beside its target, so it swings off the scale too (no role range there) */
      const caster = mon(M, 10, 0, 12, 3, { kind: 'rat', target: 1, swingLeftMs: 0 });
      const w = world(M, heroes.concat([caster]));
      if (scale) onScale(M, w);
      const inst = instOf(M, w), sc = subStep(0);
      /* every blow lands (the chance draw low) at its largest (the damage draw high) */
      let n = 0;
      sc.rng = M.rng.rngFrom(() => (n++ % 2 === 0 ? 0.01 : 0.99));
      M.damage.resolveAttacks(inst, sc);
      return heroes.map((h) => 5000 - h.hp);
    });
    const on = once(true), off = once(false);
    if (!(on[0] > 0)) return 'CONTROL: the caster did not hit its target on the scale (' + JSON.stringify(on) + ')';
    if (!(on[1] > 0)) return 'the hero beside the target took nothing: ' + JSON.stringify(on);
    if (on[1] > on[0]) return 'the splash hit harder than the blow: ' + JSON.stringify(on);
    if (on[2] !== 0) return 'a hero three tiles off was splashed: ' + JSON.stringify(on);
    if (!(off[0] > 0) || off[1] !== 0 || off[2] !== 0) return 'off the scale the blow splashed or missed: ' + JSON.stringify(off);
    return null;
  },
  play(M) {
    const SPAN = 6 * 60000;
    const run = (plan, role, cuts) => withRole(M, 'rat', role, () => withRole(M, 'slime', role, () => {
      const ground = groundRow(), grid = gridOf(M);
      const ms = [member(M, 'a', { seat: 0, maxHp: 60, hp: 60, maxHit: 12 }), member(M, 'b', { seat: 1, maxHp: 30, hp: 30, maxHit: 12 })];
      for (const m of ms) m.hero = { ...m.hero, ...(plan || {}) };
      ms[0].hero.settings = { row: 'back' }; ms[1].hero.settings = { row: 'front' };
      const ctx = { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('roles', 3, d, i), monsters: M.MONSTERS, ground, grid };
      const edges = [T0, ...cuts, T0 + SPAN];
      let w = null, next = T0;
      const events = [], unit = {};
      for (let i = 1; i < edges.length; i++) {
        w = w ? M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))) : null;
        const r = M.cs.simulateHuntInstance({ world: w, nextSwingAtMs: next, members: ms }, { ...ctx, toMs: edges[i] });
        w = r.world; next = r.nextSwingAtMs; events.push(...r.events);
        for (const m of ms) if (Number.isInteger(r.members[m.key].unitIdEver)) unit[m.key] = r.members[m.key].unitIdEver;
        if (!w) break;
      }
      const heroIds = new Set(Object.values(unit));
      const hits = (who) => events.filter((e) => e.type === 'dmg' && e.t === who && !heroIds.has(e.u)).length;
      return { key: JSON.stringify(events), a: hits(unit.a), b: hits(unit.b) };
    }));
    const plan = { risk: 'steady', danger: 0 };
    const tens = Array.from({ length: SPAN / 10000 - 1 }, (_, i) => T0 + (i + 1) * 10000);
    const roled = run(plan, 'brute', []), plain = run(plan, undefined, []);
    if (!(plain.a + plain.b > 0)) return 'CONTROL: no monster blow landed on a hero';
    const share = (r) => r.b / Math.max(1, r.a + r.b);
    if (!(share(roled) > share(plain) + 0.2)) return 'brutes drew the front-row hero ' + share(roled).toFixed(2) + ' of the blows, without the role ' + share(plain).toFixed(2);
    if (run(plan, 'brute', tens).key !== roled.key) return 'the hunt moved with 10 s windows: a viewed hunt and a closed one differ';
    if (run(null, 'brute', []).key !== run(null, undefined, []).key) return 'with no stance a role changed the hunt';
    return null;
  },
};

const MUTANTS = [
  { name: 'aimOf never reads a role', case: 'reach', edits: [['src/core/hunt/shooters.js', '  const pick = role ? reachPick(inst, m, role) : null;', '  const pick = null;']] },
  { name: 'roles play off the scale', case: 'reach', edits: [['src/core/hunt/monster-roles.js', "  if (!inst || !dangerOn(inst.world) || !isMonster(m)) return null;", "  if (!inst || !isMonster(m)) return null;"]] },
  { name: 'a reach ignores the row', case: 'reach', edits: [['src/core/hunt/monster-roles.js', '    if (keep && rowOf(h) !== keep) continue;\n', '']] },
  { name: 'a reach leaves the pack area', case: 'reach', edits: [['src/core/hunt/monster-roles.js', ' || !inArea(inst, m.pocket, h.x, h.y)) continue;', ') continue;']] },
  { name: 'the swarm piles on one hero', case: 'reach', edits: [['src/core/hunt/monster-roles.js', '(a, b) => onHero(inst, a) - onHero(inst, b) || ', '(a, b) => ']] },
  { name: 'the weakest is the nearest', case: 'reach', edits: [['src/core/hunt/monster-roles.js', 'weakest: () => (a, b) => a.maxHp - b.maxHp || a.hp - b.hp || a.id - b.id,', 'weakest: (inst, m) => (a, b) => dist2(a, m) - dist2(b, m) || a.id - b.id,']] },
  { name: 'every hero stands in front', case: 'rows', edits: [['src/core/hunt/monster-roles.js', "  return r && r.melee === false ? 'back' : 'front';", "  return 'front';"]] },
  { name: 'the row setting is ignored', case: 'rows', edits: [['src/core/hunt/monster-roles.js', '  if (u && ROWS.includes(u.row)) return u.row;\n', '']] },
  { name: 'the row setting never reaches the unit', case: 'play', edits: [['src/core/combat-sim.js', "  if (row === 'front' || row === 'back') u.row = row; else if (u.row !== undefined) delete u.row;\n", '']] },
  { name: 'a role never re-aims', case: 'redive', edits: [['src/core/hunt/targeting.js', '  for (const m of engagedMonstersOf(inst)) { const id = reaimOf(inst, m); if (id !== null) retarget(inst, m, id, sc); }\n', '']] },
  { name: 'a Challenge\'s hold is ignored', case: 'redive', edits: [['src/core/hunt/monster-roles.js', " || role.reach === 'spread' || held(role, m)) return null;", " || role.reach === 'spread') return null;"]] },
  { name: 'a stalker is held the whole hold', case: 'redive', edits: [['src/core/hunt/monster-roles.js', '(Number.isInteger(role.heldPm) ? role.heldPm : 1000)', '1000']] },
  { name: 'every role breaks a hold early', case: 'redive', edits: [['src/core/hunt/monster-roles.js', '(Number.isInteger(role.heldPm) ? role.heldPm : 1000)', '(Number.isInteger(role.heldPm) ? role.heldPm : 500)']] },
  { name: 'a brute leaves a front hero for a nearer one', case: 'redive', edits: [['src/core/hunt/monster-roles.js', '  if (keep) return rowOf(cur) === keep ? null : pick;', '  if (keep) return pick;']] },
  { name: 'a stalker thrashes on ties', case: 'redive', edits: [['src/core/hunt/monster-roles.js', '  return p.maxHp < cur.maxHp ? pick : null;', '  return pick;']] },
  { name: 'a role gives no range', case: 'range', edits: [['src/core/hunt/shooters.js', ' || roleRange(inst, m) : 0;', ' : 0;']] },
  { name: 'a role range beats the row\'s own', case: 'range', edits: [['src/core/hunt/shooters.js', 'monsterRangeOf((inst.monsters || MONSTERS)[m.kind]) || roleRange(inst, m)', 'roleRange(inst, m) || monsterRangeOf((inst.monsters || MONSTERS)[m.kind])']] },
  { name: 'no splash', case: 'splash', edits: [['src/core/hunt/damage.js', '      const sp = splashOn(inst, u, t);', '      const sp = { heroes: [] };']] },
  { name: 'the splash reaches any distance', case: 'splash', edits: [['src/core/hunt/monster-roles.js', ' && cheb(h, t) <= role.splash.r)', ')']] },
  { name: 'the splash is the whole blow', case: 'splash', edits: [['src/core/hunt/damage.js', 'Math.max(1, Math.floor((monsterMaxHit(blowRow) * sp.pm) / 1000))', 'monsterMaxHit(blowRow) * 3']] },
  { name: 'a sample row loses its role', case: 'data', edits: [['src/data/grounds/muster_barrows/pack.js', "      role: 'stalker',\n", '']] },
  { name: 'a role row names no reach', case: 'data', edits: [['src/data/monster-roles.js', "reach: 'weakest', range: 0,", "reach: 'random', range: 0,"]] },
];

const R = makeReport('hunt-core/monster-roles');
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
