// ════════════════════════════════════════════════════════════════════════
// src/session/account-session.js — ONE LOGIN, AND THE CHARACTERS IT PLAYS.
//
// An AccountSession is created once per page for the account signed in on it.
// It holds the auth (src/net/auth.js), the tab's own session id, one server
// link (src/session/server.js) carrying the account's token, and the
// CharacterSessions it has open — up to the SERVER's concurrent limit at once
// (`account.max_concurrent` in any envelope it has read; until the server has
// stated it, one), never above SESSION_CONFIG.maxConcurrentCharacters (the
// tab's own ceiling on connections), each with its own connection, record and
// listeners. `viewed` is the slot the screen shows: a VIEW pointer, never a
// "current player" — switching it touches no CharacterSession, so the others
// keep their records, topics and timers and keep playing on the server.
//
//   roster()      which slots this account owns and which hold a character
//                 (its name and combat level), read from the server (hr_load
//                 per owned slot; `hero_slots`: slot 0 and the starter slots
//                 every account owns, plus any bought)
//   create(slot)  ask the server to make a character in an empty owned slot
//   open(slot)    a CharacterSession for the slot: loaded, then connected
//   close(slot)   leave and forget one character
//   view(slot)    show another open character (viewed); nothing else moves
//   limit()       how many may play at once, as the server says
//   findItems(q)  where an item is across this account's characters
//                 (hr_account_items: bag, bank and worn, read by the server)
//   signOut()     close every character, then auth.signOut() (every copy)
//   social        the account's chat, whispers, friends and blocks: what the
//                 `social` factory made for it (src/social/social-session.js,
//                 handed in by src/app/boot.js), started once a character is
//                 open, ended on sign-out
//   townOf(slot)  that character's TownPresence (src/session/town-presence.js):
//                 who else stands in its town and where, made when it opens,
//                 left and destroyed when it closes
// ════════════════════════════════════════════════════════════════════════

import { SESSION_CONFIG } from './config.js?v=0.2.10';
import { CharacterSession } from './character-session.js?v=0.2.10';
import { TownPresence } from './town-presence.js?v=0.2.10';
import { charLevelFromXp } from '../core/xp.js?v=0.2.10';

