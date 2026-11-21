// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/gold-model.mjs — THE GOLD MODEL (balance program, dive 24 economy, question 1).
//
//   node tools/balance-program/gold-model.mjs            the weekly table: seven players x six Levels, every faucet and sink a row
//   node tools/balance-program/gold-model.mjs --shelf    the one-time shelf by Level, and weeks of free gold it is for each player
//   node tools/balance-program/gold-model.mjs --offers   every gold-for-power and gold-for-time offer on one line (question 3)
//   node tools/balance-program/gold-model.mjs --refills  the six refills at every Level against what their 4 h earn (question 4)
//   node tools/balance-program/gold-model.mjs --slots    hero slot ladders: Level on one hero before slot 2, weeks a slot for each player
//
// NO PLAY, no production read, writes nothing. Inputs: ref.json (MEASURED harness), the REAL rows of
// docs/design/balance-program/10-real-players.md typed in below with their section, and the price rows of src/data/*.
// Every number is labelled where it is printed. Exit 0 when it ran.
//
// IMPORTED, it prints nothing: the balance guard (tests/balance-guard.mjs) reads the hero slot's shop price (offer) and the CITED
// bank one lone hero holds by a Level (BANK, levelAtBank, lerp) from here, so guard line G9 and dive 24 read the same numbers.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { REFERENCE_PLAYERS, REF_POINTS } from './model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const data = (f) => import(pathToFileURL(join(ROOT, 'src', 'data', f)).href);
const REF = JSON.parse(readFileSync(join(HERE, 'ref.json'), 'utf8'));
const { STAMINA_REFILL } = await data('stamina-refill.js');
const { blessingPrice } = await data('blessings.js');
const { TEMPER_TIERS } = await data('temper.js');
const { SINK_RULES } = await data('gold-sinks.js');
const { TOWN_WORKS } = await data('town-works.js');
const { BANK_LADDER } = await data('gold-ladders.js');
const { HELD_HOME_ROOMS } = await data('homestead-tiers.js');
const { TRAINING_GEAR, TRAINING_RULES } = await data('training.js');
const shops = await data('shops.js');

const LEVELS = [10, 30, 50, 80, 105, 118];
const POINT = { 10: 'thicket', 30: 'glade', 50: 'ford', 80: 'pyre', 105: 'hold', 118: 'rest' };
const k = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(Math.abs(n) >= 1e5 ? 0 : 1) + 'k' : String(Math.round(n)));
const has = (f) => process.argv.includes('--' + f);

/* ── a hero-hour of a FOUR, gold. REAL to Level 84 (10-real-players section 2, "Level XP and coin a hero-hour by Level band and party
   size", party 4: coin 4,135 / 4,694+7,250 / 11,291 / 13,211; section 4: sold loot is 0.366 of coin over all real accounts; the store
   bill is 8% of coin untiered, 12 to 14% on the accounts hunting at 30 to 55, 48% on recorded Deadly at 60 to 79, with a third of all
   supplies home-made inside those numbers). Level 50 sits where the store share jumps, so it carries a range. Past 84 nobody has
   played: income is the harness four's times 0.92 and the store bill the harness's times 0.26 (both the real-over-harness ratios
   at Pyre Field), ASSUMED, with the harness's own "buys two thirds at the store" figure as the low end. ── */
