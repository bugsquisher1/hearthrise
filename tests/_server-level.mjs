// ════════════════════════════════════════════════════════════════════════
// tests/_server-level.mjs — THE `level` BLOCK AND THE `skill_levels` SECTION A STUBBED SERVER STATES.
//
// Not a guard: a helper the guards' stub servers import.
//
// hr_state_of states the hero's Level itself: `level` = hr_level_block(level_xp) =
// { xp, level, into, need } on the SERVER's curve. The client reads only that block
// (src/session/character-sections.js levelOf) and never works a Level out of
// `state.level_xp` (lane/c-level-from-server: on 2026-11-10 the browser's copy of the
// curve said Level 20 for a hero the server fought as 19). So a stub that stands in
// for hr_state_of must state the block too, or the page it serves has no Level.
// The same for a skill's bar (lane/c-skills-from-server): hr_state_of's `skill_levels`
// section = { skill: hr_skill_block(skill, xp) } for every skill in the catalogue, and
// the skill ledgers read only that (src/session/item-sections.js skillLevelsOf).
//
//   levelBlock(xp)        what hr_level_block answers for `xp`, on the curve the
//                         server's twin is pinned to (tests/core-curves.mjs holds
//                         hr_char_level / hr_char_xp_for_level to src/core/xp.js)
//   skillBlock(id, xp, level)  what hr_skill_block answers for `xp` in skill `id`, on
//                         the skill curve the server's twin is pinned to (core-curves);
//                         a stub that states a `level` is the server saying it: the
//                         block keeps that level and its marks, the XP into it held
//                         inside the level (fixtures written before a curve moved)
//   withServerLevel(env)  `env` with its `level` block stated from its own
//                         state.level_xp, and its `skill_levels` from its own `skills`
//                         (every SKILLS_DEF skill; one `skills` does not hold reads 0 XP),
//                         in place. A block or a section already there is LEFT ALONE: a
//                         test that makes the server and this build's curve disagree
//                         sets it itself (tests/session-core.mjs LVL-1 .. LVL-4, SKL-1 ..).
//
// NO ?v= on the imports (tests/**, not a browser module).
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════
import { charLevelFromXp, charXpForLevel, skillLevelFromXp, skillXpForLevel, skillCapOf } from '../src/core/xp.js';
import { SKILLS_DEF } from '../src/data/skills.js';

/** hr_level_block(xp): { xp, level, into, need }. */
export function levelBlock(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const level = charLevelFromXp(x);
  const lo = charXpForLevel(level);
  return { xp: x, level, into: x - lo, need: charXpForLevel(level + 1) - lo };
}

/** hr_skill_block(id, xp): { xp, level, into, need } (need 0 at a capped skill's last level); `level` when the stub states one. */
export function skillBlock(id, xp, level) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const lv = Number.isInteger(level) && level >= 1 ? level : skillLevelFromXp(id, x);
  const cap = skillCapOf(id);
  const lo = skillXpForLevel(id, lv);
  const need = cap !== null && lv >= cap ? 0 : skillXpForLevel(id, lv + 1) - lo;
  const into = Math.max(0, x - lo);
  return { xp: x, level: lv, into: need > 0 ? Math.min(into, need - 1) : into, need };
}

/** `env` (an hr_state_of answer a stub is about to send) with the server's `level` block and `skill_levels` section. */
export function withServerLevel(env) {
  const st = env && typeof env === 'object' ? env.state : null;
  const xp = st && typeof st === 'object' ? st.level_xp : null;
  if (Number.isSafeInteger(xp) && xp >= 0 && !(env.level && typeof env.level === 'object' && env.level.xp === xp)) env.level = levelBlock(xp);
  const sk = env && typeof env === 'object' ? env.skills : null;
  if (sk && typeof sk === 'object' && !Array.isArray(sk)) {
    const cellOf = (id) => (sk[id] && typeof sk[id] === 'object' ? sk[id] : {});
    const xpOf = (id) => Math.max(0, Math.floor(Number(cellOf(id).xp) || 0));
    /* a section that speaks of these XP (a test's own, made to disagree with this build's curve) is left alone */
    const own = env.skill_levels && typeof env.skill_levels === 'object'
      && Object.keys(SKILLS_DEF).every((id) => env.skill_levels[id] && env.skill_levels[id].xp === xpOf(id));
    if (!own) env.skill_levels = Object.fromEntries(Object.keys(SKILLS_DEF).map((id) => [id, skillBlock(id, xpOf(id), cellOf(id).level)]));
  }
  return env;
}
