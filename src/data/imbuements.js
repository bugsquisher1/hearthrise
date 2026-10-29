// ════════════════════════════════════════════════════════════════════════
// src/data/imbuements.js — THE IMBUEMENT SLOT OF EVERY DROP TABLE
//
// Tyler 2026-10-14 (L1): every monster drops gold + 1 junk item + 1 imbuement
// item (unique per monster, tiered by level) + 1 equipment piece; only ONE
// monster per hunt carries the rare items. Tyler 2026-10-14/15 (L4): gear has
// fixed stats and improves only by enhancement or imbuement; an imbuement is
// per gear piece, each kind stacks once per character.
//
// DESIGNER RULING (2026-10-21, lane c-loot-loop). The four slots, per monster:
//   coin       its gp range, every kill
//   junk       ONE row: the creature's own product, at common odds (over 15%).
//              It sells to the vendor; it may also be a craft input (wolf meat
//              cooks, pelts build rooms, bone chips feed Smithing and the Hearth). Bones are NOT the junk
//              slot: a boned creature may add a bones row (the Hearth's fuel), a slime or a
//              spider has none.
//   imbuement  ONE row: an item this monster and no other drops (IMBUE_ITEMS
//              below), at uncommon odds (IMBUE_DROP), tier from the monster's
//              level (imbueTierFor). Raw, so the vendor bids a fifth of its book
//              value: its worth is to the imbuer, not the shop.
//   equipment  the Scarce rows (src/data/loot-bands.js, Tyler 2026-10-23): one
//              armour slot in three weights about hourly, never a reveal.
//   + rare     the Rare (1 per 10-20 h) and Trophy (bosses, 1 per 100-150 h).
//
// IMBUING IS NOT BUILT (L4: no server table, no station, no recipe). Until it
// is, an imbuement item drops, stacks, trades, and the loot filter keeps it
// (selling is opt-in per item, so nothing auto-sells it; it is not `junk`, so
// sell-to-cover never touches it). Its only use TODAY is the vendor, which is
// why every id below is in catalogue-coherence.js VENDOR_TRASH until the L4
// lane gives it a recipe. The `kind` is the imbuement it will feed (the five
// kinds the Inventory's Advanced view already names); the L4 lane may move a
// kind, never an item's source. Item text promises nothing that is not built.
//
// THE SAMPLE (DESIGN_STANDARDS §9): Meadowbrook Thicket and the Sewer, eleven
// monsters, then Mosslight Glade's five (lane c-ground-16-31). The wolves are physical (Keen, Life Leech, Ward); the Sewer feeds
// casters and elements (Mana Leech, Element Ward), so the two first grounds
// compete on what they supply, not on numbers. The Warrens and the Mill Cellar
// follow in the next batch (tests/hunt-core/drop-tables.mjs IMBUE_PENDING).
//
// ART: each id has its own 32x32 pixel icon at assets/icons-bundle/pixel/items/<id>.png
// (tests/pixel-icons.mjs: palette-locked, unique, no shared art).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/** The five imbuement kinds (the Inventory's Advanced view words them). */
export const IMBUE_KINDS = Object.freeze(['keen', 'life_leech', 'mana_leech', 'ward', 'element_ward']);

/** Tier n is fed by monsters of Level IMBUE_TIER_FLOORS[n - 1] or more (provisional until L4 sets the recipes). */
export const IMBUE_TIER_FLOORS = Object.freeze([1, 30, 80]);

/** The tier a monster of `level` feeds: 1, 2 or 3. */
export function imbueTierFor(level) {
  const L = Number(level) || 0;
  let t = 1;
  for (let i = 0; i < IMBUE_TIER_FLOORS.length; i++) if (L >= IMBUE_TIER_FLOORS[i]) t = i + 1;
  return t;
}

/** An imbuement row's odds: above the rare band (5%, so it is never a rare reveal), at most uncommon (15%). */
export const IMBUE_DROP = Object.freeze({ above: 0.05, max: 0.15 });

