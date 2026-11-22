// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/outgrown.js — NEEDS YOU, kind `outgrown` (band: stops a hero hunting). D-2 section 2.3 rank 1.
// "{Name} has outgrown {ground}." with "Go to {next ground}": the server ended the hero's last hunt `outgrown` and refuses that ground
// (GR-81: no hunt starts by itself). The next ground is back-in-town.js outgrownGroundOf's, read for the server's Levels.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { nameOf } from '../../session/item-sections.js';
import { huntOf } from '../../session/hunt-sections.js';
import { huntName } from '../../session/party-sections.js';
import { outgrownGroundOf } from '../back-in-town.js';

export default Object.freeze({
  kind: 'outgrown',
  rowOf(ctx) {
    for (const cs of ctx.peers()) {
      const h = huntOf(cs);
      if (!h || !h.ended || h.endReason !== 'outgrown') continue;
      const next = outgrownGroundOf(cs);
      return { text: t('away.needs_outgrown', { name: nameOf(cs) || t('away.your_hero'), ground: huntName(h.huntId) }),
        label: next ? t('away.needs_outgrown_go', { ground: next.name }) : '', go: 'ground', slot: cs.slot, hunt: next ? next.hunt : null };
    }
    return null;
  },
});
