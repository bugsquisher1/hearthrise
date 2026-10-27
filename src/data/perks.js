// ════════════════════════════════════════════════════════════════════════
// src/data/perks.js — WHAT EACH ROOM RUNG DOES (data; the source of truth).
//
// Hand-authored since the old client (src/legacy.js ROOMS, tools/gen-perks.mjs)
// was deleted on 2026-10-17. Change a rung HERE, then regenerate the server's
// copy: `node tools/gen-catalogues.mjs` re-emits hr_room_perks (the table SQL
// reads, e.g. the Cellar's buffDuration in hr_apply and the Garden's farmPlots
// in hr_farm_plot_cap). Both JS runtimes read this file through
// src/core/perks.js; `node tools/gen-catalogues.mjs --check` fails when the
// SQL copy is stale.
//
// ONE PURPOSE PER ROOM (game-designer ruling 2026-10-22, PRIORITY_BOARD
// Decisions). A home never grants XP or a resource advantage (Master Design
// Reference §9); a room is a BENCH that makes one activity faster, or CAPACITY
// bought with gold, or a SHOWCASE:
//   kitchen   cooking speed + burn-proofing      cellar    food/drink last longer
//   forge     smithing speed                     workshop  crafting speed + saves
//   shrine    hearth fuelling speed              library   runecrafting speed (runeSpeed)
//   garden    farm beds for every character (farmPlots, capacity)
//   trophy    trophy wall mounts in the home (trophyMounts, display only)
//
// THE SHAPE
//   ROOM_PERKS[roomId][level - 1]  →  { bonusKey: magnitude, … }
//   A rung's map REPLACES the rung below it (`levels[lv-1]`, never a sum over
//   rungs), so every rung restates every key it keeps.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

export const ROOM_PERKS = Object.freeze({
  cellar: [
    {"buffDuration":0.2},
    {"buffDuration":0.4},
    {"buffDuration":0.6},
    {"buffDuration":0.8},
    {"buffDuration":1},
  ],
  forge: [
    {"smithSpeed":0.02},
    {"smithSpeed":0.04},
    {"smithSpeed":0.06},
    {"smithSpeed":0.08},
    {"smithSpeed":0.1},
  ],
  garden: [
    {"farmPlots":1},
    {"farmPlots":2},
    {"farmPlots":3},
    {"farmPlots":4},
    {"farmPlots":5},
  ],
  kitchen: [
    {"cookSpeed":0.02,"noBurn":0.13},
    {"cookSpeed":0.04,"noBurn":0.19},
    {"cookSpeed":0.06,"noBurn":0.25},
    {"cookSpeed":0.08,"noBurn":0.25},
    {"cookSpeed":0.1,"noBurn":0.25},
  ],
  library: [
    {"runeSpeed":0.02},
    {"runeSpeed":0.04},
    {"runeSpeed":0.06},
    {"runeSpeed":0.08},
    {"runeSpeed":0.1},
  ],
  shrine: [
    {"flameSpeed":0.02},
    {"flameSpeed":0.04},
    {"flameSpeed":0.06},
    {"flameSpeed":0.08},
    {"flameSpeed":0.1},
  ],
  trophy: [
    {"trophyMounts":2},
    {"trophyMounts":3},
    {"trophyMounts":4},
    {"trophyMounts":5},
    {"trophyMounts":6},
  ],
  workshop: [
    {"craftSpeed":0.02,"craftSave":0.01},
    {"craftSpeed":0.04,"craftSave":0.02},
    {"craftSpeed":0.06,"craftSave":0.04},
    {"craftSpeed":0.08,"craftSave":0.06},
    {"craftSpeed":0.1,"craftSave":0.08},
  ],
});

/* Rung payload that is NOT a bonus key: the Library's Rested XP quantum and
   bank size (bonus-rebase.md §5.3 — Rested converted from a percentage to a
   flat quantum). Carried here so nothing has to extract the same table twice
   for the sake of two fields. `null` = that rung pays none. */
export const ROOM_RUNG_EXTRAS = Object.freeze({

});

/* Every bonus key any rung can pay, sorted. Exported so a consumer can assert
   it knows what each one MEANS rather than silently forwarding a new one. */
export const ROOM_PERK_KEYS = Object.freeze(["buffDuration","cookSpeed","craftSave","craftSpeed","farmPlots","noBurn","flameSpeed","runeSpeed","smithSpeed","trophyMounts"]);
