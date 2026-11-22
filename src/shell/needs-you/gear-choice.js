// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/gear-choice.js — NEEDS YOU, kind `gear_choice` (band: costs progress). D-2 section 2.3 rank 4.
// In town: "Wear upgrades" is off and better gear waits, or a trade-off waits that the line never wears (upgrade-plan.js `choices`):
// "Better gear is waiting for {n} heroes." and "Choose" (that hero's Inventory, where the doll and Equip upgrades are). With the line on,
// plain upgrades go on at the next Start by themselves (the server's pick) and only a trade-off is a row.
// OUT HUNTING (D-2 rule 8): nothing changes inside a running hunt, so a visiting player gets ONE press for heroes out hunting with plain
// upgrades in their bags: "Equip upgrades and go back in" (carry-on-intents.js regear: leave, the server dresses them, the Start sends them
// back). Never for a boss room, a training session or a Tower run (rule 9: their one door is their own). Read from each hero's own envelope
// (upgrade-line.js upgradeOf, the core's pick over it).
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { huntOf } from '../../session/hunt-sections.js';
import { upgradeOf } from '../widgets/upgrade-line.js';
import { roomOfHunt } from '../../data/boss-halls.js';
import { trainingOf } from '../../data/training.js';
import { runRulesOf } from '../../data/tower.js';

/* A hunt the Start can send a hero back to by its plan: never a boss room, a training session or a run (the away card's own rule). */
const regearable = (hunt) => !!hunt && !roomOfHunt(hunt) && !trainingOf(hunt) && !runRulesOf(hunt);

export default Object.freeze({
  kind: 'gear_choice',
  rowOf(ctx) {
    const waiting = [], hunting = [];
    for (const cs of ctx.peers()) {
      const h = huntOf(cs);
      const plan = upgradeOf(cs);
      if (h && !h.ended) { if (plan.picks.length && regearable(h.huntId)) hunting.push(cs); continue; }
      if ((!ctx.wearOn && plan.picks.length) || plan.choices.length) waiting.push(cs);
    }
    if (waiting.length) return { text: t('away.needs_gear', { count: waiting.length }), label: t('away.needs_gear_choose'), go: 'bag', slot: waiting[0].slot };
    if (hunting.length) {
      return { text: t('away.needs_gear_hunting', { count: hunting.length }), label: t('away.needs_regear'), go: 'regear', slot: hunting[0].slot,
        slots: hunting.map((cs) => cs.slot) };
    }
    return null;
  },
});
