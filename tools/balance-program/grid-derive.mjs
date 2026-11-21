// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/grid-derive.mjs — THE GRID'S TABLES AND ITS JUDGE (balance program 50-standards.md sections 2, 5.1, 5.4, 6).
//
//   derive(D, grid)          -> the derived tables of 5.1 from the cells and the data rows only: hours to each Level and the day at 12 h by
//                               seat, the hardest tier each kit holds, gear / party / tier ratios, the death cost and XP an hour after
//                               deaths (DEATH_COST.watch), gear costs, gold a day, the runway, server cost a hero-day
//   judgeGrid(D, grid, o)    -> every band of standards.mjs BANDS, each cell it reads judged ok / off / RED (or thin: a sample X26 says
//                               cannot see it; n/a: the grid does not measure it, and why)
//   printReport(grid, j)     -> one screen a band family, the gap list's numbers, the bands furthest out of band
//   selftest(ctx)            -> progression-grid.mjs --selftest
//
// A band's status: inside [lo, hi] ok; inside [redLo, redHi] off; outside it RED (standards.mjs). Report mode: nothing here fails a run.
// The balance guard (tests/balance-guard.mjs) prints this judge's summary of the cached grid; it plays nothing for it.
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as STD from './standards.mjs';
import { projectedFloor } from './grid-project.mjs';

/* THE DAY: the hunted hours a free hero hunts in 24 h of server time as the stamina day PLAYED it (stamina-day.mjs, the grid's `clock`), the
   ruled 12 when the cache carries no played day */
export const hoursADayOf = (grid) => { const h = grid && grid.clock && grid.clock.heroes && grid.clock.heroes['free-2']; return h && h.huntedHoursADay > 0 ? h.huntedHoursADay : STD.CLOCK.huntHoursADay; };
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const inR = (v, lo, hi) => (lo === null || lo === undefined || v >= lo) && (hi === null || hi === undefined || v <= hi);
export function statusOf(v, band) {
  if (!finite(v)) return 'n/a';
  if (inR(v, band.lo, band.hi)) return 'ok';
  return inR(v, band.redLo, band.redHi) ? 'off' : 'RED';
}
/** How far a value sits outside its target, as a share of the bound it passed (0 inside). A bound of zero (a sign: "nets under zero") has no
    scale, so passing it reads 1: wholly out, never ranked by its gold. */
export function distanceOf(v, band) {
  if (!finite(v)) return 0;
  const past = (b, d) => (b === 0 ? 1 : d / Math.abs(b));
  if (band.hi !== null && band.hi !== undefined && v > band.hi) return past(band.hi, v - band.hi);
  if (band.lo !== null && band.lo !== undefined && v < band.lo) return past(band.lo, band.lo - v);
  return 0;
}
/* X26: a death rate is judged on 4 seeds x 8 h or more (32 hero-hours a seat); under it the number prints as `thin`. A cell the deaths run
   (progression-grid.mjs --deaths) played carries `deaths`, which every death reading prefers. */
const DEATH_SAMPLE_HERO_H = 32;
/* the deaths run's sample is the run's design (4 seeds x 8 h a seat): a seat that dies often hunts fewer hours, which is its answer, not a thin sample */
export const deathOf = (c) => (c.deaths && c.deaths.sample ? { per1000h: c.deaths.deathsPer1000h, seatHours: c.deaths.sample.heroHours / c.party, net: c.deaths.netLevelXpPerH, low: c.deaths.lowHpTypical, planned: true }
  : { per1000h: c.rates.deathsPer1000h, seatHours: c.rates.sample.heroHours / c.party, net: c.rates.netLevelXpPerH, low: c.rates.lowHpTypical });

/* S2 AND S7 ARE NORMAL'S DEATHS, and the deaths run plays the harder tiers only (RUNS.deaths.tiers), so no Normal cell ever carries a planned death
   sample and both bands sat thin for good. A rate of 1 in 1,000 hours cannot be seen in one cell at any sample a night can play: it is judged on
   the POOL of the band's cells (every in-band Normal cell of the gear state, each on its own 2 x 2 h), once the pool holds 1,000 hero-hours. */
export const POOL_HERO_H = 1000;
export function pooledDeaths(cells) {
  let deaths = 0, hours = 0;
  for (const c of cells) { if (!c.rates || !finite(c.rates.deaths) || !c.rates.sample) continue; deaths += c.rates.deaths; hours += c.rates.sample.heroHours; }
  if (!(hours > 0)) return null;
  return { at: 'POOLED: ' + cells.length + ' cells', deaths, hours, per1000h: (1000 * deaths) / hours, shown: deaths + ' deaths in ' + Math.round(hours) + ' hero-hours' };
}

/* ── the cells, looked up ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
function indexCells(grid) {
  const by = new Map();
  for (const c of Object.values(grid.cells)) {
    if (!c.rates) continue;
    const k = [c.L, c.gear, c.party, c.tier, c.step || ''].join('|');
    const was = by.get(k);
    /* a pair is the better of its two compositions (50-standards 1.3), by Level XP a head */
    if (!was || c.rates.levelXpPerH > was.rates.levelXpPerH) by.set(k, c);
  }
  const get = (L, gear, party, tier, step = '') => by.get([L, gear, party, tier, step].join('|')) || null;
  const levels = [...new Set(Object.values(grid.cells).map((c) => c.L))].sort((a, b) => a - b);
  return { get, levels, all: [...by.values()] };
}
const inBandCell = (D, c) => {
  if (c.stretch === 'PROJECTED') return c.L >= projectedFloor(c.L);
  const [lo, hi] = D.bandOfGround(c.ground);
  return c.L >= lo && c.L <= hi;
};

/* A KIT HOLDS A TIER (50-standards 2.3, standards.mjs GRID.holds): deaths at or under the top of S6's MID row, the low point inside S3 or S4's
   MID row (at or over its floor), net gold over zero. Normal is held by every kit that is on it. */
function holds(c) {
  if (!c || !c.rates) return false;
  if (c.tier === 'normal') return true;
  const r = c.rates, x = deathOf(c), d = STD.bandById('S6.' + c.tier + '.mid'), hp = STD.bandById(c.tier === 'dangerous' ? 'S3.mid' : 'S4.mid');
  return finite(x.per1000h) && x.per1000h <= d.hi && finite(r.lowHpTypical) && r.lowHpTypical >= hp.lo && r.netPerH > 0;
}

