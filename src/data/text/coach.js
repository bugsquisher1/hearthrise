// ════════════════════════════════════════════════════════════════════════
// src/data/text/coach.js — THE COACH'S FIRST TEN MINUTES (src/data/hunt-tutorial.js).
//
// One row per sentence, read by t('coach.<key>') (src/render/player-text.js).
// The cards that lead a new hero to Tamsin and back (designer 2026-11-10, the
// first ten minutes): {label} is her task's monster as her board counts it,
// {count} its kills, {ground} and {next} are hunting grounds, {level} the Level
// that opens {next}. The older cards' words still live beside their rows.
// ════════════════════════════════════════════════════════════════════════

export const COACH_TEXT = Object.freeze({
  /* every card's two presses (Tyler 2026-11-11: no tip is mandatory): Got it closes this one, Don't show tips hides them all */
  got_it: 'Got it',
  no_tips: 'Don\'t show tips',
  tamsins_rats_title: 'Tamsin\'s rats',
  tamsins_rats: 'Tamsin pays for kills. Open her tally and take the {label}. Kill {count} and she pays you gold and a helmet.',
  tamsins_rats_in: 'Press Take on the {label}. Kill {count} in the {ground} and she pays you gold and a helmet.',
  rats_count_title: 'Tamsin\'s count',
  rats_count: 'The tally on screen counts the {label} your hero kills. At {count}, Tamsin pays you in town.',
  tamsin_owes_title: 'Tamsin owes you',
  tamsin_owes: 'That\'s {count} rats. Leave the hunt and she pays you in town.',
  back_down_title: 'Back down for Level {level}',
  back_down: 'Send your hero back to the {ground}. Level {level} is about ten minutes away, and you don\'t have to watch. Close the game. Your hero keeps hunting.',
  back_down_in: 'Press the {ground}, then Enter. You don\'t have to watch. Close the game and your hero keeps hunting.',
  keep_hunting: 'You don\'t have to watch. Close the game and your hero keeps hunting. Level {level} is about ten minutes away, and that\'s when you\'re ready for {next}. Everything it earns will be waiting for you.',
});
