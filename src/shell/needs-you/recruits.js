// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/recruits.js — NEEDS YOU, kind `recruits` (band: gains). Tyler RD-Q6 a, 2026-11-22; 1053-recruits.sql.
// "{count} recruits are ready to join {Name} at Level {level}." with "Recruit": the server's `recruits` section says the account's one hero
// has reached the press's Level (recruit-sections.js recruitsOf). The press opens All characters, where the one press makes them
// (../windows/recruits-pane.js). Nothing here is the press: a row only points at the window that decides it.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { nameOf } from '../../session/item-sections.js';
import { recruitsOf } from '../../session/recruit-sections.js';

export default Object.freeze({
  kind: 'recruits',
  rowOf(ctx) {
    for (const cs of ctx.peers()) {
      const o = recruitsOf(cs);
      if (!o || !o.ready) continue;
      return { text: t('away.needs_recruits', { count: o.slots.length, name: nameOf(cs) || t('away.your_hero'), level: o.level }),
        label: t('away.needs_recruits_go'), go: 'recruits', slot: cs.slot };
    }
    return null;
  },
});
