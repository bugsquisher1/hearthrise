// ════════════════════════════════════════════════════════════════════════
// src/data/live-events.js — THE CALENDAR: TIMED WORLD EVENTS WRITTEN AS ROWS ON THE SERVER CLOCK (Tyler 2026-11-07 approved "live events
// from data"; the 28 day cycle and the Hearthrise are the designer's ruling D-7, docs/design/overhaul/review/06-designer-rulings-w1.md
// section 1, built by lane/c-social, FB-12).
//
// THE ONE HOME of every event: what a type may move (one permille dial, its range, how two live rows of it combine, what its scope names),
// when each event runs (an offset in days from CALENDAR_ANCHOR, its hours, how often it comes back, until when) and the words it says.
// tools/gen-live-events.mjs writes the server's catalogue from here (hr_live_event_types, hr_live_events, and the Hearthrise's fire rule
// hr_hearth_fire_rule from src/data/hearth.js) and its --check holds them equal. Nothing under src/core imports this file, so adding or
// moving an event never moves the edge: the settle reads the server's rows (hr_live_xp_windows) and the engine only multiplies by what it
// is handed (src/core/live-events.js).
//
// THE RULES (designer, binding): an event moves a permille of something the server already computes (Level XP a kill), never gold into
// a purse, never coin, drops, rares, skill XP or the death loss. No event over +25% and never two at once (27-5). Two live rows of one
// dial combine by the type's `stack` and the type's `range` caps the result. A switch arms each type (hr_feature_switches: off, accounts,
// testers, everyone): an event is live for an account only when its window holds the server instant AND hr_feature_on(type switch,
// account). The curve and every balance guard are fit with no event (the sim never sets an event), so missing one costs nothing.
//
// THE CYCLE (D-7 section 1.1): 28 days, four weekends, each Friday 12:00 to Monday 12:00 UTC. Weekend 1 the Hearthrise, weekend 3 a
// world boss, weekends 2 and 4 quiet until the ground weekend and the arena season are built. Later systems take an empty slot and never
// move a live row. Open Halls is retired: Call out has cost no gold since 2026-11-20 (src/data/boss-calls.js), so it waived nothing.
//
// THE HEARTHRISE'S SIZE is never typed here: `pm: 'fire'` says the server reads it from the Great Hearth's fire once, at the instant it
// lights (+10% on an empty fire, +3% a mark, +25% at five marks; src/data/hearth.js HEARTHRISE_FIRE). The catalogue stores the floor.
//
// THE WORDS: plain English, no semicolons, no dashes, no colon-joined clauses, XP is earned. `{pct}` is the dial as a percent (1250 reads
// 25), `{start}`, `{end}` and `{next}` are server instants. The client shows them in the player's local time; the System lines the server
// writes itself (start, end) name the time in UTC, since a chat line can't know the reader's clock.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* THE ANCHOR (D-7 section 1.2): one instant every row is an offset from, the first Friday 12:00 UTC at least 7 days after the release
   window applies. THE COORDINATOR SETS IT IN THE RELEASE COMMIT and regenerates the catalogue (node tools/gen-live-events.mjs): moving
   the calendar is one new generated file, never a hand edit of the server's rows. The value below is a placeholder Friday. */
export const CALENDAR_ANCHOR = '2027-01-01T12:00:00Z';

/* WHAT A TYPE MAY MOVE: one dial a type, a permille, its range, how two live rows of it combine, what its scope may name. A type with no
   dial (`dial: null`) moves no number: it only opens something on its window, and the generator takes one only when it names a boss. */
export const LIVE_EVENT_TYPES = Object.freeze({
  xp_bonus: Object.freeze({
    switch: 'event_xp_bonus',            // the hr_feature_switches row that arms it: off = nobody, then testers, then everyone
    dial: 'xpPm',                        // Level XP a kill, per hero (xp-share.js xpMultOf, at the kill's own combat time)
    range: Object.freeze([1100, 1250]),  // the Hearthrise's floor (+10%, CE-8) to the ruled ceiling (+25%, 27-5)
    stack: 'add',                        // two live rows add, then the range caps them (never two at once by the cycle)
    scope: 'grounds',                    // 'world' or ground ids
  }),
  /* A WORLD BOSS STANDS (D-7; FB-13 reads it): the window opens the boss room and moves no number. Its switch is FB-13's: off until the
     boss ships, so the calendar names him only once he can be fought. */
  world_boss: Object.freeze({
    switch: 'event_world_boss',
    dial: null,
    range: null,
    stack: null,
    scope: 'world',
  }),
});

/* THE WORDS, one set an event. `name`, `start` and `end` are the server's too (the generated catalogue); the rest only the client reads
   (src/shell/live-events-view.js): `soon` and `on` the plate's tooltip, `chip` the plate, `hunts` a Hunts line, `page` the ground's page,
   `analyzer` the Analyzer's row. The designer's exact words (D-7 section 1.5, D-6 section 2.7). `start` and `end` are the SERVER'S
   announcer lines. */
export const WORDS = Object.freeze({
  hearthrise: Object.freeze({
    name: 'Hearthrise',
    soon: 'Hearthrise starts {start}',
    on: '+{pct}% Level XP on every hunt until {end}',
    chip: '+{pct}% Level XP',
    start: 'Hearthrise: +{pct}% Level XP until {end}',
    end: 'Hearthrise over. Next: {next}',
    hunts: '+{pct}% Level XP this weekend',
    page: '+{pct}% Level XP this weekend',
    analyzer: 'Hearthrise',
    /* the town banner on the Friday, and the release note's line (the Coordinator's) */
    banner: 'The Hearthrise is lit. +{pct}% Level XP until {end}.',
  }),
  mossback: Object.freeze({
    name: 'Mossback',
    soon: 'Mossback comes to the Mill Pond {start}',
    on: 'Mossback is at the Mill Pond until {end}',
    chip: 'Mossback',
    start: 'Mossback is at the Mill Pond until {end}',
    end: 'Mossback went back up the brook. Next: {next}',
  }),
});

/* WHEN THE PLATE SHOWS (display only, the mocks' decision, .claude/coordination/mocks/2026-11-10/SPEC.md §2): an event on now, or
   starting within `soonMs`; its last `endingMs` counts down. The server lists one cycle ahead (the Week card's "Next" line reads it), so
   the plate keeps to a day. Neither moves a number: every window is the server's. */
export const LIVE_EVENT_SHOWN = Object.freeze({ soonMs: 24 * 3600000, endingMs: 3600000 });

/* THE SCHEDULE (D-7 section 1.2): a window starts `offsetDays` after CALENDAR_ANCHOR and lasts `hours`. With `everyDays` it starts again
   that many days after each start, until `until` (null: for good). Mossback stands from the anchor (his pool is sized by weekly active
   accounts with a floor, so he works on day one); the fire needs time to fill, so the first Hearthrise comes two weeks after him. */
export const LIVE_EVENTS = Object.freeze({
  hearthrise: Object.freeze({ type: 'xp_bonus', pm: 'fire', scope: 'world',
    offsetDays: 14, hours: 72, everyDays: 28, until: null, words: WORDS.hearthrise }),
  mossback: Object.freeze({ type: 'world_boss', boss: 'mossback', scope: 'world',
    offsetDays: 0, hours: 72, everyDays: 28, until: null, words: WORDS.mossback }),
});

/** The UTC instant (ISO) a row's first window starts: the anchor plus its offset in days. */
export function firstOf(row) {
  return new Date(Date.parse(CALENDAR_ANCHOR) + row.offsetDays * 86400000).toISOString();
}
