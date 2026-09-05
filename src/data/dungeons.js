// ============================================================================
// src/data/dungeons.js — THE DUNGEON REGISTRY, single source.
//
// The solo/epic/legendary dungeon instances (src/dungeons.js) used to live as an
// inline `var DUNGEONS = {...}` literal INSIDE that classic-script IIFE — a file
// the pure data layer and a Node generator could not import (it references
// window/document/setInterval throughout). That made the dungeon SETTLEMENT
// CATALOGUE (each dungeon's required level, cooldown, entry key, and its loot
// table) un-server-knowable, so scrip + run loot could only be minted CLIENT-side
// (awardDungeonScrip / awardLoot → window.addItem / G.inventory). Under
// src/net/capstone.js BLOB_RETIRED the reload rebuilds the bag from the server
// envelope only, so every client-minted reward vanished on reload — the reported
// "dungeon scrip goes to 0" P1 (docs/design/dungeon-settlement.md §0).
//
// This module IS the extraction. It holds the full dungeon records verbatim, so:
//   · src/dungeons.js / src/dungeon-scavenger.js consume it via window.DUNGEONS
//     (published by src/main.js, exactly like window.RAID_BOSSES / window.BOSSES)
//     — ONE copy, no duplication, no drift, no double-authored data.
//   · tools/gen-dungeon-catalogue.mjs imports DUNGEONS (Node ESM) and generates
//     the DB catalogues hr_dungeons (req_lv / cooldown_s / cost_key / kind) and
//     hr_dungeon_loot (per-dungeon loot rows), which hr_dungeon_settle reads to
//     credit scrip + loot server-side. A `--check` drift guard (wired into
//     tests/run-smoke.mjs) fails the build if the generated SQL falls out of step
//     with this data — so the SQL copy cannot rot (the src/main.js `unifyObject`
//     failure this whole layer was written to avoid).
//
// ⚠ LOOT `qty` IS `[min, max]` INCLUSIVE and `chance` is a probability in (0,1].
//   The server (hr_dungeon_settle) rolls each row with the SEEDED server PRNG;
//   the client renders the range but no longer rolls it. `id` order is preserved
//   as the catalogue's insert order — the server iterates it deterministically.
//
// PURE ESM. No DOM. Imports cleanly in Node and Deno.
// ============================================================================

