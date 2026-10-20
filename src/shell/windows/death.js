// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/death.js — THE DEATH POPUP (Tyler 2026-10-19 build card).
//
// A centred modal (the `death` row) that death-popup.js opens when the
// character dies: where, what killed it and the killing blow, the last seconds
// of damage and healing, the XP lost and what a Blessing saved, back in town.
//   Hunt summary   closes it and opens the hunt summary (windows/hunt-summary.js)
//   OK             closes it
// Closing it any way records the dismissal (death-popup.js followDeaths). It
// shows the newest death row the server sent; built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { deathLogOf } from '../../session/character-sections.js?v=0.2.17';
import { rows, text, cls, element } from '../../render/paint.js?v=0.2.17';
import { deathWords } from '../death-popup.js?v=0.2.17';

/** The skeleton (built once). */
export function renderDeath() {
  return '<div class="hdeath">'
    + '<p class="hs-note hdeath-none">No deaths on record.</p>'
    + '<section class="hdeath-card">'
    + '<h3 class="hdeath-title"></h3><p class="hdeath-killed"></p>'
    + '<h4 class="hw-ledger-head hdeath-h-recent">The last seconds</h4><ol class="hdeath-recent"></ol>'
    + '<p class="hdeath-lost"></p><p class="hdeath-saved"></p><p class="hdeath-town"></p>'
    + '<div class="hsum-actions hdeath-actions">'
    + '<button type="button" class="hh-tool" data-hs-act="death-summary">Hunt summary</button>'
    + '<button type="button" class="hh-tool is-primary" data-hs-act="death-ok">OK</button></div>'
    + '</section></div>';
}

renderDeath.patch = function patchDeath(body, ctx) {
  const root = body.querySelector('.hdeath');
  const log = deathLogOf(ctx.character);
  const d = log && log[0];
  cls(root, 'is-empty', !d);
  if (!d) return;
  const w = deathWords(d);
  text(root.querySelector('.hdeath-title'), w.title);
  text(root.querySelector('.hdeath-killed'), w.killed);
  cls(root.querySelector('.hdeath-h-recent'), 'is-on', w.recent.length > 0);
  rows(root.querySelector('.hdeath-recent'), w.recent.map((r, i) => Object.assign({ i }, r)), {
    key: (r) => String(r.i),
    build: () => element(ctx.doc, '<li><span class="hdeath-what"></span><span class="hdeath-when"></span></li>'),
    patch: (li, r) => {
      cls(li, 'is-heal', r.kind === 'heal');
      text(li.querySelector('.hdeath-what'), r.text);
      text(li.querySelector('.hdeath-when'), r.when);
    },
  });
  text(root.querySelector('.hdeath-lost'), w.lost);
  text(root.querySelector('.hdeath-saved'), w.saved);
  text(root.querySelector('.hdeath-town'), w.town);
};

renderDeath.act = function actDeath(ctx, body, action, ev) {
  if (ev.type !== 'click' || (action !== 'death-ok' && action !== 'death-summary')) return false;
  ctx.wm.close('death');
  if (action === 'death-summary') ctx.show('hunt-summary');
  return true;
};
