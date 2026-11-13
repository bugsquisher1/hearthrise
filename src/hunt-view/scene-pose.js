/* WHERE A HUNT'S UNIT STANDS AND WHICH WAY IT FACES (split out of scene.js by job: pure helpers, no scene state).
   The scene (scene.js) asks them each frame; nothing here holds or writes anything. */
import { groundOfHunt } from '../data/hunt-grounds.js?v=0.2.126';

/* The ground's first start tile, standing (the hero before its first window). */
export function entranceOf(huntId) {
  const g = huntId ? groundOfHunt(huntId) : null;
  const t = g && g.start && g.start[0];
  return t ? { x: t[0], y: t[1], moving: false, d: 0, hx: 0, hy: 1 } : null;
}

/**
 * A STANDING UNIT BREATHES: its idle clip turns on the clock, one frame edge for everyone on screen, so a hunt held still
 * paints at the clip's rate however many stand in it (frame-sig.js holds every frame between two edges). Each unit starts the
 * loop at its own frame, so a pack never breathes in step. A one-frame idle (a hero) is the same rect every turn and asks for no paint.
 */
export function idleFrame(idle, now, u) {
  return idle && idle.fps ? Math.floor((now * idle.fps) / 1000) + u : 0;
}

/** The facing of a heading: the cardinal (larger axis; east/west on a tie) and the diagonal, if any. */
export function facingOf(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return { dir: 's', diag: null };
  const dir = ax >= ay ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
  const diag = ax && ay && Math.min(ax, ay) / Math.max(ax, ay) >= Math.tan(Math.PI / 8) ? (dy > 0 ? 's' : 'n') + (dx > 0 ? 'e' : 'w') : null;
  return { dir, diag };
}
