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
// THE SERVER DECIDES WHO IS THERE, AND WHERE EVERY BODY STANDS
// (supabase/migrations/2027-01-28-town-stands.sql): each body holds a STAND the
// server picked from its activity (a station per activity, src/data/world/
// stations.js), so no two bodies share one and an unviewed hero stands at its
// work, never at the gate. This presence never names a tile the server did not
// give it or its player did not walk to:
//   hr_town_view   every pollMs while a town is DRAWN: the people in this
//                  character's town instance and around its view (the `area`
//                  the server answers), as the server names them (id, slot, name,
//                  level, role, outfit, tiles, facing, station, work), and `me`,
//                  this character's own stand. With the last answer's `cursor`
//                  it answers only what CHANGED (upserted here) and who is
//                  `gone` (dropped here); a `full` answer REPLACES the list (one
//                  at least every fullEveryMs, and whenever the server says).
//                  Self, quiet characters, hunters and blocks either way are the
//                  server's to remove; a block made on this device hides that
//                  player here at once too (`hidden`).
//   hr_town_move   this character's OWN steered tile, goal tile and facing — at
//                  most one per publishMinMs, re-sent every keepaliveMs standing,
//                  and one leave (null map) on show(null) or destroy(). Nothing
//                  is published before the server's stand is known (`me`): the
//                  hero starts there, never on a tile of the client's choosing.
//   hr_town_here   a PARKED character (not on screen, still in town) is present:
//                  every parkedKeepaliveMs, no tile; the answer is its stand.
//   hr_town_go     send the body to a counter or back to its work (go(station)).
// An answer older than staleMs shows nobody rather than people who may have left.
// WHERE THE BODY STANDS (placeOn) is where the World last walked it (a pane shown
// again starts its hero there: a switch is not a move), else the server's stand.
// When the server moves the stand (a new activity, back from a hunt, a counter)
// the World walks the hero there from where it is (me(), display only).
// ════════════════════════════════════════════════════════════════════════
import { TOWN_PRESENCE, TOWN_DIRS } from '../data/town-presence.js?v=0.2.48';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAP_ID = /^[a-z0-9_]{1,40}$/;
const STATION = /^[a-z0-9_]{1,40}$/;
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
    /* the outfit its character chose (player_outfits via hr_town_view), or null: the role's then */
    outfit: w.outfit && typeof w.outfit === 'object' && typeof w.outfit.id === 'string' && OUTFIT.test(w.outfit.id) ? w.outfit.id : null,
    x: w.x, y: w.y, gx: w.gx, gy: w.gy, dir: w.dir,
    /* the station its stand is at and whether it works there (its pose: lane L3) */
    station: typeof w.station === 'string' && STATION.test(w.station) ? w.station : null, work: w.work === true,
  });
}

