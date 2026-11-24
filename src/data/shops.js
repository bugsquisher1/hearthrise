// ════════════════════════════════════════════════════════════════════════
// Hearthrise — THE PRICE CATALOGUE (data since lane S2, 2026-10-18: gen-shops.mjs + legacy.js are gone; the `supply.*` rows spread in from supply-basics.js SUPPLY_SHOP_OFFERS, the source hr_shop_supply_offers is generated from).
// EVERY GOLD AMOUNT IS A FORMULA since lane/prices-wage-hours (2026-11-23): hours of wage or the store's ask, see NO GOLD IS TYPED below;
// the companions are the one typed holdout (tests/wage-prices.mjs UNCONVERTED).
// EXTRACTED FROM
//   room              40  src/legacy.js
//   seed               3  src/legacy.js (9 seed rows moved to the seed counter, 2026-10-22; the Air Rune row left
//                         with the old rune ladder, 2026-10-23)
//   equip              8  src/legacy.js (5 rows moved to the outfitter, 2026-10-22)
//   property           5  src/features/homestead.js
//   (no character_slot row: all four hero slots are every account's from the start, Tyler 2026-11-21; HERO_SLOTS below)
//   companion          4  src/data/companions.js
//   (the four `plot` buildings and the six `worker` hires were cut 2026-11-07, lane/c-dead-plot-deed: the engine
//    refused every one and nothing read what they granted; tests/catalogue-coherence.mjs C14 keeps them out)
//
// THE LINE SHAPE — both sides of every offer
//   { kind, id, amount }
//     kind    'currency' | 'item' | 'money'   (cost side)
//             'currency' | 'item' | 'unlock' | 'capacity'  (grant side)
//             — kind names WHICH SERVER TABLE a payment debits (an id may be both an item and a currency): never inferred from the id.
//     amount  a non-negative safe integer in the smallest unit.
//             money is in CENTS ('$6.99' → 699).
//
//   The RPC this becomes: hr_shop_buy(p_offer_id, p_intent_id, p_version) →
//   debit every cost line, credit every grant line, one transaction. The
//   client sends an OFFER ID and never a price.
//
// ⚠ DERIVED_PRICES IS NOT DECORATION. These spend sites compute their price at
//   call time and are NOT in SHOP_OFFERS. A consumer that cannot find an
//   offer id must REFUSE, never default — a server that invents a price is
//   worse than a server that has none.
//
// CURRENCIES AND WHERE THEY LIVE SERVER-SIDE
//   gold           player_state.gold
//   gems           account_wallet.gems            (one per ACCOUNT)
//   usd            the platform store, never hr_apply
// ════════════════════════════════════════════════════════════════════════

import { SUPPLY_SHOP_OFFERS, SHOP_SOLD_KINDS } from './supply-basics.js';
import { ITEMS } from './items.js';
import { PROPERTY_TIERS, ROOM_RUNGS } from './homestead-tiers.js';
import { storeAsk } from './store-kit.js';
import { wageListPrice } from './wage.js';

function supplyOffer(s) {
  return { id: s.offer, table: "supply", name: ITEMS[s.item].n, cost: [{ kind: "currency", id: "gold", amount: s.price }],
    grant: [{ kind: "item", id: s.item, amount: 1 }], repeatable: true };
}

/* NO GOLD IS TYPED BELOW (lane/prices-wage-hours, 2026-11-23; 27-formula-overhaul.md E-6 and K-3). An offer's gold is a formula:
     a property deed   wageListPrice(hoursPm, its tier's step)  milli-hours of wage as a list price (homestead-tiers.js PROPERTY_TIERS `step`)
     a room rung       its ROOM_RUNGS row's derived gold        the rung's one home, the same rule at its gate's step
     a good            store-kit.js storeAsk(book x count)      the store ceiling over what its crafted partner is worth
   The material lines follow the gold, in id order, exactly as the server's catalogue lists them. tests/wage-prices.mjs holds it. */
const gold = (amount) => ({ kind: "currency", id: "gold", amount });
const itemLines = (items) => Object.keys(items).sort().map((id) => ({ kind: "item", id, amount: items[id] }));
const equipOffer = (item) => ({ id: "equip." + item, table: "equip", name: ITEMS[item].n, cost: [gold(storeAsk(ITEMS[item].v))],
  grant: [{ kind: "item", id: item, amount: 1 }], repeatable: true });
const bundleOffer = (item, count) => ({ id: "seed." + item, table: "seed", name: ITEMS[item].n, cost: [gold(storeAsk(ITEMS[item].v, count))],
  grant: [{ kind: "item", id: item, amount: count }], repeatable: true });