/** This tab's session id: made once per tab, kept across a reload, new for a new tab. */
export function tabSessionId(tab, cfg = SESSION_CONFIG, make) {
  const have = tab && tab.get(cfg.tabKey);
  if (have) return have;
  const c = globalThis.crypto;
  const id = make ? make() : (c && typeof c.randomUUID === 'function' ? c.randomUUID() : 't' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  if (tab) tab.set(cfg.tabKey, id, { durable: true });
  return id;
}

/** `account.max_concurrent`, the server's concurrent-play limit, from one read key, or null when unstated. Pure. */
export function accountLimitOf(read) {
  const a = read('account');
  return a && typeof a === 'object' && Number.isInteger(a.max_concurrent) && a.max_concurrent >= 1 && a.max_concurrent <= 8 ? a.max_concurrent : null;
}

/** A roster row's hero, from one hr_load answer: its name and Level (the server's state.level_xp on the
    shared curve, CORE_MODEL.md §1), or nulls. Pure. */
export function heroOf(body) {
  if (!body || body.ok !== true) return { name: null, level: null };
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : null;
  const lx = body.state && typeof body.state === 'object' ? body.state.level_xp : null;
  return { name, level: Number.isSafeInteger(lx) && lx >= 0 ? charLevelFromXp(lx) : null };
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
   * @param {object} [o.timers]    { setTimer, clearTimer, setInterval, clearInterval } for tests
   * @param {(account: AccountSession) => object} [o.social]  makes this account's social side
   */
  constructor(o) {
    this.auth = o.auth;
    this.server = o.server;
    this.config = o.config || SESSION_CONFIG;
    this.tabId = tabSessionId(o.tab, this.config);
    this._channel = o.channel || null;
    this._timers = o.timers || {};
    this._chars = new Map();
    this._towns = new Map();
    this._listeners = new Set();
    this.closedGame = false;
    this._limit = null;
    this.viewed = null;
    this.social = o.social ? o.social(this) : null;
  }

  get userId() { return this.auth.userId(); }
  /** The open characters, in slot order. */
  characters() { return Array.from(this._chars.values()).sort((a, b) => a.slot - b.slot); }
  character(slot) { return this._chars.get(slot) || null; }
  /** The open character's TownPresence, or null. */
  townOf(slot) { return this._towns.get(slot) || null; }

  /**
   * How many characters may play at once: the server's `account.max_concurrent`
   * (the last one read, from the roster or any open character), capped by the
   * tab's own ceiling. Until the server has said, ONE: a client number never
   * unlocks a second connection (CLAUDE.md §6, residue-ahead).
   */
  limit() {
    for (const cs of this._chars.values()) { const n = accountLimitOf((k) => cs.read(k)); if (n !== null) this._limit = n; }
    return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this._limit);
  }

  /** Show another open character. Only the pointer moves; every CharacterSession is left exactly as it was. */
  view(slot) {
    if (!this._chars.has(slot) || this.viewed === slot) return this.viewed === slot;
    this.viewed = slot;
    this._emit('viewed', slot);
    return true;
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(why, detail) { for (const fn of Array.from(this._listeners)) { try { fn(why, detail); } catch (e) { console.error('[account] a listener failed', e); } } }

  _noteClosed(ans) {
    if (ans && ans.closed && !this.closedGame) { this.closedGame = true; this._emit('closed-game'); }
  }

  /** [{ slot, exists, name, level }] for every slot this account owns. */
  async roster() {
    const first = await this.server.rpc('hr_load', { p_slot: 0 });
    this._noteClosed(first);
    if (first.closed) return [];
    const stated = accountLimitOf((k) => (first.ok && first.body ? first.body[k] : undefined));
    if (stated !== null) this._limit = stated;
    const owned = ownedSlots(first.ok && first.body ? first.body.hero_slots : null, this.config);
    const out = [];
    for (const slot of owned) {
      const ans = slot === 0 ? first : await this.server.rpc('hr_load', { p_slot: slot });
      this._noteClosed(ans);
      out.push(Object.assign({ slot, exists: !!(ans.ok && ans.body && ans.body.ok === true) }, heroOf(ans.ok ? ans.body : null)));
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
    if (this._chars.size >= this.limit()) return { ok: false, reason: 'limit', limit: this.limit() };
    const uid = this.userId;
    if (!uid) return { ok: false, reason: 'signed_out' };
    const cs = new CharacterSession({ slot, uid, server: this.server, channel: this._channel,
      setTimer: this._timers.setTimer, clearTimer: this._timers.clearTimer });
    this._chars.set(slot, cs);
    cs.subscribe((s, why) => { if (why === 'closed-game') this._noteClosed({ closed: true }); });
    this._emit('opening', slot);   // watchers (the alerts) hear the first load's events too
    await cs.load();
    if (cs.status !== 'ready') {
      const reason = cs.status;
      this.close(slot);
      return { ok: false, reason };
    }
    cs.connect();
    this._towns.set(slot, new TownPresence({ server: this.server, slot, self: () => this.userId,
      hidden: (id) => !!(this.social && this.social.blocks && this.social.blocks.has(id)),
      timers: this._timers.setInterval ? { setTimer: this._timers.setInterval, clearTimer: this._timers.clearInterval } : null }));
    if (this.viewed === null) this.viewed = slot;
    this._emit('opened', slot);
    if (this.social) this.social.start();
    return { ok: true, session: cs };
  }

  /**
   * Where items matching `query` are, across every character of this account,
   * as the server reads them: [{ slot, name, item, qty, where }]. A read, never
   * a write; an unknown answer is an empty list with `error` set.
   */
  async findItems(query) {
    const q = String(query || '').trim().toLowerCase().slice(0, 40);
    if (q.length < 2) return { ok: true, rows: [] };
    const ans = await this.server.rpc('hr_account_items', { p_query: q });
    this._noteClosed(ans);
    const b = ans.body;
    if (!ans.ok || !b || b.ok !== true || !Array.isArray(b.rows)) return { ok: false, rows: [], error: (b && b.error) || ans.error || 'refused' };
    const rows = [];
    for (const r of b.rows.slice(0, 200)) {
      if (!r || !Number.isInteger(r.slot) || typeof r.item !== 'string' || !/^[a-z0-9_]{1,64}$/.test(r.item)) continue;
      if (!Number.isSafeInteger(r.qty) || r.qty < 1 || !['bag', 'bank', 'worn'].includes(r.where)) continue;
      rows.push({ slot: r.slot, name: typeof r.name === 'string' ? r.name.slice(0, 40) : null, item: r.item, qty: r.qty, where: r.where });
    }
    return { ok: true, rows };
  }

  close(slot) {
    const cs = this._chars.get(slot);
    if (!cs) return false;
    this._chars.delete(slot);
    const town = this._towns.get(slot);
    if (town) { this._towns.delete(slot); town.destroy(); }
    cs.close();
    if (this.viewed === slot) this.viewed = this._chars.size ? this.characters()[0].slot : null;
    this._emit('closed', slot);
    return true;
  }

  /** Close every character, then forget the login everywhere on this device. */
  async signOut() {
    for (const slot of Array.from(this._chars.keys())) this.close(slot);
    if (this.social) { this.social.destroy(); this.social = null; }
    await this.auth.signOut();
    this._emit('signed-out');
    this._listeners.clear();
  }
}
