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
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.140';
import { roomOfHunt } from '../../data/boss-halls.js?v=0.2.140';
import { huntOf, huntTierOf, analyzerOf, sessionClockMs, serverNowOf } from '../../session/hunt-sections.js?v=0.2.140';
import { DEFAULT_TIER, TIER_NAME } from '../../data/hunt-tiers.js?v=0.2.140';
import { text, prop, attr } from '../../render/paint.js?v=0.2.140';
import { clock, whole } from '../../render/format.js?v=0.2.140';
import { track } from '../../net/observability.js?v=0.2.140';
import { refusalText } from '../intent-words.js?v=0.2.140';
import { pointerFor, actCoach, placeCoach } from '../launcher.js?v=0.2.140';
import { connection } from '../../net/connection.js?v=0.2.140';
import { t } from '../../render/player-text.js?v=0.2.140';
import { trainingNowOf } from '../training-now.js?v=0.2.140';
import { patchTowerBar } from './tower-bar.js?v=0.2.140';
import { scalePlaying } from '../windows/scale-pane.js?v=0.2.140';

/* The pending leave's line, per CharacterSession.leaveCountdown phase (null: the press is still out). */
const LEAVING = Object.freeze({ asked: 'hud.leaving', now: 'hud.leaving_now', late: 'hud.leaving_late' });
/* NEVER A SILENT WAIT (phone playtest 2026-10-31: 20-33 s on "Leaving…" on bad signal): past a moment with no countdown
   the line says what it is waiting for, and says so when the connection is gone. */
const WAIT_WORDS_MS = 4000;
const LEAVE_WAIT = Object.freeze({ lost: 'hud.leaving_lost', slow: 'hud.leaving_slow' });
const LEAVE_SINCE = new WeakMap();   // the bar -> when its pending leave was first drawn (display only)
function leavingLine(cd, waitedMs, state) {
  if (cd && cd.phase === 'counting') return t('hud.leaving_in', { s: cd.s });
  if (state === 'lost') return t(LEAVE_WAIT.lost);
  if (cd && cd.phase === 'late') return t(LEAVING.late);
  return t(waitedMs >= WAIT_WORDS_MS ? LEAVE_WAIT.slow : LEAVING[cd ? cd.phase : 'asked'] || LEAVING.asked);
}

/** The skeleton (built once). */
export function renderHuntTopbar() {
  return '<div class="ht-bar" role="group" aria-label="' + t('hud.top_aria') + '">'
    /* A TRAINING SESSION (../training-now.js; lane/a-training-display) says what it does and where ("Training Melee", and on a wide bar
       "at the Training Yard"), its time left and the hour's fee, every figure the server's; Hunt details reads Details and Leave hunt
       Stop training. */
    + '<b class="ht-ground"><span class="ht-name"></span><span class="ht-wide ht-at"></span></b><span class="ht-clock" title="' + t('hud.top_clock') + '"></span>'
    + '<span class="ht-wide ht-fee" hidden></span>'
    /* THE BURNING TOWER: the floor standing and its time left (./tower-bar.js), quiet off the Tower */
    + '<span class="ht-tower" role="timer" hidden><b class="ht-floor"></b><span class="ht-floor-left"></span></span>'
    /* The phone's bar has the width beside the Party panel only: "Details" and "Leave" there (hunt.css .ht-wide). */
    + '<button type="button" class="hh-tool" data-hs-act="details" aria-label="' + t('hud.top_details_aria') + '"><span class="ht-wide ht-hunt-word">' + t('hud.top_hunt_word') + ' </span><span class="ht-det-word">' + t('hud.top_details_word') + '</span></button>'
    + '<button type="button" class="hh-tool" data-hs-act="summary">' + t('hud.top_summary') + '</button>'
    + '<span class="ht-leaving" role="timer" hidden></span>'
    + '<button type="button" class="hh-tool is-leave" data-hs-act="leave" aria-label="' + t('hud.top_leave_aria') + '"><span class="ht-leave-hunt">' + t('hud.top_leave_word') + '<span class="ht-wide"> ' + t('hud.top_leave_wide') + '</span></span>'
    + '<span class="ht-leave-train" hidden>' + t('training.bar_stop') + '<span class="ht-wide"> ' + t('training.bar_stop_wide') + '</span></span></button>'
    + '<span class="hh-intent-msg" role="status" aria-live="polite"></span></div>'
    /* The phone's one line under the bar while a leave counts down (hunt.css): what the wait is for. */
    + '<p class="ht-why" hidden>' + t('hud.leave_why') + '</p>';
}

