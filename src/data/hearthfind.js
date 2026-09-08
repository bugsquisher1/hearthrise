// ════════════════════════════════════════════════════════════════════════
// src/data/hearthfind.js — THE HEARTHFIND TABLE (Feature Slate §2).
//
// "Once in a very long while the realm stops what it is doing to look at what
// you found."  DROP_BAND_MAX.rare is 5% and the rarest shipped drop is 0.5%:
// before this file there was no such thing as a rare drop in Hearthrise.
//
// THIS FILE IS DATA, NOT CODE. The roll lives in src/core/hearthfind.js and is
// reached from the ONE engine (src/core/combat-sim.js resolveKill,
// src/core/skill-sim.js resolveGatherTick), so the live tick and hr-accrue's
// replay produce the identical find from the identical seed (AWAY-1). Growing
// the feature is adding a row here — never a branch anywhere else.
//
// ⚠ EVERY ROW IS MIRRORED INTO POSTGRES by tools/gen-hearthfind.mjs. hr_apply
//   re-derives the item, the source and the odds from those catalogue rows and
//   trusts NOTHING the engine proposed except the pair (source_kind, source_id)
//   and the item id, both of which it looks up. A hand-typed SQL copy of this
//   table is the data double-copy this repo has been burned by
//   (src/main.js unifyObject header) — and here the copy would be the CLAMP.
//
// ── WHY THE ITEMS ARE bop AND v:0 ───────────────────────────────────────────
// A hearthfind is a MOMENT, not an economy input. bop:true keeps it off the
// player market (so it can never become a second gold bridge, the muster_seal
// rule), and v:0 keeps it out of the vendor, so the rarest event in the game
// mints exactly zero gold. That is also what makes the mint-leak guard
// (tests/hearthfind-mint-guard.mjs) provable rather than aspirational: a
// hearthfind row cannot pay hearth_token, muster_seal, gems or gold, because it
// pays ONE untradeable trophy and nothing else.
//
// ── THE BAND ────────────────────────────────────────────────────────────────
// `oneIn` is bounded to [5,000 , 50,000] by ONE_IN_MIN/ONE_IN_MAX below, by the
// generator (which fails the build), and by the migration's §4 self-check
// (executed SQL against the catalogue rows, not a marker). Three independent
// readers of one constant, because this is the number that decides whether the
// feature is a landmark or a nuisance.
//
// ⚠ PROVISIONAL SELECTION. Which sources carry a find and which trophy each
//   one pays is the GAME DESIGNER'S call; the ten rows below are a shaped
//   starting set (one landmark per gathering skill, one per combat band) so the
//   server half can be built, tested and reviewed. Changing them is editing
//   this array and re-running the generator — no SQL, no engine change.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ════════════════════════════════════════════════════════════════════════

/* The band, as data. Read by src/core/hearthfind.js, tools/gen-hearthfind.mjs
   and (mirrored into a catalogue column) the migration's self-check. */
export const HEARTHFIND_ONE_IN_MIN = 5000;
export const HEARTHFIND_ONE_IN_MAX = 50000;

/* The source kinds THE ENGINE ACTUALLY ROLLS.
   ⚠ 'crop' IS DELIBERATELY ABSENT. The farm harvest is settled by a Postgres
     RPC, not by src/core, so a crop row would have no roll site — it would be
     data the catalogue advertises and the game can never produce, which is the
     b341 "UI says one thing, engine does another" class. The generator FAILS on
     a row whose kind is not in this list, so a crop row cannot be added until a
     crop roll site exists. See the open question in the change contract. */
export const HEARTHFIND_SOURCE_KINDS = Object.freeze(['monster', 'node']);

/* The trophies. Ids only — the item RECORDS live in src/data/items.js beside
   every other item, marked `hearthfind:true`, because ITEMS is the single
   source of truth for what an item IS and this file is the single source of
   truth for what DROPS one. */
export const HEARTHFIND_ITEMS = Object.freeze([
  'emberheart_core',
  'worldroot_seed',
  'deepvein_geode',
  'tidecallers_pearl',
]);

/**
 * ONE ROW PER SOURCE.
 *   kind   'monster' | 'node'   — which engine step rolls it
 *   id     the monster id (src/data/monsters.js) or gather node id
 *          (TREES / ROCKS / FISH_SPOTS in src/data/gathering.js)
 *   item   the trophy that source pays; must be in HEARTHFIND_ITEMS
 *   oneIn  the odds, as a denominator: the roll is `rng.chance(1 / oneIn)`
 *
 * A source with no row here rolls NOTHING and draws NO random number — which is
 * what keeps every existing seeded replay byte-identical to its pre-Hearthfind
 * self (tests/accrual-engine.mjs).
 */
export const HEARTHFIND_TABLE = Object.freeze([
  // ── Combat. The band widens as the foe does: the capstone wyrm is the
  //    shortest odds in the game and the goblin is the longest, so a find is
  //    reachable from the level-5 loop a new player actually lives in.
  Object.freeze({ kind: 'monster', id: 'goblin',      item: 'emberheart_core', oneIn: 40000 }),
  Object.freeze({ kind: 'monster', id: 'elk_king',    item: 'emberheart_core', oneIn: 20000 }),
  Object.freeze({ kind: 'monster', id: 'grim_reaper', item: 'emberheart_core', oneIn: 10000 }),
  Object.freeze({ kind: 'monster', id: 'dragon',      item: 'emberheart_core', oneIn:  6000 }),

  // ── Woodcutting.
  Object.freeze({ kind: 'node', id: 'yew_tree',      item: 'worldroot_seed', oneIn: 30000 }),
  Object.freeze({ kind: 'node', id: 'runewood_tree', item: 'worldroot_seed', oneIn: 15000 }),

  // ── Mining.
  Object.freeze({ kind: 'node', id: 'mithril_rock',  item: 'deepvein_geode', oneIn: 30000 }),
  Object.freeze({ kind: 'node', id: 'dawnstone_rock', item: 'deepvein_geode', oneIn: 15000 }),

  // ── Fishing.
  Object.freeze({ kind: 'node', id: 'shark_s',   item: 'tidecallers_pearl', oneIn: 30000 }),
  Object.freeze({ kind: 'node', id: 'moonfish_s', item: 'tidecallers_pearl', oneIn: 15000 }),
]);
