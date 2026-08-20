// ════════════════════════════════════════════════════════════════════════
// src/data/goal-catalogue.js — THE SERVER-OWNED GOAL/REWARD CATALOGUE.
//
// The GOAL and the GOLD REWARD for every DAILY TASK and QUEST the server
// credits under `hr_claim_daily` / `hr_claim_quest`
// (supabase/migrations/2026-08-20-goal-reward-rpc-credit.sql). This is the
// SINGLE SOURCE for those numbers; the SQL RPCs embed a copy and
// tests/goal-catalogue-drift.mjs binds THREE sides so none can drift in
// silence:
//   (1) this module,
//   (2) the authored client rows in src/legacy.js (QUEST_DEFS / DAILY_TASK_POOL),
//   (3) the server catalogue inside the migration SQL.
//
// ── WHY ONLY GOLD, AND WHY ONLY SOME ROWS ───────────────────────────────
// The gold-arming program moves ONE domain at a time (gold first). Under arm,
// the client's `updateDaily`/`completeQuest` gold credit no-ops
// (clientMayWriteRecordField('gold') → false), so the reward has to be paid by
// a server RPC. That RPC owns the GOLD only; item + combat-XP rewards on a
// quest stay CLIENT-applied for now (XP/inventory are later arming slices).
//
// A row lives here iff the server can BOTH (a) verify its completion from its
// own `ev:<type>` counter (src/core/goals.js), and (b) own a FIXED gold amount.
// Rows that fail either test are DELIBERATELY ABSENT and enumerated in
// BLOCKED_* below with the reason — the "STOP and flag" rule, as data.
//
// PURE ESM. No DOM, no window, no I/O. Imports cleanly in Node and Deno.
// ════════════════════════════════════════════════════════════════════════

/* QUESTS — the gold-bearing, server-verifiable rows of legacy.js QUEST_DEFS.
   `checkKey` is the src/core/goals.js counter the server reads (a lifetime
   `stat` row, period_key=''); completion is `value >= goal`.

   `hundred_kills` is ABSENT: its reward is combatXp only (no gold), so it never
   defers under the gold arm and needs no server credit — the client pays its XP
   exactly as before. Its `mirror:'stats.kills'` equals `ev:kill_any` anyway. */
export const QUEST_REWARDS = Object.freeze({
  gatherer:    { checkKey: 'ev:gather',   goal: 15, gold: 150 },
  first_cook:  { checkKey: 'ev:cooked',   goal: 5,  gold: 200 },
  first_blood: { checkKey: 'ev:kill_any', goal: 5,  gold: 150 },
  farmhand:    { checkKey: 'ev:harvest',  goal: 10, gold: 500 },
});

/* DAILY TASKS — the FIXED-reward rows of legacy.js DAILY_TASK_POOL. `type` is
   the goal event; the server reads `ev:<type>` in the kind='daily' population
   for TODAY's UTC day key and completes at `value >= goal`. Reward is pure gold.

   `daily_harvest` is ABSENT — see BLOCKED_DAILY. */
export const DAILY_TASK_REWARDS = Object.freeze({
  daily_kill:       { type: 'kill_any', goal: 25,  gold: 500 },
  daily_kill_big:   { type: 'kill_any', goal: 60,  gold: 900 },
  daily_gather:     { type: 'gather',   goal: 50,  gold: 400 },
  daily_gather_big: { type: 'gather',   goal: 120, gold: 800 },
  daily_cook:       { type: 'cooked',   goal: 12,  gold: 400 },
  daily_smith:      { type: 'smithed',  goal: 8,   gold: 450 },
  daily_craft:      { type: 'crafted',  goal: 8,   gold: 450 },
});

/* THE POOL ORDER — the EXACT authored order of legacy.js DAILY_TASK_POOL, so
   the server's day-keyed selection (hr_daily_task_set) shuffles the SAME
   index space the client does. `daily_harvest` occupies index 4 even though it
   is not creditable: dropping it here would shift every index and desync the
   selection from the client. The drift test asserts this order equals the
   authored `id:` order in legacy.js. */
export const DAILY_TASK_POOL_ORDER = Object.freeze([
  'daily_kill',        // 0
  'daily_kill_big',    // 1
  'daily_gather',      // 2
  'daily_gather_big',  // 3
  'daily_harvest',     // 4  — BLOCKED (dynamic goal), still holds its slot
  'daily_cook',        // 5
  'daily_smith',       // 6
  'daily_craft',       // 7
]);

/* The base number of daily tasks offered (indexes .slice(0, N) of the shuffle).
   The King's Renown perk adds a 4th client-side; the server CANNOT see Renown
   (RENOWN_MODEL is unbuilt), so it credits the base set only — see BLOCKED_DAILY. */
export const DAILY_TASK_BASE_COUNT = 3;

/* THE FLAGGED ROWS — server-authority gaps stated as data, not omitted in
   silence. Each names the dependency that would let the server own it. */
export const BLOCKED_DAILY = Object.freeze({
  daily_harvest: 'DYNAMIC GOAL. legacy.js computes goal=max(10, farmPlotCap()*3) '
    + 'and reward=goal*30 from the client farm-plot cap (homestead.maxPlots). The '
    + 'server does not know the plot cap today. Unblock: read the farm_land unlock '
    + 'rung from player_progress (kind=unlock, the seam:farm.build_plot ladder) and '
    + 'derive the cap server-side, then this becomes a normal creditable row.',
  king_fourth_slot: 'RENOWN-GATED SLOT. A King (Renown perk) is shown a 4th daily '
    + 'task (index 3 of the shuffle). Renown has no server model (gold-sites B.RENOWN_'
    + 'MODEL), so the server derives the base 3 only and refuses a 4th with not_offered. '
    + 'Rides on the Renown server model.',
});

export const BLOCKED_GOAL_BOARD = 'THE DAILY/WEEKLY GOALS BOARD (legacy.js DAILY_GOAL_POOL / '
  + 'WEEKLY_GOAL_POOL, claimQuestReward). A DIFFERENT tracking model: progress = readSource(stats.*) '
  + '- baseline captured at day/week start. Most sources are NOT ev counters (stats.chopped, .mined, '
  + '.fished, .planted, .levelups, _dailyGoldDelta) — the ev model emits only six AGGREGATE types, not '
  + 'per-skill or derived ones — and the weekly delta-baseline cannot be reconstructed from ev daily '
  + 'rows. Not server-verifiable from the ev counters; its b411 defer stays. Unblock: a server model '
  + 'for per-skill/derived counters + a period baseline, or re-author the board onto the six ev types.';
