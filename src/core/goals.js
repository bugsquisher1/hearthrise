// ════════════════════════════════════════════════════════════════════════
// src/core/goals.js — THE DAILY/QUEST PROGRESS COUNTER CONTRACT.
//
// ⚠ THIS FILE IS THE KEY CONTRACT. If you are writing a new server intent and
//   you need to move a daily or a quest counter, read this header and nothing
//   else — the shapes below are what `hr_apply` accepts and what
//   `hr_state_of`'s progress envelope returns, and inventing a parallel shape
//   is how the quest workstream gets handed a contract it has to break.
//
// ── WHY IT EXISTS (Designer Ruling 3.1, CUTOVER-BLOCKING) ───────────────
// "An away night that pays XP and items but leaves 'Slay 10 monsters' at 0/10
// reads as 'my night didn't count'." Until this file, `supabase/functions/
// hr-accrue/accrual.js` carried TWO named gaps — `updateDaily` and
// `updateQuest` were listed as deliberately-absent fx handlers with the reason
// "no server progress model". This is that model.
//
// ── THE SEAM WAS ALREADY THERE ──────────────────────────────────────────
// Nothing below invents an event. `src/core/combat-sim.js` resolveKill already
// calls `fx.updateDaily('kill_any', 1)` / `fx.updateQuest('kill_any', 1, …)`,
// and `src/core/skill-sim.js` resolveGatherTick already calls
// `fx.updateDaily('gather', qty)` / `fx.updateQuest('gather', qty)` — on the
// SAME function bodies the live client runs. The server was simply not
// listening. A missing fx handler is a no-op by construction, which is exactly
// why the gap was silent. So this is a LISTENER, not a second counter: an away
// kill and a live kill move the same row because they pass through one call
// site.
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  THE KEY CONTRACT                                                    ║
// ║                                                                      ║
// ║   DAILY   kind='daily'  key='ev:<type>'  period_key='<utc day key>'  ║
// ║   QUEST   kind='stat'   key='ev:<type>'  period_key=''               ║
// ║                                                                      ║
// ║  Both are ADDITIVE counters carrying `state:'active'` — never        ║
// ║  'claimed', which gates a payout and has its own path. Both kinds are ║
// ║  already in hr_apply's six-kind progress allowlist, so THIS MODEL    ║
// ║  REQUIRES NO MIGRATION — see "NO MIGRATION" below, which is a claim  ║
// ║  a test executes rather than a hope.                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// ── WHY `kind` IS WHAT IT IS (the artisan model's rule, applied) ─────────
// 2026-08-16-artisan-progress-model.sql established the rule this file obeys:
// `player_progress.kind` IS THE WRITE CAPABILITY, NOT A TAXONOMY. It decides
// who may write a row and what two writes do.
//
//   kind='daily'   in the allowlist · additive · period-keyed. A count that
//                  resets is exactly what a daily task is, and additive is the
//                  CORRECT merge for a count.
//   kind='stat'    in the allowlist · additive · permanent. The lifetime event
//                  count a quest reads.
//   kind='quest'   DELIBERATELY NOT WRITTEN BY THE ENGINE. That key space
//                  belongs to the quest LIFECYCLE — `key=<quest_id>`,
//                  `state='active'|'done'|'claimed'` — and `state='claimed'`
//                  is the one transition that gates a payout (review S13,
//                  hr_apply's separate `progress_claim` block). An engine that
//                  wrote quest rows would be writing into the claim path's key
//                  space with an additive merge. It writes COUNTERS; the claim
//                  path reads them and owns completion.
//   kind='unlock'  not in the allowlist at all (rooms, levels). Untouched here.
//
// ── WHY A QUEST COUNTER IS A LIFETIME COUNT AND NOT PER-QUEST ───────────
// `hundred_kills` in legacy.js's QUEST_DEFS is already a MIRRORED quest: it
// reads `stats.kills` rather than counting `kill_any` events, and the file
// says why — "it is correct on a save that already had the kills before the
// quest existed and it cannot drift from the counter it displays". This model
// makes EVERY quest that shape, against a server-owned counter:
//
//     quest progress = min(goal, stat['ev:<type>'])
//
// The beta is WIPED at cutover, so every character starts at zero and the
// lifetime count IS the quest's progress — no baseline to store, nothing to
// migrate, and a quest authored a year from now is retro-correct on a
// character that already did the work. Two quests sharing a type (goal 5 and
// goal 100 on `kill_any`) read the same row and complete at their own goals,
// which is what the client already does.
//
// ── WHY THE DAILY PERIOD IS THE DAY THE PLAYER RETURNS ──────────────────
// `period_key = utcDayKey(nowMs)` where `nowMs` is the SERVER clock at collect
// time — NOT the credited window's start and NOT its end. All three were
// considered and the other two are wrong in the same direction, which is the
// direction Ruling 3.1 exists to forbid:
//   · window START (`credit.fromMs`): a night from 22:00 to 10:00 credits ALL
//     of it to YESTERDAY, and the player comes back to "Slay 25" at 0/25 —
//     precisely "my night didn't count".
//   · window END (`credit.toMs`): identical failure on any CAPPED absence,
//     which is the common long one. A 40h absence capped at 12h has a window
//     that ended 28 hours ago, so a full night's kills land on a day the
//     player cannot see any more.
//   · RETURN (`nowMs`): the counter moves on the dailies the player is looking
//     at. It is also EXACTLY what the live client does today — `updateDaily`
//     advances the tasks that exist at replay time — so it is not a change in
//     behaviour, and it cannot credit a day that has not started (`nowMs` is
//     `select now()`, and hr_apply stamps `accrued_to` from the same clock).
// The cost, stated: a window that genuinely spanned two UTC days credits one
// day's dailies. That is a bounded UNDER-credit of at most one day, never a
// mint (a night can only ever complete one day's dailies either way), and
// splitting it exactly is not available at any honest price — `simulateSpan`
// segments by UTC day for Boss-of-the-Day, but `simulateSkillSpan` slices by
// BUFF EXPIRY and its slices carry no timestamps. One rule both paths satisfy
// identically beats two rules that agree today.
//
// ── THE DAY KEY IS THE DATABASE'S, NOT A SECOND ONE ─────────────────────
// `utcDayKey` reproduces `public.hr_utc_day_key(timestamptz)` — which is
//     to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
// and note the **FM**: it strips leading zeros, so 16 August 2026 is
// `2026-8-16`, NOT `2026-08-16`. A hand-written ISO slice would look right,
// pass review, and file every away night under a period key no clan/daily
// surface in the database has ever used. tests/goal-counters.mjs asserts this
// function against the REAL SQL function over a sweep of instants, so the two
// cannot drift.
//
// ── THE VOCABULARY IS BOUND TO THE AUTHORED DATA, IN BOTH DIRECTIONS ────
// `GOAL_EVENTS` is not a list somebody keeps in sync. tests/goal-counters.mjs
// asserts:
//   (a) every `fx.updateDaily(`/`fx.updateQuest(` type literal in src/core/**
//       is a member of GOAL_EVENTS ∪ UNCOUNTED_EVENTS — a new EMIT site must
//       be classified, or the build fails by name;
//   (b) every `type:` authored in legacy.js's QUEST_DEFS and DAILY_TASK_POOL
//       is a member of GOAL_EVENTS — a new authored GOAL of an unknown type
//       fails by name rather than silently never moving.
// That is the b350 lesson stated as a guard: *derivation removes the second
// LIST; it does not remove the second SIDE.* The consequence is the property
// the mandate asks for — **a new daily that reuses an existing event type is a
// data row and nothing else.** The handler counts whatever type core reports;
// it has no per-event branch.
//
// ⚠ THE AUTHORED ROWS THEMSELVES STILL LIVE IN src/legacy.js (QUEST_DEFS ~3402,
//   DAILY_TASK_POOL ~3535). Moving them into src/data/goals.js is the right
//   end state and is RECOMMENDED FOLLOW-UP owned by the Systems Engineer — one
//   of the daily factories calls `farmPlotCap()`, a legacy global, so the move
//   is a client behaviour change and not a file copy. It is deliberately NOT
//   done here: the alternative available to a server author is to COPY those
//   rows into a data module, and a second copy of game data is the failure this
//   repo has been burned by (see src/main.js `unifyObject`). The guard above
//   binds the two sides without duplicating either.
//
// ── NO MIGRATION, AND WHY THAT IS A RESULT RATHER THAN AN OMISSION ──────
// Every property this model needs already exists and is asserted by
// tests/goal-counters.mjs against the real chain:
//   · 'daily' and 'stat' are both in hr_apply's progress allowlist and in
//     player_progress' kind CHECK.                            (G6)
//   · `ev:<type>` is ≤ 64 chars and the day key is ≤ 16.      (G6)
//   · hr_progress_prune deletes period_key <> '' older than 31 days, so the
//     DAILY population is swept and the lifetime one is not.  (G8)
//   · hr_state_of returns period rows within the SAME 31 days and permanent
//     rows unfiltered, under LIMIT 1000 with `progress_truncated`. The daily
//     population this model adds is bounded by
//     |GOAL_EVENTS| x 31 = 6 x 31 = 186 rows inside the read window. (G8)
//   · hr_unlock_guard fires on `period_key = ''` and passes a non-'unlock'
//     kind through untouched, so the permanent counters are legal. (G7)
// A migration that added a table or a kind would have to be added to
// player-state.sql's by-name RLS/grant lists to inherit the repo's only static
// "no client writer" defence. Not needing one is strictly better.
//
// PURE ESM. No DOM, no window, no timers, no Math.random, no I/O. Runs in Node
// and in Deno, and is vendored into the Edge Function payload by
// tools/pack-edge.mjs.
// ════════════════════════════════════════════════════════════════════════

