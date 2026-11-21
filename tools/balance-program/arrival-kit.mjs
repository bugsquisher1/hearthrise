#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/arrival-kit.mjs — THE COUPLED ARRIVAL-KIT RUN (13-build-plan.md D-3, FB-3; 12-balance-pass.md section 3.6).
//
// The arrival kit (standards.mjs GEAR_STATES.low) takes 2.2 times the mid kit's damage under Level 45 where band S5.low asks 1.15 to 1.35. Three
// levers move it, and they move together: the ARMOR CURVE (knob armorCurve: x2.4 is bp-armor-curve-240.json, the probe that makes an armor step
// worth 3 to 5%), the ARRIVAL SKILL OFFSET (GEAR_STATES.low.skills.vsCareerLine, -8 today, sliding in from Level 10 to 30) and the JEWELRY
// SHARE (the plain numbers on every ring, earring, necklace and cloak, scaled: 100% is GR-38 as registered; the arrival kit wears none, so the
// share moves the mid kit only). Each LOW configuration (armor x offset) and each MID configuration (armor x jewelry) plays the lone hammer and
// the standard four on Normal at eleven Levels, 4 seeds x 8 hours, on the proposed game; the join reads every LOW over every MID of the same
// armor: damage taken by Level stretch (S5.low's ratio), and what each jewelry share is worth to the mid kit's Level pace (the ruled share is 6%).
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
import { GEAR_STATES, bandById } from './standards.mjs';
import { compsOf } from './progression-grid.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
export const SCHEMA = 'hearthrise.arrival-kit/1';

/* THE RUN */
export const LEVELS = Object.freeze([10, 20, 30, 45, 60, 88, 110, 145, 185, 300, 400]);
export const ARMOR = Object.freeze([1, 2.4]);
export const SKILL = Object.freeze([-8, -4, 0]);
export const JEWEL = Object.freeze([1, 0.5, 0.25, 0]);
export const SEEDS = 4, HOURS = 8, PARTS = 2;
export const STRETCH = Object.freeze([['under 45', 1, 45], ['46 to 110', 46, 110], ['111 to 185', 111, 185], ['186 to 400', 186, 400]]);
const tagA = (a) => String(Math.round(a * 10));
export const CONFIGS = Object.freeze([
  ...ARMOR.flatMap((a) => SKILL.map((s) => Object.freeze({ id: 'low-a' + tagA(a) + '-s' + -s, state: 'low', armor: a, skill: s }))),
  ...ARMOR.flatMap((a) => JEWEL.map((j) => Object.freeze({ id: 'mid-a' + tagA(a) + '-j' + Math.round(j * 100), state: 'mid', armor: a, jewelry: j }))),
]);
export const JOBS = Object.freeze(CONFIGS.flatMap((c) => Array.from({ length: PARTS }, (_, p) => c.id + '-p' + p)));
export const runOf = (state) => ({ id: 'arrival', levels: LEVELS, seeds: SEEDS, hours: HOURS,
  blocks: [{ id: 'arrival', comps: [[['hammer'], 'h'], ...compsOf(4)], gears: [state], tiers: ['normal'] }] });

/* THE LEVERS */
/** The gear-state rules with the arrival kit's skill offset at `s` (its slide from Level 10 to 30 kept). */
export function statesFor(s, states = GEAR_STATES) {
  return { ...states, low: { ...states.low, skills: { ...states.low.skills, vsCareerLine: s } } };
}
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
  const patch = c.armor !== 1 ? BM.combinePatches(base.patch, { name: 'armor curve x' + c.armor, knobs: { armorCurve: c.armor } }) : base.patch;
  const s = await SC.plantScratch(patch);
  try {
    const D = await loadGridData(ROOT), K = await loadKits(ROOT, { states: statesFor(c.state === 'low' ? c.skill : GEAR_STATES.low.skills.vsCareerLine) });
    let jobHook = null;
    if (c.state === 'mid' && c.jewelry !== 1) {
      const { ITEMS } = await import(pathToFileURL(join(s.root, 'src/data/items.js')).href);
      jobHook = withItems(jewelRows(ITEMS, c.jewelry));
    }
    const res = await BM.playRun(D, K, runOf(c.state), s.root, { workers, quiet: true, calibrate: false, plan: patch.plan, shard: [Number(m[2]), PARTS], jobHook, label: jobId, seeds: o.seeds || null, hours: o.hours || null, only: o.only || null });
    let commit = 'unknown';
    try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
    return { schema: SCHEMA, job: jobId, config: c, part: Number(m[2]), base: base.ids, commit, seeds: res.seeds, hours: res.hours, runtime: res.runtime,
      cells: res.cells.map(({ kits, ...x }) => (void kits, x)) };
  } finally { s.done(); }
}

