// ============================================================================
// src/data/catacomb-armor.js — THE UNMARKED CATACOMBS' ARMOR: 24 HELMETS AND BOOTS FROM THE HEARTH CHEST (12 SHIP, 12 WAIT)
// (designer, lane/d-catacomb-armor; the design is docs/planning/PRIORITY_BOARD.md "2026-11-16 The Unmarked Catacombs descent" §5-§6).
//
// Tyler 2026-11-16: the Catacombs are their own mode "like the Burning Tower" with ARMOR "instead of weapons"; a Bone Key (the Bone
// Wing) leans helmets, a Waterlogged Key (the Flooded Wing) leans boots; the same Hearth Chest and Bronze / Silver / Gold / Platinum
// tiers "so it's familiar"; tradable, a special attribute each, tiered close to the hunting grounds' tiers. Tyler 2026-11-16 (the
// Coordinator's relay): the Tower's own odds (16 / 8 / 4.5 / 2%), all 24 named now.
//
// THE RULE (the Tower weapons' rule, src/data/chests.js towerWeaponItems on lane/d-tower-weapons): each piece is the STANDARD helmet or
// boots of its slot, armor weight and its key's tier (src/data/gear-tiers.js GEAR_LADDERS, `twin`), EVERY number copied (armor, the
// weight's accuracy fields, crit, Level, book value, rarity, tier), plus ONE special attribute on a field the engine reads:
//   meleePlus / rangedPlus     + that combat skill while worn (src/core/combat.js SKILL_PLUS_FIELDS, built on lane/d-tower-weapons:
//                              it plays exactly as that many more skill levels, tests/hunt-core/tower-weapons-play.mjs)
//   resistPm { element }       less damage from one element (combat.js equipmentStats -> elements.js resistProfile, capped at 40%)
//   steadyPm                   a share off every blow (combat.js equipmentStats -> mitigation.js steadyPmOf, the cape's field)
// One attribute for each slot and weight, the same kind at every tier, so a player learns it once (CATACOMB_ATTRS). Sizes follow the
// special-attribute catalogue's at that tier (lane/d-special-attributes: + the style's skill 2 to tier 4 and 3 from tier 5, 10% of an
// element); the plate boots' steady is this file's (CONFLICTS 2026-11-16: one table should hold it). MEASURED, not assumed
// (tools/balance-sim/catacomb-armor.mjs): the design's +1 Defense plate helm beat the NEXT tier's helm on damage taken at 30, 60 and 88
// (a Defense level is worth more than a tier of helm armor), so the plate helm carries the plate wearer's +Melee instead. Past Platinum a key's
// pieces follow the armor line instead (Tyler 2026-11-16: past tier 7 a line is a budget, never twins).
//
// SHIPPING (lane/c-catacombs, 2026-11-18): the Bronze and Silver twelve (CATACOMB_ARMOR_SHIPPED) are spread into src/data/items.js and their
// lines into item-descriptions.js; src/data/chests.js hands each Catacomb key its tier's six. They reach a hero only through the Hearth Chest,
// behind the descent's switch (unmarked_catacombs). Gold and Platinum stay here, measured, until their batch ships.
//
// NAMES. Each piece was a Havoran's, taken off them before the Keepers carried them down, and locked in the chest under their name in
// the Wood Book (the design's story). Bronze is the street's working poor, Silver the riverside and the market, Gold the Hearth's own
// people who died too poor to be burned in it, Platinum the deepest vaults: the first winter, and Dunn. Every name checked free.
//
// PURE ESM. Data only. Imports nothing.
// ============================================================================

/** The key tiers and the gear tier their pieces wear the numbers of (the Tower keys' `weaponTier`: Iron 2, Mithril 4, Emberforged 6, Dawnsteel 7). */
export const CATACOMB_TIERS = Object.freeze({ bronze: 2, silver: 4, gold: 6, platinum: 7 });

/** The wings' keys and the slot each leans to, permille of the armor a key finds (the design's §5: 70 / 30). The weight is the opener's
    worn piece in that slot half the time (the chest's own `ownPm`, src/data/chests.js CHEST_LUCK). Read by the chest's build, not here. */
export const WING_LEAN = Object.freeze({
  waterlogged: Object.freeze({ wing: 'flooded', name: 'Waterlogged Key', helmet: 300, boots: 700 }),
  bone: Object.freeze({ wing: 'bone', name: 'Bone Key', helmet: 700, boots: 300 }),
});

/* One attribute for each slot and weight. `field` the item field, `element` the resistPm key, `size` by gear tier, `say` the card's
   first sentence ({n} the number as the player reads it). */
