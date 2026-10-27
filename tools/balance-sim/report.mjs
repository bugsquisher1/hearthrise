#!/usr/bin/env node
// tools/balance-sim/report.mjs — THE BASELINE REPORT from a simulator run (today's game vs Tyler's balance ruling).
//
//   node tools/balance-sim/report.mjs [--in tools/balance-sim/out/baseline] [--summary tools/balance-sim/baseline-summary.json]
//
// Reads the run's cells.jsonl and writes, beside it: dashboard.json (one flat row per hero per cell: ground x style x
// Level x party x density x variant, the shape a filterable Dashboard artifact reads) and cells.csv (the same rows);
// and the COMMITTED summary (--summary): the ruling's targets against the measured game, every table the report
// quotes. Prints the tables. Every measured number comes from the run; the only arithmetic here is aggregation,
// interpolation and the stated extrapolation past the last ground (Level 50), labelled as such wherever it is used.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { round, rateCI } from './stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IN = resolve(arg('in', join(HERE, 'out', 'baseline')));
const SUMMARY = resolve(arg('summary', join(HERE, 'baseline-summary.json')));

/* THE RULING'S TARGETS (Tyler 2026-10-25, balance ruling §2, §3, §5, §8, §9) */
const TARGET_HOURS = [[1, 0], [10, 6], [25, 36], [50, 168], [100, 600], [200, 1680], [300, 3120], [500, 6720], [750, 13440], [1000, 23520]];
const PARTY_TARGET = { 2: [1.05, 1.15], 3: [1.10, 1.20], 4: [1.15, 1.25] };
const WEAPON_STEP = [0.05, 0.08], ARMOUR_STEP = [0.03, 0.05];
const MILESTONES = [10, 25, 50, 100, 200, 300, 500, 750, 1000];

const u = (p) => pathToFileURL(join(ROOT, p)).href;
const { BUILD } = await import(u('src/build-info.js'));
const XP = await import(u('src/core/xp.js') + '?v=' + BUILD.version);
const AR = await import(u('src/core/action-rules.js') + '?v=' + BUILD.version);
const { BLESSING_TIERS, blessingPrice } = await import(u('src/data/blessings.js'));
const { LEVEL_CURVE, LEVEL_PACE } = await import(u('src/data/core-model.js'));
/* the Level pace of record (tools/balance-sim/pace.mjs --write), when it exists */
const PACE_FILE = join(HERE, 'level-pace.json');
const PACE = existsSync(PACE_FILE) ? JSON.parse(readFileSync(PACE_FILE, 'utf8')) : null;

const rows = existsSync(join(IN, 'cells.jsonl')) ? readFileSync(join(IN, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
/* the reference lives as built; a full-box life (density 8: plan pacebounds' box, or the older career8 run) is a bound */
const careers = rows.filter((r) => r.kind === 'career' && !Number.isInteger(r.density));
const boxCareers = rows.filter((r) => r.kind === 'career' && Number.isInteger(r.density));
const cells = rows.filter((r) => r.kind !== 'career' && r.heroes);
const stage = (c) => ((c.id.match(/x=(S\d|LAD)/) || [])[1] || (c.id.includes('x=cost') ? 'cost' : 'S?'));
const styleKey = (c) => c.cell.party.join('+');
const dens = (c) => (Number.isInteger(c.cell.density) ? c.cell.density : 0);
const variant = (c) => (c.cell.gear ? JSON.stringify(c.cell.gear) : '') + (c.cell.bar ? JSON.stringify(c.cell.bar) : '') + (c.cell.supply ? 'supply:' + c.cell.supply : '');
const plain = (c) => !variant(c);
const meanXp = (c) => c.party.levelXpPerHeroPerH;
/* A cell a player can farm: "reasonably efficient hunting" that LASTS (ruling §2-§3): nobody died, close calls at or
   under one per 12 h, the typical encounter no harder than Normal (minimum HP >= 60%), and it pays for its own
   supplies (profit >= 0: a hunt that loses gold ends on gold_out, so it is not a 12 h hunt) */
const safe = (c) => c.heroes.every((h) => h.deaths === 0 && (h.closeCallsPer12h.rate || 0) <= 1 && (h.encMinHpPct.p50 === null || h.encMinHpPct.p50 >= 60) && h.profitPerH >= 0);

/* ── 1. LEVEL XP AN HOUR BY LEVEL (skills at the hero's Level), the efficient pick per Level ─────────────── */
function xpCurve(style, inBand) {
  /* per ground and density: [L, xp/h] sampled; efficient = the best safe sample at each Level, interpolated.
     inBand: only a ground at or above whose floor the hero stands (no hunting under a ground's floor: min-maxing) */
  const series = {};
  for (const c of cells) {
    if (c.cell.party.length !== 1 || c.cell.party[0] !== style || !plain(c) || !/S2|S3/.test(stage(c))) continue;
    if (!safe(c)) continue;
    if (inBand && c.hunt.band && c.cell.level < c.hunt.band[0]) continue;
    const k = c.ground + '@' + dens(c);
    (series[k] = series[k] || []).push([c.cell.level, meanXp(c)]);
  }
  for (const k of Object.keys(series)) series[k].sort((a, b) => a[0] - b[0]);
  const at = (L) => {
    let best = null, where = null;
    for (const [k, s] of Object.entries(series)) {
      if (L < s[0][0] || L > s[s.length - 1][0]) continue;
      let y = s[0][1];
      for (let i = 1; i < s.length; i++) if (L <= s[i][0]) { const [x0, y0] = s[i - 1], [x1, y1] = s[i]; y = y0 + ((y1 - y0) * (L - x0)) / Math.max(1, x1 - x0); break; }
      if (best === null || y > best) { best = y; where = k; }
    }
    return { xp: best, where };
  };
  return { series, at };
}

/* A power law xp/h = a L^b fitted (log-log least squares) over measured Levels >= 10: THE EXTRAPOLATION past Level 50 */
function fitPower(pts) {
  const p = pts.filter(([L, y]) => L >= 10 && y > 0);
  if (p.length < 2) return null;
  const xs = p.map(([L]) => Math.log(L)), ys = p.map(([, y]) => Math.log(y));
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { a: Math.exp(my - b * mx), b };
}

const dXp = (curve, L) => curve(L + 1) - curve(L);
/* the shipped Level curve (src/core/xp.js over LEVEL_CURVE's pace brackets) */
const TODAY = (L) => XP.charXpForLevel(L);
/* hours from Level 1 to each milestone on `curve` at xp/h `rate(L)` */
function hoursTable(curve, rate) {
  const out = {};
  let h = 0, L = 1;
  for (const m of MILESTONES) { for (; L < m; L++) h += dXp(curve, L) / Math.max(1, rate(L)); out[m] = round(h, 1); }
  return out;
}
const targetAt = (L) => {
  for (let i = 1; i < TARGET_HOURS.length; i++) {
    const [x0, y0] = TARGET_HOURS[i - 1], [x1, y1] = TARGET_HOURS[i];
    if (L <= x1) {
      if (y0 <= 0) return (y1 * (L - x0)) / (x1 - x0);
      const t = Math.log(L / x0) / Math.log(x1 / x0);
      return Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0)));
    }
  }
  return TARGET_HOURS[TARGET_HOURS.length - 1][1];
};

