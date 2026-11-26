#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/sinks/ledger.mjs — THE GOLD LEDGER: AN ACCOUNT-DAY MODEL OF WHAT IS MINTED AND WHAT BURNS (lane/sn-sinks,
//   game designer, 2026-11-26; docs/design/redesign/20-v030-the-roads.md lane SN and gate 7, 09-crafting.md sections 5.6 and 5.8 item 6,
//   04-math-strategy.md section 11 `sinkOverFaucet`, 21-flame-temper-imbue-loot.md T4).
//
//   node tools/balance-program/redesign/sinks/ledger.mjs [--days 180] [--json <out.json>]
//
// READ-ONLY. It writes nothing but --json. Exit 0 when it ran, 2 on a bad argument.
//
// WHAT IT DOES. Walks each profile's account (four heroes) day by day for --days days. Each day every hero hunts its own day plus the blocks
// its plan buys, gains Levels on the hours table, and the account mints and burns gold. The ledger is cumulative: sinks over minted from
// day 1 to day 30 and to day 180 (04: "for a server at day 30 and day 180"), plus the purse in days of net income (04's "proves it wrong":
// gold held that grows without limit in days of income). The castle is 0: it ships later and takes the ledger to 95 to 100% (20 section 2).
//
// WHERE EACH NUMBER COMES FROM (each printed with its label):
//   MEASURED  pay a hunted hour over the wage, coin's share of it, the Steady four's uses an hour priced at the buyer's store step, Bold's
//             deaths a hero-hour: the kept real-engine reading (tests/econ-levers.mjs REPORT, the tuning pass's Muster Barrows four, 8 seeds x
//             10 h at Levels 60 to 70); kit labor a hunted hour (trades/measured.json, 09 5.3). Off Levels 60 to 70 the wage is the law
//             (src/data/wage.js): every share is held at the measured Level's.
//   PRICED    every sink through the server's own rule on the shipped rows: the hunting block (src/core/wage.js blockPrice), the Blessing
//             (blessingPrice), the Talent reset (resetPrice), Temper (src/data/temper.js TEMPER_STEPS), the imbuement fee (imbue-rules.js
//             IMBUE), carry-over (gear-steps.js CARRY), the job fee (trades.js TRADE_LEVERS), the hall (homestead-tiers.js, shops.js deeds)
//   ASSUMED   how a profile plays (PROFILES below): hours, stance, who crafts, how often a build is reset, which Rares are carried. The
//             09 5.1 mix is SPECULATIVE (09 says so); the reference company is the redesign's (04 section 1: a mixed four, MID, Steady,
//             on its own ground, the full day).
// Not counted (each under 1% of minted, or a choice with no reference rate): looks and town shows (gold-sinks.js powders, rounds, crier,
// colors), renames, faction pieces (25: under 1%), bought work blocks (a rational company never buys one to make its own kit: two hours
// for 1.0 hour of wage make 2.9 hunted hours of kit the store sells for 0.6), and every market fee (no market in v0.3.0).
// ═════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const DAYS = Number(arg('days', 180));
if (!Number.isInteger(DAYS) || DAYS < 30) { console.error('ledger: --days is a whole number of days, 30 at least'); process.exit(2); }
/* the band gate 7 reads (20 section 5: sinks burn 85 to 90% of minted coin with no castle) */
export const SINK_BAND = Object.freeze([0.85, 0.9]);

const { wage } = await imp('src/data/wage.js');
const { wageListPrice } = await imp('src/data/wage.js');
const { blockPrice, blessingPrice, resetPrice, depthStep } = await imp('src/core/wage.js');
const { levelHoursOf } = await imp('src/data/core-model.js');
const { BLESSING } = await imp('src/data/blessings.js');
const { TEMPER_STEPS } = await imp('src/data/temper.js');
const { IMBUE, IMBUE_RULES, imbueBandOf } = await imp('src/data/imbue-rules.js');
const { GEAR_STEPS } = await imp('src/data/gear-steps.js');
const { rankQuote, seatPrice } = await imp('src/core/temper-steps.js');
const { applyFee } = await imp('src/core/imbue.js');
const { carryFee } = await imp('src/core/carry-over.js');
const { DROP_HOURS } = await imp('src/data/drop-hours.js');
const { TRADE_LEVERS } = await imp('src/data/trades.js');
const { STORE_KIT } = await imp('src/data/store-kit.js');
const { WORK_DAY } = await imp('src/data/work-day.js');
const { storeUsePrice } = await imp('src/data/supply-basics.js');
const { PROPERTY_TIERS, ROOM_RUNGS, HELD_HOME_ROOMS } = await imp('src/data/homestead-tiers.js');
const { PROPERTY_HOURS_PM } = await imp('src/data/shops.js');
/* the kept real-engine reading: tests/econ-levers.mjs REPORT (its EL-SINK arm holds the two the same; not imported here, which would loop) */
export const KEPT_READING = 'tools/balance-program/redesign/tuning/final/c0-muster-ref.json';
const REPORT = KEPT_READING;
const { DANGER_GROUNDS, PAY } = await imp('src/data/danger.js');

