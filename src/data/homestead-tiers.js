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
// src/data/shops.js already charge: the Manor and the Keep iron fittings and timber beams, the Castle keystones.
// ONE PRICE (v0.2.30 integration, 2026-10-22): a property tier's price lives ONLY in src/data/shops.js (`property.<id>`,
// what the server charges); this ladder states what a tier OPENS, never what it costs. tools/gen-unlock-offers.mjs refuses
// a tier that carries a `cost` again and a bought tier with no single shop row granting it (catalogue-coherence C10).
//
// EVERY GOLD PRICE HERE IS HOURS OF WAGE (lane/prices-wage-hours, 2026-11-23; 27-formula-overhaul.md E-6; 04 section 11): a rung or
// a chest states `hoursPm`, milli-hours of the wage, and its gold is src/data/wage.js wagePrice(hoursPm, step), never typed. An account
// good reads the wage at the STEP of the property tier that gates it (PROPERTY_TIERS `step`, the Level that tier is meant for; a room
// rung the higher of its room's opening tier and its own `tier` gate), so a deeper rung is priced in what a company that deep earns
// and moving the wage's levers moves every price with the pay. STARTING VALUES (JUDGMENT): each row's hours are its 2026-11-22 gold
// over the wage at its step, to two figures (every price within 4% of what it was), the tier steps read off what each tier's
// materials come from (the Thicket's pelts and copper 10, iron and willow 30, steel and bear 55, Krell's chains and runewood 90).
// The designer moves hours, never gold. The first rows (steps 1 to 10) re-state the off-scale grounds' pay (about 1/30 of the wage at
// Level 1 today): read them again when the first grounds join the Danger scale.
//
// PURE ESM DATA. Data, the rows' price helpers and the wage's one price function. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════
import { wagePrice } from './wage.js';

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
      cost: Object.freeze({ gold: wagePrice(r.hoursPm, step), ...r.items }) });
  }));
}

/** ROOM_RUNGS[roomId][level - 1] = { tier?, name, hoursPm, step, cost }. A rung's `tier` is its own gate above the room's; `cost.gold`
    is derived (wagePrice). src/data/shops.js builds every `room.<id>.<n>` offer from these rows, so a rung's price has one home. */
