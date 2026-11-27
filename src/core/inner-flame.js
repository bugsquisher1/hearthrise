// ════════════════════════════════════════════════════════════════════════
// src/core/inner-flame.js — THE INNER FLAME'S ARITHMETIC (systems, lane/flame-temper-build, 2026-11-22; 21-flame-temper-imbue-loot.md
// section 1). The levers are src/data/inner-flame.js's. Every function is whole-number arithmetic or the wage's squaring walk, so the
// browser, the edge, the Lab and Postgres (the twins in supabase/migrations/1063-flame-temper*.sql, pinned by their self-checks) reach the
// same last bit.
//
// WHO READS IT. The server owns the flame (company_flame): the settle decays its height by hunted hero-minutes and the burn verb fills
// it. The drop roller (lane/drop-formula, wave 4) reads luckPm(height) at its window's start for each hero's company and multiplies the
// Rare and Very Rare chance by (1000 + luck) / 1000 after depth and before pity (21 section 1.2, guard rails); topRankPmOf is the top open
// rank's chance (D-4). Nothing here moves a value: the browser may show it, the server decides it.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ════════════════════════════════════════════════════════════════════════
import { FLAME, FLAME_LEVELS } from '../data/inner-flame.js';
import { DANGER } from '../data/danger.js';

const MINUTE_MS = 60000;
const toInt = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0);
const clampLevel = (fl) => Math.max(1, Math.min(FLAME.levelMax, toInt(fl) || 1));

/** The burn a hunted hero-hour at Flame Level `fl`, in parts per million of the height (80,000 at 1, 40,000 at 99). */
export function decayPpm(fl) {
  const L = clampLevel(fl);
  return FLAME.decayPpm1 - Math.floor(((FLAME.decayPpm1 - FLAME.decayPpm99) * (L - 1)) / (FLAME.levelMax - 1));
}

/** The room at Flame Level `fl`: the most height the fire holds, in milli-points (cover / decay: 18,750 at 1, 37,500 at 99). */
export function roomMpts(fl) {
  return Math.floor((FLAME.coverPm * 1000000) / decayPpm(fl));
}

/** The Rare luck of a height (milli-points): permille added to 1 on the Rare and Very Rare chance, luckMax x H / (H + luckHalf). */
export function luckPm(heightMpts) {
  const h = Math.max(0, toInt(heightMpts));
  return Math.floor((FLAME.luckMaxPm * h) / (h + FLAME.luckHalfMpts));
}

/** The chance of the top rank open at a depth, permille, for a hero whose company's flame gives `luck` permille (D-4). */
export function topRankPmOf(luck) {
  const l = Math.max(0, toInt(luck));
  return Math.min(FLAME.topRankMaxPm, Math.floor((FLAME.topRankPm * (1000 + l)) / 1000));
}

/** The Flame Level that `pointsMpts` burned down stands at (1 to levelMax). */
export function levelOf(pointsMpts) {
  const p = Math.max(0, toInt(pointsMpts));
  let L = 1;
  while (L < FLAME.levelMax && FLAME_LEVELS[L] <= p) L++;
  return L;
}

/**
 * THE SETTLE'S DECAY: `heroMs` hunted hero-milliseconds burn the height down, a whole hero-minute at a time (a part of a minute is
 * carried). Each minute burns ceil(height x decay / 60,000,000) milli-points, so a lit fire always burns; what burns is Flame XP, and the
 * Level (and so the decay) is re-read every minute. A death takes nothing (21 section 1.2): only hunted time burns.
 * `flame` is { height, points, carryMs } (milli-points, milli-points, ms). Answers the new { height, points, carryMs, level, burned }.
 */
