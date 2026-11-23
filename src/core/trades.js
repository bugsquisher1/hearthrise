// ════════════════════════════════════════════════════════════════════════
// src/core/trades.js — TOWN WORK ON ONE CURVE: THE TRADES' FORMULAS (lane/trade-formulas, backend-architect, 2026-11-22;
//   docs/design/redesign/09-crafting.md section 4 (built in its section 4.8), 13-market.md section 3.2, 04-math-strategy.md section 11).
//
// Every number town work has is computed here from src/data/trades.js and the levers it reads (STORE_KIT, GEAR_STEPS, DANGER, the wage).
// Nothing is typed for a recipe, a node, a band or a Level (09 4: "No recipe has its own numbers").
//
//   THE CATALOGUE   tradeCatalogue(): every kind resolved to whole numbers. A kind's WORK is micro-hours (uh) of town work in one unit:
//                   a kit kind's is kitWork x its line's share x its split x its kit-hours (09 4.3); its materials are counted in units
//                   (a raw unit is the gathering behind one meal) by their stage shares, its parts are shares of a host kind, and its own
//                   make work is the make share (plus the refine share where its material is raw). A RECIPE is (kind, rung): rung r
//                   opens at trade Level rungLevel(r). Its BAND is the job's, never the recipe's (09 4.2).
//   ONE CURVE       for a recipe that opens at R worked at trade Level L (09 4.4), in permille:
//                     yieldPm   atReq + (1000 - atReq) x min(L - R, noFailSpan) / noFailSpan (+ Mastery, + bench), at most cap
//                     finePm    fineBase + (fineTop - fineBase) x (L - R) / (99 - R)
//                     masterPm  masterTop x (L - R) / (99 - R), only with the Mastery
//                     speedPm   1000 + (speedAt99 - 1000) x L / 99
//                     xpPm      1000 within xp.window Levels of R, then falling in a straight line to xp.floor over the next window
//   TRADE XP        tradeXpTable(): XP to reach each Level, XP counted in seconds of work (09 4.5: hours h(n) = h1 x curve^(n-1), summing
//                   to hoursTo99); a job's XP is its worked ms x xpPm / 10^6
//   VALUE           V = work-hours x townWageShare x wage(item step) x life factor (13-market 3.2); item step = band x tierSteps + the
//                   quality rung's steps (a 'step' good) or the band's step with a longer life (a 'life' good, a tool)
//   STORE           ask = ceil(storeCeiling x V of the Plain good at (the hero's band step - lagSteps)), bid = floor(floorShare x V)
//                   (09 4.6): a tier behind, at 1.5x
//   TOOLS           life = toolHours x (1 + lifeRung x quality) work-hours; speed 1 at or above the job's band, behindPm(steps) under it
//                   (09 3.7: wear counts work, never the clock)
//   THE JOB         settleJob(): one closed-form calculation from the job's seed (09 6: "attempts from elapsed time, yield and quality from
//                   the seeded dice"); jobBound() is what the server re-checks a proposed settle against (its SQL twin is generated)
//
// INTEGERS. Every input the server reads is a whole number (permille, micro-hours, ms) and every price is one rounding of an exact
// product (BigInt), so the SQL twins tools/gen-trades.mjs writes land on the same gold. behindPm walks its power by squaring in float64,
// the same multiplications hr_wage walks, so Postgres's float8 reaches the same last bit.
//
// PURE ESM, dual-runtime. No clock, no Math.random: the dice are src/core/rng.js from the job's seed.
// ════════════════════════════════════════════════════════════════════════
import { TRADE_LEVERS, TRADES, KINDS, RAW_UNIT_OF, LINE_SHARE, validate } from '../data/trades.js';
import { STORE_KIT } from '../data/store-kit.js';
import { GEAR_STEPS } from '../data/gear-steps.js';
import { DANGER } from '../data/danger.js';
import { wage } from '../data/wage.js';
import { createRng } from './rng.js';

const pm = (x) => Math.round(x * 1000);
const UH = 1e6;
const HOUR_MS = 3600000;