/** Every deed's price in milli-hours of wage at its tier's step (the property ladder's one price home; tests/wage-prices.mjs reads it). */
export const PROPERTY_HOURS_PM = Object.freeze({ homestead: 31, farmstead: 1865, manor: 10332, keep: 37402, castle: 135516 });
/** A property deed: its PROPERTY_HOURS_PM at its tier's step, its materials, the tier it grants. */
function propertyOffer(id, items) {
  const hoursPm = PROPERTY_HOURS_PM[id];
  const tier = PROPERTY_TIERS.findIndex((t) => t.id === id);
  if (tier < 1) throw new Error('shops: no bought property tier ' + id);
  return { id: "property." + id, table: "property", name: PROPERTY_TIERS[tier].name,
    cost: [gold(wageListPrice(hoursPm, PROPERTY_TIERS[tier].step)), ...itemLines(items)],
    grant: [{ kind: "unlock", id: "property:" + id, amount: tier }] };
}
/** Every room rung as an offer, `room.<room>.<n>`, in id order: its gold and materials are its ROOM_RUNGS row's. */
const ROOM_OFFERS = Object.keys(ROOM_RUNGS).sort().flatMap((room) => ROOM_RUNGS[room].map((r, i) => {
  const { gold: g, ...items } = r.cost;
  return { id: "room." + room + "." + (i + 1), table: "room", name: r.name, cost: [gold(g), ...itemLines(items)],
    grant: [{ kind: "unlock", id: "room:" + room, amount: i + 1 }] };
}));

/* THE HERO SLOTS (Tyler 2026-11-21): every account owns four from its first second, nothing is for sale (public.hr_hero_slots, 1036; tests/hero-slot-buy.mjs; the Path's first beat reads it). */
export const HERO_SLOTS = Object.freeze({ count: 4, free: true });

/** Every offer whose price is data. shop_buy sells only what a Shop tab lists (supply-basics.js SHOP_SOLD_KINDS; the rest
    is refused not_listed, catalogue.js offerRefusal): the legacy equip.* and seed.* rows are a vendor price list only. */
export const SHOP_OFFERS = [
  {
    id: "companion.honeybee", table: "companion",
    name: "Honeybee",
    cost: [{ kind: "currency", id: "gold", amount: 8000 }],
    grant: [{ kind: "unlock", id: "companion:honeybee", amount: 1 }],
    reqSkill: "cooking", reqLv: 25,
  },
  {
    id: "companion.owl", table: "companion",
    name: "Owl",
    cost: [{ kind: "currency", id: "gold", amount: 8000 }],
    grant: [{ kind: "unlock", id: "companion:owl", amount: 1 }],
    reqSkill: "inner_flame", reqLv: 50,
  },
  {
    id: "companion.raccoon", table: "companion",
    name: "Raccoon",
    cost: [{ kind: "currency", id: "gold", amount: 25000 }],
    grant: [{ kind: "unlock", id: "companion:raccoon", amount: 1 }],
  },
  {
    id: "companion.sparrow", table: "companion",
    name: "Sparrow",
    cost: [{ kind: "currency", id: "gold", amount: 5000 }],
    grant: [{ kind: "unlock", id: "companion:sparrow", amount: 1 }],
  },
  /* THE LEGACY EQUIP AND SEED ROWS: a vendor price list only (shop_buy refuses each not_listed): the store's ask (storeAsk, K-3), never typed. */
  equipOffer('apprentice_staff'),
  equipOffer('apprentice_wand'),
  equipOffer('apprentice_primer'),
  equipOffer('bronze_sword'),
  equipOffer('leather_boots'),
  equipOffer('shortbow'),
  equipOffer('stone_maul'),
  /* THE HOUSE'S TOP, OUT OF HIDING (designer 2026-11-15, lane/d-audit-balance-2; the playthrough audit's F12 and F20). Held since 2026-10-31 for
     dragon scales and keystones nothing drops, so the House stopped at the Keep and a Level-80 account had millions and nowhere to put them.
     Now the Castle and the eight fifth rungs ask for Barrow March drops (Krell's gate chains, rake tines, priests' cords, Hask's coins, seals,
     nails, shroud pins, Ford Weed, Grave Dust) and top crafts (Emberforged Bars, Runewood and Duskwood Planks, Cooked Shark). Gold: Castle
     2,500,000, rooms 600,000 to 900,000, 8,450,000 in all, once an account. MEASURED (`audit-table.mjs gold --to 90`): a hero banks 1.10M from
     Level 45 to 60, 1.77M to 75, 1.89M to 90, and Tempering 4 to 6 asks 2.23M of it, so the House is the account's chase of months. A fifth
     rung is +2% at its bench (perks.js), a farm bed or a mount: capacity and comfort, never power.
     THE DEEDS RE-SPACED (Tyler 2026-11-20, call 26-3; 26-home.md §1): 400 / 25,000 / 150,000 / 600,000 / 2,500,000. A tier bought stays bought. */
  /* PRICED IN HOURS OF WAGE (homestead-tiers.js): list prices 2,500,000 / 600,000 / 150,000 / 25,000 / 400. */
  propertyOffer('castle', { ember_bar: 20, gatekeepers_chain: 10, iron_fitting: 30, runewood_plank: 60, timber_beam: 30 }),
  propertyOffer('farmstead', { cooked_shrimp: 10, copper_ore: 25, oak_log: 40, wolf_pelt: 4 }),
  propertyOffer('homestead', { copper_ore: 20, normal_log: 30 }),
  propertyOffer('keep', { bear_pelt: 5, big_bones: 20, iron_fitting: 12, maple_plank: 50, steel_bar: 35, timber_beam: 12 }),
  propertyOffer('manor', { iron_fitting: 6, iron_ore: 40, silk_thread: 8, timber_beam: 6, willow_plank: 35 }),
  /* Every room rung, from its one home (homestead-tiers.js ROOM_RUNGS), in id order. */
  ...ROOM_OFFERS,
  bundleOffer('bronze_arrows', 50),
  bundleOffer('coarse_whetstone', 10),
  bundleOffer('rune_blank', 18),
  /* Tools, gear and seeds, never supplies (Tyler 2026-10-20; designer 2026-10-22); SUPPLY_PRICE_LIST is never sold. */
  ...SUPPLY_SHOP_OFFERS.filter((s) => SHOP_SOLD_KINDS.includes(s.kind)).map(supplyOffer),
];

