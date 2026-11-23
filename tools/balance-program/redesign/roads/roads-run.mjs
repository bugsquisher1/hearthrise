#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/roads/roads-run.mjs — THE ROADS REVIEW'S BORROWED-MOVE CELLS, ON THE REAL ENGINE (lane/roads-review-measure).
//
//   node tools/balance-program/redesign/roads/roads-run.mjs --plan q1 [--seeds 6] [--hours 8] [--workers 6] [--json out.json]
//   node tools/balance-program/redesign/roads/roads-run.mjs --plan e3 --candidate tools/balance-program/redesign/e3/e3-lab.json
//                 (lane/e2-e3-statuses: a candidate's OWN rows slotted as they are, a borrow of power null: the sample aura and shield move)
//
// docs/design/redesign/18-roads-review-measured.md. Every cell: Muster Barrows, Level 60, the matrix's MID kits and played bars
// (progression-grid.mjs buildCell), Steady, a HELD START (the ground's refStep less DANGER.startMargin: held-four.mjs heldStart), one hunt
// a seed with the real death rule, played through tools/balance-sim/worker.mjs -> cell.mjs runCell -> hr-accrue -> combat-sim.js on the
// roads-lend candidate's scratch copy (make-lend.mjs: a borrowed move is a clone row on the borrower's discipline at a power permille).
// A borrow is one slot added to one seat's played bar (cell.mjs addSlotsBySeat). Seeds are paired: seed s is the same dice in every cell.
//
// Read per seed: the held step (time-weighted from --settle h to the four's end, the pull in which the first hero died), deaths, Level
// XP a hero-hour, gold a hero-hour (coin, coin + loot at the store's price), the store bill a hero-hour (supplies), and per seat the
// healing it cast, its casts of the borrowed row, the mana its casts spent and its drinks. Deltas are paired against the plan's base.
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
const GROUND = arg('ground', 'muster_barrows'), L = Number(arg('level', 60)), RISK = arg('risk', 'steady'), PLAN = arg('plan', 'q1');

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { heldStart } = await imp('tools/balance-program/redesign/held-four.mjs');
const { shoppingTier, RUNE_TIERS } = await imp('tools/balance-sim/played.mjs');
const { STYLES } = await imp('tools/balance-sim/styles.mjs');
const C = await imp('tools/balance-program/candidates.mjs');
const { lentId } = await imp('tools/balance-program/redesign/roads/make-lend.mjs');
const D = await loadGridData(ROOT), K = await loadKits(ROOT);
const START = arg('start') ? Number(arg('start')) : await heldStart(ROOT, GROUND);

/* ── the bases and the borrowed slots ── */
const BASES = {
  M: ['hammer', 'bow', 'mage', 'healer'],      // the matrix's mixed four
  N: ['hammer', 'bow', 'mage', 'sword'],       // no healer
  S: ['sword', 'bow', 'mage', 'healer'],       // a sword in the healer's four
  NM: ['hammer', 'bow', 'sword', 'healer'],    // no mage
  NB: ['hammer', 'sword', 'mage', 'healer'],   // no bow
};
/* how a borrowed row sits on the bar: its rune family, the slot it follows, its conditions (the native played bar's, else the row's
   suggested trigger) */
