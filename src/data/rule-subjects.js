// ════════════════════════════════════════════════════════════════════════
// src/data/rule-subjects.js — THE PER-HERO HUNT SETTINGS' VOCABULARY
// (HUNT_SCREEN_SPEC §3.2, §3.7; Game Designer)
//
// Hunts are idle (Tyler 2026-10-16): the bar is CONFIGURATION, never a list of
// conditional supply slots or manual presses. What a hero may be told lives
// here; the abilities its bar orders are src/data/abilities.js, food and drink
// are src/data/consumables.js, the option keys the server stores are
// src/data/hunt-sessions.js ACTION_SET_OPTIONS. The C2 supply-slot language
// (subjects, operators, slot kinds and targets, the default slot preset, the
// pull count and its cap, the cooldown-lane table) was retired with the C2
// action bar (lane S1, 2026-10-17): the lanes are consumables.js laneMs and
// abilities.js ABILITY_LANES, one source each.
//
// Read by src/core/hunt/{targeting,roles,damage}.js and the server catalogue
// (tools/gen-hunt-sessions.mjs). Every number is ASSUMED (spec §5 #13).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ABILITIES, suggestedTrigger } from './abilities.js?v=0.2.94';
import { BASIC_SUPPLIES } from './supply-basics.js?v=0.2.94';

/* WHICH FOE A HERO TAKES FIRST (spec §3.2 #11; src/core/hunt/targeting.js
   ORDER implements each). `follow` takes the leader's target; in a party of
   one there is no leader to follow and it reads as the hero's own nearest. */
export const TARGET_MODES = Object.freeze({
  nearest: Object.freeze({ label: 'Nearest' }),
  weakest: Object.freeze({ label: 'Lowest HP' }),
  highest_pct: Object.freeze({ label: 'Highest % life' }),
  strongest: Object.freeze({ label: 'Strongest' }),
  follow: Object.freeze({ label: 'Follow the leader' }),
});
export const DEFAULT_TARGET_MODE = 'nearest';

/* FIGHT STANCES, in permille of damage dealt and taken (Offensive +10% / +10%,
   Defensive -10% / -15%). One table; src/core/hunt/damage.js hurt() is its only reader. */
export const HUNT_STANCES = Object.freeze({
  offensive: Object.freeze({ dealt: 1100, taken: 1100, label: 'Offensive' }),
  balanced: Object.freeze({ dealt: 1000, taken: 1000, label: 'Balanced' }),
  defensive: Object.freeze({ dealt: 900, taken: 850, label: 'Defensive' }),
});
export const DEFAULT_STANCE = 'balanced';

/* DISTANCE: the tiles a hero keeps from its own target (ranged) or kites at (chase off). */
export const HERO_DISTANCE = Object.freeze({ min: 1, max: 8 });

/* PER-ROLE DEFAULTS (RO-15; the sim's HERO_SETTINGS rows). `chase: false` with
   `dist > 1` is KITING (RO-09). A party with no Melee hero sets every ranged hero's
   chase off (RO-14, src/core/hunt/roles.js defaultSettings). */
export const ROLE_DEFAULTS = Object.freeze({
  tank: Object.freeze({ dist: 1, tmode: 'nearest', stance: 'balanced', chase: true }),
  melee_dps: Object.freeze({ dist: 1, tmode: 'follow', stance: 'offensive', chase: true }),
  ranger: Object.freeze({ dist: 3, tmode: 'follow', stance: 'balanced', chase: true }),
  healer: Object.freeze({ dist: 5, tmode: 'follow', stance: 'balanced', chase: true }),
  mage: Object.freeze({ dist: 6, tmode: 'follow', stance: 'balanced', chase: true }),
});

