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
//   ... [--uniques]                                                                each hero in the best piece it can get per slot, the
//                                                                                   staged gear catalogues' hidden rows included (gear.mjs
//                                                                                   uniques: the armor and weapon lines past Dawnsteel); cells of their own.
//                                                                                   Ground and boss drops only (row 1f); the report prints
//                                                                                   each way's Hearth Chest swap as a what-if row
//   ... [--uniques --chest]                                                        the what-if played: the Hearth Chest's pieces worn too
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
import { loadGear } from './gear.mjs';
import { proveUniques, UNIQUES_MUTANTS } from './uniques-proof.mjs';
import { isMain } from '../../tests/_is-main.mjs';
import { sourceQuery } from '../lib/version-stamp.mjs';
import { PARTY_TIERS, mixedParty } from './grade-sheet.mjs';

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

/* WHICH HERO A CELL PLAYS (the balance audit's fix 1, lane/d-audit-fixes-sim 2026-11-19). The plain harness hero (the ladder kit, every skill at
   its Level, the default bar, every supply bought) killed 0.55-0.83x as fast as the real heroes in the seats of recorded hunts and its Deadly
   fours died 0.5-6.5 times an hour where the recorded ones never did, so parties and harder tiers are graded on the PLAYED hero (cell.mjs
   `profile: 'played'`: the recorded bars, accessories and options, each seat's skills from its career, skill-lines.mjs: 'alone' for a hero alone,
   'party' for a party). A hero ALONE ON NORMAL is still graded plain: the pace of record (LEVEL_PACE, the contract) is the plain hero's, and Normal
   in range is safe for a hero whose bar was never touched. It also plays a PLAYED TWIN, graded by no rule of its own, the "same way alone" a played
   party or a played harder tier is read against (four-xp, the tier lines, the weight class). The practice set and the store-food cell stay plain
   (a fresh hero, an untouched bar). A cell carrying no profile (an older cells file, the selftest's synthetic set) is read as before. */
/** The profile a rule grades a cell on: the plain hero alone on Normal, the practice set and the store-food cell; the played hero everywhere else. */
export const gradedProfile = (m) => ((m.size === 1 && m.tier === 'normal') || m.gear === 'practice' || m.gear === 'storefood' ? 'plain' : 'played');
/* THE PACE RULES read the plain hero wherever they reach: the pace of record and its contract are the plain hero's (pace.mjs, the ladder) */
const PACE_READS = Object.freeze(['xpVsPace', 'xpVsContract']);
const paceRule = (rule) => PACE_READS.includes(rule.metric) || PACE_READS.includes(rule.aggregate);
/** Is cell `m` one rule `rule` grades, by profile? A cell with none is legacy (one profile for all, as before). */
export const profileIn = (rule, m) => !m.profile || m.profile === (paceRule(rule) ? 'plain' : gradedProfile(m));

