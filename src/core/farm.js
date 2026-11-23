// ============================================================
// src/core/farm.js — plot tiers and the b220 crop GROWTH MODEL.
//
// Farming is the only system whose progress is wall-clock rather than
// action-count, which makes it the easiest domain to move server-side:
// there is no accrual loop at all, just
//
//     ready(plot) ⇔ now >= plantedAt + growth_ms(crop, waterings)
//
// Growth is purely DERIVED from timestamps — plantedAt plus a list of
// watering timestamps — so there is no stored counter to desync, offline
// catch-up is free, and the same numbers re-derive identically on the
// server (design §3, "Farming — the wall-clock case").
//
//     growth-hours = elapsed + min(waterBonus, elapsed)
//
// The min() is the load-bearing invariant: whatever lands in `waterings`
// (corruption, a forged save, a duplicated timestamp), effective growth
// can never exceed 2× real elapsed time.
//
// Ported from src/features/farm-progression.js, which now delegates here.
// The `now` clock and the CROPS catalogue are PARAMETERS — that is the
// only change, and it is the one that makes the module server-runnable.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================
import { wageListPrice } from '../data/wage.js';

/* Plot tier → crop unlock set. Lv 1 is the starting state; the price of each
   tier above it is PLOT_TIER_PRICES below. */
export const PLOT_TIERS = [
  null, // index 0 unused
  { unlocks: ['turnip'] },
  { unlocks: ['turnip', 'carrot', 'wheat'] },
  { unlocks: ['turnip', 'carrot', 'wheat', 'potato', 'tomato'] },
  /* b223: the three b215 endgame crops had their own farming skill gates but
     were in no tier, so farming's last 37 levels had nothing new to plant even
     at max plot level. Goldenroot lands at Lv 4. */
  { unlocks: ['turnip', 'carrot', 'wheat', 'potato', 'tomato', 'pumpkin', 'goldenroot'] },
  { unlocks: ['turnip', 'carrot', 'wheat', 'potato', 'tomato', 'pumpkin', 'goldenroot', 'emberfruit', 'moonbloom'] },
];
export const MAX_PLOT_LEVEL = PLOT_TIERS.length - 1; // 5

/* ── b510 — THE PLOT-TIER PRICE. THE ONE AUTHORED COPY, CLIENT SIDE. ─────────
   MEASURED 2026-09-06: farm plants across the whole player base went 46/day
   (Aug 24) -> 26 -> 6 -> ZERO every day Aug 27..Sep 5. Every character's
   server plot_level was 1, turnip is the only tier-1 crop, and the ONLY way
   to raise the tier was `cost` above — Farmer's Deeds, which drop at 0.1%
   per Tier-2+ kill / 0.5% per bounty. A level-12 farmer holding carrot seeds
   could not plant them and had no realistic path to tier 2, so everything
   above turnip was dead content for everyone.

   THE RULING: the plot tier is NEVER the gate. You buy it slightly BEFORE the
   crop it unlocks becomes plantable, and the CROP's own farming level does the
   pacing (carrot 10, potato 30, pumpkin 50, emberfruit 75). Price is GOLD,
   a sink a farmer actually meets. (The Farmer's Deed was an alternative
   payment until it left the catalogue with every source it had, 2026-10-23;
   the server stopped taking it with lane/c-dead-plot-deed, 2026-11-07.)

   `farming` is the farming level required; `gold` the price, DERIVED: `hoursPm` milli-hours of wage at step 1 as a
   list price (src/data/wage.js wageListPrice, two figures; lane/prices-wage-hours 2026-11-23, 27-formula-overhaul.md T-5: the land is the account's and
   has no step of its own, so it reads the base wage). The hours give back the 2026-11-22 tags; tier 2's 500 sits
   between two whole milli-hours at step 1 and lists at 510.
   tools/gen-farm-catalogues.mjs generates hr_plot_tier from this table, and
   tests/plot-tier-parity.mjs holds it equal to the server catalogue, so the
   client can never quote a price the server does not charge.

   TARGET CURVE for a player who farms nightly:
     tier 2  farming  5 +    510g — first evening (≈4 turnip harvests)
     tier 3  farming 25 +  5,000g — days 3–5
     tier 4  farming 45 + 25,000g — week 2–3
     tier 5  farming 70 + 100,000g — the long tail toward 99
   THE SERVER PRICES IT. These numbers are a MIRROR for the UI and the
   pre-flight refusal; hr_farm_upgrade_plot re-reads its own catalogue under a
   row lock and is the only thing that may move plot_level or spend anything. */
