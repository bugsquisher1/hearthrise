// ════════════════════════════════════════════════════════════════════════
// src/world/town-shows.js — A ROUND'S FIREWORKS OVER HEARTH SQUARE (display only).
//
// The server decides the round and when it plays (2027-02-27-town-shows.sql); this only draws it from TownPresence.round(), so nothing here can be spent.
// One program (ROUND_SHOW.program), so two viewers of one round see one show: each shell climbs from the square, bursts well above it and falls.
// A shell whose art the atlas lacks draws nothing, never a missing sprite. The powders' colors are hearth-burn.js's.
// PURE: no DOM, no window, no clock of its own (the caller passes `now`).
// ════════════════════════════════════════════════════════════════════════
import { ROUND_SHOW } from '../data/gold-sinks.js?v=0.2.119';


/**
 * @param {object} map  compileMap() output (a town)
 * @param {{sprites: object}} o  the atlas book's sprites
 */
export function createTownShows(map, o) {
  const fire = (map.ambient || []).find((a) => a.id === ROUND_SHOW.from) || null;
  const has = (id) => !!(o && o.sprites && o.sprites[id]);
  return {
    /**
     * @param {{startedAt: number, endsAt: number}|null} round  TownPresence.round()
     * @param {number} now ms
     * @returns {object[]} fx entries: { id, x, y, age, lift }
     */
    frame(round, now) {
      if (!fire || !round || now < round.startedAt || now >= round.endsAt) return [];
      const out = [];
      const { rise, riseMs, riseTiles, playMs, beatMs, program } = ROUND_SHOW;
      /* every shell steps on one tick: a frame the list didn't change is never painted again (render/frame-sig.js), however many are up */
      const t = Math.floor((now - round.startedAt) / beatMs) * beatMs;
      for (const [at, id, dx, dy] of /** @type {[number, string, number, number][]} */ (/** @type {unknown} */ (program))) {
        if (t < at - riseMs || t >= at + playMs) continue;
        if (t >= at) { if (has(id)) out.push({ id, age: t - at, lift: 0, x: fire.x + dx, y: fire.y + dy }); continue; }
        /* the climb, slowing as it nears the top; the head arrives where the burst opens */
        const left = (at - t) / riseMs;
        if (has(rise)) out.push({ id: rise, age: riseMs - (at - t), lift: 0, x: fire.x + dx, y: fire.y + dy + riseTiles * left * left });
      }
      return out;
    },
  };
}
