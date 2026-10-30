// ════════════════════════════════════════════════════════════════════════
// src/session/read-gate.js — ONE CHARACTER'S FULL READS, BOUNDED.
//
// Andy, 2026-10-26: a burst of Storage moves cost one hr_load for the moving
// hero plus one for every other open hero, each sent on its own, so the
// account went over hr_load's 180-a-minute budget; the refused re-reads left
// the windows showing stacks the server no longer held, and every press on
// them was refused ("Your storage no longer has that many.").
//
//   load()    the full read, SINGLE-FLIGHT: asked while one is out, the asker
//             rides ONE more after it (it may have started before the write
//             the asker wants to see), so N askers cost at most two reads.
//   resync()  ONE re-read after a refusal or a re-read that did not land: at
//             once when the last resync is a window old (the promise is that
//             read's), else ONE trailing read at the window's end, owed once
//             however many ask (the promise answers false at once: a press
//             never waits on a timer). The window starts at
//             SESSION_CONFIG.resyncMinMs and doubles for each resync that
//             follows the last within twice its window, up to resyncMaxMs; a
//             quiet spell resets it. Never a loop.
//   stop()    cancel the trailing resync (the session closed).
// Timing only: what a read brings is the session's to apply (CharacterSession._take).
// ════════════════════════════════════════════════════════════════════════
import { SESSION_CONFIG } from './config.js?v=0.2.69';

export class ReadGate {
  /** @param {{ read: () => Promise<boolean>, setTimer, clearTimer, now: () => number }} o  `read` sends ONE full read */
  constructor(o) {
    this._read = o.read; this._setTimer = o.setTimer; this._clearTimer = o.clearTimer; this._now = o.now;
    this._out = null; this._next = null;            // the read in flight; the one more owed after it
    this._at = null; this._gap = SESSION_CONFIG.resyncMinMs;   // the last resync's instant; its window
    this._timer = null; this._owed = false; this._stopped = false;
  }

  load() {
    if (this._stopped) return Promise.resolve(false);
    if (this._next) return this._next;
    if (!this._out) return this._send();
    this._next = this._out.then(() => { this._next = null; return this._stopped ? false : this._send(); });
    return this._next;
  }

  _send() {
    const p = (async () => this._read())().catch(() => false)
      .finally(() => { if (this._out === p) this._out = null; });
    this._out = p;
    return p;
  }

  resync() {
    if (this._stopped || this._owed) return Promise.resolve(false);
    const wait = this._at === null ? 0 : this._at + this._gap - this._now();
    if (wait <= 0) return this._resyncNow();
    this._owed = true;
    this._timer = this._setTimer(() => { this._timer = null; this._owed = false; if (!this._stopped) this._resyncNow(); }, wait);
    return Promise.resolve(false);
  }

  _resyncNow() {
    const now = this._now();
    const close = this._at !== null && now - this._at < this._gap * 2;
    this._gap = close ? Math.min(this._gap * 2, SESSION_CONFIG.resyncMaxMs) : SESSION_CONFIG.resyncMinMs;
    this._at = now;
    return this.load();
  }

  stop() {
    this._stopped = true;
    if (this._timer) { this._clearTimer(this._timer); this._timer = null; }
    this._owed = false;
  }
}
