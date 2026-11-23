#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/trades/measure.mjs — THE SUPPLY BILL AND A WORK-HOUR'S VALUE ON 09'S FORMULAS (lane/trade-formulas,
//   backend-architect, 2026-11-22; docs/design/redesign/09-crafting.md sections 2.5, 3.7, 4.3, 5.3, 5.5 and 5.8 items 1 to 3).
//
//   node tools/balance-program/redesign/trades/measure.mjs [--from <v1-climb report.json>] [--seeds 200] [--json <out.json>]
//
// READ-ONLY. It prices what the real engine burned and plays the closed-form job; it writes nothing but --json.
//
// THE TWO READINGS
//   THE SUPPLY BILL (09 2.5: crafted 0.2 and store 0.3 of an hour's wage for a kit-hour of all four lines; v0.3.0 sells three of them).
//     The engine's burn is MEASURED: a v1-climb report (--from; the default is the newest committed reading on the Danger scale, the mixed
//     MID four on Muster Barrows from a held start, 6 seeds x 8 h at Levels 60 / 63 / 70 and each stance). Its store buys a hunted
//     hero-hour (kitIds) become HP and mana restored and charges spent; over STORE_KIT's reference rates (refRestore, refCharges) they are
//     kit-hours of the meal and charge lines. src/core/trades.js prices them: crafted at V (the goods' band is the hero's), the store at
//     its ask (a tier behind, at storeCeiling), the imbuement line at three imbuements an hour. Each bill is read in hours of wage at the
//     hero's Level and as a share of the four's measured gross (income: coin and loot at the store's price).
//   A WORK-HOUR'S VALUE (09 4.3: townWageShare, 0.25 of a hunted hour's coin at the reference). The job is played: settleJob over
//     --seeds seeds of one hour each, at trade Levels 1 to 99, on the newest open rung (the XP route) and the kind's first rung (the
//     profit route), with and without a Mastery and a full bench. The value of a work-hour is what its goods are worth (V by quality)
//     less the inputs it spent (returned sets back), before and after the job fee, over the wage at the goods' band.
//   Also: the labor the measured kit asks for (09 5.3's ratio, at the 10 h hunting day and the 8 h work day used at 0.8), what tools
//   add (09 3.7), and the store floor's faucet (09 5.5).
// ═════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const T = await imp('src/core/trades.js');
const { TRADE_LEVERS, LINE_SHARE } = await imp('src/data/trades.js');
const { STORE_KIT } = await imp('src/data/store-kit.js');
const { WORK_DAY } = await imp('src/data/work-day.js');
const { wage } = await imp('src/data/wage.js');
const { BASIC_INDEX } = await imp('src/data/supply-basics.js');

const FROM = resolve(ROOT, arg('from', 'tools/balance-program/redesign/trades/lab-muster.json'));
const SEEDS = Number(arg('seeds', 200));
const HOUR = 3600000;
const cat = T.tradeCatalogue();
const K = cat.kinds;
const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
const out = { from: FROM.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, ''), seeds: SEEDS };

/* ── THE FORMULA TABLE: every kind, its work, inputs and prices at Muster's band (3) and a Level 60 hero ─────────────────────── */
const BAND = 3, HERO = 60;
out.kinds = Object.values(K).map((k) => ({
  kind: k.id, trade: k.trade, stage: k.stage, line: k.line, opensAt: T.rungLevel(k.opens), ships: k.ships,
  workH: r3(k.workUh / 1e6), ownH: r3(k.ownUh / 1e6), inputs: Object.fromEntries(k.inputs.map((i) => [i.kind, i.n])),
  hunted: Object.fromEntries(k.hunted.map((h) => [h.stream, h.pm / 1000])),
  V: T.value(k, BAND, 0), Vfine: k.rolls ? T.value(k, BAND, 1) : null, Vmaster: k.rolls ? T.value(k, BAND, 2) : null,
  fee: k.stage === 'make' ? T.jobFee(k, BAND, 1) : null, ask: T.storeAsk(k, HERO), bid: T.storeBid(k, BAND, 0),
}));

