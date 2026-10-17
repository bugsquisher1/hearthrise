// tests/hunt-core/fixtures/h1.js — lane H1's shared fixtures for the hunt core tests.
//
// A small walled ground (two rooms joined by a door, a one-tile corridor
// below), unit builders, a sub-step context that records its events and
// track, a hunt-session fixture for the span tests, and the mutation helper
// every hunt-core test uses: `plant` copies src/core + src/data into a temp
// root with a defect applied, `loadCore(root)` imports the modules from it.
// Other lanes keep their fixtures in fixtures/<lane>.js (spec §1.6).
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const V = '?v=' + (/cache:\s*(\d+)/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

/** Import the hunt core (and what it stands on) from `root` — the repo or a planted copy. */
export async function loadCore(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const names = ['grid', 'leash', 'movement', 'events', 'world-state', 'world-step', 'targeting', 'roles', 'pull-cycle',
    'damage', 'abilities', 'status', 'consumables', 'xp-share', 'tally'];
  const mods = await Promise.all(names.map((n) => imp('src/core/hunt/' + n + '.js')));
  /* M.worldstate, M.movement, … and M.hunt['pull-cycle'] for every module by its file name. */
  const M = Object.fromEntries(names.map((n, i) => [n.replace('-', ''), mods[i]]));
  M.hunt = Object.fromEntries(names.map((n, i) => [n, mods[i]]));
  M.cs = await imp('src/core/combat-sim.js');
  M.AR = await imp('src/core/action-rules.js');
  M.rng = await imp('src/core/rng.js');
  M.tuning = await imp('src/data/hunt-tuning.js');
  M.grounds = await imp('src/data/hunt-grounds.js');
  M.MONSTERS = (await imp('src/data/monsters.js')).MONSTERS;
  M.ITEMS = (await imp('src/data/items.js')).ITEMS;
  M.HUNTS = (await imp('src/data/hunts.js')).HUNT_INDEX;
  M.RS = await imp('src/data/rule-subjects.js');
  M.C = await imp('src/core/combat.js');
  M.root = root;
  return M;
}

/**
 * Copy src/core and src/data to a temp root and apply each [file, from, to]
 * (exactly one occurrence of `from`, or it throws — a mutant that plants
 * nothing proves nothing). Answers { root, done() }.
 */
export function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-core-'));
  for (const d of ['src/core', 'src/data']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
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
    route: [0, 1, 2], respawnMs: 90000, pullDist: 1.5,
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

/* ── THE SPAN FIXTURE: a hunt session whose instance carries a world ── */
export const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);

/** A hero hunting mill_cellar, with a world in which the leader walks out of the east room. */
export function spanFixture(M, seed) {
  const hs = M.AR.newHuntSession({ id: 'h1-span', huntFromMs: T0, bag: { cooked_shrimp: { loaded: 40 } },
    slots: M.RS.DEFAULT_PRESET.slots, pull: { size: 2, respawnMs: 20000, left: 0, respawnAtMs: T0 } });
  const lead = hero(M, 1, 12, 3, { goal: null });
  const follower = hero(M, 2, 13, 3);
  const w = world(M, [lead, follower, mon(M, 3, 0, 11, 2, { hp: 4, target: 1, home: [14, 3] }),
    mon(M, 4, 0, 11, 5, { hp: 6, target: 1, home: [15, 4] })],
    { leader: 1, packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }] });
  hs.world = w;
  const state = { activeMonster: 'rat', playerHp: 40, playerMaxHp: 40, huntSession: hs, stats: {}, inventory: {},
    deathsTodayBefore: 0, deathsLifetimeBefore: 0 };
  const ground = groundRow();
  const grid = gridOf(M);
  /* The leader's walk: east room → the door → the west room → the corridor (set once, before the span). */
  M.movement.setGoal({ world: w, ground, grid, occ: null }, lead, 2, 8);
  const ctx = { tickMs: 2000, swingSeed: (i) => M.rng.hashSeed('h1', seed, i), monsters: M.MONSTERS, items: M.ITEMS,
    hunt: M.HUNTS.mill_cellar, bonus: () => 0, weakness: () => ({ dropMult: 1 }), ground, grid,
    playerRolls: () => ({ accuracy: 0.9, maxHit: 9, critChance: 0.05 }), monsterRolls: () => ({ accuracy: 0.5, maxHit: 2 }) };
  return { state, ctx, spanMs: 60000 };
}

/** Run the span fixture over [T0, T0 + spanMs) cut at `cuts`, decoding the world from JSON at every cut. */
export function runSpan(M, fx, cuts) {
  const { state, ctx, spanMs } = fx;
  const edges = [T0, ...cuts.filter((c) => c > T0 && c < T0 + spanMs).sort((a, b) => a - b), T0 + spanMs];
  const track = []; const events = []; const worldEvents = [];
  for (let i = 1; i < edges.length; i++) {
    const hs = state.huntSession;
    hs.world = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(hs.world))));
    const r = M.cs.simulateSpan(state, Object.assign({}, ctx, { fromMs: edges[i - 1], toMs: edges[i] }));
    track.push(...r.huntTrack); events.push(...r.huntEvents); worldEvents.push(...r.huntWorldEvents);
  }
  const hs = state.huntSession;
  const world = M.worldstate.encode(hs.world);
  return JSON.stringify({ world, track, events, worldEvents, hp: state.playerHp, kills: state.stats.kills || 0,
    swing: hs.swingIndex, next: hs.nextSwingAtMs, tally: hs.tally });
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
  const M = await loadCore(ROOT);
  for (const [cn, fn] of Object.entries(cases)) {
    let why = null;
    try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  for (const mu of mutants || []) {
    const p = plant(mu.edits);
    try {
      let why = null;
      try { why = cases[mu.case](await loadCore(p.root)); } catch (e) { why = 'threw ' + e.message; }
      R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    } finally { p.done(); }
  }
  if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + (mutants || []).length + ' mutants caught');
  R.finish();
}