const FOUR = {
  10: { coin: 4135, sold: 1513, store: 331, label: 'REAL, thin (29 h)' },
  30: { coin: 5978, sold: 1186, store: 690, label: 'REAL (one account, 349 h)' },
  50: { coin: 11291, sold: 4133, store: 3387, storeLow: 1581, storeHigh: 5420, label: 'REAL coin (266 h); store 14 to 48% of coin, the middle ASSUMED' },
  80: { coin: 13211, sold: 4717, store: 6341, label: 'REAL, thin (183 h, one person)' },
};
for (const L of [105, 118]) {
  const h = REF.points[POINT[L]].seats.four, inc = Math.round(h.incomePerH * 0.92);
  FOUR[L] = { coin: Math.round(inc / 1.366), sold: inc - Math.round(inc / 1.366), store: Math.round(h.storePerH * 0.26), lowNet: Math.round(h.incomePerH - h.storePerH * 2 / 3),
    label: 'ASSUMED (harness x real ratios at Pyre Field); the harness alone says ' + Math.round(h.incomePerH - h.storePerH * 2 / 3) };
}
/* a LONE hero-hour: REAL under Level 16 (section 2: coin 1,894 alone; the two real new players sold nothing and bought 5 to 233 an hour),
   the harness lone hammer from Level 30 (real lone play past Level 30 is 10 hours). Sold loot there is inside incomePerH. */
const LONE = { 10: { coin: 1894, sold: 0, store: 120, label: 'REAL, thin (78 h alone at 1 to 15)' } };
for (const L of LEVELS.slice(1)) { const h = REF.points[POINT[L]].seats.lone; LONE[L] = { coin: Math.round(h.incomePerH / 1.366), sold: h.incomePerH - Math.round(h.incomePerH / 1.366), store: h.storePerH, label: 'MEASURED harness, lone hammer Normal' }; }

const TALLY_SHARE = 0.02;                       /* REAL: 249,155 of 14.27M */
/* refill i (from 0) costs (stepDen + stepNum x i) / stepDen of the first (src/data/stamina-refill.js; x1, 1.5 ... 3.5 since 2026-11-20, call 24-1) */
const refillStep = (i) => (STAMINA_REFILL.stepDen + STAMINA_REFILL.stepNum * i) / STAMINA_REFILL.stepDen;
const refillDay = (L, n) => { let s = 0; const b = STAMINA_REFILL.base + STAMINA_REFILL.perLevel * L; for (let i = 0; i < Math.floor(n); i++) s += b * refillStep(i); return s + b * refillStep(Math.floor(n)) * (n - Math.floor(n)); };
const deathsAnHour = (lone, L) => (lone ? (L <= 15 ? 0.089 : L <= 30 ? 0.032 : 0.02) : (L <= 30 ? 0.02 : L <= 44 ? 0.011 : L <= 64 ? 0.004 : 0.001)); /* REAL section 2 and 8; past the data ASSUMED */
const blessSet = (L) => blessingPrice(1, L) + blessingPrice(2, L) + blessingPrice(3, L);

function cell(pl, L) {
  const lone = pl.seat === 'lone';
  const r = lone ? LONE[L] : FOUR[L];
  const hours = pl.heroes * pl.huntHoursADay * 7;
  /* stock: the REAL four rows already hold a third home-made. The Buyer buys all of it (x1.5); the Ceiling makes all of it (0). */
  const storeMult = lone ? 1 : pl.stock === 'market' || pl.stock === 'store' ? 1.5 : pl.stock === 'own' ? 0 : 1;
  const coin = r.coin * hours, sold = r.sold * hours, tally = (coin + sold) * TALLY_SHARE;
  const store = r.store * storeMult * hours;
  /* 12 hunted hours a day need no refill (model.mjs REFERENCE_PLAYERS: drain and rest are 1:1); only the Ceiling's 24 buys all six */
  const refills = refillDay(L, pl.refillsADay) * pl.heroes * 7;
  const bless = blessSet(L) * deathsAnHour(lone, L) * hours;
  const tax = (L <= 30 ? 10 : 0) * hours;                     /* REAL 10 an hour; a room at rung 1 ends it */
  const small = pl.spends >= 0.9 ? 78 * hours : 0;            /* REAL: the one account that uses the crier's neighbours (powders, rounds, Works) */
  const inn = coin + sold + tally, out = store + refills + bless + tax + small;
  return { hours, coin, sold, tally, inn, store, refills, bless, tax, small, out, free: inn - out, spendable: (inn - out) * pl.spends, perHour: (inn - out) / hours, label: r.label, lowNet: r.lowNet };
}

