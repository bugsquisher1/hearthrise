// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/timeline.js — THE HUNT'S VISUAL TIMELINE, PLAYED SMOOTHLY.
//
// PURE. Two things reach the client from a hunt, and they are kept apart
// (Tyler, 2026-10-17):
//   the SNAPSHOT  the envelope sections (src/session/hunt-sections.js), REPLACED
//                 by every envelope. It always wins for numbers.
//   the TIMELINE  this module: the settle response's `hunt_track` (unit tile
//                 steps, server ms) and `hunt_events` (each with a stable `id`
//                 and a server `atMs`), merged into one buffer and played back
//                 at frame rate, a fixed delay behind the server.
//
// THE RULES
//   T1 an event is delivered once: a batch that repeats ids (the next settle
//      restating the window's tail) adds nothing.
//   T2 a track step is kept once per (unit, atMs); a unit rolls from the tile it
//      was on to the step's tile over `tileMs`, never jumping, and with no newer
//      step it HOLDS its last tile (a window gap never invents a step).
//   T3 the server→client clock offset is measured per batch but only ever
//      moves `skew` of the way to a new measurement, so a new batch or a new
//      envelope never restarts or rewinds a running animation.
//   T4 a snapshot pose that disagrees with where the timeline left a unit adds
//      ONE walking step toward it (reconcile gently); it never teleports a unit
//      that is mid-step and never rewrites a step already played.
//   T6 the UNIT BOOK: each batch's `units` ({ id: [kind, maxHp, hp at the batch's start] },
//      the settle answer's hunt_units) names and sizes a monster for as long as it plays, and its
//      bar at the instant shown is that start HP moved by the dmg / heal events at or before the
//      instant (hpAt): the HP of the moment drawn, never the snapshot's later number.
//   T7 a step that does not move the unit (an anchor on the tile it already holds) adds nothing.
//   T5 bounded: at most `maxSteps` per unit and `maxEvents` remembered ids, and
//      a unit the snapshot's pose no longer lists is forgotten once its last step
//      is `forgetMs` behind the pose (a corpse has lain; a respawn is a new id).
//
// Rendering, simulation and persistence run on independent clocks: the caller
// asks positionAt()/advance() with its own frame clock; the server ticks at its
// own cadence; nothing here waits on the 10 s world tick.
// ════════════════════════════════════════════════════════════════════════

const DEFAULTS = Object.freeze({ delayMs: 600, tileMs: 312, skew: 0.1, maxSteps: 64, maxEvents: 4096, forgetMs: 15000 });

const isInt = (v) => Number.isSafeInteger(v);

/** The id an event is de-duplicated by: the server's, or one derived from its fields. */
function eventKey(ev) {
  if (ev && (typeof ev.id === 'string' || isInt(ev.id))) return 'i:' + ev.id;
  return 'f:' + [ev.type, ev.atMs, ev.u, ev.t, ev.amount, ev.item, ev.ability, ev.status].join('|');
}

/**
 * @param {object} [o]  overrides of DEFAULTS
 */
