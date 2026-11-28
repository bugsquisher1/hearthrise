// tests/hunt-core/fixtures/h1.js — lane H1's shared fixtures for the hunt core tests.
//
// A small walled ground (two rooms joined by a door, a one-tile corridor
// below), unit builders, a sub-step context that records its events and
// track, a hunt-session fixture for the span tests, and the mutation helper
// every hunt-core test uses: `plant` copies src/core + src/data into a temp
// root with a defect applied, `loadCore(root)` imports the modules from it.
// Other lanes keep their fixtures in fixtures/<lane>.js (spec §1.6).
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, writeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceQuery } from '../../../tools/lib/version-stamp.mjs';
import { caughtBy, missWhy } from '../../_mutant-verdict.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const V = sourceQuery(ROOT);

/** Import the hunt core (and what it stands on) from `root` — the repo or a planted copy. */
export async function loadCore(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const names = ['grid', 'leash', 'movement', 'events', 'world-state', 'world-step', 'targeting', 'roles', 'pull-cycle',
    'damage', 'abilities', 'status', 'consumables', 'xp-share', 'tally', 'conditions', 'monster-formula'];
  const mods = await Promise.all(names.map((n) => imp('src/core/hunt/' + n + '.js')));
  /* M.worldstate, M.movement, … and M.hunt['pull-cycle'] for every module by its file name. */
  const M = Object.fromEntries(names.map((n, i) => [n.replace('-', ''), mods[i]]));
  M.hunt = Object.fromEntries(names.map((n, i) => [n, mods[i]]));
  M.cs = await imp('src/core/combat-sim.js');
  M.spawn = await imp('src/core/hunt-spawn.js');
  M.AR = await imp('src/core/action-rules.js');
  M.rng = await imp('src/core/rng.js');
  M.tuning = await imp('src/data/hunt-tuning.js');
  M.coreModel = await imp('src/data/core-model.js');
  M.grounds = await imp('src/data/hunt-grounds.js');
  M.MONSTERS = (await imp('src/data/monsters.js')).MONSTERS;
  M.ITEMS = (await imp('src/data/items.js')).ITEMS;
  M.HUNTS = (await imp('src/data/hunts.js')).HUNT_INDEX;
  M.RS = await imp('src/data/rule-subjects.js');
  M.C = await imp('src/core/combat.js');
  M.vitals = await imp('src/core/vitals.js');
  M.huntSessions = await imp('src/data/hunt-sessions.js');
  M.rewards = await imp('src/core/hunt-rewards.js');
  M.member = await imp('src/core/member.js');
  M.huntRoles = await imp('src/data/hunt-roles.js');
  M.SB = await imp('src/data/supply-basics.js');
  M.XP = await imp('src/core/xp.js');
  M.root = root;
  return M;
}

/* ── ONE MODULE GRAPH A BATCH (lane/nightly-red-1128) ──
   ES modules never unload, so a runner that imports a planted copy of src per mutant keeps every copy until it exits. Measured on
   set/v0.2.144 26962cd28 (Node 26, heap at exit): abilities 1,509 MB, conditions 1,254, signature-rules 1,120 after its last full GC,
   danger 1,035, first-week-bands 954, about 10 MB a mutant (35 with the play trees), against the ~2,048 MB heap of GitHub's Node 20,
   where alpha-windows-pure died of the same growth (nightly 46142108500). judgeMutants answers judge(mu) for every mutant, MUTANT_BATCH
   at a time in a child process (this same file, run again with `--mutant-batch=a:b`), which writes each answer and exits with its
   copies. A batch that dies leaves its mutants a HARNESS answer, never a catch. A runner skips its cases in a batch child
   (inMutantBatch): the parent ran them. run-all.mjs holds every file to a heap budget, so the next runner that grows is red first. */
export const MUTANT_BATCH = 20;
const BATCH_ARG = '--mutant-batch=';
const ANSWER = 'MUTANT-ANSWER ';
export const inMutantBatch = (argv = process.argv) => argv.some((a) => a.startsWith(BATCH_ARG));

