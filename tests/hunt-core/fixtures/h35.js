// tests/hunt-core/fixtures/h35.js — lane H3+H5's fixtures (status, XP share, tally; spec §1.6).
//
// `suite35` is fixtures/h1.js `suite` with ASYNC cases and this lane's data
// modules on M (M.statuses, M.huntxp), loaded from the same root as the core,
// so a mutant planted in src/data reaches the case. Builders: a roomy unit
// (HP high enough that no tick ever kills it, whatever damage.js hurt() does),
// a recording sub-step context with a real seeded rng, and a sub-step driver.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCore, plant, makeReport } from './h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

async function loadAll(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.statuses = await imp('src/data/statuses.js');
  M.huntxp = await imp('src/data/hunt-xp.js');
  M.xpcurve = await imp('src/core/xp.js');
  M.styles = await imp('src/core/styles.js');
  return M;
}

/** fixtures/h1.js suite, awaiting each case. Each mutant's case MUST fail on its planted copy. */
export async function suite35(name, cases, mutants) {
  const R = makeReport(name);
  const M = await loadAll(ROOT);
  for (const [cn, fn] of Object.entries(cases)) {
    let why = null;
    try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  for (const mu of mutants || []) {
    const p = plant(mu.edits);
    try {
      let why = null;
      try { why = await cases[mu.case](await loadAll(p.root)); } catch (e) { why = 'threw ' + e.message; }
      R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    } finally { p.done(); }
  }
  if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + (mutants || []).length + ' mutants caught');
  R.finish();
}

export const unit = (M, id, side, o) => M.worldstate.makeUnit(Object.assign(
  { id, side, kind: side === 'hero' ? 'hero' : 'rat', pocket: side === 'hero' ? null : 0, alive: true,
    hp: 100000, maxHp: 100000, x: 2 + id, y: 3 }, o || {}));

export const worldOf = (M, units, o) => {
  const w = M.worldstate.makeWorld(Object.assign({ ground: 'h35_fixture', swing: 0, leader: null }, o || {}));
  w.units = units;
  return w;
};

/** A recording sub-step context on a seeded rng. */
export function ctx35(M, seed, o) {
  const events = [];
  return Object.assign({ atMs: 0, dtMs: 100, swing: 0, rng: M.rng.createRng(M.rng.hashSeed('h35', seed)), events,
    emit: (e) => events.push(e), track() {} }, o || {});
}

/** Run `hook(inst, sc)` for sub-steps [from, from + n), each `each(i)` first; sc.atMs = i x 100. */
export function steps(inst, sc, from, n, hook, each) {
  for (let i = from; i < from + n; i++) {
    sc.atMs = i * 100;
    if (each) each(i);
    hook(inst, sc);
  }
}

/** A JSON round trip of the world through world-state, the settle cut. */
export const cut = (M, w) => M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w))));
