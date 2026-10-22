// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/live-engine.js — THE VIEWED CHARACTER'S HUNT, RUN LIVE IN THE BROWSER.
//
// Option B (Tyler 2026-10-19): the browser runs the SAME instance engine the edge
// settles with (src/core/combat-sim.js simulateHuntInstance over the member
// assembly src/core/member.js, on the ground src/core/hunt-ground.js), swing by
// swing as the clock reaches each boundary, and feeds what it produces into the
// character's playback timeline (src/hunt-view/timeline.js) a hair behind real
// time. The scene draws from that timeline exactly as it draws a server window:
// one renderer, one engine, no second path.
//
// PREDICTION ONLY (CLAUDE.md §1, §6). Nothing computed here is spent, credited or
// shown as owned: loot, gold and XP appear only from server envelopes. The engine
// gets the combat-swing seeds the server sends (hunt_live.seeds, domain 's') and a
// CONSTANT for the drop stream ('r'), which the server never sends, so a drop is
// not foreseeable from anything the browser holds.
//
// RECONCILE. After every swing the engine records the hash of its world
// (src/core/hunt-track.js worldHash over world-state's encoding). Each server commit
// carries the hash of the world it stored (hunt_check); a match leaves the
// prediction running, a mismatch (or a swing too old to judge) asks for a fresh
// start point (hunt_live), and reseed() replaces the prediction with the server's
// world, fast-forwards it to now, and eases every unit from where it is drawn to
// where it truly stands (timeline.rebase), never a teleport.
//
// PURE (no DOM). The caller owns the clock.
// ════════════════════════════════════════════════════════════════════════

import { simulateHuntInstance } from '../core/combat-sim.js?v=0.2.25';
import { memberSide, frozenSide } from '../core/member.js?v=0.2.25';
import { huntGroundOf } from '../core/hunt-ground.js?v=0.2.25';
import { huntTimeline, worldHash } from '../core/hunt-track.js?v=0.2.25';
import { encode as encodeWorldRow, decodeStored as decodeWorldRow } from '../core/hunt/world-state.js?v=0.2.25';
import { COMBAT_BALANCE } from '../core/combat.js?v=0.2.25';
import { HUNT_TUNING } from '../data/hunt-tuning.js?v=0.2.25';
import { stepCost } from '../core/hunt/grid.js?v=0.2.25';

/* How many swings of world hashes are kept to judge a server commit against. */
const KEEP_HASHES = 64;
/* The most swings one call runs (a frame's advance, a catch-up): never an unbounded loop on the main thread. */
const MAX_SWINGS_PER_CALL = 64;
/* A party member's purse is withheld by the server: never let the prediction end its hunt for gold. */
const UNKNOWN_PURSE = Number.MAX_SAFE_INTEGER;

const isInt = (v) => Number.isSafeInteger(v);
const encodeWorld = (w) => JSON.stringify(encodeWorldRow(w));
/* WHAT EACH HERO FIGHTS WITH: every member's `hero` (heroSetup: target, stance, chase, distance, the bar,
   density, thresholds), the viewer's own or a peer's frozen one, by member key. The server reads it afresh
   at every settle, so a start point naming another one is a setup changed mid-hunt (r10). */
const setupOf = (live) => JSON.stringify(live.members.map((m) => [String(m.key), (m.frozen ? m.frozen.hero : m.hero) ?? null])
  .sort((a, b) => (a[0] < b[0] ? -1 : 1)));

