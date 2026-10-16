'use strict';
// Hunt-sim combat data: ONE table of first-pass numbers. Every number carries its source.
// Sources:
//   BIBLE    docs/design/COMBAT_DESIGN_BIBLE.md (v1.4) section given
//   REVIEW   docs/design/reviews/2026-10-15-combat-bible-review.md line given
//   RECON    docs/design/reviews/2026-10-15-master-reference-reconciliation.md line given
//   MON      src/data/monsters.js line given (the live monster row)
//   CLS      src/data/monster-classes.js line given (class element profile)
//   COMBAT   src/core/combat.js line given;  ELEM src/core/elements.js line given
//   RULED    designer ruling 2026-10-15 (prototypes/hunt-sim/BALANCE_RULINGS.md)
//   ASSUMED  no source: a prototype pick, listed in the hunt-sim report
// Client-side prototype only. Nothing here is server data or game code.

// Action-bar loadouts: static per class for now (not editable). Slot order: basic, 3 abilities, food, drink.
// Food and drink share ONE consumable lane (BIBLE §9.1: food restores HP, drinks restore mana, same lane).
const CONSUMABLES = {
  mana_potion: { name: 'Moonbloom tea', glyph: 'potion', mana: 60, below: 0.30, price: 4 },        // ASSUMED: a DRINK (Tyler: food = HP, drink = mana, no potions); +60 mana under 30%; 4 g
  ham:         { name: 'Ham',         glyph: 'ham',    hp: 70, below: 0.50, price: 3 },   // ASSUMED: 70 HP (half instant, half over 6 s) under 50% HP; 3 g
  bread:       { name: 'Bread',       glyph: 'bread',  hp: 45, below: 0.50, price: 2 },   // ASSUMED: 45 HP (half instant, half over 6 s); 2 g
};
const CONSUMABLE_LANE = 1.0;   // BIBLE §9.1 PROPOSED test value: shared food/drink lane 1 s
const LOADOUTS = {             // ASSUMED stack sizes for a sewer trip; runes = carried stock (store runes cover the rest)
  berserker: { food: ['ham', 25],  drink: ['mana_potion', 10],  runes: { fire_rune: 20 } },   // ASSUMED
  knight:   { food: ['ham', 25],   drink: ['mana_potion', 10],  runes: { fire_rune: 20 } },
  paladin:  { food: ['bread', 15], drink: ['mana_potion', 12],  runes: { fire_rune: 30 } },
  sorcerer: { food: ['bread', 12], drink: ['mana_potion', 40],  runes: { fire_rune: 60, frost_rune: 60 } },
  druid:    { food: ['bread', 12], drink: ['mana_potion', 40],  runes: {} },
};
const HERO_START_LEVEL = 20, HERO_XP_PER_LEVEL = 12000;   // ASSUMED: display-only level curve for the HUD and analyzer
// Per-hero HUD settings (bottom-right block). dist = tiles kept from the target/leader (replaces fixed 3/5/6).
const HERO_SETTINGS = {
  berserker: { dist: 1, target: 'follow', stance: 'offensive', chase: true, actSet: 'hunt' },   // Melee DPS: hits the tank's target from a free adjacent slot
  knight:   { dist: 1, target: 'highest', stance: 'balanced', chase: true, actSet: 'hunt' },
  paladin:  { dist: 3, target: 'follow',  stance: 'balanced', chase: true, actSet: 'hunt' },
  druid:    { dist: 5, target: 'follow',  stance: 'balanced', chase: true, actSet: 'hunt' },
  sorcerer: { dist: 6, target: 'follow',  stance: 'balanced', chase: true, actSet: 'hunt' },
};
const STANCES = {   // ASSUMED: Tibia-style fight modes
  offensive: { dmg: 1.10, taken: 1.10 }, balanced: { dmg: 1.0, taken: 1.0 }, defensive: { dmg: 0.90, taken: 0.85 },
};
const ACTION_SETS = {   // ASSUMED presets; a set enables/disables abilities (the bar shows only enabled ones)
  hunt: { name: 'Hunt', skip: () => false },
  mana: { name: 'Mana train', skip: ab => !!ab.rune },              // save runes; burn mana on non-rune spells and wand
  boss: { name: 'Boss', skip: ab => ab.target === 'area' },         // single target only
};
const TARGET_MODES = { follow: 'Follow leader', nearest: 'Nearest', lowest: 'Lowest HP', highest: 'Highest % life', strongest: 'Strongest' };