/** Every job of a mode:{ id, ground, party, level, density, hours, seeds, options, windowMs, whatIf, profile, grade: { ground, tier, offset, size, comp, profile } }. */
export async function buildGrid(root, mode, opts = {}) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const T = await import(u('src/data/hunt-tiers.js'));
  const BAG = (await import(u('src/data/supplies.js'))).BAG_GUIDE_BY_HUNT;
  const START_STORE_FOOD = (await import(u('src/data/start-kit.js'))).START_BAR.find((x) => x.id === 'd_food_store').action.id;
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
    /* --uniques (gear.mjs, lane/a-grader-uniques): the best gettable piece per slot, past the ladder; its cells say so, so a ladder cell is never
       resumed as one. The practice cells stay the start kit's. */
    const uq = opts.uniques === true;
    /* --chest (with --uniques): the Hearth Chest's pieces worn too, the what-if the designer's row 1f keeps off the grade (gear.mjs `chest`) */
    const ch = uq && opts.chest === true;
    const og = (opens.length ? ',open' + (extra.length ? '=' + opens.join('+') : '') : '') + (uq ? ',uniq' : '') + (ch ? ',chest' : '');
    const ogear = opens.length || uq ? { ...(opens.length ? { openAlso: opens } : {}), ...(uq ? { uniques: true } : {}), ...(ch ? { chest: true } : {}) } : null;
    for (const tier of T.tiersOf(g.id).filter((t) => !opts.tiers || opts.tiers.includes(t))) {
      const row = T.tierRowOf(g.id, tier);
      for (const { offset, level } of levelsOf(band, OFFSETS[mode])) for (const [size, comps] of Object.entries(COMPS[mode])) for (const comp of comps) {
        const n = Number(size), pull = tier === 'normal' ? 0 : row.pull[n - 1], { seeds, hours } = dice(mode, n, tier, offset);
        /* the graded profile, and a lone hero on Normal's played twin (above) */
        const graded = gradedProfile({ size: n, tier, gear: 'ladder' });
        for (const profile of graded === 'plain' ? ['plain', 'played'] : ['played']) {
          const id = ['grade', 'g=' + g.id, 't=' + tier, 'o=' + offset, 'p=' + comp.join('+'), 'L=' + level, 's=' + seeds, 'h=' + hours].join(',') + og + tag + ',pr=' + profile;
          jobs.push({ id, ground: g.id, party: comp, level, ...(ogear ? { gear: ogear } : {}), ...(pull ? { density: pull } : {}), hours, seeds, ...(tier === 'normal' ? {} : { options: { tier } }),
            ...(profile === 'played' ? { profile } : {}), windowMs: windowFor(n), ...(wi ? { whatIf: wi } : {}),
            grade: { ground: g.id, band, groupFit: fitOf(g), tier, offset, size: n, comp: comp.join('+'), gear: 'ladder', profile } });
        }
      }
      /* THE SEAT TWINS (the party lines' comparator, Tyler 2026-11-16 "every Dangerous/Deadly party mix stays >= the same heroes alone"): on a party
         tier, each way a party seats that the lone ways don't play (quick: the Healer) is played alone too, at every offset, graded by no rule of its
         own (grade.seatOnly: only sameAloneXp reads it), so the lone medians stay the lone ways' */
      if (PARTY_TIERS.includes(tier)) {
        const lone = new Set(COMPS[mode][1].map((c) => c.join('+')));
        const seated = [...new Set(Object.entries(COMPS[mode]).filter(([n]) => Number(n) > 1).flatMap(([, cs]) => cs.flat()))].filter((s) => !lone.has(s));
        for (const { offset, level } of levelsOf(band, OFFSETS[mode])) for (const s of seated) {
          const pull = row.pull[0], { seeds, hours } = dice(mode, 1, tier, offset);
          const id = ['grade', 'g=' + g.id, 't=' + tier, 'o=' + offset, 'p=' + s, 'L=' + level, 's=' + seeds, 'h=' + hours].join(',') + og + tag + ',seat,pr=played';
          jobs.push({ id, ground: g.id, party: [s], level, ...(ogear ? { gear: ogear } : {}), ...(pull ? { density: pull } : {}), hours, seeds, options: { tier }, profile: 'played',
            windowMs: windowFor(1), ...(wi ? { whatIf: wi } : {}), grade: { ground: g.id, band, groupFit: fitOf(g), tier, offset, size: 1, comp: s, gear: 'ladder', profile: 'played', seatOnly: true } });
        }
      }
      /* THE FRESH HERO (first-week bars): the practice set alone at a first-day solo floor (Level 15 or under), Normal, every way */
      if (tier === 'normal' && band[0] <= 15 && fitOf(g) === 'solo') for (const [s] of COMPS[mode][1]) {
        const { seeds, hours } = dice(mode, 1, tier, 'floor');
        const id = ['grade', 'g=' + g.id, 't=normal', 'o=floor', 'p=' + s, 'L=' + band[0], 'gear=practice', 's=' + seeds, 'h=' + hours].join(',') + og + tag + ',pr=plain';
        jobs.push({ id, ground: g.id, party: [s], level: band[0], gear: { starter: true }, hours, seeds, windowMs: windowFor(1), ...(wi ? { whatIf: wi } : {}),
          grade: { ground: g.id, band, groupFit: 'solo', tier, offset: 'floor', size: 1, comp: s, gear: 'practice', profile: 'plain' } });
      }
      /* THE STORE FOOD THE PAGE CALLS SAFE (lane/d-march-balance 2026-11-14). Every other cell eats the ground's guide food's store row, which
         no bar names until the player picks it: the start bar buys Salted Shrimp, and a Level 55 tank on it died 2 of 2 in the Muster Barrows
         under "Safe at your level" while this grader passed the ground. So a lone tank at the floor on Normal also plays the weakest store
         food the Hunts page stays quiet about: the ground's bagGuide.storeFloor, or the start bar's (src/shell/hunt-go.js weakFoodLine). */
      if (tier === 'normal') {
        const guide = BAG[g.id] || null, storeFood = (guide && guide.storeFloor) || START_STORE_FOOD;
        const { seeds, hours } = dice(mode, 1, tier, 'floor');
        const id = ['grade', 'g=' + g.id, 't=normal', 'o=floor', 'p=tank', 'L=' + band[0], 'food=' + storeFood, 's=' + seeds, 'h=' + hours].join(',') + og + tag + ',pr=plain';
        jobs.push({ id, ground: g.id, party: ['tank'], level: band[0], ...(ogear ? { gear: ogear } : {}), bar: { storeFood }, hours, seeds, windowMs: windowFor(1), ...(wi ? { whatIf: wi } : {}),
          grade: { ground: g.id, band, groupFit: fitOf(g), tier, offset: 'floor', size: 1, comp: 'tank', gear: 'storefood', profile: 'plain' } });
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
  && (rule.floorMax == null || m.band[0] <= rule.floorMax) && !(rule.skip && rule.skip(m)) && profileIn(rule, m);
export const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/* a cell's top Level (a party may seat heroes at several) */
const topLevel = (L) => (Array.isArray(L) ? Math.max(...L) : L);
/**
 * THE SAME HEROES ALONE (the party lines' comparator; Tyler 2026-11-16 "every Dangerous/Deadly party mix stays >= the same heroes alone", read the
 * way tests/party-class-xp-line.mjs and party-tier-xp.mjs read it): the mean of each seat's way played alone on the same ground, tier and offset, in
 * the same profile and kit, its Level XP an hour (a way's median over its cells). `rows`: { m, x } of every cell, the seat twins included. Null when
 * a seat's way was not played alone: no verdict, never a stand-in.
 */
export function sameAloneXp(rows, m) {
  const xs = String(m.comp || '').split('+').map((s) => median(rows.filter((o) => o.m.size === 1 && o.m.comp === s && o.m.ground === m.ground && o.m.tier === m.tier && o.m.offset === m.offset
    && (o.m.profile || null) === (m.profile || null) && (o.m.gear || 'ladder') === (m.gear || 'ladder')).map((o) => o.x.xp)));
  return xs.every((v) => v > 0) ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
/* a seat twin (buildGrid) is read only as the same hero alone, never as a lone way */
const lonelyWay = (c) => !(c.cell && c.cell.grade && c.cell.grade.seatOnly);
const off = (v, rule) => (rule.min != null && v < rule.min ? (rule.min - v) / Math.max(Math.abs(rule.min), 1e-9) : rule.max != null && v > rule.max ? (v - rule.max) / Math.max(Math.abs(rule.max), 1e-9) : 0);

/**
 * Grade `cells` (played, each carrying its job's `grade` meta) against `sheet` with `pace` (Level -> Level XP an hour). Answers
 * { verdicts: [{ rule, binding, verdict 'FAIL'|'UNPROVEN'|'OFF'|'ok', key, value, lo, hi, bound, off, why }], grounds: { id: { fail, unproven, off, ok } } }.
 * OFF is an advisory rule off its target; a solo cell on a party ground (groupFit 'party') grades its binding rules as advisory.
 */
export function gradeCells(cells, sheet, pace, fits = {}, packs = {}) {
  const gold = sheet.rules.filter(isProfitRule);
  if (gold.length) throw new Error('grade: ' + gold.map((r) => r.id).join(', ') + ' grade a profit number; Tyler 2026-11-13 NO PROFIT MOLDS: gold is printed (goldReport), never graded');
  /* `packs`: a pack's own grading facts (src/data/grounds/<id>/pack.js `checks`), e.g. deadlyFourNeeds 'healer' (designer Q4 2026-11-12);
     `level`: the cell's top Level, for a rule scoped by it (four-deadly-pace reports under the sheet's paceFromLevel) */
  const every = cells.filter((c) => c.heroes && c.cell && c.cell.grade).map((c) => ({ c, m: { ...c.cell.grade, groupFit: fits[c.cell.grade.ground] || c.cell.grade.groupFit,
    deadlyFourNeeds: (packs[c.cell.grade.ground] && packs[c.cell.grade.ground].deadlyFourNeeds) || null, level: topLevel(c.cell.level) }, x: metricsOf(c) }));
  /* every rule reads the lone ways and the parties; the seat twins only as the same heroes alone (xpVsSame) */
  const rows = every.filter((r) => lonelyWay(r.c));
  const key = (m, extra) => [m.ground, m.tier, m.offset, 'size ' + m.size, extra].filter(Boolean).join(' / ');
  /* a comparator is the same hero: the same profile as the cell it is read against (a played four against the played twins alone) */
  const find = (m, pred) => rows.filter((r) => r.m.ground === m.ground && (r.m.profile || null) === (m.profile || null) && pred(r.m));
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
           four a head reads the party bonus on top (Coordinator ruling 2026-11-11, lane/d-solo-fifteen: the Sewer's 1.19 and the Warrens' 1.52 were the party
           bonus, not a pace miss); a four's own ceiling against the contract is four-deadly-pace's (headVsContract, Deadly only) */
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
        case 'xpVsTierBelow': { const below = m.tier === 'deadly' ? 'dangerous' : 'normal'; const b = find(m, (o) => o.tier === below && o.offset === m.offset && o.comp === m.comp)[0]; v = b && b.x.xp > 0 ? x.xp / b.x.xp : null; break; }
        /* a party's head over the same heroes alone (sameAloneXp, the seat twins included) */
        case 'xpVsSame': { const s = sameAloneXp(every, m); v = s > 0 ? x.xp / s : null; break; }
        /* the cell's own head over the pace contract at its top Level (the sheet's `contract`; none on the local sheet): the played hero's, not a pace read */
        case 'headVsContract': { const k = sheet.contract ? sheet.contract(m.level) : null; v = k > 0 ? x.xp / k : null; break; }
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
  const v = sourceQuery(ROOT);
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
 *   feel-seat-below-solo a mixed party on Dangerous or Deadly in range (PARTY_TIERS) whose seats earn less Level XP a head than the same heroes
 *                       alone on that tier (sameAloneXp; Tyler 2026-11-16: "normal isn't meant for parties anyway", "every Dangerous/Deadly party
 *                       mix stays >= the same heroes alone"; on Normal a seat may earn under solo). One class never out-earns its heroes alone (10-31), so a
 *                       one-class party is not read; nor a party with no Healer on a Healer's tier at its Level (`healerTier`, hunt-tiers.js
 *                       isHealerTier: designer 2026-11-19, no party the game sends there)
 * (feel-gold-order, a higher floor netting less gold than a lower one, is RETIRED by Tyler's 2026-11-13 NO PROFIT MOLDS: each ground's
 * gold is printed side by side in goldReport, and an outlier is treated one ground at a time.)
 */
export function feelVerdicts(cells, fits = {}, healerTier = () => false) {
  const every = cells.filter((c) => c.heroes && c.cell && c.cell.grade).map((c) => ({ c, m: { ...c.cell.grade, groupFit: fits[c.cell.grade.ground] || c.cell.grade.groupFit, level: topLevel(c.cell.level) }, x: metricsOf(c) }))
    .filter((r) => (r.m.gear || 'ladder') === 'ladder');
  /* the seat twins are read only as the same heroes alone */
  const rows = every.filter((r) => lonelyWay(r.c));
  const out = [], v = (rule, verdict, key, ground, value, extra) => out.push({ rule, binding: true, verdict, key, ground, value, lo: null, hi: null, k: null, hours: null, min: null, max: null, off: 0, why: '', ...extra });
  const inRange = (o) => ['floor', 'middle', 'plus10', 'top'].includes(o);
  /* by profile (gradedProfile above): a cell's own reading is the graded hero's; a comparator is the same hero as the cell it is read against */
  const graded = (m) => !m.profile || m.profile === gradedProfile(m);
  const same = (a, b) => (a.profile || null) === (b.profile || null);
  const groups = new Map();
  for (const r of rows) if (r.m.tier === 'normal' && inRange(r.m.offset) && graded(r.m)) { const k = r.m.ground + '|' + r.m.size; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const g of groups.values()) {
    const k = g.reduce((s, r) => s + r.x.deaths, 0), hours = g.reduce((s, r) => s + r.x.hours, 0), ci = rateCI(k, hours, 1000);
    if (k > 0) v('feel-normal-deaths', ci.lo > 1 ? 'FAIL' : 'UNPROVEN', g[0].m.ground + ' / normal / at or above the floor / size ' + g[0].m.size + ' / ' + g.filter((r) => r.x.deaths).map((r) => r.m.comp + ' ' + r.m.offset + ' L' + r.c.cell.level + ' x' + r.x.deaths).join(', '),
      g[0].m.ground, ci.rate, { lo: ci.lo, hi: ci.hi, k, hours: ci.hours, max: 1, off: ci.rate, why: '11-04 in range is safe; 10-25 Normal at most 1 death per 1,000 h' });
  }
  const at = (m, tier) => rows.find((o) => o.m.ground === m.ground && o.m.tier === tier && o.m.offset === m.offset && o.m.comp === m.comp && same(o.m, m));
  for (const r of rows) if (r.m.tier !== 'normal' && inRange(r.m.offset) && r.x.held && graded(r.m)) {
    const n = at(r.m, 'normal');
    if (n && r.x.xp < n.x.xp) v('feel-tier-less', 'FAIL', r.m.ground + ' / ' + r.m.tier + ' / ' + r.m.offset + ' / ' + r.m.comp + ' L' + r.c.cell.level, r.m.ground, r.x.xp / n.x.xp,
      { min: 1, off: 1 - r.x.xp / n.x.xp, why: '11-05: a harder tier held pays more XP a kill; this one pays less an hour than Normal' });
  }
  const healerless = (m) => !String(m.comp || '').split('+').includes('healer');
  for (const r of rows) if (PARTY_TIERS.includes(r.m.tier) && inRange(r.m.offset) && r.m.size > 1 && graded(r.m) && mixedParty(r.m) && !(healerless(r.m) && healerTier(r.m.ground, r.m.tier, r.m.level))) {
    /* a head against the same heroes alone (sameAloneXp), as tests/party-class-xp-line.mjs reads it; Level XP is shared evenly, so a seat is the head */
    const alone = sameAloneXp(every, r.m), head = r.x.xp;
    if (alone > 0 && head < alone) v('feel-seat-below-solo', 'FAIL', r.m.ground + ' / ' + r.m.tier + ' / ' + r.m.offset + ' / ' + r.m.comp + ' L' + r.c.cell.level + ' (lowest seat ' + r.c.heroes.reduce((a, h) => (h.levelXpPerH < a.levelXpPerH ? h : a)).style + ')',
      r.m.ground, head / alone, { min: 1, off: 1 - head / alone, why: '11-16: on Dangerous and Deadly every party mix earns at least the same heroes alone; a seat here levels slower than they do alone' });
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
  /* the graded hero's gold (a lone hero on Normal plain, parties and harder tiers played), never a played twin's beside it */
  const rows = cells.filter((c) => c.heroes && c.cell && c.cell.grade && (c.cell.grade.gear || 'ladder') === 'ladder' && (!c.cell.grade.profile || c.cell.grade.profile === gradedProfile(c.cell.grade)) && lonelyWay(c))
    .map((c) => ({ m: c.cell.grade, x: metricsOf(c) }));
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
    cells.push(synthCell({ tier, offset, size: 4, comp: 'tank+healer+bow+mage' }, { ...base, xp: base.xp * 1.2, income: 4500, store: under ? 6000 : 500, kills: 400 }));
    /* the seat twins on a party tier (buildGrid): each seat's way alone, as fast as the tank, read only as the same heroes alone */
    if (tier !== 'normal') for (const comp of ['healer', 'bow', 'mage', 'hammer']) cells.push(synthCell({ tier, offset, size: 1, comp, seatOnly: true }, base));
  }
  /* the lone tank at the floor on the store food the Hunts page calls enough (buildGrid's storefood cell) */
  cells.push(synthCell({ tier: 'normal', offset: 'floor', size: 1, comp: 'tank', gear: 'storefood' }, { level: 16, hours: 2000, xp: 70000, income: 5000, store: 1500, hp: 70, coin: 3000 }));
  if (mut.storeFood) cells[cells.length - 1].heroes[0].deaths = 12;
  const pick = (tier, offset, size) => cells.find((c) => c.cell.grade.tier === tier && c.cell.grade.offset === offset && c.cell.grade.size === size);
  if (mut.deaths) pick('normal', 'floor', 1).heroes[0].deaths = 12;
  if (mut.dips) pick('normal', 'floor', 1).heroes[0].closeCallsPer12h.k = 900;
  /* a lone hero at the floor 11% over its bill (gold only: the old +25% floor's mutant, now a printed number) */
  if (mut.profit) pick('normal', 'floor', 1).heroes[0].storePerH = 4500, pick('normal', 'floor', 1).heroes[0].profitPerH = 500;
  if (mut.under5) for (const h of pick('dangerous', 'under5', 4).heroes) h.storePerH = 1000, h.profitPerH = 3500;
  /* `ways`: three more lone ways at the floor, `ways` of them losing gold (the median-target selftest) */
  if (mut.band) for (const c of cells) c.cell.grade.band = mut.band;
  if (mut.fourOffset === 'middle') for (const c of cells.filter((c) => c.cell.grade.offset === 'top')) c.cell.grade.offset = 'middle';
  /* a four earning 0.8 of the hero alone beside it, on `fourTier` (Deadly unless named) at `fourOffset` (the floor unless named) */
  if (mut.four) { const t = mut.fourTier || 'deadly', o = mut.fourOffset || 'floor', solo = pick(t, o, 1).heroes[0].levelXpPerH; for (const h of pick(t, o, 4).heroes) h.levelXpPerH = solo * 0.8; }
  /* a Deadly four at the floor earning `fourPace` x 70,000 a head (the selftest's flat contract), at Level `fourPaceLevel` when named */
  if (mut.fourPace) { const c = pick('deadly', 'floor', 4); for (const h of c.heroes) h.levelXpPerH = 70000 * mut.fourPace; if (mut.fourPaceLevel) c.cell.level = mut.fourPaceLevel; }
  if (mut.deadlyFour) { const c = pick('deadly', 'floor', 4); c.cell.grade.comp = mut.deadlyFour; for (const h of c.heroes) h.deaths = 40, h.hours = 8; }
  if (mut.tier) for (const h of pick('deadly', 'top', 4).heroes) h.levelXpPerH = 70000;
  if (mut.lowpoint) pick('normal', 'floor', 1).heroes[0].encMinHpPct.p50 = 40;
  /* fresh heroes in the practice kit at the floor (buildGrid's first-week cells): a four in the ladder kit is judged against solos in the
     same kit (10-25 §5 "same levels, gear quality"), so these must not drag the solo median down (lane/d-party-xp-cells, 2026-11-11) */
  if (mut.practice) for (const comp of ['hammer', 'bow', 'mage']) cells.push(synthCell({ tier: 'normal', offset: 'floor', size: 1, comp, gear: 'practice' }, { level: 16, hours: 2000, xp: 20000, income: 5000, store: 1500, hp: 70, coin: 3000 }));
  return cells;
}

/** The pieces past the ladder each way wore in a uniques run, one line per ground, way and Level (gear.mjs uniquesIn), and THE CHEST'S
    WHAT-IF (the designer's row 1f: the grade is ground and boss drops only): the Hearth Chest piece the same hero would swap in if it had one,
    printed, never graded (`--chest` plays it). */
export function wornReport(cells, gearLib) {
  const seen = new Map();
  let chested = false;
  for (const c of cells) {
    if (!(c.cell && c.cell.gear && c.cell.gear.uniques) || !c.heroes) continue;
    chested = chested || c.cell.gear.chest === true;
    for (const h of c.heroes) {
      const k = c.cell.ground + ' / ' + h.style + ' / ' + h.level;
      if (seen.has(k)) continue;
      gearLib.kitOf(h.style, h.level, { ground: c.cell.ground, ...c.cell.gear }); /* registers the staged rows the kit names */
      const ps = gearLib.uniquesIn(h.kit, h.level);
      const worn = ps.length ? ps.map((p) => p.n + ' (' + p.slot + ', armor ' + p.armor + (p.attr ? ', ' + p.attr + (p.hooked === false ? ' NO ENGINE HOOK: plays as nothing' : '') : '') + ')').join('; ') : 'the ladder';
      /* the what-if: the kit with the chest's pieces allowed, slot by slot where it differs */
      const withChest = c.cell.gear.chest === true ? h.kit : gearLib.kitOf(h.style, h.level, { ground: c.cell.ground, ...c.cell.gear, chest: true });
      const swaps = Object.entries(withChest).filter(([slot, id]) => gearLib.CHEST_IDS.has(id) && h.kit[slot] !== id).map(([slot, id]) => gearLib.ITEMS[id].n + ' for ' + (h.kit[slot] ? gearLib.ITEMS[h.kit[slot]] ? gearLib.ITEMS[h.kit[slot]].n : h.kit[slot] : 'nothing') + ' (' + slot + ')');
      seen.set(k, [worn, swaps.length ? swaps.join('; ') : '-']);
    }
  }
  return '\n\nWORN PAST THE LADDER (--uniques' + (chested ? ' --chest: the Hearth Chest\'s pieces worn too, a what-if' : ', ground and boss drops only') + ')\n'
    + '| Ground / way / Level | Pieces | With a Hearth Chest piece (what-if, not graded) |\n|---|---|---|\n'
    + [...seen].sort().map(([k, [v, w]]) => '| ' + k + ' | ' + v + ' | ' + w + ' |').join('\n');
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
    for (const [mut, rule] of [['deaths', 'normal-deaths'], ['dips', 'normal-dips'], ['four', 'four-xp'], ['tier', 'tier-pays-more'], ['lowpoint', 'normal-low-point'], ['storeFood', 'normal-deaths-store-food']]) {
      const r = gradeCells(synthSet({ [mut]: true }), SHEET, flat);
      if (!r.verdicts.some((v) => v.rule === rule && v.verdict === 'FAIL')) bad.push('mutant ' + mut + ' did not FAIL ' + rule);
    }
    /* THE PARTY LINES (grade-sheet.mjs, Tyler 2026-11-16), on the balance sheet a pack check reads with a flat contract: a four under the hero alone
       FAILS on Dangerous and Deadly at the floor and middle, at any band width; reads OFF at a band top (designer 11-13); FAILS NOTHING on Normal
       ("normal isn't meant for parties anyway"); and a Deadly four past the contract ceiling FAILS, under paceFromLevel reads OFF, on Dangerous
       is not read */
    const RS = { ...(await loadSheet(ROOT, null, null)), contract: flat };
    const P = (await import(pathToFileURL(join(ROOT, 'src/data/balance-sheet.js')).href)).BALANCE_SHEET.party;
    const four = (opts, at, rule, verdict) => gradeCells(synthSet({ four: true, ...opts }), RS, flat).verdicts
      .filter((v) => v.rule === rule && v.verdict === verdict && v.key.includes('/ ' + at + ' /'));
    for (const t of PARTY_TIERS) {
      if (!four({ fourTier: t }, 'floor', 'four-xp', 'FAIL').length) bad.push('a four under the hero alone on ' + t + ' at the floor did not FAIL four-xp');
      if (!four({ fourTier: t, band: [16, 36], fourOffset: 'middle' }, 'middle', 'four-xp', 'FAIL').length) bad.push('a four under the hero alone on ' + t + ' at a 20-Level band\'s middle did not FAIL');
      if (!four({ fourTier: t, band: [16, 36] }, 'floor', 'four-xp', 'FAIL').length) bad.push('a 20-Level band still exempts a four at its floor on ' + t + ' (Q2 retired with the window)');
      if (four({ fourTier: t, fourOffset: 'top' }, 'top', 'four-xp', 'FAIL').length) bad.push('a four at a band top on ' + t + ' was graded (designer 11-13: a report line)');
      if (!four({ fourTier: t, fourOffset: 'top' }, 'top', 'four-xp-report', 'OFF').length) bad.push('a four under the hero alone at a band top on ' + t + ' was not reported');
    }
    const normalFour = gradeCells(synthSet({ four: true, fourTier: 'normal' }), RS, flat).verdicts.filter((v) => v.verdict === 'FAIL');
    if (normalFour.length) bad.push('a four under the hero alone on Normal FAILS ' + normalFour.map((v) => v.rule).join(', ') + ' (11-16: Normal is not tuned for parties)');
    if (!feelVerdicts(synthSet({ four: true })).some((v) => v.rule === 'feel-seat-below-solo' && v.key.includes('/ deadly / floor /'))) bad.push('a Deadly seat under the hero alone was not felt');
    if (feelVerdicts(synthSet({ four: true, fourTier: 'normal' })).some((v) => v.rule === 'feel-seat-below-solo')) bad.push('a Normal seat under the hero alone was felt (11-16: Normal is not tuned for parties)');
    const pace = (x, lv, rule, verdict) => gradeCells(synthSet({ fourPace: x, fourPaceLevel: lv }), RS, flat).verdicts.filter((v) => v.rule === rule && v.verdict === verdict && v.key.includes('/ deadly / floor /'));
    if (!pace(P.deadlyFourVsContractMax * 1.04, null, 'four-deadly-pace', 'FAIL').length) bad.push('a Deadly four past ' + P.deadlyFourVsContractMax + 'x the contract did not FAIL four-deadly-pace');
    if (pace(P.deadlyFourVsContractMax * 0.96, null, 'four-deadly-pace', 'FAIL').length) bad.push('a Deadly four under ' + P.deadlyFourVsContractMax + 'x the contract FAILED four-deadly-pace');
    if (!pace(P.deadlyFourVsContractMax * 1.04, P.paceFromLevel - 1, 'four-deadly-pace', 'OFF').length) bad.push('a Deadly four under Level ' + P.paceFromLevel + ' past the ceiling was not a report (OFF)');
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
    /* THE UNIQUES KIT (uniques-proof.mjs): a staged unique's armor and attribute reach the live settle's member, and each planted defect is caught */
    const gearLib = await loadGear(ROOT);
    const proof = proveUniques(gearLib);
    if (proof.length) bad.push('the uniques kit: ' + proof.join('; '));
    for (const m of UNIQUES_MUTANTS) if (!proveUniques(gearLib, m).length) bad.push('uniques mutant ' + m + ' was not caught');
    if (bad.length) { console.error('grade --selftest RED: ' + bad.join(' | ')); process.exit(1); }
    console.log('grade --selftest: the good set passes, 6 mutants each FAIL their rule, the party lines bind Dangerous and Deadly (a four under the hero alone, a Deadly four past the contract ceiling) and never Normal, the needs-a-Healer scope holds, 2 gold mutants fail nothing and move the printed gold report, a profit rule is refused; '
      + 'a unique\'s armor and attribute reach the engine, ' + UNIQUES_MUTANTS.length + ' of ' + UNIQUES_MUTANTS.length + ' uniques mutants caught');
    process.exit(0);
  }
  const mode = arg('mode', 'quick');
  if (!OFFSETS[mode]) { console.error('grade: --mode quick|full'); process.exit(2); }
  const inDir = arg('in', null);
  const uniques = process.argv.includes('--uniques'), chest = uniques && process.argv.includes('--chest');
  const out = resolve(inDir || arg('out', join(HERE, 'out', 'grade-' + mode + (uniques ? '-uniques' : '') + (chest ? '-chest' : ''))));
  if (!inDir) {
    const whatIf = arg('what-if', null) ? JSON.parse(arg('what-if')) : null;
    const grounds = arg('grounds', null) ? arg('grounds').split(',') : null, tiers = arg('tiers', null) ? arg('tiers').split(',') : null;
    const openAlso = arg('open-also', null) ? arg('open-also').split(',') : null;
    const jobs = await buildGrid(ROOT, mode, { whatIf, grounds, tiers, openAlso, uniques, chest });
    if (process.argv.includes('--estimate')) { console.log('grade ' + mode + ': ' + jobs.length + ' cells, ' + jobs.reduce((s, j) => s + j.seeds * j.hours * j.party.length, 0) + ' hero-hours'); process.exit(0); }
    const { runPool } = await import('./pool.mjs');
    mkdirSync(out, { recursive: true });
    await runPool(jobs, join(out, 'cells.jsonl'), { root: ROOT, workers: Number(arg('workers', '4')), cpuMax: Number(arg('cpu', '85')) });
  }
  const cells = existsSync(join(out, 'cells.jsonl')) ? readFileSync(join(out, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const graded = gradeCells(cells, SHEET, await loadPace(ROOT), await fitsOf(ROOT), await packChecksOf(ROOT));
  const { isHealerTier } = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href);
  for (const v of feelVerdicts(cells, await fitsOf(ROOT), isHealerTier)) { graded.verdicts.push(v); const g = graded.grounds[v.ground] || (graded.grounds[v.ground] = { fail: 0, unproven: 0, off: 0, ok: 0 }); g[v.verdict === 'FAIL' ? 'fail' : 'unproven']++; }
  for (const v of await blowVerdicts(ROOT, SHEET, arg('grounds', null) ? arg('grounds').split(',') : null)) { graded.verdicts.push(v); const g = graded.grounds[v.ground] || (graded.grounds[v.ground] = { fail: 0, unproven: 0, off: 0, ok: 0 }); g[v.verdict === 'FAIL' ? 'fail' : 'ok']++; }
  const gold = goldRows(cells, await fitsOf(ROOT));
  /* WHAT THE UNIQUES CELLS WORE past the ladder (gear.mjs uniquesIn): each piece, its attribute and whether that reaches the engine */
  const worn = cells.some((c) => c.cell && c.cell.gear && c.cell.gear.uniques) ? wornReport(cells, await loadGear(ROOT)) : '';
  writeFileSync(join(out, 'grade.json'), JSON.stringify({ sheet: SHEET.source, cells: cells.length, ...graded, gold }, null, 1));
  console.log('GRADE (' + SHEET.source + '), ' + cells.length + ' cells from ' + out + '\n' + report(graded, Number(arg('limit', '60'))) + '\n\n' + goldReport(gold) + worn);
  process.exit(graded.verdicts.some((v) => v.verdict === 'FAIL') ? 1 : 0);
}
