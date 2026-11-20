#!/usr/bin/env node
// tools/balance-program/items/recipes-table.mjs: EVERY RECIPE, NODE AND CROP ON ONE SHEET (balance program dive 23, questions 2 to 4).
// A measuring tool: it reads the game's own data rows and prints. It writes nothing and grades nothing. READ FROM DATA, no play.
//
//   node tools/balance-program/items/recipes-table.mjs recipes   every bench recipe by skill and family: inputs, the bench seconds a job
//                                                                takes (paced), the whole chain's hero-hours a made unit (gathering
//                                                                and every bench step, one hero, no tool), the Shop's bid, the store
//                                                                partner it replaces, and its value in gold a chain hour both ways
//   node tools/balance-program/items/recipes-table.mjs families  one row a family: recipes, levels, the best and worst gold an hour
//   node tools/balance-program/items/recipes-table.mjs nodes     every gathering node: pieces and XP an hour, the Shop's bid an hour
//   node tools/balance-program/items/recipes-table.mjs to99      hours to 99 a skill, on its best XP row at every level
//   node tools/balance-program/items/recipes-table.mjs to99chain  the same for the benches with every input gathered by the same account (no drop-fed row)
//   node tools/balance-program/items/recipes-table.mjs crops     the nine crops: hours, yield, the seed's price, a plot-day's worth
//
// HOW A UNIT IS COSTED. Hero-hours a unit = the job's paced seconds over its output count, plus the same for every input, down to a
// node (its paced seconds over its mean yield, no tool: a tool is up to 35% faster on the gathering half). A crop costs no hero-hours
// (it grows on the wall clock; flagged F). A monster drop costs none either and is flagged D: its stock is bounded by the hunt.
// "Replaces" = the store row whose partner the output is (src/data/supply-basics.js): a store heal or drink gives 75% of its crafted
// partner, so one crafted unit replaces store price x crafted effect / store effect; a shot or a rune replaces the store's price a use.
// Exit 0 when it ran, 2 on a bad argument.
import { ITEMS } from '../../../src/data/items.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../../../src/data/gathering.js';
import { ARTISAN_RECIPES_EVERY, recipeCategory } from '../../../src/data/recipes.js';
import { BASIC_SUPPLIES } from '../../../src/data/supply-basics.js';
import { recipeInputs } from '../../../src/core/artisan.js';
import { pacedActionMs, pacedXp } from '../../../src/core/pacing.js';
import { skillXpForLevel } from '../../../src/core/xp.js';
import { vendorPriceOf } from '../../../supabase/functions/hr-accrue/catalogue.js';

const mode = process.argv[2] || 'recipes';
const bid = (id) => vendorPriceOf(ITEMS, id);
const NODES = [['woodcutting', TREES], ['mining', ROCKS], ['fishing', FISH_SPOTS]];
const meanQty = (n) => (Array.isArray(n.qty) ? (n.qty[0] + n.qty[1]) / 2 : (n.qty || 1));
const nodeSec = (n) => pacedActionMs(n.ms) / 1000;
/* raw id -> its best node (most pieces a second) */
const BEST_NODE = {};
for (const [skill, list] of NODES) for (const n of list) {
  if (!n.prod) continue;
  const rate = meanQty(n) / nodeSec(n);
  if (!BEST_NODE[n.prod] || rate > BEST_NODE[n.prod].rate) BEST_NODE[n.prod] = { skill, node: n, rate };
}
const CROP_OF = Object.fromEntries(Object.entries(CROPS).map(([id, c]) => [c.prod, { id, ...c }]));
const MADE_BY = {};
const ALL = [];
for (const [skill, list] of Object.entries(ARTISAN_RECIPES_EVERY)) for (const r of list) {
  ALL.push({ skill, r });
  if (r.output && !MADE_BY[r.output]) MADE_BY[r.output] = { skill, r };
}
const PARTNER = Object.fromEntries(BASIC_SUPPLIES.map((b) => [b.partner, b]));

