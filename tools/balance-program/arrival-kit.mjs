#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/arrival-kit.mjs — THE ARRIVAL KIT'S RUNS (13-build-plan.md D-3, FB-3; 12-balance-pass.md section 3.6; 08-designer-d3.md).
//
// Run A (run 44950722457) played the armor curve, the arrival skill offset and the jewelry share against each other and found no setting that
// holds S5.low; the designer ruled D-3 on it (08-designer-d3.md). This plays THE CONFIRM RUN of its section 1.5 on the proposed game with D-3's
// rows in (the armor curve x2.4, D3-armor; the arrival kit the mid kit one band back in gear only, skills on the line and the Shop's basic ammo;
// GR-38's stand-in only from Level 110): LOW, MID, MID with every jewelry and cloak number at 0 (the crafted class's share) and BIS, each at
// the ruled x2.4 and at x1.6 (the ruling's switch rule), the lone hammer and the standard four on Normal at eleven Levels, 4 seeds x 8 hours,
// with the lone hammer's gear steps at Levels 60, 185 and 400 on MID (E1, the band step). The join judges each curve's cells with the grid's
// own judge: S1.low, S2.low and P3 (the arrival, graded), S5.low (a report), S5.bis (RULED 0.80 to 0.90), E1.armor on the band step (3 to 5%),
// E1.weapon, and the crafted class's share of a lone mid hero's Level pace. The switch rule: x1.6 only if it holds both E1.armor and S5.bis.
// A MEASUREMENT, never a gate. Heavy: GitHub only (.github/workflows/balance-arrival.yml, a push to balance-arrival/**).
//
//   node tools/balance-program/arrival-kit.mjs --jobs                   the job ids, JSON (the workflow's matrix)
//   node tools/balance-program/arrival-kit.mjs --job <id> --out <file> [--workers 4] [--smoke]   one job's share of one configuration (--smoke: 1 seed, 6 min, Level 30)
//   node tools/balance-program/arrival-kit.mjs --join <dir> [--json <file>]           every job's file under dir: the tables
//   node tools/balance-program/arrival-kit.mjs --selftest               the rules on planted rows and cells (no play)
//
// Exit: 0 ran · 1 a selftest proof failed, or a cell ended no_fight (a tool red) · 2 harness.
// mutant-anchors: none — the selftest plants rows, states and cells in memory; no tracked file is patched
// ci-step: economy-selftests | The arrival-kit run scales only jewelry numbers, moves only the arrival offset, and reads LOW over MID by stretch
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/arrival-kit.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import { compsOf } from './progression-grid.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
export const SCHEMA = 'hearthrise.arrival-kit/1';

/* THE RUN */
export const LEVELS = Object.freeze([10, 20, 30, 45, 60, 88, 110, 145, 185, 300, 400]);
export const STEP_LEVELS = Object.freeze([60, 185, 400]);
/* the curves played, as the knob's value (D3-armor puts x2.4 in the proposed game: another curve plays as a multiple of it) */
export const ARMOR = Object.freeze([2.4, 1.6]);
export const SEEDS = 4, HOURS = 8, PARTS = 2;
export const STRETCH = Object.freeze([['under 45', 1, 45], ['46 to 110', 46, 110], ['111 to 185', 111, 185], ['186 to 400', 186, 400]]);
const tagA = (a) => String(Math.round(a * 10));
export const CONFIGS = Object.freeze(ARMOR.flatMap((a) => [
  Object.freeze({ id: 'low-a' + tagA(a), state: 'low', armor: a }),
  Object.freeze({ id: 'mid-a' + tagA(a), state: 'mid', armor: a, jewelry: 1 }),
  Object.freeze({ id: 'mid0-a' + tagA(a), state: 'mid', armor: a, jewelry: 0 }),
  Object.freeze({ id: 'bis-a' + tagA(a), state: 'bis', armor: a }),
]));
export const JOBS = Object.freeze(CONFIGS.flatMap((c) => Array.from({ length: PARTS }, (_, p) => c.id + '-p' + p)));
/* MID with every jewelry number at 0 plays no gear steps (the steps read the kit as it ships) */
export const runOf = (state, steps = false) => ({ id: 'arrival', levels: LEVELS, seeds: SEEDS, hours: HOURS,
  blocks: [{ id: 'arrival', comps: [[['hammer'], 'h'], ...compsOf(4)], gears: [state], tiers: ['normal'] },
    ...(steps ? [{ id: 'steps', levels: [...STEP_LEVELS], comps: [[['hammer'], 'h']], steps: true, tiers: ['normal'] }] : [])] });