/* ── THE SUPPLY BILL ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const lab = JSON.parse(readFileSync(FROM, 'utf8'));
const imbuePerH = TRADE_LEVERS.imbue.slots / TRADE_LEVERS.imbue.hours;
const mealLineV = (band) => T.value(K.meal, band, 0) + T.value(K.drink, band, 0);
const mealLineAsk = (step) => T.storeAsk(K.meal, step) + T.storeAsk(K.drink, step);
out.bill = [];
for (const [id, c] of Object.entries(lab.cells)) {
  let hp = 0, mana = 0, shots = 0, casts = 0;
  for (const [sid, n] of Object.entries(c.kitIds || {})) {
    const b = BASIC_INDEX[sid];
    if (!b) continue;
    if (b.kind === 'heal') hp += n * b.heals;
    else if (b.kind === 'mana') mana += n * b.mana;
    else if (/_rune$/.test(sid)) casts += n;
    else shots += n;
  }
  const L = c.L, band = T.bandOf(L), w = wage(L), gross = c.gold.incomePerHeroH.mean;
  const mealKh = (hp + mana) / STORE_KIT.refRestore, chargeKh = (shots + casts) / STORE_KIT.refCharges;
  const crafted = mealKh * mealLineV(band) + chargeKh * T.value(K.honing_stone, band, 0) + imbuePerH * T.value(K.imbuement, band, 0);
  const store = mealKh * mealLineAsk(L) + chargeKh * T.storeAsk(K.honing_stone, L);
  out.bill.push({ cell: id, L, band, hpPerH: Math.round(hp), manaPerH: Math.round(mana), shotsPerH: Math.round(shots), castsPerH: Math.round(casts),
    mealKh: r2(mealKh), chargeKh: r2(chargeKh), grossPerH: gross, wage: w, grossOverWage: r2(gross / w),
    craftedPerH: Math.round(crafted), craftedHoursOfWage: r3(crafted / w), craftedOfGross: r3(crafted / gross),
    storePerH: Math.round(store), storeHoursOfWage: r3(store / w), storeOfGross: r3(store / gross),
    engineStorePerH: c.gold.storePerHeroH.mean, engineStoreOfGross: r3(c.gold.storePerHeroH.mean / gross) });
}
/* 09 2.5's arithmetic at the reference, in hours of wage: all four lines, and the three v0.3.0 sells (no draught) */
const v030 = LINE_SHARE.meal + LINE_SHARE.charge + LINE_SHARE.imbuement;
out.billTarget = { craftedAllLines: r3(STORE_KIT.kitWork * STORE_KIT.townWageShare), storeAllLines: r3(STORE_KIT.kitWork * STORE_KIT.townWageShare * STORE_KIT.storeCeiling),
  craftedV030: r3(STORE_KIT.kitWork * STORE_KIT.townWageShare * v030),
  storeV030MealAndCharge: r3(STORE_KIT.kitWork * STORE_KIT.townWageShare * STORE_KIT.storeCeiling * (LINE_SHARE.meal + LINE_SHARE.charge) * wage(40) / wage(60)) };
/* each style's own charge kit-hour (09 3.2: the bill is the same for every style): shots a bow-hour and casts a caster-hour in the
   reference cell, the bow the one seat that buys arrows and the mage and healer the two that buy runes (the hammer has no store charge) */
const ref = lab.cells['base:steady'];
if (ref) {
  const row = out.bill.find((b) => b.cell === 'base:steady');
  out.styleUnits = { shotsPerBowHour: Math.round(row.shotsPerH * 4), castsPerCasterHour: Math.round(row.castsPerH * 2), refCharges: STORE_KIT.refCharges };
}

/* ── A WORK-HOUR'S VALUE ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
const LEVELS = [1, 15, 30, 50, 70, 90, 99];
const newest = (k, L) => { let r = k.opens; for (let x = k.opens; x <= T.TRADE_PM.rungCount; x++) if (T.rungLevel(x) <= L) r = x; return T.rungLevel(r) <= L ? r : null; };
/* ONE STAGE, PLAYED: a work day (8 h) of one kind on one rung, over the seeds: goods an hour, input sets spent a good (misses lost,
   returns back), the mean V of a good by its quality mix, and XP an hour */
const DAY = 8 * HOUR;
const stageCache = new Map();
function stage(k, rung, L, opt, band) {
  const key = [k.id, rung, L, opt.mastery, opt.benchPm, band].join('|');
  if (stageCache.has(key)) return stageCache.get(key);
  let made = 0, value = 0, spentSets = 0, xp = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const r = T.settleJob(k, rung, L, { ...opt, count: 1e6, elapsedMs: DAY, seed: 7000 + s });
    const units = r.plain + r.fine + r.master;
    made += units; xp += r.xp; spentSets += r.attempts - r.returned;
    value += r.plain * T.value(k, band, 0) + r.fine * T.value(k, band, 1) + r.master * T.value(k, band, 2);
  }
  const hours = (SEEDS * DAY) / HOUR;
  const st = { unitsPerH: made / hours, setsPerUnit: made ? spentSets / made : 0, meanV: made ? value / made : 0, xpPerH: xp / hours };
  stageCache.set(key, st);
  return st;
}
/* THE WHOLE CHAIN at one company trade Level for every trade: the labor-hours behind one finished good (its own stage's time and, through
   the sets it spends, every input's), and what that good is worth. Route 'newest' works every stage on its newest open rung (the XP
   route), 'first' on the kind's first rung (the profit route), '+mastery+bench' adds a Mastery and a full bench to the profit route. A
   work-hour's value is V a labor-hour over the wage at the goods' band; 'after fee' takes the finished good's job fee off */