const AOE = (n) => [{ op: 'gte', value: n, metric: 'enemies_in_aoe' }];
const HOW = {
  greater_mend: { family: 'water', after: 'power_strike', cond: [{ op: 'lt', value: 80, metric: 'ally_hp_pct', subject: 'lowest' }] },
  /* Shelter's own trigger (a monster's cast warning) never fired on Muster Barrows in a 1 h probe: no condition, so it casts whenever a
     wounded, unshelled hero is in its radius and it is ready (the engine's target rule) */
  shelter: { family: 'earth', after: 'greater_mend', cond: [] },
  challenge: { family: null, after: 'challenge', cond: [] },
  fireball: { family: 'fire', after: 'turning_cut', cond: AOE(2) },
  frost_lance: { family: 'ice', after: 'turning_cut', cond: [] },
  hunters_mark: { family: null, after: 'challenge', cond: [] },
  /* E3's samples (e3-lab.json): an aura move holds while slotted; Warm Stone takes the ally-shield target rule (an ally under 70%, unshielded) */
  t_open_fire: { family: null, after: 'greater_mend', cond: [] },
  t_open_fire_whole: { family: null, after: 'greater_mend', cond: [] },
  t_warm_stone: { family: null, after: 'power_strike', cond: [] },
};
const storeRune = (family, tier) => (tier === 'chalked' ? `plain_${family}_rune` : `plain_${tier}_${family}_rune`);
const ownRunes = (family) => RUNE_TIERS.map(([, t]) => `${t}_${family}_rune`).reverse();
const DISC = { hammer: 'club', sword: 'sword', healer: 'restoration', bow: 'ranged', mage: 'destruction', tank: 'shield', axes: 'dual_axe' };

/* a borrow: [seat, native id, pm, reach] */
const cellOf = (id, base, borrows = []) => ({ id, base, borrows });
const PLANS = {
  /* Q1: a borrowed Greater Mend (the hammer) and Shelter (the healer) at 0 / -30 / -40%, and the engine's own melee reach */
  q1: [cellOf('M', 'M'),
    cellOf('M+GM@ham:1000', 'M', [[0, 'greater_mend', 1000, 7]]), cellOf('M+GM@ham:700', 'M', [[0, 'greater_mend', 700, 7]]),
    cellOf('M+GM@ham:600', 'M', [[0, 'greater_mend', 600, 7]]), cellOf('M+GM@ham:700:reach1', 'M', [[0, 'greater_mend', 700, 0]]),
    cellOf('M+SH@heal:1000', 'M', [[3, 'shelter', 1000, 0]]), cellOf('M+SH@heal:700', 'M', [[3, 'shelter', 700, 0]]), cellOf('M+SH@heal:600', 'M', [[3, 'shelter', 600, 0]])],
  /* Q2: a specialist healer against two borrowed heals, and a sword borrowing beside a healer */
  q2: [cellOf('N', 'N'), cellOf('N+GM@ham:600+GM@sw:600', 'N', [[0, 'greater_mend', 600, 7], [3, 'greater_mend', 600, 7]]),
    cellOf('N+GM@sw:1000', 'N', [[3, 'greater_mend', 1000, 7]]),
    cellOf('S', 'S'), cellOf('S+GM@sw:600', 'S', [[0, 'greater_mend', 600, 7]])],
  /* Q3: each move at 0% in a four that lacks it (Greater Mend and Shelter are q2's N+GM@sw:1000 and q1's M+SH@heal:1000) */
  q3: [cellOf('M+CH@ham:1000', 'M', [[0, 'challenge', 1000, 0]]), cellOf('M+CH@ham:700', 'M', [[0, 'challenge', 700, 0]]),
    cellOf('NM', 'NM'), cellOf('NM+FB@ham:1000', 'NM', [[0, 'fireball', 1000, 0]]), cellOf('NM+FL@ham:1000', 'NM', [[0, 'frost_lance', 1000, 0]]),
    cellOf('NM+FB@ham:700', 'NM', [[0, 'fireball', 700, 0]]), cellOf('NM+FL@ham:700', 'NM', [[0, 'frost_lance', 700, 0]]),
    cellOf('NB', 'NB'), cellOf('NB+HM@sw:1000', 'NB', [[1, 'hunters_mark', 1000, 0]]), cellOf('NB+HM@sw:700', 'NB', [[1, 'hunters_mark', 700, 0]])],
  /* Q3's formula test: the derived penalty on two moves (filled from q1-q3's answers) */
  q3f: [cellOf('M', 'M'), cellOf('M+GM@ham:400', 'M', [[0, 'greater_mend', 400, 7]]), cellOf('M+GM@ham:200', 'M', [[0, 'greater_mend', 200, 7]]),
    cellOf('NM', 'NM'), cellOf('NM+FB@ham:500', 'NM', [[0, 'fireball', 500, 0]]), cellOf('M+CH@ham:1000', 'M', [[0, 'challenge', 1000, 0]]), cellOf('M+CH@ham:700', 'M', [[0, 'challenge', 700, 0]]),
    cellOf('M+SH@heal:400', 'M', [[3, 'shelter', 400, 0]])],
  /* L10 (19 section 5): gold an hour against held depth, the same four ~50 steps apart (a borrowed Greater Mend buys the depth) */
  l10: [cellOf('M', 'M'), cellOf('M+GM@ham:1000', 'M', [[0, 'greater_mend', 1000, 7]])],
  /* Q5: one cell, timed */
  time: [cellOf('M', 'M')],
  /* E3 (lane/e2-e3-statuses): Open Fire on the healer as sized (build slice, ramped) and whole, and Warm Stone on the hammer (pm null: the row as it is) */
  e3: [cellOf('M', 'M'), cellOf('M+FIRE@heal', 'M', [[3, 't_open_fire', null, 0]]), cellOf('M+FIREW@heal', 'M', [[3, 't_open_fire_whole', null, 0]]),
    cellOf('M+WS@ham', 'M', [[0, 't_warm_stone', null, 0]])],
};
const plan = PLANS[PLAN];
if (!plan) { console.error('roads-run: no plan ' + PLAN + ' (' + Object.keys(PLANS).join(', ') + ')'); process.exit(2); }

