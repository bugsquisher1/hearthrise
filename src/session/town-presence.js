// ════════════════════════════════════════════════════════════════════════
// src/session/town-presence.js — WHO ELSE STANDS IN YOUR TOWN, AND WHERE.
//
// One TownPresence per open character, owned by its AccountSession
// (account.townOf(slot)), destroyed when the character closes. The World pane
// tells it which town map the character's scene shows (show(map), null for the
// home, a hunt or a closed pane) and where the hero stands (publish), and reads
// the people back (walkers()). Nothing here is a global, and nothing here is a
// number anyone can spend: a position is display presence.
//
// THE SERVER DECIDES WHO IS THERE (supabase/migrations/2026-10-25-town-walk.sql):
//   hr_town_move     this character's OWN tile, goal tile and facing — at most
//                    one per TOWN_PRESENCE.publishMinMs, re-sent every
//                    keepaliveMs standing (also while the page is hidden), and
//                    one leave (null map) on show(null) or destroy().
//   hr_town_walkers  every pollMs while a town is shown: the people there as the
//                    server names them (id, slot, name, level, role, outfit,
//                    tiles, facing). Self, quiet characters, hunters and blocks either
//                    way are the server's to remove; a block made on this device
//                    hides that player here at once too (`hidden`).
// The list is REPLACED by each answer, never merged; an answer older than
// staleMs shows nobody rather than people who may have left.
// ════════════════════════════════════════════════════════════════════════
import { TOWN_PRESENCE, TOWN_DIRS } from '../data/town-presence.js?v=0.2.15';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAP_ID = /^[a-z0-9_]{1,40}$/;
const ROLE = /^[a-z_]{1,32}$/;
const OUTFIT = /^[a-z0-9_]{1,32}$/;
const tile = (v) => Number.isInteger(v) && v >= 0 && v <= 255;

/** One walker as the server sent it, validated, or null. Pure. */
export function walkerOf(w) {
  if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !UUID.test(w.id)) return null;
  if (typeof w.name !== 'string' || !w.name.trim() || ![w.x, w.y, w.gx, w.gy].every(tile) || !TOWN_DIRS.includes(w.dir)) return null;
  return Object.freeze({
    id: w.id.toLowerCase(), slot: Number.isInteger(w.slot) ? w.slot : null, name: w.name.slice(0, 24),
    level: Number.isInteger(w.level) && w.level >= 0 ? w.level : null,
    role: typeof w.role === 'string' && ROLE.test(w.role) ? w.role : null,
    /* the outfit its character chose (player_outfits via hr_town_walkers), or null: the role's then */
    outfit: w.outfit && typeof w.outfit === 'object' && typeof w.outfit.id === 'string' && OUTFIT.test(w.outfit.id) ? w.outfit.id : null,
    x: w.x, y: w.y, gx: w.gx, gy: w.gy, dir: w.dir,
  });
}

/** The position a publish names, validated, or null. Pure. */
function placeOf(p) {
  if (!p || typeof p.map !== 'string' || !MAP_ID.test(p.map)) return null;
  const r = (v) => Math.round(Number(v));
  const at = [r(p.x), r(p.y), r(p.gx), r(p.gy)];
  if (!at.every(tile) || !TOWN_DIRS.includes(p.dir)) return null;
  return { map: p.map, x: at[0], y: at[1], gx: at[2], gy: at[3], dir: p.dir };
}
const samePlace = (a, b) => !!a && !!b && a.map === b.map && a.x === b.x && a.y === b.y && a.gx === b.gx && a.gy === b.gy && a.dir === b.dir;

