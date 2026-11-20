// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-after-pane.js — THE HUNT PAGE'S ONE CONTROL: "WHEN THE HUNT ENDS".
//
// Tyler 2026-11-15: "an itinerary of sorts where a player picks a hunt and picks what they want to do when the hunt
// finishes." One select under Before you go, and one line under it that says what the picked choice means (what a bench
// still has to make, what the yard costs and for how long, why a hero would wait instead). The choices and the picked one
// are the server's (src/shell/hunt-after.js afterChoices); a change sends ONE hr_hunt_after_set and the answer's re-read
// repaints it. Each hero has its own, in a party too. While a hunt runs the control is off and shows that hunt's own plan:
// it was fixed when the hunt started.
// This module draws and sends; it holds no state.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, prop, element } from '../../render/paint.js?v=0.2.142';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.142';
import { t } from '../../render/player-text.js?v=0.2.142';
import { afterChoices, afterPick, thenWords } from '../hunt-after.js?v=0.2.142';
import { setHuntAfter } from '../../session/hunt-after-intents.js?v=0.2.142';

export function afterHtml() {
  return '<section class="hw-after" aria-label="' + esc(t('away.when_ends')) + '"><h4 class="hw-hd-h">' + esc(t('away.when_ends')) + '</h4>'
    + '<select class="hh-select hw-after-pick" data-hs-act="after" aria-label="' + esc(t('away.when_ends')) + '"></select>'
    + '<p class="hw-after-note"></p></section>';
}

/** `v.off`: a press is in flight. `v.now`: a hunt is running (its plan is fixed). */
export function patchAfter(det, ctx, v) {
  const sec = det.querySelector('.hw-after');
  if (!sec) return;
  const c = afterChoices(ctx.character);
  /* a server older than the itinerary sends no section: no control, nothing to press */
  prop(sec, 'hidden', !c);
  if (!c) return;
  const pick = sec.querySelector('.hw-after-pick');
  rows(pick, c.options, {
    key: (o) => o.value,
    build: (o) => element(ctx.doc, '<option value="' + esc(o.value) + '"></option>'),
    patch: (el, o) => text(el, o.label),
  });
  if (pick.value !== c.picked) pick.value = c.picked;
  prop(pick, 'disabled', !!v.off || !!v.now);
  text(sec.querySelector('.hw-after-note'), v.now ? [thenWords(ctx.character), t('away.after_hunting')].filter(Boolean).join(' ') : c.note);
}

/** The control's change: the choice the data lists, sent as it is. `send(fn)` runs it as the window's one intent. */
export function actAfter(ctx, action, ev, el, send) {
  if (action !== 'after') return false;
  if (ev.type !== 'change') return true;
  const p = afterPick(el.value);
  if (p) send(() => setHuntAfter(ctx.account, ctx.character, p.choice, p.skill));
  return true;
}