/* style -> its measured efficient Level XP an hour at a Level (null where no safe cell covers it) */
const RATES = {};
function levelHours() {
  const styles = [...new Set(cells.filter((c) => c.cell.party.length === 1).map((c) => c.cell.party[0]))];
  const per = {};
  for (const s of styles) {
    const cv = xpCurve(s);
    const pts = [];
    for (let L = 1; L <= 55; L++) { const v = cv.at(L); if (v.xp !== null) pts.push([L, v.xp, v.where]); }
    if (!pts.length) continue;
    const fit = fitPower(pts);
    const last = pts[pts.length - 1][0];
    const rate = (L) => { const v = pts.find((p) => p[0] === L); if (v) return v[1]; if (L < pts[0][0]) return pts[0][1]; return fit ? fit.a * L ** fit.b : pts[pts.length - 1][1]; };
    /* TODAY'S CONTENT: past the last ground the hero keeps its best last ground's rate (no ground beyond it) */
    const flat = (L) => (L <= last ? rate(L) : pts[pts.length - 1][1]);
    RATES[s] = (L) => { const v = pts.find((p) => p[0] === L); return v ? v[1] : null; };
    per[s] = { measuredTo: last, fit: fit ? { a: round(fit.a, 1), b: round(fit.b, 3) } : null,
      xpPerH: Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((L) => L <= last).map((L) => [L, round(rate(L), 0)])),
      where: Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((L) => L <= last).map((L) => [L, (pts.find((p) => p[0] === L) || [])[2] || null])),
      hoursTrend: hoursTable(TODAY, rate), hoursTodayContent: hoursTable(TODAY, flat) };
  }
  return per;
}

/* ── 2. THE LEVEL CURVE against the ruling: the shipped curve's hours at the measured (then extrapolated) rate, and the
   ideal totals (the ruling's hours for each Level x that rate). The curve itself is FITTED by tools/balance-sim/pace.mjs
   --fit on the career measurement (plan pace: a hero's life where the game recommends), not here (lane/b-level-curve). ── */
function proposeCurve(rate, alt) {
  const want = (L) => (targetAt(L + 1) - targetAt(L)) * rate(L);
  const cum = [0, 0];
  for (let L = 1; L <= 1000; L++) cum[L + 1] = cum[L] + want(L);
  const table = (f, r) => Object.fromEntries(MILESTONES.map((L) => [L, round(hoursTable(f, r || rate)[L], 0)]));
  const both = (f) => ({ hours: table(f), ...Object.fromEntries(Object.entries(alt || {}).filter(([, r]) => r).map(([k, r]) => ['hoursAt_' + k, table(f, r)])) });
  const xpAt = (f) => Object.fromEntries(MILESTONES.map((L) => [L, f(L)]));
  return { ideal: Object.fromEntries(MILESTONES.map((L) => [L, Math.round(cum[L])])),
    today: { coeffs: LEVEL_CURVE, totalXp: xpAt(TODAY), ...both(TODAY) }, fittedBy: 'tools/balance-sim/pace.mjs --fit',
    target: Object.fromEntries(MILESTONES.map((L) => [L, round(targetAt(L), 0)])) };
}