/** The levers as the server holds them: whole numbers (permille, steps, Levels, ms). */
export const TRADE_PM = Object.freeze({
  rungCount: TRADE_LEVERS.rungs.count, rungSpan: TRADE_LEVERS.rungs.span, maxLevel: TRADE_LEVERS.table.maxLevel,
  atReq: pm(TRADE_LEVERS.yield.atReq), noFailSpan: TRADE_LEVERS.yield.noFailSpan, cap: pm(TRADE_LEVERS.yield.cap),
  masteryReturn: pm(TRADE_LEVERS.yield.masteryReturn), benchMax: pm(TRADE_LEVERS.yield.benchMax),
  fineBase: pm(TRADE_LEVERS.quality.fineBase), fineTop: pm(TRADE_LEVERS.quality.fineTop), masterTop: pm(TRADE_LEVERS.quality.masterTop),
  qualitySteps: TRADE_LEVERS.quality.steps, speedAt99: pm(TRADE_LEVERS.speedAt99),
  xpWindow: TRADE_LEVERS.xp.window, xpFloor: pm(TRADE_LEVERS.xp.floor), xpPerHour: TRADE_LEVERS.table.xpPerHour,
  jobFee: pm(TRADE_LEVERS.jobFee), townWageShare: pm(STORE_KIT.townWageShare), storeCeiling: pm(STORE_KIT.storeCeiling),
  storeLag: TRADE_LEVERS.store.lagSteps, floorShare: pm(TRADE_LEVERS.store.floorShare), storeBudget: pm(TRADE_LEVERS.store.budgetHours),
  toolMs: Math.round(TRADE_LEVERS.tool.hours * HOUR_MS), toolLifeRung: pm(TRADE_LEVERS.tool.lifeRung),
  tierSteps: GEAR_STEPS.tierSteps,
});

/** The trade Level rung `rung` (1-based) opens at. */
export const rungLevel = (rung) => 1 + (rung - 1) * TRADE_PM.rungSpan;
/** The band of a step (one band is one gear tier), and the step a band's goods are made at. */
export const bandOf = (step) => Math.max(0, Math.floor((Number(step) || 0) / TRADE_PM.tierSteps));
export const bandStep = (band) => Math.max(0, Math.floor(Number(band) || 0)) * TRADE_PM.tierSteps;

/* ── THE CATALOGUE ─────────────────────────────────────────────────────── */

const effectHours = (k) => (k.effect === 'imbue' ? TRADE_LEVERS.imbue.hours / TRADE_LEVERS.imbue.slots : k.effect);

/** Every kind resolved to whole numbers, and the ladder. Throws on a row src/data/trades.js validate refuses. Pure; the same every call. */
export function tradeCatalogue(kinds = KINDS, levers = TRADE_LEVERS, lines = LINE_SHARE) {
  const problems = validate(levers, kinds, TRADES, lines);
  if (problems.length) throw new Error('trades: ' + problems.join('; '));
  const S = levers.stageShare;
  const anyTool = Object.keys(kinds).find((id) => kinds[id].budget === 'tool');
  const budget = (id) => {
    const k = kinds[id];
    if (k.line) return STORE_KIT.kitWork * lines[k.line] * k.split * effectHours(k) * UH;
    if (k.budget === 'tool') return levers.tool.work * UH;
    if (k.budget === 'temperKit') return levers.temperKitWork * UH;
    return k.budget.share * budget(k.budget.of === 'tool' ? anyTool : k.budget.of);
  };
  const rawUh = Math.round(budget(RAW_UNIT_OF) * S.gather);
  const refineUh = Math.round(rawUh * S.refine / S.gather);
  const out = {};
  const resolve = (id) => {
    if (out[id]) return out[id];
    const k = kinds[id];
    /* FINAL: a finished good (a kit kind, a Temper kit, a tool). The job fee is charged on finished goods only, on their whole V, so a
       chain pays it once (09 5.6's fees are jobFee x the kit's value); a refined good and a part pay none */
    const final = k.stage === 'make' && !(k.budget && typeof k.budget === 'object');
    const base = { id, trade: k.trade, stage: k.stage, line: k.line || null, opens: k.opens, ships: k.ships, rolls: k.rolls || null, final };
    if (k.stage === 'gather') return (out[id] = Object.freeze({ ...base, workUh: rawUh, ownUh: rawUh, inputs: Object.freeze([]), hunted: Object.freeze([]) }));
    if (k.stage === 'refine') {
      return (out[id] = Object.freeze({ ...base, workUh: rawUh + refineUh, ownUh: refineUh,
        inputs: Object.freeze([Object.freeze({ kind: k.from[0].kind, n: 1 })]), hunted: Object.freeze([]) }));
    }
    const B = budget(id);
    const parts = (k.parts || []).map((p) => resolve(p));
    const R = B - (k.parts || []).reduce((a, p) => a + budget(p), 0);
    const from = k.from || [];
    const mats = from.map((m) => {
      const refined = kinds[m.kind].stage === 'refine';
      const unit = refined ? rawUh + refineUh : rawUh;
      const n = Math.max(1, Math.round((R * (S.gather + (refined ? S.refine : 0)) * m.share) / unit));
      return { kind: m.kind, n, uh: n * unit, raw: !refined, share: m.share };
    });
    const rawShare = mats.filter((m) => m.raw).reduce((a, m) => a + m.share, 0);
    const ownUh = Math.round(from.length ? R * (S.make + S.refine * rawShare) : R);
    const kitHours = k.line ? effectHours(k) : 0;
    const hunted = (k.hunted || []).map((h) => Object.freeze({ stream: h.stream, pm: Math.round(levers.cover[h.stream] * h.share * kitHours * 1000) }));
    const workUh = parts.reduce((a, p) => a + p.workUh, 0) + mats.reduce((a, m) => a + m.uh, 0) + ownUh;
    return (out[id] = Object.freeze({ ...base, workUh, ownUh, budgetUh: Math.round(B),
      inputs: Object.freeze([...parts.map((p) => Object.freeze({ kind: p.id, n: 1 })), ...mats.map((m) => Object.freeze({ kind: m.kind, n: m.n }))]),
      hunted: Object.freeze(hunted) }));
  };
  for (const id of Object.keys(kinds)) resolve(id);
  const recipes = [];
  for (const id of Object.keys(kinds)) for (let r = kinds[id].opens; r <= levers.rungs.count; r++) recipes.push(Object.freeze({ kind: id, rung: r, R: 1 + (r - 1) * levers.rungs.span }));
  return Object.freeze({ rawUh, refineUh, kinds: Object.freeze(out), recipes: Object.freeze(recipes) });
}

