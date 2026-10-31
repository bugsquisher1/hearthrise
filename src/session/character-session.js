// ════════════════════════════════════════════════════════════════════════
// src/session/character-session.js — ONE PLAYING CHARACTER.
//
// A CharacterSession is everything the client holds for one character: its
// slot, its own server connection (the private push topic hr:<uid>:<slot>),
// its record (src/session/envelope.js) and its listeners. There is no global
// state and no "current player": every module that renders a character is
// handed the session it belongs to, so two characters played at once can never
// read or write each other.
//
//   load() / resync()  hr_load(p_slot) — the full read; REPLACES the record; single-flight, bounded (read-gate.js)
//   connect()          subscribe to the push topic; on every join one `hello`
//                      (hr-accrue {slot}) re-reads the whole state (hunting: the
//                      hunt re-read does), so a gap is closed; a frame is the whole character at a
//                      commit (envelope.js E2): it replaces the record like a load, never asks the engine
//   setResidue(f, v)   a display preference: the residue changes at once, one hr_put_client_state per burst
//   setHuntOptions(p, o) the hunt settings INTENT (hr_action_set_options); the new settings arrive only in the re-read
//   setHuntDensity(h, n) the density pick on one ground (hr_hunt_density_set), re-read
//   enterHunt(h, b, p) the go-hunting INTENT (hr_hunt_enter), re-read the same way
//   leaveHunt()        the leave INTENT (hr_hunt_leave), re-read the same way
//   moveStorage(i,n,d) the ACCOUNT storage INTENT (hr_bank_move), re-read (every hero shows it: bankOf); refused: resync()
//   edgeIntent(v, f)   an item intent through the engine (equip, sell, buy, eat; edge-intents.js): names and counts only
//   lockItem / setLootRule / savePreset / applyPreset   the bag rules and the hunt presets: one intent each, re-read
//   joinParty / leaveParty / kickSeat / inviteByName / answerInvite / restartHunt   the party and hunt-again
//                      intents, re-read the same way (party-intents.js startPartyHunt re-reads every own seat)
//   saveOutfit(o, c)   the outfit INTENT (hr_outfit_set), re-read the same way
//   findParties        the party finder, a read whose rows are never the record
//   hunt re-read       while a hunt is open, one hello per hunt-poll.js (the hunter's settle: state, track, events)
//                      until it ended, paced (ask-pacer.js); a frame (a member's settle, the tick) defers it
//   timeline           the settle responses' visual timeline (src/hunt-view/timeline.js), never the record
//   now()              the display clock the timeline plays on
//   intents            the account's asks in flight (intent-ledger.js), each tracked from its send to the re-read envelope
//   subscribe(fn)      fn(session, why) after every applied change
//   notePurse() / noteStorage()  another hero read a newer ACCOUNT purse / Storage (AccountSession): re-render
//   close()            leave the topic, cancel timers, forget the record
//
// It authors no number: the record changes only from a server answer, and the
// only things it sends of its own are the allowlisted residue and intents.
// ════════════════════════════════════════════════════════════════════════

import { applyEnvelope, frameEnvelope, withResidue } from './envelope.js?v=0.2.74';
import { createTimeline } from '../hunt-view/timeline.js?v=0.2.74';
import { LiveLink } from './live-link.js?v=0.2.74';
import { RESIDUE_FIELDS, sanitizeResidueField, unconfirmedResidue } from './residue.js?v=0.2.74';
import { SESSION_CONFIG } from './config.js?v=0.2.74';
import { edgeBody, edgeRead } from './edge-intents.js?v=0.2.74';
import { leaveAskOf, pendingLeaveAt, leaveCountdown, heardOf, closeInMs } from './hunt-leave.js?v=0.2.74';
import { HuntPoll, pollDelayMs } from './hunt-poll.js?v=0.2.74';
import { AskPacer } from './ask-pacer.js?v=0.2.74';
import { createIntentLedger } from './intent-ledger.js?v=0.2.74';
import { ReadGate } from './read-gate.js?v=0.2.74';
import { frameTopic, reconnectDelay } from './frame-channel.js?v=0.2.74';
import { refusalOf, settleRefusalOf } from './refusal.js?v=0.2.74';
import { catchUpLink, newIdem } from './catch-up.js?v=0.2.74';
import { SERVER_ONLY_EVENTS } from '../core/hunt/events.js?v=0.2.74';

export const FRAME_EVENT = 'frame';

