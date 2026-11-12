// ════════════════════════════════════════════════════════════════════════
// src/world/idle-motion.js — DO STANDING UNITS BREATHE IN THIS WORLD PANE?
//
// The player's "Idle animations" switch (src/data/world/motion.js), read for the
// frame: the newest pick any open hero holds (src/session/player-switch.js), else
// on, or off when the device asks for reduced motion. world-boot.js puts the
// answer on every frame's state as `stillIdle`, and compose.js holds every idle
// clip on its first frame while it is set: one place, so the town, the home and
// every hunt, viewed or not, obey it from the next frame, with no reload.
//
//   createIdleMotion({ win, character, peers }).still()   true: draw every idle clip still
// ════════════════════════════════════════════════════════════════════════
import { IDLE_MOTION } from '../data/world/motion.js?v=0.2.125';
import { switchOn } from '../session/player-switch.js?v=0.2.125';

/**
 * @param {{win: Window, character?: object|null, peers?: () => object[]}} o  peers: the account's open heroes
 */
export function createIdleMotion(o) {
  /* one query, read each frame (a new matchMedia per frame would be a new object every 16 ms) */
  const mq = o.win && typeof o.win.matchMedia === 'function' ? o.win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const heroes = () => {
    const all = typeof o.peers === 'function' ? o.peers() : [];
    return !o.character || all.includes(o.character) ? all : all.concat(o.character);
  };
  return { still: () => !switchOn(heroes(), IDLE_MOTION, !!(mq && mq.matches)) };
}
