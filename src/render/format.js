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

/* ONE formatter (perf lane 2026-10-29): toLocaleString('en-US') builds a new Intl.NumberFormat every call, 1.5% of a
   4x-CPU hunt's main thread from the party panel and the bar's display tick; the same rule, made once. */
const EN_US = new Intl.NumberFormat('en-US');

/** 1,234,567 */
export function whole(v) {
  return ok(v) ? EN_US.format(Math.round(v)) : DASH;
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

/** "A, B and C", or "A, B, C and 4 more" past `max`; `conj` 'or' for "A, B or C". The one way player text joins a list
    (copy 11-06: never "; "). */
export function listWords(names, max = 3, conj = 'and') {
  const a = Array.from(new Set(names));
  if (a.length <= 1) return a.join('');
  if (a.length > max) return a.slice(0, max).join(', ') + ' ' + conj + ' ' + (a.length - max) + ' more';
  return a.slice(0, -1).join(', ') + ' ' + conj + ' ' + a[a.length - 1];
}

/** A heading's last two words held together by a no-break space, so a wrapped title of three words or more never leaves one
    word alone on its last line ("Your hero fights on its / own", 1440x900 2026-11-14). Shorter titles are as given. */
export function keepLastWords(s) {
  const t = String(s == null ? '' : s);
  return t.trim().split(/ +/).length >= 3 ? t.replace(/ +(\S+)\s*$/, ' $1') : t;
}

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

/* The player's own clock and language, made once (the HUD's display tick reads them several times a second). */
const AT_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const AT_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const AT_DAY_LONG = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const AT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const DAY_MS = 86400000;
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); };

/**
 * A server instant in the player's own clock (display only): "11:00 PM" on the day of `nowMs`, "Fri 6:00 AM" within the
 * week around it ("Friday 6:00 AM" when `long`), else "Nov 20 6:00 AM". A dash for an instant that isn't one.
 */
export function localWhen(atMs, nowMs, long = false) {
  if (!ok(atMs)) return DASH;
  const time = AT_TIME.format(atMs);
  if (ok(nowMs) && dayKey(atMs) === dayKey(nowMs)) return time;
  if (ok(nowMs) && Math.abs(atMs - nowMs) < 6 * DAY_MS) return (long ? AT_DAY_LONG : AT_DAY).format(atMs) + ' ' + time;
  return AT_DATE.format(atMs) + ' ' + time;
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
