#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants.mjs — CANDIDATE GAMES PLAYED SIDE BY SIDE ON THE ONE ENGINE (Balance Lab phase 3; docs/design/redesign/
// 07-balance-lab.md section 3.2 and the phase table row "3. Variants": "the first report of two formula families on the same cells and dice").
//
//   node tools/balance-program/variants.mjs --list                        the slots (cut, or git-ref and why), their families, the candidates
//   node tools/balance-program/variants.mjs --plan <A>[+<B>...]            a candidate (or several composed) as the patch it plays: overlays,
//                                                                          knobs, edits; the refusals say why. Plays nothing
//   node tools/balance-program/variants.mjs --identity                     C0 on the tree against C0-copy (every slot's copy overlay) on a
//                                                                          scratch copy: every seed's whole answer must be byte-identical
//   node tools/balance-program/variants.mjs --compare <A> <B>[,<C>..] [--write]  A and B on the SAME cells and the SAME dice (one plan, one seed list;
//                                                                          A played once for every B, an identity B read byte for byte):
//                                                                          each cell's seeds read as pairs, an interval on every difference, where
//                                                                          each family is ahead beyond noise by axis, the damage taken by monster
//                                                                          role, and the target bands judged seed by seed. --write keeps the report
//                                                                          as tools/balance-program/variant-reports/<A>--<B>.json
//   node tools/balance-program/variants.mjs --report <file>                a kept report, printed
//   --blocks ways,gear,tier,four (default: the subset's core blocks)  --only 30,110  --seeds N (default 4)  --hours H (default 1)  --workers N
//   (default 3: the PC is shared)
//
// NOISE. Both sides play seed s of a cell with the same dice (cell.mjs hashes the hunt's secret from the seed and segment only), so a cell's
// difference is read as n pairs: mean ± t(n-1) x sd / sqrt(n), 95%. A difference is BEYOND NOISE when that interval leaves zero (or every pair
// moved the same nonzero amount). A group of cells is ahead for one side when more of its cells are ahead beyond noise than chance allows
// (the least count whose binomial tail at 2.5% a cell is under 1%), so twenty lucky cells in five hundred do not make a headline.
// WHAT "AHEAD" MEANS is the metric's own direction for the heroes (less damage taken, fewer deaths, more XP and gold): it says where a family
// is stronger, never which is right. Which is right is the targets' call: the band rows, judged seed by seed on each side.
//
// Exit: 0 played (or listed) · 1 --identity found a byte that moved, or a cell failed · 2 a bad argument or a refused candidate.
// mutant-anchors: none — a tool; its arithmetic (pairs, the noise rule, the chance threshold) is proved by tests/rule-slots.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import { readSlots, readCandidate, compose, candidatePatch, treeOf, listCandidates } from './candidates.mjs';
import { loadGridData } from './progression-grid.mjs';
import { loadKits } from './grid-kit.mjs';
import { RUNS, planMatrix, archetypeTable } from './matrix-plan.mjs';
import { cellMetrics, slimSeed, judgeMatrix, levelBand, wayOf } from './matrix-metrics.mjs';
import { dataView, playJobs } from './balance-matrix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const REPORT_DIR = join(HERE, 'variant-reports');
export const REPORT_SCHEMA = 'hearthrise.variant-report/1';
/* the subset's core blocks: every way alone, the gear states and the harder tiers for the hammer, the four on every gear state and tier */
export const CORE_BLOCKS = Object.freeze(['ways', 'gear', 'tier', 'four']);
/* the outcomes read, each with the direction that is better for the heroes */
export const READS = Object.freeze([
  ['takenPerH', 'lower', 'damage taken a hero-hour'],
  ['hpUnder30', 'lower', 'share of time a seat sits under 30% health'],
  ['deathsPer1000h', 'lower', 'deaths a thousand hero-hours'],
  ['killsPerH', 'higher', 'kills a party-hour'],
  ['levelXpPerH', 'higher', 'Level XP a hero-hour'],
  ['netLevelXpPerH', 'higher', 'Level XP a hero-hour after deaths'],
  ['netPerH', 'higher', 'gold a hero-hour after the store'],
]);
const AXES = Object.freeze([['block', (c) => c.block], ['band', (c) => levelBand(c.L)], ['party', (c) => (c.party === 1 ? 'alone' : 'four')], ['tier', (c) => c.tier], ['gear', (c) => c.gear], ['way', (c) => c.way]]);

