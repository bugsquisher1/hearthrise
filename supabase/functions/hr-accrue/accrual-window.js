// ============================================================================
// supabase/functions/hr-accrue/accrual-window.js — THE WINDOW A POINTER SETTLE PAYS.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// The floors and the span fuse, whether a window is pending, where `accrued_to`
// may stand after one, and its receipt.
// ============================================================================

import { nat, PAYABLE_KINDS } from './accrual-contract.js';

/* The floor on an accrual. Below this nothing is simulated and — unlike the
   client, which advances its watermark regardless (legacy.js:987) — NOTHING IS
   WRITTEN. The client had to advance, because its watermark was also its
   "have I already paid this?" record. The server's watermark is `accrued_to`,
   and leaving it alone simply means the next call sees a slightly longer span.
   That is strictly better: the client's behaviour quietly confiscates every
   sub-threshold absence, and the server has no reason to inherit that. */
export const ACCRUE_MIN_MS = 60000;

/* ── THE TOWN SETTLE FLOOR (lane c-live-town-work, Tyler 2026-10-22: "the bag
   needs to update in real time, not when it's done") ─────────────────────────
   A town pointer (the Great Hearth's fuel run, since the one-town-work cut) is the `accrue` verb's
   only payable kind today (a fight is a hunt session: SKIP.HUNT_OPEN /
   SKIP.HUNT_REQUIRED answer before the floor). While the Work window or the bag
   is open the client asks one settle per SESSION_CONFIG.townPollMs (16 s), the
   way the hunt view asks hunt_settle, and the window it asks for pays from
   15 s: the SAME player-door fuse a hunt has (hunt-settle.js HUNT_SETTLE_MIN_MS,
   pinned equal by tests/artisan-accrual.mjs T10). It stays a SERVER constant on
   a SERVER-literal caller: a client polling faster is answered `below_min_span`
   and writes nothing, so the door writes at most four ledger rows a minute per
   character, each one an aggregate of every action in its window.
   Time is conserved exactly as at 60 s: the sub-action remainder is deferred
   (settledWatermarkMs), so a chain of 15 s windows pays the same actions as one
   long window, and the stop's collect pays only what is left after the last.
   ACCRUE_MIN_MS stays 60 s as the `inventory_complete` boundary hr_state_of is
   pinned to (tests/inventory-complete-probe.mjs): that flag now reads "no
   window of 60 s or more is pending", the weaker reading b531 already made
   true for a collect (see inventoryBaselineComplete). */
export const TOWN_SETTLE_MIN_MS = 15000;

/** The `accrue` caller's floor for a pointer of `activeKind`: 15 s for town work, ACCRUE_MIN_MS otherwise. */
export function accrueFloorMs(activeKind) {
  return activeKind === 'artisan' ? TOWN_SETTLE_MIN_MS : ACCRUE_MIN_MS;
}

