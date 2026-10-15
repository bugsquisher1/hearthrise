// ════════════════════════════════════════════════════════════════════════
// src/data/goal-catalogue.js — THE SERVER-OWNED GOAL/REWARD CATALOGUE.
//
// The GOAL and the GOLD REWARD for every QUEST the server credits under
// `hr_claim_quest`
// (supabase/migrations/2026-08-20-goal-reward-rpc-credit.sql). This is the
// SINGLE SOURCE for those numbers; the SQL RPCs embed a copy and
// tests/goal-catalogue-drift.mjs binds THREE sides so none can drift in
// silence:
//   (1) this module,
//   (2) the authored client rows in src/legacy.js (QUEST_DEFS),
//   (3) the server catalogue inside the migration SQL — for QUESTS, the LAST
//       file in tests/schema-apply-order.json that restates
//       hr_claim_quest__ungated / refills hr_quest_rewards (the chain end;
//       2026-09-28-journeymans-road.sql today), never a superseded one.
//
// ── WHY GOLD — AND, SINCE THE QUEST-ITEM SLICE, THE ITEM HALF TOO ───────
// The gold-arming program moves ONE domain at a time (gold first). Under arm,
// the client's `completeQuest` gold credit no-ops
// (clientMayWriteRecordField('gold') → false), so the reward has to be paid by
// a server RPC.
//
// Ten QUEST rows: the five-step first day (four here; hundred_kills pays XP
// only) and the six-step Journeyman's Road (chain:'road').
//
// The QUEST rows now also carry `items` — the SERVER-CREDITED item grant.
// supabase/migrations/2026-09-06-quest-item-rewards.sql seeded it (the road
// rows are refilled by 2026-09-28-journeymans-road.sql, which now OWNS it) into
// public.hr_quest_rewards and hr_claim_quest credits it into player_inventory in
// the SAME transaction as the gold, once-guarded on the same (user, slot,
// quest_id) claim row and journalled to player_ledger. `completeQuest` no longer
// calls `addItem` for a catalogued quest — it mirrors what the RPC says it
// granted, so the bag and the server agree without a reload.
//
// WHY IT HAD TO MOVE (the P1 this closes). A client-only `addItem` is erased
// post-cutover, and not only in theory: `shrimp` is a FISH_SPOTS product, so
// `serverOwnedItem('shrimp')` is TRUE, and the moment the away engine EATS one
// the id joins `consumedKeysOf` and the envelope's figure for it becomes
// ABSOLUTE (src/net/accrue.js) — the server says 0 and the whole client-minted
// stack goes. That is TODAY, pre-arm; the inventory arm generalises it to every
// id. QUEST XP is server-credited too (2026-10-10-quest-xp-absence-pay.sql):
// a row's `xp` map is seeded into public.hr_quest_rewards.xp and hr_claim_quest
// credits it into player_skills inside the same claim; the client never adds it.
//
// A row's `items` map is the ONLY authoring surface for a quest item reward.
// tests/quest-reward-parity.mjs binds it to legacy.js QUEST_DEFS and to the SQL
// seed, and REFUSES an authored QUEST_DEFS item that is not in this catalogue —
// so a phantom quest item can never be authored again.
//
// A row lives here iff the server can BOTH (a) verify its completion from its
// own `ev:<type>` counter (src/core/goals.js), and (b) own a FIXED gold amount.
// The daily-task rows and their date-seeded picker were deleted with daily
// quests (demolition, 2026-10-14).
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

/* QUESTS — the gold-bearing, server-verifiable rows of legacy.js QUEST_DEFS.
   `checkKey` is the src/core/goals.js counter the server reads (a lifetime
   `stat` row, period_key=''); completion is `value >= goal`.

   `xp` is the SERVER-CREDITED XP grant ({skill: amount}), bound to
   hr_quest_rewards.xp and legacy.js QUEST_DEFS reward.xp by
   tests/quest-reward-parity.mjs. Only `hundred_kills` pays XP: 1,500 HITPOINTS,
   gold 0 — the house rule for server-granted XP on a span objective names a
   constant skill (no style exists at claim time; see legacy.js kill_any). */
