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

/* Falls ends the hunt after that many knock-outs (replaces Retreat): THREE,
   for everyone (master plan row 16, 2026-10-14 — rulings S and U), so the
   range is the single value. Hours is an optional limit, off by default: the
   bag and the falls already bound a hunt, and a timer nobody asked for is a
   hunt that ends for no reason. */
export const SESSION_LIMITS = Object.freeze({
  falls: Object.freeze({ min: 3, max: 3, default: 3 }),
  hours: Object.freeze({ min: 1, max: 24, default: null }),
  bagLines: 10,
});

/* The `stamina_low` timeline event (master plan row 4, 2026-10-14: it replaces
   `vigour_low`, Vigour no longer touches a hunt) fires once per hunt when the
   stamina pool has this many minutes or fewer left. The server reads it
   through the generated catalogue, so retuning it is this one edit. */
export const STAMINA_LOW_MIN = 60;

/* A KNOCKOUT INSIDE A HUNT is a flat minute (master plan row 16: rulings S and
   U replace the Recovery Rule's 0…64 min ladder for sessions); the character
   gets up at 40% HP (src/core/recovery.js resumeHpFor), and three falls end
   the hunt (SESSION_LIMITS.falls). */
export const KNOCKOUT_MS = 60000;

/* THE GOLD FLOOR (master plan row 3, 2026-10-14). A shop use never takes the
   character's gold below this: when a charge would, the hunt first sells this
   session's sellable loot to the vendor (COVER), cheapest first; when that is
   not enough the hunt ends `gold_out`. Per action set (default for a new one),
   whole gold in the range. */
export const GOLD_FLOOR = Object.freeze({ min: 0, max: 100000, default: 300 });

/* HUNT SUPPLIES (Master Design Reference §4; Combat Design Bible v1.4): the
   player chooses, per action set, where supplies come from and what happens
   when they run out — the store is never used silently.
     SUPPLY_SOURCE  `mine` (the default): the carried bag only.
                    `store`: the store's supplies, paid per use inside the
                    settle (a packed crafted line is still spent first).
     ON_EMPTY       `end` (the default): a carried line that runs dry ends the
                    hunt `<line>_out`. `switch`: the store takes over that line.
   So the shop is reachable only under `store`, or `mine` + `switch` once the
   carried line is empty. Stored in player_action_sets.supply_source /
   on_empty, set with hr_action_set_options; the settle re-checks it. */
export const SUPPLY_SOURCE = Object.freeze({ modes: Object.freeze(['mine', 'store']), default: 'mine' });
export const ON_EMPTY = Object.freeze({ modes: Object.freeze(['end', 'switch']), default: 'end' });

/* THE ACTION SET'S OPTIONS, ONE JSON OBJECT (architecture contracts S4):
   hr_action_set_options(slot, preset, p_opts jsonb, idem) validates every key
   against the generated hr_hunt_set_options row it names, so a new option is a
   data row here — never a new RPC signature or client-baseline row.
     target  a solo mode of hr_hunt_target_modes
     limit   an integer inside the hr_hunt_limits `<limit>_min` / `_max` pair
     enum    one of `values` */
export const ACTION_SET_OPTIONS = Object.freeze({
  target_mode: Object.freeze({ kind: 'target' }),
  pull_count: Object.freeze({ kind: 'limit', limit: 'pull' }),
  gold_floor: Object.freeze({ kind: 'limit', limit: 'gold_floor' }),
  supply_source: Object.freeze({ kind: 'enum', values: SUPPLY_SOURCE.modes }),
  on_empty: Object.freeze({ kind: 'enum', values: ON_EMPTY.modes }),
});

/* WHAT AN AUTOMATIC END SENDS A CHARACTER WITH NOTHING ELSE TO DO BACK TO
   (master plan row 25): fishing the Shrimp Spot. A new character's
   `last_activity_*` starts here (the generated column default). */
export const DEFAULT_RESUME = Object.freeze({ kind: 'gather', id: 'shrimp_s' });

/* SELL-TO-COVER: WHAT A HUNT MAY SELL TO KEEP THE SHOP PAID (master plan row 3;
   narrowed by the Master Design Reference §8 review, 2026-10-15). Auto-sell is
   OPT-IN and touches JUNK ONLY: an item must carry `junk: true` in
   src/data/items.js — never bones (Prayer), never a creature product a future
   imbuement may need, never equipment, never a packed supply or a shop
   supply's partner. No item is flagged junk today, so sell-to-cover is INERT
   until the loot-rules lane (M4) flags its first row. Only units THIS session
   looted, still in the bag, are ever sold (hr_hunt_apply §5b); the price is the
   vendor's own (hr_hunt_vendor_value). The generator lists them as
   hr_hunt_cover_items. */
export function coverSellable(item, isSupply) {
  if (!item || typeof item !== 'object') return false;
  if (item.slot || item.type === 'weapon' || item.type === 'armor' || item.type === 'jewelry') return false;
  if (isSupply) return false;
  return item.junk === true;
}

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
     doing; `{activity}` is the server's own name for it ("fishing at Shrimp
     Spot"), drawn from the `ended` event's `resume`. */
  resumed: Object.freeze({ one: 'Back in town — {activity} again.' }),
});

export const END_REASON_COPY = Object.freeze({
  falls: Object.freeze({ one: 'You were knocked out, so you walked home to recover.', other: 'You were knocked out {n} times, so you walked home to recover.' }),
  heals_out: Object.freeze({ one: 'You ran out of healing food, so you headed home.' }),
  ammo_out: Object.freeze({ one: 'You ran out of {item}, so you headed home.' }),
  gold_out: Object.freeze({ one: 'You ran out of gold for supplies — the hunt ended.' }),
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
  stamina_low: Object.freeze({ one: 'Stamina is low: about 1 minute left.', other: 'Stamina is low: about {n} minutes left.' }),
  /* Sell-to-cover: loot sold to the vendor so the shop could be paid. */
  cover: Object.freeze({ one: 'Sold 1 item to keep the shop paid.', other: 'Sold {n} items to keep the shop paid.' }),
  ended: Object.freeze({ one: 'Hunt over: {reason}' }),
});
