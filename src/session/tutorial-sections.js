// ════════════════════════════════════════════════════════════════════════
// src/session/tutorial-sections.js — THE TUTORIAL CARD A CHARACTER IS ON.
//
// PURE. The card is read from what the server projects (Level XP, skills, the
// open hunt and its units, the stored bar), never from a client counter, so it
// is the same after a reload, on another device, and while the browser was
// closed (CLAUDE.md §6). The rules live in src/data/hunt-tutorial.js currentCard.
// ════════════════════════════════════════════════════════════════════════
import { currentCard, nextGoal, ROLE_SKILL } from '../data/hunt-tutorial.js?v=0.2.30';
import { levelOf } from './character-sections.js?v=0.2.30';
import { huntOf, settingsOf } from './hunt-sections.js?v=0.2.30';
import { skillsOf } from './item-sections.js?v=0.2.30';

/** The facts currentCard judges, or null until the server has told the Level XP. */
function tutorialFactsOf(cs) {
  const lv = levelOf(cs);
  if (!lv) return null;
  const h = huntOf(cs);
  const open = h && !h.ended ? h : null;
  const sk = skillsOf(cs);
  const st = settingsOf(cs);
  return {
    levelXp: lv.xp, charLevel: lv.level,
    skillLevel: sk ? Math.max(1, ...Object.values(sk).map((r) => r.level)) : 1,
    huntId: open ? open.huntId : null,
    unitKinds: new Set(open ? Array.from(open.units.values()).filter((u) => u.side === 'monster' && u.kind).map((u) => u.kind) : []),
    /* The player SAVED a slot with a condition: the stored bar (the start kit's bar is only shown until then). */
    barSet: !!st && st.storedBar.some((s) => s && Array.isArray(s.conditions) && s.conditions.length > 0),
  };
}

/** The pointer line: the tutorial card this character is on while the guide runs (null until the server has
 *  said), then the "What next" goal (src/data/hunt-tutorial.js
 *  nextGoal: the next ground by Level and the weapon skill's next unlock), or null until the server has said. */
export function pointerCardOf(cs) {
  const f = tutorialFactsOf(cs);
  if (!f) return null;
  const card = currentCard(f);
  if (card) return card;
  const role = (settingsOf(cs) || {}).role || null;
  const sk = skillsOf(cs);
  const skill = ROLE_SKILL[role];
  return nextGoal({ charLevel: f.charLevel, role, skillLevel: sk && skill && sk[skill] ? sk[skill].level : null });
}