/* ── ONE CURVE (09 4.4) ───────────────────────────────────────────────── */

const lv = (L) => Math.min(TRADE_PM.maxLevel, Math.max(1, Math.floor(Number(L) || 1)));

/** Yield in permille for a recipe opening at R worked at Level L (null: L is under R). Mastery and the hall's bench add to it. */
export function yieldPm(L, R, mastery = false, benchPm = 0) {
  const l = lv(L);
  if (l < R) return null;
  const t = Math.min(l - R, TRADE_PM.noFailSpan);
  const y = TRADE_PM.atReq + Math.floor(((1000 - TRADE_PM.atReq) * t) / TRADE_PM.noFailSpan)
    + (mastery ? TRADE_PM.masteryReturn : 0) + Math.min(TRADE_PM.benchMax, Math.max(0, Math.floor(benchPm) || 0));
  return Math.min(TRADE_PM.cap, y);
}

const over = (L, R) => { const l = lv(L); return l < R ? null : [l - R, TRADE_PM.maxLevel - R]; };
/** The chance in permille a made good rolls Fine (after Master missed). */
export function finePm(L, R) {
  const o = over(L, R);
  return o ? TRADE_PM.fineBase + Math.floor(((TRADE_PM.fineTop - TRADE_PM.fineBase) * o[0]) / o[1]) : null;
}
/** The chance in permille a made good rolls Master: only with the trade's Mastery. */
export function masterPm(L, R, mastery = false) {
  const o = over(L, R);
  return o ? (mastery ? Math.floor((TRADE_PM.masterTop * o[0]) / o[1]) : 0) : null;
}
/** Work speed in permille at trade Level L: 1 at Level 0, speedAt99 at 99. */
export const speedPm = (L) => 1000 + Math.floor(((TRADE_PM.speedAt99 - 1000) * lv(L)) / TRADE_PM.maxLevel);
/** The XP factor in permille for a rung opening at R worked at Level L. */
export function xpPm(L, R) {
  const d = lv(L) - R;
  if (d < 0) return null;
  if (d <= TRADE_PM.xpWindow) return 1000;
  return Math.max(TRADE_PM.xpFloor, 1000 - Math.floor(((1000 - TRADE_PM.xpFloor) * (d - TRADE_PM.xpWindow)) / TRADE_PM.xpWindow));
}

/* ── TRADE XP (09 4.5) ────────────────────────────────────────────────── */

