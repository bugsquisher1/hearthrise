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

import { HUNT_STANCES } from './rule-subjects.js?v=0.2.39';
import { WEAPON_ROLES } from './hunt-roles.js?v=0.2.39';
import { ACTION_SET_SKIPS } from './abilities.js?v=0.2.39';

/* Hours is an optional limit, off by default: the bag, stamina and death
   already bound a hunt, and a timer nobody asked for is a hunt that ends for no
   reason. (A death ends the hunt outright, Tyler 2026-10-19: there is no falls
   limit.) */
export const SESSION_LIMITS = Object.freeze({
  hours: Object.freeze({ min: 1, max: 24, default: null }),
  bagLines: 10,
  /* THE LEVEL FLOOR IS A WARNING (Tyler, 2026-10-18): a hunt's band[0] (src/data/hunts.js) is
     advice. hr_hunt_enter_for admits a character under it and answers below_range: true (the
     picker says the hunt is above your level); it refuses only a character this many combat
     Levels or more under the floor (2026-10-25-hunt-floor-warning.sql). */
  belowRangeRefuse: 15,
});

/* The `stamina_low` timeline event (master plan row 4, 2026-10-14: it replaces
   `vigour_low`, Vigour no longer touches a hunt) fires once per hunt when the
   stamina pool has this many minutes or fewer left. The server reads it
   through the generated catalogue, so retuning it is this one edit. */
export const STAMINA_LOW_MIN = 60;

/* THE GOLD FLOOR (master plan row 3, 2026-10-14). A shop use never takes the
   character's gold below this: when a charge would, the hunt first sells this
   session's sellable loot to the vendor (COVER), cheapest first; when that is
   not enough the hunt ends `gold_out`. Per action set (default for a new one),
   whole gold in the range. */
export const GOLD_FLOOR = Object.freeze({ min: 0, max: 100000, default: 300 });

/* HUNT SUPPLIES, PER HERO (HUNT_SCREEN_SPEC §3.4 #5-7, §3.7; Tyler 2026-10-16:
   "a hunt never stops for lack of stock", which supersedes the 10-14/10-15
   "the store is never used silently" text this replaced).
     SUPPLY_SOURCE  `mine` (the default): the hero's own carried stack first,
                    free. `store`: the store row for the hunt's tier at store
                    price (a carried line is still spent first).
     ON_EMPTY       `switch` (the default): once the carried line is empty the
                    store takes over, at store price. `end`: an explicit opt-in;
                    an empty carried line ends the hunt `<line>_out`, so
                    heals_out / ammo_out stay in END_ORDER, reachable only here.
   A store use the gold cannot pay (above the GOLD_FLOOR, after sell-to-cover)
   still ends the hunt `gold_out`. Stored in the action set's `options` jsonb
   (hr_action_set_options); the settle re-checks it. */
export const SUPPLY_SOURCE = Object.freeze({ modes: Object.freeze(['mine', 'store']), default: 'mine' });
export const ON_EMPTY = Object.freeze({ modes: Object.freeze(['switch', 'end']), default: 'switch' });

/* THE GATHERING SHARE (Tyler 2026-10-18): the percent of a hunt's time a hero spends
   gathering on the ground (0 = fight only). STORED AND VALIDATED ONLY: INERT until the
   gathering engine lands (a later lane); no engine reads it yet (heroSetup carries it
   as `gatherShare` with `gatherInert: true`, and the settings window says so). */
export const GATHER_SHARE = Object.freeze({ min: 0, max: 100, default: 0, inert: true });

/* THE ACTION SET'S OPTIONS, ONE JSON OBJECT (architecture contracts S4; spec
   §3.7 per-hero settings). An action set is keyed (user, slot, preset), so
   "per hero" is per character. hr_action_set_options(slot, preset, p_opts,
   idem) validates every key against the generated hr_hunt_set_options row it
   names and stores the set in player_action_sets.options; a new option is a
   row here, never a new RPC signature, column or client-baseline row. Refused,
   never clamped; a key sent as null goes back to its default. An absent key
   reads its default at the settle: the role's (rule-subjects.js ROLE_DEFAULTS
   through src/core/hunt/roles.js defaultSettings) for target_mode, stance,
   distance and chase; `default` below for the rest.
     target  a mode of hr_hunt_target_modes
     limit   an integer inside the hr_hunt_limits `<limit>_min` / `_max` pair
     enum    one of `values`
     bool    true or false */
