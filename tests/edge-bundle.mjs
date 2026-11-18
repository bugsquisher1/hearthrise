#!/usr/bin/env node
// tests/edge-bundle.mjs — THE EDGE PAYLOAD ONLY SHRINKS, AND THE ENGINE READS MAPS THROUGH ITS OWN INDEX
// (architecture audit 2026-11-18, item 4).
//
//   node tests/edge-bundle.mjs                 the guard
//   node tests/edge-bundle.mjs --report        each function's bytes against its ceiling, and its biggest files
//   node tests/edge-bundle.mjs --raise "<why>" pin an unpinned function, or raise an over-ceiling one, to today's bytes
//                                              with the reason (the only way a ceiling goes up)
//   node tests/edge-bundle.mjs --write         lower every ceiling to today's bytes (never raises), drop a gone function's
//   node tests/edge-bundle.mjs --selftest      planted defects must go red, the clean controls green
//
// mutant-anchors: none — every --selftest case is planted into an in-memory payload, baseline or map index, never the tree
//
// WHY. Every hunt settle loads the hr-accrue payload: tools/pack-edge.mjs walks index.ts's imports and ships every module
// they reach. Nothing stopped a convenient import from dragging a client-only table in, and two had: the crew settle,
// dead since 2027-01-18-dead-surfaces-cut.sql, and the renderer's map index with Havora's scenery (about 96 KB together,
// cut 2026-11-18). This measures the bytes the deploy ships, per function, against a ceiling that moves up only with a
// written reason:
//   EB-1 OVER     a function's payload (pack(), after the hash stamp: the deployed bytes) is over its ceiling
//   EB-2 STALE    it is more than SLACK bytes under it: lock the cut in (--write), so the room a cut freed cannot fill
//                 again without a reason
//   EB-3 REASON   every pin and every raise in a ceiling's history states its own reason (at least MIN_WHY characters,
//                 never an earlier row's reason again); every row has bytes and a date
//   EB-4 PINNED   every edge function has a ceiling, and every ceiling names a function that exists
// and the engine's map index (src/data/world/maps/grids.js) against the renderer's (src/data/world/maps/index.js):
//   EB-5 COVERED  every map a ground names (each *_GROUNDS table in src/data/hunt-grounds.js: what groundOfHunt reads)
//                 resolves in the engine index, so no hunt loses its grid (no grid = the hunt cannot be settled)
//   EB-6 SAME     to the very rows and legend objects the renderer's index holds (===: a copy that agrees today drifts)
//   EB-7 TERRAIN  an engine index entry is { id, rows, legend } and nothing else
//   EB-8 ONE DOOR no edge payload carries the renderer's index
//   EB-9 FLOOR    non-vacuity: at least MIN_GROUND_MAPS ground maps read, the town (training) among them, and hr-accrue
//                 packed with at least MIN_FILES files
//
// BASELINE (tests/edge-bundle.baseline.json): per function, the ceiling's history, newest last; the ceiling is the last
// row's bytes. Written only by --raise and --write. Two lanes that both moved a ceiling conflict on it: take either side
// and run the tool again, never hand-merge. Exit: 0 green, 1 red, 2 harness (a function did not pack).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { pack, functionNames } from '../tools/pack-edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'edge-bundle.baseline.json');
export const SLACK = 4096;
export const MIN_WHY = 16;
const MIN_GROUND_MAPS = 10;
const MIN_FILES = 100;
const MAIN_FN = 'hr-accrue';
const TOWN_MAP = 'town_common';
/* The renderer's index as pack-edge names it in a payload (src/data/* ships under vendor/data/*). */
export const RENDERER_INDEX = 'vendor/data/world/maps/index.js';

/** Each edge function's payload: { fn: { bytes, files: [{ name, bytes }] } }, or { problems } when one does not pack. */
export async function measure() {
  const out = {};
  const problems = [];
  for (const fn of (await functionNames()).sort()) {
    const r = await pack(fn);
    if (r.problems.length) { problems.push(...r.problems.map((p) => `[${fn}] ${p}`)); continue; }
    const files = r.files.map((f) => ({ name: f.name, bytes: Buffer.byteLength(f.content) }));
    out[fn] = { bytes: files.reduce((s, f) => s + f.bytes, 0), files };
  }
  return { measured: out, problems };
}

