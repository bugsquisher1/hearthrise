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

/* An action set: up to `presets` per character, each a bar of up to `slots`
   ability ids (Huntera's two rows of ten) plus its options. */
export const ACTION_SET_LIMITS = Object.freeze({ presets: 5, slots: 20 });
