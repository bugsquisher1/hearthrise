// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/havora/works.js — THE HAVORA WINDOW'S WORKS TAB (HIDDEN until lane/c-town-works lands).
//
// The seam, so that lane touches no other file in this window: the window reads WORKS_TAB to decide whether the tab shows, and draws
// worksHtml() into it. lane/c-town-works sets `shown` and replaces ONLY this file's body.
// ════════════════════════════════════════════════════════════════════════

/** The tab as the Havora window lists it. */
export const WORKS_TAB = Object.freeze({ id: 'works', label: 'Works', shown: false });

/** The tab's contents, from what the server said. Nothing while hidden. */
export function worksHtml() {
  return '';
}