export function decay(flame, heroMs) {
  let h = Math.max(0, toInt(flame && flame.height)), p = Math.max(0, toInt(flame && flame.points));
  const total = Math.max(0, toInt(flame && flame.carryMs)) + Math.max(0, toInt(heroMs));
  let minutes = Math.floor(total / MINUTE_MS), burned = 0, L = levelOf(p);
  while (minutes > 0 && h > 0) {
    const lost = Math.floor((h * decayPpm(L) + (60 * 1000000 - 1)) / (60 * 1000000));
    h -= lost; p += lost; burned += lost; minutes--;
    if (L < FLAME.levelMax && FLAME_LEVELS[L] <= p) L = levelOf(p);
  }
  return { height: h, points: p, carryMs: total % MINUTE_MS, level: L, burned };
}

/* (1 + powerStep) ^ n by squaring, multiplications only (the wage's walk, src/data/wage.js): the same last bit everywhere */
function stepPow(n) {
  let out = 1, b = 1 + DANGER.powerStep, k = n;
  while (k > 0) { if (k % 2 === 1) out *= b; b *= b; k = Math.floor(k / 2); }
  return out;
}

/** The worth of `count` units of band `band` for a company whose highest hero Level is `top`, in milli-points (floored once). */
export function fuelWorthMpts(count, band, top) {
  const n = Math.max(0, toInt(count));
  if (n === 0) return 0;
  const gap = Math.max(0, toInt(top) - toInt(band));
  return Math.floor((n * 1000) / FLAME.fuelRef / stepPow(gap));
}

/**
 * THE BURN (hr_flame_burn's twin): up to `count` units of band `band` go on a fire at `height` and Flame Level `fl`, never past the room.
 * Answers { units, mpts, height }: the units taken (the rest stay where they were) and the milli-points they add. The units are the most
 * whose worth fits the space left, found by the worth itself (monotone), so the server and this agree to the unit.
 */
export function burn(height, fl, count, band, top) {
  const h = Math.max(0, toInt(height)), space = Math.max(0, roomMpts(fl) - h), want = Math.max(0, toInt(count));
  if (space === 0 || want === 0) return { units: 0, mpts: 0, height: h };
  if (fuelWorthMpts(want, band, top) <= space) { const m = fuelWorthMpts(want, band, top); return { units: want, mpts: m, height: h + m }; }
  let lo = 0, hi = want;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (fuelWorthMpts(mid, band, top) <= space) lo = mid; else hi = mid; }
  const m = fuelWorthMpts(lo, band, top);
  return { units: lo, mpts: m, height: h + m };
}

/** The stoke rule's TARGET at Flame Level `fl`: `keepPm` of the room (Keep full 1000, Keep 2/3 667, Off 0), in milli-points. */
export function targetMpts(fl, keepPm) {
  const k = Math.max(0, Math.min(1000, toInt(keepPm)));
  return Math.floor((roomMpts(fl) * k) / 1000);
}

/**
 * THE BURN UP TO THE STOKE RULE'S TARGET (the settle's walk): `burn` on a fire whose room is the target. The space left is
 * target - height, so the fire is lifted by (room - target) and `burn` finds the units (the SQL twin calls hr_flame_burn_units the
 * same way, so the two agree to the unit). Answers { units, mpts, height }.
 */
export function burnTo(height, fl, keepPm, count, band, top) {
  const h = Math.max(0, toInt(height)), lift = roomMpts(fl) - targetMpts(fl, keepPm);
  const b = burn(h + lift, fl, count, band, top);
  return { units: b.units, mpts: b.mpts, height: h + b.mpts };
}