/** `judge(mu)` → its answer (a case's failure line or null) for every mutant, in their order. Never returns in a batch child. */
export async function judgeMutants(mutants, judge, { per = MUTANT_BATCH, argv = process.argv } = {}) {
  const mine = argv.find((a) => a.startsWith(BATCH_ARG));
  if (mine) {
    const [a, b] = mine.slice(BATCH_ARG.length).split(':').map(Number);
    for (let i = a; i < Math.min(b, mutants.length); i++) {
      let why = null;
      try { why = await judge(mutants[i]); } catch (e) { why = 'threw ' + (e && e.message); }
      /* fd 1 written synchronously: the exit below cannot cut a line a pipe still holds */
      writeSync(1, ANSWER + JSON.stringify([i, why === undefined ? null : why]) + '\n');
    }
    process.exit(0);
  }
  const whys = new Array(mutants.length);
  for (let a = 0; a < mutants.length; a += per) {
    const b = Math.min(a + per, mutants.length);
    const r = spawnSync(process.execPath, [...process.execArgv, argv[1], ...argv.slice(2), BATCH_ARG + a + ':' + b], { encoding: 'utf8', maxBuffer: 1e8 });
    for (const l of String(r.stdout || '').split('\n')) {
      if (!l.startsWith(ANSWER)) continue;
      try { const [i, why] = JSON.parse(l.slice(ANSWER.length)); if (Number.isInteger(i) && i >= a && i < b) whys[i] = why; } catch { /* a torn line: that mutant stays unanswered */ }
    }
    const said = String(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ').slice(0, 240);
    for (let i = a; i < b; i++) if (whys[i] === undefined) whys[i] = 'HARNESS: mutants ' + a + '..' + (b - 1) + ' ran in a process that exited ' + r.status + ' with no answer for this one: ' + said;
  }
  return whys;
}

/**
 * Copy src/core and src/data to a temp root and apply each [file, from, to]
 * (exactly one occurrence of `from`, or it throws — a mutant that plants
 * nothing proves nothing). Answers { root, done() }.
 */
export function plant(edits, also = []) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-core-'));
  /* `also`: more trees a planted run needs (the real settle: supabase/functions/hr-accrue,
     play-ground.mjs PLAY_TREES); images are never copied. */
  for (const d of ['src/core', 'src/data', ...also]) cpSync(join(ROOT, d), join(root, d), { recursive: true, filter: (f) => !/\.(png|webp)$/i.test(f) });
  cpSync(join(ROOT, 'src/build-info.js'), join(root, 'src/build-info.js'));
  for (const [file, from, to] of edits) {
    const p = join(root, file);
    const src = readFileSync(p, 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error('plant: ' + file + ' has ' + n + ' copies of the anchor ' + JSON.stringify(from.slice(0, 60)));
    writeFileSync(p, src.replace(from, to));
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}

/* The map: '#' wall (blocks walking and sight), '.' floor.
   x: 0123456789012345678 9 */
export const MAP = Object.freeze([
  '####################', // 0
  '#........#.........#', // 1
  '#........#.........#', // 2
  '#..................#', // 3  door at x = 9, rows 3-4
  '#..................#', // 4
  '#........#.........#', // 5
  '#........#.........#', // 6
  '####.#########.#####', // 7  openings down to the corridor at x = 4 and x = 14
  '#..................#', // 8  the corridor, one tile high
  '####################', // 9
]);

export const gridOf = (M) => M.grid.makeGrid(MAP[0].length, MAP.length, (x, y) => MAP[y][x] === '.', (x, y) => MAP[y][x] === '#');

/* Pocket 0: the east room; pocket 1: the west room; pocket 2: the corridor. */
export function groundRow(o) {
  return Object.assign({
    id: 'h1_fixture', hunt: 'mill_cellar', map: 'h1_fixture', start: [[2, 8], [3, 8]],
    pockets: [
      { room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 14, y: 3 }, { monster: 'rat', x: 15, y: 4 }] },
      { room: [1, 1, 8, 6], spawns: [{ monster: 'slime', x: 4, y: 3 }] },
      { room: [1, 8, 18, 8], spawns: [{ monster: 'rat', x: 9, y: 8 }] },
    ],
    route: [0, 1, 2], respawnMs: 90000, pullDist: 1.5, groupFit: 'both',
  }, o || {});
}