export const ROOM_RUNGS = Object.freeze({
  kitchen: roomLadder('kitchen', [
    rung("Kitchen — Hearthstone", 3100, { cooked_trout: 50, iron_bar: 60, oak_plank: 60 }),
    rung("Kitchen — Iron Stove", 5400, { cooked_lobster: 50, iron_bar: 100, willow_plank: 60 }),
    rung("Kitchen — Cast-Iron Range", 8500, { steel_bar: 30, wheat_bread: 40, willow_plank: 100 }),
    rung("Kitchen — Twin Range", 12000, { field_ration: 25, timber_beam: 20, willow_plank: 100 }, 3),
    rung("Kitchen — The Great Hearth", 43000, { cooked_shark: 100, ember_bar: 8, runewood_plank: 40 }, 5),
  ]),
  forge: roomLadder('forge', [
    rung("Forge — Field Forge", 5600, { iron_bar: 200, iron_fitting: 10, oak_plank: 60 }),
    rung("Forge — Stone Forge", 8200, { iron_bar: 300, iron_fitting: 12, steel_bar: 40 }),
    rung("Forge — Double Bellows", 12000, { iron_fitting: 15, steel_bar: 100, timber_beam: 10 }),
    rung("Forge — The Great Bellows", 17000, { coal: 200, iron_fitting: 25, steel_bar: 150 }, 3),
    rung("Forge — The Deep Forge", 56000, { ember_bar: 30, iron_fitting: 40, rake_tine: 20 }, 4),
  ]),
  library: roomLadder('library', [
    rung("Library — Shelf", 4100, { oak_plank: 80, silk_thread: 15, timber_beam: 8 }),
    rung("Library — Reading Room", 6200, { silk_thread: 25, timber_beam: 12, willow_plank: 60 }),
    rung("Library — The Library", 9000, { maple_plank: 60, silk_thread: 30, timber_beam: 15 }),
    rung("Library — The Scriptorium", 14000, { magic_essence: 10, silk_thread: 40, timber_beam: 20 }, 3),
    rung("Library — The Great Library", 46000, { magic_essence: 60, priests_cord: 20, runewood_plank: 40 }, 5),
  ]),
  garden: roomLadder('garden', [
    rung("Garden — Kitchen Garden", 46, { wheat: 20 }),
    rung("Garden — Walled Garden", 190, { wheat: 60 }),
    rung("Garden — The Beds", 700, { pumpkin: 5 }),
    rung("Garden — The Glasshouse", 4100, { goldenroot: 15, silk_thread: 20, timber_beam: 10 }, 3),
    rung("Garden — The Orchard", 37000, { ford_weed: 30, moonbloom: 12, runewood_plank: 40 }, 4),
  ]),
  trophy: roomLadder('trophy', [
    rung("Trophy Room — Trophy Wall", 120, { wolf_pelt: 5 }),
    rung("Trophy Room — The Hall", 500, { bear_pelt: 2 }),
    rung("Trophy Room — Hall of Heads", 1600, { bear_pelt: 4 }),
    rung("Trophy Room — Hall of Banners", 3700, { bear_pelt: 6, iron_fitting: 12, war_crown: 1 }, 3),
    rung("Trophy Room — The Long Gallery", 37000, { hasks_coin: 5, runewood_plank: 30, war_crown: 1, warrant_seal: 10 }, 4),
  ]),
  cellar: roomLadder('cellar', [
    rung("Cellar — Root Cellar", 90, { normal_log: 60 }),
    rung("Cellar — Stone Cellar", 300, { oak_log: 60 }),
    rung("Cellar — The Vault", 900, { willow_log: 50 }),
    rung("Cellar — The Cask Room", 4800, { field_ration: 20, goldenroot_roast: 6, timber_beam: 12 }, 3),
    rung("Cellar — The Deep Cellar", 38000, { barrow_nail: 20, moonbloom_elixir: 4, runewood_plank: 30 }, 5),
  ]),
  workshop: roomLadder('workshop', [
    rung("Workshop — Work Bench", 5600, { iron_fitting: 5, oak_plank: 200, timber_beam: 10 }),
    rung("Workshop — Joiner's Bench", 8200, { timber_beam: 12, willow_plank: 100 }),
    rung("Workshop — The Sawpit", 12000, { iron_fitting: 10, timber_beam: 20, willow_plank: 200 }),
    rung("Workshop — The Lathe", 17000, { iron_fitting: 25, maple_plank: 100, silk_thread: 30 }, 3),
    rung("Workshop — The Master's Shop", 56000, { duskwood_plank: 25, rune_bar: 6, timber_beam: 30 }, 4),
  ]),
  shrine: roomLadder('shrine', [
    rung("Shrine — Wayside Shrine", 56, { bones: 40 }),
    rung("Shrine — Stone Altar", 220, { big_bones: 25 }),
    rung("Shrine — The Chapel", 810, { big_bones: 40 }),
    rung("Shrine — The Reliquary", 3400, { big_bones: 60, iron_fitting: 10, magic_essence: 30 }, 4),
    rung("Shrine — The Ossuary", 37000, { big_bones: 100, grave_dust: 100, shroud_pin: 20 }, 4),
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
  cost: Object.freeze({ gold: wagePrice(hoursPm, PROPERTY_TIERS[tier].step), ...items }) });

export const STORAGE_CHESTS = Object.freeze([
  chest("millrace_crate", "Millrace Crate", 20, 0, 120, { normal_log: 40 }),
  chest("thicketwood_chest", "Thicketwood Chest", 30, 1, 460, { copper_bar: 10, oak_plank: 30 }),
  chest("ironbanded_strongbox", "Ironbanded Strongbox", 50, 2, 1900, { iron_bar: 25, iron_fitting: 10 }),
  chest("stonecross_vault", "Stonecross Vault", 100, 3, 6200, { steel_bar: 30, timber_beam: 15 }),
]);