const r3 = (x) => Math.round(x * 1000) / 1000;
const pct = (x) => (x * 100).toFixed(1) + '%';

/* ── MEASURED: the kept reading ─────────────────────────────────────────────────────────────────────────────────────────────── */
const report = JSON.parse(readFileSync(join(ROOT, REPORT), 'utf8'));
const trades = JSON.parse(readFileSync(join(ROOT, 'tools/balance-program/redesign/trades/measured.json'), 'utf8'));
const MUSTER = 'muster_barrows';
const HEROES = 4;
/* a stance's hour, as shares of the wage at its Level: pay, coin, the store kit at the buyer's step (tests/econ-levers.mjs EL-KIT's bill) */
function hourOf(id) {
  const c = report.cells[id];
  const pay = c.gold.incomePerHeroH.mean;
  const bill = Object.entries(c.kitIds || {}).reduce((s, [k, n]) => s + n * (storeUsePrice(k, depthStep(MUSTER, c.held && c.held.mean)) || 0), 0);
  const hours = report.seeds * report.hours * HEROES;
  return { id, L: c.L, payX: pay / wage(c.L), coinShare: c.gold.coinPerHeroH.mean / pay, storeShare: bill / pay, deathsPerHeroH: (c.deaths || 0) / hours };
}
const HOUR = { steady: hourOf('base:steady'), bold: hourOf('base:bold') };
/* kit labor a hunted hour (09 5.3, measured on the engine's burn), plus the imbuements' Artificing (IMBUE.workPm a make, 3 a hero) */
const KIT_WORK = trades.labor.kitWorkMeasuredSteadyL60 + (3 * IMBUE.workPm) / 1000 / IMBUE.hours;
const WORK_DAY_H = WORK_DAY.freeMin / 60;

/* THE CONTENT v0.3.0 OPENS (20 section 1.2: the four staged grounds, the Catacombs' wings among them, wait for their art). A hero past the
   deepest open ground holds deeper on it, so its pay follows that depth up to PAY.gapMax steps past the ground's reference (src/core/wage.js
   depthStep), then stops. Goods (Temper, imbuements, carry-over) are priced at the step of the gear they sit on, never past the open grounds. */
const STAGED = new Set(argv.includes('--all-grounds') ? [] : ['carters_rest', 'ox_road', 'wyvern_roost', 'catacomb_bone_wing', 'catacomb_flooded_wing']);
const TOP_REF = Math.max(...Object.entries(DANGER_GROUNDS).filter(([id]) => !STAGED.has(id)).map(([, g]) => g.refLevel));
const OPEN = Object.entries(DANGER_GROUNDS).filter(([id]) => !STAGED.has(id)).map(([, g]) => g);
const payStep = (L) => Math.min(L, TOP_REF + PAY.gapMax);
const goodsStep = (L) => Math.min(L, TOP_REF);
/* the item Level a hero of Level L wears: the base tier of the deepest open ground it may enter (its gear's home) */
const gearOf = (L) => Math.max(1, ...OPEN.filter((g) => g.entryLevel <= L).map((g) => g.gearLevel || 1));

/* ── PRICED: each sink at the server's rule ─────────────────────────────────────────────────────────────────────────────────── */
const SLOTS = Object.keys(GEAR_STEPS.slotPm);
/* Temper on a whole kit, the server's twins (src/core/temper-steps.js): rank r's gold fee on every slot (its kits are the company's own
   Smithing labor), and the re-seat of every held rank onto a new base tier */