function chain(id, L, route, band = BAND) {
  const opt = route === '+mastery+bench' ? { mastery: true, benchPm: T.TRADE_PM.benchMax } : { mastery: false, benchPm: 0 };
  const hoursOf = (kid) => {
    const k = K[kid];
    const rung = route === 'newest' ? newest(k, L) : k.opens;
    if (!rung || T.rungLevel(rung) > L) return null;
    const st = stage(k, rung, L, opt, band);
    let h = 1 / st.unitsPerH;
    for (const i of k.inputs) { const sub = hoursOf(i.kind); if (sub === null) return null; h += i.n * st.setsPerUnit * sub; }
    return h;
  };
  const k = K[id];
  const h = hoursOf(id);
  if (h === null) return null;
  const rung = route === 'newest' ? newest(k, L) : k.opens;
  const st = stage(k, rung, L, opt, band), w = wage(T.bandStep(band));
  return { kind: id, L, route, laborHoursPerGood: r3(h), value: r3(st.meanV / h / w), afterFee: r3((st.meanV - T.jobFee(k, band, 1)) / h / w), xpPerH: Math.round(st.xpPerH) };
}
out.workHour = [];
for (const id of ['ore', 'fish', 'meal', 'honing_stone', 'arrow', 'rune_fire', 'imbuement', 'temper_kit']) {
  for (const L of LEVELS) for (const route of ['newest', 'first', '+mastery+bench']) {
    if (route === '+mastery+bench' && L < 50) continue;
    const c = chain(id, L, route);
    if (c) out.workHour.push(c);
  }
}

/* ── LABOR, TOOLS AND THE FLOOR ──────────────────────────────────────────────────────────────────────────────────────────────── */
/* 09 5.3: labor ratio = hunted hours x the kit's work-hours a hunted hour / (workDay x the share used). The full day is the ruled 10 h
   (04 11); 09 5.1's mix hunts 6 h a hero on average */
const workUsed = 0.8, workDayH = WORK_DAY.freeMin / 60;
const steady = out.bill.find((b) => b.cell === 'base:steady');
const kitWorkMeasured = steady ? (steady.mealKh * LINE_SHARE.meal + steady.chargeKh * LINE_SHARE.charge + LINE_SHARE.imbuement) * STORE_KIT.kitWork : null;
const toolLabor = TRADE_LEVERS.tool.work / TRADE_LEVERS.tool.hours;
const ratio = (huntH, kw, tools = false) => r3((huntH * kw * (tools ? 1 + toolLabor : 1)) / (workDayH * workUsed));
out.labor = {
  kitWorkAtReference: STORE_KIT.kitWork, kitWorkV030: r3(STORE_KIT.kitWork * v030), kitWorkMeasuredSteadyL60: steady ? r3(kitWorkMeasured) : null,
  ratio: Object.fromEntries([6, 10].map((h) => [h + 'h', { referenceV030: ratio(h, STORE_KIT.kitWork * v030), measured: steady ? ratio(h, kitWorkMeasured) : null,
    measuredWithTools: steady ? ratio(h, kitWorkMeasured, true) : null }])),
  toolHoursOfWagePerWorkHour: r3(T.value(K.tool_pick, BAND, 0) / TRADE_LEVERS.tool.hours / wage(T.bandStep(BAND))),
  toolLifeH: [0, 1, 2].map((q) => T.toolLifeMs(q) / HOUR), toolRentPerWorkHourL60: T.toolRentPerHour(K.tool_pick, HERO),
};
/* 09 5.5: an account of four on the mix (6 h hunted a hero), every idle work-hour gathering and sold to the store at the floor, against
   the coin its hunting mints and the store's day budget */
const idle = steady ? Math.max(0, 4 * (workDayH * workUsed - 6 * kitWorkMeasured)) : null;
out.floor = steady ? { huntedHPerHero: 6, idleWorkHoursPerAccountDay: r2(idle), floorHoursOfWage: r3(idle * STORE_KIT.townWageShare * TRADE_LEVERS.store.floorShare),
  budgetHoursOfWage: TRADE_LEVERS.store.budgetHours, mintedHoursOfWage: r2(4 * 6 * steady.grossOverWage) } : null;

