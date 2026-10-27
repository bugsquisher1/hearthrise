// ════════════════════════════════════════════════════════════════════════
// src/world/core/roofs.js — WHICH ROOF LIFTS.
//
// A roof hides ONLY for the building whose rect contains YOUR tile. Other
// players are not an input to any function here, so a peer walking into a
// house can never lift its roof for you (or show you who is inside). The
// building you are in is drawn from the inside (compose.js: north face, side
// caps, a south stub); every other building shows its front face under its
// roof. Roofs fade over ROOF_FADE_MS rather than popping.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { inRect } from './grid.js?v=0.2.55';

export const ROOF_FADE_MS = 150;

/** The id of the building the local hero stands in (tile coords, rounded), or null. */
export function heroBuilding(buildings, hero) {
  if (!hero) return null;
  const x = Math.round(hero.x), y = Math.round(hero.y);
  const b = (buildings || []).find((bd) => inRect(bd.rect, x, y));
  return b ? b.id : null;
}

/** Target roof alpha per building: 0 for the hero's own building, 1 for every other. */
export function roofTargets(buildings, heroId) {
  const out = {};
  for (const b of buildings || []) out[b.id] = b.id === heroId ? 0 : 1;
  return out;
}

/** Move an alpha toward its target at 1 per ROOF_FADE_MS. */
export function stepAlpha(current, target, dtMs) {
  const step = Math.max(0, dtMs) / ROOF_FADE_MS;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
