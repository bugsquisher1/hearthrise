// tests/hunt-core/fixtures/h2.js — lane H2's fixtures (targeting, roles, pull cycle, damage).
// Builds on fixtures/h1.js (its map, ground and unit builders) without changing it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hero, mon, world, groundRow, gridOf, loadCore, plant, makeReport, ROOT } from './h1.js';

export { groundRow, gridOf, subStep, mon, world } from './h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

/** h1's loadCore plus what lane H2 also reads: hunt-spawn, hunt-roles, combat-sim's MONSTERS row helpers. */
async function loadCore2(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.hs = await imp('src/core/hunt-spawn.js');
  M.roleData = await imp('src/data/hunt-roles.js');
  M.monData = await imp('src/data/monsters.js');
  M.sessions = await imp('src/data/hunt-sessions.js');
  return M;
}

/** h1's suite (cases on the repo, every mutant on a planted copy must be caught) with loadCore2. */
export async function suite(name, cases, mutants) {
  const R = makeReport(name);
  const M = await loadCore2(ROOT);
  for (const [cn, fn] of Object.entries(cases)) {
    let why = null;
    try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  for (const mu of mutants || []) {
    if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
    const p = plant(mu.edits);
    try {
      let why = null;
      try { why = cases[mu.case](await loadCore2(p.root)); } catch (e) { why = 'threw ' + e.message; }
      /* H2_WHY=1 prints what each mutant tripped, so a mutant caught only by a syntax error shows. */
      if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
      R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    } finally { p.done(); }
  }
  if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + (mutants || []).length + ' mutants caught');
  R.finish();
}

/* A hero with a role and a combat snapshot: hits every swing for 1..maxHit. */
export const H = (M, id, x, y, role, o) => hero(M, id, x, y, Object.assign({
  kind: role, role, dist: 1, chase: true, tmode: 'nearest', stance: 'balanced', acc: 1000, maxHit: 6, def: 0,
  hp: 200, maxHp: 200, speed: 3200 }, o || {}));

/* An engaged monster (it holds `target`). */
export const E = (M, id, pocket, x, y, target, o) => mon(M, id, pocket, x, y, Object.assign({ target }, o || {}));

/** The instance a hook sees, with world-state.makeUnit handed in as world-step does. */
export const inst2 = (M, w, ground) => ({ world: w, ground: ground || groundRow(), grid: gridOf(M), occ: null,
  makeUnit: M.worldstate.makeUnit });

/* Four seats in the corridor, west end. */
export const PARTY_GROUND = () => groundRow({ start: [[2, 8], [3, 8], [4, 8], [5, 8]] });

/** A seeded rng (the swing's `s` stream). */
export const rngOf = (M, seed) => M.rng.createRng(M.rng.hashSeed('h2', seed));

/** A sub-step context that records events, with an rng. */
export function sc2(M, seed, atMs) {
  const events = [];
  return { atMs: atMs || 0, dtMs: 100, swing: 0, rng: rngOf(M, seed || 1), events, emit: (e) => events.push(e), track: () => {} };
}

/** Run every world hook in world-step's order for n sub-steps (the phase AI, movement, attacks, corpses). */
export function run(M, inst, n, sc, each) {
  const H2 = M.hunt;
  for (let i = 0; i < n; i++) {
    M.movement.occupancy(inst);
    M.movement.recordTrail(inst);
    H2['pull-cycle'].respawnPacks(inst, sc);
    H2['pull-cycle'].runPhase(inst, sc);
    H2.targeting.chooseTargets(inst, sc);
    H2.roles.positionHeroes(inst, sc);
    M.movement.followTrail(inst);
    M.movement.moveAll(inst, sc);
    for (let p = 0; p < inst.world.packs.length; p++) if (M.leash.holderOutside(inst, p)) M.leash.resetPack(inst, p, sc);
    H2.damage.resolveAttacks(inst, sc);
    H2['pull-cycle'].clearCorpses(inst, sc);
    if (each && each(i) === false) return i;
    sc.atMs += sc.dtMs;
  }
  return n;
}

/** A fresh party world on the fixture ground: `party` is [{ role, ...snapshot/settings }]. */
export function partyWorld(M, party, ground) {
  const g = ground || PARTY_GROUND();
  const w = M.hs.newHuntWorld(g, gridOf(M), party.map((p) => Object.assign({ maxHp: 200, acc: 1000, maxHit: 12, def: 0 }, p)));
  return inst2(M, w, g);
}

export { hero, gridOf as grid };