/* ── THE DERIVED TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function derive(D, grid, K = null) {
  const X = indexCells(grid);
  const { get, levels } = X;
  const tiersAt = (L, gear, party) => STD.TIERS.filter((t) => get(L, gear, party, t));
  /* the hardest tier each kit holds, at each checkpoint (a party under its first Level is the lone hero's) */
  const hardest = (L, gear, party) => {
    const p = party > 1 && !get(L, gear, party, 'normal') ? 1 : party;
    const held = tiersAt(L, gear, p).filter((t) => holds(get(L, gear, p, t)));
    return { party: p, tier: held.length ? held[held.length - 1] : 'normal' };
  };
  const seatCell = (L, gear, party, mode) => {
    if (mode === 'hardest') { const h = hardest(L, gear, party); return get(L, gear, h.party, h.tier); }
    return get(L, gear, party, 'normal') || get(L, gear, 1, 'normal');
  };
  /* HOURS TO EACH LEVEL by seat: Level XP an hour AFTER deaths, log-linear between checkpoints, over the curve (src/core/xp.js) */
  const xpAt = (l) => D.XP.charXpForLevel(l);
  function hoursTable(gear, party, mode) {
    const pts = levels.map((L) => [L, (seatCell(L, gear, party, mode) || { rates: {} }).rates.netLevelXpPerH]).filter(([, r]) => finite(r) && r > 0);
    if (!pts.length) return null;
    const rate = (l) => {
      if (l <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (l <= pts[i][0]) { const [a, ra] = pts[i - 1], [b, rb] = pts[i]; return ra * (rb / ra) ** ((l - a) / (b - a)); }
      return pts[pts.length - 1][1];
    };
    const per = [0], cum = [0, 0];
    for (let l = 1; l < 400; l++) { per[l] = (xpAt(l + 1) - xpAt(l)) / rate(l); cum[l + 1] = cum[l] + per[l]; }
    return { per, cum, last: pts[pts.length - 1][0] };
  }
  const SEATS = {};
  for (const gear of STD.GEAR_STATE_IDS) for (const party of [1, 2, 3, 4]) for (const mode of ['normal', 'hardest']) {
    const t = hoursTable(gear, party, mode);
    if (t) SEATS[gear + ':' + party + ':' + mode] = t;
  }
  const PACE = STD.PACE_TABLE.seat.ruled ? 'mid:4:hardest' : 'mid:1:normal';
  /* the doors of 2.7 and the day each seat reaches them */
  const DOORS = [[45, 'the Barrow March'], [88, 'Krell\'s Hold'], [110, 'end of open content'], [175, 'the Catacombs'], [185, 'end of staged content'], [240, 'Region 5'], [295, 'Region 6'], [350, 'Region 7'], [400, 'Level 400']];
  const H12 = hoursADayOf(grid);
  const dayAt = (seat, L) => (SEATS[seat] ? SEATS[seat].cum[L] / H12 : null);
  /* DEATH COST (standards.mjs DEATH_COST: 6% of all Level XP, flat, no cap) and XP an hour after deaths at the RULED counts (DEATH_COST.watch) */
  const deathXp = (L) => STD.DEATH_COST.share * xpAt(L);
  const watch = [];
  for (const L of levels) for (const party of [1, 4]) for (const gear of STD.GEAR_STATE_IDS) {
    const n = get(L, gear, party, 'normal');
    if (!n) continue;
    const row = { L, party, gear, normal: n.rates.netLevelXpPerH };
    for (const tier of ['dangerous', 'deadly']) {
      const c = get(L, gear, party, tier);
      if (!c) continue;
      const band = STD.bandById('S6.' + tier + '.' + gear);
      const ruled = band ? (band.hi !== null ? band.hi : band.lo) : null;
      const cost = (count, share) => (count / 1000) * deathXp(L) * share;
      row[tier] = { gross: c.rates.levelXpPerH, afterMeasured: deathOf(c).net, deathsPer1000h: deathOf(c).per1000h, seatHours: deathOf(c).seatHours,
        ruledCount: ruled, afterRuledUnblessed: finite(ruled) ? Math.round(c.rates.levelXpPerH - cost(ruled, 1)) : null,
        afterRuledBlessed: finite(ruled) ? Math.round(c.rates.levelXpPerH - cost(ruled, STD.DEATH_COST.blessedShare)) : null };
    }
    watch.push(row);
  }
  /* the Level from which the ruled Deadly count costs a MID party more than Deadly adds over Normal (the auditor's ~105 blessed / ~55 unblessed) */
  const crossover = (party, key) => { const r = watch.find((w) => w.party === party && w.gear === 'mid' && w.deadly && finite(w.deadly[key]) && w.deadly[key] < w.normal); return r ? r.L : null; };
  /* GEAR: band hours (pace seat and lone MID), costs, steps */
  const gearRows = [];
  if (K) for (const L of levels) {
    const lone = get(L, 'mid', 1, 'normal');
    if (!lone) continue;
    const ground = lone.ground, ms = (st) => D.skillsAt(D.lines, 'alone', 'hammer', L).melee + K.skillDeltaOf(st, L);
    const plan = (st) => K.kitFor(L, st, 'hammer', { ground, mainSkill: ms(st) });
    const low = plan('low'), mid = plan('mid'), bis = plan('bis');
    const b0 = K.bandOf(L), b1 = K.bandAfter(L) || 400;
    const bandH = SEATS['mid:1:normal'] ? SEATS['mid:1:normal'].cum[Math.min(400, b1)] - SEATS['mid:1:normal'].cum[b0] : null;
    const bandNet = finite(bandH) ? bandH * lone.rates.netPerH : null;
    const sw = get(L, 'mid', 1, 'normal', 'step:weapon'), sa = get(L, 'mid', 1, 'normal', 'step:armor');
    const lowToMid = K.upgradeCost(low, mid).total, midToBis = K.upgradeCost(mid, bis).total;
    const prices = Object.values(bis.kit).map((id) => K.priceOf(id));
    for (const [key, n] of Object.entries(bis.temper || {})) { const t = Number(key.split(':')[2]); const row = K.temperTiers[t]; if (row) prices.push(row[n - 1]); }
    gearRows.push({ L, band: b0, nextBand: b1, bandHours: bandH, bandNet, lowToMid, midToBis, dearest: Math.max(0, ...prices),
      e3: bandNet > 0 ? lowToMid / bandNet : null, e4: bandNet > 0 ? midToBis / bandNet : null,
      weaponStep: sw ? lone.rates.levelXpPerH / sw.rates.levelXpPerH - 1 : null, armorStep: sa ? 1 - lone.rates.takenPerH / sa.rates.takenPerH : null,
      e2: dropWait(D, lone, mid, K, bandH), bandHoursPace: SEATS[PACE] ? SEATS[PACE].cum[Math.min(400, b1)] - SEATS[PACE].cum[b0] : null });
  }
  /* SERVER COST a hero-day (C1 to C3): measure.mjs accountCost on the Own four at 12 h, today's reads */
  let cost = null;
  if (D.accountCost && D.model) {
    const pl = D.model.REFERENCE_PLAYERS.find((p) => p.id === 'ownfour');
    const a = D.accountCost(pl, 'real', D.model.COST.real.tabHourReadsS.today);
    const hh = pl.heroes * pl.huntHoursADay;
    cost = { player: 'ownfour', heroes: pl.heroes, huntH: pl.huntHoursADay, dbSADay: Math.round(a.dbS), dbSAHeroHour: Math.round((a.dbS / hh) * 100) / 100, rowsAHeroHour: Math.round((a.rows / hh) * 10) / 10 };
  }
  return { X, get, levels, hardest, holds, SEATS, PACE, DOORS, H12, dayAt, deathXp, xpAt, watch, crossover, gearRows, cost, seatCell };
}

