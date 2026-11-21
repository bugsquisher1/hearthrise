// ════════════════════════════════════════════════════════════════════════
// src/data/statuses.js — STATUS ROWS (HUNT_SCREEN_SPEC §3.3, parity ST-01..06)
//
// One row per status. The pure engine (src/core/hunt/status.js) is generic:
// it knows stacks, ticks, refresh and expiry, never a status by name. A new
// status (poison, burn) is a row here, not code.
//
// ROW SHAPE: a status either TICKS (a damage over time), MARKS its unit (it takes more
// damage while the status lasts) or SLOWS it (its swings and its spell windups take longer).
//   { id, name, tick, everyMs, durationMs, maxStacks, blowPm,
//     tierPermille, damageType }                                a ticking status
//   { id, name, durationMs, maxStacks, takenPm }                  a marking status
//   { id, name, durationMs, maxStacks, slowPm, tierPermille? }    a slowing status
//   { id, name, durationMs, maxStacks, healCutPm, guard? }        a heal-cutting status
//     healCutPm { hero, monster }  permille LESS of every heal its unit takes while it lasts, by
//                            the unit's side (src/core/hunt/heal-cut.js healTaken, the one reader:
//                            food, spells, leech, a healer's casts, the wraps' own heal, a
//                            monster's mend). A wiki formula: landed = n - floor(n x cut / 1000)
//     guard (optional)       an element: a HERO's resistance to it (elements.js heroElementPermille)
//                            lowers the hero's cut by the same percent, fixed as the stack lands:
//                              cut = floor(healCutPm.hero x taken / 1000)  (taken: the permille of
//                              a blow of `guard` the hero takes; 1000 with no guard)
//                            a monster's cut is healCutPm.monster, never guarded
//     slowPm                 permille LONGER its unit's next swing interval and its next spell
//                            windup run, fixed as each one starts (damage.js slowed: the swing
//                            clock; monster-spells.js: the windup), so a mark never fills on a
//                            clock that moves after it is drawn; never scaled by skill, never
//                            stacked past its maxStacks (the strongest live stack's counts)
//     tierPermille (a slowing status's, optional): its slow by the rune tier of the cast that
//                            landed it, permille, index 0 = tier 1 (the tank rune spells,
//                            2026-11-19: one rule for every Ice spell). A wiki formula:
//                              slow = round(slowPm x tierPermille[tier-1] / 1000)   (slowAt)
//                            fixed as the stack lands (status.js stackScale); a landing on a
//                            unit at maxStacks lifts a weaker stack to it (never lowers one)
//     takenPm                permille MORE damage its unit takes from every blow while
//                            it lasts (damage.js landHit, beside Hunter's Mark); fixed:
//                            never scaled by skill or rune tier (Bible §17), never
//                            stacked past its maxStacks
//     tick                   [min, max] the base roll of one tick, inclusive ([1, 1]: a fixed tick, no draw)
//     everyMs                one tick every this long (a whole number of sub-steps)
//     durationMs             a stack lasts this long; reapplying refreshes EVERY stack
//     maxStacks              stacks one unit may carry at once (any sources)
//     blowPm                 permille of the SOURCE's own largest blow (its unit's maxHit, the
//                            caller passes it: source.maxHit) one tick of the base roll lands
//                            (THE SPELL RULE, lane/c-spell-rule: a tick grows with the weapon
//                            and the skill as the cast that landed it does)
//     tierPermille           multiplier by rune tier, permille, index 0 = tier 1;
//                            a source with no rune is tier 1
//     damageType             the element each tick is dealt as
//   A stack's scale is FIXED when it lands (spec §3.3 #6):
//     scale = max(1000, floor(maxHit x blowPm x tierPermille[tier-1] / 1000))
//     tick  = round(roll(tick) x scale / 1000)
//
// Numbers: stacks 5 and 6 s are DECIDED (week plan item 6); the tick's share and the
// +10% tiers are the spell rule's (the bleed row below).
// Bleed is generic (Tyler 10-16): heroes and monsters both carry it, and it is
// physical damage (Tyler 10-16).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js';
import { PHYSICAL, isElement } from './elements.js';
import { NECROTIC_STORM } from './necrotic-storm.js';

/* The five rune tiers (src/data/runes.js): Rend's bleed lands +10% a tier above Chalked, the step every rune spell takes
   (runes.js RUNE_TIERS stepPm), so a Graven Rupture Rune's bleed ticks 1.4x a Chalked one's.
   UNDER THE SPELL RULE (Tyler 2026-11-21, call 21-5; plan lane L17: "Rend ... with its bleed converted") a tick is 6.6% of the
   axes' own largest blow (blowPm), fixed as the stack lands: its Level 60 worth before the rule (5 stacks held, 15% of a same-Level
   monster a second), where the old 1-3 a tick, +0.4% a Melee level, was 51% at Level 10 and 10% at Level 110
   (tools/balance-sim/staged/spell-audit.mjs section 4). */
