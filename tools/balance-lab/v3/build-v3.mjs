#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-lab/v3/build-v3.mjs — BALANCE LAB v3, THE GLOBAL BALANCE DASHBOARD (Tyler 2026-11-21, 40-formula-brief sections 5-7;
// lane/c-balance-matrix). One publishable folder: a page and its worker.
//
//   node tools/balance-lab/v3/build-v3.mjs [--out DIR]      default tools/balance-lab/v3/dist (gitignored: rebuild, never commit)
//   node tools/balance-lab/v3/build-v3.mjs --engine DIR     the bundle alone (worker.js + engine-v3.mjs), for tools/balance-lab/parity.mjs
//
// Writes:
//   index.html   the page (v3/page.html) with the Charcoal and Gold tokens of src/styles/tokens.css inlined (the default theme's
//                resolved values) and its data inlined as JSON: the knob list (tools/balance-program/formulas/knobs.json), the LIVE cells
//                (matrix-plan.mjs RUNS.live, resolved by tools/balance-sim/cell.mjs resolveOnly, so the browser plays the matrix's own
//                seats), the calibration cell and the real Krell hunt, and the PRECOMPUTED sweeps (tools/balance-program/balance-sweeps.json,
//                each knob at each step on the 207-cell subset), each step as every cell's change of every section 6 metric
//   worker.js    a CLASSIC script: the engine (v2's bundling, tools/balance-lab/build.mjs collect) from tools/balance-lab/v3/lab-v3.mjs,
//                with every knob's numbers read from the knob settings the lab is CREATED with (`__hrK`: knob-rules.mjs knobValue, the
//                rounding the matrix's scratch copy writes). In a worker it waits for { type: 'init', knobs }; on a page with no workers
//                it leaves globalThis.HearthriseLabV3 = { create(knobs) }.
//   engine-v3.mjs  (--engine) the same registry as an ES module: create(knobs) for node.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../../tests/_is-main.mjs';
import { collect } from '../build.mjs';
import { readKnobs, locateKnob } from '../../balance-program/matrix-scratch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const ENTRY = 'tools/balance-lab/v3/lab-v3.mjs';
const KNOB_RULES = 'tools/balance-program/knob-rules.mjs';
const noNul = (t) => t.split(String.fromCharCode(0)).join('\\u0000');
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

/* ── THE KNOB NUMBERS, READ FROM THE SETTINGS: every live knob's picks become __hrK([knob ids], "the number as written", float) ──────── */
export function knobInstrumenter(root = ROOT) {
  const list = readKnobs(root);
  const byFile = new Map();
  let picks = 0;
  for (const k of list.knobs) for (const site of locateKnob(root, k)) {
    const f = byFile.get(site.file) || byFile.set(site.file, new Map()).get(site.file);
    const line = f.get(site.line) || f.set(site.line, new Map()).get(site.line);
    for (const p of site.picks) {
      const q = line.get(p.index) || line.set(p.index, { value: p.value, float: false, ids: [] }).get(p.index);
      if (!q.ids.includes(k.id)) q.ids.push(k.id);
      q.float = q.float || p.float;
    }
  }
  const instrument = (id, src) => {
    const f = byFile.get(id);
    if (!f) return src;
    const lines = src.split('\n');
    for (const [ln, at] of f) {
      let t = lines[ln - 1];
      for (const [idx, q] of [...at].sort((a, b) => b[0] - a[0])) {
        if (t.slice(idx, idx + q.value.length) !== q.value) throw new Error('lab v3 build: ' + id + ':' + ln + ' no longer holds ' + q.value + ' where ' + q.ids.join('+') + ' reads it');
        t = t.slice(0, idx) + '__hrK(' + JSON.stringify(q.ids) + ', ' + JSON.stringify(q.value) + ', ' + q.float + ')' + t.slice(idx + q.value.length);
        picks++;
      }
      lines[ln - 1] = t;
    }
    return lines.join('\n');
  };
  return { instrument, files: [...byFile.keys()], count: () => picks };
}

