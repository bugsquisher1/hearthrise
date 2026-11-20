#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/home.mjs — THE HOME DOMAIN'S TABLES, READ FROM THE GAME'S OWN DATA (balance program, dive 26).
//
// No engine plays the town (01-model.md section 6), so every number here is READ FROM DATA: the rows a generator turns into the
// server's catalogue (src/data/homestead-tiers.js, shops.js, perks.js, gold-ladders.js, gold-sinks.js, training.js, bench-tax.js,
// gathering.js CROPS, src/core/farm.js, recipes.js) priced with the model's own reference players (model.mjs, ref.json), the same
// arithmetic as `measure.mjs price`. It writes nothing and reads nothing outside the repository.
//
//   node tools/balance-program/home.mjs ladder      the property ladder: gold, materials at the Shop's bid, REF hours, days a player
//   node tools/balance-program/home.mjs rooms       the 40 room rungs: price, gate, what it gives, payback
//   node tools/balance-program/home.mjs benches     what an hour at each bench adds at the Shop, the tax, and what +2% of it is worth
//   node tools/balance-program/home.mjs storage     chests, the depot's cap, the 30 bag rungs
//   node tools/balance-program/home.mjs farm        every crop: a bed-day, a 12-bed day, presses, seed cost
//   node tools/balance-program/home.mjs training    the yard's fee, hours a skill level, the dummy's payback
//   node tools/balance-program/home.mjs all
//
// mutant-anchors: none — a measuring tool of the balance program, not a guard
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../../src/data/items.js';
import { CROPS } from '../../src/data/gathering.js';
import { ARTISAN_RECIPES } from '../../src/data/recipes.js';
import { PROPERTY_TIERS, ROOM_RUNGS, STORAGE_CHESTS, DEPOT_BASE_STACKS } from '../../src/data/homestead-tiers.js';
import { ROOM_PERKS } from '../../src/data/perks.js';
import { SHOP_OFFERS } from '../../src/data/shops.js';
import { BANK_RUNGS, BANK_STACKS_PER_RUNG, bankRungPrice } from '../../src/data/gold-ladders.js';
import { SINK_RULES } from '../../src/data/gold-sinks.js';
import { TRAINING_RULES, TRAINING_GEAR, trainingFee } from '../../src/data/training.js';
import { BENCH_TAX, BENCH_TAX_ROOMS, BENCH_TAX_FREE_UNDER_MG } from '../../src/data/bench-tax.js';
import { PLOT_TIER_PRICES, PLOT_TIERS, WATER_WINDOW_H, REGROW_LIMITS } from '../../src/core/farm.js';
import { recipeInputs } from '../../src/core/artisan.js';
import { pacedActionMs } from '../../src/core/pacing.js';
import { feeMgOf } from '../../src/core/bench-tax.js';
import { vendorPriceOf } from '../../supabase/functions/hr-accrue/catalogue.js';
import { SUPPLY_SHOP_OFFERS, BASIC_SUPPLIES } from '../../src/data/supply-basics.js';
import { skillXpForLevel } from '../../src/core/xp.js';
import { REFERENCE_PLAYERS, REF_POINTS, REAL_OWN_FOUR_NET } from './model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(join(HERE, 'ref.json'), 'utf8'));
const n = (v) => Math.round(v).toLocaleString('en-US');
const bid = (id) => vendorPriceOf(ITEMS, id) || 0;
const name = (id) => (ITEMS[id] && ITEMS[id].n) || id;
const row = (...c) => console.log('| ' + c.join(' | ') + ' |');

/* measure.mjs price, as a function: REF hours on the lone seat and days for a reference player at a point. */
function priceAt(gold, pid) {
  const pt = REF.points[pid];
  const lone = pt.seats.lone.netPerH;
  const real = pt.level <= REAL_OWN_FOUR_NET[REAL_OWN_FOUR_NET.length - 1][0] ? REAL_OWN_FOUR_NET.find(([top]) => pt.level <= top)[1] : null;
  const days = {};
  for (const pl of REFERENCE_PLAYERS) {
    const r = pt.seats[pl.seat];
    const share = pl.stock === 'store' || pl.stock === 'market' ? 1 : pl.stock === 'third own' ? 2 / 3 : 0;
    const net = pl.seat === 'four' && real !== null ? real : r.incomePerH - r.storePerH * share;
    const day = net * pl.heroes * pl.huntHoursADay;
    days[pl.id] = pl.id === 'whale' ? 0 : day > 0 ? gold / day : Infinity;
    days[pl.id + '_share'] = pl.id === 'whale' ? 0 : day > 0 ? gold / day / pl.spends : Infinity;
  }
  return { refH: lone > 0 ? gold / lone : Infinity, days, level: pt.level };
}
const d1 = (v) => (v === Infinity ? 'never' : v < 10 ? v.toFixed(1) : String(Math.round(v)));
const matsBid = (items) => Object.entries(items).reduce((s, [id, q]) => s + q * bid(id), 0);
const matsLine = (items) => Object.entries(items).map(([id, q]) => q + ' ' + name(id)).join(', ');