/* E2: the median hunted hours until every MID weapon and armor piece that drops on the advised ground has dropped (each piece's rate = the
   cell's measured kills of each monster x that monster's row chance), over the band's hours. A piece the Shop sells waits 0; a piece that
   does not drop on this ground is counted apart (`elsewhere`). */
function dropWait(D, cell, plan, K, bandH) {
  const lam = [], elsewhere = [];
  for (const slot of ['weapon', 'shield', 'helmet', 'body', 'pants', 'boots', 'gloves', 'belt']) {
    const id = plan.kit[slot];
    if (!id || K.shopSells(id)) continue;
    let r = 0;
    for (const [m, n] of Object.entries(cell.rates.killsByPerH || {})) for (const d of (D.MONSTERS[m] || {}).drops || []) if (d.id === id) r += n * (d.ch || 0);
    if (r > 0) lam.push(r); else elsewhere.push(id);
  }
  if (!lam.length) return { median: null, share: null, elsewhere };
  const all = (t) => lam.reduce((p, l) => p * (1 - Math.exp(-l * t)), 1);
  let lo = 0, hi = 1;
  while (all(hi) < 0.5 && hi < 1e7) hi *= 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (all(m) < 0.5) lo = m; else hi = m; }
  return { median: hi, share: finite(bandH) && bandH > 0 ? hi / bandH : null, elsewhere };
}

