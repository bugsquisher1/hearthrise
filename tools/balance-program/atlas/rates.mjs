// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/rates.mjs — WHAT AN HOUR ON EACH GROUND PAYS, the hourly rates the atlas and the solver read.
//
// The atlas needs kills an hour BY MONSTER on EVERY ground (a drop's hours = 1 / (its monster's kills an hour x its chance)), and the
// solver needs Level XP and net gold an hour on every ground a party may stand on. The grid (tools/balance-program/grid.mjs, the sibling
// lane) measures one ground per checkpoint, the one the game recommends; this table measures every ground at the two ends of its own band,
// for every party size of 50-standards 1.3 and every tier the ground has, in the MID kit. It is the ground axis the grid does not have.
//
//   measureJobs(opts)     the cells to play (tools/balance-sim/cell.mjs through the worker pool, tools/balance-sim/pool.mjs)
//   loadRates(file)       the cached table (tools/balance-program/ground-rates.json), or null
//   rateOf(table, q)      { killsPerH, killsByPerH, xpPerHeroH, netPerHeroH, ... } for { ground, level, party, tier }, interpolated by Level
//                         between the two measured ends and held flat outside them; null when nothing was measured there
//   gridScale(grid, q)    LOW and BiS against MID from grid.json at the nearest checkpoint (1 when the grid is not there yet)
//
// LABELS. A rate is MEASURED (the real settle, MID kit, `seeds` x `hours`), and INTERPOLATED between the two Levels it was measured at.
// LOW and BiS are MID x the grid's own ratio once grid.json exists; until then they are not printed (never guessed).
// PURE apart from the file read. Plays nothing itself: sources.mjs --measure hands measureJobs to the pool.
// ════════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from 'node:fs';

/* 50-standards 1.3 (tools/balance-program/standards.mjs PARTIES) in the simulator's style words (tools/balance-sim/styles.mjs). */
const STYLE_OF = Object.freeze({ warhammer: 'hammer', tank: 'tank', mage: 'mage', ranger: 'bow', healer: 'healer' });
export const styleOf = (seat) => STYLE_OF[seat] || seat;

/** The party compositions to play, by size: [{ size, comps: [[style...]...] }] from PARTIES. `quick` keeps sizes 1 and 4 and one comp each. */
export function partyComps(PARTIES, quick) {
  return PARTIES.filter((p) => !quick || p.size === 1 || p.size === 4)
    .map((p) => ({ size: p.size, fromLevel: p.fromLevel || 1, comps: (quick ? p.seats.slice(0, 1) : p.seats).map((c) => c.map(styleOf)) }));
}

/** The grounds a party hunts for loot (not the Tower's run grounds, the yard or a called room: those are priced from their own rows). */
export function huntGrounds(HUNT_GROUNDS, HUNT_INDEX) {
  return Object.keys(HUNT_GROUNDS).filter((g) => HUNT_INDEX[g] && Array.isArray(HUNT_INDEX[g].band)).sort();
}

/** The two Levels a ground is measured at: its band's floor (at least 1) and its top. */
export function bandEnds(HUNT_INDEX, g, ground = null) {
  const [lo, hi0] = HUNT_INDEX[g].band;
  /* a ground that sends a hero home at a Level (the Cellar's endsAtLevel) is measured under it */
  const hi = ground && Number.isInteger(ground.endsAtLevel) ? Math.min(hi0, ground.endsAtLevel - 1) : hi0;
  const a = Math.max(1, lo), b = Math.max(a, hi);
  return a === b ? [a] : [a, b];
}

/**
 * The cells to play. opts: { HUNT_GROUNDS, HUNT_INDEX, OPEN_GROUNDS, PARTIES, tiersOf, quick, seeds, hours, only (ground ids) }.
 * One cell a (ground, band end, composition, tier). A staged ground plays its own drops open (gear.openAlso), as measure.mjs does.
 */
