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

import { createLiveEngine } from '../hunt-view/live-engine.js?v=0.2.70';
import { ITEMS } from '../data/items.js?v=0.2.70';
import { MONSTERS } from '../data/monsters.js?v=0.2.70';
import { SESSION_CONFIG } from './config.js?v=0.2.70';

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
    this._short = 0;
    this._reseeded = null;
    this._joining = false;
    /** What the live view did (tools: the world stage's data-live): each commit's verdict, every restart. */
    this.stats = { match: 0, diverged: 0, unknown: 0, reseeds: 0, catchUps: 0, starves: 0 };
    this._wasStalled = false;
    /** The server's settle watermark (ms) its last commit or start point stated: display only (?debug=live's settle lag). */
    this.settledToMs = null;
  }

  running() { return this.engine.running(); }
  /** The prediction ran to the instance's end (every member left) and waits for the server to close the hunt. */
  ended() { return this.engine.ended(); }

  /**
   * VIEWED AGAIN MID-HUNT (a hero switch, AccountSession.view; Andy #65 "freezing/catchup sprinting and jumping when
   * toggling between characters"). The screen plays a hair behind real time AT ONCE, so it shows the server's latest
   * snapshot (the pose every pushed frame walked the units onto while unviewed) instead of a playback a poll behind,
   * and the start point, when it lands, eases forward from there (catchUp, timeline.js T8). Played a poll behind until
   * then, the units stood where they were 19 s ago for the whole wait and then leapt across the map the moment the
   * delay fell to the live one. Until the start point lands the view JOINS: a server window is the past and is not
   * played over the snapshot (character-session.js _play), so the one ease is the start point's. `pose` is the
   * snapshot (the hunt section's): a unit it no longer lists is gone at the server, and played a hair behind it
   * nothing of it is still to come, so it is forgotten (timeline.js T11) rather than held unnamed (an older frame's
   * pose placed it with no kind: "[hunt-scene] no sprite for unit N (null)" on the way back, Andy #65).
   */
  join(pose) {
    if (this.engine.running() || this.engine.stalled()) return;
    const live = SESSION_CONFIG.liveDelayMs;
    this._joining = true;
    this._tl.setDelay(live);
    /* No ask of its own: the switch's ONE settle (CharacterSession.setViewed hello) brings the start point, or an
       answer without one sets `want` (_take) and the next ask comes liveAskMs after it (session-core VIEW-3). */
    this.hold(pose);
  }
  /** Waiting for the start point of a view switched to mid-hunt (join): the screen holds the snapshot. */
  joining() { return this._joining === true && !this.engine.running() && !this.engine.stalled(); }
  /** JOINING, each newer snapshot (`pose`, an answer's hunt section) forgets what the server no longer lists (join). */
  hold(pose) {
    if (!this.joining() || !pose || typeof pose !== 'object' || !Array.isArray(pose.units)) return;
    const listed = new Set(pose.units.map((p) => p && p.u));
    const now = this._now();
    for (const u of this._tl.units()) if (!listed.has(u)) this._tl.forget(u, now);
  }

  /** The hunt is over (or there is none): back to the server-paced view. */
  off() {
    if (this.engine.running() || this.engine.stalled() || this._joining) { this.engine.stop(); this._tl.setDelay(SESSION_CONFIG.huntPlaybackDelayMs); }
    this.want = false; this._tries = 0; this._joining = false;
  }

  /** One server answer while a hunt is open. */
  from(body) {
    this.hold(body.hunt && body.hunt.pose);   // joining: the answer's snapshot forgets what the server no longer lists
    const before = this.engine.seededUntil();
    this._take(body);
    /* An answer that left the look-ahead short makes the next early ask wait twice as long (refillDelayMs). */
    const after = this.engine.seededUntil();
    const now = this._tl.serverNowAt(this._now());
    if (after !== null && (before === null || after > before)) this._short = 0;
    else if (after !== null && now !== null && after - now < SESSION_CONFIG.liveRefillMs) this._short++;
  }

  _take(body) {
    const st = body.hunt_check ? body.hunt_check.settled_to_ms : body.hunt_live && body.hunt_live.instance ? body.hunt_live.instance.settled_to_ms : null;
    if (Number.isSafeInteger(st) && st > 0) this.settledToMs = st;
    if (!body.hunt_live && !body.hunt_check && this.engine.running()) return;
    const ms = Number.isSafeInteger(body.hunt_server_now_ms) ? body.hunt_server_now_ms
      : typeof body.now === 'string' ? Math.floor(Date.parse(body.now)) : NaN;
    if ((body.hunt_live || body.hunt_check) && Number.isSafeInteger(ms)) this._tl.ingest({ serverNowMs: ms }, this._now());
    const now = this._tl.serverNowAt(this._now());
    if (body.hunt_live) {
      this.want = false;
      /* Not started, or out of seeds: (re)start from the server's world. A start point from an older
         commit leaves the prediction behind the clock, and advance() eases it on (catchUp). */
      if (!this.engine.running() && !this.engine.ended()) {
        if (this.engine.seed(body.hunt_live)) { this._tl.setDelay(SESSION_CONFIG.liveDelayMs); this._tries = 0; this._joining = false; this._emit('live'); }
        return;
      }
      /* A start point the prediction agrees with hands it the next seeds. A character whose own poll
         never lands the settle (another client of the party settled first: its answers are start
         points, never commits) lived on its first 16 swings, froze, then jumped (live v0.2.20). */
      /* A SETUP CHANGED MID-HUNT (r10, Andy): a start point whose heroes fight with other settings or
         another bar is restarted from even when its world agrees: the server settles from that world with
         the new setup, and the prediction kept the old one on screen until a later commit diverged. */
      const i = body.hunt_live.instance;
      /* An ENDED prediction (the hunt's end foreseen: a death, a leave) is judged the same way: a start
         point it agrees with leaves it standing, one past or off it restarts it, eased. */
      if (this.engine.sameSetup(body.hunt_live)
        && this._judge({ world_swing: i.world_swing, world_hash: i.world_hash, seeds: body.hunt_live.seeds }) === 'match') return;
      /* Off the server's world: restart from it, eased (never fed: the swings it runs to catch up are
         already in the past). */
      if (now !== null) { this.stats.reseeds++; this._restart((at, ahead) => this.engine.reseed(body.hunt_live, at, ahead)); }
    } else if (body.hunt_check && (this.engine.running() || this.engine.ended())) {
      if (this._judge(body.hunt_check) !== 'match') this.want = true;
    } else if (!this.engine.running() && !this.engine.ended()) {
      /* No start point in this answer (not due yet, a settle, or a plain read): ask again, backing
         off to the ordinary poll (askDelayMs). Never give up while the hunt is open: a view that
         stopped asking stayed on the server-paced playback a whole poll behind (v0.2.20 start delay). */
      this.want = true;
      this._tries++;
    }
  }

  _judge(hc) { const v = this.engine.reconcile(hc); if (Object.hasOwn(this.stats, v)) this.stats[v]++; return v; }

  /** A setup intent the server took mid-hunt: ask for a start point at once (it carries the new setup). */
  ask() { if (this.engine.running() || this.engine.stalled()) { this.want = true; this._tries = 0; } }

  /** An ask that brought no answer at all: the next one waits twice as long (askDelayMs). */
  missed() { if (this.want) this._tries++; else if (this.engine.running()) this._short++; }

  /**
   * THE LOOK-AHEAD KEPT FULL: how soon to ask (ms) so the next combat seeds arrive before the
   * prediction runs out (engine.seededUntil, less liveRefillMs), or null when the ordinary poll comes
   * first. Waiting for the ordinary poll, a prediction whose answers brought no seeds (another client
   * of the party settled first, a refused settle: about half the answers on live v0.2.21) ran dry,
   * stood for seconds, then caught up. Each answer that leaves it short doubles the wait (liveAskMs up).
   */
  refillDelayMs() {
    const end = this.engine.seededUntil();
    const now = this._tl.serverNowAt(this._now());
    if (end === null || now === null) return null;
    const due = end - now - SESSION_CONFIG.liveRefillMs;
    if (due >= SESSION_CONFIG.huntPollMs) return null;
    return Math.min(SESSION_CONFIG.huntPollMs, Math.max(SESSION_CONFIG.liveAskMs * 2 ** Math.min(6, this._short), due));
  }

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

  /*
   * RESTART THE DRAWING FROM A FAST-FORWARDED PREDICTION (timeline.js T8). `run(at, ahead)` runs the
   * engine to the instant on screen plus the ease and answers its state there (live-engine.js
   * fastForward). Every unit eases from where it is drawn onto where it stands when the ease ends and
   * walks on from there with its own steps (no unit stands waiting for the next boundary); a death
   * inside the skipped span plays now, its victim at 0 HP, so no monster is left standing.
   */
  _restart(run) {
    const client = this._now();
    const server = this._tl.serverNowAt(client);
    if (server === null) return;
    const at = Math.floor(server - this._tl.delayMs());
    const ease = SESSION_CONFIG.liveEaseMs;
    const res = run(at, ease);
    if (!res) return;
    const ends = new Map();
    this._tl.rebase(at, res.positions, ease, ends);
    for (const ev of res.kills) {
      const when = Math.max(at + 1, ev.atMs);
      this._tl.ingest({ units: res.fallen[ev.t] ? { [ev.t]: res.fallen[ev.t] } : undefined, fromMs: when,
        events: [ev.atMs > at ? ev : Object.assign({}, ev, { atMs: when })] }, client);
    }
    this._tl.ingest({ units: res.units, fromMs: res.fromMs, events: res.events,
      track: res.track.filter((s) => !(ends.get(s.u) >= s.atMs)) }, client);
    this._reseeded = res.alive;
    this._emit('reseed');
  }

  /** The frame loop's step: run the engine to the server's clock now. */
  advance(clientNow) {
    if (!this.engine.running()) return 0;
    const now = this._tl.serverNowAt(clientNow);
    if (now === null) return 0;
    /* Behind the screen (a background tab's paused frame loop, a start point from the last commit, a
       restart after the look-ahead ran dry): a swing whose start is already on screen is not fed (its
       first steps would be drawn at once, a jump); it is run unplayed and the drawing eases on. */
    if (this.engine.behindMs(now) > this._tl.delayMs()) {
      this.stats.catchUps++;
      this._restart((at, ahead) => this.engine.catchUp(at, ahead));
      return 0;
    }
    const n = this.engine.advance(now, (b) => this._tl.ingest(b, clientNow));
    const dry = this.engine.stalled();
    if (dry && !this._wasStalled) this.stats.starves++;
    this._wasStalled = dry;
    return n;
  }

  /** Units the last reseed found alive (the scene revives a corpse the prediction made), once. */
  takeReseeded() { const r = this._reseeded; this._reseeded = null; return r; }
}
