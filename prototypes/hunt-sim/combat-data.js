'use strict';
// Hunt-sim combat data: ONE table of first-pass numbers. Every number carries its source.
// Sources:
//   BIBLE    docs/design/COMBAT_DESIGN_BIBLE.md (v1.4) section given
//   REVIEW   docs/design/reviews/2026-10-15-combat-bible-review.md line given
//   RECON    docs/design/reviews/2026-10-15-master-reference-reconciliation.md line given
//   MON      src/data/monsters.js line given (the live monster row)
//   CLS      src/data/monster-classes.js line given (class element profile)
//   COMBAT   src/core/combat.js line given;  ELEM src/core/elements.js line given
//   ASSUMED  no source: a prototype pick, listed in the hunt-sim report
// Client-side prototype only. Nothing here is server data or game code.

const COMBAT = {
  swing: 2.0,                         // RECON:15,61 + COMBAT:64-69 tickMs 2000 — one universal basic-attack interval
  lanes: { offense: 2.0, heal: 1.0 }, // BIBLE §9.1 PROPOSED test values (offensive 2 s, healing 1 s)
  magicXpPerMana: 29,                 // REVIEW:53 K ≈ 29 Magic XP per mana
  manaRegenPerMin: 0.12,              // REVIEW:53 "U's 12%/min regen" of max mana
  weakMult: 1.15,                     // ELEM:50 ELEMENT_BONUS.damage / ELEM:53 MAX_ELEMENT_MULT
  resistMult: 0.75,                   // ASSUMED (elements.js pays resist 1.00 today; Tyler wants resistance from day one, RECON:17)
  immuneMult: 0,                      // ASSUMED (immune = no damage; elements.js has the immune list but pays 1.00)
  defReductionPerPoint: 0.03,         // COMBAT:49 monsterDefenseDamageReduction
  heroAccuracy: 0.85,                 // ASSUMED (combat.js accuracy is skill-based; no levels in the prototype)
  monsterAccuracy: 0.60,              // ASSUMED (COMBAT:50 monsterBaseAccuracy 0.50, nudged for party pressure)
  vulnMult: 1.10,                     // BIBLE §17 "non-stacking ~10% damage-taken vulnerability" (example value)
  vulnSec: 6,                         // ASSUMED (bible gives no duration)
};

// Runes and supplies. Prices are PLACEHOLDER gold values.
const SUPPLIES = {
  fire_rune:  { name: 'Fire Rune (store)',  mult: 1.00, price: 12 },  // mult REVIEW:69 store Basic ×1.00; price ASSUMED
  frost_rune: { name: 'Frost Rune (store)', mult: 1.00, price: 12 },  // ASSUMED (only Fire is specified; Frost mirrors it)
  bolt:       { name: 'Crossbow bolt',      mult: 1.00, price: 2 },   // per-shot cost: RECON / Tyler ruling; price ASSUMED
  mana:       { name: 'Mana (drink-equivalent)', price: 0.5 },        // ASSUMED gold per mana point, for profit/h only
};

// Party heroes: fixed level-20-ish loadouts. No level formula exists yet (BIBLE §6 OPEN), so pools are ASSUMED.
// family / weapon from BIBLE §17; element of the basic attack from the weapon.
const HEROES = {
  knight:   { family: 'melee',       hp: 260, mana: 60,  speed: 3.2, range: 1.5, back: 0,
              basic: { dmg: [4, 9], kind: 'slash' } },                                         // ASSUMED pools + damage
  paladin:  { family: 'ranged',      hp: 180, mana: 90,  speed: 3.2, range: 7, back: 3.5,
              basic: { dmg: [3, 8], kind: 'crossbow', ammo: 'bolt' } },                         // bolt per shot: Tyler ruling
  sorcerer: { family: 'destruction', hp: 140, mana: 320, speed: 3.2, range: 7, back: 6,
              basic: { dmg: [3, 7], kind: 'arcane', mana: 4, magicXpMult: 1.0 } },              // wand costs mana + trains Magic: Tyler ruling; 4 mana ASSUMED
  druid:    { family: 'restoration', hp: 160, mana: 300, speed: 3.2, range: 7, back: 5,
              basic: { dmg: [2, 5], kind: 'nature', element: 'nature', mana: 3, magicXpMult: 1.0 } }, // Nature Bolt (BIBLE §17); 3 mana ASSUMED
};

