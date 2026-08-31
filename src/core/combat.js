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

import { levelOf } from './xp.js?v=498';
import {
  baneIndex, baneMultFor, classOfMonster, MAX_COMBINED_DAMAGE_MULT,
} from './bane.js?v=498';
import { isElement, elementMultFor, MAX_TOTAL_DAMAGE_MULT } from './elements.js?v=498';

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

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ EQUIPPED DOES NOT IMPLY HELD. `equipment[slot]` NAMES AN ITEM; IT IS NOT
     A CLAIM THAT THE CHARACTER STILL OWNS ONE.

   This function reads the equipment MAP and nothing else — it never consults
   an inventory, and it must not start to without a ruling (see below). So a
   slot can name an item the bag no longer contains, and every stat on that
   item still counts.

   THAT STATE USED TO BE UNREACHABLE THROUGH PLAY and became ordinary on
   2026-08-31 (design item E1, src/core/ammo.js). The `ammo` slot is a POINTER
   by ruling — consumable-economy.md §2.2: the slot names WHICH stack is in use
   and the quiver stays in `inventory` — and the fight now SPENDS that stack. An
   archer who looses their last arrow, or a swordsman whose whetstone wears
   through, ends the swing with a populated slot and an empty bag. Nothing
   unequips them: neither the engine nor `hr_apply` writes an equipment key on a
   consumption, deliberately, because an engine that silently rearranged a
   player's loadout overnight would be a worse surprise than the one it fixed.

   WHAT THIS MEANS FOR ANYONE WRITING CODE AGAINST THIS FUNCTION:
     · `equipment.ammo === 'steel_arrows'` does NOT license
       `inventory.steel_arrows > 0`. Ask the inventory.
     · `src/core/ammo.js readAmmo` is the ONE reader that answers both at once —
       `{ id, stock, dry }` — and every consumer should go through it rather
       than re-deriving "am I supplied?" from the equipment map.
     · The stat consequence is DOCUMENTED, not accidental: a burnt-out whetstone
       still pays its `strB`. For ranged/magic the x0.25 dry penalty dwarfs it;
       for melee, which by R5 takes no penalty, it means one stone buys a
       lasting bonus. That is an open DESIGN question (CONFLICTS.md 2026-08-31
       item 3), and closing it is precisely "teach this function about stock" —
       a change to the one function both engines share, every loadout's numbers
       run through, and both AWAY-1 columns read. It wants its own commit and a
       Designer ruling, not a quiet parameter.

   Pinned by tests/accrual-engine.mjs AMMO-E5, which asserts this state ARISES
   from an ordinary span and is stable — so code that assumes equipped ⇒ held
   goes red with this note attached instead of being quietly wrong.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * @param equipment { slot: itemId | null }
 * @param items     the ITEMS catalogue
 * @param enchant   OPTIONAL `{ weapon: '<element>' }` (client: G.enchant; the
 *                  server passes its own authored enchant). Stamps `eq.element`
 *                  — the element the weapon-slot enchant binds — EXACTLY
 *                  parallel to `eq.bane`, and read the same way by both engines
 *                  inside `weaknessInfo`. See src/core/elements.js for why this
 *                  is a factor here and never a `getBonus` key. A missing/blank
 *                  enchant, an invalid element, or a weapon slot that does not
 *                  actually hold a weapon all leave `eq.element` null — the safe
 *                  direction (no bonus, never a forged one).
 */
