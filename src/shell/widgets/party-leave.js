// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/party-leave.js — "LEAVE IF ANYONE LEAVES THE HUNT OR DIES",
// ON THE PARTY BOARD'S OWN ROW.
//
// Tyler 2026-10-22: every hero has ONE box, default on and kept per hero on the
// server (player_state.party_leave_together). When any other member's party hunt
// ends, a ticked hero is paid up to that moment and comes home too. The box sits
// on the viewer's OWN row only (src/shell/widgets/party-panel.js composes it);
// other rows show nothing of theirs. It shows the SERVER's value
// (party-sections.js partyMembershipOf `leaveTogether`), never the press: a tick
// repaints the server's value at once, the box goes off while the ONE intent is
// in flight (party-intents.js setLeaveTogether), and the re-read envelope replaces
// it; a refusal reads in words (refusal-words.js) and changes nothing.
// ════════════════════════════════════════════════════════════════════════
import { PARTY_COPY } from '../../data/party.js?v=0.2.40';
import { setLeaveTogether } from '../../session/party-intents.js?v=0.2.40';
import { runIntent } from '../intent-words.js?v=0.2.40';
import { text, attr, prop } from '../../render/paint.js?v=0.2.40';

/** The box inside a member row (built once with the row; shown on the viewer's own row only). */
export function togetherHtml() {
  return '<label class="hp-together" hidden><input type="checkbox" data-hs-act="together"><span class="hp-together-text"></span></label>';
}

/**
 * Patch one row's box: shown only on the viewer's own seat of a real party, checked as the server says, off while a
 * party intent is in flight. `r` the roster (party-panel.js rosterOf): `selfSeat`, `inParty`, `together`.
 */
export function patchTogether(row, m, r, pending) {
  const label = row.querySelector('.hp-together');
  const box = label.querySelector('input');
  const own = r.inParty && m.seat === r.selfSeat && typeof r.together === 'boolean';
  prop(label, 'hidden', !own);
  text(label.querySelector('.hp-together-text'), PARTY_COPY.leaveTogether);
  attr(label, 'title', PARTY_COPY.leaveTogetherTip);
  prop(box, 'checked', own && r.together === true);
  prop(box, 'disabled', !own || pending);
}

/**
 * A change on the box: ONE intent asks for the other value; its first repaint (runIntent) puts the server's value
 * back, off while in flight, and the re-read envelope replaces it.
 * Answers true when `action` was the box's.
 */
export function togetherAct(ctx, cs, sc, repaint, action, ev, box, r) {
  if (action !== 'together') return false;
  if (ev.type !== 'change') return true;
  const want = box.checked === true;
  if (typeof r.together !== 'boolean' || !r.inParty || want === r.together || sc.pending) return true;
  runIntent(sc, repaint, () => setLeaveTogether(ctx.account, cs, want), 'Saving…', () => '', cs);
  return true;
}
