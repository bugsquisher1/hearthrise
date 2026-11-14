#!/usr/bin/env node
// tools/balance-sim/grade.mjs — THE AUTOMATIC BALANCE GRADER (lane/b-ground-grader, Tyler 2026-11-07: "one formula for every hunt ...
// testing what works and adjusting what doesnt. EXTENSIVELY").
//
// Plays the REAL engine (tools/balance-sim cells: the settle the world tick runs) over every open ground x tier (Normal and each
// harder tier the ground has) x party size 1-4 x Level offset (5 under, 3 and 2 under, the floor, floor+10, the band's top) x the
// ways to fight x seeds, and grades every cell against a TARGET SHEET (default tools/balance-sim/grade-sheet.mjs, the rulings as
// ruled; `--sheet <module>` reads the formula lane's src/data/balance-sheet.js once it exports SHEET in that shape).
//
//   node tools/balance-sim/grade.mjs --mode quick [--grounds a,b] [--workers 4]     a subset in minutes, for any lane
//   node tools/balance-sim/grade.mjs --mode full  [--grounds a,b] [--tiers t,u]     the whole grid (about 17k hero-hours)
//   ... [--open-also a,b]                                                          staged grounds that ship with these: their drops on
//                                                                                   the gear ladder too (a staged graded ground's own always are)
//   node tools/balance-sim/grade.mjs --in DIR                                       grade cells already played (no play)
//   node tools/balance-sim/grade.mjs --mode quick --what-if '{"monsters":{"*":{"atk":"*3"}}}'   a candidate on the same dice
//   node tools/balance-sim/grade.mjs --selftest                                     every rule bites a synthetic mutant
//
// Output: the ranked outliers (binding FAILs first, then UNPROVEN, then advisory, each by how far off), a pass/fail line per
// ground, and DIR/grade.json (every verdict). Cells land in tools/balance-sim/out/grade-<mode>/cells.jsonl (a stopped run
// resumes). EXIT 1 when any binding rule FAILS, 0 otherwise (UNPROVEN and advisory rows never turn it red).
//
// NO PROFIT MOLDS (Tyler 2026-11-13: "if the player can do it and profit from it, great, if not, too bad"; "if a certain hunt is way
// under and needs rebalanced, we'll treat it one at a time, not a blanket mold"). Gold is never graded: a sheet rule on a profit number
// (PROFIT_METRICS) is refused, and every ground's gold is PRINTED side by side (goldRows / goldReport), numbers only, no bound.
//
// Rare events are judged honestly: deaths and dips under 25% HP are pooled per ground x tier x offset x size and read on their
// exact 95% Poisson interval (stats.mjs): FAIL only when the interval's low end is past the bound, UNPROVEN when the bound sits
// inside it. Every other metric is the cell's own hour-weighted number.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { rateCI } from './stats.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

/* ── THE GRID ── */
export const OFFSETS = Object.freeze({ quick: ['under5', 'under2', 'floor', 'middle'], full: ['under5', 'under3', 'under2', 'floor', 'middle', 'plus10', 'top'] });
const SOLO8 = ['tank', 'sword', 'hammer', 'axes', 'bow', 'crossbow', 'mage', 'healer'];
export const COMPS = Object.freeze({
  quick: { 1: [['tank'], ['hammer'], ['bow'], ['mage']], 2: [['tank', 'healer']], 4: [['tank', 'healer', 'bow', 'mage']] },
  full: { 1: SOLO8.map((s) => [s]), 2: [['tank', 'healer'], ['hammer', 'bow']], 3: [['tank', 'healer', 'bow'], ['hammer', 'bow', 'mage']],
    4: [['tank', 'healer', 'bow', 'mage'], ['tank', 'hammer', 'bow', 'mage']] },
});
const IN_RANGE = ['floor', 'middle', 'plus10', 'top'];

/** The Levels a band is played at: [{ offset, level }], deduped (the first label wins), Level 1 or more; floor+10 past the top is `above`. */
export function levelsOf(band, offsets) {
  const [lo, hi] = band, out = [], seen = new Set();
  const at = { under5: lo - 5, under3: lo - 3, under2: lo - 2, floor: lo, middle: Math.round((lo + hi) / 2), plus10: lo + 10, top: hi };
  for (const o of offsets) {
    const level = at[o];
    if (!(level >= 1) || seen.has(level)) continue;
    seen.add(level);
    out.push({ offset: o === 'plus10' && level > hi ? 'above' : o, level });
  }
  return out;
}

/** Seeds and hours per cell: quick 1 x 1 h; full 6 x 4 h for a lone hero on Normal in range (the death rate needs hours), 4 x 2 h for
    every other lone cell, 2 x 2 h for a party. */
const dice = (mode, size, tier, offset) => (mode === 'quick' ? { seeds: 1, hours: 1 }
  : size === 1 ? (tier === 'normal' && IN_RANGE.includes(offset) ? { seeds: 6, hours: 4 } : { seeds: 4, hours: 2 }) : { seeds: 2, hours: 2 });

/** THE SETTLE CUT a cell is read in (the engine's fight is the same at any cut, TICK-1; only the HP TRACE between cuts is estimated). A lone hero's
    close calls and low points come from that trace (cell.mjs spreads a window's regeneration evenly, so regeneration lost at full HP early in a long
    window shows as HP missing late in it): at 120 s a fresh Thicket melee read 1.5-3.5 dips under 25% in 12 h and a Glade Ranger about 6, on fights
    that read 0 at 10 s, the live settle cadence, with the same XP and gold to the unit (lane/d-live-grounds-2). So a lone cell reads at 10 s; a
    party, whose dips no rule judges (its lines read deaths, XP and gold, all the engine's own), keeps 120 s, which it pays for per cut. */
export const windowFor = (size) => (size === 1 ? 10000 : 120000);

