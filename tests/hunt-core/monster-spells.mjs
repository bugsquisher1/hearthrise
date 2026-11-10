// tests/hunt-core/monster-spells.mjs — src/core/hunt/monster-spells.js, marks.js, shapes.js, src/data/monster-spells.js and the
// elemental-resistance seam (lane/b-area-engine; Tyler 2026-11-08: monster area spells, the whole-group strike, gear resistances).
// Run by run-all.mjs. `--only a,b` runs just those cases and their mutants.
//
//   rows-and-formulas    the row's bounds, the fair warning, the hit's roll, a hitPm share (the wiki formulas, from data)
//   shapes               the one geometry: square, blast, ring, cone, line, group; walls dropped from the drawn tiles
//   telegraph-then-land  the mark is fixed at the start, the caster neither swings nor walks, the hit lands at the windup's end on
//                        the marked hero, the swing clock restarts, the cooldown runs from the start
//   dropped              a caster killed or reset in its windup lands nothing, closed in the very sub-step
//   chill-slows          a Chill on the caster stretches its next windup and its next swing interval by slowPm
//   ranged-off-melee-holds  the one engine (world-step): a holding ranger steps off a blast, the tank holds and takes a ring
//   spots-avoid-marks    a ranged hero's spot and a kiter's retreat never land on a mark; with no mark, nothing moves
//   group-strikes-all    a group strike lands on every hero of a party of four, wherever they stand, and on a lone hero; it marks
//                        no ground, and every hero counts it as casting at them
//   resist-takes-less    a hero's resistPm takes its share off an elemental blow (never a physical one), clamped; gear sums it; the
//                        settle carries it from the snapshot to the unit, and the frozen peer row carries it to the browser
//   spell-trains-defense-plain  a spell's landing on a shield tank pays Defense XP at the plain rate, braced or not, and a caster at the
//                        least windup a row may have never pays more than the settle's Defense bound for one foe (lane/b-area-set)
//   split-parity         a span with casts cut anywhere (inside windups too) equals the one span
//   no-spell-no-trace    with no spell row, a span never writes a cast, a cooldown or a spell event
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT, hero, mon, world, instOf, groundRow, gridOf, spanFixture, runSpan, member, T0 } from './fixtures/h1.js';

const V = (root) => '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(root, 'src/build-info.js'), 'utf8')) || [, ''])[1];
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V(root));
  M.MS = await imp('src/data/monster-spells.js');
  M.spells = await imp('src/core/hunt/monster-spells.js');
  M.marks = await imp('src/core/hunt/marks.js');
  M.shapes = await imp('src/core/hunt/shapes.js');
  M.EL = await imp('src/core/elements.js');
  M.tiers = await imp('src/data/hunt-tiers.js');
  M.AD = await imp('src/data/abilities.js');
  M.ST = await imp('src/data/statuses.js');
  M.memberMod = await imp('src/core/member.js');
  M.monLevelOf = (await imp('src/data/monsters.js')).monsterLevelOf;
  return M;
}

/* THE FIXTURE SPELLS (test rows, planted on the engine's own instance of the table for one case, then removed). */
const RING = Object.freeze({ id: 't_ring', n: 'Test Ring', shape: 'ring', r: 1, range: 1, windupMs: 2400, cdMs: 12000, hitPm: 2000, element: null });
const BLAST = Object.freeze({ id: 't_blast', n: 'Test Blast', shape: 'blast', r: 1, range: 4, windupMs: 1600, cdMs: 14000, hitPm: 1800, element: null });
const GROUP = Object.freeze({ id: 't_group', n: 'Test Group', shape: 'group', range: 1, windupMs: 1600, cdMs: 10000, hitPm: 1500, element: 'frost' });

/** Run `fn` with spell rows planted (keyed by their id) and monster kinds listing them ({ kind: id | [ids] }); all put back after. */
function withSpells(M, rows, kinds, fn) {
  const T = M.MS.MONSTER_SPELLS; const keep = [];
  for (const r of rows) T[r.id] = Object.assign({}, r);
  for (const [k, ids] of Object.entries(kinds)) {
    keep.push([k, Object.prototype.hasOwnProperty.call(M.MONSTERS[k], 'spells'), M.MONSTERS[k].spells]);
    M.MONSTERS[k].spells = Array.isArray(ids) ? ids : [ids];
  }
  try { return fn(); } finally {
    for (const r of rows) delete T[r.id];
    for (const [k, had, v] of keep) { if (had) M.MONSTERS[k].spells = v; else delete M.MONSTERS[k].spells; }
  }
}

const recorder = (M, seed) => {
  const events = [];
  return { atMs: 0, dtMs: 100, swing: 0, rng: M.rng.createRng(M.rng.hashSeed('spells', seed || 1)), events, emit: (e) => events.push(e), track: () => {} };
};
const H = (M, id, x, y, role, o) => hero(M, id, x, y, Object.assign({ kind: role, role, dist: 1, chase: true, tmode: 'nearest', stance: 'balanced', acc: 1000, maxHit: 6, def: 0, hp: 500, maxHp: 500 }, o || {}));
const fightOf = (M, units, o) => {
  const w = world(M, units, Object.assign({ phase: 'fight', leader: 1, packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }] }, o || {}));
  return Object.assign(instOf(M, w), { makeUnit: M.worldstate.makeUnit });
};
const of = (sc, type) => sc.events.filter((e) => e.type === type);
const topOf = (M, kind, sp) => M.MS.spellHit(M.C.monsterMaxHit(M.tiers.atTier(M.MONSTERS[kind], null)), sp);
/* The one engine's sub-steps for `swings` swings from `atMs` (world-step.js stepSwing), events and track gathered. */
function swingRun(M, inst, swings, seed, heroes) {
  const out = { events: [], track: [] };
  for (let s = 0; s < swings; s++) {
    const r = M.worldstep.stepSwing(inst.world, { ground: inst.ground, grid: inst.grid, heroes: heroes || null, swingMs: 2000, atMs: s * 2000,
      rng: M.rng.createRng(M.rng.hashSeed('spells-run', seed || 1, s)) });
    out.events.push(...r.events); out.track.push(...r.track);
  }
  return out;
}

