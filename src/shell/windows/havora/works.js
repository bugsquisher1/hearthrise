// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/havora/works.js — THE HAVORA WINDOW'S WORKS TAB (HIDDEN until lane/c-town-works lands).
//
// The seam, so that lane touches no other file in this window. ./index.js:
//   lists the tab and builds its pane only while WORKS_TAB.shown;
//   draws worksHtml() into the pane once per opening;
//   calls patchWorks(pane, ctx) on every patch while the tab is on show;
//   offers every action to actWorks first (true: it was the Works');
//   keeps a line for this tab in the window's foot (.hv-count[data-of="works"]), so what the day leaves is never cut off at the window's foot: patchWorks writes it.
// lane/c-town-works sets `shown` and replaces these bodies. Opening the window on this tab is the shell's: wm.openTab('havora', 'works').
// ════════════════════════════════════════════════════════════════════════

/** The tab as the Havora window lists it. */
export const WORKS_TAB = Object.freeze({ id: 'works', label: 'Works', shown: false });

/** The tab's contents, built once per opening. Nothing while hidden. */
export function worksHtml() {
  return '';
}

/** Patch the pane in place, from what the server said. Nothing while hidden. */
export function patchWorks(pane, ctx) { // eslint-disable-line no-unused-vars
}

/** One press in the window: true when it was the Works'. */
export function actWorks(ctx, body, action, ev, t) { // eslint-disable-line no-unused-vars
  return false;
}
