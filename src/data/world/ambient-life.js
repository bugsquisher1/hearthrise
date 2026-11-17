// ════════════════════════════════════════════════════════════════════════
// src/data/world/ambient-life.js — WHAT MOVES IN THE AIR AND ON THE WATER, AS DATA (display only).
//
// Tyler 2026-11-16: "All of the map could use some work, it doesn't feel 'alive' what so ever."
// ART_DIRECTION §3: in town "something always moves". This is the cheapest of it: smoke from every lit
// chimney, the Great Hearth's sparks and its flue, daylight on the water. src/world/core/ambient.js lays
// it on a compiled map (map.life) and compose.js draws it. Nothing here is read by the server, spends,
// gates or blocks a step: it is a picture, the same picture on every client.
//
//   LIFE_BEAT_FPS  every life clip turns on this beat (its fps divides it), the Great Hearth fire's own
//                  rate: frames that turn together are one paint (tests/perf-budget.mjs town paints)
//   EMITTERS       sprite id -> the loops it gives off, at a point in the SPRITE'S OWN PIXELS (`at`: x, y in its
//                  frame), so a home's smoke rises from its chimney wherever and on whatever map it stands.
//                  A chimney's point is its mouth's middle, two rows into the stack (the first puff covers the cap).
//                  A cold chimney (a storehouse, the bank, a ruin) simply has no row.
//   SURFACES       material -> the light it catches: `clips` (one picked per glint), about one open cell in
//                  `every`, `seed` the hash's. A map opts in by naming the material in its row's `life`.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const LIFE_BEAT_FPS = 8;

const chimney = (x, y) => Object.freeze({ clip: 'chimney_smoke', at: Object.freeze([x, y]) });

export const EMITTERS = Object.freeze({
  /* the Great Hearth: its flue's smoke, and sparks lifting out of the fire's mouth (the fire's anchor is hearth px 176, 262) */
  great_hearth: Object.freeze([Object.freeze({ clip: 'hearth_smoke', at: Object.freeze([176, 3]) }), Object.freeze({ clip: 'hearth_embers', at: Object.freeze([176, 250]) })]),
  /* the shacks' stovepipes (P01, P02) and the homes' stacks */
  havora_home_p01: Object.freeze([chimney(217, 2)]),
  havora_home_p02: Object.freeze([chimney(245, 2)]),
  havora_home_p06: Object.freeze([chimney(256, 2)]),
  havora_home_p09: Object.freeze([chimney(291, 3)]),
  havora_home_p10: Object.freeze([chimney(40, 2)]),
  havora_home_p11: Object.freeze([chimney(338, 3)]),
  havora_home_p12: Object.freeze([chimney(405, 3)]),
  havora_home_p13: Object.freeze([chimney(318, 3)]),
  havora_home_p14: Object.freeze([chimney(263, 17)]),
  havora_home_p15: Object.freeze([chimney(272, 3), chimney(367, 3)]),
  /* the tavern's kitchen, the guilds by the water, the mill's and the smithy's stacks, the general store */
  havora_tavern: Object.freeze([chimney(301, 3)]),
  havora_fisher_guild: Object.freeze([chimney(309, 3)]),
  havora_harbor_office: Object.freeze([chimney(321, 55)]),
  mill: Object.freeze([chimney(111, 34)]),
  smithy: Object.freeze([chimney(136, 32)]),
  square_general_store: Object.freeze([chimney(301, 21)]),
});

export const SURFACES = Object.freeze({
  water: Object.freeze({ clips: Object.freeze(['water_glint_a', 'water_glint_b']), every: 2, seed: 0x61f7 }),
});
