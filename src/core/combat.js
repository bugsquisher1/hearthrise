// ============================================================
// src/core/combat.js — combat balance constants and every roll derived
// from them. AUTHORITATIVE; legacy.js delegates here.
//
// SIGNATURE DISCIPLINE (server-authority design §4.3): nothing in this
// file reads a free variable. State arrives as arguments:
//
//   equipment  — { slot: itemId | null }        (client: G.equipment)
//   items      — the ITEMS catalogue            (src/data/items.js)
//   skills     — { skillId: xp }                (client: G.skills)
//   bonus(key) — the perk-stack reader. On the client this is the
//                wrapped getBonus chain; on the server it is the
//                server-side perk sum. Either way it is INJECTED, so
//                core never has an opinion about where perks come from.
//   rng        — src/core/rng.js contract (only for the roll* helpers)
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { levelOf } from './xp.js?v=362';
import {
  baneIndex, baneMultFor, classOfMonster, MAX_COMBINED_DAMAGE_MULT,
} from './bane.js?v=362';

/* `neutral` is retired as a MONSTER weakness (DEC-NEUT-01) but survives here
   as a WEAPON type — an unarmed/typeless loadout still has to render. */
export const WEAPON_TYPES = {
  sword: '1H Sword', magic: 'Magic', ranged: 'Ranged', neutral: 'Neutral', hammer: '2H Hammer',
};
export const WEAKNESS_BONUS = { damage: 1.20, accuracy: 1.15 };
/* The drop-rate the 7 formerly-`neutral` monsters were paid for opting out of
   the triangle. Now a documented default carried per-row as `dropBonus`, not
   a branch in `weaknessInfo`. See that function's header. */
export const NEUTRAL_DROP_BONUS = 1.15;

export const COMBAT_BALANCE = {
  playerBaseAccuracy: 0.55,
  playerAccuracyPerPoint: 0.01,
  playerMinAccuracy: 0.15,
  playerMaxAccuracy: 0.95,
  strengthLevelScale: 0.35,
  strengthBonusScale: 0.60,
  playerBaseMaxHit: 2,
  monsterDefenseDamageReduction: 0.03,
  monsterBaseAccuracy: 0.50,
  monsterAccuracyPerPoint: 0.006,
  monsterMinAccuracy: 0.10,
  monsterMaxAccuracy: 0.85,
  monsterAttackDamageScale: 0.45,
  defenseXpMiss: 1,
  defenseXpDamageScale: 2,
  tickMs: 2400,
  /* THE FLOOR ON A SWING. `combatTickMs()` clamps to this, and so does
     `simulateSpan` — because a tick interval is a DIVISOR of elapsed time on
     the accrual path, and a divisor is an exploit surface. It lives here,
     beside `tickMs`, so the live scheduler and the away replay cannot be
     given two different minima the way they were once given two different
     intervals (see combat-sim.js's header, omission 10). */
  minTickMs: 600,
  critMult: 1.5,
  critCap: 0.60,
};

/* Wave 5: weapon-family SPEED identity — multiplies the swing interval so
   DPS trades against per-hit burst. */
export const WEAPON_SPEED_MOD = { sword: 1.0, hammer: 1.35, ranged: 0.88, magic: 1.05, neutral: 1.0 };

/* Wave 5b: endgame DEF scaling for ACCURACY only, so weapon atkB still
   matters at the top of the ladder. Tiers 1-3 unchanged. */
export const ACC_DEF_MUL = { 4: 1.15, 5: 1.30, 6: 1.50 };

export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/* The default stat profile when no combat-style module has loaded. */
export const DEFAULT_PROFILE = {
  type: 'sword', accuracySkill: 'attack', damageSkill: 'strength',
  accuracyBonusField: 'atkB', strengthBonusField: 'strB',
};
export const DEFAULT_STYLE = { accuracyMod: 1, damageMod: 1, defenseMod: 1, speedMod: 1 };

/* A style may only ever COST speed, never grant it. See the b329 header in
   src/core/styles.js: making this an invariant of the FORMULA (rather than a
   promise about the table) is what stops combat styles from becoming a second
   speed ladder next to the unresolved `spdB` question, and it means a garbage
   or hostile style row can never shrink the divisor the accrual engine uses. */
export const STYLE_SPEED_MIN = 1.00;
export const STYLE_SPEED_MAX = 2.00;

// ── Derived equipment state ──────────────────────────────────────────────

export function equipmentStats(equipment, items) {
  const s = {
    atkB: 0, strB: 0, defB: 0, critB: 0, xpB: 0, spdB: 0, weaponType: 'neutral',
    /* class → best bane multiplier, or null when no bane gear is worn. Derived
       here (rather than in weaknessInfo) because this is the ONE function that
       already walks the equipped set, and because both engines — the live tick
       and the Edge accrual — take this object as their equipment input. See
       src/core/bane.js for why a `getBonus` key would have read as zero away. */
    bane: null,
  };
  if (!equipment) return s;
  Object.entries(equipment).forEach(([slot, id]) => {
    const it = items && items[id];
    if (!it) return;
    s.atkB += it.atkB || 0; s.strB += it.strB || 0; s.defB += it.defB || 0;
    s.critB += it.critB || 0; s.xpB += it.xpB || 0; s.spdB += it.spdB || 0;
    if (slot === 'weapon' && it.weaponType) s.weaponType = it.weaponType;
  });
  s.bane = baneIndex(equipment, items);
  return s;
}