const COMBAT = {
  swing: 2.0,                         // RECON:15,61 + COMBAT:64-69 tickMs 2000 — one universal basic-attack interval
  lanes: { offense: 2.0, heal: 1.0 }, // BIBLE §9.1 PROPOSED test values (offensive 2 s, healing 1 s)
  magicXpPerMana: 1.5,                // designer ruling 2026-10-15 (was REVIEW:53 K=29, a different XP scale)
  manaRegenPerMin: 0.25,              // designer ruling 2026-10-15 (fraction of max mana per minute)
  weakMult: 1.15,                     // ELEM:50 ELEMENT_BONUS.damage / ELEM:53 MAX_ELEMENT_MULT
  resistMult: 0.75,                   // designer ruling 2026-10-15
  immuneMult: 0,                      // designer ruling 2026-10-15
  defReductionPerPoint: 0.03,         // COMBAT:49 monsterDefenseDamageReduction
  heroAccuracy: 0.85,                 // designer ruling 2026-10-15
  monsterAccuracy: 0.60,              // designer ruling 2026-10-15
  vulnMult: 1.10,                     // BIBLE §17 "non-stacking ~10% damage-taken vulnerability"
  vulnSec: 6,                         // designer ruling 2026-10-15
  gpMult: 1.3,                        // tuned by applier per designer ruling (profit +10–30%; measured mean +17.9% over 4×3 loops): coin ×1.3 on normal monsters (the profit lever)
};

// Runes and supplies (gold). designer ruling 2026-10-15.
const SUPPLIES = {
  fire_rune:  { name: 'Fire Rune (store)',  mult: 1.00, price: 6 },    // mult REVIEW:69 store Basic ×1.00; price designer ruling 2026-10-15 r2
  frost_rune: { name: 'Frost Rune (store)', mult: 1.00, price: 6 },    // designer ruling 2026-10-15 r2 (mirrors Fire)
  bolt:       { name: 'Crossbow bolt',      mult: 1.00, price: 1 },    // per-shot cost: Tyler ruling; price designer ruling 2026-10-15 r2
  mana:       { name: 'Mana (drink-equivalent)', price: 0.06 },        // designer ruling 2026-10-15 r2 (gold per mana point)
};

// Party heroes. Pools: designer ruling 2026-10-15. Basic damage: designer ruling 2026-10-15 (kept).
const HEROES = {
  berserker: { family: 'melee',      hp: 200, mana: 60,  speed: 3.2, range: 1.5, back: 1,
              basic: { dmg: [6, 12], kind: 'slash' } },                                        // ASSUMED: Melee DPS (Tyler 2026-10-16) — knight pools, a heavier swing
  knight:   { family: 'melee',       hp: 200, mana: 60,  speed: 3.2, range: 1.5, back: 0,
              basic: { dmg: [4, 9], kind: 'slash' } },
  paladin:  { family: 'ranged',      hp: 150, mana: 100, speed: 3.2, range: 7, back: 3.5,
              basic: { dmg: [3, 8], kind: 'crossbow', ammo: 'bolt' } },                         // bolt per shot: Tyler ruling
  sorcerer: { family: 'destruction', hp: 120, mana: 320, speed: 3.2, range: 7, back: 6,
              basic: { dmg: [3, 7], kind: 'arcane', mana: 2, magicXpMult: 1.0 } },              // wand costs mana + trains Magic: Tyler ruling; 2 mana designer ruling 2026-10-15
  druid:    { family: 'restoration', hp: 135, mana: 300, speed: 3.2, range: 7, back: 5,
              basic: { dmg: [2, 5], kind: 'nature', element: 'nature', mana: 2, magicXpMult: 1.0 } }, // Nature Bolt (BIBLE §17); 2 mana designer ruling 2026-10-15
};

