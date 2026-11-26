// ════════════════════════════════════════════════════════════════════════
// src/data/kit-recipes.js — THE KIT TRADES' RECIPES, NAMED: THE SAMPLE OF FIVE (lane/k1-kit-trades-sample, game designer, 2026-11-26;
//   docs/design/redesign/09-crafting.md section 4.9, 20-v030-the-roads.md section 1.4 and lane K1).
//
// A KIT RECIPE IS ONE KIND AT ONE BAND. The kind (src/data/trades.js KINDS) carries everything a recipe costs: its line, its hours of work,
// its inputs by stage share. The band is one gear tier (12-targets 8.3: one metal a tier), so a band's goods are its material's goods,
// "Bronze Arrows" at band 0. A row here only names that pair for a player: its id is derived (recipeId), its trade Level is the band's
// rung (src/core/trades.js bandRung), its inputs are the same band's goods by the catalogue's counts, and its items are the band's
// FACES below. Nothing on a row is a time, a count, an XP amount or a price.
//
// ONE FINISHED KIT GOOD IS ONE HUNTED HOUR of its line for one hero at its band (09 3.3: "one bundle = one hunted hour"). Stock, stock
// rules and the return card count it in hours. The job slice re-cuts each face below to that unit when it replaces the live town work
// (HANDOFFS 2026-11-26, K1); until then the faces are the live items the first hour already names (20 section 3.2: "Cook 10 Shrimp").
//
// THE SAMPLE (CLAUDE.md section 10: about five, played and read before the rest): one recipe for each kit trade and one gathering job,
// all at band 0, so the first day can make every one of them. Every input names a face with a source and every output a face with a
// use (tests/kit-recipes.mjs KR-SOURCE reads catalogue-coherence's doors). The rest of band 0 and bands 1 to 8 land in batches of 20 or
// fewer once the sample is read.
//
// NEW FACES are goods the redesign adds that no live item is yet (an arrowhead). They are not ITEMS rows: an item with no working door is
// not authored (W0), so the job slice adds each one with the verb that makes it.
//
// PURE ESM. Data and its validation only.
// ════════════════════════════════════════════════════════════════════════
import { KINDS, TRADES } from './trades.js';

/* THE BAND'S FACES: kind -> the item it is at each band, band 0 first. Band 0 is Bronze (12-targets 8.3). A hunted stream's face is the
   remains or part a band drops (13-market 3.2: how many make an hour-unit is the drop formulas'). */
export const KIT_FACES = Object.freeze({
  ore: Object.freeze(['copper_ore']),
  bar: Object.freeze(['bronze_bar']),
  arrowhead: Object.freeze(['bronze_arrowheads']),
  log: Object.freeze(['normal_log']),
  shaft: Object.freeze(['normal_plank']),
  arrow: Object.freeze(['bronze_arrows']),
  fish: Object.freeze(['shrimp']),
  meal: Object.freeze(['cooked_shrimp']),
  rune_stone: Object.freeze(['rune_essence']),
  cut_stone: Object.freeze(['rune_blank']),
  rune_fire: Object.freeze(['chalked_fire_rune']),
});
export const STREAM_FACES = Object.freeze({ remains: Object.freeze(['bones']) });

/* New goods, id -> name. Each is made by one recipe here and used by another, and becomes an item with the job slice. */
export const NEW_FACES = Object.freeze({ bronze_arrowheads: 'Bronze Arrowheads' });

/** A recipe's id: its kind and its band ('arrow_b0'). Derived, never typed. */
export const recipeId = (kind, band) => kind + '_b' + band;
/** The item a kind is at `band` (null: no face named yet). */
export const faceOf = (kind, band) => (KIT_FACES[kind] && KIT_FACES[kind][band]) || null;
/** The item a hunted stream drops at `band` (null: none named). */
export const streamFaceOf = (stream, band) => (STREAM_FACES[stream] && STREAM_FACES[stream][band]) || null;

const row = (kind, band, name) => Object.freeze({ id: recipeId(kind, band), kind, band, name });

/* THE SAMPLE: Mining, Smithing, Woodcrafting, Cooking, Runecutting, one each, band 0. The arrowhead and the arrow are 09 3.3's chain 1
   (two trades and one join), so the sample plays the one recipe that needs another trade's part. */
export const KIT_RECIPES = Object.freeze([
  row('ore', 0, 'Mine Copper Ore'),
  row('arrowhead', 0, 'Forge Bronze Arrowheads'),
  row('arrow', 0, 'Fletch Bronze Arrows'),
  row('meal', 0, 'Cook Shrimp'),
  row('rune_fire', 0, 'Cut Chalked Fire Runes'),
]);

/* The sample's size and spread (CLAUDE.md section 10): at most this many rows until the sample is read, one a trade. */
export const SAMPLE = Object.freeze({ max: 5 });

/** Every problem with the rows (the shipped ones by default), as sentences. Empty = valid. */
export function validate(rows = KIT_RECIPES, kinds = KINDS, trades = TRADES, faces = KIT_FACES, fresh = NEW_FACES) {
  const out = [];
  if (rows.length > SAMPLE.max) out.push(rows.length + ' recipes before the sample of ' + SAMPLE.max + ' is read (CLAUDE.md section 10)');
  const seenTrade = new Set(), seenId = new Set();
  for (const r of rows) {
    const k = kinds[r.kind];
    if (Object.keys(r).sort().join() !== 'band,id,kind,name') out.push(r.id + ': a recipe row holds only its kind, band, id and name');
    if (!k) { out.push(r.id + ': no kind ' + r.kind); continue; }
    if (k.ships !== 'v030' || !trades[k.trade] || trades[k.trade].ships !== 'v030') out.push(r.id + ': ' + r.kind + ' does not ship in v0.3.0');
    if (!Number.isInteger(r.band) || r.band < 0) out.push(r.id + ': band ' + r.band + ' is not a whole band');
    if (r.id !== recipeId(r.kind, r.band)) out.push(r.id + ': the id is not recipeId(kind, band)');
    if (seenId.has(r.id)) out.push(r.id + ': twice');
    seenId.add(r.id);
    if (seenTrade.has(k.trade)) out.push(r.id + ': a second ' + k.trade + ' recipe in the sample (one a trade)');
    seenTrade.add(k.trade);
    if (k.stage === 'refine') out.push(r.id + ': a refine step is not a kit recipe the sample plays');
    if (!/^[A-Z][A-Za-z' ]{2,40}$/.test(r.name) || /[;:—]/.test(r.name)) out.push(r.id + ': name ' + JSON.stringify(r.name) + ' is not a short label');
    if (!faceOf(r.kind, r.band)) out.push(r.id + ': no face for ' + r.kind + ' at band ' + r.band);
  }
  for (const [kind, list] of Object.entries(faces)) {
    if (!kinds[kind]) out.push('a face for no kind ' + kind);
    for (const id of list) if (!/^[a-z][a-z0-9_]{1,40}$/.test(id)) out.push(kind + ': face ' + id + ' is not an item id');
  }
  for (const [id, name] of Object.entries(fresh)) {
    if (!Object.values(faces).some((l) => l.includes(id))) out.push('new face ' + id + ' is no kind\'s face');
    if (!/^[A-Z][A-Za-z' ]{2,40}$/.test(name)) out.push('new face ' + id + ' has no label');
  }
  return out;
}