export const SUPPLY_PRICE_LIST = Object.freeze(SUPPLY_SHOP_OFFERS.filter((s) => !SHOP_SOLD_KINDS.includes(s.kind)).map(supplyOffer));

/**
 * Prices that are FORMULAS, not literals — deliberately absent from
 * SHOP_OFFERS. Listed so nothing downstream mistakes this catalogue for
 * complete. Each says what the server would need in order to own it.
 */
export const DERIVED_PRICES = [
  {
    "id": "bank.gold",
    "name": "Bank space, gold rung",
    "where": "src/legacy.js bankGoldCost() → buyBankSpaceGold()",
    "currency": "gold",
    "formula": "wageListPrice(round(BANK_BASE_HOURS_PM * BANK_GROWTH ^ rungs owned), 1) (src/data/gold-ladders.js bankRungPrice)",
    "params": {
      "baseHoursPm": 232,
      "growth": 1.32,
      "slots": 20
    },
    "server_needs": "player_state must hold the purchase COUNT; the server recomputes the price from it. Unbounded — the client has no cap, so the server needs one before it authorizes this."
  },
  {
    "id": "vendor.sell",
    "name": "Vendor sell-back price",
    "where": "src/screens/shop-counter.js vendorPrice() = supabase/functions/hr-accrue/catalogue.js vendorPriceOf()",
    "currency": "gold",
    "formula": "v = gear (weapon/armor/offhand/jewelry) ? max(1, floor(book * gearSaleRate(item))) : book; min(ITEMS[id].raw ? max(1, floor(v * VENDOR_RAW_RATE)) : v, max(1, floor(SHOP_BUYBACK_RATE * cheapest shop unit price)))   (cap only if the shop sells it)",
    "params": {
      "VENDOR_RAW_RATE": 0.2,
      "VENDOR_GEAR_RATES": [0.5, 0.5, 0.14, 0.075, 0.033, 0.015],
      "VENDOR_HOURLY_ARMOR_T2_RATE": 0.3,
      "SHOP_BUYBACK_RATE": 0.5
    },
    "server_needs": "CLOSED — the edge prices every sale with vendorPriceOf from ITEMS and this catalogue (src/core/shop-buyback.js derives the cheapest unit price for both sides)."
  },
  {
    "id": "vendor.buyback",
    "name": "Vendor buy-back price",
    "where": "src/legacy.js repurchase()",
    "currency": "gold",
    "formula": "buyback[i].unit * buyback[i].qty — the unit price RECORDED at sale time",
    "params": {},
    "server_needs": "a server-side buyback ledger. The price is a property of a past transaction, not of the catalogue, so it can never be a static row — and a client-supplied unit price is a mint."
  },
  {
    "id": "market.*",
    "name": "Player market prices",
    "where": "src/market.js",
    "currency": "gold",
    "formula": "seller-chosen ask, per listing",
    "params": {},
    "server_needs": "market-v2 owns these. A market price is not catalogue data and must never be added to SHOP_OFFERS."
  }
];
