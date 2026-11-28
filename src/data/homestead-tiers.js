// ════════════════════════════════════════════════════════════════════════
// src/data/homestead-tiers.js — THE PROPERTY LADDER AND THE ROOM RUNGS (data).
//
// The property tiers (what each one opens: plots and rooms) and each
// room's rungs (the property tier a rung asks for, and its cost). These rows
// lived in the old client (src/features/homestead.js TIERS and src/legacy.js
// ROOMS) until the client reset on 2026-10-17 and were moved here VERBATIM, so
// the server catalogue generators read them from data:
//   tools/gen-unlock-offers.mjs   room/property prerequisites + the room price cross-check
// This file is the source; change a rung here and regenerate.
//
// NO ASHLAR (designer 2026-10-22): the Stonemason skill and its quarried stone, blocks and ashlar were cut on
// 2026-10-14 (src/data/stonecraft.js). The three properties that asked for ashlar ask for what the priced rows in
// src/data/shops.js already charge.
// THE BENCH CUT'S RE-POINTS (lane/bench-cut-data 2026-11-28; 09-crafting 4.12 to 4.16): no bench makes a good, so every room, chest
// and property cost is a good a job makes. A room asks for its own tier's good (Cooked Pikeperch, Tomato Juice, Cooked Goldgill, Pumpkin
// Cider, Cooked Swordfish, Emberfruit Cordial, Yew Planks), and the castle goods are their materials: a Timber Beam's cost is five Oak
// Planks and an Iron Fitting's four Iron Bars, added to the rung's own. Gold is the rung's hours, so no price moved.
// ONE PRICE (v0.2.30 integration, 2026-10-22): a property tier's price lives ONLY in src/data/shops.js (`property.<id>`,
// what the server charges); this ladder states what a tier OPENS, never what it costs. tools/gen-unlock-offers.mjs refuses
// a tier that carries a `cost` again and a bought tier with no single shop row granting it (catalogue-coherence C10).
//
// EVERY GOLD PRICE HERE IS HOURS OF WAGE (lane/prices-wage-hours, 2026-11-23; 27-formula-overhaul.md E-6; 04 section 11): a rung or
// a chest states `hoursPm`, milli-hours of the wage, and its gold is src/data/wage.js wageListPrice(hoursPm, step), never typed. An account
// good reads the wage at the STEP of the property tier that gates it (PROPERTY_TIERS `step`, the Level that tier is meant for; a room
// rung the higher of its room's opening tier and its own `tier` gate), so a deeper rung is priced in what a company that deep earns
// and moving the wage's levers moves every price with the pay. A tag is a LIST price (two significant figures: 40,000, not 40,087).
// STARTING VALUES (JUDGMENT): each row's hours are the whole milli-hours whose list price is its 2026-11-22 gold at its step, so
// every tag reads what it read; the tier steps are read off what each tier's materials come from (the Thicket's pelts and copper
// 10, iron and willow 30, steel and bear 55, Krell's chains and runewood 90).
// The designer moves hours, never gold. The first rows (steps 1 to 10) re-state the off-scale grounds' pay (about 1/30 of the wage at
// Level 1 today): read them again when the first grounds join the Danger scale.
//
// PURE ESM DATA. Data, the rows' price helpers and the wage's one price function. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════
import { wageListPrice } from './wage.js';

/** THE HOUSE'S TOP, HELD UNTIL ITS CONTENT EXISTS (lane c-house-pelts, 2026-10-31; CLAUDE.md §3.5 half-built features stay
    hidden). Each row keeps its price but asks for an item no player can reach today (dragon scales, keystones, ancient
    runes, dragon bones, a dragon gem), and it is far past a beta's first 100 hours: 150,000-320,000 gold, Crafting and
    Smithing 60+. A held row is refused by name (unlock-catalogue.js) and so never reaches the House window (hr_home_view
    lists sellable rows only). SHRINK-ONLY: tests/catalogue-coherence.mjs C12 fails a row whose items have all become
    reachable, and any row a rung above a visible one could skip to.
    EMPTY SINCE THE MARCH (designer 2026-11-15, lane/d-audit-balance-2; the playthrough audit's F20: "8 million gold and nothing to
    spend it on", an account at 4.49M with every hero slot bought). The Castle and the eight fifth rungs are re-costed to what the Barrow
    March drops and the top crafts make, and priced as the account's long chase: the Castle 2,500,000, the rooms 600,000 to 900,000 each,
    8,450,000 in all, against the 4.76M one hero banks from Level 45 to 90 (src/data/shops.js `property.castle` carries the table). The
    list stays, empty, for the next row whose content isn't built. */
export const HELD_HOME_OFFERS = Object.freeze([]);