/* ── the one-time shelf: what has OPENED by a Level and is bought once (a four-hero account; h = a hero). READ FROM DATA. ── */
export const offer = (id) => { let g = null; const walk = (o) => { if (!o || typeof o !== 'object' || g !== null) return; if ((o.id === id || o.offer_id === id) && Array.isArray(o.cost)) { g = (o.cost.find((c) => c.id === 'gold') || {}).amount || 0; return; } for (const v of Object.values(o)) walk(v); }; walk(shops); if (g === null) throw new Error('no offer ' + id); return g; };
const sum = (ids) => ids.reduce((s, id) => s + offer(id), 0);
/* the rooms on sale: a room held whole (src/data/homestead-tiers.js HELD_HOME_ROOMS: the Trophy room, the Shrine since 2026-11-20) sells no rung */
const ROOMS = ['cellar', 'forge', 'garden', 'kitchen', 'library', 'shrine', 'trophy', 'workshop'].filter((r) => !HELD_HOME_ROOMS.includes(r));
const CHEAP = ['cellar', 'garden', 'shrine', 'trophy'].filter((r) => ROOMS.includes(r)), BENCH = ['forge', 'kitchen', 'library', 'workshop'];
const rooms = (from, to, set = ROOMS) => sum(set.flatMap((r) => Array.from({ length: to - from + 1 }, (_, i) => 'room.' + r + '.' + (from + i))));
const temper = (t) => TEMPER_TIERS[t].reduce((s, n) => s + n, 0) * 2;
const HALLMARK = { 2: 25000, 3: 100000, 4: 150000, 5: 250000, 6: 400000, 7: 600000 };   /* RULED 11-18; tiers 2 and 3 built */
const REFORGE = { 2: 150000, 3: 450000, 4: 300000, 5: 600000, 6: 900000, 7: 1200000 };  /* six pieces carried up, itemization-plan section 10 */
const SHELF = [
  { L: 10, rows: [['Homestead and Farmstead', sum(['property.homestead', 'property.farmstead']), 1], [CHEAP.map((r) => r[0].toUpperCase() + r.slice(1)).join(', ') + ', rungs 1 to 3', rooms(1, 3, CHEAP), 1], ['Setup slots 4 and 5', SINK_RULES.setup_slot.prices.reduce((a, b) => a + b, 0), 'h'], ['Key Ring', 25000, 1]] },
  { L: 30, rows: [['Hero slot 2', offer('character_slot.1'), 1], ['Hero slot 3', offer('character_slot.2'), 1], ['Manor', offer('property.manor'), 1], ['Forge, Kitchen, Library, Workshop, rungs 1 to 2 (each ends its bench tax)', rooms(1, 2, BENCH), 1], ['Tempering tier 2, both tracks', temper(2), 'h'], ['Six crafted pieces Hallmarked, tier 2', REFORGE[2], 'h', 1]] },
  { L: 50, rows: [['Hero slot 4', offer('character_slot.3'), 1], ['Keep', offer('property.keep'), 1], ['The bench rooms to rung 4, the other four rooms rung 4', rooms(3, 4, BENCH) + rooms(4, 4, CHEAP), 1], ['House dummy, four skills', SINK_RULES.house_dummy.prices.reduce((a, b) => a + b, 0), 1], ['Tempering tiers 3 and 4, both tracks', temper(3) + temper(4), 'h'], ['Six pieces carried to tiers 3 and 4 (tier 4 fee RULED, not built)', REFORGE[3] + REFORGE[4], 'h', 1]] },
  { L: 80, rows: [['Rooms, rung 5', rooms(5, 5), 1], ['Castle', offer('property.castle'), 1], ['Tempering tiers 5 and 6, both tracks', temper(5) + temper(6), 'h'], ['Six pieces carried to tiers 5 and 6 (RULED, not built)', REFORGE[5] + REFORGE[6], 'h', 1]] },
  { L: 105, rows: [['Tempering tier 7, both tracks', temper(7), 'h'], ['Six pieces carried to tier 7 (RULED, not built)', REFORGE[7], 'h', 1]] },
  { L: 118, rows: [['Nothing new is built past Krell (linings, worn in and unique reforges are designed)', 0, 1]] },
];
const bankAll = BANK_LADDER.reduce((s, r) => s + r.gold, 0);

