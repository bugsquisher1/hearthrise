// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/baseline/compare.mjs — A RESULT, ITS NOISE, ITS VIEWS, AND A CANDIDATE SIDE BY SIDE WITH THE BASELINE
// (Tyler 2026-11-21, Phase 7 and deliverable 8; lane/bl-baseline).
//
//   hydrate(doc)            a results file -> cells with each outcome's seeds and stats ([n, mean, sd]) and the pooled deaths and hours
//   computeViews(cells, x)  the readings across cells (equipment value, ground viability, solo and party, long-term scaling, pooled deaths,
//                           way parity, time to the top of live content): rows { id, category, key, value, se } or a Poisson count
//   noiseTable(doc)         each outcome's run-to-run noise over the cells: the median and 90th percentile relative standard error, and
//                           the smallest move a comparison of two such cells can tell from noise
//   compareDocs(A, B, o)    every shared cell's every outcome and every view row, before and after: the change, its noise and a flag; each
//                           of BL-3's NEW-GAME targets (o.targets, loadTargets) read toward or away; a verdict a category: IMPROVEMENT,
//                           REGRESSION, TRADEOFF, MOVED (no target), MOVED INSIDE ITS TARGETS or WITHIN NOISE, and UNEXPECTED where the
//                           change did not mean to move it (o.intent). The current game's rulings and standards.mjs bands judge nothing
//                           here (Tyler 2026-11-21: the game is being redone; they are neither constraints nor targets)
//   printCompare / printBaseline   the reports, grouped by Tyler's eight categories
//
// THE NOISE RULE. A cell's outcome is the mean of its seeds; its standard error is sd / sqrt(n). Two cells differ beyond noise when
// |after - before| >= Z_NOISE x sqrt(se_before^2 + se_after^2) AND the move is at least MIN_REL of the before value. Deaths are counts: two
// pooled rates are compared as Poisson rates (z on the counts over their hours). A seed's dice are the same on both trees (seedBase k), so the
// unpaired rule is CONSERVATIVE: a real paired move reads as noise before noise reads as a move.
// ════════════════════════════════════════════════════════════════════════
import { OUTCOMES, CATEGORIES, CATEGORY_IDS, cellStats, moments } from './outcomes.mjs';

