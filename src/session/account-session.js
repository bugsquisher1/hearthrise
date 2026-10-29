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
//   slotOffer     the next hero slot the server sells this account ({ slotId, cost,
//                 max }, from the envelope's `account.hero_slot_offer`), null at the
//                 cap or before the roster has read it
//   buySlot(slotId, slot)  ONE intent (hr_buy_hero_slot): buy that slot with the ACCOUNT's
//                 gold (one purse, 2026-12-15-account-gold.sql); `slot` is the acting hero the
//                 journal names. The server prices, checks and debits
//   purse()       the account's gold as the newest answer any open hero read says it
//                 ({ gold, v }: state.gold at wallet version state.gold_v), or null; a newer
//                 one re-renders every other open hero (CharacterSession.notePurse)
//   create(slot, name, colors)  ask the server to make the hero in an owned slot:
//                 ONE intent (hr_create_hero) with its name and four dye indices;
//                 a slot holding an unnamed character (roster `unnamed`) is named by it
//   open(slot)    a CharacterSession for the slot: loaded, then connected
//   close(slot)   leave and forget one character
//   view(slot)    show another open character (viewed): only it streams live; it asks one settle, the one left goes quiet
//   limit()       how many may play at once, as the server says
//   findItems(q)  where an item is across this account's characters
//                 (hr_account_items: bags and worn sets by character, and the
//                 account's one storage, slot null; read by the server)
//   signOut()     close every character, then auth.signOut() (every copy)
//   social        the account's chat, whispers, friends and blocks: what the
//                 `social` factory made for it (src/social/social-session.js,
//                 handed in by src/app/boot.js), started once a character is
//                 open, ended on sign-out
//   townOf(slot)  that character's TownPresence (src/session/town-presence.js):
//                 who else stands in its town and where, made when it opens,
//                 left and destroyed when it closes
// ════════════════════════════════════════════════════════════════════════