export const ACTION_SET_OPTIONS = Object.freeze({
  /* abilities.js ACTION_SET_SKIPS: what each set skips. */
  action_set: Object.freeze({ kind: 'enum', values: Object.freeze(Object.keys(ACTION_SET_SKIPS)), default: 'hunt' }),
  target_mode: Object.freeze({ kind: 'target' }),
  stance: Object.freeze({ kind: 'enum', values: Object.freeze(Object.keys(HUNT_STANCES)) }),
  distance: Object.freeze({ kind: 'limit', limit: 'distance' }),
  chase: Object.freeze({ kind: 'bool' }),
  /* The role pick. Since Tyler's 2026-10-19 ruling (wand = Mage, staff = Healer) no weapon plays two
     roles, so every weapon ignores it (roleForWeapon); the option and its role_pick plumbing are a cut
     still owed (CORE_MODEL.md §11). */
  role: Object.freeze({ kind: 'enum', values: WEAPON_ROLES.staff }),
  /* (food_below_pct / drink_below_pct, the old eat-at and drink-at, are RETIRED (Tyler 2026-10-23, audit c24): when
     to eat or drink is the slot's own conditions, one source; a new food or drink slot starts at
     consumables.js CONSUMABLE_RULES' thresholds, written on it.) */
  supply_source: Object.freeze({ kind: 'enum', values: SUPPLY_SOURCE.modes, default: SUPPLY_SOURCE.default }),
  on_empty: Object.freeze({ kind: 'enum', values: ON_EMPTY.modes, default: ON_EMPTY.default }),
  gold_floor: Object.freeze({ kind: 'limit', limit: 'gold_floor' }),
  /* (Density is NOT an option (rulings H4): it is the hero's pick per ground, hunt_density, written by
     hr_hunt_density_set and frozen on the instance at hunt start; 2026-11-17-hunt-density-home.sql.) */
  /* GATHER_SHARE: stored, inert. */
  gather_share: Object.freeze({ kind: 'limit', limit: 'gather_share', default: GATHER_SHARE.default }),
});

/* THE VALUE BOUND'S HEADROOM (Security GO item 3, 2026-10-15). A settle's
   gold, XP and drops are bounded server-side by K x the catalogue maximum per
   kill (hr_hunt_kill_bounds, generated from src/data/monsters.js): gold by the
   kill's top gp roll, XP by the most a kill can teach (every HP of damage at the
   fallback route's rate, plus the kill XP), a drop by the rows that name it. A
   BLAST RADIUS, not balance: it absorbs every multiplier (gold find, XP perks
   and buffs, rested) so honest play never meets it, and stops a compromised or
   buggy engine minting more than a few times what K kills can be worth. */
export const VALUE_HEADROOM = 3;

/* WHAT AN AUTOMATIC END SENDS A CHARACTER WITH NOTHING ELSE TO DO BACK TO: NOTHING (live v0.2.11,
   2026-10-20). A hunt end resumes only an activity the player chose; a character that never chose one goes
   idle in town. (It was fishing the Shrimp Spot, started invisibly for heroes that never fished.) null = no
   column default on player_state.last_activity_*. */
export const DEFAULT_RESUME = null;

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

/* THE PRICE OF A DEATH (Tyler 2026-10-19; Coordinator answer Q7, recorded for
   Tyler's approval). A death ends the hunt and costs:
     Level   this fraction of the character's TOTAL Level XP, never below the
             start of the current Level (a death never de-levels);
     skills  every combat skill (src/data/skills.js DEATH_SKILLS) loses the same
             fraction of its progress toward its next level, never a level.
   Blessings (src/data/blessings.js) remove a share of both. The server reads it
   as the hr_hunt_limits row `death_xp_permille` (the generator refuses a
   fraction that is not a whole permille). */
