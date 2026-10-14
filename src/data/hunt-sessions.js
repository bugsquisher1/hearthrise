// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-sessions.js — HOW A HUNT ENDS, AND WHAT THE PLAYER IS TOLD
// (Hunt Sessions, ruling HR-2026-10-14 §2 "Ending a hunt" / "Return moment";
// Game Designer, lane D)
//
// The settable limits, the fixed order the end checks run in, and every line
// of copy the end card and the timeline show. Copy is a template: `{name}` is
// filled by the renderer from server state, never computed by the client.
// A count that can be 1 has a `one` and an `other` form, so no line ever
// reads "1 times".
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* Falls ends the hunt after that many knock-outs (replaces Retreat). Hours is
   an optional limit, off by default: Vigour and the bag already bound a hunt,
   and a timer nobody asked for is a hunt that ends for no reason. */
export const SESSION_LIMITS = Object.freeze({
  falls: Object.freeze({ min: 1, max: 6, default: 3 }),
  hours: Object.freeze({ min: 1, max: 24, default: null }),
  bagLines: 10,
});

/* TBD-designer (lane C1 placeholder, 2026-10-14). The `vigour_low` timeline
   event fires once per hunt when the character's Vigour left for the day
   falls to this many minutes or fewer. Placeholder: 20% of the flat 720-min
   daily grant. The server reads it through the generated catalogue
   (tools/gen-hunt-sessions.mjs), so retuning it is this one edit. */
export const VIGOUR_LOW_MIN = 144;

/* The Analyzer keeps a character's last this-many hunts (ruling §2); an older
   ended hunt, its bag lines, tally and timeline are pruned when a new one
   starts. Its ledger rows are never touched: player_ledger is append-only. */
export const SESSIONS_KEPT = 20;

/* Checked in this order on every swing; the first that holds ends the hunt. */
export const END_ORDER = Object.freeze(['falls', 'heals_out', 'ammo_out', 'vigour', 'hours', 'left', 'changed', 'server']);

/* The end card: a title, then the reason in one plain sentence. */
export const END_CARD_COPY = Object.freeze({
  title: 'Hunt over',
  again: 'Hunt again',
  details: 'Details',
  againShort: 'Not enough {item} to pack this bag again: you have {have}, the bag needs {need}.',
});

export const END_REASON_COPY = Object.freeze({
  falls: Object.freeze({ one: 'You were knocked out, so you walked home to recover.', other: 'You were knocked out {n} times, so you walked home to recover.' }),
  heals_out: Object.freeze({ one: 'You ran out of healing food, so you headed home.' }),
  ammo_out: Object.freeze({ one: 'You ran out of {item}, so you headed home.' }),
  vigour: Object.freeze({ one: 'Your Vigour is spent for today, so you headed home.' }),
  hours: Object.freeze({ one: 'Your 1-hour limit was up, so you headed home.', other: 'Your {n}-hour limit was up, so you headed home.' }),
  left: Object.freeze({ one: 'You left the hunt and walked home.' }),
  changed: Object.freeze({ one: 'You moved on to {hunt}.' }),
  server: Object.freeze({ one: 'The hunt was stopped for server maintenance. Everything you earned up to then is yours.' }),
});

/* The "since you last looked" strip and the timeline. The time of each line
   is drawn by the renderer from the event's server timestamp. */
export const TIMELINE_COPY = Object.freeze({
  heading: 'Since you last looked',
  empty: 'Nothing new since you last looked.',
});

export const EVENT_COPY = Object.freeze({
  entered: Object.freeze({ one: 'Set out for {hunt}.' }),
  level_up: Object.freeze({ one: 'Reached {skill} level {level}.' }),
  rare_drop: Object.freeze({ one: 'Rare drop: {item}.' }),
  fall: Object.freeze({ one: 'Knocked out by {monster}.' }),
  slot_dry: Object.freeze({ one: 'Ran out of {item}.' }),
  vigour_low: Object.freeze({ one: 'Vigour is low: about 1 minute left.', other: 'Vigour is low: about {n} minutes left.' }),
  ended: Object.freeze({ one: 'Hunt over: {reason}' }),
});