/**
 * ── THE INVENTORY-COMPLETENESS CONTRACT (inventory-flip Step B1) ────────────
 *
 * The dormant absolute-replace flip (src/net/accrue.js) may only fire on an
 * envelope the SERVER certifies `inventory_complete === true`. That flag is
 * emitted by hr_state_of (2026-08-24-inventory-complete.sql), NOT here — but it
 * is a statement ABOUT this engine, so its truth condition is defined here, in
 * ONE place, and hr_state_of reads that same fact rather than a parallel copy:
 *
 *   inventory_complete  ⟺  this engine has NO pending, un-drained window that
 *                          could still grant an OWNABLE item.
 *
 * The engine's own "nothing to settle" boundary is exactly `grantMs <
 * ACCRUE_MIN_MS` (see computeAccrual's SKIP.TOO_SOON return) or a non-payable
 * pointer (SKIP.NO_ACTIVITY / SKIP.UNSUPPORTED). hr_state_of gates on precisely
 * that — `now() - greatest(accrued_to, active_since) < ACCRUE_MIN_MS` for a
 * payable pointer, true otherwise — reading the SAME watermark this engine
 * advances (`accrued_to`) and the SAME constant below. There is no second
 * completeness computation to disagree; the SQL literal `interval '60 seconds'`
 * is pinned to this export by tests/inventory-complete-probe.mjs.
 *
 * ⚠ WHY THIS IS SUFFICIENT FOR THE CHAINED-CRAFT HAZARD (accrue.js:863). The
 *   flip's real blocker is a freshly-crafted OWNED output whose input chain the
 *   server has not finished settling — invisible to hr_state_of, DELETED by an
 *   absolute replace. Under this engine that cannot arise while the flag is
 *   true, for two structural reasons hr_state_of DEPENDS ON:
 *     (1) ATOMIC SETTLE — accrueArtisan and the combat tail each emit
 *         ONE signed item delta (inputs consumed + outputs produced) that
 *         hr_apply applies in ONE transaction, so player_inventory never holds a
 *         half-settled craft.
 *     (2) COLLECT-BEFORE-SWITCH — set-activity stamps accrued_to = now() on every
 *         pointer change, fully draining the old activity's window into
 *         player_inventory before the next begins, so no chain spans two pointers
 *         mid-flight.
 *   The ONLY window in which player_inventory can lag the owned set is the
 *   currently-active pointer's un-drained tail — which the flag gates on. If
 *   either guarantee is ever weakened (genuine multi-pointer or partial
 *   settlement, where a settle advances accrued_to while leaving inventory
 *   inconsistent), the flag MUST gain an explicit engine-STAMPED completeness
 *   column and this contract must be revisited. Stated so a future change to the
 *   settle shape cannot silently invalidate the flip.
 *
 * ⚠ b531 NARROWED THIS, AND THE INVENTORY FLIP MUST NOT BE ARMED WITHOUT
 *   READING THIS PARAGRAPH. `finalWindow` (see the floor in computeAccrual)
 *   lets a COLLECT-BEFORE-SWITCH pay a window shorter than ACCRUE_MIN_MS. So
 *   the predicate below — and the `interval '60 seconds'` in hr_state_of it is
 *   pinned to — no longer means "no window could grant"; it means "no window
 *   the ACCRUE cadence would pay could grant". A sub-minute artisan run ended
 *   by a switch grants ownable items while this reads true. That is harmless
 *   today (the absolute-replace flip is dormant, `inventoryArmEnabled` is false
 *   in prod) and it is exactly the "if either guarantee is ever weakened"
 *   condition below: arming the flip now requires the engine-STAMPED
 *   completeness column, not this predicate.
 *
 * @returns true when a pointer in state `{activeKind, accruedToMs, activeSinceMs}`
 *   has NO pending grant window at `nowMs` — the exact predicate hr_state_of's
 *   `inventory_complete` field mirrors. Exported for the parity/pin test; the
 *   engine's runtime path does not call it (it reaches the same boundary through
 *   the SKIP.TOO_SOON / SKIP.NO_ACTIVITY returns).
 */
export function inventoryBaselineComplete({ activeKind, activeId, accruedToMs, activeSinceMs, nowMs }) {
  if (!PAYABLE_KINDS.includes(activeKind) || !activeId) return true;
  if (!Number.isFinite(Number(activeSinceMs)) || Number(activeSinceMs) <= 0) return false;
  const watermark = Math.max(nat(accruedToMs, 0), nat(activeSinceMs, 0));
  return (nat(nowMs, 0) - watermark) < ACCRUE_MIN_MS;
}

/* An absolute fuse on the span, independent of hr_offline_cap_ms. If the cap
   function is ever wrong, mis-granted or replaced, this still bounds one
   accrual to a day of ticks. Two independent limits, because `capMs` is the
   single highest-leverage number in the grant after tickMs. */
export const ACCRUE_MAX_SPAN_MS = 24 * 3600000;