/* ── THE JUDGE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const NOT_GRID = {
  P13: 'events: the grid plays no event calendar', 'G-11': 'server gold: needs the server gold model (X14), not a cell', E5: 'chest and capped sources: the sources lane (atlas.json)',
  'E7': 'the Add pool: balance guard G10 plays it', E8: 'gold-for-power offers: balance guard G12', D4: 'Magic Find: balance guard G13 (Luck not built)',
  TL1: 'the talent builds: balance-matrix.mjs judges them', TL2: 'the talent builds: balance-matrix.mjs judges them', TL3: 'the talent builds: balance-matrix.mjs judges them', TL4: 'the talent builds: balance-matrix.mjs judges them',
  R1: 'region open dates: a schedule, not a cell', R3: 'Levels authored a month: the pack log', 'C4.1k': 'money: measure.mjs cost', 'C4.10k': 'money: measure.mjs cost', 'C4b.1k': 'the other lines of the bill: 28-platform\'s price list', 'C4b.10k': 'the other lines of the bill: 28-platform\'s price list', C5: 'capacity: measure.mjs cost and the load rig',
};
export function judgeGrid(D, grid, o = {}) {
  const T = derive(D, grid, o.K || null);
  const { X, get, levels, SEATS, PACE } = T;
  const rows = [];
  const add = (band, at, value, extra = {}) => rows.push({ band: band.id, group: band.group, label: band.label, at, value: finite(value) ? Math.round(value * 1000) / 1000 : value, status: extra.status || statusOf(value, band), dist: distanceOf(value, band), ...extra });
  const cellsWhere = (w) => X.all.filter((c) => !c.step && (!w.gear || c.gear === w.gear) && (w.party === undefined || c.party === w.party) && (!w.tier || typeof w.tier !== 'string' || w.tier === 'hardest-held' || c.tier === w.tier)
    && (!w.levels || (c.L >= w.levels[0] && c.L <= w.levels[1])) && (!w.fromLevel || c.L >= w.fromLevel) && (!w.inBand || inBandCell(D, c)));
  const at = (c) => c.L + ' ' + c.gear + ' x' + c.party + ' ' + c.tier;
  const ratio = (a, b) => (a && b && b > 0 ? a / b : null);
  const sampleOk = (c) => deathOf(c).planned === true || deathOf(c).seatHours >= DEATH_SAMPLE_HERO_H;
  for (const band of STD.STANDING) {
    const w = band.where || {}, id = band.id;
    if (NOT_GRID[id]) { rows.push({ band: id, group: band.group, label: band.label, at: '-', value: null, status: 'n/a', dist: 0, why: NOT_GRID[id] }); continue; }
    if (['atlas', 'town', 'path'].includes(band.group)) { rows.push({ band: id, group: band.group, label: band.label, at: '-', value: null, status: 'n/a', dist: 0, why: 'read from ' + (band.group === 'path' ? 'paths.json' : 'atlas.json') + ' (lane/c-sources-paths)' }); continue; }
    if (id === 'P1') {
      const seat = SEATS[PACE], target = [...STD.PACE_TABLE.ruled, ...(STD.PACE_TABLE.ruled400 || STD.PACE_TABLE.proposed || [])];
      for (const L of w.levels) { const t = target.find(([l]) => l === L); if (seat && t && L <= 400) add(band, 'Level ' + L + ' (' + PACE + ')', seat.cum[L] / t[1], { shown: Math.round(seat.cum[L]) + ' h / ' + t[1] + ' h' }); }
      continue;
    }
    if (id === 'P2') { for (const c of cellsWhere(w)) add(band, at(c), c.rates.xContract); continue; }
    if (id === 'P3' || id === 'P4') { for (const c of cellsWhere(w)) add(band, at(c), ratio(c.rates.levelXpPerH, (get(c.L, 'mid', c.party, c.tier) || {}).rates?.levelXpPerH)); continue; }
    /* P5 reads NORMAL only: on the harder tiers LOW is ruled to fail (S3.low, S4.low "dies", G-5 "nets under zero"), so BiS over a kit that dies at once
       is a ratio of nothing (the first baseline's top red, 277 at Level 20 lone Deadly, was LOW earning 584 XP an hour between deaths) */
    if (id === 'P5') { for (const c of cellsWhere({ gear: 'bis', tier: 'normal' })) add(band, at(c), ratio(c.rates.levelXpPerH, (get(c.L, 'low', c.party, c.tier) || {}).rates?.levelXpPerH)); continue; }
    if (/^P6\./.test(id)) { for (const c of cellsWhere(w)) add(band, at(c), ratio(c.rates.levelXpPerH, (get(c.L, 'mid', 1, c.tier) || {}).rates?.levelXpPerH)); continue; }
    if (/^P7\./.test(id)) {
      for (const L of levels) { if (w.levels && (L < w.levels[0] || L > w.levels[1])) continue; const h = T.hardest(L, 'mid', w.party); if (h.party !== w.party) continue; const c = get(L, 'mid', w.party, h.tier); if (c) add(band, at(c), c.rates.xContract); }
      continue;
    }
    if (id === 'P8') { for (const c of cellsWhere(w)) add(band, at(c), c.rates.xContract); continue; }
    if (/^P9\./.test(id)) {
      for (const c of X.all.filter((x) => !x.step && x.tier === w.tier && holds(x))) add(band, at(c), ratio(c.rates.netLevelXpPerH, (get(c.L, c.gear, c.party, 'normal') || {}).rates?.netLevelXpPerH));
      continue;
    }
    if (id === 'P10') {
      for (const c of X.all.filter((x) => !x.step && x.tier !== 'normal' && !holds(x))) {
        const below = get(c.L, c.gear, c.party, c.tier === 'deadly' ? 'dangerous' : 'normal') || get(c.L, c.gear, c.party, 'normal');
        add(band, at(c), ratio(c.rates.netLevelXpPerH, below && below.rates.netLevelXpPerH));
      }
      continue;
    }
    if (id === 'P11.early' || id === 'P11.ten') {
      const seat = SEATS['low:1:normal'];
      if (!seat) { add(band, 'new player', null); continue; }
      if (id === 'P11.ten') add(band, 'hours to Level 10 (LOW lone Normal; G6 is the played life)', seat.cum[10]);
      else for (let l = 1; l <= 9; l++) add(band, 'Level ' + l + '->' + (l + 1), seat.per[l]);
      continue;
    }
    if (id === 'P11.smooth') {
      const seat = SEATS[PACE];
      if (!seat) continue;
      let worst = [0, 1];
      for (let l = 2; l < 400; l++) { const r = seat.per[l] / seat.per[l - 1]; if (r > worst[1]) worst = [l, r]; }
      add(band, 'worst step, Level ' + worst[0] + ' (' + PACE + ')', worst[1]);
      continue;
    }
    if (/^P12\./.test(id)) {
      const seat = SEATS[PACE], [a, b] = w.levels;
      if (seat) for (const L of levels.filter((x) => x >= a && x < b)) add(band, 'Level ' + L + ' (' + PACE + ')', seat.per[L]);
      continue;
    }
    if (/^S1\.|^S3\.|^S4\./.test(id)) { for (const c of cellsWhere(w)) add(band, at(c), c.rates.lowHpTypical); continue; }
    if (/^S2\.|^S6\./.test(id)) {
      for (const c of cellsWhere(w)) add(band, at(c), deathOf(c).per1000h, sampleOk(c) ? {} : { status: 'thin', why: Math.round(deathOf(c).seatHours) + ' hours a seat (X26: 4 seeds x 8 h; progression-grid.mjs --deaths plays it)' });
      if (/^S2\./.test(id)) { const p = pooledDeaths(cellsWhere(w)); if (p) add(band, p.at, p.per1000h, p.hours >= POOL_HERO_H ? { shown: p.shown } : { status: 'thin', shown: p.shown, why: p.shown + ' (a pool judges from ' + POOL_HERO_H + ' hero-hours)' }); }
      continue;
    }
    if (/^S5\./.test(id)) { for (const c of cellsWhere(w)) add(band, at(c), ratio(c.rates.takenPerH, (get(c.L, 'mid', c.party, c.tier) || {}).rates?.takenPerH)); continue; }
    if (/^S7\./.test(id)) {
      for (const c of cellsWhere(w)) add(band, at(c), Math.exp(-(deathOf(c).per1000h / 1000) * 12), sampleOk(c) ? {} : { status: 'thin', why: Math.round(deathOf(c).seatHours) + ' hours a seat' });
      const p = pooledDeaths(cellsWhere(w));
      if (p) add(band, p.at, Math.exp(-(p.per1000h / 1000) * 12), p.hours >= POOL_HERO_H ? { shown: p.shown } : { status: 'thin', shown: p.shown, why: p.shown + ' (a pool judges from ' + POOL_HERO_H + ' hero-hours)' });
      continue;
    }
    if (id === 'S10') {
      for (const L of levels.filter((x) => x >= w.levels[0])) {
        const c = get(L, 'mid', 1, 'normal');
        if (!c) continue;
        const price = [1, 2, 3].reduce((s, t) => s + (D.BL.blessingPrice(t, L) || 0), 0), saved = (T.deathXp(L) * (1 - STD.DEATH_COST.blessedShare)) / c.rates.levelXpPerH;
        add(band, 'Level ' + L, c.rates.netPerH > 0 ? price / c.rates.netPerH / saved : null, { shown: Math.round(price) + ' gold, saves ' + saved.toFixed(1) + ' h' });
      }
      continue;
    }
    if (/^S11\./.test(id)) {
      const key = id === 'S11.blessed' ? 'afterRuledBlessed' : 'afterRuledUnblessed';
      for (const L of levels) {
        if (w.levels && (L < w.levels[0] || L > w.levels[1])) continue;
        const h = T.hardest(L, 'mid', 4), lone = get(L, 'mid', 1, 'normal');
        if (h.party !== 4 || h.tier === 'normal' || !lone) continue;
        const row = T.watch.find((x) => x.L === L && x.party === 4 && x.gear === 'mid');
        const t = row && row[h.tier];
        if (!t || !finite(t[key])) continue;
        add(band, 'Level ' + L + ' (the MID four, hardest tier held)', ratio(t[key], lone.rates.netLevelXpPerH) ?? (t[key] <= 0 ? t[key] / lone.rates.netLevelXpPerH : null),
          { shown: fmt(t[key]) + ' on ' + h.tier + ' at ' + t.ruledCount + ' deaths in 1,000 h / ' + fmt(lone.rates.netLevelXpPerH) + ' alone' });
      }
      continue;
    }
    if (id === 'G-1') {
      let prev = null;
      for (const c of cellsWhere(w).sort((a, b) => a.L - b.L)) { if (prev) add(band, at(c), ratio(c.rates.netPerH, prev.rates.netPerH)); prev = c; }
      continue;
    }
    if (/^G-2\./.test(id) || id === 'G-9') { for (const c of cellsWhere(w)) add(band, at(c), c.rates.storeShare); continue; }
    if (id === 'G-3') { for (const c of cellsWhere(w)) { const m = get(c.L, 'mid', c.party, c.tier); add(band, at(c), m && m.rates.netPerH > 0 ? c.rates.netPerH / m.rates.netPerH : null); } continue; }
    if (id === 'G-4' || id === 'G-5') { for (const c of cellsWhere(w)) add(band, at(c), c.rates.netPerH); continue; }
    if (id === 'G-6') { for (const c of cellsWhere({ gear: 'bis', tier: 'deadly' })) { const m = get(c.L, 'mid', c.party, 'dangerous'); add(band, at(c), m && m.rates.netPerH > 0 ? c.rates.netPerH / m.rates.netPerH : null); } continue; }
    if (id === 'G-8') { for (const g of T.gearRows) { const c = get(g.L, 'mid', 1, 'normal'); add(band, 'Level ' + g.L, c && c.rates.netADay > 0 ? g.dearest / c.rates.netADay : null, { shown: Math.round(g.dearest) + ' gold' }); } continue; }
    /* past 185 the gear is the projector's line (grid-project.mjs), which carries power and no price row: a cost of nothing there is a missing row,
       never a measured "BiS is free" (the first baseline read 2,130 gold for every band from 200 to 400 and judged it RED) */
    const unpriced = (g) => (STD.stretchOf(g.L).state === 'PROJECTED' ? { status: 'n/a', why: 'the projected gear line has no price rows (grid-project.mjs)' } : {});
    if (id === 'G-10' || id === 'E4') { for (const g of T.gearRows) add(band, 'Level ' + g.L + ' (band ' + g.band + ')', g.e4, { shown: Math.round(g.midToBis) + ' / ' + Math.round(g.bandNet || 0), ...unpriced(g) }); continue; }
    if (id === 'E3') { for (const g of T.gearRows) add(band, 'Level ' + g.L + ' (band ' + g.band + ')', g.e3, { shown: Math.round(g.lowToMid) + ' / ' + Math.round(g.bandNet || 0), ...unpriced(g) }); continue; }
    if (id === 'E1.levels') { const B = o.K ? o.K.BANDS : []; for (let i = 1; i < B.length; i++) add(band, B[i - 1] + '->' + B[i], B[i] - B[i - 1]); continue; }
    if (id === 'E1.weapon') { for (const g of T.gearRows) add(band, 'Level ' + g.L, g.weaponStep); continue; }
    if (id === 'E1.armor') { for (const g of T.gearRows) add(band, 'Level ' + g.L, g.armorStep); continue; }
    if (/^E2\./.test(id)) { for (const g of T.gearRows.filter((x) => x.L >= w.levels[0] && x.L <= w.levels[1])) add(band, 'Level ' + g.L, g.e2.share, { shown: (g.e2.median ? g.e2.median.toFixed(1) + ' h' : '-') + (g.e2.elsewhere.length ? ', ' + g.e2.elsewhere.length + ' piece(s) not on this ground' : '') }); continue; }
    if (/^E6\./.test(id)) {
      for (const g of T.gearRows.filter((x) => x.L >= w.levels[0] && x.L <= w.levels[1])) { const v = g.bandHoursPace; const st = statusOf(v, band); add(band, 'band ' + g.band + ' (pace seat)', v, st === 'ok' ? {} : { status: 'bound', why: 'an upper bound: band starts only; rungs and jewelry change in between (a played life judges it)' }); }
      continue;
    }
    /* the Very Rare (staged/luck.js VERY_RARE_HOURS) is not built: the rarest reveal row's hours print beside the band, never judged */
    if (id === 'D1') { for (const c of cellsWhere({ gear: 'mid', party: 1, tier: 'normal', levels: w.levels })) add(band, at(c), c.rates.rarestRevealEveryHeroH, { status: 'proxy', why: 'the Very Rare is not built (L20); the rarest reveal row by formula on measured kills, never judged' }); continue; }
    if (id === 'D2') { for (const L of levels.filter((x) => x >= w.levels[0])) { const c = T.seatCell(L, 'mid', 4, 'hardest'); if (c) add(band, at(c), c.rates.rarestRevealEveryPartyH, { status: 'proxy', why: 'the Very Rare is not built (L20); the rarest reveal row, the party\'s hours' }); } continue; }
    if (id === 'R2') { const d = T.dayAt(PACE, 110); add(band, 'the pace seat (' + PACE + ') reaches Level 110', d); continue; }
    /* the database time of one account does not depend on how many there are: the same reading is judged against each population's band */
    if (/^C1(\.|$)/.test(id)) { if (T.cost) add(band, 'the Own four, 12 h, today\'s engine', T.cost.dbSAHeroHour); continue; }
    if (/^C2(\.|$)/.test(id)) { if (T.cost) add(band, 'the Own four, 12 h, today\'s engine', T.cost.dbSADay); continue; }
    if (id === 'C3') { if (T.cost) add(band, 'the Own four, 12 h (every activity)', T.cost.rowsAHeroHour); continue; }
    rows.push({ band: id, group: band.group, label: band.label, at: '-', value: null, status: 'n/a', dist: 0, why: 'no reader in grid-derive.mjs yet' });
  }
  const stale = o.currentHash && grid.inputHash && o.currentHash !== grid.inputHash;
  return { rows, T, stale, grid: { run: grid.run, commit: grid.commit, at: grid.at, inputHash: grid.inputHash, runtime: grid.runtime, sample: grid.sample, cells: Object.keys(grid.cells).length } };
}