function weekly() {
  console.log('### Gold a week, by player and Level (gold; a week = heroes x hunt hours a day x 7; every player 12 h a hero a day, RULED 2026-11-21, the Ceiling 24)\n');
  for (const L of LEVELS) {
    const cells = REFERENCE_PLAYERS.map((pl) => [pl, cell(pl, L)]);
    console.log('**Level ' + L + ' (' + REF_POINTS.find((p) => p.id === POINT[L]).ground.replace(/_/g, ' ') + ').** Four: ' + FOUR[L].label + '. Lone: ' + LONE[L].label + '.\n');
    console.log('| Row | ' + cells.map(([pl]) => pl.name).join(' | ') + ' |');
    console.log('|---|' + cells.map(() => '---').join('|') + '|');
    const row = (name, f) => console.log('| ' + name + ' | ' + cells.map(([pl, c]) => f(c, pl)).join(' | ') + ' |');
    row('Hunted hero-hours a week', (c) => c.hours.toFixed(0));
    row('IN: coin', (c) => k(c.coin)); row('IN: loot sold to the Shop', (c) => k(c.sold)); row('IN: the tally (2% as really claimed)', (c) => k(c.tally));
    row('**Gold in**', (c) => '**' + k(c.inn) + '**');
    row('OUT: store supplies', (c) => k(c.store)); row('OUT: stamina refills', (c) => k(c.refills)); row('OUT: Blessings', (c) => k(c.bless));
    row('OUT: bench tax (until a room)', (c) => k(c.tax)); row('OUT: powders, rounds, the Works', (c) => k(c.small));
    row('**Repeating gold out**', (c) => '**' + k(c.out) + '**');
    row('**Free gold a week** (in less repeating out)', (c, pl) => pl.id === 'whale' ? '**' + k(c.free) + '** + bought' : '**' + k(c.free) + '**');
    row('Free gold a hunted hero-hour', (c) => k(c.perHour));
    row('What it really puts into sinks (its spending share)', (c, pl) => pl.id === 'whale' ? 'no limit' : k(c.spendable) + ' (' + Math.round(pl.spends * 100) + '%)');
    if (FOUR[L].lowNet !== undefined) console.log('\nLow end for every four at this Level, if the harness is right and the real ratios do not hold: ' + k(FOUR[L].lowNet) + ' free gold a hero-hour.');
    if (FOUR[L].storeLow) console.log('\nRange at this Level: the store bill is ' + k(FOUR[L].storeLow) + ' to ' + k(FOUR[L].storeHigh) + ' a hero-hour, so a four is free ' + k(FOUR[L].coin + FOUR[L].sold - FOUR[L].storeHigh) + ' to ' + k(FOUR[L].coin + FOUR[L].sold - FOUR[L].storeLow) + ' a hero-hour.');
    console.log('');
  }
}
function shelf() {
  console.log('### The one-time shelf: what has opened by each Level, list price (READ FROM DATA)\n');
  console.log('| Opens by Level | What | Price | Bought | A four-hero account |\n|---|---|---|---|---|');
  let run = 0, hall = 0; const at = {}, atHall = {};
  for (const s of SHELF) { for (const [name, g, per, isHall] of s.rows) { const four = per === 'h' ? g * 4 : g; run += four; if (isHall) hall += four; console.log('| ' + s.L + ' | ' + name + ' | ' + k(g) + ' | ' + (per === 'h' ? 'a hero' : 'once an account') + ' | ' + k(four) + ' |'); } at[s.L] = run; atHall[s.L] = hall; }
  console.log('| any | Bag rungs, all ' + BANK_LADDER.length + ' (3,000 x 1.32^n) | ' + k(bankAll) + ' | once a hero | ' + k(bankAll) + ' |');
  console.log('\nRunning total of the shelf (Storage rungs left out): ' + LEVELS.map((L) => 'Level ' + L + ' ' + k(at[L])).join(', ') + '.');
  console.log('Of that, Hallmark fees (never paid by a real player; tiers 4 to 7 not built): ' + LEVELS.map((L) => 'Level ' + L + ' ' + k(atHall[L])).join(', ') + '.\n');
  console.log('### Weeks of free gold the NEW shelf of each band is, by player (free gold a week at that Level; in brackets at its real spending share)\n');
  console.log('| Level | New on the shelf (four heroes) | ' + REFERENCE_PLAYERS.filter((p) => p.id !== 'whale').map((p) => p.name).join(' | ') + ' | Buyer |\n|---|---|' + REFERENCE_PLAYERS.map(() => '---').join('|') + '|');
  let prev = 0;
  for (const L of LEVELS) {
    const add = at[L] - prev; prev = at[L];
    console.log('| ' + L + ' | ' + k(add) + ' | ' + REFERENCE_PLAYERS.filter((p) => p.id !== 'whale').map((pl) => { const c = cell(pl, L); const mine = pl.heroes === 1 ? SHELF.find((s) => s.L === L).rows.reduce((s, [, g]) => s + g, 0) : add; return c.free > 0 ? (mine / c.free).toFixed(1) + ' (' + (mine / c.spendable).toFixed(0) + ')' : 'never'; }).join(' | ') + ' | 0 |');
  }
  console.log('\nA one-hero account (New, Four friends) is charged the per-hero rows once.');
}
function refills() {
  console.log('### The six refills against the gold their 4 hours earn (a hero; price READ FROM DATA src/data/stamina-refill.js)\n');
  console.log('| Level | Refill 1 | 2 | 3 | 4 | 5 | 6 | All six | 4 h of a four, free gold | Refill 1 / those 4 h | Refill 6 / those 4 h | 4 h of a lone hero | Refill 1 / lone 4 h |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const L of LEVELS) {
    const b = STAMINA_REFILL.base + STAMINA_REFILL.perLevel * L, p = [0, 1, 2, 3, 4, 5].map((i) => Math.ceil(b * refillStep(i)));
    const f = FOUR[L], four4 = (f.coin + f.sold - f.store) * 4, l = LONE[L], lone4 = (l.coin + l.sold - l.store) * 4;
    console.log('| ' + L + ' | ' + p.map(k).join(' | ') + ' | ' + k(p.reduce((a, c) => a + c, 0)) + ' | ' + k(four4) + ' | ' + (p[0] / four4).toFixed(2) + ' | ' + (p[5] / four4).toFixed(2) + ' | ' + k(lone4) + ' | ' + (lone4 > 0 ? (p[0] / lone4).toFixed(2) : 'n/a') + ' |');
  }
}
function offers() {
  /* XP sizes: CITED. Tempering Blows 5 of 5 +3.1 to +3.8% Level XP (itemization-plan section 10, measured at the Slake and the Glade); 01-model
     section 2: x1.030 at the Ford; tier 7 +2% by rule. A refill: 4 hunt hours. A hero slot: one more hero's whole output. The yard: 30,000 skill XP an hour. */
  console.log('### Gold for power and gold for time, one line each (REF hour = the free gold of one hero-hour of a four at that Level)\n');
  console.log('| Offer | Level | Price | What it gives | REF hours of gold | REF hours for +1% Level XP, or for one hunt hour | Label |\n|---|---|---|---|---|---|---|');
  const net = (L) => FOUR[L].coin + FOUR[L].sold - FOUR[L].store;
  const line = (o, L, price, gives, per, lab) => console.log('| ' + [o, L, k(price), gives, (price / net(L)).toFixed(1), per, lab].join(' | ') + ' |');
  for (const [t, L, pct] of [[2, 30, 3.4], [4, 50, 3.0], [6, 80, 3.4], [7, 105, 2.0]]) {
    const all = TEMPER_TIERS[t].reduce((a, b) => a + b, 0), three = TEMPER_TIERS[t].slice(0, 3).reduce((a, b) => a + b, 0);
    line('Tempering Blows, tier ' + t + ', rungs 1 to 3', L, three, '+' + (pct * 0.6).toFixed(1) + '% XP', (three / net(L) / (pct * 0.6)).toFixed(1) + ' h a 1%', 'CITED size');
    line('Tempering Blows, tier ' + t + ', rungs 4 and 5', L, all - three, '+' + (pct * 0.4).toFixed(1) + '% XP', ((all - three) / net(L) / (pct * 0.4)).toFixed(1) + ' h a 1%', 'CITED size');
  }
  for (const L of [30, 50, 80, 105]) { const b = STAMINA_REFILL.base + STAMINA_REFILL.perLevel * L; line('Stamina refill, first of the day', L, b, '4 hunt hours', (b / net(L) / 4).toFixed(2) + ' h a hunt hour', 'READ FROM DATA'); line('Stamina refill, sixth of the day', L, Math.ceil(b * refillStep(5)), '4 hunt hours', (b * refillStep(5) / net(L) / 4).toFixed(2) + ' h a hunt hour', 'READ FROM DATA'); }
  for (const [i, L] of [[1, 30], [2, 30], [3, 50]]) { const p = offer('character_slot.' + i); line('Hero slot ' + (i + 1), L, p, 'one more hero for good', 'pays itself back in ' + (p / net(L)).toFixed(0) + ' of its own hunt hours', 'READ FROM DATA'); }
  for (const L of [30, 50, 80]) { const sk = Math.round(L * 0.9), fee = TRAINING_RULES.feeBase + TRAINING_RULES.feePerLevel * sk; line('The yard, an hour (skill ' + sk + ')', L, fee, '30,000 skill XP, no stamina', (fee / net(L)).toFixed(2) + ' h an hour trained', 'READ FROM DATA'); }
  line('Training item, 12 h', 50, TRAINING_GEAR.gold[12], '+30,000 skill XP an hour for 12 h', (TRAINING_GEAR.gold[12] / net(50) / 12).toFixed(1) + ' h an hour doubled', 'READ FROM DATA');
  line('House dummy, first skill', 50, SINK_RULES.house_dummy.prices[0], 'the yard with no fee', 'saves ' + (TRAINING_RULES.feeBase + TRAINING_RULES.feePerLevel * 45) + ' an hour: ' + Math.round(SINK_RULES.house_dummy.prices[0] / (TRAINING_RULES.feeBase + TRAINING_RULES.feePerLevel * 45)) + ' trained hours to pay back', 'READ FROM DATA');
  for (const L of [50, 80, 105]) line('Blessings, all three', L, blessSet(L), 'keeps 75% of a death (6% of Level XP)', 'a death is ' + (L === 50 ? 'about 7' : L === 80 ? 'about 17' : 'about 27') + ' hunt hours of XP at the REAL pace; the set is ' + (blessSet(L) / net(L)).toFixed(2) + ' h of gold', 'READ FROM DATA; hours ASSUMED from LEVEL_PACE x 0.35');
  for (const [t, L] of [[3, 50], [5, 80], [7, 105]]) line('Hallmark fee, tier ' + t + ', one piece', L, HALLMARK[t], 'two perks kept at this tier (about +1% a perk, PROPOSED)', (HALLMARK[t] / net(L) / 2).toFixed(1) + ' h a 1%', 'RULED price, PROPOSED size');
  console.log('\nTown Works takes at most ' + k(TOWN_WORKS.weighhouse.perDay) + ' a day an account and the whole project is ' + k(TOWN_WORKS.weighhouse.stages.at(-1).at) + '.');
}