export function equipmentStats(equipment, items, enchant) {
  const s = {
    atkB: 0, strB: 0, defB: 0, critB: 0, xpB: 0, spdB: 0, weaponType: 'neutral',
    /* class → best bane multiplier, or null when no bane gear is worn. Derived
       here (rather than in weaknessInfo) because this is the ONE function that
       already walks the equipped set, and because both engines — the live tick
       and the Edge accrual — take this object as their equipment input. See
       src/core/bane.js for why a `getBonus` key would have read as zero away. */
    bane: null,
    /* the element bound to the weapon, or null. Its twin `bane` above. */
    element: null,
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
  /* ⚠ THE ENCHANT ONLY BINDS A REAL WEAPON. An enchant persists on the save
     independently of gear (G.enchant survives an unequip), so without this
     guard an empty or non-weapon weapon slot would still pay the element. Both
     the client (on equip-swap) and the server clear the enchant when the weapon
     changes, but this is the belt-and-braces that makes a stale enchant inert
     rather than a free +15% on bare fists. */
  if (enchant && isElement(enchant.weapon)) {
    const wid = equipment.weapon;
    const wit = wid && items ? items[wid] : null;
    if (wit && wit.type === 'weapon') s.element = enchant.weapon;
  }
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

  /* ELEMENT — the third damage factor, the twin of bane. A weapon-slot enchant
     (`eq.element`, stamped by equipmentStats) pays a flat +15% against a
     monster WEAK to that element and nothing otherwise (pure upside — v1 gives
     resist/immune no distinct number). Read here, inside the ONE expression
     both the live tick and the Edge accrual call, so an enchanted weapon pays
     away nights identically to awake ones with no second code path. See
     src/core/elements.js. */
  const element = (eq && eq.element) || null;
  const elementMult = elementMultFor(monster, element);
  const elementMatched = elementMult > 1;

  /* THE CEILING IS THE FORMULA'S. weapon × bane × element, clamped to
     MAX_TOTAL_DAMAGE_MULT so a future fourth factor cannot quietly stack past
     the stated ceiling — the same invariant bane.js states for its pair. */
  const damageMult = Math.min(weaponMult * baneMult * elementMult, MAX_TOTAL_DAMAGE_MULT);

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
    /* Element readout — the enchanted element, whether it MATCHED this monster,
       and the factor. null/false/1 when no enchant applies, so the away card
       and the monster panel can SAY why a night went the way it did. */
    element,
    elementMatched,
    elementMult,
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
  /* ⚠ `- Math.floor(defScore * 0.03)`, NOT `Math.floor(maxHit - defScore*0.03)`.
     b495 (balance audit) — THE TRUNCATION TAX. `maxHit` is ALREADY an integer
     on the line above, so `floor(int - 0.03)` is `int - 1`: ANY monster with
     def >= 1 cost a full point of max hit, and armour reduction only reached
     its second point at defScore > 33. The damage was therefore a step
     function of nothing — the intended 3%-per-defence-point curve never ran;
     what ran was a flat -1 across the whole tier-1..tier-3 band.

     It is worst exactly where it hurts most. Measured against the shipped
     formula (full tier-matched plate + that tier's sword, combat levels at the
     gear gate):

       fresh char vs Goblin (def 1)     3 -> 4   +33%
       Iron   vs Wolf       (def 3)     9 -> 10  +11%
       Steel  vs Dire Wolf  (def 7)    17 -> 18   +6%
       Mithril vs Bear      (def 16)   25 -> 26   +4%
       Rune   vs Giant Boar (def 33)   33 -> 34   +3%
       Ember  vs Revenant   (def 50)   41 -> 42   +2%
       Dawn   vs Revenant   (def 50)   50 -> 51   +2%

     Self-scaling by construction: the correction is one point everywhere, so
     it is a 33% buff to the character who has 3 max hit and a 2% buff to the
     one who has 50. That is precisely the shape the first hour needed and the
     endgame did not, which is why the fix is this expression rather than a
     tuned constant. A def-0 monster (Slime, Giant Rat, Imp…) is UNCHANGED —
     floor(0 * 0.03) is 0 either way — so AWAY-HONEST-3's Slime acceptance
     window does not move.

     One expression, both engines: supabase/functions/hr-accrue/accrual.js
     imports THIS file, so the away replay follows with no second edit. */
  maxHit = Math.max(1, maxHit - Math.floor(defScore * COMBAT_BALANCE.monsterDefenseDamageReduction));
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
