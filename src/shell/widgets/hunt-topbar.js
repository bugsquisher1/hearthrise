// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/hunt-topbar.js — THE HUNT'S TOP BAR (parity TB-01, TB-02).
//
// Hunt details (shows the analyzer panel), the session clock from the
// analyzer's server session_ms, and Leave hunt — an INTENT (hr_hunt_leave),
// the button off from the press until the server has answered and the
// character was re-read. "Ready in" and the "»" buttons of the reference are
// NOT built (TB-03, TB-04: purpose unknown, Tyler 10-17).
// ════════════════════════════════════════════════════════════════════════
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.5';
import { huntOf, analyzerOf } from '../../session/hunt-sections.js?v=0.2.5';
import { text, prop, attr } from '../../render/paint.js?v=0.2.5';
import { clock } from '../../render/format.js?v=0.2.5';
import { takeFresh } from '../../hunt-view/summary-recorder.js?v=0.2.5';

/** The skeleton (built once). */
export function renderHuntTopbar() {
  return '<div class="ht-bar" role="group" aria-label="Hunt">'
    + '<b class="ht-ground"></b><span class="ht-clock" title="Time in this hunt"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="details">Hunt details</button>'
    + '<button type="button" class="hh-tool" data-hs-act="summary">Summary</button>'
    + '<button type="button" class="hh-tool is-leave" data-hs-act="leave">Leave hunt</button>'
    + '<span class="hh-intent-msg" role="status" aria-live="polite"></span></div>';
}

renderHuntTopbar.patch = function patchHuntTopbar(el, ctx) {
  if (takeFresh(ctx.character)) queueMicrotask(() => ctx.wm.open('hunt-summary'));
  const h = huntOf(ctx.character);
  const a = analyzerOf(ctx.character);
  const ground = h && h.huntId && HUNT_INDEX[h.huntId];
  text(el.querySelector('.ht-ground'), ground ? ground.name : h ? 'Hunting' : '');
  const since = ctx.character.receivedAt;
  const live = a && !a.ended && Number.isFinite(since) ? Math.max(0, ctx.now() - since) : 0;
  text(el.querySelector('.ht-clock'), a && a.sessionMs !== null ? clock(a.sessionMs + live) : '');
  const leave = el.querySelector('.is-leave');
  prop(leave, 'disabled', !h || h.ended || leave.hasAttribute('data-pending'));
  /* A hunt that is over (the hero is back in town) keeps only the way back to its summary (Tyler 10-19):
     no Leave hunt, no Hunt details, no clock. Follows the server's hunt section, replaced each envelope. */
  const over = !h || h.ended;
  prop(leave, 'hidden', over && !leave.hasAttribute('data-pending'));
  prop(el.querySelector('[data-hs-act="details"]'), 'hidden', over);
  prop(el.querySelector('.ht-clock'), 'hidden', over);
};

renderHuntTopbar.act = async function actHuntTopbar(ctx, el, action, ev, btn) {
  if (ev.type !== 'click') return;
  if (action === 'summary') { ctx.show('hunt-summary'); return; }
  if (action === 'details') { ctx.show('analyzer'); return; }
  if (action !== 'leave' || btn.hasAttribute('data-pending')) return;
  attr(btn, 'data-pending', true);
  renderHuntTopbar.patch(el, ctx);
  const r = await ctx.character.leaveHunt();
  attr(btn, 'data-pending', null);
  text(el.querySelector('.hh-intent-msg'), r.ok ? '' : 'The hunt did not end. Try again in a moment.');
  renderHuntTopbar.patch(el, ctx);
};