/* THE VOCABULARY. Every event type an authored daily or quest is allowed to
   be built on, and therefore every counter key the server can mint.

   These are the exact strings `updateDaily(type)` / `updateQuest(type)` are
   called with — six of them, matching the six types used across QUEST_DEFS and
   DAILY_TASK_POOL. Frozen and sorted so a diff of this list is legible. */
export const GOAL_EVENTS = Object.freeze([
  'cooked',     // artisan bench — cooking
  'crafted',    // artisan bench — crafting
  'gather',     // woodcutting / mining / fishing
  'harvest',    // farm
  'kill_any',   // combat
  'smithed',    // artisan bench — smithing
]);

/* EVENTS CORE EMITS THAT THIS MODEL DELIBERATELY DOES NOT COUNT, each with
   its reason. Being on this list is a DECISION; being on neither list is a
   build failure, which is the point.

     kill_monster — TARGET-SCOPED. resolveKill emits it as
                    `fx.updateQuest('kill_monster', 1, { target: id })` and the
                    client only advances a quest whose `q.target` matches. A
                    key `ev:kill_monster` that counted every kill regardless of
                    target would be a wrong number, and `ev:kill_monster:<id>`
                    is a key shape with no authored consumer today — inventing
                    one now is exactly the "hand the quest workstream a contract
                    it has to break" this file was written to avoid. NO
                    AUTHORED GOAL DECLARES A `target`; tests/goal-counters.mjs
                    asserts that, so the day one does, this decision is
                    re-opened by name rather than by a wrong counter. */