/**
 * THE SETTLE'S WALK (lane/f1-inner-flame, 2026-11-26; 21 sections 1.2 and 1.4): one company's fire over one settle window, on the
 * window's own clock. The server's twin is hr_flame_walk (supabase/migrations/1074-inner-flame-luck.sql), pinned point for point.
 *   flame    { height, points, carryMs } as the server stored it at the window's start
 *   spans    [{ key, from, to }]: each hero of the company in the window and the milliseconds it hunted ([from, to], the server's
 *            settled_to before and after)
 *   drops    [{ at, key, item, qty }] in the order the engine gave them: each Remains a hero picked up, and when
 *   keepPm   the stoke rule's share of the room (FLAME.stokeKeeps: Keep full 1000, Keep 2/3 667, Off 0)
 *   bandOf   (item) -> the fuel's band, or null (not fuel: it never burns)
 *   topOf    (key) -> the company's highest hero Level, frozen when that hero's hunt began (hunt_flame.top)
 * Hunted hero-time burns the height down a whole hero-minute at a time, counted on the clock across every hero (decay, the carry kept);
 * each drop goes on the fire AT ITS INSTANT, after every minute that ended by then, up to the stoke rule's target at that moment, and
 * what does not fit stays in the bag. Cut the window anywhere and resume from the stored answer: the same answer, so a watched hunt and
 * a closed one store the same fire (pure decay steps between two drops are one function applied n times, so their grouping is free).
 * Answers { height, points, carryMs, level, burned: { key: { item: units } }, units, mpts, decayed }.
 */
export function walk(flame, spans, drops, keepPm, bandOf, topOf) {
  let st = { height: Math.max(0, toInt(flame && flame.height)), points: Math.max(0, toInt(flame && flame.points)),
    carryMs: Math.max(0, toInt(flame && flame.carryMs)) };
  const sp = (Array.isArray(spans) ? spans : []).map((s) => ({ from: toInt(s.from), to: toInt(s.to) })).filter((s) => s.to > s.from);
  const burned = {};
  let units = 0, mpts = 0, decayed = 0;
  if (!sp.length) return { ...st, level: levelOf(st.points), burned, units, mpts, decayed };
  let t = Math.min(...sp.map((s) => s.from));
  const end = Math.max(...sp.map((s) => s.to));
  const advance = (t1) => {
    if (!(t1 > t)) return;
    let ms = 0;
    for (const s of sp) ms += Math.max(0, Math.min(t1, s.to) - Math.max(t, s.from));
    const d = decay(st, ms);
    st = { height: d.height, points: d.points, carryMs: d.carryMs };
    decayed += d.burned;
    t = t1;
  };
  for (const d of Array.isArray(drops) ? drops : []) {
    const band = bandOf(d.item);
    const qty = Math.max(0, toInt(d.qty));
    if (band === null || band === undefined || qty === 0) continue;
    advance(Math.min(end, toInt(d.at)));
    const b = burnTo(st.height, levelOf(st.points), keepPm, qty, band, topOf(d.key));
    if (b.units < 1) continue;
    st.height = b.height;
    const row = burned[d.key] || (burned[d.key] = {});
    row[d.item] = (row[d.item] || 0) + b.units;
    units += b.units; mpts += b.mpts;
  }
  advance(end);
  return { ...st, level: levelOf(st.points), burned, units, mpts, decayed };
}

/** A named fuel's burst at Flame Level `fl`: burstPm of the room, which it may stand over by that much (21 section 1.2). */
export function burstMpts(fl) {
  return Math.floor((roomMpts(fl) * FLAME.burstPm) / 1000);
}

/**
 * THE STOKE RULE, clamped (hr_flame_stoke_set's twin): { keep: 'full' | 'two_thirds' | 'off', own_first, buy_per_day, cap_hours_pm,
 * sell_rest }. An unknown keep is null (the verb refuses it, never guesses); the limits are held to the catalogue's.
 */
export function clampStoke(rule) {
  const r = rule && typeof rule === 'object' ? rule : {};
  const keep = typeof r.keep === 'string' && Object.prototype.hasOwnProperty.call(FLAME.stokeKeeps, r.keep) ? r.keep : null;
  if (!keep) return null;
  const lim = (v, max) => Math.max(0, Math.min(max, toInt(v)));
  return {
    keep, own_first: r.own_first !== false,
    buy_per_day: lim(r.buy_per_day, FLAME.stokeBuyMax),
    cap_hours_pm: lim(r.cap_hours_pm, FLAME.stokeCapHoursPm),
    sell_rest: r.sell_rest === true,
  };
}
