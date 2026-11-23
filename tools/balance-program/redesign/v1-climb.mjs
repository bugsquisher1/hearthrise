#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/v1-climb.mjs — THE ROADMAP'S PROBE V1, ON THE REAL ENGINE (lane/v1-climb, 2026-11-21).
//
//   node tools/balance-program/redesign/v1-climb.mjs [--seeds 8] [--hours 12] [--workers 8] [--json <file>] [--only id,id] [--gear low|mid|bis]
//
// docs/design/redesign/05-roadmap.md stage 4, V1 "the climb": a four settles at a step, a small change in power moves that step, and a fall
// back comes before a wipe on Careful and Steady. Every number is read off the engine's own `danger` events (src/core/hunt/danger.js: one
// per pull, its step, the next step, its lowest HP and why), played through the settle the world tick runs (tools/balance-sim/worker.mjs ->
// cell.mjs runCell -> hr-accrue accrueHunt -> src/core/combat-sim.js), each seed a full hunting day, one hunt, the real death rule.
//
// THE CELLS: the matrix's standard mixed four (hammer, bow, mage, healer: progression-grid.mjs buildCell, MID kits, played bars, real
// shopping) on one party ground, each stance, at:
//   base     Level L
//   levels   Level L + 3 (a few Levels: the small power change up)
//   weapon   Level L, every seat's weapon one gear band back (E1's step cell: the small power change down)
//   high     Level L2 (a second Level on the same ground)
//   above    Steady at Level L, starting far over where base settles (does it settle from above too)
// Every hunt starts at step 0 (the ground as built) unless named, so the first hours are the climb; the HELD STEP is read over the settle
// window (from --settle hours to the end), time-weighted, per seed.
//
// Exit 0 ran (a verdict is printed, never an exit code) · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 8)), HOURS = Number(arg('hours', 12)), WORKERS = Number(arg('workers', 8)), SETTLE_H = Number(arg('settle', 4));
const GROUND = arg('ground', 'muster_barrows'), L = Number(arg('level', 60)), L2 = Number(arg('level2', 70)), ABOVE = Number(arg('above', 680));
const ONLY = arg('only') ? arg('only').split(',') : null;
/* --gear low|mid|bis (lane/r10): every cell's kit state (grid-kit.mjs), MID by default. A ground's band reads LOW at its entry Level (a fresh
   company) and BIS at its top Level (a strong four): tools/balance-program/redesign/r10 */
const KIT = arg('gear', 'mid');
/* --styles a,b,c,d (lane/w2-roles-rows): the four's styles, seat by seat (progression-grid.mjs MAIN), in place of the matrix's mixed four */
const STYLES = arg('styles') ? arg('styles').split(',') : ['hammer', 'bow', 'mage', 'healer'];
const RISKS = arg('risks') ? arg('risks').split(',') : ['careful', 'steady', 'bold'];

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { DANGER, CLIMB, RISKS: RISK_ROWS } = await imp('src/data/danger.js');
const D = await loadGridData(ROOT), K = await loadKits(ROOT);
/* THE PAY FROM A HELD START (lane/r4, 2026-11-22): each hero's Level XP an hour read only from --pay-from hours (default the settle hour)
   to the end of the four, as a multiple of the hours table at the Level it stood at mid-window (danger.js hoursForLevel), so the opening
   climb never counts. Off the danger log's clock: cell.mjs `trace` keeps Level XP and paid hours a window */
const { hoursForLevel } = await imp('src/core/hunt/danger.js');
const { BASIC_INDEX: BASICS } = await imp('src/data/supply-basics.js');
const { charXpForLevel, charLevelFromXp } = await imp('src/core/xp.js');
const PAY_FROM_H = Number(arg('pay-from', SETTLE_H));
/* --candidate <id> (lane/r4): play a Lab candidate (tools/balance-program/candidates/<id>.json) on its scratch copy in place of the tree;
   the cells are built from the tree (the same kits), the engine is the candidate's */
const CAND = arg('candidate');
const TREE = CAND ? await (async () => { const C = await imp('tools/balance-program/candidates.mjs'); return C.treeOf(C.readCandidate(CAND)); })() : { root: ROOT, done: () => {} };
const tableRate = (lv) => (charXpForLevel(lv + 1) - charXpForLevel(lv)) / hoursForLevel(lv);