const cases = {
  'rows-and-formulas': (M) => {
    const bad = M.MS.validate(M.MONSTERS);
    if (bad.length) return 'the shipped table: ' + bad.join('; ');
    for (const r of [RING, BLAST, GROUP]) { const p = M.MS.validateSpell(r, r.id); if (p.length) return r.id + ' refused: ' + p.join('; '); }
    const refused = (o, why) => (M.MS.validateSpell(Object.assign({}, RING, o), RING.id).length ? null : why);
    for (const [o, why] of [[{ r: 3 }, 'a ring of 3 passed'], [{ windupMs: 1100 }, 'a windup under the fair warning passed'],
      [{ r: 2, windupMs: 1500 }, 'a radius-2 ring with a 1.5 s warning passed'], [{ cdMs: 2400 }, 'a cooldown no longer than its windup passed'],
      [{ element: 'fire' }, 'an unknown element passed'], [{ len: 3 }, 'a ring with a len passed'], [{ shape: 'square', n: 3 }, 'a monster square passed'],
      [{ hitPm: 50 }, 'a 5% hit passed'], [{ windupMs: 2450 }, 'a windup off the sub-step passed'], [{ range: 7 }, 'a range of 7 passed'],
      [{ dmgPm: 2000 }, 'the old dmgPm name passed'], [{ id: 'other' }, 'an id field off its key passed']]) {
      const w = refused(o, why);
      if (w) return w;
    }
    const FW = M.MS.FAIR_WARNING;
    if (M.MS.minWindupMs({ shape: 'ring', r: 2 }) !== FW.baseMs + FW.perRadiusMs || M.MS.minWindupMs({ shape: 'cone', len: 4 }) !== FW.baseMs
      || M.MS.minWindupMs({ shape: 'group' }) !== FW.baseMs) return 'the fair warning is not baseMs + perRadiusMs x (r - 1)';
    if (JSON.stringify(M.MS.spellHit(10, { hitPm: 2000 })) !== '[10,20]' || JSON.stringify(M.MS.spellHit(3, { hitPm: 1500 })) !== '[2,4]'
      || JSON.stringify(M.MS.spellHit(1, { hitPm: 100 })) !== '[1,1]') return 'spellHit is not [ceil(top x lowPm), floor(M x hitPm)]: ' + JSON.stringify(M.MS.spellHit(10, { hitPm: 2000 }));
    if (M.MS.SHIELD_BRACE.markedPm !== 300 || M.MS.marked(GROUP) || !M.MS.marked(RING)) return 'the brace is not 30% off a marked spell only';
    /* a monster names a LIST (a boss: one of each kind), at most MAX_SPELLS, each a row; the old one-spell field is refused */
    const many = withSpells(M, [RING, BLAST, GROUP], { rat: ['t_ring', 't_blast', 't_group'] }, () => M.MS.validate(M.MONSTERS));
    if (!many.some((x) => /rat spells must list 1\.\.2/.test(x))) return 'three spells on one monster passed';
    M.MONSTERS.rat.spell = 't_ring';
    try { if (!M.MS.validate(M.MONSTERS).some((x) => /rat names `spell`/.test(x))) return 'the old one-spell field passed'; } finally { delete M.MONSTERS.rat.spell; }
    if (JSON.stringify(M.AD.blowShare(10, { hitPm: 800 })) !== '[4,8]') return 'blowShare is not [ceil(top x hitLowPm), floor(M x hitPm)]: ' + JSON.stringify(M.AD.blowShare(10, { hitPm: 800 }));
    /* a monster naming no row, and a row no monster casts, are both refused against the roster */
    const flagged = withSpells(M, [RING], { rat: 't_ring', slime: 'nope' }, () => M.MS.validate(M.MONSTERS));
    if (!flagged.some((s) => /slime names spell nope/.test(s))) return 'a monster naming a missing spell passed';
    const lonely = withSpells(M, [RING, BLAST], { rat: 't_ring' }, () => M.MS.validate(M.MONSTERS));
    if (!lonely.some((s) => /t_blast is cast by no monster/.test(s))) return 'a spell no monster casts passed';
    return withSpells(M, [RING], { rat: 't_ring' }, () => M.MS.validate(M.MONSTERS)).length ? 'a cast row was refused' : null;
  },
  'shapes': (M) => {
    const S = M.shapes;
    const at = (spec, aim) => S.place(spec, { x: 0, y: 0 }, aim || { x: 1, y: 0 });
    const rel = (s) => S.tilesOf(s).map(([x, y]) => x + ',' + y).join(' ');
    const n = (spec, aim) => S.tilesOf(at(spec, aim)).length;
    if (n({ shape: 'square', n: 3 }) !== 9 || n({ shape: 'blast', r: 1 }) !== 9 || n({ shape: 'ring', r: 1 }) !== 8 || n({ shape: 'ring', r: 2 }) !== 24) return 'square 3 / blast 1 / ring 1 / ring 2 cover ' + [n({ shape: 'square', n: 3 }), n({ shape: 'blast', r: 1 }), n({ shape: 'ring', r: 1 }), n({ shape: 'ring', r: 2 })];
    if (S.covers(at({ shape: 'ring', r: 1 }), 0, 0)) return 'a ring covers its own caster';
    if (S.place({ shape: 'square', n: 3 }, { x: 0, y: 0 }, { x: 5, y: 5 }).ox !== 5 || S.place({ shape: 'ring', r: 1 }, { x: 0, y: 0 }, { x: 5, y: 5 }).ox !== 0) return 'a square sits on its aim, a ring on its caster';
    if (rel(at({ shape: 'square', n: 4 }, { x: 0, y: 0 })).split(' ')[0] !== '-1,-1') return 'a 4x4 does not reach south-east of its aim';
    /* a cone 3 long, east: 3 + 5 + 7 tiles, its 45-degree edges included */
    const cone = at({ shape: 'cone', len: 3 });
    if (n({ shape: 'cone', len: 3 }) !== 15 || !S.covers(cone, 2, 2) || S.covers(cone, 1, 2) || S.covers(cone, -1, 0)) return 'the cone is not the 90-degree wedge: ' + rel(cone);
    /* a line 4 long through an aim off the 8 ways: the rounded ray, its aim on it */
    if (rel(at({ shape: 'line', len: 4 }, { x: 3, y: 1 })) !== '1,0 2,1 3,1 4,1') return 'the line through (3, 1) is ' + rel(at({ shape: 'line', len: 4 }, { x: 3, y: 1 }));
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) {
      if (!x && !y) continue;
      if (!S.covers(at({ shape: 'line', len: 4 }, { x, y }), x, y)) return 'the line misses its own aim at ' + x + ',' + y;
    }
    const g = at({ shape: 'group' });
    if (!S.covers(g, 99, -40) || S.tilesOf(g).length) return 'a group strike is not everywhere with no ground tiles';
    for (const [spec, ok] of [[{ shape: 'ring', r: 3 }, false], [{ shape: 'line', len: 5 }, false], [{ shape: 'square', n: 6 }, false], [{ shape: 'group', r: 1 }, false],
      [{ shape: 'group' }, true], [{ shape: 'cone', len: 4 }, true], [{ shape: 'wave', r: 1 }, false], [{ shape: 'ring', r: 1, len: 2 }, false]]) {
      if ((S.shapeProblem(spec) === null) !== ok) return JSON.stringify(spec) + (ok ? ' refused' : ' passed');
    }
    if (S.tilesMax({ shape: 'ring', r: 1 }) !== 8 || S.tilesMax({ shape: 'line', len: 4 }) !== 4 || S.tilesMax({ shape: 'cone', len: 3 }) !== 15) return 'tilesMax is off';
    /* the drawn tiles drop the walls: a blast on the door column (x = 9 is wall on rows 1-2 and 5-6) */
    const drawn = S.tilesOf(S.place({ shape: 'blast', r: 1 }, { x: 9, y: 2 }, { x: 9, y: 2 }), gridOf(M)).map((t) => t.join(','));
    if (drawn.includes('9,2') || drawn.includes('9,1') || !drawn.includes('9,3') || drawn.length !== 7) return 'the drawn blast kept a wall or lost a floor tile: ' + drawn.join(' ');
    /* the screen's mark from a spell event drops the same walls (marks.js markOfEvent) */
    const ev = M.events.makeEvent('spell', 0, { u: 10, t: 1, spell: 'x', shape: 'blast', x: 9, y: 2, dx: 0, dy: 0, r: 1, len: 0, ms: 1600 });
    const mk = M.marks.markOfEvent(ev, gridOf(M));
    return mk && JSON.stringify(mk.tiles.map((t) => t.join(','))) === JSON.stringify(drawn) ? null : "the screen's mark is not the drawn blast: " + JSON.stringify(mk);
  },
  'telegraph-then-land': (M) => withSpells(M, [RING], { rat: 't_ring' }, () => {
    const k = H(M, 1, 13, 3, 'tank');
    const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 9999, maxHp: 9999 });
    const inst = fightOf(M, [k, r]);
    const sc = recorder(M, 3);
    let swingAfter = null; let drawn = null;
    for (let i = 0; i <= 130; i++) {
      sc.atMs = i * 100;
      M.movement.occupancy(inst);
      if (i === 5) { r.goal = [16, 3]; r.path = [[15, 3], [16, 3]]; }   // a plan to walk mid-windup: it stands
      if (i === 20) { if (r.x !== 14 || r.y !== 3) return 'the caster walked in its windup to ' + r.x + ',' + r.y; r.goal = null; r.path = []; }
      M.movement.moveAll(inst, sc);
      M.damage.resolveAttacks(inst, sc);
      M.spells.castSpells(inst, sc);
      M.spells.dropCasts(inst, sc);
      if (sc.atMs === RING.windupMs) swingAfter = r.swingLeftMs;
      if (sc.atMs === 1000) drawn = JSON.stringify(M.marks.markTiles(r, inst.grid));
    }
    const spell = of(sc, 'spell'), ends = of(sc, 'spell_end');
    const s0 = spell[0];
    if (!s0 || s0.atMs !== 0 || s0.shape !== 'ring' || s0.x !== 14 || s0.y !== 3 || s0.r !== 1 || s0.ms !== RING.windupMs || s0.t !== 1 || s0.spell !== 't_ring') return 'no ring mark at 0: ' + JSON.stringify(s0);
    const basics = of(sc, 'dmg').concat(of(sc, 'miss')).filter((e) => e.u === 10 && (e.ability === 'basic' || e.type === 'miss')).map((e) => e.atMs);
    if (basics.some((t) => t > 0 && t < RING.windupMs)) return 'the caster swung in its windup at ' + basics;
    if (!basics.includes(RING.windupMs + 2000)) return 'the next swing is not a full interval after the landing: ' + basics;
    if (swingAfter !== M.C.COMBAT_BALANCE.tickMs) return 'the landing left the swing clock at ' + swingAfter;
    const e0 = ends[0];
    if (!e0 || e0.atMs !== RING.windupMs || e0.why !== 'landed' || e0.hits !== 1) return 'the mark did not land on the tank at the windup\'s end: ' + JSON.stringify(e0);
    const hit = of(sc, 'dmg').filter((e) => e.ability === 't_ring');
    const [lo, top] = topOf(M, 'rat', RING);
    if (hit.length !== 1 || hit[0].atMs !== RING.windupMs || hit[0].t !== 1 || hit[0].amount < lo || hit[0].amount > top) return 'the hit is not one roll of [' + lo + ', ' + top + '] on the tank: ' + JSON.stringify(hit);
    /* THE SCREEN'S MARK: the event's tiles are the live cast's, the eight round the caster, landing at the windup's end */
    const mark = M.marks.markOfEvent(s0, inst.grid);
    if (!mark || mark.landsAtMs !== RING.windupMs || mark.group || JSON.stringify(mark.tiles) !== drawn || mark.tiles.length !== 8) return "the event's mark is not the live cast's: " + JSON.stringify({ mark, drawn });
    if (spell.length !== 2 || spell[1].atMs !== RING.cdMs || spell[1].spell !== 't_ring') return 'the second cast is not at the cooldown from the first\'s start: ' + spell.map((e) => e.atMs);
    return null;
  }),
  'dropped': (M) => withSpells(M, [RING], { rat: 't_ring' }, () => {
    const play = (cut) => {
      const k = H(M, 1, 13, 3, 'tank');
      const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 9999, maxHp: 9999 });
      const inst = fightOf(M, [k, r]);
      const sc = recorder(M, 4);
      for (let i = 0; i <= 30; i++) {
        sc.atMs = i * 100;
        M.movement.occupancy(inst);
        M.spells.castSpells(inst, sc);
        /* after the spell hook, as an ability, a bleed tick or a reset would */
        if (sc.atMs === 1000) cut(inst, sc, k, r);
        M.spells.dropCasts(inst, sc);
      }
      return sc;
    };
    const killed = play((inst, sc, k, r) => M.damage.landHit(inst, sc, k, r, 99999, null, null, false));
    const reset = play((inst, sc, k, r) => { r.target = null; });
    for (const [sc, why] of [[killed, 'killed'], [reset, 'reset']]) {
      const e = of(sc, 'spell_end');
      if (e.length !== 1 || e[0].why !== why || e[0].atMs !== 1000 || e[0].hits !== 0) return why + ': the mark did not close at the instant: ' + JSON.stringify(e);
      if (of(sc, 'dmg').some((x) => x.ability === 't_ring')) return why + ': a dropped cast still landed';
    }
    return null;
  }),
  'chill-slows': (M) => withSpells(M, [{ ...RING, windupMs: 1600 }], { rat: 't_ring' }, () => {
    const chill = M.ST.STATUSES.chill;
    if (!chill || chill.slowPm !== 300) return 'no Chill row slowing 30%';
    const k = H(M, 1, 13, 3, 'tank');
    const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 9999, maxHp: 9999, swingLeftMs: 50000 });
    const inst = fightOf(M, [k, r]);
    const sc = recorder(M, 5);
    M.status.applyStatus(inst, r, chill, { u: null }, sc);
    M.movement.occupancy(inst);
    M.spells.castSpells(inst, sc);
    const s = of(sc, 'spell')[0];
    /* 1600 x 1.3 = 2080, up to the next whole sub-step */
    if (!s || s.ms !== 2100) return 'a chilled windup is ' + (s && s.ms) + ' ms, want 2100';
    for (let i = 1; i <= 21; i++) { sc.atMs = i * 100; M.spells.castSpells(inst, sc); M.status.tickStatuses(inst, sc); }
    const e = of(sc, 'spell_end')[0];
    if (!e || e.atMs !== 2100) return 'the chilled cast landed at ' + (e && e.atMs);
    if (r.swingLeftMs !== 2600) return 'the swing interval after a chilled landing is ' + r.swingLeftMs + ', want 2600';
    const fresh = mon(M, 11, 0, 15, 3, {});
    M.damage.restart(fresh);
    if (fresh.swingLeftMs !== M.C.COMBAT_BALANCE.tickMs || M.damage.slowed(fresh, 1600) !== 1600) return 'an unchilled unit is slowed';
    for (let i = 22; i <= 45; i++) { sc.atMs = i * 100; M.status.tickStatuses(inst, sc); }
    M.damage.restart(r);
    return r.swingLeftMs === M.C.COMBAT_BALANCE.tickMs ? null : 'the Chill outlived its 4 s: ' + r.swingLeftMs;
  }),
  'ranged-off-melee-holds': (M) => withSpells(M, [RING, BLAST], { rat: 't_ring', slime: 't_blast' }, () => {
    const k = H(M, 1, 13, 3, 'tank');
    /* the ranger HOLDS (chase off, distance 1): only the mark can move it */
    const b = H(M, 2, 17, 5, 'ranger', { chase: false, dist: 1, target: 11 });
    const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 99999, maxHp: 99999 });
    /* (a thrower that keeps its distance: speed 0, so it casts from 2 tiles and never holds the ranger in melee) */
    const s = mon(M, 11, 0, 15, 3, { kind: 'slime', target: 2, hp: 99999, maxHp: 99999, speed: 0 });
    const inst = fightOf(M, [k, b, r, s]);
    const out = swingRun(M, inst, 2, 6);
    const marks = out.events.filter((e) => e.type === 'spell');
    const ring = marks.find((e) => e.spell === 't_ring'), blast = marks.find((e) => e.spell === 't_blast');
    if (!ring || !blast || blast.x !== 17 || blast.y !== 5) return 'the two marks did not start (ring on the tank, blast on the ranger\'s tile): ' + JSON.stringify(marks);
    const hits = out.events.filter((e) => e.type === 'dmg' && (e.ability === 't_ring' || e.ability === 't_blast'));
    if (!hits.some((e) => e.ability === 't_ring' && e.t === 1)) return 'the tank stepped off the ring (Melee holds): ' + JSON.stringify(hits);
    if (hits.some((e) => e.t === 2)) return 'the ranger stood in the blast: ' + JSON.stringify(hits);
    if (!out.track.some((st) => st.u === 2 && st.atMs < blast.atMs + blast.ms)) return 'the ranger never moved';
    const shape = M.shapes.place({ shape: 'blast', r: 1 }, { x: 15, y: 3 }, { x: 17, y: 5 });
    if (M.shapes.covers(shape, b.x, b.y)) return 'the ranger ends on the mark at ' + b.x + ',' + b.y;
    /* HELD IN MELEE (the caster beside it, its target): a ranged hero holds and takes it, as the wiki says */
    const k2 = H(M, 1, 13, 3, 'tank');
    const b2 = H(M, 2, 16, 4, 'ranger', { chase: false, dist: 1, target: 11 });
    const r2 = mon(M, 10, 0, 14, 3, { target: 1, hp: 99999, maxHp: 99999 });
    const s2 = mon(M, 11, 0, 16, 3, { kind: 'slime', target: 2, hp: 99999, maxHp: 99999 });
    const held = swingRun(M, fightOf(M, [k2, b2, r2, s2]), 2, 6);
    if (!held.events.some((e) => e.type === 'dmg' && e.ability === 't_blast' && e.t === 2)) return 'a ranger held in melee stepped off the blast';
    return held.track.some((st) => st.u === 2) ? 'the held ranger moved' : null;
  }),
  'spots-avoid-marks': (M) => {
    /* a live blast standing over the ranger's best ground (no spell row needed: the mark is the persisted record) */
    const build = (cast) => {
      const k = H(M, 1, 13, 3, 'tank');
      const b = H(M, 2, 17, 3, 'ranger', { dist: 3, target: 10 });
      const kite = H(M, 3, 15, 5, 'mage', { chase: false, dist: 3, target: 10 });
      const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 999, maxHp: 999 });
      const c = mon(M, 11, 0, 17, 1, { target: 2, hp: 999, maxHp: 999, cast });
      const inst = fightOf(M, [k, b, kite, r, c]);
      M.movement.occupancy(inst);
      M.roles.positionHeroes(inst, recorder(M, 7));
      return { inst, b, kite };
    };
    const calm = build(null);
    const end = (h) => (h.goal && h.path.length ? h.goal : [h.x, h.y]);
    const live = { s: 'x', ms: 1600, left: 1600, kind: 'blast', x: calm.b.spot ? calm.b.spot[0] : 17, y: calm.b.spot ? calm.b.spot[1] : 3, dx: 0, dy: 0, r: 2, len: 0 };
    const kiteEnd = end(calm.kite);
    const live2 = { ...live };
    const marked = build(live);
    const m = M.shapes.place({ shape: 'blast', r: 2 }, { x: live.x, y: live.y }, { x: live.x, y: live.y });
    const spot = marked.b.spot;
    if (!calm.b.spot || !M.shapes.covers(m, calm.b.spot[0], calm.b.spot[1])) return "the fixture mark does not cover the ranger's calm spot";
    if (!spot || M.shapes.covers(m, spot[0], spot[1])) return 'the ranger holds no spot off the mark: ' + spot;
    if (M.shapes.covers(m, end(marked.kite)[0], end(marked.kite)[1])) return 'the kiter heads onto the mark: ' + end(marked.kite);
    /* a group strike marks no ground: nobody moves for it */
    const group = build({ ...live2, kind: 'group', r: 0 });
    if (M.marks.anyMark(group.inst) || M.marks.markedAt(group.inst, live.x, live.y)) return 'a group strike marked the ground';
    if (JSON.stringify(end(group.kite)) !== JSON.stringify(kiteEnd) || JSON.stringify(group.b.spot) !== JSON.stringify(calm.b.spot)) return 'a group strike moved a hero';
    return null;
  },
  'group-strikes-all': (M) => withSpells(M, [GROUP], { rat: 't_group' }, () => {
    const play = (party) => {
      const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 99999, maxHp: 99999 });
      const inst = fightOf(M, [...party, r]);
      const sc = recorder(M, 8);
      let casting = null;
      for (let i = 0; i <= 20; i++) {
        sc.atMs = i * 100;
        M.movement.occupancy(inst);
        M.spells.castSpells(inst, sc);
        M.spells.dropCasts(inst, sc);
        if (i === 5) {
          casting = party.map((h) => M.conditions.holds({ inst, u: h, h: null, slot: null }, { metric: 'enemy_casting', op: 'gte', value: 1, subject: 'self' }));
          if (M.marks.anyMark(inst)) casting = 'marked the ground';
        }
      }
      return { sc, casting };
    };
    const four = [H(M, 1, 13, 3, 'tank'), H(M, 2, 17, 6, 'ranger'), H(M, 3, 3, 8, 'mage'), H(M, 4, 2, 2, 'healer')];
    const a = play(four);
    if (a.casting === 'marked the ground' || !Array.isArray(a.casting) || !a.casting.every(Boolean)) return 'not every hero counts the group strike as casting at it: ' + JSON.stringify(a.casting);
    const e = of(a.sc, 'spell_end')[0];
    const hit = of(a.sc, 'dmg').filter((x) => x.ability === 't_group').map((x) => x.t).sort();
    if (!e || e.hits !== 4 || JSON.stringify(hit) !== '[1,2,3,4]') return 'a group strike missed a hero of four: ' + JSON.stringify({ e, hit });
    const gm = M.marks.markOfEvent(of(a.sc, 'spell')[0], gridOf(M));
    if (!gm || !gm.group || gm.tiles.length) return 'the mark is not a group mark with no ground tiles: ' + JSON.stringify(gm);
    const one = play([H(M, 1, 13, 3, 'tank')]);
    const e1 = of(one.sc, 'spell_end')[0];
    return e1 && e1.hits === 1 && of(one.sc, 'dmg').filter((x) => x.ability === 't_group' && x.t === 1).length === 1 ? null : 'a lone hero was not struck: ' + JSON.stringify(e1);
  }),
  'resist-takes-less': (M) => {
    const inst = fightOf(M, []);
    const r = mon(M, 10, 0, 14, 3, {});
    const plain = H(M, 1, 13, 3, 'tank');
    /* (resistPm rides the unit unpersisted, as the armour does: combat-sim.js syncUnit writes it at every boundary) */
    const warm = Object.assign(H(M, 2, 13, 4, 'tank'), { resistPm: M.EL.resistProfile({ frost: 500, ember: -500 }) });
    const hit = (t, el) => M.damage.hurt(inst, t, 100, r, el, null, M.rng.createRng(1)).dmg;
    /* 50% asked, 40% the cap (data/elements.js HERO_RESIST_PM): 60 of 100; gear makes nobody weak, so the -50% ember is 0 */
    if (M.EL.heroElementPermille({ frost: 200 }, 'frost') !== 800) return 'a 20% frost resist does not take 20% off';
    /* the combat seam holds the cap itself, whatever profile a unit carries */
    if (M.EL.heroElementPermille({ frost: 900 }, 'frost') !== 600 || M.EL.heroElementPermille({ frost: -300 }, 'frost') !== 1000) return 'the seam reads a resist past the 40% cap or below 0: ' + M.EL.heroElementPermille({ frost: 900 }, 'frost');
    if (hit(plain, 'frost') !== 100 || hit(warm, 'frost') !== 60) return 'frost on a capped 40% resist: ' + hit(warm, 'frost') + ' (plain ' + hit(plain, 'frost') + ')';
    if (hit(warm, 'ember') !== 100) return 'gear made a hero weak to ember: ' + hit(warm, 'ember');
    if (hit(warm, null) !== 100 || hit(warm, 'poison') !== 100) return 'a resist touched a physical or an unnamed element';
    const prof = M.EL.resistProfile({ frost: 900, ember: -2000, poison: 0, bogus: 100 });
    if (JSON.stringify(prof) !== '{"frost":400}' || M.EL.resistProfile({ frost: 0 }) !== null) return 'resistProfile does not clamp to HERO_RESIST_PM: ' + JSON.stringify(prof);
    /* gear sums it (combat.js equipmentStats), and a hero whose gear carries none has none */
    const items = { cape: { slot: 'cape', resistPm: { frost: 200 } }, boots: { slot: 'boots', resistPm: { frost: 100, ember: 50 } }, ring: { slot: 'ring' } };
    const eq = M.C.equipmentStats({ cape: 'cape', boots: 'boots', ring: 'ring' }, items);
    if (JSON.stringify(eq.resistPm) !== '{"ember":50,"frost":300}' || 'resistPm' in M.C.equipmentStats({ ring: 'ring' }, items)) return 'gear does not sum its resistPm: ' + JSON.stringify(eq.resistPm);
    /* THE SETTLE (browser closed): the snapshot's resistPm reaches the unit, and a group frost strike lands softer on it */
    return withSpells(M, [{ ...GROUP, cdMs: 4000 }], { rat: 't_group' }, () => {
      const a = member(M, 'a', { unitId: 1, seat: 0, hp: 5000, maxHp: 5000 }), b = member(M, 'b', { unitId: 2, seat: 1, hp: 5000, maxHp: 5000 });
      const snap = a.snapshot;
      a.snapshot = (st) => Object.assign(snap(st), { resistPm: { frost: 500 } });
      const fx = spanFixture(M, 11, { members: [a, b], spanMs: 90000 });
      const text = JSON.parse(runSpan(M, fx, []));
      const by = (u) => text.events.filter((e) => e.type === 'dmg' && e.ability === 't_group' && e.t === u).map((e) => e.amount);
      const A = by(1), B = by(2);
      const [, top] = topOf(M, 'rat', GROUP);
      if (!A.length || !B.length) return 'the span cast no group strike on both heroes (a ' + A.length + ', b ' + B.length + ')';
      /* the top through the hero's stance (both heroes play the same role, so the same stance), then half of it */
      const u1 = fx.world.units.find((u) => u.id === 1);
      const stanced = Math.floor((top * M.RS.HUNT_STANCES[u1.stance || 'balanced'].taken) / 1000);
      const cap = Math.floor((stanced * M.EL.heroElementPermille({ frost: 500 }, 'frost')) / 1000);
      if (Math.max(...A) > cap) return 'the resisting hero took ' + Math.max(...A) + ', over the capped share ' + cap + ' of the stanced top ' + stanced;
      if (Math.max(...B) <= Math.max(...A)) return 'the plain hero took no more than the resisting one: ' + JSON.stringify({ A, B });
      /* THE BROWSER'S PEER (viewed): a frozen row's snap reaches its engine member as it is (member.js frozenSide; the row is
         built by frozenOf, whose resistPm tests/hunt-live.mjs LV-SPELL plays against the server's commits) */
      const peer = M.memberMod.frozenSide({ key: 'p', seat: 1, unitId: 3, frozen: { hp: 10, maxHp: 10, maxMana: 0, regenPm: 1000, snap: { acc: 1, maxHit: 1, def: 0, armour: null, resistPm: { frost: 500 } }, hero: {} } });
      return JSON.stringify(peer.member.snapshot().resistPm) === '{"frost":500}' ? null : "a frozen peer's snapshot lost its resistPm";
    });
  },
  'shield-braces-marked': (M) => {
    /* the same fight twice on the same dice, the tank's shield worn and not: a marked hit lands SHIELD_BRACE lighter, a group one the same */
    const play = (row, shield) => withSpells(M, [row], { rat: row.id }, () => {
      const k = H(M, 1, 13, 3, 'tank');
      if (shield) k.shieldWorn = true;
      const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 9999, maxHp: 9999, swingLeftMs: 99999 });
      const inst = fightOf(M, [k, r]);
      const sc = recorder(M, 12);
      for (let i = 0; i <= 25; i++) { sc.atMs = i * 100; M.movement.occupancy(inst); M.spells.castSpells(inst, sc); M.spells.dropCasts(inst, sc); }
      return of(sc, 'dmg').filter((e) => e.ability === row.id).map((e) => e.amount);
    });
    const [bare] = play(RING, false), [braced] = play(RING, true);
    if (!bare || braced !== Math.max(1, Math.floor((bare * (1000 - M.MS.SHIELD_BRACE.markedPm)) / 1000))) return 'a shield took ' + bare + ' to ' + braced + ' on a marked hit';
    const [g0] = play({ ...GROUP, element: null }, false), [g1] = play({ ...GROUP, element: null }, true);
    if (!g0 || g0 !== g1) return 'a shield braced a group spell: ' + g0 + ' to ' + g1;
    /* THE SETTLE carries the member's worn shield to its unit (combat-sim.js syncUnit): the same span with and without it, the
       first marked hit on that hero lands lighter with it (everything before it is the same dice) */
    return withSpells(M, [{ ...RING, windupMs: 1600, cdMs: 6000 }], { rat: 't_ring' }, () => {
      const first = (shield) => {
        const fx = spanFixture(M, 7, { members: [member(M, 'a', { unitId: 1, seat: 0, shield, hp: 5000, maxHp: 5000 }), member(M, 'b', { unitId: 2, seat: 1, hp: 5000, maxHp: 5000 })] });
        const e = JSON.parse(runSpan(M, fx, [])).events.find((x) => x.type === 'dmg' && x.ability === 't_ring' && x.t === 1);
        return e ? e.amount : null;
      };
      const off = first(false), on = first(true);
      return off !== null && on !== null && on < off ? null : 'the settle did not brace the worn shield: ' + off + ' bare, ' + on + ' with it';
    });
  },
  /* THE DEFENSE BOUND AND A SPELL (lane/b-area-set; hr_hunt_apply_member's v_def prices every foe at one BLOCK every swing interval). A spell's
     landing on a shield tank is a blow taken at the PLAIN rate, braced or not, never a block's; and a monster casting as fast as a row may be
     written (the least windup, two spells back to back) with every swing between them blocked still earns the tank no more Defense XP than
     that bound's rate. The generator's refusal and the catalogue's self-check hold the same line (tools/gen-hunt-sessions.mjs). */
  'spell-trains-defense-plain': (M) => {
    const CX = M.coreModel.COMBAT_XP, tick = M.C.COMBAT_BALANCE.tickMs, least = M.MS.SPELL_BOUNDS.windupMs[0];
    if (!(least * CX.blockMult >= tick)) return 'the least windup ' + least + ' x blockMult ' + CX.blockMult + ' is under the swing interval ' + tick;
    const lv = M.monLevelOf(M.MONSTERS.rat), plain = (lv * CX.defenseXpPerLevelPermille) / 1000;
    const SPAN = 60000;
    /* One rat that never falls on a shield tank it can never land a swing on (every swing a block), casting two spells of the least windup
       on cooldown cdMs: back to back at the shortest a row may have, and at longer ones where its swings fall between its casts. */
    const play = (cdMs) => {
      const row = (id, shape) => ({ id, n: 'Test ' + id, shape, ...(shape === 'ring' ? { r: 1 } : {}), range: 1, windupMs: least, cdMs, hitPm: 1000, element: null });
      const rows = [row('t_fast_ring', 'ring'), row('t_fast_group', 'group')];
      return withSpells(M, rows, { rat: rows.map((r) => r.id) }, () => {
        const bad = rows.flatMap((r) => M.MS.validateSpell(r, r.id));
        if (bad.length) return { why: 'the row is no valid row: ' + bad[0] };
        const k = H(M, 1, 13, 3, 'tank', { hp: 999999, maxHp: 999999, def: 100000 });
        k.shieldWorn = true;
        const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 999999, maxHp: 999999 });
        const inst = fightOf(M, [k, r]);
        const sc = recorder(M, 21);
        for (let i = 0; i < SPAN / 100; i++) { sc.atMs = i * 100; M.movement.occupancy(inst); M.damage.resolveAttacks(inst, sc); M.spells.castSpells(inst, sc); M.spells.dropCasts(inst, sc); }
        const got = { defense: 0 };
        const members = new Map([[1, { armoured: true, shield: true, family: 'sword', state: { stats: {} }, hs: { tally: {} }, fx: { addXp: (skill, n) => { got[skill] = (got[skill] || 0) + n; } }, bonus: () => 0, weakness: () => ({ dropMult: 1 }) }]]);
        M.rewards.rewardSwing(members, sc.events, inst.world, { rng: null });
        const hits = of(sc, 'dmg').filter((e) => e.t === 1);
        return { spells: hits.filter((e) => M.MS.spellRow(e.ability)), swings: hits.filter((e) => !M.MS.spellRow(e.ability)).length,
          blocks: of(sc, 'miss').filter((e) => e.t === 1 && e.dodge !== true).length, defense: got.defense };
      });
    };
    /* the settle's term for the same span and this one foe: a block every swing interval, one interval of slack */
    const bound = (Math.floor(SPAN / tick) + 1) * plain * CX.blockMult;
    for (const cdMs of [M.MS.SPELL_BOUNDS.cdMs[0], 3500, 5000, 7300]) {
      const x = play(cdMs);
      if (x.why) return x.why;
      if (x.spells.length < 8 || !x.spells.some((e) => e.ability === 't_fast_ring') || !x.spells.some((e) => e.ability === 't_fast_group')) return 'cooldown ' + cdMs + ': the fixture landed ' + x.spells.length + ' spell hits: it proves nothing';
      /* (two spells at 3.5 s leave the rat no time to swing: it only casts. From 5 s its blocked swings fall between its casts.) */
      if (cdMs >= 5000 && !(x.blocks > 3)) return 'cooldown ' + cdMs + ': the rat blocked ' + x.blocks + ' swings between its casts: the fixture proves nothing';
      /* each spell landing pays the plain rate once, whatever the shield did to its damage */
      const want = plain * (x.spells.length + x.swings) + plain * CX.blockMult * x.blocks;
      if (Math.abs(x.defense - want) > 1e-6) return 'cooldown ' + cdMs + ': the tank earned ' + x.defense + ' Defense XP for ' + x.spells.length + ' spell hits, ' + x.swings + ' swings and ' + x.blocks + ' blocks, want ' + want + ' (a spell hit pays the plain rate)';
      if (!(x.defense <= bound)) return 'cooldown ' + cdMs + ': one caster paid ' + x.defense + ' Defense XP in ' + SPAN / 1000 + ' s (' + x.spells.length + ' spell hits, ' + x.blocks + ' blocks), over the settle\'s ' + bound + ' for one foe';
    }
    return null;
  },
  'two-spells-own-cooldowns': (M) => withSpells(M, [RING, { ...GROUP, windupMs: 1600, cdMs: 10000 }], { rat: ['t_ring', 't_group'] }, () => {
    const k = H(M, 1, 13, 3, 'tank', { hp: 99999, maxHp: 99999 });
    const r = mon(M, 10, 0, 14, 3, { target: 1, hp: 9999, maxHp: 9999 });
    const inst = fightOf(M, [k, r]);
    const sc = recorder(M, 13);
    for (let i = 0; i <= 130; i++) { sc.atMs = i * 100; M.movement.occupancy(inst); M.damage.resolveAttacks(inst, sc); M.spells.castSpells(inst, sc); M.spells.dropCasts(inst, sc); }
    /* the list's first ready spell starts; the second waits out the first's windup; each keeps its own cooldown from its start */
    const got = of(sc, 'spell').map((e) => e.spell + '@' + e.atMs).join(' ');
    return got.startsWith('t_ring@0 t_group@2500 t_ring@12000') ? null : 'two spells on one monster cast ' + got;
  }),
  'split-parity': (M) => withSpells(M, [{ ...RING, cdMs: 6000 }, BLAST], { rat: 't_ring', slime: 't_blast' }, () => {
    const one = runSpan(M, spanFixture(M, 7), []);
    const ev = JSON.parse(one).events.filter((e) => e.type === 'spell');
    if (ev.length < 2) return 'the fixture cast ' + ev.length + ' spell(s): the parity proves nothing';
    /* a window ends at the first swing boundary at or past its cut: a cut 1 ms after a cast starts ends the window inside
       a windup longer than the swing (the ring's 2.4 s), so the stored world carries the live cast; the fixed LCG cuts besides */
    const inside = ev.slice(0, 4).map((e) => e.atMs + 1);
    if (!ev.some((e) => e.ms > M.C.COMBAT_BALANCE.tickMs)) return 'no cast outlasts a swing: no cut can fall inside a windup';
    let s = 99; const lcg = [];
    for (let i = 0; i < 9; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; lcg.push(T0 + 1 + (s % 59998)); }
    const cut = runSpan(M, spanFixture(M, 7), inside.concat(lcg));
    return cut === one ? null : 'a span cut inside windups differs from the one span';
  }),
  'no-spell-no-trace': (M) => {
    const fx = spanFixture(M, 7);
    const text = JSON.parse(runSpan(M, fx, [T0 + 31337]));
    if (text.events.some((e) => e.type === 'spell' || e.type === 'spell_end')) return 'a span with no spell row cast one';
    return fx.world.units.some((u) => u.cast !== null || u.spellCds !== null) ? 'a unit carries a cast or a cooldown with no spell row' : null;
  },
};

