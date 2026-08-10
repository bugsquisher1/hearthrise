// ============================================================
// src/data/bosses.js — the canonical, data-driven BOSS REGISTRY (b281)
//
// The audit found bosses lived in THREE incompatible shapes with no shared
// fields: DUNGEONS[id].boss (name/title only), MONSTERS entries (for Boss of the
// Day), and raids.js BOSSES (weekly clan bosses). Adding a boss meant editing
// several files in several schemas, and no engine could render or balance bosses
// uniformly.
//
// This is the single source of truth for a boss's IDENTITY. Each record carries
// the fields every surface wants — name, title, tier, level, combat style,
// weakness, resistances, a one-line mechanic, and its signature drops — so a new
// boss is ONE data entry here. Surfaces read it by id (e.g. a dungeon links to
// its boss via `dungeon:`); they keep their own loot tables and encounter phases,
// but the boss's identity comes from here. Migrating the other two shapes onto
// this registry is the incremental next step; nothing is ripped out.
//
// Schema:
//   id         — stable key
//   name       — display name (matches the dungeon card + the fight)
//   title      — epithet
//   dungeon    — the DUNGEONS id this boss ends (or null for daily/weekly mobs)
//   tier       — content tier (1..7)
//   reqLv      — recommended combat level
//   style      — the boss's own attack style: melee | ranged | magic
//   weakness   — the weapon type it is weak to (routes the player's loadout)
//   resist     — weapon types it resists (flavour + future mitigation)
//   mechanic   — one player-facing sentence: what makes THIS fight different
//   signature  — the item ids that are this boss's exclusive prize
// ============================================================

export const BOSSES = {
  marrow_king: {
    id: 'marrow_king', name: 'The Marrow King', title: 'Lord of the Bonepit',
    dungeon: 'crypt_of_bones', tier: 2, reqLv: 25, style: 'melee',
    weakness: 'hammer', resist: ['ranged'],
    mechanic: 'Raises skeletons as it fights — bring burst before the swarm builds.',
    signature: ['warboss_standard'],
  },
  grimtusk: {
    id: 'grimtusk', name: 'Grimtusk', title: 'Warlord of the Broken Tusk',
    dungeon: 'goblin_warcamp', tier: 3, reqLv: 35, style: 'melee',
    weakness: 'sword', resist: ['magic'],
    mechanic: 'Enrages below half health, swinging faster and harder.',
    signature: ['wartusk_cleaver', 'warboss_standard'],
  },
  pale_archivist: {
    id: 'pale_archivist', name: 'The Pale Archivist', title: 'Keeper of Forbidden Pages',
    dungeon: 'haunted_archive', tier: 4, reqLv: 45, style: 'magic',
    weakness: 'ranged', resist: ['magic'],
    mechanic: 'Phase-shifts between pages — only vulnerable when it re-forms.',
    signature: ['whispering_codex', 'lexarch_seal'],
  },
  ashen_king: {
    id: 'ashen_king', name: 'The Ashen King', title: 'Lord of the Obsidian Throne',
    dungeon: 'obsidian_keep', tier: 5, reqLv: 65, style: 'magic',
    weakness: 'hammer', resist: ['sword'],
    mechanic: 'Calls down dark-magic barrages you must weather between swings.',
    signature: ['ashcrown_greatsword'],
  },
  riftmaw: {
    id: 'riftmaw', name: 'The Riftmaw', title: 'The Devouring Rift',
    dungeon: 'voidbringer', tier: 6, reqLv: 80, style: 'magic',
    weakness: 'ranged', resist: ['magic'],
    mechanic: 'Tears rifts that pour in reinforcements until you seal them.',
    signature: ['voidmaw_scepter', 'voidwoven_sigil'],
  },
  elderscale: {
    id: 'elderscale', name: 'Elderscale, the Great Wyrm', title: 'Eldest of Dragons',
    dungeon: 'ancient_wyrm', tier: 7, reqLv: 95, style: 'ranged',
    weakness: 'ranged', resist: ['melee'],
    mechanic: 'Breathes dragonfire in waves — dodge, load the ballista, then strike.',
    signature: ['dragonfang_pike', 'elderscale_heart'],
  },
};

// Reverse index: dungeon id → boss record (so a dungeon surface can look up its
// boss's identity/weakness/mechanic without duplicating it).
export const BOSS_BY_DUNGEON = (() => {
  const out = {};
  Object.values(BOSSES).forEach((b) => { if (b.dungeon) out[b.dungeon] = b; });
  return out;
})();
