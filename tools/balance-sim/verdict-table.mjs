#!/usr/bin/env node
// tools/balance-sim/verdict.mjs — THE VERDICT: today's game against Tyler's balance ruling (2026-10-25), one screen.
//
//   node tools/balance-sim/sim.mjs --plan verdict [--out tools/balance-sim/out/verdict]
//   node tools/balance-sim/verdict.mjs [--in tools/balance-sim/out/verdict] [--write]
//
// Reads the verdict plan's cells (plans.mjs 'verdict': V1 solo as built, V2 solo full box, V3 the starter kit, V4
// parties of 2 and 4, V5 upgrade steps, V6 twelve-hour hunts) and prints the ground x way-to-fight table against the
// ruling's targets, marked OK / HIGH / LOW / BROKEN, then the discrepancies in the order a first-week player meets
// them. --write commits the evidence beside baseline-summary.json: verdict-summary.json (every table) and
// verdict-cells.csv (one row per hero per cell). Every number is read off the engine's cells; the only arithmetic here
// is pooling (hours-weighted), ratios and the Poisson interval (stats.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { round, rateCI } from './stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const IN = resolve(arg('in', join(HERE, 'out', 'verdict')));
const WRITE = process.argv.includes('--write');

/* THE RULING'S NUMBERS this verdict judges against (Tyler 2026-10-25; the profit floor 10-20) */
export const TARGET = Object.freeze({
  normalMinHp: [60, 80], deathsPer1000h: 1, closePer12h: 1, margin: 0.25, rareH: [10, 20], gearPerH: [0.5, 2],
  party: { 2: [1.05, 1.15], 4: [1.15, 1.25] }, weapon: [0.05, 0.08], armour: [0.03, 0.05],
  /* XP/h against the Level pace of record (level-pace.json: the rate the fitted curve's hours were measured at) */
  xpRatio: [0.8, 1.25],
});
/* the five ways to fight (Tyler 2026-10-16/23: the worn set makes the role) and the styles that play each: the six
   starter sets (start-kit.js STARTER_SETS; the sword alone is no starter set: its cells are in the CSV, not the table) */
export const ROLES = Object.freeze({
  tank: ['tank'], melee: ['axes', 'hammer'], ranger: ['bow', 'crossbow'], mage: ['mage'], healer: ['healer'],
});
const roleOf = (style) => Object.keys(ROLES).find((r) => ROLES[r].includes(style));