/* ── `w`: THE WINDOW'S NON-PAYING TIME, ONE SCALAR (2026-09-18, §15a) ────────
   `settledWatermarkMs` advances the watermark by the time the simulation
   ACCOUNTED for, which is `ticks x interval + recoverMs + idleMs`. The journal
   recorded only the first term, so a window containing a death was
   arithmetically indistinguishable from a window whose watermark was computed
   WRONGLY: replaying 14 days of real windows (services/world-tick/replay.js)
   left five pairs in an `unaccounted` bucket that could not be judged either
   way. Two integers close that, and turn `accounted = ticks x interval + rms +
   ims` into an identity the ledger can be audited on instead of an inference.

   ONE KEY, A COMMA-JOINED SCALAR, and both of those are guards rather than
   taste:
     · ONE key, because tests/accrual-engine.mjs SHAPE bounds the combat meta's
       key count (the game_events rule made countable) and an attended window
       already sits near the bound. `att` is nested for the same reason.
     · A SCALAR STRING, because tests/artisan-accrual.mjs T7 refuses any nested
       value in the ledger — `[rms, ims]` is an array and would be rejected. The
       house precedent for "two facts, one scalar" is `skipped_items` (C5).
   OMITTED ENTIRELY when both terms are zero, which is every window with no
   death and no idle time — so an ordinary night's journal row is byte-for-byte
   what it was and the ledger grows only where the extra fact exists.

   LEDGER COST, stated because §5's rule is "aggregate, never per-tick": the
   widest form is `"w":"43200000,86400000"` = 24 bytes on a row that already
   exists; no new rows, no new table. Measured cadence: the 14-day production
   read behind tests/fixtures/world-tick-real-windows.json is ~1.7k accrue rows
   for 5 users = ~24 rows/user/day. At 100x the live player base (500 active)
   that is ~12k accrue rows/day, so even if EVERY row carried the widest form
   the ceiling is ~290 KB/day (~105 MB/year) — and the real figure is a small
   fraction of it, because the key is absent on any window without a death. */
export function windowWaste(summary) {
  const s = summary || {};
  const r = Math.floor(nat(s.recoverMs, 0));
  const i = Math.floor(nat(s.idleMs, 0));
  return (r > 0 || i > 0) ? `${r},${i}` : null;
}

/* ── THE WINDOW, ON THE RECEIPT (Ruling 2) ──────────────────────────────────
   Stated, never inferred — the same rule the ruling puts on `blessed`, `died`
   and `crits`. Before the flip a renderer could subtract `awayMs` off `now` to
   get the credited hours and be right; it cannot any more, and a renderer that
   guesses will eventually quote hours the player was never paid for.

     awayMs    the CREDITED span            (windowFrom -> windowTo)
     paidMs    the span that actually EARNED (shorter when the run died or ran
               out of supplies — the client's b345 meaning, unchanged)
     unpaidMs  the forfeited tail: the cap, made a number
     windowFrom/windowTo  WHICH hours those were, which is what decides the
               Boss-of-the-Day segments and every timed effect

   ⚠ `awayMs` KEEPS ITS SHIPPED MEANING — the span that was credited, exactly
     as `emptySummary` in core and `lastOfflineSummary.awayMs` on the client
     have always used it. The whole absence is `awayMs + unpaidMs`; it is not
     given a field of its own, because a second meaning of `awayMs` across
     twenty renderers is a worse defect than the one this envelope closes.

   @param ranMs the earning span when the run stopped early; null otherwise */
export function windowEnvelope(credit, ranMs) {
  const earned = (typeof ranMs === 'number' && isFinite(ranMs) && ranMs >= 0)
    ? Math.min(ranMs, credit.paidMs) : credit.paidMs;
  return {
    awayMs: credit.paidMs,
    paidMs: earned,
    unpaidMs: credit.unpaidMs,
    capped: credit.capped,
    windowFrom: credit.fromMs,
    windowTo: credit.toMs,
  };
}

