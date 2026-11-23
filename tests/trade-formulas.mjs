#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/trade-formulas.mjs — TOWN WORK ON ONE CURVE: THE TRADES' FORMULAS HOLD 09'S NUMBERS, AND THE SERVER'S TWINS ARE THE JS
//   (lane/trade-formulas, backend-architect, 2026-11-22; docs/design/redesign/09-crafting.md section 4, built in 4.8; 13-market.md 3.2).
//   src/core/trades.js (the rule), src/data/trades.js (its rows and levers), 1063-trade-formulas-catalogue.generated.sql (the server's
//   copy and its SQL twins, tools/gen-trades.mjs).
//
//   node tests/trade-formulas.mjs            the guard (the pure arms in Node, then TF-TWIN on the replayed chain, PGlite)
//   node tests/trade-formulas.mjs --mutate   every planted defect must turn its named arm red: JS mutants on a copy of src/, SQL mutants
//                                            planted in a live twin body inside a rolled-back transaction
//
// mutant-anchors: src/core/trades.js src/data/trades.js — the JS mutants patch a temp copy of src/; the SQL mutants patch a live body read
//   from the replayed chain (pg_get_functiondef); no tracked file is patched
// ci-step: db-replay | Trades on one curve - 09's numbers, no typed yield, one bill a style, the store a tier behind at 1.5x, the twins the JS
// ci-run: node tools/gen-trades.mjs --check
// ci-run: node tools/mutant-gate.mjs node tools/gen-trades.mjs --selftest
// ci-run: node tests/trade-formulas.mjs
// ci-run: node tools/mutant-gate.mjs node tests/trade-formulas.mjs --mutate
//
//   TF-09      09's numbers: the trade table (6.6 h to Level 10, 104 to 50, 269 to 70, 669 to 90, 1,000 to 99, the last Level 44 h); yield
//              0.75 at the recipe's Level and 1.00 fifteen on, Mastery and the bench on top; Fine 10% to 60%, Master to 50% with the
//              Mastery only; speed 1 to 1.25; full XP in the window, the floor past it; tools 12 / 15 / 18 work-hours; 20 steps behind is
//              93% and 100 is 71%; a Fine good is worth the wage five steps up; the fee rounds up; a raw unit is one meal's gathering, so
//              the first meal is one fish and the first honing stone two bars (09 3.3's walk-through)
//   TF-ROWS    no typed yield: a kind row holds only shares, rungs and names (no ms, XP, count, yield or price); every kit kind's work is
//              kitWork x its line x its split x its kit-hours; a recipe is (kind, rung) and its Level the rung's; a hunted input is its
//              stream's cover x its share x the kind's kit-hours (09 5.4)
//   TF-BILL    the bill is the same for every style (09 3.2): every charge kind holds the same work and V; one kit-hour of the four lines
//              is kitWork work-hours
//   TF-STORE   the store a tier behind at its ceiling (09 2.5, 4.6): it asks ceil(storeCeiling x V) at its band's step less lagSteps (one
//              gear tier), sells the meal and charge lines only, is dearer than the crafted good at the hero's band and weaker by the
//              contest curve, and bids under what it asks at every band
//   TF-HOUR    a work-hour is worth townWageShare of the wage (09 4.3): at yield 1 and speed 1 every stage's goods are worth its own work
//              x townWageShare x wage(band), at every band
//   TF-SETTLE  the closed-form job (09 6): the same seed lands the same goods; the bound admits every settle; yield, Fine and Master
//              land at the curve's rates over many seeds; a refused rung settles nothing; a day of work is a day of XP; a tool behind
//              its job slows it by the contest curve
//   TF-TWIN    the replayed chain: every SQL twin answers the JS at every Level, rung, band, quality, hero step and step behind swept,
//              and the job bound on a seeded sweep of jobs
// Exit: 0 green · 1 red (or a mutant escaped) · 2 harness.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// No verb reads the catalogue yet (the job slice, 09 section 6), so nothing here plays a job through the server or either door: the
// both-paths rule (CLAUDE.md §4) binds the slice that adds the job verbs and the settle, not this formula layer.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { harnessFail, verdict } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const HOUR = 3600000;
const OUT_NAME = '1063-trade-formulas-catalogue.generated.sql';