export const DEATH_XP_LOSS = 0.02;
/* WHAT THE LEVEL'S LOSS IS A SHARE OF (Tyler 2026-10-19: 'total'; the designer
   recommends 'level', the current Level's span, at Level 200): 'total' = the
   character's total Level XP, 'level' = the XP between its current Level and the
   next. Either way the loss never takes the character below its current Level.
   Server row `death_xp_base` (0 total, 1 level), generated. */
export const DEATH_XP_BASE = 'total';

/* The Analyzer keeps a character's last this-many hunts (ruling §2); an older
   ended hunt, its bag lines, tally and timeline are pruned when a new one
   starts. Its ledger rows are never touched: player_ledger is append-only. */
export const SESSIONS_KEPT = 20;

/* THE ANALYZER'S RATE WINDOW (designer ruling 2026-10-21): until a session has
   this much wall time the server sends no rate (per_hour, every eta: null), so
   a minute of store food never reads as -100k/h. The server's rule is
   hr_hunt_stats_of `p_wall_h * 60 >= 10` (2026-11-06-hunt-analyzer-min-window.sql,
   pinned equal by tests/hunt-core/hunt-data.mjs); the client only says when. */
export const ANALYZER_RATE_AFTER_MS = 10 * 60000;

/* STAMINA (Tyler 2026-10-14: "steal the stamina system, 1:1 like Huntera,
   keep it simple"; Tyler 2026-10-17: 8 h free, 12 h premium). One pool per
   character, in ms: it DRAINS 1:1 on every swing interval a hunt session spends
   hunting, and RESTS BACK 1:1 at every other instant — walking out,
   in town, not in a hunt at all — never past the character's CAP:
   `premium` while player_state.premium_until is ahead of the instant it rests
   to, `free` otherwise (hr_stamina_of). A lapse never removes banked stamina:
   a pool above the free cap stays, and only stops resting until it is below
   it. At 0 the hunt ends `stamina` at its next swing boundary. Server-owned
   (player_state.stamina_ms / stamina_at; the generated limits rows
   `stamina_free_min` / `stamina_premium_min`); the client renders
   hr_state_of's `stamina`. ONE source: src/data/premium.js does not restate
   it. A gold refill (a separate reviewed lane) is the only other writer. */
export const STAMINA_MAX_MS = Object.freeze({ free: 8 * 3600000, premium: 12 * 3600000 });

/* Checked in this order on every swing; the first that holds ends the hunt.
   Stamina sits where Vigour stood (Vigour ends no hunt — designer ruling,
   2026-10-14 loop check). `died` (Tyler 2026-10-19): the hero was killed; the
   hunt ends at the next boundary and the hero is back in town with full HP and
   mana. `party_member_died` / `party_member_left` (LEAVE TOGETHER, Tyler
   2026-10-22): another member's party hunt ended (it died / it ended for any other
   reason) and this hero's box "Leave if anyone leaves the hunt or dies" is ticked
   (player_state.party_leave_together, default on): it is paid up to that boundary
   and goes home; an unticked hero hunts on.
   `gold_out` (Tyler, 2026-10-14): an NPC basic supply
   the purse cannot pay ends the hunt at the next boundary. `rule` (Tyler
   2026-10-18, the action engine): one of the hero's own stop rules held for its
   hold time (src/core/hunt/conditions.js checkStopRules). The server reads
   this list as hr_hunt_end_reasons and as hunt_sessions.end_reason's CHECK
   (tools/gen-hunt-sessions.mjs). */
export const END_ORDER = Object.freeze(['died', 'party_member_died', 'party_member_left', 'heals_out', 'ammo_out', 'gold_out', 'rule', 'stamina', 'hours', 'left', 'changed', 'server']);

