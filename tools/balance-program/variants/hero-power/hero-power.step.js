// balance-variant: hero-power/step
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/hero-power/hero-power.step.js — THE POWER STEP ON GEAR: a formula family for the rule slot `hero-power`
// (tools/balance-program/rule-slots.json). Engine code the one engine runs: a scratch copy plays it in place of src/core/temper.js, with
// the shipped module beside it as temper.shipped.js lending every export this family does not change. Never in a bundle.
//
// THE SEAM (lane/r4, 2026-11-22). temper.js answers the two per-hero ratios every amount passes: `blowsPm` raises what a hero lands on a
// monster (a swing, a spell, a bleed: damage.js hurt and abilities.js) and `armorPm` lowers what reaches the hero (mitigation.js mitigate,
// last, under the total cap). A Danger step multiplies a pull's health and blow by (1 + powerStep) (src/data/danger.js), so a hero whose
// blows are (1 + powerStep)^k larger and whose taken blows are (1 + powerStep)^k smaller holds k steps deeper: no combat code changes.
//
// THE FAMILY (docs/design/redesign/04-math-strategy.md section 1, "What a hero's rating is made of"): the gear part of the rating, in
// Levels, is WEIGHT_GEAR x the item Level of the gear that feeds it (the Level a piece is worn at, `reqLv`):
//   offense steps = WEIGHT_GEAR x the weapon's item Level          blowsPm += 1000 x ((1 + powerStep)^steps - 1)
//   defense steps = WEIGHT_GEAR x the worn armor's mean item Level  armorPm += 1000 x (1 - (1 + powerStep)^-steps)
// on top of what the shipped module answers (Tempering). Gear's shipped stats still play beside it: the family measures the step's OWN
// move as the difference to C0 on the same dice (tools/balance-program/redesign/v1-climb.mjs --candidate).
// NOT HERE: the skill part (`weightSkill`). temper.js is handed the kit and the Tempering, never the skills; the skill term needs the
// stat-build seam (src/core/member.js), which is R9's engine lane. A skill at a fixed lag behind its Level is a constant offset to the
// held step, so it does not move the answer to "what does one gear tier move".
//
// WEIGHT_GEAR 1.0 is a MEASURING value (the whole item Level counts), so the move reads well over the noise; the move is linear in it.
//
// Shelf entry: added 2026-11-22, expires 2027-02-22 (rule-slots.json). The winner moves into src/core; the loser is deleted.
// ════════════════════════════════════════════════════════════════════════
import { ARMOUR_WEIGHT } from '../data/core-model.js';
import { DANGER } from '../data/danger.js';
import { blowsPmOf as shippedBlowsPm, armorPmOf as shippedArmorPm } from './temper.shipped.js';

export * from './temper.shipped.js';

const WEIGHT_GEAR = 1.0;

const levelOf = (it) => { const n = Math.floor(Number(it && it.reqLv)); return Number.isFinite(n) && n > 0 ? n : 0; };
const isArmor = (it) => !!(it && it.slot && ARMOUR_WEIGHT[it.armourClass] && Math.floor(Number(it.defB) || 0) > 0);
const up = (steps) => (steps > 0 ? Math.round(1000 * (Math.pow(1 + DANGER.powerStep, steps) - 1)) : 0);
const down = (steps) => (steps > 0 ? Math.min(999, Math.round(1000 * (1 - Math.pow(1 + DANGER.powerStep, -steps)))) : 0);

/** The permille this hero's blows gain: the shipped Tempering plus the weapon's item Level in power steps. */
export function blowsPmOf(equipment, items, temper) {
  const it = equipment && equipment.weapon && items ? items[equipment.weapon] : null;
  return shippedBlowsPm(equipment, items, temper) + up(WEIGHT_GEAR * levelOf(it));
}

/** The permille every blow at this hero loses: the shipped Tempering plus the worn armor's mean item Level in power steps. */
export function armorPmOf(equipment, items, temper) {
  let n = 0, sum = 0;
  for (const id of Object.values(equipment || {})) {
    const it = id && items ? items[id] : null;
    if (isArmor(it)) { n++; sum += levelOf(it); }
  }
  return Math.min(999, shippedArmorPm(equipment, items, temper) + (n ? down((WEIGHT_GEAR * sum) / n) : 0));
}
