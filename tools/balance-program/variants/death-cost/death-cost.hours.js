// balance-variant: death-cost/hours
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/death-cost/death-cost.hours.js — A DEATH COSTS HOURS OF PROGRESS: a formula family for the rule slot `death-cost`
// (tools/balance-program/rule-slots.json). A scratch copy plays it in place of src/core/action-rules.js, with the shipped module beside it as
// action-rules.shipped.js lending every export this family does not change (the store, the purse, the stamina step, a skill's loss,
// the session's shape). Never in a bundle: tools/pack-edge.mjs refuses it.
//
// THE FAMILY (docs/design/redesign/04-math-strategy.md section 5, "Death"): the shipped price is 6% of ALL Level XP, which grows with the
// Level faster than a Level's pace does (COMPUTED on set/v0.2.144 against the pace contract, balance-sheet.js contractXpPerH: 0.24 h at
// Level 10, 7.5 h at 60, 148 h at 400, 759 h at 1,000). Here a death costs DEATH_HOURS of the pace contract at the hero's own Level:
//
//   Level XP lost = min(Level XP, floor(DEATH_HOURS x contractXpPerH(Level) x the mode's share))
//
// the same weight at every Level, and never below Level 1. A session mode's share is the shipped rule's (the fraction over
// DEATH_XP_LOSS: 1 in a hunt, 0 in a mode that prices nothing). A combat skill still loses the shipped share of its progress, never a level.
//
// DEATH_HOURS = 7.5: parity with the shipped price at Level 60 (7.52 h there, COMPUTED above), so the two families part on both sides of
// it: this one is dearer under Level 60 and cheaper over it. It is the family's one lever (04's `deathHours`); Blessings still cut it
// where the death is settled.
//
// Shelf entry: added 2026-11-21, expires 2027-02-21 (rule-slots.json). The winner of a comparison moves into src/core; the loser is deleted.
// ════════════════════════════════════════════════════════════════════════
import { DEATH_XP_LOSS } from '../data/hunt-sessions.js';
import { COMBAT_SKILLS } from '../data/skills.js';
import { contractXpPerH } from '../data/balance-sheet.js';
import { charLevelFromXp } from './xp.js';
import { skillDeathLoss } from './action-rules.shipped.js';

export * from './action-rules.shipped.js';

const DEATH_HOURS = 7.5;

/** The Level XP one death takes from `levelXp` at `fraction` (DEATH_XP_LOSS in a hunt): DEATH_HOURS of the pace contract at that Level. */
export function levelDeathLoss(levelXp, fraction = DEATH_XP_LOSS) {
  const x = Math.max(0, Math.floor(Number(levelXp) || 0));
  const f = Number(fraction);
  if (!(f > 0)) return 0;
  const hours = Math.floor(DEATH_HOURS * contractXpPerH(charLevelFromXp(x)) * (f / DEATH_XP_LOSS));
  return Math.max(0, Math.min(hours, x));
}

/** One death's loss as `{ level?: xp, <skill>?: xp }` (zeros omitted), skills in COMBAT_SKILLS order. */
export function deathXpLoss(state, fraction = DEATH_XP_LOSS) {
  const out = {};
  const lv = levelDeathLoss(state && state.levelXp, fraction);
  if (lv > 0) out.level = lv;
  for (const k of COMBAT_SKILLS) {
    const n = skillDeathLoss(k, state && state.skills ? state.skills[k] : 0, fraction);
    if (n > 0) out[k] = n;
  }
  return out;
}
