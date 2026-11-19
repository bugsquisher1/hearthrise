// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/key-ring.js — THE KEY RING TAB: every chest key off the bag once the hero has bought it
//   (Tyler 2026-11-16: "a Key Ring", one tab in the bag, bought once per hero for gold).
//
// The server's `key_ring` section (2027-04-27-tower-chest.sql hr_key_ring_section; src/session/item-sections.js keyRingOf) says
// whether this hero owns one, its price while it doesn't, and the keys on it. No section (the Tower off for the account): no tab.
// Unlock is ONE unlock_buy naming the server's offer id and no number (hr_unlock_buy prices it); the button stays off while the
// press is out, and the tab changes only from the answer's envelope. The keys themselves move on the server: a key that lands
// goes onto the ring there, never here.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, element } from '../../../render/paint.js?v=0.2.140';
import { gold } from '../../../render/format.js?v=0.2.140';
import { t } from '../../../render/player-text.js?v=0.2.140';
import { keyRingOf } from '../../../session/item-sections.js?v=0.2.140';
import { runIntent } from '../../intent-words.js?v=0.2.140';
import { pocketHtml, patchCount } from './pockets.js?v=0.2.140';

/** The tab (hidden until the server sends the section). */
export const ringTabHtml = () => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="ring" aria-selected="false" hidden>'
  + t('bag.ring_tab') + '</button>';

/** The pane: the ring's keys, or the unlock at the server's price. */
export const ringPaneHtml = () => '<section class="hw-pane" data-pane="ring">'
  + '<ul class="hw-pockets hw-ring" role="list" aria-label="' + t('bag.ring_tab') + '"></ul><p class="hh-empty hw-ring-none"></p>'
  + '<div class="hw-ring-do"><button type="button" class="hh-tool" data-hs-act="ring-unlock"></button></div></section>';

/** Show the tab when the section is there; draw the keys or the unlock. `glyphs`: the window's icon set. */
export function patchRing(root, st, doc, glyphs) {
  const ring = keyRingOf(st.cs);
  prop(root.querySelector('.hw-tab[data-tab="ring"]'), 'hidden', !ring);
  const pane = root.querySelector('.hw-pane[data-pane="ring"]');
  if (!pane || !ring) return;
  rows(pane.querySelector('.hw-ring'), ring.unlocked ? ring.keys : [], {
    key: (k) => k.id,
    build: (k) => element(doc, pocketHtml(k.id, glyphs, 'ring-key')),
    patch: (li, k) => patchCount(li, k.qty, false),
  });
  const none = pane.querySelector('.hw-ring-none');
  const words = !ring.unlocked ? t('bag.ring_locked') : ring.keys.length ? '' : t('bag.ring_empty');
  cls(none, 'is-on', !!words);
  text(none, words);
  const buy = pane.querySelector('[data-hs-act="ring-unlock"]');
  prop(pane.querySelector('.hw-ring-do'), 'hidden', ring.unlocked || !ring.offer);
  text(buy, ring.offer ? t('bag.ring_unlock', { gold: gold(ring.offer.gold) }) : '');
  /* with no offer the whole row is hidden above; on screen it is off only while the press is out */
  prop(buy, 'disabled', !!st.sc.pending);
}

/** ONE unlock_buy naming the server's offer; its refusal is said by runIntent and re-reads the envelope (storage.js's Expand, the same). */
export function unlockRing(st, repaint) {
  const ring = keyRingOf(st.cs);
  if (!ring || ring.unlocked || !ring.offer) return;
  const offer = ring.offer.offer;
  st.sc.menu = null;
  st.sc.msgAt = null;
  /* a refusal re-reads the hero in the session (character-session.js _settled): the offer shown is the server's again */
  return runIntent(st.sc, repaint, () => st.cs.edgeIntent('unlock_buy', { offer }), t('bag.ring_unlocking'), () => t('bag.ring_unlocked'), st.cs);
}