/* hero-hours a unit of `id`, and the flags of what the chain leans on */
function cost(id, seen = new Set()) {
  if (seen.has(id)) return { h: 0, flags: new Set(['loop']) };
  const s2 = new Set(seen); s2.add(id);
  if (BEST_NODE[id]) return { h: 1 / BEST_NODE[id].rate / 3600, flags: new Set() };
  if (CROP_OF[id]) return { h: 0, flags: new Set(['F']) };
  const m = MADE_BY[id];
  if (m) return jobCost(m.r, s2, true);
  return { h: 0, flags: new Set(['D']) };
}
function jobCost(r, seen = new Set(), perUnit = false) {
  let h = pacedActionMs(r.ms) / 1000 / 3600;
  const flags = new Set();
  for (const [id, q] of Object.entries(recipeInputs(r))) { const c = cost(id, seen); h += c.h * q; c.flags.forEach((f) => flags.add(f)); }
  return { h: perUnit ? h / (r.outputQty || 1) : h, flags };
}
/* what one unit of the output replaces at the store, in gold (0: no store partner) */
function replaces(id) {
  const p = PARTNER[id], it = ITEMS[id];
  if (!p || !it) return 0;
  if (p.kind === 'heal') return p.price * (it.heals || 0) / (p.heals || 1);
  if (p.kind === 'mana') return p.price * (it.mana || 0) / (p.mana || 1);
  return p.price;
}
const f0 = (n) => Math.round(n).toLocaleString('en-US');
const inputsText = (r) => Object.entries(recipeInputs(r)).map(([id, q]) => q + ' ' + ((ITEMS[id] && ITEMS[id].n) || id)).join(', ') || '(nothing)';
function rowOf({ skill, r }) {
  const fam = recipeCategory(skill, r) || (skill === 'inner_flame' ? 'fuels' : r.roll ? 'jewelry' : 'plain');
  const c = jobCost(r);
  const qty = r.outputQty || 1;
  const out = r.output ? ITEMS[r.output] : null;
  const benchSec = pacedActionMs(r.ms) / 1000;
  const shopHour = r.output ? bid(r.output) * qty / c.h : 0;
  const rep = r.output ? replaces(r.output) : 0;
  const inputBid = Object.entries(recipeInputs(r)).reduce((a, [id, q]) => a + bid(id) * q, 0);
  return { skill, fam, id: r.id, name: r.name, req: r.req || 1, inputs: inputsText(r), benchSec, qty, xpHourBench: pacedXp(skill, r.xp) * 3600 / benchSec,
    chainH: c.h, flags: [...c.flags].join(''), out: out ? out.n : '(none)', bidUnit: r.output ? bid(r.output) : 0, inputBid, shopHour,
    rep, repHour: rep * qty / c.h, heals: out && out.heals, mana: out && out.mana, buff: out && out.buff, sw: r.switch || '', roll: !!r.roll, gate: r.gate || r.pattern || '' };
}
const ROWS = ALL.map(rowOf);