/* ── hero slot ladders (Tyler 2026-11-20: "hero slots should cost even more"). One hero banks the first slot alone; the second is banked by two heroes, the
   third by three, hunting as a party. BANK: gold one lone hero has banked by a Level, every drop sold (CITED board "2026-11-18 Gold by band": 226k / 715k / 679k / 1.29M
   in 15-30 / 30-45 / 45-60 / 60-75; about 50k before 15, ASSUMED). HOURS: the lone pace table (10-real-players section 2, "Lone table"; 60 ASSUMED on its slope). ── */
/* The TYPED board table, for this design read only: the standing guards on the first slot (tests/slot-price-guard.mjs, the balance guard's G9)
   judge a PLAYED life instead (plan audit M4). */
export const BANK = [[1, 0], [15, 50000], [30, 276000], [45, 991000], [60, 1670000], [75, 2960000]];
const HOURS = [[1, 0], [5, 0.32], [10, 6.3], [15, 17.9], [20, 26.6], [25, 37.0], [30, 52.5], [40, 103.1], [50, 165.4], [60, 240]];
export const lerp = (t, x) => { for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t.at(-1)[1]; };
export const levelAtBank = (g) => { for (let L = 1; L <= 75; L += 0.5) if (lerp(BANK, L) >= g) return L; return 75; };
const fourRate = (L) => lerp(LEVELS.map((l) => [l, FOUR[l].coin + FOUR[l].sold - FOUR[l].store]), L);
/* the ladders dive 24 priced; A is RULED (Tyler 2026-11-20, 400k / 1.5M / 4M) and lands in src/data/shops.js with plan lane L06. The balance
   guard's G20 reads A from here beside the shop's own prices. */
