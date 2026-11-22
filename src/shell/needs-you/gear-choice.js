// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/gear-choice.js — NEEDS YOU, kind `gear_choice` (band: costs progress). D-2 section 2.3 rank 4.
// "Wear upgrades" is off and better gear waits, or a trade-off waits that the line never wears (upgrade-plan.js `choices`): "Better gear is
// waiting for {n} heroes." and "Choose" (that hero's Inventory, where the doll and Equip upgrades are). With the line on, plain upgrades
// go on at the next Start by themselves and only a trade-off is a row. Read from each hero's own envelope (upgrade-line.js upgradeOf).
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { huntOf } from '../../session/hunt-sections.js';
import { upgradeOf } from '../widgets/upgrade-line.js';

export default Object.freeze({
  kind: 'gear_choice',
  rowOf(ctx) {
    const waiting = [];
    for (const cs of ctx.peers()) {
      const h = huntOf(cs);
      if (h && !h.ended) continue;   // a running hunt is one kit: nothing changes inside it (D-2 rule 7)
      const plan = upgradeOf(cs);
      if ((!ctx.wearOn && plan.picks.length) || plan.choices.length) waiting.push(cs);
    }
    if (!waiting.length) return null;
    return { text: t('away.needs_gear', { count: waiting.length }), label: t('away.needs_gear_choose'), go: 'bag', slot: waiting[0].slot };
  },
});
