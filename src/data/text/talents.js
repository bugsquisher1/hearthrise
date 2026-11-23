// ════════════════════════════════════════════════════════════════════════
// src/data/text/talents.js — THE TALENTS TAB'S WORDS (src/shell/windows/character/talents.js, the Roads sample's card).
//
// One row per label, read by t('talents.<key>'). LABELS, NOT SENTENCES (Tyler 2026-11-14): genre-standard label and value
// ("Points: 11", "Next Fork: Mend, Crossroads I"), never an explanation and never "you". Every number is the server's (the `talents`
// section). The options' own names and tips are the Roads' data (src/data/talents.js), not words of this tab.
// ════════════════════════════════════════════════════════════════════════

export const TALENTS_TEXT = Object.freeze({
  tab: 'Talents',
  /* the points line: the server's points less its spent ones */
  points: 'Points: {count}',
  points_none: 'Points: 0',
  /* the next fork on the suggested road, named by its move ("Mend, Crossroads I") */
  fork: 'Next Fork: {move}{node}',
  fork_move: '{move}, ',
  /* how far the fork is: the points still to spend on the way, itself included */
  fork_next: 'Next point',
  fork_away: '{count} points away',
  suggested: '{name} (Suggested)',
  take: 'Take',
  spend_suggested: 'Spend as suggested',
  /* why Spend as suggested and Take are off (tests/say-why.mjs SW-2): no point left to spend */
  no_points: 'No points',
  /* the busy and done lines of a press */
  spending: 'Spending…',
  taking: 'Taking…',
  spent_one: '1 point spent',
  spent_many: '{count} points spent',
  taken: 'Taken',
});
