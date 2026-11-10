// ════════════════════════════════════════════════════════════════════════
// src/data/titles.js — WHAT A HERO CAN BE CALLED, AND WHAT IT TAKES (data; the source of truth).
//
// Tyler 2026-11-04: titles are a gold sink, "gold unlocks only after the kills are earned". The designer's sample of five (priority
// board, "2026-11-04 Gold sinks"; CLAUDE.md §10: more rows only after this is played). Each name is a trade or a thing from that
// creature: a wolfer hunted wolves, a gamekeeper catches poachers, the King is a knot of tails, the goblins wear stolen pots.
//
// Change a row here, then `node tools/gen-title-catalogue.mjs` regenerates the server's copy (hr_titles); its --check fails a stale
// one. The server counts the kills and re-quotes the price; a press never carries either as a fact.
//
// THE ROW (keyed by the server's title id; the object's order is the order the window lists them):
//   name      the title by itself, in a sentence: "Wolfer takes 5,000 wolves."
//   words     what stands beside a hero's name: "Marlow the Wolfer". A catalogue's words, never a player's text
//   price     the gold to claim it once the kills are earned. 0 is allowed (a title that is itself a prize)
//   kills     how many of `monsters` this hero must have felled
//   monsters  the monster ids whose `ev:kill_monster:<id>` counters are summed, per hero
//   label     the locked row's count: "Wolves: 3,214 of 5,000"
//   noun      the same in a sentence
//
// THIS FILE STAYS OUT OF THE hr-accrue BUNDLE: nothing under src/core or the edge imports it, so a new title never moves the edge hash.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

/** A title's words as the client accepts them, and as the server's check on hr_titles has them (the chat line and the town label refuse anything else). */
export const TITLE_WORDS = /^[A-Za-z][A-Za-z' -]{0,39}$/;

export const TITLES = Object.freeze({
  ratcatcher: Object.freeze({
    name: 'Ratcatcher', words: 'the Ratcatcher', price: 1500, kills: 2500,
    monsters: Object.freeze(['rat', 'drain_rat', 'granary_rat']), label: 'Rats', noun: 'rats',
  }),
  wolfer: Object.freeze({
    name: 'Wolfslayer', words: 'the Wolfslayer', price: 3000, kills: 5000,
    monsters: Object.freeze(['gray_wolf', 'gray_whelp', 'briarcoat_wolf', 'dire_gray', 'grayjaw']), label: 'Wolves', noun: 'wolves',
  }),
  gamekeeper: Object.freeze({
    name: 'Warden', words: 'the Warden', price: 10000, kills: 2500,
    monsters: Object.freeze(['glade_poacher', 'rook_poacher']), label: 'Poachers', noun: 'poachers',
  }),
  knotcutter: Object.freeze({
    name: 'Crownbreaker', words: 'the Crownbreaker', price: 25000, kills: 250,
    monsters: Object.freeze(['rat_king']), label: 'Rat Kings', noun: 'Rat Kings',
  }),
  potbreaker: Object.freeze({
    name: 'Potbreaker', words: 'the Potbreaker', price: 40000, kills: 10000,
    monsters: Object.freeze(['goblin_scavenger', 'goblin_digger', 'goblin_skulker', 'hobgoblin_foreman']), label: 'Goblins', noun: 'goblins',
  }),
  /* THE PRIZES OF CALL OUT (src/data/boss-calls.js; Tyler 2026-11-04), price 0: the same whatever the dice say, and nothing tradeable. The King's crown is hammered from drain grates; the Chief wears his cauldron. */
  grate_thief: Object.freeze({
    name: 'Sewerlord', words: 'the Sewerlord', price: 0, kills: 1,
    monsters: Object.freeze(['rat_king_called']), label: 'Rat King called out and felled', noun: 'Rat King called out and felled',
  }),
  cauldron_thief: Object.freeze({
    name: 'Slagbreaker', words: 'the Slagbreaker', price: 0, kills: 1,
    monsters: Object.freeze(['chief_coppercap_called']), label: 'Chief Coppercap called out and felled', noun: 'Chief Coppercap called out and felled',
  }),
});
