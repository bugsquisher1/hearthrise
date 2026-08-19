// ════════════════════════════════════════════════════════════════════════
// src/data/monsters.js — THE ROSTER
//
// 108 monsters across the 11-class taxonomy in `./monster-classes.js`.
//
// THE FOLD AUDIT (docs/design/combat-screen-rework.md §7, approved 2026-08-16):
// three duplicate pairs were merged 111 -> 108 — barn_rat -> rat,
// jackal -> wolf, cultist -> dark_wizard. A merge is NOT a deletion: each is one
// `MONSTER_ALIAS` line in legacy.js, so kill counts, bounty targets, drop
// history and the chronicle's idempotency keys all fold onto the surviving id
// (guarded by MON-ALIAS-2 and by the FOLD-MERGE-1 regression). Three display
// renames (Small Wolf -> Wolf Cub, Weak Skeleton -> Brittle Skeleton, Lesser
// Demon -> Horned Demon, plus Field Rat -> Giant Rat with its merge) changed
// NAMES ONLY — an id is never renamed in place.
// Content approved by Tyler 2026-08-16 (`.claude/coordination/DECISIONS.md`
// → "REVIEW BOOK ROUND 2"); authored in `docs/design/review-book-content.md`
// Library 1. The 31 pre-wave monsters kept every id — see MONSTER_ALIAS in
// legacy.js for why an id is never renamed in place.
//
// HOW A ROW WORKS
//   cls          the taxonomy class id. THIS is what carries the weakness
//                profile. A row with nothing but `cls` is fully specified.
//   family       DISPLAY LABEL ONLY (the class's display name). Also the key
//                of `G.stats.killsByFamily`, which is why FAMILY_ALIAS exists
//                in legacy.js — see the fold note below.
//   weaponWeak / weaponResist / elementWeak / elementResist / elementImmune
//                THE SINGLE OVERRIDE. A row may diverge from its class on at
//                most ONE axis (weapon or element). `auditRoster()` fails the
//                smoke suite on two. Classes marked `elementPerMonster`
//                (Dragon / Elemental / Extra Dimensional) REQUIRE an element
//                profile, and supplying it is not an override.
//   dropBonus    see the NEUTRAL_DROP_BONUS note below.
//   tier/hp/atk/def/xp/gp
//                must land inside `TIER_BANDS` in monster-classes.js, which
//                is the MEASURED curve of the 31 originals. New content bends
//                to the curve; the curve does not bend to new content.
//   drops        `{id, ch}` — `id` MUST exist in ITEMS. Every drop id used
//                here already shipped; this wave invents no items (that is a
//                separate change), so no drop can dangle.
//
// `neutral` IS RETIRED (DEC-NEUT-01). Every monster answers a real weapon.
// The 7 monsters that used to opt out of the triangle earned a x1.15 drop
// rate for it (`NEUTRAL_DROP_BONUS`). Deleting `neutral` would have silently
// nerfed their drops 13%, including the game's capstone Green Dragon. That
// bonus is RE-HOMED as an explicit per-monster `dropBonus:1.15` on exactly
// those 7 rows, so nobody is worse off and the engine loses a magic constant
// in favour of a data lever any monster can carry. Guarded by MON-NEUT-1.
//
// FOLD NOTE (`family` changed, ids did not): Beast→Mammal, Arcane→Human,
// Goblinoid→Humanoid, Mythic→Demon/Dragon, and shadow_creeper/void_parasite
// left Vermin for Extra Dimensional. `family` is not an id, so a fold is
// free — but it IS the key of `G.stats.killsByFamily`, so legacy.js's
// FAMILY_ALIAS folds the historical counts rather than stranding them.
// ════════════════════════════════════════════════════════════════════════

import { applyClassProfiles } from './monster-classes.js?v=398';