/* ── the plan ── */
const variants = [
  { id: 'base', L, risks: RISKS },
  { id: 'levels', L: L + 3, risks: RISKS },
  { id: 'weapon', L, step: 'step:weapon', risks: RISKS },
  /* lane/r4: every armor piece one gear band back (with `weapon`, the two halves of one gear tier) */
  { id: 'armor', L, step: 'step:armor', risks: RISKS },
  { id: 'high', L: L2, risks: RISKS },
  { id: 'above', L, risks: ['steady'], start: ABOVE },
];
/* --start-from <report.json> [--margin 20]: each cell starts at the step that report's same cell held, less the margin (a company coming back
   to the step it held before: V2's watched session), in place of step 0 */
const FROM = arg('start-from') ? JSON.parse((await import('node:fs')).readFileSync(arg('start-from'), 'utf8')) : null, MARGIN = Number(arg('margin', 20));
const startOf = (id, v) => (FROM && FROM.cells[id] && Number.isFinite(FROM.cells[id].held.mean) ? Math.max(0, Math.round(FROM.cells[id].held.mean) - MARGIN) : v.start || 0);
const jobs = [], cells = [];
for (const v of variants) for (const risk of v.risks) {
  const id = v.id + ':' + risk;
  if (ONLY && !ONLY.includes(v.id) && !ONLY.includes(id)) continue;
  const b = buildCell(D, K, { L: v.L, gear: KIT, styles: STYLES, tier: 'normal', ground: GROUND, ...(v.step ? { step: v.step } : {}) });
  const start = startOf(id, v);
  const cell = { ...b.cell, options: { risk, danger: start }, hours: HOURS, seeds: 1, trace: true };
  cells.push({ id, variant: v.id, risk, L: v.L, start });
  for (let s = 0; s < SEEDS; s++) jobs.push({ id: id + '#' + s, cell: id, job: { ...cell, id: 'V1:' + id + '#' + s, seedBase: 1000 + s } });
}

/* ── the pool: tools/balance-sim/worker.mjs, one engine a process, the whole runCell answer kept ── */
function playAll(list, n) {
  const queue = list.slice(), out = {}, errors = [];
  const t0 = Date.now();
  let done = 0;
  return new Promise((finish) => {
    let alive = Math.max(1, Math.min(n, queue.length));
    const total = queue.length;
    for (let i = 0, k = alive; i < k; i++) {
      const w = fork(join(ROOT, 'tools', 'balance-sim', 'worker.mjs'), [TREE.root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const feed = () => { const j = queue.shift(); if (!j) { w.kill(); return; } w.cur = j; w.send({ type: 'job', job: j.job }); };
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(); return; }
        if (m.type === 'done') out[w.cur.id] = { ms: m.ms, result: m.result }; else errors.push({ id: w.cur.id, error: String(m.error).split('\n').slice(0, 4).join(' ') });
        done++;
        process.stderr.write('[' + done + '/' + total + '] ' + w.cur.id + ' ' + Math.round(m.ms / 1000) + ' s, ' + Math.round((Date.now() - t0) / 1000) + ' s elapsed\n');
        w.cur = null; feed();
      });
      w.on('exit', () => { if (w.cur) errors.push({ id: w.cur.id, error: 'worker exited' }); if (--alive === 0) finish({ out, errors }); });
    }
  });
}

