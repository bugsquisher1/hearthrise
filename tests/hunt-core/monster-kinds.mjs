// tests/hunt-core/monster-kinds.mjs — the Krell's Hold design's engine pieces 2, 3 and 4 (docs/planning/PRIORITY_BOARD.md "Engine
// pieces that do not exist yet"): a monster that SHOOTS (src/core/hunt/shooters.js, a row's `range`), a monster that MENDS its pull
// (a 'mend' row of src/data/monster-spells.js, played by src/core/hunt/monster-spells.js) and the KIND-FIRST Target
// (src/core/hunt/targeting.js kindOf, the hero's `tkind`). Run by run-all.mjs. `--only a,b` runs just those cases and their mutants.
//
//   shooter-rows             a row's range is whole tiles inside MONSTER_RANGE; a shot reaches within range in sight (Euclid, walls stop it)
//   shooter-aims-farthest    a pulled shooter aims at the hero farthest from it inside its pack's area (ties: lower id; none there: the
//                            puller), a melee packmate at the puller; its target falls, it turns on the next farthest
//   shooter-stands-and-shoots  the one engine (world-step): it walks into range, stops, takes no slot, and every blow is from range in sight
//   challenge-turns-shooter  a tank's Challenge turns it on the tank; it shoots him from where it stands
//   melee-walks-to-shooter   a Melee hero it shoots still walks to its mark (it is not held); a tank with only a shooter on him walks out
//   mend-rows                a mend row's bounds (no r, len or element), never marked, never priced as a blow (biggestBlowOn)
//   mend-heals-the-most-hurt the most hurt packmate in range (share of max HP), never itself, another pack or one out of range; a windup in
//                            which the caster stands and makes no swing; one roll of the spell's number, never past max HP; the cooldown
//                            from the start; nobody hurt, no cast and no cooldown spent
//   mend-marks-nothing       a mend winding up marks no ground, casts at no hero (enemy_casting) and draws no mark on the screen
//   mend-dropped             the caster killed in its windup mends nothing; a packmate that fell meanwhile is mended by nobody
//   mend-never-a-phased-boss a boss whose HP only falls (boss-phases.js) is never mended
//   tally-mend               the analyzer credits a monster's mend to nobody, and still refuses any other heal from a non-hero
//   kind-first-order         the named kind comes first under every mode, its own order inside; settings override; a kind not engaged
//                            changes nothing; the basic attack takes the kind in range
//   kind-first-turns-melee   a Melee hero beside another monster turns to the named kind when its re-aim clock is due, never before
//   kind-from-settings       heroSetup reads the server's `target_kind` (a catalogue id only), the unit carries it, the settle writes it at
//                            every boundary and drops it with the setting, and it is never persisted (the world's shape does not move)
//   span-closed-kinds        BROWSER CLOSED, the settle's span: a party fights a shooter, a mender and a melee monster with the kind first
//                            set; every behaviour shows, and a span cut anywhere is the one span byte for byte. (The viewed half: the
//                            browser's prediction against the server's commits, tests/hunt-live.mjs LV-KINDS.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT, hero, mon, world, groundRow, gridOf, spanFixture, runSpan, member, T0 } from './fixtures/h1.js';

const V = (root) => '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(root, 'src/build-info.js'), 'utf8')) || [, ''])[1];
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V(root));
  M.MS = await imp('src/data/monster-spells.js');
  M.spells = await imp('src/core/hunt/monster-spells.js');
  M.marks = await imp('src/core/hunt/marks.js');
  M.shooters = await imp('src/core/hunt/shooters.js');
  M.monData = await imp('src/data/monsters.js');
  M.roleData = await imp('src/data/hunt-roles.js');
  M.tiers = await imp('src/data/hunt-tiers.js');
  M.bossPhases = await imp('src/core/hunt/boss-phases.js');
  return M;
}

/* ── fixtures ── */
const H = (M, id, x, y, role, o) => hero(M, id, x, y, Object.assign({ kind: role, role, dist: 1, chase: true, tmode: 'nearest', stance: 'balanced',
  acc: 1000, maxHit: 6, def: 0, hp: 200, maxHp: 200, speed: 3200 }, o || {}));
const E = (M, id, pocket, x, y, target, o) => mon(M, id, pocket, x, y, Object.assign({ target }, o || {}));
const fight = (M, units, o) => Object.assign({ world: world(M, units, Object.assign({ phase: 'fight', leader: 1,
  packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }] }, o || {})), ground: groundRow(), grid: gridOf(M), occ: null },
{ makeUnit: M.worldstate.makeUnit });
const sc = (M, seed) => {
  const events = [];
  return { atMs: 0, dtMs: 100, swing: 0, rng: M.rng.createRng(M.rng.hashSeed('kinds', seed || 1)), events, emit: (e) => events.push(e), track: () => {} };
};
const of = (s, type) => s.events.filter((e) => e.type === type);

/** Plant row fields ({ kind: { field: value } }) on the engine's own roster for `fn`, then put each back. */
function withRows(M, rows, fn) {
  const keep = [];
  for (const [k, o] of Object.entries(rows)) for (const [f, v] of Object.entries(o)) {
    keep.push([k, f, Object.prototype.hasOwnProperty.call(M.MONSTERS[k], f), M.MONSTERS[k][f]]);
    M.MONSTERS[k][f] = v;
  }
  try { return fn(); } finally {
    for (const [k, f, had, v] of keep.reverse()) { if (had) M.MONSTERS[k][f] = v; else delete M.MONSTERS[k][f]; }
  }
}
/** Plant spell rows (each with its `id`) with the switch on and the first-cast wait off, for `fn`; all put back. */
function withSpells(M, rows, fn) {
  const T = M.MS.MONSTER_SPELLS;
  const was = M.MS.SPELL_SWITCH.live, span = M.MS.SPELL_STAGGER.spanPm;
  M.MS.SPELL_SWITCH.live = true; M.MS.SPELL_STAGGER.spanPm = 0;
  for (const r of rows) { const { id, ...row } = r; T[id] = row; }
  try { return fn(); } finally {
    M.MS.SPELL_SWITCH.live = was; M.MS.SPELL_STAGGER.spanPm = span;
    for (const r of rows) delete T[r.id];
  }
}
/* the test mend: three tiles, a 1.2 s warning, a 6 s cooldown, the caster's biggest hit as its number */
const MEND = Object.freeze({ id: 't_mend', n: 'Test Mend', shape: 'mend', range: 3, windupMs: 1200, cdMs: 6000, hitPm: 1000, element: null });
const RING = Object.freeze({ id: 't_ring', n: 'Test Ring', shape: 'ring', r: 1, range: 1, windupMs: 1600, cdMs: 12000, hitPm: 4000, element: null });