/* THE LEVERS */
/* the plain numbers a ring, earring, necklace or cloak carries (src/data/slot-ladders.js rows): the share scales these, never a price or a Level */
export const JEWEL_FIELDS = Object.freeze(['atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB', 'critB', 'steadyPm']);
const isJewel = (r) => r && (r.type === 'jewelry' || r.slot === 'cape');
/** What-if rows: every jewelry and cloak row of ITEMS with its plain numbers times `j` (critB keeps three places, the rest whole). */
export function jewelRows(ITEMS, j) {
  const out = {};
  for (const [id, r] of Object.entries(ITEMS)) {
    if (!isJewel(r)) continue;
    const row = {};
    for (const k of JEWEL_FIELDS) if (typeof r[k] === 'number') row[k] = k === 'critB' ? Math.round(r[k] * j * 1000) / 1000 : Math.round(r[k] * j);
    if (Object.keys(row).length) out[id] = row;
  }
  return out;
}
const withItems = (rows) => (job) => ({ ...job, whatIf: { ...(job.whatIf || {}), items: { ...((job.whatIf && job.whatIf.items) || {}), ...rows } } });

/* ONE JOB: a configuration's part on the proposed game (its armor knob planted on top) */
async function playJob(jobId, workers, o = {}) {
  const m = /^(.+)-p(\d+)$/.exec(jobId), c = m && CONFIGS.find((x) => x.id === m[1]);
  if (!c || !(Number(m[2]) < PARTS)) throw new Error('arrival-kit: no job ' + jobId + ' (' + JOBS.length + ' jobs: --jobs)');
  const BM = await import('./balance-matrix.mjs'), SC = await import('./matrix-scratch.mjs');
  const { loadGridData } = await import('./progression-grid.mjs'), { loadKits } = await import('./grid-kit.mjs');
  const base = await BM.baseOf('proposed', []);
  const now = (base.patch.knobs || {}).armorCurve || 1;
  const patch = Math.abs(c.armor - now) > 1e-9 ? BM.combinePatches(base.patch, { name: 'armor curve x' + c.armor, knobs: { armorCurve: c.armor / now } }) : base.patch;
  const s = await SC.plantScratch(patch);
  try {
    const D = await loadGridData(ROOT), K = await loadKits(ROOT);
    let jobHook = null;
    if (c.state === 'mid' && c.jewelry !== 1) {
      const { ITEMS } = await import(pathToFileURL(join(s.root, 'src/data/items.js')).href);
      jobHook = withItems(jewelRows(ITEMS, c.jewelry));
    }
    const res = await BM.playRun(D, K, runOf(c.state, c.state === 'mid' && c.jewelry === 1), s.root, { workers, quiet: true, calibrate: false, plan: patch.plan, shard: [Number(m[2]), PARTS], jobHook, label: jobId, seeds: o.seeds || null, hours: o.hours || null, only: o.only || null });
    let commit = 'unknown';
    try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
    return { schema: SCHEMA, job: jobId, config: c, part: Number(m[2]), base: base.ids, commit, seeds: res.seeds, hours: res.hours, runtime: res.runtime,
      cells: res.cells.map(({ kits, ...x }) => (void kits, x)) };
  } finally { s.done(); }
}

/* THE JOIN */
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
/** Each curve's cells judged by the grid's own judge (grid-derive.mjs judgeGrid on matrix-metrics.mjs asGrid), and the crafted class's share.
    Answers { missing, curves: [{ armor, rows: [{ band, at, value, status, wouldBe }], share: { stretch: [min, max] } }], pick }. */