/*
 * THE DRAWN TIMING OF A SWING'S STEPS (display only: nothing reads it back). The engine stamps a step
 * with the 100 ms sub-step it began in, but a unit rolls continuously at its own speed (movement.js
 * MV-02: a step finished mid-sub-step rolls straight into the next), so a step that follows on truly
 * starts the instant the last one ended, and rolls for its length over the unit's speed (a diagonal
 * 1.414 times a straight one). Drawn at the stamp over one fixed tile time instead, a walk rushed its
 * diagonals and stood still at most tile boundaries (live v0.2.20 "choppy"). A unit's first sighting
 * (its spawn anchor) moves 1 ms before a step that starts on the same instant, so the timeline (one
 * step per unit and instant, timeline.js T2) keeps both and the hero never cuts two tiles at once.
 * `memo`: unit -> { x, y, end, first } across swings (the caller prunes it).
 */
export function timeSteps(steps, speedOf, memo) {
  const sub = HUNT_TUNING.stepMs;
  for (const s of steps) {
    const m = memo.get(s.u);
    if (!m) { s.stampMs = s.atMs; memo.set(s.u, { x: s.x, y: s.y, end: s.atMs, first: s }); continue; }
    if (m.x === s.x && m.y === s.y) continue;   // an anchor on the tile it is rolling to or holds
    const budget = Math.floor((Number(speedOf(s.u)) * sub) / 1000);   // movement.js stepUnit's budget
    const adjacent = Math.max(Math.abs(s.x - m.x), Math.abs(s.y - m.y)) === 1;
    if (!adjacent || !(budget > 0)) { memo.set(s.u, { x: s.x, y: s.y, end: s.atMs, first: null }); continue; }
    const start = Number.isFinite(m.end) && m.end >= s.atMs && m.end < s.atMs + sub ? m.end : s.atMs;
    const end = start + (stepCost(m.x, m.y, s.x, s.y) * sub) / budget;
    const at = Math.round(start);
    if (m.first && m.first.atMs >= at) m.first.atMs = at - 1;
    s.stampMs = s.atMs;   // the engine's own sub-step stamp (tests/hunt-live.mjs LV-D judges the swings on it)
    s.atMs = at;
    s.dur = Math.round(end) - at;
    memo.set(s.u, { x: s.x, y: s.y, end, first: null });
  }
  return steps;
}

/**
 * @param {{items: object, monsters: object}} o  the catalogues the edge prices with
 */