const plotTier = (hoursPm, farming) => Object.freeze({ hoursPm, gold: wageListPrice(hoursPm, 1), farming });
export const PLOT_TIER_PRICES = Object.freeze({
  2: plotTier(39, 5),
  3: plotTier(387, 25),
  4: plotTier(1933, 45),
  5: plotTier(7733, 70),
});

/** The price of the NEXT tier, or null at max. Shape mirrors hr_plot_tier. */
export function plotUpgradePrice(plotLevel) {
  const lv = clampPlotLevel(plotLevel);
  if (lv >= MAX_PLOT_LEVEL) return null;
  const p = PLOT_TIER_PRICES[lv + 1];
  if (!p) return null;
  return { level: lv + 1, gold: p.gold, farming: p.farming };
}

/* The pre-flight: the Farming gate first, then the gold. The server re-checks both
   under its own lock and is the only thing that may move the tier. */
export function plotUpgradeCheck(st) {
  const s = st || {};
  const lv = clampPlotLevel(s.plotLevel);
  const price = plotUpgradePrice(lv);
  if (!price) return { ok: false, error: 'max_plot_level', level: lv, price: null };
  const farming = Math.max(1, Math.floor(Number(s.farmingLevel) || 1));
  const gold = Math.max(0, Math.floor(Number(s.gold) || 0));
  if (farming < price.farming) {
    return { ok: false, error: 'farm_level_too_low', need: price.farming, have: farming, price };
  }
  if (gold >= price.gold) return { ok: true, pay: 'gold', price };
  return { ok: false, error: 'cannot_afford', price, gold };
}

/* b420/b428 — FINITE-PERENNIAL regrow limits. A `regrows:true` crop is NOT
   infinite: one seed buys REGROW_LIMITS[id] regrows (that many + 1 total
   harvests), then the plant withers and the plot clears. This is the ONE
   source of truth for the limit, read by the client overlay (main.js
   applyPerennialLimits → CROPS[id].regrowLimit) AND generated into the
   hr_crops.regrow_limit catalogue column by tools/gen-farm-catalogues.mjs so
   the server-authoritative harvest RPC enforces the identical wither. Lives in
   farm.js (a farm constant, NOT vendored into hr-accrue) rather than
   gathering.js so folding it in does not force an edge redeploy. A non-regrow
   crop is absent from this map; the server treats absence as the legacy
   infinite sentinel (0), which the generator's self-check forbids on any
   regrowing crop. */
export const REGROW_LIMITS = Object.freeze({ tomato: 4, emberfruit: 4 });

export const WATER_WINDOW_H = 2;         // hours a single watering stays active
export const WATER_RATE = 2.0;           // growth-hours per real hour while watered
export const WATER_WINDOW_MS = WATER_WINDOW_H * 3600000;
export const MAX_WATERINGS = 8;          // defensive array cap

export function clampPlotLevel(n) {
  const v = Math.floor(Number(n) || 1);
  if (v < 1) return 1;
  if (v > MAX_PLOT_LEVEL) return MAX_PLOT_LEVEL;
  return v;
}

export function unlockedCrops(plotLevel) {
  return PLOT_TIERS[clampPlotLevel(plotLevel)].unlocks.slice();
}

/** Which plot indices are plantable RIGHT NOW: empty, and inside the property's
    plot cap. ONE answer for the farm render's "Plant all (n)" label and for the
    sweep itself — deriving it twice is how the button came to offer a sweep that
    then placed nothing and said nothing (live 2026-09-13). */
export function emptyPlotIndices(plots, cap) {
  const arr = Array.isArray(plots) ? plots : [];
  const n = Math.max(0, Math.floor(Number(cap) || 0));
  const out = [];
  for (let i = 0; i < n; i++) if (!arr[i]) out.push(i);
  return out;
}

export function canPlantCrop(plotLevel, cropId) {
  if (!cropId) return false;
  return unlockedCrops(plotLevel).indexOf(cropId) !== -1;
}

