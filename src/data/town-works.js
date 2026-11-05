// ════════════════════════════════════════════════════════════════════════
// src/data/town-works.js — WHAT THE WHOLE SERVER IS BUILDING TOGETHER (data; the source of truth).
//
// Tyler 2026-11-04: a server-wide donation project that changes the town, with a plaque. Designer's board section "2026-11-04 Gold sinks". Change a row here, then
// `node tools/gen-town-works.mjs` regenerates the server's copy (hr_town_works); its --check fails a stale one. The next project is one row. The Weighhouse is a town
// building the Market's window has always been named for, and no such building stood.
//
// VISUAL ONLY, NO BUFF: a gold-funded power effect is on Tyler's avoid list. No engine, XP, drop or price reads a project's total (tests/town-works.mjs TW-NO-BUFF).
//
// THE ROW (one per project, keyed by the server's project id):
//   name       how the town says it: the first words of its stage lines, and of its refusals
//   about      the Works tab's first words
//   map        the town it stands in
//   minGift    the smallest gift (a gift that exactly finishes the project may be smaller, or the last few coins could never be given)
//   perDay     how much one ACCOUNT may give in a UTC day, across all its heroes
//   perMinute  the verb's own rate bucket
//   stages     in order; the first starts at 0 and the last's `at` is the goal. art: the sprite drawn on the lot (all one frame, stage 0's is the map's object);
//              line: the System line when the total crosses `at`, read after `name`
//   gifts      the amounts the window offers as buttons; the player may type any other
//   plaqueTop  how many accounts the plaque names
//
// PURE ESM DATA. No imports, no DOM. It reaches no edge import.
// ════════════════════════════════════════════════════════════════════════

const stage = (at, art, label, line) => Object.freeze({ at, art, label, line });

export const TOWN_WORKS = Object.freeze({
  weighhouse: Object.freeze({
    name: 'The Weighhouse', about: 'Havora is raising the Weighhouse on the east bank. Every gift goes toward the building, and the biggest givers go on its plaque.',
    map: 'town_common', minGift: 100, perDay: 25000, perMinute: 20,
    gifts: Object.freeze([1000, 5000]), plaqueTop: 10,
    stages: Object.freeze([
      stage(0, 'havora_weighhouse_staked', 'Staked out', null),
      stage(100000, 'havora_weighhouse_footings', 'Footings', 'has its footings.'),
      stage(300000, 'havora_weighhouse_framed', 'Framed', 'has its frame.'),
      stage(600000, 'havora_weighhouse_walled', 'Walled', 'has its walls.'),
      stage(1000000, 'havora_weighhouse_finished', 'Finished', 'is finished.'),
    ]),
  }),
});
