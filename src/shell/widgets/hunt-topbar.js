// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/hunt-topbar.js — THE HUNT'S TOP BAR (parity TB-01, TB-02).
//
// Hunt details (shows or hides the analyzer panel, pressed while it shows), the session clock from the
// analyzer's server session_ms on the server's clock (sessionClockMs), and Leave hunt — an INTENT (hr_hunt_leave),
// the button off from the press until the hunt is over, and beside it, in
// gold, how long is left: "Leaving…" for the one round trip of the press,
// "Leaving in Ns" to the server's leave_at, "Leaving now…" past it while the
// close lands, and a plain "still processing" line if it is late.
// "Ready in" and the "»" buttons of the reference are NOT built (TB-03, TB-04: purpose unknown, Tyler 10-17).
// ════════════════════════════════════════════════════════════════════════
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.61';
import { huntOf, analyzerOf, sessionClockMs, serverNowOf } from '../../session/hunt-sections.js?v=0.2.61';
import { text, prop, attr } from '../../render/paint.js?v=0.2.61';
import { clock } from '../../render/format.js?v=0.2.61';
import { track } from '../../net/observability.js?v=0.2.61';
import { refusalText } from '../intent-words.js?v=0.2.61';
import { pointerFor, actCoach, placeCoach } from '../launcher.js?v=0.2.61';

/* The pending leave's line, per CharacterSession.leaveCountdown phase (null: the press is still out). */
const LEAVING = Object.freeze({ asked: 'Leaving…', now: 'Leaving now…', late: 'Still processing your leave…' });
function leavingLine(cd) {
  return cd && cd.phase === 'counting' ? 'Leaving in ' + cd.s + 's' : LEAVING[cd ? cd.phase : 'asked'] || LEAVING.asked;
}

/** The skeleton (built once). */
export function renderHuntTopbar() {
  return '<div class="ht-bar" role="group" aria-label="Hunt">'
    + '<b class="ht-ground"></b><span class="ht-clock" title="Time in this hunt"></span>'
    /* The phone's bar has the width beside the Party panel only: "Details" and "Leave" there (hunt.css .ht-wide). */
    + '<button type="button" class="hh-tool" data-hs-act="details" aria-label="Hunt details"><span class="ht-wide">Hunt </span>details</button>'
    + '<button type="button" class="hh-tool" data-hs-act="summary">Summary</button>'
    + '<span class="ht-leaving" role="timer" hidden></span>'
    + '<button type="button" class="hh-tool is-leave" data-hs-act="leave" aria-label="Leave hunt">Leave<span class="ht-wide"> hunt</span></button>'
    + '<span class="hh-intent-msg" role="status" aria-live="polite"></span></div>';
}

renderHuntTopbar.patch = function patchHuntTopbar(el, ctx) {
  /* (A freshly ended hunt opens its summary from the shell, src/shell/shell.js followSummary: this bar leaves town
     with the hunt.) */
  const h = huntOf(ctx.character);
  const a = analyzerOf(ctx.character);
  const ground = h && h.huntId && HUNT_INDEX[h.huntId];
  text(el.querySelector('.ht-ground'), ground ? ground.name : h ? 'Hunting' : '');
  const ms = sessionClockMs(a, serverNowOf(ctx.character));
  text(el.querySelector('.ht-clock'), ms === null ? '' : clock(ms));
  const leave = el.querySelector('.is-leave');
  /* LEAVING (the leave pends until the server's leave_at, 2026-10-31-live-horizon.sql): from the press
     until the hunt is over the button is off, and the line beside it says how long is left, counted
     to the SERVER's leave_at on the server's clock (CharacterSession.leaveCountdown), never a device
     guess. The leave's own answer starts it; a reload reads the same leave_at from the envelope. */
  const over = !h || h.ended;
  const asked = leave.hasAttribute('data-pending');
  const cd = over ? null : ctx.character.leaveCountdown();
  const leaving = asked || cd !== null;
  const line = el.querySelector('.ht-leaving');
  text(line, leaving && !over ? leavingLine(cd) : '');
  prop(line, 'hidden', !leaving || over);
  attr(leave, 'data-leaving', leaving);
  prop(leave, 'disabled', over || leaving);
  /* A hunt that is over (the hero is back in town) keeps only the way back to its summary (Tyler 10-19):
     no Leave hunt, no Hunt details, no clock. Follows the server's hunt section, replaced each envelope. */
  prop(leave, 'hidden', over && !leave.hasAttribute('data-pending'));
  const details = el.querySelector('[data-hs-act="details"]');
  prop(details, 'hidden', over);
  attr(details, 'aria-pressed', String(!!ctx.hud && ctx.hud.isShown('analyzer')));
  prop(el.querySelector('.ht-clock'), 'hidden', over);
  /* The tutorial card hangs UNDER this bar while a hunt is open (the launcher's would cover Leave hunt). */
  const html = pointerFor(ctx);
  placeCoach(el, html);
};

renderHuntTopbar.act = async function actHuntTopbar(ctx, el, action, ev, btn) {
  if (actCoach(ctx, el, action, ev)) return;
  if (ev.type !== 'click') return;
  if (action === 'summary') { ctx.show('hunt-summary'); return; }
  /* A TOGGLE (QA phone playtest 10-24: one press showed the analyzer over the bar for good): shows it, or hides it. */
  if (action === 'details') { ctx.hud.setVisible('analyzer', !ctx.hud.isShown('analyzer')); return; }
  if (action !== 'leave' || btn.hasAttribute('data-pending') || btn.hasAttribute('data-leaving')) return;
  track('leave_hunt_clicked');
  attr(btn, 'data-pending', true);
  renderHuntTopbar.patch(el, ctx);
  const r = await ctx.character.leaveHunt();
  attr(btn, 'data-pending', null);
  text(el.querySelector('.hh-intent-msg'), r.ok ? '' : 'The hunt did not end. ' + refusalText(r));
  renderHuntTopbar.patch(el, ctx);
};
