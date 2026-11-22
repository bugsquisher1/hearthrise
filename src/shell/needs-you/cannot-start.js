// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/cannot-start.js — NEEDS YOU, kind `cannot_start` (band: stops a hero hunting). D-2 section 2.3 rank 2.
// Carry on would be refused for a hero: the server's plan says its bag is full, or its last hunt ended because a supply ran out
// (gold_out, heals_out, runes_out, ammo_out: src/data/hunt-sessions.js END_ORDER). "{Name}'s bag is full." / "{Name} ran out of {thing}.",
// and "Change the plan" opens that hero's Hunt prep, where the bag lines and the gold to keep are set.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { nameOf } from '../../session/item-sections.js';
import { huntOf } from '../../session/hunt-sections.js';

const RAN_OUT = Object.freeze(['gold_out', 'heals_out', 'runes_out', 'ammo_out']);
const FULL = Object.freeze(['bag_full', 'storage_full']);

export default Object.freeze({
  kind: 'cannot_start',
  rowOf(ctx) {
    const peers = ctx.peers();
    const name = (slot) => { const cs = peers.find((p) => p.slot === slot); return (cs && nameOf(cs)) || t('away.your_hero'); };
    /* the server's plan first: a hero it would refuse for a full bag */
    for (const h of ctx.plan && Array.isArray(ctx.plan.heroes) ? ctx.plan.heroes : []) {
      if (h.state === 'no' && FULL.includes(h.why)) return { text: t('away.needs_bag_full', { name: h.name || name(h.slot) }), label: t('away.needs_change_plan'), go: 'prep', slot: h.slot };
    }
    for (const cs of peers) {
      const h = huntOf(cs);
      if (!h || !h.ended || !RAN_OUT.includes(h.endReason)) continue;
      return { text: t('away.needs_ran_out', { name: nameOf(cs) || t('away.your_hero'), thing: t('away.needs_thing_' + h.endReason) }),
        label: t('away.needs_change_plan'), go: 'prep', slot: cs.slot };
    }
    return null;
  },
});