export const hero = (M, id, x, y, o) => M.worldstate.makeUnit(Object.assign(
  { id, side: 'hero', kind: 'hero', pocket: null, alive: true, hp: 30, maxHp: 30, x, y, fx: x, fy: y, speed: 3200 }, o || {}));
export const mon = (M, id, pocket, x, y, o) => M.worldstate.makeUnit(Object.assign(
  { id, side: 'mon', kind: 'rat', pocket, alive: true, hp: 10, maxHp: 10, x, y, fx: x, fy: y, home: [x, y], speed: 2400 }, o || {}));

/** A world holding exactly `units` (the same objects, so a test can watch them move). */
export function world(M, units, o) {
  const w = M.worldstate.makeWorld(Object.assign({ ground: 'h1_fixture', swing: 0, leader: null,
    packs: [{ aggro: false, holder: null }, { aggro: false, holder: null }, { aggro: false, holder: null }] }, o || {}));
  w.units = units;
  return w;
}

export const instOf = (M, w, ground) => ({ world: w, ground: ground || groundRow(), grid: gridOf(M), occ: null });

/** A sub-step context that records what it is told. */
export function subStep(atMs) {
  const events = []; const track = [];
  return { atMs: atMs || 0, dtMs: 100, swing: 0, rng: null, events, trackSteps: track,
    emit: (e) => events.push(e), track: (t) => track.push(t) };
}

/** Run the movement sub-step n times; `each(i)` runs before each one. */
export function move(M, inst, n, sc, each) {
  for (let i = 0; i < n; i++) {
    sc.atMs = i * 100;
    if (each) each(i);
    M.movement.moveAll(inst, sc);
  }
}

/* ── THE SPAN FIXTURE: a hunt INSTANCE (lane S1: a solo hunt is a party of one) ── */
export const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);

/** One member of an instance: a hero of `role` whose unit is `unitId` (null: arrives at `fromMs`). */
export function member(M, key, o) {
  const x = o || {};
  const hs = M.AR.newHuntSession({ id: 'h1-' + key, instanceId: 'h1-span', huntFromMs: x.fromMs ?? T0, nextSwingAtMs: x.fromMs ?? T0,
    bag: x.bag || { cooked_shrimp: { loaded: 40 } } });
  const state = { skills: {}, levelXp: x.levelXp ?? 0, playerHp: x.hp ?? 40, playerMaxHp: x.maxHp ?? 40, playerMaxMana: 60,
    regenPm: 1000, stats: {}, gold: 0 };
  return {
    key, seat: x.seat || 0, unitId: x.unitId ?? null, hs, state,
    family: x.family || 'hammer', armoured: x.armoured === true, shield: x.shield === true,
    bonus: () => 0, weakness: () => ({ dropMult: 1 }),
    snapshot: () => ({ acc: x.acc ?? 900, maxHit: x.maxHit ?? 9, def: x.def ?? 1 }),
    fx: x.fx || {},
    /* THE BAR SHORTHAND (fixtures only): ability ids, each a slot with no conditions, through the engine's heroSlots. */
    hero: { role: x.role || 'melee_dps', element: '', settings: null, slots: M.conditions.heroSlots(x.bar || [], null), actionSet: 'hunt', range: 1,
      ammo: null, leaveTogether: x.together === true },
  };
}

