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
import { SESSION_CONFIG } from './config.js?v=0.2.65';

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
  return askTown(cs, townWorkRunning(cs.read('state'), cs.read('hunt')));
}

/**
 * A BENCH WHOSE SUPPLY IS SPENT IS SETTLED, WATCHED OR NOT (report #68, live v0.2.63). The engine stops a bench only
 * when a settle finds its input gone, and nothing settled an unviewed hero (or a closed bag): the server's pointer, and
 * so the bag line, the roster and the hero's body at the Hearth, kept saying "Fueling" with the fuel long spent. The
 * shell's display tick calls this for EVERY open character with town-work.js benchSpentAtMs (the server-clock instant
 * its own record says the run is spent): one hello once that has passed, at most one per townPollMs. The answer
 * (idle) REPLACES the record (§6), and the server's pointer write moves the town body. Returns true when it asked.
 */
export function settleSpentBench(cs, spentAtMs) {
  if (!cs || typeof cs.read !== 'function' || typeof cs.hello !== 'function' || !Number.isFinite(spentAtMs)) return false;
  const serverNow = typeof cs.serverNow === 'function' ? cs.serverNow() : null;
  if (!Number.isFinite(serverNow) || serverNow < spentAtMs) return false;
  return askTown(cs, townWorkRunning(cs.read('state'), cs.read('hunt')));
}

function askTown(cs, running) {
  let a = ASKS.get(cs);
  if (!a) { a = { at: null, busy: false }; ASKS.set(cs, a); }
  const now = typeof cs.now === 'function' ? cs.now() : Date.now();
  if (!townAskDue(running, a.busy, a.at, cs.receivedAt, now)) return false;
  a.busy = true;
  a.at = now;
  Promise.resolve().then(() => cs.hello()).catch(() => false).then(() => { a.busy = false; });
  return true;
}
