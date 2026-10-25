// ════════════════════════════════════════════════════════════════════════
// src/render/format.js — HOW THE HUNT SCREEN WRITES A NUMBER (parity AW-13).
//
// PURE. Every panel formats through these, so "1.2k" means the same thing on
// the party panel, the analyzer and the combat log. A value the server did not
// send (null, undefined, NaN) is written as a dash, never as 0: a missing
// number must not read as a real one.
// ════════════════════════════════════════════════════════════════════════

export const DASH = '–';
const ok = (v) => typeof v === 'number' && Number.isFinite(v);

/** 1,234,567 */
export function whole(v) {
  return ok(v) ? Math.round(v).toLocaleString('en-US') : DASH;
}

/** 950 / 1.2k / 34.5k / 1.2kk (the Tibia-style million mark players read on hunts). */
export function short(v) {
  if (!ok(v)) return DASH;
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a < 1000) return sign + Math.round(a);
  if (a < 1e6) return sign + trim(a / 1e3) + 'k';
  return sign + trim(a / 1e6) + 'kk';
}
const trim = (x) => (x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ''));

/** 1,234 gp */
export function gold(v) { return ok(v) ? whole(v) + ' gp' : DASH; }

/** hh:mm:ss from ms (00:33:36). */
export function clock(ms) {
  if (!ok(ms) || ms < 0) return DASH;
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60);
}

/** 7:43h from ms (the stamina readout). */
export function hoursMinutes(ms) {
  if (!ok(ms) || ms < 0) return DASH;
  const m = Math.floor(ms / 60000);
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + 'h';
}

/** "4 h", "1 h 30 m", "45 m" from ms (how long a stamina refill restores, how much is left). */
export function hoursWords(ms) {
  if (!ok(ms) || ms < 0) return DASH;
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? h + ' h ' + r + ' m' : h ? h + ' h' : r + ' m';
}

/** 0..1 → "62%". */
export function pct(f) { return ok(f) ? Math.round(Math.max(0, Math.min(1, f)) * 100) + '%' : DASH; }

/** A drop chance, 0..1, to two significant figures: "12%", "2.1%", "0.35%"; "under 0.01%" below that (Tyler 2026-10-24). */
export function chance(f) {
  if (!ok(f) || f < 0) return DASH;
  const p = Math.min(1, f) * 100;
  if (p === 0) return '0%';
  return p < 0.01 ? 'under 0.01%' : Number(p.toPrecision(2)) + '%';
}
