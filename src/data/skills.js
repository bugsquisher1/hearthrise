// ════════════════════════════════════════════════════════════════════════
// src/data/skills.js — THE SKILL LIST (docs/design/CORE_MODEL.md §1; Tyler
// 2026-10-14 / 2026-10-19).
//
// combat   Melee, Ranged, Magic, Defense, Inner Flame: trained by use, NO cap
//          (Inner Flame replaced Prayer, Tyler 2026-10-25: trained by fuelling
//          the Great Hearth in Havora's square, src/data/hearth.js)
//          (src/core/xp.js skill curve). There is no Hitpoints, Attack or
//          Strength skill.
// gather / artisan   capped at 99 (src/core/xp.js XP_TABLE).
//
// LEVEL IS NOT A SKILL: it comes from kills only and lives in
// player_state.level_xp (src/core/xp.js charLevelFromXp), so no skill list,
// board or tooltip can draw it as one.
//
// Adding a row here gives a skill its Skills-window line, its hr_skills
// catalogue row (tools/gen-catalogues.mjs) and its 0-XP start on every new
// character (src/data/start-kit.js).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const SKILLS_DEF = {
  melee: { name: 'Melee', icon: '⚔️', cat: 'combat' },
  ranged: { name: 'Ranged', icon: '🏹', cat: 'combat' },
  magic: { name: 'Magic', icon: '🔮', cat: 'combat' },
  defense: { name: 'Defense', icon: '🛡️', cat: 'combat' },
  inner_flame: { name: 'Inner Flame', cat: 'combat' },   // no emoji: its glyph is a hearth (skill-guide.js), never a flame bolt
  woodcutting: { name: 'Woodcutting', icon: '🪓', cat: 'gather' },
  mining: { name: 'Mining', icon: '⛏️', cat: 'gather' },
  fishing: { name: 'Fishing', icon: '🎣', cat: 'gather' },
  farming: { name: 'Farming', icon: '🌾', cat: 'gather' },
  cooking: { name: 'Cooking', icon: '🍳', cat: 'artisan' },
  crafting: { name: 'Crafting', icon: '🔨', cat: 'artisan' },
  smithing: { name: 'Smithing', icon: '🔩', cat: 'artisan' },
  runecrafting: { name: 'Runecrafting', icon: '🔮', cat: 'artisan' },
};

/* The uncapped skills: every `combat` row. A death costs each of them the same
   fraction of its progress toward its next level as the Level loses
   (src/data/hunt-sessions.js DEATH_XP_LOSS; never a level). */
export const COMBAT_SKILLS = Object.freeze(Object.keys(SKILLS_DEF).filter((id) => SKILLS_DEF[id].cat === 'combat'));

/* The skill a weapon family's damage trains and its accuracy and max hit read
   (CORE_MODEL.md §4). Magic is trained by mana spent, never by damage. */
export const FAMILY_SKILL = Object.freeze({ sword: 'melee', hammer: 'melee', axe: 'melee', ranged: 'ranged', magic: 'magic', neutral: 'melee' });
/* The families whose landed blows pay damage XP (magic pays per mana spent). */
export const DAMAGE_XP_FAMILIES = Object.freeze(['sword', 'hammer', 'axe', 'ranged', 'neutral']);
