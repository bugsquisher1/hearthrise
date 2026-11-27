// ════════════════════════════════════════════════════════════════════════
// src/data/text/item.js — WHAT AN ITEM IS, WHERE IT COMES FROM, WHAT IT IS FOR
// (src/shell/item-lore.js: the tooltip, the short "where to get it" line, a
// requirement, who won't buy it).
//
// One row per sentence or label, read by t('item.<key>'). The tooltip lists
// sources and uses as separate lines; a kind line is labels joined by " · ".
// ════════════════════════════════════════════════════════════════════════

export const ITEM_TEXT = Object.freeze({
  /* The kind line. A piece that stands out names its step after the kind (src/shell/item-standing.js): plain gear names none. */
  rarity_rare: 'Rare',
  rarity_very_rare: 'Very Rare',
  rarity_signature: 'Signature',
  /* the tooltip's head over a Signature's one fixed rule (src/data/signatures.js tip) */
  sig_rule: 'Effect',
  type_weapon: 'Weapon',
  type_armor: 'Armor',
  type_jewelry: 'Jewelry',
  type_tool: 'Tool',
  type_trophy: 'Trophy',
  type_training: 'Training item',
  type_gear: 'Gear',
  type_item: 'Item',
  tier: 'Tier {tier}',
  /* A plain crafted jewel's card (src/shell/windows/item-tip.js): the perks a gem set in it at its bench can add (post-140 audit C11). */
  perks_possible: 'Possible perks',
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

  /* A piece's bane, one stat line a kind (src/shell/bag-model.js statLines and compare): {kind} is the Bestiary's name for it, and the
     number beside it is how much more the wearer deals (src/core/bane.js, the engine's clamped multiplier). */
  stat_bane: 'Damage to {kind} monsters',
  /* A bane weapon: its damage against one kind of monster (src/core/bane.js), in Equip upgrades' words (src/shell/upgrade-plan.js). */
  bane_more: '+{pct}% damage to {kind} monsters',
  /* The piece on the hero's ground (src/shell/item-lore.js groundEdgeWords): its bane and its element resistance against the monsters
     there. The line's head is the ground's name. {names} lists the monsters, or ground_every when it is all of them. */
  ground_bane: '+{pct}% damage vs {names}',
  ground_resist: '−{pct}% {element} damage from {names}',
  ground_every: 'every monster here',

  /* Where it comes from. */
  grown_with: 'Grown with {skill}',
  grown_with_level: 'Grown with {skill} {level}',
  gathered_with: 'Gathered with {skill}',
  gathered_with_level: 'Gathered with {skill} {level}',
  made_with: 'Made with {skill}',
  made_with_level: 'Made with {skill} {level}',
  sold_at_shop: 'Sold at the shop',

  /* A tool, and who won't buy it. */
  tool_effect: '{skill} {speed} faster, {xp} more XP, {extra} extra yield',
  tool_words: '{effect} · Works from the bag (best tool counts)',
  own_use: 'Own use only, can\'t be sold',
  kit_unlisted: 'Sells to the Shop only, not at the Weighhouse',
  qty_item: '{qty} {item}',
  sells_rares: 'Sells rare finds: {items}',
  kit_once: '{item}: one only ({kit} not sold)',

  /* What it is for. */
  used_in: 'Used in {skill}: {items}',
  worn_in: 'Worn in the {slot} slot',
  eat_heals: 'Eat to heal {heals} health',
  drink_restores: 'Drink to restore {mana} mana',
  burn_trains: 'Great Hearth: trains {skill}',
  burn_trains_level: 'Great Hearth: trains {skill} (requires {skill} {level})',
  burn_flame: 'Great Hearth: {skill} XP burst, fire {flame} for Havora',
  burn_flame_level: 'Great Hearth: {skill} XP burst, fire {flame} for Havora (requires {skill} {level})',
  cook_it: 'Cookable (requires {skill} {level})',
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
  ammo_rune: 'Used by spells',
  ammo_whetstone: 'Ammo slot: sharpens a melee weapon, wears out every {swings} swings',
  ammo_shot: 'Bow or crossbow ammo · One per shot',
  ammo_endless: 'Bow or crossbow ammo · Never runs out',

  /* A requirement, against the server's number, in the genre's label (audit 2026-11-18 A18: "Requires Level 12", the Tower's door and a
     bench row's own words). */
  need_level: 'Requires Level {level}',
  locked_unlock_first: '{item} is locked',
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