/* One swing at a time through the one engine (world-step.js stepSwing), events and track gathered. */
function swingRun(M, inst, swings, heroes, seed) {
  const out = { events: [], track: [] };
  for (let s = 0; s < swings; s++) {
    const r = M.worldstep.stepSwing(inst.world, { ground: inst.ground, grid: inst.grid, heroes: heroes || null, swingMs: 2000, atMs: s * 2000,
      rng: M.rng.createRng(M.rng.hashSeed('kinds-run', seed || 1, s)) });
    out.events.push(...r.events); out.track.push(...r.track);
  }
  return out;
}
/* Where unit `u` stood at instant `at`: its start tile, then the last step it began by then (a unit swings only at rest). */
const tileAt = (out, u, start, at) => out.track.filter((s) => s.u === u && s.atMs <= at).reduce((p, s) => [s.x, s.y], start);
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
/* a tank's bar: the role rule set's bare Challenge slot (the one ability path casts it, targeting.mjs tankBars) */
const tankBar = (M) => ({ hs: M.AR.newHuntSession({ id: 'kinds', huntFromMs: 0, bag: {}, basics: {}, purse: 0, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch' }),
  actionSet: 'hunt', range: 1, slots: M.conditions.heroSlots(['challenge'], null) });

const cases = {
  'shooter-rows': (M) => {
    const R = M.monData;
    for (const [row, want] of [[{ range: 4 }, 4], [{ range: 2 }, 2], [{ range: 6 }, 6], [{}, 0], [{ range: 1 }, 0], [{ range: 7 }, 0], [{ range: 2.5 }, 0], [{ range: '3' }, 0], [null, 0]]) {
      if (R.monsterRangeOf(row) !== want) return 'monsterRangeOf(' + JSON.stringify(row) + ') is ' + R.monsterRangeOf(row) + ', want ' + want;
    }
    const bad = R.rangeProblems(M.MONSTERS);
    if (bad.length) return 'the shipped roster: ' + bad.join('; ');
    if (!R.rangeProblems({ x: { range: 9 } }).length || !R.rangeProblems({ x: { range: 1 } }).length || R.rangeProblems({ x: { range: 3 }, y: {} }).length) return 'rangeProblems does not hold MONSTER_RANGE';
    return withRows(M, { rat: { range: 3 } }, () => {
      const k = H(M, 1, 14, 3, 'tank');
      const reach = (x, y, kind) => M.shooters.reaches(fight(M, [k]), E(M, 10, 0, x, y, 1, { kind: kind || 'rat' }), k);
      if (!reach(11, 3) || !reach(14, 6) || !reach(16, 5)) return 'a shooter of 3 did not reach 3 tiles straight, or (2, 2)';
      if (reach(11, 4)) return 'a shooter of 3 reached (3, 1): its range is a straight-line distance, as a ranged hero\'s';
      if (reach(18, 3)) return 'a shooter of 3 reached 4 tiles';
      /* a wall between (the door column, x = 9, is wall on rows 1-2) */
      const w = H(M, 1, 8, 1, 'tank');
      if (M.shooters.reaches(fight(M, [w]), E(M, 10, 0, 10, 1, 1), w)) return 'a shot went through the wall';
      /* a monster with no range fights beside its target, as always */
      if (!reach(15, 4, 'slime') || reach(16, 3, 'slime') || M.shooters.rangeOf(fight(M, [k]), k) !== 0) return 'a melee monster reaches past the tiles beside it, or a hero shoots';
      return null;
    });
  },

  'shooter-aims-farthest': (M) => withRows(M, { rat: { range: 3 } }, () => {
    const k = H(M, 1, 13, 3, 'tank');
    const r = H(M, 2, 17, 1, 'ranger');
    const g = H(M, 3, 17, 6, 'mage');
    const far = H(M, 4, 3, 3, 'healer');   // in the west room: outside pocket 0's area, never aimed at
    const s = mon(M, 10, 0, 14, 3, { kind: 'rat' });
    const m = mon(M, 11, 0, 15, 3, { kind: 'slime' });
    const inst = fight(M, [k, r, g, far, s, m], { phase: 'travel', routeIdx: 0,
      packs: [{ aggro: false, holder: null, alive: true }, { aggro: false, holder: null }, { aggro: false, holder: null }] });
    const t = sc(M, 1);
    M.movement.occupancy(inst);
    M.hunt['pull-cycle'].runPhase(inst, t);
    if (inst.world.phase !== 'fight') return 'the fixture never pulled';
    if (m.target !== 1) return 'the melee packmate did not aim at the puller: ' + m.target;
    if (s.target !== 3) return 'the shooter aimed at ' + s.target + ', not the hero farthest from it in its area (3)';
    /* its target falls: it turns on the next farthest; the melee monster keeps the puller */
    g.alive = false; g.hp = 0;
    M.targeting.chooseTargets(inst, t);
    if (s.target !== 2 || m.target !== 1) return 'its target fell and it took ' + s.target + ' (want 2), the melee one ' + m.target;
    /* ties to the lower id; nobody in its area, the puller; a monster with no range, always the puller */
    const tie = fight(M, [H(M, 7, 17, 3, 'ranger'), H(M, 6, 11, 3, 'ranger'), s]);
    if (M.shooters.aimOf(tie, s, 99) !== 6) return 'a tie went to ' + M.shooters.aimOf(tie, s, 99) + ', not the lower id 6';
    if (M.shooters.aimOf(fight(M, [far, s]), s, 99) !== 99) return 'with nobody in its area it did not take the puller';
    return M.shooters.aimOf(inst, m, 42) === 42 ? null : 'a melee monster took a far hero';
  }),

  'shooter-stands-and-shoots': (M) => withRows(M, { rat: { range: 3 } }, () => {
    const k = H(M, 1, 11, 3, 'tank', { chase: false });
    const b = H(M, 2, 17, 6, 'ranger', { chase: false });
    const s = E(M, 10, 0, 12, 1, 2, { kind: 'rat', hp: 9999, maxHp: 9999 });
    const m = E(M, 11, 0, 13, 4, 1, { kind: 'slime', hp: 9999, maxHp: 9999 });
    const inst = fight(M, [k, b, s, m]);
    const out = swingRun(M, inst, 5, null, 2);
    const blows = out.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 10);
    if (blows.length < 2) return 'the shooter landed ' + blows.length + ' blows in 10 s';
    for (const e of blows) {
      const at = tileAt(out, 10, [12, 1], e.atMs);
      if (e.t !== 2) return 'the shooter swung at ' + e.t + ', not its target';
      if (cheb(at, [17, 6]) <= 1 || d2(at, [17, 6]) > 9 || !M.grid.los(inst.grid, { x: at[0], y: at[1] }, b)) return 'a blow at ' + e.atMs + ' from ' + at + ': not from range in sight';
    }
    if (s.queued) return 'the shooter was queued for a slot';
    if (cheb([s.x, s.y], [17, 6]) <= 1) return 'the shooter walked in beside its target to ' + s.x + ',' + s.y;
    if (!out.track.some((st) => st.u === 10)) return 'the shooter never walked into range (it started out of it)';
    return Math.max(Math.abs(m.x - 11), Math.abs(m.y - 3)) <= 1 ? null : 'the melee packmate did not take its slot beside the tank';
  }),

  'challenge-turns-shooter': (M) => withRows(M, { rat: { range: 3 } }, () => {
    const k = H(M, 1, 11, 3, 'tank', { chase: false });
    const b = H(M, 2, 17, 6, 'ranger', { chase: false });
    const s = E(M, 10, 0, 14, 4, 2, { kind: 'rat', hp: 9999, maxHp: 9999 });
    const inst = fight(M, [k, b, s]);
    const out = swingRun(M, inst, 3, { 1: tankBar(M) }, 3);
    if (!out.events.some((e) => e.type === 'challenge' && e.u === 1)) return 'the tank never Challenged';
    if (s.target !== 1) return 'the Challenge did not turn the shooter: it aims at ' + s.target;
    const at = out.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 10 && e.t === 1);
    if (!at.length) return 'the shooter never shot the tank';
    for (const e of at) { const p = tileAt(out, 10, [14, 4], e.atMs); if (cheb(p, [11, 3]) <= 1) return 'it walked in beside the tank to shoot him, at ' + p; }
    return null;
  }),

  'melee-walks-to-shooter': (M) => withRows(M, { rat: { range: 4 } }, () => {
    /* (a) a Melee hero on "Strongest" beside a weak monster, shot by a strong shooter: it is not held, so it turns to its mark */
    const k = H(M, 1, 12, 3, 'tank', { chase: false });
    const d = H(M, 3, 13, 2, 'melee_dps', { tmode: 'strongest', target: 11 });
    const r = E(M, 11, 0, 13, 3, 1, { kind: 'slime', hp: 5, maxHp: 5 });
    const s = E(M, 10, 0, 17, 2, 3, { kind: 'rat', hp: 50, maxHp: 50 });
    const inst = fight(M, [k, d, r, s]);
    M.movement.occupancy(inst);
    M.targeting.chooseTargets(inst, sc(M, 4));
    if (d.target !== 10) return 'a Melee hero shot from range kept the monster beside it (' + d.target + '), not its mark the shooter';
    /* (b) a tank with only a shooter on him walks out to it and fights it (a shooter never comes to his box) */
    const t2 = H(M, 1, 12, 3, 'tank');
    const s2 = E(M, 10, 0, 14, 3, 1, { kind: 'rat', hp: 999, maxHp: 999 });
    const i2 = fight(M, [t2, s2]);
    const run = sc(M, 5);
    for (let i = 0; i < 40; i++) {
      run.atMs = i * 100;
      M.movement.occupancy(i2);
      M.targeting.chooseTargets(i2, run);
      M.roles.positionHeroes(i2, run);
      M.movement.moveAll(i2, run);
      M.damage.resolveAttacks(i2, run);
    }
    if (Math.max(Math.abs(t2.x - s2.x), Math.abs(t2.y - s2.y)) > 1) return 'the tank held at ' + t2.x + ',' + t2.y + ' while only a shooter 2 tiles off was on him';
    return run.events.some((e) => e.type === 'dmg' && e.u === 1 && e.t === 10) ? null : 'the tank never hit the shooter';
  }),

  'mend-rows': (M) => {
    const { id, ...row } = MEND;
    const p = M.MS.validateSpell(row, id);
    if (p.length) return 'the test mend was refused: ' + p.join('; ');
    for (const [o, why] of [[{ r: 1 }, 'a mend with a radius'], [{ len: 2 }, 'a mend with a length'], [{ element: 'poison' }, 'a mend with an element'],
      [{ windupMs: 1100 }, 'a mend under the fair warning'], [{ hitPm: 50 }, 'a 5% mend'], [{ range: 7 }, 'a mend of range 7']]) {
      if (!M.MS.validateSpell(Object.assign({}, row, o), id).length) return why + ' passed';
    }
    if (!M.MS.mends(MEND) || M.MS.mends(RING) || M.MS.marked(MEND) || !M.MS.marked(RING)) return 'a mend is marked, or a ring mends';
    /* the biggest blow a hunt can land passes over a mend, and still prices a strike */
    const before = M.hunt['pull-cycle'].biggestBlowOn('mill_cellar', null).hit;
    const mended = withSpells(M, [{ ...MEND, hitPm: 4000 }], () => withRows(M, { slime: { spells: ['t_mend'] } }, () => M.hunt['pull-cycle'].biggestBlowOn('mill_cellar', null).hit));
    const struck = withSpells(M, [RING], () => withRows(M, { slime: { spells: ['t_ring'] } }, () => M.hunt['pull-cycle'].biggestBlowOn('mill_cellar', null).hit));
    if (mended !== before) return 'a mend priced as a blow: the Cellar\'s biggest blow went ' + before + ' -> ' + mended;
    if (!(struck > before)) return 'the fixture strike moved no biggest blow (' + before + ' -> ' + struck + '): the check proves nothing';
    return withSpells(M, [MEND], () => withRows(M, { slime: { spells: ['t_mend'] } }, () => M.MS.validate(M.MONSTERS).join('; ') || null));
  },

  'mend-heals-the-most-hurt': (M) => withSpells(M, [MEND], () => withRows(M, { slime: { spells: ['t_mend'] } }, () => {
    const k = H(M, 1, 13, 3, 'tank');
    const c = E(M, 10, 0, 14, 3, 1, { kind: 'slime', hp: 1, maxHp: 20 });          // the caster, the most hurt: never itself
    const a = E(M, 11, 0, 15, 2, 1, { hp: 5, maxHp: 10 });                           // 50%
    const b = E(M, 12, 0, 15, 4, 1, { hp: 3, maxHp: 12 });                           // 25%: the one
    const full = E(M, 13, 0, 16, 3, 1, { hp: 10, maxHp: 10 });
    const other = E(M, 14, 1, 16, 5, 1, { hp: 1, maxHp: 10 });                       // another pack's: never
    const far = E(M, 15, 0, 18, 6, 1, { hp: 1, maxHp: 10 });                         // out of range (4): never
    const inst = fight(M, [k, c, a, b, full, other, far]);
    const t = sc(M, 6);
    let windupCast = 'unread';
    for (let i = 0; i <= 61; i++) {
      t.atMs = i * 100;
      M.movement.occupancy(inst);
      M.movement.moveAll(inst, t);
      M.damage.resolveAttacks(inst, t);
      M.spells.castSpells(inst, t);
      M.spells.dropCasts(inst, t);
      if (i === 5) windupCast = c.cast ? c.cast.t : null;
    }
    const sp = of(t, 'spell'), ends = of(t, 'spell_end'), heals = of(t, 'heal');
    if (!sp.length || sp[0].atMs !== 0 || sp[0].shape !== 'mend' || sp[0].t !== 12 || sp[0].spell !== 't_mend') return 'the first mend did not start at 0 on the most hurt packmate (12): ' + JSON.stringify(sp[0]);
    if (windupCast !== 12) return 'the live cast does not name its packmate: ' + windupCast;
    const swings = t.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 10 && e.atMs > 0 && e.atMs < MEND.windupMs);
    if (swings.length) return 'the caster swung in its windup at ' + swings.map((e) => e.atMs);
    if (!ends.length || ends[0].atMs !== MEND.windupMs || ends[0].why !== 'landed' || ends[0].hits !== 1) return 'the mend did not land at the windup\'s end: ' + JSON.stringify(ends[0]);
    const [lo, top] = M.MS.spellHit(M.C.monsterMaxHit(M.tiers.atTier(M.MONSTERS.slime, null)), MEND);
    const h = heals[0];
    if (!h || h.atMs !== MEND.windupMs || h.u !== 10 || h.t !== 12 || h.spell !== 't_mend' || h.amount < Math.min(lo, 9) || h.amount > Math.min(top, 9)) return 'the heal is not one roll of [' + lo + ', ' + top + '] (capped at 9 missing) on 12: ' + JSON.stringify(h);
    if (b.hp !== 3 + h.amount) return 'the packmate stands at ' + b.hp + ', not 3 + ' + h.amount;
    if ([a, full, other, far].some((u) => heals.some((x) => x.t === u.id)) || c.hp !== 1) return 'a mend went to a packmate it may not take (itself, full, another pack, out of range)';
    /* the cooldown runs from the start: the next cast at 6 s */
    if (sp.length !== 2 || sp[1].atMs !== MEND.cdMs) return 'the next mend did not start at the cooldown from the first\'s start: ' + sp.map((e) => e.atMs);
    /* NEVER PAST MAX HP: a packmate one point down takes one */
    const one = E(M, 11, 0, 15, 3, 1, { hp: 9, maxHp: 10 });
    const i2 = fight(M, [H(M, 1, 13, 3, 'tank'), E(M, 10, 0, 14, 3, 1, { kind: 'slime' }), one]);
    const t2 = sc(M, 7);
    for (let i = 0; i <= 12; i++) { t2.atMs = i * 100; M.movement.occupancy(i2); M.spells.castSpells(i2, t2); }
    const h2 = of(t2, 'heal')[0];
    if (!h2 || h2.amount !== 1 || one.hp !== 10) return 'a packmate one point down took ' + (h2 && h2.amount) + ' to ' + one.hp;
    /* NOBODY HURT: no cast starts, and no cooldown is spent */
    const i3 = fight(M, [H(M, 1, 13, 3, 'tank'), E(M, 10, 0, 14, 3, 1, { kind: 'slime' }), E(M, 11, 0, 15, 3, 1)]);
    const t3 = sc(M, 8);
    for (let i = 0; i <= 20; i++) { t3.atMs = i * 100; M.movement.occupancy(i3); M.spells.castSpells(i3, t3); }
    const caster3 = i3.world.units[1];
    return of(t3, 'spell').length === 0 && !(caster3.spellCds && caster3.spellCds.t_mend > 0) ? null : 'a mend started (or spent its cooldown) with nobody hurt';
  })),

  'mend-marks-nothing': (M) => withSpells(M, [MEND], () => withRows(M, { slime: { spells: ['t_mend'] } }, () => {
    const k = H(M, 1, 13, 3, 'tank');
    const c = E(M, 10, 0, 14, 3, 1, { kind: 'slime' });
    const b = E(M, 11, 0, 14, 2, 1, { hp: 2, maxHp: 10 });
    const inst = fight(M, [k, c, b]);
    const t = sc(M, 9);
    M.movement.occupancy(inst);
    M.spells.castSpells(inst, t);
    if (!c.cast) return 'the fixture mend did not start';
    if (M.marks.castShape(c) !== null || M.marks.anyMark(inst) || M.marks.markedAt(inst, 14, 2)) return 'a mend marks ground';
    if (M.marks.castsCovering(inst, [k]).length || M.conditions.holds({ inst, u: k, h: null, slot: null }, { metric: 'enemy_casting', op: 'gte', value: 1, subject: 'any' })) return 'a mend counts as casting at a hero';
    const ev = of(t, 'spell')[0];
    if (M.marks.markOfEvent(ev, inst.grid) !== null) return 'the screen draws a mark for a mend: ' + JSON.stringify(M.marks.markOfEvent(ev, inst.grid));
    return M.marks.markTiles(c, inst.grid).length ? 'a mend has tiles to draw' : null;
  })),

  'mend-dropped': (M) => withSpells(M, [MEND], () => withRows(M, { slime: { spells: ['t_mend'] } }, () => {
    const play = (cut) => {
      const k = H(M, 1, 13, 3, 'tank');
      const c = E(M, 10, 0, 14, 3, 1, { kind: 'slime', hp: 9999, maxHp: 9999 });
      const b = E(M, 11, 0, 14, 2, 1, { hp: 2, maxHp: 99 });
      const inst = fight(M, [k, c, b]);
      const t = sc(M, 10);
      for (let i = 0; i <= 15; i++) {
        t.atMs = i * 100;
        M.movement.occupancy(inst);
        M.spells.castSpells(inst, t);
        if (t.atMs === 600) cut(inst, t, k, c, b);
        M.spells.dropCasts(inst, t);
      }
      return t;
    };
    const killed = play((inst, t, k, c) => M.damage.landHit(inst, t, k, c, 99999, null, null, false));
    const e1 = of(killed, 'spell_end');
    if (e1.length !== 1 || e1[0].why !== 'killed' || e1[0].atMs !== 600 || of(killed, 'heal').length) return 'a caster killed in its windup still mended: ' + JSON.stringify(e1);
    const gone = play((inst, t, k, c, b) => M.damage.landHit(inst, t, k, b, 99999, null, null, false));
    const e2 = of(gone, 'spell_end');
    if (e2.length !== 1 || e2[0].why !== 'landed' || e2[0].hits !== 0 || of(gone, 'heal').length) return 'a packmate that fell in the windup was mended: ' + JSON.stringify(e2) + ' ' + JSON.stringify(of(gone, 'heal'));
    return null;
  })),

  'mend-never-a-phased-boss': (M) => withSpells(M, [MEND], () => withRows(M, { slime: { spells: ['t_mend'] },
    hive_wasp: { phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1500, guardPm: 500 } } }, () => {
    const inst = fight(M, [H(M, 1, 13, 3, 'tank'), E(M, 10, 0, 14, 3, 1, { kind: 'slime' }),
      E(M, 11, 0, 15, 3, 1, { kind: 'hive_wasp', hp: 1, maxHp: 50 }), E(M, 12, 0, 14, 2, 1, { hp: 8, maxHp: 10 })]);
    const t = sc(M, 11);
    M.movement.occupancy(inst);
    M.spells.castSpells(inst, t);
    const s = of(t, 'spell')[0];
    return s && s.t === 12 ? null : 'a boss whose HP only falls was mended (or nothing was): ' + JSON.stringify(s);
  })),

  'tally-mend': (M) => {
    const roster = { heroes: [1], kinds: { 1: 'tank', 10: 'slime', 12: 'rat' } };
    const mendEv = M.events.makeEvent('heal', 0, { u: 10, t: 12, amount: 4, spell: 't_mend' });
    const own = M.events.makeEvent('heal', 0, { u: 1, t: 1, amount: 3, item: 'cooked_shrimp' });
    let got;
    try { got = M.tally.tallyEvents([mendEv, own], roster); } catch (e) { return 'a monster\'s mend threw in the analyzer: ' + e.message; }
    if (!got.heroes[1] || got.heroes[1].healed.total !== 3 || Object.keys(got.heroes).length !== 1) return 'the analyzer credited a mend: ' + JSON.stringify(got.heroes);
    let threw = false;
    try { M.tally.tallyEvents([M.events.makeEvent('heal', 0, { u: 10, t: 12, amount: 4 })], roster); } catch { threw = true; }
    return threw ? null : 'a heal from a unit no hero is, naming no spell, passed the analyzer';
  },

  'kind-first-order': (M) => {
    const ids = (l) => l.map((u) => u.id).join(',');
    const u = H(M, 1, 11, 3, 'ranger');
    const a = E(M, 2, 0, 12, 3, 9, { kind: 'rat', hp: 9, maxHp: 9 });
    const b = E(M, 3, 0, 16, 5, 9, { kind: 'slime', hp: 2, maxHp: 20 });
    const c = E(M, 4, 0, 14, 1, 9, { kind: 'rat', hp: 15, maxHp: 15 });
    const d = E(M, 5, 0, 17, 2, 9, { kind: 'slime', hp: 12, maxHp: 12 });
    const inst = fight(M, [u, a, b, c, d, H(M, 9, 17, 6, 'tank')], { leader: 9 });
    const T = M.targeting;
    if (ids(T.pickTargets(inst, u)) !== '2,4,3,5') return 'the fixture\'s nearest order is ' + ids(T.pickTargets(inst, u));
    u.tkind = 'slime';
    if (ids(T.pickTargets(inst, u)) !== '3,5,2,4') return 'slimes first, nearest within: ' + ids(T.pickTargets(inst, u));
    if (ids(T.pickTargets(inst, u, { tmode: 'strongest' })) !== '3,5,4,2') return 'slimes first, strongest within: ' + ids(T.pickTargets(inst, u, { tmode: 'strongest' }));
    if (ids(T.pickTargets(inst, u, { tkind: null })) !== '2,4,3,5') return 'settings did not override the kind: ' + ids(T.pickTargets(inst, u, { tkind: null }));
    if (!T.basicTarget(inst, u) || T.basicTarget(inst, u).id !== 3) return 'the basic attack did not take the slime in range: ' + (T.basicTarget(inst, u) || {}).id;
    u.tkind = 'hive_wasp';
    if (ids(T.pickTargets(inst, u)) !== '2,4,3,5' || T.basicTarget(inst, u).id !== 2) return 'a kind not in the fight moved the order';
    return null;
  },

  'kind-first-turns-melee': (M) => {
    const play = (o) => {
      const d = H(M, 1, 13, 3, 'melee_dps', { target: 2, aiMs: o.aiMs });
      /* (the kind first is not a persisted field, so makeUnit keeps none: the settle writes it, as here) */
      if (o.tkind) d.tkind = o.tkind;
      const r = E(M, 2, 0, 14, 3, 9, { kind: 'rat' });
      const s = E(M, 3, 0, 17, 1, o.idle ? null : 9, { kind: 'slime' });
      const inst = fight(M, [d, r, s, H(M, 9, 17, 6, 'tank', { chase: false })], { leader: 9 });
      M.movement.occupancy(inst);
      M.targeting.chooseTargets(inst, sc(M, 12));
      return d.target;
    };
    if (play({ tkind: 'slime', aiMs: 0 }) !== 3) return 'a Melee hero beside a rat did not turn to the slime it names first';
    if (play({ tkind: 'slime', aiMs: 300 }) !== 2) return 'it turned before its re-aim clock was due';
    if (play({ aiMs: 0 }) !== 2) return 'with no kind named it left the monster beside it ("Nearest" keeps its fight)';
    if (play({ tkind: 'slime', aiMs: 0, idle: true }) !== 2) return 'it turned to a slime that is not in the fight';
    return null;
  },

  'kind-from-settings': (M) => {
    const setup = (v) => M.spawn.heroSetup({ weaponType: 'hammer', options: { target_kind: v }, bar: [] }).settings;
    if (setup('slime').tkind !== 'slime') return 'heroSetup did not read target_kind: ' + JSON.stringify(setup('slime'));
    for (const v of ['not_a_monster', 7, null, '', '__proto__', 'constructor', undefined]) if ('tkind' in setup(v)) return 'a target_kind of ' + JSON.stringify(v) + ' became a kind';
    const w = M.spawn.newHuntWorld(groundRow(), gridOf(M), [{ role: 'melee_dps', maxHp: 40, acc: 900, maxHit: 9, def: 1, settings: { tkind: 'slime' } }]);
    if (w.units[0].tkind !== 'slime') return 'a hero joined without its kind first';
    if (M.worldstate.FIELDS.unit.some(([n]) => n === 'tkind')) return 'the kind first is persisted: the world\'s shape moved';
    /* the settle writes it at every boundary from the member's settings, and drops it when they do */
    const fx = spanFixture(M, 3, { spanMs: 6000 });
    fx.inst.members[0].hero.settings = { tkind: 'slime' };
    const first = JSON.parse(runSpan(M, fx, [T0 + 2000]));
    const u = fx.world.units.find((x) => x.id === 1);
    if (!u || u.tkind !== 'slime') return 'the settle did not write the kind on the unit: ' + (u && u.tkind);
    fx.inst.members[0].hero.settings = null;
    const r = M.cs.simulateHuntInstance({ world: fx.world, nextSwingAtMs: first.next, members: fx.inst.members }, Object.assign({}, fx.ctx, { toMs: first.next + 4000 }));
    const v = r.world.units.find((x) => x.id === 1);
    return v && v.tkind === undefined ? null : 'the kind outlived the setting: ' + (v && v.tkind);
  },

  'span-closed-kinds': (M) => withSpells(M, [{ ...MEND, cdMs: 4000 }], () => withRows(M, {
    rat: { hp: 120 }, slime: { hp: 160, spells: ['t_mend'] }, hive_wasp: { hp: 160, range: 3 } }, () => {
    const ground = groundRow({ pockets: [
      { room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 14, y: 3 }, { monster: 'slime', x: 15, y: 4 }, { monster: 'hive_wasp', x: 17, y: 1 }, { monster: 'rat', x: 15, y: 2 }] },
      { room: [1, 1, 8, 6], spawns: [{ monster: 'slime', x: 4, y: 3 }, { monster: 'rat', x: 5, y: 3 }] },
      { room: [1, 8, 18, 8], spawns: [{ monster: 'rat', x: 9, y: 8 }] },
    ] });
    /* a tank and a Melee hero naming the slime first, on this case's ground (its own world: the span fixture's spawns on groundRow()) */
    const fresh = () => {
      const a = member(M, 'a', { unitId: 1, seat: 0, role: 'tank', hp: 4000, maxHp: 4000 });
      const b = member(M, 'b', { unitId: 2, seat: 1, role: 'melee_dps', hp: 4000, maxHp: 4000 });
      b.hero.settings = { tkind: 'slime' };
      const fx = spanFixture(M, 21, { members: [a, b], spanMs: 90000 });
      fx.ctx.ground = ground;
      fx.inst.world = M.spawn.newHuntWorld(ground, gridOf(M), [a, b].map((m) => Object.assign({ role: m.hero.role, maxHp: m.state.playerMaxHp,
        maxMana: m.state.playerMaxMana, settings: m.hero.settings }, m.snapshot(m.state))));
      return fx;
    };
    const whole = runSpan(M, fresh(), []);
    const cut = runSpan(M, fresh(), [T0 + 3100, T0 + 17000, T0 + 29900, T0 + 41300, T0 + 66600]);
    if (whole !== cut) return 'a span with a shooter, a mender and the kind first, cut anywhere, is not the one span';
    const out = JSON.parse(whole);
    const mends = out.events.filter((e) => e.type === 'heal' && e.spell === 't_mend');
    if (!mends.length) return 'browser closed: no mend landed in 90 s';
    /* the shooter's blows, each from range: replay the track to where it stood (the units' first tiles from the world) */
    const w0 = fresh().inst.world;
    const start = Object.fromEntries(w0.units.map((u) => [u.id, [u.x, u.y]]));
    const kindOfUnit = Object.fromEntries(w0.units.map((u) => [u.id, u.kind]));
    const waspIds = new Set(w0.units.filter((u) => u.kind === 'hive_wasp').map((u) => u.id));
    const wb = out.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && waspIds.has(e.u));
    if (!wb.length) return 'browser closed: the shooter never shot in 90 s';
    const pos = (u, at) => out.track.filter((s) => s.u === u && s.atMs <= at).reduce((p, s) => [s.x, s.y], start[u]);
    const beside = wb.filter((e) => cheb(pos(e.u, e.atMs), pos(e.t, e.atMs)) <= 1);
    if (process.env.KINDS_LOG) console.log('  span: wasp blows', wb.length, 'beside', beside.length, 'mends', mends.length);
    if (wb.length < 10 || beside.length * 5 > wb.length) return 'browser closed: the shooter shot ' + wb.length + ' times (want 10+), ' + beside.length + ' of them from beside its target (want a fifth at most)';
    /* the Melee hero naming the slime first: most of its blows land on the first wave's slimes (the rats and the shooter stand nearer) */
    const slimeIds = new Set(Object.entries(kindOfUnit).filter(([, k]) => k === 'slime').map(([u]) => Number(u)));
    const hits = out.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 2 && !e.dot);
    const onSlime = hits.filter((e) => slimeIds.has(e.t)).length;
    if (process.env.KINDS_LOG) console.log('  span: melee blows', hits.length, 'on slime', onSlime);
    if (hits.length < 10 || onSlime * 3 < hits.length * 2) return 'browser closed: the kind-first Melee hero landed ' + onSlime + ' of ' + hits.length + ' blows on slimes (want 10+ blows, two thirds on slimes)';
    return null;
  })),
};

