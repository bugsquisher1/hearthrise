// ════════════════════════════════════════════════════════════════════════
// src/social/chat-store.js — THE ACCOUNT'S CHAT: THE LINES OF EACH TAB, THEIR
// UNREAD COUNTS, AND THE ONE WAY TO SEND.
//
// One ChatStore per AccountSession (owned by its SocialSession). It speaks for
// the VIEWED character: that character's zone and party decide which Local and
// Party lines it hears, and a line it sends is that character's. Both channels
// are the SERVER's (hr_chat_recent answers them); the client only notices that
// the character's hunt or party changed and asks again.
//   lines(tab)    the tab's lines, oldest first (CHAT_LIMITS.linesPerTab kept)
//   unread(tab)   lines that arrived while the tab was not on screen
//   view(tab, on) the window reports what is on screen (on = window open)
//   send(tab, text, links)  ONE hr_chat_send(p_slot, p_kind, p_body); the line
//                 shows when the server answers it, never before
//   draft         what the input holds (display state, survives a tab switch)
//   addLink(id)   put a catalogue item's link into the draft
//   hideFrom(id)  drop a blocked player's lines now (the history reads and the
//                 party / whisper pushes stop at the server; a PUBLIC channel's
//                 pushed line from a blocked player is dropped here, `blocked`)
// Live lines arrive by private broadcast (src/social/realtime.js); every (re)join
// of a topic re-reads the history and ADDS what the socket missed (catch-up), so
// a blip loses nothing and nothing already shown is taken away by it.
// System lines are the server's notices (channel 'system') and the account's
// alerts (src/shell/alerts.js: rare drops, knock-outs, low supplies, ended hunts).
// ════════════════════════════════════════════════════════════════════════
import { CHAT_TABS, CHAT_LIMITS } from '../data/chat-channels.js?v=0.2.43';
import { lineOf, systemLine, tabOfChannel, bodyOf, linkLabel } from './chat-lines.js?v=0.2.43';
import { huntOf } from '../session/hunt-sections.js?v=0.2.43';
import { partyMembershipOf } from '../session/party-sections.js?v=0.2.43';
import { askVia } from '../session/intent-ledger.js?v=0.2.43';

const SERVER_TABS = Object.freeze(['global', 'local', 'party', 'system']);
const SEND_KIND = Object.freeze(Object.fromEntries(CHAT_TABS.filter((t) => t.send).map((t) => [t.id, t.send])));

export class ChatStore {
  /**
   * @param {object} o
   * @param {object} o.account   the AccountSession (its server link, the viewed character)
   * @param {object} [o.realtime] createSocialRealtime(...)
   * @param {() => number} [o.now]
   * @param {(id: string) => boolean} [o.blocked]  has this account blocked that player (the BlockStore)?
   * @param {(fn: Function, ms: number) => any} [o.later]  the catch-up's coalescing timer
   */
  constructor(o) {
    this._account = o.account;
    this._rt = o.realtime || null;
    this._now = o.now || (() => Date.now());
    this._blocked = o.blocked || (() => false);
    this._later = o.later || ((fn, ms) => setTimeout(fn, ms));
    this._catch = { soon: false, busy: false, again: false };
    this._dead = false;
    this._lines = new Map(CHAT_TABS.map((t) => [t.id, []]));
    this._ids = new Set();
    this._unread = new Map();
    this._listeners = new Set();
    this._leave = null;
    this._key = null;
    this._offChar = null;
    this._offAlerts = null;
    this._alertSeen = new Set();
    this._screen = { tab: 'global', open: false, at: 0 };
    this.zone = null;
    this.party = null;
    this.draft = { text: '', links: [], rev: 0 };
    this.loading = false;
    this._offAccount = null;
  }

