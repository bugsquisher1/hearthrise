#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/grid.mjs — THE PROGRESSION GRID (balance program 50-standards.md section 5, the harness; Tyler 2026-11-21).
//
//   node tools/balance-program/grid.mjs [--workers N]           the FULL grid: 31 checkpoints x LOW / MID / BiS x parties 1-4 x every
//                                                               tier the ground offers, 2 seeds x 2 h a cell (the nightly sample), on the
//                                                               REAL engine; writes tools/balance-program/grid.json and prints the report
//   node tools/balance-program/grid.mjs --quick                 the release subset: the 12 guard checkpoints x 3 gear states x lone and
//                                                               four x Normal and the hardest tier, 2 seeds x 1 h; writes grid-quick.json
//   node tools/balance-program/grid.mjs --deaths [--third 0|1|2|all]  the death sample (50-standards 5.3 nightly deaths): a rotating third of the
//                                                               harder-tier cells at 4 seeds x 8 h (by the day of the year, or --third), merged
//                                                               into grid.json as each cell's `deaths`: the only run that judges S2, S6, S7 and
//                                                               what `holds` reads; the grid's own 2 x 2 h is too thin for a death rate (X26)
//   node tools/balance-program/grid.mjs --report [--quick]      NO PLAY: the cached grid judged against standards.mjs, one screen a band
//                                                               family, then the gap list's numbers, then the bands furthest out
//   node tools/balance-program/grid.mjs --kits <Level>          NO PLAY: what every way wears at that Level in LOW, MID and BiS, and why
//   node tools/balance-program/grid.mjs --selftest              plants out-of-band cells (one a band family) and gear-rule and data changes;
//                                                               each must turn its own band red / move its kit
//   --only 30,45   only those checkpoints (merged into the cache)  --resume   keep the cells already played in the run's .jsonl
//   --json <file>  the judged rows
//
// WHAT IT IS. Every number comes from the real engine (tools/balance-sim/worker.mjs -> cell.mjs runCell -> the hr-accrue settle ->
// src/core/combat-sim.js) or the game's data. The kits are grid-kit.mjs's rules on src/data (no hand-typed kit), the grounds are the
// game's own advice (src/shell/hunt-list.js recommendedHunt; the staged grounds added to its rows from 110 to 185), past 185 the
// placeholder grounds and projected gear line of grid-project.mjs (labelled PROJECTED). Each seed is its own job, so a cell carries its
// spread. The judging is grid-derive.mjs; the bands are standards.mjs.
//
// THE CACHE AND ITS REFRESH. grid.json is a committed snapshot stamped with the commit and a hash of every input the engine and the kits
// read (src/core, src/data, the hr-accrue settle, tools/balance-sim, this folder's kit and projector). `--report` and the balance guard
// say STALE when the tree's hash differs. REFRESH: re-run and commit it in the lane that moves a number a band reads, and whenever the guard
// prints STALE (a full run is about an hour of worker time; CI cannot commit it back, so no workflow refreshes it on its own yet).
//
// RUNTIME (50-standards 5.3 asks the build to measure it): see the `runtime` block grid.json carries (cells, worker-seconds, wall clock,
// workers) and this lane's report.
//
// Exit: 0 ran (report mode: an out-of-band band never fails a run) · 1 a --selftest plant not caught · 2 harness.
// mutant-anchors: none — --selftest plants on an in-memory copy of the cached grid and on a loaded kit builder; no tracked file is patched
// ci-step: economy-selftests | The progression grid's judge turns a planted out-of-band cell red, and its kits follow their rules and the data
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/grid.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { fork, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isMain } from '../../tests/_is-main.mjs';
import * as STD from './standards.mjs';
import { loadKits } from './grid-kit.mjs';
import { PROJECTED, projectedFloor, placeholderWhatIf, selfCheck } from './grid-project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const GRID_FILE = join(HERE, 'grid.json');
export const QUICK_FILE = join(HERE, 'grid-quick.json');
const WORKER = join(ROOT, 'tools', 'balance-sim', 'worker.mjs');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

/* THE TWO RUNS (50-standards 5.3). The full one is the nightly grid; the quick one the release guard's subset. */
export const RUNS = Object.freeze({
  full: Object.freeze({ id: 'full', checkpoints: STD.CHECKPOINTS, parties: [1, 2, 3, 4], tiers: 'all', seeds: 2, hours: 2, steps: true, file: GRID_FILE }),
  quick: Object.freeze({ id: 'quick', checkpoints: STD.GUARD_CHECKPOINTS, parties: [1, 4], tiers: 'normal+hardest', seeds: 2, hours: 1, steps: false, file: QUICK_FILE }),
  deaths: Object.freeze({ id: 'deaths', checkpoints: STD.CHECKPOINTS, parties: [1, 2, 3, 4], tiers: 'harder', seeds: 4, hours: 8, steps: false, file: GRID_FILE, rotate: 3 }),
});
/* The main skill of each way (measure.mjs MAIN) */
export const MAIN = Object.freeze({ hammer: 'melee', tank: 'melee', sword: 'melee', axes: 'melee', mage: 'magic', healer: 'magic', bow: 'ranged', crossbow: 'ranged' });
/* the share of supplies home-made (50-standards 1.3: a quarter from Level 30, held the same for every gear state) */
export const ownShareAt = (L) => (L >= STD.SUPPLY.ownFromLevel ? STD.SUPPLY.ownShare : 0);

