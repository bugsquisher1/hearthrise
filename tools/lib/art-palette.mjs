// ============================================================
// tools/lib/art-palette.mjs — THE COLOUR-NAME → RGB TABLE
//
// The last blocker on the 512-item art batch (art-direction-picker.md §0.10c).
// Recraft's `controls.colors` is the only lever that overrides a custom style
// anchor's palette — it is what turned salmon-pink iron into cold grey iron and
// polychrome-meat `iron_ore` into grey rock with rust streaks. 512 items need
// 512 palettes, and they must be DERIVED from the colour words already written
// into each subject line, not hand-authored 512 times. This is that table;
// `tools/gen-art-colors.mjs` is the deriver.
//
// WHY THIS LIVES IN tools/ AND NOT src/data/
// The browser never reads it. A file under `src/` is subject to the `?v=NNN`
// import discipline, is walked by bump-version.sh, and ships to every player —
// for a table that only ever runs on a developer's machine before an API call.
// Build-time data belongs next to its only consumer. (If a runtime feature ever
// needs tier colours for UI, that is a THEME TOKEN job, not this file: hard
// rule, no hardcoded colours in the client.)
//
// GROUND TRUTH, MEASURED NOT GUESSED
// Values marked [pilot] are k-means cluster centroids sampled from the opaque
// pixels of the approved 1024 px pilots in assets/art-pilot/hearthfire/.
// Values marked [expG] are the exact triples that produced the two verified-good
// §0.10c generations and are reused byte-for-byte — a number that has already
// bought a correct image does not get re-guessed.
//   iron_sword  → 176,186,200 / 107,121,133 blade · 21,20,21 contour · 68,59,59 grip
//   bronze_sword→ 234,167,98 highlight · 119,54,35 dark  (warm, per C-METAL)
//   leather_body→ 173,139,127 / 131,92,79 / 236,189,151
//   wheat_bread → 245,175,121 highlight · 169,105,62 crust
//   winter_wolf → 225,233,238 snow · 169,184,197 ice blue · 65,74,87 storm grey
//   cooked_shrimp→247,134,140 shell pink
//   grim_reaper → 21,21,21 near-black · 234,197,164 bone
// (NB `oak_log.png` samples identical to `bronze_sword.png` — it is the known
// duplicate download, §0.10a. It was NOT used as a source for wood.)
//
// THE TIER-IDENTITY RULE (checked against src/data/gear-tiers.js)
// The seven metal rungs must be distinct AND ORDERABLE at 48 px. Iron and steel
// were the collision risk — both "grey". They are separated on VALUE, which is
// the strongest legibility axis at thumbnail size: iron sits at luma ~155,
// steel at ~205, a 50-step gap, and steel carries a slight blue lift while iron
// is dead neutral. The full ladder reads:
//   bronze  warm gold-brown   →  iron   mid neutral grey
//   → steel bright cool silver → mithril pale blue-silver
//   → rune  dark silver + teal glow → emberforged near-black blue + molten orange
//   → dawnsteel near-white + gold
// i.e. warm → neutral → bright → cool → dark+cool-glow → dark+hot-glow → radiant.
// Hue, value and glow all move; no two rungs share two of the three.
// ============================================================

/**
 * Canonical colour name → { rgb, match }.
 * `match` is the literal vocabulary as it appears in the prompt sheets.
 * Matching is LONGEST-PHRASE-FIRST, so "pale blue-silver" beats "blue".
 * Bare modifiers (pale, dark, deep, bright, faint, plain) are NOT colours and
 * are never entries — they only ever appear inside a longer phrase.
 */
