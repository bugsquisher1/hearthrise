// ════════════════════════════════════════════════════════════════════════
// src/data/text/criers.js — WHAT THE TOWN CRIERS CALL OUT (src/data/town-criers.js).
//
// Two rows per line, read by t('criers.say_<id>') and t('criers.go_<id>'):
// `say_` is one person talking to the hero in Local chat about something the
// hero hasn't done yet; `go_` is the short link under it that opens the place
// (src/shell/goto.js). {label}, {count} and {ground} are Tamsin's own task as
// the server counts it.
// ════════════════════════════════════════════════════════════════════════

export const CRIERS_TEXT = Object.freeze({
  /* the Town Crier at the gate */
  say_gate: 'Hunts are at the gate. Pick one and your hero walks out and fights on its own. You don\'t have to watch.',
  go_gate: 'Open Hunts',
  say_blessing: 'Dying costs you XP. A Blessing keeps most of it. The Shop sells them under Services.',
  go_blessing: 'Open Services',
  say_storage: 'Bag getting full? Storage holds the rest, and every hero on your account can take from it.',
  go_storage: 'Open Storage',
  /* the smith at the forges */
  say_temper: 'That gear of yours isn\'t tempered. Bring it to me under Services at the Shop and I\'ll make it hit harder and hold up better.',
  go_temper: 'Open Services',
  /* Tamsin Reeve at her board */
  say_board: 'Click on my board and see what I need help with. The jobs pay gold, and some pay armor.',
  go_board: 'Open my board',
  say_owe: 'I\'m still waiting on {count} {label} from you. You\'ll find them in the {ground}.',
  go_owe: 'Open the {ground}',
});