const TREE = await C.treeOf(C.readCandidate(arg('candidate') ? resolve(ROOT, arg('candidate')) : join(HERE, 'roads-lend.json')));
const jobs = [], cells = [];
for (const c of plan) {
  const styles = BASES[c.base];
  const b = buildCell(D, K, { L, gear: 'mid', styles, tier: 'normal', ground: GROUND });
  const addSlotsBySeat = styles.map(() => null), lent = {};
  for (const [seat, id, pm, reach] of c.borrows) {
    const style = styles[seat], role = STYLES[style].role, how = HOW[id], cid = pm === null ? id : lentId(id, DISC[style], pm, reach);
    const magic = (b.cell.skillsBySeat[seat] || {}).magic || L;
    const action = how.family ? { id: cid, type: 'ability', own: ownRunes(how.family), store: storeRune(how.family, shoppingTier(role, how.family, magic, 'real')), onEmpty: 'store' } : { id: cid, type: 'ability' };
    addSlotsBySeat[seat] = { after: how.after, slots: [...((addSlotsBySeat[seat] && addSlotsBySeat[seat].slots) || []), { id: 'p_' + cid, join: 'and', conditions: how.cond, action }] };
    lent[seat] = cid;
  }
  const cell = { ...b.cell, options: { risk: RISK, danger: START }, hours: HOURS, seeds: 1, ...(c.borrows.length ? { addSlotsBySeat } : {}) };
  cells.push({ ...c, styles, lent });
  for (let s = 0; s < SEEDS; s++) jobs.push({ key: c.id + '#' + s, job: { ...cell, id: 'ROADS:' + c.id + '#' + s, seedBase: 1000 + s } });
}

