// ════════════════════════════════════════════════════════════════════════
// src/data/goal-catalogue.js — THE SERVER-OWNED GOAL/REWARD CATALOGUE.
//
// The GOAL and the GOLD REWARD for every QUEST the server credits under
// `hr_claim_quest`, and THE DAILY BOARD's selection (which goals of
// hr_goal_rewards are offered today / this week). This is the SINGLE SOURCE;
// the SQL embeds a copy and tests/goal-catalogue-drift.mjs binds THREE sides:
//   (1) this module,
//   (2) the authored client rows in src/legacy.js (QUEST_DEFS, DAILY_GOAL_POOL,
//       WEEKLY_GOAL_POOL),
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
// id. Combat-XP quest rewards (hundred_kills) are still client-applied — the XP
// arming slice owns that one, and it is tracked, not forgotten.
//
// A row's `items` map is the ONLY authoring surface for a quest item reward.
// tests/quest-reward-parity.mjs binds it to legacy.js QUEST_DEFS and to the SQL
// seed, and REFUSES an authored QUEST_DEFS item that is not in this catalogue —
// so a phantom quest item can never be authored again.
//
// A row lives here iff the server can BOTH (a) verify its completion from its
// own `ev:<type>` counter (src/core/goals.js), and (b) own a FIXED gold amount.
// Rows that fail either test are DELIBERATELY ABSENT.
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

/* QUESTS — the gold-bearing, server-verifiable rows of legacy.js QUEST_DEFS.
   `checkKey` is the src/core/goals.js counter the server reads (a lifetime
   `stat` row, period_key=''); completion is `value >= goal`.

   `combatXp` (2026-10-10-quest-combat-xp.sql) is the quest's COMBAT XP, paid by
   hr_claim_quest and routed server-side by the character's stored combat style
   (src/core/styles.js shares, generated into hr_style_xp_routes). The client
   never adds it; tests/goal-catalogue-drift.mjs binds it to the SQL arm. */