if (mode === 'recipes') {
  let last = '';
  for (const x of ROWS.slice().sort((a, b) => (a.skill + a.fam).localeCompare(b.skill + b.fam) || a.req - b.req)) {
    const k = x.skill + '/' + x.fam;
    if (k !== last) { console.log('\n## ' + k + '\nrecipe | req | inputs | bench s a job | makes | chain hero-h a job | units a chain hour | Shop bid a unit | Shop gold a chain hour | store partner replaced, gold a unit | replaced gold a chain hour | heal/mana | flags'); last = k; }
    console.log([x.name, x.req, x.inputs, x.benchSec.toFixed(1), x.qty + ' ' + x.out, x.chainH.toFixed(4), f0(x.qty / x.chainH), x.bidUnit, f0(x.shopHour),
      x.rep ? x.rep.toFixed(1) : '-', x.rep ? f0(x.repHour) : '-', x.heals ? 'heals ' + x.heals : x.mana ? 'mana ' + x.mana : x.buff ? 'buff ' + JSON.stringify(x.buff) : '-',
      [x.flags, x.sw ? 'DARK:' + x.sw : '', x.roll ? 'rolls' : '', x.gate ? 'gate' : ''].filter(Boolean).join(' ') || '-'].join(' | '));
  }
  console.log('\n' + ROWS.length + ' recipes. Flags: F a farmed input (no hero-hours), D a monster drop (bounded by the hunt), DARK a job behind a switch.');
} else if (mode === 'families') {
  const by = {};
  for (const x of ROWS) (by[x.skill + '/' + x.fam] = by[x.skill + '/' + x.fam] || []).push(x);
  console.log('family | recipes | req from-to | with a store partner | Shop gold a chain hour, low to high | replaced gold a chain hour, low to high | leans on');
  for (const [k, l] of Object.entries(by).sort()) {
    const sh = l.map((x) => x.shopHour).filter((v) => v > 0), rp = l.filter((x) => x.rep).map((x) => x.repHour);
    const fl = new Set(l.flatMap((x) => x.flags.split('')));
    console.log([k, l.length, Math.min(...l.map((x) => x.req)) + '-' + Math.max(...l.map((x) => x.req)), l.filter((x) => x.rep).length,
      sh.length ? f0(Math.min(...sh)) + ' to ' + f0(Math.max(...sh)) : '-', rp.length ? f0(Math.min(...rp)) + ' to ' + f0(Math.max(...rp)) : '-',
      [...fl].join('') || '-'].join(' | '));
  }
  console.log(Object.keys(by).length + ' families, ' + ROWS.length + ' recipes.');
} else if (mode === 'nodes') {
  console.log('skill | node | req | product | pieces an hour (no tool) | skill XP an hour | Shop bid a piece | Shop gold an hour');
  for (const [skill, list] of NODES) for (const n of list) {
    const per = meanQty(n) * 3600 / nodeSec(n);
    console.log([skill, n.name, n.req, n.prod, f0(per), f0(pacedXp(skill, n.xp) * 3600 / nodeSec(n)), bid(n.prod), f0(per * bid(n.prod))].join(' | '));
  }
} else if (mode === 'to99') {
  console.log('skill | hours 1 to 30 | to 60 | to 80 | to 99 | the row at 99 (XP an hour) | rows | longest gap between new rows, in levels');
  const tables = { ...Object.fromEntries(NODES.map(([s, l]) => [s, l.map((n) => ({ req: n.req, name: n.name, xph: pacedXp(s, n.xp) * 3600 / nodeSec(n) }))])) };
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES_EVERY)) tables[skill] = list.filter((r) => !r.switch).map((r) => ({ req: r.req || 1, name: r.name, xph: pacedXp(skill, r.xp) * 3600 / (pacedActionMs(r.ms) / 1000) }));
  for (const [skill, rows] of Object.entries(tables)) {
    let h = 0; const marks = {}; let best = null;
    for (let lv = 1; lv < 99; lv++) {
      best = rows.filter((r) => r.req <= lv).sort((a, b) => b.xph - a.xph)[0];
      if (best) h += (skillXpForLevel(skill, lv + 1) - skillXpForLevel(skill, lv)) / best.xph;
      if ([29, 59, 79, 98].includes(lv)) marks[lv + 1] = h;
    }
    const reqs = [...new Set(rows.map((r) => r.req))].sort((a, b) => a - b).concat([99]);
    let gap = 0; for (let i = 1; i < reqs.length; i++) gap = Math.max(gap, reqs[i] - reqs[i - 1]);
    console.log([skill, f0(marks[30]), f0(marks[60]), f0(marks[80]), f0(marks[99]), best ? best.name + ' (' + f0(best.xph) + ')' : '-', rows.length, gap].join(' | '));
  }
  console.log('Bench hours assume the inputs are in stock (the gathering behind them is the gathering skill\'s own hours).');
} else if (mode === 'to99chain') {
  console.log('skill | chain hero-hours 1 to 30 | to 60 | to 80 | to 99 | the row at 99 (XP a chain hour) | of which bench hours to 99');
  for (const skill of ['cooking', 'smithing', 'crafting', 'runecrafting']) {
    const rows = ROWS.filter((x) => x.skill === skill && !x.sw && !x.flags.includes('D') && !x.flags.includes('F')).map((x) => ({ ...x, xpChain: x.xpHourBench * (x.benchSec / 3600) / x.chainH }));
    let h = 0, bh = 0; const marks = {}; let best = null;
    for (let lv = 1; lv < 99; lv++) {
      best = rows.filter((r) => r.req <= lv).sort((a, b) => b.xpChain - a.xpChain)[0];
      const need = skillXpForLevel(skill, lv + 1) - skillXpForLevel(skill, lv);
      if (best) { h += need / best.xpChain; bh += need / best.xpHourBench; }
      if ([29, 59, 79, 98].includes(lv)) marks[lv + 1] = h;
    }
    console.log([skill, f0(marks[30]), f0(marks[60]), f0(marks[80]), f0(marks[99]), best ? best.name + ' (' + f0(best.xpChain) + ')' : '-', f0(bh)].join(' | '));
  }
  console.log('Rows with a farmed or dropped input are left out: their stock is bounded by plots and hunts, not hero-hours.');
} else if (mode === 'crops') {
  console.log('crop | Farming req | hours | mean yield | seed | seed price at the Shop | Shop bid a crop | a plot-day at the Shop | what cooks it');
  for (const [id, c] of Object.entries(CROPS)) {
    const y = (c.yield[0] + c.yield[1]) / 2;
    const users = ROWS.filter((x) => { const r = ALL.find((a) => a.r.id === x.id).r; return recipeInputs(r)[c.prod]; }).map((x) => x.name);
    const seed = ITEMS[c.seed];
    console.log([c.name, c.req, c.hours, y, c.seed, seed ? seed.v : '?', bid(c.prod), f0(y * bid(c.prod) * 24 / c.hours), users.join(', ') || 'NOTHING'].join(' | '));
  }
} else { console.error('recipes | families | nodes | to99 | to99chain | crops'); process.exit(2); }