import { SESSION_CONFIG } from './config.js?v=0.2.67';
import { CharacterSession } from './character-session.js?v=0.2.67';
import { TownPresence } from './town-presence.js?v=0.2.67';
import { SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.67';
import { charLevelFromXp } from '../core/xp.js?v=0.2.67';
import { createIntentLedger } from './intent-ledger.js?v=0.2.67';
import { purseOf, newerPurse, storageOf } from './item-sections.js?v=0.2.67';

/* What the account's characters share: the depot (2026-11-27-account-depot.sql) and the
   farm land (2026-12-14-shared-farm.sql). A change to one re-reads the others. */
const SHARED_KINDS = new Set(['farm']);   // 'bank' (the depot) is read through _noteStorage, not re-read

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

/** A roster row's hero, from one hr_load answer: its name, Level (the server's state.level_xp on the
    shared curve, CORE_MODEL.md §1) and the ACCOUNT purse it read (state.gold at version state.gold_v:
    the same gold on every hero), or nulls. Pure. */
export function heroOf(body) {
  if (!body || body.ok !== true) return { name: null, level: null, gold: null, goldV: null };
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : null;
  const st = body.state && typeof body.state === 'object' ? body.state : {};
  const lx = st.level_xp;
  return { name, level: Number.isSafeInteger(lx) && lx >= 0 ? charLevelFromXp(lx) : null,
    gold: Number.isSafeInteger(st.gold) && st.gold >= 0 ? st.gold : null,
    goldV: Number.isSafeInteger(st.gold_v) && st.gold_v >= 0 ? st.gold_v : null };
}

/** The next hero slot the server sells, from an `account` section: { slotId, cost, max }, or null
    (at the cap, or unstated: no offer is ever made up on this side). Pure. */
export function slotOfferOf(account, cfg = SESSION_CONFIG) {
  const o = account && typeof account === 'object' ? account.hero_slot_offer : null;
  if (!o || typeof o !== 'object' || !Number.isInteger(o.slot_id) || o.slot_id < 1 || o.slot_id > cfg.maxSlot
    || !Number.isSafeInteger(o.cost_gold) || o.cost_gold < 1) return null;
  const max = Number.isInteger(account.hero_slots_max) && account.hero_slots_max > o.slot_id ? account.hero_slots_max : null;
  return { slotId: o.slot_id, cost: o.cost_gold, max };
}

function newIdem() {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

/** Does a `hunt` section say the server holds a hunt OPEN? The section names the newest session
    even after it ended (hr_hunt_section_view: `ended: true`), so its presence alone is not hunting:
    a hero back from a hunt stands in town again. Pure. */
function huntOpenIn(h) {
  return !!h && typeof h === 'object' && typeof h.session_id === 'string' && h.ended !== true;
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
   * @param {object} o.server      createServerLink(...) using auth.freshToken / auth.renewToken
   * @param {object} [o.tab]       the tab store (HearthriseStorage.session)
   * @param {Function} [o.channel] (topic, onMessage, onStatus) => leave
   * @param {object} [o.config]
   * @param {object} [o.timers]    { setTimer, clearTimer, setInterval, clearInterval } for tests
   * @param {(account: AccountSession) => object} [o.social]  makes this account's social side
   */
  constructor(o) {
    this.auth = o.auth;
    this.server = o.server;
    /** The asks in flight (intent-ledger.js): the server link's, shared with every CharacterSession. */
    this.intents = (o.server && o.server.intents) || createIntentLedger();
    this.config = o.config || SESSION_CONFIG;
    this.tabId = tabSessionId(o.tab, this.config);
    this._channel = o.channel || null;
    this._timers = o.timers || {};
    this._chars = new Map();
    this._towns = new Map();
    this._listeners = new Set();
    this.closedGame = false;
    this._limit = null;
    this._roster = null;
    this.slotOffer = null;
    this.viewed = null;
    this._purse = null;
    this._storage = null;   // { at, bank, depot }: the newest account Storage any open hero read (item-sections.js storageOf)
    this._seenBanks = new WeakSet();   // the envelopes' `bank` objects already noted (a re-render brings no new one)
    this.social = o.social ? o.social(this) : null;
  }

  /** The account's gold, { gold, v }: the newest purse any open hero has read, or null. */
  purse() { return this._purse; }

  /* A hero's answer stated the purse: keep it if it is newer (raise-only), and let every OTHER open hero
     re-render with it (their own envelopes still hold the older copy until their next answer). */
  _notePurse(cs) {
    const next = newerPurse(this._purse, purseOf(cs));
    /* Raise-only by VERSION, never by identity: two heroes re-rendering each other stop at once. */
    if (!next || (this._purse && next.v <= this._purse.v)) return;
    this._purse = next;
    for (const other of this._chars.values()) if (other !== cs && typeof other.notePurse === 'function') other.notePurse();
  }

  /* A hero's NEW answer (a `bank` this account has not seen: each envelope brings its own copy) stated the Storage at
     the server instant of the last one or later: keep it, and let every OTHER open hero re-render with it (a skill on
     one hero spends what another's window shows). Never rolled back to an earlier instant; a re-render is no answer. */
  _noteStorage(cs) {
    const next = storageOf(cs);
    if (!next || this._seenBanks.has(next.bank)) return;
    this._seenBanks.add(next.bank);
    if (this._storage && next.at < this._storage.at) return;
    this._storage = next;
    for (const other of this._chars.values()) if (other !== cs && typeof other.noteStorage === 'function') other.noteStorage();
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

  /** The server's own play-at-once limit as last read (roster or any open character), or null until it has said:
      words that state it (the coach's "up to N at once") never fall back to a client number. */
  statedLimit() { this.limit(); return this._limit; }

  /** The roster rows as the server last read them (roster(): every owned slot, with or without a hero), or null
      before the first read. A copy: the coach's facts (src/shell/launcher.js coachFactsOf) read it. */
  lastRoster() { return this._roster ? this._roster.map((r) => Object.assign({}, r)) : null; }

  /** Show another open character. Only the pointer moves; every CharacterSession is left exactly as it was. */
  view(slot) {
    if (!this._chars.has(slot) || this.viewed === slot) return this.viewed === slot;
    const was = this._chars.get(this.viewed);
    this.viewed = slot;
    /* the one left goes quiet (no live view, a plain read a minute); the one shown asks ONE settle at once */
    if (was) was.setViewed(false);
    this._chars.get(slot).setViewed(true);
    this._emit('viewed', slot);
    return true;
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(why, detail) { for (const fn of Array.from(this._listeners)) { try { fn(why, detail); } catch (e) { console.error('[account] a listener failed', e); } } }

  _noteClosed(ans) {
    if (ans && ans.closed && !this.closedGame) { this.closedGame = true; this._emit('closed-game'); }
  }

  /** [{ slot, exists, unnamed, name, level }] for every slot this account owns. `unnamed`: the server
      holds a character there that may not enter the world until it is named (hr_load needs_name).
      Slot 0's read names the owned slots; the others are then read AT ONCE, so the screen waits two
      round trips whatever the hero count (one after another, four heroes cost four: 1.19 s on 10-23). */
  async roster() {
    const first = await this.server.rpc('hr_load', { p_slot: 0 });
    this._noteClosed(first);
    if (first.closed) return [];
    const stated = accountLimitOf((k) => (first.ok && first.body ? first.body[k] : undefined));
    if (stated !== null) this._limit = stated;
    this.slotOffer = slotOfferOf(first.ok && first.body ? first.body.account : null, this.config);
    const owned = ownedSlots(first.ok && first.body ? first.body.hero_slots : null, this.config);
    const answers = await Promise.all(owned.map((slot) => (slot === 0 ? first : this.server.rpc('hr_load', { p_slot: slot }))));
    const rows = owned.map((slot, i) => {
      const ans = answers[i];
      this._noteClosed(ans);
      return Object.assign({ slot, exists: !!(ans.ok && ans.body && ans.body.ok === true),
        unnamed: !!(ans.ok && ans.body && ans.body.error === 'needs_name') }, heroOf(ans.ok ? ans.body : null));
    });
    this._roster = rows;
    return rows;
  }

  /** A player's problem report, through the bug-report bridge (it names the reporter from the token,
      stores and rate-limits). { ok, status, retryAfterS }: the bridge's word ('accepted', 'stored',
      'duplicate', 'rate_limited', 'unauthenticated', ...) or the link's ('network', 'no_token'). Moves nothing. */
  async reportProblem(body) {
    const ans = await this.server.report(body);
    const b = ans.body && typeof ans.body === 'object' ? ans.body : {};
    return { ok: !!(ans.ok && b.ok === true), status: typeof b.status === 'string' ? b.status : ans.error || 'network',
      retryAfterS: Number.isFinite(b.retry_after_s) ? b.retry_after_s : null };
  }

  /** Ask the server to make the hero in an owned slot with its name and colours ({ head, body, legs, feet }
      dye indices). { ok } or { ok:false, reason, nameReason }: the server's verdict, never the client's. */
  create(slot, name, colors) {
    return this.intents.track('create_hero', async () => {
      const ans = await this.server.rpc('hr_create_hero', { p_slot: slot, p_name: String(name || '').slice(0, 40), p_colors: colors, p_idem: newIdem() });
      this._noteClosed(ans);
      const b = ans.body;
      const ok = !!(ans.ok && b && b.ok === true);
      return { ok, error: ok ? null : (b && b.error) || ans.error || 'refused', reason: (b && b.error) || ans.error || null, nameReason: (b && b.reason) || null };
    });
  }

  /**
   * Buy hero slot `slotId` with the ACCOUNT's gold: ONE intent with its own key, an ask in the intent
   * ledger; the server owns the price, the ladder, the cap and the debit. `paySlot` is the acting hero
   * (the journal's provenance), never a choice of whose gold. On a yes that hero, if open, is re-read:
   * its answer carries the new purse, which every other open hero then shows.
   * { ok } or { ok:false, error, reason, shortBy }.
   */
  buySlot(slotId, paySlot) {
    if (!Number.isInteger(slotId) || slotId < 1 || slotId > this.config.maxSlot
      || !Number.isInteger(paySlot) || paySlot < 0 || paySlot > this.config.maxSlot) return Promise.resolve({ ok: false, error: 'bad_intent', reason: 'bad_intent', shortBy: null });
    return this.intents.track('buy_hero_slot', async () => {
      const ans = await this.server.rpc('hr_buy_hero_slot', { p_slot_id: slotId, p_slot: paySlot, p_idem: newIdem() });
      this._noteClosed(ans);
      const b = ans.body;
      const ok = !!(ans.ok && b && b.ok === true);
      if (ok) {
        this.slotOffer = slotOfferOf(b, this.config);
        const cs = this._chars.get(paySlot);
        if (cs) await cs.load();
      }
      const reason = ok ? null : (b && b.error) || ans.error || 'refused';
      return { ok, error: reason, reason, shortBy: !ok && b && Number.isSafeInteger(b.short_by) ? b.short_by : null };
    });
  }

  /** Open (load + connect) one character. { ok, session } or { ok:false, reason }. The press that asked
      for it waits on the whole open (an ask in the intent ledger). */
  open(slot) { return this.intents.track('open_character', () => this._open(slot)); }

  async _open(slot) {
    if (this._chars.has(slot)) return { ok: true, session: this._chars.get(slot) };
    if (this._chars.size >= this.limit()) return { ok: false, reason: 'limit', limit: this.limit() };
    const uid = this.userId;
    if (!uid) return { ok: false, reason: 'signed_out' };
    const cs = new CharacterSession({ slot, uid, server: this.server, intents: this.intents, channel: this._channel,
      setTimer: this._timers.setTimer, clearTimer: this._timers.clearTimer, now: this._timers.now, viewed: this.viewed === null || this.viewed === slot });
    /* The storage is the ACCOUNT's (2026-11-27-account-depot.sql): a move on one character re-reads the others. */
    cs.onShared = (kind, from) => this._sharedChanged(kind, from);
    /* The gold is the ACCOUNT's (2026-12-15-account-gold.sql): every hero reads the newest purse any of them has seen. */
    cs.accountPurse = () => this._purse;
    cs.subscribe((s) => this._notePurse(s));
    /* ...and so is the Storage: every hero reads the newest copy any of them was told (item-sections.js bankOf). */
    cs.accountStorage = () => this._storage;
    cs.subscribe((s) => this._noteStorage(s));
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
    /* Playing = standing in town for everyone (Tyler 2026-10-19), viewed or not: a body from the
       moment it opens (a reload or login too), on the stand the SERVER gives it (its activity's
       station, else the town's idle place; 2027-01-28-town-stands.sql), while it is not hunting. */
    this._towns.set(slot, new TownPresence({ server: this.server, slot, self: () => this.userId,
      hidden: (id) => !!(this.social && this.social.blocks && this.social.blocks.has(id)),
      busy: () => huntOpenIn(cs.read('hunt')), town: SCENE_MAPS.town,
      timers: this._timers.setInterval ? { setTimer: this._timers.setInterval, clearTimer: this._timers.clearInterval } : null }));
    this._towns.get(slot).stand();
    if (this.viewed === null) this.viewed = slot;
    cs.setViewed(this.viewed === slot);   // only the viewed character streams live (CLAUDE.md §6)
    this._emit('opened', slot);
    if (this.social) this.social.start();
    return { ok: true, session: cs };
  }

  /**
   * Open the account's other characters (`slots`, the roster's existing ones) up to the server's
   * limit, never changing the viewed one: everyone the account plays stands in town after a
   * reload or login, not only the one on screen. They open AT ONCE (each its own load), so the
   * last one stands in town one round trip after the first, not one per hero. Returns the slots now open.
   */
  async openOthers(slots) {
    const want = Array.from(new Set((Array.isArray(slots) ? slots : []).filter((s) => Number.isInteger(s) && !this._chars.has(s))));
    /* each _open takes its seat (or answers 'limit', sending nothing) before its first await, in slot-list
       order, so the limit holds however many start together */
    await Promise.all(want.map((slot) => this._open(slot)));
    return this.characters().map((c) => c.slot);
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
      if (!r || typeof r.item !== 'string' || !/^[a-z0-9_]{1,64}$/.test(r.item)) continue;
      if (!Number.isSafeInteger(r.qty) || r.qty < 1 || !['bag', 'bank', 'worn'].includes(r.where)) continue;
      /* The storage is the ACCOUNT's: its rows carry no slot (and no name); a bag or worn row names its character. */
      if (r.where === 'bank' ? r.slot !== null : !Number.isInteger(r.slot)) continue;
      rows.push({ slot: r.slot, name: r.where !== 'bank' && typeof r.name === 'string' ? r.name.slice(0, 40) : null, item: r.item, qty: r.qty, where: r.where });
    }
    return { ok: true, rows };
  }

  /* ACCOUNT state one character changed: no screen keeps a storage or a field the server no longer holds (CLAUDE.md §6).
     The depot ('bank') needs no read: the mover's own re-read is the newest Storage, which every hero shows
     (_noteStorage); a re-read per hero per move went over hr_load's budget (Andy, 2026-10-26). The farm land ('farm')
     is in each hero's envelope only: every OTHER open character re-reads (single-flight, read-gate.js). */
  _sharedChanged(kind, from) {
    if (!SHARED_KINDS.has(kind)) return;
    for (const [slot, cs] of this._chars) if (slot !== from) cs.load();
  }

  close(slot) {
    const cs = this._chars.get(slot);
    if (!cs) return false;
    this._chars.delete(slot);
    const town = this._towns.get(slot);
    if (town) { this._towns.delete(slot); town.destroy(); }
    cs.close();
    if (this.viewed === slot) { this.viewed = this._chars.size ? this.characters()[0].slot : null; if (this.viewed !== null) this._chars.get(this.viewed).setViewed(true); }
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