/* The Level a real account stands at when it meets each step (10-real-players: Homestead on 4 accounts incl. the Level 8 ones; rooms at
   rung 4 on the Level 55 and Level 79 accounts). ASSUMED mapping to the nearest reference point; the dive says so beside every table. */
const TIER_POINT = { homestead: 'thicket', farmstead: 'thicket', manor: 'glade', keep: 'glade', castle: 'hold' };

function ladder() {
  console.log('\nTHE PROPERTY LADDER (src/data/shops.js property.*, homestead-tiers.js PROPERTY_TIERS). READ FROM DATA.');
  row('Tier', 'Property', 'Gold', 'Materials', 'Materials at the Shop bid', 'Beds', 'Rooms it opens', 'Priced at', 'Lone REF h', 'New d', 'Own four d (at 17%)', 'Heavy four d', 'Four friends d');
  row(...Array(13).fill('---'));
  let total = 0;
  PROPERTY_TIERS.forEach((t, i) => {
    if (!i) { row(0, t.name, 0, 'none', 0, t.plots, 'none', '', '', '', '', '', ''); return; }
    const o = SHOP_OFFERS.find((x) => x.id === 'property.' + t.id);
    const gold = o.cost.find((c) => c.kind === 'currency').amount;
    const items = Object.fromEntries(o.cost.filter((c) => c.kind === 'item').map((c) => [c.id, c.amount]));
    total += gold;
    const p = priceAt(gold, TIER_POINT[t.id]);
    row(i, t.name, n(gold), matsLine(items), n(matsBid(items)), t.plots, t.rooms.join(', ') || 'none', TIER_POINT[t.id] + ' ' + p.level, d1(p.refH), d1(p.days.new),
      d1(p.days.ownfour) + ' (' + d1(p.days.ownfour_share) + ')', d1(p.days.heavy), d1(p.days.friends));
  });
  console.log('gold to the Castle: ' + n(total));
}

/* What an hour at a bench is worth at the Shop: the value one job adds (output bid - inputs' bid), an hour, at the row's paced time. */
function benchRows() {
  const out = [];
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list) {
    if (!r.output || r.gated) continue;
    const q = Number(r.outputQty) || 1;
    const ins = recipeInputs(r);
    const inBid = Object.entries(ins).reduce((s, [id, k]) => s + k * bid(id), 0);
    const outBid = bid(r.output) * q;
    const perH = 3600000 / pacedActionMs(r.ms);
    const fee = feeMgOf(BENCH_TAX[skill] || 0, bid(r.output), q, BENCH_TAX_FREE_UNDER_MG) / 1000;
    out.push({ skill, id: r.id, req: r.req, jobsH: perH, outH: outBid * perH, addH: (outBid - inBid) * perH, taxH: fee * perH, inH: inBid * perH, roll: !!r.roll });
  }
  return out;
}
/* The recipes real players spent their bench hours on (10-real-players section 6), a skill. */
const REAL_JOBS = { cooking: ['cook_frostfin', 'cook_swordfish', 'cook_shrimp', 'cook_shark', 'cook_lobster'], smithing: ['smelt_mithril', 'smelt_iron', 'smelt_ember', 'smelt_steel'],
  crafting: ['saw_yew', 'saw_maple', 'saw_runewood', 'saw_normal'], runecrafting: ['cut_rune_blanks'] };
const SPEED_ROOM = { cooking: 'kitchen', smithing: 'forge', crafting: 'workshop', runecrafting: 'library', inner_flame: 'shrine' };

