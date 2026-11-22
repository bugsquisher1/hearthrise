// ════════════════════════════════════════════════════════════════════════
// src/session/report-sections.js — THE HUNT REPORT AS THE SERVER HOLDS IT, READ SAFELY (GR-66; build plan FB-7).
//
// PURE. The server keeps each session's report counters in hunt_session_tally.report (1053-hunt-report.sql: folded by the settle,
// identical for a hunt viewed and one with the browser closed) and projects them in the `hunt` section's tally (hr_hunt_view
// tally.report, with the damage by ability and the healing by source) and in the free analyzer's session block (an earlier hunt's
// read, src/session/past-hunt.js). This reads either into one typed shape; anything malformed reads as missing, never invented.
//
//   reportFrom(raw)    the server's report object, typed: { low {pm, by, blow, atMs} | null, close, fired {rule: n}, waits {rule:
//                      {why: n}}, bar [[rule, uses, place]], gear {w, a, n} | null, dry {item: atMs}, dealt {id: n}, healed {id: n},
//                      deep step | null, falls [{ at, from, to, pm, monster, name }] }, or null when there is none. `deep` and `falls`
//                      are the Danger scale's (1057-danger-falls.sql): the deepest step, and each fall back or death oldest first, the
//                      last HUNT_REPORT.fallsMax; `pm` the hero's HP permille at the break-off (0: it died), `name` the server's name
//                      for the seat (null when it sent none). Off the scale `deep` is null and `falls` empty.
//   huntReportOf(cs)   the `hunt` section's session report (the newest session, ended or running), or null
// ════════════════════════════════════════════════════════════════════════
import { HUNT_REPORT } from '../data/hunt-report.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const ID = /^[a-z0-9_]{1,64}$/;
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const named = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);

/* The Danger scale's falls, typed: each an instant with its steps, the HP it broke off at and what struck; a malformed one dropped. */
function fallsOf(v) {
  const out = [];
  for (const f of Array.isArray(v) ? v.slice(-HUNT_REPORT.fallsMax) : []) {
    if (!isObj(f) || nat(f.at) === null || nat(f.from) === null || nat(f.to) === null || nat(f.pm) === null || f.pm > 1000) continue;
    out.push({ at: f.at, from: f.from, to: f.to, pm: f.pm, monster: id(f.monster) || 'unknown', name: named(f.name) });
  }
  return out;
}

/* { id: whole number } with ids only, at most `max` keys. */
function counts(v, max) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v).slice(0, max)) if (id(k) && nat(n) !== null) out[k] = n;
  return out;
}

/** The server's report object, typed (see the header), or null when it holds nothing. */
export function reportFrom(raw) {
  if (!isObj(raw) || !Object.keys(raw).length) return null;
  const l = isObj(raw.low) ? raw.low : null;
  const low = l && nat(l.pm) !== null && l.pm <= 1000 && id(l.by) && id(l.blow) && nat(l.at) !== null ? { pm: l.pm, by: l.by, blow: l.blow, atMs: l.at } : null;
  const waits = {};
  if (isObj(raw.waits)) for (const [rule, w] of Object.entries(raw.waits).slice(0, 48)) if (id(rule) && isObj(w)) waits[rule] = counts(w, 8);
  const bar = [];
  for (const e of Array.isArray(raw.bar) ? raw.bar.slice(0, 16) : []) {
    if (Array.isArray(e) && id(e[0]) && id(e[1]) && nat(e[2]) !== null) bar.push([e[0], e[1], e[2]]);
  }
  const g = isObj(raw.gear) ? raw.gear : null;
  return {
    low, close: nat(raw.close) || 0, fired: counts(raw.fired, 48), waits, bar,
    gear: g && nat(g.w) !== null && nat(g.a) !== null && nat(g.n) !== null ? { w: g.w, a: g.a, n: g.n } : null,
    dry: counts(raw.dry, 32), dealt: counts(raw.dealt, 64), healed: counts(raw.healed, 64),
    deep: nat(raw.deep), falls: fallsOf(raw.falls),
  };
}

/** The `hunt` section's session report (hr_hunt_view tally.report), or null. */
export function huntReportOf(cs) {
  const h = cs && typeof cs.read === 'function' ? cs.read('hunt') : null;
  if (!isObj(h)) return null;
  const s = isObj(h.session) ? h.session : h;
  return reportFrom(isObj(s.tally) ? s.tally.report : null);
}
