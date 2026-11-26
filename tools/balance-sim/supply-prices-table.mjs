#!/usr/bin/env node
// tools/balance-sim/supply-prices-table.mjs — WHAT THE STORE PRICES TAKE, ON THE REAL SETTLE (designer, lane/d-supply-prices, 2026-11-16;
// PRIORITY_BOARD "2026-11-16 Store supply prices"). A measuring tool: it grades nothing.
//
//   node tools/balance-sim/supply-prices-table.mjs careers [--to 74] [--styles tank,mage]
//        one hero's life where the game sends it (the audit's `gold` career: recommendedHunt, the Level's best gear, every supply bought
//        from the store), net gold an hour by Level band and gold banked, at the prices in src/data and at WAS (the prices before)
//   node tools/balance-sim/supply-prices-table.mjs runes [--seeds 3] [--hours 2]
//        Andy's rune-ladder cells (board 2026-11-16 item 4): his four (hammer, bow, Mage at the Level, a Healer 5 under) on Deadly and the
//        lone Mage, each caster's rune slots on one store tier, net a head at the prices now and at WAS
//   node tools/balance-sim/supply-prices-table.mjs floors [--hours 2] [--seeds 1]
//        every open ground at its floor and middle on Normal, a lone hero of each way on the ground's reference bar, and Andy's four on
//        every tier the ground has: net a head now and at WAS
//
// A store price never changes a fight (a store use is bought at the price the slot names, the same blow either way) unless the purse
// runs dry, so each cell is played ONCE and its buys are priced twice. A cell whose hunt ended gold_out is marked: its WAS column is
// then a lower bound. Every number is read off the engine's own events (cell.mjs, career.mjs).
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from './cell.mjs';
import { runCareer } from './career.mjs';
import { loadAxes } from './plans.mjs';
import { sourceQuery } from '../lib/version-stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const u = (p) => pathToFileURL(join(ROOT, p)).href;

/* THE PRICES BEFORE lane/d-supply-prices (store rows whose price moved; every other row is the same in both). */
const WAS = Object.freeze({ salted_lobster: 180, salted_swordfish: 432, salted_shark: 693, thin_tomato_juice: 45, thin_pumpkin_cider: 80,
  thin_goldenroot_tea: 138, thin_emberfruit_cordial: 233, carved: 28, graven: 44 });

const SB = await import(u('src/data/supply-basics.js'));
const NOW = Object.fromEntries(SB.BASIC_SUPPLIES.map((b) => [b.id, b.price]));
const wasOf = (id) => (Object.hasOwn(WAS, id) ? WAS[id] : /^plain_carved_/.test(id) ? WAS.carved : /^plain_graven_/.test(id) ? WAS.graven : NOW[id]);
const bill = (buys, at) => Object.entries(buys || {}).reduce((s, [id, n]) => s + n * (at === 'was' ? wasOf(id) : NOW[id]), 0);
/* a hero's net an hour (coin, sold loot and rares, less the store) at either price list */
const netOf = (h, at) => h.incomePerH + h.raresPerH - bill(h.buysPerH, at);
const k = (n) => (Math.round(n / 100) / 10).toFixed(1) + 'k';
const pct = (was, now) => (was > 0 ? Math.round((100 * (now - was)) / was) + '%' : 'was <= 0');

async function careers() {
  const R0 = await loadCellRunner(ROOT);
  const { BUILD } = await import(u('src/build-info.js'));
  const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + sourceQuery(ROOT));
  const recommend = (levels, n) => recommendedHunt(levels, n).hunt;
  const to = Number(arg('to', 74));
  for (const style of arg('styles', 'tank,mage').split(',')) {
    const heroes = [];
    const R = { ...R0, runCell: (cell) => { const m = R0.runCell(cell); heroes.push(m.heroes[0]); return m; } };
    const c = runCareer(R, { id: 'supply:' + style, party: [style], startLevel: 1, targetLevel: to, maxHours: 600, chunkH: 1,
      chunkByLevel: [[1, 0.25], [8, 0.5], [12, 1]], seed: 0, recommend });
    const bands = new Map();
    let prev = 0, bankedWas = 0, bankedNow = 0, by50 = null;
    c.trace.forEach((t, i) => {
      const h = heroes[i], dh = t.hours - prev; prev = t.hours;
      const L = t.levels[0], b = L < 20 ? 1 : Math.min(70, Math.floor(L / 10) * 10);
      bankedWas += netOf(h, 'was') * dh; bankedNow += netOf(h, 'now') * dh;
      if (L >= 50 && !by50) by50 = { was: bankedWas, now: bankedNow, hours: t.hours };
      const r = bands.get(b) || { h: 0, was: 0, now: 0, billWas: 0, billNow: 0, grounds: new Set(), dry: 0 };
      r.h += dh; r.was += netOf(h, 'was') * dh; r.now += netOf(h, 'now') * dh;
      r.billWas += bill(h.buysPerH, 'was') * dh; r.billNow += bill(h.buysPerH, 'now') * dh; r.grounds.add(t.ground);
      if (h.ended && h.ended.gold_out) r.dry += h.ended.gold_out;
      bands.set(b, r);
    });
    console.log(`\n${style}: reached ${c.reached[0]} in ${c.hours} h`);
    console.log('Levels | hours | store bill g/h was -> now | net g/h was -> now | change | grounds');
    for (const [b, r] of [...bands.entries()].sort((x, y) => x[0] - y[0])) {
      console.log([b + '-' + (b === 1 ? 19 : b === 70 ? to : b + 9), r.h.toFixed(0), k(r.billWas / r.h) + ' -> ' + k(r.billNow / r.h), k(r.was / r.h) + ' -> ' + k(r.now / r.h),
        pct(r.was, r.now) + (r.dry ? ' (gold_out x' + r.dry + ')' : ''), [...r.grounds].join(', ')].join(' | '));
    }
    if (by50) console.log(`gold banked by Level 50 (${by50.hours} h): ${k(by50.was)} -> ${k(by50.now)} (${pct(by50.was, by50.now)})`);
    console.log(`gold banked by Level ${c.reached[0]}: ${k(bankedWas)} -> ${k(bankedNow)} (${pct(bankedWas, bankedNow)})`);
  }
}