function benches() {
  console.log('\nWHAT A BENCH HOUR MAKES AT THE SHOP (recipes.js at pacedActionMs, the Shop bid; bench-tax.js 15% of the output bid). READ FROM DATA.');
  row('Bench', 'Recipe', 'Level', 'Jobs an hour', 'Output an hour (Shop bid)', 'Value added an hour', 'Public bench tax an hour', '+2% speed is worth, an hour', '+10%');
  row(...Array(9).fill('---'));
  const rows = benchRows();
  for (const [skill, ids] of Object.entries(REAL_JOBS)) for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r) { row(skill, id, 'no such recipe', '', '', '', '', '', ''); continue; }
    row(skill, id, r.req, n(r.jobsH), n(r.outH), n(r.addH), n(r.taxH), n(r.outH * 0.02), n(r.outH * 0.1));
  }
  console.log('best value-added row a skill (any level, no rolled rows):');
  for (const skill of Object.keys(BENCH_TAX)) {
    const best = rows.filter((x) => x.skill === skill && !x.roll).sort((a, b) => b.outH - a.outH)[0];
    row(skill, best.id, best.req, n(best.jobsH), n(best.outH), n(best.addH), n(best.taxH), n(best.outH * 0.02), n(best.outH * 0.1));
  }
  return rows;
}

function rooms() {
  const rows = benchRows();
  /* the bench hour a room speeds: the mean of the real jobs' output an hour (what the hour makes, since a faster bench makes more of it) */
  const hourOf = (skill) => { const ids = REAL_JOBS[skill] || []; const rs = ids.map((id) => rows.find((x) => x.id === id)).filter(Boolean); return rs.length ? { out: rs.reduce((s, r) => s + r.outH, 0) / rs.length, tax: rs.reduce((s, r) => s + r.taxH, 0) / rs.length } : { out: 0, tax: 0 }; };
  const roomSkill = Object.fromEntries(Object.entries(SPEED_ROOM).map(([s, r]) => [r, s]));
  const opensAt = {}; PROPERTY_TIERS.forEach((t, i) => t.rooms.forEach((r) => { opensAt[r] = i; }));
  console.log('\nEVERY ROOM RUNG (homestead-tiers.js ROOM_RUNGS, perks.js ROOM_PERKS). READ FROM DATA. Payback = gold / what the rung adds an hour at its bench, in hero bench hours;');
  console.log('a speed rung adds 2% of the bench hour\'s output at the Shop bid (the mean of the recipes real players ran), rung 1 of a bench room also ends the 15% tax.');
  row('Room', 'Rung', 'Gold', 'Materials', 'Materials at the Shop bid', 'Needs', 'Gives (whole rung)', 'Adds over the rung below', 'Lone REF h at', 'Own four d (at 17%)', 'Heavy four d', 'Worth an hour at its bench', 'Payback, bench hours');
  row(...Array(13).fill('---'));
  let all = 0; const perRoom = {};
  for (const room of ['kitchen', 'garden', 'workshop', 'cellar', 'forge', 'library', 'shrine', 'trophy']) {
    ROOM_RUNGS[room].forEach((r, i) => {
      const gold = r.cost.gold; all += gold; perRoom[room] = (perRoom[room] || 0) + gold;
      const items = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
      const tier = Math.max(opensAt[room], r.tier || 0);
      const pid = i === 4 ? 'hold' : gold >= 150000 ? 'ford' : gold >= 40000 ? 'glade' : 'thicket';
      const p = priceAt(gold, pid);
      const perk = ROOM_PERKS[room][i], prev = i ? ROOM_PERKS[room][i - 1] : {};
      const gives = Object.entries(perk).map(([k, v]) => k + ' ' + v).join(', ');
      const adds = Object.entries(perk).map(([k, v]) => k + ' +' + Math.round((v - (prev[k] || 0)) * 1000) / 1000).join(', ');
      const skill = roomSkill[room];
      let worth = '', pay = '';
      if (skill && REAL_JOBS[skill]) {
        const h = hourOf(skill);
        const w = h.out * 0.02 + (i === 0 && BENCH_TAX_ROOMS[skill] ? h.tax : 0);
        worth = n(w) + (i === 0 ? ' (tax ' + n(h.tax) + ' + speed ' + n(h.out * 0.02) + ')' : '');
        pay = n(gold / w);
      } else if (room === 'garden') { worth = 'one bed: see `farm`'; pay = 'see `farm`'; }
      else { worth = 'none at a bench'; pay = 'never'; }
      row(room, i + 1, n(gold), matsLine(items), n(matsBid(items)), PROPERTY_TIERS[tier].name, gives, adds, d1(p.refH) + ' @' + pid, d1(p.days.ownfour) + ' (' + d1(p.days.ownfour_share) + ')', d1(p.days.heavy), worth, pay);
    });
  }
  console.log('gold a room: ' + Object.entries(perRoom).map(([k, v]) => k + ' ' + n(v)).join(', '));
  console.log('gold, all 40 rungs: ' + n(all) + '; rungs 1 to 4 only: ' + n(all - Object.keys(perRoom).reduce((s, k) => s + ROOM_RUNGS[k][4].cost.gold, 0)));
}

