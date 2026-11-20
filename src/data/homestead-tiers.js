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
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

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
    `trophies: null`). No rung of one sells (unlock-catalogue.js, home-sections.js); rungs bought stay, shown (hr_home_view). */
export const HELD_HOME_ROOMS = Object.freeze(['trophy']);

/** PROPERTY_TIERS[i] is property tier i. `rooms` are the rooms tier i first opens. */
export const PROPERTY_TIERS = Object.freeze([
  {
    "id": "camp",
    "name": "Wanderer's Camp",
    "plots": 2,
    "rooms": []
  },
  {
    "id": "homestead",
    "name": "Hearthside Homestead",
    "plots": 4,
    "rooms": [
      "kitchen",
      "garden"
    ]
  },
  {
    "id": "farmstead",
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
    "name": "Stonecross Manor",
    "plots": 8,
    "rooms": [
      "library"
    ]
  },
  {
    "id": "keep",
    "name": "Ironvale Keep",
    "plots": 10,
    "rooms": [
      "shrine",
      "trophy"
    ]
  },
  {
    "id": "castle",
    "name": "Hearthrise Castle",
    "plots": 12,
    "rooms": []
  }
]);

/** ROOM_RUNGS[roomId][level - 1] = { tier?, cost }. A rung's `tier` is its own gate above the room's. */
export const ROOM_RUNGS = Object.freeze({
  "kitchen": [
    {
      "cost": {
        "gold": 40000,
        "oak_plank": 60,
        "iron_bar": 60,
        "cooked_trout": 50
      }
    },
    {
      "cost": {
        "gold": 70000,
        "willow_plank": 60,
        "iron_bar": 100,
        "cooked_lobster": 50
      }
    },
    {
      "cost": {
        "gold": 110000,
        "willow_plank": 100,
        "steel_bar": 30,
        "wheat_bread": 40
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 180000,
        "field_ration": 25,
        "timber_beam": 20,
        "willow_plank": 100
      }
    },
    {
      "tier": 5,
      "cost": {
        "gold": 800000,
        "cooked_shark": 100,
        "ember_bar": 8,
        "runewood_plank": 40
      }
    }
  ],
  "forge": [
    {
      "cost": {
        "gold": 75000,
        "iron_bar": 200,
        "oak_plank": 60,
        "iron_fitting": 10
      }
    },
    {
      "cost": {
        "gold": 110000,
        "iron_bar": 300,
        "steel_bar": 40,
        "iron_fitting": 12
      }
    },
    {
      "cost": {
        "gold": 160000,
        "steel_bar": 100,
        "iron_fitting": 15,
        "timber_beam": 10
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 240000,
        "coal": 200,
        "iron_fitting": 25,
        "steel_bar": 150
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 900000,
        "ember_bar": 30,
        "iron_fitting": 40,
        "rake_tine": 20
      }
    }
  ],
  "library": [
    {
      "cost": {
        "gold": 60000,
        "oak_plank": 80,
        "silk_thread": 15,
        "timber_beam": 8
      }
    },
    {
      "cost": {
        "gold": 90000,
        "silk_thread": 25,
        "timber_beam": 12,
        "willow_plank": 60
      }
    },
    {
      "cost": {
        "gold": 130000,
        "maple_plank": 60,
        "silk_thread": 30,
        "timber_beam": 15
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 200000,
        "magic_essence": 10,
        "silk_thread": 40,
        "timber_beam": 20
      }
    },
    {
      "tier": 5,
      "cost": {
        "gold": 850000,
        "magic_essence": 60,
        "priests_cord": 20,
        "runewood_plank": 40
      }
    }
  ],
  "garden": [
    {
      "cost": {
        "gold": 600,
        "wheat": 20
      }
    },
    {
      "cost": {
        "gold": 2500,
        "wheat": 60
      }
    },
    {
      "cost": {
        "gold": 9000,
        "pumpkin": 5
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 60000,
        "timber_beam": 10,
        "silk_thread": 20,
        "goldenroot": 15
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 600000,
        "ford_weed": 30,
        "moonbloom": 12,
        "runewood_plank": 40
      }
    }
  ],
  "trophy": [
    {
      "cost": {
        "gold": 2000,
        "wolf_pelt": 5
      }
    },
    {
      "cost": {
        "gold": 8000,
        "bear_pelt": 2
      }
    },
    {
      "cost": {
        "gold": 25000,
        "bear_pelt": 4
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 60000,
        "iron_fitting": 12,
        "bear_pelt": 6,
        "war_crown": 1
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 600000,
        "hasks_coin": 5,
        "runewood_plank": 30,
        "war_crown": 1,
        "warrant_seal": 10
      }
    }
  ],
  "cellar": [
    {
      "cost": {
        "gold": 1200,
        "normal_log": 60
      }
    },
    {
      "cost": {
        "gold": 4000,
        "oak_log": 60
      }
    },
    {
      "cost": {
        "gold": 12000,
        "willow_log": 50
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 70000,
        "timber_beam": 12,
        "field_ration": 20,
        "goldenroot_roast": 6
      }
    },
    {
      "tier": 5,
      "cost": {
        "gold": 700000,
        "barrow_nail": 20,
        "moonbloom_elixir": 4,
        "runewood_plank": 30
      }
    }
  ],
  "workshop": [
    {
      "cost": {
        "gold": 75000,
        "oak_plank": 200,
        "timber_beam": 10,
        "iron_fitting": 5
      }
    },
    {
      "cost": {
        "gold": 110000,
        "willow_plank": 100,
        "timber_beam": 12
      }
    },
    {
      "cost": {
        "gold": 160000,
        "willow_plank": 200,
        "timber_beam": 20,
        "iron_fitting": 10
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 240000,
        "iron_fitting": 25,
        "maple_plank": 100,
        "silk_thread": 30
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 900000,
        "duskwood_plank": 25,
        "rune_bar": 6,
        "timber_beam": 30
      }
    }
  ],
  "shrine": [
    {
      "cost": {
        "gold": 900,
        "bones": 40
      }
    },
    {
      "cost": {
        "gold": 3500,
        "big_bones": 25
      }
    },
    {
      "cost": {
        "gold": 13000,
        "big_bones": 40
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 55000,
        "iron_fitting": 10,
        "big_bones": 60,
        "magic_essence": 30
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 600000,
        "big_bones": 100,
        "grave_dust": 100,
        "shroud_pin": 20
      }
    }
  ]
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

export const STORAGE_CHESTS = Object.freeze([
  {
    "id": "millrace_crate",
    "name": "Millrace Crate",
    "stacks": 20,
    "tier": 0,
    "cost": {
      "gold": 1500,
      "normal_log": 40
    }
  },
  {
    "id": "thicketwood_chest",
    "name": "Thicketwood Chest",
    "stacks": 30,
    "tier": 1,
    "cost": {
      "gold": 6000,
      "oak_plank": 30,
      "copper_bar": 10
    }
  },
  {
    "id": "ironbanded_strongbox",
    "name": "Ironbanded Strongbox",
    "stacks": 50,
    "tier": 2,
    "cost": {
      "gold": 25000,
      "iron_bar": 25,
      "iron_fitting": 10
    }
  },
  {
    "id": "stonecross_vault",
    "name": "Stonecross Vault",
    "stacks": 100,
    "tier": 3,
    "cost": {
      "gold": 90000,
      "steel_bar": 30,
      "timber_beam": 15
    }
  }
]);