/* ── 3. DIFFICULTY BANDS per ground and Level offset ───────────────────────────────────────────────────── */
function bands() {
  const out = [];
  for (const c of cells) {
    if (c.cell.party.length !== 1 || !plain(c) || !/S2|S3|S7/.test(stage(c))) continue;
    const h = c.heroes[0], b = c.hunt.band || [0, 0];
    const off = c.cell.level < b[0] ? c.cell.level - b[0] : c.cell.level > b[1] ? c.cell.level - b[1] : 0;
    out.push({ ground: c.ground, style: h.style, level: c.cell.level, density: dens(c), offset: off, hours: h.hours,
      minHpP50: h.encMinHpPct.p50, minHpP10: h.encMinHpPct.p10, deaths: h.deaths, close: h.closeCallsPer12h.k || 0, band: h.band,
      xpPerH: h.levelXpPerH, profitPerH: h.profitPerH });
  }
  /* one row per ground x Level x density over every style: the difficulty a ground has at that offset from its band */
  const by = {};
  for (const r of out) (by[r.ground + '|' + r.level + '|' + r.density] = by[r.ground + '|' + r.level + '|' + r.density] || []).push(r);
  const med = (a) => { const x = a.filter((v) => v !== null).sort((p, q) => p - q); return x.length ? x[Math.floor((x.length - 1) / 2)] : null; };
  return Object.values(by).map((v) => {
    const hours = v.reduce((t, x) => t + x.hours, 0), deaths = v.reduce((t, x) => t + x.deaths, 0);
    return { ground: v[0].ground, level: v[0].level, density: v[0].density, offset: v[0].offset, styles: v.length, hours: round(hours, 0),
      minHpP50Median: med(v.map((x) => x.minHpP50)), minHpP10Worst: Math.min(...v.map((x) => (x.minHpP10 === null ? 100 : x.minHpP10))),
      deaths, deathsPer1000h: rateCI(deaths, hours, 1000), closeCalls: v.reduce((t, x) => t + x.close, 0), bands: [...new Set(v.map((x) => x.band))],
      xpPerHMedian: med(v.map((x) => x.xpPerH)), profitPerHWorst: Math.min(...v.map((x) => x.profitPerH)) };
  }).sort((a, b) => (a.ground < b.ground ? -1 : a.ground > b.ground ? 1 : a.level - b.level || a.density - b.density));
}

/* ── 4. PARTY vs SOLO, per character ──────────────────────────────────────────────────────────────────── */
function partyVsSolo() {
  const out = [];
  const solo = (g, s, L, d) => cells.find((c) => c.ground === g && c.cell.party.length === 1 && c.cell.party[0] === s && c.cell.level === L && dens(c) === d && plain(c));
  for (const c of cells) {
    if (c.cell.party.length < 2 || !plain(c) || !/S4|S7/.test(stage(c))) continue;
    const L = c.cell.level, d = dens(c);
    const same = c.cell.party.map((s) => solo(c.ground, s, L, d)).filter(Boolean);
    const sameMean = same.length === c.cell.party.length ? same.reduce((t, x) => t + meanXp(x), 0) / same.length : null;
    /* the efficient solo: the best SAFE solo cell at this Level anywhere (any ground, style, density) */
    const eff = cells.filter((x) => x.cell.party.length === 1 && x.cell.level === L && plain(x) && safe(x)).sort((a, b) => meanXp(b) - meanXp(a))[0] || null;
    /* THE COMPARABLE SOLO (ruling §5: same Levels, gear, sustainable strategies): each member's own style hunting
       alone at its best safe option at this Level (any ground, either density), averaged over the members */
    const own = c.cell.party.map((s) => cells.filter((x) => x.cell.party.length === 1 && x.cell.party[0] === s && x.cell.level === L && plain(x) && safe(x))
      .reduce((b, x) => Math.max(b, meanXp(x)), 0));
    const ownMean = own.every((y) => y > 0) ? own.reduce((t, y) => t + y, 0) / own.length : null;
    const n = c.cell.party.length, per = meanXp(c);
    const heroes = c.heroes.map((h) => ({ style: h.style, xpPerH: h.levelXpPerH, incomePerH: h.incomePerH, storePerH: h.storePerH, profitPerH: h.profitPerH, deaths: h.deaths }));
    const incomeAll = heroes.reduce((t, h) => t + h.incomePerH, 0), storeAll = heroes.reduce((t, h) => t + h.storePerH, 0);
    out.push({ ground: c.ground, party: styleKey(c), size: n, level: L, density: d, hours: c.party.hours, xpPerHero: per,
      vsSameGroundSolo: sameMean ? round(per / sameMean, 3) : null, sameGroundSoloXp: sameMean ? round(sameMean, 0) : null,
      vsComparableSolo: ownMean ? round(per / ownMean, 3) : null, comparableSoloXp: ownMean ? round(ownMean, 0) : null,
      vsEfficientSolo: eff ? round(per / meanXp(eff), 3) : null, efficientSolo: eff ? { id: eff.id, xp: meanXp(eff) } : null,
      target: PARTY_TARGET[n] || null, heroes, rareRolls: c.party.rareRolls, rareWins: c.party.rareWins, rareGini: c.party.rareGini,
      /* gold: created by the hunt (coin + loot at the vendor's bid), destroyed (store supplies); per controlling player
         when one player runs all of them (one account purse); Mode B (shared) would move each hero to the party mean */
      createdPerH: c.party.createdPerH, destroyedPerH: c.party.destroyedPerH, accountNetPerH: round(incomeAll - storeAll, 0),
      modeBTransfersPerH: heroes.map((h) => round((incomeAll - storeAll) / n - h.profitPerH, 0)) });
  }
  return out;
}

