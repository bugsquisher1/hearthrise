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
  /* b497: goal 10 → 6. Onboarding step 4 was a TWO-grow-cycle wall at the
     starting Wanderer's Camp (2 plots × 2-4 turnips ≈ 6 produce a round), the
     same defect b495 fixed on the harvest DAILY. 6 = one harvest round.
     Retuning a QUEST goal is safe on live saves: `goal` is re-read from
     QUEST_DEFS at render/grade time, `progress` is the save field, and a save
     already carrying progress ≥ 6 completes on its next harvest tick rather
     than re-granting (ensureRetentionState merges BY ID and keeps `done`). */
  farmhand:    { checkKey: 'ev:harvest',  goal: 6,  gold: 500 },
});

/* DAILY TASKS — the FIXED-reward rows of legacy.js DAILY_TASK_POOL. `type` is
   the goal event; the server reads `ev:<type>` in the kind='daily' population
   for TODAY's UTC day key and completes at `value >= goal`. Reward is pure gold.

   `daily_harvest` is ABSENT — see BLOCKED_DAILY. */
/* ── b497 — THE GOLD-PER-EFFORT-MINUTE RETUNE (Designer, balance audit) ─────
   The pool paid a 13:1 spread across gold-per-effort-minute and FIGHTERS sat at
   the bottom of it. Killing 60 monsters is the longest task in the pool and
   paid 900 g; "Craft 8 items" is eight unattended bench pulls (~8 seconds of
   the player's attention) and paid 450. Ruled: kills up, bench targets up 5×.
   The pair that moved most is also the pair with a REQUIREMENT
   (DAILY_TASK_REQUIREMENTS below), so the harder goal is only ever offered to
   an account that owns the bench.
   ⚠ THE SERVER PAYS THESE. Changing a number here is a change in FOUR places:
   this table, src/legacy.js DAILY_TASK_POOL, and the embedded CASE catalogue in
   BOTH 2026-08-20-goal-reward-rpc-credit.sql and its restatement in
   2026-08-29-daily-task-eligibility.sql. tests/goal-catalogue-drift.mjs binds
   all four; a production database additionally needs the forward migration
   2026-09-04-goal-gold-retune.sql, because `create or replace` on prod is the
   only thing that moves a body already installed there. */
