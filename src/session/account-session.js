// ════════════════════════════════════════════════════════════════════════
// src/session/account-session.js — ONE LOGIN, AND THE CHARACTERS IT PLAYS.
//
// An AccountSession is created once per page for the account signed in on it.
// It holds the auth (src/net/auth.js), the tab's own session id, one server
// link (src/session/server.js) carrying the account's token, and the
// CharacterSessions it has open — up to SESSION_CONFIG.maxConcurrentCharacters
// at once, each with its own connection, record and listeners. It never holds
// a "current character": the app chooses which open character a view shows and
// hands that view the CharacterSession itself.
//
//   roster()      which slots this account owns and which hold a character,
//                 read from the server (hr_load per owned slot; `hero_slots`)
//   create(slot)  ask the server to make a character in an empty owned slot
//   open(slot)    a CharacterSession for the slot: loaded, then connected
//   close(slot)   leave and forget one character
//   signOut()     close every character, then auth.signOut() (every copy)
// ════════════════════════════════════════════════════════════════════════

import { SESSION_CONFIG } from './config.js?v=591';
import { CharacterSession } from './character-session.js?v=591';

/** This tab's session id: made once per tab, kept across a reload, new for a new tab. */
export function tabSessionId(tab, cfg = SESSION_CONFIG, make) {
  const have = tab && tab.get(cfg.tabKey);
  if (have) return have;
  const c = globalThis.crypto;
  const id = make ? make() : (c && typeof c.randomUUID === 'function' ? c.randomUUID() : 't' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  if (tab) tab.set(cfg.tabKey, id, { durable: true });
  return id;
}

/** The owned slots an envelope's `hero_slots` names, bounded to the server's range. Pure. */
function ownedSlots(heroSlots, cfg = SESSION_CONFIG) {
  const out = new Set([0]);
  if (Array.isArray(heroSlots)) for (const s of heroSlots) if (Number.isInteger(s) && s >= 0 && s <= cfg.maxSlot) out.add(s);
  return Array.from(out).sort((a, b) => a - b);
}

export class AccountSession {
  /**
   * @param {object} o
   * @param {object} o.auth        createAuth(...) — signed in
   * @param {object} o.server      createServerLink(...) using auth.token
   * @param {object} [o.tab]       the tab store (HearthriseStorage.session)
   * @param {Function} [o.channel] (topic, onMessage, onStatus) => leave
   * @param {object} [o.config]
   * @param {object} [o.timers]    { setTimer, clearTimer } for tests
   */
  constructor(o) {
    this.auth = o.auth;
    this.server = o.server;
    this.config = o.config || SESSION_CONFIG;
    this.tabId = tabSessionId(o.tab, this.config);
    this._channel = o.channel || null;
    this._timers = o.timers || {};
    this._chars = new Map();
    this._listeners = new Set();
    this.closedGame = false;
  }

  get userId() { return this.auth.userId(); }
  /** The open characters, in slot order. */
  characters() { return Array.from(this._chars.values()).sort((a, b) => a.slot - b.slot); }
  character(slot) { return this._chars.get(slot) || null; }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(why, detail) { for (const fn of Array.from(this._listeners)) { try { fn(why, detail); } catch (e) { console.error('[account] a listener failed', e); } } }

  _noteClosed(ans) {
    if (ans && ans.closed && !this.closedGame) { this.closedGame = true; this._emit('closed-game'); }
  }

  /** [{ slot, exists }] for every slot this account owns. */
  async roster() {
    const first = await this.server.rpc('hr_load', { p_slot: 0 });
    this._noteClosed(first);
    if (first.closed) return [];
    const owned = ownedSlots(first.ok && first.body ? first.body.hero_slots : null, this.config);
    const out = [];
    for (const slot of owned) {
      const ans = slot === 0 ? first : await this.server.rpc('hr_load', { p_slot: slot });
      this._noteClosed(ans);
      out.push({ slot, exists: !!(ans.ok && ans.body && ans.body.ok === true) });
    }
    return out;
  }

  /** Ask the server to make the character in an owned slot (idempotent: an existing one answers ok). */
  async create(slot) {
    const ans = await this.server.rpc('hr_create_character', { p_slot: slot });
    this._noteClosed(ans);
    return { ok: !!(ans.ok && ans.body && ans.body.ok === true), reason: (ans.body && ans.body.error) || ans.error || null };
  }

  /** Open (load + connect) one character. { ok, session } or { ok:false, reason }. */
  async open(slot) {
    if (this._chars.has(slot)) return { ok: true, session: this._chars.get(slot) };
    if (this._chars.size >= this.config.maxConcurrentCharacters) return { ok: false, reason: 'limit' };
    const uid = this.userId;
    if (!uid) return { ok: false, reason: 'signed_out' };
    const cs = new CharacterSession({ slot, uid, server: this.server, channel: this._channel,
      setTimer: this._timers.setTimer, clearTimer: this._timers.clearTimer });
    this._chars.set(slot, cs);
    cs.subscribe((s, why) => { if (why === 'closed-game') this._noteClosed({ closed: true }); });
    await cs.load();
    if (cs.status !== 'ready') {
      const reason = cs.status;
      this.close(slot);
      return { ok: false, reason };
    }
    cs.connect();
    this._emit('opened', slot);
    return { ok: true, session: cs };
  }

  close(slot) {
    const cs = this._chars.get(slot);
    if (!cs) return false;
    this._chars.delete(slot);
    cs.close();
    this._emit('closed', slot);
    return true;
  }

  /** Close every character, then forget the login everywhere on this device. */
  async signOut() {
    for (const slot of Array.from(this._chars.keys())) this.close(slot);
    await this.auth.signOut();
    this._emit('signed-out');
    this._listeners.clear();
  }
}