/* THE JOIN */
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
/** The tables from every job's doc: { ratios: [{ low, mid, party, byStretch: { name: [min, max] }, inBand }], shares: [{ mid, party, byStretch }] }. */
export function readJoin(docs) {
  const missing = JOBS.filter((j) => !docs.some((d) => d.job === j));
  const cellsOf = (id) => docs.filter((d) => d.config.id === id).flatMap((d) => d.cells).filter((x) => x.m);
  const at = (cells, party, L) => cells.find((x) => x.party === party && x.L === L);
  const band = bandById('S5.low');
  const ratios = [], shares = [];
  for (const lo of CONFIGS.filter((c) => c.state === 'low')) for (const mi of CONFIGS.filter((c) => c.state === 'mid' && c.armor === lo.armor)) for (const party of [1, 4]) {
    const L0 = cellsOf(lo.id), M0 = cellsOf(mi.id), byStretch = {}, all = [];
    for (const [name, a, b] of STRETCH) {
      const xs = LEVELS.filter((L) => L >= a && L <= b).map((L) => { const l = at(L0, party, L), m = at(M0, party, L); return l && m && m.m.takenPerH > 0 ? l.m.takenPerH / m.m.takenPerH : null; }).filter((x) => x !== null);
      byStretch[name] = xs.length ? [r2(Math.min(...xs)), r2(Math.max(...xs))] : null;
      all.push(...xs);
    }
    ratios.push({ low: lo.id, mid: mi.id, armor: lo.armor, skill: lo.skill, jewelry: mi.jewelry, party, byStretch, median: r2(median(all)), inBand: all.length > 0 && all.every((x) => x >= band.lo && x <= band.hi) });
  }
  for (const mi of CONFIGS.filter((c) => c.state === 'mid' && c.jewelry !== 0)) {
    const none = CONFIGS.find((c) => c.state === 'mid' && c.armor === mi.armor && c.jewelry === 0);
    for (const party of [1, 4]) {
      const byStretch = {};
      for (const [name, a, b] of STRETCH) {
        const xs = LEVELS.filter((L) => L >= a && L <= b).map((L) => { const w = at(cellsOf(mi.id), party, L), o = at(cellsOf(none.id), party, L); return w && o && o.m.levelXpPerH > 0 ? w.m.levelXpPerH / o.m.levelXpPerH - 1 : null; }).filter((x) => x !== null);
        byStretch[name] = xs.length ? [r2(Math.min(...xs)), r2(Math.max(...xs))] : null;
      }
      shares.push({ mid: mi.id, armor: mi.armor, jewelry: mi.jewelry, party, byStretch });
    }
  }
  return { missing, ratios, shares };
}

function printJoin(J, out = console.log) {
  const f = (v) => (v ? (v[0] === v[1] ? String(v[0]) : v[0] + '-' + v[1]) : '-');
  const p = (v) => (v ? Math.round(v[0] * 100) + (v[0] === v[1] ? '' : '-' + Math.round(v[1] * 100)) + '%' : '-');
  out('THE ARRIVAL KIT OVER THE MID KIT, damage taken a hero-hour (S5.low asks 1.15 to 1.35), by Level stretch: min-max over ' + LEVELS.join(', ') + '; Normal, 4 seeds x 8 h');
  out('  armor  offset  jewelry  party  ' + STRETCH.map(([n]) => n.padEnd(12)).join(' ') + 'median  in band');
  for (const x of J.ratios) out('  x' + String(x.armor).padEnd(5) + String(x.skill).padStart(6) + (Math.round(x.jewelry * 100) + '%').padStart(9) + ('x' + x.party).padStart(7) + '  '
    + STRETCH.map(([n]) => f(x.byStretch[n]).padEnd(12)).join(' ') + String(x.median).padEnd(8) + (x.inBand ? 'yes' : 'no'));
  out('\nTHE JEWELRY SHARE: the mid kit\'s Level XP an hour with the plain numbers at that share over the same kit with none (the ruled share is 6%)');
  for (const x of J.shares) out('  x' + String(x.armor).padEnd(5) + (Math.round(x.jewelry * 100) + '%').padStart(8) + ('x' + x.party).padStart(7) + '  ' + STRETCH.map(([n]) => (n + ' ' + p(x.byStretch[n])).padEnd(22)).join(' '));
  if (J.missing.length) out('\nMISSING JOBS: ' + J.missing.join(', '));
}

