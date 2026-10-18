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
//   enterHunt(h, b, p) the go-hunting INTENT (hr_hunt_enter), re-read the same way
//   leaveHunt()        the leave INTENT (hr_hunt_leave), re-read the same way
//   moveStorage(i,n,d) the home storage INTENT (hr_bank_move), re-read the same way
//   edgeIntent(v, f)   an item intent through the engine (equip, sell, buy, eat;
//                      src/session/edge-intents.js): names and counts only
//   lockItem / setLootRule / setRestock / refill / savePreset / applyPreset
//                      the bag rules, the one-tap refill and the hunt presets
//                      (CONFLICTS.md 2026-10-18 alpha windows: the server lane
//                      adds them); each is one intent, re-read the same way
//   createParty / joinParty / leaveParty / kickSeat / inviteByName /
//   answerInvite / startPartyHunt / restartHunt
//                      the party and hunt-again intents, re-read the same way;
//   saveOutfit(o, c)   the outfit INTENT (hr_outfit_set), re-read the same way
//   findParties        the party finder, a read whose rows are never the record
//   timeline           the settle responses' visual timeline (src/hunt-view/
//                      timeline.js): tracks and events, never the record
//   now()              the display clock the timeline plays on
//   subscribe(fn)      fn(session, why) after every applied change
//   close()            leave the topic, cancel timers, forget the record
//
// It authors no number: the record changes only from a server answer, and the
// only things it sends of its own are the allowlisted residue and intents.
// ════════════════════════════════════════════════════════════════════════

import { applyEnvelope, applyFrame, withResidue } from './envelope.js?v=0.2.0';
import { createTimeline } from '../hunt-view/timeline.js?v=0.2.0';
import { RESIDUE_FIELDS, sanitizeResidueField } from './residue.js?v=0.2.0';
import { SESSION_CONFIG } from './config.js?v=0.2.0';
import { edgeBody } from './edge-intents.js?v=0.2.0';

export const FRAME_EVENT = 'frame';

