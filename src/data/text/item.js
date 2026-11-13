// ════════════════════════════════════════════════════════════════════════
// src/data/text/item.js — WHAT AN ITEM IS, WHERE IT COMES FROM, WHAT IT IS FOR
// (src/shell/item-lore.js: the tooltip, the short "where to get it" line, a
// requirement, who won't buy it).
//
// One row per sentence or label, read by t('item.<key>'). The tooltip lists
// sources and uses as separate lines; a kind line is labels joined by " · ".
// ════════════════════════════════════════════════════════════════════════

export const ITEM_TEXT = Object.freeze({
  /* The kind line. */
  rarity_common: 'Common',
  rarity_uncommon: 'Uncommon',
  rarity_rare: 'Rare',
  rarity_epic: 'Epic',
  rarity_legendary: 'Legendary',
  rarity_mythic: 'Mythic',
  rarity_unique: 'Unique',
  type_weapon: 'Weapon',
  type_armor: 'Armor',
  type_jewelry: 'Jewelry',
  type_tool: 'Tool',
  type_trophy: 'Trophy',
  type_gear: 'Gear',
  type_item: 'Item',
  tier: 'Tier {tier}',
  kind_drink: 'Drink · restores {mana} mana',
  kind_rune: 'Rune',
  kind_whetstone: 'Whetstone',
  kind_ammo: 'Ammo',
  kind_food: 'Food · heals {heals} health',
  kind_junk: 'Junk',
  kind_material: 'Material',

  /* A bane weapon: its damage against one kind of monster (src/core/bane.js). */
  bane_label: 'Bane',
  bane_more: '+{pct}% damage to {kind} monsters',

  /* Where it comes from. */
  dropped_closed: 'Dropped by creatures on grounds that aren\'t open yet',
  grown_with: 'Grown with {skill}',
  grown_with_level: 'Grown with {skill} {level}',
  gathered_with: 'Gathered with {skill}',
  gathered_with_level: 'Gathered with {skill} {level}',
  made_with: 'Made with {skill}',
  made_with_level: 'Made with {skill} {level}',
  sold_at_shop: 'Sold at the shop',

  /* A tool, and who won't buy it. */
  tool_effect: '{skill} {speed} faster, {xp} more XP, {extra} extra yield',
  tool_words: '{effect} while it\'s in your bag. You don\'t need to equip it. Only your best one counts, and it does nothing in Storage',
  own_use: 'For your own use. The shop and the Weighhouse won\'t take it',
  kit_unlisted: 'The shop buys it, but every new hero starts with some, so the Weighhouse won\'t list it',
  qty_item: '{qty} {item}',
  sells_rares: 'This sells rare finds: {items}.',
  kit_once: 'Nothing sells the {kit} that makes another {item}.',

  /* What it is for. */
  used_in: 'Used in {skill}: {items}',
  worn_in: 'Worn in the {slot} slot',
  eat_heals: 'Eat to heal {heals} health',
  drink_restores: 'Drink to restore {mana} mana',
  burn_trains: 'Burn it in the Great Hearth to train {skill}',
  burn_trains_level: 'Burn it in the Great Hearth to train {skill} ({skill} {level})',
  burn_flame: 'Burn it in the Great Hearth for a burst of {skill} XP, and the fire {flame} for all Havora',
  burn_flame_level: 'Burn it in the Great Hearth for a burst of {skill} XP, and the fire {flame} for all Havora ({skill} {level})',
  cook_it: 'Cook it into food ({skill} {level})',
  plant_it: 'Plant it on the Farm',
  house_asks: 'The House asks for it',
  temper_asks: 'The smith takes it to temper gear',
  /* The bag's picked line: what spends it and where to get more, each a link to its window (src/shell/goto.js). */
  way_used_in: 'Used in {place}',
  place_house: 'the House',
  place_tempering: 'Tempering',
  sell_it: 'Sell it at the shop',
  keep_only: 'The shop won\'t buy it, so it\'s yours to keep',
  ammo_rune: 'Spent by spells that call for it',
  ammo_whetstone: 'Goes in the ammo slot and sharpens a melee weapon. One wears out every {swings} swings',
  ammo_shot: 'Fired from a bow or crossbow. Each shot uses one',
  ammo_endless: 'Fired from a bow or crossbow. They never run out',

  /* A requirement, against the server's number. */
  need_level: 'Needs Level {level}',
  locked_unlock_first: '{item} is locked. Unlock it first.',
  need_level_have: 'Needs Level {level} (you\'re {have})',
  need_skill: 'Needs {skill} {level}',
  need_skill_have: 'Needs {skill} {level} (you have {have})',
});