/** ROOMS HELD WHOLE UNTIL REBUILT (CLAUDE.md §3.5, 26-home.md §4): the Trophy Room's wall hangs nothing (world-boot.js
    `trophies: null`); the Shrine's rungs are cut (Tyler 2026-11-20, call 26-8), its place on the map kept. No rung of one sells
    (unlock-catalogue.js, home-sections.js); rungs bought stay, shown (hr_home_view). */
export const HELD_HOME_ROOMS = Object.freeze(['trophy', 'shrine']);

/** PROPERTY_TIERS[i] is property tier i. `rooms` are the rooms tier i first opens. */
export const PROPERTY_TIERS = Object.freeze([
  {
    "id": "camp",
    "step": 1,
    "name": "Wanderer's Camp",
    "plots": 2,
    "rooms": []
  },
  {
    "id": "homestead",
    "step": 1,
    "name": "Hearthside Homestead",
    "plots": 4,
    "rooms": [
      "kitchen",
      "garden"
    ]
  },
  {
    "id": "farmstead",
    "step": 10,
    "name": "Fieldworth Farmstead",
    "plots": 6,
    "rooms": [
      "workshop",
      "cellar",
      "forge"
    ]
  },
  {
    "id": "manor",
    "step": 30,
    "name": "Stonecross Manor",
    "plots": 8,
    "rooms": [
      "library"
    ]
  },
  {
    "id": "keep",
    "step": 55,
    "name": "Ironvale Keep",
    "plots": 10,
    "rooms": [
      "shrine",
      "trophy"
    ]
  },
  {
    "id": "castle",
    "step": 90,
    "name": "Hearthrise Castle",
    "plots": 12,
    "rooms": []
  }
]);

/** The property tier index that first opens `room` (-1: none). */
const openTierOf = (room) => PROPERTY_TIERS.findIndex((t) => t.rooms.includes(room));
/** One authored rung: its shop name, its price in milli-hours of wage, its materials, and its own tier gate (absent: the room's). */
const rung = (name, hoursPm, items, tier) => ({ name, hoursPm, items, tier });
/** A room's ladder as its readers see it: { tier?, name, hoursPm, step, cost: { gold, ...items } }, the gold priced at the rung's step. */
function roomLadder(room, rungs) {
  const open = openTierOf(room);
  if (open < 0) throw new Error('homestead-tiers: no property tier opens the room ' + room);
  return Object.freeze(rungs.map((r) => {
    const step = PROPERTY_TIERS[Math.max(open, r.tier || 0)].step;
    return Object.freeze({ ...(r.tier ? { tier: r.tier } : {}), name: r.name, hoursPm: r.hoursPm, step,
      cost: Object.freeze({ gold: wageListPrice(r.hoursPm, step), ...r.items }) });
  }));
}

/** ROOM_RUNGS[roomId][level - 1] = { tier?, name, hoursPm, step, cost }. A rung's `tier` is its own gate above the room's; `cost.gold`
    is derived (wageListPrice). src/data/shops.js builds every `room.<id>.<n>` offer from these rows, so a rung's price has one home. */