/* ── PRINT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
console.log(`THE FORMULA TABLE (band ${BAND}, a Level ${HERO} hero; V / Fine / Master in gold, fee and store at the same band)`);
for (const k of out.kinds) {
  console.log(`  ${pad(k.kind, 13)} ${pad(k.trade, 12)} ${pad(k.stage, 6)} ${pad(k.line || '', 9)} L${lp(k.opensAt, 2)} ${pad(k.ships, 5)} work ${lp(k.workH, 6)} h own ${lp(k.ownH, 6)} h `
    + `V ${lp(k.V, 6)}${k.Vfine ? ' / ' + k.Vfine + ' / ' + k.Vmaster : ''}${k.fee !== null ? '  fee ' + k.fee : ''}${k.ask !== null ? '  ask ' + k.ask : ''}  bid ${k.bid}  `
    + `${JSON.stringify(k.inputs)}${Object.keys(k.hunted).length ? ' ' + JSON.stringify(k.hunted) : ''}`);
}
console.log(`\nTHE SUPPLY BILL a hunted hero-hour, the engine's burn priced on the formulas (from ${out.from})`);
console.log(`  09 2.5 at the reference: crafted ${out.billTarget.craftedAllLines} / store ${out.billTarget.storeAllLines} hours of wage (all four lines); v0.3.0 crafted ${out.billTarget.craftedV030} (meal, charge, imbuement), store ${out.billTarget.storeV030MealAndCharge} (meal and charge, a tier behind)`);
for (const b of out.bill) {
  console.log(`  ${pad(b.cell, 15)} L${b.L} restore ${lp(b.hpPerH + b.manaPerH, 6)} (HP ${b.hpPerH}) charges ${lp(b.shotsPerH + b.castsPerH, 5)}  kit-hours meal ${b.mealKh} charge ${b.chargeKh}`
    + `  crafted ${lp(b.craftedPerH, 5)} = ${b.craftedHoursOfWage} h of wage, ${b.craftedOfGross} of gross   store ${lp(b.storePerH, 5)} = ${b.storeHoursOfWage} h, ${b.storeOfGross} of gross`
    + `   (engine's store ${b.engineStoreOfGross} of gross; gross ${b.grossOverWage} x wage)`);
}
if (out.styleUnits) console.log(`  a style's charge kit-hour, Steady L60: ${out.styleUnits.shotsPerBowHour} shots a bow-hour, ${out.styleUnits.castsPerCasterHour} casts a caster-hour (refCharges ${out.styleUnits.refCharges} is the four's mean)`);
console.log(`\nA WORK-HOUR'S VALUE, the whole chain, in hours of wage at the goods' band (09 4.3: townWageShare ${STORE_KIT.townWageShare}), ${SEEDS} seeds x an 8 h day a stage`);
for (const w of out.workHour) console.log(`  ${pad(w.kind, 13)} L${lp(w.L, 2)} ${pad(w.route, 15)} ${lp(w.laborHoursPerGood, 6)} labor-h a good  value ${lp(w.value, 6)}  after fee ${lp(w.afterFee, 6)}  XP ${w.xpPerH}/h on its own stage`);
console.log(`\nLABOR: kitWork ${out.labor.kitWorkAtReference} at the reference (${out.labor.kitWorkV030} on v0.3.0's lines), ${out.labor.kitWorkMeasuredSteadyL60} on the measured Steady L60 burn`);
for (const [h, x] of Object.entries(out.labor.ratio)) console.log(`  the labor ratio hunting ${h} a hero: ${x.referenceV030} at the reference (v0.3.0 lines), ${x.measured} on the measured burn, ${x.measuredWithTools} with tools`);
console.log(`TOOLS: ${out.labor.toolHoursOfWagePerWorkHour} hours of wage a work-hour, life ${out.labor.toolLifeH.join(' / ')} h, the store's rent ${out.labor.toolRentPerWorkHourL60} gold a work-hour at Level ${HERO}`);
if (out.floor) console.log(`THE FLOOR (09 5.5, 6 h hunted a hero): ${out.floor.idleWorkHoursPerAccountDay} idle work-hours an account-day at the floor = ${out.floor.floorHoursOfWage} hours of wage (budget ${out.floor.budgetHoursOfWage}) against ${out.floor.mintedHoursOfWage} minted`);
const jf = arg('json');
if (jf) writeFileSync(jf, JSON.stringify(out, null, 1) + '\n');
