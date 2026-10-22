// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/death.js — THE DEATH POPUP (Tyler 2026-10-19).
//
// A centred modal (the `death` row) that death-popup.js opens when the
// character dies: where, what killed the hero, what happened in its last
// seconds (when the hunt was watched), the XP dying cost and what a Blessing
// kept, back in town.
//   Hunt summary   closes it and opens the hunt summary (windows/hunt-summary.js)
//   OK             closes it
// Closing it any way records the dismissal (death-popup.js followDeaths). Every
// line is the server's death row; built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { text, cls } from '../../render/paint.js?v=0.2.31';
import { deathPopupOf, deathWords } from '../death-popup.js?v=0.2.31';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.31';
import { deathLogOf } from '../../session/character-sections.js?v=0.2.31';

const LINES = Object.freeze(['killed', 'what', 'lost', 'saved', 'town']);

/** The skeleton (built once). */
export function renderDeath() {
  return '<div class="hdeath">'
    + '<p class="hs-note hdeath-none">No death to show.</p>'
    + '<section class="hdeath-card"><h3 class="hdeath-title"></h3>'
    + LINES.map((k) => '<p class="hdeath-line hdeath-' + k + '"></p>').join('')
    + '<div class="hsum-actions hdeath-actions">'
    + '<button type="button" class="hh-tool" data-hs-act="death-summary">Hunt summary</button>'
    + '<button type="button" class="hh-tool is-primary" data-hs-act="death-ok">OK</button></div>'
    + '</section></div>';
}

/* The death on screen: the one the popup is for, else (opened by its key) the newest on record. */
function shownOf(cs) {
  const d = deathPopupOf(cs);
  if (d) return d;
  const log = deathLogOf(cs);
  const h = huntOf(cs);
  return log && log[0] ? { session: log[0].session || (h ? h.sessionId : ''), row: log[0] } : null;
}

renderDeath.patch = function patchDeath(body, ctx) {
  const root = body.querySelector('.hdeath');
  const d = shownOf(ctx.character);
  cls(root, 'is-empty', !d);
  if (!d) return;
  const w = deathWords(ctx.character, d);
  text(root.querySelector('.hdeath-title'), w.title);
  for (const k of LINES) {
    const p = root.querySelector('.hdeath-' + k);
    text(p, w[k]);
    cls(p, 'is-on', !!w[k]);
  }
};

renderDeath.act = function actDeath(ctx, body, action, ev) {
  if (ev.type !== 'click' || (action !== 'death-ok' && action !== 'death-summary')) return false;
  ctx.wm.close('death');
  if (action === 'death-summary') ctx.show('hunt-summary');
  return true;
};