/* ── THE ARITHMETIC (pure: tests/rule-slots.mjs --selftest plants its cases) ─────────────────────────────────────────────────── */
const T975 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131];
/** The two-sided 95% t multiplier for `df` degrees of freedom. */
export const tCrit = (df) => (df < 1 ? Infinity : df < T975.length ? T975[df] : df < 30 ? 2.09 : 1.96);
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const sig4 = (v) => (finite(v) ? Number(v.toPrecision(4)) : v);

/**
 * One difference read as pairs: `a` and `b` the two sides' values seed by seed. Answers { a, b, d, lo, hi, n, verdict } where verdict is
 * 'same' (every pair equal), 'B' or 'A' (B's value is higher or lower than A's beyond noise; `dir` turns it into who is ahead), 'noise'
 * (the interval holds zero) or 'thin' (fewer than two pairs, or a side with no number).
 */
export function paired(a, b) {
  const n = Math.min(a.length, b.length);
  const ok = [];
  for (let i = 0; i < n; i++) if (finite(a[i]) && finite(b[i])) ok.push([a[i], b[i]]);
  if (ok.length < 2) return { a: ok.length ? mean(ok.map((p) => p[0])) : null, b: ok.length ? mean(ok.map((p) => p[1])) : null, d: null, lo: null, hi: null, n: ok.length, verdict: 'thin' };
  const ds = ok.map(([x, y]) => y - x), d = mean(ds);
  const sd = Math.sqrt(ds.reduce((s, x) => s + (x - d) ** 2, 0) / (ds.length - 1));
  const half = tCrit(ds.length - 1) * sd / Math.sqrt(ds.length);
  const out = { a: mean(ok.map((p) => p[0])), b: mean(ok.map((p) => p[1])), d, lo: d - half, hi: d + half, n: ok.length };
  if (ds.every((x) => x === 0)) return { ...out, verdict: 'same' };
  if (sd === 0) return { ...out, verdict: d > 0 ? 'B' : 'A' };
  return { ...out, verdict: out.lo > 0 ? 'B' : out.hi < 0 ? 'A' : 'noise' };
}
/** Who is ahead on one read: 'B' or 'A' (the side with the better value beyond noise), or null. `dir` 'lower' or 'higher'. */
export const aheadOf = (p, dir) => (p.verdict === 'B' ? (dir === 'higher' ? 'B' : 'A') : p.verdict === 'A' ? (dir === 'higher' ? 'A' : 'B') : null);
/** The least count of cells, of `n`, that chance (a 2.5% false call a cell) reaches with probability under 1%. */
export function chanceCount(n, p = 0.025, alpha = 0.01) {
  let tail = 1, pk = (1 - p) ** n;
  for (let k = 0; k <= n; k++) {
    if (tail < alpha) return k;
    tail -= pk;
    pk = pk * ((n - k) / (k + 1)) * (p / (1 - p));
  }
  return n + 1;
}

/** A group's reading of one read: { cells, A, B, chance, median (B over A - 1, the cells with both), lead ('A' | 'B' | null) }. */
export function groupRead(cells, id, dir) {
  const ps = cells.map((c) => c.reads[id]).filter((p) => p && p.verdict !== 'thin');
  const A = ps.filter((p) => aheadOf(p, dir) === 'A').length, B = ps.filter((p) => aheadOf(p, dir) === 'B').length;
  const rel = ps.filter((p) => finite(p.a) && p.a !== 0).map((p) => p.b / p.a - 1).sort((x, y) => x - y);
  const chance = chanceCount(ps.length);
  const lead = B >= chance && B > A ? 'B' : A >= chance && A > B ? 'A' : null;
  return { cells: ps.length, A, B, chance, median: rel.length ? rel[Math.floor(rel.length / 2)] : null, lead };
}

/* ── PLAYING ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const progress = (label) => (process.stderr.isTTY ? (k, total, id, ms) => process.stderr.write('\r  ' + (label + ' [' + k + '/' + total + '] ' + id + ', ' + Math.round(ms / 1000) + ' s').slice(0, 118).padEnd(118)) : () => {});
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

/** A candidate spec ('A' or 'A+B') read and composed. */
export function candidateOf(spec, reg = readSlots()) {
  return compose(String(spec).split('+').map((id) => readCandidate(id, reg)), reg);
}

