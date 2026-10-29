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

import { ABILITIES, suggestedTrigger } from './abilities.js?v=0.2.67';
import { BASIC_SUPPLIES } from './supply-basics.js?v=0.2.67';

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
   A role's CORE rune spell (STORE_CORE: the one its role cannot work without) names
   its family's store rune (`action.store`, written on the slot like its trigger; Tyler
   2026-10-23: with the spell unlocked and no rune in the bag, the game charges gold
   per cast, like food and drink), so a new hero with no runes still casts it, its own
   runes first. Every other default rune slot casts the hero's OWN runes only: a default
   bar buys no supply the role does not need (designer 2026-10-21), and the player turns
   the store on per slot in the Configure action (a new rune slot starts with it on).
   MEASURED on the real settle (lane b-spell-content): with a store rune on every default
   rune slot the Sewer party's runes and the drinks they cost took its net under the
   Thicket's (forest-cave first-grounds-net-chain) and the Warrens floor tank under +25%.
   The server projects these as the default bar (hr_hunt_role_rules, restated by
   2027-01-13-spell-content.sql, pinned equal by tests/hunt-core/conditions.mjs). */
const STORE_CORE = Object.freeze(['fireball', 'greater_mend']);
const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune && STORE_CORE.includes(id) ? BASIC_SUPPLIES.find((x) => x.partner === r.rune) : null; return b ? b.id : null; };
const slot = (id, conditions, join) => Object.freeze({ id: 'd_' + id,
  action: Object.freeze(Object.assign({ type: 'ability', id }, storeOf(id) ? { store: storeOf(id) } : {})),
  conditions: Object.freeze((conditions || suggestedTrigger(ABILITIES[id])).map((c) => Object.freeze(c))), join: join || 'and' });
/* SPARE MANA: the Mage's single-target Frost Lance casts only while it holds half its mana or more, so Fireball, its
   core area spell, always has the mana it needs (measured: unconditioned, Frost Lance cast every 6 s and its drinks
   took the floor Mage under its +25%, drop-tables caster-floor). */
const SPARE_MANA = Object.freeze([{ metric: 'self_mana_pct', op: 'gte', value: 50 }]);
/* NO DEAD BUTTON ON THE STARTER BAR (playtest 2026-10-29 #9, 10-24 #4): the sword's Flame Strike sat on every new
   hero's bar struck "no Fire runes left" from minute one (the kit carries no rune, Tyler 2026-10-23). It is off the
   sword's default sets; the player adds it from Configure action's Spells tab, store rune on (1 gp a cast), and
   "Spells need runes" / "Make your own runes" teach it then. A struck slot never fires, so the measured hunts do not
   move. The other door, a store rune on the default slot, was MEASURED (forest-cave and drop-tables, ladder kit,
   6-seed medians, before -> after): net g/h Cellar 1,828 -> 1,425, Thicket 1,844 -> 1,472, Sewer party 2,024 -> 1,911,
   Thicket Level XP/h 20.9k -> 24.1k, and drop-tables went red on 18 pace/value bands (Sewer gear every 0.7 h, Thicket
   2,859 g per hero-hour): a balance change, the designer's to make. Pinned: tests/hunt-core/conditions.mjs
   starter-bar-fires. */
export const ROLE_RULES = Object.freeze({
  tank: Object.freeze([slot('challenge'), slot('power_strike')]),
  /* One Melee damage set for every key that plays it (hunt-spawn heroSetup keeps the slots its discipline holds): a
     sword alone casts Power Strike, two axes Power Strike, Cleave and Rend, a club or bare hands Power Strike and
     Cleave (roadmap p15). */
  melee_dps: Object.freeze([slot('power_strike'), slot('cleave'), slot('rend')]),
  ranger: Object.freeze([slot('hunters_mark'), slot('flame_volley'), slot('precision_shot')]),
  mage: Object.freeze([slot('fireball'), slot('frost_lance', SPARE_MANA), slot('arcane_barrier')]),
  healer: Object.freeze([slot('greater_mend'), slot('circle_of_renewal'),
    slot('green_sickness', [{ metric: 'ally_hp_pct', op: 'gte', value: 70, subject: 'lowest' }])]),
});

/* An action set: up to `presets` per character, each a bar of up to `slots`
   ability ids (Huntera's two rows of ten) plus its options. */
export const ACTION_SET_LIMITS = Object.freeze({ presets: 5, slots: 20 });