let XP_TO = null;
/** XP (seconds of work) to REACH each Level: [0] is Level 1 (0 XP), [98] is Level 99. */
export function tradeXpTable() {
  if (XP_TO) return XP_TO;
  const { hoursTo99, curve, xpPerHour, maxLevel } = TRADE_LEVERS.table;
  let cK = 1;
  for (let i = 0; i < maxLevel - 1; i++) cK *= curve;
  const h1 = (hoursTo99 * (curve - 1)) / (cK - 1);
  const out = [0];
  let hours = 0, c = 1;
  for (let n = 1; n < maxLevel; n++) { hours += h1 * c; c *= curve; out.push(Math.round(hours * xpPerHour)); }
  return (XP_TO = Object.freeze(out));
}
/** The trade Level an XP total reads. */
export function tradeLevel(xp) {
  const t = tradeXpTable();
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let n = 1;
  while (n < t.length && t[n] <= x) n++;
  return n;
}

/* ── VALUE (13-market 3.2) ────────────────────────────────────────────── */

const big = (n) => BigInt(Math.floor(n));
/** The item step a good of `band` and quality `q` (0 Plain, 1 Fine, 2 Master) sits at; a 'life' good's quality is life, not step. */
export const itemStep = (band, q = 0, rolls = 'step') => bandStep(band) + (rolls === 'step' ? Math.max(0, Math.min(2, q | 0)) * TRADE_PM.qualitySteps : 0);
/** The life factor in permille a good's quality gives ('life' goods only). */
const lifePmOf = (q, rolls) => (rolls === 'life' ? 1000 + TRADE_PM.toolLifeRung * Math.max(0, Math.min(2, q | 0)) : 1000);

/** V in whole gold: `workUh` micro-hours of work at item step `step`, times a life factor in permille. */
export function valueAt(workUh, step, lifePm = 1000) {
  return Number((big(workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(step)) * BigInt(lifePm)) / 1000000000000n);
}
/** V of one unit of a resolved kind at `band` and quality `q`. A good that rolls no quality is Plain. */
export function value(kind, band, q = 0) {
  const qq = kind.rolls ? q : 0;
  return valueAt(kind.workUh, itemStep(band, qq, kind.rolls || 'step'), lifePmOf(qq, kind.rolls));
}
/** The job fee, burned at the job's start: jobFee x the Plain V of what it asks to make, a finished good only (0 for any other). */
export function jobFee(kind, band, count) {
  if (!kind.final) return 0;
  return Number((BigInt(TRADE_PM.jobFee) * BigInt(value(kind, band, 0)) * big(count) + 999n) / 1000n);
}

/* ── THE STORE (09 2.5, 4.6) ──────────────────────────────────────────── */

/** The step the store's good stands at for a hero at `heroStep`: its band's step, one tier (lagSteps) behind. */
export const storeStep = (heroStep) => Math.max(0, bandStep(bandOf(heroStep)) - TRADE_PM.storeLag);
/** What the store asks for one unit of a kind, Plain, for a hero at `heroStep`: storeCeiling x V there, rounded up once. The store sells
    the meal and charge lines only (09 2.5: draughts and imbuements are never sold by it); null for any other kind. */
