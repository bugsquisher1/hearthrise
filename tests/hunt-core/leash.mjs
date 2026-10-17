// tests/hunt-core/leash.mjs — src/core/hunt/leash.js (spec §3.1 #5-7, #9; parity LE-01..08, RO-13).
// Run by tests/hunt-core/run-all.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { suite, hero, mon, world, instOf, groundRow, subStep, move } from './fixtures/h1.js';

/* Strip // and block comments, so a file that only NAMES a function is not a caller. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const coreFiles = (root) => readdirSync(join(root, 'src/core/hunt')).filter((f) => f.endsWith('.js'))
  .map((f) => [f, code(readFileSync(join(root, 'src/core/hunt', f), 'utf8'))]);

const STALE_PATH_OUT = [[11, 3], [10, 3], [9, 3], [8, 3], [7, 3], [6, 3]];

const cases = {
  /* LE-01 / LE-04 (plan): a monster's plan never leaves its area — a goal outside is no path. */
  'plan-stays-in-area': (M) => {
    const m = mon(M, 10, 0, 12, 3);
    const inst = instOf(M, world(M, [m]));
    M.movement.occupancy(inst);
    M.movement.setGoal(inst, m, 3, 3);
    if (m.path.some(([x, y]) => !M.leash.inArea(inst, 0, x, y))) return 'the plan leaves the pack area: ' + JSON.stringify(m.path);
    if (m.path.length) return 'a goal outside the area must plan no path, got ' + JSON.stringify(m.path);
    return null;
  },
  /* LE-04 (step): even a stale path that walks out is refused at the step. */
  'monster-never-steps-outside-area': (M) => {
    const m = mon(M, 10, 0, 12, 3, { goal: [6, 3], path: STALE_PATH_OUT.map((t) => t.slice()) });
    const inst = instOf(M, world(M, [m]));
    let out = null;
    move(M, inst, 60, subStep(), () => { if (!M.leash.inArea(inst, 0, m.x, m.y)) out = out || [m.x, m.y]; });
    if (out || !M.leash.inArea(inst, 0, m.x, m.y)) return 'the monster stepped outside its area at ' + JSON.stringify(out || [m.x, m.y]);
    if (m.x !== 9) return 'the monster should stop on the area edge (x = 9), it is at ' + m.x;
    return null;
  },
  /* LE-02: blocked in the corridor, the re-route round the blocker still never leaves the area. */
  'reroute-stays-in-area': (M) => {
    const m = mon(M, 2, 2, 5, 8); const stand = hero(M, 1, 9, 8);
    const inst = instOf(M, world(M, [stand, m]));
    M.movement.setGoal(inst, m, 13, 8);
    let left = null;
    move(M, inst, 60, subStep(), () => {
      for (const [x, y] of m.path) if (!M.leash.inArea(inst, 2, x, y)) left = left || [x, y];
    });
    if (left) return 'a re-route planned through ' + JSON.stringify(left) + ', outside the corridor';
    return m.x === 8 ? null : 'the monster should wait at x = 8, it is at ' + m.x;
  },
  /* LE-05 / LE-08: the margin is the ground's own (default from hunt-tuning). */
  'margin-is-per-hunt': (M) => {
    const tight = instOf(M, world(M, []), groundRow({ leashMargin: 0 }));
    const plain = instOf(M, world(M, []), groundRow());
    const wide = instOf(M, world(M, []), groundRow({ leashMargin: 3 }));
    if (M.leash.inArea(tight, 0, 9, 3)) return 'margin 0: the door tile is outside the room';
    if (!M.leash.inArea(plain, 0, 9, 3) || M.leash.inArea(plain, 0, 8, 3)) return 'default margin must be exactly 1 tile';
    if (!M.leash.inArea(wide, 0, 7, 3)) return 'margin 3 must reach x = 7';
    if (M.grounds.leashMarginOf(groundRow()) !== M.tuning.HUNT_TUNING.leashMarginDefault) return 'leashMarginOf ignores the default';
    const m = mon(M, 10, 0, 12, 3, { goal: [6, 3], path: STALE_PATH_OUT.map((t) => t.slice()) });
    const inst = instOf(M, world(M, [m]), groundRow({ leashMargin: 0 }));
    move(M, inst, 60, subStep());
    if (m.x !== 10) return 'with margin 0 the monster must stop at x = 10, it is at ' + m.x;
    if (M.grounds.validateGround(groundRow({ leashMargin: 1.5 })).length === 0) return 'a fractional margin must be refused';
    return null;
  },
  /* LE-04 / spec §3.1 #6: leashAllows is imported only by movement.js; only movement.js writes a unit's tile. */
  'leash-called-only-from-movement': (M) => {
    const bad = [];
    for (const [f, src] of coreFiles(M.root)) {
      if (f !== 'leash.js' && f !== 'movement.js' && /\bleashAllows\b/.test(src)) bad.push(f + ' names leashAllows');
      if (f !== 'movement.js' && /\.(x|y|fx|fy)\s*=(?!=)/.test(src)) bad.push(f + ' writes a unit tile');
    }
    return bad.length ? bad.join('; ') : null;
  },
  /* LE-06 / spec §3.1 #7: the holder leaves the area → the pack drops targets, heals, walks home. */
  'holder-leaves-area-pack-resets-and-heals': (M) => {
    const lead = hero(M, 1, 10, 3);
    const a = mon(M, 2, 0, 12, 3, { hp: 3, target: 1, home: [15, 3] });
    const b = mon(M, 3, 0, 12, 4, { hp: 5, target: 1, home: [16, 4] });
    const w = world(M, [lead, a, b], { leader: 1, packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }] });
    const ground = groundRow(); const inst = instOf(M, w, ground);
    M.movement.setGoal(inst, lead, 3, 3);
    const resets = [];
    for (let s = 0; s < 6; s++) {
      const r = M.worldstep.stepSwing(w, { ground, grid: inst.grid, swingMs: 2000, atMs: s * 2000, fight: false, rng: null });
      resets.push(...r.events.filter((e) => e.type === 'pack_reset'));
    }
    if (resets.length !== 1 || resets[0].pocket !== 0) return 'expected one pack_reset of pocket 0, got ' + JSON.stringify(resets);
    if (w.packs[0].aggro || w.packs[0].holder !== null) return 'the pack still holds aggro';
    if (a.hp !== a.maxHp || b.hp !== b.maxHp) return 'the pack did not heal to full (' + a.hp + ', ' + b.hp + ')';
    if (a.target !== null || b.target !== null) return 'the pack kept its targets';
    if (a.x !== 15 || a.y !== 3 || b.x !== 16 || b.y !== 4) return 'the pack did not walk home: ' + JSON.stringify([[a.x, a.y], [b.x, b.y]]);
    return null;
  },
  /* RO-13 / spec §3.1 #9: every kite / spot candidate lies inside the pack area (a hard filter). */
  'kite-stays-in-area': (M) => {
    const h = hero(M, 1, 9, 3);
    const inst = instOf(M, world(M, [h, mon(M, 2, 0, 11, 3)]));
    const tiles = M.movement.candidateTiles(inst, h, 0, 9, 3, 5);
    if (!tiles.length) return 'no candidates at all';
    const out = tiles.filter(([x, y]) => !M.leash.inArea(inst, 0, x, y));
    if (out.length) return 'candidates outside the pack area: ' + JSON.stringify(out);
    if (tiles.some(([x, y]) => x === 11 && y === 3)) return 'a monster tile is a candidate';
    return null;
  },
};

