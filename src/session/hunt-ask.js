// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-ask.js — A HUNTER'S ASK, AND THE FLOOR'S ANSWER WITHOUT THE CHARACTER.
//
// A hunter's ask to the engine names its slot and the version its record holds WHOLE (`have`): a selector, never a value.
// Under the settle floor (hunt-settle.js: the hunt was settled less than 15 s ago) the engine used to rebuild the whole
// character for every ask, 43 ms and 75 KB for a client that already held it (measured 2026-11-10). When the server's row
// is at exactly `have`, it now answers the live start point, the clock and that version, marked hunt_slim. At any other
// version, or with no `have`, it answers the whole character as before: a client is never left on an old version.
// The browser never says one thing while the server says another (CLAUDE.md §6): a slim answer changes no number on
// screen, it only confirms the record's version and restarts the look-ahead.
// ════════════════════════════════════════════════════════════════════════

/** The ask's body: the slot, and for a hunter the version held whole. Nothing else may ride it (tests/client-intent-surface.mjs IS-2). */
export function askBody(slot, huntOpen, wholeAt) { return huntOpen && Number.isSafeInteger(wholeAt) && wholeAt >= 0 ? { slot, have: wholeAt } : { slot }; }

/** Is this answer the floor's, without the character, at exactly the version held whole? */
export function slimFloor(body, wholeAt) {
  return !!body && body.hunt_slim === true && body.accrued !== true && !!body.hunt_live && !body.state && body.version === wholeAt;
}

/** Play a slim floor answer as a full one is played: the start point with the record's own hunt, the clock, the re-read armed.
    @param {object} cs  the CharacterSession */
export function takeSlim(cs, body) {
  cs.receivedAt = cs._now();
  cs._play(Object.assign({}, body, { hunt: cs.read('hunt') }));
  cs._emit('hello');
  cs._armHuntPoll();
  return true;
}