async function load(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [T, D, SK, GS, DG, W, IR, TP] = await Promise.all([imp('src/core/trades.js'), imp('src/data/trades.js'), imp('src/data/store-kit.js'),
    imp('src/data/gear-steps.js'), imp('src/data/danger.js'), imp('src/data/wage.js'), imp('src/data/imbue-rules.js'), imp('src/data/temper.js')]);
  return { T, D, STORE_KIT: SK.STORE_KIT, GEAR_STEPS: GS.GEAR_STEPS, DANGER: DG.DANGER, wage: W.wage, IMBUE: IR.IMBUE, IMBUE_SLOTS: IR.IMBUE_SLOTS,
    TEMPER_STEPS: TP.TEMPER_STEPS, cat: T.tradeCatalogue() };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

const ARMS = {
  'TF-09'(X) {
    const { T, cat } = X;
    const out = [];
    const xp = T.tradeXpTable();
    const h = (n) => xp[n - 1] / 3600;
    for (const [n, want, tol] of [[10, 6.6, 0.05], [30, 35, 0.6], [50, 104, 0.6], [70, 269, 0.6], [90, 669, 0.6], [99, 1000, 0.01]]) {
      if (!near(h(n), want, tol)) out.push(`Level ${n} takes ${h(n).toFixed(2)} h of work, 09 4.5 says ${want}`);
    }
    if (!near(h(99) - h(98), 44, 0.6)) out.push(`the last Level takes ${(h(99) - h(98)).toFixed(1)} h, 09 2.6 says 44`);
    if (T.tradeLevel(xp[49]) !== 50 || T.tradeLevel(xp[49] - 1) !== 49 || T.tradeLevel(1e12) !== 99 || T.tradeLevel(0) !== 1) out.push('the Level read off XP is not the table');
    for (let r = 1; r <= T.TRADE_PM.rungCount; r++) {
      const R = T.rungLevel(r);
      if (T.yieldPm(R, R) !== 750) out.push(`yield at the recipe's own Level ${R} is ${T.yieldPm(R, R)}, not 750`);
      if (R + 15 <= 99 && T.yieldPm(R + 15, R) !== 1000) out.push(`yield 15 Levels past ${R} is ${T.yieldPm(R + 15, R)}, not 1000`);
      if (R + 30 <= 99 && T.yieldPm(R + 30, R) !== 1000) out.push(`yield 30 Levels past ${R} is ${T.yieldPm(R + 30, R)}, not held at 1000`);
      if (R > 1 && T.yieldPm(R - 1, R) !== null) out.push(`a Level under rung ${r} works it`);
      if (T.finePm(R, R) !== 100 || T.finePm(99, R) !== 600) out.push(`Fine on a rung of ${R} runs ${T.finePm(R, R)} to ${T.finePm(99, R)}, not 100 to 600`);
      if (T.masterPm(99, R, true) !== 500 || T.masterPm(99, R, false) !== 0 || T.masterPm(R, R, true) !== 0) out.push(`Master on a rung of ${R} is not 0 to 500, Mastery only`);
    }
    if (T.yieldPm(99, 1, true, 100) !== 1200 || T.yieldPm(99, 1, false, 0) !== 1000 || T.yieldPm(99, 1, false, 500) !== 1100) out.push('Mastery and the bench do not add 100 each, the bench held to its max');
    if (T.speedPm(99) !== 1250 || T.speedPm(1) !== 1002 || T.speedPm(50) !== 1126) out.push(`speed runs ${T.speedPm(1)} / ${T.speedPm(50)} / ${T.speedPm(99)}, not 1002 / 1126 / 1250`);
    if (T.xpPm(21, 1) !== 1000 || T.xpPm(31, 1) !== 625 || T.xpPm(41, 1) !== 250 || T.xpPm(99, 1) !== 250) out.push(`the XP factor runs ${T.xpPm(21, 1)} / ${T.xpPm(31, 1)} / ${T.xpPm(41, 1)} / ${T.xpPm(99, 1)}, not 1000 / 625 / 250 / 250`);
    if (T.toolLifeMs(0) !== 12 * HOUR || T.toolLifeMs(1) !== 15 * HOUR || T.toolLifeMs(2) !== 18 * HOUR) out.push('a tool does not last 12 / 15 / 18 work-hours (09 3.7)');
    if (T.behindPm(20) !== 932 || T.behindPm(100) !== 705 || T.behindPm(0) !== 1000) out.push(`20 steps behind is ${T.behindPm(20)} and 100 is ${T.behindPm(100)}, 09 says 93% and 71%`);
    if (T.toolSpeedPm(3, 3) !== 1000 || T.toolSpeedPm(4, 3) !== 1000 || T.toolSpeedPm(2, 3) !== 932) out.push('a tool at or above its job is not full speed, or one behind is not the contest curve');
    const meal = cat.kinds.meal, stone = cat.kinds.honing_stone;
    const fineOverPlain = T.value(meal, 3, 1) / T.value(meal, 3, 0), wantFine = X.wage(65) / X.wage(60);
    if (!near(fineOverPlain, wantFine, 0.003)) out.push(`a Fine meal is worth ${fineOverPlain.toFixed(4)} of a Plain one, not the wage five steps up (${wantFine.toFixed(4)})`);
    /* the fee: jobFee of the Plain V of what the job asks for, rounded up once, on a finished good only (a chain pays it once) */
    for (const band of [0, 1, 2, 3, 4, 5, 7]) for (const n of [1, 3, 7]) {
      const fee = T.jobFee(meal, band, n), exact = (T.value(meal, band, 0) * n * T.TRADE_PM.jobFee) / 1000;
      if (fee !== Math.ceil(exact - 1e-9)) out.push(`the fee for ${n} meals at band ${band} is ${fee}, not ${exact} rounded up`);
    }
    for (const id of ['ore', 'bar', 'arrowhead', 'haft']) if (T.jobFee(cat.kinds[id], 3, 10) !== 0) out.push(`${id} pays a job fee: a refined good or a part pays none, or the chain pays twice`);
    for (const id of ['meal', 'arrow', 'imbuement', 'temper_kit', 'tool_pick']) if (!(T.jobFee(cat.kinds[id], 3, 1) > 0)) out.push(`the finished ${id} pays no job fee`);
    const ins = (k) => Object.fromEntries(k.inputs.map((i) => [i.kind, i.n]));
    if (JSON.stringify(ins(meal)) !== '{"fish":1}') out.push(`the first meal takes ${JSON.stringify(ins(meal))}, not one fish`);
    if (JSON.stringify(ins(stone)) !== '{"bar":2}') out.push(`the first honing stone takes ${JSON.stringify(ins(stone))}, not two bars`);
    if (JSON.stringify(ins(cat.kinds.bar)) !== '{"ore":1}') out.push('a bar is not one ore');
    return out;
  },

  'TF-ROWS'(X) {
    const { T, D, STORE_KIT, cat } = X;
    const out = [];
    const ALLOWED = new Set(['trade', 'stage', 'line', 'split', 'effect', 'opens', 'from', 'parts', 'hunted', 'rolls', 'life', 'ships', 'budget', 'family', 'forTrade']);
    for (const [id, k] of Object.entries(D.KINDS)) {
      for (const key of Object.keys(k)) if (!ALLOWED.has(key)) out.push(`${id} types its own ${key}: a kind row holds shares, rungs and names only`);
      for (const m of k.from || []) for (const key of Object.keys(m)) if (key !== 'kind' && key !== 'share') out.push(`${id}'s material ${m.kind} types its own ${key}`);
      for (const m of k.hunted || []) for (const key of Object.keys(m)) if (key !== 'stream' && key !== 'share') out.push(`${id}'s hunted ${m.stream} types its own ${key}`);
    }
    for (const k of Object.values(cat.kinds)) {
      const row = D.KINDS[k.id];
      if (!row.line) continue;
      const kh = row.effect === 'imbue' ? D.BORROWED.imbueHours / D.BORROWED.imbueSlots : row.effect;
      const want = Math.round(STORE_KIT.kitWork * D.LINE_SHARE[row.line] * row.split * kh * 1e6);
      if (k.budgetUh !== want) out.push(`${k.id}'s work is ${k.budgetUh} uh, not kitWork x its line x its split x its kit-hours (${want})`);
      for (const h of k.hunted) {
        const share = (row.hunted.find((x) => x.stream === h.stream) || {}).share;
        const pm = Math.round(D.TRADE_LEVERS.cover[h.stream] * share * kh * 1000);
        if (h.pm !== pm) out.push(`${k.id} burns ${h.pm} permille of an hour-unit of ${h.stream}, not its cover x share x kit-hours (${pm})`);
      }
    }
    for (const r of cat.recipes) if (r.R !== T.rungLevel(r.rung) || r.rung < cat.kinds[r.kind].opens) out.push(`recipe ${r.kind} rung ${r.rung} opens at ${r.R}`);
    const per = Object.fromEntries(Object.keys(D.KINDS).map((id) => [id, cat.recipes.filter((r) => r.kind === id).length]));
    for (const [id, n] of Object.entries(per)) if (n !== T.TRADE_PM.rungCount - D.KINDS[id].opens + 1) out.push(`${id} has ${n} recipes, not one a rung from its own`);
    /* the numbers 21 owns are read, never copied: an imbuement's life and slots and its life rung, a Temper kit's worth */
    const B = D.BORROWED, { IMBUE, IMBUE_SLOTS, TEMPER_STEPS } = X;
    if (B.imbueHours !== IMBUE.hours || B.imbueSlots !== Object.keys(IMBUE_SLOTS).length || Math.round(B.imbueLifeRung * 1000) !== IMBUE.lifeRungPm) out.push('the imbuement\'s life, slots or life rung is not 21\'s (src/data/imbue-rules.js IMBUE)');
    const kitUh = Math.round((TEMPER_STEPS.kitHoursPm / 1000 / STORE_KIT.townWageShare) * 1e6);
    if (cat.kinds.temper_kit.budgetUh !== kitUh) out.push(`a Temper kit holds ${cat.kinds.temper_kit.budgetUh} uh of work, not 21's kitHoursPm over townWageShare (${kitUh})`);
    if (cat.kinds.imbuement.lifePm !== IMBUE.lifeRungPm || cat.kinds.imbuement.rolls !== 'life') out.push('an imbuement\'s quality is not its life at 21\'s rung (21 D-7)');
    return out;
  },

  'TF-BILL'(X) {
    const { T, D, STORE_KIT, cat } = X;
    const out = [];
    const charges = Object.values(cat.kinds).filter((k) => k.line === 'charge');
    if (charges.length < 4) out.push(`only ${charges.length} charge kinds`);
    const w = new Set(charges.map((k) => k.workUh));
    if (w.size !== 1) out.push(`the charge kinds hold ${[...w].join(' / ')} uh of work: the styles pay different bills (09 3.2)`);
    for (const band of [0, 3, 40]) {
      const v = new Set(charges.map((k) => T.value(k, band, 0)));
      if (v.size !== 1) out.push(`at band ${band} the charges are worth ${[...v].join(' / ')}: one style pays more`);
    }
    /* one hero's kit-hour of all four lines: a meal, a drink, one style's charge, a draught, and the share of an imbuement an hour */
    const imbueH = D.BORROWED.imbueHours / D.BORROWED.imbueSlots;
    const k = cat.kinds;
    const kitUh = k.meal.budgetUh + k.drink.budgetUh + k.honing_stone.budgetUh + k.draught.budgetUh + k.imbuement.budgetUh / imbueH;
    if (!near(kitUh, STORE_KIT.kitWork * 1e6, 2)) out.push(`one kit-hour of the four lines is ${kitUh} uh of work, not kitWork (${STORE_KIT.kitWork * 1e6})`);
    return out;
  },

  'TF-STORE'(X) {
    const { T, D, STORE_KIT, GEAR_STEPS, DANGER, wage, cat } = X;
    const out = [];
    const L = D.TRADE_LEVERS.store;
    if (!(L.lagSteps >= 10 && L.lagSteps <= 30) || !(STORE_KIT.storeCeiling >= 1.25 && STORE_KIT.storeCeiling <= 2)) out.push('the store lag or ceiling is outside 09 4.7\'s search bands');
    if (L.lagSteps !== GEAR_STEPS.tierSteps) out.push(`the store sits ${L.lagSteps} steps behind, not one gear tier (${GEAR_STEPS.tierSteps})`);
    for (const k of Object.values(cat.kinds)) {
      const sells = k.line === 'meal' || k.line === 'charge';
      for (const heroStep of [1, 20, 59, 60, 63, 79, 400, 4000]) {
        const ask = T.storeAsk(k, heroStep);
        if (!sells) { if (ask !== null) out.push(`the store asks ${ask} for ${k.id}: it sells meals, drinks and charges only (09 2.5)`); continue; }
        const st = Math.max(0, Math.floor(heroStep / GEAR_STEPS.tierSteps) * GEAR_STEPS.tierSteps - L.lagSteps);
        const exact = STORE_KIT.storeCeiling * k.workUh / 1e6 * STORE_KIT.townWageShare * wage(st);
        if (!(ask >= exact - 1e-6 && ask < exact + 1)) out.push(`the store asks ${ask} for ${k.id} at hero step ${heroStep}, not ceil(${STORE_KIT.storeCeiling} x V at step ${st}) = ${Math.ceil(exact)}`);
        const band = Math.floor(heroStep / GEAR_STEPS.tierSteps);
        if (band >= 1 && !(ask > T.value(k, band, 0))) out.push(`the store's ${k.id} (${ask}) is no dearer than the crafted one at the hero's band (${T.value(k, band, 0)})`);
        if (!(T.storeBid(k, band, 0) < ask)) out.push(`the store bids ${T.storeBid(k, band, 0)} for ${k.id} at band ${band} and asks ${ask}: buying basics and selling crafted prints gold`);
      }
    }
    /* weaker by the contest curve: a store good one tier behind does what a crafted one does, times behindPm(lag) */
    const want = Math.floor(1000 / (1 + DANGER.powerStep) ** L.lagSteps);
    if (Math.abs(T.behindPm(L.lagSteps) - want) > 1 || T.behindPm(L.lagSteps) >= 1000) out.push(`a store good a tier behind does ${T.behindPm(L.lagSteps)} permille of a crafted one, not ${want}`);
    for (const band of [0, 3, 50]) for (const k of Object.values(cat.kinds)) {
      const v = T.value(k, band, 0);
      if (T.storeBid(k, band, 0) !== Math.floor(v * L.floorShare + 1e-9)) out.push(`the store bids ${T.storeBid(k, band, 0)} for ${k.id}, not floorShare x V (${v})`);
    }
    return out;
  },

  'TF-HOUR'(X) {
    const { T, STORE_KIT, wage, cat } = X;
    const out = [];
    for (const k of Object.values(cat.kinds)) for (const band of [0, 1, 3, 10, 50]) {
      const inV = k.inputs.reduce((a, i) => a + i.n * T.value(cat.kinds[i.kind], band, 0), 0);
      const added = T.value(k, band, 0) - inV;
      const want = (k.ownUh / 1e6) * STORE_KIT.townWageShare * wage(band * T.TRADE_PM.tierSteps);
      /* each V floors once: every input unit's floor and the good's own can each lose under a gold */
      if (!(Math.abs(added - want) <= k.inputs.reduce((a, i) => a + i.n, 0) + 1)) out.push(`at band ${band} an hour of ${k.id} work adds ${added} gold, not townWageShare x its own work x the wage (${want.toFixed(1)})`);
    }
    return out;
  },

  'TF-SETTLE'(X) {
    const { T, cat } = X;
    const out = [];
    const opt = { mastery: true, benchPm: 50, toolPm: 1000, count: 500, elapsedMs: 8 * HOUR, seed: 77 };
    const a = T.settleJob(cat.kinds.meal, 5, 60, opt), b = T.settleJob(cat.kinds.meal, 5, 60, opt);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push('the same seed lands different goods');
    if (JSON.stringify(a) === JSON.stringify(T.settleJob(cat.kinds.meal, 5, 60, { ...opt, seed: 78 }))) out.push('a second seed lands the very same goods');
    if (T.settleJob(cat.kinds.bolt, 1, 99, opt) !== null) out.push('a rung under the kind\'s own settles');
    if (T.settleJob(cat.kinds.meal, 6, 50, opt) !== null) out.push('a Level under the rung settles');
    /* the bound admits every settle, over a seeded sweep */
    let seed = 1;
    const kinds = Object.values(cat.kinds);
    for (let i = 0; i < 400; i++) {
      const k = kinds[i % kinds.length];
      const rung = k.opens + (i % (T.TRADE_PM.rungCount - k.opens + 1));
      const level = Math.min(99, T.rungLevel(rung) + (i * 7) % 40);
      const o = { mastery: i % 3 === 0, benchPm: (i * 13) % 140, toolPm: [1000, 932, 705][i % 3], count: 1 + (i * 37) % 400, elapsedMs: ((i * 53) % 12 + 1) * HOUR / 2, seed: seed++ };
      const bd = T.jobBound(k, rung, level, o), s = T.settleJob(k, rung, level, o);
      if (!bd || !s) { out.push(`${k.id} rung ${rung} at Level ${level} is refused`); continue; }
      const units = s.plain + s.fine + s.master;
      if (s.attempts !== bd.attempts || s.xp !== bd.xp || units > bd.unitsMax || s.returned > bd.returnedMax || s.spentMs > o.elapsedMs) {
        out.push(`the bound ${JSON.stringify(bd)} does not admit ${k.id}'s settle ${JSON.stringify(s)}`);
        break;
      }
    }
    /* the rates over many seeds land on the curve: yield 750 at a new rung (a miss loses the set), 1200 with Mastery and the bench
       (a set back one time in six), Fine and Master on the cascade */
    const rate = (k, rung, level, o) => {
      const t = { att: 0, made: 0, fine: 0, master: 0, ret: 0 };
      for (let s = 1; s <= 400; s++) {
        const r = T.settleJob(k, rung, level, { count: 1e6, elapsedMs: HOUR, ...o, seed: 1000 + s });
        t.att += r.attempts; t.made += r.plain + r.fine + r.master; t.fine += r.fine; t.master += r.master; t.ret += r.returned;
      }
      return t;
    };
    const within = (p, n, got, what) => { const sd = Math.sqrt(n * p * (1 - p)); if (Math.abs(got - n * p) > 4 * sd + 1) out.push(`${what}: ${got} of ${n}, the curve says ${(n * p).toFixed(0)}`); };
    const r1 = rate(cat.kinds.meal, 1, 1, {});
    within(0.75, r1.att, r1.made, 'a new cook makes meals');
    within(0.1, r1.made, r1.fine, 'a new cook\'s Fine meals');
    const r2 = rate(cat.kinds.arrow, 9, 99, { mastery: true, benchPm: 100 });
    if (r2.made !== r2.att) out.push('a master fletcher over no-fail misses an arrow');
    within(1 - 1000 / 1200, r2.att, r2.ret, 'a set handed back at yield 1200');
    within(0.5, r2.made, r2.master, 'a master\'s Master arrows');
    within(0.6, r2.made - r2.master, r2.fine, 'a master\'s Fine arrows after Master missed');
    const g = rate(cat.kinds.ore, 1, 99, { mastery: true, benchPm: 100 });
    within(0.2, g.att, g.made - g.att, 'a second ore at yield 1200');
    /* a day of work is a day of XP, inside the window; and a tool behind its job slows it by the contest curve */
    const day = T.settleJob(cat.kinds.meal, 5, 50, { count: 1e6, elapsedMs: 8 * HOUR, seed: 5 });
    if (!(day.xp <= 8 * 3600 && day.xp >= 8 * 3600 - 300)) out.push(`a day of meals at Level 50 pays ${day.xp} XP, not 8 hours of work (28,800)`);
    const full = T.jobBound(cat.kinds.ore, 1, 50, { count: 1e6, elapsedMs: 8 * HOUR }), slow = T.jobBound(cat.kinds.ore, 1, 50, { toolPm: T.toolSpeedPm(2, 3), count: 1e6, elapsedMs: 8 * HOUR });
    if (!near(slow.attempts / full.attempts, 0.932, 0.01)) out.push(`a tool a band behind works ${(slow.attempts / full.attempts).toFixed(3)} as fast, not 0.932`);
    return out;
  },
};

/* ── TF-TWIN: the replayed chain ───────────────────────────────────────── */

const rowsQ = async (db, sql) => (await db.query(sql)).rows;
/* a VALUES list: text quoted, a { big } written as a bigint literal, numbers and booleans as they are */
const V = (rows) => rows.map((r) => '(' + r.map((x) => (x === null ? 'null' : typeof x === 'string' ? `'${x}'`
  : typeof x === 'object' ? `${Math.trunc(x.big)}::bigint` : String(x))).join(', ') + ')').join(', ');

async function twinArm(X, db) {
  const { T, cat } = X;
  const out = [];
  const bad = (what, got, want) => { if (out.length < 12) out.push(`${what}: ${got} in SQL, ${want} in src/core/trades.js`); };
  const n = (x) => (x === null || x === undefined ? null : Number(x));
  const R = Array.from({ length: T.TRADE_PM.rungCount }, (_, i) => T.rungLevel(i + 1));
  const curve = [];
  for (let L = 1; L <= 100; L++) for (const r of R) for (const m of [false, true]) curve.push([L, r, m]);
  for (const row of await rowsQ(db, `select l, r, m, public.hr_trade_yield_pm(l, r, m, 0) y, public.hr_trade_fine_pm(l, r) f, public.hr_trade_master_pm(l, r, m) ms,
      public.hr_trade_xp_pm(l, r) x from (values ${V(curve)}) v(l, r, m)`)) {
    const [L, r, m] = [row.l, row.r, row.m];
    if (n(row.y) !== T.yieldPm(L, r, m, 0)) bad(`yield at Level ${L} on a rung of ${r}`, row.y, T.yieldPm(L, r, m, 0));
    if (n(row.f) !== T.finePm(L, r)) bad(`Fine at Level ${L} on a rung of ${r}`, row.f, T.finePm(L, r));
    if (n(row.ms) !== T.masterPm(L, r, m)) bad(`Master at Level ${L} on a rung of ${r}`, row.ms, T.masterPm(L, r, m));
    if (n(row.x) !== T.xpPm(L, r)) bad(`the XP factor at Level ${L} on a rung of ${r}`, row.x, T.xpPm(L, r));
  }
  const bench = [];
  for (const L of [1, 16, 50, 99]) for (const b of [0, 37, 100, 101, 500]) for (const m of [false, true]) bench.push([L, b, m]);
  for (const row of await rowsQ(db, `select l, b, m, public.hr_trade_yield_pm(l, 1, m, b) y from (values ${V(bench)}) v(l, b, m)`)) {
    if (n(row.y) !== T.yieldPm(row.l, 1, row.m, row.b)) bad(`yield with a bench of ${row.b}`, row.y, T.yieldPm(row.l, 1, row.m, row.b));
  }
  for (const row of await rowsQ(db, `select l, public.hr_trade_speed_pm(l) s from generate_series(0, 120) l`)) {
    if (n(row.s) !== T.speedPm(row.l)) bad(`speed at Level ${row.l}`, row.s, T.speedPm(row.l));
  }
  const xp = T.tradeXpTable();
  const xs = [-3, 0, xp[98] * 3];
  for (let i = 1; i < xp.length; i++) xs.push(xp[i] - 1, xp[i], xp[i] + 1);
  for (const row of await rowsQ(db, `select x, public.hr_trade_level(x) lv from (values ${V(xs.map((x) => [{ big: x }]))}) v(x)`)) {
    if (n(row.lv) !== T.tradeLevel(Number(row.x))) bad(`${row.x} XP reads Level`, row.lv, T.tradeLevel(Number(row.x)));
  }
  const bands = [...Array.from({ length: 71 }, (_, i) => i), 100, 150, 199, 200, 201, 250];
  const vals = [];
  for (const k of Object.values(cat.kinds)) for (const b of bands) for (const q of k.rolls ? [0, 1, 2] : [0, 2]) vals.push([k.id, b, q]);
  for (const row of await rowsQ(db, `select k, b, q, public.hr_trade_value(k, b, q) v, public.hr_trade_store_bid(k, b, q) bid from (values ${V(vals)}) v(k, b, q)`)) {
    const k = cat.kinds[row.k];
    if (n(row.v) !== T.value(k, row.b, row.q)) bad(`V of ${row.k} at band ${row.b} quality ${row.q}`, row.v, T.value(k, row.b, row.q));
    if (n(row.bid) !== T.storeBid(k, row.b, row.q)) bad(`the store's bid for ${row.k} at band ${row.b}`, row.bid, T.storeBid(k, row.b, row.q));
  }
  const fees = [];
  for (const k of Object.values(cat.kinds)) for (const b of [0, 1, 3, 7, 50, 200]) for (const c of [0, 1, 3, 7, 250, 1000]) fees.push([k.id, b, c]);
  for (const row of await rowsQ(db, `select k, b, c, public.hr_trade_job_fee(k, b, c) fee from (values ${V(fees)}) v(k, b, c)`)) {
    const want = T.jobFee(cat.kinds[row.k], row.b, row.c);
    if (n(row.fee) !== want) bad(`the fee for ${row.c} ${row.k} at band ${row.b}`, row.fee, want);
  }
  const asks = [];
  for (const k of Object.values(cat.kinds)) for (let s = 0; s <= 420; s += 3) asks.push([k.id, s]);
  for (const k of Object.values(cat.kinds)) for (const s of [999, 1000, 3999, 4000, 4021, 6000]) asks.push([k.id, s]);
  for (const row of await rowsQ(db, `select k, s, public.hr_trade_store_step(s) st, public.hr_trade_store_ask(k, s) ask from (values ${V(asks)}) v(k, s)`)) {
    if (n(row.st) !== T.storeStep(row.s)) bad(`the store's step for hero step ${row.s}`, row.st, T.storeStep(row.s));
    const want = T.storeAsk(cat.kinds[row.k], row.s);
    if (n(row.ask) !== want) bad(`the store's ask for ${row.k} at hero step ${row.s}`, row.ask, want);
  }
  for (const row of await rowsQ(db, `select s, public.hr_trade_behind_pm(s) pm from generate_series(0, 4100) s`)) {
    if (n(row.pm) !== T.behindPm(row.s)) bad(`${row.s} steps behind`, row.pm, T.behindPm(row.s));
  }
  for (const row of await rowsQ(db, `select t, j, public.hr_trade_tool_speed_pm(t, j) pm from generate_series(0, 12) t, generate_series(0, 12) j`)) {
    if (n(row.pm) !== T.toolSpeedPm(row.t, row.j)) bad(`a band ${row.t} tool on a band ${row.j} job`, row.pm, T.toolSpeedPm(row.t, row.j));
  }
  for (const row of await rowsQ(db, `select q, public.hr_trade_tool_life_ms(q) ms from generate_series(-1, 3) q`)) {
    if (n(row.ms) !== T.toolLifeMs(row.q)) bad(`a quality ${row.q} tool's life`, row.ms, T.toolLifeMs(row.q));
  }
  const rents = [];
  for (const k of Object.values(cat.kinds)) for (const s of [0, 20, 60, 63, 400, 4000, 5000]) rents.push([k.id, s]);
  for (const row of await rowsQ(db, `select k, s, public.hr_trade_tool_rent(k, s) rent from (values ${V(rents)}) v(k, s)`)) {
    const k = cat.kinds[row.k];
    const want = k.rolls === 'life' ? T.toolRentPerHour(k, row.s) : null;
    if (n(row.rent) !== want) bad(`renting ${row.k} at hero step ${row.s}`, row.rent, want);
  }
  /* the job bound on a seeded sweep, including refused rungs and Levels */
  const kinds = Object.values(cat.kinds);
  const jobs = [];
  for (let i = 0; i < 360; i++) {
    const k = kinds[i % kinds.length];
    const rung = 1 + (i * 3) % (T.TRADE_PM.rungCount + 1);
    const level = 1 + (i * 29) % 100;
    jobs.push([k.id, rung, level, i % 4 === 0, (i * 17) % 150, [1000, 932, 705, 1, 1500][i % 5], (i * 41) % 600, { big: (i * 7919 * 1013) % (40 * HOUR) }]);
  }
  for (const row of await rowsQ(db, `select k, rung, l, m, b, t, c, ms, public.hr_trade_job_bound(k, rung, l, m, b, t, c, ms) j
      from (values ${V(jobs)}) v(k, rung, l, m, b, t, c, ms)`)) {
    const want = T.jobBound(cat.kinds[row.k], row.rung, row.l, { mastery: row.m, benchPm: row.b, toolPm: row.t, count: row.c, elapsedMs: Number(row.ms) });
    const got = row.j ? { yieldPm: n(row.j.yield_pm), attempts: n(row.j.attempts), spentMs: n(row.j.spent_ms), unitsMax: n(row.j.units_max), returnedMax: n(row.j.returned_max), xp: n(row.j.xp) } : null;
    if (JSON.stringify(got) !== JSON.stringify(want)) bad(`the bound for ${row.k} rung ${row.rung} at Level ${row.l}`, JSON.stringify(got), JSON.stringify(want));
  }
  return out;
}

/* ── THE MUTANTS ───────────────────────────────────────────────────────── */

/* each row: name, the arm that must name it, the file (a literal, so tools/guard-anchors.mjs reads it), the anchor, its replacement */
const JS_MUTANTS = [
  ['yield ignores the no-fail span', 'TF-09', 'src/core/trades.js', 'Math.min(l - R, TRADE_PM.noFailSpan)', '(l - R)'],
  ['the Mastery adds without the flag', 'TF-09', 'src/core/trades.js', '(mastery ? TRADE_PM.masteryReturn : 0)', 'TRADE_PM.masteryReturn'],
  ['speed reads no Level', 'TF-09', 'src/core/trades.js', '((TRADE_PM.speedAt99 - 1000) * lv(L)) / TRADE_PM.maxLevel', '0'],
  ['the XP window is never left', 'TF-09', 'src/core/trades.js', 'if (d <= TRADE_PM.xpWindow) return 1000;', 'return 1000;'],
  ['a tool\'s quality adds no life', 'TF-09', 'src/core/trades.js', 'Math.round((TRADE_PM.toolMs * lifePmOf(q, TRADE_PM.toolLifeRung)) / 1000)', 'TRADE_PM.toolMs'],
  ['the contest curve rounds up', 'TF-09', 'src/core/trades.js', 'Math.floor(1000 / powSquare(', 'Math.ceil(1000 / powSquare('],
  ['V ignores the quality rung', 'TF-09', 'src/core/trades.js', 'Math.max(0, Math.min(2, q | 0)) * TRADE_PM.qualitySteps', '0'],
  ['the fee rounds down', 'TF-09', 'src/core/trades.js', '* big(count) + 999n) / 1000n', '* big(count)) / 1000n'],
  ['a refined good and a part pay the fee too', 'TF-09', 'src/core/trades.js', '  if (!kind.final) return 0;\n', ''],
  ['the raw unit holds the refine too', 'TF-09', 'src/core/trades.js', 'Math.round(budget(RAW_UNIT_OF) * S.gather)', 'Math.round(budget(RAW_UNIT_OF) * (S.gather + S.refine))'],
  ['a kind row types its own time', 'TF-ROWS', 'src/data/trades.js', "meal: freeze({ trade: 'cooking',", "meal: freeze({ ms: 3000, trade: 'cooking',"],
  ['a hunted input ignores the kit-hours', 'TF-ROWS', 'src/core/trades.js', 'levers.cover[h.stream] * h.share * kitHours * 1000', 'levers.cover[h.stream] * h.share * 1000'],
  ['the rung ladder starts at Level 0', 'TF-ROWS', 'src/core/trades.js', 'R: 1 + (r - 1) * levers.rungs.span', 'R: (r - 1) * levers.rungs.span'],
  ['a part is not taken off its host', 'TF-BILL', 'src/core/trades.js', 'const R = B - (k.parts || []).reduce((a, p) => a + budget(p), 0);', 'const R = B;'],
  ['the store sells at the hero\'s own band', 'TF-STORE', 'src/core/trades.js', 'bandStep(bandOf(heroStep)) - TRADE_PM.storeLag', 'bandStep(bandOf(heroStep))'],
  ['the store sells at the crafted price', 'TF-STORE', 'src/core/trades.js', 'BigInt(TRADE_PM.storeCeiling) * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n', '1000n * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n'],
  ['the store sells a draught', 'TF-STORE', 'src/core/trades.js', "if (kind.line !== 'meal' && kind.line !== 'charge') return null;", ''],
  ['the store bids its whole ask', 'TF-STORE', 'src/core/trades.js', 'Math.floor((TRADE_PM.floorShare * value(kind, band, q)) / 1000)', 'Math.floor((TRADE_PM.storeCeiling * value(kind, band, q)) / 1000)'],
  ['a refined good pays its maker double', 'TF-HOUR', 'src/core/trades.js', 'workUh: rawUh + refineUh, ownUh: refineUh', 'workUh: rawUh + 2 * refineUh, ownUh: refineUh'],
  ['a miss still makes the good', 'TF-SETTLE', 'src/core/trades.js', "if (y < 1000 && !(rng.next() < y / 1000)) continue;", "if (y < 1000) rng.next();"],
  ['sets come back under no-fail', 'TF-SETTLE', 'src/core/trades.js', 'if (y > 1000 && rng.next() < 1 - 1000 / y) returned++;', 'if (rng.next() < 0.1) returned++;'],
  ['Fine is rolled before Master', 'TF-SETTLE', 'src/core/trades.js', 'if (pMaster > 0 && rng.next() < pMaster) made[2]++;\n    else if (rng.next() < pFine) made[1]++;', 'if (rng.next() < pFine) made[1]++;\n    else if (pMaster > 0 && rng.next() < pMaster) made[2]++;'],
  ['the bound ignores the tool', 'TF-SETTLE', 'src/core/trades.js', 'BigInt(Math.max(1, Math.min(1000, toolPm | 0)))', '1000n'],
  ['the dice ignore the seed', 'TF-SETTLE', 'src/core/trades.js', 'const rng = createRng(seed >>> 0);', 'const rng = createRng(1);'],
];

const SQL_MUTANTS = [
  ['the yield twin ignores the no-fail span', 'public.hr_trade_yield_pm(integer,integer,boolean,integer)', 'least(v_l - p_r, c.no_fail_span)', '(v_l - p_r)'],
  ['the Fine twin divides by 99', 'public.hr_trade_fine_pm(integer,integer)', '/ (c.max_level - p_r)', '/ c.max_level'],
  ['the XP twin falls through its floor', 'public.hr_trade_xp_pm(integer,integer)', 'greatest(c.xp_floor_pm, 1000', 'greatest(0, 1000'],
  ['the Level twin reads a total one short', 'public.hr_trade_level(bigint)', 'where xp <= greatest(', 'where xp < greatest('],
  ['the V twin ignores the quality rung', 'public.hr_trade_value(text,integer,integer)', "when k.rolls = 'step' then v_q * c.quality_steps", "when k.rolls = 'step' then 0"],
  ['the store twin sells at the hero\'s band', 'public.hr_trade_store_step(integer)', '* c.tier_steps - c.store_lag)', '* c.tier_steps)'],
  ['the store twin sells a draught', 'public.hr_trade_store_ask(text,integer)', "and line in ('meal', 'charge')", ''],
  ['the contest twin rounds', 'public.hr_trade_behind_pm(integer)', 'floor(1000::float8 / v_out)', 'round(1000::float8 / v_out)'],
  ['the tool-life twin ignores quality', 'public.hr_trade_tool_life_ms(integer)', 'c.tool_life_rung_pm * least(2, greatest(0, coalesce(p_q, 0)))', '0'],
  ['the bound twin ignores the tool', 'public.hr_trade_job_bound(text,integer,integer,boolean,integer,integer,integer,bigint)', 'least(1000, greatest(1, coalesce(p_tool_pm, 1000)))', '1000'],
  ['the fee twin rounds down', 'public.hr_trade_job_fee(text,integer,integer)', '* greatest(0, coalesce(p_count, 0)) + 999, 1000)', '* greatest(0, coalesce(p_count, 0)), 1000)'],
  ['the fee twin charges a part', 'public.hr_trade_job_fee(text,integer,integer)', 'if not v_final then return 0; end if;', ''],
];

async function runPure(X, only) {
  const fails = [];
  for (const [id, arm] of Object.entries(ARMS)) {
    if (only && id !== only) continue;
    let got;
    /* a throw is HARNESS, never its arm's red (tests/_mutant-verdict.mjs): a crash cannot score a mutant */
    try { got = await arm(X); } catch (e) { fails.push(harnessFail(id, e)); continue; }
    for (const g of got) fails.push(id + ' ' + g);
  }
  return fails;
}

async function runTwin(X, db) {
  try { return (await twinArm(X, db)).map((g) => 'TF-TWIN ' + g); } catch (e) { return [harnessFail('TF-TWIN', e)]; }
}

/* the whole chain, so a later file that restated a twin is judged too; the catalogue's own file must be in it */
async function boot() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db, applied } = await bootReplay();
  if (!applied.includes(OUT_NAME)) { await db.close(); throw new Error(OUT_NAME + ' is not in the replayed chain'); }
  return db;
}