/* ── the data the plan and the tables read (no engine) ─────────────────────────────────────────────────────────────────────────── */
export async function loadGridData(root = ROOT) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [G, H, TI, BS, MON, XP, HS, BL, SB, HL, PCX, SL, LB] = await Promise.all(['src/data/hunt-grounds.js', 'src/data/hunts.js', 'src/data/hunt-tiers.js',
    'src/data/balance-sheet.js', 'src/data/monsters.js', 'src/core/xp.js', 'src/data/hunt-sessions.js', 'src/data/blessings.js', 'src/data/supply-basics.js',
    'src/shell/hunt-list.js', 'src/data/party-class-xp.js', 'tools/balance-sim/skill-lines.mjs', 'src/data/loot-bands.js'].map(imp));
  const S = await imp('tools/gen-ground-stats.mjs');
  const floorOf = (g) => H.HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[0];
  const bandOfGround = (g) => H.HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band;
  const fitOf = (g) => S.groundFit(G.HUNT_GROUNDS[g]);
  /* the advice's rows with the staged grounds added (the Levels 110 to 185 a hero is sent to once they open), shaped as huntRows shapes them */
  const rowsOpen = HL.huntRows();
  const staged = Object.keys(G.HUNT_GROUNDS).filter((g) => !Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g));
  const rowsStaged = rowsOpen.concat(staged.map((g) => {
    const row = G.HUNT_GROUNDS[g], h = H.HUNT_INDEX[row.hunt];
    return { hunt: row.hunt, name: h.name, theme: h.theme || '', band: [...h.band], endsAt: null, groupFit: row.pockets.some((p) => p.forParty) ? 'party' : row.groupFit,
      soloFrom: Number.isInteger(row.soloFrom) ? row.soloFrom : null, partyBest: Object.fromEntries([2, 3, 4].map((n) => [n, PCX.partyBestLine(g, n)])), heroes: 4 };
  }));
  const lines = SL.loadLines(join(root, 'tools', 'balance-sim', 'skill-lines.json')) || SL.loadLines();
  const model = await imp('tools/balance-program/model.mjs'), measure = await imp('tools/balance-program/measure.mjs');
  return {
    model, accountCost: measure.accountCost,
    G, HUNT_INDEX: H.HUNT_INDEX, TI, BS, MONSTERS: MON.MONSTERS, XP, HS, BL, SB, lines, skillsAt: SL.skillsAt, REVEAL_BANDS: LB.REVEAL_BANDS,
    floorOf, bandOfGround, fitOf,
    /** the ground the game advises at Level L for a party of n (its own recommendation; the staged grounds join from 110; past 185 the placeholder) */
    groundAt(L, n) {
      const st = STD.stretchOf(L).state;
      if (st === 'PROJECTED') return PROJECTED.template;
      const row = HL.recommendedHunt(Array(n).fill(L), n, st === 'STAGED' ? rowsStaged : rowsOpen);
      if (!row) throw new Error('grid: the advice has no ground at Level ' + L + ' for ' + n);
      return G.groundOfHunt(row.hunt).id || row.hunt;
    },
    projectD: { MONSTERS: MON.MONSTERS, GROUND_ROSTER: BS.GROUND_ROSTER, formulaStats: BS.formulaStats, tierRowFor: BS.tierRowFor, tiersOf: TI.tiersOf, floorOf, fitOf },
  };
}

/* ── THE PLAN: every cell a run plays ──────────────────────────────────────────────────────────────────────────────────────────── */
const COMPS = Object.freeze({ 1: [['hammer', 'h']], 2: [['tank,mage', 'tm'], ['bow,healer', 'bh']], 3: [['tank,healer,mage', 'thm']], 4: [['tank,healer,bow,mage', 'thbm']] });
/** The seats of a party size (standards.mjs PARTIES; a Ranger is the bow): [[styles], comp id]. */
export function compsOf(size) {
  return COMPS[size].map(([s, id]) => [s.split(','), id]);
}
export const cellKey = (L, gear, party, comp, tier, step = null) => [L, gear, party + ':' + comp, tier].join('|') + (step ? '|' + step : '');