/* THE ROLE DEFAULT RULE SETS (the action engine, Tyler 2026-10-18): the ability
   slots a hero fights with while its bar holds none of its own, in priority
   order, in the slot wire shape (src/data/condition-metrics.js). Each slot's
   trigger is WRITTEN ON IT as real conditions (Tyler 2026-10-23, c21: the screen
   shows what the engine does): its ability's suggested trigger (abilities.js
   suggestedTrigger: a self-shield under its whenBelowPct, an ally heal under it for
   the lowest ally, an area at areaMin monsters, a party heal at minHurt allies),
   unless the row names its own. The HEALER attacks only when nobody needs healing
   (Tyler P1, the solo healer): Green Sickness waits while any ally in reach is
   under 70%, so its mana goes to Greater Mend first; its basic attack never waits.
   NO DEFAULT BAR HOLDS A SPELL IT CAN'T CAST (designer 2026-11-05, lane/d-caster-first-fights; Tyler: a preconfigured
   bar is fine for the tutorial and early game only). The kit carries no rune (Tyler 2026-10-23), so every default rune
   slot names its family's PLAIN store rune, never a deeper one (`action.store`, written on the slot like its trigger; with the spell unlocked
   and no rune in the bag, the game charges gold per cast), its own runes first. A caster's spells are its style, so
   they stand on its bar; a weapon hero's rune spell (sword Flame Strike, axes Rend, bow Flame Volley) is the player's
   choice, offered with its price by the tutorial's "A spell costs runes". A saved bar is never touched.
   The server projects these as the default bar (hr_hunt_role_rules, restated by
   2027-03-09-caster-starter-bars.sql, pinned equal by tests/hunt-core/conditions.mjs sql-rows and starter-bar-fires). */
const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune ? BASIC_SUPPLIES.find((x) => x.partner === r.rune) : null; return b ? b.id : null; };
const slot = (id, conditions, join) => Object.freeze({ id: 'd_' + id,
  action: Object.freeze(Object.assign({ type: 'ability', id }, storeOf(id) ? { store: storeOf(id) } : {})),
  conditions: Object.freeze((conditions || suggestedTrigger(ABILITIES[id])).map((c) => Object.freeze(c))), join: join || 'and' });
/* THE MANA GATES: a default store-fed spell behind a core one fires only at the top of a fight, so the core spell always
   has its mana. Measured on the real settle, 6-seed medians, against first-grounds-net-chain and drop-tables (raise a gate before
   touching a ground's coin if another row turns the chain red):
   Frost Lance 70: at 50% it took Fireball's mana (Cellar net -24%, Fireball casts 163 -> 103 an hour); at 70% net -7%.
   Green Sickness 78: with no gate its mana and runes cost the Sewer party about 150 g/h (1,687). From 70 to 80 the Sewer reads the same on 24 seeds (1,867, 1,857,
   1,855, +-10, between the Thicket's 1,820 and the Glade's 1,876), but its guards read six: first-grounds-net-chain over the Thicket's 1,838 and glade-between under the
   Glade's 1,855.5, a window of 17.5 g/h that neighboring gates land in and out of in no order (71 to 80 read 1,824 to 1,899.5; 80 read 1,881.5, 78 reads 1,847.5). So 78 is the
   nearest gate that lands, not a fine tuning (CONFLICTS.md 2026-11-05). At 70 the Warrens' total-value was red (5,748 g against 5,735). Full mana at the top of a fight still fires it first. */
const SPARE_MANA = Object.freeze([{ metric: 'self_mana_pct', op: 'gte', value: 70 }]);
const SICKNESS_WHEN = Object.freeze([{ metric: 'ally_hp_pct', op: 'gte', value: 70, subject: 'lowest' }, { metric: 'self_mana_pct', op: 'gte', value: 78 }]);
/* OFF THE DEFAULT BARS, measured with their store runes on: Flame Volley (ranger-floor: a crossbow Ranger buying every shot
   +3.3% over its bill at the Sewer floor, three shots a Volley; +30.1% without it) and Rend (weapon-rungs: axes at Level 45
   read +4% from a rung; about +1% XP at the Thicket for 23 casts an hour). Sword Flame Strike likewise (playtest 2026-10-29
   #9, CONFLICTS.md: net -20%, XP +15%). None is needed for a first pull: each style's free moves already fire. */
export const ROLE_RULES = Object.freeze({
  tank: Object.freeze([slot('challenge'), slot('power_strike')]),
  /* One Melee damage set for every key that plays it (hunt-spawn heroSetup keeps the slots its discipline holds): a
     sword alone casts Power Strike, two axes and a club or bare hands Power Strike and Cleave (roadmap p15). */
  melee_dps: Object.freeze([slot('power_strike'), slot('cleave')]),
  ranger: Object.freeze([slot('hunters_mark'), slot('precision_shot')]),
  mage: Object.freeze([slot('fireball'), slot('frost_lance', SPARE_MANA), slot('arcane_barrier')]),
  healer: Object.freeze([slot('greater_mend'), slot('circle_of_renewal'), slot('green_sickness', SICKNESS_WHEN)]),
});

/* An action set: up to `presets` per character, each a bar of up to `slots`
   ability ids (Huntera's two rows of ten) plus its options. */
export const ACTION_SET_LIMITS = Object.freeze({ presets: 5, slots: 20 });
