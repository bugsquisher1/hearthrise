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

import { createLiveEngine } from '../hunt-view/live-engine.js?v=0.2.20';
import { ITEMS } from '../data/items.js?v=0.2.20';
import { MONSTERS } from '../data/monsters.js?v=0.2.20';
import { SESSION_CONFIG } from './config.js?v=0.2.20';
import { COMBAT_BALANCE } from '../core/combat.js?v=0.2.20';

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
    if (this.engine.running() || this.engine.stalled()) { this.engine.stop(); this._tl.setDelay(SESSION_CONFIG.huntPlaybackDelayMs); }
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
      /* Not started, or out of seeds: (re)start from the server's world. A start point from an older
         commit leaves the prediction behind the clock, and advance() eases it on (catchUp). */
      if (!this.engine.running()) {
        if (this.engine.seed(body.hunt_live)) { this._tl.setDelay(SESSION_CONFIG.liveDelayMs); this._tries = 0; this._emit('live'); }
        return;
      }
      /* A start point the prediction agrees with hands it the next seeds. A character whose own poll
         never lands the settle (another client of the party settled first: its answers are start
         points, never commits) lived on its first 16 swings, froze, then jumped (live v0.2.20). */
      const i = body.hunt_live.instance;
      if (this.engine.running()
        && this.engine.confirm({ world_swing: i.world_swing, world_hash: i.world_hash, seeds: body.hunt_live.seeds }) === 'match') return;
      /* Off the server's world: restart from it, eased (never fed: the swings it runs to catch up are
         already in the past). */
      this._ease(this.engine.reseed(body.hunt_live, now), now);
    } else if (body.hunt_check && this.engine.running()) {
      if (this.engine.confirm(body.hunt_check) !== 'match') this.want = true;
    } else if (!this.engine.running()) {
      /* No start point in this answer (not due yet, a settle, or a plain read): ask again, backing
         off to the ordinary poll (askDelayMs). Never give up while the hunt is open: a view that
         stopped asking stayed on the server-paced playback a whole poll behind (v0.2.20 start delay). */
      this.want = true;
      this._tries++;
    }
  }

  /** An ask that brought no answer at all: the next one waits twice as long (askDelayMs). */
  missed() { if (this.want) this._tries++; }

  /**
   * How soon to ask for a start point (ms), or null for the ordinary poll: liveAskMs doubling per
   * answer that brought none, up to the ordinary poll, and never before the hunt's first boundary
   * (`huntFromMs`, the session's hunt_from: until it the floor answers not_due with no start point).
   */
  askDelayMs(huntFromMs) {
    if (!this.want) return null;
    const back = SESSION_CONFIG.liveAskMs * 2 ** Math.max(0, this._tries - 1);
    const now = this._tl.serverNowAt(this._now());
    const until = Number.isFinite(huntFromMs) && now !== null ? huntFromMs - now + SESSION_CONFIG.liveAskMs : 0;
    return Math.min(SESSION_CONFIG.huntPollMs, Math.max(back, until));
  }

  /* Ease the drawing onto a fast-forwarded prediction (timeline.js T8) and revive what it finds alive. */
  _ease(res, now) {
    if (!res || now === null) return;
    this._tl.rebase(Math.floor(now), res.positions, SESSION_CONFIG.liveEaseMs);
    this._tl.ingest({ units: res.units, fromMs: Math.floor(now) }, this._now());
    this._reseeded = res.alive;
    this._emit('reseed');
  }

  /** The frame loop's step: run the engine to the server's clock now. */
  advance(clientNow) {
    if (!this.engine.running()) return 0;
    const now = this._tl.serverNowAt(clientNow);
    if (now === null) return 0;
    /* More than a swing behind (the frame loop paused in a background tab, or a start point from the
       last commit): the missed swings are past, so they are run unplayed and the drawing eases on. */
    if (this.engine.behindMs(now) > COMBAT_BALANCE.tickMs) { this._ease(this.engine.catchUp(now), now); return 0; }
    return this.engine.advance(now, (b) => this._tl.ingest(b, clientNow));
  }

  /** Units the last reseed found alive (the scene revives a corpse the prediction made), once. */
  takeReseeded() { const r = this._reseeded; this._reseeded = null; return r; }
}
