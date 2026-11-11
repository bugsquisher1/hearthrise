// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/event-plate.js — THE LIVE EVENT PLATE: "+25% LEVEL XP ends Mon 6:00 AM", AT THE WORLD'S TOP LEFT.
//
// The mocks' plate (.claude/coordination/mocks/2026-11-10/SPEC.md §2): the online count's quiet plate, one a live event, in town
// and in a hunt. It shows only what src/shell/live-events-view.js plateLines reads from the server's `live_events` section: an
// event on now (its chip and when it ends, the last hour counted down) or starting within a day (its name, quiet). No event, or
// every switch off (the section is null): the WHOLE widget box goes, so it takes no room and never moves the camera. Its tooltip
// is the event's own words. A press opens Hunts, on the ground whose boss Open Halls frees. Built once, patched in place on
// every envelope and display tick.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, attr, element } from '../../render/paint.js?v=0.2.118';
import { plateLines } from '../live-events-view.js?v=0.2.118';
import { pickHunt } from '../windows/hunts.js?v=0.2.118';

/** The skeleton (built once): a column of plates, one an event. */
export function renderEventPlate() {
  return '<div class="hs-events" role="status" aria-live="off"></div>';
}

renderEventPlate.patch = function patchEventPlate(el, ctx) {
  const lines = plateLines(ctx.character);
  cls(el, 'is-quiet', !lines.length);
  rows(el.querySelector('.hs-events'), lines, {
    key: (l) => l.id,
    build: () => element(ctx.doc, '<button type="button" class="hs-event" data-hs-act="event-open"><b></b><span class="hs-event-when"></span></button>'),
    patch: (b, l) => {
      text(b.querySelector('b'), l.head);
      text(b.querySelector('.hs-event-when'), l.when);
      attr(b, 'title', l.title);
      attr(b, 'data-hunt', l.hunt);
      cls(b, 'is-soon', l.soon);
      cls(b, 'is-gain', l.gain && !l.soon);
      cls(b, 'is-ending', l.ending);
    },
  });
};

renderEventPlate.act = function actEventPlate(ctx, el, action, ev, target) {
  if (ev.type !== 'click' || action !== 'event-open' || !ctx.wm) return;
  const hunt = target.getAttribute('data-hunt');
  if (hunt) pickHunt(ctx.character, hunt);
  if (ctx.wm.isOpen('hunts')) ctx.refresh('hunts'); else ctx.wm.open('hunts');
};