/* ── one seed's reading ── */
const H = 3600000;
function readSeed(res, start) {
  const log = (res.party.danger || []).map(([, ms, step, to, low, why]) => ({ ms, step, to, low, why }));
  const huntedMs = Math.round(res.party.hours * H);
  /* THE FOUR'S STEP: read only while all four hunt, to the end of the pull in which the first hero died (a three is another party) */
  const firstDeath = log.find((e) => e.low <= 0);
  const endMs = firstDeath ? firstDeath.ms : Math.max(huntedMs, log.length ? log[log.length - 1].ms : 0);
  /* the step in force over time: the start, then each pull's `to` from its end */
  const spans = [];
  let at = 0, cur = start;
  for (const e of log) { if (e.ms >= endMs) break; if (e.ms > at) spans.push([at, e.ms, cur]); at = e.ms; cur = e.to; }
  if (endMs > at) spans.push([at, endMs, cur]);
  const from = SETTLE_H * H;
  const timeAt = new Map();
  let wsum = 0, wt = 0;
  const halves = [[from, from + (HOURS * H - from) / 2], [from + (HOURS * H - from) / 2, HOURS * H]].map(() => ({ s: 0, t: 0 }));
  for (const [a, b, s] of spans) {
    const lo = Math.max(a, from), hi = b;
    if (hi <= lo) continue;
    timeAt.set(s, (timeAt.get(s) || 0) + (hi - lo));
    wsum += s * (hi - lo); wt += hi - lo;
    const mid = from + (HOURS * H - from) / 2;
    const h1 = [Math.max(lo, from), Math.min(hi, mid)], h2 = [Math.max(lo, mid), hi];
    if (h1[1] > h1[0]) { halves[0].s += s * (h1[1] - h1[0]); halves[0].t += h1[1] - h1[0]; }
    if (h2[1] > h2[0]) { halves[1].s += s * (h2[1] - h2[0]); halves[1].t += h2[1] - h2[0]; }
  }
  const settled = log.filter((e) => e.ms >= from && e.ms < endMs);
  const changes = settled.filter((e) => e.to !== e.step).length;
  /* near-wipes: a pull where a hero fell under 10% of its HP or died; "warned": a fall back in the three pulls before it */
  const near = [];
  log.forEach((e, i) => {
    if (e.low >= 100) return;
    const prior = log.slice(Math.max(0, i - 3), i);
    near.push({ i, ms: e.ms, death: e.low <= 0, warned: prior.some((p) => p.why === 'fall' || p.why === 'death'), fellAfter: e.why === 'fall' || e.why === 'death' });
  });
  const deaths = res.heroes.reduce((a, h) => a + h.deaths, 0);
  const wipe = res.heroes.every((h) => h.ended && h.ended.died);
  /* the held pay: per hero, the trace from PAY_FROM_H to the four's end; the seed's figure is the heroes' mean multiple */
  const payEnd = Math.min(endMs, HOURS * H), payFrom = PAY_FROM_H * H;
  const atT = (tr, t) => { let last = [0, 0, 0]; for (const e of tr) { if (e[0] > t) break; last = e; } return last; };
  const pays = payEnd > payFrom ? res.heroes.map((h) => {
    const tr = h.xpTrace || [], a = atT(tr, payFrom), b = atT(tr, payEnd), hrs = b[2] - a[2];
    if (!(hrs > 0)) return null;
    const mid = charLevelFromXp(charXpForLevel(h.level) + (a[1] + b[1]) / 2);
    return (b[1] - a[1]) / hrs / tableRate(mid);
  }).filter((x) => x !== null) : [];
  const firstNear = (target) => { const e = log.find((x) => x.to >= target); return e ? e.ms / H : null; };
  /* THE GOLD AN HOUR (lane/w-wage, 2026-11-22): coin, coin plus loot at the store's price (no Rares), and the store bill, a hunted
     hero-hour over the whole hunt (src/core/wage.js is calibrated on these; a held start keeps the opening climb short) */
  const heroH = res.heroes.reduce((a, h) => a + (h.hours || 0), 0);
  const perHeroH = (k) => (heroH > 0 ? res.heroes.reduce((a, h) => a + ((h.raw && h.raw[k]) || 0), 0) / heroH : null);
  /* the loot by band (src/data/loot-bands.js) at the store's price, a hunted hero-hour (cell.mjs lootPerH, weighted by each hero's hours) */
  const bandPerHeroH = (b) => (heroH > 0 ? res.heroes.reduce((a, h) => a + ((h.lootPerH && h.lootPerH[b]) || 0) * (h.hours || 0), 0) / heroH : null);
  /* THE KIT BY LINE (lane/econ-levers, 2026-11-22): the store bill a hunted hero-hour by what it bought (supply-basics.js kind: a heal is
     a meal, a mana row a drink, a rune row a charge, an arrow or bolt a shot), from each hero's buys at the catalogue's price */
  const kit = {}, kitIds = {};
  for (const h of res.heroes) for (const [id, n] of Object.entries(h.buysPerH || {})) {
    const b = BASICS[id] || {}, line = b.kind === 'heal' ? 'meal' : b.kind === 'mana' ? 'drink' : /_rune$/.test(id) ? 'charge' : 'shot';
    kit[line] = (kit[line] || 0) + (heroH > 0 ? (n * (h.hours || 0) * (b.price || 0)) / heroH : 0);
    kitIds[id] = (kitIds[id] || 0) + (heroH > 0 ? (n * (h.hours || 0)) / heroH : 0);
  }
  return {
    kit, kitIds,
    coinPerHeroH: perHeroH('coin'), incomePerHeroH: perHeroH('income'), storePerHeroH: perHeroH('store'),
    commonPerHeroH: bandPerHeroH('common'), uncommonPerHeroH: bandPerHeroH('uncommon'), scarcePerHeroH: bandPerHeroH('scarce'), otherPerHeroH: bandPerHeroH('other'),
    held: wt ? wsum / wt : null, halves: halves.map((x) => (x.t ? x.s / x.t : null)), timeAt, wt,
    changesPerH: wt ? changes / (wt / H) : null, pulls: log.length, settledPulls: settled.length,
    whys: log.reduce((o, e) => ((o[e.why] = (o[e.why] || 0) + 1), o), {}),
    fallsPerH: wt ? settled.filter((e) => e.why === 'fall' || e.why === 'death').length / (wt / H) : null,
    near, deaths, wipe, huntedH: res.party.hours, max: Math.max(start, ...log.map((e) => e.to)),
    reach: firstNear, xpPerH: res.party.levelXpPerHeroPerH, killsPerH: res.party.killsPerH, pullsPerH: res.party.pullsPerH,
    payX: pays.length ? pays.reduce((s, x) => s + x, 0) / pays.length : null, payH: Math.max(0, payEnd - payFrom) / H,
    heroesLost: res.heroes.filter((h) => h.deaths > 0).length, fourH: wt / H, firstDeathH: firstDeath ? firstDeath.ms / H : null,
    /* lane/w2-roles-rows: each seat's share of the damage the four took over the hunt (cell.mjs takenPerH x hours), seat order */
    takenShare: (() => { const t = res.heroes.map((h) => (h.takenPerH || 0) * (h.hours || 0)), s = t.reduce((a, b) => a + b, 0); return s > 0 ? t.map((x) => x / s) : null; })(),
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0; };
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const r0 = (x) => (x === null || x === undefined ? null : Math.round(x));

const t0 = Date.now();
process.stderr.write('V1: ' + jobs.length + ' seed jobs (' + cells.length + ' cells x ' + SEEDS + ' seeds x ' + HOURS + ' h) on ' + WORKERS + ' workers; ' + GROUND + ', Levels ' + L + ' / ' + (L + 3) + ' / ' + L2 + '\n');
const { out, errors } = await playAll(jobs, WORKERS);
if (errors.length) { console.error('V1 harness errors:\n' + errors.map((e) => '  ' + e.id + ': ' + e.error).join('\n')); }

const report = { ground: GROUND, levels: [L, L + 3, L2], seeds: SEEDS, hours: HOURS, settleFromH: SETTLE_H, levers: { DANGER, CLIMB, RISKS: RISK_ROWS }, cells: {}, wallS: 0, candidate: CAND || 'C0' };
TREE.done();
for (const c of cells) {
  const seeds = [];
  for (let s = 0; s < SEEDS; s++) { const o = out[c.id + '#' + s]; if (o) seeds.push({ s, ...readSeed(o.result, c.start) }); }
  const held = seeds.map((x) => x.held).filter((x) => x !== null);
  /* the share of settled time within 10 and 20 steps of each seed's own held step: how tight it sits */
  const within = (w) => mean(seeds.map((x) => { let t = 0; for (const [s, ms] of x.timeAt) if (Math.abs(s - x.held) <= w) t += ms; return x.wt ? t / x.wt : 0; }));
  const near = seeds.flatMap((x) => x.near);
  report.cells[c.id] = {
    ...c, seedsRead: seeds.length,
    /* perSeed keeps a seed's place (null: no settled four-hour of its own), so the power moves below pair the same dice */
    payX: (() => { const p = seeds.map((x) => x.payX).filter((x) => x !== null); return { mean: p.length ? Math.round(mean(p) * 100) / 100 : null, sd: Math.round(sd(p) * 100) / 100, n: p.length, perSeed: p.map((x) => Math.round(x * 100) / 100), fromH: PAY_FROM_H, windowH: r1(mean(seeds.map((x) => x.payH))) }; })(),
    held: { mean: r1(mean(held)), sd: r1(sd(held)), se: r1(sd(held) / Math.sqrt(Math.max(1, held.length))), perSeed: seeds.map((x) => (x.held === null ? null : r0(x.held))) },
    drift: r1(mean(seeds.map((x) => (x.halves[1] !== null && x.halves[0] !== null ? x.halves[1] - x.halves[0] : 0)))),
    within10: r1(100 * within(10)), within20: r1(100 * within(20)),
    changesPerH: r1(mean(seeds.map((x) => x.changesPerH || 0))), fallsPerH: r1(mean(seeds.map((x) => x.fallsPerH || 0))),
    reachH: r1(mean(seeds.map((x) => x.reach(Math.max(0, (x.held || 0) - 20))).filter((x) => x !== null))),
    pullsPerH: r1(mean(seeds.map((x) => x.pullsPerH))), killsPerH: r0(mean(seeds.map((x) => x.killsPerH))), xpPerHeroH: r0(mean(seeds.map((x) => x.xpPerH))),
    gold: Object.fromEntries(['coinPerHeroH', 'incomePerHeroH', 'storePerHeroH', 'commonPerHeroH', 'uncommonPerHeroH', 'scarcePerHeroH', 'otherPerHeroH'].map((k) => {
      const v = seeds.map((x) => x[k]).filter((x) => x !== null);
      return [k, { mean: r0(mean(v)), sd: r0(sd(v)), n: v.length }];
    })),
    kit: ['meal', 'drink', 'charge', 'shot'].reduce((o, k) => ((o[k] = r0(mean(seeds.map((x) => x.kit[k] || 0)))), o), {}),
    /* uses a hunted hero-hour of each store row */
    kitIds: (() => { const o = {}; for (const x of seeds) for (const [id, n] of Object.entries(x.kitIds)) o[id] = (o[id] || 0) + n / seeds.length; return Object.fromEntries(Object.entries(o).map(([k, n]) => [k, r1(n)])); })(),
    deaths: seeds.reduce((a, x) => a + x.deaths, 0), wipes: seeds.filter((x) => x.wipe).length, seedsWithADeath: seeds.filter((x) => x.deaths > 0).length,
    huntedH: r1(mean(seeds.map((x) => x.huntedH))), fourH: r1(mean(seeds.map((x) => x.fourH))),
    firstDeathH: seeds.map((x) => r1(x.firstDeathH)).filter((x) => x !== null),
    nearWipes: near.length, nearWithDeath: near.filter((x) => x.death).length, nearWarned: near.filter((x) => x.warned).length,
    nearFellAfter: near.filter((x) => x.fellAfter).length,
    whys: seeds.reduce((o, x) => { for (const [k, n] of Object.entries(x.whys)) o[k] = (o[k] || 0) + n; return o; }, {}),
    takenShare: STYLES.map((s, i) => { const v = seeds.map((x) => x.takenShare && x.takenShare[i]).filter((x) => Number.isFinite(x)); return { style: s, mean: v.length ? Math.round(mean(v) * 1000) / 1000 : null }; }),
  };
}
/* the power changes, seed by seed on the same dice (paired): the held step's move */
const paired = (a, b) => {
  const A = report.cells[a], B = report.cells[b];
  if (!A || !B) return null;
  const d = A.held.perSeed.map((x, i) => (B.held.perSeed[i] !== undefined && x !== null && B.held.perSeed[i] !== null ? B.held.perSeed[i] - x : null)).filter((x) => x !== null);
  return { from: a, to: b, mean: r1(mean(d)), sd: r1(sd(d)), se: r1(sd(d) / Math.sqrt(Math.max(1, d.length))), n: d.length };
};
report.moves = {};
for (const risk of RISKS) {
  report.moves['levels:' + risk] = paired('base:' + risk, 'levels:' + risk);
  report.moves['weapon:' + risk] = paired('base:' + risk, 'weapon:' + risk);
  report.moves['armor:' + risk] = paired('base:' + risk, 'armor:' + risk);
  report.moves['high:' + risk] = paired('base:' + risk, 'high:' + risk);
}
report.wallS = Math.round((Date.now() - t0) / 1000);

console.log('\nV1 on ' + GROUND + ' (' + SEEDS + ' seeds x ' + HOURS + ' h, held step read from hour ' + SETTLE_H + '; step 0 = the ground as built, one step = +' + (DANGER.powerStep * 100) + '% health and blow)');
console.log('levers: CLIMB ' + JSON.stringify(CLIMB) + ' RISKS ' + JSON.stringify(RISK_ROWS) + ' readyPm ' + DANGER.readyPm);
console.log('held = the time-weighted step while all four hunt (to the first death), from hour ' + SETTLE_H + '; fourH = those hours a seed');
console.log('cell              held (mean +- sd)  drift  +-10  +-20  chg/h falls/h reach h  pulls/h  deaths wipes near(death/warned/fellAfter)  fourH  whys');
for (const [id, c] of Object.entries(report.cells)) {
  console.log(id.padEnd(17) + String(c.held.mean).padStart(6) + ' +- ' + String(c.held.sd).padEnd(6) + String(c.drift).padStart(6) + String(c.within10).padStart(6) + String(c.within20).padStart(6)
    + String(c.changesPerH).padStart(7) + String(c.fallsPerH).padStart(7) + String(c.reachH).padStart(8) + String(c.pullsPerH).padStart(9)
    + String(c.deaths).padStart(7) + String(c.wipes).padStart(6) + ('  ' + c.nearWipes + ' (' + c.nearWithDeath + '/' + c.nearWarned + '/' + c.nearFellAfter + ')').padEnd(30)
    + String(c.fourH).padStart(5) + '  ' + JSON.stringify(c.whys) + (c.firstDeathH.length ? ' first deaths at h ' + c.firstDeathH.join(',') : ''));
}
console.log('\npay from a held start (hour ' + PAY_FROM_H + ' to the four\'s end), Level XP a hunted hero-hour as a multiple of the hours table');
for (const [id, c] of Object.entries(report.cells)) console.log('  ' + id.padEnd(17) + ' ' + String(c.payX.mean).padStart(5) + 'x  sd ' + c.payX.sd + '  n ' + c.payX.n + '  window ' + c.payX.windowH + ' h  seeds ' + c.payX.perSeed.join(' '));
console.log('\ngold a hunted hero-hour over the whole hunt (coin; coin + loot at the store\'s price, no Rares; the store bill), mean +- sd over seeds');
for (const [id, c] of Object.entries(report.cells)) console.log('  ' + id.padEnd(17) + ' L' + c.L + '  coin ' + c.gold.coinPerHeroH.mean + ' +- ' + c.gold.coinPerHeroH.sd + '  income ' + c.gold.incomePerHeroH.mean + ' +- ' + c.gold.incomePerHeroH.sd + '  store ' + c.gold.storePerHeroH.mean
  + '  kit share ' + (c.gold.incomePerHeroH.mean ? Math.round((100 * c.gold.storePerHeroH.mean) / c.gold.incomePerHeroH.mean) / 100 : 'n/a')
  + ' (meal ' + c.kit.meal + ', drink ' + c.kit.drink + ', charge ' + c.kit.charge + ', shot ' + c.kit.shot + ')'
  + '  loot by band: common ' + c.gold.commonPerHeroH.mean + ', uncommon ' + c.gold.uncommonPerHeroH.mean + ', scarce ' + c.gold.scarcePerHeroH.mean + ', other ' + c.gold.otherPerHeroH.mean + '  n ' + c.gold.coinPerHeroH.n);
console.log('\npower moves (paired seeds): the held step at the changed power minus at base');
for (const [k, m] of Object.entries(report.moves)) if (m) console.log('  ' + k.padEnd(16) + ' ' + String(m.mean).padStart(7) + ' steps (sd ' + m.sd + ', se ' + m.se + ', n ' + m.n + ')');
console.log('\nthe damage the four took, each seat\'s share over the hunt (lane/w2-roles-rows), styles ' + STYLES.join(', '));
for (const [id, c] of Object.entries(report.cells)) console.log('  ' + id.padEnd(17) + ' ' + c.takenShare.map((t) => t.style + ' ' + t.mean).join('  '));
console.log('\nwall ' + report.wallS + ' s');
const jf = arg('json');
if (jf) writeFileSync(jf, JSON.stringify(report, null, 1) + '\n');
/* --raw <file>: every seed's pull log and its heroes' deaths and ends, to read again without playing again */
const rf = arg('raw');
if (rf) writeFileSync(rf, JSON.stringify(Object.fromEntries(Object.entries(out).map(([id, o]) => [id, { danger: o.result.party.danger || [], hours: o.result.party.hours,
  heroes: o.result.heroes.map((h) => ({ style: h.style, level: h.level, deaths: h.deaths, ended: h.ended, hours: h.hours, wallHours: h.wallHours, xp: h.levelXpPerH,
    levelXp: h.raw.levelXp, xpLostLevel: h.raw.xpLostLevel })) }]))) + '\n');