const temperRankGold = (rank, iL) => SLOTS.reduce((s, slot) => s + ((rankQuote(slot, rank, iL) || {}).fee || 0), 0);
const temperSeatGold = (ranks, iL) => SLOTS.reduce((s, slot) => s + seatPrice(slot, ranks, iL), 0);
const IMBUE_FROM = Math.min(...Object.keys(IMBUE_RULES).map((id) => imbueBandOf(id)));
const TRAITS_FROM = Math.min(...OPEN.filter((g) => Array.isArray(g.traits) && g.traits.length).map((g) => g.entryLevel || 999));
/* the hall: deeds in order, then each room's rungs once its deed is held (trophy and shrine are held off sale) */
const HALL = (() => {
  const out = [];
  PROPERTY_TIERS.forEach((t, i) => {
    if (PROPERTY_HOURS_PM[t.id]) out.push({ what: 'deed ' + t.id, tier: i, gold: wageListPrice(PROPERTY_HOURS_PM[t.id], t.step) });
    for (const room of t.rooms) if (!HELD_HOME_ROOMS.includes(room)) (ROOM_RUNGS[room] || []).forEach((r, n) => out.push({ what: room + ' ' + (n + 1), tier: Math.max(i, r.tier || 0), gold: r.cost.gold }));
  });
  return out;
})();

/* ── ASSUMED: the profiles ──────────────────────────────────────────────────────────────────────────────────────────────────── */
//   ownH        hunted hours a hero a day from its own day (the 10 h day, CLAUDE.md section 1)
//   blocks      the plan's standing rule: buy up to this many hunting blocks a hero a day (lane B1 builds it)
//   bold        share of hunted hours on Bold (the rest Steady); a Blessing is kept after every death past its free Level
//   crafts      share of the company that runs its kit trades (the rest is store-fed), held under the labor it has
//   imbues      share of heroes that keep three imbuements once the parts' band opens
//   resets      paid Talent resets a hero a day (the first of the day's price)
//   carry       share of Rares a hero carries onto a new base (09 5.6: one in five)
//   hall        buys the hall's next deed or rung when the purse holds it over the reserve
//   reserveH    the purse a plan keeps before it buys a block or a rung, hours of wage at the top hero's Level
//   workUsed    share of the work day the company works (09 5.1 uses 0.8 for a server; a company on its plan works all of it)
const REFERENCE = { ownH: 10, blocks: 2, bold: 0, crafts: 1, imbues: 1, resets: 0.2, carry: 0.2, hall: false, reserveH: 20, workUsed: 1 };
export const PROFILES = Object.freeze({
  reference: { ...REFERENCE, label: 'REFERENCE: the full 10 h day, Steady, crafts its kit, the block rule at 2 (04 section 1, 20 section 4)' },
  'reference, rule at 1': { ...REFERENCE, blocks: 1, label: 'the same company, the block rule at 1' },
  'reference, no rule': { ...REFERENCE, blocks: 0, label: 'the same company, no block rule (what blocks carry)' },
  'reference, buys the hall': { ...REFERENCE, hall: true, label: 'the reference, buying the next deed or rung whenever the purse holds it' },
  'reference, works 0.8 of its day': { ...REFERENCE, workUsed: 0.8, label: 'the reference, working 0.8 of its work day (09 5.1)' },
  'full day, store-fed': { ...REFERENCE, crafts: 0, label: 'the full day, no kit trades: every use bought at the store' },
  'mix 6 h': { ownH: 6, blocks: 0, bold: 0.1, crafts: 0.7, imbues: 0.7, resets: 0.1, carry: 0.2, hall: true, reserveH: 20, workUsed: 0.8, label: '09 5.1 mix: 6 h a hero (SPECULATIVE)' },
  'mix 2 h': { ownH: 2, blocks: 0, bold: 0.1, crafts: 0.7, imbues: 0.7, resets: 0.05, carry: 0.2, hall: true, reserveH: 20, workUsed: 0.8, label: '09 5.1 mix: 2 h a hero (SPECULATIVE)' },
});
/* 09 5.1's mix on the 10 h day: 20% play the full day with the rule (the reference), 50% 6 h, 30% 2 h (SPECULATIVE) */
export const MIX = Object.freeze({ reference: 0.2, 'mix 6 h': 0.5, 'mix 2 h': 0.3 });