/* Observers handed every CharacterSession as it is made, before its first envelope (the hunt summary's recorder). */
const OBSERVERS = new Set();
/** Call `fn(session)` for every session made from now on; returns the stop function. */
export function observeSessions(fn) { OBSERVERS.add(fn); return () => OBSERVERS.delete(fn); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM = /^[a-z0-9_]{1,64}$/;
const HUNT_ID = /^[a-z0-9_]{1,64}$/;
const LOOT_RULES = Object.freeze(['keep', 'sell', 'ignore']);
const RESTOCK_MAX = 1000;

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

  /**
   * Go hunting (hr_hunt_enter): this character alone (a party of one), or its
   * party's ground when it is in one. `bag` is what to carry, [{ item, qty }] of
   * this character's own supplies (src/shell/hunt-list.js packFor); `preset` the
   * action set it fights with. The server checks the level band, the stamina,
   * the stock and the activity, and the hunt shows only from the re-read.
   */
  async enterHunt(hunt, bag, preset) {
    const lines = Array.isArray(bag) ? bag : [];
    if (this._closed || !HUNT_ID.test(String(hunt)) || !Number.isInteger(preset) || preset < 0 || preset > 7 || lines.length > 10
      || !lines.every((l) => l && ITEM.test(String(l.item)) && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 100000)) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_enter', { p_slot: this.slot, p_hunt: hunt,
      p_bag: lines.map((l) => ({ item: l.item, qty: l.qty })), p_preset: preset, p_falls: null, p_hours: null, p_idem: newIdem() }));
  }

  /** Move a stack between the bag and the home storage (hr_bank_move): `dir` is 'deposit' or 'withdraw'. */
  async moveStorage(item, qty, dir) {
    if (this._closed || !ITEM.test(String(item)) || !Number.isSafeInteger(qty) || qty < 1 || qty > 1000000 || (dir !== 'deposit' && dir !== 'withdraw')) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_bank_move', { p_slot: this.slot, p_item: item, p_qty: qty, p_dir: dir, p_idem: newIdem() }));
  }

  /**
   * Copy THIS character's hunt settings (every action set: bar, stop rules, options)
   * onto another of the account's characters (hr_action_set_copy). The other
   * character's own session re-reads them; nothing changes here.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async copyHuntSettingsTo(toSlot) {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._settled(await this._server.rpc('hr_action_set_copy', { p_from: this.slot, p_to: toSlot, p_idem: newIdem() }));
  }

  /** Leave the hunt (hr_hunt_leave): the server settles and ends it; the re-read shows the summary. */
  async leaveHunt() {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._settled(await this._server.rpc('hr_hunt_leave', { p_slot: this.slot, p_idem: newIdem() }));
  }

  /**
   * Set out on a hunt (hr_hunt_enter): ONE intent. `a` is exactly what the
   * server takes (ground, action set, limits, bag lines of names and counts);
   * the "Hunt again" card sends the ended hunt's own. The party is the server's.
   */
  async huntAgain(a) {
    if (this._closed) return { ok: false, error: 'closed' };
    if (!a || !ITEM.test(String(a.hunt)) || !Number.isInteger(a.preset) || !Array.isArray(a.bag)) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_enter', { p_slot: this.slot, p_hunt: a.hunt, p_bag: a.bag, p_preset: a.preset,
      p_falls: Number.isInteger(a.falls) ? a.falls : null, p_hours: Number.isInteger(a.hours) ? a.hours : null, p_idem: newIdem() }));
  }

  /**
   * An item intent through the engine. The body carries names and counts only
   * (EDGE_INTENTS); the price, the stock and the result are the server's, and
   * the screen changes only from the re-read envelope.
   */
  async edgeIntent(verb, fields) {
    if (this._closed) return { ok: false, error: 'closed' };
    const body = edgeBody(this.slot, verb, fields, newIdem());
    if (!body) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.accrue(body));
  }

  /** Lock (or unlock) an item so no bulk sale can take it; the server keeps the lock. */
  async lockItem(item, locked) {
    if (this._closed || !ITEM.test(String(item))) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_item_lock', { p_slot: this.slot, p_item: item, p_locked: locked === true, p_idem: newIdem() }));
  }

  /** What the server does with this item when a hunt picks it up: keep, sell at the shop, or leave it. */
  async setLootRule(item, rule) {
    if (this._closed || !ITEM.test(String(item)) || !LOOT_RULES.includes(rule)) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_loot_rule_set', { p_slot: this.slot, p_item: item, p_rule: rule, p_idem: newIdem() }));
  }

  /** The remembered restock targets, { item: count } (0 forgets one). Counts only, never a price. */
  async setRestock(targets) {
    if (this._closed || !targets || typeof targets !== 'object') return { ok: false, error: 'bad_intent' };
    const out = {};
    for (const [k, n] of Object.entries(targets)) {
      if (!ITEM.test(k) || !Number.isInteger(n) || n < 0 || n > RESTOCK_MAX) return { ok: false, error: 'bad_intent' };
      out[k] = n;
    }
    if (!Object.keys(out).length || Object.keys(out).length > 32) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_restock_set', { p_slot: this.slot, p_targets: out, p_idem: newIdem() }));
  }

  /**
   * The ONE-TAP REFILL: the server buys up to every restock target at its own
   * prices. `quoted` is the total the player was shown (the server's own
   * quote); the server refuses `quote_changed` rather than charge another sum.
   */
  async refill(quoted) {
    if (this._closed || !Number.isSafeInteger(quoted) || quoted < 0) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_shop_refill', { p_slot: this.slot, p_quote_total: quoted, p_idem: newIdem() }));
  }

  /** Save the current action set, gear and restock targets as a hunt preset (the server snapshots its own state). */
  async savePreset(preset, name) {
    const n = String(name || '').trim().slice(0, 24);
    if (this._closed || !Number.isInteger(preset) || preset < 0 || preset > 7 || !n) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_preset_save', { p_slot: this.slot, p_preset: preset, p_name: n, p_idem: newIdem() }));
  }

  /** Put a saved preset back on: its gear from the bag, its action set and its restock targets. */
  async applyPreset(preset) {
    if (this._closed || !Number.isInteger(preset) || preset < 0 || preset > 7) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_preset_apply', { p_slot: this.slot, p_preset: preset, p_idem: newIdem() }));
  }

  /* ── The party (S1 hr_hunt_party_*; the invite, start and restart verbs are this lane's asks, CONFLICTS.md
     2026-10-18 party UI). Each is one intent naming THIS character's slot and ids or a seat; no user id, no
     number of the server's crosses. The party changes on screen only from the re-read envelope. ── */

  /** Open a party on a hunt (this character takes seat 0 and leads it). */
  async createParty(hunt) {
    if (this._closed || !HUNT_ID.test(String(hunt))) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_party_create', { p_slot: this.slot, p_hunt: hunt, p_idem: newIdem() }));
  }

  /** Take a free seat in an open party (the finder's row, or one of this account's own parties). */
  async joinParty(party) {
    if (this._closed || !UUID.test(String(party))) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_party_join', { p_slot: this.slot, p_party: party, p_idem: newIdem() }));
  }

  /** Leave this character's party (the server hands the lead on, or closes the last seat). */
  async leaveParty() {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._settled(await this._server.rpc('hr_hunt_party_leave', { p_slot: this.slot, p_idem: newIdem() }));
  }

  /** The leader removes the member in a SEAT. */
  async kickSeat(seat) {
    if (this._closed || !Number.isInteger(seat) || seat < 0 || seat > 7) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_party_kick', { p_slot: this.slot, p_seat: seat, p_idem: newIdem() }));
  }

  /** Invite a character by the name players see; the server finds it, or refuses `no_such_name`. */
  async inviteByName(name) {
    const n = String(name || '').trim().slice(0, 40);
    if (this._closed || n.length < 2) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_party_invite', { p_slot: this.slot, p_name: n, p_idem: newIdem() }));
  }

  /** Answer an invite to this character: accept takes the seat, decline forgets it. */
  async answerInvite(invite, accept) {
    if (this._closed || !UUID.test(String(invite))) return { ok: false, error: 'bad_intent' };
    const args = { p_slot: this.slot, p_invite: invite, p_idem: newIdem() };
    return this._settled(await (accept === true ? this._server.rpc('hr_hunt_party_accept', args) : this._server.rpc('hr_hunt_party_decline', args)));
  }

  /** The leader starts the party's hunt: every member enters with its own saved setup, or the server says who is not ready. */
  async startPartyHunt() {
    if (this._closed) return { ok: false, error: 'closed' };
    return this._settled(await this._server.rpc('hr_hunt_party_start', { p_slot: this.slot, p_idem: newIdem() }));
  }

  /** Go back to the hunt that just ended, with the same setup it ran on (the server reads that session's own). */
  async restartHunt(session) {
    if (this._closed || !UUID.test(String(session))) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_hunt_restart', { p_slot: this.slot, p_session: session, p_idem: newIdem() }));
  }

  /* ── Services (lane S2): each sends the QUOTE the player was shown (the server's own price from
     the `stamina_refill` / `blessings` sections); the server refuses `quote_changed` rather than
     charge another sum. Never a price of the client's own. ── */

  /** Buy the next stamina refill at the server's quoted price. */
  async buyStamina(quotedPrice) {
    if (this._closed || !Number.isSafeInteger(quotedPrice) || quotedPrice < 1) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_stamina_refill', { p_slot: this.slot, p_price: quotedPrice, p_idem: newIdem() }));
  }

  /** Buy one blessing tier at the server's quoted price (0 under the free level). */
  async buyBlessing(tier, quotedPrice) {
    if (this._closed || !Number.isInteger(tier) || tier < 1 || tier > 9 || !Number.isSafeInteger(quotedPrice) || quotedPrice < 0) return { ok: false, error: 'bad_intent' };
    return this._settled(await this._server.rpc('hr_blessing_buy', { p_slot: this.slot, p_tier: tier, p_price: quotedPrice, p_idem: newIdem() }));
  }

  /** Claim this character's own name (the server checks the rules and that nobody else has it). */
  async setName(name) {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    if (this._closed || n.length < 3 || n.length > 20) return { ok: false, error: 'bad_name' };
    return this._settled(await this._server.rpc('hr_character_name_set', { p_slot: this.slot, p_name: n, p_idem: newIdem() }));
  }

  /**
   * Wear an outfit (or null: the role's own look) with a dye index per region.
   * ONE intent (hr_outfit_set): the server checks ownership, the regions and the
   * dyes; the window shows the new look only from the re-read envelope.
   */
  async saveOutfit(outfit, colors) {
    if (this._closed) return { ok: false, error: 'closed' };
    if (outfit !== null && !HUNT_ID.test(String(outfit))) return { ok: false, error: 'bad_intent' };
    const c = {};
    for (const [k, v] of Object.entries(colors && typeof colors === 'object' ? colors : {})) {
      if (!/^[a-z]{1,16}$/.test(k) || !Number.isInteger(v) || v < 0 || v > 63) return { ok: false, error: 'bad_intent' };
      c[k] = v;
    }
    return this._settled(await this._server.rpc('hr_outfit_set', { p_slot: this.slot, p_outfit: outfit, p_colors: c, p_idem: newIdem() }));
  }

  /**
   * The party finder: open parties with a free seat, optionally on one hunt and
   * only those with no member of a weapon type ("a party that needs a bow").
   * A READ: the rows are the server's answer, never part of the record.
   */
  async findParties(hunt, weaponType) {
    if (this._closed) return { ok: false, error: 'closed' };
    if ((hunt !== null && !HUNT_ID.test(String(hunt))) || (weaponType !== null && !HUNT_ID.test(String(weaponType)))) return { ok: false, error: 'bad_intent' };
    const ans = await this._server.rpc('hr_hunt_party_finder', { p_slot: this.slot, p_hunt: hunt, p_weapon: weaponType });
    if (this._closed) return { ok: false, error: 'closed' };
    if (ans.ok && ans.body && ans.body.ok === true) return { ok: true, body: ans.body };
    return { ok: false, error: (ans.body && typeof ans.body.error === 'string' && ans.body.error) || ans.error || 'refused' };
  }

  /* An intent's answer: on ok the whole character is re-read, so the screen shows the server's result. */
  async _settled(ans) {
    if (this._closed) return { ok: false, error: 'closed' };
    /* below_range: the server admitted a hunt under its level floor (the floor is a warning, Tyler 10-18). */
    if (ans.ok && ans.body && ans.body.ok === true) { await this.load(); return ans.body.below_range === true ? { ok: true, belowRange: true } : { ok: true }; }
    const b = ans.body && typeof ans.body === 'object' ? ans.body : {};
    /* The server's validation detail (which slot, which condition, which field) goes back to the editor as sent. */
    return { ok: false, error: (typeof b.error === 'string' && b.error) || ans.error || 'refused',
      slot: Number.isInteger(b.slot) ? b.slot : null, condition: Number.isInteger(b.condition) ? b.condition : null,
      field: typeof b.field === 'string' ? b.field.slice(0, 32) : null };
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
