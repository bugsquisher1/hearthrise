// ════════════════════════════════════════════════════════════════════════
// src/session/town-poll.js — THE TOWN WORK RE-READ, WHILE SOMEONE WATCHES IT.
//
// Tyler 2026-10-22: "The bag needs to update in real time, not when it's done."
// A town activity (a gathering node or a bench recipe) is settled by the
// engine's accrue verb from the server's own watermark to the server's clock;
// nothing here moves a number. While the Work window or the bag is open (the
// shell asks watchTown on its display tick) and the server says the hero works
// in town, the viewed character asks one hello per SESSION_CONFIG.townPollMs,
// just over the engine's town floor (accrual.js TOWN_SETTLE_MIN_MS), the way
// the hunt view asks hunt_settle. Each answer is the whole character after the
// settle and REPLACES what is on screen (§6). Closed windows ask nothing: the
// bench and the node still run on the server, and the next settle (a watched
// one, the stop, a hunt's start or the next sign-in) pays all of it.
// Timing only: nothing here is read as owned or spent.
// ════════════════════════════════════════════════════════════════════════
import { SESSION_CONFIG } from './config.js?v=0.2.56';

/** Does the server say this hero works in town (a gathering node or a bench), with no hunt open? */
export function townWorkRunning(state, hunt) {
  if (!state || typeof state.active_id !== 'string' || !state.active_id) return false;
  if (state.active_kind !== 'gather' && state.active_kind !== 'artisan') return false;
  return !(hunt && typeof hunt === 'object' && typeof hunt.session_id === 'string' && hunt.ended !== true);
}

/**
 * Is a re-read due at `nowMs`? Not while one is in flight; else when townPollMs has passed since the
 * later of the last ask and the last applied answer (`receivedAt`, the session's display clock).
 */
export function townAskDue(running, busy, lastAskMs, receivedAtMs, nowMs) {
  if (!running || busy) return false;
  const since = Math.max(Number.isFinite(lastAskMs) ? lastAskMs : -Infinity, Number.isFinite(receivedAtMs) ? receivedAtMs : -Infinity);
  return nowMs - since >= SESSION_CONFIG.townPollMs;
}

const ASKS = new WeakMap();

/**
 * The shell's display tick, while the Work window or the bag is open: one hello when due. Returns true
 * when it asked. `cs` is the viewed CharacterSession (read, hello, now, receivedAt).
 */
export function watchTown(cs) {
  if (!cs || typeof cs.read !== 'function' || typeof cs.hello !== 'function') return false;
  let a = ASKS.get(cs);
  if (!a) { a = { at: null, busy: false }; ASKS.set(cs, a); }
  const now = typeof cs.now === 'function' ? cs.now() : Date.now();
  if (!townAskDue(townWorkRunning(cs.read('state'), cs.read('hunt')), a.busy, a.at, cs.receivedAt, now)) return false;
  a.busy = true;
  a.at = now;
  Promise.resolve().then(() => cs.hello()).catch(() => false).then(() => { a.busy = false; });
  return true;
}