/* ── 5. UPGRADE STEPS (weapon: measured hunting performance; armour: incoming damage) ───────────────────── */
function upgrades() {
  const out = [];
  const base = cells.filter((c) => stage(c) === 'S5' && !c.cell.gear);
  for (const b of base) {
    const h0 = b.heroes[0];
    for (const only of ['weapon', 'armour', 'body']) {
      const v = cells.find((c) => stage(c) === 'S5' && c.cell.gear && c.cell.gear.only === only && c.ground === b.ground && c.cell.level === b.cell.level
        && c.cell.party[0] === b.cell.party[0] && dens(c) === dens(b));
      if (!v) continue;
      const h1 = v.heroes[0];
      const pct = (a, z) => (z ? round((a / z - 1) * 100, 1) : null);
      out.push({ style: h0.style, level: b.cell.level, ground: b.ground, density: dens(b), step: only,
        from: only === 'weapon' ? h1.kit.weapon : only === 'body' ? h1.kit.body : h1.kit.helmet, to: only === 'weapon' ? h0.kit.weapon : only === 'body' ? h0.kit.body : h0.kit.helmet,
        xpPerHGainPct: pct(h0.levelXpPerH, h1.levelXpPerH), killsPerHGainPct: pct(b.party.killsPerH, v.party.killsPerH), dpsGainPct: pct(h0.dps, h1.dps),
        profitPerHDelta: h0.profitPerH - h1.profitPerH, ttkP50: [v.party.ttkS.p50, b.party.ttkS.p50],
        takenPerSwingCutPct: h1.dmgPerMonsterSwing ? round((1 - h0.dmgPerMonsterSwing / h1.dmgPerMonsterSwing) * 100, 1) : null,
        takenPerHCutPct: h1.takenPerH ? round((1 - h0.takenPerH / h1.takenPerH) * 100, 1) : null,
        storePerHDelta: h0.storePerH - h1.storePerH, deaths: [h1.deaths, h0.deaths], hours: [h1.hours, h0.hours],
        target: only === 'weapon' ? WEAPON_STEP : ARMOUR_STEP });
    }
  }
  return out;
}

/* ── 6. HEALING AND SUSTAIN ───────────────────────────────────────────────────────────────────────────── */
function healing() {
  const out = [];
  for (const c of cells) {
    if (c.cell.party.length !== 1 || !/S3|S6/.test(stage(c))) continue;
    if (stage(c) === 'S3' && !cells.some((x) => stage(x) === 'S6' && x.ground === c.ground && x.cell.level === c.cell.level && x.cell.party[0] === c.cell.party[0])) continue;
    const h = c.heroes[0];
    out.push({ ground: c.ground, style: h.style, level: c.cell.level, density: dens(c), variant: variant(c) || 'reference bar, store food',
      takenPerH: h.takenPerH, healInPerH: h.healInPerH, regenSharePct: h.takenPerH ? round(100 * Math.max(0, 1 - h.healInPerH.total / h.takenPerH), 1) : null,
      sustainRatio: h.sustainRatio, eatsPerH: h.eatsPerH, storePerH: h.storePerH, profitPerH: h.profitPerH,
      deaths: h.deaths, minHpP10: h.encMinHpPct.p10, closePer12h: h.closeCallsPer12h.rate, band: h.band });
  }
  return out;
}

/* ── 6b. STYLES SIDE BY SIDE: per ground and in-band Level, every style's XP/h and profit/h ranked (dominant / weak) ── */
function styles() {
  const out = [];
  const groups = {};
  for (const c of cells) {
    if (c.cell.party.length !== 1 || !plain(c) || !/S2|S3/.test(stage(c))) continue;
    const b = c.hunt.band || [0, 0];
    if (c.cell.level < b[0] || c.cell.level > b[1]) continue;
    const k = c.ground + '|' + c.cell.level + '|' + dens(c);
    (groups[k] = groups[k] || []).push(c);
  }
  const top = {}, bottom = {};
  for (const [k, cs] of Object.entries(groups)) {
    const [ground, level, density] = k.split('|');
    const r = cs.map((c) => ({ style: c.heroes[0].style, xpPerH: c.heroes[0].levelXpPerH, profitPerH: c.heroes[0].profitPerH, deaths: c.heroes[0].deaths,
      minHpP10: c.heroes[0].encMinHpPct.p10, dps: c.heroes[0].dps })).sort((a, b) => b.xpPerH - a.xpPerH);
    if (r.length > 2) { top[r[0].style] = (top[r[0].style] || 0) + 1; bottom[r[r.length - 1].style] = (bottom[r[r.length - 1].style] || 0) + 1; }
    const best = r[0] ? r[0].xpPerH : 0;
    out.push({ ground, level: Number(level), density: Number(density), spreadPct: best && r.length ? round((1 - r[r.length - 1].xpPerH / best) * 100, 1) : null, ranked: r });
  }
  return { groups: out, firstPlaces: top, lastPlaces: bottom };
}

