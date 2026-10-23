// ════════════════════════════════════════════════════════════════════════
// src/session/ask-pacer.js — ONE CHARACTER'S SHARE OF THE ACCOUNT'S ENGINE BUDGET.
//
// The engine's plain read (hr-accrue {slot}: the hunter's settle, the town
// settle, the re-read after a join) spends hr_rate_gate's `accrue` budget,
// and that budget is the ACCOUNT's: hr_rate_counters is keyed on (user,
// bucket), never the slot, so every hero the login plays at once shares 30 a
// minute. Live 10-23: a four-hero party asked past it all day (1,906
// refusals), and a refused ask left the live view's look-ahead short, so it
// asked again sooner (live-link.js refillDelayMs): the refusals fed the asking.
//
// A bucket of SESSION_CONFIG.engineAskBurst asks, refilled at engineAsksPerMin
// a minute: the live view's first asks may come at once, then one every
// 60/6 s at most, so four heroes sustain 24, under the server's 30. An ask
// over it is never sent: the hunt re-read re-arms to the
// instant it fits (not a miss), and any other caller owes ONE catch-up then.
// A refusal (429) holds every ask for liveRefillMs (the look-ahead's margin;
// measured, a whole poll starved the viewed prediction).
// Timing only: nothing here is read as owned or spent.
// ════════════════════════════════════════════════════════════════════════
import { SESSION_CONFIG } from './config.js?v=0.2.36';

const MINUTE_MS = 60000;

export class AskPacer {
  /** @param {{now: () => number, setTimer: Function, clearTimer: Function}} o */
  constructor(o) {
    this._now = o.now;
    this._set = o.setTimer;
    this._clear = o.clearTimer;
    this._tokens = SESSION_CONFIG.engineAskBurst;     // the asks that fit now (a full burst at first)
    this._at = o.now();                               // when the bucket was last filled
    this._holdUntil = -Infinity;                      // a refusal's hold
    this._owed = null;                                // the one catch-up timer
  }

  _fill() {
    const now = this._now(), per = SESSION_CONFIG.engineAsksPerMin;
    this._tokens = Math.min(SESSION_CONFIG.engineAskBurst, this._tokens + Math.max(0, now - this._at) * per / MINUTE_MS);
    this._at = now;
    return now;
  }

  /** How long (ms) until one more ask fits this character's budget: 0 when it fits now. */
  waitMs() {
    const now = this._fill();
    const short = this._tokens >= 1 ? 0 : Math.ceil((1 - this._tokens) * MINUTE_MS / SESSION_CONFIG.engineAsksPerMin);
    return Math.max(short, this._holdUntil - now, 0);
  }

  /** One ask sent now. */
  sent() { this._fill(); this._tokens -= 1; }

  /** The server refused an ask for the budget (429 rate_limited): send nothing for `ms`. */
  hold(ms) { this._holdUntil = Math.max(this._holdUntil, this._now() + ms); }

  /** An ask that did not fit: `fn` runs ONCE when one fits; callers meanwhile ride on the same one. */
  owe(fn) {
    if (this._owed) return;
    this._owed = this._set(() => { this._owed = null; fn(); }, this.waitMs());
  }

  stop() { if (this._owed) { this._clear(this._owed); this._owed = null; } }
}
