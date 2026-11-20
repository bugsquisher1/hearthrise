// ════════════════════════════════════════════════════════════════════════
// src/data/chronicle.js — THE CHRONICLE: THE STORY SO FAR, ONE PAGE PER PLACE OR FIGHT, OPENED AS THE HERO GETS THERE.
//
// Tyler 2026-11-16, "Yeah build the chronicle": a lore book that fills in as you play, the Book's first tab
// (src/shell/windows/wiki.js). The story is the living-world one on the priority board (the Road North, approved 11-11,
// and its facts are canon), told page by page in the order a hero walks it. Every word is a row of
// src/data/text/chronicle.js: `title_<id>`, `teaser_<id>` (what a shut page says about itself), `page_<id>` (the
// story, paragraphs split by a blank line) and, for a page a fight opens, `opens_<id>`.
//
// A PAGE OPENS ON THE SERVER'S WORD, NEVER THE CLIENT'S (CLAUDE.md §6). `open` names what opens it:
//   { kind: 'start' }                     open from the first minute
//   { kind: 'ground', hunt }              the server has seen this hero hunt there (src/session/hunt-sections.js groundsSeenOf:
//                                         a personal best there, or its latest session), or a ground with an
//                                         exit (endsAtLevel) the server's Level has outgrown
//   { kind: 'kills', titles: [ids] }      the server counts at least one kill toward any of these titles
//                                         (src/data/titles.js; the `titles` section's own `have`)
// A rare find does not open a page: the client holds no record of a find, only of what a hero carries now, and a page
// that shut again when the item was sold would be worse than none. Display only: a page gates, spends and stores nothing.
//
// ONLY WHAT A PLAYER CAN REACH (the open grounds; tests/chronicle.mjs holds every `hunt` to OPEN_GROUNDS). A ground that
// opens later gets its page when it opens, never before.
//
// PURE ESM DATA. No functions, no DOM.
// ════════════════════════════════════════════════════════════════════════

const page = (id, open) => Object.freeze({ id, open: Object.freeze(open) });
const at = (hunt) => ({ kind: 'ground', hunt });

/* In the order the story is told: the town, the first grounds by Level, then the road north to Krell's Hold. */
export const CHRONICLE = Object.freeze([
  page('havora', { kind: 'start' }),
  page('cellar', at('mill_cellar')),
  page('thicket', at('meadowbrook_thicket')),
  page('sewer', at('millrace_sewer')),
  /* the Sewer's boss, alone in his Hall or with a party in the last room: either title counts his kills */
  page('rat_king', { kind: 'kills', titles: Object.freeze(['knotcutter', 'grate_thief']) }),
  page('wickstead', at('wickstead')),
  page('glade', at('mosslight_glade')),
  page('warrens', at('coppercap_warrens')),
  /* the road north (the Barrow March, open since v0.2.132): the Road North's own facts, approved 2026-11-11 */
  page('ford', at('hasks_ford')),
  page('slake', at('the_slake')),
  page('barrows', at('muster_barrows')),
  page('pyre', at('pyre_field')),
  page('hold', at('krells_hold')),
]);
