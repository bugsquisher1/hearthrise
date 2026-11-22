// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/near-death.js — NEEDS YOU, kind `near_death` (band: costs progress; D-2 section 2.3 rule 4: a new kind takes
// its band and goes last in it). The hunt report's word for a hero's last hunt was Near death (GR-66; src/core/hunt/report.js
// riskWord over the server's counters, src/session/report-sections.js) and the hero lived: the next Carry on would run that hunt
// again as it stands. "{Name} nearly died, down to {pct}% health from a {monster}." and "Change the plan" (that hero's Hunt prep:
// its bar, its supplies, its tier). A death has its own row (./death.js). The lowest health first (D-2 rule 3).
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { nameOf } from '../../session/item-sections.js';
import { huntOf } from '../../session/hunt-sections.js';
import { huntReportOf } from '../../session/report-sections.js';
import { riskWord } from '../../core/hunt/report.js';
import { blowLine } from '../hunt-report.js';

export default Object.freeze({
  kind: 'near_death',
  rowOf(ctx) {
    const near = [];
    for (const cs of ctx.peers()) {
      const h = huntOf(cs);
      if (!h || !h.ended || h.endReason === 'died') continue;
      const r = huntReportOf(cs);
      if (!r || !r.low || riskWord(r.low.pm, r.close) !== 'near') continue;
      near.push({ cs, low: r.low });
    }
    if (!near.length) return null;
    near.sort((a, b) => a.low.pm - b.low.pm || a.cs.slot - b.cs.slot);
    const { cs, low } = near[0];
    return { text: blowLine('report.needs_near', 'report.needs_near_spell', low, { name: nameOf(cs) || t('away.your_hero') }), label: t('away.needs_change_plan'), go: 'prep', slot: cs.slot };
  },
});