export const RESULT_SCHEMA = 'hearthrise.balance-baseline/1';
export const Z_NOISE = 2;
export const MIN_REL = 0.01;
/* a move at least this large (beyond noise) is listed by name in a category's attention list */
export const LARGE_REL = 0.10;
/* a reader row (the matrix judge's value, stored at join) has no seed error of its own: a move under this is held as noise */
export const READER_MIN_REL = 0.02;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const r = (x, d = 4) => (finite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const sum = (xs) => xs.reduce((a, b) => a + (finite(b) ? b : 0), 0);
const median = (xs) => { const s = xs.filter(finite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const quant = (xs, p) => { const s = xs.filter(finite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))] : null; };
const CAT_LABEL = Object.fromEntries(CATEGORIES);

/* ── A RESULTS FILE ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Seeds as stored (rows in doc.outcomeIds order, then _hh and _wall) -> objects; each cell gets its stats. */
export function hydrate(doc) {
  const ids = doc.outcomeIds;
  const cells = doc.cells.map((c) => {
    if (c.error) return c;
    const seeds = c.seeds.map((row) => { const o = {}; ids.forEach((id, i) => { o[id] = row[i]; }); o._hh = row[ids.length]; o._wall = row[ids.length + 1]; return o; });
    return { ...c, seedRows: seeds, ...cellStats(seeds) };
  });
  return { ...doc, cells };
}
/** One cell's outcome: { mean, se, n } (se null under two seeds). */
export function stat(c, id) {
  const s = c && c.stats && c.stats[id];
  if (!s || !s[0]) return { n: 0, mean: null, se: null };
  return { n: s[0], mean: s[1], se: finite(s[2]) ? s[2] / Math.sqrt(s[0]) : null };
}
const relSe = (s) => (finite(s.mean) && s.mean !== 0 && finite(s.se) ? Math.abs(s.se / s.mean) : null);
const ratioOf = (a, b) => (finite(a.mean) && finite(b.mean) && b.mean !== 0 ? { mean: a.mean / b.mean, se: finite(relSe(a)) && finite(relSe(b)) ? Math.abs(a.mean / b.mean) * Math.sqrt(relSe(a) ** 2 + relSe(b) ** 2) : null } : { mean: null, se: null });

/* ── THE VIEWS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const isFrame = (c) => c && !c.error && !c.step && !c.variant && c.block !== 'grounds' && c.block !== 'lineups' && c.block !== 'beyond';
const standardFour = (c) => c.party === 4 && (c.block === 'four' || c.block === 'pace4');
const levelBandOf = (L) => (L < 30 ? '1-29' : L < 60 ? '30-59' : '60+');

/**
 * Rows across cells. `x.toNext(L)`: Level XP from L to L+1 on the tree's curve (the join holds it); `x.spec`: the scenario spec.
 * A row: { id, category, key, label, value, se } (a ratio's se by the delta method) or { ..., k, t } (a Poisson count k over t hero-hours).
 */
export function computeViews(cells, x) {
  const ok = cells.filter((c) => !c.error && c.stats);
  const rows = [];
  const add = (id, category, key, label, v, better = null) => { if (v && (finite(v.mean) || finite(v.k))) rows.push({ id, category, key: id + '|' + key, label, value: finite(v.mean) ? r(v.mean, 6) : null, se: finite(v.se) ? r(v.se, 6) : null, ...(finite(v.k) ? { k: v.k, t: r(v.t, 3) } : {}), better }); };
  const find = (pred) => ok.find(pred);
  const ways = [...new Set(ok.filter((c) => c.party === 1 && isFrame(c)).map((c) => c.styles[0]))].sort();
  const spine = x.spec.spine, levels = x.spec.levels, top = x.spec.liveTop;
  const loneAt = (way, L, gear = 'mid', tier = 'normal') => find((c) => isFrame(c) && c.party === 1 && c.styles[0] === way && c.L === L && c.gear === gear && c.tier === tier);
  const fourAt = (L, gear = 'mid', tier = 'normal') => find((c) => isFrame(c) && standardFour(c) && c.L === L && c.gear === gear && c.tier === tier);

  /* PROGRESSION: hours from the first checkpoint to the top of live content, each way alone and the four, MID, Normal. A Level's hours are
     its XP to the next over the after-deaths rate, the rate log-linear between checkpoints; the error carries each checkpoint's share */
  const timeTo = (cellAt, from, to) => {
    const pts = levels.map((L) => [L, cellAt(L)]).filter(([, c]) => c && stat(c, 'netLevelXpPerH').mean > 0).map(([L, c]) => [L, stat(c, 'netLevelXpPerH')]);
    if (pts.length < 2 || !x.toNext) return null;
    const share = new Map(pts.map(([L]) => [L, 0]));
    let hours = 0;
    for (let l = Math.max(from, pts[0][0]); l < to; l++) {
      /* the checkpoints either side of l (past the last: its rate held flat) */
      let ia = 0;
      for (let k = 0; k < pts.length; k++) if (pts[k][0] <= l) ia = k;
      const ib = Math.min(ia + 1, pts.length - 1);
      const [La, a] = pts[ia], [Lb, b] = pts[ib];
      const w = Lb === La ? 0 : Math.min(1, Math.max(0, (l - La) / (Lb - La)));
      const rate = Math.exp((1 - w) * Math.log(a.mean) + w * Math.log(b.mean));
      const h = x.toNext(l) / rate;
      hours += h;
      share.set(La, share.get(La) + h * (1 - w));
      if (Lb !== La) share.set(Lb, share.get(Lb) + h * w);
    }
    const se = Math.sqrt(pts.reduce((s, [L, v]) => s + (share.get(L) * (relSe(v) || 0)) ** 2, 0));
    return { mean: hours, se };
  };
  for (const way of ways) add('timeToTop', 'progression', 'lone ' + way, 'Hours from Level ' + levels[0] + ' to ' + top + ', ' + way + ' alone, MID, Normal', timeTo((L) => loneAt(way, L), levels[0], top), 'down');
  const four0 = levels.find((L) => fourAt(L));
  if (four0) add('timeToTop', 'progression', 'four', 'Hours from Level ' + four0 + ' to ' + top + ', the standard four, MID, Normal', timeTo((L) => fourAt(L), four0, top), 'down');
  for (const L of spine) { const t = timeTo((l) => loneAt('hammer', l), levels[0], L); if (t && L > levels[0]) add('timeTo', 'progression', 'lone hammer|' + L, 'Hours from Level ' + levels[0] + ' to ' + L + ', the lone hammer', t, 'down'); }

  /* LONG-TERM SCALING: the hours a Level takes along the Level line, and how the last spine Level compares with Level 30 */
  for (const way of [...ways, 'four']) for (const L of levels) {
    const c = way === 'four' ? fourAt(L) : loneAt(way, L);
    if (c) add('hoursPerLevel', 'scaling', way + '|' + L, 'Hours for the next Level at ' + L + ', ' + way, stat(c, 'hoursPerLevel'), 'down');
  }
  const mid = spine.includes(30) ? 30 : spine[Math.floor(spine.length / 2)];
  for (const way of [...ways, 'four']) {
    const at = (L) => (way === 'four' ? fourAt(L) : loneAt(way, L));
    const a = at(top), b = at(mid);
    if (a && b) {
      add('hplGrowth', 'scaling', way, 'Hours a Level at ' + top + ' over at ' + mid + ', ' + way, ratioOf(stat(a, 'hoursPerLevel'), stat(b, 'hoursPerLevel')), null);
      add('netGoldGrowth', 'scaling', way, 'Net gold an hour at ' + top + ' over at ' + mid + ', ' + way, ratioOf(stat(a, 'netPerH'), stat(b, 'netPerH')), null);
      add('takenGrowth', 'scaling', way, 'Damage taken an hour at ' + top + ' over at ' + mid + ', ' + way, ratioOf(stat(a, 'takenPerH'), stat(b, 'takenPerH')), null);
    }
  }

  /* COMBAT: each way's damage, kills and Level XP over the median way at the same Level (MID, Normal): the spread of the ways */
  for (const L of spine) {
    const cs = ways.map((w) => [w, loneAt(w, L)]).filter(([, c]) => c);
    for (const id of ['dps', 'killsPerH', 'levelXpPerH']) {
      const med = median(cs.map(([, c]) => stat(c, id).mean));
      if (!finite(med) || med === 0) continue;
      for (const [w, c] of cs) { const s = stat(c, id); add('wayParity.' + id, 'combat', w + '|' + L, w + ' ' + id + ' over the median way at ' + L, { mean: s.mean / med, se: finite(s.se) ? s.se / med : null }, null); }
    }
  }

  /* EQUIPMENT VALUE: each gear state over the one below (lone ways and the four, Normal), and each slot class's step */
  for (const who of [...ways, 'four']) for (const L of spine) {
    const at = (g) => (who === 'four' ? fourAt(L, g) : loneAt(who, L, g));
    for (const [hi, lo] of [['mid', 'low'], ['bis', 'mid']]) {
      const a = at(hi), b = at(lo);
      if (!a || !b) continue;
      for (const id of ['levelXpPerH', 'dps', 'takenPerH']) add('gearRatio.' + id, 'equipment', who + '|' + L + '|' + hi + '/' + lo, who + ' ' + id + ', ' + hi.toUpperCase() + ' over ' + lo.toUpperCase() + ' at ' + L, ratioOf(stat(a, id), stat(b, id)), id === 'takenPerH' ? 'down' : 'up');
    }
  }
  for (const c of ok.filter((s) => s.block === 'steps' && s.step)) {
    const full = find((f) => isFrame(f) && f.L === c.L && f.gear === c.gear && f.party === c.party && f.comp === c.comp && f.tier === c.tier);
    if (!full) continue;
    for (const id of ['levelXpPerH', 'dps', 'takenPerH']) add('stepValue.' + id, 'equipment', c.comp + '|' + c.L + '|' + c.step, 'the ' + (c.stepClass || c.step) + ' step ' + (c.stepFrom || '') + '->' + c.gear + ', ' + id + ' full set over one class back, ' + c.comp + ' at ' + c.L, ratioOf(stat(full, id), stat(c, id)), id === 'takenPerH' ? 'down' : 'up');
  }

  /* HUNTING GROUND VIABILITY: each open ground and tier, both band ends, the lone hammer and the four: XP over the contract, net gold, deaths */
  const gcells = ok.filter((c) => c.block === 'grounds');
  for (const g of [...new Set(gcells.map((c) => c.ground))].sort()) for (const tier of ['normal', 'dangerous', 'deadly']) for (const size of [1, 2, 3, 4]) {
    const cs = gcells.filter((c) => c.ground === g && c.tier === tier && c.party === size && (c.compIndex || 0) === 0);
    if (!cs.length) continue;
    const mean = (id) => { const ss = cs.map((c) => stat(c, id)).filter((s) => finite(s.mean)); return ss.length ? { mean: sum(ss.map((s) => s.mean)) / ss.length, se: ss.every((s) => finite(s.se)) ? Math.sqrt(sum(ss.map((s) => s.se ** 2))) / ss.length : null } : null; };
    const who = size === 1 ? 'lone' : 'party of ' + size;
    add('ground.xContract', 'grounds', g + '|' + tier + '|' + size, g + ' ' + tier + ', ' + who + ': Level XP over the contract, mean of the band ends', mean('xContract'), null);
    add('ground.netPerH', 'grounds', g + '|' + tier + '|' + size, g + ' ' + tier + ', ' + who + ': net gold a hero-hour', mean('netPerH'), 'up');
    add('ground.killsPerH', 'grounds', g + '|' + tier + '|' + size, g + ' ' + tier + ', ' + who + ': kills a party-hour', mean('killsPerH'), 'up');
    add('ground.deaths', 'grounds', g + '|' + tier + '|' + size, g + ' ' + tier + ', ' + who + ': deaths in 1,000 hero-hours (pooled)', { k: sum(cs.map((c) => c.deaths)), t: sum(cs.map((c) => c.hh)), mean: null }, 'down');
  }

  /* SOLO AND PARTY: a four's, a pair's and the three's Level XP a head over the lone hammer at the same Level, gear and tier */
  for (const L of spine) for (const tier of ['normal', 'dangerous', 'deadly']) {
    const solo = loneAt('hammer', L, 'mid', tier);
    if (!solo) continue;
    for (const p of ok.filter((c) => isFrame(c) && c.party > 1 && c.L === L && c.gear === 'mid' && c.tier === tier)) {
      for (const id of ['levelXpPerH', 'netPerH']) add('partyOverSolo.' + id, 'party', p.comp + '|' + L + '|' + tier, p.styles.join(',') + ' ' + id + ' a head over the lone hammer at ' + L + ' ' + tier, ratioOf(stat(p, id), stat(solo, id)), null);
      if (p.party === 4) add('frontShare', 'party', p.comp + '|' + L + '|' + tier, 'the front seat\'s share of the damage, ' + p.styles.join(',') + ' at ' + L + ' ' + tier, stat(p, 'frontTakenShare'), null);
    }
  }

  /* SURVIVABILITY: deaths pooled over Levels, by party size, tier and gear (the frame), and by Level band */
  const frame = ok.filter(isFrame);
  for (const size of [...new Set(frame.map((c) => c.party))].sort()) for (const tier of ['normal', 'dangerous', 'deadly']) {
    for (const gear of ['low', 'mid', 'bis']) {
      const cs = frame.filter((c) => c.party === size && c.tier === tier && c.gear === gear);
      if (cs.length) add('deathsPooled', 'survival', size + '|' + tier + '|' + gear, 'deaths in 1,000 hero-hours, party of ' + size + ', ' + tier + ', ' + gear.toUpperCase() + ', every Level', { k: sum(cs.map((c) => c.deaths)), t: sum(cs.map((c) => c.hh)), mean: null }, 'down');
    }
    for (const band of ['1-29', '30-59', '60+']) {
      const cs = frame.filter((c) => c.party === size && c.tier === tier && levelBandOf(c.L) === band);
      if (cs.length) add('deathsByBand', 'survival', size + '|' + tier + '|' + band, 'deaths in 1,000 hero-hours, party of ' + size + ', ' + tier + ', Levels ' + band + ', every gear', { k: sum(cs.map((c) => c.deaths)), t: sum(cs.map((c) => c.hh)), mean: null }, 'down');
    }
  }

  /* PAST LIVE CONTENT (the beyond block: STAGED and PROJECTED grounds, never live): hours a Level, deaths, and Level XP, DPS and damage taken
     over the same seat at the top of live content and the same tier */
  for (const c of ok.filter((s) => s.block === 'beyond')) {
    const who = c.party === 1 ? c.styles[0] : 'four';
    const tag = ' at ' + c.L + ' (' + (c.stretch || 'past live') + ', not live), ' + who + ', ' + c.tier;
    add('beyond.hoursPerLevel', 'scaling', who + '|' + c.L + '|' + c.tier, 'Hours for the next Level' + tag, stat(c, 'hoursPerLevel'), 'down');
    add('beyond.deaths', 'scaling', who + '|' + c.L + '|' + c.tier, 'Deaths in 1,000 hero-hours' + tag, { k: c.deaths, t: c.hh, mean: null }, 'down');
    const at = who === 'four' ? fourAt(top, 'mid', c.tier) : loneAt(who, top, 'mid', c.tier);
    if (at) for (const id of ['levelXpPerH', 'dps', 'takenPerH']) add('beyond.overTop.' + id, 'scaling', who + '|' + c.L + '|' + c.tier, id + tag + ', over the same at ' + top, ratioOf(stat(c, id), stat(at, id)), null);
  }

  /* RESOURCE ECONOMY: net gold and the store's share by Level band, lone and the four, MID, each tier */
  for (const size of [1, 4]) for (const tier of ['normal', 'dangerous', 'deadly']) for (const band of ['1-29', '30-59', '60+']) {
    const cs = frame.filter((c) => c.party === size && c.gear === 'mid' && c.tier === tier && levelBandOf(c.L) === band && (size === 1 || standardFour(c)));
    for (const id of ['netPerH', 'storeShare', 'incomePerH']) {
      const ss = cs.map((c) => stat(c, id)).filter((s) => finite(s.mean));
      if (ss.length) add('econByBand.' + id, 'economy', size + '|' + tier + '|' + band, (size === 1 ? 'lone ways' : 'the four') + ' ' + id + ', ' + tier + ', Levels ' + band + ' (mean of cells)', { mean: sum(ss.map((s) => s.mean)) / ss.length, se: ss.every((s) => finite(s.se)) ? Math.sqrt(sum(ss.map((s) => s.se ** 2))) / ss.length : null }, id === 'storeShare' ? 'down' : 'up');
    }
  }
  return rows;
}

/* ── NOISE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Each outcome over the cells: the median and p90 relative standard error, and the smallest move a two-cell comparison resolves. */
export function noiseTable(doc) {
  const cells = doc.cells.filter((c) => !c.error && c.stats);
  return OUTCOMES.map(([id, label, category]) => {
    const rel = cells.map((c) => relSe(stat(c, id))).filter(finite);
    const zero = cells.filter((c) => { const s = stat(c, id); return s.n > 1 && s.se === 0; }).length;
    const m = median(rel), p90 = quant(rel, 0.9);
    return { id, label, category, cells: rel.length, medianRelSe: r(m, 6), p90RelSe: r(p90, 6), resolvesMedian: finite(m) ? r(Math.max(MIN_REL, Z_NOISE * Math.SQRT2 * m), 4) : null, resolvesP90: finite(p90) ? r(Math.max(MIN_REL, Z_NOISE * Math.SQRT2 * p90), 4) : null, identicalSeeds: zero };
  });
}

/* ── ONE COMPARISON ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Two normal readings: [delta, rel, z, flag]; flag 'moved' | 'noise' | 'unread'. */
export function judgeMove(a, b) {
  if (!finite(a.mean) || !finite(b.mean)) return { delta: null, rel: null, z: null, flag: 'unread' };
  const delta = b.mean - a.mean, rel = a.mean !== 0 ? delta / Math.abs(a.mean) : (delta === 0 ? 0 : null);
  const se = finite(a.se) && finite(b.se) ? Math.sqrt(a.se ** 2 + b.se ** 2) : null;
  const z = se > 0 ? delta / se : delta === 0 ? 0 : se === 0 ? Infinity * Math.sign(delta) : null;
  const big = rel === null ? delta !== 0 : Math.abs(rel) >= MIN_REL;
  const flag = delta === 0 ? 'noise' : z === null ? (big && Math.abs(rel || 1) >= 0.05 ? 'moved' : 'noise') : Math.abs(z) >= Z_NOISE && big ? 'moved' : 'noise';
  return { delta: r(delta, 6), rel: r(rel, 4), z: finite(z) ? r(z, 2) : z, flag };
}
/** Two Poisson counts over their hours: the rates in 1,000 hours, and z on the difference (a half-count floor so zero against zero reads). */
export function judgeRates(a, b) {
  if (!(a.t > 0) || !(b.t > 0)) return { before: null, after: null, rel: null, z: null, flag: 'unread' };
  const ra = a.k / a.t, rb = b.k / b.t;
  const se = Math.sqrt(Math.max(a.k, 0.5) / a.t ** 2 + Math.max(b.k, 0.5) / b.t ** 2);
  const z = (rb - ra) / se;
  return { before: r(1000 * ra, 2), after: r(1000 * rb, 2), rel: ra > 0 ? r((rb - ra) / ra, 4) : null, z: r(z, 2), flag: Math.abs(z) >= Z_NOISE ? 'moved' : 'noise' };
}

/* ── THE TARGETS (BL-3's target specification for the NEW game; Tyler 2026-11-21: rulings about the current game are neither constraints
   nor targets) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   A targets file: { schema: TARGET_SCHEMA, source, targets: [{ id, kind: 'hard' | 'soft' | 'hypothesis', category, on, where, lo, hi, label }] }.
     on      a cell outcome id (outcomes.mjs OUTCOMES), or 'view:<view id>' (computeViews: timeToTop, deathsPooled, gearRatio.levelXpPerH ...)
     where   for a cell: any of block, party, way (a lone cell's way, or 'four' for the standard four), styles (a party's seats in order), comp,
             L (a Level or [from, to]), gear, tier, ground (a name or a list each); step and variant cells match only when where names
             them. For a view: key, a pattern on the view row's key (e.g. '^timeToTop\\|lone ').
     lo, hi  the target range (null: no bound that side). A deaths view is read in deaths a 1,000 hero-hours.
   A target with no matching row is listed as UNREAD, never passed. */
export const TARGET_SCHEMA = 'hearthrise.balance-targets/1';
const asList = (x) => (Array.isArray(x) ? x : [x]);
function cellMatches(c, w = {}) {
  if ((c.step || c.variant) && !(w.step || w.variant || w.block)) return false;
  const way = c.party === 1 ? c.styles[0] : c.party === 4 && (c.block === 'four' || c.block === 'pace4') ? 'four' : c.styles.join(',');
  const L = c.L;
  return (w.block === undefined || asList(w.block).includes(c.block)) && (w.party === undefined || asList(w.party).includes(c.party))
    && (w.way === undefined || asList(w.way).includes(way)) && (w.styles === undefined || w.styles.join(',') === c.styles.join(','))
    && (w.comp === undefined || asList(w.comp).includes(c.comp)) && (w.gear === undefined || asList(w.gear).includes(c.gear))
    && (w.tier === undefined || asList(w.tier).includes(c.tier)) && (w.ground === undefined || asList(w.ground).includes(c.ground))
    && (w.step === undefined || asList(w.step).includes(c.step)) && (w.variant === undefined || asList(w.variant).includes(c.variant))
    && (w.L === undefined || (Array.isArray(w.L) ? L >= w.L[0] && L <= w.L[1] : L === w.L));
}
/** How far `v` sits outside [lo, hi], relative to the bound it crosses (0 inside). */
export function distOut(v, t) {
  if (!finite(v)) return null;
  if (finite(t.lo) && v < t.lo) return (t.lo - v) / Math.max(Math.abs(t.lo), 1e-9);
  if (finite(t.hi) && v > t.hi) return (v - t.hi) / Math.max(Math.abs(t.hi), 1e-9);
  return 0;
}
/* BL-3'S OWN FILE (tools/balance-program/targets.json, lane/bl-targets: the target inventory, every row a DESIGN HYPOTHESIS until the target
   work picks). A row names an area, a class, a band { lo, hi } and its readers: standards.mjs band ids whose VALUE the matrix's judge computes
   (their old lo / hi are never read here). Each row becomes a reader target ('reader:<ids>'). A row whose readers are another tool's or
   missing, or whose band has no number, stays listed as UNREAD with its reason. */
export const AREA_CATEGORY = Object.freeze({ pace: 'progression', party: 'party', style: 'combat', survival: 'survival', gear: 'equipment', sustain: 'survival', supply: 'economy', gold: 'economy', drops: 'economy', long: 'scaling' });
const KIND_OF_CLASS = Object.freeze({ HARD: 'hard', SOFT: 'soft', HYPOTHESIS: 'hypothesis' });
export function fromInventory(row, bandIds) {
  const readers = (row.readers || []).filter((x) => bandIds.has(x));
  const lo = row.band && finite(row.band.lo) ? row.band.lo : null, hi = row.band && finite(row.band.hi) ? row.band.hi : null;
  const why = !readers.length ? 'no matrix reader (' + ((row.readers || []).join(', ') || row.readerState || 'none') + ')'
    : lo === null && hi === null ? 'no number in its band (' + String((row.band && row.band.text) || '').slice(0, 80) + ')' : null;
  return { id: row.id, kind: KIND_OF_CLASS[row.class] || 'hypothesis', category: AREA_CATEGORY[row.area] || 'other', on: 'reader:' + readers.join('+'), lo, hi, label: row.metric, ...(why ? { unreadWhy: why } : {}) };
}
/** Target rows from a targets file: this report's own form (rows with `on`), or BL-3's inventory (rows with `area` and `readers`). */
export function loadTargets(doc, bandIds = null) {
  if (!doc) return [];
  if (doc.schema !== TARGET_SCHEMA) throw new Error('targets: ' + (doc.schema || 'no schema') + ' is not ' + TARGET_SCHEMA);
  if (doc.targets.some((x) => x.area && Array.isArray(x.readers))) {
    if (!bandIds) throw new Error('targets: an inventory file needs the band ids its readers name (standards.mjs BANDS)');
    return doc.targets.map((x) => fromInventory(x, bandIds));
  }
  for (const t of doc.targets) if (!t.id || !t.on || !CATEGORY_IDS.includes(t.category) || !['hard', 'soft', 'hypothesis'].includes(t.kind) || (!finite(t.lo) && !finite(t.hi))) throw new Error('targets: row ' + JSON.stringify(t).slice(0, 160) + ' needs id, on, a category of ' + CATEGORY_IDS.join('/') + ', a kind (hard, soft, hypothesis) and lo or hi');
  return doc.targets;
}
/** Each target against each matching item, before and after: { target, item, before, after, distBefore, distAfter, flag, direction }. */
export function judgeTargets(cmp, targets) {
  const rows = [];
  for (const t of targets) {
    if (t.unreadWhy) { rows.push({ target: t, item: null, unread: true, why: t.unreadWhy }); continue; }
    const readerIds = String(t.on).startsWith('reader:') ? t.on.slice(7).split('+') : null;
    const items = readerIds ? (cmp.readers || []).filter((x) => readerIds.includes(x.band)).map((x) => ({ item: x.band + ' ' + x.way + ' ' + x.at, before: x.before, after: x.after, flag: x.flag }))
      : String(t.on).startsWith('view:')
        ? cmp.views.filter((v) => v.id === t.on.slice(5) && (!t.where || !t.where.key || new RegExp(t.where.key).test(v.key))).map((v) => ({ item: v.key, before: v.before, after: v.after, flag: v.flag }))
        : cmp.cells.filter((c) => c.outs[t.on] && cellMatches(c, t.where)).map((c) => ({ item: c.key, before: c.outs[t.on].before, after: c.outs[t.on].after, flag: c.outs[t.on].flag }));
    if (!items.length) { rows.push({ target: t, item: null, unread: true, why: readerIds && !cmp.readers ? 'the results carry no reader rows' : 'nothing on these cells reads it' }); continue; }
    for (const x of items) {
      const db = distOut(x.before, t), da = distOut(x.after, t);
      const direction = x.flag !== 'moved' || !finite(db) || !finite(da) ? 'noise' : da < db ? 'toward' : da > db ? 'away' : 'held';
      rows.push({ target: t, ...x, distBefore: r(db, 4), distAfter: r(da, 4), direction, hardOut: t.kind === 'hard' && da > 0, newlyOut: t.kind === 'hard' && da > 0 && db === 0 });
    }
  }
  return rows;
}

/**
 * The candidate B against the baseline A (both hydrated). `o.targets` the target rows (loadTargets), `o.intent` the categories the change
 * means to move (a move beyond noise anywhere else is UNEXPECTED). Answers { cells, views, targets, categories, onlyA, onlyB, groundMoved }.
 */
export function compareDocs(A, B, o = {}) {
  const BC = new Map(B.cells.filter((c) => !c.error).map((c) => [c.key, c]));
  const AC = new Map(A.cells.filter((c) => !c.error).map((c) => [c.key, c]));
  const cells = [];
  for (const [key, a] of AC) {
    const b = BC.get(key);
    if (!b) continue;
    const outs = {};
    for (const [id] of OUTCOMES) {
      if (id === 'deaths') continue;
      if (id === 'deathsPer1000h') { const j = judgeRates({ k: a.deaths, t: a.hh }, { k: b.deaths, t: b.hh }); outs[id] = { ...j }; continue; }
      const sa = stat(a, id), sb = stat(b, id);
      if (!finite(sa.mean) && !finite(sb.mean)) continue;
      outs[id] = { before: r(sa.mean, 6), after: r(sb.mean, 6), ...judgeMove(sa, sb) };
    }
    cells.push({ key, block: a.block, L: a.L, gear: a.gear, party: a.party, comp: a.comp, tier: a.tier, ground: a.ground, groundAfter: b.ground, styles: a.styles, step: a.step || null, variant: a.variant || null, outs });
  }
  const VB = new Map((B.views || []).map((v) => [v.key, v]));
  const views = [];
  for (const v of A.views || []) {
    const w = VB.get(v.key);
    if (!w) continue;
    const j = finite(v.k) ? judgeRates({ k: v.k, t: v.t }, { k: w.k, t: w.t }) : judgeMove({ mean: v.value, se: v.se }, { mean: w.value, se: w.se });
    views.push({ key: v.key, id: v.id, category: v.category, label: v.label, before: finite(v.k) ? j.before : v.value, after: finite(v.k) ? j.after : w.value, ...j, ...(finite(v.k) ? { before: j.before, after: j.after } : {}) });
  }
  /* THE READER ROWS (the matrix judge's values on each tree, stored at join): paired by band, way and place. They carry no seed error of their
     own, so a move under READER_MIN_REL is held as noise */
  let readers = null;
  if (A.readers && B.readers) {
    const RB = new Map(B.readers.map(([band, way, at, value]) => [band + '|' + way + '|' + at, value]));
    readers = A.readers.filter(([band, way, at]) => RB.has(band + '|' + way + '|' + at)).map(([band, way, at, before]) => {
      const after = RB.get(band + '|' + way + '|' + at), rel = finite(before) && finite(after) && before !== 0 ? (after - before) / Math.abs(before) : null;
      const flag = finite(before) && finite(after) ? (Math.abs(rel === null ? after - before : rel) >= READER_MIN_REL ? 'moved' : 'noise') : 'unread';
      return { band, way, at, before, after, rel: r(rel, 4), flag };
    });
  }
  const cmp = { cells, views, readers };
  const trows = judgeTargets(cmp, o.targets || []);
  const intent = o.intent && o.intent.length ? o.intent : null;
  const categories = {};
  for (const id of CATEGORY_IDS) {
    const ts = trows.filter((x) => x.target.category === id && !x.unread);
    const toward = ts.filter((x) => x.direction === 'toward').length, away = ts.filter((x) => x.direction === 'away').length;
    const outIds = OUTCOMES.filter((x) => x[2] === id).map((x) => x[0]);
    const movedCells = cells.reduce((n, c) => n + outIds.filter((k) => c.outs[k] && c.outs[k].flag === 'moved').length, 0);
    const movedViews = views.filter((v) => v.category === id && v.flag === 'moved').length;
    const moved = movedCells + movedViews > 0;
    const verdict = toward && away ? 'TRADEOFF' : toward ? 'IMPROVEMENT' : away ? 'REGRESSION' : moved ? (ts.length ? 'MOVED, INSIDE ITS TARGETS' : 'MOVED (no target)') : 'WITHIN NOISE';
    categories[id] = { verdict, targets: new Set(ts.map((x) => x.target.id)).size, toward, away, hardOut: ts.filter((x) => x.hardOut).length, newlyOut: ts.filter((x) => x.newlyOut).length, movedCells, movedViews,
      unexpected: !!(intent && moved && !intent.includes(id)) };
  }
  const onlyA = [...AC.keys()].filter((k) => !BC.has(k)), onlyB = [...BC.keys()].filter((k) => !AC.has(k));
  const groundMoved = cells.filter((c) => c.ground !== c.groundAfter).map((c) => c.key + ': ' + c.ground + ' -> ' + c.groundAfter);
  return { cells, views, targets: trows, categories, intent, onlyA, onlyB, groundMoved, scenarioSame: !!(A.scenario && B.scenario && A.scenario.hash === B.scenario.hash) };
}

/* ── PRINTING ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const fmt = (v, d = 0) => (!finite(v) ? '-' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : d ? v.toFixed(d) : String(Math.round(v)));
const smart = (v) => (!finite(v) ? '-' : Math.abs(v) >= 100 ? fmt(v) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
const pct = (v) => (!finite(v) ? '-' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%');
const cellLabel = (c) => (c.block === 'grounds' ? c.ground + ' L' + c.L + ' x' + c.party + ' ' + c.tier : c.block === 'c2' ? 'C-2 ' + c.ground + ' L' + c.L + ' ' + c.tier : c.comp + ' L' + c.L + ' ' + c.gear + ' ' + c.tier + (c.step ? ' ' + c.step : ''));

/** The side-by-side report, by Tyler's eight categories. */
export function printCompare(cmp, A, B, o = {}, out = console.log) {
  const top = o.top || 8;
  out('BALANCE REGRESSION: ' + (B.label || 'candidate') + ' against ' + (A.label || 'baseline') + ' (the same scenarios, seeds and harness)');
  out('  baseline  game ' + short(A) + ', harness ' + shortH(A) + ', ' + A.cells.length + ' cells, scenario ' + (A.scenario || {}).hash);
  out('  candidate game ' + short(B) + ', harness ' + shortH(B) + ', ' + B.cells.length + ' cells, scenario ' + (B.scenario || {}).hash + (B.manifest && B.manifest.change && (B.manifest.change.names || []).length ? ', with ' + B.manifest.change.names.join(', ') : ''));
  if (!cmp.scenarioSame) out('  WARNING: the scenario hashes differ: the two played different cells or outcome rules; only shared cells are compared');
  if (A.manifest && B.manifest && A.manifest.hashes.harness.sha256 !== B.manifest.hashes.harness.sha256) out('  WARNING: the harness differs between the two runs (' + A.manifest.hashes.harness.sha256.slice(0, 12) + ' vs ' + B.manifest.hashes.harness.sha256.slice(0, 12) + '): a move may be the harness, not the game'
    + (o.harnessFiles ? '. Instrument files that differ between the two harness commits: ' + (o.harnessFiles.length ? o.harnessFiles.join(', ') : 'none tracked (the run target or a record differs, not the code)') : ''));
  out('  shared cells ' + cmp.cells.length + ', only in the baseline ' + cmp.onlyA.length + ', only in the candidate ' + cmp.onlyB.length + (cmp.groundMoved.length ? ', cells whose advised ground changed ' + cmp.groundMoved.length + ' (e.g. ' + cmp.groundMoved.slice(0, 3).join('; ') + ')' : ''));
  out('  the noise rule: a move counts when |change| >= ' + Z_NOISE + ' x its combined standard error and >= ' + (MIN_REL * 100) + '% (deaths: Poisson z >= ' + Z_NOISE + ')');
  const nT = new Set(cmp.targets.map((x) => x.target.id)).size;
  out('  the target rule: ' + (nT ? nT + ' targets from BL-3\'s file (the inventory\'s rows are design hypotheses until the target work picks): a move toward a target\'s range is an improvement, away a regression, a hard target left is named' : 'no target file given: every change is plain movement, its size against its noise') + (cmp.intent ? '; the change means to move ' + cmp.intent.join(', ') + ' (a move elsewhere is UNEXPECTED)' : ''));
  out('\nVERDICTS');
  for (const [id, label] of CATEGORIES) { const v = cmp.categories[id]; out('  ' + label.padEnd(28) + (v.verdict + (v.unexpected ? ', UNEXPECTED' : '')).padEnd(38) + (v.targets ? 'targets ' + v.targets + ': toward ' + v.toward + ', away ' + v.away + (v.hardOut ? ', hard out ' + v.hardOut + ' (' + v.newlyOut + ' new)' : '') + '; ' : '') + 'cell outcomes moved ' + v.movedCells + ', view rows moved ' + v.movedViews); }
  const unread = cmp.targets.filter((x) => x.unread);
  if (unread.length) {
    const why = {};
    for (const x of unread) { const k = String(x.why || 'nothing reads it').replace(/ \(.*$/, ''); (why[k] || (why[k] = [])).push(x.target.id); }
    out('  UNREAD targets: ' + unread.length + ' of ' + nT + ' (' + Object.entries(why).map(([k, ids]) => k + ': ' + ids.length + ', e.g. ' + ids.slice(0, 4).join(' ')).join('; ') + ')');
  }
  for (const [id, label] of CATEGORIES) {
    const v = cmp.categories[id];
    out('\n== ' + label.toUpperCase() + ' (' + v.verdict + (v.unexpected ? ', UNEXPECTED' : '') + ')');
    const ts = cmp.targets.filter((x) => x.target.category === id && !x.unread);
    if (ts.length) {
      const shown = [...ts.filter((x) => x.direction === 'away' || x.newlyOut), ...ts.filter((x) => x.direction === 'toward')].slice(0, top);
      out('  TARGETS: ' + ts.length + ' readings of ' + v.targets + ' targets; ' + (shown.length ? 'the moves:' : 'none moved beyond noise'));
      for (const x of shown) out('    ' + (x.direction === 'toward' ? 'IMPROVED  ' : 'REGRESSED ') + (x.target.id + ' (' + x.target.kind + ')').padEnd(24) + String(x.item).slice(0, 40).padEnd(41) + smart(x.before).padStart(9) + ' -> ' + smart(x.after).padStart(9) + '  [' + (finite(x.target.lo) ? smart(x.target.lo) : '') + ', ' + (finite(x.target.hi) ? smart(x.target.hi) : '') + ']' + (x.newlyOut ? '  HARD TARGET NEWLY OUT' : ''));
    } else out('  TARGETS: none in this category: plain movement');
    const outIds = OUTCOMES.filter((x) => x[2] === id);
    if (outIds.length) {
      out('  OUTCOMES over ' + cmp.cells.length + ' shared cells: moved up / moved down / within noise | median change of the moved | the largest moves');
      for (const [oid] of outIds) {
        const xs = cmp.cells.filter((c) => c.outs[oid]).map((c) => [c, c.outs[oid]]);
        const isUp = (m) => (finite(m.rel) ? m.rel > 0 : m.after > m.before);
        const up = xs.filter(([, m]) => m.flag === 'moved' && isUp(m)), down = xs.filter(([, m]) => m.flag === 'moved' && !isUp(m));
        const still = xs.filter(([, m]) => m.flag === 'noise').length;
        if (!up.length && !down.length) { out('    ' + oid.padEnd(20) + '   0 /   0 / ' + String(still).padStart(4) + '   within noise everywhere'); continue; }
        const big = [...up, ...down].sort((p, q) => Math.abs(q[1].rel || 0) - Math.abs(p[1].rel || 0)).slice(0, 2).map(([c, m]) => cellLabel(c) + ' ' + smart(m.before) + '->' + smart(m.after) + ' (' + pct(m.rel) + ')');
        out('    ' + oid.padEnd(20) + String(up.length).padStart(4) + ' / ' + String(down.length).padStart(3) + ' / ' + String(still).padStart(4) + '   ' + pct(median([...up, ...down].map(([, m]) => m.rel))).padStart(7) + '   ' + big.join('; '));
      }
    }
    const vs = cmp.views.filter((x) => x.category === id);
    if (vs.length) {
      const moved = vs.filter((x) => x.flag === 'moved');
      out('  VIEWS: ' + vs.length + ' rows, ' + moved.length + ' moved beyond noise. Side by side (before | after | change | z):');
      const show = o.allViews ? vs : [...[...moved].sort((p, q) => Math.abs(q.rel || 0) - Math.abs(p.rel || 0)).slice(0, top), ...vs.filter((x) => x.flag !== 'moved' && HEADLINE.has(x.id)).slice(0, top)];
      for (const x of show) out('    ' + (x.flag === 'moved' ? '* ' : '  ') + x.label.slice(0, 86).padEnd(87) + smart(x.before).padStart(9) + ' | ' + smart(x.after).padStart(9) + ' | ' + pct(x.rel).padStart(7) + ' | ' + (finite(x.z) ? x.z.toFixed(1) : '-'));
    }
    const large = cmp.cells.flatMap((c) => outIds.map(([oid]) => [c, oid, c.outs[oid]])).filter(([, , m]) => m && m.flag === 'moved' && Math.abs(m.rel || 0) >= LARGE_REL);
    if (large.length) out('  LARGE MOVES (beyond noise and over ' + LARGE_REL * 100 + '%): ' + large.length + ' cell outcomes, e.g. ' + large.sort((p, q) => Math.abs(q[2].rel) - Math.abs(p[2].rel)).slice(0, 4).map(([c, oid, m]) => oid + ' ' + cellLabel(c) + ' ' + pct(m.rel)).join('; '));
  }
}
/* the view rows printed even when they did not move: the headline readings of each category */
const HEADLINE = new Set(['timeToTop', 'hplGrowth', 'deathsPooled', 'ground.xContract', 'partyOverSolo.levelXpPerH']);
const short = (d) => (d.manifest && d.manifest.tree ? (d.manifest.tree.game.label || d.manifest.tree.game.ref) + ' ' + String(d.manifest.tree.game.sha).slice(0, 9) : '?');
const shortH = (d) => (d.manifest && d.manifest.tree ? (d.manifest.playedBy ? 'played by ' + String(d.manifest.playedBy).slice(0, 9) + ', joined by ' : '') + String(d.manifest.tree.harness.sha).slice(0, 9) + (d.manifest.tree.harness.dirty ? '+dirty' : '') : '?');

/** The baseline itself: the pin, the sample, the noise, the views by category, the calibration. */
export function printBaseline(doc, o = {}, out = console.log) {
  const m = doc.manifest || {};
  out('BALANCE BASELINE ' + (doc.label || '') + ': ' + doc.cells.length + ' cells (' + doc.cells.filter((c) => c.error).length + ' errors), scenario ' + (doc.scenario || {}).id + ' ' + (doc.scenario || {}).hash);
  if (m.tree) out('  game ' + m.tree.game.ref + ' ' + m.tree.game.sha + ' | harness ' + m.tree.harness.sha + (m.tree.harness.dirty ? ' (dirty)' : '') + ' | standards.mjs ' + (m.hashes ? m.hashes.standards.sha256.slice(0, 16) : '?') + (m.tree.harness.standardsCommit ? ' (commit ' + m.tree.harness.standardsCommit.slice(0, 9) + ')' : ''));
  if (m.hashes) out('  src/data ' + m.hashes.srcData.sha256.slice(0, 16) + ' (' + m.hashes.srcData.files + ' files) | engine ' + m.hashes.engine.sha256.slice(0, 16) + ' | edge settle ' + m.hashes.edgeSettle.sha256.slice(0, 16) + ' | catalogues ' + m.hashes.catalogues.sha256.slice(0, 16) + ' (' + m.hashes.catalogues.files + ') | config ' + m.hashes.config.sha256.slice(0, 16) + ' | build ' + (m.config ? m.config.build.version : '?'));
  if (doc.runtime) out('  played: ' + doc.runtime.jobs + ' seed jobs, ' + doc.runtime.heroHours + ' hero-hours, ' + doc.runtime.workerS + ' worker-s on ' + doc.runtime.shards + ' shards' + (doc.runtime.run ? ', GitHub run ' + doc.runtime.run : ''));
  const blocks = {};
  for (const c of doc.cells) { const b = blocks[c.block] || (blocks[c.block] = { cells: 0, hh: 0 }); b.cells++; b.hh += c.hh || 0; }
  out('  blocks: ' + Object.entries(blocks).map(([k, b]) => k + ' ' + b.cells + ' (' + Math.round(b.hh) + ' hero-h)').join(', '));
  out('\nNOISE (' + (((doc.scenario || {}).spec || {}).seeds || '?') + ' seeds a cell; relative standard error of a cell\'s mean, over the cells; the smallest change one cell against one cell resolves)');
  for (const n of noiseTable(doc)) out('  ' + n.id.padEnd(20) + ' median ' + pct(n.medianRelSe).replace('+', '').padStart(6) + '  p90 ' + pct(n.p90RelSe).replace('+', '').padStart(6) + '  resolves ' + pct(n.resolvesMedian).replace('+', '').padStart(6) + ' (p90 cell ' + pct(n.resolvesP90).replace('+', '') + ')' + (n.identicalSeeds ? '  ' + n.identicalSeeds + ' cells identical across seeds' : ''));
  for (const [id, label] of CATEGORIES) {
    const vs = (doc.views || []).filter((v) => v.category === id && (o.allViews || HEADLINE.has(v.id) || v.id === 'hoursPerLevel' && /\|(10|30|60|88|110)$/.test(v.key) && /^hoursPerLevel\|(hammer|four)/.test(v.key)));
    if (!vs.length) continue;
    out('\n== ' + label.toUpperCase());
    for (const v of vs) out('  ' + v.label.slice(0, 90).padEnd(91) + (finite(v.k) ? (fmt((1000 * v.k) / v.t, 1) + ' (' + v.k + ' in ' + smart(v.t) + ' h)') : smart(v.value) + (finite(v.se) ? ' +- ' + smart(v.se) : '')));
  }
  if (doc.calibration && doc.calibration.c2 && doc.calibration.c2.length) {
    out('\nCALIBRATION C-2 on this tree (the matrix four against real fours\' recorded hunts on the same ground and tier; sim / real)');
    for (const x of doc.calibration.c2) out('  ' + (x.ground + ' ' + x.tier + ' L' + x.L + ' (' + x.gear + ', ' + x.heroHours + ' real hero-h)').padEnd(46) + ['kills', 'xp', 'coin'].map((k) => k + ' ' + (x.ratio ? x.ratio[k] : '-') + (x.pass && x.pass[k] ? '' : ' OUT')).join('   '));
  }
  if (doc.determinism) out('\nDETERMINISM: ' + doc.determinism.cells + ' cells x seed 0 played twice in fresh workers, in opposite orders: ' + (doc.determinism.identical ? 'byte-identical' : 'DIFFERENT: ' + doc.determinism.diff.join('; ')));
}

export { moments };