function pool(list, n) {
  const queue = list.slice(), out = {}, errors = [], ms = {};
  const t0 = Date.now();
  let done = 0;
  return new Promise((finish) => {
    let alive = Math.max(1, Math.min(n, queue.length));
    for (let i = 0, k = alive; i < k; i++) {
      const w = fork(join(ROOT, 'tools', 'balance-sim', 'worker.mjs'), [TREE.root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
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
function readSeed(res, c) {
  const log = (res.party.danger || []).map(([, ms, step, to, low, why]) => ({ ms, step, to, low, why }));
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
  const seats = res.heroes.map((h, i) => {
    const hr = h.hours || 1e-9, lentCid = c.lent[i];
    const manaPerH = Object.values(h.castManaPerH || {}).reduce((a, b) => a + b, 0);
    return { style: h.style, hours: h.hours, healOutPerH: h.healOutPerH || 0, selfHealPerH: (h.healInPerH && h.healInPerH.self) || 0, dps: h.dps || 0, manaPerH, deaths: h.deaths,
      drinksPerH: ((h.drinksPerH || {}).own || 0) + ((h.drinksPerH || {}).store || 0), eatsPerH: ((h.eatsPerH || {}).own || 0) + ((h.eatsPerH || {}).store || 0),
      storePerH: (h.raw && h.raw.store ? h.raw.store / hr : 0),
      lentCastsPerH: lentCid ? (h.castsPerH || {})[lentCid] || 0 : null, lentManaPerH: lentCid ? (h.castManaPerH || {})[lentCid] || 0 : null,
      shieldInPerH: h.shieldInPerH || 0, takenPerH: h.takenPerH || 0 };
  });
  return {
    held: wt ? ws / wt : null, fourH: wt / H, deaths: res.heroes.reduce((a, h) => a + h.deaths, 0), firstDeathH: firstDeath ? firstDeath.ms / H : null,
    xpPerHeroH: res.party.levelXpPerHeroPerH, killsPerH: res.party.killsPerH,
    coinPerHeroH: perHeroH('coin'), incomePerHeroH: perHeroH('income'), storePerHeroH: perHeroH('store'),
    healOutPerH: seats.reduce((a, s) => a + s.healOutPerH, 0), healAllPerH: seats.reduce((a, s) => a + s.healOutPerH + s.selfHealPerH, 0), shieldInPerH: seats.reduce((a, s) => a + s.shieldInPerH, 0), drinksPerH: seats.reduce((a, s) => a + s.drinksPerH, 0), eatsPerH: seats.reduce((a, s) => a + s.eatsPerH, 0), seats,
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0; };
const se = (xs) => (xs.length > 1 ? sd(xs) / Math.sqrt(xs.length) : null);
const r = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const stat = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)); return { mean: r(mean(v)), sd: r(sd(v)), se: r(se(v)), n: v.length }; };

const t0 = Date.now();
process.stderr.write('ROADS ' + PLAN + ': ' + jobs.length + ' seed jobs (' + cells.length + ' cells x ' + SEEDS + ' seeds x ' + HOURS + ' h) on ' + WORKERS + ' workers; ' + GROUND + ' L' + L + ' ' + RISK + ' start ' + START + '\n');
const { out, errors, ms } = await pool(jobs, WORKERS);
TREE.done();
if (errors.length) { console.error('roads-run harness errors:\n  ' + errors.join('\n  ')); process.exit(2); }

const report = { plan: PLAN, ground: GROUND, level: L, risk: RISK, start: START, seeds: SEEDS, hours: HOURS, settleFromH: SETTLE_H, cells: {}, wallS: Math.round((Date.now() - t0) / 1000), workers: WORKERS };
const KEYS = ['held', 'deaths', 'xpPerHeroH', 'incomePerHeroH', 'coinPerHeroH', 'storePerHeroH', 'healOutPerH', 'healAllPerH', 'shieldInPerH', 'drinksPerH', 'eatsPerH', 'killsPerH', 'fourH'];
for (const c of cells) {
  const seeds = [];
  for (let s = 0; s < SEEDS; s++) seeds.push(readSeed(out[c.id + '#' + s], c));
  const o = { id: c.id, base: c.base, styles: c.styles, borrows: c.borrows, perSeed: {}, seatMs: [] };
  for (const k of KEYS) { o[k] = stat(seeds.map((x) => x[k])); o.perSeed[k] = seeds.map((x) => r(x[k])); }
  o.deathsTotal = seeds.reduce((a, x) => a + x.deaths, 0); o.seedsWithDeath = seeds.filter((x) => x.deaths > 0).length;
  o.firstDeathH = seeds.map((x) => r(x.firstDeathH)).filter((x) => x !== null);
  o.seats = c.styles.map((st, i) => {
    const f = (k) => stat(seeds.map((x) => x.seats[i][k]));
    return { style: st, healOutPerH: f('healOutPerH'), selfHealPerH: f('selfHealPerH'), dps: f('dps'), manaPerH: f('manaPerH'), drinksPerH: f('drinksPerH'), storePerH: f('storePerH'),
      shieldInPerH: f('shieldInPerH'), takenPerH: f('takenPerH'), deaths: seeds.reduce((a, x) => a + x.seats[i].deaths, 0),
      ...(c.lent[i] ? { lent: c.lent[i], lentCastsPerH: f('lentCastsPerH'), lentManaPerH: f('lentManaPerH') } : {}) };
  });
  o.seedMsMean = Math.round(mean(Array.from({ length: SEEDS }, (_, s) => ms[c.id + '#' + s])));
  report.cells[c.id] = o;
}
/* paired deltas against the plan cell's base (seed s against seed s) */
for (const o of Object.values(report.cells)) {
  const B = report.cells[o.base];
  if (!B || B === o) continue;
  o.vsBase = Object.fromEntries(['held', 'xpPerHeroH', 'incomePerHeroH', 'storePerHeroH', 'healOutPerH', 'healAllPerH', 'shieldInPerH', 'drinksPerH', 'deaths'].map((k) => {
    const d = o.perSeed[k].map((x, i) => (x !== null && B.perSeed[k][i] !== null ? x - B.perSeed[k][i] : null)).filter((x) => x !== null);
    return [k, stat(d)];
  }));
}
const pm = (s) => (s.mean === null ? 'n/a' : s.mean + ' +- ' + (s.se === null ? '?' : s.se));
console.log('\nROADS ' + PLAN + ' on ' + GROUND + ' L' + L + ' ' + RISK + ', held start ' + START + ', ' + SEEDS + ' seeds x ' + HOURS + ' h, held read from hour ' + SETTLE_H + ' (mean +- se over seeds)');
for (const o of Object.values(report.cells)) {
  console.log(o.id.padEnd(26) + ' held ' + pm(o.held).padEnd(14) + ' deaths ' + o.deathsTotal + ' (' + o.seedsWithDeath + ' seeds)  xp/hd-h ' + pm(o.xpPerHeroH).padEnd(16) + ' gold/hd-h ' + pm(o.incomePerHeroH).padEnd(14)
    + ' store/hd-h ' + pm(o.storePerHeroH).padEnd(12) + ' heal/h ' + pm(o.healOutPerH).padEnd(16) + ' drinks/h ' + pm(o.drinksPerH));
  if (o.vsBase) console.log('   vs ' + o.base + ' (paired): held ' + pm(o.vsBase.held) + '  xp ' + pm(o.vsBase.xpPerHeroH) + '  gold ' + pm(o.vsBase.incomePerHeroH) + '  store ' + pm(o.vsBase.storePerHeroH) + '  heal(all) ' + pm(o.vsBase.healAllPerH) + '  shield ' + pm(o.vsBase.shieldInPerH) + '  deaths ' + pm(o.vsBase.deaths) + '  drinks ' + pm(o.vsBase.drinksPerH));
  for (const s of o.seats) console.log('     ' + s.style.padEnd(7) + ' heal/h ' + String(s.healOutPerH.mean).padEnd(8) + ' self/h ' + String(s.selfHealPerH.mean).padEnd(8) + ' dps ' + String(s.dps.mean).padEnd(7) + ' mana/h ' + String(s.manaPerH.mean).padEnd(7) + ' drinks/h ' + String(s.drinksPerH.mean).padEnd(5)
    + ' store/h ' + String(s.storePerH.mean).padEnd(6) + ' shieldIn/h ' + String(s.shieldInPerH.mean).padEnd(7) + ' taken/h ' + String(s.takenPerH.mean).padEnd(8) + ' deaths ' + s.deaths
    + (s.lent ? '  LENT ' + s.lent + ' casts/h ' + pm(s.lentCastsPerH) + ' mana/h ' + s.lentManaPerH.mean : ''));
}
console.log('\nwall ' + report.wallS + ' s on ' + WORKERS + ' workers; mean seed ' + Math.round(mean(Object.values(report.cells).map((o) => o.seedMsMean)) / 1000) + ' s for ' + HOURS + ' h');
const jf = arg('json');
if (jf) writeFileSync(jf, JSON.stringify(report, null, 1) + '\n');
