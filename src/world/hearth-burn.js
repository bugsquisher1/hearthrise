// ════════════════════════════════════════════════════════════════════════
// src/world/hearth-burn.js — THE GREAT HEARTH, BURNING WHAT IT IS FED (display only).
//
// Tyler 2026-10-25: "Fuel the hearth" → the hero walks to the Hearth → the item
// burns in the fire. The SERVER decides everything (the bench run or the named
// burn, the stand, the XP, the colour: 2027-01-31-inner-flame.sql); this module
// only draws it, from what the server already said, so nothing here can be spent:
//   A THROW  each hero working a fuel bench at a Hearth fuel stand throws one chunk
//            every BURN_SHOW.throwEveryMs (each throw stands for what burnt since
//            the last; the bag line counts the items): a 16 px world chunk
//            (atlas-common fuel_*, never the UI item icon) in an arc from the hand
//            into the firebox, then the fire's flare. Your own hero throws its
//            fuel's chunk; a peer's everyday fuel is not anyone's business, so a
//            peer throws a plain bone. A named burn throws its own chunk once.
//   THE COLOUR  while the town's answer names a burning flame (TownPresence
//            hearth()), the fire, its flares and sparks are drawn in that colour's
//            art (src/data/hearth.js FLAMES), and the sparks rise on a beat.
// The firebox is the map's own `hearth_fire` ambient (src/data/world/town/sites.js
// AMBIENT), so nothing here names a tile. A colour whose art the atlas lacks draws
// the plain fire (never a missing sprite).
// PURE: no DOM, no window, no clock of its own (the caller passes `now`).
// ════════════════════════════════════════════════════════════════════════
import { FLAMES, BURN_SHOW, HEARTH_FUELS, NAMED_FUELS, fuelRecipeId } from '../data/hearth.js?v=0.2.52';

const CHUNK_OF_RECIPE = new Map(HEARTH_FUELS.map((f) => [fuelRecipeId(f.item), f.chunk]));
const FLARE_MS = 700;        // the flare's 6 frames at 10 fps, and a beat for the sparks
const NAMED_SPARKS_MS = 1200;
/* a stable phase per thrower (0..every), so two heroes side by side never throw in step */
function phaseOf(key, every) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % every;
}

/** The world chunk a fuel bench throws, by the server's pointer (`active_id`), or null when it is not a fuel. */
export const chunkOfRecipe = (id) => CHUNK_OF_RECIPE.get(id) || null;
/** The world chunk a named fuel throws, or null. */
export const chunkOfNamed = (item) => (NAMED_FUELS[item] ? NAMED_FUELS[item].chunk : null);

/**
 * @param {object} map  compileMap() output (a town)
 * @param {{sprites: object}} o  the atlas book's sprites (a colour's art is drawn only if it is there)
 */
export function createHearthBurn(map, o) {
  const fire = (map.ambient || []).find((a) => a.id === FLAMES.fire.fire) || null;
  const T = map.T || 32;
  const has = (id) => !!(o && o.sprites && o.sprites[id]);
  const art = (flame, part) => {
    const f = flame && FLAMES[flame];
    return f && has(f[part]) ? f[part] : FLAMES.fire[part];
  };
  /* the firebox mouth, in tiles (fractional: the ambient's lift above its foot row) */
  const mouth = fire ? { x: fire.x, y: fire.y - (fire.lift || 0) / T } : null;

  /* one throw that started `age` ms ago from tile `from`: the chunk in its arc, then the flare (and named sparks) */
  function throwFx(out, from, chunk, age, flame) {
    if (age < 0) return;
    if (age < BURN_SHOW.throwMs) {
      const t = age / BURN_SHOW.throwMs;
      const sx = from.x, sy = from.y - 0.6;   // from the hand, about chest high
      out.push({ id: chunk, x: sx + (mouth.x - sx) * t, y: sy + (mouth.y - sy) * t - BURN_SHOW.arcTiles * 4 * t * (1 - t), age: 0, lift: 0 });
      return;
    }
    const a = age - BURN_SHOW.throwMs;
    if (a < FLARE_MS) {
      out.push({ id: art(flame, 'flare'), x: fire.x, y: fire.y, age: a, lift: (fire.lift || 0) / 20 });
      if (flame) out.push({ id: art(flame, 'sparks'), x: fire.x, y: fire.y, age: a, lift: (fire.lift || 0) / 20 });
    }
  }

  return {
    /**
     * One frame of the Hearth's effects.
     * @param {{ me?: {key: string, x: number, y: number, chunk: string, since: number}|null,
     *           burn?: {x: number, y: number, chunk: string, at: number}|null,
     *           peers?: {key: string, x: number, y: number}[], flame?: {flame: string, startedAt: number}|null }} env
     *   me: your hero at its fuel stand working a fuel bench (since: when it got there); burn: your named fuel,
     *   thrown once from where the hero stands (at: when it arrived); peers: others working at the Hearth's stands;
     *   flame: TownPresence.hearth()
     * @param {number} now  ms
     * @returns {{ fx: object[], swap: object|null }}
     */
    frame(env, now) {
      const fx = [];
      if (!mouth) return { fx, swap: null };
      const flame = env.flame && FLAMES[env.flame.flame] ? env.flame.flame : null;
      const every = BURN_SHOW.throwEveryMs;
      const cycle = (key, since, from, chunk) => {
        if (!has(chunk)) return;
        /* your hero throws on arrival, then on the beat; a peer on its own phase */
        const start = since === null ? phaseOf(key, every) : since;
        const age = (now - start) % every;
        if (now >= start) throwFx(fx, from, chunk, age, flame);
      };
      for (const p of env.peers || []) cycle(p.key, null, p, 'fuel_bone');
      if (env.me) cycle(env.me.key, env.me.since, env.me, env.me.chunk);
      if (env.burn && has(env.burn.chunk)) throwFx(fx, env.burn, env.burn.chunk, now - env.burn.at, flame);
      /* the colour's sparks rise on a beat while it burns */
      if (flame) {
        const a = (now - env.flame.startedAt) % NAMED_SPARKS_MS;
        if (a >= 0 && a < FLARE_MS) fx.push({ id: art(flame, 'sparks'), x: fire.x, y: fire.y, age: a, lift: (fire.lift || 0) / 20 });
      }
      const swap = flame && art(flame, 'fire') !== FLAMES.fire.fire ? { [FLAMES.fire.fire]: art(flame, 'fire') } : null;
      return { fx, swap };
    },
  };
}
