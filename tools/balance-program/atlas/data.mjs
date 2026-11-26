// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/data.mjs — THE GAME'S DATA ROWS, ONCE, AS ONE BUNDLE the atlas and the solver read.
//
// loadData() imports every data module the atlas needs (50-standards 10.5 "Reads") and answers a bundle `D` of MUTABLE COPIES of the rows a
// selftest plants into (ITEMS, MONSTERS, RECIPES, HUNT_GROUNDS ...), beside the game's own pure helpers (pacing, the XP curve, the shop's bid,
// recipe inputs and roll outcomes). Nothing here is a number of its own: every value is the game's.
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
const clone = (o) => JSON.parse(JSON.stringify(o));

export async function loadData() {
  const [I, M, HG, H, LB, CH, TW, TWW, CA, BH, BC, BE, HF, SH, SB, RC, GA, TP, JW, IM, LE, TT, SK, CC, PR, TR, ST, GT, HT, XP, PA, BS, CAT, BT, SR, SC] = await Promise.all([
    mod('src/data/items.js'), mod('src/data/monsters.js'), mod('src/data/hunt-grounds.js'), mod('src/data/hunts.js'), mod('src/data/loot-bands.js'),
    mod('src/data/chests.js'), mod('src/data/tower.js'), mod('src/data/tower-weapons.js'), mod('src/data/catacomb-armor.js'), mod('src/data/boss-halls.js'),
    mod('src/data/boss-calls.js'), mod('src/data/bestiary.js'), mod('src/data/hearthfind.js'), mod('src/data/shops.js'), mod('src/data/supply-basics.js'),
    mod('src/data/recipes.js'), mod('src/data/gathering.js'), mod('src/data/temper.js'), mod('src/data/jewelry.js'), mod('src/data/imbuements.js'),
    mod('src/data/live-events.js'), mod('src/data/tally-tasks.js'), mod('src/data/start-kit.js'), mod('src/data/catalogue-coherence.js'), mod('src/data/premium.js'),
    mod('src/data/training.js'), mod('src/data/stamina-refill.js'), mod('src/data/gear-tiers.js'), mod('tools/balance-program/tier-axis.mjs'), mod('src/core/xp.js'),
    mod('src/core/pacing.js'), mod('src/data/balance-sheet.js'), mod('supabase/functions/hr-accrue/catalogue.js'), mod('src/data/bench-tax.js'),
    mod('src/data/scaled-hunts.js'), mod('src/data/shields.js'),
  ]);
  const ITEMS = { ...I.ITEMS };
  const basics = new Map(SB.BASIC_SUPPLIES.map((b) => [b.id, b]));
  const partnerOf = new Map(SB.BASIC_SUPPLIES.filter((b) => b.partner).map((b) => [b.partner, b]));
  const D = {
    ITEMS, MONSTERS: clone(M.MONSTERS), HUNT_GROUNDS: { ...HG.HUNT_GROUNDS }, OPEN_GROUNDS: { ...HG.OPEN_GROUNDS }, HALL_GROUNDS: HG.HALL_GROUNDS,
    OPEN_HALL_GROUNDS: HG.OPEN_HALL_GROUNDS, CALLED_GROUNDS: HG.CALLED_GROUNDS, TOWER_GROUNDS: HG.TOWER_GROUNDS, HUNT_INDEX: { ...H.HUNT_INDEX },
    LOOT_BANDS: LB.LOOT_BANDS, BAND_TARGETS: LB.BAND_TARGETS, REVEAL_BANDS: LB.REVEAL_BANDS,
    CHEST_KEYS: CH.CHEST_KEYS, CATACOMB_KEYS: CH.CATACOMB_KEYS, KEY_FAMILIES: CH.KEY_FAMILIES, CHEST_LUCK: CH.CHEST_LUCK, CHEST_OUTFITS: CH.CHEST_OUTFITS,
    CINDERS: CH.CINDERS, keyHaul: CH.keyHaul, chestChancePpm: CH.chestChancePpm, weaponFamilyOf: CH.weaponFamilyOf,
    TOWER_RULES: TW.TOWER_RULES, RUN_GROUNDS: TW.RUN_GROUNDS, CATACOMB_WINGS: TW.CATACOMB_WINGS, TOWER_WEAPONS: TWW.TOWER_WEAPONS,
    CATACOMB_ARMOR: CA.CATACOMB_ARMOR, CATACOMB_ARMOR_SHIPPED: CA.CATACOMB_ARMOR_SHIPPED, CATACOMB_TIERS: CA.CATACOMB_TIERS, WING_LEAN: CA.WING_LEAN,
    BOSS_HALLS: BH.BOSS_HALLS, OPEN_BOSS_HALLS: BH.OPEN_BOSS_HALLS, BOSS_HALL_RULES: BH.BOSS_HALL_RULES,
    BOSS_CALLS: BC.BOSS_CALLS, BOSS_CALL_RULES: BC.BOSS_CALL_RULES,
    BESTIARY: BE.BESTIARY, TROPHY_STAGES: BE.TROPHY_STAGES, MAX_MEMORY_DROP_MULT: BE.MAX_MEMORY_DROP_MULT, MAX_TROPHY_DROP_MULT: BE.MAX_TROPHY_DROP_MULT,
    HEARTHFIND_TABLE: HF.HEARTHFIND_TABLE,
    SHOP_OFFERS: SH.SHOP_OFFERS, SHOP_LISTED: new Set(SB.SHOP_LISTED_OFFER_IDS), BASIC_SUPPLIES: SB.BASIC_SUPPLIES, BASIC_EFFECT_SHARE: SB.BASIC_EFFECT_SHARE,
    RECIPES: Object.fromEntries(Object.entries(RC.ARTISAN_RECIPES_EVERY).map(([k, v]) => [k, v.slice()])), recipeCategory: RC.recipeCategory,
    TREES: GA.TREES, ROCKS: GA.ROCKS, FISH_SPOTS: GA.FISH_SPOTS, CROPS: GA.CROPS,
    TEMPER_OFFERS: TP.TEMPER_OFFERS, TEMPER_TIERS: TP.TEMPER_TIERS, TEMPER_MATERIALS: TP.TEMPER_MATERIALS, TEMPER_RUNGS: TP.TEMPER_RUNGS,
    TEMPER_UNIQUE_BANDS: TP.TEMPER_UNIQUE_BANDS,
    HALLMARK_OFFERS: JW.HALLMARK_OFFERS, REFORGE_OFFERS: JW.REFORGE_OFFERS, JEWEL_PIECES: JW.JEWEL_PIECES, JEWEL_POOLS: JW.JEWEL_POOLS,
    JEWEL_SHOP_PRICE: JW.JEWEL_SHOP_PRICE, JEWELRY_ITEMS: JW.JEWELRY_ITEMS, rollOdds: JW.rollOdds, recipeOutcomes: JW.recipeOutcomes, ODDS_SCALE: JW.ODDS_SCALE,
    IMBUE_ITEMS: IM.IMBUE_ITEMS, IMBUE_TIER_FLOORS: IM.IMBUE_TIER_FLOORS,
    LIVE_EVENTS: LE.LIVE_EVENTS, TALLY_TASKS: TT.TALLY_TASKS, TALLY_RULES: TT.TALLY_RULES,
    START_INVENTORY: SK.START_INVENTORY, START_PLOTS: (SK.START_CURRENCY && SK.START_CURRENCY.farmPlots) || 2, START_EQUIPMENT: SK.START_EQUIPMENT,
    PREMIUM_LOGIN_REWARD: PR.PREMIUM_LOGIN_REWARD, TRAINING_GEAR_ITEMS: TR.TRAINING_GEAR_ITEMS, TRAINING_RULES: TR.TRAINING_RULES,
    STAMINA_REFILL: ST.STAMINA_REFILL, refillPrice: ST.refillPrice,
    GEAR_LADDERS: GT.GEAR_LADDERS, MATERIAL_TIERS: GT.MATERIAL_TIERS, SHIELD_ITEMS: SC.SHIELD_ITEMS,
    tiersOf: HT.tiersOf,
    SCALABLE_GROUNDS: SR.SCALABLE_GROUNDS, SCALED_HUNTS: SR.SCALED_HUNTS, lootPmFor: SR.lootPmFor, scaledPricePerHour: SR.pricePerHour,
    BENCH_TAX: BT.BENCH_TAX, BENCH_TAX_FREE_UNDER_MG: BT.BENCH_TAX_FREE_UNDER_MG, benchTaxed: BT.benchTaxed,
    contractXpPerH: BS.contractXpPerH,
    VENDOR_TRASH: CC.VENDOR_TRASH, CODED_SOURCES: CC.CODED_SOURCES, AWAITING_ROSTER: CC.AWAITING_ROSTER, UNREACHABLE: CC.UNREACHABLE, UNREACHABLE_CEILING: CC.UNREACHABLE_CEILING,
    itemUses: CC.itemUses, reachableSources: CC.reachableSources, recipeInputs: CC.recipeInputs,
    pacedActionMs: PA.pacedActionMs, pacedXp: PA.pacedXp, skillXpForLevel: XP.skillXpForLevel, charXpForLevel: XP.charXpForLevel,
    vendorPriceOf: (id) => CAT.vendorPriceOf(ITEMS, id),
  };
  /* What the store charges for one unit of `id` bought in a hunt: a store basic's partner at the basic's price scaled to the partner's effect
     (the store row gives BASIC_EFFECT_SHARE of the crafted partner: recipes-table.mjs's "replaces"), a listed Shop row's gold, else 0. */
  const shopGold = new Map();
  for (const o of D.SHOP_OFFERS) {
    if (!D.SHOP_LISTED.has(o.id)) continue;
    const gold = (o.cost || []).find((c) => c.kind === 'currency' && c.id === 'gold');
    for (const g of o.grant || []) if (g.kind === 'item' && gold) shopGold.set(g.id, gold.amount / (g.amount || 1));
  }
  D.shopGold = shopGold;
  D.storeBasic = (id) => partnerOf.get(id) || null;
  D.storePrice = (id) => {
    const b = partnerOf.get(id), it = ITEMS[id];
    if (b && it) {
      if (b.kind === 'heal') return b.price * (Number(it.heals) || 0) / (b.heals || 1);
      if (b.kind === 'mana') return b.price * (Number(it.mana) || 0) / (b.mana || 1);
      return b.price;
    }
    return shopGold.get(id) || 0;
  };
  D.basics = basics;
  D.uses = D.itemUses();
  return D;
}