/* ── 6c. THE CANDIDATE CHANGES, before vs after on the same dice (plan 'whatif': x=W0 today, W1.. each candidate) ── */
function whatIfs(dirs) {
  const out = [];
  for (const d of dirs) {
    const f = join(d, 'cells.jsonl');
    if (existsSync(f)) out.push(...whatIfsOf(readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes)));
  }
  return out;
}
function whatIfsOf(ws) {
  const spec = (r) => r.id.replace(/,x=W\w+/, '');
  const base = new Map(ws.filter((r) => /x=W0\b/.test(r.id)).map((r) => [spec(r), r]));
  const out = [];
  for (const r of ws) {
    const m = r.id.match(/x=(W[1-9]\w*)/);
    if (!m) continue;
    const b = base.get(spec(r));
    if (!b) continue;
    out.push({ cell: spec(r), candidate: m[1], whatIf: r.cell.whatIf || null, heroes: r.heroes.map((h, i) => {
      const h0 = b.heroes[i];
      const pick = (x) => ({ xpPerH: x.levelXpPerH, profitPerH: x.profitPerH, storePerH: x.storePerH, takenPerH: x.takenPerH, eatsPerH: x.eatsPerH.own + x.eatsPerH.store,
        minHpP50: x.encMinHpPct.p50, minHpP10: x.encMinHpPct.p10, deaths: x.deaths, closeCalls: x.closeCallsPer12h.k, hours: x.hours, band: x.band });
      return { style: h.style, before: pick(h0), after: pick(h) };
    }) });
  }
  return out;
}

/* ── 6d. A PARTY XP SHARE BONUS, measured post hoc: XP feeds nothing inside a fight (a Level-up mid-hunt raises max HP,
   nothing else), so each party cell's Level XP x m(n) IS the cell played with that share. The bonus a cell needs to
   reach its target band's middle, and what the candidate m(n) = 1 + step x (n - 1) gives. ── */
function partyBonus(rows, step) {
  return rows.map((p) => {
    const m = 1 + step * (p.size - 1);
    const mid = p.target ? (p.target[0] + p.target[1]) / 2 : null;
    return { ground: p.ground, party: p.party, level: p.level, density: p.density, vsComparableSolo: p.vsComparableSolo, vsEfficientSolo: p.vsEfficientSolo,
      vsSameGroundSolo: p.vsSameGroundSolo, neededVsComparable: mid && p.vsComparableSolo ? round(mid / p.vsComparableSolo, 2) : null,
      neededVsEfficient: mid && p.vsEfficientSolo ? round(mid / p.vsEfficientSolo, 2) : null, candidate: round(m, 2),
      afterVsComparable: p.vsComparableSolo ? round(p.vsComparableSolo * m, 3) : null,
      afterVsEfficient: p.vsEfficientSolo ? round(p.vsEfficientSolo * m, 3) : null, afterVsSameGround: p.vsSameGroundSolo ? round(p.vsSameGroundSolo * m, 3) : null, target: p.target };
  });
}

/* ── 7. WHAT AN UNBLESSED DEATH COSTS, in hunting hours at the measured (then extrapolated) rate ──────────── */
function deathCost(rate) {
  return [10, 25, 30, 50, 100, 200, 500, 1000].map((L) => {
    const x = XP.charXpForLevel(L), mid = x + Math.floor((XP.charXpForLevel(L + 1) - x) / 2);
    const lost = AR.levelDeathLoss(mid);
    const hrs = lost / Math.max(1, rate(L));
    const blessed = Object.fromEntries(BLESSING_TIERS.map((t) => [t.tier, { hours: round(hrs * (1 - t.xpLossReductionPermille / 1000), 2),
      gold: BLESSING_TIERS.filter((r) => r.tier <= t.tier).reduce((s, r) => s + blessingPrice(r.tier, L), 0) }]));
    return { level: L, xpLostMidLevel: lost, shareOfLevel: round(lost / (XP.charXpForLevel(L + 1) - x), 3), unblessedHours: round(hrs, 2), blessed, extrapolated: L > 50 };
  });
}

