// ════════════════════════════════════════════════════════════════════════
// src/data/progress-surfaces.js — EVERY PROGRESS TRACKER, AND WHERE IT LIVES.
//
// Lane daily-board (game-designer, 2026-10-11). The whole-game review found ~20
// trackers and a first hour that "reads as a dashboard, not a game". This is the
// ruling as data: each tracker is KEEP (where it is), FOLD (into another screen)
// or HIDE (off Home until the realm's own count says it is relevant).
//
// `home` marks the surfaces Home may draw in the first hour; tests/daily-board.mjs
// holds that set to at most FIRST_HOUR_CAP. A HIDE row's `reveal` is read by
// src/features/progress-surfaces.js from SERVER numbers only, and an unknown
// number keeps the surface hidden (fail-safe: a missing card, never a wrong one).
// Client-only display data: never edge-imported.
// ════════════════════════════════════════════════════════════════════════

export const FIRST_HOUR_CAP = 5;

const row = (id, decision, where, home, reveal = null) => Object.freeze({ id, decision, where, home, reveal });

export const PROGRESS_SURFACES = Object.freeze([
  row('daily_board', 'KEEP', 'Home "Next up" and the topbar Quests strip: one board of three, one claim', true),
  row('first_day_chain', 'KEEP', 'Home, above "Next up"; the Journeyman\'s Road follows it, one card at a time', true),
  row('renown', 'KEEP', 'Home "Rise to the throne": the long spine', true),
  row('daily_login', 'KEEP', 'Home, only while a reward is waiting', true),
  row('collection', 'KEEP', 'Home Upkeep row; the Collection Log holds Bestiary, Items and Deeds', true),
  row('daily_tasks', 'FOLD', 'Retired into the daily board (hr_claim_daily revoked)', false),
  row('weekly_goals', 'KEEP', 'Quests modal, Weekly tab', false),
  row('this_week', 'FOLD', 'Quests modal, Weekly tab aside ("Your week")', false),
  row('deeds', 'FOLD', 'Collection Log, Deeds tab (every earned deed stays graded on the realm\'s counts)', false),
  row('journeymans_road', 'KEEP', 'Home chain card once First Light is done', false),
  row('charms', 'KEEP', 'Bestiary and the Fight rail', false),
  row('hunters_ledger', 'HIDE', 'Home card from the hundredth kill; the Fight rail always', false,
    Object.freeze({ kind: 'lifetime', key: 'kills', at: 100 })),
  row('climb_marks', 'KEEP', 'Level moments only (25/50/75/92/99), recorded in the Chronicle', false),
  row('trophies', 'KEEP', 'Bestiary', false),
  row('lifetime_tally', 'KEEP', 'Character, Lifetime Stats (pull only)', false),
  row('chronicle', 'KEEP', 'The bell (pull only)', false),
  row('standings', 'HIDE', 'Home card from total level 100; the Social board always', false,
    Object.freeze({ kind: 'totalLevel', at: 100 })),
  row('boss_of_the_day', 'KEEP', 'Combat War Table, behind its own Combat-level lock', false),
  row('muster', 'KEEP', 'Events, behind the clan launch', false),
]);
