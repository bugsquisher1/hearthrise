#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/spells/spell-run.mjs — THE MOVE AUDIT'S CELLS, ON THE REAL ENGINE (lane/spell-audit, 2026-11-22).
//
//   node tools/balance-program/redesign/spells/spell-run.mjs --plan M [--seeds 6] [--hours 8] [--workers 6] [--json out.json]
//
// docs/design/redesign/23-spell-audit.md. The method is 18-roads-review-measured.md's (roads-run.mjs): Muster Barrows, Level 60, the matrix's
// MID kits and played bars (progression-grid.mjs buildCell), Steady, a held start (held-four.mjs heldStart), one hunt a seed with the real
// death rule, seeds paired (seed s is the same dice in every cell). It differs in one way: a move is measured as a KNOCKOUT, the party
// WITHOUT it against the party with it (cell.dropSlotsBySeat, a harness seam in tools/balance-sim/cell.mjs), so every move is valued in the
// seat and the bar it is really played on. A move that no played bar holds (Frost Slam, Shelter, Quarry Blow) is ADDED to its native seat
// (cell.addSlotsBySeat) on its own row, no clone, no candidate: the real tree.
//
// Read per seed: the held step (time-weighted from --settle h to the four's end), deaths, Level XP a hero-hour, kills an hour, gold and the
// store bill a hero-hour, and per seat every ability's casts an hour and mana an hour. Deltas are paired against the plan's base.
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
const SEEDS = Number(arg('seeds', 6)), HOURS = Number(arg('hours', 8)), WORKERS = Number(arg('workers', 6)), SETTLE_H = Number(arg('settle', 1));
const GROUND = arg('ground', 'muster_barrows'), L = Number(arg('level', 60)), RISK = arg('risk', 'steady'), PLAN = arg('plan', 'M');

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { heldStart } = await imp('tools/balance-program/redesign/held-four.mjs');
const { shoppingTier, RUNE_TIERS } = await imp('tools/balance-sim/played.mjs');
const { STYLES } = await imp('tools/balance-sim/styles.mjs');
const D = await loadGridData(ROOT), K = await loadKits(ROOT);
const START = arg('start') ? Number(arg('start')) : await heldStart(ROOT, GROUND);

const BASES = {
  M: ['hammer', 'bow', 'mage', 'healer'],      // the matrix's mixed four (hammer in front)
  T: ['tank', 'axes', 'bow', 'healer'],        // a tank in front, the axes beside it (22's F1 base)
  S: ['sword', 'bow', 'mage', 'healer'],       // a sword alone in front
  H1: ['healer'],                              // a lone healer (Undertow is alone only)
};
const AOE = (n) => [{ op: 'gte', value: n, metric: 'enemies_in_aoe' }];
const storeRune = (family, tier) => (tier === 'chalked' ? `plain_${family}_rune` : `plain_${tier}_${family}_rune`);
const ownRunes = (family) => RUNE_TIERS.map(([, t]) => `${t}_${family}_rune`).reverse();
/* a move ADDED to its native seat: its rune family, the slot it follows, its conditions (the row's own suggested trigger, abilities.js
   suggestedTrigger, as a new slot starts) */
const ADD = {
  frost_slam: { family: 'ice', after: 'challenge', cond: AOE(2) },
  shelter: { family: 'earth', after: 'challenge', cond: [] },            // its suggested trigger (a monster's cast warning) never fires here
  shelter_trig: { id: 'shelter', family: 'earth', after: 'challenge', cond: [{ metric: 'enemy_casting', op: 'gte', value: 1, subject: 'any' }] },
  /* (Quarry Blow, measured in M.txt, is reworked into Stagger: lane/moves-wave-3; the plan now adds the row the game has) */
  stagger: { family: 'earth', after: 'turning_cut', cond: [] },
  /* the Challenge re-slotted on a condition (plan T2): only while the tank itself is healthy, or only while the back-row healer is hit */
  challenge_selfok: { id: 'challenge', family: null, after: null, cond: [{ metric: 'self_hp_pct', op: 'gte', value: 60 }] },
  challenge_backhit: { id: 'challenge', family: null, after: null, cond: [{ metric: 'ally_hp_pct', op: 'lt', value: 95, subject: 'healer' }] },
};