/** One cell's engine job (without the seed): ground, seats, kits, skills, rungs, tier, pull, the projected what-if. */
export function buildCell(D, K, { L, gear, styles, tier, ground, step = null }) {
  const size = styles.length, line = size > 1 ? 'party' : 'alone';
  const skills = styles.map((style) => {
    const lv = { ...D.skillsAt(D.lines, line, style, L) }, d = K.skillDeltaOf(gear, L), m = MAIN[style] || 'melee';
    for (const k of [m, 'defense']) lv[k] = Math.max(1, (lv[k] || 1) + d);
    return lv;
  });
  let plans = styles.map((style, i) => K.kitFor(L, gear, style, { ground, mainSkill: skills[i][MAIN[style] || 'melee'] }));
  /* E1's step cells: the MID set with ONE group from the LOW plan (the weapon, or the six armor slots), everything else MID's */
  if (step) plans = plans.map((p, i) => K.mixPlan(p, K.kitFor(L, 'low', styles[i], { ground, mainSkill: skills[i][MAIN[styles[i]] || 'melee'] }), step === 'step:weapon' ? ['weapon'] : ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']));
  const temper = {};
  for (const p of plans) for (const [k, n] of Object.entries(p.temper || {})) temper[k] = Math.max(temper[k] || 0, n);
  const projected = STD.stretchOf(L).state === 'PROJECTED';
  let whatIf = null, tierRow = null;
  if (projected) {
    const w = placeholderWhatIf(D.projectD, projectedFloor(L));
    const items = {};
    for (const p of plans) Object.assign(items, p.whatIfItems || {});
    whatIf = { monsters: w.monsters, tiers: w.tiers, ...(Object.keys(items).length ? { items } : {}) };
    tierRow = tier === 'normal' ? null : w.tiers[ground][tier];
  } else if (tier !== 'normal') tierRow = D.TI.tierRowOf(ground, tier);
  const pull = tierRow ? D.TI.pullOfTier(tierRow, size) : null;
  const cell = { ground, party: [...styles], level: L, profile: 'played', supply: 'store', skillsBySeat: skills, gearBySeat: plans.map((p) => p.gear),
    ...(Object.keys(temper).length ? { temper } : {}), ...(tier !== 'normal' ? { options: { tier } } : {}), ...(pull ? { density: pull } : {}) };
  return { cell, whatIf, plans };
}

export function planCells(D, K, run, only = null) {
  const jobs = [], cells = [];
  for (const L of run.checkpoints) {
    if (only && !only.includes(L)) continue;
    for (const size of run.parties) {
      if (size > 1 && L < (STD.PARTIES.find((p) => p.size === size).fromLevel || 1)) continue;
      const ground = D.groundAt(L, size);
      const offered = D.TI.tiersOf(ground);
      const tiers = run.tiers === 'all' ? offered : run.tiers === 'harder' ? offered.filter((t) => t !== 'normal') : ['normal', offered[offered.length - 1]].filter((t, i, a) => a.indexOf(t) === i);
      for (const gear of STD.GEAR_STATE_IDS) for (const tier of tiers) for (const [styles, comp] of compsOf(size)) {
        const key = cellKey(L, gear, size, comp, tier);
        const b = buildCell(D, K, { L, gear, styles, tier, ground });
        cells.push({ key, L, gear, party: size, comp, tier, ground, styles, stretch: STD.stretchOf(L).state, kits: b.plans.map(slimPlan) });
        for (let s = 0; s < run.seeds; s++) jobs.push({ id: key + '#' + s, key, whatIf: b.whatIf, cell: { ...b.cell, id: 'GRID:' + key, hours: run.hours, seeds: 1, seedBase: s } });
      }
    }
    /* E1's steps: the lone MID hero on Normal with one group a tier (a band) back */
    if (run.steps && L >= 15 && run.parties.includes(1)) for (const step of ['step:weapon', 'step:armor']) {
      const ground = D.groundAt(L, 1), key = cellKey(L, 'mid', 1, 'h', 'normal', step);
      const b = buildCell(D, K, { L, gear: 'mid', styles: ['hammer'], tier: 'normal', ground, step });
      cells.push({ key, L, gear: 'mid', party: 1, comp: 'h', tier: 'normal', ground, styles: ['hammer'], step, stretch: STD.stretchOf(L).state, kits: b.plans.map(slimPlan) });
      for (let s = 0; s < run.seeds; s++) jobs.push({ id: key + '#' + s, key, whatIf: b.whatIf, cell: { ...b.cell, id: 'GRID:' + key, hours: run.hours, seeds: 1, seedBase: s } });
    }
  }
  return { jobs, cells };
}
const slimPlan = (p) => ({ style: p.style, kit: p.kit, temper: p.temper, skillDelta: p.skillDelta, ...(p.projectedBand ? { band: p.projectedBand } : {}) });

/* ── THE POOL: worker.mjs processes, one engine each, across the CPU ───────────────────────────────────────────────────────────── */
export function playAll(jobs, workers, { log = () => {}, resumeFile = null } = {}) {
  const done = {};
  if (resumeFile && existsSync(resumeFile)) for (const line of readFileSync(resumeFile, 'utf8').split('\n')) { if (!line.trim()) continue; try { const r = JSON.parse(line); done[r.id] = r; } catch { /* a torn last line */ } }
  const cost = (j) => (j.cell.hours || 1) * (j.cell.party.length) * (j.cell.options ? 1.5 : 1);
  const queue = jobs.filter((j) => !done[j.id]).sort((a, b) => cost(b) - cost(a));
  const results = { ...done }, errors = [];
  if (!queue.length) return Promise.resolve({ results, errors, workerMs: 0 });
  const n = Math.max(1, Math.min(workers, queue.length));
  let workerMs = 0, k = 0;
  const total = queue.length, t0 = Date.now();
  return new Promise((finish) => {
    let alive = n;
    const feed = (w) => {
      const j = queue.shift();
      if (!j) { w.kill(); return; }
      w.job = j;
      w.send({ type: 'job', job: { ...j.cell, id: j.id, ...(j.whatIf ? { whatIf: j.whatIf } : {}) } });
    };
    for (let i = 0; i < n; i++) {
      const w = fork(WORKER, [ROOT], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(w); return; }
        k++;
        if (m.type === 'done') {
          const r = { id: m.id, ms: m.ms, result: slimResult(m.result) };
          results[m.id] = r; workerMs += m.ms;
          if (resumeFile) appendFileSync(resumeFile, JSON.stringify(r) + '\n');
        } else errors.push({ id: m.id, error: String(m.error).split('\n').slice(0, 3).join(' ') });
        const el = (Date.now() - t0) / 1000;
        log('[' + k + '/' + total + '] ' + m.id + ' ' + Math.round(m.ms / 100) / 10 + ' s, elapsed ' + Math.round(el) + ' s, eta ' + Math.round((el / k) * (total - k)) + ' s');
        w.job = null;
        feed(w);
      });
      w.on('exit', () => {
        if (w.job) { errors.push({ id: w.job.id, error: 'the worker exited mid-cell' }); w.job = null; }
        if (--alive === 0) { for (const j of queue.splice(0)) errors.push({ id: j.id, error: 'never ran: every worker exited' }); finish({ results, errors, workerMs }); }
      });
    }
  });
}
/* what a seed keeps of runCell's answer (the cell's own kit and bar are the plan's; not kept twice) */
function slimResult(r) {
  return { party: { hours: r.party.hours, killsPerH: r.party.killsPerH, killsByPerH: r.party.killsByPerH, ttkS: r.party.ttkS, pullsPerH: r.party.pullsPerH },
    heroes: r.heroes.map((h) => ({ style: h.style, level: h.level, hours: h.hours, raw: h.raw, takenPerH: h.takenPerH, healInPerH: h.healInPerH.total, deaths: h.deaths,
      encMinHpPct: h.encMinHpPct, buysPerH: h.buysPerH, skillXpPerH: h.skillXpPerH, ended: h.ended, maxHp: h.maxHp, kit: h.kit })) };
}