/** Every job of a mode:{ id, ground, party, level, density, hours, seeds, options, windowMs, whatIf, grade: { ground, tier, offset, size, comp } }. */
export async function buildGrid(root, mode, opts = {}) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const T = await import(u('src/data/hunt-tiers.js'));
  const wi = opts.whatIf || null, tag = wi ? ',w=' + createHash('sha256').update(JSON.stringify(wi)).digest('hex').slice(0, 8) : '';
  const jobs = [];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  for (const x of opts.openAlso || []) if (!own(G.HUNT_GROUNDS, x)) throw new Error('grade: --open-also names no ground ' + x);
  for (const g of groundsOf(G, opts.grounds)) {
    const band = HUNT_INDEX[g.hunt].band;
    /* A STAGED GROUND IS PLAYED AS IT SHIPS (lane/b-slake-and-ford 2026-11-10): its own drops gettable, the ladder every open ground
       is graded on (gear.mjs openAlso). `opts.openAlso` opens other staged grounds with it (a pair that ships together: the Ford's
       armor and the Slake's weapons). The cell id says so, so a cell played on another ladder is never resumed as this one. */
    const extra = (opts.openAlso || []).filter((x) => x !== g.id && !own(G.OPEN_GROUNDS, x));
    const opens = [...(own(G.OPEN_GROUNDS, g.id) ? [] : [g.id]), ...extra];
    const og = opens.length ? ',open' + (extra.length ? '=' + opens.join('+') : '') : '', ogear = opens.length ? { openAlso: opens } : null;
    for (const tier of T.tiersOf(g.id).filter((t) => !opts.tiers || opts.tiers.includes(t))) {
      const row = T.tierRowOf(g.id, tier);
      for (const { offset, level } of levelsOf(band, OFFSETS[mode])) for (const [size, comps] of Object.entries(COMPS[mode])) for (const comp of comps) {
        const n = Number(size), pull = tier === 'normal' ? 0 : row.pull[n - 1], { seeds, hours } = dice(mode, n, tier, offset);
        const id = ['grade', 'g=' + g.id, 't=' + tier, 'o=' + offset, 'p=' + comp.join('+'), 'L=' + level, 's=' + seeds, 'h=' + hours].join(',') + og + tag;
        jobs.push({ id, ground: g.id, party: comp, level, ...(ogear ? { gear: ogear } : {}), ...(pull ? { density: pull } : {}), hours, seeds, ...(tier === 'normal' ? {} : { options: { tier } }),
          windowMs: windowFor(n), ...(wi ? { whatIf: wi } : {}), grade: { ground: g.id, band, groupFit: fitOf(g), tier, offset, size: n, comp: comp.join('+'), gear: 'ladder' } });
      }
      /* THE FRESH HERO (first-week bars): the practice set alone at a first-day solo floor (Level 15 or under), Normal, every way */
      if (tier === 'normal' && band[0] <= 15 && fitOf(g) === 'solo') for (const [s] of COMPS[mode][1]) {
        const { seeds, hours } = dice(mode, 1, tier, 'floor');
        const id = ['grade', 'g=' + g.id, 't=normal', 'o=floor', 'p=' + s, 'L=' + band[0], 'gear=practice', 's=' + seeds, 'h=' + hours].join(',') + og + tag;
        jobs.push({ id, ground: g.id, party: [s], level: band[0], gear: { starter: true }, hours, seeds, windowMs: windowFor(1), ...(wi ? { whatIf: wi } : {}),
          grade: { ground: g.id, band, groupFit: 'solo', tier, offset: 'floor', size: 1, comp: s, gear: 'practice' } });
      }
    }
  }
  return jobs;
}

/** The grounds a run plays: every open one, or exactly the ones named, a STAGED one included (a ground pack is graded before it opens,
    tools/pack.mjs check). A name that is no ground is refused, so a typo can't grade nothing and exit 0. */
export function groundsOf(G, names) {
  if (!names) return Object.values(G.OPEN_GROUNDS);
  return names.map((id) => { const g = Object.prototype.hasOwnProperty.call(G.HUNT_GROUNDS, id) ? G.HUNT_GROUNDS[id] : null; if (!g) throw new Error('grade: no ground ' + id); return g; });
}

/** A ground's fit: party where a pocket needs a party or the ground says so (tools/balance-sim plans.mjs loadAxes), else solo (a both ground sends a lone hero). */
export const fitOf = (g) => ((g.pockets || []).some((p) => p.forParty) || g.groupFit === 'party' ? 'party' : 'solo');
/** Each pack's `checks` (src/data/grounds/index.js GROUND_PACKS), by ground id. */
export async function packChecksOf(root) { const P = await import(pathToFileURL(join(root, 'src/data/grounds/index.js')).href); return Object.fromEntries(P.GROUND_PACKS.map((p) => [(p.ground && p.ground.id) || p.id, p.checks || {}])); }
export async function fitsOf(root) { const G = await import(pathToFileURL(join(root, 'src/data/hunt-grounds.js')).href); return Object.fromEntries(Object.values(G.HUNT_GROUNDS).map((g) => [g.id, fitOf(g)])); }

/* ── THE METRICS OF ONE CELL (hour-weighted per head) ── */
export function metricsOf(c) {
  const hs = c.heroes, hours = hs.reduce((s, h) => s + h.hours, 0) || 1;
  const w = (f) => hs.reduce((s, h) => s + (Number(f(h)) || 0) * h.hours, 0) / hours;
  const income = w((h) => h.incomePerH), store = w((h) => h.storePerH);
  const deaths = hs.reduce((s, h) => s + (h.deaths || 0), 0), dips = hs.reduce((s, h) => s + ((h.closeCallsPer12h && h.closeCallsPer12h.k) || 0), 0);
  const kills = c.party && c.party.killsPerH, coin = hs.reduce((s, h) => s + (Number(h.coinPerH) || 0), 0);
  return { xp: w((h) => h.levelXpPerH), net: w((h) => h.profitPerH), income, store, margin: store > 0 ? income / store - 1 : null,
    supplyShare: income > 0 ? store / income : null, deaths, dips, hours, minHpP50: Math.min(...hs.map((h) => (h.encMinHpPct && h.encMinHpPct.p50 != null ? h.encMinHpPct.p50 : 100))),
    coinPerKill: kills > 0 ? coin / kills : null, held: deaths === 0 };
}

