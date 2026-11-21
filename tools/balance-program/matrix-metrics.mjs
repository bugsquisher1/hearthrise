// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-metrics.mjs — WHAT THE BALANCE MATRIX READS OFF A CELL, ACROSS CELLS, AND BETWEEN TWO RUNS (40-formula-brief
// section 6, lane/c-balance-matrix).
//
//   cellMetrics(D, meta, seeds, arch)   one cell's numbers: the grid's own rates (progression-grid.mjs cellRates, the numbers standards.mjs
//                                       judges) and the section 6 list beside them (METRICS), each seat's own, and the fights by archetype
//   deriveMatrix(cells)                 across cells: solo against party, the value of each gear step per slot class, every way against the
//                                       best way, the archetypes
//   judgeMatrix(D, K, cells)            standards.mjs's bands on the cells (grid-derive.mjs judgeGrid, the grid's own judge, per way)
//   diffMatrices(before, after, patch)  every band row and every cell's metric, before and after; a moved band row is IMPROVED or REGRESSED when
//                                       the patch targets it, UNINTENDED when it does not
//
// Every number is read off the engine's answer (tools/balance-sim/cell.mjs runCell); nothing here computes a fight.
// ════════════════════════════════════════════════════════════════════════
import * as STD from './standards.mjs';
import { cellRates } from './progression-grid.mjs';
import { judgeGrid, statusOf } from './grid-derive.mjs';
import { ARCHETYPE_AXES } from './matrix-plan.mjs';
import { STYLE_GROUPS } from './knob-rules.mjs';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const r = (x, d = 0) => (finite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/* THE SECTION 6 LIST, in Tyler's order: [id, label, scope]. `scope` says what the number is a rate of. */
export const METRICS = Object.freeze([
  ['dps', 'Actual DPS (the party: damage a hunted second, walks and rests in it)', 'party'],
  ['dpsHero', 'DPS a hero', 'hero'],
  ['takenPerH', 'Damage taken an hour', 'hero-hour'],
  ['healPerH', 'Healing an hour (food, spells, regeneration)', 'hero-hour'],
  ['levelXpPerH', 'Level XP an hour', 'hero-hour'],
  ['netPerH', 'Gold profit or loss an hour (after the store)', 'hero-hour'],
  ['storePerH', 'Supply gold an hour', 'hero-hour'],
  ['suppliesPerH', 'Supplies used an hour (units)', 'hero-hour'],
  ['killsPerH', 'Kill rate (the party)', 'party-hour'],
  ['ttkS', 'Seconds to kill', 'kill'],
  ['deathsPer1000h', 'Deaths a 1,000 hours', 'hero-hour'],
  ['lowHpTypical', 'Typical low HP (a fight\'s lowest, median)', 'share'],
  ['lowHpP10', 'Low HP, the worst tenth of fights', 'share'],
  ['hpUnder30', 'Time under 30% HP (worst seat)', 'share of hunted time'],
  ['hpUnder10', 'Time under 10% HP (worst seat)', 'share of hunted time'],
  ['hoursPerLevel', 'Hours for the next Level', 'hours'],
  ['xContract', 'Level XP / the pace contract', 'ratio'],
]);
export const METRIC_IDS = Object.freeze(METRICS.map((m) => m[0]));

/* ── ONE SEED: what a cell keeps of runCell's answer ───────────────────────────────────────────────────────────────────────────── */
export function slimSeed(res) {
  const p = res.party;
  return {
    party: { hours: p.hours, killsPerH: p.killsPerH, killsByPerH: p.killsByPerH, ttkS: p.ttkS, pullsPerH: p.pullsPerH, ttkBy: p.ttkBy || {} },
    heroes: res.heroes.map((h) => ({ style: h.style, level: h.level, hours: h.hours, raw: h.raw, takenPerH: h.takenPerH, takenBy: h.takenBy, healInPerH: h.healInPerH,
      healOutPerH: h.healOutPerH, regenPerH: h.regenPerH || 0, deaths: h.deaths, encMinHpPct: h.encMinHpPct, buysPerH: h.buysPerH, skillXpPerH: h.skillXpPerH, ended: h.ended,
      maxHp: h.maxHp, dealtPerH: h.dealtPerH, dealtToPerH: h.dealtToPerH || {}, hpUnder: h.hpUnder || {} })),
  };
}
/* the shape progression-grid.mjs cellRates reads (its slimResult's) */
const gridSeed = (s) => ({ party: s.party, heroes: s.heroes.map((h) => ({ ...h, healInPerH: h.healInPerH.total })) });

/** One cell's numbers. `D` the data of the tree that played it (its XP curve, contract, drops, supplies); `arch` matrix-plan archetypeTable. */
export function cellMetrics(D, meta, seeds, arch = {}) {
  const rates = cellRates(D, meta, seeds.map(gridSeed));
  const size = meta.styles.length;
  const ph = sum(seeds.map((s) => s.party.hours)) || 1e-9;
  const hh = sum(seeds.map((s) => sum(s.heroes.map((h) => h.hours)))) || 1e-9;
  const heroSum = (f) => sum(seeds.map((s) => sum(s.heroes.map((h) => f(h) * h.hours))));
  const dealt = heroSum((h) => h.dealtPerH || 0);
  const regen = heroSum((h) => h.regenPerH || 0);
  const buys = heroSum((h) => sum(Object.values(h.buysPerH || {})));
  /* store buys a party-hour by item (the ground-rate table's `buysPerH`: the town's T3 reads them) */
  const buysPerPartyH = {};
  for (const s of seeds) for (const h of s.heroes) for (const [id, n] of Object.entries(h.buysPerH || {})) buysPerPartyH[id] = (buysPerPartyH[id] || 0) + (n * h.hours) / ph;
  for (const id of Object.keys(buysPerPartyH)) buysPerPartyH[id] = r(buysPerPartyH[id], 1);
  /* each seat over its seeds: damage taken and its share of the party's (Tyler 11-21: the real healer took 28%), its own low points */
  const seats = meta.styles.map((style, i) => {
    const hs = seeds.map((s) => s.heroes[i]), hrs = sum(hs.map((h) => h.hours)) || 1e-9;
    const w = (f) => sum(hs.map((h) => f(h) * h.hours)) / hrs;
    return { style, takenPerH: r(w((h) => h.takenPerH)), dealtPerH: r(w((h) => h.dealtPerH || 0)), healOutPerH: r(w((h) => h.healOutPerH || 0)),
      hpUnder30: r(w((h) => h.hpUnder.p30 || 0), 4), hpUnder10: r(w((h) => h.hpUnder.p10 || 0), 4), deaths: sum(hs.map((h) => h.deaths)) };
  });
  const takenAll = sum(seats.map((s) => s.takenPerH || 0));
  for (const s of seats) s.takenShare = takenAll > 0 ? r((s.takenPerH || 0) / takenAll, 3) : null;
  const ttkAll = [0, 0];
  for (const s of seeds) for (const [ms, n] of Object.values(s.party.ttkBy || {})) { ttkAll[0] += ms; ttkAll[1] += n; }
  const xpAt = (l) => D.XP.charXpForLevel(l);
  const toNext = xpAt(meta.L + 1) - xpAt(meta.L);
  /* THE FIGHTS BY ARCHETYPE (matrix-plan.mjs rule): kills a party-hour, damage taken and dealt a hero-hour, seconds to kill */
  const byArch = {};
  const into = (axis, kind, k, v) => { const a = byArch[axis] || (byArch[axis] = {}); const g = a[kind] || (a[kind] = { killsPerH: 0, takenPerH: 0, dealtPerH: 0, ttkMs: 0, ttkN: 0 }); g[k] += v; };
  for (const s of seeds) {
    for (const [m, n] of Object.entries(s.party.killsByPerH || {})) for (const axis of ARCHETYPE_AXES) into(axis, (arch[m] || {})[axis] || '?', 'killsPerH', (n * s.party.hours) / ph);
    for (const [m, [ms, n]] of Object.entries(s.party.ttkBy || {})) for (const axis of ARCHETYPE_AXES) { into(axis, (arch[m] || {})[axis] || '?', 'ttkMs', ms); into(axis, (arch[m] || {})[axis] || '?', 'ttkN', n); }
    for (const h of s.heroes) {
      /* takenBy is the seed's total by attacker kind (cell.mjs keeps a hero's top six kinds) */
      for (const [m, n] of Object.entries(h.takenBy || {})) for (const axis of ARCHETYPE_AXES) into(axis, (arch[m] || {})[axis] || (m === 'status' ? 'status' : '?'), 'takenPerH', n / hh);
      for (const [m, n] of Object.entries(h.dealtToPerH || {})) for (const axis of ARCHETYPE_AXES) into(axis, (arch[m] || {})[axis] || '?', 'dealtPerH', (n * h.hours) / hh);
    }
  }
  for (const axis of Object.keys(byArch)) for (const g of Object.values(byArch[axis])) {
    g.ttkS = g.ttkN ? r(g.ttkMs / g.ttkN / 1000, 1) : null; delete g.ttkMs; delete g.ttkN;
    g.killsPerH = r(g.killsPerH, 1); g.takenPerH = r(g.takenPerH); g.dealtPerH = r(g.dealtPerH);
  }
  return {
    ...rates,
    dps: r(dealt / (ph * 3600), 2), dpsHero: r(dealt / (ph * 3600) / size, 2),
    healEventsPerH: rates.healedPerH, regenPerH: r(regen / hh), healPerH: r((rates.healedPerH || 0) + regen / hh),
    suppliesPerH: r(buys / hh, 1), ttkS: ttkAll[1] ? r(ttkAll[0] / ttkAll[1] / 1000, 2) : null,
    hpUnder30: seats.length ? Math.max(...seats.map((s) => s.hpUnder30 || 0)) : null, hpUnder10: seats.length ? Math.max(...seats.map((s) => s.hpUnder10 || 0)) : null,
    hoursPerLevel: rates.netLevelXpPerH > 0 ? r(toNext / rates.netLevelXpPerH, 3) : null,
    seatsM: seats, byArch, buysPerPartyH,
  };
}

/* ── ACROSS CELLS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const LEVEL_BANDS = Object.freeze([['early', 1, 45], ['mid', 46, 110], ['late', 111, 400], ['high', 401, Infinity]]);
export const levelBand = (L) => LEVEL_BANDS.find(([, a, b]) => L >= a && L <= b)[0];
export const wayOf = (c) => (c.party === 1 ? c.styles[0] : 'party:' + c.comp);
export const styleGroupOf = (way) => Object.entries(STYLE_GROUPS).find(([, ws]) => ws.includes(way))?.[0] || (way.startsWith('party') ? 'Party' : '?');

/** Solo against party, gear steps by slot class, ways against the best way, archetype totals. `cells` the run's cells with `m`. */
export function deriveMatrix(cells) {
  const ok = cells.filter((c) => c.m && c.block !== 'grounds');
  const at = new Map(ok.map((c) => [[c.L, c.gear, c.party, c.comp, c.tier, c.step || ''].join('|'), c]));
  const get = (L, gear, party, comp, tier, step = '') => at.get([L, gear, party, comp, tier, step].join('|')) || null;
  const ratio = (a, b) => (finite(a) && finite(b) && b !== 0 ? r(a / b, 3) : null);
  /* SOLO AGAINST PARTY: a four's head against the lone hammer, and against the same four ways each alone where they were played */
  const soloVsParty = [];
  for (const c of ok.filter((x) => x.party === 4 && !x.step && x.block !== 'lineups')) {
    const lone = get(c.L, c.gear, 1, 'h', c.tier);
    const alone = c.styles.map((s) => get(c.L, c.gear, 1, s === 'hammer' ? 'h' : s, c.tier)).filter(Boolean);
    const same = alone.length === c.styles.length ? sum(alone.map((x) => x.m.levelXpPerH)) / alone.length : null;
    soloVsParty.push({ L: c.L, gear: c.gear, tier: c.tier, comp: c.comp, xpHeadVsHammer: ratio(c.m.levelXpPerH, lone && lone.m.levelXpPerH), netHeadVsHammer: ratio(c.m.netPerH, lone && lone.m.netPerH),
      xpHeadVsSameAlone: ratio(c.m.levelXpPerH, same), dpsHeadVsHammer: ratio(c.m.dpsHero, lone && lone.m.dpsHero), deathsFour: c.m.deathsPer1000h, deathsLone: lone ? lone.m.deathsPer1000h : null,
      takenShare: Object.fromEntries(c.m.seatsM.map((s) => [s.style, s.takenShare])) });
  }
  /* GEAR STEPS BY SLOT CLASS: the full upper state against it with one class a state back (what that class's upgrade is worth) */
  const upgrades = [];
  for (const c of ok.filter((x) => x.step)) {
    const full = get(c.L, c.gear, c.party, c.comp, c.tier);
    if (!full) continue;
    upgrades.push({ L: c.L, way: wayOf(c), from: c.stepFrom, to: c.gear, cls: c.stepClass, tier: c.tier,
      xp: full.m.levelXpPerH && c.m.levelXpPerH ? r(full.m.levelXpPerH / c.m.levelXpPerH - 1, 3) : null,
      dps: full.m.dps && c.m.dps ? r(full.m.dps / c.m.dps - 1, 3) : null,
      lessTaken: full.m.takenPerH && c.m.takenPerH ? r(1 - full.m.takenPerH / c.m.takenPerH, 3) : null,
      gold: finite(full.m.netPerH) && finite(c.m.netPerH) ? r(full.m.netPerH - c.m.netPerH) : null });
  }
  /* EVERY WAY AGAINST THE BEST WAY, alone, same Level, gear and tier */
  const parity = [];
  const groups = new Map();
  for (const c of ok.filter((x) => x.party === 1 && !x.step)) { const k = [c.L, c.gear, c.tier].join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(c); }
  for (const [k, cs] of groups) {
    if (cs.length < 2) continue;
    const [L, gear, tier] = k.split('|');
    const best = (f) => Math.max(...cs.map((c) => c.m[f] || 0));
    const bx = best('levelXpPerH'), bd = best('dps'), bg = best('netPerH');
    parity.push({ L: Number(L), gear, tier, ways: Object.fromEntries(cs.map((c) => [c.styles[0], { group: styleGroupOf(c.styles[0]), dps: c.m.dps, dpsVsBest: ratio(c.m.dps, bd), xpVsBest: ratio(c.m.levelXpPerH, bx),
      netVsBest: bg > 0 ? ratio(c.m.netPerH, bg) : null, deathsPer1000h: c.m.deathsPer1000h, lowHpTypical: c.m.lowHpTypical, hpUnder30: c.m.hpUnder30 }])) });
  }
  /* ARCHETYPES over every cell: kills, damage taken and dealt, seconds to kill, by role / shape / class (summed rates, and mean time to kill) */
  const archetypes = {};
  for (const c of ok) for (const [axis, kinds] of Object.entries(c.m.byArch || {})) for (const [kind, g] of Object.entries(kinds)) {
    const a = archetypes[axis] || (archetypes[axis] = {}), t = a[kind] || (a[kind] = { cells: 0, killsPerH: 0, takenPerH: 0, dealtPerH: 0, ttkS: [] });
    t.cells++; t.killsPerH += g.killsPerH || 0; t.takenPerH += g.takenPerH || 0; t.dealtPerH += g.dealtPerH || 0; if (finite(g.ttkS)) t.ttkS.push(g.ttkS);
  }
  for (const a of Object.values(archetypes)) for (const t of Object.values(a)) {
    t.ttkS = t.ttkS.length ? r(sum(t.ttkS) / t.ttkS.length, 1) : null;
    const dealtPerKill = t.killsPerH > 0 ? t.dealtPerH / t.killsPerH : null;
    t.takenPerKill = t.killsPerH > 0 ? r(t.takenPerH / t.killsPerH, 1) : null; t.dealtPerKill = r(dealtPerKill, 1);
    for (const k of ['killsPerH', 'takenPerH', 'dealtPerH']) t[k] = r(t[k] / t.cells, 1);
  }
  /* THE LINEUPS (matrix-plan.mjs LINEUPS, 52-review-combat 10.4): each four on Deadly against the mixed four of the same block, Level and seeds */
  const lineups = [];
  const lu = ok.filter((c) => c.block === 'lineups');
  for (const c of lu) {
    const ref = lu.find((x) => x.L === c.L && x.tier === c.tier && x.styles.join() === 'tank,healer,bow,mage');
    lineups.push({ L: c.L, tier: c.tier, styles: c.styles, xpVsMixed: ref ? ratio(c.m.levelXpPerH, ref.m.levelXpPerH) : null, killsVsMixed: ref ? ratio(c.m.killsPerH, ref.m.killsPerH) : null,
      levelXpPerH: c.m.levelXpPerH, killsPerH: c.m.killsPerH, lowHpTypical: c.m.lowHpTypical, lowHpP10: c.m.lowHpP10, deathsPer1000h: c.m.deathsPer1000h, hpUnder30: c.m.hpUnder30,
      storePerH: c.m.storePerH, takenShare: Object.fromEntries(c.m.seatsM.map((s, i) => [i + ':' + s.style, s.takenShare])), seeds: c.m.sample ? c.m.sample.seeds : null });
  }
  return { soloVsParty, upgrades, parity, archetypes, lineups };
}

/* ── THE JUDGE: standards.mjs's bands, per way ─────────────────────────────────────────────────────────────────────────────────── */
/** Grid-shaped cells for grid-derive.mjs (the grid's own judge, so the matrix and the grid can never read a band two ways). */
const asGrid = (cells) => ({ run: 'matrix', cells: Object.fromEntries(cells.map((c) => [c.key, { key: c.key, L: c.L, gear: c.gear, party: c.party, comp: c.comp, tier: c.tier,
  ground: c.ground, styles: c.styles, stretch: c.stretch, ...(c.step ? { step: c.step } : {}), rates: c.m }])) });
/**
 * Every band row on the matrix: the hammer and the parties as the grid frames them, and each other way's lone rows on its own frame.
 * Answers [{ way, band, group, label, at, value, status, dist, ... }].
 */
export function judgeMatrix(D, K, cells) {
  const frame = cells.filter((c) => c.m && c.block !== 'grounds' && c.block !== 'lineups');
  const parties = frame.filter((c) => c.party > 1);
  const rows = [];
  const lone = (way) => frame.filter((c) => c.party === 1 && c.styles[0] === way && (way === 'hammer' || !c.step));
  const ways = [...new Set(frame.filter((c) => c.party === 1).map((c) => c.styles[0]))];
  for (const way of ways.sort((a, b) => (a === 'hammer' ? -1 : b === 'hammer' ? 1 : a.localeCompare(b)))) {
    const j = judgeGrid(D, asGrid([...lone(way), ...parties]), { K });
    for (const row of j.rows) {
      if (row.status === 'n/a' && row.value === null) continue;
      if (way !== 'hammer' && !/ x1 /.test(row.at)) continue;
      rows.push({ way, ...row });
    }
  }
  return rows;
}

/* ── THE DIFF ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const RANK = { ok: 0, off: 1, RED: 2 };
/** Does the patch target this band? A target is a band id, an id prefix ('S1' takes 'S1.mid'), a band group, or 'all'. */
export function targets(patch, band) {
  const t = (patch && patch.targets) || [];
  const b = STD.bandById(band);
  return t.some((x) => x === 'all' || x === band || band.startsWith(x + '.') || (b && x === b.group) || (b && x === 'group:' + b.group));
}
/**
 * The diff of two judged runs of the same plan. Answers { bands: [{ way, band, at, before, after, statusBefore, statusAfter, flag, direction }],
 * cells: [{ key, block, way, L, gear, party, tier, step, metrics: { id: [before, after, delta%] }, seats }], counts }.
 * A band row MOVED when its status changed or its distance outside the band moved by more than `tol` (a share of the bound).
 */
export function diffMatrices(before, after, patch, o = {}) {
  const tol = o.tol ?? 0.01;
  const key = (x) => x.way + '|' + x.band + '|' + x.at;
  const A = new Map(after.rows.map((x) => [key(x), x]));
  const bands = [];
  for (const b of before.rows) {
    const a = A.get(key(b));
    if (!a || !(b.status in RANK) || !(a.status in RANK)) continue;
    const moved = a.status !== b.status || Math.abs((a.dist || 0) - (b.dist || 0)) > tol;
    if (!moved) continue;
    const better = RANK[a.status] < RANK[b.status] || (RANK[a.status] === RANK[b.status] && (a.dist || 0) < (b.dist || 0));
    const flag = targets(patch, b.band) ? (better ? 'IMPROVED' : 'REGRESSED') : 'UNINTENDED';
    bands.push({ way: b.way, band: b.band, group: b.group, at: b.at, before: b.value, after: a.value, statusBefore: b.status, statusAfter: a.status, flag, direction: better ? 'toward' : 'away' });
  }
  const AC = new Map(after.cells.map((c) => [c.key, c]));
  const cells = [];
  for (const c of before.cells) {
    const d = AC.get(c.key);
    if (!c.m || !d || !d.m) continue;
    const metrics = {};
    for (const id of METRIC_IDS) {
      const x = c.m[id], y = d.m[id];
      if (!finite(x) && !finite(y)) continue;
      metrics[id] = [x, y, finite(x) && finite(y) && x !== 0 ? r((y - x) / Math.abs(x), 4) : null];
    }
    const seats = c.m.seatsM.map((s, i) => ({ style: s.style, takenShare: [s.takenShare, d.m.seatsM[i] && d.m.seatsM[i].takenShare], takenPerH: [s.takenPerH, d.m.seatsM[i] && d.m.seatsM[i].takenPerH] }));
    cells.push({ key: c.key, block: c.block, way: wayOf(c), L: c.L, gear: c.gear, party: c.party, tier: c.tier, step: c.step || null, metrics, seats });
  }
  const counts = { IMPROVED: 0, REGRESSED: 0, UNINTENDED: 0 };
  for (const b of bands) counts[b.flag]++;
  return { bands, cells, counts };
}

/** The median change of each metric by an axis (style group, Level band, party, gear, tier), over the diffed cells. */
export function axisSummary(cells, axis) {
  const keyOf = { style: (c) => (c.party === 1 ? styleGroupOf(c.way) + ' ' + c.way : 'four ' + c.way.replace('party:', '')), level: (c) => levelBand(c.L), party: (c) => (c.party === 1 ? 'lone' : 'party of ' + c.party),
    gear: (c) => c.gear, tier: (c) => c.tier }[axis];
  const out = {};
  for (const c of cells.filter((x) => !x.step)) {
    const k = keyOf(c), g = out[k] || (out[k] = {});
    for (const [id, [, , d]] of Object.entries(c.metrics)) if (finite(d)) (g[id] || (g[id] = [])).push(d);
  }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  return Object.fromEntries(Object.entries(out).map(([k, g]) => [k, Object.fromEntries(Object.entries(g).map(([id, xs]) => [id, { median: r(med(xs), 4), min: r(Math.min(...xs), 4), max: r(Math.max(...xs), 4), n: xs.length }]))]));
}

export { statusOf };
