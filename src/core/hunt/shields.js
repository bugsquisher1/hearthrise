// ============================================================
// src/core/hunt/shields.js — ONE SHIELD A HERO (the shield rule, lane/e2-e3-statuses, E3; 15 "Stacking keys": Shields)
//
// "One shield per hero. A new one replaces it only if bigger." Every shield any source lands goes through offerShield: a self shell
// (Arcane Barrier), an ally shield (Protective Ward, Warm Stone), a party shell (Shelter), a heal's overflow kept as a shield (High Tide,
// an ability row's `overShieldPm`). A shield is the unit's `shield` (points left) and `shieldBy` (who cast it), persisted by abilities.js;
// damage.js hurt spends it and landHit says `shield_break` when a blow spends it to nothing.
//
//   offerShield  lands `amount` on `t` from caster `by` when it is MORE than the shield `t` holds: the shell is replaced whole (never
//                added to), `shield` names its caster and the new size. A smaller or equal offer lands nothing and says nothing.
//   overflowShield  what a heal of `n` on `t` past its missing HP keeps as a shield: floor((n - missing) x overShieldPm / 1000), offered
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { makeEvent } from './events.js';

const int = (v) => Math.floor(Number(v) || 0);

/** Offer a shield of `amount` from unit `by` to unit `t`. Answers true when it landed (it was bigger than the one `t` held). */
export function offerShield(sc, by, t, amount) {
  const n = int(amount);
  if (!t || t.alive !== true || !(n > int(t.shield))) return false;
  t.shield = n;
  t.shieldBy = by ? by.id : null;
  sc.emit(makeEvent('shield', sc.atMs, { u: by ? by.id : null, t: t.id, amount: n }));
  return true;
}

/** A heal of `n` (after its cut) on `t`, `missing` HP short of full: its overflow at `overShieldPm` permille offered as a shield by `by`.
    Answers the shield offered (0 for no overflow, no share, or one no bigger than the shield `t` holds). */
export function overflowShield(sc, by, t, n, missing, overShieldPm) {
  if (!(overShieldPm > 0)) return 0;
  const over = int(n) - Math.max(0, int(missing));
  if (!(over > 0)) return 0;
  const s = Math.floor((over * overShieldPm) / 1000);
  return s > 0 && offerShield(sc, by, t, s) ? s : 0;
}
