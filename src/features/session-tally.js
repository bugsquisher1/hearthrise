// ════════════════════════════════════════════════════════════════════════
// src/features/session-tally.js — THE HUNT SESSION TALLY (settled-only)
//
// PRIORITY_BOARD §10 #2 "Session Tally + Watch Report". A hunt summary the
// Fight screen shows and the AWAY welcome-back card reads through the SAME
// shape, so live play and offline accrual can never tell different stories
// about the same numbers.
//
// ── THE ONE PROPERTY THIS FILE EXISTS TO HOLD ────────────────────────────
// **IT COUNTS SETTLED SERVER CREDIT ONLY. NEVER A PROJECTION.** The board
// explicitly rejects Huntera's projected-profit display, and this program's
// whole reason for existing is that a client-computed number is not authority.
// So every total here is folded from a SERVER-STATED settle receipt — the
// `summaryFromAway` shape written by src/net/accrue.js's applyEnvelope, which
// carries `serverAuthoritative:true`, the credited span `awayMs` (= grantMs,
// the window the server actually PAID), and the gains it actually credited.
// A receipt without `serverAuthoritative === true` is refused outright
// (`addReceipt` ignores it), which is what makes a forged local `G.gold` or a
// switch-off processOffline summary structurally unable to enter the tally.
//
// ── WHY THE PER-HOUR FIGURE IS NOT A PROJECTION ──────────────────────────
// A rate here is `settled total ÷ settled paid milliseconds` — actuals over
// the actual credited time the server priced. It extrapolates nothing: with
// no credited span there is no denominator and `perHour` returns null, and
// the renderer shows "settling…" rather than a guessed number. That is the
// same honesty gate the Fight screen's per-fight metrics strip already holds
// ("we will not extrapolate a number the server has not paid"), lifted to the
// whole session.
//
// ── PURE, AND WHY ────────────────────────────────────────────────────────
// Everything in this module is a pure function of receipts — no fetch, no
// DOM, no clock it was not handed except the one derived rate. The live
// accumulator (combat-screens.js) and the away card (legacy.js) both call the
// SAME functions on the SAME receipt shape, so the two surfaces read one
// arithmetic. No new persistent state: the accumulator lives in module scope
// at the call site, never in G, so there is nothing for snapshot() to upload
// and nothing to migrate. This mirrors src/net/market-history.js exactly.
// ════════════════════════════════════════════════════════════════════════

/* A gap this long with no settle ends a hunt session — the next credit starts
   a fresh tally. 30 min is well past the ~90s live-settle cadence, so an
   ordinary fight never trips it, while a genuine "came back tomorrow" does. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * May this receipt be COUNTED? Fail-closed: only a receipt the server stated
 * (`serverAuthoritative === true`) is settled credit. A locally-computed
 * processOffline summary, a display-only zero receipt, or any client-authored
 * object is refused — the settled-only invariant lives here, at one gate.
 */
export function isSettledReceipt(r) {
  return !!(r && typeof r === 'object' && r.serverAuthoritative === true);
}

/**
 * A stable identity for a receipt so ONE settle can never be counted twice.
 * The server envelope version is monotonic and preferred; the write timestamp
 * is the fallback for a fixture that carries no version. Null when neither is
 * usable — the caller then declines to fold it rather than guess.
 */
export function receiptKey(r) {
  if (!r || typeof r !== 'object') return null;
  const v = Number(r.version);
  if (Number.isFinite(v) && v > 0) return 'v' + v;
  const at = Number(r.at);
  if (Number.isFinite(at) && at > 0) return 't' + at;
  return null;
}

/** The gains + credited span a single settled receipt carries. Pure; totals
 *  only, clamped non-negative (a receipt never removes settled progress). */
export function receiptGains(r) {
  const s = r || {};
  return {
    gold: Math.max(0, Number(s.gainedGold) || 0),
    xp: Math.max(0, Number(s.gainedXp) || 0),
    drops: Math.max(0, Number(s.gainedItems) || 0),
    kills: Math.max(0, Number(s.gainedKills) || 0),
    /* `awayMs` is grantMs — the span the server actually PAID for (Ruling 2,
       b352), not the wall-clock absence. It is the only honest denominator. */
    paidMs: Math.max(0, Number(s.awayMs) || 0),
    levelUps: Array.isArray(s.levelUps) ? s.levelUps.length : 0,
  };
}