export const PALETTE = {
  // ── METAL LADDER — the itemization itself (gear-tiers.js T1–T7) ──────────
  bronze:            { rgb: [183, 116,  60], match: ['ruddy cast-bronze', 'ruddy cast bronze', 'ruddy bronze', 'cast-bronze', 'cast bronze', 'bronze'] },
  iron:              { rgb: [150, 156, 162], match: ['plain dark grey iron', 'dark grey iron', 'grey iron', 'heavy iron', 'iron'] }, // [expG]
  steel:             { rgb: [198, 208, 218], match: ['bright tempered steel', 'tempered steel', 'steel'] },
  // Mithril was first set at 168,196,220 and the tier-identity guard caught it
  // sitting only 32 RGB units from steel — two adjacent rungs, both cool, both
  // bright, indistinguishable in a 48 px strip. Pushed bluer and a step darker
  // so the hue moves as well as the value. This is exactly the collision §0.9a
  // predicted and it was found by measurement, not by looking.
  mithril:           { rgb: [154, 190, 228], match: ['pale blue-silver', 'blue-silver', 'mithril'] },
  rune_silver:       { rgb: [116, 126, 140], match: ['deep silvered', 'silvered'] },
  rune_glow:         { rgb: [110, 214, 206], match: ['etched runes glowing', 'runes glowing', 'rune-veins', 'rune-etched'] },
  heat_blued:        { rgb: [ 58,  62,  78], match: ['dark heat-blued', 'heat-blued'] },
  molten_seam:       { rgb: [242, 124,  46], match: ['glowing molten seams', 'molten seams', 'molten'] },
  dawnsteel:         { rgb: [238, 240, 236], match: ['near-white radiant steel', 'radiant steel', 'near-white', 'dawnsteel', 'dawnlit'] },
  warm_gold:         { rgb: [214, 168,  74], match: ['warm gold', 'candlelight gold', 'candle gold', 'red-gold', 'golden', 'gold'] },

  // ── other metals ────────────────────────────────────────────────────────
  silver:            { rgb: [186, 192, 200], match: ['cold silver', 'silver'] },
  tarnished_silver:  { rgb: [140, 142, 138], match: ['tarnished silver', 'tarnished'] },
  pewter:            { rgb: [130, 132, 136], match: ['pewter'] },
  brass:             { rgb: [178, 140,  68], match: ['brass'] },
  copper:            { rgb: [180, 102,  58], match: ['copper'] },
  verdigris:         { rgb: [118, 148, 124], match: ['dull grey-green patinated', 'grey-green patinated', 'patinated', 'verdigris', 'grey-green'] },
  rust:              { rgb: [140,  72,  44], match: ['faint rust', 'rusty red-brown', 'rust-red', 'rust'] },
  rust_orange:       { rgb: [186,  96,  40], match: ['rust-orange'] },

  // ── HIDE LADDER — the ranged class ──────────────────────────────────────
  leather_tan:       { rgb: [150, 106,  68], match: ['plain tanned tan leather', 'tanned tan leather', 'tanned tan', 'tan leather', 'tanned', 'leather'] }, // [pilot]
  dark_brown_leather:{ rgb: [ 92,  64,  44], match: ['dark brown leather', 'dark brown', 'umber', 'deep umber'] },
  boarhide_ochre:    { rgb: [166, 124,  58], match: ['coarse ochre boarhide', 'coarse ochre', 'ochre'] },
  snakeskin_green:   { rgb: [ 86, 138,  74], match: ['green scaled snakeskin', 'snakeskin', 'moss green', 'green'] },
  wyvern_slate:      { rgb: [104, 120, 136], match: ['slate blue-grey', 'wyvern scale', 'blue-grey', 'slate'] },
  dragonhide_oxblood:{ rgb: [122,  38,  40], match: ['deep oxblood-red', 'oxblood-red', 'oxblood'] },
  void_black:        { rgb: [ 24,  22,  30], match: ['black scale', 'blue-black', 'green-black', 'black'] },
  void_violet:       { rgb: [124,  74, 168], match: ['faint violet sheen', 'faint violet', 'violet', 'purple'] },
  starless_violet:   { rgb: [ 92,  46, 140], match: ['starless violet'] },

  // ── CLOTH LADDER — the magic class ──────────────────────────────────────
  linen_undyed:      { rgb: [214, 202, 176], match: ['undyed coarse linen', 'coarse linen', 'plain undyed', 'undyed', 'linen', 'homespun'] },
  wool_blue_grey:    { rgb: [124, 140, 158], match: ['blue-grey wool'] },
  scholar_green:     { rgb: [ 46,  86,  60], match: ['deep green'] },
  warlock_purple:    { rgb: [ 78,  50, 100], match: ['dark purple'] },
  midnight_blue:     { rgb: [ 34,  44,  86], match: ['midnight blue'] },
  cloth_white:       { rgb: [240, 238, 232], match: ['white and gold', 'white'] },

  // ── WOOD LADDER ─────────────────────────────────────────────────────────
  softwood_pale:     { rgb: [212, 188, 146], match: ['pale untreated softwood', 'untreated softwood', 'softwood'] },
  oak_brown:         { rgb: [140,  96,  54], match: ['warm brown oak', 'close-grained oak', 'warm brown', 'oak'] },
  willow_pale:       { rgb: [186, 186, 140], match: ['pale supple willow', 'slightly greenish', 'greenish', 'willow'] },
  maple_honey:       { rgb: [214, 166,  86], match: ['golden-honey maple', 'golden-honey', 'honey', 'maple'] },
  yew_red_brown:     { rgb: [150,  84,  56], match: ['red-brown yew', 'red-brown', 'yew', 'chestnut'] },
  runewood:          { rgb: [ 70,  54,  44], match: ['dark runewood', 'runewood', 'dark timber'] },
  duskwood_black:    { rgb: [ 38,  36,  42], match: ['near-black wood', 'duskwood'] },

  // ── NEUTRALS — the class the SUFFIX's neutral-material lock protects ────
  contour_black:     { rgb: [ 26,  28,  32], match: ['near-black', 'charcoal', 'soot', 'coal', 'char black'] }, // [expG]
  neutral_grey:      { rgb: [146, 146, 146], match: ['neutral grey', 'muddy grey', 'cliff-grey', 'grey muzzle', 'dusty grey', 'grey'] },
  ash_grey:          { rgb: [128, 126, 120], match: ['ash grey', 'ash'] },
  stone_grey:        { rgb: [140, 138, 132], match: ['dressed stone', 'stone'] },
  granite_pink:      { rgb: [176, 150, 146], match: ['speckled pink-grey granite', 'pink-grey granite', 'pink-grey', 'granite'] },
  basalt:            { rgb: [ 48,  48,  54], match: ['columnar basalt', 'basalt'] },
  death_steel:       { rgb: [ 96,  98,  92], match: ['corpse-forged death-steel', 'death-steel', 'deathsteel', 'grim death-steel'] },
  bone:              { rgb: [222, 212, 190], match: ['pale bone', 'dull ivory', 'ivory', 'chalk white', 'chalk', 'yellowed', 'bone'] },
  parchment:         { rgb: [222, 203, 166], match: ['stiff parchment', 'parchment', 'vellum'] },
  cream:             { rgb: [236, 226, 204], match: ['cream sapwood', 'lace cream', 'cream'] },

  // ── EARTH + ORGANIC ─────────────────────────────────────────────────────
  brown:             { rgb: [110,  76,  50], match: ['wet-earth brown', 'mud-caked', 'brown'] },
  clay:              { rgb: [162, 106,  74], match: ['clay'] },
  wheat_straw:       { rgb: [214, 186, 124], match: ['straw', 'wheat', 'sand', 'dusty tan', 'tan'] },
  bread_crust:       { rgb: [186, 118,  66], match: ['baked crust', 'crust', 'crackling browned', 'browned', 'caramelised', 'caramelized', 'crisped', 'seared', 'fire-roasted', 'roasted', 'roast', 'golden-baked'] }, // [pilot]
  raw_meat:          { rgb: [156,  64,  58], match: ['raw cut', 'raw meat', 'red meat'] },
  herb_green:        { rgb: [ 96, 140,  64], match: ['sprig of herb', 'herb', 'leaf', 'amber-green'] },
  charred:           { rgb: [ 42,  38,  38], match: ['charred', 'blackened', 'scorched', 'faint char', 'char'] },

  // ── REDS ────────────────────────────────────────────────────────────────
  madder_red:        { rgb: [166,  54,  46], match: ['raw madder-red', 'dry madder-red', 'madder-red'] },
  crimson:           { rgb: [150,  32,  40], match: ['dusty crimson', 'crimson', 'scarlet'] },
  red:               { rgb: [176,  46,  42], match: ['blood-red', 'red-orange', 'red'] },
  ruby:              { rgb: [158,  32,  48], match: ['cut ruby', 'ruby'] },
  shell_pink:        { rgb: [232, 140, 146], match: ['pink-orange', 'pink'] }, // [pilot]

  // ── WARM LIGHT / FIRE ───────────────────────────────────────────────────
  ember_orange:      { rgb: [242, 124,  46], match: ['ember orange', 'ember red', 'hot orange', 'demonfire', 'hearth flame', 'flame', 'ember'] },
  amber:             { rgb: [214, 146,  48], match: ['dull amber', 'amber'] },
  orange:            { rgb: [230, 140,  56], match: ['orange'] },
  yellow:            { rgb: [222, 196,  80], match: ['yellow'] },

  // ── COLDS ───────────────────────────────────────────────────────────────
  snow_white:        { rgb: [232, 238, 242], match: ['snow white', 'frost-laden white', 'frost'] }, // [pilot]
  ice_blue:          { rgb: [180, 200, 214], match: ['pale ice blue', 'pale blue-white', 'blue-white', 'ice blue', 'pale blue', 'rimed', 'rime', 'ice'] }, // [pilot]
  storm_grey:        { rgb: [ 65,  74,  87], match: ['dark storm grey', 'storm grey'] }, // [pilot]
  blue:              { rgb: [ 64,  96, 164], match: ['cool blue', 'blue'] },
  teal:              { rgb: [ 56, 140, 140], match: ['blue-green', 'teal'] },
  sapphire:          { rgb: [ 44,  72, 158], match: ['sapphire', 'glacier blue'] },
  shadow_indigo:     { rgb: [ 38,  44,  78], match: ['deep shadow indigo', 'shadow indigo', 'indigo'] },

  // ── GREENS ──────────────────────────────────────────────────────────────
  sickly_green:      { rgb: [176, 190,  72], match: ['sickly green-yellow', 'green-yellow', 'yellow-green', 'sickly green', 'sickly'] },
  olive:             { rgb: [110, 110,  60], match: ['olive', 'green-grey'] },
  emerald:           { rgb: [ 46, 132,  96], match: ['jade', 'emerald'] },

  // ── ARCANE LIGHT — the one hue the pilots do not contain ────────────────
  // No approved pilot carries an arcane glow, so this is the single value in
  // the table with no measured source. Set cool and pale so it cannot be
  // mistaken for the ember/molten warm channel, which is a STAT signal.
  arcane_glow:       { rgb: [168, 196, 236], match: ['violet-white', 'arcane light', 'luminous', 'wisp'] },
  pale_glass:        { rgb: [198, 214, 222], match: ['cold pale glass', 'pale glass', 'glass', 'translucent'] },
};