/* one cell, played once, every hero's net at both price lists */
function line(R, cell, label) {
  const m = R.runCell(cell);
  const was = m.heroes.reduce((s, h) => s + netOf(h, 'was'), 0) / m.heroes.length, now = m.heroes.reduce((s, h) => s + netOf(h, 'now'), 0) / m.heroes.length;
  const dry = m.heroes.some((h) => h.ended && h.ended.gold_out);
  console.log([label, k(was) + ' -> ' + k(now), pct(was, now), m.heroes.map((h) => h.style + ' ' + k(netOf(h, 'was')) + ' -> ' + k(netOf(h, 'now')) + (h.deaths ? ' d' + h.deaths : '')).join(', '),
    m.party.levelXpPerHeroPerH, dry ? 'gold_out' : ''].join(' | '));
}
const tierCell = (T, ground, tier, party, levels, hours, seeds) => {
  const pull = tier === 'normal' ? null : T.pullOfTier(T.tierRowOf(ground, tier), party.length);
  return { id: ['supply', ground, tier, party.join('+'), levels.join('+')].join(':'), ground, party, level: levels, hours, seeds, segmentH: 1,
    ...(tier === 'normal' ? {} : { options: { tier } }), ...(pull ? { density: pull } : {}) };
};
const FOUR = ['hammer', 'bow', 'mage', 'healer'];

async function runes() {
  const R = await loadCellRunner(ROOT);
  const T = await import(u('tools/balance-program/tier-axis.mjs'));
  const axes = await loadAxes(ROOT);
  const seeds = Number(arg('seeds', 3)), hours = Number(arg('hours', 2));
  const slots = (role, tier) => axes.ROLE_RULES[role].map((sl) => {
    const y = JSON.parse(JSON.stringify(sl));
    const fam = y.action.store ? axes.familyOf(y.action.id) : null;
    if (fam && tier > 1) y.action.store = 'plain_' + axes.runeId(fam, tier);
    return y;
  });
  const CELLS = [['hasks_ford', 'deadly', 55, FOUR, [0, 0, 0, -5], 4], ['the_slake', 'deadly', 57, FOUR, [0, 0, 0, -5], 4], ['muster_barrows', 'deadly', 60, FOUR, [0, 0, 0, -5], 4],
    ['the_slake', 'deadly', 60, ['mage'], [0], 5], ['the_slake', 'normal', 52, ['mage'], [0], 4], ['muster_barrows', 'normal', 60, ['mage'], [0], 5]];
  console.log('cell | net a head was -> now | change | each hero | Level XP a head | ');
  for (const [ground, tier, L, party, off, top] of CELLS) for (let rt = 1; rt <= top; rt++) {
    const casters = [...new Set(party.filter((s) => s === 'mage' || s === 'healer'))];
    const cell = { ...tierCell(T, ground, tier, party, off.map((o) => L + o), hours, seeds), ...(rt > 1 ? { slotsByRole: Object.fromEntries(casters.map((r) => [r, slots(r, rt)])) } : {}) };
    line(R, cell, [party.length > 1 ? 'four' : 'lone mage', ground, tier, L, ['Plain', 'Scored', 'Etched', 'Carved', 'Graven'][rt - 1]].join(' '));
  }
}

async function floors() {
  const R = await loadCellRunner(ROOT);
  const T = await import(u('tools/balance-program/tier-axis.mjs'));
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const hours = Number(arg('hours', 2)), seeds = Number(arg('seeds', 1));
  const grounds = Object.values(G.OPEN_GROUNDS).map((g) => ({ id: g.id, band: HUNT_INDEX[g.hunt].band })).sort((a, b) => a.band[0] - b.band[0]);
  console.log('cell | net a head was -> now | change | each hero | Level XP a head | ');
  for (const g of grounds) for (const L of [Math.max(1, g.band[0]), Math.round((g.band[0] + g.band[1]) / 2)]) {
    for (const s of ['tank', 'hammer', 'bow', 'mage', 'healer']) line(R, tierCell(T, g.id, 'normal', [s], [L], hours, seeds), ['lone ' + s, g.id, 'normal', L].join(' '));
    if (g.band[0] >= 16) for (const tier of T.tiersOf(g.id)) line(R, tierCell(T, g.id, tier, FOUR, [L, L, L, Math.max(1, L - 5)], hours, seeds), ['four', g.id, tier, L].join(' '));
  }
}

if (mode === 'careers') await careers();
else if (mode === 'runes') await runes();
else if (mode === 'floors') await floors();
else { console.error('usage: node tools/balance-sim/supply-prices-table.mjs careers|runes|floors'); process.exit(2); }
