// tests/hunt-core/seam.mjs — THE AGREED EXPORT SIGNATURES (HUNT_SCREEN_SPEC §1.6). Lanes H2-H5 fill their
// modules in parallel without touching world-step.js; this pins every name and arity they build to, the
// PERSISTED shape world-state composes, and that the stubs are inert until filled. Run by run-all.mjs.
import { suite } from './fixtures/h1.js';

/* module → { export: arity }. A lane may ADD exports; changing one of these is a contract edit. */
const SEAM = {
  targeting: { pickTargets: 3, chooseTargets: 2 },
  roles: { positionHeroes: 2 },
  'pull-cycle': { respawnPacks: 2, runPhase: 2, clearCorpses: 2 },
  damage: { hurt: 6, resolveAttacks: 2 },
  abilities: { firstUsable: 3, castAbilities: 2 },
  status: { applyStatus: 5, tickStatuses: 2 },
  consumables: { consume: 2 },
  'xp-share': { shareKillXp: 3 },
  tally: { tallyEvents: 1 },
  movement: { setGoal: 4, clearGoal: 1, stepUnit: 3, moveAll: 2, recordTrail: 1, followTrail: 1, occupancy: 1,
    atRest: 1, unitById: 2, leaderOf: 1, spotTaken: 4, standable: 5, candidateTiles: 6, chooseSpot: 3, dirOf: 2 },
  leash: { inArea: 4, leashAllows: 4, holderOutside: 2, resetPack: 3 },
  'world-state': { makeUnit: 1, makePack: 1, makeWorld: 1, encode: 1, decode: 1, validate: 1, encodedBytes: 1 },
  'world-step': { stepSwing: 2, substepsOf: 1 },
};
const PERSISTS = ['targeting', 'roles', 'pull-cycle', 'damage', 'abilities', 'status', 'consumables', 'xp-share', 'movement'];

const cases = {
  'every-agreed-export-exists': (M) => {
    const bad = [];
    for (const [n, want] of Object.entries(SEAM)) {
      for (const [name, arity] of Object.entries(want)) {
        const f = M.hunt[n][name];
        if (typeof f !== 'function') bad.push(n + '.' + name + ' is missing');
        else if (f.length !== arity) bad.push(n + '.' + name + ' takes ' + f.length + ' arguments, the seam says ' + arity);
      }
    }
    for (const n of PERSISTS) {
      const p = M.hunt[n].PERSISTED;
      if (!p || !Array.isArray(p.unit) || !Array.isArray(p.world) || !Array.isArray(p.pack)) bad.push(n + '.PERSISTED is not { unit, world, pack }');
    }
    return bad.length ? bad.join('; ') : null;
  },
  /* Until its lane lands, a stub moves nothing, emits nothing, deals and pays nothing. */
  'stubs-are-inert': (M) => {
    const H = M.hunt;
    const inst = { world: { units: [], packs: [], trail: [] }, ground: { pockets: [] }, grid: null, occ: null };
    const sc = { atMs: 0, dtMs: 100, emit() { throw new Error('a stub emitted'); }, track() { throw new Error('a stub moved'); } };
    for (const [n, hook] of [['targeting', 'chooseTargets'], ['roles', 'positionHeroes'], ['pull-cycle', 'respawnPacks'],
      ['pull-cycle', 'runPhase'], ['pull-cycle', 'clearCorpses'], ['damage', 'resolveAttacks'], ['abilities', 'castAbilities'],
      ['status', 'tickStatuses'], ['consumables', 'consume']]) H[n][hook](inst, sc);
    H.status.applyStatus(inst, {}, {}, null, sc);
    if (H.targeting.pickTargets(inst, null, {}).length) return 'pickTargets answered a target';
    if (H.abilities.firstUsable(inst, null, sc) !== null) return 'firstUsable answered an ability';
    if (H.damage.hurt(inst, null, 5, null, null, null).dmg !== 0) return 'hurt dealt damage';
    if (Object.keys(H['xp-share'].shareKillXp(inst, {}, sc)).length) return 'shareKillXp paid XP';
    if (Object.keys(H.tally.tallyEvents([]).heroes).length) return 'tallyEvents counted something';
    return null;
  },
};

const mutants = [
  { name: 'a hook loses its sub-step context', case: 'every-agreed-export-exists',
    edits: [['src/core/hunt/roles.js', 'export function positionHeroes(inst, sc) {', 'export function positionHeroes(inst, scx = 0) {']] },
  { name: 'a stub starts dealing damage', case: 'stubs-are-inert',
    edits: [['src/core/hunt/damage.js', 'return { dmg: 0, killed: false };', 'return { dmg: amount, killed: false };']] },
];

await suite('hunt-core/seam', cases, mutants);