/* ── THE AUDIT (ruling §10): the facts the code holds today, read from the data at report time ─────────── */
async function audit() {
  const v = '?v=' + BUILD.version;
  const G = await import(u('src/data/hunt-grounds.js') + v);
  const { HUNT_INDEX } = await import(u('src/data/hunts.js') + v);
  const { MONSTERS } = await import(u('src/data/monsters.js') + v);
  const { COMBAT_BALANCE } = await import(u('src/core/combat.js') + v);
  const CM = await import(u('src/data/core-model.js') + v);
  const { HUNT_TUNING } = await import(u('src/data/hunt-tuning.js') + v);
  const { CONSUMABLE_RULES } = await import(u('src/data/consumables.js') + v);
  const SB = await import(u('src/data/supply-basics.js') + v);
  const HS = await import(u('src/data/hunt-sessions.js') + v);
  const GT = await import(u('src/data/gear-tiers.js') + v);
  const { loadGear } = await import('./gear.mjs');
  const gear = await loadGear(ROOT);
  const census = gear.gearCensus();
  const grounds = Object.values(G.OPEN_GROUNDS).map((g) => {
    const ids = [...new Set(g.pockets.flatMap((p) => (p.pack || []).concat(p.spawns).map((s) => s.monster)))];
    return { id: g.id, band: HUNT_INDEX[g.hunt].band, groupFit: g.groupFit, soloFrom: g.soloFrom || null, respawnS: g.respawnMs / 1000, pockets: g.pockets.length,
      monsters: ids.map((id) => { const m = MONSTERS[id]; return { id, level: m.level, tier: m.tier, hp: m.hp, atk: m.atk, def: m.def, xp: m.xp, xpPerHp: round(m.xp / m.hp, 2), boss: !!m.boss }; }) };
  });
  const reachTier = {};
  for (const r of census) {
    const k = r.slot === 'weapon' ? 'weapon:' + r.weaponType + (r.twoHanded ? ' 2H' : '') : r.slot === 'shield' ? 'offhand' : r.armourClass + ':' + r.slot;
    const x = reachTier[k] = reachTier[k] || { reachableTop: 0, rows: 0, unreachable: 0 };
    x.rows++; if (r.source) x.reachableTop = Math.max(x.reachableTop, r.reqLv || 0); else x.unreachable++;
  }
  return {
    contentCeiling: Math.max(...grounds.map((g) => g.band[1])), grounds,
    combat: { basicIntervalMs: COMBAT_BALANCE.tickMs, accuracy: '0.55 + (skill + gear accuracy - monster def x tier mult) x 0.01, clamp 0.15..0.95, x1.15 on weakness',
      maxHit: 'floor(0.35 skill + 0.6 gear strength + 2) - floor(0.03 monster def), x1.2 on weakness; blow = uniform 1..maxHit; Level adds nothing to damage',
      monsterHit: 'acc 0.5 + (atk - (Defense + shield/cape def)) x 0.02 clamp 0.05..0.85; maxHit atk x ' + JSON.stringify({ base: COMBAT_BALANCE.monsterAttackDamageScale, byTier: COMBAT_BALANCE.monsterDamageScaleByTier }),
      critCap: COMBAT_BALANCE.critCap, critMult: COMBAT_BALANCE.critMult },
    vitals: CM.VITALS, armourMitigation: CM.ARMOUR_MITIGATION, oocRegenPermillePerS: HUNT_TUNING.oocRegenPermillePerS,
    food: { rules: CONSUMABLE_RULES, store: SB.BASIC_SUPPLIES.filter((b) => b.kind === 'heal' || b.kind === 'mana').map((b) => ({ id: b.id, kind: b.kind, price: b.price,
      amount: b.heals || b.mana, perSecondAtLane: round((b.heals || b.mana) / (CONSUMABLE_RULES.laneMs / 1000), 1), goldPerPoint: round(b.price / (b.heals || b.mana), 3) })) },
    party: { scale: G.PARTY_SCALE, yieldBySize: [1, 2, 3, 4].map((n) => G.yieldPermille(n)), xpSplit: 'kill XP / living heroes x each hero\'s multiplier (xp-share.js; no party bonus)',
      gold: 'coin split evenly among heroes present, commons round-robin, rares by the 1-100 roll with rotation (party-split.js); store supplies paid by each hero (one purse per account)' },
    death: { loss: HS.DEATH_XP_LOSS, base: HS.DEATH_XP_BASE, blessings: BLESSING_TIERS }, stamina: HS.STAMINA_MAX_MS,
    gearTiers: GT.MATERIAL_TIERS.map((t) => ({ tier: t.tier, level: t.level })), gearReach: reachTier,
    gearRows: census.length, gearUnreachable: census.filter((r) => !r.source).length,
  };
}

/* ── THE DASHBOARD ROWS ──────────────────────────────────────────────────────────────────────────────── */
function dashboardRows() {
  const out = [];
  for (const c of cells) for (const h of c.heroes) {
    out.push({ cell: c.id, stage: stage(c), ground: c.ground, band: c.hunt.band, party: styleKey(c), partySize: c.cell.party.length, style: h.style,
      level: c.cell.level, density: dens(c), variant: variant(c) || null, hours: h.hours, levelXpPerH: h.levelXpPerH,
      skillXpPerH: h.skillXpPerH, incomePerH: h.incomePerH, raresPerH: h.raresPerH, storePerH: h.storePerH, profitPerH: h.profitPerH,
      margin: h.margin, killsPerH: c.party.killsPerH, ttkS: c.party.ttkS.p50, dps: h.dps, takenPerH: h.takenPerH, dmgPerMonsterSwing: h.dmgPerMonsterSwing,
      healInPerH: h.healInPerH.total, sustainRatio: h.sustainRatio, eatsPerH: h.eatsPerH.own + h.eatsPerH.store, drinksPerH: h.drinksPerH.own + h.drinksPerH.store,
      deaths: h.deaths, deathsPer1000h: h.deathsPer1000h, closePer12h: h.closeCallsPer12h, minHpP50: h.encMinHpPct.p50, minHpP10: h.encMinHpPct.p10,
      difficulty: h.band, rareEveryH: h.rareEveryH, maxHp: h.maxHp, mitigation: h.mit, kit: h.kit });
  }
  return out;
}

function csv(rs) {
  const cols = ['cell', 'stage', 'ground', 'party', 'partySize', 'style', 'level', 'density', 'variant', 'hours', 'levelXpPerH', 'incomePerH', 'raresPerH', 'storePerH',
    'profitPerH', 'margin', 'killsPerH', 'ttkS', 'dps', 'takenPerH', 'dmgPerMonsterSwing', 'healInPerH', 'sustainRatio', 'eatsPerH', 'drinksPerH', 'deaths', 'minHpP50', 'minHpP10', 'difficulty'];
  const q = (v) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(',')].concat(rs.map((r) => cols.map((k) => q(r[k])).join(','))).join('\n') + '\n';
}

