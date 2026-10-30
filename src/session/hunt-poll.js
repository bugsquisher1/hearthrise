// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-poll.js — ONE CHARACTER'S HUNT RE-READ TIMER.
//
// While the server holds a hunt open, CharacterSession asks one hello (the
// hunter's settle) on this timer, re-armed by every applied answer. One timer
// per session, never two: a re-arm moves an armed re-read EARLIER, never
// later, so a pending leave's close (hunt-leave.js closeInMs) ends the hunt on
// screen at the server's leave_at instead of a whole poll after it. A pushed
// frame DEFERS it (a whole delay from now, closeMs still honoured by the delay
// it is given): the push is the feed, this timer the fallback. When the frames
// stop it goes out one delay after the last; when the channel is lost (an error,
// a time-out, a close), at once (character-session.js _onChannel). Timing only:
// nothing here is read as owned or spent.
// ════════════════════════════════════════════════════════════════════════
import { SESSION_CONFIG } from './config.js?v=0.2.69';

/**
 * How soon (ms) the next re-read is asked: the live view's start-point ask
 * (live-link.js askDelayMs, from the session's hunt_from) or its seed refill
 * (refillDelayMs), else the ordinary poll, and never after a pending leave's
 * close (`closeMs`, or null).
 */
export function pollDelayMs(hunt, liveLink, closeMs) {
  /* The live view without a start point (just entered, reloaded, or a commit it did not match)
     asks soon; the floor then answers with hunt_live instead of a settle. A running one asks
     before its look-ahead runs out (live-link.js refillDelayMs). */
  const from = hunt && hunt.session && typeof hunt.session.hunt_from === 'string' ? Date.parse(hunt.session.hunt_from) : NaN;
  const ms = Math.min(liveLink.askDelayMs(from) ?? SESSION_CONFIG.huntPollMs, liveLink.refillDelayMs() ?? SESSION_CONFIG.huntPollMs);
  return closeMs === null ? ms : Math.min(ms, closeMs);
}

export class HuntPoll {
  /**
   * @param {{setTimer: Function, clearTimer: Function, now: () => number, fire: () => void}} o
   */
  constructor(o) {
    this._set = o.setTimer;
    this._clear = o.clearTimer;
    this._now = o.now;
    this._fire = o.fire;
    this._timer = null;
    this._due = null;
  }

  /** Arm the re-read `ms` from now; an armed one only ever moves earlier. */
  arm(ms) {
    const due = this._now() + ms;
    if (this._timer) {
      if (!(due < this._due)) return;
      this._clear(this._timer);
    }
    this._due = due;
    this._timer = this._set(() => { this._timer = null; this._due = null; this._fire(); }, ms);
  }

  /** Arm the re-read `ms` from now even when that is LATER than the armed one: the news it would have
      fetched arrived pushed (a frame), so it waits a whole delay again and stays the fallback. */
  defer(ms) {
    this.stop();
    this.arm(ms);
  }

  stop() {
    if (this._timer) { this._clear(this._timer); this._timer = null; this._due = null; }
  }
}