const MV = 'src/core/hunt/movement.js';
const mutants = [
  { name: 'the plan ignores the leash', case: 'plan-stays-in-area',
    edits: [[MV, 'const veto = (x, y) => !leashAllows(inst, u, x, y) || (avoid ? avoid(x, y) : false);', 'const veto = (x, y) => (avoid ? avoid(x, y) : false);']] },
  { name: 'the step ignores the leash', case: 'monster-never-steps-outside-area',
    edits: [[MV, ' || !leashAllows(inst, u, nx, ny)) {', ') {']] },
  { name: 'the re-route ignores the leash', case: 'reroute-stays-in-area',
    edits: [[MV, 'const p = plan(inst, u, u.goal[0], u.goal[1], (x, y) => cheb({ x, y }, u) <= R && blocks(inst, u, x, y));',
      'const p = astar(inst.grid, u.x, u.y, u.goal[0], u.goal[1], (x, y) => cheb({ x, y }, u) <= R && blocks(inst, u, x, y));']] },
  { name: 'the margin is a constant', case: 'margin-is-per-hunt',
    edits: [['src/core/hunt/leash.js', '  const m = leashMarginOf(inst.ground);', '  const m = 1;']] },
  { name: 'a second module tests the leash', case: 'leash-called-only-from-movement',
    edits: [['src/core/hunt/roles.js', 'import { inArea } from', 'import { inArea, leashAllows } from']] },
  { name: 'a second module moves a unit', case: 'leash-called-only-from-movement',
    edits: [['src/core/hunt/roles.js', 'export function positionHeroes(inst, sc) {', 'export function positionHeroes(inst, sc) { for (const u of inst.world.units) u.x = 0;']] },
  { name: 'the leash reset never runs', case: 'holder-leaves-area-pack-resets-and-heals',
    edits: [['src/core/hunt/world-step.js', 'if (holderOutside(inst, p)) resetPack(inst, p, sc);', 'if (false) resetPack(inst, p, sc);']] },
  { name: 'the reset does not heal', case: 'holder-leaves-area-pack-resets-and-heals',
    edits: [['src/core/hunt/leash.js', '    u.hp = u.maxHp;\n', '']] },
  { name: 'kite tiles may leave the area (soft penalty only)', case: 'kite-stays-in-area',
    edits: [[MV, '    && inArea(inst, pocket, x, y) && !spotTaken(inst, hero, x, y);', '    && !spotTaken(inst, hero, x, y);']] },
];

await suite('hunt-core/leash', cases, mutants);