/**
 * THE SWING INTERVAL. **One formula, three callers.**
 *
 * This expression existed TWICE before b329 — `combatTickMs()` in legacy.js and
 * `deriveTickMs()` in supabase/functions/hr-accrue/accrual.js — with a comment
 * in the second promising it was "byte-for-byte the same expression as the
 * client's". Two copies reconciled by a comment is precisely how a hammer came
 * to swing 26% more often asleep than awake (combat-sim.js header, omission 10),
 * so adding a THIRD term (`style.speedMod`) to two copies was not an option.
 * Both callers now delegate here. There is nowhere left to add a term to only
 * one of them.
 *
 * interval = clamp_floor( base × (1 − spdB) × familyMod × styleSpeedMod )
 *
 *   spdB           gear speed, clamped to 20% (b245)
 *   familyMod      the weapon family's speed identity (Wave 5)
 *   styleSpeedMod  the chosen style's cost, clamped to [1.00, 2.00] (b329) —
 *                  a style can only ever be SLOWER than its family baseline
 *
 * The `minTickMs` floor is the last word for the same reason it always was: on
 * the accrual path this number is a DIVISOR of elapsed time.
 *
 * @param eq     equipmentStats() output
 * @param style  the resolved COMBAT_STYLES row (null/undefined = no modifier)
 */
export function swingIntervalMs(eq, style) {
  const spd = clamp(((eq && eq.spdB) || 0), 0, 0.20);
  const wmod = WEAPON_SPEED_MOD[(eq && eq.weaponType)] || 1;
  const raw = Number(style && style.speedMod);
  const smod = isFinite(raw) ? clamp(raw, STYLE_SPEED_MIN, STYLE_SPEED_MAX) : STYLE_SPEED_MIN;
  return Math.max(
    COMBAT_BALANCE.minTickMs,
    Math.floor(COMBAT_BALANCE.tickMs * (1 - spd) * wmod * smod),
  );
}

/* Wave 5c / b283: a SET is 5+ pieces of the same material tier AND the same
   armour archetype. Derived from item.tier — no per-item authoring. */
export function armorSetBonus(equipment, items) {
  if (!equipment) return null;
  const counts = {};
  Object.values(equipment).forEach((id) => {
    const it = items && items[id];
    if (it && it.type === 'armor' && it.tier) {
      const cls = it.armourClass || 'plate';
      const k = it.tier + '|' + cls;
      counts[k] = (counts[k] || 0) + 1;
    }
  });
  let bestKey = null; let bestCount = 0;
  for (const k in counts) { if (counts[k] > bestCount) { bestCount = counts[k]; bestKey = k; } }
  if (bestCount >= 5 && bestKey) {
    const [t, cls] = bestKey.split('|');
    return { tier: +t, armourClass: cls, pieces: bestCount, critB: (+t) * 0.01 };
  }
  return null;
}

/**
 * The one place a monster's defensive profile meets the player's loadout.
 *
 * THREE concerns, merged in b356 from two workstreams that each rewrote this
 * function. Read all three before touching it.
 *
 * 1. WEAPON WEAKNESS — the live +20%/+15% for bringing the class's weak
 *    weapon type.
 * 2. BANE — a class multiplier carried by an ITEM (`item.bane`), clamped by
 *    `MAX_BANE_MULT` inside src/core/bane.js. It lives here rather than in
 *    `getBonus` precisely so that away accrual sees it; read that file's
 *    header before moving it. The product of (1) and (2) is clamped to
 *    `MAX_COMBINED_DAMAGE_MULT`, so the ceiling is a property of THIS
 *    expression and not of the item table.
 * 3. `neutral` IS RETIRED (DEC-NEUT-01). Every monster in the taxonomy now
 *    answers a real weapon, so `weaponWeak === 'neutral'` can no longer be
 *    true. The 7 monsters that used to opt out were paid a x1.15 drop rate
 *    for it; deleting `neutral` would have silently cut their drops 13% —
 *    including the Green Dragon. The bonus is RE-HOMED as an explicit
 *    per-monster `dropBonus` field on exactly those 7 rows, so drop identity
 *    is DATA rather than a side effect of having no weakness.
 *    `NEUTRAL_DROP_BONUS` stays exported as the documented default those
 *    rows carry (core-bridge and the vendored server copy read the symbol).
 *
 * `weak` may still be falsy if a caller passes a monster from outside the
 * roster — it then never matches, the safe direction (no bonus, not a free one).
 *
 * `baneMult`/`baneClass` are returned so the away card and the monster panel
 * can SAY why a night went the way it did without recomputing anything.
 */
