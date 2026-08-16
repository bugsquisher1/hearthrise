/**
 * WAVE 2 (Tyler's hand-generated web-UI item exports) — THE RULING, as code.
 *
 * Every verdict below was made by opening the file: a 265 px identity sheet against
 * the subject clause in `docs/design/item-session-pack.txt`, a 420 px zoom on every
 * marginal call, and a 38 px shelf at true render size. The reasons live here rather
 * than in a chat log so the ruling is re-runnable and arguable.
 *
 * Run:  node tools/art-wave2-select.mjs            (dry run — prints the plan)
 *       node tools/art-wave2-select.mjs --apply    (copies into icons-bundle/hearthfire)
 * Requires `tools/art-wave2-stage.mjs` then `art-batch-process.mjs --px 128` first.
 *
 * ── THE FISHING RODS, which is what Tyler warned about ────────────────────────
 * Seven `_rod` ids; this wave delivers six. FOUR read unmistakably as a fishing rod
 * (tapered pole held on the house diagonal, line hanging from the tip, a terminal
 * hook or lure) and are wired. TWO do not and are refused:
 *   maple_rod — not a pole at all, a solid orange CONE with a hairline drawn beside it.
 *   yew_rod   — a SILVER rod for an id whose subject is "dark yew wood", and it is a
 *               near-clone of `dawnsteel_rod__b`. Two adjacent fishing tiers wearing
 *               the same silver art is worse on a shelf than one honest gap.
 * `willow_rod` was never in this wave (held back in b361) and is still unsolved. So the
 * ladder ships 4 of 7 painted. That is a MIXED FAMILY and it is a deliberate trade: b361
 * refused a lone good rod because its six siblings were all broken, and that ratio has
 * now inverted. NO ROTATION WAS APPLIED to any file — every rod and staff already sits
 * on the same lower-left-to-upper-right diagonal as the rest of the shelf, so rotating
 * would have introduced the inconsistency it was meant to remove. Tyler's permission to
 * rotate was real; the need for it was not.
 *
 * ── THE FUSED FILENAME ────────────────────────────────────────────────────────
 * `----void-censer-png---------void-chitin-weave-png-.png` names two ids. It DEPICTS
 * the second: a stack of flat iridescent plates — chitin weave, with no dome, no
 * chain and no smoke. It is therefore not censer art, and `void_chitin_weave` is not
 * a live ITEMS key, so the file is unusable either way. The real censer (pierced
 * bronze dome, short chain, curling violet smoke) is the second `void_censer` file.
 *
 * ── ID RESOLUTION WORTH KNOWING ───────────────────────────────────────────────
 * `deathsteel_ingot` is not an ITEMS key; the live id is `death_steel` ("Death Steel").
 * It is the one name in `UNRESOLVED_FILES` that this wave actually resolves.
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROC = path.join(ROOT, 'assets', 'art-pilot', 'wave2-proc');
const DEST = path.join(ROOT, 'assets', 'icons-bundle', 'hearthfire');
const APPLY = process.argv.includes('--apply');

/** id -> [category, staged source name]. A source name with `__b`/`__c` is a dupe pick. */
export const WIRE = {
  /* ── armour ─────────────────────────────────────────────────────────────── */
  voidhide_pants: ['armour', 'voidhide_pants'],

  /* ── food ───────────────────────────────────────────────────────────────── */
  // Fourth attempt at this id and the first that is not a humanoid figure.
  potato: ['food', 'potato'],
  ratters_bait: ['food', 'ratters_bait'],

  /* ── items ──────────────────────────────────────────────────────────────── */
  abyssal_greaves: ['items', 'abyssal_greaves'],
  basalt_block: ['items', 'basalt_block'],
  brute_plate: ['items', 'brute_plate'],
  // Dupe pick: __b carries the skull Tyler asked for; __a is a plain violet ingot.
  death_steel: ['items', 'deathsteel_ingot__b'],
  deep_rune_blank: ['items', 'deep_rune_blank'],
  // b361 rejected this id as a molar. This one is a proper tapering canine.
  dire_fang: ['items', 'dire_fang'],
  fox_companion: ['items', 'fox_companion'],
  // Was a golden FIST. Now a fractured grey chunk with gold veins.
  gold_ore: ['items', 'gold_ore'],
  granite: ['items', 'granite'],
  granite_block: ['items', 'granite_block'],
  heartwood_cape: ['items', 'heartwood_cape'],
  // Was an ANVIL across two waves. Now a plain cold-grey rectangular ingot.
  iron_bar: ['items', 'iron_bar'],
  lexarch_seal: ['items', 'lexarch_seal'],
  mithril_bar: ['items', 'mithril_bar'],
  mithril_whetstone: ['items', 'mithril_whetstone'],
  razor_claw: ['items', 'razor_claw'],
  rubble: ['items', 'rubble'],
  // Was a pool 8-ball. Now a slumped translucent green dome.
  slime_gel: ['items', 'slime_gel'],
  // Was a framed landscape PAINTING. Now a clean-edged silver-blue block.
  steel_bar: ['items', 'steel_bar'],
  troll_hide: ['items', 'troll_hide'],
  void_chitin: ['items', 'void_chitin'],
  voidmaw_scepter: ['items', 'voidmaw_scepter'],
  warband_bulwark: ['items', 'warband_bulwark'],
  warboss_standard: ['items', 'warboss_standard'],
  warden_girdle: ['items', 'warden_girdle'],
  willow_plank: ['items', 'willow_plank'],
  wyrmgilt_mantle: ['items', 'wyrmgilt_mantle'],
  // Was a chessboard. Now sawn timber with the cream sapwood stripe named in the brief.
  yew_plank: ['items', 'yew_plank'],

  /* ── weapons ────────────────────────────────────────────────────────────── */
  chief_blade_recipe: ['weapons', 'chief_blade_recipe'],
  dawnsteel_rod: ['weapons', 'dawnsteel_rod__b'],   // dupe: __a is a fat spike, no line
  duskwood_rod: ['weapons', 'duskwood_rod__b'],     // dupe: the clearest hook in the set
  duskwood_staff: ['weapons', 'duskwood_staff'],
  emberhead_arrows: ['weapons', 'emberhead_arrows__b'], // dupe: __b has the ember head
  mithril_arrows: ['weapons', 'mithril_arrows'],
  oak_rod: ['weapons', 'oak_rod__c'],               // dupe: __a a cone, __b too busy at 34px
  rat_stick: ['weapons', 'rat_stick'],
  rune_arrows: ['weapons', 'rune_arrows'],
  runewood_rod: ['weapons', 'runewood_rod'],
  runewood_staff: ['weapons', 'runewood_staff'],
  void_censer: ['weapons', 'void_censer__b'],       // dupe: __a is chitin weave (see header)
  willow_staff: ['weapons', 'willow_staff'],
  yew_staff: ['weapons', 'yew_staff'],
};