/** The run a comparison plays: the subset's levels and blocks, cut by `o`. */
export function planOf(V, K, o = {}) {
  return planMatrix(V, K, RUNS.subset, { only: o.only || null, blocks: o.blocks || CORE_BLOCKS, seeds: o.seeds || 4, hours: o.hours || 1 });
}

/** Play one candidate on `plan` (or on its own plan of `o`): { V, plan, results, errors, applied, where, runtime }. */
export async function playCandidate(c, ctx, o = {}) {
  const t = await treeOf(c, ctx.reg, { scratch: !!o.scratch });
  try {
    const V = await dataView(ctx.D, t.root);
    const plan = o.plan || planOf(V, ctx.K, o);
    const label = c.id + (t.root === ROOT ? ' (the tree)' : ' (a scratch copy)');
    if (o.say) o.say(label + ': ' + plan.cells.length + ' cells, ' + plan.jobs.length + ' seed jobs, ' + (o.workers || 3) + ' workers');
    const { results, errors, workerMs, wallMs } = await playJobs(plan.jobs, t.root, o.workers || 3, o.quiet ? () => {} : progress(c.id));
    if (process.stderr.isTTY && !o.quiet) process.stderr.write('\n');
    return { V, plan, results, errors, applied: t.applied, where: t.root === ROOT ? 'tree' : 'scratch', runtime: { wallS: Math.round(wallMs / 1000), workerS: Math.round(workerMs / 1000) } };
  } finally { t.done(); }
}

/** Every seed's whole answer compared as bytes: { same, of, first (the first job that moved, or null), errors }. */
export function sameBytes(x, y) {
  let same = 0, of = 0, first = null;
  for (const id of Object.keys(x.results).sort()) {
    of++;
    if (JSON.stringify(x.results[id]) === JSON.stringify(y.results[id])) same++;
    else if (!first) first = id;
  }
  return { same, of, first, errors: x.errors.length + y.errors.length };
}

/**
 * THE ROLES: the damage each monster role does, B over A, with every cell weighing the same (a sum over cells would be the Level 5,000
 * cells alone: absolute damage grows with Level). Seed by seed, the mean over the cells where both sides took that role's damage of
 * ln(B / A); its interval over the seeds. Answers { role: { cells, ratio (B over A - 1), lo, hi, verdict ('B' more, 'A' more, 'noise') } }.
 * `cells` carry `roles: { role: [A's seed list, B's seed list] }`.
 */
export function roleReads(cells, seeds) {
  const names = [...new Set(cells.flatMap((c) => Object.keys(c.roles || {})))].sort();
  return Object.fromEntries(names.map((r) => {
    let used = 0;
    const logs = Array.from({ length: seeds }, (_, s) => {
      const xs = cells.map((c) => (c.roles || {})[r]).filter((p) => p && p[0][s] > 0 && p[1][s] > 0).map((p) => Math.log(p[1][s] / p[0][s]));
      used = Math.max(used, xs.length);
      return xs.length ? mean(xs) : null;
    });
    const p = paired(logs.map(() => 0), logs);
    return [r, { cells: used, ratio: finite(p.d) ? Math.exp(p.d) - 1 : null, lo: finite(p.lo) ? Math.exp(p.lo) - 1 : null, hi: finite(p.hi) ? Math.exp(p.hi) - 1 : null, verdict: p.verdict }];
  }));
}

