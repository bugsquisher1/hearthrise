// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/roads/alloc-run.mjs — THE ROADS SAMPLE'S ALLOCATIONS, ON THE REAL ENGINE (lane/roads-sample, 2026-11-23).
//
//   node tools/balance-program/redesign/roads/alloc-run.mjs [--hero shield|restoration|both] [--levels 30,60,120] [--seeds 6] [--hours 6]
//        [--workers 6] [--risk steady] [--json out.json]
//
// docs/design/redesign/18-roads-review.md section 9 step 4 and 19 section 6 (the ceiling, V6's first slice): a Shield hero (the tank's seat)
// and a Restoration hero (the healer's seat) in the four [tank, bow, mage, healer], each at Levels 30 / 60 / 120 on the scale ground for
// that Level, with five allocations of its points (src/core/talents.js, the build the settle grants through hr_talents_view):
//   banked      nothing spent (every point idle: 19 row 2's third of a step each)
//   suggested   "Spend as suggested" (spendSuggested, party plan, never a vow)
//   one_move    every point on the main move's road, then its open road
//   spread      the country's roads breadth first (each road's first stone, then each second ...), then Mend's
//   best        the best of the candidates measured: suggested, suggested with the country's live vows, the live-first picks (each crossroads
//               the first option with an engine effect), and those with the vows; per cell, by mean held step
// Every cell: the matrix's MID kits (progression-grid.mjs buildCell), Steady, a HELD START, one hunt a seed, through tools/balance-sim/
// worker.mjs -> cell.mjs runCell -> hr-accrue -> combat-sim.js on THIS tree (cell.roadsBySeat -> play-ground.mjs opts.roads). Seeds are paired.
// THE GAP: best - suggested in held steps (one step ~0.7% pace, 14 steps = 10%: 19 section 1) against the 5-10% ceiling (17 section 9).
// Exit 0 ran · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 6)), HOURS = Number(arg('hours', 6)), WORKERS = Number(arg('workers', 6)), SETTLE_H = Number(arg('settle', 1));
const RISK = arg('risk', 'steady');
const LEVELS = String(arg('levels', '30,60,120')).split(',').map(Number);
/* the scale ground a hero of that Level hunts (src/data/danger.js DANGER_GROUNDS entryLevel): the Ford (45) under Muster, Muster (55-75),
   the Bone Wing (165) past it. None is cut for Level 30 or 120 yet (V8 is owed a scale ground under 55, R10): read those two as nearest. */
const GROUND_AT = (L) => (L < 50 ? 'hasks_ford' : L < 100 ? 'muster_barrows' : 'catacomb_bone_wing');
const FOUR = ['tank', 'bow', 'mage', 'healer'];
/* each country's seat: the four's own seat, or a melee four with the weapon in the second seat (lane/roads-countries) */
const MELEE = (w) => ['tank', w, 'mage', 'healer'];
const SEATS = { shield: [FOUR, 0], restoration: [FOUR, 3], ranged: [FOUR, 1], destruction: [FOUR, 2], sword: [MELEE('sword'), 1], club: [MELEE('hammer'), 1], dual_axe: [MELEE('axes'), 1] };
/* --hero shield | restoration | both | all | a comma list of countries */
const HEROES = arg('hero', 'both') === 'both' ? ['shield', 'restoration'] : arg('hero') === 'all' ? Object.keys(SEATS) : String(arg('hero')).split(',');

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { heldStart } = await imp('tools/balance-program/redesign/held-four.mjs');
const T = await imp('src/core/talents.js');
const TD = await imp('src/data/talents.js');
const D = await loadGridData(ROOT), K = await loadKits(ROOT);

/* ── the allocations ── */
const ROADS = ['r1', 'r2', 'r3', 'x1', 'w1', 'r4', 'r5', 'x2', 'w2'];
const pickOf = (id, plan) => { const n = TD.NODE_INDEX[id]; return TD.PICK_KINDS.includes(n.kind) ? T.suggestedPick(n, plan) : true; };
const live = (o) => o.effects.some((e) => e.kind === 'mod' || e.kind === 'step');
/* the first option with an engine effect (a mod or a step row), else the suggested */
const livePick = (n) => { const o = T.optionsOf(n).find(live); return o ? o.id : T.suggestedPick(n, 'party'); };
/* the country's vows whose gain the engine plays (a step row or a mod that is not its cost) */
const liveVows = (disc) => TD.TALENT_NODES.filter((n) => n.kind === 'vow' && n.country === disc
  && n.effects.some((e) => (e.kind === 'step' && e.steps > 0) || (e.kind === 'mod' && (e.outPm > 0 || e.cdMs < 0))));