/* ── RUN ──────────────────────────────────────────────────────────────────────────────────────────────── */
const lh = levelHours();
/* THE REFERENCE RATE for the curve and the death cost: "reasonably efficient hunting" (ruling §2) = at each Level the
   MEDIAN style's best SAFE solo cell (deaths 0, close calls <= 1/12 h, Normal or easier, pays its supplies) on a
   ground whose floor it has reached (no farming under a floor), at either density; measured to the last ground, then
   the power law fitted to it (L >= 10) past it: THE EXTRAPOLATION, conditional on future grounds keeping that trend.
   The envelope (best style, under-floor grounds allowed) and the slowest style are kept as the bounds. */
const STYLE_IDS = [...new Set(cells.filter((c) => c.cell.party.length === 1).map((c) => c.cell.party[0]))];
const refSeries = (agg, inBand) => {
  const curves = STYLE_IDS.map((s) => xpCurve(s, inBand));
  const pts = [];
  for (let L = 1; L <= 55; L++) { const v = curves.map((c) => c.at(L).xp).filter((y) => y !== null); if (v.length) pts.push([L, agg(v)]); }
  if (!pts.length) return null;
  const fit = fitPower(pts), last = pts[pts.length - 1][0];
  const rate = (L) => { const p = pts.find((x) => x[0] === L); if (p) return p[1]; if (L < pts[0][0]) return pts[0][1]; return fit ? fit.a * L ** fit.b : pts[pts.length - 1][1]; };
  return { rate, fit, last, pts };
};
const median = (v) => { const x = v.slice().sort((a, b) => a - b); return x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2; };
const eff = refSeries(median, true);
const envelope = refSeries((v) => Math.max(...v), false);
const slowest = refSeries((v) => Math.min(...v), true);
const ref = eff ? eff.rate : null;
/* THE CAREER RATE (what a player who hunts where the game recommends, as built, actually earned): the median career's
   Level XP an hour at each Level, from its trace; past its last Level the efficient fit, scaled to meet it */
const careerRate = (() => {
  const solo = careers.filter((c) => c.party.length === 1);
  if (!solo.length) return null;
  const by = {};
  for (const c of solo) for (const t of c.trace) { const L = Math.min(...t.levels); (by[L] = by[L] || []).push(t.xpPerH[0]); }
  const med = (a) => { const x = a.slice().sort((p, q) => p - q); return x[Math.floor((x.length - 1) / 2)]; };
  const pts = Object.entries(by).map(([L, a]) => [Number(L), med(a)]).sort((a, b) => a[0] - b[0]);
  const last = pts[pts.length - 1];
  const k = eff && eff.fit ? last[1] / (eff.fit.a * last[0] ** eff.fit.b) : 1;
  return (L) => { const p = pts.find((x) => x[0] === L); if (p) return p[1]; if (L < pts[0][0]) return pts[0][1];
    if (L > last[0]) return eff && eff.fit ? k * eff.fit.a * L ** eff.fit.b : last[1];
    let y = pts[0][1]; for (let i = 1; i < pts.length; i++) if (L <= pts[i][0]) { y = pts[i - 1][1]; break; } return y; };
})();
const careerOut = careers.map((c) => ({ id: c.id, party: c.party, hours: c.hours, reached: c.reached,
  hoursTo: Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((L) => [L, c.milestones['0:' + L] ?? null])),
  grounds: [...new Set(c.trace.map((t) => t.ground))], deaths: c.trace.reduce((s, t) => s + t.deaths.reduce((a, b) => a + b, 0), 0),
  skillsAt: Object.fromEntries([10, 25, 40, 49].map((L) => { const t = c.trace.find((x) => Math.min(...x.levels) >= L); return [L, t ? t.skills[0] : null]; })),
  profitPerHByLevel: Object.fromEntries([10, 25, 40, 49].map((L) => { const t = c.trace.find((x) => Math.min(...x.levels) >= L); return [L, t ? t.profitPerH[0] : null]; })) }));
