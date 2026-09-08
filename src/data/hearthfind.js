// ════════════════════════════════════════════════════════════════════════
// src/data/hearthfind.js — THE FOUR HEARTHFINDS (Feature Slate §2).
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
// (tests/hearthfind-mint-guard.mjs) provable rather than aspirational.
//
// ════════════════════════════════════════════════════════════════════════
// ── THE BAND IS HOURS, NOT ODDS (Game Designer ruling, 2026-09-08) ──────────
//
// The first cut of this file authored `oneIn` directly and clamped it to
// [5,000 , 50,000]. That was WRONG, and the ruling says why in one sentence:
// oneIn is PER ROLL, and roll rates across the shipped sources span more than
// twelve times — a Copper Rock is swung 1,200 times an hour, a boss is killed
// fewer than 120 times an hour. A single oneIn band therefore expresses no
// rarity a player can feel: the staged `goblin` row at 1-in-40,000 made the
// STARTER MOB the best hearthfind farm in the game (~1 find per 11 hours for a
// maxed character), while the same number on a Yew Tree is a lifetime.
//
// So the authored number is EXPECTED HOURS AT THE SOURCE, and the odds are
// DERIVED:
//
//     nodes   oneIn = round( (3600000 / node.ms) x hours )
//     bosses  oneIn = round( killsPerHour        x hours )
//
// clamped by HEARTHFIND_HOURS_MIN/MAX = 100…400. Three independent readers of
// one constant — the generator (build failure), src/core/hearthfind.js
// (indexHearthfind throws), and the migration's own §4 self-check, which
// asserts the DERIVED hours of every stored row back into [100,400] by
// executing SQL against `expected_hours`, not by reading a marker.
//
// ⚠ `killsPerHour` IS A MEASUREMENT, NOT AN ASSUMPTION. The ruling's table was
//   drafted against "~144 kills/h at a ~25 s kill+respawn". That is not what
//   the engine does. Measured with the ONE engine — `simulateSpan`, one hour,
//   fixed seed 20260908, a level-90 attack/strength/defence character in the
//   tier-8 loadout (dragonfang_pike + slagheart_platebody + choirbone_gauntlets
//   + wyrmgilt_mantle, swing interval 2,328 ms), fed (auto-eat to full, zero
//   deaths in the hour) — the real rates are:
//
//        elk_king     91 kills/h   (accuracy .95, max hit 59 vs 466 hp)
//        grim_reaper 113 kills/h   (accuracy .95, max hit 60 vs 388 hp)
//        dragon       83 kills/h   (accuracy .95, max hit 59 vs 520 hp)
//
//   pinned and re-measured on every run by tests/hearthfind-boss-rate.mjs, so a
//   combat-balance change that moves the kill rate turns the guard red instead
//   of silently retuning the rarest event in the game.
//
//   THE MEASUREMENT IS DELIBERATELY THE CEILING CHARACTER. A slower or worse-
//   geared player kills less often, so their expected hours are LONGER than the
//   authored number. `hours` is therefore the BEST case anyone can reach, never
//   a promise made to the median player — the safe direction for a landmark.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ════════════════════════════════════════════════════════════════════════

/* The set, as the world names it. Read by the reveal copy, the collection log
   and the `wonderkeeper` title the full set grants. */
export const HEARTHFIND_SET_NAME = 'The Four Hearthfinds';

/* The band, as data — EXPECTED HOURS AT THE SOURCE. Read by
   src/core/hearthfind.js, tools/gen-hearthfind.mjs and (through the derived
   `expected_hours` column) the migration's self-check. */
export const HEARTHFIND_HOURS_MIN = 100;
export const HEARTHFIND_HOURS_MAX = 400;

/* The source kinds THE ENGINE ACTUALLY ROLLS.
   ⚠ 'crop' IS DELIBERATELY ABSENT, and now permanently so (ruling §8: farming
     gets its own once-a-season bloom, rolled inside its own RPC). The farm
     harvest is settled by a Postgres RPC, not by src/core, so a crop row would
     have no roll site — data the catalogue advertises and the game can never
     produce (the b341 class). The generator FAILS on a row whose kind is not in
     this list. */
export const HEARTHFIND_SOURCE_KINDS = Object.freeze(['monster', 'node']);

/* The trophies, and the TITLE each one unlocks.
   Ids only for the item RECORDS — those live in src/data/items.js beside every
   other item, marked `hearthfind:true`, because ITEMS is the single source of
   truth for what an item IS and this file is the single source of truth for
   what DROPS one and what FINDING one is worth.

   ⚠ THE TITLE IS COSMETIC AND SERVER-OWNED. hr_apply writes the unlock row
     (player_cosmetics) under the character lock from ITS OWN catalogue lookup;
     hr_state_of projects it. It is never residue and never a client value.
     A title grants no stat, no rate and no access — ruling §6, "pays a moment
     and nothing else". */
