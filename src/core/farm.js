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

/* Plot tier → crop unlock set + this-tier deed cost. Cumulative deeds to
   reach tier N = sum of cost[2..N]. Lv 1 is the starting state. */
export const PLOT_TIERS = [
  null, // index 0 unused
  { unlocks: ['turnip'], cost: 0 },
  { unlocks: ['turnip', 'carrot', 'wheat'], cost: 1 },
  { unlocks: ['turnip', 'carrot', 'wheat', 'potato', 'tomato'], cost: 3 },
  /* b223: the three b215 endgame crops had their own farming skill gates but
     were in no tier, so farming's last 37 levels had nothing new to plant even
     at max plot level. Goldenroot lands at Lv 4; Lv 5 finally earns its 8 deeds. */
  { unlocks: ['turnip', 'carrot', 'wheat', 'potato', 'tomato', 'pumpkin', 'goldenroot'], cost: 5 },
  { unlocks: ['turnip', 'carrot', 'wheat', 'potato', 'tomato', 'pumpkin', 'goldenroot', 'emberfruit', 'moonbloom'], cost: 8 },
];
export const MAX_PLOT_LEVEL = PLOT_TIERS.length - 1; // 5

export const BOUNTY_DEED_CHANCE = 0.005; // 0.5% per bounty turn-in
export const KILL_DEED_CHANCE = 0.001;   // 0.1% per Tier 2+ kill
export const MIN_DEED_TIER = 2;          // Tier-1 mobs stay deed-free

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

export function canPlantCrop(plotLevel, cropId) {
  if (!cropId) return false;
  return unlockedCrops(plotLevel).indexOf(cropId) !== -1;
}

export function deedsForNextLevel(plotLevel) {
  const lv = clampPlotLevel(plotLevel);
  if (lv >= MAX_PLOT_LEVEL) return 0;
  return PLOT_TIERS[lv + 1].cost;
}

/** Should this kill roll for a deed at all? Tier gate only — the roll is
    the caller's, using an injected rng. */
export function killDeedEligible(monster) {
  return !!monster && ((monster.tier | 0) >= MIN_DEED_TIER);
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

export function isReady(plot, crops, now) {
  const h = cropHours(plot, crops);
  if (!h) return false;                            // unknown crop — never auto-ready
  return growthHours(plot, now) >= h;
}

export function progressPct(plot, crops, now) {
  const h = cropHours(plot, crops);
  if (!h) return 0;
  return Math.min(100, Math.floor(growthHours(plot, now) / h * 100));
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

/** A plot is waterable only when the previous window has closed. This is the
    whole anti-abuse mechanism AND the affordance ("this plot is thirsty"). */
export function isWaterable(plot, crops, now) {
  if (!plot || !cropHours(plot, crops)) return false;
  if (plot.state === 'ready' || isReady(plot, crops, now)) return false;
  return waterWindowRemainingMs(plot, now) <= 0;
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

/** floor(hours / 4) — the windows must fit inside the shortened grow time,
    which is why the mechanic self-caps at −50% with no separate cap table. */
export function maxWaterings(cropId, crops) {
  const c = crops && crops[cropId];
  if (!c || !(c.hours > 0)) return 0;
  return Math.floor(c.hours / (WATER_WINDOW_H * WATER_RATE));
}

/** XP for a watering: a tenth-ish of the skill's throughput, bounded to once
    per plot per window so it can never be farmed. */
export function waterXp(plot, crops) {
  const c = cropOf(plot, crops);
  return Math.max(1, Math.ceil(((c && c.xp) || 4) / 4));
}
