// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/tally-hud.js — THE HUD'S TALLY: "GRAY WOLVES 112/200", AT A GLANCE.
//
// One short line per held kill task, the SERVER's count from the `tally` section
// (src/session/tally-sections.js; the settle counts, never the browser), a notched
// stick under it, and "Done" once the server says so. In town with nothing held it
// says where Tamsin is; while hunting with nothing held it shows nothing. A press
// opens her window. A widget the player can hide (Settings, HUD layout). Built once,
// patched in place.
// ════════════════════════════════════════════════════════════════════════
import { tallyOf, tallyLine } from '../../session/tally-sections.js?v=0.2.45';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.45';
import { rows, text, cls, style, element } from '../../render/paint.js?v=0.2.45';

/** The skeleton (built once). */
export function renderTallyHud() {
  return '<section class="hs-tally" aria-label="Your tallies"><button type="button" class="hs-tally-open" data-hs-act="tally-open">'
    + '<b>Tally</b><span class="hs-tally-none"></span></button><ul class="hs-tally-list"></ul></section>';
}

renderTallyHud.patch = function patchTallyHud(el, ctx) {
  const t = tallyOf(ctx.character);
  const h = huntOf(ctx.character);
  const hunting = !!h && !h.ended;
  const held = t ? t.held : [];
  /* Quiet = the WHOLE widget box goes (el is the shell's widget box): an empty box still held its min size at
     its anchor, covered the analyzer and pushed the camera off the hero (v0.2.37 run 40020854780, HS-13 / WC-3). */
  /* Nothing held and Tamsin never met (no armor weight asked, nothing paid): quiet too, so a new hero's first screen
     and first return hold one instruction, the coach's, which brings her in with her own card (board 2026-10-25 #13). */
  const met = !!t && (!!t.weight || t.recent.length > 0);
  cls(el, 'is-quiet', !t || (!held.length && (hunting || !met)));
  text(el.querySelector('.hs-tally-none'), !t || held.length ? '' : 'Tamsin has kill tasks at her board on the Common.');
  rows(el.querySelector('.hs-tally-list'), held, {
    key: (x) => x.task,
    build: () => element(ctx.doc, '<li class="hs-tally-row"><span></span><span class="ht-stick" aria-hidden="true"><i></i></span></li>'),
    patch: (li, x) => {
      text(li.querySelector('span'), tallyLine(x) + (x.done ? ' · Done' : ''));
      style(li.querySelector('.ht-stick i'), 'width', Math.round(Math.min(1, x.kills / x.target) * 100) + '%');
      cls(li, 'is-done', x.done);
    },
  });
};

renderTallyHud.act = function actTallyHud(ctx, el, action, ev) {
  if (ev.type !== 'click' || action !== 'tally-open' || !ctx.wm) return;
  if (ctx.wm.isOpen('tally')) ctx.refresh('tally'); else ctx.wm.open('tally');
};
