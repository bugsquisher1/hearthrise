// ============================================================================
// src/net/settle-first.js — ONE ANSWER TO `settle_first` / `party_hunt_running`
//                           FOR EVERY CLIENT-DIRECT VALUE RPC (2026-09-28).
//
// 2026-09-28-settle-before-mutate.sql makes the twelve client-direct value RPCs
// below refuse, writing nothing, when the character's window is more than 180 s
// past its last settle — `{error:'settle_first', unsettled_ms, threshold_ms,
// slot}` — and `{error:'party_hunt_running'}` for a stale partied row while the
// party channel is shadow (docs/planning/SEC_SETTLE_BEFORE_MUTATE_F2F3_2026-09-28.md
// rows 1a/1b). Before this module only the combat-XP flush knew the code; every
// other caller showed a generic error until the next ~90 s settle.
//
// THE ONE SHAPE (withSettleFirstRetry):
//   1. Send the intent. Any answer that is not one of the two codes is returned
//      verbatim — this module never reads, prices or rewrites a value.
//   2. On `settle_first`, ASK THE SERVER for its settle (hr-accrue via
//      requestAccrual) and await the settle-race clear — the same accrue-driven
//      clear equip and set_activity wait on. Never a client-side settle, never
//      a client-invented number: the server's accrue is the only thing that
//      moves `accrued_to`. On `party_hunt_running` there is nothing a settle
//      can clear (only stopping the hunt does), so it only waits out a settle
//      already on the wire.
//   3. Re-send the SAME intent ONCE — same body, same key. The refusal writes
//      nothing and hr_apply releases the key for both codes, so the key is not
//      burnt. Exactly one retry: a second refusal is the realm's considered
//      answer and is returned for the caller to say in the realm's own words
//      (settleRefusalText), never a generic error and never a loop.
//
// THE LATCH (§6 — the browser never offers what the server would refuse):
// claim / shop controls carry `data-hr-settle-latch`. Until the boot settle
// has answered once (accrue.js `awaySettleDone`, the same predicate the
// combat-XP flush gates on) every such control is disabled with a pending mark
// and its taps are swallowed; the latch lifts on the `hr:boot-settled` event.
// Off the server path (signed out, the harness, accrual unconfigured) the latch
// is open: there is no settle coming and nothing server-side to refuse.
// ============================================================================

export const SETTLE_REFUSAL_WORDS = Object.freeze({
  settle_first: 'Settling your night first — try again in a moment',
  party_hunt_running: 'Your party hunt is still running',
});

/* The client-direct callers of these eleven route through withSettleFirstRetry;
   tests/settle-first-callers.mjs holds every sender to it. (hr_claim_goal left
   with the goals board, 2026-10-16-goal-board-retire.sql.) */
export const SETTLE_GATED_RPCS = Object.freeze([
  'hr_claim_quest', 'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
  'hr_credit_kills', 'hr_trait_buy', 'raid_claim', 'world_event_claim',
  'hr_set_auto_eat', 'hr_bank_move', 'hr_farm_harvest',
]);

const LATCH_ATTR = 'data-hr-settle-latch';
const LATCHED_ATTR = 'data-hr-latched';

function win() { return (typeof window !== 'undefined') ? window : null; }
function accrual() { const w = win(); return (w && w.HearthriseAccrual) || null; }

/** The refusal code in any of the answer shapes the callers hold — a bare RPC
 *  body, a `{json}` wrapper (muster/raids) or a classified verdict carrying
 *  `reason`/`body` (gold.js) — or null. */
export function settleRefusalOf(ans) {
  if (!ans || typeof ans !== 'object') return null;
  const cands = [ans.error, ans.reason, ans.json && ans.json.error, ans.body && ans.body.error];
  for (const c of cands) if (typeof c === 'string' && SETTLE_REFUSAL_WORDS[c]) return c;
  return null;
}

/** The realm's own sentence for a settle refusal, or null for any other answer. */
export function settleRefusalText(ans) {
  const c = settleRefusalOf(ans);
  return c ? SETTLE_REFUSAL_WORDS[c] : null;
}