/* the registry as a FACTORY: each create(knobs) is a fresh set of module instances whose knob numbers read those settings */
function factory(modules) {
  const defs = modules.map(({ id, code }) => JSON.stringify(id) + ': function (exports, __req, module) {\n' + code + '\n}').join(',\n');
  return 'function __makeLab(__knobs) {\n'
    + '  function __hrK(ids, text, float) {\n'
    + '    let m = 1;\n'
    + '    for (const k of ids) { const v = __knobs && __knobs[k]; if (typeof v === "number" && isFinite(v) && v > 0) m *= v; }\n'
    + '    return m === 1 ? Number(text) : Number(__req(' + JSON.stringify(KNOB_RULES) + ').knobValue(text, m, float));\n'
    + '  }\n'
    + '  const __defs = {\n' + defs + '\n};\n'
    + '  const __cache = Object.create(null);\n'
    + '  function __req(id) {\n'
    + '    const hit = __cache[id]; if (hit) return hit.exports;\n'
    + '    const def = __defs[id]; if (!def) throw new Error("balance-lab v3 bundle: no module " + id);\n'
    + '    const module = { exports: {} }; __cache[id] = module;\n'
    + '    def.call(module.exports, module.exports, __req, module);\n'
    + '    return module.exports;\n'
    + '  }\n'
    + '  return __req(' + JSON.stringify(ENTRY) + ');\n'
    + '}\n';
}

/** The engine bundle: { worker, engine, stamp }. */
export function bundleV3(root = ROOT) {
  const BUILD_VERSION = (readFileSync(join(root, 'src/build-info.js'), 'utf8').match(/version:\s*'([^']+)'/) || [])[1] || '?';
  const kn = knobInstrumenter(root);
  const graph = collect([ENTRY], { instrument: kn.instrument });
  const stamp = { version: BUILD_VERSION, hash: graph.hash, built: new Date().toISOString(), modules: graph.modules.length, knobPicks: kn.count(), knobFiles: kn.files.length };
  const head = (what) => '// tools/balance-lab/v3/dist/' + what + ' — GENERATED by tools/balance-lab/v3/build-v3.mjs from the game\'s own src/core + src/data at v' + stamp.version
    + ' (sources ' + stamp.hash + ', ' + stamp.knobPicks + ' knob numbers read from the settings). Do not edit; rebuild.\n';
  const reg = factory(graph.modules);
  const worker = head('worker.js') + '(function () {\n"use strict";\n' + reg
    + 'globalThis.__HEARTHRISE_LAB_V3__ = ' + JSON.stringify(stamp) + ';\n'
    + 'const inWorker = typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;\n'
    + 'if (inWorker) {\n'
    + '  let lab = null;\n'
    + '  self.onmessage = (e) => {\n'
    + '    const m = e.data || {};\n'
    + '    if (m.type === "init") {\n'
    + '      try { lab = __makeLab(m.knobs || {}); self.postMessage({ type: "ready", id: m.id, started: lab.start(m.knobs || {}), bundle: globalThis.__HEARTHRISE_LAB_V3__ }); }\n'
    + '      catch (err) { self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) }); }\n'
    + '      return;\n'
    + '    }\n'
    + '    if (!lab) { self.postMessage({ type: "error", id: m.id, message: "lab v3: init first" }); return; }\n'
    + '    lab.handle(m, (x) => self.postMessage(x));\n'
    + '  };\n'
    + '} else if (typeof window !== "undefined") globalThis.HearthriseLabV3 = { create: __makeLab, bundle: globalThis.__HEARTHRISE_LAB_V3__ };\n'
    + '})();\n';
  const engine = head('engine-v3.mjs') + reg + 'export const BUNDLE = Object.freeze(' + JSON.stringify(stamp) + ');\n'
    + 'export function create(knobs) { const lab = __makeLab(knobs || {}); lab.start(knobs || {}); return lab; }\n';
  return { worker: noNul(worker), engine: noNul(engine), stamp };
}

/* ── THE TOKENS: the default theme's resolved custom properties (src/styles/tokens.css: :root and body[data-theme="hearthlight"], in order) ── */
export function themeTokens(root = ROOT) {
  const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(',').map((s) => s.trim());
    if (!sels.some((s) => s === ':root' || s === 'body[data-theme="hearthlight"]')) continue;
    for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out.set(d[1], d[2].trim());
  }
  return ':root {\n' + [...out].map(([k, v]) => '  --' + k + ': ' + v + ';').join('\n') + '\n}\n';
}

