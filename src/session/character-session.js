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
//   load()             hr_load(p_slot) — the full read; REPLACES the record
//   connect()          subscribe to the push topic; on every join one `hello`
//                      (hr-accrue {slot}) re-reads the whole state, so a gap
//                      while disconnected is closed; frames apply E2/E3
//   setResidue(f, v)   a display preference: the record's residue changes at
//                      once, one hr_put_client_state follows per burst
//   setHuntOptions(p, o) the hunt settings INTENT (hr_action_set_options); the
//                      new settings arrive only in the re-read envelope
//   leaveHunt()        the leave INTENT (hr_hunt_leave), re-read the same way
//   timeline           the settle responses' visual timeline (src/hunt-view/
//                      timeline.js): tracks and events, never the record
//   subscribe(fn)      fn(session, why) after every applied change
//   close()            leave the topic, cancel timers, forget the record
//
// It authors no number: the record changes only from a server answer, and the
// only things it sends of its own are the allowlisted residue and intents.
// ════════════════════════════════════════════════════════════════════════

import { applyEnvelope, applyFrame, withResidue } from './envelope.js?v=0.1.0';
import { createTimeline } from '../hunt-view/timeline.js?v=0.1.0';
import { RESIDUE_FIELDS, sanitizeResidueField } from './residue.js?v=0.1.0';
import { SESSION_CONFIG } from './config.js?v=0.1.0';

export const FRAME_EVENT = 'frame';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The private push topic hr_frame_topic spells for (uid, slot), or null. Pure. */
export function frameTopic(uid, slot, maxSlot = SESSION_CONFIG.maxSlot) {
  if (typeof uid !== 'string' || !UUID.test(uid)) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot > maxSlot) return null;
  return 'hr:' + uid.toLowerCase() + ':' + slot;
}

/** Exponential reconnect delay, capped, with ±20% jitter (`rand` for tests). Pure. */
function reconnectDelay(attempt, rand, cfg = SESSION_CONFIG) {
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  const base = Math.min(cfg.reconnectMaxMs, cfg.reconnectMinMs * Math.pow(2, Math.min(n, 20) - 1));
  const r = typeof rand === 'number' && rand >= 0 && rand <= 1 ? rand : Math.random();
  return Math.round(base * (0.8 + 0.4 * r));
}

