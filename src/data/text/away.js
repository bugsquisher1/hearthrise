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
  /* {doing} is the server's job in words ("mining the Copper Rock", party-sections.js townActivityWords). */
  after_went: 'Then {name} went back to {doing}.',
  /* {time} is "5 h 45 min", from the hunt's end (plus the walk home) to the server's now. */
  after_waited: 'Then {name} waited in town for {time}.',
  /* The one next thing that would have filled the time, by what ended the hunt (after-hunt.js NEXT). */
  next_gather: 'Start a gathering job before a hunt to resume it after',
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
  /* {fee} the yard's fee for an hour at this hero's skill, {hours} its longest stay; both the server's. */
  train_cost: '{fee} gold/h, up to {hours} h',
  train_level: 'Yard from Level {level}',
  train_party: 'Training is solo',
  after_hunting: 'Change this after the hunt',
  saving: 'Saving…',
  /* The running session's own plan, on the analyzer. {session} names what is running: a hunt, or a training session at the
     yard or the house dummy (a training session is a hunt session, src/data/training.js). */
  then_wait: 'After this {session}: wait in town',
  then_job: 'After this {session}: back to {doing}',
  then_job_left: 'After this {session}: back to {doing}, {n} left',
  then_train: 'After this {session}: train {skill} at the yard',
  session_hunt: 'hunt',
  session_training: 'training session',
  /* What came of the ended hunt's choice, on the summary and the away card. */
  done_pending: '{name} is on the way to the yard to train {skill}.',
  done_started: 'Then {name} went to the yard to train {skill}.',
  done_chose_wait: 'Then {name} waited in town',
  done_gold: '{name} waited in town: not enough gold to train {skill}',
  done_level: '{name} waited in town: the yard requires Level {level}',
  done_party: '{name} waited in town: training is solo',
  done_no_train: '{name} couldn\'t train {skill} and waited in town',
});