/* a cell: [id, base, drops [[seat, [ids]]], adds [[seat, key]]] */
const cellOf = (id, base, drops = [], adds = []) => ({ id, base, drops, adds });
const ko = (base, seat, ...ids) => cellOf(base + '-' + ids.join('+') + '@' + seat, base, [[seat, ids]]);
const add = (base, seat, key) => cellOf(base + '+' + key + '@' + seat, base, [], [[seat, key]]);
const allSeats = (base, id) => cellOf(base + '-' + id + '@all', base, BASES[base].map((_, s) => [s, [id]]));
const PLANS = {
  /* hammer 0, bow 1, mage 2, healer 3 */
  M: [cellOf('M', 'M'),
    ko('M', 0, 'power_strike'), ko('M', 0, 'turning_cut'), add('M', 0, 'stagger'),
    ko('M', 1, 'flame_volley'), ko('M', 1, 'raking_shot'), ko('M', 1, 'hunters_mark'), ko('M', 1, 'precision_shot'),
    ko('M', 2, 'fireball'), ko('M', 2, 'hoarfrost'), ko('M', 2, 'frost_lance'), ko('M', 2, 'arcane_barrier'),
    ko('M', 3, 'green_sickness'), ko('M', 3, 'spring_tide'), ko('M', 3, 'circle_of_renewal'), ko('M', 3, 'greater_mend'), ko('M', 3, 'protective_ward'),
    allSeats('M', 'mend')],
  /* tank 0, axes 1, bow 2, healer 3 */
  T: [cellOf('T', 'T'),
    ko('T', 0, 'challenge'), ko('T', 0, 'flame_strike'), ko('T', 0, 'power_strike'), add('T', 0, 'frost_slam'), add('T', 0, 'shelter'), add('T', 0, 'shelter_trig'),
    ko('T', 1, 'rend'), ko('T', 1, 'turning_cut'), allSeats('T', 'mend')],
  /* sword 0 */
  /* the Challenge on a condition (plan T found the four holds deeper without it); `after: null` puts it at the bar's end */
  T2: [cellOf('T', 'T'), ko('T', 0, 'challenge'), cellOf('T~challenge_selfok@0', 'T', [[0, ['challenge']]], [[0, 'challenge_selfok']]),
    cellOf('T~challenge_backhit@0', 'T', [[0, ['challenge']]], [[0, 'challenge_backhit']])],
  S: [cellOf('S', 'S'), ko('S', 0, 'flame_strike'), ko('S', 0, 'power_strike'), ko('S', 0, 'turning_cut')],
  H1: [cellOf('H1', 'H1'), ko('H1', 0, 'undertow')],
  /* THE FIRST PASS (lane/moves-pass-1, 23 section 9): every base four and the lone healer, run before and after on the same seeds
     (compare.mjs pairs two runs' seeds); the tank's four also with the Challenge on its new suggested condition */
  P: [cellOf('T', 'T'), cellOf('M', 'M'), cellOf('S', 'S'), cellOf('H1', 'H1'),
    cellOf('T~challenge_selfok@0', 'T', [[0, ['challenge']]], [[0, 'challenge_selfok']])],
  /* the tank's four alone, for a deaths read over more seeds */
  PT: [cellOf('T', 'T'), cellOf('T~challenge_selfok@0', 'T', [[0, ['challenge']]], [[0, 'challenge_selfok']])],
};
const plan = PLANS[PLAN];
if (!plan) { console.error('spell-run: no plan ' + PLAN + ' (' + Object.keys(PLANS).join(', ') + ')'); process.exit(2); }

const jobs = [], cells = [];
for (const c of plan) {
  const styles = BASES[c.base];
  const b = buildCell(D, K, { L, gear: 'mid', styles, tier: 'normal', ground: GROUND });
  const dropSlotsBySeat = styles.map(() => null), addSlotsBySeat = styles.map(() => null);
  for (const [seat, ids] of c.drops) dropSlotsBySeat[seat] = [...(dropSlotsBySeat[seat] || []), ...ids];
  for (const [seat, key] of c.adds) {
    const how = ADD[key], id = how.id || key, role = STYLES[styles[seat]].role;
    const magic = (b.cell.skillsBySeat[seat] || {}).magic || L;
    const action = how.family ? { id, type: 'ability', own: ownRunes(how.family), store: storeRune(how.family, shoppingTier(role, how.family, magic, 'real')), onEmpty: 'store' } : { id, type: 'ability' };
    addSlotsBySeat[seat] = { after: how.after, slots: [{ id: 'p_' + id, join: 'and', conditions: how.cond, action }] };
  }
  const cell = { ...b.cell, options: { risk: RISK, danger: START }, hours: HOURS, seeds: 1,
    ...(c.drops.length ? { dropSlotsBySeat } : {}), ...(c.adds.length ? { addSlotsBySeat } : {}) };
  cells.push({ ...c, styles });
  for (let s = 0; s < SEEDS; s++) jobs.push({ key: c.id + '#' + s, job: { ...cell, id: 'SPELLS:' + c.id + '#' + s, seedBase: 1000 + s } });
}

