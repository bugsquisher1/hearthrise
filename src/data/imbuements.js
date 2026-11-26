// ════════════════════════════════════════════════════════════════════════
// src/data/imbuements.js — EVERY BODY'S OWN PART, THE IMBUER'S INPUT (designer 2026-10-21, lane c-loot-loop; the old five kinds and
// three tiers retired by the game designer, lane/tp-im-steps, 2026-11-26: docs/design/redesign/21-flame-temper-imbue-loot.md section 3).
//
// THE RULE, per monster: one row of an item this monster and no other drops (the rows below for the first grounds, each scale ground's
// pack for its own), at uncommon odds (IMBUE_DROP), raw (the vendor bids a fifth of its book value), its book value 2 gold a Level of its
// dropper (imbueValueFor). The item carries `part: true`, so the drop rule finds it.
// WHAT A PART IS FOR. An imbuement row (src/data/imbue-rules.js) names the one part it is made from, at that part's ground's band, and a
// step bench may take a ground's part (src/data/drop-hours.js made.part). A part no row names is Junk in the bag and sells (the bag's
// rule, src/shell/bag-model.js plannedUse). The old `imbue: { kind, tier }` field promised an imbuement every part would feed; the
// redesign makes imbuements a sample of rows instead, each a trade between two grounds (21 D-12).
// The first grounds' parts below feed no imbuement row: under Level 45 an imbuement is worth under a quarter of a step after the ramp
// (src/data/power-ledger.js ramp), so these parts are gold for a new player.
//
// ART: each id has its own 32x32 pixel icon at assets/icons-bundle/pixel/items/<id>.png
// (tests/pixel-icons.mjs: palette-locked, unique, no shared art).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/** A part row's odds: above the rare band (5%, so it is never a rare reveal), at most uncommon (15%). */
export const IMBUE_DROP = Object.freeze({ above: 0.05, max: 0.15 });

/** Book value: 2 gold a monster level (the vendor, raw, bids a fifth of it). */
export function imbueValueFor(level) { return 2 * (Number(level) || 0); }

const row = (n, icon, level) => Object.freeze({ n, icon, v: imbueValueFor(level), raw: true, part: true });

/* One per monster; the dropper's Level (src/data/monsters.js) sets its value. */
export const IMBUE_ITEMS = Object.freeze({
  /* Meadowbrook Thicket: the gray wolves */
  whelp_milk_tooth: row('Pup Milk Tooth', '🦷', 5),
  gray_dewclaw: row('Gray Dewclaw', '🐾', 8),
  briar_burr: row('Briar Burr', '🌰', 10),
  dire_hackle: row('Dire Gray Neck Fur', '🐺', 13),
  grayjaw_whisker: row('Grayjaw Whisker', '〰️', 15),
  /* The Mill Cellar (designer 2026-10-23): the tutorial's three, so its rows read like every other ground's */
  sticky_core: row('Sticky Core', '🟢', 2),
  giant_rat_hide: row('Giant Rat Hide', '🐀', 2),
  hive_wasp_stinger: row('Hive Wasp Stinger', '🐝', 4),
  /* The Sewer */
  rat_incisor: row('Drain Rat Incisor', '🦷', 10),
  sump_membrane: row('Sump Membrane', '🟢', 10),
  kobold_scale: row('Kobold Scale', '🦎', 13),
  culvert_bat_fang: row('Culvert Bat Fang', '🦇', 15),
  cistern_venom_gland: row('Cistern Venom Gland', '🟣', 20),
  knotted_tails: row('Knotted Tails', '🐀', 25),
  /* Mosslight Glade (lane c-ground-16-31, designer 2026-10-21): crows, poachers, vines and the goblins' sluice */
  crow_quill: row('Carrion Crow Quill', '🪶', 16),
  snare_wire: row('Poacher\'s Snare Wire', '➰', 19),
  mosslight_tendril: row('Mosslight Tendril', '🌿', 22),
  sluice_crust: row('Sluice Crust', '🟩', 26),
  rooks_moss_charm: row('Rook\'s Moss Charm', '🧿', 29),
  /* Coppercap Warrens (designer 2026-10-23): the first ground past Level 30 */
  glowing_copper_fleck: row('Glowing Copper Fleck', '✨', 34),
  skulkers_shiv: row('Skulker\'s Shiv', '🗡️', 38),
  dented_copper_pot: row('Dented Copper Pot', '🥘', 40),
  foremans_lash: row('Foreman\'s Lash', '➰', 46),
  coppercaps_tallow: row('Coppercap\'s Tallow', '🕯️', 52),
  /* Wickstead (lane b-greenhaven-6, designer 2026-10-28): the farm's vermin and the road's Turncoats */
  granary_whisker: row('Granary Rat Whisker', '🐀', 9),
  barn_wasp_sting: row('Barn Wasp Sting', '🐝', 11),
  loft_web: row('Loft Web', '🕸️', 13),
  torn_company_badge: row('Torn Company Badge', '🎖️', 16),
  /* The boar and the bear (lane b-unsourced-items; art lane b-boar-bear-art) */
  orchard_boar_tusk: row('Orchard Boar Tusk', '🐗', 12),
  brook_bear_tooth: row('Brook Bear Tooth', '🐻', 24),
});