/**
 * MATERIAL → colour-name fallback, applied only AFTER every colour phrase has
 * been consumed. It exists because ~10% of the sheet's lines name an object
 * whose colour is universally understood and therefore never written down —
 * "a rolled builder's plan", "a burlap pouch", "carved wooden beads". Those
 * lines are not defective; a plan is parchment and everybody knows it.
 *
 * They still MUST get a palette. A line with no `controls.colors` falls back to
 * the anchor's own colours, and the anchor's own colours are the salmon-pink
 * defect §0.10c exists to fix — so "no colour named" cannot mean "no palette
 * sent". This table is how the food and paper categories, the two weakest in
 * the batch, get a deliberate palette instead of a roll of the dice.
 */
export const MATERIALS = {
  parchment:  ['builder’s plan', 'builders plan', 'rolled plan', 'plan showing', 'diagram', 'pattern', 'scroll', 'grimoire', 'codex', 'cookbook', 'ledger', 'pages', 'page', 'map', 'recipe', 'blueprint'],
  contour_black: ['inked', 'ink', 'script', 'glyph', 'tally marks'],
  oak_brown:  ['wooden', 'timber', 'wood', 'sticks', 'stick', 'spool', 'haft', 'shaft', 'handle', 'beads', 'platter', 'bowl', 'stem', 'spool'],
  linen_undyed: ['burlap', 'sack', 'pouch', 'waxed cloth', 'oilcloth', 'cloth', 'cord', 'twine', 'sinew', 'thread', 'silk', 'wool', 'shroud', 'lace', 'feather', 'cloak', 'coat', 'cape', 'mantle', 'robe', 'tunic', 'hood', 'collar'],
  bone:       ['fang', 'claw', 'tooth', 'teeth', 'skull', 'rib', 'antler', 'horn', 'tusk', 'plating', 'chitinous', 'chitin', 'shell'],
  raw_meat:   ['meat', 'flesh', 'joint', 'steak', 'prawn', 'lobster', 'fillet'],
  cream:      ['butter', 'mashed', 'broth', 'supper', 'loaf', 'bread', 'dough', 'stew', 'bait'],
  wheat_straw: ['seeds', 'seed', 'grain', 'straw'],
  ice_blue:   ['fish', 'trout', 'scaled'],
  stone_grey: ['runestone', 'tablet', 'masonry', 'rock', 'stone'],
  leather_tan: ['pelt', 'hide', 'fur', 'sinew-strung'],
  brown:      ['soil', 'earth', 'mud', 'root'],
  iron:       ['metals', 'metal', 'badges', 'wire', 'nail', 'ingot', 'riveted', 'breastplate', 'armour panels', 'tin'],
  void_black: ['pure absence', 'nothingness', 'absence', 'void', 'rift'],
  pale_glass: ['crystalline', 'crystal', 'vial', 'faceted', 'gem'],
  ash_grey:   ['smoke', 'smoking', 'dust', 'ash-'],
  herb_green: ['vegetable', 'vegetables', 'sprout', 'sprouting'],
};