export const ROOM_RUNGS = Object.freeze({
  kitchen: roomLadder('kitchen', [
    rung("Kitchen — Hearthstone", 3093, { cooked_trout: 50, iron_bar: 60, oak_plank: 60 }),
    rung("Kitchen — Iron Stove", 5413, { cooked_pikeperch: 50, iron_bar: 100, willow_plank: 60 }),
    rung("Kitchen — Cast-Iron Range", 8507, { steel_bar: 30, tomato_juice: 40, willow_plank: 100 }),
    rung("Kitchen — Twin Range", 12398, { cooked_goldgill: 25, oak_plank: 100, willow_plank: 100 }, 3),
    rung("Kitchen — The Great Hearth", 43365, { cooked_swordfish: 100, ember_bar: 8, runewood_plank: 40 }, 5),
  ]),
  forge: roomLadder('forge', [
    rung("Forge — Field Forge", 5595, { iron_bar: 240, oak_plank: 60 }),
    rung("Forge — Stone Forge", 8207, { iron_bar: 348, steel_bar: 40 }),
    rung("Forge — Double Bellows", 11937, { iron_bar: 60, oak_plank: 50, steel_bar: 100 }),
    rung("Forge — The Great Bellows", 16531, { coal: 200, iron_bar: 100, steel_bar: 150 }, 3),
    rung("Forge — The Deep Forge", 56103, { ember_bar: 30, iron_bar: 160, rake_tine: 20 }, 4),
  ]),
  library: roomLadder('library', [
    rung("Library — Shelf", 4133, { oak_plank: 120, silk_thread: 15 }),
    rung("Library — Reading Room", 6199, { oak_plank: 60, silk_thread: 25, willow_plank: 60 }),
    rung("Library — The Library", 8954, { maple_plank: 60, oak_plank: 75, silk_thread: 30 }),
    rung("Library — The Scriptorium", 13776, { magic_essence: 10, oak_plank: 100, silk_thread: 40 }, 3),
    rung("Library — The Great Library", 46075, { magic_essence: 60, priests_cord: 20, runewood_plank: 40 }, 5),
  ]),
  garden: roomLadder('garden', [
    rung("Garden — Kitchen Garden", 46, { wheat: 20 }),
    rung("Garden — Walled Garden", 193, { wheat: 60 }),
    rung("Garden — The Beds", 696, { pumpkin: 5 }),
    rung("Garden — The Glasshouse", 4133, { goldenroot: 15, oak_plank: 50, silk_thread: 20 }, 3),
    rung("Garden — The Orchard", 37402, { ford_weed: 30, moonbloom: 12, runewood_plank: 40 }, 4),
  ]),
  trophy: roomLadder('trophy', [
    rung("Trophy Room — Trophy Wall", 125, { wolf_pelt: 5 }),
    rung("Trophy Room — The Hall", 499, { bear_pelt: 2 }),
    rung("Trophy Room — Hall of Heads", 1558, { bear_pelt: 4 }),
    rung("Trophy Room — Hall of Banners", 3740, { bear_pelt: 6, iron_bar: 48, war_crown: 1 }, 3),
    rung("Trophy Room — The Long Gallery", 37402, { hasks_coin: 5, runewood_plank: 30, war_crown: 1, warrant_seal: 10 }, 4),
  ]),
  cellar: roomLadder('cellar', [
    rung("Cellar — Root Cellar", 90, { normal_log: 60 }),
    rung("Cellar — Stone Cellar", 298, { oak_log: 60 }),
    rung("Cellar — The Vault", 895, { willow_log: 50 }),
    rung("Cellar — The Cask Room", 4822, { maple_plank: 30, oak_plank: 60, pumpkin_cider: 30 }, 3),
    rung("Cellar — The Deep Cellar", 37944, { barrow_nail: 20, emberfruit_cordial: 20, runewood_plank: 30 }, 5),
  ]),
  workshop: roomLadder('workshop', [
    rung("Workshop — Work Bench", 5595, { iron_bar: 20, oak_plank: 250 }),
    rung("Workshop — Joiner's Bench", 8207, { oak_plank: 60, willow_plank: 100 }),
    rung("Workshop — The Sawpit", 11937, { iron_bar: 40, oak_plank: 100, willow_plank: 200 }),
    rung("Workshop — The Lathe", 16531, { iron_bar: 100, maple_plank: 100, silk_thread: 30 }, 3),
    rung("Workshop — The Master's Shop", 56103, { oak_plank: 150, rune_bar: 6, yew_plank: 25 }, 4),
  ]),
  shrine: roomLadder('shrine', [
    rung("Shrine — Wayside Shrine", 56, { bones: 40 }),
    rung("Shrine — Stone Altar", 218, { big_bones: 25 }),
    rung("Shrine — The Chapel", 810, { big_bones: 40 }),
    rung("Shrine — The Reliquary", 3429, { big_bones: 60, iron_bar: 40, magic_essence: 30 }, 4),
    rung("Shrine — The Ossuary", 37402, { big_bones: 100, grave_dust: 100, shroud_pin: 20 }, 4),
  ]),
});

// ── THE DEPOT'S SPACE (Tyler 2026-10-22: "space can be increased by building
// different storage chests for the house, with gold") ─────────────────────────
// The depot is the ACCOUNT's (supabase/migrations/2026-11-27-account-depot.sql),
// so its space is too: DEPOT_BASE_STACKS distinct item stacks for every account,
// plus `stacks` for each chest the account has built. NOT the bag's cap
// (start-kit.js bankCap is each character's BAG stack cap, a different number).
// Chests are built once each, in this order (a chest needs the one before it),
// at the property tier `tier` asks for, for `cost` (gold + materials, paid by the
// hero who builds it). tools/gen-storage-chests.mjs makes the server catalogue.
// PROPOSED 2026-10-22 (backend-architect) — the game designer rules the numbers.
export const DEPOT_BASE_STACKS = 100;

/* A chest: its gold is milli-hours of wage at its property tier's step (the header's rule). */
const chest = (id, name, stacks, tier, hoursPm, items) => Object.freeze({ id, name, stacks, tier, hoursPm,
  cost: Object.freeze({ gold: wageListPrice(hoursPm, PROPERTY_TIERS[tier].step), ...items }) });

export const STORAGE_CHESTS = Object.freeze([
  chest("millrace_crate", "Millrace Crate", 20, 0, 116, { normal_log: 40 }),
  chest("thicketwood_chest", "Thicketwood Chest", 30, 1, 464, { bronze_bar: 10, oak_plank: 30 }),
  chest("ironbanded_strongbox", "Ironbanded Strongbox", 50, 2, 1865, { iron_bar: 65 }),
  chest("stonecross_vault", "Stonecross Vault", 100, 3, 6199, { oak_plank: 75, steel_bar: 30 }),
]);