export const CATACOMB_ATTRS = Object.freeze({
  'helmet:plate': Object.freeze({ field: 'meleePlus', size: Object.freeze({ 2: 2, 4: 2, 6: 3, 7: 3 }), say: 'Your Melee counts as {n} higher while you wear it.' }),
  'helmet:leather': Object.freeze({ field: 'rangedPlus', size: Object.freeze({ 2: 2, 4: 2, 6: 3, 7: 3 }), say: 'Your Ranged counts as {n} higher while you wear it.' }),
  'helmet:cloth': Object.freeze({ field: 'resistPm', element: 'ember', size: Object.freeze({ 2: 100, 4: 100, 6: 100, 7: 100 }), say: 'You take {n}% less fire damage.' }),
  'boots:plate': Object.freeze({ field: 'steadyPm', size: Object.freeze({ 2: 10, 4: 15, 6: 20, 7: 30 }), say: 'Every hit on you does {n}% less damage.' }),
  'boots:leather': Object.freeze({ field: 'resistPm', element: 'poison', size: Object.freeze({ 2: 100, 4: 100, 6: 100, 7: 100 }), say: 'You take {n}% less poison damage.' }),
  'boots:cloth': Object.freeze({ field: 'resistPm', element: 'frost', size: Object.freeze({ 2: 100, 4: 100, 6: 100, 7: 100 }), say: 'You take {n}% less ice damage.' }),
});

const p = (id, key, slot, weight, twin, name, line) => Object.freeze({ id, key, slot, weight, twin, name, line });

/** THE 24: four keys x helmet and boots x plate, leather and cloth. `twin` is the ladder's piece the row copies. */
export const CATACOMB_ARMOR = Object.freeze([
  /* ── BRONZE, Level 15: the street ── */
  p('tinkers_kettle', 'bronze', 'helmet', 'plate', 'iron_helm', 'Tinker\'s Kettle', 'He mended pots for the whole street and wore the best one.'),
  p('ratters_hood', 'bronze', 'helmet', 'leather', 'studded_helmet', 'Ratter\'s Hood', 'Havora\'s ratters worked the Sewer with a sling and their hoods pulled down.'),
  p('midwifes_hat', 'bronze', 'helmet', 'cloth', 'adept_helmet', 'Midwife\'s Hat', 'She sat up by somebody\'s fire most nights. Her name\'s in the Wood Book too.'),
  p('hodmans_boots', 'bronze', 'boots', 'plate', 'iron_boots', 'Hodman\'s Boots', 'He carried bricks up a ladder all day and never slipped once.'),
  p('tanners_boots', 'bronze', 'boots', 'leather', 'studded_boots', 'Tanner\'s Boots', 'He stood in the lime pits all day, and the boots took it.'),
  p('washerwomans_slippers', 'bronze', 'boots', 'cloth', 'adept_boots', 'Washerwoman\'s Slippers', 'She worked the river all winter, and these are lined with felt.'),
  /* ── SILVER, Level 45: the riverside and the market ── */
  p('cranemans_helm', 'silver', 'helmet', 'plate', 'mithril_helm', 'Craneman\'s Helm', 'He ran the dock crane and wore iron for the day a load swung back.'),
  p('fletchers_hood', 'silver', 'helmet', 'leather', 'snakeskin_helmet', 'Fletcher\'s Hood', 'She made the arrows half of Havora shot, and she tried every batch herself.'),
  p('bakers_cap', 'silver', 'helmet', 'cloth', 'warlock_helmet', 'Baker\'s Cap', 'She had the town ovens going before dawn, and the brim is scorched all the way round.'),
  p('dockhands_boots', 'silver', 'boots', 'plate', 'mithril_boots', 'Dockhand\'s Boots', 'They\'re hobnailed for wet planks, and he never went in the river once.'),
  p('sewermans_boots', 'silver', 'boots', 'leather', 'snakeskin_boots', 'Sewerman\'s Boots', 'He waded the Sewer every day in these, and the pitch kept everything out.'),
  p('fishwifes_slippers', 'silver', 'boots', 'cloth', 'warlock_boots', 'Fishwife\'s Slippers', 'She sold fish on the cold quay every winter morning, and these are lined with rabbit.'),
  /* ── GOLD, Level 75: the Hearth's own ── */
  p('coffer_guards_helm', 'gold', 'helmet', 'plate', 'ember_helm', 'Coffer-Guard\'s Helm', 'Somebody had to watch the chest on the ledge at night. This was his helmet.'),
  p('woodwards_hood', 'gold', 'helmet', 'leather', 'dragonhide_helmet', 'Woodward\'s Hood', 'He guarded the Hearth\'s woodlot with a bow and still couldn\'t pay for his own burning.'),
  p('fire_tenders_cap', 'gold', 'helmet', 'cloth', 'archmage_helmet', 'Fire-Tender\'s Cap', 'She tended the Great Hearth for thirty years and died too poor to be burned in it.'),
  p('porters_boots', 'gold', 'boots', 'plate', 'ember_boots', 'Porter\'s Boots', 'He carried the Hearth\'s wood up from the river road, a load a trip, every day.'),
  p('soapboilers_boots', 'gold', 'boots', 'leather', 'dragonhide_boots', 'Soapboiler\'s Boots', 'She boiled soap from the Hearth\'s own ash, and the lye ate everything but these.'),
  p('scribes_slippers', 'gold', 'boots', 'cloth', 'archmage_boots', 'Scribe\'s Slippers', 'The Keepers\' scribe wrote the names in the Wood Book down in the cold, so he kept his feet warm.'),
  /* ── PLATINUM, Level 88: the deepest vaults ── */
  p('vault_cutters_helm', 'platinum', 'helmet', 'plate', 'dawn_helm', 'Vault-Cutter\'s Helm', 'The men who cut the vaults wore these for falling rock. They were the first ones buried there.'),
  p('pothunters_hood', 'platinum', 'helmet', 'leather', 'dawnhide_helmet', 'Pothunter\'s Hood', 'The pothunters kept the town fed that first winter for as long as there was anything to shoot.'),
  p('almoners_hat', 'platinum', 'helmet', 'cloth', 'duskweave_helmet', 'Almoner\'s Hat', 'He handed out bread and coals from the Hearth that winter until there wasn\'t any of either.'),
  p('ice_cutters_boots', 'platinum', 'boots', 'plate', 'dawn_boots', 'Ice-Cutter\'s Boots', 'They have iron spikes on the soles, for standing on the frozen river all day.'),
  p('dyers_boots', 'platinum', 'boots', 'leather', 'dawnhide_boots', 'Dyer\'s Boots', 'Havora\'s dyers stood in the vats to the knee. These came out stained and whole.'),
  p('dunns_slippers', 'platinum', 'boots', 'cloth', 'duskweave_boots', 'Dunn\'s Slippers', 'Dunn left them in the chest the night he went down. He hasn\'t needed them since.'),
]);