export const DAILY_TASK_REWARDS = Object.freeze({
  daily_kill:       { type: 'kill_any', goal: 25,  gold: 600 },
  daily_kill_big:   { type: 'kill_any', goal: 60,  gold: 1400 },
  daily_gather:     { type: 'gather',   goal: 50,  gold: 400 },
  daily_gather_big: { type: 'gather',   goal: 120, gold: 800 },
  daily_cook:       { type: 'cooked',   goal: 12,  gold: 400 },
  daily_smith:      { type: 'smithed',  goal: 40,  gold: 500 },
  daily_craft:      { type: 'crafted',  goal: 40,  gold: 500 },
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

/* ════════════════════════════════════════════════════════════════════════
   DAILY-TASK ELIGIBILITY — one predicate, evaluated on BOTH sides.

   ── THE P0 THIS CLOSES (2026-08-23) ─────────────────────────────────────
   The date-seeded shuffle above is a pure 3-of-8 draw with no notion of what
   the player can actually DO. On 2026-08-23 it dealt a fresh account
   "Craft 8 items" + "Smith 8 items" — 900 of the day's 1300 gold — and at
   level 1 there is not one craftable or smithable recipe in the game:
   `HearthriseHomestead.hasWorkbench()` gates crafting behind the Workshop and
   smithing behind the Forge (src/features/homestead.js WORKBENCH), and both
   rooms need the tier-3 property, two upgrades away. Home's "Next up" panel
   routed the player onto a wall of padlocks on their first session.

   ── THE RULE ────────────────────────────────────────────────────────────
   A task whose prerequisite is not met is SKIPPED and the next task in the
   same shuffle order takes its slot. Not re-rolled, not re-seeded: the order
   is the priority list, and skipping down it keeps the selection a pure
   function of (day key, capabilities) on both sides.

   Three properties, each of which the shape was chosen for:

     • IDENTITY FOR A FULLY-UNLOCKED ACCOUNT. Every requirement is satisfied,
       so the filter is a no-op and the offered set is byte-identical to what
       the unfiltered shuffle produced. An eligibility filter that changes what
       an established player is offered is a balance change wearing a bug fix's
       clothes; this one cannot be.
     • ALWAYS A FULL SLATE. Six of the eight pool rows have no requirement at
       all, so a base-3 (or King's-4) draw can always be filled from eligible
       rows. The final back-fill loop exists for the day someone authors a
       ninth row with a requirement — it must never be possible to hand a
       player two tasks because the third was locked.
     • DISJUNCTIVE, AND DELIBERATELY SO. "Room owned OR the skill already has
       XP." You cannot earn crafting XP at a bench you never had, so the
       second arm only ever ADDS eligibility — and it is what makes the two
       sides agree for every player who has actually used the bench, which is
       precisely the population a room-only predicate would falsely lock out
       server-side (the server does not yet hold room ownership for a
       pre-cutover character; the rooms record is dormant).

   ── HOW THE TWO SIDES AGREE ─────────────────────────────────────────────
   Client: src/legacy.js `generateDailyTasks` calls `dailyTaskSetIndexes` via
   window.HearthriseCore.goalCatalogue, with caps read from the homestead rooms
   and G.skills.
   Server: `hr_daily_task_set_for` in
   supabase/migrations/2026-08-29-daily-task-eligibility.sql, a faithful port,
   with caps read from player_progress (kind='unlock', key='room:<id>') and
   player_skills.
   The claim RPC accepts the UNION of the eligible set and the raw base-3 —
   see that migration's header for why a widened accept is the only shape that
   can never refuse a legitimate claim while the two stores can disagree.
   tests/goal-catalogue-drift.mjs binds the JS to the SQL. ═══════════════ */

/* Task id → what it needs. A row absent from here needs nothing.
   `room` is the src/features/homestead.js WORKBENCH room id; `skill` is the
   artisan skill that room gates. Adding a gated daily is a row here plus a
   `when` arm in the SQL — the drift test fails the build if only one moves. */
export const DAILY_TASK_REQUIREMENTS = Object.freeze({
  daily_smith: Object.freeze({ room: 'forge', skill: 'smithing' }),
  daily_craft: Object.freeze({ room: 'workshop', skill: 'crafting' }),
});

/* NOT gated, and each absence is a decision rather than an oversight:
   • daily_cook — b225 retired the Kitchen as a permission gate (the campfire
     ruling); cooking works from the tier-1 camp, and the Kitchen now sells
     reliability (noBurn), not access.
   • daily_harvest — the starting Wanderer's Camp has 2 plots and seeds are
     shop-stocked, so farming is reachable on day one. Its goal SCALES with the
     plot cap already (legacy.js b220), which is the right lever for that row.
   • daily_kill / daily_gather (+ the _big pair) — no prerequisite exists. */

/**
 * @param taskId one of DAILY_TASK_POOL_ORDER
 * @param caps { rooms: {<roomId>: level}, skillXp: {<skillId>: xp} }
 *        A MISSING caps object means "nothing unlocked" — fail closed, because
 *        the failure it guards against is offering a padlock, and the cost of
 *        being wrong in the other direction is a task the player cannot do.
 */
export function dailyTaskEligible(taskId, caps) {
  const req = DAILY_TASK_REQUIREMENTS[taskId];
  if (!req) return true;
  const c = caps || {};
  const rooms = c.rooms || {};
  const skillXp = c.skillXp || {};
  if ((Number(rooms[req.room]) || 0) > 0) return true;
  if ((Number(skillXp[req.skill]) || 0) > 0) return true;
  return false;
}

/* FNV-1a over the day key. THE REFERENCE IMPLEMENTATION — src/legacy.js
   `dailySeed` and public.hr_goal_daily_seed are both ports of this, and
   tests/goal-catalogue-drift.mjs executes the legacy copy against this one over
   a date sweep rather than comparing the two by eye.
   `Math.imul`, never `h * 0x01000193`: the float multiply loses the low bits
   past 2^53, which measured as a 22× draw skew over 730 days (b332). */
export function dailySeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The date-seeded Fisher-Yates over the pool's index space. Unfiltered. */
export function dailyTaskIndexes(dayKey) {
  let seed = dailySeed(dayKey);
  const indexes = DAILY_TASK_POOL_ORDER.map((_, i) => i);
  for (let i = indexes.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;        // LCG step
    const j = seed % (i + 1);
    const t = indexes[i]; indexes[i] = indexes[j]; indexes[j] = t;
  }
  return indexes;
}

/**
 * TODAY'S OFFERED SET, as POOL INDEXES — the shape src/legacy.js needs, since
 * its pool is an array of factories addressed by index.
 * @param count defaults to DAILY_TASK_BASE_COUNT; the King's Renown perk asks
 *        for one more (legacy.js reads it) and it is bounded by the pool.
 */
export function dailyTaskSetIndexes(dayKey, caps, count) {
  const order = dailyTaskIndexes(dayKey);
  const want = Math.max(0, Math.min(order.length,
    (typeof count === 'number' && Number.isFinite(count)) ? Math.floor(count) : DAILY_TASK_BASE_COUNT));
  const out = [];
  for (const i of order) {
    if (out.length >= want) break;
    if (dailyTaskEligible(DAILY_TASK_POOL_ORDER[i], caps)) out.push(i);
  }
  /* THE BACK-FILL. Unreachable today (six pool rows are ungated, so a 3- or
     4-slot draw always fills), and deliberately kept: the day someone authors a
     ninth pool row with a requirement, the alternative is a player handed two
     daily tasks and a silent hole where the third should be. Shuffle order is
     preserved so the result stays a pure function of the inputs. */
  if (out.length < want) {
    for (const i of order) {
      if (out.length >= want) break;
      if (out.indexOf(i) < 0) out.push(i);
    }
  }
  return out;
}

/** The same selection as TASK IDS — what the server compares a claim against. */
export function dailyTaskSet(dayKey, caps, count) {
  return dailyTaskSetIndexes(dayKey, caps, count).map((i) => DAILY_TASK_POOL_ORDER[i]);
}

export const BLOCKED_GOAL_BOARD = 'THE DAILY/WEEKLY GOALS BOARD (legacy.js DAILY_GOAL_POOL / '
  + 'WEEKLY_GOAL_POOL, claimQuestReward). A DIFFERENT tracking model: progress = readSource(stats.*) '
  + '- baseline captured at day/week start. Most sources are NOT ev counters (stats.chopped, .mined, '
  + '.fished, .planted, .levelups, _dailyGoldDelta) — the ev model emits only six AGGREGATE types, not '
  + 'per-skill or derived ones — and the weekly delta-baseline cannot be reconstructed from ev daily '
  + 'rows. Not server-verifiable from the ev counters; its b411 defer stays. Unblock: a server model '
  + 'for per-skill/derived counters + a period baseline, or re-author the board onto the six ev types.';