export const DUNGEONS = {
  // ---- Solo dungeons ----
  crypt_of_bones: {
    name: 'Crypt of Bones', glyph: 'uiSkull', kind: 'dungeon',
    reqLv: 25, cost: { key: 'bone_key' },
    duration: 60,
    cooldownH: 4,
    boss: { name: 'The Marrow King', title: 'Lord of the Bonepit' },
    desc: 'A small crypt swarming with skeletons. The Marrow King waits at its heart — bones, a blueprint, and a deed for the taking.',
    loot: [
      { id: 'big_bones', qty: [10, 30], chance: 1.0 },
      { id: 'grave_dust', qty: [1, 3], chance: .85 },
      { id: 'kitchen_blueprint_t2', qty: [1, 1], chance: .12 },
      { id: 'farm_deed', qty: [1, 1], chance: .20 },
    ],
    phases: [
      { type:'gather', label:'Gather torches', glyph:'uiFire', target: 8, durationS: 25,
        desc: 'Light the dark crypt. Click a torch each time one appears.' },
      { type:'fight', label:'Skeleton swarm', glyph:'uiSkull', enemyHp: 60, durationS: 70,
        desc: 'Attack on the beat. Time your click as the marker hits the target band.' },
      { type:'puzzle', label:'Sealed sarcophagus', glyph:'uiChest',
        question: 'Which sigil seals an undead?',
        options: ['Sun', 'Moon', 'Bone', 'Wave'],
        correct: 0,
        desc: 'Pick the correct rune to claim the prize within.' },
    ],
  },
  goblin_warcamp: {
    name: 'Goblin Warcamp', glyph: 'uiSword', kind: 'dungeon',
    reqLv: 35, cost: { key: 'goblin_seal' },
    duration: 90,
    cooldownH: 6,
    boss: { name: 'Grimtusk', title: 'Warlord of the Broken Tusk' },
    desc: 'Sack the warcamp. Grimtusk rules the horde — cut the warlord down for his cleaver.',
    loot: [
      { id: 'goblin_totem', qty: [3, 8], chance: 1.0 },
      { id: 'warlord_badge', qty: [1, 2], chance: .35 },
      { id: 'forge_blueprint_t2', qty: [1, 1], chance: .15 },
      { id: 'warboss_standard', qty: [1, 1], chance: .18 },
      { id: 'wartusk_cleaver', qty: [1, 1], chance: .06 },
      { id: 'farm_deed', qty: [1, 1], chance: .22 },
    ],
    phases: [
      { type:'gather', label:'Sneak past patrols', glyph:'uiSearch', target: 10, durationS: 30,
        desc: 'Tap each green window the moment a patrol turns away.' },
      { type:'dodge', label:'Trap corridor', glyph:'uiWarn', target: 5, durationS: 40,
        desc: 'Dodge swinging blades — click DODGE when the prompt flashes.' },
      { type:'fight', label:'Grimtusk, the Broken-Tusk Warlord', glyph:'uiSword', enemyHp: 180, durationS: 90, boss: true,
        desc: 'Grimtusk himself. Time attacks on the beat to break the warlord.' },
    ],
  },
  haunted_archive: {
    name: 'Haunted Archive', glyph: 'uiBook', kind: 'dungeon',
    reqLv: 45, cost: { key: 'arcane_tome' },
    duration: 120,
    cooldownH: 8,
    boss: { name: 'The Pale Archivist', title: 'Keeper of Forbidden Pages' },
    desc: 'A library long abandoned. The Pale Archivist guards its forbidden codex.',
    loot: [
      { id: 'magic_essence', qty: [5, 12], chance: 1.0 },
      { id: 'cracked_spellstone', qty: [1, 3], chance: .60 },
      { id: 'library_blueprint_t2', qty: [1, 1], chance: .15 },
      { id: 'lexarch_seal', qty: [1, 1], chance: .16 },
      { id: 'whispering_codex', qty: [1, 1], chance: .06 },
      { id: 'farm_deed', qty: [1, 1], chance: .25 },
    ],
    phases: [
      { type:'puzzle', label:'Decipher the codex', glyph:'uiBook',
        question: 'Three runes glow in sequence: Sun, Moon, Star. What completes the cycle?',
        options: ['Dark', 'Star', 'Sun', 'Moon'],
        correct: 0,
        desc: 'A clever librarian sees the pattern.' },
      { type:'gather', label:'Bind loose pages', glyph:'uiScroll', target: 12, durationS: 35,
        desc: 'Pages flutter past — collect each one before they vanish.' },
      { type:'fight', label:'The Pale Archivist', glyph:'uiSkull', enemyHp: 240, durationS: 100, boss: true,
        desc: 'The Archivist unbinds. Time attacks while it phase-shifts.' },
    ],
  },

  // ---- Raids (party content, currently solo-simulated) ----
  obsidian_keep: {
    name: 'Obsidian Keep', glyph: 'uiCastle', kind: 'raid',
    reqLv: 65, cost: { key: 'obsidian_sigil' },
    duration: 240,
    cooldownH: 24,
    partySize: 4,
    boss: { name: 'The Ashen King', title: 'Lord of the Obsidian Throne' },
    desc: 'Storm the keep single-handed. The Ashen King holds the throne — and his greatsword.',
    loot: [
      { id: 'death_steel', qty: [1, 3], chance: 1.0 },
      { id: 'kitchen_blueprint_t3', qty: [1, 1], chance: .10 },
      { id: 'forge_blueprint_t3', qty: [1, 1], chance: .10 },
      { id: 'trophy_blueprint_t2', qty: [1, 1], chance: .25 },
      { id: 'ashcrown_greatsword', qty: [1, 1], chance: .05 },
      { id: 'farm_deed', qty: [1, 2], chance: .30 },
    ],
    phases: [
      { type:'gather', label:'Scale the walls', glyph:'uiCastle', target: 15, durationS: 40,
        desc: 'Click each handhold as it stabilizes.' },
      { type:'dodge', label:'Cannon barrage', glyph:'uiWarn', target: 8, durationS: 60,
        desc: 'Dodge incoming cannonfire.' },
      { type:'fight', label:'The Ashen King', glyph:'uiCrown', enemyHp: 520, durationS: 140, boss: true,
        desc: 'The Ashen King brings dark magic. Time your attacks.' },
    ],
  },
  voidbringer: {
    name: 'The Voidbringer', glyph: 'magic', kind: 'raid',
    reqLv: 80, cost: { key: 'void_fragment' },
    duration: 360,
    cooldownH: 24,
    partySize: 4,
    boss: { name: 'The Riftmaw', title: 'The Devouring Rift' },
    desc: "Rifts open in the sky. The Riftmaw pours through — its husk and scepter are the prize.",
    loot: [
      { id: 'void_chitin', qty: [1, 4], chance: 1.0 },
      { id: 'void_core', qty: [1, 2], chance: .35 },
      { id: 'void_essence', qty: [1, 1], chance: .25 },
      { id: 'library_blueprint_t3', qty: [1, 1], chance: .10 },
      { id: 'riftmaw_husk', qty: [1, 2], chance: .30 },
      { id: 'voidwoven_sigil', qty: [1, 1], chance: .14 },
      { id: 'voidmaw_scepter', qty: [1, 1], chance: .04 },
      { id: 'farm_deed', qty: [1, 2], chance: .32 },
    ],
    /* Wave 6b (audit fix): the two marquee endgame instances were pure one-button
       loot rolls with NO encounter. Give them a real 3-phase fight like the others. */
    phases: [
      { type:'puzzle', label:'Seal the rift', glyph:'magic',
        question: 'A rift tears the sky. Which sigil closes the void?',
        options: ['Voidwoven', 'Sun', 'Tide', 'Ember'],
        correct: 0,
        desc: 'Choose the sigil that binds the tear before more pour through.' },
      { type:'dodge', label:'Rift tendrils', glyph:'uiWarn', target: 10, durationS: 60,
        desc: 'Dodge the lashing tendrils — click DODGE as each strikes.' },
      { type:'fight', label:'The Riftmaw', glyph:'uiSkull', enemyHp: 720, durationS: 150, boss: true,
        desc: 'The Devouring Rift itself. Time your attacks through the churn.' },
    ],
  },

  // ---- World Bosses ----
  ancient_wyrm: {
    name: 'Ancient Wyrm', glyph: 'uiSkull', kind: 'worldboss',
    reqLv: 95, cost: { key: 'dragonsbane_key' },
    duration: 600,
    cooldownH: 72,
    partySize: 24,
    boss: { name: 'Elderscale, the Great Wyrm', title: 'Eldest of Dragons' },
    desc: 'The greatest dragon yet seen. Elderscale falls only to a true dragonslayer — the Dragonfang Pike is the reward.',
    loot: [
      { id: 'dragon_scale', qty: [3, 8], chance: 1.0 },
      { id: 'dragon_bones', qty: [2, 5], chance: 1.0 },
      { id: 'dragon_gem', qty: [1, 1], chance: .30 },
      { id: 'dragon_relic', qty: [1, 1], chance: .15 },
      { id: 'trophy_blueprint_t3', qty: [1, 1], chance: .10 },
      { id: 'elderscale_heart', qty: [1, 1], chance: .25 },
      { id: 'dragonfang_pike', qty: [1, 1], chance: .03 },
      { id: 'farm_deed', qty: [2, 3], chance: .35 },
    ],
    /* Wave 6b: the capstone gets a real dragonslayer encounter. */
    phases: [
      { type:'dodge', label:'Dragonfire', glyph:'uiFire', target: 12, durationS: 55,
        desc: 'Elderscale breathes. Dodge each gout of flame.' },
      { type:'gather', label:'Load the ballista', glyph:'uiTarget', target: 14, durationS: 45,
        desc: 'Grab dragonbane bolts and load the ballista before it lands.' },
      { type:'fight', label:'Elderscale, the Great Wyrm', glyph:'uiSkull', enemyHp: 1050, durationS: 170, boss: true,
        desc: 'The Eldest of Dragons. Only a true dragonslayer stands here.' },
    ],
  },
};

