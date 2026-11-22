// ════════════════════════════════════════════════════════════════════════
// src/shell/presence-strip.js — THE PRESENCE STRIP ON A GROUND'S PAGE (MM-20, chapter 06 section 2.7; lane/c-social FB-12).
//
// "3 other parties are hunting the Warrens", then each by its leader's name, clan tag and party size (src/social/ground-presence.js,
// the server's answer). With nobody there it says what the strip is for (S-18 c: a small server's empty room still says what it is),
// and before the first answer it shows nothing. Names carry the player menu.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, element } from '../render/paint.js';
import { t } from '../render/player-text.js';
import { presenceOf } from '../social/ground-presence.js';
import { HUNT_INDEX } from '../data/hunts.js';

/** The strip's skeleton, placed in a ground's page header. */
export function stripHtml() {
  return '<div class="hw-hd-near" hidden><p class="hw-hd-near-head"></p><ul class="hw-hd-near-list"></ul></div>';
}

/** Patch the strip for `hunt` from the server's last answer, asking again when it is a minute old (repaint() once it lands). */
export function patchStrip(det, ctx, hunt, repaint) {
  const box = det.querySelector('.hw-hd-near');
  if (!box) return;
  const s = presenceOf(ctx.account, ctx.character, hunt, repaint);
  box.hidden = !s;
  if (!s) return;
  const ground = (HUNT_INDEX[hunt] && HUNT_INDEX[hunt].name) || hunt;
  text(box.querySelector('.hw-hd-near-head'), s.total ? t('clan.strip_count', { count: s.total, ground }) : t('clan.strip_none', { ground }));
  rows(box.querySelector('.hw-hd-near-list'), s.parties, {
    key: (p) => p.name,
    build: () => element(ctx.doc, '<li class="hw-hd-near-row"></li>'),
    patch: (li, p) => {
      text(li, p.tag ? t('clan.strip_tag', { tag: p.tag, name: p.name, size: p.size }) : t('clan.strip_party', { name: p.name, size: p.size }));
      cls(li, 'is-known', p.friend || p.clan);
    },
  });
}
