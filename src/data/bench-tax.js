// ════════════════════════════════════════════════════════════════════════
// src/data/bench-tax.js — THE WORK BENCH TAX: WHAT THE PUBLIC BENCH TAKES, PER SKILL (data; the source of truth).
//
// Tyler 2026-11-01: "a 'work bench tax' for all the bench skills in the public area ... because you're right, gold starts
// to be meaningless very quick." The game designer rules the numbers (priority board, "The bench tax and what a house bench
// costs"): a job's fee is a share of what its output sells for at the shop. Change a row here, then
// `node tools/gen-bench-tax.mjs` regenerates the server's copy (hr_bench_tax_rates); its --check fails a stale one.
//
// THE FEE, in milligold (1000 = 1 gold): permille x the shop's bid for the output x how many one job makes. Permille x gold IS
// milligold, so the fee is exact and nothing is rounded: the hero carries the part under a gold (player_state.bench_tax_carry_mg)
// and pays each whole gold on the craft that reaches it. A run costs the same however it is cut. A good with no shop bid, and a
// job with no output (the Great Hearth's fuel), has no fee.
//
// THERE IS NO SEPARATE BENCH IN THE HOUSE: a job always runs at the town's stations. A room gives furniture and a bonus
// (src/data/perks.js). So "a bench in your house" means the ACCOUNT owns that skill's room at BENCH_TAX_ROOMS' rung or above
// (hr_unlock_levels: the home is the account's); then the job takes no tax.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/** Per bench skill, the share of the output's shop bid a public bench takes, in permille (150 = 15%). */
export const BENCH_TAX = Object.freeze({ smithing: 150, crafting: 150, cooking: 150, runecrafting: 150 });

/** The room that takes each skill's tax off, and the rung it takes. */
export const BENCH_TAX_ROOMS = Object.freeze({
  smithing:     Object.freeze({ room: 'forge', rung: 1 }),
  crafting:     Object.freeze({ room: 'workshop', rung: 1 }),
  cooking:      Object.freeze({ room: 'kitchen', rung: 1 }),
  runecrafting: Object.freeze({ room: 'library', rung: 1 }),
});

/** Does a public bench charge this job? Every job with an output, except a ROLLED one (src/data/jewelry.js; Tyler 2026-11-05, call 5:
    no gold moves on a roll). tools/gen-bench-tax.mjs writes rows only for these, and no row is no fee. */
export const benchTaxed = (recipe) => !!(recipe && recipe.output && !recipe.roll);

/** Bench skills the public bench never charges, each with why. Every bench skill is here or in BENCH_TAX. */
export const BENCH_TAX_UNTAXED = Object.freeze({ inner_flame: 'the Great Hearth is a public fire, not a bench (designer 2026-11-01)' });

/**
 * THE CHEAP GOODS LINE: a job whose fee is under this many milligold pays nothing, on purpose, as a row and not an accident
 * of rounding. The designer's "cheap goods round to nothing, so a fresh hero pays nothing": 500 is exactly the jobs a
 * nearest-gold round takes to 0 (Copper Bar, Normal Plank and Cooked Shrimp at 3 g, 450 mg). tests/craft-wages.mjs W-TAX holds
 * it honest: a free row never out-earns the taxed rows it stands beside. 0 here taxes every priced good to the milligold.
 */
export const BENCH_TAX_FREE_UNDER_MG = 500;