export function createLiveEngine(o) {
  const items = o.items, monsters = o.monsters;
  let st = null;

  function start(live) {
    if (!live || live.v !== 1 || !live.instance || !live.seeds || !Array.isArray(live.members)) return null;
    const where = huntGroundOf(String(live.instance.hunt));
    if (!where) return null;
    const text = typeof live.instance.world === 'string' ? live.instance.world : null;
    const world = text ? decodeWorldRow(JSON.parse(text)) : null;
    const sides = live.members.slice().sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((mi) => (mi.frozen ? frozenSide(mi)
        : memberSide(Object.assign({}, mi, { gold: isInt(mi.gold) ? mi.gold : UNKNOWN_PURSE }), { items })));
    const s = {
      instance: String(live.instance.id),
      world, next: Number(live.instance.next_swing_at_ms), where, sides,
      /* A restarted instance's fresh world counts on from its stored swing (combat-sim.js worldSwing):
         the server passes it, so must the browser, or its first swing asks for a seed index never sent. */
      worldSwing: Math.max(0, Math.floor(Number(live.instance.world_swing) || 0)),
      seeds: { from: Number(live.seeds.from), list: live.seeds.list.slice() },
      hashes: new Map(), starved: false, drawn: new Map(),
      self: (live.members.find((m) => m.self) || {}).unitId ?? null,
      setup: setupOf(live),
    };
    s.hashes.set(Number(live.instance.world_swing), live.instance.world_hash);
    return s;
  }

  /* Does the prediction hold the combat seed of its next swing? Asked BEFORE the swing runs: the sim
     moves its members' sessions on before it draws the seed, so a swing that starved half-way would
     leave a world the next seed can no longer replay. */
  const seeded = (s) => isInt(s.seeds.list[(s.world ? s.world.swing : s.worldSwing) - s.seeds.from]);

  /* One swing of the instance, from the engine's next boundary. */
  function swing(s) {
    const seed = (domain, index) => {
      if (domain !== 's') return 0;   // the drop stream is the server's alone
      const v = s.seeds.list[index - s.seeds.from];
      if (!isInt(v)) { const e = new Error('live: no combat seed for swing ' + index); e.starved = true; throw e; }
      return v;
    };
    if (!seeded(s)) { const e = new Error('live: no combat seed for the next swing'); e.starved = true; throw e; }
    const at = s.next;
    const speeds = new Map();
    for (const u of (s.world ? s.world.units : [])) speeds.set(u.id, u.speed);
    const sim = simulateHuntInstance({ world: s.world, nextSwingAtMs: at, members: s.sides.map((x) => x.member),
      worldSwing: s.worldSwing },
    { toMs: at + 1, tickMs: COMBAT_BALANCE.tickMs, seed, ground: s.where.ground, grid: s.where.grid, monsters, items });
    /* THE INSTANCE HAS ENDED (every member left: a death and the party's end with it, a leave, stamina):
       the engine runs no swing and its clock stands. A prediction that kept calling it never caught up:
       64 empty swings a frame, then a catch-up whose loop never ended (live v0.2.22, Andy: the tab froze
       when the tank died, and again on every reload until the server closed the hunt). It stops here and
       holds its world until the server's answer ends the hunt (live-link.js off). */
    if (!(sim.nextSwingAtMs > at)) { s.ended = true; const e = new Error('live: the instance has ended'); e.ended = true; throw e; }
    s.world = sim.world;
    s.next = sim.nextSwingAtMs;
    if (s.world) {
      s.hashes.set(s.world.swing, worldHash(encodeWorld(s.world)));
      if (s.hashes.size > KEEP_HASHES) s.hashes.delete(s.hashes.keys().next().value);
    }
    const tl = huntTimeline(sim.track, sim.events, at, sim.nextSwingAtMs, at, sim.units);
    const alive = new Set();
    for (const u of (s.world ? s.world.units : [])) { if (!speeds.has(u.id)) speeds.set(u.id, u.speed); alive.add(u.id); }
    timeSteps(tl.hunt_track, (id) => speeds.get(id), s.drawn);
    for (const id of s.drawn.keys()) if (!alive.has(id)) s.drawn.delete(id);
    return tl;
  }

  /*
   * CATCH UP. Run every swing whose boundary lies at or before `until` (= the server's now plus the
   * ease the caller draws over) WITHOUT playing the past, and answer the state AT `until`, not at the
   * end of the last swing run (that lay up to a swing in the future: every unit was eased onto where it
   * would stand at the next boundary and then stood there until it came, live v0.2.21 "choppy"):
   *   positions/alive  every unit standing at `until` (spawned and not killed by then) and its tile
   *   units            { id: [kind, maxHp, hp at `until`] } (the bars carry on from the true HP)
   *   track/events     what the swings run hold AFTER `until`: played on as usual, nothing skipped
   *   kills/fallen     the deaths at or before `until` (and each victim's book row at 0 HP): a monster killed inside the skipped span is
   *                    drawn falling, never left standing at its last tile (live v0.2.21 "the kobold
   *                    was still standing at the end"); their ids are the engine's, so a death the
   *                    screen already played is not played twice (timeline.js T1)
   */
  function fastForward(serverNowMs, aheadMs) {
    const until = serverNowMs + Math.max(0, Math.floor(Number(aheadMs) || 0));
    const pos = new Map(), killed = new Set(), hp = {}, kills = [], track = [], events = [];
    for (const u of (st.world ? st.world.units : [])) if (u.alive) pos.set(u.id, [u.x, u.y]);
    for (let n = 0; st.next <= until && n < MAX_SWINGS_PER_CALL; n++) {
      let tl;
      try { tl = swing(st); } catch (e) { if (e && e.starved) st.starved = true; if (e && (e.starved || e.ended)) break; throw e; }
      for (const [k, v] of Object.entries(tl.hunt_units || {})) hp[k] = v.slice();
      for (const s of tl.hunt_track) { if (s.atMs <= until) pos.set(s.u, [s.x, s.y]); else track.push(s); }
      for (const ev of tl.hunt_events) {
        if (ev.atMs > until) { events.push(ev); continue; }
        if (ev.type === 'kill' && isInt(ev.t)) { killed.add(ev.t); kills.push(ev); }
        const r = hp[ev.t];
        if (r && Number.isFinite(ev.amount) && (ev.type === 'dmg' || ev.type === 'heal' || ev.type === 'status_tick')) {
          r[2] = Math.max(0, Math.min(r[1], r[2] + (ev.type === 'heal' ? ev.amount : -ev.amount)));
        }
      }
    }
    const positions = new Map(), alive = new Set(), units = {}, fallen = {};
    for (const u of killed) if (hp[u]) fallen[u] = [hp[u][0], hp[u][1], 0];
    for (const [u, xy] of pos) {
      if (killed.has(u)) continue;
      positions.set(u, xy); alive.add(u);
      if (hp[u]) units[u] = hp[u];
    }
    /* a unit that first appears after `until` (a respawn) is alive too: its steps are played on */
    for (const s of track) alive.add(s.u);
    return { positions, alive, units, fallen, fromMs: until, track, events, kills };
  }

  return {
    /** Begin from a server start point (hunt_live). Answers false when it cannot run it. */
    seed(live) { st = start(live); return !!st; },
    /**
     * Does a start point carry the setups this prediction runs (setupOf)? One that does not was changed
     * mid-hunt: the server settles from its world with the new one, so the prediction must restart from it.
     */
    sameSetup: (live) => !!st && !!live && Array.isArray(live.members) && setupOf(live) === st.setup,
    /** Is a prediction running? */
    running: () => !!st && !st.starved && !st.ended,
    /** Did the prediction run to the instance's end (every member left)? It holds its world and runs nothing more. */
    ended: () => !!st && st.ended === true,
    /** The viewed character's unit in the instance (null before the first swing places it). */
    selfUnit: () => (st ? (st.sides.find((x) => x.mi && x.mi.self) || {}).member?.unitId ?? st.self : null),
    /** Every hero of the instance: [{ unit, seat, self, role }] (unit null before its first swing). */
    heroUnits: () => (st ? st.sides.map((x) => ({ unit: Number.isInteger(x.member.unitId) ? x.member.unitId : null,
      seat: x.mi.seat, self: x.mi.self === true, role: x.member.hero.role })) : []),
    /** The server instant of the next swing boundary (null when not running). */
    nextAt: () => (st ? st.next : null),
    /**
     * Run every swing whose boundary the server clock has reached; each one's playback batch goes to
     * `feed` (timeline.ingest's shape). Answers how many swings ran.
     */
    advance(serverNowMs, feed) {
      if (!st || st.starved || st.ended || !Number.isFinite(serverNowMs)) return 0;
      let n = 0;
      while (st.next <= serverNowMs && n < MAX_SWINGS_PER_CALL) {
        let tl;
        try { tl = swing(st); } catch (e) { if (e && e.starved) st.starved = true; if (e && (e.starved || e.ended)) break; throw e; }
        n++;
        feed({ track: tl.hunt_track, events: tl.hunt_events, units: tl.hunt_units, fromMs: tl.hunt_from_ms });
      }
      return n;
    },
    /**
     * Judge a server commit (hunt_check { world_swing, world_hash }): 'match', 'diverged', or
     * 'unknown' (a swing this prediction has not reached or no longer remembers).
     */
    check(hc) {
      if (!st || !hc || !isInt(hc.world_swing)) return 'unknown';
      const h = st.hashes.get(hc.world_swing);
      if (h === undefined) return 'unknown';
      return h === hc.world_hash ? 'match' : 'diverged';
    },
    /**
     * A server commit's check (hunt_check, with the next seeds): on a match the prediction runs on with
     * the new seeds (and resumes if it had run out); answers check()'s verdict.
     */
    reconcile(hc) {
      const v = this.check(hc);
      if (v === 'match' && hc.seeds && isInt(hc.seeds.from) && Array.isArray(hc.seeds.list)) {
        const from = hc.seeds.from, list = hc.seeds.list;
        /* A seed below the prediction's next swing is never read again (swing() reads its own index and up),
           so it is dropped: kept from the first seed ever sent, the list and this merge grew with the hunt's
           age, every commit (tests/hunt-live.mjs LV-G). */
        const keepFrom = Math.max(Math.min(st.seeds.from, from), st.world ? st.world.swing : st.worldSwing);
        const merged = [];
        for (let i = keepFrom; i < from + list.length; i++) {
          merged.push(i >= from ? list[i - from] : st.seeds.list[i - st.seeds.from]);
        }
        st.seeds = { from: keepFrom, list: merged };
        st.starved = false;
      }
      return v;
    },
    /**
     * Replace the prediction with a server start point and fast-forward it to `serverNowMs` + `aheadMs`
     * (fastForward's answer, for the caller to ease the drawing onto: timeline.rebase), or null when it
     * cannot run it. The past it ran is not played (that time is already on screen) except its deaths.
     */
    reseed(live, serverNowMs, aheadMs) {
      const s = start(live);
      if (!s) { st = null; return null; }
      st = s;
      return fastForward(serverNowMs, aheadMs);
    },
    /** A prediction that holds a world but cannot step it (out of seeds: restart it eased, never fed; or ended). */
    stalled: () => !!st && (st.starved || st.ended === true),
    /** The swing the prediction runs next (null without one): read by a hang report, never by the hunt. */
    swingIndex: () => (st ? (st.world ? st.world.swing : st.worldSwing) : null),
    /** How far (ms) the prediction's next boundary lies behind `serverNowMs` (0 when it is up to date or not running). */
    behindMs: (serverNowMs) => (st && !st.starved && !st.ended && Number.isFinite(serverNowMs) ? Math.max(0, serverNowMs - st.next) : 0),
    /**
     * A prediction more than a swing behind (a background tab's paused frame loop): its missed swings are
     * already in the past, so they are run without being played and the caller eases onto the result
     * (reseed's answer shape), instead of feeding them and drawing their end at once.
     */
    catchUp(serverNowMs, aheadMs) { return st && !st.starved && !st.ended ? fastForward(serverNowMs, aheadMs) : null; },
    /**
     * The server instant the look-ahead runs out: the boundary of the first swing it holds no combat
     * seed for (null when not running). The session asks for more before it comes (live-link.js
     * refillDelayMs), so the prediction never stands waiting for seeds.
     */
    seededUntil() {
      if (!st || st.starved || st.ended) return null;
      const swing = st.world ? st.world.swing : st.worldSwing;
      return st.next + (st.seeds.from + st.seeds.list.length - swing) * COMBAT_BALANCE.tickMs;
    },
    /** What the prediction's member sinks would have dropped (inert: it proves drops are NOT foreseen). */
    predictedDrops() {
      const out = {};
      for (const x of (st ? st.sides : [])) for (const [id, n] of Object.entries(x.itemDelta || {})) out[id] = (out[id] || 0) + n;
      return out;
    },
    /** How many combat seeds the prediction holds (tests: bounded by the look-ahead, never by the hunt's age). */
    heldSeeds: () => (st ? st.seeds.list.length : 0),
    /** The hash of the prediction's world at a swing (tests). */
    hashAt: (swingIndex) => (st ? st.hashes.get(swingIndex) ?? null : null),
    stop() { st = null; },
  };
}