/** The comparison of two played sides on one plan: the cells' pairs, the groups, the roles, the band rows. */
export function compareSides(K, A, B, o = {}) {
  const plan = A.plan, seeds = Math.max(...plan.cells.map((c) => c.seeds));
  const archA = archetypeTable(A.V.BS, A.V.MONSTERS), archB = archetypeTable(B.V.BS, B.V.MONSTERS);
  const perSeed = (side, arch, c) => Array.from({ length: c.seeds }, (_, s) => side.results[c.key + '#' + s]).map((r) => (r ? cellMetrics(side.V, c, [slimSeed(r)], arch) : null));
  const cells = [], seedCells = { A: Array.from({ length: seeds }, () => []), B: Array.from({ length: seeds }, () => []) };
  for (const c of plan.cells) {
    const ma = perSeed(A, archA, c), mb = perSeed(B, archB, c);
    if (ma.some((m) => !m) || mb.some((m) => !m)) { cells.push({ key: c.key, error: 'a seed is missing' }); continue; }
    ma.forEach((m, s) => seedCells.A[s].push({ ...c, m }));
    mb.forEach((m, s) => seedCells.B[s].push({ ...c, m }));
    const reads = Object.fromEntries(READS.map(([id]) => [id, paired(ma.map((m) => m[id]), mb.map((m) => m[id]))]));
    /* damage taken by the monster's role, summed over the cell's roles seed by seed */
    const roles = {};
    for (const r of new Set([...ma, ...mb].flatMap((m) => Object.keys((m.byArch || {}).role || {})))) roles[r] = [ma.map((m) => ((m.byArch.role || {})[r] || {}).takenPerH || 0), mb.map((m) => ((m.byArch.role || {})[r] || {}).takenPerH || 0)];
    cells.push({ key: c.key, block: c.block, L: c.L, party: c.party, tier: c.tier, gear: c.gear, way: wayOf(c), reads, roles });
  }
  const ok = cells.filter((c) => !c.error);
  const groups = {};
  for (const [axis, of] of AXES) {
    const by = new Map();
    for (const c of ok) { const k = String(of(c)); (by.get(k) || by.set(k, []).get(k)).push(c); }
    groups[axis] = Object.fromEntries([...by].map(([k, cs]) => [k, Object.fromEntries(READS.map(([id, dir]) => [id, groupRead(cs, id, dir)]))]));
  }
  const roles = roleReads(ok, seeds);
  /* THE TARGETS, seed by seed: every band row both sides read, its distance outside the band as a pair (A's minus B's: above zero, B nearer) */
  const bandRows = new Map();
  for (let s = 0; s < seeds; s++) {
    for (const [side, rows] of [['A', judgeMatrix(A.V, K, seedCells.A[s])], ['B', judgeMatrix(B.V, K, seedCells.B[s])]]) {
      for (const r of rows) {
        if (!['ok', 'off', 'RED'].includes(r.status)) continue;
        const key = r.way + '|' + r.band + '|' + r.at;
        const e = bandRows.get(key) || bandRows.set(key, { way: r.way, band: r.band, group: r.group, at: r.at, A: [], B: [] }).get(key);
        e[side][s] = { status: r.status, dist: finite(r.dist) ? r.dist : 0, value: r.value };
      }
    }
  }
  const bands = [];
  for (const e of bandRows.values()) {
    const both = Array.from({ length: seeds }, (_, s) => (e.A[s] && e.B[s] ? s : -1)).filter((s) => s >= 0);
    if (both.length < 2) continue;
    const p = paired(both.map((s) => e.B[s].dist), both.map((s) => e.A[s].dist));
    const statusA = majority(both.map((s) => e.A[s].status)), statusB = majority(both.map((s) => e.B[s].status));
    if (p.verdict === 'same' && statusA === statusB) continue;
    bands.push({ way: e.way, band: e.band, group: e.group, at: e.at, statusA, statusB, valueA: sig4(mean(both.map((s) => e.A[s].value))), valueB: sig4(mean(both.map((s) => e.B[s].value))),
      nearer: p.verdict === 'B' ? 'B' : p.verdict === 'A' ? 'A' : null, dist: p });
  }
  return { cells, groups, roles, bands };
}
const majority = (xs) => { const n = {}; for (const x of xs) n[x] = (n[x] || 0) + 1; return Object.entries(n).sort((p, q) => q[1] - p[1])[0][0]; };