/** Book value: 2 gold a monster level (the vendor, raw, bids a fifth of it). */
export function imbueValueFor(level) { return 2 * (Number(level) || 0); }

const row = (n, icon, level, kind) => Object.freeze({ n, icon, v: imbueValueFor(level), raw: true,
  imbue: Object.freeze({ kind, tier: imbueTierFor(level) }) });

/* One per monster; the dropper's Level (src/data/monsters.js) sets value and tier. */
export const IMBUE_ITEMS = Object.freeze({
  /* Meadowbrook Thicket: the gray wolves */
  whelp_milk_tooth: row('Whelp Milk Tooth', '🦷', 5, 'life_leech'),
  gray_dewclaw: row('Gray Dewclaw', '🐾', 8, 'keen'),
  briar_burr: row('Briar Burr', '🌰', 10, 'ward'),
  dire_hackle: row('Dire Gray Hackle', '🐺', 13, 'ward'),
  grayjaw_whisker: row('Grayjaw Whisker', '〰️', 15, 'keen'),
  /* The Mill Cellar (designer 2026-10-23): the tutorial's three, so its rows read like every other ground's */
  sticky_core: row('Sticky Core', '🟢', 2, 'element_ward'),
  giant_rat_hide: row('Giant Rat Hide', '🐀', 2, 'ward'),
  hive_wasp_stinger: row('Hive Wasp Stinger', '🐝', 4, 'keen'),
  /* The Sewer */
  rat_incisor: row('Drain Rat Incisor', '🦷', 10, 'keen'),
  sump_membrane: row('Sump Membrane', '🟢', 10, 'mana_leech'),
  kobold_scale: row('Kobold Scale', '🦎', 13, 'ward'),
  culvert_bat_fang: row('Culvert Bat Fang', '🦇', 15, 'life_leech'),
  cistern_venom_gland: row('Cistern Venom Gland', '🟣', 20, 'element_ward'),
  knotted_tails: row('Knotted Tails', '🐀', 25, 'element_ward'),
  /* Mosslight Glade (lane c-ground-16-31, designer 2026-10-21): crows, poachers, vines and the goblins' sluice.
     Mixed on purpose: the hunter's Keen and Life Leech, the caster's Mana Leech, Ward and Element Ward. */
  crow_quill: row('Carrion Crow Quill', '🪶', 16, 'keen'),
  snare_wire: row('Poacher\'s Snare Wire', '➰', 19, 'life_leech'),
  mosslight_tendril: row('Mosslight Tendril', '🌿', 22, 'mana_leech'),
  sluice_crust: row('Sluice Crust', '🟩', 26, 'ward'),
  rooks_moss_charm: row('Rook\'s Moss Charm', '🧿', 29, 'element_ward'),
  /* Coppercap Warrens (designer 2026-10-23): tier 2, the first ground past Level 30 */
  glowing_copper_fleck: row('Glowing Copper Fleck', '✨', 34, 'mana_leech'),
  skulkers_shiv: row('Skulker\'s Shiv', '🗡️', 38, 'keen'),
  dented_copper_pot: row('Dented Copper Pot', '🥘', 40, 'ward'),
  foremans_lash: row('Foreman\'s Lash', '➰', 46, 'life_leech'),
  coppercaps_tallow: row('Coppercap\'s Tallow', '🕯️', 52, 'element_ward'),
  /* Wickstead (lane b-greenhaven-6, designer 2026-10-28): the farm's vermin and the road's Turncoats. A caster's ground
     beside the Thicket's physical three: Mana Leech, Ward and Element Ward, with the rats' Keen. */
  granary_whisker: row('Granary Rat Whisker', '🐀', 9, 'keen'),
  barn_wasp_sting: row('Barn Wasp Sting', '🐝', 11, 'mana_leech'),
  loft_web: row('Loft Web', '🕸️', 13, 'ward'),
  torn_company_badge: row('Torn Company Badge', '🎖️', 16, 'element_ward'),
  /* The boar and the bear (lane b-unsourced-items; art lane b-boar-bear-art) */
  orchard_boar_tusk: row('Orchard Boar Tusk', '🐗', 12, 'ward'),
  brook_bear_tooth: row('Brook Bear Tooth', '🐻', 24, 'life_leech'),
});