export function emptyTally() {
  return {
    paidMs: 0, gold: 0, xp: 0, drops: 0, kills: 0, levelUps: 0, settles: 0,
    bests: { gold: 0, xp: 0, kills: 0 }, at: 0,
  };
}

/**
 * Fold ONE settled receipt into an accumulator. Returns a NEW object (pure).
 * A non-settled receipt is ignored — the settled-only invariant. Session
 * bests track the biggest single settle per channel, which is the honest
 * "best window" without ever inventing a per-hour peak the server never paid.
 */
export function addReceipt(acc, r) {
  const a = acc || emptyTally();
  if (!isSettledReceipt(r)) return a;
  const g = receiptGains(r);
  return {
    paidMs: a.paidMs + g.paidMs,
    gold: a.gold + g.gold,
    xp: a.xp + g.xp,
    drops: a.drops + g.drops,
    kills: a.kills + g.kills,
    levelUps: a.levelUps + g.levelUps,
    settles: a.settles + 1,
    bests: {
      gold: Math.max(a.bests.gold, g.gold),
      xp: Math.max(a.bests.xp, g.xp),
      kills: Math.max(a.bests.kills, g.kills),
    },
    at: Math.max(a.at, Number(r.at) || 0),
  };
}

/**
 * per-hour = settled total ÷ settled paid time. Null when no span has been
 * credited yet — a rate with no denominator is a projection, and this module
 * does not project.
 */
export function perHour(total, paidMs) {
  const ms = Number(paidMs) || 0;
  if (ms <= 0) return null;
  return (Number(total) || 0) * 3600000 / ms;
}

/**
 * The render-ready shape BOTH the live Fight tally and the away welcome-back
 * card read. `perMonster` is supplied by the caller from hr_bestiary_of
 * deltas (the only per-kill granularity there is — the receipt carries a kill
 * TOTAL, not a breakdown); it is a settled-reconciled counter and reconciles
 * to server truth on each envelope, so it is a detail beside the headline
 * settled numbers rather than a source of them.
 */
export function tallyShape(acc, perMonster) {
  const a = acc || emptyTally();
  const ms = a.paidMs;
  return {
    paidMs: ms,
    settles: a.settles,
    ready: ms > 0 && a.settles > 0,
    totals: { gold: a.gold, xp: a.xp, drops: a.drops, kills: a.kills, levelUps: a.levelUps },
    perHour: {
      gold: perHour(a.gold, ms),
      xp: perHour(a.xp, ms),
      drops: perHour(a.drops, ms),
    },
    /* Net = settled gold in. Supplies consumed are NOT itemised on the
       lastOfflineSummary receipt (only the signed net item count is), so a
       supplies/h line would have to be inferred — and this module does not
       infer. It is omitted honestly rather than projected. */
    net: a.gold,
    bests: { gold: a.bests.gold, xp: a.bests.xp, kills: a.bests.kills },
    perMonster: Array.isArray(perMonster) ? perMonster.slice() : [],
  };
}

/**
 * The AWAY path in one call: a single settled receipt → the same shape a live
 * session produces. It is exactly `addReceipt` over an empty accumulator, so a
 * night's welcome-back card and the live Fight strip cannot diverge.
 */
export function tallyForReceipt(r, perMonster) {
  return tallyShape(addReceipt(emptyTally(), r), perMonster);
}

/**
 * Pure formatter → [{ key, label, value }] rows, so both surfaces render the
 * SAME words from the SAME numbers. No DOM. Empty when nothing has settled yet
 * (the caller shows a "settling…" line instead of a fabricated rate).
 */
export function tallyRows(shape) {
  const s = shape || tallyShape(null);
  const n = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—');
  const rows = [];
  if (!s.ready) return rows;
  if (s.perHour.xp != null) rows.push({ key: 'xp', label: 'XP/h', value: n(s.perHour.xp) });
  if (s.perHour.gold != null && s.totals.gold > 0) rows.push({ key: 'gold', label: 'Gold/h', value: n(s.perHour.gold) });
  if (s.perHour.drops != null && s.totals.drops > 0) rows.push({ key: 'drops', label: 'Drops/h', value: n(s.totals.drops > 0 ? s.perHour.drops : 0) });
  rows.push({ key: 'kills', label: 'Kills', value: n(s.totals.kills) });
  return rows;
}

if (typeof window !== 'undefined') {
  window.HearthriseSessionTally = {
    SESSION_IDLE_MS,
    isSettledReceipt, receiptKey, receiptGains,
    emptyTally, addReceipt, perHour, tallyShape, tallyForReceipt, tallyRows,
  };
}