function withVows(build, disc, L) {
  let b = { ...build };
  for (const v of liveVows(disc)) {
    if (T.vowSlotsAt(L) <= Object.keys(b).filter((k) => TD.NODE_INDEX[k] && TD.NODE_INDEX[k].kind === 'vow').length) break;
    /* a vow takes a point: free one from the open road, else the last stone the build owns */
    if (T.pointsSpent(b) >= T.pointsAt(L)) {
      const open = Object.keys(b).find((k) => TD.NODE_INDEX[k].kind === 'open' && b[k] > 0);
      if (open) { b[open] -= 1; if (!b[open]) delete b[open]; } else continue;
    }
    if (!T.spendProblem(b, v.id, null, L)) b = T.spend(b, v.id, null);
  }
  return b;
}
function allocations(disc, L) {
  const main = T.roadsFor(disc)[0];
  const sug = T.spendSuggested({}, disc, 'party', L);
  const order = T.suggestedOrder(disc, 'party');
  const one = T.spendAlong({}, ROADS.map((s) => [main + '.' + s, pickOf(main + '.' + s, 'party')]), main + '.open', L);
  const spreadOrder = [];
  for (const s of ROADS) for (const m of T.roadsFor(disc)) if (TD.NODE_INDEX[m + '.' + s]) spreadOrder.push([m + '.' + s, pickOf(m + '.' + s, 'party')]);
  const spread = T.spendAlong({}, spreadOrder, T.suggestedOpen(disc), L);
  const liveOrder = order.map(([id, p]) => [id, p === true ? true : livePick(TD.NODE_INDEX[id])]);
  const liveFirst = T.spendAlong({}, liveOrder, T.suggestedOpen(disc), L);
  return {
    banked: {}, suggested: sug, one_move: one, spread,
    /* the candidates "best" is taken from (suggested itself is one) */
    'cand:sug+vows': withVows(sug, disc, L), 'cand:live': liveFirst, 'cand:live+vows': withVows(liveFirst, disc, L),
  };
}

/* ── the cells ── */
const jobs = [], cells = [];
for (const hero of HEROES) for (const L of LEVELS) {
  const ground = GROUND_AT(L);
  const start = await heldStart(ROOT, ground);
  const [four, seat] = SEATS[hero];
  const b = buildCell(D, K, { L, gear: 'mid', styles: four, tier: 'normal', ground });
  const allocs = allocations(hero, L);
  for (const [name, build] of Object.entries(allocs)) {
    const probs = T.buildProblems(build, L);
    if (probs.length) { console.error('alloc-run: ' + hero + ' L' + L + ' ' + name + ' is not a legal build: ' + JSON.stringify(probs)); process.exit(2); }
    const id = hero + ':L' + L + ':' + name;
    const roadsBySeat = four.map((_, i) => (i === seat ? build : null));
    const cell = { ...b.cell, options: { risk: RISK, danger: start }, hours: HOURS, seeds: 1, roadsBySeat };
    cells.push({ id, hero, L, ground, name, spent: T.pointsSpent(build), points: T.pointsAt(L), grants: T.grantsOf(build, hero, L) });
    for (let s = 0; s < SEEDS; s++) jobs.push({ key: id + '#' + s, job: { ...cell, id: 'ALLOC:' + id + '#' + s, seedBase: 1000 + s } });
  }
}

function pool(list, n) {
  const queue = list.slice(), out = {}, errors = [];
  const t0 = Date.now();
  let done = 0;
  return new Promise((finish) => {
    let alive = Math.max(1, Math.min(n, queue.length));
    for (let i = 0, k = alive; i < k; i++) {
      const w = fork(join(ROOT, 'tools', 'balance-sim', 'worker.mjs'), [ROOT], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const feed = () => { const j = queue.shift(); if (!j) { w.kill(); return; } w.cur = j; w.send({ type: 'job', job: j.job }); };
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(); return; }
        if (m.type === 'done') out[w.cur.key] = m.result; else errors.push(w.cur.key + ': ' + String(m.error).split('\n').slice(0, 4).join(' '));
        done++;
        process.stderr.write('[' + done + '/' + list.length + '] ' + w.cur.key + ' ' + Math.round((Date.now() - t0) / 1000) + ' s elapsed\n');
        w.cur = null; feed();
      });
      w.on('exit', () => { if (w.cur) errors.push(w.cur.key + ': worker exited'); if (--alive === 0) finish({ out, errors }); });
    }
  });
}

