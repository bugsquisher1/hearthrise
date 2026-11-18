// ════════════════════════════════════════════════════════════════════════
// src/shell/training-now.js — WHAT A HERO'S TRAINING SESSION IS DOING NOW, FOR THE HUNT BAR AND THE ANALYZER.
//
// PURE. A training session IS a hunt session (src/data/training.js), so the hunt's own surfaces show it: the hunt bar
// (widgets/hunt-topbar.js) and the analyzer (widgets/analyzer.js). They said "Training Yard 00:20" and "Monsters killed 0,
// Level XP 0, Gold 0" (lane/a-training-words, left over). Which skill and where come from the server's hunt section (its hunt
// id); every figure from the server's `training` section (src/session/training-sections.js): the run's start, the session's
// longest run, the hour's fee, the gold paid, the rate. The one thing worked out here is the time left: the server's start
// plus the server's longest run, against the server's clock (display only; the next envelope restates both).
// ════════════════════════════════════════════════════════════════════════
import { trainingOf as trainingHuntOf, TRAINING_RULES } from '../data/training.js?v=0.2.138';
import { huntOf } from '../session/hunt-sections.js?v=0.2.138';
import { trainingOf, quoteFor, trainingPhrase } from '../session/training-sections.js?v=0.2.138';

/**
 * The hero's RUNNING training session, or null when its hunt is not a training ground or is over.
 *   { skill, place, doing: "Training Melee", at: "at the Training Yard",
 *     leftMs  until the session's longest run ends (null: no run or no figures from the server yet),
 *     feeH    the hour's fee at the yard (null at home or unsent), paid  the gold its fee rows took (null: unsent),
 *     xpH     the skill XP an hour now (the item's 200% while its hours last; null: unsent), boosted }
 * @param {object} cs  a CharacterSession (read only)
 * @param {number|null} serverNowMs
 */
export function trainingNowOf(cs, serverNowMs) {
  const h = huntOf(cs);
  const train = h && !h.ended && h.huntId ? trainingHuntOf(h.huntId) : null;
  if (!train) return null;
  const tr = trainingOf(cs);
  const run = tr && tr.run && tr.run.skill === train.skill ? tr.run : null;
  const q = run ? quoteFor(tr, run.skill) : null;
  const leftMs = run && tr.maxHours && Number.isFinite(serverNowMs)
    ? Math.max(0, run.since + tr.maxHours * TRAINING_RULES.hourMs - serverNowMs) : null;
  const xpH = q && q.xpH !== null ? q.xpH : run && tr.rate ? (run.boosted ? tr.rate.xpHItem : tr.rate.xpH) : null;
  return Object.freeze({
    skill: train.skill, place: train.place, ...trainingPhrase(h.huntId),
    leftMs, feeH: run && run.where === 'yard' ? run.feeH : null, paid: run && run.where === 'yard' ? run.paid : null,
    xpH, boosted: !!(run && run.boosted),
  });
}
