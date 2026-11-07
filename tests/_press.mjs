// ════════════════════════════════════════════════════════════════════════
// tests/_press.mjs — A PAGE RUNNER PRESSES A CONTROL AGAIN ONLY ONCE ITS LAST PRESS IS ANSWERED.
//
// src/shell/press-ack.js marks a pressed control aria-busy from its first ask until every ask the press holds has settled,
// and swallows a press on a busy control. A press holds the asks its own answer starts (the Town Crier's re-quote after a
// cry, a window's re-read after a gift), so the answer's words can show while the control is still busy: a runner that
// presses again on those words alone loses the press on a slow machine (main run 42253408437, chat-social CW-CRIER + CW-3).
//
//   answered(page, selector, ms = 8000)   resolves true once the control is on the page and not aria-busy, false at ms
//
// Not a guard: tests/chat-social.mjs and tests/town-shows-world.mjs import it.
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════

/** True once the control `selector` names is on the page and its last press is answered (no aria-busy); false after `ms`. */
export function answered(page, selector, ms = 8000) {
  return page.waitForFunction((sel) => { const b = document.querySelector(sel); return !!b && !b.hasAttribute('aria-busy'); }, selector, { timeout: ms })
    .then(() => true, () => false);
}
