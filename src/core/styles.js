// ============================================================
// src/core/styles.js — combat styles, and the XP ROUTING TABLE.
//
// WHY THIS IS ITS OWN MODULE
// "Which skill does this hit train?" was answered in FOUR places in
// legacy.js — combatTick (the live per-damage grant), killMonster (the
// per-kill grant), processOfflineCombat (the away per-damage grant), and
// the activity bar's hint — each re-implementing the same
// `Object.entries(style.xp).forEach(...)` walk with its OWN fallback. The
// fallbacks were not even the same: a missing style makes a live hit pay
// Attack AND Strength, but makes a kill pay Attack only.
//
// That is exactly the shape of the away-loop divergences the design ruling
// (docs/design/away-time-ruling.md) is written to end: away combat granted
// per-damage XP but never `m.xp`, because the kill route lived in a
// function the away loop did not call. ~21% of all combat XP, missing.
// This module makes the route a value, not a code path, so one
// `simulate*(ctx)` can serve both the live tick and server accrual.
//
// NOTE ON SCOPE: this extraction does NOT change what is granted. It moves
// the four walks onto one function with the CURRENT behaviour, fallbacks
// included, so the accrual engine has a single seam to change (and a
// parity test to change it against).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* The table itself. Published onto the client global by core-bridge.js so
   the style picker, the activity bar and the server all read ONE object. */
export const COMBAT_STYLES = {
  sword: {
    accurate: { name: 'Accurate', trains: 'Attack', accuracyMod: 1.05, damageMod: 1.00, defenseMod: 1.00, xp: { attack: 1 } },
    aggressive: { name: 'Aggressive', trains: 'Strength', accuracyMod: 1.00, damageMod: 1.05, defenseMod: 1.00, xp: { strength: 1 } },
    defensive: { name: 'Defensive', trains: 'Defense', accuracyMod: 1.00, damageMod: 1.00, defenseMod: 1.05, xp: { defense: 1 } },
    controlled: { name: 'Controlled', trains: 'Atk/Str/Def', accuracyMod: 1.02, damageMod: 1.02, defenseMod: 1.02, xp: { attack: 0.33, strength: 0.33, defense: 0.34 } },
  },
  hammer: {
    smash: { name: 'Smash', trains: 'Strength', accuracyMod: 1.00, damageMod: 1.12, defenseMod: 1.00, xp: { strength: 1 } },
    crush: { name: 'Crush', trains: 'Atk/Str', accuracyMod: 1.03, damageMod: 1.08, defenseMod: 1.00, xp: { attack: 0.5, strength: 0.5 } },
    guard: { name: 'Guarded Smash', trains: 'Def/Str', accuracyMod: 1.00, damageMod: 1.04, defenseMod: 1.05, xp: { defense: 0.5, strength: 0.5 } },
  },
  ranged: {
    rapid: { name: 'Rapid', trains: 'Ranged', accuracyMod: 1.00, damageMod: 1.00, defenseMod: 1.00, xp: { ranged: 1 } },
    precise: { name: 'Precise', trains: 'Ranged', accuracyMod: 1.08, damageMod: 1.00, defenseMod: 1.00, xp: { ranged: 1 } },
    longrange: { name: 'Longrange', trains: 'Ranged/Def', accuracyMod: 1.04, damageMod: 0.98, defenseMod: 1.05, xp: { ranged: 0.5, defense: 0.5 } },
  },
  magic: {
    cast: { name: 'Cast', trains: 'Magic', accuracyMod: 1.00, damageMod: 1.00, defenseMod: 1.00, xp: { magic: 1 } },
    focus: { name: 'Focus', trains: 'Magic', accuracyMod: 1.08, damageMod: 1.03, defenseMod: 1.00, xp: { magic: 1 } },
    warded: { name: 'Warded Cast', trains: 'Magic/Def', accuracyMod: 1.02, damageMod: 0.98, defenseMod: 1.05, xp: { magic: 0.5, defense: 0.5 } },
  },
};

