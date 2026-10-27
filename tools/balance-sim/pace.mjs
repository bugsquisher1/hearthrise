#!/usr/bin/env node
// tools/balance-sim/pace.mjs — THE LEVEL PACE: what the Level curve costs a player, in hunting hours, measured on the
// real engine (balance layer 1; Tyler's balance ruling 2026-10-25 §2, src/data/core-model.js LEVEL_PACE).
//
//   node tools/balance-sim/sim.mjs --plan pace   [--out tools/balance-sim/out/pace]     the careers (about 30 min, 4 workers)
//   node tools/balance-sim/sim.mjs --plan ladder [--out tools/balance-sim/out/ladder]   the grounds in band (about 10 min)
//   node tools/balance-sim/sim.mjs --plan pacebounds                                    optional: full box, a party of four
//   node tools/balance-sim/pace.mjs [--pace DIR] [--ladder DIR] [--bounds DIR] [--fit] [--write] [--dash DIR]
//
// THE REFERENCE ("reasonably efficient hunting", ruling §2): a lone hero of each style, from Level 1, hunting where the
// game recommends (the Hunts window's default pick, as built: the default density), wearing the best gear its Level may
// wear and can get, carrying its XP and skills hour to hour (career.mjs). Per Level the reference rate is the median
// style's Level XP an hour while at that Level; the measured hours to a Level are the median style's. Past the top of
// the highest ground (the CEILING: no content, nothing to measure) the rate is LEVEL_PACE.contract, a x Level^b, the
// trend of the grounds in their own bands (the 'ladder' plan): what a new ground must pay for the curve to hold.
//
//   --fit    the minimax fit of LEVEL_CURVE's brackets (their start Levels kept) to LEVEL_PACE.targets on the reference
//            rate (a small LP, lp.mjs), with the early Levels held where the tutorial says they are (LEVEL_PACE.early),
//            printed as the data rows to paste; the fit is never written into src/data by this tool
//   --write  the committed snapshot tools/balance-sim/level-pace.json that tests/level-curve.mjs judges the curve with
//   --dash   the Balance Dashboard's level data (level-pace.json, findings.json, balance-cells.csv) into DIR
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { simplex } from './lp.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const SNAPSHOT = join(HERE, 'level-pace.json');
const u = (p) => pathToFileURL(join(ROOT, p)).href;

/* ── THE FINGERPRINT: the data a ground's Level XP an hour is made of, and where a lone hero is sent. A change to any
   of it makes the measured pace stale (tests/level-curve.mjs C1). Monsters on the open grounds: xp, hp, level, atk,
   def (never loot); every open ground: its hunt, band, group fit, solo Level, respawn and pockets (spawns and packs);
   and the Hunts window's default pick for a lone hero at every Level to the ceiling (its behaviour, not its source:
   a comment edit to the recommendation trips nothing, a new pick does). ── */
