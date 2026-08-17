// ============================================================================
// src/net/balance.js — THE READ SIDE OF A SERVER-OWNED BALANCE.
//
// src/net/record.js moved the RECORD. src/net/gold.js moved the WRITE. This
// module is the third side, and until it existed the other two could not be
// switched on: `gold` and `gems` were held out of `SERVER_OF_RECORD` for one
// measured reason, quoted from record.js's own b353 block —
//
//     Cold-load guard — 1 uncaught error: Cannot read properties of
//     undefined (reading 'toLocaleString')
//     ...and 6 of 22 browser arms red, the engine never booted.
//
// The site was `G.gold.toLocaleString()` in `updateTopbar`, and it was one of
// a few hundred raw balance reads none of which had an UNKNOWN case. record.js
// says a moved field "is briefly UNKNOWN until the server answers, which is a
// state this module has". True of that module and FALSE of the game: nothing
// rendered unknown, so UNKNOWN was a crash.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────────
// A balance has THREE states, not two, and every consumer must pick which of
// the three forms it wants:
//
//   KNOWN      a finite, non-negative integer the client is entitled to show.
//   UNKNOWN    the field has not arrived yet (or arrived and was overwritten by
//              something that is not the server). NOT zero. NOT stale. NOT NaN.
//   n/a        the caller asked about something that is not a balance.
//
//   `balanceNum(G, f)`   the ARITHMETIC form. `null` when UNKNOWN — chosen
//                        deliberately over `0` and over `NaN`, because `0`
//                        silently becomes a claim ("you have nothing") and NaN
//                        propagates into every comparison as `false` without
//                        anybody noticing. `null` makes the caller decide.
//   `fmtBalance(G, f)`   the DISPLAY form. A string, always. UNKNOWN renders as
//                        an em dash — never "NaN", never "undefined", never "0".
//   `canAfford(G, c, f)` the DECISION form. FAIL-CLOSED: an unknown balance
//                        cannot afford anything. You may not spend a number you
//                        have not been told.
//   `balanceOr(G,f,d)`   the EXPLICIT-FALLBACK form, for the handful of reads
//                        that are genuinely not authority (a session tally, a
//                        diagnostic payload). Named so it is greppable and so
//                        `|| 0` never has to be typed at a call site again.
//
// ── WHY UNKNOWN IS REACHABLE WITHOUT THE REGISTRY BEING ARMED ───────────────
// Two independent sources, unioned, and that is on purpose:
//
//   1. THE REGISTRY. If the field is on `SERVER_OF_RECORD`, `recordValue()` is
//      the ONLY authority — including its b347 fingerprint check, so a value a
//      second writer put there reports UNKNOWN rather than wearing the server's
//      name. This is the post-flip path.
//   2. PRESENCE. If the field is absent from G, or is not a finite non-negative
//      number, it is UNKNOWN whatever the registry says.
//
// (2) is what makes the flip TESTABLE before it happens: `delete G.gold` puts
// the client in exactly the state arming the registry would, and the guard
// B353-3b drives every render through it. It is also what makes this module
// a no-op TODAY — `G.gold` is a finite number on every live save, so every
// accessor answers the same value the raw read answered, byte for byte.
//
// ── WHAT THIS MODULE DOES NOT DO ────────────────────────────────────────────
// It never WRITES a balance. Not a default, not a repair, not a zero. The
// writers are `settleCurrency` (a prediction) and `applyEnvelopeState` /
// `applyRecord` (the server's own number), and a read accessor that quietly
// healed `G.gold = 0` would be the two-sources bug arriving through the read
// path — the exact failure record.js was written to prevent.
//
// DOM-free apart from `paintBalance`, which is the one place a DOM node is the
// natural unit (an element can carry the pending STATE as a class; a string
// cannot). Node-importable.
// ============================================================================

import { isServerOfRecord, recordValue } from './record.js?v=375';

/** The fields this module knows are balances. Not a gate — every accessor
 *  works on any field name — but the set the guards sweep and the set a caller
 *  should expect to be UNKNOWN one day. */
export const BALANCE_FIELDS = Object.freeze(['gold', 'gems']);

/** THE PENDING GLYPH. An em dash (U+2014), and the choice is not arbitrary:
 *  `0` is a claim, `?` reads as an error, `…` reads as a truncation, and a
 *  spinner in a numeral slot is a jump. An em dash is the typographic
 *  convention for "there is no value here yet" and it is the same width story
 *  in every face the game ships. */
export const UNKNOWN_TEXT = '—';

/** The one label. Spelled once so the topbar, a tooltip and a refusal notice
 *  cannot describe the same state three ways. */
export const UNKNOWN_LABEL = 'Balance not loaded yet';
export const UNKNOWN_HINT = 'Waiting for the server — your balance will appear in a moment.';