export const QUEST_REWARDS = Object.freeze({
  gatherer:    { checkKey: 'ev:gather',   goal: 15, gold: 150, items: Object.freeze({}) },
  /* ── FIRST-NIGHT IDLE RESCUE, RESTORED ON THE SERVER SIDE ────────────────
     This row's 30 raw shrimp were WITHDRAWN under Security F2 (2026-09-06)
     because `completeQuest` paid them through `addItem`, which writes
     G.inventory only — and `shrimp` is a server-owned id, so the next envelope
     deleted them. The withdrawal was correct: promising a first-night food
     stock a reload eats is worse than promising nothing.

     The reward is back because the PATH is fixed, not because the ruling was
     overturned: hr_claim_quest now credits `items` into player_inventory in the
     same transaction as the gold. The client never mints it, so there is
     nothing for an envelope to disagree with. `gold: 200` is unchanged (the
     Designer's number, untouched), so the CASE catalogue in
     2026-08-20-goal-reward-rpc-credit.sql needs no edit and
     tests/goal-catalogue-drift.mjs stays green by construction. */
  first_cook:  { checkKey: 'ev:cooked',   goal: 5,  gold: 200, items: Object.freeze({ shrimp: 30 }) },
  /* The two seed grants were ALSO client-minted. They happen to survive today
     — seeds are in item-authority.js's EXCLUDED set, so the absolute branch may
     not delete them — but "safe by an accident of which set an id falls in" is
     not a property, and the inventory arm removes the accident. They move with
     first_cook so the whole class is closed in one build. */
  first_blood: { checkKey: 'ev:kill_any', goal: 5,  gold: 150, items: Object.freeze({ turnip_seed: 5 }) },
  /* b497: goal 10 → 6. Onboarding step 4 was a TWO-grow-cycle wall at the
     starting Wanderer's Camp (2 plots × 2-4 turnips ≈ 6 produce a round), the
     same defect b495 fixed on the harvest DAILY. 6 = one harvest round.
     Retuning a QUEST goal is safe on live saves: `goal` is re-read from
     QUEST_DEFS at render/grade time, `progress` is the save field, and a save
     already carrying progress ≥ 6 completes on its next harvest tick rather
     than re-granting (ensureRetentionState merges BY ID and keeps `done`). */
  /* W0 (coherence audit 2026-10-09): wheat_seed -> carrot_seed. Wheat needs
     Farming 20; carrots (Farming 10) are the next rung after the kit's turnips.
     Server seed: 2026-10-16-first-day-seeds.sql, which now owns hr_quest_rewards. */
  farmhand:    { checkKey: 'ev:harvest',  goal: 6,  gold: 500, items: Object.freeze({ carrot_seed: 5 }) },
  /* ── JOURNEYMAN'S ROAD (content pack 7; 2026-09-28-journeymans-road.sql) ──
     The day-2 chain, legacy.js QUEST_DEFS `chain:'road'`. Same two tests as
     every row above: a lifetime ev:<type> the server already keeps, and a fixed
     gold amount. Re-rewarded at the same value by the designer ruling of
     2026-10-14 (tools and the bone key left): iron bars, oak planks, raw and
     cooked lobsters, and potato seed; road_gather
     pays gold only. Per character, once ever: 6,000 gold + the five grants.
     Designer rulings 2026-09-26: B1 road_hunt 1,500 for 500 kills and B3
     road_gather 1,000 for 500 are CONFIRMED — these are one-off lifetime
     signposts that stack on the dailies/weeklies the same kills already pay,
     not a rate, and road_hunt above 2,000 reopens the accepted forge residual
     (see the migration header). */
  road_forge:   { checkKey: 'ev:smithed',  goal: 60,  gold: 700,  items: Object.freeze({ iron_bar: 3 }) },
  road_craft:   { checkKey: 'ev:crafted',  goal: 60,  gold: 700,  items: Object.freeze({ oak_plank: 5 }) },
  road_cook:    { checkKey: 'ev:cooked',   goal: 60,  gold: 600,  items: Object.freeze({ lobster: 3 }) },
  road_gather:  { checkKey: 'ev:gather',   goal: 500, gold: 1000, items: Object.freeze({}) },
  road_hunt:    { checkKey: 'ev:kill_any', goal: 500, gold: 1500, items: Object.freeze({ cooked_lobster: 2 }) },
  road_harvest: { checkKey: 'ev:harvest',  goal: 40,  gold: 1500, items: Object.freeze({ potato_seed: 10 }) },
  /* "Defeat 100 monsters" — XP only, credited by hr_claim_quest. */
  hundred_kills: { checkKey: 'ev:kill_any', goal: 100, gold: 0, items: Object.freeze({}),
    xp: Object.freeze({ hitpoints: 1500 }) },
});

