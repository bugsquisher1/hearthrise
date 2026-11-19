// ════════════════════════════════════════════════════════════════════════
// src/social/players-online.js — HOW MANY PLAYERS ARE ONLINE, AS THE SERVER COUNTS, AND WHAT THEY ARE DOING.
//
// Tracker r16, widened by Tyler 2026-11-18 ("for the sake of transparency"): ONE number, every hero playing in a browser
// now PLUS every hero still active on the server with the game closed (each character once), and on hover its lines by
// activity. One per SocialSession (the account's social side), answered on the social poll (hr_social_poll), so it costs no
// timer and no request of its own. The poll names this account's OPEN character slots (the server stamps those of its own
// characters present); the count itself is the world tick's, once a fire, read by the poll as one row
// (2027-05-05-players-online-by-activity.sql): `online` the total, `online_by` its seven lines, which add up to it.
// A count only, no one's name or id.
//
// Both are the server's, REPLACED together by each answer. An answer that fails, is stale or is malformed (lines that are
// not the seven whole numbers adding up to the total) shows nothing ("—" and no lines), never the last numbers as if they
// were still true. Nothing can spend them or gate on them.
// ════════════════════════════════════════════════════════════════════════
import { whole } from '../render/format.js?v=0.2.141';
import { t } from '../render/player-text.js?v=0.2.141';

/** The server's lines, in the order the hover lists them (each a row hud.online_<id>). */
const ONLINE_LINES = Object.freeze(['hunting', 'tower', 'gathering', 'crafting', 'training', 'hearth', 'town']);

const count = (n) => Number.isSafeInteger(n) && n >= 0;

/** The counter's words: "14 online"; "— online" before (or without) a server answer. Pure. */
export function onlineWords(n) {
  return count(n) ? t('hud.online_n', { n: whole(n) }) : t('hud.online_none');
}

/** The hover's lines, [{ id, text: "Hunting 3" }], in ONLINE_LINES order; a line at 0 is left out; none without a breakdown. Pure. */
export function onlineLines(by) {
  if (!by) return [];
  return ONLINE_LINES.filter((id) => by[id] > 0).map((id) => ({ id, text: t('hud.online_' + id, { n: whole(by[id]) }) }));
}

/** The server's answer as one reading: { n, by } when the total and the seven lines are whole numbers that add up, else null. Pure. */
function readOnline(online, by) {
  if (!count(online) || !by || typeof by !== 'object' || Array.isArray(by)) return null;
  let sum = 0;
  const lines = {};
  for (const id of ONLINE_LINES) {
    if (!count(by[id])) return null;
    lines[id] = by[id];
    sum += by[id];
  }
  return sum === online ? { n: online, by: Object.freeze(lines) } : null;
}

export class PlayersOnline {
  /**
   * @param {object} o
   * @param {() => number[]} o.slots     the account's open character slots
   * @param {() => void} [o.changed]     told when the count or its lines change
   */
  constructor(o) {
    this._slots = o.slots;
    this._changed = o.changed || (() => {});
    this._dead = false;
    /** The server's total, or null when there is no fresh answer. */
    this.count = null;
    /** The server's lines by activity ({ hunting, tower, ... }), or null with the count. */
    this.by = null;
  }

  /** The slots the poll names. */
  slots() { return (this._slots() || []).filter((s) => Number.isInteger(s) && s >= 0 && s <= 32).slice(0, 8); }

  /** The poll's total and lines (null when the server gave none): they replace the last ones together; anything else shows nothing. */
  take(online, by) {
    if (this._dead) return null;
    const r = readOnline(online, by);
    const n = r ? r.n : null, lines = r ? r.by : null;
    if (n !== this.count || JSON.stringify(lines) !== JSON.stringify(this.by)) { this.count = n; this.by = lines; this._changed(); }
    return n;
  }

  destroy() { this._dead = true; this.count = null; this.by = null; }
}