function newIdem() {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

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
   */
  constructor(o) {
    if (!Number.isInteger(o.slot) || o.slot < 0 || o.slot > SESSION_CONFIG.maxSlot) throw new RangeError('bad slot ' + o.slot);
    this.slot = o.slot;
    this.uid = o.uid;
    this._server = o.server;
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
    this._pending = {};
    this._closed = false;
    this.lastVerdict = null;
    this._now = o.now || (() => (globalThis.performance ? globalThis.performance.now() : Date.now()));
    this.timeline = createTimeline();
    this.receivedAt = null;
  }

  /** The frozen record { version, data, residue }, or null before the first answer. */
  get record() { return this._record; }
  /** 'idle' | 'loading' | 'ready' | 'empty' (no character in this slot) | 'closed-game' | 'error' | 'closed' */
  get status() { return this._status; }
  /** A top-level key of the server's last word (frozen), or undefined. */
  read(key) { return this._record ? this._record.data[key] : undefined; }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(why) { for (const fn of Array.from(this._listeners)) { try { fn(this, why); } catch (e) { console.error('[character] a listener failed', e); } } }

  /** Apply a full envelope from the server; false when it was refused. */
  _take(body, why) {
    if (this._closed) return false;
    const r = applyEnvelope(this._record, body);
    this.lastVerdict = r.verdict;
    if (!r.applied) return false;
    this._record = r.record;
    this._status = 'ready';
    this.receivedAt = this._now();
    this._play(body);
    this._emit(why);
    return true;
  }

  /* The answer's timeline goes to the playback buffer; the snapshot's pose reconciles it gently. */
  _play(body) {
    if (Array.isArray(body.hunt_track) || Array.isArray(body.hunt_events)) {
      this.timeline.ingest({ track: body.hunt_track, events: body.hunt_events, serverNowMs: body.hunt_server_now_ms }, this._now());
    }
    const h = this.read('hunt');
    if (h && h.pose) this.timeline.reconcile(h.pose);
  }

  /**
   * The hunt settings intent for one preset. Nothing changes on screen from the
   * answer itself: on ok the character is re-read and hunt_settings replaces.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async setHuntOptions(preset, opts) {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._settled(await this._server.rpc('hr_action_set_options', { p_slot: this.slot, p_preset: preset, p_opts: opts, p_idem: newIdem() }));
  }

  /** Leave the hunt (hr_hunt_leave): the server settles and ends it; the re-read shows the summary. */
  async leaveHunt() {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._settled(await this._server.rpc('hr_hunt_leave', { p_slot: this.slot, p_idem: newIdem() }));
  }

  /* An intent's answer: on ok the whole character is re-read, so the screen shows the server's result. */
  async _settled(ans) {
    if (this._closed) return { ok: false, error: 'closed' };
    if (ans.ok && ans.body && ans.body.ok === true) { await this.load(); return { ok: true }; }
    return { ok: false, error: (ans.body && typeof ans.body.error === 'string' && ans.body.error) || ans.error || 'refused' };
  }

  _answerFailed(ans) {
    if (ans.closed) { this._status = 'closed-game'; this._emit('closed-game'); return; }
    if (ans.body && ans.body.ok === false && ans.body.error === 'no_character') { this._status = 'empty'; this._emit('empty'); return; }
    if (!this._record) { this._status = 'error'; this._emit('error'); }
  }

  /** The full read. Resolves to true when the record was replaced. */
  async load() {
    if (this._closed) return false;
    if (!this._record) this._status = 'loading';
    const ans = await this._server.rpc('hr_load', { p_slot: this.slot });
    if (this._closed) return false;
    if (ans.ok && this._take(ans.body, 'load')) return true;
    this._answerFailed(ans);
    return false;
  }

  /** One hr-accrue round trip: the server settles and restates the whole character. */
  async hello() {
    if (this._closed) return false;
    const ans = await this._server.accrue({ slot: this.slot });
    if (this._closed) return false;
    /* An idle settle answers {accrued:false} without restating the character:
       the full read is hr_load's, so read it rather than apply less. */
    if (ans.ok && ans.body && ans.body.accrued !== true) return this.load();
    if (ans.ok && this._take(ans.body, 'hello')) return true;
    this._answerFailed(ans);
    return false;
  }

  /** A pushed frame. A version jump means frames were missed: one hello closes the gap. */
  onFrame(msg) {
    if (this._closed) return false;
    const before = this._record ? this._record.version : null;
    const r = applyFrame(this._record, msg);
    this.lastVerdict = r.verdict;
    if (!r.applied) return false;
    this._record = r.record;
    this._emit('frame');
    if (before !== null && r.record.version > before + 1) this.hello();
    return true;
  }

  /** Join the character's push topic (and re-join after a drop, with backoff). */
  connect() {
    if (this._closed || this._leave || !this._channel) return false;
    const topic = frameTopic(this.uid, this.slot);
    if (!topic) return false;
    this._leave = this._channel(topic, (msg) => this.onFrame(msg), (st) => this._onChannel(st));
    return true;
  }

  _onChannel(st) {
    if (this._closed) return;
    if (st === 'SUBSCRIBED') { this._attempt = 0; this.hello(); return; }
    if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
      if (this._leave) { try { this._leave(); } catch (e) { /* already gone */ } this._leave = null; }
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
    this._pending = {};
    const ans = await this._server.rpc('hr_put_client_state', { p_slot: this.slot, p_patch: patch, p_idem: newIdem() });
    if (!ans.ok && !this._closed) this._pending = Object.assign(patch, this._pending);   // kept for the next put
    return ans.ok;
  }

  /** Leave the topic, cancel every timer, forget the record and the listeners. */
  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._leave) { try { this._leave(); } catch (e) { /* already gone */ } this._leave = null; }
    if (this._retry) { this._clearTimer(this._retry); this._retry = null; }
    if (this._residueTimer) { this._clearTimer(this._residueTimer); this._residueTimer = null; }
    this._record = null;
    this._pending = {};
    this._status = 'closed';
    this._emit('closed');
    this._listeners.clear();
  }
}
