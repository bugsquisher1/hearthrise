// ════════════════════════════════════════════════════════════════════════
// src/data/world/monster-names.js — THE MONSTER NAMES SWITCH, AS DATA.
//
// Tyler 2026-11-14: "should be a toggle to turn on enemy names right?"
// Settings > Interface > "Monster names" is a player switch
// (src/session/player-switch.js): one pick for every hero, kept in the residue,
// read by the live hunt (src/hunt-view/scene.js readHunt). On, every living
// monster carries its name over its head in the plate tone the hunt already
// gave bystanders; a boss always shows its own name, in the brighter foe tone.
// A name gives way in a crowd rather than stacking (src/world/core/plates.js).
// Off by default: his words were "turn on", and a full pull reads cleaner bare.
// Display only: it gates and spends nothing.
//
//   field      the residue field that holds the pick: { on, at }
//   defaultOn  a player who never pressed it sees no names but the bosses'
//   label      the Settings row's words
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
export const MONSTER_NAMES = Object.freeze({
  field: 'monsterNames',
  defaultOn: false,
  label: 'Monster names',
});