// 3 abilities per discipline (Tyler ruling; BIBLE §17 rosters, names PROPOSED). All numbers ASSUMED unless noted.
// lane: 'offense' | 'heal'. target: 'enemy' | 'area' | 'self' | 'ally' | 'party'.
const ABILITIES = {
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
    { id: 'arcane_barrier', name: 'Arcane Barrier', lane: 'heal', cd: 20, mana: 30, target: 'self', shield: 40, whenBelow: 0.75, magicXpMult: 1.0 },
  ],
  druid: [
    { id: 'greater_mend', name: 'Greater Mend', lane: 'heal', cd: 2,  mana: 25, target: 'ally', heal: [40, 60], whenBelow: 0.6, magicXpMult: 1.0 },
    { id: 'circle_of_renewal', name: 'Circle of Renewal', lane: 'heal', cd: 12, mana: 50, target: 'party', heal: [20, 30], whenBelow: 0.8, minHurt: 2, magicXpMult: 1.0 },
    { id: 'natures_wrath', name: "Nature's Wrath", lane: 'offense', cd: 10, mana: 30, target: 'area', dmg: [3, 6],
      element: 'nature', vuln: true, magicXpMult: 1.0, fx: 'nature' },                                                       // BIBLE §17 ~half AoE + ~10% vuln
  ],
};

// Monsters: hp/atk/def/xp/gp/drops are the LIVE rows; the Rat King has no row yet (ASSUMED boss).
// Element keys re-keyed per REVIEW K12 (ember→fire, poison→nature). resist list ASSUMED where noted.
const MONSTERS = {
  rat:     { name: 'Giant Rat',  hp: 9,  atk: 2,  def: 0, xp: 6,  gp: [1, 4],   speed: 3.4,   // MON:93-94
             weak: 'frost', resist: ['fire'], immune: ['nature'],                              // CLS:60-64 vermin (weak frost, immune poison); fire resist ASSUMED
             drops: [['rat_tail', .7], ['small_fang', .12], ['bones', .35]] },                 // MON:95
  slime:   { name: 'Slime',      hp: 8,  atk: 2,  def: 0, xp: 5,  gp: [1, 3],   speed: 2.4,   // MON:79-84
             weak: null, resist: [], immune: ['fire', 'frost', 'nature'],                      // MON:81 elementImmune (all elements)
             drops: [['slime_gel', .8], ['bones', .25], ['sticky_core', .02]] },               // MON:84
  bat:     { name: 'Giant Bat',  hp: 24, atk: 7,  def: 1, xp: 24, gp: [4, 12],  speed: 4.4,   // MON:153-155
             weak: 'frost', resist: [], immune: ['nature'],                                    // CLS:64 vermin
             drops: [['bat_wing', .7], ['night_fang', .025], ['bones', .5]] },                 // MON:155
  spider:  { name: 'Venom Spider', hp: 52, atk: 15, def: 6, xp: 82, gp: [14, 34], speed: 3.6, // MON:237-239
             weak: 'frost', resist: ['nature'], immune: [],                                    // CLS:64 vermin weak frost; nature RESIST (not immune) ASSUMED — venomous
             drops: [['venom_sac', .55], ['silk_thread', .3], ['spider_eye', .035]] },        // MON:239-240
  kobold:  { name: 'Kobold',     hp: 12, atk: 3,  def: 1, xp: 10, gp: [2, 6],   speed: 3.2,   // MON:120-122
             weak: 'nature', resist: ['fire'], immune: [],                                     // CLS:72-76 humanoid weak poison→nature; fire resist ASSUMED (lizardfolk)
             drops: [['bones', 1], ['bone_chips', .3], ['copper_ore', .18]] },                 // MON:122
  ratking: { name: 'Rat King',   hp: 320, atk: 14, def: 4, xp: 400, gp: [60, 120], speed: 2.8, boss: true, // ASSUMED (no row in monsters.js)
             weak: 'frost', resist: ['fire'], immune: ['nature'],                              // vermin profile CLS:64 + ASSUMED fire resist
             drops: [['rat_tail', 1], ['crown_shard', .25], ['bones', 1]] },                   // PLACEHOLDER drop table
};

// PLACEHOLDER loot values (gold) for the analyzer. Not the game's prices.
const LOOT_VALUE = { rat_tail: 3, small_fang: 8, bones: 2, slime_gel: 4, sticky_core: 40, bat_wing: 6, night_fang: 60,
  venom_sac: 12, silk_thread: 10, spider_eye: 90, bone_chips: 3, copper_ore: 5, crown_shard: 150 };
