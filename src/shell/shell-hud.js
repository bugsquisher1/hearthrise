// ════════════════════════════════════════════════════════════════════════
// src/shell/shell-hud.js — ONE CHARACTER'S HUD LAYOUT, WIRED TO THE GAME AND THE SCREEN.
//
// The facts src/shell/hud.js createHud reads, for the shell (src/shell/shell.js) of one character: which hunt
// widgets belong on screen (huntUp), the size class, the residue store, and the two facts a row's default fold
// follows (hud.js FOLD_RULES): the hero has no party (`alone`) and the screen is narrower than the fold width
// (`narrow`, tokens.css --hud-fold-below). Display only: gates and spends nothing.
// ════════════════════════════════════════════════════════════════════════
import { HUD_WIDGETS } from '../data/hud-widgets.js?v=0.2.128';
import { createHud, residueStore } from './hud.js?v=0.2.128';
import { huntOf } from '../session/hunt-sections.js?v=0.2.128';
import { summaryDone } from '../hunt-view/summary-recorder.js?v=0.2.128';
import { heroIsAlone } from './widgets/party-panel.js?v=0.2.128';

/**
 * @param {object} o
 * @param {Window} o.host
 * @param {object} o.opts       the shell's options (character, inHunt)
 * @param {object} o.wm         the window manager (is the hunt summary open)
 * @param {MediaQueryList} o.phoneMq   the phone size class
 */
export function createShellHud({ host, opts, wm, phoneMq }) {
  /* THE HUNT'S WIDGETS LEAVE TOWN WITH IT (designer walk 2026-10-25 #5: the summary, "Not in a party", the hunt bar's
     Summary, the analyzer's "Hunt ended" and a toast, five overlays on return): the party panel and the analyzer show
     while a hunt runs and the server has not said it ended; the hunt bar, which keeps only the way back to the summary
     once the hunt is over (Tyler 10-19), leaves with the summary: when the player closes it (summaryDone), so the
     summary opens by itself (shell.js followSummary) as the one notice and then the town is clear. */
  const huntUp = (id) => {
    if (!opts.inHunt || !opts.inHunt()) return false;
    const h = huntOf(opts.character);
    if (!h || !h.ended) return true;
    /* ...and none while that summary is open: the bar would hold only a Summary press for the window already on
       screen (first-hour playtest 10-29 #10: on a phone, its ground's name given way to the sheet, an empty box). */
    return id === 'hunt-topbar' && !summaryDone(opts.character, h.sessionId) && !wm.isOpen('hunt-summary');
  };
  return createHud({
    widgets: HUD_WIDGETS,
    sizeClass: () => (phoneMq.matches ? 'phone' : 'desktop'),
    store: residueStore(opts.character),
    inHunt: huntUp,
    alone: () => heroIsAlone(opts.character),
    /* the desktop's default folds below the fold width (tokens.css --hud-fold-below); the phone keeps its own */
    narrow: () => host.innerWidth < (parseFloat(host.getComputedStyle(host.document.documentElement).getPropertyValue('--hud-fold-below')) || 0),
  });
}