const S = 'src/core/hunt/monster-spells.js';
const mutants = [
  { name: 'a casting monster still swings', case: 'telegraph-then-land', edits: [['src/core/hunt/damage.js', '    if (u.cast) continue;\n    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;', '    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;']] },
  { name: 'a casting monster walks', case: 'telegraph-then-land', edits: [['src/core/hunt/movement.js', '    if (u.cast) continue;\n    stepUnit(inst, u, sc);', '    stepUnit(inst, u, sc);']] },
  { name: 'the landing leaves the swing clock', case: 'telegraph-then-land', edits: [[S, '  u.cast = null;\n  restart(u);\n', '  u.cast = null;\n']] },
  { name: 'the cooldown is never set', case: 'telegraph-then-land', edits: [[S, '  u.spellCds = Object.assign({}, u.spellCds || {}, { [id]: sp.cdMs });\n', '']] },
  { name: 'a spell hit on a shield-holder pays the block rate', case: 'spell-trains-defense-plain', edits: [['src/core/hunt-rewards.js', 'const d = hit ? defenseXp(hit, unitOf(ev.u), false, ctx) : 0;', "const d = hit ? defenseXp(hit, unitOf(ev.u), !!ev.ability && ev.ability !== 'basic', ctx) : 0;"]] },
  { name: 'a casting monster swings through its windup (its blows outrun the Defense bound)', case: 'spell-trains-defense-plain', edits: [['src/core/hunt/damage.js', '    if (u.cast) continue;\n    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;', '    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;']] },
  { name: 'the least windup falls under the swing interval over the block multiple', case: 'spell-trains-defense-plain', edits: [['src/data/monster-spells.js', 'export const FAIR_WARNING = Object.freeze({ baseMs: 1200, perRadiusMs: 400 });', 'export const FAIR_WARNING = Object.freeze({ baseMs: 800, perRadiusMs: 400 });']] },
  { name: 'one cooldown for every spell', case: 'two-spells-own-cooldowns', edits: [[S, '      if (u.spellCds && u.spellCds[id] > 0) continue;', '      if (u.spellCds) continue;']] },
  { name: 'a monster casts only its first spell', case: 'two-spells-own-cooldowns', edits: [[S, '    for (const id of list) {', '    for (const id of list.slice(0, 1)) {']] },
  { name: 'no brace', case: 'shield-braces-marked', edits: [[S, 'marked(sp) && h.shieldWorn === true ? braced : plain', 'plain']] },
  { name: 'the settle never carries the worn shield', case: 'shield-braces-marked', edits: [['src/core/combat-sim.js', '  if (m.shield === true) u.shieldWorn = true; else if (u.shieldWorn) delete u.shieldWorn;\n', '']] },
  { name: 'a shield braces a group spell too', case: 'shield-braces-marked', edits: [[S, 'marked(sp) && h.shieldWorn === true ? braced : plain', 'h.shieldWorn === true ? braced : plain']] },
  { name: 'a brace of nothing', case: 'shield-braces-marked', edits: [['src/data/monster-spells.js', 'export const SHIELD_BRACE = Object.freeze({ markedPm: 300 });', 'export const SHIELD_BRACE = Object.freeze({ markedPm: 0 });']] },
  { name: 'the cooldown runs from the landing', case: 'telegraph-then-land', edits: [[S, '  u.cast = null;\n  restart(u);\n', '  u.cast = null;\n  u.spellCds = Object.assign({}, u.spellCds || {}, { [id]: sp.cdMs });\n  restart(u);\n']] },
  { name: 'the hit has no roll range (always its top)', case: 'rows-and-formulas', edits: [['src/data/monster-spells.js', 'export const SPELL_ROLL = Object.freeze({ lowPm: 500 });', 'export const SPELL_ROLL = Object.freeze({ lowPm: 1000 });']] },
  { name: 'the windup is skipped', case: 'telegraph-then-land', edits: [[S, '  const ms = slowed(u, sp.windupMs);', '  const ms = 100;']] },
  { name: 'a fair warning of a flat 1.2 s', case: 'rows-and-formulas', edits: [['src/data/monster-spells.js', '  return FAIR_WARNING.baseMs + FAIR_WARNING.perRadiusMs * (r - 1);', '  return FAIR_WARNING.baseMs;']] },
  { name: "the screen's mark lands on its own clock", case: 'telegraph-then-land', edits: [['src/core/hunt/marks.js', 'landsAtMs: ev.atMs + ev.ms };', 'landsAtMs: ev.atMs + 2000 };']] },
  { name: "the screen's mark keeps the walls", case: 'shapes', edits: [['src/core/hunt/marks.js', '  return { caster: ev.u, spell: ev.spell, tiles: tilesOf(s, grid),', '  return { caster: ev.u, spell: ev.spell, tiles: tilesOf(s),']] },
  { name: 'a ring covers its caster', case: 'shapes', edits: [['src/core/hunt/shapes.js', "    case 'ring': return d >= 1 && d <= s.r;", "    case 'ring': return d <= s.r;"]] },
  { name: 'a cone of 180 degrees', case: 'shapes', edits: [['src/core/hunt/shapes.js', '      return dot > 0 && 2 * dot * dot >= (rx * rx + ry * ry) * (s.dx * s.dx + s.dy * s.dy);', '      return dot >= 0;']] },
  { name: 'a line on the 8 ways only', case: 'shapes', edits: [['src/core/hunt/shapes.js', '  return [s.ox + rdiv(k * s.dx, d), s.oy + rdiv(k * s.dy, d)];', '  return [s.ox + Math.sign(s.dx) * k, s.oy + Math.sign(s.dy) * k];']] },
  { name: 'drawn tiles keep the walls', case: 'shapes', edits: [['src/core/hunt/shapes.js', "if (covers(s, x, y) && (!grid || walkable(grid, x, y))) out.push([x, y]);", 'if (covers(s, x, y)) out.push([x, y]);']] },
  { name: 'a radius 3 passes the bounds', case: 'shapes', edits: [['src/core/hunt/shapes.js', 'r: Object.freeze([1, 2]),', 'r: Object.freeze([1, 3]),']] },
  { name: 'a killed caster still lands', case: 'dropped', edits: [[S, "const outOf = (u) => (!u.alive ? 'killed' : ", "const outOf = (u) => (false ? 'killed' : "]] },
  { name: 'a reset caster still lands', case: 'dropped', edits: [[S, " : !Number.isInteger(u.target) ? 'reset' : null);", ' : null);']] },
  { name: 'the drop hook does nothing (the mark closes a sub-step late)', case: 'dropped', edits: [[S, '    const why = outOf(u);\n    if (why) drop(u, sc, why);\n', '']] },
  { name: 'a Chill does not stretch the windup', case: 'chill-slows', edits: [[S, '  const ms = slowed(u, sp.windupMs);', '  const ms = sp.windupMs;']] },
  { name: 'a Chill does not stretch the swing', case: 'chill-slows', edits: [['src/core/hunt/damage.js', 'export function restart(u) { u.swingLeftMs = slowed(u, COMBAT_BALANCE.tickMs); }', 'export function restart(u) { u.swingLeftMs = COMBAT_BALANCE.tickMs; }']] },
  { name: 'a Chill that outlasts its 4 s', case: 'chill-slows', edits: [['src/data/statuses.js', 'durationMs: 4000, maxStacks: 1, slowPm: 300', 'durationMs: 40000, maxStacks: 1, slowPm: 300']] },
  { name: 'a ranged hero holds on a mark', case: 'ranged-off-melee-holds', edits: [['src/core/hunt/roles.js', '      if (marked) stepOff(inst, h, mons, marked);\n', '']] },
  { name: 'a ranged hero held in melee steps off anyway', case: 'ranged-off-melee-holds', edits: [['src/core/hunt/roles.js', '  if (mons.some((m) => m.target === h.id && cheb(m, h) <= 1)) return false;\n', '']] },
  { name: 'the strike lands on every hero whatever the mark', case: 'ranged-off-melee-holds', edits: [[S, "h.side === 'hero' && h.alive && covers(s, h.x, h.y)", "h.side === 'hero' && h.alive"]] },
  { name: 'Melee steps off too', case: 'ranged-off-melee-holds', edits: [['src/core/hunt/roles.js', "    if (row.tank) tankPos(inst, h, mons);\n    else if (row.melee) meleePos(inst, h, mons);\n    else {", '    if (false) tankPos(inst, h, mons);\n    else if (false) meleePos(inst, h, mons);\n    else {']] },
  { name: 'a spot may stand on a mark', case: 'spots-avoid-marks', edits: [['src/core/hunt/roles.js', ' && !(marked && marked(x, y));', ';']] },
  { name: 'a group strike marks the ground', case: 'spots-avoid-marks', edits: [['src/core/hunt/marks.js', "const groundOf = (m) => { const s = castShape(m); return s && s.kind !== 'group' ? s : null; };", 'const groundOf = (m) => castShape(m);']] },
  { name: 'a group strike hits only its target\'s tile', case: 'group-strikes-all', edits: [['src/core/hunt/shapes.js', "    case 'group': return true;", "    case 'group': return d === 0;"]] },
  { name: 'enemy_casting reads only ground marks', case: 'group-strikes-all', edits: [['src/core/hunt/marks.js', "    const s = castShape(m);\n    if (s && heroes.some((h) => h && covers(s, h.x, h.y))) out.push(m);", "    const s = groundOf(m);\n    if (s && heroes.some((h) => h && covers(s, h.x, h.y))) out.push(m);"]] },
  { name: 'a hero ignores its resistance', case: 'resist-takes-less', edits: [['src/core/hunt/targeting.js', ': heroElementPermille(unit.resistPm, element));', ': 1000);']] },
  { name: 'the settle never carries resistPm to the unit', case: 'resist-takes-less', edits: [['src/core/combat-sim.js', '  if (snap.resistPm) u.resistPm = snap.resistPm; else if (u.resistPm) delete u.resistPm;\n', '']] },
  { name: 'a resist past the 40% cap', case: 'resist-takes-less', edits: [['src/data/elements.js', 'export const HERO_RESIST_PM = Object.freeze({ min: 0, max: 400 });', 'export const HERO_RESIST_PM = Object.freeze({ min: -1000, max: 750 });']] },
  { name: 'the combat seam reads past the cap', case: 'resist-takes-less', edits: [['src/core/elements.js', '  return Number.isFinite(v) ? 1000 - Math.min(HERO_RESIST_PM.max, Math.max(HERO_RESIST_PM.min, v)) : 1000;', '  return Number.isFinite(v) ? 1000 - v : 1000;']] },
  { name: 'gear never sums its resistPm', case: 'resist-takes-less', edits: [['src/core/combat.js', '  if (resist) Object.assign(s, { resistPm: resist });\n', '']] },
  { name: 'the cast record is not persisted (a cut forgets the mark)', case: 'split-parity', edits: [[S, "  unit: Object.freeze([['spellCds', 'json'], ['cast', 'json']]),", "  unit: Object.freeze([['spellCds', 'json']]),"]] },
];

const R = makeReport('hunt-core/monster-spells');
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