/* The flavour lines (src/data/item-descriptions.js): what it is, where it comes from. */
export const IMBUE_DESC = Object.freeze({
  whelp_milk_tooth: 'A milk tooth a Gray Whelp lost in a bite. Only the whelps of Meadowbrook Thicket shed them',
  gray_dewclaw: 'The hooked fifth claw from a Gray Wolf\'s foreleg, sharp enough to hold a wolf\'s grip',
  briar_burr: 'A burr pulled from a Briarcoat Wolf\'s coat, the kind that catches arrows',
  dire_hackle: 'A tuft of the stiff neck fur a Dire Gray raises before it charges',
  grayjaw_whisker: 'A long gray whisker from Old Grayjaw, the den mother under the hollow oak',
  rat_incisor: 'An orange front tooth from a Drain Rat, worn sharp on the sewer\'s grates',
  sump_membrane: 'The skin of a Sump Slime, which nothing in the sump can burn, freeze or poison',
  kobold_scale: 'A shed scale from a Kobold Tosher, scuffed from crawling through the outfalls',
  culvert_bat_fang: 'A needle fang from a Culvert Bat, the bats that roost over the channel',
  cistern_venom_gland: 'The venom gland of a Cistern Spider, still heavy with poison',
  knotted_tails: 'A knot of tails cut from the Rat King, tied too tight for any rat to pull free',
  crow_quill: 'A stiff black flight feather from a Carrion Crow, one of the birds that follow the poachers\' kills',
  snare_wire: 'A loop of goblin copper wire a Glade Poacher sets for the Meadowbrook wolves',
  mosslight_tendril: 'A tendril of the spring moss a Walking Vine drags with it. It still glows a little',
  sluice_crust: 'The green crust that dries on a Goblin Sluicer\'s pan where the copper water runs off',
  rooks_moss_charm: 'A pouch of glowing moss Rook wears round his neck against the spring water\'s green sickness',
  giant_rat_hide: 'A scrap of tough hide off a Giant Rat from under the mill, for the imbuer who wards armor',
  hive_wasp_stinger: 'The barbed stinger of a Hive Wasp from the mill cellar, still sharp enough to draw blood',
  glowing_copper_fleck: 'A fleck of copper from the Warrens that still glows from the spring water, picked out by a scavenger',
  skulkers_shiv: 'The thin blade a Goblin Skulker carries for the back of a party, sharpened on the gallery walls',
  granary_whisker: 'A stiff whisker off a Granary Rat, the rats grown fat on what Wickstead left in its granary',
  barn_wasp_sting: 'The sting of a Barn Wasp from the Wickstead orchard, where the wasps nest in the old trees',
  loft_web: 'A wad of the thick web the Barn Spiders spin across the Wickstead hay loft',
  orchard_boar_tusk: 'A short yellowed tusk off an Orchard Boar, the boars grown fat on the Wickstead windfalls',
  brook_bear_tooth: 'A worn tooth from a Brook Bear, the bears that fish the Meadowbrook where it rises',
  torn_company_badge: 'A free company\'s badge a Turncoat cut off his coat when he deserted. The threads still hang from it',
  dented_copper_pot: 'The copper pot a Goblin Digger wears over its eyes, dented by every blade that ever rang off it',
  foremans_lash: 'The knotted lash a Hobgoblin Foreman keeps the diggers working with',
  coppercaps_tallow: 'The tallow Chief Coppercap rubs into his skin. It is why frost slides off him',
});
