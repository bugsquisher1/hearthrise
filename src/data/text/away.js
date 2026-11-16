// ════════════════════════════════════════════════════════════════════════
// src/data/text/away.js — WHAT A HERO DID AFTER ITS HUNT ENDED, AND WHAT WOULD HAVE FILLED THE TIME
// (src/shell/after-hunt.js: the away card and the hunt summary's reason line).
//
// One row per sentence, read by t('away.<key>'). Every fact behind a row is the server's: the hunt's end
// reason and time, and the hero's activity pointer (player_state.active_kind / active_id / active_since).
// An automatic end sends the hero back to its last gathering job (src/data/hunt-sessions.js RESUME_AFTER_END,
// hr_resume_has_inputs: a bench is never resumed), so the gathering line is true after every one of them.
// ════════════════════════════════════════════════════════════════════════

export const AWAY_TEXT = Object.freeze({
  /* {name} when the server has not sent the hero's name yet. */
  your_hero: 'Your hero',
  /* Out of stamina (after-hunt.js NEXT.stamina): what uses none while it comes back. {level} the yard's first Level (src/data/training.js). */
  next_stamina: 'Stamina refilling: work a bench or train at the Yard (Level {level}+)',
  /* A training session that reached its longest run (after-hunt.js TRAIN_NEXT). */
  next_train_again: 'Training uses no stamina, so start it again to keep going.',
  /* {doing} is the server's job in words ("mining the Copper Rock", party-sections.js townActivityWords). */
  after_went: 'Then {name} went back to {doing}.',
  /* {time} is "5 h 45 min", from the hunt's end (plus the walk home) to the server's now. */
  after_waited: 'Then {name} waited in town for {time}.',
  /* The one next thing that would have filled the time, by what ended the hunt (after-hunt.js NEXT). */
  next_gather: 'Start mining, chopping or fishing before a hunt to resume it after.',
  next_longer: 'Set a longer hunt, up to your stamina.',
  next_food: 'Pack more food for a longer hunt.',
  next_ammo: 'Pack more ammo for a longer hunt.',
  next_runes: 'Pack more runes for a longer hunt.',
  next_gold: 'Lower your gold reserve, carry more gold, or pack your own supplies.',
  /* gold_out with food or drink in the bag that no slot of the bar uses (after-hunt.js spareSupplyOf): {item} its name. */
  next_bar: 'Tip: put {item} on your bar ({name} bought store supplies instead)',
});