/** The class the pending presentation hangs on. Exported so a test asserts the
 *  contract instead of restating a string literal. */
export const PENDING_CLASS = 'bal-pending';

/**
 * THE ONE READ. Everything else in this file is a shape of this answer.
 *
 * @returns {{field, known, value, reason, source}}
 *   `value` is `null` whenever `known` is false. It is deliberately NOT the
 *   raw contents of G[field] — handing back the very number this function just
 *   refused to vouch for is how a "safe" accessor leaks an unsafe value.
 */
export function balanceOf(G, field) {
  const f = String(field == null ? '' : field);
  if (!G || typeof G !== 'object') {
    return { field: f, known: false, value: null, reason: 'no-state', source: 'none' };
  }
  /* THE REGISTRY FIRST, AND IT IS FINAL. Once a field has moved, presence in G
     proves nothing — that is the whole content of record.js's b347 finding, in
     which a client write reported `{known:true, source:'server'}`. */
  if (isServerOfRecord(f)) {
    const rv = recordValue(G, f);
    if (!rv.known) {
      return { field: f, known: false, value: null, reason: rv.source || 'unknown', source: 'record' };
    }
    const n = Number(rv.value);
    if (!Number.isFinite(n) || n < 0) {
      return { field: f, known: false, value: null, reason: 'not-finite', source: 'record' };
    }
    return { field: f, known: true, value: Math.floor(n), reason: 'ok', source: 'server' };
  }
  if (!Object.prototype.hasOwnProperty.call(G, f) || G[f] === null || G[f] === undefined) {
    return { field: f, known: false, value: null, reason: 'absent', source: 'local' };
  }
  const n = Number(G[f]);
  if (!Number.isFinite(n) || n < 0) {
    return { field: f, known: false, value: null, reason: 'not-finite', source: 'local' };
  }
  return { field: f, known: true, value: Math.floor(n), reason: 'ok', source: 'local' };
}

/** Is there a number to show at all? */
export function isBalanceKnown(G, field) { return balanceOf(G, field).known; }

/** THE ARITHMETIC FORM — a number, or `null` for UNKNOWN. A caller that does
 *  arithmetic on the result without checking gets `null + 1 === 1`, which is
 *  wrong; that is why every arithmetic site in the sweep asks `canAfford` or
 *  branches on null rather than reaching for this blind. */
export function balanceNum(G, field) {
  const b = balanceOf(G, field);
  return b.known ? b.value : null;
}

/**
 * THE EXPLICIT-FALLBACK FORM. `balanceOr(G,'gold',0)` says, in the source, "I
 * know this can be unknown and for THIS read a zero is the right answer" —
 * a per-day earnings delta, a diagnostic payload, a session tally. It is a
 * different sentence from `(G.gold||0)`, which said nothing at all, and it is
 * greppable, which `||0` never was.
 *
 * ⚠ NEVER for a display and never for a spend. Those have their own forms.
 */
export function balanceOr(G, field, fallback) {
  const b = balanceOf(G, field);
  return b.known ? b.value : (fallback === undefined ? 0 : fallback);
}

/* ── THE DISPLAY FORM ──────────────────────────────────────────────────────── */

/**
 * A STRING, ALWAYS. This is what replaced `G.gold.toLocaleString()`.
 *
 * @param opts.unknown  override the pending glyph for a surface where an em
 *                      dash would read wrong (a sentence, say).
 * @param opts.compact  1.2M rather than 1,200,000 — the shared short form.
 * @param opts.format   a caller's OWN number formatter. Several surfaces
 *                      already ship one with its own thresholds (the character
 *                      sheet's `fmt` breaks to K at 1,000, the shared one at
 *                      10,000), and swapping a screen's formatter as a side
 *                      effect of an UNKNOWN sweep would be a visible change
 *                      nobody asked for. The caller keeps its formatter; this
 *                      function keeps the three-state contract.
 */
export function fmtBalance(G, field, opts) {
  const o = opts || {};
  const b = balanceOf(G, field);
  if (!b.known) return o.unknown === undefined ? UNKNOWN_TEXT : String(o.unknown);
  if (typeof o.format === 'function') return String(o.format(b.value));
  return o.compact ? compactNumber(b.value) : b.value.toLocaleString();
}

/** The game's existing short form, moved here so a pending balance and a real
 *  one are formatted by one function rather than by whichever one the call site
 *  happened to reach for. */
export function compactNumber(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'K';
  return v.toLocaleString();
}

