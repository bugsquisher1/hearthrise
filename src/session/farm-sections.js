// ════════════════════════════════════════════════════════════════════════
// src/session/farm-sections.js — THE FIELD AS THE SERVER SEES IT, READ SAFELY.
//
// PURE. Reads the `farm_land` section (supabase/migrations/2026-11-22-farm-window.sql,
// hr_farm_land_view) of the record a CharacterSession holds:
//   { cap, plot_level, deeds, upgrade: { level, gold, deeds, farming } | null,
//     plots: [{ i, crop, ready, ready_in_s, waterable, regrows_left }] }
// Every judgement is the server's: how many plots this hero may plant (the
// property cap), whether a plot is ready or may be watered (by the server's
// clock), and the next plot tier's price. Null = the server sent no field yet,
// and the Farm window keeps every control off (CLAUDE.md §6, fail safe).
//
// The countdown is DISPLAY ONLY: `ready_in_s` was true when the envelope was
// read, so the window subtracts the time since it first saw this envelope
// (`seenAt`, the caller's clock) and asks the server again when it runs out.
// Nothing can spend it: the Harvest button opens on the server's `ready`.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,64}$/;
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const MAX_PLOTS = 64;

/* One parse per envelope: the record's section object is frozen and replaced whole by each envelope. */
const SEEN = new WeakMap();

function read(cs, key) {
  return cs && typeof cs.read === 'function' ? cs.read(key) : undefined;
}

function priceOf(u) {
  if (!isObj(u) || !Number.isInteger(u.level) || u.level < 2) return null;
  const gold = count(u.gold), deeds = count(u.deeds), farming = count(u.farming);
  return gold === null || deeds === null || farming === null ? null : { level: u.level, gold, deeds, farming };
}

/**
 * `farm_land`: { cap, plotLevel, deeds, upgrade, plots: Map<i, plot>, seenAt }, or null.
 * @param {object} cs        a CharacterSession (or anything with read(key))
 * @param {number} nowMs     the display clock, recorded the first time this envelope is read
 */
export function farmLandOf(cs, nowMs) {
  const raw = read(cs, 'farm_land');
  if (!isObj(raw)) return null;
  const had = SEEN.get(raw);
  if (had) return had;
  const cap = count(raw.cap), plotLevel = count(raw.plot_level), deeds = count(raw.deeds);
  if (cap === null || plotLevel === null || plotLevel < 1) return null;
  const plots = new Map();
  for (const p of Array.isArray(raw.plots) ? raw.plots.slice(0, MAX_PLOTS) : []) {
    if (!isObj(p) || !Number.isInteger(p.i) || p.i < 0 || p.i >= MAX_PLOTS || !ID.test(String(p.crop))) continue;
    plots.set(p.i, {
      i: p.i, crop: p.crop, ready: p.ready === true, waterable: p.waterable === true,
      readyInS: count(p.ready_in_s) === null ? 0 : p.ready_in_s,
      regrowsLeft: count(p.regrows_left),
    });
  }
  const out = Object.freeze({ cap: Math.min(cap, MAX_PLOTS), plotLevel, deeds: deeds || 0, upgrade: priceOf(raw.upgrade), plots,
    seenAt: Number.isFinite(nowMs) ? nowMs : 0 });
  SEEN.set(raw, out);
  return out;
}

/** Milliseconds until a plot is ready, as the display shows it: the server's seconds less the time since it said so. */
export function readyInMs(land, plot, nowMs) {
  if (!land || !plot || plot.ready) return 0;
  return Math.max(0, plot.readyInS * 1000 - Math.max(0, nowMs - land.seenAt));
}
