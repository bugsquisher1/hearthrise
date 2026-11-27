// ════════════════════════════════════════════════════════════════════════
// src/data/text/work.js — THE GATHERING AND CRAFTING WINDOW'S WORDS (src/shell/windows/work.js).
//
// One row per sentence or label, read by t('work.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the Sort menu over a crafting station's recipes
// (src/shell/station-sort.js; Andy, Discord 2026-11-11).
// ════════════════════════════════════════════════════════════════════════

export const WORK_TEXT = Object.freeze({
  /* The menu's label, and its three orders: what the bag can make first (the default), the required level low to high, the name A to Z. */
  sort_can: 'Can make',
  sort_level: 'Level',
  sort_name: 'Name',
  /* The bag's line for a counted bench run (src/shell/town-work.js runParts byRun): what the run has to go, never the stock behind it
     ("Fueling the Great Hearth with Bones: 1 to go" for one Bone fed, live v0.2.135 read "2,529 Bones left"). */
  run_to_go: '{n} to go',
  /* THE WORK LINE OVER THE ROWS (src/shell/town-work.js nowParts): a counted run says its own count, never the stock behind it (Andy
     2026-11-18: a run of 300 read "8,300 Blank Rune left. Stops when materials run out"). The server's count left, of the run's whole
     count when the server sends its tally; the stop sentence only where the bag and Storage stop it, or the job runs until stopped. */
  now_left_of: '{n} of {count} left',
  now_left: '{n} left',
  now_stops_out: 'Stops when materials run out',
  now_gather: 'Runs offline until a hunt starts',
  /* A JOB'S COUNT AND ITS "THEN" (1026-job-counts.sql, plan L08): the line's end for a counted job, the how line over a gathering
     skill's rows, and the control that picks what the hero does when the count is done (one pick for the window, Wait by default). */
  now_then_wait: 'Then waits in town',
  use_gather: 'Runs offline until done',
  count_label: 'How many',
  then_label: 'When it is done',
  then_wait: 'Wait in town',
  /* THE COMPANY'S TRADES AND THE HERO'S WORK DAY (1059-company-trades.sql; Tyler 2026-11-22): the ledger's Levels are the company's,
     and each hero's town work stops for the day at its cap (the `work_day` section, as of the server's last settle). */
  company_trades: 'Trade Levels shared by all heroes',
  day_left: 'Town work left today: {left} of {cap}',
  day_done: 'No town work left today · Resets 00:00 UTC',
  /* A BOUGHT BLOCK OF TOWN WORK (1071-work-blocks.sql, the `time_blocks` section's `work`): 2 h more today, dearer each time, 4 a day,
     sold only while today can still use it whole. And the "buy daily" rule beside it (and beside the hunting block in Services). */
  block_quote: '+{hours} today for {price} · Blocks today: {n} of {max} · Price rises per block',
  block_quote_short: '+{hours} today for {price} · Need {short} more · Blocks today: {n} of {max}',
  block_used: 'All {max} work blocks bought today · Resets 00:00 UTC',
  block_day_ending: 'Not enough of today left for a work block · Resets 00:00 UTC',
  block_buy: 'Buy +{hours} for {price}',
  block_buy_off: 'Buy work time',
  block_confirm_label: 'Confirm the work time purchase',
  block_ask: 'Buy {hours} more town work today for {price}?',
  block_yes: 'Buy for {price}',
  block_buying: 'Buying work time…',
  block_done: 'Work time added',
  rule_label: 'Buy daily',
  rule_off: 'Off',
  rule_bought: 'Bought today: {n}',
  rule_setting: 'Saving…',
  rule_on: 'Buys up to {n} a day',
  rule_off_done: 'Daily buying off',
  /* THE LINE WHEN A BENCH RUN FINISHES IN VIEW (src/shell/town-news.js; QA audit 2026-11-18 A17: "Fuel all" ended with no word): what it
     made or burned, the server's count, then the skill's level as a label. */
  done_made: '{name}: made {count} {item}',
  /* ...a run whose crafts can burn or roll grades (Cooking, jewelry): the run's tally counts crafts, so no number is said */
  done_run: '{name}: {item} done',
  done_fuel: '{name}: {count} {item} burned in the Great Hearth',
  done_level: '{skill} {level}',
  /* A skill ledger's unlock line (src/shell/windows/skills.js unlockLine, the Character sheet's combat skills too): the first thing
     the next level opens, and how many more it opens (all of them, with their kinds, are the line's tooltip). */
  skill_next: 'Lv {level}: {name}',
  skill_more: '+{count} more',
  /* A recipe or node row (src/shell/windows/work.js): the Level it needs by Start, one line of numbers, and how many the bag and Storage
     cover. Who won't buy what it makes is a short tag on the numbers line, its sentence (text/item.js) on the pointer. */
  row_level: 'Lv {level}',
  row_time_xp: '{secs} s · {xp} XP',
  row_per_hour: 'about {n} an hour',
  row_burn: 'burns up to {pct}%',
  row_makes: 'Makes up to {n}',
  row_makes_of: 'Makes {n} of up to {max}',
  sale_shop: 'Shop only',
  sale_none: 'Can\'t be sold',
  /* What a row makes against what the hero wears (src/shell/bench-output.js; itemization audit 2026-11-18 #1): its stats, each with its
     change against the piece in its slot, then which piece that is, or that it changes nothing, the slot is bare, or it is worn now. */
  is_vs: 'vs {worn}',
  is_same: 'Same as {worn}',
  is_worn: 'Worn now',
  is_empty: 'Empty {slot} slot',
  /* The station's whole ladder past the rows in full: one rung a Level, what it opens. */
  ladder_head: 'Unlocks',
  /* A rolled job's odds before the roll (src/shell/windows/work.js oddsWords; src/data/jewelry.js): the grade at the hero's server level
     in the job's own skill, the perks it may roll, and what a boss drop set in place of the gem always gives. */
  odds_at: 'Odds at {skill} {level}: {grade} · {perks} · No bench fee',
  odds_plain: 'Fine {fine}, Hallmarked {hallmarked}, otherwise plain',
  odds_fine: 'Hallmarked {hallmarked}, otherwise Fine',
  odds_sealed: 'always Hallmarked',
  odds_perks: 'Perks: {perks}',
  odds_second: 'Second perk: {perks}',
  odds_or: '{list} or {last}',
  odds_always: 'Always {perk} · {rest}',
  /* The bench fee the picked count takes before Start (src/shell/bench-fee.js feeLineWords), with its share of the purse from 10% up. */
  fee_all: '{gold} gold for all {n}',
  fee_n: '{gold} gold for {n}',
  fee_share: '({pct}% of your gold)',
  /* THE JOBS LIST (lane/k1-job-slice, 1073-k1-job-slice.sql; src/shell/windows/work-jobs.js): one recipe worked for a whole work day,
     every number the server's quote. The running job's line, its two presses, a row's quote and why a row is shut. */
  jobs_head: 'Jobs',
  job_now: '{name}: {count} · {left} left',
  job_due: '{name}: done',
  job_collect: 'Collect',
  job_stop: 'Stop',
  job_start: 'Start',
  job_quote: '{count} for {fee} · {hours}',
  job_quote_free: '{count} · {hours}',
  job_needs: 'Requires {trade} {level}',
  job_band: 'Hunt a ground of this metal first',
  job_short: 'Not enough materials',
  job_day_used: 'No town work left today',
  job_shut: 'Not open yet',
  job_inputs: 'Uses {list} each',
  job_last: 'Last job: {made} {name} · +{xp} {trade} XP',
  job_last_fine: '{n} Fine',
  job_last_master: '{n} Master',
  job_starting: 'Starting…',
  job_started: 'Job started',
  job_collecting: 'Collecting…',
  job_collected: 'Collected',
  job_stopping: 'Stopping…',
  job_stopped: 'Stopped, materials returned',
});