/* ── PRINTING ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const pct = (v) => (finite(v) ? (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%' : '-');
/** The headline lines of a report: per read, the groups where each side is ahead beyond noise; the roles; the band rows each side holds. */
export function headline(rep) {
  const out = [];
  const name = { A: rep.a, B: rep.b };
  for (const [id, dir, what] of READS) {
    const leads = { A: [], B: [] };
    for (const [axis, vals] of Object.entries(rep.groups)) for (const [k, g] of Object.entries(vals)) if (g[id] && g[id].lead) leads[g[id].lead].push(axis + ' ' + k + ' (' + g[id][g[id].lead] + '/' + g[id].cells + ', median ' + pct(g[id].median) + ')');
    const all = rep.groups.party ? Object.values(rep.groups.party).reduce((t, g) => ({ A: t.A + (g[id] ? g[id].A : 0), B: t.B + (g[id] ? g[id].B : 0), n: t.n + (g[id] ? g[id].cells : 0) }), { A: 0, B: 0, n: 0 }) : { A: 0, B: 0, n: 0 };
    if (!all.A && !all.B) { out.push(what + ' (' + dir + ' is better): no cell moved beyond noise'); continue; }
    out.push(what + ' (' + dir + ' is better): ' + name.B + ' ahead in ' + all.B + ' cells, ' + name.A + ' in ' + all.A + ', of ' + all.n);
    for (const s of ['B', 'A']) if (leads[s].length) out.push('    ' + name[s] + ' leads: ' + leads[s].join('; '));
  }
  const roles = Object.entries(rep.roles).filter(([, p]) => p.verdict !== 'same' && p.verdict !== 'thin');
  if (roles.length) out.push('damage taken by monster role, each cell weighing the same (' + rep.b + ' over ' + rep.a + ', 95% over seeds; * beyond noise): '
    + roles.map(([r, p]) => r + ' ' + pct(p.ratio) + ' [' + pct(p.lo) + ', ' + pct(p.hi) + ']' + (p.verdict === 'A' || p.verdict === 'B' ? '*' : '')).join('; '));
  const flips = rep.bands.filter((b) => b.statusA !== b.statusB);
  const nearer = { A: rep.bands.filter((b) => b.nearer === 'A').length, B: rep.bands.filter((b) => b.nearer === 'B').length };
  out.push('targets: ' + rep.bands.length + ' band rows moved; nearer the band beyond noise: ' + rep.b + ' ' + nearer.B + ', ' + rep.a + ' ' + nearer.A + '; status changed on ' + flips.length);
  for (const b of flips.slice(0, 12)) out.push('    ' + b.way + ' ' + b.band + ' at ' + b.at + ': ' + rep.a + ' ' + b.statusA + ' (' + b.valueA + ') -> ' + rep.b + ' ' + b.statusB + ' (' + b.valueB + ')' + (b.nearer ? ', nearer: ' + name[b.nearer] : ', within noise'));
  if (flips.length > 12) out.push('    +' + (flips.length - 12) + ' more in the report file');
  return out;
}

/* ── THE COMMANDS ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function list() {
  const reg = readSlots();
  for (const s of reg.slots) {
    console.log((s.status === 'cut' ? 'CUT     ' : 'GIT-REF ') + s.id.padEnd(17) + s.module.padEnd(32) + (s.status === 'cut' ? s.families.map((f) => f.id + (f.expires ? ' (to ' + f.expires + ')' : '')).join(', ') : s.why.slice(0, 90) + '...'));
  }
  console.log('\ncandidates: ' + listCandidates().join(', '));
  return 0;
}
function plan(spec) {
  const reg = readSlots();
  const c = candidateOf(spec, reg);
  console.log(JSON.stringify({ candidate: c.id, base: c.base, patch: candidatePatch(c, reg) }, null, 1));
  return 0;
}
async function contextOf() {
  return { reg: readSlots(), D: await loadGridData(ROOT), K: await loadKits(ROOT) };
}
const optsOf = () => ({ only: arg('only') ? arg('only').split(',').map(Number) : null, blocks: arg('blocks') ? arg('blocks').split(',') : null,
  seeds: arg('seeds') ? Number(arg('seeds')) : null, hours: arg('hours') ? Number(arg('hours')) : null, workers: Number(arg('workers', 3)), say: (s) => console.error(s) });

async function identity() {
  const ctx = await contextOf(), o = optsOf();
  const A = await playCandidate(candidateOf('C0', ctx.reg), ctx, o);
  const B = await playCandidate(candidateOf('C0-copy', ctx.reg), ctx, { ...o, plan: A.plan });
  const r = sameBytes(A, B);
  console.log('identity: C0 on ' + A.where + ' against C0-copy on ' + B.where + ' (' + B.applied.filter((x) => x.overlay).map((x) => x.file).join(', ') + '): ' + r.same + ' of ' + r.of + ' seed answers byte-identical'
    + (r.first ? '; first that moved: ' + r.first : '') + (r.errors ? '; ' + r.errors + ' job error(s)' : ''));
  return r.same === r.of && !r.errors && r.of > 0 ? 0 : 1;
}

/** A report as it is kept: four significant digits (a reading, not a ledger), each cell's per-role seed lists dropped (the summed roles stay). */
export function slimReport(rep) {
  const walk = (x) => (Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)])) : Number.isInteger(x) ? x : sig4(x));
  return walk({ ...rep, cells: rep.cells.map(({ roles, ...c }) => (void roles, c)) });
}

