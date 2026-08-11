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

import { levelOf } from './xp.js?v=322';

export const WEAPON_TYPES = {
  sword: '1H Sword', magic: 'Magic', ranged: 'Ranged', neutral: 'Neutral', hammer: '2H Hammer',
};
export const WEAKNESS_BONUS = { damage: 1.20, accuracy: 1.15 };
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

// ── Derived equipment state ──────────────────────────────────────────────

export function equipmentStats(equipment, items) {
  const s = { atkB: 0, strB: 0, defB: 0, critB: 0, xpB: 0, spdB: 0, weaponType: 'neutral' };
  if (!equipment) return s;
  Object.entries(equipment).forEach(([slot, id]) => {
    const it = items && items[id];
    if (!it) return;
    s.atkB += it.atkB || 0; s.strB += it.strB || 0; s.defB += it.defB || 0;
    s.critB += it.critB || 0; s.xpB += it.xpB || 0; s.spdB += it.spdB || 0;
    if (slot === 'weapon' && it.weaponType) s.weaponType = it.weaponType;
  });
  return s;
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

export function weaknessInfo(monster, eq) {
  const weak = (monster && monster.weaponWeak) || 'neutral';
  const matched = weak !== 'neutral' && eq && eq.weaponType === weak;
  return {
    weak,
    matched: !!matched,
    damageMult: matched ? WEAKNESS_BONUS.damage : 1,
    accuracyMult: matched ? WEAKNESS_BONUS.accuracy : 1,
    dropMult: weak === 'neutral' ? NEUTRAL_DROP_BONUS : 1,
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
