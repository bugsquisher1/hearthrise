// ════════════════════════════════════════════════════════════════════════
// src/data/text/share.js — SHARE PLAN'S WORDS AND THE WHAT'S NEW CARD'S (lane/wn-sh, 2026-11-26).
//
// One row per label, read by t('share.<key>'). The Share plan window (src/shell/windows/plan-share.js) speaks in LABELS, not
// sentences (Tyler 2026-11-14): "Ground: Muster Barrows", "Code damaged". The plan lines' values are the return card's own words
// (src/data/text/away.js line_*), and the stance's the Hunts window's (hunts.stance_*), so one choice reads the same everywhere.
//
// THE WHAT'S NEW CARD (src/app/whats-new.js, rows in src/data/whats-new.js): its fresh line and its lead are the one place here written
// as sentences, in Tyler's plain voice (no semicolons, em dashes or colon-joined clauses; American spelling). Its feature lines are
// labels: the glossary word the game uses, then what it means to the player (designer, lane/designer-text-1126, 2026-11-26).
// ════════════════════════════════════════════════════════════════════════

export const SHARE_TEXT = Object.freeze({
  /* the window's two halves */
  head_yours: 'Your code',
  head_paste: 'Paste a code',
  none: 'Nothing to share yet',
  copy: 'Copy',
  copied: 'Copied',
  copy_failed: 'Select the code to copy it',
  read: 'Read code',
  use: 'Use this plan',
  using: 'Saving…',
  used: Object.freeze({ one: '1 change saved', other: '{count} changes saved' }),
  nothing: 'Already your plan',
  /* the editor's rows: a part, what the code holds, and the hero's own beside it */
  part_ground: 'Ground',
  part_risk: 'Risk',
  part_wear_upgrades: 'Wear upgrades',
  part_if_one_falls: 'If one falls',
  part_build: 'Talents',
  build_points: Object.freeze({ one: '1 point', other: '{count} points' }),
  build_past: 'Past your Level',
  now: 'Now: {value}',
  now_none: 'Now: none',
  /* why a row is not sent */
  state_same: 'Same',
  state_closed: 'Not open yet',
  state_no_ground: 'Needs a ground',
  state_unread: 'Loading…',
  /* a pasted code that is refused (src/core/plan-code.js CODE_ERRORS) */
  err_code_empty: 'Paste a code first',
  err_code_long: 'Code too long',
  err_code_bad: 'Not a plan code',
  err_code_version: 'Code from another version',
  err_code_damaged: 'Code damaged',
  err_unknown_ground: 'Unknown ground',
  err_unknown_stance: 'Unknown risk',
  err_unknown_talent: 'Unknown talent',
  err_bad_build: 'Talents not connected',

  /* THE WHAT'S NEW CARD: the fresh line (a returning account only), the lead, then one label a feature */
  news_head: 'What\'s new in {version}',
  news_got_it: 'Got it',
  news_030_fresh: 'Everyone starts fresh in this version. Your old heroes did not carry over, so make a new one and jump back in.',
  news_030_lead: 'The Roads are open. Every weapon has its own country of talents now, and every hunting ground runs twenty steps deep. Your party climbs while it is winning and pulls back before it is beaten.',
  news_030_talents: 'Talents · 1 point every Level from Level 2',
  news_030_depth: 'Depth · Every ground runs from Depth 1 to 20',
  news_030_risk: 'Risk · Careful, Steady or Bold · Only Bold can die',
  news_030_recruits: 'Recruits · 3 more heroes join at Level 5',
  news_030_day: 'Hunting day · 10 hours, plus blocks from the Shop',
  news_030_share: 'Share plan · Send your whole plan as a code',
});
