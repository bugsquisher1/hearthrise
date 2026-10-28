// ════════════════════════════════════════════════════════════════════════
// src/social/social-session.js — ONE ACCOUNT'S SOCIAL SIDE: CHAT, WHISPERS,
// FRIENDS, BLOCKS AND INSPECT, OWNED BY ITS AccountSession.
//
// The AccountSession makes one (src/session/account-session.js, `social`) when
// it is given the realtime seam, and destroys it on sign-out. Nothing here is a
// global: every window reads it through ctx.account.social.
//   chat        ChatStore (src/social/chat-store.js)
//   whispers    WhisperStore (src/social/whispers.js)
//   friends     FriendStore (src/social/friends.js)
//   blocks      BlockStore (src/social/blocks.js)
//   start()     the first reads, then hr_social_state every CHAT_LIMITS.friendsPollMs
//               (the friends' online state, and this account's presence stamp),
//               each followed by the players-online count
//   online      PlayersOnline (src/social/players-online.js): the server's count
//               of characters playing (it stamps this account's open ones)
//   inspect(t)  hr_inspect for a target; the answer is `inspected` until the next
//   menuProviders()  this system's right-click entries (src/data/social-menu.js
//               rows), for the shell's one context menu
//   want(tab)   ask the chat window to show a tab (a new whisper)
// ════════════════════════════════════════════════════════════════════════
import { CHAT_LIMITS } from '../data/chat-channels.js?v=0.2.59';
import { ChatStore } from './chat-store.js?v=0.2.59';
import { WhisperStore } from './whispers.js?v=0.2.59';
import { FriendStore } from './friends.js?v=0.2.59';
import { BlockStore } from './blocks.js?v=0.2.59';
import { inspectOf } from './inspect.js?v=0.2.59';
import { PlayersOnline } from './players-online.js?v=0.2.59';

export class SocialSession {
  /**
   * @param {object} o
   * @param {object} o.account    the AccountSession
   * @param {object} [o.realtime] createSocialRealtime(...) (src/social/realtime.js)
   * @param {{setTimer?: Function, clearTimer?: Function, later?: Function}} [o.timers]  `later`: the chat's catch-up timer
   */
  constructor(o) {
    this._account = o.account;
    this._timers = o.timers || {};
    this._listeners = new Set();
    this._poll = null;
    this.inspected = null;
    this.wanted = null;
    const reread = () => this.reread();
    /* A public topic's pushed line from a player this account blocked is dropped by the chat (realtime.js). */
    this.chat = new ChatStore({ account: o.account, realtime: o.realtime, later: this._timers.later,
      blocked: (id) => !!this.blocks && this.blocks.has(id) });
    this.whispers = new WhisperStore({ account: o.account, realtime: o.realtime });
    this.friends = new FriendStore({ account: o.account, reread });
    this.blocks = new BlockStore({ account: o.account, reread,
      onBlocked: (id) => { this.chat.hideFrom(id); this.whispers.hideFrom(id); } });
    this._offs = [this.chat.subscribe(() => this._changed()), this.whispers.subscribe(() => this._changed())];
    /* The server's count of characters playing, asked on each social poll for the account's open slots (players-online.js). */
    this.online = new PlayersOnline({ server: o.account.server, changed: () => this._changed(),
      slots: () => (typeof o.account.characters === 'function' ? o.account.characters().map((cs) => cs.slot) : []) });
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _changed() { for (const fn of Array.from(this._listeners)) { try { fn(); } catch (e) { console.error('[social] a listener failed', e); } } }

  /** The account's open characters' slot this account speaks for (the viewed one). */
  _slot() { const v = this._account.viewed; return Number.isInteger(v) ? v : null; }

  /** The first reads once a character is open, then the friends poll. */
  start() {
    if (this._poll !== null) return;
    const set = this._timers.setTimer || ((fn, ms) => setInterval(fn, ms));
    this._poll = set(() => { this._presence(); }, CHAT_LIMITS.friendsPollMs);
    this.chat.start();
    this.whispers.load();
    this._presence();
  }

  /* One social poll: the friends read (the account's presence for its friends), then the online count
     (which stamps the open characters present). One after the other, never a burst of two, and the count
     only when the read answered: a session the server refused (signed out, offline) sends one call a poll,
     never two (client-boot B-10), and shows no count. */
  async _presence() {
    let read = false;
    try { read = await this.reread(); } catch (e) { read = false; }
    if (!read) { this.online.clear(); return null; }
    return this.online.ask();
  }

  /** hr_social_state: friends, requests and blocks, replaced whole. */
  async reread() {
    const slot = this._slot();
    if (slot === null) return false;
    const ans = await this._account.server.rpc('hr_social_state', { p_slot: slot });
    const b = ans.body;
    if (!ans.ok || !b || b.ok !== true) return false;
    this.friends.apply(b);
    this.blocks.apply(b.blocks);
    this._changed();
    return true;
  }

  async inspect(target) {
    this.inspected = { pending: true, name: target.name || null };
    this._changed();
    const r = await inspectOf(this._account.server, target.id || target.name, target.slot);
    this.inspected = r.ok ? r.view : { error: r.error, name: target.name || null };
    this._changed();
    return r;
  }

  want(tab) { this.wanted = tab; this._changed(); }

  /** Is a target this account? */
  isSelf(t) { return !!t && !!t.id && t.id === this._account.userId; }

  /**
   * This system's right-click entries, by MENU_ENTRIES id. `ui` is the menu's
   * { open(windowId) } so an entry can show a window; nothing here draws.
   */
  menuProviders() {
    const other = (t) => t.kind === 'player' && !!t.id && !this.isSelf(t);
    return {
      inspect: { inspect: { when: (t) => t.kind === 'player' && !!(t.id || t.name), run: (t, ui) => { ui.open('inspect'); return this.inspect(t); } } },
      whispers: { message: { when: (t) => other(t) && !this.blocks.has(t.id), run: (t, ui) => {
        const tab = this.whispers.open(t.id, t.name);
        if (tab) { this.want(tab); ui.open('chat'); }
      } } },
      friends: {
        'friend-add': { when: (t) => other(t) && this.friends.read && !this.friends.isFriend(t.id) && !this.friends.asked(t.id) && !this.blocks.has(t.id),
          run: (t) => this.friends.request(t.id) },
        'friend-remove': { when: (t) => other(t) && (this.friends.isFriend(t.id) || this.friends.asked(t.id)), run: (t) => this.friends.remove(t.id) },
      },
      blocks: {
        block: { when: (t) => other(t) && !this.blocks.has(t.id), run: (t) => this.blocks.set(t.id, true) },
        unblock: { when: (t) => other(t) && this.blocks.has(t.id), run: (t) => this.blocks.set(t.id, false) },
      },
    };
  }

  destroy() {
    const clear = this._timers.clearTimer || ((h) => clearInterval(h));
    if (this._poll !== null) clear(this._poll);
    this._poll = null;
    for (const off of this._offs) off();
    this.online.destroy();
    this.chat.destroy();
    this.whispers.destroy();
    this._listeners.clear();
  }
}
