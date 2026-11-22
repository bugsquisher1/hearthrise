// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/death.js — NEEDS YOU, kind `death` (band: costs progress). D-2 section 2.3 rank 3.
// A hero whose last hunt ended in its death and who stands with a Blessing missing (death-popup.js blessingsMissing, the server's
// Blessings section): "{Name} died and lost {xp} Level XP. No Blessing is on." and "Bless" (the Shop's Services). The Level XP is the
// server's death row (character-sections.js deathLogOf); with none priced the line says only that it died.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { whole } from '../../render/format.js';
import { nameOf } from '../../session/item-sections.js';
import { huntOf } from '../../session/hunt-sections.js';
import { deathLogOf } from '../../session/character-sections.js';
import { blessingsMissing } from '../death-popup.js';

export default Object.freeze({
  kind: 'death',
  rowOf(ctx) {
    /* the larger loss first (D-2 rule 3) */
    const dead = [];
    for (const cs of ctx.peers()) {
      const h = huntOf(cs);
      if (!h || !h.ended || h.endReason !== 'died' || blessingsMissing(cs) !== true) continue;
      const row = (deathLogOf(cs) || []).find((d) => d.session === h.sessionId) || null;
      dead.push({ cs, xp: row && Number.isSafeInteger(row.xp) ? row.xp : null });
    }
    if (!dead.length) return null;
    dead.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const { cs, xp } = dead[0];
    const name = nameOf(cs) || t('away.your_hero');
    return { text: xp !== null ? t('away.needs_death', { name, xp: whole(xp) }) : t('away.needs_death_some', { name }),
      label: t('away.needs_bless'), go: 'bless', slot: cs.slot };
  },
});