export function createTimeline(o) {
  const cfg = Object.assign({}, DEFAULTS, o || {});
  let offset = null;                 // clientMs - serverMs
  const steps = new Map();           // unit -> [{x, y, atMs}] ascending
  const seen = new Set();            // event keys, insertion order (bounded)
  const queue = [];                  // events not yet played, ascending atMs
  const listeners = new Set();
  const arrivals = new Set();        // told of each NEW event at ingest (the alerts), before playback
  const book = new Map();            // unit -> { kind, maxHp, bases: [[atMs, hp]], deltas: [[atMs, d]] } (T6)

  function measure(serverNowMs, clientNowMs) {
    if (!isInt(serverNowMs) || !Number.isFinite(clientNowMs)) return;
    const m = clientNowMs - serverNowMs;
    offset = offset === null ? m : offset + (m - offset) * cfg.skew;
  }

  /** The server instant the screen shows at client time `now`. */
  function serverAt(now) { return offset === null ? null : now - offset - cfg.delayMs; }

  /* Each step carries the unit's ODOMETER `d` (tiles walked up to the end of this step)
     and its HEADING (hx, hy: the last step that moved, this one included), both derived
     from the steps alone, so a walk cycle and a facing are functions of time that a
     later batch can extend but never rewind. Recomputed from an out-of-order insert on;
     trimming the oldest steps keeps every kept step's values. */
  function derive(a, from) {
    for (let k = Math.max(0, from); k < a.length; k++) {
      const s = a[k], p = a[k - 1];
      const dx = p ? s.x - p.x : 0, dy = p ? s.y - p.y : 0;
      s.d = (p ? p.d : 0) + Math.hypot(dx, dy);
      const moved = dx !== 0 || dy !== 0;
      s.hx = moved ? dx : p ? p.hx : 0;
      s.hy = moved ? dy : p ? p.hy : 1;
    }
  }

  function addStep(u, x, y, atMs) {
    if (![u, x, y, atMs].every(isInt)) return false;
    let a = steps.get(u);
    if (!a) { a = []; steps.set(u, a); }
    if (a.some((s) => s.atMs === atMs)) return false;
    let i = a.length;
    while (i > 0 && a[i - 1].atMs > atMs) i--;
    if (i > 0 && a[i - 1].x === x && a[i - 1].y === y) return false;   // T7: holds its tile already
    a.splice(i, 0, { x, y, atMs, d: 0, hx: 0, hy: 1 });
    derive(a, i);
    if (a.length > cfg.maxSteps) a.splice(0, a.length - cfg.maxSteps);
    return true;
  }

  function remember(key) {
    seen.add(key);
    if (seen.size > cfg.maxEvents) seen.delete(seen.values().next().value);
  }

  /**
   * One settle response's timeline.
   * @param {{track?: object[], events?: object[], serverNowMs?: number}} batch
   * @param {number} clientNowMs  the caller's clock
   * @returns {{steps: number, events: number}} what was new
   */
  function noteUnits(units, fromMs) {
    if (!units || typeof units !== 'object' || !isInt(fromMs)) return;
    for (const [k, v] of Object.entries(units)) {
      const u = Number(k);
      if (!isInt(u) || !Array.isArray(v) || typeof v[0] !== 'string' || !isInt(v[1]) || v[1] <= 0) continue;
      let r = book.get(u);
      if (!r) { r = { kind: v[0], maxHp: v[1], bases: [], deltas: [] }; book.set(u, r); }
      if (isInt(v[2]) && !r.bases.some((x) => x[0] === fromMs)) {
        r.bases.push([fromMs, Math.max(0, Math.min(v[1], v[2]))]);
        r.bases.sort((x, y) => x[0] - y[0]);
        if (r.bases.length > 8) r.bases.splice(0, r.bases.length - 8);
      }
    }
    if (book.size > cfg.maxEvents) for (const u of book.keys()) { if (book.size <= cfg.maxEvents) break; if (!steps.has(u)) book.delete(u); }
  }
  function noteDelta(ev) {
    const r = book.get(ev.t);
    if (!r || !Number.isFinite(ev.amount)) return;
    const d = ev.type === 'heal' ? ev.amount : -ev.amount;
    r.deltas.push([ev.atMs, d]);
    if (r.deltas.length > 512) r.deltas.splice(0, r.deltas.length - 512);
  }

  function ingest(batch, clientNowMs) {
    const b = batch && typeof batch === 'object' ? batch : {};
    measure(b.serverNowMs, clientNowMs);
    noteUnits(b.units, b.fromMs);
    let ns = 0, ne = 0;
    for (const s of Array.isArray(b.track) ? b.track : []) if (s && addStep(s.u, s.x, s.y, s.atMs)) ns++;
    for (const ev of Array.isArray(b.events) ? b.events : []) {
      if (!ev || typeof ev.type !== 'string' || !isInt(ev.atMs)) continue;
      const k = eventKey(ev);
      if (seen.has(k)) continue;
      remember(k);
      let i = queue.length;
      while (i > 0 && queue[i - 1].atMs > ev.atMs) i--;
      const fresh = Object.freeze(Object.assign({ key: k }, ev));
      queue.splice(i, 0, fresh);
      if (ev.type === 'dmg' || ev.type === 'heal' || ev.type === 'status_tick') noteDelta(fresh);
      ne++;
      for (const fn of Array.from(arrivals)) fn(fresh);
    }
    return { steps: ns, events: ne };
  }

  /**
   * Where unit `u` stands at client time `now`, or null: {x, y, moving} in tiles, plus
   * `d` (its odometer, tiles walked: a walk cycle's frame is a function of it) and
   * (hx, hy), the heading of its latest move (a held unit keeps facing that way).
   */
  function positionAt(u, now) {
    const a = steps.get(u);
    const t = serverAt(now);
    if (!a || !a.length || t === null) return null;
    let i = a.length - 1;
    while (i > 0 && a[i].atMs > t) i--;
    const cur = a[i];
    if (cur.atMs > t || i === 0) return { x: cur.x, y: cur.y, moving: false, d: cur.d, hx: cur.hx, hy: cur.hy };
    const prev = a[i - 1];
    const f = Math.min(1, (t - cur.atMs) / cfg.tileMs);
    const moving = f < 1 && (cur.x !== prev.x || cur.y !== prev.y);
    return { x: prev.x + (cur.x - prev.x) * f, y: prev.y + (cur.y - prev.y) * f, moving,
      d: prev.d + (cur.d - prev.d) * f, hx: cur.hx, hy: cur.hy };
  }

  /** The client time a server instant plays at (null before the first batch). */
  function clientAt(serverMs) { return offset === null || !Number.isFinite(serverMs) ? null : serverMs + offset + cfg.delayMs; }

  /**
   * The snapshot's pose: every unit whose timeline ends somewhere else gets one
   * step toward the pose, after its last step (T4).
   * @param {{at_ms: number, units: {u:number, x:number, y:number}[]}} pose
   */
  function reconcile(pose) {
    if (!pose || !isInt(pose.at_ms) || !Array.isArray(pose.units)) return 0;
    let n = 0;
    const listed = new Set(pose.units.map((p) => p && p.u));
    for (const [u, a] of steps) if (!listed.has(u) && a[a.length - 1].atMs < pose.at_ms - cfg.forgetMs) steps.delete(u);
    for (const p of pose.units) {
      if (!p || ![p.u, p.x, p.y].every(isInt)) continue;
      const a = steps.get(p.u);
      const last = a && a[a.length - 1];
      if (last && last.x === p.x && last.y === p.y) continue;
      const at = last ? Math.max(pose.at_ms, last.atMs + cfg.tileMs) : pose.at_ms;
      if (addStep(p.u, p.x, p.y, at)) n++;
    }
    return n;
  }

  /** Deliver every queued event whose time has come, once, to the subscribers. */
  function advance(now) {
    const t = serverAt(now);
    if (t === null) return 0;
    let n = 0;
    while (queue.length && queue[0].atMs <= t) {
      const ev = queue.shift();
      n++;
      for (const fn of Array.from(listeners)) fn(ev);
    }
    return n;
  }

  /** The unit's kind from the book (T6), or null. */
  function kindOf(u) { const r = book.get(u); return r ? r.kind : null; }
  /** { hp, maxHp } of a booked unit at the server instant shown at client time `now` (T6), or null. */
  function hpAt(u, now) {
    const r = book.get(u);
    const t = serverAt(now);
    if (!r || t === null || !r.bases.length) return null;
    let base = null;
    for (const x of r.bases) if (x[0] <= t) base = x;
    if (!base) base = r.bases[0];
    let hp = base[1];
    for (const [at, d] of r.deltas) if (at >= base[0] && at <= t) hp += d;
    return { hp: Math.max(0, Math.min(r.maxHp, hp)), maxHp: r.maxHp };
  }

  return {
    ingest, reconcile, advance, positionAt, clientAt, kindOf, hpAt,
    /** How long a unit takes to roll one tile (ms): the walk speed the playback assumes. */
    tileMs: cfg.tileMs,
    units: () => Array.from(steps.keys()),
    pending: () => queue.length,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** fn(event) once per NEW event as it ARRIVES (T1 de-duplicated), whether or not anything plays it. */
    onArrive(fn) { arrivals.add(fn); return () => arrivals.delete(fn); },
  };
}