/** One account of profile `p` over `days` days: the cumulative ledger at day 30 and at the last day, each line in gold. */
export const PRICING = Object.freeze({ blockPrice, blessingPrice, resetPrice });
export function runAccount(p, days = DAYS, pricing = PRICING) {
  const { blockPrice, blessingPrice, resetPrice } = pricing;
  const heroes = Array.from({ length: HEROES }, () => ({ L: 1, into: 0, ranks: 0, tier: 0, held: 0 }));
  let purse = 0, hallAt = 0;
  const lines = () => ({ coin: 0, loot: 0, floor: 0, storeKit: 0, jobFee: 0, imbue: 0, temper: 0, carry: 0, bless: 0, reset: 0, block: 0, hall: 0 });
  const total = lines();
  const snaps = {};
  const credit = (k, g) => { total[k] += g; purse += g; };
  const burn = (k, g) => { total[k] += g; purse -= g; };
  for (let day = 1; day <= days; day++) {
    const top = Math.max(...heroes.map((h) => h.L));
    const reserve = p.reserveH * wage(top);
    let laborNeed = 0, hunted = 0;
    const mintedBefore = total.coin + total.loot + total.floor;
    /* the plan's block rule, hero by hero, while the purse holds the reserve after the price */
    const blocksOf = heroes.map((h) => {
      let n = 0;
      while (n < p.blocks) { const g = blockPrice({ kind: 'hunt', level: h.L, n: n + 1 }); if (g === null || purse - g < reserve) break; burn('block', g); n++; }
      return n;
    });
    heroes.forEach((h, i) => {
      const H = p.ownH + blocksOf[i] * 2;
      hunted += H;
      const w = wage(payStep(h.L)), wg = wage(goodsStep(h.L));
      for (const [stance, share] of [['steady', 1 - p.bold], ['bold', p.bold]]) {
        if (!share) continue;
        const hr = HOUR[stance], gross = H * share * hr.payX * w;
        credit('coin', gross * hr.coinShare);
        credit('loot', gross * (1 - hr.coinShare));
        h.kit = (h.kit || 0) + gross * hr.storeShare; /* the day's kit at the store's ask, split below by labor */
        const deaths = H * share * hr.deathsPerHeroH;
        if (deaths && h.L >= BLESSING.freeUntilLevel) burn('bless', deaths * blessingPrice(h.L));
      }
      laborNeed += H * KIT_WORK;
      /* imbuements: three, each lasting IMBUE.hours hunted hours: the apply fee (src/core/imbue.js, on the worn piece's item Level, x ramp)
         and the Artificing job's fee on its V (work-hours x townWageShare x the wage at the part's band, 13-market 3.2) */
      const iL = gearOf(h.L);
      if (h.L >= IMBUE_FROM) burn('imbue', p.imbues * H * 3 / IMBUE.hours * (applyFee(iL, h.L) + TRADE_LEVERS.jobFee * (IMBUE.workPm / 1000) * STORE_KIT.townWageShare * wg));
      /* carry-over: a Rare every DROP_HOURS.rarity.rare.everyHours a hero, `carry` of them moved at rank 2 */
      if (h.L >= TRAITS_FROM) burn('carry', H / DROP_HOURS.rarity.rare.everyHours * p.carry * carryFee(GEAR_STEPS.traitSteps[1], iL));
      /* resets */
      burn('reset', p.resets * resetPrice(h.L, 0));
      /* Levels on the hours table */
      h.into += H;
      while (h.into >= levelHoursOf(h.L)) { h.into -= levelHoursOf(h.L); h.L++; }
      /* Temper: a rank on every slot when it opens, a re-seat of the held ranks when the hero moves to a new base tier (D-3) */
      const gear = gearOf(h.L);
      if (gear > h.tier && h.ranks) burn('temper', temperSeatGold(h.ranks, gear));
      h.tier = Math.max(h.tier, gear);
      const open = Math.min(TEMPER_STEPS.ranks, Math.floor(h.L / TEMPER_STEPS.rankEvery));
      while (h.ranks < open) { h.ranks++; burn('temper', temperRankGold(h.ranks, gear)); }
    });
    /* the kit: the company's own labor makes what it can (a job fee on its V), the store sells the rest */
    const labor = HEROES * WORK_DAY_H * p.workUsed;
    const crafted = p.crafts * Math.min(1, labor / laborNeed);
    const kit = heroes.reduce((s, h) => s + (h.kit || 0), 0);
    heroes.forEach((h) => { h.kit = 0; });
    burn('storeKit', kit * (1 - crafted));
    burn('jobFee', kit * crafted / STORE_KIT.storeCeiling * TRADE_LEVERS.jobFee);
    /* the store floor: idle work-hours sold at the floor (09 5.5), capped by the account's daily budget */
    const idle = Math.max(0, labor - laborNeed * crafted);
    credit('floor', Math.min(idle * TRADE_LEVERS.store.floorShare * STORE_KIT.townWageShare, TRADE_LEVERS.store.budgetHours) * wage(top));
    /* the hall */
    while (p.hall && hallAt < HALL.length && purse - HALL[hallAt].gold >= reserve) { burn('hall', HALL[hallAt].gold); hallAt++; }
    if (day === 30 || day === days) snaps[day] = { ...total, purse, dayMinted: total.coin + total.loot + total.floor - mintedBefore, levels: heroes.map((h) => h.L), rungs: hallAt, hunted };
  }
  return snaps;
}