export const MONSTERS = {

  /* ══ Tier 1 — local threats ═══════════════════════════════════════════ */

  slime: { name: 'Slime', icon: '🟢', tier: 1, cls: 'vermin', family: 'Vermin',
    /* one override (element): a slime is the element-immune outlier — the
       pure weapon-triangle check the class needed. */
    elementWeak: null, elementImmune: ['ember', 'frost', 'poison'],
    dropBonus: 1.15,
    hp: 8, atk: 2, def: 0, xp: 5, gp: [1, 3],
    drops: [{ id: 'slime_gel', ch: .8 }, { id: 'bones', ch: .25 }, { id: 'sticky_core', ch: .02 }] },
  /* FOLD-02 / FOLD-31 (combat-screen-rework.md §7): `barn_rat` merged INTO this
     row via MONSTER_ALIAS. Two Tier-1 Vermin rats with the same weakness and the
     same role were adjacent in the same list — there was no reading of the game
     in which a player chose between them. The legacy id wins because it carries
     the kill counts; the display name becomes the familiar-fantasy standard, and
     `barn_rat`'s better drop line (wheat, the granary flavour) is absorbed here
     so nothing the merged monster offered is lost. */
  rat: { name: 'Giant Rat', icon: '🐀', tier: 1, cls: 'vermin', family: 'Vermin',
    hp: 9, atk: 2, def: 0, xp: 6, gp: [1, 4],
    drops: [{ id: 'rat_tail', ch: .7 }, { id: 'small_fang', ch: .12 }, { id: 'wheat', ch: .3 }, { id: 'bones', ch: .35 }] },
  hive_wasp: { name: 'Hive Wasp', icon: '🐝', tier: 1, cls: 'vermin', family: 'Vermin',
    /* one override (weapon): it flies, so the T1 bow finally has a target. */
    weaponWeak: 'ranged', weaponResist: [],
    hp: 8, atk: 4, def: 0, xp: 8, gp: [1, 4],
    drops: [{ id: 'venom_sac', ch: .35 }, { id: 'silk_thread', ch: .15 }, { id: 'small_fang', ch: .1 }] },
  wild_boar: { name: 'Wild Boar', icon: '🐗', tier: 1, cls: 'mammal', family: 'Mammal',
    hp: 13, atk: 4, def: 1, xp: 11, gp: [2, 6],
    drops: [{ id: 'wolf_pelt', ch: .3 }, { id: 'bones', ch: 1 }, { id: 'raw_wolf_meat', ch: .45 }, { id: 'small_fang', ch: .14 }] },
  /* FOLD-03: display rename only, the id is untouched. "Small X" reads as a dev
     label; a Cub reads as a creature, and it is the head of the canine ladder. */
  small_wolf: { name: 'Wolf Cub', icon: '🐺', tier: 1, cls: 'mammal', family: 'Mammal',
    dropBonus: 1.15,
    hp: 16, atk: 5, def: 1, xp: 14, gp: [3, 9],
    drops: [{ id: 'wolf_pelt', ch: .32 }, { id: 'small_fang', ch: .18 }, { id: 'bones', ch: 1 }, { id: 'raw_wolf_meat', ch: .6 }] },
  mandrake: { name: 'Mandrake', icon: '🌱', tier: 1, cls: 'plant', family: 'Plant',
    hp: 11, atk: 3, def: 1, xp: 9, gp: [2, 5],
    drops: [{ id: 'goldenroot', ch: .3 }, { id: 'moonbloom', ch: .08 }, { id: 'turnip', ch: .35 }] },
  goblin: { name: 'Goblin', icon: '👺', tier: 1, cls: 'humanoid', family: 'Humanoid',
    hp: 15, atk: 4, def: 1, xp: 13, gp: [2, 8],
    drops: [{ id: 'goblin_ear', ch: .5 }, { id: 'bones', ch: 1 }, { id: 'bronze_sword', ch: .03 }, { id: 'goblin_totem', ch: .01 }] },
  kobold: { name: 'Kobold', icon: '🦎', tier: 1, cls: 'humanoid', family: 'Humanoid',
    hp: 12, atk: 3, def: 1, xp: 10, gp: [2, 6],
    drops: [{ id: 'goblin_totem', ch: .06 }, { id: 'bones', ch: 1 }, { id: 'bone_chips', ch: .3 }, { id: 'copper_ore', ch: .18 }] },
  witchs_apprentice: { name: "Witch's Apprentice", icon: '🧹', tier: 1, cls: 'human', family: 'Human',
    hp: 10, atk: 5, def: 0, xp: 12, gp: [2, 7],
    drops: [{ id: 'magic_essence', ch: .3 }, { id: 'rune_frag', ch: .1 }, { id: 'normal_log', ch: .25 }] },
  cutpurse: { name: 'Cutpurse', icon: '🎭', tier: 1, cls: 'human', family: 'Human',
    hp: 11, atk: 4, def: 0, xp: 10, gp: [2, 6],
    drops: [{ id: 'rat_tail', ch: .2 }, { id: 'copper_ore', ch: .2 }, { id: 'bones', ch: .4 }] },
  /* FOLD-05: display rename only. "Weak" is a stat; "Brittle" is a description
     a player reads as fragile without being told it is the tutorial version. */
  weak_skeleton: { name: 'Brittle Skeleton', icon: '💀', tier: 1, cls: 'undead', family: 'Undead',
    hp: 14, atk: 3, def: 2, xp: 12, gp: [2, 7],
    drops: [{ id: 'bones', ch: 1 }, { id: 'bone_chips', ch: .45 }, { id: 'ancient_fragment', ch: .015 }] },
  imp: { name: 'Imp', icon: '👿', tier: 1, cls: 'demon', family: 'Demon',
    hp: 10, atk: 4, def: 0, xp: 10, gp: [2, 6],
    drops: [{ id: 'demon_shard', ch: .1 }, { id: 'coal', ch: .25 }, { id: 'rune_frag', ch: .08 }] },
  fire_elemental: { name: 'Fire Elemental', icon: '🔥', tier: 1, cls: 'elemental', family: 'Elemental',
    elementWeak: 'frost', elementImmune: ['ember'],
    hp: 12, atk: 4, def: 1, xp: 11, gp: [2, 6],
    drops: [{ id: 'coal', ch: .5 }, { id: 'copper_ore', ch: .2 }, { id: 'hell_ember', ch: .005 }] },
  scarecrow: { name: 'Scarecrow', icon: '🎃', tier: 1, cls: 'construct', family: 'Construct',
    hp: 16, atk: 2, def: 2, xp: 9, gp: [1, 5],
    drops: [{ id: 'wheat', ch: .6 }, { id: 'normal_log', ch: .35 }, { id: 'pumpkin', ch: .12 }] },

  /* ══ Tier 2 — wilderness threats ══════════════════════════════════════ */

  giant_bat: { name: 'Giant Bat', icon: '🦇', tier: 2, cls: 'vermin', family: 'Vermin',
    hp: 24, atk: 7, def: 1, xp: 24, gp: [4, 12],
    drops: [{ id: 'bat_wing', ch: .7 }, { id: 'night_fang', ch: .025 }, { id: 'bones', ch: .5 }] },
  locust_swarm: { name: 'Locust Swarm', icon: '🦗', tier: 2, cls: 'vermin', family: 'Vermin',
    hp: 25, atk: 8, def: 1, xp: 27, gp: [4, 13],
    drops: [{ id: 'wheat', ch: .8 }, { id: 'silk_thread', ch: .2 }, { id: 'venom_sac', ch: .1 }] },
  ooze: { name: 'Ooze', icon: '🫧', tier: 2, cls: 'vermin', family: 'Vermin',
    /* one override (element): immune to every element — the pure triangle check. */
    elementWeak: null, elementImmune: ['ember', 'frost', 'poison'],
    hp: 33, atk: 7, def: 3, xp: 31, gp: [5, 14],
    drops: [{ id: 'slime_gel', ch: .85 }, { id: 'sticky_core', ch: .04 }, { id: 'bone_chips', ch: .3 }] },
  stag: { name: 'Stag', icon: '🦌', tier: 2, cls: 'mammal', family: 'Mammal',
    hp: 26, atk: 9, def: 1, xp: 32, gp: [5, 14],
    drops: [{ id: 'wolf_pelt', ch: .5 }, { id: 'bones', ch: 1 }, { id: 'raw_wolf_meat', ch: .55 }] },
  /* FOLD-32: `jackal` merged INTO `wolf` via MONSTER_ALIAS. Two Tier-2 Mammal
     pack canines; the canine ladder is already five rungs and does not need two
     animals on rung two. */
  wolf:{ name: 'Wolf', icon: '🐺', tier: 2, cls: 'mammal', family: 'Mammal',
    hp: 30, atk: 8, def: 3, xp: 30, gp: [5, 15],
    drops: [{ id: 'wolf_pelt', ch: .7 }, { id: 'small_fang', ch: .35 }, { id: 'bones', ch: 1 }, { id: 'raw_wolf_meat', ch: .7 }] },
  shrieker: { name: 'Shrieker', icon: '🍄', tier: 2, cls: 'plant', family: 'Plant',
    hp: 29, atk: 9, def: 2, xp: 33, gp: [6, 15],
    drops: [{ id: 'oak_log', ch: .5 }, { id: 'moonbloom', ch: .12 }, { id: 'goldenroot', ch: .25 }] },
  hobgoblin: { name: 'Hobgoblin', icon: '👹', tier: 2, cls: 'humanoid', family: 'Humanoid',
    hp: 34, atk: 9, def: 4, xp: 38, gp: [8, 22],
    drops: [{ id: 'goblin_ear', ch: .65 }, { id: 'iron_ore', ch: .12 }, { id: 'iron_sword', ch: .012 }, { id: 'goblin_totem', ch: .02 }] },
  gnoll: { name: 'Gnoll', icon: '🐺', tier: 2, cls: 'humanoid', family: 'Humanoid',
    hp: 31, atk: 9, def: 3, xp: 36, gp: [7, 17],
    /* the scavenger: it drops another monster's loot, which is how the world
       starts to feel connected. */
    drops: [{ id: 'goblin_ear', ch: .4 }, { id: 'wolf_pelt', ch: .35 }, { id: 'bat_wing', ch: .2 }, { id: 'iron_ore', ch: .1 }] },
  dark_wizard: { name: 'Dark Wizard', icon: '🧙', tier: 2, cls: 'human', family: 'Human',
    dropBonus: 1.15,
    hp: 28, atk: 12, def: 1, xp: 55, gp: [10, 25],
    drops: [{ id: 'magic_essence', ch: .4 }, { id: 'rune_frag', ch: .2 }, { id: 'bones', ch: .6 }, { id: 'dark_sigil', ch: .015 }] },
  /* FOLD-33: `cultist` merged INTO `dark_wizard` above via MONSTER_ALIAS. Two
     Tier-2 robed Human casters, both magic-styled; the Human class carries
     eleven casters across six tiers and this is the one pair where the
     redundancy is obvious enough to fix by merge. `cultist`'s bones line is
     absorbed by dark_wizard so the merged drop table loses nothing. */
  skeleton: { name: 'Skeleton', icon: '💀', tier: 2, cls: 'undead', family: 'Undead',
    hp: 35, atk: 10, def: 2, xp: 45, gp: [8, 20],
    drops: [{ id: 'bones', ch: 1 }, { id: 'bone_chips', ch: .6 }, { id: 'iron_ore', ch: .15 }, { id: 'ancient_fragment', ch: .025 }] },
  wight: { name: 'Wight', icon: '🪦', tier: 2, cls: 'undead', family: 'Undead',
    hp: 30, atk: 10, def: 3, xp: 42, gp: [7, 18],
    drops: [{ id: 'grave_dust', ch: .45 }, { id: 'bones', ch: 1 }, { id: 'bone_chips', ch: .4 }] },
  nightmare: { name: 'Nightmare', icon: '🐴', tier: 2, cls: 'demon', family: 'Demon',
    hp: 28, atk: 11, def: 2, xp: 46, gp: [8, 20],
    drops: [{ id: 'demon_shard', ch: .2 }, { id: 'coal', ch: .4 }, { id: 'bones', ch: .8 }] },
  salamander: { name: 'Salamander', icon: '🦎', tier: 2, cls: 'dragon', family: 'Dragon',
    /* breathes Ember, so it fears Frost. */
    elementWeak: 'frost', elementImmune: ['ember'],
    hp: 27, atk: 10, def: 2, xp: 40, gp: [7, 17],
    drops: [{ id: 'dragon_scale', ch: .3 }, { id: 'coal', ch: .35 }, { id: 'bones', ch: .7 }] },
  water_elemental: { name: 'Water Elemental', icon: '💧', tier: 2, cls: 'elemental', family: 'Elemental',
    elementWeak: 'ember', elementImmune: ['frost'],
    hp: 30, atk: 9, def: 2, xp: 35, gp: [6, 16],
    drops: [{ id: 'trout', ch: .5 }, { id: 'herring', ch: .35 }, { id: 'magic_essence', ch: .18 }] },
  air_elemental: { name: 'Air Elemental', icon: '🌀', tier: 2, cls: 'elemental', family: 'Elemental',
    /* one override (weapon): arrows pass straight through it. */
    weaponResist: ['sword', 'ranged'],
    elementWeak: 'frost',
    hp: 24, atk: 11, def: 1, xp: 43, gp: [8, 19],
    drops: [{ id: 'magic_essence', ch: .4 }, { id: 'rune_frag', ch: .22 }, { id: 'normal_log', ch: .3 }] },
  stone_golem: { name: 'Stone Golem', icon: '🗿', tier: 2, cls: 'construct', family: 'Construct',
    hp: 35, atk: 7, def: 4, xp: 34, gp: [6, 15],
    drops: [{ id: 'copper_ore', ch: .5 }, { id: 'iron_ore', ch: .25 }, { id: 'coal', ch: .3 }] },

  /* ══ Tier 3 — dangerous creatures ═════════════════════════════════════ */

  venom_spider: { name: 'Venom Spider', icon: '🕷️', tier: 3, cls: 'vermin', family: 'Vermin',
    hp: 52, atk: 15, def: 6, xp: 82, gp: [14, 34],
    drops: [{ id: 'venom_sac', ch: .55 }, { id: 'silk_thread', ch: .3 }, { id: 'spider_eye', ch: .035 }, { id: 'poison_essence', ch: .08 }] },
  centipede: { name: 'Centipede', icon: '🐛', tier: 3, cls: 'vermin', family: 'Vermin',
    hp: 60, atk: 17, def: 8, xp: 98, gp: [16, 40],
    drops: [{ id: 'void_chitin', ch: .05 }, { id: 'venom_sac', ch: .4 }, { id: 'iron_ore', ch: .3 }, { id: 'coal', ch: .35 }, { id: 'frost_essence', ch: .07 }] },
  lynx: { name: 'Lynx', icon: '🐈', tier: 3, cls: 'mammal', family: 'Mammal',
    hp: 55, atk: 21, def: 5, xp: 108, gp: [18, 44],
    drops: [{ id: 'wolf_pelt', ch: .8 }, { id: 'razor_claw', ch: .12 }, { id: 'raw_wolf_meat', ch: .7 }, { id: 'bones', ch: 1 }] },
  mountain_ram: { name: 'Mountain Ram', icon: '🐏', tier: 3, cls: 'mammal', family: 'Mammal',
    /* one override (weapon): it charges; you meet it with something blunt. */
    weaponWeak: 'hammer', weaponResist: ['magic'],
    hp: 66, atk: 18, def: 9, xp: 106, gp: [17, 42],
    drops: [{ id: 'wolf_pelt', ch: .7 }, { id: 'bear_claw', ch: .1 }, { id: 'bones', ch: 1 }, { id: 'raw_wolf_meat', ch: .65 }] },
  dire_wolf: { name: 'Dire Wolf', icon: '🐺', tier: 3, cls: 'mammal', family: 'Mammal',
    hp: 62, atk: 19, def: 7, xp: 100, gp: [16, 40],
    drops: [{ id: 'wolf_pelt', ch: .9 }, { id: 'dire_fang', ch: .35 }, { id: 'alpha_fang', ch: .015 }, { id: 'raw_wolf_meat', ch: .8 }] },
  bog_vine: { name: 'Bog Vine', icon: '🌿', tier: 3, cls: 'plant', family: 'Plant',
    hp: 70, atk: 16, def: 10, xp: 104, gp: [17, 42],
    drops: [{ id: 'willow_log', ch: .55 }, { id: 'silk_thread', ch: .3 }, { id: 'moonbloom', ch: .15 }] },
  goblin_brute: { name: 'Goblin Brute', icon: '👺', tier: 3, cls: 'humanoid', family: 'Humanoid',
    hp: 68, atk: 17, def: 9, xp: 105, gp: [18, 42],
    drops: [{ id: 'goblin_ear', ch: .8 }, { id: 'brute_plate', ch: .22 }, { id: 'steel_sword', ch: .01 }, { id: 'goblin_totem', ch: .04 }] },
  rock_troll: { name: 'Rock Troll', icon: '🧌', tier: 3, cls: 'humanoid', family: 'Humanoid',
    hp: 72, atk: 18, def: 11, xp: 118, gp: [20, 48],
    drops: [{ id: 'troll_hide', ch: .55 }, { id: 'iron_ore', ch: .45 }, { id: 'coal', ch: .4 }, { id: 'big_bones', ch: .3 }] },
  /* b343: `spellstone_diagram` now drops. It was deliberately suppressed since
     b145 because its target item (`spellstone_ring`) did not exist — "a scroll
     that unlocks nothing is a confusing dead end" (legacy.js:10976). The ring
     ships in src/data/slot-ladders.js with a `gated:'spellstone_diagram'`
     recipe, so the suppression's own condition is now met. */
  warlock: { name: 'Warlock', icon: '🧙', tier: 3, cls: 'human', family: 'Human',
    dropBonus: 1.15,
    hp: 58, atk: 24, def: 5, xp: 135, gp: [24, 60],
    drops: [{ id: 'magic_essence', ch: .55 }, { id: 'rune_frag', ch: .35 }, { id: 'cracked_spellstone', ch: .025 }, { id: 'spellstone_diagram', ch: .01 }] },
  deserter: { name: 'Deserter', icon: '🗡️', tier: 3, cls: 'human', family: 'Human',
    /* one override (weapon): he wears real plate — the first monster where
       your weapon choice is about HIS kit, not his species. */
    weaponWeak: 'hammer', weaponResist: ['magic'],
    hp: 57, atk: 20, def: 9, xp: 112, gp: [19, 46],
    drops: [{ id: 'iron_bar', ch: .35 }, { id: 'steel_bar', ch: .12 }, { id: 'iron_fitting', ch: .25 }, { id: 'bones', ch: .8 }] },
  /* FOLD-15 — THE DIFFERENTIATION. zombie and ghoul shared Tier 3 Undead and
     were indistinguishable by role, so the pair is pushed to opposite corners of
     the SAME tier band (monster-classes.js TIER_BANDS[3]: hp 52-78, atk 14-24,
     def 5-12) rather than out of it:
       zombie = the punching bag — band-top HP and armour, band-FLOOR damage.
                It shambles; it will outlast you before it hurts you.
       ghoul  = the race — band-floor HP and armour, band-TOP damage. It dies
                fast and it takes chunks out of you while it does.
     That is a real choice at the card, and it costs two data fields each. */
  zombie: { name: 'Zombie', icon: '🧟', tier: 3, cls: 'undead', family: 'Undead',
    hp: 78, atk: 14, def: 12, xp: 115, gp: [18, 45],
    drops: [{ id: 'grave_dust', ch: .65 }, { id: 'big_bones', ch: .5 }, { id: 'ancient_fragment', ch: .04 }] },
  ghoul: { name: 'Ghoul', icon: '🧟', tier: 3, cls: 'undead', family: 'Undead',
    hp: 52, atk: 24, def: 5, xp: 100, gp: [17, 42],
    drops: [{ id: 'grave_dust', ch: .55 }, { id: 'venom_sac', ch: .3 }, { id: 'big_bones', ch: .4 }, { id: 'bone_chips', ch: .5 }] },
  fire_devil: { name: 'Fire Devil', icon: '😈', tier: 3, cls: 'demon', family: 'Demon',
    hp: 56, atk: 22, def: 6, xp: 125, gp: [21, 52],
    drops: [{ id: 'demon_shard', ch: .3 }, { id: 'coal', ch: .6 }, { id: 'hell_ember', ch: .01 }, { id: 'ember_essence', ch: .08 }] },
  wyrmling: { name: 'Wyrmling', icon: '🐉', tier: 3, cls: 'dragon', family: 'Dragon',
    /* breathes Frost, so it fears Ember. */
    elementWeak: 'ember', elementImmune: ['frost'],
    hp: 61, atk: 20, def: 8, xp: 120, gp: [20, 50],
    drops: [{ id: 'dragon_scale', ch: .4 }, { id: 'bones', ch: 1 }, { id: 'big_bones', ch: .2 }] },
  earth_elemental: { name: 'Earth Elemental', icon: '🪨', tier: 3, cls: 'elemental', family: 'Elemental',
    elementWeak: 'frost', elementResist: ['poison'],
    hp: 74, atk: 15, def: 12, xp: 110, gp: [18, 45],
    drops: [{ id: 'iron_ore', ch: .6 }, { id: 'coal', ch: .45 }, { id: 'gold_ore', ch: .06 }] },
  clay_golem: { name: 'Clay Golem', icon: '🏺', tier: 3, cls: 'construct', family: 'Construct',
    hp: 78, atk: 14, def: 12, xp: 100, gp: [16, 40],
    drops: [{ id: 'iron_ore', ch: .45 }, { id: 'iron_fitting', ch: .3 }, { id: 'coal', ch: .35 }] },

  /* ══ Tier 4 — elite monsters ══════════════════════════════════════════ */

  plague_swarm: { name: 'Plague Swarm', icon: '🪰', tier: 4, cls: 'vermin', family: 'Vermin',
    hp: 100, atk: 26, def: 13, xp: 210, gp: [38, 82],
    drops: [{ id: 'plague_ichor', ch: .6 }, { id: 'venom_sac', ch: .25 }, { id: 'swarm_heart', ch: .018 }, { id: 'field_cookbook', ch: .02 }] },
  giant_spider: { name: 'Giant Spider', icon: '🕸️', tier: 4, cls: 'vermin', family: 'Vermin',
    /* the silk faucet the arrow chain is starved of. */
    hp: 118, atk: 32, def: 14, xp: 252, gp: [44, 98],
    drops: [{ id: 'silk_thread', ch: .9 }, { id: 'venom_sac', ch: .5 }, { id: 'spider_eye', ch: .06 }, { id: 'shadow_thread', ch: .05 }] },
  bear: { name: 'Bear', icon: '🐻', tier: 4, cls: 'mammal', family: 'Mammal',
    hp: 140, atk: 34, def: 16, xp: 275, gp: [42, 95],
    drops: [{ id: 'bear_pelt', ch: .75 }, { id: 'bear_claw', ch: .35 }, { id: 'big_bones', ch: 1 }, { id: 'raw_bear_meat', ch: .6 }] },
  winter_wolf: { name: 'Winter Wolf', icon: '🐺', tier: 4, cls: 'mammal', family: 'Mammal',
    /* one override (element): the coat is on the portrait, and Frost does
       nothing. Mammal's Ember weakness is untouched. */
    elementResist: ['frost'],
    hp: 132, atk: 35, def: 15, xp: 288, gp: [48, 106],
    drops: [{ id: 'wolf_pelt', ch: 1 }, { id: 'dire_fang', ch: .45 }, { id: 'alpha_fang', ch: .03 }, { id: 'raw_wolf_meat', ch: .8 }, { id: 'frost_essence', ch: .09 }] },
  carnivorous_plant: { name: 'Carnivorous Plant', icon: '🪴', tier: 4, cls: 'plant', family: 'Plant',
    hp: 138, atk: 29, def: 18, xp: 258, gp: [45, 100],
    drops: [{ id: 'maple_log', ch: .6 }, { id: 'moonbloom', ch: .3 }, { id: 'goldenroot', ch: .35 }, { id: 'emberfruit', ch: .12 }, { id: 'poison_essence', ch: .09 }] },
  goblin_warlord: { name: 'Goblin Warlord', icon: '👺', tier: 4, cls: 'humanoid', family: 'Humanoid',
    hp: 125, atk: 30, def: 18, xp: 250, gp: [45, 100],
    drops: [{ id: 'brute_plate', ch: .5 }, { id: 'warlord_badge', ch: .16 }, { id: 'steel_helm', ch: .015 }, { id: 'chief_blade_recipe', ch: .05 }] },
  /* b214: was defined ONLY in legacy.js's inline MONSTERS const — every ESM
     reader (combat-render imports this module) saw undefined for it.
     b356 wave: moved Beast→Humanoid. It duplicated `bear` where it sat. */
  mountain_troll: { name: 'Mountain Troll', icon: '🧌', tier: 4, cls: 'humanoid', family: 'Humanoid',
    hp: 165, atk: 36, def: 22, xp: 305, gp: [50, 108],
    drops: [{ id: 'troll_hide', ch: .7 }, { id: 'big_bones', ch: 1 }, { id: 'bear_pelt', ch: .18 }, { id: 'iron_warhammer', ch: .012 }] },
  ogre: { name: 'Ogre', icon: '👹', tier: 4, cls: 'humanoid', family: 'Humanoid',
    hp: 160, atk: 33, def: 19, xp: 290, gp: [50, 110],
    drops: [{ id: 'troll_hide', ch: .5 }, { id: 'big_bones', ch: 1 }, { id: 'brute_plate', ch: .2 }, { id: 'raw_bear_meat', ch: .35 }] },
  minotaur: { name: 'Minotaur', icon: '🐂', tier: 4, cls: 'humanoid', family: 'Humanoid',
    hp: 145, atk: 36, def: 17, xp: 300, gp: [52, 116],
    drops: [{ id: 'big_bones', ch: 1 }, { id: 'bear_claw', ch: .4 }, { id: 'iron_bar', ch: .35 }, { id: 'warlord_badge', ch: .08 }] },
  adept: { name: 'Adept', icon: '📿', tier: 4, cls: 'human', family: 'Human',
    /* the `magic_essence` faucet at the tier Runecrafting actually needs it. */
    hp: 106, atk: 37, def: 13, xp: 318, gp: [56, 122],
    drops: [{ id: 'magic_essence', ch: .9 }, { id: 'rune_frag', ch: .5 }, { id: 'cracked_spellstone', ch: .04 }] },
  conjurer: { name: 'Conjurer', icon: '🔮', tier: 4, cls: 'human', family: 'Human',
    /* one override (element): he casts what he is immune to — the first
       "bring the other element" lesson. */
    elementImmune: ['ember'],
    hp: 110, atk: 36, def: 14, xp: 312, gp: [54, 118],
    drops: [{ id: 'magic_essence', ch: .7 }, { id: 'hell_ember', ch: .03 }, { id: 'rune_frag', ch: .45 }] },
  wraith: { name: 'Wraith', icon: '👻', tier: 4, cls: 'undead', family: 'Undead',
    hp: 112, atk: 38, def: 20, xp: 310, gp: [55, 115],
    drops: [{ id: 'grave_dust', ch: .7 }, { id: 'wraith_veil', ch: .2 }, { id: 'vamp_dust', ch: .12 }, { id: 'ancient_rune', ch: .04 }] },
  barrow_knight: { name: 'Barrow Knight', icon: '⚔️', tier: 4, cls: 'undead', family: 'Undead',
    hp: 148, atk: 31, def: 21, xp: 282, gp: [48, 104],
    drops: [{ id: 'big_bones', ch: 1 }, { id: 'steel_bar', ch: .3 }, { id: 'iron_fitting', ch: .4 }, { id: 'ancient_fragment', ch: .06 }] },
  drowned_dead: { name: 'Drowned Dead', icon: '🌊', tier: 4, cls: 'undead', family: 'Undead',
    /* one override (weapon): waterlogged — crushing does nothing here. */
    weaponWeak: 'magic',
    hp: 130, atk: 28, def: 20, xp: 246, gp: [43, 96],
    drops: [{ id: 'grave_dust', ch: .6 }, { id: 'big_bones', ch: .8 }, { id: 'lobster', ch: .3 }, { id: 'abyssal_pearl', ch: .008 }] },
  /* FOLD-20: display rename only. "Lesser" is the same dev-label tell as
     FOLD-03/05, and it is the only demon at its tier — lesser than nothing. */
  lesser_demon: { name: 'Horned Demon', icon: '😈', tier: 4, cls: 'demon', family: 'Demon',
    dropBonus: 1.15,
    hp: 150, atk: 40, def: 18, xp: 340, gp: [60, 140],
    drops: [{ id: 'demon_shard', ch: .4 }, { id: 'rune_frag', ch: .3 }, { id: 'hell_ember', ch: .025 }, { id: 'ember_essence', ch: .09 }] },
  hellhound: { name: 'Hellhound', icon: '🔥', tier: 4, cls: 'demon', family: 'Demon',
    /* one override (weapon): it closes distance, so the melee player gets the
       easier fight for once. */
    weaponWeak: 'ranged',
    hp: 122, atk: 39, def: 15, xp: 330, gp: [58, 130],
    drops: [{ id: 'demon_shard', ch: .45 }, { id: 'hell_ember', ch: .035 }, { id: 'big_bones', ch: 1 }, { id: 'coal', ch: .6 }] },
  wyvern: { name: 'Wyvern', icon: '🐲', tier: 4, cls: 'dragon', family: 'Dragon',
    elementWeak: 'frost', elementImmune: ['ember'],
    hp: 135, atk: 34, def: 18, xp: 296, gp: [51, 112],
    drops: [{ id: 'dragon_scale', ch: .6 }, { id: 'dragon_bones', ch: .35 }, { id: 'big_bones', ch: 1 }] },
  cave_wyrm: { name: 'Cave Wyrm', icon: '🪱', tier: 4, cls: 'dragon', family: 'Dragon',
    /* one override (weapon): no wings, so the class is not a bow-only tax.
       It breathes nothing, so its element is Poison (art sheet §0.2). */
    weaponWeak: 'hammer', weaponResist: [],
    elementWeak: 'poison',
    hp: 158, atk: 30, def: 22, xp: 278, gp: [47, 102],
    drops: [{ id: 'dragon_scale', ch: .5 }, { id: 'iron_ore', ch: .6 }, { id: 'mithril_ore', ch: .1 }, { id: 'coal', ch: .5 }] },
  ice_elemental: { name: 'Ice Elemental', icon: '❄️', tier: 4, cls: 'elemental', family: 'Elemental',
    elementWeak: 'ember', elementImmune: ['frost'],
    hp: 128, atk: 33, def: 17, xp: 270, gp: [46, 100],
    drops: [{ id: 'frostfin', ch: .5 }, { id: 'magic_essence', ch: .5 }, { id: 'mithril_ore', ch: .08 }] },
  watchknight: { name: 'Watchknight', icon: '🛡️', tier: 4, cls: 'construct', family: 'Construct',
    /* empty armour: kill it and you get the armour. */
    hp: 164, atk: 27, def: 22, xp: 262, gp: [45, 98],
    drops: [{ id: 'steel_bar', ch: .5 }, { id: 'iron_fitting', ch: .6 }, { id: 'steel_helm', ch: .02 }, { id: 'brute_plate', ch: .25 }] },
  void_mote: { name: 'Void Mote', icon: '🌑', tier: 4, cls: 'extradimensional', family: 'Extra Dimensional',
    /* hidden element — the bestiary reveals it at 25 kills (PROG-01). */
    elementWeak: 'ember', elementResist: ['frost', 'poison'],
    hp: 104, atk: 38, def: 13, xp: 326, gp: [57, 126],
    drops: [{ id: 'void_chitin', ch: .3 }, { id: 'magic_essence', ch: .6 }, { id: 'rune_frag', ch: .4 }] },

  /* ══ Tier 5 — mythic threats ══════════════════════════════════════════ */

  carrion_swarm: { name: 'Carrion Swarm', icon: '🪰', tier: 5, cls: 'vermin', family: 'Vermin',
    /* one override (element): dense enough that only cold thins it. */
    elementResist: ['ember', 'poison'],
    hp: 198, atk: 62, def: 24, xp: 560, gp: [112, 236],
    drops: [{ id: 'plague_ichor', ch: .7 }, { id: 'swarm_heart', ch: .04 }, { id: 'venom_sac', ch: .6 }, { id: 'poison_essence', ch: .1 }] },
  panther: { name: 'Night Panther', icon: '🐈‍⬛', tier: 5, cls: 'mammal', family: 'Mammal',
    hp: 205, atk: 60, def: 25, xp: 520, gp: [100, 210],
    drops: [{ id: 'shadow_pelt', ch: .65 }, { id: 'razor_claw', ch: .3 }, { id: 'ruby', ch: .03 }, { id: 'raw_panther_meat', ch: .7 }] },
  giant_boar: { name: 'Giant Boar', icon: '🐗', tier: 5, cls: 'mammal', family: 'Mammal',
    /* fat, slow, enormous HP — the away-farming beast, forgiving of a bad loadout. */
    hp: 252, atk: 52, def: 33, xp: 565, gp: [115, 238],
    drops: [{ id: 'bear_pelt', ch: .9 }, { id: 'big_bones', ch: 1 }, { id: 'raw_bear_meat', ch: .85 }, { id: 'bear_claw', ch: .3 }] },
  mammoth: { name: 'Mammoth', icon: '🦣', tier: 5, cls: 'mammal', family: 'Mammal',
    /* one override (weapon): the hide answers a hammer, not an arrow. */
    weaponWeak: 'hammer', weaponResist: ['magic'],
    hp: 258, atk: 55, def: 36, xp: 598, gp: [120, 250],
    drops: [{ id: 'bear_pelt', ch: 1 }, { id: 'ancient_claw', ch: .12 }, { id: 'big_bones', ch: 1 }, { id: 'raw_bear_meat', ch: .9 }] },
  dryad: { name: 'Dryad', icon: '🌳', tier: 5, cls: 'plant', family: 'Plant',
    /* one override (element): green wood does not burn — she has NO element
       weakness at all, which is why the art carries no accent. */
    elementWeak: null, elementResist: ['ember', 'poison'],
    hp: 222, atk: 57, def: 30, xp: 548, gp: [110, 232],
    drops: [{ id: 'yew_log', ch: .7 }, { id: 'moonbloom', ch: .5 }, { id: 'runewood_log', ch: .1 }, { id: 'goldenroot', ch: .55 }] },
  warband_captain: { name: 'Warband Captain', icon: '🛡️', tier: 5, cls: 'humanoid', family: 'Humanoid',
    hp: 230, atk: 54, def: 34, xp: 540, gp: [110, 225],
    drops: [{ id: 'warlord_badge', ch: .4 }, { id: 'captain_medal', ch: .12 }, { id: 'rune_sword', ch: .006 }, { id: 'captain_recipe', ch: .03 }] },
  frost_giant: { name: 'Frost Giant', icon: '🧊', tier: 5, cls: 'humanoid', family: 'Humanoid',
    /* one override (element): rime in the braids — Frost does nothing, Ember
       is the answer. The Ember arrow's first genuinely worth-it target. */
    elementWeak: 'ember', elementResist: ['frost'],
    hp: 248, atk: 59, def: 35, xp: 608, gp: [124, 256],
    drops: [{ id: 'troll_hide', ch: .8 }, { id: 'big_bones', ch: 1 }, { id: 'mithril_ore', ch: .3 }, { id: 'frostfin', ch: .4 }, { id: 'frost_essence', ch: .1 }] },
  cyclops: { name: 'Cyclops', icon: '👁️', tier: 5, cls: 'humanoid', family: 'Humanoid',
    /* one override (weapon): one eye, no guard — Giant's blunt answer,
       arriving where Giant folded into Humanoid. */
    weaponWeak: 'hammer',
    hp: 256, atk: 56, def: 38, xp: 588, gp: [118, 246],
    drops: [{ id: 'troll_hide', ch: .75 }, { id: 'big_bones', ch: 1 }, { id: 'warlord_badge', ch: .3 }, { id: 'steel_bar', ch: .5 }] },
  archmage: { name: 'Archmage', icon: '🧙‍♂️', tier: 5, cls: 'human', family: 'Human',
    dropBonus: 1.15,
    hp: 215, atk: 72, def: 22, xp: 680, gp: [145, 310],
    drops: [{ id: 'magic_essence', ch: .8 }, { id: 'ancient_rune', ch: .22 }, { id: 'hollow_sigil', ch: .018 }] },
  astrologer: { name: 'Astrologer', icon: '🔭', tier: 5, cls: 'human', family: 'Human',
    hp: 196, atk: 70, def: 22, xp: 662, gp: [140, 296],
    drops: [{ id: 'magic_essence', ch: .75 }, { id: 'ancient_rune', ch: .2 }, { id: 'rune_frag', ch: .6 }, { id: 'ruby', ch: .04 }] },
  bandit_lord: { name: 'Bandit Lord', icon: '🪙', tier: 5, cls: 'human', family: 'Human',
    hp: 212, atk: 65, def: 27, xp: 612, gp: [126, 262],
    drops: [{ id: 'gold_ore', ch: .5 }, { id: 'gold_bar', ch: .25 }, { id: 'ruby', ch: .05 }, { id: 'captain_medal', ch: .08 }] },
  death_knight: { name: 'Death Knight', icon: '☠️', tier: 5, cls: 'undead', family: 'Undead',
    hp: 260, atk: 58, def: 40, xp: 620, gp: [125, 260],
    drops: [{ id: 'big_bones', ch: 1 }, { id: 'death_steel', ch: .25 }, { id: 'captains_ribblade', ch: .012 }] },
  grave_banshee: { name: 'Grave Banshee', icon: '😱', tier: 5, cls: 'undead', family: 'Undead',
    hp: 194, atk: 68, def: 23, xp: 645, gp: [135, 286],
    drops: [{ id: 'wraith_veil', ch: .35 }, { id: 'grave_dust', ch: .8 }, { id: 'vamp_dust', ch: .2 }, { id: 'ancient_rune', ch: .06 }] },
  chained_demon: { name: 'Chained Demon', icon: '⛓️', tier: 5, cls: 'demon', family: 'Demon',
    hp: 240, atk: 61, def: 32, xp: 602, gp: [122, 254],
    drops: [{ id: 'demon_shard', ch: .7 }, { id: 'hell_ember', ch: .06 }, { id: 'death_steel', ch: .15 }, { id: 'iron_fitting', ch: .5 }, { id: 'ember_essence', ch: .1 }] },
  fury: { name: 'Fury', icon: '🦇', tier: 5, cls: 'demon', family: 'Demon',
    /* one override (weapon): blades glass over on the carapace. */
    weaponResist: ['sword'],
    hp: 202, atk: 69, def: 25, xp: 650, gp: [136, 288],
    drops: [{ id: 'demon_shard', ch: .6 }, { id: 'razor_claw', ch: .35 }, { id: 'hell_ember', ch: .05 }] },
  drake: { name: 'Drake', icon: '🐉', tier: 5, cls: 'dragon', family: 'Dragon',
    /* breathes neither, so Poison is its answer (art sheet §0.2). */
    elementWeak: 'poison',
    hp: 234, atk: 58, def: 34, xp: 572, gp: [116, 240],
    drops: [{ id: 'dragon_scale', ch: .8 }, { id: 'dragon_bones', ch: .6 }, { id: 'mithril_ore', ch: .3 }, { id: 'steel_bar', ch: .4 }] },
  magma_elemental: { name: 'Magma Elemental', icon: '🌋', tier: 5, cls: 'elemental', family: 'Elemental',
    elementWeak: 'frost', elementImmune: ['ember'],
    hp: 226, atk: 60, def: 31, xp: 580, gp: [117, 242],
    drops: [{ id: 'hell_ember', ch: .3 }, { id: 'emberstone_ore', ch: .5 }, { id: 'coal', ch: .9 }, { id: 'ember_bar', ch: .15 }] },
  gargoyle: { name: 'Gargoyle', icon: '🗿', tier: 5, cls: 'construct', family: 'Construct',
    hp: 254, atk: 50, def: 40, xp: 542, gp: [108, 228],
    drops: [{ id: 'iron_fitting', ch: .7 }, { id: 'mithril_ore', ch: .35 }, { id: 'keystone', ch: .05 }, { id: 'steel_bar', ch: .45 }] },
  shadow_creeper: { name: 'Shadow Creeper', icon: '🕸️', tier: 5, cls: 'extradimensional', family: 'Extra Dimensional',
    elementWeak: 'frost', elementResist: ['ember', 'poison'],
    hp: 190, atk: 48, def: 26, xp: 475, gp: [90, 190],
    drops: [{ id: 'shadow_thread', ch: .45 }, { id: 'silk_thread', ch: .6 }, { id: 'void_chitin', ch: .018 }] },
  starhusk: { name: 'Starhusk', icon: '✨', tier: 5, cls: 'extradimensional', family: 'Extra Dimensional',
    elementWeak: 'frost', elementResist: ['ember', 'poison'],
    hp: 208, atk: 66, def: 26, xp: 628, gp: [130, 272],
    drops: [{ id: 'void_chitin', ch: .4 }, { id: 'shadow_thread', ch: .5 }, { id: 'ancient_rune', ch: .12 }, { id: 'grave_dust', ch: .5 }] },

  /* ══ Tier 6 — legendary enemies ═══════════════════════════════════════ */

  ancient_bear: { name: 'Ancient Bear', icon: '🐻', tier: 6, cls: 'mammal', family: 'Mammal',
    hp: 460, atk: 94, def: 54, xp: 1100, gp: [250, 500],
    drops: [{ id: 'bear_pelt', ch: 1 }, { id: 'ancient_claw', ch: .25 }, { id: 'alpha_cloak', ch: .01 }, { id: 'raw_bear_meat', ch: .8 }, { id: 'alpha_pattern', ch: .02 }] },
  elk_king: { name: 'Elk King', icon: '🦌', tier: 6, cls: 'mammal', family: 'Mammal', boss: true,
    hp: 466, atk: 90, def: 52, xp: 1090, gp: [262, 540],
    drops: [{ id: 'bear_pelt', ch: 1 }, { id: 'ancient_claw', ch: .3 }, { id: 'alpha_pattern', ch: .04 }, { id: 'alpha_fang', ch: .12 }, { id: 'moonbloom', ch: .5 }] },
  broodmother: { name: 'Broodmother', icon: '🕷️', tier: 6, cls: 'vermin', family: 'Vermin', boss: true,
    hp: 402, atk: 95, def: 45, xp: 1125, gp: [276, 572],
    drops: [{ id: 'silk_thread', ch: 1 }, { id: 'spider_eye', ch: .3 }, { id: 'void_chitin', ch: .1 }, { id: 'swarm_heart', ch: .08 }, { id: 'shadow_thread', ch: .35 }] },
  treant: { name: 'Treant', icon: '🌲', tier: 6, cls: 'plant', family: 'Plant', boss: true,
    hp: 512, atk: 78, def: 60, xp: 1060, gp: [258, 528],
    drops: [{ id: 'duskwood_log', ch: .6 }, { id: 'runewood_log', ch: .35 }, { id: 'timber_beam', ch: .3 }, { id: 'moonbloom', ch: .7 }, { id: 'yew_log', ch: 1 }] },
  war_king: { name: 'War King', icon: '👑', tier: 6, cls: 'humanoid', family: 'Humanoid',
    hp: 420, atk: 88, def: 58, xp: 1050, gp: [260, 520],
    drops: [{ id: 'captain_medal', ch: .35 }, { id: 'war_crown', ch: .08 }, { id: 'chief_blade', ch: .012 }] },
  stonejaw: { name: 'Stonejaw', icon: '🪓', tier: 6, cls: 'humanoid', family: 'Humanoid', boss: true,
    hp: 478, atk: 93, def: 56, xp: 1140, gp: [282, 586],
    drops: [{ id: 'war_crown', ch: .12 }, { id: 'captain_medal', ch: .45 }, { id: 'death_steel', ch: .3 }, { id: 'warlord_badge', ch: .8 }, { id: 'chief_blade_recipe', ch: .08 }] },
  necromancer: { name: 'Necromancer', icon: '🕯️', tier: 6, cls: 'human', family: 'Human', boss: true,
    hp: 356, atk: 100, def: 34, xp: 1195, gp: [302, 650],
    drops: [{ id: 'lich_soul', ch: .4 }, { id: 'ancient_rune', ch: .35 }, { id: 'hollow_sigil', ch: .05 }, { id: 'grave_dust', ch: 1 }, { id: 'soul_recipe', ch: .015 }] },
  lich: { name: 'Ancient Lich', icon: '☠️', tier: 6, cls: 'undead', family: 'Undead', boss: true,
    hp: 350, atk: 55, def: 30, xp: 800, gp: [200, 500],
    drops: [{ id: 'lich_soul', ch: .8 }, { id: 'ancient_rune', ch: .3 }, { id: 'vamp_dust', ch: .30 }, { id: 'hollow_sigil', ch: .025 }, { id: 'soul_recipe', ch: .01 }] },
  revenant: { name: 'Revenant', icon: '🦴', tier: 6, cls: 'undead', family: 'Undead',
    /* the `big_bones` endgame faucet, and Prayer's best customer. */
    hp: 448, atk: 86, def: 50, xp: 1035, gp: [252, 512],
    drops: [{ id: 'big_bones', ch: 1 }, { id: 'death_steel', ch: .35 }, { id: 'ancient_rune', ch: .2 }, { id: 'grave_dust', ch: .9 }] },
  vampire_bride: { name: 'Vampire Bride', icon: '🥀', tier: 6, cls: 'undead', family: 'Undead',
    /* one override (weapon): wooden shafts do nothing. Undead's Ember
       weakness is untouched — fire does everything. */
    weaponResist: ['ranged'],
    hp: 372, atk: 98, def: 38, xp: 1160, gp: [290, 608],
    drops: [{ id: 'vamp_dust', ch: .8 }, { id: 'wraith_veil', ch: .45 }, { id: 'ruby', ch: .12 }, { id: 'ancient_rune', ch: .25 }] },
  grim_reaper: { name: 'Grim Reaper', icon: '⏳', tier: 6, cls: 'undead', family: 'Undead', boss: true,
    hp: 388, atk: 102, def: 40, xp: 1215, gp: [308, 668],
    drops: [{ id: 'lich_soul', ch: .5 }, { id: 'death_steel', ch: .5 }, { id: 'hollow_sigil', ch: .06 }, { id: 'big_bones', ch: 1 }, { id: 'vamp_dust', ch: .4 }] },
  vharek: { name: 'Vharek', icon: '😈', tier: 6, cls: 'demon', family: 'Demon', boss: true,
    hp: 496, atk: 97, def: 57, xp: 1175, gp: [294, 620],
    drops: [{ id: 'demon_shard', ch: 1 }, { id: 'hell_ember', ch: .3 }, { id: 'death_steel', ch: .35 }, { id: 'ember_bar', ch: .4 }, { id: 'hollow_sigil', ch: .04 }] },
  /* b343: `gemcutter_note` now drops — same b145 story as spellstone_diagram
     above. Its target, `dragon_gem_earrings`, is the first item in the game's
     history that can fill the `earrings` slot. */
  dragon: { name: 'Green Dragon', icon: '🐲', tier: 6, cls: 'dragon', family: 'Dragon', boss: true,
    /* DEC-DRA-01 (Tyler: "Ember"): its breath is EMBER, so it fears Frost. */
    elementWeak: 'frost', elementImmune: ['ember'],
    dropBonus: 1.15,
    hp: 520, atk: 105, def: 62, xp: 1250, gp: [320, 700],
    drops: [{ id: 'dragon_bones', ch: 1 }, { id: 'dragon_scale', ch: .5 }, { id: 'dragon_gem', ch: .02 }, { id: 'ancient_claw', ch: .08 }, { id: 'marrow_cookbook', ch: .005 }, { id: 'gemcutter_note', ch: .005 }] },
  draconia: { name: 'Draconia', icon: '🐉', tier: 6, cls: 'dragon', family: 'Dragon', boss: true,
    /* breathes Frost: Frost-resistant, Ember-weak. Ashwing's mirror. */
    elementWeak: 'ember', elementResist: ['frost'],
    hp: 484, atk: 99, def: 55, xp: 1198, gp: [300, 646],
    drops: [{ id: 'dragon_bones', ch: 1 }, { id: 'dragon_scale', ch: .8 }, { id: 'dragon_gem', ch: .05 }, { id: 'ancient_claw', ch: .2 }, { id: 'alpha_pattern', ch: .03 }] },
    /* NOTE: `dragon_marrow_recipe` was the obvious flavour drop here and is
       deliberately NOT wired — its target item (`dragonbone_spear`) does not
       exist, and the b145 rule is that a recipe unlocking nothing is a
       confusing dead end. It is a HOOK for the itemisation wave, not an
       omission. The b227 guard fails the build if it is added early. */
  ashwing: { name: 'Ashwing', icon: '🔥', tier: 6, cls: 'dragon', family: 'Dragon', boss: true,
    /* Draconia's opposite — one weekly rotation slot, two opposite loadouts. */
    elementWeak: 'frost', elementResist: ['ember'],
    hp: 472, atk: 101, def: 53, xp: 1205, gp: [304, 656],
    drops: [{ id: 'dragon_bones', ch: 1 }, { id: 'dragon_scale', ch: .8 }, { id: 'hell_ember', ch: .2 }, { id: 'ember_bar', ch: .5 }, { id: 'dragon_gem', ch: .05 }] },
  storm_elemental: { name: 'Storm Elemental', icon: '⚡', tier: 6, cls: 'elemental', family: 'Elemental',
    /* the one monster that resists two elements; its weakness is the
       unpopular third, which is exactly the job Poison needs. */
    elementWeak: 'poison', elementResist: ['ember', 'frost'],
    hp: 392, atk: 92, def: 44, xp: 1085, gp: [268, 548],
    drops: [{ id: 'magic_essence', ch: 1 }, { id: 'ancient_rune', ch: .3 }, { id: 'dawnstone_ore', ch: .1 }, { id: 'rune_bar', ch: .2 }] },
  elder_cinder: { name: 'Elder Cinder', icon: '🕯️', tier: 6, cls: 'elemental', family: 'Elemental', boss: true,
    elementWeak: 'frost', elementImmune: ['ember'],
    hp: 440, atk: 96, def: 48, xp: 1130, gp: [278, 578],
    drops: [{ id: 'hell_ember', ch: .6 }, { id: 'ember_bar', ch: .7 }, { id: 'emberstone_ore', ch: .9 }, { id: 'dawnstone_ore', ch: .08 }, { id: 'ancient_rune', ch: .25 }] },
  iron_colossus: { name: 'Iron Colossus', icon: '⚙️', tier: 6, cls: 'construct', family: 'Construct', boss: true,
    hp: 518, atk: 80, def: 62, xp: 1075, gp: [264, 544],
    drops: [{ id: 'rune_bar', ch: .35 }, { id: 'mithril_bar', ch: .7 }, { id: 'keystone', ch: .25 }, { id: 'iron_fitting', ch: 1 }, { id: 'death_steel', ch: .2 }] },
  void_parasite: { name: 'Void Parasite', icon: '🪱', tier: 6, cls: 'extradimensional', family: 'Extra Dimensional',
    elementWeak: 'poison', elementResist: ['ember', 'frost'],
    hp: 340, atk: 82, def: 42, xp: 900, gp: [210, 420],
    drops: [{ id: 'void_chitin', ch: .55 }, { id: 'plague_ichor', ch: .35 }, { id: 'void_core', ch: .015 }] },
  the_silence: { name: 'The Silence', icon: '🌑', tier: 6, cls: 'extradimensional', family: 'Extra Dimensional',
    /* one override (weapon): arrows find nothing to hit. */
    weaponResist: ['ranged'],
    elementWeak: 'poison', elementResist: ['ember', 'frost'],
    hp: 364, atk: 99, def: 36, xp: 1170, gp: [292, 614],
    drops: [{ id: 'void_chitin', ch: .7 }, { id: 'void_core', ch: .04 }, { id: 'shadow_thread', ch: .6 }, { id: 'hollow_sigil', ch: .05 }] },
  the_unlit: { name: 'The Unlit', icon: '⬛', tier: 6, cls: 'extradimensional', family: 'Extra Dimensional', boss: true,
    /* the endgame's actual final boss, which the game did not have. */
    elementWeak: 'ember', elementResist: ['frost', 'poison'],
    hp: 508, atk: 104, def: 59, xp: 1248, gp: [318, 698],
    drops: [{ id: 'void_core', ch: .12 }, { id: 'void_chitin', ch: 1 }, { id: 'hollow_sigil', ch: .1 }, { id: 'ancient_rune', ch: .5 }, { id: 'dawnstone_ore', ch: .15 }] },
};

/* SEAL: write each class's profile onto its members, so `m.weaponWeak` is a
   plain field for every one of the twelve live readers (including the two
   shared with the hr-accrue Edge Function) while the class table above stays
   the only place a weakness is authored. Idempotent and pure — see
   `applyClassProfiles`. This MUST stay the last statement in this module. */
applyClassProfiles(MONSTERS);
