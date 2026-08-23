// ============================================================================
// src/data/raid-bosses.js — THE RAID (HUNT) BOSS REGISTRY, single source.
//
// The weekly clan/solo Hunt bosses (src/features/raids.js §1) used to live as an
// inline `var BOSSES = [...]` literal INSIDE that client IIFE — a client feature
// file the pure data layer and a Node generator could not import. That made the
// raid chest REWARD CATALOGUE (which materials each boss chest grants, its
// signature spoil, and the tier band it may be drawn for) un-server-knowable:
// hr_hunt_bosses held only sig_item, hr_hunt_tiers only a chest_mats COUNT — not
// the material ids. So the raid chest materials could only be minted CLIENT-SIDE
// (raids.js grantReward → window.addItem), an UNBACKED OWNABLE MINT the inventory
// absolute-replace flip would delete.
//
// This module IS the extraction. It holds the full raid boss records verbatim, so:
//   · src/features/raids.js consumes it via window.RAID_BOSSES (published by
//     src/main.js, exactly like window.BOSSES / window.COMPANIONS) — ONE copy, no
//     duplication, no drift.
//   · tools/gen-raid-boss-rewards.mjs imports RAID_BOSSES (Node ESM) and generates
//     the DB catalogue hr_hunt_boss_reward (boss_id → ordinal + material ids), so
//     raid_claim can mint the chest materials + signature into player_inventory
//     server-side. A `--check` drift guard (wired into tests/run-smoke.mjs) fails
//     the build if the generated SQL ever falls out of step with this data.
//
// ⚠ ORDER IS LOAD-BEARING. RAID_BOSSES array order is the SOLO boss rotation
// index space (raids.js bossOfWeek: BOSSES[fnv1a('hr-raid-'+week) % BOSSES.length]),
// and the KEY ORDER of each `reward.items` object is the order the solo chest
// slices its first two materials from (soloChestFor). The generator preserves both
// as an `ordinal` column and an ordered `material_ids` array. Do not reorder either
// without understanding that it changes which materials a boss's chest grants.
//
// PURE ESM. No DOM. Imports cleanly in Node and Deno.
// ============================================================================

export const RAID_BOSSES = [
  { id: 'emberclad_tyrant', name: 'The Emberclad Tyrant', glyph: '☲',
    desc: 'A furnace given a crown. Its slag-armor weeps molten iron.',
    def: 55, weak: 'hammer', tiers: [1, 2], sig: 'slagheart_core',
    reward: { gold: 12000, gems: 25, items: { mithril_bar: 6, hell_ember: 2 } } },
  { id: 'hollow_regent', name: 'The Hollow Regent', glyph: '♔',
    desc: 'A king who outlived his own bones. The crown remembers.',
    def: 48, weak: 'magic', tiers: [1, 2], sig: 'hollow_sigil',
    reward: { gold: 10000, gems: 25, items: { ancient_rune: 4, grave_dust: 8 } } },
  { id: 'maw_below', name: 'The Maw Below', glyph: '◎',
    desc: 'The lake was never empty. It was waiting.',
    def: 62, weak: 'ranged', tiers: [2, 3], sig: 'abyssal_pearl',
    reward: { gold: 14000, gems: 30, items: { dragon_scale: 3, silk_thread: 10 } } },
  { id: 'sunken_choir', name: 'The Sunken Choir', glyph: '☵',
    desc: 'Nine drowned cantors beneath the ice, holding one note. It has not changed in six hundred years.',
    def: 70, weak: 'magic', tiers: [3, 4], sig: 'choirbone',
    reward: { gold: 28000, gems: 30, items: { void_chitin: 3, ancient_rune: 8, shadow_thread: 4 } } },
  { id: 'warden_long_dark', name: 'Warden of the Long Dark', glyph: '◈',
    desc: 'It was set to guard a door. The door is gone. It still guards.',
    def: 78, weak: 'hammer', tiers: [4, 5], sig: 'warden_seal',
    reward: { gold: 50000, gems: 45, items: { death_steel: 5, void_chitin: 4, ruby: 3 } } },
  { id: 'crownless_wyrm', name: 'The Crownless Wyrm', glyph: '❖',
    desc: 'It ate the king who named it, and took nothing else.',
    def: 88, weak: 'ranged', tiers: [5], sig: 'wyrm_gilding',
    reward: { gold: 90000, gems: 60, items: { dragon_scale: 8, dragon_bones: 10, hell_ember: 6 } } }
];
