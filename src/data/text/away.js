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
});
