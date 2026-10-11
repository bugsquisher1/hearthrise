// ════════════════════════════════════════════════════════════════════════
// src/data/champions.js — THE FIELD CHAMPIONS' RELICS (W0, 2026-10-10)
//
// Game-designer ruling, coherence audit 2026-10-09: "a fight-only player meets
// something new before combat 25". Field bosses existed only at tier 6, so a
// player who only fought saw the same tier-1 and tier-2 rosters from combat 1
// to combat 30 with nothing to aim at. Each of tiers 1–5 now has ONE named
// CHAMPION (the rows live in the roster, src/data/monsters.js, flagged
// `champion: true`), and each champion carries ONE relic of its own:
//
//   T1 Old Tusker      (combat 0+)   → Tusker's Charm      necklace
//   T2 Gnoll Packlord  (combat 15+)  → Packlord's Band     ring
//   T3 The Mire Witch  (combat 30+)  → Mirewort Drops      earrings
//   T4 The Barrow King (combat 45+)  → Barrow-King's Mantle cape
//   T5 The Frost Jarl  (combat 60+)  → Jarl's Rimetorc     necklace
//
// A CHAMPION is a step into the next tier's danger at its own tier's gate: its
// hp/atk/def/xp/gp sit inside [its own tier's band floor, the NEXT tier's band
// ceiling] (monster-classes.js `championBand`, asserted by auditRoster). It is
// never `boss: true` — the Boss of the Day pools, renown's boss-kill term and
// the bounty board's boss exclusion stay exactly as they were — and it is kept
// OFF the bounty board (src/core/bounty.js) so a contract never asks for thirty
// of a monster that takes three times as long to fell.
//
// THE RELIC is a trinket (the four trinket slots are where the smiths' ladder
// is thinnest), seated between the crafted/looted pieces either side of its
// wield level so it is an upgrade worth wearing and never the best in slot for
// long. It drops at roughly two expected hours of hunting the champion at its
// tier's loadout — rare enough to be a moment, near enough to be a goal. The
// row is SERVER-REVEALED (`champion: true` on the drop row): the client never
// shows or credits its own dice for it (src/features/lucky-finds.js), only the
// realm's `rare_drop` event, which is the "Rare find" toast with base odds.
// Tradeable, like every field drop. Measured and capped by
// tests/w0f-fun-content.mjs (hours band, faucet share, one source per relic).
//
// PURE DATA, merged into ITEMS and ITEM_DESC.
// ════════════════════════════════════════════════════════════════════════

export const CHAMPION_ITEMS = {
  tusker_charm: {
    n: "Tusker's Charm", icon: '📿', v: 140, type: 'jewelry', slot: 'necklace',
    atkB: 2, strB: 1, defB: 1, rarity: 'uncommon', tier: 1, reqSkill: 'defense', reqLv: 8,
  },
  packlord_band: {
    n: "Packlord's Band", icon: '💍', v: 420, type: 'jewelry', slot: 'ring',
    atkB: 3, strB: 3, critB: 0.005, rarity: 'rare', tier: 2, reqSkill: 'defense', reqLv: 22,
  },
  mirewort_drops: {
    n: 'Mirewort Drops', icon: '💎', v: 800, type: 'jewelry', slot: 'earrings',
    defB: 3, critB: 0.015, magicAtkB: 3, rarity: 'rare', tier: 3, reqSkill: 'defense', reqLv: 38,
  },
  barrowking_mantle: {
    n: "Barrow-King's Mantle", icon: '🦸', v: 1700, type: 'armor', slot: 'cape',
    defB: 12, strB: 3, rarity: 'epic', tier: 4, reqSkill: 'defense', reqLv: 52,
  },
  jarls_rimetorc: {
    n: "Jarl's Rimetorc", icon: '📿', v: 3300, type: 'jewelry', slot: 'necklace',
    atkB: 7, strB: 6, defB: 3, rarity: 'legendary', tier: 5, reqSkill: 'defense', reqLv: 66,
  },
};

export const CHAMPION_DESC = {
  tusker_charm: 'A cracked tusk from the oldest boar in the woods, strung on a thong to make its wearer braver than is wise',
  packlord_band: 'A crude iron band the Packlord wore on one claw, and the gnolls followed whoever held it',
  mirewort_drops: 'Two beads of bog-amber with a sprig of mirewort sealed inside, humming faintly when a spell is near',
  barrowking_mantle: 'The mouldering cloak of a king who would not stay buried, and it still remembers how to hold a line',
  jarls_rimetorc: 'A torc of frozen iron worn by the Frost Jarl; it never warms, and neither does the one who wears it',
};

/** The champion id for each tier, the order the roster appends them. */
export const CHAMPION_BY_TIER = Object.freeze({
  1: 'old_tusker', 2: 'gnoll_packlord', 3: 'mire_witch', 4: 'barrow_king', 5: 'frost_jarl',
});
