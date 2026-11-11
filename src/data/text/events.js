// ════════════════════════════════════════════════════════════════════════
// src/data/text/events.js — THE LIVE EVENTS' TIME WORDS: when an event starts or ends, on the plate over the World
// (src/shell/widgets/event-plate.js) and on a ground's page and its Call out (src/shell/live-events-view.js).
//
// One row per label or sentence, read by t('events.<key>'). Each event's own words (its name, what it does) are its row in
// src/data/live-events.js WORDS, the one home of an event. {at} is a server instant in the player's own clock
// (src/render/format.js localWhen); {mins} the whole minutes left, rounded up.
// ════════════════════════════════════════════════════════════════════════

export const EVENTS_TEXT = Object.freeze({
  /* The plate's quiet second half, after the event's name or its chip. */
  plate_starts: 'starts {at}',
  plate_ends: 'ends {at}',
  plate_ends_in: 'ends in {mins} min',
  /* The second sentence of a ground's line for an event. */
  ends_at: 'It ends {at}.',
  ends_in: 'It ends in {mins} min.',
});
