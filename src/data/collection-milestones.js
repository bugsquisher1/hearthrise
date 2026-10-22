// ════════════════════════════════════════════════════════════════════════
// src/data/collection-milestones.js — THE SERVER-OWNED COLLECTION-LOG CATALOGUE.
//
// The GOAL and the GOLD REWARD of every Collection-Log MILESTONE the server
// credits under `hr_claim_milestone` (the chain-end restatement of
// hr_claim_milestone__ungated). This is the SINGLE SOURCE; the SQL RPC embeds a
// copy of each arm and tests/collection-renown-claim-drift.mjs binds the two.
//
// ── WHAT THE SERVER VERIFIES ────────────────────────────────────────────────
// A milestone is EARNED when the character's DISTINCT count in `domain`, read
// from the server's own projection and counted only over what a player can
// meet today, reaches the rung's goal:
//   · 'monsters' → hr_bestiary_of rows whose monster is in hr_hunt_roster
//   · 'items'    → hr_collection_of rows whose item is in hr_hunt_loot_roster
// The client `earned` flag is NEVER trusted.
//
// ── THE LADDERS GROW WITH THE WORLD (designer ruling 2026-10-22, lane
// c-monster-ladders) ──────────────────────────────────────────────────────
// A rung is a SHARE of the reachable roster, `part` of `of`, not a fixed
// count: its goal is ceil(reach x part / of), where reach is the number of
// monsters (or loot ids) on the OPEN grounds (hunt-grounds.js reachableOf;
// a staged ground is out). The old fixed goals (10..129 monsters, 25..125
// items) were written against a 129-monster catalogue a player could never
// meet: with 19 monsters and 49 loot ids reachable, every rung past the first
// two could not be earned. Six monster rungs (sixths) and five item rungs
// (fifths) step evenly to "all of them", and a new open ground raises every
// goal by itself (gen-hunt-sessions writes the rosters).
//
// ── NO PREMIUM CURRENCY (Tyler L12: Crowns are never earned in play) ───────
// The two rungs that paid gems (hunterAll 25, collect100 15) now pay gold
// only; no rung pays gems. The gem payout could never land anyway: the wallet
// refuses gems (2026-10-23-demolition-bounty-gems-close.sql).
//
// ── THE GOLD IS SIZED TO THE TIME A RUNG TAKES (designer 2026-10-22) ───────
// A new hero on the real settle (play-ground kill rates and drop tables; the
// Cellar to L5, the Thicket to L15, the Sewer's party to L32, the Warrens'
// after; time at the Level guard's rate) clears the rungs at about:
//   monsters  4 / 7 / 10 / 13 / 16 / 19 kinds   0.2 / 0.2 / 3.2 / 3.2 / 23 / 23 h
//   items     10 / 20 / 30 / 40 / 49 ids          0.2 / 3.2 / 4.5 / 23 / 60+ h
// (the last item rung waits on the three rare carriers, 10-15 h each). The old
// gold (2,000-50,000 and 1,000-30,000, 165,000 in all) was sized for a
// 129-monster chase and would land in the first day. Re-golded to 20,900 in
// all: the bonus is about 25% of the ~51,000 a hero earns by the end of the
// monster ladder and 12% of the ~176,000 by the end of the item chase, and it
// still rises every rung. Gold is Tyler's to change (docs/planning/PRIORITY_BOARD.md).
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from './monsters.js?v=0.2.28';
import { ITEMS } from './items.js?v=0.2.28';
import { HUNT_INDEX } from './hunts.js?v=0.2.28';
import { OPEN_GROUNDS, reachableOf } from './hunt-grounds.js?v=0.2.28';

/** What a player can meet today: { monsters: [ids], loot: [ids] } on the open grounds. */
export const REACHABLE = reachableOf(OPEN_GROUNDS, HUNT_INDEX, MONSTERS, ITEMS);

/** The reachable count of a domain. */
export function reachOf(domain, reachable = REACHABLE) {
  return domain === 'monsters' ? reachable.monsters.length : domain === 'items' ? reachable.loot.length : 0;
}

/** A rung's goal against `reach`: ceil(reach x part / of), the same integer maths as the SQL. */
export function goalOf(row, reach) {
  return Math.ceil((reach * row.part) / row.of);
}

const rung = (domain, part, of, gold) => Object.freeze({ domain, part, of, gold });
export const COLLECTION_MILESTONES = Object.freeze({
  hunter10:   rung('monsters', 1, 6, 200),
  hunter25:   rung('monsters', 2, 6, 400),
  hunter40:   rung('monsters', 3, 6, 800),
  hunter60:   rung('monsters', 4, 6, 1200),
  hunter85:   rung('monsters', 5, 6, 2500),
  hunterAll:  rung('monsters', 6, 6, 4000),
  collect25:  rung('items', 1, 5, 200),
  collect50:  rung('items', 2, 5, 600),
  collect75:  rung('items', 3, 5, 1000),
  collect100: rung('items', 4, 5, 2000),
  collect125: rung('items', 5, 5, 8000),
});