/* Observers handed every CharacterSession as it is made, before its first envelope (the hunt summary's recorder). */
const OBSERVERS = new Set();
/** Call `fn(session)` for every session made from now on; returns the stop function. */
export function observeSessions(fn) { OBSERVERS.add(fn); return () => OBSERVERS.delete(fn); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM = /^[a-z0-9_]{1,64}$/;
const HUNT_ID = /^[a-z0-9_]{1,64}$/;
const LOOT_RULES = Object.freeze(['keep', 'deposit', 'sell', 'ignore']);
export { frameTopic };   // the push channel's topic rule lives in frame-channel.js

export class CharacterSession {
  /**
   * @param {object} o
   * @param {number} o.slot
   * @param {string} o.uid                 the signed-in user's id (the topic's owner)
   * @param {object} o.server              src/session/server.js link
   * @param {(topic: string, onMessage: Function, onStatus: Function) => Function} [o.channel]
   *        joins a private broadcast topic; returns the leave function
   * @param {(fn: Function, ms: number) => any} [o.setTimer]
   * @param {(t: any) => void} [o.clearTimer]
   * @param {() => number} [o.now]   the display clock (ms) the timeline plays on
   * @param {() => number} [o.clock] the main-thread clock a live catch-up slice is measured on (live-link.js; performance.now)
   * @param {object} [o.intents]  the account's intent ledger (default: the server link's)
   */
  constructor(o) {
    if (!Number.isInteger(o.slot) || o.slot < 0 || o.slot > SESSION_CONFIG.maxSlot) throw new RangeError('bad slot ' + o.slot);
    this.slot = o.slot;
    this.uid = o.uid;
    this._server = catchUpLink(o.server, { hunting: () => this._huntOpen(), catchUp: () => this.hello() });   // catch-up.js
    /** The account's asks in flight (intent-ledger.js): the server link's, shared by every character. */
    this.intents = o.intents || (o.server && o.server.intents) || createIntentLedger();
    this._channel = o.channel || null;
    this._setTimer = o.setTimer || ((fn, ms) => setTimeout(fn, ms));
    this._clearTimer = o.clearTimer || ((t) => clearTimeout(t));
    this._record = null;
    this._status = 'idle';
    this._listeners = new Set();
    this._leave = null;
    this._attempt = 0;
    this._retry = null;
    this._residueTimer = null;
    this._leaveAsk = null; this._asking = null; this._wholeAt = -1; this._fed = false;   // the hello in flight; the version known whole; re-read last armed by a frame
    this._pending = {}; this._sent = {};   // residue to put; residue put and not yet seen back (residue.js unconfirmedResidue)
    this._closed = false; this._viewed = o.viewed !== false;   // shown (AccountSession.view): only it streams live (setViewed)
    this.lastVerdict = null;
    this._now = o.now || (() => (globalThis.performance ? globalThis.performance.now() : Date.now()));
    this._poll = new HuntPoll({ setTimer: this._setTimer, clearTimer: this._clearTimer, now: () => this._now(), fire: () => this._huntPoll() });
    this._pace = new AskPacer({ setTimer: this._setTimer, clearTimer: this._clearTimer, now: () => this._now() });
    this._reads = new ReadGate({ read: () => this._loadOnce(), setTimer: this._setTimer, clearTimer: this._clearTimer, now: () => this._now() });
    /* Played a poll behind, the buffer holds two windows of steps and a unit gone from the pose must
       outlive the delay before it is forgotten (timeline.js T5). */
    this.timeline = createTimeline({ delayMs: SESSION_CONFIG.huntPlaybackDelayMs, maxSteps: 256,
      forgetMs: SESSION_CONFIG.huntPlaybackDelayMs + 15000 });
    /* THE LIVE VIEW (option B): the instance engine run in the browser from the server's start
       point, prediction only; `live` is its engine (the scene reads its heroes). */
    this.liveLink = new LiveLink({ timeline: this.timeline, now: () => this._now(), emit: (why) => this._emit(why),
      stale: () => { if (this._server && typeof this._server.stale === 'function') this._server.stale(); }, clock: o.clock });
    this.live = this.liveLink.engine;
    this.receivedAt = null; this.settleRefusal = null;   // the engine's last refusal to settle (hello), or null
    this._askedAt = null; this._answeredAt = null;   // the last settle's send and answer (client ms): a leave's 'late'
    /** The hunt session the timeline holds (a new one clears it: _play). */
    this._huntSid = null;
    for (const fn of Array.from(OBSERVERS)) fn(this);   // e.g. the hunt summary's recorder: it must hear the timeline from the first event
  }

  /** The display clock (ms) this character's timeline plays on: every view of it reads this one. */
  now() { return this._now(); }
  /** The frozen record { version, data, residue }, or null before the first answer. */
  get record() { return this._record; }
  /** 'idle' | 'loading' | 'ready' | 'empty' (no character in this slot) | 'closed-game' | 'error' | 'closed' */
  get status() { return this._status; }
  /** A top-level key of the server's last word (frozen), or undefined. */
  read(key) { return this._record ? this._record.data[key] : undefined; }
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  notePurse() { if (!this._closed) this._emit('purse'); }   // a newer ACCOUNT purse, read by another hero (goldOf)
  noteStorage() { if (!this._closed) this._emit('storage'); }   // a newer ACCOUNT Storage, read by another hero (bankOf)
  _emit(why) { for (const fn of Array.from(this._listeners)) { try { fn(this, why); } catch (e) { console.error('[character] a listener failed', e); } } }
  /** Apply a full envelope from the server; false when it was refused. */
  _take(body, why) {
    if (this._closed) return false;
    const r = applyEnvelope(this._record, body);
    this.lastVerdict = r.verdict;
    if (!r.applied) return false;
    this._record = r.record; this._wholeAt = r.record.version;   // a full envelope: every key known at its version
    /* A residue field set here and not yet put, or put and not yet seen back, is newer than the copy this envelope
       carried (it may predate the put): it stays until the server echoes it (the summary card never blinks out). */
    this._sent = unconfirmedResidue(this._sent, this._record.residue);
    for (const [f, v] of Object.entries({ ...this._sent, ...this._pending })) this._record = withResidue(this._record, f, v);
    this._status = 'ready';
    this.receivedAt = this._now();
    this._play(body);
    this._emit(why);
    this._armHuntPoll(why === FRAME_EVENT);
    return true;
  }

  /* Does the server hold a hunt open for this character (its last word, never a guess)? */
  _huntOpen() {
    const h = this.read('hunt');
    return !!h && typeof h === 'object' && typeof h.session_id === 'string' && h.ended !== true;
  }

  /** The SERVER's clock now (ms), measured from its answers (timeline.js T3), or null before one came. */
  serverNow() { return this.timeline.serverNowAt(this._now()); }

  /* THE HUNT RE-READ (hunt-poll.js), armed by every applied answer while a hunt is open. UNVIEWED (CLAUDE.md §6: only the
     viewed character streams live): no live view, a plain read every unviewedPollMs; a pending leave's close is still asked.
     A pushed frame is news the re-read would only repeat (41-45 % of polls did, 10-23), so it DEFERS it a whole delay
     (FED: when the frames stop, it goes out one delay after the last; when the channel is lost, at once: _onChannel). */
  _armHuntPoll(deferred) {
    if (this._closed || !this._huntOpen()) return;
    this._fed = deferred === true;
    const close = closeInMs(this.leaveAt(), this.serverNow());
    const ms = Math.max(this._pace.waitMs(), this._viewed ? pollDelayMs(this.read('hunt'), this.liveLink, close) : Math.min(SESSION_CONFIG.unviewedPollMs, close ?? Infinity));
    if (deferred) this._poll.defer(ms); else this._poll.arm(ms);
  }

  /** Shown or not (AccountSession.view). Viewed again it asks ONE settle at once (the server's state, a start point). */
  setViewed(on) {
    if (this._closed || this._viewed === (on !== false)) return;
    this._viewed = on !== false;
    this._poll.stop();
    if (!this._viewed) this.liveLink.off();
    else if (this._huntOpen()) this.liveLink.join(this.read('hunt').pose);   // the server's snapshot at once, eased forward (live-link.js)
    this._armHuntPoll();
    if (this._viewed) this.hello();
  }

  /** A PENDING LEAVE's server instant (ms): leave_at, else the leave's own answer (hunt-leave.js), or null. */
  leaveAt() { return this._huntOpen() ? pendingLeaveAt(this.read('hunt'), this._leaveAsk) : null; }

  /** The pending leave as the hunt bar shows it (hunt-leave.js leaveCountdown), or null when none pends. */
  leaveCountdown() { const at = this.leaveAt(); return at === null ? null : leaveCountdown(at, this.serverNow(),
    heardOf(this.timeline, [this.receivedAt, this._answeredAt], this._asking ? this._askedAt : null)); }

  async _huntPoll() {
    if (this._closed || !this._huntOpen()) return;
    const engine = this._viewed || this.leaveAt() !== null;   // unviewed: a plain read (hr_load's budget, not the engine's)
    if (engine && this._pace.waitMs() > 0) { this._poll.arm(this._pace.waitMs()); return; }   // over budget: asked when it fits, not a miss
    let took = false;
    try { took = await (engine ? this.hello() : this.load()); } catch (e) { /* the next ask retries */ }
    /* no answer (blocked, refused, offline) backs the live ask off too, never every liveAskMs */
    if (!took && engine) this.liveLink.missed();
    this._armHuntPoll();
  }

  /* The answer's timeline goes to the playback buffer; the snapshot's pose reconciles it gently.
     While the live engine runs, the server's windows only JUDGE the prediction (hunt_check) and
     restart it (hunt_live); its steps and events are already on screen from the engine. */
  _play(body) {
    /* ONE HUNT AT A TIME (timeline.js T10): a new session is a new instance whose unit ids start again
       at 1, so the last hunt's steps go (drawn on, they put a unit in the new ground's wall and slid it
       across the map) and a prediction of the old instance stops. */
    const h0 = this.read('hunt');
    const sid = h0 && typeof h0.session_id === 'string' && h0.ended !== true ? h0.session_id : null;
    if (sid !== null && sid !== this._huntSid) { this.liveLink.off(); this.timeline.clear(); }
    if (sid !== null) this._huntSid = sid;
    this._liveFrom(body);
    /* ONE POSITION SOURCE: while a prediction exists (even one out of seeds) or a view JOINS (a hero switch, live-link.js
       join), the server's window never writes the same units (its steps are the past, played over the prediction's:
       two sources bouncing one hero). Only its SERVER-ONLY events (a party's rare roll) come from it. */
    if (this.live.running() || this.live.stalled() || this.liveLink.joining()) {
      const ms = Number.isSafeInteger(body.hunt_server_now_ms) ? body.hunt_server_now_ms : typeof body.now === 'string' ? Math.floor(Date.parse(body.now)) : NaN;
      const own = Array.isArray(body.hunt_events) ? body.hunt_events.filter((e) => e && SERVER_ONLY_EVENTS.includes(e.type)) : [];
      if (Number.isSafeInteger(ms) || own.length) this.timeline.ingest({ serverNowMs: ms, events: own }, this._now());
      return;
    }
    if (Array.isArray(body.hunt_track) || Array.isArray(body.hunt_events)) {
      this.timeline.ingest({ track: body.hunt_track, events: body.hunt_events, serverNowMs: body.hunt_server_now_ms,
        units: body.hunt_units, fromMs: body.hunt_from_ms }, this._now());
    } else {
      /* A plain read (hr_load, or an accrue the settle floor answered without a window) still
         carries the server's clock (`now`): measure it, or a hunt seen only through reads has no
         clock and the scene draws nobody even though the pose below is the server's (P0 v0.2.7). */
      const ms = typeof body.now === 'string' ? Math.floor(Date.parse(body.now)) : NaN;
      if (Number.isSafeInteger(ms)) this.timeline.ingest({ serverNowMs: ms }, this._now());
    }
    const h = this.read('hunt');
    if (h && h.pose) this.timeline.reconcile(h.pose);
  }

  /* THE LIVE VIEW (src/session/live-link.js): reads every answer while a hunt is open. */
  _liveFrom(body) { if (this._huntOpen() && this._viewed) this.liveLink.from(body); else this.liveLink.off(); }

  /** The frame loop's step: run the live engine to the server's clock now (the viewed character). */
  liveAdvance(clientNow) { return this.liveLink.advance(clientNow); }

  /** A live catch-up still running in slices (live-link.js catchingUp): the frame loop draws nothing new until it lands. */
  liveCatchingUp() { return this.liveLink.catchingUp(); }

  /** What the live view did: verdicts of the server's commits and every restart (live-link.js stats). */
  liveStats() { return Object.assign({}, this.liveLink.stats); }

  /** Units the last reseed found alive (the scene revives a corpse the prediction made), once. */
  takeReseeded() { return this.liveLink.takeReseeded(); }

  /** The hunt settings intent for one preset. Nothing changes on screen from the answer itself: on ok the
      character is re-read and hunt_settings replaces. @returns {Promise<{ok: boolean, error?: string}>} */
  async setHuntOptions(preset, opts) {
    if (this._closed) return { ok: false, error: 'closed' };
    return this.intents.track('action_set_options', async () => {
      const ans = await this._server.rpc('hr_action_set_options', { p_slot: this.slot, p_preset: preset, p_opts: opts, p_idem: newIdem() });
      /* Mid-hunt the next settle runs the new setup: the live view asks for a start point carrying it at once (r10). */
      if (ans.ok && ans.body && ans.body.ok === true && this._huntOpen()) this.liveLink.ask();
      return this._settled(ans);
    });
  }

  /** The density pick on one ground (hr_hunt_density_set; rulings H4: per hero and ground, never a setup): bounded
      by that ground, refused to a party member, shown only from the re-read; a running hunt keeps its frozen one. */
  async setHuntDensity(hunt, density) {
    if (this._closed || !HUNT_ID.test(String(hunt)) || !Number.isInteger(density) || density < 0) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_density_set', () => this._server.rpc('hr_hunt_density_set', { p_slot: this.slot, p_hunt: hunt, p_density: density, p_idem: newIdem() }));
  }

  /** Go hunting (hr_hunt_enter): this character alone (a party of one), or its party's ground when it is in one.
      `bag` is what to carry, [{ item, qty }] of its own supplies (src/shell/hunt-list.js packFor); `preset` the action
      set it fights with. The server checks the level band, the stamina, the stock and the activity; shown from the re-read. */
  async enterHunt(hunt, bag, preset) {
    const lines = Array.isArray(bag) ? bag : [];
    if (this._closed || !HUNT_ID.test(String(hunt)) || !Number.isInteger(preset) || preset < 0 || preset > 7 || lines.length > 10
      || !lines.every((l) => l && ITEM.test(String(l.item)) && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 100000)) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_enter', () => this._server.rpc('hr_hunt_enter', { p_slot: this.slot, p_hunt: hunt,
      p_bag: lines.map((l) => ({ item: l.item, qty: l.qty })), p_preset: preset, p_hours: null, p_idem: newIdem() }));
  }

  /** Bag to or from the ACCOUNT's storage (hr_bank_move; deposit | withdraw), re-read; refused: ONE bounded resync first. */
  async moveStorage(item, qty, dir) {
    if (this._closed || !ITEM.test(String(item)) || !Number.isSafeInteger(qty) || qty < 1 || qty > 1000000 || (dir !== 'deposit' && dir !== 'withdraw')) return { ok: false, error: 'bad_intent' };
    return this.intents.track('bank_move', async () => {
      const r = await this._settled(await this._server.rpc('hr_bank_move', { p_slot: this.slot, p_item: item, p_qty: qty, p_dir: dir, p_idem: newIdem() }));
      if (!r.ok && r.error !== 'closed') await this.resync();   // the window held counts the server no longer has
      return r;
    });
  }

  /** Copy THIS character's hunt settings (every action set: bar, stop rules, options) onto another of the account's
      characters (hr_action_set_copy); that character's own session re-reads them. @returns {Promise<{ok, error?}>} */
  async copyHuntSettingsTo(toSlot) {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._ask('action_set_copy', () => this._server.rpc('hr_action_set_copy', { p_from: this.slot, p_to: toSlot, p_idem: newIdem() }));
  }

  /**
   * Leave the hunt (hr_hunt_leave): always PENDING, closed by the server at leave_at (hunt-leave.js).
   * Its answer carries leave_at, so the countdown starts at once; the hunter's own settle follows (a
   * stalled hunt's leave_at is now, and it ends it), else the plain read brings leave_at, never a guess.
   */
  leaveHunt() {
    if (this._closed) return Promise.resolve({ ok: false, error: 'closed' });
    return this.intents.track('hunt_leave', async () => {
      const ans = await this._server.rpc('hr_hunt_leave', { p_slot: this.slot, p_idem: newIdem() });
      if (this._closed) return { ok: false, error: 'closed' };
      if (ans.ok && ans.body && ans.body.ok === true && ans.body.pending === true) {
        this._leaveAsk = leaveAskOf(ans.body.session);
        this._armHuntPoll();
        if (!(await this.hello()) && !this._closed) await this.load();
        return { ok: true };
      }
      return this._settled(ans);
    });
  }

  /** Set out on a hunt (hr_hunt_enter): ONE intent. `a` is exactly what the server takes (ground, action set, limits,
      bag lines of names and counts); the "Hunt again" card sends the ended hunt's own. The party is the server's. */
  async huntAgain(a) {
    if (this._closed) return { ok: false, error: 'closed' };
    if (!a || !ITEM.test(String(a.hunt)) || !Number.isInteger(a.preset) || !Array.isArray(a.bag)) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_enter', () => this._server.rpc('hr_hunt_enter', { p_slot: this.slot, p_hunt: a.hunt, p_bag: a.bag, p_preset: a.preset,
      p_hours: Number.isInteger(a.hours) ? a.hours : null, p_idem: newIdem() }));
  }

  /** An item intent through the engine (EDGE_INTENTS fields only); the screen changes only from the server's envelope, the
      engine's answer applied as it stands, ONE round trip (r16). `read`: a market read (no envelope, nothing applied:
      edgeRead hands back the server's answer). The price, the stock and the result are the server's. */
  async edgeIntent(verb, fields, read) {
    if (this._closed) return { ok: false, error: 'closed' };
    const body = edgeBody(this.slot, verb, fields, newIdem());
    if (!body) return { ok: false, error: 'bad_intent' };
    return read === true ? edgeRead(await this._server.accrue(body)) : this._ask(verb, () => this._server.accrue(body), true);
  }

  /** Lock (or unlock) an item so no bulk sale can take it; the server keeps the lock. */
  async lockItem(item, locked) {
    if (this._closed || !ITEM.test(String(item))) return { ok: false, error: 'bad_intent' };
    return this._ask('item_lock', () => this._server.rpc('hr_item_lock', { p_slot: this.slot, p_item: item, p_locked: locked === true, p_idem: newIdem() }));
  }

  /** The item's loot plan (keep in bag, deposit in storage, sell: run by loot-intents.js) or its pickup filter (ignore). */
  async setLootRule(item, rule) {
    if (this._closed || !ITEM.test(String(item)) || !LOOT_RULES.includes(rule)) return { ok: false, error: 'bad_intent' };
    return this._ask('loot_rule_set', () => this._server.rpc('hr_loot_rule_set', { p_slot: this.slot, p_item: item, p_rule: rule, p_idem: newIdem() }));
  }

  /** Save the current action set and gear as a hunt preset (the server snapshots its own state). */
  async savePreset(preset, name) {
    const n = String(name || '').trim().slice(0, 24);
    if (this._closed || !Number.isInteger(preset) || preset < 0 || preset > 7 || !n) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_preset_save', () => this._server.rpc('hr_hunt_preset_save', { p_slot: this.slot, p_preset: preset, p_name: n, p_idem: newIdem() }));
  }

  /** Put a saved preset back on: its gear from the bag and its action set. */
  async applyPreset(preset) {
    if (this._closed || !Number.isInteger(preset) || preset < 0 || preset > 7) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_preset_apply', () => this._server.rpc('hr_hunt_preset_apply', { p_slot: this.slot, p_preset: preset, p_idem: newIdem() }));
  }

  /* ── The party (S1 hr_hunt_party_*; the invite, start and restart verbs are this lane's asks, CONFLICTS.md
     2026-10-18 party UI). Each is one intent naming THIS character's slot and ids or a seat; no user id, no
     number of the server's crosses. The party changes on screen only from the re-read envelope. ── */

  /** Take a free seat in an open party (the finder's row, or one of this account's own parties). */
  async joinParty(party) {
    if (this._closed || !UUID.test(String(party))) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_party_join', () => this._server.rpc('hr_hunt_party_join', { p_slot: this.slot, p_party: party, p_idem: newIdem() }));
  }

  /** Leave this character's party (the server hands the lead on, or closes the last seat). */
  async leaveParty() {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._ask('hunt_party_leave', () => this._server.rpc('hr_hunt_party_leave', { p_slot: this.slot, p_idem: newIdem() }));
  }

  /** The leader removes the member in a SEAT. */
  async kickSeat(seat) {
    if (this._closed || !Number.isInteger(seat) || seat < 0 || seat > 7) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_party_kick', () => this._server.rpc('hr_hunt_party_kick', { p_slot: this.slot, p_seat: seat, p_idem: newIdem() }));
  }

  /** Invite a character by the name players see; the server finds it, or refuses `no_such_name`. */
  async inviteByName(name) {
    const n = String(name || '').trim().slice(0, 40);
    if (this._closed || n.length < 2) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_party_invite', () => this._server.rpc('hr_hunt_party_invite', { p_slot: this.slot, p_name: n, p_idem: newIdem() }));
  }

  /** Answer an invite to this character: accept takes the seat, decline forgets it. */
  async answerInvite(invite, accept) {
    if (this._closed || !UUID.test(String(invite))) return { ok: false, error: 'bad_intent' };
    const args = { p_slot: this.slot, p_invite: invite, p_idem: newIdem() };
    return this._ask(accept === true ? 'hunt_party_accept' : 'hunt_party_decline',
      () => (accept === true ? this._server.rpc('hr_hunt_party_accept', args) : this._server.rpc('hr_hunt_party_decline', args)));
  }

  /** Go back to the hunt that just ended, with the same setup it ran on (the server reads that session's own). */
  async restartHunt(session) {
    if (this._closed || !UUID.test(String(session))) return { ok: false, error: 'bad_intent' };
    return this._ask('hunt_restart', () => this._server.rpc('hr_hunt_restart', { p_slot: this.slot, p_session: session, p_idem: newIdem() }));
  }

  /* ── Services (lane S2): each sends the QUOTE the player was shown (the server's own price from
     the `stamina_refill` / `blessings` sections); the server refuses `quote_changed` rather than
     charge another sum. Never a price of the client's own. ── */

  /** Buy the next stamina refill at the server's quoted price. */
  async buyStamina(quotedPrice) {
    if (this._closed || !Number.isSafeInteger(quotedPrice) || quotedPrice < 1) return { ok: false, error: 'bad_intent' };
    return this._ask('stamina_refill', () => this._server.rpc('hr_stamina_refill', { p_slot: this.slot, p_price: quotedPrice, p_idem: newIdem() }));
  }

  /** Buy one blessing tier at the server's quoted price (0 under the free level). */
  async buyBlessing(tier, quotedPrice) {
    if (this._closed || !Number.isInteger(tier) || tier < 1 || tier > 9 || !Number.isSafeInteger(quotedPrice) || quotedPrice < 0) return { ok: false, error: 'bad_intent' };
    return this._ask('blessing_buy', () => this._server.rpc('hr_blessing_buy', { p_slot: this.slot, p_tier: tier, p_price: quotedPrice, p_idem: newIdem() }));
  }

  /** Activate a bestiary stage for one monster kind at the server's quoted fee (refused `quote_changed` otherwise). */
  async activateBestiaryStage(monster, stage, quotedFee) {
    if (this._closed || !ITEM.test(String(monster)) || !Number.isInteger(stage) || stage < 1 || stage > 4
      || !Number.isSafeInteger(quotedFee) || quotedFee < 0) return { ok: false, error: 'bad_intent' };
    return this._ask('bestiary_activate', () => this._server.rpc('hr_bestiary_activate', { p_slot: this.slot, p_monster: monster, p_stage: stage, p_price: quotedFee, p_idem: newIdem() }));
  }

  /** Change this hero's name at the price the `rename` section quoted (Tyler 10-22: the first name is free,
      a new one costs a lot of gold). The server checks the name rules, that nobody has it, the hunt and the
      price, and refuses `quote_changed` rather than charge another sum. */
  async renameHero(name, quotedPrice) {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    if (this._closed || n.length < 3 || n.length > 20) return { ok: false, error: 'bad_name' };
    if (!Number.isSafeInteger(quotedPrice) || quotedPrice < 1) return { ok: false, error: 'bad_intent' };
    return this._ask('hero_rename', () => this._server.rpc('hr_hero_rename', { p_slot: this.slot, p_name: n, p_price: quotedPrice, p_idem: newIdem() }));
  }

  /** Wear an outfit (or null: the role's own look) with a dye index per region. ONE intent (hr_outfit_set): the
      server checks ownership, the regions and the dyes; the window shows the new look only from the re-read. */
  async saveOutfit(outfit, colors) {
    if (this._closed) return { ok: false, error: 'closed' };
    if (outfit !== null && !HUNT_ID.test(String(outfit))) return { ok: false, error: 'bad_intent' };
    const c = {};
    for (const [k, v] of Object.entries(colors && typeof colors === 'object' ? colors : {})) {
      if (!/^[a-z]{1,16}$/.test(k) || !Number.isInteger(v) || v < 0 || v > 63) return { ok: false, error: 'bad_intent' };
      c[k] = v;
    }
    return this._ask('outfit_set', () => this._server.rpc('hr_outfit_set', { p_slot: this.slot, p_outfit: outfit, p_colors: c, p_idem: newIdem() }));
  }

  /** The party finder: open parties with a free seat, optionally on one hunt and only those with no member of a
      weapon type ("a party that needs a bow"). A READ: the rows are the server's answer, never the record. */
  async findParties(hunt, weaponType) {
    if (this._closed) return { ok: false, error: 'closed' };
    if ((hunt !== null && !HUNT_ID.test(String(hunt))) || (weaponType !== null && !HUNT_ID.test(String(weaponType)))) return { ok: false, error: 'bad_intent' };
    return this.intents.track('hunt_party_finder', async () => {
      const ans = await this._server.rpc('hr_hunt_party_finder', { p_slot: this.slot, p_hunt: hunt, p_weapon: weaponType });
      if (this._closed) return { ok: false, error: 'closed' };
      if (ans.ok && ans.body && ans.body.ok === true) return { ok: true, body: ans.body };
      return { ok: false, error: (ans.body && typeof ans.body.error === 'string' && ans.body.error) || ans.error || 'refused' };
    });
  }

  /* ONE ASK, tracked (intent-ledger.js) from the send to the re-read envelope: the press shows it in flight (press-ack.js). */
  _ask(verb, send, carries) { return this.intents.track(verb, async () => this._settled(await send(), carries === true)); }

  /* An intent's answer: on ok the screen shows the server's result. `carries`: the engine's body IS the whole envelope,
     applied as it stands; refused by envelope.js, or any other answer: re-read, and a re-read that did not land is resync'd. */
  async _settled(ans, carries) {
    if (this._closed) return { ok: false, error: 'closed' };
    /* below_range: the server admitted a hunt under its level floor (the floor is a warning, Tyler 10-18). */
    if (ans.ok && ans.body && ans.body.ok === true && ans.body.below_range === true) { await this.load(); return { ok: true, belowRange: true }; }
    if (ans.ok && ans.body && ans.body.ok === true) { if (!(carries && this._take(ans.body, 'load')) && !(await this.load())) await this.resync(); return { ok: true }; }
    return refusalOf(ans);   // the server's detail (slot, condition, field, item) back to the editor as sent
  }

  _answerFailed(ans) {
    if (ans.closed) { this._status = 'closed-game'; this._emit('closed-game'); return; }
    if (ans.body && ans.body.ok === false && ans.body.error === 'no_character') { this._status = 'empty'; this._emit('empty'); return; }
    if (!this._record) { this._status = 'error'; this._emit('error'); }
  }

  /** The full read, single-flight; resync: ONE bounded re-read after a refusal (read-gate.js). True when the record was replaced. */
  load() { return this._closed ? Promise.resolve(false) : this._reads.load(); }
  resync() { return this._closed ? Promise.resolve(false) : this._reads.resync(); }
  async _loadOnce() {
    if (this._closed) return false;
    if (!this._record) this._status = 'loading';   // the first read
    const ans = await this._server.rpc('hr_load', { p_slot: this.slot });
    if (this._closed) return false;
    if (ans.ok && this._take(ans.body, 'load')) return true;
    this._answerFailed(ans);
    return false;
  }

  /** One hr-accrue round trip: the server settles and restates the whole character. ONE in flight (every caller
      rides on it); over the character's budget (ask-pacer.js) none is sent: the hunt re-read asks when it fits,
      else ONE catch-up then. */
  hello() {
    if (this._closed) return Promise.resolve(false);
    if (this._asking) { this._again = true; return this._asking; }   // asked while one is out: ONE more after it
    if (this._pace.waitMs() > 0) { if (!this._huntOpen()) this._pace.owe(() => this.hello()); return Promise.resolve(false); }
    this._pace.sent();
    this._askedAt = this._now();
    return (this._asking = this._helloOnce().finally(() => { this._asking = null; if (this._again) { this._again = false; this.hello(); } }));
  }

  async _helloOnce() {
    const ans = await this._server.accrue({ slot: this.slot });
    if (this._closed) return false;
    if (ans.status > 0 && ans.status !== 429) this._answeredAt = this._now();   // the server's word (a 429 or a lost network is not)
    /* the account's budget is spent: hold a look-ahead margin, then ONE catch-up (a hunt's own re-read retries it) */
    if (ans.status === 429) { this._pace.hold(SESSION_CONFIG.liveRefillMs); if (!this._huntOpen()) this._pace.owe(() => this.hello()); }
    /* An idle settle's {accrued:false} is not the character (read it in full: hr_load); the floor's answer to a hunter
       is, with the live start point (take it). A refusal to settle (refusal.js) stands until the next answer (town ticker). */
    if (ans.ok) this.settleRefusal = settleRefusalOf(ans);
    if (ans.ok && ans.body && ans.body.accrued !== true && ans.body.hunt_live && ans.body.state && this._take(ans.body, 'hello')) return true;
    const v = ans.ok && ans.body ? ans.body.version : null;   // a hunter's idle answer at a version held WHOLE: no re-read
    if (Number.isSafeInteger(v) && ans.body.accrued !== true && this._huntOpen() && v <= this._wholeAt) return false;
    if (ans.ok && ans.body && ans.body.accrued !== true) return this.load();
    if (ans.ok && this._take(ans.body, 'hello')) return true;
    this._answerFailed(ans);
    return false;
  }

  /** A pushed frame: the whole character the server committed (envelope.js E2), applied like a load. It never asks
      the engine (the account's accrue budget is shared): a version gap is closed by the frame itself. */
  onFrame(msg) {
    if (this._closed) return false;
    const f = frameEnvelope(this._record, msg);
    this.lastVerdict = f.verdict;
    return f.env !== null && this._take(f.env, FRAME_EVENT);
  }

  /** Join the character's push topic (and re-join after a drop, with backoff). */
  connect() {
    if (this._closed || this._leave || !this._channel) return false;
    const topic = frameTopic(this.uid, this.slot);
    if (!topic) return false;
    this._leave = this._channel(topic, (msg) => this.onFrame(msg), (st) => this._onChannel(st));
    return true;
  }

  /* Leave the topic ONCE. The leave is forgotten before it runs: supabase's removeChannel reports
     CLOSED to this channel's own status callback synchronously, and that must find nothing to leave
     (live v0.2.6: _onChannel -> leave -> CLOSED -> _onChannel ... until the stack ran out). */
  _dropChannel() {
    const leave = this._leave;
    this._leave = null;
    if (leave) { try { leave(); } catch (e) { /* already gone */ } }
  }

  _onChannel(st) {
    if (this._closed) return;
    if (st === 'SUBSCRIBED') { this._attempt = 0; if (!this._huntOpen()) this.hello(); return; }   // hunting: the armed re-read restates
    if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
      this._dropChannel();
      /* THE PUSH IS GONE: a re-read the frames deferred goes out at once (a frame may be lost); a flapping channel asks once */
      if (this._fed && this._huntOpen()) { this._fed = false; this._poll.arm(this._pace.waitMs()); }
      if (this._retry) return;
      this._retry = this._setTimer(() => { this._retry = null; this.connect(); }, reconnectDelay(++this._attempt));
    }
  }

  /** A display preference for this character only (an allowlisted residue field). */
  setResidue(field, value) {
    if (this._closed || !RESIDUE_FIELDS.includes(field)) return false;
    this._record = withResidue(this._record, field, value);
    this._pending[field] = sanitizeResidueField(field, value);
    this._emit('residue');
    if (this._residueTimer) this._clearTimer(this._residueTimer);
    this._residueTimer = this._setTimer(() => this.flushResidue(), SESSION_CONFIG.residueDebounceMs);
    return true;
  }

  /** Send the pending residue now (one put). */
  async flushResidue() {
    if (this._residueTimer) { this._clearTimer(this._residueTimer); this._residueTimer = null; }
    const patch = this._pending;
    if (this._closed || !Object.keys(patch).length) return false;
    this._pending = {}; this._sent = Object.assign({}, this._sent, patch);
    const ans = await this._server.rpc('hr_put_client_state', { p_slot: this.slot, p_patch: patch, p_idem: newIdem() });
    if (!ans.ok && !this._closed) this._pending = Object.assign(patch, this._pending);   // kept for the next put
    return ans.ok;
  }

  /** Leave the topic, cancel every timer, forget the record and the listeners. */
  close() {
    if (this._closed) return;
    this._closed = true;
    this._dropChannel();
    if (this._retry) { this._clearTimer(this._retry); this._retry = null; }
    if (this._residueTimer) { this._clearTimer(this._residueTimer); this._residueTimer = null; }
    this._poll.stop(); this._pace.stop(); this._reads.stop();
    this._record = null;
    this._pending = {}; this._sent = {};
    this._status = 'closed';
    this._emit('closed');
    this._listeners.clear();
  }
}
