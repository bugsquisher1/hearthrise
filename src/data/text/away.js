// ════════════════════════════════════════════════════════════════════════
// src/data/text/away.js — WHAT A HERO DID AFTER ITS HUNT ENDED, AND WHAT WOULD HAVE FILLED THE TIME
// (src/shell/after-hunt.js: the away card and the hunt summary's reason line).
//
// One row per sentence, read by t('away.<key>'). Every fact behind a row is the server's: the hunt's end
// reason and time, and the hero's activity pointer (player_state.active_kind / active_id / active_since).
// An automatic end sends the hero back to its last gathering job (src/data/hunt-sessions.js RESUME_AFTER_END), so the
// gathering line is true after every one of them. A bench that was running goes back too, but only for the count it
// had left when the hunt started (2027-04-24-bench-resume.sql), so it is gathering that fills a night.
// ════════════════════════════════════════════════════════════════════════

export const AWAY_TEXT = Object.freeze({
  /* {name} when the server has not sent the hero's name yet. */
  your_hero: 'Hero',
  /* Out of stamina (after-hunt.js NEXT.stamina): what uses none while it comes back. {level} the yard's first Level (src/data/training.js). */
  next_stamina: 'While stamina refills: work a bench or train at the Yard',
  /* A training session that reached its longest run (after-hunt.js TRAIN_NEXT). */
  next_train_again: 'Start training again to keep going',
  /* A span over two days (after-hunt.js spanWords): whole days, rounded down. */
  span_days: { one: '{count} day', other: '{count} days' },
  /* THE AWAY CARD (away-recap.js, away-work.js), one sentence a fact (QA audit 2026-11-18 N6: "Away 176 h 2 min: Wren hunted ...: Level 5 to 10"
     ran three clauses together on colons). {time} "2 h 5 min" or "7 days"; {who} what the hero did ("Wren hunted Mill Cellar"); {facts} the
     server's differences, "Level 5 to 10, +1,200 Level XP, 40 kills". */
  card_head: 'Away {time}. {who}.',
  card_facts: '{facts}.',
  card_hunted: '{name} hunted {ground}',
  /* ...when the yard took over from a hunt whose ground neither the stamp nor a death row names (a stamp from an older build) */
  card_hunted_off: '{name} went hunting',
  /* how long ago the hunt ended ({time}), or that it has with no time said */
  card_ended_ago: 'The hunt ended {time} ago.',
  card_ended: 'The hunt has ended.',
  /* A town job's line on the card, after the card's own head ({who} "Tess mined the Copper Rock", {facts} what it made and where it stands). */
  card_work: '{who}. {facts}',
  /* THE WHILE YOU WERE AWAY CARD (src/shell/windows/away.js, UI audit 2026-11-18 #2): its head, each hero's labels and the line under the figures. */
  card_gone: 'Away {time}',
  card_best: 'Best find',
  card_still: 'Still hunting',
  card_still_stamina: 'Still hunting, {time} of stamina left',
  card_ended_when: 'Ended {time} ago',
  card_stamina: 'Stamina {time}',
  card_summary: 'Hunt summary',
  card_ok: 'OK',
  /* Under the Gold figure, which is what the purse kept (QA audit 2026-11-18 A6): {looted} the coins, {paid} the store's supplies. */
  card_gold_both: '{looted} in coins, {paid} on supplies',
  card_gold_looted: '{looted} in coins',
  /* ...and when the yard took over from the hunt (post-140 audit C3: the card said +29,219 while the purse moved +25,925), {yard} what the yard billed. */
  card_gold_yard_both: '{looted} in coins, {paid} on supplies, {yard} at the yard',
  card_gold_yard: '{looted} in coins, {yard} at the yard',
  /* A hero still training: its door is the Training window (a training session is no hunt, Tyler 2026-11-16). */
  card_training: 'Open Training',
  /* {doing} is the server's job in words ("mining the Copper Rock", party-sections.js townActivityWords). */
  after_went: 'Then {name} went back to {doing}.',
  /* {time} is "5 h 45 min", from the hunt's end (plus the walk home) to the server's now. */
  after_waited: 'Then {name} waited in town for {time}.',
  /* The one next thing that would have filled the time, by what ended the hunt (after-hunt.js NEXT). */
  /* Any other automatic end: what comes next is the hunt page's own control (Tyler 2026-11-15, the itinerary). */
  next_gather: 'Tip: under When the hunt ends, pick a job or the yard',
  /* A party end the hero's own box chose (party_member_left / party_member_died; Tyler 2026-10-22, on by default): it names the box by
     the party panel's own label, src/data/party.js PARTY_COPY.leaveTogether, word for word (shell-core R3p). */
  next_party: 'Party: to keep hunting when someone leaves, uncheck Leave if anyone leaves the hunt or dies',
  next_longer: 'Set a longer hunt, up to the stamina left',
  next_food: 'Pack more food for a longer hunt.',
  next_ammo: 'Pack more ammo for a longer hunt.',
  next_runes: 'Pack more runes for a longer hunt.',
  next_gold: 'Lower the gold reserve or pack your own supplies',
  /* gold_out with food or drink in the bag that no slot of the bar uses (after-hunt.js spareSupplyOf): {item} its name. */
  next_bar: 'Tip: put {item} on the bar',

  /* WHEN THE HUNT ENDS (Tyler 2026-11-15, the itinerary; src/shell/hunt-after.js). The hunt page's one control: its heading,
     its choices ({doing} the server's job in words, {skill} a skill's name) and the line under the picked one. */
  when_ends: 'When the hunt ends',
  opt_wait: 'Wait in town',
  opt_job: 'Go back to {doing}',
  opt_train: 'Train {skill} at the yard',
  note_wait: 'Waits in town',
  note_job: 'Works until stopped',
  /* {n} what the bench still had to make, the server's count. */
  note_job_left: 'Makes the last {n}',
  note_no_job: 'Waits in town (no job to resume)',
  /* {fee} the yard's fee for an hour at this hero's skill, {hours} its longest stay; both the server's. Each hour is billed whole at its
     start (src/data/training.js; Tyler 2026-11-08, 11-15): the Training window's own label (post-140 audit C13). */
  train_cost: '{fee} gp/h, paid hourly in advance · up to {hours} h · Out of gold: waits in town',
  train_level: 'Yard from Level {level}',
  train_party: 'Training is solo',
  after_hunting: 'Change this after the hunt',
  saving: 'Saving…',
  /* The running session's own plan, on the analyzer: a label (Tyler 2026-11-14), the same for a hunt and a training session. */
  then_wait: 'Then: wait in town',
  then_job: 'Then: back to {doing}',
  then_job_left: 'Then: back to {doing} ({n} left)',
  then_train: 'Then: train {skill} at the yard',
  /* What came of the ended hunt's choice, on the summary and the away card. */
  done_pending: '{name} is on the way to the yard to train {skill}.',
  done_started: 'Then {name} went to the yard to train {skill}.',
  done_chose_wait: 'Then {name} waited in town',
  done_gold: '{name} waited in town · Yard: {fee} gp/h',
  done_gold_purse: '{name} waited in town · Yard: {fee} gp/h · Gold: {purse}',
  done_level: '{name} waited in town: the yard requires Level {level}',
  done_party: '{name} waited in town: training is solo',
  done_no_train: '{name} couldn\'t train {skill} and waited in town',
});
