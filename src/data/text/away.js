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
  your_hero: 'Your hero',
  /* Out of stamina (after-hunt.js NEXT.stamina): what uses none while it comes back. {level} the yard's first Level (src/data/training.js). */
  next_stamina: 'While your stamina comes back, {name} can work at a bench, or train at the Training Yard from Level {level}. Neither uses stamina. Start mining, chopping or fishing before you hunt, and {name} will go back to it when the hunt ends.',
  /* A training session that reached its longest run (after-hunt.js TRAIN_NEXT). */
  next_train_again: 'Training uses no stamina, so start it again to keep going.',
  /* {doing} is the server's job in words ("mining the Copper Rock", party-sections.js townActivityWords). */
  after_went: 'Then {name} went back to {doing}.',
  /* {time} is "5 h 45 min", from the hunt's end (plus the walk home) to the server's now. */
  after_waited: 'Then {name} waited in town for {time}.',
  /* The one next thing that would have filled the time, by what ended the hunt (after-hunt.js NEXT). */
  next_gather: 'Start mining, chopping or fishing before you hunt, and {name} will go back to it when the hunt ends.',
  next_longer: 'Set a longer hunt next time, up to the stamina you have.',
  next_food: 'Pack more food next time, and the hunt can run longer.',
  next_ammo: 'Pack more ammo next time, and the hunt can run longer.',
  next_runes: 'Pack more runes next time, and the hunt can run longer.',
  next_gold: 'Keep more gold on hand for the store\'s supplies, or pack your own, and the hunt can run longer.',
  /* gold_out with food or drink in the bag that no slot of the bar uses (after-hunt.js spareSupplyOf): {item} its name. */
  next_bar: '{item} was in your bag but not on your bar, so {name} bought supplies until the gold ran out. Put it on your bar next time.',

  /* WHEN THE HUNT ENDS (Tyler 2026-11-15, the itinerary; src/shell/hunt-after.js). The hunt page's one control: its heading,
     its choices ({doing} the server's job in words, {skill} a skill's name) and the line under the picked one. */
  when_ends: 'When the hunt ends',
  opt_wait: 'Wait in town',
  opt_job: 'Go back to {doing}',
  opt_train: 'Train {skill} at the yard',
  note_wait: 'Your hero stands in town until you come back.',
  note_job: 'Your hero carries on with it until you stop it.',
  /* {n} what the bench still had to make, the server's count. */
  note_job_left: 'Your hero makes the {n} it still had left to make, and no more.',
  note_no_job: 'Your hero has no job to go back to, so it waits in town. Start one before you leave and it goes back to it.',
  /* {fee} the yard's fee for an hour at this hero's skill, {hours} its longest stay; both the server's. */
  train_cost: 'The yard costs {fee} gold an hour, paid as each hour starts, for up to {hours} hours. If you can\'t pay, your hero waits in town.',
  train_level: 'The yard takes heroes from Level {level}. Until then your hero waits in town.',
  train_party: 'Training is solo. While your hero is in a party it waits in town.',
  after_hunting: 'You can change this once the hunt is over.',
  saving: 'Saving…',
  /* The running session's own plan, on the analyzer. {session} names what is running: a hunt, or a training session at the
     yard or the house dummy (a training session is a hunt session, src/data/training.js). */
  then_wait: 'After this {session} your hero waits in town.',
  then_job: 'After this {session} your hero goes back to {doing}.',
  then_job_left: 'After this {session} your hero goes back to {doing}, with {n} left to make.',
  then_train: 'After this {session} your hero trains {skill} at the yard.',
  session_hunt: 'hunt',
  session_training: 'training session',
  /* What came of the ended hunt's choice, on the summary and the away card. */
  done_pending: '{name} is on the way to the yard to train {skill}.',
  done_started: 'Then {name} went to the yard to train {skill}.',
  done_chose_wait: 'Then {name} waited in town, as you asked.',
  done_gold: '{name} couldn\'t pay the yard. An hour of {skill} costs {fee} gold and you had {purse}, so {name} waited in town.',
  done_level: 'The yard takes heroes from Level {level}, so {name} waited in town.',
  done_party: 'Training is solo and {name} is still in a party, so {name} waited in town.',
  done_no_train: '{name} couldn\'t start training {skill}, so {name} waited in town.',
});