function pool(list, n) {
  const queue = list.slice(), out = {}, errors = [], ms = {};
  const t0 = Date.now();
  let done = 0;
  return new Promise((finish) => {
    let alive = Math.max(1, Math.min(n, queue.length));
    for (let i = 0, k = alive; i < k; i++) {
      const w = fork(join(ROOT, 'tools', 'balance-sim', 'worker.mjs'), [ROOT], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const feed = () => { const j = queue.shift(); if (!j) { w.kill(); return; } w.cur = j; w.send({ type: 'job', job: j.job }); };
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(); return; }
        if (m.type === 'done') { out[w.cur.key] = m.result; ms[w.cur.key] = m.ms; } else errors.push(w.cur.key + ': ' + String(m.error).split('\n').slice(0, 4).join(' '));
        done++;
        process.stderr.write('[' + done + '/' + list.length + '] ' + w.cur.key + ' ' + Math.round(m.ms / 1000) + ' s, ' + Math.round((Date.now() - t0) / 1000) + ' s elapsed\n');
        w.cur = null; feed();
      });
      w.on('exit', () => { if (w.cur) errors.push(w.cur.key + ': worker exited'); if (--alive === 0) finish({ out, errors, ms }); });
    }
  });
}

const H = 3600000;
function readSeed(res) {
  const log = (res.party.danger || []).map(([, ms, step, to, low, why, hero, monster]) => ({ ms, step, to, low, why, hero, monster }));
  const huntedMs = Math.round(res.party.hours * H);
  const firstDeath = log.find((e) => e.low <= 0);
  const endMs = firstDeath ? firstDeath.ms : Math.max(huntedMs, log.length ? log[log.length - 1].ms : 0);
  let at = 0, cur = START, ws = 0, wt = 0;
  const from = SETTLE_H * H;
  const span = (a, b, s) => { const lo = Math.max(a, from); if (b > lo) { ws += s * (b - lo); wt += b - lo; } };
  for (const e of log) { if (e.ms >= endMs) break; span(at, e.ms, cur); at = e.ms; cur = e.to; }
  span(at, endMs, cur);
  const heroH = res.heroes.reduce((a, h) => a + (h.hours || 0), 0);
  const perHeroH = (k) => (heroH > 0 ? res.heroes.reduce((a, h) => a + ((h.raw && h.raw[k]) || 0), 0) / heroH : null);
  const seats = res.heroes.map((h) => ({ style: h.style, casts: h.castsPerH || {}, mana: h.castManaPerH || {}, dps: h.dps || 0,
    healOutPerH: h.healOutPerH || 0, shieldInPerH: h.shieldInPerH || 0, takenPerH: h.takenPerH || 0, deaths: h.deaths,
    drinksPerH: ((h.drinksPerH || {}).own || 0) + ((h.drinksPerH || {}).store || 0) }));
  return {
    held: wt ? ws / wt : null, deaths: res.heroes.reduce((a, h) => a + h.deaths, 0),
    xpPerHeroH: res.party.levelXpPerHeroPerH, killsPerH: res.party.killsPerH,
    incomePerHeroH: perHeroH('income'), storePerHeroH: perHeroH('store'),
    drinksPerH: seats.reduce((a, s) => a + s.drinksPerH, 0), takenPerH: seats.reduce((a, s) => a + s.takenPerH, 0), seats,
    /* every death: the hour, the step, the seat and the monster kind whose blow it was (the danger event's cause) */
    deathLog: log.filter((e) => e.why === 'death').map((e) => ({ h: r(e.ms / H, 2), step: e.step, seat: e.hero, by: e.monster })),
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0; };
const se = (xs) => (xs.length > 1 ? sd(xs) / Math.sqrt(xs.length) : null);
const r = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const stat = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)); return { mean: r(mean(v)), se: r(se(v)), n: v.length }; };

const t0 = Date.now();
process.stderr.write('SPELLS ' + PLAN + ': ' + jobs.length + ' seed jobs (' + cells.length + ' cells x ' + SEEDS + ' seeds x ' + HOURS + ' h) on ' + WORKERS + ' workers; ' + GROUND + ' L' + L + ' ' + RISK + ' start ' + START + '\n');
const { out, errors } = await pool(jobs, WORKERS);
if (errors.length) { console.error('spell-run harness errors:\n  ' + errors.join('\n  ')); process.exit(2); }

