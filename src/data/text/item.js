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
  type_training: 'Training item',
  type_gear: 'Gear',
  type_item: 'Item',
  tier: 'Tier {tier}',
  kind_drink: 'Drink that restores {mana} mana',
  kind_rune: 'Rune',
  kind_whetstone: 'Whetstone',
  kind_ammo: 'Ammo',
  kind_food: 'Food that heals {heals} health',
  kind_junk: 'Junk',
  kind_material: 'Material',
  kind_rare: 'Rare',

  /* A piece's resistance, one stat line a kind (src/shell/bag-model.js statLines): {element} is the monster page's own word for it
     (monster.el_ember "Fire", monster.el_physical "Physical"), and the number beside it is how much less the wearer takes. */
  resist_taken: '{element} damage taken',

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
  tool_words: '{effect}. Works from the bag only, best tool counts',
  own_use: 'Own use only, can\'t be sold',
  kit_unlisted: 'Sells to the Shop only, not at the Weighhouse',
  qty_item: '{qty} {item}',
  sells_rares: 'This sells rare finds: {items}.',
  kit_once: 'Nothing sells the {kit} that makes another {item}.',

  /* What it is for. */
  used_in: 'Used in {skill}: {items}',
  worn_in: 'Worn in the {slot} slot',
  eat_heals: 'Eat to heal {heals} health',
  drink_restores: 'Drink to restore {mana} mana',
  burn_trains: 'Burn it in the Great Hearth to train {skill}',
  burn_trains_level: 'Burn it in the Great Hearth to train {skill} (requires {skill} {level})',
  burn_flame: 'Great Hearth: {skill} XP burst, fire {flame} for Havora',
  burn_flame_level: 'Great Hearth: {skill} XP burst, fire {flame} for Havora (requires {skill} {level})',
  cook_it: 'Cook it into food (requires {skill} {level})',
  plant_it: 'Plant it on the Farm',
  train_open: 'Open in Training: {hours} h of 200% {skill} XP',
  outfit_unlocks: 'Unlocks the {outfit} outfit for this hero',
  house_asks: 'Used to build the House',
  temper_asks: 'Used to temper gear',
  /* The bag's picked line: what spends it and where to get more, each a link to its window (src/shell/goto.js). */
  way_used_in: 'Used in {place}',
  place_house: 'the House',
  place_tempering: 'Tempering',
  sell_it: 'Sell it at the shop',
  keep_only: 'Shop won\'t buy it',
  ammo_rune: 'Spent by spells that call for it',
  ammo_whetstone: 'Ammo slot: sharpens a melee weapon, wears out every {swings} swings',
  ammo_shot: 'Fired from a bow or crossbow, one used each shot',
  ammo_endless: 'Fired from a bow or crossbow, never runs out',

  /* A requirement, against the server's number, in the genre's label (audit 2026-11-18 A18: "Requires Level 12", the Tower's door and a
     bench row's own words). */
  need_level: 'Requires Level {level}',
  locked_unlock_first: '{item} is locked. Unlock it first',
  need_level_have: 'Requires Level {level}, now {have}',
  need_skill: 'Requires {skill} {level}',
  need_skill_have: 'Requires {skill} {level}, now {have}',

  /* ONE of an item named in the plural, for a count beside it (src/shell/widgets/bits.js itemNameFor): "1 Bone", never
     "1 Bones" (live v0.2.135). One row per countable stack whose name is plural. A pair (Iron Boots) and a mass (Tempering
     Salts, Coal Tongs) keep their name, so they have none. tests/alpha-windows.mjs TK-8b asks every other plural stack for its row. */
  one_bones: 'Bone',
  one_big_bones: 'Big Bone',
  one_dragon_bones: 'Dragon Bone',
  one_bone_chips: 'Bone Chip',
  one_tower_cinders: 'Hearth Cinder',
  one_knotted_tails: 'Knotted Tail',
  one_bronze_arrows: 'Bronze Arrow',
  one_barbed_arrows: 'Barbed Arrow',
  one_iron_arrows: 'Iron Arrow',
  one_steel_arrows: 'Steel Arrow',
  one_mithril_arrows: 'Mithril Arrow',
  one_rune_arrows: 'Rune Arrow',
  one_emberhead_arrows: 'Emberhead Arrow',
  one_dawnpoint_arrows: 'Dawnpoint Arrow',
  one_iron_bolts: 'Iron Bolt',
  one_plain_iron_arrows: 'Plain Iron Arrow',
  one_plain_barbed_arrows: 'Plain Barbed Arrow',
  one_plain_steel_arrows: 'Plain Steel Arrow',
  one_plain_mithril_arrows: 'Plain Mithril Arrow',
  one_plain_rune_arrows: 'Plain Rune Arrow',
  one_plain_emberhead_arrows: 'Plain Emberhead Arrow',
  one_plain_dawnpoint_arrows: 'Plain Dawnpoint Arrow',
  one_plain_iron_bolts: 'Plain Iron Bolt',
});
