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
// MONSTER_TOTAL below is that size (less the monsters only a STAGED ground holds),
// DERIVED from the data and drift-guarded against the SQL CASE (the count moves →
// the guard fails the build → the SQL CASE is restated in lockstep). This is the
// same "scheduled debt, not discovered debt" posture the renown weight-copy uses.
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from './monsters.js?v=0.2.28';
import { STAGED_ONLY_MONSTERS } from './hunt-grounds.js?v=0.2.28';

/* The monster catalogue size — the `hunterAll` threshold. Kept in lockstep with
   the SQL CASE by tests/collection-renown-claim-drift.mjs. */
/* W0 (2026-10-10): 108 -> 113 — the five field champions are monsters, and
   "Bestiary Master" means every one. Raised in lockstep with the hunterAll arm
   restated in supabase/migrations/2026-10-16-w0f-fun-content.sql §3. */
/* 2026-10-18: 113 -> 119 — the Millrace Sewer's six formation rows (monsters.js).
   The SQL hunterAll arm is restated by the S1 catalogue regen (lane C). */
/* 2026-10-18: 119 -> 129 — the Meadowbrook Thicket's five wolves and the Coppercap Warrens' five goblins.
   The SQL hunterAll arm is restated by the integrator's catalogue regen (gen-catalogues). */
/* 2026-10-22 (lane c-collection-staged): DERIVED, not typed. The roster less the monsters that stand only on a
   STAGED ground (hunts.js `staged`: hidden and refused, so nobody can slay them): Mosslight Glade's five leave it
   at 129. A monster a player can meet moves it, and the drift guard then fails until the SQL CASE follows. */
export const MONSTER_TOTAL = Object.keys(MONSTERS).length - STAGED_ONLY_MONSTERS.length;

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