/* ── ONE CELL'S RATES, a head and an hour, over its seeds ──────────────────────────────────────────────────────────────────────── */
/** Every number a band reads, from a cell's seed results (exported: the sibling lane's paths.mjs reads a cell's rates this way). */
export function cellRates(D, meta, seeds) {
  const L = meta.L, size = meta.styles.length;
  const heroHours = seeds.reduce((s, r) => s + r.heroes.reduce((a, h) => a + h.hours, 0), 0) || 1e-9;
  const partyHours = seeds.reduce((s, r) => s + r.party.hours, 0) || 1e-9;
  const sum = (f) => seeds.reduce((s, r) => s + r.heroes.reduce((a, h) => a + f(h), 0), 0);
  const gross = sum((h) => h.raw.levelXp), lost = sum((h) => h.raw.xpLostLevel), income = sum((h) => h.raw.income), store = sum((h) => h.raw.store);
  const own = ownShareAt(L);
  const main = sum((h) => h.raw.skillXp[MAIN[h.style] || 'melee'] || 0);
  const kills = seeds.reduce((s, r) => s + r.party.killsPerH * r.party.hours, 0);
  const killsBy = {};
  for (const r of seeds) for (const [m, n] of Object.entries(r.party.killsByPerH || {})) killsBy[m] = (killsBy[m] || 0) + n * r.party.hours;
  /* reveal rows (loot-bands.js REVEAL_BANDS: rare, trophy) by formula: each monster's measured kills x its rows' chance */
  let reveals = 0;
  const byRow = {};
  for (const [m, n] of Object.entries(killsBy)) for (const d of (D.MONSTERS[m] || {}).drops || []) if (D.REVEAL_BANDS.includes(d.band)) { reveals += n * (d.ch || 0); byRow[d.id] = (byRow[d.id] || 0) + n * (d.ch || 0); }
  /* the ground's rarest reveal row, hunted hours a hero (the Very Rare of staged/luck.js is not built: this is the nearest thing the data has) */
  const rarest = Object.values(byRow).filter((x) => x > 0).reduce((m, x) => Math.min(m, x), Infinity);
  const supplies = {};
  for (const r of seeds) for (const h of r.heroes) for (const [id, n] of Object.entries(h.buysPerH || {})) {
    const kind = (D.SB.BASIC_SUPPLIES.find((b) => b.id === id) || {}).kind || 'other';
    supplies[kind] = (supplies[kind] || 0) + n * h.hours;
  }
  const perSeed = seeds.map((r) => r.heroes.reduce((a, h) => a + h.raw.levelXp, 0) / Math.max(1e-9, r.heroes.reduce((a, h) => a + h.hours, 0)));
  const mean = perSeed.reduce((a, b) => a + b, 0) / Math.max(1, perSeed.length);
  const seat = (i) => {
    const hs = seeds.map((r) => r.heroes[i]), hh = hs.reduce((a, h) => a + h.hours, 0) || 1e-9;
    const p50 = hs.map((h) => h.encMinHpPct.p50).filter((x) => x !== null), p10 = hs.map((h) => h.encMinHpPct.p10).filter((x) => x !== null);
    return { style: hs[0].style, levelXpPerH: Math.round(hs.reduce((a, h) => a + h.raw.levelXp, 0) / hh), takenPerH: Math.round(hs.reduce((a, h) => a + h.takenPerH * h.hours, 0) / hh),
      lowP50: p50.length ? p50.reduce((a, b) => a + b, 0) / p50.length : null, lowP10: p10.length ? Math.min(...p10) : null, deaths: hs.reduce((a, h) => a + h.deaths, 0), maxHp: hs[0].maxHp };
  };
  const seats = meta.styles.map((_, i) => seat(i));
  const lows = seats.map((s) => s.lowP50).filter((x) => x !== null), lows10 = seats.map((s) => s.lowP10).filter((x) => x !== null);
  const contract = D.BS.contractXpPerH(L);
  const ended = {};
  for (const r of seeds) for (const h of r.heroes) for (const [k, n] of Object.entries(h.ended || {})) ended[k] = (ended[k] || 0) + n;
  const r0 = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
  return {
    levelXpPerH: r0(gross / heroHours), netLevelXpPerH: r0((gross - lost) / heroHours), xContract: r0(gross / heroHours / contract, 3), contractXpPerH: r0(contract),
    mainSkillXpPerH: r0(main / heroHours), coinPerH: r0(sum((h) => h.raw.coin) / heroHours), incomePerH: r0(income / heroHours), storePerH: r0(store / heroHours),
    ownShare: own, netPerH: r0((income - store * (1 - own)) / heroHours), netADay: r0(((income - store * (1 - own)) / heroHours) * STD.CLOCK.huntHoursADay),
    storeShare: income > 0 ? r0((store * (1 - own)) / income, 3) : null, storeByKindPerH: Object.fromEntries(Object.entries(supplies).map(([k, n]) => [k, r0(n / heroHours, 1)])),
    takenPerH: r0(sum((h) => h.takenPerH * h.hours) / heroHours), healedPerH: r0(sum((h) => h.healInPerH * h.hours) / heroHours),
    lowHpTypical: lows.length ? r0(Math.max(0, Math.min(...lows)) / 100, 3) : null, lowHpP10: lows10.length ? r0(Math.max(0, Math.min(...lows10)) / 100, 3) : null,
    deaths: sum((h) => h.deaths), deathsPer1000h: r0((1000 * sum((h) => h.deaths)) / heroHours, 1), deathTax: gross > 0 ? r0(lost / gross, 4) : null,
    killsPerH: r0(kills / partyHours), revealsPerPartyH: r0(reveals / partyHours, 4), revealEveryHeroH: reveals > 0 ? r0((size * partyHours) / reveals, 1) : null,
    revealEveryPartyH: reveals > 0 ? r0(partyHours / reveals, 1) : null, rarestRevealEveryHeroH: Number.isFinite(rarest) ? r0((size * partyHours) / rarest, 1) : null, rarestRevealEveryPartyH: Number.isFinite(rarest) ? r0(partyHours / rarest, 1) : null, killsByPerH: Object.fromEntries(Object.entries(killsBy).map(([m, n]) => [m, r0(n / partyHours, 1)])),
    ended, seats, sample: { seeds: seeds.length, heroHours: r0(heroHours, 1), partyHours: r0(partyHours, 1), spread: mean > 0 && perSeed.length > 1 ? r0((Math.max(...perSeed) - Math.min(...perSeed)) / mean, 3) : null },
  };
}