async function main() {
  const X = await load(ROOT);
  if (!MUTATE) {
    const fails = await runPure(X);
    const db = await boot();
    try { fails.push(...await runTwin(X, db)); } finally { await db.close(); }
    for (const f of fails) console.log('✗ ' + f);
    console.log(fails.length ? `trade-formulas: ${fails.length} RED` : `trade-formulas: green (${[...Object.keys(ARMS), 'TF-TWIN'].join(', ')})`);
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await runPure(X);
  if (clean.length) { console.error('trade-formulas --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0, harness = 0;
  const tally = (name, arm, v) => {
    if (v.kind === 'caught') console.log(`  caught  ${name} (${v.rule}): ${v.line.slice(0, 150)}`);
    else if (v.kind === 'harness') { console.log(`  HARNESS ${name} (${arm}): ${v.why.slice(0, 150)}`); harness++; }
    else { console.log(`  ESCAPED ${name} (${arm})`); escaped++; }
  };
  for (const [name, arm, file, find, repl] of JS_MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'trade-formulas-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3|wav)$/i.test(s) });
      const f = join(dir, file);
      const src = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      if (src.split(find).length !== 2) { console.error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 70))}`); process.exit(2); }
      writeFileSync(f, src.replace(find, () => repl));
      let fails;
      try { fails = await runPure(await load(dir), arm); } catch (e) { fails = [harnessFail(arm + ' load', e)]; }
      tally(name, arm, verdict(fails));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const db = await boot();
  try {
    const control = await runTwin(X, db);
    if (control.length) { console.error('trade-formulas --mutate: the clean chain is red: ' + control.join(' | ')); process.exit(2); }
    for (const [name, sig, find, repl] of SQL_MUTANTS) {
      const def = String((await db.query('select pg_get_functiondef($1::regprocedure) d', [sig])).rows[0].d).replace(/\r/g, '');
      if (def.split(find).length !== 2) { console.error(`HARNESS: ${sig} has no single ${JSON.stringify(find)}`); process.exit(2); }
      await db.exec('begin');
      try {
        await db.exec(def.replace(find, () => repl));
        tally(name, 'TF-TWIN', verdict(await runTwin(X, db)));
      } finally { await db.exec('rollback'); }
    }
  } finally { await db.close(); }
  const total = JS_MUTANTS.length + SQL_MUTANTS.length;
  console.log(escaped || harness ? `trade-formulas --mutate: ${escaped} ESCAPED, ${harness} HARNESS of ${total}`
    : `trade-formulas --mutate: ${total}/${total} caught, each by its named arm`);
  process.exit(escaped ? 1 : harness ? 2 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