export const STATUSES = Object.freeze({
  bleed: Object.freeze({
    id: 'bleed', name: 'Bleed',
    tick: Object.freeze([1, 1]), everyMs: 1000, durationMs: 6000, maxStacks: 5,
    blowPm: 66,
    tierPermille: Object.freeze([1000, 1100, 1200, 1300, 1400]),
    damageType: 'physical',
  }),
  /* GREEN SICKNESS's mark (Bible §17 Restoration: "lower-power AoE plus a fixed, non-stacking ~10% damage-taken
     vulnerability for a short duration"; lane b-spell-content, PROVISIONAL): one stack, 6 s, +10% from every blow. */
  sickness: Object.freeze({ id: 'sickness', name: 'Sickness', durationMs: 6000, maxStacks: 1, takenPm: 100 }),
  /* CHILL (Tyler 2026-11-08, the area-spells design: Hoarfrost's frost; PROVISIONAL, the designer's numbers): its unit's
     swings and spell windups run 30% longer for 4 s, one stack. BY RUNE TIER (the tank rune spells, board 2026-11-19 piece 3):
     30 / 35 / 40 / 45 / 50% on a Chalked .. Graven Ice Rune's cast, for every Ice spell (Hoarfrost, Frost Slam). */
  chill: Object.freeze({ id: 'chill', name: 'Chill', durationMs: 4000, maxStacks: 1, slowPm: 300,
    tierPermille: Object.freeze([1000, 1167, 1333, 1500, 1667]) }),
  /* WITHERED (itemization plan Appendix B1 and B3; only while the Necrotic switch is on, src/data/necrotic-storm.js): every heal its
     unit takes lands cut for 6 s, one stack, a new landing restarting the 6 s ("It does not stack. A new hit restarts the 6
     seconds"). A HERO loses 30% (a necrotic hit, elements.js ELEMENT_ON_HERO), its necrotic guard lowering that by the same percent
     (at the 40% cap a hero still loses 18%); a MONSTER loses half ("it heals half as much", the hero's Blight). Fixed: never scaled
     by skill or rune tier. PROPOSED, the designer's numbers. */
  ...(NECROTIC_STORM.live ? { withered: Object.freeze({ id: 'withered', name: 'Withered', durationMs: 6000, maxStacks: 1,
    healCutPm: Object.freeze({ hero: 300, monster: 500 }), guard: 'necrotic' }) } : {}),
});

/** A SLOWING STACK'S SLOW, permille, at its fixed `scale` (status.js stackScale: the landing's tier share, 1000 with none):
    round(slowPm x scale / 1000). One formula for the engine (damage.js slowed) and the bar's words. 0 for a row that slows nothing. */
export function slowAt(row, scale) {
  if (!row || !Number.isInteger(row.slowPm)) return 0;
  const s = Number.isInteger(scale) ? scale : 1000;
  return Math.floor((row.slowPm * s + 500) / 1000);
}

/** The permille a slowing row's stack lands at from a cast of rune tier `tier` (its `tierPermille`, 1000 with none or no tier). */
export function slowScaleAt(row, tier) {
  const list = row && Array.isArray(row.tierPermille) ? row.tierPermille : null;
  return list && Number.isInteger(tier) && tier >= 1 && tier <= list.length ? list[tier - 1] : 1000;
}

const ID = /^[a-z0-9_]{1,32}$/;