/* ── THE PAGE'S DATA ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const permille = (a, b) => (typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b) && a !== 0 ? Math.round(((b - a) / Math.abs(a)) * 1000) : b === a ? 0 : null);
/* the metrics that sit at zero in most cells (a death rate, time under a share of HP): a step keeps their AFTER value, not a change from zero */
export const ABS_METRICS = Object.freeze(['deathsPer1000h', 'hpUnder30', 'hpUnder10']);
const sig4 = (v) => (typeof v === 'number' && isFinite(v) ? Number(v.toPrecision(4)) : null);
const BAND_ROWS = 80;
export async function pageData(root = ROOT) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const PG = await imp('tools/balance-program/progression-grid.mjs');
  const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
  const MP = await imp('tools/balance-program/matrix-plan.mjs');
  const BM = await imp('tools/balance-program/balance-matrix.mjs');
  const CAL = await imp('tools/balance-program/matrix-calibration.mjs');
  const { METRICS } = await imp('tools/balance-program/matrix-metrics.mjs');
  const { STYLE_GROUPS } = await imp('tools/balance-program/knob-rules.mjs');
  const STD = await imp('tools/balance-program/standards.mjs');
  const D = await PG.loadGridData(root), K = await loadKits(root);
  const list = readKnobs(root);
  /* THE LIVE CELLS, resolved: the seats cell.mjs would field for each, answered by the matrix's own worker processes (cell.resolveOnly; a
     cell runner in this process would register the staged rows a second time beside the kit builder's) */
  const plan = MP.planMatrix(D, K, MP.RUNS.live);
  const cal = await CAL.calibrationJobs(D, K, root, { seeds: 1, hours: MP.RUNS.live.hours });
  const harness = cal.jobs.find((j) => j.key === 'CAL:harness');
  const jobs = [...plan.jobs, harness].map((j) => ({ ...j, cell: { ...j.cell, resolveOnly: true } }));
  const { results, errors } = await BM.playJobs(jobs, root, 4);
  if (errors.length) throw new Error('lab v3 build: a live cell did not resolve: ' + errors[0].id + ' ' + errors[0].error);
  const resolvedOf = (j) => results[j.id];
  const jobOf = new Map(plan.jobs.map((j) => [j.key, j]));
  /* `projected`: the placeholder floor a PROJECTED cell re-derives its rows at under the knobs (lab-v3.mjs liveWhatIf) */
  const { projectedFloor } = await imp('tools/balance-program/grid-project.mjs');
  const projOf = (c) => (c.stretch === 'PROJECTED' ? { floor: projectedFloor(c.L) } : null);
  const live = plan.cells.map((c) => { const j = jobOf.get(c.key); return { key: c.key, block: c.block, L: c.L, gear: c.gear, party: c.party, comp: c.comp, tier: c.tier, ground: c.ground,
    styles: c.styles, stretch: c.stretch, projected: projOf(c), hours: MP.RUNS.live.hours, resolved: resolvedOf(j), whatIf: j.whatIf || null }; });
  const calibration = { key: 'CAL:harness', L: 85, tier: 'deadly', projected: null, styles: ['tank', 'healer', 'bow', 'mage'], hours: MP.RUNS.live.hours, resolved: resolvedOf(harness), whatIf: harness.whatIf || null };
  /* THE PRECOMPUTED SWEEPS, each step as every cell's change of every metric (permille), the band rows it moved, its calibration row */
  const sw = existsSync(BM.SWEEP_FILE) ? JSON.parse(readFileSync(BM.SWEEP_FILE, 'utf8')) : null;
  let pre = null;
  if (sw) {
    const nM = METRICS.length;
    const knobs = {};
    for (const [id, k] of Object.entries(sw.knobs)) {
      knobs[id] = { label: k.label, group: k.group, steps: {} };
      for (const [m, st] of Object.entries(k.steps)) {
        const d = {}, seats = {};
        for (const [key, row] of Object.entries(st.cells)) {
          const b = sw.baseline[key];
          if (!b) continue;
          const dk = row.slice(0, nM).map((v, i) => (ABS_METRICS.includes(METRICS[i][0]) ? sig4(v) : permille(b[i], v)));
          /* a cell the step did not move is left out (the page reads it as unchanged) */
          const still = dk.every((v, i) => (ABS_METRICS.includes(METRICS[i][0]) ? v === sig4(b[i]) : v === 0)) && JSON.stringify(row[nM]) === JSON.stringify(b[nM]);
          if (still) continue;
          d[key] = dk;
          seats[key] = row[nM];
        }
        /* THE BANDS IT MOVED, small enough for a phone: per band group how many rows moved toward their range and how many away (the page
           flags them against the groups ticked as targets), and the rows themselves, status changes first, at most BAND_ROWS */
        const F = Object.fromEntries((sw.bandFields || []).map((f, i) => [f, i]));
        const counts = {};
        for (const b of st.bands) { const g = b[F.group] || 'other', c = counts[g] || (counts[g] = [0, 0]); c[b[F.direction] === 'toward' ? 0 : 1]++; }
        const rank = (b) => (b[F.statusBefore] !== b[F.statusAfter] ? 0 : 1);
        const rows = [...st.bands].sort((a, b) => rank(a) - rank(b)).slice(0, BAND_ROWS)
          .map((b) => [b[F.way], b[F.band], b[F.group], b[F.at], sig4(b[F.before]), sig4(b[F.after]), b[F.statusBefore], b[F.statusAfter], b[F.direction] === 'toward' ? 1 : 0]);
        knobs[id].steps[m] = { d, seats, bandCounts: counts, bandRows: rows, bandTotal: st.bands.length, calibration: st.calibration, applied: st.applied };
      }
    }
    /* STALE only when the tree moved AND its baseline moved: a sweep measured on an earlier tree whose subset plays cell for cell the same
       numbers today (balance-matrix-subset.json, fresh on this tree) still reads true; the page says which */
    const hashNow = BM.matrixHash(root), cache = BM.readCache(BM.SUBSET_FILE);
    const cacheFresh = cache && cache.hash === hashNow;
    const sameBaseline = sw.hash === hashNow || (cacheFresh && JSON.stringify(BM.compactCells(cache.cells)) === JSON.stringify(sw.baseline));
    pre = { run: sw.run, at: sw.at, commits: sw.commits || [sw.commit], hash: sw.hash, stale: !sameBaseline, sameTree: sw.hash === hashNow, githubRun: sw.githubRun || null, seeds: sw.seeds, hours: sw.hours,
      bandFields: sw.bandFields, cells: sw.cells, baseline: sw.baseline, baselineBands: sw.baselineBands || [], calibration: sw.calibration, knobs };
  }
  const bandGroups = Object.fromEntries(STD.BANDS.filter((b) => b.group).map((b) => [b.id, b.group]));
  return {
    stamp: { commit: commitOf(), built: new Date().toISOString().slice(0, 16) + 'Z', matrixHash: BM.matrixHash(root) },
    knobs: list.knobs.map((k) => ({ id: k.id, label: k.label, group: k.group, what: k.what, steps: k.steps, ruled: k.ruled || null, regen: !!k.regen, formula: k.formula || null,
      sharesLineWith: k.sharesLineWith || [], sites: locateKnob(root, k).map((s) => s.file + ':' + s.line) })),
    planned: list.planned.map((p) => ({ id: p.id, label: p.label, group: p.group, arrivesWith: p.arrivesWith, what: p.what })),
    metrics: METRICS.map(([id, label, scope]) => ({ id, label, scope, abs: ABS_METRICS.includes(id) })), styleGroups: STYLE_GROUPS, bandGroups,
    live: { levels: MP.RUNS.live.levels, hours: MP.RUNS.live.hours, cells: live, calibration },
    real: CAL.KRELL_2026_11_20, precomputed: pre,
  };
}