export const UNCOUNTED_EVENTS = Object.freeze(['kill_monster']);

/* The key namespace. `ev:` mirrors the `recipe:` / `room:` / `plot:`
   convention 2026-08-16-artisan-progress-model.sql landed, so a reader of
   player_progress can tell at a glance which model wrote a row — and so an
   event type can never collide with an existing `stat` key (`kills`, `crits`,
   `gathered`, `chopped`, `mined`, `fished`, `tool_doubles`, `deaths`,
   `rare_drops`), which are lifetime counters with a different meaning that
   this model must not disturb. */
export const GOAL_KEY_PREFIX = 'ev:';

/** The player_progress key for a goal event type. One expression, one reader. */
export function goalKey(type) { return GOAL_KEY_PREFIX + type; }

/** Is this a type the server may mint a counter for? */
export function isGoalEvent(type) { return GOAL_EVENTS.indexOf(type) >= 0; }

/* hr_apply's `c_max_progress_add`. Restated here because the ENGINE has to
   clamp against it (see recordGoalOps) and a value it cannot see is a value it
   cannot respect. `progress_clamp` IS on index.ts's DEGRADABLE list, so an
   over-limit op would not 409 the night — it would HALVE THE SPAN and pay half
   the gold and half the XP, to protect a counter whose goal is 25. Clamping
   the counter is the cheaper loss by four orders of magnitude, and it is
   reported (`goal_clamped`) rather than silent.

   THE HEADROOM, so the number is measured rather than assumed. The absolute
   physical ceiling on one accrual is ACCRUE_MAX_SPAN_MS (24h) divided by the
   floor on an action interval (MIN_ACTION_MS = 500 ms), i.e. 172,800 actions;
   gathering can yield 2 per action with a tool double, so 345,600 — a 2.89x
   margin, at rates no shipped node or weapon comes close to. Asserted, not
   asserted-by-comment: tests/goal-counters.mjs G9 recomputes it from the real
   constants and fails if the margin drops below 2x. */