const S = 'src/core/hunt/shooters.js';
const T = 'src/core/hunt/targeting.js';
const MS = 'src/core/hunt/monster-spells.js';
const mutants = [
  /* piece 2: a monster that shoots */
  { name: 'a shooter reaches only beside its target', case: 'shooter-stands-and-shoots', edits: [[S, '  return r ? inShot(inst, m.x, m.y, t, r) : cheb(m, t) <= 1;', '  return cheb(m, t) <= 1;']] },
  { name: 'a shot ignores walls', case: 'shooter-rows', edits: [[S, 'const inShot = (inst, x, y, t, r) => dist2({ x, y }, t) <= r * r && los(inst.grid, { x, y }, t);', 'const inShot = (inst, x, y, t, r) => dist2({ x, y }, t) <= r * r;']] },
  { name: 'a shot measures its range in Chebyshev tiles', case: 'shooter-rows', edits: [[S, 'const inShot = (inst, x, y, t, r) => dist2({ x, y }, t) <= r * r && los(', 'const inShot = (inst, x, y, t, r) => cheb({ x, y }, t) <= r && los(']] },
  { name: 'a range of 7 passes the bounds', case: 'shooter-rows', edits: [['src/data/monsters.js', 'export const MONSTER_RANGE = Object.freeze({ min: 2, max: 6 });', 'export const MONSTER_RANGE = Object.freeze({ min: 2, max: 7 });']] },
  { name: 'a shooter aims at the puller', case: 'shooter-aims-farthest', edits: [[S, '  if (!rangeOf(inst, m)) return fallback;\n', '  return fallback;\n']] },
  { name: 'a shooter aims at a hero outside its area', case: 'shooter-aims-farthest', edits: [[S, "if (h.side !== 'hero' || !h.alive || !inArea(inst, m.pocket, h.x, h.y)) continue;", "if (h.side !== 'hero' || !h.alive) continue;"]] },
  { name: 'a shooter aims at the nearest', case: 'shooter-aims-farthest', edits: [[S, 'if (!best || dist2(h, m) > dist2(best, m) ||', 'if (!best || dist2(h, m) < dist2(best, m) ||']] },
  { name: 'a tie goes to the higher id', case: 'shooter-aims-farthest', edits: [[S, '(dist2(h, m) === dist2(best, m) && h.id < best.id)', '(dist2(h, m) === dist2(best, m) && h.id > best.id)']] },
  { name: 'the pull never asks a shooter', case: 'shooter-aims-farthest', edits: [['src/core/hunt/pull-cycle.js', 'm.target = aimOf(inst, m, k.id);', 'm.target = k.id;']] },
  { name: 'a shooter whose target fell turns on the leader', case: 'shooter-aims-farthest', edits: [[T, 'retarget(inst, m, aimOf(inst, m, k && k !== t ? k.id : null), sc);', 'retarget(inst, m, k && k !== t ? k.id : null, sc);']] },
  { name: 'a shooter takes a surround slot', case: 'shooter-stands-and-shoots', edits: [['src/core/hunt/roles.js', '    if (rangeOf(inst, m)) { placeShooter(inst, m, t); continue; }\n', '']] },
  { name: 'a shooter never walks into range', case: 'shooter-stands-and-shoots', edits: [[S, '  if (!goToNearest(inst, m, (x, y) => inShot(inst, x, y, t, r))) clearGoal(m);', '  clearGoal(m);']] },
  { name: 'a shooter it shoots holds a Melee hero', case: 'melee-walks-to-shooter', edits: [[T, 'engaged(inst).some((m) => m.target === u.id && !rangeOf(inst, m));', 'engaged(inst).some((m) => m.target === u.id);']] },
  { name: 'a tank holds for a shooter on him', case: 'melee-walks-to-shooter', edits: [['src/core/hunt/roles.js', 'const onMe = mons.filter((m) => m.target === h.id && !rangeOf(inst, m));', 'const onMe = mons.filter((m) => m.target === h.id);']] },
  /* piece 3: a monster that mends its pull */
  { name: 'a mend is priced as a blow', case: 'mend-rows', edits: [['src/core/hunt/pull-cycle.js', 'castsOf(row).filter((sid) => !mends(spellRow(sid))).map(', 'castsOf(row).map(']] },
  { name: 'a mend may carry an element', case: 'mend-rows', edits: [['src/data/monster-spells.js', "    if (row.element !== null) out.push(at + 'a mend has no element (null), got ' + row.element);\n", '']] },
  { name: 'a mend is marked', case: 'mend-rows', edits: [['src/data/monster-spells.js', "export const marked = (row) => !!row && row.shape !== 'group' && !mends(row);", "export const marked = (row) => !!row && row.shape !== 'group';"]] },
  { name: 'a mend takes the least hurt', case: 'mend-heals-the-most-hurt', edits: [[MS, 'if (!best || m.hp * best.maxHp < best.hp * m.maxHp ||', 'if (!best || m.hp * best.maxHp > best.hp * m.maxHp ||']] },
  { name: 'a mend may take its caster', case: 'mend-heals-the-most-hurt', edits: [[MS, "if (m === u || m.side !== 'mon'", "if (m.side !== 'mon'"]] },
  { name: 'a mend reaches another pack', case: 'mend-heals-the-most-hurt', edits: [[MS, ' || m.pocket !== u.pocket || !(m.hp < m.maxHp)) continue;', ' || !(m.hp < m.maxHp)) continue;']] },
  { name: 'a mend has no range', case: 'mend-heals-the-most-hurt', edits: [[MS, '    if (d > sp.range || (d > 1 && !los(inst.grid, u, m))) continue;\n', '']] },
  { name: 'a mend heals past max HP', case: 'mend-heals-the-most-hurt', edits: [[MS, 'const got = Math.min(t.maxHp - t.hp, sc.rng.int(lo, top));', 'const got = sc.rng.int(lo, top);']] },
  { name: 'a mend with nobody hurt casts anyway', case: 'mend-heals-the-most-hurt', edits: [[MS, '    if (m === u || m.side !== \'mon\' || !m.alive || m.pocket !== u.pocket || !(m.hp < m.maxHp)) continue;', '    if (m === u || m.side !== \'mon\' || !m.alive || m.pocket !== u.pocket) continue;']] },
  { name: 'a mend marks ground', case: 'mend-marks-nothing', edits: [['src/core/hunt/marks.js', "if (!c || typeof c !== 'object' || !SHAPE_KINDS[c.kind]) return null;", "if (!c || typeof c !== 'object') return null;"]] },
  { name: 'the screen draws a mend', case: 'mend-marks-nothing', edits: [['src/core/hunt/marks.js', "if (!ev || ev.type !== 'spell' || !SHAPE_KINDS[ev.shape]) return null;", "if (!ev || ev.type !== 'spell') return null;"]] },
  { name: 'a fallen packmate is mended', case: 'mend-dropped', edits: [[MS, 'const mended = !!t && t.alive && t.side', 'const mended = !!t && t.side']] },
  { name: 'a boss whose HP only falls is mended', case: 'mend-never-a-phased-boss', edits: [[MS, '    if ((rowOf(inst, m.kind) || {}).phases) continue;\n', '']] },
  { name: 'the analyzer throws on a mend', case: 'tally-mend', edits: [['src/core/hunt/tally.js', '        if (ev.spell !== undefined && !ids.has(ev.u)) break;\n', '']] },
  { name: 'the analyzer passes any heal from a non-hero', case: 'tally-mend', edits: [['src/core/hunt/tally.js', 'if (ev.spell !== undefined && !ids.has(ev.u)) break;', 'if (!ids.has(ev.u)) break;']] },
  /* piece 4: the kind first */
  { name: 'the order forgets the kind', case: 'kind-first-order', edits: [[T, '  return kind ? (a, b) =>', '  return false ? (a, b) =>']] },
  { name: 'settings cannot clear the kind', case: 'kind-first-order', edits: [[T, 'const k = settings && settings.tkind !== undefined ? settings.tkind : u.tkind;', 'const k = (settings && settings.tkind) || u.tkind;']] },
  { name: 'a Melee hero never turns to the kind', case: 'kind-first-turns-melee', edits: [[T, '  if (kind && !(u.aiMs > 0) && cur.kind !== kind && engaged(inst).some((m) => m.kind === kind)) return true;\n', '']] },
  { name: 'the turn to the kind ignores the re-aim clock', case: 'kind-first-turns-melee', edits: [[T, 'if (kind && !(u.aiMs > 0) && cur.kind', 'if (kind && cur.kind']] },
  { name: 'any string is a kind', case: 'kind-from-settings', edits: [['src/core/hunt-spawn.js', "typeof v === 'string' && Object.prototype.hasOwnProperty.call(MONSTERS, v) ? { tkind: v } : {}", "typeof v === 'string' && v ? { tkind: v } : {}"]] },
  { name: 'the settle never writes the kind', case: 'kind-from-settings', edits: [['src/core/combat-sim.js', "  if (typeof k === 'string' && k) u.tkind = k; else if (u.tkind !== undefined) delete u.tkind;\n", '']] },
  { name: 'the kind outlives the setting', case: 'kind-from-settings', edits: [['src/core/combat-sim.js', ' else if (u.tkind !== undefined) delete u.tkind;', '']] },
  { name: 'a hero joins without its kind', case: 'kind-from-settings', edits: [['src/core/hunt-spawn.js', "  if (typeof tkind === 'string') Object.assign(u, { tkind });\n", '']] },
  /* both paths: a span cut anywhere */
  { name: 'a mend\'s packmate is not persisted on the cast (a cut forgets whom it mends)', case: 'span-closed-kinds', edits: [[MS, ', ...(mends(sp) ? { t: t.id } : {}) };', ' };']] },
];

const R = makeReport('hunt-core/monster-kinds');
const M = await load(ROOT);
const at = process.argv.indexOf('--only');
const only = at > 0 ? new Set(String(process.argv[at + 1] || '').split(',')) : null;
for (const [cn, fn] of Object.entries(cases)) {
  if (only && !only.has(cn)) continue;
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of process.argv.includes('--no-mutate') ? [] : mutants) {
  if (only && !only.has(mu.case)) continue;
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
const ran = (n) => !only || only.has(n);
if (!R.fails.length) console.log('  ' + Object.keys(cases).filter(ran).length + ' cases, ' + mutants.filter((mu) => ran(mu.case)).length + ' mutants caught');
R.finish();
