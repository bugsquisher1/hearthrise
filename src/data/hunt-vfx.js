// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-vfx.js — WHAT PLAYS ON SCREEN FOR EACH HUNT EVENT (parity FX-05,
// FX-06, FX-07, FX-09, FX-14, VW-06, VW-09).
//
// Effects are sprites of the `vfx` atlas set (art/world/vfx, ported from the
// hunt sim by tools/world-art/port-hunt-sim.mjs). A row here names WHICH effect
// an event plays and WHERE; its frames, fps, loop and blend are the manifest's.
//
// EVENT_FX   every type of src/core/hunt/events.js EVENT_TYPES, mapped to a row
//            or to null (the event draws no effect: its float or the log says it).
//            A row: { fx, at, lift?, lifeMs?, monsterOnly? }
//              at      'u' the actor · 't' the acted-on · 'viewed' the viewed hero
//              lift    how high on the unit it centres: a fraction of the unit's art
//                      height above its feet (0 the feet, 0.5 the chest, 1 the top of the head)
//              lifeMs  how long a LOOPING effect shows (a one-shot plays its frames once)
// HIT_FX     the effect on the target of a `dmg`: by ability, else by element, else
//            by the attacker's role (a monster's bite is the `monster` row).
// PROJECTILE what flies from the attacker before that hit lands (ranged roles).
// CAST_FX    the effect on the caster of a `cast`: by ability, else by role.
//
// A new effect is a row here plus its port; nothing else changes.
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ABILITIES } from './abilities.js?v=0.2.6';

/* Where on a unit an effect centres, as a fraction of its art height: a rat's chest is
   lower than the Rat King's, and a mark floats over whichever head it is on. */
const CHEST = 0.5, HEAD = 1, FEET = 0;

const row = (o) => Object.freeze(o);

export const EVENT_FX = Object.freeze({
  dmg: null,   // HIT_FX, below
  status_tick: null,
  kill: row({ fx: 'fx_monster_death_poof', at: 't', lift: 0.3, monsterOnly: true }),
  cast: null,  // CAST_FX, below
  heal: row({ fx: 'fx_nature_heal_motes', at: 't', lift: FEET }),
  shield: row({ fx: 'fx_arcane_barrier', at: 't', lift: CHEST, lifeMs: 600 }),
  mark: row({ fx: 'fx_hunters_mark', at: 't', lift: HEAD, lifeMs: ABILITIES.hunters_mark.durMs }),
  challenge: row({ fx: 'fx_challenge_taunt', at: 'u', lift: FEET }),
  level: row({ fx: 'fx_level_up', at: 'u', lift: FEET }),
  rare_drop: row({ fx: 'fx_loot_sparkle', at: 'viewed', lift: CHEST }),
  ended: null, death: null, slot_dry: null, pack_reset: null, pull: null, respawn: null, wipe: null,
  target: null, miss: null, immune: null, status_on: null, status_off: null,
  eat: null, drink: null, xp: null, xp_group: null, rule_stop: null, shot: null, rule_wait: null,
});

/* The twinkle a kill that dropped loot leaves on the body (FX-06). */
export const LOOT_FX = row({ fx: 'fx_loot_sparkle', at: 't', lift: 0.15 });

export const HIT_FX = Object.freeze({
  ability: Object.freeze({
    power_strike: 'fx_power_strike', flame_strike: 'fx_flame_volley_puff', cleave: 'fx_melee_slash', rend: 'fx_x_slash',
    precision_shot: 'fx_crossbow_bolt_impact', flame_volley: 'fx_flame_volley_puff',
    fireball: 'fx_fire_rune_burst', frost_lance: 'fx_frost_lance_shatter', natures_wrath: 'fx_natures_wrath',
  }),
  element: Object.freeze({ fire: 'fx_flame_volley_puff', frost: 'fx_frost_lance_shatter', nature: 'fx_natures_wrath' }),
  role: Object.freeze({ tank: 'fx_melee_slash', melee_dps: 'fx_melee_slash', ranger: 'fx_crossbow_bolt_impact', mage: null, healer: null, monster: 'fx_melee_slash' }),
  lift: CHEST,
});

/* A bolt flies `flightMs` from the shooter to the target; the hit, its number and its flash land then. */
export const PROJECTILE = row({ fx: 'fx_crossbow_bolt_projectile', roles: Object.freeze(['ranger']), flightMs: 220, lift: CHEST });

export const CAST_FX = Object.freeze({
  ability: Object.freeze({ circle_of_renewal: row({ fx: 'fx_circle_of_renewal', lift: FEET, lifeMs: 1400 }) }),
  role: Object.freeze({
    tank: row({ fx: 'fx_cast_knight_shield_bash', lift: CHEST }),
    ranger: row({ fx: 'fx_cast_ranger_aim_glint', lift: CHEST }),
    mage: row({ fx: 'fx_cast_sorcerer_runes', lift: FEET, lifeMs: 700 }),
    healer: row({ fx: 'fx_cast_druid_motes', lift: FEET, lifeMs: 700 }),
    melee_dps: null,
  }),
  /* A cast's effect never outstays the swing it opens (the sim's 0.7 s). */
  maxMs: 700,
});

/** Every effect sprite id this table names (the world-assets guard requires each in the vfx set). */
export function effectIds() {
  const out = new Set();
  const add = (r) => { if (r && r.fx) out.add(r.fx); };
  Object.values(EVENT_FX).forEach(add);
  add(LOOT_FX); add(PROJECTILE);
  for (const t of [HIT_FX.ability, HIT_FX.element, HIT_FX.role]) for (const v of Object.values(t)) if (v) out.add(v);
  Object.values(CAST_FX.ability).forEach(add);
  Object.values(CAST_FX.role).forEach(add);
  return Array.from(out).sort();
}