/* The scrip rate, server-owned in hr_dungeon_settle and kept HERE too so the
   client can PREVIEW the payout (display only — the server credits the real
   value). Was src/dungeons.js awardDungeonScrip's formula, now the single
   source both sides read. `fraction` in (0,1] scales a partial clear. */
export function dungeonScripBase(reqLv) {
  return Math.max(5, Math.round((reqLv || 10) * 0.6));
}

/* ── THE QUARTERMASTER STOCK (docs/design/dungeon-settlement.md §4) ──────────
   The single ESM source for the Quartermaster shop. tools/gen-dungeon-catalogue.mjs
   imports this and generates `hr_qm_offers(offer_id pk, item_id, scrip_cost)`, the
   client-unwritable catalogue that quartermaster_buy (2026-09-11-quartermaster-buy.sql)
   prices from. src/dungeons.js carries a GUARDED DOUBLE-COPY of this literal (it is a
   classic script and cannot `import` — the b222/b338 trap); smoke test DGN-QM-1 asserts
   the two agree, so a price authored on one side cannot silently diverge from the price
   the server charges.

   THE OFFER ID IS THE ITEM ID. Every offer grants exactly one unit of a single item,
   and no item appears twice, so item_id is a natural primary key — no synthetic offer
   id to keep in sync. `scrip` is the server-owned price (a spend, never negative here).

   ⚠ MARKETABILITY IS NOT SET HERE — it lives on the item in src/data/items.js and is
   asserted by the QM-MARKET drift guard: keys + dungeon_scrip are v:0/bop:true, the boss
   weapons are bop:true, and the blueprints + farm_deed stay TRADEABLE (Tyler b268). This
   shop selling a tradeable item is fine: the market is gold-conserved + taxed, so a
   dedeterminstic scrip→blueprint→market path is a sink, not a faucet (Designer verified). */
export const QM_STOCK = Object.freeze([
  { id: 'bone_key', scrip: 18 },
  { id: 'goblin_seal', scrip: 24 },
  { id: 'arcane_tome', scrip: 30 },
  { id: 'obsidian_sigil', scrip: 45 },
  { id: 'void_fragment', scrip: 60 },
  { id: 'dragonsbane_key', scrip: 85 },
  { id: 'kitchen_blueprint_t2', scrip: 55 },
  { id: 'forge_blueprint_t2', scrip: 55 },
  { id: 'library_blueprint_t2', scrip: 55 },
  { id: 'trophy_blueprint_t2', scrip: 55 },
  { id: 'kitchen_blueprint_t3', scrip: 160 },
  { id: 'forge_blueprint_t3', scrip: 160 },
  { id: 'library_blueprint_t3', scrip: 160 },
  { id: 'trophy_blueprint_t3', scrip: 160 },
  { id: 'wartusk_cleaver', scrip: 150 },
  { id: 'whispering_codex', scrip: 180 },
  { id: 'ashcrown_greatsword', scrip: 340 },
  { id: 'voidmaw_scepter', scrip: 500 },
  { id: 'dragonfang_pike', scrip: 800 },
]);