export function paceFingerprint(D) {
  const grounds = Object.values(D.OPEN_GROUNDS).sort((a, b) => (a.id < b.id ? -1 : 1));
  const ids = new Set();
  const g = grounds.map((x) => {
    for (const p of x.pockets) for (const s of [...(p.pack || []), ...(p.spawns || [])]) ids.add(s.monster);
    return { id: x.id, hunt: x.hunt, band: D.HUNT_INDEX[x.hunt].band, groupFit: x.groupFit, soloFrom: x.soloFrom || null, respawnMs: x.respawnMs,
      pockets: x.pockets.map((p) => ({ minParty: p.minParty || null, pack: (p.pack || []).map((s) => [s.monster, s.n]), spawns: (p.spawns || []).map((s) => [s.monster, s.n]) })) };
  });
  const m = [...ids].sort().map((id) => { const r = D.MONSTERS[id] || {}; return [id, r.xp, r.hp, r.level, r.atk, r.def]; });
  const top = Math.max(...grounds.map((x) => D.HUNT_INDEX[x.hunt].band[1]));
  const pick = Array.from({ length: top }, (_, i) => D.recommend(i + 1));
  return createHash('sha256').update(JSON.stringify({ g, m, pick })).digest('hex').slice(0, 16);
}
export async function loadPaceData(root = ROOT) {
  const v = (p) => pathToFileURL(join(root, p)).href;
  const G = await import(v('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(v('src/data/hunts.js'));
  const { MONSTERS } = await import(v('src/data/monsters.js'));
  const { BUILD } = await import(v('src/build-info.js'));
  const { recommendedHunt } = await import(v('src/shell/hunt-list.js') + '?v=' + BUILD.version);
  return { OPEN_GROUNDS: G.OPEN_GROUNDS, HUNT_INDEX, MONSTERS, recommend: (L) => { const r = recommendedHunt([L], 1); return r ? r.hunt : null; } };
}

/* ── HOURS on a curve at a rate ── */
/** Hours from Level 1 to each Level in `levels` on `xpFor` (total XP to reach a Level) at `rate(L)` Level XP an hour. */
export function hoursTo(xpFor, rate, levels) {
  const out = {};
  let h = 0, L = 1;
  for (const m of [...levels].sort((a, b) => a - b)) { for (; L < m; L++) h += (xpFor(L + 1) - xpFor(L)) / Math.max(1, rate(L)); out[m] = h; }
  return out;
}
/** The reference rate: measured per Level to the ceiling (a Level with no sample takes the nearest one below), the
    contract a L^b past it. */
export function referenceRate(snap, contract) {
  const known = Object.keys(snap.rate).map(Number).sort((a, b) => a - b);
  return (L) => {
    if (L >= snap.ceiling) return contract.a * L ** contract.b;
    let r = snap.rate[known[0]];
    for (const k of known) if (k <= L) r = snap.rate[k];
    return r;
  };
}

/* ── READING THE RUNS ── */
const readRows = (dir) => (dir && existsSync(join(dir, 'cells.jsonl')) ? readFileSync(join(dir, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const median = (v) => { const x = v.filter((y) => Number.isFinite(y)).sort((a, b) => a - b); if (!x.length) return null; return x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2; };

/** Per Level, each solo career's mean Level XP an hour over the chunks that spent time at that Level (a chunk covers
    its start Level through the Level it ended on); the median over styles. */
function ratesOf(careers) {
  const per = {};
  for (const c of careers) {
    const t = c.trace;
    for (let i = 0; i < t.length; i++) {
      const from = t[i].levels[0], to = i + 1 < t.length ? t[i + 1].levels[0] : (c.reached ? c.reached[0] : from);
      for (let L = from; L <= to; L++) ((per[L] = per[L] || {})[c.id] = per[L][c.id] || []).push(t[i].xpPerH[0]);
    }
  }
  const out = {};
  for (const L of Object.keys(per).map(Number).sort((a, b) => a - b)) out[L] = Math.round(median(Object.values(per[L]).map((a) => a.reduce((s, x) => s + x, 0) / a.length)));
  return out;
}

/** The ladder: each ground's mean Level XP an hour in its own band (the median style per Level, then the Levels'
    mean), at its band's middle; a x L^b fitted log-log. */
function ladderOf(cells) {
  const by = {};
  for (const c of cells) {
    if (c.cell.party.length !== 1 || !/x=LAD/.test(c.id)) continue;
    ((by[c.ground] = by[c.ground] || { band: c.hunt.band, at: {} }).at[c.cell.level] = by[c.ground].at[c.cell.level] || []).push(c.heroes[0].levelXpPerH);
  }
  const points = Object.entries(by).map(([g, v]) => {
    const levels = Object.keys(v.at).map(Number);
    const mid = (Math.min(...levels) + Math.max(...levels)) / 2;
    return [mid, Math.round(levels.reduce((s, L) => s + median(v.at[L]), 0) / levels.length), g];
  }).sort((a, b) => a[0] - b[0]);
  if (points.length < 2) return null;
  const xs = points.map((p) => Math.log(p[0])), ys = points.map((p) => Math.log(p[1]));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { points, a: Math.round(Math.exp(my - b * mx)), b: Math.round(b * 1000) / 1000 };
}

function careerSummary(c, levels) {
  return { party: c.party, density: Number.isInteger(c.density) ? c.density : null, hours: c.hours, reached: c.reached,
    hoursTo: Object.fromEntries(levels.map((L) => [L, c.milestones['0:' + L] ?? null])),
    deaths: c.trace.reduce((s, t) => s + t.deaths.reduce((a, b) => a + b, 0), 0), grounds: [...new Set(c.trace.map((t) => t.ground))],
    skillsAt: Object.fromEntries([10, 25, 49].map((L) => { const t = c.trace.find((x) => Math.min(...x.levels) >= L); return [L, t ? t.skills[0] : null]; })) };
}

/* ── THE FIT: LEVEL_CURVE's brackets (start Levels kept) by minimax relative error, as an LP ── */
/**
 * froms: bracket start Levels; rate(L); targets [[L, h]]; early { level, hours: [lo, hi] }; minFirst (XP of Level 1->2);
 * firstMinutes (the first Level-up at most this many minutes). Answers { curve, err } with whole-number rows.
 */
export function fitCurve({ froms, rate, targets, early, minFirst = 60, firstMinutes = 1, maxLevel = 1001, hold = null }) {
  /* variables: first, then per bracket rise and bend; the step at each Level is a linear combination of them */
  const NV = 1 + 2 * froms.length;
  const iRise = (b) => 1 + 2 * b, iBend = (b) => 2 + 2 * b;
  const steps = [];
  let cur = null, bi = -1;
  for (let L = 1; L <= maxLevel; L++) {
    while (bi + 1 < froms.length && froms[bi + 1] <= L) {
      bi += 1;
      if (bi === 0) { cur = new Array(NV).fill(0); cur[0] = 1; continue; }
      /* the bracket's first step: the previous bracket's step one Level further */
      const pm = L - froms[bi - 1];
      const last = steps[L - 2];
      cur = last.slice(); cur[iRise(bi - 1)] += 1; cur[iBend(bi - 1)] += pm * pm - (pm - 1) * (pm - 1);
    }
    const m = L - froms[bi];
    const v = cur.slice(); v[iRise(bi)] += m; v[iBend(bi)] += m * m;
    steps.push(v);
  }
  const hoursVec = (M) => { const h = new Array(NV).fill(0); for (let l = 1; l < M; l++) { const r = Math.max(1, rate(l)); for (let j = 0; j < NV; j++) h[j] += steps[l - 1][j] / r; } return h; };
  const H = targets.map(([M]) => hoursVec(M));
  const sc = new Array(NV).fill(0).map((_, j) => Math.max(1e-12, ...H.map((h) => Math.abs(h[j]))));
  const A = [], B = [];
  const add = (coef, t, rhs) => { A.push(coef.map((x, j) => x / sc[j]).concat([t])); B.push(rhs); };
  targets.forEach(([, h], i) => { add(H[i].map((x) => x / h), -1, 1); add(H[i].map((x) => -x / h), -1, -1); });
  froms.forEach((_, b) => { const c = new Array(NV).fill(0); c[iRise(b)] = -1; c[iBend(b)] = -1; add(c, 0, -1); });
  { const c = new Array(NV).fill(0); c[0] = -1; add(c, 0, -minFirst); }
  add(hoursVec(2), 0, firstMinutes / 60);
  if (hold) {
    /* `hold` (a curve): its `first` and every bracket starting below hold.below keep their values, so a re-fit past the
       ceiling leaves the measured part of the curve as it was measured */
    const fix = (j, v) => { const c = new Array(NV).fill(0); c[j] = 1; add(c, 0, v); add(c.map((x) => -x), 0, -v); };
    fix(0, hold.first);
    froms.forEach((from, b) => { const hb = hold.brackets.find((x) => x.from === from); if (hb && from < hold.below) { fix(iRise(b), hb.rise); fix(iBend(b), hb.bend); } });
  }
  if (early && !(hold && early.level < hold.below)) {
    /* the early Level lands at its aim (a 2% band, so the LP keeps room), never outside the window the guard checks */
    const e = hoursVec(early.level);
    const lo = Number.isFinite(early.aim) ? early.aim * 0.99 : early.hours[0], hi = Number.isFinite(early.aim) ? early.aim * 1.01 : early.hours[1];
    add(e, 0, hi); add(e.map((x) => -x), 0, -lo);
  }
  const res = simplex(new Array(NV).fill(0).concat([1]), A, B);
  if (!res) return null;
  const x = res.x.slice(0, NV).map((v, j) => v / sc[j]);
  const curve = { first: Math.max(minFirst, Math.round(x[0])), brackets: froms.map((from, b) => {
    let rise = Math.round(x[iRise(b)]), bend = Math.round(x[iBend(b)]);
    if (rise + bend < 1) rise = 1;
    return { from, rise, bend };
  }) };
  return { curve, lpErr: res.x[NV] };
}

/* ── RUN ── */
async function main() {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
  const flag = (k) => process.argv.includes('--' + k);
  const { BUILD } = await import(u('src/build-info.js'));
  const XP = await import(u('src/core/xp.js') + '?v=' + BUILD.version);
  const AR = await import(u('src/core/action-rules.js') + '?v=' + BUILD.version);
  const { LEVEL_CURVE, LEVEL_PACE } = await import(u('src/data/core-model.js'));
  const { BLESSING_TIERS } = await import(u('src/data/blessings.js'));
  const D = await loadPaceData();
  const PACE = resolve(arg('pace', join(HERE, 'out', 'pace')));
  const careers = readRows(PACE).filter((r) => r.kind === 'career' && r.party.length === 1 && !Number.isInteger(r.density));
  if (!careers.length) { console.error('pace: no solo careers in ' + PACE + ' (run: node tools/balance-sim/sim.mjs --plan pace)'); process.exit(1); }
  const ceiling = Math.max(...Object.values(D.OPEN_GROUNDS).map((g) => D.HUNT_INDEX[g.hunt].band[1]));
  const targetLevels = LEVEL_PACE.targets.map((t) => t[0]);
  const measuredLevels = [...new Set([2, 5, 10, 15, 20, 25, 30, 40, 50, ...targetLevels])].filter((L) => L <= ceiling).sort((a, b) => a - b);
  const rate = ratesOf(careers);
  for (const k of Object.keys(rate)) if (Number(k) >= ceiling) delete rate[k];
  const measured = Object.fromEntries(measuredLevels.map((L) => [L, median(careers.map((c) => c.milestones['0:' + L]))]));
  const ladderCells = readRows(resolve(arg('ladder', join(HERE, 'out', 'ladder'))));
  const ladder = ladderCells.length ? ladderOf(ladderCells) : null;
  const old = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;
  const snap = {
    schema: 'hearthrise.level-pace/1',
    generated: new Date().toISOString(),
    commit: (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return null; } })(),
    version: BUILD.version,
    curve: JSON.parse(JSON.stringify(LEVEL_CURVE)),
    fingerprint: paceFingerprint(D),
    ceiling,
    reference: 'median of ' + careers.length + ' solo styles, Level 1 to ' + ceiling + ', where the Hunts window recommends, as built (tools/balance-sim plan pace)',
    styles: careers.map((c) => c.party[0]),
    rate,
    measuredHours: measured,
    careers: Object.fromEntries(careers.map((c) => [c.party[0], careerSummary(c, measuredLevels)])),
    ladder: ladder || (old && old.ladder) || null,
  };
  const boundsRows = readRows(resolve(arg('bounds', join(HERE, 'out', 'pacebounds')))).filter((r) => r.kind === 'career');
  if (boundsRows.length) snap.bounds = Object.fromEntries(boundsRows.map((c) => [c.id.replace(/^P:/, '').replace(/:s0$/, ''), careerSummary(c, measuredLevels)]));
  else if (old && old.bounds) snap.bounds = old.bounds;

  /* the table: every target Level, the curve's hours at the reference rate (measured to the ceiling, the contract
     past it), the careers' own hours where they reach, and the 10-19 quartic's for the record */
  const R = referenceRate(snap, LEVEL_PACE.contract);
  const ref = hoursTo(XP.charXpForLevel, R, targetLevels);
  const before = (L) => { const n = L - 1; return n ** 4 + 20 * n ** 3 + 50 * n; };
  const beforeH = hoursTo(before, R, targetLevels);
  console.log('LEVEL PACE: ' + snap.reference + '; past L' + ceiling + ': ' + LEVEL_PACE.contract.a + ' x L^' + LEVEL_PACE.contract.b
    + (ladder ? ' (measured ladder: ' + ladder.a + ' x L^' + ladder.b + ' over ' + ladder.points.map((p) => p[2] + '@' + p[0] + ' ' + p[1]).join(', ') + ')' : ''));
  console.log('Level   target h   curve h (ref)   err     careers h   10-19 curve h   per-Level h   XP to reach');
  let prevL = 1, prevH = 0;
  for (const [L, T] of LEVEL_PACE.targets) {
    const h = ref[L], e = h / T - 1;
    const per = (h - prevH) / (L - prevL);
    console.log(String(L).padStart(5) + String(T).padStart(11) + h.toFixed(1).padStart(16) + ((e >= 0 ? '+' : '') + (e * 100).toFixed(1) + '%').padStart(8)
      + (measured[L] != null ? measured[L].toFixed(1) : (L <= ceiling ? 'n/a' : 'extrap.')).padStart(12) + beforeH[L].toFixed(0).padStart(16) + per.toFixed(2).padStart(14) + String(XP.charXpForLevel(L)).padStart(16));
    prevL = L; prevH = h;
  }
  console.log('measured (median of styles): ' + Object.entries(measured).map(([L, h]) => 'L' + L + ' ' + (h == null ? '-' : h.toFixed(2) + ' h')).join(', '));
  /* WHAT AN UNBLESSED DEATH COSTS mid-Level (2% of total Level XP, never below the Level's start), in hours at the
     reference rate, and with each Blessing */
  const death = [10, 25, 50, 100, 200, 500, 1000].map((L) => {
    const x0 = XP.charXpForLevel(L), mid = x0 + Math.floor((XP.charXpForLevel(L + 1) - x0) / 2);
    const lost = AR.levelDeathLoss(mid), hrs = lost / R(L);
    return { level: L, xpLost: lost, shareOfLevel: Math.round((lost / (XP.charXpForLevel(L + 1) - x0)) * 1000) / 1000, unblessedHours: Math.round(hrs * 100) / 100,
      blessedHours: Object.fromEntries(BLESSING_TIERS.map((t) => [t.tier, Math.round(hrs * (1 - t.xpLossReductionPermille / 1000) * 100) / 100])), extrapolated: L >= ceiling };
  });
  console.log('unblessed death at mid-Level: ' + death.map((d) => 'L' + d.level + ' ' + d.unblessedHours + ' h (' + Math.round(d.shareOfLevel * 100) + '% of the Level)').join(', '));
  snap.table = Object.fromEntries(LEVEL_PACE.targets.map(([L, T]) => [L, { target: T, hours: Math.round(ref[L] * 10) / 10, err: Math.round((ref[L] / T - 1) * 1000) / 1000,
    measured: measured[L] != null ? Math.round(measured[L] * 10) / 10 : null, before: Math.round(beforeH[L]) }]));
  snap.death = death;

  if (flag('fit')) {
    const froms = LEVEL_CURVE.brackets.map((b) => b.from);
    /* --fit-past: re-fit only the brackets from the ceiling on (a new contract, no re-measure: the careers never pass it) */
    const hold = flag('fit-past') ? { ...LEVEL_CURVE, below: ceiling } : null;
    const f = fitCurve({ froms, rate: R, targets: LEVEL_PACE.targets, early: LEVEL_PACE.early, hold });
    if (!f) { console.error('pace --fit: no curve meets the constraints'); process.exit(1); }
    const rows = XP.levelCurveRowsOf(f.curve);
    const fh = hoursTo((L) => XP.xpForLevelOn(rows, L), R, [2, ...(LEVEL_PACE.early ? [LEVEL_PACE.early.level] : []), ...targetLevels]);
    console.log('\nFIT (minimax ' + (f.lpErr * 100).toFixed(1) + '% before rounding): ' + JSON.stringify(f.curve));
    console.log('  ' + LEVEL_PACE.targets.map(([L, T]) => 'L' + L + ' ' + fh[L].toFixed(1) + ' h (' + ((fh[L] / T - 1) * 100).toFixed(1) + '%)').join(', ')
      + '; Level 2 in ' + (fh[2] * 60).toFixed(1) + ' min' + (LEVEL_PACE.early ? ', Level ' + LEVEL_PACE.early.level + ' in ' + fh[LEVEL_PACE.early.level].toFixed(2) + ' h' : ''));
  }
  if (flag('write')) { writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 1) + '\n'); console.log('pace: wrote ' + SNAPSHOT.replace(ROOT, '.')); }
  const dash = arg('dash', null);
  if (dash) {
    const dir = resolve(dash);
    mkdirSync(dir, { recursive: true });
    /* the dashboard's level chart, in its first file's keys (level, target, proposed = the curve this run measured,
       measuredLow/High = the styles' range, todayCurve = the curve live before it, at the same reference), plus the
       median, the error, the one Level's own hours and the XP to reach it */
    const one = (L) => (XP.charXpForLevel(L + 1) - XP.charXpForLevel(L)) / R(L);
    const lp = LEVEL_PACE.targets.map(([L, T]) => ({ level: L, target: T, proposed: snap.table[L].hours,
      measuredLow: L <= ceiling ? Math.round(Math.min(...careers.map((c) => c.milestones['0:' + L] ?? Infinity)) * 10) / 10 : null,
      measuredHigh: L <= ceiling ? Math.round(Math.max(...careers.map((c) => c.milestones['0:' + L] ?? -Infinity)) * 10) / 10 : null,
      todayCurve: snap.table[L].before, measured: snap.table[L].measured, errPct: Math.round(snap.table[L].err * 1000) / 10, extrapolated: L > ceiling,
      levelHours: Math.round(one(L) * 100) / 100, xpToReach: XP.charXpForLevel(L) }));
    writeFileSync(join(dir, 'level-pace.json'), '[\n' + lp.map((r) => ' ' + JSON.stringify(r)).join(',\n') + '\n]\n');
    console.log('pace: wrote ' + join(dir, 'level-pace.json').replace(ROOT, '.'));
    /* the findings: the earlier run's (--findings-base) with the Level pace (D3) and the death cost (D9) re-measured */
    const base = arg('findings-base', null);
    if (base) {
      const f = JSON.parse(readFileSync(resolve(base), 'utf8'));
      const n = (x) => Math.round(x).toLocaleString('en-US');
      const tgt = (L) => snap.table[L];
      const d3 = f.find((x) => x.id === 'D3');
      if (d3) Object.assign(d3, { measured: 'On the new curve (pace brackets, lane/b-level-curve): ' + careers.length + ' styles reach L10 in ' + measured[10].toFixed(1) + ' h, L25 in '
        + measured[25].toFixed(1) + ' h, L50 in ' + measured[50].toFixed(1) + ' h (median; the 10-19 curve at the same rates: ' + [10, 25, 50].map((L) => n(tgt(L).before)).join(' / ') + ' h). Past L50 at the ground contract ('
        + LEVEL_PACE.contract.a + ' x L^' + LEVEL_PACE.contract.b + ' XP/h): L100 ' + n(tgt(100).hours) + ', L200 ' + n(tgt(200).hours) + ', L500 ' + n(tgt(500).hours) + ', L1000 ' + n(tgt(1000).hours) + ' h.',
      gap: LEVEL_PACE.targets.every(([L]) => Math.abs(tgt(L).err) <= LEVEL_PACE.tolerance) ? 'OK' : 'Major',
      proposal: 'Shipped: every target within ' + Math.round(Math.max(...LEVEL_PACE.targets.map(([L]) => Math.abs(tgt(L).err))) * 1000) / 10 + '% (tests/level-curve.mjs pins it). New grounds past L50 must pay the contract.',
      decides: 'Done (layer 1); grounds past L50 are the designer\'s' });
      /* the first Level where a mid-Level death's 2% of total reaches the Level's start (the never-de-level floor binds) */
      let capFrom = null;
      for (let L = 2; L <= 1000 && capFrom === null; L++) {
        const x0 = XP.charXpForLevel(L), mid = x0 + Math.floor((XP.charXpForLevel(L + 1) - x0) / 2);
        if (AR.levelDeathLoss(mid) >= mid - x0) capFrom = L;
      }
      const d9 = f.find((x) => x.id === 'D9');
      const dc = (L) => death.find((x) => x.level === L);
      if (d9) Object.assign(d9, { measured: 'Unblessed death mid-Level: L10 ' + dc(10).unblessedHours + ' h, L50 ' + dc(50).unblessedHours + ' h, L100 ' + dc(100).unblessedHours + ' h, L200 '
        + dc(200).unblessedHours + ' h, L500 ' + dc(500).unblessedHours + ' h. From L' + capFrom + ' a mid-Level death\'s 2% of total XP is more than the Level\'s own progress, so the never-de-level floor decides it (at most one Level\'s hours).' });
      /* what the slower curve does to the systems tied to Level (measured on the same careers) */
      const main = (c, L) => { const s = (snap.careers[c.party[0]].skillsAt || {})[L]; return s ? Math.max(s.melee, s.ranged, s.magic) : null; };
      const skillAt = (L) => median(careers.map((c) => main(c, L)));
      const oldH = (L) => { const old = (x) => { const k = x - 1; return k ** 4 + 20 * k ** 3 + 50 * k; }; return hoursTo(old, R, [L])[L]; };
      const ladderLine = snap.ladder ? snap.ladder.points.map((p) => p[2].replace(/_.*/, '') + ' ' + n(p[1]) + ' at L' + p[0]).join(', ') : 'not measured';
      const add = (row) => { const i = f.findIndex((x) => x.id === row.id); if (i >= 0) f[i] = row; else f.push(row); };
      add({ id: 'L1', topic: 'Skills against Level', measured: 'A hero\'s weapon skill on the new curve: ' + skillAt(10) + ' at L10, ' + skillAt(25) + ' at L25, ' + skillAt(49)
        + ' at L49 (median style). The skill curve was fitted to keep skill near Level through L25.', target: 'Not ruled (13.2)', gap: 'Minor',
        proposal: 'Skills run a little ahead of Level early; no change in this layer.', decides: 'Tyler (13.2)' });
      add({ id: 'L2', topic: 'Grounds past L50 (the contract)', measured: 'Today\'s solo grounds in band: ' + ladderLine + ' Level XP/h' + (snap.ladder ? ' = ' + snap.ladder.a + ' x L^' + snap.ladder.b : '') + '.',
        target: 'L100 600 h ... L1000 23,520 h', gap: 'Major', proposal: 'A new ground must pay about ' + LEVEL_PACE.contract.a + ' x L^' + LEVEL_PACE.contract.b + ' Level XP/h at its Level (L75 '
        + n(LEVEL_PACE.contract.a * 75 ** LEVEL_PACE.contract.b) + ', L150 ' + n(LEVEL_PACE.contract.a * 150 ** LEVEL_PACE.contract.b) + ') or the hours past L50 drift.', decides: 'Designer' });
      add({ id: 'L3', topic: 'The L32-50 Glade stretch', measured: 'A lone hero stays in the Glade from L16 to L50 (the Warrens is a party ground): one Level takes ' + one(31).toFixed(1) + ' h at L31 and '
        + one(49).toFixed(1) + ' h at L49 on the curve, ' + one(50).toFixed(1) + ' h at L50 at the contract rate.', target: 'Steady progression', gap: 'Major',
        proposal: 'D5 (a solo ground or the Warrens\' solo Level for 32-50) shortens L32-50; re-measure the pace when it lands.', decides: 'Designer' });
      add({ id: 'L4', topic: 'Prayer burying', measured: 'The bury rate was fitted to Prayer 15 by L25 at the old pace (12 h). On the new curve 12 h of hunting is Level '
        + median(careers.map((c) => { const t = c.trace.find((x) => x.hours >= 12); return t ? t.levels[0] : null; })) + '.', target: 'Prayer about 0.6 x Level', gap: 'Minor',
        proposal: 'Leave until the Hearth (Inner Flame) replaces burying; re-fit then.', decides: 'Designer' });
      add({ id: 'L5', topic: 'Gold priced by Level', measured: 'Blessings are free below L30: ' + measured[30].toFixed(0) + ' h of hunting now, ' + oldH(30).toFixed(0)
        + ' h on the old curve. Blessing, stamina-refill and rename prices scale with Level, so they take a smaller share of the gold earned by a Level.', target: 'Economy phase (§12)', gap: 'Minor',
        proposal: 'Re-price in the economy layer.', decides: 'Designer, Tyler (money)' });
      writeFileSync(join(dir, 'findings.json'), '[\n' + f.map((r) => ' ' + JSON.stringify(r)).join(',\n') + '\n]\n');
      console.log('pace: wrote ' + join(dir, 'findings.json').replace(ROOT, '.'));
    }
  }
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