/* ── THE PACE OF RECORD (tools/balance-sim/level-pace.json, the contract past its ceiling) ── */
export async function loadPace(root) {
  const snap = JSON.parse(readFileSync(join(root, 'tools/balance-sim/level-pace.json'), 'utf8'));
  const { LEVEL_PACE } = await import(pathToFileURL(join(root, 'src/data/core-model.js')).href);
  const known = Object.keys(snap.rate).map(Number).sort((a, b) => a - b);
  return (L) => { if (L >= snap.ceiling) return LEVEL_PACE.contract.a * L ** LEVEL_PACE.contract.b; let r = snap.rate[known[0]]; for (const k of known) if (k <= L) r = snap.rate[k]; return r; };
}

/* THE PROFIT NUMBERS (Tyler 2026-11-13, NO PROFIT MOLDS): printed by goldReport, never a rule's metric or aggregate. A sheet that grades
   one is refused, so no lane can tune a ground toward a profit percentage again. */
export const PROFIT_METRICS = Object.freeze(['net', 'margin', 'supplyShare', 'netMinusFloor', 'netVsSolo', 'medianCost']);
export const isProfitRule = (rule) => PROFIT_METRICS.includes(rule.metric) || PROFIT_METRICS.includes(rule.aggregate);

/* a rule's scope: tier, offset, size, the ground's fit, the gear (`ladder` unless it says `practice`), the floor's Level, a skip */
const scoped = (rule, m) => (!rule.tiers || rule.tiers.includes(m.tier)) && (!rule.offsets || rule.offsets.includes(m.offset)) && (!rule.sizes || rule.sizes.includes(m.size))
  && (!rule.fit || rule.fit === m.groupFit) && (rule.gear || 'ladder') === (m.gear || 'ladder') && (rule.floorFrom == null || m.band[0] >= rule.floorFrom)
  && (rule.floorMax == null || m.band[0] <= rule.floorMax) && !(rule.skip && rule.skip(m));
export const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const off = (v, rule) => (rule.min != null && v < rule.min ? (rule.min - v) / Math.max(Math.abs(rule.min), 1e-9) : rule.max != null && v > rule.max ? (v - rule.max) / Math.max(Math.abs(rule.max), 1e-9) : 0);

/**
 * Grade `cells` (played, each carrying its job's `grade` meta) against `sheet` with `pace` (Level -> Level XP an hour). Answers
 * { verdicts: [{ rule, binding, verdict 'FAIL'|'UNPROVEN'|'OFF'|'ok', key, value, lo, hi, bound, off, why }], grounds: { id: { fail, unproven, off, ok } } }.
 * OFF is an advisory rule off its target; a solo cell on a party ground (groupFit 'party') grades its binding rules as advisory.
 */