const summary = {
  meta: { generated: new Date().toISOString(), commit: (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return null; } })(),
    version: BUILD.version, input: IN.replace(ROOT, '.').replace(/\\/g, '/'), cells: cells.length, careers: careers.length,
    simHours: round(cells.reduce((s, c) => s + c.party.hours * c.cell.party.length, 0), 0), cpuSeconds: round(rows.reduce((s, r) => s + (r.ms || 0), 0) / 1000, 0) },
  targets: { hours: Object.fromEntries(TARGET_HOURS.slice(1)), party: PARTY_TARGET, weaponStep: WEAPON_STEP, armourStep: ARMOUR_STEP,
    bands: { easy: '80-95% min HP, <=0.1 deaths/1000h', normal: '60-80%, <=1', hard: '35-60%, 10-30', extreme: '15-40%, 50-100' } },
  audit: await audit(),
  careers: careerOut,
  levelHours: lh,
  /* THE LEVEL PACE OF RECORD is tools/balance-sim/level-pace.json (pace.mjs: careers where the game recommends, then
     LEVEL_PACE.contract), which tests/level-curve.mjs judges; it is quoted here whole. The cell-based rates below (the
     best safe cell at any ground and density) are a faster BOUND on the same curve, kept for comparison. */
  pace: PACE ? { source: 'tools/balance-sim/level-pace.json', reference: PACE.reference, contract: LEVEL_PACE.contract, table: PACE.table, measuredHours: PACE.measuredHours } : null,
  curve: ref ? { reference: 'BOUND, not the pace of record: median style, best safe solo cell per Level on a ground whose floor it has reached, either density, measured to L' + eff.last + ', then xp/h = '
      + round(eff.fit.a, 1) + ' x L^' + round(eff.fit.b, 3) + ' (extrapolated: no ground past L' + eff.last + ')', referencePoints: eff.pts.filter(([L]) => L % 5 === 0).map(([L, y]) => [L, round(y, 0)]),
    envelopeFit: envelope && envelope.fit ? { a: round(envelope.fit.a, 1), b: round(envelope.fit.b, 3) } : null,
    slowestFit: slowest && slowest.fit ? { a: round(slowest.fit.a, 1), b: round(slowest.fit.b, 3) } : null,
    ...proposeCurve(ref, { career: careerRate, envelope: envelope && envelope.rate, slowest: slowest && slowest.rate }) } : null,
  deathCost: PACE && PACE.death ? PACE.death : ref ? deathCost(ref) : null,
  bands: bands(),
  party: partyVsSolo(),
  upgrades: upgrades(),
  healing: healing(),
  styles: styles(),
  whatIf: whatIfs([join(HERE, 'out', 'whatif'), join(HERE, 'out', 'whatif2')]),
};
summary.partyBonus = { step: 0.055, rows: partyBonus(summary.party, 0.055) };
/* THE FIRST CI BALANCE GUARD, proposed (ruling §11: "CI balance guards gradually, with statistical tolerances"); not built
   in this lane. The simulator is deterministic on a commit, so a guard replays exact cells; its tolerances absorb the
   reshuffled dice a legitimate data change brings (the 2-seed spread measured here) and catch a balance move. */
summary.proposedGuard = {
  cells: 'the 12 reference cells of plan whatif at x=W0 (every ground, solo + a four, as built + the full box, in band + under a floor), 3 h x 2 seeds',
  runsOn: 'a diff touching src/data/{monsters,hunt-grounds,hunts,items,gear-tiers,shields,supply-basics,core-model,hunt-roles,rule-subjects}.js or src/core/** (mutant-gate style), nightly otherwise',
  costS: 'about 45 s on 4 workers, about 3 min single-process on a CI runner',
  tolerances: { levelXpPerH: '+-10% of the committed baseline', profitPerH: '+-20%', minHpP50: '+-8 points',
    deathsInBandNormal: '0 in the cell\'s 6 h (at the ruling\'s <= 1 per 1,000 h a false alarm is < 1%)', bandLabel: 'the difficulty band must not change' },
  baseline: 'tools/balance-sim/baseline-summary.json (re-written by report.mjs; a deliberate balance change re-pins it in the same commit, like ci-shape --write)',
};
const c8 = join(HERE, 'out', 'career8', 'cells.jsonl');
summary.careersFullBox = (boxCareers.length ? boxCareers : existsSync(c8) ? readFileSync(c8, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'career') : [])
  .map((c) => ({ id: c.id, hours: c.hours, reached: c.reached, hoursTo: Object.fromEntries([10, 25, 50].map((L) => [L, c.milestones['0:' + L] ?? null])),
    deaths: c.trace.reduce((t, x) => t + x.deaths.reduce((a, b) => a + b, 0), 0), grounds: [...new Set(c.trace.map((t) => t.ground))] }));
const dash = { schema: 'hearthrise.balance-dashboard/1', generated: summary.meta.generated, commit: summary.meta.commit,
  dims: { ground: [...new Set(cells.map((c) => c.ground))], style: [...new Set(cells.flatMap((c) => c.cell.party))], party: [...new Set(cells.map(styleKey))],
    level: [...new Set(cells.map((c) => c.cell.level))].sort((a, b) => a - b), density: [...new Set(cells.map(dens))].sort((a, b) => a - b), stage: [...new Set(cells.map(stage))].sort() },
  rows: dashboardRows(), careers: careerOut, summary: { levelHours: summary.levelHours, pace: summary.pace, curve: summary.curve, party: summary.party, upgrades: summary.upgrades, deathCost: summary.deathCost } };
if (existsSync(IN)) {
  writeFileSync(join(IN, 'dashboard.json'), JSON.stringify(dash));
  writeFileSync(join(IN, 'cells.csv'), csv(dash.rows));
}
/* one line per row (diff-friendly, a third of the indented size): each top-level section, and each element of an array section */
const lines = ['{'];
const keys = Object.keys(summary);
keys.forEach((k, i) => {
  const v = summary[k], end = i < keys.length - 1 ? ',' : '';
  if (Array.isArray(v)) lines.push(JSON.stringify(k) + ': [', ...v.map((x, j) => '  ' + JSON.stringify(x) + (j < v.length - 1 ? ',' : '')), ']' + end);
  else lines.push(JSON.stringify(k) + ': ' + JSON.stringify(v) + end);
});
lines.push('}');
writeFileSync(SUMMARY, lines.join('\n') + '\n');
console.log('balance-sim report: ' + cells.length + ' cells, ' + careers.length + ' careers, ' + summary.meta.simHours + ' hero-hours -> ' + SUMMARY.replace(ROOT, '.'));