/** This character's own stand as the server holds it (hr_town_view / hr_town_here `me`), validated, or null. Pure. */
function standOf(m) {
  if (!m || typeof m !== 'object' || typeof m.map !== 'string' || !MAP_ID.test(m.map)) return null;
  if (![m.x, m.y, m.gx, m.gy].every(tile) || !TOWN_DIRS.includes(m.dir) || !Array.isArray(m.at) || m.at.length !== 2 || !m.at.every(tile)) return null;
  if (typeof m.station !== 'string' || !STATION.test(m.station) || !Number.isInteger(m.stand)) return null;
  return Object.freeze({ map: m.map, x: m.x, y: m.y, gx: m.gx, gy: m.gy, dir: m.dir, at: Object.freeze([m.at[0], m.at[1]]),
    station: m.station, stand: m.stand, work: m.work === true, since: Number.isFinite(m.since_ms) ? m.since_ms : 0 });
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
const standKey = (s) => (s ? s.map + ':' + s.station + ':' + s.stand + ':' + s.since : null);
const keyOf = (w) => w.id + ':' + w.slot;

export class TownPresence {
  /**
   * @param {object} o
   * @param {{rpc: Function}} o.server   the account's server link
   * @param {number} o.slot              the character this presence speaks for
   * @param {() => string|null} o.self   this account's id (never drawn as a walker)
   * @param {(id: string) => boolean} [o.hidden]  a player this account has blocked
   * @param {() => boolean} [o.busy]     this character is out hunting (a parked body leaves town)
   * @param {string} [o.town]            the town map an unviewed body stands in (the server picks its stand)
   * @param {{setTimer?: Function, clearTimer?: Function}} [o.timers]  interval timers (tests)
   * @param {() => number} [o.now]       ms clock
   * @param {object} [o.limits]          TOWN_PRESENCE
   */
  constructor(o) {
    this._server = o.server;
    this._slot = o.slot;
    this._self = o.self || (() => null);
    this._hidden = o.hidden || (() => false);
    this._busy = o.busy || (() => false);
    this._set = (o.timers && o.timers.setTimer) || ((fn, ms) => setInterval(fn, ms));
    this._clear = (o.timers && o.timers.clearTimer) || ((h) => clearInterval(h));
    this._now = o.now || (() => Date.now());
    this.limits = o.limits || TOWN_PRESENCE;
    this._town = typeof o.town === 'string' && MAP_ID.test(o.town) ? o.town : null;
    this._map = null;
    this._timer = null;
    this._known = new Map();  // the people as the server's answers built them (key: user and slot)
    this._walkers = [];
    this._readAt = null;
    this._cursor = null;      // the last answer's server time: the next read asks only for what changed since
    this._fullAt = -Infinity; // the last whole answer
    this._readCenter = null;  // the window centre the last answer was read around
    this._center = null;      // where the hero stands now (the next read's window centre)
    this._reading = null; this._next = null;   // the read in flight, and the one asked while it is out
    this._me = null;          // this character's own stand, as the server last said
    this._sent = null;        // the last place the server took
    this._sentAt = -Infinity;
    this._want = null;        // the latest place the World reported
    this._sending = false;
    this._out = false;        // the server holds a body for this character
    this._listeners = new Set();
    this._dead = false;
    this._parked = false;     // not on screen, still standing in town (another character is viewed)
    this._hereAt = -Infinity; // the last parked keepalive
    this._drawnAt = -Infinity;            // the last frame that asked for the people (walkers())
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _changed() { for (const fn of Array.from(this._listeners)) { try { fn(); } catch (e) { console.error('[town] a listener failed', e); } } }

  /** The town map on screen for this character, or null (home, hunt, pane closed): null leaves town. */
  show(map) {
    const m = typeof map === 'string' && MAP_ID.test(map) ? map : null;
    if (this._dead) return;
    if (m === this._map) {
      /* viewed again in the town it stands in: read the people again */
      if (m && this._parked) { this._parked = false; this.read(); this._changed(); }
      return;
    }
    this._parked = false;
    this._map = m;
    this._known = new Map(); this._walkers = []; this._readAt = null; this._cursor = null; this._readCenter = null; this._want = null;
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
    this._center = [place.x, place.y];
    /* NOTHING BEFORE THE SERVER'S STAND: until it is known the hero has not been placed, and where the World
       shows it is the client's guess (the map's start), never a tile to tell anyone */
    if (!this.me()) return false;
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

  /**
   * The World stopped showing this character (another one is viewed) while it stands in town:
   * it STAYS there for everyone (Tyler 2026-10-19), so its body keeps its keepalive (hr_town_here)
   * and only the reads stop. It leaves when it starts a hunt (busy) or closes (destroy).
   */
  park() {
    if (this._dead || this._parked) return;
    /* viewed while out of town (a hunt, the home): unviewed, it stands in town once not hunting */
    if (!this._map) { this.stand(); return; }
    this._parked = true;
    this._known = new Map(); this._walkers = []; this._readAt = null; this._cursor = null;
    this._changed();
  }

  /**
   * A character that is playing but not on screen stands in town from the moment it opens (boot,
   * reload, login) or stops being viewed, parked: keepalives, no reads, on the stand the SERVER
   * gives it (its activity's station; the town's idle place; where its hunt set it down). While it
   * hunts the server holds no body for it; when the hunt ends the server sets it down again.
   * Viewing it (show(map)) takes over.
   */
  stand(map = this._town) {
    const m = typeof map === 'string' && MAP_ID.test(map) ? map : null;
    if (!m || this._dead || this._map) return false;
    this._map = m;
    this._parked = true;
    /* its body on the first tick (<= pollMs; a boot sends no burst): a view of it first reads its stand itself */
    this._timer = this._set(() => this._tick(), this.limits.pollMs);
    return true;
  }

  /** A parked body is present (hr_town_here, no tile); the answer is its stand. */
  here() {
    const map = this._map;
    if (!map || this._dead) return Promise.resolve(null);
    this._hereAt = this._now();
    return this._server.rpc('hr_town_here', { p_slot: this._slot, p_map: map }).then((ans) => {
      const b = ans && ans.body;
      if (!ans || !ans.ok || !b || b.ok !== true || b.off || this._dead || this._map !== map) return null;
      this._out = true;
      this._noteMe(b.me);
      return this.me();
    }, () => null);
  }

  /** Send the body to a station (a counter, the green), or back to its activity's place (null); the answer is its stand. */
  go(station) {
    const map = this._map;
    if (!map || this._dead || (station !== null && !(typeof station === 'string' && STATION.test(station)))) return Promise.resolve(null);
    return this._server.rpc('hr_town_go', { p_slot: this._slot, p_station: station }).then((ans) => {
      const b = ans && ans.body;
      if (!ans || !ans.ok || !b || b.ok !== true || this._dead || this._map !== map) return null;
      this._noteMe(b.me);
      return this.me();
    }, () => null);
  }

  _noteMe(raw) {
    const s = standOf(raw);
    if (!s) { if (raw === null) this._me = null; return; }
    const moved = standKey(s) !== standKey(this._me);
    this._me = s;
    /* the server moved an unviewed body (back from a hunt, a new activity): where the World last left it is gone */
    if (moved && this._parked) { this._want = null; this._sent = null; }
    if (moved) this._changed();
  }

  _tick() {
    if (this._parked) {
      if (this._busy()) { this._leave(); return; }
      if (this._now() - this._hereAt >= (this.limits.parkedKeepaliveMs || this.limits.keepaliveMs)) this.here();
      return;
    }
    if (this._want && this._now() - this._sentAt >= this.limits.keepaliveMs) this._flush(true);
    /* READ ONLY WHAT IS DRAWN (perf audit 10-23: 30 reads a minute with no town on screen): a frame asked lately */
    if (this._now() - this._drawnAt <= 2 * this.limits.pollMs) this.read();
  }

  /** One hr_town_view read for the shown map. A read asked while one is out waits for it and reads once more
      (every such caller rides on that one), so the newest ask is never dropped. */
  read() {
    const again = () => { this._next = null; return this.read(); };   // after the one out, answered or failed
    if (this._reading) return this._next || (this._next = this._reading.then(again, again));
    const map = this._map;
    if (!map || this._dead || this._parked) return Promise.resolve(false);
    this._reading = this._readOnce(map).finally(() => { this._reading = null; });
    return this._reading;
  }

  async _readOnce(map) {
    const now = this._now();
    const whole = this._cursor === null || now - this._fullAt >= this.limits.fullEveryMs;
    const c = this._center || (this._me && this._me.map === map ? [this._me.x, this._me.y] : null);
    const prev = whole ? null : this._readCenter;
    const ans = await this._server.rpc('hr_town_view', { p_slot: this._slot, p_map: map, p_cx: c ? c[0] : null, p_cy: c ? c[1] : null,
      p_cursor: whole ? null : this._cursor, p_pcx: prev ? prev[0] : null, p_pcy: prev ? prev[1] : null });
    if (map !== this._map || this._dead) return false;
    const b = ans && ans.body;
    if (!ans || !ans.ok || !b || b.ok !== true) return false;
    if (b.off) { this._known = new Map(); this._walkers = []; this._readAt = this._now(); this._changed(); return true; }
    /* A WHOLE ANSWER REPLACES THE LIST; a delta upserts what changed and drops who is gone (never merged upward) */
    if (b.full === true || whole) { this._known = new Map(); this._fullAt = now; }
    for (const g of Array.isArray(b.gone) ? b.gone : []) if (g && typeof g.id === 'string') this._known.delete(g.id.toLowerCase() + ':' + g.slot);
    const self = (this._self() || '').toLowerCase();
    for (const raw of Array.isArray(b.walkers) ? b.walkers : []) {
      const w = walkerOf(raw);
      /* Only THIS character is not a walker: the viewer's other characters are people in town too
         (Tyler 2026-10-19), so a walker is its user AND its slot. */
      if (!w || (w.id === self && w.slot === this._slot)) continue;
      this._known.delete(keyOf(w));
      this._known.set(keyOf(w), w);
    }
    /* the area the server read (its view + margin): anyone the list holds that neither stands nor walks inside it is out of view */
    const area = b.area;
    const win = Array.isArray(area) && area.length === 4 && area.every(Number.isInteger) ? area : null;
    const inArea = (x, y) => x >= win[0] && x <= win[2] && y >= win[1] && y <= win[3];
    if (win) for (const [k, w] of this._known) if (!inArea(w.x, w.y) && !inArea(w.gx, w.gy)) this._known.delete(k);
    const list = [];
    for (const w of this._known.values()) { if (list.length >= this.limits.cap) break; list.push(w); }
    this._walkers = list;
    if (Number.isFinite(b.cursor)) this._cursor = b.cursor;
    this._readCenter = c;
    this._noteMe(b.me);
    this._readAt = this._now();
    this._changed();
    return true;
  }

  /** The people in town now, as the server last said (none when that is older than staleMs). */
  walkers() {
    /* a frame drawing the town asks for its people; one after a pause (a hidden tab, a pane not drawn) reads at once */
    const now = this._now();
    if (this._map && !this._parked && now - this._drawnAt > 2 * this.limits.pollMs) this.read();
    this._drawnAt = now;
    if (!this._map || this._readAt === null || this._now() - this._readAt > this.limits.staleMs) return [];
    return this._walkers.filter((w) => !this._hidden(w.id));
  }

  /** The town map this presence is on, or null. */
  map() { return this._map; }

  /** This character's own stand on the shown map, as the server holds it ({x, y, gx, gy, dir, at, station, stand, work, since}), or null. */
  me() { return this._me && this._me.map === this._map ? this._me : null; }

  /** Where this character's body stands on `map` ([x, y] whole tiles): where the World last walked it, else the server's stand; null when not there. */
  placeOn(map) {
    if (!this._map || this._map !== map) return null;
    const p = this._want || this._sent;
    if (p) return [p.x, p.y];
    const m = this.me();
    return m ? [m.x, m.y] : null;
  }

  _leave() {
    this._want = null; this._me = null;   // out of town: its stand is the server's to keep or let go
    this._hereAt = -Infinity;             // back in town (a hunt over), it says it is here on the next tick
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
    this._known = new Map();
    this._walkers = [];
    this._listeners.clear();
  }
}