const MINTED = ['coin', 'loot', 'floor'];
const SINKS = ['storeKit', 'jobFee', 'imbue', 'temper', 'carry', 'bless', 'reset', 'block', 'hall'];
const sum = (s, ks) => ks.reduce((a, k) => a + s[k], 0);
export function readOf(s) {
  const minted = sum(s, MINTED), sinks = sum(s, SINKS);
  return { minted, sinks, ratio: sinks / minted, coinOnly: sinks / (s.coin + s.floor), share: Object.fromEntries(SINKS.map((k) => [k, s[k] / minted])) };
}

/** Gate 7's reading: the reference company at day 180, without and with its hall, sinks over minted. `pricing` plants a defect (tests). */
export function referenceReading(pricing = PRICING) {
  return { reference: readOf(runAccount(PROFILES.reference, 180, pricing)[180]).ratio, withHall: readOf(runAccount(PROFILES['reference, buys the hall'], 180, pricing)[180]).ratio };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = { days: DAYS, report: REPORT, hour: HOUR, kitWork: r3(KIT_WORK), workDayH: WORK_DAY_H, imbueFrom: IMBUE_FROM, traitsFrom: TRAITS_FROM, profiles: {} };
  console.log('THE GOLD LEDGER (lane/sn-sinks): sinks over minted, cumulative from day 1, four heroes an account, castle 0');
  console.log(`  MEASURED (${REPORT}): Steady pays ${r3(HOUR.steady.payX)} of the wage an hour, coin ${pct(HOUR.steady.coinShare)} of it, the store kit ${pct(HOUR.steady.storeShare)}; Bold pays ${r3(HOUR.bold.payX)}, kit ${pct(HOUR.bold.storeShare)}, ${r3(HOUR.bold.deathsPerHeroH * 10)} deaths a hero a 10 h day`);
  console.log(`  kit labor ${r3(KIT_WORK)} work-hours a hunted hour (trades/measured.json + imbuements); ${WORK_DAY_H} h work day a hero; imbuements from Level ${IMBUE_FROM}, Traits from ${TRAITS_FROM}`);
  for (const [name, p] of Object.entries(PROFILES)) {
    const snaps = runAccount(p);
    out.profiles[name] = { profile: p, snaps };
    console.log('\n' + name + ': ' + p.label);
    for (const d of [30, DAYS]) {
      const s = snaps[d], r = readOf(s);
      const daysHeld = s.purse / s.dayMinted;
      console.log(`  day ${String(d).padStart(3)}  sinks ${pct(r.ratio)} of minted (coin only ${pct(r.coinOnly)})  Levels ${s.levels.join('/')}  hall rungs ${s.rungs}/${HALL.length}  purse ${daysHeld.toFixed(1)} days of minting`);
      console.log('           ' + SINKS.map((k) => k + ' ' + pct(r.share[k])).join('  '));
    }
  }
  /* the server on 09 5.1's mix, weighted by what each profile mints */
  console.log('\nTHE SERVER on 09 5.1\'s mix (20% reference, 50% at 6 h, 30% at 2 h; SPECULATIVE):');
  out.mix = {};
  for (const d of [30, DAYS]) {
    let m = 0, sk = 0;
    for (const [name, w] of Object.entries(MIX)) { const r = readOf(out.profiles[name].snaps[d]); m += w * r.minted; sk += w * r.sinks; }
    out.mix[d] = sk / m;
    console.log(`  day ${String(d).padStart(3)}  sinks ${pct(sk / m)} of minted`);
  }
  const j = arg('json');
  if (j) writeFileSync(resolve(ROOT, j), JSON.stringify(out, null, 1) + '\n');
}