/** Every problem with one status row, as strings. Empty = valid. */
export function validateStatus(row) {
  if (!row || typeof row !== 'object') return ['status row is not an object'];
  const out = [];
  const at = 'status ' + row.id + ': ';
  const posInt = (k) => { if (!Number.isInteger(row[k]) || row[k] <= 0) out.push(at + k + ' must be a positive integer, got ' + row[k]); };
  if (typeof row.id !== 'string' || !ID.test(row.id)) out.push('status id ' + row.id + ' is not [a-z0-9_]');
  if (typeof row.name !== 'string' || !row.name) out.push(at + 'needs a name');
  if (row.healCutPm !== undefined) {
    /* A HEAL-CUTTING status (Withered): how much less a hero and a monster heal, how long, how many, the element whose guard
       lowers a hero's cut; nothing that ticks, marks, slows or scales. */
    const c = row.healCutPm;
    if (!c || typeof c !== 'object' || Object.keys(c).sort().join() !== 'hero,monster' || !['hero', 'monster'].every((k) => Number.isInteger(c[k]) && c[k] > 0 && c[k] < 1000)) {
      out.push(at + 'healCutPm must be { hero, monster }, each an integer 1..999 (a cut never stops a heal whole)');
    }
    for (const k of ['durationMs', 'maxStacks']) posInt(k);
    if (Number.isInteger(row.durationMs) && row.durationMs % HUNT_TUNING.stepMs !== 0) out.push(at + 'durationMs ' + row.durationMs + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
    if (row.guard !== undefined && !isElement(row.guard)) out.push(at + 'guard must be an element id, got ' + row.guard);
    for (const k of ['tick', 'everyMs', 'blowPm', 'tierPermille', 'damageType', 'takenPm', 'slowPm']) if (row[k] !== undefined) out.push(at + 'a heal-cutting status has no ' + k);
    return out;
  }
  if (row.takenPm !== undefined || row.slowPm !== undefined) {
    /* A MARKING status (how much more its unit takes) or a SLOWING one (how much longer its swings and windups run):
       how much, how long, how many; one or the other, and nothing that ticks or scales. */
    const kind = row.takenPm !== undefined ? 'takenPm' : 'slowPm';
    if (row.takenPm !== undefined && row.slowPm !== undefined) out.push(at + 'a status marks or slows, never both');
    if (!Number.isInteger(row[kind]) || row[kind] <= 0 || row[kind] > 1000) out.push(at + kind + ' must be an integer 1..1000');
    for (const k of ['durationMs', 'maxStacks']) posInt(k);
    if (Number.isInteger(row.durationMs) && row.durationMs % HUNT_TUNING.stepMs !== 0) out.push(at + 'durationMs ' + row.durationMs + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
    /* A slowing status may grow with the rune tier of the cast that lands it (tierPermille); a marking one is fixed (Bible §17). */
    const own = kind === 'slowPm' ? ['tierPermille'] : [];
    for (const k of ['tick', 'everyMs', 'blowPm', 'tierPermille', 'damageType']) if (row[k] !== undefined && !own.includes(k)) out.push(at + 'a ' + (kind === 'takenPm' ? 'marking' : 'slowing') + ' status has no ' + k);
    if (kind === 'slowPm' && row.tierPermille !== undefined) {
      const tp = row.tierPermille;
      if (!Array.isArray(tp) || !tp.length || !tp.every((n) => Number.isInteger(n) && n >= 1000)) out.push(at + 'tierPermille must be a non-empty list of integers >= 1000');
      else if (tp.some((n, i) => i && n < tp[i - 1])) out.push(at + 'tierPermille must not fall with tier');
      else if (slowAt(row, tp[tp.length - 1]) > 1000) out.push(at + 'its deepest tier slows more than 1000 permille');
    }
    return out;
  }
  if (!Array.isArray(row.tick) || row.tick.length !== 2 || !row.tick.every((n) => Number.isInteger(n) && n >= 1) || row.tick[0] > row.tick[1]) {
    out.push(at + 'tick must be [min, max], integers >= 1, min <= max');
  }
  for (const k of ['everyMs', 'durationMs', 'maxStacks']) posInt(k);
  for (const k of ['everyMs', 'durationMs']) {
    if (Number.isInteger(row[k]) && row[k] % HUNT_TUNING.stepMs !== 0) out.push(at + k + ' ' + row[k] + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  }
  /* THE SPELL RULE (lane/c-spell-rule): a tick is a share of its source's own blow, never a number that grows with a skill level. */
  if (!Number.isInteger(row.blowPm) || row.blowPm < 1 || row.blowPm > 1000) out.push(at + 'blowPm must be an integer 1..1000 (permille of the source\'s largest blow a tick)');
  for (const k of ['scalesWith', 'skillPermillePerLevel']) if (row[k] !== undefined) out.push(at + k + ' is retired by the spell rule: a tick is a share of its source\'s blow (blowPm)');
  if (!Array.isArray(row.tierPermille) || !row.tierPermille.length || !row.tierPermille.every((n) => Number.isInteger(n) && n >= 1000)) {
    out.push(at + 'tierPermille must be a non-empty list of integers >= 1000');
  } else {
    for (let i = 1; i < row.tierPermille.length; i++) if (row.tierPermille[i] < row.tierPermille[i - 1]) out.push(at + 'tierPermille must not fall with tier');
  }
  /* 'physical' or an element id from the one vocabulary (src/data/elements.js, contract §1.5). */
  if (row.damageType !== PHYSICAL && !isElement(row.damageType)) out.push(at + 'damageType must be physical or an element id, got ' + row.damageType);
  return out;
}

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  for (const [key, row] of Object.entries(STATUSES)) {
    if (!row || row.id !== key) out.push('status key ' + key + ' must equal its row id');
    out.push(...validateStatus(row));
  }
  return out;
}