/** The maps every ground names, and the two indexes' rows for them. */
export async function readMaps() {
  const HG = await import('../src/data/hunt-grounds.js');
  const { gridMapOf } = await import('../src/data/world/maps/grids.js');
  const { mapRowOf } = await import('../src/data/world/maps/index.js');
  const ids = new Set();
  for (const [name, table] of Object.entries(HG)) {
    if (!/_GROUNDS$/.test(name) || !table || typeof table !== 'object') continue;
    for (const g of Object.values(table)) if (g && typeof g.map === 'string') ids.add(g.map);
  }
  return { groundMapIds: [...ids].sort(), engineOf: gridMapOf, rendererOf: mapRowOf };
}

export function readBaseline() {
  return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { ceilings: {} };
}

const ceilingOf = (rows) => (Array.isArray(rows) && rows.length ? rows[rows.length - 1].bytes : null);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

/** Every problem with `measured` against `baseline` and the two map indexes. Pure. */
export function verdict({ measured, baseline, maps }) {
  const problems = [];
  const ceilings = (baseline && baseline.ceilings) || {};

  for (const [fn, rows] of Object.entries(ceilings)) {
    if (!measured[fn]) problems.push(`EB-4 ${fn} has a ceiling but no edge function: run node tests/edge-bundle.mjs --write to drop it`);
    if (!Array.isArray(rows) || !rows.length) { problems.push(`EB-3 ${fn}'s ceiling has no history rows`); continue; }
    const seen = new Set();
    rows.forEach((r, i) => {
      const why = typeof r.why === 'string' ? r.why.trim() : '';
      if (!Number.isInteger(r.bytes) || r.bytes <= 0) problems.push(`EB-3 ${fn} row ${i + 1}: bytes must be a positive integer`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.on || ''))) problems.push(`EB-3 ${fn} row ${i + 1}: no date (on: YYYY-MM-DD)`);
      const raise = i === 0 || r.bytes > rows[i - 1].bytes;
      if (raise && why.length < MIN_WHY) {
        problems.push(`EB-3 ${fn} row ${i + 1} ${i === 0 ? 'pins' : 'raises'} the ceiling to ${r.bytes} with no reason `
          + `(at least ${MIN_WHY} characters): raise only with node tests/edge-bundle.mjs --raise "<what grew and why>"`);
      } else if (raise && seen.has(why.toLowerCase())) {
        problems.push(`EB-3 ${fn} row ${i + 1} raises the ceiling on an earlier row's reason ("${why}"): each raise names its own`);
      }
      if (why) seen.add(why.toLowerCase());
    });
  }

  for (const [fn, m] of Object.entries(measured)) {
    const ceiling = ceilingOf(ceilings[fn]);
    if (ceiling === null) {
      problems.push(`EB-4 ${fn} (${m.bytes} bytes) has no ceiling: pin it with node tests/edge-bundle.mjs --raise "<why>"`);
      continue;
    }
    if (m.bytes > ceiling) {
      problems.push(`EB-1 ${fn} ships ${m.bytes} bytes, ${m.bytes - ceiling} over its ceiling of ${ceiling} (${kb(ceiling)}). `
        + 'Find what the edge newly reaches (node tests/edge-bundle.mjs --report; node tools/pack-edge.mjs ' + fn + ' --check). '
        + 'If it belongs there, raise it with node tests/edge-bundle.mjs --raise "<what grew and why>".');
    } else if (m.bytes < ceiling - SLACK) {
      problems.push(`EB-2 ${fn} ships ${m.bytes} bytes, ${ceiling - m.bytes} under its ceiling of ${ceiling} (slack ${SLACK}): `
        + 'lock the cut in with node tests/edge-bundle.mjs --write');
    }
    if (m.files.some((f) => f.name === RENDERER_INDEX)) {
      problems.push(`EB-8 ${fn} ships ${RENDERER_INDEX}, the renderer's map index with every map's scenery. The engine reads `
        + 'maps through src/data/world/maps/grids.js (src/core/hunt-ground.js); find the import that reaches index.js and point it there.');
    }
  }
  const main = measured[MAIN_FN];
  if (!main || main.files.length < MIN_FILES) {
    problems.push(`EB-9 ${MAIN_FN} packed ${main ? main.files.length : 0} file(s), under ${MIN_FILES}: the measure is reading the wrong tree`);
  }

  const { groundMapIds, engineOf, rendererOf } = maps;
  if (groundMapIds.length < MIN_GROUND_MAPS || !groundMapIds.includes(TOWN_MAP)) {
    problems.push(`EB-9 only ${groundMapIds.length} ground map(s) read${groundMapIds.includes(TOWN_MAP) ? '' : `, ${TOWN_MAP} not among them`}: `
      + 'the *_GROUNDS tables of src/data/hunt-grounds.js are not being read');
  }
  for (const id of groundMapIds) {
    const e = engineOf(id);
    const r = rendererOf(id);
    if (!e) {
      problems.push(`EB-5 a ground is fought on map ${id}, which src/data/world/maps/grids.js does not hold: its hunt has no grid `
        + 'and settles nothing. Add its row there.');
      continue;
    }
    const keys = Object.keys(e).sort().join(',');
    if (keys !== 'id,legend,rows' || e.id !== id) {
      problems.push(`EB-7 the engine index's ${id} carries {${keys}}${e.id !== id ? ` as id ${e.id}` : ''}: an entry is { id, rows, legend } and nothing else`);
    }
    if (!r) {
      problems.push(`EB-6 the renderer's index has no map ${id}: nothing draws the ground a hunt is fought on`);
    } else if (e.rows !== r.rows || e.legend !== r.legend) {
      problems.push(`EB-6 the engine index's ${id} ${e.rows !== r.rows ? 'rows are' : 'legend is'} not the renderer's own: the grid `
        + 'the server walks and the ground the client draws can drift. Take both from the map\'s one source.');
    }
  }
  return problems;
}