/** Per band: its rows' worst status, the worst row (furthest out), and counts. */
export function bandSummary(judged) {
  const out = [];
  const RANK = { ok: 0, thin: 0, bound: 0, proxy: 0, 'n/a': 0, off: 1, RED: 2 };
  for (const band of STD.STANDING) {
    const rs = judged.rows.filter((r) => r.band === band.id);
    const judgedRows = rs.filter((r) => ['ok', 'off', 'RED'].includes(r.status));
    const worst = judgedRows.reduce((m, r) => (!m || r.dist > m.dist ? r : m), null);
    const status = !rs.length ? 'n/a' : rs.every((r) => r.status === 'n/a') ? 'n/a' : !judgedRows.length ? rs[0].status : judgedRows.reduce((s, r) => (RANK[r.status] > RANK[s] ? r.status : s), 'ok');
    out.push({ band: band.id, group: band.group, label: band.label, status, worst, n: rs.length, red: rs.filter((r) => r.status === 'RED').length, off: rs.filter((r) => r.status === 'off').length,
      ok: rs.filter((r) => r.status === 'ok').length, thin: rs.filter((r) => ['thin', 'proxy', 'bound'].includes(r.status)).length, why: (rs.find((r) => r.why) || {}).why || '' });
  }
  return out;
}

const fmt = (v) => (!finite(v) ? String(v) : Math.abs(v) >= 10000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(Math.abs(v) >= 10 ? 1 : 3));
const rng = (b) => (b.lo === null ? '<=' + b.hi : b.hi === null ? '>=' + b.lo : b.lo + '-' + b.hi) + ' / red ' + (b.redLo === null && b.redHi === null ? '-' : (b.redLo === null ? '' : '<' + b.redLo) + (b.redLo !== null && b.redHi !== null ? ' ' : '') + (b.redHi === null ? '' : '>' + b.redHi));