/** The publishable folder: index.html and worker.js. */
export async function buildV3(outDir = join(HERE, 'dist'), root = ROOT) {
  const t0 = Date.now();
  const b = bundleV3(root);
  const data = await pageData(root);
  data.stamp.engine = b.stamp;
  const page = readFileSync(join(HERE, 'page.html'), 'utf8')
    .replace('/*@TOKENS@*/', () => themeTokens(root))
    .replace('<!--@DATA@-->', () => '<script type="application/json" id="lab-data">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>');
  /* the page's own script must parse (a broken page publishes as a blank one) */
  const { Script } = await import('node:vm');
  for (const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(m[1], { filename: 'v3/page.html' });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), page);
  writeFileSync(join(outDir, 'worker.js'), b.worker);
  return { outDir, ms: Date.now() - t0, bytes: { page: Buffer.byteLength(page), worker: Buffer.byteLength(b.worker) }, stamp: b.stamp, sweeps: data.precomputed ? Object.keys(data.precomputed.knobs).length : 0, live: data.live.cells.length };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2), at = (k) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null; };
  if (at('--engine')) {
    const b = bundleV3();
    mkdirSync(at('--engine'), { recursive: true });
    writeFileSync(join(at('--engine'), 'worker.js'), b.worker);
    writeFileSync(join(at('--engine'), 'engine-v3.mjs'), b.engine);
    console.log('lab v3 engine: ' + b.stamp.modules + ' modules, ' + b.stamp.knobPicks + ' knob numbers in ' + b.stamp.knobFiles + ' files -> ' + at('--engine'));
  } else {
    const r = await buildV3(at('--out') || undefined);
    console.log('lab v3: ' + r.live + ' live cells, ' + r.sweeps + ' swept knobs, page ' + Math.round(r.bytes.page / 1024) + ' KB, worker ' + Math.round(r.bytes.worker / 1024) + ' KB in ' + r.ms + ' ms -> ' + r.outDir);
  }
}