const rows = existsSync(join(IN, 'cells.jsonl')) ? readFileSync(join(IN, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes) : [];
const PACE = JSON.parse(readFileSync(join(HERE, 'level-pace.json'), 'utf8'));
const paceAt = (L) => PACE.rate[Math.min(Math.max(1, L), PACE.ceiling - 1)] || null;
const stage = (c) => (c.id.match(/x=(V\d)/) || [])[1];
const dens = (c) => (Number.isInteger(c.cell.density) ? c.cell.density : 0);
const starter = (c) => !!(c.cell.gear && c.cell.gear.starter);
const plainGear = (c) => !c.cell.gear;
const inBand = (c) => c.hunt.band && c.cell.level >= c.hunt.band[0] && c.cell.level <= c.hunt.band[1];
const ORDER = ['mill_cellar', 'meadowbrook_thicket', 'wickstead', 'millrace_sewer', 'mosslight_glade', 'coppercap_warrens'];
const SHORT = { mill_cellar: 'Cellar', meadowbrook_thicket: 'Thicket', wickstead: 'Wickstead', millrace_sewer: 'Sewer', mosslight_glade: 'Glade', coppercap_warrens: 'Warrens' };

/** Pool hero rows (hours-weighted rates; deaths and close calls as Poisson counts over the pooled hours). */
export function pool(heroes) {
  const hrs = heroes.reduce((s, h) => s + h.hours, 0);
  const w = (f) => (hrs > 0 ? heroes.reduce((s, h) => s + (f(h) || 0) * h.hours, 0) / hrs : null);
  const deaths = heroes.reduce((s, h) => s + h.deaths, 0), close = heroes.reduce((s, h) => s + (h.closeCallsPer12h.k || 0), 0);
  const store = w((h) => h.storePerH), income = w((h) => h.incomePerH);
  const mins = heroes.map((h) => h.encMinHpPct.p50).filter((x) => x !== null).sort((a, b) => a - b);
  const p10 = heroes.map((h) => h.encMinHpPct.p10).filter((x) => x !== null);
  const rares = heroes.reduce((s, h) => s + h.rareItems, 0);
  return { n: heroes.length, hours: round(hrs, 1), xpPerH: round(w((h) => h.levelXpPerH), 0), incomePerH: round(income, 0), storePerH: round(store, 0),
    profitPerH: round(w((h) => h.profitPerH), 0), margin: store > 1 ? round(income / store - 1, 2) : null,
    minHpP50: mins.length ? mins[Math.floor((mins.length - 1) / 2)] : null, minHpP10Worst: p10.length ? Math.min(...p10) : null,
    deaths, deathsPer1000h: rateCI(deaths, hrs, 1000), close, closePer12h: rateCI(close, hrs, 12), rareEveryH: rares ? round(hrs / rares, 1) : null,
    worstProfit: heroes.length ? Math.min(...heroes.map((h) => h.profitPerH)) : null };
}

/* ── marks ── */
const markXp = (ratio) => (ratio === null ? '-' : ratio < TARGET.xpRatio[0] ? 'LOW' : ratio > TARGET.xpRatio[1] ? 'HIGH' : 'OK');
const markProfit = (p) => (p.worstProfit !== null && p.worstProfit < 0 ? 'BROKEN' : p.margin !== null && p.margin < TARGET.margin ? 'LOW' : 'OK');
const markDeaths = (p) => (p.deaths === 0 ? 'OK' : p.deathsPer1000h.lo > 30 ? 'BROKEN' : 'HIGH');
const markMinHp = (m) => (m === null ? '-' : m > TARGET.normalMinHp[1] ? 'HIGH' : m < TARGET.normalMinHp[0] ? 'LOW' : 'OK');
const worst = (...ms) => (ms.includes('BROKEN') ? 'BROKEN' : ms.includes('LOW') ? 'LOW' : ms.includes('HIGH') ? 'HIGH' : 'OK');

/* ── 1. THE TABLE: ground x way to fight, in band, in-band gear, as built (the hunt a player starts). A PARTY ground
   (the Sewer, the Warrens: the Hunts card says "A party of 2 to 4") is judged on the heroes of its parties (a duo and a
   four) and on lone heroes only from its soloFrom; a lone hero under that is OFF ADVICE, reported beside it. ── */
function table() {
  const out = [];
  for (const g of ORDER) {
    const gc = rows.filter((c) => c.ground === g);
    if (!gc.length) continue;
    const band = gc[0].hunt.band, fit = FACTS.groupFit[g], from = FACTS.soloFrom[g];
    for (const role of Object.keys(ROLES)) {
      const advised = (c) => (fit !== 'party' ? c.cell.party.length === 1 : c.cell.party.length > 1 || (Number.isInteger(from) && c.cell.level >= from));
      const heroesOf = (cs) => cs.flatMap((c) => c.heroes.filter((h) => ROLES[role].includes(h.style)));
      const solo = (d, gearOk) => gc.filter((c) => advised(c) && c.cell.party.some((s) => ROLES[role].includes(s)) && inBand(c) && dens(c) === d && gearOk(c) && /V1|V2|V3|V4|V6/.test(stage(c)));
      const built = pool(heroesOf(solo(0, plainGear)));
      const box = pool(heroesOf(solo(8, plainGear)));
      const kit = pool(heroesOf(solo(0, starter)));
      const offAdvice = fit === 'party' ? pool(heroesOf(gc.filter((c) => c.cell.party.length === 1 && !advised(c) && ROLES[role].includes(c.cell.party[0]) && inBand(c) && dens(c) === 0 && /V1|V3/.test(stage(c))))) : null;
      /* XP against the pace of record at each cell's Level, hours-weighted, at the Levels the game sends a lone hero
         HERE (the pace was measured where the Hunts window recommends: an outgrown ground is not slow, it is left) */
      const xs = solo(0, plainGear).filter((c) => c.cell.party.length === 1 && FACTS.recAt[c.cell.level] === g).flatMap((c) => c.heroes.map((h) => [h.levelXpPerH / (paceAt(c.cell.level) || 1), h.hours]));
      const ratio = xs.length ? round(xs.reduce((s, [r, w]) => s + r * w, 0) / xs.reduce((s, [, w]) => s + w, 0), 2) : null;
      /* the worst style of the role (a role is as good as its weakest way to fight) */
      const byStyle = ROLES[role].map((s) => [s, pool(solo(0, plainGear).flatMap((c) => c.heroes.filter((h) => h.style === s)))]).filter(([, p]) => p.n);
      const weakest = byStyle.length ? byStyle.sort((a, b) => a[1].xpPerH - b[1].xpPerH)[0][0] : null;
      const marks = { xp: fit === 'party' ? '-' : markXp(ratio), profit: built.n ? markProfit(built) : '-', deaths: built.n ? markDeaths(built) : '-',
        minHp: markMinHp(built.minHpP50), kitDeaths: kit.n ? markDeaths(kit) : '-', boxDeaths: box.n ? markDeaths(box) : '-' };
      out.push({ ground: g, band, groupFit: fit, soloFrom: from ?? null, role, weakest, xpVsPace: ratio, built, box, kit, offAdvice, marks,
        verdict: worst(marks.xp, marks.profit, marks.deaths, marks.kitDeaths === 'BROKEN' ? 'BROKEN' : 'OK') });
    }
  }
  return out;
}

/* ── 2. PARTIES against the comparable solo (ruling §5: same Levels and gear, sustainable strategies): each member's own
   style alone at its best SAFE option at that Level (safe = no death, close calls <= 1 per 12 h) on a ground the game
   sends a lone hero to (not a party ground: a lone hero there is off advice), whose floor it has reached, either
   density. `vsAnySolo` allows the party grounds too (the min-maxer's comparison). ── */
function parties() {
  const safe = (c) => c.heroes.every((h) => h.deaths === 0 && (h.closeCallsPer12h.rate || 0) <= TARGET.closePer12h);
  const out = [];
  /* soloGroundsOnly: a ground a lone hero is sent to, in band at L (sampled within 2 Levels of L: the grids sample a
     ground's floor, middle and top); else any ground whose floor L has reached, at exactly L */
  const bestSolo = (s, L, c, soloGroundsOnly) => rows.filter((x) => x.cell.party.length === 1 && x.cell.party[0] === s && plainGear(x) === plainGear(c)
    && starter(x) === starter(c) && /V1|V2|V3/.test(stage(x)) && x.hunt.band && safe(x)
    && (soloGroundsOnly ? FACTS.groupFit[x.ground] !== 'party' && L >= x.hunt.band[0] && L <= x.hunt.band[1] && Math.abs(x.cell.level - L) <= 2
      : x.cell.level === L && L >= x.hunt.band[0]))
    .reduce((b, x) => Math.max(b, x.heroes[0].levelXpPerH), 0);
  for (const c of rows.filter((x) => x.cell.party.length > 1 && stage(x) === 'V4')) {
    const L = c.cell.level;
    const own = c.cell.party.map((s) => bestSolo(s, L, c, true));
    const any = c.cell.party.map((s) => bestSolo(s, L, c, false));
    const same = c.cell.party.map((s) => (rows.find((x) => x.ground === c.ground && x.cell.party.length === 1 && x.cell.party[0] === s && x.cell.level === L && dens(x) === dens(c)
      && plainGear(x) === plainGear(c) && starter(x) === starter(c) && /V1|V2|V3/.test(stage(x))) || { heroes: [{ levelXpPerH: 0 }] }).heroes[0].levelXpPerH);
    const per = c.party.levelXpPerHeroPerH, mean = (a) => (a.every((y) => y > 0) ? a.reduce((s, y) => s + y, 0) / a.length : null);
    const n = c.cell.party.length, cmp = mean(own), sm = mean(same), an = mean(any);
    out.push({ ground: c.ground, groupFit: FACTS.groupFit[c.ground], party: c.cell.party.join('+'), size: n, level: L, density: dens(c), starter: starter(c), xpPerHero: per,
      vsComparableSolo: cmp ? round(per / cmp, 3) : null, vsAnySolo: an ? round(per / an, 3) : null, vsSameGroundSolo: sm ? round(per / sm, 3) : null, target: TARGET.party[n] || null,
      deaths: c.heroes.reduce((s, h) => s + h.deaths, 0), hours: c.party.hours, profitPerH: c.heroes.map((h) => h.profitPerH),
      minHpP50: c.heroes.map((h) => h.encMinHpPct.p50) });
  }
  return out;
}

/* ── 3. UPGRADE STEPS (V5): the step's measured gain, everything else equal on the same dice ── */
function upgrades() {
  const out = [];
  for (const b of rows.filter((c) => stage(c) === 'V5' && !c.cell.gear)) {
    for (const only of ['weapon', 'armour', 'body']) {
      const v = rows.find((c) => stage(c) === 'V5' && c.cell.gear && c.cell.gear.only === only && c.ground === b.ground && c.cell.level === b.cell.level && c.cell.party[0] === b.cell.party[0] && dens(c) === dens(b));
      if (!v) continue;
      const h0 = b.heroes[0], h1 = v.heroes[0];
      const pct = (a, z) => (z ? round((a / z - 1) * 100, 1) : null);
      const slot = only === 'weapon' ? 'weapon' : only === 'body' ? 'body' : 'helmet';
      out.push({ style: h0.style, level: b.cell.level, ground: b.ground, density: dens(b), step: only, from: h1.kit[slot] || null, to: h0.kit[slot] || null,
        same: (h1.kit[slot] || null) === (h0.kit[slot] || null), xpGainPct: pct(h0.levelXpPerH, h1.levelXpPerH), dpsGainPct: pct(h0.dps, h1.dps),
        takenPerSwingCutPct: h1.dmgPerMonsterSwing ? round((1 - h0.dmgPerMonsterSwing / h1.dmgPerMonsterSwing) * 100, 1) : null,
        takenPerHCutPct: h1.takenPerH ? round((1 - h0.takenPerH / h1.takenPerH) * 100, 1) : null, deaths: [h1.deaths, h0.deaths] });
    }
  }
  return out;
}

/* ── 4. TWELVE-HOUR HUNTS (V6): one segment = one unattended hunt; did it finish? ── */
function longHunts() {
  return rows.filter((c) => /^V6/.test(stage(c) || '') || /x=V6/.test(c.id)).map((c) => {
    const p = pool(c.heroes);
    const hunts = Math.max(1, c.party.segments);
    const died = c.heroes.reduce((s, h) => s + h.deaths, 0);
    return { ground: c.ground, party: c.cell.party.join('+'), level: c.cell.level, starter: starter(c), hunts, hours: c.party.hours,
      finishedPct: round(100 * Math.max(0, 1 - died / hunts), 0), deaths: died, ended: c.heroes.map((h) => h.ended), close: p.close,
      closePer12h: p.closePer12h.rate, minHpP50: p.minHpP50, minHpP10Worst: p.minHpP10Worst, xpPerH: p.xpPerH, profitPerH: p.profitPerH, margin: p.margin };
  });
}

/* ── 5. GEAR AND RARES at each ground's floor (solo, in-band and starter gear, as built): pieces an hour per slot per weight ── */
function loot() {
  const out = [];
  for (const g of ORDER) {
    const cs = rows.filter((c) => c.ground === g && c.cell.party.length === 1 && c.hunt.band && c.cell.level === c.hunt.band[0] && dens(c) === 0 && /V1|V3|V6/.test(stage(c)));
    if (!cs.length) continue;
    const hs = cs.flatMap((c) => c.heroes);
    const hrs = hs.reduce((s, h) => s + h.hours, 0);
    const gear = {};
    for (const h of hs) for (const [k, v] of Object.entries(h.gearPerH || {})) gear[k] = (gear[k] || 0) + v * h.hours;
    const per = Object.fromEntries(Object.entries(gear).map(([k, n]) => [k, round(n / hrs, 2)]).sort());
    const four = ['helmet', 'body', 'pants', 'boots'].flatMap((s) => ['plate', 'leather', 'cloth'].map((w) => s + ':' + w));
    const rares = hs.reduce((s, h) => s + h.rareItems, 0);
    out.push({ ground: g, level: cs[0].hunt.band[0], hours: round(hrs, 0), gearPerH: per,
      fourSlotsMin: round(Math.min(...four.map((k) => per[k] || 0)), 2), fourSlotsMax: round(Math.max(...four.map((k) => per[k] || 0)), 2),
      missing: four.filter((k) => !per[k]), rares, rareEveryH: rares ? round(hrs / rares, 1) : null });
  }
  return out;
}

/* ── 6. THE DATA FACTS the ruling names (read from src/data, not played): density, the starter sets, the first path ── */
async function facts() {
  const { pathToFileURL } = await import('node:url');
  const u = (p) => pathToFileURL(join(ROOT, p)).href;
  const G = await import(u('src/data/hunt-grounds.js'));
  const SK = await import(u('src/data/start-kit.js'));
  const { BUILD } = await import(u('src/build-info.js'));
  const { recommendedHunt, huntRows } = await import(u('src/shell/hunt-list.js') + '?v=' + BUILD.version);
  const owned = new Set([...Object.keys(SK.START_INVENTORY), ...Object.values(SK.START_EQUIPMENT)]);
  const path = (n) => { const out = []; for (let L = 1; L <= 25; L++) { const r = recommendedHunt(Array(n).fill(L), n); const h = r && r.hunt; if (!out.length || out[out.length - 1][1] !== h) out.push([L, h]); } return out; };
  const recAt = {};
  for (let L = 1; L <= 60; L++) { const r = recommendedHunt([L], 1); recAt[L] = r && r.hunt; }
  /* who a ground is for, as the Hunts window says it (a minParty hall makes it a party ground: the Sewer) */
  const groupFit = Object.fromEntries(huntRows().map((r) => [Object.values(G.OPEN_GROUNDS).find((g) => g.hunt === r.hunt).id, r.groupFit]));
  return { recAt, groupFit, soloFrom: Object.fromEntries(Object.values(G.OPEN_GROUNDS).map((g) => [g.id, Number.isInteger(g.soloFrom) ? g.soloFrom : null])), densityMax: Object.fromEntries(Object.values(G.OPEN_GROUNDS).map((g) => [g.id, Math.min(...(g.densityMax || [G.DENSITY_FULL_BOX]))])),
    starterSets: Object.fromEntries(Object.entries(SK.STARTER_SETS).map(([k, ids]) => [k, ids.every((id) => owned.has(id))])),
    soloPath: path(1), partyPath: path(2) };
}
const FACTS = await facts();
const T = table(), PT = parties(), UP = upgrades(), LH = longHunts(), LT = loot();
/* each party's better density per ground x size x Level, in-band gear (the "well-optimized" party) */
const PARTY_BEST = Object.values(PT.filter((p) => !p.starter).reduce((m, p) => {
  const k = p.ground + '|' + p.size + '|' + p.level;
  if (!m[k] || p.xpPerHero > m[k].xpPerHero) m[k] = p;
  return m;
}, {})).sort((a, b) => ORDER.indexOf(a.ground) - ORDER.indexOf(b.ground) || a.size - b.size || a.level - b.level);

/* ── THE DISCREPANCIES, ranked by what a first-week player feels: when they meet it (first hour L1-5, first day
   L6-15, first week L16-25, later), then how it is felt (a death or an unfinished hunt, then lost gold or slow XP, then
   too much, then too easy), then the Level. One line per ground x metric x mark (the roles it hits named). ── */
function discrepancies() {
  const feel = (metric, mark) => (mark === 'BROKEN' || /eaths|12h/.test(metric) ? 0 : mark === 'LOW' && metric !== 'minHp' ? 1 : metric === 'minHp' && mark === 'LOW' ? 1 : metric === 'minHp' ? 3 : 2);
  const when = (L) => (L <= 5 ? 0 : L <= 15 ? 1 : L <= 25 ? 2 : 3);
  const d = [];
  const meet = (g) => (rows.find((c) => c.ground === g) || { hunt: { band: [99] } }).hunt.band[0];
  const merged = {};
  for (const r of T) {
    for (const [k, m] of Object.entries(r.marks)) {
      if (m === 'OK' || m === '-') continue;
      const p = k === 'kitDeaths' ? r.kit : k === 'boxDeaths' ? r.box : r.built;
      const what = { xp: 'Level XP/h ' + (r.xpVsPace) + 'x the pace of record', profit: 'profit ' + p.profitPerH + ' g/h, margin ' + p.margin + ' (worst hero ' + p.worstProfit + ')',
        deaths: p.deaths + ' deaths in ' + p.hours + ' h in band as built', minHp: 'typical encounter min HP ' + p.minHpP50 + '% (Normal is 60-80)',
        kitDeaths: p.deaths + ' deaths in ' + p.hours + ' h in the starter kit', boxDeaths: p.deaths + ' deaths in ' + p.hours + ' h at the full box' }[k];
      const key = r.ground + '|' + k + '|' + m;
      if (merged[key]) { merged[key].role += ', ' + r.role; merged[key].what += '; ' + r.role + ': ' + what; continue; }
      merged[key] = { level: meet(r.ground), ground: r.ground, role: r.role, metric: k, mark: m, what: r.role + ': ' + what, sev: feel(k, m) };
      d.push(merged[key]);
    }
  }
  /* a WELL-OPTIMIZED party (ruling §5): its better density at each Level; one line per ground x size, its Level range */
  const byGs = {};
  for (const p of PARTY_BEST.filter((x) => x.target && x.vsComparableSolo !== null)) (byGs[p.ground + '|' + p.size] = byGs[p.ground + '|' + p.size] || []).push(p);
  for (const ps of Object.values(byGs)) {
    const off = ps.filter((p) => p.vsComparableSolo < p.target[0] || p.vsComparableSolo > p.target[1]);
    if (!off.length) continue;
    const lo = Math.min(...off.map((p) => p.vsComparableSolo)), hi = Math.max(...off.map((p) => p.vsComparableSolo)), low = hi < off[0].target[0];
    d.push({ level: Math.min(...off.map((p) => p.level)), ground: off[0].ground, role: 'party of ' + off[0].size, metric: 'partyXp', mark: low ? 'LOW' : lo > off[0].target[1] ? 'HIGH' : 'MIXED',
      what: 'XP per hero ' + lo + (hi !== lo ? '-' + hi : '') + 'x the comparable solo at L' + off.map((p) => p.level).join('/') + ', best density (target ' + off[0].target.join('-') + ')', sev: low ? 1 : 2 });
  }
  for (const h of LH.filter((x) => x.finishedPct < 95)) d.push({ level: h.level, ground: h.ground, role: h.party + (h.starter ? ' (starter kit)' : ''), metric: '12h', mark: 'BROKEN',
    what: h.finishedPct + '% of ' + h.hunts + ' twelve-hour hunts finished', sev: 0 });
  return d.sort((a, b) => when(a.level) - when(b.level) || a.sev - b.sev || a.level - b.level);
}
const DISC = discrepancies();

/* ── PRINT ── */
const pad = (s, n) => String(s === null || s === undefined ? '-' : s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s === null || s === undefined ? '-' : s).padStart(n);
console.log('THE VERDICT (' + rows.length + ' cells, in band, in-band gear, density as built; Box = the full box; Kit = the starter kit)');
console.log(pad('ground', 10) + pad('role', 7) + lpad('XP/h', 8) + lpad('xPace', 6) + lpad('profit', 8) + lpad('margin', 9) + lpad('d/kh', 6) + lpad('minHP', 6)
  + lpad('boxHP', 6) + lpad('box d', 6) + lpad('kit d', 6) + '  ' + pad('marks xp/profit/deaths/minHp', 30) + 'VERDICT');
for (const r of T) {
  const b = r.built;
  console.log(pad(SHORT[r.ground], 10) + pad(r.role, 7) + lpad(b.xpPerH, 8) + lpad(r.xpVsPace, 6) + lpad(b.profitPerH, 8) + lpad(b.margin, 9) + lpad(b.deathsPer1000h.rate, 6)
    + lpad(b.minHpP50, 6) + lpad(r.box.minHpP50, 6) + lpad(r.box.deaths, 6) + lpad(r.kit.n ? r.kit.deaths : '-', 6) + '  '
    + pad([r.marks.xp, r.marks.profit, r.marks.deaths, r.marks.minHp].join('/'), 30) + r.verdict);
}
console.log('\nPARTIES (in band, in-band gear, the better density): XP per hero vs the comparable solo (where a lone hero is sent) / any solo / same ground solo');
for (const p of PARTY_BEST) console.log('  ' + pad(SHORT[p.ground], 10) + pad(p.party, 24) + 'L' + pad(p.level, 4) + 'd' + pad(p.density, 2) + lpad(p.xpPerHero, 7) + '  ' + p.vsComparableSolo + ' / ' + p.vsAnySolo + ' / ' + p.vsSameGroundSolo + '  (target ' + (p.target || []).join('-') + ') deaths ' + p.deaths);
console.log('\nTWELVE-HOUR HUNTS: finished %');
for (const h of LH) console.log('  ' + pad(SHORT[h.ground], 10) + pad(h.party + (h.starter ? ' kit' : ''), 28) + 'L' + pad(h.level, 4) + lpad(h.finishedPct, 4) + '% of ' + h.hunts + '  close/12h ' + h.closePer12h + '  minHP ' + h.minHpP50 + '/' + h.minHpP10Worst + '  margin ' + h.margin);
console.log('\nGEAR AT THE FLOOR (pieces/h per slot per weight, helmet/body/legs/boots) AND RARES');
for (const l of LT) console.log('  ' + pad(SHORT[l.ground], 10) + 'L' + pad(l.level, 4) + ' min ' + l.fourSlotsMin + ' max ' + l.fourSlotsMax + ' missing ' + (l.missing.length ? l.missing.join(',') : 'none') + '  rare every ' + l.rareEveryH + ' h (' + l.rares + ' in ' + l.hours + ' h)');
console.log('\nUPGRADE STEPS (median gain over styles, both densities)');
for (const step of ['weapon', 'armour', 'body']) for (const L of [...new Set(UP.map((u) => u.level))]) {
  const xs = UP.filter((u) => u.step === step && u.level === L && !u.same);
  if (!xs.length) { console.log('  ' + step + ' L' + L + ': no step (the tier behind is the same piece)'); continue; }
  const med = (a) => { const v = a.filter((x) => x !== null).sort((p, q) => p - q); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
  console.log('  ' + pad(step, 7) + 'L' + pad(L, 4) + ' XP/h +' + med(xs.map((u) => u.xpGainPct)) + '%  dps +' + med(xs.map((u) => u.dpsGainPct)) + '%  taken/swing -' + med(xs.map((u) => u.takenPerSwingCutPct)) + '%  (' + xs.length + ' pairs)');
}
console.log('\nDATA: densityMax ' + JSON.stringify(FACTS.densityMax) + '\n  starter sets owned ' + JSON.stringify(FACTS.starterSets)
  + '\n  solo path to 25 ' + FACTS.soloPath.map(([L, h]) => 'L' + L + ' ' + (SHORT[h] || h)).join(' > ') + '\n  pair path to 25 ' + FACTS.partyPath.map(([L, h]) => 'L' + L + ' ' + (SHORT[h] || h)).join(' > '));
console.log('\nDISCREPANCIES, first-week order (' + DISC.length + ')');
DISC.slice(0, 25).forEach((x, i) => console.log('  ' + lpad(i + 1, 2) + '. L' + pad(x.level, 3) + pad(SHORT[x.ground] || x.ground, 10) + pad(x.role, 26) + pad(x.mark, 7) + x.what));

if (WRITE) {
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return null; } })();
  const summary = { meta: { generated: new Date().toISOString(), commit, input: IN.replace(ROOT, '.').replace(/\\/g, '/'), cells: rows.length,
    heroHours: round(rows.reduce((s, c) => s + c.heroes.reduce((t, h) => t + h.hours, 0), 0), 0), cpuSeconds: round(rows.reduce((s, c) => s + (c.ms || 0), 0) / 1000, 0) },
    targets: TARGET, facts: FACTS, table: T, parties: PT, partyBest: PARTY_BEST, upgrades: UP, longHunts: LH, loot: LT, discrepancies: DISC };
  const lines = ['{'];
  const keys = Object.keys(summary);
  keys.forEach((k, i) => {
    const v = summary[k], end = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v)) lines.push(JSON.stringify(k) + ': [', ...v.map((x, j) => '  ' + JSON.stringify(x) + (j < v.length - 1 ? ',' : '')), ']' + end);
    else lines.push(JSON.stringify(k) + ': ' + JSON.stringify(v) + end);
  });
  lines.push('}');
  writeFileSync(join(HERE, 'verdict-summary.json'), lines.join('\n') + '\n');
  const cols = ['cell', 'stage', 'ground', 'party', 'style', 'role', 'level', 'density', 'gear', 'hours', 'levelXpPerH', 'incomePerH', 'storePerH', 'profitPerH', 'margin',
    'killsPerH', 'dps', 'takenPerH', 'deaths', 'closeCalls', 'minHpP50', 'minHpP10', 'rareItems', 'band'];
  const q = (v) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cols.join(',')];
  for (const c of rows) for (const h of c.heroes) {
    const r = { cell: c.id, stage: (c.id.match(/x=(\w+)/) || [])[1], ground: c.ground, party: c.cell.party.join('+'), style: h.style, role: roleOf(h.style), level: c.cell.level,
      density: dens(c), gear: c.cell.gear ? JSON.stringify(c.cell.gear) : 'in-band', hours: h.hours, levelXpPerH: h.levelXpPerH, incomePerH: h.incomePerH, storePerH: h.storePerH,
      profitPerH: h.profitPerH, margin: h.margin, killsPerH: c.party.killsPerH, dps: h.dps, takenPerH: h.takenPerH, deaths: h.deaths, closeCalls: h.closeCallsPer12h.k,
      minHpP50: h.encMinHpPct.p50, minHpP10: h.encMinHpPct.p10, rareItems: h.rareItems, band: h.band };
    csv.push(cols.map((k) => q(r[k])).join(','));
  }
  writeFileSync(join(HERE, 'verdict-cells.csv'), csv.join('\n') + '\n');
  console.log('\nverdict: wrote tools/balance-sim/verdict-summary.json and verdict-cells.csv');
}