/* WHICH ENDS SEND THE CHARACTER BACK TO WHAT THEY WERE DOING (Tyler
   2026-10-14): every AUTOMATIC end. A hunt the player left or changed is the
   player's own choice and resumes nothing. After the walk home the server
   points the character at its last non-hunt activity
   (player_state.last_activity_kind / _id), if that is still allowed; else
   idle in town. A data row so Huntera-style combat training can take its
   place later without touching the settle. */
export const RESUME_AFTER_END = Object.freeze(['died', 'party_member_died', 'party_member_left', 'heals_out', 'ammo_out', 'gold_out', 'rule', 'stamina', 'hours', 'server']);

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
  /* The death cost this much XP in all (DEATH_XP_LOSS), summed by the
     renderer from the `death` event's server-stated `xp_lost`. */
  xpLost: Object.freeze({ one: 'Dying cost you 1 XP.', other: 'Dying cost you {n} XP.' }),
  /* After an automatic end the character walks home and picks up what it was
     doing; `{activity}` is the server's own name for it ("fishing at Shrimp
     Spot"), drawn from the `ended` event's `resume`. */
  resumed: Object.freeze({ one: 'Back in town — {activity} again.' }),
});

export const END_REASON_COPY = Object.freeze({
  /* `{name}` the character, `{ground}` the hunt's name, both from the server. */
  died: Object.freeze({ one: '{name} died in {ground} and returned to town.' }),
  /* LEAVE TOGETHER (Tyler 2026-10-22): `{member}` the party member whose hunt ended first (the server's
     hunt.session.end_by; "A party member" when it cannot say), `{name}` this hero. */
  party_member_died: Object.freeze({ one: '{member} fell, so {name} came home too.' }),
  party_member_left: Object.freeze({ one: '{member} left the hunt, so {name} came home too.' }),
  heals_out: Object.freeze({ one: 'You ran out of healing food, so you headed home.' }),
  ammo_out: Object.freeze({ one: 'You ran out of {item}, so you headed home.' }),
  gold_out: Object.freeze({ one: 'You ran out of gold for supplies — the hunt ended.' }),
  rule: Object.freeze({ one: 'One of your stop rules was met, so you headed home.' }),
  stamina: Object.freeze({ one: 'Out of stamina, so you headed home. It rests back 1:1 while you are not hunting.' }),
  hours: Object.freeze({ one: 'Your 1-hour limit was up, so you headed home.', other: 'Your {n}-hour limit was up, so you headed home.' }),
  left: Object.freeze({ one: 'You left the hunt and walked home.' }),
  changed: Object.freeze({ one: 'You moved on to {hunt}.' }),
  server: Object.freeze({ one: 'The server ended the hunt. Everything you earned up to then is yours.' }),
});

/* The "since you last looked" strip and the timeline. The time of each line
   is drawn by the renderer from the event's server timestamp. */
export const TIMELINE_COPY = Object.freeze({
  heading: 'Since you last looked',
  empty: 'Nothing new since you last looked.',
  /* Shown under a `death` line whose server-stated `xp_lost` is above 0. */
  xpLost: Object.freeze({ one: 'Lost 1 XP.', other: 'Lost {n} XP.' }),
});

export const EVENT_COPY = Object.freeze({
  entered: Object.freeze({ one: 'Set out for {hunt}.' }),
  level_up: Object.freeze({ one: 'Reached {skill} level {level}.' }),
  rare_drop: Object.freeze({ one: 'Rare drop: {item}.' }),
  death: Object.freeze({ one: 'Killed by {monster}.' }),
  slot_dry: Object.freeze({ one: 'Ran out of {item}.' }),
  stamina_low: Object.freeze({ one: 'Stamina is low: about 1 minute left.', other: 'Stamina is low: about {n} minutes left.' }),
  /* Sell-to-cover: loot sold to the vendor so the shop could be paid. */
  cover: Object.freeze({ one: 'Sold 1 item to keep the shop paid.', other: 'Sold {n} items to keep the shop paid.' }),
  ended: Object.freeze({ one: 'Hunt over: {reason}' }),
});
