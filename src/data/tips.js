// ════════════════════════════════════════════════════════════════════════
// src/data/tips.js — THE "SHOW TIPS" SWITCH, AS DATA.
//
// Tyler 2026-11-11: "the 'what's next' tutorial thing should not be a mandatory
// thing, give an option to dismiss these tips and a setting in options to turn
// it back on." Settings > Interface > "Show tips" is a player switch
// (src/session/player-switch.js): one pick for every hero, kept in the residue.
// Off, the coach's cards (src/shell/launcher.js heldCard) and the town criers'
// calls in Local chat (src/shell/town-criers.js) stay quiet; "Don't show tips"
// on any card turns it off from there. The tutorial's own progress is the
// server's and never moves with it (CLAUDE.md §6): on again, the coach shows
// the card the hero is on now. Display only: it gates and spends nothing.
//
//   field      the residue field that holds the pick: { on, at }
//   defaultOn  a player who never pressed it sees the tips
//   label      the Settings row's words
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
export const TIPS = Object.freeze({
  field: 'tips',
  defaultOn: true,
  label: 'Show tips',
});