/** Escape for the template-string call sites. Tiny, local, and here rather than
 *  imported so this module stays free of a dependency for four characters. */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * THE DISPLAY FORM, AS MARKUP — for the ~40 call sites that build HTML in a
 * template string and therefore cannot carry state on a node.
 *
 * The pending case is a real element with a class, a title and an accessible
 * label, because "the balance is loading" and "the balance is an em dash" are
 * different facts and a screen reader must get the first one.
 *
 * ⚠ THE KNOWN CASE EMITS **BARE TEXT**, NOT A WRAPPER — AND THAT IS A FIX, NOT
 *   A SHORTCUT. The first cut symmetrically wrapped the real figure in a
 *   `<span class="bal-known">` "so the DOM shape is identical in both states".
 *   Measured, at 1440×900, with a real balance on the Home user card:
 *
 *       host <b>  21.5px  rgb(236,225,204)
 *       my span   14.5px  (cozy-light: a different colour again)
 *
 *   This codebase ships several `… span { font-size: … }` / `… span { color: … }`
 *   readability blankets, so introducing a span INSIDE a numeral restyles the
 *   numeral. The sweep's whole promise is that a KNOWN balance renders exactly
 *   as it did before, so the known path now adds no element at all and the
 *   promise is structural rather than hoped for. Only the pending state — which
 *   has to carry a class, a label and a title, and which is new by definition —
 *   is an element, and §16 of art-direction.css gives it `font-size: inherit`
 *   for the same reason.
 */
export function balanceMarkup(G, field, opts) {
  const o = opts || {};
  const b = balanceOf(G, field);
  const cls = o.className ? ' ' + esc(o.className) : '';
  if (!b.known) {
    return '<span class="' + PENDING_CLASS + cls + '" role="status" aria-label="'
      + esc(UNKNOWN_LABEL) + '" title="' + esc(UNKNOWN_HINT) + '">' + UNKNOWN_TEXT + '</span>';
  }
  return esc(fmtBalance(G, field, o));
}

/**
 * PAINT A BALANCE INTO AN ELEMENT — the topbar, a KPI, a shop counter.
 *
 * The class is toggled on the element that HOLDS the number, so the pending
 * treatment (quiet ink, a slow breath, a stable minimum width) applies without
 * the layout moving when the real figure lands. Returns the element so a caller
 * can chain, and tolerates a null element so the ~15 `getElementById(...)`
 * sites do not each need their own existence check.
 */
export function paintBalance(el, G, field, opts) {
  if (!el || typeof el !== 'object') return el;
  const b = balanceOf(G, field);
  el.textContent = fmtBalance(G, field, opts);
  if (el.classList && typeof el.classList.toggle === 'function') {
    el.classList.toggle(PENDING_CLASS, !b.known);
  }
  if (typeof el.setAttribute === 'function') {
    if (b.known) {
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      el.removeAttribute('role');
    } else {
      el.setAttribute('title', UNKNOWN_HINT);
      el.setAttribute('aria-label', UNKNOWN_LABEL);
      el.setAttribute('role', 'status');
    }
  }
  return el;
}

/* ── THE DECISION FORM ─────────────────────────────────────────────────────── */

/**
 * CAN THIS BE PAID? Three answers, because there are three states.
 *
 * @returns 'yes' | 'no' | 'unknown'
 *
 * A caller that only wants a boolean uses `canAfford`, which collapses
 * `unknown` to `false` — FAIL-CLOSED, and it is the only defensible direction:
 * letting a purchase through on a balance nobody has read is how a client
 * authors a spend the server never agreed to.
 */
export function affordability(G, cost, field) {
  const c = Number(cost);
  if (!Number.isFinite(c)) return 'no';
  const b = balanceOf(G, field || 'gold');
  if (!b.known) return 'unknown';
  return b.value >= c ? 'yes' : 'no';
}

export function canAfford(G, cost, field) { return affordability(G, cost, field) === 'yes'; }

/** The honest refusal copy. A player told "Not enough gold" when the client
 *  simply has not been told the balance yet will report a bug about their gold
 *  disappearing, and they will be right to. */
export function shortfallMessage(G, cost, field) {
  const f = String(field || 'gold');
  const a = affordability(G, cost, f);
  if (a === 'unknown') return UNKNOWN_LABEL + ' — reconnecting…';
  return f === 'gems' ? 'Not enough gems' : 'Not enough gold';
}

/** One line for a diagnostic / bug report — never for a player-facing surface. */
export function balanceState(G) {
  const out = {};
  for (const f of BALANCE_FIELDS) {
    const b = balanceOf(G, f);
    out[f] = b.known ? b.value : ('UNKNOWN:' + b.reason);
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.HearthriseBalance = {
    BALANCE_FIELDS, UNKNOWN_TEXT, UNKNOWN_LABEL, UNKNOWN_HINT, PENDING_CLASS,
    balanceOf, isBalanceKnown, balanceNum, balanceOr,
    fmtBalance, compactNumber, balanceMarkup, paintBalance,
    affordability, canAfford, shortfallMessage, balanceState,
  };
}