function report(measured, baseline) {
  for (const [fn, m] of Object.entries(measured)) {
    const ceiling = ceilingOf((baseline.ceilings || {})[fn]);
    console.log(`${fn}: ${m.bytes} bytes (${kb(m.bytes)}), ${m.files.length} files; ceiling ${ceiling ?? 'none'}`
      + (ceiling === null ? '' : ` (${m.bytes - ceiling >= 0 ? '+' : ''}${m.bytes - ceiling})`));
    for (const f of [...m.files].sort((a, b) => b.bytes - a.bytes).slice(0, 15)) console.log(`  ${String(f.bytes).padStart(8)}  ${f.name}`);
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** --raise and --write. Returns the new baseline; never raises without `why`, never lowers on --raise. */
export function rewrite(measured, baseline, { raiseWhy = null, on = today() } = {}) {
  const ceilings = { ...((baseline && baseline.ceilings) || {}) };
  const notes = [];
  for (const fn of Object.keys(ceilings)) {
    if (!measured[fn] && raiseWhy === null) { delete ceilings[fn]; notes.push(`${fn}: dropped (no such function)`); }
  }
  for (const [fn, m] of Object.entries(measured)) {
    const rows = Array.isArray(ceilings[fn]) ? ceilings[fn] : [];
    const ceiling = ceilingOf(rows);
    if (raiseWhy !== null && (ceiling === null || m.bytes > ceiling)) {
      ceilings[fn] = [...rows, { bytes: m.bytes, on, why: raiseWhy }];
      notes.push(`${fn}: ${ceiling === null ? 'pinned' : 'raised'} to ${m.bytes}${ceiling === null ? '' : ` (+${m.bytes - ceiling})`}`);
    } else if (raiseWhy === null && ceiling !== null && m.bytes < ceiling) {
      ceilings[fn] = [...rows, { bytes: m.bytes, on, why: `cut locked in (${ceiling - m.bytes} bytes)` }];
      notes.push(`${fn}: lowered to ${m.bytes} (-${ceiling - m.bytes})`);
    }
  }
  return { baseline: { ...baseline, ceilings: Object.fromEntries(Object.entries(ceilings).sort(([a], [b]) => (a < b ? -1 : 1))) }, notes };
}

function selftest(measured, maps) {
  const atCeiling = { ceilings: Object.fromEntries(Object.entries(measured).map(([fn, m]) => [fn, [{ bytes: m.bytes, on: '2026-11-18', why: 'the first pin of this function' }]])) };
  const main = measured[MAIN_FN];
  const withBytes = (fn, bytes) => ({ ...measured, [fn]: { ...measured[fn], bytes } });
  const withRows = (fn, rows) => ({ ceilings: { ...atCeiling.ceilings, [fn]: rows } });
  const pin = atCeiling.ceilings[MAIN_FN][0];
  const realFile = (p) => readFileSync(join(ROOT, p), 'utf8');
  /* the renderer's index pulled back into the payload, with Havora's scenery: the real bytes of the files it would bring */
  const back = ['src/data/world/maps/index.js', 'src/data/world/maps/town_common.js', 'src/data/world/town/sites.js', 'src/data/world/stations.js'];
  const extra = back.map((p) => ({ name: 'vendor/' + p.slice(4), bytes: Buffer.byteLength(realFile(p)) }));
  const pulledBack = { ...measured, [MAIN_FN]: { files: [...main.files, ...extra], bytes: main.bytes + extra.reduce((s, f) => s + f.bytes, 0) } };
  const engineWith = (id, entry) => (x) => (x === id ? entry : maps.engineOf(x));
  const slake = maps.engineOf('the_slake');
  const town = maps.engineOf(TOWN_MAP);
  const cellarWhole = maps.rendererOf('mill_cellar');
  const cases = [
    ['clean: every function at its ceiling', { measured, baseline: atCeiling, maps }, null],
    ['one byte over the ceiling', { measured: withBytes(MAIN_FN, main.bytes + 1), baseline: atCeiling, maps }, 'EB-1'],
    ['a cut inside the slack is allowed', { measured: withBytes(MAIN_FN, main.bytes - SLACK), baseline: atCeiling, maps }, null],
    ['a cut past the slack, not locked in', { measured: withBytes(MAIN_FN, main.bytes - SLACK - 1), baseline: atCeiling, maps }, 'EB-2'],
    ['a raise with no reason', { measured, baseline: withRows(MAIN_FN, [{ ...pin, bytes: main.bytes - 100 }, { bytes: main.bytes, on: '2026-11-19', why: '' }]), maps }, 'EB-3'],
    ['a raise on an earlier reason', { measured, baseline: withRows(MAIN_FN, [{ ...pin, bytes: main.bytes - 100 }, { bytes: main.bytes, on: '2026-11-19', why: pin.why }]), maps }, 'EB-3'],
    ['a lowering row needs no new reason', { measured, baseline: withRows(MAIN_FN, [{ ...pin, bytes: main.bytes + 100 }, { bytes: main.bytes, on: '2026-11-19', why: 'cut locked in' }]), maps }, null],
    ['a function with no ceiling', { measured, baseline: { ceilings: Object.fromEntries(Object.entries(atCeiling.ceilings).filter(([fn]) => fn !== MAIN_FN)) }, maps }, 'EB-4'],
    ['a ceiling for a function that is gone', { measured, baseline: withRows('hr-gone', [pin]), maps }, 'EB-4'],
    ["the renderer's map index back in the payload", { measured: pulledBack, baseline: atCeiling, maps }, 'EB-8'],
    ['... and its bytes over the ceiling', { measured: pulledBack, baseline: atCeiling, maps }, 'EB-1'],
    ["a ground's map missing from the engine index", { measured, baseline: atCeiling, maps: { ...maps, engineOf: engineWith('the_slake', null) } }, 'EB-5'],
    ['the engine index holds a copy of the town legend', { measured, baseline: atCeiling, maps: { ...maps, engineOf: engineWith(TOWN_MAP, { ...town, legend: { ...town.legend } }) } }, 'EB-6'],
    ['the engine index holds a copy of a ground pack\'s rows', { measured, baseline: atCeiling, maps: { ...maps, engineOf: engineWith('the_slake', { ...slake, rows: [...slake.rows] }) } }, 'EB-6'],
    ['the engine index carries a map whole', { measured, baseline: atCeiling, maps: { ...maps, engineOf: engineWith('mill_cellar', cellarWhole) } }, 'EB-7'],
    ['the ground tables not read', { measured, baseline: atCeiling, maps: { ...maps, groundMapIds: maps.groundMapIds.filter((id) => id !== TOWN_MAP).slice(0, 3) } }, 'EB-9'],
    ['hr-accrue barely packed', { measured: { ...measured, [MAIN_FN]: { files: main.files.slice(0, 3), bytes: main.bytes } }, baseline: atCeiling, maps }, 'EB-9'],
  ];
  let bad = 0;
  for (const [name, input, want] of cases) {
    const got = verdict(input);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got[0] ? got[0].slice(0, 110) : 'GREEN'} (want ${want || 'GREEN'})`);
  }
  /* the writer: --raise never lowers, --write never raises, and neither moves without the other's condition */
  const up = withBytes(MAIN_FN, main.bytes + 10);
  const down = withBytes(MAIN_FN, main.bytes - 10);
  const writes = [
    ['--write does not raise', rewrite(up, atCeiling).baseline, (b) => ceilingOf(b.ceilings[MAIN_FN]) === main.bytes],
    ['--write lowers', rewrite(down, atCeiling).baseline, (b) => ceilingOf(b.ceilings[MAIN_FN]) === main.bytes - 10],
    ['--raise raises with its reason', rewrite(up, atCeiling, { raiseWhy: 'a planted growth to raise' }).baseline,
      (b) => ceilingOf(b.ceilings[MAIN_FN]) === main.bytes + 10 && verdict({ measured: up, baseline: b, maps }).length === 0],
    ['--raise does not lower', rewrite(down, atCeiling, { raiseWhy: 'a planted growth to raise' }).baseline, (b) => ceilingOf(b.ceilings[MAIN_FN]) === main.bytes],
  ];
  for (const [name, b, test] of writes) {
    const ok = test(b);
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name}`);
  }
  const total = cases.length + writes.length;
  if (bad) { console.error(`✗ edge-bundle --selftest: ${bad} of ${total} case(s) wrong`); return 1; }
  console.log(`✓ edge-bundle --selftest: all ${total} cases behave`);
  return 0;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const { measured, problems: packProblems } = await measure();
  if (packProblems.length) {
    for (const p of packProblems) console.error('✗ HARNESS ' + p);
    console.error('✗ edge-bundle: a function did not pack (node tools/pack-edge.mjs --check names it)');
    process.exit(2);
  }
  const maps = await readMaps();
  if (args.includes('--selftest')) process.exit(selftest(measured, maps));
  const baseline = readBaseline();
  const raiseAt = args.indexOf('--raise');
  if (raiseAt >= 0 || args.includes('--write')) {
    const raiseWhy = raiseAt >= 0 ? String(args[raiseAt + 1] || '').trim() : null;
    if (raiseWhy !== null && raiseWhy.length < MIN_WHY) {
      console.error(`✗ --raise needs its reason: node tests/edge-bundle.mjs --raise "<what grew and why, at least ${MIN_WHY} characters>"`);
      process.exit(1);
    }
    const { baseline: next, notes } = rewrite(measured, baseline, { raiseWhy });
    writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(notes.length ? notes.join('\n') : 'edge-bundle: no ceiling moved');
  }
  if (args.includes('--report')) report(measured, readBaseline());
  const problems = verdict({ measured, baseline: readBaseline(), maps });
  for (const p of problems) console.error('✗ ' + p);
  if (problems.length) process.exit(1);
  const ceilings = readBaseline().ceilings;
  console.log(`✓ edge-bundle: ${Object.entries(measured).map(([fn, m]) => `${fn} ${m.bytes} of ${ceilingOf(ceilings[fn])} bytes`).join(', ')}; `
    + `${maps.groundMapIds.length} ground maps read through the engine's own index`);
}
