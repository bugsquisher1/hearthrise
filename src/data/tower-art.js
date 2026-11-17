// ════════════════════════════════════════════════════════════════════════
// src/data/tower-art.js — WHERE THE BURNING TOWER WINDOW'S ART SITS (direction A "The Chimney", Tyler 2026-11-16), in ART PIXELS.
//
// ONE SOURCE for the pieces tools/world-art/tower-window-art.mjs cuts (assets/ui/tower/) and the window that lays them at x2
// (src/shell/tower-stage.js, src/shell/windows/tower-chest.js, src/styles/tower.css reads them as custom properties). Art only: no number a
// player acts on lives here (every floor, key and count is the server's `tower` section).
// ════════════════════════════════════════════════════════════════════════

/** The window's one density: every art pixel is SCALE x SCALE CSS px (ART_DIRECTION §2). */
export const SCALE = 2;

export const TOWER_ART = Object.freeze({
  /* the chimney's straight stack in great_hearth.png: one course, repeated up the tower */
  COURSE: Object.freeze({ x: 151, y: 18, w: 45, h: 18 }),
  /* the phone's narrower stack: the same courses' middle 30 px, so the tower and its words fit a sheet */
  COURSE_NARROW: Object.freeze({ x: 158, y: 18, w: 30, h: 18 }),
  /* a landing's band reaches 3 px past the stack each side; its plate stands 1 row over the band */
  LANDING_W: 51, LANDING_W_NARROW: 36, LANDING_H: 9,
  /* the floors: art px a floor up the stack, and the plain band's row in landings.png (after the CHEST_KEYS rows) */
  PPF: 4,
  TICK_W: 4, TICK_H: 3,
  /* an opening left this week (the Chest tab's Opens left): an ember EMBER x EMBER */
  EMBER: 8,
  /* a hero's head: HEAD_W x HEAD_H from HEAD_TOP down the 64 x 64 idle south frame, centred */
  HEAD_W: 22, HEAD_H: 20, HEAD_TOP: 21,
  /* THE CHEST TAB: the firebox's crop of great_hearth.png, and what sits in it (crop px) */
  FIREBOX: Object.freeze({ x: 20, y: 223, w: 306, h: 96 }),
  /* the hearth's fire loop at the hearth frame's px (146, 238) (great_hearth.json notes), 8 frames at 8 fps */
  FIRE_AT: Object.freeze({ x: 126, y: 15, w: 61, h: 49, frames: 8, fps: 8 }),
  /* the chest ON THE LEDGE beside the fire (Tyler 2026-11-16), its foot where the town map puts it (the hearth frame's px (230, 311): against
     the pier right of the firebox, lane/fix137-hearth-chest-art) */
  CHEST_AT: Object.freeze({ x: 195, y: 60, w: 31, h: 29, frames: 8, fps: 8 }),
  /* the opening and the weapon's column (48 x 64 frames, tower-art.mjs FW x FH) lay the open box over the shut chest */
  REVEAL_AT: Object.freeze({ x: 187, y: 26, w: 48, h: 64 }),
  /* the phone's view of the scene: the fire, the chest and the ledge, nothing cut through */
  PHONE_VIEW: Object.freeze({ x: 100, y: 16, w: 196, h: 80 }),
});