/** The style a fresh character (or a corrupt save) gets per weapon type. */
export const DEFAULT_STYLE_KEYS = { sword: 'accurate', hammer: 'smash', ranged: 'rapid', magic: 'cast' };

/** The style object used when a weapon type or a stored key is unknown. */
export const FALLBACK_STYLE = COMBAT_STYLES.sword.accurate;

/** Damage-XP multiplier: a hit for N pays N x 4 to the trained skill(s). */
export const HIT_XP_PER_DAMAGE = 4;
/** Hitpoints XP is a flat share of damage, floored, on every landed hit. */
export const HIT_HP_XP_PER_DAMAGE = 1.33;

/**
 * Resolve the active style from persisted state.
 * @param weaponType  'sword' | 'hammer' | 'ranged' | 'magic'
 * @param styleKeys   the player's per-weapon choice map (G.combatStyle)
 */
export function resolveStyle(weaponType, styleKeys) {
  const t = COMBAT_STYLES[weaponType] ? weaponType : 'sword';
  const family = COMBAT_STYLES[t];
  const key = (styleKeys && styleKeys[t]) || Object.keys(family)[0];
  return family[key] || FALLBACK_STYLE;
}

/** Fill in any missing per-weapon choice. Mutates and returns the map. */
export function normaliseStyleKeys(styleKeys) {
  const m = (styleKeys && typeof styleKeys === 'object') ? styleKeys : {};
  for (const t in DEFAULT_STYLE_KEYS) { if (!m[t]) m[t] = DEFAULT_STYLE_KEYS[t]; }
  return m;
}

/**
 * The XP a LANDED HIT pays, as a list of grants.
 *
 * Current behaviour, preserved exactly: styled hits split `dmg x 4` by the
 * style's ratios; an unresolved style pays `dmg x 4` to Attack AND
 * Strength (i.e. double); Hitpoints always gets floor(dmg x 1.33).
 *
 * @returns [{ skill, amount }]
 */
export function hitXpRoute(style, dmg) {
  const out = [];
  if (!(dmg > 0)) return out;
  if (style && style.xp) {
    for (const sk in style.xp) out.push({ skill: sk, amount: dmg * HIT_XP_PER_DAMAGE * style.xp[sk] });
  } else {
    /* The pre-styles fallback. Kept because a save whose weapon type has no
       style table must still train something, not nothing. */
    out.push({ skill: 'attack', amount: dmg * HIT_XP_PER_DAMAGE });
    out.push({ skill: 'strength', amount: dmg * HIT_XP_PER_DAMAGE });
  }
  out.push({ skill: 'hitpoints', amount: Math.floor(dmg * HIT_HP_XP_PER_DAMAGE) });
  return out;
}

/**
 * The XP a KILL pays, as a list of grants.
 *
 * @param style       the resolved style (may be null)
 * @param monsterXp   MONSTERS[id].xp
 * @param xpMult      the Boss-of-the-Day combat-XP multiplier (1 when not
 *                    featured). Per the away ruling this applies away too,
 *                    resolved per UTC-day segment by the CALLER — this
 *                    function only multiplies.
 * @returns [{ skill, amount }]
 *
 * NOTE the asymmetry with hitXpRoute: the kill fallback pays Attack ONLY.
 * That is legacy.js's behaviour and it is preserved deliberately; changing
 * it is a design call, not an extraction call.
 */
export function killXpRoute(style, monsterXp, xpMult) {
  const xp = (Number(monsterXp) || 0) * (typeof xpMult === 'number' ? xpMult : 1);
  if (style && style.xp) {
    const out = [];
    for (const sk in style.xp) out.push({ skill: sk, amount: xp * style.xp[sk] });
    return out;
  }
  return [{ skill: 'attack', amount: xp }];
}