/** The LOWEST plot level whose tier unlocks `cropId`, or 0 if no tier does.
    THE ONE crop→tier answer on the client: the plant gate, the refusal line and
    the seed picker's locked rows all read this rather than each re-deriving a
    number (b136 shipped `lv+1`, which is the player's NEXT level, not the
    crop's requirement — it lied for every crop more than one tier away).
    Mirrors the server's hr_crop_plot_tier catalogue, which the generator
    tools/gen-farm-catalogues.mjs emits from this same PLOT_TIERS table. */
export function requiredPlotLevel(cropId) {
  if (!cropId) return 0;
  for (let lv = 1; lv <= MAX_PLOT_LEVEL; lv++) {
    if (PLOT_TIERS[lv].unlocks.indexOf(cropId) !== -1) return lv;
  }
  return 0;
}

// ── The growth model ─────────────────────────────────────────────────────

/** Defensive, idempotent shape repair. Mutates and returns the plot. */
export function normalizePlot(plot, now) {
  if (!plot || typeof plot !== 'object') return plot;
  if (typeof plot.plantedAt !== 'number' || !isFinite(plot.plantedAt)) {
    plot.plantedAt = now;
    plot.waterings = [];
    return plot;
  }
  if (!Array.isArray(plot.waterings)) {
    /* Legacy shape: a boolean flag. `true` retro-credits one window from
       planting (strictly better for the player); `false` becomes "dry",
       which un-sticks the plot instead of stalling it forever. b222: nothing
       WRITES `watered` any more — this is its last reader, kept because
       pre-b220 saves and old cloud snapshots still carry it. */
    plot.waterings = plot.watered ? [plot.plantedAt] : [];
  }
  if (plot.waterings.length > MAX_WATERINGS) {
    plot.waterings = plot.waterings.slice(-MAX_WATERINGS);
  }
  return plot;
}

/** THE single source of truth for farm growth. */
export function growthHours(plot, now) {
  if (!plot) return 0;
  normalizePlot(plot, now);
  const elapsed = (now - plot.plantedAt) / 3600000;
  if (!(elapsed > 0)) return 0;                    // guard: future/equal plantedAt
  let bonus = 0;
  const ws = plot.waterings;
  for (let i = 0; i < ws.length; i++) {
    const ts = Number(ws[i]);
    if (!isFinite(ts) || ts > now) continue;       // guard: future timestamp
    const start = Math.max(ts, plot.plantedAt);
    const end = Math.min(ts + WATER_WINDOW_MS, now);
    if (end > start) bonus += (end - start) / 3600000 * (WATER_RATE - 1);
  }
  return elapsed + Math.min(bonus, elapsed);       // HARD INVARIANT: never > 2×
}

export function cropOf(plot, crops) {
  if (!plot || !plot.cropId) return null;
  return (crops && crops[plot.cropId]) || null;
}

export function cropHours(plot, crops) {
  const c = cropOf(plot, crops);
  return (c && c.hours > 0) ? c.hours : 0;
}

export function lastWatering(plot, now) {
  if (!plot) return 0;
  normalizePlot(plot, now);
  const ws = plot.waterings;
  let best = 0;
  for (let i = 0; i < ws.length; i++) {
    const ts = Number(ws[i]);
    if (isFinite(ts) && ts > best) best = ts;
  }
  return best;
}

/** Remaining ms of the active watered window (0 = dry). */
export function waterWindowRemainingMs(plot, now) {
  if (!plot) return 0;
  return Math.max(0, lastWatering(plot, now) + WATER_WINDOW_MS - now);
}

/** Projected wall-clock ms until ready: the rest of the current window runs
    at 2×, everything after it at 1×. */
export function readyInMs(plot, crops, now) {
  const h = cropHours(plot, crops);
  if (!h) return 0;
  const remain = h - growthHours(plot, now);
  if (remain <= 0) return 0;
  const windowMs = waterWindowRemainingMs(plot, now);
  const windowGrowth = windowMs / 3600000 * WATER_RATE;
  if (windowGrowth >= remain) return Math.round(remain / WATER_RATE * 3600000);
  return Math.round(windowMs + (remain - windowGrowth) * 3600000);
}