export const MAX_GOAL_ADD = 1000000;

/**
 * THE UTC DAY KEY — `public.hr_utc_day_key(timestamptz)`, in JS.
 *
 * ⚠ NO ZERO PADDING. The SQL is `to_char(…, 'FMYYYY-FMMM-FMDD')` and FM is the
 *   fill-mode prefix that strips leading zeros: `2026-8-16`, not `2026-08-16`.
 *   This is the same key `clan_period_totals` and the Muster have been storing
 *   since 2026-08-08, so a padded one would be a second day-key universe that
 *   looks correct in every screenshot.
 *
 * @param ms  a SERVER instant in epoch ms. Never a client clock.
 * @returns   the key, or '' for a non-finite input — which the caller treats
 *            as "emit no daily op", because a counter filed under '' would be
 *            a PERMANENT row (period_key='' is the permanent population) and
 *            would never be pruned.
 */
export function utcDayKey(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/**
 * THE COUNTER. Two accumulators, because core has two seams and they are not
 * interchangeable: `fx.updateDaily` and `fx.updateQuest` are called at the
 * same sites with the same amounts today, but they are separate calls with
 * separate meanings, and a single accumulator fed by both would double every
 * count. Mirroring the seam exactly means that if core ever moves one without
 * the other, the server moves the same one.
 *
 * Unknown types are DROPPED and REPORTED, never minted into a key. The
 * structural guard catches a new type at build time; this is what happens if
 * one reaches production anyway, and it fails in the direction that cannot
 * create a row nobody can read.
 */
export function makeGoalCounter() {
  const daily = Object.create(null);
  const quest = Object.create(null);
  const unknown = Object.create(null);

  const add = (bag, type, amt) => {
    const n = Math.floor(Number(amt) || 0);
    if (n <= 0) return;
    if (typeof type !== 'string' || !isGoalEvent(type)) {
      if (typeof type === 'string' && type) unknown[type] = (unknown[type] || 0) + n;
      return;
    }
    bag[type] = (bag[type] || 0) + n;
  };

  return {
    /* `meta` is accepted and IGNORED. The client ignores it too for every
       authored goal — `updateQuest` only consults `meta.target` when the quest
       row declares `q.target`, and no authored row does. The guard asserts
       that, so this is a stated equivalence rather than an assumption. */
    daily(type, amt) { add(daily, type, amt); },
    quest(type, amt /* , meta */) { add(quest, type, amt); },
    counts() { return { daily: { ...daily }, quest: { ...quest } }; },
    unknownTypes() { return { ...unknown }; },
  };
}

/**
 * Turn the counter into `progress` ops for an hr_apply delta.
 *
 * @param counter  a makeGoalCounter()
 * @param nowMs    the SERVER instant of the collect — the day the counters
 *                 credit. See the header for why this and not the window.
 * @param events   OPTIONAL sink; push({type,…}) receipts for anything clamped
 *                 or dropped, so a support request is answerable.
 * @returns        an array of ops, each already valid against hr_apply's
 *                 progress block: a kind in its allowlist, a key of 1..64
 *                 chars, a period of ≤16, `state:'active'`, and `add` in
 *                 [1, MAX_GOAL_ADD].
 *
 * ⚠ `state: 'active'` AND NEVER ANYTHING ELSE. A counter has no lifecycle, and
 *   the first draft therefore OMITTED the field — legal in the database (the
 *   column is nullable and hr_apply coalesces an absent state to 'active' for
 *   its own check) but wrong twice over. It made two rows of the same kind,
 *   written by the same builder three lines apart (`stat:kills` carries
 *   'active'), differ in shape for no reason a reader could see; and
 *   tests/accrual-engine.mjs' SHAPE block already asserts every progress op a
 *   delta carries names a settable state, which is a shipped contract this
 *   file does not get to widen. The one value that must never appear is
 *   'claimed' — that gates a payout (review S13) and hr_apply refuses it from
 *   the generic progress block, which is the protection, not this line.
 *
 * OP COUNT, against hr_apply's `c_max_progress_ops` = 64: at most
 * 2 x |GOAL_EVENTS| = 12, and a real night produces TWO (a combat night moves
 * `kill_any` only; a gather night moves `gather` only). The rest of the delta's
 * progress array is 4 stat ops plus at most one recipe unlock, so the ceiling
 * is never approached. G9 asserts the bound from the real constants.
 */
export function goalProgressOps(counter, nowMs, events) {
  const ops = [];
  if (!counter) return ops;
  const { daily, quest } = counter.counts();
  const day = utcDayKey(nowMs);
  const sink = Array.isArray(events) ? events : null;

  const clamp = (type, n, where) => {
    if (n <= MAX_GOAL_ADD) return n;
    if (sink) sink.push({ type: 'goal_clamped', event: type, kind: where, add: n, to: MAX_GOAL_ADD });
    return MAX_GOAL_ADD;
  };

  /* Sorted, so a delta is byte-stable for the same night. The idempotency key
     is derived from the watermark rather than from the delta, so this is not
     load-bearing for correctness — it is load-bearing for a DIFF, and a
     receipt nobody can diff is a receipt nobody checks. */
  for (const type of Object.keys(daily).sort()) {
    /* A missing day key means a non-finite server clock, which cannot happen
       through index.ts (`new Date(select now())`) and would file a permanent
       row that nothing prunes if it did. Refuse the DAILY op and keep the
       lifetime one: under-credit, never an unsweepable row. */
    if (!day) {
      if (sink) sink.push({ type: 'goal_no_day_key', event: type });
      continue;
    }
    ops.push({ kind: 'daily', key: goalKey(type), period: day,
               add: clamp(type, daily[type], 'daily'), state: 'active' });
  }
  for (const type of Object.keys(quest).sort()) {
    ops.push({ kind: 'stat', key: goalKey(type), period: '',
               add: clamp(type, quest[type], 'stat'), state: 'active' });
  }

  const unknown = counter.unknownTypes();
  for (const type of Object.keys(unknown).sort()) {
    if (sink) sink.push({ type: 'unknown_goal_event', event: type, add: unknown[type] });
  }
  return ops;
}

// ════════════════════════════════════════════════════════════════════════
// THE BESTIARY — PER-MONSTER KILL COUNTS (live-settlement Slice 1).
//
// ── WHY IT IS A SIBLING OF THE GOAL COUNTER, NOT A KEY INSIDE IT ─────────
// `resolveKill` emits TWO shapes on every kill: `updateQuest('kill_any', 1,
// {target})` — an aggregate the goal model counts — and `updateQuest(
// 'kill_monster', 1, {target})` — a TARGET-SCOPED event the goal model
// deliberately DROPS (it is the sole member of UNCOUNTED_EVENTS, "no authored
// consumer today"). The bestiary IS that consumer. It reads the exact seam the
// sim already emits and files it per `meta.target`, so an away kill and a live
// kill move the same row through one call site — the goal counter's rule,
// applied to a second dimension of the same event.
//
// ── kind IS THE WRITE CAPABILITY (the artisan rule, again) ──────────────
//   kind='stat'  · additive · permanent (period_key='') · in hr_apply's
//                  allowlist. A lifetime per-monster count is exactly a stat:
//                  the beta wipes at cutover, so the lifetime count IS the
//                  bestiary's number, with no baseline to migrate. NO MIGRATION
//                  is required to WRITE these rows — 'stat' is already legal.
//
// ── THE KEY NAMESPACE, AND WHY IT IS DISTINCT FROM 'ev:kill_any' ────────
// `ev:kill_monster:<id>` extends the `ev:` convention with the TARGET the
// goal key drops. The trailing `:` after `kill_monster` is load-bearing: it
// keeps a bestiary key (`ev:kill_monster:slime`) from ever colliding with a
// goal key (`ev:kill_any`) OR the never-minted aggregate `ev:kill_monster`,
// and it is the exact string a reader can `like 'ev:kill_monster:%'` on to
// pull the bestiary population out on its OWN read (hr_bestiary_of) rather than
// consuming hr_state_of's shared 1000-row envelope. The goal model's
// UNCOUNTED_EVENTS note anticipated this key shape by name.
//
// ── THE VOCABULARY IS BOUND TO THE MONSTER CATALOGUE, BOTH DIRECTIONS ────
// There is no hand-maintained key list to drift: the key is DERIVED from the
// monster id the sim reports, and the sim only ever reports an `activeId`
// computeAccrual already validated against MONSTERS (catalogueHas). So the
// vocabulary is exactly {MONSTERS}. tests/goal-counters.mjs asserts:
//   (a) BESTIARY_EVENT is in UNCOUNTED_EVENTS and NOT in GOAL_EVENTS — the two
//       models partition the event, so a kill is counted once as an aggregate
//       and once per-target, never twice under one key;
//   (b) every MONSTERS id forms a legal key (charset + ≤64 chars) and round
//       trips through the prefix — a monster whose id cannot form a key fails
//       the build BY NAME rather than filing a row nothing can read;
//   (c) the SQL projection's prefix equals BESTIARY_KEY_PREFIX — a key without
//       a monster, or a monster without a key, cannot ship.
// ════════════════════════════════════════════════════════════════════════

/* The one event this model owns. It is `resolveKill`'s target-scoped emit and
   the sole member of UNCOUNTED_EVENTS — a partition the guard asserts. */
export const BESTIARY_EVENT = 'kill_monster';

/* The key namespace. The trailing `:` is the whole point — see the header. */
export const BESTIARY_KEY_PREFIX = 'ev:kill_monster:';

/* An id charset/length that keeps `BESTIARY_KEY_PREFIX + id` ≤ 64 (hr_apply's
   key ceiling): 16 + 48 = 64. Monster ids are `[a-z0-9_]`, ≤17 today; this is
   the fuse if one is ever authored longer, and it fails CLOSED (the op is
   dropped with a receipt, never filed as an unreadable key). */
export const BESTIARY_ID_RE = /^[a-z0-9_]{1,48}$/;

/** The player_progress key for a monster id. One expression, one reader. */
export function bestiaryKey(id) { return BESTIARY_KEY_PREFIX + id; }

/**
 * THE BESTIARY COUNTER. A sibling of makeGoalCounter, fed from the SAME
 * `fx.updateQuest` seam — so it cannot drift from the kills the goal model
 * and the Hero screen count, because all three read one call site.
 *
 * `record` filters to BESTIARY_EVENT and files by `meta.target`. Every other
 * type (the `kill_any` aggregate, a gather event) is a no-op by construction —
 * the same shape that made the goal model's missing handler a silent skip
 * rather than a crash. An empty/hostile target is dropped, never minted.
 */
export function makeBestiaryCounter() {
  const bag = Object.create(null);
  return {
    /* @param type  the updateQuest type — only BESTIARY_EVENT is consumed
       @param amt   kills (always 1 from resolveKill, but summed defensively)
       @param meta  the sim's `{ target: <monster_id> }` */
    record(type, amt, meta) {
      if (type !== BESTIARY_EVENT) return;
      const id = (meta && typeof meta.target === 'string') ? meta.target : null;
      const n = Math.floor(Number(amt) || 0);
      if (!id || n <= 0) return;
      bag[id] = (bag[id] || 0) + n;
    },
    counts() { return { ...bag }; },
  };
}

/**
 * Turn the bestiary counter into `progress` ops for an hr_apply delta.
 *
 * Every op is kind='stat', period='' (permanent, like ev:kill_any's lifetime
 * counter), state='active', add clamped into [1, MAX_GOAL_ADD] against the
 * SAME hr_apply ceiling the goal ops respect. An id that cannot form a legal
 * key is dropped with a receipt — fail-closed, never an unreadable row.
 *
 * ⚠ OP COUNT: a combat accrual fights a SINGLE `activeId` for the whole span,
 *   so `bag` holds exactly one key and this emits exactly one op — it cannot
 *   approach hr_apply's c_max_progress_ops (64). Asserted, not assumed, in
 *   tests/goal-counters.mjs.
 *
 * @param counter  a makeBestiaryCounter()
 * @param events   OPTIONAL sink; push({type,…}) receipts for clamp/drop.
 */
export function bestiaryProgressOps(counter, events) {
  const ops = [];
  if (!counter) return ops;
  const bag = counter.counts();
  const sink = Array.isArray(events) ? events : null;
  for (const id of Object.keys(bag).sort()) {
    if (!BESTIARY_ID_RE.test(id)) {
      if (sink) sink.push({ type: 'bestiary_bad_id', id, add: bag[id] });
      continue;
    }
    let n = bag[id];
    if (n > MAX_GOAL_ADD) {
      if (sink) sink.push({ type: 'bestiary_clamped', id, add: n, to: MAX_GOAL_ADD });
      n = MAX_GOAL_ADD;
    }
    ops.push({ kind: 'stat', key: bestiaryKey(id), period: '', add: n, state: 'active' });
  }
  return ops;
}

// ════════════════════════════════════════════════════════════════════════
// THE COLLECTION / DISCOVERY LOG — PER-ITEM LOOTED QUANTITIES
// (live-settlement Slice 2).
//
// ── WHY IT IS A SIBLING OF THE BESTIARY, NOT A KEY INSIDE IT ─────────────
// The bestiary reads the `updateQuest('kill_monster', {target})` seam — a
// KILL. The collection log reads the LOOT seam: `fx.addItem(id, qty)`, the one
// call every drop resolveKill rolls flows through (combat-sim.js resolveDrop →
// fx.addItem). It files per ITEM id, summing the quantity gained in the span,
// so an away drop and a live drop move the same row through one call site —
// the bestiary's rule, applied to loot instead of kills.
//
// ⚠ COMBAT-ONLY, DELIBERATELY, AND IT MIRRORS THE BESTIARY'S SCOPE. Slice 1
//   counts kills, which only combat produces; Slice 2 counts DROPS, which is
//   the combat `fx.addItem`. The gather and artisan `addItem` seams (a chopped
//   log, a crafted axe) are a different notion of "obtained" and are a clean
//   follow-up — extending there is a data-shaped change plus an anchor update,
//   not a new model. Keeping the scope to combat drops keeps this a faithful
//   mirror of the bestiary and leaves the gather/artisan mutation anchors
//   untouched.
//
// ── kind IS THE WRITE CAPABILITY (the artisan rule, a third time) ────────
//   kind='stat'  · additive · permanent (period_key='') · in hr_apply's
//                  allowlist. A lifetime per-item looted count is a stat: the
//                  beta wipes at cutover, so the lifetime count IS the number,
//                  with no baseline to migrate. NO MIGRATION is required to
//                  WRITE these rows — 'stat' is already legal.
//
// ── THE KEY NAMESPACE, AND WHY IT IS DISTINCT ───────────────────────────
// `ev:loot:<item_id>` extends the `ev:` convention with the ITEM id. It cannot
// collide with a goal key (`ev:kill_any`), a bestiary key (`ev:kill_monster:`)
// or the lifetime stats (`rare_drops`, `gathered`, …): the `loot:` segment is
// unique, and it is the exact string a reader can `like 'ev:loot:%'` on to pull
// the collection population out on its OWN read (hr_collection_of) rather than
// through hr_state_of's shared 1000-row envelope.
//
// ── THE VOCABULARY IS BOUND TO THE ITEM CATALOGUE, BOTH DIRECTIONS ───────
// There is no hand-maintained key list: the key is DERIVED from the item id the
// sim reports, and the sim only ever reports an id an authored drop table
// names. So the vocabulary is a subset of {ITEMS}. tests/goal-counters.mjs
// asserts every ITEMS id forms a legal, round-tripping key (charset + ≤64), and
// that the SQL projection's prefix equals COLLECTION_KEY_PREFIX — a key without
// an item, or an item whose id cannot form a key, cannot ship.
//
// ── OP COUNT, AGAINST hr_apply's c_max_progress_ops (64) ────────────────
// A combat span drops a BOUNDED number of distinct items — one monster's drop
// table, plus rare bands — realistically well under 20; the rest of the combat
// delta's progress array is ~8 ops (4 stat + ~2 goal + 1 bestiary + ≤1 recipe
// unlock), so a heavy 20-distinct-drop span sits at ~28, under the cap.
// tests/goal-counters.mjs COLLECTION-2 asserts a synthetic 20-distinct span
// stays under c_max_progress_ops, because exceeding it does NOT 409 the night —
// `progress_clamp` is on index.ts's DEGRADABLE list and would HALVE THE SPAN,
// paying half the gold and half the XP to protect a collection counter. That is
// the wrong loss, so the bound is asserted rather than assumed.
// ════════════════════════════════════════════════════════════════════════

/* The key namespace. The `loot:` segment is the whole point — see the header. */
export const COLLECTION_KEY_PREFIX = 'ev:loot:';

/* An id charset/length that keeps `COLLECTION_KEY_PREFIX + id` ≤ 64 (hr_apply's
   key ceiling): 8 + 56 = 64. Item ids are `[a-z0-9_]`, ≤24 today; this is the
   fuse if one is ever authored longer, and it fails CLOSED (the op is dropped
   with a receipt, never filed as an unreadable key). */
export const COLLECTION_ID_RE = /^[a-z0-9_]{1,56}$/;

/** The player_progress key for an item id. One expression, one reader. */
export function lootKey(id) { return COLLECTION_KEY_PREFIX + id; }

/**
 * THE COLLECTION COUNTER. A sibling of makeBestiaryCounter, fed from the
 * combat `fx.addItem` LOOT seam — so it cannot drift from the items the fight
 * actually credited, because both read one call site.
 *
 * `record` sums the quantity gained per item id. An empty/hostile id or a
 * non-positive quantity is dropped, never minted.
 */
export function makeCollectionCounter() {
  const bag = Object.create(null);
  return {
    /* @param id   the item id fx.addItem was called with
       @param amt  the quantity gained (summed across every drop in the span) */
    record(id, amt) {
      if (typeof id !== 'string' || !id) return;
      const n = Math.floor(Number(amt) || 0);
      if (n <= 0) return;
      bag[id] = (bag[id] || 0) + n;
    },
    counts() { return { ...bag }; },
  };
}

/**
 * Turn the collection counter into `progress` ops for an hr_apply delta.
 *
 * Every op is kind='stat', period='' (permanent, like the bestiary), state=
 * 'active', add clamped into [1, MAX_GOAL_ADD] against the SAME hr_apply
 * ceiling. An id that cannot form a legal key is dropped with a receipt —
 * fail-closed, never an unreadable row. One op per distinct item id.
 *
 * @param counter  a makeCollectionCounter()
 * @param events   OPTIONAL sink; push({type,…}) receipts for clamp/drop.
 */
export function collectionProgressOps(counter, events) {
  const ops = [];
  if (!counter) return ops;
  const bag = counter.counts();
  const sink = Array.isArray(events) ? events : null;
  for (const id of Object.keys(bag).sort()) {
    if (!COLLECTION_ID_RE.test(id)) {
      if (sink) sink.push({ type: 'collection_bad_id', id, add: bag[id] });
      continue;
    }
    let n = bag[id];
    if (n > MAX_GOAL_ADD) {
      if (sink) sink.push({ type: 'collection_clamped', id, add: n, to: MAX_GOAL_ADD });
      n = MAX_GOAL_ADD;
    }
    ops.push({ kind: 'stat', key: lootKey(id), period: '', add: n, state: 'active' });
  }
  return ops;
}
