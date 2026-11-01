// ════════════════════════════════════════════════════════════════════════
// src/data/bench-tax.js — THE WORK BENCH TAX: WHAT THE PUBLIC BENCH TAKES, PER SKILL (data; the source of truth).
//
// Tyler 2026-11-01: "a 'work bench tax' for all the bench skills in the public area ... because you're right, gold starts
// to be meaningless very quick." The game designer rules the numbers (lane/b-bench-prices); change a row here, then
// `node tools/gen-bench-tax.mjs` regenerates the server's copy (hr_bench_tax_rates), and its --check fails a stale one.
//
// THERE IS NO SEPARATE BENCH IN THE HOUSE: a job always runs at the town's stations. A room gives furniture and a bonus
// (src/data/perks.js). So "a bench in your house" means the ACCOUNT owns that skill's room at `rung` or above
// (hr_unlock_levels: the home is the account's); then the job takes no tax.
//
// THE SHAPE, one row per bench skill (ARTISAN_RECIPES' keys; catalogue-coherence fails a missing one):
//   room, rung    the room that takes the tax off, and the rung it takes
//   baseMg        milligold per craft (1000 = 1 gold), whatever the recipe
//   perReqMg      milligold per craft per level the recipe asks for: fee = baseMg + perReqMg x recipe.req
// A fee may be a fraction of a gold: the server carries the remainder on the hero (player_state.bench_tax_carry_mg), so
// nothing is lost, minted or skipped by splitting a run. A row at 0 and 0 charges nothing and the bench says nothing.
//
// PLACEHOLDER (backend-architect 2026-11-01): the designer's numbers replace these. Feeding the Great Hearth (inner_flame)
// is at 0 because it is a public fire and not a bench, unless the designer rules otherwise.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════
export const BENCH_TAX = Object.freeze({
  cooking:      Object.freeze({ room: 'kitchen',  rung: 1, baseMg: 200, perReqMg: 0 }),
  smithing:     Object.freeze({ room: 'forge',    rung: 1, baseMg: 500, perReqMg: 0 }),
  crafting:     Object.freeze({ room: 'workshop', rung: 1, baseMg: 500, perReqMg: 0 }),
  runecrafting: Object.freeze({ room: 'library',  rung: 1, baseMg: 100, perReqMg: 0 }),
  inner_flame:  Object.freeze({ room: 'shrine',   rung: 1, baseMg: 0,   perReqMg: 0 }),
});
