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
   an optional limit, off by default: the bag and the falls already bound a
   hunt, and a timer nobody asked for is a hunt that ends for no reason. */
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

/* TBD-designer (Tyler 2026-10-14: "for now a small loss of xp on death";
   lane C2 placeholder). On every fall inside a hunt, each skill the fight
   trains (the combat style's XP route) loses this fraction of the XP its
   CURRENT level needs to reach the next — taken only from progress inside that
   level, so a fall never costs a level, costs nothing at a level floor, and
   nothing at the top level. The server reads it as the hr_hunt_limits row
   `death_xp_permille` (2026-10-22-hunt-sessions-settle.sql), pinned equal to
   this by tests/hunt-sessions-settle.mjs DEATHXP. */
export const DEATH_XP_LOSS = 0.02;

/* The Analyzer keeps a character's last this-many hunts (ruling §2); an older
   ended hunt, its bag lines, tally and timeline are pruned when a new one
   starts. Its ledger rows are never touched: player_ledger is append-only. */
export const SESSIONS_KEPT = 20;

/* STAMINA (Tyler 2026-10-14: "steal the stamina system, 1:1 like Huntera,
   keep it simple"; Huntera's bar is 12 hours). One pool per character, in ms:
   it DRAINS 1:1 on every swing interval a hunt session spends hunting, and
   RESTS BACK 1:1 at every other instant — walking out, knocked out, in town,
   not in a hunt at all — never past this cap. At 0 the hunt ends `stamina`
   at its next swing boundary. So 12 h hunting + 12 h resting a day costs
   nothing. Server-owned (player_state.stamina_ms / stamina_at, the generated
   limits row `stamina_max_min`); the client renders hr_state_of's `stamina`.
   A gold refill (+4 h, a separate reviewed lane) is the only other writer. */
export const STAMINA_MAX_MS = 12 * 3600000;

/* Checked in this order on every swing; the first that holds ends the hunt.
   Stamina sits where Vigour stood (Vigour ends no hunt — designer ruling,
   2026-10-14 loop check). `gold_out` (Tyler, same day): an NPC basic supply
   the purse cannot pay ends the hunt at the next boundary. The server reads
   this list as hr_hunt_end_reasons and as hunt_sessions.end_reason's CHECK
   (tools/gen-hunt-sessions.mjs). */
export const END_ORDER = Object.freeze(['falls', 'heals_out', 'ammo_out', 'gold_out', 'stamina', 'hours', 'left', 'changed', 'server']);

/* WHICH ENDS SEND THE CHARACTER BACK TO WHAT THEY WERE DOING (Tyler
   2026-10-14): every AUTOMATIC end. A hunt the player left or changed is the
   player's own choice and resumes nothing. After the walk home the server
   points the character at its last non-hunt activity
   (player_state.last_activity_kind / _id), if that is still allowed; else
   idle in town. A data row so Huntera-style combat training can take its
   place later without touching the settle. */
export const RESUME_AFTER_END = Object.freeze(['falls', 'heals_out', 'ammo_out', 'gold_out', 'stamina', 'hours', 'server']);

/* The non-hunt activity kinds a character's "last activity" may name. `training`
   is RESERVED for the combat redesign (train a chosen combat skill in town while
   stamina refills): stored and resumed by name the day it exists, refused until
   then (it has no catalogue rows). */
export const RESUMABLE_KINDS = Object.freeze(['gather', 'artisan', 'training']);

/* The end card: a title, then the reason in one plain sentence. */
export const END_CARD_COPY = Object.freeze({
  title: 'Hunt over',
  again: 'Hunt again',
  details: 'Details',
  againShort: 'Not enough {item} to pack this bag again: you have {have}, the bag needs {need}.',
  /* The hunt's falls cost this much XP in all (DEATH_XP_LOSS), summed by the
     renderer from the `fall` events' server-stated `xp_lost`. */
  xpLost: Object.freeze({ one: 'Your falls cost you 1 XP.', other: 'Your falls cost you {n} XP.' }),
  /* After an automatic end the character walks home and picks up what it was
     doing; `{activity}` is that activity's skill in plain words ("fishing"),
     drawn from the `ended` event's server-stated `resume` (Tyler's wording,
     2026-10-14: "Back in town and fishing again"). */
  resumed: Object.freeze({ one: 'Back in town and {activity} again.' }),
});

export const END_REASON_COPY = Object.freeze({
  falls: Object.freeze({ one: 'You were knocked out, so you walked home to recover.', other: 'You were knocked out {n} times, so you walked home to recover.' }),
  heals_out: Object.freeze({ one: 'You ran out of healing food, so you headed home.' }),
  ammo_out: Object.freeze({ one: 'You ran out of {item}, so you headed home.' }),
  gold_out: Object.freeze({ one: 'You ran out of gold for supplies, so the hunt ended.' }),
  stamina: Object.freeze({ one: 'Out of stamina, so you headed home. It rests back 1:1 while you are not hunting.' }),
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
  /* Shown under a `fall` line whose server-stated `xp_lost` is above 0. */
  xpLost: Object.freeze({ one: 'Lost 1 XP.', other: 'Lost {n} XP.' }),
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