/* `--compare A B1,B2,...`: A is played ONCE and every B on A's plan; an identity B (C0-copy) is read byte for byte instead */
async function compareCmd(specA, specBs) {
  const ctx = await contextOf(), o = optsOf();
  const ca = candidateOf(specA, ctx.reg), cbs = specBs.split(',').map((s) => candidateOf(s, ctx.reg));
  const A = await playCandidate(ca, ctx, o);
  let code = A.errors.length ? 1 : 0;
  for (const cb of cbs) {
    const B = await playCandidate(cb, ctx, { ...o, plan: A.plan });
    if (A.errors.length || B.errors.length) { code = 1; for (const e of [...A.errors, ...B.errors].slice(0, 5)) console.error('cell error: ' + e.id + ': ' + e.error); }
    if (cb.kind === 'identity') {
      const r = sameBytes(A, B);
      console.log('identity: ' + cb.id + ' on ' + B.where + ' (' + B.applied.filter((x) => x.overlay).map((x) => x.file).join(', ') + ') against ' + ca.id + ' on ' + A.where + ': '
        + r.same + ' of ' + r.of + ' seed answers byte-identical' + (r.first ? '; first that moved: ' + r.first : ''));
      if (r.same !== r.of || !r.of) code = 1;
      continue;
    }
    const cmp = compareSides(ctx.K, A, B);
    const rep = { schema: REPORT_SCHEMA, a: ca.id, b: cb.id, commit: commitOf(), at: new Date().toISOString().slice(0, 16) + 'Z',
      plan: { run: 'subset', blocks: o.blocks || CORE_BLOCKS, only: o.only, seeds: o.seeds || 4, hours: o.hours || 1, cells: A.plan.cells.length, jobs: A.plan.jobs.length },
      applied: { a: A.applied, b: B.applied }, runtime: { a: A.runtime, b: B.runtime }, errors: A.errors.length + B.errors.length,
      noise: 'pairs by seed: mean ± t(n-1) sd / sqrt(n), 95%; a group leads with at least its chance count of cells ahead (binomial, 2.5% a cell, under 1%)',
      reads: READS.map(([id, dir, what]) => ({ id, dir, what })), ...cmp };
    rep.headline = headline(rep);
    console.log(rep.a + ' (A) against ' + rep.b + ' (B), ' + rep.plan.cells + ' cells x ' + rep.plan.seeds + ' seeds x ' + rep.plan.hours + ' h, the same dice on both sides');
    for (const l of rep.headline) console.log('  ' + l);
    if (has('write')) {
      mkdirSync(REPORT_DIR, { recursive: true });
      const f = join(REPORT_DIR, rep.a + '--' + rep.b + '.json');
      writeFileSync(f, JSON.stringify(slimReport(rep)) + '\n');
      console.log('kept: ' + f);
    }
  }
  return code;
}

function report(file) {
  const rep = JSON.parse(readFileSync(resolve(file), 'utf8'));
  if (rep.schema !== REPORT_SCHEMA) throw new Error('report: ' + file + ' is ' + rep.schema);
  console.log(rep.a + ' (A) against ' + rep.b + ' (B), ' + rep.plan.cells + ' cells x ' + rep.plan.seeds + ' seeds, at ' + rep.commit + ' ' + rep.at);
  for (const l of rep.headline) console.log('  ' + l);
  return 0;
}

async function main() {
  try {
    if (has('list')) return list();
    if (has('plan')) return plan(arg('plan'));
    if (has('identity')) return await identity();
    if (has('compare')) { const i = argv.indexOf('--compare'); if (!argv[i + 1] || !argv[i + 2]) throw new Error('--compare <A> <B>[,<C>...]'); return await compareCmd(argv[i + 1], argv[i + 2]); }
    if (has('report')) { const f = arg('report'); if (!f || !existsSync(f)) throw new Error('--report <file>'); return report(f); }
    console.error('variants.mjs: --list | --plan <A[+B]> | --identity | --compare <A> <B>[,<C>...] [--write] | --report <file>');
    return 2;
  } catch (e) { console.error('variants.mjs: ' + (process.env.HR_TRACE ? e.stack : e.message)); return 2; }
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