/* ── THE INPUT HASH: a cache knows when the tree moved under it ────────────────────────────────────────────────────────────────── */
/* WHAT A CELL DEPENDS ON: the engine and the data, the cell runner and its kit, the kit builder, the projector and the bands' gear states, the
   advice; and of this file only the code that builds and measures a cell (its report, packing and CLI move no cell, so editing them leaves the
   cache fresh). Tracked files only (git ls-files), so a local run's output folders never read as a change. */
const HASHED = ['src/core', 'src/data', 'supabase/functions/hr-accrue', 'src/shell/hunt-list.js', 'tests/hunt-core/fixtures/play-ground.mjs', 'tools/lib/version-stamp.mjs', 'tools/gen-ground-stats.mjs',
  'tools/balance-sim/cell.mjs', 'tools/balance-sim/gear.mjs', 'tools/balance-sim/worker.mjs', 'tools/balance-sim/played.mjs', 'tools/balance-sim/skill-lines.mjs', 'tools/balance-sim/skill-lines.json',
  'tools/balance-sim/styles.mjs', 'tools/balance-sim/stats.mjs', 'tools/balance-sim/weapon-power.mjs', 'tools/balance-sim/armor-power.mjs', 'tools/balance-sim/career.mjs', 'tools/balance-sim/staged',
  'tools/balance-program/grid-kit.mjs', 'tools/balance-program/grid-project.mjs', 'tools/balance-program/standards.mjs'];