// 3 abilities per discipline (Tyler ruling; BIBLE §17 rosters). dmg/cd/mana: designer ruling 2026-10-15 (kept).
// lane: 'offense' | 'heal'. target: 'enemy' | 'area' | 'self' | 'ally' | 'party'.
const ABILITIES = {
  berserker: [                                                                                  // ASSUMED: no Challenge; never holds aggro
    { id: 'cleave', name: 'Cleave', lane: 'offense', cd: 6, mana: 8, target: 'cleave', dmg: [6, 11], maxHits: 3, magicXpMult: 0, fx: 'slash' },
    { id: 'power_strike', name: 'Power Strike', lane: 'offense', cd: 6, mana: 6, target: 'enemy', dmg: [7, 13], magicXpMult: 0, fx: 'slash' },
    { id: 'flame_strike', name: 'Flame Strike', lane: 'offense', cd: 8, mana: 10, rune: 'fire_rune', target: 'enemy',
      dmg: [8, 14], element: 'fire', magicXpMult: 0.25, fx: 'fire' },
  ],
  knight: [
    { id: 'challenge',   name: 'Challenge',    lane: 'offense', cd: 8,  mana: 0,  target: 'taunt' },                       // BIBLE §17 threat, no stun
    { id: 'flame_strike', name: 'Flame Strike', lane: 'offense', cd: 8, mana: 10, rune: 'fire_rune', target: 'enemy',
      dmg: [8, 14], element: 'fire', magicXpMult: 0.25, fx: 'fire' },                                                         // magicXpMult BIBLE §5.1 0.25
    { id: 'power_strike', name: 'Power Strike', lane: 'offense', cd: 6, mana: 6, target: 'enemy', dmg: [7, 13], magicXpMult: 0, fx: 'slash' },
  ],
  paladin: [
    { id: 'hunters_mark', name: "Hunter's Mark", lane: 'offense', cd: 12, mana: 8, target: 'mark', bonus: 1.2, dur: 8 },      // BIBLE §17 mark
    { id: 'flame_volley', name: 'Flame Volley', lane: 'offense', cd: 10, mana: 15, rune: 'fire_rune', ammo: 3, target: 'area',
      dmg: [5, 9], element: 'fire', magicXpMult: 0.25, fx: 'fire' },
    { id: 'precision_shot', name: 'Precision Shot', lane: 'offense', cd: 6, mana: 6, ammo: 1, target: 'enemy', dmg: [7, 12], magicXpMult: 0, fx: 'crossbow' },
  ],
  sorcerer: [
    { id: 'fireball',    name: 'Fireball',     lane: 'offense', cd: 8,  mana: 25, rune: 'fire_rune', target: 'area',
      dmg: [7, 12], element: 'fire', magicXpMult: 1.0, fx: 'fire' },                                                          // BIBLE §17 signature AoE, Fire
    { id: 'frost_lance', name: 'Frost Lance',  lane: 'offense', cd: 6,  mana: 20, rune: 'frost_rune', target: 'enemy',
      dmg: [12, 18], element: 'frost', magicXpMult: 1.0, fx: 'frost' },
    { id: 'arcane_barrier', name: 'Arcane Barrier', lane: 'heal', cd: 20, mana: 30, target: 'self', shield: 40, whenBelow: 0.85, magicXpMult: 1.0 }, // whenBelow designer ruling 2026-10-15
  ],
  druid: [
    { id: 'greater_mend', name: 'Greater Mend', lane: 'heal', cd: 2,  mana: 25, target: 'ally', heal: [40, 60], whenBelow: 0.7, magicXpMult: 1.0 }, // whenBelow designer ruling 2026-10-15
    { id: 'circle_of_renewal', name: 'Circle of Renewal', lane: 'heal', cd: 12, mana: 50, target: 'party', heal: [20, 30], whenBelow: 0.8, minHurt: 2, magicXpMult: 1.0 },
    { id: 'natures_wrath', name: "Nature's Wrath", lane: 'offense', cd: 10, mana: 30, target: 'area', dmg: [3, 6],
      element: 'nature', vuln: true, magicXpMult: 1.0, fx: 'nature' },                                                       // BIBLE §17 ~half AoE + ~10% vuln
  ],
};

