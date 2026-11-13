// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/spell-marks.js — A MONSTER'S SPELL, SEEN COMING (Tyler 2026-11-08: "the point of Monsters having aoe
// spells is so the whole party takes damage", "the tank absorbing the boss hits and the casters dodging it"; design:
// docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells" §3 and §5).
//
// PURE. The warnings the hunt scene (scene.js) draws, one per casting monster, from the server's own events:
//   open    a `spell` event (src/core/hunt/events.js) starts a mark: its tiles are the server's (src/core/hunt/marks.js
//           markOfEvent over the ground's walkable grid), and it fills from the event's instant to its landing.
//           A MARKED spell marks its ground tiles: the tank holds, ranged heroes and casters step off. A GROUP spell
//           marks no ground (nobody steps out of one), so every hero in the fight is marked instead.
//   close   the caster's `spell_end` (landed, killed or reset), the caster drawn dead (the scene's `kill`), or a restart of
//           the live view that no longer holds the caster alive (keep). A mark is never timed out by the screen while its
//           spell can still land: only one whose close was lost (a window dropped) goes, graceMs after its landing instant.
// A reload mid-windup draws the same mark again from the server's world: the live view hands the scene the casts its
// start point holds (src/hunt-view/live-engine.js openCasts), as `spell` events. Nothing here is client-authored.
//
// A MARK NEVER BLINKS (design §5): its fill rises in `steps` even steps over the windup and is held until it closes.
// Its opacity is the Danger marks slider's (src/data/fx-alpha.js), whose floor is half: "Monster spell effects" never
// reaches a warning. Bounded: one mark per caster, and a caster casts one spell at a time.
// ════════════════════════════════════════════════════════════════════════
import { markOfEvent } from '../core/hunt/marks.js?v=0.2.125';
import { huntGroundOf } from '../core/hunt-ground.js?v=0.2.125';

export const MARK_TIMING = Object.freeze({ steps: 8, graceMs: 1000 });

export function createSpellMarks() {
  const live = new Map();   // caster unit -> { tiles, group, start, lands } (client ms)
  let gridOf = null, grid = null;
  return {
    /** A `spell` event, played at client instant `start` on hunt `huntId`'s ground. Answers whether it marks anything. */
    open(ev, start, huntId) {
      if (gridOf !== huntId) { gridOf = huntId; const g = huntId ? huntGroundOf(huntId) : null; grid = g ? g.grid : null; }
      const m = markOfEvent(ev, grid);
      if (!m || !Number.isInteger(m.caster) || !Number.isFinite(start) || !(m.landsAtMs > m.fromMs)) return false;
      live.set(m.caster, { tiles: m.tiles, group: m.group, start, lands: start + (m.landsAtMs - m.fromMs) });
      return true;
    },
    /** The caster's spell is over (spell_end) or the caster is (kill). */
    close(caster) { return live.delete(caster); },
    /** A restart of the live view found these units alive: a mark whose caster is not among them is gone. */
    keep(alive) { for (const u of live.keys()) if (!alive.has(u)) live.delete(u); },
    /**
     * The marks to draw at client instant `now`: { kind: 'ground', tiles, fill, alpha } for a marked spell, and
     * { kind: 'group', x, y, fill, alpha } on every hero in `o.heroes` ({ x, y } in tiles) for a group one.
     * `o.gone(u)`: caster u is drawn dead. `o.alpha`: the Danger marks slider, as an opacity.
     * @param {number} now
     * @param {{heroes: {x: number, y: number}[], gone: (u: number) => boolean, alpha: number}} o
     */
    frame(now, o) {
      const out = [];
      for (const [u, m] of live) {
        if (o.gone(u) || now > m.lands + MARK_TIMING.graceMs) { live.delete(u); continue; }
        if (now < m.start) continue;
        const f = Math.min(1, (now - m.start) / (m.lands - m.start));
        const fill = Math.floor(f * MARK_TIMING.steps) / MARK_TIMING.steps;
        if (m.group) for (const h of o.heroes) out.push({ kind: 'group', x: h.x, y: h.y, fill, alpha: o.alpha });
        else if (m.tiles.length) out.push({ kind: 'ground', tiles: m.tiles, fill, alpha: o.alpha });
      }
      return out;
    },
    /** For tests: how many casters hold a mark. */
    size: () => live.size,
  };
}