/* QUEST TYPES THAT READ A SERVER *STATE*, NOT AN `ev:` COUNTER (W0, 2026-10-10).
   "Upgrade to a Homestead" is done when the server's property rung >= the goal:
   hr_unlock_buy writes the rung, hr_state_of projects it, net/property-record.js
   serverPropertyTier reads it, so it needs no counter and no emit site. Such a row
   pays nothing (no server claim), so it is absent from QUEST_REWARDS. A type here
   must have a reader in legacy.js SERVER_QUEST_COUNTS; tests/goal-counters.mjs
   G2(b) checks both halves. Lives here, not in src/core/goals.js, so the edge
   payload does not move for a client-only reader. Value = what it reads. */
export const STATE_GOAL_TYPES = Object.freeze({
  property: 'the server property rung (net/property-record.js serverPropertyTier)',
});

/* ── THE ONE NORMALISER FOR A QUEST'S ITEM REWARD ────────────────────────
   legacy.js authors a quest reward as `{gold, item, qty, combatXp}` — ONE item,
   because that is all any quest has ever paid. The server catalogue is a MAP,
   because a table row that can only ever hold one item is a cap you discover at
   the worst moment. This reads either shape and always answers a map, so the
   authored form can grow to `items:{a:1,b:2}` without a second reader appearing
   anywhere. Pure; used by the client, by the parity guard, and by nothing that
   needs a DOM.

   Zero/negative/unreadable quantities are DROPPED rather than clamped: a `qty:0`
   is an authoring mistake, and paying "0 turnip seeds" is a lie the receipt
   would then have to tell. */
export function questRewardItems(reward) {
  const out = {};
  if (!reward || typeof reward !== 'object') return out;
  if (reward.items && typeof reward.items === 'object') {
    for (const [id, qty] of Object.entries(reward.items)) {
      const n = Math.floor(Number(qty) || 0);
      if (id && n > 0) out[id] = n;
    }
  }
  if (reward.item) {
    const n = Math.floor(Number(reward.qty) || 1);
    if (n > 0) out[String(reward.item)] = (out[String(reward.item)] || 0) + n;
  }
  return out;
}

/* True iff the SERVER credits this quest's item reward — i.e. the id is in
   QUEST_REWARDS and that row authors at least one item. The client uses it to
   decide whether `completeQuest` may write the bag itself; the parity guard
   asserts it is true for every QUEST_DEFS row that authors an item, so the
   client's "not catalogued" fallback is unreachable by construction. */
export function questItemsAreServerCredited(questId) {
  const row = QUEST_REWARDS[questId];
  return !!(row && row.items && Object.keys(row.items).length > 0);
}

/* The SERVER-CREDITED XP of a quest ({skill: amount}, positive integers only),
   or {} — the same normalising rule as questRewardItems. */
export function questRewardXp(reward) {
  const out = {};
  const xp = reward && typeof reward === 'object' ? reward.xp : null;
  if (!xp || typeof xp !== 'object') return out;
  for (const [sk, amt] of Object.entries(xp)) {
    const n = Math.floor(Number(amt) || 0);
    if (sk && n > 0) out[sk] = n;
  }
  return out;
}

/* True iff the SERVER credits this quest's XP (hr_claim_quest, hr_quest_rewards.xp).
   The client uses it to fire the claim for an XP-only quest; it never adds the XP. */
export function questXpIsServerCredited(questId) {
  return Object.keys(questRewardXp(QUEST_REWARDS[questId])).length > 0;
}