// Monsters: hp/atk/xp and the boss row are designer ruling 2026-10-15 (scaled for a 4-hero formation);
// def, gp (×COMBAT.gpMult for normals) and drops are the live rows. Elements re-keyed per REVIEW K12.
const MONSTERS = {
  rat:     { name: 'Giant Rat',  hp: 45, atk: 5,  def: 0, xp: 24, gp: [1, 4],   speed: 3.4,   // hp/atk/xp designer ruling 2026-10-15; def/gp MON:93-94
             weak: 'frost', resist: [], immune: ['nature'],                                    // CLS:60-64 vermin; no fire resist (designer ruling 2026-10-15)
             drops: [['rat_tail', .7], ['small_fang', .12], ['bones', .35]] },                 // MON:95
  slime:   { name: 'Slime',      hp: 50, atk: 4,  def: 0, xp: 22, gp: [1, 3],   speed: 2.4,   // hp/atk/xp designer ruling 2026-10-15; MON:79-84
             weak: null, resist: [], immune: ['fire', 'frost', 'nature'],                      // MON:81 elementImmune (all elements)
             drops: [['slime_gel', .8], ['bones', .25], ['sticky_core', .02]] },               // MON:84
  bat:     { name: 'Giant Bat',  hp: 70, atk: 9,  def: 1, xp: 45, gp: [4, 12],  speed: 4.4,   // hp/atk/xp designer ruling 2026-10-15; MON:153-155
             weak: 'frost', resist: [], immune: ['nature'],                                    // CLS:64 vermin
             drops: [['bat_wing', .7], ['night_fang', .025], ['bones', .5]] },                 // MON:155
  spider:  { name: 'Venom Spider', hp: 90, atk: 13, def: 6, xp: 110, gp: [14, 34], speed: 3.6, // hp/atk/xp designer ruling 2026-10-15; MON:237-239
             weak: 'frost', resist: ['nature'], immune: [],                                    // nature resist: designer ruling 2026-10-15
             drops: [['venom_sac', .55], ['silk_thread', .3], ['spider_eye', .035]] },        // MON:239-240
  kobold:  { name: 'Kobold',     hp: 55, atk: 7,  def: 1, xp: 30, gp: [2, 6],   speed: 3.2,   // hp/atk/xp designer ruling 2026-10-15; MON:120-122
             weak: 'nature', resist: [], immune: [],                                           // CLS:72-76 humanoid weak poison→nature; no fire resist (designer ruling 2026-10-15)
             drops: [['bones', 1], ['bone_chips', .3], ['copper_ore', .18]] },                 // MON:122
  ratking: { name: 'Rat King',   hp: 600, atk: 20, def: 4, xp: 600, gp: [40, 80], speed: 2.8, boss: true, // gp: coordinator, per designer's profit band; rest designer ruling 2026-10-15
             weak: 'frost', resist: ['fire'], immune: ['nature'],                              // designer ruling 2026-10-15
             drops: [['rat_tail', 1], ['crown_shard', .15], ['bones', 1]] },                   // PLACEHOLDER table; crown_shard .15 designer ruling 2026-10-15
};

// PLACEHOLDER loot values (gold) for the analyzer. Not the game's prices.
const LOOT_VALUE = { rat_tail: 3, small_fang: 8, bones: 2, slime_gel: 4, sticky_core: 40, bat_wing: 6, night_fang: 60,
  venom_sac: 12, silk_thread: 10, spider_eye: 90, bone_chips: 3, copper_ore: 5, crown_shard: 150 };