const report = { plan: PLAN, ground: GROUND, level: L, risk: RISK, start: START, seeds: SEEDS, hours: HOURS, settleFromH: SETTLE_H, cells: {}, wallS: Math.round((Date.now() - t0) / 1000), workers: WORKERS };
const KEYS = ['held', 'deaths', 'xpPerHeroH', 'killsPerH', 'incomePerHeroH', 'storePerHeroH', 'drinksPerH', 'takenPerH'];
for (const c of cells) {
  const seeds = [];
  for (let s = 0; s < SEEDS; s++) seeds.push(readSeed(out[c.id + '#' + s]));
  const o = { id: c.id, base: c.base, styles: c.styles, drops: c.drops, adds: c.adds, perSeed: {} };
  for (const k of KEYS) { o[k] = stat(seeds.map((x) => x[k])); o.perSeed[k] = seeds.map((x) => r(x[k])); }
  o.deathLog = seeds.flatMap((x, s) => x.deathLog.map((d) => ({ seed: s, ...d })));
  o.seats = c.styles.map((st, i) => {
    const ids = [...new Set(seeds.flatMap((x) => Object.keys(x.seats[i].casts)))].sort();
    return { style: st, dps: stat(seeds.map((x) => x.seats[i].dps)), healOutPerH: stat(seeds.map((x) => x.seats[i].healOutPerH)),
      shieldInPerH: stat(seeds.map((x) => x.seats[i].shieldInPerH)), takenPerH: stat(seeds.map((x) => x.seats[i].takenPerH)), drinksPerH: stat(seeds.map((x) => x.seats[i].drinksPerH)),
      deaths: seeds.reduce((a, x) => a + x.seats[i].deaths, 0),
      casts: Object.fromEntries(ids.map((id) => [id, stat(seeds.map((x) => x.seats[i].casts[id] || 0)).mean])),
      mana: Object.fromEntries(ids.map((id) => [id, stat(seeds.map((x) => x.seats[i].mana[id] || 0)).mean])) };
  });
  report.cells[c.id] = o;
}
for (const o of Object.values(report.cells)) {
  const B = report.cells[o.base];
  if (!B || B === o) continue;
  o.vsBase = Object.fromEntries(['held', 'xpPerHeroH', 'killsPerH', 'incomePerHeroH', 'storePerHeroH', 'drinksPerH', 'takenPerH', 'deaths'].map((k) => {
    const d = o.perSeed[k].map((x, i) => (x !== null && B.perSeed[k][i] !== null ? x - B.perSeed[k][i] : null)).filter((x) => x !== null);
    return [k, stat(d)];
  }));
  const xb = B.xpPerHeroH.mean;
  o.vsBase.xpPct = xb ? { mean: r((o.vsBase.xpPerHeroH.mean / xb) * 100), se: r((o.vsBase.xpPerHeroH.se / xb) * 100) } : null;
}
const pm = (s) => (!s || s.mean === null ? 'n/a' : s.mean + ' +- ' + (s.se === null ? '?' : s.se));
console.log('\nSPELLS ' + PLAN + ' on ' + GROUND + ' L' + L + ' ' + RISK + ', held start ' + START + ', ' + SEEDS + ' seeds x ' + HOURS + ' h, held read from hour ' + SETTLE_H + ' (mean +- se over seeds)');
for (const o of Object.values(report.cells)) {
  console.log(o.id.padEnd(30) + ' held ' + pm(o.held).padEnd(14) + ' deaths ' + o.deaths.mean + '  xp/hd-h ' + pm(o.xpPerHeroH).padEnd(18) + ' kills/h ' + pm(o.killsPerH).padEnd(14) + ' gold/hd-h ' + pm(o.incomePerHeroH).padEnd(14) + ' store/hd-h ' + pm(o.storePerHeroH));
  if (o.deathLog.length) console.log('   deaths: ' + o.deathLog.map((d) => 'seed ' + d.seed + ' h' + d.h + ' step ' + d.step + ' seat ' + d.seat + ' by ' + d.by).join(' · '));
  if (o.vsBase) console.log('   vs ' + o.base + ' (paired): held ' + pm(o.vsBase.held) + '  xp ' + pm(o.vsBase.xpPct) + '%  kills/h ' + pm(o.vsBase.killsPerH) + '  gold ' + pm(o.vsBase.incomePerHeroH) + '  store ' + pm(o.vsBase.storePerHeroH) + '  drinks ' + pm(o.vsBase.drinksPerH) + '  taken ' + pm(o.vsBase.takenPerH));
  for (const s of o.seats) console.log('     ' + s.style.padEnd(7) + ' dps ' + String(s.dps.mean).padEnd(7) + ' heal/h ' + String(s.healOutPerH.mean).padEnd(8) + ' deaths ' + s.deaths + '  casts/h ' + Object.entries(s.casts).map(([k, n]) => k + ' ' + n).join(', '));
}
console.log('\nwall ' + report.wallS + ' s on ' + WORKERS + ' workers');
const jf = arg('json');
if (jf) writeFileSync(jf, JSON.stringify(report, null, 1) + '\n');
