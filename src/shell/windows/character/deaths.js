// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/deaths.js — THE DEATHS TAB: EVERY DEATH THE SERVER KEPT.
//
// The server's death log (the `death_log` section, newest first): when, where,
// what killed the hero and the XP the death cost, as the settle priced it. A
// death ends its hunt and sends the hero back to town (CORE_MODEL.md §4). A row
// opens to the cost by Level and skill. Each row carries the death's server
// event id (data-event) for the death explanation (src/hunt-view/death-explain.js).
// Nothing here is the client's: no death is counted or priced in the browser.
// ════════════════════════════════════════════════════════════════════════
import { HUNTS } from '../../../data/hunts.js?v=0.2.55';
import { SKILLS_DEF } from '../../../data/skills.js?v=0.2.55';
import { deathLogOf } from '../../../session/character-sections.js?v=0.2.55';
import { rows, text, cls, attr, element } from '../../../render/paint.js?v=0.2.55';
import { whole } from '../../../render/format.js?v=0.2.55';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.55';
import { monsterName } from '../../widgets/bits.js?v=0.2.55';

const HUNT_NAME = new Map(HUNTS.map((h) => [h.id, h.name]));

/** When, in plain words: "12 minutes ago", "3 hours ago", else the date. */
function whenWords(atMs, nowMs) {
  const m = Math.max(0, Math.floor((nowMs - atMs) / 60000));
  if (m < 1) return 'Just now';
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  return new Date(atMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The Deaths tab's skeleton. */
export function deathsHtml() {
  return '<section class="hw-cs-deaths"><ul class="hw-dl-list"></ul>'
    + '<p class="hh-empty hw-dl-none">No deaths on record. The server keeps the deaths of your recent hunts.</p></section>';
}

/** Patch the Deaths tab. */
export function patchDeaths(body, ctx, sc) {
  const root = body.querySelector('.hw-cs-deaths');
  const log = deathLogOf(ctx.character);
  const now = Date.now();
  rows(root.querySelector('.hw-dl-list'), log || [], {
    key: (r) => String(r.id),
    build: (r) => element(ctx.doc, '<li class="hw-dl-row"><button type="button" class="hw-dl-head" data-hs-act="dl-open" data-event="' + r.id + '" aria-expanded="false">'
      + '<b class="hw-dl-by"></b><span class="hw-dl-where"></span><span class="hw-dl-when"></span><span class="hw-dl-xp"></span></button>'
      + '<p class="hw-dl-more"></p></li>'),
    patch: (li, r) => {
      const open = sc.openDeath === r.id;
      text(li.querySelector('.hw-dl-by'), r.monster ? 'Killed by ' + monsterName(r.monster) : 'Died');
      text(li.querySelector('.hw-dl-where'), r.hunt ? 'Died in ' + (HUNT_NAME.get(r.hunt) || r.hunt) + ' and returned to town' : '');
      text(li.querySelector('.hw-dl-when'), whenWords(r.atMs, now));
      text(li.querySelector('.hw-dl-xp'), r.xp === null ? '' : r.xp > 0 ? whole(r.xp) + ' XP lost' : 'No XP lost');
      attr(li.querySelector('.hw-dl-head'), 'aria-expanded', String(open));
      const lost = Object.entries(r.xpLost).map(([k, n]) => whole(n) + ' ' + (k === 'level' ? 'Level' : (SKILLS_DEF[k] && SKILLS_DEF[k].name) || k) + ' XP');
      text(li.querySelector('.hw-dl-more'), open ? (lost.length ? 'Dying cost ' + lost.join(', ') + '.' : 'Dying cost no XP.') + ' ' + new Date(r.atMs).toLocaleString() : '');
      cls(li, 'is-open', open);
    },
  });
  cls(root.querySelector('.hw-dl-none'), 'is-on', !!log && !log.length);
}

/** One gesture on the Deaths tab; true when it was the tab's. */
export function actDeaths(sc, action, ev, t, repaint) {
  if (action !== 'dl-open' || ev.type !== 'click') return false;
  const id = Number(t.getAttribute('data-event'));
  sc.openDeath = sc.openDeath === id ? null : id;
  repaint();
  return true;
}
