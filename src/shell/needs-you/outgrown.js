// ════════════════════════════════════════════════════════════════════════
// src/shell/needs-you/outgrown.js — NEEDS YOU, kind `outgrown` (band: stops a hero hunting). D-2 section 2.3 rank 1.
// "{Name} has outgrown {ground}." with "Go to {next ground}", for either of two server facts:
//   the server ended the hero's last hunt `outgrown` and refuses that ground (GR-81: no hunt starts by itself); the next ground is
//   back-in-town.js outgrownGroundOf's, read for the server's Levels;
//   ON THE DANGER SCALE (12-targets.md 3.2, lane/r10-more-grounds): the hero's held step on its ground (the server's `danger` section) is the
//   band's top, depth 20, where it climbs and earns no more. A label, not a sentence (Tyler's UI voice): "Ready for: {next}" with Go, the
//   next open ground on the scale (danger-sections.js), or "Max depth reached" at the end of the road.
// Staying is allowed: the row is a nudge, and the button opens the next ground's card.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../../render/player-text.js';
import { nameOf } from '../../session/item-sections.js';
import { huntOf } from '../../session/hunt-sections.js';
import { huntName } from '../../session/party-sections.js';
import { dangerOf, heldAtTop, nextScaleGround } from '../../session/danger-sections.js';
import { outgrownGroundOf } from '../back-in-town.js';

const rowFor = (cs, ground, next) => ({ text: t('away.needs_outgrown', { name: nameOf(cs) || t('away.your_hero'), ground: huntName(ground) }),
  label: next ? t('away.needs_outgrown_go', { ground: next.name }) : '', go: 'ground', slot: cs.slot, hunt: next ? next.hunt : null });

export default Object.freeze({
  kind: 'outgrown',
  rowOf(ctx) {
    for (const cs of ctx.peers()) {
      const h = huntOf(cs);
      if (!h || !h.ended || h.endReason !== 'outgrown') continue;
      return rowFor(cs, h.huntId, outgrownGroundOf(cs));
    }
    /* the top of a scale ground: the ground it is playing, else the one it last hunted */
    for (const cs of ctx.peers()) {
      const d = dangerOf(cs), h = huntOf(cs);
      const ground = (d && d.playing && d.playing.hunt) || (h && h.huntId) || null;
      if (!ground || !heldAtTop(d, ground)) continue;
      const next = nextScaleGround(ground);
      return { text: next ? t('away.needs_top_next', { ground: next.name }) : t('away.needs_top_max'), label: next ? t('away.needs_top_go') : '',
        go: 'ground', slot: cs.slot, hunt: next ? next.hunt : null };
    }
    return null;
  },
});