export const SLOT_LADDERS = Object.freeze([['Was (to 2026-11-20)', [300000, 750000, 1500000]], ['A (recommended)', [400000, 1500000, 4000000]], ['B', [600000, 1500000, 3000000]], ['C', [300000, 2000000, 6000000]]]);
function slots() {
  /* 'Shipped' is src/data/shops.js as it stands (ladder A since lane/c-approved-rows); the dive's ladders follow. */
  const shipped = [1, 2, 3].map((i) => shops.SHOP_OFFERS.find((o) => o.id === 'character_slot.' + i).cost[0].amount);
  const LADDERS = [['Shipped', shipped], ...SLOT_LADDERS];
  const pls = REFERENCE_PLAYERS.filter((p) => p.id !== 'whale');
  console.log('| Ladder | Slot | Price | Level on arrival | Lone hunted hours (slot 2) | ' + pls.map((p) => p.name + ', weeks').join(' | ') + ' | Buyer |\n|---|---|---|---|---|' + pls.map(() => '---').join('|') + '|---|');
  for (const [name, prices] of LADDERS) {
    const L2 = levelAtBank(prices[0]), h2 = lerp(HOURS, L2);
    /* after slot 2 the heroes hunt together; the Level they are at when the next slot is bought is read from hours hunted at the real party pace (about 0.6 of the lone table's hours) */
    let L = L2, total = {};
    prices.forEach((price, i) => {
      const n = i + 1;
      const cells = pls.map((p) => { const wk = i === 0 ? h2 / (p.huntHoursADay * 7) : price / (n * p.huntHoursADay * 7 * fourRate(L)); total[p.id] = (total[p.id] || 0) + wk; return wk.toFixed(1); });
      console.log('| ' + [name, n + 1, k(price), i === 0 ? L2.toFixed(0) : 'about ' + Math.round(L), i === 0 ? h2.toFixed(0) : '', ...cells, 0].join(' | ') + ' |');
      L = Math.min(75, L + (i === 0 ? 8 : 10));
    });
    console.log('| ' + [name, 'all three', k(prices.reduce((x, y) => x + y, 0)), '', '', ...pls.map((p) => total[p.id].toFixed(1)), 0].join(' | ') + ' |');
  }
}
if (isMain(import.meta.url)) {
  if (has('shelf')) shelf(); else if (has('offers')) offers(); else if (has('refills')) refills(); else if (has('slots')) slots(); else weekly();
  process.exit(0);
}