/* The flavour lines (src/data/item-descriptions.js): what it is, where it comes from. */
export const IMBUE_DESC = Object.freeze({
  whelp_milk_tooth: 'A milk tooth a Gray Wolf Pup lost in a bite. Only the pups of Meadowbrook Thicket shed them',
  gray_dewclaw: 'The hooked fifth claw from a Gray Wolf\'s foreleg, sharp enough to hold a wolf\'s grip',
  briar_burr: 'A burr pulled from a Briarcoat Wolf\'s coat, the kind that catches arrows',
  dire_hackle: 'A tuft of the stiff neck fur a Dire Gray raises before it charges',
  grayjaw_whisker: 'A long gray whisker from Old Grayjaw, the den mother under the hollow oak',
  rat_incisor: 'An orange front tooth from a Drain Rat, worn sharp on the sewer\'s grates',
  sump_membrane: 'The skin of a Sump Slime. Fire, ice and poison don\'t do much to it',
  kobold_scale: 'A shed scale from a Sewer Kobold, scuffed from crawling through the outfalls',
  culvert_bat_fang: 'A needle fang from a Culvert Bat, the bats that roost over the channel',
  cistern_venom_gland: 'The venom gland of a Cistern Spider, still heavy with poison',
  knotted_tails: 'A knot of tails cut from the Rat King, tied too tight for any rat to pull free',
  crow_quill: 'A stiff black flight feather from a Carrion Crow, one of the birds that follow the poachers\' kills',
  snare_wire: 'A loop of goblin copper wire a Glade Poacher sets for the Meadowbrook wolves',
  mosslight_tendril: 'A tendril of the spring moss a Walking Vine drags with it. It still glows a little',
  sluice_crust: 'The green crust that dries on a Goblin Sluicer\'s pan where the copper water runs off',
  rooks_moss_charm: 'A pouch of glowing moss Rook wears round his neck against the spring water\'s green sickness',
  giant_rat_hide: 'A scrap of tough hide off a Giant Rat from under the mill',
  hive_wasp_stinger: 'The barbed stinger of a Hive Wasp from the mill cellar, still sharp enough to draw blood',
  glowing_copper_fleck: 'A fleck of copper from the Warrens that still glows from the spring water, picked out by a scavenger',
  skulkers_shiv: 'The thin blade a Goblin Skulker carries for the back of a party, sharpened on the gallery walls',
  granary_whisker: 'A stiff whisker off a Granary Rat. They got fat on the grain Wickstead left behind',
  barn_wasp_sting: 'The sting of a Barn Wasp from the Wickstead orchard, where the wasps nest in the old trees',
  loft_web: 'A wad of the thick web the Barn Spiders spin across the Wickstead hay loft',
  orchard_boar_tusk: 'A short yellow tusk off an Orchard Boar. They got fat eating the fallen apples at Wickstead',
  brook_bear_tooth: 'A worn tooth from a Brook Bear, the bears that fish the Meadowbrook where it rises',
  torn_company_badge: 'The Banded Company badge a Turncoat cut off his coat when he ran. The loose threads are still hanging off it',
  dented_copper_pot: 'The copper pot a Goblin Digger wears as a helmet. It\'s dented from every blade that\'s ever hit it',
  foremans_lash: 'The knotted lash a Hobgoblin Foreman keeps the diggers working with',
  coppercaps_tallow: 'The tallow Chief Coppercap rubs into his skin. That\'s why frost doesn\'t hurt him as much',
});
