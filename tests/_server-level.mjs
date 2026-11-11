// ════════════════════════════════════════════════════════════════════════
// tests/_server-level.mjs — THE `level` BLOCK A STUBBED SERVER STATES.
//
// Not a guard: a helper the guards' stub servers import.
//
// hr_state_of states the hero's Level itself: `level` = hr_level_block(level_xp) =
// { xp, level, into, need } on the SERVER's curve. The client reads only that block
// (src/session/character-sections.js levelOf) and never works a Level out of
// `state.level_xp` (lane/c-level-from-server: on 2026-11-10 the browser's copy of the
// curve said Level 20 for a hero the server fought as 19). So a stub that stands in
// for hr_state_of must state the block too, or the page it serves has no Level.
//
//   levelBlock(xp)        what hr_level_block answers for `xp`, on the curve the
//                         server's twin is pinned to (tests/core-curves.mjs holds
//                         hr_char_level / hr_char_xp_for_level to src/core/xp.js)
//   withServerLevel(env)  `env` with its `level` block stated from its own
//                         state.level_xp, in place. A block that already speaks of
//                         that XP is LEFT ALONE: a test that makes the server and
//                         this build's curve disagree sets it itself
//                         (tests/session-core.mjs LVL-1 .. LVL-4).
//
// NO ?v= on the imports (tests/**, not a browser module).
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════
import { charLevelFromXp, charXpForLevel } from '../src/core/xp.js';

/** hr_level_block(xp): { xp, level, into, need }. */
export function levelBlock(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const level = charLevelFromXp(x);
  const lo = charXpForLevel(level);
  return { xp: x, level, into: x - lo, need: charXpForLevel(level + 1) - lo };
}

/** `env` (an hr_state_of answer a stub is about to send) with the server's `level` block for its state.level_xp. */
export function withServerLevel(env) {
  const st = env && typeof env === 'object' ? env.state : null;
  const xp = st && typeof st === 'object' ? st.level_xp : null;
  if (!Number.isSafeInteger(xp) || xp < 0) return env;
  if (!(env.level && typeof env.level === 'object' && env.level.xp === xp)) env.level = levelBlock(xp);
  return env;
}