export function gradeCells(cells, sheet, pace, fits = {}, packs = {}) {
  const gold = sheet.rules.filter(isProfitRule);
  if (gold.length) throw new Error('grade: ' + gold.map((r) => r.id).join(', ') + ' grade a profit number; Tyler 2026-11-13 NO PROFIT MOLDS: gold is printed (goldReport), never graded');
  /* `packs`: a pack's own grading facts (src/data/grounds/<id>/pack.js `checks`), e.g. deadlyFourNeeds 'healer' (designer Q4 2026-11-12) */
  const rows = cells.filter((c) => c.heroes && c.cell && c.cell.grade).map((c) => ({ c, m: { ...c.cell.grade, groupFit: fits[c.cell.grade.ground] || c.cell.grade.groupFit,
    deadlyFourNeeds: (packs[c.cell.grade.ground] && packs[c.cell.grade.ground].deadlyFourNeeds) || null }, x: metricsOf(c) }));
  const key = (m, extra) => [m.ground, m.tier, m.offset, 'size ' + m.size, extra].filter(Boolean).join(' / ');
  const find = (m, pred) => rows.filter((r) => r.m.ground === m.ground && pred(r.m));
  const verdicts = [];
  const push = (rule, m, value, extra, ci) => {
    /* the pace contract is fitted on lone heroes (pace.mjs, the ladder plan), so its lone reading binds on a party ground too (Coordinator ruling 2026-11-11, lane/d-solo-fifteen) */
    /* a rule's `reportOnly(m)` cells are reported, never graded (designer rulings Q2 and Q4, 2026-11-12) */
    const binding = rule.binding && !(m.size === 1 && m.groupFit === 'party' && rule.aggregate !== 'xpVsContract') && !(rule.reportOnly && rule.reportOnly(m));
    let verdict = 'ok', o = 0;
    if (ci) {
      if (rule.max != null && ci.lo > rule.max) { verdict = binding ? 'FAIL' : 'OFF'; o = (ci.lo - rule.max) / Math.max(rule.max, 1e-9); }
      else if (rule.max != null && ci.hi > rule.max && ci.k > 0) { verdict = binding ? 'UNPROVEN' : 'OFF'; o = (ci.rate - rule.max) / Math.max(rule.max, 1e-9); }
    } else if (value != null && Number.isFinite(value)) {
      o = off(value, rule);
      if (o > 0) verdict = binding ? 'FAIL' : 'OFF';
    } else return;
    verdicts.push({ rule: rule.id, binding, verdict, key: key(m, extra), ground: m.ground, value: ci ? ci.rate : value, lo: ci ? ci.lo : null, hi: ci ? ci.hi : null,
      k: ci ? ci.k : null, hours: ci ? ci.hours : null, min: rule.min ?? null, max: rule.max ?? null, off: Math.max(0, o), why: rule.why });
  };
  for (const rule of sheet.rules) {
    if (rule.pooled) {
      const groups = new Map();
      for (const r of rows) if (scoped(rule, r.m)) { const k = [r.m.ground, r.m.tier, r.m.offset, r.m.size].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      for (const g of groups.values()) {
        const k = g.reduce((s, r) => s + (rule.metric === 'dipsPer12h' ? r.x.dips : r.x.deaths), 0), hours = g.reduce((s, r) => s + r.x.hours, 0);
        const ci = rateCI(k, hours, rule.metric === 'dipsPer12h' ? 12 : 1000);
        push(rule, g[0].m, ci.rate, g.length + ' cells, ' + Math.round(hours) + ' hero-h', ci);
      }
      continue;
    }
    if (rule.aggregate) {
      /* one number per ground x tier x offset x size (the median way, a count, or the four a head on a party ground) */
      const groups = new Map();
      for (const r of rows) if (scoped(rule, r.m)) { const k = [r.m.ground, r.m.tier, r.m.offset, r.m.size].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      if (rule.aggregate === 'xpVsContract') {
        /* the lone median on EVERY ground, party grounds included: the contract is fitted on lone heroes (tools/balance-sim/pace.mjs, the ladder plan), and a
           four is ruled 1.15-1.25x a lone hero (party.fourVsSolo), so the four a head always read about 1.2x it (Coordinator ruling 2026-11-11, lane/d-solo-fifteen:
           the Sewer's 1.19 and the Warrens' 1.52 were the party bonus, not a pace miss) */
        for (const k of [...groups.keys()]) if (groups.get(k)[0].m.size !== 1) groups.delete(k);
      }
      for (const g of groups.values()) {
        const m = g[0].m, L = g[0].c.cell.level;
        let v = null;
        switch (rule.aggregate) {
          case 'xpVsContract': v = sheet.contract ? median(g.map((r) => r.x.xp)) / sheet.contract(Array.isArray(L) ? Math.max(...L) : L) : null; break;
          case 'xpVsNormal': { const n = median(find(m, (o) => o.tier === 'normal' && o.offset === m.offset && o.size === m.size && (o.gear || 'ladder') === 'ladder').map((o) => o.x.xp)); v = n > 0 ? median(g.map((r) => r.x.xp)) / n : null; break; }
          case 'heldCount': v = Math.round(((g.filter((r) => r.x.held).length * 8) / g.length) * 10) / 10; break; /* held of 8 ways (a quick run plays 4) */
          default: throw new Error('grade: no aggregate ' + rule.aggregate);
        }
        push(rule, m, v, 'the median of ' + g.length + ' (' + g.map((r) => r.m.comp).join(', ') + ') L' + L);
      }
      continue;
    }
    for (const r of rows) {
      if (!scoped(rule, r.m)) continue;
      if (rule.heldOnly && !r.x.held) continue;
      const m = r.m, x = r.x;
      let v = null;
      switch (rule.metric) {
        case 'minHpP50': case 'deaths': case 'dips': v = x[rule.metric]; break;
        case 'deathsPer16h': v = x.hours > 0 ? (x.deaths / x.hours) * 16 : null; break;
        case 'xpVsFloorSolo': { const f = median(find(m, (o) => o.tier === m.tier && o.offset === 'floor' && o.size === 1 && (o.gear || 'ladder') === 'ladder').map((o) => o.x.xp)); v = f > 0 ? x.xp / f : null; break; }
        case 'xpVsNormal': { const n = find(m, (o) => o.tier === 'normal' && o.offset === m.offset && o.comp === m.comp && (o.gear || 'ladder') === 'ladder')[0]; v = n && n.x.xp > 0 ? x.xp / n.x.xp : null; break; }
        case 'xpVsPace': { const L = r.c.cell.level, p = pace(Array.isArray(L) ? Math.max(...L) : L); v = p > 0 ? x.xp / p : null; break; }
        case 'xpVsSolo': { const solo = median(find(m, (o) => o.tier === m.tier && o.offset === m.offset && o.size === 1 && (o.gear || 'ladder') === (m.gear || 'ladder')).map((o) => o.x.xp));
          v = solo > 0 ? x.xp / solo : null; break; }
        case 'xpVsTierBelow': { const below = m.tier === 'deadly' ? 'dangerous' : 'normal'; const b = find(m, (o) => o.tier === below && o.offset === m.offset && o.comp === m.comp)[0]; v = b && b.x.xp > 0 ? x.xp / b.x.xp : null; break; }
        default: throw new Error('grade: no metric ' + rule.metric);
      }
      push(rule, m, v, m.comp + ' L' + r.c.cell.level);
    }
  }
  const grounds = {};
  for (const v of verdicts) { const g = grounds[v.ground] || (grounds[v.ground] = { fail: 0, unproven: 0, off: 0, ok: 0 }); g[v.verdict === 'FAIL' ? 'fail' : v.verdict === 'UNPROVEN' ? 'unproven' : v.verdict === 'OFF' ? 'off' : 'ok']++; }
  return { verdicts, grounds };
}

/**
 * THE SHEET: `--sheet local` (grade-sheet.mjs SHEET); `--sheet <module>` (exports SHEET, or BALANCE_SHEET read through
 * sheetFromBalanceSheet); `--sheet-ref <git ref>` (that ref's src/data/balance-sheet.js, copied under out/ with its one import pointed
 * at this tree's core-model.js, nothing written under src/); by default src/data/balance-sheet.js once it is in this tree, else local.
 */
export async function loadSheet(root, sheetArg, ref) {
  const L = await import('./grade-sheet.mjs');
  const adapt = (mod) => (mod.SHEET ? mod.SHEET : { ...L.sheetFromBalanceSheet(mod.BALANCE_SHEET), contract: mod.contractXpPerH });
  if (sheetArg === 'local') return L.SHEET;
  if (sheetArg) return adapt(await import(pathToFileURL(resolve(sheetArg)).href));
  if (ref) {
    const { execFileSync } = await import('node:child_process');
    const src = execFileSync('git', ['-C', root, 'show', ref + ':src/data/balance-sheet.js'], { encoding: 'utf8' });
    const core = pathToFileURL(join(root, 'src/data/core-model.js')).href;
    const file = join(HERE, 'out', 'balance-sheet.' + ref.replace(/[^\w.-]+/g, '_') + '.mjs');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, src.replace(/from '\.\/core-model\.js(\?v=[\d.]+)?'/, "from '" + core + "$1'"));
    return adapt(await import(pathToFileURL(file).href));
  }
  const own = join(root, 'src/data/balance-sheet.js');
  return existsSync(own) ? adapt(await import(pathToFileURL(own).href)) : L.SHEET;
}

/** THE LARGEST BLOWS (a sheet's `blows`): every regular on an open ground, its largest blow (combat.js monsterMaxHit) against the base
    HP of a hero of its own Level (VITALS), at most `regularMaxShare`. Static: read off the rows, no play. */
export async function blowVerdicts(root, sheet, grounds = null) {
  if (!sheet.blows) return [];
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  const G = await import(u('src/data/hunt-grounds.js') + v), { MONSTERS } = await import(u('src/data/monsters.js') + v);
  const { monsterMaxHit } = await import(u('src/core/combat.js') + v), { VITALS } = await import(u('src/data/core-model.js') + v);
  const out = [];
  for (const g of groundsOf(G, grounds)) {
    const ids = new Set();
    for (const p of g.pockets || []) for (const s of [...(p.pack || []), ...(p.spawns || [])]) ids.add(s.monster);
    for (const id of ids) {
      const m = MONSTERS[id];
      if (!m || m.boss || !m.level) continue;
      const share = monsterMaxHit(m) / (VITALS.hpBase + VITALS.hpPerLevel * m.level), max = sheet.blows.regularMaxShare;
      out.push({ rule: 'blow-share', binding: true, verdict: share > max ? 'FAIL' : 'ok', key: g.id + ' / ' + id + ' L' + m.level, ground: g.id, value: share, lo: null, hi: null, k: null, hours: null,
        min: null, max, off: share > max ? (share - max) / max : 0, why: 'balance-sheet.js blows.regularMaxShare: a regular\'s largest blow against a same-Level hero\'s base HP' });
    }
  }
  return out;
}

/**
 * WHAT A PLAYER WOULD FEEL (Coordinator 2026-11-07: lead with these), read off the cells with no sheet, each from a ruling:
 *   feel-normal-deaths  a death on Normal at or above a floor, any party size (11-04 "in range is safe"; 10-25 <= 1 per 1,000 h)
 *   feel-tier-less      a harder tier a hero or party HELD (no death) paying less Level XP a head than Normal (11-05 more XP a kill)
 *   feel-seat-below-solo a party seat on Normal in range earning less Level XP than the median lone hero there (10-25 parties advantaged)
 * (feel-gold-order, a higher floor netting less gold than a lower one, is RETIRED by Tyler's 2026-11-13 NO PROFIT MOLDS: each ground's
 * gold is printed side by side in goldReport, and an outlier is treated one ground at a time.)
 */
export function feelVerdicts(cells, fits = {}) {
  const rows = cells.filter((c) => c.heroes && c.cell && c.cell.grade).map((c) => ({ c, m: { ...c.cell.grade, groupFit: fits[c.cell.grade.ground] || c.cell.grade.groupFit }, x: metricsOf(c) }))
    .filter((r) => (r.m.gear || 'ladder') === 'ladder');
  const out = [], v = (rule, verdict, key, ground, value, extra) => out.push({ rule, binding: true, verdict, key, ground, value, lo: null, hi: null, k: null, hours: null, min: null, max: null, off: 0, why: '', ...extra });
  const inRange = (o) => ['floor', 'middle', 'plus10', 'top'].includes(o);
  const groups = new Map();
  for (const r of rows) if (r.m.tier === 'normal' && inRange(r.m.offset)) { const k = r.m.ground + '|' + r.m.size; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const g of groups.values()) {
    const k = g.reduce((s, r) => s + r.x.deaths, 0), hours = g.reduce((s, r) => s + r.x.hours, 0), ci = rateCI(k, hours, 1000);
    if (k > 0) v('feel-normal-deaths', ci.lo > 1 ? 'FAIL' : 'UNPROVEN', g[0].m.ground + ' / normal / at or above the floor / size ' + g[0].m.size + ' / ' + g.filter((r) => r.x.deaths).map((r) => r.m.comp + ' ' + r.m.offset + ' L' + r.c.cell.level + ' x' + r.x.deaths).join(', '),
      g[0].m.ground, ci.rate, { lo: ci.lo, hi: ci.hi, k, hours: ci.hours, max: 1, off: ci.rate, why: '11-04 in range is safe; 10-25 Normal at most 1 death per 1,000 h' });
  }
  const at = (m, tier) => rows.find((o) => o.m.ground === m.ground && o.m.tier === tier && o.m.offset === m.offset && o.m.comp === m.comp);
  for (const r of rows) if (r.m.tier !== 'normal' && inRange(r.m.offset) && r.x.held) {
    const n = at(r.m, 'normal');
    if (n && r.x.xp < n.x.xp) v('feel-tier-less', 'FAIL', r.m.ground + ' / ' + r.m.tier + ' / ' + r.m.offset + ' / ' + r.m.comp + ' L' + r.c.cell.level, r.m.ground, r.x.xp / n.x.xp,
      { min: 1, off: 1 - r.x.xp / n.x.xp, why: '11-05: a harder tier held pays more XP a kill; this one pays less an hour than Normal' });
  }
  for (const r of rows) if (r.m.tier === 'normal' && inRange(r.m.offset) && r.m.size > 1) {
    const solo = median(rows.filter((o) => o.m.ground === r.m.ground && o.m.tier === 'normal' && o.m.offset === r.m.offset && o.m.size === 1).map((o) => o.x.xp));
    const seat = Math.min(...r.c.heroes.map((h) => h.levelXpPerH));
    if (solo > 0 && seat < solo) v('feel-seat-below-solo', 'FAIL', r.m.ground + ' / normal / ' + r.m.offset + ' / ' + r.m.comp + ' L' + r.c.cell.level + ' (lowest seat ' + r.c.heroes.reduce((a, h) => (h.levelXpPerH < a.levelXpPerH ? h : a)).style + ')',
      r.m.ground, seat / solo, { min: 1, off: 1 - seat / solo, why: '10-25: parties are advantaged; a seat here levels slower than going alone' });
  }
  return out;
}

/**
 * GOLD BY GROUND, PRINTED (Tyler 2026-11-13, NO PROFIT MOLDS): one row per ground, side by side, so an outlier is easy to spot and
 * treated on its own. Numbers only: no bound, no verdict, no rule across grounds. Per head an hour, the ladder kit, each the median
 * of the cells it names: net gold, coin + commons over the store bill, and the bill as a share of income alone at the floor on Normal;
 * net a head for a duo / trio / four there; and net under the floor (2-3 and 5 under, any tier and size) and at the floor on the
 * harder tiers (any size); a spread reads "median (lowest to highest cell)". A cell the run did not play reads '-'.
 */
export function goldRows(cells, fits = {}) {
  const rows = cells.filter((c) => c.heroes && c.cell && c.cell.grade && (c.cell.grade.gear || 'ladder') === 'ladder').map((c) => ({ m: c.cell.grade, x: metricsOf(c) }));
  return [...new Set(rows.map((r) => r.m.ground))].map((g) => {
    const mine = rows.filter((r) => r.m.ground === g);
    const med = (pred, k) => median(mine.filter(pred).map((r) => r.x[k]));
    /* a spread: the median and the lowest and highest cell, so one way or group far off the rest shows */
    const spread = (pred) => { const v = mine.filter(pred).map((r) => r.x.net).filter(Number.isFinite); return v.length ? { med: median(v), lo: Math.min(...v), hi: Math.max(...v) } : null; };
    const at = (tiers, offsets, sizes) => (r) => tiers.includes(r.m.tier) && offsets.includes(r.m.offset) && (!sizes || sizes.includes(r.m.size));
    const lone = at(['normal'], ['floor'], [1]), size = (n) => med(at(['normal'], ['floor'], [n]), 'net');
    return { ground: g, floor: mine[0].m.band[0], fit: fits[g] || mine[0].m.groupFit,
      lone: { net: spread(lone), margin: med(lone, 'margin'), supplyShare: med(lone, 'supplyShare') },
      party: { 2: size(2), 3: size(3), 4: size(4) },
      under23: spread(at(['normal', 'dangerous', 'deadly'], ['under2', 'under3'])), under5: spread(at(['normal', 'dangerous', 'deadly'], ['under5'])),
      dangerous: spread(at(['dangerous'], ['floor'])), deadly: spread(at(['deadly'], ['floor'])) };
  }).sort((a, b) => a.floor - b.floor);
}
export function goldReport(rows) {
  const g = (v) => (v == null ? '-' : Math.round(v).toLocaleString('en-US'));
  const sp = (v) => (v == null ? '-' : g(v.med) + (v.lo === v.hi ? '' : ' (' + g(v.lo) + ' to ' + g(v.hi) + ')'));
  const p = (v) => (v == null ? '-' : (v >= 0 ? '+' : '') + Math.round(v * 100) + '%');
  const lines = ['GOLD BY GROUND (printed, never graded: Tyler 2026-11-13 NO PROFIT MOLDS; per head an hour, medians, ladder kit)',
    '| Ground | Floor | Fit | Alone at floor: net | over the bill | bill share | Duo | Trio | Four | 2-3 under | 5 under | Dangerous floor | Deadly floor |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push('| ' + [r.ground, r.floor, r.fit, sp(r.lone.net), p(r.lone.margin), p(r.lone.supplyShare), g(r.party[2]), g(r.party[3]), g(r.party[4]), sp(r.under23), sp(r.under5), sp(r.dangerous), sp(r.deadly)].join(' | ') + ' |');
  return lines.join('\n');
}

const RANK = { FAIL: 3, UNPROVEN: 2, OFF: 1, ok: 0 };
/** The ranked outliers: FAIL, then UNPROVEN, then OFF, each by how far off. */
export const ranked = (verdicts) => verdicts.filter((v) => v.verdict !== 'ok').sort((a, b) => RANK[b.verdict] - RANK[a.verdict] || b.off - a.off);

const fmt = (v) => (v == null ? '-' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(2));
export function report(out, limit = 60) {
  const lines = [];
  const feel = ranked(out.verdicts.filter((v) => v.rule.startsWith('feel-')));
  lines.push('WHAT A PLAYER WOULD FEEL (' + feel.length + ')', '| # | Verdict | Rule | Where | Value | Why |', '|---|---|---|---|---|---|');
  feel.slice(0, limit).forEach((v, i) => lines.push('| ' + (i + 1) + ' | ' + v.verdict + ' | ' + v.rule + ' | ' + v.key + ' | ' + fmt(v.value) + (v.lo != null ? ' [' + fmt(v.lo) + '-' + fmt(v.hi) + ', ' + v.k + ' in ' + Math.round(v.hours) + ' h]' : '') + ' | ' + v.why + ' |'));
  lines.push('', 'AGAINST THE SHEET');
  const R = ranked(out.verdicts.filter((v) => !v.rule.startsWith('feel-')));
  lines.push('| # | Verdict | Rule | Where | Value | Target | Why |', '|---|---|---|---|---|---|---|');
  R.slice(0, limit).forEach((v, i) => lines.push('| ' + (i + 1) + ' | ' + v.verdict + ' | ' + v.rule + ' | ' + v.key + ' | ' + fmt(v.value) + (v.lo != null ? ' [' + fmt(v.lo) + '-' + fmt(v.hi) + ', ' + v.k + ' in ' + Math.round(v.hours) + ' h]' : '')
    + ' | ' + (v.min != null ? '>= ' + v.min : '') + (v.min != null && v.max != null ? ', ' : '') + (v.max != null ? '<= ' + v.max : '') + ' | ' + v.why + ' |'));
  if (R.length > limit) lines.push('(' + (R.length - limit) + ' more in grade.json)');
  lines.push('', 'PER GROUND');
  for (const [g, s] of Object.entries(out.grounds)) lines.push('  ' + g.padEnd(22) + (s.fail ? 'FAIL' : 'pass') + '  ' + s.fail + ' fail, ' + s.unproven + ' unproven, ' + s.off + ' advisory off, ' + s.ok + ' ok');
  return lines.join('\n');
}

/* ── THE SELFTEST: a synthetic set that passes every binding rule, then one mutant per rule family that must turn it red ── */
function synthHero(o) {
  return { style: o.style || 'tank', level: o.level || 16, hours: o.hours || 8, levelXpPerH: o.xp ?? 80000, profitPerH: (o.income ?? 5000) - (o.store ?? 1000), incomePerH: o.income ?? 5000, storePerH: o.store ?? 1000,
    deaths: o.deaths || 0, closeCallsPer12h: { k: o.dips || 0 }, encMinHpPct: { p50: o.hp ?? 70 }, coinPerH: o.coin ?? 3000 };
}
function synthCell(g, o = {}) {
  const size = g.size || 1, heroes = Array.from({ length: size }, () => synthHero(o));
  return { cell: { id: JSON.stringify(g), level: o.level || 16, grade: { ground: 'g', band: [16, 31], groupFit: 'solo', comp: g.comp || 'tank', ...g } }, heroes, party: { killsPerH: o.kills ?? 100 * size } };
}
export function synthSet(mut = {}) {
  const cells = [];
  for (const tier of ['normal', 'dangerous', 'deadly']) for (const offset of ['under5', 'under2', 'floor', 'top']) {
    const level = { under5: 11, under2: 14, floor: 16, top: 31 }[offset];
    const tierXp = { normal: 1, dangerous: 1.2, deadly: 1.4 }[tier], under = offset.startsWith('under');
    const base = { level, hours: 2000, xp: (under ? 120000 : 70000) * tierXp, income: 5000, store: under ? 6000 : (offset === 'floor' ? 1500 : 800), hp: 70, coin: 3000 };
    cells.push(synthCell({ tier, offset, size: 1, comp: 'tank' }, { ...base, ...(under && offset === 'under2' ? { store: 2000 } : {}) }));
    cells.push(synthCell({ tier, offset, size: 4, comp: 'four' }, { ...base, xp: base.xp * 1.2, income: 4500, store: under ? 6000 : 500, kills: 400 }));
  }
  const pick = (tier, offset, size) => cells.find((c) => c.cell.grade.tier === tier && c.cell.grade.offset === offset && c.cell.grade.size === size);
  if (mut.deaths) pick('normal', 'floor', 1).heroes[0].deaths = 12;
  if (mut.dips) pick('normal', 'floor', 1).heroes[0].closeCallsPer12h.k = 900;
  /* a lone hero at the floor 11% over its bill (gold only: the old +25% floor's mutant, now a printed number) */
  if (mut.profit) pick('normal', 'floor', 1).heroes[0].storePerH = 4500, pick('normal', 'floor', 1).heroes[0].profitPerH = 500;
  if (mut.under5) for (const h of pick('dangerous', 'under5', 4).heroes) h.storePerH = 1000, h.profitPerH = 3500;
  /* `ways`: three more lone ways at the floor, `ways` of them losing gold (the median-target selftest) */
  if (mut.band) for (const c of cells) c.cell.grade.band = mut.band;
  if (mut.fourOffset === 'middle') for (const c of cells.filter((c) => c.cell.grade.offset === 'top')) c.cell.grade.offset = 'middle';
  if (mut.four) for (const h of pick('normal', mut.fourOffset || 'floor', 4).heroes) h.levelXpPerH = 70000 * 1.6;
  if (mut.deadlyFour) { const c = pick('deadly', 'floor', 4); c.cell.grade.comp = mut.deadlyFour; for (const h of c.heroes) h.deaths = 40, h.hours = 8; }
  if (mut.tier) for (const h of pick('deadly', 'top', 4).heroes) h.levelXpPerH = 70000;
  if (mut.lowpoint) pick('normal', 'floor', 1).heroes[0].encMinHpPct.p50 = 40;
  /* fresh heroes in the practice kit at the floor (buildGrid's first-week cells): a four in the ladder kit is judged against solos in the
     same kit (10-25 §5 "same levels, gear quality"), so these must not drag the solo median down (lane/d-party-xp-cells, 2026-11-11) */
  if (mut.practice) for (const comp of ['hammer', 'bow', 'mage']) cells.push(synthCell({ tier: 'normal', offset: 'floor', size: 1, comp, gear: 'practice' }, { level: 16, hours: 2000, xp: 20000, income: 5000, store: 1500, hp: 70, coin: 3000 }));
  return cells;
}

if (isMain(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  /* the selftest proves the grader's logic on the local sheet, whatever sheet the tree carries */
  const SHEET = await loadSheet(ROOT, process.argv.includes('--selftest') ? 'local' : arg('sheet', null), arg('sheet-ref', null));
  if (process.argv.includes('--selftest')) {
    const flat = () => 70000;
    const good = gradeCells(synthSet(), SHEET, flat);
    const bad = [];
    if (good.verdicts.some((v) => v.verdict === 'FAIL')) bad.push('the good set fails: ' + ranked(good.verdicts).filter((v) => v.verdict === 'FAIL').map((v) => v.rule + ' ' + v.key).join('; '));
    for (const [mut, rule] of [['deaths', 'normal-deaths'], ['dips', 'normal-dips'], ['four', 'four-xp'], ['tier', 'tier-pays-more'], ['lowpoint', 'normal-low-point']]) {
      const r = gradeCells(synthSet({ [mut]: true }), SHEET, flat);
      if (!r.verdicts.some((v) => v.rule === rule && v.verdict === 'FAIL')) bad.push('mutant ' + mut + ' did not FAIL ' + rule);
    }
    const RS = await loadSheet(ROOT, null, null);
    /* Q2: on a band of 20+ Levels a four's ends are reported (OFF), its middle is graded; on a narrower band the ends still FAIL */
    const long = (band, at) => gradeCells(synthSet({ four: true, band, fourOffset: at }), RS, flat).verdicts.filter((v) => v.rule === 'four-xp' && v.verdict === 'FAIL');
    if (long([16, 36], 'top').length) bad.push('a 20-Level band graded a four at its end');
    if (!long([16, 36], 'middle').length) bad.push('a 20-Level band did not grade a four at its middle');
    if (!long([16, 31], 'top').length) bad.push('a 15-Level band stopped grading a four at its top');
    /* Q4: a pack that needs a Healer on Deadly grades only the four with one; the healerless four is reported */
    const heal = (needs, comp) => gradeCells(synthSet({ deadlyFour: comp }), RS, flat, {}, { g: { deadlyFourNeeds: needs } }).verdicts.filter((v) => v.rule === 'tier-deadly-four-held' && v.verdict === 'FAIL').length;
    if (heal('healer', 'tank+bow+mage+hammer')) bad.push('a healerless four failed a Deadly that needs a Healer');
    if (!heal('healer', 'tank+healer+bow+mage')) bad.push('a four with a Healer was not graded on a Deadly that needs one');
    if (!heal(null, 'tank+bow+mage+hammer')) bad.push('a healerless four went ungraded on an ordinary Deadly');
    /* NO PROFIT MOLDS (Tyler 2026-11-13): a hunt under +25% and a pair five under in profit FAIL nothing, and the printed gold report carries
       each changed number; a sheet that grades gold is refused */
    const goldOf = (cells) => goldReport(goldRows(cells));
    for (const [mut, cell] of [['profit', '| +11% |'], ['under5', 'to 3,500)']]) {
      const r = gradeCells(synthSet({ [mut]: true }), SHEET, flat), was = goldOf(synthSet()), now = goldOf(synthSet({ [mut]: true }));
      if (r.verdicts.some((v) => v.verdict === 'FAIL')) bad.push('mutant ' + mut + ' (gold only) FAILS ' + r.verdicts.filter((v) => v.verdict === 'FAIL').map((v) => v.rule).join(', '));
      if (now === was) bad.push('mutant ' + mut + ' left the printed gold report unchanged');
      if (cell && !now.includes(cell)) bad.push('the gold report does not print the five-under net (3,500): ' + now);
    }
    let refused = false;
    try { gradeCells(synthSet(), { ...SHEET, rules: [...SHEET.rules, { id: 'a-profit-floor', metric: 'margin', min: 0.25, binding: true }] }, flat); } catch (e) { refused = /NO PROFIT MOLDS/.test(e.message); }
    if (!refused) bad.push('a sheet with a profit rule (margin >= +25%) was not refused as a profit rule');
    if (bad.length) { console.error('grade --selftest RED: ' + bad.join(' | ')); process.exit(1); }
    console.log('grade --selftest: the good set passes, 5 mutants each FAIL their rule, the long-band and needs-a-Healer scopes hold, 2 gold mutants fail nothing and move the printed gold report, a profit rule is refused');
    process.exit(0);
  }
  const mode = arg('mode', 'quick');
  if (!OFFSETS[mode]) { console.error('grade: --mode quick|full'); process.exit(2); }
  const inDir = arg('in', null);
  const out = resolve(inDir || arg('out', join(HERE, 'out', 'grade-' + mode)));
  if (!inDir) {
    const whatIf = arg('what-if', null) ? JSON.parse(arg('what-if')) : null;
    const grounds = arg('grounds', null) ? arg('grounds').split(',') : null, tiers = arg('tiers', null) ? arg('tiers').split(',') : null;
    const openAlso = arg('open-also', null) ? arg('open-also').split(',') : null;
    const jobs = await buildGrid(ROOT, mode, { whatIf, grounds, tiers, openAlso });
    if (process.argv.includes('--estimate')) { console.log('grade ' + mode + ': ' + jobs.length + ' cells, ' + jobs.reduce((s, j) => s + j.seeds * j.hours * j.party.length, 0) + ' hero-hours'); process.exit(0); }
    const { runPool } = await import('./pool.mjs');
    mkdirSync(out, { recursive: true });
    await runPool(jobs, join(out, 'cells.jsonl'), { root: ROOT, workers: Number(arg('workers', '4')), cpuMax: Number(arg('cpu', '85')) });
  }
  const cells = existsSync(join(out, 'cells.jsonl')) ? readFileSync(join(out, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const graded = gradeCells(cells, SHEET, await loadPace(ROOT), await fitsOf(ROOT), await packChecksOf(ROOT));
  for (const v of feelVerdicts(cells, await fitsOf(ROOT))) { graded.verdicts.push(v); const g = graded.grounds[v.ground] || (graded.grounds[v.ground] = { fail: 0, unproven: 0, off: 0, ok: 0 }); g[v.verdict === 'FAIL' ? 'fail' : 'unproven']++; }
  for (const v of await blowVerdicts(ROOT, SHEET, arg('grounds', null) ? arg('grounds').split(',') : null)) { graded.verdicts.push(v); const g = graded.grounds[v.ground] || (graded.grounds[v.ground] = { fail: 0, unproven: 0, off: 0, ok: 0 }); g[v.verdict === 'FAIL' ? 'fail' : 'ok']++; }
  const gold = goldRows(cells, await fitsOf(ROOT));
  writeFileSync(join(out, 'grade.json'), JSON.stringify({ sheet: SHEET.source, cells: cells.length, ...graded, gold }, null, 1));
  console.log('GRADE (' + SHEET.source + '), ' + cells.length + ' cells from ' + out + '\n' + report(graded, Number(arg('limit', '60'))) + '\n\n' + goldReport(gold));
  process.exit(graded.verdicts.some((v) => v.verdict === 'FAIL') ? 1 : 0);
}