export class TownPresence {
  /**
   * @param {object} o
   * @param {{rpc: Function}} o.server   the account's server link
   * @param {number} o.slot              the character this presence speaks for
   * @param {() => string|null} o.self   this account's id (never drawn as a walker)
   * @param {(id: string) => boolean} [o.hidden]  a player this account has blocked
   * @param {{setTimer?: Function, clearTimer?: Function}} [o.timers]  interval timers (tests)
   * @param {() => number} [o.now]       ms clock
   * @param {object} [o.limits]          TOWN_PRESENCE
   */
  constructor(o) {
    this._server = o.server;
    this._slot = o.slot;
    this._self = o.self || (() => null);
    this._hidden = o.hidden || (() => false);
    this._set = (o.timers && o.timers.setTimer) || ((fn, ms) => setInterval(fn, ms));
    this._clear = (o.timers && o.timers.clearTimer) || ((h) => clearInterval(h));
    this._now = o.now || (() => Date.now());
    this.limits = o.limits || TOWN_PRESENCE;
    this._map = null;
    this._timer = null;
    this._walkers = [];
    this._readAt = null;
    this._reading = false;
    this._sent = null;       // the last place the server took
    this._sentAt = -Infinity;
    this._want = null;       // the latest place the World reported
    this._sending = false;
    this._out = false;       // the server holds a body for this character
    this._listeners = new Set();
    this._dead = false;
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _changed() { for (const fn of Array.from(this._listeners)) { try { fn(); } catch (e) { console.error('[town] a listener failed', e); } } }

  /** The town map on screen for this character, or null (home, hunt, pane closed): null leaves town. */
  show(map) {
    const m = typeof map === 'string' && MAP_ID.test(map) ? map : null;
    if (m === this._map || this._dead) return;
    this._map = m;
    this._walkers = []; this._readAt = null; this._want = null;
    if (this._timer !== null) { this._clear(this._timer); this._timer = null; }
    if (m) {
      this._timer = this._set(() => this._tick(), this.limits.pollMs);
      this.read();
    } else {
      this._leave();
    }
    this._changed();
  }

  /** Where the hero stands now ({map, x, y, gx, gy, dir}); sent when it changed, at most once per publishMinMs. */
  publish(p) {
    const place = placeOf(p);
    if (!place || place.map !== this._map || this._dead) return false;
    this._want = place;
    return this._flush(false);
  }

  _flush(keepalive) {
    const p = this._want;
    if (!p || this._sending || !this._map) return false;
    const now = this._now();
    const since = now - this._sentAt;
    if (since < this.limits.publishMinMs) return false;
    if (samePlace(p, this._sent) && !(keepalive || since >= this.limits.keepaliveMs)) return false;
    this._sending = true;
    this._sentAt = now;
    this._server.rpc('hr_town_move', { p_slot: this._slot, p_map: p.map, p_x: p.x, p_y: p.y, p_gx: p.gx, p_gy: p.gy, p_dir: p.dir })
      .then((ans) => {
        const b = ans && ans.body;
        if (!ans || !ans.ok || !b || b.ok !== true || b.off) return;
        this._out = true;
        /* left town (or closed) while this was in flight: the body it placed goes too */
        if (this._dead || this._map !== p.map) this._leave(); else this._sent = p;
      }, () => {})
      .finally(() => { this._sending = false; });
    return true;
  }

  _tick() {
    if (this._want && this._now() - this._sentAt >= this.limits.keepaliveMs) this._flush(true);
    this.read();
  }

  /** One hr_town_walkers read for the shown map; the list is replaced by the answer. */
  async read() {
    const map = this._map;
    if (!map || this._reading || this._dead) return false;
    this._reading = true;
    let ans;
    try { ans = await this._server.rpc('hr_town_walkers', { p_map: map }); } finally { this._reading = false; }
    if (map !== this._map || this._dead) return false;
    const b = ans && ans.body;
    if (!ans || !ans.ok || !b || b.ok !== true) return false;
    const self = (this._self() || '').toLowerCase();
    const seen = new Set();
    const list = [];
    for (const raw of Array.isArray(b.walkers) ? b.walkers : []) {
      const w = walkerOf(raw);
      /* Only THIS character is not a walker: the viewer's other characters are people in town too
         (Tyler 2026-10-19), so a walker is its user AND its slot. */
      if (!w) continue;
      const key = w.id + ':' + w.slot;
      if ((w.id === self && w.slot === this._slot) || seen.has(key)) continue;
      seen.add(key);
      list.push(w);
      if (list.length >= this.limits.cap) break;
    }
    this._walkers = b.off ? [] : list;
    this._readAt = this._now();
    this._changed();
    return true;
  }

  /** The people in town now, as the server last said (none when that is older than staleMs). */
  walkers() {
    if (!this._map || this._readAt === null || this._now() - this._readAt > this.limits.staleMs) return [];
    return this._walkers.filter((w) => !this._hidden(w.id));
  }

  /** The town map this presence is on, or null. */
  map() { return this._map; }

  _leave() {
    this._want = null;
    if (!this._out) return;
    this._out = false; this._sent = null; this._sentAt = -Infinity;
    this._server.rpc('hr_town_move', { p_slot: this._slot, p_map: null, p_x: null, p_y: null, p_gx: null, p_gy: null, p_dir: null }).catch(() => {});
  }

  /** Leave town and stop: the character closed or the account signed out. */
  destroy() {
    if (this._dead) return;
    if (this._timer !== null) this._clear(this._timer);
    this._timer = null;
    this._leave();
    this._dead = true;
    this._map = null;
    this._walkers = [];
    this._listeners.clear();
  }
}