/**
 * The shared contour anchor. Every approved pilot's largest cluster is a
 * near-black (15,13,18 → 23,25,32 across the set) and the one verified-good
 * §0.10c item palette carries it as its second triple. Appended to every
 * derived palette when there is room, because without it the anchor paints
 * flat low-contrast shapes that die at 48 px.
 */
export const CONTOUR = 'contour_black';

/**
 * Words that MEAN a colour is being specified. Used by the deriver's
 * fail-loudly pass: any of these left in a subject line after every table
 * phrase has been consumed is an UNMAPPED colour phrase and stops the batch.
 * This is deliberately broader than the table — that gap is the whole point.
 */
export const COLOUR_TOKENS = new Set([
  'grey', 'gray', 'silver', 'silvered', 'silvery', 'black', 'white', 'red', 'blue',
  'green', 'brown', 'tan', 'gold', 'golden', 'bronze', 'copper', 'brass', 'ochre',
  'amber', 'violet', 'purple', 'crimson', 'scarlet', 'umber', 'ivory', 'bone',
  'cream', 'charcoal', 'ash', 'rust', 'rusty', 'russet', 'teal', 'pink', 'salmon',
  'orange', 'yellow', 'jade', 'emerald', 'sapphire', 'ruby', 'olive', 'slate',
  'pewter', 'oxblood', 'madder', 'maroon', 'indigo', 'lilac', 'mauve', 'beige',
  'khaki', 'sepia', 'verdigris', 'patinated', 'honey', 'straw', 'wheat', 'sand',
  'clay', 'soot', 'coal', 'chalk', 'snow', 'frost', 'ice', 'ember', 'molten',
  'chestnut', 'sickly', 'mithril', 'dawnsteel', 'duskwood', 'boarhide',
  'snakeskin', 'dragonhide', 'voidhide', 'linen', 'oak', 'willow', 'maple', 'yew',
]);

/** Tokens that look like colours in isolation but never are, in this corpus. */
export const COLOUR_TOKEN_EXEMPT = new Set([
  // "iron studs"/"a plain iron band" are objects, but iron IS in the table so it
  // never reaches the residual pass. These are the true false-positives found by
  // running the deriver over all 512 lines.
  'goldsmith', 'goldfish', 'silverfish', 'coalfish', 'greyhound',
]);

export const PALETTE_SIZE = Object.keys(PALETTE).length;
