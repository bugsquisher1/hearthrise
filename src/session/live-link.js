// ════════════════════════════════════════════════════════════════════════
// src/session/live-link.js — ONE CHARACTER'S LIVE HUNT VIEW, WIRED TO ITS SESSION.
//
// Option B (Tyler 2026-10-19). The CharacterSession owns one LiveLink: it runs
// the instance engine in the browser (src/hunt-view/live-engine.js) from the
// server's start point, feeds the character's playback timeline a hair behind
// real time, and reads every server answer for what the live view needs:
//   hunt_live   a start point: seed the engine, or (when the prediction is off the
//               server's world) re-seed it and ease the drawing onto the truth
//   hunt_check  a commit: confirm the prediction (and take the next seeds), or
//               ask at once for a fresh start point
// Prediction only: nothing here is spent, credited or shown as owned.
// ════════════════════════════════════════════════════════════════════════

import { createLiveEngine } from '../hunt-view/live-engine.js?v=0.2.10';
import { ITEMS } from '../data/items.js?v=0.2.10';
import { MONSTERS } from '../data/monsters.js?v=0.2.10';
import { SESSION_CONFIG } from './config.js?v=0.2.10';

export class LiveLink {
  /**
   * @param {{timeline: object, now: () => number, emit: (why: string) => void}} o
   */
  constructor(o) {
    this.engine = createLiveEngine({ items: ITEMS, monsters: MONSTERS });
    this._tl = o.timeline;
    this._now = o.now;
    this._emit = o.emit;
    /** Ask the server for a start point at once (CharacterSession's poll reads it). */
    this.want = false;
    this._tries = 0;
    this._reseeded = null;
  }

  running() { return this.engine.running(); }

  /** The hunt is over (or there is none): back to the server-paced view. */
  off() {
    if (this.engine.running()) { this.engine.stop(); this._tl.setDelay(SESSION_CONFIG.huntPlaybackDelayMs); }
    this.want = false; this._tries = 0;
  }

  /** One server answer while a hunt is open. */
  from(body) {
    if (!body.hunt_live && !body.hunt_check && this.engine.running()) return;
    const ms = Number.isSafeInteger(body.hunt_server_now_ms) ? body.hunt_server_now_ms
      : typeof body.now === 'string' ? Math.floor(Date.parse(body.now)) : NaN;
    if ((body.hunt_live || body.hunt_check) && Number.isSafeInteger(ms)) this._tl.ingest({ serverNowMs: ms }, this._now());
    const now = this._tl.serverNowAt(this._now());
    if (body.hunt_live) {
      this.want = false;
      if (!this.engine.running()) {
        if (this.engine.seed(body.hunt_live)) { this._tl.setDelay(SESSION_CONFIG.liveDelayMs); this._tries = 0; this._emit('live'); }
        return;
      }
      const i = body.hunt_live.instance;
      if (this.engine.check({ world_swing: i.world_swing, world_hash: i.world_hash }) === 'match') return;
      const res = this.engine.reseed(body.hunt_live, now);
      if (!res) return;
      this._tl.rebase(Math.floor(now), res.positions, SESSION_CONFIG.liveEaseMs);
      this._tl.ingest({ units: res.units, fromMs: Math.floor(now) }, this._now());
      this._reseeded = res.alive;
      this._emit('reseed');
    } else if (body.hunt_check && this.engine.running()) {
      if (this.engine.confirm(body.hunt_check) !== 'match') this.want = true;
    } else if (!this.engine.running()) {
      /* No start point in this answer: ask again soon, liveAskTries at most (an engine that does
         not send one leaves the hunt on its server-paced view at the ordinary poll). */
      this.want = this._tries < SESSION_CONFIG.liveAskTries;
      if (this.want) this._tries++;
    }
  }

  /** The frame loop's step: run the engine to the server's clock now. */
  advance(clientNow) {
    if (!this.engine.running()) return 0;
    const now = this._tl.serverNowAt(clientNow);
    if (now === null) return 0;
    return this.engine.advance(now, (b) => this._tl.ingest(b, clientNow));
  }

  /** Units the last reseed found alive (the scene revives a corpse the prediction made), once. */
  takeReseeded() { const r = this._reseeded; this._reseeded = null; return r; }
}
