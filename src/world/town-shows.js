// ════════════════════════════════════════════════════════════════════════
// src/world/town-shows.js — A ROUND'S FIREWORKS OVER HEARTH SQUARE (display only).
//
// The server decides the round and when it plays (2027-02-27-town-shows.sql); this only draws it from TownPresence.round(), so nothing here can be spent.
// Fireworks draw over Hearth Square, where idle heroes stand: every burst's place and color follow from the round's own start and its count, so two viewers
// of one round see the same show. A burst whose art the atlas lacks draws nothing, never a missing sprite. The powders' colors are hearth-burn.js's.
// PURE: no DOM, no window, no clock of its own (the caller passes `now`).
// ════════════════════════════════════════════════════════════════════════
import { ROUND_SHOW } from '../data/gold-sinks.js?v=0.2.93';

/* a stable spread per burst: the same round draws the same show on every screen */
const mix = (n) => { let h = Math.imul(n + 1, 2654435761) >>> 0; h ^= h >>> 13; return Math.imul(h, 1597334677) >>> 0; };

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
      const { everyMs, playMs, spreadTiles, southTiles, bursts } = ROUND_SHOW;
      const newest = Math.floor((now - round.startedAt) / everyMs);
      for (let i = Math.max(0, newest - Math.ceil(playMs / everyMs)); i <= newest; i++) {
        const age = now - round.startedAt - i * everyMs;
        if (age < 0 || age >= playMs) continue;
        const h = mix(i);
        const id = bursts[h % bursts.length];
        if (!has(id)) continue;
        out.push({ id, age, lift: 0,
          x: fire.x + ((h >>> 8) % (2 * spreadTiles + 1)) - spreadTiles,
          y: fire.y + southTiles + ((h >>> 16) % (2 * spreadTiles + 1)) - spreadTiles });
      }
      return out;
    },
  };
}
