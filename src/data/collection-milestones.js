// ════════════════════════════════════════════════════════════════════════
// src/data/collection-milestones.js — THE SERVER-OWNED COLLECTION-LOG CATALOGUE.
//
// The GOAL (a distinct-count threshold) and the GOLD/GEM REWARD for every
// Collection-Log MILESTONE the server credits under `hr_claim_milestone`
// (the chain-end restatement of hr_claim_milestone__ungated — today
// supabase/migrations/2026-09-27-ledger-of-firsts.sql). This is the SINGLE
// SOURCE for those numbers; the SQL RPC embeds a copy and
// tests/collection-renown-claim-drift.mjs binds THREE sides so none can drift
// in silence:
//   (1) this module,
//   (2) the authored client rows in src/features/collection-log.js (MILESTONES),
//   (3) the server catalogue inside the migration SQL.
//
// ── WHAT THE SERVER VERIFIES ────────────────────────────────────────────────
// A milestone is EARNED when the character's DISTINCT count in `domain` is
// >= `threshold`, read from the server's own per-entry projection:
//   · domain 'monsters' → count of hr_bestiary_of  rows (distinct ev:kill_monster:%)
//   · domain 'items'    → count of hr_collection_of rows (distinct ev:loot:%)
// The client `earned` flag is NEVER trusted; the count is re-derived server-side.
//
// ── THE ONE DYNAMIC THRESHOLD ───────────────────────────────────────────────
// `hunterAll` ("Bestiary Master") is "have you slain EVERY monster", so its
// threshold is the SIZE of the monster catalogue, not a hand-picked number.
// MONSTER_TOTAL below is that size, PINNED as a server-owned constant and
// drift-guarded against src/data/monsters.js (the count moves → the guard fails
// the build → this constant + the SQL CASE are updated in lockstep). This is the
// same "scheduled debt, not discovered debt" posture the renown weight-copy uses.
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

/* The monster catalogue size — the `hunterAll` threshold. Kept in lockstep with
   src/data/monsters.js Object.keys(MONSTERS).length by the drift guard. */
export const MONSTER_TOTAL = 108;

/* LEDGER OF FIRSTS (2026-09-27, pack 3): 4 rungs → 11. Every rung added by
   that pack is GOLD-ONLY (no new premium faucet; the drift guard pins gems 0
   on every id outside the original four). Within each domain thresholds and
   gold strictly increase, and every threshold is reachable: monsters ≤
   MONSTER_TOTAL, items ≤ the distinct drop ids across MONSTERS[*].drops. */
export const COLLECTION_MILESTONES = Object.freeze({
  hunter10:   Object.freeze({ domain: 'monsters', threshold: 10,            gold: 2000 }),
  hunter25:   Object.freeze({ domain: 'monsters', threshold: 25,            gold: 4000 }),
  hunter40:   Object.freeze({ domain: 'monsters', threshold: 40,            gold: 8000 }),
  hunter60:   Object.freeze({ domain: 'monsters', threshold: 60,            gold: 15000 }),
  hunter85:   Object.freeze({ domain: 'monsters', threshold: 85,            gold: 25000 }),
  hunterAll:  Object.freeze({ domain: 'monsters', threshold: MONSTER_TOTAL, gold: 50000, gems: 25 }),
  collect25:  Object.freeze({ domain: 'items',    threshold: 25,            gold: 1000 }),
  collect50:  Object.freeze({ domain: 'items',    threshold: 50,            gold: 5000 }),
  collect75:  Object.freeze({ domain: 'items',    threshold: 75,            gold: 10000 }),
  collect100: Object.freeze({ domain: 'items',    threshold: 100,           gold: 15000, gems: 15 }),
  collect125: Object.freeze({ domain: 'items',    threshold: 125,           gold: 30000 }),
});
