// ════════════════════════════════════════════════════════════════════════
// src/social/whispers.js — PRIVATE CONVERSATIONS: ONE PER OTHER PLAYER.
//
// One WhisperStore per AccountSession (owned by its SocialSession). A
// conversation is keyed by the other player's user id and becomes a chat tab
// ('w:<id>', src/data/chat-channels.js WHISPER) while it is open.
//   conversations()       the open ones, oldest first: [{ tab, id, name, unread }]
//   open(id, name)        start or show one (the right-click menu's "Message")
//   close(tab)            put one away (its lines stay until the page reloads)
//   lines(tab)            its lines, oldest first
//   send(tab, text, links) ONE hr_whisper_send(p_slot, p_target, p_body); the
//                         server refuses across a block, either way, as
//                         `unavailable` (it never says who blocked whom)
//   load()                hr_whispers_recent once, on sign-in
// Incoming whispers arrive pushed to this account's private inbox topic
// (src/social/realtime.js); every (re)join of it re-reads hr_whispers_recent and
// ADDS what the socket missed, so a blip loses nothing.
// ════════════════════════════════════════════════════════════════════════
import { WHISPER, CHAT_LIMITS } from '../data/chat-channels.js?v=0.2.75';
import { lineOf, bodyOf } from './chat-lines.js?v=0.2.75';
import { askVia } from '../session/intent-ledger.js?v=0.2.75';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const whisperTab = (id) => WHISPER.prefix + id;
export const isWhisperTab = (tab) => typeof tab === 'string' && tab.startsWith(WHISPER.prefix);