const cellCode = () => [buildCell, planCells, cellRates, compsOf, cellKey, ownShareAt, slimResult, slimPlan].map((f) => f.toString()).join('\n')
  + JSON.stringify([COMPS, MAIN, RUNS.full, RUNS.quick, STD.SUPPLY]);
export function inputHash(root = ROOT) {
  const h = createHash('sha256');
  let files;
  try { files = execFileSync('git', ['ls-files', '-z', '--', ...HASHED], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean).sort(); }
  catch { files = null; }
  if (!files || !files.length) {
    files = [];
    const walk = (p) => { const abs = join(root, p); if (!existsSync(abs)) return; if (statSync(abs).isDirectory()) { for (const f of readdirSync(abs).sort()) walk(p + '/' + f); return; } files.push(p); };
    for (const p of HASHED) walk(p);
    files.sort();
  }
  for (const p of files) { if (!/\.(m?js|json|ts)$/.test(p) || !existsSync(join(root, p))) continue; h.update(p + '\0'); h.update(readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')); h.update('\0'); }
  h.update(cellCode());
  return h.digest('hex').slice(0, 16);
}
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

/* ── the run ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function play(run) {
  const t0 = Date.now();
  const D = await loadGridData();
  const K = await loadKits(ROOT);
  const sc = selfCheck(D.projectD);
  if (sc.length) throw new Error('grid: the projector does not start where the template ends: ' + sc.join('; '));
  const only = arg('only') ? arg('only').split(',').map(Number) : null;
  let { jobs, cells } = planCells(D, K, run, only);
  /* the deaths run plays a rotating third (the day of the year, or --third): every harder-tier cell once in three nights */
  if (run.rotate) {
    const third = arg('third', String(Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86400000) % run.rotate));
    if (third !== 'all') { const keep = new Set(cells.filter((_, i) => i % run.rotate === Number(third)).map((c) => c.key)); cells = cells.filter((c) => keep.has(c.key)); jobs = jobs.filter((j) => keep.has(j.key)); }
    if (!existsSync(run.file)) throw new Error('grid --deaths: no grid.json to merge into: run the full grid first');
  }
  const workers = Number(arg('workers', Math.max(1, Math.min(16, availableParallelism() - 2))));
  const resumeFile = has('resume') ? run.file.replace(/\.json$/, '.jsonl') : null;
  console.error('grid ' + run.id + ': ' + cells.length + ' cells, ' + jobs.length + ' seed jobs (' + run.seeds + ' seeds x ' + run.hours + ' h), ' + workers + ' workers');
  const { results, errors, workerMs } = await playAll(jobs, workers, { log: process.stderr.isTTY ? (s) => process.stderr.write('\r  ' + s.slice(0, 110).padEnd(110)) : () => {}, resumeFile });
  if (process.stderr.isTTY) process.stderr.write('\n');
  const prev = (only || run.rotate) && existsSync(run.file) ? unpackGrid(JSON.parse(readFileSync(run.file, 'utf8'))) : null;
  if (run.rotate) {
    /* merged into the full grid's cells: each played cell gains `deaths`, the rest of the cache stands as it was */
    let n = 0;
    for (const c of cells) {
      const seeds = Array.from({ length: run.seeds }, (_, s) => results[c.key + '#' + s]).filter(Boolean).map((r) => r.result);
      if (seeds.length < run.seeds || !prev.cells[c.key]) continue;
      const r = cellRates(D, c, seeds);
      prev.cells[c.key].deaths = { deathsPer1000h: r.deathsPer1000h, deathTax: r.deathTax, netLevelXpPerH: r.netLevelXpPerH, lowHpTypical: r.lowHpTypical, netPerH: r.netPerH, sample: r.sample, ended: r.ended, at: new Date().toISOString().slice(0, 10) };
      n++;
    }
    prev.deathsRun = { at: new Date().toISOString().slice(0, 16) + 'Z', cells: n, seeds: run.seeds, hours: run.hours, wallS: Math.round((Date.now() - t0) / 1000), workerS: Math.round(workerMs / 1000), workers, errors: errors.length };
    writeFileSync(run.file, JSON.stringify(packGrid(prev)) + '\n');
    console.error('grid deaths: merged ' + n + ' cells into ' + relative(ROOT, run.file) + ' (' + prev.deathsRun.wallS + ' s wall, ' + prev.deathsRun.workerS + ' worker-s)');
    return { grid: prev, errors };
  }
  const out = { schema: 'hearthrise.balance-program.grid/1', run: run.id, commit: commitOf(), at: new Date().toISOString().slice(0, 16) + 'Z', inputHash: inputHash(),
    sample: { seeds: run.seeds, hours: run.hours }, refresh: 'by hand: re-run and commit in the lane that moves a number a band reads, and whenever the balance guard prints STALE (inputHash differs)',
    clock: existsSync(join(HERE, 'stamina-day.json')) ? JSON.parse(readFileSync(join(HERE, 'stamina-day.json'), 'utf8')) : null,
    runtime: { cells: cells.length, jobs: jobs.length, workers, wallS: Math.round((Date.now() - t0) / 1000), workerS: Math.round(workerMs / 1000), errors: errors.length },
    cells: prev ? { ...prev.cells } : {} };
  for (const c of cells) {
    const seeds = Array.from({ length: run.seeds }, (_, s) => results[c.key + '#' + s]).filter(Boolean).map((r) => r.result);
    if (seeds.length < run.seeds) { out.cells[c.key] = { ...c, error: (errors.find((e) => e.id.startsWith(c.key + '#')) || {}).error || 'a seed is missing' }; continue; }
    out.cells[c.key] = { ...c, label: STD.STRETCHES.find((s) => s.state === c.stretch).label, rates: cellRates(D, c, seeds) };
  }
  writeFileSync(run.file, JSON.stringify(packGrid(out)) + '\n');
  console.error('grid ' + run.id + ': wrote ' + relative(ROOT, run.file) + ' (' + Object.keys(out.cells).length + ' cells, ' + out.runtime.wallS + ' s wall, ' + out.runtime.workerS + ' worker-s, ' + errors.length + ' errors)');
  for (const e of errors.slice(0, 5)) console.error('  ERROR ' + e.id + ': ' + e.error);
  return { grid: out, errors };
}