export const READ_BANDS = Object.freeze(['S1.low', 'S2.low', 'P3', 'S5.low', 'S5.bis', 'E1.armor', 'E1.weapon']);
export function readJoin(docs, judge) {
  const missing = JOBS.filter((j) => !docs.some((d) => d.job === j));
  const cellsOf = (id) => docs.filter((d) => d.config.id === id).flatMap((d) => d.cells).filter((x) => x.m);
  const curves = [];
  for (const a of ARMOR) {
    const t = tagA(a), cells = [...cellsOf('low-a' + t), ...cellsOf('mid-a' + t), ...cellsOf('bis-a' + t)];
    const rows = judge(cells).filter((r) => READ_BANDS.includes(r.band) && r.status !== 'n/a');
    const mid = cellsOf('mid-a' + t).filter((x) => !x.step), none = cellsOf('mid0-a' + t), share = {};
    for (const party of [1, 4]) for (const [name, lo, hi] of STRETCH) {
      const xs = LEVELS.filter((L) => L >= lo && L <= hi).map((L) => { const w = mid.find((x) => x.party === party && x.L === L), o = none.find((x) => x.party === party && x.L === L); return w && o && o.m.levelXpPerH > 0 ? w.m.levelXpPerH / o.m.levelXpPerH - 1 : null; }).filter((x) => x !== null);
      share['x' + party + ' ' + name] = xs.length ? [r2(Math.min(...xs)), r2(Math.max(...xs))] : null;
    }
    curves.push({ armor: a, rows, share });
  }
  /* the switch rule (D-3 ruling 1): x1.6 only if it holds both the armor band step and S5.bis */
  const holds = (c, band) => { const rs = c.rows.filter((r) => r.band === band && r.status !== 'report'); return rs.length > 0 && rs.every((r) => r.status === 'ok'); };
  const low = curves.find((c) => c.armor === 1.6);
  const pick = low && holds(low, 'E1.armor') && holds(low, 'S5.bis') ? 1.6 : 2.4;
  return { missing, curves, pick };
}

function printJoin(J, out = console.log) {
  out('D-3\'s CONFIRM RUN (08-designer-d3.md section 1.5): the grid\'s judge on each curve, 4 seeds x 8 h, Normal; the switch rule picks x' + J.pick);
  for (const c of J.curves) {
    out('\n  armor curve x' + c.armor);
    for (const band of READ_BANDS) {
      const rs = c.rows.filter((r) => r.band === band);
      if (!rs.length) { out('    ' + band.padEnd(10) + ' no row'); continue; }
      const by = rs.reduce((m, r) => (m[r.status + (r.wouldBe ? '(' + r.wouldBe + ')' : '')] = (m[r.status + (r.wouldBe ? '(' + r.wouldBe + ')' : '')] || 0) + 1, m), {});
      out('    ' + band.padEnd(10) + ' ' + Object.entries(by).map(([k, n]) => k + ' ' + n).join(', ').padEnd(36) + rs.map((r) => r.at.replace(/ x1 normal| mid/g, '') + ' ' + (Number.isFinite(r.value) ? Math.round(r.value * 1000) / 1000 : r.value)).join('  ').slice(0, 300));
    }
    out('    crafted class share (mid over mid with no jewelry, Level XP an hour): ' + Object.entries(c.share).map(([k, v]) => k + ' ' + (v ? Math.round(v[0] * 100) + ' to ' + Math.round(v[1] * 100) + '%' : '-')).join(', '));
  }
  if (J.missing.length) out('\nMISSING JOBS: ' + J.missing.join(', '));
}