const H = 3600000;
/* the held step, time-weighted from SETTLE_H to the four's end (the pull in which the first hero died), as roads-run.mjs reads it */
function readSeed(res, start) {
  const log = (res.party.danger || []).map(([, ms, step, to, low]) => ({ ms, step, to, low }));
  const huntedMs = Math.round(res.party.hours * H);
  const firstDeath = log.find((e) => e.low <= 0);
  const endMs = firstDeath ? firstDeath.ms : Math.max(huntedMs, log.length ? log[log.length - 1].ms : 0);
  let at = 0, cur = start, ws = 0, wt = 0;
  const from = SETTLE_H * H;
  const span = (a, b, s) => { const lo = Math.max(a, from); if (b > lo) { ws += s * (b - lo); wt += b - lo; } };
  for (const e of log) { if (e.ms >= endMs) break; span(at, e.ms, cur); at = e.ms; cur = e.to; }
  span(at, endMs, cur);
  return { held: wt ? ws / wt : null, deaths: res.heroes.reduce((a, h) => a + h.deaths, 0), xp: res.party.levelXpPerHeroPerH };
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const se = (xs) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) / Math.sqrt(xs.length); };
const r1 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

process.stderr.write('ALLOC: ' + jobs.length + ' seed jobs (' + cells.length + ' cells x ' + SEEDS + ' seeds x ' + HOURS + ' h) on ' + WORKERS + ' workers\n');
const t0 = Date.now();
const { out, errors } = await pool(jobs, WORKERS);
if (errors.length) { console.error('alloc-run harness errors:\n  ' + errors.join('\n  ')); process.exit(2); }

const report = { seeds: SEEDS, hours: HOURS, risk: RISK, four: FOUR, wallS: Math.round((Date.now() - t0) / 1000), cells: {}, gaps: [] };
for (const c of cells) {
  const start = await heldStart(ROOT, c.ground);
  const seeds = Array.from({ length: SEEDS }, (_, s) => readSeed(out[c.id + '#' + s], start));
  report.cells[c.id] = { ...c, grants: { mods: c.grants.mods, held: c.grants.held.length, borrowed: c.grants.borrowed, idle: c.grants.idle },
    held: seeds.map((x) => r1(x.held)), heldMean: r1(mean(seeds.map((x) => x.held))), deaths: seeds.reduce((a, x) => a + x.deaths, 0),
    xpMean: Math.round(mean(seeds.map((x) => x.xp)) || 0) };
}
console.log('\nROADS ALLOCATIONS, ' + FOUR.join('/') + ', ' + RISK + ', ' + SEEDS + ' seeds x ' + HOURS + ' h (held step, mean; paired deltas vs suggested)');
for (const hero of HEROES) for (const L of LEVELS) {
  const id = (n) => hero + ':L' + L + ':' + n;
  const S = report.cells[id('suggested')];
  const delta = (n) => { const o = report.cells[id(n)]; const d = o.held.map((x, i) => (x !== null && S.held[i] !== null ? x - S.held[i] : null)).filter((x) => x !== null); return { mean: r1(mean(d)), se: r1(se(d)) }; };
  const cands = ['suggested', 'cand:sug+vows', 'cand:live', 'cand:live+vows'];
  const best = cands.reduce((a, n) => (report.cells[id(n)].heldMean > report.cells[id(a)].heldMean ? n : a), 'suggested');
  console.log('\n' + hero + ' L' + L + ' on ' + S.ground + ' (points ' + S.points + ', held start ' + (await heldStart(ROOT, S.ground)) + ')');
  for (const n of ['banked', 'suggested', 'one_move', 'spread', ...cands.slice(1)]) {
    const o = report.cells[id(n)], d = n === 'suggested' ? null : delta(n);
    console.log('  ' + n.padEnd(15) + ' held ' + String(o.heldMean).padEnd(7) + (d ? ' vs suggested ' + (d.mean >= 0 ? '+' : '') + d.mean + ' +- ' + d.se : '').padEnd(28)
      + ' deaths ' + o.deaths + '  xp/hd-h ' + o.xpMean + '  spent ' + o.spent + '/' + o.points + '  held rules ' + o.grants.held);
  }
  const g = best === 'suggested' ? { mean: 0, se: 0 } : delta(best);
  const pct = r1(g.mean * 0.7);
  report.gaps.push({ hero, L, best, steps: g.mean, se: g.se, pacePct: pct, within: g.mean <= 14 });
  console.log('  BEST FOUND ' + best + ': +' + g.mean + ' +- ' + g.se + ' held steps over suggested = ~' + pct + '% pace (ceiling 5-10%, 7-14 steps): ' + (g.mean <= 14 ? 'within' : 'OVER'));
}
console.log('\nwall ' + report.wallS + ' s on ' + WORKERS + ' workers');
const jf = arg('json');
if (jf) writeFileSync(jf, JSON.stringify(report, null, 1) + '\n');
