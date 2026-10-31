// ════════════════════════════════════════════════════════════════════════
// src/session/page-away.js — ONE CHARACTER, WHEN THE PAGE GOES AWAY AND COMES BACK.
//
// AccountSession.setPageHidden says when (hidden past SESSION_CONFIG.awayAfterMs; a glance at another tab is nothing). Away: no
// re-read and no pushed frames for a screen nobody sees (the hunt runs on the server regardless; only a pending leave's close
// is still asked: character-session.js _armHuntPoll). Back: the channel again and ONE catch-up, whose answer REPLACES what the
// screen holds (CLAUDE.md §6): a hunter's settle (a start point for the viewed one's live view: its ease is live-link.js's), an
// unviewed hunter's plain read; anyone else's is the one the channel's join asks (character-session.js _onChannel).
// Old-laptop player 10-31: 64 calls and 1.45 MB in 2 minutes hidden. Timing only: nothing here is read as owned or spent.
// ════════════════════════════════════════════════════════════════════════

/** @param {object} cs  the CharacterSession  @param {boolean} away */
export function pageAway(cs, away) {
  if (cs._closed || cs._away === away) return;
  cs._away = away;
  if (away) {
    cs._poll.stop();
    cs._armHuntPoll();
    if (cs._retry) { cs._clearTimer(cs._retry); cs._retry = null; }
    cs._dropChannel();
    return;
  }
  const joined = cs.connect();
  if (cs._huntOpen()) { if (cs._viewed) cs.hello(); else cs.load(); cs._armHuntPoll(); } else if (!joined) cs.hello();
}