/* ── THE REPORT ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function printReport(grid, judged, out = console.log) {
  const T = judged.T, g = judged.grid;
  out('PROGRESSION GRID (50-standards) ' + g.run + ' on ' + g.commit + ' (' + g.at + '): ' + g.cells + ' cells, ' + g.sample.seeds + ' seeds x ' + g.sample.hours + ' h, '
    + (g.runtime ? g.runtime.wallS + ' s wall, ' + g.runtime.workerS + ' worker-s, ' + g.runtime.workers + ' workers' : '') + (judged.stale ? '. STALE: the tree moved since (inputHash), refresh it' : '') + '. Report mode.');
  if (grid.clock) out('THE STAMINA DAY (played on the replayed chain, ' + grid.clock.at + '): ' + Object.entries(grid.clock.heroes).map(([id, h]) => id + ' ' + h.huntedHoursADay + ' h a day').join(', ') + '. ' + grid.clock.verdict);
  const S = bandSummary(judged);
  const fams = [...new Set(STD.BANDS.map((b) => b.group))];
  for (const fam of fams) {
    out('\n== ' + fam.toUpperCase() + ' ==   band | status | rows ok/off/RED (thin) | worst cell: value | target / red | label');
    for (const s of S.filter((x) => x.group === fam)) {
      const b = STD.bandById(s.band);
      out('  ' + s.band.padEnd(17) + s.status.padEnd(6) + (s.ok + '/' + s.off + '/' + s.red + (s.thin ? ' (' + s.thin + ' thin)' : '')).padEnd(16)
        + (s.worst ? s.worst.at + ': ' + (s.worst.shown || fmt(s.worst.value)) : s.why ? '- ' + s.why : '-').slice(0, 78).padEnd(80) + rng(b) + ' | ' + b.label);
    }
  }
  out('\n== PACE: the day each seat reaches each door (' + T.H12 + ' hunted hours a day, the stamina day as played; Level XP an hour after deaths) ==');
  const seats = [['mid:1:normal', 'lone MID Normal'], [T.PACE, 'THE PACE SEAT (MID four, hardest held)'], ['low:1:normal', 'lone LOW Normal'], ['bis:4:hardest', 'BiS four, hardest held']];
  out('  door'.padEnd(30) + seats.map(([, n]) => n.slice(0, 22).padEnd(24)).join(''));
  for (const [L, name] of T.DOORS) out(('  ' + L + ' ' + name).padEnd(30) + seats.map(([k]) => (finite(T.dayAt(k, L)) ? 'day ' + T.dayAt(k, L).toFixed(1) : '-').padEnd(24)).join(''));
  out('\n== DEATH (6% of all Level XP, no cap): XP an hour after deaths, the four (lone under 5): measured (its own deaths) | at the TOP of the ruled count (S6 for the gear: MID Dangerous 30, Deadly 100 a 1,000 h), unblessed / fully blessed ==');
  out('  L    gear Normal    | Dangerous: measured, ruled unblessed / blessed | Deadly: same');
  for (const w of T.watch.filter((x) => x.party === 4 || x.L < 5)) {
    const t = (r) => (r ? fmt(r.afterMeasured) + ', ' + fmt(r.afterRuledUnblessed) + ' / ' + fmt(r.afterRuledBlessed) : '-');
    out('  ' + String(w.L).padEnd(5) + w.gear.padEnd(5) + fmt(w.normal).padEnd(10) + '| ' + t(w.dangerous).padEnd(47) + '| ' + t(w.deadly));
  }
  out('  MID four: the ruled Deadly count costs more than Deadly adds over Normal from Level ' + (T.crossover(4, 'afterRuledBlessed') ?? 'never') + ' fully blessed, ' + (T.crossover(4, 'afterRuledUnblessed') ?? 'never') + ' unblessed (the auditor computed ~105 and ~55); measured deaths: from ' + (T.crossover(4, 'afterMeasured') ?? 'never'));
  out('\n== THE GAP LIST, the grid\'s numbers ==');
  for (const [n, line] of gapNumbers(judged)) out('  gap ' + String(n).padStart(2) + ': ' + line);
  out('\n== THE BANDS FURTHEST OUT (worst cell each; judged rows only) ==');
  for (const s of furthest(judged, 10)) out('  ' + s.bands.join(', ').padEnd(17) + ' ' + s.status.padEnd(5) + ' ' + s.worst.at + ': ' + (s.worst.shown || fmt(s.worst.value)) + ' (target ' + rng(STD.bandById(s.band)) + '; ' + s.red + ' red, ' + s.off + ' off of ' + s.n + ')');
  const counts = S.reduce((m, s) => { m[s.status] = (m[s.status] || 0) + 1; return m; }, {});
  out('\nBANDS: ' + Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ') + ' of ' + S.length + '.');
}
/** The `n` bands whose worst cell sits furthest outside its target. One reading judged against several bands (a cost read against the
    1,000 and the 10,000 account bands) is one entry, its bands listed together. */
export function furthest(judged, n = 10) {
  const out = [];
  for (const s of bandSummary(judged).filter((x) => x.worst && x.worst.dist > 0).sort((a, b) => b.worst.dist - a.worst.dist)) {
    const twin = out.find((o) => o.worst.at === s.worst.at && o.worst.value === s.worst.value);
    if (twin) { twin.bands.push(s.band); continue; }
    out.push({ ...s, bands: [s.band] });
  }
  return out.slice(0, n);
}

/** The gap list's numbers the grid can give (50-standards section 6). */
export function gapNumbers(judged) {
  const T = judged.T, rows = judged.rows, out = [];
  const range = (id, f = (r) => r.status !== 'n/a') => { const v = rows.filter((r) => r.band === id && finite(r.value) && f(r)).map((r) => r.value); return v.length ? fmt(Math.min(...v)) + ' to ' + fmt(Math.max(...v)) + ' (' + v.length + ' cells)' : 'no cell'; };
  out.push([6, 'LOW played on every checkpoint: low point on Normal ' + range('S1.low') + '; LOW / MID Level XP alone ' + range('P3')]);
  out.push([7, 'BiS built by rule and played: BiS / MID Level XP alone ' + range('P4') + '; damage taken BiS / MID ' + range('S5.bis')]);
  out.push([8, 'MID has a rule (grid-kit.mjs): x contract alone on Normal ' + range('P2')]);
  out.push([9, T.levels.length + ' checkpoints from ' + T.levels[0] + ' to ' + T.levels[T.levels.length - 1] + ' (gear gates, staged and PROJECTED stretches)']);
  out.push([10, 'the pair and the three against a lone hero: dropped as targets, nothing reads them (GR-67, RULED 2026-11-21)']);
  out.push([11, 'Dangerous as its own cell: MID low point ' + range('S3.mid') + '; MID deaths a 1,000 h ' + range('S6.dangerous.mid')]);
  out.push([12, 'the pace seat ' + T.PACE + ' reaches Level 200 on day ' + fmtDay(T.dayAt(T.PACE, 200)) + ' and 400 on day ' + fmtDay(T.dayAt(T.PACE, 400)) + '; the lone MID hero on day ' + fmtDay(T.dayAt('mid:1:normal', 200)) + ' and ' + fmtDay(T.dayAt('mid:1:normal', 400))]);
  out.push([13, 'the pace seat leaves open content on day ' + fmtDay(T.dayAt(T.PACE, 110)) + ' and staged content on day ' + fmtDay(T.dayAt(T.PACE, 185))]);
  /* the seat's Level XP an hour at L, from its hours table (between checkpoints, the same log-linear rate the pace uses) */
  const seat = T.SEATS['mid:4:normal'] || T.SEATS['mid:1:normal'];
  const dc = (L) => (seat ? (T.deathXp(L) / ((T.xpAt(L + 1) - T.xpAt(L)) / seat.per[L])).toFixed(1) + ' h' : '-');
  out.push([14, 'one death costs (6%, unblessed, at the MID four\'s Normal rate) ' + [30, 100, 200, 300, 400].map((L) => 'L' + L + ' ' + dc(Math.min(399, L))).join(', ')]);
  out.push([15, 'Deadly low points: MID ' + range('S4.mid') + ', BiS ' + range('S4.bis')]);
  out.push([22, T.cost ? 'the Own four at 12 h (measure.mjs accountCost, today\'s REAL means): ' + T.cost.dbSADay + ' DB seconds a day, ' + T.cost.dbSAHeroHour + ' a hero-hour, ' + T.cost.rowsAHeroHour + ' journal rows a hero-hour' : 'no cost read']);
  return out;
}
const fmtDay = (d) => (finite(d) ? d.toFixed(0) : '-');