/* THE CACHE'S SHAPE ON DISK: a cell is a row of CELL_FIELDS, its rates a row of RATE_FIELDS and each seat a row of SEAT_FIELDS (the names once,
   in the file's head), so the committed file stays small. The kits are not kept: they are a rule on the data, and grid-kit.mjs kitFor (or
   grid.mjs --kits) rebuilds any of them from the same tree (inputHash says which). readGrid answers the plain shape grid-derive.mjs reads. */
export const CELL_FIELDS = Object.freeze(['key', 'L', 'gear', 'party', 'comp', 'tier', 'ground', 'styles', 'stretch', 'label', 'step', 'error', 'deaths']);
export const RATE_FIELDS = Object.freeze(['levelXpPerH', 'netLevelXpPerH', 'xContract', 'contractXpPerH', 'mainSkillXpPerH', 'coinPerH', 'incomePerH', 'storePerH', 'ownShare', 'netPerH',
  'netADay', 'storeShare', 'storeByKindPerH', 'takenPerH', 'healedPerH', 'lowHpTypical', 'lowHpP10', 'deaths', 'deathsPer1000h', 'deathTax', 'killsPerH', 'revealsPerPartyH',
  'revealEveryHeroH', 'revealEveryPartyH', 'rarestRevealEveryHeroH', 'rarestRevealEveryPartyH', 'killsByPerH', 'ended', 'seats', 'sample']);