export function measureJobs(o) {
  const jobs = [];
  const comps = partyComps(o.PARTIES, o.quick);
  for (const g of huntGrounds(o.HUNT_GROUNDS, o.HUNT_INDEX)) {
    if (o.only && !o.only.includes(g)) continue;
    const tiers = ['normal', ...o.tiersOf(g).filter((t) => t !== 'normal')];
    const useTiers = o.quick ? [...new Set(['normal', tiers[tiers.length - 1]])] : tiers;
    for (const level of bandEnds(o.HUNT_INDEX, g, o.HUNT_GROUNDS[g])) for (const pc of comps) {
      if (level < pc.fromLevel && pc.size > 1) continue;
      pc.comps.forEach((party, ci) => {
        for (const tier of useTiers) {
          jobs.push({ id: ['GR', g, level, pc.size, ci, tier].join(':'), ground: g, level, party, hours: o.hours, seeds: o.seeds, profile: 'played',
            gear: { uniques: true, ...(o.OPEN_GROUNDS[g] ? {} : { openAlso: [g] }) }, ...(tier !== 'normal' ? { options: { tier } } : {}),
            meta: { ground: g, level, size: pc.size, comp: ci, tier } });
        }
      });
    }
  }
  return jobs;
}

/** One pool result (cell.mjs runCell + the job's meta) as a table row: every number a head an hour, kills the party's. */
export function rowOfResult(job, m) {
  const hs = m.heroes || [];
  const mean = (f) => (hs.length ? hs.reduce((s, h) => s + (Number(f(h)) || 0), 0) / hs.length : 0);
  return {
    ...job.meta, party: job.party, seeds: job.seeds, hours: m.party.hours,
    killsPerH: m.party.killsPerH, killsByPerH: m.party.killsByPerH || {},
    xpPerHeroH: Math.round(mean((h) => h.levelXpPerH)), netPerHeroH: Math.round(mean((h) => h.profitPerH)),
    incomePerHeroH: Math.round(mean((h) => h.incomePerH)), storePerHeroH: Math.round(mean((h) => h.storePerH)),
    /* store buys a party-hour by item (the supplies the hunt bought at the store): the town's T3 reads them */
    buysPerH: hs.reduce((m, h) => { for (const [k, n] of Object.entries(h.buysPerH || {})) m[k] = Math.round(((m[k] || 0) + n) * 10) / 10; return m; }, {}),
    deaths: hs.reduce((n, h) => n + (h.deaths || 0), 0), lowHpP10: Math.min(...hs.map((h) => (h.encMinHpPct || {}).p10 ?? 100)),
  };
}

export function loadRates(file) {
  if (!existsSync(file)) return null;
  const t = JSON.parse(readFileSync(file, 'utf8'));
  return t && Array.isArray(t.rows) ? t : null;
}

const lerp = (a, b, f) => a + (b - a) * f;
function mix(r0, r1, f) {
  if (!r1 || r0 === r1) return r0;
  const by = {};
  for (const k of new Set([...Object.keys(r0.killsByPerH), ...Object.keys(r1.killsByPerH)])) by[k] = lerp(r0.killsByPerH[k] || 0, r1.killsByPerH[k] || 0, f);
  const out = { ...r0, killsByPerH: by, level: lerp(r0.level, r1.level, f), interpolated: f > 0 && f < 1 };
  for (const k of ['killsPerH', 'xpPerHeroH', 'netPerHeroH', 'incomePerHeroH', 'storePerHeroH', 'lowHpP10']) out[k] = lerp(r0[k], r1[k], f);
  out.deaths = Math.max(r0.deaths, r1.deaths);
  return out;
}

/**
 * The rate for { ground, level, party (size), tier }: the best composition of that size (by Level XP), interpolated by Level between the
 * ground's measured ends and held flat outside them. null when the table has no cell for that ground, size and tier.
 */
export function rateOf(table, q) {
  if (!table) return null;
  const key = q.ground + '|' + q.party + '|' + q.tier;
  let idx = table._idx;
  if (!idx) {
    idx = new Map();
    for (const r of table.rows) {
      const k = r.ground + '|' + r.size + '|' + r.tier;
      const byLevel = idx.get(k) || new Map();
      const cur = byLevel.get(r.level);
      if (!cur || r.xpPerHeroH > cur.xpPerHeroH) byLevel.set(r.level, r);
      idx.set(k, byLevel);
    }
    Object.defineProperty(table, '_idx', { value: idx, enumerable: false });
  }
  const byLevel = idx.get(key);
  if (!byLevel || !byLevel.size) return null;
  const lv = [...byLevel.keys()].sort((a, b) => a - b);
  if (q.level <= lv[0]) return byLevel.get(lv[0]);
  if (q.level >= lv[lv.length - 1]) return byLevel.get(lv[lv.length - 1]);
  for (let i = 1; i < lv.length; i++) if (q.level <= lv[i]) return mix(byLevel.get(lv[i - 1]), byLevel.get(lv[i]), (q.level - lv[i - 1]) / (lv[i] - lv[i - 1]));
  return byLevel.get(lv[lv.length - 1]);
}


