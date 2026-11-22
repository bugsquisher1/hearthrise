// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-ask.js — A HUNTER'S ASK, AND THE ANSWERS THAT CARRY NO NEW CHARACTER.
//
// A hunter's ask to the engine names its slot and the version its record holds WHOLE (`have`): a selector, never a value.
// Under the settle floor (hunt-settle.js: the hunt was settled less than 15 s ago) the engine used to rebuild the whole
// character for every ask, 43 ms and 75 KB for a client that already held it (measured 2026-11-10). When the server's row
// is at exactly `have`, it now answers the live start point, the clock and that version, marked hunt_slim. At any other
// version, or with no `have`, it answers the whole character as before: a client is never left on an old version.
//
// THE CONFIRM (lane/c-settle-flush, 30-plan L12). The viewed hunt's poll while its prediction runs says `confirm`: the server
// runs the engine, answers the check of the world it reached (hunt_check) and saves only at the flush or at once on a death,
// a Level, an end, a pending leave or a rare drop (hunt-settle.js flushDue). Every other ask (a start point, the catch-up a
// settle_first refusal runs, a view switch) leaves `confirm` off, so it saves now. A confirm's answer carries the SAVED
// character (whole when its version moved, else slim): nothing of the unsaved window reaches a number on screen.
// The browser never says one thing while the server says another (CLAUDE.md §6): a slim answer changes no number on
// screen, it only confirms the record's version and restarts the look-ahead or judges the prediction.
// ════════════════════════════════════════════════════════════════════════

/** The ask's body: the slot, for a hunter the version held whole, and `confirm` for the viewed poll of a running prediction.
    Nothing else may ride it (tests/client-intent-surface.mjs IS-2). */
export function askBody(slot, huntOpen, wholeAt, confirm) {
  const b = huntOpen && Number.isSafeInteger(wholeAt) && wholeAt >= 0 ? { slot, have: wholeAt } : { slot };
  return huntOpen && confirm === true ? { ...b, confirm: true } : b;
}

/** Is this answer the floor's, without the character, at exactly the version held whole? */
export function slimFloor(body, wholeAt) {
  return !!body && body.hunt_slim === true && body.accrued !== true && !!body.hunt_live && !body.state && body.version === wholeAt;
}

/** Is this an unsaved confirm's answer (hunt-settle.js confirmed): its check, with the saved character whole or at the version held? */
export function confirmedAnswer(body, wholeAt) {
  return !!body && body.reason === 'confirmed' && body.accrued !== true && !!body.hunt_check
    && (!!body.state || (body.hunt_slim === true && body.version === wholeAt));
}

/** Play a slim answer (the floor's, or a confirm's) as a full one is played: its start point or check with the record's own hunt,
    the clock, the re-read armed. A confirm that carries the character whole is applied as any answer.
    @param {object} cs  the CharacterSession */
export function takeSlim(cs, body) {
  if (body.state) return cs._take(body, 'hello');
  cs.receivedAt = cs._now();
  cs._play(Object.assign({}, body, { hunt: cs.read('hunt') }));
  cs._emit('hello');
  cs._armHuntPoll();
  return true;
}