  /** Start following the viewed character (its history, then its channels). Idempotent. */
  start() {
    if (this._offAccount) return;
    this._offAccount = this._account.subscribe((why) => { if (why === 'viewed' || why === 'opened' || why === 'closed') this._follow(); });
    this._follow();
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _changed() { for (const fn of Array.from(this._listeners)) { try { fn(); } catch (e) { console.error('[chat] a listener failed', e); } } }

  /** The character this store speaks for: the viewed one. */
  character() { const a = this._account; return a.viewed === null ? null : a.character(a.viewed); }

  lines(tab) { return this._lines.get(tab) || []; }
  unread(tab) { return this._unread.get(tab) || 0; }
  /** Is a tab shown right now (the Party tab only while in a party)? */
  shows(tab) { const row = CHAT_TABS.find((t) => t.id === tab); return !!row && (row.needs !== 'party' || !!this.party); }

  /* The window says what it shows on every paint (4 Hz); a report older than a second means it closed. */
  view(tab, open) {
    this._screen = { tab, open: !!open, at: this._now() };
    if (open && this._unread.get(tab)) { this._unread.delete(tab); this._changed(); }
  }
  _onScreen(tab) { const s = this._screen; return s.open && s.tab === tab && this._now() - s.at < 1000; }

  /* The key that says the server's channels may have moved: the viewed character, its hunt, its party. */
  _keyOf(cs) {
    if (!cs) return null;
    const h = huntOf(cs);
    const p = partyMembershipOf(cs);
    return cs.slot + '|' + (h && !h.ended ? h.huntId : 'town') + '|' + (p ? p.id : '');
  }

  _follow() {
    const cs = this.character();
    if (this._offChar) { this._offChar(); this._offChar = null; }
    if (cs) this._offChar = cs.subscribe(() => { if (this._keyOf(cs) !== this._key) this.refresh(); });
    if (this._keyOf(cs) !== this._key) this.refresh();
  }

  /** Read the history and the channels from the server, then listen to exactly those channels. */
  async refresh() {
    const cs = this.character();
    this._key = this._keyOf(cs);
    if (!cs) return false;
    const key = this._key;
    this.loading = true;
    this._changed();
    const ans = await this._account.server.rpc('hr_chat_recent', { p_slot: cs.slot });
    if (key !== this._key) return false;
    this.loading = false;
    const b = ans.body;
    if (!ans.ok || !b || b.ok !== true || !Array.isArray(b.lines)) { this._changed(); return false; }
    this.zone = typeof b.zone === 'string' ? b.zone : null;
    this.party = typeof b.party === 'string' ? b.party : null;
    for (const tab of SERVER_TABS) {
      const keep = tab === 'system' ? this.lines(tab).filter((l) => l.system) : [];
      for (const l of this.lines(tab)) if (!keep.includes(l)) this._ids.delete(l.id);
      this._lines.set(tab, keep);
    }
    for (const row of b.lines) this._take(row, false);
    for (const tab of SERVER_TABS) this.lines(tab).sort((x, y) => x.at - y.at);
    this._listen();
    this._changed();
    return true;
  }

  _listen() {
    if (this._leave) { this._leave(); this._leave = null; }
    if (!this._rt) return;
    const channels = ['global', 'system', this.zone, this.party].filter(Boolean);
    this._leave = this._rt.chat(this._account.userId, channels, (row) => { if (this._take(row, true)) this._changed(); },
      () => this._catchUpSoon());
  }

  /* A topic (re)joined: re-read the history once the joins of a burst have landed (CHAT_LIMITS.catchUpMs) and ADD
     the lines the socket missed, as the news they are (unread off screen). One read at a time; a join while one is
     out asks for one more. Never re-joins. */
  _catchUpSoon() {
    if (this._catch.soon) return;
    this._catch.soon = true;
    this._later(() => { this._catch.soon = false; this._catchUp(); }, CHAT_LIMITS.catchUpMs);
  }

  async _catchUp() {
    const c = this._catch;
    if (this._dead) return;
    if (c.busy) { c.again = true; return; }
    const cs = this.character();
    if (!cs) return;
    const key = this._key;
    c.busy = true;
    try {
      const ans = await this._account.server.rpc('hr_chat_recent', { p_slot: cs.slot });
      const b = ans && ans.body;
      if (key === this._key && ans.ok && b && b.ok === true && Array.isArray(b.lines)) {
        let any = false;
        for (const row of b.lines) if (this._take(row, true)) any = true;
        if (any) { for (const tab of SERVER_TABS) this.lines(tab).sort((x, y) => x.at - y.at); this._changed(); }
      }
    } catch (e) { /* the next join asks again */ } finally {
      c.busy = false;
      if (c.again) { c.again = false; this._catchUp(); }
    }
  }

  /* One server row into its tab. Returns true when a line was added (or a held one renamed). A pushed line from a
     player this account blocked is dropped (a public topic reaches every socket; the server filters the reads and the
     private pushes). A row already held only takes its speaker's name: hr_chat_row renders the hero's CURRENT name,
     so a rename reaches the lines on screen at the next read. */
  _take(row, live) {
    const l = lineOf(row);
    if (!l) return false;
    if (this._ids.has(l.id)) return this._rename(l);
    if (live && l.fromId && this._blocked(l.fromId)) return false;
    const tab = tabOfChannel(l.channel, this.zone, this.party);
    if (!tab) return false;
    this._push(tab, l, live);
    return true;
  }

  _rename(l) {
    const tab = l.system ? null : tabOfChannel(l.channel, this.zone, this.party);
    const held = tab ? this.lines(tab).find((x) => x.id === l.id) : null;
    if (!held || held.name === l.name) return false;
    held.name = l.name;
    return true;
  }

  _push(tab, l, live) {
    const list = this._lines.get(tab);
    this._ids.add(l.id);
    list.push(l);
    while (list.length > CHAT_LIMITS.linesPerTab) this._ids.delete(list.shift().id);
    if (live && !this._onScreen(tab)) this._unread.set(tab, this.unread(tab) + 1);
  }

  /** The alerts become System lines as they fire (each alert id once). */
  followAlerts(alerts) {
    if (this._offAlerts) this._offAlerts();
    const take = () => {
      let any = false;
      for (const a of alerts.list().slice().reverse()) {
        if (this._alertSeen.has(a.id)) continue;
        this._alertSeen.add(a.id);
        this._push('system', systemLine('alert:' + a.id, a.text, this._now()), true);
        any = true;
      }
      if (any) this._changed();
    };
    this._offAlerts = alerts.subscribe(take);
    take();
  }

  /** Put a catalogue item's link into the draft (from the bag's "Link in chat"). */
  addLink(id) {
    if (this.draft.links.length >= CHAT_LIMITS.linksMax) return false;
    const label = linkLabel(id);
    const sep = this.draft.text && !/\s$/.test(this.draft.text) ? ' ' : '';
    this.draft = { text: (this.draft.text + sep + label + ' ').slice(0, CHAT_LIMITS.bodyMax), links: this.draft.links.concat(id), rev: this.draft.rev + 1 };
    this._changed();
    return true;
  }

  setDraft(text) { this.draft = { text: String(text || '').slice(0, CHAT_LIMITS.bodyMax), links: this.draft.links, rev: this.draft.rev }; }

  /**
   * Send the draft to a tab's channel. Resolves { ok } or { ok:false, error }.
   * The line is shown from the server's answer (its name, level and role are the server's).
   */
  async send(tab, text, links) {
    const kind = SEND_KIND[tab];
    const cs = this.character();
    if (!kind) return { ok: false, error: 'read_only' };
    if (!cs) return { ok: false, error: 'no_character' };
    const body = bodyOf(text, links);
    if (!body) return { ok: false, error: 'empty' };
    if (body.length > CHAT_LIMITS.bodyMax) return { ok: false, error: 'too_long' };
    const ans = await askVia(this._account, 'chat_send', () => this._account.server.rpc('hr_chat_send', { p_slot: cs.slot, p_kind: kind, p_body: body }));
    const b = ans.body;
    if (!ans.ok || !b || b.ok !== true) return { ok: false, error: (b && typeof b.error === 'string' && b.error) || ans.error || 'refused' };
    this.draft = { text: '', links: [], rev: this.draft.rev + 1 };
    if (this._take(b.line, false)) this._changed();
    return { ok: true };
  }

  /** A player was blocked: their lines leave every tab now. */
  hideFrom(userId) {
    let any = false;
    for (const [tab, list] of this._lines) {
      const kept = list.filter((l) => l.fromId !== userId);
      if (kept.length !== list.length) { any = true; this._lines.set(tab, kept); }
    }
    if (any) this._changed();
  }

  destroy() {
    this._dead = true;
    if (this._leave) this._leave();
    if (this._offChar) this._offChar();
    if (this._offAlerts) this._offAlerts();
    if (this._offAccount) this._offAccount();
    this._listeners.clear();
  }
}
