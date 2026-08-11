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

/* ── b329 · `speedMod`: the style speed differential (Xarn, live report) ──
   "The attack speed for Rapid, Precise and Longrange is the same."
   He was right. `combatTickMs()` read gear speed (`spdB`) and the weapon-FAMILY
   speed identity (`WEAPON_SPEED_MOD`) and nothing else — a style has never had
   a speed term anywhere in the engine, so a style literally named *Rapid* swung
   at exactly the rate of the two styles it is supposed to be faster than.

   `speedMod` MULTIPLIES the swing interval, so it is a COST, never a gift:
   `swingIntervalMs()` clamps it to [1.00, 2.00], which makes "no style may swing
   faster than its weapon family's baseline" an invariant of the formula rather
   than a promise about the table. That is deliberate and it is the answer to the
   open `spdB` question: styles are a mutually-exclusive free toggle that BUYS
   speed with accuracy/damage, so they cannot stack, cannot be acquired, and can
   never become a speed-gear ladder. The default style of every family sits at
   1.00, so the pacing anchor is the number it always was.

   `desc` is the player-facing promise, and it states only what the SIM ACTUALLY
   APPLIES. Note what it never says: "+5% defence". `defenseMod` below is read by
   NOTHING (see the handoff in DISCOVERIES) — writing it into the copy would be
   Xarn's bug in reverse. When defenseMod goes live, the copy follows it, not
   before. */

/* The table itself. Published onto the client global by core-bridge.js so
   the style picker, the activity bar and the server all read ONE object. */
export const COMBAT_STYLES = {
  sword: {
    accurate: { name: 'Accurate', trains: 'Attack', desc: '+5% accuracy', accuracyMod: 1.05, damageMod: 1.00, defenseMod: 1.00, speedMod: 1.00, xp: { attack: 1 } },
    aggressive: { name: 'Aggressive', trains: 'Strength', desc: '+5% max hit', accuracyMod: 1.00, damageMod: 1.05, defenseMod: 1.00, speedMod: 1.00, xp: { strength: 1 } },
    defensive: { name: 'Defensive', trains: 'Defense', desc: 'All XP to Defence', accuracyMod: 1.00, damageMod: 1.00, defenseMod: 1.05, speedMod: 1.00, xp: { defense: 1 } },
    controlled: { name: 'Controlled', trains: 'Atk/Str/Def', desc: '+2% accuracy & max hit · XP split three ways', accuracyMod: 1.02, damageMod: 1.02, defenseMod: 1.02, speedMod: 1.00, xp: { attack: 0.33, strength: 0.33, defense: 0.34 } },
  },
  hammer: {
    smash: { name: 'Smash', trains: 'Strength', desc: '+12% max hit', accuracyMod: 1.00, damageMod: 1.12, defenseMod: 1.00, speedMod: 1.00, xp: { strength: 1 } },
    crush: { name: 'Crush', trains: 'Atk/Str', desc: '+3% accuracy · +8% max hit', accuracyMod: 1.03, damageMod: 1.08, defenseMod: 1.00, speedMod: 1.00, xp: { attack: 0.5, strength: 0.5 } },
    guard: { name: 'Guarded Smash', trains: 'Def/Str', desc: '+4% max hit · XP split Def/Str', accuracyMod: 1.00, damageMod: 1.04, defenseMod: 1.05, speedMod: 1.00, xp: { defense: 0.5, strength: 0.5 } },
  },
  ranged: {
    /* THE DIFFERENTIAL. On a bare bow (family 0.88 × base 2400ms) these read
       2112 / 2217 / 2323 ms — three distinct, strictly-ordered swings.
       Per-swing output ÷ interval, relative to Rapid:
         Rapid      1.000  — fastest; wins wherever accuracy is already capped
         Precise    1.029  — 1.08/1.05; wins against armoured foes, loses on farm content
         Longrange  0.927  — 1.04×0.98/1.10; buys the Defence XP route
       Precise is a CROSSOVER, not an upgrade: its +8% is multiplicative on a
       pre-clamp accuracy, so against a foe you already hit at the 0.95 ceiling
       it pays nothing and the 5% slower swing is pure loss (−4.8%). Choosing by
       the foe in front of you is the decision the triple never had. */
    rapid: { name: 'Rapid', trains: 'Ranged', desc: 'Fastest swing — baseline speed', accuracyMod: 1.00, damageMod: 1.00, defenseMod: 1.00, speedMod: 1.00, xp: { ranged: 1 } },
    precise: { name: 'Precise', trains: 'Ranged', desc: '+8% accuracy · 5% slower swing', accuracyMod: 1.08, damageMod: 1.00, defenseMod: 1.00, speedMod: 1.05, xp: { ranged: 1 } },
    longrange: { name: 'Longrange', trains: 'Ranged/Def', desc: '+4% accuracy · −2% max hit · 10% slower swing · XP split Ranged/Def', accuracyMod: 1.04, damageMod: 0.98, defenseMod: 1.05, speedMod: 1.10, xp: { ranged: 0.5, defense: 0.5 } },
  },
  /* SCOPE NOTE — magic is deliberately left at 1.00 across the board. `focus`
     strictly dominates `cast` today (+8% accuracy AND +3% max hit for no cost),
     which makes `cast` a dead option; that is a real design bug but it is a
     MAGIC rebalance, not the ranged report, and pricing it needs its own pass.
     Raised as a handoff rather than smuggled in here. */
  magic: {
    cast: { name: 'Cast', trains: 'Magic', desc: 'Baseline — all XP to Magic', accuracyMod: 1.00, damageMod: 1.00, defenseMod: 1.00, speedMod: 1.00, xp: { magic: 1 } },
    focus: { name: 'Focus', trains: 'Magic', desc: '+8% accuracy · +3% max hit', accuracyMod: 1.08, damageMod: 1.03, defenseMod: 1.00, speedMod: 1.00, xp: { magic: 1 } },
    warded: { name: 'Warded Cast', trains: 'Magic/Def', desc: '+2% accuracy · −2% max hit · XP split Magic/Def', accuracyMod: 1.02, damageMod: 0.98, defenseMod: 1.05, speedMod: 1.00, xp: { magic: 0.5, defense: 0.5 } },
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