export const HEARTHFIND_TROPHIES = Object.freeze([
  Object.freeze({ item: 'emberheart',        title: 'emberborn',    titleName: 'Emberborn' }),
  Object.freeze({ item: 'worldroot_seed',    title: 'rootwarden',   titleName: 'Rootwarden' }),
  Object.freeze({ item: 'deepvein_lodestar', title: 'deepdelver',   titleName: 'Deepdelver' }),
  Object.freeze({ item: 'tidecallers_pearl', title: 'tidesworn',    titleName: 'Tidesworn' }),
]);

/** The flat id list, kept for the callers that only need the allowlist. */
export const HEARTHFIND_ITEMS = Object.freeze(HEARTHFIND_TROPHIES.map((t) => t.item));

/* THE FULL SET. Ruling §6: "full set → title Wonderkeeper + hearth-flame
   cosmetic". Granted by hr_apply when the character's DISTINCT trophy count
   reaches HEARTHFIND_TROPHIES.length, counted from the append-only ledger under
   the lock — never from a client claim, never from a stored counter that could
   drift. */
export const HEARTHFIND_SET_TITLE = Object.freeze({ code: 'wonderkeeper', name: 'Wonderkeeper' });

/* THE PLINTH. One homestead display flag, granted on a character's FIRST find
   of any trophy. A flag, not a count: it unlocks the display, and what stands
   on it is derived from the trophies the character has. */
export const HEARTHFIND_PLINTH = 'hearth_plinth';

/**
 * ONE ROW PER SOURCE.
 *   kind          'monster' | 'node'   — which engine step rolls it
 *   id            the monster id (src/data/monsters.js) or gather node id
 *                 (TREES / ROCKS / FISH_SPOTS in src/data/gathering.js)
 *   item          the trophy that source pays; must be in HEARTHFIND_ITEMS
 *   hours         THE AUTHORED NUMBER: expected hours at that source, in
 *                 [HEARTHFIND_HOURS_MIN, HEARTHFIND_HOURS_MAX]
 *   killsPerHour  MONSTER ROWS ONLY. The measured kill rate (see the header);
 *                 the generator needs it to turn `hours` into `oneIn`, and
 *                 tests/hearthfind-boss-rate.mjs re-measures it every run.
 *                 A node row derives its rate from the node's own `ms`, so it
 *                 must NOT carry this field.
 *
 * `oneIn` IS NOT AUTHORED HERE and never should be. It is derived by
 * tools/gen-hearthfind.mjs and by src/core/hearthfind.js from exactly these
 * fields, so the number the engine rolls and the number the server clamps
 * against are one expression evaluated twice — not two numbers that can drift.
 *
 * A source with no row here rolls NOTHING and draws NO random number — which is
 * what keeps every existing seeded replay byte-identical to its pre-Hearthfind
 * self (tests/accrual-engine.mjs).
 *
 * THE SHAPE OF THE SET (ruling §3, §4): three rungs per gathering skill — the
 * door (level 1), the mastery gate (60) and the cap (90) — so a first-hour
 * player is genuinely in the draw, and BOSSES ONLY for combat, so no starter
 * mob is ever the best farm in the game.
 */
export const HEARTHFIND_TABLE = Object.freeze([
  // ── Combat: BOSSES ONLY (ruling §2 — the `goblin` row is cut).
  Object.freeze({ kind: 'monster', id: 'elk_king',    item: 'emberheart', hours: 250, killsPerHour: 91 }),
  Object.freeze({ kind: 'monster', id: 'grim_reaper', item: 'emberheart', hours: 220, killsPerHour: 113 }),
  Object.freeze({ kind: 'monster', id: 'dragon',      item: 'emberheart', hours: 180, killsPerHour: 83 }),

  // ── Woodcutting. Door / gate / cap.
  Object.freeze({ kind: 'node', id: 'normal_tree',   item: 'worldroot_seed', hours: 350 }),
  Object.freeze({ kind: 'node', id: 'yew_tree',      item: 'worldroot_seed', hours: 250 }),
  Object.freeze({ kind: 'node', id: 'duskwood_tree', item: 'worldroot_seed', hours: 180 }),

  // ── Mining.
  Object.freeze({ kind: 'node', id: 'copper_rock',    item: 'deepvein_lodestar', hours: 350 }),
  Object.freeze({ kind: 'node', id: 'mithril_rock',   item: 'deepvein_lodestar', hours: 250 }),
  Object.freeze({ kind: 'node', id: 'dawnstone_rock', item: 'deepvein_lodestar', hours: 180 }),

  // ── Fishing.
  Object.freeze({ kind: 'node', id: 'shrimp_s',   item: 'tidecallers_pearl', hours: 350 }),
  Object.freeze({ kind: 'node', id: 'shark_s',    item: 'tidecallers_pearl', hours: 250 }),
  Object.freeze({ kind: 'node', id: 'moonfish_s', item: 'tidecallers_pearl', hours: 180 }),
]);