export class WhisperStore {
  /**
   * @param {object} o
   * @param {object} o.account    the AccountSession
   * @param {object} [o.realtime] createSocialRealtime(...)
   * @param {() => number} [o.now]
   */
  constructor(o) {
    this._account = o.account;
    this._rt = o.realtime || null;
    this._now = o.now || (() => Date.now());
    this._convs = new Map();      // other id -> { id, name, lines, unread, open, last }
    this._ids = new Set();
    this._listeners = new Set();
    this._screen = { tab: null, open: false, at: 0 };
    this._leave = null;
    this._me = null;
    this._busy = false; this._again = false; this._dead = false;
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _changed() { for (const fn of Array.from(this._listeners)) { try { fn(); } catch (e) { console.error('[whispers] a listener failed', e); } } }

  /** Read the recent whispers and start hearing new ones (once per sign-in). */
  async load() {
    const me = this._account.userId;
    if (!me || this._me === me) return false;
    this._me = me;
    if (this._rt) this._leave = this._rt.whispers(me, (row) => { if (this._take(row, true)) this._changed(); }, () => this._catchUp());
    return this._read(true);
  }

  /* The recent whispers, ADDED to what is held (a line already held is skipped by id). `told`: tell the
     listeners even when nothing was added (the sign-in read). `live`: the lines are news the socket missed
     (a catch-up after a join), so one to this account opens its conversation as a pushed one does. */
  async _read(told, live) {
    const ans = await this._account.server.rpc('hr_whispers_recent', {});
    const b = ans.body;
    if (!ans.ok || !b || b.ok !== true || !Array.isArray(b.lines)) return false;
    let any = false;
    for (const row of b.lines) if (this._take(row, live === true)) any = true;
    if (any || told) this._changed();
    return true;
  }

  /* The inbox (re)joined: one re-read at a time; a join while one is out asks for one more. */
  async _catchUp() {
    if (this._dead) return;
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try { await this._read(false, true); } catch (e) { /* the next join asks again */ } finally {
      this._busy = false;
      if (this._again) { this._again = false; this._catchUp(); }
    }
  }

  _conv(id, name) {
    let c = this._convs.get(id);
    if (!c) { c = { id, name: name || 'Adventurer', lines: [], unread: 0, open: false, last: 0 }; this._convs.set(id, c); }
    else if (name) c.name = name;
    return c;
  }

  /* A whisper row into its conversation (the other player is whoever is not me). A row already held only refreshes
     its names (the server renders each hero's CURRENT name, 2027-01-17), so a rename reaches it at the next read. */
  _take(row, live) {
    const l = lineOf(row);
    if (!l || !l.toId) return false;
    if (this._ids.has(l.id)) return this._rename(l);
    const mine = l.fromId === this._me;
    const other = mine ? l.toId : l.fromId;
    if (!other) return false;
    const c = this._conv(other, mine ? l.toName : l.name);
    this._ids.add(l.id);
    c.lines.push(l);
    c.lines.sort((x, y) => x.at - y.at);
    while (c.lines.length > CHAT_LIMITS.linesPerTab) this._ids.delete(c.lines.shift().id);
    c.last = Math.max(c.last, l.at);
    if (live && !mine) {
      c.open = true;
      const s = this._screen;
      if (!(s.open && s.tab === whisperTab(other) && this._now() - s.at < 1000)) c.unread++;
    }
    this._trim();
    return true;
  }

  _rename(l) {
    const mine = l.fromId === this._me;
    const c = this._convs.get(mine ? l.toId : l.fromId);
    const held = c && c.lines.find((x) => x.id === l.id);
    if (!held || (held.name === l.name && held.toName === l.toName)) return false;
    held.name = l.name;
    held.toName = l.toName;
    const last = c.lines[c.lines.length - 1];
    if (last === held) c.name = mine ? l.toName : l.name;
    return true;
  }

  /* At most CHAT_LIMITS.whisperTabsMax open: the quietest read one closes first. */
  _trim() {
    const open = Array.from(this._convs.values()).filter((c) => c.open);
    open.sort((a, b) => a.last - b.last);
    while (open.length > CHAT_LIMITS.whisperTabsMax) {
      const i = open.findIndex((c) => !c.unread);
      open.splice(i < 0 ? 0 : i, 1)[0].open = false;
    }
  }

  conversations() {
    return Array.from(this._convs.values()).filter((c) => c.open).sort((a, b) => a.last - b.last)
      .map((c) => ({ tab: whisperTab(c.id), id: c.id, name: c.name, unread: c.unread }));
  }

  lines(tab) { const c = this._convs.get(String(tab).slice(WHISPER.prefix.length)); return c ? c.lines : []; }
  nameOf(tab) { const c = this._convs.get(String(tab).slice(WHISPER.prefix.length)); return c ? c.name : null; }

  /** Start (or show) a conversation with a player. Returns its tab, or null for a bad id. */
  open(id, name) {
    if (typeof id !== 'string' || !UUID.test(id) || id === this._me) return null;
    const c = this._conv(id, name);
    c.open = true;
    c.last = c.last || Date.now();
    this._trim();
    this._changed();
    return whisperTab(id);
  }

  close(tab) {
    const c = this._convs.get(String(tab).slice(WHISPER.prefix.length));
    if (!c || !c.open) return false;
    c.open = false;
    c.unread = 0;
    this._changed();
    return true;
  }

  /* The window reports what it shows on every paint; a report older than a second means it closed. */
  view(tab, open) {
    this._screen = { tab, open: !!open, at: this._now() };
    const c = open && isWhisperTab(tab) ? this._convs.get(tab.slice(WHISPER.prefix.length)) : null;
    if (c && c.unread) { c.unread = 0; this._changed(); }
  }

  async send(tab, text, links) {
    const id = String(tab).slice(WHISPER.prefix.length);
    const a = this._account;
    const cs = a.viewed === null ? null : a.character(a.viewed);
    if (!UUID.test(id)) return { ok: false, error: 'no_player' };
    if (!cs) return { ok: false, error: 'no_character' };
    const body = bodyOf(text, links);
    if (!body) return { ok: false, error: 'empty' };
    if (body.length > CHAT_LIMITS.bodyMax) return { ok: false, error: 'too_long' };
    const ans = await askVia(a, 'whisper_send', () => a.server.rpc('hr_whisper_send', { p_slot: cs.slot, p_target: id, p_body: body }));
    const b = ans.body;
    if (!ans.ok || !b || b.ok !== true) return { ok: false, error: (b && typeof b.error === 'string' && b.error) || ans.error || 'refused' };
    if (this._take(b.line, false)) this._changed();
    return { ok: true };
  }

  /** A player was blocked: their conversation closes and its lines go. */
  hideFrom(id) {
    const c = this._convs.get(id);
    if (!c) return;
    for (const l of c.lines) this._ids.delete(l.id);
    this._convs.delete(id);
    this._changed();
  }

  destroy() { this._dead = true; if (this._leave) this._leave(); this._listeners.clear(); }
}
