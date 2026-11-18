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
//   SWAYS          sprite id -> its twin with the cloth on the breeze (banners, awnings), drawn in its place on the half beat;
//                  each placed one starts at its own frame
//   GLANCES        a standing keeper's look about: sprite id -> { faces (cardinals its idle clip has), holdMs (a whole
//                  number of beats, so a turn is a frame the beat already paints) }; each placed one starts at its own face
//   SURFACES       material -> how it moves and the light it catches: `flows` ([id, cells square], biggest first: ripples laid
//                  on every open cell in step, so the surface slides east on the town's one breeze, as the smoke leans), `clips` (one picked per glint),
//                  about one open cell in `every`, `seed` the hash's. A map opts in by naming the material in its row's `life`.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const LIFE_BEAT_FPS = 8;

const piece = (clip, x, y) => Object.freeze({ clip, at: Object.freeze([x, y]) });
const chimney = (x, y) => Object.freeze({ clip: 'chimney_smoke', at: Object.freeze([x, y]) });

export const EMITTERS = Object.freeze({
  /* the Great Hearth: its flue's smoke out of the slate cupola's openings, and sparks lifting out of the fire's mouth (the fire's anchor is
     hearth px 178, 313: the Hearth redrawn 2026-11-17) */
  great_hearth: Object.freeze([Object.freeze({ clip: 'hearth_smoke', at: Object.freeze([176, 66]) }), Object.freeze({ clip: 'hearth_embers', at: Object.freeze([178, 298]) })]),
  /* the shacks' stovepipes (P01, P02) and the homes' stacks */
  havora_home_p01: Object.freeze([chimney(217, 2)]),
  /* P02's yard: its two hens peck and its goat nods (town-life.mjs stir: cut from its still twin, SWAYS) */
  havora_home_p02: Object.freeze([chimney(245, 2), piece('p02_hen_brown', 143, 212), piece('p02_hen_white', 225, 219), piece('p02_goat', 64, 190)]),
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
  /* the mill's smoke, and its waterwheel turning: the wheel's paddle face, mill px 139-151 x 76-117 (the rim and its spoke slot stay) */
  mill: Object.freeze([chimney(111, 34), Object.freeze({ clip: 'mill_wheel', at: Object.freeze([139, 76]) })]),
  smithy: Object.freeze([chimney(136, 32)]),
  square_general_store: Object.freeze([chimney(301, 21)]),
});

/* Tamsin (the crier stands in for her) looks to her board, west of her, and back to the square; the smith to his forge, north */
export const GLANCES = Object.freeze({
  npc_crier: Object.freeze({ faces: Object.freeze(['s', 'w', 's', 'e', 'w']), holdMs: 3500 }),
  npc_smith: Object.freeze({ faces: Object.freeze(['s', 'n', 's', 'w']), holdMs: 4500 }),
});

/* cloth on the breeze: a placed sprite drawn as its TWIN (the same frame, anchor and footprint, its cloth moving: town-life.mjs sway) */
export const SWAYS = Object.freeze({ ty_banner: 'ty_banner_sway', square_market_stall: 'square_market_stall_sway',
  /* ...and a building whose animals stir is drawn with them cut out (its still twin), the pieces over it */
  havora_home_p02: 'havora_home_p02_still' });

/* A BUMP (Tyler 2026-11-17, the Hearth Chest: "periodically the chest should 'bump' slightly open like something is trying to get out"): a
   map's ambient loop whose sprite has a `bump` clip draws it in place of its idle frames now and then, at the start of one idle loop in each
   block of `block` loops, which one of the first `slots` hashed from the block and the page's own seed (src/world/core/ambient.js bumpAt).
   The Hearth Chest's loop is 3 s, so its bumps fall 3 to 7 loops apart (9 to 21 s), never in step on two screens, and never while the
   player's Idle animations are off */
export const BUMP = Object.freeze({ block: 5, slots: 3 });

export const SURFACES = Object.freeze({
  water: Object.freeze({ flows: Object.freeze([Object.freeze(['water_flow_2', 2]), Object.freeze(['water_flow', 1])]), clips: Object.freeze(['water_glint_a', 'water_glint_b']), every: 2, seed: 0x61f7 }),
});