export function weaknessInfo(monster, eq) {
  const weak = (monster && monster.weaponWeak) || null;
  const matched = !!(weak && eq && eq.weaponType === weak);
  const weaponMult = matched ? WEAKNESS_BONUS.damage : 1;

  const baneClass = classOfMonster(monster);
  const baneMult = baneMultFor(baneClass, eq && eq.bane);
  const damageMult = Math.min(weaponMult * baneMult, MAX_COMBINED_DAMAGE_MULT);

  const bonus = Number(monster && monster.dropBonus);
  return {
    weak,
    matched,
    damageMult,
    accuracyMult: matched ? WEAKNESS_BONUS.accuracy : 1,
    dropMult: Number.isFinite(bonus) && bonus > 0 ? bonus : 1,
    /* Bane readout — 1 and null when no bane gear applies. */
    baneClass: baneMult > 1 ? baneClass : null,
    baneMult,
  };
}

// ── The rolls ────────────────────────────────────────────────────────────

/**
 * @param monster the MONSTERS row
 * @param ctx { eq, skills, equipment, items, profile, style, bonus, setBonus }
 *        `setBonus` may be omitted — it is then derived from equipment+items.
 *        `bonus` may be omitted — it then contributes 0 (the inert case).
 */
export function playerCombatRolls(monster, ctx) {
  const c = ctx || {};
  const items = c.items || {};
  const eq = c.eq || equipmentStats(c.equipment, items);
  const skills = c.skills || {};
  const bonus = typeof c.bonus === 'function' ? c.bonus : () => 0;
  const profile = c.profile || DEFAULT_PROFILE;
  const style = c.style || DEFAULT_STYLE;
  const weak = weaknessInfo(monster, eq);

  /* Sum typed bonuses from equipment (the profile decides WHICH fields —
     a staff reads magic bonuses, a bow reads ranged). */
  let accBonus = 0; let strBonus = 0;
  Object.values(c.equipment || {}).forEach((id) => {
    const it = items[id];
    if (!it) return;
    accBonus += (it[profile.accuracyBonusField] || 0);
    strBonus += (it[profile.strengthBonusField] || 0);
  });
  const accLvl = levelOf(skills, profile.accuracySkill);
  const dmgLvl = levelOf(skills, profile.damageSkill);

  const mTier = (monster && monster.tier) || 1;
  const defScore = ((monster && monster.def) || 0) * (ACC_DEF_MUL[mTier] || 1);

  let accuracy = 0.55 + (((accLvl + accBonus) - defScore) * 0.01);
  accuracy *= (style.accuracyMod || 1);
  accuracy *= weak.accuracyMult;
  accuracy = Math.max(0.15, Math.min(0.95, accuracy));

  let maxHit = Math.floor((dmgLvl * 0.35) + (strBonus * 0.6) + 2);
  maxHit = Math.max(1, Math.floor(maxHit - (defScore * 0.03)));
  maxHit = Math.max(1, Math.floor(maxHit * (style.damageMod || 1)));
  maxHit = Math.max(1, Math.floor(maxHit * (weak.damageMult || 1)));

  const dmgBuff = bonus('damage') || 0;
  if (dmgBuff) maxHit = Math.max(1, Math.floor(maxHit * (1 + dmgBuff)));

  const critBuff = bonus('crit') || 0;
  const set = (c.setBonus !== undefined) ? c.setBonus : armorSetBonus(c.equipment, items);
  const critChance = clamp((eq.critB || 0) + critBuff + (set ? set.critB : 0), 0, COMBAT_BALANCE.critCap);

  return { accuracy, maxHit, critChance, weak, profile, style };
}

/**
 * @param ctx { eq, skills, bonus }
 */
export function monsterCombatRolls(monster, ctx) {
  const c = ctx || {};
  const b = COMBAT_BALANCE;
  const eq = c.eq || {};
  const bonus = typeof c.bonus === 'function' ? c.bonus : () => 0;
  const playerDefense = levelOf(c.skills || {}, 'defense') + (eq.defB || 0) + (bonus('defense') || 0);
  const accuracy = clamp(
    b.monsterBaseAccuracy + ((((monster && monster.atk) || 1) - playerDefense) * b.monsterAccuracyPerPoint),
    b.monsterMinAccuracy, b.monsterMaxAccuracy,
  );
  const maxHit = Math.max(1, Math.floor(((monster && monster.atk) || 1) * b.monsterAttackDamageScale));
  return { accuracy, maxHit };
}

// ── Seeded resolution helpers (the pieces combatTick spends RNG on) ──────

/** One swing: miss → 0, hit → uniform 1..maxHit. Two draws max, in order. */
export function rollAttack(rng, accuracy, maxHit) {
  if (!rng.chance(accuracy)) return 0;
  return rng.int(1, maxHit);
}

/** Crit is rolled only on a landed hit, matching the live loop's draw order. */
export function rollCrit(rng, critChance) {
  return rng.chance(critChance || 0);
}

export function applyCrit(damage, critMult) {
  return Math.max(damage + 1, Math.floor(damage * (critMult || COMBAT_BALANCE.critMult)));
}