/**
 * The progression grid's cells as plain rows { checkpoint, gear, party, comp, tier, ground, killsAnHour, levelXp, netGold, killsByPerH }. Takes
 * the shape tools/balance-program/progression-grid.mjs readGrid answers (cells: { key: { L, gear, party, comp, tier, ground, step, error, rates } }),
 * its packed cache on disk (cells: [[CELL_FIELDS values], [RATE_FIELDS values]]), or plain rows. E1's step cells (one slot group moved) and
 * errored cells are left out: they are not a gear state.
 */
export function gridCells(grid) {
  if (!grid || !grid.cells) return [];
  if (grid._plain) return grid._plain;
  const out = [];
  const push = (k, v) => {
    if (k.error || k.step) return;
    out.push({ checkpoint: Number(k.L ?? k.checkpoint ?? k.level), gear: k.gear, party: Number(k.party), comp: k.comp || null, tier: k.tier || 'normal', ground: k.ground,
      killsAnHour: v.killsPerH ?? v.killsAnHour, levelXp: v.levelXpPerH ?? v.levelXp, netGold: v.netPerH ?? v.netGold, killsByPerH: v.killsByPerH || {} });
  };
  if (!Array.isArray(grid.cells)) for (const c of Object.values(grid.cells)) push(c, c.rates || {});
  else if (grid.cellFields && grid.rateFields) {
    for (const pair of grid.cells) {
      if (!Array.isArray(pair) || !Array.isArray(pair[0])) continue;
      push(Object.fromEntries(grid.cellFields.map((n, i) => [n, pair[0][i]])), Array.isArray(pair[1]) ? Object.fromEntries(grid.rateFields.map((n, i) => [n, pair[1][i]])) : {});
    }
  } else for (const c of grid.cells) push(c, c);
  Object.defineProperty(grid, '_plain', { value: out, enumerable: false });
  /* the index gridScale reads: gear|party|tier -> its cells */
  const idx = new Map();
  for (const c of out) { const k = c.gear + '|' + c.party + '|' + c.tier; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(c); }
  Object.defineProperty(grid, '_idx', { value: idx, enumerable: false });
  return out;
}

/**
 * LOW or BiS against MID from the grid, at the checkpoint nearest the Level (same party size, tier and seating): kills and XP as RATIOS, net gold
 * as gold a hero-hour ADDED (`netDelta`; a net near zero makes a ratio meaningless: a four's MID +1,764 and BiS +233 is not "0.13 times").
 * Ones and a zero when the grid is absent or has no such pair; `from` is the checkpoint read.
 */
export function gridScale(grid, q) {
  const one = { kills: 1, xp: 1, netDelta: 0, from: null };
  if (!grid || q.gear === 'mid' || !gridCells(grid).length) return one;
  const others = grid._idx.get(q.gear + '|' + q.party + '|' + q.tier) || [], mids = grid._idx.get('mid|' + q.party + '|' + q.tier) || [];
  if (!others.length || !mids.length) return one;
  const o = others.reduce((b, c) => (Math.abs(c.checkpoint - q.level) < Math.abs(b.checkpoint - q.level) ? c : b), others[0]);
  const m = mids.find((c) => c.checkpoint === o.checkpoint && c.comp === o.comp) || mids.find((c) => c.checkpoint === o.checkpoint);
  if (!m) return one;
  const r = (k) => (Number(m[k]) > 0 && Number(o[k]) > 0 ? Number(o[k]) / Number(m[k]) : 1);
  return { kills: r('killsAnHour'), xp: r('levelXp'), netDelta: (Number(o.netGold) || 0) - (Number(m.netGold) || 0), from: o.checkpoint };
}