/* THE ROWS THAT SHIP NOW (lane/c-catacombs, 2026-11-18; the design's "24 armor rows (12 now)", CLAUDE.md §10: a batch over 20 ships in
   batches of 20 or fewer): the Bronze and Silver pieces, the ones a hero meets first (the vault doors 10 to 60). A Gold or Platinum Catacomb
   key still drops at its doors and is held, but the chest refuses to open it (`chest_not_ready`, the key kept) until its six pieces ship:
   one more tier here and a regenerated catalogue, nothing else. */
export const CATACOMB_ARMOR_NOW = Object.freeze(['bronze', 'silver']);

/** The rows of CATACOMB_ARMOR that ship now (CATACOMB_ARMOR_NOW). */
export const CATACOMB_ARMOR_SHIPPED = Object.freeze(CATACOMB_ARMOR.filter((r) => CATACOMB_ARMOR_NOW.includes(r.key)));

/** A row's attribute: { field, element, size, value } where value is what the item row carries. */
export function attributeOf(row, attrs = CATACOMB_ATTRS, tiers = CATACOMB_TIERS) {
  const a = attrs[row.slot + ':' + row.weight];
  if (!a) return null;
  const size = a.size[tiers[row.key]];
  return { field: a.field, element: a.element || null, size, value: a.element ? { [a.element]: size } : size };
}

/** The 24 item rows as they would ship, { id: row }, from the catalogue `items` they join: the twin's row with every field copied, its
    own name, its one attribute and `catacombTier` (the key tier it comes out of). Tradeable like any gear (Tyler 2026-10-23: no bound
    gear). Throws when a twin is missing. Pure. */
export function catacombArmorItems(items, rows = CATACOMB_ARMOR, attrs = CATACOMB_ATTRS, tiers = CATACOMB_TIERS) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const r of rows) {
    const base = items && Object.prototype.hasOwnProperty.call(items, r.twin) ? items[r.twin] : null;
    if (!base) throw new Error('src/data/catacomb-armor.js: ' + r.id + ' has no twin ' + r.twin);
    const at = attributeOf(r, attrs, tiers);
    out[r.id] = { ...base, n: r.name, [at.field]: at.value, catacombTier: r.key };
  }
  return out;
}