renderHuntTopbar.patch = function patchHuntTopbar(el, ctx) {
  /* (A freshly ended hunt opens its summary from the shell, src/shell/shell.js followSummary: this bar leaves town
     with the hunt.) */
  const h = huntOf(ctx.character);
  const a = analyzerOf(ctx.character);
  const ground = h && h.huntId && HUNT_INDEX[h.huntId];
  /* Over, the hero stands in town: the plaque names the hunt as the LAST one, never as where the hero is (core-loop
     play 2026-10-30: Corliss in Havora read "Wickstead · Summary"). */
  const gname = ground ? ground.name : h ? t('hud.hunting') : '';
  /* The harder tier this hunt froze, in the same plain word as the picker (Normal says nothing: it is the ground as it stands),
     and a scaled hunt's Level as the server proved it (scale-pane.js scalePlaying): "Mill Cellar (Scaled: Level 9)". */
  const tiers = h && !h.ended ? huntTierOf(ctx.character) : null;
  const marks = [tiers && tiers.playing && tiers.playing !== DEFAULT_TIER ? TIER_NAME[tiers.playing] : '',
    h && !h.ended && h.huntId ? scalePlaying(ctx.character, h.huntId) : ''].filter(Boolean);
  const hard = marks.length ? ' (' + marks.join(', ') + ')' : '';
  const now = serverNowOf(ctx.character);
  const train = trainingNowOf(ctx.character, now);
  text(el.querySelector('.ht-name'), train ? train.doing : h && h.ended && ground ? t('hud.last_hunt', { ground: gname }) : gname + hard);
  text(el.querySelector('.ht-at'), train ? ' ' + train.at : '');
  const ms = sessionClockMs(a, now);
  const left = !!train && train.leftMs !== null;
  const clk = el.querySelector('.ht-clock');
  text(clk, left ? t('training.bar_left', { time: clock(train.leftMs) }) : ms === null ? '' : clock(ms));
  attr(clk, 'title', left ? t('training.bar_left_title') : t('hud.top_clock'));
  const fee = el.querySelector('.ht-fee');
  text(fee, train && train.feeH !== null ? t('training.bar_fee', { gold: whole(train.feeH) }) : '');
  prop(fee, 'hidden', !(train && train.feeH !== null));
  prop(el.querySelector('.ht-hunt-word'), 'hidden', !!train);
  text(el.querySelector('.ht-det-word'), t(train ? 'training.bar_details' : 'hud.top_details_word'));
  patchTowerBar(el.querySelector('.ht-tower'), ctx.character, h);
  const leave = el.querySelector('.is-leave');
  prop(leave.querySelector('.ht-leave-hunt'), 'hidden', !!train);
  prop(leave.querySelector('.ht-leave-train'), 'hidden', !train);
  attr(leave, 'aria-label', train ? t('training.bar_stop') + ' ' + t('training.bar_stop_wide') : t('hud.top_leave_aria'));
  /* LEAVING (the leave pends until the server's leave_at, 2026-10-31-live-horizon.sql): from the press
     until the hunt is over the button is off, and the line beside it says how long is left, counted
     to the SERVER's leave_at on the server's clock (CharacterSession.leaveCountdown), never a device
     guess. The leave's own answer starts it; a reload reads the same leave_at from the envelope. */
  const over = !h || h.ended;
  const asked = leave.hasAttribute('data-pending');
  const cd = over ? null : ctx.character.leaveCountdown();
  const leaving = asked || cd !== null;
  const line = el.querySelector('.ht-leaving');
  /* The wait is timed from the last moment the line had a countdown to show. */
  if (!leaving || over) LEAVE_SINCE.delete(el);
  else if (!LEAVE_SINCE.has(el) || (cd && cd.phase === 'counting')) LEAVE_SINCE.set(el, ctx.now());
  text(line, leaving && !over ? leavingLine(cd, ctx.now() - LEAVE_SINCE.get(el), connection.state()) : '');
  prop(line, 'hidden', !leaving || over);
  prop(el.querySelector('.ht-why'), 'hidden', over || !cd || cd.phase !== 'counting');
  attr(leave, 'data-leaving', leaving);
  prop(leave, 'disabled', over || leaving);
  /* A hunt that is over (the hero is back in town) keeps only the way back to its summary (Tyler 10-19):
     no Leave hunt, no Hunt details, no clock. Follows the server's hunt section, replaced each envelope. */
  prop(leave, 'hidden', over && !leave.hasAttribute('data-pending'));
  const details = el.querySelector('[data-hs-act="details"]');
  attr(details, 'aria-label', t(train ? 'training.bar_details' : 'hud.top_details_aria'));
  prop(details, 'hidden', over);
  attr(details, 'aria-pressed', String(analyzerOpen(ctx)));
  prop(el.querySelector('.ht-clock'), 'hidden', over);
  /* The tutorial card hangs UNDER this bar while a hunt is open (the launcher's would cover Leave hunt). */
  /* Nothing while the leave runs: "Cash in, leave the hunt" popped up during its countdown (the panel 2026-10-31). */
  const html = leaving && !over ? '' : pointerFor(ctx, !over);
  /* ...nor over a boss room's fight (a call or a hall): the card hung across his boss bar (played 2026-11-05). */
  placeCoach(el, roomOfHunt(h && h.huntId) && !over ? '' : html);
};

/** Hunt details is pressed while the analyzer shows open: shown, and not folded to its title. */
function analyzerOpen(ctx) {
  return !!ctx.hud && ctx.hud.isShown('analyzer') && !ctx.hud.layoutOf('analyzer').folded;
}

renderHuntTopbar.act = async function actHuntTopbar(ctx, el, action, ev, btn) {
  if (actCoach(ctx, el, action, ev)) return;
  if (ev.type !== 'click') return;
  if (action === 'summary') { ctx.show('hunt-summary'); return; }
  /* A TOGGLE (QA phone playtest 10-24: one press showed the analyzer over the bar for good): shows it, or hides it.
     A folded analyzer (it starts so below --hud-fold-below) opens on the press: hiding its title would read as nothing happening. */
  if (action === 'details') {
    const hud = ctx.hud;
    if (analyzerOpen(ctx)) { hud.setVisible('analyzer', false); return; }
    if (!hud.isShown('analyzer')) hud.setVisible('analyzer', true);
    if (hud.layoutOf('analyzer').folded) hud.setFolded('analyzer', false);
    return;
  }
  if (action !== 'leave' || btn.hasAttribute('data-pending') || btn.hasAttribute('data-leaving')) return;
  track('leave_hunt_clicked');
  attr(btn, 'data-pending', true);
  renderHuntTopbar.patch(el, ctx);
  const r = await ctx.character.leaveHunt();
  attr(btn, 'data-pending', null);
  text(el.querySelector('.hh-intent-msg'), r.ok ? '' : t('hud.leave_failed', { why: refusalText(r) }));
  renderHuntTopbar.patch(el, ctx);
};