function selftest() {
  const fails = [];
  const check = (name, ok, why = '') => { console.log((ok ? '  ok    ' : '  FAIL  ') + name + (ok ? '' : ': ' + why)); if (!ok) fails.push(name); };
  check('14 configurations (6 LOW, 8 MID) and 28 jobs, each once', CONFIGS.length === 14 && JOBS.length === 28 && new Set(JOBS).size === 28);
  const ITEMS = { ring: { type: 'jewelry', slot: 'ring', v: 200, tier: 3, reqLv: 30, atkB: 7, strB: 7, critB: 0.01 }, cloak: { type: 'armor', slot: 'cape', v: 150, steadyPm: 110, strB: 1 }, sword: { type: 'weapon', slot: 'weapon', atkB: 40 } };
  const half = jewelRows(ITEMS, 0.5), none = jewelRows(ITEMS, 0);
  check('the jewelry share scales only the plain numbers of rings and cloaks: half (' + JSON.stringify(half) + '), none (' + JSON.stringify(none) + ')',
    half.ring.atkB === 4 && half.ring.critB === 0.005 && half.cloak.steadyPm === 55 && !('v' in half.ring) && !('reqLv' in half.ring) && !half.sword && none.ring.atkB === 0 && none.cloak.strB === 0);
  const hooked = withItems(half)({ id: 'x#0', whatIf: { items: { line_sword: { atkB: 50 } } } });
  check('the hook keeps a cell\'s own what-if rows beside the jewelry', hooked.whatIf.items.line_sword.atkB === 50 && hooked.whatIf.items.ring.atkB === 4);
  const st = statesFor(-4);
  check('the arrival offset moves only LOW\'s skills, its slide kept (' + JSON.stringify(st.low.skills) + ')', st.low.skills.vsCareerLine === -4 && st.low.skills.fullFromLevel === GEAR_STATES.low.skills.fullFromLevel
    && st.mid === GEAR_STATES.mid && GEAR_STATES.low.skills.vsCareerLine === -8);
  /* the join on planted cells: LOW takes 1.2x the mid kit everywhere at armor x1 with no offset, 2x at x1 -8 */
  const cell = (party, L, taken, xp = 100) => ({ party, L, m: { takenPerH: taken, levelXpPerH: xp } });
  const docs = JOBS.map((job) => { const c = CONFIGS.find((x) => job.startsWith(x.id + '-p')); const part = Number(job.slice(-1));
    const cells = LEVELS.filter((_, i) => i % PARTS === part).flatMap((L) => [1, 4].map((p) => cell(p, L, c.state === 'mid' ? 100 : c.skill === 0 ? 120 : 200, c.state === 'mid' ? 100 * (1 + 0.1 * c.jewelry) : 100)));
    return { job, config: c, cells }; });
  const J = readJoin(docs), a = J.ratios.find((x) => x.low === 'low-a10-s0' && x.mid === 'mid-a10-j100' && x.party === 1), b = J.ratios.find((x) => x.low === 'low-a10-s8' && x.party === 4);
  const sh = J.shares.find((x) => x.mid === 'mid-a10-j100' && x.party === 1);
  check('the join reads LOW over MID by stretch, in band only when every Level is (' + JSON.stringify(a && a.byStretch) + '), and the share against no jewelry (' + JSON.stringify(sh && sh.byStretch) + ')',
    !J.missing.length && a && a.inBand && a.byStretch['under 45'][0] === 1.2 && b && !b.inBand && b.median === 2 && sh && sh.byStretch['46 to 110'][0] === 0.1 && J.ratios.length === 2 * 3 * 4 * 2);
  check('a missing job is named', readJoin(docs.slice(1)).missing.length === 1);
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
    const J = readJoin(docs);
    printJoin(J);
    if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ base: docs[0] && docs[0].base, commits: [...new Set(docs.map((d) => d.commit))], ...J }, null, 1) + '\n');
    const BM = await import('./balance-matrix.mjs');
    return Math.max(J.missing.length ? 1 : 0, BM.printToolReds(docs.flatMap((d) => d.cells), (x) => console.error(x)));
  }
  console.error('arrival-kit: --jobs | --job <id> --out <file> | --join <dir> | --selftest');
  return 2;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
