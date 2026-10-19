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

import { simulateHuntInstance } from '../core/combat-sim.js?v=0.2.8';
import { memberSide } from '../core/member.js?v=0.2.8';
import { huntGroundOf } from '../core/hunt-ground.js?v=0.2.8';
import { huntTimeline, worldHash } from '../core/hunt-track.js?v=0.2.8';
import { encode as encodeWorldRow, decode as decodeWorldRow } from '../core/hunt/world-state.js?v=0.2.8';
import { COMBAT_BALANCE } from '../core/combat.js?v=0.2.8';

/* How many swings of world hashes are kept to judge a server commit against. */
const KEEP_HASHES = 64;
/* A party member's purse is withheld by the server: never let the prediction end its hunt for gold. */
const UNKNOWN_PURSE = Number.MAX_SAFE_INTEGER;

const isInt = (v) => Number.isSafeInteger(v);
const encodeWorld = (w) => JSON.stringify(encodeWorldRow(w));

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
      .map((mi) => memberSide(Object.assign({}, mi, { gold: isInt(mi.gold) ? mi.gold : UNKNOWN_PURSE }), { items }));
    const s = {
      instance: String(live.instance.id),
      world, next: Number(live.instance.next_swing_at_ms), where, sides,
      seeds: { from: Number(live.seeds.from), list: live.seeds.list.slice() },
      hashes: new Map(), starved: false,
      self: (live.members.find((m) => m.self) || {}).unitId ?? null,
    };
    s.hashes.set(Number(live.instance.world_swing), live.instance.world_hash);
    return s;
  }

  /* One swing of the instance, from the engine's next boundary. */
  function swing(s) {
    const seed = (domain, index) => {
      if (domain !== 's') return 0;   // the drop stream is the server's alone
      const v = s.seeds.list[index - s.seeds.from];
      if (!isInt(v)) { const e = new Error('live: no combat seed for swing ' + index); e.starved = true; throw e; }
      return v;
    };
    const at = s.next;
    const sim = simulateHuntInstance({ world: s.world, nextSwingAtMs: at, members: s.sides.map((x) => x.member) },
      { toMs: at + 1, tickMs: COMBAT_BALANCE.tickMs, seed, ground: s.where.ground, grid: s.where.grid, monsters, items });
    s.world = sim.world;
    s.next = sim.nextSwingAtMs;
    if (s.world) {
      s.hashes.set(s.world.swing, worldHash(encodeWorld(s.world)));
      if (s.hashes.size > KEEP_HASHES) s.hashes.delete(s.hashes.keys().next().value);
    }
    return huntTimeline(sim.track, sim.events, at, sim.nextSwingAtMs, at, sim.units);
  }

  return {
    /** Begin from a server start point (hunt_live). Answers false when it cannot run it. */
    seed(live) { st = start(live); return !!st; },
    /** Is a prediction running? */
    running: () => !!st && !st.starved,
    /** The viewed character's unit in the instance (null before the first swing places it). */
    selfUnit: () => (st ? (st.sides.find((x) => x.mi && x.mi.self) || {}).member?.unitId ?? st.self : null),
    /** The server instant of the next swing boundary (null when not running). */
    nextAt: () => (st ? st.next : null),
    /**
     * Run every swing whose boundary the server clock has reached; each one's playback batch goes to
     * `feed` (timeline.ingest's shape). Answers how many swings ran.
     */
    advance(serverNowMs, feed) {
      if (!st || st.starved || !Number.isFinite(serverNowMs)) return 0;
      let n = 0;
      while (st.next <= serverNowMs && n < 64) {
        let tl;
        try { tl = swing(st); } catch (e) { if (e && e.starved) { st.starved = true; break; } throw e; }
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
    confirm(hc) {
      const v = this.check(hc);
      if (v === 'match' && hc.seeds && isInt(hc.seeds.from) && Array.isArray(hc.seeds.list)) {
        const from = hc.seeds.from, list = hc.seeds.list;
        const keepFrom = Math.min(st.seeds.from, from);
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
     * Replace the prediction with a server start point and fast-forward it to `serverNowMs`. Answers
     * { positions: Map(unit -> [x, y]), units, alive: Set(unit) } for the caller to ease the drawing
     * onto (timeline.rebase), or null when it cannot run it. Nothing the fast-forward produced is fed:
     * that time is already on screen.
     */
    reseed(live, serverNowMs) {
      const s = start(live);
      if (!s) { st = null; return null; }
      st = s;
      const units = {};
      while (st.next <= serverNowMs) {
        let tl;
        try { tl = swing(st); } catch (e) { if (e && e.starved) { st.starved = true; break; } throw e; }
        Object.assign(units, tl.hunt_units);
      }
      const positions = new Map(), alive = new Set();
      for (const u of (st.world ? st.world.units : [])) {
        if (u.alive) { positions.set(u.id, [u.x, u.y]); alive.add(u.id); }
      }
      return { positions, alive, units, fromMs: serverNowMs };
    },
    /** What the prediction's member sinks would have dropped (inert: it proves drops are NOT foreseen). */
    predictedDrops() {
      const out = {};
      for (const x of (st ? st.sides : [])) for (const [id, n] of Object.entries(x.itemDelta || {})) out[id] = (out[id] || 0) + n;
      return out;
    },
    /** The hash of the prediction's world at a swing (tests). */
    hashAt: (swingIndex) => (st ? st.hashes.get(swingIndex) ?? null : null),
    stop() { st = null; },
  };
}
