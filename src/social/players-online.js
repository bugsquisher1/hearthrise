// ════════════════════════════════════════════════════════════════════════
// src/social/players-online.js — HOW MANY PLAYERS ARE ONLINE, AS THE SERVER COUNTS.
//
// Tracker r16: a small "N online" counter. One per SocialSession (the account's
// social side), asked on the social poll, so it costs no timer of its own. The
// ask names this account's OPEN character slots; the server stamps those of
// its own characters present and counts the PLAYING CHARACTERS seen recently
// (hr_players_online, 2026-11-07-players-online.sql; Tyler 10-20: one person on
// two characters is 2): a count only, no one's name or id.
//
// The number is the server's, REPLACED by each answer. An answer that fails or
// is malformed shows nothing ("—"), never the last number as if it were still
// true. Nothing can spend it or gate on it.
// ════════════════════════════════════════════════════════════════════════
import { whole } from '../render/format.js?v=0.2.70';

/** The counter's words: "3 online"; "— online" before (or without) a server answer. Pure. */
export function onlineWords(n) {
  return (Number.isSafeInteger(n) && n >= 0 ? whole(n) : '—') + ' online';
}

export class PlayersOnline {
  /**
   * @param {object} o
   * @param {{rpc: Function}} o.server   the account's server link
   * @param {() => number[]} o.slots     the account's open character slots
   * @param {() => void} [o.changed]     told when the count changes
   */
  constructor(o) {
    this._server = o.server;
    this._slots = o.slots;
    this._changed = o.changed || (() => {});
    this._busy = false;
    this._dead = false;
    /** The server's count, or null when there is no fresh answer. */
    this.count = null;
  }

  /** One ask (a second while one is out is dropped: the next poll asks again). */
  async ask() {
    if (this._busy || this._dead) return this.count;
    this._busy = true;
    let n = null;
    try {
      const slots = (this._slots() || []).filter((s) => Number.isInteger(s) && s >= 0 && s <= 32).slice(0, 8);
      const ans = await this._server.rpc('hr_players_online', { p_slots: slots });
      const b = ans && ans.ok ? ans.body : null;
      if (b && b.ok === true && Number.isSafeInteger(b.online) && b.online >= 0) n = b.online;
    } catch (e) { n = null; } finally { this._busy = false; }
    if (this._dead) return null;
    if (n !== this.count) { this.count = n; this._changed(); }
    return n;
  }

  /** No fresh answer this poll (the session's read failed): show nothing rather than the last number. */
  clear() { if (this.count !== null) { this.count = null; this._changed(); } }

  destroy() { this._dead = true; this.count = null; }
}