function selftest() {
  const fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  check('8 configurations (LOW, MID, MID with no jewelry, BIS at x2.4 and x1.6) and 16 jobs, each once', CONFIGS.length === 8 && JOBS.length === 16 && new Set(JOBS).size === 16);
  check('MID as it ships plays the gear steps at 60, 185 and 400; MID with no jewelry plays none', runOf('mid', true).blocks.some((x) => x.steps) && !runOf('mid', false).blocks.some((x) => x.steps));
  const ITEMS = { ring: { type: 'jewelry', slot: 'ring', v: 200, tier: 3, reqLv: 30, atkB: 7, strB: 7, critB: 0.01 }, cloak: { type: 'armor', slot: 'cape', v: 150, steadyPm: 110, strB: 1 }, sword: { type: 'weapon', slot: 'weapon', atkB: 40 } };
  const none = jewelRows(ITEMS, 0);
  check('no jewelry zeroes only the plain numbers of rings and cloaks (' + JSON.stringify(none) + ')', none.ring.atkB === 0 && none.cloak.steadyPm === 0 && !('v' in none.ring) && !none.sword);
  const hooked = withItems(none)({ id: 'x#0', whatIf: { items: { line_sword: { atkB: 50 } } } });
  check('the hook keeps a cell\'s own what-if rows beside the jewelry', hooked.whatIf.items.line_sword.atkB === 50 && hooked.whatIf.items.ring.atkB === 0);
  /* the join on planted docs and a planted judge: x1.6 holds E1.armor and S5.bis in one plant and loses S5.bis in the other */
  const docs = JOBS.map((job) => { const c = CONFIGS.find((x) => job.startsWith(x.id + '-p')); const part = Number(job.slice(-1));
    const cells = LEVELS.filter((_, i) => i % PARTS === part).flatMap((L) => [1, 4].map((p) => ({ party: p, L, m: { levelXpPerH: c.state === 'mid' ? (c.jewelry ? 106 : 100) : 90, takenPerH: 100 } })));
    return { job, config: c, cells }; });
  const judgeWith = (bisOk) => (cells) => { const lo = cells.some((x) => x.m && x.L) ? [{ band: 'E1.armor', at: 'Level 185', value: 0.04, status: 'ok' }, { band: 'S5.bis', at: '60', value: bisOk ? 0.85 : 0.95, status: bisOk ? 'ok' : 'off' }, { band: 'S5.low', at: '60', value: 1.4, status: 'report', wouldBe: 'off' }] : []; return lo; };
  const J1 = readJoin(docs, judgeWith(true)), J2 = readJoin(docs, judgeWith(false));
  const sh = J1.curves[0].share['x1 46 to 110'];
  check('the join judges each curve, reads the crafted share (' + JSON.stringify(sh) + '), and the switch rule picks x1.6 only when it holds E1.armor and S5.bis (' + J1.pick + ', ' + J2.pick + ')',
    !J1.missing.length && J1.curves.length === 2 && sh && sh[0] === 0.06 && J1.pick === 1.6 && J2.pick === 2.4);
  check('a missing job is named', readJoin(docs.slice(1), judgeWith(true)).missing.length === 1);
  console.log('arrival-kit selftest: ' + (fails.length ? fails.length + ' FAILED' : 'green'));
  return fails.length ? 1 : 0;
}

async function main() {
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--jobs')) { process.stdout.write(JSON.stringify(JOBS)); return 0; }
  if (arg('job')) {
    /* --smoke: one seed of six minutes at Level 30, the machinery only (never a reading) */
    const doc = await playJob(arg('job'), Number(arg('workers', 4)), argv.includes('--smoke') ? { seeds: 1, hours: 0.1, only: [30] } : {});
    writeFileSync(resolve(arg('out') || 'arrival-' + arg('job') + '.json'), JSON.stringify(doc) + '\n');
    console.log(arg('job') + ': ' + doc.cells.length + ' cells (' + doc.cells.filter((x) => x.error).length + ' errors) in ' + doc.runtime.wallS + ' s');
    const BM = await import('./balance-matrix.mjs');
    return Math.max(doc.cells.some((x) => x.error) ? 1 : 0, BM.printToolReds(doc.cells, (x) => console.error(x), arg('job')));
  }
  if (arg('join')) {
    const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.json$/.test(f) ? [p] : []; });
    const docs = files(resolve(arg('join'))).map((f) => JSON.parse(readFileSync(f, 'utf8'))).filter((d) => d.schema === SCHEMA);
    /* each curve's cells by the grid's own judge, on the tree's data (these bands read cell rates and the kit builder) */
    const GD = await import('./grid-derive.mjs'), MM = await import('./matrix-metrics.mjs'), { loadGridData } = await import('./progression-grid.mjs'), { loadKits } = await import('./grid-kit.mjs');
    const D = await loadGridData(ROOT), K = await loadKits(ROOT);
    const J = readJoin(docs, (cells) => GD.judgeGrid(D, MM.asGrid(cells), { K }).rows);
    printJoin(J);
    if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ base: docs[0] && docs[0].base, commits: [...new Set(docs.map((d) => d.commit))], ...J }, null, 1) + '\n');
    const BM = await import('./balance-matrix.mjs');
    return Math.max(J.missing.length ? 1 : 0, BM.printToolReds(docs.flatMap((d) => d.cells), (x) => console.error(x)));
  }
  console.error('arrival-kit: --jobs | --job <id> --out <file> | --join <dir> | --selftest');
  return 2;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