/** A two-hero party on the h1 ground: a real cycling world (hunt-spawn.newHuntWorld: packs spawned, phase travel). */
export function spanFixture(M, seed, o) {
  const ground = groundRow();
  const grid = gridOf(M);
  const x = o || {};
  const members = x.members || [member(M, 'a', { unitId: 1, seat: 0 }), member(M, 'b', { unitId: 2, seat: 1 })];
  const w = M.spawn.newHuntWorld(ground, grid, members.filter((m) => m.unitId !== null)
    .map((m) => Object.assign({ role: m.hero.role, maxHp: m.state.playerMaxHp, maxMana: m.state.playerMaxMana }, m.snapshot(m.state))));
  const ctx = { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('h1', seed, d, i), monsters: M.MONSTERS, ground, grid,
    ...(x.xpMultOf ? { xpMultOf: x.xpMultOf } : {}) };
  return { inst: { world: w, nextSwingAtMs: T0, members }, ctx, spanMs: x.spanMs || 60000 };
}

/** Run the span fixture over [T0, T0 + spanMs) cut at `cuts`, decoding the world from JSON at every cut. */
export function runSpan(M, fx, cuts) {
  const { inst, ctx, spanMs } = fx;
  const edges = [T0, ...cuts.filter((c) => c > T0 && c < T0 + spanMs).sort((a, b) => a - b), T0 + spanMs];
  const track = []; const events = []; const memberEvents = [];
  let world = inst.world; let next = inst.nextSwingAtMs;
  for (let i = 1; i < edges.length; i++) {
    world = world ? M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(world)))) : null;
    /* A window OPENS with one anchor step per standing unit (combat-sim.js ANCHORS, visual only): where the
       windows fall moves those by design; every other step, and the world, must not move. */
    const anchors = world ? world.units.filter((u) => u.alive).length : 0;
    const r = M.cs.simulateHuntInstance({ world, nextSwingAtMs: next, members: inst.members }, Object.assign({}, ctx, { toMs: edges[i] }));
    world = r.world; next = r.nextSwingAtMs;
    track.push(...r.track.slice(anchors)); events.push(...r.events);
    for (const m of inst.members) memberEvents.push(...r.members[m.key].huntEvents);
  }
  fx.world = world;
  return JSON.stringify({ world: world ? M.worldstate.encode(world) : null, track, events, memberEvents, next,
    members: inst.members.map((m) => ({ hp: m.state.playerHp, kills: m.state.stats.kills || 0, gold: m.state.gold,
      swing: m.hs.swingIndex, next: m.hs.nextSwingAtMs, tally: m.hs.tally, died: m.hs.died, ended: m.hs.endedReason })) });
}

/* ── REPORTING ── */
export function makeReport(name) {
  const fails = [];
  return {
    ok(cond, msg) { if (!cond) fails.push(msg); },
    fails,
    finish() {
      if (fails.length) { for (const f of fails) console.log('FAIL  ' + f); console.log(name + ': ' + fails.length + ' FAILED'); process.exit(1); }
      console.log(name + ': green');
    },
  };
}

/**
 * Run `cases` (name → (M) => string|null, the failure or null) on the repo, then
 * every mutant ({ name, case, edits }) on a planted copy: each mutant's case MUST fail.
 */
export async function suite(name, cases, mutants) {
  const R = makeReport(name);
  if (!inMutantBatch()) {
    const M = await loadCore(ROOT);
    for (const [cn, fn] of Object.entries(cases)) {
      let why = null;
      try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
      R.ok(!why, cn + ': ' + why);
    }
  }
  for (const mu of mutants || []) if (!cases[mu.case]) R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case);
  const named = (mutants || []).filter((mu) => cases[mu.case]);
  const whys = await judgeMutants(named, async (mu) => {
    const p = plant(mu.edits);
    try { return cases[mu.case](await loadCore(p.root)); } finally { p.done(); }
  });
  named.forEach((mu, i) => R.ok(caughtBy(whys[i]), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(whys[i])));
  if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + (mutants || []).length + ' mutants caught');
  R.finish();
}