/** Delivered, judged, REFUSED — with the reason. Stays on the re-generation worklist. */
export const REFUSED = {
  alphaheart_longbow: 'a pair of curved horns with fur tufts — no limb, no string, not a bow',
  apprentice_staff: 'a short fat tapered tube; reads as a rolled parchment or pipe, not a pole',
  demoncaller_staff: 'the caged coal is right but it sits on a crossbarred MACE head with a stub haft',
  maple_rod: 'a solid orange cone with a hairline beside it — no pole, no grip, no hook',
  maple_staff: 'a short fat conical baton; reads as a wooden cup. The b361 baton failure, unchanged',
  oak_staff: 'a wedge-shaped mallet head on a stub, plus a cast shadow the wrapper bans',
  rune_needle: 'a runed SWORD — tapered blade, ricasso, guard, ring pommel. Not a sewing needle',
  vaultstone: 'a strapped wooden CRATE; no masonry cut, no gold seam, no keystone form',
  widows_fang: 'a broad crescent sickle with an eyeball boss; the subject is a slim dagger',
  yew_rod: 'silver, not dark yew — and a near-clone of dawnsteel_rod, two tiers apart',
};

/** Judged fine but the id does not exist in ITEMS, so there is nothing to wire it to. */
export const GOOD_BUT_UNRESOLVED = [
  'blight_arrows', 'frost_arrows', 'chitinweave_chaps', 'chitinweave_helm',
  'masons_rule_t4', 'masons_rule_t7', 'watchknight_sabatons',
];

if (import.meta.url === url.pathToFileURL(process.argv[1] || '').href) {
  const missing = [];
  for (const [id, [cat, srcName]] of Object.entries(WIRE)) {
    const src = path.join(PROC, srcName + '.png');
    if (!fs.existsSync(src)) { missing.push(srcName); continue; }
    const dst = path.join(DEST, cat, id + '.png');
    if (APPLY) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    console.log((APPLY ? 'wired  ' : 'plan   ') + cat.padEnd(8) + id.padEnd(22) + '<- ' + srcName);
  }
  console.log('\nwire ' + Object.keys(WIRE).length + '  refuse ' + Object.keys(REFUSED).length +
    '  unresolved ' + GOOD_BUT_UNRESOLVED.length);
  if (missing.length) { console.error('MISSING PROCESSED SOURCES: ' + missing.join(', ')); process.exit(1); }
}