/* ── --selftest ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/* Plants on a copy of the cached grid: one out-of-band cell a band family, each must turn ITS band's row at that cell RED; a negative control
   moves nothing. Then the kit builder: a changed gear rule and a planted data row must each move the kits. */
export async function selftest({ ROOT, loadGridData, loadKits, readGrid, quick }) {
  const grid0 = readGrid(quick) || readGrid(!quick);
  if (!grid0) { console.log('grid --selftest: no cached grid: run node tools/balance-program/progression-grid.mjs --quick first'); return 2; }
  const D = await loadGridData();
  const K = await loadKits(ROOT);
  const clone = () => JSON.parse(JSON.stringify(grid0));
  const redAt = (j, band) => new Set(j.rows.filter((r) => r.band === band && r.status === 'RED').map((r) => r.at));
  const clean = judgeGrid(D, grid0, { K });
  const find = (pred) => Object.values(grid0.cells).find((c) => c.rates && !c.step && pred(c));
  const P = [];
  const plant = (name, band, pick, apply, at) => P.push({ name, band, pick, apply, at });
  const label = (c) => c.L + ' ' + c.gear + ' x' + c.party + ' ' + c.tier;
  plant('pace: the lone MID hero runs away (x2.5 the contract)', 'P2', (c) => c.gear === 'mid' && c.party === 1 && c.tier === 'normal', (c) => { c.rates.xContract = 2.5; }, label);
  plant('survival: a MID kit on Normal bottoms out at 20%', 'S1.mid', (c) => c.gear === 'mid' && c.party !== 2 && c.tier === 'normal' && inBandCell(D, c), (c) => { c.rates.lowHpTypical = 0.2; }, label);
  plant('deaths: MID on Deadly dies 400 times a 1,000 h on a full sample', 'S6.deadly.mid', (c) => c.gear === 'mid' && c.party !== 2 && c.tier === 'deadly' && inBandCell(D, c), (c) => { c.rates.deathsPer1000h = 400; c.rates.sample.heroHours = 64 * c.party; }, label);
  plant('gold: LOW on Deadly makes money (+50k a hero-hour)', 'G-5', (c) => c.gear === 'low' && c.party !== 2 && c.tier === 'deadly', (c) => { c.rates.netPerH = 50000; }, label);
  plant('gold: the store eats 95% of a MID Deadly party\'s coin', 'G-2.deadly', (c) => c.gear === 'mid' && c.party !== 2 && c.tier === 'deadly' && inBandCell(D, c), (c) => { c.rates.storeShare = 0.95; }, label);
  plant('gear: BiS twice MID alone', 'P4', (c) => c.gear === 'bis' && c.party === 1 && c.tier === 'normal', (c) => { c.rates.levelXpPerH *= 2; }, label);
  plant('gear: BiS three times LOW alone on Normal', 'P5', (c) => c.gear === 'bis' && c.party === 1 && c.tier === 'normal' && c.L >= 15, (c) => { c.rates.levelXpPerH *= 3; }, label);
  plant('death: the lone hero on Normal at five times its Level XP (a party at the ruled death count is then slower than its heroes alone)', 'S11.blessed', (c) => c.gear === 'mid' && c.party === 1 && c.tier === 'normal' && c.L >= 35 && c.L <= 110, (c) => { c.rates.netLevelXpPerH *= 5; c.rates.levelXpPerH *= 5; }, (c) => 'Level ' + c.L + ' (the MID four, hardest tier held)');
  plant('pace: one Level of the pace seat takes days (its checkpoint at a fiftieth of the Level XP)', 'P12.to300', null, null, null);
  plant('gear: LOW to MID costs more than the band earns (lone MID net at 1 gold an hour)', 'E3', (c) => c.gear === 'mid' && c.party === 1 && c.tier === 'normal' && c.L >= 15, (c) => { c.rates.netPerH = 1; c.rates.netADay = 12; }, (c) => 'Level ' + c.L + ' (band ' + K.bandOf(c.L) + ')');
  let fails = 0;
  console.log('GRID --selftest on the cached ' + grid0.run + ' grid (' + Object.keys(grid0.cells).length + ' cells): each plant must turn its own band red');
  for (const p of P) {
    const g = clone();
    let atKey;
    if (p.band === 'P12.to300') {
      const row = clean.rows.find((r) => r.band === 'P12.to300' && r.status !== 'RED' && r.status !== 'n/a');
      if (!row) { console.log('  HARNESS ' + p.name + ': no clean row'); fails++; continue; }
      const L = Number(row.at.split(' ')[1]);
      for (const c of Object.values(g.cells)) if (c.rates && c.L === L && c.gear === 'mid' && c.party === 4) { c.rates.netLevelXpPerH /= 50; c.rates.levelXpPerH /= 50; }
      atKey = row.at;
    } else {
      const c0 = Object.values(g.cells).find((c) => c.rates && !c.step && p.pick(c) && !redAt(clean, p.band).has((p.at || label)(c)));
      if (!c0) { console.log('  HARNESS ' + p.name + ': no clean cell to plant on'); fails++; continue; }
      p.apply(c0); atKey = (p.at || label)(c0);
    }
    const j = judgeGrid(D, g, { K });
    const got = [...redAt(j, p.band)].filter((a) => !redAt(clean, p.band).has(a));
    const ok = got.includes(atKey);
    if (!ok) fails++;
    console.log('  ' + (ok ? 'CAUGHT ' : 'MISSED ') + p.name + ': ' + p.band + ' newly red at ' + (got.join(', ') || 'nothing'));
  }
  {
    const g = clone(); const c = find((x) => x.gear === 'mid' && x.party === 1 && x.tier === 'normal'); const gc = g.cells[c.key]; gc.rates.levelXpPerH *= 1.01; gc.rates.netLevelXpPerH *= 1.01;
    const j = judgeGrid(D, g, { K }); const newly = j.rows.filter((r) => r.status === 'RED' && !clean.rows.some((q) => q.band === r.band && q.at === r.at && q.status === 'RED'));
    const ok = !newly.length; if (!ok) fails++;
    console.log('  ' + (ok ? 'SILENT ' : 'NOISY  ') + 'NEGATIVE CONTROL: one lone MID cell +1% Level XP' + (ok ? '' : ': newly red ' + newly.map((r) => r.band + ' ' + r.at).join(', ')));
  }
  /* P5 is Normal's: BiS far over LOW on a harder tier (where LOW is ruled to fail) must not turn it red */
  {
    const g = clone(); const c = find((x) => x.gear === 'bis' && x.party === 1 && x.tier === 'deadly'); g.cells[c.key].rates.levelXpPerH *= 50;
    const got = [...redAt(judgeGrid(D, g, { K }), 'P5')].filter((a) => !redAt(clean, 'P5').has(a));
    /* and no P5 row is read off Normal at all (a cell already red there would hide the plant above) */
    const off = clean.rows.filter((r) => r.band === 'P5' && !/ normal$/.test(String(r.at)));
    const ok = !got.length && !off.length; if (!ok) fails++;
    console.log('  ' + (ok ? 'SILENT ' : 'NOISY  ') + 'P5 on a harder tier: a lone BiS Deadly cell at 50 times its Level XP, and no P5 row off Normal' + (ok ? '' : ': P5 newly red at ' + (got.join(', ') || 'nothing') + '; ' + off.length + ' row(s) off Normal'));
  }
  /* S2 and S7 are judged on the pool: deaths planted across Normal MID cells (no one cell's sample can see them) must turn both red */
  {
    const g = clone(); let n = 0;
    for (const c of Object.values(g.cells)) if (c.rates && !c.step && c.gear === 'mid' && c.tier === 'normal' && inBandCell(D, c) && n < 40) { c.rates.deaths = (c.rates.deaths || 0) + 5; n++; }
    for (const c of Object.values(g.cells)) if (c.rates && c.rates.sample) c.rates.sample.heroHours *= 20;   // a pool wide enough to judge on the quick grid too (its Normal MID pool is about 110 hero-hours)
    const j = judgeGrid(D, g, { K });
    const row = (b) => j.rows.find((r) => r.band === b && String(r.at).startsWith('POOLED'));
    const ok = row('S2.mid') && row('S2.mid').status === 'RED' && row('S7.mid') && row('S7.mid').status === 'RED';
    if (!ok) fails++;
    console.log('  ' + (ok ? 'CAUGHT ' : 'MISSED ') + 'deaths: 5 deaths planted in each of ' + n + ' Normal MID cells: the pooled rows read S2.mid ' + (row('S2.mid') || {}).status + ' (' + (row('S2.mid') || {}).shown + '), S7.mid ' + (row('S7.mid') || {}).status);
  }
  /* the projected gear line has no price: its checkpoints are never judged on a gear cost */
  {
    const bad = clean.rows.filter((r) => ['G-10', 'E4', 'E3'].includes(r.band) && Number(String(r.at).split(' ')[1]) >= 200 && r.status !== 'n/a');
    const ok = !bad.length; if (!ok) fails++;
    console.log('  ' + (ok ? 'SILENT ' : 'NOISY  ') + 'gear cost past 185 (no price rows) is not judged' + (ok ? '' : ': ' + bad.map((r) => r.band + ' ' + r.at + ' ' + r.status).join(', ')));
  }
  /* the heroes past the measured skill line (Level 100) are the game's own reference hero, never a straight line in skill levels (fault F15:
     Melee 198 at Level 400 where the curve allows 129) */
  {
    const TH = await import(pathToFileURL(join(ROOT, 'src/data/to-hit.js')).href);
    const bad = [];
    for (const L of [110, 200, 400]) {
      const sk = D.skillsAt(D.lines, 'alone', 'hammer', L), ref = TH.REF_HERO.find((r) => r[0] === L);
      if (!ref || sk.melee !== ref[1] || sk.defense !== ref[2]) bad.push('Level ' + L + ': Melee ' + sk.melee + ' Defense ' + sk.defense + ', the reference hero ' + (ref ? ref[1] + ' / ' + ref[2] : 'has no row'));
    }
    const ok = !bad.length; if (!ok) fails++;
    console.log('  ' + (ok ? 'SILENT ' : 'NOISY  ') + 'the lone hammer past Level 100 is the reference hero the monsters are written against' + (ok ? ' (Melee ' + D.skillsAt(D.lines, 'alone', 'hammer', 400).melee + ' at Level 400)' : ': ' + bad.join('; ')));
  }
  /* the kits: a changed RULE (LOW two tiers under), a changed DATA row (a planted gettable ring of a higher tier) */
  {
    const base = K.kitFor(45, 'low', 'hammer', { ground: 'hasks_ford' });
    const states = JSON.parse(JSON.stringify(STD.GEAR_STATES)); states.low.ladder.tierOffset = -2;
    const K2 = await loadKits(ROOT, { states });
    const moved = K2.kitFor(45, 'low', 'hammer', { ground: 'hasks_ford' });
    const tier = (id) => Number((K.ITEMS[id] || {}).tier) || 1;
    const ok = tier(moved.kit.weapon) === tier(base.kit.weapon) - 1 && tier(moved.kit.body) === tier(base.kit.body) - 1;
    if (!ok) fails++;
    console.log('  ' + (ok ? 'CAUGHT ' : 'MISSED ') + 'a gear RULE moves the kits: LOW at tierOffset -2 wears ' + moved.kit.weapon + ' / ' + moved.kit.body + ' where -1 wore ' + base.kit.weapon + ' / ' + base.kit.body);
    const states3 = JSON.parse(JSON.stringify(STD.GEAR_STATES)); states3.mid.temper.blows = 4;
    const K3 = await loadKits(ROOT, { states: states3 });
    const r3 = K3.kitFor(45, 'mid', 'hammer', { ground: 'hasks_ford' }).temper, r0 = K.kitFor(45, 'mid', 'hammer', { ground: 'hasks_ford' }).temper;
    const ok3 = Object.values(r3 || {}).every((n) => n === 4) && Object.values(r0 || {}).every((n) => n === 2) && Object.keys(r0 || {}).length > 0;
    if (!ok3) fails++;
    console.log('  ' + (ok3 ? 'CAUGHT ' : 'MISSED ') + 'a gear RULE moves the rungs: MID at 4 rungs holds ' + JSON.stringify(r3) + ' where the rule holds ' + JSON.stringify(r0));
  }
  {
    const before = K.kitFor(60, 'mid', 'hammer', { ground: 'the_slake' }).kit.ring1;
    K.ITEMS.planted_grid_band = { n: 'Planted Band', type: 'jewelry', slot: 'ring', tier: 9, reqLv: 1, v: 1, atkB: 1 };
    K.gear.reach.set('planted_grid_band', 'a planted shop row');
    const after = K.kitFor(60, 'mid', 'hammer', { ground: 'the_slake' }).kit.ring1;
    delete K.ITEMS.planted_grid_band; K.gear.reach.delete('planted_grid_band');
    const back = K.kitFor(60, 'mid', 'hammer', { ground: 'the_slake' }).kit.ring1;
    const ok = after === 'planted_grid_band' && before !== after && back === before;
    if (!ok) fails++;
    console.log('  ' + (ok ? 'CAUGHT ' : 'MISSED ') + 'a DATA row moves the kits: a planted gettable tier-9 ring is worn by MID at 60 (' + before + ' -> ' + after + ', back to ' + back + ' when it goes)');
  }
  console.log(fails ? 'GRID --selftest: ' + fails + ' NOT caught' : 'GRID --selftest: every plant caught, the control silent');
  return fails ? 1 : 0;
}

/** The data judgeGrid needs beyond loadGridData (the cost model). */
export async function costContext(root) {
  const m = await import(pathToFileURL(join(root, 'tools/balance-program/model.mjs')).href);
  const me = await import(pathToFileURL(join(root, 'tools/balance-program/measure.mjs')).href);
  return { model: m, accountCost: me.accountCost };
}