/* ── THE SETTLED WATERMARK — WHERE `accrued_to` MAY ACTUALLY STAND ──────────
   MEASURED, 2026-09-16 (tests/settle-carry-loss.mjs): every accrual window
   forfeits the sub-tick remainder of the action that was in progress when it
   closed. `simulateSpan` budgets each segment as `seg.ms * rate + carryMs` and
   takes `floor(budget / tickMs)` ticks (combat-sim.js:689-691); `sliceSpan`
   does the identical thing per slice (artisan-sim.js). Both open with
   `let carryMs = 0;`, so the remainder rides across a segment boundary INSIDE
   one call and dies at the call boundary. Meanwhile the delta advanced
   `accrued_to` to `now()` unconditionally — so the remainder was not deferred
   to the next window, it was DESTROYED. At the live 90 s attended cadence that
   is 1.3-1.7% of a combat session and up to 6.66% on a 7 s gathering node,
   every session, forever.

   The fix is the watermark rule (the rested bank, cut 2026-11-21, advanced
   `rested_at` the same way): advance by exactly the time granted, never to
   `now()`. Here it reads: advance to the last instant the simulation ACCOUNTED FOR, and leave the sub-tick tail open so the NEXT window
   re-simulates it.

   ⚠ THE ENGINES ARE NOT TOUCHED. `combat-sim.js` and `artisan-sim.js` are
     SHA-pinned and repacked into this function by tools/pack-edge.mjs, and they
     are the SAME bytes the live client runs (AWAY-1). The remainder is
     recovered from the summary the engine already states, not by threading a
     carry through a second code path — so there is still exactly one engine and
     the away and attended halves stay byte-identical.

   `accounted` is the equality combat-sim.js:886 states outright
   (`paidMs + recoverMs + idleMs === awayMs`, modulo the remainder), expressed
   in the one unit every path has: whole ticks. `recoverMs` and `idleMs` are
   combat-only fields and read as 0 on the fuel run, which is correct: it has
   neither.

   ── THE FOUR REFUSALS, each of which would otherwise be a mint or a stall ──

   (a) CAPPED. An over-cap absence forfeits its excess ON PURPOSE — the b307
       per-absence rule ("signing in resets the timer"). Advancing only to the
       paid instant would let a 40-hour absence be collected as four full 12 h
       nights in a row, and a cap that can be drained in instalments is not a
       cap. A capped window therefore still stamps `now()`, exactly as before.

   (b) THE COLLECT. `caller === 'collect'` is set-activity.js's
       collect-before-switch, where the pointer is about to be REPLACED
       (`active_since = now()`). There is no later window to defer INTO, so
       deferring there is the b531 defect with the sign flipped: the remainder
       would be destroyed AND the pointer restamped. A collect settles to
       `now()`.

       ⚠ THIS IS THE ONLY CALLER IT APPLIES TO, and that is the 2026-09-18
         correction. It was keyed on `finalWindow`, whose documented meaning was
         "this window has no next CALL" — true of a collect, and also true of a
         10 s world-tick window, which is why the tick spike borrowed it. But
         the condition that actually matters is not "no next call", it is "no
         next WINDOW to defer into". The tick has one: its next window starts at
         the watermark this one stamps. Under the borrowed flag the tick forfeit
         its sub-action remainder every ten seconds (2.0% / 3.5% / 7.8% of a
         ten-minute span with alignment off, measured on the three parity
         fixtures), and was saved only by `alignWindow` zeroing the remainder.
         'tick' therefore falls through to the deferral below, exactly like
         'accrue'. See accrualCaller.

   (c) THE REMAINDER IS NOT A REMAINDER. A deferral is only ever the sub-tick
       carry, so `remainder < tickMs` is a REQUIREMENT, not an observation. When
       the simulation stopped early in a way the summary does not account for —
       a fuel run whose fuel ran out, any future stop with no `idleMs` — `grantMs - accounted` is a large
       number, and re-opening that span would re-simulate a stopped activity
       every window, forever. Above one tick the window stamps `now()` and the
       behaviour is byte-for-byte what shipped.

   (d) RETIRED with the attended top-up (lane C2): there are no consumed
       attended rows to floor the watermark at.

   AND ONE INVARIANT: the watermark must STRICTLY ADVANCE. `nowMs - (grantMs-1)`
   is `payFromMs + 1` at worst, which is above the old `accrued_to` by at least
   a millisecond, so a pathological `tickMs > grantMs` can never freeze the
   watermark and stall the character. It cannot bind at today's values (the
   floor is 60 s and no tick interval is near it) and it is not there for them.

   THE DIRECTION OF EVERY ERROR IS THE SAME. This function only ever returns a
   value in `[nowMs - grantMs + 1, nowMs]` — never past `now`, never at or below
   the old watermark. Relative to what ships today it can only move the watermark
   BACKWARDS, i.e. leave a window OPEN. An open window pays what the simulation
   computes for it on the next call; it cannot mint, because every span is priced
   from the watermark forward and nothing crosses a window boundary except the
   character's own state — which is unchanged over a sub-tick in which, by
   construction, no tick ran.

   @param span    { nowMs, grantMs, capped } — the shared window object
   @param summary the simulation's own report
   @param tickMs  the ACTION interval the span was priced at
   @param opts    { caller } — `caller` is the accrualCaller()
                  taxonomy; only 'collect' short-circuits to now(). An absent or
                  unrecognised caller DEFERS (the conservative direction).
   @returns the instant `accrued_to` should be stamped to, in ms
*/
export function settledWatermarkMs(span, summary, tickMs, opts) {
  const o = opts || {};
  const s = summary || {};
  const nowMs = nat(span && span.nowMs, 0);
  const grantMs = nat(span && span.grantMs, 0);
  const step = nat(tickMs, 0);
  if (span && span.capped === true) return nowMs;            // (a)
  if (o.caller === 'collect') return nowMs;                  // (b)
  if (!(step > 0) || !(grantMs > 0)) return nowMs;
  const accounted = nat(s.ticks, 0) * step + nat(s.recoverMs, 0) + nat(s.idleMs, 0);
  const remainder = grantMs - accounted;
  if (!(remainder > 0)) return nowMs;                        // nothing was left over
  if (remainder >= step) return nowMs;                       // (c)
  const floorMs = nowMs - (grantMs - 1);                     // strict advance
  /* ⚠ THE CEILING IS STATED, NOT INFERRED (Security review 2026-09-16, F1).
     The header above asserts this function "only ever returns a value in
     `[nowMs - grantMs + 1, nowMs]` — never past `now`". It did not: `nat()`
     does NOT floor (it accepts any finite non-negative Number), so a
     FRACTIONAL `grantMs` below 1 makes the strict-advance floor
     `nowMs - (grantMs - 1)` land ABOVE `nowMs`, and the function returns a
     watermark in the FUTURE. Fuzzed over 76,832 hostile input combinations:
     exactly one violation class, `{grantMs: 0.5, tickMs: 1}` → `nowMs + 0.5`.
     It is unreachable from today's callers — every term of
     `grantMs = min(elapsedMs, sinceActivityMs, capMs)` is integer ms and the
     accrue path additionally refuses anything below ACCRUE_MIN_MS — and
     `hr_apply`'s `least(now(), greatest(...))` would clamp it a second time.
     Both of those are properties of the CURRENT callers, not of this value,
     which is the same reasoning refusal (d) is closed by construction on. One
     `Math.min` makes the stated range true by construction instead of by the
     arithmetic of whoever calls next. tests/settle-carry-defer.mjs D9. */
  return Math.min(nowMs, Math.max(floorMs, nowMs - remainder));
}
