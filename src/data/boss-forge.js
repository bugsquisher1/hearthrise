// ════════════════════════════════════════════════════════════════════════
// src/data/boss-forge.js — WHAT A DUNGEON CLEAR BUILDS TOWARD (W0, 2026-10-10)
//
// Game-designer ruling, coherence audit 2026-10-09 ("Boss materials craft the
// best gear, and boss trophies hang in your trophy room"). Two holes closed:
//
//   1. THREE BOSS MATERIALS CRAFTED NOTHING. Void Essence and Riftmaw Husk (the
//      Voidbringer, Lv 80) and Elderscale Heart (the Ancient Wyrm, Lv 95) were
//      the rarest rows in two chests and had no recipe and no use — vendor
//      trash with a legendary border. Each now forges the BEST BODY PIECE of
//      one armour line, so all three combat styles have a boss chase:
//        Elderscale Heart → Elderscale Platebody   (plate,   melee)
//        Riftmaw Husk     → Riftmaw Carapace       (leather, ranged)
//        Void Essence     → Voidheart Robe         (cloth,   magic)
//      Each piece is its Dawnsteel-tier twin plus a modest step (about +15%
//      on the line's own stat), gated ABOVE the twin's Defence 88, so it is a
//      real upgrade and never a sidegrade. Expected clears to one piece, from
//      the chest rows: heart 1 at 25% ≈ 4, husk 3 at 0.30×1.5 ≈ 7, essence 2 at
//      25% ≈ 8 — a week or two of runs, which is the point.
//      BIND-ON-PICKUP (Tyler's rule, 2026-08-09): boss GEAR is the reward for
//      clearing the fight yourself; the MATERIALS stay as tradeable as they
//      already were (Void Essence was already BoP), so a crafter can still buy
//      a husk or a heart and the market keeps its role.
//      Values sit at the twin's value × 1.1 — inside the existing gear value
//      curve, so no new vendor route opens (a non-raw item vendors at `v`).
//
//   2. FOUR BOSS TROPHIES DID NOTHING. Warboss Standard, Archivist Seal,
//      Voidwoven Sigil and Dragon Relic now HANG in the House Trophy Room: the
//      room lists each one, says where the missing ones come from, and lights a
//      lamp in the room's scene for each one you hold. A DISPLAY effect only —
//      no stat, no XP, no server column — so a trophy can never become a power
//      item or a market speculation on power. Holding one (bag or depot) is
//      hanging it; the count is read from the server-projected bag and depot.
//
// PURE DATA. Merged into ITEMS (items.js), ARTISAN_RECIPES (recipes.js) and
// ITEM_DESC (item-descriptions.js). The server half is
// supabase/migrations/2026-10-16-w0f-fun-content.sql (hr_items, hr_item_slots,
// hr_activities) and the recipe input maps reach the realm through the edge
// payload, which imports recipes.js. Guarded by tests/w0f-fun-content.mjs.
// ════════════════════════════════════════════════════════════════════════

export const BOSS_FORGE_ITEMS = {
  elderscale_platebody: {
    n: 'Elderscale Platebody', icon: '🛡️', v: 118800, bop: true,
    type: 'armor', slot: 'body', armourClass: 'plate',
    defB: 104, strB: 4, rangeAtkB: -26, magicAtkB: -52,
    rarity: 'unique', tier: 8, reqSkill: 'defense', reqLv: 95,
  },
  riftmaw_carapace: {
    n: 'Riftmaw Carapace', icon: '🎽', v: 83160, bop: true,
    type: 'armor', slot: 'body', armourClass: 'leather',
    defB: 56, rangeAtkB: 52, critB: 0.035, magicAtkB: -15,
    rarity: 'unique', tier: 8, reqSkill: 'defense', reqLv: 90,
  },
  voidheart_robe: {
    n: 'Voidheart Robe', icon: '🧥', v: 83160, bop: true,
    type: 'armor', slot: 'body', armourClass: 'cloth',
    defB: 30, magicAtkB: 62, magicStrB: 42, atkB: -23, rangeAtkB: -18,
    rarity: 'unique', tier: 8, reqSkill: 'defense', reqLv: 90,
  },
};

/* The recipes. Bench levels sit at the top of each bench (Dawnsteel Platebody
   forges at Smithing 98, the Voidhide/Voidweave bodies at Crafting 94), and
   each consumes its Dawnsteel-tier twin's own wood or metal so the piece is
   SELF-SUPPLIED at its level (the 2026-09-13 self-supply ruling). */
export const BOSS_FORGE_RECIPES = {
  smithing: [
    { id: 'forge_elderscale_platebody', name: 'Forge Elderscale Platebody', icon: '🛡️',
      inputs: { elderscale_heart: 1, dawn_bar: 6 }, output: 'elderscale_platebody', xp: 4200, req: 97, ms: 6800 },
  ],
  crafting: [
    { id: 'craft_riftmaw_carapace', name: 'Stitch Riftmaw Carapace', icon: '🎽',
      inputs: { riftmaw_husk: 3, duskwood_plank: 4, shadow_thread: 4 }, output: 'riftmaw_carapace', xp: 3600, req: 95, ms: 6400 },
    { id: 'weave_voidheart_robe', name: 'Weave Voidheart Robe', icon: '🧥',
      inputs: { void_essence: 2, duskwood_plank: 3, magic_essence: 6 }, output: 'voidheart_robe', xp: 3600, req: 95, ms: 6400 },
  ],
};

export const BOSS_FORGE_DESC = {
  elderscale_platebody: "Dawnsteel plate hammered around the Great Wyrm's still-cold heart; nothing in the realm turns a blow better",
  riftmaw_carapace: "The Riftmaw's shed husk, split and stitched over duskwood ribs, light as leather and steadying every shot",
  voidheart_robe: 'A robe woven through with distilled void, and every spell cast in it lands as if the dark were pushing',
};

/* THE TROPHY WALL'S BOSS ROW. Order is the order a player meets the bosses.
   `dungeon` is the DUNGEONS id the trophy drops from (asserted against the
   chest tables by tests/w0f-fun-content.mjs, so a moved row cannot leave the
   source line lying). `line` is the one sentence the room shows once it
   hangs. No numbers, no effect fields: this is a display. */
export const BOSS_TROPHIES = Object.freeze([
  Object.freeze({ item: 'warboss_standard', dungeon: 'goblin_warcamp', boss: 'Grimtusk',
    line: 'Hung over the door, torn and proud. The warcamp will not be raising it again.' }),
  Object.freeze({ item: 'lexarch_seal', dungeon: 'haunted_archive', boss: 'The Pale Archivist',
    line: 'Set in a glass case. Now and then a page turns somewhere in the house.' }),
  Object.freeze({ item: 'voidwoven_sigil', dungeon: 'voidbringer', boss: 'The Riftmaw',
    line: 'Pinned above the hearth, still slowly moving. The fire leans toward it.' }),
  Object.freeze({ item: 'dragon_relic', dungeon: 'ancient_wyrm', boss: 'Elderscale',
    line: 'The centre of the hall. Guests stop talking when they see it.' }),
]);

/** How many of the boss trophies a holder owns, from a {id: qty} map (or
    several, summed). Pure; the caller passes the server-projected bag/depot. */
export function bossTrophiesHeld(...stores) {
  return BOSS_TROPHIES.filter((t) => stores.some((s) => s && Number(s[t.item]) > 0)).map((t) => t.item);
}
