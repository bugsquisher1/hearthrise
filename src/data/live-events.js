// ════════════════════════════════════════════════════════════════════════
// src/data/live-events.js — LIVE EVENTS: TIMED WORLD EVENTS WRITTEN AS ROWS ON THE SERVER CLOCK (Tyler 2026-11-07 approved "live events from
// data"; the designer's rules and measurements: docs/planning/PRIORITY_BOARD.md "2026-11-07 Live events"; the server half lane/c-live-events).
//
// THE ONE HOME of every event: what a type may move (one permille dial, its range, how two live rows of it combine, what its scope names),
// when each event runs (a first window, its hours, how often it comes back, until when) and the words it says. tools/gen-live-events.mjs
// writes the server's two tables from here (hr_live_event_types, hr_live_events) and its --check holds them equal. Nothing under src/core
// imports this file, so adding or moving an event never moves the edge: the settle reads the server's rows (hr_live_xp_windows) and the
// engine only multiplies by what it is handed (src/core/live-events.js).
//
// THE RULES (designer, binding; the board section): an event moves a permille of something the server already computes (Level XP a kill,
// a fee it already charges), never gold into a purse, never coin, drops, rares, skill XP or the death loss. Two live rows of one dial combine
// by the type's `stack` and the type's `range` caps the result. A switch arms each type (hr_feature_switches: off, accounts, testers,
// everyone): an event is live for an account only when its window holds the server instant AND hr_feature_on(type switch, account).
// Every `first` is a UTC instant; a window lasts `hours` and, with `everyDays`, starts again that many days after each start, until `until`
// (null: for good). The curve and every balance guard are fit with no event (the sim never sets an event), so missing one costs nothing.
//
// THE WORDS: plain English, no semicolons, no dashes, no colon-joined clauses, XP is earned. `{pct}` is the dial as a percent (1250 reads 25),
// `{start}`, `{end}` and `{next}` are server instants. The client shows them in the player's local time; the System lines the server
// writes itself (start, end) name the time in UTC, since a chat line can't know the reader's clock.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* WHAT A TYPE MAY MOVE: one dial a type, a permille, its range, how two live rows of it combine, what its scope may name. */
export const LIVE_EVENT_TYPES = Object.freeze({
  xp_bonus: Object.freeze({
    switch: 'event_xp_bonus',            // the hr_feature_switches row that arms it: off = nobody, then testers, then everyone
    dial: 'xpPm',                        // Level XP a kill, per hero (xp-share.js xpMultOf, at the kill's own combat time)
    range: Object.freeze([1000, 1500]),  // one row, and the sum of live rows, never past +50%
    stack: 'add',                        // +25% and +10% make +35%, never 1.25 x 1.1
    scope: 'grounds',                    // 'world' or ground ids
  }),
  open_halls: Object.freeze({
    switch: 'event_open_halls',
    dial: 'feePm',                       // a Call out's fee, permille of its row's fee (boss-calls.js)
    range: Object.freeze([0, 1000]),     // never above the row's fee
    stack: 'min',                        // two live rows: the lower fee wins
    scope: 'calls',                      // 'world' or call ids
  }),
});

/* THE WORDS, one set an event. `name`, `start` and `end` are the server's too (the generated catalogue); the rest only the client reads
   (src/shell/live-events-view.js): `soon` and `on` the plate's tooltip, `chip` the plate, `hunts` a Hunts line, `page` the ground's page
   (`pageUntil`, `pageFree` its second sentence), `callLine` and `callEnding` the Call out section, `warning` and `confirm` its free call.
   TRUTHFUL TO THE SERVER'S RULE (2027-03-22-live-events.sql: a dial moves Level XP a kill or a fee, never coin, drops, rares or skill
   XP): the XP event says what stays the same, and a called room still pays nothing (src/data/boss-calls.js). */
export const WORDS = Object.freeze({
  bonus_weekend: Object.freeze({
    name: 'Bonus XP weekend',
    soon: 'A Bonus XP weekend starts {start}. Rest up so your stamina is full when it begins.',
    on: 'Every hunt earns {pct}% more Level XP until {end}, even while you\'re away. Coin, drops and skill XP stay the same.',
    chip: '+{pct}% Level XP',
    start: 'The Bonus XP weekend has started. Every hunt earns {pct}% more Level XP until {end}.',
    end: 'The Bonus XP weekend is over. The next one starts {next}.',
    hunts: '+{pct}% Level XP this weekend',
    page: '+{pct}% Level XP this weekend.',
    analyzer: 'Weekend bonus',
  }),
  open_halls: Object.freeze({
    name: 'Open Halls',
    soon: 'Open Halls starts {start}. Calling out the Rat King or Chief Coppercap will be free.',
    on: 'Calling out the Rat King or Chief Coppercap is free until {end}. There\'s still no XP, coin or drops in the hall.',
    chip: 'Open Halls',
    start: 'The halls are open. Until {end}, calling out the Rat King or Chief Coppercap is free. Bring a friend or a second hero.',
    end: 'The halls are closed again. Calling out costs its usual fee.',
    hunts: 'Call out {boss} for free',
    page: 'Open Halls is on.',
    pageUntil: 'Call out {boss} for free until {end}.',
    pageFree: 'Call out {boss} for free.',
    callLine: 'Open Halls is on until {end}.',
    callEnding: 'Open Halls ends in {mins} min.',
    warning: 'Open Halls is on, so there\'s no fee. You still get no XP, no coin and no drops in this room, only the fight. It ends after {minutes} minutes.',
    confirm: 'Call him out for free',
  }),
});

/* WHEN THE PLATE SHOWS (display only, the mocks' decision, .claude/coordination/mocks/2026-11-10/SPEC.md §2): an event on now, or
   starting within `soonMs`; its last `endingMs` counts down. The server lists a week ahead, so a weekly and a fortnightly event would
   otherwise make the plate permanent furniture. Neither moves a number: every window is the server's. */
export const LIVE_EVENT_SHOWN = Object.freeze({ soonMs: 24 * 3600000, endingMs: 3600000 });

/* THE SCHEDULE: a window starts at `first` (UTC) and lasts `hours`. With `everyDays` it starts again that many days after each start, until
   `until` (null: for good). Without it, it happens once. The server answers "what is live at instant t" from these rows alone.
   `first` is the first Friday 12:00 (Wednesday 17:00) UTC after the server half lands; moving it is a new generated file, never a hand edit. */
export const LIVE_EVENTS = Object.freeze({
  bonus_weekend: Object.freeze({ type: 'xp_bonus', pm: 1250, scope: 'world',
    first: '2026-11-20T12:00:00Z', hours: 72, everyDays: 14, until: null, words: WORDS.bonus_weekend }),
  open_halls: Object.freeze({ type: 'open_halls', pm: 0, scope: 'world',
    first: '2026-11-18T17:00:00Z', hours: 12, everyDays: 7, until: null, words: WORDS.open_halls }),
});
