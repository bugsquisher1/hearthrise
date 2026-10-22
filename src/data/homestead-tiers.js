// ════════════════════════════════════════════════════════════════════════
// src/data/homestead-tiers.js — THE PROPERTY LADDER AND THE ROOM RUNGS (data).
//
// The property tiers (what each one opens: plots, workers, rooms) and each
// room's rungs (the property tier a rung asks for, and its cost). These rows
// lived in the old client (src/features/homestead.js TIERS and src/legacy.js
// ROOMS) until the client reset on 2026-10-17 and were moved here VERBATIM, so
// the server catalogue generators read them from data:
//   tools/gen-unlock-offers.mjs   room/property prerequisites + the room price cross-check
//   tools/gen-gold-ladders.mjs    the worker and farm-land caps and tier gates
// This file is the source; change a rung here and regenerate.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/** PROPERTY_TIERS[i] is property tier i. `rooms` are the rooms tier i first opens. */
export const PROPERTY_TIERS = Object.freeze([
  {
    "id": "camp",
    "name": "Wanderer's Camp",
    "plots": 2,
    "workers": 0,
    "cost": null,
    "rooms": []
  },
  {
    "id": "homestead",
    "name": "Hearthside Homestead",
    "plots": 4,
    "workers": 1,
    "cost": {
      "gold": 400,
      "normal_log": 30,
      "copper_ore": 20
    },
    "rooms": [
      "kitchen",
      "garden"
    ]
  },
  {
    "id": "farmstead",
    "name": "Fieldworth Farmstead",
    "plots": 6,
    "workers": 2,
    "cost": {
      "gold": 2500,
      "oak_log": 40,
      "copper_ore": 25,
      "wolf_pelt": 4,
      "cooked_shrimp": 10
    },
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
    "workers": 3,
    "cost": {
      "gold": 10000,
      "willow_plank": 35,
      "iron_ore": 40,
      "silk_thread": 8,
      "ashlar": 6
    },
    "rooms": [
      "library"
    ]
  },
  {
    "id": "keep",
    "name": "Ironvale Keep",
    "plots": 10,
    "workers": 4,
    "cost": {
      "gold": 40000,
      "maple_plank": 50,
      "steel_bar": 35,
      "big_bones": 20,
      "bear_pelt": 5,
      "ashlar": 12
    },
    "rooms": [
      "shrine",
      "trophy"
    ]
  },
  {
    "id": "castle",
    "name": "Hearthrise Castle",
    "plots": 12,
    "workers": 6,
    "cost": {
      "gold": 150000,
      "yew_plank": 70,
      "mithril_bar": 40,
      "rune_bar": 8,
      "dragon_scale": 4,
      "ashlar": 25
    },
    "rooms": []
  }
]);

/** ROOM_RUNGS[roomId][level - 1] = { tier?, cost }. A rung's `tier` is its own gate above the room's. */
export const ROOM_RUNGS = Object.freeze({
  "kitchen": [
    {
      "cost": {
        "gold": 500,
        "normal_log": 20
      }
    },
    {
      "cost": {
        "gold": 2000,
        "normal_log": 50
      }
    },
    {
      "cost": {
        "gold": 8000,
        "oak_log": 30
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 45000,
        "timber_beam": 12,
        "willow_log": 40,
        "field_ration": 25
      }
    },
    {
      "tier": 5,
      "cost": {
        "gold": 250000,
        "keystone": 2,
        "duskwood_plank": 30,
        "dragon_scale": 8
      }
    }
  ],
  "forge": [
    {
      "cost": {
        "gold": 800,
        "copper_ore": 30
      }
    },
    {
      "cost": {
        "gold": 3000,
        "iron_ore": 50
      }
    },
    {
      "cost": {
        "gold": 12000,
        "iron_ore": 100
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 55000,
        "iron_fitting": 15,
        "steel_bar": 60,
        "coal": 20
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 280000,
        "keystone": 2,
        "mithril_bar": 20,
        "dragon_scale": 6
      }
    }
  ],
  "library": [
    {
      "cost": {
        "gold": 1000,
        "normal_log": 50
      }
    },
    {
      "cost": {
        "gold": 4000,
        "oak_log": 50
      }
    },
    {
      "cost": {
        "gold": 15000,
        "maple_log": 30
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 65000,
        "timber_beam": 12,
        "silk_thread": 25,
        "magic_essence": 10
      }
    },
    {
      "tier": 5,
      "cost": {
        "gold": 300000,
        "keystone": 2,
        "duskwood_plank": 30,
        "ancient_rune": 12
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
        "gold": 300000,
        "keystone": 2,
        "duskwood_plank": 40,
        "moonbloom": 12
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
        "troll_hide": 3
      }
    },
    {
      "cost": {
        "gold": 25000,
        "dragon_scale": 2
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 60000,
        "iron_fitting": 12,
        "bear_pelt": 6,
        "ancient_claw": 3
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 290000,
        "keystone": 2,
        "dragon_scale": 6,
        "dragon_gem": 1
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
        "gold": 320000,
        "keystone": 2,
        "moonbloom_elixir": 4,
        "duskwood_plank": 20
      }
    }
  ],
  "workshop": [
    {
      "cost": {
        "gold": 700,
        "normal_log": 40
      }
    },
    {
      "cost": {
        "gold": 2800,
        "oak_plank": 25
      }
    },
    {
      "cost": {
        "gold": 11000,
        "willow_plank": 30
      }
    },
    {
      "tier": 3,
      "cost": {
        "gold": 50000,
        "iron_fitting": 12,
        "maple_plank": 30,
        "silk_thread": 10
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 260000,
        "keystone": 2,
        "duskwood_plank": 25,
        "rune_bar": 6
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
        "dragon_bones": 8
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 55000,
        "iron_fitting": 10,
        "big_bones": 60,
        "grave_dust": 20
      }
    },
    {
      "tier": 4,
      "cost": {
        "gold": 270000,
        "keystone": 2,
        "dragon_bones": 30,
        "war_crown": 4
      }
    }
  ]
});

// ── THE DEPOT'S SPACE (Tyler 2026-10-22: "space can be increased by building
// different storage chests for the house, with gold") ─────────────────────────
// The depot is the ACCOUNT's (supabase/migrations/2026-11-10-account-depot.sql),
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