export const SEAT_FIELDS = Object.freeze(['style', 'levelXpPerH', 'takenPerH', 'lowP50', 'lowP10', 'deaths', 'maxHp']);
const row = (o, fields) => fields.map((f) => (o[f] === undefined ? null : o[f]));
const obj = (r, fields) => Object.fromEntries(fields.map((f, i) => [f, r[i]]).filter(([, v]) => v !== null));
export function packGrid(g) {
  const cells = Object.values(g.cells).map((c) => [row(c, CELL_FIELDS), c.rates ? row({ ...c.rates, seats: c.rates.seats.map((x) => row({ ...x, lowP50: x.lowP50 === null ? null : Math.round(x.lowP50 * 10) / 10 }, SEAT_FIELDS)) }, RATE_FIELDS) : null]);
  return { ...g, packed: 2, cellFields: CELL_FIELDS, rateFields: RATE_FIELDS, seatFields: SEAT_FIELDS, cells };
}
export function unpackGrid(g) {
  if (!g || g.packed !== 2) return g;
  const cells = {};
  for (const [cr, rr] of g.cells) {
    const c = obj(cr, g.cellFields);
    if (rr) { const r = obj(rr, g.rateFields); r.seats = (r.seats || []).map((s) => obj(s, g.seatFields)); c.rates = r; }
    cells[c.key] = c;
  }
  const { cellFields, rateFields, seatFields, packed, ...rest } = g;
  void cellFields; void rateFields; void seatFields; void packed;
  return { ...rest, cells };
}
/** The cached grid (full by default), or null, in the plain shape. */
export function readGrid(quick = false) {
  const f = quick ? QUICK_FILE : GRID_FILE;
  return existsSync(f) ? unpackGrid(JSON.parse(readFileSync(f, 'utf8'))) : null;
}

async function kits(L) {
  const D = await loadGridData();
  const K = await loadKits(ROOT);
  console.log('KITS at Level ' + L + ' (' + STD.stretchOf(L).label + '), on the ground the advice sends a lone hero to: ' + D.groundAt(L, 1));
  for (const style of Object.keys(MAIN)) for (const gear of STD.GEAR_STATE_IDS) {
    const lv = D.skillsAt(D.lines, 'alone', style, L);
    const p = K.kitFor(L, gear, style, { ground: D.groundAt(L, 1), mainSkill: lv[MAIN[style]] + K.skillDeltaOf(gear, L) });
    console.log('\n' + style + ' ' + gear.toUpperCase() + ' (skills ' + (p.skillDelta >= 0 ? '+' : '') + p.skillDelta + ' on the career line; rungs ' + JSON.stringify(p.temper || {}) + ')');
    for (const [slot, id] of Object.entries(p.kit)) console.log('  ' + slot.padEnd(9) + id.padEnd(30) + p.why[slot]);
    if (p.temperShut.length) console.log('  no rung: ' + p.temperShut.join('; '));
    if (p.projectedAdds.length) console.log('  ruled, not built (never played): ' + p.projectedAdds.map((a) => a.id + (a.budgetXp ? ' +' + Math.round(a.budgetXp * 100) + '% XP' : '')).join(', '));
  }
}

async function main() {
  const quick = has('quick');
  const DER = await import(u('tools/balance-program/grid-derive.mjs'));
  if (has('selftest')) return DER.selftest({ ROOT, loadGridData, loadKits, readGrid, quick });
  if (arg('kits')) { await kits(Number(arg('kits'))); return 0; }
  let grid;
  if (has('report')) {
    grid = readGrid(quick);
    if (!grid) { console.error('grid: no cached ' + (quick ? 'grid-quick.json' : 'grid.json') + ': run node tools/balance-program/grid.mjs' + (quick ? ' --quick' : '')); return 2; }
  } else {
    const r = await play(has('deaths') ? RUNS.deaths : quick ? RUNS.quick : RUNS.full);
    grid = r.grid;
  }
  const D = await loadGridData();
  const K = await loadKits(ROOT);
  const judged = DER.judgeGrid(D, grid, { currentHash: inputHash(), K });
  DER.printReport(grid, judged);
  if (arg('json')) {
    const T = judged.T;
    const days = Object.fromEntries(Object.keys(T.SEATS).map((k) => [k, Object.fromEntries(T.DOORS.map(([L]) => [L, T.dayAt(k, L)]))]));
    writeFileSync(resolve(arg('json')), JSON.stringify({ grid: judged.grid, stale: judged.stale, bands: DER.bandSummary(judged), rows: judged.rows, daysToDoors: days, deathWatch: T.watch, gear: T.gearRows, cost: T.cost }, null, 1));
  }
  return 0;
}

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