export function storeAsk(kind, heroStep) {
  if (kind.line !== 'meal' && kind.line !== 'charge') return null;
  const num = BigInt(TRADE_PM.storeCeiling) * big(kind.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * 1000n;
  const den = 1000000000000000n;
  return Number((num + den - 1n) / den);
}
/** What the store bids for one unit: floorShare x V (the floor; the account's day budget is storeBudget hours of wage). */
export const storeBid = (kind, band, q = 0) => Math.floor((TRADE_PM.floorShare * value(kind, band, q)) / 1000);

/* ── TOOLS (09 3.7) ───────────────────────────────────────────────────── */

/* r ^ n by squaring: the same multiplications, in the same order, as the SQL twin (and as wage.js walks the wage) */
function powSquare(r, n) {
  let out = 1, b = r, k = n;
  while (k > 0) { if (k % 2 === 1) out *= b; b *= b; k = Math.floor(k / 2); }
  return out;
}
/** What a good `steps` steps behind does, in permille of one at the job's step: the contest curve (09 4.2: 93% at 20, 71% at 100). */
export const behindPm = (steps) => Math.floor(1000 / powSquare(1 + DANGER.powerStep, Math.max(0, Math.floor(steps) || 0)));
/** A tool's work speed in permille on a job of band `jobBand`: full at or above it, the contest curve behind it. */
export const toolSpeedPm = (toolBand, jobBand) => (toolBand >= jobBand ? 1000 : behindPm((jobBand - toolBand) * TRADE_PM.tierSteps));
/** A tool's life in work-ms by quality (Plain 12 h, Fine 15, Master 18 at the starting values). */
export const toolLifeMs = (q = 0) => Math.round((TRADE_PM.toolMs * lifePmOf(q, 'life')) / 1000);
/** The store's rented tool, by the work-hour, for a hero at `heroStep`: storeCeiling x its V there over a Plain tool's hours. */
export function toolRentPerHour(tool, heroStep) {
  const num = BigInt(TRADE_PM.storeCeiling) * big(tool.workUh) * BigInt(TRADE_PM.townWageShare) * BigInt(wage(storeStep(heroStep))) * BigInt(HOUR_MS);
  const den = 1000000000000n * BigInt(TRADE_PM.toolMs);
  return Number((num + den - 1n) / den);
}

/* ── THE JOB (09 4.4, 6) ──────────────────────────────────────────────── */

/**
 * WHAT THE SERVER MAY ADMIT for a job: the attempts its time allows, the time they take, the most units it can make and the XP it pays.
 * `kind` a resolved kind, `rung`, `level` the company's trade Level, `toolPm` the tool's speed (toolSpeedPm), `count` the attempts asked,
 * `elapsedMs` the job's time on the server's clock. Null: the rung is not open to the kind or to the Level.
 */
export function jobBound(kind, rung, level, { mastery = false, benchPm = 0, toolPm = 1000, count, elapsedMs }) {
  const R = rungLevel(rung);
  if (rung < kind.opens || rung > TRADE_PM.rungCount || lv(level) < R) return null;
  const y = yieldPm(level, R, mastery, benchPm);
  const per = BigInt(speedPm(level)) * BigInt(Math.max(1, Math.min(1000, toolPm | 0)));
  const unit = big(kind.ownUh) * BigInt(HOUR_MS);
  const byTime = Number((big(Math.max(0, elapsedMs)) * per) / unit);
  const attempts = Math.max(0, Math.min(byTime, Math.floor(count) || 0));
  const spentMs = Number((BigInt(attempts) * unit + per - 1n) / per);
  return {
    yieldPm: y, attempts, spentMs,
    unitsMax: kind.stage === 'gather' && y > 1000 ? attempts * 2 : attempts,
    returnedMax: kind.stage !== 'gather' && y > 1000 ? attempts : 0,
    xp: Math.floor((spentMs * xpPm(level, R)) / 1000000),
  };
}

/**
 * THE CLOSED-FORM SETTLE (09 6: "attempts from elapsed time, yield and quality from the seeded dice"). One call settles a whole job at
 * its end or at a stop; the same seed always lands the same goods. Returns null when jobBound refuses the job.
 *   gather   each attempt makes a unit with yield's chance under 1000, and a second with (yield - 1000)'s over it: units an hour is
 *            speed x yield over the raw unit's work (09 4.5: "its yield is units an hour")
 *   refine / make   each attempt spends one set of inputs; under 1000 it makes the good with yield's chance (a miss loses the set);
 *            over 1000 it always makes it and hands the set back with chance 1 - 1000 / yield, so a set makes yield / 1000 goods
 *   quality  a good that rolls it: Master first (with the Mastery), then Fine, else Plain (09 4.4's cascade)
 */
export function settleJob(kind, rung, level, { mastery = false, benchPm = 0, toolPm = 1000, count, elapsedMs, seed }) {
  const b = jobBound(kind, rung, level, { mastery, benchPm, toolPm, count, elapsedMs });
  if (!b) return null;
  const R = rungLevel(rung);
  const rng = createRng(seed >>> 0);
  const y = b.yieldPm;
  const pFine = kind.rolls ? finePm(level, R) / 1000 : 0;
  const pMaster = kind.rolls ? masterPm(level, R, mastery) / 1000 : 0;
  const made = [0, 0, 0];
  let returned = 0;
  for (let i = 0; i < b.attempts; i++) {
    if (kind.stage === 'gather') {
      if (y >= 1000 || rng.next() < y / 1000) made[0]++;
      if (y > 1000 && rng.next() < (y - 1000) / 1000) made[0]++;
      continue;
    }
    if (y > 1000 && rng.next() < 1 - 1000 / y) returned++;
    if (y < 1000 && !(rng.next() < y / 1000)) continue;
    if (!kind.rolls) { made[0]++; continue; }
    if (pMaster > 0 && rng.next() < pMaster) made[2]++;
    else if (rng.next() < pFine) made[1]++;
    else made[0]++;
  }
  return { attempts: b.attempts, spentMs: b.spentMs, xp: b.xp, plain: made[0], fine: made[1], master: made[2], returned, wearMs: b.spentMs };
}