export const QUEST_REWARDS = Object.freeze({
  /* The first-day combat quest. It used to be ABSENT ("combatXp only, the client
     pays its XP") and that payment rode the attended-combat XP credit — a client
     report. Whole-game review 2026-10-08, Designer ruling: paid by the server's
     quest claim like every other first-day reward. Gold 0, XP only. */
  hundred_kills: { checkKey: 'ev:kill_any', goal: 100, gold: 0, combatXp: 1500, items: Object.freeze({}) },
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
  /* content-holes (2026-10-08): paid wheat_seed (Farming 20) to a player six
     harvests in — around Farming 8 — so the reward sat in the bag for a week.
     Carrot (Farming 10) is the next crop that player can actually plant, and it
     is the rung the start kit no longer hands out early. */
  farmhand:    { checkKey: 'ev:harvest',  goal: 6,  gold: 500, items: Object.freeze({ carrot_seed: 5 }) },
  /* ── JOURNEYMAN'S ROAD (content pack 7; 2026-09-28-journeymans-road.sql) ──
     The day-2 chain, legacy.js QUEST_DEFS `chain:'road'`. Same two tests as
     every row above: a lifetime ev:<type> the server already keeps, and a fixed
     gold amount. Each item is one tier ahead of the level-18 rung (the three
     tools) or opens the next place to go (bone_key, potato_seed); road_gather
     pays gold only. Per character, once ever: 6,000 gold + the five grants.
     Designer rulings 2026-09-26: B1 road_hunt 1,500 for 500 kills and B3
     road_gather 1,000 for 500 are CONFIRMED — these are one-off lifetime
     signposts that stack on the dailies/weeklies the same kills already pay,
     not a rate, and road_hunt above 2,000 reopens the accepted forge residual
     (see the migration header). */
  road_forge:   { checkKey: 'ev:smithed',  goal: 60,  gold: 700,  items: Object.freeze({ iron_pickaxe: 1 }) },
  road_craft:   { checkKey: 'ev:crafted',  goal: 60,  gold: 700,  items: Object.freeze({ iron_axe: 1 }) },
  road_cook:    { checkKey: 'ev:cooked',   goal: 60,  gold: 600,  items: Object.freeze({ oak_rod: 1 }) },
  road_gather:  { checkKey: 'ev:gather',   goal: 500, gold: 1000, items: Object.freeze({}) },
  road_hunt:    { checkKey: 'ev:kill_any', goal: 500, gold: 1500, items: Object.freeze({ bone_key: 1 }) },
  road_harvest: { checkKey: 'ev:harvest',  goal: 40,  gold: 1500, items: Object.freeze({ potato_seed: 10 }) },
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

/* True iff the SERVER credits this quest's combat XP (2026-10-10). The client
   reads it to decide that `completeQuest` must NOT call addXp — the claim pays
   it, and a local addXp would also queue it on the attended-combat credit. */
export function questCombatXpIsServerCredited(questId) {
  const row = QUEST_REWARDS[questId];
  return !!(row && row.combatXp > 0);
}

/* ════════════════════════════════════════════════════════════════════════
   THE DAILY BOARD (lane daily-board, 2026-10-11) — ONE daily system.

   Daily Tasks (hr_claim_daily) and Daily Goals (hr_claim_goal) both asked a new
   player to "kill N / gather N" on two screens. The Goals half survives: it has a
   catalogue TABLE (hr_goal_rewards), a read RPC that projects the server's own
   counts (hr_goal_state) and one claim RPC for daily and weekly alike. Daily
   Tasks are retired (UI, local counting, claim path; the grant is revoked by
   2026-10-12-retire-daily-tasks.sql once this client is live).

   What the board adds is the one thing the Goals half lacked: the SERVER decides
   which three goals are offered. hr_goal_board (2026-10-11-daily-board.sql) is a
   port of pickBoard below; hr_goal_state answers the board and hr_claim_goal
   refuses an unoffered goal (`not_offered`). The client paints the server's
   board and uses pickBoard only to paint before the first answer lands.

   pickBoard is the historical client picker in exact integer form:
   floor(seed*n/233280) equals the old floor((seed/233280)*n) for every seed
   and n in 9..12 (tests/daily-board.mjs sweeps the whole seed space), so the
   board a live client already shows IS the board the server enforces. */
export const BOARD_SIZE = 3;

/* The index spaces, in the authored order of legacy.js DAILY_GOAL_POOL and
   WEEKLY_GOAL_POOL. A row is dealt only while it is catalogued in
   hr_goal_rewards (wk_bury is not: burying has no server counter). */
export const DAILY_BOARD_POOL = Object.freeze([
  'kill_any', 'kill_more', 'gather_logs', 'mine_ore', 'cook', 'fish', 'gold_500', 'plant', 'level_up',
]);
export const WEEKLY_BOARD_POOL = Object.freeze([
  'wk_kills', 'wk_smith', 'wk_craft', 'wk_harvest', 'wk_bury', 'wk_rare', 'wk_gold', 'wk_gather',
  'wk_logs', 'wk_cook', 'wk_levels',
]);
export const BOARD_UNDEALT = Object.freeze(['wk_bury']);

/** The UTC day as YYYYMMDD — the daily board's seed. */
export function boardDayKey(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Monday-aligned week number (epoch day 0 was a Thursday) — the weekly seed. */
export function boardWeekKey(ms) {
  return Math.floor((Math.floor(ms / 86400000) + 3) / 7);
}

/** BOARD_SIZE ids of `pool`, seeded by `key`, skipping undealt rows. */
export function pickBoard(key, pool, undealt = BOARD_UNDEALT) {
  const n = pool.length;
  const ok = (i) => undealt.indexOf(pool[i]) < 0;
  let offerable = 0;
  for (let i = 0; i < n; i++) if (ok(i)) offerable++;
  let seed = Math.floor(Number(key)) || 0;
  const used = {};
  const out = [];
  for (let k = 0; k < BOARD_SIZE && k < offerable; k++) {
    seed = (seed * 9301 + 49297) % 233280;
    let idx = Math.floor(seed * n / 233280);
    for (let s = 0; s < n && (used[idx] || !ok(idx)); s++) idx = (idx + 1) % n;
    if (used[idx] || !ok(idx)) break;
    used[idx] = true;
    out.push(pool[idx]);
  }
  return out;
}

/** The board at an instant: { daily: [ids], weekly: [ids] }. */
export function boardAt(ms) {
  return {
    daily: pickBoard(boardDayKey(ms), DAILY_BOARD_POOL),
    weekly: pickBoard(boardWeekKey(ms), WEEKLY_BOARD_POOL),
  };
}