function storage() {
  console.log('\nSTORAGE (homestead-tiers.js STORAGE_CHESTS + DEPOT_BASE_STACKS: the account\'s depot; gold-ladders.js bank.*: each HERO\'s bag cap). READ FROM DATA.');
  row('Step', 'Gold', 'Materials', 'Needs', 'Stacks', 'Depot after', 'Gold a stack');
  row(...Array(7).fill('---'));
  let cap = DEPOT_BASE_STACKS, g = 0;
  row('the depot, free', 0, 'none', 'nothing', DEPOT_BASE_STACKS, cap, 0);
  for (const c of STORAGE_CHESTS) {
    cap += c.stacks; g += c.cost.gold;
    const items = Object.fromEntries(Object.entries(c.cost).filter(([k]) => k !== 'gold'));
    row(c.name, n(c.cost.gold), matsLine(items), PROPERTY_TIERS[c.tier].name, '+' + c.stacks, cap, n(c.cost.gold / c.stacks));
  }
  console.log('four chests: ' + n(g) + ' gold, the depot ends at ' + cap + ' stacks and nothing sells more.');
  console.log('\nTHE BAG RUNGS (bank.0 to bank.' + (BANK_RUNGS - 1) + ', +' + BANK_STACKS_PER_RUNG + ' stacks each, per hero):');
  row('Rung', 'Price', 'Sum so far', 'Gold a stack', 'Sum for four heroes');
  row(...Array(5).fill('---'));
  let sum = 0;
  for (let k = 0; k < BANK_RUNGS; k++) {
    const p = bankRungPrice(k); sum += p;
    if ([0, 1, 2, 4, 5, 9, 14, 19, 24, 29].includes(k)) row(k + 1, n(p), n(sum), n(p / BANK_STACKS_PER_RUNG), n(sum * 4));
  }
}

function farm() {
  console.log('\nFARMING (gathering.js CROPS, core/farm.js, supply-basics.js; XP a harvest = the crop\'s xp x pieces, hr_farm_harvest). READ FROM DATA.');
  console.log('One water press doubles growth for ' + WATER_WINDOW_H + ' h, at most 8 a planting. "Drink" = the 1 crop : 1 drink recipe, valued at the store drink it replaces (store price x own mana / store mana).');
  row('Crop', 'Farming', 'Plot tier', 'Hours dry', 'Yield', 'Seed at the Shop', 'Crop Shop bid', 'A harvest: XP', 'at the bid', 'as drinks, store value', 'Harvests a seed', 'A bed-day dry: gold as drinks (or bid), seed paid', 'XP', 'Two visits a day, one bed: gold', 'XP');
  row(...Array(15).fill('---'));
  const tierOf = (id) => { for (let lv = 1; lv < PLOT_TIERS.length; lv++) if (PLOT_TIERS[lv].unlocks.includes(id)) return lv; return 0; };
  const seedPrice = (id) => (SUPPLY_SHOP_OFFERS.find((o) => o.item === id) || {}).price || 0;
  const drinkOf = (prod) => {
    const r = ARTISAN_RECIPES.cooking.find((x) => { const ins = recipeInputs(x); return Object.keys(ins).length === 1 && ins[prod] === 1 && ITEMS[x.output] && ITEMS[x.output].mana; });
    if (!r) return null;
    const st = BASIC_SUPPLIES.find((b) => b.partner === r.output);
    return st ? { id: r.output, each: st.price * ITEMS[r.output].mana / st.mana } : null;
  };
  const out = [];
  for (const [id, c] of Object.entries(CROPS)) {
    const y = (c.yield[0] + c.yield[1]) / 2, perDay = 24 / c.hours, d = drinkOf(c.prod);
    const each = d ? d.each : bid(c.prod);
    const harvests = 1 + (REGROW_LIMITS[id] || 0);
    const seedAHarvest = seedPrice(c.seed) / harvests;
    /* two visits a day 12 h apart, one water press a visit (+2 growth-hours): a crop of 14 h or less is cut every visit, up to 26 h once a day */
    const v2 = c.hours <= 14 ? 2 : c.hours <= 26 ? 1 : 0.5;
    row(c.name, c.req, tierOf(id), c.hours, c.yield.join('-'), seedPrice(c.seed), bid(c.prod), n(c.xp * y), n(y * bid(c.prod)), d ? n(y * d.each) + ' (' + name(d.id) + ')' : 'no drink', harvests,
      n(perDay * (y * each - seedAHarvest)), n(perDay * c.xp * y), n(v2 * (y * each - seedAHarvest)), n(v2 * c.xp * y));
    out.push({ id, v2gold: v2 * (y * each - seedAHarvest), v2xp: v2 * c.xp * y });
  }
  console.log('17 beds, two visits a day, best three by gold: ' + [...out].sort((x, y) => y.v2gold - x.v2gold).slice(0, 3).map((o) => o.id + ' ' + n(17 * o.v2gold) + ' g and ' + n(17 * o.v2xp) + ' XP a day').join('; '));
  console.log('17 beds, two visits a day, best three by XP: ' + [...out].sort((x, y) => y.v2xp - x.v2xp).slice(0, 3).map((o) => o.id + ' ' + n(17 * o.v2xp) + ' XP and ' + n(17 * o.v2gold) + ' g a day').join('; '));
  console.log('plot tiers: ' + Object.entries(PLOT_TIER_PRICES).map(([lv, p]) => 'tier ' + lv + ' ' + n(p.gold) + ' g at Farming ' + p.farming).join('; ') + ' = ' + n(Object.values(PLOT_TIER_PRICES).reduce((t, p) => t + p.gold, 0)) + ' g');
  console.log('beds: property ' + PROPERTY_TIERS.map((t) => t.plots).join('/') + ' + the Garden +1 to +5 = at most ' + (PROPERTY_TIERS[PROPERTY_TIERS.length - 1].plots + 5));
  console.log('presses a visit, N beds all ready: N harvest-and-replant + N water = 2N, one at a time (no harvest-all, no water-all; plant-all exists). 6 beds 12, 12 beds 24, 17 beds 34.');
  row('Farming level', 'XP to reach it', 'XP to the next');
  row('---', '---', '---');
  for (const lv of [10, 30, 50, 70, 88, 99]) row(lv, n(skillXpForLevel('farming', lv)), n(skillXpForLevel('farming', lv + 1) - skillXpForLevel('farming', lv)));
}

