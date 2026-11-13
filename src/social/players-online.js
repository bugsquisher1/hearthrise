// ════════════════════════════════════════════════════════════════════════
// src/social/players-online.js — HOW MANY PLAYERS ARE ONLINE, AS THE SERVER COUNTS.
//
// Tracker r16: a small "N online" counter. One per SocialSession (the account's
// social side), answered on the social poll (hr_social_poll, 2027-02-17-social-poll.sql),
// so it costs no timer and no request of its own. The poll names this account's
// OPEN character slots; the server stamps those of its own characters present and
// counts the PLAYING CHARACTERS seen recently (hr_players_online,
// 2026-11-07-players-online.sql; Tyler 10-20: one person on two characters is 2):
// a count only, no one's name or id.
//
// The number is the server's, REPLACED by each answer. An answer that fails or
// is malformed shows nothing ("—"), never the last number as if it were still
// true. Nothing can spend it or gate on it.
// ════════════════════════════════════════════════════════════════════════
import { whole } from '../render/format.js?v=0.2.127';

/** The counter's words: "3 online"; "— online" before (or without) a server answer. Pure. */
export function onlineWords(n) {
  return (Number.isSafeInteger(n) && n >= 0 ? whole(n) : '—') + ' online';
}

export class PlayersOnline {
  /**
   * @param {object} o
   * @param {() => number[]} o.slots     the account's open character slots
   * @param {() => void} [o.changed]     told when the count changes
   */
  constructor(o) {
    this._slots = o.slots;
    this._changed = o.changed || (() => {});
    this._dead = false;
    /** The server's count, or null when there is no fresh answer. */
    this.count = null;
  }

  /** The slots the poll names. */
  slots() { return (this._slots() || []).filter((s) => Number.isInteger(s) && s >= 0 && s <= 32).slice(0, 8); }

  /** The poll's count (null when the server gave none): it replaces the last one; anything but a count shows nothing. */
  take(online) {
    const n = Number.isSafeInteger(online) && online >= 0 ? online : null;
    if (this._dead) return null;
    if (n !== this.count) { this.count = n; this._changed(); }
    return n;
  }

  destroy() { this._dead = true; this.count = null; }
}