async function accrueDrivenClear(code) {
  const A = accrual();
  if (!A) return;
  if (code === 'settle_first' && typeof A.requestAccrual === 'function') {
    try { Promise.resolve(A.requestAccrual({ force: true })).catch(() => {}); } catch (e) {}
  }
  try { if (typeof A.awaitSettleRaceClear === 'function') await A.awaitSettleRaceClear(); } catch (e) {}
}

let clearImpl = accrueDrivenClear;
const stats = { refused: 0, retried: 0 };

/**
 * Send `fire()`; on a settle refusal wait for the server's settle and send the
 * SAME intent exactly once more. `fire` must rebuild nothing — it closes over
 * one body and one key. Returns the last answer, verbatim.
 */
export async function withSettleFirstRetry(fire) {
  const first = await fire();
  const code = settleRefusalOf(first);
  if (!code) return first;
  stats.refused++;
  try { await clearImpl(code); } catch (e) { /* a waiter never fails the gesture */ }
  stats.retried++;
  return fire();
}

/* ── THE LATCH ───────────────────────────────────────────────────────────── */
let latchProbe = null;

/** Is a boot settle still owed? True only on the server path, before the first
 *  settle that closed the away window. */
export function bootSettlePending() {
  if (latchProbe) { try { return !!latchProbe(); } catch (e) { return false; } }
  const A = accrual();
  return !!(A && typeof A.bootSettlePending === 'function' && A.bootSettlePending());
}

/** Disable (pending) or re-enable every latched control under `root`. Only a
 *  control THIS latch disabled is re-enabled — a template's own `disabled`
 *  (cannot afford, already owned) is never lifted. */
export function applySettleLatch(root, pending) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  let n = 0;
  if (pending) {
    for (const el of root.querySelectorAll('[' + LATCH_ATTR + ']:not([' + LATCHED_ATTR + '])')) {
      if (el.disabled === true) continue;
      if ('disabled' in el) el.disabled = true;
      el.setAttribute(LATCHED_ATTR, '');
      el.setAttribute('aria-busy', 'true');
      n++;
    }
  } else {
    for (const el of root.querySelectorAll('[' + LATCHED_ATTR + ']')) {
      if ('disabled' in el) el.disabled = false;
      el.removeAttribute(LATCHED_ATTR);
      el.removeAttribute('aria-busy');
      n++;
    }
  }
  return n;
}

/** One pass over the live document. Returns whether the latch is holding. */
export function sweepSettleLatch() {
  const w = win();
  if (!w || typeof document === 'undefined') return false;
  const pending = bootSettlePending();
  applySettleLatch(document, pending);
  return pending;
}

function wireSettleLatch() {
  const w = win();
  if (!w || typeof document === 'undefined' || w.__hrSettleLatchWired) return;
  w.__hrSettleLatchWired = true;
  let queued = false;
  let observer = null;
  const later = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      /* The boot settle is once per page life: after it has answered and the
         latch has let go, nothing can re-latch, so the observer retires. */
      const A = accrual();
      if (!sweepSettleLatch() && !latchProbe && observer && A
          && typeof A.awaySettleDone === 'function' && A.awaySettleDone()) {
        observer.disconnect();
        observer = null;
      }
    });
  };
  w.addEventListener('hr:boot-settled', later);
  /* A latched control is inert even where `disabled` means nothing (a farm
     tile is a div): its taps stop in the capture phase, before any handler. */
  w.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest('[' + LATCHED_ATTR + ']');
    if (!el) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  const start = () => {
    if (typeof MutationObserver === 'function' && document.body) {
      observer = new MutationObserver(later);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    later();
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}

if (typeof window !== 'undefined') {
  window.HearthriseSettleFirst = {
    SETTLE_REFUSAL_WORDS, SETTLE_GATED_RPCS,
    settleRefusalOf, settleRefusalText, withSettleFirstRetry,
    bootSettlePending, applySettleLatch, sweepSettleLatch,
    /* Test seams: the in-page regressions stub the clear and the boot probe,
       and read how many refusals were retried. */
    __setClear(fn) { clearImpl = (typeof fn === 'function') ? fn : accrueDrivenClear; },
    __setLatchProbe(fn) { latchProbe = (typeof fn === 'function') ? fn : null; },
    __stats() { return { refused: stats.refused, retried: stats.retried }; },
  };
  wireSettleLatch();
}