function training() {
  const R = TRAINING_RULES;
  const all = SINK_RULES.house_dummy.prices.reduce((x, y) => x + y, 0);
  console.log('\nTRAINING (training.js, gold-sinks.js house_dummy, core/xp.js skillXpForLevel). READ FROM DATA.');
  row('Skill level', 'Yard fee an hour', 'Skill XP to the next level', 'Yard hours a level', 'Gold a level at the yard', 'Levels a 12 h session', 'Dummy rung 1 (' + n(SINK_RULES.house_dummy.prices[0]) + ') pays back after, yard hours', 'All four rungs (' + n(all) + '), yard hours');
  row(...Array(8).fill('---'));
  for (const lv of [10, 20, 30, 45, 60, 80, 110]) {
    const need = skillXpForLevel('melee', lv + 1) - skillXpForLevel('melee', lv);
    let xp = 12 * R.xpPerHour, l = lv, got = 0;
    while (xp > 0) { const nx = skillXpForLevel('melee', l + 1) - skillXpForLevel('melee', l); if (xp >= nx) { xp -= nx; l++; got++; } else { got += xp / nx; xp = 0; } }
    row(lv, n(trainingFee(lv)), n(need), (need / R.xpPerHour).toFixed(1), n(need / R.xpPerHour * trainingFee(lv)), got.toFixed(1), n(SINK_RULES.house_dummy.prices[0] / trainingFee(lv)), n(all / trainingFee(lv)));
  }
  console.log('dummy rungs: ' + SINK_RULES.house_dummy.prices.map(n).join(' / ') + ' in the order the account picks skills.');
  console.log('training items: ' + TRAINING_GEAR.hours.map((h) => h + ' h for ' + n(TRAINING_GEAR.gold[h]) + ' g = ' + n(TRAINING_GEAR.gold[h] / h) + ' g an hour for +' + n(R.xpPerHour) + ' XP an hour over the plain rate (' + (TRAINING_GEAR.gold[h] / (h * R.xpPerHour)).toFixed(2) + ' g a skill XP)').join('; ') + '; ' + TRAINING_GEAR.buyPerDay + ' a day an account.');
  console.log('min Level ' + R.minLevel + ', a session at most ' + R.maxHours + ' h, the dummy needs the ' + R.houseTier + '.');
}

const cmd = process.argv[2] || 'all';
const run = { ladder, rooms, benches, storage, farm, training };
if (cmd === 'all') for (const f of Object.values(run)) f();
else if (run[cmd]) run[cmd]();
else { console.error('home.mjs: ladder | rooms | benches | storage | farm | training | all'); process.exit(2); }
void REF_POINTS;
